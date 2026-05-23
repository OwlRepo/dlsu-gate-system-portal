@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0\.."
set "PROJECT_ROOT=%cd%"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format \"yyyyMMdd-HHmmss\""') do set "RUN_ID=%%i"
set "LOG_DIR=%~dp0logs\%RUN_ID%"
mkdir "%LOG_DIR%" >nul 2>&1
rmdir /s /q "%~dp0logs\current" >nul 2>&1
mkdir "%~dp0logs\current" >nul 2>&1
set "MAIN_LOG=%LOG_DIR%\orchestrator.log"
call "%~dp0lib\logging.bat" START "DLSU monorepo deploy started"
call "%~dp0lib\preflight.bat" "%PROJECT_ROOT%" "%LOG_DIR%"
if %errorlevel% neq 0 call "%~dp0lib\errors.bat" %errorlevel% "preflight" "Fix prerequisites and re-run" & exit /b %errorlevel%

where bun >nul 2>&1
if %errorlevel% equ 0 (
  call "%~dp0lib\logging.bat" INFO "Installing dependencies with bun"
  call bun install >"%LOG_DIR%\build.log" 2>&1
) else (
  call "%~dp0lib\logging.bat" WARN "Bun unavailable, using npm install"
  call npm install >"%LOG_DIR%\build.log" 2>&1
)
if %errorlevel% neq 0 call "%~dp0lib\errors.bat" 30 "install" "Dependency install failed" & exit /b 30

call bun run verify:env:backend >"%LOG_DIR%\prereq.log" 2>&1
if %errorlevel% neq 0 call "%~dp0lib\errors.bat" 20 "verify:env:backend" "Missing backend env" & exit /b 20
call bun run verify:env:web >>"%LOG_DIR%\prereq.log" 2>&1
if %errorlevel% neq 0 call "%~dp0lib\errors.bat" 20 "verify:env:web" "Missing web env" & exit /b 20

call bun run build:backend >>"%LOG_DIR%\build.log" 2>&1
if %errorlevel% neq 0 call "%~dp0lib\errors.bat" 40 "build:backend" "Backend build failed" & exit /b 40
call bun run build:web >>"%LOG_DIR%\build.log" 2>&1
if %errorlevel% neq 0 call "%~dp0lib\errors.bat" 40 "build:web" "Frontend build failed" & exit /b 40

call bun --cwd apps/backend run migration:run >"%LOG_DIR%\migration.log" 2>&1
if %errorlevel% neq 0 call "%~dp0lib\errors.bat" 50 "migration:run" "Database migration failed" & exit /b 50

call "%~dp0install-monorepo-service.bat" >"%LOG_DIR%\service.log" 2>&1
if %errorlevel% neq 0 call "%~dp0lib\errors.bat" 60 "install-monorepo-service" "Service install/start failed" & exit /b 60

set "READY=0"
for /l %%a in (1,1,30) do (
  powershell -NoProfile -Command "try { $h=Invoke-WebRequest -Uri 'http://localhost:10580/health' -UseBasicParsing -TimeoutSec 5; $d=Invoke-WebRequest -Uri 'http://localhost:10580/api/docs' -UseBasicParsing -TimeoutSec 5; $f=Invoke-WebRequest -Uri 'http://localhost:3000' -UseBasicParsing -TimeoutSec 5; if($h.StatusCode -eq 200 -and $d.StatusCode -ge 200 -and $f.StatusCode -ge 200){exit 0}else{exit 1}} catch {exit 1}" >nul 2>&1
  if !errorlevel! equ 0 set "READY=1" & goto :ready
  timeout /t 2 /nobreak >nul
)
:ready
if "%READY%" neq "1" call "%~dp0lib\errors.bat" 70 "readiness" "Health checks did not pass" & exit /b 70

copy "%LOG_DIR%\*" "%~dp0logs\current\" >nul 2>&1
call "%~dp0lib\logging.bat" SUCCESS "Deployment complete"

powershell -NoProfile -Command "if([Environment]::UserInteractive){Start-Process cmd -ArgumentList '/k','""%~dp0logs-monorepo.bat""'}" >nul 2>&1

echo [OK] Deploy complete. Logs: %LOG_DIR%
exit /b 0
