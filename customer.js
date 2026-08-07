const customerUrlParams = new URLSearchParams(window.location.search);
const CUSTOMER_ACTIVE_SESSION_KEY = "glame-active-customer-session";
const requestedCustomerSession = customerUrlParams.get("session");
const recoveredCustomerSession = localStorage.getItem(CUSTOMER_ACTIVE_SESSION_KEY);
const initialCustomerSession = requestedCustomerSession || recoveredCustomerSession || "";

const customerState = {
  sessionCode: initialCustomerSession,
  staffMode: ["1", "true"].includes(customerUrlParams.get("staff")),
  photos: [],
  favoriteIds: [],
  selectedIds: [],
  activePhotoId: null,
  activeSlotIndex: 0,
  photoAdjustments: {},
  photoFilters: {},
  copiedFilter: null,
  theme: "champagne",
  customFrame: { id: "frame1", name: "ChanBaek Rainbow", src: "assets/frame1-2.png", overlaySrc: "assets/frame1-2-overlay.png", maxPhotos: 4 },
  maxPhotos: Number(customerUrlParams.get("maxPhotos") || 4),
  rendered: false,
  currentStage: "raw",
  viewerPhotoId: null,
  printCount: 1,
  currentFinalIndex: 1,
  completedFinals: [],
  allowedFrames: ["frame1", "frame2"],
  defaultFrameId: "frame1",
};

if (customerState.sessionCode) {
  localStorage.setItem(CUSTOMER_ACTIVE_SESSION_KEY, customerState.sessionCode);
  if (!requestedCustomerSession) {
    const recoveredUrl = new URL(window.location.href);
    recoveredUrl.searchParams.set("session", customerState.sessionCode);
    history.replaceState(null, "", recoveredUrl);
  }
}

const SESSION_STORAGE_KEY = "glame-local-sessions-v1";
const API_STATE_URL = "/api/state";
const photoStatuses = ["RAW_READY", "RETOUCH_READY", "FINAL_READY", "SENT_TO_PRINT_STAFF", "FINAL_EXPORTED", "PRINTED", "ZIP_READY", "COMPLETED"];
const packageMinutes = { "3": 3, "5": 5, "10": 10 };
const packagePrintCounts = { "3": 1, "5": 2, "10": 3 };
const CUSTOMER_DRAFT_KEY = `glame-customer-draft-${customerState.sessionCode}`;

function persistCustomerDraft() {
  if (!customerState.sessionCode) return;
  const draft = {
    favoriteIds: customerState.favoriteIds,
    selectedIds: customerState.selectedIds,
    activePhotoId: customerState.activePhotoId,
    activeSlotIndex: customerState.activeSlotIndex,
    photoAdjustments: customerState.photoAdjustments,
    photoFilters: customerState.photoFilters,
    frameId: customerState.customFrame?.id || null,
    currentStage: customerState.currentStage,
    currentFinalIndex: customerState.currentFinalIndex,
  };
  localStorage.setItem(CUSTOMER_DRAFT_KEY, JSON.stringify(draft));
}

function loadCustomerDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(CUSTOMER_DRAFT_KEY));
    if (!draft) return null;
    customerState.favoriteIds = Array.isArray(draft.favoriteIds) ? draft.favoriteIds : [];
    customerState.selectedIds = Array.isArray(draft.selectedIds) ? draft.selectedIds : [];
    customerState.activePhotoId = draft.activePhotoId || null;
    customerState.activeSlotIndex = Number.isInteger(draft.activeSlotIndex) ? draft.activeSlotIndex : 0;
    customerState.photoAdjustments = draft.photoAdjustments || {};
    customerState.photoFilters = draft.photoFilters || {};
    customerState.currentFinalIndex = Math.max(1, Number(draft.currentFinalIndex || 1));
    return draft;
  } catch {
    localStorage.removeItem(CUSTOMER_DRAFT_KEY);
    return null;
  }
}

let presetFrames = {
  frame1: { id: "frame1", name: "ChanBaek Rainbow", src: "assets/frame1-2.png", overlaySrc: "assets/frame1-2-overlay.png", maxPhotos: 4 },
  frame2: { id: "frame2", name: "ChanBaek Red", src: "assets/frame2-2.png", overlaySrc: "assets/frame2-2-overlay.png", maxPhotos: 4 },
};

const previewGesture = {
  pointers: new Map(),
  lastPoint: null,
  lastDistance: null,
  startZoom: 1,
  startAdjustment: null,
  startCenter: null,
  singlePointerMode: null,
};

const customerThemes = {
  champagne: { bg: "#fbf0dc", panel: "#ffffff", accent: "#c69b4f", ink: "#231c16" },
  rose: { bg: "#fff0f2", panel: "#ffffff", accent: "#c66f7f", ink: "#2b171d" },
  mint: { bg: "#edf8f4", panel: "#ffffff", accent: "#75a99a", ink: "#172622" },
  ink: { bg: "#151719", panel: "#f8f4ed", accent: "#d5ad67", ink: "#f8f4ed" },
};

const customerFilters = {
  clean: { label: "Tự nhiên", canvas: "none", thumb: "none" },
  bright: { label: "Sáng da", canvas: "brightness(1.12) contrast(1.04) saturate(1.04)", thumb: "brightness(1.12) contrast(1.04) saturate(1.04)" },
  rosy: { label: "Hồng nhẹ", canvas: "brightness(1.08) contrast(1.03) saturate(1.18) sepia(0.08)", thumb: "brightness(1.08) contrast(1.03) saturate(1.18) sepia(0.08)" },
  film: { label: "Film", canvas: "contrast(1.12) saturate(0.82) sepia(0.18)", thumb: "contrast(1.12) saturate(0.82) sepia(0.18)" },
  bw: { label: "Đen trắng", canvas: "grayscale(1) contrast(1.08)", thumb: "grayscale(1) contrast(1.08)" },
};

Object.assign(customerFilters.clean, { label: "Tự nhiên" });
Object.assign(customerFilters.bright, { label: "Sáng da" });
Object.assign(customerFilters.rosy, { label: "Hồng nhẹ" });
Object.assign(customerFilters.bw, { label: "Đen trắng" });

Object.assign(customerFilters, {
  learned: {
    label: "AI learned",
    canvas: "brightness(1.02) contrast(1.05) saturate(0.82) sepia(0.16) hue-rotate(-4deg)",
    thumb: "brightness(1.02) contrast(1.05) saturate(0.82) sepia(0.16) hue-rotate(-4deg)",
    processor: "learned",
  },
  magimir: {
    label: "Magimir mem retro",
    canvas: "brightness(1.03) contrast(1.02) saturate(0.86) sepia(0.14) hue-rotate(-3deg)",
    thumb: "brightness(1.03) contrast(1.02) saturate(0.86) sepia(0.14) hue-rotate(-3deg)",
  },
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function makeCustomerId(prefix) {
  if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const customerCanvas = document.querySelector("#customerCanvas");
const customerCtx = customerCanvas.getContext("2d");
const customerToast = document.querySelector("#customerToast");
const keyedFrameCache = new Map();
let learnedCoefficientsPromise = null;

function loadSessionStore() {
  if (customerState.remoteStore?.sessions) return customerState.remoteStore;
  try {
    const stored = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY));
    if (stored?.sessions) return stored;
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
  return { nextNumber: 1, sessions: [] };
}

async function saveSessionStore(store) {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(store));
  try {
    const response = await fetch(API_STATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(store),
    });
    if (response.status === 409) {
      await refreshSessionStoreFromServer();
      showCustomerToast("Phiên vừa được cập nhật. Vui lòng thử lại thao tác.");
      return false;
    }
    if (!response.ok) throw new Error("Cannot save session");
    const result = await response.json();
    store._revision = result.revision;
    customerState.remoteStore = store;
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    showCustomerToast("Mất kết nối máy chủ. Vui lòng giữ nguyên trang và thử lại.");
    return false;
  }
}

async function refreshSessionStoreFromServer() {
  try {
    const response = await fetch(API_STATE_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("Cannot load server state");
    const store = await response.json();
    if (Array.isArray(store.sessions)) {
      customerState.remoteStore = store;
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(store));
    }
  } catch {
    customerState.remoteStore = null;
  }
}

function getCurrentSession() {
  const store = loadSessionStore();
  return {
    store,
    session: store.sessions.find((item) => item.id === customerState.sessionCode),
  };
}

function updateSessionStatus(status, patch = {}) {
  const { store, session } = getCurrentSession();
  if (!session) return null;
  Object.assign(session, patch, { status, updatedAt: new Date().toISOString() });
  saveSessionStore(store);
  renderSessionStatus();
  return session;
}

function renderSessionStatus() {
  const { session } = getCurrentSession();
  const statusEl = document.querySelector("#customerSessionStatus");
  if (!statusEl) return;
  if (!session) {
    statusEl.textContent = "Demo local - chưa có session trong dashboard";
    return;
  }
  statusEl.textContent = `${session.ticket} · ${session.customerName} · ${session.status}`;
}

function syncSessionPhotos(session) {
  if (session) {
    customerState.printCount = Math.max(1, Number(session.printCount || packagePrintCounts[session.packageId] || 1));
    customerState.completedFinals = Array.isArray(session.finalJobs) ? session.finalJobs : [];
    customerState.currentFinalIndex = Math.min(customerState.printCount, customerState.completedFinals.length + 1);
    if (Array.isArray(session.availableFrames) && session.availableFrames.length) {
      const merged = { ...presetFrames };
      session.availableFrames.forEach((frame) => {
        if (frame?.id && frame?.src) merged[frame.id] = { ...(merged[frame.id] || {}), ...frame, maxPhotos: Number(frame.maxPhotos || session.frameSlots || 4) };
      });
      presetFrames = merged;
    }
    customerState.allowedFrames = Array.isArray(session.allowedFrames) && session.allowedFrames.length ? session.allowedFrames : ["frame1", "frame2"];
    customerState.defaultFrameId = session.defaultFrameId || null;
    if (!customerState.defaultFrameId && customerState.currentStage === "raw") customerState.customFrame = null;
    updateAvailableFrames();
    updateFinalProgress();
  }
  if (!session?.rawPhotos?.length) return;
  const beforeCount = customerState.photos.length;
  session.rawPhotos.forEach((rawPhoto) => {
    if (customerState.photos.some((photo) => photo.id === rawPhoto.id)) return;
    customerState.photos.push({
      id: rawPhoto.id,
      name: rawPhoto.name,
      src: rawPhoto.src,
      source: rawPhoto.source || "original",
    });
    if (rawPhoto.filterKey) {
      customerState.photoFilters[rawPhoto.id] = rawPhoto.filterKey;
    }
  });
  customerState.maxPhotos = session.frameSlots || customerState.maxPhotos;
  if (customerState.photos.length !== beforeCount) {
    customerState.rendered = false;
  }
  updateFinalProgress();
}

