@echo off
setlocal
net stop DLSUGateMonorepo
if %errorlevel% neq 0 exit /b 60
exit /b 0
