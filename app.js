const STORAGE_KEY = "glame-local-sessions-v1";
const API_STATE_URL = "/api/state";
const API_INCOMING_URL = "/api/incoming";
const PACKAGE_SETTINGS_KEY = "glame-package-settings-v1";
const DASHBOARD_VIEW_KEY = "glame-dashboard-view";
const REVENUE_RANGE_KEY = "glame-revenue-range";
const demoRawPhotos = [
  "dataset/raw/DSC_7138.jpg",
  "dataset/raw/DSC_15675.jpg",
  "dataset/raw/DSC_14352.jpg",
  "dataset/raw/DSC_14327.jpg",
  "dataset/raw/DSC_13966.jpg",
  "dataset/raw/z7959337467124_7f493209e61b65f28f5b8d23c7e7512b.jpg",
  "dataset/raw/z7959337944837_87a47ff3d45887eea0674ec41143fba1.jpg",
  "dataset/raw/z7960318541719_6819279017c099d5aa53ccbe31ea6890.jpg",
];

const packages = {
  "3": { id: "3", name: "Gói 3 phút", minutes: 3, price: 99000, printCount: 1, frameSlots: 4, defaultFrameId: "frame1", allowedFrames: ["frame1"], frames: "Basic", autoEdit: "Không gồm chỉnh sửa tự động" },
  "5": { id: "5", name: "Gói 5 phút", minutes: 5, price: 149000, printCount: 2, frameSlots: 4, defaultFrameId: "frame1", allowedFrames: ["frame1", "frame2"], frames: "Basic + Standard", autoEdit: "Có thể yêu cầu chỉnh sửa tự động" },
  "10": { id: "10", name: "Gói 10 phút", minutes: 10, price: 249000, printCount: 3, frameSlots: 4, defaultFrameId: "frame1", allowedFrames: ["frame1", "frame2"], frames: "Tất cả frame", autoEdit: "Có tùy chọn chỉnh sửa tự động" },
};

const defaultFrameCatalog = [
  { id: "frame1", name: "ChanBaek Rainbow", src: "assets/frame1-2.png", maxPhotos: 4 },
  { id: "frame2", name: "ChanBaek Red", src: "assets/frame2-2.png", maxPhotos: 4 },
];

const statusLabels = {
  CHECKED_IN: "Đã check-in",
  PAYMENT_PENDING: "Chờ thanh toán",
  WAITING: "Đang chờ",
  CALLING: "Đang gọi",
  NO_SHOW: "Vắng mặt",
  REJOINED_QUEUE: "Vào lại hàng chờ",
  READY_TO_SHOOT: "Sẵn sàng chụp",
  SHOOTING: "Đang chụp",
  PAUSED: "Tạm dừng",
  RAW_READY: "Ảnh raw sẵn sàng",
  RETOUCH_REQUESTED: "Yêu cầu chỉnh sửa tự động",
  RETOUCH_IN_PROGRESS: "Đang chỉnh sửa tự động",
  RETOUCH_READY: "Ảnh đã chỉnh sẵn sàng",
  FINAL_EXPORTED: "Đã xuất final",
  SENT_TO_PRINT_STAFF: "Chờ nhân viên in",
  PRINTED: "Đã in",
  ZIP_READY: "ZIP sẵn sàng",
  COMPLETED: "Hoàn tất",
  CAMERA_ERROR: "Lỗi camera",
};

loadPackageSettings();
let state = loadState();
let timers = new Map();
let incomingFiles = [];
let customerPublicOrigin = window.location.origin;
let revenueRange = localStorage.getItem(REVENUE_RANGE_KEY) || "today";
let revenueUnlocked = false;
const localDateValue = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
let revenueFrom = localStorage.getItem("glame-revenue-from") || localDateValue();
let revenueTo = localStorage.getItem("glame-revenue-to") || localDateValue();

const defaultAutoFilterSetting = {
  enabled: true,
  backgroundId: "red-curtain",
  backgroundLabel: "Rem do / nau",
  filterKey: "learned",
  filterLabel: "AI learned",
};

const autoFilterBackgrounds = [
  { id: "red-curtain", label: "Rem do / nau" },
  { id: "pink-pastel", label: "Hong pastel / hoa" },
  { id: "dark-booth", label: "Nen toi" },
  { id: "green-wall", label: "Nen xanh" },
  { id: "neutral", label: "Trung tinh / khong ro" },
];

const autoFilterOptions = [
  { key: "learned", label: "AI learned" },
  { key: "magimir", label: "Magimir mem retro" },
  { key: "dream", label: "Dream soft glow" },
  { key: "blackMist", label: "Black mist" },
  { key: "film", label: "Film" },
  { key: "clean", label: "Tu nhien" },
];

function loadPackageSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(PACKAGE_SETTINGS_KEY));
    if (!stored || typeof stored !== "object") return;
    Object.entries(stored).forEach(([id, patch]) => {
      if (!packages[id]) return;
      packages[id] = {
        ...packages[id],
        price: Number(patch.price || packages[id].price),
        printCount: Math.max(1, Number(patch.printCount || packages[id].printCount || 1)),
        frameSlots: Math.max(1, Number(patch.frameSlots || packages[id].frameSlots || 4)),
        defaultFrameId: Object.prototype.hasOwnProperty.call(patch, "defaultFrameId") ? patch.defaultFrameId : packages[id].defaultFrameId,
        allowedFrames: Array.isArray(patch.allowedFrames) ? patch.allowedFrames : packages[id].allowedFrames,
        frameCatalog: Array.isArray(patch.frameCatalog) ? patch.frameCatalog : packages[id].frameCatalog,
      };
    });
  } catch {
    localStorage.removeItem(PACKAGE_SETTINGS_KEY);
  }
}

function savePackageSettings() {
  const data = {};
  Object.values(packages).forEach((pack) => {
    data[pack.id] = {
      price: pack.price,
      printCount: pack.printCount || 1,
      frameSlots: pack.frameSlots || 4,
      defaultFrameId: pack.defaultFrameId || null,
      optionalFrames: (pack.allowedFrames || []).filter((frameId) => frameId !== pack.defaultFrameId),
      allowedFrames: pack.allowedFrames || ["frame1", "frame2"],
      frameCatalog: getPackageFrameCatalog(pack),
    };
  });
  localStorage.setItem(PACKAGE_SETTINGS_KEY, JSON.stringify(data));
  if (state) {
    state.packageSettings = data;
    saveState();
  }
}

function getPackageFrameCatalog(pack) {
  const custom = Array.isArray(pack.frameCatalog) ? pack.frameCatalog : [];
  const byId = new Map(defaultFrameCatalog.concat(custom).map((frame) => [frame.id, frame]));
  return [...byId.values()];
}

