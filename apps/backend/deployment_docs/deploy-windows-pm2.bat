@echo off
setlocal enabledelayedexpansion

::: When double-clicked (no args), re-run in a persistent window so output is visible
if "%~1"=="" (
    cmd /k "%~f0" _deploy
    exit /b
)
if /I "%~1"=="force-npm" set FORCE_NPM=1
if /I "%~2"=="force-npm" set FORCE_NPM=1

title DLSU Gate System - PM2 Deploy (Windows)

::: Change to project root directory
cd /d "%~dp0\.."
set PROJECT_ROOT=%cd%
if not exist "%PROJECT_ROOT%\logs" mkdir "%PROJECT_ROOT%\logs"

set DEPLOY_LOG=%PROJECT_ROOT%\logs\deploy-%date:~-4,4%%date:~-10,2%%date:~-7,2%-%time:~0,2%%time:~3,2%%time:~6,2%.log
set DEPLOY_LOG=%DEPLOY_LOG: =0%
echo Deploy started %date% %time% >> "%DEPLOY_LOG%"

echo.
echo ========================================
echo   DLSU Gate System - PM2 Deploy
echo ========================================
echo.

::: ========== STEP 1: Preflight Checks ==========
echo [1/8] Checking prerequisites...
echo.

::: Check Node.js (required for PM2 and runtime)
where node >nul 2>&1
if !errorLevel! neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js v18+ from: https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version 2^>nul') do set NODE_VERSION=%%i
echo [OK] Node.js: !NODE_VERSION!

::: Check Bun (optional - fallback to npm)
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

::: Check PM2 (install if missing via npm)
::: Add npm global bin to PATH so pm2 is found after install
for /f "delims=" %%i in ('npm config get prefix 2^>nul') do set "NPM_PREFIX=%%i"
if defined NPM_PREFIX set "PATH=!NPM_PREFIX!;!NPM_PREFIX!\node_modules;!PATH!"

where pm2 >nul 2>&1
if !errorLevel! neq 0 (
    echo Installing PM2 globally...
    call npm install -g pm2 --loglevel=error --no-fund --no-audit
    where pm2 >nul 2>&1
    if !errorLevel! neq 0 (
        echo [INFO] Checking npm global location...
        if exist "!NPM_PREFIX!\pm2.cmd" (
            set "PATH=!NPM_PREFIX!;!PATH!"
            echo [OK] PM2 found at npm prefix, PATH updated
        ) else if exist "!NPM_PREFIX!\node_modules\pm2\bin\pm2" (
            set "PATH=!NPM_PREFIX!\node_modules\pm2\bin;!PATH!"
            echo [OK] PM2 found in node_modules, PATH updated
        ) else (
            echo [ERROR] PM2 not available after install.
            echo.
            echo Try: Open NEW Administrator CMD, run: npm install -g pm2
            echo Then run this script again from that new window.
            pause
            exit /b 1
        )
    ) else (
        echo [OK] PM2 installed
    )
) else (
    echo [OK] PM2 already installed
)

::: Verify project files
if not exist "%PROJECT_ROOT%\package.json" (
    echo [ERROR] package.json not found. Run this script from the project directory.
    pause
    exit /b 1
)
echo [OK] package.json found

if exist "%PROJECT_ROOT%\deployment_docs\ecosystem.windows.config.js" (
    set ECOSYSTEM=deployment_docs\ecosystem.windows.config.js
) else (
    if exist "%PROJECT_ROOT%\ecosystem.config.js" (
        set ECOSYSTEM=ecosystem.config.js
    ) else (
        echo [ERROR] No ecosystem config found.
        echo Looked for:
        echo   - %PROJECT_ROOT%\deployment_docs\ecosystem.windows.config.js
        echo   - %PROJECT_ROOT%\ecosystem.config.js
        pause
        exit /b 1
    )
)
echo [OK] Using ecosystem: !ECOSYSTEM!

::: Ensure logs directory exists
if not exist "%PROJECT_ROOT%\logs" mkdir "%PROJECT_ROOT%\logs"
echo [OK] Logs directory ready
echo.

::: ========== STEP 2: Install Dependencies ==========
echo [2/8] Installing dependencies...
if !USE_BUN! equ 1 (
    echo [INFO] Using Bun with --ignore-scripts to avoid postinstall PATH issues...
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
    if exist "%PROJECT_ROOT%\patches\*" (
        echo [INFO] Applying patch-package patches...
        call bunx patch-package
        if !errorLevel! neq 0 (
            echo [WARNING] bunx patch-package failed. Trying npx patch-package...
            call npx patch-package
        )
    )
) else (
    echo [INFO] Using npm...
    call npm install --loglevel=error
    if !errorLevel! neq 0 (
        echo [ERROR] npm install failed. Check the output above.
        pause
        exit /b 1
    )
    if exist "%PROJECT_ROOT%\patches\*" (
        echo [INFO] Applying patch-package patches...
        call npx patch-package
        if !errorLevel! neq 0 (
            echo [WARNING] patch-package failed. Continuing without patches.
        )
    )
)

echo [OK] Dependencies installed
echo.

::: ========== STEP 3: Build Application ==========
echo [3/8] Building application...
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
    echo [ERROR] Build failed. Check the output above.
    echo Full deploy log: %DEPLOY_LOG%
    pause
    exit /b 1
)
echo [OK] Build successful
echo.

