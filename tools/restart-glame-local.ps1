$ErrorActionPreference = "Stop"
$root = "C:\Users\hungm\Documents\glame"
$node = "C:\Users\hungm\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

$processes = Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -and $_.CommandLine.Contains("server.js") }

foreach ($process in $processes) {
  Stop-Process -Id $process.ProcessId -Force
}

Start-Sleep -Milliseconds 500
Start-Process -FilePath $node `
  -ArgumentList "server.js" `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $root "server.out.log") `
  -RedirectStandardError (Join-Path $root "server.err.log")

Start-Sleep -Seconds 1
Invoke-RestMethod -Uri "http://127.0.0.1:4173/api/camera/config"
