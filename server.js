const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { createStateStore } = require("./storage");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const dataDir = path.join(root, "data");
const stateFile = path.join(dataDir, "glame-state.json");
const incomingDir = path.join(root, "incoming-digicam");
const mockSourceDir = path.join(root, "dataset", "raw");
const canonEdsdkDir = process.env.CANON_EDSDK_DIR || path.join(root, "vendor", "canon-edsdk", "EDSDK_64", "Dll");
const canonCaptureScript = path.join(root, "tools", "canon-edsdk-capture.ps1");
const finalDir = path.join(root, "exports", "final");
const uploadedFrameDir = path.join(root, "assets", "uploaded-frames");
const sessionsDir = path.join(root, "sessions");
const backupDir = path.join(dataDir, "backups");
const securityFile = path.join(dataDir, "security.json");
const stateStore = createStateStore({ dataDir, legacyStateFile: stateFile });
const revenueAuthSessions = new Map();

function hashPin(pin, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.scryptSync(String(pin), salt, 64).toString("hex") };
}

function loadSecurity() {
  if (fs.existsSync(securityFile)) return JSON.parse(fs.readFileSync(securityFile, "utf8"));
  const value = { revenuePin: hashPin(process.env.REVENUE_PIN || "1234") };
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(securityFile, JSON.stringify(value, null, 2));
  return value;
}

let security = loadSecurity();

function verifyPin(pin) {
  const candidate = Buffer.from(hashPin(pin, security.revenuePin.salt).hash, "hex");
  const expected = Buffer.from(security.revenuePin.hash, "hex");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function requestToken(request) {
  const cookie = String(request.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith("glame_revenue="));
  return cookie ? decodeURIComponent(cookie.slice("glame_revenue=".length)) : "";
}

function revenueAuthorized(request) {
  const expiresAt = revenueAuthSessions.get(requestToken(request));
  return Boolean(expiresAt && expiresAt > Date.now());
}

function ensureState() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(stateFile)) {
    fs.writeFileSync(stateFile, JSON.stringify({ nextNumber: 1, sessions: [] }, null, 2));
  }
}

function readState() {
  return stateStore.readState();
}

function writeState(state, event, expectedRevision = null) {
  return stateStore.writeState(state, event, expectedRevision);
}

function readJsonBody(request, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > limit) reject(new Error("Request too large"));
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function readBuffer(request, limit = 50_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Request too large"));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function json(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function findSessionByCode(state, input) {
  const code = String(input || "").trim().toUpperCase();
  const digits = code.replace(/\D/g, "");
  return [...state.sessions]
    .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
    .find((session) => {
      const exactValues = [session.id, session.ticket, session.paymentCode]
        .filter(Boolean)
        .map((value) => String(value).trim().toUpperCase());
      if (exactValues.some((value) => value === code)) return true;

      const codeValues = [session.ticket, session.paymentCode]
        .filter(Boolean)
        .map((value) => String(value).replace(/\D/g, ""))
        .filter(Boolean);
      return digits && codeValues.some((value) => Number(value) === Number(digits));
    });
}

function incomingImages() {
  fs.mkdirSync(incomingDir, { recursive: true });
  return fs.readdirSync(incomingDir)
    .filter((file) => /\.(jpe?g|png|webp)$/i.test(file))
    .map((file) => {
      const stat = fs.statSync(path.join(incomingDir, file));
      return {
        name: file,
        src: `/incoming-digicam/${encodeURIComponent(file)}`,
        modifiedAt: stat.mtimeMs,
        size: stat.size,
      };
    })
    .sort((a, b) => a.modifiedAt - b.modifiedAt);
}

function collectSessionImages(session) {
  const startedAt = Date.parse(session.startedAt || session.restartedAt || session.preparedAt || 0);
  if (!startedAt) return 0;
  const existing = new Set((session.rawPhotos || []).map((photo) => photo.name));
  const destinationDir = path.join(sessionsDir, session.id, "raw");
  fs.mkdirSync(destinationDir, { recursive: true });
  session.rawPhotos ||= [];
  let added = 0;
  incomingImages()
    .filter((file) => file.modifiedAt >= startedAt - 1000 && !existing.has(file.name) && file.size > 0)
    .forEach((file) => {
      const safeName = path.basename(file.name);
      const destination = path.join(destinationDir, safeName);
      fs.copyFileSync(path.join(incomingDir, safeName), destination);
      session.rawPhotos.push({
        id: `${session.id}-raw-${file.modifiedAt}-${Math.random().toString(16).slice(2, 8)}`,
        name: safeName,
        src: `/sessions/${encodeURIComponent(session.id)}/raw/${encodeURIComponent(safeName)}`,
        source: "original",
        filterKey: "clean",
        filterLabel: "Không filter",
        filteredBeforeCustomerView: true,
        capturedAt: new Date(file.modifiedAt).toISOString(),
      });
      existing.add(safeName);
      added += 1;
    });
  session.rawCount = session.rawPhotos.length;
  return added;
}

