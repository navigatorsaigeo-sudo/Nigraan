/* v91.17.283.26 . PROVIDER CALLS: REPEAT FETCHES OF THE SAME DATA REMOVED (owner 27 Oct 2026: efficient, never at the cost of freshness or
   served quality; the budget in monitor mode), offline (no server, no provider):
     B1  an answer fetched while its run was not known (the model metadata read failed) is not bought again: once the metadata is read and
         every domain had that run available before the call started, the same request is answered from it with no provider call (the
         15-day outlook's retry after a partial run: 24 ensemble batches fetched twice on 27 Oct); a run that became available after the
         call is never adopted (fetched again); the adopted answer is byte-identical to the provider's
     B2  a request of probability variables only is keyed on the probability domains: a new GFS / ICON / IFS run does not change its key;
         the tehsil superset (bmrows) fetches its main part again for a new deterministic run and NOT its probability part
     B3  blend members: one row per place and run, not per past window: requests with 2, 3, 4 and 5 past days of the same place and run make
         ONE members call (the fetch asks the widest past window the provider weighs the same), 7 past days a second one; the start
         applied from the wider row is identical, hour by hour, to the one applied from the narrow row
     B4  a call outside any request is tagged with the module that made it ("(backend job) <module>"), its tier unchanged
     B5  the one-time archive job (omarchive.mjs): in monitor mode it is held only by its own daily share (a busy day does not stop it); in
         shed and enforce mode it still waits at the background allowance
     B6  data/provider-budget.json is in monitor mode (owner 27 Oct 23:16 PKT) with the decision recorded
   usage: node scripts/tests28326/budget.unit.test.mjs */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 500) : '')); } };
const imp = (f) => import(pathToFileURL(join(API, f)).href);
const MR = await imp('modelruns.mjs'), BM = await imp('bmrows.mjs'), BL = await imp('blend.mjs'), PV = await imp('provider.mjs'), CBm = await imp('callbudget.mjs'), OM = await imp('omarchive.mjs');
const T = mkdtempSync(join(tmpdir(), 'v28326-bud-')); const DATA = join(T, 'data'); mkdirSync(DATA, { recursive: true });
copyFileSync(join(ROOT, 'data', 'provider-models.json'), join(DATA, 'provider-models.json'));

/* a metadata source we control: domain -> { init, avail } (seconds); fail = the read throws */
let clock = Date.parse('2026-10-27T05:30:00Z'); const now = () => clock;
const META = {}; let metaFail = false;
const metaFetch = async (kind, d) => { if (metaFail) throw new Error('metadata read failed (test)'); const m = META[d] || { init: 1793059200, avail: 1793080000 }; return { last_run_initialisation_time: m.init, last_run_availability_time: m.avail, update_interval_seconds: 21600 }; };

/* ── B1 ── */
{ const runs = MR.createModelRuns({ dataDir: DATA, metaFetch, now });
  let calls = 0; const prov = { call: async (kind, path, params) => { calls++; return { batch: params.latitude, members: [1, 2, 3], at: calls }; } };
  runs.cacheProvider(prov);
  const P = (i) => ({ latitude: [30 + i, 31 + i], longitude: [70, 71], models: 'ecmwf_ifs025', daily: ['temperature_2m_max'], forecast_days: 15, timezone: 'Asia/Karachi' });
  /* the run of ecmwf_ifs025_ensemble: made 00 UTC, available 05:00 UTC; the job runs at 05:30 UTC with the metadata read failing */
  META.ecmwf_ifs025_ensemble = { init: Date.parse('2026-10-27T00:00:00Z') / 1000, avail: Date.parse('2026-10-27T05:00:00Z') / 1000 };
  metaFail = true; const first = []; for (let i = 0; i < 24; i++) first.push(await prov.call('ensemble', '/v1/ensemble', P(i)));
  ok(calls === 24, 'B1 the first pass (run not known) fetches its 24 batches', calls);
  /* the retry 15 minutes later: the metadata is read now (the poll is due again after pollSeconds) */
  clock += 15 * 60e3; metaFail = false; const again = []; for (let i = 0; i < 24; i++) again.push(await prov.call('ensemble', '/v1/ensemble', P(i)));
  ok(calls === 24, 'B1 the retry of the same run makes NO provider call (24 answers adopted under the run key, was 24 calls = 18,885 weighted live)', calls - 24);
  ok(JSON.stringify(again) === JSON.stringify(first), 'B1 the adopted answers are byte-identical to what the provider answered');
  ok(runs.status().answerCache.adoptedUnknownRun === 24, 'B1 the status counts the adopted answers', JSON.stringify(runs.status().answerCache));
  /* a later identical call is a plain cache hit */
  await prov.call('ensemble', '/v1/ensemble', P(0)); ok(calls === 24, 'B1 a later identical request is an answer-cache hit');
  /* negative: an answer fetched while the run was unknown, whose run became available AFTER the call started, is never adopted */
  const runs2 = MR.createModelRuns({ dataDir: DATA, metaFetch, now }); let c2 = 0; const prov2 = { call: async () => { c2++; return { n: c2 }; } }; runs2.cacheProvider(prov2);
  metaFail = true; clock = Date.parse('2026-10-27T07:00:00Z'); await prov2.call('ensemble', '/v1/ensemble', P(0));
  META.ecmwf_ifs025_ensemble = { init: Date.parse('2026-10-27T06:00:00Z') / 1000, avail: Date.parse('2026-10-27T07:20:00Z') / 1000 };
  clock = Date.parse('2026-10-27T07:30:00Z'); metaFail = false; const b = await prov2.call('ensemble', '/v1/ensemble', P(0));
  ok(c2 === 2 && b.n === 2, 'B1 a run that became available after the call started is not adopted: fetched again (fresh run served)', c2);
  /* the server wires this cache on the provider for every backend caller */
  ok(/modelRuns\.cacheProvider\(provider\)/.test(readFileSync(join(API, 'index.mjs'), 'utf8')), 'B1 the server wraps the backend provider with it (index.mjs)'); }

