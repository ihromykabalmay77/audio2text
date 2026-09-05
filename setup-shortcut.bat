@echo off
echo Membuat shortcut di Desktop...
powershell -ExecutionPolicy Bypass -File "%~dp0create-shortcut.ps1"
echo.
echo Shortcut berhasil dibuat!
echo Buka Desktop untuk melihat "Speech to Narasi" shortcut
pause