function importRetouchedFolder(state, session, folderPath) {
  const sourceDir = path.resolve(String(folderPath || "").trim());
  if (!sourceDir || !fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    const error = new Error("RETOUCH_FOLDER_NOT_FOUND");
    error.code = "RETOUCH_FOLDER_NOT_FOUND";
    throw error;
  }

  const imageNames = fs.readdirSync(sourceDir)
    .filter((file) => /\.(jpe?g|png|webp)$/i.test(file))
    .sort((a, b) => fs.statSync(path.join(sourceDir, a)).mtimeMs - fs.statSync(path.join(sourceDir, b)).mtimeMs);

  if (!imageNames.length) {
    const error = new Error("NO_RETOUCHED_IMAGES");
    error.code = "NO_RETOUCHED_IMAGES";
    throw error;
  }

  const destinationDir = path.join(sessionsDir, session.id, "retouched");
  fs.rmSync(destinationDir, { recursive: true, force: true });
  fs.mkdirSync(destinationDir, { recursive: true });

  const imported = imageNames.map((name, index) => {
    const ext = path.extname(name).toLowerCase() || ".jpg";
    const safeName = `${String(index + 1).padStart(3, "0")}-${path.basename(name).replace(/[^\w.-]+/g, "-")}`;
    fs.copyFileSync(path.join(sourceDir, name), path.join(destinationDir, safeName));
    return {
      id: `${session.id}-retouched-${String(index + 1).padStart(2, "0")}`,
      name: safeName,
      originalName: name,
      src: `/sessions/${encodeURIComponent(session.id)}/retouched/${encodeURIComponent(safeName)}`,
      source: "magimir",
      filterKey: "magimir",
      filterLabel: "MagiMir",
      filteredBeforeCustomerView: true,
      capturedAt: new Date(fs.statSync(path.join(sourceDir, name)).mtimeMs).toISOString(),
    };
  });

  session.originalRawPhotos ||= session.rawPhotos || [];
  session.retouchedPhotos = imported;
  session.rawPhotos = imported;
  session.rawCount = imported.length;
  session.retouchedCount = imported.length;
  session.retouchExportFolder = sourceDir;
  session.retouchedAt = new Date().toISOString();
  session.status = "RETOUCH_READY";
  writeState(state, { type: "RETOUCH_IMPORTED", sessionId: session.id, payload: { count: imported.length, folderPath: sourceDir } });
  return imported.length;
}

function finalizeShootingState(state, session) {
  collectSessionImages(session);
  session.rawPhotos = session.rawPhotos.map((photo) => ({
    ...photo,
    filterKey: "clean",
    filterLabel: "Không filter",
    filteredBeforeCustomerView: true,
  }));
  session.rawCount = session.rawPhotos.length;
  session.autoFilter = {
    status: "APPLIED",
    filterKey: "clean",
    filterLabel: "Không filter",
    count: session.rawCount,
    appliedAt: new Date().toISOString(),
  };
  session.status = "RAW_READY";
  session.remainingSeconds = 0;
  session.endsAt = null;
  session.rawReadyAt = new Date().toISOString();
  session.updatedAt = session.rawReadyAt;
  return session;
}

function hydrateSessionTimers(state) {
  const now = Date.now();
  state.sessions.forEach((session) => {
    if (session.status === "SHOOTING" && session.endsAt) {
      session.remainingSeconds = Math.max(0, Math.ceil((Date.parse(session.endsAt) - now) / 1000));
    }
  });
  return state;
}

function mockImages() {
  if (!fs.existsSync(mockSourceDir)) return [];
  return fs.readdirSync(mockSourceDir)
    .filter((file) => /\.(jpe?g|png|webp)$/i.test(file))
    .sort()
    .map((file) => ({
      name: file,
      src: `/dataset/raw/${encodeURIComponent(file)}`,
    }));
}

function digiCamUrl(pathname = "/", params = {}) {
  const base = process.env.DIGICAMCONTROL_URL || "http://127.0.0.1:5513";
  const url = new URL(pathname, base);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
}

function requestDigiCam(pathname = "/", params = {}) {
  const url = digiCamUrl(pathname, params);
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 5000 }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        if (res.statusCode >= 400) return reject(new Error(`DIGICAM_HTTP_${res.statusCode}`));
        resolve({ headers: res.headers, body: Buffer.concat(chunks) });
      });
    });
    req.on("timeout", () => req.destroy(new Error("DIGICAM_TIMEOUT")));
    req.on("error", reject);
  });
}

async function digiCamAvailable() {
  try {
    await requestDigiCam("/", {});
    return true;
  } catch {
    return false;
  }
}

async function cameraConfigPayload() {
  const forcedMode = process.env.CAMERA_MODE;
  const edsdkReady = fs.existsSync(path.join(canonEdsdkDir, "EDSDK.dll")) && fs.existsSync(canonCaptureScript);
  const mode = forcedMode || (edsdkReady ? "edsdk" : "mock");
  return {
    ok: true,
    mode,
    model: process.env.CAMERA_MODEL || (mode === "edsdk" ? "Canon EDSDK Camera" : "Mock Camera"),
    edsdkReady,
    liveViewSrc: null,
    mockSources: mockImages(),
  };
}

async function triggerDigiCamCapture(session) {
  fs.mkdirSync(incomingDir, { recursive: true });
  const sequence = Number(session.rawCount || session.rawPhotos?.length || 0) + 1;
  const template = `${session.id}_${Date.now()}_${String(sequence).padStart(3, "0")}`;
  await requestDigiCam("/", { slc: "set", param1: "session.folder", param2: incomingDir });
  await requestDigiCam("/", { slc: "set", param1: "session.filenametemplate", param2: template });
  await requestDigiCam("/", { slc: "capture", param1: "", param2: "" });
  return { template };
}

