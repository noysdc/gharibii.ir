@echo off
color 0E
echo ===================================================
echo      Manual Image Linking Tool
echo ===================================================
echo.
cd /d "%~dp0"
python link_manual.py
echo.
pause