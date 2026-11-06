/* v91.17.274 GRID · tests. usage: node scripts/tests274/grid274.test.mjs [basePort newPort]
   1 page: the street-map module is present once, after the Temperature detail module, CSP-sealed (every inline block hashed),
     its tile lattice is the feature grid's 1/400 degree lattice (tile edges on cell edges, 100 cells per 0.25 degree)
   2 server: natgrid works in slices and shares one answer between simultaneous asks; with two frozen servers (base, new) running
     the same mock data, the grid answers are byte-identical (temperature, dew point, humidity, UTCI) for four views incl. a tile
   3 served gates unchanged: data/natgrid-moist-gate.json serves the plains only (hills/mountain re-test failed, see CHANGES.md);
     data/moist-model.json wind applied nowhere (wind correction failed the storm-hour line)
   4 the analysis outputs exist (_grid274/out/moist_retest.json, wind_result.json) with the verdicts stated in CHANGES.md */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
const html = readFileSync(join(ROOT, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html'), 'utf8');
ok((html.match(/<script id="agn-v274-st250-js">/g) || []).length === 1 && (html.match(/<style id="agn-v274-st250-css">/g) || []).length === 1, 'street-map module present once');
ok(html.indexOf('agn-v274-st250-js') > html.indexOf('agn-v91-tmap-js'), 'module follows the Temperature detail module');
const csp = (html.match(/<meta[^>]*content="([^"]+)"[^>]*http-equiv="Content-Security-Policy"/i) || html.match(/http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/i) || [])[1] || '';
const blocks = [...html.matchAll(/<(script|style)((?:\s+[^>]*)?)>([\s\S]*?)<\/\1>/g)].filter(m => !/\bsrc=/.test(m[2]) && !/type="(?:application\/(?:ld\+)?json|text\/template)"/.test(m[2]));
const mine = blocks.filter(m => /agn-v274-st250/.test(m[2])).map(m => "'sha256-" + createHash('sha256').update(m[3], 'utf8').digest('base64') + "'");
ok(mine.length === 2 && mine.every(h => csp.includes(h)), 'module script and style hashed in the CSP');
const js = blocks.find(m => /agn-v274-st250-js/.test(m[2]))[3];
const TS = +js.match(/TS=([\d.]+)/)[1], NC = +js.match(/NC=(\d+)/)[1], s0 = +js.match(/PK=\{s:([\d.]+)/)[1], w0 = +js.match(/w:([\d.]+),n:/)[1], n0 = +js.match(/n:([\d.]+),e:/)[1];
const onLattice = (v) => Math.abs(v * 400 - Math.round(v * 400)) < 1e-6;
ok(Math.abs(TS * 400 - NC) < 1e-9, `tile = ${NC} cells of 1/400 degree (${TS} degree)`);
ok(onLattice(37.25 - s0) && onLattice(w0 - 60.75) && onLattice(37.25 - n0) && onLattice(TS), 'tile edges fall on the feature-grid cell edges (origin 37.25 N, 60.75 E)');
ok(/q=moist/.test(js) && /\/api\/hyperlocal\/grid/.test(js) && !/fetch\('\/api\/(?!hyperlocal\/grid)/.test(js), 'module asks only the existing grid answer');
ok(/ZMIN=13/.test(js) && /currentMapLayer/.test(js) && /agnTmap91Btn/.test(js), 'street zoom >= 13; raster only with a temperature/comfort layer; off while Temperature detail is on');
ok(!/PMD|FFD|MAE|skill/i.test(js.replace(/\/\*[\s\S]*?\*\//g, '')), 'no PMD/FFD names or skill numbers in client text');
const ng = readFileSync(join(ROOT, 'server', 'api', 'natgrid.mjs'), 'utf8');
ok(/await yieldNow\(\)/.test(ng) && /inflight\.has\(key\)/.test(ng), 'natgrid works in slices and shares in-flight answers');
const gate = JSON.parse(readFileSync(join(ROOT, 'data', 'natgrid-moist-gate.json'), 'utf8'));
ok(gate.zones.plains.dew && !gate.zones.hills.dew && !gate.zones.mountain.dew && !gate.zones.coast.dew, '250 m dew/RH/UTCI served in the plains only (gate file unchanged)');
const mm = JSON.parse(readFileSync(join(ROOT, 'data', 'moist-model.json'), 'utf8'));
ok(Object.values(mm.wind.zones).every(z => !z.applied), 'no wind correction served');
/* v91.17.276 · the analysis outputs ship in _admin/docs/v274/grid (the integration left the agent's _grid274 folder out); either place */
const GD = existsSync(join(ROOT, '_grid274', 'out', 'moist_retest.json')) ? join(ROOT, '_grid274', 'out') : join(ROOT, '_admin', 'docs', 'v274', 'grid');
const mr = join(GD, 'moist_retest.json'), wr = join(GD, 'wind_result.json');
if (existsSync(mr) && existsSync(wr)) {
  const M = JSON.parse(readFileSync(mr, 'utf8'))['since 13 Oct'], W = JSON.parse(readFileSync(wr, 'utf8'));
  ok(M.mountain.dew_pointModel_vs_raw.stations < 5 && (!M.hills || M.hills.dew_pointModel_vs_raw.stations < 5), 'hills/mountain: fewer than 5 held-out fleet stations since 13 Oct (rule cannot pass)');
  ok(Object.values(W.candidate_gate).every(g => g.verdict === 'FAIL'), 'wind candidate failed in every zone (not served)');
} else ok(false, 'analysis outputs present');
const [PB, PA] = process.argv.slice(2);
if (PB && PA) {
  const views = ['s=33.5000&w=72.7500&n=33.7500&e=73.0000&nx=100&ny=100&q=moist', 's=31.4&w=74.2&n=31.6&e=74.5&nx=60&ny=40&q=moist', 's=24.8&w=66.9&n=25.0&e=67.2&nx=50&ny=50', 's=35.75&w=74.25&n=36.0&e=74.5&nx=100&ny=100&q=moist'];
  for (const v of views) {
    const g = async (p) => { const r = await fetch(`http://127.0.0.1:${p}/api/hyperlocal/grid?${v}`); return r.text(); };
    const [a, b] = await Promise.all([g(PB), g(PA)]); let ja = null, jb = null; try { ja = JSON.parse(a); jb = JSON.parse(b); } catch (_) {}
    ok(ja && jb && ja.ok && JSON.stringify([ja.t, ja.td, ja.rh, ja.utci]) === JSON.stringify([jb.t, jb.td, jb.rh, jb.utci]), `grid answer identical base vs new: ${v}`);
  }
  /* two simultaneous asks of a new view on the new server: one answer, both identical */
  const v = 's=32.0000&w=73.0000&n=32.2500&e=73.2500&nx=100&ny=100&q=moist';
  const [x, y] = await Promise.all([1, 2].map(() => fetch(`http://127.0.0.1:${PA}/api/hyperlocal/grid?${v}`).then(r => r.text())));
  ok(x === y && JSON.parse(x).ok, 'simultaneous asks of one tile get the same answer');
}
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
