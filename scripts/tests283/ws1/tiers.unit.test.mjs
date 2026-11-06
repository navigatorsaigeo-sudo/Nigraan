/* v91.17.283.31 · owner 29 Oct 2026: overage is allowed, so the shed/enforce checks below now assert that nothing is shed or refused.
   v91.17.283 · WS1 · PATCH3 · THE SHEDDING ORDER AND THE MAIN-RUN RULE, without a server: server/api/callbudget.mjs (tiers, shed mode, test
   mode, the daily allowance from the plan) on the shipped data/provider-budget.json, server/api/modelruns.mjs (floorMain, mainUpdate,
   the answer cache under main-runs-only and cache-first) and the gate's tier of a backend call by the module that asked.
     U1     shed is the shipped mode; the day's cap = plan / days in the month, background allowance about 130 k, the rest user reserve;
     U2     every caller gets its tier (P1-P6) from the file's rules;
     U3-U7  the shedding order: as the day's background use grows, P6, then P5, then P4, then P3 are refused; P1 and P2 never (shed mode);
            a person never, also past the cap;
     U8-U9  P4 turns to 00/12 UTC runs only at its level (shed mode), not in monitor mode; monitor refuses nothing and counts what it would shed;
     U10    enforce: P1 too at the cap;
     U11-U13 test mode (NIGRAAN_TEST_MODE=1): P3-P6 refused at zero use, also in monitor mode; P1/P2 run on main runs only; people cache first;
     U14    /health status: per tier today's use, what was shed, the state;
     U15    the gate: a backend call from national.mjs (P2) goes out past every level, one from catchment.mjs (P6) is refused;
     M1-M4  floorMain and mainUpdate: a 06/18 UTC run is not a new main run; a 12 UTC run is; a 9-model set fetches only the members with one;
     M5-M6  the backend answer cache: a background P4 answer is kept over a 06 UTC member run and fetched for the 12 UTC run; a person's
            request in test mode is answered from the last answer after a newer run.
   usage: node scripts/tests283/ws1/tiers.unit.test.mjs */
