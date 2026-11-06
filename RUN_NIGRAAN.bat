@echo off
REM ============================================================================
REM  AI GEO NIGRAAN / MAch - local deployment launcher
REM
REM  v91.17.16 - SEC-06. This file did not exist. Three places named it as the
REM  operator entry point, including the error the server prints when it cannot
REM  find the provider key ("restart RUN_NIGRAAN.bat"), so the one instruction
REM  an operator got at the moment they were stuck pointed at nothing.
REM ============================================================================
setlocal
cd /d "%~dp0"

REM 11 Oct 2026 (AIGEO laptop): Node 22 is the per-user copy in %LOCALAPPDATA%\Programs\nodejs22 when it is not on PATH;
REM the lake scripts use the per-user Python 3.13. 12 Oct 2026: NIGRAAN stands alone in D:\NIGRAAN (no AGN_LAKE, no D:\DATA LAKE).
REM 12 Oct 2026: NIGRAAN's own Node and Python (D:\NIGRAAN\runtime) come first, so the folder runs on any PC
if exist "%~dp0..\..\runtime\nodejs22\node.exe" set "PATH=%~dp0..\..\runtime\nodejs22;%PATH%"
where node >nul 2>&1 || if exist "%LOCALAPPDATA%\Programs\nodejs22\node.exe" set "PATH=%LOCALAPPDATA%\Programs\nodejs22;%PATH%"
if exist "%~dp0..\..\runtime\python313\python.exe" set "NIGRAAN_PYTHON=%~dp0..\..\runtime\python313\python.exe"
if not defined NIGRAAN_PYTHON if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" set "NIGRAAN_PYTHON=%LOCALAPPDATA%\Programs\Python\Python313\python.exe"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Node.js was not found on PATH.
  echo   Install Node 22 or newer from https://nodejs.org and run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "mach.key" (
  if "%MACH_API_KEY%"=="" (
    echo.
    echo   No provider key.
    echo   Put the paid Open-Meteo key in a file called  mach.key  next to this
    echo   launcher, or set MACH_API_KEY in the environment. The free tier is
    echo   not used: with no key the dashboard runs and refuses weather calls.
    echo.
  )
)

if not exist "artefact\AI_GEO_NIGRAAN_v91_17_MACH.html" (
  echo   The artefact is missing from artefact\. This is not a complete install.
  pause
  exit /b 1
)

echo.
echo   Starting AI GEO NIGRAAN ...
echo   The dashboard opens at http://127.0.0.1:8787/
echo   Close this window to stop the server.
echo.

REM v91.17.42 - the local reasoning model, when Ollama is installed: its model store sits beside this deploy
REM (deploy\.ollama\models). The AI tab uses it only when ai.key says  provider=ollama  (see ai.key.example).
if exist "..\.ollama\models" set "OLLAMA_MODELS=%~dp0..\.ollama\models"
set "OLLAMA_EXE="
where ollama >nul 2>&1 && set "OLLAMA_EXE=ollama"
if "%OLLAMA_EXE%"=="" if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" set "OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
if "%OLLAMA_EXE%"=="" if exist "%ProgramFiles%\Ollama\ollama.exe" set "OLLAMA_EXE=%ProgramFiles%\Ollama\ollama.exe"
if exist "..\.ollama\models" (
  if "%OLLAMA_EXE%"=="" (
    echo   Ollama models are present in ..\.ollama but Ollama itself is not installed.
    echo   Install it from https://ollama.com/download (one installer, no other step^) and run this file again.
    echo   Until then the AI tab answers from retrieval only.
  ) else (
    tasklist /FI "IMAGENAME eq ollama.exe" 2>nul | find /I "ollama.exe" >nul || start "" /B "%OLLAMA_EXE%" serve
    echo   Local reasoning model: Ollama started on the deploy\.ollama store.
  )
)

start "" http://127.0.0.1:8787/
node server\server.mjs

echo.
echo   The server stopped.
pause
endlocal
