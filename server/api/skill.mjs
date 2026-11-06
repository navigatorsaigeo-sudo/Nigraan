/* ════════════════════════════════════════════════════════════════════════════
   SKILL SHEET — what every parameter and every threshold in this system is
   actually worth, measured against ground observation.

   v91.17.3 · Stage 1.12.

   WHY THIS EXISTS. Until now the measured skill of this platform lived in
   analysis reports beside the repository. A number that a client acts on and a
   number that says how good that number is have to travel together, or the
   second one does not exist as far as the client is concerned. Every entry
   below carries: the measurand, the reference it was measured against, the
   sample, the result, the domain it holds in, and what the platform does about
   it. Where there is no measurement the entry says so in those words and the
   `verified` flag is false — an unverified parameter is not a slightly weaker
   product, it is a different kind of claim.

   THE REFERENCE. All station figures come from the AGN station lake: 244 PMD mountain AWS
   and PMD automatic weather stations, 49.24M raw rows screened by QC flag
   (sentinel, range, spike, flat-line, night-value and duplicate), 43.39M
   usable, with variable-specific trust cohorts — 34 of 47 stations trusted for
   temperature, 19 of 46 for rainfall. Model series are the paid MAch
   historical-forecast and previous-runs endpoints read at each station point.

   WHAT THIS IS NOT. None of these are calibrated probabilities. Detection and
   false-alarm rates are counts over the stated sample, not forecast skill
   scores with confidence intervals, and every one of them is a summer-weighted
   sample of a single year unless the entry says otherwise. They are the best
   available statement, not the last word, and the refit cadence is in
   `refit` below.
   ════════════════════════════════════════════════════════════════════════════ */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { internalNames, label } from './refmode.mjs';   /* v91.17.71 · data use vs naming */
import { evidenceForClient } from './evidence.mjs';   /* v91.17.283 · WS4 · the measured out-of-sample figures, generated from the evidence files */

