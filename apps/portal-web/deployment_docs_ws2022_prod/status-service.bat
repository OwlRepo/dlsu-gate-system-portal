@echo off
setlocal enabledelayedexpansion
set "SERVICE_NAME=DLSUPortalFrontend"
set "APP_URL=http://localhost:3000"

echo.
echo ========================================
echo Frontend Service Status
echo ========================================
echo.

sc query "%SERVICE_NAME%"
echo.
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%APP_URL%' -UseBasicParsing -TimeoutSec 5; Write-Host ('URL check: ' + $r.StatusCode); exit 0 } catch { Write-Host 'URL check: FAILED'; exit 1 }"
exit /b 0
