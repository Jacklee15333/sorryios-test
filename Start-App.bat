@echo off
title Sorryios AI

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

:: Check if Electron is installed
if not exist "desktop\node_modules\electron" (
    echo.
    echo   First time setup required. Running installer...
    echo.
    call "%PROJECT_DIR%Setup-Desktop.bat"
)

:: Check if frontend is built
if not exist "backend\public\app\index.html" (
    echo.
    echo   Building frontend...
    echo.
    cd frontend
    call npx vite build --outDir ../backend/public/app
    cd ..
)

:: Launch desktop app
cd desktop
start "" npx electron .
exit
