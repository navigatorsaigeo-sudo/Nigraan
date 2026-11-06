/* v91.17.91 · the feature-grid bands at every national-model point (station-lake/archive/national/points.csv ->
   features.json): the same values the server reads at a point (featgrid.mjs value(band, lat, lon)).
   node scripts/national_features.mjs [<lake>]   (default ../station-lake) */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFeatGrid } from '../server/api/featgrid.mjs';
const here = dirname(fileURLToPath(import.meta.url)); const app = join(here, '..');
const lake = process.argv[2] || join(app, '..', 'station-lake');
const fg = createFeatGrid(join(app, 'data'), { maxBlocks: 256 });
const L = readFileSync(join(lake, 'archive', 'national', 'points.csv'), 'utf8').trim().split(/\r?\n/); const H = L[0].split(',');
const ix = (k) => H.indexOf(k); const bands = fg.list().sort(); const out = [];
for (const line of L.slice(1)) { const c = line.split(','); const lat = +c[ix('lat')], lon = +c[ix('lon')]; const f = { pid: c[ix('pid')] }; for (const b of bands) f[b] = fg.value(b, lat, lon); out.push(f); }
writeFileSync(join(lake, 'archive', 'national', 'features.json'), JSON.stringify(out));
console.log('features', out.length, 'points', bands.length, 'bands');
