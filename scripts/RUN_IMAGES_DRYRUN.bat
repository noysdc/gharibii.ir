@echo off
chcp 65001 >nul
color 0E
cd /d "%~dp0"
echo ===================================================
echo      DRY RUN - nothing will be changed
echo ===================================================
echo.
python organize_images_final.py --dry-run
echo.
pause
