/* ══ sci43 · B1b · SATELLITE PAST-DAY RAIN (IMERG Late) IN THE TESTED MOUNTAIN TEHSILS — OFF BY DEFAULT ═══════════════════════
   What: the rain of each of the last 5 Pakistan days from NASA GPM IMERG V07 Late Run (half-hourly, 48 slots per day, all required),
   at the 0.1 deg cell of the tehsil's served point, in place of the provider's past-day MODEL rain (landslideodds RAIN5_BASIS) that the
   sponge / runoff layers read today.
   Evidence: RULES_B_EWSFULL.md addendum B1b (sha256 in _admin/science/ewsfull/rules), results/b1b_rain.json: 32 mountain gauges,
   2,208 gauge-days, Feb-Aug 2025 held out: MAE 1.25 mm/day against 2.46 for the day-ahead model (gain CI 0.89-1.54), wet-day Heidke
   0.39 against 0.27 (gain CI 0.05-0.18). Fact (not a gate) on Oct 2025-Sep 2026: MAE 0.89 against 2.69 for the shortest-lead model.
   Scope: ONLY the tehsils that contain a scored gauge (data/imerg-past-rain.json units); everywhere else nothing changes. Heavy rain
   (>= 10 mm) is not this module's business: IMERG caught fewer heavy gauge days than the model (POD 0.27 vs 0.32); no warning reads it.
   Latency: Late ~14 h, so it fills "yesterday", never "now".
   Switch: NIGRAAN_IMERG_PAST_RAIN=1 turns it on; unset / 0 = the 1.0.6 behaviour exactly (this function returns null).
   Data: data/imerg-past-rain.json (the scope: uid -> served point and its 0.1 deg IMERG cell; scripts/sci43/imerg_scope.py) and the
   existing daily IMERG job (imerg.mjs fetchPktDay), which now also sums that cell and writes it as `points` in data/imerg/pkt/DATE.json.
   No new fetch path and no new token handling.
   A day that is missing, incomplete (< 48 slots) or older than the file's own coverage returns null for the whole 5-day window, so the
   caller keeps the model rain: never a mix of satellite and model days. */
