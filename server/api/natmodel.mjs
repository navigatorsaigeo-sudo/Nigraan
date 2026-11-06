/* ══ v91.17.89 · THE NATIONAL HYPERLOCAL MODEL (natmodel.mjs · data/national-model.json, station-lake/scripts/national_final.py) ══════════════
   One residual model for every point in Pakistan, trained on 191 stations of four networks (mountain AWS, synop, PMD AWS,
   MACH siting-corrected), 2024-05 .. 2026-09, target r = observed - T0, T0 = best_match at the point's own height.
     R      LightGBM on 30 m-derived terrain and land-surface bands (feature grid, the cell of the point), seasonal satellite
            bands, monthly climatology, the hour's own weather from T0, and the other pool members when the request carries
            them (zone request: pool variant; plain request: nopool variant)
     serve  T = w x (T0 + R) + (1 - w) x (the served chain), w per zone and variant from the held-out rows; a zone is applied
            only where the blend beat the served chain on held-out stations (spatial blocks x alternate 14-day blocks)
     range  5 % / 95 % quantile models, widened by the held-out conformal amount (90 % interval)
   Applied inside correctLocation, so the fleet's served values (and the live L3 residuals built on them) see the same number
   the page gets. NIGRAAN_NATIONAL=0 turns it off. */
import { capped } from './capcount.mjs';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { esatHpa, ES_A, ES_B } from './psychro.mjs';
import { evalBatch, evalLocal, drive } from './lgbpool.mjs';

const SEASON = { 12: 'djf', 1: 'djf', 2: 'djf', 3: 'mam', 4: 'mam', 5: 'mam', 6: 'jja', 7: 'jja', 8: 'jja', 9: 'son', 10: 'son', 11: 'son' };
const STATIC = ['t_elev', 't_slope', 't_aspect_sin', 't_aspect_cos', 't_tpi300', 't_tpi1000', 't_valley_depth', 't_svf', 't_capp', 't_hand',
  's_wc_tree', 's_wc_crop', 's_wc_built', 's_wc_bare', 's_wc_water', 's_wc_snow', 's_built10', 'w_dist', 'c_pr_ann'];
const SEAS = ['s_ndvi', 's_ndmi', 'l_day', 'l_night', 'l_day_anom', 'l_night_anom'];
const MEMBERS = ['icon_seamless', 'gfs_seamless', 'meteofrance_seamless'];
/* the hourly variables the model reads; the proxy adds any the caller did not ask for and removes them again after */
export const NEED_VARS = ['dew_point_2m', 'cloud_cover', 'wind_speed_10m', 'wind_direction_10m', 'shortwave_radiation', 'precipitation'];
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v))) ? null : Number(v);
const r1 = (v) => Math.round(v * 10) / 10;

/* v91.17.132 · SPEED · the same trees flattened once into typed arrays (exact same arithmetic and branch rules: tested equal to
   the reference walk below on 500 random inputs with missing values, max difference 0). 1.7x faster per evaluation. */
const FLAT = new WeakMap();
function flat(P) { let C = FLAT.get(P); if (C) return C; const T = P.trees; let n = 0; for (const t of T) n += t.f.length;
  const f = new Int32Array(n), l = new Int32Array(n), r = new Int32Array(n), d = new Int8Array(n), mt = new Int8Array(n), th = new Float64Array(n), val = new Float64Array(n), root = new Int32Array(T.length); let o = 0;
  T.forEach((t, k) => { root[k] = o; for (let i = 0; i < t.f.length; i++) { f[o + i] = t.f[i]; th[o + i] = t.t[i] ?? 0; l[o + i] = (t.l[i] ?? 0) + o; r[o + i] = (t.r[i] ?? 0) + o; d[o + i] = t.d[i] === 1 ? 1 : 0; mt[o + i] = t.m[i] || 0; val[o + i] = t.v[i] ?? 0; } o += t.f.length; });
  C = { init: P.init || 0, f, l, r, d, mt, th, val, root }; FLAT.set(P, C); return C; }
export function lgbEval(P, x) {
  if (P && Array.isArray(P.trees)) { const C = flat(P); let s = C.init; const { f, l, r, d, mt, th, val, root } = C;
    for (let k = 0; k < root.length; k++) { let i = root[k];
      while (f[i] >= 0) { let v = x[f[i]]; const m = mt[i]; const miss = v == null || v !== v; let left;
        if (m === 2) left = miss ? d[i] === 1 : v <= th[i];
        else if (m === 1) { if (miss) v = 0; left = Math.abs(v) <= 1e-35 ? d[i] === 1 : v <= th[i]; }
        else { if (miss) v = 0; left = v <= th[i]; }
        i = left ? l[i] : r[i]; }
      s += val[i]; }
    return s; }
  return lgbEvalRef(P, x);
}
export function lgbEvalRef(P, x) {
  let sum = P.init || 0;
  for (const T of P.trees) {
    let i = 0;
    while (T.f[i] >= 0) {
      let v = x[T.f[i]]; const mt = T.m[i]; let left;
      const miss = v == null || Number.isNaN(v);
      if (mt === 2) left = miss ? T.d[i] === 1 : v <= T.t[i];
      else if (mt === 1) { if (miss) v = 0; left = Math.abs(v) <= 1e-35 ? T.d[i] === 1 : v <= T.t[i]; }
      else { if (miss) v = 0; left = v <= T.t[i]; }
      i = left ? T.l[i] : T.r[i];
    }
    sum += T.v[i];
  }
  return sum;
}

