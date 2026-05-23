@echo off
setlocal enabledelayedexpansion
set "SERVICE_NAME=DLSUGateSystemBackend"

echo Restarting %SERVICE_NAME%...
net stop "%SERVICE_NAME%" >nul 2>&1
net start "%SERVICE_NAME%"
if %errorLevel% neq 0 (
    echo [ERROR] Failed to restart %SERVICE_NAME%.
    exit /b 1
)
echo [OK] Service restarted.
exit /b 0
