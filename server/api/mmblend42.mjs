/* == v91.17.283.42 · C11 MULTI-MODEL BLEND, served only in the cells that passed (data/mmblend42-weights.json) ========================
   What    For the (variable | zone | lead day) cells that passed every check of data/evidence/c11/C11_RULES_20261031.json (locked 31 Oct
           2026 12:35 PKT before scoring), plus the declared official-station exposure check and the served-chain check, the value the
           served chain produced is REPLACED by the blend of the global models' own forecasts at that place. Every other cell, every hour
           less than 12 h ahead (lead day 0: live / observation terms stay), and every place outside the cells' zones is left exactly as the
           chain made it. The blend was tested against the served chain itself where the chain can be replayed (temperature, plains and
           coast: replay Bk3) and replaces it only where it beat it; elsewhere it beat raw ECMWF IFS 9 km (and, for gusts, raw GFS).
   Cells   (33, see the weights file): 2 m temperature hills L1-7; dew point plains L1, 2, 5-7 and hills L2-5; daily Tmax hills L1-7;
           daily Tmin plains L1-7; 10 m wind plains L3-5; daily max gust mountain L1-7; daily rain mountain L1-5 (L4 / L6 = mean of the
           two neighbouring passed cells, only when both exist).
   Method  exactly the scorer's (scripts/c11/c11_score.py) and its reference predictor (scripts/c11/c11_predict_ref.py), parity tested
           (scripts/c11/c11_mmblend42.test.mjs): 'a*' equal mean of the selected raw members; 'b' members debiased per zone x season x PKT
           3-h block (additive; rain / gust: ratio) then inverse-MSE weights per zone x season; 'c' ridge stacking per station cluster
           (nearest centroid) on the 'b' members with a season x block intercept, or for rain empirical quantile mapping of 'b'.
           Missing members: renormalised over those present ('a', 'b'); 'c' needs all members, else 'b'.
   Members Open-Meteo forecast API, the archive's model ids (gfs_seamless, icon_seamless, ... NOT the plains blend v3 ids), no elevation
           parameter and no cell_selection (as the archive was fetched), GMT, 8 forecast days. One request per place batch, only the
           variables and models the batch's zones need, cached per place for one model cycle (6 h). Budget: calls are counted as
           background ('mmblend42 members'); the daily allowance is 4 runs x the tehsils of the served zones x the request weight
           (provider weight rule), computed at start; spent -> the chain is served unchanged.
   Derived when dew point or temperature is replaced, relative_humidity_2m is recomputed from the final pair (Magnus 17.625 / 243.04, the
           scorer's and blend.mjs' formula). Other derived fields (apparent temperature, wet bulb) are not touched.
   Off     NIGRAAN_MMBLEND42=0, no weights file, a file whose sha256 differs from data/mmblend42-gate.json, or the budget spent.
   The key is read from the environment for the request only; it is never logged.
   v91.17.283.40 (NIGRAAN 1.0.4, owner decision 31 Oct 2026) · a cell may be "mode": "shadow" in the weights file: it is computed and logged
           beside the served value (station-lake/archive/mm42/shadow_YYYY-MM.jsonl.gz, whole gzip members, internal, not shipped) and NOT
           served: hills 2 m temperature L1-7 and hills Tmax L1-7 (they beat raw IFS, but the served chain could not be replayed in the
           hills, and in the plains the served chain beat the blend for hourly temperature). Served: plains Tmin L1-7, dew point plains
           L1, 2, 5-7 and hills L2-5, 10 m wind plains L3-5, mountain daily max gust L1-7, mountain daily rain L1-5.
           ONE VALUE PER PLACE: where a daily Tmax / Tmin is served from the blend, the hourly temperatures of that PKT day are remapped
           (affine between the day's hourly min and max, the other end kept) so the hourly curve's min / max IS the daily value every section
           prints; relative humidity, apparent temperature (Steadman 1994 as Open-Meteo: Ta + 0.33 e - 0.70 ws - 4.00) and wet-bulb
           temperature (Stull 2011) are recomputed for every hour whose temperature, dew point or wind was changed, and the day's apparent
           max / min from those hours. Per place the last application is kept (tag, served / shadow counts) for GET /api/ops/mm42. */
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { appendGzMember } from './gzsafe.mjs';   /* v283.40: the shadow log, whole gzip members only */
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const isN = (v) => typeof v === 'number' && Number.isFinite(v);
const VARS_OF = { T: 'temperature_2m', Td: 'dew_point_2m', W: 'wind_speed_10m', TX: 'temperature_2m', TN: 'temperature_2m', G: 'wind_gusts_10m', R: 'precipitation' };
const OUT_HOURLY = { T: 'temperature_2m', Td: 'dew_point_2m', W: 'wind_speed_10m' };
const OUT_DAILY = { TX: 'temperature_2m_max', TN: 'temperature_2m_min', G: 'wind_gusts_10m_max', R: 'precipitation_sum' };
const SEAS = { 12: 'DJF', 1: 'DJF', 2: 'DJF', 3: 'MAM', 4: 'MAM', 5: 'MAM', 6: 'JJAS', 7: 'JJAS', 8: 'JJAS', 9: 'JJAS', 10: 'ON', 11: 'ON' };
const PKT = 5 * 3600e3, CYCLE = 6 * 3600e3;

