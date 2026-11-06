/* v91.17.270 · B2 / B3 / B5 · TEMPERATURE AND DEW-POINT DOWNSCALING (physics terms, fitted offline) · OFF BY DEFAULT.
   What it does, when switched on (NIGRAAN_TDOWN=1) AND only in a zone listed in data/tdown-b2.json servedZones (a zone is listed only
   when every gate line passed: nig/ds2/b2_fit.py): the hourly 2 m temperature (and dew point) of a forecast answer becomes
        start + c0 + sum_k c_k x_k + S(place)
   start = the provider's value at the point height (its standard -6.5 C/km from the model grid; dew point: the model's), x_k the
   physics terms computed from the answer's own pressure-level profile and radiation and the place's static bands, c_k the fitted
   coefficients of the place's zone x season x day/night cell, S the one height-aware station correction
   (sum_i w_i r_i / (sum_i w_i + kappa), w_i = exp(-d_i/Ld - |z - z_i|/Lz) over the fitted station residuals).
   Terms (nig/ds2/b2_table.py, the same formulas):
     live   T_prof(z_place) - T_prof(z_grid): the pressure levels above the model ground (p < surface pressure), linear in height,
            end layers extrapolated with their own gradient; dz_l / dz_n: (z_place - z_grid)/1000 with / without a free-air profile;
     sfc    (theta(lowest level above ground) - theta(2 m)) x dz / 1000 where fewer than 2 levels are above ground;
     cp     valley depth (t_valley_depth / 100) x max(0, that theta excess) x (1 - cloud) exp(-U10 / U0)          (cold pooling)
     sun    (1 - albedo) x (min(B rb, S0/r^2 x lit incidence) - B + D (Vd - 1) + albedo (B + D)(1 - Vd)) / 1000   (sun on slope;
            rb from NOAA solar position, the 16 horizon bands and the slope; Vd Dozier & Frew; sunterrain.mjs)
     alb, lst, smsw, sm, ndvi, bu, coast: surface terms (albedo x SW, LST anomaly, soil moisture x SW and alone, NDVI x SW, built-up
            x SW by day / x clear-calm at night, exp(-coast_km / Lc) x SW by day / x clear-calm at night)
   Inputs it needs in the answer's hourly block: temperature_2m, dew_point_2m, surface_pressure, cloud_cover, wind_speed_10m (km/h),
   shortwave_radiation, direct_radiation, diffuse_radiation, soil_moisture_0_to_10cm and temperature / geopotential_height /
   relative_humidity at 1000 975 950 925 900 850 800 700 hPa (REQUEST_VARS), plus the model grid height (loc.__zGrid, or the answer's
   own when it was asked with elevation=nan). Any of them missing: the answer is left as it is (agn_tdown.why says what was missing).
   Light: per place the static bands, sky view and station correction are looked up once (cached); per hour a few dozen multiplies
   and, by day where the sun term is kept, 12 solar positions (tests270: < 1 ms per place for 8 days).
   Operator-only provenance (agn_tdown); no station names leave the server. */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cosIncidence, horizonAt, skyView, sunTerms, refractionDeg } from './sunterrain.mjs';

export const LEVELS = [1000, 975, 950, 925, 900, 850, 800, 700];
export const REQUEST_VARS = ['temperature_2m', 'dew_point_2m', 'surface_pressure', 'cloud_cover', 'wind_speed_10m', 'shortwave_radiation', 'direct_radiation',
  'diffuse_radiation', 'soil_moisture_0_to_10cm', ...['temperature', 'geopotential_height', 'relative_humidity'].flatMap((v) => LEVELS.map((p) => `${v}_${p}hPa`))];
const FEAT = ['live', 'dz_l', 'dz_n', 'sfc', 'cp', 'sun', 'alb', 'lst', 'smsw', 'sm', 'ndvi', 'bu', 'coast'];
const GAMMA_D = 0.0098, S0 = 1361.0, D2R = Math.PI / 180;
const SEASON = ['DJF', 'DJF', 'MAM', 'MAM', 'MAM', 'JJA', 'JJA', 'JJA', 'SON', 'SON', 'SON', 'DJF'];   // by UTC month index 0..11
const SK = { DJF: 'djf', MAM: 'mam', JJA: 'jja', SON: 'son' }, NK = { DJF: 'djf', SON: 'djf', MAM: 'jja', JJA: 'jja' };
const HZ = Array.from({ length: 16 }, (_, i) => 'hz_' + String(Math.floor(i * 22.5)).padStart(3, '0'));