function triggerMockCapture(state, session, sourceIndex) {
  const sources = mockImages();
  if (!sources.length) {
    const error = new Error("NO_MOCK_IMAGES");
    error.status = 409;
    throw error;
  }
  const requestedIndex = Number(sourceIndex);
  const index = Number.isInteger(requestedIndex)
    ? Math.abs(requestedIndex) % sources.length
    : Number(session.mockCaptureIndex || 0) % sources.length;
  const source = sources[index];
  const extension = path.extname(source.name).toLowerCase();
  const sequence = Number(session.mockCaptureIndex || 0) + 1;
  const fileName = `${session.id}_${Date.now()}_${String(sequence).padStart(3, "0")}${extension}`;
  fs.mkdirSync(incomingDir, { recursive: true });
  const destination = path.join(incomingDir, fileName);
  fs.copyFileSync(path.join(mockSourceDir, source.name), destination);
  const capturedAt = new Date();
  fs.utimesSync(destination, capturedAt, capturedAt);
  session.mockCaptureIndex = sequence;
  session.updatedAt = new Date().toISOString();
  writeState(state);
  return { name: fileName, src: `/incoming-digicam/${encodeURIComponent(fileName)}`, sourceName: source.name };
}

function ptbGalleryId(input) {
  const value = String(input || "").trim();
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/gallery\/([^/?#]+)/);
    return match ? match[1] : "";
  } catch {
    return value;
  }
}

function imageExtension(url, contentType = "") {
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".png") || contentType.includes("png")) return ".png";
  if (pathname.endsWith(".webp") || contentType.includes("webp")) return ".webp";
  return ".jpg";
}

