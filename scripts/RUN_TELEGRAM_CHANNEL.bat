@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
echo.
echo  1 = وضعیت
echo  2 = پیش نمایش محصول بعدی
echo  3 = ارسال همین حالا
echo  4 = علامت زدن همه محصولات فعلی به عنوان ارسال شده
echo.
set /p c=شماره را بنویس: 
if "%c%"=="1" python scripts\telegram_channel.py status
if "%c%"=="2" python scripts\telegram_channel.py next
if "%c%"=="3" python scripts\telegram_channel.py post
if "%c%"=="4" python scripts\telegram_channel.py mark-all
echo.
pause
