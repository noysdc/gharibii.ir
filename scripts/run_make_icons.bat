@echo off
chcp 65001 >nul
setlocal

REM ============================================================
REM  ساخت آیکون‌های PWA و تصاویر لودینگ آیفون
REM  این فایل داخل پوشهٔ scripts قرار دارد و از ریشهٔ پروژه اجرا می‌شود.
REM  نیازمندی: Python 3 + pip install pillow numpy
REM ============================================================

REM --- رفتن به ریشهٔ پروژه (یک پله بالاتر از scripts) ---
cd /d "%~dp0.."

echo.
echo ============================================
echo   ساخت آیکون‌ها و اسپلش‌ها
echo   مسیر اجرا: %CD%
echo ============================================
echo.

REM --- بررسی نصب بودن پایتون ---
where python >nul 2>nul
if errorlevel 1 (
    echo [خطا] Python پیدا نشد. ابتدا Python 3 را نصب کنید:
    echo        https://www.python.org/downloads/
    pause
    exit /b 1
)

REM --- بررسی نصب بودن Pillow و numpy ---
python -c "import PIL, numpy" >nul 2>nul
if errorlevel 1 (
    echo [اطلاع] کتابخانه‌های pillow و numpy نصب نیستند. در حال نصب...
    python -m pip install --upgrade pip
    python -m pip install pillow numpy
    if errorlevel 1 (
        echo [خطا] نصب کتابخانه‌ها ناموفق بود.
        pause
        exit /b 1
    )
)

REM --- بررسی وجود اسکریپت (داخل همان پوشهٔ scripts) ---
if not exist "scripts\make_icons.py" (
    echo [خطا] فایل scripts\make_icons.py پیدا نشد.
    echo        مطمئن شوید این بت داخل پوشهٔ scripts قرار دارد.
    pause
    exit /b 1
)

REM --- اجرای اسکریپت از ریشهٔ پروژه ---
echo.
echo [اجرا] python scripts\make_icons.py
echo.
python scripts\make_icons.py

if errorlevel 1 (
    echo.
    echo [خطا] اجرای اسکریپت با مشکل مواجه شد.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   تمام شد! فایل‌های ساخته‌شده:
echo   - assets\icons\icon-192.png
echo   - assets\icons\icon-512.png
echo   - assets\icons\maskable-512.png
echo   - assets\icons\apple-touch-icon.png
echo   - assets\splash\ios-*.jpg
echo ============================================
echo.
pause
endlocal