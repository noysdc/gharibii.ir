@echo off
color 0E
cd /d "%~dp0"

echo ===================================================
echo   Step 1/2 : Analyzing product prices (price groups)
echo ===================================================
echo.
python analyze_prices.py
if errorlevel 1 goto :error

echo.
echo ===================================================
echo   Step 2/2 : Mapping prices to groups in products
echo ===================================================
echo.
python map_prices.py
if errorlevel 1 goto :error

echo.
echo ===================================================
echo   DONE. Now commit and push the changes to GitHub.
echo ===================================================
echo.
pause
exit /b 0

:error
color 0C
echo.
echo ***************************************************
echo   ERROR: script failed. Check that Python is
echo   installed and that you ran this file from the
echo   "scripts" folder of the project.
echo ***************************************************
echo.
pause
exit /b 1
