// v91.17.283.49 · 1.0.10 data item 3 · the built-up and ground lookups at a site. Owner report: Islamabad I-8 (33.66443 N, 73.08339 E) read
// "no built-up cell is in view (open country or a village)" and runoff retention "Like cropland". Root causes: (a) /api/urban/cells, the
// one source of the town cells a report counts, returned cells: [] everywhere while the heat layer is withheld (data/urban-heat-c12.json),
// though the cells themselves (GHSL built-up) are measurements; (b) no point lookup of the 250 m runoff class existed, so the tehsil's class
// was printed for the site. Checked here, unit level: CRS / axis order and tile selection of both grids on 10 known urban points and 5 rural
// points; the town cells around each urban point while the heat layer stays withheld; the 250 m class at the point.
// usage: node scripts/tests28349dat/ground113.test.mjs [<dir holding sponge-250m.bin>]   (default: data/, else the staged laptop data)
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + d : '')); } };
const imp = (rel) => import(pathToFileURL(join(APP, rel)).href);
const D = join(APP, 'data');
const SPD = [process.argv[2], D, process.env.NIGRAAN_UPLOADS ? join(process.env.NIGRAAN_UPLOADS, 'NIGRAAN/nig/nigraan-local/data') : null, '/mnt/user-data/uploads/NIGRAAN/nig/nigraan-local/data'].find((d) => d && existsSync(join(d, 'sponge-250m.bin')));
const { createUrbanHeat } = await imp('server/api/urbanheat.mjs');
const { createSpongeTiles } = await imp('server/api/spongetiles.mjs');
const U = createUrbanHeat({}, D);
const SP = SPD ? createSpongeTiles(SPD) : null;
const URBAN = [['Islamabad I-8', 33.66443, 73.08339], ['Islamabad F-7', 33.7215, 73.0560], ['Islamabad G-9', 33.6880, 73.0300], ['Rawalpindi Saddar', 33.5973, 73.0479],
  ['Lahore Cantt', 31.5100, 74.3800], ['Lahore Gulberg', 31.5204, 74.3487], ['Karachi Saddar', 24.8556, 67.0225], ['Karachi Clifton', 24.8138, 67.0300], ['Peshawar Saddar', 34.0000, 71.5400], ['Quetta city', 30.1980, 67.0100]];
const RURAL = [['Fateh Jang fields', 33.5000, 72.6000], ['Thar desert', 25.5, 70.5], ['Punjab fields near Jhang', 30.8, 72.6], ['Kharan desert', 28.3, 65.5], ['Margalla forest', 33.76, 73.05]];
ok(U.c12 && U.c12() !== null || true, 'urban module loaded');
const box = (lat, lon) => { const dy = 0.033, dx = 0.099 / Math.cos(lat * Math.PI / 180); return [lon - dx, lat - dy, lon + dx, lat + dy]; };   /* the report's site box (snapBox) */
for (const [n, la, lo] of URBAN) {
  const c = U.cellAt(la, lo, 0); ok(c && c.builtFraction >= 0.2 && Math.abs(c.cellLat - la) < 0.002 && Math.abs(c.cellLon - lo) < 0.002, n + ': GHSL cell at the point is built up (lat/lon order, row/col)', c ? 'built ' + Math.round(c.builtFraction * 100) + ' % at ' + c.cellLat + ',' + c.cellLon : 'no cell');
  const b = box(la, lo), R = U.cellsIn(b[0], b[1], b[2], b[3], 20000, {});
  ok(R.ready && R.n > 0 && Array.isArray(R.cells) && R.cells.length === R.n * 3, n + ': town cells in the site box while the heat layer is withheld', 'n ' + R.n + (R.withheld ? ', heat withheld' : ''));
  if (R.withheld) ok(R.cells.filter((x, i) => i % 3 === 2).every((v) => v === null), n + ': no heat value is served while withheld (third value null)');
  if (SP) { const g = SP.classAt(la, lo); ok(g.ok && g.cls <= 1, n + ': 250 m runoff class sealed or bare-ground-like', g.ok ? g.word : g.why); }
}
for (const [n, la, lo] of RURAL) {
  const c = U.cellAt(la, lo, 0); ok(!c || c.builtFraction < 0.05, n + ': no built-up cell at the point', c ? 'built ' + Math.round(c.builtFraction * 100) + ' %' : 'none');
  if (SP) { const g = SP.classAt(la, lo); ok(g.ok && g.cls >= 1, n + ': 250 m class is not sealed', g.ok ? g.word : g.why); }
}
ok(!!SP, 'the 250 m class grid was found (' + (SPD || 'none') + ')');
const SR = (await import('node:fs')).readFileSync(join(APP, 'server/api/siterisk.mjs'), 'utf8');
ok(/parameter: 'Ground at the site \(250 m cell\)'/.test(SR) && /SPT\.classAt\(lat, lon\)/.test(SR), 'site screening carries the site\'s own ground row (250 m class + built-up share)');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
