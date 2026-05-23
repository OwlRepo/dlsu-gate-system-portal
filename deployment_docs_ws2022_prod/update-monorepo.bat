@echo off
setlocal
cd /d "%~dp0\.."
git pull origin main >nul 2>&1
call "%~dp0deploy-monorepo.bat"
exit /b %errorlevel%
