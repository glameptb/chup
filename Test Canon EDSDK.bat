@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\canon-edsdk-smoke.ps1" -Command list
pause
