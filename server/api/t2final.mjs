/* v91.17.271 · B2 v2 · FINAL CORRECTION OF THE SERVED TEMPERATURE WITH PHYSICS TERMS AS INPUTS · OFF BY DEFAULT.
   What it does, when switched on (NIGRAAN_T2FINAL=1) AND only in a zone listed in data/t2final-b2v2.json servedZones (listed only when
   every gate line passed: nig/ds2/b2v2_fit.py; none on 16 Oct 2026): after the whole served chain (static chain, airport, weather MOS,
   synoptic and MACH live layers) the hourly 2 m temperature becomes
        T_served + c0 + sum_k c_k x_k          (cell = zone | season | day/night; coefficients fitted on obs - served)
   Terms x (nig/ds2/b2v2_pairs.py, the same formulas; computed from the answer's own profile through tdown.mjs):
     ld     live lapse departure: T_prof(z_place) - T_prof(z_grid) + 6.5 K/km x (z_place - z_grid)   (0 without a free-air profile)
     sfc    theta excess x dz / 1000 where fewer than 2 levels are above the model ground
     stab   surface inversion strength theta(lowest level above ground) - theta(2 m), >= 0
     stcc   stab x clear-calm (1 - cloud) exp(-U10 / 10 km/h)
     cp     valley depth (100 m) x stab x clear-calm                                     (cold pooling)
     sun    (1 - albedo) x terrain shortwave gain / 1000 (horizon-shaded incidence, sky view) (sun on slope)
     coast  exp(-coast_km / 20 km) x (SW/1000 by day | clear-calm at night)
   Inputs: the tdown.mjs REQUEST_VARS (pressure levels 1000-700 hPa, surface pressure, radiation) and the model grid height; missing ->
   the answer is left as it is (agn_t2final.why). Light: the place lookups are tdown's (cached); per hour one profile pass and 8 multiplies.
   Operator-only provenance (agn_t2final). */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { profileTerms, REQUEST_VARS, LEVELS } from './tdown.mjs';

export const TERMS = ['ld', 'sfc', 'stab', 'stcc', 'cp', 'sun', 'coast'];

