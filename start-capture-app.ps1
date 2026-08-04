$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$localNode = Join-Path $root ".runtime\node\node.exe"
$codexNode = "C:\Users\hungm\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$node = if (Test-Path -LiteralPath $localNode) {
  $localNode
} elseif (Test-Path -LiteralPath $codexNode) {
  $codexNode
} else {
  (Get-Command node -ErrorAction Stop).Source
}
$port = if ($env:PORT) { [int]$env:PORT } else { 4173 }
$url = "http://127.0.0.1:$port/capture.html"
$healthUrl = "http://127.0.0.1:$port/api/camera/config"

function Test-GlameServer {
  try {
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 1
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Find-Edge {
  $paths = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:LocalAppData\Microsoft\Edge\Application\msedge.exe"
  )
  foreach ($path in $paths) {
    if ($path -and (Test-Path -LiteralPath $path)) { return $path }
  }
  return (Get-Command msedge -ErrorAction Stop).Source
}

New-Item -ItemType Directory -Force -Path (Join-Path $root "logs") | Out-Null

if (-not (Test-GlameServer)) {
  $env:HOST = "0.0.0.0"
  $env:PORT = "$port"
  $env:NODE_ENV = "production"
  Start-Process -FilePath $node `
    -ArgumentList @((Join-Path $root "server.js")) `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $root "logs\capture-app-server.out.log") `
    -RedirectStandardError (Join-Path $root "logs\capture-app-server.err.log")

  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-GlameServer) {
      $ready = $true
      break
    }
  }
  if (-not $ready) {
    throw "GLAME server did not start. Check logs\capture-app-server.err.log"
  }
}

$edge = Find-Edge
$profileDir = Join-Path $root ".capture-app-profile"
New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

Start-Process -FilePath $edge -ArgumentList @(
  "--app=$url",
  "--user-data-dir=$profileDir",
  "--window-size=1280,860",
  "--no-first-run"
)
