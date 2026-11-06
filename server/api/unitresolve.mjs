/* v91.17.70 · ONE POINT → TEHSIL RESOLVER, BY POLYGON ════════════════════════════════════════════════════════════
   The casebook (unitFor), the engineering baseline (/api/climatology/baseline) and the point report (nearestUnit) each
   picked the tehsil whose CENTROID is nearest the asset. Near a boundary that names the neighbour: at 11 approximate
   industrial-estate coordinates, 3 resolved to the wrong unit [measured, board/industrial_engineering_checks/
   estate_resolver.py]: Hattar SEZ (Khanpur, Haripur, KP) → Taxila, Punjab; Sundar → Kot Radha Kishen; Kot Lakhpat →
   Lahore City instead of Lahore Cantt.

   Here the point is tested against the tehsil polygons themselves (data/pk-tehsils.json, ray casting with holes, a
   bounding-box pre-filter). Only a point that lies in NO polygon (offshore at Port Qasim or Gwadar, or across the border)
   falls back, to the unit with the nearest polygon vertex within FALLBACK_KM, and says so in `by`. The result always
   names its method, so a caller can print it.

   unitAtPoint(app, lat, lon) → { unit, by: 'polygon' | 'nearest boundary', km } | null   (app.dataDir, app.units.tehsil) */
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const CACHE = new Map();   /* dataDir → { feats, byId } */
export const FALLBACK_KM = 25;

function load(dataDir, units) {
  let c = CACHE.get(dataDir); if (c) return c;
  let feats = [];
  try {
    /* GEO281 · the point is tested against the official tehsils at full published resolution (data/pk-tehsils-fine.json.gz, bundle
       3.3.0 pakistan.gpkg, ~11 m) when present. The display file pk-tehsils.json is generalised ~800 m (Hausdorff median 774 m, max
       1,409 m) and resolved 41% of points within 250 m of an edge to the neighbouring tehsil [measured, scripts/tests281geo/align_check.py]. */
    const fine = join(dataDir, 'pk-tehsils-fine.json.gz');
    const fc = existsSync(fine) ? JSON.parse(gunzipSync(readFileSync(fine)).toString('utf8')) : JSON.parse(readFileSync(join(dataDir, 'pk-tehsils.json'), 'utf8'));
    feats = fc.features.filter(f => f && f.geometry && f.properties && f.properties.uid).map((f) => {
      let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
      const walk = (a) => { if (typeof a[0] === 'number') { if (a[0] < x0) x0 = a[0]; if (a[0] > x1) x1 = a[0]; if (a[1] < y0) y0 = a[1]; if (a[1] > y1) y1 = a[1]; } else a.forEach(walk); };
      walk(f.geometry.coordinates);
      return { uid: f.properties.uid, bbox: [x0, y0, x1, y1], polys: (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map((poly) => poly.map(flat)) };   /* GEO281 · rings as flat Float64Array [x0,y0,x1,y1,…]: a third of the memory of nested arrays */
    });
  } catch (_) { feats = []; }
  const byId = new Map(); for (const u of (units || [])) byId.set(u.unitId, u);
  c = { feats, byId }; CACHE.set(dataDir, c); return c;
}
const flat = (ring) => { const a = new Float64Array(ring.length * 2); for (let i = 0; i < ring.length; i++) { a[2 * i] = ring[i][0]; a[2 * i + 1] = ring[i][1]; } return a; };
function inRing(x, y, ring) {
  let inside = false; const n = ring.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
const kmBetween = (a, b, c, d) => { const R = 6371, r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(Math.min(1, x))); };

/* every unit whose polygon holds the point (a shared edge can give two; the caller gets the first and `also`) */
export function unitsContaining(dataDir, units, lat, lon) {
  const { feats } = load(dataDir, units); const hit = [];
  for (const f of feats) {
    if (lon < f.bbox[0] || lon > f.bbox[2] || lat < f.bbox[1] || lat > f.bbox[3]) continue;
    for (const poly of f.polys) {
      if (!inRing(lon, lat, poly[0])) continue;
      let hole = false; for (let h = 1; h < poly.length; h++) if (inRing(lon, lat, poly[h])) { hole = true; break; }
      if (!hole) { hit.push(f.uid); break; }
    }
  }
  return hit;
}

export function unitAtPoint(app, lat, lon) {
  lat = Number(lat); lon = Number(lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !app || !app.dataDir) return null;
  const tehsils = (app.units && app.units.tehsil) || [];
  const { feats, byId } = load(app.dataDir, tehsils);
  const hit = unitsContaining(app.dataDir, tehsils, lat, lon).filter(id => byId.has(id));
  if (hit.length) return { unit: byId.get(hit[0]), by: 'polygon', km: 0, ...(hit.length > 1 ? { also: hit.slice(1) } : {}) };
  /* outside every polygon: the unit with the nearest boundary vertex, within FALLBACK_KM */
  const pad = FALLBACK_KM / 100; let best = null, bd = Infinity;
  for (const f of feats) {
    if (lon < f.bbox[0] - pad || lon > f.bbox[2] + pad || lat < f.bbox[1] - pad || lat > f.bbox[3] + pad || !byId.has(f.uid)) continue;
    for (const poly of f.polys) { const r = poly[0]; for (let i = 0; i < r.length; i += 2) { const d = kmBetween(lat, lon, r[i + 1], r[i]); if (d < bd) { bd = d; best = f.uid; } } }
  }
  if (best && bd <= FALLBACK_KM) return { unit: byId.get(best), by: 'nearest boundary', km: Math.round(bd * 10) / 10 };
  return null;
}
