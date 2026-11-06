/* ══ 1.0.4 · aq41 · PM2.5 1 km SPATIAL DOWNSCALING (data/pm25-downscale.json, data/aqds/) ══════════════════════════════════════════
   The day-to-day PM2.5 level stays the served value (per-city correction within 30 km of a monitored city, else the national model in
   its domain, else CAMS). This layer only says how much a place differs from that value: a static multiplicative factor per 1 km cell
   and season (smog Oct-Feb, rest Mar-Sep), learnt from 338 stations (ln of station PM2.5 / served value, station-season means) on
   1 km predictors (GHSL built share and population, WorldCover shares, NDVI, Copernicus height, water distance, brick-kiln and
   point-source PM2.5 inventories, OSM major roads, TROPOMI NO2 season means). Tested with stations held out by 2 km clusters and
   with whole cities held out (data/evidence/aq41/): released only in the regions that passed both (pm25-downscale.json regions);
   everywhere else the factor is 1 and the served value is unchanged.
   One value per place: a tehsil's factor is the population-weighted mean of its 1 km factors (aqds/pm25-ds-units.json), applied in
   smog.mjs dailies(), so the map, the place panel, alerts, the AI and reports all read the same downscaled daily PM2.5 and AQI.
   The 1 km map (GET /api/map/pm25km) is the tehsil's served base value x the cell factor: its population-weighted mean over the
   tehsil is the tehsil value. NIGRAAN_PM25DS=0 switches the layer off (factor 1 everywhere). */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createFeatGrid } from './featgrid.mjs';

export const PM25DS_FILE = 'pm25-downscale.json';
const SHARED = new Map();
const r1 = (x) => Math.round(x * 10) / 10;

export function seasonOf(date) { const m = Number(String(date).slice(5, 7)); return m >= 10 || m <= 2 ? 'smog' : 'rest'; }

export function createPm25Ds(dataDir) {
  if (SHARED.has(dataDir)) return SHARED.get(dataDir);
  const C = new Map();   /* file -> { at, j } */
  const read = (rel) => { const f = join(dataDir, rel); try { const st = statSync(f); const c = C.get(f); if (c && c.at === st.mtimeMs) return c.j; const j = JSON.parse(readFileSync(f, 'utf8')); C.set(f, { at: st.mtimeMs, j }); return j; } catch (_) { return null; } };
  const meta = () => read(PM25DS_FILE);
  const units = () => read(join('aqds', 'pm25-ds-units.json'));
  const on = () => process.env.NIGRAAN_PM25DS !== '0' && !!meta() && !!units();
  let FG = null; const fg = () => FG || (FG = createFeatGrid(join(dataDir, 'aqds')));

  /* the factor of a tehsil for a date; null where the layer does not apply (factor 1: the served value stands) */
  function unitFactor(uid, date) {
    if (!on() || !uid || !date) return null; const T = units(); const o = T.units && T.units[uid]; if (!o) return null;
    const s = seasonOf(date), f = o[s]; if (!(f > 0)) return null;
    return { factor: f, season: s, region: o.region, version: meta().version };
  }
  /* the factor of one 1 km cell (null outside the released regions) */
  function cellFactor(lat, lon, date) {
    if (!on()) return null; let v = null; try { v = fg().value('pm25ds_' + seasonOf(date), lat, lon); } catch (_) { v = null; }
    return v == null ? null : Math.exp(v);
  }
  /* the 1 km PM2.5 cells of one day. day(uid) -> the served tehsil row of that day ({ date, pm25, pm25Downscale }) or null.
     A cell = (tehsil pm25 / tehsil factor) x cell factor, so the population-weighted mean of a tehsil's cells is its served value. */
  function grid(day, bbox) {
    if (!on()) return { ready: false, why: 'the PM2.5 downscaling layer is off or not installed' };
    const T = units(), g = T.grid; const cells = []; let date = null;
    for (const [uid, o] of Object.entries(T.units || {})) {
      const d = day(uid); if (!d || d.pm25 == null || !d.pm25Downscale || !(d.pm25Downscale.factor > 0)) continue; date = date || d.date;
      const base = d.pm25 / d.pm25Downscale.factor;
      for (const [r, c] of o.cells) {
        const lat = g.north - (r + 0.5) * g.cell, lon = g.west + (c + 0.5) * g.cell;
        if (bbox && (lat < bbox.s || lat > bbox.n || lon < bbox.w || lon > bbox.e)) continue;
        const f = cellFactor(lat, lon, d.date); if (f == null) continue; cells.push([r, c, r1(base * f)]);
      }
    }
    return { ready: true, version: meta().version, date, cell: g.cell, west: g.west, north: g.north, regions: meta().regions, unit: 'µg/m³', n: cells.length,
      columns: ['row', 'col', 'pm25'], cells,
      note: 'daily mean PM2.5 at 1 km where the downscaling layer passed its held-out test (' + meta().regions.join(', ') + '); elsewhere the tehsil value stands. Cell centre: lat = north - (row + 0.5) cell, lon = west + (col + 0.5) cell.' };
  }
  const api = { on, meta, unitFactor, cellFactor, grid, seasonOf, regions: () => (meta() && meta().regions) || [] };
  SHARED.set(dataDir, api); return api;
}
