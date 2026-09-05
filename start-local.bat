@echo off
echo ========================================
echo   Speech to Narasi - Local Server
echo ========================================
echo.
echo Starting server on http://localhost:8000
echo Press Ctrl+C to stop server
echo.
cd /d D:\Audio2Text
python -m http.server 8000
pause