::: ========== STEP 4: Gracefully Stop Existing PM2 App ==========
echo [4/8] Stopping existing PM2 process (if running)...
set PM2_STEP_OK=0
pm2 ping >nul 2>&1
if !errorLevel! neq 0 (
    echo [INFO] PM2 daemon not running - no process to stop
    set PM2_STEP_OK=1
) else (
    echo [INFO] PM2 daemon responding
    pm2 describe dlsu-portal-be >nul 2>&1
    if !errorLevel! equ 0 (
        echo   Stopping dlsu-portal-be...
        pm2 stop dlsu-portal-be 2>&1
        timeout /t 2 /nobreak >nul
        echo   Removing dlsu-portal-be from PM2...
        pm2 delete dlsu-portal-be 2>&1
        if !errorLevel! equ 0 (
            echo [OK] Previous instance stopped and removed
        ) else (
            echo [OK] Process removed or already gone - continuing
        )
        set PM2_STEP_OK=1
    ) else (
        echo [OK] No existing process to stop
        set PM2_STEP_OK=1
    )
)
if !PM2_STEP_OK! neq 1 (
    echo [WARNING] PM2 step had issues - attempting to continue
)
echo Step 4 done PM2_STEP_OK=!PM2_STEP_OK! >> "%DEPLOY_LOG%"
echo.

::: ========== STEP 5: Start Application with PM2 ==========
echo [5/8] Starting application with PM2...
pm2 start "%ECOSYSTEM%" --env production
if !errorLevel! neq 0 (
    echo [WARNING] First start attempt failed. Retrying after short delay...
    timeout /t 2 /nobreak >nul
    pm2 ping >nul 2>&1
    pm2 start "%ECOSYSTEM%" --env production
)
if !errorLevel! neq 0 (
    echo [ERROR] Failed to start application with PM2
    echo.
    echo Troubleshooting - run these commands:
    echo   pm2 status
    echo   pm2 logs dlsu-portal-be --lines 100
    echo Full deploy log: %DEPLOY_LOG%
    pause
    exit /b 1
)
pm2 describe dlsu-portal-be >nul 2>&1
if !errorLevel! neq 0 (
    echo [WARNING] App not yet in PM2 list - waiting 3s and rechecking...
    timeout /t 3 /nobreak >nul
)
pm2 save >nul 2>&1
echo [OK] Application started
echo Step 5 start OK >> "%DEPLOY_LOG%"
echo.

::: ========== STEP 6: Configure PM2 Startup on Boot ==========
echo [6/8] Configuring PM2 startup on Windows boot...

net session >nul 2>&1
set IS_ADMIN=!errorLevel!

if !IS_ADMIN! equ 0 (
    echo Running as Administrator - configuring startup...
    for /f "tokens=*" %%i in ('pm2 startup 2^>^&1') do (
        set STARTUP_LINE=%%i
        echo %%i | findstr /i "pm2" >nul
        if !errorLevel! equ 0 (
            echo Executing: %%i
            call %%i >nul 2>&1
            if !errorLevel! equ 0 (
                echo [OK] PM2 startup configured for boot
            ) else (
                echo [WARNING] Auto-config failed. Run manually as Admin: %%i
            )
        )
    )
) else (
    echo [INFO] Not running as Administrator
    echo.
    echo To enable auto-start on Windows boot:
    echo 1. Open Command Prompt as Administrator
    echo 2. Run: pm2 startup
    echo 3. Execute the command shown by pm2 startup
)

pm2 save >nul 2>&1
if exist "%USERPROFILE%\.pm2\dump.pm2" (
    echo [OK] PM2 process list saved
) else (
    echo [WARNING] PM2 dump not found. Run 'pm2 save' manually.
)
echo.

::: ========== STEP 7: Verify HTTP Readiness (Docs Endpoint) ==========
echo [7/8] Checking docs endpoint readiness...
set DOCS_URL=http://localhost:10580/api/docs
set MAX_ATTEMPTS=30
set ATTEMPT=0
set READY=0

:wait_loop
set /a ATTEMPT+=1
echo   Attempt !ATTEMPT!/!MAX_ATTEMPTS! - Checking %DOCS_URL%...

powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%DOCS_URL%' -UseBasicParsing -TimeoutSec 5; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
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
    echo.
    echo [ERROR] Docs endpoint did not become ready after !MAX_ATTEMPTS! attempts.
    echo URL checked: %DOCS_URL%
    echo.
    echo Troubleshooting - run these commands:
    echo   pm2 status
    echo   pm2 logs dlsu-portal-be --lines 100
    echo   Check database and Redis connectivity
    echo Full deploy log: %DEPLOY_LOG%
    pm2 status
    pause
    exit /b 1
)

echo [OK] Docs endpoint is ready
echo.

::: ========== STEP 8: Success - Confirm and Open Docs ==========
echo [8/8] Deployment complete.
echo Deploy succeeded %date% %time% >> "%DEPLOY_LOG%"
echo.
echo ========================================
echo   Deployment Successful!
echo ========================================
echo Deploy log: %DEPLOY_LOG%
echo.
echo Application Status:
pm2 status
echo.
echo URLs:
echo   API:       http://localhost:10580
echo   Docs:      %DOCS_URL%
echo   Health:    http://localhost:10580/health
echo.
if !IS_ADMIN! neq 0 (
    echo NOTE: Run this script as Administrator to enable auto-start on boot.
    echo.
)
echo Opening documentation...
start "" "%DOCS_URL%"
echo.
echo Press any key to close...
pause >nul
exit /b 0
