@echo off
rem Self-elevate: "net stop" needs Administrator, and Explorer never launches
rem a double-clicked .bat elevated. Relaunch through "cmd /k" so the window
rem stays open regardless of outcome - a bare double-click must never vanish
rem before the operator can read the result.
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
net stop DLSUGateMonorepo
if %errorlevel% neq 0 (
  echo [ERROR] Could not stop DLSUGateMonorepo. It may already be stopped, or not installed yet.
  pause
  exit /b 60
)
echo [OK] DLSUGateMonorepo stopped.
pause
exit /b 0
