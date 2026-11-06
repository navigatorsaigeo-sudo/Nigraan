/* ══ v91.17.267 · THE PLAINS STARTING FORECAST AS THE MULTI-MODEL MIX "blend v3" (Step 2, gate step2g_keep3_winter) ═════════════════
   What    In the zones the gate file allows (data/blend-gate.json: plains only), the temperature and dew point the served chain starts
           from are the convex mix of nine global models instead of the provider's best_match. Everything after the start (station /
           zone calibration, the national model WITH its pool members, moisture, weather MOS, airport, synoptic and live terms) runs
           unchanged on top. This is arm Bk3 of the gate: station-lake/scripts/chain_replay_s2p.mjs --natmem 1 --base blend_v3, where
           the blend (step2_blend.py --regime --tag v3) replaced best_match's temperature and dew point (and the humidity made from
           them) before the chain, and the national model kept its real ICON / GFS / Meteo-France members.
   Weights reports/step2_blend_weights_v3.json 'window2_weights' (copied to data/blend-weights-v3.json, sha256 pinned in the gate
           file): the fold fitted on every training row before 27 Sep 2026, i.e. the weights the gate scored out of sample in its
           window 2 (window 1 used leave-one-month-out refits of the same design, which are not kept). Convex (w >= 0, sum 1) per
           zone x lead day (1, 2, 3, 5) x 3-hour PKT block, heat-regime rows ('|hot') where fitted. The file rounds to 3 decimals;
           each weight vector is renormalised to sum 1 (step2_blend.solve returns w / sum w).
   Pick    exactly step2_blend.py pick(): (set, zone, L, blk, hot) -> (set, zone, L, -1, hot) -> (set, zone, L, blk) -> (set, zone, L, -1)
           -> (set, '*', L, -1); the hot keys only for a heat-regime hour. Nested sets in file order (9, 8, ... 4 models): an hour takes
           the largest set whose models ALL have temperature AND dew point and for which a weight exists (blend_rows). No complete
           smallest set (ifs, gfs, icon, gem) at an hour: best_match stays at that hour.
   Regime  an hour is in the heat regime when the median of the CORE models present (mm_table.py CORE: ifs, gfs, icon, gem, cma, jma;
           pandas median, missing skipped) is >= the zone x calendar-month (UTC) 90th percentile in the weights file's 'regime'.
   Lead    hours h from the issue time (the request, Date.now()) to the valid hour: lead day N = floor((h + 12) / 24). This is the
           replay's own geometry: it issued at 12 UTC L days before the target UTC day and scored that day's 24 hours, i.e. hours
           24L-12 .. 24L+11 ahead at lead L. N <= 1 (incl. past hours and the first 12 h) -> L1 weights; N = 4 (not fitted, not
           scored) -> the mean of the L3 and L5 blends (as the replay's --issued mode built day 4 from days 3 and 5); N >= 5 -> L5.
   Models  mm_table.py keys -> Open-Meteo model ids exactly as fetch_multimodel.py fetched them; variables temperature_2m, dew_point_2m;
           the request carries the place's height (rounded, as fetch_multimodel sent round(elev)) and no cell_selection (default, as
           fetched); always degC and GMT here (the answer's unit and time zone are converted when applied).
   Written the start temperature and dew point at 2 decimals in degC (the replay's archive precision), the relative humidity from them
           with the replay's own formula (Magnus 17.625 / 243.04), apparent temperature / wet bulb / VPD / current / 15-minutely /
           daily moved consistently; the national model's T0 stash (H.__natT.best_match) becomes the start, its members are kept.
   Off     NIGRAAN_BLEND=0, no gate file, a weights file not matching the pinned sha256, or the daily blend budget spent.
   Nothing here calls the network; the callers (server.mjs, national.mjs, fleet.mjs) fetch through rowsFor(). */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, isAbsolute } from 'node:path';
import { rhFromDew, wetBulbC, dewPointC, esatHpa } from './psychro.mjs';
import { weightOf, alignBatch } from './provider.mjs';
import { keepRecentRuns } from './runstate.mjs';   /* v91.17.283.22 · the saved rows: current and previous run */

export const MODEL_IDS = { ifs: 'ecmwf_ifs025', gfs: 'gfs_global', icon: 'icon_global', gem: 'gem_global', jma: 'jma_gsm',
  ukmo: 'ukmo_global_deterministic_10km', cma: 'cma_grapes_global', arp: 'meteofrance_arpege_world', aifs: 'ecmwf_aifs025_single' };
export const CORE = ['ifs', 'gfs', 'icon', 'gem', 'cma', 'jma'];
export const LEADS = [1, 2, 3, 5];
export const MEMBER_HOURLY = 'temperature_2m,dew_point_2m';
const isN = (v) => typeof v === 'number' && Number.isFinite(v);
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

