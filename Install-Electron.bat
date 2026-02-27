@echo off
title Sorryios AI - Install Electron Manually

echo.
echo ============================================================
echo   Sorryios AI - Manual Electron Install
echo ============================================================
echo.
echo   If npm install is stuck, follow these steps:
echo.
echo ============================================================
echo.
echo   STEP 1: Press Ctrl+C to stop the stuck install (if running)
echo.
echo   STEP 2: Download Electron zip from browser:
echo.
echo     https://npmmirror.com/mirrors/electron/33.3.1/electron-v33.3.1-win32-x64.zip
echo.
echo     (About 200MB, use browser to download)
echo.
echo   STEP 3: After download, put the zip file here:
echo.
echo     %~dp0desktop\
echo.
echo     (Same folder as this script's parent desktop folder)
echo     DO NOT UNZIP IT! Just put the .zip file there.
echo.
echo   STEP 4: Come back here and press any key to continue install.
echo.
echo ============================================================
pause

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

set "ELECTRON_ZIP=%PROJECT_DIR%desktop\electron-v33.3.1-win32-x64.zip"

if not exist "%ELECTRON_ZIP%" (
    echo.
    echo   ERROR: Cannot find electron-v33.3.1-win32-x64.zip
    echo   in folder: %PROJECT_DIR%desktop\
    echo.
    echo   Please download it first and put it there.
    echo.
    pause
    exit /b 1
)

echo.
echo   Found electron zip. Installing...
echo.

:: Set env so npm uses local zip instead of downloading
set "ELECTRON_MIRROR=file:///"
set "electron_mirror=file:///"
set "ELECTRON_CUSTOM_DIR=."
set "ELECTRON_OVERRIDE_DIST_PATH=%PROJECT_DIR%desktop\electron-local"

:: Install with npm using local cache
cd desktop

:: Create electron cache folder
set "LOCALCACHE=%LOCALAPPDATA%\electron\Cache"
if not exist "%LOCALCACHE%" mkdir "%LOCALCACHE%"

:: Copy zip to electron cache with correct name
echo   Copying to electron cache...
copy /Y "%ELECTRON_ZIP%" "%LOCALCACHE%\electron-v33.3.1-win32-x64.zip" >nul 2>&1
echo   Done.

:: Also set the environment variable for electron-download
set "electron_config_cache=%LOCALCACHE%"
set "ELECTRON_CACHE=%LOCALCACHE%"

echo   Running npm install...
echo.
call npm install
cd ..

echo.
if exist "desktop\node_modules\electron\dist\electron.exe" (
    echo ============================================================
    echo.
    echo   SUCCESS! Electron installed!
    echo.
    echo   Now double-click Start-App.bat to launch the app.
    echo.
    echo ============================================================
) else (
    echo   Electron exe not found. Trying alternative method...
    echo.
    cd desktop
    call npx electron-rebuild 2>nul
    cd ..
    
    if exist "desktop\node_modules\electron\dist\electron.exe" (
        echo   SUCCESS via alternative method!
    ) else (
        echo ============================================================
        echo.
        echo   Almost done! Run this final command manually:
        echo.
        echo     cd %PROJECT_DIR%desktop
        echo     npm install
        echo.
        echo   Then double-click Start-App.bat
        echo.
        echo ============================================================
    )
)
echo.
pause
