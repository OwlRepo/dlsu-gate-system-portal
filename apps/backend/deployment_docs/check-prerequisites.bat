@echo off
setlocal enabledelayedexpansion
title DLSU Gate System - Prerequisites Check

echo.
echo ========================================
echo   Prerequisites Check
echo ========================================
echo.

set ALL_OK=1

:: Check Node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [MISSING] Node.js
    echo   Download: https://nodejs.org/
    echo   Required: v18 or higher
    set ALL_OK=0
) else (
    for /f "tokens=*" %%i in ('node --version 2^>nul') do echo [OK] Node.js: %%i
)

:: Check npm
where npm >nul 2>&1
if %errorLevel% neq 0 (
    echo [MISSING] npm
    set ALL_OK=0
) else (
    for /f "tokens=*" %%i in ('npm --version 2^>nul') do echo [OK] npm: %%i
)

:: Check PostgreSQL
where psql >nul 2>&1
if %errorLevel% neq 0 (
    echo [MISSING] PostgreSQL
    echo   Download: https://www.postgresql.org/download/windows/
    echo   Or install via: choco install postgresql
    set ALL_OK=0
) else (
    echo [OK] PostgreSQL found
)

:: Check Redis/Memurai
where redis-cli >nul 2>&1
if %errorLevel% neq 0 (
    echo [OPTIONAL] Redis/Memurai not found
    echo   Options:
    echo   - Memurai: https://www.memurai.com/get-memurai
    echo   - Docker: docker run -d -p 6379:6379 redis
) else (
    echo [OK] Redis/Memurai found
)

echo.
if %ALL_OK% equ 1 (
    echo ========================================
    echo   All required prerequisites OK!
    echo   You can run deploy-windows-server.bat
    echo ========================================
) else (
    echo ========================================
    echo   Some prerequisites are missing
    echo   Please install them and run again
    echo ========================================
)

echo.
pause

