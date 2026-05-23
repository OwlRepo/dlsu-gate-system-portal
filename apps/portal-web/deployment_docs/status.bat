@echo off
setlocal enabledelayedexpansion

REM ============================================
REM Check DLSU Portal Application Status
REM ============================================

echo.
echo ============================================
echo DLSU Portal - Application Status
echo ============================================
echo.

pm2 list

echo.
echo ============================================
echo Detailed Information
echo ============================================
echo.

pm2 describe dlsu-portal-fe-dasma

echo.
echo ============================================
echo Monitoring (Press Ctrl+C to exit)
echo ============================================
echo.

pm2 monit

