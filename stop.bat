@echo off
echo.
echo ========================================
echo   Sorryios AI - Stop Service
echo ========================================
echo.
cd /d D:\sorryios-test
echo Stopping container...
docker-compose down
echo.
echo ========================================
echo   Service stopped.
echo ========================================
echo.
pause
