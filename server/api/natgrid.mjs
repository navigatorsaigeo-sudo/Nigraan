/* ══ v91.17.91 · THE HYPERLOCAL TEMPERATURE MAP (the national model on a grid over the map view, current hour) ════════════
   The map asks for its view (south, west, north, east) and a grid size (up to 160 x 160). The server:
     1  places a coarse 7 x 7 set of points over the view (plus a margin) and fetches, through its own proxy:
          T0 and the hour's weather (best_match, __raw), the three other pool members (__raw) and the served chain without
          the national model (__nonat) - three provider calls per view, cached 20 min;
     2  computes the model's weather features at each coarse point for the current hour (natmodel rows(), the same code as
        a point forecast) and interpolates them bilinearly to every grid cell; T0 is interpolated at sea level (6.5 C/km)
        and brought back to each cell's own terrain height (feature grid, 250 m cells);
     3  at every cell: R from the pool-variant trees with the cell's own terrain and land-surface bands, the mountain
        station-bias term, and the blend with the (interpolated) served chain by the cell's zone weight, as a point gets;
        the live MACH layer (hyperlocal.at, interpolated from the coarse points) is added on top.
   The cells are 250 m feature-grid samples at the grid spacing: a cell shows what the model says at its centre. */
import { lgbEval } from './natmodel.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { utci as utciShade } from './utci.mjs';
import { rhFromDew, esatHpa } from './psychro.mjs';
import { join } from 'node:path';

const r1 = (v) => Math.round(v * 10) / 10;
const LAPSE = 0.0065;

const PK = { s: 23.4, w: 60.7, n: 37.3, e: 77.9 }, STEP = 0.08;
const ALLB = () => ['t_elev', 't_slope', 't_aspect_sin', 't_aspect_cos', 't_tpi300', 't_tpi1000', 't_valley_depth', 't_svf', 't_capp', 't_hand', 's_wc_tree', 's_wc_crop', 's_wc_built', 's_wc_bare', 's_wc_water', 's_wc_snow', 's_built10', 'w_dist', 'c_pr_ann', 't_elev_p10', 't_elev_p90',
  ...['s_ndvi', 's_ndmi', 'l_day', 'l_night', 'l_day_anom', 'l_night_anom'].flatMap(p => ['djf', 'mam', 'jja', 'son'].map(q => p + '_' + q)),
  ...Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).flatMap(m => ['c_tmax_' + m, 'c_tmin_' + m])];

