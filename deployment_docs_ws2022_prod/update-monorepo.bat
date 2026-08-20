@echo off
rem Self-elevate before anything else. This file is the click target for
rem non-technical operators, and Explorer never launches it elevated.
net session >nul 2>&1
if %errorlevel% equ 0 goto :elevated
echo [INFO] Administrator access is required. Approve the prompt to continue.
rem Relaunch through "cmd /k" so the elevated window stays open no matter how
rem the script ends. Kept outside any ( ) block - \" inside a parenthesized
rem block trips cmd's block parser.
powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/k','\"%~f0\"' -Verb RunAs"
if errorlevel 1 (
  echo [ERROR] Could not get Administrator access.
  echo [ERROR] Right-click this file and choose "Run as administrator".
  pause
)
exit /b 0
:elevated
setlocal
cd /d "%~dp0\.."
rem A silenced, unchecked pull meant a failed fetch quietly redeployed the old
rem code and reported success. Surface it and stop instead.
git pull origin main
if %errorlevel% neq 0 (
  echo [ERROR] git pull failed. Resolve it before deploying.
  exit /b 30
)
rem No second UAC prompt: we are already elevated here, so the deploy's own
rem "net session" check passes straight through.
call "%~dp0deploy-monorepo.bat"
set "RC=%errorlevel%"
if %RC% neq 0 (
  echo.
  echo [FAILED] Deployment stopped with exit code %RC%.
  echo [FAILED] Logs: %~dp0logs\current
  pause
)
exit /b %RC%
