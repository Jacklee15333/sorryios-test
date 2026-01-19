@echo off
echo.
echo ========================================
echo   Sorryios AI - Start Service
echo ========================================
echo.
cd /d D:\sorryios-test
echo Starting container...
docker-compose up -d
echo.
ping 127.0.0.1 -n 5 > nul
echo ========================================
echo   Done!
echo   Frontend: http://localhost:3000
echo   Admin: http://localhost:3000/admin
echo ========================================
echo.
pause