function renderPresetFrameButtons() {
  const grid = document.querySelector("#customerPresetFrames");
  if (!grid) return;
  const allowed = customerState.allowedFrames?.length ? customerState.allowedFrames : Object.keys(presetFrames);
  grid.innerHTML = allowed
    .map((frameId) => presetFrames[frameId])
    .filter(Boolean)
    .map((frame) => `
      <button class="preset-frame${customerState.customFrame?.id === frame.id ? " is-selected" : ""}" data-frame="${frame.id}" type="button">
        <img src="${frame.src}" alt="${frame.name}" />
        <span>${frame.name}</span>
        <strong>${frame.maxPhotos || 4} anh</strong>
      </button>
    `)
    .join("");
  grid.querySelectorAll(".preset-frame").forEach((button) => {
    button.addEventListener("click", () => selectPresetFrame(button.dataset.frame));
  });
}

function renderCustomerGate() {
  const { store, session } = getCurrentSession();
  const gateStep = document.querySelector("#customerGateStep");
  const gateTitle = document.querySelector("#customerGateTitle");
  const gateText = document.querySelector("#customerGateText");
  const gateTicket = document.querySelector("#customerGateTicket");
  const hasFilteredPhotos = Boolean(
    session?.rawPhotos?.length &&
      (session.autoFilter?.status === "APPLIED" || session.rawPhotos.every((photo) => photo.filterKey || photo.filteredBeforeCustomerView))
  );
  const isReady = session && photoStatuses.includes(session.status) && hasFilteredPhotos;

  document.body.classList.toggle("is-ready", Boolean(isReady));
  document.body.classList.toggle("is-waiting", !isReady);

  if (!session) {
    gateStep.textContent = "Chưa có phiên";
    gateTitle.textContent = "Vui lòng quét đúng QR phiên";
    gateText.textContent = "Nhân viên cần tạo phiên tại quầy trước.";
    gateTicket.textContent = "A---";
    return;
  }

  gateTicket.textContent = session.ticket;
  if (session.status === "PAYMENT_CASH_PENDING") {
    gateStep.textContent = "Chờ xác nhận thanh toán";
    gateTitle.textContent = `${session.ticket} · ${session.roomName || "Phòng chụp"}`;
    gateText.textContent = "Vui lòng thanh toán tiền mặt tại quầy. Trang sẽ tự cập nhật sau khi nhân viên xác nhận.";
  } else if (session.status === "WAITING" || session.status === "REJOINED_QUEUE") {
    const waiting = store.sessions.filter((item) => ["WAITING", "REJOINED_QUEUE", "CALLING", "SHOOTING", "PAUSED"].includes(item.status) && (!session.roomId || item.roomId === session.roomId));
    const position = Math.max(1, waiting.findIndex((item) => item.id === session.id) + 1);
    const ahead = Math.max(0, position - 1);
    const waitMinutes = waiting
      .slice(0, Math.max(0, position - 1))
      .reduce((sum, item) => sum + (item.status === "SHOOTING" && Number.isFinite(Number(item.remainingSeconds)) ? Math.ceil(Number(item.remainingSeconds) / 60) : (packageMinutes[item.packageId] || item.packageMinutes || 5)), 0);
    gateStep.textContent = "Đang chờ lượt";
    gateTitle.textContent = `${session.ticket} · ${session.roomName || "Phòng chụp"}`;
    gateText.textContent = ahead
      ? `Còn ${ahead} lượt trước bạn, dự kiến khoảng ${waitMinutes} phút.`
      : "Bạn là lượt tiếp theo. Vui lòng chờ nhân viên gọi số.";
  } else if (session.status === "CALLING") {
    gateStep.textContent = "Đến lượt";
    gateTitle.textContent = "Mời bạn vào phòng chụp";
    gateText.textContent = "Nhân viên đang gọi số của bạn.";
  } else if (session.status === "SHOOTING" || session.status === "PAUSED") {
    gateStep.textContent = "Đang chụp";
    gateTitle.textContent = "Phiên chụp đang diễn ra";
    gateText.textContent = `Ảnh sẽ tự hiện ở đây sau khi chụp xong. Đã nhận ${session.rawCount || 0} ảnh.`;
  } else if (isReady) {
    gateStep.textContent = "Ảnh đã sẵn sàng";
    gateTitle.textContent = "Chọn ảnh và ghép frame";
    gateText.textContent = `${session.rawCount || 0} ảnh vừa chụp đã được tải vào phiên.`;
  } else {
    gateStep.textContent = "Đang xử lý";
    gateTitle.textContent = session.status;
    gateText.textContent = "Trang sẽ tự cập nhật khi ảnh sẵn sàng.";
  }
}

async function refreshCustomerSessionView() {
  await refreshSessionStoreFromServer();
  const { session } = getCurrentSession();
  if (session?.status === "COMPLETED") {
    localStorage.removeItem(CUSTOMER_DRAFT_KEY);
    window.location.replace("checkin.html");
    return;
  }
  syncSessionPhotos(session);
  const isFinalStatus = ["FINAL_READY", "SENT_TO_PRINT_STAFF", "PRINTED", "COMPLETED"].includes(session?.status);
  if (isFinalStatus && customerState.completedFinals.length >= customerState.printCount) {
    setCustomerStage("final");
    const printRequested = session.status !== "FINAL_READY";
    const code = document.querySelector("#customerResultPrintCode");
    const title = document.querySelector("#customerResultTitle");
    const copy = document.querySelector("#customerResultCopy");
    const button = document.querySelector("#customerRequestPrintBtn");
    const backButton = document.querySelector("#customerBackToEditBtn");
    if (code) code.hidden = !printRequested;
    if (button) button.hidden = printRequested;
    if (backButton) backButton.hidden = printRequested;
    if (printRequested && title) title.textContent = "Mã lượt in";
    if (printRequested && copy) copy.textContent = "Khách hàng vui lòng liên hệ nhân viên tại quầy để nhận ảnh.";
  }
  renderSessionStatus();
  renderCustomerGate();
  renderRawPhotoGrid();
  renderCustomerPhotoGrid();
  updateActivePhotoControls();
  if (session && photoStatuses.includes(session.status) && customerState.currentStage === "composer" && customerState.selectedIds.length && !customerState.rendered) {
    renderCustomerCanvas({ silent: true });
  } else if (session && photoStatuses.includes(session.status) && customerState.photos.length && !customerState.rendered) {
    renderFramePreview();
  }
}

function showCustomerToast(message) {
  customerToast.textContent = message;
  customerToast.classList.add("is-visible");
  window.clearTimeout(showCustomerToast.timeout);
  showCustomerToast.timeout = window.setTimeout(() => customerToast.classList.remove("is-visible"), 2600);
}

function updateCustomerCount() {
  const selectedCount = customerState.selectedIds.filter(Boolean).length;
  const countLabel = document.querySelector("#customerSelectedCount");
  if (countLabel) {
    countLabel.textContent = customerState.currentStage === "raw"
      ? `${customerState.favoriteIds.length} ảnh đã ghim`
      : `${selectedCount}/${customerState.maxPhotos} ảnh trong frame`;
  }
  const nextButton = document.querySelector("#goComposerBtn");
  if (nextButton) {
    nextButton.textContent = "Chọn frame & ghép ảnh →";
  }
  updateFinalProgress();
}

function updateFinalProgress() {
  const total = Math.max(1, Number(customerState.printCount || 1));
  const done = Array.isArray(customerState.completedFinals) ? customerState.completedFinals.length : 0;
  const current = Math.min(total, Math.max(1, Number(customerState.currentFinalIndex || done + 1)));
  const progress = document.querySelector("#customerFinalProgress");
  if (progress) {
    progress.textContent = `Luot ghep ${current}/${total} - da gui ${Math.min(done, total)}/${total} file in`;
  }
  const printSummary = document.querySelector("#customerPrintSummary");
  if (printSummary) printSummary.textContent = `${total} tờ · 300dpi · Glossy`;
  const printCode = document.querySelector("#customerPrintCode");
  if (printCode) {
    const { session } = getCurrentSession();
    const ticket = session?.ticket || customerState.sessionCode;
    const codes = (customerState.completedFinals || []).length ? [ticket] : [];
    printCode.hidden = true;
    const resultCode = document.querySelector("#customerResultPrintCode");
    if (resultCode) resultCode.textContent = codes.length ? codes.join(" · ") : ticket;
    printCode.textContent = codes.length ? `Mã in: ${codes.join(" · ")}` : "";
  }
  const sendButton = document.querySelector("#sendPrintBtn");
  if (sendButton) {
    syncComposerContinueButton();
  }
  const downloadButton = document.querySelector("#customerDownloadBtn");
  if (downloadButton) {
    downloadButton.hidden = true;
    downloadButton.textContent = "Tải ảnh đã ghép";
  }
  renderFinalResultGallery();
}

function syncComposerContinueButton() {
  const button = document.querySelector("#sendPrintBtn");
  if (!button) return;
  const required = Math.max(1, Number(customerState.maxPhotos || 1));
  const filled = customerState.selectedIds.filter(Boolean).length;
  const missing = Math.max(0, required - filled);
  button.hidden = false;
  button.disabled = missing > 0;
  button.textContent = missing > 0 ? `Thêm ${missing} ảnh để tiếp tục` : "Tiếp tục →";
}

function renderFinalResultGallery() {
  const gallery = document.querySelector("#customerFinalGallery");
  if (!gallery) return;
  gallery.replaceChildren();
  const jobs = Array.isArray(customerState.completedFinals) ? customerState.completedFinals : [];
  jobs.forEach((job, index) => {
    const card = document.createElement("a");
    card.className = "customer-final-card";
    card.href = job.url || "#";
    if (job.url) card.download = job.fileName || `${customerState.sessionCode}-final-${index + 1}.png`;
    const image = document.createElement("img");
    image.src = job.url || customerCanvas.toDataURL("image/png");
    image.alt = `Ảnh đã ghép ${index + 1}`;
    card.appendChild(image);
    gallery.appendChild(card);
  });
}