function renderPackageSettings() {
  const target = document.querySelector("#packageSettingsList");
  if (!target) return;
  target.innerHTML = Object.values(packages).map((pack) => {
    const allowed = new Set(pack.allowedFrames || ["frame1", "frame2"]);
    const frameCatalog = getPackageFrameCatalog(pack);
    const defaultFrameId = pack.defaultFrameId || null;
    const selectedFrames = frameCatalog.filter((frame) => allowed.has(frame.id));
    const printCount = Math.max(1, selectedFrames.length);
    const slotCounts = [...new Set(selectedFrames.map((frame) => Number(frame.maxPhotos || 4)))];
    const slotLabel = slotCounts.length === 1 ? `${slotCounts[0]} ảnh/frame` : "Số ảnh theo từng frame";
    return `
      <article class="session-card-row package-setting-card" data-package-id="${pack.id}">
        <div>
          <strong>${pack.name}</strong>
          <span>${money.format(pack.price)}đ · ${printCount} frame / ${printCount} tấm in · ${slotLabel}</span>
          <small>Mỗi frame đã chọn tương ứng một file final và một tấm in.</small>
        </div>
        <div class="row-actions package-setting-actions">
          <label class="filter-intensity">Gia
            <input data-package-field="price" type="number" min="0" step="1000" value="${pack.price}" />
          </label>
          <label class="file-btn package-frame-upload">
            Upload frame PNG
            <input data-package-frame-upload type="file" accept="image/png,image/webp,image/jpeg" />
          </label>
          <div class="package-frame-list">
            ${frameCatalog.map((frame) => `
              <div class="package-frame-option">
                <img src="${frame.src}" alt="${frame.name}" />
                <span>${frame.name}</span>
                <label class="package-frame-control">
                  <input data-package-default-frame type="checkbox" value="${frame.id}" ${defaultFrameId === frame.id ? "checked" : ""} />
                  Đặt làm mặc định
                </label>
                <label class="package-frame-control">
                  <input data-package-frame="${frame.id}" type="checkbox" ${allowed.has(frame.id) && defaultFrameId !== frame.id ? "checked" : ""} />
                  Frame tùy chọn
                </label>
              </div>
            `).join("")}
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function savePackageSettingsFromForm() {
  document.querySelectorAll("[data-package-id]").forEach((card) => {
    const pack = packages[card.dataset.packageId];
    if (!pack) return;
    pack.price = Math.max(0, Number(card.querySelector('[data-package-field="price"]')?.value || pack.price));
    pack.defaultFrameId = card.querySelector("[data-package-default-frame]:checked")?.value || null;
    const optionalFrames = [...card.querySelectorAll("[data-package-frame]:checked")].map((input) => input.dataset.packageFrame);
    pack.allowedFrames = Array.from(new Set([...(pack.defaultFrameId ? [pack.defaultFrameId] : []), ...optionalFrames]));
    if (!pack.allowedFrames.length) pack.allowedFrames = getPackageFrameCatalog(pack).map((frame) => frame.id);
    pack.frameCatalog = getPackageFrameCatalog(pack);
    const selectedFrames = pack.frameCatalog.filter((frame) => pack.allowedFrames.includes(frame.id));
    pack.printCount = Math.max(1, selectedFrames.length);
    const primaryFrame = selectedFrames.find((frame) => frame.id === pack.defaultFrameId) || selectedFrames[0];
    pack.frameSlots = Number(primaryFrame?.maxPhotos || 4);
  });
  savePackageSettings();
  showToast("Da luu cau hinh goi chup.");
  render();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadPackageFrame(input) {
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const card = input.closest("[data-package-id]");
  const pack = packages[card?.dataset.packageId];
  if (!pack) return;
  if (!file.type.startsWith("image/")) {
    showToast("Chi upload file anh PNG/WebP/JPG.");
    return;
  }
  try {
    const image = await fileToDataUrl(file);
    const response = await fetch("/api/frame", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, image }),
    });
    if (!response.ok) throw new Error("Cannot upload frame");
    const uploaded = await response.json();
    const frame = {
      id: uploaded.id,
      name: uploaded.name || file.name.replace(/\.[^.]+$/, ""),
      src: uploaded.src,
      maxPhotos: pack.frameSlots || 4,
    };
    pack.frameCatalog = getPackageFrameCatalog(pack).concat(frame);
    pack.allowedFrames = Array.from(new Set([...(pack.allowedFrames || []), frame.id]));
    savePackageSettings();
    showToast(`Da upload frame ${frame.name}.`);
    renderPackageSettings();
  } catch {
    showToast("Upload frame chua thanh cong. Thu lai voi file nho hon.");
  }
}

let autoFilterSetting = loadAutoFilterSetting();

const money = new Intl.NumberFormat("vi-VN");
const toast = document.querySelector("#toast");

function makeId(prefix) {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored?.sessions) return stored;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return { nextNumber: 1, sessions: [] };
}

function loadAutoFilterSetting() {
  try {
    const stored = JSON.parse(localStorage.getItem("glame-auto-filter-setting"));
    if (stored?.filterKey) return { ...defaultAutoFilterSetting, ...stored };
  } catch {
    localStorage.removeItem("glame-auto-filter-setting");
  }
  if (state?.autoFilterSetting?.filterKey) {
    return { ...defaultAutoFilterSetting, ...state.autoFilterSetting };
  }
  return { ...defaultAutoFilterSetting };
}

function saveAutoFilterSetting() {
  localStorage.setItem("glame-auto-filter-setting", JSON.stringify(autoFilterSetting));
  state.autoFilterSetting = autoFilterSetting;
  saveState();
}

async function saveState() {
  state.autoFilterSetting = autoFilterSetting;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  try {
    const response = await fetch(API_STATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    if (response.status === 409) {
      await loadServerState();
      render();
      showToast("Dữ liệu vừa thay đổi ở thiết bị khác. Đã tải lại trạng thái mới nhất.");
      return false;
    }
    if (!response.ok) throw new Error("Cannot save state");
    const result = await response.json();
    state._revision = result.revision;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    showToast("Mất kết nối server. Thao tác chưa được lưu.");
    return false;
  }
}

async function loadServerState() {
  try {
    const response = await fetch(API_STATE_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("Cannot load state");
    const serverState = await response.json();
    if (Array.isArray(serverState.sessions)) {
      state = serverState;
      if (state.packageSettings && typeof state.packageSettings === "object") {
        localStorage.setItem(PACKAGE_SETTINGS_KEY, JSON.stringify(state.packageSettings));
        Object.entries(state.packageSettings).forEach(([id, patch]) => {
          if (packages[id]) packages[id] = { ...packages[id], ...patch, id };
        });
      }
      if (state.autoFilterSetting?.filterKey) {
        autoFilterSetting = { ...defaultAutoFilterSetting, ...state.autoFilterSetting };
        localStorage.setItem("glame-auto-filter-setting", JSON.stringify(autoFilterSetting));
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    saveState();
  }
}

async function loadIncomingFiles() {
  try {
    const response = await fetch(API_INCOMING_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("Cannot read incoming folder");
    const incoming = await response.json();
    incomingFiles = incoming.files || [];
  } catch {
    incomingFiles = [];
  }
}

async function loadNetworkOrigin() {
  try {
    const response = await fetch("/api/network", { cache: "no-store" });
    if (!response.ok) throw new Error("Cannot load network");
    const network = await response.json();
    if (network?.origin && ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) {
      customerPublicOrigin = network.origin;
    }
  } catch {
    customerPublicOrigin = window.location.origin;
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
}

function packageLabel(session) {
  const pack = packages[session.packageId] || packages["3"];
  return `${pack.name} - ${money.format(pack.price)}d - In ${session.printCount || pack.printCount || 1} tam`;
}

function queuePosition(sessionId) {
  const target = state.sessions.find((session) => session.id === sessionId);
  return state.sessions
    .filter((session) => ["WAITING", "REJOINED_QUEUE"].includes(session.status) && (!target?.roomId || session.roomId === target.roomId))
    .findIndex((session) => session.id === sessionId) + 1;
}

function sessionUrl(session) {
  const params = new URLSearchParams({
    session: session.id,
    maxPhotos: String(session.frameSlots || 4),
  });
  return `${customerPublicOrigin}/customer.html?${params.toString()}`;
}

function updateStatus(session, status) {
  session.status = status;
  session.updatedAt = new Date().toISOString();
  saveState();
  render();
}

function applyAutoFilterBeforeCustomerView(session) {
  if (!autoFilterSetting.enabled || !session?.rawPhotos?.length) return;
  session.autoFilter = {
    status: "APPLIED",
    backgroundId: autoFilterSetting.backgroundId,
    backgroundLabel: autoFilterSetting.backgroundLabel,
    filterKey: autoFilterSetting.filterKey,
    filterLabel: autoFilterSetting.filterLabel,
    count: session.rawPhotos.length,
    appliedAt: new Date().toISOString(),
  };
  session.rawPhotos = session.rawPhotos.map((photo) => ({
    ...photo,
    filterKey: photo.filterKey || autoFilterSetting.filterKey,
    filterLabel: photo.filterLabel || autoFilterSetting.filterLabel,
    filteredBeforeCustomerView: true,
  }));
}

function activeSession() {
  return state.sessions.find((session) => ["READY_TO_SHOOT", "SHOOTING", "PAUSED"].includes(session.status));
}

function callNext() {
  const currentCalling = state.sessions.find((session) => session.status === "CALLING");
  if (currentCalling) {
    showToast(`Đang gọi ${currentCalling.ticket}. Hãy xử lý khách này trước.`);
    return;
  }

  const next = state.sessions.find((session) => ["WAITING", "REJOINED_QUEUE"].includes(session.status));
  if (!next) {
    showToast("Không còn khách trong hàng chờ.");
    return;
  }

  next.status = "CALLING";
  next.calledAt = new Date().toISOString();
  next.holdSeconds = 180;
  saveState();
  render();
  showToast(`Đang gọi số ${next.ticket}.`);
}

function markNoShow(session) {
  session.status = "NO_SHOW";
  session.noShowAt = new Date().toISOString();
  saveState();
  render();
}

function rejoinQueue(session) {
  session.status = "REJOINED_QUEUE";
  session.rejoinedAt = new Date().toISOString();
  const sameRoomNext = state.sessions.find((item) =>
    item.id !== session.id &&
    item.roomId === session.roomId &&
    ["WAITING", "REJOINED_QUEUE"].includes(item.status)
  );
  const next = sameRoomNext || state.sessions.find((item) =>
    item.id !== session.id && ["WAITING", "REJOINED_QUEUE"].includes(item.status)
  );
  const currentIndex = state.sessions.findIndex((item) => item.id === session.id);
  if (currentIndex >= 0) state.sessions.splice(currentIndex, 1);
  if (next) {
    const nextIndex = state.sessions.findIndex((item) => item.id === next.id);
    state.sessions.splice(nextIndex + 1, 0, session);
  } else {
    state.sessions.push(session);
  }

  const alreadyCalling = state.sessions.some((item) => item.status === "CALLING");
  if (!alreadyCalling) {
    if (next) {
      next.status = "CALLING";
      next.calledAt = new Date().toISOString();
      next.holdSeconds = 180;
      showToast(`Đã gọi ${next.ticket}; ${session.ticket} được xếp ngay sau lượt này.`);
    } else {
      showToast(`${session.ticket} đang chờ lại ở vị trí hiện tại.`);
    }
  }
  saveState();
  render();
}

function confirmCashPayment(session) {
  session.packagePrice = Number(session.packagePrice ?? packages[session.packageId]?.price ?? 0);
  session.paymentStatus = "PAID";
  session.status = "WAITING";
  session.paidAt = new Date().toISOString();
  session.updatedAt = session.paidAt;
  saveState();
  render();
  showToast(`Đã xác nhận tiền mặt cho ${session.ticket}.`);
}

function startShooting(session) {
  if (activeSession() && activeSession().id !== session.id) {
    showToast("Đang có session active. Chỉ 1 session được nhận ảnh từ Incoming.");
    return;
  }

  const pack = packages[session.packageId] || packages["3"];
  session.status = "READY_TO_SHOOT";
  session.remainingSeconds = pack.minutes * 60;
  session.endsAt = null;
  session.rawCount = session.rawCount || 0;
  session.preparedAt = new Date().toISOString();
  saveState();
  render();
}

function beginShooting(session) {
  if (!["READY_TO_SHOOT", "PAUSED"].includes(session.status)) return;
  session.status = "SHOOTING";
  session.startedAt ||= new Date().toISOString();
  session.resumedAt = new Date().toISOString();
  session.endsAt = new Date(Date.now() + Math.max(1, Number(session.remainingSeconds || 1)) * 1000).toISOString();
  saveState();
  render();
  startTimer(session.id);
}

function restartShooting(session) {
  const pack = packages[session.packageId] || packages["3"];
  window.clearInterval(timers.get(session.id));
  timers.delete(session.id);
  session.status = "SHOOTING";
  session.remainingSeconds = Number(pack.minutes || session.packageMinutes || 3) * 60;
  session.startedAt = new Date().toISOString();
  session.endsAt = new Date(Date.now() + session.remainingSeconds * 1000).toISOString();
  session.restartedAt = session.startedAt;
  saveState();
  render();
  startTimer(session.id);
  showToast(`Đã tính lại ${pack.minutes || session.packageMinutes || 3} phút cho ${session.ticket}.`);
}

function startTimer(sessionId) {
  window.clearInterval(timers.get(sessionId));
  const bridgeSession = state.sessions.find((item) => item.id === sessionId);
  if (bridgeSession?.captureSource === "GLAME_CAMERA_BRIDGE") {
    const bridgeInterval = window.setInterval(async () => {
      const current = state.sessions.find((item) => item.id === sessionId);
      if (!current || current.status !== "SHOOTING") {
        window.clearInterval(bridgeInterval);
        timers.delete(sessionId);
        return;
      }
      try {
        const response = await fetch(`/api/camera/status?session=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        const index = state.sessions.findIndex((item) => item.id === sessionId);
        if (index >= 0 && payload.session) state.sessions[index] = payload.session;
        render();
      } catch {}
    }, 1000);
    timers.set(sessionId, bridgeInterval);
    return;
  }
  const interval = window.setInterval(() => {
    const session = state.sessions.find((item) => item.id === sessionId);
    if (!session || session.status !== "SHOOTING") {
      window.clearInterval(interval);
      timers.delete(sessionId);
      return;
    }
    session.remainingSeconds = session.endsAt
      ? Math.max(0, Math.ceil((Date.parse(session.endsAt) - Date.now()) / 1000))
      : Math.max(0, Number(session.remainingSeconds || 0));
    if (session.remainingSeconds === 0) {
      window.clearInterval(interval);
      timers.delete(sessionId);
      loadServerState().then(render).catch(() => {});
      return;
    }
    render();
  }, 1000);
  timers.set(sessionId, interval);
}