/* the 3-hour block of the Pakistan day, as step2_blend.py: ((UTC hour + 5) mod 24) // 3 */
export function blkOf(tMs) { return Math.floor(((new Date(tMs).getUTCHours() + 5) % 24) / 3); }
/* lead day from the issue time (see the header) */
export function leadDay(validMs, issueMs) { return Math.floor(((validMs - issueMs) / 3600e3 + 12) / 24); }
export function leadMix(validMs, issueMs) {
  const N = leadDay(validMs, issueMs);
  if (N <= 1) return [{ L: 1, f: 1 }];
  if (N === 2 || N === 3) return [{ L: N, f: 1 }];
  if (N === 4) return [{ L: 3, f: 0.5 }, { L: 5, f: 0.5 }];
  return [{ L: 5, f: 1 }];
}
/* the replay's humidity from temperature and dew point (chain_replay_s2p.mjs rh()) */
export function rhReplay(t, td) { return (t == null || td == null) ? null : Math.max(1, Math.min(100, Math.round(100 * Math.exp(17.625 * td / (243.04 + td)) / Math.exp(17.625 * t / (243.04 + t))))); }

/* step2_blend weights report -> { built, sets, cells: Map(file key -> Float64Array normalised), regime: Map('zone|month' -> degC) } */
export function parseWeights(R) {
  if (!R || typeof R !== 'object' || !R.sets || !R.window2_weights) throw new Error('weights: sets / window2_weights missing');
  const sets = []; for (let i = 0; R.sets[String(i)]; i++) sets.push(R.sets[String(i)].slice());
  if (!sets.length) throw new Error('weights: no model sets');
  for (const s of sets) for (const m of s) if (!MODEL_IDS[m]) throw new Error('weights: unknown model ' + m);
  for (let i = 1; i < sets.length; i++) if (!sets[i].every((m) => sets[i - 1].includes(m))) throw new Error('weights: sets are not nested');
  const cells = new Map();
  for (const [k, v] of Object.entries(R.window2_weights)) {
    const p = /^set(\d+)\|([^|]+)\|L(\d+)\|blk(-?\d+)(\|hot)?$/.exec(k); if (!p) throw new Error('weights: bad key ' + k);
    const S = sets[Number(p[1])]; if (!S) throw new Error('weights: key for an unknown set ' + k);
    const w = new Float64Array(S.map((m) => Number(v.w && v.w[m]) || 0));
    if (w.some((x) => x < 0)) throw new Error('weights: negative weight in ' + k);
    const s = w.reduce((a, x) => a + x, 0); if (!(s > 0)) continue;
    for (let j = 0; j < w.length; j++) w[j] /= s;
    cells.set(k, w);
  }
  const regime = new Map(); for (const [k, v] of Object.entries(R.regime || {})) if (isN(Number(v))) regime.set(k, Number(v));
  return { built: R.built || null, sets, cells, regime };
}

/* step2_blend.py pick() */
export function pickWeights(W, si, zone, L, blk, hot) {
  const keys = (hot ? [`set${si}|${zone}|L${L}|blk${blk}|hot`, `set${si}|${zone}|L${L}|blk-1|hot`] : [])
    .concat([`set${si}|${zone}|L${L}|blk${blk}`, `set${si}|${zone}|L${L}|blk-1`, `set${si}|*|L${L}|blk-1`]);
  for (const k of keys) { const w = W.cells.get(k); if (w) return { w, key: k }; }
  return null;
}
/* the heat regime of one hour: median of the CORE models present >= the zone x UTC-month threshold */
export function isHot(W, zone, tMs, T) {
  const v = CORE.map((m) => T[m]).filter(isN).sort((a, b) => a - b); if (!v.length) return false;
  const k = v.length >> 1, med = v.length % 2 ? v[k] : (v[k - 1] + v[k]) / 2;
  const q = W.regime.get(zone + '|' + (new Date(tMs).getUTCMonth() + 1));
  return q != null && med >= q;
}
/* one lead: the first set (largest) whose models all have T and Td and that has weights (step2_blend.py blend_rows) */
export function blendAt(W, zone, L, blk, hot, T, Td) {
  for (let si = 0; si < W.sets.length; si++) {
    const S = W.sets[si]; if (!S.every((m) => isN(T[m]) && isN(Td[m]))) continue;
    const p = pickWeights(W, si, zone, L, blk, hot); if (!p) continue;
    let t = 0, td = 0; for (let j = 0; j < S.length; j++) { t += p.w[j] * T[S[j]]; td += p.w[j] * Td[S[j]]; }
    return { t, td, set: si, key: p.key };
  }
  return null;
}
/* one valid hour from plain values { short: degC } -> { t, td, hot, mix: [{L, f, set, key}] } | null */
export function blendHour(W, zone, tMs, issueMs, T, Td) {
  const hot = isHot(W, zone, tMs, T), blk = blkOf(tMs);
  const got = leadMix(tMs, issueMs).map((x) => ({ ...x, b: blendAt(W, zone, x.L, blk, hot, T, Td) })).filter((x) => x.b);
  if (!got.length) return null;
  const fs = got.reduce((a, x) => a + x.f, 0); let t = 0, td = 0;
  for (const x of got) { t += (x.f / fs) * x.b.t; td += (x.f / fs) * x.b.td; }   /* day 4 with one of L3 / L5 missing: the other alone */
  return { t, td, hot, blk, mix: got.map((x) => ({ L: x.L, f: x.f / fs, set: x.b.set, key: x.b.key })) };
}

