@echo off
color 0B
echo ===================================================
echo      Generating MD Files with English Names
echo ===================================================
echo.
cd /d "%~dp0"
python csv_to_md_v3.py
echo.
echo ===================================================
echo               DONE! Check _products folder.
echo ===================================================
pause