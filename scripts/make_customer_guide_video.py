from __future__ import annotations

import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "vendor_py"))

import imageio
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


W, H = 1080, 1920
FPS = 15
OUT = ROOT / "exports" / "glame-huong-dan-khach-hang.mp4"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
    ]
    for item in candidates:
        if Path(item).exists():
            return ImageFont.truetype(item, size)
    return ImageFont.load_default()


FONT_TITLE = font(82, True)
FONT_SUB = font(42)
FONT_BODY = font(48, True)
FONT_SMALL = font(32)
FONT_BRAND = font(38, True)


def rounded(draw: ImageDraw.ImageDraw, xy, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def wrap_text(draw: ImageDraw.ImageDraw, text: str, fnt, max_width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.split("\n"):
        words = paragraph.split()
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


def text_block(draw, text, xy, fnt, fill, max_width, line_gap=12, anchor="la"):
    x, y = xy
    lines = wrap_text(draw, text, fnt, max_width)
    for line in lines:
        draw.text((x, y), line, font=fnt, fill=fill, anchor=anchor)
        y += fnt.size + line_gap
    return y


def build_background() -> Image.Image:
    small = Image.new("RGB", (80, 140), "#f8efe3")
    pix = small.load()
    for y in range(small.height):
        for x in range(small.width):
            a = x / small.width
            b = y / small.height
            pix[x, y] = (248, int(237 - 24 * b + 10 * a), int(224 - 24 * a + 8 * b))
    img = small.resize((W, H), Image.Resampling.BICUBIC).convert("RGBA")
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse((-160, -120, 420, 390), fill=(199, 154, 69, 38))
    od.ellipse((480, 880, 900, 1360), fill=(201, 111, 130, 34))
    return Image.alpha_composite(img, overlay)


BG = build_background()


def background(t: float) -> Image.Image:
    return BG.copy()


def brand(draw):
    rounded(draw, (52, 54, 470, 142), 24, (255, 250, 243, 230), outline=(230, 216, 199, 255), width=2)
    rounded(draw, (74, 74, 122, 122), 12, (31, 27, 23, 255))
    draw.text((98, 97), "G", font=font(34, True), fill="white", anchor="mm")
    draw.text((142, 82), "Glame Photobooth", font=FONT_BRAND, fill="#1f1b17")
    draw.text((142, 116), "Hướng dẫn nhanh", font=FONT_SMALL, fill="#756b62")


def phone_mock(draw, x, y, label, lines):
    rounded(draw, (x, y, x + 420, y + 760), 48, (25, 22, 19, 255))
    rounded(draw, (x + 22, y + 28, x + 398, y + 732), 36, (255, 250, 243, 255))
    rounded(draw, (x + 150, y + 48, x + 270, y + 62), 8, (25, 22, 19, 255))
    draw.text((x + 52, y + 108), label, font=font(34, True), fill="#1f1b17")
    yy = y + 180
    for line in lines:
        rounded(draw, (x + 52, yy, x + 368, yy + 72), 16, (238, 226, 211, 255))
        draw.text((x + 72, yy + 36), line, font=font(28, True), fill="#1f1b17", anchor="lm")
        yy += 94


def qr_mock(draw, x, y):
    rounded(draw, (x, y, x + 330, y + 330), 12, (255, 255, 255, 255), outline=(31, 27, 23, 255), width=14)
    cell = 54
    for row in range(4):
        for col in range(4):
            if (row, col) in {(0, 2), (1, 3), (2, 1), (3, 0)}:
                continue
            rounded(draw, (x + 32 + col * 66, y + 32 + row * 66, x + 32 + col * 66 + cell, y + 32 + row * 66 + cell), 6, (31, 27, 23, 255))


def frame_preview(draw, x, y):
    rounded(draw, (x, y, x + 420, y + 620), 20, (255, 218, 226, 255), outline=(31, 27, 23, 255), width=4)
    for sx, sy in [(24, 34), (218, 34), (24, 318), (218, 318)]:
        rounded(draw, (x + sx, y + sy, x + sx + 178, y + sy + 250), 8, (31, 27, 23, 255))
    draw.text((x + 210, y + 302), "GLAME", font=font(54, True), fill="#ffffff", anchor="mm", stroke_width=5, stroke_fill="#1f1b17")
    draw.text((x + 210, y + 578), "FINAL", font=font(46, True), fill="#c79a45", anchor="mm")


SCENES = [
    ("1", "Quét QR tại quầy", "Mở trang check-in của Glame trên điện thoại.", "qr"),
    ("2", "Nhập tên và SĐT/Zalo", "Glame dùng thông tin này để gửi link ảnh và hỗ trợ sau phiên chụp.", "info"),
    ("3", "Chọn gói chụp", "Chọn gói 3 phút, 5 phút hoặc 10 phút theo nhu cầu.", "package"),
    ("4", "Thanh toán QR", "Quét QR, chuyển khoản đúng nội dung mã phiên.", "payment"),
    ("5", "Nhận số đợi", "Chờ nhân viên gọi số rồi mới vào phòng chụp.", "ticket"),
    ("6", "Vào phòng chụp", "Tạo dáng thoải mái. Hệ thống tự gom ảnh vào phiên của bạn.", "shoot"),
    ("7", "Xem ảnh gốc", "Bạn có thể tải ảnh raw hoặc yêu cầu chỉnh sửa tự động.", "raw"),
    ("8", "Ghép frame trên app", "Chọn ảnh, kéo để căn vị trí, zoom ảnh giống thao tác trên Canva.", "frame"),
    ("9", "Nhận ảnh in", "Xuất file final, nhân viên in ảnh và hỗ trợ ZIP/FotoShare nếu cần.", "print"),
]


def draw_scene(slide, progress):
    step, title, subtitle, kind = slide
    img = background(progress)
    draw = ImageDraw.Draw(img)
    brand(draw)

    draw.text((72, 240), f"Bước {step}", font=font(34, True), fill="#c79a45")
    text_block(draw, title, (72, 300), FONT_TITLE, "#1f1b17", 900, line_gap=8)
    text_block(draw, subtitle, (72, 510), FONT_SUB, "#756b62", 860, line_gap=12)

    if kind == "qr":
        qr_mock(draw, 92, 760)
        phone_mock(draw, 570, 700, "Check-in", ["Nhập thông tin", "Chọn gói", "Lấy số chờ"])
    elif kind == "info":
        phone_mock(draw, 330, 720, "Thông tin", ["Họ và tên", "SĐT / Zalo", "Tiếp tục"])
    elif kind == "package":
        y = 760
        for name, price in [("3 phút", "99.000đ"), ("5 phút", "149.000đ"), ("10 phút", "249.000đ")]:
            rounded(draw, (120, y, 960, y + 150), 24, (255, 255, 255, 245), outline=(230, 216, 199, 255), width=2)
            draw.text((168, y + 50), name, font=font(48, True), fill="#1f1b17")
            draw.text((820, y + 76), price, font=font(38, True), fill="#c79a45", anchor="mm")
            y += 182
    elif kind == "payment":
        qr_mock(draw, 120, 780)
        rounded(draw, (520, 830, 940, 1130), 28, (31, 27, 23, 255))
        draw.text((730, 930), "GL-0008", font=font(64, True), fill="white", anchor="mm")
        draw.text((730, 1020), "Nội dung CK", font=font(34, True), fill="#c79a45", anchor="mm")
    elif kind == "ticket":
        rounded(draw, (190, 760, 890, 1220), 36, (31, 27, 23, 255))
        draw.text((540, 920), "A008", font=font(170, True), fill="white", anchor="mm")
        draw.text((540, 1080), "Vui lòng chờ gọi số", font=font(42, True), fill="#c79a45", anchor="mm")
    elif kind == "shoot":
        rounded(draw, (120, 820, 560, 1120), 44, (31, 27, 23, 255))
        draw.ellipse((310, 880, 510, 1080), fill="#c79a45", outline="white", width=26)
        rounded(draw, (620, 800, 930, 900), 20, (255, 255, 255, 245))
        draw.text((642, 835), "Incoming", font=font(36, True), fill="#1f1b17")
        rounded(draw, (620, 960, 930, 1060), 20, (255, 255, 255, 245))
        draw.text((642, 995), "GL-0008/raw", font=font(36, True), fill="#1f1b17")
    elif kind == "raw":
        for i in range(8):
            x = 110 + (i % 4) * 215
            y = 760 + (i // 4) * 260
            rounded(draw, (x, y, x + 170, y + 220), 18, (255, 255, 255, 245), outline=(230, 216, 199, 255), width=2)
        rounded(draw, (160, 1330, 920, 1425), 24, (31, 27, 23, 255))
        draw.text((540, 1378), "Yêu cầu chỉnh sửa tự động", font=font(40, True), fill="white", anchor="mm")
    elif kind == "frame":
        frame_preview(draw, 560, 700)
        for i in range(4):
            x = 100 + (i % 2) * 210
            y = 790 + (i // 2) * 270
            rounded(draw, (x, y, x + 170, y + 220), 18, (255, 255, 255, 245), outline=(230, 216, 199, 255), width=2)
        rounded(draw, (138, 1370, 410, 1445), 22, (31, 27, 23, 255))
        draw.text((274, 1408), "Zoom + Kéo", font=font(34, True), fill="white", anchor="mm")
    elif kind == "print":
        frame_preview(draw, 110, 700)
        rounded(draw, (610, 760, 940, 1040), 28, (255, 255, 255, 245), outline=(230, 216, 199, 255), width=2)
        draw.text((775, 845), "In ảnh", font=font(54, True), fill="#1f1b17", anchor="mm")
        rounded(draw, (670, 910, 880, 990), 16, (31, 27, 23, 255))
        rounded(draw, (640, 1180, 910, 1340), 24, (31, 27, 23, 255))
        draw.text((775, 1260), "ZIP", font=font(66, True), fill="white", anchor="mm")

    # subtle progress dots
    dot_y = H - 118
    start_x = 232
    for idx in range(len(SCENES)):
        fill = "#1f1b17" if idx == int(step) - 1 else "#d8c8b6"
        draw.ellipse((start_x + idx * 72, dot_y, start_x + idx * 72 + 22, dot_y + 22), fill=fill)
    return img.convert("RGB")


def fade(a: Image.Image, b: Image.Image, alpha: float) -> Image.Image:
    return Image.blend(a, b, alpha)


def main():
    OUT.parent.mkdir(exist_ok=True)
    seconds_per_scene = 3.2
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