/* ---------------------------------------------------------------- the predictor (mirror of c11_predict_ref.py) */
function biasOf(cell, j, zone, season, blk) {
  const keys = [`${zone}|${season}|${blk}`, `${zone}|${season}`, zone];
  for (let l = 0; l < 3; l++) { const t = cell.bias[j][l]; if (t && Object.prototype.hasOwnProperty.call(t, keys[l])) return t[keys[l]]; }
  return null;
}
function debias(cell, x, zone, season, blk) {
  return cell.members.map((m, j) => {
    const v = x[m]; if (!isN(v)) return null;
    const b = biasOf(cell, j, zone, season, blk);
    if (cell.mult) return Math.max(0, b != null ? v * b : v);
    return b != null ? v - b : v;
  });
}
function wmean(vals, w) {
  let s = 0, a = 0;
  vals.forEach((v, i) => { if (v != null && w[i] > 0) { s += w[i]; a += v * w[i]; } });
  return s > 0 ? a / s : null;
}
function interp(x, xp, fp) {
  const n = xp.length;
  if (x < xp[0]) return fp[0];
  if (x >= xp[n - 1]) return fp[n - 1];
  let lo = 0, hi = n;                    /* bisect_right */
  while (lo < hi) { const mid = (lo + hi) >> 1; if (x < xp[mid]) hi = mid; else lo = mid + 1; }
  const j = lo - 1;
  return fp[j] + (fp[j + 1] - fp[j]) * (x - xp[j]) / (xp[j + 1] - xp[j]);
}
const MM_MAX = Math.max(200, Number(process.env.NIGRAAN_MM42_ROWS) || 4000);   /* one row per place per 6 h cycle; 600 evicted the cycle's rows and bought them again. NIGRAAN_MM42_ROWS overrides */
export function predictCell(cell, x, zone, season, blk, lat, lon) {
  const pk = cell.pick;
  if (pk[0] === 'a') {
    const vals = cell.members.map((m) => (isN(x[m]) ? x[m] : null));
    return wmean(vals, cell.members.map((m) => (cell.aSel.includes(m) ? 1 : 0)));
  }
  const d = debias(cell, x, zone, season, blk);
  const w = cell.w[`${zone}|${season}`] || cell.wZone || d.map(() => 1);
  const pb = wmean(d, w);
  if (pk === 'b' || pb == null) return pb;
  if (cell.qm) {
    const q = cell.qm[`${zone}|${season}`]; if (!q) return pb;
    const qf = q.qf, qo = q.qo, top = qf[qf.length - 1];
    const m = pb > top ? pb * (top > 0 ? qo[qo.length - 1] / top : 1) : interp(pb, qf, qo);
    return m < 0.1 ? 0 : m;
  }
  if (d.some((v) => v == null) || !cell.clusters || !cell.clusters.length) return pb;
  let cl = null, best = Infinity;
  for (const c of cell.clusters) { const dd = (c.centroid[0] - lat) ** 2 + (c.centroid[1] - lon) ** 2; if (dd < best) { best = dd; cl = c; } }
  const li = cl.levels.indexOf(`${season}|${blk}`); if (li < 0) return pb;
  const nl = cl.levels.length; let v = cl.beta[li];
  d.forEach((di, i) => { v += cl.beta[nl + i] * (di - cl.mu[i]) / cl.sd[i]; });
  return cell.mult ? Math.max(0, v) : v;
}

/* ---------------------------------------------------------------- geometry of a valid time */
export function leadDay(validMs, issueMs) { return Math.floor(((validMs - issueMs) / 3600e3 + 12) / 24); }
export function blkOf(tMs) { return Math.floor(((new Date(tMs).getUTCHours() + 5) % 24) / 3); }
export function seasonOf(tMs) { return SEAS[new Date(tMs + PKT).getUTCMonth() + 1]; }
/* cell for lead N: N<=0 none (the chain's live terms stay); 1,2,3,5,7 own; 4 = mean(3,5), 6 = mean(5,7) only if both exist; >7 none */
function cellsFor(W, v, zone, N) {
  const c = (L) => W.cells[`${v}|${zone}|${L}`] || null;
  if (N < 1 || N > 7) return null;
  if (N === 4 || N === 6) { const a = c(N - 1), b = c(N + 1); return a && b ? [a, b] : null; }
  const own = c(N); return own ? [own] : null;
}
function predictLead(W, v, zone, N, x, season, blk, lat, lon) {
  const cs = cellsFor(W, v, zone, N); if (!cs) return null;
  const ps = cs.map((c) => predictCell(c, x, zone, season, blk, lat, lon));
  return ps.every(isN) ? ps.reduce((a, b) => a + b, 0) / ps.length : null;
}
/* v283.40: a lead is shadow when any cell it rests on is a shadow cell (computed and logged, not served) */
function shadowLead(W, v, zone, N) { const cs = cellsFor(W, v, zone, N); return !!(cs && cs.some((c) => c && c.mode === 'shadow')); }
/* v283.40: derived fields from the final values (the formulas Open-Meteo documents for its own fields) */
const satE = (t) => 6.105 * Math.exp(17.27 * t / (237.7 + t));
export function apparentOf(t, rh, wsMs) { if (!isN(t) || !isN(rh) || !isN(wsMs)) return null; return t + 0.33 * (rh / 100) * satE(t) - 0.70 * wsMs - 4.00; }
export function wetBulbOf(t, rh) { if (!isN(t) || !isN(rh)) return null; return t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) + Math.atan(t + rh) - Math.atan(rh - 1.676331) + 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) - 4.686035; }
const toMs = (v, unit) => { if (!isN(v)) return null; const u = String(unit || 'km/h'); return u === 'm/s' ? v : u === 'mp/h' || u === 'mph' ? v * 0.44704 : u === 'kn' ? v * 0.514444 : v / 3.6; };
const rhOf = (t, td) => (isN(t) && isN(td)) ? Math.max(1, Math.min(100, Math.round(100 * Math.exp(17.625 * td / (243.04 + td)) / Math.exp(17.625 * t / (243.04 + t))))) : null;

