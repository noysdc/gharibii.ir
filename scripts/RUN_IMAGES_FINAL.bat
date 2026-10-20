@echo off
chcp 65001 >nul
color 0A
cd /d "%~dp0"
echo ===================================================
echo      Moving images to products + linking md ...
echo ===================================================
echo.
python organize_images_final.py
echo.
pause
