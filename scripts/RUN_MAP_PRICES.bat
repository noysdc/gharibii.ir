@echo off
color 0A
echo ===================================================
echo      Mapping Prices to Groups...
echo ===================================================
echo.
cd /d "%~dp0"
python map_prices.py
echo.
pause