import { readFileSync, statSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const IMERG_RAIN5_BASIS = 'satellite rain of the last 5 days (NASA IMERG Late, tested against mountain gauges)';
const DAY = 864e5;
const cache = new Map();
function readJson(f) {
  try { const mt = statSync(f).mtimeMs; const c = cache.get(f); if (c && c.mt === mt) return c.v; const v = JSON.parse(readFileSync(f, 'utf8')); cache.set(f, { mt, v }); if (cache.size > 64) cache.delete(cache.keys().next().value); return v; }
  catch (_) { return null; }
}
export function imergOn(env = process.env) { return env.NIGRAAN_IMERG_PAST_RAIN === '1'; }
/* v91.17.283.45 (NIGRAAN 1.0.8): the switch has three states. '1' = served (needs the 30-day Late-run shadow first: NOT set by 1.0.8);
   unset / 'shadow' = SHADOW (the default of 1.0.8: imergShadow below logs the satellite and the served model 5-day rain side by side once a
   day; nothing served reads it); '0' = off (no shadow log either). */
export function imergMode(env = process.env) { const v = env.NIGRAAN_IMERG_PAST_RAIN; return v === '1' ? 'on' : v === '0' ? 'off' : 'shadow'; }
/* the 5 days before `date` (as landslideodds rain5Of), or null (switch off, tehsil out of scope, or any day missing) */
export function imergRain5(dataDir, uid, date, env = process.env) {
  if (!imergOn(env)) return null; return imergRain5Raw(dataDir, uid, date);
}
/* the same window whatever the switch: the shadow's reader (never called on a served path) */
export function imergRain5Raw(dataDir, uid, date) {
  if (!dataDir || !uid || !date) return null;
  const S = readJson(join(dataDir, 'imerg-past-rain.json')); if (!S || !S.units || !S.units[uid]) return null;
  let s = 0; const daily = [];
  for (let k = 5; k >= 1; k--) {
    const t = new Date(Date.parse(date + 'T00:00:00Z') - k * DAY).toISOString().slice(0, 10);
    const P = readJson(join(dataDir, 'imerg', 'pkt', t + '.json')); const x = P && P.points ? P.points[uid] : null;
    if (x == null || !Number.isFinite(x)) return null;
    s += x; daily.push({ date: t, mm: x });
  }
  return { mm: Math.round(s * 10) / 10, days: 5, daily, basis: IMERG_RAIN5_BASIS, source: 'imerg-late' };
}

/* ══ v91.17.283.45 (NIGRAAN 1.0.8) · THE 30-DAY SHADOW ON THE LATE RUN (required before the switch may be served: BUILD_NOTES_SCI43) ══════
   Once per Pakistan day (first call after the day's 5-day window is complete in data/imerg/pkt, retried on later calls until it is), for every
   tehsil of the scope: the IMERG Late 5-day rain at the served-point cell (the 5 daily values) and the served model 5-day rain of the same
   window (rain5Of: the function the sponge reads today), into data/archive/imergshadow/YYYY-MM-DD.json (permanent; never shipped). The gauge
   comparison is made from the archive's own gauge record against these files after 30 days. NEVER served: no level, alert, report or answer
   reads these files; the sponge keeps the model rain unless NIGRAAN_IMERG_PAST_RAIN=1. Off with NIGRAAN_IMERG_PAST_RAIN=0. */
const SH = { lastDate: null, done: new Set(), last: null };
export function imergShadow(dataDir, rain5Of, nowMs = Date.now(), env = process.env) {
  if (imergMode(env) !== 'shadow' || !dataDir) return null;
  const date = new Date(nowMs + 5 * 3600e3).toISOString().slice(0, 10);   /* the Pakistan day */
  const key = dataDir + '|' + date; if (SH.done.has(key)) return SH.last;
  const dir = join(dataDir, 'archive', 'imergshadow'), f = join(dir, date + '.json');
  if (existsSync(f)) { try { if (JSON.parse(readFileSync(f, 'utf8')).complete) { SH.done.add(key); return SH.last; } } catch (_) {} }
  const S = readJson(join(dataDir, 'imerg-past-rain.json')); if (!S || !S.units) return null;
  const units = {}; let complete = 0;
  for (const uid of Object.keys(S.units)) {
    const sat = imergRain5Raw(dataDir, uid, date); let mod = null; try { mod = rain5Of ? rain5Of(uid, date) : null; } catch (_) { mod = null; }
    units[uid] = { imergMm: sat ? sat.mm : null, imergDaily: sat ? sat.daily.map((d) => d.mm) : null, modelMm: mod && Number.isFinite(mod.mm) ? mod.mm : null,
      modelBasis: mod ? (mod.basis || null) : null, testedGauges: S.units[uid].testedGauges ?? null, cell: S.units[uid].cell || null };
    if (sat) complete++; }
  const all = complete === Object.keys(S.units).length;
  const rec = { date, window: '5 Pakistan days before ' + date, product: 'GPM IMERG Late Run V07 (data/imerg/pkt points)', shadow: true, served: false, complete: all,
    unitsWithSatellite: complete, units: Object.keys(units).length, at: new Date(nowMs).toISOString(), scope: S.version || null, values: units };
  try { mkdirSync(dir, { recursive: true }); const t = f + '.tmp'; writeFileSync(t, JSON.stringify(rec)); renameSync(t, f); } catch (_) { return null; }
  if (all) SH.done.add(key); SH.last = { date, complete: all, unitsWithSatellite: complete }; return SH.last;
}
export function imergShadowStatus(env = process.env) { return { mode: imergMode(env), last: SH.last, rule: 'SHADOW: satellite past-5-day rain logged daily beside the served model rain (data/archive/imergshadow); never served' }; }
