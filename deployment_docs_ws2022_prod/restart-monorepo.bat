@echo off
setlocal
net stop DLSUGateMonorepo >nul 2>&1
net start DLSUGateMonorepo
if %errorlevel% neq 0 exit /b 60
exit /b 0