/* the members row aligned on the answer's hours: { short: [degC per hour] } */
export function alignMembers(tsMs, row) {
  const R = row && row.hourly; if (!R || !Array.isArray(R.time)) return null;
  const off = (row.utc_offset_seconds || 0) * 1000;
  const ix = new Map(R.time.map((t, k) => [typeof t === 'number' ? t * 1000 : Date.parse(t + 'Z') - off, k]));
  const T = {}, Td = {}; let any = false;
  for (const [s, id] of Object.entries(MODEL_IDS)) {
    const a = R['temperature_2m_' + id], b = R['dew_point_2m_' + id];
    T[s] = tsMs.map((t) => { const k = ix.get(t); return k == null || !Array.isArray(a) ? null : a[k]; });
    Td[s] = tsMs.map((t) => { const k = ix.get(t); return k == null || !Array.isArray(b) ? null : b[k]; });
    if (Array.isArray(a)) any = true;
  }
  return any ? { T, Td } : null;
}

/* Open-Meteo's apparent temperature (Meteorology.swift) changes by dT + 0.348 de (hPa, Magnus 17.27 / 237.7) for a new T, Td */
const eHpaOM = (td) => 6.105 * Math.exp(17.27 * td / (237.7 + td));
const toC = (v, F) => (F ? (v - 32) * 5 / 9 : v), fromC = (v, F) => (F ? v * 9 / 5 + 32 : v);

