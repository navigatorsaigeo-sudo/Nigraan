/* ══ v91.17.283 · WS2 D18 · A POINT OUTSIDE EVERY TEHSIL POLYGON: SHORE, SEA OR ABROAD ══════════════════════════════════════════════
   Ormara town (25.2088, 64.6357) and Kemari port were refused as "outside Pakistan-administered territory", and a point at sea got the
   same words (SELF-D D18). The tehsil boundaries (data/pk-tehsils.json) are generalised: along the coast their vertices lie a median
   4.4 km apart, so a straight edge cuts off real shore. A point that no polygon contains is now classed:
     snapped  on the coast (seaward of the coastline polyline or within two median boundary segments of it; never at a land border)
              and within snapKm of the boundary edge of a non-disputed tehsil (data/territory-snap.json: half the median coastal boundary
              segment, 2.2 km; derived by scripts/tests283/ws2/derive_snap.py): it is placed in that tehsil, with the distance stated
     sea      seaward of the Arabian Sea coastline (outlook.mjs COASTLINE, Iranian border to Sir Creek) and not snapped: "at sea"
     outside  anything else: outside Pakistan-administered territory, as before
   A disputed unit (IIOJK) is never a snap target. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COASTLINE, coastKm } from './outlook.mjs';

let G = null, GD = null, SNAP = undefined, SD = null;
function load(dataDir) {
  if (G && GD === dataDir) return G; GD = dataDir;
  try { G = JSON.parse(readFileSync(join(dataDir, 'pk-tehsils.json'), 'utf8')).features.map((f) => {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of polys) for (const [x, y] of p[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { uid: f.properties.uid, bbox: [x0, y0, x1, y1], rings: polys.map((p) => p[0]) }; }); } catch (_) { G = []; }
  return G;
}
export function snapRule(dataDir) { if (SNAP !== undefined && SD === dataDir) return SNAP; SD = dataDir; try { SNAP = JSON.parse(readFileSync(join(dataDir, 'territory-snap.json'), 'utf8')); } catch (_) { SNAP = null; } return SNAP; }
/* km from (lat, lon) to the segment a-b ([lon, lat] pairs), on a local equirectangular plane (segments are a few km) */
function segKm(lat, lon, a, b) {
  const kx = 111.32 * Math.cos(lat * Math.PI / 180), ky = 110.57;
  const ax = (a[0] - lon) * kx, ay = (a[1] - lat) * ky, bx = (b[0] - lon) * kx, by = (b[1] - lat) * ky;
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; let t = L ? -(ax * dx + ay * dy) / L : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + t * dx, ay + t * dy);
}
/* true when the point lies south of the coastline polyline within its longitude span (the sea side) */
export function seaward(lat, lon) {
  for (let i = 0; i < COASTLINE.length - 1; i++) { const [x1, y1] = COASTLINE[i], [x2, y2] = COASTLINE[i + 1];
    if (lon >= Math.min(x1, x2) && lon <= Math.max(x1, x2)) { const y = y1 + (y2 - y1) * (lon - x1) / ((x2 - x1) || 1e-9); return lat < y; } }
  return false;
}
/* units: app.units.tehsil (unitId, disputed). Returns { kind: 'snapped', unit, km } | { kind: 'sea' } | { kind: 'outside' } | null (no rule) */
export function classifyOutside(dataDir, units, lat, lon) {
  const R = snapRule(dataDir); if (!R || !Number.isFinite(R.snapKm)) return null;
  /* only the shore is snapped, never a land border (a point 2 km inside India at Wagah stays outside): the point must be seaward of the
     coastline polyline or within two median boundary segments of it */
  const sea = seaward(lat, lon), nearCoast = sea || (Number.isFinite(R.medianSegmentKm) && coastKm(lat, lon) <= 2 * R.medianSegmentKm);
  if (!nearCoast) return { kind: 'outside' };
  const byId = new Map((units || []).map((u) => [u.unitId, u])); const pad = R.snapKm / 100;
  let best = null, bd = Infinity;
  for (const f of load(dataDir)) {
    const u = byId.get(f.uid); if (!u || u.disputed) continue;
    if (lon < f.bbox[0] - pad || lon > f.bbox[2] + pad || lat < f.bbox[1] - pad || lat > f.bbox[3] + pad) continue;
    for (const r of f.rings) for (let i = 0; i < r.length - 1; i++) { const d = segKm(lat, lon, r[i], r[i + 1]); if (d < bd) { bd = d; best = u; } }
  }
  if (best && bd <= R.snapKm) return { kind: 'snapped', unit: best, km: Math.round(bd * 10) / 10 };
  if (sea) return { kind: 'sea' };
  return { kind: 'outside' };
}
export const SEA_WHY = 'this point is at sea, off the coast of Pakistan. NIGRAAN forecasts places on land; choose a point on the shore for a forecast and hazard levels.';
