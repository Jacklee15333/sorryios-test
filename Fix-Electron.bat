@echo off
title Sorryios AI - Fix Electron Install

echo.
echo ============================================================
echo   Sorryios AI - Fix Electron Install
echo ============================================================
echo.

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

set "ELECTRON_ZIP=%PROJECT_DIR%desktop\electron-v33.3.1-win32-x64.zip"

if not exist "%ELECTRON_ZIP%" (
    echo   ERROR: electron-v33.3.1-win32-x64.zip not found!
    echo   Put it in: %PROJECT_DIR%desktop\
    pause
    exit /b 1
)

echo   [1/4] Found electron zip file. OK.
echo.

:: Step 1: Create the cache directory electron expects
echo   [2/4] Setting up electron cache...

set "CACHE_DIR=%LOCALAPPDATA%\electron\Cache"
if not exist "%CACHE_DIR%" mkdir "%CACHE_DIR%"

:: The key: electron looks for this exact filename in cache
copy /Y "%ELECTRON_ZIP%" "%CACHE_DIR%\electron-v33.3.1-win32-x64.zip" >nul
echo   Copied to: %CACHE_DIR%
echo   OK.
echo.

:: Step 2: Clean the broken install
echo   [3/4] Cleaning previous failed install...
cd desktop
if exist "node_modules\electron" (
    rmdir /S /Q "node_modules\electron" >nul 2>&1
)
echo   OK.
echo.

:: Step 3: Reinstall with cache available
echo   [4/4] Installing electron from local cache...
echo   (This should be fast since we have the zip locally)
echo.

set "ELECTRON_CACHE=%CACHE_DIR%"
set "electron_config_cache=%CACHE_DIR%"
call npm install

cd ..

echo.
echo   Checking result...
echo.

if exist "desktop\node_modules\electron\dist\electron.exe" (
    echo ============================================================
    echo.
    echo   DONE! Electron installed successfully!
    echo.
    echo   Now double-click Start-App.bat to launch the app.
    echo.
    echo ============================================================
) else (
    echo   electron.exe not found in expected location.
    echo   Trying to check actual location...
    echo.
    where /R "desktop\node_modules\electron" electron.exe 2>nul
    echo.
    echo   If you see a path above, the install is OK.
    echo   Try double-click Start-App.bat anyway.
    echo.
    echo   If not, try running these commands manually in PowerShell:
    echo.
    echo     $env:ELECTRON_CACHE="%CACHE_DIR%"
    echo     cd %PROJECT_DIR%desktop
    echo     npm install
    echo.
)

pause
