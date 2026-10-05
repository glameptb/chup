const STORAGE_KEY = "glame-local-sessions-v1";
const API_STATE_URL = "/api/state";
const API_INCOMING_URL = "/api/incoming";
const PACKAGE_SETTINGS_KEY = "glame-package-settings-v1";
const DELETED_FRAME_IDS_KEY = "glame-deleted-frame-ids-v1";
const DASHBOARD_VIEW_KEY = "glame-dashboard-view";
const REVENUE_RANGE_KEY = "glame-revenue-range";
const retouchFolderDrafts = new Map();
const birthdayDrafts = new Map();
let importingRetouchSessionId = "";
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
  "3": { id: "3", name: "Gói 3 phút", minutes: 3, price: 99000, printCount: 1, frameSlots: 4, defaultFrameId: "frame1", allowedFrames: ["frame1"], frames: "Basic", autoEdit: "Không gồm quán chỉnh ảnh" },
  "5": { id: "5", name: "Gói 5 phút", minutes: 5, price: 149000, printCount: 2, frameSlots: 4, defaultFrameId: "frame1", allowedFrames: ["frame1", "frame2"], frames: "Basic + Standard", autoEdit: "Có thể yêu cầu quán chỉnh ảnh" },
  "10": { id: "10", name: "Gói 10 phút", minutes: 10, price: 249000, printCount: 3, frameSlots: 4, defaultFrameId: "frame1", allowedFrames: ["frame1", "frame2"], frames: "Tất cả frame", autoEdit: "Có tùy chọn quán chỉnh ảnh" },
};

const defaultFrameCatalog = [
  { id: "frame1", name: "ChanBaek Rainbow", src: "assets/frame1-2.png", maxPhotos: 4 },
  { id: "frame2", name: "ChanBaek Red", src: "assets/frame2-2.png", maxPhotos: 4 },
];

const uploadedFrameSlots = [
  { x: 40, y: 328, w: 516, h: 308 },
  { x: 40, y: 656, w: 516, h: 308 },
  { x: 40, y: 984, w: 516, h: 308 },
  { x: 40, y: 1312, w: 516, h: 308 },
  { x: 644, y: 308, w: 512, h: 320 },
  { x: 676, y: 660, w: 432, h: 372 },
  { x: 644, y: 1060, w: 512, h: 340 },
];

const frameSlotColors = ["#ff4f7b", "#34c6ff", "#ffc84d", "#77dd77", "#b388ff", "#ff8a3d", "#36d1c4", "#f56bdc"];
const frameClamp = (value, min, max) => Math.min(max, Math.max(min, value));

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
  RETOUCH_REQUESTED: "Khách yêu cầu quán chỉnh",
  RETOUCH_IN_PROGRESS: "Đang chỉnh bằng MagiMir",
  RETOUCH_READY: "Ảnh MagiMir đã gửi khách",
  FINAL_EXPORTED: "Đã xuất final",
  SENT_TO_PRINT_STAFF: "Chờ nhân viên in",
  PRINTED: "Đã in",
  ZIP_READY: "ZIP sẵn sàng",
  COMPLETED: "Hoàn tất",
  REFUNDED: "Đã hoàn tiền",
  CAMERA_ERROR: "Lỗi camera",
};

Object.assign(packages["3"], { name: "Gói 3 phút", autoEdit: "Không gồm quán chỉnh ảnh" });
Object.assign(packages["5"], { name: "Gói 5 phút", autoEdit: "Có thể yêu cầu quán chỉnh ảnh" });
Object.assign(packages["10"], { name: "Gói 10 phút", frames: "Tất cả frame", autoEdit: "Có tùy chọn quán chỉnh ảnh" });
Object.assign(statusLabels, {
  CHECKED_IN: "Đã check-in",
  PAYMENT_PENDING: "Chờ thanh toán",
  PAYMENT_CASH_PENDING: "Chờ duyệt thanh toán",
  WAITING: "Đang chờ",
  CALLING: "Đang gọi",
  NO_SHOW: "Vắng mặt",
  REJOINED_QUEUE: "Vào lại hàng chờ",
  READY_TO_SHOOT: "Sẵn sàng chụp",
  SHOOTING: "Đang chụp",
  PAUSED: "Tạm dừng",
  RAW_READY: "Ảnh raw sẵn sàng",
  RETOUCH_REQUESTED: "Khách yêu cầu quán chỉnh",
  RETOUCH_IN_PROGRESS: "Đang chỉnh bằng MagiMir",
  RETOUCH_READY: "Ảnh MagiMir đã gửi khách",
  FINAL_READY: "Đã ghép đủ frame",
  FINAL_EXPORTED: "Đã xuất final",
  SENT_TO_PRINT_STAFF: "Chờ nhân viên in",
  PRINTED: "Đã in",
  ZIP_READY: "ZIP sẵn sàng",
  COMPLETED: "Hoàn tất",
  REFUNDED: "Đã hoàn tiền",
  CAMERA_ERROR: "Lỗi camera",
});

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
let packageSettingsSaveTimer = null;

function loadPackageSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(PACKAGE_SETTINGS_KEY));
    if (!stored || typeof stored !== "object") return;
    Object.entries(stored).forEach(([id, patch]) => {
      if (!packages[id]) {
        packages[id] = {
          id,
          name: patch.name || `Goi ${Number(patch.minutes || 3)} phut`,
          minutes: Math.max(1, Number(patch.minutes || 3)),
          price: Math.max(0, Number(patch.price || 0)),
          printCount: 1,
          frameSlots: 4,
          defaultFrameId: null,
          allowedFrames: [],
          printFrameIds: [],
          frames: "",
          autoEdit: "",
        };
      }
      packages[id] = {
        ...packages[id],
        name: patch.name || packages[id].name,
        minutes: Math.max(1, Number(patch.minutes || packages[id].minutes || 3)),
        price: Math.max(0, Number(patch.price ?? packages[id].price ?? 0)),
        printCount: Math.max(1, Number(patch.printCount || packages[id].printCount || 1)),
        frameSlots: Math.max(1, Number(patch.frameSlots || packages[id].frameSlots || 4)),
        defaultFrameId: Object.prototype.hasOwnProperty.call(patch, "defaultFrameId") ? patch.defaultFrameId : packages[id].defaultFrameId,
        allowedFrames: Array.isArray(patch.allowedFrames) ? patch.allowedFrames : packages[id].allowedFrames,
        printFrameIds: [],
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
      name: pack.name,
      minutes: Math.max(1, Number(pack.minutes || 3)),
      price: pack.price,
      printCount: pack.printCount || 1,
      frameSlots: pack.frameSlots || 4,
      defaultFrameId: pack.defaultFrameId || null,
      optionalFrames: (pack.allowedFrames || []).filter((frameId) => frameId !== pack.defaultFrameId),
      allowedFrames: pack.allowedFrames || ["frame1", "frame2"],
      printFrameIds: [],
      frameCatalog: getPackageFrameCatalog(pack),
    };
  });
  localStorage.setItem(PACKAGE_SETTINGS_KEY, JSON.stringify(data));
  if (state) {
    state.packageSettings = data;
    saveState();
  }
}

function schedulePackageSettingsSave() {
  window.clearTimeout(packageSettingsSaveTimer);
  const data = Object.fromEntries(Object.values(packages).map((pack) => [pack.id, {
    name: pack.name,
    minutes: Math.max(1, Number(pack.minutes || 3)),
    price: Math.max(0, Number(pack.price || 0)),
    printCount: pack.printCount || 1,
    frameSlots: pack.frameSlots || 4,
    defaultFrameId: pack.defaultFrameId || null,
    allowedFrames: pack.allowedFrames || [],
    printFrameIds: [],
    frameCatalog: getPackageFrameCatalog(pack),
  }]));
  localStorage.setItem(PACKAGE_SETTINGS_KEY, JSON.stringify(data));
  if (state) state.packageSettings = data;
  packageSettingsSaveTimer = window.setTimeout(() => savePackageSettings(), 500);
}

function getDeletedFrameIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(DELETED_FRAME_IDS_KEY) || "[]");
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    localStorage.removeItem(DELETED_FRAME_IDS_KEY);
    return new Set();
  }
}

function saveDeletedFrameIds(ids) {
  localStorage.setItem(DELETED_FRAME_IDS_KEY, JSON.stringify([...ids]));
}

