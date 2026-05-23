@echo off
setlocal
cd /d "%~dp0"
set "BASE=%~dp0logs\current"
if not exist "%BASE%" mkdir "%BASE%" >nul 2>&1
for %%f in (backend.stdout.log backend.stderr.log frontend.stdout.log frontend.stderr.log service.stdout.log service.stderr.log) do (
  if not exist "%BASE%\%%f" type nul > "%BASE%\%%f"
)
echo Following logs from %BASE%
powershell -NoProfile -Command "Get-Content -Path '%BASE%\backend.stdout.log','%BASE%\backend.stderr.log','%BASE%\frontend.stdout.log','%BASE%\frontend.stderr.log','%BASE%\service.stdout.log','%BASE%\service.stderr.log' -Tail 120 -Wait"
exit /b 0
