/* ══ v91.17.207 · RIVER FLOOD DEPTH AT AN ASSET (phase B) ═══════════════════════════════════════════════════════════════════════════
   The depth of an UNDEFENDED river flood of return period 10 to 500 years at the asset's own 90 m cell, from the JRC / Copernicus GloFAS
   global river flood hazard maps v2.1.2 (Baugh et al. 2024; station-lake/scripts/jrc_flood_depth.py packs the Pakistan tiles into
   data/flood-depth/). With the asset's floor height above the ground (when recorded) it says from which return period water reaches
   the floor and how deep it stands there. What it is not: a site flood level (no local embankments, drains or buildings in the map;
   ~90 m cells; river floods only, not rain ponding or flash floods). Those limits travel with every answer.
   Read: one 1-degree file per lookup area, 0.1-degree blocks inflated on demand; a few files and blocks are kept in memory. */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

export function createFloodDepth(dataDir) {
  const dir = join(dataDir, 'flood-depth');
  let IX = null; try { IX = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')); } catch (_) { IX = null; }
  const files = new Map(), blocks = new Map();
  const lru = (m, k, v, max) => { m.delete(k); m.set(k, v); while (m.size > max) m.delete(m.keys().next().value); return v; };
  const G = IX ? IX.grid : null, RPS = IX ? IX.returnPeriods : [];
  function file(name) {
    if (files.has(name)) return lru(files, name, files.get(name), 6);
    const p = join(dir, name); if (!existsSync(p)) return lru(files, name, null, 6);
    const b = readFileSync(p); if (b.toString('latin1', 0, 4) !== 'AGNJ') return lru(files, name, null, 6);
    const nb = b.readUInt16LE(6), idx = []; for (let k = 0; k < nb * nb; k++) idx.push([b.readUInt32LE(8 + 8 * k), b.readUInt32LE(12 + 8 * k)]);
    return lru(files, name, { b, nb, idx, nrp: b.readUInt8(5) }, 6);
  }
  /* depth (m) per return period at global cell (row, col); null when the cell lies outside the packed area */
  function cell(row, col) {
    const N = G.cellsPerDegree, B = G.block, cr = Math.floor(row / N), cc = Math.floor(col / N);
    const name = 'jrc_N' + (G.top - cr) + '_E' + (G.left + cc) + '.bin';
    const inPack = IX.files && IX.files[name];
    if (!inPack) return RPS.map(() => 0);   /* a 1-degree cell near Pakistan with no wet cell was not written: dry */
    /* v91.17.281 · INTEG281 D · the index lists this tile but it is not on disk (or unreadable): the map is unknown here, never dry */
    const f = file(name); if (!f) { missing.add(name); return RPS.map(() => 0); }
    const lr = row - cr * N, lc = col - cc * N, bi = Math.floor(lr / B), bj = Math.floor(lc / B), k = bi * f.nb + bj, [o, l] = f.idx[k];
    if (!l) return RPS.map(() => 0);
    const bk = name + ':' + k; let a = blocks.get(bk); if (!a) a = lru(blocks, bk, inflateSync(f.b.subarray(o, o + l)), 48); else lru(blocks, bk, a, 48);
    const r = lr - bi * B, c = lc - bj * B; return RPS.map((_, i) => a[i * B * B + r * B + c] / 10);
  }
  let missing = new Set();
  function at(lat, lon, floorM = null) {
    if (!IX || !G) return { ready: false, why: 'the river flood depth maps are not installed (data/flood-depth)' };
    missing = new Set(); const r = at0(lat, lon, floorM);
    if (missing.size) return { ready: false, unknown: true, status: 'not available', missingTiles: [...missing].sort(),
      why: 'unknown: the river flood map for this area is listed but not installed on this server, so whether this place floods is not available (not dry)' };
    return r;
  }
  function at0(lat, lon, floorM = null) {
    lat = Number(lat); lon = Number(lon); if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { ready: false, why: 'no coordinate' };
    const N = G.cellsPerDegree, row = Math.floor((G.top - lat) * N), col = Math.floor((lon - G.left) * N);
    if (row < 0 || col < 0) return { ready: false, why: 'outside the packed maps' };
    const here = cell(row, col);
    /* the 3 x 3 cells around (about 270 m): the map's own position error is about a cell, so a dry cell beside a wet one is said */
    const near = RPS.map(() => 0); for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) cell(row + dr, col + dc).forEach((v, i) => { if (v > near[i]) near[i] = v; });
    const fl = Number.isFinite(Number(floorM)) && floorM !== null && floorM !== '' ? Number(floorM) : null;
    const firstWet = RPS.find((_, i) => here[i] > 0) || null;
    /* v91.17.255 · C-27 · WHERE THE MAP IS DRY, HOW FAR IS ITS NEAREST WET GROUND (CEO 12 Oct, HISAAB review checked on NIGRAAN: Nowshera
       city read "dry up to 1-in-500" 1 km from a bank the map floods 6 m deep in a 1-in-10 flood, and the town was under water in 2010).
       Rings of cells out to about 3 km are searched for the nearest cell wet in the rarest mapped flood; its distance and the first
       return period that wets it are given, so a reader sees that the map draws the river beside the site and stops short of it. */
    let nearestWet = null;
    if (firstWet == null && !near.some((v) => v > 0)) {
      const kmPerRow = 111.2 / N, kmPerCol = 111.2 * Math.cos(lat * Math.PI / 180) / N, R = Math.ceil(3 / kmPerRow);
      for (let rad = 2; rad <= R && !nearestWet; rad++) {
        let best = null;
        for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) { if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
          const v = cell(row + dr, col + dc); const j = v.findIndex((x) => x > 0); if (j < 0) continue;
          const km = Math.hypot(dr * kmPerRow, dc * kmPerCol); if (!best || km < best.km) best = { km: Math.round(km * 10) / 10, firstWetReturnPeriod: RPS[j], depthM: v[j] }; }
        if (best) nearestWet = best;
      }
    }
    const reach = fl == null ? null : (RPS.find((_, i) => here[i] > fl) || null);
    const rows = RPS.map((T, i) => ({ returnPeriod: T, depthM: here[i], within270mM: near[i], aboveFloorM: fl == null ? null : Math.max(0, Math.round((here[i] - fl) * 10) / 10) }));
    const words = firstWet == null ? (near.some((v) => v > 0) ? 'dry at the asset\'s cell, but the 1-in-' + RPS.find((_, i) => near[i] > 0) + ' flood reaches within about 270 m'
        : 'dry at this cell in every mapped river flood up to 1 in ' + RPS[RPS.length - 1] + (nearestWet ? '; the map\'s nearest wet ground is ' + nearestWet.km + ' km away (wet from the 1-in-' + nearestWet.firstWetReturnPeriod + ' flood)' : '; no mapped wet ground within 3 km'))
      : 'wet from the 1-in-' + firstWet + ' river flood (' + here[RPS.indexOf(firstWet)] + ' m)' + (fl == null ? '' : reach == null ? '; water stays below the ' + fl + ' m floor up to 1 in ' + RPS[RPS.length - 1] : '; water reaches the ' + fl + ' m floor from 1 in ' + reach + ' (' + rows[RPS.indexOf(reach)].aboveFloorM + ' m above it)');
    return { ready: true, source: IX.source, version: IX.version, returnPeriods: RPS, rows, firstWetReturnPeriod: firstWet, nearestWet, floorM: fl, floorReachedFrom: reach, summary: words,
      limits: 'undefended river flooding (no embankments, drains or buildings in the map); about 90 m cells; river floods only, not rain ponding or flash floods; rivers with small catchments (nullahs, hill streams, town drains) are not drawn. A design flood level needs a hydraulic study of the site.', check: IX.check ? { hitRate2010RP100: IX.check.results && IX.check.results['2010_RP100'] ? IX.check.results['2010_RP100'].hitRate : null, baseRate2010: IX.check.results && IX.check.results['2010_RP100'] ? IX.check.results['2010_RP100'].baseRate : null } : null };
  }
  /* v91.17.283.8 · the depths of the one cell at a point (no neighbourhood, no summary), for the flood shadow agent; a listed tile that is not
     on disk is reported (missing), never read as dry */
  function cellDepths(lat, lon) { if (!IX || !G) return null; const N = G.cellsPerDegree, row = Math.floor((G.top - Number(lat)) * N), col = Math.floor((Number(lon) - G.left) * N);
    if (!(row >= 0) || !(col >= 0)) return null; missing = new Set(); const d = cell(row, col); return missing.size ? { missing: [...missing][0] } : { depths: d }; }
  return { at, cellDepths, ready: () => !!IX, info: () => IX ? { version: IX.version, returnPeriods: RPS, files: Object.keys(IX.files || {}).length } : null };
}
