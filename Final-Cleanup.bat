@echo off
title Sorryios AI - Final Cleanup

echo.
echo ============================================================
echo   Sorryios AI - Project Cleanup
echo ============================================================
echo.
echo   This will:
echo   1. Backup all files to D:\sorryios-backup\
echo   2. Delete unused files from your project
echo.
echo   Press any key to start, or close window to cancel.
echo.
pause

set "P=%~dp0"
set "B=D:\sorryios-backup"

:: =============================================
:: STEP 1: BACKUP
:: =============================================
echo.
echo [1/3] Creating backup at %B% ...

if not exist "%B%" mkdir "%B%"
if not exist "%B%\uploads" mkdir "%B%\uploads"

:: Backup root files
copy "%P%.env" "%B%\" >nul 2>&1
copy "%P%.env.example" "%B%\" >nul 2>&1
copy "%P%.gitignore" "%B%\" >nul 2>&1
copy "%P%Start-Services.bat" "%B%\" >nul 2>&1
copy "%P%start.bat" "%B%\" >nul 2>&1
copy "%P%stop.bat" "%B%\" >nul 2>&1
copy "%P%update.bat" "%B%\" >nul 2>&1
copy "%P%logs.bat" "%B%\" >nul 2>&1
copy "%P%vite.config.js" "%B%\" >nul 2>&1

:: Backup root uploads
xcopy "%P%uploads\*" "%B%\uploads\" /E /Q >nul 2>&1

:: Backup .github
xcopy "%P%.github\*" "%B%\.github\" /E /Q >nul 2>&1

:: Backup backend temp data
xcopy "%P%backend\data\chunks\*" "%B%\backend-chunks\" /E /Q >nul 2>&1
xcopy "%P%backend\data\results\*" "%B%\backend-results\" /E /Q >nul 2>&1
xcopy "%P%backend\uploads\temp\*" "%B%\backend-uploads-temp\" /E /Q >nul 2>&1

echo   Backup done.
echo.

:: =============================================
:: STEP 2: DELETE
:: =============================================
echo [2/3] Deleting unused files...
echo.

:: --- Root: old launchers (replaced by desktop app) ---
echo   Old launcher scripts...
del "%P%Start-Services.bat" >nul 2>&1
del "%P%start.bat" >nul 2>&1
del "%P%stop.bat" >nul 2>&1
del "%P%update.bat" >nul 2>&1
del "%P%logs.bat" >nul 2>&1
echo   OK

:: --- Root: dev/config files not needed to run ---
echo   Dev config files...
del "%P%.env" >nul 2>&1
del "%P%.env.example" >nul 2>&1
del "%P%.gitignore" >nul 2>&1
echo   OK

:: --- Root: duplicate vite.config.js (real one is in frontend/) ---
echo   Duplicate vite.config.js from root...
del "%P%vite.config.js" >nul 2>&1
echo   OK

:: --- Root: personal note files (Chinese named txt files) ---
echo   Personal note files...
for %%f in ("%P%*.txt") do (
    if /I not "%%~nxf"=="project-tree.txt" del "%%f" >nul 2>&1
)
echo   OK

:: --- Root: one-time scripts (already used) ---
echo   One-time setup scripts...
del "%P%Cleanup-Project.bat" >nul 2>&1
del "%P%Setup-Desktop.bat" >nul 2>&1
del "%P%project-tree.txt" >nul 2>&1
echo   OK

:: --- Root: uploads folder (duplicate of backend/uploads) ---
echo   Root uploads folder (duplicate)...
rmdir /S /Q "%P%uploads" >nul 2>&1
echo   OK

:: --- Root: .github folder (GitHub config, not needed) ---
echo   .github folder...
rmdir /S /Q "%P%.github" >nul 2>&1
echo   OK

:: --- Backend: temp data folders (can be emptied) ---
echo   Backend temp data...
if exist "%P%backend\data\chunks" (
    del /Q "%P%backend\data\chunks\*" >nul 2>&1
)
if exist "%P%backend\data\results" (
    del /Q "%P%backend\data\results\*" >nul 2>&1
)
if exist "%P%backend\uploads\temp" (
    del /Q "%P%backend\uploads\temp\*" >nul 2>&1
)
echo   OK

echo.

:: =============================================
:: STEP 3: SUMMARY
:: =============================================
echo [3/3] Cleanup complete!
echo.
echo ============================================================
echo.
echo   DELETED:
echo     - 5 old launcher scripts (start/stop/update/logs/Start-Services)
echo     - 3 dev config files (.env, .env.example, .gitignore)
echo     - 1 duplicate vite.config.js from root
echo     - 2 personal note txt files
echo     - 3 one-time scripts (Cleanup/Setup/project-tree)
echo     - 1 duplicate uploads folder
echo     - 1 .github folder
echo     - Emptied temp data folders
echo.
echo   BACKUP at: %B%
echo.
echo   KEPT (needed by app):
echo     - Sorryios-AI.vbs (silent launcher)
echo     - Create-Shortcut.vbs (shortcut creator)
echo     - Start-App.bat (backup launcher)
echo     - Rebuild-Frontend.bat (if exists)
echo     - All backend/ code and data
echo     - All frontend/ code
echo     - All desktop/ code
echo.
echo   Your app should work exactly the same.
echo   If anything breaks, restore from %B%
echo.
echo ============================================================
echo.
pause
