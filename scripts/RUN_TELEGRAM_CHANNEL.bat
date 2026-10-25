@echo off
cd /d "%~dp0\.."
where python >nul 2>nul
if errorlevel 1 (
  echo Python is not installed or not in PATH.
  pause
  exit /b 1
)
echo.
echo  Telegram channel tool
echo  ---------------------
echo  1 = Status
echo  2 = Preview next product (sends nothing)
echo  3 = Send one product to the channel NOW
echo  4 = Mark ALL current products as already sent
echo.
set /p c=Type a number and press Enter: 
if "%c%"=="1" python scripts\telegram_channel.py status
if "%c%"=="2" python scripts\telegram_channel.py next
if "%c%"=="3" python scripts\telegram_channel.py post --force
if "%c%"=="4" python scripts\telegram_channel.py mark-all
echo.
pause