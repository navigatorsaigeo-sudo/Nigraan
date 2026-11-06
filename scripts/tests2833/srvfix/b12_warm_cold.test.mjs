/* budget cuts 1 and 2 (own server, WS1 mock provider with controllable model metadata; scripts/tests283/ws1/child.mjs):
     K1  restart with a held 9-model body over 60 min old, runs unchanged: the first request after the restart costs NO fetch (cut 2;
         base: the run key is not known yet, so the body is fetched again)
     K2  a member (UKMO) publishes a newer run; a keep-warm replay of that body: answered from the cache, no full 9-model fetch (cut 1;
         base: the replay fetched all nine models synchronously)
     K3  ... and the run-keyed refresh splices only the changed member's columns
     K4  a keep-warm replay of a body not held: 204, nothing fetched (cut 1)
   usage: node scripts/tests2833/srvfix/b12_warm_cold.test.mjs   env SRVFIX_PORT (default 9433), SRVFIX_TREE (the tree under test)
   Starts a server: run it only when no other NIGRAAN server or Chromium runs in the cloud slot. */
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, symlinkSync, renameSync, readdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TREE as ROOT, ok, done } from './lib.mjs';
const CHILD = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tests283', 'ws1', 'child.mjs');
const PORT = Number(process.env.SRVFIX_PORT || 9433);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DATA = mkdtempSync(join(tmpdir(), 'srvfix-b12-'));
const day = new Date().toISOString().slice(0, 10);
writeFileSync(join(DATA, 'nigraan-db.json'), JSON.stringify({ schemaVersion: 1, createdAt: new Date().toISOString(), collections: { quotaWindows: [{ providerId: 'mach', day, calls: 0, locations: 0, failures: 0, quotaErrors: 0, browserWeighted: 0, backendWeighted: 0 }] } }));
for (const f of ['provider-budget.json', 'source-labels.json']) { const s = join(ROOT, 'data', f); if (existsSync(s)) writeFileSync(join(DATA, f), readFileSync(s)); }
{ const j = JSON.parse(readFileSync(join(ROOT, 'data', 'provider-models.json'), 'utf8')); j.pollSeconds = 1; writeFileSync(join(DATA, 'provider-models.json'), JSON.stringify(j)); }
for (const f of ['feat', 'pk-tehsils.json', 'pk-tehsils-fine.json.gz']) { const s = join(ROOT, 'data', f); if (existsSync(s)) symlinkSync(s, join(DATA, f)); }
const META = join(DATA, 'meta-mock.json'), CALLS = join(DATA, 'calls.jsonl'); writeFileSync(CALLS, '');
const t0 = Math.floor(Date.now() / 1000) - 7 * 3600; const M = { '*': { init: t0, avail: t0 + 3600, interval: 6 * 3600 } };
const writeMeta = () => { writeFileSync(META + '.tmp', JSON.stringify(M)); renameSync(META + '.tmp', META); }; writeMeta();
const env = { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NIGRAAN_DATA_DIR: DATA, NIGRAAN_WORKER: '0', NIGRAAN_AUTO_SCHEDULE: '0', NIGRAAN_ENGINE: '0',
  NIGRAAN_PYJOBS: '0', NIGRAAN_SWEEP_WARM: '0', NIGRAAN_SYNOP: '0', NIGRAAN_MACH_DB_SYNC: '0', NIGRAAN_FLEET_BACKFILL: '0', NIGRAAN_VCARCHIVE: '0', NIGRAAN_WARM_MAX_S: '20',
  NIGRAAN_BLEND: '0', NIGRAAN_NATIONAL_POOL: '0', NIGRAAN_ZONE_ALL: '0', NIGRAAN_ALLOW_DEV_TOKEN: '1', MACH_API_KEY: 'test-key-not-a-real-key', WS1_META_FILE: META, WS1_CALL_LOG: CALLS };