const SHEET = {
  version: '91.17.79',
  measuredOn: '2026-09-22',
  note: 'version and measuredOn follow the last edit of any entry; each entry also carries the build that measured it',
  reference: {
    network: 'AGN station lake — 244 PMD automatic weather stations (the mountain AWS network and the city AWS)',
    rows: { screened: 49_240_000, usable: 43_390_000 },
    trustCohorts: { temperature: '34 of 47 stations', rainfall: '19 of 46 gauges' },
    model: 'forecast provider endpoints (historical-forecast, previous-runs, archive) read at each station point',
    caveat: 'one year of paired record, summer-weighted. Every figure is a count over the stated sample, not a calibrated skill score with a confidence interval.',
  },
  refit: 'each season, with a new sheet published on every refit. A figure older than one refit cycle is stale and this endpoint states its measurement date.',

  parameters: [
    {
      id: 'temperature_mountain',
      label: 'Air temperature, mountains',
      measurand: '2 m air temperature, hourly',
      domain: 'above 1,000 m, within 25 km and 500 m of a calibrated station',
      verified: true,
      sample: '253,913 hourly pairs, 47 stations, 1,362–4,669 m, 2025-09-01 to 2026-08-21',
      raw: { bias_C: -4.43, mae_C: 4.72, rmse_C: 5.66 },
      corrected: { mae_C: '2.0 to 2.8', method: 'station + height-band MOS by month and part of day, leave-one-station-out' },
      leadTime: 'flat from day 0 to day 5 before correction (bias 4.43 → 3.84), which is the signature of a constant offset burying the weather signal. The lead-time curve appears once the offset is removed.',
      note: 'ERA5 at these points is WORSE than the raw forecast: bias −5.96 °C, MAE 6.35. Correcting towards ERA5 in the mountains moves the forecast away from the observations, which is why the station guard exists.',
      action: 'corrected and served, DAYTIME HOURS ONLY since v91.17.23 (full weight 03-14 UTC, ramped in from 02 and out to 15 UTC); night hours and the daily minimum are not corrected',
      independentTest: {
        added: 'v91.17.23',
        network: 'PMD synop stations via NOAA GSOD: different stations from the PMD mountain AWS the table was trained on (same operator, different instruments and siting)',
        window: '2024-02-01 to 2025-08-24 (before the table\'s training window)',
        stations: 'Gilgit, Skardu, Chitral, Dir, Drosh, Bunji, Chillas, Gupis, Astore',
        valleyTmax_mae_C: { basis: 3.67, corrected: 3.24 },
        valleyTmin_mae_C: { basis: 2.86, corrected: 4.05 },
        frostPOD: { basis: 0.33, corrected: 0.21 },
        reading: 'the station-table correction helps the daily maximum and harms the daily minimum at PMD stations; the two PMD station types disagree on the sign of the night-time error: the synop stations sit on valley floors, the mountain AWS masts on slopes above the cold pool, and the AWS heights come from a DEM, not a survey. The 2.0-2.8 C figure above is measured on the training network and is not an independent validation.',
        evidence: 'audit/evidence_v91_17_22/gsod_mos.py, gsod_cmp.csv',
      },
    },
    {
      id: 'temperature_plains_hourly',
      label: 'Air temperature, plains, hourly',
      measurand: '2 m air temperature, hourly',
      domain: 'below 1,000 m',
      verified: true,
      sample: 'PMD Karachi, Lahore and Multan 10-minute records; timestamps read as UTC',
      raw: { mae_C: '1.3-1.6 (Karachi 1.33, Multan 1.39, Lahore 1.61)', mae_C_typical: 1.5, bias_C: '-0.8 to +0.3', hours: '38,821 / 31,785 / 22,670' },
      evidence: 'audit/evidence_v91_17_3/phase2b_plains.md (site table)',
      note: 'measured 2021-2026; the error has fallen year by year (Karachi 1.48 -> 0.99 °C) with the provider\'s model upgrades',
      action: 'left alone. The bias is within ±1 °C and an hourly correction is not supported by the data.',
    },
    {
      id: 'temperature_plains_daily',
      label: 'Air temperature, plains, daily maximum and minimum',
      measurand: 'daily maximum and minimum as PMD reports them',
      domain: 'below 1,000 m, within 40 km of a calibrated city (Karachi, Lahore, Multan)',
      verified: true,
      raw: { bias_C: '-1.4 to -1.7 on the daily maximum, -0.85 to -0.99 on the minimum' },
      corrected: {
        Karachi: { maxMae_C: [1.52, 0.97], minMae_C: [1.38, 0.98] },
        Lahore: { maxMae_C: [1.79, 1.16], minMae_C: [1.33, 1.27] },
        Multan: { maxMae_C: [1.19, 1.08], minMae_C: [1.20, 1.09] },
        method: 'monthly offsets per city fitted against PMD reported extremes, day-block split',
      },
      note: "PMD's own reported daily maximum runs 0.4–0.55 °C above its 10-minute table on 13–16% of days, so verification reads the reported extreme, not a recomputed one.",
      evidence: 'audit/evidence_v91_17_3/plains_mos_metrics.csv, phase2b_plains.md',
      action: 'corrected and served on the daily maximum and minimum only for Karachi and Multan. LAHORE IS EXCLUDED from the served offsets (NIGRAAN_PLAINS_EXCLUDE): checked against the co-located PMD synop, the Lahore offsets overcorrected the daily maximum (bias -0.75 -> +0.97 °C). Its figures above are the fit, not what is served.',
    },
    {
      id: 'temperature_daily_pooled_ifs',
      label: 'Daily maximum and minimum, pooled station correction on ECMWF IFS (v91.17.27)',
      measurand: 'daily maximum and minimum 2 m temperature from the named ECMWF IFS run',
      domain: 'elevation 4-2,691 m, latitude 24.6-36.2, site-to-grid height gap -1,578 to +1,430 m (the training envelope); applied with a margin of 100 m below, 300 m above and 0.5° of latitude, refused beyond that',
      verified: true,
      sample: '54 PMD synop stations (NOAA GSOD), 25,578 station-days, 2024-02-01 to 2025-08-24; IFS first-day forecast at station elevation',
      method: 'ridge regression of observed minus forecast on day of year, forecast diurnal range, site-minus-grid height, elevation, latitude and a coast flag; no station identity, so it transfers to uninstrumented sites',
      test: 'each station left out; trained only on dates before 2025-01-01, tested from 2025-01-01',
      raw: { maxMae_C: 2.12, minMae_C: 2.11, maxMaeMountain_C: 2.87, maxMaePlains_C: 1.69 },
      corrected: { maxMae_C: 1.65, minMae_C: 2.01, maxMaeMountain_C: 1.94, maxMaePlains_C: 1.5, minMaeMountain_C: 2.75, minMaePlains_C: 1.59 },
      tail: 'at 45 °C detection 0.53 -> 0.55, false alarms 0.33 -> 0.35: the correction does not fix the upper tail. An upper-decile quantile mapping was tested on the same split and did not help (0.40 -> 0.39 on best_match), so none is applied.',
      independentTests: {
        added: 'v91.17.28, on the data delivered as deploy/DATA',
        pmdMountainAws: '105 PMD mountain AWS stations 2023-10 to 2026-08 (delivered as the GB export; none of them in the 54-station fit, same operator), inside the envelope: daily maximum 3.90 -> 3.02 °C, daily minimum 5.01 -> 3.73 °C. Above the envelope the correction is refused and the raw run runs cold (maximum -4.6, minimum -5.7 °C).',
        pmdCityAws: 'PMD 10-minute city AWS 2024-02 to 2026-08: daily maximum Karachi 1.08 -> 0.90, Lahore 1.80 -> 1.29, Multan 1.22 -> 1.30 °C; daily minimum Karachi 1.25 -> 1.88, Lahore 1.34 -> 1.57, Multan 1.32 -> 1.21 °C.',
        decision: 'daily maximum corrected inside the envelope; daily minimum corrected only at 1,000 m and above, because it worsened two of three city AWS',
        evidence: 'audit/evidence_v91_17_22/d5_results.json, d5_pmd_mountain_ifs.py, d5_city_aws_test.csv',
      },
      action: 'not applied since v91.17.283.24 (self-audit H13): operating limits read the served forecast at the place for 0-72 h (its own station calibration and national model) and the ensemble moved onto that forecast for days 0-14; this evaluation is kept as evidence',
      evidence: 'audit/evidence_v91_17_22/ifsmos.py, data/ifs-mos.json',
    },
    {
      id: 'relative_humidity',
      label: 'Relative humidity',
      measurand: '2 m relative humidity',
      domain: 'mountain stations, same guard as temperature',
      verified: true,
      sample: '46 mountain stations, leave-one-station-out, improved at 29 of 45',
      raw: { bias_pct: 11.3, mae_pct: 17.3 },
      corrected: { bias_pct: 1.5, mae_pct: 14.8 }, /* v91.17.23 · matched to mos-table.json rh.measured */
      action: 'corrected and served; dew point is recomputed from the corrected pair with Magnus so temperature, humidity and dew point stay consistent',
    },
    {
      id: 'wet_bulb',
      label: 'Wet-bulb temperature',
      measurand: 'wet-bulb temperature by the Stull approximation',
      domain: 'mountain stations',
      verified: true,
      raw: { bias_C: -3.10, mae_C: 3.46 },
      temperatureOnly: { bias_C: 0.99, mae_C: 2.33 },
      corrected: { bias_C: 0.24, mae_C: 2.03 },
      note: 'the humidity error was cancelling part of the temperature error inside wet bulb. Correcting temperature alone leaves a warm bias; both together is the only defensible pairing, and mixing a corrected temperature with an uncorrected humidity is the worst of the three.',
      action: 'corrected and served',
    },
    {
      id: 'wind_speed',
      label: 'Wind speed',
      measurand: '10 m sustained wind',
      domain: 'complex terrain',
      verified: true,
      raw: { model_kmh: 3.4, observed_kmh: 7.3 },
      secondSample: '34 PMD mountain AWS stations 2025-01 to 2026-08, 14,805 station-days: model 3.4 against observed 6.9 km/h daily mean, correlation 0.07 (v91.17.28)',
      action: 'NOT corrected and NOT used to raise a class in complex terrain. The model runs at less than half the observed speed and no correction has been fitted.',
    },
    {
      id: 'wind_gusts',
      label: 'Wind gusts',
      measurand: '10 m maximum gust',
      domain: 'complex terrain, above 1,500 m',
      verified: true,
      sample: '6,935 mountain station-days',
      raw: { model_kmh: 23.2, observed_kmh: 13.7, falseAlarmRate_at40kmh: 0.96 },
      note: 'gusts correlate with warm days (0.34) and not with rain (0.00). In these valleys the gust signal is thermal wind, not convection, which is a second reason the wind ladder misfires.',
      secondSample: '34 PMD mountain AWS stations 2025-01 to 2026-08, 7,024 station-days of daily maximum gust: model 34.9 against observed 29.0 km/h, correlation 0.07; at 40 km/h detection 0.39 and false alarms 0.75 (v91.17.28)',
      action: 'WITHDRAWN above 1,500 m. The 60 km/h threshold returns null there and no wind class is published. Nineteen alerts in twenty were wrong.',
    },
    {
      id: 'rainfall',
      label: 'Rainfall',
      measurand: 'hourly and 3-hourly precipitation',
      domain: 'all',
      verified: true,
      sample: '10,398 station-days, 19 trusted gauges of 46',
      raw: { hourlyCorrelation: 0.13, modelMax_mm_h: 7.3, observedMax_mm_h: 45.5, detection_3hourly: 0.25 },
      note: 'the model cannot represent a convective peak. Its highest hourly rainfall in a year was 7.3 mm/h against 45.5 mm/h observed, so any intensity ladder whose rungs sit at 2, 7, 20 and 50 mm/h has three rungs the model can never reach.',
      action: 'rain chances are probabilistic and catchment-averaged; no deterministic hyperlocal rainfall is published. A rainfall amount correction is fitted by quantile mapping onto the gauges: in the mountain zone it is live (data/rain-qm-north.json), on the plains and coast it corrects the displayed amount only (data/rain-qm-plains.json); the figures are read from those files (rainCorrectionOverlay).',
    },
    {
      id: 'solar_radiation',
      label: 'Solar radiation (v91.17.28)',
      measurand: 'daily mean incoming shortwave, ECMWF IFS at station height, against the PMD mountain AWS pyranometers',
      domain: 'mountains (34 PMD mountain AWS stations, 2025-01 to 2026-08, 7,063 station-days)',
      verified: true,
      raw: { bias_Wm2: 62.9, mae_Wm2: 72.0, obsMean_Wm2: 173.4, modelMean_Wm2: 236.3, correlation: 0.68 },
      note: 'the model runs about a third high in the valleys: it does not shade a station behind a ridge. It follows the day-to-day pattern (r 0.68) and not the level.',
      action: 'not corrected; not to be used as a solar-yield input in the mountains without a site pyranometer',
    },
    {
      id: 'cape_convection',
      label: 'CAPE as a heavy-rain signal (v91.17.30)',
      measurand: 'daily maximum forecast CAPE (ECMWF IFS 0.25°) against observed daily maximum rain intensity',
      domain: 'mountains: 102 PMD mountain AWS, 2025-01 to 2026-08, 20337 station-days, 275 days with rain >= 10 mm/h'
      ,
      verified: true,
      raw: { capeGe1000: {"pod": 0.01, "far": 0.97, "hss": 0.005, "alarms": 78}, modelRainGe1mmh: {"pod": 0.34, "far": 0.96, "hss": 0.052, "alarms": 2248}, correlationCapeObs: 0.11, correlationModelRainObs: 0.25 },
      action: 'WITHHELD above 1,000 m: no convective band is published there. The plains are not tested.',
    },
    {
      id: 'urban_heat_island',
      label: 'Urban heat island (v91.17.30)',
      measurand: 'modelled nocturnal heat-island difference between two cells, against the observed difference in daily minimum',
      domain: 'Lahore City synop against Allama Iqbal airport, 52 common nights (the only city/airport pair in the delivered data)',
      verified: false,
      raw: { modelledCityMinusAirport_C: 1.41, observedCityMinusAirportTmin_C: -1.13, observedCityMinusAirportTmax_C: 1.48 },
      note: 'the model says the city cell is 1.4 °C warmer at night; observed, the city station ran 1.1 °C colder at night and 1.5 °C warmer by day. One pair and 52 nights cannot calibrate a model, but it is the wrong sign.',
      action: 'reported beside the temperature, never added to it and never used in any score, until multi-city urban/rural pairs support it',
    },
    {
      id: 'snow_depth',
      label: 'Snow depth',
      measurand: 'modelled snow depth',
      domain: 'mountains',
      verified: true,
      sample: '5,747 station-days',
      raw: { model_cm: 310, observed_cm: 36, correlation: -0.10 },
      action: 'DROPPED as a hazard input. Not a bias — no relationship at all, and about nine times too deep. It is carried for context only and no snow water equivalent is derived from it, so snowmelt is published as a POTENTIAL rather than a volume.',
    },
    {
      id: 'snowfall',
      label: 'Snowfall',
      measurand: 'daily snowfall accumulation',
      domain: 'mountains',
      verified: false,
      action: 'used for the heavy-snow and rain-on-snow screens as an accumulation. No paired verification has been run on it yet; it is preferred over snow depth because it is a flux rather than a state variable, which is a physical argument and not a measurement.',
    },
    {
      id: 'rainfall_idf',
      label: 'Rainfall intensity-duration-frequency — WITHHELD (v91.17.68)',
      measurand: 'annual maximum rainfall accumulation over 10 minutes to 24 hours, as a return period',
      domain: 'NONE served. The mountain accumulator record (2023-09 to 2026-08) holds at most two complete calendar years at any gauge and the trust screen passes 19 of 46 gauges; the earlier 26-gauge table counted partial years as annual maxima and never applied the trust screen (a gauge the screen marks dead was on it). Withdrawn, not corrected. No IDF curve exists for Punjab or Sindh either: the PMD exports carry no sub-daily rainfall.',
      verified: false, scientificStatus: 'Withheld (record too short)',
      sample: '3.48M QC-passed 10-minute accumulator readings; increments accepted only between adjacent readings and capped at 30 mm per 10 minutes',
      raw: { tenYearOneHour_mm: 'median 8.4, range 2.6 to 32.9', tenYearTwentyFourHour_mm: 'median 38.4, range 5.9 to 65.8', largestObservedOneHour_mm: 27.2 },
      note: 'This exists because the flood engine\'s pluvial ladder cuts at 2, 7, 20 and 50 mm/h while the model\'s highest hourly rainfall in a year was 7.3 mm/h — three of the four rungs are unreachable by the forecast meant to climb them. A return period does not depend on the model resolving an intensity it cannot resolve. The first draft of this fit reported a 10-year one-hour depth of 305 mm, near the world record: the accumulator kept counting through telemetry gaps, so the first reading back carried weeks of rain into one 10-minute slot. Increments are now accepted only between adjacent readings.',
      action: '/api/idf answers with the refusal and the earliest date a table can exist (after the 2027 season, and then only the 2-year level). Superseded text of v91.17.3 follows for the record — published at /api/idf. Most gauges hold THREE annual maxima, because the PMD mountain AWS network began recording in 2023: the 2-year level is defensible, every longer return period is an extrapolation past the end of the record and is labelled as one, and the largest value actually observed is published beside them because on a three-year record that is the most defensible number on the row. Not yet wired into the pluvial score — replacing a live ladder needs a curve for the plains, which this network cannot give.',
    },
    {
      id: 'reanalysis_reference',
      label: 'The reanalysis this system trusts as truth',
      measurand: '2 m air temperature from a reanalysis, used as the reference for bias correction and verification',
      domain: 'mountains, where the choice matters',
      verified: true,
      sample: '14 mountain stations, 97,301 paired hours, 2025-09-01 to 2026-08-21, measured 18 September 2026',
      raw: { era5_25km: { bias_C: -5.93, mae_C: 6.77 },
             era5_land_9km: { bias_C: -7.29, mae_C: 7.78 },
             ecmwf_ifs_9km: { bias_C: -4.35, mae_C: 5.05 },
             raw_forecast: { bias_C: -4.55, mae_C: 5.05 } },
      note: 'ERA5-Land was expected to help — 9 km, land-only surface scheme, better orography — and it is WORSE than ERA5 at 12 of 14 stations. It is rejected, and that is a measurement rather than a preference. ECMWF IFS at 9 km beats ERA5 at 14 of 14 stations, median 1.77 °C MAE. Note also that the raw forecast is still better than ERA5 and level with IFS in these valleys, which is why the station MOS overrides the reanalysis inside its own domain: a better reference improves the correction outside that domain, it does not replace it.',
      caveat: 'ECMWF IFS and the ECMWF ensemble share a model family, so an adjustment measured against IFS is less independent than one measured against ERA5, and the MAE against it is smaller partly because the two agree with each other. Measured on the live bias job: the median daily-maximum MAE against the reference fell from 1.4 °C (ERA5) to 0.4 °C (IFS) and the number of tehsils needing an adjustment fell from 352 to 261. That is NOT a 1 °C accuracy gain. The accuracy claim rests only on the station test above, where IFS is 1.77 °C closer to independent ground observation than ERA5; the shrinking adjustment is a consequence of the shared family and is reported so it is not misread as skill.',
      action: 'ECMWF IFS 9 km (models=ecmwf_ifs) is the reference for every window starting on or after 2017-01-01: bias estimation, station verification, ensemble verification and the ensemble bias adjustment. ERA5 remains the reference for the 1991-2020 and 1993-2016 climatologies, because the IFS archive begins in 2017 and a climatology cannot be built from a record shorter than itself. ERA5-Land is not used anywhere.',
    },
    {
      id: 'elevation',
      label: 'Point elevation',
      measurand: 'the height the provider downscales to',
      domain: 'every point request',
      verified: true,
      note: 'The model forecast downscales to the elevation supplied with the request. Supplying the station height or the valley-floor DEM height instead of the grid-cell mean removes about 1.6 °C of error for nothing.',
      action: 'elevation is supplied on every point request this backend makes',
    },
    {
      id: 'air_quality',
      label: 'Particulate matter and smog',
      measurand: 'PM2.5 daily mean and peak, from CAMS',
      domain: 'all',
      verified: false,
      action: 'GROUND-CHECKED NEAR 11 CITIES, UNVERIFIED ELSEWHERE (v154). Within 30 km of a particulate monitor the daily PM2.5 is corrected against that monitor\'s record: four international monitors (Islamabad, Karachi, Lahore, Peshawar; Aug 2022 - Feb 2026, each season-year held out) and provincial monitors in seven Punjab districts (Gujranwala, Gujrat, Hafizabad, Multan, Rahim Yar Khan, Sargodha, Sialkot; Jun - Dec 2025, each month held out). Held-out daily error fell 10-38 % against the uncorrected model (Karachi: error unchanged, bias -16 -> +4 ug/m3). The Lahore correction was also checked on 1,218 provincial-monitor days it was not fitted on: error 40 -> 33 ug/m3, unhealthy-day detection 0.65 -> 0.90, though at single stations (2022-24) it read 25 ug/m3 high. Ten other monitored districts did not improve under the same test and stay uncorrected. Away from these cities the modelled value is shown, labelled unverified.',
    },
    {
      id: 'albedo',
      label: 'Surface albedo',
      measurand: 'reflected over direct shortwave radiation',
      domain: '13 stations carrying both radiation channels',
      verified: true,
      raw: { january: 0.69, july: 0.17 },
      note: "the PMD mountain AWS radiation channel labels are reversed in the export: albedo computed as Direct/Reflected gives the physically correct seasonal curve, and the other way round gives impossible ratios of 2 to 15.",
      action: 'available as an observation for the melt and GLOF work, in place of a parameterisation',
    },
    {
      id: 'glofas_discharge',
      label: 'River discharge (GloFAS)',
      measurand: 'daily mean discharge',
      domain: 'mountain tributaries',
      verified: true,
      sample: 'eight mountain gauges',
      raw: { dayToDayChangeCorrelation: 0.00 },
      note: 'A second defect, measured 18 September 2026: GloFAS only carries discharge in the cells it routes water through, so a point a few kilometres off the modelled channel returns 0 m³/s. At the nominal Guddu Barrage coordinate the model returns 0.0 while the Indus main stem 4 km away carries 5,558 m³/s. A zero that means "not a river cell" and a zero that means "the river is dry" were the same number.',
      action: 'REBUILT as a backend job (/api/flood). 25 main-stem points and barrages are snapped to the nearest GloFAS cell carrying at least 20% of its own local channel, within 15 km — median move 3.1 km, maximum 5.2 km. Each point carries return levels fitted with a Gumbel distribution to 30 annual maxima of the GloFAS reanalysis (1997 onward), and every forecast day is published as the share of 50 ensemble members crossing each level. Three mountain tributaries (Gilgit, Hunza at Danyor, Swat at Chakdara) are held in the list and REFUSED with the reason, rather than being snapped onto the Indus, which is what a largest-discharge rule did on the first pass.',
      caveat: 'the return levels are fitted to the MODEL reanalysis, not to WAPDA gauge records, which are not in this build. A "10-year" level means "a discharge this model exceeds about once a decade in its own 30-year record" — a defensible scale for change, not a calibrated flood frequency. The 2, 5 and 10-year levels sit inside the record; the 20 and 50-year levels are extrapolations beyond it. Nothing here is an official flood warning.',
    },
    {
      id: 'physical_ladders',
      label: 'Physical screening cuts at an asset (v91.17.30, printed with every value)',
      measurand: 'the class each physical quantity gives at the asset, beside the screening index',
      domain: 'every asset on the crossings board; wind not scored above 1,500 m',
      verified: false,
      /* v283.36 item 23: the retired dry-heat (40/43/45) and cold (3/0.5/-2) asset ladders are deleted (limits.mjs retired them) */
      cuts: {
        humidHeat: 'hourly wet-bulb maximum, next 72 h: Monitor 26 / Watch 28 / Act 31 °C (raw model wet bulb; error 3.46 °C at mountain stations, not measured in the plains)',
        river: 'share of GloFAS members above the bound reach\'s own model return levels, to day 14: Monitor 20 % above 2-year, Watch 50 % above 2-year, Act 50 % above 5-year',
        catchmentRain: 'share of 51 ECMWF members whose catchment-mean daily rain reaches the catchment\'s own 2-year wettest day: facts only, no class (v91.17.283.37: the member-share cuts are untested, state -5)',
        glacialLakes: 'SERVED (data/glof-terrain.json present, NIGRAAN_GLOF_PHYS on by default): the physical ladder H = S × (0.25 + 0.75 T) × R on the lake-routed reach, see the glof_physical_screen entry. Register rule (only with NIGRAAN_GLOF_PHYS=0): Monitor: a Priority or Watch lake drains to the asset within 100 km; Watch: a Priority lake upstream is above its SUPARCO 2025 maximum and its PMD 2024 outline; Act: Watch plus catchment rain at Watch or Act. Not applicable where no listed lake drains to the asset. (v91.17.68: the sheet described the register rule while the physical ladder was served, audit C19)',
      },
      action: 'SCREENING CUTS. They are printed beside every value and are not the client\'s limits. The index class on the other surfaces is unchanged until the crossing ledger has scored these cuts against the analysis.',
    },
    {
      id: 'imerg_rain_verification',
      label: 'Satellite rain as a second judge (GPM IMERG Late Run daily V07, v91.17.32)',
      measurand: 'tehsil-mean daily rain from 0.1° IMERG cells, against the logged ensemble median and the ≥10 / ≥25 / ≥50 mm chances',
      domain: 'every tehsil; plains and mountains scored apart; leads 1, 2, 3, 5, 7 and 10 days',
      verified: false,
      sample: 'starts with the first logged ensemble run (2026-09-17); fewer than 30 issue days is indicative only',
      evidence: 'data/imerg-verification.json (written by the server on the operator\'s computer; /api/imerg/verification)',
      caveat: 'IMERG under-reads orographic rain and can miss or misplace short convective bursts; over snow and ice its microwave inputs are withheld. Ensemble days are Pakistan days and IMERG days are UTC days, so single-day pairs carry a 5-hour offset.',
      action: 'RUNS on the operator\'s computer with an Earthdata token; the first scored numbers are pending.',
    },
    {
      id: 'settlement_height',
      label: 'The height the sweep asks for: population-weighted settlement elevation (v91.17.37)',
      measurand: 'the elevation at which a tehsil\'s temperature is served: the population-weighted median of GHS-POP 100 m cells on the Copernicus GLO-90 DEM, in place of the anchor point\'s DEM height where the two differ by more than 150 m',
      domain: '64 of 576 tehsils (gap over 150 m; 5 over 500 m); the rest keep the anchor height',
      verified: true,
      sample: 'measured 2026-09-22: Seo -2,038 m, Palas -1,981 m, Phandar -1,245 m, Nagar -1,082 m, Harban Basha -973 m, Astore +751 m, Shigar -737 m against the anchor. The provider moves its grid value to the requested height at -6.51 C/km (median over station hours with |dz| > 100 m), and lapse.py finds the fitted rate agrees month by month (-5.4 to -8.8 C/km); the error in the mountains is a grid-height cold bias, not a lapse error.',
      evidence: 'data/settlement-elevation.json; data/lapse-table.json (metrics); station-lake/scripts/settlement_elevation.py, lapse.py',
      caveat: 'the 1991-2020 temperature percentiles were rebuilt at the served heights (zM on each unit); an older climatology file is shifted by the same -6.5 C/km and says so (heightShiftC). ERA5 at these points still runs cold against the PMD mountain stations (skill: reanalysis_reference), so an anomaly in a valley is measured against a cold normal.',
      action: 'the national sweep, the outlook and the climatology use the settlement height; the unit prints both heights.',
    },
    {
      id: 'mountain_gap_offset',
      label: 'Regional grid-height offset where the mountain table has no entry (v91.17.37)',
      measurand: 'the provider\'s cold bias at its own grid height in the northern mountains, by month and part of day, served only where the station and height-band table has no entry',
      domain: 'inside the MOS box (34.8-36.9 N, 71.5-76.6 E, 1,160-4,970 m), the gaps of the table only; never at a skip-list station',
      verified: true,
      sample: 'leave-one-station-out over 253,913 hours at 46 stations [measured]: raw forecast MAE 4.90 C (bias -4.52); regional offset alone 2.95 (bias +0.03); the table where it applies 2.29; table with the offset filling its gaps 2.30',
      evidence: 'data/lapse-table.json (table, metrics, decision); station-lake/reports/lapse_metrics.csv',
      caveat: 'a regression across valley stations, not a profile; one year of record; the intercept carries the network-wide bias and must never stack on a station entry (it does not: the lookup returns one source)',
      action: 'mos.adjust() returns source "regional offset" with the month/part support; NIGRAAN_MOS_OFFSET=0 turns it off',
    },
    {
      id: 'glof_physical_screen',
      label: 'GLOF corridor class: susceptibility × trigger × reach (v91.17.37)',
      measurand: 'H = S × (0.25 + 0.75·T) × R per lake and routed basin; S from dam type, glacier contact, area, 1 km relief and slope (GLO-90), glacier type, RGI surge flag and tier; T the strongest of melt (positive degree-days above the lake\'s own normal at the lake height, freezing-level share), 72-h rain and Sentinel-2/bulletin growth, scaled 0.7 and completed by a second trigger; R = e^(-km/L) with dilution above 2,000 km² upstream and the drop per km',
      domain: 'every tehsil a routed corridor crosses; ladder H < 0.05 not applicable, 0.25 Monitor, 0.6 Watch, then Act',
      verified: false,
      sample: 'measured 2026-09-22 against the register-only rule: 58 tehsils classed (all Monitor/Watch, 24 of 24 GB tehsils Monitor) becomes 43 (Monitor/Watch/Act by driver, Skardu and the Indus main stem not applicable). Every term prints in the basis text.',
      evidence: 'glof.mjs (physicalBasin, trigger, susceptibility, reach); data/glof-terrain.json; data/glof-lakes-live.json; /api/glof/national?force=1 physics block',
      caveat: 'screening constants, not a calibrated probability: no outburst record validates S, T or the ladder (skill: glofProbability refused). The melt anomaly is measured against the ERA5-based normal, which runs cold in these valleys.',
      action: 'the map, the card, the board and the report carry the class and the index; NIGRAAN_GLOF_PHYS=0 restores the register-only rule',
    },
    {
      id: 'urban_canopy_buildings',
      label: 'Urban field: measured tree canopy and building footprints per cell (v91.17.37)',
      measurand: 'tree canopy cover per 270 m urban cell (Meta/WRI 1 m canopy height map, 2020; a 114 m sample at the cell centre, canopy at 2 m or more) and building count / footprint fraction per cell (Google Open Buildings v3, confidence >= 0.65)',
      domain: 'canopy: 22 km around 12 city centres where sampled; buildings: every urban cell and every tehsil (79.1 million footprints in Pakistan tehsils, 5,509 km²)',
      verified: false,
      sample: 'measured 2026-09-22: Lahore Cantt 1.40 M footprints, Lahore City 0.82 M, Rawalpindi 0.81 M, Gujranwala 0.67 M, Muzaffargarh 0.65 M',
      evidence: 'data/urban-tree.f16, data/urban-buildings.f16, data/buildings-tehsil.json; station-lake/scripts/urban_canopy.py, buildings.py',
      caveat: 'the canopy replaces the 1 km NDVI as the vegetation term where sampled, under the same declared cooling coefficient 0.40; neither is a measured cooling. Footprints are detections, not dwellings, and are weaker in dense old cores and on steep slopes. Both stay outside the heat-island physics as exposure.',
      action: 'vegetation.source = canopy on a sampled cell; buildings on the cell record and per tehsil',
    },
    {
      id: 'dynamic_lapse_test',
      label: 'Dynamic lapse rate from the model\'s pressure levels: measured and not adopted (v91.17.41)',
      measurand: 'the served temperature at the PMD mountain stations when the grid value is moved to the station height with the lapse of the pressure layer spanning the two heights (T and geopotential height at 925/850/700/600/500 hPa, hourly, inversions kept), against the fixed lapse the provider applies; every pipeline scored raw and with a residual correction (height band × month × part of day) refitted on the other stations',
      domain: '46 stations, 247,004 hours, 2025-09-01 to 2026-08-21; stations sit on average 631 m below the model grid',
      verified: true,
      sample: 'measured 2026-09-23, leave one station out: raw grid value MAE 8.83 °C; fixed lapse 4.9; dynamic free-air lapse 4.87; fitted blend a·Γ+b 3.68; with the retrained band correction: fixed 3.11 vs dynamic 3.18 (time-blocked 2.98 vs 3.04). Day, |Δz| > 300 m: fixed 3.89 vs dynamic 3.68; night: 5.88 vs 6.04. Median dynamic lapse -6.75 °C/km (day -7.12, night -6.44); production (station MOS, in-sample) 2.31',
      evidence: 'data/lapse-dynamic.json; station-lake/scripts/lapse_dynamic.py; station-lake/reports/lapse_dynamic_metrics.csv',
      caveat: 'the free-air lapse is nearly the standard one over these valleys and the error is a grid-height cold bias (−8.6 °C raw, −4.5 after any lapse), which a lapse cannot remove and the station correction does. Calm clear nights are not colder-biased than other nights at these stations, so cold-air pooling is not the driver of the night error either. Mountain gauges only: no plains regime in this test',
      action: 'not adopted: it does not reduce held-out error after the correction is refitted, and it worsens nights. The fixed lapse and the station/band correction stay in production',
    },
    {
      id: 'catchment_wetness',
      label: 'Catchment wetness: the state half of the sponge (v91.17.42)',
      measurand: 'per tehsil, every 6 h: root-zone water content over 0–81 cm from the provider\'s five soil-moisture layers, read as a wetness state WS against the model\'s own yearly range at that place (p05–p95 of daily root-zone water, soil-model-range.json); the storage the root zone can still take in mm; the effective sponge ES = SSC × (1 − WS) with the static sponge SSC from soil, permeability, impervious surface and local HAND (sponge-tehsil.json); the wetness the model forecasts for +24/+72 h; and a sensitivity that compares storage with the 72-h forecast rain',
      domain: '576 tehsils; the state is refused where the model soil barely varies over the year (span under 0.03 m³/m³, the arid belt)',
      verified: false,
      sample: 'measured 2026-09-23 (dry season): 368 tehsils dry, 98 moderate, 61 primed, 49 saturated on the model range; Rohri 0.70 (primed, 29 mm left), Gujranwala 0.26, Lahore City 0.02, Kalam 0.01. The first version read the state against the SoilGrids field capacity and put 88 tehsils above it on a dry day (Rohri 0.25 m³/m³ against a sandy-loam FC of 0.21): a soil-description mismatch, the reason the model\'s own range is the basis',
      evidence: 'data/wetness.json (6-hourly), data/sponge-tehsil.json, data/soil-model-range.json; station-lake/scripts/sponge.py, soil_model_range.py; /api/flood/wetness; the outlook unit payload, the report\'s unit line, AI facts catchmentWetness',
      caveat: 'a state read from a model soil-moisture field: no soil-moisture gauge exists in the PMD lake, so nothing here is verified; SSC weights are starting values; the p95 of one year understates the field capacity in a dry year; sensitivity is storage against forecast rain, not a flood probability. Nothing in the flood scores reads it yet — it is the variable the curve-number runoff will read',
      action: 'served on every surface as context; NIGRAAN_WETNESS=0 stops the job',
    },
    {
      id: 'glof_trigger_outlook',
      label: 'GLOF trigger outlook per lake: drivers decomposed, four horizons, member agreement (v91.17.41)',
      measurand: 'for every Priority and Watch lake: the freezing-level height above the lake, positive degree-days above 0 and above the lake\'s own normal over the days the tehsil record holds (73 h: three days; v91.17.68 corrected from the "1/3/5 days" the sheet claimed), melt acceleration against the normal, 24/72-h rain and the 72-h rain against the tehsil\'s 99th-percentile 3-day total, rain on snow (5-day snowfall as the snow proxy); and, over four windows (0–1, 1–3, 4–7, 8–15 days), the share of the 51 ensemble members whose rebuilt trigger reaches 0.5',
      domain: '507 Priority and Watch lakes (surge-type glaciers raise the tier under rule 1c); members are kept for the tehsils that host them from the ensemble job onwards',
      verified: false,
      sample: 'measured 2026-09-23 during a Karakoram warm spell (unusual warmth 59% of members at Gojal): 42 lakes with every member loaded in days 1–3, 438 with none; environment window 0.04–0.35 at the loaded lakes. A 0.002 km² lake read at 2.6× its outline was scoring growth 1 on pixel noise: the monitor\'s 0.005 km² floor now applies to the trigger too',
      evidence: '/api/glof/outlook (national, ?lake=), the map popup, the report\'s glacial-lake page; server/api/glof.mjs triggerOutlook; outlook.mjs keeps tx/tn/pr/sn per member for lake units',
      caveat: 'a trigger outlook, not a failure forecast: no outburst in Pakistan has been used to calibrate the melt, rain or growth thresholds, the member agreement is a probability of the WEATHER (raw member fractions, uncalibrated), the 8–15 day window is an environment never a timing, the volume is an empirical scaling right to a factor of two, and the snow proxy stands in for a snow depth field that does not verify',
      action: 'nothing acts on it automatically; the class ladder that reaches the board is still H = S × (0.25 + 0.75·T) × R',
    },
    {
      id: 'landslide_threshold_backtest',
      label: 'The landslide intensity-duration curve against Pakistani events (v91.17.40)',
      measurand: 'the exceedance ratio of the Dahal & Hasegawa (2008) curve I = 73.90 D^-0.79 mm/h, D 1–24 h, on ERA5 hourly rain at the event point, on the days of the NASA Global Landslide Catalog events inside the tehsil polygons (2007–2017) against season-matched ordinary days at the same points',
      domain: '236 rain-triggered events with location within 25 km (73 in Pakistan-administered units, the rest in the disputed IIOJK polygon, scored for the physics and outside every national total); 1,888 control days for the hourly ratio, 229,910 for the daily totals',
      verified: true,
      sample: 'measured 2026-09-25 with events and controls scored on the SAME window (best of the three days around the day; v91.17.68, audit E4 — the 2026-09-23 run scored events over three days and controls over one, which inflated the AUC to 0.814): AUC 0.737 for the ratio, 0.725 for the 1-day total, 0.747 for 3 days, 0.702 for 7 days, 0.67 for API15. At a ratio of 0.3: 26% of event days (22% in Pakistan-administered units) and 6.0% of ordinary season days.',
      evidence: 'data/landslide-calibration.json (threshold table, by province and trigger); station-lake/scripts/landslide_backtest.py; station-lake/reports/landslide_scored.csv; /api/landslide/calibration',
      caveat: 'ERA5 is 0.25°, the catalogue dates carry ±1 day (the best of three days is taken) and locations 1–25 km; many Pakistani entries are road-cut failures on the Karakoram Highway where rain is a weak trigger. A quarter of event days crossing is a screen, not a forecast of failure. The curve was fitted on Nepal gauge rain; on gridded rain over Pakistan it never fired',
      action: 'the browser screen reads its anchor from the registry (landslide.gridAnchorRatio 0.3): a ratio of 0.3 on gridded rain is treated as the curve\'s 1.0 (62/100) before the terrain scaling',
    },
    {
      id: 'rain_intensity_scale',
      label: 'Storm-end rain intensity: gauge, forecast model and ERA5 at the PMD mountain gauges (v91.17.40)',
      measurand: 'the daily maximum D-hour mean rain intensity (D 1–24 h) from the gauge (10-minute increments), the best_match forecast and ERA5, on the same station hours',
      domain: '19 PMD mountain gauges trusted for rainfall, 104,664 station hours, 2025-09-01 to 2026-08-21',
      verified: true,
      sample: 'measured 2026-09-23: 1-hour 99th percentile gauge 5.9 mm/h, model 3.9, ERA5 2.7 (gauge/ERA5 2.19×, model/ERA5 1.44×); 24-hour: gauge 1.19, model 1.65, ERA5 1.42 mm/h (gauge/ERA5 0.84×). No source reached the published landslide curve on any day; the gauges reached 0.3 of it on 0.1% of days at 1 h',
      evidence: 'data/rain-intensity-scale.json; station-lake/scripts/rain_intensity_scale.py; /api/landslide/calibration (rainIntensityScale)',
      caveat: 'one year, dry Karakoram and Hindu Kush valleys, mostly summer; the model series is the forecast at 0–24 h lead. The model\'s storm end is 1.2–1.4× ERA5\'s, so an anchor measured on ERA5 is slightly the more sensitive on the model',
      action: 'justifies carrying the ERA5-measured anchor to the forecast model without a further factor',
    },
    {
      id: 'lithology_material',
      label: 'Lithology material class per tehsil from the 250 m map (v91.17.40)',
      measurand: 'shares of the 15 classes of the global lithology map (Hengl 2018, from the USGS Global Ecosystems map on GLiM) inside each tehsil polygon; a material class (crystalline / sedimentary / volcanic / unconsolidated) by the largest share',
      domain: '576 tehsils: 296 unconsolidated, 197 sedimentary, 74 crystalline, 9 volcanic',
      verified: false,
      sample: 'measured 2026-09-23: Murree metamorphics 66% (crystalline), Abbottabad crystalline 83%, Muzaffarabad siliciclastic 97% (sedimentary), Khuzdar carbonate 66% (sedimentary), Lahore City unconsolidated 99%',
      evidence: 'data/lithology-tehsil.json; station-lake/scripts/lithology.py; /api/terrain/lithology',
      caveat: 'a 250 m thematic map generalised from 1:1–5 M geology; a tehsil share is a mix and the dominant class can hide the unit that fails. Not a susceptibility map and not verified against any failure inventory',
      action: 'the landslide screen\'s transferability caveat reads the material instead of a district-name list; only crystalline ground counts as the fitted material',
    },
    {
      id: 'hand_floodplain',
      label: 'Where the river spreads: HAND floodplain share per tehsil, the riverine where-factor (v91.17.39)',
      measurand: 'Height Above Nearest Drainage on the Copernicus GLO-90 DEM at 6 arc-seconds (about 180 m), pysheds D8; the share of each tehsil within 2, 5 and 10 m above the MAJOR drainage (over 30,000 upstream cells, about 970 km², the rivers GloFAS models) and, separately, above the LOCAL drainage (over 32 km²)',
      domain: '66–75 E, 23.5–35 N: Sindh, Punjab, the KP plains, eastern Balochistan; 510 tehsils, 9 of them without a major river in their drainage (coastal Karachi, delta creeks); GB, AJK and western Balochistan are outside the domain and keep factor 1',
      verified: false,
      sample: 'measured 2026-09-22: 64 tehsils have over 30% of their area within 2 m of a major river. Lahore City 55% within 5 m (factor 1.0), Alipur 42% (1.0), Rohri 68% (1.0), Jati 90% (1.0); Gujar Khan 1% (0.32). Before this the whole of a gauged district carried one riverine score',
      evidence: 'data/hand-tehsil.json; station-lake/scripts/hand.py; /api/flood/hand (national table, ?unit= per tehsil); the browser riverine pathway prints the factor in scoreBasis',
      caveat: 'HAND is where water spreads relative to the nearest channel: not a depth, not a probability, not a levee map (embankments, canals and the barrages are below the grid). The factor (floor 0.3, full at half the unit within reach) is a screening constant; calibration against Sentinel-1 flood extents of 2022 and 2025 has not been run, so the bands are unverified against any observed flood',
      action: 'riverine pathway score × factor per tehsil; NIGRAAN_HAND=0 withholds it',
    },
    {
      id: 'climatology_basis',
      label: 'Mountain climatology on the basis of the value it is compared with (v91.17.38)',
      measurand: 'the offset between the ERA5 climatological percentile at a mountain tehsil and the served value it is compared with: (obs − ERA5) on the daily maximum for tx90/tn90 (the served day is station-corrected), (model − ERA5) on the daily minimum for tn10 (the served minimum is the raw model)',
      domain: 'the MOS box, units at 1,000 m and above (48 tehsils today); height band of the served height by month, regional month fallback',
      verified: true,
      sample: 'leave-one-station-out over 10,316 station days at 45 PMD mountain stations [measured]: ERA5 daily maximum bias −4.85 °C, MAE 5.28 → −0.08 °C, MAE 3.28 after the offset. Regional daytime offset +5.4 °C in January, +0.66 °C in September; the night (model − ERA5) term is −0.2 to −0.4 °C',
      evidence: 'data/climatology-bias.json; station-lake/scripts/clim_bias.py; /api/climatology/thresholds prints basisShiftC per unit and the held-out figures',
      caveat: 'a one-year offset applied to a 30-year statistic, constant per band and month; the ensemble outlook keeps the raw percentiles because its members are uncorrected (it moves them onto the IFS basis itself)',
      action: 'a warm anomaly in a valley is measured against a normal on the same basis as the served value; NIGRAAN_CLIM_BIAS=0 turns it off',
    },
    {
      id: 'drought_index_domain',
      label: 'Where the standardised drought indices are defined (SPI-30/90, SPEI-30/90, root-zone percentile; v91.17.36)',
      measurand: 'the climate in which an SPI or SPEI value can be read as a drought anomaly at all',
      domain: 'refused where the window\'s 1991-2020 fitted climatological mean is under 10 mm (September: 18 tehsils on the 90-day window, 36 on the 30-day, all in the western arid belt); the ERA5 root-zone percentile is refused where the seasonal record is a tied block wider than 20 percentile points (5 tehsils)',
      verified: true,
      sample: 'measured 2026-09-22: Chagai\'s September 90-day baseline is a gamma of shape 0.136 and scale 22.3 mm (mean 3 mm); ERA5 gave 0.0 mm for the 91 days to 16 September and for the same window of 2025; before the mask SPI clamped to -3, SPEI fell below its fitted support, the soil percentile read 0 against a baseline that is 0 to the 20th percentile, and the composite reached 100 (Act)',
      evidence: 'data/drought-national.json (arid: true on the value, with the climatological mean); climatology.mjs ARID_MM and soilPercentile',
      caveat: 'the mask is a definition boundary, not a verification: no station rainfall in Balochistan has been compared with ERA5 here (19 of 46 PMD gauges are trusted for rainfall, none in the Chagai basin). Punjab\'s 2026 signal stands on ERA5 alone until IMERG has 30 days: Gujranwala 331 mm for the 90 days to 16 September against 621, 510, 683 and 753 mm in 2022-2025.',
      action: 'arid units read "index not defined" on every surface and carry no drought class; the priority board cannot rank them on drought.',
    },
  ],

  thresholds: [
    { id: 'tx40', label: 'Maximum ≥ 40 °C', verified: true,
      results: [
        { site: 'Multan', observedDays: 191, modelDays: 233, detection: 0.92, falseAlarms: 0.24 },
        { site: 'Lahore', observedDays: 108, modelDays: 91, detection: 0.79, falseAlarms: 0.07 },
        { site: 'Karachi', observedDays: 27, modelDays: 24, detection: 0.48, falseAlarms: 0.46 },
      ],
      action: 'defensible inland. Not run within 60 km of the coast, where coastal humid heat on apparent temperature replaces it.' },
    { id: 'tx45', label: 'Maximum ≥ 45 °C', verified: true,
      results: [
        { site: 'Multan', observedDays: 8, modelDays: 46, detection: 1.00, falseAlarms: 0.83 },
        { site: 'Lahore', observedDays: 13, modelDays: 5, detection: 0.38, falseAlarms: 0.00 },
      ],
      action: 'UNCALIBRATED. Over-calls six to one in one city and misses eight of thirteen in the other. Published as a share of members with this line attached; never as a warning. A tail mapping was fitted and NOT deployed: on held-out days it swung both ways (Lahore detection 0.33 → 1.00 but false alarms 0.00 → 0.73; Multan detection 1.00 → 0.67) on one to three qualifying days per city, which is not a tail.' },
    { id: 'tn0', label: 'Frost, minimum ≤ 0 °C below 2,000 m', verified: true,
      sample: '10,205 station-days',
      results: [{ site: 'mountain cohort', raw: { detection: 0.99, falseAlarms: 0.29 }, corrected: { detection: 0.90, falseAlarms: 0.14 } }],
      action: 'threshold unchanged, and that is a measured decision: a search from −3 to +3 °C on the corrected field puts best skill (CSI 0.79) flat between −0.5 and +1.5 °C. The over-warning was the temperature error, not the threshold.' },
    { id: 'tn-5', label: 'Severe cold, minimum ≤ −5 °C', verified: true,
      results: [{ site: 'mountain cohort', raw: { detection: 1.00, falseAlarms: 0.52 }, corrected: { detection: 0.86, falseAlarms: 0.28 } }],
      action: 'served on the corrected field' },
    { id: 'gu60', label: 'Gusts ≥ 60 km/h', verified: true,
      results: [{ site: 'mountain cohort', falseAlarms_at40kmh: 0.96 }],
      action: 'WITHDRAWN above 1,500 m' },
    { id: 'coastalHeat', label: 'Coastal humid heat, apparent temperature ≥ 40 °C for 2+ days', verified: false,
      action: 'SCREENING ONLY. Introduced because the dry-bulb rule fails on the coast; no coastal apparent-temperature verification exists yet, because the PMD Karachi export carries no humidity column usable for it.' },
    { id: 'rainOnSnow', label: 'Rain on snow above 1,500 m', verified: false,
      sample: '88 station-days at 14 stations in the archive, peaking in March',
      result: 'v91.17.4 corrected a unit error in the rule that detects it. snowfall_sum is centimetres of snow and precipitation_sum is millimetres of water; the rule divided by 10 where the provider\u2019s own ratio is 0.7. Measured on ERA5 at Skardu 2020\u20132024 over 238 days the provider recorded with zero rain, the old divisor raised this alarm on 99 of them (42 %) and the corrected divisor on none.',
      action: 'SCREENING CLASS, not a calibrated probability. The compound is real in the station record; the ensemble rule that detects it has not been verified against it, and the false-alarm measurement above is a unit check, not a verification.' },
  ],

  withheld: [
    { id: 'tx45Tail', what: 'the 45 °C tail mapping', why: 'swings both ways on held-out days over one to three qualifying days per city' },
    { id: 'learnedCityModels', what: 'the learned per-city models', why: 'a gradient-boosted model on the provider daily fields gains 0.2–0.3 °C, and the gain does not survive distillation into a lookup table. Deploying it needs a Python scoring service, which this build does not have.' },
    { id: 'glofProbability', what: 'an operational GLOF probability', why: 'no event validation exists. Since v91.17.31 the lakes upstream of an asset are NAMED (PMD 2024 inventory, SUPARCO list and bulletins) and screened by tier and latest satellite area; that is a screening class, not a probability of outburst.' },
    { id: 'cycloneClass', what: 'an operational cyclone class', why: 'no live track feed is wired. Standing coastal exposure only.' },
  ],
};

