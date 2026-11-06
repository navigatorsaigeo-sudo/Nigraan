@echo off
rem v91.17.283.2 - one ECMWF 0.1 deg fetch by hand (the NIGRAAN server does the same every 30 minutes on its own).
rem v91.17.283.15: from the Google Cloud mirror of the ECMWF open data, newest 00/12 UTC runs not yet held, steps 0-96 h,
rem only the fields NIGRAAN reads, by parallel byte ranges,
rem crops them to Pakistan and writes data\ecmwf010\. Resumable: if it stops, run it again and it continues.
cd /d "D:\NIGRAAN\nig\nigraan-local"
set "PYEXE=py -3"
if exist "%LOCALAPPDATA%\Python\bin\python.exe" set "PYEXE=%LOCALAPPDATA%\Python\bin\python.exe"
if not "%NIGRAAN_PYTHON%"=="" set "PYEXE=%NIGRAAN_PYTHON%"
%PYEXE% scripts\ecmwf\ingest_ecmwf010.py --app "D:\NIGRAAN\nig\nigraan-local"
if errorlevel 1 echo Some steps failed: run this file again, it continues where it stopped.
echo Status: D:\NIGRAAN\nig\nigraan-local\data\ecmwf010-status.json
pause
