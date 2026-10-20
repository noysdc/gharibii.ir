@echo off
setlocal

rem مسیر پوشه‌ای که این فایل bat در آن قرار دارد
set "SCRIPT_DIR=%~dp0"
rem حذف بک‌اسلش انتهایی (اختیاری)
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

rem رفتن به پوشه اسکریپت
pushd "%SCRIPT_DIR%" || (
    echo [ERROR] Cannot access script directory: %SCRIPT_DIR%
    pause
    exit /b 1
)

rem بررسی وجود فایل پایتون
if not exist "%SCRIPT_DIR%\resize_products.py" (
    echo [ERROR] resize_products.py not found in: %SCRIPT_DIR%
    popd
    pause
    exit /b 1
)

rem اجرای اسکریپت با پایتون
python "%SCRIPT_DIR%\resize_products.py"
set "EXITCODE=%ERRORLEVEL%"

popd

if not "%EXITCODE%"=="0" (
    echo [WARN] Script exited with code %EXITCODE%
)

pause
endlocal