/* v91.17.36 · model ranking. Which of the provider's eleven models is closest to the
   PMD stations, per region, variable and lead, from the previous-runs archive
   (station-lake/scripts/rank_models.py -> data/model-ranking.json). Read at request
   time so a re-run of the ranking updates the sheet without a code edit. The learned
   multi-model blend (train_blend.py -> data/model-blend.json) is reported beside it
   as a candidate that is NOT applied: see `deployed`. */
function readJson(dataDir, name) {
  try { const f = join(dataDir, name); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; } catch (_) { return null; }
}
/* v91.17.37 · A · the Sentinel-2 lake monitor, read live like the ranking */
function lakeMonitorEntry(dataDir, app) {
  /* v91.17.70 · the customer register is the open one (Hi-MAG outlines); growth is the in-outline change against the lake's own reads (CHANGES_glof.md)
     v91.17.71 · the entry follows the register the GLOF module serves (its status().register): the full inventory when
     station data is used, credited generically; the open one otherwise */
  let mode = null; try { mode = app && app.glof && app.glof.status ? app.glof.status().register : null; } catch (_) { mode = null; }
  const full = mode ? mode !== 'open' : internalNames();
  const file = full ? 'glof-lakes-live.json' : 'glof-lakes-live-open.json';
  const V = readJson(dataDir, file);
  const base = { id: 'glacial_lake_area_s2', label: 'Glacial-lake water area from Sentinel-2 (our own measurement, monthly)',
    measurand: 'the water area of every mapped glacial-lake outline (' + (full ? label('lakeInventory') : 'Hi-MAG, CC BY 4.0') + ') on the latest clear Sentinel-2 L2A scenes (10 m), and its change against the lake\'s own earlier reads',
    verified: false,
    caveat: 'not verified against a field survey yet. Cast shadow is excluded (reads low, never high); ice reads as snow and the lake is not measured; change is counted inside the outline, so growth past the outline is capped. A run is refused unless reference lakes pass the radiometry pre-flight.',
    action: 'a lake growing on two dates by more than the same-day two-tile p90 is a Watch precursor within reach; a lake draining on two dates by more than max(2 x p90, 30 %) is an observed signal (Act within reach). The date is printed with every number.' };
  if (!V) return { ...base, sample: 'not run: data/' + file + ' absent', domain: 'the glacial-lake belt (Chitral, Swat, Kohistan, Gilgit-Baltistan, AJK)' };
  const lakes = Object.values(V.lakes || {}); const within = lakes.filter(l => l.state === 'within' && l.ratio != null).map(l => l.ratio).sort((a, b) => a - b);
  const q = (p) => within.length ? within[Math.min(within.length - 1, Math.floor(p * within.length))] : null;
  return { ...base, sample: `${V.measured} of ${V.total} lakes measured, ${V.window[0]} to ${V.window[1]}, ${V.scenes} scenes; built ${V.built}`,
    domain: 'the glacial-lake belt; June-October only', method: V.method, methodVersion: V.methodVersion || null, states: V.states, counts: V.counts, changeCounts: V.changeCounts || null, changeRule: V.rules && V.rules.change || null, preflight: V.preflight ? { passed: V.preflight.passed, lakesRead: V.preflight.lakesRead, rule: V.preflight.rule } : null,
    consistency: within.length ? { lakesWithin: within.length, ratioToOutline: { p10: q(0.1), median: q(0.5), p90: q(0.9) }, note: 'ratio of our area to the mapped outline for lakes read as within' } : null,
    surge: V.surge, evidence: 'data/' + file + ' (per-lake scene id, date, valid share, method, series); reports/lake_monitor_<register>_<date>.csv in the station lake' };
}
/* v91.17.283.7 · THE LIVE VERIFICATION (scripts/agents/verify.mjs -> data/agents/verify/summary.json): yesterday's as-issued forecasts
   scored every morning against MACH, airport and AWS observations, kept in a 400-day ledger. Internal entry; the client heat sentence
   (A13: "caught 80-85 % ...") switches to these figures only through evidence.mjs, and only from 30 days with the interval stated. */
