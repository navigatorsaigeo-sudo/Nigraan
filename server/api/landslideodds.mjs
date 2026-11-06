/* v91.17.112 · RAIN-TRIGGERED LANDSLIDE LIKELIHOOD AGAINST AN ORDINARY DAY ═══════════════════════════════════════════
   The question a landslide desk asks of the rain: how much more likely is a slide on this day than on an ordinary day
   here, at this time of year? The landslide catalogue is news-based and incomplete, so a probability of a slide per day
   is not identifiable from it; the ratio against an ordinary day is (case-control design).

   Model   data/landslide-odds-model.json, built by station-lake/scripts/landslide_prob.py:
           236 rain-triggered catalogue events 2007-2017 at 140 places, 171,947 ordinary days at the same places and season,
           daily reanalysis rain; logistic regression on log(1+mm) of
             P1     the larger of the day's and the next day's rain (the catalogue date is +-1 day)
             P3     3-day rain ending on the day
             P7     7-day rain ending on the day
             API15  antecedent rain index, sum over 60 days of rain(d-k) exp(-k/15)
           odds ratio = exp(coef . (x - x_ref(month))), x_ref = the national median ordinary day of the month.
   v283    the served model reads ONLY the features its file lists (model.features). The v283 model is the monotone refit (every
           coefficient >= 0, P7 dropped: audit A8, more week rain lowered the odds): features P1 and P3, "the day's and the 3-day
           rain" (WS5 B2 rule passed: LOYO AUC 0.766 vs 0.763, time split 0.776 vs 0.768, A8 share 0 %; INTEG_INPUTS/monotone_test.json).
           A day is assessed when the features the model reads are on record; the 7-day and 60-day sums are required only by a
           model that lists them.
   Test    leave-one-year-out, served form (v283 monotone model): AUC 0.766; predicted 2-5x -> observed 1.6x, 5-10x -> 2.7x,
           10-20x -> 6.3x, 20x+ -> 14.4x (validation block of the model file): each band above the last, below its predicted range.
   Served  only inside the landslide mask (data/hazard-applicability.json); the rain is the forecast model's daily total at
           the tehsil point, past 60 days plus the next 7, refreshed every 6 h, history kept in data/landslide-rain.json so
           a refresh asks only for the days it does not have.
   Limits  trained on reanalysis rain (about 25 km), served from the forecast model's rain: the rain basis differs, which the
           layer says. Where slides can happen at all is the susceptibility layer, not this. */
