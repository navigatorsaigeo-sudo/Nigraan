/* 15-day probabilistic outlook (ECMWF IFS ENS, 51 members) and a satellite sunshine
   check for every tehsil. Kept in its own file (data/outlook.json) so the main store
   stays small.

   What the numbers are
   - Percentiles p10/p50/p90 over the 51 members of the daily value, downscaled to the
     tehsil's population-weighted elevation (provider lapse-rate adjustment).
   - Probabilities are raw member fractions ("31 of 51 members"). ENS is not yet verified
     or calibrated in this system: short-range spread is known to be too narrow, so a
     90% here is less certain than it reads. The deterministic 24-72 h forecast
     (bias-corrected, grade A) stays the reference for the first three days.
   - Sunshine check: satellite-derived shortwave (satellite_radiation_seamless, ~1 h
     latency) against the forecast model's shortwave for the same hours. A ratio well
     below 1 means cloud the model missed, so its afternoon temperature tends to run warm. */
import { readFileSync, writeFileSync, renameSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { alignBatch } from './provider.mjs';
import { downscaleFor, aiEnabled } from './downscale.mjs';
import { createEventClimate, zoneFrom } from './outlookclim.mjs';
import { createPointHeight } from './pointheight.mjs';
import { rainClassSharesCalibrated, memberStats, rainClassMm } from './rainprob.mjs';   /* v91.17.283.15 · item 9: calibrated rain probability, leads 1-3 */
import { createEnsMembers } from './ensmembers.mjs';   /* v91.17.284 · ENS member archive: the raw members this module already receives (no extra call) */   /* v91.17.283.3 · W3 · the point's own terrain height */

const SNOW_CM_TO_MM_DIVISOR = 0.7;
/* v91.17.283.3 · SCI item 6 · audit C9 · SNOW STILL LYING ON DAY k: the snowfall of days k-5..k-1 kept as a degree-day pack.
   SWE_j = max(0, SWE_{j-1} + snow_cm_j / 0.7 - ddf * max(0, (Tmax_j + Tmin_j) / 2 - base)); returns the pack as cm of fresh snow
   (SWE x 0.7, the provider's own ratio), or null when a window day lacks snowfall, Tmax or Tmin. P: data/snowpack-ddf.json. Pure. */
export function lyingSnowCm(sn, tx, tn, k, P) {
  const ddf = Number(P && P.ddf), base = Number(P && P.meltBaseC != null ? P.meltBaseC : 0); if (!(ddf > 0) || !sn || !tx || !tn) return null;
  let swe = 0;
  for (let j = Math.max(0, k - 5); j < k; j++) { if (sn[j] == null || tx[j] == null || tn[j] == null || !isFinite(sn[j]) || !isFinite(tx[j]) || !isFinite(tn[j])) return null;
    swe = Math.max(0, swe + sn[j] / SNOW_CM_TO_MM_DIVISOR - ddf * Math.max(0, (tx[j] + tn[j]) / 2 - base)); }
  return swe * SNOW_CM_TO_MM_DIVISOR;
}
/* v91.17.70 · served text for the heat-spell sub-classes (the stored runs carried a station-record figure; unit() serves this) */
const HEAT_CLASSES_WHY = 'one warm spell seen through three windows, so these are sub-classes of one event and never three separate events. dayAndNight is the operationally important one: a hot spell with no overnight relief.';   /* Open-Meteo: snowfall_cm = water_mm x 0.7 (measured 1.4286 mm/cm at Skardu over 238 pure-snow days) */

/* ══ v91.17.3 · 2.13 / 2.17 · EVERY THRESHOLD CARRIES ITS MEASURED SKILL ════
   Each of these was a bare share of ensemble members. A share of members is
   not a probability and says nothing about whether the model can resolve the
   thing being counted. Where the threshold has been tested against a ground
   record, the test result travels with it and every consumer prints it.

   Tested against the PMD 10-minute record at three cities (Multan 2024-26,
   Lahore 2024-26, Karachi 2021-26, timestamps read as UTC, daily maximum from
   the reported extreme):

     40 °C  Multan  191 observed days, 233 model days, detection 0.92, false 0.24
            Lahore  108 observed days,  91 model days, detection 0.79, false 0.07
            Karachi  27 observed days,  24 model days, detection 0.48, false 0.46
     45 °C  Multan    8 observed days,  46 model days, detection 1.00, false 0.83
            Lahore   13 observed days,   5 model days, detection 0.38, false 0.00

   40 °C inland is a defensible product. 45 °C is not: Multan raises six alerts
   for every real day and Lahore misses eight of its thirteen. It is kept,
   because a probability with a stated false-alarm rate is more useful than
   silence, and it is labelled uncalibrated so nobody reads it as a warning.

   The gust threshold is suspended above 1,500 m. Measured against 6,935
   station-days of mountain gusts: the model runs 23.2 km/h against 13.7
   observed, and at the 40 km/h class the false-alarm rate is 0.96. Nineteen
   alerts in twenty are wrong. A number that wrong is not a weak signal, it is
   an absence of one, and it is withheld rather than shaded on a map. */
/* v283.36 · NIGRAAN 1.0 · launch items 17 / 20 / 23 · WITHHELD MEMBER-SHARE EVENTS: no published source and no test for the cut, so the
   share is not served. In their place the client reads values: the members' daily rain p10/p50/p90 (with the day's rarity on the tehsil's
   return levels), the 3-day total p10/p50/p90 against the place's local 99th percentile, the gust p10/p50/p90 km/h, the Tmin p10/p50/p90 and
   the place's heat index. The frost day (Tmin <= 0 C, ETCCDI FD) and the IMD 40 / 45 C maxima stay. */
export const WITHHELD_DAY_EVENTS = ['tn30', 'pr10', 'pr25', 'pr50', 'pr100', 'gu60'];
export const WITHHELD_EVENTS = ['coastalHeat', 'rain3_75', 'rain3Local', 'frostSpell'];
export const WITHHELD_WHY = 'withheld: the cut has no published source and was not tested; the values are shown instead';
const THRESHOLDS_ALL = [
  /* v91.17.70 · the skill strings are gone from the served thresholds (hard-coded station-record figures in customer
     text); the measured record stays in the internal skill sheet */
  { id: 'tx40', v: 'tx', op: '>=', x: 40, label: 'Max temperature ≥ 40 °C' },
  { id: 'tx45', v: 'tx', op: '>=', x: 45, label: 'Max temperature ≥ 45 °C' },
  { id: 'tn30', v: 'tn', op: '>=', x: 30, label: 'Night minimum ≥ 30 °C' },
  { id: 'tn0', v: 'tn', op: '<=', x: 0, label: 'Frost below 2,000 m: minimum ≤ 0 °C', maxElevM: 2000 },
  { id: 'sn10', v: 'sn', op: '>=', x: 10, label: 'Heavy snow: ≥ 10 cm in a day (screening, not verified: model snowfall caught 25% of such days at the snow stations)' },
  /* ══ v91.17.3 · 3.7 · THE RAINFALL LADDER IS NOW A LADDER ══════════════════
     Two rungs, 25 and 50 mm, do not describe a monsoon. The 51 members are
     already paid for and already fetched: adding rungs costs nothing because
     the weighting counts VARIABLES, not thresholds, and these are all computed
     from the one precipitation_sum series.
     Read these as the share of members crossing the line, which is what they
     are. They are NOT calibrated probabilities: the gauge record cannot
     calibrate one (17 of 46 gauges record under 100 mm a year, two record
     exactly zero) and the model cannot represent a convective peak at all —
     its highest hourly rainfall in a year was 7.3 mm/h against 45.5 observed. */
  { id: 'pr10', v: 'pr', op: '>=', x: 10, label: 'Daily rain ≥ 10 mm' },
  { id: 'pr25', v: 'pr', op: '>=', x: 25, label: 'Daily rain ≥ 25 mm' },
  { id: 'pr50', v: 'pr', op: '>=', x: 50, label: 'Daily rain ≥ 50 mm' },
  { id: 'pr100', v: 'pr', op: '>=', x: 100, label: 'Daily rain ≥ 100 mm (share of members; the model under-resolves convective peaks, so read this as a floor)' },
  { id: 'gu60', v: 'gu', op: '>=', x: 60, label: 'Gusts ≥ 60 km/h (not screened above 1,500 m)',
    maxElevM: 1500,
    skill: { basis: '6,935 mountain station-days of gusts',
             measured: 'model mean 23.2 km/h against 13.7 observed; at the 40 km/h class the false-alarm rate is 0.96',
             use: 'withheld above 1,500 m. Nineteen alerts in twenty were wrong, so no class is published there until the gust field is corrected or replaced' } },
];
export const THRESHOLDS = THRESHOLDS_ALL.filter((t) => !WITHHELD_DAY_EVENTS.includes(t.id));
/* v91.17.3 · 2.14 · apparent temperature is added because the coastal heat rule needs it.
   This is free on the paid plan: a call is weighted locations x max(1, vars/10) x
   max(1, days/14), so six variables weigh the same as five. */
export { RAIN_CLASS_MM } from './rainprob.mjs';   /* v91.17.283.27 · item 3: the 24-h rain classes are read from data/hazard-scale.json rainClasses24h (rainprob.mjs), not typed here */
/* the share of VALID members whose day total reaches each class; withheld when fewer than half of the members carry the day (pure) */
export function rainClassShares(v, nAll, basis = 'liquid rain') { const need = Math.ceil(nAll / 2);
  if (!nAll || v.length < need) return { p: null, n: v.length, of: nAll, why: 'not assessed: ' + v.length + ' of ' + nAll + ' members carry this day\u2019s rain; at least ' + need + ' are needed' };
  return { n: v.length, of: nAll, basis, p: Object.fromEntries(rainClassMm().map((t) => [String(t), Math.round(100 * v.filter((x) => x >= t).length / v.length)])) }; }
const VARS = { tx: 'temperature_2m_max', tn: 'temperature_2m_min', pr: 'precipitation_sum', gu: 'wind_gusts_10m_max', sn: 'snowfall_sum', at: 'apparent_temperature_max' };

/* ══ v91.17.3 · 2.14 · WHERE THE COAST IS ═══════════════════════════════════
   Karachi's heat is not Multan's heat and the 40 °C rule proves it: tested
   against the PMD record, 40 °C catches 92% of Multan's hot days with a 0.24
   false-alarm rate, and at Karachi it catches 48% with a 0.46 false-alarm
   rate. Half the hot days missed, half the alerts false. The sea breeze
   decides Karachi's afternoon and the model resolves it poorly; dry-bulb
   40 °C is also simply the wrong measurand on a coast where the danger is
   humid heat at 36 °C.
   A unit is coastal if it lies within 60 km of this polyline, which traces
   the Arabian Sea coast from the Iranian border to Sir Creek. Coordinates,
   not a name list: a name list cannot be checked and drifts as units are
   renamed. */
export const COASTLINE = [[61.74, 25.05], [62.33, 25.12], [63.47, 25.26], [64.63, 25.21],
                   [65.60, 25.38], [66.58, 25.42], [66.98, 24.80], [67.30, 24.75],
                   [67.45, 24.14], [67.90, 23.95], [68.35, 23.90], [68.75, 23.90]];
function haversineKm(la1, lo1, la2, lo2) {
  const R = 6371, d = Math.PI / 180;
  const a = Math.sin((la2 - la1) * d / 2) ** 2
          + Math.cos(la1 * d) * Math.cos(la2 * d) * Math.sin((lo2 - lo1) * d / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
export function coastKm(lat, lon) {
  if (lat == null || lon == null) return null;
  let best = Infinity;
  for (let i = 0; i < COASTLINE.length - 1; i++) {
    const [x1, y1] = COASTLINE[i], [x2, y2] = COASTLINE[i + 1];
    /* sample the segment; 10 points is well under the 60 km tolerance */
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const d = haversineKm(lat, lon, y1 + (y2 - y1) * t, x1 + (x2 - x1) * t);
      if (d < best) best = d;
    }
  }
  return Math.round(best);
}
const COAST_KM = 60;
const isCoastal = (u) => { const k = coastKm(u.lat, u.lon); return k != null && k <= COAST_KM; };
const MODEL = 'ecmwf_ifs025';
/* v91.17.283 · WS1 · D1 · the methods text of the 15-day outlook's update cadence */
const ENS_UPDATED = 'updated twice daily, from the 00 and 12 UTC ensemble runs';
const TZ = 'Asia/Karachi';
const r1 = (x) => x == null || !isFinite(x) ? null : Math.round(x * 10) / 10;

function pct(sorted, p) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
const localDate = (ms) => new Date(ms + 5 * 3600e3).toISOString().slice(0, 10);

/* v91.17.283.33 · Part 2 · the days 8-14 member shares against normal (pure; outlook.mjs week2Of, tests28333/tiers.unit) */
export function week2Shares(dates, M, normalOf) {
  /* v91.17.283.51 g1 F4: the members of the newest ensemble run often stop inside day 14 (live 3 Nov: "0 of 51 members carry all 7
     days" and the whole tier was empty). The shares are now taken over the longest run of days from day 8 that at least half of the
     members carry in full (days 8 to N, N <= 14), against the normal of the SAME days; the window is named (from / to / days). */
  const ks0 = []; for (let k = 8; k <= 14 && k < dates.length; k++) ks0.push(k);
  if (!ks0.length) return { ready: false, why: 'the ensemble run holds none of the days 8-14' };
  const nAll = (M.tx || []).length, need = Math.ceil(nAll / 2);
  const okT = (j, k) => { const a = M.tx[j] && M.tx[j][k], b = M.tn && M.tn[j] && M.tn[j][k]; return a != null && b != null && isFinite(a) && isFinite(b); };
  const liq = (j, k) => { const p0 = M.pr && M.pr[j] && M.pr[j][k]; if (p0 == null || !isFinite(p0)) return null; const s0 = M.sn && M.sn[j] && M.sn[j][k]; return s0 != null && isFinite(s0) ? Math.max(0, p0 - s0 / SNOW_CM_TO_MM_DIVISOR) : p0; };
  const lastK = (has) => { let best = -1; for (const kEnd of ks0) { let c = 0; for (let j = 0; j < nAll; j++) { let ok = true; for (let k = 8; k <= kEnd; k++) if (!has(j, k)) { ok = false; break; } if (ok) c++; } if (c >= need && nAll) best = kEnd; else break; } return best; };
  const kT = lastK(okT), kR = lastK((j, k) => liq(j, k) != null), kMax = Math.max(kT, kR);
  if (kMax < 8) return { ready: false, why: 'the members of this ensemble run do not carry day 8 in full yet' };
  const norm = {}; for (let k = 8; k <= kMax; k++) { let x = null; try { x = normalOf(dates[k]); } catch (_) { x = null; } if (!(x && isFinite(x.tm) && isFinite(x.pr))) return { ready: false, why: 'no 1991-2020 normal for these days at this tehsil (the climatology is not built)' }; norm[k] = x; }
  const pc = (a, b) => Math.round(100 * a / b), nd = (kE) => kE - 7;
  let temp; if (kT >= 8) { let tmN = 0; for (let k = 8; k <= kT; k++) tmN += norm[k].tm; tmN /= nd(kT); let n = 0, hot = 0;
      for (let j = 0; j < nAll; j++) { let s = 0, ok = true; for (let k = 8; k <= kT; k++) { if (!okT(j, k)) { ok = false; break; } s += (M.tx[j][k] + M.tn[j][k]) / 2; } if (ok) { n++; if (s / nd(kT) > tmN) hot++; } }
      temp = { hotterPct: pc(hot, n), colderPct: 100 - pc(hot, n), n, normalMeanC: Math.round(tmN * 10) / 10, from: dates[8], to: dates[kT], days: nd(kT) }; }
  else temp = { why: 'not assessed: fewer than half of the ' + nAll + ' members carry day 8' };
  let rain; if (kR >= 8) { let prN = 0; for (let k = 8; k <= kR; k++) prN += norm[k].pr; let wet = 0, heavy = 0, nr = 0;
      for (let j = 0; j < nAll; j++) { let tot = 0, okr = true, hv = false; for (let k = 8; k <= kR; k++) { const v = liq(j, k); if (v == null) { okr = false; break; } tot += v; if (v >= 15.6) hv = true; } if (okr) { nr++; if (tot > prN) wet++; if (hv) heavy++; } }
      rain = { wetterPct: pc(wet, nr), drierPct: 100 - pc(wet, nr), heavyDayPct: pc(heavy, nr), n: nr, normalTotalMm: Math.round(prN * 10) / 10, heavyDayMm: 15.6, from: dates[8], to: dates[kR], days: nd(kR) }; }
  else rain = { why: 'not assessed: fewer than half of the ' + nAll + ' members carry day 8' };
  return { ready: true, from: dates[8], to: dates[kMax], days: nd(kMax), members: nAll, ...(kMax < 14 ? { shortNote: 'days 8 to ' + kMax + ': the members of this run stop before day 14' } : {}), temp, rain };
  }
export function createOutlook(app, dataDir) {
  const { provider, units } = app;
  const file = join(dataDir, 'outlook.json');
  let S = { ensemble: null, radiation: null };
  let fileMt = 0;
  try { if (existsSync(file)) { fileMt = statSync(file).mtimeMs; S = Object.assign(S, JSON.parse(readFileSync(file, 'utf8'))); } } catch (e) { console.error('  outlook: unreadable outlook.json, starting empty'); }
  /* v91.17.283.22 · an issue another server of this computer completed and wrote since this one read the file (a deploy swap: 25 Oct, the
     15-day outlook of one run was fetched by both servers, 2 x 18,885 weighted calls) is taken from the file before a run is started */
  function adoptNewer() { try { if (!existsSync(file)) return; const m = statSync(file).mtimeMs; if (m === fileMt) return; fileMt = m;
      const D = JSON.parse(readFileSync(file, 'utf8')); const a = (D && D.ensemble && D.ensemble.issueInit) || 0, b = (S.ensemble && S.ensemble.issueInit) || 0;
      if (a > b && !running.ensemble) { S.ensemble = D.ensemble; console.log('  outlook: issue ' + new Date(a * 1000).toISOString().slice(0, 13) + 'Z taken from outlook.json (written by the other server)'); } } catch (_) {} }
  const running = { ensemble: false, radiation: false };
  const EM = createEnsMembers(dataDir);   /* v91.17.284 · data/ens_members (ensmembers.mjs) */
  const last = { ensemble: null, radiation: null, seasonal: null };
  function save() {
    const tmp = file + '.tmp'; writeFileSync(tmp, JSON.stringify(S));
    for (let i = 0; i < 5; i++) { try { renameSync(tmp, file); try { fileMt = statSync(file).mtimeMs; } catch (_) {} return; } catch { const t = Date.now() + 60; while (Date.now() < t); } }
    writeFileSync(file, JSON.stringify(S)); try { fileMt = statSync(file).mtimeMs; } catch (_) {}
  }
  const pool = () => units.tehsil.filter(u => !u.disputed && u.lat != null && u.lon != null);
  const batches = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
  const list = (x, b) => alignBatch(x, b);   /* v91.17.68 · aligned to the batch by coordinate (B10) */
  /* ══ v91.17.77 · SCI · THIRTEEN TEHSILS WERE READING ANOTHER TEHSIL'S MEMBERS ══════════════════════════════════════
     alignBatch matches reply rows to units by coordinate. Units that share an ensemble grid cell get identical
     coordinates back, and as soon as one row in a batch was not the nearest to its own unit the greedy fallback paired
     the tied rows in array order. MEASURED on the 27 Sep 06 UTC run: 13 units in two batches (Swat, Upper Dir, Upper
     Kohistan, Kolai Palas) held the members of a neighbour at another height: Palas (1,816 m) read the 767 m row
     (+7 C, heat spell 100 %), Seo (940 m) read the 1,816 m row (cold spell 100 %). Every call here sends the
     settlement height and the provider echoes it back, so the reply row is the unit's when the echoed height is the
     unit's height: order is kept when every row matches, otherwise rows are paired by height first, then distance. */
  const listH = (body, b) => {
    const arr = Array.isArray(body) ? body : (body ? [body] : []);
    const hOk = (r, u) => !!r && (u.elevM == null || r.elevation == null || Math.abs(r.elevation - u.elevM) <= 1);
    const dd = (r, u) => (!r || !Number.isFinite(r.latitude)) ? Infinity : Math.abs(r.latitude - u.lat) + Math.abs(r.longitude - u.lon);
    if (arr.length === b.length && b.every((u, i) => hOk(arr[i], u) && dd(arr[i], u) < 1)) return arr;
    const used = new Set();
    return b.map((u) => { let best = -1, bd = Infinity; arr.forEach((r, j) => { if (used.has(j) || !hOk(r, u)) return; const d = dd(r, u); if (d < bd) { bd = d; best = j; } }); if (best < 0 || !(bd < 1)) return null; used.add(best); return arr[best]; });
  };
  /* v91.17.77 · SCI · event definitions, floors and the ordinary guard are data (data/outlook-event-definitions.json) */
  let DEF = null, DEFat = 0;
  const defs = () => { if (DEF === null || Date.now() - DEFat > 10 * 60e3) { try { DEF = JSON.parse(readFileSync(join(dataDir, 'outlook-event-definitions.json'), 'utf8')); } catch (_) { DEF = false; } DEFat = Date.now(); } return DEF; };
  const EC = createEventClimate(dataDir);
  let SPK = null; try { const f = join(dataDir, 'snowpack-ddf.json'); if (existsSync(f)) { const J = JSON.parse(readFileSync(f, 'utf8')); if (J && J.served === true && Number(J.ddf) > 0) SPK = J; } } catch (_) { SPK = null; }   /* v91.17.283.3 · SCI item 6 */
  const zoneFile = zoneFrom(dataDir);
  /* v91.17.283.15 · item 9 · the coefficients of the calibrated rain probability (data/rain-prob-coefs.json, RULES_RAIN / RESULTS_RAIN):
     read on change; without the file the leads keep the member share */
  let RPC = null, RPCm = 0; const rainCoefs = () => { try { const f = join(dataDir, 'rain-prob-coefs.json'), m = statSync(f).mtimeMs; if (m !== RPCm) { RPC = JSON.parse(readFileSync(f, 'utf8')); RPCm = m; } } catch (_) { RPC = null; RPCm = 0; } return RPC; };
  const zoneOf = (u) => { try { const z = app.mos && app.mos.zoneOfPoint ? app.mos.zoneOfPoint(u.lat, u.lon, u.elevM ?? null) : null; return z || zoneFile(u.lat, u.lon, u.elevM ?? null); } catch (_) { return zoneFile(u.lat, u.lon, u.elevM ?? null); } };
  /* the mean (ensemble model minus reanalysis) difference for a unit: measured directly by the bias job (ifsEra5), or,
     for a table written before v91.17.77, the stored (model minus served basis) plus (served basis minus reanalysis) */
  const eraOffset = (u) => { const r = S.ensBias && S.ensBias.units && S.ensBias.units[u.unitId]; if (!r) return null;
    if (r.ifsEra5 && r.ifsEra5.tx != null && r.ifsEra5.tn != null) return { tx: r.ifsEra5.tx, tn: r.ifsEra5.tn, how: 'measured: ensemble model minus reanalysis over ' + (r.ifsEra5.days || '?') + ' days' };
    if (r.tx && r.tx.bias != null && r.tn && r.tn.bias != null && r.basis && r.basis.tx != null && r.basis.tn != null) return { tx: r1(r.tx.bias + r.basis.tx), tn: r1(r.tn.bias + r.basis.tn), how: '(model minus served basis) + (served basis minus reanalysis), both measured over the bias window' };
    return null; };

  /* Monte Carlo over the ensemble: each of the 51 members is one physically consistent future.
     Multi-day events are evaluated member by member, so "3 hot days in a row" or "3-day rain
     total" keep the day-to-day dependence that per-day percentiles throw away. */
  const EVENTS_ALL = [
    /* ══ v91.17.3 · 2.15 · THREE HEAT EVENTS WERE ONE SIGNAL COUNTED THREE TIMES ══
       hw40, hotSpell and warmNights were listed, mapped and reported as three
       independent events. Measured on 22,226 station-days, daily maximum and
       daily minimum correlate at 0.92. They are not three things that can
       happen; they are one warm spell seen through three windows, and a unit in
       one warm spell appeared three times in the national event counts and three
       times on the map menu.
       One event now. The three tests survive as SUB-CLASSES under it, each with
       its own share of members, because the distinction between a hot day and a
       hot night is operationally real even though the two arrive together: a
       spell with no overnight relief is the one that kills, and it is published
       as its own sub-class rather than as a separate event. */
    /* ══ v91.17.25 · A 10 °C DAY IN GOJAL WAS A "HEAT SPELL" ═══════════════════════
       The local-top-10% test has no absolute floor, so at 3,600 m a late-September maximum of
       10 °C counted as a heat spell and the tehsil went deep red. It is unusual warmth for the
       place - which matters for snow and glacier melt - but it is not heat stress. The day test
       now also needs at least 30 °C (the hill-station floor IMD uses for heatwaves), as the night
       test already needs 25 °C. The relative test without the floor is published as its own
       event, unusualWarmth, so the melt signal is not lost. */
    /* ══ v91.17.77 · SCI · the spell events are percentile events with a health floor (data/outlook-event-definitions.json);
       the rule text with its numbers is served from that file (rule), the label carries no number */
    { id: 'heatSpell', label: 'Heat spell: hotter than usual for this place and time of year, and hot enough to matter', clim: true,
      classes: ['absolute40', 'localDay', 'warmNight', 'dayAndNight'] },
    { id: 'unusualWarmth', label: 'Unusually warm for this place and time of year, at any temperature (relevant to snow and glacier melt, not a heat-stress measure)', clim: true },
    /* ══ v91.17.3 · 2.14 · THE COAST GETS ITS OWN HEAT RULE ══════════════════
       Karachi's 40 °C detection is 0.48 with a 0.46 false-alarm rate, against
       0.92 / 0.24 at Multan. Dry-bulb 40 °C is the wrong measurand on a humid
       coast: the danger there arrives at a lower air temperature with a higher
       vapour pressure, and the sea breeze that decides the afternoon is poorly
       resolved. Coastal units are screened on APPARENT temperature instead,
       which carries humidity and wind, at 2+ consecutive days.
       This is a screening class, not a calibrated probability: no coastal
       apparent-temperature verification exists yet, because the PMD Karachi
       export carries no humidity column usable for it. The label says so. */
    { id: 'coastalHeat', label: 'Coastal humid heat within 60 km of the sea: apparent temperature ≥ 40 °C for 2+ days (screening, not verified)', clim: false },
    { id: 'rain3_75', label: 'Heavy rain: 3-day total ≥ 75 mm', clim: false },
    { id: 'rain3Local', label: 'Extreme rain for this place: 3-day total ≥ local 99th percentile (and ≥ 25 mm)', clim: true },
    { id: 'coldSpell', label: 'Cold spell: colder than usual for this place and time of year, and cold enough to matter', clim: true },
    { id: 'frostSpell', label: 'Frost spell below 2,000 m: min ≤ 0 °C for 3+ nights', clim: false },
    { id: 'heavySnow', label: 'Heavy snow: 3-day snowfall ≥ 30 cm (screening, not verified: against 35 snow stations the model snowfall caught 12% of 30 cm events)', clim: false },
    /* v91.17.2 · rain on snow. Measured in the station archive: 88 station-days at 14
       stations, peaking in March with a second peak in July and August, and it is the
       compound the engine had no rule for. It is not ordinary rain, not ordinary melt and
       not a GLOF. Snow state comes from the members' own snowfall in the preceding days
       because the model's snow depth field is not usable here: 310 cm modelled against
       36 cm observed, correlation -0.10. Screening class only, not a probability. */
    { id: 'rainOnSnow', label: 'Rain on snow above 1,500 m: ≥ 5 mm rain with ≥ 5 cm of snow from the previous 5 days still lying, max above 2 °C (screening, not verified against the station record)', clim: false },
  ];
  const EVENTS = EVENTS_ALL.filter((e) => !WITHHELD_EVENTS.includes(e.id));   /* v283.36 items 20 / 23 */
  /* ══ v91.17.283.33 · Part 2 · FORECAST TIERS: DAYS 8-14 AGAINST NORMAL ══════════════════════════════════════════════════════════
     Member by member over lead days 8-14 (the 7 days must all be held for a member to count; at least half the members must count):
       hotter / colder  the member's mean of (max + min) / 2 over the 7 days above / below the 1991-2020 normal mean temperature of the
                        same days (climatology.mjs normals: the tehsil's served basis, the members are on the same corrected basis)
       wetter / drier   the member's 7-day rain total (liquid rain where snowfall is held) above / below the 1991-2020 average total of
                        the same days; rain is skewed, so in an ordinary week most members sit below the average
       heavy day        the member has at least one day of 15.6 mm or more (the moderate class of the 24-hour rain classes)
     Raw member shares, not calibrated, not yet scored: the accuracy of this tier is "not measured". */
  function week2Of(u, dates, M) { return week2Shares(dates, M, (iso) => (app.climatology && app.climatology.normals ? app.climatology.normals(u.unitId, iso) : null)); }
  function memberEvents(u, dates, M, scDays = null, Mraw = null) {
    const spk = typeof SPK !== 'undefined' ? SPK : null;   /* v91.17.283.3 · SCI item 6 (degree-day pack; null: the 5-day sum) */
    const C = app.climatology && app.climatology.ready() ? app.climatology : null;
    /* ══ v91.17.77 · SCI · ONE BASIS FOR "UNUSUAL", ONE FOR "HOT ENOUGH TO MATTER" ═══════════════════════════════════
       Before: every member was moved toward observations (served-basis shift, MACH running correction, station
       calibration, AI local correction) and compared with ERA5 percentiles moved only by (served basis - ERA5) and,
       in the mountains, the calibration. The two sides were on different bases, so model and reanalysis biases became
       events: late September, a heat spell at 80-100 % across upper Sindh and the Punjab and a "cold spell" on the
       Thatta coast at 24 C nights. Now (data/outlook-event-definitions.json, WMO-No. 1310, ETCCDI, Perkins & Alexander
       2013, IMD): the RELATIVE test takes each raw member moved onto the reanalysis basis by the measured mean
       (model - reanalysis) difference and compares it with the reanalysis calendar-day percentile; the ABSOLUTE
       floor (IMD heat / cold wave thresholds by zone) is tested on the fully corrected member. No offset, no event. */
    const D = defs(); const off = eraOffset(u); const zone = zoneOf(u);
    const relOk = !!(C && D && off && Mraw);
    const thr = dates.map(t => C ? C.thresholds(u.unitId, t, { raw: true }) : null);
    const nMem = M.tx.length, first = 1; // skip today (partial day)
    /* v91.17.283.51 g1 F4 (events): newest ensemble runs often leave the last forecast day empty on every member
       (live 5 Nov 12Z: day index 14 null for all 51). Requiring first..dates.length then dropped every member and
       left Chance / Timing blank nationwide. Score only through the last day at least half the members carry in tx
       (same coverage rule as week2Shares / asset limits). */
    const needMembers = Math.ceil(nMem / 2);
    let end = dates.length;
    while (end > first) {
      const k = end - 1; let nOk = 0;
      for (let m = 0; m < nMem; m++) { const v = M.tx[m] && M.tx[m][k]; if (v != null && isFinite(v)) nOk++; }
      if (nOk >= needMembers) break;
      end--;
    }
    const coastal = isCoastal(u);
    const hit = Object.fromEntries(EVENTS.map(e => [e.id, []]));
    const sub = { absolute40: [], localDay: [], warmNight: [], dayAndNight: [] };
    const peak3 = [], rain3 = [];
    /* v91.17.206 · member-level unions for the Scenario Lab: a member counts once if EITHER rain definition fires (not the larger
       of two shares), and once if ANY day of its 15 has a gust ≥ 60 km/h (not 1 - product of daily shares, which assumes
       independent days). Same members, same days; gusts withheld above 1,500 m or at an unknown height, as for gu60. */
    const uRain = [], uWind = [], mIdx = []; const gustOk = u.elevM != null && u.elevM < 1500;
    const runN = (ok, n) => { let c = 0; for (let k = first; k < end; k++) { c = ok(k) ? c + 1 : 0; if (c >= n) return k - n + 1; } return -1; };
    const run3 = (ok) => runN(ok, 3);
    const E = D ? D.events : null;
    const hf = E ? E.heatSpell.floor.byZone[zone] : null, cf = E ? E.coldSpell.floor.byZone[zone] : null, trn = D ? D.tropicalNight.value : null;
    const nH = E ? E.heatSpell.minRunDays : null, nU = E ? E.unusualWarmth.minRunDays : null, nC = E ? E.coldSpell.minRunDays : null;
    const t40 = (THRESHOLDS.find(t => t.id === 'tx40') || {}).x;
    /* ══ v91.17.283 · WS2 C1 · A MEMBER WITHOUT THE VALUES AN EVENT NEEDS IS NOT A MEMBER WITHOUT THE EVENT ═══════════════════════
       Each event's share was taken over every member, so a member with no Tmin counted as "no frost spell" (frost 50 % from one frost
       member and one empty member) and a member with no rain as "no heavy rain" (rain3_75 0 % while max3dRain was null; AUDIT283
       C1b). Now a member enters an event's share only if it has an onset (a hit is a hit) or if every input the event's test reads is
       present on every scored day (first .. last). An event is assessed when such members are at least half the ensemble
       (ceil(N / 2), the same coverage rule as the asset limits); otherwise its p is null with the reason. With complete members
       (the normal case) nothing changes. */
    const full = (a, from = first) => { if (!a || end <= from) return false; for (let k = from; k < end; k++) if (a[k] == null || !isFinite(a[k])) return false; return true; };
    const dropped = {}; const drop = (id) => { dropped[id] = (dropped[id] || 0) + 1; };
    for (let m = 0; m < nMem; m++) {
      const tx = M.tx[m], tn = M.tn[m], pr = M.pr[m]; if (!tx || !tn || !pr) continue; mIdx.push(m);
      const xr = Mraw && Mraw.tx[m], nr = Mraw && Mraw.tn[m];
      const at = M.at && M.at[m];
      const on = {};
      const hotRel = (k) => !!(thr[k] && thr[k].tx90 != null && xr && xr[k] != null && xr[k] - off.tx > thr[k].tx90);
      const warmRel = (k) => !!(thr[k] && thr[k].tn90 != null && nr && nr[k] != null && nr[k] - off.tn > thr[k].tn90);
      const coldRel = (k) => !!(thr[k] && thr[k].tn10 != null && nr && nr[k] != null && nr[k] - off.tn < thr[k].tn10);
      const hotDay = (k) => hotRel(k) && hf != null && tx[k] != null && tx[k] >= hf;
      const warmNight = (k) => warmRel(k) && trn != null && tn[k] != null && tn[k] > trn;
      /* information only: 3+ days at or above 40 C inland, usual for the date or not (the day:tx40 layer is the absolute view) */
      const _abs = (coastal || t40 == null) ? -1 : run3(k => tx[k] != null && tx[k] >= t40);
      const _local = relOk ? runN(hotDay, nH) : null;
      const _night = relOk ? runN(warmNight, nH) : null;
      const _both = relOk ? runN(k => hotDay(k) && warmNight(k), nH) : null;
      const xrOk = full(xr), nrOk = full(nr), txOk = full(tx), tnOk = full(tn), prOk = full(pr);
      const okHot = xrOk && txOk, okNight = nrOk && tnOk;
      if (_abs >= 0 || txOk) sub.absolute40.push(_abs); else drop('absolute40');
      if (_local != null) { if (_local >= 0 || okHot) sub.localDay.push(_local); else drop('localDay'); }
      if (_night != null) { if (_night >= 0 || okNight) sub.warmNight.push(_night); else drop('warmNight'); }
      if (_both != null) { if (_both >= 0 || (okHot && okNight)) sub.dayAndNight.push(_both); else drop('dayAndNight'); }
      on.heatSpell = _local;
      on.unusualWarmth = relOk ? runN(hotRel, nU) : null;
      /* v91.17.3 · 2.14 · coastal humid heat on apparent temperature, 2+ days */
      if (coastal && at) {
        let oCH = -1, run = 0;
        for (let k = first; k < end; k++) {
          run = (at[k] != null && at[k] >= 40) ? run + 1 : 0;
          if (run >= 2) { oCH = k - 1; break; }
        }
        on.coastalHeat = oCH;
      } else on.coastalHeat = null;
      on.coldSpell = relOk ? runN(k => coldRel(k) && cf != null && tn[k] != null && tn[k] <= cf, nC) : null;
      /* v91.17.4 · fail closed. The frost-spell product is stated for ground
         below 2,000 m; an unknown elevation was getting the below-2,000 m
         product rather than being refused. */
      on.frostSpell = (u.elevM == null || u.elevM >= 2000) ? null : run3(k => tn[k] != null && tn[k] <= 0);
      const sn = M.sn && M.sn[m]; let oS = -1; if (sn) for (let k = first + 2; k < end; k++) { if (sn[k] != null && sn[k - 1] != null && sn[k - 2] != null && sn[k] + sn[k - 1] + sn[k - 2] >= 30) { oS = k - 2; break; } } on.heavySnow = sn ? oS : null;
      let best = -Infinity, wet = -Infinity, o75 = -1, oLoc = -1;   /* v91.17.68 · no complete 3-day triple → no entry, not a fabricated 0 (B13) */
      for (let k = first + 2; k < end; k++) {
        if (tx[k] != null && tx[k - 1] != null && tx[k - 2] != null) best = Math.max(best, (tx[k] + tx[k - 1] + tx[k - 2]) / 3);
        /* v91.17.101 · audit A5 · the rain events count RAIN: precipitation_sum is water from rain and snow together, so a snowy
           3-day spell in the mountains was painted as heavy / extreme rain as well as heavy snow (Ishkoman 98 % and 49 % from the
           same water). The snow water (snow cm / 0.7, measured above) is taken out first. */
        const liq = (j) => (pr[j] == null ? null : (sn && sn[j] != null ? Math.max(0, pr[j] - sn[j] / SNOW_CM_TO_MM_DIVISOR) : pr[j]));
        if (liq(k) != null && liq(k - 1) != null && liq(k - 2) != null) { const s3 = liq(k) + liq(k - 1) + liq(k - 2); wet = Math.max(wet, s3);
          if (o75 < 0 && s3 >= 75) o75 = k - 2; if (C && oLoc < 0 && thr[k] && thr[k].pr3_99 != null && s3 >= Math.max(25, thr[k].pr3_99)) oLoc = k - 2; }
      }
      on.rain3_75 = o75; on.rain3Local = C ? oLoc : null;
      { const a = [o75, C ? oLoc : -1].filter(k => k >= 0); const ou = a.length ? Math.min(...a) : -1; if (ou >= 0 || prOk) uRain.push(ou); else drop('rainUnion'); }
      if (gustOk && M.gu && M.gu[m]) { const g = M.gu[m]; let og = -1; for (let k = first; k < end; k++) if (g[k] != null && g[k] >= 60) { og = k; break; } if (og >= 0 || full(g)) uWind.push(og); else drop('windAny'); }
      /* rain on snow: rain falling on a snowpack laid down in the previous five days,
         with the day warm enough that it falls as rain and drives melt with it */
      if (u.elevM != null && u.elevM >= 1500 && sn) {
        let oRoS = -1;
        for (let k = first + 1; k < end; k++) {
          /* v91.17.283.3 · SCI item 6 · audit C9 · the 5-day snowfall is kept as a degree-day pack (data/snowpack-ddf.json; held-out
             winter 2025-26 at 14 GB/Chitral AWS: Peirce of 'snow lying' 0.135 -> 0.232, paired CI above 0). A window day without its
             Tmax / Tmin gives no lying value (not assessed), never the old sum. No file / served false: the 5-day sum as before. */
          const lying = spk ? lyingSnowCm(sn, tx, tn, k, spk) : (() => { let a = 0; for (let j = Math.max(0, k - 5); j < k; j++) if (sn[j] != null) a += sn[j]; return a; })();
          if (lying == null) continue;
          /* ══ v91.17.4 · THE SNOW DIVISOR WAS OFF BY A FACTOR OF FOURTEEN ═══
             snowfall_sum is CENTIMETRES OF SNOW; precipitation_sum is
             MILLIMETRES OF WATER. Open-Meteo derives the snow depth from the
             water equivalent at 0.7, so water_mm = snow_cm / 0.7. This divided
             by 10, subtracted about 7 % of the water that fell, and left the
             other 93 % standing in a variable called `rain`.

             Measured on ERA5 at Skardu, 2020-2024, restricted to days the
             provider itself recorded with rain_sum == 0 — days on which not one
             millimetre of rain fell:

                 divisor   pure-snow days scored as >= 5 mm of rain
                 /10          99 of 238   (42 %)   max false rain 26.5 mm
                 /7           93 of 238   (39 %)
                 /0.7          0 of 238            max false rain  0.0 mm

             The measured ratio is precipitation_mm / snowfall_cm = 1.4286
             (p10 1.339, p90 1.429 over 238 days), i.e. divide by 0.7.

             This is not internal. rainOnSnow is a PUBLISHED threshold on the
             skill sheet, so above 1,500 m with lying snow roughly two in five
             pure-snow days raised a rain-on-snow alarm on a day with no rain. */
          const rain = (pr[k] != null && sn[k] != null) ? Math.max(0, pr[k] - sn[k] / SNOW_CM_TO_MM_DIVISOR) : pr[k];
          if (lying >= 5 && rain != null && rain >= 5 && tx[k] != null && tx[k] > 2) { oRoS = k; break; }
        }
        on.rainOnSnow = oRoS;
      } else on.rainOnSnow = null;
      const snOk = full(sn), atOk = full(at);
      const inputsOk = { heatSpell: okHot, unusualWarmth: xrOk, coastalHeat: atOk, rain3_75: prOk, rain3Local: prOk, coldSpell: okNight, frostSpell: tnOk, heavySnow: snOk, rainOnSnow: snOk && prOk && txOk && (!spk || tnOk) };   /* v91.17.283.3 · the pack needs Tmin too */
      /* v91.17.283.13 · audit B3 · a member counts for an event only when it carries every value the event needs: one with gaps is left out
         of the yes AND of the no (it used to count when it hit and drop out when it did not: a yes-only bias) */
      for (const e of EVENTS) if (on[e.id] != null) { if (inputsOk[e.id] !== false) hit[e.id].push(on[e.id]); else drop(e.id); }
      if (isFinite(best)) peak3.push(best); if (isFinite(wet)) rain3.push(wet);
    }
    const whyRel = !C ? 'needs the local climatology, which has not been built' : !D ? 'the event definitions (data/outlook-event-definitions.json) are not installed'
      : !off ? 'the model-minus-reanalysis difference has not been measured for this tehsil, so "unusual for this place" cannot be tested on one basis' : 'the raw members were not kept for this run';
    const res = { members: nMem, zone, thresholdBasis: relOk
      ? { relative: 'raw members minus the model-minus-reanalysis difference (' + off.how + ': Tmax ' + off.tx + ' C, Tmin ' + off.tn + ' C), against the ' + (((EC.info() || {}).period) || '1991-2020') + ' calendar-day percentile at the settlement height', floor: 'corrected members against the ' + zone + ' floor: heat ' + hf + ' C, cold ' + cf + ' C', definitions: 'data/outlook-event-definitions.json' }
      : { withheld: whyRel } };
    for (const e of EVENTS) {
      const arr = hit[e.id]; if (e.clim && !relOk && e.id !== 'rain3Local') { res[e.id] = { p: null, why: whyRel }; continue; } if (e.id === 'rain3Local' && !C) { res[e.id] = null; continue; }
      const yes = arr.filter(k => k >= 0).sort((a, b) => a - b);
      if (dropped[e.id] && arr.length < needMembers) { res[e.id] = { p: null, validMembers: arr.length, of: nMem, why: 'not assessed: ' + arr.length + ' of ' + nMem + ' members carry the values this event needs; at least ' + needMembers + ' are needed' }; continue; }
      res[e.id] = { p: arr.length ? Math.round(100 * yes.length / arr.length) : null, onset: yes.length ? dates[yes[Math.floor(yes.length / 2)]] : null, earliest: yes.length ? dates[yes[0]] : null, _k: arr.slice(), ...(dropped[e.id] ? { validMembers: arr.length, of: nMem } : {}) };   /* v91.17.153 · member onsets kept so a stale run can be re-read from today */
    }
    /* v91.17.3 · 2.15 · the heat spell's sub-classes, each a share of the same
       members, so a desk can tell a hot-day spell from a no-relief spell
       without the three being counted as three events. */
    const share = (arr, id) => { const yes = arr.filter(k => k >= 0).sort((a, b) => a - b);
      if (id && dropped[id] && arr.length < needMembers) return { p: null, validMembers: arr.length, of: nMem, why: 'not assessed: ' + arr.length + ' of ' + nMem + ' members carry the values this needs; at least ' + needMembers + ' are needed' };
      return { p: arr.length ? Math.round(100 * yes.length / arr.length) : null, ...(id && dropped[id] ? { validMembers: arr.length, of: nMem } : {}),
               onset: yes.length ? dates[yes[Math.floor(yes.length / 2)]] : null,
               earliest: yes.length ? dates[yes[0]] : null, _k: arr.slice() }; };
    res.memberIndex = mIdx; res.membersTotal = nMem;
    res.rainUnion = { p: null, why: WITHHELD_WHY }; res.windAny = { p: null, why: WITHHELD_WHY };   /* v283.36 items 17 / 20 */
    res.heatSpellClasses = {
      absolute40: coastal
        ? { p: null, why: 'on the coast the humid-heat class (coastalHeat) is the heat measure' }
        : share(sub.absolute40, 'absolute40'),
      localDay:   relOk ? share(sub.localDay, 'localDay')  : { p: null, why: whyRel },
      warmNight:  relOk ? share(sub.warmNight, 'warmNight') : { p: null, why: whyRel },
      dayAndNight: relOk ? share(sub.dayAndNight, 'dayAndNight') : { p: null, why: whyRel },
      why: HEAT_CLASSES_WHY,
    };
    res.coastal = coastal;
    res.coastKm = coastKm(u.lat, u.lon);
    if (end < dates.length) res.scoredThrough = dates[end - 1];
    if (end < dates.length) res.shortWindowWhy = 'members of this run are incomplete after ' + dates[end - 1] + '; chances are scored through that day only';
    const q = (a) => { a.sort((x, y) => x - y); return a.length ? [r1(pct(a, 0.1)), r1(pct(a, 0.5)), r1(pct(a, 0.9))] : null; };
    res.peak3dTx = q(peak3); res.max3dRain = q(rain3);
    /* v283.36 item 20 · the 3-day total as values: p10/p50/p90 of the members' wettest 3 days, beside the place's local 99th percentile */
    { const p99 = thr.map((t) => (t && t.pr3_99 != null ? t.pr3_99 : null)).filter((x) => x != null).sort((a, b) => a - b);
      res.rain3Amount = res.max3dRain ? { p10: res.max3dRain[0], p50: res.max3dRain[1], p90: res.max3dRain[2], unit: 'mm, wettest 3 days of the window (members)', localP99Mm: p99.length ? r1(p99[Math.floor(p99.length / 2)]) : null,
        p90AboveLocalP99: p99.length && res.max3dRain[2] != null ? res.max3dRain[2] >= p99[Math.floor(p99.length / 2)] : null } : null; }
    return res;
  }

  /* Ensemble temperature adjustment. Local-percentile events compare the model with an ERA5
     climatology, so a model that runs 2 °C cold would report "cold spells" that are only its own
     bias. ECMWF IFS 0.25° past forecasts (same model family and grid as the ensemble) are compared
     with ERA5 daily max/min at the tehsil elevation over 60 days: the mean error is learned on the
     first 30 days and kept only where it lowers the mean absolute error on the last 30 days by
     more than 0.1 °C. The kept shift (re-estimated on all 60 days) is subtracted from every member. */
  /* ══ v91.17.70 · ONE BASIS: THE ENSEMBLE IS PUT ON THE SERVED DETERMINISTIC MODEL, AT THE SAME HEIGHT ═══════════
     The reference used to be the ECMWF IFS analysis: model-against-model, and 3-5 C colder than the valleys in GB
     (meteorologist seat W1: ensemble P50 Tmax -5.2 C at settlement height, 12 % coverage, the day card and the outlook
     disagreeing by 6-8 C in the same valley). The reference is now the unit's ZONE temperature basis
     (data/model-zone.json: the model, or equal-weight blend, the day card serves there), from the provider's
     historical-forecast archive at the same settlement height. The shift is still learned on the first 30 days and
     kept only where it helps on the last 30, so the member spread is untouched; the thresholds basis (reference minus
     ERA5) follows the same reference. No station record enters. */
  const zoneMembersOf = (u) => { try { const z = app.mos && app.mos.zoneModel ? app.mos.zoneModel(app.mos.zoneOfPoint(u.lat, u.lon, u.elevM ?? null)) : null; return z && z.members && !z.members.includes('best_match') ? z.members : ['best_match']; } catch { return ['best_match']; } };
  let runningBias = false;
  async function runEnsembleBias() {
    if (runningBias || !provider.configured()) return { started: false };
    runningBias = true; const t0 = Date.now();
    const end = localDate(Date.now() - 2 * 86400e3), start = localDate(Date.now() - 61 * 86400e3), split = localDate(Date.now() - 31 * 86400e3);
    const out = { at: null, window: { start, split, end }, units: {}, reference: 'the served temperature basis per zone (data/model-zone.json), historical forecast at the settlement height', version: (app.mos && app.mos.version) || null };
    try {
      const groups = new Map(); for (const u of pool()) { const k = zoneMembersOf(u).join(','); (groups.get(k) || groups.set(k, []).get(k)).push(u); }
      for (const [refKey, grpUnits] of groups) for (const b of batches(grpUnits, 50)) {
        const refMembers = refKey.split(',');
        const common = { latitude: b.map(u => u.lat), longitude: b.map(u => u.lon), elevation: b.map(u => u.elevM ?? 'nan'), daily: ['temperature_2m_max', 'temperature_2m_min'], start_date: start, end_date: end, timezone: TZ };
        let F, O, E5 = null;
        try {
          F = listH(await provider.call('historicalForecast', '/v1/forecast', { ...common, models: MODEL }, { locations: b.length }), b);
          const Oraw = listH(await provider.call('historicalForecast', '/v1/forecast', { ...common, models: refMembers.join(',') }, { locations: b.length }), b);
          /* a blend reference is the equal-weight mean of its members' daily values (suffixed keys when more than one) */
          O = Oraw.map(loc => { const d = loc && loc.daily; if (!d) return loc; if (refMembers.length === 1) return loc;
            const outD = { time: d.time };
            for (const key of ['temperature_2m_max', 'temperature_2m_min']) outD[key] = d.time.map((_, k) => { const v = refMembers.map(m => d[key + '_' + m] ? d[key + '_' + m][k] : null).filter(x => x != null); return v.length === refMembers.length ? v.reduce((a, x) => a + x, 0) / v.length : null; });
            return { ...loc, daily: outD }; });
        }
        catch (e) { last.ensemble = 'bias: ' + e.message; continue; }
        /* v91.17.25 · the same window from ERA5 (it lags about five days), to measure the
           reference-minus-ERA5 difference the percentile thresholds need */
        try { E5 = listH(await provider.call('archive', '/v1/archive', { ...common, end_date: localDate(Date.now() - 6 * 86400e3), models: 'era5' }, { locations: b.length }), b); } catch (_) { E5 = null; }
        b.forEach((u, i) => {
          const f = F[i] && F[i].daily, o = O[i] && O[i].daily; if (!f || !o) return;
          const om = new Map(o.time.map((t, k) => [t, k])); const res = {};
          for (const [v, key] of [['tx', 'temperature_2m_max'], ['tn', 'temperature_2m_min']]) {
            const tr = [], te = [];
            f.time.forEach((t, k) => { const j = om.get(t); if (j == null || f[key][k] == null || o[key][j] == null) return; (t < split ? tr : te).push(f[key][k] - o[key][j]); });
            if (tr.length < 20 || te.length < 20) continue;
            const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
            const bTrain = mean(tr), maeRaw = mean(te.map(Math.abs)), maeAdj = mean(te.map(e => Math.abs(e - bTrain)));
            const applied = maeAdj < maeRaw - 0.1;
            /* ══ v91.17.13 · THE SHIFT APPLIED WAS NOT THE SHIFT TESTED ═════
               `applied` is decided out of sample: the shift is learned on the
               first 30 days and kept only if it lowers the mean absolute error
               on the LAST 30 by more than 0.1 °C. That part is sound. But what
               was then subtracted from every member was `bias`, re-estimated
               over all 60 days - a different number, which nothing had tested.

               MEASURED on the stored window (2026-07-19 to 2026-09-16, 576
               tehsils): on 12 of 261 corrected tx units (5%) and 28 of 330 tn
               units (8%), |bias - trainBias| EXCEEDS the entire claimed MAE
               gain. For those units the correction in use was not the one that
               passed the test and may be worse than no correction at all. The
               reported medianMaeServed - 0.3 and 0.4 °C - described the tested
               shift, not the running one.

               The 60-day estimate cannot be re-validated to fix this: it
               contains the test days, so any error computed against them is
               circular. The only shift with an out-of-sample warrant is the
               30-day one, so that is what is applied, and the response now
               names it. `bias` is kept, reported, and no longer subtracted
               from anything. */
            res.reference = refMembers.join('+'); res.elevM = u.elevM ?? null;
            res[v] = { bias: r1(mean(tr.concat(te))), trainBias: r1(bTrain), appliedShift: r1(bTrain),
              appliedShiftBasis: 'the shift learned on the first 30 days - the only one whose benefit was measured on days it had not seen. `bias` is the same quantity re-estimated over all 60 days and is reported for comparison, not applied.',
              maeRaw: r1(maeRaw), maeAdjusted: r1(maeAdj), applied, days: tr.length + te.length };
          }
          try {
            const e5 = E5 && E5[i] && E5[i].daily;
            if (e5) { const em = new Map(e5.time.map((t, k) => [t, k])); const bs = {};
              for (const [v, key] of [['tx', 'temperature_2m_max'], ['tn', 'temperature_2m_min']]) {
                const d = []; o.time.forEach((t, k) => { const j = em.get(t); if (j == null || o[key][k] == null || e5[key][j] == null) return; d.push(o[key][k] - e5[key][j]); });
                if (d.length >= 20) bs[v] = r1(d.reduce((x, y) => x + y, 0) / d.length);
              }
              /* v91.17.77 · SCI · the ensemble model minus the reanalysis, measured directly: the offset the relative events use */
              { const fe = {}; let nd = 0; for (const [v, key] of [['tx', 'temperature_2m_max'], ['tn', 'temperature_2m_min']]) { const dd = []; f.time.forEach((t, k) => { const j = em.get(t); if (j == null || f[key][k] == null || e5[key][j] == null) return; dd.push(f[key][k] - e5[key][j]); }); if (dd.length >= 20) { fe[v] = r1(dd.reduce((x, y) => x + y, 0) / dd.length); nd = Math.max(nd, dd.length); } }
                if (fe.tx != null && fe.tn != null) res.ifsEra5 = { ...fe, days: nd, what: 'mean (ensemble model ' + MODEL + ' minus reanalysis) daily max/min at the tehsil settlement height over the bias window; moves the raw members onto the reanalysis basis for the relative events' }; }
              if (bs.tx != null || bs.tn != null) res.basis = { ...bs, days: (function () { let n = 0; o.time.forEach((t, k) => { const j = em.get(t); if (j != null && o.temperature_2m_max[k] != null && e5.temperature_2m_max[j] != null) n++; }); return n; })(), what: 'mean (served basis ' + refMembers.join('+') + ' minus ERA5) daily max/min at the tehsil elevation; added to the ERA5 percentile thresholds before local events are tested' };
            }
          } catch (_) {}
          out.units[u.unitId] = res;
        });
      }
      const vals = Object.values(out.units);
      out.summary = { tehsils: vals.length, txApplied: vals.filter(x => x.tx && x.tx.applied).length, tnApplied: vals.filter(x => x.tn && x.tn.applied).length,
        medianMaeTxRaw: medOf(vals.map(x => x.tx && x.tx.maeRaw)), medianMaeTxServed: medOf(vals.map(x => x.tx && (x.tx.applied ? x.tx.maeAdjusted : x.tx.maeRaw))),
        medianMaeTnRaw: medOf(vals.map(x => x.tn && x.tn.maeRaw)), medianMaeTnServed: medOf(vals.map(x => x.tn && (x.tn.applied ? x.tn.maeAdjusted : x.tn.maeRaw))) };
      out.at = new Date().toISOString(); out.seconds = Math.round((Date.now() - t0) / 1000);
      /* v91.17.68 · a partial table never replaces a fuller one: units a failed batch left out keep their previous correction (B11) */
      if (vals.length) { if (S.ensBias && S.ensBias.units) { for (const [id, v] of Object.entries(S.ensBias.units)) if (!out.units[id]) { out.units[id] = { ...v, carriedFrom: S.ensBias.at }; } out.carriedUnits = Object.values(out.units).filter(x => x.carriedFrom).length; } S.ensBias = out; save(); }
      console.log('  outlook: ensemble bias ' + JSON.stringify(out.summary));
      return { started: true };
    } finally { runningBias = false; }
  }
  function medOf(a) { const q = a.filter(x => x != null).sort((x, y) => x - y); return q.length ? q[Math.floor(q.length / 2)] : null; }

  async function runEnsemble(issue = null) {
    if (running.ensemble) return { started: false, why: 'already running' };
    if (!provider.configured()) return { started: false, why: 'no paid provider key' };
    running.ensemble = true; const t0 = Date.now();
    const out = { at: null, model: MODEL, members: 0, days: [], units: {}, events: {}, adjusted: { tx: 0, tn: 0 }, climatology: !!(app.climatology && app.climatology.ready()), failedUnits: 0 };
    try {
      /* replay / dump of the provider's ensemble batches (verification aid: the same members re-scored by changed rules) */
      const _rd = process.env.NIGRAAN_OUTLOOK_REPLAY_DIR || null, _dd = process.env.NIGRAAN_OUTLOOK_DUMP_DIR || null; let _bi = -1;
      /* v91.17.284 · the raw members of this run, written once (never from a replay); a failure here never touches the outlook */
      let _em = null; try { _em = _rd ? null : EM.begin({ model: MODEL, vars: VARS, runInit: issue && issue.target ? issue.target : null, latestInit: issue && issue.latest ? issue.latest : null, fetchedMs: t0 }); } catch (_) { _em = null; }
      for (const b of batches(pool(), 25)) {
        let body; _bi++;
        try {
          const _rf = _rd ? join(_rd, 'b' + _bi + '.json') : null;
          if (_rf && existsSync(_rf)) body = JSON.parse(readFileSync(_rf, 'utf8'));
          else { body = await provider.call('ensemble', '/v1/ensemble', { latitude: b.map(u => u.lat), longitude: b.map(u => u.lon), elevation: b.map(u => u.elevM ?? 'nan'),
            models: MODEL, daily: Object.values(VARS), forecast_days: 15, timezone: TZ }, { locations: b.length, timeoutMs: 120000 });
            if (_dd) writeFileSync(join(_dd, 'b' + _bi + '.json'), JSON.stringify(body)); }
        } catch (e) { out.failedUnits += b.length; last.ensemble = e.message; continue; }
        listH(body, b).forEach((loc, i) => {   /* v91.17.77 · aligned by the echoed height, then coordinate */
          const u = b[i], d = loc && loc.daily; if (!d || !d.time) { out.failedUnits++; return; }
          if (!out.days.length) out.days = d.time;
          /* member matrix: M[var][member][day], control first, members aligned across variables */
          const M = {};
          for (const [short, name] of Object.entries(VARS)) M[short] = Object.keys(d).filter(key => key === name || key.startsWith(name + '_member')).sort().map(key => d[key]);
          if (_em) EM.add(_em, u, d, M);   /* v91.17.284 · raw, before every correction below */
          /* v91.17.77 · SCI · the raw members, before any correction: the relative ("unusual for this place") test runs on them */
          const Mraw = { tx: M.tx.map(r => r.slice()), tn: M.tn.map(r => r.slice()) };
          /* no adjustment toward ERA5 where an airport thermometer showed ERA5 itself is biased (station guard) */
          const adj = S.ensBias && S.ensBias.units[u.unitId] && !(app.verification.guarded && app.verification.guarded(u.unitId, 24)) ? S.ensBias.units[u.unitId] : null;
          /* the validated shift, not the 60-day re-estimate - see the note in runEnsembleBias. The fallback keeps a stored window written before v91.17.13 working. */
          const shiftUsed = { tx: 0, tn: 0 };
          for (const v of ['tx', 'tn']) if (adj && adj[v] && adj[v].applied) { const bb = adj[v].appliedShift != null ? adj[v].appliedShift : adj[v].trainBias; if (bb == null) continue; shiftUsed[v] = bb; M[v] = M[v].map(series => series.map(x => x == null ? x : Math.round((x - bb) * 10) / 10)); out.adjusted[v]++; }
          /* v91.17.70 · the MACH running correction reaches the members exactly as it reaches the day card: the same bias at
             the Pakistan afternoon (09 UTC) for the maximum and at dawn (00 UTC) for the minimum */
          let l2Used = null;
          try { if (app.fleet && app.fleet.runningBias) { const at = (k, h) => app.fleet.runningBias(u.lat, u.lon, u.elevM ?? null, Date.parse(d.time[k] + 'T' + h + ':00:00Z'));
            const px = d.time.map((_, k) => at(k, '09')), pn = d.time.map((_, k) => at(k, '00'));
            if (px.some(r => r && r.applied)) { l2Used = { stations: (px.find(r => r && r.applied) || {}).stations || null };
              M.tx = M.tx.map(series => series.map((x, k) => x == null || !px[k] || !px[k].applied ? x : Math.round((x + px[k].t) * 10) / 10));
              M.tn = M.tn.map(series => series.map((x, k) => x == null || !pn[k] || !pn[k].applied ? x : Math.round((x + pn[k].t) * 10) / 10)); } } } catch (_) { l2Used = null; }
          /* ══ v91.17.71 · THE STATION CALIBRATION REACHES THE MEMBERS EXACTLY AS IT REACHES THE DAY CARD ══════════════════
             The day card is the zone basis moved by the site's (or band's) Tmax / Tmin offset for the month (mos.mjs
             calibrationAt; the stretch puts the curve's max at T_max + tx and its min at T_min + tn). Members that sit on the
             same zone basis (ensBias reference = the calibration table's basis; shifted or found not to need a shift) take
             the same offsets, day by day, so P50 day 1 and the day card agree. A unit whose members are not on that basis
             (no ensBias row, a guarded unit) is left as it is. */
          let scDays = null;
          try {
            if (app.mos && app.mos.calibrationOn && app.mos.calibrationOn() && u.elevM != null && adj && adj.reference) {
              const zone = app.mos.zoneOfPoint(u.lat, u.lon, u.elevM);
              if ((zone === 'mountain' || zone === 'hills' || ((zone === 'plains' || zone === 'coast') && app.mos.calibratedZone && app.mos.calibratedZone(zone))) && app.mos.calibrationBasis(zone) === adj.reference) {   /* v91.17.139 · + plains / coast synop sites */
                const cs = d.time.map(t => app.mos.calibrationAt(u.lat, u.lon, u.elevM, zone, Number(String(t).slice(5, 7))));
                if (cs.some(Boolean)) {
                  scDays = cs.map(c => c ? { tx: c.tx, tn: c.tn } : null);
                  M.tx = M.tx.map(series => series.map((x, k) => x == null || !cs[k] ? x : Math.round((x + cs[k].tx) * 10) / 10));
                  M.tn = M.tn.map(series => series.map((x, k) => x == null || !cs[k] ? x : Math.round((x + cs[k].tn) * 10) / 10));
                  if (M.at) M.at = M.at.map(series => series.map((x, k) => x == null || !cs[k] ? x : Math.round((x + cs[k].tx) * 10) / 10));
                  out.adjusted.sc = (out.adjusted.sc || 0) + 1;
                }
              }
            }
          } catch (_) { scDays = null; }
          /* ══ v91.17.73 · THE AI LOCAL CORRECTION REACHES THE MEMBERS AS IT REACHES THE DAY CARD ═══════════════════════════
             The residual a served response took at this unit point and Pakistan day (verification.mjs remembers it through
             downscale.mjs servedTerm; the national sweep fills it for every tehsil) moves the members by the same Tmax / Tmin
             terms: in the mountains only where the members already carry the station calibration (same basis), in the plains
             where no running correction was used (the served path applies the AI there only without one). */
          let aiDays = null, aiEligible = false; const scOnly = scDays;   /* the calibration record stays the station calibration alone; the AI term is reported beside it */
          try {
            const D = downscaleFor(app);
            aiEligible = !!(scDays || (!l2Used && u.elevM != null && app.mos && app.mos.zoneOfPoint(u.lat, u.lon, u.elevM) === 'plains'));
            if (D && D.servedTerm && aiEligible) {
              const ts = d.time.map(t => D.servedTerm(u.lat, u.lon, String(t).slice(0, 10)));
              if (ts.some(Boolean)) {
                aiDays = ts.map(r => r ? { dTx: r.dTx, dTn: r.dTn } : null);
                M.tx = M.tx.map(series => series.map((x, k) => x == null || !ts[k] ? x : Math.round((x + ts[k].dTx) * 10) / 10));
                M.tn = M.tn.map(series => series.map((x, k) => x == null || !ts[k] ? x : Math.round((x + ts[k].dTn) * 10) / 10));
                if (M.at) M.at = M.at.map(series => series.map((x, k) => x == null || !ts[k] ? x : Math.round((x + ts[k].dTx) * 10) / 10));
                if (scDays) scDays = scDays.map((c, k) => c && ts[k] ? { tx: c.tx + ts[k].dTx, tn: c.tn + ts[k].dTn } : c);
                else scDays = ts.map(r => r ? { tx: r.dTx, tn: r.dTn } : null);   /* the event thresholds move with the members */
                out.adjusted.ai = (out.adjusted.ai || 0) + 1;
              }
            }
          } catch (_) { aiDays = null; }
          out.basis = out.basis || { version: (app.mos && app.mos.version) || null, height: 'tehsil settlement height (elevM)', units: {} };
          out.basis.units[u.unitId] = { elevM: u.elevM ?? null, reference: (adj && adj.reference) || zoneMembersOf(u).join('+'), shift: shiftUsed, l2: !!l2Used, calibration: scOnly ? { tier: 'B', tx: scOnly[1] ? scOnly[1].tx : null, tn: scOnly[1] ? scOnly[1].tn : null } : null, aiEligible, aiLocal: aiDays ? { label: 'AI local correction (terrain and land surface)', tier: 'B', days: aiDays.filter(Boolean).length, tx: aiDays[1] ? aiDays[1].dTx : null, tn: aiDays[1] ? aiDays[1].dTn : null, byDay: aiDays.map(r => r ? [r.dTx, r.dTn] : null) } : null };
          const days = d.time.map((date, k) => {
            const row = {};
            for (const short of Object.keys(VARS)) {
              const vals = M[short].map(m => m[k]).filter(v => v != null && isFinite(v)).sort((a, c) => a - c);
              if (short === 'tx' && vals.length > out.members) out.members = vals.length;
              row[short] = vals.length ? [r1(pct(vals, 0.1)), r1(pct(vals, 0.5)), r1(pct(vals, 0.9))] : null;
              row['_' + short] = vals;
            }
            row.n = row._tx.length; row.p = {};
            /* v91.17.101 · audit A5 · the rain thresholds read liquid rain, member by member (snow water out, as in the events) */
            if (M.pr && M.sn) { const liq = M.pr.map((m, j) => { const p0 = m && m[k], s0 = M.sn[j] && M.sn[j][k]; return p0 == null || !isFinite(p0) ? null : (s0 != null && isFinite(s0) ? Math.max(0, p0 - s0 / SNOW_CM_TO_MM_DIVISOR) : p0); }).filter(v => v != null).sort((a, c) => a - c); row._prRain = liq; }
            for (const th of THRESHOLDS) { const v = (th.v === 'pr' && row._prRain) ? row._prRain : row['_' + th.v]; /* v91.17.4 · an UNKNOWN elevation fails closed: gu60 is withheld above 1,500 m because 19 mountain gust alerts in 20 were wrong, and a unit whose height did not arrive cannot be shown to be below that line. */ if (th.maxElevM != null && (u.elevM == null || u.elevM >= th.maxElevM)) { row.p[th.id] = null; row.pWhy = row.pWhy || {}; row.pWhy[th.id] = (u.elevM == null) ? 'withheld: this unit has no elevation, and this class is only published below ' + th.maxElevM + ' m' : 'withheld above ' + th.maxElevM + ' m'; continue; } if (v.length < Math.ceil(M[th.v].length / 2)) { row.p[th.id] = null; row.pWhy = row.pWhy || {}; row.pWhy[th.id] = 'not assessed: ' + v.length + ' of ' + M[th.v].length + ' members carry this value; at least half are needed'; continue; } row.p[th.id] = v.length ? Math.round(100 * v.filter(x => th.op === '>=' ? x >= th.x : x <= th.x).length / v.length) : null; }
            /* v91.17.283.13 · audit B3 · the 24-hour rain classes (India Meteorological Department categories, data/hazard-scale.json rainClasses24h: moderate 15.6, heavy 64.5, very heavy 115.6,
               extremely heavy 204.5 mm) as shares of the VALID members (liquid rain where the snowfall is held), withheld when fewer than
               half of the members carry the day: the issued rain level (hazsci.mjs) reads these */
            row.prc = rainClassShares(row._prRain || row._pr || [], (M.pr || []).length, row._prRain ? 'liquid rain' : 'precipitation');
            /* v91.17.283.15 · item 9 · lead days 1-3: the calibrated probability (logistic by zone x regime x lead on the member statistics of
               the TOTAL precipitation, the variable it was fitted on); a class whose gate did not pass is screening and never sets the level.
               v91.17.283.24 · self-audit H21 · ONE DEFINITION FOR EVERY DAY: the rain classes read liquid rain wherever the members' snowfall is
               held (audit A5: snow water is not rain). The calibrated model was fitted on total precipitation, so it is applied only on a
               day where no member has snowfall (there liquid = total, the same variable); a day with snow in any member keeps
               the liquid-rain member shares of the other days (screening). Before, days 1-3 counted snow water as rain. */
            const snowFree = !M.sn || M.sn.every((m) => { const s0 = m && m[k]; return s0 == null || !isFinite(s0) || s0 <= 0; });   /* liquid = total for every member */
            if (k >= 1 && k <= 3 && rainCoefs() && snowFree) { try { row.prc = rainClassSharesCalibrated(rainCoefs(), row._pr || [], (M.pr || []).length, { zone: zoneOf(u) || 'plains', month: Number(String(date).slice(5, 7)), lead: k }, 'precipitation'); } catch (_) {} }
            row.prs = (() => { const st = memberStats(row._pr || []); return st.n ? { n: st.n, mean: Math.round(st.mean * 100) / 100, sd: Math.round(st.sd * 100) / 100, m: st.m } : null; })();   /* the member statistics the model reads (ensemble log) */
            for (const short of Object.keys(VARS)) delete row['_' + short]; delete row._prRain;
            return row;
          });
          out.units[u.unitId] = days;
          out.events[u.unitId] = memberEvents(u, d.time, M, scDays, Mraw);
          try { out.wk2 = out.wk2 || {}; out.wk2[u.unitId] = week2Of(u, d.time, M); } catch (_) {}   /* v91.17.283.33 · forecast tiers, days 8-14 */
          /* v91.17.41 · the members themselves are kept for the tehsils that host a Priority or Watch glacial lake,
             so the GLOF trigger outlook can count members per window instead of reading percentiles. About 60 units;
             four variables x 51 members x 15 days each, rounded to 0.1. */
          try { if (app.glof && app.glof.lakeUnits && app.glof.lakeUnits().has(u.unitId)) { out.glofMembers = out.glofMembers || {}; out.glofMembers[u.unitId] = { elevM: u.elevM ?? null, tx: M.tx.map(r => r.map(x => x == null ? null : Math.round(x * 10) / 10)), tn: M.tn.map(r => r.map(x => x == null ? null : Math.round(x * 10) / 10)), pr: M.pr.map(r => r.map(x => x == null ? null : Math.round(x * 10) / 10)), sn: M.sn.map(r => r.map(x => x == null ? null : Math.round(x * 10) / 10)) }; } } catch (_) {}
        });
      }
      out.at = new Date().toISOString(); out.seconds = Math.round((Date.now() - t0) / 1000);
      if (_em) { const w = EM.end(_em, { failedUnits: out.failedUnits }); if (w && w.written) console.log('  outlook: ensemble members saved (' + w.file + ', ' + w.units + ' tehsils, ' + Math.round(w.bytes / 1024) + ' KB)'); else if (w && w.why) console.log('  outlook: ensemble members not saved: ' + w.why); }
      /* v91.17.157 · audit: a partial run (under 90 % of the tehsils the last good run held) no longer replaces it; it is kept aside and
         the reason recorded, as smog does. Units missing from a replacing run are listed. */
      const nNew = Object.keys(out.units).length, nPrev = S.ensemble && S.ensemble.units ? Object.keys(S.ensemble.units).length : 0;
      if (nNew && nPrev && nNew < 0.9 * nPrev && (Date.now() - Date.parse(S.ensemble.at)) / 3600e3 < 30) { last.ensemble = 'partial run kept aside: ' + nNew + ' of ' + nPrev + ' tehsils; the run of ' + S.ensemble.at + ' stays'; console.log('  outlook: ' + last.ensemble); return { started: true, units: nNew, keptAside: true }; }
      if (Object.keys(out.units).length) { S.ensemble = out; save(); last.ensemble = null; try { if (app.ensVerify) await app.ensVerify.log(out); } catch (e) { console.error('  ensemble log error', e.message); } }
      console.log(`  outlook: ensemble ${Object.keys(out.units).length} tehsils, ${out.members} members, ${out.days.length} days in ${out.seconds}s`);
      return { started: true, units: Object.keys(out.units).length };
    } finally { running.ensemble = false; }
  }

  async function runRadiation() {
    if (running.radiation) return { started: false, why: 'already running' };
    if (!provider.configured()) return { started: false, why: 'no paid provider key' };
    running.radiation = true; const t0 = Date.now();
    /* v91.17.68 · the satellite archive is published by UTC day; between 00:00
       and 05:00 PKT the local date is one day past the archive's allowed range
       and the provider rejected every batch ("end_date is out of allowed range
       ... to <UTC date>"), so the check ran with 0 tehsils for five hours of
       every day and the health board showed it stale. The end date is the
       earlier of the local and the UTC date, and a rejection that names the
       allowed range is retried once with the date the provider gives. */
    const now = Date.now(), utcDay = new Date(now).toISOString().slice(0, 10);
    let end = localDate(now); if (utcDay < end) end = utcDay;
    const start = localDate(now - 15 * 86400e3);
    const out = { at: null, start, end, units: {}, failedUnits: 0 };
    try {
      for (const b of batches(pool(), 50)) {
        const common = { latitude: b.map(u => u.lat), longitude: b.map(u => u.lon), hourly: 'shortwave_radiation', start_date: start, end_date: end, timezone: TZ };
        let sat, mod;
        const satCall = () => provider.call('satellite', '/v1/archive', { ...common, models: 'satellite_radiation_seamless' }, { locations: b.length });
        try {
          try { sat = list(await satCall(), b); }
          catch (e) {
            const m = /allowed range from \d{4}-\d{2}-\d{2} to (\d{4}-\d{2}-\d{2})/.exec(e.message || '');
            if (!m || m[1] >= end) throw e;
            end = m[1]; common.end_date = end; out.end = end; sat = list(await satCall(), b);
          }
          mod = list(await provider.call('forecast', '/v1/forecast', { ...common, elevation: b.map(u => u.elevM ?? 'nan') }, { locations: b.length }), b);
        } catch (e) { out.failedUnits += b.length; last.radiation = e.message; continue; }
        b.forEach((u, i) => {
          const hs = sat[i] && sat[i].hourly, hm = mod[i] && mod[i].hourly; if (!hs || !hm) { out.failedUnits++; return; }
          const mi = new Map(hm.time.map((t, k) => [t, hm.shortwave_radiation[k]]));
          const byDay = new Map(); let lastHour = null;
          hs.time.forEach((t, k) => {
            const m = mi.get(t), s = hs.shortwave_radiation[k], date = t.slice(0, 10);
            let g = byDay.get(date); if (!g) byDay.set(date, g = { date, sat: 0, model: 0, hours: 0, missingDaylight: 0 });
            if (m == null) return;
            if (s == null) { if (m > 50) g.missingDaylight++; return; }
            g.sat += s * 0.0036; g.model += m * 0.0036; g.hours++; if (s > 0 || m > 0) lastHour = t;
          });
          const days = [...byDay.values()].map(g => ({ date: g.date, sat_mj: r1(g.sat), model_mj: r1(g.model), ratio: g.model >= 2 ? Math.round(100 * g.sat / g.model) / 100 : null, complete: g.missingDaylight <= 2 && g.model >= 2 && g.date < localDate(Date.now()), hours: g.hours }));
          const rs = days.filter(d => d.complete && d.ratio != null).map(d => d.ratio).sort((a, c) => a - c);
          const typical = rs.length >= 5 ? rs[Math.floor(rs.length / 2)] : null;
          out.units[u.unitId] = { days, lastHour, typicalRatio: typical, typicalDays: rs.length };
        });
      }
      out.at = new Date().toISOString(); out.seconds = Math.round((Date.now() - t0) / 1000);
      if (Object.keys(out.units).length) { S.radiation = out; save(); last.radiation = null; }
      console.log(`  outlook: sunshine check ${Object.keys(out.units).length} tehsils in ${out.seconds}s`);
      return { started: true, units: Object.keys(out.units).length };
    } finally { running.radiation = false; }
  }

  /* Weeks ahead (ECMWF EC46) and season ahead (ECMWF SEAS5) for every tehsil. Both are anomalies
     against the model's own re-forecast/hindcast climate, so model bias cancels by construction.
     Grid cell values (EC46 ~36 km, SEAS5 ~36 km); refreshed every 12 hours. */
  const W_VARS = ['temperature_2m_anomaly', 'temperature_2m_anomaly_gt0', 'temperature_2m_anomaly_gt1', 'temperature_2m_anomaly_gt2', 'precipitation_anomaly', 'precipitation_anomaly_gt0', 'precipitation_anomaly_gt10', 'precipitation_anomaly_gt20'];
  const M_VARS = ['temperature_2m_mean', 'temperature_2m_anomaly', 'precipitation_mean', 'precipitation_anomaly'];
  let runningSeasonal = false;
  /* v91.17.283 · WS1 · ONE FETCH PER NEW ISSUE. The two products are fetched separately and only when the provider has a newer run of that
     product (its model metadata, api/modelruns.mjs: ecmwf_ec46, ecmwf_seas5); the other product is carried over from the stored run. A
     run that yields no or too few tehsils throws, so the job backs off (10 min doubling to 6 h) instead of fetching again on every tick:
     measured before, an incomplete run was repeated on every tick (168 seasonal calls in one hour, BUDGET_REPORT.md).
     need = { ec46, seas5 } (default both), issue = the run keys the fetch is made for. */
  async function runSeasonal(need = { ec46: true, seas5: true }, issue = null) {
    if (runningSeasonal || !provider.configured()) return { started: false };
    runningSeasonal = true; const t0 = Date.now();
    const prev = S.seasonal && S.seasonal.units ? S.seasonal : null;
    const N = { ec46: !!need.ec46 || !prev || !prev.weeks || !prev.weeks.length, seas5: !!need.seas5 || !prev || !prev.months || !prev.months.length };
    const out = { at: null, weeks: N.ec46 ? [] : prev.weeks.slice(), months: N.seas5 ? [] : prev.months.slice(), units: {}, failedUnits: 0,
      issue: { ...((prev && prev.issue) || {}), ...(issue && N.ec46 ? { ec46: issue.ec46 || null } : {}), ...(issue && N.seas5 ? { seas5: issue.seas5 || null } : {}) },
      fetched: { ec46: N.ec46, seas5: N.seas5 } };
    try {
      for (const b of batches(pool(), 50)) {
        const base = { latitude: b.map(u => u.lat), longitude: b.map(u => u.lon) };
        let W = null, Mo = null;
        try {
          if (N.ec46) W = list(await provider.call('seasonal', '/v1/seasonal', { ...base, models: 'ecmwf_ec46', weekly: W_VARS }, { locations: b.length, timeoutMs: 120000 }), b);
          if (N.seas5) Mo = list(await provider.call('seasonal', '/v1/seasonal', { ...base, models: 'ecmwf_seas5', monthly: M_VARS }, { locations: b.length, timeoutMs: 120000 }), b);
        } catch (e) { out.failedUnits += b.length; last.seasonal = e.message; continue; }
        b.forEach((u, i) => {
          const pu = prev && prev.units[u.unitId];
          const w = N.ec46 ? (W[i] && W[i].weekly) : null, m = N.seas5 ? (Mo[i] && Mo[i].monthly) : null;
          if ((N.ec46 && !w) || (N.seas5 && !m) || (!N.ec46 && !(pu && pu.w)) || (!N.seas5 && !(pu && pu.m))) { out.failedUnits++; return; }
          if (N.ec46 && !out.weeks.length) { const keep = w.time.map((t, k) => w.temperature_2m_anomaly[k] != null ? k : -1).filter(k => k >= 0); out.weekIdx = keep; out.weeks = keep.map(k => w.time[k]); }
          if (N.seas5 && !out.months.length) out.months = m.time.map(t => t.slice(0, 7));
          out.units[u.unitId] = { w: N.ec46 ? out.weekIdx.map(k => W_VARS.map(v => w[v][k] == null ? null : r1(w[v][k]))) : pu.w, m: N.seas5 ? m.time.map((t, k) => M_VARS.map(v => m[v][k] == null ? null : r1(m[v][k]))) : pu.m };
        });
      }
      delete out.weekIdx;
      out.at = new Date().toISOString(); out.seconds = Math.round((Date.now() - t0) / 1000);
      /* v91.17.101 · audit A · a partial run (the provider failed for part of the country) no longer replaces the last COMPLETE one:
         it is kept only when it covers at least as many units as the stored run, or at least 90 % of the country; otherwise the
         stored run stands and the failure count is published */
      const nNew = Object.keys(out.units).length, nOld = S.seasonal && S.seasonal.units ? Object.keys(S.seasonal.units).length : 0;
      const nAll = units.tehsil.filter(u => !u.disputed).length || 576;
      if (nNew && !(nNew >= nOld || nNew >= 0.9 * nAll)) { last.seasonal = 'partial run kept aside: ' + nNew + ' units (stored run has ' + nOld + '); ' + out.failedUnits + ' failed'; if (S.seasonal) S.seasonal.lastPartial = { at: new Date().toISOString(), units: nNew, failed: out.failedUnits }; }
      else if (nNew) { S.seasonal = out; save(); last.seasonal = null; try { app.seasVerify && app.seasVerify.log(out); } catch (e) { console.error('  seasonal log error', e.message); } }
      console.log(`  outlook: weeks/season ${Object.keys(out.units).length} tehsils, ${out.weeks.length} weeks, ${out.months.length} months in ${out.seconds}s` + ` (fetched: ${N.ec46 ? 'EC46 ' : ''}${N.seas5 ? 'SEAS5' : ''})`);
      if (S.seasonal !== out) throw new Error(last.seasonal || ('weeks/season run incomplete: ' + nNew + ' tehsils'));   /* v91.17.283 · WS1 · back off, never repeat on every tick */
      return { started: true };
    } finally { runningSeasonal = false; }
  }
  const wkRow = (a, start) => a && { start, end: new Date(Date.parse(start + 'T12:00:00Z') + 6 * 864e5).toISOString().slice(0, 10), tAnom: a[0], pT0: a[1], pT1: a[2], pT2: a[3], pAnom: a[4], pP0: a[5], pP10: a[6], pP20: a[7] };
  const moRow = (a, month) => a && { month, tMean: a[0], tAnom: a[1], pMean: a[2], pAnom: a[3], pPct: a[2] != null && a[3] != null && (a[2] - a[3]) > 0 ? Math.round(100 * a[3] / (a[2] - a[3])) : null };
  const weekSignal = (w) => ({ warm: w.pT1 >= 60, cool: w.pT0 != null && w.pT0 <= 25, wet: w.pP10 >= 50 && w.pAnom >= 5, dry: w.pP0 != null && w.pP0 <= 25 && w.pAnom <= -3 });
  const monthSignal = (m) => ({ warm: m.tAnom >= 1, cool: m.tAnom <= -1, wet: m.pAnom >= 10 && m.pPct >= 25, dry: m.pAnom <= -10 && m.pPct <= -25 });
  /* ══ v91.17.283 · WS2 C10 · EXTENDED RANGE IS AN OUTLOOK, NEVER AN ALERT OR AN ACTION ═══════════════════════════════════════════
     EC46 weeks 3-6 and SEAS5 months were turned into client actions ("Schedule earthworks outside that week", "Budget for higher
     cooling") with no verified skill (AUDIT283 C10: week-2 Brier worse than always-50 %, SEAS5 unscored). Both blocks now carry
     use: outlookOnly true, canAlert false, and the skill on record from the seasonal forecast record (seasverify.mjs summary): a
     lead counts as verified only when its Brier scores are on record and below 0.25, the score of always saying 50 % (the reference
     that summary prints). Even verified, extended range stays outlook-only here; the report's action list is asked to move these rows
     to the watch list (WS2 request R1). */
  let _seasSkill = null, _seasSkillAt = 0;
  function extendedUse(kind) {
    if (!_seasSkill || Date.now() - _seasSkillAt > 3600e3) { _seasSkillAt = Date.now(); try { _seasSkill = app.seasVerify && app.seasVerify.summary ? app.seasVerify.summary() : null; } catch (_) { _seasSkill = null; } }
    const leads = (_seasSkill && _seasSkill[kind]) || {}, scored = Object.entries(leads).filter(([, a]) => a && a.brierWarmer != null && a.brierWetter != null);
    const verified = scored.length > 0 && scored.every(([, a]) => a.brierWarmer < 0.25 && a.brierWetter < 0.25);
    return { outlookOnly: true, canAlert: false, verifiedSkill: verified,
      why: (verified ? 'scored better than always saying 50 % at every lead on record' : 'no verified skill yet: ' + (scored.length ? 'not every lead on record scores better than always saying 50 % (Brier below 0.25)' : 'no scored ' + (kind === 'ec46' ? 'week' : 'month') + ' on record'))
        + '; an outlook for planning context, not a basis for alerts or actions' };
  }
  function seasonalUnit(unitId) {
    const X = S.seasonal, u = X && X.units[unitId]; if (!u) return null;
    const today = new Date().toISOString().slice(0, 10);
    return { at: X.at,
      subseasonal: { model: 'ECMWF EC46 (51 members, extended range)', reference: 'anomalies against the model\u2019s own re-forecast climate for the same week', use: extendedUse('ec46'), weeks: X.weeks.map((t, k) => wkRow(u.w[k], t)).filter(w => w && w.end >= today).map(w => ({ ...w, signal: weekSignal(w) })) },
      seasonal: { model: 'ECMWF SEAS5 (51 members, seasonal)', reference: 'anomalies against the SEAS5 hindcast climate for the same month', use: extendedUse('seas5'),
        /* v91.17.69 · tMean / pMean are the SEAS5 grid cell's own values at the cell's height: Ali Abad (Hunza, 2,245 m)
           printed a September mean of -5.8 C and a November mean of -23.8 C because the ~36 km cell sits near 5,000 m.
           The anomaly is kept (model bias cancels against its own hindcast); the absolute value served is the tehsil's
           1991-2020 ERA5 normal at the settlement height plus that anomaly (precipitation: the normal scaled by the
           anomaly's percentage). The grid values stay beside it, named. */
        localBasis: 'ERA5 1991-2020 monthly normal at the tehsil settlement height + the SEAS5 anomaly (temperature added; precipitation scaled by the anomaly percentage); the grid cell values are tMeanGrid / pMeanGrid',
        months: oneDisplay(X.months.map((t, k) => moRow(u.m[k], t)).filter(Boolean).map(m => ({ ...localMonth(unitId, m), signal: monthSignal(m) }))) } };
  }
  /* v91.17.71 · one display per unit: if any month of a mountain unit lacks an anchored normal, every month is shown as its
     anomaly (a table that mixes absolute rows and departure rows reads as two different products) */
  const anomalyText = (ta) => ta == null ? null : (Math.abs(ta) < 0.05 ? 'close to normal (±0.0 °C)' : (ta > 0 ? '+' : '−') + Math.abs(ta).toFixed(1) + ' °C ' + (ta > 0 ? 'warmer' : 'cooler') + ' than normal');
  function oneDisplay(months) {
    if (!months.some(x => x.display === 'anomaly') || !months.some(x => x.display === 'absolute')) return months;
    return months.map(x => x.display !== 'absolute' ? x : { ...x, display: 'anomaly', tMean: null, tNormal: null, normalTier: undefined, tText: anomalyText(x.tAnom),
      displayBasis: 'the season is shown as its departure from normal (SEAS5 against its own hindcast): not every month here has a station-anchored normal' });
  }
  function localMonth(unitId, m) {
    const out = { ...m, tMeanGrid: m.tMean, pMeanGrid: m.pMean, tMean: null, pMean: null };
    try {
      if (!app.climatology || !app.climatology.normals) return out;
      const [y, mo] = m.month.split('-').map(Number); const nd = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      let ts = 0, tn = 0, ps = 0, pn = 0, an = 0;
      for (let d = 1; d <= nd; d++) { const iso = m.month + '-' + String(d).padStart(2, '0'); const x = app.climatology.normals(unitId, iso); if (!x) continue; if (x.tm != null) { ts += x.tm; tn++; if (x.anchored) an++; } if (x.pr != null) { ps += x.pr; pn++; } }
      out.anchored = tn > 0 && an >= tn - 2;   /* v91.17.71 · the normal is station-anchored (climatology.mjs anchorC) */
      if (tn >= nd - 2 && m.tAnom != null) out.tMean = r1(ts / tn + m.tAnom);
      if (pn >= nd - 2 && m.pPct != null) out.pMean = r1(Math.max(0, (ps / pn) * nd * (1 + m.pPct / 100)));
      out.tNormal = tn ? r1(ts / tn) : null; out.pNormal = pn ? r1((ps / pn) * nd) : null;
      out.pAnomGrid = m.pAnom; if (out.pMean != null && out.pNormal != null) out.pAnom = r1(out.pMean - out.pNormal);   /* the mm anomaly on the same local basis as the mean */
    } catch (_) {}
    /* ══ v91.17.70 · IN THE MOUNTAINS THE SEASON IS SERVED AS ITS ANOMALY ═══════════════════════════════════════════
       ERA5 absolute normals run 3-12 C cold in the GB valleys, and a station-anchored normal is internal-only (option 2),
       so above the file's hills line (data/model-zone.json zoneRule.hillsMinElevM, 1,000 m settlement height) the month is
       served as what the forecast system says with its own bias cancelled: the SEAS5 anomaly against its own hindcast
       ("+0.6 °C warmer than normal", "precipitation 120 % of normal"). That is a value, not a gap. The plains keep the
       absolute month. */
    try {
      const u = units.tehsil.find(x => x.unitId === unitId);
      const Z = app.mos && app.mos.zones ? app.mos.zones() : null; const line = (Z && Z.zoneRule && Z.zoneRule.hillsMinElevM) ?? 1000;
      if (u && u.elevM != null && u.elevM > line && out.anchored && out.tMean != null) {
        /* ══ v91.17.71 · A STATION-ANCHORED NORMAL SERVES THE ABSOLUTE MONTH AGAIN ══════════════════════════════════════
           Where the tehsil's normal is anchored to its own stations (data/normal-anchor.json; leave-one-station-out median
           absolute error 1.22 C against 7.88 C for ERA5 [measured, internal]), the month is shown as a value: the anchored
           normal + the SEAS5 anomaly, tier B, credited generically. Precipitation stays relative (the gauges do not see
           winter snow, so no gauge-anchored precipitation normal exists). */
        const ai = app.climatology.anchorInfo ? app.climatology.anchorInfo() : null;
        out.display = 'absolute'; out.pMean = null; out.pNormal = null; out.pAnom = null;
        out.pText = m.pPct == null ? (m.pAnom == null ? null : (m.pAnom >= 0 ? '+' : '−') + Math.abs(Math.round(m.pAnom)) + ' mm against normal') : 'precipitation ' + Math.max(0, Math.round(100 + m.pPct)) + ' % of normal';
        out.displayBasis = 'station-anchored normal at the settlement height + the SEAS5 anomaly' + (ai ? ' (' + ai.label + ', tier ' + ai.tier + ': ' + ai.source + ')' : '');
        out.normalTier = 'B';
      } else if (u && u.elevM != null && u.elevM > line) {
        out.display = 'anomaly'; out.tMean = null; out.tNormal = null; out.pMean = null; out.pNormal = null; out.pAnom = null;
        const ta = m.tAnom; out.tText = ta == null ? null : (Math.abs(ta) < 0.05 ? 'close to normal (±0.0 °C)' : (ta > 0 ? '+' : '−') + Math.abs(ta).toFixed(1) + ' °C ' + (ta > 0 ? 'warmer' : 'cooler') + ' than normal');
        out.pText = m.pPct == null ? (m.pAnom == null ? null : (m.pAnom >= 0 ? '+' : '−') + Math.abs(Math.round(m.pAnom)) + ' mm against normal') : 'precipitation ' + Math.max(0, Math.round(100 + m.pPct)) + ' % of normal';
        out.displayBasis = 'settlement height above ' + line + ' m: the season is shown as its departure from normal (SEAS5 against its own hindcast), not as an absolute value';
      }
    } catch (_) {}
    return out;
  }
  function seasonalNational(week = 2, month = 1) {
    const X = S.seasonal; if (!X) return { ready: false };
    const byId = new Map(units.tehsil.map(u => [u.unitId, u]));
    const wi = Math.max(0, Math.min(X.weeks.length - 1, Number(week) || 0)), mi = Math.max(0, Math.min(X.months.length - 1, Number(month) || 0));
    const rows = Object.entries(X.units).map(([id, u]) => { const t = byId.get(id); if (!t) return null; return { unitId: id, name: t.name, district: t.district, province: t.province, w: wkRow(u.w[wi], X.weeks[wi]), m: moRow(u.m[mi], X.months[mi]) }; }).filter(Boolean);
    const pick = (f, key, dir) => rows.filter(f).sort((a, b) => dir * (key(b) - key(a))).slice(0, 10).map(r => ({ unitId: r.unitId, name: r.name, district: r.district, w: r.w, m: r.m }));
    const provinces = {};
    const medOf2 = (arr) => { const q = arr.filter(x => x != null).sort((x, y) => x - y); return q.length ? q[Math.floor(q.length / 2)] : null; };
    /* v91.17.4 · n was incremented unconditionally while a MISSING anomaly
       contributed 0, so each provincial mean was shrunk toward zero in
       proportion to the missing fraction — a province with half its tehsils
       reporting published half the anomaly it had. medOf2 on mPs in this same
       function already filters nulls, which is the inconsistency that gave it
       away. Each field now carries its own count. */
    for (const r of rows) {
      const p = provinces[r.province] = provinces[r.province] || { n: 0, tA: 0, nTA: 0, pA: 0, nPA: 0, mT: 0, nMT: 0, mPs: [], mA: 0, nMA: 0 };
      p.n++;
      if (r.w.tAnom != null) { p.tA += r.w.tAnom; p.nTA++; }
      if (r.w.pAnom != null) { p.pA += r.w.pAnom; p.nPA++; }
      if (r.m.tAnom != null) { p.mT += r.m.tAnom; p.nMT++; }
      if (r.m.pAnom != null) { p.mA += r.m.pAnom; p.nMA++; }
      p.mPs.push(r.m.pPct);
    }
    return { ready: true, at: X.at, weeks: X.weeks, months: X.months, week: X.weeks[wi], month: X.months[mi], weekIndex: wi, monthIndex: mi, tehsils: rows.length,
      weekCounts: { warm: rows.filter(r => weekSignal(r.w).warm).length, cool: rows.filter(r => weekSignal(r.w).cool).length, wet: rows.filter(r => weekSignal(r.w).wet).length, dry: rows.filter(r => weekSignal(r.w).dry).length },
      monthCounts: { warm: rows.filter(r => monthSignal(r.m).warm).length, cool: rows.filter(r => monthSignal(r.m).cool).length, wet: rows.filter(r => monthSignal(r.m).wet).length, dry: rows.filter(r => monthSignal(r.m).dry).length },
      weekTop: { warm: pick(r => weekSignal(r.w).warm, r => r.w.pT1, 1), wet: pick(r => weekSignal(r.w).wet, r => r.w.pAnom, 1), dry: pick(r => weekSignal(r.w).dry, r => -r.w.pAnom, 1) },
      monthTop: { warm: pick(r => monthSignal(r.m).warm, r => r.m.tAnom, 1), wet: pick(r => monthSignal(r.m).wet, r => r.m.pPct, 1), dry: pick(r => monthSignal(r.m).dry, r => -r.m.pPct, 1) },
      provinces: Object.entries(provinces).map(([name, p]) => ({ name, tehsils: p.n,
        weekTAnom: p.nTA ? r1(p.tA / p.nTA) : null, weekPAnom: p.nPA ? r1(p.pA / p.nPA) : null,
        monthTAnom: p.nMT ? r1(p.mT / p.nMT) : null, monthPAnom: p.nMA ? r1(p.mA / p.nMA) : null,
        monthPPctMedian: medOf2(p.mPs),
        reporting: { weekTAnom: p.nTA, weekPAnom: p.nPA, monthTAnom: p.nMT, monthPAnom: p.nMA, of: p.n } })).sort((a, b) => b.tehsils - a.tehsils),
      rules: { weekWarm: 'at least 60% of members more than 1 °C above normal', weekWet: 'at least 50% of members more than 10 mm above normal and mean anomaly ≥ +5 mm', weekDry: 'at most 25% of members above normal and mean anomaly ≤ −3 mm', monthWarm: 'monthly anomaly ≥ +1 °C', monthWet: '≥ +10 mm and ≥ +25% of normal', monthDry: '≤ −10 mm and ≤ −25% of normal' } };
  }

  const ageH = (x) => x && x.at ? (Date.now() - Date.parse(x.at)) / 3600e3 : Infinity;
  /* A failing job used to be retried on every tick, which is every ten minutes for as
     long as it keeps failing - twelve calls a retry in the bias case. Each job now backs
     off: 10 minutes, then 20, 40, 80, up to 6 hours, and a success clears it. */
  const backoff = {};
  const blocked = (job) => { const b = backoff[job]; return !!(b && Date.now() < b.until); };
  const failed = (job, e) => {
    const b = backoff[job] || (backoff[job] = { n: 0, until: 0 });
    b.n = Math.min(b.n + 1, 6);
    b.until = Date.now() + Math.min(6 * 3600e3, 10 * 60e3 * Math.pow(2, b.n - 1));
    console.error('  outlook ' + job + ' error', e && e.message,
      '- next attempt after ' + new Date(b.until).toISOString().slice(11, 16) + 'Z');
  };
  const ok = (job) => { delete backoff[job]; };
  const runJob = (job, fn) => fn().then(r => { ok(job); return r; }, e => failed(job, e));

  function tick() {
    if (process.env.NIGRAAN_OUTLOOK === '0' || !provider.configured()) return;
    /* the bias job no longer blocks the rest of the tick: a stale correction is a reason
       to refit it, not a reason to stop producing the outlook, the season and the sun */
    if (ageH(S.ensBias) >= 24 && !runningBias && !blocked('bias')) {
      /* v91.17.283 · WS1 · D1 · after the bias refit the ensemble is derived again only from a 00/12 UTC run (the stored one, answered from
         the run-keyed cache at no provider cost, or a new one); when the provider's latest run is 06/18 UTC the refit waits for the next */
      runJob('bias', () => runEnsembleBias().then(async () => { const d = await ensembleDue(); if (d.run || d.latestIsMain !== false) { try { return await runEnsembleIssue(d); } catch (e) { failed('ensemble', e); } } }));
    } else if (!running.ensemble && !blocked('ensemble')) {
      /* v91.17.283 · WS1 · D1 (coordinator, 21 Oct): the 15-day ensemble outlook is updated twice daily, from the 00 and 12 UTC ECMWF ENS
         runs (the runs that reach day 15; the 06/18 UTC runs end at 144 h), read from the provider's model metadata (api/modelruns.mjs);
         without metadata the 12-hour age rule (was every 6 h) */
      ensembleDue().then((d) => { if (d.run && !running.ensemble && !blocked('ensemble')) runJob('ensemble', () => runEnsembleIssue(d)); }).catch(() => {});
    }
    /* v91.17.283 · WS1 · weeks/season: fetched when the provider has a newer EC46 or SEAS5 run than the stored one (its model metadata); a
       product whose metadata cannot be read keeps the old 12-hour rule */
    if (!runningSeasonal && !blocked('seasonal')) seasonalDue().then((d) => { if (d && (d.need.ec46 || d.need.seas5) && !runningSeasonal && !blocked('seasonal')) runJob('seasonal', () => runSeasonal(d.need, d.issue)); }).catch(() => {});
    if (ageH(S.radiation) >= 6 && !running.radiation && !blocked('radiation')) runJob('radiation', runRadiation);
  }
  /* the latest 00/12 UTC ENS run (target) and whether the stored outlook is older than it */
  async function ensembleDue() {
    adoptNewer();
    const MR = app.modelRuns, old = ageH(S.ensemble) >= Number(process.env.NIGRAAN_ENSEMBLE_HOURS || 12);
    if (!MR) return { run: old, target: null, latestIsMain: null };
    const spec = MR.specFor('ensemble', (k) => (k === 'models' ? MODEL : null));
    const key = spec ? await MR.poll(spec).catch(() => null) : null;
    const init = key ? Number(String(key).split('@')[1]) : NaN;
    if (!Number.isFinite(init)) return { run: old, target: null, latestIsMain: null };
    const main = new Date(init * 1000).getUTCHours() % 12 === 0, target = main ? init : init - 6 * 3600;
    const have = (S.ensemble && S.ensemble.issueInit) || 0;
    return { run: have < target, target, latestIsMain: main, latest: init };
  }
  /* run it and record the issue; a run that produced no outlook throws, so the job backs off (never fetched again on every tick) */
  async function runEnsembleIssue(d) {
    const before = S.ensemble; const r = await runEnsemble(d);
    if (r && r.started === false) return r;
    if (!S.ensemble || S.ensemble === before) throw new Error(last.ensemble || 'ensemble run produced no outlook');
    if (d && d.target) { S.ensemble.issueInit = Math.max(S.ensemble.issueInit || 0, d.target); if (d.latest) S.ensemble.runInit = d.latest; save(); }   /* PATCH3 · runInit: the provider's latest run when fetched (the data's run) */
    return r;
  }
  async function seasonalDue() {
    const MR = app.modelRuns, old = ageH(S.seasonal) >= 12, last0 = (S.seasonal && S.seasonal.issue) || {};
    if (!MR) return { need: { ec46: old, seas5: old }, issue: null };
    const spec = (m) => MR.specFor('seasonal', (k) => (k === 'models' ? m : null));
    const [kE, kS] = await Promise.all([MR.poll(spec('ecmwf_ec46')).catch(() => null), MR.poll(spec('ecmwf_seas5')).catch(() => null)]);
    return { need: { ec46: kE ? kE !== last0.ec46 : old, seas5: kS ? kS !== last0.seas5 : old }, issue: { ec46: kE, seas5: kS } };
  }
  const backoffState = () => Object.entries(backoff).map(([job, b]) =>
    ({ job, attempts: b.n, retryAfter: new Date(b.until).toISOString() }));

  function findUnit(q) {
    if (!q) return null; const s = String(q).toLowerCase().trim();
    const T = units.tehsil;
    return T.find(u => u.unitId.toLowerCase() === s) || T.find(u => u.name.toLowerCase() === s) || T.find(u => (u.key || '').toLowerCase() === s)
      || T.find(u => u.district && u.district.toLowerCase() === s && u.name.toLowerCase() === s) || T.find(u => u.name.toLowerCase().startsWith(s)) || null;
  }
  function sunshine(unitId) {
    const r = S.radiation && S.radiation.units[unitId]; if (!r) return null;
    const today = localDate(Date.now()), days = r.days;
    const t = days.find(d => d.date === today), past = days.filter(d => d.date !== today && d.complete);
    /* satellite reads ~10% brighter than the model on ordinary days, so judge each day against
       this tehsil's own typical ratio over the last two weeks, not against 1.0 */
    /* v91.17.68 · no typical ratio (fewer than 5 complete days) means no anomaly and no verdict, not an assumed 1.1 (audit B3) */
    const base = r.typicalRatio;
    const verdict = (x) => { if (x == null || base == null) return null; const a = x / base; return a < 0.85 ? 'cloudier than the model expected: afternoon temperature forecast may run warm' : a > 1.12 ? 'sunnier than the model expected: afternoon temperature forecast may run cool' : 'in line with the model'; };
    const anom = (x) => (x == null || base == null) ? null : Math.round(100 * x / base) / 100;
    return { at: S.radiation.at, lastHour: r.lastHour, typicalRatio: r.typicalRatio, typicalDays: r.typicalDays, today: t ? { ...t, anomaly: anom(t.ratio), verdict: verdict(t.ratio) } : null, past: past.slice(-7).map(d => ({ ...d, anomaly: anom(d.ratio), verdict: verdict(d.ratio) })) };
  }
  /* ══ v91.17.73 · THE AI TERM AT SERVE TIME ══════════════════════════════════════════════════════════════════════════
     The members carry the AI local correction the unit's served card took (servedTerm, persisted in data/ai-served-terms.json
     by the national sweep). When the stored ensemble ran with another term (an older run, a newer sweep, a restart, the
     kill switch), its percentiles are moved at serve time by (current term - the term applied in the run), day by day: a
     constant shift of every member moves every percentile by exactly that amount, so P50 and the card stay on one basis.
     Class chances and multi-day events keep the run's values until the next run (twice daily, v91.17.283 D1); the block says so. */
  function aiServe(u, bu) {
    try {
      const E = S.ensemble; if (!E || !u || u.lat == null) return null;
      let elig = bu ? bu.aiEligible : undefined;
      if (elig === undefined) elig = !!(bu && bu.calibration) || (!(bu && bu.l2) && u.elevM != null && !!app.mos && app.mos.zoneOfPoint(u.lat, u.lon, u.elevM) === 'plains');   /* a run before v91.17.73 */
      const stored = (bu && bu.aiLocal && bu.aiLocal.byDay) || [];
      if (!elig && !stored.some(Boolean)) return null;
      const D = downscaleFor(app); const on = aiEnabled() && !!D;
      const cur = E.days.map((d, k) => { if (!on || !elig) return null; const t = D.servedTerm(u.lat, u.lon, String(d).slice(0, 10)); return t ? [t.dTx, t.dTn] : (stored[k] || null); });
      const delta = cur.map((c, k) => { const a = c || [0, 0], b = stored[k] || [0, 0]; return [Math.round((a[0] - b[0]) * 100) / 100, Math.round((a[1] - b[1]) * 100) / 100]; });
      const moved = delta.some(x => x[0] || x[1]);
      const days = cur.filter(Boolean).length;
      const block = days ? { label: 'AI local correction (terrain and land surface)', tier: 'B', days, tx: cur[1] ? cur[1][0] : null, tn: cur[1] ? cur[1][1] : null, byDay: cur,
        ...(moved ? { appliedAt: 'serve', note: 'percentiles moved to the term the served forecast carries now; class chances and events refresh at the next ensemble run' } : {}) } : null;
      return { delta: moved ? delta : null, block };
    } catch (_) { return null; }
  }
  const shiftRow = (row, d) => { if (!row || !d || (!d[0] && !d[1])) return row; const sh = (a, v) => Array.isArray(a) ? a.map(x => x == null ? x : Math.round((x + v) * 10) / 10) : a; return { ...row, tx: sh(row.tx, d[0]), tn: sh(row.tn, d[1]), at: sh(row.at, d[0]) }; };
  /* ══ v91.17.77 · SCI · THE ORDINARY GUARD ═══════════════════════════════════════════════════════════════════════════
     A chance is a warning only if the event is not simply the season. data/outlook-event-climate.json holds, per tehsil
     and calendar fortnight, the share of the years 1991-2020 in which the same event (same rules, reanalysis at the
     settlement height) happened; single-day thresholds the share of days that crossed them. Where that share reaches
     the data file's ordinary line, the served chance is null with the reason (the map leaves the tehsil uncoloured and
     names why), and the member share stays beside it as pMembers. Every served event carries climP, its normal chance.
     Stored runs and the verification log keep the raw member shares. */
  const ordinaryCut = () => { const D = defs(); return D && D.ordinaryGuard ? D.ordinaryGuard.ordinaryBaseRatePct : null; };
  /* v91.17.153 · audit item 18 · A STALE RUN IS READ FROM TODAY. Event chances were the share of members with an onset anywhere in the
     run's window, so a run 30 h old still counted spells that began yesterday. Each member's onset day is kept with the run; when today
     is later than the run's first full day, the chance is re-counted over onsets from today on (spells already under way are not new
     onsets and are said so). The run's own values are kept beside them. */
  function fromToday(E, evIn) {
    const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
    const t0 = E.days.indexOf(today);
    /* v91.17.206 · each event also carries its member hits as a bit string over memberIndex ('1' = this member has an onset in the
       window from today). The Scenario Lab resamples whole members, so dependence between events and between sites comes from the
       ensemble itself instead of an assumed correlation. Only when every event of the unit was counted over the same members. */
    const thr0 = t0 > 1 ? t0 : 0;
    const strip = (o) => { if (!o || typeof o !== 'object') return o; const { _k, ...r } = o; if (Array.isArray(_k) && evIn && Array.isArray(evIn.memberIndex) && _k.length === evIn.memberIndex.length) r.m = _k.map(k => k >= thr0 ? '1' : '0').join(''); return r; };
    const clean = (ev) => { const o = {}; for (const [k, v] of Object.entries(ev || {})) o[k] = (k === 'heatSpellClasses' && v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).map(([a, b]) => [a, strip(b)])) : strip(v); return o; };
    if (!(t0 > 1)) return { start: E.days[1], ev: clean(evIn), note: null };
    const re = (x) => { if (!x || typeof x !== 'object' || !Array.isArray(x._k) || x.p == null) return strip(x);
      const n = x._k.length, yes = x._k.filter(k => k >= t0).sort((a, b) => a - b);
      return { ...strip(x), pRun: x.p, p: n ? Math.round(100 * yes.length / n) : null, onset: yes.length ? E.days[yes[Math.floor(yes.length / 2)]] : null, earliest: yes.length ? E.days[yes[0]] : null }; };
    const out = {}; for (const [k, v] of Object.entries(evIn || {})) out[k] = (k === 'heatSpellClasses' && v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).map(([a, b]) => [a, re(b)])) : re(v);
    return { start: today, ev: out, note: 'the run started ' + E.days[0] + '; chances are re-counted over onsets from ' + today + ' (pRun is the run\'s own value over its whole window; a spell already under way is not a new onset)' };
  }
  function guardEv(unitId, ev) {
    const E = S.ensemble; if (!ev || !E) return ev;
    const cut = ordinaryCut(), start = E.days[1], out = { ...ev };
    for (const k of WITHHELD_EVENTS) delete out[k];   /* v283.36 items 20 / 23: also from a run stored before 1.0 */
    if (out.rainUnion) out.rainUnion = { p: null, why: WITHHELD_WHY }; if (out.windAny) out.windAny = { p: null, why: WITHHELD_WHY };
    if (out.max3dRain && !out.rain3Amount) out.rain3Amount = { p10: out.max3dRain[0], p50: out.max3dRain[1], p90: out.max3dRain[2], unit: 'mm, wettest 3 days of the window (members)' };
    for (const e of EVENTS) {
      const x = ev[e.id]; if (!x || typeof x !== 'object') continue;
      const base = EC.event(unitId, e.id, start);
      if (base != null && cut != null && x.p != null && base >= cut) out[e.id] = { ...x, climP: base, pMembers: x.p, p: null, ordinary: true, why: 'ordinary here at this time of year: in ' + ((EC.info() || {}).period || '1991-2020') + ' it happened in ' + base + ' % of years in this same fortnight, so its chance is not shown as a level' };
      else out[e.id] = { ...x, climP: base };
    }
    return out;
  }
  function guardRow(unitId, row) {
    if (row && row.p && WITHHELD_DAY_EVENTS.some((k) => k in row.p)) { const p = { ...row.p }; for (const k of WITHHELD_DAY_EVENTS) delete p[k]; row = { ...row, p }; }   /* v283.36: a run stored before 1.0 */
    const cut = ordinaryCut(); if (!row || !row.p || cut == null) return row;
    let p = null, w = null;
    for (const th of THRESHOLDS) { const v = row.p[th.id]; if (v == null) continue; const base = EC.day(unitId, th.id, row.date);
      if (base != null && base >= cut) { p = p || { ...row.p }; w = w || { ...(row.pWhy || {}) }; p[th.id] = null; w[th.id] = 'ordinary here at this time of year: in ' + ((EC.info() || {}).period || '1991-2020') + ' ' + base + ' % of days in this part of the year crossed it'; } }
    return p ? { ...row, p, pWhy: w, pMembers: row.p } : row;
  }
  function unitRows(u) {
    const E = S.ensemble; const base = E && E.units[u.unitId]; if (!base) return { rows: null, ai: null };
    const bu = E.basis && E.basis.units ? E.basis.units[u.unitId] : null; const ai = aiServe(u, bu);
    const rows = (ai && ai.delta ? base.map((r, k) => shiftRow(r, ai.delta[k])) : base).map((r, k) => guardRow(u.unitId, { date: E.days[k], ...r }));
    return { rows, ai };
  }
  /* the definitions as served: the label, and the rule with its numbers from the data file */
  function servedDefs() {
    const D = defs();
    return EVENTS.map(e => { const d = D && D.events && D.events[e.id]; if (!d) return e;
      const fl = d.floor ? ' Floor by zone (' + (d.floor.variable === 'tx' ? 'daily maximum ' : 'daily minimum ') + ({ '>=': '≥', '<=': '≤' }[d.floor.op] || d.floor.op) + '): ' + Object.entries(d.floor.byZone).map(([z, v]) => z + ' ' + v + ' °C').join(', ') + '.' : '';
      return { ...e, label: d.name || e.label, rule: d.rule + '.' + fl, minRunDays: d.minRunDays, source: 'data/outlook-event-definitions.json' }; });
  }
  /* ══ v91.17.283.3 · W3 · BY POINT, THE OUTLOOK TEMPERATURES ARE AT THE POINT'S HEIGHT ═══════════════════════════════════════
     The members are fetched at the tehsil settlement height (u.elevM). Asked for a point (/api/outlook/unit?lat&lon), the point
     forecast is served at the point's own terrain height (pointheight.mjs), so the two disagreed on the same days (Murree 22.9 vs
     18.3 C; Gojal 10.4 vs -5.7 C). The daily max / min / apparent-max percentiles are moved from the tehsil height to the point height
     at the standard lapse rate (data/engineering-references.json standard_lapse_rate_C_per_m: "moves a tehsil percentile from the
     tehsil height to the asset height"; it is the same linear rate the provider applies when a height is sent, so the moved value is
     what the members would read at that height). Probabilities, events, rain, snow and gusts stay the area's and are labelled
     "area outlook at N m". No rate on file or no point height: nothing is moved and every value is labelled the area's. */
  let PH_ = null; const PH = () => { if (PH_ === null) { try { PH_ = createPointHeight(dataDir); } catch (_) { PH_ = false; } } return PH_ || null; };
  const lapseRate = () => { try { const E = JSON.parse(readFileSync(join(dataDir, 'engineering-references.json'), 'utf8')); const v = E && E.references && E.references.standard_lapse_rate_C_per_m && E.references.standard_lapse_rate_C_per_m.value; return Number.isFinite(v) ? v : null; } catch (_) { return null; } };
  function pointBasis(u, pt) {
    if (!pt || !Number.isFinite(pt.lat) || !Number.isFinite(pt.lon)) return null;
    let h = null; try { h = PH() && PH().heightAt(pt.lat, pt.lon); } catch (_) { h = null; }
    const zp = h && h.ok ? (h.elevM != null ? h.elevM : h.cellElevM) : null, za = u.elevM ?? null, L = lapseRate();
    const area = 'area outlook at ' + (za != null ? Math.round(za).toLocaleString('en-US') + ' m' : 'the tehsil height');
    if (zp == null || za == null || L == null) return { mode: 'area', areaElevM: za, pointElevM: zp == null ? null : Math.round(zp), shiftC: null, label: area, why: zp == null ? 'no terrain height at the point' : za == null ? 'no tehsil height' : 'no lapse rate on file (data/engineering-references.json)' };
    const sh = Math.round(L * (zp - za) * 10) / 10;
    return { mode: 'point', areaElevM: za, pointElevM: Math.round(zp), shiftC: sh, lapseCperKm: Math.round(L * 1e4) / 10, label: 'temperatures at the point height ' + Math.round(zp).toLocaleString('en-US') + ' m; probabilities, events, rain, snow and gusts: ' + area,
      basis: 'daily max, min and apparent max percentiles moved from ' + Math.round(za) + ' m to ' + Math.round(zp) + ' m at the standard lapse rate (' + (Math.round(L * 1e4) / 10) + ' C per km), the rate the provider applies when a height is sent' };
  }
  /* v91.17.283.33 · Part 2 · THE FORECAST TIERS of a tehsil, served in the place record (placerecord.mjs outlookTiers):
       days 0-3   the place forecast (unchanged; its own accuracy)
       days 4-7   ranges: the 10th to 90th percentile of the ensemble members (daily max, min, rain), the median beside it
       days 8-14  chances against normal (hotter / colder, wetter / drier) and the chance of at least one day of 15.6 mm or more
     Tiers 2 and 3 are not yet scored against stations: accuracy "not measured". */
  function tiers(unitId) {
    const u = unitId ? findUnit(unitId) : null; const E = S.ensemble;
    if (!u || !E || !E.units || !E.units[u.unitId]) return { ready: false, why: 'no ensemble outlook held for this tehsil' };
    const rows = unitRows(u).rows || [];
    const range = (a) => Array.isArray(a) && a[0] != null && a[2] != null ? { p10: a[0], p50: a[1], p90: a[2] } : null;
    const d47 = []; for (let k = 4; k <= 7 && k < E.days.length; k++) { const r = rows[k] || {}; d47.push({ date: E.days[k], lead: k, tmaxC: range(r.tx), tminC: range(r.tn), rainMm: range(r.pr) }); }
    const w = (E.wk2 && E.wk2[u.unitId]) || { ready: false, why: 'the ensemble run held predates the days 8-14 summary (it is added on the next run)' };
    const NM = 'not measured: this tier is not yet scored against stations';
    return { ready: true, at: E.at, model: 'ECMWF IFS ENS 0.25°', members: E.members, unitId: u.unitId,
      tiers: [
        { id: 'days0to3', days: '0-3', what: 'the place forecast (single values)', accuracy: 'see the place record accuracy' },
        { id: 'days4to7', days: '4-7', what: 'ranges: 10th to 90th percentile of the ensemble members, median beside it', days4to7: d47, accuracy: NM },
        { id: 'days8to14', days: '8-14', what: 'chances against the 1991-2020 normal of the same days, and the chance of a day of 15.6 mm or more', days8to14: w, accuracy: NM }],
      note: 'raw ensemble member shares and percentiles, not calibrated; for planning, not for alerts' };
  }
  function unit(q, pt = null) {
    const u = findUnit(q); if (!u) return null;
    const E = S.ensemble; const UR0 = unitRows(u); const PB = pointBasis(u, pt);
    const UR = PB && PB.mode === 'point' && UR0.rows ? { ...UR0, rows: UR0.rows.map((r) => shiftRow(r, [PB.shiftC, PB.shiftC])) } : UR0, rows = UR.rows;
    return {
      ...(PB ? { heightBasis: PB } : {}),
      unit: { unitId: u.unitId, name: u.name, district: u.district, province: u.province, elevM: u.elevM, anchorElevM: u.anchorElevM ?? null, elevSource: u.elevSource || null, settleGapM: u.settleGapM ?? null, disputed: !!u.disputed,
        hand: (app.hand && app.hand.of && app.hand.of(u.unitId)) || null, /* v91.17.39 · floodplain share, the riverine 'where' factor */
        lithology: (() => { const l = app.terrain && app.terrain.lithology && app.terrain.lithology(u.unitId); return l ? { material: l.material, materialShare: l.materialShare, dominant: l.dominant } : null; })(), /* v91.17.40 */
        wetness: (app.wetness && app.wetness.current ? (app.wetness.current(u.unitId) || app.wetness.staleNote()) : null) || null /* v91.17.42 · catchment wetness state; v91.17.172 · audit E-4: a run older than 9 h is {stale, at}, not the state */ },
      adjustment: S.ensBias && S.ensBias.units[u.unitId] ? { window: S.ensBias.window, ...S.ensBias.units[u.unitId], stationGuard: (app.verification.guarded && app.verification.guarded(u.unitId, 24)) || null } : null,
      /* ══ v91.17.13 · FOUR OF THE FIFTEEN DAYS ARE OUTSIDE THE VERIFICATION
         DESIGN, AND NOTHING SAID SO ═════════════════════════════════
         MEASURED: this endpoint serves 15 days (leads 0 to 14). The ensemble
         verification logs and scores leads 1, 2, 3, 5, 7 and 10 only. So leads
         11 to 14 will never be scored by this design at all, and leads 4, 6, 8
         and 9 are only ever interpolated between verified points.

         `calibrated: false` was the only marker, and it does not separate
         "not verified yet, the record is young" from "this lead is outside
         what the verification was built to cover". Those are different claims
         and a reader is entitled to both. Each day now carries which one it
         is. No probability changes; this adds a field and a sentence. */
      ensemble: rows ? (() => {
        const L = (app.ensVerify && app.ensVerify.LEADS) || [1, 2, 3, 5, 7, 10];
        const maxL = Math.max(...L);
        return { at: E.at, model: 'ECMWF IFS ENS 0.25\u00b0', members: E.members, updated: ENS_UPDATED, modelRun: E.runInit ? { runs: { ecmwf_ifs025_ensemble: new Date(E.runInit * 1000).toISOString().slice(0, 16) + 'Z' }, basis: 'the provider\'s latest ENS run when this outlook was fetched (its metadata; v91.17.283 PATCH3)' } : { runs: null, why: 'fetched before the run was recorded' },
          basis: (E.basis && E.basis.units && E.basis.units[u.unitId]) ? { ...E.basis.units[u.unitId], aiLocal: UR.ai ? UR.ai.block : null, version: E.basis.version } : null,   /* v91.17.70 · height and reference of these members */
          days: E.days.map((date, k) => ({ date, ...rows[k],
            leadDays: k,
            verificationDomain: k === 0 ? 'analysis day'
              : L.includes(k) ? 'scored at this lead'
              : k <= maxL ? 'between scored leads (' + L.join(', ') + ')'
              : 'beyond the verified leads' })),
          calibrated: false,
          verifiedLeads: L,
          verificationNote: 'the ensemble record scores lead days ' + L.join(', ')
            + '. Days between those leads are bounded by them; days beyond ' + maxL
            + ' are outside what this verification covers and no skill statement exists for them at any horizon.' };
      })() : null,
      events: E && E.events && E.events[u.unitId] ? (() => { const FT = fromToday(E, E.events[u.unitId]); const ev = { window: [FT.start, E.days[E.days.length - 1]], ...(FT.note ? { fromToday: FT.note } : {}), definitions: servedDefs(), climatology: !!E.climatology, eventClimate: EC.info(), ordinaryBaseRatePct: ordinaryCut(), ...guardEv(u.unitId, FT.ev) };
        if (ev.heatSpellClasses) { ev.heatSpellClasses = { ...ev.heatSpellClasses, why: HEAT_CLASSES_WHY }; if (ev.heatSpellClasses.absolute40 && ev.heatSpellClasses.absolute40.why) ev.heatSpellClasses.absolute40 = { ...ev.heatSpellClasses.absolute40, why: 'on the coast the humid-heat class (coastalHeat) is the heat measure' }; }
        return ev; })() : null,   /* v91.17.70 · the served text, not the text stored with an older run */
      deterministicBias: (() => { const c = app.store.find('biasCorrections', x => x.unitId === u.unitId && x.lead_hours === 72); return c ? { lead_hours: 72, meanBias_c: c.meanBias, correctionApplied: !!(c.fitted && c.serving), correctionFitted: !!c.fitted, note: 'bias of the deterministic forecast vs ERA5 (negative = forecast too cold); context only, not applied to the ensemble' } : null; })(),
      sunshine: sunshine(u.unitId), thresholds: THRESHOLDS,
    };
  }
  function national(dayIndex = 1) {
    const E = S.ensemble; if (!E) return { ready: false };
    const k = Math.max(0, Math.min(E.days.length - 1, Number(dayIndex) || 0));
    const byId = new Map(units.tehsil.map(u => [u.unitId, u]));
    const rows = Object.entries(E.units).map(([id, d0]) => { const u = byId.get(id); if (!u || !d0[k]) return null; const d = unitRows(u).rows || d0; return { unitId: id, name: u.name, district: u.district, province: u.province, tx: d[k].tx, tn: d[k].tn, pr: d[k].pr, gu: d[k].gu, p: d[k].p }; }).filter(Boolean);   /* v91.17.68 · a unit missing from the registry or the day is skipped, not a 500 (B14) */
    const counts = {}, top = {};
    for (const th of THRESHOLDS) {
      counts[th.id] = { any: rows.filter(r => r.p[th.id] >= 10).length, likely: rows.filter(r => r.p[th.id] >= 50).length };
      top[th.id] = rows.filter(r => r.p[th.id] > 0).sort((a, b) => b.p[th.id] - a.p[th.id]).slice(0, 12).map(r => ({ unitId: r.unitId, name: r.name, district: r.district, prob: r.p[th.id], median: r[th.v] && r[th.v][1] }));
    }
    const evTop = {}, evCounts = {};
    if (E.events) for (const e of EVENTS) {
      const list = Object.entries(E.events).map(([id, ev]) => ({ id, ev: guardEv(id, ev)[e.id] })).filter(x => x.ev && x.ev.p != null);
      if (!list.length) continue;
      evCounts[e.id] = { any: list.filter(x => x.ev.p >= 10).length, likely: list.filter(x => x.ev.p >= 50).length };
      evTop[e.id] = list.filter(x => x.ev.p > 0).sort((a, b) => b.ev.p - a.ev.p).slice(0, 10).map(x => { const u = byId.get(x.id); return { unitId: x.id, name: u.name, district: u.district, prob: x.ev.p, onset: x.ev.onset }; });
    }
    return { ready: true, at: E.at, events: { definitions: servedDefs(), window: [E.days[1], E.days[E.days.length - 1]], counts: evCounts, top: evTop, climatology: !!E.climatology }, date: E.days[k], dayIndex: k, days: E.days, tehsils: rows.length, counts, top, thresholds: THRESHOLDS,
      rows: rows.map(r => ({ unitId: r.unitId, name: r.name, district: r.district, tx50: r.tx && r.tx[1], pr50: r.pr && r.pr[1], p: r.p })) };
  }
  /* week-2 style summary across all days for the AI and the highlights strip */
  function unitSummary(unitId, maxDays = 10) {
    const E = S.ensemble, d0 = E && E.units[unitId]; if (!d0) return null; const uu = units.tehsil.find(x => x.unitId === unitId); const d = (uu && unitRows(uu).rows) || d0;
    const ev = E.events && E.events[unitId] ? guardEv(unitId, fromToday(E, E.events[unitId]).ev) : null;   /* v91.17.153 */
    return { issued: E.at, source: 'ECMWF IFS ENS 51 members, raw member fractions (not calibrated); ' + ENS_UPDATED, multiDayEvents_chance_pct: ev ? Object.fromEntries(EVENTS.filter(e => ev[e.id]).map(e => [e.label, { chance_pct: ev[e.id].p, typical_onset: ev[e.id].onset }])) : null, days: E.days.slice(0, maxDays).map((date, k) => ({ date, tmax_p10_p50_p90: d[k].tx, tmin_p10_p50_p90: d[k].tn, rain_mm_p10_p50_p90: d[k].pr, gust_kmh_p50: d[k].gu && d[k].gu[1], chance_pct: d[k].p })) };
  }
  function status() {
    const E = S.ensemble, R = S.radiation;
    return { ensemble: E ? { at: E.at, model: 'ECMWF IFS ENS 0.25°', members: E.members, days: E.days.length, tehsils: Object.keys(E.units).length, failedUnits: E.failedUnits, seconds: E.seconds, adjusted: E.adjusted } : null,
      seasonal: S.seasonal ? { at: S.seasonal.at, tehsils: Object.keys(S.seasonal.units).length, weeks: S.seasonal.weeks.length, months: S.seasonal.months.length } : null,
      adjustment: S.ensBias ? { at: S.ensBias.at, window: S.ensBias.window, summary: S.ensBias.summary } : null,
      radiation: R ? { at: R.at, tehsils: Object.keys(R.units).length, failedUnits: R.failedUnits, window: [R.start, R.end] } : null,
      running, lastError: last, thresholds: THRESHOLDS, memberArchive: (() => { try { return EM.status(); } catch (_) { return null; } })(),   /* v91.17.284 */
      notes: ['Probabilities are raw ensemble member fractions and are not yet calibrated against observations.', 'Days 1-3: the deterministic bias-corrected forecast is the verified reference.', 'Sunshine ratio = satellite shortwave / forecast-model shortwave for the same hours, judged against the tehsil\'s own median ratio over the last 15 days (satellite reads about 10% brighter on ordinary days).'] };
  }
  /* v91.17.41 · the kept members for a lake-hosting unit: { at, days, elevM, tx, tn, pr, sn } or null */
  function members(unitId) { const E = S.ensemble; const g = E && E.glofMembers && E.glofMembers[unitId]; return g ? { at: E.at, days: E.days, model: E.model, verifiedLeads: (app.ensVerify && app.ensVerify.LEADS) || [1, 2, 3, 5, 7, 10], ...g } : null; }
  /* v91.17.77 · SCI · the 1991-2020 event base rates (heavy: 24 reanalysis batches); written to data/outlook-event-climate.json */
  async function buildEventClimate() {
    const { buildOutlookEventClimate } = await import('./outlookclim.mjs');
    return buildOutlookEventClimate({ provider, units: units.tehsil, dataDir, zoneOf: (lat, lon, elevM) => zoneOf({ lat, lon, elevM }), coastalOf: isCoastal, thresholds: THRESHOLDS });
  }
  return { tiers, buildEventClimate, eventClimate: EC, servedDefs, localMonth, seasonalUnit, seasonalNational, runSeasonal, seasonalDue, ensembleDue, EVENTS, backoffState, runEnsembleBias, runEnsemble, runRadiation, tick, unit, national, status, sunshine, unitSummary, findUnit, members,
    /* v91.17.283.13 · the day rows of the held ensemble run (the issued rain level reads them: hazsci.mjs) */
    dayRows: () => { const E = S.ensemble; return E && E.units ? { at: E.at, issueInit: E.issueInit || null, model: E.model, members: E.members, days: E.days, units: E.units } : null; } };
}
