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
rem The service-install step needs NSSM. Catch its absence here, in seconds,
rem instead of after several minutes of builds and migrations.
where nssm >nul 2>&1
if %errorlevel% neq 0 (
  if not exist "%ProgramData%\chocolatey\bin\nssm.exe" (
    echo [ERROR] NSSM is not installed. Install it first: choco install nssm -y  or download from https://nssm.cc>>"%MAIN_LOG%"
    endlocal & exit /b 10
  )
)
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo [ERROR] Must run as Administrator>>"%MAIN_LOG%"
  endlocal & exit /b 10
)
rem Nested \" inside a parenthesized ( ) block trips cmd's block parser (see
rem update-monorepo.bat's elevation comment) - so the PID lookup below is a
rem plain, unparenthesized statement, never nested inside the "port busy" if.
for %%p in (10580 3000) do (
  set "PORT_OWNER="
  powershell -NoProfile -Command "$c=Get-NetTCPConnection -LocalPort %%p -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if(-not $c){exit 0}; $proc=Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; if($proc){Write-Output ($proc.ProcessName + ' PID ' + $proc.Id)}else{Write-Output ('PID ' + $c.OwningProcess)}; exit 1" >"%TEMP%\dlsu_port_owner.txt" 2>nul
  if not !errorlevel! equ 0 set /p PORT_OWNER=<"%TEMP%\dlsu_port_owner.txt"
  del "%TEMP%\dlsu_port_owner.txt" >nul 2>&1
  if defined PORT_OWNER (
    echo [ERROR] Port %%p already in use by !PORT_OWNER!>>"%MAIN_LOG%"
    endlocal & exit /b 20
  )
)
endlocal & exit /b 0
