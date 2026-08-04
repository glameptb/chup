$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$startup = [Environment]::GetFolderPath("Startup")
$launcher = Join-Path $startup "GLAME Photobooth.cmd"
$script = Join-Path $root "start-production.ps1"
$content = "@echo off`r`nstart `"GLAME Photobooth`" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`"`r`n"
[IO.File]::WriteAllText($launcher, $content, [Text.UTF8Encoding]::new($false))
Write-Host "Da cai tu dong khoi dong: $launcher"