function liveVerificationEntry(dataDir) {
  const S = readJson(dataDir, 'agents/verify/summary.json');
  const base = { id: 'live_verification', label: 'Live verification of the issued forecasts (daily, the verification agent)', verified: !!(S && S.ready),
    measurand: 'forecast minus observed for the temperature now, the daily maximum and the night minimum, humidity, wind and the day\u2019s rain of each issued forecast (lead days 0-3), at MACH, airport, synoptic and AWS stations; heat level hits and false alarms against the level of the hourly shade UTCI measured at the synoptic and airport stations (10 m wind; v91.17.283.8 HEATSKILL: MACH heat is scored apart, its observed humidity reads high); the share of hours inside the issued 90 % range',
    method: 'MAE and bias, POD and FAR, coverage; 95 % day-block bootstrap intervals; drift: the last 7 days against 7-day values bootstrapped from the 30 days before, Benjamini-Hochberg at 5 %',
    evidence: 'data/agents/verify/ledger.jsonl (400 days) and summary.json' };
  if (!S || !S.ready) return [{ ...base, sample: 'not run yet: data/agents/verify/summary.json absent (the agent back-fills 30 days at its first run)' }];
  const all = (S.table || []).filter((r) => r.zone === 'all' && r.n);
  return [{ ...base, sample: S.window ? S.window.from + ' to ' + S.window.to + ': ' + S.window.days + ' days with matched observations (ledger ' + S.window.ledgerDays + ' days)' : null,
    byLead: all.map((r) => ({ var: r.var, lead: r.lead, n: r.n, mae: r.mae, maeCi: r.maeCi, bias: r.bias, biasCi: r.biasCi })), heat: S.heat || null, rain: S.rain ? S.rain.all : null, coverage90: S.coverage90 || null,
    drift: (S.drift || []).map((d) => d.text), clientLine: S.client ? { switched: !!S.client.eligible, days: S.client.days, need: S.client.need, why: S.client.why } : null }];
}
function modelRankingEntry(dataDir) {
  const R = readJson(dataDir, 'model-ranking.json');
  const B = readJson(dataDir, 'model-blend.json');
  const base = {
    id: 'model_ranking',
    label: 'Which forecast model is closest to the PMD stations (per region, variable and lead)',
    measurand: 'the day-1 to day-3 error of each of the provider\'s models at the station points, from what each model said N days ahead (previous-runs archive), against QC-passed PMD observations',
    verified: !!R,
    deployed: 'the sweep still requests the provider\'s best_match blend; no single model has been switched in on this ranking (one year, no confidence intervals, and the winner differs by variable, region and lead)',
  };
  if (!R) return { ...base, sample: 'not run: data/model-ranking.json absent', action: 'run station-lake/scripts/rank_models.py --stations all' };
  const best = {};
  for (const [region, vars] of Object.entries(R.ranking || {})) {
    best[region] = {};
    for (const [v, mets] of Object.entries(vars)) {
      for (const [met, leads] of Object.entries(mets)) {
        for (const [lead, rows] of Object.entries(leads)) {
          if (!rows || !rows.length) continue;
          const byMae = [...rows].sort((a, b) => a.mae - b.mae);
          const top = byMae[0];
          const ifs = rows.find((r) => r.model === 'ecmwf_ifs025');
          /* rain: the MAE winner is the driest model (it scores on the dry days); the model that
             DETECTS rain days is ranked on (1 - POD) + FAR at 1 mm and reported beside it */
          const occ = top.pod_1mm != null ? [...rows].filter((r) => r.pod_1mm != null).sort((a, b) => ((1 - a.pod_1mm) + a.far_1mm) - ((1 - b.pod_1mm) + b.far_1mm))[0] : null;
          best[region][`${v}|${met}|${lead}`] = {
            best: top.model, mae: top.mae, bias: top.bias, n: top.n, stations: top.stations,
            ...(top.pod_1mm != null ? { pod_1mm: top.pod_1mm, far_1mm: top.far_1mm,
              bestOccurrence: { model: occ.model, pod_1mm: occ.pod_1mm, far_1mm: occ.far_1mm, mae: occ.mae, bias: occ.bias },
              readRain: 'lowest MAE is the driest model; bestOccurrence is the one that catches rain days' } : {}),
            ecmwf_ifs025_mae: ifs ? ifs.mae : null,
            spread_mae: [byMae[0].mae, byMae[byMae.length - 1].mae],
          };
        }
      }
    }
  }
  const blend = B ? {
    status: B.status, variable: B.variable, stations: B.stations, split: B.split,
    heldOut: (B.metrics || []).filter((m) => m.split === 'leave one station out').map((m) => ({ region: m.region, lead: m.lead, candidate: m.candidate, mae_c: m.mae_c, bias_c: m.bias_c, n: m.n })),
    weights: B.weights, caveats: B.caveats,
  } : null;
  return {
    ...base,
    sample: `${R.stationCount} stations, ${R.window[0]} to ${R.window[1]}, ${R.models.length} models, leads ${R.leads.join('/')}; built ${R.built}`,
    reference: R.reference, method: R.method, caveat: (R.caveats || []).join('; '),
    result: best,
    reading: 'mae is the station-weighted mean absolute error of the model at the stations (°C, mm/day or km/h); spread_mae is the best and worst model on that row; ecmwf_ifs025_mae is the ECMWF figure for comparison. Two models with identical figures are the same global fallback.',
    blend,
    action: 'informs the model choice for the next serving change; the sheet re-reads data/model-ranking.json on every request, so a fresh ranking updates this entry without a build',
  };
}

/* v91.17.44 · four meteorological checks on the station lake (station-lake/scripts/met_corrections.py); the sheet re-reads
   data/met-corrections.json on every request. Measured; only what the action line says is applied. */
