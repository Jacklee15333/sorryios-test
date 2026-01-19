@echo off
echo.
echo ========================================
echo   Sorryios AI - Update and Deploy
echo ========================================
echo.
cd /d D:\sorryios-test
echo [1/4] Stopping container...
docker-compose down
echo.
echo [2/4] Building image (please wait)...
docker-compose build --no-cache
echo.
echo [3/4] Starting container...
docker-compose up -d
echo.
echo [4/4] Waiting for startup...
ping 127.0.0.1 -n 8 > nul
echo.
echo ========================================
echo   Recent logs:
echo ========================================
docker-compose logs --tail 25
echo.
echo ========================================
echo   Done!
echo   Frontend: http://localhost:3000
echo   Admin: http://localhost:3000/admin
echo ========================================
echo.
pause
