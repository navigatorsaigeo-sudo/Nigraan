/* v91.17.283.10 · budget · the 9-model sweep body with an hour window (forecast_hours=6, as the console asks it) after a member's newer run.
   Own server (child_clock.mjs: mock provider answering hour windows as the provider does, controllable model metadata, movable server
   clock) on a throw-away data folder.
     S1  the body is fetched once (9 models)
     S2  a member run (JMA) in the same clock hour: only that member is asked (the splice fits) and the served body carries JMA's new run
     S3  a member run (UKMO) after the server clock has moved into the next hour: the member is NOT asked (its answer could not fit the held
         body's hour axis); the whole body is fetched once, as the failed splice fell back to before
     S4  the served body after S3: its hour axis starts at the new hour, UKMO's columns carry the new run and every other member the run it
         had (exactly what the full fetch after the failed splice served before)
     S5  /api/ops/budget counts the skipped splice (proxyRunMemo.spliceSkippedAxisMoved)
   On the v283.9 tree S3 fails (the UKMO member is asked first and its answer thrown away).
   usage: node scripts/tests28310/budget/splice.test.mjs [--root <tree>]   env BUD_PORT (default 9378) */
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, symlinkSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const ai = process.argv.indexOf('--root');
const ROOT = resolve(ai > 0 ? process.argv[ai + 1] : join(HERE, '..', '..', '..'));
const PORT = Number(process.env.BUD_PORT || 9378);
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (info != null ? ' :: ' + String(info).slice(0, 400) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DATA = mkdtempSync(join(tmpdir(), 'agn-bud-'));
const today = new Date().toISOString().slice(0, 10);
writeFileSync(join(DATA, 'nigraan-db.json'), JSON.stringify({ schemaVersion: 1, createdAt: new Date().toISOString(), collections: { quotaWindows: [{ providerId: 'mach', day: today, calls: 0, locations: 0, failures: 0, quotaErrors: 0, browserWeighted: 0, backendWeighted: 0 }] } }));
writeFileSync(join(DATA, 'provider-budget.json'), readFileSync(join(ROOT, 'data', 'provider-budget.json')));
{ const j = JSON.parse(readFileSync(join(ROOT, 'data', 'provider-models.json'), 'utf8')); j.pollSeconds = 1; writeFileSync(join(DATA, 'provider-models.json'), JSON.stringify(j)); }
for (const f of ['feat', 'pk-tehsils.json', 'pk-tehsils-fine.json.gz', 'source-labels.json']) { const s = join(ROOT, 'data', f); if (existsSync(s)) symlinkSync(s, join(DATA, f)); }
/* the server clock starts at hh:55 (so the next hour is 6 minutes away and the held body stays under 60 minutes old) */
const CLOCK = join(DATA, 'clock'); const now0 = Date.now(); const minute = new Date(now0).getUTCMinutes() * 60e3 + new Date(now0).getUTCSeconds() * 1e3 + new Date(now0).getUTCMilliseconds();
let off = ((55 * 60e3 - minute) % 3600e3 + 3600e3) % 3600e3; const setClock = (ms) => { off = ms; writeFileSync(CLOCK + '.tmp', String(ms)); renameSync(CLOCK + '.tmp', CLOCK); }; setClock(off);
const D0 = Math.floor((now0 + off) / 864e5) * 86400 - 86400; const t0 = D0;
const META = join(DATA, 'meta-mock.json'), CALLS = join(DATA, 'calls.jsonl'); writeFileSync(CALLS, '');
const M = { '*': { init: D0, avail: D0 + 3600, interval: 3600 } }; const writeMeta = () => { writeFileSync(META + '.tmp', JSON.stringify(M)); renameSync(META + '.tmp', META); }; writeMeta();
const env = { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NIGRAAN_DATA_DIR: DATA, NIGRAAN_WORKER: '0', NIGRAAN_AUTO_SCHEDULE: '0', NIGRAAN_ENGINE: '0',
  NIGRAAN_PYJOBS: '0', NIGRAAN_SWEEP_WARM: '0', NIGRAAN_SYNOP: '0', NIGRAAN_MACH_DB_SYNC: '0', NIGRAAN_FLEET_BACKFILL: '0', NIGRAAN_VCARCHIVE: '0', NIGRAAN_WARM_MAX_S: '20',
  NIGRAAN_BLEND: '0', NIGRAAN_NATIONAL_POOL: '0', NIGRAAN_ZONE_ALL: '0', NIGRAAN_ALLOW_DEV_TOKEN: '1', MACH_API_KEY: 'test-key-not-a-real-key', WS1_META_FILE: META, WS1_CALL_LOG: CALLS, CLOCK_FILE: CLOCK };
for (const k of ['OPEN_METEO_API_KEY', 'NIGRAAN_CALL_BUDGET', 'NIGRAAN_CALL_BUDGET_MODE', 'NIGRAAN_TEST_MODE', 'NIGRAAN_PX_RUNMEMO', 'NIGRAAN_SPLICE_AXIS_CHECK']) delete env[k];
let log = '';
const srv = spawn(process.execPath, [join(HERE, 'child_clock.mjs'), ROOT], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
srv.stdout.on('data', (d) => { log += d; }); srv.stderr.on('data', (d) => { log += d; });
let stopped = false; const stop = () => { if (stopped) return; stopped = true; try { srv.kill('SIGKILL'); } catch (_) {} try { rmSync(DATA, { recursive: true, force: true }); } catch (_) {} };
process.on('exit', stop); process.on('SIGINT', () => { stop(); process.exit(130); });
function get(path, headers = {}) {
  return new Promise((res) => { const rq = http.request({ host: '127.0.0.1', port: PORT, path, headers: { host: 'localhost:' + PORT, 'accept-encoding': 'identity', 'sec-fetch-site': 'same-origin', ...headers }, agent: false },
    (r) => { const ch = []; r.on('data', (d) => ch.push(d)); r.on('end', () => { const t = Buffer.concat(ch).toString('utf8'); let j = null; try { j = JSON.parse(t); } catch (_) {} res({ status: r.statusCode, h: r.headers, t, j }); }); });
    rq.on('error', (e) => res({ status: 0, h: {}, t: String(e), j: null })); rq.setTimeout(120000, () => rq.destroy(new Error('timeout'))); rq.end(); });
}
const calls = () => readFileSync(CALLS, 'utf8').split('\n').filter(Boolean).map((x) => JSON.parse(x)).filter((c) => c.path === '/v1/forecast');
const NINE = 'ecmwf_ifs025,ecmwf_aifs025_single,ncep_aigfs025,gfs_seamless,icon_seamless,gem_seamless,ukmo_seamless,meteofrance_seamless,jma_seamless';
const LAT = Array.from({ length: 24 }, (_, i) => (29 + i * 0.1).toFixed(4)).join(','), LON = Array.from({ length: 24 }, (_, i) => (71 + i * 0.05).toFixed(4)).join(',');
const sweep = '/px/v1/forecast?__omhost=api.open-meteo.com&latitude=' + LAT + '&longitude=' + LON + '&hourly=temperature_2m,dew_point_2m&forecast_hours=6&timezone=Asia%2FKarachi&models=' + NINE + '&__raw=1';
const asked = (m) => calls().filter((c) => (new URLSearchParams(c.q).get('models') || '') === m).length;
const markNow = () => Object.values(M).reduce((a, e) => a + e.init, 0);
async function until(f, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await sleep(200); } return false; }
const pad = (n) => String(n).padStart(2, '0'); const localHour = (ms) => { const d = new Date(ms + 18000e3); return d.toISOString().slice(0, 13) + ':00'; };
try {
  let up = false; for (let i = 0; i < 240 && !up; i++) { const h = await get('/health'); up = !!(h.j && h.j.warm === true); if (!up) await sleep(500); }
  ok(up, 'test server warm', log.slice(-300));
  const r1 = await get(sweep); await sleep(1500); await get(sweep); await sleep(1500);
  ok(r1.status === 200 && asked(NINE) === 1, 'S1 the 9-model hour-window body is fetched once', r1.status + ' nine ' + asked(NINE));
  M.jma_gsm = { init: t0 + 21600, avail: t0 + 21600 + 60, interval: 3600 }; writeMeta();
  await get(sweep); const spl = await until(() => asked('jma_seamless') === 1); for (let i = 0; i < 2; i++) { await sleep(1200); await get(sweep); } await sleep(1200);
  const r2 = await get(sweep); const H2 = ((Array.isArray(r2.j) ? r2.j[0] : r2.j) || {}).hourly || {};
  ok(spl && asked('jma_seamless') === 1 && asked(NINE) === 1 && H2.agn_run_jma_seamless && H2.agn_run_jma_seamless[0] === markNow(), 'S2 a member run in the same hour: only that member is asked (splice) and served', 'jma ' + asked('jma_seamless') + ' nine ' + asked(NINE));
  const oldMark = markNow(); const axis0 = H2.time && H2.time[0];
  setClock(off + 6 * 60e3);   /* the server clock moves into the next hour */
  M.ukmo_global_deterministic_10km = { init: t0 + 21600, avail: t0 + 21600 + 60, interval: 3600 }; writeMeta();
  await get(sweep); const full = await until(() => asked(NINE) === 2); for (let i = 0; i < 3; i++) { await sleep(1200); await get(sweep); } await sleep(1500);
  ok(full && asked('ukmo_seamless') === 0 && asked(NINE) === 2, 'S3 a member run in the next clock hour: the member is not asked; the body is fetched once', 'ukmo ' + asked('ukmo_seamless') + ' nine ' + asked(NINE));
  const r3 = await get(sweep); const H3 = ((Array.isArray(r3.j) ? r3.j[0] : r3.j) || {}).hourly || {};
  const wantAxis = localHour(Date.now() + off);
  ok(H3.time && H3.time[0] === wantAxis && H3.time[0] !== axis0 && H3.agn_run_ukmo_seamless[0] === markNow() && H3.agn_run_jma_seamless[0] === markNow() && H3.agn_run_icon_seamless[0] === markNow(),
    'S4 the served body: the new hour axis, every member\'s columns from the runs published now (as the full fetch gave before)', JSON.stringify({ axis0, axis: H3.time && H3.time[0], wantAxis, ukmo: H3.agn_run_ukmo_seamless && H3.agn_run_ukmo_seamless[0], now: markNow(), old: oldMark }));
  const B = await get('/api/ops/budget'); const sk = B.j && B.j.proxyRunMemo && B.j.proxyRunMemo.spliceSkippedAxisMoved;
  ok(sk === 1, 'S5 /api/ops/budget counts the skipped splice', JSON.stringify(B.j && B.j.proxyRunMemo));
} finally { stop(); }
console.log((fail ? 'FAIL' : 'PASS') + ' splice ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