function metEntries(dataDir) {
  const M = readJson(dataDir, 'met-corrections.json'); if (!M) return [];
  const out = []; const g = M.gust, d = M.dewpoint, rr = M.rainday, f = M.freezing;
  if (g && g.measured) out.push({
    id: 'gust_mountain_masts', label: 'Wind gusts at the PMD mountain masts: over-read and unresolved (v91.17.44)',
    measurand: 'model wind_gusts_10m against the hourly maximum of the station gust sensor at the 14 AWS that carry one',
    domain: `${g.stations} AWS, ${g.window[0]} to ${g.window[1]}, ${g.pairs} hourly pairs, 1,900–4,500 m`, verified: true,
    sample: `obs mean ${g.obsMeanKmh} km/h vs model ${g.modelMeanKmh} (ratio ${g.ratioObsModel}, bias +${g.biasKmh} km/h, MAE ${g.maeRawKmh}); hourly correlation per station ${Math.min(...g.perStation.map(x => x.corr))}–${Math.max(...g.perStation.map(x => x.corr))}; a 50 km/h gust day: POD ${g.day50.raw.pod}, FAR ${g.day50.raw.far}, frequency bias ${g.day50.raw.freqBias}; a LOSO line (obs = ${g.line.a} + ${g.line.b}·model) cuts MAE to ${g.maeLosoLineKmh} km/h and removes every 50 km/h day (POD 0)`,
    evidence: 'data/met-corrections.json (gust); station-lake/scripts/met_corrections.py', result: { byBand: g.byBand, day50: g.day50, line: g.line },
    caveat: g.caveat + ' The model gust is a grid-cell free-air gust; the mast gust is sheltered by the valley. The frequency of 50 km/h days is right and their timing is not, so a scaling that fits the mean destroys the extremes.',
    action: 'not applied: the served gust stays the model gust. Wind screening in the mountain tehsils is labelled unresolved (a right count of windy days, the wrong days); an asset limit on gusts at a mountain mast needs its own sensor',
  });
  if (d && d.measured) out.push({
    id: 'dew_point_mountain', label: 'Dew point at the mountain stations: the model is drier than the station by 1–2 °C (v91.17.44)',
    measurand: 'model dew_point_2m against the dew point computed from the station temperature and humidity (Magnus)',
    domain: `${d.stations} stations, ${d.pairs} hourly pairs`, verified: true,
    sample: `bias ${d.biasC} °C, MAE raw ${d.maeRawC} °C → ${d.maeLosoC} °C with a band/month/day-night offset table fitted leave-one-station-out; ` + d.byBand.map(b => `${b.band}: bias ${b.biasC}, MAE ${b.maeRawC}→${b.maeLosoC}`).join('; '),
    evidence: 'data/met-corrections.json (dewpoint.offsetTable); station-lake/scripts/met_corrections.py', result: { byBand: d.byBand },
    caveat: d.caveat, action: 'table served, not yet applied: the served dew point is the model dew point; the wet-bulb and fog terms that read it inherit the −1 to −2 °C dryness in the mountains (a wet-bulb read 0.5–1 °C low). Application follows once the corrected temperature and humidity pair is verified with it',
  });
  if (rr && rr.measured) out.push({
    id: 'rain_day_reliability', label: 'Rain-day reliability at the trusted mountain gauges (v91.17.44)',
    measurand: 'a rain day (≥ 1 mm, ≥ 10 mm) at the gauge against the model daily precipitation at the station', domain: `${rr.stations} trusted gauges, ${rr.stationDays} station-days`, verified: true,
    sample: `all: 1 mm POD ${rr.all.rain1.pod}, FAR ${rr.all.rain1.far}, frequency bias ${rr.all.rain1.freqBias}, ETS ${rr.all.rain1.ets}; 10 mm POD ${rr.all.rain10.pod}, FAR ${rr.all.rain10.far}, bias ${rr.all.rain10.freqBias}; model/obs total ${rr.all.totalRatioModelObs}; the model amount that matches the observed 1 mm rain-day frequency is ${rr.all.matchedModelThreshold1mm} mm (` + Object.entries(rr.bySeason).map(([k, v]) => `${k} ${v.matchedModelThreshold1mm} mm, ETS ${v.rain1.ets}`).join(', ') + ')',
    evidence: 'data/met-corrections.json (rainday); station-lake/scripts/met_corrections.py', result: { bySeason: rr.bySeason, byBand: rr.byBand },
    caveat: rr.caveat + ' DJF is not a model verdict: the gauges under-catch snow, so the winter frequency bias of 2.5 is partly the gauge.',
    action: 'read a mountain "rain day" from the model at 2 mm rather than 1 mm in the warm seasons; printed beside the rain products; the ensemble pr10/pr25 chances are unchanged',
  });
  if (f && f.measured) out.push({
    id: 'freezing_level_network', label: 'Freezing level against the network 0 °C height (v91.17.44)',
    measurand: 'model freezing_level_height against the height where a linear fit of station temperature on elevation crosses 0 °C, per hour', domain: `${f.hours} hours with ≥ 6 stations straddling 0 °C`, verified: true,
    sample: `bias +${f.biasM} m, MAE ${f.maeM} m (p10 ${f.p10ErrM}, p90 ${f.p90ErrM}); ` + Object.entries(f.bySeason).map(([k, v]) => `${k}: bias ${v.biasM} m, MAE ${v.maeM} m (${v.hours} h)`).join('; ') + `; mean fitted lapse ${f.meanFittedLapseCPerKm} °C/km`,
    evidence: 'data/met-corrections.json (freezing); station-lake/scripts/met_corrections.py', result: { bySeason: f.bySeason },
    caveat: f.caveat + ' The winter figure (+549 m) is mostly the valley cold pool: the stations sit in the pooled air, so their fitted 0 °C height is below the free-air one the model reports.',
    action: 'the GLOF trigger outlook reads the freezing level above the lake with a ±300 m uncertainty in the melt season (MAM–SON MAE 250–290 m); nothing else changes',
  });
  return out;
}

/* v91.17.46 · the level-anomaly prototype on the PMD gauges (station-lake/scripts/level_anomaly.py) */
function levelAnomalyEntry(dataDir) {
  const A = readJson(dataDir, 'level-anomaly.json'); if (!A) return [];
  const top = (A.top || []).slice(0, 6).map(e => `${e.station} ${e.type} ${String(e.start).slice(0, 16)} +${e.riseM} m (${e.signature})`).join('; ');
  return [{
    id: 'level_anomaly_prototype', label: 'Level-anomaly detector on the PMD river and lake gauges: prototype, run over the archive (v91.17.46)',
    measurand: 'surges (river gauges and loggers) and drainages (loggers) against a diurnal baseline: residual over 4 robust scales with a 60-min rise of at least 0.20 m held for 30 min; signatures RAIN / MELT / DRY-NIGHT from the model rain and the hour',
    domain: `${A.gauges} gauges, ${A.usableGauges} usable in the armed season (${A.armedSeason}), ${A.gaugeDays} gauge-days`, verified: false,
    sample: `${A.surges} surges and ${A.drainages} drainages found (${A.surgesPerGaugeYear} surges per gauge-year; ${A.implausibleDropped} implausible sensor excursions dropped); signatures ${JSON.stringify(A.bySignature)}; largest: ${top}`,
    evidence: 'data/level-anomaly.json; station-lake/reports/level_anomalies.csv; station-lake/scripts/level_anomaly.py', result: { bySignature: A.bySignature, surgesPerGaugeYear: A.surgesPerGaugeYear, usableGauges: A.usableGauges, top: (A.top || []).slice(0, 12) },
    caveat: A.calibration + '. Forty-one of the 96 gauges are unusable in the armed season (over half their samples fail the plausibility gate: frozen, fouled or dry loggers). The DRY-NIGHT rate is what a live alarm would ring on ordinary nights',
    action: 'nothing is armed: there is no live PMD feed in this build and no confirmed outburst to calibrate against. The candidate table is for the operator to confirm or reject event by event; a confirmed list turns this into a scored detector',
  }];
}

/* v91.17.49 · HAND and TWI against the UNOSAT flood extents (station-lake/scripts/flood_extent_calibration.py) */
function floodExtentEntry(dataDir) {
  const C = readJson(dataDir, 'flood-extent-calibration.json'); if (!C || !C.sets) return [];
  const hi = C.sets.hi2022 || {}, vi = C.sets.viirs2022 || {}, mo = C.sets.modis2010 || {};
  const rates = (x) => x && x.bandRates ? Object.entries(x.bandRates).map(([k, v]) => `${k} ${Math.round(1000 * v.rate) / 10}%`).join(', ') : '—';
  const twi = (x) => x && x.twiRates ? Object.entries(x.twiRates).map(([k, v]) => `${k} ${Math.round(1000 * v.rate) / 10}%`).join(', ') : '—';
  return [{
    id: 'hand_flood_extent_calibration', label: 'HAND bands and TWI against the observed 2022 and 2010 flood extents (v91.17.49)',
    measurand: 'the share of each HAND band (major drainage) and TWI class under satellite-detected flood water: UNOSAT Sentinel-1/Landsat-8/Sentinel-2 2022 inside their analysis extents, VIIRS 375 m 2022 nationally, Terra/MODIS 2010 nationally; per tehsil, the flooded share against the floodplain share',
    domain: `high-resolution 2022: ${hi.domainKm2 ? hi.domainKm2.toLocaleString() : '?'} km² (Sindh, south Punjab, east Balochistan); VIIRS and MODIS: the whole HAND domain`, verified: true,
    sample: `2022 high-resolution: ${rates(hi)}; TWI ${twi(hi)}; tehsils n=${hi.tehsils ? hi.tehsils.n : '?'} Spearman ${hi.tehsils ? hi.tehsils.spearmanFloodplainShare : '?'}. VIIRS 2022: ${rates(vi)}; tehsils n=${vi.tehsils ? vi.tehsils.n : '?'} Spearman ${vi.tehsils ? vi.tehsils.spearmanFloodplainShare : '?'} (NNLS re-weighting ${vi.tehsils ? vi.tehsils.spearmanNnls : '?'}). MODIS 2010: ${rates(mo)}; Spearman ${mo.tehsils ? mo.tehsils.spearmanFloodplainShare : '?'}`,
    evidence: 'data/flood-extent-calibration.json; station-lake/reports/flood_extent_calibration.md; /api/flood/hand (factor.weights, calibration)', result: { bandWeights: C.bandWeights, fullShareFromData: C.fullShare },
    caveat: '2022 was a ponding flood in Sindh (rain on flat ground behind embankments), so the 5–20 m bands flooded more than a river flood alone would reach; the weights carry that year. The floor of the riverine factor is not identifiable from extents (a tehsil with no floodplain shows no water by construction). Within the flat Sindh domain the tehsil ranking is weak (Spearman 0.26): where everything is low, HAND no longer separates tehsils, only cells.',
    action: 'applied: band weights 1 / 0.85 / 0.66 / 0.36 (< 2, 2–5, 5–10, 10–20 m) in the riverine where-factor; the pluvial where is applied as an amplifier 1 + 0.3·min(1, share(TWI ≥ 10)/0.5); fullShare stays 0.5 (0.52 from the 2022 high-resolution set, 0.29 from VIIRS)',
  }];
}


/* v91.17.60 · the physical state engine: thermal (Liljegren WBGT, Tmrt, UTCI), curve-number runoff, FDH, dynamic pressure,
   snow load. Each carries its scientific status from the formula book. */
