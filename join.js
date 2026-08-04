const API_STATE_URL = "/api/state";

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

async function joinSession() {
  const input = document.querySelector("#joinCodeInput");
  const message = document.querySelector("#joinMessage");
  const code = normalizeCode(input.value);
  if (!code) {
    message.textContent = "Vui lòng nhập số chờ hoặc mã phiên.";
    return;
  }

  try {
    const response = await fetch(API_STATE_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("Cannot load sessions");
    const store = await response.json();
    const session = (store.sessions || []).find((item) => normalizeCode(item.ticket) === code || normalizeCode(item.id) === code);
    if (!session) {
      message.textContent = "Chưa tìm thấy phiên này. Kiểm tra lại số trên bill hoặc hỏi nhân viên.";
      return;
    }
    const params = new URLSearchParams({
      session: session.id,
      maxPhotos: String(session.frameSlots || 4),
    });
    window.location.href = `/customer.html?${params.toString()}`;
  } catch {
    message.textContent = "Chưa kết nối được máy chủ local. Hãy kiểm tra WiFi của cửa hàng.";
  }
}

document.querySelector("#joinSessionBtn").addEventListener("click", joinSession);
document.querySelector("#joinCodeInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") joinSession();
});
