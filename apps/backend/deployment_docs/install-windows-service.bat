@echo off
setlocal enabledelayedexpansion
title DLSU Gate System - Install Windows Service

:: Change to project root directory
cd /d "%~dp0\.."

echo.
echo ========================================
echo   Install as Windows Service (NSSM)
echo ========================================
echo.

:: Check if NSSM is installed
where nssm >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] NSSM is not installed!
    echo.
    echo NSSM (Non-Sucking Service Manager) is required to install as Windows Service.
    echo.
    echo Download from: https://nssm.cc/download
    echo Extract nssm.exe to a folder in PATH or current directory
    echo.
    echo Or install via Chocolatey: choco install nssm
    echo.
    pause
    exit /b 1
)

:: Get current directory (handle spaces)
set "APP_DIR=%~dp0\.."
set "APP_DIR=%APP_DIR:~0,-1%"

:: Find Node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Node.js not found!
    pause
    exit /b 1
)

for /f "delims=" %%i in ('where node') do set NODE_PATH=%%i

echo Application Directory: %APP_DIR%
echo Node.js Path: %NODE_PATH%
echo.

:: Stop existing service
echo Stopping existing service (if any)...
nssm stop DLSUGateSystemBackend >nul 2>&1
nssm remove DLSUGateSystemBackend confirm >nul 2>&1

:: Install service
echo Installing Windows Service...
nssm install DLSUGateSystemBackend "%NODE_PATH%" "dist/main.js"
if %errorLevel% neq 0 (
    echo [ERROR] Failed to install service
    pause
    exit /b 1
)

:: Configure service
echo Configuring service...
nssm set DLSUGateSystemBackend AppDirectory "%APP_DIR%"
nssm set DLSUGateSystemBackend DisplayName "DLSU Gate System Backend"
nssm set DLSUGateSystemBackend Description "DLSU Gate System Backend API Service"
nssm set DLSUGateSystemBackend Start SERVICE_AUTO_START
nssm set DLSUGateSystemBackend AppEnvironmentExtra "NODE_ENV=production^&PORT=10580"

:: Set service to restart on failure
nssm set DLSUGateSystemBackend AppRestartDelay 10000
nssm set DLSUGateSystemBackend AppExit Default Restart

:: Set output files
if not exist logs mkdir logs
nssm set DLSUGateSystemBackend AppStdout "%APP_DIR%\logs\service-out.log"
nssm set DLSUGateSystemBackend AppStderr "%APP_DIR%\logs\service-error.log"

echo.
echo [OK] Service installed successfully!
echo.
echo Service Management:
echo   Start:   net start DLSUGateSystemBackend
echo   Stop:    net stop DLSUGateSystemBackend
echo   Status:  sc query DLSUGateSystemBackend
echo.
echo Or use Services.msc GUI
echo.

:: Start service
set /p START_NOW="Start service now? (y/n): "
if /i "%START_NOW%"=="y" (
    net start DLSUGateSystemBackend
    if %errorLevel% equ 0 (
        echo [OK] Service started!
    ) else (
        echo [ERROR] Failed to start service
        echo Check logs in: %APP_DIR%\logs\
    )
)

echo.
pause

