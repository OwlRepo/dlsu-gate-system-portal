@echo off
setlocal
cd /d "%~dp0.."
if not exist logs\current mkdir logs\current >nul 2>&1
set "BACKEND_OUT=logs\current\backend.stdout.log"
set "BACKEND_ERR=logs\current\backend.stderr.log"
set "FRONTEND_OUT=logs\current\frontend.stdout.log"
set "FRONTEND_ERR=logs\current\frontend.stderr.log"

start "DLSU-BACKEND" /b cmd /c "cd /d apps\backend && node dist\main.js 1>>..\..\%BACKEND_OUT% 2>>..\..\%BACKEND_ERR%"
start "DLSU-FRONTEND" /b cmd /c "cd /d apps\portal-web && node ..\..\scripts\run-with-root-env.mjs next start 1>>..\..\%FRONTEND_OUT% 2>>..\..\%FRONTEND_ERR%"

timeout /t 3 /nobreak >nul
:watch
powershell -NoProfile -Command "$b=Get-Process -Name node -ErrorAction SilentlyContinue | ? { $_.Path -like '*node*' }; if($b){exit 0}else{exit 1}" >nul 2>&1
if %errorlevel% neq 0 exit /b 1
timeout /t 10 /nobreak >nul
goto :watch
