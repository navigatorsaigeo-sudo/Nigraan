@echo off
REM ============================================================================
REM  AI GEO NIGRAAN - run every routine learning job in one go  v91.17.76
REM
REM  Double-click. No typing, no questions. Runs, in order (or only the jobs listed in learn_only.txt):
REM    0 joinparts join_parts.py         -> archive\obs\<name>.parquet from <name>.partN.parquet (only when parts are present)
REM    1 rainprob  ens_wet_reliability.py  -> data\ens-wet-reliability.json  (needs the server running)
REM    2 retrain   retrain.py              -> data\mos-retrain.json (promotes data\mos-table.json only if it wins the hold-out)
REM    2b downscale downscale_retrain.py   -> data\downscale-retrain.json (the AI temperature correction, monthly: runs when the
REM                last run is 28+ days old; promotes data\downscale-model.json only if it wins on held-out stations;
REM                needs lightgbm, which SETUP_PYTHON.bat installs; without it the job logs why and exits cleanly)
REM    2c national national_retrain.py    -> data\national-retrain.json (the national temperature model, monthly; promotes
REM                data\national-model.json only if it is not worse on held-out stations; server must be running)
REM    3 rank      rank_models.py          -> data\model-ranking.json
REM    4 skill     model_skill.py          -> data\model-skill.json (after rank; the server reloads it)
REM    5 lakes     lake_monitor.py         -> data\glof-lakes-live.json (longest; Sentinel-2, no login)
REM  One job failing does not stop the others. Each job writes logs\learn_<job>.log;
REM  logs\LEARN_ALL.log holds the start, end and exit code of every job.
REM  Keys are read from the files beside this one and never printed.
REM  LEARN_ALL.bat unattended  (what the weekly scheduled task runs, see SCHEDULE_LEARN.bat): never waits for a key.
REM ============================================================================
setlocal
REM --- v91.17.171 - Python reads and writes files as UTF-8 (PEP 540). Without it Python on Windows reads text files as cp1252
REM     and a landslide-event name stopped the masks job (UnicodeDecodeError 0x81).
set "PYTHONUTF8=1"
cd /d "%~dp0"
set "UNATT="
if /i "%~1"=="unattended" set "UNATT=1"
if not exist logs mkdir logs
set "LAKE=..\station-lake"
set "SUM=logs\LEARN_ALL.log"
REM --- v91.17.255 (12 Oct 2026, B-3): one LEARN_ALL at a time. Two runs (one by hand, one by the weekly task) overlapped on 12 Oct
REM     and wrote the same files and this log. A second start now stops at once and says so. The log is no longer wiped at each
REM     start: runs are appended (separated by a start line); it is cut to the last 2000 lines when it grows past that.
powershell -NoProfile -Command "$n=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'cmd.exe' -and $_.CommandLine -match 'LEARN_ALL(\.next)?\.bat' }).Count; if ($n -gt 1) { exit 1 } else { exit 0 }"
if errorlevel 1 (
  echo [%DATE% %TIME%] NOT STARTED: another LEARN_ALL is already running >> "%SUM%"
  echo   Another LEARN_ALL is already running. This one stops.
  if not defined UNATT pause
  exit /b 2
)
if exist "%SUM%" powershell -NoProfile -Command "$f='%~dp0logs\LEARN_ALL.log'; $l=@(Get-Content -LiteralPath $f); if ($l.Count -gt 2000) { $l[-2000..-1] | Set-Content -LiteralPath $f -Encoding ASCII }"
echo.>> "%SUM%"
echo ==== LEARN_ALL start %DATE% %TIME% ==== >> "%SUM%"

REM --- the real Python, not the Microsoft Store stub that sits first on PATH ---
set "PY="
if exist "%LOCALAPPDATA%\Python\bin\python.exe" set "PY=%LOCALAPPDATA%\Python\bin\python.exe"
if "%PY%"=="" for /f "delims=" %%p in ('py -3 -c "import sys;print(sys.executable)" 2^>nul') do set "PY=%%p"
if "%PY%"=="" set "PY=python"
REM 12 Oct 2026: NIGRAAN's own Python (runtime\python313 beside nig\) first, then NIGRAAN_PYTHON
if exist "%~dp0..\..\runtime\python313\python.exe" set "PY=%~dp0..\..\runtime\python313\python.exe"
if defined NIGRAAN_PYTHON if exist "%NIGRAAN_PYTHON%" set "PY=%NIGRAAN_PYTHON%"
echo python: "%PY%" >> "%SUM%"
"%PY%" -c "import numpy, pandas" >nul 2>&1
if errorlevel 1 (
  echo   numpy / pandas missing for "%PY%". Double-click SETUP_PYTHON.bat once, then run this again.
  echo ABORT numpy/pandas missing >> "%SUM%"
  if not defined UNATT pause
  exit /b 1
)
curl -s -o nul -w "%%{http_code}" http://127.0.0.1:8787/api/health > logs\_health.txt 2>nul
set /p HC=<logs\_health.txt
echo server health: %HC% >> "%SUM%"
REM --- optional: learn_only.txt beside this file lists the jobs to run (comma-separated, e.g. joinparts,rainprob); it is read once and removed
set "ONLY="
if exist "learn_only.txt" set /p ONLY=<learn_only.txt
if exist "learn_only.txt" del "learn_only.txt"
if defined ONLY echo only: %ONLY% >> "%SUM%"
REM --- the AI correction retrain is monthly: it skips itself when its last run is under 28 days old, unless learn_only.txt names it
set "DSF="
if defined ONLY set "DSF=--force"

