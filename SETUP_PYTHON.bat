@echo off
REM  NIGRAAN - install the Python packages the lake scripts need (once). Double-click.
REM  Uses the real Python install, not the Microsoft Store stub that sits first on PATH. The path has a space, so it is always quoted.
cd /d "%~dp0"
if not exist logs mkdir logs
echo ==== %DATE% %TIME% ==== > "logs\SETUP_PYTHON.log"
set "PY="
if exist "%LOCALAPPDATA%\Python\bin\python.exe" set "PY=%LOCALAPPDATA%\Python\bin\python.exe"
if "%PY%"=="" for /f "delims=" %%p in ('py -3 -c "import sys;print(sys.executable)" 2^>nul') do set "PY=%%p"
if "%PY%"=="" set "PY=python"
REM 12 Oct 2026: NIGRAAN's own Python (runtime\python313 beside nig\) first, then NIGRAAN_PYTHON
if exist "%~dp0..\..\runtime\python313\python.exe" set "PY=%~dp0..\..\runtime\python313\python.exe"
if defined NIGRAAN_PYTHON if exist "%NIGRAAN_PYTHON%" set "PY=%NIGRAAN_PYTHON%"
echo   python: "%PY%"
"%PY%" --version
echo   installing packages - this takes a few minutes; progress is written to logs\SETUP_PYTHON.log ...
"%PY%" -m pip install --upgrade pip >> "logs\SETUP_PYTHON.log" 2>&1
"%PY%" -m pip install numpy pandas scipy pyarrow shapely geopandas lightgbm scikit-learn rasterio openpyxl cdsapi netCDF4 >> "logs\SETUP_PYTHON.log" 2>&1
echo.
"%PY%" -c "import numpy, pandas, scipy, pyarrow, shapely, geopandas, lightgbm; print('   all packages import: OK')"
if errorlevel 1 echo   ERROR: something did not install. The last lines of the log:
if errorlevel 1 powershell -NoProfile -Command "Get-Content 'logs\SETUP_PYTHON.log' -Tail 25"
echo.
echo   Done. Now double-click LEARN_GEO.bat and LEARN_SKILL.bat.
pause
