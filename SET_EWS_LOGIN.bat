@echo off
REM ============================================================================
REM  SET_EWS_LOGIN.bat - asks ONCE for the portal login of NIGRAAN's own EWS fetch
REM  (station-lake\scripts\ews_sync.py, the failover for LAMHA's sync).
REM  The username and the password are saved only in D:\NIGRAAN\secrets\ on this
REM  computer; the password is encrypted for this Windows user (Windows DPAPI) and
REM  is never shown or written in a log. Run it as the same Windows user that runs
REM  the NIGRAAN server. Run it again only if the portal password changes.
REM  The fetch stays idle while LAMHA supplies the data (data\ews-source.json).
REM ============================================================================
setlocal
set "PYTHONUTF8=1"
cd /d "%~dp0..\station-lake\scripts"
if not exist "ews_sync.py" (
  echo   ews_sync.py not found in "%CD%". Install the NIGRAAN package that carries it first.
  pause
  exit /b 1
)
REM --- the same Python the NIGRAAN server uses for its jobs (server\api\pyjobs.mjs): NIGRAAN_PYTHON, then
REM     %LOCALAPPDATA%\Python\bin\python.exe, then the py launcher
set "PY="
if defined NIGRAAN_PYTHON if exist "%NIGRAAN_PYTHON%" set "PY=%NIGRAAN_PYTHON%"
if not defined PY if exist "%LOCALAPPDATA%\Python\bin\python.exe" set "PY=%LOCALAPPDATA%\Python\bin\python.exe"
if not defined PY for /f "delims=" %%p in ('py -3 -c "import sys;print(sys.executable)" 2^>nul') do set "PY=%%p"
if not defined PY (
  echo   No Python found. Double-click SETUP_PYTHON.bat once, then run this again.
  pause
  exit /b 1
)
echo   Python: "%PY%"
"%PY%" ews_sync.py --setup
echo.
pause
