param(
  [string]$Zip = "C:\Users\hungm\Downloads\EDSDK131910CD(13.19.10).zip",
  [string]$Out = "C:\Users\hungm\Documents\glame\vendor\canon-edsdk"
)

$ErrorActionPreference = "Stop"
$Out = [IO.Path]::GetFullPath($Out)
$workspace = [IO.Path]::GetFullPath("C:\Users\hungm\Documents\glame")
if (-not $Out.StartsWith($workspace, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to write outside workspace: $Out"
}
if (-not (Test-Path -LiteralPath $Zip)) {
  throw "Missing SDK zip: $Zip"
}

Remove-Item -LiteralPath $Out -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $Out | Out-Null

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($Zip)
$prefix = "EDSDK131910CD(13.19.10)/Windows/"
$entries = $archive.Entries | Where-Object { $_.FullName.StartsWith($prefix) -and $_.Length -gt 0 }

foreach ($entry in $entries) {
  $relative = $entry.FullName.Substring($prefix.Length)
  $destination = Join-Path $Out $relative
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
  [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destination, $true)
}

Get-ChildItem -LiteralPath $Out -Recurse -File |
  Where-Object { $_.Name -in @("EDSDK.dll", "EdsImage.dll", "EDSDK.lib", "EDSDK.h", "EDSDK.cs") } |
  Select-Object FullName, Length
