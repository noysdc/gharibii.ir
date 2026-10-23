@echo off
setlocal
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"

if not exist "_products" (
  echo [ERROR] Folder _products not found. Put this file in the repo root, next to _products and scripts.
  pause
  exit /b 1
)
if not exist "scripts\enrich_products.py" (
  echo [ERROR] scripts\enrich_products.py not found.
  pause
  exit /b 1
)

set "PY="
where python >nul 2>&1 && set "PY=python"
if not defined PY (
  where py >nul 2>&1 && set "PY=py -3"
)
if not defined PY (
  echo [ERROR] Python is not installed. Install it from python.org and tick "Add Python to PATH".
  pause
  exit /b 1
)

%PY% -c "import yaml" >nul 2>&1
if errorlevel 1 (
  echo Installing pyyaml, one time only...
  %PY% -m pip install pyyaml
  if errorlevel 1 (
    echo [ERROR] Could not install pyyaml.
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
echo   5  Apply to ALL - FORCE (rebuild everything, discard ALL manual edits)
echo   6  Exit
echo ==============================================
echo   Your manual edits are kept automatically.
echo ==============================================
set "CH="
set /p CH=Choose 1-6: 

if "%CH%"=="1" goto preview_all
if "%CH%"=="2" goto apply_all
if "%CH%"=="3" goto one
if "%CH%"=="4" goto one_force
if "%CH%"=="5" goto force_all
if "%CH%"=="6" goto end
echo Invalid choice.
goto menu

:preview_all
%PY% scripts\enrich_products.py --dry-run --report scripts\report.csv
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
echo FORCE rebuilds the title, tags, description and AUTO block of ONE product
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
echo.
echo Done. Check changes in GitHub Desktop or with git diff, then commit and push.
pause
goto menu

:end
endlocal
