@echo off
REM  NIGRAAN - rebuild the model-skill registry (v91.17.61). Double-click. Flat file, no goto.
cd /d "%~dp0"
if not exist logs mkdir logs
echo ==== %DATE% %TIME% ==== > "logs\LEARN_SKILL.log"
set "LAKE=..\station-lake"
echo.
echo   NIGRAAN model-skill registry
if not exist "%LAKE%\scripts\model_skill.py" echo   ERROR: %LAKE%\scripts\model_skill.py not found.
if not exist "%LAKE%\scripts\model_skill.py" pause
if not exist "%LAKE%\scripts\model_skill.py" exit /b 1
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
"%PY%" "%LAKE%\scripts\model_skill.py" --app . --key mach.key >> "logs\LEARN_SKILL.log" 2>&1
curl -s -X PUT http://127.0.0.1:8787/api/pool/skill
echo.
type "logs\LEARN_SKILL.log"
echo   Done. data\model-skill.json written; the running server reloaded it (or will at the next start).
pause
