@echo off
setlocal
cd /d "%~dp0.."

rem Logs live under deployment_docs_ws2022_prod\logs\current, which is where
rem logs-monorepo.bat tails from. Writing them to <repo>\logs\current instead
rem left the log viewer following empty files forever.
set "LOG_DIR=%~dp0logs\current"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1

start "DLSU-BACKEND" /b cmd /c "cd /d apps\backend && node dist\main.js 1>>""%LOG_DIR%\backend.stdout.log"" 2>>""%LOG_DIR%\backend.stderr.log"""
start "DLSU-FRONTEND" /b cmd /c "cd /d apps\portal-web && node ..\..\scripts\run-with-root-env.mjs next start 1>>""%LOG_DIR%\frontend.stdout.log"" 2>>""%LOG_DIR%\frontend.stderr.log"""

timeout /t 15 /nobreak >nul
:watch
rem Check the ports are actually listening, not merely that some node process
rem exists. The old check passed whenever any unrelated node process was alive,
rem so a dead backend never triggered an NSSM restart.
powershell -NoProfile -Command "$p=@(10580,3000); foreach($x in $p){ if(-not (Get-NetTCPConnection -LocalPort $x -State Listen -ErrorAction SilentlyContinue)){ exit 1 } }; exit 0" >nul 2>&1
if %errorlevel% neq 0 exit /b 1
timeout /t 10 /nobreak >nul
goto :watch
