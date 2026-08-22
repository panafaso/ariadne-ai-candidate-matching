@echo off
setlocal
cd /d "%~dp0frontend"

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Run SETUP_ARIADNE.bat after installing Node.js.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Frontend dependencies are missing. Running npm install...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

call npm run dev -- --host 127.0.0.1
pause
