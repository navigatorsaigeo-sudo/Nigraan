/* ══ v91.17.283.14 (283.16: per-network settings) · VALUE-LEVEL QUALITY CONTROL OF OBSERVATIONS: ONE MODULE, EVERY CONSUMER ════════════════════════════════════════
   Owner decision 24 Oct 2026 08:29 PKT: "If you decide that any single sensor output is wrong, don't drop the whole station - sooner or
   later all stations will be dropped. Better option: drop that single value." There is no station list in operation any more (no holds,
   no non-representative list, no registry site/indoor exclusion, no held-out siting offsets, no trust gate). Each observation VALUE
   (station x variable x hour) is judged here; only a failing value is dropped; a station that reads wrong all the time loses those
   values automatically and comes back automatically when it reads right again.

   Consumers (all call this module; no check is repeated elsewhere):
     server/api/fleet.mjs           the live MACH poll (qcCross) and the database backfill of the running correction (qcBatch)
     server/api/hyperlocal.mjs      the live MACH layer reads the fleet rows this module passed (r.ok.T)
     scripts/agents/verify.mjs      verification truth (loadObs -> qcBatch), every network
     scripts/agents/diagnose.mjs    the same truth, and the per-station share of values failing each test
     _admin/retrain/py/obsqc_truth.py   the 1 Nov retrain truth: it calls this file's command line (node obsqc.mjs --csv ...)
   Every value carries { pass, test, size } where it fails: test is the first failed check in the order below; size is the departure
   in the check's own unit (gross / climate / internal / step: the variable's unit; buddy / background: units of the local standard
   deviation, with the departure in the variable's unit beside it).

   THE CHECKS, IN ORDER (each value: first failure wins; the published basis of each, the numbers in data/obs-qc-params.json)
   1 GROSS RANGE      physical limits per variable - Zahumensky 2004, "Guidelines on Quality Control Procedures for Data from Automatic
                      Weather Stations" (WMO CIMO), plausible value check; WMO-No. 1269 (Guide to the Global Observing System's
                      quality-control guidance, 2021 ed.) section on basic QC; WMO-No. 488 (Guide on the GOS) Appendix III.1 gross error
                      limits. Climatological range for temperature (WMO-No. 1269: "climatological limits"): the calendar month's national
                      envelope from NOAA GSOD Pakistan and the departure from the served forecast's hour (data/fleet-range-screen.json,
                      derive_range.py, v91.17.283 WS2 F1) - both data-derived, not typed.
   2 STEP / PERSISTENCE  Zahumensky 2004 time-consistency checks: the step test (maximum allowed variability between successive values)
                      and the persistence test (minimum required variability). Temperature and the whole record: the station's own series
                      screen of stuckscreen.mjs (replayed frozen record, unconfirmed jump, frozen value, silent outdoor array; limits
                      learned from clean stations, K99 / K999 / FROZEN_MIN), plus the shielded-array window of shieldscreen.mjs (live
                      poll). Humidity, dew point, pressure: a spike (a step larger than the variable's step limit scaled by sqrt(gap /
                      60 min), returning within the same limit at the next reading) and a run of one unchanged value longer than the
                      variable's persistence limit (relative humidity at or above the saturation guard excepted: fog holds 100 %);
                      limits = the 99.9th percentile of hourly steps and of unchanged runs at the reference networks (synoptic, airport)
                      over the replay window (scripts/tests28314/derive_params.mjs).
   3 INTERNAL CONSISTENCY  Zahumensky 2004 internal consistency: dew point <= air temperature (plus the instruments' stated tolerance),
                      relative humidity within 0-100 %, the reported dew point agrees with the one implied by temperature and humidity
                      (Magnus, Alduchov and Eskridge 1996), Tmin <= T <= Tmax when a row carries them, gust >= wind speed, station
                      pressure fits the station's height (station level p0*exp(-z/H) or sea level, within the stated tolerance).
                      A humidity fault drops humidity and dew point; the temperature stays (a dew point implied above the highest
                      observed in Pakistan drops the temperature too: the pair cannot say which sensor is wrong).
   4 SPATIAL CONSISTENCY  the buddy check of TITAN (Båserud, Lussana, Nipen, Seierstad, Oram and Aspelien 2020, "TITAN automatic spatial
                      quality control of meteorological in-situ observations", Adv. Sci. Res. 17, 153-163; titanlib buddy_check): every
                      value against the mean of its buddies - the other values of the same variable and hour within radius_km, in the
                      same terrain zone and within max_elev_diff_m, moved to its height with elev_gradient (the standard-atmosphere
                      6.5 C/km NIGRAAN applies elsewhere: verify.mjs LAPSE_K_PER_M, ecmwf010.mjs); it fails when the departure exceeds
                      threshold x max(sd of the buddies, min_std). min_std and threshold are estimated from data (params file). Flagged
                      values leave the buddy sets and the check repeats (num_iterations, as titanlib). Where fewer than num_min buddies
                      exist: the background check (Båserud et al. 2020 section 2; WMO-No. 1269) against the forecast for the hour - the
                      departure from the forecast minus the zone's median departure that hour, in units of the zone's robust spread of
                      departures that hour (MAD x 1.4826, floored at min_std); with neither: 'spatial-unchecked' (passes, counted).
   A sensor that is off but steady (siting, a warm roof) is not dropped by hand: the buddy check fails most of its values, and the
   diagnostic agent reports "values failing X % of hours" with a site-check suggestion. An owner may still mark a station variable
   (data/obs-qc-marks.json, empty by default: { "marks": [ { "pid", "var", "why", "from", "to" } ] }); a mark fails that variable's values
   in its time window as test 'owner-mark' and nothing else.

   v91.17.283.16 · PER-NETWORK SETTINGS (owner decision 24 Oct 2026 22:07 PKT: "the partner EWS network (high-altitude stations,
   Datascape / AEGIS) has correct data and needs no correction"). data/obs-qc-params.json "networks" names each network by the station
   records' net field or pid prefix (no station names in code) and switches checks off for it:
     spatial: false     no buddy check of its values (they still serve as buddies of other stations' values unless reference is false)
     background: false  no background (forecast departure) check of its values
     climate: false     no climatological-range check (its residual form is a departure from the served forecast)
     copy: false        no copy check (two stations with one record: a fault of one-feed-two-keys networks)
     adjust: false      its values are never adjusted or bias-corrected (no correction step reads it from here; recorded for every reader)
   What stays for every network: the gross range (with the datalogger missing-value codes, gross.sentinels: test 'sentinel'), the
   internal consistency, and the station's own series (stuck / flat, spike). */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screenSeries } from './stuckscreen.mjs';

