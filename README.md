# GLAME Photobooth

Ứng dụng photobooth chạy local gồm kiosk chụp, dashboard nhân viên và trang khách chọn/ghép ảnh.

## Chạy trên máy dev

Yêu cầu Windows và Node.js 24 trở lên.

```powershell
git clone https://github.com/glameptb/chup.git
cd chup
$env:CAMERA_MODE="mock"
node server.js
```

Mở `http://127.0.0.1:4173` cho dashboard hoặc `http://127.0.0.1:4173/capture.html` cho kiosk.

Khi làm việc với camera Canon thật, bỏ biến `CAMERA_MODE` và cài driver/EDSDK cần thiết trên máy kiosk.

## Dữ liệu chỉ lưu ở máy vận hành

Git không đồng bộ database, ảnh khách, ảnh camera, file xuất in, log và bản build. Các thư mục `data/`, `sessions/`, `incoming-digicam/`, `exports/`, `outputs/` phải được sao lưu riêng trên máy vận hành.

## Làm việc từ nhiều máy

Trước khi sửa:

```powershell
git pull --rebase
```

Sau khi sửa và kiểm tra:

```powershell
git add -A
git commit -m "Mô tả thay đổi"
git push
```

Không sửa cùng một file chưa commit trên hai máy cùng lúc.
