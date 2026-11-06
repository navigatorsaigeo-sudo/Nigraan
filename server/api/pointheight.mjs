/* ══ v91.17.72 · POINT HEIGHT AT 30 m (agent T) ══════════════════════════════════════════════════════════════════════
   heightAt(lat, lon) -> the terrain height a point forecast should be served at, from Copernicus GLO-30 (1 arc-second).

   1. a named place, a tehsil anchor (settlement point) or a training station within matchRadiusM (data/terrain30-rules.json
      pointHeight.matchRadiusM, 100 m) -> its stored 30 m height (data/place-height30.json, bilinear GLO-30 at the exact
      coordinate; terrain30_finish.py). basis 'place30', sendElevation true.
   2. otherwise the 9-arc-second feature-grid cell (data/feat/t_elev, the mean of 81 GLO-30 pixels). When the cell's own
      relief (t_elev_p90 - t_elev_p10) exceeds pointHeight.reliefKeepProviderM (50 m as measured), the cell mean misses an arbitrary
      point in it by more than the provider's own 90 m point DEM does, by over 15 m (0.1 C) at p90 [measured over 204,957
      gazetteer places, table in the rules file]: keepProviderDem true, sendElevation false (cellElevM still returned).
      Below it the cell height is sent (it costs at most 0.1 C and keeps the forecast on the feature grid's terrain).
      basis 'cell30'.
   3. outside the grid or no band: basis null, sendElevation false (the provider keeps its DEM).

   INTEGRATION (not wired here; server.mjs belongs to the integrator): where the /px proxy builds a point-forecast request
   to the provider and the caller did not pass an elevation,
       const h = pointHeight.heightAt(lat, lon);
       if (h.sendElevation) params.set('elevation', String(h.elevM));   // Open-Meteo `elevation=` (metres); the provider
                                                                         // then applies its lapse rate from its grid height
   and put the elevation in the cache key. A registered asset with a surveyed height passes that height instead. */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createFeatGrid } from './featgrid.mjs';

/* v91.17.144 · B5 · the fleet and the gazetteer each built their own copy (each loading the 30 m place file on its first call, 0.3 s
   apiece, on a user's request): one instance per data directory now */
const SHARED_PH = new Map();
export function createPointHeight(dataDir, opts = {}) {
  if (!opts.featGrid) { const k = String(dataDir); if (!SHARED_PH.has(k)) SHARED_PH.set(k, createPointHeightNow(dataDir, opts)); return SHARED_PH.get(k); }
  return createPointHeightNow(dataDir, opts);
}
function createPointHeightNow(dataDir, { featGrid } = {}) {
  const fg = featGrid || createFeatGrid(dataDir);
  const pf = join(dataDir, 'place-height30.json'), rf = join(dataDir, 'terrain30-rules.json');
  let P = null, PMT = 0, IDX = null, R = null, RMT = 0;
  const B = 100;   /* bucket: 0.01 degree */
  function rules() {
    try { if (!existsSync(rf)) return null; const mt = statSync(rf).mtimeMs; if (R && mt === RMT) return R; R = JSON.parse(readFileSync(rf, 'utf8')); RMT = mt; return R; } catch { return R; }
  }
  let PCHK = 0;
  function places() {
    if (P && Date.now() - PCHK < 5000) return P;   /* v91.17.144 · B5 · the file is looked at on disk at most every 5 s */
    PCHK = Date.now();
    try {
      if (!existsSync(pf)) return null; const mt = statSync(pf).mtimeMs; if (P && mt === PMT) return P;
      const j = JSON.parse(readFileSync(pf, 'utf8')); const idx = new Map();
      for (let i = 0; i < j.lat.length; i++) { const k = Math.floor(j.lat[i] * B) + ',' + Math.floor(j.lon[i] * B); let a = idx.get(k); if (!a) { a = []; idx.set(k, a); } a.push(i); }
      P = j; PMT = mt; IDX = idx; return P;
    } catch { return P; }
  }
  const param = (k, d) => { const r = rules(); const v = r && r.pointHeight && r.pointHeight[k]; return v && typeof v.value === 'number' ? v.value : d; };
  const distM = (la1, lo1, la2, lo2) => { const k = Math.cos((la1 + la2) / 2 * Math.PI / 180); const dy = (la2 - la1) * 111320, dx = (lo2 - lo1) * 111320 * k; return Math.sqrt(dx * dx + dy * dy); };
  const KIND = { g: 'place', o: 'place', x: 'place', a: 'settlement anchor', p: 'station' };

  function nearest(lat, lon, radius) {
    const j = places(); if (!j) return null;
    const bi = Math.floor(lat * B), bj = Math.floor(lon * B); let best = null;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const a = IDX.get((bi + di) + ',' + (bj + dj)); if (!a) continue;
      for (const i of a) { const d = distM(lat, lon, j.lat[i], j.lon[i]); if (d <= radius && (!best || d < best.d)) best = { i, d }; }
    }
    if (!best) return null;
    const k = j.k[best.i];
    return { lat: j.lat[best.i], lon: j.lon[best.i], elevM: j.h[best.i], distM: Math.round(best.d), kind: KIND[k] || k };
  }

  function heightAt(lat, lon) {
    lat = +lat; lon = +lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { ok: false, error: 'lat and lon must be numbers' };
    const radius = param('matchRadiusM', 100), relThr = param('reliefKeepProviderM', 50);
    const src = 'Copernicus DEM GLO-30 (30 m)';
    const pl = nearest(lat, lon, radius);
    const cm = fg.value('t_elev', lat, lon), p10 = fg.value('t_elev_p10', lat, lon), p90 = fg.value('t_elev_p90', lat, lon);
    const cell = cm == null ? null : { elevM: Math.round(cm), p10M: p10 == null ? null : Math.round(p10), p90M: p90 == null ? null : Math.round(p90), reliefM: (p10 == null || p90 == null) ? null : Math.round(p90 - p10) };
    if (pl) return { ok: true, lat, lon, elevM: pl.elevM, basis: 'place30', sendElevation: true, keepProviderDem: false, place: pl, cell, matchRadiusM: radius, source: src };
    if (!cell) return { ok: true, lat, lon, elevM: null, basis: null, sendElevation: false, keepProviderDem: true, cell: null, why: 'outside the 30 m terrain grid', source: null };
    const rough = cell.reliefM != null && cell.reliefM > relThr;
    return { ok: true, lat, lon, elevM: rough ? null : cell.elevM, cellElevM: cell.elevM, basis: 'cell30', sendElevation: !rough, keepProviderDem: rough, cell, reliefKeepProviderM: relThr,
             why: rough ? 'the 250 m cell spans ' + cell.reliefM + ' m of relief (over ' + relThr + ' m): the provider\'s own point DEM is kept' : null, source: src };
  }
  function status() {
    const j = places(), r = rules();
    return { ready: !!(j && fg.meta('t_elev')), places: j ? j.lat.length : 0, placesBuilt: j ? j.built : null, band: fg.meta('t_elev') ? fg.meta('t_elev').built : null,
             matchRadiusM: param('matchRadiusM', 100), reliefKeepProviderM: param('reliefKeepProviderM', 50), rulesBuilt: r ? r.built : null };
  }
  return { heightAt, status };
}
