/* v91.17.283 · WS1 · PATCH3 · REPEAT REQUESTS, FRESHNESS LABELS, TEST MODE AND THE TIER ORDER ON A SERVER (server.mjs run memo, sweep cache,
   callbudget.mjs tiers, modelruns.mjs main runs). Own server (scripts/tests283/ws1/child.mjs: mock provider with controllable model metadata)
   on a throw-away data folder; the budget file is the shipped one, edited by the test where it says so (re-read without a restart).
     R1-R4  a point forecast through /px: identical requests within one model run make ONE provider call; the answer names its model run
            (x-agn-model-run, UTC); a newer run of one of its models: fetched once more, labelled with the new run;
     R5     a `current` request: one call within the 15-min slot;
     R6     the Customize chart (CMIP6) and the area card: a repeat costs 0 calls;
     S1-S3  shed mode, background over the tier levels: the best_match sweep (P1) is still refreshed for a 06 UTC run; the 9-model set (P4)
            keeps its body for a 06 UTC member run and fetches that member for a 12 UTC run; /api/ops/budget shows the tiers, what was
            shed and the projection;
     T1-T4  test mode (NIGRAAN_TEST_MODE via the file's testMode): /health says so; a person's repeat is answered cache first (old run,
            labelled as such) after a newer run; the best_match sweep waits for the 12 UTC run.
   Fails on the v283 tree before PATCH3 (no run memo, no labels, no tiers, no test mode).
   usage: node scripts/tests283/ws1/cache.test.mjs [--root <nigraan-local folder>]   env WS1_CACHE_PORT (default 9363) */
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, symlinkSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ai = process.argv.indexOf('--root');
const ROOT = resolve(ai > 0 ? process.argv[ai + 1] : join(HERE, '..', '..', '..'));
const PORT = Number(process.env.WS1_CACHE_PORT || 9363);
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (info != null ? ' :: ' + String(info).slice(0, 400) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DATA = mkdtempSync(join(tmpdir(), 'agn-ws1c-'));
const today = new Date().toISOString().slice(0, 10);
writeFileSync(join(DATA, 'nigraan-db.json'), JSON.stringify({ schemaVersion: 1, createdAt: new Date().toISOString(), collections: { quotaWindows: [{ providerId: 'mach', day: today, calls: 0, locations: 0, failures: 0, quotaErrors: 0, browserWeighted: 0, backendWeighted: 0 }] } }));
for (const f of ['source-labels.json']) { const s = join(ROOT, 'data', f); if (existsSync(s)) writeFileSync(join(DATA, f), readFileSync(s)); }
const BUD = JSON.parse(readFileSync(join(ROOT, 'data', 'provider-budget.json'), 'utf8'));
const writeBudget = (j) => { writeFileSync(join(DATA, 'provider-budget.json.tmp'), JSON.stringify(j)); renameSync(join(DATA, 'provider-budget.json.tmp'), join(DATA, 'provider-budget.json')); };
writeBudget(BUD);
const PM = join(ROOT, 'data', 'provider-models.json');
{ const j = JSON.parse(readFileSync(PM, 'utf8')); j.pollSeconds = 1; writeFileSync(join(DATA, 'provider-models.json'), JSON.stringify(j)); }
for (const f of ['feat', 'pk-tehsils.json', 'pk-tehsils-fine.json.gz']) { const s = join(ROOT, 'data', f); if (existsSync(s)) symlinkSync(s, join(DATA, f)); }
/* model runs on real cycle hours: yesterday 00 UTC for every model, hourly "next run due" so every poll asks */
const D0 = Math.floor(Date.now() / 864e5) * 86400 - 86400;
const META = join(DATA, 'meta-mock.json'), CALLS = join(DATA, 'calls.jsonl'); writeFileSync(CALLS, '');
const M = { '*': { init: D0, avail: D0 + 3600, interval: 3600 } };
const run = (d, h) => { M[d] = { init: D0 + h * 3600, avail: D0 + h * 3600 + 60, interval: 3600 }; writeFileSync(META + '.tmp', JSON.stringify(M)); renameSync(META + '.tmp', META); };
writeFileSync(META, JSON.stringify(M));
const env = { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NIGRAAN_DATA_DIR: DATA, NIGRAAN_WORKER: '0', NIGRAAN_AUTO_SCHEDULE: '0', NIGRAAN_ENGINE: '0',
  NIGRAAN_PYJOBS: '0', NIGRAAN_SWEEP_WARM: '0', NIGRAAN_SYNOP: '0', NIGRAAN_MACH_DB_SYNC: '0', NIGRAAN_FLEET_BACKFILL: '0', NIGRAAN_VCARCHIVE: '0', NIGRAAN_WARM_MAX_S: '20',
  NIGRAAN_BLEND: '0', NIGRAAN_NATIONAL_POOL: '0', NIGRAAN_ZONE_ALL: '0', NIGRAAN_ALLOW_DEV_TOKEN: '1', MACH_API_KEY: 'test-key-not-a-real-key', WS1_META_FILE: META, WS1_CALL_LOG: CALLS };
for (const k of ['OPEN_METEO_API_KEY', 'NIGRAAN_CALL_BUDGET', 'NIGRAAN_CALL_BUDGET_MODE', 'NIGRAAN_RUN_CACHE', 'NIGRAAN_TEST_MODE', 'NIGRAAN_PX_RUNMEMO']) delete env[k];
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
const iso = (h) => new Date((D0 + h * 3600) * 1000).toISOString().slice(0, 16) + 'Z';
async function until(f, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await sleep(200); } return false; }
const LAT = Array.from({ length: 24 }, (_, i) => (29 + i * 0.1).toFixed(4)).join(','), LON = Array.from({ length: 24 }, (_, i) => (71 + i * 0.05).toFixed(4)).join(',');
const sweep = (models) => '/px/v1/forecast?__omhost=api.open-meteo.com&latitude=' + LAT + '&longitude=' + LON + '&hourly=temperature_2m&forecast_days=3' + (models ? '&models=' + models : '');
const bodyCalls = (models) => calls().filter((c) => c.path === '/v1/forecast' && new URLSearchParams(c.q).get('latitude') === LAT && (new URLSearchParams(c.q).get('models') || '') === (models || '')).length;
const NINE = 'ecmwf_ifs025,ecmwf_aifs025_single,ncep_aigfs025,gfs_seamless,icon_seamless,gem_seamless,ukmo_seamless,meteofrance_seamless,jma_seamless';