function setCustomerStage(stage) {
  customerState.currentStage = stage;
  document.body.classList.toggle("is-raw-stage", stage === "raw");
  document.body.classList.toggle("is-composer-stage", stage === "composer");
  const title = document.querySelector("#customerPageTitle");
  const copy = document.querySelector("#customerPageCopy");
  if (title) title.textContent = stage === "raw" ? "Ảnh vừa chụp" : "Ghép frame";
  if (copy) {
    copy.textContent = stage === "raw"
      ? "Bấm vào ảnh để xem lớn. Nhấn giữ ảnh để tải về máy, rồi bấm Next để ghép frame."
      : "Kéo ảnh để căn vị trí, chụm hai ngón để zoom.";
  }
  if (stage === "composer") {
    if (customerState.selectedIds.some(Boolean)) {
      customerState.activePhotoId ||= customerState.selectedIds.find(Boolean) || null;
      renderCustomerCanvas({ silent: true });
    } else {
      renderFramePreview();
    }
  }
  renderRawPhotoGrid();
  renderCustomerPhotoGrid();
  updateActivePhotoControls();
}

function setCustomerStage(stage) {
  customerState.currentStage = stage;
  document.body.classList.toggle("is-raw-stage", stage === "raw");
  document.body.classList.toggle("is-frame-stage", stage === "frame");
  document.body.classList.toggle("is-composer-stage", stage === "composer");
  document.body.classList.toggle("is-final-stage", stage === "final");
  const finalResult = document.querySelector("#customerFinalResult");
  if (finalResult) finalResult.hidden = stage !== "final";
  const title = document.querySelector("#customerPageTitle");
  const copy = document.querySelector("#customerPageCopy");
  const titleMap = { raw: "Ảnh vừa chụp", frame: "Chọn frame", composer: "Ghép frame" };
  const copyMap = {
    raw: "Bấm vào ảnh để xem lớn. Nhấn giữ ảnh để tải về máy.",
    frame: "Chọn mẫu frame bạn muốn dùng cho ảnh cuối.",
    composer: "Frame ở trên, tất cả ảnh ở dưới. Bấm ảnh để đổi ảnh trong ô đang chọn.",
  };
  if (title) title.textContent = titleMap[stage] || titleMap.raw;
  if (copy) copy.textContent = copyMap[stage] || copyMap.raw;
  if (stage === "composer" && customerState.selectedIds.length) {
    customerState.activePhotoId ||= customerState.selectedIds[0];
    renderCustomerCanvas({ silent: true });
  }
  renderRawPhotoGrid();
  renderCustomerPhotoGrid();
  updateActivePhotoControls();
}

function setCustomerStage(stage) {
  customerState.currentStage = stage;
  document.body.classList.toggle("is-raw-stage", stage === "raw");
  document.body.classList.toggle("is-frame-stage", stage === "frame");
  document.body.classList.toggle("is-composer-stage", stage === "composer");
  document.body.classList.toggle("is-final-stage", stage === "final");
  const finalResult = document.querySelector("#customerFinalResult");
  if (finalResult) finalResult.hidden = stage !== "final";

  const title = document.querySelector("#customerPageTitle");
  const copy = document.querySelector("#customerPageCopy");
  const titleMap = {
    raw: "\u1ea2nh v\u1eeba ch\u1ee5p",
    frame: "Ch\u1ecdn frame",
    composer: "Gh\u00e9p frame",
    final: "Ho\u00e0n t\u1ea5t",
  };
  const copyMap = {
    raw: "B\u1ea5m v\u00e0o \u1ea3nh \u0111\u1ec3 xem l\u1edbn. Nh\u1ea5n gi\u1eef \u1ea3nh \u0111\u1ec3 t\u1ea3i v\u1ec1 m\u00e1y.",
    frame: "Ch\u1ecdn m\u1eabu frame b\u1ea1n mu\u1ed1n d\u00f9ng cho \u1ea3nh cu\u1ed1i.",
    composer: "Frame \u1edf tr\u00ean, t\u1ea5t c\u1ea3 \u1ea3nh \u1edf d\u01b0\u1edbi. B\u1ea5m \u1ea3nh \u0111\u1ec3 \u0111\u1ed5i \u1ea3nh trong \u00f4 \u0111ang ch\u1ecdn.",
    final: "Ghi nh\u1edb m\u00e3 in v\u00e0 t\u1ea3i \u1ea3nh \u0111\u00e3 gh\u00e9p v\u1ec1 m\u00e1y.",
  };
  if (title) title.textContent = titleMap[stage] || titleMap.raw;
  if (copy) copy.textContent = copyMap[stage] || copyMap.raw;

  if (stage === "composer") {
    if (customerState.selectedIds.some(Boolean)) {
      customerState.activePhotoId ||= customerState.selectedIds.find(Boolean) || null;
      renderCustomerCanvas({ silent: true });
    } else {
      renderFramePreview();
    }
  }
  renderRawPhotoGrid();
  renderCustomerPhotoGrid();
  updateActivePhotoControls();
}

async function sourceToFile(source, fileName) {
  const response = await fetch(source, { cache: "force-cache" });
  if (!response.ok) throw new Error("Cannot read image");
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || "image/jpeg" });
}

async function shareImageFiles(files, fallbackSource) {
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files }))) {
    try {
      await navigator.share({ files, title: "Ảnh Glame Photobooth" });
      showCustomerToast("Chọn Lưu hình ảnh để thêm vào album Photos.");
      return true;
    } catch (error) {
      if (error?.name === "AbortError") return true;
    }
  }

  const link = document.createElement("a");
  link.href = fallbackSource || URL.createObjectURL(files[0]);
  link.target = "_blank";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  showCustomerToast("Ảnh đã mở. Nhấn giữ ảnh rồi chọn Lưu vào Ảnh.");
  return false;
}

async function downloadPhotoFile(photo) {
  if (!photo) return;
  const safeName = (photo.name || `${customerState.sessionCode}-photo.jpg`).replace(/[^a-zA-Z0-9._-]+/g, "-");
  const source = photo.src;
  showCustomerToast("Đang chuẩn bị lưu ảnh...");
  try {
    const file = await sourceToFile(source, safeName);
    await shareImageFiles([file], source);
  } catch {
    showCustomerToast("Chưa lưu được ảnh. Vui lòng thử lại.");
  }
}

function toggleSelectedPhoto(id) {
  const currentIndex = customerState.favoriteIds.indexOf(id);
  if (currentIndex >= 0) {
    customerState.favoriteIds.splice(currentIndex, 1);
  } else {
    customerState.favoriteIds.push(id);
  }
  renderRawPhotoGrid();
  renderCustomerPhotoGrid();
  updateCustomerCount();
  updateViewerFavoriteButton();
}

function openPhotoViewer(photoId) {
  const photo = customerState.photos.find((item) => item.id === photoId);
  if (!photo) return;
  customerState.viewerPhotoId = photoId;
  const viewer = document.querySelector("#photoViewer");
  const image = document.querySelector("#photoViewerImage");
  image.src = photoDisplaySrc(photo);
  image.style.filter = photoDisplayFilter(photo);
  updateViewerFavoriteButton();
  viewer.hidden = false;
}

function updateViewerFavoriteButton() {
  const button = document.querySelector("#viewerFavoriteBtn");
  if (!button) return;
  const isSelected = customerState.favoriteIds.includes(customerState.viewerPhotoId);
  button.textContent = isSelected ? "♥ Đã ghim" : "♡ Ghim ảnh";
  button.classList.toggle("is-selected", isSelected);
}

function closePhotoViewer() {
  const viewer = document.querySelector("#photoViewer");
  const image = document.querySelector("#photoViewerImage");
  customerState.viewerPhotoId = null;
  if (image) image.src = "";
  if (viewer) viewer.hidden = true;
}

function renderRawPhotoGrid() {
  const grid = document.querySelector("#customerRawPhotoGrid");
  if (!grid) return;
  grid.innerHTML = "";
  if (!customerState.photos.length) {
    grid.innerHTML = '<div class="empty-state">Ảnh vừa chụp sẽ hiện ở đây sau khi nhân viên kết thúc phiên chụp.</div>';
    return;
  }

  customerState.photos.forEach((photo) => {
    const isSelected = customerState.favoriteIds.includes(photo.id);
    const tile = document.createElement("div");
    tile.className = `photo-tile${isSelected ? " is-selected" : ""}`;
    tile.innerHTML = `
      <button class="photo-open" type="button" aria-label="Xem ${photo.name}">
        <img src="${photoDisplaySrc(photo)}" alt="${photo.name}" style="filter: ${photoDisplayFilter(photo)}">
      </button>
      <button class="photo-favorite" type="button" aria-label="${isSelected ? "Bỏ ghim" : "Ghim ảnh"}">${isSelected ? "♥" : "♡"}</button>
      <small>${photo.source === "edited" ? "Đã chỉnh" : "Gốc"}</small>
    `;

    const openButton = tile.querySelector(".photo-open");
    const favoriteButton = tile.querySelector(".photo-favorite");
    let holdTimer = null;
    openButton.addEventListener("pointerdown", () => {
      holdTimer = window.setTimeout(() => {
        downloadPhotoFile(photo);
        showCustomerToast("Đang tải ảnh.");
      }, 650);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((eventName) => {
      openButton.addEventListener(eventName, () => window.clearTimeout(holdTimer));
    });
    openButton.addEventListener("click", () => openPhotoViewer(photo.id));
    favoriteButton.addEventListener("click", () => toggleSelectedPhoto(photo.id));
    grid.appendChild(tile);
  });
}

function getActiveAdjustment() {
  if (!customerState.activePhotoId) return null;
  if (!customerState.photoAdjustments[customerState.activePhotoId]) {
    customerState.photoAdjustments[customerState.activePhotoId] = { x: 0, y: 0, zoom: 1 };
  }
  return customerState.photoAdjustments[customerState.activePhotoId];
}

function getPhotoFilter(photoId) {
  return customerState.photoFilters[photoId] || "clean";
}

function updateActivePhotoControls() {
  const label = document.querySelector("#activePhotoLabel");
  const zoomInput = document.querySelector("#photoZoomInput");
  const mobileZoomInput = document.querySelector("#mobileZoomInput");
  const filterLabel = document.querySelector("#activeFilterLabel");
  const activeIndex = customerState.selectedIds.indexOf(customerState.activePhotoId);
  const adjustment = getActiveAdjustment();

  if (!customerState.activePhotoId || activeIndex < 0 || !adjustment) {
    label.textContent = "Chưa chọn ảnh";
    zoomInput.value = "1";
    mobileZoomInput.value = "1";
    if (filterLabel) filterLabel.textContent = "Chưa chọn ảnh";
    document.querySelectorAll("[data-filter]").forEach((button) => button.classList.remove("is-selected"));
    return;
  }

  label.textContent = `Đang chỉnh ảnh #${activeIndex + 1}`;
  zoomInput.value = String(adjustment.zoom || 1);
  mobileZoomInput.value = String(adjustment.zoom || 1);
  const activeFilter = getPhotoFilter(customerState.activePhotoId);
  if (filterLabel) filterLabel.textContent = customerFilters[activeFilter]?.label || customerFilters.clean.label;
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.filter === activeFilter);
  });
}

