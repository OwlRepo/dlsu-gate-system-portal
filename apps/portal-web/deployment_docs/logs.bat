@echo off
setlocal enabledelayedexpansion

REM ============================================
REM View DLSU Portal Application Logs
REM ============================================

echo.
echo ============================================
echo DLSU Portal - Application Logs
echo ============================================
echo.
echo Press Ctrl+C to exit log viewer
echo.

pm2 logs dlsu-portal-fe-dasma --lines 100

