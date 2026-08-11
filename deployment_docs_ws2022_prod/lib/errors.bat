@echo off
setlocal
set "EXIT_CODE=%~1"
set "STEP_NAME=%~2"
set "DETAILS=%~3"
call "%~dp0logging.bat" ERROR "Step failed: %STEP_NAME%"
call "%~dp0logging.bat" ERROR "Details: %DETAILS%"
call "%~dp0logging.bat" ERROR "Exit code: %EXIT_CODE%"
call "%~dp0logging.bat" NEXT_ACTION "Inspect logs in %LOG_DIR%"
echo [ERROR] %STEP_NAME% failed. Details: %DETAILS%
echo [INFO] Logs: %LOG_DIR%
rem Hold the window open so a double-click operator can actually read the
rem failure instead of watching it vanish. Set DLSU_NO_PAUSE=1 for unattended
rem or scripted runs.
if not "%DLSU_NO_PAUSE%"=="1" pause
endlocal & exit /b %EXIT_CODE%