function ensureShootingTimers() {
  state.sessions
    .filter((session) => session.status === "SHOOTING")
    .forEach((session) => {
      if (!timers.has(session.id)) {
        startTimer(session.id);
      }
    });
}

function pauseShooting(session) {
  if (session.endsAt) {
    session.remainingSeconds = Math.max(0, Math.ceil((Date.parse(session.endsAt) - Date.now()) / 1000));
  }
  session.status = "PAUSED";
  session.endsAt = null;
  session.pauseReason = "Camera disconnect / kiểm tra digiCamControl";
  window.clearInterval(timers.get(session.id));
  saveState();
  render();
}

function resumeShooting(session) {
  session.status = "SHOOTING";
  session.resumedAt = new Date().toISOString();
  session.endsAt = new Date(Date.now() + Math.max(1, Number(session.remainingSeconds || 1)) * 1000).toISOString();
  saveState();
  render();
  startTimer(session.id);
}

const finishingSessions = new Set();

async function finishShooting(session) {
  if (!session || finishingSessions.has(session.id)) return;
  finishingSessions.add(session.id);
  window.clearInterval(timers.get(session.id));
  timers.delete(session.id);
  session.status = "FINALIZING_SHOOT";
  session.remainingSeconds = 0;
  render();
  try {
    const response = await fetch("/api/camera/finish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id }),
    });
    if (!response.ok) throw new Error("Cannot finish shooting session");
    const result = await response.json();
    await loadServerState();
    showToast(`Đã chuyển ${result.rawCount || 0} ảnh cho khách.`);
  } catch (error) {
    console.error(error);
    session.status = "SHOOTING";
    showToast("Không thể kết thúc phiên. Vui lòng bấm STOP lại.");
  } finally {
    finishingSessions.delete(session.id);
    render();
  }
}

