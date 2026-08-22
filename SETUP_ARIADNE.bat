@echo off
setlocal
cd /d "%~dp0"

echo ==============================================
echo ARIADNE - first-time setup
echo ==============================================

if exist "C:\hermesenv\Scripts\python.exe" (
  set "PY=C:\hermesenv\Scripts\python.exe"
) else (
  set "PY=python"
)

echo Using Python: %PY%
"%PY%" -m pip install -U pip
if errorlevel 1 goto :error
"%PY%" -m pip install -r "%~dp0backend\requirements.txt"
if errorlevel 1 goto :error
"%PY%" -m nltk.downloader stopwords
if errorlevel 1 goto :error

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: npm was not found. Install Node.js, then run this setup again.
  pause
  exit /b 1
)

cd /d "%~dp0frontend"
call npm install
if errorlevel 1 goto :error

echo.
echo ==============================================
echo ARIADNE setup complete.
echo Double-click START_ARIADNE.bat to run it.
echo ==============================================
pause
exit /b 0

:error
echo.
echo ARIADNE setup failed. Read the error above.
pause
exit /b 1
