@echo off
rem v91.17.283.4 item 1: build data\basemap\pk-buildings.pmtiles (Overture Maps building footprints for Pakistan) on this computer.
rem Run once, from any folder. Needs Python 3.10 or later and the internet for the download (a few GB from the public Overture bucket).
rem The work folder holds the downloaded rows; it can be deleted after a good build. The server picks the new file up within a minute.
setlocal
set HERE=%~dp0
set ROOT=%HERE%..\..
cd /d "%ROOT%"
where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found on PATH. Install Python 3.10 or later and run this again.
  exit /b 1
)
python -c "import duckdb, shapely, pyarrow, numpy" >nul 2>nul
if errorlevel 1 (
  echo Installing the Python packages the build needs: duckdb shapely pyarrow numpy
  python -m pip install --user duckdb shapely pyarrow numpy
  if errorlevel 1 exit /b 1
)
python scripts\gen\overture_buildings.py --work "%ROOT%\data\basemap\pk-buildings.work" %*
if errorlevel 1 (
  echo The build stopped. data\basemap\pk-buildings.pmtiles was not replaced.
  exit /b 1
)
echo Done. Open the street map and zoom to 15 or closer to see the buildings.
endlocal