function mockIncomingPhoto(session) {
  if (session.status !== "SHOOTING") {
    showToast("Chỉ session đang chụp mới nhận ảnh từ Incoming.");
    return;
  }
  session.rawPhotos ||= [];
  const nextIndex = session.rawPhotos.length % demoRawPhotos.length;
      session.rawPhotos.push({
        id: `${session.id}-raw-${String(session.rawPhotos.length + 1).padStart(2, "0")}`,
        name: `raw-${String(session.rawPhotos.length + 1).padStart(2, "0")}.jpg`,
        src: demoRawPhotos[nextIndex],
        source: "original",
        filterKey: "clean",
        filterLabel: "Không filter",
        filteredBeforeCustomerView: true,
        capturedAt: new Date().toISOString(),
      });
  session.rawCount = session.rawPhotos.length;
  saveState();
  render();
}

async function importIncomingPhotos(session) {
  if (session.status !== "SHOOTING") {
    showToast("Chỉ session đang chụp mới nhận ảnh từ folder digiCamControl.");
    return;
  }
  try {
    const response = await fetch(API_INCOMING_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("Cannot read incoming folder");
    const incoming = await response.json();
    const files = incoming.files || [];
    if (session.status !== "SHOOTING") return;
    session.rawPhotos ||= [];
    const existing = new Set(session.rawPhotos.map((photo) => photo.name));
    let added = 0;
    files.forEach((file) => {
      if (existing.has(file.name)) return;
      session.rawPhotos.push({
        id: makeId(`${session.id}-raw`),
        name: file.name,
        src: file.src,
        source: "original",
        filterKey: "clean",
        filterLabel: "Không filter",
        filteredBeforeCustomerView: true,
        capturedAt: new Date(file.modifiedAt || Date.now()).toISOString(),
      });
      added += 1;
    });
    session.rawCount = session.rawPhotos.length;
    saveState();
    render();
    showToast(added ? `Đã gom ${added} ảnh từ folder digiCamControl.` : "Chưa có ảnh mới trong folder digiCamControl.");
  } catch (error) {
    console.error(error);
    showToast("Không gom được ảnh. Hãy reload dashboard rồi thử lại.");
  }
}

function completeRetouch(session) {
  session.status = "RETOUCH_READY";
  session.retouchedCount = session.retouchCount || Math.min(session.rawCount || 0, 4);
  session.retouchedAt = new Date().toISOString();
  saveState();
  render();
}

function markPrinted(session) {
  session.status = "PRINTED";
  session.printedAt = new Date().toISOString();
  saveState();
  render();
}

function buildFinalZip(session) {
  if (session.status !== "PRINTED") {
    showToast("ZIP cuối chỉ tạo sau khi đã in xong.");
    return;
  }
  session.status = "ZIP_READY";
  session.zipName = `${session.id}_${session.customerName.replace(/\s+/g, "")}_FINAL.zip`;
  session.zipReadyAt = new Date().toISOString();
  saveState();
  render();
}

function completeSession(session) {
  session.status = "COMPLETED";
  session.completedAt = new Date().toISOString();
  saveState();
  render();
}

function createDemoSession() {
  const number = state.nextNumber++;
  const id = `GL-${String(number).padStart(4, "0")}`;
  const pack = packages["5"];
  state.sessions.push({
    id,
    isDemo: true,
    ticket: `A${String(number).padStart(3, "0")}`,
    customerName: "Nguyễn Minh Anh",
    contact: "0988888888",
    packageId: "5",
    packagePrice: pack.price,
    status: "WAITING",
    paymentStatus: "PAID",
    frameSlots: pack.frameSlots || 4,
    defaultFrameId: pack.defaultFrameId || null,
    allowedFrames: pack.allowedFrames || ["frame1", "frame2"],
    availableFrames: getPackageFrameCatalog(pack).filter((frame) => (pack.allowedFrames || ["frame1", "frame2"]).includes(frame.id)),
    printCount: pack.printCount || 1,
    finalJobs: [],
    rawCount: 0,
    rawPhotos: [],
    createdAt: new Date().toISOString(),
  });
  saveState();
  render();
}

function resetDemo() {
  const count = state.sessions.filter((session) => session.isDemo === true).length;
  if (!count) return showToast("Không có phiên demo được đánh dấu để xóa.");
  if (!window.confirm(`Xóa ${count} phiên demo? Dữ liệu khách thật sẽ được giữ nguyên.`)) return;
  state.sessions = state.sessions.filter((session) => session.isDemo !== true);
  saveState();
  render();
}

function formatTime(seconds = 0) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function card(session, body, actions = "") {
  return `
    <article class="session-card-row">
      <div>
        <strong>${session.ticket} · ${session.id}</strong>
        <span>${session.customerName} · ${packageLabel(session)}</span>
        <small>${statusLabels[session.status] || session.status} · Raw ${session.rawCount || 0} ảnh</small>
      </div>
      <div class="row-actions">${actions}</div>
      ${body ? `<p>${body}</p>` : ""}
    </article>
  `;
}

function renderQueue() {
  const queue = state.sessions.filter((session) => ["PAYMENT_CASH_PENDING", "WAITING", "CALLING", "NO_SHOW", "REJOINED_QUEUE"].includes(session.status));
  document.querySelector("#queueList").innerHTML = queue.length
    ? queue
        .map((session) => {
          if (session.status === "PAYMENT_CASH_PENDING") {
            return card(session, `${session.roomName || "Chưa chọn phòng"} - Chờ thu tiền mặt`, `<button class="primary-btn" data-action="confirm-cash" data-id="${session.id}" type="button">Xác nhận đã thu tiền</button>`);
          }
          if (session.status === "CALLING") {
            return card(
              session,
              `Link khách: ${sessionUrl(session)}`,
              `
                <button class="primary-btn" data-action="present" data-id="${session.id}" type="button">Khách đã có mặt</button>
                <button class="ghost-btn" data-action="customer-link" data-id="${session.id}" type="button">Link khach</button>
                <button class="ghost-btn" data-action="rejoin" data-id="${session.id}" type="button">Đưa lại vào hàng chờ</button>
              `
            );
          }
          if (session.status === "NO_SHOW") {
            return card(session, "Khách bị bỏ qua lượt, có thể đưa lại vào cuối hàng.", `<button class="ghost-btn" data-action="rejoin" data-id="${session.id}" type="button">Đưa lại vào hàng</button>`);
          }
          return card(session, `${session.roomName || "Phòng chưa đặt"} - Vị trí: ${queuePosition(session.id)} - Link khách: ${sessionUrl(session)}`, `<button class="ghost-btn" data-action="customer-link" data-id="${session.id}" type="button">Link khách</button>`);
        })
        .join("")
    : '<div class="empty-state">Chưa có khách đã thanh toán trong hàng chờ.</div>';
}

function renderActive() {
  const session = activeSession();
  document.querySelector("#activeSession").innerHTML = session
    ? `
      <article class="active-card">
        <div>
          <p class="eyebrow">Active session</p>
          <h2>${session.ticket} · ${session.id}</h2>
          <p>${session.customerName} · ${packageLabel(session)}</p>
          <strong>${formatTime(session.remainingSeconds)} còn lại</strong>
          <span>Ảnh đã gom từ Incoming: ${session.rawCount || 0}</span>
          <span>Folder digiCamControl hiện có: ${incomingFiles.length} ảnh</span>
          <small>D:\\Photobooth\\Sessions\\${session.id}\\raw</small>
          <div class="shooting-controls">
            <button class="primary-btn" data-action="start-shooting" data-id="${session.id}" type="button" ${session.status === "SHOOTING" ? "disabled" : ""}>START</button>
            <button class="ghost-btn" data-action="pause" data-id="${session.id}" type="button" ${session.status !== "SHOOTING" ? "disabled" : ""}>PAUSE</button>
            <button class="danger-btn" data-action="finish-shooting" data-id="${session.id}" type="button">STOP</button>
            <button class="ghost-btn" data-action="restart-shooting" data-id="${session.id}" type="button">RESTART</button>
          </div>
        </div>
        <div class="action-grid">
          <button class="primary-btn" data-action="import-incoming" data-id="${session.id}" type="button">Gom toàn bộ ${incomingFiles.length} ảnh từ digiCamControl</button>
          <button class="ghost-btn" data-action="customer-link" data-id="${session.id}" type="button">QR khach</button>
          <button class="ghost-btn" data-action="mock-photo" data-id="${session.id}" type="button">Chỉ thêm 1 ảnh demo</button>
        </div>
      </article>
    `
    : `<div class="empty-state">Folder digiCamControl hiện có ${incomingFiles.length} ảnh. Chưa có session active, hãy bấm “Khách đã có mặt” ở hàng chờ để bắt đầu chụp rồi mới gom ảnh.</div>`;
}

function renderRetouch() {
  const list = state.sessions.filter((session) => ["RETOUCH_REQUESTED", "RETOUCH_IN_PROGRESS"].includes(session.status));
  document.querySelector("#retouchList").innerHTML = list.length
    ? list
        .map((session) =>
          card(
            session,
            `Ảnh cần chỉnh: ${session.retouchCount || 0} · Mức: ${session.retouchLevel || "Tự nhiên"} · ${session.retouchNote || "Không có ghi chú"}`,
            session.status === "RETOUCH_REQUESTED"
              ? `<button class="primary-btn" data-action="start-retouch" data-id="${session.id}" type="button">Bắt đầu chỉnh sửa tự động</button>`
              : `<button class="primary-btn" data-action="complete-retouch" data-id="${session.id}" type="button">Đánh dấu đã chỉnh xong</button>`
          )
        )
        .join("")
    : '<div class="empty-state">Chưa có yêu cầu chỉnh sửa tự động.</div>';
}

function renderAutoFilterMonitor() {
  const target = document.querySelector("#autoFilterList");
  if (!target) return;
  const backgroundSelect = document.querySelector("#autoFilterBackgroundSelect");
  const filterSelect = document.querySelector("#autoFilterSelect");
  const enabledSelect = document.querySelector("#autoFilterEnabledSelect");
  if (backgroundSelect) {
    backgroundSelect.innerHTML = autoFilterBackgrounds.map((item) => `<option value="${item.id}">${item.label}</option>`).join("");
    backgroundSelect.value = autoFilterSetting.backgroundId;
  }
  if (filterSelect) {
    filterSelect.innerHTML = autoFilterOptions.map((item) => `<option value="${item.key}">${item.label}</option>`).join("");
    filterSelect.value = autoFilterSetting.filterKey;
  }
  if (enabledSelect) enabledSelect.value = String(Boolean(autoFilterSetting.enabled));

  const list = state.sessions.filter((session) => session.rawCount || session.rawPhotos?.length || session.autoFilter);
  target.innerHTML = list.length
    ? list
        .slice(-5)
        .reverse()
        .map((session) => {
          const filter = session.autoFilter;
          const body = filter
            ? `Auto filter: ${filter.backgroundLabel} -> ${filter.filterLabel} - ${filter.count || 0} anh - ${filter.status}`
            : `Auto filter: se tu ap dung ${autoFilterSetting.backgroundLabel} -> ${autoFilterSetting.filterLabel} truoc khi khach thay anh.`;
          return card(session, body);
        })
        .join("")
    : '<div class="empty-state">Auto filter dang bat. Anh se duoc ap filter truoc khi hien cho khach.</div>';
}

function renderPrint() {
  const list = state.sessions.filter((session) => ["SENT_TO_PRINT_STAFF", "FINAL_EXPORTED"].includes(session.status));
  document.querySelector("#printList").innerHTML = list.length
    ? list
        .map((session) =>
          card(
            session,
            `File final: D:\\Photobooth\\Sessions\\${session.id}\\final\\${session.id}_final_01.jpg`,
            `<button class="primary-btn" data-action="printed" data-id="${session.id}" type="button">Đánh dấu đã in</button>`
          )
        )
        .join("")
    : '<div class="empty-state">Chưa có file final chờ in.</div>';
}

function renderPrint() {
  const list = state.sessions.filter((session) => ["SENT_TO_PRINT_STAFF", "FINAL_EXPORTED"].includes(session.status));
  document.querySelector("#printList").innerHTML = list.length
    ? list
        .map((session) => {
          const finalPath = session.finalLocalPath || `D:\\Photobooth\\Sessions\\${session.id}\\final\\${session.finalFile || `${session.id}_final_01.png`}`;
          const printLink = session.finalUrl
            ? `<a class="ghost-btn" href="${session.finalUrl}" target="_blank" rel="noopener">Mo file in</a>`
            : `<span class="customer-note">Chua co link file that. Khach can bam xuat final lai.</span>`;
          return card(
            session,
            `File final: ${finalPath}`,
            `
              ${printLink}
              <button class="primary-btn" data-action="printed" data-id="${session.id}" type="button">Danh dau da in</button>
            `
          );
        })
        .join("")
    : '<div class="empty-state">Chua co file final cho in.</div>';
}

function renderPrint() {
  const list = state.sessions.filter((session) => ["SENT_TO_PRINT_STAFF", "FINAL_EXPORTED"].includes(session.status));
  document.querySelector("#printList").innerHTML = list.length
    ? list
        .map((session) => {
          const jobs = Array.isArray(session.finalJobs) && session.finalJobs.length
            ? session.finalJobs
            : [{
                index: 1,
                fileName: session.finalFile || `${session.id}_final_01.png`,
                url: session.finalUrl,
                localPath: session.finalLocalPath,
              }];
          const total = session.printCount || jobs.length || 1;
          const links = jobs
            .map((job) => {
              const printCode = job.printCode || `${session.ticket}-${String(job.index || 1).padStart(2, "0")}`;
              const label = `${printCode} - Mở file ${job.index || 1}/${total}`;
              return job.url
                ? `<a class="ghost-btn" href="${job.url}" target="_blank" rel="noopener">${label}</a>`
                : `<span class="customer-note">${job.localPath || job.fileName || label}</span>`;
            })
            .join("");
          return card(
            session,
            `Mã in: ${jobs.map((job) => job.printCode || `${session.ticket}-${String(job.index || 1).padStart(2, "0")}`).join(" · ")} - ${jobs.length}/${total} file`,
            `
              ${links}
              <button class="primary-btn" data-action="printed" data-id="${session.id}" type="button">Danh dau da in</button>
            `
          );
        })
        .join("")
    : '<div class="empty-state">Chua co file final cho in.</div>';
}

function renderDelivery() {
  const list = state.sessions.filter((session) => ["PRINTED", "ZIP_READY", "COMPLETED"].includes(session.status));
  document.querySelector("#deliveryList").innerHTML = list.length
    ? list
        .map((session) => {
          const actions =
            session.status === "PRINTED"
              ? `<button class="primary-btn" data-action="build-zip" data-id="${session.id}" type="button">Tạo ZIP cuối</button>`
              : session.status === "ZIP_READY"
                ? `<button class="primary-btn" data-action="complete" data-id="${session.id}" type="button">Hoàn tất phiên</button>`
                : "";
          return card(session, session.zipName ? `ZIP: ${session.zipName}` : "Sau khi in xong mới tạo ZIP cuối.", actions);
        })
        .join("")
    : '<div class="empty-state">ZIP cuối và FotoShare chỉ xử lý sau khi ảnh đã in xong.</div>';
}

function renderStats() {
  document.querySelector("#waitingCount").textContent = state.sessions.filter((session) => ["WAITING", "CALLING", "REJOINED_QUEUE"].includes(session.status)).length;
  document.querySelector("#shootingCount").textContent = state.sessions.filter((session) => ["READY_TO_SHOOT", "SHOOTING", "PAUSED"].includes(session.status)).length;
  document.querySelector("#printCount").textContent = state.sessions.filter((session) => ["SENT_TO_PRINT_STAFF", "FINAL_EXPORTED"].includes(session.status)).length;
  document.querySelector("#doneCount").textContent = state.sessions.filter((session) => ["PRINTED", "ZIP_READY", "COMPLETED"].includes(session.status)).length;
}

function sessionRevenue(session) {
  return Math.max(0, Number(session.packagePrice ?? packages[session.packageId]?.price ?? 0));
}

function paidSessionDate(session) {
  const value = session.paidAt || session.createdAt;
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function revenueStartDate(range, now = new Date()) {
  if (range === "custom") return new Date(`${revenueFrom}T00:00:00`);
  if (range === "all") return null;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === "7days") start.setDate(start.getDate() - 6);
  if (range === "month") start.setDate(1);
  return start;
}

function revenueEndDate(range) {
  if (range !== "custom") return null;
  const end = new Date(`${revenueTo}T00:00:00`);
  end.setDate(end.getDate() + 1);
  return end;
}

function revenueSessions() {
  const start = revenueStartDate(revenueRange);
  const end = revenueEndDate(revenueRange);
  return state.sessions
    .filter((session) => session.paymentStatus === "PAID")
    .filter((session) => {
      const date = paidSessionDate(session);
      return date && (!start || date >= start) && (!end || date < end);
    })
    .sort((a, b) => paidSessionDate(b) - paidSessionDate(a));
}

function revenueChartDays(sessions) {
  const now = new Date();
  const chartEnd = revenueRange === "custom" ? new Date(`${revenueTo}T23:59:59`) : now;
  const start = revenueStartDate(revenueRange, now) || (() => {
    const dates = sessions.map(paidSessionDate).filter(Boolean);
    const earliest = dates.length ? new Date(Math.min(...dates)) : new Date(now);
    earliest.setHours(0, 0, 0, 0);
    const cap = new Date(now); cap.setDate(cap.getDate() - 59); cap.setHours(0, 0, 0, 0);
    return earliest < cap ? cap : earliest;
  })();
  const days = [];
  for (const cursor = new Date(start); cursor <= chartEnd; cursor.setDate(cursor.getDate() + 1)) {
    const day = new Date(cursor);
    const next = new Date(day); next.setDate(next.getDate() + 1);
    const matches = sessions.filter((session) => { const date = paidSessionDate(session); return date >= day && date < next; });
    days.push({
      date: day,
      bank: matches.filter((session) => session.paymentMethod === "BANK_TRANSFER").reduce((sum, session) => sum + sessionRevenue(session), 0),
      cash: matches.filter((session) => session.paymentMethod === "CASH").reduce((sum, session) => sum + sessionRevenue(session), 0),
    });
  }
  return days;
}

function renderRevenueChart(sessions) {
  const days = revenueChartDays(sessions);
  const maximum = Math.max(1, ...days.map((day) => day.bank + day.cash));
  document.querySelector("#revenueChart").innerHTML = days.map((day) => {
    const bankHeight = (day.bank / maximum) * 100;
    const cashHeight = (day.cash / maximum) * 100;
    const total = day.bank + day.cash;
    return `<div class="chart-day" title="${day.date.toLocaleDateString("vi-VN")}: ${money.format(total)}đ"><div class="chart-value">${total ? money.format(total) : ""}</div><div class="chart-column"><div class="chart-segment bank-segment" style="height:${bankHeight}%"></div><div class="chart-segment cash-segment" style="height:${cashHeight}%"></div></div><span>${day.date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}</span></div>`;
  }).join("");
}

function renderRevenue() {
  const sessions = revenueSessions();
  const total = sessions.reduce((sum, session) => sum + sessionRevenue(session), 0);
  const bank = sessions.filter((session) => session.paymentMethod === "BANK_TRANSFER").reduce((sum, session) => sum + sessionRevenue(session), 0);
  const cash = sessions.filter((session) => session.paymentMethod === "CASH").reduce((sum, session) => sum + sessionRevenue(session), 0);
  const rangeLabels = { today: "Hôm nay", "7days": "7 ngày gần nhất", month: "Tháng này", all: "Toàn bộ thời gian", custom: `${revenueFrom.split("-").reverse().join("/")} - ${revenueTo.split("-").reverse().join("/")}` };
  document.querySelector("#revenueTotal").textContent = `${money.format(total)}đ`;
  document.querySelector("#revenueSessionCount").textContent = sessions.length;
  document.querySelector("#revenueAverage").textContent = `${money.format(sessions.length ? Math.round(total / sessions.length) : 0)}đ`;
  document.querySelector("#revenueBank").textContent = `${money.format(bank)}đ`;
  document.querySelector("#revenueCash").textContent = `${money.format(cash)}đ`;
  document.querySelector("#revenuePeriodLabel").textContent = rangeLabels[revenueRange];
  renderRevenueChart(sessions);
  document.querySelectorAll("[data-revenue-range]").forEach((button) => button.classList.toggle("is-active", button.dataset.revenueRange === revenueRange));
  document.querySelector("#revenueTableBody").innerHTML = sessions.map((session) => {
    const date = paidSessionDate(session);
    const method = session.paymentMethod === "CASH" ? "Tiền mặt" : "Chuyển khoản";
    return `<tr><td>${date.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" })}</td><td><strong>${session.ticket || session.id}</strong><small>${session.id}</small></td><td>${session.customerName || "Khách hàng"}</td><td>${packages[session.packageId]?.name || `Gói ${session.packageId || "-"}`}</td><td>${method}</td><td class="money-cell"><strong>${money.format(sessionRevenue(session))}đ</strong></td></tr>`;
  }).join("");
  document.querySelector("#revenueEmpty").hidden = sessions.length > 0;
  document.querySelector(".revenue-table-wrap").hidden = sessions.length === 0;
}

function showRevenueAccess(authorized) {
  revenueUnlocked = authorized;
  document.querySelector("#revenueLock").hidden = authorized;
  document.querySelector("#revenueContent").hidden = !authorized;
}

async function refreshRevenueAuth() {
  try {
    const response = await fetch("/api/revenue/auth/status", { cache: "no-store" });
    const result = await response.json();
    showRevenueAccess(Boolean(result.authorized));
  } catch {
    showRevenueAccess(false);
  }
}

async function loginRevenue(pin) {
  const response = await fetch("/api/revenue/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
  if (!response.ok) return false;
  showRevenueAccess(true);
  renderRevenue();
  return true;
}

function exportRevenueCsv() {
  const rows = [["Thời gian", "Mã lượt", "Mã phiên", "Khách hàng", "Gói", "Thanh toán", "Doanh thu"]];
  revenueSessions().forEach((session) => rows.push([
    paidSessionDate(session).toLocaleString("vi-VN"), session.ticket || "", session.id || "", session.customerName || "",
    packages[session.packageId]?.name || session.packageId || "", session.paymentMethod === "CASH" ? "Tiền mặt" : "Chuyển khoản", sessionRevenue(session),
  ]));
  const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\r\n")}`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `glame-doanh-thu-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function render() {
  renderStats();
  renderRevenue();
  renderQueue();
  renderActive();
  renderAutoFilterMonitor();
  renderRetouch();
  renderPackageSettings();
  renderPrint();
  renderDelivery();
}

function openCustomerLinkModal(session) {
  if (!session) return;
  const modal = document.querySelector("#customerLinkModal");
  const directInput = document.querySelector("#customerDirectLinkInput");
  const joinInput = document.querySelector("#customerJoinLinkInput");
  const codeLabel = document.querySelector("#customerJoinCodeLabel");
  if (!modal || !directInput || !joinInput || !codeLabel) return;
  directInput.value = sessionUrl(session);
  joinInput.value = window.location.origin + "/join.html";
  codeLabel.textContent = session.ticket + " / " + session.id;
  drawSessionQr(directInput.value, session.ticket + " - " + session.id);
  modal.hidden = false;
}

function closeCustomerLinkModal() {
  const modal = document.querySelector("#customerLinkModal");
  if (modal) modal.hidden = true;
}

function drawSessionQr(text, label) {
  const canvas = document.querySelector("#customerSessionQrCanvas");
  const codeLabel = document.querySelector("#customerSessionQrCode");
  if (codeLabel) codeLabel.textContent = label;
  if (!canvas) return;
  try {
    const matrix = createQrMatrix(text);
    const ctx = canvas.getContext("2d");
    const size = canvas.width;
    const quiet = 4;
    const modules = matrix.length + quiet * 2;
    const scale = Math.floor(size / modules);
    const offset = Math.floor((size - matrix.length * scale) / 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#151719";
    matrix.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) ctx.fillRect(offset + x * scale, offset + y * scale, scale, scale);
      });
    });
  } catch {
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#151719";
    ctx.font = "700 18px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Copy link", canvas.width / 2, canvas.height / 2);
  }
}

