@echo off
setlocal enabledelayedexpansion

REM ============================================
REM Stop DLSU Portal Application
REM ============================================

echo.
echo Stopping DLSU Portal FE Dasma application...
echo.

pm2 stop dlsu-portal-fe-dasma

if %errorLevel% equ 0 (
    echo.
    echo [SUCCESS] Application stopped successfully.
    echo.
    pm2 list
) else (
    echo.
    echo [ERROR] Failed to stop application.
    echo [INFO] The application may not be running.
    pm2 list
)

echo.
pause

