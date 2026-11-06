@echo off
rem v283 WS5 - landslide rain basis fetch (archive training basis + historical-forecast serving basis), resumable.
rem Writes only under D:\NIGRAAN\nig\nigraan-local\data\landslide-basis\ . The paid key is read by the script, never shown.
cd /d "D:\NIGRAAN\nig\nigraan-local"
python scripts\landslide_basis\fetch_landslide_basis.py --catalogue "D:\NIGRAAN\nig\station-lake\reports\landslide_events.csv" --pause 1.5
if errorlevel 1 echo Some requests failed: run this file again, it continues where it stopped.
echo Log: D:\NIGRAAN\nig\nigraan-local\data\landslide-basis\progress.log
pause
