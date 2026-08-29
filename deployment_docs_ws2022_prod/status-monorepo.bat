@echo off
rem Read-only diagnostics - no elevation needed. But a bare double-click from
rem Explorer closes the window the instant the script ends, so a non-technical
rem operator never gets to read the result. Always pause at the end.
setlocal
sc query DLSUGateMonorepo
if %errorlevel% neq 0 echo [WARN] Service DLSUGateMonorepo not found - has it been installed yet?
echo.
powershell -NoProfile -Command "try { $h=Invoke-WebRequest -Uri 'http://localhost:10580/health' -UseBasicParsing -TimeoutSec 5; Write-Host ('HEALTH: '+$h.StatusCode) } catch { Write-Host 'HEALTH: FAILED' }"
powershell -NoProfile -Command "try { $d=Invoke-WebRequest -Uri 'http://localhost:10580/api/docs' -UseBasicParsing -TimeoutSec 5; Write-Host ('DOCS: '+$d.StatusCode) } catch { Write-Host 'DOCS: FAILED' }"
powershell -NoProfile -Command "try { $f=Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing -TimeoutSec 5; Write-Host ('FRONTEND: '+$f.StatusCode) } catch { Write-Host 'FRONTEND: FAILED' }"
echo.
pause
exit /b 0
