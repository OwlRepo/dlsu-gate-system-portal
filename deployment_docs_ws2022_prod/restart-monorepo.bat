@echo off
rem Self-elevate: "net stop"/"net start" need Administrator, and Explorer
rem never launches a double-clicked .bat elevated. Relaunch through "cmd /k"
rem so the window stays open regardless of outcome - a bare double-click
rem must never vanish before the operator can read the result.
net session >nul 2>&1
if %errorlevel% equ 0 goto :elevated
echo [INFO] Administrator access is required. Approve the prompt to continue.
powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/k','\"%~f0\"' -Verb RunAs"
if errorlevel 1 (
  echo [ERROR] Could not get Administrator access.
  echo [ERROR] Right-click this file and choose "Run as administrator".
  pause
)
exit /b 0
:elevated
setlocal
net stop DLSUGateMonorepo >nul 2>&1
net start DLSUGateMonorepo
if %errorlevel% neq 0 (
  echo [ERROR] Could not start DLSUGateMonorepo. Check the service is installed (install-monorepo-service.bat) and inspect Event Viewer / nssm logs.
  pause
  exit /b 60
)
echo [OK] DLSUGateMonorepo restarted.
pause
exit /b 0
