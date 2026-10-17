@echo off
color 0B
echo ===================================================
echo      Analyzing Product Prices...
echo ===================================================
echo.
cd /d "%~dp0"
python analyze_prices.py
echo.
pause