@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0\.."
set "OUT_LOG=%cd%\logs\backend-service-out.log"
set "ERR_LOG=%cd%\logs\backend-service-error.log"

echo.
echo ========================================
echo Backend Service Logs
echo ========================================
echo.
echo OUT: %OUT_LOG%
echo ERR: %ERR_LOG%
echo.

echo Following logs live. Press Ctrl+C to stop.
echo.

powershell -NoProfile -Command "$out='%OUT_LOG%'; $err='%ERR_LOG%'; foreach ($p in @($out,$err)) { if (-not (Test-Path $p)) { New-Item -ItemType File -Path $p -Force | Out-Null } }; Write-Host '--- FOLLOWING OUT + ERR (tail 100) ---'; Get-Content -Path @($out,$err) -Tail 100 -Wait"

echo.
echo Log follow stopped.
pause
exit /b 0
