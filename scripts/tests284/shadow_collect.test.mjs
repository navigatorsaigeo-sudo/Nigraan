/* v91.17.284 · shadow collector (D:\NIGRAAN\_admin\shadow\shadow_collect.mjs) against a mock local server (no provider, no key).
     S1  run due, budget normal: det + wn2 stored under data/shadow_models/runs/<YYYYMMDDHH>/, weights 55 and 1,056 (server weightOf)
     S2  every provider request went to /px with x-agn-internal shadow-models and __raw=1 (no key handled by the collector)
     S3  the stored values are the 6-hourly steps; P6 = sum of the 6 hourly values ending at the step; WN2 keeps its 64 members
     S4  second attempt: nothing fetched (already stored)
     S5  budget state over the shed level: nothing fetched, exit 2
     S6  metadata still on the previous run: nothing fetched, exit 3; a newer run already served: missed, nothing fetched
   usage: node scripts/tests284/shadow_collect.test.mjs --collector <path to shadow_collect.mjs> */
import http from 'node:http';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { existsSync as _ex } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d != null ? ' :: ' + String(d).slice(0, 400) : '')); } };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
/* v283.10 integration: with no --collector argument the script is looked up where it lives: the cloud tree's _admin\shadow, else the laptop's
   D:\NIGRAAN\_admin\shadow (two folders above nigraan-local); not found = SKIP (exit 77) */
const _pick = (flag, name) => { const a = process.argv.slice(2), i = a.indexOf(flag); if (i >= 0 && a[i + 1]) return a[i + 1];
  for (const p of [join(ROOT, '_admin', 'shadow', name), join(ROOT, '..', '..', '_admin', 'shadow', name)]) if (_ex(p)) return p;
  console.log('SKIP ' + name + ' not found (pass ' + flag + ' <path>)'); process.exit(77); };
const COL = _pick('--collector', 'shadow_collect.mjs');
const APP = mkdtempSync(join(tmpdir(), 'agn-sh-')); mkdirSync(join(APP, 'data')); mkdirSync(join(APP, 'server', 'api'), { recursive: true });
for (const f of ['provider.mjs', 'store.mjs', 'core.mjs']) copyFileSync(join(ROOT, 'server', 'api', f), join(APP, 'server', 'api', f));
copyFileSync(join(ROOT, 'package.json'), join(APP, 'package.json'));
copyFileSync(join(ROOT, 'data', 'synop-stations.json'), join(APP, 'data', 'synop-stations.json'));
const ST = JSON.parse(readFileSync(join(APP, 'data', 'synop-stations.json'), 'utf8')).stations;
const NOW = '2026-10-23T10:00:00Z', INIT = Date.parse('2026-10-23T00:00:00Z') / 1000;
let state = 'normal', metaInit = INIT; const seen = [];
const hourly = (lat, models, members) => { const h = { time: [] }; for (let k = 0; k <= 96; k++) h.time.push(new Date((INIT + k * 3600) * 1000).toISOString().slice(0, 16));
  const put = (suf, off) => { h['temperature_2m' + suf] = h.time.map((_, k) => lat + k * 0.01 + off); h['wind_speed_10m' + suf] = h.time.map(() => 2 + off); h['precipitation' + suf] = h.time.map((_, k) => (k % 6 === 0 ? 0.6 : 0.1)); };
  if (members) { put('', 0); for (let m = 1; m < 64; m++) put('_member' + String(m).padStart(2, '0'), m / 100); } else for (const m of models) put('_' + m, models.indexOf(m)); return h; };
