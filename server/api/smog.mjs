/* Air and smog outlook for every tehsil, next 5 days.
   Two separate readings, deliberately not blended:
   1. Air quality: CAMS global atmospheric composition forecast (about 45 km), PM2.5, PM10,
      US AQI and dust. Daily PM2.5 mean is classed on the US EPA 24-hour breakpoints (2024);
      the Pakistan NEQS 24-hour limit is 35 µg/m³. CAMS does not see crop-residue burning and
      local traffic/brick-kiln emissions well, so in Punjab's winter smog it usually reads LOW.
   2. Smog-trapping weather: afternoon ventilation index (boundary-layer height × wind, 12-16 h:
      ≥6,000 m²/s good, 2,350-6,000 fair, 1,000-2,350 poor, <1,000 very poor (generic fire-weather
      bands, not yet tuned to Pakistan); one class worse
      with 3+ hours of morning inversion; since v91.17.283.10 from ONE model column, see below), morning temperature inversion (air at 925 hPa
      warmer than at 2 m, used only below 500 m elevation) and fog (RH ≥ 95%, wind < 3 m/s, visibility < 1 km).
   v91.17.283.10 · UPPER-AIR SOURCE. The met call is the provider's best_match, which for Pakistan reads ECMWF IFS 9 km first, then
      ICON global, then GFS, variable by variable (open-meteo ForecastapiController.swift, best_match "remaining parts of the world").
      IFS 9 km carries no pressure levels, so temperature_925hPa came from ICON global 13 km while temperature_2m came from IFS 9 km
      (moved to the unit's height by the provider's fixed lapse): the "inversion" was one model's 925 hPa minus another model's 2 m.
      Now the inversion is read from ONE column: a second call, plains units only (the only ones the test applies to), models=icon_global,
      elevation=nan (the model's own ground, no lapse shift), temperature_2m + temperature_925hPa + surface_pressure; an hour whose
      surface pressure is <= 925 hPa (the level under the model ground) is not tested. The best_match call no longer asks the 925 hPa level.
      If the ICON call fails the inversion is not tested (inversionHours null, with why): never the mixed pair again. No sounding truth
      could be used to test either version (IGRA v2: no 00 UTC winter sounding with a surface and a 925 hPa temperature at Lahore,
      Karachi, Islamabad or Multan since 2015; Peshawar has no file). Cost: + the plains units (331) per run, weight 1 each.
      This part does not depend on emissions, so it still flags bad days when CAMS is low.
   "Smog day" = PM2.5 class Unhealthy or worse AND poor dispersion.
   v91.17.147: near the four monitored cities the daily PM2.5 is ground-checked (pmCorrect below); elsewhere it is CAMS alone.
   v91.17.72 · CROP BURNING UPWIND. NASA FIRMS active fires (data/fires.json, scripts/firms_fetch.mjs, refreshed from
   tick() every fires-config refreshHours) give each tehsil-day an upwind fire load: fires of the last 3 observed days
   within 300 km, weighted by the day's forecast 10 m wind direction (server/api/fireload.mjs; settings and the
   validation in data/fires-config.json). It is an EXPLANATORY factor (day.fires, day.reasons: "crop burning upwind:
   N fires in 3 days"); it does not change smogDay. Measured on Oct-Dec 2023/2024: it adds skill for CAMS smog days
   over the weather-only baseline (AUC 0.65 → 0.75), but CAMS is the engine's own PM2.5 input and already carries fire
   emissions, and no monitor record exists to show an improvement over it [measured / inference].   */
