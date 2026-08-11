@echo off
rem Self-elevate. Preflight, net stop and NSSM all require Administrator, and a
rem double-click from Explorer is never elevated. Relaunch through UAC instead
rem of failing with exit 10 in a window that closes before anyone can read it.
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo [INFO] Administrator access is required. Approve the prompt to continue.
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  if errorlevel 1 (
    echo [ERROR] Could not get Administrator access.
    echo [ERROR] Right-click this file and choose "Run as administrator".
    pause
  )
  exit /b 0
)
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

rem Stop anything already serving this app before preflight checks the ports.
rem Without this, a re-deploy always fails preflight with "Port already in use",
rem and the pre-monorepo backend could keep running alongside the new one,
rem writing duplicate gate events into the same database.
call "%~dp0lib\logging.bat" INFO "Stopping existing DLSU services"
net stop DLSUGateMonorepo >nul 2>&1
where nssm >nul 2>&1
if %errorlevel% equ 0 (
  nssm stop DLSUGateSystemBackend >nul 2>&1
  nssm remove DLSUGateSystemBackend confirm >nul 2>&1
)
where pm2 >nul 2>&1
if %errorlevel% equ 0 (
  pm2 delete all >nul 2>&1
  pm2 save --force >nul 2>&1
)

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

call bun run backup:db >"%LOG_DIR%\backup.log" 2>&1
if %errorlevel% neq 0 call "%~dp0lib\errors.bat" 50 "backup:db" "Pre-migration database backup failed" & exit /b 50

rem "bun --cwd" is not a valid flag, so the old invocation always exited 1.
call bun run migrate:backend >"%LOG_DIR%\migration.log" 2>&1
if %errorlevel% neq 0 call "%~dp0lib\errors.bat" 50 "migration:run" "Database migration failed" & exit /b 50

call "%~dp0install-monorepo-service.bat" >"%LOG_DIR%\service.log" 2>&1
if %errorlevel% neq 0 call "%~dp0lib\errors.bat" 60 "install-monorepo-service" "Service install/start failed" & exit /b 60

set "READY=0"
rem 90 x 2s = 3 minutes. Nest boot plus the first Next request on a cold
rem Windows box regularly exceeded the previous 60s window.
for /l %%a in (1,1,90) do (
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
