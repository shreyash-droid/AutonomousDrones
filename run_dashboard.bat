@echo off
REM One-click: starts the AI backend + the Next.js website/dashboard and opens the browser.
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" (set PY=.venv\Scripts\python.exe) else (set PY=python)
if not exist "dashboard\node_modules" (
    echo Installing dashboard dependencies - first run only...
    call npm --prefix dashboard install --prefer-offline
)
echo Starting AI backend on http://localhost:8000 ...
start "AgriDrone backend" %PY% simulation\server.py
echo Starting dashboard on http://localhost:3000 ...
start "" cmd /c "timeout /t 12 >nul && start http://localhost:3000"
call npm --prefix dashboard run dev