import { readFileSync, writeFileSync, renameSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { appendGzMember } from './gzsafe.mjs';   /* v283.27 item 7: whole gzip members only */
import { join } from 'node:path';

const TZ = 'Asia/Karachi';
const r1 = (x) => x == null || !isFinite(x) ? null : Math.round(x * 10) / 10;
const r3 = (x) => x == null || !isFinite(x) ? null : Math.round(x * 1000) / 1000;   /* v283.27 item 7: archived model inputs */
const doyOf = (date) => Math.round((Date.parse(date + 'T00:00:00Z') - Date.UTC(+date.slice(0, 4), 0, 1)) / 864e5) + 1;
/* ══ v91.17.259 · D6 · AGN's OWN AIR QUALITY INDEX from the SERVED PM2.5 and PM10 (US EPA AQI, 2024 PM2.5 breakpoints) ══════════
   Breakpoints: US EPA, Reconsideration of the NAAQS for Particulate Matter, final rule 89 FR 16202 (6 Mar 2024) and the AQI
   Technical Assistance Document EPA-454/B-24-002 (May 2024): PM2.5 24 h 0-9.0 / 9.1-35.4 / 35.5-55.4 / 55.5-125.4 / 125.5-225.4 /
   225.5-325.4 ug/m3; PM10 24 h 0-54 / 55-154 / 155-254 / 255-354 / 355-424 / 425-604 ug/m3 (unchanged). Concentrations truncated
   (PM2.5 to 0.1, PM10 to 1) before the linear interpolation, as the document says. The daily AQI is the larger sub-index of the
   served daily mean PM2.5 (ground-checked / national model / composition forecast, as labelled) and the composition-forecast daily
   mean PM10 (not corrected: no PM10 correction has passed a test). The 'now' value is the US EPA NowCast weighting (weight factor
   = min/max of the last 12 hours, floored at 0.5; EPA 2013 / TAD 2024) applied to the 12 forecast hours ending at the run hour, the
   PM2.5 hours scaled by the day's served / composition ratio: a forecast weighted like a NowCast, not a measurement. */
const AQI_PM25 = [[0, 9.0, 0, 50], [9.1, 35.4, 51, 100], [35.5, 55.4, 101, 150], [55.5, 125.4, 151, 200], [125.5, 225.4, 201, 300], [225.5, 325.4, 301, 500]];
const AQI_PM10 = [[0, 54, 0, 50], [55, 154, 51, 100], [155, 254, 101, 150], [255, 354, 151, 200], [355, 424, 201, 300], [425, 604, 301, 500]];
export const AQI_PM25_TABLE = () => AQI_PM25.map((r) => r.slice());
const AQI_CAT = ['Good', 'Moderate', 'Unhealthy for sensitive groups', 'Unhealthy', 'Very unhealthy', 'Hazardous'];
function aqiSub(c, T, dec) { if (c == null || !Number.isFinite(c) || c < 0) return null; const p = 10 ** dec; c = Math.floor(c * p + 1e-9) / p;
  for (const [lo, hi, ilo, ihi] of T) if (c <= hi) return Math.round((ihi - ilo) / (hi - lo) * (Math.max(c, lo) - lo) + ilo);
  /* v91.17.283.8 · audit 1 · above the top breakpoint the index is NOT capped at 500: EPA-454/B-24-002 (May 2024), Table 6 note 4 and
     section VI: "AQI values greater than 500 should be calculated using equation 1 and the concentration specified for the AQI value
     of 500", i.e. the same linear slope as the 301-500 segment (PM2.5 400 ug/m3 -> 649, not 500). The category stays Hazardous. */
  const [lo, hi, ilo, ihi] = T[T.length - 1]; return Math.round((ihi - ilo) / (hi - lo) * (c - lo) + ilo); }
const aqiCat = (a) => a == null ? null : AQI_CAT[a <= 50 ? 0 : a <= 100 ? 1 : a <= 150 ? 2 : a <= 200 ? 3 : a <= 300 ? 4 : 5];
function nowcast(v) { /* v: the 12 hourly values, newest LAST; EPA: at least 2 of the 3 most recent hours */
  const x = v.slice(-12).reverse(); if (x.slice(0, 3).filter(a => a != null).length < 2) return null; const ok = x.filter(a => a != null); if (!ok.length) return null;
  const mn = Math.min(...ok), mx = Math.max(...ok), w = mx > 0 ? Math.max(0.5, mn / mx) : 1; let s = 0, sw = 0;
  x.forEach((a, i) => { if (a != null) { s += a * w ** i; sw += w ** i; } }); return sw ? s / sw : null; }
export const nowcastPm = (v) => nowcast(v);   /* v91.17.283.52 E · the EPA NowCast, also for the measured air quality now (aqnow.mjs) */
export const aqiSubIndex = (c, pollutant) => aqiSub(c, pollutant === 'PM10' ? AQI_PM10 : AQI_PM25, pollutant === 'PM10' ? 0 : 1);
export function aqiOf(pm25, pm10) { const a = aqiSub(pm25, AQI_PM25, 1), b = aqiSub(pm10, AQI_PM10, 0); if (a == null && b == null) return null;
  const v = Math.max(a ?? -1, b ?? -1); return { aqi: v, category: aqiCat(v), pollutant: (a ?? -1) >= (b ?? -1) ? 'PM2.5' : 'PM10', pm25Sub: a, pm10Sub: b }; }
export const DUST_CLASSES = ['Low', 'Elevated (≥150 µg/m³)', 'Dust event (≥300 µg/m³)', 'Severe dust storm (≥1,000 µg/m³)'];
export const dustClass = (v) => v == null || !isFinite(v) ? null : v >= 1000 ? 3 : v >= 300 ? 2 : v >= 150 ? 1 : 0;
export const PM_CLASSES = [
  { id: 'good', label: 'Good', max: 9 }, { id: 'moderate', label: 'Moderate', max: 35.4 }, { id: 'usg', label: 'Unhealthy for sensitive groups', max: 55.4 },
  { id: 'unhealthy', label: 'Unhealthy', max: 125.4 }, { id: 'veryUnhealthy', label: 'Very unhealthy', max: 225.4 }, { id: 'hazardous', label: 'Hazardous', max: Infinity },
];
/* v91.17.283.35 · audit D3 · US EPA (89 FR 16202): the 24-hour PM2.5 is TRUNCATED to 0.1 ug/m3 before it is classed (9.04 is Good, not Moderate) */
export const pmClass = (v) => v == null || !Number.isFinite(v) ? null : (() => { const t = Math.floor(v * 10 + 1e-9) / 10; return PM_CLASSES.findIndex(c => t <= c.max); })();
export const DISPERSION = ['Good', 'Fair', 'Poor', 'Very poor'];
/* v283.36 · NIGRAAN 1.0 · launch item 19 · withheld air classes (no source, no test): the values are shown instead */
export const AIR_WITHHELD = { dust: 'withheld: no dust class (the 150 / 300 / 1,000 µg/m³ bands have no source); the dust mass is shown in µg/m³', smog: 'withheld: no smog-day yes/no (an untested rule); PM2.5 with its US EPA AQI class and the ventilation are shown', fogDay: 'withheld: no fog-day count; the fog hours (WMO: visibility under 1 km) are shown' };
/* v91.17.283.35 · audit C5 · house thresholds that decide served air classes: labelled on every surface, never an alert */
export const AIR_UNTESTED = 'indicative \u2014 thresholds not tested: the dust bands (150 / 300 / 1,000 ug/m3), the dispersion bands (ventilation index 6,000 / 2,350 / 1,000), the smog-day rule (Unhealthy and Poor dispersion) and the fog rule (RH 95 %, wind under 10.8 km/h) are house rules not tested against observations';

import { alignBatch } from './provider.mjs';
import { statSync } from 'node:fs';
import { fireLoadAt, vectorWind, loadClass } from './fireload.mjs';
import { lgbEval } from './natmodel.mjs';
import { createFeatGrid } from './featgrid.mjs';
import { createPm25Ds } from './pm25ds.mjs';   /* 1.0.4 · aq41 · the 1 km PM2.5 downscaling factor (factor 1 outside the released regions) */
export function createSmog(app, dataDir) {
  const { provider, units } = app;
  const file = join(dataDir, 'smog.json');
  let S = null, running = false, lastError = null;
  try { if (existsSync(file)) S = JSON.parse(readFileSync(file, 'utf8')); } catch { S = null; }
  const pool = () => units.tehsil.filter(u => !u.disputed && u.lat != null);
  const PDS = createPm25Ds(dataDir); app.pm25ds = PDS;   /* 1.0.4 · aq41 */
  const list = (x, b) => alignBatch(x, b);   /* v91.17.68 · aligned to the batch by coordinate (B10) */

  /* ── v91.17.72 · crop burning upwind (NASA FIRMS) ─────────────────────────────────────────────────────────────── */
  const fFile = join(dataDir, 'fires.json'), cFile = join(dataDir, 'fires-config.json');
  let F = null, FC = null, fStamp = 0, cStamp = 0, fRunning = false, fError = null, fCache = null, fTried = 0;
  function fires() {
    try { const st = statSync(cFile).mtimeMs; if (st !== cStamp) { FC = JSON.parse(readFileSync(cFile, 'utf8')); cStamp = st; fCache = null; } } catch { FC = null; }
    try { const st = statSync(fFile).mtimeMs; if (st !== fStamp) { F = JSON.parse(readFileSync(fFile, 'utf8')); fStamp = st; fCache = null; } } catch { F = null; }
    return F && FC && F.points && Array.isArray(F.days) ? F : null;
  }
  const firesAgeH = () => { const f = fires(); return f && f.at ? (Date.now() - Date.parse(f.at)) / 3600e3 : Infinity; };
  async function runFires() {
    if (fRunning) return { started: false }; fRunning = true; fTried = Date.now();
    try { const m = await import(new URL('../../scripts/firms_fetch.mjs', import.meta.url).href);
      await m.fetchFires({ dataDir }); fError = null; return { started: true }; }
    catch (e) { fError = e.message; console.error('  fires error', e.message); return { started: false, error: e.message }; }
    finally { fRunning = false; }
  }
  /* the fires of the last windowDays observed local days (the latest day may be a partial day) and the factor that turns the
     multi-satellite count into the S-NPP equivalents the thresholds were set on */
  /* v91.17.157 · audit: freshness. CAMS refreshes every 3 h: older than 12 h is stale and said. A fire window whose newest observed day
     is more than 2 days old is not attached to today's wind (week-old fires read as "N fires in 3 days"). */
  const ageOf = () => S && S.at ? (Date.now() - Date.parse(S.at)) / 3600e3 : null;
  const fresh = () => { const a = ageOf(); return { ageH: a == null ? null : Math.round(a * 10) / 10, stale: a == null || a > 12, staleWhy: a == null ? 'no air-quality run held' : a > 12 ? 'the air-quality forecast is ' + Math.round(a) + ' h old (it refreshes every 3 h)' : null }; };
  const firesFresh = () => { const w = fireWindow0(); if (!w || !w.days || !w.days.length) return false; const last = w.days[w.days.length - 1]; const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10); return (Date.parse(today) - Date.parse(last)) / 864e5 <= 2; };
  function fireWindow() { return firesFresh() ? fireWindow0() : null; }
  function fireWindow0() {
    const f = fires(); if (!f) return null;
    if (fCache && fCache.f === f && fCache.s === S) return fCache;
    const P = FC.params, dd = f.days.slice(-P.windowDays), keep = new Set(dd.map(d => f.days.indexOf(d)));
    const pts = f.points.rows.filter(r => keep.has(r[2])).map(r => ({ lat: r[0], lon: r[1], frp: r[3], sector: f.points.sectors ? f.points.sectors[r[6]] : null }));
    const b = (FC.snppShareDefault && FC.snppShareDefault.bounds) || [0.25, 1];
    const share = Math.max(b[0], Math.min(b[1], f.snppShare != null ? f.snppShare : (FC.snppShareDefault ? FC.snppShareDefault.value : 1)));
    fCache = { f, s: S, P, days: dd, pts, share, byUnit: new Map() };
    return fCache;
  }
  const FIRE_LABELS = () => (FC && FC.classes && FC.classes.labels) || ['None', 'Low', 'Moderate', 'High'];
  function fireFor(u, day) {
    const W = fireWindow(); if (!W || !u || u.lat == null) return null;
    const key = u.unitId + '|' + (day ? day.date : ''); if (W.byUnit.has(key)) return W.byUnit.get(key);
    const L = fireLoadAt(u.lat, u.lon, day ? day.windFrom : null, day ? day.windVecMs : null, W.pts, W.P);
    /* which sector the load comes from (the largest share of the weight) */
    const e = Object.entries(L.bySector || {}).sort((a, b) => b[1] - a[1])[0], top = L.load > 0 && e ? e[0] : null;
    const eqLoad = Math.round(L.load * W.share * 10) / 10, eqUp = L.upwind * W.share, cls = loadClass(eqLoad, FC.classes);
    const labels = (F.sectorLabels || {}), n = W.days.length;
    const reason = FC.reason && FC.reason.minFires != null && eqUp >= FC.reason.minFires ? 'crop burning upwind: ' + L.upwind + ' fires in ' + n + ' days' + (top ? ' (most in ' + (labels[top] || top) + ')' : '') : null;
    const o = { upwind: L.upwind, within300km: L.within, local: L.local, load: eqLoad, frpLoadMW: L.frpLoad, cls, label: FIRE_LABELS()[cls], topSector: top ? (labels[top] || top) : null,
      observed: W.days[0] + ' to ' + W.days[W.days.length - 1], windFrom: L.calm ? null : (day ? day.windFrom : null), reason };
    W.byUnit.set(key, o); return o;
  }
  const withFires = (u, rows) => rows.map(d => { const fz = fireFor(u, d); if (!fz) return d; return { ...d, fires: fz, reasons: fz.reason ? [fz.reason] : [] }; });

  const AQ_DAY_MIN_HOURS = 18;   /* v91.17.283.3 · C11 · 75 % of 24 h, US EPA 40 CFR Part 50 Appendix N: a 24-hour PM2.5 average needs at least 18 hourly values */
  const POOR_VENT = 2350;   /* v91.17.68 · one Poor line: the hour count and the day class used 2000 and 2350 (audit A11) */
  const col = (H, k) => Array.isArray(H && H[k]) ? H[k] : [];   /* a variable the provider did not return is null per hour (A13) */
  /* v91.17.147 · #141 · GROUND-CHECKED PM2.5 near the four monitored cities (data/pm25-correction.json). CAMS read the daily mean
     18-60 ug/m3 low at the US Department of State monitors (Aug 2022 - Feb 2026); a per-city power law with a seasonal term, scored
     with each season-year held out, cut the daily error at Lahore 65 -> 40, Peshawar 50 -> 34, Islamabad 26 -> 17 ug/m3 (Karachi
     19 -> 19, bias -16 -> +4) and raised detection of Unhealthy days from 0.14-0.70 to 0.83-0.91 (false alarms 0.19-0.28). Within reachKm of a monitor the
     corrected value sets the class; elsewhere the CAMS value stands, marked not ground-checked. */
  let PMC = null, pmcAt = 0;
  const pmc = () => { const f = join(dataDir, 'pm25-correction.json'); try { const st = statSync(f); if (!PMC || st.mtimeMs !== pmcAt) { PMC = JSON.parse(readFileSync(f, 'utf8')); pmcAt = st.mtimeMs; } } catch (_) { PMC = null; } return PMC; };
  function pmCorrect(u, date, pm) {
    const C = pmc(); if (!C || pm == null || !(pm > 0) || !u || u.lat == null || process.env.NIGRAAN_PMC === '0') return null;
    let best = null; for (const [name, S] of Object.entries(C.sites || {})) { const dy = (u.lat - S.lat) * 111.2, dx = (u.lon - S.lon) * 111.2 * Math.cos(u.lat * Math.PI / 180), km = Math.hypot(dx, dy); if (km <= (C.apply.reachKm || 30) && (!best || km < best.km)) best = { name, S, km }; }
    if (!best) return null;
    const S = best.S, doy = Math.round((Date.parse(date + 'T00:00:00Z') - Date.UTC(+date.slice(0, 4), 0, 1)) / 864e5) + 1, sn = Math.sin(2 * Math.PI * doy / 365.25), cs = Math.cos(2 * Math.PI * doy / 365.25);
    const b = S.coef, y = Math.exp(b[0] + b[1] * Math.log(pm) + b[2] * sn + b[3] * cs) * S.smear;   /* one elasticity b1 > 0: monotone in CAMS */
    const [lo, hi] = S.camsRange || [0, Infinity];
    return { value: r1(y), extrapolated: pm > hi || pm < lo, monitorCity: best.name, km: Math.round(best.km), heldOutMaeUgm3: S.heldOut && S.heldOut.mae, version: C.version };
  }
  /* v91.17.199 · M07 · NATIONAL PM2.5 MODEL away from the monitored cities (data/pm25-national.json, scripts aq_final.py /
     aq_calib.py in station-lake). LightGBM on log daily PM2.5 at 354 low-cost sensors (2024-2026): the composition forecast's daily
     means (PM2.5, PM10, dust, AOD, NO2, CO, SO2, O3), the day's weather and the 250 m surface at the place. Judged with each
     monitored city held out (all its sensors removed) at the US diplomatic-post monitors, 3,085 monitor-days: daily MAE 43.4 ->
     26.3 ug/m3, Unhealthy-day detection 0.36 -> 0.81 (false alarms 0.11 -> 0.16). Within reachKm of a monitor the per-city
     correction stands (it scored better there); where a composition input is missing the composition value is served. */
  let PMN = null, pmnAt = 0; const STAT = new Map();
  const pmn = () => { const f = join(dataDir, 'pm25-national.json'); try { const st = statSync(f); if (!PMN || st.mtimeMs !== pmnAt) { PMN = JSON.parse(readFileSync(f, 'utf8')); pmnAt = st.mtimeMs; STAT.clear(); } } catch (_) { PMN = null; } return PMN; };
  const FG = () => app.featGrid || (app.featGrid = createFeatGrid(dataDir));
  function staticOf(u, N) {
    const k = u.lat + ',' + u.lon; if (STAT.has(k)) return STAT.get(k);
    const o = {}; for (const b of N.staticBands) { let v = null; try { v = FG().value(b, u.lat, u.lon); } catch (_) { v = null; } o[b] = v == null ? null : v; }
    STAT.set(k, o); return o;
  }
  function pmNational(u, date, x) {
    const N = pmn(); if (!N || process.env.NIGRAAN_PMN === '0' || !u || u.lat == null) return null;
    if (['cams_pm2_5', 'cams_pm10', 'cams_dust'].some((f) => x[f] == null)) return null;
    const doy = Math.round((Date.parse(date + 'T00:00:00Z') - Date.UTC(+date.slice(0, 4), 0, 1)) / 864e5) + 1;
    const sv = staticOf(u, N), dom = (N.apply && N.apply.domain) || null;   /* v91.17.199 · served only inside the sensors' domain */
    if (dom && (!(dom.f_settle || []).includes(sv.f_settle) || !(sv.t_elev != null && sv.t_elev <= dom.t_elevMaxM))) return null;
    const all = { ...x, doy_s: Math.sin(2 * Math.PI * doy / 365.25), doy_c: Math.cos(2 * Math.PI * doy / 365.25), ...sv };
    const xv = N.features.map((f) => all[f] == null || !isFinite(all[f]) ? null : all[f]);
    const v = Math.exp(lgbEval(N.model, xv)) * N.smear;
    const [lo, hi] = (N.trainRange && N.trainRange.cams_pm2_5) || [0, Infinity];
    /* inputs: the feature vector exactly as the model read it (feature order of data/pm25-national.json), for the internal input archive */
    return { value: r1(v), version: N.version, heldOutMaeUgm3: N.heldOut && N.heldOut.all ? Math.round(N.heldOut.all.mae_model * 10) / 10 : null, extrapolated: x.cams_pm2_5 > hi || x.cams_pm2_5 < lo,
      inputs: Object.fromEntries(N.features.map((f, k) => [f, xv[k] == null ? null : r3(xv[k])])) };
  }
  function dailies(u, aq, met, icon, sink = null, vsink = null) {
    const days = new Map();
    const AQX = ['aerosol_optical_depth', 'nitrogen_dioxide', 'carbon_monoxide', 'sulphur_dioxide', 'ozone'];   /* v91.17.199 · national PM2.5 inputs */
    const aqx = Object.fromEntries(AQX.map((k) => [k, col(aq, k)]));
    aq = { time: col(aq, 'time'), pm2_5: col(aq, 'pm2_5'), pm10: col(aq, 'pm10'), dust: col(aq, 'dust') };   /* v283.24: the provider's own us_aqi is not read (the AQI is the server's, aqiOf below) */
    met = { time: col(met, 'time'), boundary_layer_height: col(met, 'boundary_layer_height'), wind_speed_10m: col(met, 'wind_speed_10m'), wind_direction_10m: col(met, 'wind_direction_10m'), relative_humidity_2m: col(met, 'relative_humidity_2m'), temperature_2m: col(met, 'temperature_2m'), temperature_925hPa: col(met, 'temperature_925hPa'), visibility: col(met, 'visibility') , cloud_cover: col(met, 'cloud_cover'), precipitation: col(met, 'precipitation'), shortwave_radiation: col(met, 'shortwave_radiation') };
    const get = (date) => { let d = days.get(date); if (!d) days.set(date, d = { date, pm: [], pm10: [], dust: [], vent: 0, ventN: 0, aft: [], aftB: [], aftW: [], inv: 0, fog: 0, rh: [], wind: [], wdir: [], blhMin: null }); return d; };
    aq.time.forEach((t, i) => { const d = get(t.slice(0, 10)); d.x = d.x || {}; for (const k of AQX) { const v = aqx[k][i]; if (v != null) (d.x[k] = d.x[k] || []).push(v); } if (aq.pm2_5[i] != null) d.pm.push(aq.pm2_5[i]); if (aq.pm10[i] != null) d.pm10.push(aq.pm10[i]); if (aq.dust[i] != null) d.dust.push(aq.dust[i]); });
    /* v91.17.4 · fail CLOSED on an unknown elevation. The 925 hPa inversion test
     is defined for low ground; an unknown height was being treated as low
     ground, so a mountain unit with no elevation would have been tested against
     a profile that does not apply to it. */
  const plains = u.elevM != null && u.elevM < 500;
    met.time.forEach((t, i) => {
      const d = get(t.slice(0, 10)), hr = Number(t.slice(11, 13));
      const blh = met.boundary_layer_height[i], ws = met.wind_speed_10m[i], rh = met.relative_humidity_2m[i], t2 = met.temperature_2m[i], vis = met.visibility[i];
      /* v91.17.283.10 · the inversion pair from one ICON column at the same hour; masked where 925 hPa is under the model ground */
      const j = icon && icon.ix ? icon.ix.get(t) : undefined, it2 = j == null ? null : icon.t2[j], it925 = j == null ? null : icon.t925[j], isp = j == null ? null : icon.sp[j];
      const invOk = it2 != null && it925 != null && !(isp != null && isp <= 925);
      if (blh != null && ws != null) { d.ventN++; const vi = blh * ws / 3.6; if (vi < POOR_VENT) d.vent++; if (hr >= 12 && hr <= 16) { d.aft.push(vi); d.aftB.push(blh); d.aftW.push(ws); } d.blhMin = d.blhMin == null ? blh : Math.min(d.blhMin, blh); }
      if (plains && hr >= 4 && hr <= 10 && invOk) { d.invN = (d.invN || 0) + 1; if (it925 - it2 >= 0) d.inv++; }   /* v91.17.93: count the hours that could be tested */
      /* v91.17.69 · the fog test is the plains radiation-fog rule, applied on the same domain as the inversion test. On a
         mountain tehsil the model's 2 m humidity and visibility belong to a grid surface hundreds of metres above the
         valley floor, where cloud on the slope reads as "fog": Ali Abad (Hunza, 2,245 m) carried 2-7 fog hours a day
         under a clear sky on 25 Sep and the report turned them into "move early vehicle movements after 10:00". No
         mountain visibility record exists to test it, so it is withheld there, not scored. */
      /* v283.36 · launch item 19 · fog hours by the WMO definition only: forecast visibility under 1 km (the RH 95 % / wind / night-hours gates were house rules) */
      if (plains && vis != null) { d.fogN = (d.fogN || 0) + 1; if (vis < 1000) { d.fog++; (d.fogHrs || (d.fogHrs = [])).push(hr); } }   /* v283.51g3 · and WHICH hours (PKT), so a report never sets an action time on a fog hour already past */
      if (rh != null) d.rh.push(rh); if (ws != null) d.wind.push(ws);
      { const w = d.w = d.w || { t: [], blh: [], cc: [], pr: 0, prN: 0, sw: 0, swN: 0 }; const cc = (met.cloud_cover || [])[i], pr = (met.precipitation || [])[i], sw = (met.shortwave_radiation || [])[i];
        if (t2 != null) w.t.push(t2); if (blh != null) w.blh.push(blh); if (cc != null) w.cc.push(cc); if (pr != null) { w.pr += pr; w.prN++; } if (sw != null) { w.sw += sw; w.swN++; } }
      d.wdir.push([ws ?? null, met.wind_direction_10m[i] ?? null]);   /* v91.17.72 · transport direction for the upwind fire load */
    });
    const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    return [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map(d => {
      /* v91.17.283.3 · audit C11 · a 24-hour class needs a complete day: at least 75 % of the hours (18 of 24; US EPA 40 CFR Part 50
         Appendix N, 24-hour PM2.5 data completeness). A day with fewer hours of PM2.5 has no daily mean, AQI or class: "not assessed". */
      const pmComplete = d.pm.length >= AQ_DAY_MIN_HOURS, pm10Complete = d.pm10.length >= AQ_DAY_MIN_HOURS;
      const pmRaw = pmComplete ? mean(d.pm) : null, gc = pmCorrect(u, d.date, pmRaw);
      const w = d.w || { t: [], blh: [], cc: [], prN: 0, swN: 0 }, X = d.x || {};
      const nat = gc ? null : pmNational(u, d.date, { cams_pm2_5: pmRaw, cams_pm10: mean(d.pm10), cams_dust: mean(d.dust),
        cams_aerosol_optical_depth: X.aerosol_optical_depth ? mean(X.aerosol_optical_depth) : null, cams_nitrogen_dioxide: X.nitrogen_dioxide ? mean(X.nitrogen_dioxide) : null,
        cams_carbon_monoxide: X.carbon_monoxide ? mean(X.carbon_monoxide) : null, cams_sulphur_dioxide: X.sulphur_dioxide ? mean(X.sulphur_dioxide) : null, cams_ozone: X.ozone ? mean(X.ozone) : null,
        wx_temperature_2m: mean(w.t), wx_relative_humidity_2m: mean(d.rh), wx_wind_speed_10m: mean(d.wind), wx_boundary_layer_height: mean(w.blh), wx_cloud_cover: mean(w.cc),
        wx_blh_min: d.blhMin, wx_rain: w.prN ? w.pr : null, wx_sun: w.swN ? w.sw : null });
      const pm0 = gc ? gc.value : nat ? nat.value : pmRaw;
      /* 1.0.4 · aq41 · one value per place: the served level x the tehsil's 1 km downscaling factor (population-weighted; pm25ds.mjs), released regions only */
      const dsf = pm0 != null && u ? PDS.unitFactor(u.unitId || u.uid, d.date) : null;
      const pm = dsf ? r1(pm0 * dsf.factor) : pm0, cls = pmClass(pm);
      /* v91.17.283.27 · item 7 · the inputs of the served PM2.5 of this tehsil-day, as the model read them (internal archive, logInputs) */
      if (sink && pmRaw != null) sink(d.date, Object.assign(dsf ? { downscaleFactor: dsf.factor, servedBeforeDownscale: r1(pm0) } : {}, gc ? { basis: 'ground-checked', group: 'monitor:' + gc.monitorCity, in: { cams_pm2_5: r3(pmRaw), doy: doyOf(d.date), monitorKm: gc.km, extrapolated: gc.extrapolated }, model: gc.version || null, served: r1(pm) }
        : nat ? { basis: 'national model', group: 'national', in: nat.inputs, model: nat.version || null, served: r1(pm) }
        : { basis: 'composition forecast', group: 'composition', in: { cams_pm2_5: r3(pmRaw) }, why: nat === null && pmn() ? 'outside the national model domain or a composition input missing' : 'no national model loaded', served: r1(pm) }));
      /* afternoon ventilation decides how well the day clears; nights are always shallow */
      const vi = d.aft.length ? d.aft.reduce((x, y) => x + y, 0) / d.aft.length : null;
      /* 1.0.4 · the inputs of the served ventilation index (internal archive, logVent): no served field changes */
      if (vsink) vsink(d.date, { blhAftM: d.aftB.length ? Math.round(mean(d.aftB)) : null, windAftKmh: r1(mean(d.aftW)), hoursAft: d.aft.length, blhMinM: d.blhMin == null ? null : Math.round(d.blhMin), windMeanKmh: r1(mean(d.wind)) });
      let disp = vi == null ? null : vi >= 6000 ? 0 : vi >= POOR_VENT ? 1 : vi >= 1000 ? 2 : 3;
      /* v283.36 item 19: no inversion step (the 3-hour rule was a house rule); the inversion hours are shown as a number */
      const A24 = pmComplete ? aqiOf(pm, pm10Complete ? mean(d.pm10) : null) : null;
      let AN = null; { const nowKey = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 13); const k = aq.time.findIndex(t => String(t).slice(0, 13) === nowKey);
        if (k >= 0 && String(aq.time[k]).slice(0, 10) === d.date) { const ratio = pmRaw > 0 && pm != null ? pm / pmRaw : 1; const lo = Math.max(0, k - 11);
          const p25 = aq.pm2_5.slice(lo, k + 1).map(v => v == null ? null : v * ratio), p10 = aq.pm10.slice(lo, k + 1);
          const n = aqiOf(nowcast(p25), nowcast(p10)); if (n) AN = { ...n, hourPkt: String(aq.time[k]).slice(0, 13) + ':00', basis: 'US EPA NowCast weighting of the 12 forecast hours ending at this hour (PM2.5 scaled to the served daily value); a forecast, not a measurement' }; } }
      return { date: d.date, pm25: r1(pm), pm25Cams: r1(pmRaw), ...(dsf ? { pm25Downscale: { factor: dsf.factor, season: dsf.season, region: dsf.region, servedBefore: r1(pm0), version: dsf.version } } : {}), ...(pmComplete ? {} : { aqNotAssessed: 'not assessed: ' + d.pm.length + ' of 24 hours of PM2.5 in this day (a daily class needs at least ' + AQ_DAY_MIN_HOURS + ', US EPA 40 CFR 50 App. N)' }),
        aqi: A24 ? A24.aqi : null, aqiCategory: A24 ? A24.category : null, aqiPollutant: A24 ? A24.pollutant : null, aqiNow: AN,
        aqiOwnBasis: 'AGN air quality index: US EPA AQI (2024 PM2.5 breakpoints, 89 FR 16202) from the served daily mean PM2.5 (' + (gc ? 'ground-checked' : nat ? 'national model' : 'composition forecast') + (dsf ? ', times the 1 km local factor of this tehsil' : '') + ') and the composition-forecast daily mean PM10 (uncorrected); the larger sub-index', groundChecked: gc ? { city: gc.monitorCity, km: gc.km, heldOutMaeUgm3: gc.heldOutMaeUgm3, extrapolated: gc.extrapolated, version: gc.version } : false, pm25Basis: gc ? 'ground-checked' : nat ? 'national model' : 'composition forecast', nationalModel: nat ? { version: nat.version, heldOutMaeUgm3: nat.heldOutMaeUgm3, extrapolated: nat.extrapolated } : false, pm25Max: r1(d.pm.length ? Math.max(...d.pm) : null), pm10: r1(mean(d.pm10)), pm25MaxBasis: 'raw CAMS hourly maximum', dust: r1(mean(d.dust)),
        pmClass: cls, afternoonVentilation: vi == null ? null : Math.round(vi), poorVentHours: d.vent, inversionHours: plains && d.invN ? d.inv : null, inversionWhy: !plains ? 'not tested above 500 m (the 925 hPa test is a low-ground test)' : d.invN ? undefined : (icon && icon.ix ? 'no tested hour: 925 hPa under the model ground or missing' : 'not tested: the one-model (ICON global) inversion call did not return'), inversionSource: plains && d.invN ? 'ICON global 13 km, 2 m and 925 hPa of the same column (model ground)' : undefined, fogHours: plains && d.fogN ? d.fog : null, fogAt: plains && d.fogN ? (d.fogHrs || []) : null, fogWhy: plains ? undefined : 'withheld above 500 m: the fog rule is the plains radiation-fog test and a mountain grid surface is not the valley floor', rhMean: r1(mean(d.rh)), windMean: r1(mean(d.wind)), blhMin: d.blhMin,
        ...(() => { const w = vectorWind(d.wdir.map(x => x[0]), d.wdir.map(x => x[1])); return { windFrom: w.fromDeg, windVecMs: w.ms }; })(),
        dispersion: disp, smogDay: null, smogWhy: AIR_WITHHELD.smog,   /* v283.36 item 19: the smog-day binary is withheld */   /* v91.17.147 · audit F6 · unknown is null, not "No" */ hours: d.pm.length,
        /* v91.17.36 · AUDIT L02 · DUST IS A SEPARATE MECHANISM. Nokkundi 26 Sep: dust 1,700 µg/m³,
           PM10 974, AQI 789 — and no surface printed it; "smog day" needs poor dispersion, so a
           dust storm (wind 30 km/h, dispersion Good) could never be flagged. Classes on the daily
           mean dust mass: ≥150 elevated, ≥300 dust event, ≥1,000 severe dust storm (CAMS mass
           concentration; indicative, not a visibility observation). */
        /* v91.17.283.35 · audit D4 · the dust daily mean needs a complete day too (18 of 24 hours, as PM2.5); the bands are an untested house rule (C5) */
        ...(d.dust.length >= AQ_DAY_MIN_HOURS ? { dustClass: null, dustDay: null, dustWhy: AIR_WITHHELD.dust } : { dustClass: null, dustDay: null, dustNotAssessed: 'not assessed: ' + d.dust.length + ' of 24 hours of dust in this day (a daily value needs at least ' + AQ_DAY_MIN_HOURS + ')' }) };
    });
  }

  /* ══ v91.17.170 · THE AIR FORECAST IS KEPT AS IT WAS ISSUED ══════════════════════════════════════════════════════════════
     The Punjab provincial stations (server/api/epdaq.mjs, internal) give hourly PM2.5 at about 50 sites from 4 Oct 2026, but a
     forecast can only be scored on what was issued BEFORE the day, not on today's re-run. Once per 12 h block (00 / 12 UTC) the
     daily PM2.5 of every Punjab and Islamabad (Federal Capital) tehsil is appended with its lead: cams = the composition model alone, served = what
     the product showed (the ground-checked value where one applies). scripts/aq_issued_score.py scores both against the
     stations' daily means. station-lake/archive/aq/issued_YYYY-MM.jsonl. */
  const aqLake = join(dataDir, '..', '..', 'station-lake', 'archive', 'aq'); let lastBlock = null;
  /* ══ v91.17.283.27 · item 7 · THE INPUTS OF THE SERVED PM2.5, BY LEAD (internal) ═══════════════════════════════════════════════════
     So that days 2-5 can be tested later against the stations, every run's model inputs are archived once per 12 h block (00 / 12 UTC,
     the issued-forecast block above): per tehsil and day, its place group (monitor:<city> = the per-city ground check, national = the
     national PM2.5 model, composition = the composition forecast alone), the lead, the inputs exactly as that model read them (the
     national model's whole feature vector in its own order; the city check's composition PM2.5, day of year and distance) and the served
     value. station-lake/archive/aq/inputs_YYYY-MM.jsonl.gz (one gzip member per block, whole members only: gzsafe.mjs), the archive the
     verification agent reads (--lake). Internal only: never served, no route. Served values are not changed. */
  let lastInBlock = null;
  function logInputs(o, INP) {
    const now = new Date(), block = now.toISOString().slice(0, 10) + (now.getUTCHours() >= 12 ? 'T12' : 'T00');
    if (block === lastInBlock || !INP || !INP.size) return { written: false, why: block === lastInBlock ? 'block already archived' : 'no inputs' }; const mf = join(aqLake, '.lastinputs');
    try { if (readFileSync(mf, 'utf8').trim() === block) { lastInBlock = block; return { written: false, why: 'block already archived' }; } } catch (_) {}
    const issued = now.toISOString().slice(0, 16) + 'Z', d0 = new Date(now.getTime() + 5 * 3600e3).toISOString().slice(0, 10), lines = [];
    for (const [uid, byDate] of INP) for (const [date, x] of byDate) { const lead = Math.round((Date.parse(date) - Date.parse(d0)) / 864e5); if (lead < 0) continue;
      lines.push(JSON.stringify({ issued, run: o.at || null, uid, date, lead, ...x })); }
    if (!lines.length) return { written: false, why: 'no lead >= 0' };
    mkdirSync(aqLake, { recursive: true }); const f = join(aqLake, 'inputs_' + issued.slice(0, 7) + '.jsonl.gz');
    appendGzMember(f, gzipSync(Buffer.from(lines.join('\n') + '\n')));
    writeFileSync(mf, block); lastInBlock = block; return { written: true, file: f, lines: lines.length };
  }
  function logIssued(o) {
    const now = new Date(), block = now.toISOString().slice(0, 10) + (now.getUTCHours() >= 12 ? 'T12' : 'T00');
    if (block === lastBlock) return; const mf = join(aqLake, '.lastblock');
    try { if (readFileSync(mf, 'utf8').trim() === block) { lastBlock = block; return; } } catch (_) {}
    const issued = now.toISOString().slice(0, 16) + 'Z', d0 = new Date(now.getTime() + 5 * 3600e3).toISOString().slice(0, 10), lines = [];
    for (const [uid, rows] of Object.entries(o.units || {})) {
      if (!/^(Punjab|Federal Capital)\|/.test(uid)) continue;
      for (const r of rows) { const lead = Math.round((Date.parse(r.date) - Date.parse(d0)) / 864e5); if (lead < 0 || r.pm25Cams == null) continue;
        lines.push(JSON.stringify({ issued, uid, date: r.date, lead, cams: r.pm25Cams, served: r.pm25, basis: r.pm25Basis || null, gc: r.groundChecked ? r.groundChecked.city : null, hours: r.hours })); }
    }
    if (!lines.length) return;
    mkdirSync(aqLake, { recursive: true }); appendFileSync(join(aqLake, 'issued_' + issued.slice(0, 7) + '.jsonl'), lines.join('\n') + '\n');
    writeFileSync(mf, block); lastBlock = block;
  }
  /* ══ 1.0.4 (owner 31 Oct 2026 10:53 PKT) · THE SERVED VENTILATION INDEX, KEPT DAILY (internal) ═════════════════════════════════════
     Once per PKT run day (the first stored run of the day), per tehsil and forecast day: the served afternoon ventilation index (mean over
     12-16 h PKT of boundary-layer height x 10 m wind / 3.6, m2/s, exactly afternoonVentilation of data/smog.json) and its inputs: the
     afternoon mean boundary-layer height (m) and 10 m wind (km/h), the hours they came from, the day's minimum boundary-layer height and
     mean wind, and the served dispersion class. The values come from the smog run's own met call (no extra provider call). Appended to
     station-lake/archive/aq/vent_YYYY-MM.jsonl.gz (one gzip member per run day, whole members only: gzsafe.mjs); marker .lastvent.
     Internal only: never served, no route. NIGRAAN_VENT_ARCHIVE=0 switches it off. */
  let lastVentDay = null;
  function logVent(o, V) {
    if (process.env.NIGRAAN_VENT_ARCHIVE === '0') return { written: false, why: 'off' };
    const now = new Date(), day = new Date(now.getTime() + 5 * 3600e3).toISOString().slice(0, 10);
    if (day === lastVentDay || !V || !V.size) return { written: false, why: day === lastVentDay ? 'run day already archived' : 'no ventilation inputs' };
    const mf = join(aqLake, '.lastvent');
    try { if (readFileSync(mf, 'utf8').trim() === day) { lastVentDay = day; return { written: false, why: 'run day already archived' }; } } catch (_) {}
    const lines = [];
    for (const [uid, rows] of Object.entries(o.units || {})) { const byDate = V.get(uid); if (!byDate) continue;
      for (const r of rows) { const x = byDate.get(r.date); if (!x) continue; const lead = Math.round((Date.parse(r.date) - Date.parse(day)) / 864e5); if (lead < 0) continue;
        lines.push(JSON.stringify({ runDay: day, run: o.at || null, uid, date: r.date, lead, ventServed: r.afternoonVentilation, dispersion: r.dispersion, ...x, source: 'provider forecast (best_match), the smog run\'s own call' })); } }
    if (!lines.length) return { written: false, why: 'no lead >= 0' };
    mkdirSync(aqLake, { recursive: true }); const f = join(aqLake, 'vent_' + day.slice(0, 7) + '.jsonl.gz');
    appendGzMember(f, gzipSync(Buffer.from(lines.join('\n') + '\n')));
    writeFileSync(mf, day); lastVentDay = day; return { written: true, file: f, lines: lines.length };
  }
  async function run() {
    if (running || !provider.configured()) return { started: false };
    running = true; const t0 = Date.now();
    const out = { at: null, days: [], units: {}, failedUnits: 0 }; const INP = new Map();   /* v283.27 item 7: uid -> date -> model inputs */
    const VENT = new Map();   /* 1.0.4: uid -> date -> ventilation inputs (logVent) */
    try {
      /* v91.17.101 · audit A · 436 of 576 units failed in one run and the map showed 140 with no reason: a failed batch is now
         split and retried once (smaller requests after a pause), and a run that covers fewer units than the stored one no longer
         replaces it */
      const batches = []; for (let i = 0; i < pool().length; i += 50) batches.push(pool().slice(i, i + 50));
      const ICON = new Map();   /* v91.17.283.10 · unitId -> the one-model inversion column */
      for (let bi = 0; bi < batches.length; bi++) {
        const b = batches[bi];
        const base = { latitude: b.map(u => u.lat), longitude: b.map(u => u.lon), forecast_days: 5, timezone: TZ };
        let A, M;
        try {
          /* v91.17.147 · audit: the air-quality call sends no height, but its answer echoes the composition grid's height, so the
             height check of alignBatch refused most rows and 436 of 576 tehsils had no air reading. Matched on position only. */
          A = list(await provider.call('airQuality', '/v1/air-quality', { ...base, hourly: ['pm2_5', 'pm10', 'dust', 'aerosol_optical_depth', 'nitrogen_dioxide', 'carbon_monoxide', 'sulphur_dioxide', 'ozone'] }, { locations: b.length, timeoutMs: 120000 }), b.map((u) => ({ lat: u.lat, lon: u.lon })));
          M = list(await provider.call('forecast', '/v1/forecast', { ...base, elevation: b.map(u => u.elevM ?? 'nan'), hourly: ['boundary_layer_height', 'wind_speed_10m', 'wind_direction_10m', 'relative_humidity_2m', 'temperature_2m', 'visibility', 'cloud_cover', 'precipitation', 'shortwave_radiation'] }, { locations: b.length, timeoutMs: 120000 }), b);
          /* v91.17.283.10 · the one-model inversion pair, plains units only; a failure leaves the inversion untested, not mixed */
          const pb = b.filter((u) => u.elevM != null && u.elevM < 500);
          if (pb.length) { try { const I = list(await provider.call('forecast', '/v1/forecast', { latitude: pb.map(u => u.lat), longitude: pb.map(u => u.lon), elevation: pb.map(() => 'nan'), forecast_days: 5, timezone: TZ, models: 'icon_global', hourly: ['temperature_2m', 'temperature_925hPa', 'surface_pressure'] }, { locations: pb.length, timeoutMs: 120000 }), pb);
              pb.forEach((u, k) => { const h = I[k] && I[k].hourly; if (h && Array.isArray(h.time)) ICON.set(u.unitId, { ix: new Map(h.time.map((t, q) => [t, q])), t2: h.temperature_2m || [], t925: h.temperature_925hPa || [], sp: h.surface_pressure || [] }); });
            } catch (e) { lastError = 'one-model inversion call: ' + e.message; } }
        } catch (e) { if (b.length > 10 && !b.__retry) { await new Promise(r => setTimeout(r, 5000)); const h = Math.ceil(b.length / 2); const x = b.slice(0, h), y = b.slice(h); x.__retry = y.__retry = true; batches.push(x, y); lastError = e.message; continue; } out.failedUnits += b.length; lastError = e.message; continue; }
        b.forEach((u, k) => { const a = A[k] && A[k].hourly, m = M[k] && M[k].hourly; if (!a || !m) { out.failedUnits++; return; } out.units[u.unitId] = dailies(u, a, m, ICON.get(u.unitId), (date, x) => { let M = INP.get(u.unitId); if (!M) INP.set(u.unitId, M = new Map()); M.set(date, x); }, (date, x) => { let M = VENT.get(u.unitId); if (!M) VENT.set(u.unitId, M = new Map()); M.set(date, x); }).filter(d => d.hours >= 12); if (!out.days.length) out.days = out.units[u.unitId].map(d => d.date); });
      }
      out.at = new Date().toISOString(); out.seconds = Math.round((Date.now() - t0) / 1000);
      const nNew = Object.keys(out.units).length, nOld = S && S.units ? Object.keys(S.units).length : 0, oldAgeH = S && S.at ? (Date.now() - Date.parse(S.at)) / 3600e3 : Infinity;
      if (nNew && nNew < nOld && nNew < 0.9 * pool().length && oldAgeH < 12) { lastError = 'partial run kept aside: ' + nNew + ' units (stored run ' + nOld + ', ' + Math.round(oldAgeH) + ' h old); ' + out.failedUnits + ' failed'; if (S) S.lastPartial = { at: new Date().toISOString(), units: nNew, failed: out.failedUnits }; }
      else if (nNew) { S = out; const tmp = file + '.tmp'; writeFileSync(tmp, JSON.stringify(out)); try { renameSync(tmp, file); } catch { writeFileSync(file, JSON.stringify(out)); } lastError = null; app.jobOk && app.jobOk('smog'); try { logIssued(out); } catch (e) { console.error('  smog issue log', e.message); }
        try { for (const [uid, M] of INP) { const keepD = new Set((out.units[uid] || []).map((d) => d.date)); for (const dt of [...M.keys()]) if (!keepD.has(dt)) M.delete(dt); } logInputs(out, INP); } catch (e) { console.error('  smog input archive', e.message); }
        try { logVent(out, VENT); } catch (e) { console.error('  smog ventilation archive', e.message); } }
      console.log(`  smog: ${Object.keys(out.units).length} tehsils, ${out.days.length} days in ${out.seconds}s` + (out.failedUnits ? ` · ${out.failedUnits} failed (${lastError || 'no reason'})` : ''));
      return { started: true };
    } finally { running = false; }
  }
  const ageH = () => S && S.at ? (Date.now() - Date.parse(S.at)) / 3600e3 : Infinity;
  function tick() { if (process.env.NIGRAAN_SMOG !== '0' && provider.configured() && ageH() >= 3 && !running) run().catch(e => { lastError = e.message; console.error('  smog error', e.message); });
    /* v91.17.72 · the fire refresh rides on the smog schedule (index.mjs calls tick every cycle); open NASA files, no key */
    try { if (!FC) fires(); } catch {}
    /* a failed fetch is retried after 30 min, not on every cycle */
    if (process.env.NIGRAAN_FIRES !== '0' && !fRunning && Date.now() - fTried > 30 * 60e3 && firesAgeH() >= ((FC && FC.refreshHours) || 3)) runFires(); }
  /* v91.17.69 · the plains fog gate is also applied where a stored run is served, so a run written before the gate
     cannot put mountain fog back on a card or a report */
  const FOG_WHY = 'withheld above 500 m: the fog rule is the plains radiation-fog test and a mountain grid surface is not the valley floor';
  /* v91.17.283.53 · C · the tehsil of an id by an index (rebuilt when the unit list changes), not a scan of 576 records per call: unit() is
     called for every tehsil read of every place bundle (placesummary airOfUnit), 3 s of event-loop time in 90 s on the test server */
  let UIX = null, UIXsrc = null, UIXn = -1; const tehsilOf = (unitId) => { const T = units.tehsil; if (UIXsrc !== T || UIXn !== T.length) { UIX = new Map(); for (const x of T) if (!UIX.has(x.unitId)) UIX.set(x.unitId, x); UIXsrc = T; UIXn = T.length; } return UIX.get(unitId); };
  const plainsOf = (unitId) => { const u = tehsilOf(unitId); return !!(u && u.elevM != null && u.elevM < 500); };
  const strip36 = (r) => (r ? { ...r, smogDay: null, smogWhy: AIR_WITHHELD.smog, dustClass: null, dustDay: null, ...(r.dust != null || r.dustClass != null ? { dustWhy: AIR_WITHHELD.dust } : {}) } : r);   /* v283.36 item 19: also a run stored before 1.0 */
  const gateFog = (unitId, rows) => (plainsOf(unitId) ? rows : rows.map(r => ({ ...r, fogHours: null, fogAt: null, fogWhy: FOG_WHY }))).map(strip36);
  function unit(unitId) {
    const d0 = S && S.units[unitId]; if (!d0) return null; const d = withFires(tehsilOf(unitId), gateFog(unitId, d0));
    return { at: S.at, ...fresh(), days: d, classes: PM_CLASSES.map(c => c.label), dispersion: DISPERSION, dustClasses: null, withheld: AIR_WITHHELD,
      caveats: [AIR_UNTESTED, 'dispersion bands (ventilation index) are generic fire-weather bands, not yet tuned to Pakistan; the smog-day binary inherits that', 'an AQI above 500 continues on the slope of the 301-500 segment (US EPA technical assistance document 2024); the category stays Hazardous', 'a day with fewer than 24 hours of data is a partial day and is marked'],
      fireClasses: FIRE_LABELS(), firesSource: fires() ? { attribution: 'NASA FIRMS', observed: fireWindow() && fireWindow().days, at: F.at } : null,
      notes: ['PM2.5: near the four monitored cities (within 30 km) a per-city correction of the CAMS global forecast; in cities, towns and suburbs elsewhere the national PM2.5 model (CAMS composition, the day\'s weather and the 250 m surface, trained on 354 low-cost sensors; with each monitored city held out it cut the daily error at the monitors from 43 to 26 ug/m3). In rural and high-mountain places (no sensors there) and where a composition input is missing the raw CAMS value is shown, marked. Days 2-5 carry the composition forecast\'s own error.', 'Crop burning upwind: NASA FIRMS satellite fire detections of the last 3 days within 300 km, weighted toward the forecast wind direction; it explains a smog day, it does not change it.', 'Dispersion uses the ventilation index (boundary-layer height × wind) and morning inversions; it flags smog-trapping weather regardless of emissions.', 'Not yet verified against PM2.5 monitors.'] };
  }
  function national(dayIndex = 1) {
    if (!S) return { ready: false };
    const k = Math.max(0, Math.min(S.days.length - 1, Number(dayIndex) || 0));
    const byId = new Map(units.tehsil.map(u => [u.unitId, u]));
    /* v91.17.68 · the day is looked up by date, not by position: a unit that lost its first day was served under the wrong date (A12);
       a unit no longer in the registry is skipped, not a TypeError */
    const want = S.days[k];
    const rows = Object.entries(S.units).map(([id, d]) => { const u = byId.get(id); if (!u) return null; const x0 = (d || []).find(y => y && y.date === want) || {}; const x = strip36((u.elevM != null && u.elevM < 500) ? x0 : { ...x0, fogHours: null, fogAt: null }); const fz = x.date ? fireFor(u, x) : null; return { unitId: id, name: u.name, district: u.district, province: u.province, ...x, fires: fz || undefined }; }).filter(r => r && r.date);
    const byClass = PM_CLASSES.map((c, i) => ({ label: c.label, tehsils: rows.filter(r => r.pmClass === i).length }));
    const byDisp = DISPERSION.map((l, i) => ({ label: l, tehsils: rows.filter(r => r.dispersion === i).length }));
    const top = (f, key) => rows.filter(f).sort((a, b) => key(b) - key(a)).slice(0, 12).map(r => ({ unitId: r.unitId, name: r.name, district: r.district, province: r.province, pm25: r.pm25, pmClass: r.pmClass, dispersion: r.dispersion, fogHours: r.fogHours, poorVentHours: r.poorVentHours, inversionHours: r.inversionHours, dust: r.dust, dustClass: r.dustClass, pm10: r.pm10, aqi: r.aqi, aqiCategory: r.aqiCategory, windMean: r.windMean }));
    const prov = {};
    for (const r of rows) { const p = prov[r.province] = prov[r.province] || { n: 0, pm: [], smog: 0, fog: 0, poor: 0 }; p.n++; if (r.pm25 != null) p.pm.push(r.pm25); if (r.smogDay) p.smog++; if (r.fogHours >= 3) p.fog++; if (r.dispersion >= 2) p.poor++; }
    const med = (a) => { const q = a.slice().sort((x, y) => x - y); return q.length ? q[Math.floor(q.length / 2)] : null; };
    return { ready: true, at: S.at, ...fresh(), untestedRules: AIR_UNTESTED, days: S.days, date: S.days[k], dayIndex: k, tehsils: rows.length, byClass, byDispersion: byDisp, classes: PM_CLASSES.map(c => c.label), dispersionLabels: DISPERSION,
      smogDays: null, fogRisk: null, withheld: AIR_WITHHELD, fogHoursAny: rows.filter(r => r.fogHours > 0).length,   /* v283.36 item 19 */
      dustDays: null, dustClasses: null,
      byDust: null,
      dispersionBandsCaveat: 'ventilation-index bands are generic fire-weather bands, not yet tuned to Pakistan boundary-layer climatology; the Poor/Very poor counts and the smog-day binary inherit that',
      top: { pm25: top(r => r.pm25 != null, r => r.pm25), smog: null, dust: top(r => r.dust != null, r => r.dust), fog: top(r => r.fogHours > 0, r => r.fogHours),   /* v283.36 item 19: highest dust mass and fog hours, no band */ stagnant: top(r => r.dispersion >= 2, r => r.poorVentHours + (r.inversionHours || 0)) },
      /* v91.17.72 · crop burning upwind (explanatory; NASA FIRMS) */
      fires: fireWindow() ? { observed: fireWindow().days, attribution: 'NASA FIRMS', classes: FIRE_LABELS(), byClass: FIRE_LABELS().map((l, i) => ({ label: l, tehsils: rows.filter(r => r.fires && r.fires.cls === i).length })),
        withReason: rows.filter(r => r.fires && r.fires.reason).length,
        sectors: Object.entries(fires().sectors || {}).map(([id, v]) => ({ id, label: v.label, fires: v.days.filter(x => fireWindow().days.includes(x[0])).reduce((a, x) => a + x[1], 0) })).filter(x => x.fires > 0).sort((a, b) => b.fires - a.fires),
        top: rows.filter(r => r.fires && r.fires.load > 0).sort((a, b) => b.fires.load - a.fires.load).slice(0, 12).map(r => ({ unitId: r.unitId, name: r.name, district: r.district, province: r.province, upwind: r.fires.upwind, load: r.fires.load, label: r.fires.label, topSector: r.fires.topSector, reason: r.fires.reason })) } : null,
      provinces: Object.entries(prov).map(([name, p]) => ({ name, tehsils: p.n, pm25Median: r1(med(p.pm)), smogDays: null, fogRisk: null, poorDispersion: p.poor })).sort((a, b) => b.tehsils - a.tehsils) };
  }
  const status = () => ({ at: S && S.at, tehsils: S ? Object.keys(S.units).length : 0, days: S ? S.days.length : 0, running, lastError,
    fires: { at: fires() ? F.at : null, n: F ? F.n : 0, running: fRunning, lastError: fError } });
  /* v91.17.282.1 · FIX2821 · what a caller of /api/smog/* receives (the internal dailies and the issued-forecast log keep their fields): no held-out MAE and no "ground-checked" claim (the issued air forecast has
     no score yet); stored results of earlier runs are cleaned on the way out too. The scoring log (issued) keeps its own fields. */
  const served = (o) => o == null ? o : JSON.parse(JSON.stringify(o, (k, v) => k === 'heldOutMaeUgm3' ? undefined : k === 'pm25Basis' && v === 'ground-checked' ? 'monitor-city correction'
    : typeof v === 'string' ? v.replace(/\bnot ground-checked\b/g, 'without the monitor-city correction').replace(/\bare ground-checked\b/g, 'carry the monitor-city correction').replace(/\bground-checked\b/g, 'monitor-city correction') : v));
  return { run, tick, unit: (id) => served(unit(id)), national: (k) => served(national(k)), status, runFires, fireFor, FIRE_LABELS, PM_CLASSES, DISPERSION, DUST_CLASSES, _dailies: dailies };   /* _dailies: scripts/pm25n-e2e (test only) */
}
