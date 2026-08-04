const API_STATE_URL = "/api/state";
const ACTIVE_SESSION_KEY = "glame-active-customer-session";
const PACKAGE_SETTINGS_KEY = "glame-package-settings-v1";

const rooms = [
  { id: "room-1", name: "Phòng 1" },
];

const packages = {
  "3": { id: "3", name: "Gói 3 phút", minutes: 3, price: 99000, printCount: 1, frameSlots: 4, defaultFrameId: "frame1", allowedFrames: ["frame1"] },
  "5": { id: "5", name: "Gói 5 phút", minutes: 5, price: 149000, printCount: 2, frameSlots: 4, defaultFrameId: "frame1", allowedFrames: ["frame1", "frame2"] },
  "10": { id: "10", name: "Gói 10 phút", minutes: 10, price: 249000, printCount: 3, frameSlots: 4, defaultFrameId: "frame1", allowedFrames: ["frame1", "frame2"] },
};

const defaultFrames = [
  { id: "frame1", name: "ChanBaek Rainbow", src: "assets/frame1-2.png", maxPhotos: 4 },
  { id: "frame2", name: "ChanBaek Red", src: "assets/frame2-2.png", maxPhotos: 4 },
];

const draft = { roomId: "room-1", name: "", contact: "", packageId: "3", paymentMethod: "BANK_TRANSFER", paymentCode: "" };
let state = { nextNumber: 1, sessions: [] };
const money = new Intl.NumberFormat("vi-VN");
const toast = document.querySelector("#toast");

function loadPackageSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(PACKAGE_SETTINGS_KEY));
    Object.entries(stored || {}).forEach(([id, patch]) => {
      if (!packages[id]) return;
      packages[id] = { ...packages[id], ...patch, id };
    });
  } catch {}
}

