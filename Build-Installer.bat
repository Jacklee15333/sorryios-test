@echo off
chcp 65001 >nul
title Building Sorryios AI Installer

cd /d "%~dp0desktop-client"

echo ====================================
echo   Building Sorryios AI Installer
echo ====================================
echo.

if not exist "node_modules\electron" (
    echo Step 1: Installing dependencies...
    echo This may take a few minutes.
    echo.
    call npm install
    echo.
)

echo Step 2: Building installer...
echo Output will be in: release\
echo.
call npx electron-builder --win

echo.
echo ====================================
echo   Build complete!
echo   Check release\ folder for the installer.
echo ====================================
pause