function drawStoreCheckinQr() {
  const canvas = document.querySelector("#storeCheckinQrCanvas");
  const link = document.querySelector("#storeCheckinLink");
  const urlLabel = document.querySelector("#storeCheckinUrl");
  if (!canvas || !link) return;
  const url = `${customerPublicOrigin}/checkin.html?new=1`;
  link.href = url;
  if (urlLabel) urlLabel.textContent = url;
  try {
    const matrix = createQrMatrix(url);
    const ctx = canvas.getContext("2d");
    const quiet = 4;
    const scale = Math.floor(canvas.width / (matrix.length + quiet * 2));
    const offset = Math.floor((canvas.width - matrix.length * scale) / 2);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#151719";
    matrix.forEach((row, y) => row.forEach((dark, x) => {
      if (dark) ctx.fillRect(offset + x * scale, offset + y * scale, scale, scale);
    }));
  } catch {}
}

async function copyCustomerDirectLink() {
  const input = document.querySelector("#customerDirectLinkInput");
  if (!input?.value) return;
  try {
    await navigator.clipboard.writeText(input.value);
    showToast("Da copy link khach.");
  } catch {
    input.select();
    document.execCommand("copy");
    showToast("Da copy link khach.");
  }
}

function createQrMatrix(text) {
  const version = 5;
  const size = 17 + version * 4;
  const dataCodewords = 108;
  const ecCodewords = 26;
  const bytes = [...new TextEncoder().encode(text)];
  if (bytes.length > 106) throw new Error("QR text too long");
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
  const setModule = (x, y, dark, reserve = true) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    modules[y][x] = Boolean(dark);
    if (reserve) reserved[y][x] = true;
  };
  const drawFinder = (x, y) => {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        const dark = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
        setModule(xx, yy, dark);
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(size - 7, 0);
  drawFinder(0, size - 7);
  for (let i = 8; i < size - 8; i++) {
    setModule(i, 6, i % 2 === 0);
    setModule(6, i, i % 2 === 0);
  }
  const drawAlignment = (cx, cy) => {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        setModule(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  };
  drawAlignment(30, 30);
  setModule(8, 4 * version + 9, true);
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      setModule(8, i, false);
      setModule(i, 8, false);
    }
  }
  for (let i = 0; i < 8; i++) {
    setModule(size - 1 - i, 8, false);
    setModule(8, size - 1 - i, false);
  }
  const allBits = codewords.flatMap((byte) => Array.from({ length: 8 }, (_, index) => (byte >>> (7 - index)) & 1));
  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right--;
    for (let vert = 0; vert < size; vert++) {
      const y = upward ? size - 1 - vert : vert;
      for (let dx = 0; dx < 2; dx++) {
        const x = right - dx;
        if (reserved[y][x]) continue;
        const rawBit = bitIndex < allBits.length ? allBits[bitIndex++] : 0;
        const masked = rawBit ^ (((x + y) & 1) === 0 ? 1 : 0);
        modules[y][x] = Boolean(masked);
      }
    }
    upward = !upward;
  }
  drawFormatBits(modules, reserved, 1, 0);
  return modules;
}

