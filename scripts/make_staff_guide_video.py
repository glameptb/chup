from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "vendor_py"))

import imageio
import numpy as np
from PIL import Image, ImageDraw, ImageFont


W, H = 1080, 1920
FPS = 15
OUT = ROOT / "exports" / "glame-huong-dan-nhan-vien.mp4"


def font(size: int, bold: bool = False):
    candidates = [
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
    ]
    for item in candidates:
        if Path(item).exists():
            return ImageFont.truetype(item, size)
    return ImageFont.load_default()


FONT_TITLE = font(78, True)
FONT_SUB = font(40)
FONT_CARD = font(42, True)
FONT_SMALL = font(30)
FONT_BRAND = font(38, True)


def rounded(draw, xy, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def wrap_text(draw, text, fnt, max_width):
    lines = []
    words = text.split()
    line = ""
    for word in words:
        test = f"{line} {word}".strip()
        if draw.textbbox((0, 0), test, font=fnt)[2] <= max_width:
            line = test
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def text_block(draw, text, x, y, fnt, fill, max_width, gap=10):
    for line in wrap_text(draw, text, fnt, max_width):
        draw.text((x, y), line, font=fnt, fill=fill)
        y += fnt.size + gap
    return y


def build_bg():
    small = Image.new("RGB", (80, 140), "#f8efe3")
    pix = small.load()
    for y in range(small.height):
        for x in range(small.width):
            a = x / small.width
            b = y / small.height
            pix[x, y] = (248, int(237 - 26 * b + 9 * a), int(224 - 22 * a + 9 * b))
    img = small.resize((W, H), Image.Resampling.BICUBIC).convert("RGBA")
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse((-170, -130, 440, 420), fill=(199, 154, 69, 42))
    od.ellipse((700, 1240, 1320, 2020), fill=(109, 168, 152, 40))
    return Image.alpha_composite(img, overlay)


BG = build_bg()


def brand(draw):
    rounded(draw, (52, 54, 500, 142), 24, (255, 250, 243, 232), outline=(230, 216, 199, 255), width=2)
    rounded(draw, (74, 74, 122, 122), 12, (31, 27, 23, 255))
    draw.text((98, 97), "G", font=font(34, True), fill="white", anchor="mm")
    draw.text((142, 82), "Glame Staff", font=FONT_BRAND, fill="#1f1b17")
    draw.text((142, 116), "Hướng dẫn vận hành", font=FONT_SMALL, fill="#756b62")


def dashboard(draw, x, y, rows):
    rounded(draw, (x, y, x + 860, y + 640), 26, (255, 255, 255, 245), outline=(230, 216, 199, 255), width=2)
    draw.text((x + 36, y + 36), "Dashboard nhân viên", font=font(46, True), fill="#1f1b17")
    yy = y + 120
    for ticket, name, status in rows:
        rounded(draw, (x + 30, yy, x + 830, yy + 86), 18, (248, 241, 232, 255))
        draw.text((x + 58, yy + 43), ticket, font=font(38, True), fill="#1f1b17", anchor="lm")
        draw.text((x + 190, yy + 34), name, font=font(30, True), fill="#1f1b17", anchor="lm")
        draw.text((x + 190, yy + 66), status, font=font(24), fill="#756b62", anchor="lm")
        yy += 104


def button(draw, xy, label, fill="#1f1b17"):
    rounded(draw, xy, 18, fill)
    draw.text(((xy[0] + xy[2]) / 2, (xy[1] + xy[3]) / 2), label, font=font(30, True), fill="white", anchor="mm")


def qr_mock(draw, x, y, size=250):
    rounded(draw, (x, y, x + size, y + size), 12, (255, 255, 255, 255), outline=(31, 27, 23, 255), width=12)
    cell = size // 6
    gap = size // 18
    start = x + size // 9
    top = y + size // 9
    for row in range(4):
        for col in range(4):
            if (row, col) in {(0, 2), (1, 3), (2, 1), (3, 0)}:
                continue
            rounded(
                draw,
                (start + col * (cell + gap), top + row * (cell + gap), start + col * (cell + gap) + cell, top + row * (cell + gap) + cell),
                5,
                (31, 27, 23, 255),
            )


def checkin_payment_screen(draw, x, y, mode):
    rounded(draw, (x, y, x + 820, y + 650), 28, (255, 255, 255, 245), outline=(230, 216, 199, 255), width=2)
    draw.text((x + 42, y + 54), "Màn check-in & thanh toán", font=font(44, True), fill="#1f1b17")
    if mode == "info":
        rows = [("Tên khách", "Nguyễn Minh Anh"), ("SĐT/Zalo", "0988888888"), ("Gói chụp", "5 phút - 149.000đ")]
        yy = y + 130
        for label, value in rows:
            rounded(draw, (x + 42, yy, x + 778, yy + 88), 18, (248, 241, 232, 255))
            draw.text((x + 70, yy + 32), label, font=font(24), fill="#756b62")
            draw.text((x + 70, yy + 66), value, font=font(32, True), fill="#1f1b17", anchor="lm")
            yy += 112
        button(draw, (x + 170, y + 520, x + 650, y + 595), "Thanh toán")
    else:
        qr_mock(draw, x + 70, y + 160, 300)
        draw.text((x + 470, y + 190), "Order code", font=font(28), fill="#756b62")
        draw.text((x + 470, y + 250), "GL-0008", font=font(62, True), fill="#1f1b17")
        draw.text((x + 470, y + 340), "Số tiền", font=font(28), fill="#756b62")
        draw.text((x + 470, y + 400), "149.000đ", font=font(54, True), fill="#c79a45")
        draw.text((x + 70, y + 505), "Nội dung chuyển khoản: GL-0008", font=font(30, True), fill="#1f1b17")
        button(draw, (x + 210, y + 555, x + 730, y + 622), "Xác nhận đã thanh toán")


def folder_flow(draw, x, y):
    labels = ["D:\\Photobooth\\Incoming", "Active: GL-0008", "Sessions\\GL-0008\\raw"]
    for idx, label in enumerate(labels):
        yy = y + idx * 150
        rounded(draw, (x, yy, x + 780, yy + 96), 20, (255, 255, 255, 245), outline=(230, 216, 199, 255), width=2)
        draw.text((x + 34, yy + 50), label, font=font(34, True), fill="#1f1b17", anchor="lm")
        if idx < len(labels) - 1:
            draw.text((x + 390, yy + 122), "↓", font=font(44, True), fill="#c79a45", anchor="mm")


def print_card(draw, x, y):
    rounded(draw, (x, y, x + 820, y + 520), 28, (255, 255, 255, 245), outline=(230, 216, 199, 255), width=2)
    draw.text((x + 42, y + 58), "Chờ in", font=font(52, True), fill="#1f1b17")
    draw.text((x + 42, y + 128), "GL-0008_final_01.jpg", font=font(34, True), fill="#756b62")
    rounded(draw, (x + 90, y + 210, x + 730, y + 390), 24, (31, 27, 23, 255))
    draw.text((x + 410, y + 300), "PRINT", font=font(64, True), fill="white", anchor="mm")
    button(draw, (x + 150, y + 420, x + 670, y + 486), "Đánh dấu đã in")


SCENES = [
    ("1", "Mở màn check-in tại quầy", "Nhân viên nhập tên, SĐT/Zalo và chọn gói chụp cho khách.", "checkin"),
    ("2", "Hiển thị QR thanh toán", "Máy quầy hiển thị mã phiên, số tiền và nội dung chuyển khoản.", "payment"),
    ("3", "Xác nhận đã thanh toán", "Sau khi kiểm tra giao dịch, bấm xác nhận để phát số đợi cho khách.", "paid"),
    ("4", "Mở dashboard nhân viên", "Theo dõi hàng chờ, phiên đang chụp, yêu cầu chỉnh sửa tự động, chờ in và ZIP cuối.", "dashboard"),
    ("5", "Gọi số tiếp theo", "Khách đã thanh toán mới xuất hiện trong hàng chờ. Bấm gọi số khi booth sẵn sàng.", "call"),
    ("6", "Xác nhận khách có mặt", "Khi khách đến quầy/phòng chụp, bấm Khách đã có mặt để bắt đầu session active.", "present"),
    ("7", "Bắt đầu chụp", "Chỉ một session active được nhận ảnh từ digiCamControl Incoming.", "shoot"),
    ("8", "Theo dõi ảnh raw", "Local Agent gom ảnh từ Incoming vào đúng folder raw của session active.", "incoming"),
    ("9", "Tạm dừng khi lỗi camera", "Nếu camera hoặc digiCamControl lỗi, bấm tạm dừng. Timer dừng và ảnh mới không tự gán vào session.", "pause"),
    ("10", "Xử lý chỉnh sửa tự động", "Khi khách yêu cầu, nhân viên xem queue, chỉnh ảnh và đánh dấu đã chỉnh xong.", "retouch"),
    ("11", "In file final", "Khi khách xuất final, dashboard hiện mục chờ in. Nhân viên in và đánh dấu đã in.", "print"),
    ("12", "Tạo ZIP cuối", "Chỉ tạo ZIP cuối sau khi ảnh đã in xong. FotoShare là tùy chọn sau cùng.", "zip"),
]


def draw_scene(scene, progress):
    step, title, subtitle, kind = scene
    img = BG.copy()
    draw = ImageDraw.Draw(img)
    brand(draw)
    draw.text((72, 240), f"Bước {step}", font=font(34, True), fill="#c79a45")
    text_block(draw, title, 72, 300, FONT_TITLE, "#1f1b17", 900, 8)
    text_block(draw, subtitle, 72, 510, FONT_SUB, "#756b62", 900, 12)

    if kind == "checkin":
        checkin_payment_screen(draw, 130, 760, "info")
    elif kind == "payment":
        checkin_payment_screen(draw, 130, 760, "payment")
    elif kind == "paid":
        checkin_payment_screen(draw, 130, 720, "payment")
        rounded(draw, (210, 1420, 870, 1530), 30, (31, 27, 23, 255))
        draw.text((540, 1460), "Phát số đợi: A008", font=font(46, True), fill="white", anchor="mm")
        draw.text((540, 1510), "Trạng thái: WAITING", font=font(30, True), fill="#c79a45", anchor="mm")
    elif kind == "dashboard":
        dashboard(draw, 110, 760, [("A006", "Đang chụp", "SHOOTING"), ("A007", "Đang chờ", "WAITING"), ("A008", "Nguyễn Minh Anh", "Đã thanh toán")])
    elif kind == "call":
        dashboard(draw, 110, 740, [("A008", "Nguyễn Minh Anh", "WAITING"), ("A009", "Trần Hoàng Nam", "WAITING")])
        button(draw, (250, 1370, 830, 1450), "Gọi số tiếp theo")
    elif kind == "present":
        dashboard(draw, 110, 740, [("A008", "Nguyễn Minh Anh", "CALLING"), ("A009", "Trần Hoàng Nam", "WAITING")])
        button(draw, (210, 1370, 870, 1450), "Khách đã có mặt")
    elif kind == "shoot":
        rounded(draw, (150, 760, 930, 1290), 30, (255, 255, 255, 245), outline=(230, 216, 199, 255), width=2)
        draw.text((540, 850), "GL-0008", font=font(82, True), fill="#1f1b17", anchor="mm")
        draw.text((540, 960), "04:32", font=font(130, True), fill="#c79a45", anchor="mm")
        draw.text((540, 1090), "Ảnh đã nhận: 12", font=font(44, True), fill="#756b62", anchor="mm")
        button(draw, (230, 1180, 850, 1258), "Kết thúc phiên chụp")
    elif kind == "incoming":
        folder_flow(draw, 150, 780)
    elif kind == "pause":
        rounded(draw, (140, 790, 940, 1260), 30, (31, 27, 23, 255))
        draw.text((540, 890), "PAUSED", font=font(98, True), fill="white", anchor="mm")
        draw.text((540, 1010), "Camera disconnect", font=font(44, True), fill="#c79a45", anchor="mm")
        draw.text((540, 1120), "Còn lại: 02:15", font=font(48, True), fill="white", anchor="mm")
        button(draw, (250, 1170, 830, 1246), "Tiếp tục chụp", fill="#6da898")
    elif kind == "retouch":
        dashboard(draw, 110, 740, [("GL-0008", "Ảnh cần chỉnh: 10", "Mức: Tự nhiên"), ("Ghi chú", "Làm da sáng nhẹ", "Giữ mặt tự nhiên")])
        button(draw, (220, 1370, 860, 1450), "Đánh dấu đã chỉnh xong")
    elif kind == "print":
        print_card(draw, 130, 760)
    elif kind == "zip":
        rounded(draw, (170, 780, 910, 1180), 34, (31, 27, 23, 255))
        draw.text((540, 900), "PRINTED", font=font(74, True), fill="white", anchor="mm")
        draw.text((540, 1010), "Bây giờ mới tạo ZIP cuối", font=font(42, True), fill="#c79a45", anchor="mm")
        button(draw, (250, 1240, 830, 1320), "Tạo ZIP cuối")

    dot_y = H - 118
    start_x = 232
    for idx in range(len(SCENES)):
        fill = "#1f1b17" if idx == int(step) - 1 else "#d8c8b6"
        draw.ellipse((start_x + idx * 72, dot_y, start_x + idx * 72 + 22, dot_y + 22), fill=fill)
    return img.convert("RGB")


def fade(a, b, alpha):
    return Image.blend(a, b, alpha)


def main():
    OUT.parent.mkdir(exist_ok=True)
    seconds_per_scene = 3.5
    transition = 0.25
    scene_frames = int(seconds_per_scene * FPS)
    transition_frames = max(1, int(transition * FPS))

    with imageio.get_writer(
        OUT,
        fps=FPS,
        codec="libx264",
        quality=8,
        pixelformat="yuv420p",
        macro_block_size=1,
    ) as writer:
        for scene_index, scene in enumerate(SCENES):
            for frame_index in range(scene_frames):
                progress = frame_index / max(1, scene_frames - 1)
                img = draw_scene(scene, progress)
                if frame_index > scene_frames - transition_frames and scene_index < len(SCENES) - 1:
                    next_img = draw_scene(SCENES[scene_index + 1], 0)
                    alpha = (frame_index - (scene_frames - transition_frames)) / transition_frames
                    img = fade(img, next_img, alpha)
                writer.append_data(np.asarray(img))
    print(OUT)


if __name__ == "__main__":
    main()
