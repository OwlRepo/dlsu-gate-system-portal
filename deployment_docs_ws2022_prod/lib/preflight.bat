@echo off
setlocal enabledelayedexpansion
set "PROJECT_ROOT=%~1"
set "LOG_DIR=%~2"
set "MAIN_LOG=%LOG_DIR%\prereq.log"
if not exist "%PROJECT_ROOT%\.env" (
  echo [ERROR] Missing root .env>>"%MAIN_LOG%"
  endlocal & exit /b 20
)
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo [ERROR] Node not found>>"%MAIN_LOG%"
  endlocal & exit /b 10
)
where bun >nul 2>&1
if %errorlevel% neq 0 (
  echo [WARN] Bun not found, npm fallback expected>>"%MAIN_LOG%"
)
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo [ERROR] Must run as Administrator>>"%MAIN_LOG%"
  endlocal & exit /b 10
)
for %%p in (10580 3000) do (
  powershell -NoProfile -Command "$conn=Get-NetTCPConnection -LocalPort %%p -State Listen -ErrorAction SilentlyContinue; if($conn){exit 1}else{exit 0}" >nul 2>&1
  if !errorlevel! neq 0 (
    echo [ERROR] Port %%p already in use>>"%MAIN_LOG%"
    endlocal & exit /b 20
  )
)
endlocal & exit /b 0
