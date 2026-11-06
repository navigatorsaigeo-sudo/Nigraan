@echo off
REM  NIGRAAN - the MACH fleet history against the forecast (v91.17.63). Double-click. Flat file, no goto.
REM  Steps: (1) ingest the WU exports from D:\External\External the first time (or relabel an existing ingest with the
REM  confirmed manifest), (2) positions + DEM elevation from the fleet station sheets, (3) the six live sheets,
REM  (4) pair everything with the forecast (paid key, cached under station-lake\archive\fleet\history\cache),
REM  (5) tell the running server to reload data\fleet-history-skill.json.
REM  Usage: LEARN_FLEET.bat [<WU export root, default D:\External\External>]
cd /d "%~dp0"
if not exist logs mkdir logs
echo ==== %DATE% %TIME% ==== > "logs\LEARN_FLEET.log"
set "LAKE=..\station-lake"
set "ROOTX=%~1"
if "%ROOTX%"=="" set "ROOTX=D:\External\External"
echo.
echo   NIGRAAN fleet history
if not exist "%LAKE%\scripts\mach_history_pair.py" echo   ERROR: %LAKE%\scripts\mach_history_pair.py not found.
if not exist "%LAKE%\scripts\mach_history_pair.py" pause
if not exist "%LAKE%\scripts\mach_history_pair.py" exit /b 1
REM --- pick the real Python, not the Microsoft Store stub that sits first on PATH (path has a space: always quoted) ---
set "PY="
if exist "%LOCALAPPDATA%\Python\bin\python.exe" set "PY=%LOCALAPPDATA%\Python\bin\python.exe"
if "%PY%"=="" for /f "delims=" %%p in ('py -3 -c "import sys;print(sys.executable)" 2^>nul') do set "PY=%%p"
if "%PY%"=="" set "PY=python"
REM 12 Oct 2026: NIGRAAN's own Python (runtime\python313 beside nig\) first, then NIGRAAN_PYTHON
if exist "%~dp0..\..\runtime\python313\python.exe" set "PY=%~dp0..\..\runtime\python313\python.exe"
if defined NIGRAAN_PYTHON if exist "%NIGRAAN_PYTHON%" set "PY=%NIGRAAN_PYTHON%"
echo   python: "%PY%"
"%PY%" -c "import numpy, pandas, pyarrow, openpyxl" >nul 2>&1
set "PKGOK=%ERRORLEVEL%"
if not "%PKGOK%"=="0" echo   ERROR: numpy / pandas / pyarrow / openpyxl are not installed for "%PY%". Double-click SETUP_PYTHON.bat once, then run this again.
if not "%PKGOK%"=="0" pause
if not "%PKGOK%"=="0" exit /b 1
echo   [1/5] history ingest
if exist "%LAKE%\archive\fleet\history\mach_history_hourly.parquet" "%PY%" "%LAKE%\scripts\mach_history_ingest.py" --remap-only >> "logs\LEARN_FLEET.log" 2>&1
if not exist "%LAKE%\archive\fleet\history\mach_history_hourly.parquet" "%PY%" "%LAKE%\scripts\mach_history_ingest.py" --root "%ROOTX%" >> "logs\LEARN_FLEET.log" 2>&1
echo   [2/5] positions and elevation
"%PY%" "%LAKE%\scripts\mach_history_coords.py" --key mach.key >> "logs\LEARN_FLEET.log" 2>&1
echo   [3/5] live sheets: not run, the MACH Google Sheets are no longer written
REM 13 Oct 2026 - audit: the MACH Google Sheets are no longer written (fleet.mjs reads the MACH database), so the pull is not run - was: "%PY%" "%LAKE%\scripts\mach_sheets_pull.py"
echo   [4/5] pairing with the forecast (first run fetches ~500 model chunks; later runs read the cache)
"%PY%" "%LAKE%\scripts\mach_history_pair.py" --app . --key mach.key --workers 4 >> "logs\LEARN_FLEET.log" 2>&1
echo   [5/5] server reload
curl -s -X PUT http://127.0.0.1:8787/api/fleet/history
echo.
findstr /C:"stations positioned" /C:"paired hours" /C:"Traceback" /C:"Error" "logs\LEARN_FLEET.log"
echo   Done. data\fleet-history-skill.json written; full log in logs\LEARN_FLEET.log.
pause
