@echo off
setlocal enabledelayedexpansion
title DLSU Gate BE - WS2022 Production Update

cd /d "%~dp0\.."

echo.
echo ========================================
echo   DLSU Gate BE - Production Update
echo ========================================
echo.

git pull origin main
if %errorLevel% neq 0 (
    echo [WARNING] git pull failed or not a git checkout, continuing...
)

call "%~dp0deploy-service.bat" %*
exit /b %errorLevel%
