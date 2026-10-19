@echo off
chcp 65001 >nul
title Build Products Automation
color 0A

echo =======================================================
echo       Running build_products.py ...
echo =======================================================
echo.

:: Try python command
python --version >nul 2>&1
if %errorlevel% equ 0 (
    set PY_CMD=python
    goto :run_script
)

:: Try py command (Windows Python Launcher)
py --version >nul 2>&1
if %errorlevel% equ 0 (
    set PY_CMD=py
    goto :run_script
)

echo [ERROR] Python is not installed or not in PATH!
pause
exit /b

:run_script
if not exist "products.csv" (
    echo [ERROR] File "products.csv" not found in this folder!
    pause
    exit /b
)

:: Run the script
%PY_CMD% build_products.py products.csv

echo.
echo =======================================================
echo       Done! Check the _products folder.
echo =======================================================
pause