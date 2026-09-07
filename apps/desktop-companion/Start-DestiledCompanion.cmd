@echo off
setlocal
cd /d "%~dp0"

where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo [DESTILED Companion] Brak Windows PowerShell.
  echo Ten prototyp wymaga Windows 10/11 z Windows PowerShell 5.1.
  pause
  exit /b 1
)

start "DESTILED Companion" powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0Start-DestiledCompanion.ps1"
exit /b 0