function getPackageFrameCatalog(pack) {
  const deleted = getDeletedFrameIds();
  const custom = Array.isArray(pack.frameCatalog) ? pack.frameCatalog : [];
  const byId = new Map(defaultFrameCatalog.concat(custom).filter((frame) => !deleted.has(frame.id)).map((frame) => [frame.id, frame]));
  return [...byId.values()];
}

function getAllFrames() {
  const byId = new Map();
  Object.values(packages).forEach((pack) => {
    getPackageFrameCatalog(pack).forEach((frame) => byId.set(frame.id, { ...byId.get(frame.id), ...frame }));
  });
  return [...byId.values()];
}

function syncFrameToAllPackages(frame) {
  Object.values(packages).forEach((pack) => {
    pack.frameCatalog = getPackageFrameCatalog(pack).map((item) => (
      item.id === frame.id ? { ...item, ...frame } : item
    ));
    if (!pack.frameCatalog.some((item) => item.id === frame.id)) {
      pack.frameCatalog.push(frame);
    }
  });
}

function renderPackageSettings() {
  const target = document.querySelector("#packageSettingsList");
  if (!target) return;
  target.innerHTML = Object.values(packages).map((pack) => {
    const allowed = new Set(pack.allowedFrames || ["frame1", "frame2"]);
    const frameCatalog = getPackageFrameCatalog(pack);
    const selectedFrames = frameCatalog.filter((frame) => allowed.has(frame.id));
    const printCount = Math.max(1, Number(pack.printCount || 1));
    const slotCounts = [...new Set(selectedFrames.map((frame) => Number(frame.maxPhotos || 4)))];
    const slotLabel = slotCounts.length === 1 ? `${slotCounts[0]} ảnh/frame` : "Số ảnh theo từng lượt";
    return `
      <article class="session-card-row package-setting-card" data-package-id="${pack.id}">
        <div>
          <strong data-package-summary-name>${pack.name}</strong>
          <span data-package-summary>${Number(pack.minutes || 3)} phut · ${money.format(pack.price)}đ · ${printCount} bản ghép / ${printCount} tấm in · ${slotLabel}</span>
          <small>Tick frame được phép dùng cho gói, rồi chọn frame cho từng bản ghép cần in.</small>
        </div>
        <div class="row-actions package-setting-actions">
          <label class="filter-intensity">Ten goi
            <input data-package-field="name" type="text" value="${pack.name}" />
          </label>
          <label class="filter-intensity">So phut
            <input data-package-field="minutes" type="number" min="1" step="1" value="${Number(pack.minutes || 3)}" />
          </label>
          <label class="filter-intensity">So tam in
            <input data-package-field="printCount" type="number" min="1" step="1" value="${printCount}" />
          </label>
          <label class="filter-intensity">Gia
            <input data-package-field="price" type="number" min="0" step="1000" value="${pack.price}" />
          </label>
          <div class="package-frame-list">
            ${frameCatalog.map((frame) => `
              <div class="package-frame-option">
                <img src="${frameAssetSrc(frame.src)}" alt="${frame.name}" />
                <span>${frame.name}</span>
                <label class="package-frame-control">
                  <input data-package-frame="${frame.id}" type="checkbox" ${allowed.has(frame.id) ? "checked" : ""} />
                  Dung trong goi
                </label>
                <button class="ghost-btn package-frame-test" data-frame-test="${frame.id}" data-package-test="${pack.id}" type="button">Chỉnh slot</button>
              </div>
            `).join("")}
          </div>
        </div>
      </article>
    `;
  }).join("");
  target.querySelectorAll(".package-setting-card").forEach((card) => {
    const pack = packages[card.dataset.packageId];
    const printCount = Math.max(1, Number(pack?.printCount || 1));
    const summary = card.querySelector("[data-package-summary]");
    const note = card.querySelector("small");
    if (summary) summary.textContent = `${Number(pack?.minutes || 3)} phut · ${money.format(pack?.price || 0)}d · ${printCount} tam in`;
    if (summary) summary.textContent = `${Number(pack?.minutes || 3)} phut - ${money.format(pack?.price || 0)}d - ${printCount} tam in`;
    if (note) note.textContent = "Tick frame de hien thi tren man khach. Khach se chon frame cho tung tam ghep/in.";
  });
}

function renderFrameManager() {
  const target = document.querySelector("#frameManagerList");
  if (!target) return;
  const frames = getAllFrames();
  target.innerHTML = frames.map((frame) => {
    return `
      <article class="package-frame-option frame-manager-card" data-managed-frame="${frame.id}">
        <img src="${frameAssetSrc(frame.src)}" alt="${frame.name}" />
        <span>${frame.name}</span>
        <small>${Number(frame.maxPhotos || 4)} slot ảnh</small>
        <div class="frame-manager-actions">
          <button class="ghost-btn package-frame-test" data-frame-manager-edit="${frame.id}" type="button">Chỉnh slot layout</button>
          <button class="danger-btn frame-manager-delete" data-frame-manager-delete="${frame.id}" type="button">Xóa frame</button>
        </div>
      </article>
    `;
  }).join("");
}

function deleteManagedFrame(frameId) {
  const frame = getAllFrames().find((item) => item.id === frameId);
  if (!frame) return;
  if (!window.confirm(`Xoa frame "${frame.name || frameId}" khoi quan ly frame?`)) return;
  const deleted = getDeletedFrameIds();
  deleted.add(frameId);
  saveDeletedFrameIds(deleted);

  Object.values(packages).forEach((pack) => {
    pack.frameCatalog = (Array.isArray(pack.frameCatalog) ? pack.frameCatalog : []).filter((item) => item.id !== frameId);
    const catalog = getPackageFrameCatalog(pack);
    pack.allowedFrames = (pack.allowedFrames || []).filter((id) => id !== frameId && catalog.some((item) => item.id === id));
    if (!pack.allowedFrames.length) {
      pack.allowedFrames = catalog[0]?.id ? [catalog[0].id] : [];
    }
    pack.printFrameIds = [];
    if (pack.defaultFrameId === frameId || !pack.allowedFrames.includes(pack.defaultFrameId)) {
      pack.defaultFrameId = pack.allowedFrames[0] || null;
    }
    const primaryFrame = catalog.find((item) => item.id === pack.defaultFrameId);
    pack.frameSlots = Number(primaryFrame?.maxPhotos || pack.frameSlots || 4);
  });

  state.sessions.forEach((session) => {
    session.availableFrames = (session.availableFrames || []).filter((item) => item.id !== frameId);
    session.allowedFrames = (session.allowedFrames || []).filter((id) => id !== frameId);
    session.printFrameIds = [];
    if (session.defaultFrameId === frameId) session.defaultFrameId = session.allowedFrames[0] || null;
    if (!session.allowedFrames.length && session.availableFrames.length) {
      session.allowedFrames = [session.availableFrames[0].id];
    }
    if (!session.defaultFrameId && session.allowedFrames.length) {
      session.defaultFrameId = session.allowedFrames[0];
    }
    const primaryFrame = (session.availableFrames || []).find((item) => item.id === session.defaultFrameId) || (session.availableFrames || [])[0];
    if (primaryFrame) session.frameSlots = Number(primaryFrame.maxPhotos || session.frameSlots || 4);
  });

  savePackageSettings();
  render();
  showToast(`Da xoa frame ${frame.name || frameId}.`);
}

function savePackageSettingsFromForm() {
  document.querySelectorAll("[data-package-id]").forEach((card) => {
    const pack = packages[card.dataset.packageId];
    if (!pack) return;
    pack.name = card.querySelector('[data-package-field="name"]')?.value.trim() || pack.name;
    pack.minutes = Math.max(1, Number(card.querySelector('[data-package-field="minutes"]')?.value || pack.minutes || 3));
    pack.printCount = Math.max(1, Number(card.querySelector('[data-package-field="printCount"]')?.value || pack.printCount || 1));
    pack.price = Math.max(0, Number(card.querySelector('[data-package-field="price"]')?.value || pack.price));
    pack.frameCatalog = getPackageFrameCatalog(pack);
    const checkedFrames = [...card.querySelectorAll("[data-package-frame]:checked")].map((input) => input.dataset.packageFrame).filter(Boolean);
    pack.allowedFrames = checkedFrames.length ? Array.from(new Set(checkedFrames)) : pack.frameCatalog.map((frame) => frame.id).slice(0, 1);
    pack.printFrameIds = [];
    pack.defaultFrameId = pack.allowedFrames[0] || null;
    const primaryFrame = pack.frameCatalog.find((frame) => frame.id === pack.defaultFrameId);
    pack.frameSlots = Number(primaryFrame?.maxPhotos || 4);
  });
  savePackageSettings();
  showToast("Da luu cau hinh goi chup.");
  render();
}