export const VARS = ['T', 'Td', 'RH', 'P', 'W', 'G', 'S', 'PR'];
const fin = (x) => x != null && Number.isFinite(x);
const r2 = (x) => Math.round(x * 100) / 100;
const median = (a) => { if (!a.length) return null; const q = a.slice().sort((x, y) => x - y); const m = q.length >> 1; return q.length % 2 ? q[m] : (q[m - 1] + q[m]) / 2; };
export const km = (a, b, c, d) => { const p = Math.PI / 180; const x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2; return 12742 * Math.asin(Math.sqrt(Math.min(1, x))); };
/* Magnus over water (Alduchov and Eskridge 1996: a = 17.625, b = 243.04 C) */
export const dewFrom = (T, RH) => (fin(T) && fin(RH) && RH > 0 && RH <= 100) ? (() => { const g = Math.log(RH / 100) + 17.625 * T / (243.04 + T); return 243.04 * g / (17.625 - g); })() : null;

/* ---------------------------------------------------------------------------------------------------------------------------- */
/* parameters: data/obs-qc-params.json (every number with its source); marks: data/obs-qc-marks.json (owner, optional) */
const OWN_DATA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
import { machRainHolds } from './rainholds.mjs';   /* v283.31 · 9.5 */
export function loadParams(dataDir) {
  /* a data folder without the parameters (a test's temporary folder) reads this build's own */
  const pf = existsSync(join(dataDir, 'obs-qc-params.json')) ? join(dataDir, 'obs-qc-params.json') : join(OWN_DATA, 'obs-qc-params.json');
  const P = JSON.parse(readFileSync(pf, 'utf8'));
  try { const rf = existsSync(join(dataDir, 'fleet-range-screen.json')) ? join(dataDir, 'fleet-range-screen.json') : join(OWN_DATA, 'fleet-range-screen.json'); const R = JSON.parse(readFileSync(rf, 'utf8')); P.climate = { residual: R.residual || null, byMonth: (R.absolute && R.absolute.byMonth) || null, source: 'data/fleet-range-screen.json ' + (R.version || '') }; } catch (_) { P.climate = null; }
  let M = []; try { if (existsSync(join(dataDir, 'obs-qc-marks.json'))) M = (JSON.parse(readFileSync(join(dataDir, 'obs-qc-marks.json'), 'utf8')).marks || []); } catch (_) { M = []; }
  P.marks = M.filter((m) => m && m.pid && m.var && m.why).map((m) => ({ pid: String(m.pid), v: m.var, why: m.why, from: m.from ? Date.parse(m.from) : -Infinity, to: m.to ? Date.parse(m.to) : Infinity }));
  /* v91.17.283.31 · owner 9.5 · the MACH rain-channel holds (data/mach-rain-holds.json) are marks on the rain variables only */
  try { const RH = machRainHolds(dataDir); for (const [k, why] of RH.held) for (const v of RH.vars) P.marks.push({ pid: 'mach:' + k, v, why: 'rain channel held: ' + why, from: -Infinity, to: Infinity, rainHold: true }); } catch (_) {}
  return P;
}
/* the parameters of this build's data folder (server/api/../../data), for callers without a data folder of their own (past30parse.mjs) */
let _P0 = null; export function defaultParams() { if (!_P0) _P0 = loadParams(OWN_DATA); return _P0; }
const fail = (r, v, test, size, extra) => { if (!r.f) r.f = {}; if (r.f[v]) return; r.f[v] = { test, size: fin(size) ? r2(size) : null, ...(extra || {}) }; };
const has = (r, v) => fin(r[v]) && !(r.f && r.f[v]);

/* v91.17.283.16 · the network settings of a station record ({ pid, net }): the first entry of P.networks whose match.net lists its net
   or whose match.prefix starts its pid; null = every check applies. allows(cfg, k): the check k applies (absent or not false). */
export function networkOf(P, s) {
  const N = (P && P.networks) || null; if (!N || !s) return null; const pid = String(s.pid || ''), net = s.net != null ? String(s.net) : null;
  for (const [name, c] of Object.entries(N)) { if (!c || typeof c !== 'object' || !c.match) continue;
    if ((net && (c.match.net || []).includes(net)) || (c.match.prefix || []).some((p) => pid.startsWith(p))) return { name, ...c }; }
  return null;
}
export const allows = (cfg, k) => !cfg || cfg[k] !== false;
/* a datalogger missing-value code (gross.sentinels.values), matched within tol or 1e-7 of its size (float32 storage of 2147483.647) */
function sentinelOf(x, S) { if (!S || !Array.isArray(S.values)) return null; for (const c of S.values) if (Math.abs(x - c) <= Math.max(S.tol || 0, 1e-7 * Math.abs(c))) return c; return null; }