/* ── B2 ── */
{ clock = Date.parse('2026-10-27T05:30:00Z');
  for (const d of ['ncep_gfs013', 'ncep_gfs025', 'dwd_icon', 'ecmwf_ifs', 'ncep_gefs025', 'dwd_icon_eps', 'ecmwf_ifs025_ensemble']) META[d] = { init: 1793059200, avail: 1793070000 };
  const runs = MR.createModelRuns({ dataDir: DATA, metaFetch, now });
  const get = (o) => (k) => o[k] == null ? null : o[k];
  const sp = runs.specFor('forecast', get({ hourly: 'precipitation_probability', daily: 'precipitation_probability_max' }));
  const sm = runs.specFor('forecast', get({ hourly: 'temperature_2m,precipitation_probability' }));
  ok(JSON.stringify(sp.regs) === JSON.stringify(['dwd_icon_eps', 'ecmwf_ifs025_ensemble', 'ncep_gefs025']), 'B2 probability-only request: keyed on the probability domains only', JSON.stringify(sp.regs));
  ok(sm.regs.length === 7, 'B2 a request with any other variable keeps every domain (deterministic + probability)', JSON.stringify(sm.regs));
  /* the superset: main and probability parts for two tehsils; then a new GFS run */
  const places = [['30.1', '70.1', '150'], ['31.2', '72.3', '200']];
  const fetched = [];
  const B = BM.createBmRows({ runs, now });
  const row = (la, lo, el, q) => { const H = { time: [] }; const t0 = Date.parse('2026-10-20T00:00:00Z') - 5 * 3600e3; for (let k = 0; k < 13 * 24; k++) H.time.push(new Date(t0 + k * 3600e3 + 5 * 3600e3).toISOString().slice(0, 16));
    for (const v of String(q.get('hourly')).split(',')) H[v] = H.time.map((_, k) => k % 7); const o = { latitude: Number(la), longitude: Number(lo), elevation: Number(el), generationtime_ms: 1, utc_offset_seconds: 18000, timezone: 'Asia/Karachi', timezone_abbreviation: 'PKT', hourly_units: Object.fromEntries([['time', 'iso8601'], ...String(q.get('hourly')).split(',').map((v) => [v, 'u'])]), hourly: H };
    if (q.get('daily')) { const D = { time: [] }; for (let d = 0; d < 13; d++) D.time.push(new Date(Date.parse('2026-10-20T00:00:00Z') + d * 864e5).toISOString().slice(0, 10)); for (const v of String(q.get('daily')).split(',')) D[v] = D.time.map((_, k) => k); o.daily_units = Object.fromEntries([['time', 'iso8601'], ...String(q.get('daily')).split(',').map((v) => [v, 'u'])]); o.daily = D; }
    if (q.get('current')) { const C = { time: '2026-10-27T10:30', interval: 900 }; for (const v of String(q.get('current')).split(',')) C[v] = 1; o.current = C; } return o; };
  B.setFetcher(async (q) => { fetched.push(String(q.get('hourly')).includes('precipitation_probability') && !String(q.get('hourly')).includes('temperature_2m') ? 'prob' : 'main');
    const la = q.get('latitude').split(','), lo = q.get('longitude').split(','), el = q.get('elevation').split(','); return la.map((x, i) => row(x, lo[i], el[i], q)); });
  const req = { latitude: places.map((p) => p[0]).join(','), longitude: places.map((p) => p[1]).join(','), elevation: places.map((p) => p[2]).join(','), hourly: 'temperature_2m,precipitation_probability', past_days: '1', forecast_days: '3', timezone: 'auto' };
  clock = Date.parse('2026-10-27T05:30:00Z');
  const sweepPoll = () => runs.poll(runs.specFor('forecast', get(req)));   /* the sweep path polls its request's run before it is served (server.mjs) */
  await sweepPoll(); const a1 = await B.compose(get(req), { keys: Object.keys(req) });
  ok(a1 && fetched.join() === 'main,prob', 'B2 first sweep: the superset main and probability parts are fetched once', fetched.join() + ' ' + JSON.stringify(B.status().why));
  /* a new GFS run becomes available (deterministic only) */
  clock += 20 * 60e3; META.ncep_gfs013 = { init: 1793080800, avail: clock / 1000 - 60 }; META.ncep_gfs025 = { init: 1793080800, avail: clock / 1000 - 60 };
  /* the metadata is read again once due (last availability + interval passed and pollSeconds since the last read) */
  clock += 6 * 3600e3; META.ncep_gfs013.avail = clock / 1000 - 60; META.ncep_gfs025.avail = clock / 1000 - 60;
  fetched.length = 0; await sweepPoll(); const a2 = await B.compose(get(req), { keys: Object.keys(req) });
  ok(a2 && fetched.join() === 'main', 'B2 a new GFS run: only the main part is fetched again; the probability part is not bought again (its answer did not change)', fetched.join() || 'nothing');
  /* a new ensemble run: the probability part is fetched */
  META.ncep_gefs025 = { init: 1793102400, avail: clock / 1000 - 30 }; clock += 6 * 3600e3 + 700e3; for (const d of Object.keys(META)) META[d].avail = Math.min(META[d].avail, clock / 1000 - 30);
  fetched.length = 0; await sweepPoll(); await B.compose(get(req), { keys: Object.keys(req) });
  ok(fetched.includes('prob'), 'B2 a new probability (ensemble) run: the probability part is fetched again (freshness kept)', fetched.join() || 'nothing');
  /* B2b · the Pakistan midnight with no new run: the rows of the run are cut to the new day, nothing is fetched (live 26 Oct: 3,110 weighted 15 min after midnight) */
  clock = Date.parse('2026-10-27T18:50:00Z'); fetched.length = 0; await sweepPoll(); const ev = await B.compose(get(req), { keys: Object.keys(req) });
  const evDays = ev ? [...new Set(JSON.parse(ev.body.toString()).map((L) => L.hourly.time.map((t) => t.slice(0, 10))).flat())] : null;
  clock = Date.parse('2026-10-27T19:20:00Z'); fetched.length = 0; await sweepPoll(); const nx = await B.compose(get(req), { keys: Object.keys(req) });
  const nxDays = nx ? [...new Set(JSON.parse(nx.body.toString()).map((L) => L.hourly.time.map((t) => t.slice(0, 10))).flat())] : null;
  ok(nx && fetched.length === 0 && JSON.stringify(nxDays) === JSON.stringify(['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']) && JSON.stringify(evDays) === JSON.stringify(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29']),
    'B2 after the Pakistan midnight with no new run: no superset fetch; the body is cut to the new day\'s window (past 1 + 3 days)', JSON.stringify({ f: fetched, evDays, nxDays }));
  const rowOf = (body, i) => JSON.parse(body.toString())[i].hourly;
  const a = rowOf(ev.body, 0), b = rowOf(nx.body, 0); const same = b.time.filter((t) => a.time.includes(t)).every((t) => a.temperature_2m[a.time.indexOf(t)] === b.temperature_2m[b.time.indexOf(t)]);
  ok(same, 'B2 the hours both days list carry the same values (the same run)');
  clock = Date.parse('2026-10-28T19:20:00Z'); fetched.length = 0; await sweepPoll(); await B.compose(get(req), { keys: Object.keys(req) });
  ok(fetched.includes('main'), 'B2 a row two days old is never used (fetched again)', fetched.join() || 'nothing'); }

/* ── B3 ── */
{ const D2 = join(T, 'bl'); mkdirSync(D2, { recursive: true });
  for (const f of ['blend-gate.json', 'blend-weights-active.json', 'blend-weights-v3.json']) { try { copyFileSync(join(ROOT, 'data', f), join(D2, f)); } catch (_) {} }
  const B = BL.createBlend({ dataDir: D2, env: {} });
  if (!B.on()) ok(false, 'B3 the blend gate and weights load from the tree data', JSON.stringify(B.status().error));
  else {
    const calls = []; const H0 = Date.parse('2026-10-27T00:00:00Z');
    const fetchFn = async (q) => { calls.push(q.past_days); const pd = Number(q.past_days), fd = Number(q.forecast_days); const t0 = H0 - pd * 864e5; const time = []; for (let k = 0; k < (pd + fd) * 24; k++) time.push(new Date(t0 + k * 3600e3).toISOString().slice(0, 16));
      const la = String(q.latitude).split(','), lo = String(q.longitude).split(','); return la.map((x, i) => { const h = { time }; for (const id of Object.values(BL.MODEL_IDS)) { h['temperature_2m_' + id] = time.map((t) => 20 + (Date.parse(t + 'Z') / 3600e3 % 24) / 3 + id.length / 10); h['dew_point_2m_' + id] = time.map((t) => 8 + (Date.parse(t + 'Z') / 3600e3 % 24) / 6); }
        return { latitude: Number(x), longitude: Number(lo[i]), elevation: 200, utc_offset_seconds: 0, timezone: 'GMT', hourly: h }; }); };
    const P = [{ lat: 30.1234, lon: 71.4321, elev: null }];
    const r3 = await B.rowsFor(P, { pastDays: 3 }, fetchFn); const r2 = await B.rowsFor(P, { pastDays: 2 }, fetchFn); const r5 = await B.rowsFor(P, { pastDays: 5 }, fetchFn);
    const w = (pd) => PV.weightOf((k) => ({ hourly: 'temperature_2m,dew_point_2m', models: Object.values(BL.MODEL_IDS).join(','), forecast_days: '8', past_days: String(pd + 1) })[k], 1);
    ok(calls.length === 1 && r3[0] && r2[0] && r5[0], 'B3 past windows 3, 2 and 5 of the same place and run: ONE members call (was 3)', JSON.stringify(calls));
    ok(w(Number(calls[0]) - 1) === w(3), 'B3 the one call asks the widest past window the provider weighs the same as the one asked (' + calls[0] + ' days, ' + w(3) + ' weighted per place)', w(Number(calls[0]) - 1) + ' vs ' + w(3));
    const r7 = await B.rowsFor(P, { pastDays: 7 }, fetchFn); ok(calls.length === 2 && r7[0], 'B3 a wider window that costs more (7 past days) is its own call', JSON.stringify(calls));
    /* the start applied from the wide row equals the one applied from a narrow row of the same run, hour by hour */
    const narrow = (await fetchFn({ latitude: '30.1234', longitude: '71.4321', past_days: '4', forecast_days: '8' }))[0];
    const zone = Object.keys((JSON.parse(readFileSync(join(D2, 'blend-gate.json'), 'utf8')).zones) || {})[0] || 'plains';
    const mk = () => { const time = []; const t0 = H0 - 2 * 864e5; for (let k = 0; k < 5 * 24; k++) time.push(new Date(t0 + k * 3600e3).toISOString().slice(0, 16)); return { utc_offset_seconds: 0, elevation: 200, hourly: { time, temperature_2m: time.map(() => 21), dew_point_2m: time.map(() => 9) } }; };
    const A = mk(), Bb = mk(); const nowMs = H0 + 10 * 3600e3;
    const ra = B.applyTo(A, r2[0], { zone, nowMs }), rb = B.applyTo(Bb, narrow, { zone, nowMs });
    ok(ra.applied === rb.applied && JSON.stringify(A.hourly) === JSON.stringify(Bb.hourly), 'B3 the served start from the shared wider row is identical to the narrow row\'s (' + (ra.applied ? 'applied' : ra.reason) + ')', JSON.stringify([ra.reason, rb.reason]));
  } }

/* ── B4 ── */
{ const rows = []; const st = { find: (c, f) => rows.find(f), all: () => rows, saveSoon: () => {} };
  const D3 = join(T, 'cb'); mkdirSync(D3, { recursive: true }); copyFileSync(join(ROOT, 'data', 'provider-budget.json'), join(D3, 'provider-budget.json'));
  const pv = PV.createProvider(st); const k0 = process.env.MACH_API_KEY, f0 = globalThis.fetch; process.env.MACH_API_KEY = 'test-not-a-key';
  globalThis.fetch = async () => new Response('{"ok":1}', { status: 200 });
  const cb = CBm.createCallBudget({ dataDir: D3, provider: pv, store: st, env: {} }); CBm.gateProvider(pv, cb, PV.weightOf, () => new Error('refused'));
  try { await pv.call('forecast', '/v1/forecast', { latitude: 33.7, longitude: 73, hourly: 'temperature_2m' }); } finally { globalThis.fetch = f0; if (k0 == null) delete process.env.MACH_API_KEY; else process.env.MACH_API_KEY = k0; }
  const tags = pv.windowFor().budgetByTag || {};
  ok(tags['(backend job) budget.unit.test.mjs'] && tags['(backend job) budget.unit.test.mjs'].weighted === 1 && !tags['(backend job)'], 'B4 a call outside any request is tagged "(backend job) <module>"', JSON.stringify(tags));
  ok(cb.tierOf({ tag: '(backend job) outlook.mjs', module: 'outlook.mjs', kind: 'ensemble' }).id === 'P3' && cb.tierOf({ tag: '(backend job) national.mjs', module: 'national.mjs', kind: 'forecast' }).id === 'P2', 'B4 its tier is decided as before (module / kind)'); }

/* ── B5 ── */
{ const job = JSON.parse(readFileSync(join(ROOT, 'data', 'retrain', 'om_archive.job.json'), 'utf8'));
  const D4 = join(T, 'om'); mkdirSync(join(D4, 'retrain'), { recursive: true });
  writeFileSync(join(D4, 'retrain', 'om_points.csv'), 'pid,lat,lon\n0,33.665,73.083\n1,24.86,67.01\n');
  writeFileSync(join(D4, 'retrain', 'om_archive.job.json'), JSON.stringify({ ...job, runEveryDays: 1, sources: ['best_match'], pointsPerCall: 2, firstRun: '2024-01-01' }));
  let TT = Date.parse('2024-01-06T23:50:00Z'); const nowF = () => TT;
  const provider = { configured: () => true, call: async (kind, path, q) => { const la = String(q.latitude).split(','), lo = String(q.longitude).split(','), init = Date.parse(q.run + ':00Z'); const rows = la.map((x, k) => { const time = [], h = {}; for (const v of q.hourly) h[v] = []; for (let L = 0; L <= 96; L++) { time.push(new Date(init + L * 3600e3).toISOString().slice(0, 16)); for (const v of q.hourly) h[v].push(L / 10); } return { latitude: Number(x), longitude: Number(lo[k]), elevation: 400, hourly: { time, ...h } }; }); return rows.length === 1 ? rows[0] : rows; } };
  const mk = (mode) => ({ limits: () => ({ cap: 1000, shedAt: 800, mode }), status: () => ({ usedWeighted: 900 }), runAs: (cls, fn) => fn(), tierOf: () => ({ id: 'P6' }) });
  const A = OM.createOmArchive({ dataDir: D4, provider, budget: mk('monitor'), env: {}, now: nowF }); const ra = await A.tick('monitor busy');
  ok(!(ra.stop && /background allowance/.test(ra.stop)) && A.status().done >= 1, 'B5 monitor mode: a busy day (use past the background allowance) does not stop the archive; its own daily share holds it', JSON.stringify({ stop: ra.stop, done: A.status().done }));
  ok(A.status().spentToday <= job.dailyShareOfCap * 1000, 'B5 monitor mode: the day\'s share (dailyShareOfCap x cap) is still never exceeded', A.status().spentToday);
  for (const mode of ['shed', 'enforce']) { const D5 = join(T, 'om-' + mode); mkdirSync(join(D5, 'retrain'), { recursive: true }); for (const f of ['om_points.csv', 'om_archive.job.json']) copyFileSync(join(D4, 'retrain', f), join(D5, 'retrain', f));
    const B = OM.createOmArchive({ dataDir: D5, provider, budget: mk(mode), env: {}, now: nowF }); const rb = await B.tick(mode);
    ok(rb.stop && /background allowance/.test(rb.stop) && B.status().done === 0, 'B5 ' + mode + ' mode: the archive still waits at the background allowance', rb.stop); } }

/* ── B6 ── */
{ const PB = JSON.parse(readFileSync(join(ROOT, 'data', 'provider-budget.json'), 'utf8'));
  ok(PB.mode === 'monitor' && /27 Oct 2026 23:16 PKT: monitor until the system runs properly; then shed again or a larger plan/.test(PB.decided || ''), 'B6 data/provider-budget.json: monitor mode, the owner\'s decision recorded', PB.mode); }

rmSync(T, { recursive: true, force: true });
console.log(`\nv283.26 budget unit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