const baseUpdateActivePhotoControls = updateActivePhotoControls;
updateActivePhotoControls = function updateActivePhotoControlsWithCleanText() {
  baseUpdateActivePhotoControls();
  const label = document.querySelector("#activePhotoLabel");
  const filterLabel = document.querySelector("#activeFilterLabel");
  const activeIndex = customerState.selectedIds.indexOf(customerState.activePhotoId);
  if (!customerState.activePhotoId || activeIndex < 0) {
    if (label) label.textContent = "Chưa chọn ảnh";
    if (filterLabel) filterLabel.textContent = "Chưa chọn ảnh";
    return;
  }
  if (label) label.textContent = `Đang chỉnh ảnh #${activeIndex + 1}`;
  const activeFilter = getPhotoFilter(customerState.activePhotoId);
  if (filterLabel) filterLabel.textContent = customerFilters[activeFilter]?.label || customerFilters.clean.label;
};

const composerSelectionReadout = updateActivePhotoControls;
updateActivePhotoControls = function updateActivePhotoControlsForSelection() {
  composerSelectionReadout();
  syncComposerContinueButton();
  const label = document.querySelector("#activePhotoLabel");
  if (!label) return;
  label.textContent = customerState.selectedIds.length
    ? `\u0110\u00e3 ch\u1ecdn ${customerState.selectedIds.length}/${customerState.maxPhotos} \u1ea3nh. B\u1ea5m l\u1ea1i \u1ea3nh \u0111\u1ec3 b\u1ecf ch\u1ecdn.`
    : "Ch\u01b0a ch\u1ecdn \u1ea3nh n\u00e0o.";
};

function loadCustomerImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function loadLearnedCoefficients() {
  if (!learnedCoefficientsPromise) {
    learnedCoefficientsPromise = fetch("outputs/magimir_lut/magimir_poly_coeffs.json", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Cannot load learned color model");
        return response.json();
      })
      .then((model) => model.coefficients);
  }
  return learnedCoefficientsPromise;
}

function applyLearnedLookToContext(targetCtx, width, height, coeffs) {
  const imageData = targetCtx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index] / 255;
    const g = data[index + 1] / 255;
    const b = data[index + 2] / 255;
    const features = [r, g, b, r * r, g * g, b * b, r * g, r * b, g * b, 1];
    let outR = 0;
    let outG = 0;
    let outB = 0;

    for (let featureIndex = 0; featureIndex < features.length; featureIndex += 1) {
      outR += features[featureIndex] * coeffs[featureIndex][0];
      outG += features[featureIndex] * coeffs[featureIndex][1];
      outB += features[featureIndex] * coeffs[featureIndex][2];
    }

    data[index] = Math.round(clamp(outR, 0, 1) * 255);
    data[index + 1] = Math.round(clamp(outG, 0, 1) * 255);
    data[index + 2] = Math.round(clamp(outB, 0, 1) * 255);
  }

  targetCtx.putImageData(imageData, 0, 0);
}

async function renderPhotoWithFilter(photo, { maxSide = 0 } = {}) {
  const image = await loadCustomerImage(photo.src);
  const scale = maxSide ? Math.min(maxSide / image.width, maxSide / image.height, 1) : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext("2d");
  const filter = customerFilters[getPhotoFilter(photo.id)] || customerFilters.clean;

  ctx.filter = filter.processor ? "none" : filter.canvas || "none";
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  ctx.filter = "none";

  if (filter.processor === "learned") {
    const coeffs = await loadLearnedCoefficients();
    applyLearnedLookToContext(ctx, canvas.width, canvas.height, coeffs);
  }

  return canvas;
}

async function prepareFilteredPreview(photo) {
  const filter = customerFilters[getPhotoFilter(photo.id)] || customerFilters.clean;
  if (!filter.processor || photo.filteredSrc) return;
  try {
    const canvas = await renderPhotoWithFilter(photo, { maxSide: 1000 });
    photo.filteredSrc = canvas.toDataURL("image/jpeg", 0.92);
    renderRawPhotoGrid();
    renderCustomerPhotoGrid();
  } catch {
    photo.filteredSrc = null;
  }
}

function photoDisplaySrc(photo) {
  const filter = customerFilters[getPhotoFilter(photo.id)] || customerFilters.clean;
  return filter.processor && photo.filteredSrc ? photo.filteredSrc : photo.src;
}

function photoDisplayFilter(photo) {
  const filter = customerFilters[getPhotoFilter(photo.id)] || customerFilters.clean;
  if (filter.processor) return photo.filteredSrc ? "none" : (filter.canvas || "none");
  return filter.thumb || "none";
}

function buildSampleFilterFromImage(image) {
  const sampleCanvas = document.createElement("canvas");
  const sampleSize = 96;
  sampleCanvas.width = sampleSize;
  sampleCanvas.height = sampleSize;
  const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  sampleCtx.drawImage(image, 0, 0, sampleSize, sampleSize);

  const pixels = sampleCtx.getImageData(0, 0, sampleSize, sampleSize).data;
  let red = 0;
  let green = 0;
  let blue = 0;
  let saturation = 0;
  let contrast = 0;
  const luminanceValues = [];
  const total = pixels.length / 4;

  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index] / 255;
    const g = pixels[index + 1] / 255;
    const b = pixels[index + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    red += r;
    green += g;
    blue += b;
    saturation += max === 0 ? 0 : (max - min) / max;
    luminanceValues.push(luminance);
  }

  red /= total;
  green /= total;
  blue /= total;
  saturation /= total;
  const luminanceAverage = luminanceValues.reduce((sum, value) => sum + value, 0) / total;
  luminanceValues.forEach((value) => {
    contrast += Math.abs(value - luminanceAverage);
  });
  contrast /= total;

  const brightness = clamp(0.86 + luminanceAverage * 0.52, 0.86, 1.18);
  const saturate = clamp(0.72 + saturation * 1.85, 0.72, 1.42);
  const contrastFilter = clamp(0.94 + contrast * 1.9, 0.94, 1.18);
  const warmth = red - blue;
  const sepia = clamp(Math.max(warmth, 0) * 0.62, 0, 0.22);
  const hue = clamp((green - red) * 24 + (blue - red) * 18, -16, 16);
  const filter = `brightness(${brightness.toFixed(2)}) contrast(${contrastFilter.toFixed(2)}) saturate(${saturate.toFixed(2)}) sepia(${sepia.toFixed(2)}) hue-rotate(${hue.toFixed(0)}deg)`;

  return {
    label: "Ảnh mẫu",
    canvas: filter,
    thumb: filter,
  };
}

async function loadSampleFilter(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const src = URL.createObjectURL(file);
  try {
    const image = await loadCustomerImage(src);
    customerFilters.sample = buildSampleFilterFromImage(image);
    customerState.copiedFilter = "sample";
    const sampleChip = document.querySelector("#sampleFilterChip");
    if (sampleChip) {
      sampleChip.hidden = false;
      sampleChip.disabled = false;
    }
    if (customerState.activePhotoId && customerState.selectedIds.includes(customerState.activePhotoId)) {
      selectActiveFilter("sample");
    } else {
      updateActivePhotoControls();
    }
    showCustomerToast("Đã tạo filter từ ảnh mẫu.");
  } finally {
    URL.revokeObjectURL(src);
  }
}

async function loadKeyedFrame(src) {
  if (keyedFrameCache.has(src)) {
    return keyedFrameCache.get(src);
  }

  const image = await loadCustomerImage(src);
  const offscreen = document.createElement("canvas");
  offscreen.width = image.width;
  offscreen.height = image.height;
  const offscreenCtx = offscreen.getContext("2d");
  offscreenCtx.drawImage(image, 0, 0);

  const imageData = offscreenCtx.getImageData(0, 0, offscreen.width, offscreen.height);
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    if (red < 18 && green < 18 && blue < 18) {
      data[index + 3] = 0;
    }
  }
  offscreenCtx.putImageData(imageData, 0, 0);

  const keyedImage = await loadCustomerImage(offscreen.toDataURL("image/png"));
  keyedFrameCache.set(src, keyedImage);
  return keyedImage;
}

function drawCustomerCover(image, x, y, width, height, adjustment = {}, filterKey = "clean") {
  const zoom = adjustment.zoom || 1;
  const scale = Math.max(width / image.width, height / image.height) * zoom;
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const maxOffsetX = Math.max(0, (drawWidth - width) / 2);
  const maxOffsetY = Math.max(0, (drawHeight - height) / 2);
  adjustment.x = clamp(Number(adjustment.x || 0), -maxOffsetX, maxOffsetX);
  adjustment.y = clamp(Number(adjustment.y || 0), -maxOffsetY, maxOffsetY);
  const drawX = x + (width - drawWidth) / 2 + (adjustment.x || 0);
  const drawY = y + (height - drawHeight) / 2 + (adjustment.y || 0);
  const filter = customerFilters[filterKey] || customerFilters.clean;
  customerCtx.filter = filter.processor ? "none" : filter.canvas || "none";
  customerCtx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  customerCtx.filter = "none";
  if (filter.processor === "learned" && customerState.learnedCoefficients) {
    const ix = Math.max(0, Math.floor(x));
    const iy = Math.max(0, Math.floor(y));
    const iw = Math.min(customerCanvas.width - ix, Math.ceil(width));
    const ih = Math.min(customerCanvas.height - iy, Math.ceil(height));
    if (iw > 0 && ih > 0) {
      const imageData = customerCtx.getImageData(ix, iy, iw, ih);
      const data = imageData.data;
      const coeffs = customerState.learnedCoefficients;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index + 3] === 0) continue;
        const r = data[index] / 255;
        const g = data[index + 1] / 255;
        const b = data[index + 2] / 255;
        const features = [r, g, b, r * r, g * g, b * b, r * g, r * b, g * b, 1];
        let outR = 0;
        let outG = 0;
        let outB = 0;
        for (let featureIndex = 0; featureIndex < features.length; featureIndex += 1) {
          outR += features[featureIndex] * coeffs[featureIndex][0];
          outG += features[featureIndex] * coeffs[featureIndex][1];
          outB += features[featureIndex] * coeffs[featureIndex][2];
        }
        data[index] = Math.round(clamp(outR, 0, 1) * 255);
        data[index + 1] = Math.round(clamp(outG, 0, 1) * 255);
        data[index + 2] = Math.round(clamp(outB, 0, 1) * 255);
      }
      customerCtx.putImageData(imageData, ix, iy);
    }
  }
}

