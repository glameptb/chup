const entryPanel = document.querySelector("#entryPanel");
const studioPanel = document.querySelector("#studioPanel");
const completePanel = document.querySelector("#completePanel");
const entryMessage = document.querySelector("#entryMessage");
const codeInput = document.querySelector("#codeInput");
const cameraState = document.querySelector("#cameraState");
const timer = document.querySelector("#timer");
let session = null;
let pollTimer = null;
let networkOrigin = location.origin;
let cameraConfig = { mode: "mock", model: "Mock Camera", mockSources: [] };
let previewIndex = 0;
let previewTimer = null;
let captureBusy = false;

const errors = {
  SESSION_NOT_FOUND: "Không tìm thấy mã khách.",
  PAYMENT_REQUIRED: "Phiên này chưa được xác nhận thanh toán.",
  CAMERA_BUSY: "Camera đang được sử dụng bởi một phiên khác.",
};

async function api(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errors[payload.error] || "Không kết nối được GLAME Local.");
  return payload;
}

function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds || 0));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function renderPhotos() {
  const photos = session.rawPhotos || [];
  const latest = photos.at(-1);
  document.querySelector("#photoCount").textContent = `${photos.length} ảnh`;
  document.querySelector("#latestPhoto").hidden = !latest;
  document.querySelector("#emptyPhoto").hidden = Boolean(latest);
  if (latest) document.querySelector("#latestPhoto").src = `${latest.src}?v=${encodeURIComponent(latest.capturedAt)}`;
  document.querySelector("#thumbs").innerHTML = photos.slice(-8).map((photo) =>
    `<img src="${photo.src}?v=${encodeURIComponent(photo.capturedAt)}" alt="${photo.name}">`
  ).join("");
}

function renderSession() {
  document.querySelector("#sessionCode").textContent = session.id;
  document.querySelector("#packageName").textContent = `${session.packageMinutes || session.packageId || 3} phút`;
  timer.textContent = formatTime(session.remainingSeconds);
  cameraState.textContent = session.status === "SHOOTING" ? "Đang chụp" : "Đã kết thúc";
  document.querySelector(".camera-state").classList.toggle("is-active", session.status === "SHOOTING");
  renderPhotos();
}

function startPreview() {
  clearInterval(previewTimer);
  const liveView = document.querySelector("#liveView");
  const placeholder = document.querySelector("#previewPlaceholder");
  if (cameraConfig.mode === "digicamcontrol" && cameraConfig.liveViewSrc) {
    const showFrame = () => {
      liveView.src = `${cameraConfig.liveViewSrc}?t=${Date.now()}`;
      liveView.hidden = false;
      placeholder.hidden = true;
    };
    showFrame();
    previewTimer = setInterval(showFrame, 350);
    return;
  }
  if (!cameraConfig.mockSources.length) {
    liveView.hidden = true;
    placeholder.hidden = false;
    placeholder.querySelector("strong").textContent = cameraConfig.model || "CANON LIVE VIEW";
    placeholder.querySelector("span").textContent = "Đang chờ camera bridge";
    return;
  }
  const showFrame = () => {
    const source = cameraConfig.mockSources[previewIndex % cameraConfig.mockSources.length];
    liveView.src = source.src;
    liveView.hidden = false;
    placeholder.hidden = true;
    previewIndex = (previewIndex + 1) % cameraConfig.mockSources.length;
  };
  showFrame();
  previewTimer = setInterval(showFrame, 850);
}

async function countdownAndCapture() {
  if (!session || session.status !== "SHOOTING" || captureBusy) return;
  captureBusy = true;
  const button = document.querySelector("#captureBtn");
  const countdown = document.querySelector("#countdown");
  button.disabled = true;
  try {
    for (const value of [3, 2, 1]) {
      countdown.textContent = value;
      countdown.hidden = false;
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    countdown.textContent = "";
    const sourceIndex = (previewIndex - 1 + cameraConfig.mockSources.length) % Math.max(1, cameraConfig.mockSources.length);
    await api("/api/camera/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id, sourceIndex }),
    });
    await refreshStatus();
  } catch (error) {
    cameraState.textContent = error.message;
  } finally {
    countdown.hidden = true;
    button.disabled = false;
    captureBusy = false;
  }
}

async function startSession(code) {
  const payload = await api("/api/camera/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  session = payload.session;
  entryPanel.hidden = true;
  completePanel.hidden = true;
  studioPanel.hidden = false;
  renderSession();
  startPreview();
  beginPolling();
}

function beginPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(refreshStatus, 1000);
  refreshStatus();
}

async function refreshStatus() {
  if (!session) return;
  try {
    const payload = await api(`/api/camera/status?session=${encodeURIComponent(session.id)}`);
    session = payload.session;
    renderSession();
    if (session.status !== "SHOOTING") showComplete();
  } catch (error) {
    cameraState.textContent = error.message;
  }
}

function drawQr(text) {
  const canvas = document.querySelector("#qrPlaceholder");
  const matrix = createQrMatrix(text);
  const context = canvas.getContext("2d");
  const quiet = 4;
  const scale = Math.floor(canvas.width / (matrix.length + quiet * 2));
  const offset = Math.floor((canvas.width - matrix.length * scale) / 2);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#111";
  matrix.forEach((row, y) => row.forEach((dark, x) => {
    if (dark) context.fillRect(offset + x * scale, offset + y * scale, scale, scale);
  }));
}