function updatePackageField(input) {
  const card = input.closest("[data-package-id]");
  const pack = packages[card?.dataset.packageId];
  if (!pack) return;
  const field = input.dataset.packageField;
  if (field === "name") pack.name = input.value.trim() || pack.name;
  if (field === "minutes") pack.minutes = Math.max(1, Number(input.value || 1));
  if (field === "printCount") {
    pack.printCount = Math.max(1, Number(input.value || 1));
  }
  if (field === "price") pack.price = Math.max(0, Number(input.value || 0));
  if (state?.packageSettings?.[pack.id]) {
    state.packageSettings[pack.id].name = pack.name;
    state.packageSettings[pack.id].minutes = pack.minutes;
    state.packageSettings[pack.id].printCount = pack.printCount;
    state.packageSettings[pack.id].printFrameIds = [];
    state.packageSettings[pack.id].price = pack.price;
  }
  card.querySelector("[data-package-summary-name]").textContent = pack.name;
  card.querySelector("[data-package-summary]").textContent = `${Number(pack.minutes || 3)} phut · ${money.format(pack.price)}đ`;
  card.querySelector("[data-package-summary]").textContent = `${Number(pack.minutes || 3)} phut - ${money.format(pack.price)}d - ${pack.printCount || 1} tam in`;
  schedulePackageSettingsSave();
}

function addPackage() {
  const id = `custom-${Date.now()}`;
  const frames = getAllFrames();
  const firstFrame = frames[0];
  packages[id] = {
    id,
    name: "Goi moi",
    minutes: 3,
    price: 0,
    printCount: 1,
    frameSlots: Number(firstFrame?.maxPhotos || 4),
    defaultFrameId: firstFrame?.id || null,
    allowedFrames: firstFrame ? [firstFrame.id] : [],
    printFrameIds: [],
    frameCatalog: frames,
    frames: "",
    autoEdit: "",
  };
  savePackageSettings();
  render();
  showToast("Da them goi chup moi.");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function frameAssetSrc(src) {
  if (window.location.protocol === "file:" && String(src || "").startsWith("/")) {
    return `http://127.0.0.1:4173${src}`;
  }
  return src;
}

async function uploadManagedFrame(input) {
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("Chi upload file anh PNG/WebP/JPG.");
    return;
  }
  try {
    const image = await fileToDataUrl(file);
    const frameApi = window.location.protocol === "file:" ? "http://127.0.0.1:4173/api/frame" : "/api/frame";
    const response = await fetch(frameApi, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, image }),
    });
    if (!response.ok) throw new Error(`Upload failed ${response.status}`);
    const uploaded = await response.json();
    const frame = {
      id: uploaded.id,
      name: uploaded.name || file.name.replace(/\.[^.]+$/, ""),
      src: uploaded.src,
      maxPhotos: 1,
      slots: [],
    };
    syncFrameToAllPackages(frame);
    const firstPack = packages["3"] || Object.values(packages)[0];
    savePackageSettings();
    renderFrameManager();
    renderPackageSettings();
    showToast(`Đã upload ${frame.name}. Frame đã có trong tất cả gói, tick gói nào muốn áp dụng.`);
    await testPackageFrame(firstPack?.id || "3", frame.id);
  } catch (error) {
    showToast(`Upload frame chua thanh cong: ${error.message || "kiem tra server local"}.`);
  }
}

function toggleFramePackage(frameId, packageId, enabled) {
  const pack = packages[packageId];
  const frame = getAllFrames().find((item) => item.id === frameId);
  if (!pack || !frame) return;
  syncFrameToAllPackages(frame);
  const allowed = new Set(pack.allowedFrames || []);
  if (enabled) {
    allowed.add(frameId);
  } else {
    allowed.delete(frameId);
  }
  pack.allowedFrames = [...allowed];
  const catalog = getPackageFrameCatalog(pack);
  if (!pack.allowedFrames.length && catalog[0]?.id) pack.allowedFrames = [catalog[0].id];
  pack.printFrameIds = [];
  pack.defaultFrameId = pack.allowedFrames[0] || null;
  const primaryFrame = catalog.find((item) => item.id === pack.defaultFrameId);
  pack.frameSlots = Number(primaryFrame?.maxPhotos || 4);
  savePackageSettings();
  renderFrameManager();
  renderPackageSettings();
}

function packageFrameSlots(frame) {
  if (Array.isArray(frame.slots) && frame.slots.length) return frame.slots;
  if (frame.id === "frame1") {
    return [
      { x: 64, y: 138, w: 512, h: 660 },
      { x: 626, y: 220, w: 512, h: 710 },
      { x: 64, y: 916, w: 512, h: 660 },
      { x: 626, y: 1000, w: 512, h: 670 },
    ];
  }
  if (frame.id === "frame2") {
    return [
      { x: 44, y: 110, w: 545, h: 720 },
      { x: 614, y: 110, w: 545, h: 720 },
      { x: 44, y: 860, w: 545, h: 720 },
      { x: 614, y: 860, w: 545, h: 720 },
    ];
  }
  return uploadedFrameSlots.slice(0, Number(frame.maxPhotos || 4));
}

function defaultCustomFrameSlots(canvas) {
  if (canvas.width > canvas.height) {
    return [
      { x: Math.round(canvas.width * 0.06), y: Math.round(canvas.height * 0.34), w: Math.round(canvas.width * 0.34), h: Math.round(canvas.width * 0.34 * 2 / 3) },
      { x: Math.round(canvas.width * 0.46), y: Math.round(canvas.height * 0.14), w: Math.round(canvas.width * 0.26), h: Math.round(canvas.width * 0.26 * 2 / 3) },
      { x: Math.round(canvas.width * 0.46), y: Math.round(canvas.height * 0.48), w: Math.round(canvas.width * 0.26), h: Math.round(canvas.width * 0.26 * 2 / 3) },
      { x: Math.round(canvas.width * 0.76), y: Math.round(canvas.height * 0.14), w: Math.round(canvas.width * 0.20), h: Math.round(canvas.width * 0.20 * 2 / 3) },
      { x: Math.round(canvas.width * 0.76), y: Math.round(canvas.height * 0.46), w: Math.round(canvas.width * 0.20), h: Math.round(canvas.width * 0.20 * 2 / 3) },
    ];
  }
  return [{
    x: Math.round(canvas.width * 0.1),
    y: Math.round(canvas.height * 0.1),
    w: Math.round(canvas.width * 0.8),
    h: Math.round(canvas.height * 0.28),
  }];
}

function loadPackageTestImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function normalizeFrameSlot(slot, canvas) {
  const minSize = Math.max(40, Math.round(Math.min(canvas.width, canvas.height) * 0.04));
  const next = {
    x: Number(slot.x || 0),
    y: Number(slot.y || 0),
    w: Number(slot.w || minSize),
    h: Number(slot.h || minSize),
    rotation: Number(slot.rotation || 0),
  };
  next.w = Math.round(frameClamp(next.w, minSize, Math.max(minSize, canvas.width * 1.5)));
  next.h = Math.round(frameClamp(next.h, minSize, Math.max(minSize, canvas.height * 1.5)));
  const visibleW = Math.max(24, Math.round(next.w * 0.15));
  const visibleH = Math.max(24, Math.round(next.h * 0.15));
  next.x = Math.round(frameClamp(next.x, -next.w + visibleW, canvas.width - visibleW));
  next.y = Math.round(frameClamp(next.y, -next.h + visibleH, canvas.height - visibleH));
  next.rotation = Number.isFinite(next.rotation) ? next.rotation : 0;
  return next;
}

let frameTestState = null;