/* 1 · gross range and climatological range of one reading (r: { ms, T, Td, RH, P, W, G, S, PR }; bg: forecast temperature at its hour) */
export function grossCheck(r, P, ctx = {}) {
  for (const v of VARS) { if (!fin(r[v]) || r.f && r.f[v]) continue; const sc = sentinelOf(r[v], P.gross.sentinels); if (sc != null) { fail(r, v, 'sentinel', null, { code: sc }); continue; }
    const g = P.gross[v]; if (!g) continue;
    if (r[v] < g.lo) fail(r, v, 'gross-range', r[v] - g.lo, { limit: [g.lo, g.hi] }); else if (r[v] > g.hi) fail(r, v, 'gross-range', r[v] - g.hi, { limit: [g.lo, g.hi] }); }
  const C = ctx.noClimate ? null : P.climate; if (C && has(r, 'T')) {
    if (fin(ctx.bgT) && C.residual) { const d = r.T - ctx.bgT; if (d < C.residual.min || d > C.residual.max) fail(r, 'T', 'climate-range', d, { limit: [C.residual.min, C.residual.max], against: 'served forecast at the hour' }); }
    else if (C.byMonth && fin(r.ms)) { const b = C.byMonth[String(new Date(r.ms + 5 * 3600e3).getUTCMonth() + 1)]; if (b && (r.T < b.lo || r.T > b.hi)) fail(r, 'T', 'climate-range', r.T < b.lo ? r.T - b.lo : r.T - b.hi, { limit: [b.lo, b.hi], against: 'national monthly envelope' }); }
  }
}

/* 3 · internal consistency of one reading. elevM: the station height (for the pressure fit). */
export function internalCheck(r, P, elevM = null) {
  const I = P.internal;
  if (has(r, 'RH') && (r.RH < 0 || r.RH > 100)) fail(r, 'RH', 'internal', r.RH < 0 ? r.RH : r.RH - 100, { rule: 'relative humidity within 0-100 %' });
  if (has(r, 'RH') && r.RH <= I.rh_min_credible_pct) fail(r, 'RH', 'internal', r.RH, { rule: 'relative humidity at or below ' + I.rh_min_credible_pct + ' % is a sensor floor, not air' });
  if (has(r, 'T') && has(r, 'Td') && r.Td > r.T + I.td_above_t_tol_c) { fail(r, 'Td', 'internal', r.Td - r.T, { rule: 'dew point <= temperature' }); if (has(r, 'RH')) fail(r, 'RH', 'internal', null, { rule: 'dew point <= temperature (humidity sensor pair)' }); }
  if (has(r, 'T') && has(r, 'RH') && has(r, 'Td')) { const dm = dewFrom(r.T, r.RH); if (dm != null && Math.abs(dm - r.Td) > I.td_rh_agree_c) { fail(r, 'Td', 'internal', r.Td - dm, { rule: 'reported dew point against the one implied by T and RH' }); fail(r, 'RH', 'internal', null, { rule: 'reported dew point against the one implied by T and RH' }); } }
  if (has(r, 'T') && (has(r, 'RH') || has(r, 'Td'))) { const td = has(r, 'Td') ? r.Td : dewFrom(r.T, r.RH);
    if (td != null && td > I.td_max_observed_c) { fail(r, 'RH', 'internal', td - I.td_max_observed_c, { rule: 'implied dew point above the highest observed in Pakistan' }); fail(r, 'Td', 'internal', td - I.td_max_observed_c, { rule: 'implied dew point above the highest observed in Pakistan' }); fail(r, 'T', 'internal', td - I.td_max_observed_c, { rule: 'implied dew point above the highest observed in Pakistan: the pair cannot say which sensor is wrong' }); } }
  if (has(r, 'T') && fin(r.Tmin) && r.T < r.Tmin - I.t_minmax_tol_c) fail(r, 'T', 'internal', r.T - r.Tmin, { rule: 'Tmin <= T' });
  if (has(r, 'T') && fin(r.Tmax) && r.T > r.Tmax + I.t_minmax_tol_c) fail(r, 'T', 'internal', r.T - r.Tmax, { rule: 'T <= Tmax' });
  if (has(r, 'W') && has(r, 'G') && r.G < r.W - I.gust_below_wind_tol_kmh) fail(r, 'G', 'internal', r.G - r.W, { rule: 'gust >= wind speed' });
  if (has(r, 'P') && fin(elevM)) { const stn = 1013.25 * Math.exp(-elevM / I.scale_height_m);
    if (Math.abs(r.P - stn) > I.pressure_fit_hpa && Math.abs(r.P - 1013.25) > I.pressure_fit_hpa) fail(r, 'P', 'internal', r.P - stn, { rule: 'pressure fits the station height (station or sea level)' }); }
}

/* 2 · the station's own series (rows in time order, one station). lat / lon for the outdoor-array rule. */
/* v91.17.283.49 (1.0.10, "station QC frozen check") · THE EVENING OF 2 NOV 2026, RE-MEASURED: after ~15:00 PKT the live poll's usable
   stations fell 60 -> 26 of 108 with "T:frozen" 5 -> 47 (Td:persistence 17 -> 27, P:persistence 38 constant), while LAMHA's sync of the
   same database took in 105-112 "new readings" every 10 min. Replayed through this module (scripts/tests28349qc/frozen113.test.mjs, the
   real fleet poll on the real rows) the counts are reproduced exactly, and the cause is the data, not this check:
     - runs are judged on distinct reading timestamps only: the poll keeps one row per reading time (fleet.mjs stuckLive), the database
       files carry none twice, and a reading re-polled five times gives the same verdicts as one poll (test 1);
     - the flagged feeds are the 'wu' scrape (46 of 47) repeating each station's last afternoon RECORD with a new timestamp every 10 min:
       0-1 % of its readings change 18:00-23:59 PKT; 43 of the 47 held one identical T / Td / RH / P record for 120-351 min at 18:37 PKT;
       the 34 with a live console (wu_api, ecowitt, qm) within 40 km read +2.1..+14.6 C (median +5.7) above it;
     - the limits are not too tight for a calm evening: re-measured on the MACH record 6 Oct - 2 Nov (24 clean wu_api / ecowitt stations,
       67,913 temperature runs, same method as stuckscreen.mjs FROZEN_MIN), the 99.9th percentile of genuine unchanged-temperature runs
       is 110 min (all hours) and 110 min (runs ending 15:00-05:59 PKT), 120 min on 6-16 Oct and on 20 Oct - 2 Nov: FROZEN_MIN 120 stays.
       Dew point 97-111 min and pressure 79-97 min against the limits in force 146 and 184 (persist.Td / persist.P): both lenient, kept.
     - P:persistence (38-40): 'wu' pressures not refreshed (unchanged while T / RH move: 99th percentile 851 min there, 30 min at the
       clean feeds) - correct to keep - plus, for a few polls, two qm consoles reporting on the 0.01 inHg grid (pressure value only).
   The numbers, windows and sources: data/obs-qc-params.json persist_evidence (scripts/tests28349qc/derive_persist_evidence.py).
   No rule changed in this set. */
