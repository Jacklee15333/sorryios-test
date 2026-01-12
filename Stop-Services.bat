@echo off
chcp 65001 >nul 2>&1
title Sorryios AI - Stop Services

echo.
echo ============================================================
echo          Sorryios AI Note System - Stop Services
echo ============================================================
echo.

echo Stopping Node.js services...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
    echo Stopping backend PID: %%a
    taskkill /PID %%a /F >nul 2>&1
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING 2^>nul') do (
    echo Stopping frontend PID: %%a
    taskkill /PID %%a /F >nul 2>&1
)

taskkill /FI "WINDOWTITLE eq Sorryios-Backend*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Sorryios-Frontend*" /F >nul 2>&1

echo.
echo [OK] All services stopped!
echo.
pause
