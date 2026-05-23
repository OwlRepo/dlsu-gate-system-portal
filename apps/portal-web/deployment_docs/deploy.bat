@echo off
setlocal enabledelayedexpansion
title DLSU Portal FE Dasma - PM2 Deploy

if /I "%~1"=="skip-lint" set SKIP_LINT_BUILD=1
if /I "%~2"=="skip-lint" set SKIP_LINT_BUILD=1
if /I "%~1"=="force-npm" set FORCE_NPM=1
if /I "%~2"=="force-npm" set FORCE_NPM=1

set APP_NAME=dlsu-portal-fe-dasma
set APP_PORT=3000
set APP_URL=http://localhost:%APP_PORT%
set ECOSYSTEM=deployment_docs/ecosystem.config.js

cd /d "%~dp0\.."
set PROJECT_ROOT=%cd%
if not exist "%PROJECT_ROOT%\logs" mkdir "%PROJECT_ROOT%\logs"

echo.
echo ========================================
echo   DLSU Portal FE Dasma - PM2 Deploy
echo ========================================
echo.

set DEPLOY_LOG=%PROJECT_ROOT%\logs\deploy-%date:~-4,4%%date:~-10,2%%date:~-7,2%-%time:~0,2%%time:~3,2%%time:~6,2%.log
set DEPLOY_LOG=%DEPLOY_LOG: =0%
echo Deploy started %date% %time% >> "%DEPLOY_LOG%"
echo [1/8] Checking prerequisites...
where node >nul 2>&1
if !errorLevel! neq 0 (
    echo [ERROR] Node.js is not installed.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version 2^>nul') do set NODE_VERSION=%%i
echo [OK] Node.js: !NODE_VERSION!

set USE_BUN=0
where bun >nul 2>&1
if !errorLevel! equ 0 (
    set USE_BUN=1
    for /f "tokens=*" %%i in ('bun --version 2^>nul') do set BUN_VERSION=%%i
    echo [OK] Bun: !BUN_VERSION!
) else (
    echo [OK] Bun not found - will use npm
)
if defined FORCE_NPM (
    set USE_BUN=0
    echo [INFO] force-npm enabled. Using npm for install/build.
)

::: Add npm global bin to PATH so pm2 is found after install
for /f "delims=" %%i in ('npm config get prefix 2^>nul') do set "NPM_PREFIX=%%i"
if defined NPM_PREFIX set "PATH=!NPM_PREFIX!;!NPM_PREFIX!\node_modules;!PATH!"

where pm2 >nul 2>&1
if !errorLevel! neq 0 (
    echo [INFO] PM2 not found. Installing globally...
    call npm install -g pm2 --loglevel=error --no-fund --no-audit
    where pm2 >nul 2>&1
    if !errorLevel! neq 0 (
        if exist "!NPM_PREFIX!\pm2.cmd" (
            set "PATH=!NPM_PREFIX!;!PATH!"
            echo [OK] PM2 found at npm prefix
        ) else if exist "!NPM_PREFIX!\node_modules\pm2\bin\pm2" (
            set "PATH=!NPM_PREFIX!\node_modules\pm2\bin;!PATH!"
            echo [OK] PM2 found in node_modules
        ) else (
            echo [ERROR] PM2 not available. Try: Open NEW Administrator CMD, run: npm install -g pm2
            pause
            exit /b 1
        )
    ) else (
        echo [OK] PM2 installed
    )
)
echo [OK] PM2 ready

if not exist "%PROJECT_ROOT%\package.json" (
    echo [ERROR] package.json not found at %PROJECT_ROOT%
    pause
    exit /b 1
)
if not exist "%PROJECT_ROOT%\%ECOSYSTEM%" (
    echo [ERROR] Missing PM2 ecosystem file: %PROJECT_ROOT%\%ECOSYSTEM%
    pause
    exit /b 1
)
if not exist "%PROJECT_ROOT%\logs" mkdir "%PROJECT_ROOT%\logs"
echo [OK] Project files verified
echo.

echo [2/8] Installing dependencies...
if !USE_BUN! equ 1 (
    echo [INFO] Using Bun...
    call bun install --ignore-scripts
    if !errorLevel! neq 0 (
        echo [WARNING] bun install had issues, retrying...
        call bun install --ignore-scripts
    )
    if !errorLevel! neq 0 (
        echo [WARNING] Bun install failed twice. Falling back to npm install...
        set USE_BUN=0
        call npm install --loglevel=error --no-fund --no-audit
        if !errorLevel! neq 0 (
            echo [ERROR] npm install failed after Bun fallback.
            pause
            exit /b 1
        )
    )
) else (
    echo [INFO] Using npm...
    call npm install --loglevel=error
    if !errorLevel! neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)
echo [OK] Dependencies installed
echo.

if exist "%PROJECT_ROOT%\patches\*" (
    echo [INFO] Applying patch-package patches...
    if !USE_BUN! equ 1 (
        call bunx patch-package
        if !errorLevel! neq 0 (
            echo [WARNING] bunx patch-package failed, trying npx...
            call npx patch-package
        )
    ) else (
        call npx patch-package
    )
    if !errorLevel! neq 0 (
        echo [WARNING] patch-package failed. Continuing without patches.
    )
)

echo [3/8] Building Next.js app...
if "!SKIP_LINT_BUILD!"=="1" (
    echo.
    echo [WARNING] SKIP_LINT_BUILD=1 - ESLint and TypeScript checks disabled for this build
    echo [WARNING] Use only for emergency deployment. Fix lint errors before next release.
    echo.
)
if !USE_BUN! equ 1 (
    call bun run build
    if !errorLevel! neq 0 (
        echo [WARNING] Bun build failed. Falling back to npm build...
        set USE_BUN=0
        call npm run build
    )
) else (
    call npm run build
)
if !errorLevel! neq 0 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)
echo [OK] Build successful
echo.

