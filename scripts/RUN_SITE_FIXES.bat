@echo off
chcp 65001 >nul
color 0B
cd /d "%~dp0"
python apply_site_fixes.py
echo.
pause