function stateEntries(dataDir) {
  const CN = readJson(dataDir, 'cn-tehsil.json'), BT = readJson(dataDir, 'cn-backtest.json'), HS = readJson(dataDir, 'hsg-tehsil.json'), FE = readJson(dataDir, 'flood-extent-calibration.json'), CT = readJson(dataDir, 'catchments.json'), MSK = readJson(dataDir, 'model-skill.json');
  const out = [{
    id: 'thermal_physical', label: 'Heat stress by established formulation: Liljegren WBGT, mean radiant temperature, UTCI (v91.17.60)',
    scientificStatus: 'Physical', measurand: 'WBGT (°C) from globe and natural wet-bulb temperatures solved from their energy balances; Tmrt (°C) from the radiation budget; UTCI (°C) and its official stress class',
    domain: 'any point, from the served hourly forecast (T, RH, surface pressure, 10 m wind, global / direct / DNI shortwave, cloud)', verified: true,
    sample: 'server/api/thermal.mjs ported from ECMWF thermofeel 2.3.0 (Apache-2.0); scripts/thermal-verify.mjs: 2,000 random cases, max |diff| 0.05 °C for WBGT and UTCI, wind 2 m scaling exact',
    evidence: 'GET /api/point part state (operator view: thermal.now / next72h WBGT, Tmrt, UTCI in sun and shade; server/api/state.mjs) and now.utciShadeC / now.utciSunC of the point state; audit/FORMULA_BOOK.md § Heat stress; Liljegren et al. 2008; Di Napoli et al. 2020; Bröde et al. 2012',
    result: { verifiedAgainst: 'thermofeel 2.3.0 reference implementation', maxAbsDiffC: 0.05, cases: 2000, tmrtLongwave: 'estimated (Prata 1996 emissivity, Crawford-Duchon cloud term); the provider gives no longwave' },
    caveat: 'the comparison verifies the port, not the forecast: the inputs are model fields at grid scale. Tmrt carries an estimated longwave and an assumed albedo of 0.20 and says so. The card\'s older wet-bulb proxy and heat index remain screening figures; the national work-exposure strip still uses the legacy WBGT shortcut until the v61 migration.',
    action: 'WBGT bands (ISO 7243 / ACGIH screening cuts) and UTCI classes on the comfort card and the sheet; no hazard class is changed by them yet.' },
  { id: 'curve_number_runoff', label: 'NRCS curve-number runoff per tehsil (v91.17.60)',
    scientificStatus: BT && BT.passed ? 'Empirical' : 'Screening', measurand: 'S = 25400/CN − 254 (mm), Ia = 0.2 S, Q = (P − Ia)² / (P + S − Ia) for the forecast 24 h and 72 h totals at antecedent condition II; CN_I / CN_III bounds; a wetness-interpolated CN flagged uncalibrated',
    domain: CN ? Object.keys(CN.units || {}).length + ' tehsils; ' + (CN.source && /GeoParquet/.test(CN.source) ? 'CN_II area-weighted from the client 10 m CN grid (ESRI/IO 2025 land cover × SoilGrids-texture HSG, TR-55 AMC II fair; 924,416 1-km cells; TR-55/SoilGrids estimate kept per unit for comparison)' : 'CN_II from ESA WorldCover shares × hydrologic soil group shares (SoilGrids texture, ' + (HS ? HS.status : 'HSG') + ') × TR-55') : 'not built', verified: !!(BT && BT.passed),
    sample: BT ? 'cn_backtest.py on the 2022 extents: high-resolution set n ' + BT.sets.hi2022.n + ', rho flooded share vs P72 ' + BT.sets.hi2022.rho.p72 + ', vs Q_II(P72) ' + BT.sets.hi2022.rho.q2_72 + ', vs HAND share ' + BT.sets.hi2022.rho.s_hand + '; VIIRS n ' + BT.sets.viirs2022.n + ': P72 ' + BT.sets.viirs2022.rho.p72 + ', Q_II ' + BT.sets.viirs2022.rho.q2_72 + ', HAND ' + BT.sets.viirs2022.rho.s_hand + ', HAND×P ' + BT.sets.viirs2022.rho.s_p + ', HAND×Q ' + BT.sets.viirs2022.rho.s_q2 : 'back-test not run',
    evidence: 'data/cn-tehsil.json; data/hsg-tehsil.json; data/cn-backtest.json; station-lake/reports/cn_backtest.md; /api/flood/runoff; /api/flood/wetness (curveNumber block)',
    result: { gatePassed: !!(BT && BT.passed), cnSource: CN && CN.source ? (/GeoParquet/.test(CN.source) ? 'grid 10 m' : 'TR-55 estimate') : null, cnBeatsRainOn: BT && BT.cn_beats_rain_sets ? BT.cn_beats_rain_sets : null, setsScored: BT && BT.sets ? Object.keys(BT.sets) : null, upstreamTermWins: BT ? !!BT.upstream_passed : null, verdict: BT ? (BT.passed ? 'CN ranks the 2022 flooded share better than rain alone: runoff may enter the flood class' : 'CN does not rank the 2022 flooded share better than rain alone (the event was riverine and ponded water on the Indus plain, a floodplain question HAND answers at rho 0.79); runoff is served as a screening quantity and does not drive the flood class') : null },
    caveat: 'CN is an event-storm model applied to forecast totals; HSG from texture only (no bedrock depth, no water table, no dual-group D case); impervious share = WorldCover 10 m built bounded by the Open Buildings footprint share, 1x-3x (cn.py v91.17.70; the 0.65 assumption is gone). The wetness-interpolated CN is NIGRAAN\'s own and uncalibrated.',
    action: 'served on the wetness record and /api/flood/runoff as Natural / current retention (mm) and runoff potential (Q/P); the flood class keeps its current inputs (formula book gate).' },
  { id: 'forecast_pool_rule', label: 'The forecast pool: family-weighted consensus, equal-system ensembles, agreement and confidence kept apart (v91.17.61)', scientificStatus: 'Probabilistic (ensemble probabilities), Empirical (pooling rule)',
    measurand: 'consensus = weighted median of nine deterministic models with one vote per forecast family (ECMWF: IFS + AIFS; NOAA: GFS + AIGFS; ICON, GEM, UKMO, ARPEGE, JMA); rain probability = P10/P50/P90 and P(R > 1, 5, 10, 25, 50, 100 mm) from ECMWF ENS (51) and WeatherNext 2 (64) with each system weighted 0.5; agreement = P90 − P10 dispersion class, physical and AI reported separately; confidence = the lead-time regime',
    domain: 'any point; MET Norway (ECMWF-driven outside the Nordic nest) and HARMONIE (no Pakistan domain) are shown but do not vote; AROME does not cover Pakistan so meteofrance_seamless is ARPEGE here', verified: true,
    sample: 'Islamabad, 24 Sep 2026 00 UTC: consensus 24.2 °C (P10 19.2, P90 25.8), 7 families / 9 models; rain tomorrow P50 0.4 mm, P(>10 mm) 1 %; ECMWF ENS median 0.6, WN2 0.2 mm. Registry, mountain JJA day 1 temperature (25 stations): ICON 2.63 °C MAE best, GEM 6.90 worst; ICON weight 0.30, GEM 0.04',
    evidence: '/api/pool/point; /api/pool/rule; server/api/pool.mjs; client AGN.uncertainty (family-weighted stat) and AGN.ens (equal-system poolDays); build/pool_ui.html',
    result: { families: 7, votingModels: 9, notPooled: ['metno_seamless', 'knmi_seamless'], ensembleWeighting: 'equal system (0.5/51, 0.5/64)', memberCountPoolKept: 'as memberWeighted (diagnostic)', clientMedian: 'registry-weighted where the zone|season|lead|variable cell carries weights for >= 3 models present, family vote otherwise (v91.17.64; stat() names the cell and its station count)', skillWeights: MSK ? 'model-skill registry: ' + MSK.cellsWithWeights + ' of ' + (MSK.cellsWithWeights + MSK.cellsWithout) + ' zone|season|lead|variable cells carry weights (window ' + (MSK.window || []).join('..') + ', ' + MSK.rule + '); equal per family elsewhere' : 'none yet: equal per family until the Pakistan model-skill registry exists', skillRegistryCaveat: MSK ? 'one year of data, so each season is one season; the plains cohort is three city AWS plus the eight METAR airports (temperature only); mountain MAE is partly a siting fact; most family weights sit at the 2× clamp because the loss gaps are large relative to the best model; scored against station observations only (Tier A) — the IFS-analysis verification is the grade gate, never a weight source' : null },
    caveat: 'equal family weights are a placeholder, not a finding; WeatherNext 2 is initialised from ECMWF HRES so the two ensembles are distinct architectures with a shared initial state, not independent systems; the per-model temperatures in the pool are raw model values (the served correction is on the single served forecast)',
    action: 'four rows under the model list (Consensus, Probability, Agreement, Confidence); the hazard engine still consumes the served forecast and the ensemble exceedance it already had; LEARN_NIGRAAN.bat skill rebuilds the registry after each rank run' },
  ...(FE && FE.sets && FE.sets.pk2025 ? [{ id: 'flood_extent_events', label: 'Observed flood extents behind the flood calibration: 2010, 2014, 2022, 2025 (v91.17.60)', scientificStatus: 'Empirical',
    measurand: 'flooded share per tehsil (union of every water class in the extent) against the HAND floodplain share, per event; the same 360 m HAND grid for all events',
    domain: ['pk2010', 'pk2014', 'pk2022', 'pk2025'].map(k => k.slice(2) + ': ' + (FE.sets[k].floodedKm2 || 0).toLocaleString() + ' km² flooded of ' + (FE.sets[k].domainKm2 || 0).toLocaleString() + ' km² domain').join('; ') + ' — client vector extents beside the UNOSAT 2022 and MODIS 2010 sets', verified: true,
    sample: 'Spearman flooded share vs HAND floodplain share (458 tehsils): ' + ['pk2010', 'pk2014', 'pk2022', 'pk2025'].map(k => k.slice(2) + ' ' + ((FE.sets[k].tehsils || {}).spearmanFloodplainShare ?? '—')).join(', ') + '; UNOSAT VIIRS 2022 0.794',
    evidence: 'data/flood-extent-calibration.json (sets pk2010..pk2025); station-lake/reports/flood_extent_calibration.md; station-lake/reports/cn_backtest.md; source D:\\Data_9_23\\Flood_Extents',
    result: { events: ['pk2010', 'pk2014', 'pk2022', 'pk2025'].map(k => ({ event: k.slice(2), floodedKm2: FE.sets[k].floodedKm2, rhoHand: (FE.sets[k].tehsils || {}).spearmanFloodplainShare ?? null, rhoNnls: (FE.sets[k].tehsils || {}).spearmanNnls ?? null })) },
    caveat: 'the extents carry no date within the season and no water class; 2025 is 12,880 polygons of the Punjab river floods (Sutlej, Ravi, Chenab), where the water came from upstream and from releases the rain record does not see', action: 'four more events for the HAND weights and the CN / upstream back-test; the served HAND weights still come from the high-resolution 2022 set' }] : []),
  ...(CT && CT.catchments ? [{ id: 'catchment_tree', label: 'Catchment tree for the flood outlook: which catchment each tehsil drains and what lies upstream (v91.17.60)', scientificStatus: 'Physical (topology), Screening (use)',
    measurand: 'per tehsil: catchment shares by equal-area intersection, the primary catchment, its upstream set (NextDownID chain) and upstream area; per catchment: area, downstream id, representative point',
    domain: Object.keys(CT.catchments).length + ' catchments, ' + Object.keys(CT.tehsils || {}).length + ' tehsils assigned; the Indus outlet gathers ' + ((CT.catchments['269'] || {}).upstreamAreaKm2 || 0).toLocaleString() + ' km² upstream', verified: true,
    sample: 'back-test (cn_backtest.py): s × V_up (HAND share × upstream runoff volume) rho 0.378 on the high-resolution 2022 set vs 0.261 for the HAND share alone, and 0.507 vs 0.449 on 2025; not better on 2010, 2014 or the VIIRS 2022 set',
    evidence: 'data/catchments.json; station-lake/reports/catchments.md; /api/flood/catchment; source D:\\Data_9_23\\catchment',
    result: { catchments: Object.keys(CT.catchments).length, outlets: Object.values(CT.catchments).filter(c => c.downstream == null).length, upstreamTermWins: BT ? !!BT.upstream_passed : null },
    caveat: 'the tree stops at the border: Indian Punjab and the Kabul basin are outside the file, so the upstream term is partial exactly where 2025 mattered most; catchment CN is the tehsil-share-weighted value, not a catchment aggregate', action: 'served on /api/flood/catchment as context (upstream area, ids); the flood class does not use the upstream term until the back-test majority rule passes' }] : []),
  { id: 'wind_load_screening', label: 'Dynamic wind pressure with air density from the forecast state (v91.17.60)', scientificStatus: 'Physical (q), Screening (class)',
    measurand: 'q = ½ρV² (kPa) with ρ = P_d/(R_d T) + P_v/(R_v T) from surface pressure, temperature and humidity; V = 10 m gust; maximum over 72 h; F = q·Cd·A or q/design pressure only when the caller supplies them', domain: 'any point', verified: true,
    sample: 'q at 20 m/s gust: 0.245 kPa at sea level (ρ 1.225), 0.19 kPa at Quetta in summer (ρ ≈ 0.95) — the 4,700 m domain is why ρ is not a constant', evidence: 'GET /api/point part state (operator view): wind.now / wind.next72h (server/api/state.mjs); audit/FORMULA_BOOK.md § Wind',
    result: { formula: 'exact', loadRatio: 'only with asset geometry or design pressure' }, caveat: 'wind load screening, not a structural check: height, exposure, terrain, pressure coefficients and dynamic response belong to the applicable standard', action: 'shown on the comfort card as pascals; the gust hazard class is unchanged' },
  { id: 'freezing_degree_hours', label: 'Freezing degree-hours below an asset threshold on the served temperature (v91.17.60)', scientificStatus: 'Physical',
    measurand: 'FDH_τ = Σ max(0, τ − T_served,t)·Δt over 72 h and 7 days, hours below τ', domain: 'any point; τ per asset (default 0 °C)', verified: true,
    sample: 'served temperature = MOS + elevation + all-hours rule (v59): valley daily-minimum MAE 6.03 → 2.40 °C, so the night hours FDH sums are the corrected ones', evidence: 'GET /api/point part state (operator view): freezing.fdh72 / fdh7d (server/api/state.mjs)',
    result: { formula: 'exact' }, caveat: 'τ is the asset\'s; 0 °C is a freeze-exposure default, not a design value', action: 'card and route; a limit on FDH can be registered per asset in a later release' },
  { id: 'snow_load_screening', label: 'Ground snow load (withheld since v91.17.68)', scientificStatus: 'Withheld',
    measurand: 'q_s = 0.00980665 × SWE_mm (kPa) would need a defensible SWE; the model snow depth (310 cm modelled against 36 cm observed, correlation −0.10) is not used, so no load is served', domain: 'none until a measured or verified SWE exists', verified: false,
    sample: 'no snow-pillow or SWE observation exists in the lake; the conversion is exact, the SWE is a model field with an assumed density', evidence: 'GET /api/point part state (operator view): snow (withheld; server/api/state.mjs)',
    result: { formula: 'exact', sweBasis: 'withheld: no defensible snow depth' }, caveat: 'roof load needs the shape, exposure, thermal and drift factors of the applicable standard; no uncalibrated lapse correction is applied to SWE (formula book v60)', action: 'ground snow load screening on the card; not a hazard class' }];
  return out;
}

/* v91.17.57 · the bias-reference register and the fleet: which observation networks feed which correction, and how */
function biasReferenceEntries(dataDir) {
  const R = readJson(dataDir, 'bias-references.json'); if (!R || !R.references) return [];
  const F = readJson(dataDir, 'mach-fleet-stations.json');
  return [{
    id: 'bias_reference_register', label: 'Observation networks behind the bias correction, and whether serving needs any of them live (v91.17.57)',
    measurand: 'for each reference network: owner, station count, access mode (live / archive / manual snapshot / not integrated) and which correction it feeds',
    domain: R.references.map((r) => r.name).join('; '), verified: true,
    sample: R.references.map((r) => `${r.id}: ${r.access}`).join(' · '),
    evidence: 'data/bias-references.json; /api/fleet/status; data/mos-table.json; station-lake/reports/pmd_ews_compare_2026-09-23.md; station-lake/reports/mach_fleet_compare_2026-09-23.md; station-lake/reports/isd_compare.md; station-lake/reports/mazu_portal_survey_2026-09-23.md',
    result: { offline: R.answer, operatingMode: R.operating_mode, fleetStations: F && F.stations ? F.stations.length : null, survey: R.survey || null },
    caveat: 'the MACH fleet is consumer-grade and roof-sited: 25 of 104 stations were usable on 23 Sep 2026 after the screen (mirrored records, imperial units, physics). The PMD portals are validation-by-snapshot only.',
    action: 'serving is offline-capable (static table); the fleet poll keeps a 10-minute observation stream in the lake; the plains fit is trained once six weeks of fleet pairs exist; the mountain table is refreshed yearly from a PMD bulk export',
  }, ...learnedCorrectionEntry(dataDir)];
}

/* v91.17.60 · the learned temperature correction as served: where, on what evidence, and the embargo that keeps the
   airport check out of sample (train_ml.py fits through fit_until; the station check window starts after it). */
function learnedCorrectionEntry(dataDir) {
  const M = readJson(dataDir, 'ml-mos.json'); if (!M || !M.model) return [];
  const H = M.holdout || {}; const A = H.airports_cross_year || {}; const sites = Array.isArray(M.ml_sites) ? M.ml_sites : [];
  return [{
    id: 'learned_temperature_correction', label: 'Learned 2 m temperature correction (gradient-boosted trees, evaluated in Node) and where it serves (v91.17.60)',
    measurand: 'obs minus model 2 m temperature (°C, added to the model) from the hour\'s model temperature, humidity, wind, time of day and year, site height, grid-minus-site height, position and network',
    domain: 'valley AWS entries where the seen-station hold-out beats the table; synop / airport entries where the cross-year test beats the raw forecast; and on its own at ' + (sites.map(x => x.id).join(', ') || 'no site'),
    verified: true, scientificStatus: 'Empirical',
    sample: 'airports fit ≤2025 scored Jan–Aug 2026: model ' + A.model + ' °C vs raw ' + A.raw + ' °C MAE, n ' + A.n + '; per site ' + Object.entries(A.by_station || {}).map(([k, v]) => k + ' ' + v.raw + '→' + v.model).join(', '),
    evidence: 'data/ml-mos.json; station-lake/reports/ml_fit.md; station-lake/scripts/train_ml.py; /api/mos/learned; /api/verification/grades (stationCheck.learnedModel)',
    result: { trees: M.model.n_trees, rows: M.rows, rowsAvailable: M.rows_available || null, fitUntil: M.fit_until || null, embargoDays: M.embargo_days ?? null, serve: M.serve || null, sites: sites.map(x => ({ id: x.id, raw2026: x.raw_2026, model2026: x.model_2026 })), holdout: H },
    caveat: 'the model is fitted only through fit_until (36-day embargo) so the airport check that gates grade A scores it out of sample; the unseen-mountain test says the height band stays there (model 2.78 vs 2.54 °C); a retrain re-judges every verdict',
    action: 'served on every /px temperature at the sites and entries listed; LEARN_NIGRAAN.bat ml retrains and reloads (PUT /api/mos/learned)',
  }];
}


/* v91.17.63 · the MACH fleet history paired with the forecast, once its coordinates arrived (24 Sep 2026). Tier B, diagnostic.
   Read at request time; the urban heat check is computed live against urbanheat.mjs through app.fleetHistory. */
function fleetHistoryEntry(dataDir, app) {
  const F = readJson(dataDir, 'fleet-history-skill.json'); if (!F || !F.cohort) return [];
  const c = F.cohort, r = c.rain || {}; const U = app && app.fleetHistory ? app.fleetHistory.uhiCheck() : null; const v = U && U.verdict;
  const isb = F.city && F.city.OPIS, khi = F.city && F.city.OPKC;
  return [{ id: 'fleet_history_verification', label: 'The MACH fleet record against the served point forecast: 36 stations, 2023-2026, plus the six live sheets (v91.17.63)', scientificStatus: 'Empirical (Tier B, diagnostic)',
    measurand: 'hourly fleet observation against the day-0 archived forecast, the day-1 and day-3 previous runs and ERA5 at the station point; local-day rain totals; fleet minus airport METAR by season and local hour at the airport-height (6.5 C/km)',
    domain: c.stations + ' stations (' + c.trusted + ' trusted for temperature, ' + r.gauges + ' for rain), ' + c.hours.toLocaleString() + ' paired hours, ' + F.window[0] + ' to ' + F.window[1] + '; Islamabad-Rawalpindi ' + (isb ? isb.stations.length : 0) + ' points, Karachi ' + (khi ? khi.stations.length : 0) + ', the rest single stations in Sindh, Punjab, KP and Balochistan', verified: true,
    sample: 'trusted cohort median: bias ' + c.bias + ' C, MAE ' + c.mae + ' C, RMSE ' + c.rmse + ' C at day 0 (day 1 ' + c.maeLead1 + ', day 3 ' + c.maeLead3 + ', ERA5 ' + c.maeEra5 + '); day bias ' + c.dayBias + ', night bias ' + c.nightBias + ' C (the forecast runs cold at night in the cities). Rain: forecast/observed total ratio ' + r.ratio + ', POD/FAR ' + r.pod1 + '/' + r.far1 + ' at 1 mm, ' + r.pod10 + '/' + r.far10 + ' at 10 mm. Urban heat check' + (v ? ': ' + v.stations + ' Islamabad-Rawalpindi points against the rural airport, model nocturnal maximum vs the observed fleet night maximum: Spearman ' + v.spearman + ', mean residual ' + v.meanResidualC + ' C (model ' + v.modelMeanMaxC + ' C, fleet ' + v.observedMeanMaxC + ' C); ' + v.reading + '; ' + v.magnitude : ': not scored'),
    evidence: 'data/fleet-history-skill.json; station-lake/reports/mach_history_skill.md and .csv; station-lake/scripts/mach_history_coords.py, mach_history_pair.py; /api/fleet/history; /api/fleet/uhi-check',
    result: { tier: 'B', stations: c.stations, trusted: c.trusted, hours: c.hours, maeC: c.mae, rmseC: c.rmse, nightBiasC: c.nightBias, rainGauges: r.gauges, rainRatio: r.ratio, pod10: r.pod10, far10: r.far10, uhiCheck: v ? { stations: v.stations, spearman: v.spearman, meanResidualC: v.meanResidualC, passed: v.passed } : null, feedsRegistryWeights: false, feedsGradeGate: false, cityNightOffsetC: isb ? isb.nightOffsetC : null },
    caveat: 'consumer sensors on roofs and walls: a 15 C spike screen and a 4 C MAE ceiling remove the worst, not the siting bias; the WU export drops solar and UV; the fleet-minus-airport offset at Karachi is urban minus urban (the airport is inside the city) and is not a heat-island measure; the manifest that names the Islamabad stations was corrected on 24 Sep 2026 (the bundle copy was shifted by one) and the choice rests on one offline station matching one truncated record',
    action: 'no registry weight, no grade gate. From v91.17.64 the city residual tables are served as the urban term (entry urban_fleet_term); LEARN_NIGRAAN.bat fleet rebuilds this sheet from D:\\External once the sheets and coordinates change.' }, urbanFleetEntry(F, app)];
}