/* ---------------------------------------------------------------- the module */
export function createMMBlend42(root, { zoneOf, weightOf, note, tehsilPoints = null, sweeps = null, elevOf = null } = {}) {
  let W = null, why = null;
  const wf = join(root, 'data', 'mmblend42-weights.json'), gf = join(root, 'data', 'mmblend42-gate.json');
  try {
    if (process.env.NIGRAAN_MMBLEND42 === '0') why = 'NIGRAAN_MMBLEND42=0';
    else if (!existsSync(wf) || !existsSync(gf)) why = 'no weights / gate file';
    else {
      const raw = readFileSync(wf); const G = JSON.parse(readFileSync(gf, 'utf8'));
      if (createHash('sha256').update(raw).digest('hex') !== G.weightsSha256) why = 'weights sha256 does not match the gate file';
      else W = JSON.parse(raw.toString('utf8'));
    }
  } catch (e) { why = 'weights unreadable: ' + String(e.message).slice(0, 100); W = null; }
  const zonesServed = W ? [...new Set(Object.keys(W.cells).map((k) => k.split('|')[1]))] : [];
  /* what a zone needs: variables and models */
  const need = {};
  if (W) for (const [k, c] of Object.entries(W.cells)) { const [v, z] = k.split('|'); const n = need[z] || (need[z] = { vars: new Set(), models: new Set() }); n.vars.add(VARS_OF[v]); c.members.forEach((m) => n.models.add(m)); }
  /* daily allowance: 4 runs x tehsils of the served zones x the request weight of that zone (provider rule) */
  let allowance = 0;
  try {
    const MZ = JSON.parse(readFileSync(join(root, 'data', 'model-zone.json'), 'utf8')).units || {};
    const cnt = {}; for (const u of Object.values(MZ)) { const z = typeof u === 'string' ? u : (u && u.zone); cnt[z] = (cnt[z] || 0) + 1; }
    for (const z of zonesServed) { const n = need[z]; const w = weightOf ? weightOf((k) => ({ hourly: [...n.vars].join(','), models: [...n.models].join(','), forecast_days: '8', latitude: '0' })[k]) : 1; allowance += 4 * (cnt[z] || 0) * w; }
  } catch (_) { allowance = 0; }
  /* v91.17.283.41 (NIGRAAN 1.0.5) · item 37 · THE CAP FROM CALL ACCOUNTING. 1.0.4 had one pool of 4 runs x the tehsils of the served zones
     x the request weight (4,113 weighted calls a day) while every place that reaches the forecast path draws on it (31 Oct call accounting
     data/quota-callers: the tehsil sweep, the point products, the station pairs - fleet ~2,150 and synop ~950 locations a day - and the
     grids), so the station pairs and grids could spend it before a tehsil run. Now two pools, per day:
       tehsil  MARGIN_T x 4 runs x the tehsil points of each served zone x that zone's request weight: reserved for the tehsil points
               (tehsilPoints(), the served unit coordinates), so every tehsil gets the blend at every run (one fetch per place per 6 h cycle)
       other   MARGIN_O x 4 runs x the distinct non-tehsil places of the served zones seen in the previous PKT day (each place is fetched
               at most once per cycle), at least the station registers of the served zones (MACH fleet + synoptic stations)
     A batch is split by pool; a spent pool keeps the chain for its places only. NIGRAAN_MM42_ALLOWANCE=<n> = one pool of n (as 1.0.4); 'off' = no cap. */
  const MARGIN_T = 1.10, MARGIN_O = 1.25, OTHER_FLOOR = 3300; const zw = {};
  try { for (const z of zonesServed) { const n = need[z]; zw[z] = weightOf ? weightOf((k) => ({ hourly: [...n.vars].join(','), models: [...n.models].join(','), forecast_days: '8', latitude: '0' })[k]) : 1; } } catch (_) {}
  const pools = { split: false, tehsil: 0, other: 0, otherBasis: null, seen: { day: null, places: new Map() }, prevSeen: null, grid: null, area: null, gridBasis: null, areaBasis: null };
  /* r42 · 1.0.6 · THE SWEEPS' OWN POOLS (coordinator decision 1 Nov, owner's delegation; a call-limit change: cells and weights unchanged). The
     server's background sweeps drew on the 'other' pool of the place reads: the hazard-grid build (1,412 points at start and at each cycle
     start) spent it within minutes, so place reads lost the blend for the rest of the day and the same place could show two values. Each
     sweep now has its own pool, from call accounting:
       grid  MARGIN_S x 4 x sum over the grid's land points of their zone's request weight (points outside the served zones weigh 0)
       area  MARGIN_S x 4 x the same over the area pass's points (each tehsil's main settlement, centre, towns); a tehsil point stays on the
             tehsil reserve, as before
     4 = runs per day: the members of a point are fetched at most once per 6-hour cycle (cache by cycle), so 4 is the most a point can draw
     in a day whatever the number of builds (2 scheduled grid cycles + a start-up build; one area pass per model run). The place-read pools
     (tehsil, other) are unchanged. A request is put in a sweep pool only when it carries the server's internal token and the sweep's tag
     (x-agn-internal: hazard-grid | pointstate-area). poolSpent in /api/ops/mm42 says which pool is spent and how many batches it refused. */
  const MARGIN_S = 1.25, RUNS_PER_DAY = 4, SW = { 'hazard-grid': 'G', 'pointstate-area': 'A' };
  const poolSpent = {}; const refuse = (k) => { const x = poolSpent[k] || (poolSpent[k] = { refused: 0, firstAt: null }); x.refused++; if (!x.firstAt) x.firstAt = new Date().toISOString(); };
  function planSweep(key) { const tag = key === 'G' ? 'hazard-grid' : 'pointstate-area'; const fn = sweeps && sweeps[tag]; let L = null; try { L = fn ? fn() : null; } catch (_) { L = null; }
    if (!L || !L.length) return false; const TKp = tkeys(); let w = 0, n = 0, nt = 0; for (const p of L) { if (!isN(p.lat) || !isN(p.lon)) continue; if (TKp && TKp.has(pkey(p.lat, p.lon))) { nt++; continue; }   /* a tehsil point draws on the tehsil reserve */ let e = isN(p.elev) ? p.elev : null; if (e == null && elevOf) { try { e = elevOf(p.lat, p.lon); } catch (_) { e = null; } }
      const z = zoneOf ? zoneOf(p.lat, p.lon, e) : null; if (zonesServed.includes(z)) { w += zw[z] || 1; n++; } }
    const size = MARGIN_S * RUNS_PER_DAY * w, basis = L.length + ' points (' + nt + ' on the tehsil reserve; ' + n + ' others in the served zones, request weight ' + Math.round(w * 10) / 10 + ') x ' + RUNS_PER_DAY + ' runs a day x ' + MARGIN_S + ' margin';
    if (key === 'G') { pools.grid = size; pools.gridBasis = basis; } else { pools.area = size; pools.areaBasis = basis; } return true; }
  let TK = null, tkAt = 0; const tkeys = () => { if (TK && Date.now() - tkAt < 3600e3) return TK; try { const L = tehsilPoints ? tehsilPoints() : null; if (L && L.length) { TK = new Map(); for (const p of L) if (isN(p.lat) && isN(p.lon)) TK.set(`${p.lat.toFixed(3)},${p.lon.toFixed(3)}`, p); tkAt = Date.now(); } } catch (_) {} return TK; };
  function planPools(nowMs) {
    const K = tkeys(); if (!K || !K.size) return false; const byZ = {}; for (const p of K.values()) { const z = zoneOf ? zoneOf(p.lat, p.lon, isN(p.elev) ? p.elev : null) : null; if (zonesServed.includes(z)) byZ[z] = (byZ[z] || 0) + 1; }
    pools.tehsil = MARGIN_T * 4 * Object.entries(byZ).reduce((a, [z, n]) => a + n * (zw[z] || 1), 0);
    let st = 0, stN = 0; try { const pts = []; try { for (const x of JSON.parse(readFileSync(join(root, 'data', 'mach-fleet-stations.json'), 'utf8')).stations || []) pts.push(x); } catch (_) {}
      try { for (const x of Object.values(JSON.parse(readFileSync(join(root, 'data', 'synop-stations.json'), 'utf8')).stations || {})) pts.push(x); } catch (_) {}
      for (const x of pts) { if (!isN(x.lat) || !isN(x.lon)) continue; const z = zoneOf ? zoneOf(x.lat, x.lon, null) : null; if (zonesServed.includes(z)) { st += zw[z] || 1; stN++; } } } catch (_) {}
    let seenW = 0, seenN = 0; if (pools.prevSeen) for (const z of pools.prevSeen.values()) { seenW += zw[z] || 1; seenN++; }
    /* r42 · 1.0.6 (coordinator 1 Nov): the place-read pool is at least OTHER_FLOOR = 3,300 (4 cycles x the 644 weighted calls a cycle measured
       in the simulated day x 1.25, rounded up); the 1.0.5 rule (resized every day) wins when it is larger */
    const rule = MARGIN_O * 4 * Math.max(st, seenW); pools.other = Math.max(OTHER_FLOOR, rule);
    pools.otherBasis = (rule >= OTHER_FLOOR ? '' : 'floor ' + OTHER_FLOOR + ' (4 cycles x 644 measured x 1.25); the daily rule gives ' + Math.round(rule) + ': ') + (seenW > st ? seenN + ' distinct non-tehsil places seen the previous day' : stN + ' stations of the served zones (MACH fleet + synoptic registers)');
    pools.split = true; allowance = pools.tehsil + pools.other + (pools.grid || 0) + (pools.area || 0); return true; }
  /* v283.40 · test and operator knob: NIGRAAN_MM42_ALLOWANCE=<weighted calls a day> replaces the computed allowance; 'off' = no cap (value-comparison runs only) */
  const OV = process.env.NIGRAAN_MM42_ALLOWANCE;
  { const ov = OV; if (ov === 'off') allowance = 0; else if (ov != null && ov !== '' && Number(ov) > 0) allowance = Number(ov); }
  const cache = new Map(); const spent = { day: null, w: 0, calls: 0, failed: 0, capped: 0, wT: 0, wO: 0, cappedT: 0, cappedO: 0, wG: 0, wA: 0, cappedG: 0, cappedA: 0 };   /* v283.40: capped = place batches kept on the chain today because the allowance was spent */
  /* v283.40: shadow cells (computed, logged, not served) and the last application per place */
  const shadowCells = W ? Object.entries(W.cells).filter(([, c]) => c && c.mode === 'shadow').map(([k]) => k) : [];
  const servedCells = W ? Object.keys(W.cells).filter((k) => !shadowCells.includes(k)) : [];
  const lastAt = new Map(); const SH = { buf: [], n: 0, lastFlush: 0, written: 0, err: null };
  const shDir = join(root, '..', 'station-lake', 'archive', 'mm42');
  function shFlush(force) { if (!SH.buf.length || process.env.NIGRAAN_MM42_SHADOWLOG === '0') { SH.buf = []; return; } if (!force && SH.buf.length < 2000 && Date.now() - SH.lastFlush < 10 * 60e3) return;
    const lines = SH.buf.splice(0); SH.lastFlush = Date.now();
    try { mkdirSync(shDir, { recursive: true }); appendGzMember(join(shDir, 'shadow_' + new Date(Date.now() + PKT).toISOString().slice(0, 7) + '.jsonl.gz'), gzipSync(Buffer.from(lines.map((l) => JSON.stringify(l)).join('\n') + '\n'))); SH.written += lines.length; SH.err = null; }
    catch (e) { SH.err = String(e.message).slice(0, 120); } }
  try { const t = setInterval(() => shFlush(false), 10 * 60e3); if (t.unref) t.unref(); process.once && process.once('beforeExit', () => shFlush(true)); } catch (_) {}
  const on = () => !!W && (process.env.NIGRAAN_MMBLEND42 !== '0');
  const pkey = (lat, lon) => `${lat.toFixed(3)},${lon.toFixed(3)}`;
  /* v91.17.283.52 · F1 · the member rows are kept under the coordinate they are FETCHED at (4 decimals, the request below), never the 3-decimal
     place key: two points of one 110 m cell asked together read each other's members, so a place's served value depended on the batch it was
     asked in (and on which point of the cell was asked first). pkey stays the tehsil-reserve / pool key. */
  const mkey = (lat, lon) => `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const cycle = (ms) => Math.floor(ms / CYCLE);

  /* fetch (or reuse) the members for the places; fetchJson(query) -> parsed provider JSON (array for several places) */
  async function prepare(las, los, els, fetchJson, now = Date.now(), ctx = null) {
    if (!on()) return null;
    const day = new Date(now).toISOString().slice(0, 10); if (spent.day !== day) { if (spent.day) pools.prevSeen = pools.seen.places; pools.seen = { day, places: new Map() }; spent.day = day; spent.w = 0; spent.calls = 0; spent.failed = 0; spent.capped = 0; spent.wT = 0; spent.wO = 0; spent.cappedT = 0; spent.cappedO = 0; spent.wG = 0; spent.wA = 0; spent.cappedG = 0; spent.cappedA = 0; for (const k of Object.keys(poolSpent)) delete poolSpent[k]; if (OV == null || OV === '') { try { planPools(now); } catch (_) {} } }
    if (!pools.split && (OV == null || OV === '')) { try { planPools(now); } catch (_) {} }
    const places = las.map((lat, i) => ({ i, lat, lon: los[i], zone: zoneOf ? zoneOf(lat, los[i], els ? els[i] : null) : null })).filter((p) => isN(p.lat) && isN(p.lon) && zonesServed.includes(p.zone));
    if (!places.length) return null;
    const todo = places.filter((p) => { const h = cache.get(mkey(p.lat, p.lon)); return !(h && h.cycle === cycle(now)); });
    const TKs = pools.split ? tkeys() : null;
    const swk = pools.split && ctx && ctx.internal && SW[ctx.tag] ? SW[ctx.tag] : null;   /* r42: the sweep's own pool */
    if (swk && (swk === 'G' ? pools.grid : pools.area) == null) { try { if (planSweep(swk)) allowance = pools.tehsil + pools.other + (pools.grid || 0) + (pools.area || 0); } catch (_) {} }
    const swOk = swk && (swk === 'G' ? pools.grid : pools.area) != null;
    for (const p of todo) { p.pool = TKs && TKs.has(pkey(p.lat, p.lon)) ? 'T' : swOk ? swk : 'O'; if (p.pool === 'O') pools.seen.places.set(pkey(p.lat, p.lon), p.zone); }
    for (const z of zonesServed) for (const pool of (pools.split ? ['T', 'O', 'G', 'A'] : ['all'])) {
      const zp = todo.filter((p) => p.zone === z && (pool === 'all' || p.pool === pool)); if (!zp.length) continue;
      const n = need[z]; const q = { latitude: zp.map((p) => p.lat.toFixed(4)).join(','), longitude: zp.map((p) => p.lon.toFixed(4)).join(','), hourly: [...n.vars].join(','),
        models: [...n.models].join(','), forecast_days: '8', timezone: 'GMT' };
      const w = weightOf ? weightOf((k) => q[k]) : zp.length;
      if (pool === 'all' && allowance > 0 && spent.w + w > allowance) { spent.capped++; continue; }   /* the day's allowance is spent: these places keep the chain */
      if (pool === 'T' && spent.wT + w > pools.tehsil) { spent.capped++; spent.cappedT++; refuse('tehsil'); continue; }
      if (pool === 'O' && spent.wO + w > pools.other) { spent.capped++; spent.cappedO++; refuse('other'); continue; }
      if (pool === 'G' && spent.wG + w > pools.grid) { spent.capped++; spent.cappedG++; refuse('grid'); continue; }
      if (pool === 'A' && spent.wA + w > pools.area) { spent.capped++; spent.cappedA++; refuse('area'); continue; }
      spent.w += w; spent.calls++; if (pool === 'T') spent.wT += w; else if (pool === 'O') spent.wO += w; else if (pool === 'G') spent.wG += w; else if (pool === 'A') spent.wA += w;
      let js = null; try { js = await fetchJson(q, w); } catch (_) { spent.failed++; js = null; }
      try { note && note(w, !!js); } catch (_) {}
      if (!js) continue;
      const arr = Array.isArray(js) ? js : [js];
      zp.forEach((p, k) => { if (arr[k] && arr[k].hourly) cache.set(mkey(p.lat, p.lon), { cycle: cycle(now), at: now, h: arr[k].hourly, models: [...n.models] }); });
      while (cache.size > MM_MAX) cache.delete(cache.keys().next().value);
    }
    const mem = places.map((p) => ({ ...p, rows: (cache.get(mkey(p.lat, p.lon)) || {}).h || null })).filter((p) => p.rows);
    return mem.length ? { mem, issue: now } : null;
  }

  /* members at one UTC hour: {model: value} */
  function membersAt(rows, models, varName, idx) { const x = {}; for (const m of models) { const s = rows[`${varName}_${m}`]; x[m] = s && isN(s[idx]) ? s[idx] : null; } return x; }

  /* apply to one Open-Meteo location object (the chain's corrected answer) */
  function applyOne(o, p, issue) {
    if (!o || !p.rows || !p.rows.time) return 0;
    const z = p.zone, off = (o.utc_offset_seconds || 0) * 1000, models = W ? [...need[z].models] : [];
    const tIdx = new Map(p.rows.time.map((t, i) => [Date.parse(t + (t.length === 16 ? ':00Z' : 'Z')), i]));
    let n = 0, sh = 0; const changed = new Set(), by = {}, shBy = {}; const inc = (o2, v) => { o2[v] = (o2[v] || 0) + 1; };
    const H = o.hourly;
    if (H && Array.isArray(H.time)) {
      for (const [v, key] of Object.entries(OUT_HOURLY)) {
        if (!Array.isArray(H[key]) || !W.cells[`${v}|${z}|1`] && !Object.keys(W.cells).some((k) => k.startsWith(`${v}|${z}|`))) continue;
        H.time.forEach((t, i) => {
          const ms = Date.parse(t + (String(t).length === 16 ? ':00Z' : 'Z')) - off; const j = tIdx.get(ms); if (j == null) return;
          const N = leadDay(ms, issue); const x = membersAt(p.rows, models, VARS_OF[v], j);
          const val = predictLead(W, v, z, N, x, seasonOf(ms), blkOf(ms), p.lat, p.lon);
          if (isN(val) && H[key][i] != null) {
            if (shadowLead(W, v, z, N)) { SH.buf.push({ at: new Date(issue).toISOString(), t: t, v, zone: z, lead: N, lat: +p.lat.toFixed(4), lon: +p.lon.toFixed(4), served: H[key][i], blend: Math.round(val * 10) / 10 }); SH.n++; sh++; inc(shBy, v); return; }   /* v283.40: shadow */
            H[key][i] = Math.round(val * 10) / 10; changed.add(i); n++; inc(by, v); }
        });
      }
    }
    const D = o.daily;
    /* v283.40 · ONE VALUE PER PLACE: a PKT day whose Tmax / Tmin is served from the blend gets it in the daily answer (when the answer is on
       PKT days) AND in the hourly curve: the hourly temperatures of that PKT day are remapped (affine between the day's hourly min and max;
       the other end kept) so the curve's extreme IS the blended value - also in an answer that carries hourly values only, so a section
       that takes the day's min / max from the hours prints the same number as one that reads the daily value */
    const _pkM = new Map(), _peM = new Map();   /* v91.17.283.51 · B1: one date conversion per hour stamp (was one per stamp per day asked) */
    const pkOfHour = (t) => { let r = _pkM.get(t); if (r === undefined) { const ms = Date.parse(t + (String(t).length === 16 ? ':00Z' : 'Z')) - off; r = new Date(ms + PKT).toISOString().slice(0, 10); _pkM.set(t, r); } return r; };
    function remapDay(d, v, target) {
      if (!H || !Array.isArray(H.time) || !Array.isArray(H.temperature_2m)) return false;
      const idx = []; H.time.forEach((t, i) => { if (pkOfHour(t) === d && isN(H.temperature_2m[i])) idx.push(i); }); if (idx.length < 24) return false;
      const vals = idx.map((i) => H.temperature_2m[i]); const lo = Math.min(...vals), hi = Math.max(...vals);
      const nlo = v === 'TN' ? target : lo, nhi = v === 'TX' ? target : hi; if (!(nhi > nlo) || !(hi > lo)) return false;
      idx.forEach((i) => { const y = nlo + (H.temperature_2m[i] - lo) * (nhi - nlo) / (hi - lo); const r = Math.round(y * 10) / 10; if (r !== H.temperature_2m[i]) { H.temperature_2m[i] = r; changed.add(i); } });
      const k = idx.reduce((a, i) => (v === 'TN' ? (H.temperature_2m[i] < H.temperature_2m[a] ? i : a) : (H.temperature_2m[i] > H.temperature_2m[a] ? i : a)), idx[0]); H.temperature_2m[k] = target; changed.add(k);   /* the exact extreme (rounding) */
      return true;
    }
    const HK = { TX: 'temperature_2m', TN: 'temperature_2m', G: 'wind_gusts_10m', R: 'precipitation' };
    /* the hours of a PKT day: for rain the hours ENDING 01:00-24:00 PKT (an hourly amount is the hour before its stamp: the place record's
       one rule, pktday.mjs, and the blend's own day sum); for temperature and gust the stamps 00:00-23:00 PKT */
    const pkEnding = (t) => { let r = _peM.get(t); if (r === undefined) { const ms = Date.parse(t + (String(t).length === 16 ? ':00Z' : 'Z')) - off - 3600e3; r = new Date(ms + PKT).toISOString().slice(0, 10); _peM.set(t, r); } return r; };
    const dayIdx = (d, key) => { if (!H || !Array.isArray(H.time) || !Array.isArray(H[key])) return null; const f = key === 'precipitation' ? pkEnding : pkOfHour; const idx = []; H.time.forEach((t, i) => { if (f(t) === d && isN(H[key][i])) idx.push(i); }); return idx.length >= 24 ? idx : null; };
    function hourExtreme(d, v) { const key = HK[v], idx = dayIdx(d, key); if (!idx) return null; const xs = idx.map((i) => H[key][i]);
      return v === 'TN' ? Math.min(...xs) : v === 'R' ? Math.round(xs.reduce((a, b) => a + b, 0) * 10) / 10 : Math.max(...xs); }
    /* the hourly values of the day made to agree with a served daily gust (max) or rain (sum): gusts scaled so the day's highest hour IS
       the daily value; rain scaled so the hours add up to it (no rain in the hours: spread on the members' own hourly pattern of that day);
       false when that cannot be done (then the day keeps the chain's value, daily and hourly) */
    function syncHourly(d, v, target) {
      const key = HK[v], idx = dayIdx(d, key); if (!idx) return true;
      if (v === 'G') { const hm = Math.max(...idx.map((i) => H[key][i])); if (!(hm > 0)) return false; let k0 = idx[0];
        idx.forEach((i) => { H[key][i] = Math.round(H[key][i] * target / hm * 10) / 10; if (H[key][i] > H[key][k0]) k0 = i; }); H[key][k0] = target; return true; }
      if (v === 'R') { const sum = idx.reduce((a, i) => a + H[key][i], 0); let w = null;
        if (sum > 0) w = idx.map((i) => H[key][i] / sum);
        else if (target > 0) { const prof = idx.map((i) => { const ms = Date.parse(H.time[i] + (String(H.time[i]).length === 16 ? ':00Z' : 'Z')) - off, j = tIdx.get(ms); if (j == null) return 0; const xs = models.map((m) => (p.rows['precipitation_' + m] || [])[j]).filter(isN); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }); const ps = prof.reduce((a, b) => a + b, 0); if (!(ps > 0)) return false; w = prof.map((x) => x / ps); }
        else return true;
        const vals = w.map((x) => Math.round(target * x * 10) / 10); const res = Math.round((target - vals.reduce((a, b) => a + b, 0)) * 10) / 10; let km = 0; vals.forEach((x, k) => { if (x > vals[km]) km = k; }); vals[km] = Math.max(0, Math.round((vals[km] + res) * 10) / 10);
        idx.forEach((i, k) => { H[key][i] = vals[k]; }); return true; }
      return remapDay(d, v, target); }
    function dayBlend(d, v) {
      const d0 = Date.parse(d + 'T00:00:00Z') - PKT; const noon = d0 + 7 * 3600e3 + PKT;   /* 12 PKT */
      const N = leadDay(noon, issue); if (!cellsFor(W, v, z, N)) return null; const x = {};
      for (const m of models) {
        const s = p.rows[`${VARS_OF[v]}_${m}`]; if (!s) { x[m] = null; continue; }
        if (v === 'R') {   /* the 24 hourly amounts of the PKT day */
          let a = 0, ok = true; for (let h = 1; h <= 24; h++) { const j = tIdx.get(d0 + h * 3600e3); if (j == null || !isN(s[j])) { ok = false; break; } a += s[j]; } x[m] = ok ? a : null;
        } else {           /* the 8 three-hourly UTC steps of the PKT day (21 UTC the day before .. 18 UTC) */
          const vals = []; for (let k = 0; k < 8; k++) { const j = tIdx.get(d0 + 2 * 3600e3 + k * 3 * 3600e3); if (j != null && isN(s[j])) vals.push(s[j]); }
          x[m] = vals.length === 8 ? (v === 'TN' ? Math.min(...vals) : Math.max(...vals)) : null;
        }
      }
      const val = predictLead(W, v, z, N, x, seasonOf(noon), 0, p.lat, p.lon);
      return isN(val) ? { val: Math.round(val * 10) / 10, N, shadow: shadowLead(W, v, z, N) } : null;
    }
    const dailyPk = !!(D && Array.isArray(D.time) && off === PKT);   /* the daily arrays are used on PKT days only (the cells were scored on PKT days) */
    for (const [v, key] of Object.entries(OUT_DAILY)) {
      if (!Object.keys(W.cells).some((k) => k.startsWith(`${v}|${z}|`))) continue;
      const hasD = dailyPk && Array.isArray(D[key]), hk = HK[v];
      const dates = new Set(hasD ? D.time : []); if (H && Array.isArray(H.time) && Array.isArray(H[hk])) H.time.forEach((t) => dates.add(hk === 'precipitation' ? pkEnding(t) : pkOfHour(t)));
      for (const d of [...dates].sort()) {
        const i = hasD ? D.time.indexOf(d) : -1; const dv = i >= 0 && D[key][i] != null ? D[key][i] : null;
        if (dv == null && hourExtreme(d, v) == null) continue;
        const b = dayBlend(d, v); if (!b) continue;
        if (b.shadow) { SH.buf.push({ at: new Date(issue).toISOString(), t: d, v, zone: z, lead: b.N, lat: +p.lat.toFixed(4), lon: +p.lon.toFixed(4), served: dv != null ? dv : hourExtreme(d, v), blend: b.val }); SH.n++; sh++; inc(shBy, v); continue; }   /* v283.40: shadow */
        /* the hours first: when they cannot be made to agree, the day keeps the chain's value (daily and hourly) */
        const hasH = !!dayIdx(d, hk); if (hasH && !syncHourly(d, v, b.val)) continue;
        if (dv != null) D[key][i] = b.val;
        if (hasH || dv != null) { n++; inc(by, v); }
      }
    }
    /* v283.40 · derived fields of every changed hour, from the final temperature, dew point and wind */
    if (H && Array.isArray(H.time) && changed.size) {
      const T = H.temperature_2m, Td = H.dew_point_2m, RH = H.relative_humidity_2m, WS = H.wind_speed_10m, AT = H.apparent_temperature, WB = H.wet_bulb_temperature_2m;
      const wu = (o.hourly_units && o.hourly_units.wind_speed_10m) || 'km/h';
      for (const i of changed) {
        if (Array.isArray(RH) && Array.isArray(T) && Array.isArray(Td)) { const r = rhOf(T[i], Td[i]); if (r != null) RH[i] = r; }
        const rh = Array.isArray(RH) ? RH[i] : null;
        if (Array.isArray(AT) && Array.isArray(T) && Array.isArray(WS) && AT[i] != null) { const a = apparentOf(T[i], rh, toMs(WS[i], wu)); if (isN(a)) AT[i] = Math.round(a * 10) / 10; }
        if (Array.isArray(WB) && Array.isArray(T) && WB[i] != null) { const b = wetBulbOf(T[i], rh); if (isN(b)) WB[i] = Math.round(b * 10) / 10; }
      }
      if (D && Array.isArray(D.time) && Array.isArray(AT)) {
        const days = new Set([...changed].map((i) => String(H.time[i]).slice(0, 10)));
        D.time.forEach((d, k) => { if (!days.has(d)) return; const xs = []; H.time.forEach((t, i) => { if (String(t).slice(0, 10) === d && isN(AT[i])) xs.push(AT[i]); }); if (xs.length < 24) return;
          if (Array.isArray(D.apparent_temperature_max) && D.apparent_temperature_max[k] != null) D.apparent_temperature_max[k] = Math.max(...xs);
          if (Array.isArray(D.apparent_temperature_min) && D.apparent_temperature_min[k] != null) D.apparent_temperature_min[k] = Math.min(...xs); });
      }
    }
    /* the place's record of this model cycle: the largest count per variable over the answers of the cycle (the place bundle asks in parts) */
    if (n + sh > 0) try { const k = pkey(p.lat, p.lon), c0 = cycle(issue), r0 = lastAt.get(k), r = r0 && r0.cycle === c0 ? r0 : { cycle: c0, servedBy: {}, shadowBy: {} };
      for (const [v, c] of Object.entries(by)) r.servedBy[v] = Math.max(r.servedBy[v] || 0, c); for (const [v, c] of Object.entries(shBy)) r.shadowBy[v] = Math.max(r.shadowBy[v] || 0, c);
      Object.assign(r, { at: new Date().toISOString(), zone: z, served: Object.values(r.servedBy).reduce((x, y) => x + y, 0), shadow: Object.values(r.shadowBy).reduce((x, y) => x + y, 0), tag: tag() });
      lastAt.delete(k); lastAt.set(k, r); while (lastAt.size > 5000) lastAt.delete(lastAt.keys().next().value); } catch (_) {}
    return n;
  }

  /* post-process the chain's corrected answer {buf, n}: returns the same shape */
  function post(prep) {
    return (r) => {
      if (!prep || !r || !r.buf) return r;
      try {
        const js = JSON.parse(Buffer.isBuffer(r.buf) ? r.buf.toString('utf8') : String(r.buf)); const arr = Array.isArray(js) ? js : [js]; let n = 0;
        for (const p of prep.mem) n += applyOne(arr[p.i], p, prep.issue);
        if (!n) return r;
        return { ...r, buf: Buffer.from(JSON.stringify(js)), mm42: n };
      } catch (_) { return r; }
    };
  }
  function status() { return { on: on(), why, version: W ? W.version : null, cells: W ? Object.keys(W.cells).length : 0, servedCells: servedCells.length, shadowCells: shadowCells.length, zones: zonesServed, allowancePerDay: Math.round(allowance), pools: pools.split ? { tehsil: Math.round(pools.tehsil), other: Math.round(pools.other), otherBasis: pools.otherBasis, marginTehsil: MARGIN_T, marginOther: MARGIN_O, grid: pools.grid == null ? null : Math.round(pools.grid), gridBasis: pools.gridBasis, area: pools.area == null ? null : Math.round(pools.area), areaBasis: pools.areaBasis, marginSweep: MARGIN_S, runsPerDay: RUNS_PER_DAY } : null, spent: { ...spent },
    poolSpent: pools.split ? Object.fromEntries([['tehsil', pools.tehsil, spent.wT], ['other', pools.other, spent.wO], ['grid', pools.grid, spent.wG], ['area', pools.area, spent.wA]].map(([k, size, w]) => [k, { size: size == null ? null : Math.round(size), spentW: Math.round(w * 10) / 10, spent: !!(poolSpent[k] && poolSpent[k].refused), refusedBatches: poolSpent[k] ? poolSpent[k].refused : 0, firstRefusedAt: poolSpent[k] ? poolSpent[k].firstAt : null }])) : null, cached: cache.size, shadowLog: { pending: SH.buf.length, written: SH.written, computed: SH.n, error: SH.err } }; }
  /* v283.40 · one place: its zone, whether its members are held, the cells that apply there (served / shadow), the last application */
  function place(lat, lon, el) { const zone = zoneOf ? zoneOf(lat, lon, el == null ? null : el) : null; const k = mkey(lat, lon), h = cache.get(k);
    return { on: on(), zone, served: servedCells.filter((c) => c.split('|')[1] === zone), shadow: shadowCells.filter((c) => c.split('|')[1] === zone), membersHeld: !!h, membersAt: h ? new Date(h.at).toISOString() : null, last: lastAt.get(pkey(lat, lon)) || null, tag: on() && zonesServed.includes(zone) ? tag() : '' }; }
  function tag() { return on() ? 'mm42:' + (W ? W.version : '') : ''; }
  return { on, prepare, post, status, tag, applyOne, place, flushShadow: () => shFlush(true), need: () => need };
}
