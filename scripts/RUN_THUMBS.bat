@echo off
chcp 65001 >nul
color 0E
cd /d "%~dp0"
python make_thumbs.py
echo.
pause