/* v91.17.64 · the fleet urban term on the served temperature */
function urbanFleetEntry(F, app) {
  const U = app && app.fleetHistory && app.fleetHistory.ready() ? app.fleetHistory.urbanStatus() : null; if (!U || !U.cities) return null;
  const cs = Object.entries(U.cities); const isb = U.cities.OPIS, khi = U.cities.OPKC;
  const pass = cs.every(([, c]) => c.holdout && c.holdout.passed);
  return { id: 'urban_fleet_term', label: 'The urban term: the MACH fleet\'s season × hour residual served at built-up points in Islamabad-Rawalpindi and Karachi (v91.17.64)', scientificStatus: pass ? 'Empirical (Tier B, leave-one-station-out)' : 'Screening',
    measurand: 'median (forecast − fleet) by season and local hour over the trusted fleet stations of a city, added with reversed sign to the served hourly temperature, apparent temperature and daily extremes at built cells (≥ 5 % built surface) within ' + U.rule.reachKm + ' km of the city airport; where the airport (synop) correction is already on the point the fleet-minus-airport offset is added instead; scaled by the cell\'s heat-island potential relative to the fleet cohort median, clamped to [' + U.rule.scale.join(', ') + ']; nothing within ' + U.rule.airportExcludeKm + ' km of an airport reference',
    domain: cs.map(([ap, c]) => c.name + ' (' + c.stations + ' stations)').join(', ') + '; every other city serves the airport or raw forecast unchanged (fewer than ' + U.rule.minStations + ' fleet stations)', verified: pass,
    sample: cs.map(([ap, c]) => c.name + ': held-out station MAE ' + c.holdout.maeRaw + ' → ' + c.holdout.maeCorrected + ' °C, ' + Math.round(100 * c.holdout.improvedShare) + ' % of stations improved, night bias ' + c.holdout.nightBiasRaw + ' → ' + c.holdout.nightBiasCorrected + ' °C').join('; ') + '. Served at F-10 Islamabad on 24 Sep 2026: +0.6 to +1.7 °C over the raw forecast by hour',
    evidence: '/api/fleet/urban?lat&lon&elev; /px served vs __raw=1 at a built cell (agn_bias_correction.urban); data/fleet-history-skill.json city.residual and city.holdout; station-lake/reports/mach_history_skill.md',
    result: { cities: Object.fromEntries(cs.map(([ap, c]) => [ap, { name: c.name, stations: c.stations, maeRaw: c.holdout.maeRaw, maeCorrected: c.holdout.maeCorrected, improvedShare: c.holdout.improvedShare, nightBiasRaw: c.holdout.nightBiasRaw, nightBiasCorrected: c.holdout.nightBiasCorrected, passed: c.holdout.passed }])), tier: 'B', gradeGateUnchanged: true, airportExcludeKm: U.rule.airportExcludeKm, scale: U.rule.scale },
    caveat: 'the fleet is consumer sensors on roofs and walls: its residual mixes the true canopy-layer signal with siting warmth, and the served term inherits both; the hold-out is by station, not by year (the record is one climate period); the cell scaling leans on the heat-island model whose rank correlation with the fleet is 0.46; Karachi rests on six stations and its reference airport sits inside the city',
    action: 'served now at built cells in the two cities; the heat card names the term and the fleet check. Re-run LEARN_FLEET.bat after each fleet season; a city joins when it reaches ' + U.rule.minStations + ' trusted stations near its airport (Lahore, Peshawar, Sialkot have one each).' };
}

/* v91.17.64 · two independent records beside NIGRAAN's own: the documented GLOF catalogue and the GIRI susceptibility map */
function crossCheckEntries(dataDir) {
  const out = [];
  const E = readJson(dataDir, 'glof-events.json');
  if (E && E.national) {
    const n = E.national; const rep = (n.repeatLakes || []).slice(0, 5);
    out.push({ id: 'glof_documented_events', label: 'The documented outburst record joined to the lake register: HMAGLOFDB, ' + n.events + ' Pakistan events (v91.17.64)', scientificStatus: 'Empirical (catalogue)',
      measurand: 'every GLOF documented for Pakistan in the High Mountain Asia GLOF database (Steiner et al. 2023, CC BY 4.0; development copy quality-controlled to 2025-12-31), joined to the nearest register lake within 3 km of the database lake position',
      domain: n.events + ' events (' + n.withPosition + ' with a position), ' + E.source.eventsHMA + ' in High Mountain Asia; ' + n.matched + ' events on ' + n.lakesWithEvents + ' register lakes, ' + (E.unmatched || []).length + ' on no register lake (drained, outside the PMD inventory, or coarse)', verified: true,
      sample: 'by decade ' + Object.entries(n.byDecade || {}).filter(([k]) => Number(k) >= 1990).map(([k, v]) => k + 's ' + v).join(', ') + '; mechanism ' + Object.entries(n.byMechanism || {}).map(([k, v]) => k + ' ' + v).join(', ') + '; repeat lakes: ' + rep.map(r => r.lake + ' (' + (r.settlement || r.district) + ', ' + r.events + ' events, last ' + Math.max(...r.years) + ')').join('; '),
      evidence: 'data/glof-events.json; station-lake/reports/glof_events.md; /api/glof/events[?lake=]; /api/glof/lake?id= (documentedEvents)',
      result: { events: n.events, matched: n.matched, lakesWithEvents: n.lakesWithEvents, since2000: n.since2000, since2015: n.since2015, lives: n.lives, repeatLakes: rep.map(r => ({ lake: r.lake, events: r.events, last: Math.max(...r.years) })), tierChanged: false },
      caveat: 'the catalogue is what the literature recorded: pre-1950 events are mostly the Karakoram ice-dam floods with a valley-scale position; a lake matched at 2-3 km may be a neighbour; 104 of the events carry no mechanism. It changes no tier — the PMD/NDMA rule stands and the record is shown beside it',
      action: 'a register lake with a documented outburst shows its events on /api/glof/lake; the repeat lakes (Khurdopin/Shimshal, Shishper/Hassanabad, Passu, Darkut) are the melt-season watch list. LEARN_NIGRAAN.bat glofevents re-fetches the development copy.' });
  }
  const G = readJson(dataDir, 'giri-landslide-tehsil.json');
  if (G && G.national) {
    const c = G.eventCheck || {}, n = G.national;
    out.push({ id: 'giri_landslide_susceptibility', label: 'GIRI landslide susceptibility (UNEP-GRID / NGI) per tehsil, checked against the NASA catalogue (v91.17.64)', scientificStatus: c.passed ? 'Empirical (independent map, event-checked)' : 'Screening (independent map; event check below 0.7)',
      measurand: 'the global rainfall-triggered susceptibility class (1 very low .. 5 very high, current climate; the earthquake-triggered class beside it) at 12 arc-second over Pakistan, summarised per tehsil as the share of cells in class 4-5, class 3 and the mean class',
      domain: n.tehsils + ' tehsils, ' + (n.cells || 0).toLocaleString() + ' cells; national class shares ' + Object.entries(n.classShare || {}).map(([k, v]) => k + ' ' + Math.round(100 * v) + '%').join(', '), verified: true,
      sample: c.events + ' rainfall-triggered catalogue events (Pakistan-administered) vs ' + (c.controls || 0).toLocaleString() + ' random land cells: events in class 4-5 ' + Math.round(100 * (c.eventShareHigh || 0)) + '% against ' + Math.round(100 * (c.controlShareHigh || 0)) + '% background; AUC of the class as a ranking ' + c.auc + ' (NIGRAAN\'s own dynamic ID-ratio: 0.78 on the same catalogue). ' + n.tehsilsMostlyHigh + ' tehsils have half or more of their cells in class 4-5: ' + (n.topTehsils || []).slice(0, 5).map(t => t.uid.split('|').pop() + ' ' + Math.round(100 * t.shareHigh) + '%').join(', '),
      evidence: 'data/giri-landslide-tehsil.json; station-lake/reports/giri_landslide.md; /api/landslide/giri[?unit=]',
      result: { tehsils: n.tehsils, tehsilsMostlyHigh: n.tehsilsMostlyHigh, auc: c.auc, eventShareHigh: c.eventShareHigh, controlShareHigh: c.controlShareHigh, passed: !!c.passed, usedInClass: false },
      caveat: 'a global 3 arc-second product resampled to 370 m: it ranks terrain, it does not see the road cut, the monsoon week or the antecedent wetness; the catalogue positions carry 5-25 km accuracy, which smears the class at the event and pulls the AUC down; the earthquake-triggered layer is shown, not scored',
      action: 'served per tehsil beside NIGRAAN\'s slope × lithology × rain screen as a second opinion; it does not enter the landslide class. LEARN_NIGRAAN.bat giri re-pulls the tiles.' });
  }
  return out;
}

/* v91.17.65 · the hazard feed: P(R > k) from the ensembles for the classes and the hourly strip; the dissent flag */
/* v91.17.68 · the gauge check behind the hourly rain probability */
function wetHoursEntry(dataDir) {
  try {
    const f = join(dataDir, 'ens-wet-reliability.json'); if (!existsSync(f)) return [];
    const W = JSON.parse(readFileSync(f, 'utf8')); const d = W.deterministic || {}; const g = d.groups || {}; const t = d.tau || {};
    const m = (g.mountain || {}).ecmwf_ifs025 || {}, i = (g.islamabad || {}).ecmwf_ifs025 || {}; const tm = (t.mountain || {}).ecmwf_ifs025 || {}, ti = (t.islamabad || {}).ecmwf_ifs025 || {};
    return [{ id: 'hourly_rain_probability_check', label: 'Is "P(rain in the hour)" from the ensembles a point probability? Measured against 46 rain gauges; frequency-matched threshold served (v91.17.68)', scientificStatus: 'Screening (frequency-matched; hourly point skill weak)',
      measurand: 'the 0.25° grid\'s wet-hour frequency (≥ 0.2 mm) against gauge wet-hour frequency, POD/FAR at 0.2 and 1 mm, the amount ratio; the grid amount τ whose exceedance frequency equals the gauge wet-hour frequency; POD/FAR at τ (the skill that remains after matching)',
      domain: `${Object.keys(W.gauges || {}).length} gauges (${Object.values(W.gauges || {}).filter(x => x.group === 'mountain').length} mountain ARG/AWS at 1,990-4,500 m, ${Object.values(W.gauges || {}).filter(x => x.group === 'islamabad').length} Islamabad fleet), window ${(W.window || []).join(' to ')}, ${(m.hours || 0) + (i.hours || 0)} gauge-hours; ECMWF IFS 0.25 (the ENS grid), best-match and ICON at 0-24 h lead from the forecast archive. Ensemble members themselves: the provider keeps past members ~4 days only, so their reliability record starts with the daily log`, verified: true,
      sample: `mountain: grid wet ${Math.round(100 * (m.modelWet02 || 0))} % of hours vs gauge ${Math.round(100 * (m.gaugeWet02 || 0))} % (ratio ${m.wetRatio}), FAR at 0.2 mm ${m.far02 != null ? Math.round(100 * m.far02) : '—'} %, amount ratio ${m.mmRatio}; τ ${tm.tauMm} mm (POD ${tm.podAtTau}, FAR ${tm.farAtTau}). Plains: ratio ${i.wetRatio}, FAR ${i.far02 != null ? Math.round(100 * i.far02) : '—'} %, τ ${ti.tauMm} mm (POD ${ti.podAtTau}, FAR ${ti.farAtTau}). Passu 25 Sep 2026: the strip printed 78 % under a clear sky = P(member ≥ 0.1 mm); P(member ≥ τ) was 10 % [measured 25 Sep 01:00 PKT]`,
      evidence: 'station-lake/scripts/ens_wet_reliability.py; reports/ens_wet_reliability.md; data/ens-wet-reliability.json; /api/verification/wet-hours; server/api/pool.mjs wetCalibration(); pRain on /api/pool/hazard; build/prob_ui.html',
      result: { mountain: { gridWetRatio: m.wetRatio, far02: m.far02, pod02: m.pod02, mmRatio: m.mmRatio, tauMm: tm.tauMm, podAtTau: tm.podAtTau, farAtTau: tm.farAtTau, tauIqr: tm.tauPerGaugeIqr }, plains: { gridWetRatio: i.wetRatio, far02: i.far02, pod02: i.pod02, mmRatio: i.mmRatio, tauMm: ti.tauMm, podAtTau: ti.podAtTau, farAtTau: ti.farAtTau }, served: 'pRain = P(member ≥ τ by group); pWet (≥ 0.1 mm) kept as the raw member share; no calibration file → pRain null, provider field used, note says unverified', groupLine: '1,000 m (model-skill registry zone)', sampleGap: 'no gauge between ~700 and 1,900 m' },
      caveat: 'frequency matching removes the grid\'s wet-hour bias, not its timing and placement error: after matching, POD 0.31 / FAR 0.71 in the mountains — an hourly rain chance at a valley point is a weak forecast and the strip says so; the day total and the daily P(R24 ≥ k) are the products to act on. The calibration is from deterministic grids of the same resolution as the members; the members\' own reliability is unmeasured until the daily log has 2-3 months. Two dead gauges in the sample (FLT 1.5 mm, Sishper-Ultar_ARG_1 0.0 mm over the window) and one suspect (Mankeyal 13 mm vs 313 mm forecast) are listed for the fleet and network owners',
      action: 're-run LEARN_NIGRAAN.bat rainprob each season as the gauge archive grows; log the hourly member shares at the gauge points (ensverify) so the members\' own reliability can be scored' }];
  } catch { return []; }
}

function hazardFeedEntry(app) {
  return [{ id: 'hazard_exceedance_feed', label: 'Rain probability from the ensembles on the hazard classes and the hourly strip; the dissent flag on the served forecast (v91.17.65)', scientificStatus: 'Probabilistic (ensemble members), Empirical (thresholds)',
    measurand: 'per hour for 72 h: P(≥ 0.1 mm), P(≥ 1 mm), P(≥ 5 mm) and the P50/P90 of the hourly member totals; per day: P(R24 ≥ 1, 5, 10, 25, 50, 100 mm) and, for any trigger total, a log-linear interpolation between the two nearest thresholds; ECMWF ENS (51) and WeatherNext 2 (64) with each system weighted 0.5. The served single-run daily total sits beside each probability',
    domain: 'any point (the place bundle /api/point, part poolHazard); the landslide class reads P(24 h > threshold × governing duration), the flood class P(24 h > 25 mm) and P(24 h > 50 mm), the hourly strip P(rain in the hour); 20-minute cache per point', verified: true,
    sample: 'Islamabad F-10, 24 Sep 2026: P(rain) by hour 1-32 %, P(24 h > 25 mm) 0.8 %, served total 0.6 mm — "below the trigger on both". Dissent flag: the served forecast (corrected) against the nine-model P10-P90 (raw layer), an hour counts only beyond 1 °C outside the band; 0 of 24 h at F-10 after the 1 °C allowance (13 of 24 before it: the urban term itself)',
    evidence: '/api/point (part poolHazard); build/prob_ui.html (AGN.prob); client hzScore landslide and flood branches; the note under the hourly strip; server/api/pool.mjs hazard()',
    result: { hourlyHours: 72, dailyThresholds: [1, 5, 10, 25, 50, 100], verdicts: ['single run, ensembles disagree (served ≥ trigger, P < 0.15)', 'ensemble watch (served < trigger, P ≥ 0.40)', 'ensembles support the trigger', 'below the trigger on both'], classesRescored: false, stripSource: 'ensembles where the feed is loaded, provider probability otherwise, stated under the strip', dissentRule: '≥ 6 of the next 24 h more than 1 °C outside the nine-model P10-P90' },
    caveat: 'the classes still stand on the served single series; the probability is printed with the trigger and the headline says when the single run is alone — the class itself is not re-scored on the probability (that needs the event set the CN gate is waiting for). The ensembles are two systems that share an initial state; the P10-P90 of the pool is the raw model layer, so the dissent flag allows 1 °C for the corrections',
    action: 'served now at every point the strip draws; the national sweep does not fetch the feed (577 units × 2 ensembles per refresh is not a cost the sweep should carry).' }];
}

/* v91.17.266 · the rainfall row states the rain correction that runs (verification.mjs: the mountain quantile mapping is the served and
   warning rain from its liveFrom date, the plains/coast mapping corrects the displayed amount only); every figure is read from the two
   files the fitting scripts wrote, none is typed here. A file that is missing is said so. */
