@echo off
color 0A
echo ===================================================
echo      Auto Linking Images via Manual Map
echo ===================================================
echo.
cd /d "%~dp0"
python auto_link_map.py
echo.
echo ===================================================
echo               DONE!
echo ===================================================
pause