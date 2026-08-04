const scenes = [
  {
    kicker: "Bước 1",
    title: "Quét QR check-in",
    text: "Quét QR tại quầy hoặc phòng chờ để mở trang check-in của Glame.",
    voiceover: "Chào mừng bạn đến với Glame Photobooth. Đầu tiên, hãy quét mã QR tại quầy để bắt đầu check-in và lấy số chờ.",
    art: `
      <div class="scene-art">
        <div class="qr-visual">${"<i></i>".repeat(16)}</div>
        <div class="phone">
          <div class="phone-screen">
            <div class="mini-card"><strong>Glame Photobooth</strong><br>Check-in để lấy số chờ</div>
            <div class="mini-input"></div>
            <div class="mini-input"></div>
            <div class="mini-button">Tiếp tục</div>
          </div>
        </div>
      </div>
    `,
  },
  {
    kicker: "Bước 2",
    title: "Nhập thông tin",
    text: "Nhập họ tên và số điện thoại hoặc Zalo để Glame gửi link ảnh và hỗ trợ sau phiên chụp.",
    voiceover: "Bạn nhập họ tên và số điện thoại hoặc Zalo. Thông tin này giúp Glame gửi link ảnh và hỗ trợ nếu cần.",
    art: `
      <div class="scene-art">
        <div class="phone">
          <div class="phone-screen">
            <div class="mini-card"><strong>Thông tin khách hàng</strong></div>
            <div class="mini-input"></div>
            <div class="mini-input"></div>
            <div class="mini-button">Tiếp tục</div>
          </div>
        </div>
        <div class="queue-board">
          <div class="queue-row"><span>Tên khách</span><strong>Nguyễn Minh Anh</strong></div>
          <div class="queue-row"><span>Zalo/SĐT</span><strong>098...</strong></div>
          <div class="queue-row"><span>Trạng thái</span><strong>Check-in</strong></div>
        </div>
      </div>
    `,
  },
  {
    kicker: "Bước 3",
    title: "Chọn gói chụp",
    text: "Chọn gói 3 phút, 5 phút hoặc 10 phút theo nhu cầu. Mỗi gói có quyền sử dụng frame và tùy chọn riêng.",
    voiceover: "Tiếp theo, bạn chọn gói chụp phù hợp: 3 phút, 5 phút hoặc 10 phút. Mỗi gói sẽ có mức giá và quyền sử dụng frame khác nhau.",
    art: `
      <div class="scene-art">
        <div class="queue-board">
          <div class="queue-row"><span>3 phút</span><strong>99.000đ</strong></div>
          <div class="queue-row"><span>5 phút</span><strong>149.000đ</strong></div>
          <div class="queue-row"><span>10 phút</span><strong>249.000đ</strong></div>
        </div>
        <div class="phone">
          <div class="phone-screen">
            <div class="mini-card"><strong>Gói 5 phút</strong><br>Frame basic + standard</div>
            <div class="mini-card">Có thể yêu cầu chỉnh sửa tự động</div>
            <div class="mini-button">Thanh toán</div>
          </div>
        </div>
      </div>
    `,
  },
  {
    kicker: "Bước 4",
    title: "Thanh toán QR",
    text: "Quét QR thanh toán. Nội dung chuyển khoản là mã phiên, ví dụ GL-0008.",
    voiceover: "Sau khi chọn gói, bạn quét QR để thanh toán. Nội dung chuyển khoản sẽ là mã phiên của bạn.",
    art: `
      <div class="scene-art">
        <div class="qr-visual">${"<i></i>".repeat(16)}</div>
        <div class="phone">
          <div class="phone-screen">
            <div class="mini-card"><strong>GL-0008</strong><br>Nội dung chuyển khoản</div>
            <div class="ticket-big" style="height:120px;font-size:34px">149K</div>
            <div class="mini-button">Đã thanh toán</div>
          </div>
        </div>
      </div>
    `,
  },
  {
    kicker: "Bước 5",
    title: "Nhận số đợi",
    text: "Sau khi thanh toán, bạn nhận số đợi. Vui lòng chờ nhân viên gọi số trước khi vào phòng chụp.",
    voiceover: "Khi thanh toán thành công, hệ thống sẽ cấp số đợi. Bạn vui lòng chờ nhân viên gọi số rồi mới vào phòng chụp.",
    art: `
      <div class="scene-art">
        <div class="phone">
          <div class="phone-screen">
            <div class="mini-card"><strong>Số đợi của bạn</strong></div>
            <div class="ticket-big">A008</div>
            <div class="mini-card">Vị trí hàng chờ: 3</div>
          </div>
        </div>
        <div class="queue-board">
          <div class="queue-row"><span>A006</span><strong>Đang chụp</strong></div>
          <div class="queue-row"><span>A007</span><strong>Đang chờ</strong></div>
          <div class="queue-row"><span>A008</span><strong>Đã thanh toán</strong></div>
        </div>
      </div>
    `,
  },
  {
    kicker: "Bước 6",
    title: "Vào phòng chụp",
    text: "Khi đến lượt, nhân viên sẽ gọi số. digiCamControl sẽ chụp và lưu ảnh local để app gom vào đúng phiên.",
    voiceover: "Khi đến lượt, nhân viên gọi số và bắt đầu phiên chụp. Camera chụp bằng digiCamControl, còn app sẽ gom ảnh vào đúng phiên của bạn.",
    art: `
      <div class="scene-art">
        <div class="camera-box"></div>
        <div class="folder-flow">
          <div class="folder">D:\\Photobooth\\Incoming</div>
          <div class="folder">GL-0008\\raw</div>
          <div class="folder">Ảnh đã nhận: 26</div>
        </div>
      </div>
    `,
  },
  {
    kicker: "Bước 7",
    title: "Xem ảnh raw",
    text: "Sau khi chụp xong, bạn có thể xem ảnh gốc, tải raw hoặc yêu cầu chỉnh sửa tự động trước khi ghép frame.",
    voiceover: "Sau khi chụp xong, bạn mở trang phiên để xem toàn bộ ảnh gốc. Bạn có thể tải ảnh raw hoặc gửi yêu cầu chỉnh sửa tự động.",
    art: `
      <div class="scene-art">
        <div class="gallery-grid">
          ${"<div class='photo-thumb'></div>".repeat(8)}
        </div>
        <div class="phone">
          <div class="phone-screen">
            <div class="mini-card"><strong>Ảnh raw đã sẵn sàng</strong><br>26 ảnh</div>
            <div class="mini-button">Tải tất cả raw</div>
            <div class="mini-card">Yêu cầu chỉnh sửa tự động</div>
          </div>
        </div>
      </div>
    `,
  },
  {
    kicker: "Bước 8",
    title: "Ghép frame trên app",
    text: "Chọn frame theo gói, đưa ảnh vào slot, kéo để căn vị trí và zoom giống thao tác trên Canva.",
    voiceover: "Bạn chọn frame, chọn ảnh đưa vào từng ô, kéo để căn vị trí và dùng zoom để phóng to hoặc thu nhỏ ảnh trước khi xuất file.",
    art: `
      <div class="scene-art">
        <div class="gallery-grid">
          ${"<div class='photo-thumb'></div>".repeat(4)}
        </div>
        <div class="editor-frame">
          <div class="editor-slot"></div>
          <div class="editor-slot"></div>
        </div>
      </div>
    `,
  },
  {
    kicker: "Bước 9",
    title: "In ảnh và nhận file",
    text: "Khi hoàn tất, app chuyển file final cho nhân viên in. Sau khi in xong, ZIP cuối hoặc FotoShare mới được tạo nếu cần.",
    voiceover: "Khi hoàn tất, bạn bấm xuất final để chuyển cho nhân viên in. Sau khi ảnh đã in xong, Glame mới tạo ZIP cuối hoặc upload FotoShare nếu bạn cần.",
    art: `
      <div class="scene-art">
        <div class="print-card">
          <strong>GL-0008_final_01.jpg</strong>
          <p class="muted">Chờ nhân viên in</p>
          <div class="printer"></div>
        </div>
        <div class="zip-box">ZIP</div>
      </div>
    `,
  },
];

