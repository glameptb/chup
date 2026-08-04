$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$bundledNode = "C:\Users\hungm\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$node = if (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { (Get-Command node -ErrorAction Stop).Source }
$logDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$env:HOST = "0.0.0.0"
$env:PORT = "4173"
$env:NODE_ENV = "production"
$env:NODE_NO_WARNINGS = "1"
$PSNativeCommandUseErrorActionPreference = $false

while ($true) {
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath (Join-Path $logDir "server-supervisor.log") -Value "[$stamp] Starting GLAME server"
  & $node (Join-Path $root "server.js") *>> (Join-Path $logDir "server.log")
  $exitCode = $LASTEXITCODE
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath (Join-Path $logDir "server-supervisor.log") -Value "[$stamp] Server stopped ($exitCode); restarting in 3 seconds"
  Start-Sleep -Seconds 3
}
