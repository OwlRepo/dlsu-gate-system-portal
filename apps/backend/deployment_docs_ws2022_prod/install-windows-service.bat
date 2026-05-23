@echo off
setlocal enabledelayedexpansion
title DLSU Gate BE - Install Windows Service

cd /d "%~dp0\.."
set "PROJECT_ROOT=%cd%"
set "SERVICE_NAME=DLSUGateSystemBackend"
set "DISPLAY_NAME=DLSU Gate System Backend"
set "APP_PORT=10580"

echo.
echo ========================================
echo   Install Backend Windows Service
echo ========================================
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Run this script as Administrator.
    pause
    exit /b 1
)

set "NSSM="
for /f "delims=" %%i in ('where nssm 2^>nul') do set "NSSM=%%i" & goto :nssm_found
if exist "%~dp0nssm.exe" set "NSSM=%~dp0nssm.exe"
if not defined NSSM if exist "%ProgramData%\chocolatey\bin\nssm.exe" set "NSSM=%ProgramData%\chocolatey\bin\nssm.exe"
if not defined NSSM if exist "%SystemRoot%\System32\nssm.exe" set "NSSM=%SystemRoot%\System32\nssm.exe"
if not defined NSSM if exist "C:\nssm\win64\nssm.exe" set "NSSM=C:\nssm\win64\nssm.exe"
if not defined NSSM if exist "C:\nssm\win32\nssm.exe" set "NSSM=C:\nssm\win32\nssm.exe"

if not defined NSSM (
    echo [WARNING] NSSM not found in PATH or common locations.
    where winget >nul 2>&1
    if !errorLevel! equ 0 (
        echo [INFO] Attempting NSSM install with winget...
        winget install --id NSSM.NSSM -e --accept-source-agreements --accept-package-agreements >nul 2>&1
    )
)

if not defined NSSM (
    where choco >nul 2>&1
    if !errorLevel! equ 0 (
        echo [INFO] Attempting NSSM install with Chocolatey...
        choco install nssm -y >nul 2>&1
    )
)

if not defined NSSM (
    echo [INFO] Attempting direct NSSM download...
    set "TOOLS_DIR=%~dp0.tools"
    set "NSSM_ZIP=%TOOLS_DIR%\nssm-2.24.zip"
    set "NSSM_EXTRACT=%TOOLS_DIR%\nssm-2.24"
    if not exist "!TOOLS_DIR!" mkdir "!TOOLS_DIR!"
    powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile '!NSSM_ZIP!' -UseBasicParsing; exit 0 } catch { exit 1 }" >nul 2>&1
    if !errorLevel! equ 0 (
        powershell -NoProfile -Command "try { if (Test-Path '!NSSM_EXTRACT!') { Remove-Item -Recurse -Force '!NSSM_EXTRACT!' }; Expand-Archive -Path '!NSSM_ZIP!' -DestinationPath '!NSSM_EXTRACT!' -Force; exit 0 } catch { exit 1 }" >nul 2>&1
        if exist "!NSSM_EXTRACT!\nssm-2.24\win64\nssm.exe" set "NSSM=!NSSM_EXTRACT!\nssm-2.24\win64\nssm.exe"
        if not defined NSSM if exist "!NSSM_EXTRACT!\nssm-2.24\win32\nssm.exe" set "NSSM=!NSSM_EXTRACT!\nssm-2.24\win32\nssm.exe"
    )
)

if not defined NSSM (
    where nssm >nul 2>&1
    if !errorLevel! equ 0 (
        for /f "delims=" %%i in ('where nssm') do set "NSSM=%%i" & goto :nssm_found
    )
    if exist "%ProgramData%\chocolatey\bin\nssm.exe" set "NSSM=%ProgramData%\chocolatey\bin\nssm.exe"
    if not defined NSSM if exist "%SystemRoot%\System32\nssm.exe" set "NSSM=%SystemRoot%\System32\nssm.exe"
    if not defined NSSM if exist "C:\nssm\win64\nssm.exe" set "NSSM=C:\nssm\win64\nssm.exe"
)

if not defined NSSM (
    echo [ERROR] NSSM is still not available.
    echo [INFO] Install NSSM manually, then rerun:
    echo        - winget install --id NSSM.NSSM -e
    echo        - OR choco install nssm -y
    echo        - OR place nssm.exe in this folder: %~dp0
    pause
    exit /b 1
)
:nssm_found

for /f "delims=" %%i in ('where node') do set "NODE_PATH=%%i" & goto :node_found
:node_found
if not defined NODE_PATH (
    echo [ERROR] Node.js not found in PATH.
    pause
    exit /b 1
)

if not exist "%PROJECT_ROOT%\dist\main.js" (
    echo [ERROR] dist\main.js not found. Run deploy-service.bat first.
    pause
    exit /b 1
)
if not exist "%PROJECT_ROOT%\logs" mkdir "%PROJECT_ROOT%\logs"

echo [INFO] Reinstalling service %SERVICE_NAME%...
"%NSSM%" stop "%SERVICE_NAME%" >nul 2>&1
"%NSSM%" remove "%SERVICE_NAME%" confirm >nul 2>&1

"%NSSM%" install "%SERVICE_NAME%" "%NODE_PATH%" "dist\main.js"
if %errorLevel% neq 0 (
    echo [ERROR] Failed to install service.
    pause
    exit /b 1
)

"%NSSM%" set "%SERVICE_NAME%" AppDirectory "%PROJECT_ROOT%"
"%NSSM%" set "%SERVICE_NAME%" DisplayName "%DISPLAY_NAME%"
"%NSSM%" set "%SERVICE_NAME%" Start SERVICE_AUTO_START
"%NSSM%" set "%SERVICE_NAME%" AppEnvironmentExtra "NODE_ENV=production^&PORT=%APP_PORT%"
"%NSSM%" set "%SERVICE_NAME%" AppStdout "%PROJECT_ROOT%\logs\backend-service-out.log"
"%NSSM%" set "%SERVICE_NAME%" AppStderr "%PROJECT_ROOT%\logs\backend-service-error.log"
"%NSSM%" set "%SERVICE_NAME%" AppExit Default Restart
"%NSSM%" set "%SERVICE_NAME%" AppRestartDelay 10000

sc failure "%SERVICE_NAME%" reset= 86400 actions= restart/10000/restart/10000/restart/10000 >nul 2>&1
sc failureflag "%SERVICE_NAME%" 1 >nul 2>&1

net start "%SERVICE_NAME%" >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Service installed but failed to start. Check logs\backend-service-error.log
    pause
    exit /b 1
)

echo [OK] Service installed and started.
sc query "%SERVICE_NAME%"
exit /b 0
