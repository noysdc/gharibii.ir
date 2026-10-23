@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo === REPORT (no changes) ===
python scripts\link_images.py
if errorlevel 1 (
    echo [ERROR] script failed.
    pause
    exit /b 1
)
echo.
set /p OK="Apply changes? (y/n): "
if /i "%OK%"=="y" (
    python scripts\link_images.py --apply
)
echo.
echo Done.
pause