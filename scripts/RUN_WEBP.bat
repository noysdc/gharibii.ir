@echo off
color 0B
echo ===================================================
echo      Converting Images to WebP...
echo ===================================================
echo.
cd /d "%~dp0"
python convert_to_webp.py
echo.
echo ===================================================
echo               DONE! Check your images folder.
echo ===================================================
pause