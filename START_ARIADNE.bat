@echo off
setlocal
cd /d "%~dp0"

start "ARIADNE Backend" cmd /k call "%~dp0START_BACKEND.bat"
timeout /t 3 /nobreak >nul
start "ARIADNE Frontend" cmd /k call "%~dp0START_FRONTEND.bat"
timeout /t 3 /nobreak >nul
start "" "http://127.0.0.1:5173"
exit /b 0