async function testPackageFrame(packageId, frameId) {
  const pack = packages[packageId];
  const frame = getPackageFrameCatalog(pack || {}).find((item) => item.id === frameId);
  const canvas = document.querySelector("#frameTestCanvas");
  const modal = document.querySelector("#frameTestModal");
  if (!frame || !canvas || !modal) return;

  const frameImage = await loadPackageTestImage(frameAssetSrc(frame.src));
  canvas.width = frameImage.naturalWidth || frameImage.width;
  canvas.height = frameImage.naturalHeight || frameImage.height;
  const savedSlots = Array.isArray(frame.slots) && frame.slots.length
    ? frame.slots.map((slot) => ({
        x: Math.round(Number.isFinite(Number(slot.rx)) ? Number(slot.rx) * canvas.width : slot.x * canvas.width / Number(frame.slotCanvasWidth || 1200)),
        y: Math.round(Number.isFinite(Number(slot.ry)) ? Number(slot.ry) * canvas.height : slot.y * canvas.height / Number(frame.slotCanvasHeight || 1800)),
        w: Math.round(Number.isFinite(Number(slot.rw)) ? Number(slot.rw) * canvas.width : slot.w * canvas.width / Number(frame.slotCanvasWidth || 1200)),
        h: Math.round(Number.isFinite(Number(slot.rh)) ? Number(slot.rh) * canvas.height : slot.h * canvas.height / Number(frame.slotCanvasHeight || 1800)),
        rotation: Number(slot.rotation || 0),
      }))
    : null;
  const builtInSlots = ["frame1", "frame2"].includes(frame.id)
    ? packageFrameSlots(frame).map((slot) => ({
        x: Math.round(slot.x * canvas.width / 1200),
        y: Math.round(slot.y * canvas.height / 1800),
        w: Math.round(slot.w * canvas.width / 1200),
        h: Math.round(slot.h * canvas.height / 1800),
        rotation: Number(slot.rotation || 0),
      }))
    : null;
  const slots = (savedSlots
    ? savedSlots
    : builtInSlots || defaultCustomFrameSlots(canvas)).map((slot) => normalizeFrameSlot(slot, canvas));
  frameTestState = { packageId, frameId, frame, slots, frameImage, selected: 0, drag: null };
  renderFrameTestEditor();
  document.querySelector("#frameTestTitle").textContent = `Tạo slot: ${frame.name}`;
  modal.hidden = false;
}

function renderFrameTestEditor() {
  if (!frameTestState) return;
  const canvas = document.querySelector("#frameTestCanvas");
  const ctx = canvas.getContext("2d");
  const { slots, frameImage, selected } = frameTestState;

  ctx.fillStyle = "#17120f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 0.78;
  ctx.drawImage(frameImage, 0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(0,0,0,.34)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const markerSize = Math.max(24, Math.round(Math.min(canvas.width, canvas.height) * 0.025));
  slots.forEach((slot, index) => {
    const color = frameSlotColors[index % frameSlotColors.length];
    ctx.save();
    transformFrameSlot(ctx, slot);
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = color;
    ctx.fillRect(-slot.w / 2, -slot.h / 2, slot.w, slot.h);
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-slot.w / 2, -slot.h / 2, slot.w, slot.h);
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,.36)";
    ctx.lineWidth = Math.max(4, Math.round(markerSize * 0.18));
    for (let line = -slot.w / 2 - slot.h; line < slot.w / 2 + slot.h; line += markerSize) {
      ctx.beginPath();
      ctx.moveTo(line, slot.h / 2);
      ctx.lineTo(line + slot.h, -slot.h / 2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = "#ffffff";
    ctx.font = `900 ${Math.max(32, Math.round(Math.min(slot.w, slot.h) * 0.34))}px Inter, Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(index + 1), 0, 0);
    ctx.font = `800 ${Math.max(13, Math.round(markerSize * 0.42))}px Inter, Arial`;
    ctx.globalAlpha = 0;
    ctx.fillText("ẢNH GỐC 3:2", slot.x + slot.w / 2, slot.y + slot.h / 2 + Math.max(28, markerSize * 0.9));
    ctx.restore();
  });

  slots.forEach((slot, index) => {
    ctx.save();
    transformFrameSlot(ctx, slot);
    const color = frameSlotColors[index % frameSlotColors.length];
    ctx.lineWidth = index === selected ? 8 : 5;
    ctx.strokeStyle = "#ffffff";
    ctx.strokeRect(-slot.w / 2, -slot.h / 2, slot.w, slot.h);
    ctx.lineWidth = index === selected ? 4 : 2;
    ctx.strokeStyle = index === selected ? "#151719" : color;
    ctx.strokeRect(-slot.w / 2, -slot.h / 2, slot.w, slot.h);
    ctx.fillStyle = index === selected ? "#ff2f64" : "rgba(0,0,0,.65)";
    const labelWidth = Math.max(markerSize * 3.7, Math.round(slot.w * 0.34));
    ctx.fillRect(-slot.w / 2, -slot.h / 2 - markerSize, labelWidth, markerSize);
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.round(markerSize * 0.42)}px Inter, Arial`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`Slot ${index + 1}`, -slot.w / 2 + markerSize * 0.28, -slot.h / 2 - markerSize / 2);
    if (index === selected) {
      ctx.fillStyle = "#ff2f64";
      ctx.fillRect(slot.w / 2 - markerSize, slot.h / 2 - markerSize, markerSize, markerSize);
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.round(markerSize * 0.58)}px Inter, Arial`;
      ctx.textAlign = "center";
      ctx.globalAlpha = 0;
      ctx.fillText("↘", slot.x + slot.w - markerSize / 2, slot.y + slot.h - markerSize * 0.34);
    }
    ctx.restore();
  });
  drawFrameRotateButton(ctx, slots[selected], canvas);
  syncFrameSlotControls();
}

function frameSlotCenter(slot) {
  return { x: slot.x + slot.w / 2, y: slot.y + slot.h / 2 };
}

function transformFrameSlot(ctx, slot) {
  const center = frameSlotCenter(slot);
  ctx.translate(center.x, center.y);
  ctx.rotate(Number(slot.rotation || 0));
}

function rotatePointAroundSlot(slot, localX, localY) {
  const center = frameSlotCenter(slot);
  const rotation = Number(slot.rotation || 0);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: center.x + localX * cos - localY * sin,
    y: center.y + localX * sin + localY * cos,
  };
}

function frameRotateButtonRect(slot, canvas) {
  const size = Math.max(42, Math.round(Math.min(canvas.width, canvas.height) * 0.045));
  const gap = Math.max(10, Math.round(size * 0.28));
  const button = rotatePointAroundSlot(slot, 0, slot.h / 2 + gap + size / 2);
  return { x: button.x - size / 2, y: button.y - size / 2, size };
}

function drawFrameRotateButton(ctx, slot, canvas) {
  if (!slot) return;
  const { x, y, size } = frameRotateButtonRect(slot, canvas);
  const cx = x + size / 2;
  const cy = y + size / 2;
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#d8cbb8";
  ctx.lineWidth = Math.max(2, Math.round(size * 0.05));
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "#191714";
  ctx.lineWidth = Math.max(3, Math.round(size * 0.07));
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.22, -Math.PI * 0.95, Math.PI * 0.5);
  ctx.stroke();
  ctx.fillStyle = "#191714";
  ctx.font = `900 ${Math.round(size * 0.34)}px Inter, Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("R", cx, cy);
  ctx.restore();
}

function syncFrameSlotControls() {
  if (!frameTestState) return;
  const slot = frameTestState.slots[frameTestState.selected];
  document.querySelector("#frameSlotLabel").textContent = `Slot ${frameTestState.selected + 1}/${frameTestState.slots.length}`;
  ["X", "Y", "W", "H"].forEach((key) => {
    const input = document.querySelector(`#frameSlot${key}`);
    if (input) input.value = Math.round(slot[key.toLowerCase()]);
  });
  const list = document.querySelector("#frameLayerList");
  if (list) {
    list.innerHTML = `
      <button class="frame-layer-row is-frame" type="button" disabled>
        <span>Trên cùng</span><strong>Frame PNG</strong><em>Khóa</em>
      </button>
      ${frameTestState.slots.map((_, index) => `
        <button class="frame-layer-row ${index === frameTestState.selected ? "is-selected" : ""}" data-frame-layer="${index}" type="button">
          <span>${index + 1}</span><strong>Slot ảnh ${index + 1}</strong><em>Dưới frame</em>
        </button>
      `).join("")}
    `;
    list.querySelectorAll("[data-frame-layer]").forEach((button) => {
      button.addEventListener("click", () => selectFrameSlot(Number(button.dataset.frameLayer)));
    });
  }
}

function updateSelectedFrameSlot(patch) {
  if (!frameTestState) return;
  const canvas = document.querySelector("#frameTestCanvas");
  const slot = frameTestState.slots[frameTestState.selected];
  Object.assign(slot, patch);
  const normalized = normalizeFrameSlot(slot, canvas);
  Object.assign(slot, normalized);
  renderFrameTestEditor();
}

function selectFrameSlot(index) {
  if (!frameTestState) return;
  frameTestState.selected = frameClamp(index, 0, frameTestState.slots.length - 1);
  renderFrameTestEditor();
}

function swapFrameSlot(direction) {
  if (!frameTestState) return;
  const from = frameTestState.selected;
  const to = from + direction;
  if (to < 0 || to >= frameTestState.slots.length) return;
  [frameTestState.slots[from], frameTestState.slots[to]] = [frameTestState.slots[to], frameTestState.slots[from]];
  frameTestState.selected = to;
  renderFrameTestEditor();
}

function addFrameSlot() {
  if (!frameTestState) return;
  const canvas = document.querySelector("#frameTestCanvas");
  const base = frameTestState.slots[frameTestState.selected] || {
    x: Math.round(canvas.width * 0.1), y: Math.round(canvas.height * 0.1),
    w: Math.round(canvas.width * 0.8), h: Math.round(canvas.height * 0.28),
  };
  const offset = Math.max(12, Math.round(Math.min(canvas.width, canvas.height) * 0.02));
  const next = {
    x: Math.min(base.x + offset, canvas.width - base.w),
    y: Math.min(base.y + offset, canvas.height - base.h),
    w: base.w,
    h: base.h,
    rotation: Number(base.rotation || 0),
  };
  Object.assign(next, normalizeFrameSlot(next, canvas));
  frameTestState.slots.splice(frameTestState.selected + 1, 0, next);
  frameTestState.selected += 1;
  renderFrameTestEditor();
}

function deleteFrameSlot() {
  if (!frameTestState || frameTestState.slots.length <= 1) return;
  frameTestState.slots.splice(frameTestState.selected, 1);
  frameTestState.selected = Math.min(frameTestState.selected, frameTestState.slots.length - 1);
  renderFrameTestEditor();
}

function rotateFrameSlot() {
  if (!frameTestState) return;
  const canvas = document.querySelector("#frameTestCanvas");
  const slot = frameTestState.slots[frameTestState.selected];
  const centerX = slot.x + slot.w / 2;
  const centerY = slot.y + slot.h / 2;
  const next = {
    x: centerX - slot.h / 2,
    y: centerY - slot.w / 2,
    w: slot.h,
    h: slot.w,
  };
  Object.assign(slot, normalizeFrameSlot(next, canvas));
  renderFrameTestEditor();
}

function saveFrameSlots() {
  if (!frameTestState) return;
  const pack = packages[frameTestState.packageId];
  if (!pack) return;
  const canvas = document.querySelector("#frameTestCanvas");
  const slots = frameTestState.slots.map((slot) => ({
    x: Math.round(slot.x),
    y: Math.round(slot.y),
    w: Math.round(slot.w),
    h: Math.round(slot.h),
    rx: slot.x / canvas.width,
    ry: slot.y / canvas.height,
    rw: slot.w / canvas.width,
    rh: slot.h / canvas.height,
    rotation: Number(slot.rotation || 0),
  }));
  Object.values(packages).forEach((targetPack) => {
    targetPack.frameCatalog = getPackageFrameCatalog(targetPack).map((frame) => (
      frame.id === frameTestState.frameId
        ? { ...frame, slots, slotCanvasWidth: canvas.width, slotCanvasHeight: canvas.height, maxPhotos: slots.length }
        : frame
    ));
    if (targetPack.defaultFrameId === frameTestState.frameId || (targetPack.allowedFrames || []).includes(frameTestState.frameId)) {
      targetPack.frameSlots = slots.length;
    }
  });
  state.sessions.forEach((session) => {
    session.availableFrames = (session.availableFrames || []).map((frame) => (
      frame.id === frameTestState.frameId
        ? { ...frame, slots, slotCanvasWidth: canvas.width, slotCanvasHeight: canvas.height, maxPhotos: slots.length }
        : frame
    ));
    if ((session.allowedFrames || []).includes(frameTestState.frameId)) session.frameSlots = slots.length;
  });
  savePackageSettings();
  showToast(`Đã lưu ${slots.length} slot cho frame.`);
  renderFrameManager();
  renderPackageSettings();
}

function frameTestPoint(event) {
  const canvas = document.querySelector("#frameTestCanvas");
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * canvas.width / rect.width,
    y: (event.clientY - rect.top) * canvas.height / rect.height,
  };
}

function hitFrameSlot(point) {
  if (!frameTestState) return -1;
  for (let index = frameTestState.slots.length - 1; index >= 0; index -= 1) {
    const slot = frameTestState.slots[index];
    const local = frameSlotLocalPoint(point, slot);
    if (local.x >= -slot.w / 2 && local.x <= slot.w / 2 && local.y >= -slot.h / 2 && local.y <= slot.h / 2) return index;
  }
  return -1;
}

function frameSlotLocalPoint(point, slot) {
  const center = frameSlotCenter(slot);
  const rotation = -Number(slot.rotation || 0);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos,
  };
}