async function loadState() {
  const response = await fetch(API_STATE_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("Không tải được danh sách phiên.");
  state = await response.json();
  if (!Array.isArray(state.sessions)) state.sessions = [];
  state.nextNumber = Math.max(1, Number(state.nextNumber || 1));
  if (state.packageSettings && typeof state.packageSettings === "object") {
    Object.entries(state.packageSettings).forEach(([id, patch]) => {
      if (packages[id]) packages[id] = { ...packages[id], ...patch, id };
    });
  }
}

async function saveState() {
  const response = await fetch(API_STATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  if (response.status === 409) {
    await loadState();
    throw new Error("Dữ liệu vừa thay đổi. Vui lòng xác nhận lại.");
  }
  if (!response.ok) throw new Error("Không lưu được phiên.");
  const result = await response.json();
  state._revision = result.revision;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 2400);
}

function setStep(step) {
  document.querySelectorAll("[data-checkin-panel]").forEach((panel) => panel.classList.toggle("is-visible", panel.dataset.checkinPanel === step));
  document.querySelectorAll("[data-step-dot]").forEach((dot) => dot.classList.toggle("is-active", dot.dataset.stepDot === step));
}

function sessionMinutes(session) {
  if (session.status === "SHOOTING" && Number.isFinite(Number(session.remainingSeconds))) return Math.max(0, Number(session.remainingSeconds) / 60);
  return Number(packages[session.packageId]?.minutes || session.packageMinutes || 5);
}

function roomQueue(roomId) {
  return state.sessions.filter((session) => session.roomId === roomId && ["WAITING", "REJOINED_QUEUE", "CALLING", "READY_TO_SHOOT", "SHOOTING", "PAUSED"].includes(session.status));
}

function roomWaitMinutes(roomId) {
  return Math.ceil(roomQueue(roomId).reduce((total, session) => total + sessionMinutes(session), 0));
}

function renderRooms() {
  document.querySelector("#roomGrid").innerHTML = rooms.map((room) => {
    const wait = roomWaitMinutes(room.id);
    const queue = roomQueue(room.id).length;
    return `<button class="room-option${draft.roomId === room.id ? " is-selected" : ""}" data-room="${room.id}" type="button"><strong>${room.name}</strong><span>${queue ? `${queue} phiên · khoảng ${wait} phút` : "Đang trống"}</span></button>`;
  }).join("");
}

function renderPackages() {
  document.querySelector("#checkinPackageGrid").innerHTML = Object.values(packages).map((pack) => `
    <button class="package${draft.packageId === pack.id ? " is-selected" : ""}" data-package="${pack.id}" type="button">
      <span>${pack.name}</span><strong>${pack.minutes} phút</strong><em>${money.format(pack.price)}đ</em>
      <small>${pack.printCount || 1} lượt ghép/in · tối đa ${pack.frameSlots || 4} ảnh/frame</small>
    </button>`).join("");
}

function updatePaymentDetail() {
  const pack = packages[draft.packageId];
  if (!draft.paymentCode) {
    const contactSuffix = draft.contact.replace(/\D/g, "").slice(-4) || "0000";
    draft.paymentCode = `GLAME ${contactSuffix} ${String(Date.now()).slice(-5)}`;
  }
  document.querySelector("#transferContent").textContent = draft.paymentCode;
  document.querySelector("#paymentAmount").textContent = `${money.format(pack.price)}đ`;
  document.querySelector("#bankPaymentDetail").hidden = draft.paymentMethod !== "BANK_TRANSFER";
  document.querySelector("#cashPaymentDetail").hidden = draft.paymentMethod !== "CASH";
}

function nextSessionNumber() {
  const today = new Date().toLocaleDateString("en-CA");
  const used = new Set(state.sessions
    .filter((session) => new Date(session.createdAt || 0).toLocaleDateString("en-CA") === today)
    .map((session) => String(session.ticket || "").replace(/\D/g, ""))
    .filter(Boolean));
  for (let i = 0; i < 100; i++) {
    var code = String(Math.floor(1000 + Math.random() * 9000));
    if (!used.has(code)) {
      return code;
    }
  }
  return String(Date.now()).slice(-4);
}

async function createSession(paymentMethod) {
  await loadState();
  const code = nextSessionNumber();
  const pack = packages[draft.packageId];
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const id = `GL-${today}-${code}`;
  const paid = paymentMethod === "BANK_TRANSFER";
  const session = {
    id,
    ticket: code,
    customerName: draft.name,
    contact: draft.contact,
    roomId: draft.roomId,
    roomName: rooms.find((room) => room.id === draft.roomId)?.name || draft.roomId,
    packageId: pack.id,
    packageMinutes: pack.minutes,
    packagePrice: Number(pack.price || 0),
    paymentMethod,
    paymentCode: draft.paymentCode,
    paymentStatus: paid ? "PAID" : "CASH_PENDING",
    status: paid ? "WAITING" : "PAYMENT_CASH_PENDING",
    frameSlots: Number(pack.frameSlots || 4),
    printCount: Number(pack.printCount || 1),
    defaultFrameId: pack.defaultFrameId || null,
    allowedFrames: pack.allowedFrames || ["frame1", "frame2"],
    availableFrames: (pack.frameCatalog || defaultFrames).filter((frame) => (pack.allowedFrames || ["frame1", "frame2"]).includes(frame.id)),
    finalJobs: [], rawCount: 0,
    createdAt: new Date().toISOString(),
    paidAt: paid ? new Date().toISOString() : null,
  };
  state.sessions.push(session);
  await saveState();
  localStorage.setItem(ACTIVE_SESSION_KEY, session.id);
  showTicket(session);
}

function showTicket(session) {
  const pack = packages[session.packageId];
  const queue = roomQueue(session.roomId);
  const position = queue.findIndex((item) => item.id === session.id);
  const wait = Math.ceil(queue.slice(0, Math.max(0, position)).reduce((total, item) => total + sessionMinutes(item), 0));
  const cashPending = session.status === "PAYMENT_CASH_PENDING";
  document.querySelector("#ticketTitle").textContent = cashPending ? "Chờ nhân viên xác nhận tiền mặt" : "Phiên đã vào hàng chờ";
  document.querySelector("#ticketNumber").textContent = session.ticket;
  document.querySelector("#ticketMeta").textContent = `${session.roomName} · ${pack?.name || session.packageId} · ${cashPending ? "Chưa xác nhận thanh toán" : "Đã thanh toán"}`;
  document.querySelector("#ticketWaitTime").textContent = cashPending ? "Chờ xác nhận" : `${wait} phút`;
  document.querySelector("#sessionLink").href = `customer.html?session=${encodeURIComponent(session.id)}`;
  setStep("ticket");
}

document.querySelector("#roomGrid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-room]");
  if (!button) return;
  draft.roomId = button.dataset.room;
  renderRooms();
});
document.querySelector("#continueRoomBtn").addEventListener("click", () => setStep("info"));
document.querySelector("#continueInfoBtn").addEventListener("click", () => {
  draft.name = document.querySelector("#customerNameInput").value.trim();
  draft.contact = document.querySelector("#customerContactInput").value.trim();
  if (!draft.name || !draft.contact) return showToast("Vui lòng nhập tên và số điện thoại/Zalo.");
  setStep("package");
});
document.querySelector("#checkinPackageGrid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-package]");
  if (!button) return;
  draft.packageId = button.dataset.package;
  renderPackages();
});
document.querySelector("#continuePackageBtn").addEventListener("click", () => { updatePaymentDetail(); setStep("payment"); });
document.querySelector("#paymentMethods").addEventListener("click", (event) => {
  const button = event.target.closest("[data-payment]");
  if (!button) return;
  draft.paymentMethod = button.dataset.payment;
  document.querySelectorAll("[data-payment]").forEach((item) => item.classList.toggle("is-selected", item === button));
  updatePaymentDetail();
});
document.querySelector("#confirmTransferBtn").addEventListener("click", () => createSession("BANK_TRANSFER").catch((error) => showToast(error.message)));
document.querySelector("#requestCashBtn").addEventListener("click", () => createSession("CASH").catch((error) => showToast(error.message)));

async function boot() {
  loadPackageSettings();
  await loadState();
  const forceNew = new URLSearchParams(location.search).get("new") === "1";
  if (forceNew) localStorage.removeItem(ACTIVE_SESSION_KEY);
  const activeId = localStorage.getItem(ACTIVE_SESSION_KEY);
  const active = state.sessions.find((session) => session.id === activeId && !["COMPLETED", "PRINTED"].includes(session.status));
  if (active && !forceNew) {
    location.replace(`customer.html?session=${encodeURIComponent(active.id)}`);
    return;
  }
  renderRooms();
  renderPackages();
  updatePaymentDetail();
  setStep("room");
}

boot().catch((error) => showToast(error.message));
