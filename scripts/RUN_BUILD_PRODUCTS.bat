@echo off
chcp 65001 >nul
title Build Products Automation
color 0A

echo =======================================================
echo       Dar hal ejraye build_products.py ...
echo       (Sakht-e file haye Markdown az CSV)
echo =======================================================
echo.

:: بررسی وجود پایتون
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    pause
    exit /b
)

:: بررسی وجود فایل products.csv
if not exist "products.csv" (
    echo [ERROR] File "products.csv" peyda nashod!
    echo Lotfan file CSV ra dar in pooshe copy konid.
    pause
    exit /b
)

:: اجرای اسکریپت
python build_products.py products.csv

echo.
echo =======================================================
echo       Ejra be payan resid!
echo       Pooshe "_products" va file "mapping_report.csv" sakhte shodand.
echo =======================================================
pause