function drawFormatBits(modules, reserved, eccFormat, mask) {
  const size = modules.length;
  let data = (eccFormat << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ (((rem >>> 9) & 1) ? 0x537 : 0);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const set = (x, y, index) => {
    modules[y][x] = Boolean((bits >>> index) & 1);
    reserved[y][x] = true;
  };
  for (let i = 0; i <= 5; i++) set(8, i, i);
  set(8, 7, 6);
  set(8, 8, 7);
  set(7, 8, 8);
  for (let i = 9; i < 15; i++) set(14 - i, 8, i);
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, i);
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, i);
}

function reedSolomonRemainder(data, degree) {
  const exp = Array(512);
  const log = Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    exp[i] = x;
    log[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];
  const multiply = (a, b) => (a && b ? exp[log[a] + log[b]] : 0);
  let divisor = [1];
  for (let i = 0; i < degree; i++) {
    const next = Array(divisor.length + 1).fill(0);
    divisor.forEach((coef, index) => {
      next[index] ^= multiply(coef, exp[i]);
      next[index + 1] ^= coef;
    });
    divisor = next;
  }
  const result = Array(degree).fill(0);
  data.forEach((byte) => {
    const factor = byte ^ result.shift();
    result.push(0);
    divisor.slice(1).forEach((coef, index) => {
      result[index] ^= multiply(coef, factor);
    });
  });
  return result;
}

