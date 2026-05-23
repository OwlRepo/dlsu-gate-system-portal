@echo off
setlocal enabledelayedexpansion
title DLSU Gate System - Update

:: Change to project root directory
cd /d "%~dp0\.."
set PROJECT_ROOT=%cd%

for /f "delims=" %%i in ('npm config get prefix 2^>nul') do set "NPM_PREFIX=%%i"
if defined NPM_PREFIX set "PATH=!NPM_PREFIX!;!NPM_PREFIX!\node_modules;!PATH!"

echo.
echo ========================================
echo   DLSU Gate System - Updating
echo ========================================
echo.

:: Pull latest changes
echo Pulling latest changes...
git pull origin main
if !errorLevel! neq 0 (
    echo [WARNING] Failed to pull changes or not a git repository
    echo Continuing with update...
)

:: Detect Bun vs npm
set USE_BUN=0
where bun >nul 2>&1
if !errorLevel! equ 0 set USE_BUN=1
if /I "%~1"=="force-npm" set USE_BUN=0

:: Install dependencies
echo Installing dependencies...
if !USE_BUN! equ 1 (
    echo [INFO] Using Bun...
    call bun install --ignore-scripts
    if !errorLevel! neq 0 (
        echo [WARNING] Bun install failed, falling back to npm install...
        set USE_BUN=0
        call npm install --loglevel=error --no-fund --no-audit
    )
) else (
    echo [INFO] Using npm...
    call npm install --loglevel=error
)
if !errorLevel! neq 0 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)

if exist "%~dp0\..\patches\*" (
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
        echo [WARNING] patch-package had issues - continuing
    )
)

:: Build application
echo Building application...
if !USE_BUN! equ 1 (
    call bun run build
    if !errorLevel! neq 0 (
        echo [WARNING] Bun build failed, falling back to npm build...
        set USE_BUN=0
        call npm run build
    )
) else (
    call npm run build
)
if !errorLevel! neq 0 (
    echo [ERROR] Build failed
    pause
    exit /b 1
)

:: Run migrations
echo Running migrations...
call npm run migration:run
if !errorLevel! neq 0 (
    echo [WARNING] Migration failed or no migrations to run
    echo This is OK if database is already up to date
)

:: Restart PM2
echo Restarting application...
set ECOSYSTEM=deployment_docs\ecosystem.windows.config.js
pm2 describe dlsu-portal-be >nul 2>&1
if !errorLevel! equ 0 (
    pm2 restart dlsu-portal-be
    if !errorLevel! neq 0 (
        echo [WARNING] PM2 restart failed. Run: pm2 logs dlsu-portal-be --lines 100
    )
) else (
    echo [INFO] App not in PM2. Starting from ecosystem...
    pm2 start "%ECOSYSTEM%" --env production
    if !errorLevel! neq 0 (
        echo [ERROR] Failed to start application. Run: pm2 status
        pause
        exit /b 1
    )
)
pm2 save >nul 2>&1

echo.
echo ========================================
echo   Update Completed!
echo ========================================
echo.
pm2 status
echo.
pause

