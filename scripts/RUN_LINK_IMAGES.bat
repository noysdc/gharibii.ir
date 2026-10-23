@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo === گزارش (بدون تغییر) ===
python scripts\link_images.py
echo.
set /p OK=برای اعمال تغییرات y را بزنید: 
if /i "%OK%"=="y" python scripts\link_images.py --apply
pause
