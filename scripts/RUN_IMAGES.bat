@echo off
color 0E
echo ===================================================
echo      Organizing Product Images...
echo ===================================================
echo.
cd /d "%~dp0"
python organize_images_v3.py
echo.
echo ===================================================
echo               DONE! Check assets folder.
echo ===================================================
pause