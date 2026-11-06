@echo off
REM v91.17.253 (12 Oct 2026, AIGEO laptop): rebuilds the colour street map data\basemap\pk-streets.pmtiles, which was not in the
REM drive-failure restore. Source: Protomaps daily basemap build (OpenStreetMap, ODbL), Pakistan box, about 1.4 GB download.
REM The server picks the map up by itself within a minute. Log: logs\extract_streets.log
cd /d "%~dp0"
where node >NUL 2>&1 || if exist "%LOCALAPPDATA%\Programs\nodejs22\node.exe" set "PATH=%LOCALAPPDATA%\Programs\nodejs22;%PATH%"
if not exist logs mkdir logs
powershell -NoProfile -Command "node scripts\gen\extract_streets.mjs 2>&1 | Tee-Object -FilePath logs\extract_streets.log"
echo.
pause
