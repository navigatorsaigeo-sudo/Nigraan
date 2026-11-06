@echo off
REM ============================================================================
REM  NIGRAAN - the geo job (v91.17.61). Double-click. Same work as LEARN_NIGRAAN.bat geo,
REM  written as one flat file (no ( ) blocks, no goto) so it cannot fall over cmd's
REM  block-expansion or label-search rules. Needs python on PATH with pandas, numpy,
REM  scipy, pyarrow, shapely, geopandas. The last step needs the server running.
REM ============================================================================
cd /d "%~dp0"
if not exist logs mkdir logs
echo ==== %DATE% %TIME% ==== > "logs\LEARN_GEO.log"
set "LAKE=..\station-lake"
set "DATA=%~1"
if "%DATA%"=="" set "DATA=%~dp0..\..\inputs\Data_9_23"
echo.
echo   NIGRAAN geo job
echo   app  : %CD%
echo   lake : %LAKE%
echo   data : %DATA%
echo.
if not exist "%LAKE%\scripts\cn_grid.py" echo   ERROR: %LAKE%\scripts\cn_grid.py not found. The station lake is not beside this folder.
if not exist "%LAKE%\scripts\cn_grid.py" pause
if not exist "%LAKE%\scripts\cn_grid.py" exit /b 1
if not exist "%DATA%\CN_Pakistan_2025_GeoParquet" echo   ERROR: %DATA%\CN_Pakistan_2025_GeoParquet not found. Run:  LEARN_GEO.bat D:\NIGRAAN\inputs\Data_9_23
if not exist "%DATA%\CN_Pakistan_2025_GeoParquet" pause
if not exist "%DATA%\CN_Pakistan_2025_GeoParquet" exit /b 1
REM --- pick the real Python, not the Microsoft Store stub that sits first on PATH (path has a space: always quoted) ---
set "PY="
if exist "%LOCALAPPDATA%\Python\bin\python.exe" set "PY=%LOCALAPPDATA%\Python\bin\python.exe"
if "%PY%"=="" for /f "delims=" %%p in ('py -3 -c "import sys;print(sys.executable)" 2^>nul') do set "PY=%%p"
if "%PY%"=="" set "PY=python"
REM 12 Oct 2026: NIGRAAN's own Python (runtime\python313 beside nig\) first, then NIGRAAN_PYTHON
if exist "%~dp0..\..\runtime\python313\python.exe" set "PY=%~dp0..\..\runtime\python313\python.exe"
if defined NIGRAAN_PYTHON if exist "%NIGRAAN_PYTHON%" set "PY=%NIGRAAN_PYTHON%"
echo   python: "%PY%"
"%PY%" -c "import numpy, pandas" >nul 2>&1
set "PKGOK=%ERRORLEVEL%"
if not "%PKGOK%"=="0" echo   ERROR: numpy / pandas are not installed for "%PY%". Double-click SETUP_PYTHON.bat once, then run this again.
if not "%PKGOK%"=="0" pause
if not "%PKGOK%"=="0" exit /b 1
echo   [1/5] unpacking the 131 reduced CN tiles (once)
if not exist "%LAKE%\archive\cn\tiles\31_74.parquet" powershell -NoProfile -Command "Expand-Archive -Force '%LAKE%\archive\cn\cn_tiles_part1.zip' '%LAKE%\archive\cn\tiles'; Expand-Archive -Force '%LAKE%\archive\cn\cn_tiles_part2.zip' '%LAKE%\archive\cn\tiles'"
echo   [2/5] CN per tehsil from the 10 m grid (tiles already reduced: only the finish pass runs)
"%PY%" "%LAKE%\scripts\cn_grid.py" --src "%DATA%\CN_Pakistan_2025_GeoParquet\CN_Pakistan_2025_GeoParquet\CN_Pakistan_2025_parquet" --app . >> "logs\LEARN_GEO.log" 2>&1
REM v91.17.70: cn_grid.py now writes to the archive only (ESRI built class inflated); the served CN comes from cn.py (WorldCover 10 m + Open Buildings)
"%PY%" "%LAKE%\scripts\cn.py" --app . >> "logs\LEARN_GEO.log" 2>&1
echo   [3/5] catchment tree
"%PY%" "%LAKE%\scripts\catchments.py" --src "%DATA%\catchment\catchment" --app . >> "logs\LEARN_GEO.log" 2>&1
echo   [4/5] the six live MACH sheets: not run, the sheets are no longer written
REM 13 Oct 2026 - audit: the MACH Google Sheets are no longer written (fleet.mjs reads the MACH database), so the pull is not run - was: "%PY%" "%LAKE%\scripts\mach_sheets_pull.py"
echo   [5/5] the flood back-test (needs the server: RUN_NIGRAAN.bat)
"%PY%" "%LAKE%\scripts\cn_backtest.py" --app . --geo data\pk-tehsils.json >> "logs\LEARN_GEO.log" 2>&1
echo.
type "logs\LEARN_GEO.log"
echo   Done. Restart the server (RUN_NIGRAAN.bat) so it reloads data\cn-tehsil.json, catchments.json and cn-backtest.json.
pause