/* v91.17.128 · A-03 · one psychrometric module (psychro.mjs, Bolton 1980) */
const esat = esatHpa;
/* v91.17.91 · heat index (US NWS: Rothfusz 1990 regression with the NWS low-humidity and high-humidity adjustments; below
   80 F the Steadman simple form). Categories from data/heat-index.json. Returns C, or null without humidity. */
/* v91.17.127 · A-03 · one heat index for page and server (server/api/heatindex.mjs, the page's NWS method) */
export { heatIndexC } from './heatindex.mjs';
/* dew point from temperature and relative humidity (Magnus form with the Bolton 1980 constants of esatHpa) when the response has no
   dew point; v91.17.147 · audit L4 · RH is capped at 100 % so the dew point never exceeds the air temperature */
const dewOf = (t, rh) => { if (t == null || rh == null || rh <= 0) return null; const g = Math.log(Math.min(100, rh) / 100) + ES_A * t / (ES_B + t); return ES_B * g / (ES_A - g); };

const DEFAULT_HORIZON_H = Number(process.env.NIGRAAN_NATIONAL_HORIZON_H || 156);
export function createNational({ dataDir, featGrid, log = null } = {}) {
  const file = join(dataDir, 'national-model.json');
  let M = null, mtime = 0, err = null;
  const enabled = () => process.env.NIGRAAN_NATIONAL !== '0' && !!model();
  let checkedAt = 0;
  function model() {
    /* v91.17.233 · the file is checked on disk at most every 30 s (the laptop profile: existsSync/statSync on every call, 8 s in 150 s) */ 
    if (M && Date.now() - checkedAt < 30e3) return M; checkedAt = Date.now();
    try {
      if (!existsSync(file)) return null;
      const m = statSync(file).mtimeMs;
      if (!M || m !== mtime) { M = JSON.parse(readFileSync(file, 'utf8')); mtime = m; err = null; }
      return M;
    } catch (e) { err = String(e.message || e); return null; }
  }

  const memo = new Map();
  function statics(lat, lon) {
    const key = Math.floor((37.25 - lat) * 400) + ':' + Math.floor((lon - 60.75) * 400);
    if (memo.has(key)) return memo.get(key);
    const s = {}; for (const b of STATIC) s[b] = featGrid.value(b, lat, lon);
    s.t_elev_p10 = featGrid.value('t_elev_p10', lat, lon); s.t_elev_p90 = featGrid.value('t_elev_p90', lat, lon);
    for (const ss of ['djf', 'mam', 'jja', 'son']) for (const p of SEAS) s[p + '_' + ss] = featGrid.value(p + '_' + ss, lat, lon);
    for (let m = 1; m <= 12; m++) { const mm = String(m).padStart(2, '0'); s['c_tmax_' + mm] = featGrid.value('c_tmax_' + mm, lat, lon); s['c_tmin_' + mm] = featGrid.value('c_tmin_' + mm, lat, lon); }
    memo.set(key, s); if (memo.size > 4096) memo.delete(memo.keys().next().value);
    return s;
  }

  /* the zone of a point: the same rule the training table used (temp_zone_rank.Zoner) is served by mosApi.zoneOfPoint */
  let zoneOf = null;
  const setZoneOf = (fn) => { zoneOf = fn; };

  /* feature rows for every hour of a response. T0 = best_match (the stash mergeZone keeps, or the caller's own series) */
  /* v91.17.231 · untilMs: rows of hours after it are not built (null). A row reads only its own and earlier hours plus whole-series
     aggregates that are computed before the loop, so every row that is built is the same as before. */
  function rows(loc, lat, lon, T0, mem, windK = 1, untilMs = null) {
    const H = loc.hourly, n = H.time.length, off = (loc.utc_offset_seconds || 0) * 1000;
    const elev = num(loc.elevation); const s = statics(lat, lon);
    const pick = (k) => Array.isArray(H[k]) ? H[k] : null;
    /* in a zone request the served dew point / humidity are the members' blend; the model was trained on best_match's own */
    const RH = (mem && mem.__rh) || pick('relative_humidity_2m'), DP = (mem && mem.__dew) || pick('dew_point_2m'), CC = pick('cloud_cover'), WS = pick('wind_speed_10m'), WD = pick('wind_direction_10m'), SW = pick('shortwave_radiation'), PR = pick('precipitation');
    const ts = H.time.map(t => Date.parse(t + 'Z') - off);
    const pk = ts.map(t => new Date(t + 5 * 3600e3));   /* Pakistan clock, as in training */
    const dayKey = pk.map(d => d.toISOString().slice(0, 10));
    const agg = new Map();
    for (let i = 0; i < n; i++) { const v = T0[i]; if (v == null) continue; const a = agg.get(dayKey[i]) || { mx: -1e9, mn: 1e9 }; a.mx = Math.max(a.mx, v); a.mn = Math.min(a.mn, v); agg.set(dayKey[i], a); }
    /* v91.17.90 · night-cooling physics from the series (national_build.py): last-6-h cloud and wind, the day's sunshine total
       (a day the response covers only partly takes the nearest whole day's total), rain of the last 72 h, 3-hour change */
    /* v91.17.235 · each series is converted to numbers once (the laptop profile: rows() 13.5 s of 150 s, most of it converting the same
       values again in every hour's 6- and 72-hour windows); the windows add the same values in the same order, so every sum is the same */
    const NV = (A) => { if (!A) return null; const o = new Array(n); for (let j = 0; j < n; j++) o[j] = num(A[j]); return o; };
    const nRH = NV(RH), nDP = NV(DP), nCC = NV(CC), nWS = NV(WS), nWD = NV(WD), nSW = NV(SW), nPR = NV(PR);
    const roll = (A, k, i, sum) => { if (!A) return null; let s = 0, c = 0; for (let j = Math.max(0, i - k + 1); j <= i; j++) { const v = A[j]; if (v != null) { s += v; c++; } } return c ? (sum ? s : s / c) : null; };
    const swTot = new Map(), swN = new Map();
    if (SW) for (let i = 0; i < n; i++) { const v = nSW[i]; if (v == null) continue; swTot.set(dayKey[i], (swTot.get(dayKey[i]) || 0) + v); swN.set(dayKey[i], (swN.get(dayKey[i]) || 0) + 1); }
    const fullDays = [...swN.entries()].filter(([, c]) => c >= 24).map(([k]) => k).sort();
    const swDay0 = (k) => { if (!SW) return null; if ((swN.get(k) || 0) >= 24) return swTot.get(k); if (!fullDays.length) return null;
      let best = fullDays[0]; for (const d of fullDays) if (Math.abs(Date.parse(d) - Date.parse(k)) < Math.abs(Date.parse(best) - Date.parse(k))) best = d; return swTot.get(best); };
    const swMemo = new Map(); const swDay = (k) => { if (swMemo.has(k)) return swMemo.get(k); const v = swDay0(k); swMemo.set(k, v); return v; };   /* v235 · once per day, not per hour */
    /* v91.17.233 · the place's constant features (terrain, land surface and the two derived terms) live once on a shared prototype
       instead of being copied into every hour's row (the laptop profile: 17 s of 150 s in garbage collection); every feature reads the
       same value as before */
    const SP = Object.fromEntries(STATIC.map(b => [b, s[b]]));
    SP.relief = (s.t_elev_p90 ?? 0) - (s.t_elev_p10 ?? 0); SP.dz_cell = (elev ?? 0) - (s.t_elev ?? elev ?? 0);
    SP.lat = lat; SP.lon = lon; SP.elev = elev;
    /* v91.17.236 · and the month's terms (the season's land-surface values, the month's climate normals) on one prototype per month,
       made when first needed (the cloud profile: a third of rows() was adding these six-plus-two properties to every hour's row) */
    const PM = new Array(13).fill(null);
    const protoOf = (mon) => { let P = PM[mon]; if (P) return P; P = Object.create(SP); const ss = SEASON[mon], mm = String(mon).padStart(2, '0');
      for (const p of SEAS) P[p] = s[p + '_' + ss]; P.c_tmax = s['c_tmax_' + mm]; P.c_tmin = s['c_tmin_' + mm]; PM[mon] = P; return P; };
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = T0[i]; if (t == null || (untilMs != null && ts[i] > untilMs)) { out.push(null); continue; }
      const d = pk[i], lh = d.getUTCHours(), mon = d.getUTCMonth() + 1;
      const doy = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1;
      const td = DP ? nDP[i] : (RH ? dewOf(t, nRH[i]) : null);
      const cc = CC ? nCC[i] : null, ws = WS ? (nWS[i] == null ? null : nWS[i] * windK) : null, wd = WD ? nWD[i] : null;
      const a = agg.get(dayKey[i]);
      const calm = (ws == null || cc == null) ? null : ((ws < 7 && cc < 30) ? 1 : 0);
      const f = Object.create(protoOf(mon));
      f.temperature_2m = t; f.dew_point_2m = td; f.cloud_cover = cc; f.wind_speed_10m = ws; f.shortwave_radiation = SW ? nSW[i] : null; f.precipitation = PR ? nPR[i] : null;
      f.hs = Math.sin(2 * Math.PI * lh / 24); f.hc = Math.cos(2 * Math.PI * lh / 24);
      f.ds = Math.sin(2 * Math.PI * doy / 365.25); f.dc = Math.cos(2 * Math.PI * doy / 365.25);
      f.dep = td == null ? null : t - td; f.wds = wd == null ? null : Math.sin(wd * Math.PI / 180); f.wdc = wd == null ? null : Math.cos(wd * Math.PI / 180);
      f.fc_dtr = a ? a.mx - a.mn : null; f.fc_tmax = a ? a.mx : null; f.calm_clear = calm;
      f.capp_cc = (s.t_capp == null || calm == null) ? null : s.t_capp * calm; f.vd_cc = (s.t_valley_depth == null || calm == null) ? null : s.t_valley_depth * calm;
      const w6 = roll(nWS, 6, i, false);
      f.cc_prev6 = roll(nCC, 6, i, false); f.ws_prev6 = w6 == null ? null : w6 * windK; f.sw_day = swDay(dayKey[i]); f.pr_prev72 = roll(nPR, 72, i, true);
      f.dt3 = (i >= 3 && T0[i - 3] != null) ? t - T0[i - 3] : null;
      if (mem) {
        const m = MEMBERS.map(k => mem[k] ? num(mem[k][i]) : null);
        f.d_icon = m[0] == null ? null : m[0] - t; f.d_gfs = m[1] == null ? null : m[1] - t; f.d_mf = m[2] == null ? null : m[2] - t;
        const all = [t, ...m].filter(v => v != null);
        if (all.length >= 2) { const mu = all.reduce((x, y) => x + y, 0) / all.length; f.pool_sd = Math.sqrt(all.reduce((x, y) => x + (y - mu) ** 2, 0) / (all.length - 1)); } else f.pool_sd = null;
      }
      out.push(f);
    }
    return { out, ts };
  }

  /* v91.17.90 · the neighbour station-bias term (valley cold pools): K(season, part of day) at the point from the stations'
     own remaining error, zero-mean shrinkage; zones listed in the model file (mountain) */
  const kmemo = new Map();
  function biasAt(lat, lon, elev) {
    const B = model() && model().bias; if (!B || !B.stations) return null;
    const key = lat.toFixed(3) + ',' + lon.toFixed(3) + ',' + Math.round(elev || 0); if (kmemo.has(key)) return kmemo.get(key);
    const rad = Math.PI / 180; const acc = {}, wsum = {};
    for (const S of B.stations) {
      const dla = (S.lat - lat) * rad, dlo = (S.lon - lon) * rad;
      const a = Math.sin(dla / 2) ** 2 + Math.cos(lat * rad) * Math.cos(S.lat * rad) * Math.sin(dlo / 2) ** 2; const d = 6371 * 2 * Math.asin(Math.sqrt(a));
      if (d > B.maxkm) continue;
      /* v91.17.157 · audit: a station at the point (< 0.5 km) is left out. Its K value is its out-of-fold error, but the served R is refit
         on all stations, so it has already absorbed most of that station's bias in-sample; adding both double-counted it. Leaving self out
         is the configuration that was tested (national_bias_krige.py, self excluded: mountain 2.01 -> 1.90 C). */
      if (d < 0.5) continue;
      const w = Math.exp(-d / B.L) * (B.Lz ? Math.exp(-Math.abs((S.elev || 0) - (elev || 0)) / B.Lz) : 1);
      for (const [k, v] of Object.entries(S.b)) { acc[k] = (acc[k] || 0) + w * v; wsum[k] = (wsum[k] || 0) + w; }
    }
    const K = {}; for (const k of Object.keys(acc)) K[k] = acc[k] / (wsum[k] + B.lam);
    kmemo.set(key, K); if (kmemo.size > 4096) kmemo.delete(kmemo.keys().next().value);
    return K;
  }
  const dpOf = (lh) => (lh >= 20 || lh <= 5) ? 'n' : (lh >= 9 && lh <= 16) ? 'd' : 't';

  /* the residual (and interval) for every hour; null where the model does not apply */
  const pmemo = new Map(); let pHour = -1;
  const hashArr = (a) => { if (!Array.isArray(a)) return 0; let h = 0; for (let i = 0; i < a.length; i++) h = (h * 31 + Math.round((a[i] == null ? -999 : a[i]) * 10)) | 0; return h; };
  /* v91.17.231 · predictSteps: the same computation as a generator. With A (async) the tree batches go to the worker pool (lgbpool.mjs)
     and the server answers other requests meanwhile; without A every batch is evaluated here. predict() runs it to the end here. */
  function predict(loc, lat, lon, T0, mem, windK = 1) { return drive(predictSteps(loc, lat, lon, T0, mem, windK, false)); }
  function* predictSteps(loc, lat, lon, T0, mem, windK = 1, A = false) {
    const m = model(); if (!m || !loc || !loc.hourly || !Array.isArray(loc.hourly.time)) return null;
    const elev = num(loc.elevation); if (elev == null || !featGrid) return null;
    const zone = zoneOf ? zoneOf(lat, lon, elev) : null; if (!zone) return null;
    const hasMem = !!(mem && MEMBERS.every(k => Array.isArray(mem[k])));
    const tag = hasMem ? 'pool' : 'nopool'; const V = m.variants[tag]; const Z = m.zones[tag] && m.zones[tag][zone];
    if (!V || !Z) return null;
    /* cost: ~70 ms for a 16-day point on one core. Results are memoised (same point, same T0, same members) for 60 min, the
       interval is computed only for responses of up to 72 hours (the only place it is shown), and a request of more than 40
       points (the national sweep) is corrected out to 96 hours, fading from 72 h (horizonH, set by correctResponse). */
    /* v91.17.108 · audit v107 F1, decided by the end-to-end replay (station-lake/scripts/score_replay.py, as-issued forecasts at
       leads 1, 2, 3, 5 days): the residual keeps most of its value to day 5 (mountain MAE 1.93 at day 1, 2.16 at day 5 unfaded,
       2.97 when faded out after 96 h). So it is served at full weight to 132 h (the end of the longest lead tested, day 5) and fades out by 156 h.
       Every product uses this horizon (points and the stored run had it to day 16; the sweep cut it at 96 h). */
    const horizonH = num(loc.__natH) ?? DEFAULT_HORIZON_H;
    /* v91.17.125 · external audit A07 · the key covers every input rows() reads: all hourly variables (dew point, humidity, cloud, wind
       speed and direction, radiation, precipitation...), every pool member including Meteo-France, the time axis and offset, and the
       current hour (the fade depends on the time of the call). Before, a change in dew point, cloud, wind or radiation with the same
       temperatures returned the stale cached residual (up to 1.87 C off in the probe). */
    const hk = Object.keys(loc.hourly).filter(k => Array.isArray(loc.hourly[k])).sort().map(k => k + ':' + hashArr(loc.hourly[k])).join(',');
    const mk = mem ? Object.keys(mem).filter(k => Array.isArray(mem[k])).sort().map(k => k + ':' + hashArr(mem[k])).join(',') : '';
    const key = [lat.toFixed(5), lon.toFixed(5), elev, tag, horizonH, windK, m.version, loc.utc_offset_seconds || 0, loc.hourly.time[0], loc.hourly.time.length, T0.length, hashArr(T0), hk, mk, Math.floor(Date.now() / 3600e3)].join('|');
    const hit = pmemo.get(key); if (hit && Date.now() - hit.at < 60 * 60e3) return hit.v;
    /* rows past the horizon are not read (inH below); one hour of margin for the time this call takes */
    const { out, ts } = rows(loc, lat, lon, T0, hasMem ? mem : null, windK, horizonH == null ? null : Date.now() + (horizonH + 1) * 3600e3);
    if (A) yield 'nat-rows';   /* a turn for other requests between building the rows and evaluating them */
    const cap = m.capC || 6, now = Date.now(), wantRange = T0.length <= 168;
    /* the station-bias term only at rural cells (built share under bias.builtMax): at town and airport sites the mountain AWS
       network's own error did not transfer (held-out synop 2.38 -> 2.44 C ungated) */
    const builtOk = !(m.bias && m.bias.builtMax != null) || ((statics(lat, lon).s_wc_built ?? 0) < m.bias.builtMax);
    const K = (m.bias && (m.bias.zones || []).includes(zone) && builtOk) ? biasAt(lat, lon, elev) : null;
    const kAt = (i) => { if (!K) return 0; const d = new Date(ts[i] + 5 * 3600e3); const v = K[SEASON[d.getUTCMonth() + 1] + '_' + dpOf(d.getUTCHours())]; return Number.isFinite(v) ? v : 0; };
    const inH = (i) => horizonH == null || (ts[i] - now) <= (horizonH) * 3600e3;
    /* the rows to evaluate (in the horizon) and, of those, the rows whose 90 % range is read */
    const idx = [], rng = [];
    for (let i = 0; i < out.length; i++) { const f = out[i]; if (!f || !inH(i)) continue; idx.push(i);
      if (wantRange && (ts[i] - now) <= 96 * 3600e3) rng.push(i); }   /* v91.17.132 · the 90 % range is read up to day 3 (point engine 3 calendar days, national run leads 0-72 h, forward test days 0-2); beyond 96 h it was computed and never read */
    const X = idx.map((i) => V.features.map(c => out[i][c])), XR = rng.map((i) => X[idx.indexOf(i)]);
    const spec = (k) => ({ file, path: ['variants', tag, k], version: m.version });
    const batch = function* (k, rows) { if (!rows.length) return []; if (A) { const r = yield evalBatch(spec(k), rows); if (r) return Array.from(r); } return evalLocal(V[k], rows); };
    const vMean = yield* batch('mean', X), vLo = yield* batch('q05', XR), vHi = yield* batch('q95', XR);
    const at = new Map(idx.map((i, j) => [i, j])), atR = new Map(rng.map((i, j) => [i, j]));
    const R = [], lo = [], hi = [], fade = [];
    for (let i = 0; i < out.length; i++) {
      if (!at.has(i)) { R.push(null); lo.push(null); hi.push(null); fade.push(0); continue; }
      const kb = kAt(i); R.push(capped('national.R', vMean[at.get(i)] + kb, cap));
      const j = atR.get(i);
      lo.push(j != null ? vLo[j] + kb - (Z.widenC || 0) : null); hi.push(j != null ? vHi[j] + kb + (Z.widenC || 0) : null);
      const hAhead = (ts[i] - now) / 3600e3; fade.push(horizonH == null ? 1 : Math.max(0, Math.min(1, (horizonH - hAhead) / 24)));
    }
    const v = { zone, tag, Z, R, lo, hi, ts, fade, stationBias: !!K };
    /* v91.17.236 · the key holds the clock hour, so at a new hour every older entry can no longer be hit: they are dropped then rather
       than kept to the 3000-entry limit (memory: the laptop heap was 900 MB) */
    { const hb = Math.floor(Date.now() / 3600e3); if (hb !== pHour) { pmemo.clear(); pHour = hb; } }
    pmemo.set(key, { at: Date.now(), v }); if (pmemo.size > 3000) pmemo.delete(pmemo.keys().next().value);
    return v;
  }

  /* v91.17.93 · the plains tail table (month -> [p95, p99] of the chain), re-read at most once a minute */
  let TAIL = null, tailAt = 0;
  const tailRow = (ms) => { if (Date.now() - tailAt > 60000) { tailAt = Date.now(); try { const f = join(dataDir, 'national-tail.json'); TAIL = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; } catch (_) { TAIL = null; } }
    const z = TAIL && TAIL.zones && TAIL.zones.plains; if (!z || ms == null) return null; return z[String(new Date(ms).getUTCMonth() + 1)] || null; };
  /* v91.17.283.6 · item 5 · ABOVE THE HIGHEST TRAINING STATION. The residual trees return the top of their training set above it, and the
     leave-band-out test (scripts/gen/sci/h5_height_range_test.py on cand_height.json) measured the current model too warm there. A point more
     than data/height-extrapolation.json marginM above the highest training station (read from this model file, bias.stations) is labelled
     lower confidence with that measured bias; its 90 % range is widened on the cold side only when the file says the widening passed its
     held-out test (widen.serve). The central value is never changed here. */
  let HX = null, HXm = -1; const heightX = () => { try { const f = join(dataDir, 'height-extrapolation.json'); if (!existsSync(f)) return null; const t = statSync(f).mtimeMs; if (t !== HXm) { HX = JSON.parse(readFileSync(f, 'utf8')); HXm = t; } return HX; } catch (_) { return null; } };
  let TOPv = null, TOP = null; const topStationM = () => { const m = model(); if (!m) return null; if (TOPv !== m.version) { TOPv = m.version; const st = (m.bias && Array.isArray(m.bias.stations)) ? m.bias.stations : []; const z = st.map((x) => Number(x.elev)).filter(Number.isFinite); TOP = z.length ? Math.max(...z) : null; } return TOP; };
  function heightNote(elevM) {
    const X = heightX(), top = topStationM(), el = num(elevM); if (!X || top == null || el == null || !Number.isFinite(Number(X.marginM)) || !(el > top + Number(X.marginM))) return null;
    const B = X.warmBiasC || {}, W = X.widen || {}, f1 = (v) => (Math.round(v * 10) / 10).toFixed(1), th = (v) => Math.round(v).toLocaleString('en-US');
    const wide = W.serve === true && Number.isFinite(Number(W.lowerC)) && Number(W.lowerC) > 0;
    return { confidence: 'lower', topStationM: top, aboveTopM: Math.round(el - top), widened: wide, widenLowerC: wide ? Number(W.lowerC) : 0, warmBiasC: B.mean ?? null, warmBiasCi95: B.ci95 || null, source: 'data/height-extrapolation.json ' + (X.version || ''),
      label: 'Lower confidence: this point is ' + th(el - top) + ' m above the highest station the temperature model was trained on (' + th(top) + ' m). At held-out stations above the training ceiling the model ran ' + f1(B.mean) + ' °C too warm on average (95 % interval ' + f1(B.ci95[0]) + ' to ' + f1(B.ci95[1]) + ' °C)'
        + (wide ? '; the 90 % range is widened by ' + f1(W.lowerC) + ' °C on the cold side.' : '; the 90 % range shown is the model\'s own and may be too narrow on the cold side (a wider range did not pass its held-out test).') };
  }
  /* apply to a location already carrying the served chain in hourly.temperature_2m. T0 / mem come from the caller. */
  function apply(loc, lat, lon, T0, mem, windK = 1, opts = {}) { return drive(applySteps(loc, lat, lon, T0, mem, windK, opts, false)); }
  function* applySteps(loc, lat, lon, T0, mem, windK = 1, opts = {}, A = false) {
    if (!enabled() || !T0) return false;
    const H = loc.hourly; if (!H || !Array.isArray(H.temperature_2m)) return false;
    const P = yield* predictSteps(loc, lat, lon, T0, mem, windK, A); if (!P) return false;
    const w = (P.Z.applied && !opts.rangeOnly) ? P.Z.w : 0;   /* v91.17.139 · rangeOnly: an adopted synop site's calibration serves alone */
    const before = H.temperature_2m.slice();
    let n = 0, sum = 0; const lo = [], hi = [];
    for (let i = 0; i < before.length; i++) {
      if (P.R[i] == null || before[i] == null || T0[i] == null) { lo.push(null); hi.push(null); continue; }
      const nat = T0[i] + P.R[i]; const wi = w * (P.fade ? P.fade[i] : 1);
      if (wi > 0) { let v = wi * nat + (1 - wi) * before[i];
        /* v91.17.93 · plains hot tail: the blend is not allowed to pull the hottest hours below the chain (data/national-tail.json) */
        const tq = P.zone === 'plains' ? tailRow(P.ts[i]) : null;
        if (tq && before[i] > v) { const f = Math.max(0, Math.min(1, (before[i] - tq[0]) / Math.max(0.1, tq[1] - tq[0]))); v += (before[i] - v) * f; }
        sum += v - before[i]; n++; H.temperature_2m[i] = r1(v); }
      /* the interval is centred on what is served: the national spread, moved to the served value */
      const sv = H.temperature_2m[i];
      if (P.lo[i] != null && P.hi[i] != null) { lo.push(r1(sv - (nat - (T0[i] + P.lo[i])))); hi.push(r1(sv + ((T0[i] + P.hi[i]) - nat))); } else { lo.push(null); hi.push(null); }
    }
    /* v91.17.91 · humidity follows the corrected temperature at the same dew point (the air's moisture is not changed by
       moving the temperature): RH' = RH x es(T_before) / es(T_after) */
    if (Array.isArray(H.relative_humidity_2m)) for (let i = 0; i < before.length; i++) { const rh = H.relative_humidity_2m[i];
      if (rh != null && before[i] != null && H.temperature_2m[i] != null && H.temperature_2m[i] !== before[i]) H.relative_humidity_2m[i] = Math.max(1, Math.min(100, Math.round(rh * esat(before[i]) / esat(H.temperature_2m[i])))); }
    if (Array.isArray(H.apparent_temperature)) for (let i = 0; i < before.length; i++) if (H.apparent_temperature[i] != null && before[i] != null && H.temperature_2m[i] != null) H.apparent_temperature[i] = r1(H.apparent_temperature[i] + (H.temperature_2m[i] - before[i]));
    /* daily extremes follow the hourly change of that day's max and min (whole days only) */
    const Dd = loc.daily, off = (loc.utc_offset_seconds || 0) * 1000;
    if (w > 0 && Dd && Array.isArray(Dd.time)) {
      const byDay = new Map();
      H.time.forEach((t, i) => { const k = String(t).slice(0, 10); const a = byDay.get(k) || { b: [], a: [] }; if (before[i] != null && H.temperature_2m[i] != null) { a.b.push(before[i]); a.a.push(H.temperature_2m[i]); } byDay.set(k, a); });
      Dd.time.forEach((d, j) => {
        const a = byDay.get(String(d).slice(0, 10)); if (!a || a.b.length < 24) return;
        if (Array.isArray(Dd.temperature_2m_max) && Dd.temperature_2m_max[j] != null) Dd.temperature_2m_max[j] = r1(Dd.temperature_2m_max[j] + Math.max(...a.a) - Math.max(...a.b));
        if (Array.isArray(Dd.temperature_2m_min) && Dd.temperature_2m_min[j] != null) Dd.temperature_2m_min[j] = r1(Dd.temperature_2m_min[j] + Math.min(...a.a) - Math.min(...a.b));
      });
    }
    /* current: the change of the hour it falls in */
    const C = loc.current;
    if (w > 0 && C && C.temperature_2m != null && C.time) {
      const tc = Date.parse(C.time + 'Z') - off; let k = -1, best = 1e18;
      P.ts.forEach((t, i) => { const d = Math.abs(t - tc); if (d < best) { best = d; k = i; } });
      if (k >= 0 && best <= 3600e3 && before[k] != null && H.temperature_2m[k] != null) { const t0c = C.temperature_2m; C.temperature_2m = r1(C.temperature_2m + (H.temperature_2m[k] - before[k])); if (C.relative_humidity_2m != null && C.temperature_2m !== t0c) C.relative_humidity_2m = Math.max(1, Math.min(100, Math.round(C.relative_humidity_2m * esat(t0c) / esat(C.temperature_2m))));
        /* v91.17.147 · audit M5 · 'feels like now' moves with the corrected temperature, as the hourly values do */
        if (C.apparent_temperature != null) C.apparent_temperature = r1(C.apparent_temperature + (C.temperature_2m - t0c)); }
    }
    if (process.env.NIGRAAN_NATIONAL_DEBUG === '1') loc.agn_national_debug = { R: P.R, T0, before, rows: rows(loc, lat, lon, T0, mem && MEMBERS.every(k => Array.isArray(mem[k])) ? mem : null).out };
    Object.defineProperty(H, 'agn_range90', { value: { lo, hi }, enumerable: false, configurable: true });
    /* v91.17.280 · FIX280-1 · the served value each interval was centred on: later chain stages (weather MOS, synoptic running
       correction, live stations, final corrections) move the temperature after this point, and the interval is moved with them
       (verification.mjs servedChainSteps, recentreRange90), so every hour keeps its own national spread around what is served */
    Object.defineProperty(H, '__natSv', { value: H.temperature_2m.slice(), enumerable: false, configurable: true, writable: true });
    loc.agn_national = { applied: w > 0, version: model().version, zone: P.zone, variant: P.tag, weight: w, stationBias: P.stationBias, hours: n,
      meanChangeC: n ? r1(sum / n) : 0, label: model().label, tier: model().tier,
      range90: before.length <= 168 ? { lo, hi } : null, horizonH: num(loc.__natH), note: w > 0 ? null : (opts.rangeOnly ? 'station site: its own calibration serves the value; range only' : 'held-out test did not beat the served chain in this zone; range only') };
    { let hx = null; try { hx = heightNote(loc.elevation); } catch (_) { hx = null; } if (hx) loc.agn_national.heightExtrapolation = hx; }   /* v91.17.283.6 item 5 */
    return w > 0;
  }

  function point(lat, lon, elevM) {
    const m = model(); if (!m) return { ok: false, why: err || 'no national-model.json' };
    const zone = zoneOf ? zoneOf(lat, lon, elevM) : null;
    return { ok: true, version: m.version, zone, settings: { pool: m.zones.pool && m.zones.pool[zone], nopool: m.zones.nopool && m.zones.nopool[zone] }, statics: statics(lat, lon) };
  }
  function status() {
    const m = model(); if (!m) return { ok: false, why: err || 'no national-model.json', enabled: false };
    return { ok: true, enabled: enabled(), version: m.version, built: m.built, training: m.training, evaluation: m.evaluation, zones: m.zones, method: m.method };
  }
  /* self-check: the exported trees reproduce the python predictions */
  function selfcheck() {
    const m = model(); if (!m) return null; const res = [];
    for (const [tag, V] of Object.entries(m.variants)) for (const s of V.selfcheck || []) {
      const x = V.features.map(c => s.x[c]);
      res.push({ tag, zone: s.zone, dMean: Math.abs(lgbEval(V.mean, x) - s.mean), dQ05: Math.abs(lgbEval(V.q05, x) - s.q05), dQ95: Math.abs(lgbEval(V.q95, x) - s.q95) });
    }
    return res;
  }
  /* v91.17.155 · the trees are flattened on first use (about 0.3 s); done once after start-up so the first served place does not wait */
  function warm() { try { const m = model(); if (!m || !m.variants) return false; for (const V of Object.values(m.variants)) for (const k of ['mean', 'q05', 'q95']) if (V && V[k] && Array.isArray(V[k].trees)) flat(V[k]); return true; } catch (_) { return false; } }
  return { enabled, apply, applySteps, predict, point, status, selfcheck, setZoneOf, warm, needVars: () => NEED_VARS.slice(), heightNote, topStationM,
    internals: { rows, statics, biasAt, model, zoneOf: (la, lo, e) => zoneOf ? zoneOf(la, lo, e) : null, dpOf, SEASON } };
}