import { readFileSync, writeFileSync, existsSync, statSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { alignBatch } from './provider.mjs';

const DAY = 864e5;
const pkt = (ms) => new Date(ms + 5 * 3600e3).toISOString().slice(0, 10);

/* the features of day index i in a daily rain series (array of mm or null), exactly as the training script */
export function features(rain, i, need = null) {
  const v = (j) => (j >= 0 && j < rain.length && rain[j] != null && isFinite(rain[j])) ? Math.max(0, rain[j]) : null;
  const sum = (n) => { let s = 0, k = 0; for (let j = i - n + 1; j <= i; j++) { const x = v(j); if (x == null) return null; s += x; k++; } return k === n ? s : null; };
  const d0 = v(i); if (d0 == null) return null; const d1 = v(i + 1);
  const P1 = Math.max(d0, d1 == null ? 0 : d1), P3 = sum(3), P7 = sum(7);
  let api = 0, have = 0; for (let k = 0; k < 60 && i - k >= 0; k++) { const x = v(i - k); if (x == null) continue; api += x * Math.exp(-k / 15); have++; }
  /* v283 · INTEG: only the features the model reads are required (need = model.features; default: the full v162 set) */
  const out = { P1, P3, P7, API15: have >= 30 ? api : null, antecedentDays: have };
  for (const k of (need || ['P1', 'P3', 'P7', 'API15'])) if (out[k] == null) return null;   /* API15 under 30 of the 60 antecedent days would read low */
  return out;
}
/* why a day could not be assessed, in the words of the features the model reads */
export function featuresWhy(need) {
  const N = need || ['P1', 'P3', 'P7', 'API15'];
  if (N.includes('API15')) return 'fewer than 30 of the 60 antecedent rain days are on record yet';
  if (N.includes('P7')) return 'the rain of one of the 7 days ending on this day is not on record';
  if (N.includes('P3')) return 'the rain of this day or of one of the 2 days before it is not on record';
  return 'the rain of this day is not on record';
}
/* the inputs a row prints: only the features the model reads (a 7-day sum is not shown beside a model that does not use it) */
function inputsOf(M, f) {
  const N = M.features || [], o = {};
  if (N.includes('P3')) o.rain3Mm = Math.round(f.P3);
  if (N.includes('P7')) o.rain7Mm = Math.round(f.P7);
  if (N.includes('API15')) o.antecedentIndex = Math.round(f.API15);
  return o;
}
/* v91.17.283.13 · the calendar days a day's features read (P1: the day and the next; P3 / P7: the 3 / 7 days ending on it; API15: the
   60 days before it, observed by construction) */
export const FORECAST_DAYS = 7;   /* the forecast days each refresh asks for (forecast_days below) */
export function inputDates(ds, i, need) { const N = need || ['P1', 'P3', 'P7', 'API15']; const out = new Set([ds[i]]);
  if (N.includes('P1') && ds[i + 1]) out.add(ds[i + 1]); const back = N.includes('P7') ? 7 : N.includes('P3') ? 3 : 1;
  for (let j = Math.max(0, i - back + 1); j <= i; j++) out.add(ds[j]); return [...out].filter(Boolean).sort(); }
/* the observed rain of the 5 days before a date (NRCS antecedent moisture condition), only when all 5 are observed */
/* v91.17.283.35 · audit B5 · the "observed" days are the provider's past-day MODEL rain (forecast endpoint past_days), not a gauge or
   satellite measurement: labelled "model rain of the last 5 days (not measured)"; the per-day values ride along (event-based runoff) */
export const RAIN5_BASIS = 'model rain of the last 5 days (not measured)';
export function rain5Of(h, date) { if (!h || !h.obs) return null; let s = 0; const daily = []; for (let k = 5; k >= 1; k--) { const t = new Date(Date.parse(date + 'T00:00:00Z') - k * DAY).toISOString().slice(0, 10); const x = h.obs[t]; if (x == null || !isFinite(x)) return null; s += x; daily.push({ date: t, mm: x }); }
  return { mm: Math.round(s * 10) / 10, days: 5, daily, basis: RAIN5_BASIS }; }
/* ══ v91.17.283.40 · launch item 6 (owner OK 31 Oct 2026) · THE HOURLY RAIN OF EVERY TEHSIL, FOR RUNOFF PER STORM ════════════════════
   The same refresh that holds the daily rain (one provider request per batch of 50 tehsils, every 6 h; never per client or section) now
   also asks for the provider's hourly liquid rain ("rain", the hourly counterpart of rain_sum). Held: the hours of COMPLETE past PKT days
   only (the same rule as the daily history: a day is held once it is over), for the last HOURLY_KEEP_DAYS days = the 5-day runoff window
   + the 5 days (120 h) before a storm that set its antecedent moisture (NEH-4) + 1 day so a refresh that comes late still has the window.
   A missing hour stays missing (null): it is never filled, and the runoff of that tehsil then says the hourly rain is incomplete. */
export const HOURLY_KEEP_DAYS = 5 + 5 + 1;
const HMS = 3600e3;
const hourMs = (t) => Date.parse(t + ':00+05:00');   /* provider local hour "YYYY-MM-DDTHH:00" (timezone Asia/Karachi) -> ms */
export function mergeHourly(h, time, vals, today, now = Date.now()) {
  if (!Array.isArray(time) || !Array.isArray(vals)) return h;
  const keep = Date.parse(pkt(now - HOURLY_KEEP_DAYS * DAY) + 'T00:00:00+05:00'), end = Date.parse(today + 'T00:00:00+05:00');
  const m = new Map(); const o = h && h.hr && Number.isFinite(h.hr.t0) && Array.isArray(h.hr.v) ? h.hr : null;
  if (o) o.v.forEach((x, k) => { if (x != null) m.set(o.t0 + k * HMS, x); });
  time.forEach((t, k) => { const ms = hourMs(t), x = vals[k]; if (!Number.isFinite(ms) || ms >= end || ms < keep) return; if (x == null || !Number.isFinite(+x)) return; m.set(ms, Math.round(+x * 100) / 100); });
  for (const ms of [...m.keys()]) if (ms < keep) m.delete(ms);
  if (!m.size) { h.hr = null; return h; }
  const t0 = Math.min(...m.keys()), t1 = Math.max(...m.keys()); const v = []; for (let t = t0; t <= t1; t += HMS) v.push(m.has(t) ? m.get(t) : null);
  h.hr = { t0, v, basis: 'provider hourly liquid rain (model, not measured), complete past PKT days' }; return h;
}
export function hourlyOf(h) { const r = h && h.hr; if (!r || !Array.isArray(r.v)) return null; const out = [];
  r.v.forEach((x, k) => { if (x != null) out.push({ t: r.t0 + k * HMS, mm: x }); }); return out; }   /* missing hours are absent, not 0 */
export function oddsRatio(M, f, month) {
  const ref = (M.referenceByMonth && M.referenceByMonth[String(month)]) || M.reference;
  let s = 0; M.features.forEach((k, j) => { s += M.coef[j] * (Math.log1p(f[k]) - Math.log1p(ref[k])); });
  return Math.exp(s);
}

/* ══ v91.17.283.8 · science audit · THE NUMBER A CLIENT READS IS THE OBSERVED RATIO OF THE MODEL'S CLASS ═════════════════════════════
   The model ranks days well (AUC 0.766) but its ratio overstates the observed one (a day it puts at 5-10x happened 2.7x as often as an
   ordinary day in the held-out test). A client therefore reads the OBSERVED ratio of the class the model's ratio falls in, from the
   validation of the model file (validation.served.calibration: band, observedVsOrdinaryDay), never the model's own multiplier. The model
   ratio stays the ranking score the level is placed on (unchanged) and is kept for the operator. */
export function ratioBands(M) { const C = M && M.validation && M.validation.served && Array.isArray(M.validation.served.calibration) ? M.validation.served.calibration : [];
  return C.map((c) => { const t = String(c.band || ''); let lo = null, hi = null, m;
    if ((m = /^<\s*([\d.]+)$/.exec(t))) { lo = 0; hi = +m[1]; } else if ((m = /^>=\s*([\d.]+)$/.exec(t))) { lo = +m[1]; hi = null; } else if ((m = /^([\d.]+)\s*-\s*([\d.]+)$/.exec(t))) { lo = +m[1]; hi = +m[2]; }
    return lo == null || !Number.isFinite(+c.observedVsOrdinaryDay) ? null : { band: t, lo, hi, observed: Math.round(+c.observedVsOrdinaryDay * 10 + 1e-9) / 10, events: c.events ?? null }; }).filter(Boolean); }   /* one decimal, half up (14.35 -> 14.4) */
/* v283.36 · C-now test 2a · the odds band edges 2 / 5 / 10 PASSED their held-out test (2015-17, calibration slope 0.91, CI contains 1);
   10-20 and >= 20 had too few test events: ONE top band "10x or more" (no figure). The model file's observedVsOrdinaryDay is measured
   against the AVERAGE day (the all-days base rate), not the ordinary day: said so (OBSERVED_BASIS). */
export const TOP_BAND_MIN = 10;
export const OBSERVED_BASIS = 'observed in the held-out test, against the average day (the all-days base rate)';
export const CNOW_2A = 'held-out test 2015-17 (100 events): AUC 0.735; calibration slope 0.91 (95 % CI 0.67-1.15); edges 2 / 5 / 10 pass; 10-20 and >= 20 merged (under 10 test events each)';
export function observedOf(M, ratio) { if (ratio == null || !Number.isFinite(+ratio)) return null;
  if (+ratio >= TOP_BAND_MIN) return { observedRatio: null, modelBand: '>=' + TOP_BAND_MIN, observedText: '10 times or more (too few test events to give a figure)', observedBasis: OBSERVED_BASIS };
  const B = ratioBands(M);
  const b = B.find((x) => +ratio >= x.lo && (x.hi == null || +ratio < x.hi)); return b ? { observedRatio: b.observed, modelBand: b.band, observedBasis: OBSERVED_BASIS } : null; }

/* ══ v283 WS5 · ONE RAIN BASIS FOR TRAINING AND SERVING (switched off until fitted) ═════════════════════════════════════════════════
   The odds model was trained on archive rain (UTC days, catalogue point) and is served past rain from the forecast endpoint (tehsil
   point and height, PKT days): at 4 tehsils in Aug-Oct 2026 the archive totals were 2-5x the served ones (WS5 EVIDENCE.md). When
   data/landslide-basis-map.json exists AND its held-out test passed (served: true), each served feature (P1, P3, P7) is quantile-mapped
   onto the training basis before the odds model (scripts/gen/ws5/landslide_basis_fit.py; per tehsil, or its rain-climate group).
   Without that file, or with served:false, or NIGRAAN_LANDSLIDE_BASIS=0, the features are used as before. Pure: mapFeatures(map, uid, f). */
function qmap(K, x) {
  if (!K || x == null || !isFinite(x)) return x;
  const P = K.p, qs = K.served, qt = K.train, ip = (v, X, Y) => { if (v <= X[0]) return Y[0]; if (v >= X[X.length - 1]) return Y[Y.length - 1];
    let k = 1; while (X[k] < v) k++; const w = (v - X[k - 1]) / ((X[k] - X[k - 1]) || 1); return Y[k - 1] + w * (Y[k] - Y[k - 1]); };
  if (x <= 0.05) return ip(K.dryShare / 2, P, qt);
  let i0 = 0; while (i0 < P.length && P[i0] < K.dryShare) i0++;
  const xs = [], ys = []; for (let i = i0; i < qs.length; i++) { if (xs.length && qs[i] <= xs[xs.length - 1]) continue; xs.push(qs[i]); ys.push(qt[i]); }
  if (!xs.length) return x; const top = xs[xs.length - 1], r = top > 0 ? ys[ys.length - 1] / top : 1;
  return (x > top || xs.length < 2) ? x * r : ip(x, xs, ys);
}
export function mapFeatures(BM, uid, f) {
  if (!BM || BM.served !== true || !f || !BM.units || !BM.units[uid]) return f;
  const u = BM.units[uid]; const K = u.basis && u.basis.startsWith('group:') ? (BM.groups || {})[u.basis.slice(6)] : u; if (!K) return f;
  const out = { ...f, basisMapped: true }; for (const k of ['P1', 'P3', 'P7']) if (K[k] && f[k] != null) out[k] = Math.max(0, qmap(K[k], f[k]));
  return out;
}

export function createLandslideOdds(app, dataDir) {
  const { provider, units } = app;
  const histFile = join(dataDir, 'landslide-rain.json');
  const keyOf = new Map(); for (const u of (units && units.tehsil) || []) keyOf.set(u.unitId, u.key);
  let MC = null, MMT = 0; const model = () => { try { const f = join(dataDir, 'landslide-odds-model.json'); if (!existsSync(f)) return null; const mt = statSync(f).mtimeMs; if (MC && mt === MMT) return MC; MC = JSON.parse(readFileSync(f, 'utf8')); MMT = mt; return MC; } catch (_) { return MC; } };
  let BMc = null, BMt = 0; const basisMap = () => { if (process.env.NIGRAAN_LANDSLIDE_BASIS === '0') return null; try { const f = join(dataDir, 'landslide-basis-map.json'); if (!existsSync(f)) return null; const mt = statSync(f).mtimeMs; if (BMc && mt === BMt) return BMc; BMc = JSON.parse(readFileSync(f, 'utf8')); BMt = mt; return BMc; } catch (_) { return null; } };
  let SC = null; const scale = () => { try { SC = JSON.parse(readFileSync(join(dataDir, 'map-layer-scales.json'), 'utf8')).layers.landslide_odds || null; } catch (_) {} return SC; };
  let H = null; try { if (existsSync(histFile)) H = JSON.parse(readFileSync(histFile, 'utf8')); } catch (_) { H = null; }
  if (!H || !H.units) H = { at: null, units: {} };
  let running = false, lastErr = null, cache = null, lastRetry = 0;
  const hourlyOn = process.env.NIGRAAN_RAIN_HOURLY !== '0';   /* v283.40 item 6: hourly rain in the same refresh (env 0 = off, the per-day runoff of v283.35) */
  const ageH = () => H.at ? (Date.now() - Date.parse(H.at)) / 3600e3 : Infinity;
  function inMask() {
    let A = null; try { A = JSON.parse(readFileSync(join(dataDir, 'hazard-applicability.json'), 'utf8')); } catch (_) {}
    const out = new Set(Object.keys(((A && A.layers && A.layers.landslide) || {}).units || {}));
    return units.tehsil.filter(u => !u.disputed && u.lat != null && u.lon != null && !out.has(u.unitId));
  }
  /* v91.17.283.31 · item 1.1 · ONE SHARED RAIN HISTORY. This collector is also the rain history of the runoff and retention layers
     (hazsci sponge: rain5), which cover all of Pakistan. Until v283.30 it fetched only the tehsils inside the LANDSLIDE applicability
     mask (328), so the same 248 tehsils were blank on the runoff maps. It now fetches every tehsil with a point; the landslide model's
     own output (national, unit, unitLayer, scenario) still keeps its mask. */
  function fetchUnits() { return units.tehsil.filter(u => !u.disputed && u.lat != null && u.lon != null); }
  let MASKC = null, MASKT = 0; function maskSet() { if (MASKC && Date.now() - MASKT < 600e3) return MASKC; MASKC = new Set(inMask().map((u) => u.unitId)); MASKT = Date.now(); return MASKC; }
  async function run(only = null) {
    if (running) return { started: false, why: 'already running' };
    if (!provider.configured()) return { started: false, why: 'no paid provider key' };
    if (!model()) return { started: false, why: 'data/landslide-odds-model.json not installed' };
    running = true; const t0 = Date.now(); let ok = 0, failed = 0;
    try {
      const today = pkt(Date.now()); const U = only ? fetchUnits().filter((u) => only.has(u.unitId)) : fetchUnits();
      if (H.basis !== 'rain_sum') { for (const k of Object.keys(H.units)) H.units[k].obs = {}; H.basis = 'rain_sum'; }   /* v91.17.157 · history held rain + snow: refetched as liquid rain */
      /* how many past days each unit lacks; units with the same need share a request */
      const need = new Map(); for (const u of U) { const h = H.units[u.unitId]; let past = 62;
        if (h && h.obs) { const ds = Object.keys(h.obs).sort(); const last = ds[ds.length - 1]; if (last) past = Math.min(62, Math.max(2, Math.round((Date.parse(today) - Date.parse(last)) / DAY) + 2)); }
        /* v283.40 item 6: the hourly rain needs its own past days (HOURLY_KEEP_DAYS when none is held yet) */
        if (hourlyOn) { const hl = h && h.hr && Array.isArray(h.hr.v) ? h.hr.t0 + (h.hr.v.length - 1) * HMS : null;
          const ph = hl == null ? HOURLY_KEEP_DAYS : Math.max(2, Math.round((Date.parse(today + 'T00:00:00+05:00') - hl) / DAY) + 2); past = Math.min(62, Math.max(past, Math.min(HOURLY_KEEP_DAYS, ph))); }
        if (!need.has(past)) need.set(past, []); need.get(past).push(u); }
      for (const [past, arr] of need) for (let i = 0; i < arr.length; i += 50) {
        const b = arr.slice(i, i + 50); let res;
        try { res = alignBatch(await provider.call('forecast', '/v1/forecast', { latitude: b.map(u => u.lat), longitude: b.map(u => u.lon), elevation: b.map(u => u.elevM ?? 'nan'),
          daily: 'rain_sum', past_days: past,   /* v91.17.157 · audit: liquid rain, not rain + snow water (a February snowstorm read ~9x); snow-triggered slides are outside the model */
 ...(hourlyOn ? { hourly: 'rain' } : {}), forecast_days: FORECAST_DAYS, timezone: 'Asia/Karachi' }), b); }
        catch (e) { failed += b.length; lastErr = e.message; continue; }
        b.forEach((u, j) => {
          const d = res[j] && res[j].daily; if (!d || !d.time) { failed++; return; }
          const h = H.units[u.unitId] || { obs: {} }; h.fc = {};
          d.time.forEach((t, k) => { const x = (d.rain_sum || [])[k]; if (x == null) return; if (t < today) h.obs[t] = Math.round(x * 10) / 10; else h.fc[t] = Math.round(x * 10) / 10; });
          const keep = pkt(Date.now() - 70 * DAY); for (const t of Object.keys(h.obs)) if (t < keep) delete h.obs[t];
          if (hourlyOn) { const hr = res[j].hourly; if (hr && hr.time) mergeHourly(h, hr.time, hr.rain, today); }   /* v283.40 item 6 */
          h.at = h.fcAt = new Date().toISOString(); H.units[u.unitId] = h; ok++;
        });
      }
      if (ok) { H.at = new Date().toISOString(); try { writeFileSync(histFile + '.tmp', JSON.stringify(H)); renameSync(histFile + '.tmp', histFile); } catch (_) {} lastErr = null; cache = null; }
      console.log(`  landslide  rain for ${ok} tehsils, ${failed} failed, ${Math.round((Date.now() - t0) / 1000)}s`);
      return { started: true, units: ok, failed };
    } finally { running = false; }
  }
  /* v91.17.283.13 · a tehsil whose own refresh failed is asked again at the next tick (every tehsil's age, not the newest one's) */
  function tick() { if (process.env.NIGRAAN_LANDSLIDE_ODDS === '0' || !provider.configured() || running) return;
    if (ageH() >= 6) { run().catch(e => { lastErr = e.message; }); return; }
    /* v91.17.283.47 · NIGRAAN 1.0.8 item 3 · ROOT CAUSE OF THE NIGHTLY RUN-OFF OUTAGE: the history holds a day only once the PKT day is over,
       and the refresh came every 6 h by age alone, so after PKT midnight the day just ended stayed un-held for up to 6 h; the runoff
       retention and rain run-off layers read the 5 complete days before today and were "input not current" in 575 of 576 tehsils for that
       time (live 2 Nov 00:40 PKT: last refresh 20:24 PKT 1 Nov, next due 02:24). The history is refreshed once at the PKT day turn
       (one batch refresh, the same calls as the 6-hourly one). NIGRAAN_RAIN_DAYTURN=0 = 1.0.7. */
    if (process.env.NIGRAAN_RAIN_DAYTURN !== '0' && H.at && pkt(Date.parse(H.at)) < pkt(Date.now())) { run().catch(e => { lastErr = e.message; }); return; }
    const old = new Set(fetchUnits().filter((u) => { const h = H.units[u.unitId]; return !h || !h.at || (Date.now() - Date.parse(h.at)) / 3600e3 >= 6; }).map((u) => u.unitId));
    if (old.size && Date.now() - lastRetry >= 3600e3) { lastRetry = Date.now(); run(old).catch(e => { lastErr = e.message; }); } }   /* at most once an hour */
  /* national(): per unit, per forecast day, the odds ratio and its inputs */
  function national() {
    const M = model(); if (!M) return { ready: false, why: 'data/landslide-odds-model.json not installed' };
    if (!H.at) return { ready: false, why: lastErr || 'the landslide rain job has not run (it needs the paid provider key)' };
    const hb = Math.floor(Date.now() / 3600e3);   /* v91.17.161 · the memo expires hourly, so the age check and the day list move even when refreshes fail */
    if (cache && cache.at === H.at && cache.mt === MMT && cache.hb === hb) return cache.v;
    const today = pkt(Date.now()); const days = []; for (let k = 0; k < 6; k++) days.push(pkt(Date.now() + k * DAY));
    const out = { ready: true, at: H.at, modelVersion: M.version, days, units: {}, observedBands: ratioBands(M).map((x) => ({ band: x.band, lo: x.lo, hi: x.hi, observed: x.observed })),
      reading: 'ratio: the model\u2019s ranking score (operator); observedRatio: how often slides happened on days in that class against an ordinary day, in the held-out test (the number to read)' };
    const MS = maskSet();
    for (const [uid, h] of Object.entries(H.units)) { if (!MS.has(uid)) continue;   /* v283.31 · 1.1 · the landslide output keeps its mask */
      const series = { ...h.obs, ...h.fc }; const have = Object.keys(series).sort(); if (!have.length) continue;
      /* v91.17.157 · audit: a calendar index, so a missing day is a gap (features() refuses a 3- or 7-day sum across it) and never
         makes "3 days" span 4-10 calendar days */
      const ds = []; for (let t = Date.parse(have[0] + 'T00:00:00Z'), e = Date.parse(have[have.length - 1] + 'T00:00:00Z'); t <= e; t += DAY) ds.push(new Date(t).toISOString().slice(0, 10));
      const rain = ds.map(t => series[t] == null ? null : series[t]); const rows = [];
      /* v91.17.283.13 · audit B9 · STALENESS PER INPUT, NOT ONE 30-HOUR RULE PER TEHSIL. A day's inputs are the rain values its features
         read (the day, the next day for P1, the days before it for the sums). An observed day never goes stale. A forecast value stays a
         forecast of its day for as long as that day lies inside the horizon the refresh asked for (FORECAST_DAYS from its issue day); past
         that it is withheld. Until v283.13 every day of a tehsil was withheld once its refresh was 30 h old, so one failed refresh job
         turned all 328 assessed tehsils to "not assessed" together; now a late refresh keeps serving the days its forecast still covers,
         each row with the age of its inputs (inputAgeH), and only the days beyond that horizon are withheld. */
      const fcAge = h.fcAt || h.at; const uAgeH = fcAge ? (Date.now() - Date.parse(fcAge)) / 3600e3 : Infinity; const issueDay = fcAge ? pkt(Date.parse(fcAge)) : null;
      let staleDays = 0;
      for (const d of days) { const i = ds.indexOf(d); if (i < 0) { rows.push({ date: d, why: 'no rain for this day in the last refresh' }); continue; }
        const reads = inputDates(ds, i, M.features); const fcRead = reads.filter((t) => h.obs[t] == null && h.fc && h.fc[t] != null);
        const beyond = fcRead.filter((t) => !issueDay || (Date.parse(t) - Date.parse(issueDay)) / DAY > FORECAST_DAYS - 1);
        if (beyond.length) { staleDays++; rows.push({ date: d, why: 'withheld: this day reads forecast rain for ' + beyond.join(', ') + ', beyond the ' + FORECAST_DAYS + '-day forecast of the last refresh (' + (isFinite(uAgeH) ? Math.round(uAgeH) + ' h ago' : 'never made') + ')', staleInput: true }); continue; }
        const f0 = features(rain, i, M.features); if (!f0) { rows.push({ date: d, why: featuresWhy(M.features) }); continue; }
        const f = mapFeatures(basisMap(), uid, f0);
        const or = oddsRatio(M, f, Number(d.slice(5, 7)));
        const ob = observedOf(M, Math.round(or * 10) / 10);
        rows.push({ date: d, ratio: Math.round(or * 10) / 10, ...(ob || {}), rainDayMm: Math.round(f.P1 * 10) / 10, ...inputsOf(M, f), forecastDay: d >= today, ...(fcRead.length ? { inputAgeH: Math.round(uAgeH * 10) / 10 } : {}) }); }
      out.units[uid] = { key: keyOf.get(uid) || null, at: h.at, ...(staleDays ? { staleDays } : {}), days: rows };   /* v91.17.153 · the page's unit key, so the map level can read it */
    }
    cache = { at: H.at, mt: MMT, hb, v: out }; return out;
  }
  function unit(uid) { const n = national(); if (!n.ready) return n; const u = n.units[uid]; return u ? { ready: true, modelVersion: n.modelVersion, unit: uid, ...u } : { ready: false, why: 'outside the landslide mask or not in the last refresh' }; }
  /* v91.17.245 · THE SCENARIO DAY ON THE SAME MODEL. The Scenario page's rain tests ("heavy rain day", "10-year wettest day") set a
     day of at least D mm; the landslide level is this calibrated likelihood, which reads the rain series held here, so the test never
     moved it (Islamabad 157 mm: landslide 23 -> 23). The same features are rebuilt with that day's rain raised to D (the sums the
     model reads follow) and the same coefficients give the ratio. Nothing is stored. */
  function scenario(key, date, mm) {
    const M = model(); if (!M) return { ready: false, why: 'data/landslide-odds-model.json not installed' };
    if (!H.at) return { ready: false, why: lastErr || 'the landslide rain job has not run' };
    let uid = null; for (const [u, k] of keyOf) if (k === key) { uid = u; break; }
    const h = uid && maskSet().has(uid) ? H.units[uid] : null; if (!h) return { ready: false, why: 'outside the landslide mask or not in the last refresh' };
    const series = { ...h.obs, ...h.fc }; const have = Object.keys(series).sort(); if (!have.length) return { ready: false, why: 'no rain held for this tehsil' };
    const ds = []; for (let t = Date.parse(have[0] + 'T00:00:00Z'), e = Date.parse(have[have.length - 1] + 'T00:00:00Z'); t <= e; t += DAY) ds.push(new Date(t).toISOString().slice(0, 10));
    const i = ds.indexOf(date); if (i < 0) return { ready: false, why: 'no rain held for ' + date };
    const BM = basisMap();
    const rain = ds.map(t => series[t] == null ? null : series[t]); const f0 = mapFeatures(BM, uid, features(rain, i, M.features)); if (!f0) return { ready: false, why: featuresWhy(M.features) };
    const r2 = rain.slice(); r2[i] = Math.max(r2[i] == null ? 0 : r2[i], Math.max(0, +mm || 0)); const f1 = mapFeatures(BM, uid, features(r2, i, M.features));
    const mo = Number(date.slice(5, 7)), b = oddsRatio(M, f0, mo), s1 = oddsRatio(M, f1, mo);
    const ob0 = observedOf(M, Math.round(b * 10) / 10), ob1 = observedOf(M, Math.round(s1 * 10) / 10);
    return { ready: true, key, date, modelVersion: M.version, rainDayMm: Math.round(f1.P1 * 10) / 10, baseRatio: Math.round(b * 10) / 10, ratio: Math.round(s1 * 10) / 10,
      baseObservedRatio: ob0 ? ob0.observedRatio : null, observedRatio: ob1 ? ob1.observedRatio : null, modelBand: ob1 ? ob1.modelBand : null,
      inputs: inputsOf(M, f1) };
  }
  /* the map layer: odds ratio on forecast day i, classes from data/map-layer-scales.json (landslide_odds) */
  function unitLayer(i) {
    const n = national(); if (!n.ready) return n; const S = scale(); if (!S) return { ready: false, why: 'the landslide_odds scale is missing from data/map-layer-scales.json' };
    const d = n.days[Math.min(Math.max(0, i), n.days.length - 1)]; const values = {}, whys = {};
    for (const [uid, u] of Object.entries(n.units)) { const r = u.days.find(x => x.date === d); if (!r) continue; if (r.ratio != null) values[uid] = r.ratio; else if (r.why) whys[uid] = r.why; }
    /* v283.36 C-now 2a: the top two bands merged into "10x or more" */
    const S2 = { ...S, cuts: S.cuts.filter((c) => !(c.min > TOP_BAND_MIN)), words: (S.words || []).slice(0, 4).map((w, k) => k === 3 ? 'Slides 10 times or more as often as on an average day (observed; too few test events for a figure)' : String(w).replace(/ordinary day \(observed\)/, 'average day (observed)')), test: CNOW_2A, observedBasis: OBSERVED_BASIS };
    return { ready: true, days: n.days, date: d, values, whys, scale: S2, version: n.modelVersion };
  }
  function status() { const M = model(); const BM = basisMap(); return { rainBasis: BM ? { file: BM.version, served: BM.served === true, heldOut: BM.heldOut ? { passed: BM.heldOut.passed } : null } : { file: null, served: false, why: 'data/landslide-basis-map.json not fitted yet (1 Nov retrain)' }, ready: !!H.at, at: H.at, ageH: H.at ? Math.round(ageH() * 10) / 10 : null, units: Object.keys(H.units).length, unitsRefreshOlderThan6h: Object.values(H.units).filter((h) => !(h.fcAt || h.at) || (Date.now() - Date.parse(h.fcAt || h.at)) / 3600e3 > 6).length, model: M ? M.version : null, lastError: lastErr }; }
  function validation() { const M = model(); return M ? { version: M.version, ...M.validation, limits: M.limits } : null; }
  /* v283.31 · 1.1 · the shared rain history: every tehsil's held daily liquid rain (observed + forecast), its age and coverage */
  const rainHistory = { rain5: (uid, date) => rain5Of(H.units[uid], date), series: (uid) => { const h = H.units[uid]; return h ? { obs: h.obs || {}, fc: h.fc || {}, at: h.at || null, fcAt: h.fcAt || h.at || null } : null; },
    coverage: () => { const all = fetchUnits(); const held = all.filter((u) => H.units[u.unitId] && H.units[u.unitId].at); return { tehsils: all.length, held: held.length, at: H.at, source: 'provider daily rain_sum (liquid), 62 past days + forecast, refreshed every 6 h' }; } };
  /* v283.40 item 6: the held hourly rain of a tehsil ([{ t, mm }], missing hours absent), read by hazsci applySponge (nss_runoff) */
  const rainHourly = { of: (uid) => hourlyOf(H.units[uid]), on: hourlyOn,
    coverage: () => { const all = fetchUnits(); return { tehsils: all.length, held: all.filter((u) => H.units[u.unitId] && H.units[u.unitId].hr).length, keepDays: HOURLY_KEEP_DAYS }; } };
  return { run, tick, national, unit, unitLayer, status, validation, scenario, rain5: rainHistory.rain5, rainHistory, rainHourly };
}