delete env.OPEN_METEO_API_KEY; delete env.NIGRAAN_CALL_BUDGET; delete env.NIGRAAN_RUN_CACHE;
let srv = null, log = '';
const start = async () => { log = ''; srv = spawn(process.execPath, [CHILD, ROOT], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] }); srv.stdout.on('data', (d) => { log += d; }); srv.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 240; i++) { try { const h = await get('/health'); if (h.j && h.j.warm === true) return true; } catch (_) {} await sleep(500); } return false; };
const kill = async () => { if (!srv) return; const p = new Promise((r) => srv.on('exit', r)); try { srv.kill('SIGTERM'); } catch (_) {} await Promise.race([p, sleep(8000)]); try { srv.kill('SIGKILL'); } catch (_) {} srv = null; };
process.on('exit', () => { try { srv && srv.kill('SIGKILL'); } catch (_) {} try { rmSync(DATA, { recursive: true, force: true }); } catch (_) {} });
function get(path, headers = {}) {
  return new Promise((res) => { const rq = http.request({ host: '127.0.0.1', port: PORT, path, headers: { host: 'localhost:' + PORT, 'accept-encoding': 'identity', ...headers }, agent: false },
    (r) => { const ch = []; r.on('data', (d) => ch.push(d)); r.on('end', () => { const t = Buffer.concat(ch).toString('utf8'); let j = null; try { j = JSON.parse(t); } catch (_) {} res({ status: r.statusCode, h: r.headers, t, j }); }); });
    rq.on('error', (e) => res({ status: 0, h: {}, t: String(e), j: null })); rq.setTimeout(120000, () => rq.destroy(new Error('timeout'))); rq.end(); });
}
const calls = () => readFileSync(CALLS, 'utf8').split('\n').filter(Boolean).map((x) => JSON.parse(x));
const LAT = Array.from({ length: 24 }, (_, i) => (29 + i * 0.1).toFixed(4)).join(','), LON = Array.from({ length: 24 }, (_, i) => (71 + i * 0.05).toFixed(4)).join(',');
const NINE = 'ecmwf_ifs025,ecmwf_aifs025_single,ncep_aigfs025,gfs_seamless,icon_seamless,gem_seamless,ukmo_seamless,meteofrance_seamless,jma_seamless';
const sweep = (models, lat = LAT) => '/px/v1/forecast?__omhost=api.open-meteo.com&latitude=' + lat + '&longitude=' + LON + '&hourly=temperature_2m&forecast_days=3' + (models ? '&models=' + models : '');
const bodyCalls = (models, lat = LAT) => calls().filter((c) => c.path === '/v1/forecast' && new URLSearchParams(c.q).get('latitude') === lat && (new URLSearchParams(c.q).get('models') || '') === (models || '')).length;
try {
  ok(await start(), 'server 1 warm', log.slice(-300));
  const a = await get(sweep(NINE)); ok(a.status === 200 && bodyCalls(NINE) === 1, 'server 1: the 9-model body fetched once');
  await sleep(1500); await kill();
  /* the held body is 90 min old (same PKT day as long as the test does not straddle PKT midnight) */
  const dir = join(DATA, 'cache', 'provider', 'sweep'); const old = (Date.now() - 90 * 60e3) / 1000;
  for (const f of readdirSync(dir)) if (f.endsWith('.json')) utimesSync(join(dir, f), old, old);
  ok(await start(), 'server 2 warm (restart)', log.slice(-300));
  const n0 = bodyCalls(NINE); const b = await get(sweep(NINE)); await sleep(2500);
  ok(b.status === 200 && bodyCalls(NINE) === n0, 'K1 restart, runs unchanged: the held body is served, no fetch (cut 2)', 'fetches ' + (bodyCalls(NINE) - n0) + ' cache ' + b.h['x-agn-cache']);
  M.ukmo_global_deterministic_10km = { init: t0 + 21600, avail: t0 + 21600 + 3600, interval: 6 * 3600 }; writeMeta(); await sleep(1500);
  const n1 = bodyCalls(NINE), u1 = bodyCalls('ukmo_seamless');
  const w = await get(sweep(NINE), { 'x-agn-internal': 'sweep-warm' }); await sleep(4000);
  ok(w.status === 200 && bodyCalls(NINE) === n1, 'K2 a member has a newer run: the keep-warm replay is answered from the cache, no 9-model fetch (cut 1)', 'nine ' + (bodyCalls(NINE) - n1) + ' cache ' + w.h['x-agn-cache']);
  ok(bodyCalls('ukmo_seamless') === u1 + 1, 'K3 ... the run-keyed refresh fetched only the changed member (splice)', 'ukmo ' + (bodyCalls('ukmo_seamless') - u1));
  const LAT2 = LAT.replace(/^29\.0000/, '29.0001'); const m0 = calls().filter((c) => c.path === '/v1/forecast').length;
  const x = await get(sweep(NINE, LAT2), { 'x-agn-internal': 'sweep-warm' }); await sleep(1500);
  ok(x.status === 204 && calls().filter((c) => c.path === '/v1/forecast').length === m0, 'K4 a replay of a body not held: 204, nothing fetched (cut 1)', x.status + ' ' + (calls().filter((c) => c.path === '/v1/forecast').length - m0));
} catch (e) { ok(false, 'test run', e && e.stack || e); }
finally { await kill(); }
done('B12-WARM-COLD');
