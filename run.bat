@echo off
setlocal
title Flect Launcher
echo ===================================================
echo   Flect - Wireless Scrcpy Controller
echo ===================================================
echo.
cd /d "%~dp0"

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js is not installed or not in PATH!
  echo Please install Node.js ^(v18 or higher^) to run Flect.
  echo Download from: https://nodejs.org/
  echo.
  pause
  exit /b
)

:: Install dependencies if missing
if not exist "node_modules\" (
  echo [INFO] Installing required dependencies ^(Express^)...
  call npm install
  if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies!
    pause
    exit /b
  )
)

echo [INFO] Starting Flect Web Dashboard...
echo.
call npm start
if %errorlevel% neq 0 (
  echo.
  echo [WARNING] Server stopped.
)
pause
