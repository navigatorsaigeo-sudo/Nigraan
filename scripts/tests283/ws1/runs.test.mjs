/* v91.17.283 · WS1 · FRESHNESS WITHOUT REPEAT FETCHES (api/modelruns.mjs, server.mjs sweep cache, the backend answer cache).
   Own server (mock provider with controllable model metadata, scripts/tests283/ws1/child.mjs) on a throw-away data folder.
     F1-F3  a national sweep body is fetched once; with no newer model run, repeated requests make ZERO further fetches (the metadata
            is still checked);
     F4-F5  a newer run of one of its models (ICON for best_match): the body is fetched again once and the served value changes within
            one refresh cycle (the next request);
     F6     a newer run of a model the body does not use (JMA) fetches nothing;
     F7-F8b the 9-model body: no repeat while no member changes; when one member (UKMO) has a newer run only its columns are fetched and
            put in place, the other members' columns stay;
     F9-F11 the backend answer cache (national job, point broker ...): the same request is answered without a provider call until a
            member's run changes, then fetched once.
     C1-C4  CMIP6 (Customize chart) once per tehsil: places in one tehsil share one fetch of the tehsil's projection; the answer names it.
   Fails on v91.17.282.1: the sweep body is fetched again from 10 min of age whatever the run, and backend calls are never reused.
   usage: node scripts/tests283/ws1/runs.test.mjs [--root <nigraan-local folder>]   env WS1_RUNS_PORT (default 9361) */
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, symlinkSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ai = process.argv.indexOf('--root');
const ROOT = resolve(ai > 0 ? process.argv[ai + 1] : join(HERE, '..', '..', '..'));
const PORT = Number(process.env.WS1_RUNS_PORT || 9361), B = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (info != null ? ' :: ' + String(info).slice(0, 400) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DATA = mkdtempSync(join(tmpdir(), 'agn-ws1r-'));
const day = new Date().toISOString().slice(0, 10);
writeFileSync(join(DATA, 'nigraan-db.json'), JSON.stringify({ schemaVersion: 1, createdAt: new Date().toISOString(), collections: { quotaWindows: [{ providerId: 'mach', day, calls: 0, locations: 0, failures: 0, quotaErrors: 0, browserWeighted: 0, backendWeighted: 0 }] } }));
for (const f of ['provider-budget.json', 'source-labels.json']) { const s = join(ROOT, 'data', f); if (existsSync(s)) writeFileSync(join(DATA, f), readFileSync(s)); }
const PM = join(ROOT, 'data', 'provider-models.json');
if (existsSync(PM)) { const j = JSON.parse(readFileSync(PM, 'utf8')); j.pollSeconds = 1; writeFileSync(join(DATA, 'provider-models.json'), JSON.stringify(j)); }   /* the test's cycle: 1 s */
for (const f of ['feat', 'pk-tehsils.json', 'pk-tehsils-fine.json.gz']) { const s = join(ROOT, 'data', f); if (existsSync(s)) symlinkSync(s, join(DATA, f)); }
/* every model's metadata: last run 7 h ago, available 6 h ago, hourly cycle -> its next run is due, so every poll asks */
const META = join(DATA, 'meta-mock.json'), CALLS = join(DATA, 'calls.jsonl'); writeFileSync(CALLS, '');
const t0 = Math.floor(Date.now() / 1000) - 7 * 3600; const M = { '*': { init: t0, avail: t0 + 3600, interval: 3600 } };
const writeMeta = () => { writeFileSync(META + '.tmp', JSON.stringify(M)); renameSync(META + '.tmp', META); }; writeMeta();
const env = { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NIGRAAN_DATA_DIR: DATA, NIGRAAN_WORKER: '0', NIGRAAN_AUTO_SCHEDULE: '0', NIGRAAN_ENGINE: '0',
  NIGRAAN_PYJOBS: '0', NIGRAAN_SWEEP_WARM: '0', NIGRAAN_SYNOP: '0', NIGRAAN_MACH_DB_SYNC: '0', NIGRAAN_FLEET_BACKFILL: '0', NIGRAAN_VCARCHIVE: '0', NIGRAAN_WARM_MAX_S: '20',
  NIGRAAN_BLEND: '0', NIGRAAN_NATIONAL_POOL: '0', NIGRAAN_ZONE_ALL: '0', NIGRAAN_ALLOW_DEV_TOKEN: '1', MACH_API_KEY: 'test-key-not-a-real-key', WS1_META_FILE: META, WS1_CALL_LOG: CALLS };
delete env.OPEN_METEO_API_KEY; delete env.NIGRAAN_CALL_BUDGET; delete env.NIGRAAN_RUN_CACHE;
let log = '';
const srv = spawn(process.execPath, [join(HERE, 'child.mjs'), ROOT], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
srv.stdout.on('data', (d) => { log += d; }); srv.stderr.on('data', (d) => { log += d; });
let stopped = false; const stop = () => { if (stopped) return; stopped = true; try { srv.kill('SIGKILL'); } catch (_) {} try { rmSync(DATA, { recursive: true, force: true }); } catch (_) {} };
process.on('exit', stop); process.on('SIGINT', () => { stop(); process.exit(130); });
function get(path, headers = {}) {
  return new Promise((res) => { const rq = http.request({ host: '127.0.0.1', port: PORT, path, headers: { host: 'localhost:' + PORT, 'accept-encoding': 'identity', ...headers }, agent: false },
    (r) => { const ch = []; r.on('data', (d) => ch.push(d)); r.on('end', () => { const t = Buffer.concat(ch).toString('utf8'); let j = null; try { j = JSON.parse(t); } catch (_) {} res({ status: r.statusCode, h: r.headers, t, j }); }); });
    rq.on('error', (e) => res({ status: 0, h: {}, t: String(e), j: null })); rq.setTimeout(120000, () => rq.destroy(new Error('timeout'))); rq.end(); });
}
const calls = () => readFileSync(CALLS, 'utf8').split('\n').filter(Boolean).map((x) => JSON.parse(x));
const LAT = Array.from({ length: 24 }, (_, i) => (29 + i * 0.1).toFixed(4)).join(','), LON = Array.from({ length: 24 }, (_, i) => (71 + i * 0.05).toFixed(4)).join(',');
const sweep = (models) => '/px/v1/forecast?__omhost=api.open-meteo.com&latitude=' + LAT + '&longitude=' + LON + '&hourly=temperature_2m&forecast_days=3' + (models ? '&models=' + models : '');
const bodyCalls = (models) => calls().filter((c) => c.path === '/v1/forecast' && new URLSearchParams(c.q).get('latitude') === LAT && (new URLSearchParams(c.q).get('models') || '') === (models || '')).length;
const metaCalls = () => calls().filter((c) => /meta\.json$/.test(c.path)).length;
const runOf = (r) => { const a = Array.isArray(r.j) ? r.j[0] : r.j; return a ? a.agn_mock_run : undefined; };
const markNow = () => Object.values(M).reduce((a, e) => a + e.init, 0);
async function until(f, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await sleep(200); } return false; }

try {
  let up = false; for (let i = 0; i < 240 && !up; i++) { try { const h = await get('/health'); up = !!(h.j && h.j.warm === true); } catch (_) {} if (!up) await sleep(500); }
  ok(up, 'test server warm (mock provider and metadata)', log.slice(-300));

  /* ── the sweep body ── */
  const r1 = await get(sweep());
  ok(r1.status === 200 && bodyCalls() === 1 && runOf(r1) === markNow(), 'F1 the sweep body is fetched once, made from the published runs', r1.status + ' calls ' + bodyCalls() + ' run ' + runOf(r1));
  const m0 = metaCalls();
  for (let i = 0; i < 5; i++) { await sleep(1200); await get(sweep()); }
  await sleep(1500);
  ok(bodyCalls() === 1, 'F2 no newer model run: 5 more requests over 7 s (5 refresh cycles) make ZERO further fetches of the body', bodyCalls());
  ok(metaCalls() > m0, 'F3 ... while the model metadata is still checked every cycle', (metaCalls() - m0) + ' metadata calls');
  M.dwd_icon = { init: t0 + 21600, avail: t0 + 21600 + 3600, interval: 3600 }; writeMeta();   /* ICON (a best_match member) publishes a newer run */
  const r2 = await get(sweep());
  const refetched = await until(() => bodyCalls() === 2);
  /* the request after the fetch starts the new corrected copy (the previous slot's copy is served meanwhile, v91.17.182); the one after
     that, one refresh cycle (1 s here, 10 min in service) later, must carry the new run */
  const r3 = await get(sweep()); await sleep(1200); const r4 = await get(sweep());
  ok(refetched && bodyCalls() === 2, 'F4 a newer ICON run: the body is fetched again, once', bodyCalls());
  ok(runOf(r4) === markNow() && runOf(r4) !== runOf(r1), 'F5 ... and the served value is the new run\'s within one refresh cycle', runOf(r1) + ' -> ' + runOf(r2) + ' -> ' + runOf(r3) + ' -> ' + runOf(r4));
  M.jma_gsm = { init: t0 + 21600, avail: t0 + 21600 + 3600, interval: 3600 }; writeMeta();   /* a model best_match does not use */
  for (let i = 0; i < 3; i++) { await sleep(1200); await get(sweep()); }
  await sleep(1500);
  ok(bodyCalls() === 2, 'F6 a newer run of a model the body does not use (JMA): nothing fetched', bodyCalls() + ' ' + JSON.stringify(calls().filter((c) => c.path === '/v1/forecast').map((c) => [c.t % 100000, (new URLSearchParams(c.q).get('models') || '-').slice(0, 20), String(new URLSearchParams(c.q).get('latitude')).length])) + ' meta ' + JSON.stringify(M));

  /* ── the 9-model body ── */
  const NINE = 'ecmwf_ifs025,ecmwf_aifs025_single,ncep_aigfs025,gfs_seamless,icon_seamless,gem_seamless,ukmo_seamless,meteofrance_seamless,jma_seamless';
  await get(sweep(NINE)); for (let i = 0; i < 3; i++) { await sleep(1200); await get(sweep(NINE)); } await sleep(1500);
  ok(bodyCalls(NINE) === 1, 'F7 the 9-model body: fetched once, no repeat while no member has a newer run', bodyCalls(NINE));
  M.ukmo_global_deterministic_10km = { init: t0 + 21600, avail: t0 + 21600 + 3600, interval: 3600 }; writeMeta();
  const n0 = await get(sweep(NINE)); const oldMark = runOf(n0);
  const spliced = await until(() => bodyCalls('ukmo_seamless') === 1); for (let i = 0; i < 3; i++) { await sleep(1200); await get(sweep(NINE)); } await sleep(1500);
  ok(spliced && bodyCalls('ukmo_seamless') === 1 && bodyCalls(NINE) === 1, 'F8 one member (UKMO) has a newer run: only that member\'s columns are fetched, once (not the 9-model body)', 'ukmo ' + bodyCalls('ukmo_seamless') + ' nine ' + bodyCalls(NINE));
  const n9 = await get(sweep(NINE)); const L9 = Array.isArray(n9.j) ? n9.j[0] : n9.j; const Hh = (L9 && L9.hourly) || {};
  ok(Hh.agn_run_ukmo_seamless && Hh.agn_run_ukmo_seamless[0] === markNow() && Hh.agn_run_icon_seamless && Hh.agn_run_icon_seamless[0] === oldMark && Hh.temperature_2m_ukmo_seamless && Hh.time,
    'F8b the served 9-model body carries UKMO\'s new-run columns and the other members\' columns unchanged', JSON.stringify({ ukmo: Hh.agn_run_ukmo_seamless && Hh.agn_run_ukmo_seamless[0], icon: Hh.agn_run_icon_seamless && Hh.agn_run_icon_seamless[0], now: markNow(), old: oldMark }));

  /* ── the backend answer cache (the point broker = the same provider.call path as the national job) ── */
  const pt = '/api/v1/forecast/point?latitude=33.7&longitude=73.05&variables=temperature_2m';
  const bk = () => calls().filter((c) => c.path === '/v1/forecast' && new URLSearchParams(c.q).get('latitude') === '33.7' && new URLSearchParams(c.q).get('past_days') === '1').length;
  const p1 = await get(pt, { authorization: 'Bearer agn-dev-token' }), p2 = await get(pt, { authorization: 'Bearer agn-dev-token' }), p3 = await get(pt, { authorization: 'Bearer agn-dev-token' });
  ok(p1.status === 200 && p2.status === 200 && p3.status === 200 && bk() === 1, 'F9 backend: the same request three times, one provider call', [p1.status, p2.status, p3.status, bk()].join(','));
  M.ecmwf_ifs = { init: t0 + 21600, avail: t0 + 21600 + 3600, interval: 3600 }; writeMeta(); await sleep(2200);   /* IFS HRES (best_match) publishes */
  const p4 = await get(pt, { authorization: 'Bearer agn-dev-token' }); const p5 = await get(pt, { authorization: 'Bearer agn-dev-token' });
  ok(p4.status === 200 && bk() === 2, 'F10 backend: a newer best_match member run -> fetched once more', bk() + ' ' + p4.status + ' ' + p4.t.slice(0, 200));
  const h = (await get('/health')).j || {}; const mr = h.modelRuns || {};
  ok(mr.ready && mr.answerCache && mr.answerCache.hits >= 3 && mr.domains && mr.domains['forecast|dwd_icon'] && mr.domains['forecast|dwd_icon'].runChanges >= 1, 'F11 /health shows the model runs read and the answer cache hits', JSON.stringify(mr.answerCache) + ' ' + JSON.stringify((mr.domains || {})['forecast|dwd_icon'] || null));
  /* ── CMIP6 once per tehsil (coordinator decision): the Customize chart's climate request ── */
  const clim = (la, lo) => '/px/v1/climate?__omhost=climate-api.open-meteo.com&latitude=' + la + '&longitude=' + lo + '&models=MRI_AGCM3_2_S,EC_Earth3P_HR&daily=temperature_2m_max,precipitation_sum&timezone=Asia%2FKarachi&start_date=1991-01-01&end_date=1992-12-31';
  const cc = () => calls().filter((c) => c.path === '/v1/climate').length;
  const c1 = await get(clim('33.6942', '73.0524')), c2 = await get(clim('33.7215', '73.0433'));   /* two places in Islamabad */
  ok(c1.status === 200 && c2.status === 200 && cc() === 1, 'C1 two places in one tehsil: one provider call (the second place is answered from the tehsil\'s stored projection)', c1.status + ' ' + c2.status + ' calls ' + cc());
  ok(/^tehsil /.test(String(c1.h['x-agn-climate-basis'] || '')) && c1.h['x-agn-climate-basis'] === c2.h['x-agn-climate-basis'], 'C2 the answer names its basis: the tehsil and its representative point', c1.h['x-agn-climate-basis']);
  const strip = (j) => JSON.stringify(j && j.daily);
  ok(c1.j && strip(c1.j) === strip(c2.j), 'C3 both places get the same tehsil projection');
  const c3 = await get(clim('31.5497', '74.3436'));   /* Lahore */
  ok(c3.status === 200 && cc() === 2 && c3.h['x-agn-climate-basis'] !== c1.h['x-agn-climate-basis'], 'C4 a place in another tehsil: its own tehsil, one more call', cc() + ' ' + c3.h['x-agn-climate-basis']);
} catch (e) { ok(false, 'test run', e && e.stack || e); }
finally { stop(); }
console.log(`\nWS1 runs: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