function handleAction(action, session) {
  if (!session && action !== "seed") return;
  if (action === "present") startShooting(session);
  if (action === "noshow") markNoShow(session);
  if (action === "rejoin") rejoinQueue(session);
  if (action === "confirm-cash") confirmCashPayment(session);
  if (action === "mock-photo") mockIncomingPhoto(session);
  if (action === "import-incoming") importIncomingPhotos(session);
  if (action === "start-shooting") beginShooting(session);
  if (action === "pause") pauseShooting(session);
  if (action === "resume") resumeShooting(session);
  if (action === "finish-shooting") finishShooting(session);
  if (action === "restart-shooting") restartShooting(session);
  if (action === "start-retouch") updateStatus(session, "RETOUCH_IN_PROGRESS");
  if (action === "complete-retouch") completeRetouch(session);
  if (action === "printed") markPrinted(session);
  if (action === "build-zip") buildFinalZip(session);
  if (action === "complete") completeSession(session);
  if (action === "customer-link") openCustomerLinkModal(session);
}

function saveAutoFilterSettingFromForm() {
  const background = autoFilterBackgrounds.find((item) => item.id === document.querySelector("#autoFilterBackgroundSelect")?.value) || autoFilterBackgrounds[0];
  const filter = autoFilterOptions.find((item) => item.key === document.querySelector("#autoFilterSelect")?.value) || autoFilterOptions[0];
  autoFilterSetting = {
    enabled: document.querySelector("#autoFilterEnabledSelect")?.value !== "false",
    backgroundId: background.id,
    backgroundLabel: background.label,
    filterKey: filter.key,
    filterLabel: filter.label,
  };
  saveAutoFilterSetting();
  showToast("Da luu setting auto filter.");
  render();
}

