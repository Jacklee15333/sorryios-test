@echo off
setlocal EnableDelayedExpansion
title Sorryios AI - Setup

echo.
echo ============================================================
echo       Sorryios AI Desktop App - First Time Setup
echo ============================================================
echo.

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

:: Step 1: Check Node.js
echo [1/4] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo   ERROR: Node.js not found!
    echo   Please install from: https://nodejs.org
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do echo   Found Node.js %%v
echo   OK
echo.

:: Step 2: Install backend deps
echo [2/4] Installing backend dependencies...
if not exist "backend\node_modules" (
    cd backend
    call npm install
    cd ..
    echo   Done.
) else (
    echo   Already installed, skipping.
)
echo.

:: Step 3: Build frontend
echo [3/4] Building frontend app...
if not exist "frontend\node_modules" (
    cd frontend
    call npm install
    cd ..
)

cd frontend
call npx vite build --outDir ../backend/public/app
cd ..

if exist "backend\public\app\index.html" (
    echo   Frontend build OK.
) else (
    echo   ERROR: Frontend build failed!
    pause
    exit /b 1
)
echo.

:: Step 4: Install Electron
echo [4/4] Installing Electron (about 200MB, please wait)...
if not exist "desktop\node_modules" (
    cd desktop
    call npm install
    cd ..
    echo   Electron installed.
) else (
    echo   Already installed, skipping.
)
echo.

echo ============================================================
echo.
echo   Setup complete!
echo.
echo   Now double-click Start-App.bat to launch the app.
echo.
echo ============================================================
echo.
pause