function drawCustomerRoundedRect(x, y, width, height, radius) {
  customerCtx.beginPath();
  customerCtx.moveTo(x + radius, y);
  customerCtx.arcTo(x + width, y, x + width, y + height, radius);
  customerCtx.arcTo(x + width, y + height, x, y + height, radius);
  customerCtx.arcTo(x, y + height, x, y, radius);
  customerCtx.arcTo(x, y, x + width, y, radius);
  customerCtx.closePath();
}

function getLayoutSlots() {
  if (customerState.customFrame?.id === "frame1") {
    return [
      { x: 64, y: 138, w: 512, h: 660 },
      { x: 626, y: 220, w: 512, h: 710 },
      { x: 64, y: 916, w: 512, h: 660 },
      { x: 626, y: 1000, w: 512, h: 670 },
    ];
  }

  if (customerState.customFrame?.id === "frame2") {
    return [
      { x: 44, y: 110, w: 545, h: 720 },
      { x: 614, y: 110, w: 545, h: 720 },
      { x: 44, y: 860, w: 545, h: 720 },
      { x: 614, y: 860, w: 545, h: 720 },
    ];
  }

  const layouts = {
    1: [{ x: 170, y: 190, w: 860, h: 1100 }],
    2: [
      { x: 110, y: 150, w: 980, h: 610 },
      { x: 110, y: 800, w: 980, h: 610 },
    ],
    3: [
      { x: 110, y: 130, w: 980, h: 390 },
      { x: 110, y: 550, w: 980, h: 390 },
      { x: 110, y: 970, w: 980, h: 390 },
    ],
    4: [
      { x: 95, y: 115, w: 500, h: 640 },
      { x: 625, y: 115, w: 500, h: 640 },
      { x: 95, y: 790, w: 500, h: 640 },
      { x: 625, y: 790, w: 500, h: 640 },
    ],
  };

  return layouts[Math.min(customerState.maxPhotos, 4)] || layouts[4];
}

function renderCustomerPlaceholder() {
  const theme = customerThemes[customerState.theme];
  customerCtx.fillStyle = theme.bg;
  customerCtx.fillRect(0, 0, customerCanvas.width, customerCanvas.height);
  customerCtx.fillStyle = theme.ink;
  customerCtx.font = "700 58px Inter";
  customerCtx.textAlign = "center";
  customerCtx.fillText(`Chọn 1-${customerState.maxPhotos} ảnh`, customerCanvas.width / 2, customerCanvas.height / 2 - 18);
  customerCtx.font = "400 30px Inter";
  customerCtx.fillText("Upload frame PNG nếu muốn dùng frame riêng", customerCanvas.width / 2, customerCanvas.height / 2 + 34);
}

async function renderFramePreview() {
  if (!customerState.customFrame) {
    renderCustomerPlaceholder();
    return;
  }

  const frameImage = await loadCustomerImage(customerState.customFrame.src);
  customerCtx.fillStyle = "#ffffff";
  customerCtx.fillRect(0, 0, customerCanvas.width, customerCanvas.height);
  drawCustomerCover(frameImage, 0, 0, customerCanvas.width, customerCanvas.height);
}

function drawDefaultFrame(theme, title, subtitle) {
  customerCtx.strokeStyle = theme.accent;
  customerCtx.lineWidth = 10;
  customerCtx.strokeRect(46, 46, customerCanvas.width - 92, customerCanvas.height - 92);

  customerCtx.fillStyle = theme.accent;
  customerCtx.fillRect(90, 1505, 1020, 5);
  customerCtx.fillRect(90, 1604, 1020, 5);

  customerCtx.textAlign = "center";
  customerCtx.fillStyle = theme.ink;
  customerCtx.font = "700 96px Playfair Display, serif";
  customerCtx.fillText(title.toUpperCase(), customerCanvas.width / 2, 1584);

  customerCtx.fillStyle = theme.accent;
  customerCtx.font = "800 30px Inter";
  customerCtx.fillText(subtitle.toUpperCase(), customerCanvas.width / 2, 1668);

  customerCtx.fillStyle = theme.ink === "#f8f4ed" ? "#f8f4ed" : "#6f6359";
  customerCtx.font = "500 24px Inter";
  customerCtx.fillText(customerState.sessionCode, customerCanvas.width / 2, 1718);
}

async function renderCustomerCanvas(options = {}) {
  const selectedEntries = customerState.selectedIds
    .map((id, slotIndex) => ({ id, slotIndex, photo: customerState.photos.find((photo) => photo.id === id) }))
    .filter((entry) => entry.id && entry.photo);
  if (selectedEntries.length < 1) {
    await renderFramePreview();
    return;
  }

  if (selectedEntries.length > customerState.maxPhotos) {
    showCustomerToast(`Chỉ chọn tối đa ${customerState.maxPhotos} ảnh.`);
    return;
  }

  const theme = customerThemes[customerState.theme];
  const selectedPhotos = selectedEntries.map((entry) => entry.photo);
  if (selectedPhotos.some((photo) => getPhotoFilter(photo.id) === "learned")) {
    customerState.learnedCoefficients = await loadLearnedCoefficients();
  }
  const images = await Promise.all(selectedPhotos.map((photo) => loadCustomerImage(photoDisplaySrc(photo))));
  const frameImage = customerState.customFrame ? await loadCustomerImage(customerState.customFrame.src) : null;
  const keyedFrameImage = customerState.customFrame
    ? (customerState.customFrame.overlaySrc
      ? await loadCustomerImage(customerState.customFrame.overlaySrc)
      : await loadKeyedFrame(customerState.customFrame.src))
    : null;
  const title = document.querySelector("#customerFrameTitle").value.trim() || "GLAME BOOTH";
  const subtitle = document.querySelector("#customerFrameSubtitle").value.trim() || customerState.sessionCode;

  customerCtx.fillStyle = theme.bg;
  customerCtx.fillRect(0, 0, customerCanvas.width, customerCanvas.height);

  if (frameImage) {
    drawCustomerCover(frameImage, 0, 0, customerCanvas.width, customerCanvas.height);
  }

  if (!frameImage) {
    customerCtx.fillStyle = theme.panel;
    drawCustomerRoundedRect(90, 110, 1020, 1320, 24);
    customerCtx.fill();
  }

  const slotSet = getLayoutSlots();

  images.forEach((image, index) => {
    const slot = slotSet[selectedEntries[index].slotIndex] || slotSet[slotSet.length - 1];
    const photo = selectedPhotos[index];
    const adjustment = customerState.photoAdjustments[photo.id] || {};
    const selectedFilterKey = getPhotoFilter(photo.id);
    const filterKey = customerFilters[selectedFilterKey]?.processor && photo.filteredSrc ? "clean" : selectedFilterKey;
    customerCtx.save();
    drawCustomerRoundedRect(slot.x, slot.y, slot.w, slot.h, 18);
    customerCtx.clip();
    drawCustomerCover(image, slot.x, slot.y, slot.w, slot.h, adjustment, filterKey);
    customerCtx.restore();
  });

  if (keyedFrameImage) {
    drawCustomerCover(keyedFrameImage, 0, 0, customerCanvas.width, customerCanvas.height);
  } else {
    drawDefaultFrame(theme, title, subtitle);
  }

  customerState.rendered = true;
  if (!options.silent) {
    showCustomerToast("Đã ghép ảnh.");
  }
}

function renderCustomerPhotoGrid() {
  const grid = document.querySelector("#customerPhotoGrid");
  grid.innerHTML = "";
  updateCustomerCount();

  if (!customerState.photos.length) {
    grid.innerHTML = '<div class="empty-state">Demo hiện tại: import ảnh gốc tại đây. Bản thật sẽ tự tải ảnh từ phiên chụp.</div>';
    return;
  }

  const orderedPhotos = [...customerState.photos].sort((a, b) => {
    const aPinned = customerState.favoriteIds.includes(a.id) ? 1 : 0;
    const bPinned = customerState.favoriteIds.includes(b.id) ? 1 : 0;
    return bPinned - aPinned;
  });

  orderedPhotos.forEach((photo) => {
    const selectedIndex = customerState.selectedIds.indexOf(photo.id);
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = `photo-tile${selectedIndex >= 0 ? " is-selected" : ""}${photo.id === customerState.activePhotoId ? " is-active" : ""}`;
    tile.innerHTML = `
      <img src="${photoDisplaySrc(photo)}" alt="${photo.name}" style="filter: ${photoDisplayFilter(photo)}">
      <small>${photo.source === "edited" ? "Đã chỉnh" : "Gốc"}</small>
      ${selectedIndex >= 0 ? `<span>${selectedIndex + 1}</span>` : ""}
    `;
    tile.addEventListener("click", () => toggleCustomerPhoto(photo.id));
    grid.appendChild(tile);
  });
}

function renderCustomerPhotoGrid() {
  const grid = document.querySelector("#customerPhotoGrid");
  if (!grid) return;
  grid.innerHTML = "";
  updateCustomerCount();

  const composerPhotos = customerState.selectedIds
    .map((id) => customerState.photos.find((photo) => photo.id === id))
    .filter(Boolean);

  if (!composerPhotos.length) {
    grid.innerHTML = '<div class="empty-state">Chưa chọn ảnh nào để ghép frame.</div>';
    return;
  }

  composerPhotos.forEach((photo) => {
    const selectedIndex = customerState.selectedIds.indexOf(photo.id);
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = `photo-tile is-selected${photo.id === customerState.activePhotoId ? " is-active" : ""}`;
    tile.innerHTML = `
      <img src="${photoDisplaySrc(photo)}" alt="${photo.name}" style="filter: ${photoDisplayFilter(photo)}">
      <small>${photo.source === "edited" ? "Đã chỉnh" : "Gốc"}</small>
      <span>${selectedIndex + 1}</span>
    `;
    tile.addEventListener("click", () => {
      customerState.activePhotoId = photo.id;
      updateActivePhotoControls();
      renderCustomerPhotoGrid();
    });
    grid.appendChild(tile);
  });
}

function renderCustomerPhotoGrid() {
  const grid = document.querySelector("#customerPhotoGrid");
  if (!grid) return;
  grid.innerHTML = "";
  updateCustomerCount();

  if (!customerState.photos.length) {
    grid.innerHTML = '<div class="empty-state">Chưa có ảnh để ghép frame.</div>';
    return;
  }

  const orderedPhotos = [...customerState.photos].sort((a, b) => {
    const aPinned = customerState.favoriteIds.includes(a.id) ? 1 : 0;
    const bPinned = customerState.favoriteIds.includes(b.id) ? 1 : 0;
    return bPinned - aPinned;
  });

  orderedPhotos.forEach((photo) => {
    const selectedIndex = customerState.selectedIds.indexOf(photo.id);
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = `photo-tile${selectedIndex >= 0 ? " is-selected" : ""}${photo.id === customerState.activePhotoId ? " is-active" : ""}`;
    tile.innerHTML = `
      <img src="${photoDisplaySrc(photo)}" alt="${photo.name}" style="filter: ${photoDisplayFilter(photo)}">
      <small>${photo.source === "edited" ? "Đã chỉnh" : "Gốc"}</small>
      ${selectedIndex >= 0 ? `<span>${selectedIndex + 1}</span>` : ""}
    `;
    tile.addEventListener("click", () => usePhotoInComposer(photo.id));
    grid.appendChild(tile);
  });
}

