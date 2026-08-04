@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\canon-edsdk-capture.ps1" -OutputDir "%~dp0incoming-digicam" -FilePrefix "CANON-TEST"
pause
