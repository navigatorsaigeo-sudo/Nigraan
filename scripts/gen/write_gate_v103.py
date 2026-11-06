# one-off author script for data/model-gate.json (v91.17.103). The JSON it writes is the authoritative, hand-maintained file
# from now on; this script is kept for provenance only.
import json, datetime, os
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))   # v91.17.282.1 FIX2821 G: the tree root, not a fixed /home/claude path
EFF = "91.17.103"
E_ = []
def add(**k): k.setdefault("effective_from", EFF); E_.append(k)

add(id="rain-chance", name="Calibrated rain chance (rain day, 10 mm, 25 mm)", **{"class":"calibrated_model"}, version="rain-chance-91.17.101", status="operational",
    layers=["rain_hz","rc:1","rc:10","rc:25"],
    source="ensemble and deterministic forecast rain at the tehsil (ECMWF IFS/ENS, WeatherNext) as predictors; IMERG Final daily totals as the target",
    method="logistic regression on forecast rain features per cell (plains / mountain), isotonic recalibration; level from FORMULA_REGISTRY rainChance.levels",
    calibration="train 2024-05-16..2025-12-31, isotonic on the training years only",
    independent_test="blocked in time: 2026-01-01..2026-09-26 (station-lake/reports/rain_chance_model.json)",
    skill_metrics={"brierSkill_vs_climatology":{"1mm":{"plains":0.383,"mountain":0.275},"10mm":{"plains":0.275,"mountain":0.127},"25mm":{"plains":0.191,"mountain":0.104},"50mm":"withheld (skill ~0)"},"reliability":"tabled per decile in rain_chance_model.json"},
    operational_threshold="FORMULA_REGISTRY rainChance.levels (chance of >=1 / >=10 / >=25 mm per level)",
    dependencies=[], data_period="2024-05..2026-09", spatial_domain="Pakistan tehsils (576), plains and mountain cells", temporal_domain="daily totals, days 0-6",
    known_limitations=["target is satellite rain (IMERG), not gauges; light rain over mountains is under-detected by the satellite","skill falls steeply above 25 mm; 50 mm is withheld","one test season (2026)"],
    components=[{"fr":"rainChance.levels","role":"severity"}])

add(id="rain-hour-rungs", name="Model hourly rain intensity rungs", **{"class":"experimental"}, version="flood.rainAnchors", status="experimental", layers=[],
    source="forecast hourly precipitation", method="piecewise intensity ladder <2/2-7/7-20/>20 mm/h", calibration="none",
    independent_test="82 valley gauges 2026 (rain_rungs_split.json): POD 0.06 at 2 mm/h, FAR 0.92, no hit at 7 mm/h", skill_metrics={"pod_2mmh":0.06,"far_2mmh":0.92},
    operational_threshold="n/a", dependencies=[], data_period="2026", spatial_domain="tehsil", temporal_domain="hourly",
    known_limitations=["no point skill; kept only for the analyst's explicit forecast-hour view, flagged experimental"])

add(id="utci", name="UTCI thermal stress (shade)", **{"class":"published_standard"}, version="utci-broede-2012", status="operational", layers=["heat","telco_heat"],
    source="Bröde et al. 2012 (Int J Biometeorol 56:481) 6th-order operational polynomial, ported from pythermalcomfort 4.6 (MIT); stress classes Blazejczyk et al. 2013",
    method="UTCI from air temperature, humidity and 10 m wind at the hour of the day's highest UTCI, with mean radiant temperature = air temperature (shade)",
    calibration="n/a (published standard)", independent_test="n/a (published standard); port verified against pythermalcomfort reference values",
    skill_metrics="n/a", operational_threshold="published UTCI classes (26/32/38/46 °C heat stress bounds)",
    dependencies=["utci-agn-map","hourly-forecast"], data_period="n/a", spatial_domain="tehsil centroid at its own height", temporal_domain="hourly, days 0-3",
    known_limitations=["shade only: sun load (Tmrt) is not in the severity","wind is the 10 m model wind; calm reference wind used where none is held (an upper bound)",
                       "UTCI describes the physiological load of a reference person, not population heat-health outcomes","no local heat-health calibration in Pakistan"],
    components=[{"ref":"utci-agn-map","role":"severity"},
                {"fr":"heat.wetBulbLadder","role":"diagnostic"},{"fr":"heat.airStressSlope","role":"diagnostic"},{"fr":"heat.dryOnsetC","role":"diagnostic"},
                {"fr":"heat.drySlope","role":"diagnostic"},{"fr":"heat.humidPathWeights","role":"diagnostic"},{"fr":"heat.dryPathWeights","role":"diagnostic"},
                {"fr":"heat.feelsFloorFactor","role":"diagnostic"},{"fr":"heat.ehfSevereC2","role":"diagnostic"},{"fr":"heat.ehfScaleTo","role":"diagnostic"},
                {"fr":"heat.localThresholdFloorC","role":"diagnostic"}])

