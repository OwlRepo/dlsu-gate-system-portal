@echo off
setlocal enabledelayedexpansion
set "SERVICE_NAME=DLSUGateSystemBackend"
set "DOCS_URL=http://localhost:10580/api/docs"
set "HEALTH_URL=http://localhost:10580/health"

echo.
echo ========================================
echo Backend Service Status
echo ========================================
echo.

sc query "%SERVICE_NAME%"
echo.
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%HEALTH_URL%' -UseBasicParsing -TimeoutSec 5; Write-Host ('HEALTH check: ' + $r.StatusCode) } catch { Write-Host 'HEALTH check: FAILED' }"
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%DOCS_URL%' -UseBasicParsing -TimeoutSec 5; Write-Host ('DOCS check: ' + $r.StatusCode) } catch { Write-Host 'DOCS check: FAILED' }"
exit /b 0
