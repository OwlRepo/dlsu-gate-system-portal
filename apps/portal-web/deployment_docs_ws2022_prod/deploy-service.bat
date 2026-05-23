@echo off
setlocal enabledelayedexpansion
title DLSU Portal FE - WS2022 Production Deploy

if "%~1"=="skip-lint" set SKIP_LINT_BUILD=1

cd /d "%~dp0\.."
set "PROJECT_ROOT=%cd%"
set "APP_URL=http://localhost:3000"
set "MAX_ATTEMPTS=30"
set "LUCIDE_VERSION=0.468.0"

echo.
echo ========================================
echo   DLSU Portal FE - Production Deploy
echo ========================================
echo.

echo [1/4] Checking prerequisites...
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Node.js is not installed.
    pause
    exit /b 1
)

set USE_BUN=0
where bun >nul 2>&1
if %errorLevel% equ 0 set USE_BUN=1

echo [2/4] Installing dependencies...
if !USE_BUN! equ 1 (
    call bun install --ignore-scripts
) else (
    call npm install --loglevel=error
)
if !errorLevel! neq 0 (
    echo [ERROR] Dependency installation failed.
    pause
    exit /b 1
)

if not exist "%PROJECT_ROOT%\node_modules\lucide-react\dist\lucide-react.d.ts" (
    echo [WARNING] lucide-react type declarations missing. Repairing package...
    call npm install lucide-react@%LUCIDE_VERSION% --save-exact --no-fund --no-audit
    if !errorLevel! neq 0 (
        echo [WARNING] Targeted lucide-react repair failed. Continuing to build...
    ) else (
        echo [OK] lucide-react package repaired
    )
)

echo [3/4] Building application...
if "!SKIP_LINT_BUILD!"=="1" (
    echo [WARNING] SKIP_LINT_BUILD=1 enabled.
)
if !USE_BUN! equ 1 (
    call bun run build
) else (
    call npm run build
)
if !errorLevel! neq 0 (
    if not exist "%PROJECT_ROOT%\node_modules\lucide-react\dist\lucide-react.d.ts" (
        echo [WARNING] Build failed with missing lucide-react typings.
        echo [INFO] Running clean reinstall and retrying once...
        if exist "%PROJECT_ROOT%\node_modules" rmdir /s /q "%PROJECT_ROOT%\node_modules"
        call npm ci --include=dev --no-fund --no-audit
        if !errorLevel! neq 0 (
            echo [WARNING] npm ci failed, trying npm install...
            call npm install --no-fund --no-audit
        )
        if !USE_BUN! equ 1 (
            call bun run build
        ) else (
            call npm run build
        )
        if !errorLevel! neq 0 (
            echo [ERROR] Build failed after auto-repair.
            pause
            exit /b 1
        )
    ) else (
        echo [ERROR] Build failed.
        pause
        exit /b 1
    )
)

echo [4/4] Installing and starting Windows Service...
call "%~dp0install-windows-service.bat"
if %errorLevel% neq 0 exit /b 1

set ATTEMPT=0
set READY=0
:wait_loop
set /a ATTEMPT+=1
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%APP_URL%' -UseBasicParsing -TimeoutSec 5; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
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
    echo [ERROR] Frontend URL is not reachable: %APP_URL%
    pause
    exit /b 1
)

echo [OK] Deployment successful.
echo URL: %APP_URL%
exit /b 0
