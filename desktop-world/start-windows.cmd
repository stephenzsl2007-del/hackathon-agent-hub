@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo Install dependencies first: pnpm install
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" .
