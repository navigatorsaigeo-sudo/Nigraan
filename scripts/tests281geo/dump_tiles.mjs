/* GEO281 · dump chosen layers of chosen tiles of a .pmtiles archive as lon/lat JSON (for the alignment measurements).
   usage: node dump_tiles.mjs <archive> <layers,comma> < tiles.json([[z,x,y],...])  > features.json */
import { openPmtiles } from '../../server/api/pmtiles.mjs';
import { decodeTile } from '../gen/build_place_areas.mjs';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
const P = openPmtiles(process.argv[2]); const want = new Set(process.argv[3].split(','));
const req = JSON.parse(readFileSync(0, 'utf8')); const out = [];
for (const [z, x, y] of req) { let b = P.tile(z, x, y); if (!b) continue; if (P.tileEncoding === 'gzip') b = gunzipSync(b);
  const L = decodeTile(b, want); const n = 2 ** z;
  for (const [ln, fs] of Object.entries(L)) for (const f of fs) {
    const rings = f.rings.map((r) => { const o = []; for (let i = 0; i < r.length; i += 2) { const px = r[i] / f.extent, py = r[i + 1] / f.extent;
      o.push([(x + px) / n * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + py) / n))) * 180 / Math.PI]); } return o; });
    out.push({ tile: [z, x, y], layer: ln, type: f.type, props: f.props, rings }); } }
process.stdout.write(JSON.stringify(out));