add(id="utci-agn-map", name="AGN level from UTCI (mapping)", **{"class":"convention"}, version="utci-agn-91.17.103", status="operational", layers=[],
    maps="UTCI in shade (°C)", label="AGN level: internal convention", source="data/utci.json agnMapping",
    method="piecewise-linear 9→0, 26→25, 32→45, 38→65, 46→82, 54→100: the published class bounds placed on the AGN band edges",
    dependencies=[], known_limitations=["a convention for colour and ranking, not a published threshold"])

add(id="sun-utci", name="UTCI in the sun (estimated)", **{"class":"experimental"}, version="tmrt-fanger-91.17.101", status="experimental", layers=[],
    source="forecast short-wave radiation, Fanger projected-area factor", method="Tmrt from global radiation and sun elevation, then UTCI",
    calibration="none", independent_test="none: needs globe-thermometer data", skill_metrics="none", operational_threshold="n/a",
    dependencies=[], known_limitations=["Tmrt not validated; long-wave field taken as air temperature","shown labelled Estimated; never controls severity"])

add(id="hourly-forecast", name="Hourly forecast at the tehsil", **{"class":"observation"}, version="forecast-feed", status="operational", layers=[],
    source="numerical weather prediction at the tehsil centroid", method="as delivered by the provider", known_limitations=["model grid ~9-11 km; height difference handled by the point engine where available"])

add(id="drought", name="Drought class (SPI / SPEI / root-zone soil)", **{"class":"published_standard"}, version="drought-91.17.100", status="operational", layers=["drought"],
    source="SPI (McKee et al. 1993; WMO-No. 1090) and SPEI (Vicente-Serrano 2010) from CHIRPS / ERA5 rain and evaporation, gamma / log-logistic fits 1991-2020",
    method="standardised indices classed on the published SPI categories; root-zone soil moisture as a second evidence line",
    calibration="distribution fits per tehsil 1991-2020 (a climatology, not a forecast)",
    independent_test="rain source tested at 25 stations 2001-2025 (drought_source_test.json): CHIRPS SPI-3 r 0.67, POD 0.41, FAR 0.45",
    skill_metrics={"spi3_r":0.67,"pod":0.41,"far":0.45,"csi":0.31}, operational_threshold="published SPI classes (-1.0 / -1.5 / -2.0)",
    dependencies=[], data_period="1991-2020 normal; monthly to date", spatial_domain="tehsil", temporal_domain="1-12 month accumulations",
    known_limitations=["CHIRPS blends GTS stations, so the GHCN check is partly circular","dry-month detection POD only 0.41"])

add(id="hyperlocal-temperature", name="Hyperlocal temperature (point engine)", **{"class":"calibrated_model"}, version="national-temperature", status="operational", layers=[],
    source="forecast temperature + AGN station residuals", method="LightGBM residual correction", calibration="2024-05-15..2026-09-26",
    independent_test="spatial blocks (0.5° cells, 5 folds) x alternate 14-day blocks, 191 stations", skill_metrics="national_eval.md (MAE by hour, day/night)",
    operational_threshold="n/a (a quantity, not a level)", dependencies=[], data_period="2024-05..2026-09", spatial_domain="points within the station network's height range",
    temporal_domain="hourly, days 0-3", known_limitations=["no canopy term: forested ridges read as open ground","stations used only within 150 m height"])

add(id="gauge-outlook", name="Gauge flow outlook (measured flow, 1-3 days)", **{"class":"calibrated_model"}, version="river-gauge-model", status="operational", layers=[],
    source="measured barrage / dam flows (team sheet)", method="gauge model of flow class 1-3 days ahead", calibration="2016-2026",
    independent_test="leave-one-monsoon-out over three monsoons (river_gauge_model.md)", skill_metrics={"class_exact_1d":0.92,"pod_medium_plus_1d":0.76},
    operational_threshold="official flow classes (Low / Medium / High / Very High / Exceptional)", dependencies=[], data_period="2016-2026",
    spatial_domain="gauged barrage / dam reaches", temporal_domain="days 1-3", known_limitations=["only where the team sheet is under 2 days old","gauged reaches only"])