/* the reporting resolution of a station's variable: 'fine' when at least FINE_SHARE of its values are not multiples of 0.5 (a 0.1-resolution
   sensor); whole- or half-unit reports (airport METAR, synoptic messages) repeat values and records by construction, so the persistence,
   replay and copy tests - which look for a sensor repeating itself - do not apply to them (Zahumensky 2004: the persistence test's minimum
   variability is set above the instrument resolution). The record screen (stuckscreen.mjs) is also calibrated on readings 5-10 min apart
   (its MAXGAP 90 min): a series whose median gap is longer than DENSE_MIN (3-hourly synoptic reports) is not put through it. */
export const FINE_SHARE = 0.2, DENSE_MIN = 30;
export function fineOf(rows, v) { let n = 0, f = 0; for (const r of rows) if (fin(r[v])) { n++; if (Math.abs(r[v] * 2 - Math.round(r[v] * 2)) > 1e-6) f++; } return n >= 10 ? f / n >= FINE_SHARE : true; }
function denseOf(rows) { const g = []; for (let i = 1; i < rows.length; i++) g.push((rows[i].ms - rows[i - 1].ms) / 6e4); return g.length < 5 || median(g) <= DENSE_MIN; }
export function seriesCheck(rows, P, pos = {}) {
  const fine = { T: pos.fineT === true || fineOf(rows, 'T'), Td: fineOf(rows, 'Td'), RH: fineOf(rows, 'RH'), P: fineOf(rows, 'P') }; pos.fine = fine;
  if (!fine.T || !denseOf(rows)) return seriesRest(rows, P, fine);
  const v = screenSeries(rows.map((r) => ({ ms: r.ms, T: has(r, 'T') ? r.T : null, Td: r.Td, RH: r.RH, P: r.P, S: r.S, W: r.W, G: r.G, lat: pos.lat, lon: pos.lon })));
  for (let i = 0; i < rows.length; i++) applySeriesVerdict(rows[i], v[i]);
  recordFrozen(rows, P.record_frozen);
  seriesRest(rows, P, fine);
}
/* v91.17.283.49 (1.0.10) · WHOLE RECORD FROZEN. The MACH database's 'wu' scrape stops updating at about 14:30 PKT and then repeats each
   station's last afternoon record (temperature, dew point, humidity AND pressure identical) with a new timestamp every 10 min (2 Nov 2026:
   0-1 % of its readings change 18-24 PKT; the repeated records read +2..+15 C above the live consoles nearby). The temperature-only frozen
   test (stuckscreen.mjs FROZEN_MIN 120 min) lets such a record pass for its first two hours. A genuine station almost never repeats its
   WHOLE record for long: the 99.9th percentile of whole-record identical runs at the clean MACH feeds (wu_api, ecowitt with passing
   humidity sensors; distinct timestamps; runs split at gaps over maxgap_min) is 33-50 min over 6 Oct - 2 Nov 2026, all hours and evening /
   night. The limit (Q.max_min) is the largest of those percentiles; its windows, run counts and sources are in data/obs-qc-params.json
   record_frozen (scripts/tests28349rec/derive_record_frozen.py). Applies only where the record is complete (all four of T, Td, RH, P
   reported: the population the percentile was measured on) and, as the record screen, only to fine-resolution, dense series (seriesCheck
   above: METAR / synoptic whole-degree reports and 3-hourly series are not put through it). A reading whose identical record has run longer
   than the limit fails all four values (test 'record-frozen'); the run's earlier readings stay (the first is the real, last reading). */
export function recordFrozen(rows, Q) {
  if (!Q || !fin(Q.max_min)) return;
  const V = Q.vars || ['T', 'Td', 'RH', 'P'], gap = fin(Q.maxgap_min) ? Q.maxgap_min : 90; let a = -1;
  const full = (r) => V.every((k) => fin(r[k])), same = (x, y) => V.every((k) => x[k] === y[k]);
  for (let i = 0; i < rows.length; i++) { const r = rows[i];
    if (!full(r) || !fin(r.ms)) { a = -1; continue; }
    if (a < 0 || !same(r, rows[a]) || !fin(rows[i - 1].ms) || (r.ms - rows[i - 1].ms) / 6e4 > gap || !full(rows[i - 1])) a = i;
    const run = (r.ms - rows[a].ms) / 6e4;
    if (run > Q.max_min) for (const k of V) fail(r, k, 'record-frozen', run, { limit: Q.max_min, unit: 'min' }); }
}
function seriesRest(rows, P, fine) {
  for (const k of ['Td', 'RH', 'P']) { const S = P.step[k], Q = P.persist[k]; if (!S && !Q) continue;
    const idx = []; for (let i = 0; i < rows.length; i++) if (has(rows[i], k)) idx.push(i);
    /* step: a spike - out by more than the limit and back within it at the next reading */
    if (S) for (let j = 1; j < idx.length; j++) { const a = rows[idx[j - 1]], b = rows[idx[j]], c = j + 1 < idx.length ? rows[idx[j + 1]] : null;
      const gab = (b.ms - a.ms) / 6e4; if (gab > S.maxgap_min) continue; const lab = S.k * Math.sqrt(Math.max(gab, 1) / 60), d1 = b[k] - a[k];
      if (Math.abs(d1) <= lab) continue;
      if (c) { const gbc = (c.ms - b.ms) / 6e4; const lbc = S.k * Math.sqrt(Math.max(gbc, 1) / 60), d2 = c[k] - b[k]; if (gbc <= S.maxgap_min && Math.abs(d2) > lbc && Math.sign(d2) !== Math.sign(d1) && Math.abs(c[k] - a[k]) <= lab) fail(b, k, 'step', d1, { limit: r2(lab) }); }
      else if (S.live_single_sided) fail(b, k, 'step', d1, { limit: r2(lab), note: 'newest reading: no later reading to confirm it' }); }
    /* persistence: one value unchanged for longer than the limit */
    if (Q && fine[k] && !(k === 'RH' && !fine.T)) { let s = 0; for (let j = 1; j <= idx.length; j++) { const end = j === idx.length || rows[idx[j]][k] !== rows[idx[s]][k] || (rows[idx[j]].ms - rows[idx[j - 1]].ms) / 6e4 > Q.maxgap_min;
        if (!end) continue; const a = rows[idx[s]], b = rows[idx[j - 1]], run = (b.ms - a.ms) / 6e4;
        if (run > Q.max_min && !(k === 'RH' && a.RH >= Q.saturation_guard_pct)) for (let q = s; q < j; q++) fail(rows[idx[q]], k, 'persistence', run, { limit: Q.max_min, unit: 'min' });
        s = j; } }
  }
}

