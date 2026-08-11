@echo off
setlocal
cd /d "%~dp0\.."
rem A silenced, unchecked pull meant a failed fetch quietly redeployed the old
rem code and reported success. Surface it and stop instead.
git pull origin main
if %errorlevel% neq 0 (
  echo [ERROR] git pull failed. Resolve it before deploying.
  exit /b 30
)
call "%~dp0deploy-monorepo.bat"
exit /b %errorlevel%