add(id="river-ladder", name="Model river flow ladder (return periods)", **{"class":"experimental"}, version="river-level-scale-91.17.102", status="experimental", layers=[],
    source="GloFAS reach discharge vs return periods", method="data/river-level-scale.json knots", calibration="none (knots from bulletin evidence)",
    independent_test="per monsoon 2024/2025: Watch+ POD 0.06 / 0.33, FAR 0.6-0.9", skill_metrics={"pod_watch_2024":0.06,"pod_watch_2025":0.33},
    operational_threshold="n/a", dependencies=[], known_limitations=["leakage findings L1, L2 open in the model register","no probability, no lead-time verification"])

add(id="flood", name="Flood (governing pathway, pluvial, riverine)", **{"class":"experimental"}, version="flood-composite", status="experimental",
    layers=["flood","flood_pluvial","flood_riverine","telco_flood"], source="rain, terrain (HAND), curve number, river ladder, gauge outlook",
    method="max of pluvial and riverine pathways", dependencies=["river-ladder","rain-hour-rungs","gauge-outlook","flood-hand-weights"],
    known_limitations=["pluvial pathway rests on the hourly rungs (no point skill)","riverine rests on the river ladder (experimental)","no probability output yet (v106+)"])

add(id="flood-hand-weights", name="HAND band weights", **{"class":"calibrated_model"}, version="hand-weights-91.17.101", status="operational", layers=[],
    source="HAND terrain bands vs 2022 / 2025 flood extent", method="band weights", calibration="2022 flood extent",
    independent_test="2025-06..2025-10 extent (hand_weights_split.json)", skill_metrics="hand_weights_split.json", operational_threshold="n/a",
    dependencies=[], known_limitations=["extent-based, not depth"])

add(id="landslide", name="Landslide trigger screen", **{"class":"experimental"}, version="landslide-threshold", status="experimental", layers=["landslide"],
    source="Dahal & Hasegawa curve rescaled to gridded rain; slope, relief, susceptibility", method="rain threshold anchor x terrain multipliers",
    dependencies=[], known_limitations=["held-out hit rate 15 % at a 6 % ordinary-day rate (2014-2017)","terrain multipliers expert and untested"])

add(id="glof", name="GLOF level (lake-routed)", **{"class":"experimental"}, version="glof-ladder", status="experimental", layers=["glof"],
    source="glacial lake inventory, lake change, outburst record", method="logistic susceptibility (leave-one-basin-out AUC 0.816) + routing ladder",
    dependencies=[], known_limitations=["the ladder cuts on the S model are not verified against outcomes per tehsil"])

add(id="cold", name="Cold / frost screen", **{"class":"experimental"}, version="cold-91.17.103", status="experimental", layers=["cold"],
    source="forecast minimum temperature vs the unit's 10th-percentile night minimum", method="ramp below the local baseline (elevation no longer added)",
    dependencies=[], known_limitations=["to be replaced by UTCI cold, frost probability and Tmin anomaly as separate outputs (v106+)","mountain climatology not bias-corrected against stations"],
    components=[{"fr":"cold.elevAmpBands","role":"diagnostic"}])

add(id="wind", name="Wind and gust load", **{"class":"experimental"}, version="wind-ladder", status="experimental", layers=["wind","telco_wind"],
    source="forecast gust / wind", method="gust ladder 40→0 … 220→100", dependencies=[], known_limitations=["withheld above 1,500 m (FAR 0.96 at 40 km/h)","gust factor from wind is fixed"])

add(id="retention", name="Runoff Retention Potential (S)", **{"class":"reference"}, version="nss-s-91.17.103", status="reference", layers=["nss_baseline","nss_dynamic"],
    source="NRCS curve number (USDA NEH Part 630 Ch. 10) from land cover, hydrologic soil group and slope", method="S = 25400/CN − 254 mm",
    dependencies=[], known_limitations=["not validated against measured runoff (hydrological validation last in the plan)","a capacity of the ground, not a hazard; cannot alert"])

