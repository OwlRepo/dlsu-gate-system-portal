@echo off
rem Self-elevate: NSSM install/start needs Administrator. deploy-monorepo.bat
rem already runs elevated when it calls this file, so this check passes
rem straight through with no relaunch and no output - safe for that
rem programmatic, output-redirected call. Standalone double-click use (repair/
rem reinstall without a full deploy) is what this guard actually protects.
net session >nul 2>&1
if %errorlevel% equ 0 goto :elevated
echo [INFO] Administrator access is required. Approve the prompt to continue.
powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/k','\"%~f0\"' -Verb RunAs"
if errorlevel 1 (
  echo [ERROR] Could not get Administrator access.
  echo [ERROR] Right-click this file and choose "Run as administrator".
  pause
)
exit /b 0
:elevated
setlocal enabledelayedexpansion
cd /d "%~dp0\.."
set "PROJECT_ROOT=%cd%"
set "SERVICE_NAME=DLSUGateMonorepo"
set "DISPLAY_NAME=DLSU Gate Monorepo"
set "LOG_DIR=%~dp0logs\current"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1
set "NSSM="
for /f "delims=" %%i in ('where nssm 2^>nul') do set "NSSM=%%i" & goto :have_nssm
if exist "%ProgramData%\chocolatey\bin\nssm.exe" set "NSSM=%ProgramData%\chocolatey\bin\nssm.exe"
:have_nssm
if not defined NSSM (
  echo [ERROR] NSSM is not installed.
  exit /b 60
)
"%NSSM%" stop "%SERVICE_NAME%" >nul 2>&1
"%NSSM%" remove "%SERVICE_NAME%" confirm >nul 2>&1
"%NSSM%" install "%SERVICE_NAME%" "cmd.exe" "/c" "\"%~dp0run-monorepo.cmd\""
if %errorlevel% neq 0 exit /b 60
"%NSSM%" set "%SERVICE_NAME%" AppDirectory "%PROJECT_ROOT%"
"%NSSM%" set "%SERVICE_NAME%" DisplayName "%DISPLAY_NAME%"
"%NSSM%" set "%SERVICE_NAME%" Start SERVICE_AUTO_START
"%NSSM%" set "%SERVICE_NAME%" AppStdout "%LOG_DIR%\service.stdout.log"
"%NSSM%" set "%SERVICE_NAME%" AppStderr "%LOG_DIR%\service.stderr.log"
"%NSSM%" set "%SERVICE_NAME%" AppExit Default Restart
sc failure "%SERVICE_NAME%" reset= 86400 actions= restart/10000/restart/10000/restart/10000 >nul 2>&1
net start "%SERVICE_NAME%" >nul 2>&1
if %errorlevel% neq 0 exit /b 60
exit /b 0