export function createNatGrid(app) {
  const cache = new Map();
  /* ══ v91.17.259 · D2/D3 · DEW POINT, HUMIDITY AND SHADE UTCI ON THE 250 m MAP (opt-in: q=moist) ══════════════════════════════
     The point/tehsil dew point model (data/moist-model.json, the zones where it passed its held-out gate) evaluated at every cell with
     the cell's own terrain and land-surface bands and the interpolated weather, exactly as a point gets it (moist.mjs: R capped,
     plains tail map, capped at the cell's final temperature); RH from the cell temperature and dew point (Bolton 1980); UTCI in
     shade (Tmrt = Ta) from the cell temperature, RH and the model's 10 m wind (no wind correction is served anywhere: moist wind
     failed every zone, the valley wind model is off). A cell is filled only in a zone listed as passed in
     data/natgrid-moist-gate.json (the live held-out check, scripts/ds/ds_live_check.mjs + ds_live_gate.py); shadow=1 (this
     computer only) returns every applied zone plus the inputs, for that check. */
  const mfile = join(app.dataDir || 'data', 'moist-model.json'), gfile = join(app.dataDir || 'data', 'natgrid-moist-gate.json');
  let MM = null, MMt = 0, GG = null, GGt = 0, MMc = 0;
  function moistModel() { const now = Date.now(); if (MM && now - MMc < 60e3) return MM; MMc = now;
    try { const t = statSync(mfile).mtimeMs; if (!MM || t !== MMt) { MM = JSON.parse(readFileSync(mfile, 'utf8')); MMt = t; } } catch (_) { MM = null; }
    try { if (existsSync(gfile)) { const t = statSync(gfile).mtimeMs; if (!GG || t !== GGt) { GG = JSON.parse(readFileSync(gfile, 'utf8')); GGt = t; } } else GG = null; } catch (_) { GG = null; }
    return MM; }
  const qmOf = (QZ) => (x) => { if (!QZ || !Array.isArray(QZ.p) || !Array.isArray(QZ.o) || !(QZ.w > 0)) return x; const a = QZ.p, b = QZ.o, n = a.length;
    let y; if (x <= a[0]) y = x + (b[0] - a[0]); else if (x >= a[n - 1]) y = x + (b[n - 1] - a[n - 1]);
    else { let lo = 0, hi = n - 1; while (hi - lo > 1) { const md = (lo + hi) >> 1; if (a[md] <= x) lo = md; else hi = md; } const f = a[hi] > a[lo] ? (x - a[lo]) / (a[hi] - a[lo]) : 0; y = b[lo] + f * (b[hi] - b[lo]); }
    return x + QZ.w * (y - x); };
  /* a whole-country view reads every block of every band: the bands are sampled once on a 0.08 degree lattice (about 9 km,
     finer than a screen pixel at that zoom), kept in memory and on disk (data/cache/natgrid-statics.bin), and used for views
     wider than 3 degrees */
  const CS = { ready: false, building: false, rows: Math.round((PK.n - PK.s) / STEP) + 1, cols: Math.round((PK.e - PK.w) / STEP) + 1, bands: null, vals: null };
  const csFile = () => join(app.dataDir || 'data', 'cache', 'natgrid-statics.bin');
  async function buildStatics() {
    if (CS.ready || CS.building) return; CS.building = true;
    try {
      const B = ALLB(); const n = CS.rows * CS.cols; const f = csFile(); const meta = f + '.json';
      try { const m = JSON.parse(readFileSync(meta, 'utf8')); if (m.rows === CS.rows && m.cols === CS.cols && m.bands.join() === B.join() && m.feat === featStamp()) { const buf = readFileSync(f); CS.vals = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4); CS.bands = B; CS.ready = true; return; } } catch (_) {}
      const vals = new Float32Array(n * B.length).fill(NaN);
      for (let bi = 0; bi < B.length; bi++) {
        for (let r = 0; r < CS.rows; r++) { const la = PK.n - r * STEP; for (let c = 0; c < CS.cols; c++) { const v = app.featGrid.value(B[bi], la, PK.w + c * STEP); if (v != null) vals[(r * CS.cols + c) * B.length + bi] = v; } }
        await new Promise(ok => setImmediate(ok));   /* let requests through between bands */
      }
      CS.vals = vals; CS.bands = B; CS.ready = true;
      try { mkdirSync(join(f, '..'), { recursive: true }); writeFileSync(f, Buffer.from(vals.buffer)); writeFileSync(meta, JSON.stringify({ rows: CS.rows, cols: CS.cols, bands: B, feat: featStamp(), step: STEP, bbox: PK })); } catch (_) {}
    } finally { CS.building = false; }
  }
  const featStamp = () => { try { return (app.featGrid.meta('t_elev') || {}).built || null; } catch (_) { return null; } };
  const csValue = (band, la, lo) => { const r = Math.round((PK.n - la) / STEP), c = Math.round((lo - PK.w) / STEP); if (r < 0 || r >= CS.rows || c < 0 || c >= CS.cols) return null; const bi = CS.bands.indexOf(band); const v = CS.vals[(r * CS.cols + c) * CS.bands.length + bi]; return Number.isNaN(v) ? null : v; };
  setTimeout(() => { buildStatics().catch(() => {}); }, 90e3);
  async function coarse(S, W, N, E, port) {
    const key = [S, W, N, E].map(v => v.toFixed(2)).join(',');
    const hit = cache.get(key); if (hit && Date.now() - hit.at < 20 * 60e3) return hit.v;
    const K = 7, lats = [], lons = [];
    for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) { lats.push(S + (N - S) * i / (K - 1)); lons.push(W + (E - W) * j / (K - 1)); }
    const base = { __omhost: 'api.open-meteo.com', latitude: lats.map(v => v.toFixed(4)).join(','), longitude: lons.map(v => v.toFixed(4)).join(','), forecast_days: '1', past_days: '3', timezone: 'UTC' };
    /* v91.17.283.9 · a refused provider call says why (the page names the reason instead of "No 250 m value here"): the call budget's
       refusal (data/provider-budget.json: the hyperlocal grid is background tier P6) or the provider's own answer */
    const get = async (q) => { const r = await fetch(`http://127.0.0.1:${port}/px/v1/forecast?` + new URLSearchParams({ ...base, ...q }).toString(), { headers: { 'Sec-Fetch-Site': 'same-origin', 'x-agn-internal': 'hyperlocal-grid' } });
      if (!r.ok) { let b = null; try { b = await r.json(); } catch (_) { b = null; }
        const e = new Error('px ' + r.status + (b && b.error ? ' ' + b.error : '')); e.status = r.status;
        e.reason = b && /budget/.test(String(b.error || '')) ? 'budget' : r.status === 429 ? 'quota' : 'provider'; e.why = b && (b.why || b.reason) ? String(b.why || b.reason).slice(0, 300) : null; e.budgetClass = b && b.budgetClass || null; throw e; }
      const j = await r.json(); return Array.isArray(j) ? j : [j]; };
    const [fc, pool, chain] = await Promise.all([
      get({ hourly: 'temperature_2m,dew_point_2m,cloud_cover,wind_speed_10m,wind_direction_10m,shortwave_radiation,precipitation', __raw: '1' }),
      get({ hourly: 'temperature_2m', models: 'icon_seamless,gfs_seamless,meteofrance_seamless', __raw: '1' }),
      get({ hourly: 'temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover,precipitation', __nonat: '1' })]);
    const v = { K, lats, lons, fc, pool, chain };
    cache.set(key, { at: Date.now(), v }); if (cache.size > 40) cache.delete(cache.keys().next().value);
    return v;
  }

  const rcache = new Map(), inflight = new Map();
  async function grid(o) {   /* the answer is kept for the rest of the hour (same view, same size) */
    const key = [o.s, o.w, o.n, o.e].map(v => (+v).toFixed(3)).join(',') + '|' + o.nx + 'x' + o.ny + '|' + new Date().toISOString().slice(0, 13) + '|' + (o.q || '') + (o.shadow ? 's' : '');
    const hit = rcache.get(key); if (hit) return hit;
    /* v91.17.274 · GRID · the same view asked again while it is being worked out waits for that one answer (street-map tiles are
       shared between viewers) */
    if (inflight.has(key)) return inflight.get(key);
    const pr = gridNow(o).then((v) => { if (v && v.ok) { rcache.set(key, v); if (rcache.size > 60) rcache.delete(rcache.keys().next().value); } return v; }).finally(() => inflight.delete(key));
    inflight.set(key, pr); return pr;
  }
  async function gridNow({ s, w, n, e, nx = 120, ny = 120, port = 8787, q = '', shadow = false }) {
    const NA = app.national; if (!NA || !NA.enabled()) return { ok: false, why: 'national model not loaded' };
    if (((n - s) > 3 || (e - w) > 3) && !CS.ready) { buildStatics().catch(() => {}); return { ok: false, preparing: true, why: 'Preparing the whole-country view (about a minute, once).' }; }
    const I = NA.internals, M = I.model(); const V = M.variants.pool;
    nx = Math.max(10, Math.min(160, nx | 0)); ny = Math.max(10, Math.min(160, ny | 0));
    const mS = (n - s) * 0.08, mW = (e - w) * 0.08; const S = s - mS, N = n + mS, W = w - mW, E = e + mW;
    const C = await coarse(S, W, N, E, port);
    /* the current hour's index and the weather feature vector at each coarse point */
    const nowIso = new Date().toISOString().slice(0, 13);
    const feats = [], t0sl = [], chainD = [], live = [];
    const yieldNow = () => new Promise(ok => setImmediate(ok)); const big = nx * ny > 1500;   /* v91.17.274 · GRID · slices (see below) */
    for (let q = 0; q < C.fc.length; q++) {
      if (big && q && (q & 3) === 0) await yieldNow();
      const L = C.fc[q], P = C.pool[q], Ch = C.chain[q]; const H = L && L.hourly; if (!H || !Array.isArray(H.time)) { feats.push(null); t0sl.push(null); chainD.push(null); live.push(0); continue; }
      const k = H.time.findIndex(t => String(t).slice(0, 13) === nowIso); if (k < 0) { feats.push(null); t0sl.push(null); chainD.push(null); live.push(0); continue; }
      const T0 = H.temperature_2m.slice(); const mem = {};
      for (const m of ['icon_seamless', 'gfs_seamless', 'meteofrance_seamless']) mem[m] = P && P.hourly ? P.hourly['temperature_2m_' + m] || null : null;
      const loc = { ...L, hourly: H };
      const { out } = I.rows(loc, C.lats[q], C.lons[q], T0, mem.icon_seamless ? mem : null, 1);
      feats.push(out[k]); t0sl.push(T0[k] == null ? null : T0[k] + LAPSE * (L.elevation || 0));
      const ck = Ch && Ch.hourly ? Ch.hourly.temperature_2m[Ch.hourly.time.findIndex(t => String(t).slice(0, 13) === nowIso)] : null;
      let lv = 0; try { const a = app.hyperlocal && app.hyperlocal.at(C.lats[q], C.lons[q]); if (a && a.applied && Number.isFinite(a.dT)) lv = a.dT; } catch (_) {}
      live.push(lv);
      chainD.push(ck == null || T0[k] == null ? 0 : ck - T0[k] - lv);   /* the chain response already carries the live layer: taken out here, added once below */
    }
    const WEATHER = ['temperature_2m', 'dew_point_2m', 'cloud_cover', 'wind_speed_10m', 'shortwave_radiation', 'precipitation', 'hs', 'hc', 'ds', 'dc', 'dep', 'wds', 'wdc',
      'fc_dtr', 'fc_tmax', 'cc_prev6', 'ws_prev6', 'sw_day', 'pr_prev72', 'dt3', 'd_icon', 'd_gfs', 'd_mf', 'pool_sd'];
    const K = C.K;
    const interp = (arr, la, lo, pick) => {   /* bilinear on the K x K coarse lattice; missing corners fall back to the mean of the others */
      const fi = (la - S) / (N - S) * (K - 1), fj = (lo - W) / (E - W) * (K - 1);
      const i0 = Math.max(0, Math.min(K - 2, Math.floor(fi))), j0 = Math.max(0, Math.min(K - 2, Math.floor(fj))); const di = fi - i0, dj = fj - j0;
      let sw = 0, sv = 0;
      for (const [ii, jj, wt] of [[i0, j0, (1 - di) * (1 - dj)], [i0 + 1, j0, di * (1 - dj)], [i0, j0 + 1, (1 - di) * dj], [i0 + 1, j0 + 1, di * dj]]) {
        const v = pick(arr[ii * K + jj]); if (v == null || !Number.isFinite(v)) continue; sw += wt; sv += wt * v; }
      return sw > 0 ? sv / sw : null;
    };
    const d = new Date(); const pkH = (d.getUTCHours() + 5) % 24; const pk = new Date(d.getTime() + 5 * 3600e3); const mon = pk.getUTCMonth() + 1;
    const ss = I.SEASON[mon], mm = String(mon).padStart(2, '0'), dp = I.dpOf(pkH);
    const out = new Array(nx * ny).fill(null); let mn = 1e9, mx = -1e9;
    const MO = String(q || '').split(',').includes('moist') ? moistModel() : null;
    const MZ = (zone) => { if (!MO || !MO.dew || !MO.dew.model) return null; const z = MO.dew.zones && MO.dew.zones[zone]; if (!z || !z.applied) return null;
      const g = GG && GG.zones && GG.zones[zone]; return { dew: shadow || !!(g && g.dew), utci: shadow || !!(g && g.utci), qm: qmOf(z.qm) }; };
    const TD = MO ? new Array(nx * ny).fill(null) : null, RHo = MO ? new Array(nx * ny).fill(null) : null, UT = MO ? new Array(nx * ny).fill(null) : null;
    const XS = MO && shadow ? { tNoLive: new Array(nx * ny).fill(null), tdRaw: new Array(nx * ny).fill(null), wsMs: new Array(nx * ny).fill(null), zone: new Array(nx * ny).fill(null) } : null;
    let tdMn = 1e9, tdMx = -1e9, uMn = 1e9, uMx = -1e9;
    /* the static bands band by band (block locality: a whole-country view would otherwise re-read the same blocks per cell) */
    const FG = app.featGrid; const BANDS = ['t_elev', 't_slope', 't_aspect_sin', 't_aspect_cos', 't_tpi300', 't_tpi1000', 't_valley_depth', 't_svf', 't_capp', 't_hand', 's_wc_tree', 's_wc_crop', 's_wc_built', 's_wc_bare', 's_wc_water', 's_wc_snow', 's_built10', 'w_dist', 'c_pr_ann', 't_elev_p10', 't_elev_p90',
      ...['s_ndvi', 's_ndmi', 'l_day', 'l_night', 'l_day_anom', 'l_night_anom'].map(p => p + '_' + ss), 'c_tmax_' + mm, 'c_tmin_' + mm];
    const LA = new Float64Array(nx * ny), LO = new Float64Array(nx * ny);
    for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) { LA[r * nx + c] = n - (r + 0.5) * (n - s) / ny; LO[r * nx + c] = w + (c + 0.5) * (e - w) / nx; }
    const wide = (n - s) > 3 || (e - w) > 3;
    if (wide && !CS.ready) { buildStatics().catch(() => {}); return { ok: false, preparing: true, why: 'Preparing the whole-country view (about a minute, once).' }; }
    const val = wide ? csValue : (b, la, lo) => FG.value(b, la, lo);
    /* v91.17.274 · GRID · the work below runs in slices (a turn of the event loop between bands and every 2 rows), so a large view never
       holds other requests for its whole time; the numbers are unchanged */
    const BV = {}; for (const b of BANDS) { const arr = new Array(nx * ny); for (let q = 0; q < nx * ny; q++) arr[q] = val(b, LA[q], LO[q]); BV[b] = arr; if (big) await yieldNow(); }
    const zmemo = new Map();
    const zoneAt = (la, lo, z) => { const k = la.toFixed(2) + ',' + lo.toFixed(2) + ',' + Math.floor(z / 500); if (zmemo.has(k)) return zmemo.get(k); const v = I.zoneOf(la, lo, z); zmemo.set(k, v); return v; };
    for (let r = 0; r < ny; r++) {
      if (big && r && (r & 1) === 0) await yieldNow();
      const la = n - (r + 0.5) * (n - s) / ny;
      for (let c = 0; c < nx; c++) {
        const lo = w + (c + 0.5) * (e - w) / nx; const q = r * nx + c;
        const st = {}; for (const b of BANDS) st[b] = BV[b][q];
        const z = st.t_elev; if (z == null) continue;
        st[''] = 0; for (const p of ['s_ndvi', 's_ndmi', 'l_day', 'l_night', 'l_day_anom', 'l_night_anom']) st[p + '_' + ss] = BV[p + '_' + ss][q];
        const zone = zoneAt(la, lo, z); const Z = zone && M.zones.pool[zone]; if (!Z) continue;
        const tsl = interp(t0sl, la, lo, v => v); if (tsl == null) continue;
        const T0 = tsl - LAPSE * z;
        const f = { lat: la, lon: lo, elev: z, dz_cell: 0 };
        for (const k of WEATHER) f[k] = interp(feats, la, lo, x => x ? x[k] : null);
        /* v91.17.157 · audit: T0 is moved to the cell height by the lapse rate but the dew point was interpolated at the coarse points' heights,
           so the depression fed to the model was biased and could go negative (1,500 m points, 4,000 m cell: dep -1). The coarse points'
           own depression is interpolated and held, so the cell is never supersaturated. */
        f.temperature_2m = T0; if (f.dep != null && Number.isFinite(f.dep)) { f.dep = Math.max(0, f.dep); f.dew_point_2m = T0 - f.dep; } else if (f.dew_point_2m != null) f.dep = Math.max(0, T0 - f.dew_point_2m);
        f.calm_clear = (f.wind_speed_10m == null || f.cloud_cover == null) ? null : ((f.wind_speed_10m < 7 && f.cloud_cover < 30) ? 1 : 0);
        for (const k of ['t_elev', 't_slope', 't_aspect_sin', 't_aspect_cos', 't_tpi300', 't_tpi1000', 't_valley_depth', 't_svf', 't_capp', 't_hand', 's_wc_tree', 's_wc_crop', 's_wc_built', 's_wc_bare', 's_wc_water', 's_wc_snow', 's_built10', 'w_dist', 'c_pr_ann']) f[k] = st[k];
        f.relief = (st.t_elev_p90 ?? 0) - (st.t_elev_p10 ?? 0);
        for (const p of ['s_ndvi', 's_ndmi', 'l_day', 'l_night', 'l_day_anom', 'l_night_anom']) f[p] = st[p + '_' + ss];
        f.c_tmax = st['c_tmax_' + mm]; f.c_tmin = st['c_tmin_' + mm];
        f.capp_cc = (st.t_capp == null || f.calm_clear == null) ? null : st.t_capp * f.calm_clear; f.vd_cc = (st.t_valley_depth == null || f.calm_clear == null) ? null : st.t_valley_depth * f.calm_clear;
        let R = lgbEval(V.mean, V.features.map(k => f[k]));
        if (M.bias && (M.bias.zones || []).includes(zone) && (M.bias.builtMax == null || (st.s_wc_built ?? 0) < M.bias.builtMax)) { const Kb = I.biasAt(la, lo, z); const kv = Kb && Kb[ss + '_' + dp]; if (Number.isFinite(kv)) R += kv; }
        R = Math.max(-(M.capC || 6), Math.min(M.capC || 6, R));   /* v91.17.157 · audit: K before the cap, as on the point path */
        const ch = interp(chainD, la, lo, v => v) || 0; const wz = Z.applied ? Z.w : 0;
        const T = wz * (T0 + R) + (1 - wz) * (T0 + ch) + (interp(live, la, lo, v => v) || 0);
        out[r * nx + c] = r1(T); if (T < mn) mn = T; if (T > mx) mx = T;
        if (MO) { const mz = MZ(zone);
          if (XS) { XS.tNoLive[r * nx + c] = r1(T - (interp(live, la, lo, v => v) || 0)); XS.tdRaw[r * nx + c] = f.dew_point_2m == null ? null : r1(f.dew_point_2m); XS.wsMs[r * nx + c] = f.wind_speed_10m == null ? null : r1(f.wind_speed_10m / 3.6); XS.zone[r * nx + c] = zone; }
          if (mz && mz.dew && f.dew_point_2m != null && Number.isFinite(f.dew_point_2m)) {
            f.rh_fc = Math.max(1, Math.min(100, 100 * esatHpa(f.dew_point_2m) / esatHpa(f.temperature_2m)));
            const Rd = Math.max(-(MO.dew.capC || 15), Math.min(MO.dew.capC || 15, lgbEval(MO.dew.model, MO.features.map(k => f[k]))));
            const td = Math.min(mz.qm(f.dew_point_2m + Rd), T), rh = rhFromDew(T, td);
            TD[r * nx + c] = r1(td); RHo[r * nx + c] = Math.round(rh * 10) / 10; if (td < tdMn) tdMn = td; if (td > tdMx) tdMx = td;
            if (mz.utci && f.wind_speed_10m != null) { const u = utciShade(T, T, f.wind_speed_10m / 3.6, rh); if (u != null && Number.isFinite(u)) { UT[r * nx + c] = r1(u); if (u < uMn) uMn = u; if (u > uMx) uMx = u; } }
          } }
      }
    }
    const res = { ok: true, bbox: [s, w, n, e], nx, ny, hourUtc: nowIso + ':00Z', min: r1(mn), max: r1(mx), t: out, version: M.version,
      note: 'national hyperlocal model at the current hour, blended with the served chain by zone, live MACH layer on top; cell = the model at its centre (250 m terrain)' };
    if (MO) Object.assign(res, { td: TD, rh: RHo, utci: UT, tdMin: tdMn < 1e9 ? r1(tdMn) : null, tdMax: tdMx > -1e9 ? r1(tdMx) : null, utciMin: uMn < 1e9 ? r1(uMn) : null, utciMax: uMx > -1e9 ? r1(uMx) : null,
      moist: { version: MO.version, gate: GG ? { version: GG.version || null, zones: GG.zones || {} } : null, shadow: !!shadow,
        note: 'dew point from the point/tehsil dew model at each cell (zones that passed both its own held-out gate and the 250 m live check); relative humidity from the cell temperature and dew point; UTCI in shade (mean radiant temperature = air temperature) with the model 10 m wind; empty cells: not served there' }, ...(XS ? { inputs: XS } : {}) });
    return res;
  }
  return { grid };
}