const sceneLayer = document.querySelector("#sceneLayer");
const sceneKicker = document.querySelector("#sceneKicker");
const sceneTitle = document.querySelector("#sceneTitle");
const sceneText = document.querySelector("#sceneText");
const progressBar = document.querySelector("#progressBar");
const sceneList = document.querySelector("#sceneList");
const voiceoverText = document.querySelector("#voiceoverText");
const playPauseBtn = document.querySelector("#playPauseBtn");

let currentScene = 0;
let playing = true;
let startedAt = Date.now();
let elapsedBeforePause = 0;
const sceneDuration = 7200;

function renderScene(index) {
  currentScene = (index + scenes.length) % scenes.length;
  const scene = scenes[currentScene];
  sceneLayer.innerHTML = scene.art;
  sceneKicker.textContent = scene.kicker;
  sceneTitle.textContent = scene.title;
  sceneText.textContent = scene.text;
  voiceoverText.textContent = scene.voiceover;
  [...sceneList.children].forEach((button, buttonIndex) => {
    button.classList.toggle("is-active", buttonIndex === currentScene);
  });
  startedAt = Date.now();
  elapsedBeforePause = 0;
  progressBar.style.width = "0%";
}

function renderSceneList() {
  sceneList.innerHTML = scenes
    .map((scene, index) => `
      <button type="button" data-scene="${index}">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <strong>${scene.title}</strong>
      </button>
    `)
    .join("");
}

function tick() {
  if (playing) {
    const elapsed = elapsedBeforePause + Date.now() - startedAt;
    const progress = Math.min(1, elapsed / sceneDuration);
    progressBar.style.width = `${progress * 100}%`;
    if (progress >= 1) {
      renderScene(currentScene + 1);
    }
  }
  requestAnimationFrame(tick);
}

function setPlaying(nextPlaying) {
  playing = nextPlaying;
  playPauseBtn.textContent = playing ? "Tạm dừng" : "Phát tiếp";
  if (playing) {
    startedAt = Date.now();
    return;
  }
  elapsedBeforePause += Date.now() - startedAt;
}

document.querySelector("#nextBtn").addEventListener("click", () => renderScene(currentScene + 1));
document.querySelector("#prevBtn").addEventListener("click", () => renderScene(currentScene - 1));
playPauseBtn.addEventListener("click", () => setPlaying(!playing));
document.querySelector("#fullscreenBtn").addEventListener("click", () => {
  document.querySelector(".stage").requestFullscreen?.();
});

sceneList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-scene]");
  if (!button) return;
  renderScene(Number(button.dataset.scene));
});

renderSceneList();
renderScene(0);
tick();