/* THE START AT ONE LOCATION (mutates loc). row: the members answer for this place. -> { applied, reason?, provenance?, starts? } */
export function applyToLocation(loc, row, { zone, nowMs = Date.now(), W, gateVersion = null, internal = false } = {}) {
  const H = loc && loc.hourly; if (!H || !Array.isArray(H.time) || !Array.isArray(H.temperature_2m)) return { applied: false, reason: 'no hourly temperature' };
  const off = (loc.utc_offset_seconds || 0) * 1000;
  const ts = H.time.map((t) => (typeof t === 'number' ? t * 1000 : Date.parse(t + 'Z') - off));
  const A = alignMembers(ts, row); if (!A) return { applied: false, reason: 'no members row' };
  const Fh = /F/.test(String((loc.hourly_units && loc.hourly_units.temperature_2m) || ''));
  const n = ts.length, bmT = H.temperature_2m.slice();
  let bmTd = Array.isArray(H.dew_point_2m) ? H.dew_point_2m.slice() : null;
  if (!bmTd && Array.isArray(H.relative_humidity_2m)) bmTd = bmT.map((t, i) => (isN(t) && isN(H.relative_humidity_2m[i])) ? fromC(dewPointC(toC(t, Fh), H.relative_humidity_2m[i]), Fh) : null);
  const dT = new Array(n).fill(0), dTd = new Array(n).fill(0), starts = new Array(n).fill(null);
  let used = 0, hot = 0, sumD = 0; const setsUsed = {}, lead = {};
  for (let i = 0; i < n; i++) {
    const T = {}, Td = {}; for (const s of Object.keys(MODEL_IDS)) { T[s] = A.T[s][i]; Td[s] = A.Td[s][i]; }
    const b = blendHour(W, zone, ts[i], nowMs, T, Td); if (!b) continue;
    const tC = r2(b.t), tdC = r2(Math.min(b.td, b.t));
    starts[i] = { t: tC, td: tdC, hot: b.hot, mix: b.mix };
    const t1 = Fh ? r2(fromC(tC, true)) : tC, td1 = Fh ? r2(fromC(tdC, true)) : tdC;
    if (isN(bmT[i])) { dT[i] = t1 - bmT[i]; sumD += toC(t1, Fh) - toC(bmT[i], Fh); }
    if (bmTd && isN(bmTd[i])) dTd[i] = td1 - bmTd[i];
    H.temperature_2m[i] = t1;
    if (Array.isArray(H.dew_point_2m)) H.dew_point_2m[i] = td1;
    const rh = rhReplay(tC, tdC);
    if (Array.isArray(H.relative_humidity_2m)) H.relative_humidity_2m[i] = rh;
    if (Array.isArray(H.apparent_temperature) && isN(H.apparent_temperature[i])) {
      const de = bmTd && isN(bmTd[i]) ? eHpaOM(tdC) - eHpaOM(toC(bmTd[i], Fh)) : 0;
      H.apparent_temperature[i] = r1(H.apparent_temperature[i] + dT[i] + 0.348 * de * (Fh ? 9 / 5 : 1)); }
    if (Array.isArray(H.wet_bulb_temperature_2m) && isN(H.wet_bulb_temperature_2m[i])) { const wb = wetBulbC(tC, rhFromDew(tC, tdC), isN(loc.elevation) ? { elevationM: loc.elevation } : null); if (wb != null) H.wet_bulb_temperature_2m[i] = r1(fromC(wb, Fh)); }
    if (Array.isArray(H.vapour_pressure_deficit) && isN(H.vapour_pressure_deficit[i])) H.vapour_pressure_deficit[i] = Math.round(Math.max(0, esatHpa(tC) - esatHpa(tdC)) / 10 * 100) / 100;
    used++; if (b.hot) hot++; for (const x of b.mix) { setsUsed[W.sets[x.set].length] = (setsUsed[W.sets[x.set].length] || 0) + 1; lead[x.L] = (lead[x.L] || 0) + 1; }
  }
  if (!used) return { applied: false, reason: 'no complete model set at any hour' };
  /* the current block and the quarter-hours move with the hourly change, interpolated in time */
  const at = (arr, tMs) => { if (tMs <= ts[0]) return arr[0]; if (tMs >= ts[n - 1]) return arr[n - 1];
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] <= tMs) lo = m; else hi = m; } const f = (tMs - ts[lo]) / (ts[hi] - ts[lo]); return arr[lo] + f * (arr[hi] - arr[lo]); };
  const shift = (S, ms, k) => {
    const a = at(dT, ms), b = at(dTd, ms); if (!a && !b) return;
    const get = (f) => (k == null ? S[f] : (Array.isArray(S[f]) ? S[f][k] : undefined)); const set = (f, v) => { if (k == null) S[f] = v; else S[f][k] = v; };
    const t0 = get('temperature_2m'); if (!isN(t0)) return; const t1 = r1(t0 + a); set('temperature_2m', t1);
    const td0 = get('dew_point_2m'); let td1 = null;
    if (isN(td0)) { td1 = Math.min(r1(td0 + b), t1); set('dew_point_2m', td1); }
    else if (isN(get('relative_humidity_2m'))) td1 = Math.min(fromC(dewPointC(toC(t0, Fh), get('relative_humidity_2m')), Fh) + b, t1);
    if (td1 != null && isN(get('relative_humidity_2m'))) set('relative_humidity_2m', rhReplay(toC(t1, Fh), toC(td1, Fh)));
    if (isN(get('apparent_temperature'))) set('apparent_temperature', r1(get('apparent_temperature') + a + (td1 != null && isN(td0) ? 0.348 * (eHpaOM(toC(td1, Fh)) - eHpaOM(toC(td0, Fh))) * (Fh ? 9 / 5 : 1) : 0)));
  };
  try { const C = loc.current; if (C && C.time != null && isN(C.temperature_2m)) shift(C, typeof C.time === 'number' ? C.time * 1000 : Date.parse(String(C.time).slice(0, 16) + 'Z') - off, null); } catch (_) {}
  try { const M = loc.minutely_15; if (M && Array.isArray(M.time) && Array.isArray(M.temperature_2m)) M.time.forEach((t, k) => shift(M, typeof t === 'number' ? t * 1000 : Date.parse(t + 'Z') - off, k)); } catch (_) {}
  /* the day card from the moved curve (whole days; the served chain recomputes it at its end) */
  try { const D = loc.daily; if (D && Array.isArray(D.time) && typeof H.time[0] === 'string') {
    const by = new Map(); H.time.forEach((t, i) => { const d = String(t).slice(0, 10); (by.get(d) || by.set(d, []).get(d)).push(i); });
    D.time.forEach((d, j) => { const ix = by.get(String(d).slice(0, 10)); if (!ix || ix.length < 24 || !ix.some((i) => starts[i])) return;
      for (const base of ['temperature_2m', 'dew_point_2m', 'apparent_temperature', 'relative_humidity_2m']) { const arr = H[base]; if (!Array.isArray(arr)) continue;
        const v = ix.map((i) => arr[i]); if (v.some((x) => !isN(x))) continue;
        for (const kind of ['max', 'min', 'mean']) { const k = base + '_' + kind; if (!Array.isArray(D[k]) || !isN(D[k][j])) continue;
          const x = kind === 'max' ? Math.max(...v) : kind === 'min' ? Math.min(...v) : v.reduce((a, y) => a + y, 0) / v.length;
          D[k][j] = base === 'relative_humidity_2m' ? Math.round(x) : r1(x); } } }); } } catch (_) {}
  /* the national model's T0 stash: T0 := the start (as the replay built it from the replaced series); the pool members are KEPT */
  try { const st = H.__natT; if (st) { st.best_match = H.temperature_2m.slice();
    if (Array.isArray(st.__dew) && Array.isArray(H.dew_point_2m)) st.__dew = H.dew_point_2m.slice();
    if (Array.isArray(st.__rh) && Array.isArray(H.relative_humidity_2m)) st.__rh = H.relative_humidity_2m.slice(); } } catch (_) {}
  try { Object.defineProperty(H, '__blendBase', { value: { t: bmT, td: bmTd, starts }, enumerable: false, configurable: true }); } catch (_) {}
  const prov = { applied: true, source: 'multi-model mix', operatorOnly: true, zone, hours: used, ofHours: n, heatRegimeHours: hot,
    meanDeltaC: r2(sumD / used), models: W.sets[0].length, gate: gateVersion, weightsBuilt: W.built,
    method: 'convex mix of nine global models (weights per zone, lead day and 3-hour block, heat-regime weights on hot hours), replacing best_match as the start; the station-based steps run on top' };
  if (internal) prov.internal = { modelsBySetSize: setsUsed, hoursByLead: lead };
  return { applied: true, provenance: prov, starts };
}