import { mkdtempSync, writeFileSync, rmSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d != null ? ' :: ' + String(d).slice(0, 300) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = mkdtempSync(join(tmpdir(), 'agn-tier-'));
try {
  const CB = await import(pathToFileURL(join(ROOT, 'server', 'api', 'callbudget.mjs')).href);
  const MRm = await import(pathToFileURL(join(ROOT, 'server', 'api', 'modelruns.mjs')).href);
  const SHIP = JSON.parse(readFileSync(join(ROOT, 'data', 'provider-budget.json'), 'utf8'));
  const put = async (j) => { writeFileSync(join(D, 'provider-budget.json'), JSON.stringify(j)); await sleep(20); };
  /* v91.17.283.26 · the shipped file is in monitor mode (owner 27 Oct 2026 23:16 PKT); the tier rules are tested here in shed mode, the
     mode the owner returns to later (same file, mode switched) */
  ok(SHIP.mode === 'monitor', 'U0 the shipped data/provider-budget.json is in monitor mode (owner 27 Oct)', SHIP.mode);
  const SHED = { ...SHIP, mode: 'shed' };
  await put(SHED);
  const W = { day: new Date().toISOString().slice(0, 10), backendWeighted: 0, browserWeighted: 0 };
  const env = {}; const cb = CB.createCallBudget({ dataDir: D, provider: { windowFor: () => W }, store: { saveSoon() {}, all: () => [W] }, env });
  const now = new Date(), dim = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const st0 = cb.status(), A = st0.dailyAllowance || {};
  /* v91.17.283.31 · owner 29 Oct 2026: overage is billed and allowed: a file asking for shed is read as monitor (kept as requestedMode) */
  ok(cb.mode() === 'monitor' && st0.requestedMode === 'shed' && Math.abs(A.weighted - SHIP.monthlyPlanWeighted / dim) < 1 && Math.abs(A.background - SHIP.shedBackgroundAtShare * SHIP.monthlyPlanWeighted / dim) < 1 && A.userReserve === A.weighted - A.background,
    'U1 overage allowed: a file asking for shed is read as monitor; the day\'s share of the plan (plan / ' + dim + ' days) is still reported', JSON.stringify(A));
  const T = (info) => (cb.tierOf(info) || {}).id;
  const NINE = 'ecmwf_ifs025,ecmwf_aifs025_single,ncep_aigfs025,gfs_seamless,icon_seamless,gem_seamless,ukmo_seamless,meteofrance_seamless,jma_seamless';
  const cases = [[{ tag: 'sweep refresh', kind: 'forecast', models: null }, 'P1'], [{ tag: 'sweep refresh', kind: 'forecast', models: NINE }, 'P4'], [{ tag: 'engine', kind: 'forecast' }, 'P1'],
    [{ tag: 'model metadata' }, 'P1'], [{ tag: 'blend members', kind: 'forecast', models: NINE }, 'P4'], [{ tag: '(backend job)', module: 'national.mjs', kind: 'forecast' }, 'P2'],
    [{ tag: 'fleet-pairs', kind: 'forecast' }, 'P2'], [{ tag: '(backend job)', module: 'outlook.mjs', kind: 'ensemble' }, 'P3'], [{ tag: '(backend job)', module: 'outlook.mjs', kind: 'historicalForecast' }, 'P3'],
    [{ tag: '(backend job)', module: 'outlook.mjs', kind: 'seasonal' }, 'P5'], [{ tag: 'pool', kind: 'ensemble' }, 'P6'], [{ tag: '(backend job)', module: 'catchment.mjs', kind: 'archive' }, 'P6'], [{ tag: 'learn-x' }, 'P6']];
  const bad = cases.filter(([i, t]) => T(i) !== t).map(([i, t]) => JSON.stringify(i).slice(0, 60) + ' -> ' + T(i) + ' (want ' + t + ')');
  ok(!bad.length, 'U2 every caller gets its tier from the file\'s rules', bad.join(' | '));
  const B = A.background, setBg = (share) => { W.budgetByClass = { background: share * B, user: 0 }; W.backendWeighted = share * B; };
  const may = (tier) => cb.allow('background', 1, { tier });
  const lvl = (id) => SHIP.tiers.find((t) => t.id === id).shedAtBackgroundShare;
  W.budgetWouldShedByTier = {};
  setBg(lvl('P6') + 0.01); ok(may('P6') && may('P5') && may('P4') && may('P3') && may('P2') && may('P1') && W.budgetWouldShedByTier.P6 === 1, 'U3 overage allowed: past P6\'s level nothing is shed; what shed would have refused is counted (P6)', JSON.stringify(W.budgetWouldShedByTier));
  setBg(lvl('P3') + 0.01); ok(may('P6') && may('P5') && may('P4') && may('P3') && may('P1'), 'U4-U6 overage allowed: past every tier level all tiers run');
  setBg(3); W.browserWeighted = 10 * A.weighted;
  ok(may('P1') && may('P6') && cb.allow('user', 1e6) && !(W.budgetShedByTier && Object.keys(W.budgetShedByTier).length), 'U7 overage allowed: background at 3x its allowance and use at 10x the day: nothing refused, nothing shed', JSON.stringify(W.budgetShedByTier || {}));
  W.browserWeighted = 0;
  const p4m = SHIP.tiers.find((t) => t.id === 'P4').mainRunsOnlyAtBackgroundShare;
  setBg(p4m + 0.01);
  ok(cb.mainRunsOnly('P4') === false && cb.mainRunsOnly('P1') === false, 'U8 overage allowed: P4 is not held to 00/12 UTC runs past its level (' + p4m + ')');
  await put({ ...SHIP, mode: 'monitor' }); W.budgetWouldShedByTier = {}; setBg(5);
  ok(may('P6') && may('P3') && cb.mainRunsOnly('P4') === false && W.budgetWouldShedByTier.P6 === 1 && W.budgetWouldShedByTier.P3 === 1, 'U9 monitor: nothing refused, nothing held back; what shed would refuse is counted per tier', JSON.stringify(W.budgetWouldShedByTier));
  await put({ ...SHIP, mode: 'enforce' }); setBg(0.1); W.browserWeighted = A.weighted;
  ok(may('P1') && cb.allow('user', 1) && cb.mode() === 'monitor', 'U10 overage allowed: a file asking for enforce refuses nothing at the day\'s share of the plan'); W.browserWeighted = 0;
  await put({ ...SHIP, mode: 'monitor' }); setBg(0); env.NIGRAAN_TEST_MODE = '1';
  ok(!may('P3') && !may('P4') && !may('P5') && !may('P6') && may('P1') && may('P2'), 'U11 test mode: only P1 and P2 run (P3-P6 refused at zero use, also in monitor mode)');
  ok(cb.mainRunsOnly('P1') && cb.mainRunsOnly('P2') && cb.userCacheFirst() && /Test mode/.test(cb.refusal('background')), 'U12 test mode: P1/P2 on new 00/12 UTC runs only; a person\'s request cache first; the refusal says why');
  const st = cb.status();
  ok(st.testMode === true && st.testModeSource === 'NIGRAAN_TEST_MODE' && st.tiers.find((t) => t.tier === 'P5').state === 'off (test mode)', 'U13 status says test mode and its source');
  env.NIGRAAN_TEST_MODE = '0'; await put(SHED); setBg(0);
  cb.note('background', 7, 'sweep refresh', { tag: 'sweep refresh', kind: 'forecast', models: NINE }); cb.note('background', 3, 'sweep refresh', { tag: 'sweep refresh', kind: 'forecast' }); cb.note('user', 2, 'page /');
  const st2 = cb.status(); const P4r = st2.tiers.find((t) => t.tier === 'P4');
  ok(P4r.todayWeighted === 7 && P4r.todayCalls === 1 && st2.tiers.find((t) => t.tier === 'P1').todayWeighted >= 3 && st2.userToday.weighted === 2 && P4r.shedAtWeighted === Math.round(lvl('P4') * B) && st2.projection, 'U14 status: per tier today\'s use, its levels and state, the user line and the projection', JSON.stringify(P4r));
  /* the gate: a call's tier by the module that asked */
  { W.budgetByClass = { background: 3 * B }; W.backendWeighted = 3 * B;
    const prov = { configured: () => true, call: async () => ({ ok: true }), noteProxyCall() {} };
    CB.gateProvider(prov, cb, () => 1, (cls) => Object.assign(new Error('refused ' + cls), { refused: true }));
    writeFileSync(join(D, 'national.mjs'), 'export const go = (p) => p.call("forecast", "/v1/forecast", { latitude: "1" });');
    writeFileSync(join(D, 'catchment.mjs'), 'export const go = (p) => p.call("archive", "/v1/archive", { latitude: "1" });');
    const n = await import(pathToFileURL(join(D, 'national.mjs')).href), c = await import(pathToFileURL(join(D, 'catchment.mjs')).href);
    let r1 = null, r2 = null; try { r1 = await n.go(prov); } catch (e) { r1 = e; } try { r2 = await c.go(prov); } catch (e) { r2 = e; }
    ok(r1 && r1.ok === true && r2 && r2.ok === true, 'U15 overage allowed: past every level backend calls from national.mjs (P2) and catchment.mjs (P6) both go out', String(r1 && (r1.message || r1.ok)) + ' / ' + String(r2 && (r2.message || r2.ok))); }
  /* modelruns */
  copyFileSync(join(ROOT, 'data', 'provider-models.json'), join(D, 'provider-models.json'));
  const day = Math.floor(Date.now() / 864e5) * 86400 - 86400, H = (h) => day + h * 3600;
  let META = {}; const mr = MRm.createModelRuns({ dataDir: D, metaFetch: async (kind, d) => { const t = META[d] != null ? META[d] : H(0); return { last_run_initialisation_time: t, last_run_availability_time: t + 1, update_interval_seconds: 1 }; } });
  { const j = JSON.parse(readFileSync(join(D, 'provider-models.json'), 'utf8')); j.pollSeconds = 0.001; writeFileSync(join(D, 'provider-models.json'), JSON.stringify(j)); }
  ok(mr.floorMain(H(6), [0, 12]) === H(0) && mr.floorMain(H(12), [0, 12]) === H(12) && mr.floorMain(H(23), [0, 12]) === H(12) && mr.floorMain(H(3) - 86400 + 86400, [0, 12]) === H(0), 'M1 floorMain: 06 -> 00, 12 -> 12, 23 -> 12 UTC');
  const g0 = (k) => ({ hourly: 'temperature_2m' })[k];
  const bm = (ifs, icon) => 'dwd_icon@' + icon + ',ecmwf_ifs@' + ifs + ',ncep_gfs013@' + H(0) + ',ncep_gfs025@' + H(0);
  ok(mr.mainUpdate('forecast', g0, bm(H(0), H(0)), bm(H(0), H(6)), [0, 12]) === null && mr.mainUpdate('forecast', g0, bm(H(0), H(0)), bm(H(0), H(12)), [0, 12]).models === null, 'M2 best_match: a 06 UTC ICON run is not a new main run (keep); the 12 UTC run is (fetch all)');
  const g9 = (k) => ({ hourly: 'temperature_2m', models: NINE })[k];
  const spec9 = mr.specFor('forecast', g9); const k9 = (o) => spec9.regs.map((d) => d + '@' + (o[d] != null ? o[d] : H(0))).join(',');
  const u1 = mr.mainUpdate('forecast', g9, k9({}), k9({ ukmo_global_deterministic_10km: H(6) }), [0, 12]);
  const u2 = mr.mainUpdate('forecast', g9, k9({}), k9({ ukmo_global_deterministic_10km: H(12), jma_gsm: H(6) }), [0, 12]);
  ok(u1 === null && u2 && JSON.stringify(u2.models) === '["ukmo_seamless"]' && u2.key.includes('ukmo_global_deterministic_10km@' + H(12)) && u2.key.includes('jma_gsm@' + H(0)), 'M3 9-model set: a 06 UTC UKMO run keeps the body; a 12 UTC UKMO run fetches UKMO only (JMA\'s 06 UTC run waits), labelled per member', JSON.stringify(u2));
  ok(mr.mainUpdate('forecast', g9, k9({}), k9({}), [0, 12]) === null, 'M4 the same key: nothing');
  /* the answer cache under the policy */
  let calls = 0; const prov2 = { call: async () => { calls++; return { v: calls }; } }; mr.cacheProvider(prov2);
  let pol = { mainRunsOnly: true, hours: [0, 12] }; mr.setPolicy(() => pol);
  const q9 = { latitude: '30', longitude: '70', hourly: 'temperature_2m', models: NINE, timezone: 'GMT' };
  const a1 = await prov2.call('forecast', '/v1/forecast', q9); META.ukmo_global_deterministic_10km = H(6); await sleep(5); const a2 = await prov2.call('forecast', '/v1/forecast', q9);
  const c2 = calls; META.ukmo_global_deterministic_10km = H(12); await sleep(5); const a3 = await prov2.call('forecast', '/v1/forecast', q9);
  ok(a1.v === 1 && a2.v === 1 && c2 === 1 && a3.v === 2 && calls === 2, 'M5 answer cache, background P4 under main-runs-only: kept over a 06 UTC member run, fetched for the 12 UTC run', JSON.stringify([a1, a2, a3, calls]));
  pol = { cacheFirst: true }; META.dwd_icon = H(18); await sleep(5);
  const qp = { latitude: '31', longitude: '73', hourly: 'temperature_2m', timezone: 'GMT' }; const b1 = await prov2.call('forecast', '/v1/forecast', qp); META.dwd_icon = H(24); await sleep(5); const b2 = await prov2.call('forecast', '/v1/forecast', qp);
  pol = null; await sleep(5); const b3 = await prov2.call('forecast', '/v1/forecast', qp);
  ok(b1.v === b2.v && b3.v === b1.v + 1, 'M6 a person\'s request in test mode (cache first): the last answer after a newer run; outside test mode: fetched', JSON.stringify([b1, b2, b3]));
} catch (e) { ok(false, 'test run', e && e.stack || e); }
finally { rmSync(D, { recursive: true, force: true }); }
console.log(`\ntiers unit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