const hav = (a1, o1, a2, o2) => { const p = D2R, x = Math.sin((a2 - a1) * p / 2) ** 2 + Math.cos(a1 * p) * Math.cos(a2 * p) * Math.sin((o2 - o1) * p / 2) ** 2; return 2 * 6371000 * Math.asin(Math.sqrt(Math.min(1, x))); };
export const magnusTd = (T, RH) => { const r = Math.min(100, Math.max(0.1, RH)); const g = Math.log(r / 100) + 17.625 * T / (243.04 + T); return 243.04 * g / (17.625 - g); };

/* height interpolation over the valid levels (ascending Z): linear inside, end layers extrapolated with their own gradient */
export function tProf(z, Z, T) {
  const n = Z.length; if (n < 2) return null;
  for (let k = 0; k < n - 1; k++) if (z >= Z[k] && z <= Z[k + 1]) return T[k] + (T[k + 1] - T[k]) * (z - Z[k]) / (Z[k + 1] - Z[k]);
  if (z < Z[0]) return T[0] + (T[1] - T[0]) / (Z[1] - Z[0]) * (z - Z[0]);
  return T[n - 1] + (T[n - 1] - T[n - 2]) / (Z[n - 1] - Z[n - 2]) * (z - Z[n - 1]);
}

/* the profile terms of one hour: {liveOk, dLive, tdLive, dth, dthTd} (b2_table.py, the same order of operations).
   h: {t2, td2, sp, T: [8], Z: [8], RH: [8]} (levels 1000 .. 700 hPa) */
export function profileTerms(h, zst, zg) {
  const Z = [], T = [], TD = [];
  for (let k = 0; k < LEVELS.length; k++) { const t = h.T[k], z = h.Z[k], rh = h.RH[k];
    if (t == null || z == null || !(LEVELS[k] < h.sp) || !(z > zg)) continue; Z.push(z); T.push(t); TD.push(rh == null ? null : magnusTd(t, rh)); }
  const liveOk = Z.length >= 2;
  let dLive = 0, tdLive = 0, dth = 0, dthTd = 0;
  if (liveOk) { dLive = tProf(zst, Z, T) - tProf(zg, Z, T); tdLive = TD.every((x) => x != null) ? tProf(zst, Z, TD) - tProf(zg, Z, TD) : 0; }
  if (Z.length >= 1 && Z[0] > zg + 2) { dth = (T[0] - h.t2) + GAMMA_D * (Z[0] - (zg + 2)); dthTd = TD[0] == null || h.td2 == null ? 0 : TD[0] - h.td2; }
  return { liveOk, dLive, tdLive, dth, dthTd };
}
const colsOf = (H) => ({ T: LEVELS.map((p) => H[`temperature_${p}hPa`] || []), Z: LEVELS.map((p) => H[`geopotential_height_${p}hPa`] || []),
  RH: LEVELS.map((p) => H[`relative_humidity_${p}hPa`] || []) });