function hitFrameRotateButton(point, canvas) {
  if (!frameTestState) return false;
  const slot = frameTestState.slots[frameTestState.selected];
  if (!slot) return false;
  const { x, y, size } = frameRotateButtonRect(slot, canvas);
  const cx = x + size / 2;
  const cy = y + size / 2;
  return Math.hypot(point.x - cx, point.y - cy) <= size / 2;
}

function startFrameSlotDrag(event) {
  if (!frameTestState) return;
  const point = frameTestPoint(event);
  if (hitFrameRotateButton(point, event.currentTarget)) {
    const slot = frameTestState.slots[frameTestState.selected];
    const center = frameSlotCenter(slot);
    frameTestState.drag = {
      mode: "rotate",
      center,
      startAngle: Math.atan2(point.y - center.y, point.x - center.x),
      startRotation: Number(slot.rotation || 0),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }
  const index = hitFrameSlot(point);
  if (index < 0) return;
  frameTestState.selected = index;
  const slot = frameTestState.slots[index];
  const handle = Math.max(20, Math.round(Math.min(event.currentTarget.width, event.currentTarget.height) * 0.025));
  const local = frameSlotLocalPoint(point, slot);
  const resize = local.x >= slot.w / 2 - handle && local.y >= slot.h / 2 - handle;
  frameTestState.drag = { mode: resize ? "resize" : "move", x: point.x, y: point.y, slot: { ...slot } };
  event.currentTarget.setPointerCapture(event.pointerId);
  renderFrameTestEditor();
}

function moveFrameSlotDrag(event) {
  if (!frameTestState?.drag) return;
  const point = frameTestPoint(event);
  const drag = frameTestState.drag;
  const dx = point.x - drag.x;
  const dy = point.y - drag.y;
  if (drag.mode === "rotate") {
    const angle = Math.atan2(point.y - drag.center.y, point.x - drag.center.x);
    updateSelectedFrameSlot({ rotation: drag.startRotation + angle - drag.startAngle });
  } else if (drag.mode === "resize") {
    const rotation = -Number(drag.slot.rotation || 0);
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const localDx = dx * cos - dy * sin;
    const localDy = dx * sin + dy * cos;
    updateSelectedFrameSlot({ w: drag.slot.w + localDx, h: drag.slot.h + localDy });
  } else {
    updateSelectedFrameSlot({ x: drag.slot.x + dx, y: drag.slot.y + dy });
  }
}

function stopFrameSlotDrag(event) {
  if (!frameTestState?.drag) return;
  frameTestState.drag = null;
  try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
}

function closeFrameTestModal() {
  const modal = document.querySelector("#frameTestModal");
  if (modal) modal.hidden = true;
  frameTestState = null;
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
          if (!packages[id]) packages[id] = { id, name: patch.name || `Goi ${Number(patch.minutes || 3)} phut`, minutes: Number(patch.minutes || 3), price: Number(patch.price || 0), printCount: 1, frameSlots: 4, defaultFrameId: null, allowedFrames: [], printFrameIds: [], frameCatalog: [] };
          packages[id] = { ...packages[id], ...patch, id };
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
  const minutes = Number(session.packageMinutes || pack.minutes || String(session.packageId || "").match(/\d+/)?.[0] || 3);
  const price = Number(session.packagePrice ?? pack.price ?? 0);
  const birthday = session.birthdayBonusMinutes ? " + SN" : "";
  return `Gói ${minutes} phút${birthday} - ${money.format(price)}đ - In ${session.printCount || pack.printCount || 1} tấm`;
}

function elapsedSince(value) {
  if (!value) return "-";
  const start = Date.parse(value);
  if (!Number.isFinite(start) || start <= 0) return "-";
  const total = Math.max(0, Math.floor((Date.now() - start) / 1000));
  if (total > 12 * 60 * 60) return "-";
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours ? `${hours}h ${String(minutes).padStart(2, "0")}p` : `${minutes}p ${String(seconds).padStart(2, "0")}s`;
}

function displayName(value) {
  return String(value || "-")
    .replace(/Nguy\?n/g, "Nguyễn")
    .replace(/Minh Anh/g, "Minh Anh");
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
  const birthdayToggle = document.querySelector(`[data-birthday-toggle="${CSS.escape(session.id)}"]`);
  const birthdayDateInput = document.querySelector(`[data-birthday-date="${CSS.escape(session.id)}"]`);
  const birthdayDate = birthdayDateInput?.value || "";
  const hasBirthdayBonus = Boolean(birthdayToggle?.checked);
  if (hasBirthdayBonus && !birthdayDate) {
    showToast("Vui lòng chọn ngày sinh nhật trước khi xác nhận thanh toán.");
    birthdayDateInput?.focus();
    return;
  }
  const baseMinutes = Number(packages[session.packageId]?.minutes || String(session.packageId || "").match(/\d+/)?.[0] || session.packageMinutes || 3);
  session.packagePrice = Number(session.packagePrice ?? packages[session.packageId]?.price ?? 0);
  session.isBirthday = hasBirthdayBonus;
  session.birthdayDate = hasBirthdayBonus ? birthdayDate : "";
  session.birthdayBonusMinutes = hasBirthdayBonus ? 5 : 0;
  session.packageMinutes = baseMinutes + session.birthdayBonusMinutes;
  session.paymentStatus = "PAID";
  session.status = "WAITING";
  session.paidAt = new Date().toISOString();
  session.updatedAt = session.paidAt;
  birthdayDrafts.delete(session.id);
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
  const minutes = Math.max(1, Number(session.packageMinutes || pack.minutes || session.packageId || 3));
  session.status = "READY_TO_SHOOT";
  session.remainingSeconds = minutes * 60;
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

async function importRetouchFolder(session) {
  const input = document.querySelector(`[data-retouch-folder="${session.id}"]`);
  const folderPath = input?.value.trim();
  if (!folderPath) {
    showToast("Nhập đường dẫn folder MagiMir export trước.");
    return;
  }

  importingRetouchSessionId = session.id;
  renderRetouch();
  try {
    const response = await fetch("/api/retouch/import-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id, folderPath }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      showToast(payload.error || "Không gửi được ảnh đã chỉnh.");
      return;
    }
    const index = state.sessions.findIndex((item) => item.id === session.id);
    if (index >= 0 && payload.session) state.sessions[index] = payload.session;
    retouchFolderDrafts.delete(session.id);
    await loadServerState();
    render();
    showToast(`Đã gửi ${payload.count || 0} ảnh MagiMir cho khách.`);
  } catch {
    showToast("Mất kết nối server. Chưa gửi được ảnh đã chỉnh.");
  } finally {
    importingRetouchSessionId = "";
    renderRetouch();
  }
}

function markPrinted(session) {
  session.status = "COMPLETED";
  session.printedAt = new Date().toISOString();
  session.completedAt = session.printedAt;
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

function refundSession(session) {
  if (session.paymentStatus === "REFUNDED") {
    showToast("Phiên này đã hoàn tiền rồi.");
    return;
  }
  if (!confirm(`Xác nhận hoàn tiền phiên ${codeLabel(session)}?`)) return;
  const reason = prompt("Lý do hoàn tiền", session.refundReason || "") || "";
  const now = new Date().toISOString();
  session.paymentStatus = "REFUNDED";
  session.status = "REFUNDED";
  session.refundedAt = now;
  session.refundReason = reason.trim();
  session.updatedAt = now;
  saveState();
  render();
  showToast("Đã đánh dấu hoàn tiền. Phiên này không còn tính doanh thu.");
}

function createDemoSession() {
  const number = state.nextNumber++;
  const id = `GL-${String(number).padStart(4, "0")}`;
  const pack = packages["5"];
  const allowedFrames = Array.isArray(pack.allowedFrames) && pack.allowedFrames.length ? pack.allowedFrames : ["frame1", "frame2"];
  const defaultFrameId = allowedFrames.includes(pack.defaultFrameId) ? pack.defaultFrameId : allowedFrames[0];
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
    defaultFrameId,
    allowedFrames,
    printFrameIds: [],
    availableFrames: getPackageFrameCatalog(pack).filter((frame) => allowedFrames.includes(frame.id)),
    printCount: Math.max(1, Number(pack.printCount || 1)),
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

function formatDateTime(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("vi-VN", { hour12: false });
}

function formatShortTime(value) {
  const date = new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function paymentMethodLabel(session) {
  return ["cash", "CASH"].includes(session.paymentMethod) ? "Tiền mặt" : ["bank", "BANK_TRANSFER"].includes(session.paymentMethod) ? "Chuyển khoản" : (session.paymentMethod || "-");
}

function frameLabel(session) {
  const frames = Array.isArray(session.availableFrames) && session.availableFrames.length
    ? session.availableFrames
    : defaultFrameCatalog.filter((frame) => (session.allowedFrames || []).includes(frame.id));
  return frames.map((frame) => frame.name || frame.id).join(", ") || "-";
}

function codeLabel(session) {
  const raw = String(session.ticket || session.paymentCode || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits) return digits.slice(-4).padStart(4, "0");
  return String(session.id || "-").trim();
}

function isPaymentQueue(session) {
  return ["PAYMENT_PENDING", "PAYMENT_CASH_PENDING", "CHECKED_IN"].includes(session.status) || session.paymentStatus === "CASH_PENDING";
}

function staffMoreActions(session) {
  return session.paymentStatus === "REFUNDED"
    ? `<span class="customer-note">Đã hoàn tiền</span>`
    : `<button class="danger-btn refund-action-btn" data-action="refund" data-id="${session.id}" type="button">Hoàn tiền</button>`;
}

function isShootQueue(session) {
  return isShootWaiting(session) || isShootingActive(session);
}

function isShootWaiting(session) {
  return ["WAITING", "REJOINED_QUEUE", "CALLING", "NO_SHOW"].includes(session.status);
}

function isShootingActive(session) {
  return ["READY_TO_SHOOT", "SHOOTING", "PAUSED"].includes(session.status);
}

function isPrintQueue(session) {
  return ["FINAL_READY", "SENT_TO_PRINT_STAFF", "FINAL_EXPORTED"].includes(session.status);
}

function isDoneQueue(session) {
  return ["PRINTED", "ZIP_READY", "COMPLETED"].includes(session.status);
}

function card(session, body, actions = "") {
  return `
    <article class="session-card-row">
      <div>
        <strong>${session.ticket} · ${session.id}</strong>
        <span>${displayName(session.customerName)} · ${packageLabel(session)}</span>
        <small>${statusLabels[session.status] || session.status} · Raw ${session.rawCount || 0} ảnh</small>
      </div>
      <div class="row-actions">${actions}</div>
      ${body ? `<p>${body}</p>` : ""}
    </article>
  `;
}

function staffCompactRow(session, cells, actions = "", extraClass = "") {
  return `
    <article class="staff-row compact-row ${extraClass}">
      ${cells.map((cell) => `<div class="${cell.className || ""}"><span>${cell.label}</span><strong>${cell.value}</strong>${cell.note ? `<small>${cell.note}</small>` : ""}</div>`).join("")}
      ${actions ? `<div class="row-actions">${actions}</div>` : ""}
    </article>
  `;
}

function birthdayDraft(session) {
  return birthdayDrafts.get(session.id) || {
    checked: Boolean(session.isBirthday),
    date: session.birthdayDate || "",
  };
}

function updateBirthdayDraft(input) {
  const id = input.dataset.birthdayToggle || input.dataset.birthdayDate;
  if (!id) return;
  const current = birthdayDrafts.get(id) || { checked: false, date: "" };
  if (input.dataset.birthdayToggle) current.checked = input.checked;
  if (input.dataset.birthdayDate) current.date = input.value;
  birthdayDrafts.set(id, current);
}

function renderQueue() {
  const queue = state.sessions.filter(isPaymentQueue);
  document.querySelector("#queueList").innerHTML = queue.length
    ? queue.map((session, index) => {
      const birthday = birthdayDraft(session);
      return staffCompactRow(session, [
        { label: "STT", value: index + 1, className: "queue-order" },
        { label: "Giờ", value: formatShortTime(session.createdAt), note: paymentMethodLabel(session) },
        { label: "Số tiền", value: `${money.format(sessionRevenue(session))}đ` },
        { label: "Sinh nhật", value: `<div class="birthday-controls"><label class="birthday-toggle"><input data-birthday-toggle="${session.id}" type="checkbox" ${birthday.checked ? "checked" : ""}> <span>+5p</span></label><input class="birthday-date-input" data-birthday-date="${session.id}" type="date" value="${birthday.date}"></div>` },
      ], `
        <button class="primary-btn" data-action="confirm-cash" data-id="${session.id}" type="button">Đã thanh toán</button>
      `, "payment-row");
    }).join("")
    : '<div class="empty-state">Chưa có phiếu chờ duyệt thanh toán.</div>';
}

function renderActive() {
  const waiting = state.sessions.filter(isShootWaiting);
  const activeList = state.sessions.filter(isShootingActive);
  const waitingTarget = document.querySelector("#shootQueueList");
  const activeTarget = document.querySelector("#activeSession");

  if (waitingTarget) {
    waitingTarget.innerHTML = waiting.length
      ? waiting.map((session, index) => staffCompactRow(session, [
          { label: "STT", value: index + 1, className: "queue-order" },
          { label: "Mã", value: codeLabel(session) },
          { label: "Khách", value: displayName(session.customerName), note: session.contact || "-" },
          { label: "Gói", value: packageLabel(session) },
          { label: "Chờ", value: elapsedSince(session.paidAt), note: "Từ lúc xác nhận" },
          { label: "Trạng thái", value: statusLabels[session.status] || session.status, note: `Raw ${session.rawCount || 0} ảnh` },
        ], "", "shooting-row")).join("")
      : '<div class="empty-state">Chưa có khách chờ chụp.</div>';
  }

  activeTarget.innerHTML = activeList.length
    ? activeList.map((session) => {
      const active = ["READY_TO_SHOOT", "SHOOTING", "PAUSED"].includes(session.status);
      const controls = active ? `
        ${staffMoreActions(session)}
      ` : "";
      return staffCompactRow(session, [
        { label: "Session", value: codeLabel(session), note: session.id },
        { label: "Ảnh đã chụp", value: `${session.rawCount || session.rawPhotos?.length || 0} ảnh` },
      ], controls, `shooting-row active-shooting-row ${active ? "is-active" : ""}`);
    }).join("")
    : `<div class="empty-state">Chưa có phiên đang chụp. Folder digiCamControl hiện có ${incomingFiles.length} ảnh.</div>`;
}
function renderRetouch() {
  const target = document.querySelector("#retouchList");
  if (!target) return;
  const activeInput = document.activeElement?.matches?.("[data-retouch-folder]")
    ? { id: document.activeElement.dataset.retouchFolder, start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd }
    : null;
  const list = state.sessions.filter((session) => ["RETOUCH_REQUESTED", "RETOUCH_IN_PROGRESS"].includes(session.status));
  target.innerHTML = list.length
    ? list.map((session, index) => {
      const action = session.status === "RETOUCH_REQUESTED"
        ? `<button class="primary-btn" data-action="start-retouch" data-id="${session.id}" type="button">Đưa folder vào MagiMir</button>`
        : `<div class="folder-import-row">
            <input class="folder-input" data-retouch-folder="${session.id}" type="text" placeholder="D:\\MagiMir\\Export\\${session.id}">
            <button class="primary-btn" data-action="import-retouch-folder" data-id="${session.id}" type="button" ${importingRetouchSessionId === session.id ? "disabled" : ""}>${importingRetouchSessionId === session.id ? "Đang kiểm tra thư mục..." : "Gửi ảnh đã chỉnh cho khách"}</button>
          </div>`;
      return staffCompactRow(session, [
        { label: "STT", value: index + 1, className: "queue-order" },
        { label: "Mã", value: codeLabel(session) },
        { label: "Khách", value: displayName(session.customerName), note: session.contact || "-" },
        { label: "Ảnh", value: `${session.retouchCount || session.rawCount || 0} ảnh`, note: session.retouchLevel || "MagiMir folder" },
        { label: "Trạng thái", value: statusLabels[session.status] || session.status, note: session.retouchNote || "-" },
      ], `${action}${staffMoreActions(session)}`, "retouch-row");
    }).join("")
    : '<div class="empty-state">Chưa có khách yêu cầu quán chỉnh ảnh.</div>';
  target.querySelectorAll("[data-retouch-folder]").forEach((input) => {
    input.value = retouchFolderDrafts.get(input.dataset.retouchFolder) || "";
  });
  if (activeInput) {
    const input = target.querySelector(`[data-retouch-folder="${activeInput.id}"]`);
    input?.focus();
    input?.setSelectionRange(activeInput.start, activeInput.end);
  }
}
function renderCompose() {
  const target = document.querySelector("#composeList");
  if (!target) return;
  const list = state.sessions.filter((session) => ["RAW_READY", "RETOUCH_READY"].includes(session.status));
  target.innerHTML = list.length
    ? list.map((session, index) => staffCompactRow(session, [
        { label: "STT", value: index + 1, className: "queue-order" },
        { label: "Mã", value: codeLabel(session) },
        { label: "Khách", value: displayName(session.customerName), note: session.contact || "-" },
        { label: "Gói", value: packageLabel(session) },
        { label: "Ảnh", value: `${session.rawCount || session.rawPhotos?.length || 0} ảnh`, note: statusLabels[session.status] || session.status },
      ], `<a class="primary-btn" href="${sessionUrl(session)}" target="_blank" rel="noopener">Ghép frame</a>${staffMoreActions(session)}`, "compose-row")).join("")
    : '<div class="empty-state">Chưa có phiên cần nhân viên ghép ảnh.</div>';
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
  const list = state.sessions.filter(isPrintQueue);
  document.querySelector("#printList").innerHTML = list.length
    ? list.map((session, index) => {
      const jobs = Array.isArray(session.finalJobs) && session.finalJobs.length
        ? session.finalJobs
        : [{ index: 1, fileName: session.finalFile || `${session.id}_final_01.png`, url: session.finalUrl, localPath: session.finalLocalPath, pdfUrl: session.finalPdfUrl, pdfLocalPath: session.finalPdfLocalPath, printCode: session.printCode }];
      const printCode = session.printCode || jobs.find((job) => job.printCode)?.printCode || session.ticket || session.id;
      const links = jobs.map((job) => {
        const printUrl = job.pdfUrl || job.url;
        const printPath = job.pdfLocalPath || job.localPath || job.pdfFileName || job.fileName;
        return printUrl
          ? `<a class="ghost-btn" href="${printUrl}" target="_blank" rel="noopener">${job.pdfUrl ? "PDF in" : "File"} ${job.index || 1}</a>`
          : `<span class="customer-note">${printPath || `File ${job.index || 1}`}</span>`;
      }).join("");
      return staffCompactRow(session, [
        { label: "STT", value: index + 1, className: "queue-order" },
        { label: "Mã in", value: printCode },
        { label: "Khách", value: displayName(session.customerName), note: session.contact || "-" },
        { label: "Gói", value: packageLabel(session) },
        { label: "File", value: `${jobs.length}/${session.printCount || jobs.length || 1}`, note: statusLabels[session.status] || session.status },
      ], `
        <a class="ghost-btn" href="${sessionUrl(session)}" target="_blank" rel="noopener">Ghép</a>
        ${links}
        <button class="primary-btn" data-action="printed" data-id="${session.id}" type="button">Đã in</button>
      `, "print-row");
    }).join("")
    : '<div class="empty-state">Chưa có file final chờ in.</div>';
}
function renderDelivery() {
  const target = document.querySelector("#deliveryList");
  if (!target) return;
  const list = state.sessions.filter(isDoneQueue);
  target.innerHTML = list.length
    ? list.map((session) => `
      <article class="staff-row done-row">
        <div><span>Ngày giờ</span><strong>${formatDateTime(session.completedAt || session.printedAt || session.updatedAt || session.createdAt)}</strong></div>
        <div><span>Tên</span><strong>${displayName(session.customerName)}</strong></div>
        <div><span>SĐT</span><strong>${session.contact || "-"}</strong></div>
        <div><span>Mã</span><strong>${codeLabel(session)}</strong></div>
        <div><span>Gói</span><strong>${packageLabel(session)}</strong></div>
        <div><span>Trạng thái</span><strong>${statusLabels[session.status] || session.status}</strong></div>
        <div class="row-actions">${staffMoreActions(session)}</div>
      </article>
    `).join("")
    : '<div class="empty-state">Chưa có phiên hoàn tất.</div>';
}
function renderStats() {
  document.querySelector("#waitingCount").textContent = state.sessions.filter(isPaymentQueue).length;
  document.querySelector("#shootingCount").textContent = state.sessions.filter(isShootWaiting).length;
  document.querySelector("#printCount").textContent = state.sessions.filter(isShootingActive).length;
  document.querySelector("#doneCount").textContent = state.sessions.filter(isPrintQueue).length;
  const retouchCount = state.sessions.filter((session) => ["RETOUCH_REQUESTED", "RETOUCH_IN_PROGRESS"].includes(session.status)).length;
  const retouchBadge = document.querySelector("#retouchTabBadge");
  if (retouchBadge) {
    retouchBadge.textContent = retouchCount;
    retouchBadge.hidden = retouchCount === 0;
  }
}

function sessionRevenue(session) {
  return Math.max(0, Number(session.packagePrice ?? packages[session.packageId]?.price ?? 0));
}

function paidSessionDate(session) {
  const value = session.paidAt || session.completedAt || session.printedAt || session.printRequestedAt || session.finalExportedAt || session.updatedAt || session.createdAt;
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isRevenueSession(session) {
  return session.paymentStatus !== "REFUNDED" && (session.paymentStatus === "PAID" || isPrintQueue(session) || isDoneQueue(session));
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
    .filter(isRevenueSession)
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
    const birthday = session.isBirthday ? `<input type="checkbox" checked disabled><small>${session.birthdayDate || "+5 phút"}</small>` : `<input type="checkbox" disabled>`;
    return `<tr><td>${date.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" })}</td><td><strong>${codeLabel(session)}</strong><small>${session.id}</small></td><td>${displayName(session.customerName || "Khách hàng")}</td><td>${birthday}</td><td>${packageLabel(session)}</td><td>${method}</td><td class="money-cell"><strong>${money.format(sessionRevenue(session))}đ</strong></td></tr>`;
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
  const rows = [["Thời gian", "Mã lượt", "Mã phiên", "Khách hàng", "Sinh nhật", "Ngày sinh", "Gói", "Thanh toán", "Doanh thu"]];
  revenueSessions().forEach((session) => rows.push([
    paidSessionDate(session).toLocaleString("vi-VN"), session.ticket || "", session.id || "", displayName(session.customerName),
    session.isBirthday ? "Có" : "Không", session.birthdayDate || "", packages[session.packageId]?.name || session.packageId || "",
    session.paymentMethod === "CASH" ? "Tiền mặt" : "Chuyển khoản", sessionRevenue(session),
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
  if (!document.activeElement?.matches?.("[data-birthday-toggle], [data-birthday-date]")) renderQueue();
  renderActive();
  renderAutoFilterMonitor();
  renderRetouch();
  renderCompose();
  renderFrameManager();
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
  if (action === "import-retouch-folder") importRetouchFolder(session);
  if (action === "complete-retouch") completeRetouch(session);
  if (action === "printed") markPrinted(session);
  if (action === "build-zip") buildFinalZip(session);
  if (action === "complete") completeSession(session);
  if (action === "customer-link") openCustomerLinkModal(session);
  if (action === "refund") refundSession(session);
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

document.querySelector("#callNextBtn")?.addEventListener("click", callNext);
document.querySelector("#seedBtn").addEventListener("click", createDemoSession);
document.querySelector("#resetBtn").addEventListener("click", resetDemo);
document.querySelector("#saveAutoFilterSettingBtn")?.addEventListener("click", saveAutoFilterSettingFromForm);
document.querySelector("#addPackageBtn")?.addEventListener("click", addPackage);
document.querySelector("#savePackageSettingsBtn")?.addEventListener("click", savePackageSettingsFromForm);
document.querySelector("#closeCustomerLinkModalBtn")?.addEventListener("click", closeCustomerLinkModal);
document.querySelector("#copyCustomerDirectLinkBtn")?.addEventListener("click", copyCustomerDirectLink);
document.querySelector("#customerLinkModal")?.addEventListener("click", (event) => { if (event.target.id === "customerLinkModal") closeCustomerLinkModal(); });
document.querySelector("#closeFrameTestModalBtn")?.addEventListener("click", closeFrameTestModal);
document.querySelector("#frameTestModal")?.addEventListener("click", (event) => { if (event.target.id === "frameTestModal") closeFrameTestModal(); });
document.querySelector("#frameTestCanvas")?.addEventListener("pointerdown", startFrameSlotDrag);
document.querySelector("#frameTestCanvas")?.addEventListener("pointermove", moveFrameSlotDrag);
document.querySelector("#frameTestCanvas")?.addEventListener("pointerup", stopFrameSlotDrag);
document.querySelector("#frameTestCanvas")?.addEventListener("pointercancel", stopFrameSlotDrag);
document.querySelector("#frameSlotPrevBtn")?.addEventListener("click", () => selectFrameSlot((frameTestState?.selected || 0) - 1));
document.querySelector("#frameSlotNextBtn")?.addEventListener("click", () => selectFrameSlot((frameTestState?.selected || 0) + 1));
document.querySelector("#frameSlotBackBtn")?.addEventListener("click", () => swapFrameSlot(-1));
document.querySelector("#frameSlotForwardBtn")?.addEventListener("click", () => swapFrameSlot(1));
document.querySelector("#addFrameSlotBtn")?.addEventListener("click", addFrameSlot);
document.querySelector("#rotateFrameSlotBtn")?.addEventListener("click", rotateFrameSlot);
document.querySelector("#deleteFrameSlotBtn")?.addEventListener("click", deleteFrameSlot);
document.querySelector("#saveFrameSlotsBtn")?.addEventListener("click", saveFrameSlots);
["X", "Y", "W", "H"].forEach((key) => {
  document.querySelector(`#frameSlot${key}`)?.addEventListener("input", (event) => {
    updateSelectedFrameSlot({ [key.toLowerCase()]: Number(event.target.value) });
  });
});
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
  const managedFrameDelete = event.target.closest("[data-frame-manager-delete]");
  if (managedFrameDelete) {
    event.preventDefault();
    event.stopPropagation();
    deleteManagedFrame(managedFrameDelete.dataset.frameManagerDelete);
    return;
  }
  const managedFrameEdit = event.target.closest("[data-frame-manager-edit]");
  if (managedFrameEdit) {
    event.preventDefault();
    event.stopPropagation();
    const frameId = managedFrameEdit.dataset.frameManagerEdit;
    const pack = Object.values(packages).find((item) => getPackageFrameCatalog(item).some((frame) => frame.id === frameId)) || packages["3"];
    testPackageFrame(pack.id, frameId).catch(() => showToast("Khong test duoc frame."));
    return;
  }
  const frameTest = event.target.closest("[data-frame-test]");
  if (frameTest) {
    event.preventDefault();
    event.stopPropagation();
    testPackageFrame(frameTest.dataset.packageTest, frameTest.dataset.frameTest).catch(() => showToast("Khong test duoc frame."));
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const session = state.sessions.find((item) => item.id === button.dataset.id);
  handleAction(button.dataset.action, session);
});
document.body.addEventListener("change", (event) => {
  const birthdayControl = event.target.closest("[data-birthday-toggle], [data-birthday-date]");
  if (birthdayControl) {
    updateBirthdayDraft(birthdayControl);
    return;
  }
  const packageField = event.target.closest("[data-package-field]");
  if (packageField) {
    updatePackageField(packageField);
    savePackageSettings();
    renderPackageSettings();
    return;
  }
  const managedUpload = event.target.closest("#managedFrameUpload");
  if (managedUpload) {
    uploadManagedFrame(managedUpload);
    return;
  }
  const packageFrame = event.target.closest("[data-package-frame]");
  if (packageFrame) {
    const card = packageFrame.closest("[data-package-id]");
    toggleFramePackage(packageFrame.dataset.packageFrame, card?.dataset.packageId, packageFrame.checked);
    return;
  }
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
document.body.addEventListener("input", (event) => {
  const retouchFolder = event.target.closest("[data-retouch-folder]");
  if (retouchFolder) retouchFolderDrafts.set(retouchFolder.dataset.retouchFolder, retouchFolder.value);
  const birthdayControl = event.target.closest("[data-birthday-date]");
  if (birthdayControl) updateBirthdayDraft(birthdayControl);
  const packageField = event.target.closest("[data-package-field]");
  if (packageField) updatePackageField(packageField);
});

function setDashboardView(view) {
  const activeView = ["operations", "retouch", "compose", "done", "revenue", "frames", "management"].includes(view) ? view : "operations";
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
