@echo off
REM  NIGRAAN - the two independent cross-checks (v91.17.64). Double-click. Flat file, no goto.
REM   (1) glof_events.py    HMAGLOFDB outburst catalogue -> data\glof-events.json          (no key; fetches the CSV once)
REM   (2) giri_landslide.py GIRI / UNEP-GRID landslide susceptibility -> data\giri-landslide-tehsil.json (no key; WCS tiles cached)
cd /d "%~dp0"
if not exist logs mkdir logs
echo ==== %DATE% %TIME% ==== > "logs\LEARN_CROSSCHECK.log"
set "LAKE=..\station-lake"
echo.
echo   NIGRAAN cross-checks: GLOF catalogue + GIRI susceptibility
if not exist "%LAKE%\scripts\giri_landslide.py" echo   ERROR: %LAKE%\scripts\giri_landslide.py not found.
if not exist "%LAKE%\scripts\giri_landslide.py" pause
if not exist "%LAKE%\scripts\giri_landslide.py" exit /b 1
REM --- pick the real Python, not the Microsoft Store stub that sits first on PATH (path has a space: always quoted) ---
set "PY="
if exist "%LOCALAPPDATA%\Python\bin\python.exe" set "PY=%LOCALAPPDATA%\Python\bin\python.exe"
if "%PY%"=="" for /f "delims=" %%p in ('py -3 -c "import sys;print(sys.executable)" 2^>nul') do set "PY=%%p"
if "%PY%"=="" set "PY=python"
REM 12 Oct 2026: NIGRAAN's own Python (runtime\python313 beside nig\) first, then NIGRAAN_PYTHON
if exist "%~dp0..\..\runtime\python313\python.exe" set "PY=%~dp0..\..\runtime\python313\python.exe"
if defined NIGRAAN_PYTHON if exist "%NIGRAAN_PYTHON%" set "PY=%NIGRAAN_PYTHON%"
echo   python: "%PY%"
"%PY%" -c "import numpy, pandas, shapely" >nul 2>&1
set "PKGOK=%ERRORLEVEL%"
if not "%PKGOK%"=="0" echo   ERROR: numpy / pandas / shapely are not installed for "%PY%". Double-click SETUP_PYTHON.bat once, then run this again.
if not "%PKGOK%"=="0" pause
if not "%PKGOK%"=="0" exit /b 1
"%PY%" -c "import rasterio" >nul 2>&1
set "RIO=%ERRORLEVEL%"
if not "%RIO%"=="0" echo   installing rasterio (needed once for the GIRI tiles; 31 MB, retried on a dropped connection)...
if not "%RIO%"=="0" "%PY%" -m pip install --retries 10 --timeout 90 rasterio >> "logs\LEARN_CROSSCHECK.log" 2>&1
"%PY%" -c "import rasterio" >nul 2>&1
set "RIO=%ERRORLEVEL%"
if not "%RIO%"=="0" echo   rasterio still not installed (the download did not complete). The GLOF step runs; the GIRI step is skipped this time - run LEARN_CROSSCHECK.bat again when the connection is steady.
echo   [1/2] GLOF catalogue
"%PY%" "%LAKE%\scripts\glof_events.py" --app . >> "logs\LEARN_CROSSCHECK.log" 2>&1
echo   [2/2] GIRI susceptibility (first run pulls 40 tiles, about 70 MB)
if "%RIO%"=="0" "%PY%" "%LAKE%\scripts\giri_landslide.py" --app . >> "logs\LEARN_CROSSCHECK.log" 2>&1
if not "%RIO%"=="0" echo   (skipped: rasterio missing)
echo.
findstr /C:"HMAGLOFDB" /C:"GIRI (NGI)" /C:"Traceback" /C:"Error" "logs\LEARN_CROSSCHECK.log"
echo   Done. data\glof-events.json and data\giri-landslide-tehsil.json written; restart RUN_NIGRAAN.bat to serve them. Full log in logs\LEARN_CROSSCHECK.log.
pause
