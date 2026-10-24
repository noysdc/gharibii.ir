@echo off
color 0E
cd /d "%~dp0"

echo ===================================================
echo   Step 1/2 : Price groups report (nothing changes)
echo ===================================================
echo.
python sync_price_groups.py
if errorlevel 1 goto :error

echo.
set /p ANSWER=Apply these changes? (y/n): 
if /i not "%ANSWER%"=="y" goto :cancel

echo.
echo ===================================================
echo   Step 2/2 : Applying changes
echo ===================================================
echo.
python sync_price_groups.py --apply
if errorlevel 1 goto :error

echo.
echo ===================================================
echo   DONE. Now commit and push the changes to GitHub.
echo ===================================================
echo.
pause
exit /b 0

:cancel
echo.
echo Cancelled. No files were changed.
pause
exit /b 0

:error
color 0C
echo.
echo ***************************************************
echo   ERROR: script failed. Check that Python and the
echo   pyyaml package are installed (pip install pyyaml).
echo ***************************************************
echo.
pause
exit /b 1