/* one verdict of the record screen (stuckscreen.mjs screenSeries) on the values it concerns: a replayed record repeats every sensor; a
   silent or shielded outdoor array says nothing about temperature, humidity, wind or sun; a jump or frozen value is the thermometer's */
export function applySeriesVerdict(r, x) {
  if (!x || x === 'ok') return;
  if (x === 'stuck-replay') { for (const k of ['T', 'Td', 'RH', 'P']) if (fin(r[k])) fail(r, k, 'stuck-replay', null); }
  else if (x === 'array-silent' || x === 'shielded-array') { for (const k of ['T', 'Td', 'RH', 'W', 'G', 'S']) if (fin(r[k])) fail(r, k, x, null); }
  else fail(r, 'T', x, null);
}
/* drop-in for the station-series screens of the copy path, the accuracy monitor and the past-30-days record: rows of many stations,
   keyOf(row), toObs(row) -> { ms, T, Td, RH, P, S, W, G }, posOf(key) -> { lat, lon }; returns Map(row -> the failed test) for the rows
   whose TEMPERATURE fails a check of this module (1 gross / climate, 2 series, 3 internal) and Map row -> all failures in .all */
export function seriesRows(rows, keyOf, toObs, posOf = null, P = defaultParams()) {
  const by = new Map(); for (const r of rows) { const k = keyOf(r); (by.get(k) || by.set(k, []).get(k)).push(r); }
  const bad = new Map(); bad.all = new Map();
  for (const [k, list] of by) { const o = list.map((r) => ({ src: r, q: { ...toObs(r) } })).sort((a, b) => a.q.ms - b.q.ms); const pos = (posOf && posOf(k)) || {};
    for (const x of o) { grossCheck(x.q, P, {}); internalCheck(x.q, P, pos.elev ?? pos.elevM ?? null); }
    seriesCheck(o.map((x) => x.q), P, { lat: pos.lat, lon: pos.lon });
    for (const x of o) { if (x.q.f) bad.all.set(x.src, x.q.f); if (x.q.f && x.q.f.T) bad.set(x.src, x.q.f.T.test); } }
  return bad;
}
/* one database reading without its series (the station-history readers): { tempC, rhPct, dewC, pressureHpa } with each failing value
   null, or null when the temperature fails */
export function readingQc(m, P = defaultParams()) {
  const r = { ms: null, T: m.temperatureC, Td: m.dewPointC, RH: m.humidityPct, P: m.pressureHpa }; grossCheck(r, P, {}); internalCheck(r, P, null);
  if (!passes(r, 'T')) return null; return { tempC: r.T, rhPct: passes(r, 'RH') ? r.RH : null, dewC: passes(r, 'Td') ? r.Td : null, pressureHpa: passes(r, 'P') ? r.P : null };
}
/* the owner's marks (data/obs-qc-marks.json): a marked variable fails in its window, nothing else */
export function markCheck(pid, r, P) { for (const m of P.marks || []) if (m.pid === pid && fin(r[m.v]) && r.ms >= m.from && r.ms <= m.to) fail(r, m.v, 'owner-mark', null, { why: m.why }); }

/* copy: two stations carrying the identical record at one time are one sensor; the member the registry names as carrying another
   station's device (copyOf: pid -> pid) loses its values, else the freshest reading keeps them (prefer(a, b) -> the one to keep), else
   every member fails (order is not evidence). Signature: temperature to 0.1 and at least two of humidity, dew point, pressure. */
export function copyCheck(items, copyOf = new Map(), prefer = null, P = null) {
  const sig = new Map();
  for (const it of items) { const r = it.r; if (P && !allows(networkOf(P, it), 'copy')) continue; if (!has(r, 'T') || it.fineT === false) continue; const n = ['RH', 'Td', 'P'].filter((k) => fin(r[k])).length; if (n < 2) continue;
    const g = [r.T.toFixed(1), fin(r.RH) ? Math.round(r.RH) : '-', fin(r.Td) ? r.Td.toFixed(1) : '-', fin(r.P) ? r.P.toFixed(1) : '-'].join('|');
    (sig.get(g) || sig.set(g, []).get(g)).push(it); }
  for (const g of sig.values()) { if (g.length < 2) continue; const ids = new Set(g.map((x) => x.pid));
    let keep = g.filter((x) => !(copyOf.has(x.pid) && ids.has(copyOf.get(x.pid))));
    if (keep.length > 1 && prefer) { const k = keep.reduce((a, b) => prefer(a, b) === b ? b : a); keep = keep.filter((x) => prefer(x, k) === x || x === k).length === 1 ? [k] : keep; }
    for (const x of g) { if (keep.length === 1 && keep[0] === x) continue; const of = keep.length === 1 ? keep[0].pid : 'unresolved group';
      for (const k of ['T', 'Td', 'RH', 'P']) if (fin(x.r[k])) fail(x.r, k, 'copy', null, { of }); } }
}

