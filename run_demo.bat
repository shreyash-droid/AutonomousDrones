@echo off
REM One-click demo: starts the web Ground Control Station and opens the browser.
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" (
    set PY=.venv\Scripts\python.exe
) else (
    set PY=python
)
echo Starting AgriDrone Ground Control Station...
start "" cmd /c "timeout /t 8 >nul && start http://localhost:8000"
%PY% simulation\server.py
if errorlevel 1 (
    echo.
    echo Server could not start - opening the offline replay instead.
    start "" "simulation\web\index.html"
    pause
)