async function usePhotoInComposer(id) {
  const existingIndex = customerState.selectedIds.indexOf(id);
  if (existingIndex >= 0) {
    customerState.activeSlotIndex = existingIndex;
    customerState.activePhotoId = id;
  } else {
    const activeIndex = Number.isInteger(customerState.activeSlotIndex) ? customerState.activeSlotIndex : -1;
    const emptyIndex = customerState.selectedIds.findIndex((photoId) => !photoId);
    if (activeIndex >= 0 && activeIndex < customerState.maxPhotos) {
      customerState.selectedIds[activeIndex] = id;
    } else if (emptyIndex >= 0) {
      customerState.selectedIds[emptyIndex] = id;
      customerState.activeSlotIndex = emptyIndex;
    } else if (customerState.selectedIds.length < customerState.maxPhotos) {
      customerState.selectedIds.push(id);
      customerState.activeSlotIndex = customerState.selectedIds.length - 1;
    } else {
      showCustomerToast("Chạm ảnh đang nằm trong frame trước, rồi chọn ảnh thay thế.");
      return;
    }
    customerState.activePhotoId = id;
  }
  customerState.rendered = false;
  renderCustomerPhotoGrid();
  updateActivePhotoControls();
  const selectedPhoto = customerState.photos.find((photo) => photo.id === id);
  if (selectedPhoto) await prepareFilteredPreview(selectedPhoto);
  if (customerState.selectedIds.length) {
    renderCustomerCanvas({ silent: true });
  } else {
    renderFramePreview();
  }
}

function removeActivePhotoFromFrame() {
  const slotIndex = Number.isInteger(customerState.activeSlotIndex)
    ? customerState.activeSlotIndex
    : customerState.selectedIds.indexOf(customerState.activePhotoId);
  if (slotIndex < 0 || slotIndex >= customerState.maxPhotos || !customerState.selectedIds[slotIndex]) {
    showCustomerToast("Chọn một ảnh trong frame trước khi xóa.");
    return;
  }
  customerState.selectedIds[slotIndex] = null;
  customerState.activePhotoId = null;
  customerState.rendered = false;
  renderCustomerPhotoGrid();
  updateActivePhotoControls();
  if (customerState.selectedIds.some(Boolean)) renderCustomerCanvas({ silent: true });
  else renderFramePreview();
}

function toggleCustomerPhoto(id) {
  const currentIndex = customerState.selectedIds.indexOf(id);
  if (currentIndex >= 0) {
    customerState.activePhotoId = id;
  } else {
    if (customerState.selectedIds.length >= customerState.maxPhotos) {
      showCustomerToast(`Chỉ chọn tối đa ${customerState.maxPhotos} ảnh.`);
      return;
    }
    customerState.selectedIds.push(id);
    customerState.activePhotoId = id;
  }

  customerState.rendered = false;
  renderCustomerPhotoGrid();
  updateActivePhotoControls();
}

function addCustomerFiles(files, source) {
  files
    .filter((file) => file.type.startsWith("image/"))
    .forEach((file) => {
      customerState.photos.push({
        id: makeCustomerId("local-photo"),
        name: file.name,
        src: URL.createObjectURL(file),
        source,
      });
    });

  customerState.rendered = false;
  renderRawPhotoGrid();
  renderCustomerPhotoGrid();
}

async function autoFillCurrentFrame() {
  if (!customerState.photos.length) return;
  const ordered = [...customerState.photos].sort((a, b) => {
    const aPinned = customerState.favoriteIds.includes(a.id) ? 1 : 0;
    const bPinned = customerState.favoriteIds.includes(b.id) ? 1 : 0;
    return bPinned - aPinned;
  });
  const chosen = ordered.slice(0, customerState.maxPhotos);
  customerState.selectedIds = Array(customerState.maxPhotos).fill(null);
  chosen.forEach((photo, index) => { customerState.selectedIds[index] = photo.id; });
  customerState.activeSlotIndex = 0;
  customerState.activePhotoId = chosen[0]?.id || null;
  customerState.rendered = false;
  renderCustomerPhotoGrid();
  updateActivePhotoControls();
  showCustomerToast("Đang tự động ghép ảnh...");
  await Promise.all(chosen.map((photo) => prepareFilteredPreview(photo)));
  await renderCustomerCanvas({ silent: true });
}

function downloadSelectedCustomerPhotos() {
  if (!customerState.selectedIds.length) {
    showCustomerToast("Chọn ảnh muốn tải trước.");
    return;
  }

  customerState.selectedIds.forEach((id, index) => {
    const photo = customerState.photos.find((item) => item.id === id);
    if (!photo) return;

    window.setTimeout(() => {
      downloadPhotoFile(photo);
    }, index * 180);
  });

  showCustomerToast("Đang tải ảnh đã chọn.");
}

async function downloadAllCustomerPhotos() {
  if (!customerState.photos.length) {
    showCustomerToast("Chưa có ảnh để tải.");
    return;
  }

  showCustomerToast("Đang chuẩn bị tất cả ảnh...");
  try {
    const files = await Promise.all(customerState.photos.map((photo, index) => {
      const source = photo.src;
      const name = (photo.name || `${customerState.sessionCode}-${index + 1}.jpg`).replace(/[^a-zA-Z0-9._-]+/g, "-");
      return sourceToFile(source, name);
    }));
    await shareImageFiles(files, customerState.photos[0]?.src);
  } catch {
    showCustomerToast("Chưa thể chuẩn bị tất cả ảnh. Hãy lưu từng ảnh.");
  }
}

async function downloadCustomerCanvas() {
  const completed = Array.isArray(customerState.completedFinals) ? customerState.completedFinals : [];
  const savedFinal = completed[completed.length - 1];

  if (savedFinal?.url) {
    const file = await sourceToFile(savedFinal.url, savedFinal.fileName || `${customerState.sessionCode}-final.png`);
    await shareImageFiles([file], savedFinal.url);
    return;
  }

  if (!customerState.rendered) await renderCustomerCanvas({ silent: true });
  if (!customerState.rendered) return;

  customerCanvas.toBlob(async (blob) => {
    if (!blob) return;
    const name = `${customerState.sessionCode}-final-${String(customerState.currentFinalIndex || 1).padStart(2, "0")}.png`;
    const file = new File([blob], name, { type: "image/png" });
    await shareImageFiles([file], URL.createObjectURL(blob));
  }, "image/png");
}

function requestAutoEdit() {
  if (!customerState.selectedIds.length) {
    showCustomerToast("Chọn ảnh raw cần chỉnh trước.");
    return;
  }

  updateSessionStatus("RETOUCH_REQUESTED", {
    retouchCount: customerState.selectedIds.length,
    retouchLevel: "Tự nhiên",
    retouchNote: "Khách yêu cầu chỉnh sửa tự động trước khi ghép frame.",
  });
  showCustomerToast("Đã gửi yêu cầu chỉnh sửa tự động cho nhân viên.");
}

function mockRawZipDownload() {
  const { session } = getCurrentSession();
  const rawCount = session?.rawCount || customerState.photos.filter((photo) => photo.source === "original").length;
  if (!rawCount) {
    showCustomerToast("Chưa có ảnh raw để tạo ZIP.");
    return;
  }
  showCustomerToast("Demo: ZIP ảnh gốc sẽ do Local Agent tạo trong bản thật.");
}

async function sendFinalToPrintStaff() {
  const requiredPhotos = Math.max(1, Number(customerState.maxPhotos || 1));
  const filledPhotos = customerState.selectedIds.filter(Boolean).length;
  if (filledPhotos < requiredPhotos) {
    showCustomerToast(`Cần ghép đủ ${requiredPhotos} ảnh trước khi tiếp tục.`);
    syncComposerContinueButton();
    return;
  }
  if (!customerState.rendered) {
    await renderCustomerCanvas({ silent: true });
  }

  if (!customerState.rendered) return;
  updateSessionStatus("SENT_TO_PRINT_STAFF", {
    finalFile: `${customerState.sessionCode}_final_01.jpg`,
    finalExportedAt: new Date().toISOString(),
  });
  showCustomerToast("File final đã chuyển cho nhân viên in.");
}

async function sendFinalToPrintStaff() {
  const requiredPhotos = Math.max(1, Number(customerState.maxPhotos || 1));
  const filledPhotos = customerState.selectedIds.filter(Boolean).length;
  if (filledPhotos < requiredPhotos) {
    showCustomerToast(`Cần ghép đủ ${requiredPhotos} ảnh trước khi tiếp tục.`);
    syncComposerContinueButton();
    return;
  }
  if (!customerState.rendered) {
    await renderCustomerCanvas({ silent: true });
  }

  if (!customerState.rendered) return;

  const { session } = getCurrentSession();
  const printCount = Math.max(1, Number(session?.printCount || customerState.printCount || 1));
  const existingJobs = Array.isArray(session?.finalJobs) ? session.finalJobs : customerState.completedFinals || [];
  const finalIndex = Math.min(printCount, Math.max(1, Number(customerState.currentFinalIndex || existingJobs.length + 1)));
  const printTicket = session?.ticket || customerState.sessionCode;
  const finalFileName = customerState.sessionCode + "_final_" + String(finalIndex).padStart(2, "0") + ".png";
  let finalJob = {
    index: finalIndex,
    printCode: printTicket,
    fileName: finalFileName,
    frameId: customerState.customFrame?.id || "custom",
    photoIds: customerState.selectedIds.filter(Boolean),
    createdAt: new Date().toISOString(),
  };

  try {
    const response = await fetch("/api/final", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: customerState.sessionCode,
        finalIndex,
        image: customerCanvas.toDataURL("image/png"),
      }),
    });
    if (response.ok) {
      const saved = await response.json();
      finalJob = {
        ...finalJob,
        fileName: saved.fileName || finalJob.fileName,
        url: saved.url,
        localPath: saved.localPath,
      };
    }
  } catch {
    // Keep the handoff working even if local file saving fails.
  }

  const finalJobs = existingJobs
    .filter((job) => Number(job.index) !== finalIndex)
    .concat(finalJob)
    .map((job) => ({ ...job, printCode: printTicket }))
    .sort((a, b) => Number(a.index || 0) - Number(b.index || 0));
  const completedCount = Math.min(finalJobs.length, printCount);
  const nextStatus = completedCount >= printCount ? "FINAL_READY" : "RAW_READY";

  updateSessionStatus(nextStatus, {
    printCount,
    finalJobs,
    finalCount: completedCount,
    finalFile: finalJob.fileName,
    finalUrl: finalJob.url,
    finalLocalPath: finalJob.localPath,
    finalExportedAt: finalJob.createdAt,
  });

  customerState.printCount = printCount;
  customerState.completedFinals = finalJobs;
  customerState.currentFinalIndex = Math.min(printCount, completedCount + 1);
  updateFinalProgress();

  if (completedCount < printCount) {
    customerState.selectedIds = [];
    customerState.activePhotoId = null;
    customerState.rendered = false;
    renderFramePreview();
    setCustomerStage("frame");
    showCustomerToast(`Đã gửi mã in ${finalJob.printCode}. Chọn frame tiếp theo.`);
    return;
  }

  const printCodes = printTicket;
  setCustomerStage("final");
  showCustomerToast("Đã ghép đủ ảnh. Bạn có thể tải ảnh hoặc tiếp tục yêu cầu in.");
}

