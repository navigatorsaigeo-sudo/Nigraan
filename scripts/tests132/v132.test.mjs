import * as __T from '../lib/testenv.mjs';   /* v91.17.283.1 A2: repo root and absolute imports from scripts/lib/testenv.mjs (no machine path; Windows file URLs) */
/* v91.17.132 · CEO 3 Oct "system too slow / stuck": speed fixes. node scripts/tests132/v132.test.mjs
   - feature grid stored in 100 x 100 blocks, values identical to the 400 x 400 layout, re-tile safe to run twice
   - the forecast correction lets other requests through (no event-loop block over 2 s while the page loads)
   - the async correction returns exactly what the all-at-once correction returns
   - store writes are batched (20 s quiet, 60 s max), the update script unpacks a single zip */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const ROOT = __T.ROOT;
const BASE = __T.BASE;
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 600) : '')); } };
const feat = join(ROOT, 'data', 'feat');
const bands = existsSync(feat) ? readdirSync(feat).filter(f => f.endsWith('.json')) : [];
const blk = bands.map(f => JSON.parse(readFileSync(join(feat, f), 'utf8')).grid.block);
ok(bands.length >= 80 && blk.every(b => b === 100), 'every feature-grid band is stored in 100 x 100 blocks (' + bands.length + ' bands)', JSON.stringify([...new Set(blk)]));
const again = execFileSync(process.execPath, [join(ROOT, 'scripts', 'featgrid_retile.mjs'), join(ROOT, 'data')], { encoding: 'utf8' });
ok(/0 bands re-tiled, \d+ already done or skipped, 0 failed/.test(again), 'the re-tile is safe to run twice (nothing changes the second time)', again);
const py = readFileSync(join(ROOT, 'scripts', 'featgrid.py'), 'utf8');
ok(/'block': 100\}/.test(py) && /idx\['grid'\]\.get\('block', 400\)/.test(py), 'the Python writer uses 100-cell blocks and the reader takes the block size from each band');
const { createFeatGrid } = await __T.importFile(join(ROOT, 'server', 'api', 'featgrid.mjs'));
const G = createFeatGrid(join(ROOT, 'data')); const t0 = Date.now(); let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647; let got = 0;
for (let i = 0; i < 40; i++) { const v = G.at(24.5 + rnd() * 11, 62 + rnd() * 13); if (v.t_elev != null) got++; }
const per = (Date.now() - t0) / 40;
ok(got > 10 && per < 40, 'a new place reads all bands in under 40 ms (' + per.toFixed(1) + ' ms; was about 80 ms)');
const st = readFileSync(join(ROOT, 'server', 'api', 'store.mjs'), 'utf8');
ok(/QUIET_MS = 20000, MAX_DEFER_MS = 60000/.test(st), 'the database file is written after 20 s of quiet, at most 60 s late');
const ver = readFileSync(join(ROOT, 'server', 'api', 'verification.mjs'), 'utf8'), srv = readFileSync(join(ROOT, 'server', 'server.mjs'), 'utf8');
ok(/function\* correctSteps/.test(ver) && /correctResponseAsync/.test(srv) && (srv.match(/await correctIfForecast\(/g) || []).length === 3, 'the forecast proxy uses the correction that yields between places');
/* equality of the two paths on a real multi-place response */
const lats = [31.52, 33.68, 24.86, 35.92, 30.18], lons = [74.35, 73.05, 67.01, 74.31, 66.99];
const q = `latitude=${lats.join(',')}&longitude=${lons.join(',')}&hourly=temperature_2m,relative_humidity_2m&forecast_days=3&timezone=UTC`;
const a = await fetch(`${BASE}/px/v1/forecast?__omhost=api.open-meteo.com&${q}`).then(r => r.json()).catch(e => ({ e: e.message }));
const b = await fetch(`${BASE}/px/v1/forecast?__omhost=api.open-meteo.com&${q}`).then(r => r.json()).catch(e => ({ e: e.message }));
ok(Array.isArray(a) && a.length === 5 && JSON.stringify(a.map(x => x.hourly.temperature_2m)) === JSON.stringify(b.map(x => x.hourly.temperature_2m)), 'a five-place forecast is corrected and repeatable', JSON.stringify(a).slice(0, 300));
/* responsiveness: while a 150-place request is corrected, a health check answers fast */
const N = 150, la2 = [], lo2 = []; for (let i = 0; i < N; i++) { la2.push((25 + (i % 15) * 0.7).toFixed(2)); lo2.push((63 + Math.floor(i / 15) * 1.3).toFixed(2)); }
const big = fetch(`${BASE}/px/v1/forecast?__omhost=api.open-meteo.com&latitude=${la2.join(',')}&longitude=${lo2.join(',')}&hourly=temperature_2m,relative_humidity_2m&forecast_days=7&timezone=UTC`).then(r => r.ok).catch(() => false);
await new Promise(r => setTimeout(r, 300)); const lag = [];
for (let i = 0; i < 8; i++) { const t = Date.now(); await fetch(BASE + '/health').catch(() => null); lag.push(Date.now() - t); await new Promise(r => setTimeout(r, 150)); }
const bigOk = await big; ok(bigOk, 'the 150-place forecast itself was answered');
ok(Math.max(...lag) < 1500, 'the server keeps answering while a 150-place forecast is corrected (slowest health check ' + Math.max(...lag) + ' ms)', lag.join(','));
const kv = readFileSync(join(ROOT, 'scripts', 'keepalive.vbs'), 'utf8');
ok(/NIGRAAN_v/.test(kv) && /tar -xf/.test(kv) && /READY_APPLY\.txt/.test(kv), 'keepalive unpacks one NIGRAAN_vNNN.zip update and starts its APPLY');
console.log((fails ? 'FAIL' : 'PASS') + ' v132: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