/* data/blend-gate.json -> options */
export function parseGate(G) {
  if (!G || typeof G !== 'object' || !G.zones || typeof G.zones !== 'object') throw new Error('gate: zones missing');
  const zones = {}; for (const [z, v] of Object.entries(G.zones)) zones[z] = v === true;
  const num = (v, d, lo, hi) => (isN(Number(v)) && Number(v) >= lo && Number(v) <= hi) ? Number(v) : d;
  return { version: G.version || null, zones, weights: G.weights || null, weightsSha256: G.weightsSha256 || null,
    sweep: G.nationalSweep !== false, requestDays: num(G.requestDays, 8, 1, 16), minPastDays: num(G.minPastDays, 3, 0, 16), maxPastDays: num(G.maxPastDays, 16, 0, 16),
    cacheMin: num(G.cacheMin, 90, 0, 360), budgetShare: num(G.budgetShare, 0.25, 0, 1) };
}

/* ══ the server-side object: gate + weights, the per-place members cache, the daily blend budget ═════════════════════════════════ */
export function createBlend({ dataDir, env = process.env, provider = null, budget = null, log = null, runs = null } = {}) {
  let G = null, W = null, sha = null, err = null, at = 0, gm = 0, wm = 0, wkey = null, ptr = null;
  const cache = new Map(), inflight = new Map();
  const mem = { day: null, spent: 0, calls: 0, skipped: 0, applied: 0, failed: 0 };
  function load() {
    if (Date.now() - at < 60e3) return; at = Date.now();
    try {
      const gf = join(dataDir, 'blend-gate.json'); if (!existsSync(gf)) { G = W = null; err = 'no data/blend-gate.json'; return; }
      const m1 = statSync(gf).mtimeMs; if (m1 !== gm) { G = parseGate(JSON.parse(readFileSync(gf, 'utf8'))); gm = m1; wm = 0; }
      /* v91.17.283.6 · item 9 · THE ACTIVE WEIGHTS COME FROM A POINTER (data/blend-weights-active.json: version, file, sha256, sourceRun),
         so a refitted weights file (1 Nov BLEND-R, py/blend_r.py) goes live by flipping the pointer (scripts/gen/blend_promote.mjs), no new
         code. The pointer's file must be a plain name in the data folder and match the pointer's sha256 and parse; otherwise the gate's own
         weights (G.weights, pinned by G.weightsSha256) are served and the reason is logged and shown in status().weightsPointer.
         NIGRAAN_BLEND_WEIGHTS (an explicit file) still comes first. The shipped pointer names the gate's file: identical weights. */
      let wf0 = null, pin = G.weightsSha256 || null, src = 'gate';
      if (env.NIGRAAN_BLEND_WEIGHTS) { wf0 = env.NIGRAAN_BLEND_WEIGHTS; src = 'env'; }
      else { const pr = readPointer(); if (pr && pr.ok) { wf0 = pr.file; pin = pr.sha256; src = 'pointer'; }
        if (pr && !pr.ok && (!ptr || ptr.why !== pr.why) && log) try { log('blend: weights pointer not used (' + pr.why + '); serving the gate weights ' + G.weights); } catch (_) {}
        ptr = pr; }
      if (!wf0) { wf0 = G.weights; src = 'gate'; } if (!wf0) throw new Error('the gate names no weights file');
      const wf = isAbsolute(wf0) ? wf0 : join(dataDir, wf0);
      const m2 = statSync(wf).mtimeMs, k2 = wf + '|' + m2 + '|' + pin; if (k2 !== wkey) { const buf = readFileSync(wf); const h = createHash('sha256').update(buf).digest('hex');
        if (pin && pin !== h) throw new Error('weights sha256 ' + h.slice(0, 12) + ' does not match the ' + (src === 'pointer' ? 'pointer' : 'gate') + ' (' + String(pin).slice(0, 12) + ')');
        W = parseWeights(JSON.parse(buf.toString('utf8'))); sha = h; wm = m2; wkey = k2; W.source = src; W.file = wf0; }
      err = null;
    } catch (e) { W = null; err = String(e.message || e); if (log) try { log('blend: ' + err); } catch (_) {} }
  }
  /* the pointer: null when absent (the gate's weights, as before v91.17.283.6); { ok:false, why } when present but not usable */
  function readPointer() {
    const pf = join(dataDir, 'blend-weights-active.json'); if (!existsSync(pf)) return null;
    let P; try { P = JSON.parse(readFileSync(pf, 'utf8')); } catch (e) { return { ok: false, why: 'pointer unreadable: ' + (e.message || e) }; }
    const base = { version: P && P.version || null, file: P && P.file || null, sha256: P && P.sha256 || null, sourceRun: P && P.sourceRun || null, promotedAt: P && P.promotedAt || null };
    if (!P || typeof P.file !== 'string' || !/^[\w.-]+\.json$/.test(P.file)) return { ...base, ok: false, why: 'pointer file name not a plain .json name in the data folder' };
    if (!/^[0-9a-f]{64}$/.test(String(P.sha256 || ''))) return { ...base, ok: false, why: 'pointer has no sha256' };
    if (!P.version || !P.sourceRun) return { ...base, ok: false, why: 'pointer lacks version or sourceRun' };
    const f = join(dataDir, P.file); if (!existsSync(f)) return { ...base, ok: false, why: 'weights file ' + P.file + ' not found' };
    let h = null; try { h = createHash('sha256').update(readFileSync(f)).digest('hex'); } catch (e) { return { ...base, ok: false, why: 'weights file unreadable' }; }
    if (h !== P.sha256) return { ...base, ok: false, why: 'checksum mismatch: ' + P.file + ' is ' + h.slice(0, 12) + ', the pointer says ' + String(P.sha256).slice(0, 12) };
    try { parseWeights(JSON.parse(readFileSync(f, 'utf8'))); } catch (e) { return { ...base, ok: false, why: 'weights file does not parse: ' + (e.message || e) }; }
    return { ...base, ok: true };
  }
  const on = () => { if (env.NIGRAAN_BLEND === '0') return false; load(); return !!(G && W); };
  const wantsZone = (z) => on() && !!(z && G.zones[z]);
  const sweepOn = () => on() && G.sweep;
  const modelIds = () => { load(); return W ? W.sets[0].map((s) => MODEL_IDS[s]) : []; };
  /* the daily blend budget: budgetShare of the provider's daily budget (MACH_DAILY_CALL_LIMIT, else the warning level NIGRAAN_CALL_WARN,
     default 2,000,000 weighted calls, provider.mjs); NIGRAAN_BLEND_BUDGET overrides. Spent weight is kept on the provider's day window
     (blendWeighted, saved with the store), so a restart does not reset it. */
  const cap = () => Number(env.NIGRAAN_BLEND_BUDGET) || (G ? G.budgetShare : 0.25) * (Number(env.MACH_DAILY_CALL_LIMIT) || Number(env.NIGRAAN_CALL_WARN) || 2e6);
  const day = () => new Date().toISOString().slice(0, 10);
  const spent = () => { try { if (provider && provider.windowFor) return provider.windowFor().blendWeighted || 0; } catch (_) {} if (mem.day !== day()) { mem.day = day(); mem.spent = 0; } return mem.spent; };
  const spend = (w) => { try { if (provider && provider.windowFor) { const x = provider.windowFor(); x.blendWeighted = Math.round(((x.blendWeighted || 0) + w) * 100) / 100; return; } } catch (_) {} if (mem.day !== day()) { mem.day = day(); mem.spent = 0; } mem.spent += w; };
  /* v91.17.283 · WS1 · owner decision C · the members are an enhancement of a forecast, not the forecast: they are shed with the background
     class of the daily provider budget (callbudget.mjs) */
  const canSpend = (w, q = null) => { let over = false; try { over = !!(provider && provider.overBudget && provider.overBudget()); } catch (_) {} try { if (!over && budget && !budget.allow('background', w, { tag: 'blend members', kind: 'forecast', models: q ? q.models : modelIds() })) over = true; } catch (_) {} return !over && spent() + w <= cap(); };
  const pdOf = (pastDays) => Math.max(G ? G.minPastDays : 3, Math.min(G ? G.maxPastDays : 16, Math.ceil(Number(pastDays) || 0)));
  const keyOf = (p, pd) => ['bl', Number(p.lat).toFixed(4), Number(p.lon).toFixed(4), p.elev == null ? '' : Math.round(p.elev), pd].join('|');
  /* v91.17.283 · WS1 · PATCH3 · a row is also kept while the provider has no newer run of the nine models (api/modelruns.mjs run key, `rk`);
     under main-runs-only for its tier (shed pressure or test mode, callbudget.mjs) it is kept until a new 00/12 UTC run (`keep`) */
  /* A row is the nine models for one place and one model run. It stays for that run. The 90-minute gate time still covers a run
     change (a new run is bought after it). With no run id yet, the row stays one model cycle (6 h) instead of being bought again at 90 minutes. */
  function cacheGet(k, rk = null, keep = null) { const h = cache.get(k); if (!h) return null;
    const age = Date.now() - h.at, ttl = (G ? G.cacheMin : 90) * 60e3;
    if (age <= ttl || (rk && h.run && (h.run === rk || (keep && keep(h.run)))) || ((!rk || !h.run) && age <= 6 * 3600e3)) return h.v;
    cache.delete(k); return null; }
  const BL_MAX = Math.max(200, Number(process.env.NIGRAAN_BLEND_ROWS) || 4000);
  function cachePut(k, v, run = null) { cache.delete(k); cache.set(k, { at: Date.now(), v, run }); while (cache.size > BL_MAX) cache.delete(cache.keys().next().value); }   /* holds the tehsils and the places asked this run; NIGRAAN_BLEND_ROWS overrides (v283.51 default was 600, which evicted a row and bought the nine models again) */
  /* the members request for some places (the caller adds the key and sends it) */
  function requestFor(places, pd) {
    const q = { latitude: places.map((p) => Number(p.lat).toFixed(4)).join(','), longitude: places.map((p) => Number(p.lon).toFixed(4)).join(','),
      hourly: MEMBER_HOURLY, models: modelIds().join(','), forecast_days: String(G ? G.requestDays : 8), past_days: String(pd + 1), timezone: 'GMT' };   /* +1 day: a request in PKT starts at 19 UTC of the day before */
    if (places.some((p) => p.elev != null)) q.elevation = places.map((p) => (p.elev == null ? 'nan' : String(Math.round(p.elev)))).join(',');
    return q;
  }
  /* rows for places [{lat, lon, elev}] (elev: the height the forecast request carries, null = the provider's DEM): from the cache, the rest in
     ONE call through fetchFn(query) -> answer. A failed call, or the budget spent, gives null rows (those places keep best_match). */
  async function rowsFor(places, { pastDays = 3 } = {}, fetchFn) {
    const out = new Array(places.length).fill(null); if (!on() || !places.length) return out;
    const pd = pdOf(pastDays); const miss = [];
    let rk = null, keep = null; try { if (runs) { const q0 = requestFor([], pd), get = (x) => q0[x]; const spec = runs.specFor('forecast', get); rk = spec ? await runs.poll(spec) : null;
      const t = budget && budget.tierOf ? budget.tierOf({ tag: 'blend members', kind: 'forecast', models: q0.models }) : null;
      if (rk && t && budget.mainRunsOnly(t.id)) keep = (held) => !runs.mainUpdate('forecast', get, held, rk, budget.mainHours()); } } catch (_) { rk = null; keep = null; }
    /* v91.17.283.26 · ONE MEMBERS ROW PER PLACE AND RUN, NOT ONE PER PAST WINDOW. The rows were kept per past-day window, so the same place
       asked with 3 past days (a point, the area card) and with 2 or 7 (the station pairs, a sweep) bought the nine models again for the
       same run. The members are read by their own hour (alignMembers matches each served hour to the row's hour; a series at an hour does
       not depend on the window asked), so a held row of the same place and run with at least the past days asked is the same numbers
       for every hour the request has. A fetch asks the widest past window the provider weighs the same as the one asked (provider.mjs
       weightOf, the provider's own rule), so a later request with a few more past days reads it too at no extra cost. */
    const pdMax = G ? G.maxPastDays : 16;
    const held = (p) => { for (let x = pd; x <= pdMax; x++) { const kk = keyOf(p, x), v = cacheGet(kk, rk, keep); if (v) return v; } return null; };
    let pdF = pd; { const w0 = weightOf((k) => requestFor([{ lat: 0, lon: 0, elev: null }], pd)[k], 1);
      while (pdF < pdMax && weightOf((k) => requestFor([{ lat: 0, lon: 0, elev: null }], pdF + 1)[k], 1) <= w0) pdF++; }
    places.forEach((p, k) => { const v = held(p); if (v) out[k] = v; else miss.push([k, keyOf(p, pdF)]); });
    if (!miss.length) return out;
    const P = miss.map(([k]) => places[k]); const q = requestFor(P, pdF); const w = weightOf((k) => q[k], P.length);
    const fk = JSON.stringify(q); let rows = null;
    if (inflight.has(fk)) rows = await inflight.get(fk);
    else {
      if (!canSpend(w, q)) { mem.skipped += P.length; return out; }
      const pr = (async () => { spend(w); mem.calls++; try { const j = await fetchFn(q); return alignBatch(j, P.map((p) => ({ lat: Number(Number(p.lat).toFixed(4)), lon: Number(Number(p.lon).toFixed(4)), elevM: p.elev == null ? null : Math.round(p.elev) }))); } catch (_) { mem.failed++; return null; } })();
      inflight.set(fk, pr); try { rows = await pr; } finally { inflight.delete(fk); }
    }
    if (Array.isArray(rows)) miss.forEach(([k, kk], r) => { if (rows[r]) { out[k] = rows[r]; cachePut(kk, rows[r], rk); } });
    return out;
  }
  /* which locations of a forecast request get the members: las / los / els parsed from the request; zoneOf(lat, lon, elev) */
  function plan(las, los, els, zoneOf, elevOf = null) {
    const idx = []; if (!on()) return idx;
    for (let i = 0; i < las.length; i++) { if (!isN(las[i]) || !isN(los[i])) continue;
      let el = isN(els[i]) ? els[i] : null; if (el == null && elevOf) { try { const v = elevOf(las[i], los[i]); if (isN(v)) el = v; } catch (_) {} }
      let z = null; try { z = zoneOf(las[i], los[i], el); } catch (_) { z = null; }
      if (wantsZone(z)) idx.push(i); }
    return idx;
  }
  function applyTo(loc, row, { zone, internal = false, nowMs = Date.now() } = {}) {
    if (!on()) return { applied: false, reason: 'off' };
    if (!wantsZone(zone)) return { applied: false, reason: 'zone ' + zone + ' not in the gate' };
    try { const r = applyToLocation(loc, row, { zone, nowMs, W, gateVersion: G.version, internal }); if (r.applied) mem.applied++; return r; }
    catch (e) { return { applied: false, reason: 'error: ' + (e.message || e) }; }
  }
  const tag = () => (on() ? 'blend:' + (G.version || '') + ':' + String(sha || '').slice(0, 10) : 'blend:off');
  const status = () => { load(); return { on: on(), error: err, gate: G ? { version: G.version, zones: G.zones, nationalSweep: G.sweep, requestDays: G.requestDays, cacheMin: G.cacheMin, budgetShare: G.budgetShare } : null,
    weights: W ? { built: W.built, sets: W.sets.length, cells: W.cells.size, regimeCells: W.regime.size, sha256: sha, file: W.file || null, source: W.source || null } : null,
    weightsPointer: ptr ? { used: !!ptr.ok && !!W && W.source === 'pointer', version: ptr.version, file: ptr.file, sourceRun: ptr.sourceRun, promotedAt: ptr.promotedAt, ...(ptr.ok ? {} : { fallbackWhy: ptr.why }) } : null,
    budget: { spentToday: Math.round(spent()), cap: Math.round(cap()) }, calls: mem.calls, placesSkippedForBudget: mem.skipped, failedCalls: mem.failed, applied: mem.applied, cache: cache.size }; };
  /* v91.17.283.22 · NO RE-BUY AFTER A RESTART: the member rows survive a restart or a deploy swap (server.mjs registers them with
     api/runstate.mjs). Measured (data/quota-callers, 24-26 Oct): every server start fetched the blend members of all its places again,
     about 4,200 weighted calls a start, 9-12 starts a day. Only rows fetched on the current UTC day (the rows' time axis is counted from
     the request day) are written and read back; each keeps its fetch time and run key, so the 90-minute / same-run rule of cacheGet decides
     exactly as in a server that never stopped. */
  const utcDay = (t) => new Date(t).toISOString().slice(0, 10);
  /* only rows of the current UTC day and of the current or previous run (keepRuns, data/runstate-config.json); a row without a run while
     it is within the cache time */
  function snapshot(t = Date.now(), keepRuns = 2) { const d = utcDay(t), ttl = (G ? G.cacheMin : 90) * 60e3;
    const L = [...cache.entries()].filter(([, e]) => e && utcDay(e.at) === d).map(([k, e]) => [k, e.at, e.run || null, e.v]);
    return keepRecentRuns(L, { keepRuns, ttlMs: ttl, now: t }); }
  function restore(list, t = Date.now()) { const d = utcDay(t); let n = 0;
    for (const x of Array.isArray(list) ? list : []) { if (!Array.isArray(x) || x.length !== 4) continue; const [k, at, run, v] = x; if (cache.has(k) || !Number.isFinite(at) || utcDay(at) !== d || at > t || !v) continue;
      cache.set(k, { at, v, run }); n++; }
    while (cache.size > BL_MAX) cache.delete(cache.keys().next().value); return n; }
  const sig = () => mem.calls + '|' + cache.size;
  return { on, wantsZone, sweepOn, modelIds, requestFor, rowsFor, plan, applyTo, status, tag, weights: () => (on() ? W : null), snapshot, restore, sig };
}