let composerRenderFrame = 0;
let composerRenderInFlight = false;
let composerRenderQueued = false;

function rerenderIfPossible() {
  customerState.rendered = false;
  if (!customerState.selectedIds.some(Boolean)) return;
  if (composerRenderFrame) return;
  composerRenderFrame = requestAnimationFrame(async () => {
    composerRenderFrame = 0;
    if (composerRenderInFlight) {
      composerRenderQueued = true;
      return;
    }
    composerRenderInFlight = true;
    await renderCustomerCanvas({ silent: true });
    composerRenderInFlight = false;
    if (composerRenderQueued) {
      composerRenderQueued = false;
      rerenderIfPossible();
    }
  });
}

function getCanvasPoint(event) {
  const rect = customerCanvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * customerCanvas.width,
    y: ((event.clientY - rect.top) / rect.height) * customerCanvas.height,
  };
}

function getClientDistance(pointA, pointB) {
  return Math.hypot(pointA.clientX - pointB.clientX, pointA.clientY - pointB.clientY);
}

function getGestureCenter(points) {
  const rect = customerCanvas.getBoundingClientRect();
  const clientX = (points[0].clientX + points[1].clientX) / 2;
  const clientY = (points[0].clientY + points[1].clientY) / 2;
  return {
    x: ((clientX - rect.left) / rect.width) * customerCanvas.width,
    y: ((clientY - rect.top) / rect.height) * customerCanvas.height,
  };
}

function getActiveSlot() {
  const activeIndex = Number.isInteger(customerState.activeSlotIndex)
    ? customerState.activeSlotIndex
    : customerState.selectedIds.indexOf(customerState.activePhotoId);
  if (activeIndex < 0) return null;
  const slots = getLayoutSlots();
  return slots[activeIndex] || null;
}

function startPinchGesture() {
  if (previewGesture.pointers.size !== 2) return;
  const points = [...previewGesture.pointers.values()];
  const center = getGestureCenter(points);
  activatePhotoAtCanvasPoint(center);
  const adjustment = getActiveAdjustment();
  if (!adjustment) return;
  previewGesture.lastDistance = getClientDistance(points[0], points[1]);
  previewGesture.startZoom = adjustment.zoom || 1;
  previewGesture.startAdjustment = {
    x: adjustment.x || 0,
    y: adjustment.y || 0,
  };
  previewGesture.startCenter = center;
}

function activatePhotoAtCanvasPoint(point) {
  const slots = getLayoutSlots();
  const index = slots.findIndex((slot) => (
    point.x >= slot.x &&
    point.x <= slot.x + slot.w &&
    point.y >= slot.y &&
    point.y <= slot.y + slot.h
  ));

  if (index < 0 || index >= customerState.maxPhotos) {
    return false;
  }

  customerState.activeSlotIndex = index;
  customerState.activePhotoId = customerState.selectedIds[index] || null;
  updateActivePhotoControls();
  renderCustomerPhotoGrid();
  return true;
}

function handlePreviewPointerDown(event) {
  if (!customerState.selectedIds.length) return;
  customerCanvas.setPointerCapture(event.pointerId);
  previewGesture.pointers.set(event.pointerId, event);

  const point = getCanvasPoint(event);
  activatePhotoAtCanvasPoint(point);
  previewGesture.lastPoint = point;
  previewGesture.singlePointerMode = "drag";
  event.preventDefault();

  if (previewGesture.pointers.size === 2) {
    event.preventDefault();
    startPinchGesture();
  }
}

function handlePreviewPointerMove(event) {
  if (!previewGesture.pointers.has(event.pointerId)) return;
  previewGesture.pointers.set(event.pointerId, event);

  const adjustment = getActiveAdjustment();
  if (!adjustment) return;

  if (previewGesture.pointers.size === 1) {
    const point = getCanvasPoint(event);
    if (previewGesture.lastPoint) {
      const deltaX = point.x - previewGesture.lastPoint.x;
      const deltaY = point.y - previewGesture.lastPoint.y;
      if (Math.hypot(deltaX, deltaY) > 1) {
        event.preventDefault();
        adjustment.x += deltaX;
        adjustment.y += deltaY;
        updateActivePhotoControls();
        rerenderIfPossible();
      }
    }
    previewGesture.lastPoint = point;
  }

  if (previewGesture.pointers.size === 2 && previewGesture.lastDistance) {
    event.preventDefault();
    const points = [...previewGesture.pointers.values()];
    const distance = getClientDistance(points[0], points[1]);
    const center = getGestureCenter(points);
    const nextZoom = previewGesture.startZoom * (distance / previewGesture.lastDistance);
    const oldZoom = previewGesture.startZoom || 1;
    const nextClampedZoom = Math.min(2.5, Math.max(1, nextZoom));
    const startAdjustment = previewGesture.startAdjustment || { x: adjustment.x || 0, y: adjustment.y || 0 };
    const startCenter = previewGesture.startCenter || center;
    const activeSlot = getActiveSlot();
    const ratio = nextClampedZoom / oldZoom;
    adjustment.zoom = nextClampedZoom;
    if (activeSlot) {
      const slotCenterX = activeSlot.x + activeSlot.w / 2;
      const slotCenterY = activeSlot.y + activeSlot.h / 2;
      adjustment.x = center.x - slotCenterX - ratio * (startCenter.x - slotCenterX - startAdjustment.x);
      adjustment.y = center.y - slotCenterY - ratio * (startCenter.y - slotCenterY - startAdjustment.y);
    }
    updateActivePhotoControls();
    rerenderIfPossible();
  }
}

function handlePreviewPointerEnd(event) {
  previewGesture.pointers.delete(event.pointerId);
  if (previewGesture.pointers.size === 0) {
    previewGesture.lastPoint = null;
    previewGesture.lastDistance = null;
    previewGesture.startAdjustment = null;
    previewGesture.startCenter = null;
    previewGesture.singlePointerMode = null;
  }
  if (previewGesture.pointers.size === 1) {
    const remaining = [...previewGesture.pointers.values()][0];
    previewGesture.lastPoint = getCanvasPoint(remaining);
    previewGesture.lastDistance = null;
    previewGesture.startAdjustment = null;
    previewGesture.startCenter = null;
    previewGesture.singlePointerMode = null;
  }
}

function adjustActivePhoto(action) {
  const adjustment = getActiveAdjustment();
  if (!adjustment) {
    showCustomerToast("Chọn một ảnh trước khi chỉnh vị trí.");
    return;
  }

  const step = 24;
  if (action === "left") adjustment.x -= step;
  if (action === "right") adjustment.x += step;
  if (action === "up") adjustment.y -= step;
  if (action === "down") adjustment.y += step;
  if (action === "reset") {
    adjustment.x = 0;
    adjustment.y = 0;
    adjustment.zoom = 1;
  }

  updateActivePhotoControls();
  rerenderIfPossible();
}

function selectActiveFilter(filterKey) {
  if (!customerFilters[filterKey]) return;
  if (!customerState.activePhotoId || !customerState.selectedIds.includes(customerState.activePhotoId)) {
    showCustomerToast("Chọn một ảnh trong frame trước khi đổi filter.");
    return;
  }

  customerState.photoFilters[customerState.activePhotoId] = filterKey;
  updateActivePhotoControls();
  renderCustomerPhotoGrid();
  rerenderIfPossible();
}

function applyActiveFilterToSelected() {
  if (!customerState.selectedIds.length) {
    showCustomerToast("Chọn ảnh trước khi áp filter.");
    return;
  }

  const filterKey = customerState.activePhotoId && customerState.selectedIds.includes(customerState.activePhotoId)
    ? getPhotoFilter(customerState.activePhotoId)
    : customerState.copiedFilter;
  if (!customerFilters[filterKey]) {
    showCustomerToast("Chưa có filter mẫu để áp.");
    return;
  }

  customerState.selectedIds.forEach((id) => {
    customerState.photoFilters[id] = filterKey;
  });
  updateActivePhotoControls();
  renderCustomerPhotoGrid();
  rerenderIfPossible();
  showCustomerToast("Đã áp filter cho tất cả ảnh đã chọn.");
}

function selectPresetFrame(frameId) {
  if (customerState.allowedFrames?.length && !customerState.allowedFrames.includes(frameId)) {
    showCustomerToast("Frame nay khong nam trong goi chup da chon.");
    return;
  }
  const frame = presetFrames[frameId];
  if (!frame) return;

  customerState.customFrame = frame;
  customerState.maxPhotos = frame.maxPhotos;
  customerState.selectedIds = customerState.selectedIds.slice(0, customerState.maxPhotos);
  if (!customerState.selectedIds.includes(customerState.activePhotoId)) {
    customerState.activePhotoId = customerState.selectedIds[0] || null;
  }
  customerState.rendered = false;

  document.querySelectorAll(".preset-frame").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.frame === frameId);
  });
  document.querySelector("#customerFrameNote").textContent = `Đang dùng frame: ${frame.name}`;

  updateCustomerCount();
  updateActivePhotoControls();
  renderCustomerPhotoGrid();
  if (customerState.selectedIds.some(Boolean)) {
    renderCustomerCanvas({ silent: true });
  } else {
    renderFramePreview();
  }
}

