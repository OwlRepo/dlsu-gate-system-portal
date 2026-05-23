@echo off
setlocal enabledelayedexpansion
set "SERVICE_NAME=DLSUGateSystemBackend"

echo Stopping %SERVICE_NAME%...
net stop "%SERVICE_NAME%"
if %errorLevel% neq 0 (
    echo [ERROR] Failed to stop %SERVICE_NAME%.
    exit /b 1
)
echo [OK] Service stopped.
exit /b 0