/* 4 · the buddy check over one cross-section (one hour) of one variable.
   items: [{ pid, lat, lon, elev, zone, r, bg }] (r.f marks values already failed); v: the variable. Sets r.f[v] for failures and
   returns { checked, background, unchecked } counts. */
export function spatialCheck(items, v, P) {
  const B = P.buddy[v] || null, G = P.background[v] || null; if (!B && !G) return { checked: 0, background: 0, unchecked: 0 };
  /* v91.17.283.16 · per network: judged by the buddy check (spatial), by the background check (background), a reference for others (reference) */
  const live = items.filter((it) => has(it.r, v) && fin(it.lat) && fin(it.lon)).map((it) => { const c = networkOf(P, it);
    return { it, r: it.r, lat: it.lat, lon: it.lon, elev: it.elev, zone: it.zone, bg: bgOf(it, v), jb: allows(c, 'spatial'), jg: allows(c, 'background'), ref: allows(c, 'reference') }; })
    .filter((x) => x.ref || x.jb || x.jg);
  if (!B) return backgroundOnly(live, v, G, P);
  const grad = B.elev_gradient_per_m || 0;
  const pick = (M, k, z) => (M[k + '_by_zone'] && fin(M[k + '_by_zone'][z])) ? M[k + '_by_zone'][z] : M[k];
  /* residual mode (TITAN with a background, Baserud et al. 2020): where the value and its buddies have the forecast for the hour at their
     own heights, the buddy check runs on value - forecast, which carries terrain and height, so buddies may lie further and differ more
     in height (resid.radius_km, resid.max_elev_diff_m); otherwise on the value moved to the target height with elev_gradient (raw mode) */
  const R = B.resid || null; const mode = new Map(), nb = new Map();
  /* a grid of cells at least as wide as the larger radius (1 degree of longitude is >= 85 km below 40 N): neighbours are looked for in
     the 3 x 3 cells around a value only (the national training table holds ~400 stations an hour over two years) */
  const cell = Math.max(B.radius_km, (R && R.radius_km) || 0) / 85; const G0 = new Map(); const ck = (a, b) => a + '|' + b;
  for (const it of live) { const a = Math.floor(it.lat / cell), b = Math.floor(it.lon / cell); (G0.get(ck(a, b)) || G0.set(ck(a, b), []).get(ck(a, b))).push(it); }
  const around = (it) => { const a = Math.floor(it.lat / cell), b = Math.floor(it.lon / cell), o = []; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const c = G0.get(ck(a + i, b + j)); if (c) o.push(...c); } return o; };
  for (const it of live) { const res = !!(R && fin(it.bg));
    const near = around(it).filter((o) => o !== it && o.ref && o.zone === it.zone && km(it.lat, it.lon, o.lat, o.lon) <= (res ? R.radius_km ?? B.radius_km : B.radius_km) && (!res || fin(o.bg))
      && (!fin(it.elev) || !fin(o.elev) || Math.abs(it.elev - o.elev) <= (res ? R.max_elev_diff_m : B.max_elev_diff_m)));
    mode.set(it, res ? R : B); nb.set(it, near); }
  const val = (it, o, M) => M === R ? o.r[v] - o.bg : o.r[v] + (fin(it.elev) && fin(o.elev) ? grad * (it.elev - o.elev) : 0);
  const flagged = new Set(); let checked = 0, background = 0, unchecked = 0, exempt = 0; const done = new Set();
  for (let iter = 0; iter < B.num_iterations; iter++) { const now = [];
    for (const it of live) { if (flagged.has(it) || !it.jb) continue; const M = mode.get(it);
      const bud = nb.get(it).filter((o) => !flagged.has(o)); if (bud.length < B.num_min) continue;
      const adj = bud.map((o) => val(it, o, M)); const x = M === R ? it.r[v] - it.bg : it.r[v];
      const m = adj.reduce((a, y) => a + y, 0) / adj.length; const sd = Math.sqrt(adj.reduce((a, y) => a + (y - m) ** 2, 0) / Math.max(1, adj.length - 1));
      const s = Math.max(sd, pick(M, 'min_std', it.zone)), z = (x - m) / s; if (iter === 0) { checked++; done.add(it); }
      if (Math.abs(z) > pick(M, 'threshold', it.zone)) now.push([it, z, x - m, bud.length, M === R ? 'residual from the forecast' : 'value at the target height']); }
    for (const [it, z, d, n, how] of now) { flagged.add(it); fail(it.r, v, 'buddy', z, { departure: r2(d), buddies: n, on: how, unitSize: 'local sd' }); }
    if (!now.length) break; }
  /* background check where the buddies are too few */
  if (G) { const byZ = new Map(); for (const it of live) { if (flagged.has(it) || !fin(it.bg) || !it.ref) continue; (byZ.get(it.zone) || byZ.set(it.zone, []).get(it.zone)).push(it.r[v] - it.bg); }
    for (const it of live) { if (done.has(it) || flagged.has(it)) continue; if (!it.jg) { exempt++; continue; }
      const D = byZ.get(it.zone) || []; if (!fin(it.bg) || D.length < G.num_min) { unchecked++; continue; }
      const md = median(D), sp = Math.max(1.4826 * median(D.map((x) => Math.abs(x - md))), pick(G.min_std != null || G.min_std_by_zone ? G : B, 'min_std', it.zone)); const z = (it.r[v] - it.bg - md) / sp; background++;
      if (Math.abs(z) > pick(G, 'threshold', it.zone)) fail(it.r, v, 'background', z, { departure: r2(it.r[v] - it.bg - md), zoneStations: D.length, unitSize: 'zone spread of departures from the forecast' }); } }
  else for (const it of live) { if (done.has(it) || flagged.has(it)) continue; if (!it.jg && !it.jb) exempt++; else unchecked++; }
  return { checked, background, unchecked, exempt };
}
/* the forecast for the hour of one item and variable: it.bg is the temperature, or an object { T, RH, W, ... } */
export const bgOf = (it, v) => { const b = it.bg; if (b != null && typeof b === 'object') return fin(b[v]) ? b[v] : null; return v === 'T' && fin(b) ? b : null; };
/* variables with a background check and no buddy check (wind: too local for a buddy check, Zahumensky 2004 leaves wind to the
   time checks; its departure from the forecast is still judged against the zone's departures that hour) */
