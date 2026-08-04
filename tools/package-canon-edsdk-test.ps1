$ErrorActionPreference = "Stop"

$root = [IO.Path]::GetFullPath("C:\Users\hungm\Documents\glame")
$outputRoot = Join-Path $root "outputs"
$dist = Join-Path $outputRoot "GLAME-Capture-Canon-EDSDK-Test"
$zip = Join-Path $outputRoot "GLAME-Capture-Canon-EDSDK-Test.zip"

if (-not (Test-Path -LiteralPath (Join-Path $root "vendor\canon-edsdk\EDSDK_64\Dll\EDSDK.dll"))) {
  throw "Official EDSDK_64 not found. Run tools\extract-official-edsdk.ps1 first."
}

Remove-Item -LiteralPath $dist -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $dist | Out-Null

$files = @(
  "server.js", "storage.js", "app.js", "index.html",
  "capture.html", "capture.css", "capture.js",
  "customer.html", "customer.js", "customer-composer.css", "customer-gallery.css",
  "checkin.html", "checkin.js", "checkin-flow.css", "styles.css",
  "filter-admin.html", "filter-admin.js",
  "guide.html", "guide.js", "guide.css",
  "join.html", "join.js", "leaderboard.html", "leaderboard.js",
  "google-apps-script.gs",
  "GLAME Capture Station.bat", "start-capture-app.ps1",
  "Test Canon EDSDK.bat", "Test Canon Capture.bat"
)

foreach ($file in $files) {
  $source = Join-Path $root $file
  if (Test-Path -LiteralPath $source) {
    Copy-Item -LiteralPath $source -Destination (Join-Path $dist $file) -Force
  }
}

foreach ($dir in @("assets", "data", "dataset", "exports", "incoming-digicam", "sessions", "vendor\canon-edsdk")) {
  $source = Join-Path $root $dir
  if (Test-Path -LiteralPath $source) {
    $destination = Join-Path $dist $dir
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
  }
}

New-Item -ItemType Directory -Force -Path (Join-Path $dist "tools") | Out-Null
Copy-Item -LiteralPath (Join-Path $root "tools\canon-edsdk-smoke.ps1") -Destination (Join-Path $dist "tools\canon-edsdk-smoke.ps1") -Force
Copy-Item -LiteralPath (Join-Path $root "tools\canon-edsdk-capture.ps1") -Destination (Join-Path $dist "tools\canon-edsdk-capture.ps1") -Force
Copy-Item -LiteralPath (Join-Path $root "tools\extract-official-edsdk.ps1") -Destination (Join-Path $dist "tools\extract-official-edsdk.ps1") -Force

New-Item -ItemType Directory -Force -Path (Join-Path $dist ".runtime\node") | Out-Null
$node = "C:\Users\hungm\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if (Test-Path -LiteralPath $node) {
  Copy-Item -LiteralPath $node -Destination (Join-Path $dist ".runtime\node\node.exe") -Force
}

@"
GLAME Capture Canon EDSDK Test
==============================

1. Copy folder này sang máy có Canon R100.
2. Cắm Canon R100 bằng USB, tắt EOS Utility/digiCamControl/app Canon khác.
3. Chạy "Test Canon EDSDK.bat".
   - Nếu thấy Camera count: 1 và tên EOS R100: EDSDK 64-bit dùng được.
   - Nếu Camera count: 0: Windows/Canon chưa nhận camera hoặc camera đang bị app khác chiếm.
4. Chạy "Test Canon Capture.bat" để chụp và tải ảnh về incoming-digicam.
5. Chạy "GLAME Capture Station.bat" để mở app GLAME demo.

Bản này dùng Canon EDSDK chính thống trong vendor\canon-edsdk\EDSDK_64\Dll.
"@ | Set-Content -LiteralPath (Join-Path $dist "README-CANON-EDSDK-TEST.txt") -Encoding UTF8

Compress-Archive -Path (Join-Path $dist "*") -DestinationPath $zip -Force
Get-Item -LiteralPath $dist, $zip | Select-Object FullName, Length, LastWriteTime
