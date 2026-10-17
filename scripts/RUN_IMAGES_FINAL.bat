@echo off
color 0A
echo ===================================================
echo      Copying Matched Images Automatically...
echo ===================================================
echo.
cd /d "%~dp0"
python organize_images_final.py
echo.
echo ===================================================
echo               DONE!
echo ===================================================
pause