document.querySelector("#callNextBtn").addEventListener("click", callNext);
document.querySelector("#seedBtn").addEventListener("click", createDemoSession);
document.querySelector("#resetBtn").addEventListener("click", resetDemo);
document.querySelector("#saveAutoFilterSettingBtn")?.addEventListener("click", saveAutoFilterSettingFromForm);
document.querySelector("#savePackageSettingsBtn")?.addEventListener("click", savePackageSettingsFromForm);
document.querySelector("#closeCustomerLinkModalBtn")?.addEventListener("click", closeCustomerLinkModal);
document.querySelector("#copyCustomerDirectLinkBtn")?.addEventListener("click", copyCustomerDirectLink);
document.querySelector("#customerLinkModal")?.addEventListener("click", (event) => { if (event.target.id === "customerLinkModal") closeCustomerLinkModal(); });
document.querySelector("#toggleFilterLabBtn")?.addEventListener("click", () => {
  const frame = document.querySelector("#filterAdminFrame");
  const button = document.querySelector("#toggleFilterLabBtn");
  if (!frame || !button) return;
  const willOpen = frame.hidden;
  if (willOpen && !frame.src) frame.src = "filter-admin.html";
  frame.hidden = !willOpen;
  button.textContent = willOpen ? "An filter lab" : "Mo filter lab";
});
document.body.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const session = state.sessions.find((item) => item.id === button.dataset.id);
  handleAction(button.dataset.action, session);
});
document.body.addEventListener("change", (event) => {
  const input = event.target.closest("[data-package-frame-upload]");
  if (input) uploadPackageFrame(input);
  const defaultFrame = event.target.closest("[data-package-default-frame]");
  if (defaultFrame?.checked) {
    const card = defaultFrame.closest("[data-package-id]");
    card?.querySelectorAll("[data-package-default-frame]").forEach((input) => {
      if (input !== defaultFrame) input.checked = false;
    });
    const option = defaultFrame.closest(".package-frame-option");
    const optional = option?.querySelector("[data-package-frame]");
    if (optional) optional.checked = false;
  }
});

function setDashboardView(view) {
  const activeView = ["operations", "revenue", "management"].includes(view) ? view : "operations";
  document.body.dataset.dashboardView = activeView;
  localStorage.setItem(DASHBOARD_VIEW_KEY, activeView);
  document.querySelectorAll("[data-dashboard-view]").forEach((section) => {
    section.hidden = section.dataset.dashboardView !== activeView;
  });
  document.querySelectorAll("[data-dashboard-tab-button]").forEach((button) => {
    const selected = button.dataset.dashboardTabButton === activeView;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  if (activeView === "revenue") refreshRevenueAuth();
}

document.querySelectorAll("[data-dashboard-tab-button]").forEach((button) => {
  button.addEventListener("click", () => setDashboardView(button.dataset.dashboardTabButton));
});

document.querySelectorAll("[data-revenue-range]").forEach((button) => {
  button.addEventListener("click", () => {
    revenueRange = button.dataset.revenueRange;
    localStorage.setItem(REVENUE_RANGE_KEY, revenueRange);
    renderRevenue();
  });
});
document.querySelector("#revenueFromDate").value = revenueFrom;
document.querySelector("#revenueToDate").value = revenueTo;
document.querySelector("#applyRevenueDatesBtn").addEventListener("click", () => {
  const from = document.querySelector("#revenueFromDate").value;
  const to = document.querySelector("#revenueToDate").value;
  if (!from || !to || from > to) return showToast("Khoảng ngày không hợp lệ.");
  revenueFrom = from;
  revenueTo = to;
  revenueRange = "custom";
  localStorage.setItem("glame-revenue-from", revenueFrom);
  localStorage.setItem("glame-revenue-to", revenueTo);
  localStorage.setItem(REVENUE_RANGE_KEY, revenueRange);
  renderRevenue();
});
document.querySelector("#exportRevenueBtn").addEventListener("click", exportRevenueCsv);
document.querySelector("#exportS1aBtn").addEventListener("click", () => {
  window.location.href = `/api/revenue/export-s1a?range=${encodeURIComponent(revenueRange)}&from=${encodeURIComponent(revenueFrom)}&to=${encodeURIComponent(revenueTo)}`;
});
document.querySelector("#revenueLoginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.querySelector("#revenuePinInput");
  const success = await loginRevenue(input.value);
  document.querySelector("#revenueLoginError").textContent = success ? "" : "PIN không đúng.";
  if (success) input.value = "";
});
document.querySelector("#changeRevenuePinBtn").addEventListener("click", () => { document.querySelector("#changeRevenuePinModal").hidden = false; });
document.querySelector("#closeRevenuePinModalBtn").addEventListener("click", () => { document.querySelector("#changeRevenuePinModal").hidden = true; });
document.querySelector("#changeRevenuePinForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const pin = document.querySelector("#newRevenuePinInput").value;
  const confirmation = document.querySelector("#confirmRevenuePinInput").value;
  if (!/^\d{4,8}$/.test(pin)) return showToast("PIN phải gồm 4 đến 8 chữ số.");
  if (pin !== confirmation) return showToast("Hai lần nhập PIN chưa khớp.");
  const response = await fetch("/api/revenue/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
  if (!response.ok) return showToast("Không đổi được PIN. Vui lòng mở khóa lại.");
  document.querySelector("#changeRevenuePinModal").hidden = true;
  event.target.reset();
  showToast("Đã đổi PIN doanh thu.");
});

document.querySelectorAll(".side-nav a[href^='#']").forEach((link) => {
  link.addEventListener("click", () => {
    const section = document.querySelector(link.getAttribute("href"));
    if (section?.dataset.dashboardView) setDashboardView(section.dataset.dashboardView);
  });
});

async function bootDashboard() {
  setDashboardView(localStorage.getItem(DASHBOARD_VIEW_KEY) || "operations");
  await loadNetworkOrigin();
  drawStoreCheckinQr();
  await loadServerState();
  await loadIncomingFiles();
  ensureShootingTimers();
  render();
  window.setInterval(async () => {
    await loadServerState();
    await loadIncomingFiles();
    ensureShootingTimers();
    render();
  }, 2500);
}

bootDashboard();