function rainCorrectionOverlay(list, dataDir) {
  const N = readJson(dataDir, 'rain-qm-north.json'), P = readJson(dataDir, 'rain-qm-plains.json');
  const parts = [];
  if (N && N.months) { const h = N.heldOut || {}, live = N.liveFrom && Date.now() >= Date.parse(N.liveFrom + 'T00:00:00+05:00');
    parts.push('mountain zone: monthly quantile mapping of the model daily rain onto the valley gauges (liquid days only), ' + (live ? 'live since ' + N.liveFrom + ' as the served and warning rain' : 'in shadow until ' + N.liveFrom)
      + (h.gauges ? '; held out on ' + h.gauges + ' gauges, ' + h.days + ' days, the rain total goes from ' + h.totalRatioRaw + 'x to ' + h.totalRatioCorrected + 'x the gauges' : '') + ' (' + N.version + ')'); }
  else parts.push('mountain zone: no rain correction file on this server');
  if (P && P.mq) { const t = (P.test && P.test.leaveOneStationOut) || {}, f = (a) => Array.isArray(a) ? a[0] + ' -> ' + a[1] : null;
    parts.push('plains and coast: daily quantile mapping onto the gauges in months ' + ((P.domain && P.domain.months) || []).join(', ') + ', displayed amount only; the warnings keep the raw rain'
      + (t.pod10 ? '; station left out, heavy-day (>= 10 mm) detection ' + f(t.pod10) + ', daily MAE ' + f(t.mae) + ' mm' : '') + ' (' + P.version + ')'); }
  else parts.push('plains and coast: no rain correction file on this server');
  return list.map((e) => e && e.id === 'rainfall' ? { ...e, action: 'rain chances are probabilistic and catchment-averaged; no deterministic hyperlocal rainfall is published. The rain amount is corrected by quantile mapping: ' + parts.join('; ') + '.' } : e);
}

/* v91.17.66 · the case document */
function caseDocumentEntry(app) {
  const st = app && app.casebook ? app.casebook.status() : null; if (!st) return [];
  return [{ id: 'case_document', label: 'The case document: one decision chain per asset, on records with a provenance class (v91.17.66)', scientificStatus: 'Governance (record structure)',
    measurand: 'HAZARD → EXPOSURE → VULNERABILITY → CONDITION → CONSEQUENCE → RESPONSE → RESIDUAL → MONITORING for one asset of one client project, plus a confidence panel. Hazard from the engines this server runs (the national run at the tehsil, the ensemble hazard feed, the MACH urban term, the climatology baseline, GIRI, the GLOF record); exposure to consequence from the client record with a provenance class on every field; response and residual from the adaptation tracker; monitoring from dated snapshots',
    domain: 'projects on this server: ' + st.projects + '; provenance records ' + st.assetFields + '; interventions ' + st.interventions + '; snapshots ' + st.snapshots + '. Chain fields: ' + Object.entries(st.chainFields).map(([k, v]) => k + ' ' + v.length).join(', '), verified: true,
    sample: 'AJG warehouse · I-9 Industrial Area, Islamabad (demonstration): hazard from five sources (served forecast, ensembles P(24 h > 25 mm) 0.8 %, urban term +1.44 °C, hot-season baseline 41.8 °C, GIRI 3 % high); condition_class "fair" verified by inspection; chain fields the client did not supply reported missing; one planned intervention with risk high → moderate declared; overall confidence moderate',
    evidence: '/api/case/status, /api/case/project (PUT, GET), /api/case/asset, /api/case/asset/fields (PUT), /api/case/interventions (GET, POST, PUT, DELETE), /api/case/document, /api/case/snapshot (POST), /api/case/history; server/api/casebook.mjs; build/case_ui.html (the Casebook panel under the client project)',
    result: { provenanceClasses: st.provenanceClasses, statuses: st.statuses, riskClasses: st.riskClasses, platformEstimates: false, residualComputed: false, store: 'local JSON store (development grade, as the rest of the store)' },
    caveat: 'the platform never fills a field: what the client does not supply is missing, and "estimated" is a class only the client can set. Residual risk is a declared class on a completed intervention, not a computation. The confidence panel\'s "high" is unreachable in this build (it needs an inspection-verified condition and a fleet-covered point). Consequence is operational (criticality, tolerable downtime, recovery time); no financial figure is carried',
    action: 'the Casebook panel (Assets & Exposure) syncs the loaded project to the server, records provenance per field, runs the adaptation tracker and takes snapshots; the report families read this document (v91.17.67).' }];
}

/* v91.17.67 · the report families over the case document. v91.17.252 · W2 · counts, families and the flag rule are read from the casebook
   (cardCatalogue, FAMILIES, flagRule), never typed here: no family is gated, each section prints what is held or the input required */
function caseFamiliesEntry(app) {
  const CB = app && app.casebook, F = CB ? CB.FAMILIES : null; if (!F) return [];
  const cards = CB.cardCatalogue ? CB.cardCatalogue() : [], R = CB.flagRule ? CB.flagRule() : {}, fams = Object.keys(F), gated = fams.filter(k => F[k].gated);
  const sections = Object.fromEntries(fams.filter(k => Array.isArray(F[k].sections)).map(k => [k, F[k].sections]));
  return [{ id: 'case_report_families', label: 'The report families over the case document: the standard risk card, the decision chain, the tracker, the portfolio and the board brief (v91.17.67, v91.17.252; the disclosure and financial families left NIGRAAN in v91.17.266)', scientificStatus: 'Governance (report structure)',
    measurand: cards.length + ' cards in one shape per asset (' + cards.map(c => c.hazard).join('; ') + '), each with its evidence class, source, method, limitation and the routes to drill into; a portfolio row per asset with the map\'s levels, a flag where a hazard is at ' + (R.reachedFrom || 'the response-trigger level') + ' or above on a current engine run (' + (R.source || 'data/hazard-scale.json') + '), and standing records with no cut (' + (R.standing || []).join(', ') + '); the report routes ' + fams.join(', '),
    domain: 'families: ' + fams.join(', ') + '; gated: ' + (gated.length ? gated.join(', ') : 'none') + '; sectioned: ' + Object.entries(sections).map(([k, v]) => k + ' (' + v.join(', ') + ')').join('; '), verified: true,
    sample: 'AJG warehouse · I-9 Industrial Area, Islamabad (demonstration): a card whose source did not answer at the point is printed as "not available" with the reason',
    evidence: '/api/case/document (riskCards, history), /api/case/portfolio, /api/case/families; server/api/casebook.mjs riskCards() portfolio() FAMILIES; build/casereport_ui.html (pages pRiskCards, pCaseChain, pTracker, pCaseConfidence, pCaseHistory, pCaseStandards, pCasePortfolio, pCaseBoard); Report Builder selector',
    result: { cards: cards.length, cardIds: cards.map(c => c.id), families: fams.length, gated, sections, flagRule: R, flagsAreRanking: false, platformEstimates: false, standardsClaim: 'crosswalk only: which page speaks to which clause; no conformity statement' },
    caveat: 'a card is made only from a value an engine returned; a source that did not answer is a card with no value and the reason. Levels are the map\'s (one engine); heat is on UTCI. The standards crosswalk is not a statement of conformity',
    action: 'Report Builder → any case family after the project is synced to the server (Casebook panel); a section marked input required names the record that fills it.' }];
}

/* v91.17.68 · the back-test figures are read from the file the script wrote, never typed into the sheet;
   the static entry keeps its measurand and caveat, the numbers follow every rerun of LEARN_NIGRAAN.bat landslide */
function landslideOverlay(list, dataDir) {
  const C = readJson(dataDir, 'landslide-calibration.json'); if (!C || !C.auc || !C.counts) return list;
  const A = C.auc, keys = Object.keys(A).filter((k) => typeof A[k] === 'number');
  if (!keys.length) return list;
  const best = keys.reduce((a, b) => (A[b] > A[a] ? b : a));
  const NAME = { idRatio: 'the intensity-duration ratio', P1: 'the 1-day total', P3: 'the 3-day total', P7: 'the 7-day total', API15: 'the 15-day antecedent index' };
  const t03 = (C.thresholdTable || []).find((r) => r.ratio === 0.3);
  const pk = C.pakistanAdministered || {};
  const day = String(C.built || '').slice(0, 10);
  return list.map((e) => e.id !== 'landslide_threshold_backtest' ? e : { ...e,
    domain: `${C.counts.scored} rain-triggered events with location within 25 km (${pk.events != null ? pk.events + ' in Pakistan-administered units, the rest in the disputed IIOJK polygon, scored for the physics and outside every national total' : 'Pakistan-administered split not in the file'}); ${(C.counts.controlHourlyDays || 0).toLocaleString()} control days for the hourly ratio, ${(C.counts.controlDays || 0).toLocaleString()} for the daily totals`,
    sample: `measured ${day} with events and controls scored on the same window (best of the three days around the catalogue day): AUC ${keys.map((k) => `${A[k]} for ${NAME[k] || k}`).join(', ')}; the strongest single predictor on this run is ${NAME[best] || best} (${A[best]}), and the ratio is kept as the engine anchor because it is the published curve` +
      (t03 ? `. At a ratio of 0.3: ${Math.round(100 * t03.eventShare)}% of event days${t03.eventSharePakistanAdministered != null ? ` (${Math.round(100 * t03.eventSharePakistanAdministered)}% in Pakistan-administered units)` : ''} and ${(100 * t03.controlShare).toFixed(1)}% of ordinary season days` : '') +
      (pk.aucIdRatio != null ? `; Pakistan-administered events alone: AUC ${pk.aucIdRatio} for the ratio` : ''),
    auc: A, bestPredictor: best, built: C.built });
}

/* ══ v91.17.70 · THE CUSTOMER METHODS SHEET ═══════════════════════════════════════════════════════════════════════════
   The sheet above is the internal verification record: its figures are measured against the PMD station archive, NOAA
   synop records and the SUPARCO lake reads, and its "verified" flags rest on those or on a model scored against its own
   reanalysis. Under the data-source decision (option 2) none of that reaches a customer. /api/skill serves this sheet
   instead: for each product, what it measures and how it is made, with no station figures, no agency names and no
   verified flags. The full sheet is served with NIGRAAN_INTERNAL_REF=1. An entry whose label, measurand or domain names
   an internal reference is left out rather than reworded, and the retracted IDF table and the reanalysis-as-truth entry
   are internal by nature. */
const NAMED_REF = /\b(PMD|SUPARCO|FFD|synop|GSOD|ISD(?:-Lite)?|METAR|NOAA|airport|WAPDA|GBDMA)\b/i;
const INTERNAL_ONLY = new Set(['rainfall_idf', 'reanalysis_reference', 'bias_reference_register', 'model_ranking', 'hourly_rain_probability_check', 'live_verification']);   /* v91.17.283.7 · live_verification: the agent's measured figures, internal (the client sentence switches only through evidence.mjs) */
/* v91.17.283 · WS4 · item 5 · the two scenario tools that stay in NIGRAAN, explained in one paragraph each for the customer sheet (the
   console's Scenario section prints the same text from /api/skill?parameter=); financial and ESG content left NIGRAAN (owner decision 14 Oct) */
const CUSTOMER_METHODS = [
  { id: 'scenario_monte_carlo', label: 'Hazard Monte Carlo (Scenario)',
    measurand: 'What it simulates: how often, over the forecast days, heat stress and flooding both reach the Watch level on the same day at the place shown in the stress test. ' +
      'Inputs: the members of the ensemble forecast at that place (each member is one physically consistent future), read as each member\u2019s temperature and rain series; it refuses to run where the place has no paired temperature and rain members. ' +
      'Method: 10,000 replays, each picking forecast members at random and passing them through the heat and flood screens; the result is the share of replays in which both reach Watch on the same day, shown as a chance out of 100 for these days with its range. ' +
      'It is not a yearly probability or a return period, and it inherits the limits of the levels it combines (heat High and Severe, cold and flood are indicative); when the members disagree, the range is wide.' },
  { id: 'long_term_projection', label: 'Long-term climate projection (CMIP6)',
    measurand: 'Projected change in temperature and rainfall from the CMIP6 climate-model ensemble, relative to the models\u2019 own historical period: a planning outlook for decades ahead, not a forecast for a date. It is the projection for the tehsil that holds the place (asked at the tehsil\u2019s representative point), captioned "CMIP6 projection for <tehsil>".' },
  /* v91.17.283 · INTEG (WS1 delta 2, decision D1) */
  { id: 'ensemble_outlook_15day', label: '15-day ensemble outlook',
    measurand: 'The next 15 days at each tehsil from the 51 runs of a global ensemble forecast: the median and range of the runs, and the share of runs in which an event happens. Updated twice daily (00 and 12 UTC ensemble runs); a run older than 18 hours is not used.' },
];
function customerOf(sheet) {
  const clean = (t) => String(t == null ? '' : t).replace(/\s*\(v\d+\.\d+\.\d+[^)]*\)/g, '').trim();
  const ok = (e) => e && !INTERNAL_ONLY.has(e.id) && !NAMED_REF.test([e.label, e.measurand, e.domain].join(' '));
  return {
    version: sheet.version, title: 'Methods',
    /* v91.17.283 · WS4 · item 1 · the accuracy statement is the measured out-of-sample evidence (generated sentences, file hashes), not an unscoped claim */
    statement: 'What each NIGRAAN value measures and how it is made. The measured accuracy below was checked out of sample (stations never used in training, or a period after the fitting window) and is printed on the forecast-basis page of every report; the data behind every value are listed with their licences at /api/sources.',
    measured: evidenceForClient(),
    sources: '/api/sources',
    parameters: (sheet.parameters || []).filter(ok).map((e) => ({ id: e.id, label: clean(e.label), measurand: clean(e.measurand), ...(e.domain && !/station/i.test(e.domain) ? { domain: clean(e.domain) } : {}) })).concat(CUSTOMER_METHODS),
    thresholds: (sheet.thresholds || []).filter((t) => t && !NAMED_REF.test(t.label || '')).map((t) => ({ id: t.id, label: clean(t.label) })),
  };
}

export function createSkill(dataDir, app) {
  const byId = (list, id) => list.find((x) => x.id === id) || null;
  /* v91.17.68 · the dynamic entries re-read ~14 MB of JSON on every call and one limits evaluation asked for them per limit (audit C8);
     cached for 60 s, or until a data file's mtime moves */
  let PC = null;
  const stamp = () => { try { return ['model-ranking.json', 'glof-lakes-live.json', 'glof-lakes-live-open.json', 'ml-mos.json', 'flood-extent-calibration.json', 'fleet-history-skill.json', 'ens-wet-reliability.json', 'model-skill.json', 'landslide-calibration.json', 'rain-qm-north.json', 'rain-qm-plains.json', 'agents/verify/summary.json'].map((f) => { try { return statSync(join(dataDir, f)).mtimeMs; } catch { return 0; } }).join('|'); } catch { return ''; } };
  const params = () => { if (!dataDir) return SHEET.parameters; const st = stamp(); if (PC && PC.stamp === st && Date.now() - PC.at < 60e3) return PC.v; const v = paramsRaw(); PC = { stamp: st, at: Date.now(), v }; return v; };
  const paramsRaw = () => dataDir ? rainCorrectionOverlay(landslideOverlay([...SHEET.parameters, modelRankingEntry(dataDir), lakeMonitorEntry(dataDir, app), ...metEntries(dataDir), ...levelAnomalyEntry(dataDir), ...floodExtentEntry(dataDir), ...biasReferenceEntries(dataDir), ...fleetHistoryEntry(dataDir, app).filter(Boolean), ...crossCheckEntries(dataDir), ...hazardFeedEntry(app), ...wetHoursEntry(dataDir), ...caseDocumentEntry(app), ...caseFamiliesEntry(app), ...stateEntries(dataDir), ...liveVerificationEntry(dataDir)], dataDir), dataDir) : SHEET.parameters;
  return {
    sheet: () => ({ ...SHEET, parameters: params() }),
    customerSheet: () => customerOf({ ...SHEET, parameters: params() }),
    parameter: (id) => byId(params(), id),
    threshold: (id) => byId(SHEET.thresholds, id),
    ids: () => ({ parameters: params().map((p) => p.id), thresholds: SHEET.thresholds.map((t) => t.id) }),
  };
}