function backgroundOnly(live, v, G, P) {
  const pick = (M, k, z) => (M[k + '_by_zone'] && fin(M[k + '_by_zone'][z])) ? M[k + '_by_zone'][z] : M[k];
  const byZ = new Map(); for (const it of live) if (fin(it.bg) && it.ref !== false) (byZ.get(it.zone) || byZ.set(it.zone, []).get(it.zone)).push(it.r[v] - it.bg);
  let background = 0, unchecked = 0, exempt = 0;
  for (const it of live) { if (it.jg === false) { exempt++; continue; } const D = byZ.get(it.zone) || []; if (!fin(it.bg) || D.length < G.num_min) { unchecked++; continue; }
    const md = median(D), sp = Math.max(1.4826 * median(D.map((x) => Math.abs(x - md))), pick(G, 'min_std', it.zone)); const z = (it.r[v] - it.bg - md) / sp; background++;
    if (Math.abs(z) > pick(G, 'threshold', it.zone)) fail(it.r, v, 'background', z, { departure: r2(it.r[v] - it.bg - md), zoneStations: D.length, unitSize: 'zone spread of departures from the forecast' }); }
  return { checked: 0, background, unchecked, exempt };
}

/* ---------------------------------------------------------------------------------------------------------------------------- */
/* BATCH: stations [{ pid, lat, lon, elev, zone }], rowsByPid Map pid -> readings [{ ms, T, Td, RH, P, W, G, S, PR, Tmin, Tmax }] (any
   cadence). opts: { nearestMin (the hourly pick: the reading nearest the top of the hour, default P.hourly.nearest_min), bgAt(pid, hourMs)
   -> forecast temperature (optional), copyOf Map, from, to (ms; hours outside are not picked), spatial / climate (false: skip the
   buddy / background and the climatological range checks - the diagnostic agent's view of a station's own offset) }.
   Every reading gets r.f (failures) from checks 1-3; the hourly picks get the copy and spatial checks; returns
   { hourly: Map pid -> Map hourMs -> reading, counts }. Readings are changed in place (r.f added), values are never altered. */
export function qcBatch(stations, rowsByPid, P, opts = {}) {
  const nearest = opts.nearestMin ?? P.hourly.nearest_min; const pos = new Map(stations.map((s) => [s.pid, s]));
  const hourly = new Map(); const counts = { values: {}, failed: {}, tests: {}, spatial: { checked: 0, background: 0, unchecked: 0, exempt: 0 }, networks: {} };
  const byHour = new Map();
  for (const [pid, rows] of rowsByPid) { const s = pos.get(pid); if (!s) continue; rows.sort((a, b) => a.ms - b.ms); const nc = networkOf(P, s);
    const noClimate = opts.climate === false || !allows(nc, 'climate');
    for (const r of rows) { markCheck(pid, r, P); grossCheck(r, P, { bgT: opts.bgAt && !noClimate ? bgOf({ bg: opts.bgAt(pid, Math.round(r.ms / 3600e3) * 3600e3) }, 'T') : null, noClimate }); internalCheck(r, P, s.elev); }
    seriesCheck(rows, P, s);
    const H = new Map(); for (const r of rows) { const h = Math.round(r.ms / 3600e3) * 3600e3; if (Math.abs(r.ms - h) > nearest * 6e4) continue; if (fin(opts.from) && h < opts.from) continue; if (fin(opts.to) && h >= opts.to) continue;
      const c = H.get(h); const ok = (x) => fin(x.T) && !(x.f && x.f.T);   /* the nearest reading whose temperature is present and passes; else the nearest (v91.17.283.16: a reading without temperature - a removed code - no longer wins) */
      if (!c || (ok(r) && !ok(c)) || (ok(r) === ok(c) && Math.abs(r.ms - h) < Math.abs(c.ms - h))) H.set(h, r); }
    hourly.set(pid, H); const fineT = !s.fine || s.fine.T !== false;
    for (const [h, r] of H) (byHour.get(h) || byHour.set(h, []).get(h)).push({ pid, net: s.net ?? null, lat: s.lat, lon: s.lon, elev: s.elev, zone: s.zone || null, r, bg: null, h, fineT }); }
  for (const [h, items] of byHour) {
    copyCheck(items, opts.copyOf || new Map(), (a, b) => (a.r.ms >= b.r.ms ? a : b), P);
    if (opts.spatial === false) continue;   /* the diagnostic agent's view: a steady offset is what it measures, so the checks against the neighbours and the forecast are left to it */
    if (opts.bgAt) for (const it of items) { const b = opts.bgAt(it.pid, h); it.bg = (b != null && (typeof b === 'object' || fin(b))) ? b : null; }
    for (const v of new Set([...Object.keys(P.buddy), ...Object.keys(P.background)])) { const c = spatialCheck(items, v, P); if (v === 'T') { counts.spatial.checked += c.checked; counts.spatial.background += c.background; counts.spatial.unchecked += c.unchecked; counts.spatial.exempt += c.exempt || 0; } } }
  for (const [pid, H] of hourly) { const nc = networkOf(P, pos.get(pid)); const N = nc ? (counts.networks[nc.name] || (counts.networks[nc.name] = { values: {}, failed: {}, tests: {} })) : null;
    for (const r of H.values()) for (const v of VARS) { if (!fin(r[v])) continue; counts.values[v] = (counts.values[v] || 0) + 1; if (N) N.values[v] = (N.values[v] || 0) + 1;
      if (r.f && r.f[v]) { counts.failed[v] = (counts.failed[v] || 0) + 1; const t = v + ':' + r.f[v].test; counts.tests[t] = (counts.tests[t] || 0) + 1; if (N) { N.failed[v] = (N.failed[v] || 0) + 1; N.tests[t] = (N.tests[t] || 0) + 1; } } } }
  return { hourly, counts };
}

