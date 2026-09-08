@echo off
title Restart Uvicorn - Speech to Narasi
echo ========================================
echo   Restarting Uvicorn Server...
echo ========================================
echo.
taskkill /F /IM uvicorn.exe 2>nul
timeout /t 1 /nobreak >nul
cd /d D:\Audio2Text\api
echo Starting uvicorn on port 8000...
echo Buka: http://localhost:8000/api/health
echo.
uvicorn index:app --reload --port 8000
pause
