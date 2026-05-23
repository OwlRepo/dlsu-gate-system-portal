@echo off
setlocal enabledelayedexpansion
if not defined LOG_DIR set "LOG_DIR=%~dp0..\logs\current"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1
if not defined MAIN_LOG set "MAIN_LOG=%LOG_DIR%\orchestrator.log"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format \"yyyy-MM-dd HH:mm:ss\""') do set "TS=%%i"
set "LEVEL=%~1"
set "MSG=%~2"
echo [!TS!] [!LEVEL!] !MSG!
echo [!TS!] [!LEVEL!] !MSG!>>"%MAIN_LOG%"
endlocal & exit /b 0
