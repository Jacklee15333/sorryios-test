@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul 2>&1
title Sorryios AI - Launcher

echo.
echo ============================================================
echo          Sorryios AI Note System - Start Services
echo ============================================================
echo.

set "PROJECT_DIR=%~dp0"
cd /d "%PROJECT_DIR%"

if not exist "backend\package.json" (
    echo [ERROR] Cannot find backend folder!
    echo Please put this script in project root: D:\sorryios-test\
    pause
    exit /b 1
)

if not exist "frontend\package.json" (
    echo [ERROR] Cannot find frontend folder!
    pause
    exit /b 1
)

:: ============================================================
:: Step 1: Clean up occupied ports
:: ============================================================
echo [Step 1] Checking and cleaning ports...
echo.

:: Check port 3000 (backend)
echo   Checking port 3000 (backend)...
set "found3000=0"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING" 2^>nul') do (
    set "found3000=1"
    echo     Found process PID: %%a
    taskkill /PID %%a /F >nul 2>&1
    echo     Killed!
)
if "!found3000!"=="0" echo     Port 3000 is free

:: Check port 5173 (frontend)
echo   Checking port 5173 (frontend)...
set "found5173=0"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173 " ^| findstr "LISTENING" 2^>nul') do (
    set "found5173=1"
    echo     Found process PID: %%a
    taskkill /PID %%a /F >nul 2>&1
    echo     Killed!
)
if "!found5173!"=="0" echo     Port 5173 is free

:: Also close any existing Sorryios windows
taskkill /FI "WINDOWTITLE eq Sorryios-Backend*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Sorryios-Frontend*" /F >nul 2>&1

echo.
echo   [OK] Ports cleaned!
echo.

:: Wait for ports to be fully released
timeout /t 2 /nobreak >nul

:: ============================================================
:: Step 2: Install dependencies if needed
:: ============================================================
if not exist "backend\node_modules" (
    echo [Step 2] Installing backend dependencies...
    cd backend
    call npm install
    cd ..
    echo.
)

if not exist "frontend\node_modules" (
    echo [Step 2] Installing frontend dependencies...
    cd frontend
    call npm install
    cd ..
    echo.
)

:: ============================================================
:: Step 3: Start services
:: ============================================================
echo [Step 3] Starting services...
echo.

echo   Starting backend (port 3000)...
start "Sorryios-Backend" cmd /k "cd /d %PROJECT_DIR%backend && npm run dev"

timeout /t 3 /nobreak >nul

echo   Starting frontend (port 5173)...
start "Sorryios-Frontend" cmd /k "cd /d %PROJECT_DIR%frontend && npm run dev"

:: ============================================================
:: Step 4: Wait and open browser
:: ============================================================
echo.
echo [Step 4] Waiting for services to initialize...
timeout /t 8 /nobreak >nul

echo.
echo ============================================================
echo                   STARTED SUCCESSFULLY!
echo ============================================================
echo.
echo   Frontend:      http://localhost:5173
echo   Backend API:   http://localhost:3000
echo   Admin Panel:   http://localhost:3000/admin
echo.
echo ============================================================
echo.

echo Opening browser...
start http://localhost:5173
timeout /t 1 /nobreak >nul
start http://localhost:3000/admin

echo.
echo Window closing in 3 seconds...
timeout /t 3 /nobreak >nul