async function importPtbGallery(state, session, galleryInput) {
  const id = ptbGalleryId(galleryInput);
  if (!id) {
    const error = new Error("INVALID_GALLERY_URL");
    error.status = 400;
    throw error;
  }
  const gallery = await fetch(`https://ptb.devappnow.com/api/gallery/${encodeURIComponent(id)}`).then((response) => {
    if (!response.ok) throw new Error(`GALLERY_${response.status}`);
    return response.json();
  });
  const captures = [...(gallery.gifImages || []), ...(gallery.resultImages || [])]
    .filter((item) => item?.url && /\.(jpe?g|png|webp)(\?|$)/i.test(item.url) && item.url.includes("/captures/"));
  if (!captures.length) {
    const error = new Error("NO_CAPTURE_IMAGES");
    error.status = 409;
    throw error;
  }
  const destinationDir = path.join(sessionsDir, session.id, "raw");
  fs.mkdirSync(destinationDir, { recursive: true });
  session.rawPhotos ||= [];
  const existing = new Set(session.rawPhotos.map((photo) => photo.sourceUrl).filter(Boolean));
  const imported = [];
  for (const item of captures) {
    if (existing.has(item.url)) continue;
    const response = await fetch(item.url);
    if (!response.ok) continue;
    const buffer = Buffer.from(await response.arrayBuffer());
    const sequence = session.rawPhotos.length + 1;
    const extension = imageExtension(item.url, response.headers.get("content-type") || "");
    const fileName = `${session.id}_ptb_${Date.now()}_${String(sequence).padStart(3, "0")}${extension}`;
    fs.writeFileSync(path.join(destinationDir, fileName), buffer);
    const capturedAt = new Date().toISOString();
    const photo = {
      id: `${session.id}-ptb-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      name: fileName,
      src: `/sessions/${encodeURIComponent(session.id)}/raw/${encodeURIComponent(fileName)}`,
      source: "ptb-gallery",
      sourceUrl: item.url,
      filterKey: "clean",
      filterLabel: "Không filter",
      filteredBeforeCustomerView: true,
      capturedAt,
    };
    session.rawPhotos.push(photo);
    imported.push(photo);
  }
  session.rawCount = session.rawPhotos.length;
  session.status = session.status === "WAITING" ? "RAW_READY" : session.status;
  session.updatedAt = new Date().toISOString();
  writeState(state, { type: "PTB_GALLERY_IMPORTED", sessionId: session.id, payload: { galleryId: id, count: imported.length } });
  return { galleryId: id, imported, rawCount: session.rawCount };
}

function triggerEdsdkCapture(state, session) {
  fs.mkdirSync(incomingDir, { recursive: true });
  const powershell = process.env.POWERSHELL || "powershell.exe";
  const result = spawnSync(powershell, [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    canonCaptureScript,
    "-OutputDir",
    incomingDir,
    "-FilePrefix",
    session.id,
    "-SdkDir",
    canonEdsdkDir,
  ], { cwd: root, encoding: "utf8", timeout: 45_000, maxBuffer: 2_000_000 });
  if (result.status !== 0) {
    const error = new Error((result.stderr || result.stdout || "CANON_CAPTURE_FAILED").trim());
    error.status = 502;
    throw error;
  }
  const line = result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) || "{}";
  const payload = JSON.parse(line);
  collectSessionImages(session);
  session.updatedAt = new Date().toISOString();
  writeState(state, { type: "CANON_EDSDK_CAPTURED", sessionId: session.id, payload });
  return payload;
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".tflite": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".pdf": "application/pdf",
  ".svg": "image/svg+xml",
};

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${host}:${port}`);
  const origin = String(request.headers.origin || "");
  const frameCorsOrigin = requestUrl.pathname === "/api/frame" && ["null", "http://127.0.0.1:4173", "http://localhost:4173"].includes(origin) ? origin : "";

  if (requestUrl.pathname === "/api/frame" && request.method === "OPTIONS") {
    if (!frameCorsOrigin) {
      response.writeHead(403);
      response.end();
      return;
    }
    response.writeHead(204, {
      "Access-Control-Allow-Origin": frameCorsOrigin,
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    response.end();
    return;
  }

  if (requestUrl.pathname === "/api/revenue/auth/status" && request.method === "GET") {
    return json(response, 200, { ok: true, authorized: revenueAuthorized(request) });
  }

  if (requestUrl.pathname === "/api/revenue/auth/login" && request.method === "POST") {
    readJsonBody(request, 10_000).then((payload) => {
      if (!verifyPin(payload.pin)) return json(response, 401, { ok: false, error: "INVALID_PIN" });
      const token = crypto.randomBytes(32).toString("hex");
      revenueAuthSessions.set(token, Date.now() + 8 * 60 * 60 * 1000);
      response.setHeader("Set-Cookie", `glame_revenue=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
      return json(response, 200, { ok: true, authorized: true });
    }).catch(() => json(response, 400, { ok: false, error: "INVALID_REQUEST" }));
    return;
  }

  if (requestUrl.pathname === "/api/revenue/auth/password" && request.method === "POST") {
    if (!revenueAuthorized(request)) return json(response, 401, { ok: false, error: "UNAUTHORIZED" });
    readJsonBody(request, 10_000).then((payload) => {
      const pin = String(payload.pin || "");
      if (!/^\d{4,8}$/.test(pin)) return json(response, 400, { ok: false, error: "PIN_FORMAT" });
      security.revenuePin = hashPin(pin);
      fs.writeFileSync(securityFile, JSON.stringify(security, null, 2));
      return json(response, 200, { ok: true });
    }).catch(() => json(response, 400, { ok: false, error: "INVALID_REQUEST" }));
    return;
  }

  if (requestUrl.pathname === "/api/revenue/export-s1a" && request.method === "GET") {
    if (!revenueAuthorized(request)) return json(response, 401, { ok: false, error: "UNAUTHORIZED" });
    try {
      const state = readState();
      const range = ["today", "7days", "month", "all", "custom"].includes(requestUrl.searchParams.get("range")) ? requestUrl.searchParams.get("range") : "month";
      const now = new Date();
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      if (range === "7days") start.setDate(start.getDate() - 6);
      if (range === "month") start.setDate(1);
      let end = null;
      if (range === "custom") {
        const from = requestUrl.searchParams.get("from");
        const to = requestUrl.searchParams.get("to");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(to || "") || from > to) return json(response, 400, { ok: false, error: "INVALID_DATE_RANGE" });
        start.setTime(new Date(`${from}T00:00:00`).getTime());
        end = new Date(`${to}T00:00:00`); end.setDate(end.getDate() + 1);
      }
      const prices = { "3": 99000, "5": 149000, "10": 249000, ...(state.packageSettings || {}) };
      const revenueDate = (session) => new Date(session.paidAt || session.completedAt || session.printedAt || session.printRequestedAt || session.finalExportedAt || session.updatedAt || session.createdAt || 0);
      const revenueStatuses = new Set(["FINAL_READY", "SENT_TO_PRINT_STAFF", "FINAL_EXPORTED", "PRINTED", "ZIP_READY", "COMPLETED"]);
      const paid = state.sessions.filter((session) => session.paymentStatus !== "REFUNDED" && (session.paymentStatus === "PAID" || revenueStatuses.has(session.status))).filter((session) => {
        const date = revenueDate(session);
        return !Number.isNaN(date.getTime()) && (range === "all" || (date >= start && (!end || date < end)));
      }).sort((a, b) => revenueDate(a) - revenueDate(b));
      const payload = {
        businessName: "HỘ KINH DOANH GLAME PHOTOBOOTH",
        businessAddress: "",
        year: now.getFullYear(),
        rows: paid.map((session) => {
          const date = revenueDate(session);
          const configured = state.packageSettings?.[session.packageId]?.price;
          const amount = Number(session.packagePrice ?? configured ?? prices[session.packageId] ?? 0);
          return { date: date.toLocaleDateString("vi-VN"), description: `Doanh thu dịch vụ chụp ảnh - ${session.ticket || session.id} - Gói ${session.packageId || ""} phút`, amount };
        }),
      };
      const exportDir = path.join(dataDir, "exports");
      fs.mkdirSync(exportDir, { recursive: true });
      const id = crypto.randomBytes(8).toString("hex");
      const inputFile = path.join(exportDir, `${id}.json`);
      const outputFile = path.join(exportDir, `${id}.xlsx`);
      fs.writeFileSync(inputFile, JSON.stringify(payload));
      const builder = path.join(root, "tools", "xlsx-export", "build-s1a.mjs");
      const result = spawnSync(process.execPath, [builder, inputFile, outputFile], { cwd: root, encoding: "utf8", timeout: 30_000, maxBuffer: 2_000_000 });
      fs.unlinkSync(inputFile);
      if (result.status !== 0 || !fs.existsSync(outputFile)) throw new Error(result.stderr || "XLSX export failed");
      const file = fs.readFileSync(outputFile);
      fs.unlinkSync(outputFile);
      response.writeHead(200, { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="S1a-HKD-GLAME-${now.toISOString().slice(0, 10)}.xlsx"`, "Content-Length": file.length, "Cache-Control": "no-store" });
      response.end(file);
    } catch (error) {
      console.error("[revenue-export]", error);
      return json(response, 500, { ok: false, error: "EXPORT_FAILED" });
    }
    return;
  }

  if (requestUrl.pathname === "/api/health" && request.method === "GET") {
    return json(response, 200, {
      ok: true,
      uptimeSeconds: Math.floor(process.uptime()),
      storage: stateStore.info(),
      activeSession: readState().sessions.find((session) => ["READY_TO_SHOOT", "SHOOTING", "PAUSED"].includes(session.status))?.id || null,
    });
  }

  if (requestUrl.pathname === "/api/network" && request.method === "GET") {
    const interfaces = os.networkInterfaces();
    const addresses = Object.values(interfaces)
      .flat()
      .filter((item) => item && item.family === "IPv4" && !item.internal)
      .map((item) => item.address);
    const lanIp = addresses.find((address) => address.startsWith("192.168.137."))
      || addresses.find((address) => address.startsWith("192.168."))
      || addresses.find((address) => address.startsWith("10."))
      || addresses[0]
      || "127.0.0.1";
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify({
      host: lanIp,
      port,
      origin: `http://${lanIp}:${port}`,
      addresses,
    }));
    return;
  }

  if (requestUrl.pathname === "/api/camera/session" && request.method === "GET") {
    try {
      const state = readState();
      const session = findSessionByCode(state, requestUrl.searchParams.get("code"));
      if (!session) return json(response, 404, { ok: false, error: "SESSION_NOT_FOUND" });
      return json(response, 200, { ok: true, session });
    } catch {
      return json(response, 500, { ok: false, error: "STATE_READ_FAILED" });
    }
  }

  if (requestUrl.pathname === "/api/camera/config" && request.method === "GET") {
    cameraConfigPayload()
      .then((payload) => json(response, 200, payload))
      .catch(() => json(response, 200, {
        ok: true,
        mode: process.env.CAMERA_MODE || "edsdk",
        model: process.env.CAMERA_MODEL || "Canon EDSDK Camera",
        edsdkReady: false,
        liveViewSrc: null,
        mockSources: mockImages(),
      }));
    return;
  }

  if (requestUrl.pathname === "/api/camera/liveview.jpg" && request.method === "GET") {
    requestDigiCam("/liveview.jpg")
      .then((result) => {
        response.writeHead(200, {
          "Content-Type": result.headers["content-type"] || "image/jpeg",
          "Cache-Control": "no-store",
        });
        response.end(result.body);
      })
      .catch(() => json(response, 503, { ok: false, error: "DIGICAM_LIVEVIEW_UNAVAILABLE" }));
    return;
  }

  if (requestUrl.pathname === "/api/camera/mock/capture" && request.method === "POST") {
    readJsonBody(request).then((payload) => {
      if ((process.env.CAMERA_MODE || "mock") !== "mock") {
        return json(response, 409, { ok: false, error: "MOCK_DISABLED" });
      }
      const state = readState();
      const session = findSessionByCode(state, payload.sessionId);
      if (!session) return json(response, 404, { ok: false, error: "SESSION_NOT_FOUND" });
      if (session.status !== "SHOOTING") return json(response, 409, { ok: false, error: "SESSION_NOT_SHOOTING" });
      return json(response, 200, {
        ok: true,
        capture: triggerMockCapture(state, session, payload.sourceIndex),
      });
    }).catch((error) => json(response, error.status || 400, { ok: false, error: error.message || "INVALID_REQUEST" }));
    return;
  }

  if (requestUrl.pathname === "/api/camera/trigger" && request.method === "POST") {
    readJsonBody(request).then(async (payload) => {
      const state = readState();
      const session = findSessionByCode(state, payload.sessionId);
      if (!session) return json(response, 404, { ok: false, error: "SESSION_NOT_FOUND" });
      if (session.status !== "SHOOTING") return json(response, 409, { ok: false, error: "SESSION_NOT_SHOOTING" });

      const config = await cameraConfigPayload();
      if (config.mode === "edsdk") {
        const capture = triggerEdsdkCapture(state, session);
        return json(response, 200, { ok: true, mode: config.mode, capture });
      }

      const capture = triggerMockCapture(state, session, payload.sourceIndex);
      return json(response, 200, { ok: true, mode: config.mode, capture });
    }).catch((error) => {
      console.error("[camera-trigger]", error);
      json(response, error.status || 502, { ok: false, error: error.message || "CAMERA_TRIGGER_FAILED" });
    });
    return;
  }

  if (requestUrl.pathname === "/api/camera/capture" && request.method === "POST") {
    readBuffer(request).then((image) => {
      const state = readState();
      const session = findSessionByCode(state, requestUrl.searchParams.get("session"));
      if (!session) return json(response, 404, { ok: false, error: "SESSION_NOT_FOUND" });
      if (session.status !== "SHOOTING") return json(response, 409, { ok: false, error: "SESSION_NOT_SHOOTING" });
      if (!image.length) return json(response, 400, { ok: false, error: "EMPTY_IMAGE" });

      const contentType = String(request.headers["content-type"] || "").split(";")[0];
      const validImage = (contentType === "image/jpeg" && image[0] === 0xff && image[1] === 0xd8)
        || (contentType === "image/png" && image.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))
        || (contentType === "image/webp" && image.subarray(0, 4).toString() === "RIFF" && image.subarray(8, 12).toString() === "WEBP");
      if (!validImage) return json(response, 415, { ok: false, error: "UNSUPPORTED_IMAGE" });
      const extension = contentType === "image/png" ? ".png" : contentType === "image/webp" ? ".webp" : ".jpg";
      session.rawPhotos ||= [];
      const sequence = session.rawPhotos.length + 1;
      const fileName = `${session.id}_${Date.now()}_${String(sequence).padStart(3, "0")}${extension}`;
      const destinationDir = path.join(sessionsDir, session.id, "raw");
      fs.mkdirSync(destinationDir, { recursive: true });
      fs.writeFileSync(path.join(destinationDir, fileName), image);
      const capturedAt = new Date().toISOString();
      session.rawPhotos.push({
        id: `${session.id}-raw-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
        name: fileName,
        src: `/sessions/${encodeURIComponent(session.id)}/raw/${encodeURIComponent(fileName)}`,
        source: "canon-edsdk-memory",
        filterKey: "clean",
        filterLabel: "Không filter",
        filteredBeforeCustomerView: true,
        capturedAt,
      });
      session.rawCount = session.rawPhotos.length;
      session.updatedAt = capturedAt;
      writeState(state, { type: "CAMERA_IMAGE_CAPTURED", sessionId: session.id, payload: { name: fileName, size: image.length } });
      return json(response, 201, { ok: true, capture: session.rawPhotos.at(-1) });
    }).catch((error) => json(response, error.message === "Request too large" ? 413 : 400, { ok: false, error: "INVALID_IMAGE" }));
    return;
  }

  if (requestUrl.pathname === "/api/customer/import-photo" && request.method === "POST") {
    readBuffer(request).then((image) => {
      const state = readState();
      const session = findSessionByCode(state, requestUrl.searchParams.get("session"));
      if (!session) return json(response, 404, { ok: false, error: "SESSION_NOT_FOUND" });
      if (session.paymentStatus !== "PAID") return json(response, 409, { ok: false, error: "PAYMENT_REQUIRED" });
      if (!image.length) return json(response, 400, { ok: false, error: "EMPTY_IMAGE" });

      const contentType = String(request.headers["content-type"] || "").split(";")[0];
      const validImage = (contentType === "image/jpeg" && image[0] === 0xff && image[1] === 0xd8)
        || (contentType === "image/png" && image.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))
        || (contentType === "image/webp" && image.subarray(0, 4).toString() === "RIFF" && image.subarray(8, 12).toString() === "WEBP");
      if (!validImage) return json(response, 415, { ok: false, error: "UNSUPPORTED_IMAGE" });

      const extension = contentType === "image/png" ? ".png" : contentType === "image/webp" ? ".webp" : ".jpg";
      const importedSource = requestUrl.searchParams.get("source") === "edited" ? "edited" : "original";
      session.rawPhotos ||= [];
      const sequence = session.rawPhotos.length + 1;
      const fileName = `${session.id}_import_${Date.now()}_${String(sequence).padStart(3, "0")}${extension}`;
      const destinationDir = path.join(sessionsDir, session.id, "raw");
      fs.mkdirSync(destinationDir, { recursive: true });
      fs.writeFileSync(path.join(destinationDir, fileName), image);
      const importedAt = new Date().toISOString();
      const capture = {
        id: `${session.id}-import-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
        name: fileName,
        src: `/sessions/${encodeURIComponent(session.id)}/raw/${encodeURIComponent(fileName)}`,
        source: importedSource,
        filterKey: "clean",
        filterLabel: importedSource === "edited" ? "Đã chỉnh" : "Gốc",
        filteredBeforeCustomerView: importedSource === "edited",
        capturedAt: importedAt,
      };
      session.rawPhotos.push(capture);
      session.rawCount = session.rawPhotos.length;
      if (["WAITING", "READY_TO_SHOOT", "SHOOTING", "PAUSED"].includes(session.status)) session.status = "RAW_READY";
      session.updatedAt = importedAt;
      writeState(state, { type: "CUSTOMER_IMAGE_IMPORTED", sessionId: session.id, payload: { name: fileName, size: image.length, source: importedSource } });
      return json(response, 201, { ok: true, capture });
    }).catch((error) => json(response, error.message === "Request too large" ? 413 : 400, { ok: false, error: "INVALID_IMAGE" }));
    return;
  }
  if (requestUrl.pathname === "/api/import/ptb-gallery" && request.method === "POST") {
    readJsonBody(request).then(async (payload) => {
      const state = readState();
      const session = findSessionByCode(state, payload.sessionId || payload.code);
      if (!session) return json(response, 404, { ok: false, error: "SESSION_NOT_FOUND" });
      const result = await importPtbGallery(state, session, payload.galleryUrl || payload.url);
      return json(response, 200, { ok: true, session, ...result });
    }).catch((error) => {
      console.error("[ptb-import]", error);
      json(response, error.status || 502, { ok: false, error: error.message || "PTB_IMPORT_FAILED" });
    });
    return;
  }

  if (requestUrl.pathname === "/api/camera/start" && request.method === "POST") {
    readJsonBody(request).then((payload) => {
      const state = readState();
      const session = findSessionByCode(state, payload.code || payload.sessionId);
      if (!session) return json(response, 404, { ok: false, error: "SESSION_NOT_FOUND" });
      if (session.paymentStatus !== "PAID") return json(response, 409, { ok: false, error: "PAYMENT_REQUIRED" });
      if (session.status === "SHOOTING" && session.captureSource === "GLAME_CAMERA_BRIDGE") {
        return json(response, 200, { ok: true, session });
      }
      const otherActive = state.sessions.find((item) => item.id !== session.id && ["SHOOTING", "PAUSED"].includes(item.status));
      if (otherActive) return json(response, 409, { ok: false, error: "CAMERA_BUSY", activeSession: otherActive.id });

      const minutes = Math.max(1, Number(session.packageMinutes || session.packageId || 3));
      const now = Date.now();
      session.status = "SHOOTING";
      session.startedAt = new Date(now).toISOString();
      session.endsAt = new Date(now + minutes * 60_000).toISOString();
      session.remainingSeconds = minutes * 60;
      session.rawPhotos = [];
      session.rawCount = 0;
      session.captureSource = "GLAME_CAMERA_BRIDGE";
      session.updatedAt = session.startedAt;
      writeState(state);
      return json(response, 200, { ok: true, session });
    }).catch(() => json(response, 400, { ok: false, error: "INVALID_REQUEST" }));
    return;
  }

  if (requestUrl.pathname === "/api/camera/status" && request.method === "GET") {
    try {
      const state = readState();
      const session = findSessionByCode(state, requestUrl.searchParams.get("session"));
      if (!session) return json(response, 404, { ok: false, error: "SESSION_NOT_FOUND" });

      let changed = false;
      if (session.status === "SHOOTING") {
        if (collectSessionImages(session) > 0) changed = true;
        session.remainingSeconds = Math.max(0, Math.ceil((Date.parse(session.endsAt) - Date.now()) / 1000));
        if (session.remainingSeconds === 0) {
          finalizeShootingState(state, session);
          changed = true;
        }
      }
      if (changed) writeState(state);
      return json(response, 200, { ok: true, session });
    } catch {
      return json(response, 500, { ok: false, error: "STATUS_FAILED" });
    }
  }

  if (requestUrl.pathname === "/api/camera/finish" && request.method === "POST") {
    readJsonBody(request).then((payload) => {
      const state = readState();
      const session = findSessionByCode(state, payload.sessionId);
      if (!session) return json(response, 404, { ok: false, error: "SESSION_NOT_FOUND" });
      finalizeShootingState(state, session);
      writeState(state, { type: "SHOOTING_FINISHED", sessionId: session.id, payload: { rawCount: session.rawCount, source: "manual" } });
      return json(response, 200, { ok: true, session, rawCount: session.rawCount });
    }).catch(() => json(response, 400, { ok: false, error: "INVALID_REQUEST" }));
    return;
  }

  if (requestUrl.pathname === "/api/retouch/import-folder" && request.method === "POST") {
    readJsonBody(request, 20_000).then((payload) => {
      const state = readState();
      const session = findSessionByCode(state, payload.sessionId);
      if (!session) return json(response, 404, { ok: false, error: "SESSION_NOT_FOUND" });
      const count = importRetouchedFolder(state, session, payload.folderPath);
      return json(response, 200, { ok: true, session, count });
    }).catch((error) => {
      if (error?.code === "RETOUCH_FOLDER_NOT_FOUND") return json(response, 400, { ok: false, error: "Không tìm thấy folder MagiMir export." });
      if (error?.code === "NO_RETOUCHED_IMAGES") return json(response, 400, { ok: false, error: "Folder MagiMir chưa có ảnh JPG/PNG/WebP." });
      return json(response, 400, { ok: false, error: "Không import được folder ảnh đã chỉnh." });
    });
    return;
  }

  if (requestUrl.pathname === "/api/state") {
    if (request.method === "GET") {
      const state = hydrateSessionTimers(readState());
      state._revision = stateStore.info().revision;
      return json(response, 200, state);
    }

    if (request.method === "POST") {
      readJsonBody(request).then((state) => {
        if (!Array.isArray(state.sessions)) return json(response, 400, { ok: false, error: "INVALID_STATE" });
        const expectedRevision = Number.isFinite(Number(state._revision)) ? Number(state._revision) : null;
        const result = writeState(state, { type: "STATE_UPDATED", payload: { sessionCount: state.sessions.length } }, expectedRevision);
        return json(response, 200, { ok: true, revision: Number(result.revision) });
      }).catch((error) => {
        if (error?.code === "REVISION_CONFLICT") {
          return json(response, 409, { ok: false, error: "REVISION_CONFLICT", revision: error.currentRevision });
        }
        return json(response, 400, { ok: false, error: "INVALID_STATE" });
      });
      return;
    }
  }

  if (requestUrl.pathname === "/api/incoming") {
    const imageFiles = incomingImages();
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify({ dir: incomingDir, files: imageFiles }));
    return;
  }

  if (requestUrl.pathname === "/api/frame" && request.method === "POST") {
    let body = "";
    let tooLarge = false;
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 120_000_000) {
        tooLarge = true;
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        if (tooLarge) throw new Error("Frame image too large");
        const payload = JSON.parse(body || "{}");
        const name = String(payload.name || "frame.png").replace(/[^\w.-]+/g, "-").slice(0, 80);
        const image = String(payload.image || "");
        const match = image.match(/^data:image\/(png|webp|jpeg);base64,(.+)$/);
        if (!match) throw new Error("Invalid frame image");
        const ext = match[1] === "jpeg" ? "jpg" : match[1];
        fs.mkdirSync(uploadedFrameDir, { recursive: true });
        const id = `frame-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        const fileName = `${id}-${name.replace(/\.[^.]+$/, "")}.${ext}`;
        const filePath = path.join(uploadedFrameDir, fileName);
        fs.writeFileSync(filePath, Buffer.from(match[2], "base64"));
        const headers = {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        };
        if (frameCorsOrigin) headers["Access-Control-Allow-Origin"] = frameCorsOrigin;
        response.writeHead(200, headers);
        response.end(JSON.stringify({
          ok: true,
          id,
          name: name.replace(/\.[^.]+$/, ""),
          src: `/assets/uploaded-frames/${encodeURIComponent(fileName)}`,
        }));
      } catch {
        const headers = { "Content-Type": "application/json; charset=utf-8" };
        if (frameCorsOrigin) headers["Access-Control-Allow-Origin"] = frameCorsOrigin;
        response.writeHead(400, headers);
        response.end(JSON.stringify({ ok: false }));
      }
    });
    return;
  }

  if (requestUrl.pathname === "/api/final" && request.method === "POST") {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 80_000_000) request.destroy();
    });
    request.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        const sessionId = String(payload.sessionId || "").replace(/[^a-z0-9_-]/gi, "");
        const finalIndex = Math.max(1, Math.min(99, Number(payload.finalIndex || 1)));
        const image = String(payload.image || "");
        const match = image.match(/^data:image\/png;base64,(.+)$/);
        const pdfMatch = String(payload.pdf || "").match(/^data:application\/pdf;base64,(.+)$/);
        if (!sessionId || !match) throw new Error("Invalid final image");

        fs.mkdirSync(finalDir, { recursive: true });
        const fileName = `${sessionId}_final_${String(finalIndex).padStart(2, "0")}.png`;
        const filePath = path.join(finalDir, fileName);
        fs.writeFileSync(filePath, Buffer.from(match[1], "base64"));
        const pdfFileName = `${sessionId}_print_${String(finalIndex).padStart(2, "0")}.pdf`;
        const pdfFilePath = path.join(finalDir, pdfFileName);
        if (pdfMatch) fs.writeFileSync(pdfFilePath, Buffer.from(pdfMatch[1], "base64"));

        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        response.end(JSON.stringify({
          ok: true,
          fileName,
          url: `/exports/final/${encodeURIComponent(fileName)}`,
          localPath: filePath,
          pdfFileName: pdfMatch ? pdfFileName : null,
          pdfUrl: pdfMatch ? `/exports/final/${encodeURIComponent(pdfFileName)}` : null,
          pdfLocalPath: pdfMatch ? pdfFilePath : null,
        }));
      } catch {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: false }));
      }
    });
    return;
  }

  const requestPath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const filePath = path.normalize(path.join(root, decodeURIComponent(requestPath)));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": types[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(data);
  });
});

server.listen(port, host, () => {
  console.log(`Glame Photobooth running at http://${host}:${port}/`);
  console.log(`Open on this computer: http://127.0.0.1:${port}/`);
});

function runScheduledBackup() {
  try {
    const backupFile = stateStore.backup(backupDir);
    const files = fs.readdirSync(backupDir)
      .filter((file) => /^glame-.*\.sqlite$/i.test(file))
      .map((file) => ({ file, mtime: fs.statSync(path.join(backupDir, file)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    files.slice(120).forEach(({ file }) => fs.unlinkSync(path.join(backupDir, file)));
    const dailyDir = path.join(backupDir, "daily-5-years");
    fs.mkdirSync(dailyDir, { recursive: true });
    const dailyFile = path.join(dailyDir, `glame-${new Date().toISOString().slice(0, 10)}.sqlite`);
    if (!fs.existsSync(dailyFile)) fs.copyFileSync(backupFile, dailyFile);
    const dailyFiles = fs.readdirSync(dailyDir)
      .filter((file) => /^glame-\d{4}-\d{2}-\d{2}\.sqlite$/i.test(file))
      .map((file) => ({ file, mtime: fs.statSync(path.join(dailyDir, file)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    dailyFiles.slice(1825).forEach(({ file }) => fs.unlinkSync(path.join(dailyDir, file)));
    console.log(`[backup] ${backupFile}`);
  } catch (error) {
    console.error("[backup] failed", error);
  }
}

setTimeout(runScheduledBackup, 10_000);
setInterval(runScheduledBackup, 6 * 60 * 60 * 1000);

const shootingWatchdog = setInterval(() => {
  const state = readState();
  const now = Date.now();
  let changed = false;
  state.sessions.forEach((session) => {
    if (session.status !== "SHOOTING") return;
    if (collectSessionImages(session) > 0) changed = true;
    if (!session.endsAt) {
      const remaining = Math.max(1, Number(session.remainingSeconds || session.packageMinutes * 60 || 180));
      session.endsAt = new Date(now + remaining * 1000).toISOString();
      changed = true;
    }
    if (Date.parse(session.endsAt) <= now) {
      finalizeShootingState(state, session);
      changed = true;
    }
  });
  if (changed) writeState(state, { type: "TIMER_RECONCILED", payload: { source: "server" } });
}, 500);
shootingWatchdog.unref();

function shutdown(signal) {
  console.log(`Stopping Glame Photobooth (${signal})...`);
  server.close(() => {
    clearInterval(shootingWatchdog);
    stateStore.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