add(id="runoff-today", name="Rain run-off today / storm retention", **{"class":"experimental"}, version="nss-runoff-91.17.101", status="experimental", layers=["nss_runoff","nss_retention"],
    source="curve number + forecast day rain", method="NRCS runoff equation", dependencies=["rain-hour-rungs"], known_limitations=["forecast day rain is a single run, not the calibrated chance","not validated"])

add(id="seismic", name="Seismic design zones", **{"class":"reference"}, version="bcp-sp-2007", status="reference", layers=["seismic"],
    source="Building Code of Pakistan Seismic Provisions 2007, Table 2-2", method="zone class per tehsil", dependencies=[], known_limitations=["design-basis zones, not PGA or a forecast"])

add(id="cyclone", name="Cyclone exposure segments", **{"class":"reference"}, version="cyclone-segments", status="reference", layers=["cyclone"],
    source="expert coastal segment table", method="segment class", dependencies=[], known_limitations=["no track, wind field or surge model"])

add(id="comfort-thom", name="Comfort index (Thom discomfort index)", **{"class":"reference"}, version="thom-1959", status="reference", layers=[""],
    source="Thom 1959", method="DI from temperature and humidity", dependencies=[], known_limitations=["ignores wind and sun; UTCI is the heat severity"])

add(id="air", name="Air quality and smog", **{"class":"experimental"}, version="air-forecast", status="experimental", layers=["aqi","air:pm25","air:smog","air:dust","air:fog","air:disp","air:fires"],
    source="atmospheric composition forecast, satellite fires", method="forecast concentrations and smog rules", dependencies=[], known_limitations=["not verified against AGN or official monitors in this build"])

add(id="rain-fell", name="Rain that fell (satellite)", **{"class":"observation"}, version="imerg-late", status="operational", layers=["fell:day"],
    source="IMERG satellite precipitation", method="daily total at the tehsil", dependencies=[], known_limitations=["satellite estimate, not gauge; light mountain rain under-detected"])

add(id="vegetation-health", name="Vegetation health (VHI)", **{"class":"observation"}, version="vhi-weekly", status="operational", layers=["veg:vhi"],
    source="NOAA STAR VHI, 4 km weekly", method="Kogan VHI classes", dependencies=[], known_limitations=["weekly; NDVI floor 0.12 masks bare ground"])

add(id="event-chances", name="Multi-day and single-day event chances (ensemble shares)", **{"class":"experimental"}, version="ensemble-shares", status="experimental",
    layers=["ev:heatSpell","ev:unusualWarmth","ev:meltWarmth","ev:coastalHeat","ev:rain3_75","ev:rain3Local","ev:rainOnSnow","ev:heavySnow","ev:frostSpell","ev:coldSpell",
            "day:tx40","day:tx45","day:pr10","day:pr25","day:pr50","day:pr100","day:sn10","day:tn0","day:gu60"],
    source="ensemble member shares", method="share of members exceeding the event rule", dependencies=[], known_limitations=["raw member shares, not calibrated probabilities"])

add(id="subseasonal", name="Weeks and season ahead", **{"class":"experimental"}, version="s2s-seasonal", status="experimental",
    layers=["week:t","week:pT1","week:p","month:t","month:p"], source="sub-seasonal and seasonal forecasts", method="anomaly vs model climate",
    dependencies=[], known_limitations=["not verified at tehsil scale in this build"])

gate = {"name":"NIGRAAN model gate","version":"gate-"+EFF,"effective_from":EFF,
  "classes":{
    "calibrated_model":{"required":["source","method","calibration","independent_test","skill_metrics","operational_threshold","known_limitations"],"canAlert":True},
    "published_standard":{"required":["source","method","known_limitations","spatial_domain"],"canAlert":True,"note":"calibration may be n/a; source and scope explicit"},
    "observation":{"required":["source","method","known_limitations"],"canAlert":False,"note":"a measurement shown as it is; levels from it are not alerts in v103"},
    "reference":{"required":["source","method","known_limitations"],"canAlert":False,"note":"can display, cannot trigger alerts"},
    "convention":{"required":["maps","label","source","method"],"canAlert":False,"note":"labelled and traceable to the quantity it maps"},
    "experimental":{"required":[],"canAlert":False,"note":"display only, no severity control, no alerts"}},
  "statuses":["operational","provisional","reference","experimental"],
  "entries":E_}
json.dump(gate, open(os.path.join(ROOT, 'data', 'model-gate.json'),'w'), ensure_ascii=False, indent=1)
print(len(E_))