const srv = http.createServer((req, res) => { const u = new URL(req.url, 'http://x'); const send = (c, o) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname.endsWith('/static/meta.json')) return send(200, { last_run_initialisation_time: metaInit, last_run_availability_time: metaInit + 7 * 3600, update_interval_seconds: 21600 });
  if (u.pathname === '/api/ops/budget') return send(200, { budget: { configured: true, state, dailyWeightedCap: 161290, tiers: [{ tier: 'P6', state: 'running' }], projection: { exceedsPlan: true } } });
  if (u.pathname.startsWith('/px/')) { seen.push({ path: u.pathname, tag: req.headers['x-agn-internal'], raw: u.searchParams.get('__raw'), q: u.searchParams });
    const la = u.searchParams.get('latitude').split(',').map(Number), lo = u.searchParams.get('longitude').split(',').map(Number), el = u.searchParams.get('elevation').split(',');
    const ens = u.pathname === '/px/v1/ensemble', models = u.searchParams.get('models').split(',');
    return send(200, la.map((x, i) => ({ latitude: x, longitude: lo[i], elevation: el[i] === 'nan' ? 100 : Number(el[i]), hourly: hourly(x, models, ens) }))); }
  send(404, {}); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const PORT = srv.address().port;
const run = () => new Promise((resolve) => { const env = { ...process.env, NIGRAAN_SHADOW_META_BASE: 'http://127.0.0.1:' + PORT + '/meta' };
  import('node:child_process').then(({ spawn }) => { const c = spawn(process.execPath, [COL, '--app', APP, '--port', String(PORT), '--now', NOW], { env }); let o = ''; c.stdout.on('data', (d) => o += d); c.stderr.on('data', (d) => o += d); c.on('close', (code) => resolve({ code, o })); }); });
try {
  const r1 = await run(); const dir = join(APP, 'data', 'shadow_models', 'runs', '2026102300');
  ok(r1.code === 0 && ['ecmwf_ifs', 'ecmwf_ifs025', 'ecmwf_aifs025_single', 'google_weathernext2_ensemble'].every((m) => existsSync(join(dir, m + '.json'))), 'S1 det and wn2 stored', r1.code + ' ' + r1.o);
  const L = readFileSync(join(APP, 'data', 'shadow_models', 'ledger.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  ok(L.length === 2 && L.find((x) => x.group === 'det').weighted === 55 && L.find((x) => x.group === 'wn2').weighted === 1056, 'S1 weights 55 + 1,056 per run (2,222 a day)', JSON.stringify(L.map((x) => [x.group, x.weighted])));
  ok(seen.length === 2 && seen.every((s) => s.tag === 'shadow-models' && s.raw === '1' && !s.q.has('apikey')), 'S2 through /px, tagged, raw, no key', JSON.stringify(seen.map((s) => [s.path, s.tag, s.raw])));
  const ifs = JSON.parse(readFileSync(join(dir, 'ecmwf_ifs.json'), 'utf8')), wn = JSON.parse(readFileSync(join(dir, 'google_weathernext2_ensemble.json'), 'utf8'));
  const i0 = ifs.stations.findIndex((s) => s.id === '41640'), lat = ST['41640'].lat;
  ok(ifs.steps.length === 16 && ifs.steps[0] === '2026-10-23T06:00Z' && Math.abs(ifs.T[i0][0] - Math.round((lat + 0.06) * 10) / 10) < 1e-9 && ifs.P6[i0][0] === 1.1 && ifs.W[i0][0] === 2,
    'S3 steps +6..+96 h, T at the step, P6 = 6 hourly values (0.6 + 5 x 0.1)', JSON.stringify([ifs.steps[0], ifs.T[i0][0], ifs.P6[i0][0], ifs.W[i0][0]]));
  ok(wn.members.length === 64 && wn.T[i0].length === 64 && wn.T[i0][5].length === 16, 'S3 WN2: 64 members x 16 steps per station', wn.members.length);
  const n0 = seen.length; const r2 = await run(); ok(seen.length === n0 && r2.code === 0, 'S4 already stored: no request', r2.o);
  rmSync(join(APP, 'data', 'shadow_models', 'runs'), { recursive: true, force: true }); state = 'background shed: user-facing calls only';
  const r3 = await run(); ok(seen.length === n0 && r3.code === 2 && /budget status is over/.test(r3.o), 'S5 budget over: nothing fetched, exit 2', r3.o);
  state = 'normal'; metaInit = INIT - 12 * 3600; const r4 = await run(); ok(seen.length === n0 && r4.code === 3, 'S6 previous run still served: wait, exit 3', r4.o);
  metaInit = INIT + 6 * 3600; const r5 = await run(); ok(seen.length === n0 && /missed/.test(r5.o), 'S6 newer run already served: missed, nothing fetched', r5.o);
} catch (e) { ok(false, 'test run', e && e.stack || e); }
finally { srv.close(); rmSync(APP, { recursive: true, force: true }); }
console.log(`\nshadow collector: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