/* v91.17.271 · operator-only provenance: on the answer object but not serialised to customers (enumerable only when the chain is asked to record, as agn_chain) */
const prov = (loc, k, v, rec) => { try { Object.defineProperty(loc, k, { value: v, enumerable: !!rec, configurable: true, writable: true }); } catch (_) {} };
export function createTdown({ dataDir, featGrid = null, log = null } = {}) {
  const file = join(dataDir, 'tdown-b2.json'); let M = null, mt = 0, at = 0, err = null;
  const on = () => process.env.NIGRAAN_TDOWN === '1';
  function model() { if (M && Date.now() - at < 30e3) return M; at = Date.now();
    try { if (!existsSync(file)) { M = null; return null; } const t = statSync(file).mtimeMs; if (!M || t !== mt) { M = JSON.parse(readFileSync(file, 'utf8')); mt = t; err = null; PLACE.clear(); } return M; }
    catch (e) { err = e.message; return null; } }
  const PLACE = new Map();
  const band = (b, la, lo) => { try { return featGrid ? featGrid.value(b, la, lo) : null; } catch (_) { return null; } };
  /* static terms of a place: bands, sky view, station correction per season|daynight and target (cached) */
  function place(m, la, lo, z) {
    const k = la.toFixed(4) + ',' + lo.toFixed(4) + ',' + Math.round(z); const hit = PLACE.get(k); if (hit) return hit;
    const hz = HZ.map((b) => band(b, la, lo)); const sl = (band('t_slope', la, lo) || 0) * D2R, e = band('t_aspect_sin', la, lo) || 0, n = band('t_aspect_cos', la, lo) || 0;
    const vd = hz.some((x) => x != null) ? skyView(hz, sl, e, n).vd : (band('r_vd', la, lo) ?? 1);
    const P = { hz, hz0: hz.map((x) => x ?? 0), sl, e, n, vd, vdepth: (band('t_valley_depth', la, lo) ?? 0) / 100, built: band('s_wc_built', la, lo) ?? 0, coastKm: band('f_coast_km', la, lo) ?? 100, alb: {}, lday: {}, lnight: {}, ndvi: {}, S: {} };
    for (const s of ['DJF', 'MAM', 'JJA', 'SON']) { P.alb[s] = band('a_alb_' + SK[s], la, lo) ?? 0.2; P.lday[s] = band('l_day_anom_' + SK[s], la, lo) ?? 0; P.lnight[s] = band('l_night_anom_' + SK[s], la, lo) ?? 0; P.ndvi[s] = band('s_ndvi_' + NK[s], la, lo) ?? 0; }
    for (const tg of ['t', 'td']) { const C = m[tg] && m[tg].stationCorrection; if (!C) continue; const S = {}, W = {};
      for (const st of C.stations) { const w = Math.exp(-hav(la, lo, st.lat, st.lon) / C.Ld - Math.abs(z - st.z) / C.Lz); if (!(w > 0)) continue;
        for (const [g, r] of Object.entries(st.r)) { S[g] = (S[g] || 0) + w * r; W[g] = (W[g] || 0) + w; } }
      P.S[tg] = Object.fromEntries(Object.keys(S).map((g) => [g, S[g] / (W[g] + C.kappa)])); }
    if (PLACE.size > 5000) PLACE.clear(); PLACE.set(k, P); return P;
  }
  /* the feature vectors of one hour (FEAT order) for T and Td (one profile pass); rbc caches the hour-end sun factors of a place */
  /* sunterrain.solarPosition with the slowly varying terms (declination, equation of time, earth-sun distance) taken once per hour,
     at the hour's middle (they move < 0.02 deg / 0.01 min within an hour); the hour angle, zenith, azimuth and refraction per step */
  function sunHour(tEnd, la, lo) {
    const T = ((tEnd - 1800) / 86400 + 2440587.5 - 2451545) / 36525; const { decl, eqtime, rAu } = sunTerms(T);
    const L = la * D2R, de = decl * D2R, sL = Math.sin(L), cL = Math.cos(L), sD = Math.sin(de), cD = Math.cos(de);
    const steps = [];
    for (let k = 0; k < 12; k++) { const tk = tEnd - 3600 + (k + 0.5) * 300; const minutes = ((tk % 86400) + 86400) % 86400 / 60;
      const tst = (((minutes + eqtime + 4 * lo) % 1440) + 1440) % 1440, ha = tst / 4 - 180;
      const csz = Math.min(1, Math.max(-1, sL * sD + cL * cD * Math.cos(ha * D2R))); const zen = Math.acos(csz) / D2R;
      const den = cL * Math.sin(zen * D2R); let az;
      if (Math.abs(den) > 0.001) { const azr = Math.min(1, Math.max(-1, (sL * Math.cos(zen * D2R) - sD) / den)); az = 180 - Math.acos(azr) / D2R; if (ha > 0) az = -az; } else az = la > 0 ? 180 : 0;
      az = ((az % 360) + 360) % 360; const el = 90 - zen; steps.push({ cosz: csz, azimuth: az, elevation: el + refractionDeg(el) }); }
    return { steps, rAu };
  }
  /* day = geometric sun elevation > 0 at the stamp (the table's rule): NOAA cos(zenith) only */
  function isDay(t, la, lo) {
    const { decl, eqtime } = sunTerms((t / 86400 + 2440587.5 - 2451545) / 36525); const minutes = ((t % 86400) + 86400) % 86400 / 60;
    const ha = ((((minutes + eqtime + 4 * lo) % 1440) + 1440) % 1440) / 4 - 180; const L = la * D2R, de = decl * D2R;
    return Math.sin(L) * Math.sin(de) + Math.cos(L) * Math.cos(de) * Math.cos(ha * D2R) > 0;
  }
  function rbAt(P, la, lo, tEnd, rbc) {
    const hit = rbc && rbc.get(tEnd); if (hit) return hit;
    let num = 0, den = 0; const { steps, rAu } = sunHour(tEnd, la, lo);
    for (const q of steps) { const ci = cosIncidence(q.cosz, q.azimuth, P.sl, P.e, P.n);
      if (q.elevation > 0 && ci > 0 && q.elevation > horizonAt(P.hz0, q.azimuth)) num += ci; den += Math.max(0, q.cosz); }
    const out = { rb: den > 1e-6 ? num / den : 0, bnd: S0 / (rAu * rAu) * num / 12 }; if (rbc) rbc.set(tEnd, out); return out;
  }
  /* one pass per answer: the columns resolved once (ctx), each hour's T and Td feature vectors written into two reused arrays in FEAT
     order (no per-hour objects); returns the cell key 'SEASON|day|night' or null */
  function ctxOf(H, P, zst, zg, la, lo, hyper, useSun) {
    const col = (k) => (Array.isArray(H[k]) ? H[k] : null); const C = colsOf(H);
    /* v91.17.271 · the hour-end sun factors are a function of the place and the hour only: kept on the cached place (P) across answers
       (a refreshed forecast for the same place re-uses them), cleared past 2,000 hours */
    if (!P.rbc || P.rbc.size > 2000) P.rbc = new Map();
    return { H, P, zst, zg, la, lo, hyper, useSun, rbc: P.rbc, T: C.T, Z: C.Z, RH: C.RH, t2: col('temperature_2m'), td2: col('dew_point_2m'), sp: col('surface_pressure'),
      sw: col('shortwave_radiation'), dir: col('direct_radiation'), dif: col('diffuse_radiation'), cl: col('cloud_cover'), ws: col('wind_speed_10m'), sm: col('soil_moisture_0_to_10cm'),
      h: { t2: 0, td2: 0, sp: 0, T: new Array(8), Z: new Array(8), RH: new Array(8) }, coastF: Math.exp(-P.coastKm / hyper.lc) };
  }
  const av = (a, i) => (a ? a[i] : null);
  const rad2 = (a, i) => { const x = av(a, i), y = av(a, i + 1); return x == null ? y : y == null ? x : 0.5 * (x + y); };   // past-hour means around the hour
  function fill(c, i, tsMs, xt, xd) {
    const h = c.h; h.t2 = av(c.t2, i); h.td2 = av(c.td2, i); h.sp = av(c.sp, i); if (h.t2 == null || h.sp == null) return null;
    for (let k = 0; k < 8; k++) { h.T[k] = c.T[k][i]; h.Z[k] = c.Z[k][i]; h.RH[k] = c.RH[k][i]; }
    const pr = profileTerms(h, c.zst, c.zg), P = c.P; c.pr = pr;
    const day = isDay(tsMs / 1000, c.la, c.lo); const s = SEASON[new Date(tsMs).getUTCMonth()];
    const sw = (rad2(c.sw, i) ?? 0) / 1000, B = rad2(c.dir, i) ?? 0, D = rad2(c.dif, i) ?? 0;
    const cloud = Math.min(1, Math.max(0, (av(c.cl, i) ?? 0) / 100)), U = Math.max(0, av(c.ws, i) ?? 0), cc = (1 - cloud) * Math.exp(-U / c.hyper.u0);
    const sm = av(c.sm, i), alb = P.alb[s];
    let sun = 0;
    if (c.useSun && B > 0) {   /* hours ending at the stamp and the next (as the table averages them for an instantaneous hour) */
      const a = rbAt(P, c.la, c.lo, tsMs / 1000, c.rbc), b = rbAt(P, c.la, c.lo, tsMs / 1000 + 3600, c.rbc);
      const rb = 0.5 * (a.rb + b.rb), bnd = 0.5 * (a.bnd + b.bnd);
      sun = (1 - alb) * ((Math.min(B * rb, bnd) - B) + D * (P.vd - 1) + alb * (B + D) * (1 - P.vd)) / 1000; }
    const ok = pr.liveOk ? 1 : 0, dz = (c.zst - c.zg) / 1000;
    for (const x of [xt, xd]) { x[1] = dz * ok; x[2] = dz * (1 - ok); x[4] = P.vdepth * Math.max(0, pr.dth) * cc; x[5] = sun; x[6] = alb * sw; x[7] = day ? P.lday[s] : P.lnight[s];
      x[8] = sm == null ? NaN : sm * sw; x[9] = sm == null ? NaN : sm; x[10] = P.ndvi[s] * sw; x[11] = P.built * (day ? sw : cc); x[12] = c.coastF * (day ? sw : cc); }
    xt[0] = pr.dLive; xt[3] = ok ? 0 : pr.dth * dz; xd[0] = pr.tdLive; xd[3] = ok ? 0 : pr.dthTd * dz;
    return s + (day ? '|day' : '|night');
  }
  /* a cell's coefficients as arrays (cached per table) */
  const CELLS = new WeakMap();
  function cellArr(T, key) {
    let m = CELLS.get(T); if (!m) { m = new Map(); CELLS.set(T, m); }
    if (m.has(key)) return m.get(key); const C = T.cells[key];
    const v = C ? { c0: C.c0, c: Float64Array.from(FEAT, (k) => C[k] || 0), mean: Float64Array.from(FEAT, (k) => (C.mean ? C.mean[k] : 0)) } : null; m.set(key, v); return v;
  }
  const dotA = (A, x, S) => { let d = 0; if (A) { d = A.c0; for (let j = 0; j < x.length; j++) { const c = A.c[j]; if (!c) continue; const v = Number.isFinite(x[j]) ? x[j] : A.mean[j]; d += c * v; } } return S != null ? d + S : d; };
  function features(tg, H, i, P, zst, zg, la, lo, tsMs, hyper, useSun) {
    const c = ctxOf(H, P, zst, zg, la, lo, hyper, useSun); const xt = new Float64Array(FEAT.length), xd = new Float64Array(FEAT.length);
    const cell = fill(c, i, tsMs, xt, xd); if (!cell) return null; const x = tg === 'td' ? xd : xt; return { x: Object.fromEntries(FEAT.map((k, j) => [k, x[j]])), cell }; }
  /* v91.17.271 · one pass over an answer's hours for another stage (t2final.mjs): the context is built once (the sun factors cached
     across hours), cb(i, cell, xT, pr) per hour with the T feature vector in FEAT order and the hour's profile terms; same fill() */
  function eachHour(H, P, zst, zg, la, lo, tsOf, hyper, useSun, cb) {
    const c = ctxOf(H, P, zst, zg, la, lo, hyper, useSun); const xt = new Float64Array(FEAT.length), xd = new Float64Array(FEAT.length);
    for (let i = 0; i < H.time.length; i++) { const cell = fill(c, i, tsOf(i), xt, xd); if (cell) cb(i, cell, xt, c.pr); }
  }
  /* delta for one target at hour i, or null */
  function delta(m, tg, zone, H, i, P, zst, zg, la, lo, tsMs) {
    const T = m[tg]; if (!T) return null; const use = T.termsKept && T.termsKept[zone];
    const c = ctxOf(H, P, zst, zg, la, lo, T.hyper, !use || use.includes('sun')); const xt = new Float64Array(FEAT.length), xd = new Float64Array(FEAT.length);
    const cell = fill(c, i, tsMs, xt, xd); if (!cell) return null;
    return dotA(cellArr(T, zone + '|' + cell), tg === 'td' ? xd : xt, P.S[tg] && P.S[tg][cell]);
  }
  /* apply to a forecast answer (operator switch + zone gate); returns true when it changed the answer */
  function apply(loc, la, lo, o = {}) {
    const m = model(); if (!m || !loc || !loc.hourly) return false;
    if (!on() && !o.force) return false;
    const zone = o.zone || null; const H = loc.hourly;
    const zones = (m.servedZones || {});
    const want = ['t', 'td'].filter((tg) => o.force || (Array.isArray(zones[tg]) && zones[tg].includes(zone)));
    if (!want.length) { prov(loc, 'agn_tdown', { applied: false, zone, why: 'not served in this zone (gate)' }, o.record); return false; }
    const zg = Number.isFinite(o.zGrid) ? o.zGrid : (Number.isFinite(loc.__zGrid) ? loc.__zGrid : null); const zst = Number(loc.elevation);
    const miss = REQUEST_VARS.filter((k) => !Array.isArray(H[k]));
    if (zg == null || !Number.isFinite(zst) || miss.length) { prov(loc, 'agn_tdown', { applied: false, zone, why: 'inputs missing: ' + (zg == null ? 'grid height ' : '') + miss.slice(0, 4).join(', ') + (miss.length > 4 ? ' ...' : '') }, o.record); return false; }
    const P = place(m, la, lo, zst); const off = (loc.utc_offset_seconds || 0) * 1000; let n = 0;
    const out = { t: H.temperature_2m.slice(), td: H.dew_point_2m.slice() };
    const T0 = m[want[0]]; const useSun = want.some((tg) => { const u = m[tg] && m[tg].termsKept && m[tg].termsKept[zone]; return !u || u.includes('sun'); });
    const c = ctxOf(H, P, zst, zg, la, lo, T0.hyper, useSun); const X = { t: new Float64Array(FEAT.length), td: new Float64Array(FEAT.length) };
    const t0 = Date.parse(String(H.time[0]).slice(0, 16) + 'Z') - off; const step = H.time.length > 1 ? Date.parse(String(H.time[1]).slice(0, 16) + 'Z') - off - t0 : 3600e3;
    const regular = step === 3600e3 && Date.parse(String(H.time[H.time.length - 1]).slice(0, 16) + 'Z') - off === t0 + (H.time.length - 1) * 3600e3;
    for (let i = 0; i < H.time.length; i++) {
      const ts = regular ? t0 + i * 3600e3 : Date.parse(String(H.time[i]).slice(0, 16) + 'Z') - off;
      const cell = fill(c, i, ts, X.t, X.td); if (!cell) continue;
      for (const tg of want) { const key = tg === 't' ? 'temperature_2m' : 'dew_point_2m'; if (H[key][i] == null || !m[tg]) continue;
        const d = dotA(cellArr(m[tg], zone + '|' + cell), X[tg], P.S[tg] && P.S[tg][cell]); if (!Number.isFinite(d)) continue;
        out[tg][i] = Math.round((H[key][i] + d) * 10) / 10; n++; }
    }
    if (want.includes('t')) H.temperature_2m = out.t;
    if (want.includes('td')) H.dew_point_2m = out.td.map((v, i) => (v != null && H.temperature_2m[i] != null && v > H.temperature_2m[i] ? H.temperature_2m[i] : v));
    prov(loc, 'agn_tdown', { applied: n > 0, zone, version: m.version, targets: want, hours: n }, o.record);
    return n > 0;
  }
  function status() { const m = model(); return { on: on(), file: existsSync(file), version: m && m.version, servedZones: m && m.servedZones, error: err }; }
  return { apply, delta, features, eachHour, place, model, status, on, REQUEST_VARS };
}
