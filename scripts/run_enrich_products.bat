@echo off
setlocal
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
title Gharibii - product updater
cd /d "%~dp0.."

echo Working folder: %CD%
echo.

if not exist "_products" (
  echo [ERROR] Folder _products not found in the folder above.
  echo         Keep this .bat file inside the scripts folder of the repo (the repo root has _products).
  pause
  exit /b 1
)
if not exist "scripts\enrich_products.py" (
  echo [ERROR] scripts\enrich_products.py not found.
  echo         Copy the scripts folder from the zip into the repo root.
  pause
  exit /b 1
)

rem ---- find a Python that really runs (the Microsoft Store stub is skipped)
set "PY="
python -c "import sys" >nul 2>&1
if not errorlevel 1 set "PY=python"
if not defined PY (
  py -3 -c "import sys" >nul 2>&1
  if not errorlevel 1 set "PY=py -3"
)
if not defined PY (
  python3 -c "import sys" >nul 2>&1
  if not errorlevel 1 set "PY=python3"
)
if not defined PY (
  echo [ERROR] No working Python found.
  echo         Install Python from https://www.python.org/downloads/
  echo         and TICK "Add python.exe to PATH" in the installer.
  echo         If Python is installed, turn OFF the Windows "App execution aliases" for python.exe.
  pause
  exit /b 1
)
echo Using: %PY%
%PY% --version
echo.

%PY% -c "import yaml" >nul 2>&1
if errorlevel 1 (
  echo Installing pyyaml, one time only...
  %PY% -m pip install --user pyyaml
  %PY% -c "import yaml" >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] Could not install pyyaml. Run this by hand and send me the message:
    echo         %PY% -m pip install pyyaml
    pause
    exit /b 1
  )
)

:menu
echo.
echo ==============================================
echo   Gharibii - product updater
echo ==============================================
echo   1  Preview ALL products (no files changed)
echo   2  Apply to ALL products
echo   3  ONE product (preview first, then apply)
echo   4  ONE product - FORCE (discard my manual edits)
echo   5  Apply to ALL - FORCE (rebuild everything)
echo   6  CHECK problems: broken images, duplicates (report only)
echo   7  Exit
echo ==============================================
echo   Your manual edits are kept automatically.
echo ==============================================
set "CH="
set /p CH=Choose 1-7: 

if "%CH%"=="1" goto preview_all
if "%CH%"=="2" goto apply_all
if "%CH%"=="3" goto one
if "%CH%"=="4" goto one_force
if "%CH%"=="5" goto force_all
if "%CH%"=="6" goto check
if "%CH%"=="7" goto end
echo Invalid choice.
goto menu

:preview_all
%PY% scripts\enrich_products.py --dry-run --report scripts\report.csv
if errorlevel 1 echo [ERROR] The script failed. Copy the text above and send it to me.
echo.
echo Report saved: scripts\report.csv
pause
goto menu

:apply_all
echo.
echo This rewrites the product .md files. Make sure you have a git commit first.
set "OK="
set /p OK=Type y to continue: 
if /i not "%OK%"=="y" goto menu
%PY% scripts\enrich_products.py --report scripts\report.csv
if errorlevel 1 echo [ERROR] The script failed. Copy the text above and send it to me.
echo.
echo Done. Check changes in GitHub Desktop or with git diff, then commit and push.
pause
goto menu

:one
echo.
echo Example: girls\snow-white-dress.md   or just   snow-white-dress.md
set "P="
set /p P=Product file: 
if "%P%"=="" goto menu
set "P=%P:\=/%"
%PY% scripts\enrich_products.py --only "%P%" --dry-run
if errorlevel 1 echo [ERROR] The script failed. Copy the text above and send it to me.
echo.
set "OK="
set /p OK=Apply to this product? Type y to apply: 
if /i not "%OK%"=="y" goto menu
%PY% scripts\enrich_products.py --only "%P%"
echo.
echo Done.
pause
goto menu

:one_force
echo.
echo FORCE rebuilds title, tags, description and the AUTO block of ONE product
echo and discards your manual edits in those parts. Text outside the AUTO block stays.
echo Example: girls\snow-white-dress.md
set "P="
set /p P=Product file: 
if "%P%"=="" goto menu
set "P=%P:\=/%"
set "OK="
set /p OK=Type y to force-rebuild this product: 
if /i not "%OK%"=="y" goto menu
%PY% scripts\enrich_products.py --only "%P%" --force
if errorlevel 1 echo [ERROR] The script failed. Copy the text above and send it to me.
echo.
echo Done.
pause
goto menu

:force_all
echo.
echo WARNING: this rebuilds title, tags, description and the AUTO block of EVERY product
echo and DISCARDS your manual edits in those parts. Text outside the AUTO block stays.
echo Make sure you have a git commit first.
set "OK="
set /p OK=Type FORCE to continue: 
if /i not "%OK%"=="FORCE" goto menu
%PY% scripts\enrich_products.py --force --report scripts\report.csv
if errorlevel 1 echo [ERROR] The script failed. Copy the text above and send it to me.
echo.
echo Done. Check changes in GitHub Desktop or with git diff, then commit and push.
pause
goto menu

:check
echo.
if not exist "scripts\check_products.py" (
  echo [ERROR] scripts\check_products.py not found. Copy the scripts folder from the newest zip.
  pause
  goto menu
)
echo Checking images, duplicates and links. Nothing will be changed.
%PY% scripts\check_products.py
if errorlevel 1 echo [ERROR] The script failed. Copy the text above and send it to me.
echo.
echo Report: scripts\check_report.md  and  scripts\check_report.csv
set "OK="
set /p OK=Open the report now? Type y: 
if /i "%OK%"=="y" start "" notepad "scripts\check_report.md"
pause
goto menu

:end
endlocal
