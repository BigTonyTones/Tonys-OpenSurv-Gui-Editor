@echo off
TITLE Tonys OpenSurv Manager 1.2
echo Starting OpenSurv Manager...
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Error: Python is not installed or not in your PATH.
    echo Please install Python 3 from python.org
    pause
    exit /b
)

REM Run the server
python server.py
pause
