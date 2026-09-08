@echo off
echo ========================================
echo   Deploy to Vercel
echo ========================================
echo.

echo [1/3] Copying files to public/...
xcopy /E /Y /Q "D:\Audio2Text\index.html" "D:\Audio2Text\public\" >nul
xcopy /E /Y /Q "D:\Audio2Text\css\*" "D:\Audio2Text\public\css\" >nul
xcopy /E /Y /Q "D:\Audio2Text\js\*" "D:\Audio2Text\public\js\" >nul
echo ✅ Files copied!

echo.
echo [2/3] Deploying to Vercel...
cd /d D:\Audio2Text
vercel --yes --prod

echo.
echo ========================================
echo   Deploy selesai!
echo   https://audio2text-alpha.vercel.app/
echo ========================================
pause