REM --- a station-record file above the transfer limit arrives in parts; join them first (removes the parts only after a row-count check)
call :job joinparts "%LAKE%\scripts\join_parts.py"
call :job rainprob "%LAKE%\scripts\ens_wet_reliability.py" --app . --base http://127.0.0.1:8787
call :job retrain  "%LAKE%\scripts\retrain.py" --app . --lake "%LAKE%" --key mach.key
call :job downscale "%LAKE%\scripts\downscale_retrain.py" --app . --lake "%LAKE%" %DSF%
REM --- v91.17.91 - the national temperature model, monthly (28+ days since its last run), champion vs challenger; needs the server running
call :job national "%LAKE%\scripts\national_retrain.py" --app . --lake "%LAKE%" %DSF%
call :job rank     "%LAKE%\scripts\rank_models.py" --stations all --workers 3 --key mach.key
call :job skill    "%LAKE%\scripts\model_skill.py" --app . --key mach.key
curl -s -X PUT http://127.0.0.1:8787/api/pool/skill >nul 2>&1
call :job masks    "scripts\build_applicability.py" --app .
REM --- v91.17.78 - ERA5-Land soil water and snow, rolling 60 days (Copernicus CDS; key: cds.key beside this file, never printed)
set "CDSAPI_RC=%~dp0cds.key"
call :job era5land "scripts\era5land.py" --app . --recent
REM --- v91.17.93 - the river outlook and the snow panel from the newest drop-folder data; free collectors (job 1):
REM     NOAA GHCN-Daily / GSOD (open, no login); NASA SWOT river heights and OPERA surface water (Earthdata token in
REM     earthdata.key beside this file, never printed; no password)
call :job riveroutlook "%LAKE%\scripts\river_outlook.py" --app .
call :job snow     "%LAKE%\scripts\snow_status.py" --app .
REM --- v91.17.255 (B-3): suparco and chirps fetch over the network and failed on 12 Oct (timeouts); up to 3 tries, 2 minutes apart
call :jobr suparco  "%LAKE%\scripts\suparco_lakes.py" --app .
rem v91.17.100 - drought rain: CHIRPS v3 pentads (new ones added, prelim replaced by final), then the SPI/SPEI table
call :jobr chirps   "%LAKE%\scripts\chirps_update.py" --app .
call :job droughtchirps "%LAKE%\scripts\drought_chirps.py" --app . --base http://127.0.0.1:8787
REM --- v91.17.176 - the Drought layer's 15-day outlook (CHIRPS3-GEFS, shown only while its replay test passes) and water-supply
REM     status (river flow against 1991-2020 at the IRSA gauges; same Copernicus key as ERA5-Land, never printed)
call :job droughtoutlook "%LAKE%\scripts\drought_outlook.py" --app .
call :job droughtwater "%LAKE%\scripts\drought_water.py" --app .
call :job verify   "%LAKE%\scripts\verify_issued.py" --app . --out "%LAKE%\reports"
call :job registry "%LAKE%\scripts\model_registry.py" --app .
call :job vhi      "%LAKE%\scripts\vhi_fetch.py" --app . --weeks 4
call :job rainqm   "%LAKE%\scripts\rain_qm_north.py" --app .
call :job noaa     "%LAKE%\scripts\noaa_collect.py" --ghcn --from 2005
call :job swot     "%LAKE%\scripts\swot_collect.py" --app . --days 60
call :job opera    "%LAKE%\scripts\opera_collect.py" --app . --days 30
call :job forward  "%LAKE%\scripts\forward_test.py" --app .
REM --- v91.17.165 - the glacial-lake satellite read (about 1,900 lakes, the longest job) runs last, so the daily jobs above
REM     never wait for it; it resumes from its checkpoint if it is stopped the same day
call :job lakes    "%LAKE%\scripts\lake_monitor.py" --app . --only all --workers 6
REM --- v91.17.171 - lake_register_merge.py is a build step, not a routine job: it needs the HydroBASINS level-12 basins and the
REM     90 m terrain that are not on this computer (it always stopped here). The merged register ships with each release.

echo ==== LEARN_ALL end %DATE% %TIME% ==== >> "%SUM%"
echo.
type "%SUM%"
echo.
echo   Done. If "retrain" says it PROMOTED a table, restart the server (RUN_NIGRAAN.bat).
echo   Everything else is re-read by the running server (a promoted AI correction model too).
endlocal
exit /b 0

:jobr
REM v91.17.255 - :job with up to 3 tries (network jobs); the same skip rule (learn_only.txt) and the same log lines
set "JR=%~1"
set "TRY=1"
:jobr_again
call :job %*
if "%RC%"=="0" exit /b 0
if "%RC%"=="" exit /b 0
if %TRY% GEQ 3 exit /b 0
set /a TRY+=1
echo [%DATE% %TIME%] retry %JR% (try %TRY% of 3) in 120 s >> "%SUM%"
timeout /t 120 /nobreak >nul
goto jobr_again

:job
set "RC="
set "J=%~1"
shift
if defined ONLY (
  echo ,%ONLY%, | findstr /i /c:",%J%," >nul
  if errorlevel 1 ( echo [%DATE% %TIME%] skip  %J% >> "%SUM%" & exit /b 0 )
)
echo.
echo   ---- %J% ----
echo [%DATE% %TIME%] start %J% >> "%SUM%"
"%PY%" %1 %2 %3 %4 %5 %6 %7 %8 %9 > "logs\learn_%J%.log" 2>&1
set "RC=%ERRORLEVEL%"
echo [%DATE% %TIME%] end   %J% exit=%RC% >> "%SUM%"
if not "%RC%"=="0" echo   %J% failed (exit %RC%): see logs\learn_%J%.log
exit /b 0
