/* v91.17.281 GEO281 · WHICH NAMED AREA CONTAINS THIS POINT (OpenStreetMap polygons, offline).
   Reads data/place-areas/pk-place-areas.json.gz (scripts/gen/build_place_areas.mjs: OSM settlement-type landuse polygons joined by
   feature id to their named label, from the local street map). A point is located in its z15 tile, the polygon pieces of that tile
   are tested (even-odd over every ring of a piece, holes included) and the SMALLEST named area holding the point wins
   (F-11/1 inside F-11 → F-11/1). No containing area → null; the caller then says "near X" with the distance and never "in X".

   createPlaceAreas(dataDir) → { lookup(lat, lon) → { name, kind, areaM2, localName, label:{lat,lon}, within:[...larger areas] } | null,
                                 ready(), meta() }
   Memory: tiles are decoded on first touch into Int32Array rings and kept in an LRU of 4,096 tiles. */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

export const PLACE_AREAS_FILE = join('place-areas', 'pk-place-areas.json.gz');
const LRU_MAX = 4096;

export function createPlaceAreas(dataDir) {
  let D = null, loadedMtime = 0, err = null; const cache = new Map();
  const file = dataDir ? join(dataDir, PLACE_AREAS_FILE) : null;
  function load() {
    if (!file || !existsSync(file)) { D = null; err = 'no named-area index at data/' + PLACE_AREAS_FILE.replace(/\\/g, '/'); return null; }
    let m = 0; try { m = statSync(file).mtimeMs; } catch (_) {}
    if (D && m === loadedMtime) return D;
    try { D = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')); loadedMtime = m; cache.clear(); err = null; }
    catch (e) { D = null; err = 'named-area index unreadable: ' + e.message; }
    return D;
  }
  function pieces(key) {
    let p = cache.get(key); if (p) { cache.delete(key); cache.set(key, p); return p; }
    const flat = D.tiles[key]; p = [];
    if (flat) for (let i = 0; i < flat.length;) {
      const ai = flat[i++], nr = flat[i++]; const rings = [];
      for (let r = 0; r < nr; r++) { const m = flat[i++]; const a = new Int32Array(m * 2); let x = flat[i++], y = flat[i++]; a[0] = x; a[1] = y;
        for (let k = 1; k < m; k++) { x += flat[i++]; y += flat[i++]; a[2 * k] = x; a[2 * k + 1] = y; } rings.push(a); }
      p.push({ ai, rings });
    }
    cache.set(key, p); if (cache.size > LRU_MAX) cache.delete(cache.keys().next().value);
    return p;
  }
  function inside(px, py, rings) {   /* even-odd over all rings: outer rings and holes of an MVT polygon feature */
    let c = false;
    for (const r of rings) { const n = r.length; for (let i = 0, j = n - 2; i < n; j = i, i += 2) { const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) c = !c; } }
    return c;
  }
  function lookup(lat, lon) {
    lat = Number(lat); lon = Number(lon); if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85) return null;
    if (!load()) return null;
    const n = 2 ** D.z, E = D.extent || 4096;
    const fx = (lon + 180) / 360 * n, s = Math.sin(lat * Math.PI / 180), fy = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
    const x = Math.floor(fx), y = Math.floor(fy); const px = (fx - x) * E, py = (fy - y) * E;
    const hits = new Map();
    for (const p of pieces(x + '/' + y)) if (!hits.has(p.ai) && inside(px, py, p.rings)) hits.set(p.ai, D.areas[p.ai]);
    if (!hits.size) return null;
    const list = [...hits.values()].sort((a, b) => a[2] - b[2]);
    const a = list[0];
    return { name: a[0], kind: D.kinds[a[1]], areaM2: a[2], localName: a[5] || null, label: { lat: a[3], lon: a[4] },
      within: list.slice(1).map((b) => ({ name: b[0], kind: D.kinds[b[1]], areaM2: b[2] })), source: 'OpenStreetMap area (containing polygon)' };
  }
  return { lookup, ready: () => !!load(), why: () => err,
    meta: () => (load() ? { built: D.built, source: D.source, licence: D.licence, areas: D.areas.length, tiles: Object.keys(D.tiles).length, z: D.z } : { error: err }) };
}
