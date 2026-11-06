@echo off
REM ============================================================================
REM  AI GEO NIGRAAN / MAch - learning jobs (v91.17.36)
REM
REM  Two jobs that learn from the PMD station record. Both run outside the
REM  server (Python, in the station lake beside this folder) and leave a file
REM  in data\ that the operations page reads:
REM
REM    retrain   station-lake\scripts\retrain.py  -> data\mos-retrain.json
REM              refits the mountain temperature correction from the station
REM              lake and promotes it ONLY when it beats the serving table on
REM              a 60-day hold-out (champion vs challenger). data\mos-table.json
REM              is replaced on promotion; the previous table is kept beside it.
REM    downscale station-lake\scripts\downscale_retrain.py -> data\downscale-retrain.json (v91.17.76; the AI temperature
REM              correction, champion vs challenger on held-out stations; promotes data\downscale-model.json only if it wins,
REM              the previous model kept beside it; LEARN_ALL runs it monthly, this runs it now; needs lightgbm)
REM    rank      station-lake\scripts\rank_models.py -> data\model-ranking.json
REM              scores the provider's eleven models against the stations.
REM              /api/skill?parameter=model_ranking re-reads it on request.
REM
REM    lakes     station-lake\scripts\lake_monitor.py -> data\glof-lakes-live.json
REM    rainprob  station-lake\scripts\ens_wet_reliability.py -> data\ens-wet-reliability.json (the server must be running: the key stays in it)
REM    rainfix   rebuild Rain_Increment with the outage-gap rule, then the storm-end intensity scale
REM              measures every PMD 2024 lake on the latest clear Sentinel-2
REM              scenes (no login) and flags surge-type glaciers from RGI 7.0.
REM              Run monthly, June to October. Needs ..\glof\pmd (PMD inventory)
REM              and ..\glof\rgi\rgi70_pakistan_box.csv beside the lake.
REM
REM    terrain   glof_terrain.py -> data\glof-terrain.json (DEM factors, once)
REM    settle    settlement_elevation.py -> data\settlement-elevation.json (once; needs ..\geo)
REM    lapse     lapse.py -> data\lapse-table.json (with each retrain)
REM    lapsedyn  lapse_dynamic.py -> data\lapse-dynamic.json (the pressure-level lapse test; measured, not adopted)
REM    climbias  clim_bias.py -> data\climatology-bias.json (with each retrain)
REM    canopy    urban_canopy.py -> data\urban-tree.f16 (once; slow, online)
REM    buildings buildings.py -> data\urban-buildings.f16, buildings-tehsil.json (once; 6 GB stream)
REM    hand      hand.py -> data\hand-tehsil.json (once; needs ..\geo\dem90 and pysheds; run with python -P)
REM    met       met_corrections.py -> data\met-corrections.json (gusts, dew point, rain days, freezing level against the PMD lake; no key)
REM    levels    level_anomaly.py -> data\level-anomaly.json (surge / drainage candidates on the PMD gauges; no key)
REM    places    place_index.py -> data\pk-places.tsv.gz (the local place index from the GeoNames Pakistan dump; fetched once)
REM    landcover landcover.py -> data\landcover-tehsil.json (ESA WorldCover 2021 class shares, read from the public tiles; no key)
REM    fleetcmp  mach_fleet_compare.py [--snapshot f --time t] -> station-lake\reports\mach_fleet_compare_<date>.md (our MACH fleet vs the forecast, after the five-rule screen)
REM    pmdews    pmd_ews_compare.py [--snapshot f --time t]   -> station-lake\reports\pmd_ews_compare_<date>.md (a PMD-EWS snapshot CSV vs the forecast)
REM    synop     isd_pull.py + metar_pull.py + isd_compare.py (both) + train_plains.py -> data\mos-table.json isd_stations block
REM              (the synop / airport hourly correction outside the GB box; free sources, no login; server must be running; then restart it)
REM    ml        train_ml.py -> data\ml-mos.json (the learned correction; LightGBM; re-judged per zone every run; needs pip install lightgbm;
REM              the running server reloads it through PUT /api/mos/learned, no restart)
REM    floodcal  flood_extent_calibration.py -> data\flood-extent-calibration.json (HAND and TWI against the UNOSAT 2022/2010 extents; fetches the 295 MB shapefile pack once; after hand)
REM    sponge    sponge.py -> data\sponge-tehsil.json (static sponge capacity; after hand) and soil_model_range.py -> data\soil-model-range.json (yearly)
REM    lithology lithology.py -> data\lithology-tehsil.json (once; needs ..\landslide\litho_c_250m.tif from Zenodo 1464846)
REM    geo       cn_grid.py + catchments.py + mach_sheets_pull.py + cn_backtest.py (v91.17.60; the client datasets in D:\Data_9_23:
REM              the 10 m CN GeoParquet (17 GB, 1-3 h, row group by row group), the catchment tree, the six live MACH sheets, then
REM              the multi-event back-test against the server; LEARN_NIGRAAN.bat geo [<data folder>])
REM    skill     model_skill.py -> data\model-skill.json (v91.17.61; the model-skill registry the pool reads; after rank)
REM    machsheets mach_sheets_pull.py alone (the six public MACH 5-10 sheets, Apr 2026 onward; no key)
REM    glofevents glof_events.py -> data\glof-events.json (the HMAGLOFDB outburst catalogue joined to the register; no key; v91.17.64)
REM    giri      giri_landslide.py -> data\giri-landslide-tehsil.json (GIRI / UNEP-GRID landslide susceptibility per tehsil via WCS; no key; v91.17.64)
REM    fleet     LEARN_FLEET.bat: the MACH fleet history (36 WU stations 2023-2026 + the live sheets) positioned, paired with
REM              the forecast and scored -> data\fleet-history-skill.json (v91.17.63; needs mach.key; LEARN_NIGRAAN.bat fleet [<export root>])
REM    landslide landslide_backtest.py -> data\landslide-calibration.json (needs ..\landslide\glc.csv, the NASA catalogue, and mach.key)
REM
REM  Usage:  LEARN_NIGRAAN.bat retrain [<new station export folder>]
REM          LEARN_NIGRAAN.bat rank
REM          LEARN_NIGRAAN.bat lakes [pdgl|all]
REM          LEARN_NIGRAAN.bat terrain | settle | lapse | canopy | buildings | hand | lithology | landslide
REM
REM  Needs: python3 with pandas, numpy, scipy, scikit-learn, pyarrow; the
REM  station lake at ..\station-lake (archive\ and reports\ present); mach.key
REM  in this folder (read by the fetch stage, never printed). Run monthly, or
REM  when a new station export arrives. Restart the server afterwards so it
REM  reloads data\mos-table.json.
REM ============================================================================
setlocal
cd /d "%~dp0"
set LAKE=..\station-lake
if not exist "%LAKE%\scripts\retrain.py" (
  echo   The station lake was not found at %LAKE%. Nothing to learn from.
  pause
  exit /b 1
)
REM 12 Oct 2026: NIGRAAN's own Python first
if exist "%~dp0..\..\runtime\python313\python.exe" set "PATH=%~dp0..\..\runtime\python313;%~dp0..\..\runtime\python313\Scripts;%PATH%"
where python >nul 2>&1
if errorlevel 1 (
  echo   Python was not found on PATH.
  pause
  exit /b 1
)
if "%1"=="" (
  echo   Usage: LEARN_NIGRAAN.bat ^<job^>   (double-clicking runs no job)
  echo   Jobs: downscale  national  geo  skill  fleet  masks  glofevents  giri  ml  synop  retrain  rank  lakes  floodcal  met  levels  places  landcover  sponge  lithology  landslide  rainprob  rainfix
  echo         terrain  settle  lapse  lapsedyn  climbias  canopy  buildings  hand  fleetcmp  pmdews  machsheets
  echo   Double-click LEARN_GEO.bat, LEARN_SKILL.bat, LEARN_FLEET.bat or LEARN_CROSSCHECK.bat to run those without typing.
  pause
  exit /b 0
)
if "%1"=="rank" (
  python "%LAKE%\scripts\rank_models.py" --stations all --workers 3 --key mach.key
  goto done
)
if "%1"=="lakes" (
  if "%2"=="" (
    python "%LAKE%\scripts\lake_monitor.py" --app . --only all --workers 6
  ) else (
    python "%LAKE%\scripts\lake_monitor.py" --app . --only %2 --workers 6
  )
  REM v91.17.71: merged lake register, then the map applicability masks - no lake upstream means no GLOF colour
  python "%LAKE%\scripts\lake_register_merge.py" --app .
  python scripts\build_applicability.py --app .
  goto done
)
if "%1"=="masks" (
  python "%LAKE%\scripts\lake_register_merge.py" --app .
  python scripts\build_applicability.py --app .
  goto done
)
if "%1"=="terrain" ( python "%LAKE%\scripts\glof_terrain.py" --app . & goto done )
if "%1"=="settle" ( python "%LAKE%\scripts\settlement_elevation.py" --app . & goto done )
if "%1"=="climbias" ( python "%LAKE%\scripts\clim_bias.py" --app . & goto done )
if "%1"=="lapse" ( python "%LAKE%\scripts\lapse.py" --app . --key mach.key & goto done )
if "%1"=="lapsedyn" ( python "%LAKE%\scripts\lapse_dynamic.py" --app . --key mach.key & goto done )
if "%1"=="canopy" ( python "%LAKE%\scripts\urban_canopy.py" --app . & goto done )
if "%1"=="buildings" ( python "%LAKE%\scripts\buildings.py" --app . & goto done )
if "%1"=="hand" ( python -P "%LAKE%\scripts\hand.py" --app . & goto done )
if "%1"=="met" ( python "%LAKE%\scripts\met_corrections.py" --app . --archive "%LAKE%\archive" & goto done )
if "%1"=="levels" ( python "%LAKE%\scripts\level_anomaly.py" --app . --archive "%LAKE%\archive" & goto done )
if "%1"=="places" ( python "%LAKE%\scripts\place_index.py" --app . & goto done )
if "%1"=="landcover" ( python "%LAKE%\scripts\landcover.py" --app . & goto done )
if "%1"=="floodcal" ( python "%LAKE%\scripts\flood_extent_calibration.py" --app . & goto done )
if "%1"=="fleetcmp" ( python "%LAKE%\scripts\mach_fleet_compare.py" %2 %3 %4 %5 & goto done )
if "%1"=="pmdews" ( python "%LAKE%\scripts\pmd_ews_compare.py" %2 %3 %4 %5 & goto done )
if "%1"=="synop" (
  python "%LAKE%\scripts\isd_pull.py" --years 2025,2026
  python "%LAKE%\scripts\metar_pull.py"
  python "%LAKE%\scripts\isd_compare.py" --served
  python "%LAKE%\scripts\isd_compare.py" --source metar --served
  python "%LAKE%\scripts\train_plains.py"
  python "%LAKE%\scripts\merge_plains.py" --app .
  echo   Restart the server so it reloads data\mos-table.json.
  goto done
)
if "%1"=="ml" (
  python "%LAKE%\scripts\train_ml.py"
  copy /y "%LAKE%\archive\mos\ml_model.json" "data\ml-mos.json" >nul
  curl -s -X PUT http://127.0.0.1:8787/api/mos/learned >nul 2>&1
  echo   data\ml-mos.json replaced; the running server reloaded it (or will at the next start).
  goto done
)
if "%1"=="geo" ( call LEARN_GEO.bat %2 & exit /b )
if "%1"=="skill" ( call LEARN_SKILL.bat & exit /b )
if "%1"=="fleet" ( call LEARN_FLEET.bat %2 & exit /b )
if "%1"=="glofevents" ( call LEARN_CROSSCHECK.bat & exit /b )
if "%1"=="giri" ( call LEARN_CROSSCHECK.bat & exit /b )
if "%1"=="crosscheck" ( call LEARN_CROSSCHECK.bat & exit /b )
if "%1"=="machsheets" ( echo The MACH Google Sheets are no longer written - audit 13 Oct 2026 - fleet.mjs reads the MACH database. & goto done )
if "%1"=="downscale" ( python "%LAKE%\scripts\downscale_retrain.py" --app . --lake "%LAKE%" --force & goto done )
if "%1"=="national" ( python "%LAKE%\scripts\national_retrain.py" --app . --lake "%LAKE%" --force & goto done )
if "%1"=="rainprob" ( python "%LAKE%\scripts\ens_wet_reliability.py" --app . --base http://127.0.0.1:8787 & goto done )
if "%1"=="rainfix" ( python "%LAKE%\scripts\rain_increment_rebuild.py" & python "%LAKE%\scripts\rain_intensity_scale.py" --app . & goto done )
if "%1"=="sponge" ( python "%LAKE%\scripts\sponge.py" --app . & python "%LAKE%\scripts\soil_model_range.py" --app . --key mach.key & goto done )
if "%1"=="lithology" ( python -P "%LAKE%\scripts\lithology.py" --app . & goto done )
if "%1"=="landslide" ( python "%LAKE%\scripts\landslide_backtest.py" --app . --key mach.key & python "%LAKE%\scripts\rain_intensity_scale.py" --app . & goto done )
if "%1"=="retrain" (
  if "%2"=="" (
    python "%LAKE%\scripts\retrain.py" --app . --lake "%LAKE%" --key mach.key
  ) else (
    python "%LAKE%\scripts\retrain.py" --app . --lake "%LAKE%" --key mach.key --source "%~2"
  )
  goto done
)
echo   Usage: LEARN_NIGRAAN.bat retrain [export folder]  ^|  LEARN_NIGRAAN.bat rank  ^|  LEARN_NIGRAAN.bat lakes [pdgl^|all]  ^|  terrain ^| settle ^| lapse ^| climbias ^| canopy ^| buildings ^| hand ^| sponge ^| met ^| levels ^| places ^| landcover ^| floodcal ^| lithology ^| landslide ^| fleetcmp ^| pmdews ^| synop ^| ml
:done
echo.
echo   Done. Restart the server (RUN_NIGRAAN.bat) so it reloads any promoted table.
pause
endlocal