function showComplete() {
  clearInterval(pollTimer);
  clearInterval(previewTimer);
  studioPanel.hidden = true;
  completePanel.hidden = false;
  const url = `${networkOrigin}/customer.html?session=${encodeURIComponent(session.id)}&maxPhotos=${encodeURIComponent(session.frameSlots || 4)}`;
  const link = document.querySelector("#galleryLink");
  link.href = url;
  link.textContent = url;
  drawQr(url);
}

function createQrMatrix(text) {
  const version = 5, size = 37, dataCodewords = 108, ecCodewords = 26;
  const bytes = [...new TextEncoder().encode(text)];
  if (bytes.length > 106) throw new Error("Đường dẫn QR quá dài.");
  const bits = [];
  const appendBits = (value, length) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  appendBits(0b0100, 4);
  appendBits(bytes.length, 8);
  bytes.forEach((byte) => appendBits(byte, 8));
  appendBits(0, Math.min(4, dataCodewords * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((sum, bit) => (sum << 1) | bit, 0));
  for (let pad = 0xec; data.length < dataCodewords; pad = pad === 0xec ? 0x11 : 0xec) data.push(pad);
  const codewords = data.concat(reedSolomonRemainder(data, ecCodewords));
  const modules = Array.from({ length: size }, () => Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => Array(size).fill(false));
  const setModule = (x, y, dark) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    modules[y][x] = Boolean(dark);
    reserved[y][x] = true;
  };
  const drawFinder = (x, y) => {
    for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) {
      const dark = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 &&
        (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
      setModule(x + dx, y + dy, dark);
    }
  };
  drawFinder(0, 0); drawFinder(size - 7, 0); drawFinder(0, size - 7);
  for (let i = 8; i < size - 8; i++) { setModule(i, 6, i % 2 === 0); setModule(6, i, i % 2 === 0); }
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setModule(30 + dx, 30 + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  setModule(8, 4 * version + 9, true);
  for (let i = 0; i < 9; i++) if (i !== 6) { setModule(8, i, false); setModule(i, 8, false); }
  for (let i = 0; i < 8; i++) { setModule(size - 1 - i, 8, false); setModule(8, size - 1 - i, false); }
  const allBits = codewords.flatMap((byte) => Array.from({ length: 8 }, (_, index) => (byte >>> (7 - index)) & 1));
  let bitIndex = 0, upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right--;
    for (let vertical = 0; vertical < size; vertical++) {
      const y = upward ? size - 1 - vertical : vertical;
      for (let dx = 0; dx < 2; dx++) {
        const x = right - dx;
        if (reserved[y][x]) continue;
        const raw = bitIndex < allBits.length ? allBits[bitIndex++] : 0;
        modules[y][x] = Boolean(raw ^ (((x + y) & 1) === 0 ? 1 : 0));
      }
    }
    upward = !upward;
  }
  drawFormatBits(modules, reserved);
  return modules;
}

function drawFormatBits(modules, reserved) {
  const size = modules.length;
  let remainder = 8;
  for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) ? 0x537 : 0);
  const bits = ((8 << 10) | remainder) ^ 0x5412;
  const set = (x, y, index) => { modules[y][x] = Boolean((bits >>> index) & 1); reserved[y][x] = true; };
  for (let i = 0; i <= 5; i++) set(8, i, i);
  set(8, 7, 6); set(8, 8, 7); set(7, 8, 8);
  for (let i = 9; i < 15; i++) set(14 - i, 8, i);
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, i);
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, i);
}

function reedSolomonRemainder(data, degree) {
  const exp = Array(512), log = Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) { exp[i] = x; log[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];
  const multiply = (a, b) => (a && b ? exp[log[a] + log[b]] : 0);
  let divisor = [1];
  for (let i = 0; i < degree; i++) {
    const next = Array(divisor.length + 1).fill(0);
    divisor.forEach((coefficient, index) => { next[index] ^= multiply(coefficient, exp[i]); next[index + 1] ^= coefficient; });
    divisor = next;
  }
  const result = Array(degree).fill(0);
  data.forEach((byte) => {
    const factor = byte ^ result.shift(); result.push(0);
    divisor.slice(1).forEach((coefficient, index) => { result[index] ^= multiply(coefficient, factor); });
  });
  return result;
}

document.querySelector("#codeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = codeInput.value.trim();
  if (!code) return;
  entryMessage.textContent = "Đang kiểm tra phiên...";
  try {
    await startSession(code);
  } catch (error) {
    entryMessage.textContent = error.message;
  }
});

document.querySelector("#finishBtn").addEventListener("click", async () => {
  if (!session || !confirm("Kết thúc gói chụp hiện tại?")) return;
  const payload = await api("/api/camera/finish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: session.id }),
  });
  session = payload.session;
  showComplete();
});

document.querySelector("#captureBtn").addEventListener("click", countdownAndCapture);
document.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || studioPanel.hidden || event.repeat) return;
  event.preventDefault();
  countdownAndCapture();
});

document.querySelector("#newSessionBtn").addEventListener("click", () => {
  session = null;
  completePanel.hidden = true;
  studioPanel.hidden = true;
  entryPanel.hidden = false;
  timer.textContent = "00:00";
  cameraState.textContent = "Đang chờ phiên";
  codeInput.value = "";
  entryMessage.textContent = "Nhập mã trên phiếu để bắt đầu gói chụp.";
  codeInput.focus();
});

Promise.all([
  fetch("/api/network").then((response) => response.json()),
  fetch("/api/camera/config").then((response) => response.json()),
]).then(([network, config]) => {
  if (network.origin) networkOrigin = network.origin;
  cameraConfig = config;
  cameraState.textContent = `${config.model} sẵn sàng`;
}).catch(() => {});