try {
  let up = false; for (let i = 0; i < 240 && !up; i++) { try { const h = await get('/health'); up = !!(h.j && h.j.warm === true); } catch (_) {} if (!up) await sleep(500); }
  ok(up, 'test server warm (mock provider and metadata)', log.slice(-300));

  /* ── R: a point forecast through /px ── */
  const PT = (extra = '') => '/px/v1/forecast?__omhost=api.open-meteo.com&latitude=31.4504&longitude=73.1350&hourly=temperature_2m,precipitation&forecast_days=3&timezone=Asia%2FKarachi' + extra;
  const ptCalls = () => calls().filter((c) => c.path === '/v1/forecast' && new URLSearchParams(c.q).get('latitude') === '31.4504' && !new URLSearchParams(c.q).has('current')).length;
  const a1 = await get(PT()), a2 = await get(PT()), a3 = await get(PT());
  ok(a1.status === 200 && a2.status === 200 && a3.status === 200 && ptCalls() === 1, 'R1 a point forecast asked three times within one model run: one provider call', [a1.status, a2.status, a3.status, ptCalls()].join(','));
  ok(a2.h['x-agn-cache'] === 'run-memo' && a2.h['x-agn-weighted-calls'] === '0' && a1.t === a2.t, 'R2 ... the repeats are answered from the run memo (0 weighted calls, the same answer)', JSON.stringify([a2.h['x-agn-cache'], a2.h['x-agn-weighted-calls']]));
  const lab1 = String(a1.h['x-agn-model-run'] || '');
  ok(lab1.includes('dwd_icon=' + iso(0)) && lab1.includes('ecmwf_ifs=' + iso(0)) && lab1 === String(a2.h['x-agn-model-run']), 'R3 the answer names the model runs it came from (UTC initialisation per domain)', lab1);
  run('dwd_icon', 6); await sleep(1300);
  const a4 = await get(PT()), a5 = await get(PT());
  ok(ptCalls() === 2 && String(a4.h['x-agn-model-run'] || '').includes('dwd_icon=' + iso(6)) && a5.h['x-agn-cache'] === 'run-memo', 'R4 a newer ICON run: fetched once more, labelled with the new run, then the memo again', ptCalls() + ' ' + a4.h['x-agn-model-run']);
  const CUR = PT('&current=temperature_2m'); const curCalls = () => calls().filter((c) => c.path === '/v1/forecast' && new URLSearchParams(c.q).get('latitude') === '31.4504' && new URLSearchParams(c.q).has('current')).length;
  await get(CUR); await get(CUR); await get(CUR);
  ok(curCalls() === 1 || (curCalls() === 2 && new Date().getUTCMinutes() % 15 === 0), 'R5 a `current` request: one call within the 15-min slot', curCalls());
  /* the Customize chart and the area card */
  const clim = '/px/v1/climate?__omhost=climate-api.open-meteo.com&latitude=33.6942&longitude=73.0524&models=MRI_AGCM3_2_S&daily=temperature_2m_max&timezone=Asia%2FKarachi&start_date=1991-01-01&end_date=1991-12-31';
  const cc = () => calls().filter((c) => c.path === '/v1/climate').length;
  await get(clim); const ccA = cc(); const cl2 = await get(clim); const area = '/api/point?lat=33.6844&lon=73.0479';   /* v283.19: the area card is the bundle's part near (/api/hyperlocal/area is retired) */
  const n0 = calls().length; const ar1 = await get(area); const n1 = calls().length; const ar2 = await get(area); const n2 = calls().length;
  ok(cl2.status === 200 && cc() === ccA && ccA === 1 && ar1.status === ar2.status && n2 === n1, 'R6 a repeat of the Customize chart and of the area card costs 0 provider calls', JSON.stringify({ climate: [ccA, cc()], area: [ar1.status, n1 - n0, n2 - n1] }));

  /* ── S: shed mode, background past the tier levels ── */
  const B2 = JSON.parse(JSON.stringify(BUD)); B2.mode = 'shed'; B2.monthlyPlanWeighted = 3100; B2.dailyFromPlan = true;   /* about 100 a day: every background call is past the levels below */
  for (const t of B2.tiers) { if (t.id === 'P4') { t.mainRunsOnlyAtBackgroundShare = 0.0001; t.shedAtBackgroundShare = 9; } else if (t.shedAtBackgroundShare != null) t.shedAtBackgroundShare = 0.0001; }
  writeBudget(B2); await sleep(300);
  await get(sweep()); await get(sweep(NINE)); await sleep(1500); const bm0 = bodyCalls(), n90 = bodyCalls(NINE);
  run('dwd_icon', 12); run('ncep_gfs013', 6); run('ukmo_global_deterministic_10km', 6); await sleep(1300);   /* best_match gets new runs; one 9-model member a 06 UTC run */
  await get(sweep()); await get(sweep(NINE)); const refreshed = await until(() => bodyCalls() === bm0 + 1); for (let i = 0; i < 3; i++) { await sleep(1200); await get(sweep()); await get(sweep(NINE)); } await sleep(1500);
  const hB = (await get('/health')).j || {}; const pbB = hB.providerBudget || {};
  ok(refreshed && bodyCalls() === bm0 + 1 && pbB.dailyAllowance && pbB.dailyAllowance.backgroundUsed > 0, 'S1 shed mode, background over every tier level: the best_match sweep (P1) is still refreshed for its new run, once', JSON.stringify({ bm0, now: bodyCalls(), bg: pbB.dailyAllowance }));
  const ukA = bodyCalls('ukmo_seamless');
  /* v91.17.283.31 · owner 29 Oct 2026: overage allowed: a file asking for shed is read as monitor, so P4 is never held to 00/12 UTC runs */
  ok((pbB.tiers || []).find((t) => t.tier === 'P4').state === 'running' && pbB.mode === 'monitor' && pbB.requestedMode === 'shed', 'S2 overage allowed: the 9-model set (P4) is not held to 00/12 UTC runs (state running; the file\'s shed read as monitor)', JSON.stringify({ ukmo: ukA, nine: bodyCalls(NINE), p4: (pbB.tiers || []).find((t) => t.tier === 'P4') }));
  const k9 = await get(sweep(NINE)); ok(String(k9.h['x-agn-model-run'] || '').includes('ukmo_global_deterministic_10km=' + iso(6)), 'S2b ... its label moves to the 06 UTC UKMO run (fetched, not held)', k9.h['x-agn-model-run'] + ' | ' + k9.h['x-agn-model-run-latest']);
  run('ukmo_global_deterministic_10km', 12); await sleep(1300); await get(sweep(NINE)); const sp = await until(() => bodyCalls('ukmo_seamless') === 1); await sleep(1300);
  const k9b = await get(sweep(NINE));
  ok(sp && bodyCalls(NINE) === n90 && String(k9b.h['x-agn-model-run'] || '').includes('ukmo_global_deterministic_10km=' + iso(12)), 'S3 the 12 UTC UKMO run: only that member is fetched, and the label moves to it', JSON.stringify({ ukmo: bodyCalls('ukmo_seamless'), label: k9b.h['x-agn-model-run'] }));
  const ob = await get('/api/ops/budget');
  ok(ob.status === 200 && ob.j && ob.j.budget && Array.isArray(ob.j.budget.tiers) && ob.j.budget.tiers.length === BUD.tiers.length && ob.j.budget.projection && ob.j.budget.projection.monthlyPlanWeighted === B2.monthlyPlanWeighted && ob.j.budget.tiers.every((t) => !String(t.state).startsWith('shed')) && ob.j.budget.monthToDate && ob.j.proxyRunMemo && ob.j.proxyRunMemo.hits >= 3,
    'S4 /api/ops/budget: today by tier (nothing shed, overage allowed), the projection and month to date against the plan, the run memo', JSON.stringify(ob.j && { tiers: ob.j.budget && ob.j.budget.tiers && ob.j.budget.tiers.map((t) => [t.tier, t.todayWeighted, t.shedToday, t.state]), memo: ob.j.proxyRunMemo }).slice(0, 400));

  /* ── T: test mode ── */
  const B3 = JSON.parse(JSON.stringify(BUD)); B3.testMode = true; writeBudget(B3); await sleep(300);
  const hT = (await get('/health')).j || {};
  ok(/^TEST MODE/.test(String(hT.callMode || '')) && hT.providerBudget && hT.providerBudget.testMode === true && (hT.providerBudget.tiers || []).find((t) => t.tier === 'P3').state === 'off (test mode)', 'T1 test mode: /health says so in one line, and which tiers are off', hT.callMode);
  const pBefore = ptCalls(); run('dwd_icon', 18); await sleep(1300);
  const t2 = await get(PT());
  ok(ptCalls() === pBefore && t2.h['x-agn-cache'] === 'test-cache-first' && String(t2.h['x-agn-model-run'] || '').includes('dwd_icon=' + iso(6)) && String(t2.h['x-agn-model-run-latest'] || '').includes('dwd_icon=' + iso(18)), 'T2 a person\'s repeat after a newer run is answered cache first, labelled with its own (older) run and the newer one named', JSON.stringify([ptCalls() - pBefore, t2.h['x-agn-cache'], t2.h['x-agn-model-run'], t2.h['x-agn-model-run-latest']]));
  const bm1 = bodyCalls(); await get(sweep()); for (let i = 0; i < 3; i++) { await sleep(1200); await get(sweep()); } await sleep(1300);
  ok(bodyCalls() === bm1, 'T3 test mode: the best_match sweep is not refreshed for an 18 UTC ICON run', bodyCalls() - bm1);
  run('dwd_icon', 24); await sleep(1300); await get(sweep()); const t4 = await until(() => bodyCalls() === bm1 + 1);
  ok(t4, 'T4 ... and is refreshed once for the next 00 UTC run', bodyCalls() - bm1);
} catch (e) { ok(false, 'test run', e && e.stack || e); }
finally { stop(); }
console.log(`\nWS1 cache: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
