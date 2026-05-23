@echo off
setlocal enabledelayedexpansion

REM ============================================
REM Restart DLSU Portal Application
REM ============================================

cd /d "%~dp0\.."
set PROJECT_ROOT=%cd%
set ECOSYSTEM=deployment_docs\ecosystem.config.js

for /f "delims=" %%i in ('npm config get prefix 2^>nul') do set "NPM_PREFIX=%%i"
if defined NPM_PREFIX set "PATH=!NPM_PREFIX!;!NPM_PREFIX!\node_modules;!PATH!"

echo.
echo Restarting DLSU Portal FE Dasma application...
echo.

pm2 describe dlsu-portal-fe-dasma >nul 2>&1
if !errorLevel! equ 0 (
    pm2 restart dlsu-portal-fe-dasma
    if !errorLevel! equ 0 (
        echo [SUCCESS] Application restarted successfully.
        pm2 save >nul 2>&1
    ) else (
        echo [ERROR] PM2 restart failed. Run: pm2 logs dlsu-portal-fe-dasma --lines 100
    )
) else (
    echo [INFO] App not in PM2. Starting from ecosystem...
    pm2 start "%ECOSYSTEM%" --env production
    if !errorLevel! equ 0 (
        echo [SUCCESS] Application started.
        pm2 save >nul 2>&1
    ) else (
        echo [ERROR] Failed to start application. Run: pm2 status
    )
)

echo.
pm2 list
echo.
pause