echo [4/8] Stopping existing PM2 process (if running)...
set PM2_STEP_OK=0
pm2 ping >nul 2>&1
if !errorLevel! neq 0 (
    echo [INFO] PM2 daemon not running - no process to stop
    set PM2_STEP_OK=1
) else (
    echo [INFO] PM2 daemon responding
    pm2 describe %APP_NAME% >nul 2>&1
    if !errorLevel! equ 0 (
        echo   Stopping %APP_NAME%...
        pm2 stop %APP_NAME% 2>&1
        timeout /t 2 /nobreak >nul
        echo   Removing %APP_NAME% from PM2...
        pm2 delete %APP_NAME% 2>&1
        if !errorLevel! equ 0 (
            echo [OK] Previous instance removed
        ) else (
            echo [OK] Process removed or already gone - continuing
        )
        set PM2_STEP_OK=1
    ) else (
        echo [OK] No previous PM2 instance found
        set PM2_STEP_OK=1
    )
)
if !PM2_STEP_OK! neq 1 (
    echo [WARNING] PM2 step had issues - attempting to continue
)
echo Step 4 done PM2_STEP_OK=!PM2_STEP_OK! >> "%DEPLOY_LOG%"
echo.

echo [5/8] Starting app with PM2...
pm2 start "%ECOSYSTEM%" --env production
if !errorLevel! neq 0 (
    echo [WARNING] First start attempt failed. Retrying after short delay...
    timeout /t 2 /nobreak >nul
    pm2 ping >nul 2>&1
    pm2 start "%ECOSYSTEM%" --env production
)
if !errorLevel! neq 0 (
    echo [ERROR] Failed to start PM2 app.
    echo.
    echo Troubleshooting - run these commands:
    echo   pm2 status
    echo   pm2 logs %APP_NAME% --lines 100
    echo Full deploy log: %DEPLOY_LOG%
    pause
    exit /b 1
)
pm2 describe %APP_NAME% >nul 2>&1
if !errorLevel! neq 0 (
    echo [WARNING] App not yet in PM2 list - waiting 3s and rechecking...
    timeout /t 3 /nobreak >nul
)
pm2 save >nul 2>&1
echo [OK] PM2 app started
echo Step 5 start OK >> "%DEPLOY_LOG%"
echo.

echo [6/8] Configuring PM2 auto-start on Windows boot...
net session >nul 2>&1
set IS_ADMIN=!errorLevel!
if !IS_ADMIN! equ 0 (
    for /f "tokens=*" %%i in ('pm2 startup 2^>^&1') do (
        echo %%i | findstr /i "pm2" >nul
        if !errorLevel! equ 0 (
            call %%i >nul 2>&1
        )
    )
    pm2 save >nul 2>&1
    echo [OK] Startup configuration attempted as Administrator
) else (
    echo [INFO] Run as Administrator once, then execute:
    echo        pm2 startup
    echo        pm2 save
)
if exist "%USERPROFILE%\.pm2\dump.pm2" (
    echo [OK] PM2 dump file present
) else (
    echo [WARNING] PM2 dump file not found yet.
)
echo.

echo [7/8] Verifying app readiness...
set MAX_ATTEMPTS=30
set ATTEMPT=0
set READY=0

:wait_loop
set /a ATTEMPT+=1
echo   Attempt !ATTEMPT!/!MAX_ATTEMPTS! - Checking %APP_URL%...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%APP_URL%' -UseBasicParsing -TimeoutSec 5; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if !errorLevel! equ 0 (
    set READY=1
    goto :readiness_done
)
if !ATTEMPT! lss !MAX_ATTEMPTS! (
    timeout /t 2 /nobreak >nul
    goto :wait_loop
)

:readiness_done
if !READY! neq 1 (
    echo [ERROR] App did not become ready at %APP_URL%
    echo.
    echo Troubleshooting - run these commands:
    echo   pm2 status
    echo   pm2 logs %APP_NAME% --lines 100
    echo Full deploy log: %DEPLOY_LOG%
    pause
    exit /b 1
)
echo [OK] App is reachable
echo.

echo [8/8] Deployment complete.
echo Deploy succeeded %date% %time% >> "%DEPLOY_LOG%"
echo ========================================
echo   Deployment Successful
echo ========================================
echo Deploy log: %DEPLOY_LOG%
echo.
pm2 status
echo.
echo Opening app in browser: %APP_URL%
start "" "%APP_URL%"
echo.
echo Useful commands:
echo   pm2 logs %APP_NAME%
echo   pm2 restart %APP_NAME%
echo   pm2 stop %APP_NAME%
echo.
pause
exit /b 0
