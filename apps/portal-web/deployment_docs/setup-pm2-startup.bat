@echo off
setlocal enabledelayedexpansion

REM ============================================
REM PM2 Windows Startup Configuration Script
REM ============================================
REM This script configures PM2 to start automatically
REM when Windows Server boots up.
REM ============================================

echo.
echo ============================================
echo PM2 Windows Startup Configuration
echo ============================================
echo.

REM Check for administrative privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] This script requires administrative privileges.
    echo Please right-click and select "Run as administrator"
    pause
    exit /b 1
)

REM Check if PM2 is installed
pm2 --version >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] PM2 is not installed or not in PATH.
    echo Please run deploy.bat first to install PM2.
    pause
    exit /b 1
)

echo [INFO] Configuring PM2 Windows startup...
echo.

REM Generate startup script
echo [STEP 1] Generating PM2 startup script...
pm2 startup

if %errorLevel% neq 0 (
    echo [ERROR] Failed to generate PM2 startup script.
    pause
    exit /b 1
)

echo.
echo [STEP 2] Saving current PM2 process list...
pm2 save

if %errorLevel% neq 0 (
    echo [WARNING] Failed to save PM2 process list.
    echo [WARNING] You may need to manually run 'pm2 save' after configuring startup.
) else (
    echo [SUCCESS] PM2 process list saved.
)

echo.
echo ============================================
echo Configuration Complete!
echo ============================================
echo.
echo IMPORTANT: Please copy and run the command shown above
echo (the one starting with 'pm2 startup') in an administrator
echo command prompt to complete the setup.
echo.
echo After running that command, PM2 will automatically start
echo your application when Windows Server reboots.
echo.
pause