function updateAvailableFrames() {
  const allowed = customerState.allowedFrames?.length ? customerState.allowedFrames : ["frame1", "frame2"];
  renderPresetFrameButtons();
  const preferredFrame = allowed.includes(customerState.defaultFrameId) ? customerState.defaultFrameId : allowed[0];
  if (customerState.currentStage === "raw" && customerState.defaultFrameId) {
    selectPresetFrame(preferredFrame);
  } else if (customerState.customFrame?.id && !allowed.includes(customerState.customFrame.id)) {
    customerState.customFrame = null;
  }
}

document.querySelector("#customerSessionCode").textContent = customerState.sessionCode;

document.querySelector("#customerPhotoInput").addEventListener("change", (event) => {
  const files = [...event.target.files].filter((file) => file.type.startsWith("image/"));
  addCustomerFiles(files, "original");
  event.target.value = "";
  showCustomerToast(`Đã import ${files.length} ảnh gốc.`);
});

document.querySelector("#customerEditedInput").addEventListener("change", (event) => {
  const files = [...event.target.files].filter((file) => file.type.startsWith("image/"));
  addCustomerFiles(files, "edited");
  event.target.value = "";
  showCustomerToast(`Đã import ${files.length} ảnh đã chỉnh.`);
});

document.querySelector("#composerUploadInput")?.addEventListener("change", (event) => {
  const files = [...event.target.files].filter((file) => file.type.startsWith("image/"));
  const previousIds = new Set(customerState.photos.map((photo) => photo.id));
  addCustomerFiles(files, "edited");
  const importedIds = customerState.photos.filter((photo) => !previousIds.has(photo.id)).map((photo) => photo.id);
  customerState.favoriteIds = [...importedIds, ...customerState.favoriteIds.filter((id) => !importedIds.includes(id))];
  renderCustomerPhotoGrid();
  event.target.value = "";
  showCustomerToast(`Đã thêm ${importedIds.length} ảnh đã chỉnh.`);
});

document.querySelector("#autoFillFrameBtn")?.addEventListener("click", autoFillCurrentFrame);

document.querySelector("#customerFrameInput").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file || !file.type.startsWith("image/")) return;

  if (customerState.customFrame) {
    URL.revokeObjectURL(customerState.customFrame.src);
  }

  customerState.customFrame = {
    name: file.name,
    src: URL.createObjectURL(file),
  };
  customerState.rendered = false;
  document.querySelector("#customerFrameNote").textContent = `Đang dùng frame: ${file.name}`;
  document.querySelectorAll(".preset-frame").forEach((button) => button.classList.remove("is-selected"));
  showCustomerToast("Đã import frame.");
  if (customerState.selectedIds.some(Boolean)) {
    renderCustomerCanvas();
  } else {
    renderFramePreview();
  }
});

document.querySelector("#customerFrameSwatches").addEventListener("click", (event) => {
  const swatch = event.target.closest(".swatch");
  if (!swatch) return;

  document.querySelectorAll("#customerFrameSwatches .swatch").forEach((item) => item.classList.remove("is-selected"));
  swatch.classList.add("is-selected");
  customerState.theme = swatch.dataset.theme;
  customerState.rendered = false;
  if (customerState.selectedIds.some(Boolean)) {
    renderCustomerCanvas();
  } else {
    renderCustomerPlaceholder();
  }
});

document.querySelector("#customerFrameTitle").addEventListener("input", () => {
  customerState.rendered = false;
});

document.querySelector("#customerFrameSubtitle").addEventListener("input", () => {
  customerState.rendered = false;
});

document.querySelector("#customerRenderBtn").addEventListener("click", renderCustomerCanvas);
document.querySelector("#customerDownloadBtn").addEventListener("click", downloadCustomerCanvas);
document.querySelector("#customerDownloadFinalBtn")?.addEventListener("click", downloadCustomerCanvas);
document.querySelector("#customerRequestPrintBtn")?.addEventListener("click", () => {
  const total = Math.max(1, Number(customerState.printCount || 1));
  const done = Array.isArray(customerState.completedFinals) ? customerState.completedFinals.length : 0;
  if (done < total) {
    setCustomerStage("frame");
    return;
  }
  const confirm = document.querySelector("#customerPrintConfirm");
  if (confirm) confirm.hidden = false;
});
document.querySelector("#customerCancelPrintBtn")?.addEventListener("click", () => {
  const confirm = document.querySelector("#customerPrintConfirm");
  if (confirm) confirm.hidden = true;
});
document.querySelector("#customerConfirmPrintBtn")?.addEventListener("click", () => {
  const confirm = document.querySelector("#customerPrintConfirm");
  if (confirm) confirm.hidden = true;
  updateSessionStatus("SENT_TO_PRINT_STAFF", { printRequestedAt: new Date().toISOString() });
  const code = document.querySelector("#customerResultPrintCode");
  const title = document.querySelector("#customerResultTitle");
  const copy = document.querySelector("#customerResultCopy");
  const button = document.querySelector("#customerRequestPrintBtn");
  const backButton = document.querySelector("#customerBackToEditBtn");
  if (code) code.hidden = false;
  if (title) title.textContent = "Mã lượt in";
  if (copy) copy.textContent = "Khách hàng vui lòng liên hệ nhân viên tại quầy để nhận ảnh.";
  if (button) button.hidden = true;
  if (backButton) backButton.hidden = true;
});
document.querySelector("#customerBackToEditBtn")?.addEventListener("click", () => {
  setCustomerStage("composer");
});
document.querySelector("#sendPrintBtn").addEventListener("click", sendFinalToPrintStaff);
document.querySelector("#requestAutoEditBtn").addEventListener("click", requestAutoEdit);
document.querySelector("#rawZipBtn").addEventListener("click", mockRawZipDownload);
document.querySelector("#customerDownloadSelectedBtn").addEventListener("click", downloadSelectedCustomerPhotos);
document.querySelector("#customerDownloadAllBtn").addEventListener("click", downloadAllCustomerPhotos);
document.querySelector("#goComposerBtn").addEventListener("click", () => {
  if (!customerState.photos.length) {
    showCustomerToast("Chưa có ảnh để ghép frame.");
    return;
  }
  setCustomerStage("frame");
});
document.querySelector("#backRawFromFrameBtn")?.addEventListener("click", () => setCustomerStage("raw"));
document.querySelector("#backToFrameBtn")?.addEventListener("click", () => setCustomerStage("frame"));
document.querySelector("#goComposerFromFrameBtn")?.addEventListener("click", () => {
  if (!customerState.photos.length) {
    showCustomerToast("Chua co anh de ghep frame.");
    return;
  }
  if (!customerState.customFrame?.id) {
    showCustomerToast("Vui lòng chọn một frame trước khi ghép ảnh.");
    return;
  }
  if (!customerState.selectedIds.length) {
    customerState.selectedIds = Array(customerState.maxPhotos).fill(null);
    customerState.activeSlotIndex = 0;
    customerState.activePhotoId = null;
    customerState.rendered = false;
  }
  renderFramePreview();
  setCustomerStage("composer");
});
document.querySelector("#viewerCloseBtn").addEventListener("click", closePhotoViewer);
document.querySelector("#viewerCloseIconBtn")?.addEventListener("click", closePhotoViewer);
document.querySelector("#viewerFavoriteBtn")?.addEventListener("click", () => {
  if (!customerState.viewerPhotoId) return;
  toggleSelectedPhoto(customerState.viewerPhotoId);
  updateViewerFavoriteButton();
});
document.querySelector("#removeActivePhotoBtn")?.addEventListener("click", removeActivePhotoFromFrame);
document.querySelector("#photoViewer").addEventListener("click", (event) => {
  if (event.target.id === "photoViewer") closePhotoViewer();
});
document.querySelector("#viewerDownloadBtn").addEventListener("click", () => {
  const photo = customerState.photos.find((item) => item.id === customerState.viewerPhotoId);
  downloadPhotoFile(photo);
});
document.querySelectorAll("[data-adjust]").forEach((button) => {
  button.addEventListener("click", () => adjustActivePhoto(button.dataset.adjust));
});
document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => selectActiveFilter(button.dataset.filter));
});
document.querySelector("#filterSampleInput").addEventListener("change", (event) => {
  loadSampleFilter(event.target.files[0]);
  event.target.value = "";
});
document.querySelector("#applyFilterAllBtn").addEventListener("click", applyActiveFilterToSelected);
document.querySelector("#photoZoomInput").addEventListener("input", (event) => {
  const adjustment = getActiveAdjustment();
  if (!adjustment) return;
  adjustment.zoom = Number(event.target.value);
  rerenderIfPossible();
});
document.querySelector("#mobileZoomInput").addEventListener("input", (event) => {
  const adjustment = getActiveAdjustment();
  if (!adjustment) {
    showCustomerToast("Chọn một ảnh trước khi zoom.");
    event.target.value = "1";
    return;
  }
  adjustment.zoom = Number(event.target.value);
  updateActivePhotoControls();
  rerenderIfPossible();
});
document.querySelectorAll(".preset-frame").forEach((button) => {
  button.addEventListener("click", () => selectPresetFrame(button.dataset.frame));
});
customerCanvas.addEventListener("pointerdown", handlePreviewPointerDown);
customerCanvas.addEventListener("pointermove", handlePreviewPointerMove);
customerCanvas.addEventListener("pointerup", handlePreviewPointerEnd);
customerCanvas.addEventListener("pointercancel", handlePreviewPointerEnd);

async function bootCustomerPage() {
  if (!customerState.sessionCode) {
    window.location.replace("checkin.html");
    return;
  }
  const savedDraft = loadCustomerDraft();
  renderCustomerPlaceholder();
  updateActivePhotoControls();
  updateFinalProgress();
  setCustomerStage("raw");
  await refreshCustomerSessionView();
  renderPresetFrameButtons();
  if (savedDraft?.frameId && customerState.allowedFrames.includes(savedDraft.frameId)) {
    selectPresetFrame(savedDraft.frameId);
  } else if (customerState.defaultFrameId && customerState.allowedFrames.includes(customerState.defaultFrameId)) {
    selectPresetFrame(customerState.defaultFrameId);
  }
  const restorableStage = ["raw", "frame", "composer"].includes(savedDraft?.currentStage) ? savedDraft.currentStage : "raw";
  const { session } = getCurrentSession();
  if (!["FINAL_READY", "SENT_TO_PRINT_STAFF", "PRINTED", "COMPLETED"].includes(session?.status)) {
    setCustomerStage(restorableStage);
  }
  window.setInterval(refreshCustomerSessionView, 2000);
  window.setInterval(persistCustomerDraft, 1000);
}

window.addEventListener("pagehide", persistCustomerDraft);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") persistCustomerDraft();
  else refreshCustomerSessionView();
});

bootCustomerPage();
