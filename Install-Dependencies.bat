@echo off
chcp 65001 >nul 2>&1
title Sorryios AI - Install Dependencies

echo.
echo ============================================================
echo          Sorryios AI Note System - Install Dependencies
echo ============================================================
echo.

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found! Please install Node.js first.
    echo Download: https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo [OK] Node.js version: %NODE_VER%
echo.

echo [1/3] Installing backend dependencies...
cd backend
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Backend install failed!
    pause
    exit /b 1
)
echo [OK] Backend dependencies installed
echo.

echo [2/3] Installing frontend dependencies...
cd ..\frontend
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] Frontend install failed!
    pause
    exit /b 1
)
echo [OK] Frontend dependencies installed
echo.

echo [3/3] Installing Playwright browser...
cd ..\backend
call npx playwright install chromium
echo [OK] Playwright browser installed
echo.

cd "%PROJECT_DIR%"

echo.
echo ============================================================
echo              ALL DEPENDENCIES INSTALLED!
echo ============================================================
echo   Now you can run "Start-Services.bat"
echo ============================================================
echo.
pause