/* v91.17.271 · operator-only provenance: on the answer object but not serialised to customers (enumerable only when the chain is asked to record, as agn_chain) */
const prov = (loc, k, v, rec) => { try { Object.defineProperty(loc, k, { value: v, enumerable: !!rec, configurable: true, writable: true }); } catch (_) {} };
export function createT2final({ dataDir, tdown = null } = {}) {
  const file = join(dataDir, 't2final-b2v2.json'); let M = null, mt = 0, at = 0, err = null;
  const on = () => process.env.NIGRAAN_T2FINAL === '1';
  function model() { if (M && Date.now() - at < 30e3) return M; at = Date.now();
    try { if (!existsSync(file)) { M = null; return null; } const t = statSync(file).mtimeMs; if (!M || t !== mt) { M = JSON.parse(readFileSync(file, 'utf8')); mt = t; err = null; } return M; }
    catch (e) { err = e.message; return null; } }
  /* the B2 v2 terms of hour i (object in TERMS order) and the cell key 'SEASON|day|night', or null (tests; apply() runs one pass) */
  function terms(H, i, P, zst, zg, la, lo, tsMs, hyper) {
    if (!tdown) return null;
    const f = tdown.features('t', H, i, P, zst, zg, la, lo, tsMs, { u0: hyper.u0, lc: hyper.lc }, true); if (!f) return null;
    const h = { t2: H.temperature_2m[i], td2: H.dew_point_2m ? H.dew_point_2m[i] : null, sp: H.surface_pressure[i],
      T: LEVELS.map((p) => H[`temperature_${p}hPa`][i]), Z: LEVELS.map((p) => H[`geopotential_height_${p}hPa`][i]), RH: LEVELS.map((p) => H[`relative_humidity_${p}hPa`][i]) };
    return { cell: f.cell, x: termsOf(Object.values(f.x), profileTerms(h, zst, zg), H.cloud_cover[i], H.wind_speed_10m[i], hyper) };   /* f.x is in tdown's FEAT order */
  }
  /* the B2 v2 terms from tdown's FEAT vector (live, dz_l, dz_n, sfc, cp, sun, alb, lst, smsw, sm, ndvi, bu, coast) and the hour's profile terms */
  function termsOf(x, pr, cloud, wind, hyper) {
    const stab = Math.max(0, pr.dth);
    const cc = (1 - Math.min(1, Math.max(0, (cloud ?? 0) / 100))) * Math.exp(-Math.max(0, wind ?? 0) / hyper.u0);
    return { ld: x[0] + 6.5 * x[1], sfc: x[3], stab, stcc: stab * cc, cp: x[4], sun: x[5], coast: x[12] };
  }
  function deltaOf(m, zone, cell, x) { const C = m.cells[zone + '|' + cell]; if (!C) return 0; let d = C.c0; for (const k of TERMS) d += (C[k] || 0) * (Number.isFinite(x[k]) ? x[k] : 0); return d; }
  /* apply to a forecast answer after the served chain (operator switch + zone gate); true when it changed the answer */
  function apply(loc, la, lo, o = {}) {
    const m = model(); if (!m || !loc || !loc.hourly) return false;
    if (!on() && !o.force) return false;
    const zone = o.zone || null; const H = loc.hourly;
    if (!o.force && !(Array.isArray(m.servedZones) && m.servedZones.includes(zone))) { prov(loc, 'agn_t2final', { applied: false, zone, why: 'not served in this zone (gate)' }, o.record); return false; }
    const tm = tdown && tdown.model(); const zg = Number.isFinite(o.zGrid) ? o.zGrid : (Number.isFinite(loc.__zGrid) ? loc.__zGrid : null); const zst = Number(loc.elevation);
    const miss = REQUEST_VARS.filter((k) => !Array.isArray(H[k]));
    if (!tm || zg == null || !Number.isFinite(zst) || miss.length) { prov(loc, 'agn_t2final', { applied: false, zone, why: 'inputs missing: ' + (!tm ? 'tdown table ' : '') + (zg == null ? 'grid height ' : '') + miss.slice(0, 4).join(', ') + (miss.length > 4 ? ' ...' : '') }, o.record); return false; }
    const P = tdown.place(tm, la, lo, zst); const off = (loc.utc_offset_seconds || 0) * 1000; let n = 0; const out = H.temperature_2m.slice();
    const hy = { u0: m.hyper.u0, lc: m.hyper.lc }, cl = H.cloud_cover, ws = H.wind_speed_10m;
    const t0 = Date.parse(String(H.time[0]).slice(0, 16) + 'Z') - off, nT = H.time.length;   /* a regular hourly axis: stamps by step (as tdown.apply) */
    const regular = nT < 2 || (Date.parse(String(H.time[1]).slice(0, 16) + 'Z') - off - t0 === 3600e3 && Date.parse(String(H.time[nT - 1]).slice(0, 16) + 'Z') - off === t0 + (nT - 1) * 3600e3);
    const tsOf = regular ? (i) => t0 + i * 3600e3 : (i) => Date.parse(String(H.time[i]).slice(0, 16) + 'Z') - off;
    const cells = new Map(); const cellOf = (cell) => { let c = cells.get(cell); if (c === undefined) { const C = m.cells[zone + '|' + cell]; c = C ? [C.c0, ...TERMS.map((k) => C[k] || 0)] : null; cells.set(cell, c); } return c; };
    tdown.eachHour(H, P, zst, zg, la, lo, tsOf, hy, true, (i, cell, x, pr) => {
      const t = H.temperature_2m[i]; if (t == null) return; const c = cellOf(cell); if (!c) { n++; return; }
      const stab = pr.dth > 0 ? pr.dth : 0, cc = (1 - Math.min(1, Math.max(0, (cl[i] ?? 0) / 100))) * Math.exp(-Math.max(0, ws[i] ?? 0) / hy.u0);
      const d = c[0] + c[1] * (x[0] + 6.5 * x[1]) + c[2] * x[3] + c[3] * stab + c[4] * stab * cc + c[5] * x[4] + c[6] * x[5] + c[7] * x[12];   /* TERMS order (termsOf) */
      if (Number.isFinite(d)) { out[i] = Math.round((t + d) * 10) / 10; n++; } });
    H.temperature_2m = out;
    if (Array.isArray(H.dew_point_2m)) H.dew_point_2m = H.dew_point_2m.map((v, i) => (v != null && out[i] != null && v > out[i] ? out[i] : v));
    prov(loc, 'agn_t2final', { applied: n > 0, zone, version: m.version, hours: n }, o.record);
    return n > 0;
  }
  function status() { const m = model(); return { on: on(), file: existsSync(file), version: m && m.version, servedZones: m && m.servedZones, error: err }; }
  return { apply, terms, deltaOf, model, status, on };
}
