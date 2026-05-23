@echo off
setlocal enabledelayedexpansion
title DLSU Gate BE - WS2022 Production Deploy

cd /d "%~dp0\.."
set "PROJECT_ROOT=%cd%"
set "DOCS_URL=http://localhost:10580/api/docs"
set "MAX_ATTEMPTS=30"

echo.
echo ========================================
echo   DLSU Gate BE - Production Deploy
echo ========================================
echo.

echo [1/5] Checking prerequisites...
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Node.js is not installed.
    pause
    exit /b 1
)

set USE_BUN=0
where bun >nul 2>&1
if %errorLevel% equ 0 set USE_BUN=1

echo [2/5] Installing dependencies...
if !USE_BUN! equ 1 (
    call bun install --ignore-scripts
    if !errorLevel! neq 0 call bun install --ignore-scripts
) else (
    call npm install --loglevel=error
)
if !errorLevel! neq 0 (
    echo [ERROR] Dependency installation failed.
    pause
    exit /b 1
)

if exist "%PROJECT_ROOT%\patches\*" (
    if !USE_BUN! equ 1 (
        call bunx patch-package
    ) else (
        call npx patch-package
    )
    if !errorLevel! neq 0 (
        echo [ERROR] patch-package failed.
        pause
        exit /b 1
    )
)

echo [3/5] Building application...
if !USE_BUN! equ 1 (
    call bun run build
) else (
    call npm run build
)
if !errorLevel! neq 0 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)

echo [4/5] Running migrations...
set "MIGRATION_OK=0"
call npm run migration:run
if !errorLevel! equ 0 set "MIGRATION_OK=1"

if !MIGRATION_OK! neq 1 (
    echo [WARNING] Primary migration command failed. Trying fallback DataSource path...
    call npm run typeorm -- migration:run -- -d src/config/data-source.ts
    if !errorLevel! equ 0 set "MIGRATION_OK=1"
)

if !MIGRATION_OK! neq 1 (
    echo [WARNING] First fallback failed. Trying legacy TypeORM config path...
    call npm run typeorm -- migration:run -- -d src/config/typeorm.config.ts
    if !errorLevel! equ 0 set "MIGRATION_OK=1"
)

if !MIGRATION_OK! neq 1 (
    echo [WARNING] Migration commands failed. Continuing deployment...
)

echo [5/5] Installing and starting Windows Service...
call "%~dp0install-windows-service.bat"
if %errorLevel% neq 0 exit /b 1

set ATTEMPT=0
set READY=0
:wait_loop
set /a ATTEMPT+=1
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%DOCS_URL%' -UseBasicParsing -TimeoutSec 5; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %errorLevel% equ 0 (
    set READY=1
    goto :ready_done
)
if !ATTEMPT! lss !MAX_ATTEMPTS! (
    timeout /t 2 /nobreak >nul
    goto :wait_loop
)

:ready_done
if !READY! neq 1 (
    echo [ERROR] Backend docs endpoint not reachable: %DOCS_URL%
    pause
    exit /b 1
)

echo [OK] Deployment successful.
echo Docs: %DOCS_URL%
exit /b 0