/* CROSS-SECTION (the live poll): items [{ pid, lat, lon, elev, zone, r, bg }] whose r already went through checks 1-3 with its own recent
   series (the poll keeps the series in stuckscreen state); runs the copy and spatial checks over the poll as one hour. */
export function qcCross(items, P, opts = {}) {
  copyCheck(items, opts.copyOf || new Map(), opts.prefer || ((a, b) => (a.r.ms >= b.r.ms ? a : b)), P);
  const out = {}; for (const v of new Set([...Object.keys(P.buddy), ...Object.keys(P.background)])) out[v] = spatialCheck(items, v, P); return out;
}
/* a value passes when it is present and carries no failure */
export const passes = (r, v) => !!r && fin(r[v]) && !(r.f && r.f[v]);
/* the per-station summary the diagnostic agent and the replay report: share of hourly values failing, per variable and test */
export function stationShares(hourly) {
  const out = {}; for (const [pid, H] of hourly) { const o = {}; for (const r of H.values()) for (const v of VARS) { if (!fin(r[v])) continue; const x = o[v] || (o[v] = { n: 0, fail: 0, tests: {} }); x.n++;
      if (r.f && r.f[v]) { x.fail++; x.tests[r.f[v].test] = (x.tests[r.f[v].test] || 0) + 1; } }
    out[pid] = o; } return out;
}

/* ---------------------------------------------------------------------------------------------------------------------------- */
/* COMMAND LINE (the retrain reader _admin/retrain/py/obsqc_truth.py calls this; one implementation for server, agents and training):
   node server/api/obsqc.mjs --data <nigraan-local/data> --stations <csv pid,lat,lon,elev,zone[,net]> --obs <csv pid,time_utc,T,Td,RH,P,W,G,S,PR[,bg]>
        --out <csv pid,time_utc,var,value,pass,test,size,time_obs>  [--nearest-min N]
   Readings are hourly or finer; bg (optional) is the forecast temperature at the hour. Exit 0 done, 2 bad input. */
const splitCsv = (l) => { if (l.indexOf('"') < 0) return l.split(','); const o = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const c = l[i];
  if (q) { if (c === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === ',') { o.push(cur); cur = ''; } else cur += c; } o.push(cur); return o; };
function csv(file) { const t = readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.length); const h = splitCsv(t.shift()).map((x) => x.trim());
  return t.map((l) => { const c = splitCsv(l); const o = {}; h.forEach((k, i) => { o[k] = c[i]; }); return o; }); }
const quote = (x) => (/[",]/.test(String(x)) ? '"' + String(x).replace(/"/g, '""') + '"' : x);
const numOr = (x) => (x == null || x === '' || x === 'nan' || x === 'NaN' ? null : (Number.isFinite(+x) ? +x : null));
export function runCli(argv) {
  const a = {}; for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  if (!a.data || !a.stations || !a.obs || !a.out) { process.stderr.write('usage: node obsqc.mjs --data <dir> --stations <csv> --obs <csv> --out <csv>\n'); return 2; }
  const P = loadParams(a.data);
  const stations = csv(a.stations).map((s) => ({ pid: s.pid, net: s.net || null, lat: numOr(s.lat), lon: numOr(s.lon), elev: numOr(s.elev), zone: s.zone || null }));
  const rows = new Map(), bg = new Map();
  for (const o of csv(a.obs)) { const ms = Date.parse(String(o.time_utc).replace(' ', 'T').replace(/(Z|[+-]\d\d:?\d\d)?$/, (m) => m || 'Z')); if (!Number.isFinite(ms)) continue;
    const r = { ms }; for (const v of [...VARS, 'Tmin', 'Tmax']) if (v in o) r[v] = numOr(o[v]);
    (rows.get(o.pid) || rows.set(o.pid, []).get(o.pid)).push(r); const b = numOr(o.bg); if (b != null) bg.set(o.pid + '|' + Math.round(ms / 3600e3) * 3600e3, b); }
  const res = qcBatch(stations, rows, P, { nearestMin: a['nearest-min'] != null ? +a['nearest-min'] : undefined, bgAt: bg.size ? (pid, h) => bg.get(pid + '|' + h) : null });
  /* time_obs (v91.17.283.16): the time of the reading picked for the hour (a reader joining its own per-reading flags, e.g. the curated EWS archive's qc) */
  const out = ['pid,time_utc,var,value,pass,test,size,time_obs'];
  for (const [pid, H] of res.hourly) for (const [h, r] of H) for (const v of VARS) { if (!fin(r[v])) continue; const f = r.f && r.f[v];
    out.push([quote(pid), new Date(h).toISOString().slice(0, 16) + 'Z', v, r[v], f ? 0 : 1, f ? f.test : '', f && fin(f.size) ? f.size : '', new Date(r.ms).toISOString().slice(0, 16) + 'Z'].join(',')); }
  writeFileSync(a.out, out.join('\n') + '\n'); process.stdout.write(JSON.stringify(res.counts) + '\n'); return 0;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = runCli(process.argv.slice(2));
