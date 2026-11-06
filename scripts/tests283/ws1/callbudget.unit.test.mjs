/* v91.17.283 · WS1 · server/api/callbudget.mjs on its own (no server): the class rules, the shed share and the cap, the override, the
   per-class tally and the refusal counts on the provider's day window, the class carried through async code (AsyncLocalStorage).
   Fails on v91.17.282.1 (the module does not exist). usage: node scripts/tests283/ws1/callbudget.unit.test.mjs */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d != null ? ' :: ' + String(d).slice(0, 300) : '')); } };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
let M = null; try { M = await import(pathToFileURL(join(ROOT, 'server', 'api', 'callbudget.mjs')).href); } catch (e) { ok(false, 'U0 server/api/callbudget.mjs loads', e.message); }
if (M) {
  const D = mkdtempSync(join(tmpdir(), 'agn-cb-'));
  try {
    const W = { day: '2026-10-20', backendWeighted: 0, browserWeighted: 0 }; let saves = 0;
    const HIST = [];
    const provider = { windowFor: () => W }, store = { saveSoon: () => { saves++; }, all: (c) => (c === 'quotaWindows' ? HIST.concat([W]) : []) };
    const env = {};
    const cb = M.createCallBudget({ dataDir: D, provider, store, env });
    ok(cb.allow('background', 1e9) && cb.status().configured === false, 'U1 no file and no override: no cap (allowed), status says not configured', JSON.stringify(cb.status()));
    writeFileSync(join(D, 'provider-budget.json'), JSON.stringify({ mode: 'enforce', monthlyPlanWeighted: 5000000, dailyWeightedCap: 1000, shedBackgroundAtShare: 0.8, userTags: ['ai-point'] }));
    ok(cb.status().dailyWeightedCap === 1000 && cb.status().shedBackgroundAtWeighted === 800, 'U2 the cap and the shed level come from the file', JSON.stringify(cb.status()));
    W.browserWeighted = 790;
    /* v91.17.283.31 · owner 29 Oct 2026: overage is billed and allowed: a file asking for enforce is read as monitor, nothing is refused */
    ok(cb.allow('background', 10) && cb.allow('background', 11) && cb.mode() === 'monitor' && cb.status().requestedMode === 'enforce', 'U3 overage allowed: background past the shed level (800) is not refused; the file\'s enforce is read as monitor (kept as requestedMode)');
    ok(cb.allow('user', 210) && cb.allow('user', 211), 'U4 overage allowed: a person\'s call past the cap (1000) is not refused');
    W.backendWeighted = 210;
    ok(cb.allow('user', 0.5) && /overage allowed: not refused/.test(cb.status().state), 'U5 at the cap nothing is refused and the state says overage is allowed', cb.status().state);
    ok(!(W.budgetRefused && (W.budgetRefused.background || W.budgetRefused.user)) && W.budgetWouldRefuse && W.budgetWouldRefuse.background >= 1 && W.budgetWouldRefuse.user >= 1 && saves >= 3, 'U6 nothing is refused; what a cap would have refused is counted per class on the day window (saved with the store)', JSON.stringify(W.budgetWouldRefuse) + ' saves ' + saves);
    ok(cb.classOfTag('') === 'user' && cb.classOfTag('ai-point') === 'user' && cb.classOfTag('sweep-warm') === 'background' && cb.classOfTag('engine') === 'background', 'U7 no tag = a person\'s page; userTags = user; any other tag = background');
    ok(cb.current() === 'background', 'U8 outside any request (timers, schedulers) the class is background');
    const seen = await cb.runAs('user', async () => { await new Promise((r) => setTimeout(r, 5)); const a = cb.current(); const b = await cb.runAs('background', async () => cb.current()); return [a, b, cb.current()]; });
    ok(seen.join() === 'user,background,user', 'U9 the class follows async code and nests', seen.join());
    cb.runAs('user', () => cb.note(cb.current(), 2.5)); cb.note('background', 1);
    ok(W.budgetByClass && W.budgetByClass.user === 2.5 && W.budgetByClass.background === 1, 'U10 the per-class tally', JSON.stringify(W.budgetByClass));
    env.NIGRAAN_CALL_BUDGET = 'off'; ok(cb.allow('user', 1e9) && cb.status().configured === false, 'U11 NIGRAAN_CALL_BUDGET=off turns the cap off');
    env.NIGRAAN_CALL_BUDGET = '5000'; ok(cb.status().dailyWeightedCap === 5000 && cb.allow('user', 1) && cb.status().source === 'NIGRAAN_CALL_BUDGET', 'U12 NIGRAAN_CALL_BUDGET=<n> overrides the cap (the file\'s share stays)');
    delete env.NIGRAAN_CALL_BUDGET;
    /* modes */
    const day0 = Date.parse('2026-10-20T12:00:00Z');
    writeFileSync(join(D, 'provider-budget.json'), JSON.stringify({ mode: 'monitor', monthlyPlanWeighted: 5000000, dailyWeightedCap: 1000, shedBackgroundAtShare: 0.8 })); await new Promise((r) => setTimeout(r, 20));
    W.budgetRefused = {}; W.budgetWouldRefuse = {};
    ok(cb.mode() === 'monitor' && cb.allow('user', 1e6) && cb.allow('background', 1e6) && W.budgetWouldRefuse.user === 1 && W.budgetWouldRefuse.background === 1 && !W.budgetRefused.user, 'U14 monitor: nothing refused over the cap; the would-be refusals are counted', JSON.stringify(W.budgetWouldRefuse));
    writeFileSync(join(D, 'provider-budget.json'), JSON.stringify({ mode: 'shed', monthlyPlanWeighted: 5000000, dailyWeightedCap: 1000, shedBackgroundAtShare: 0.8 })); await new Promise((r) => setTimeout(r, 20));
    ok(cb.mode() === 'monitor' && cb.status().requestedMode === 'shed' && cb.allow('user', 1e6) && cb.allow('background', 1e6), 'U15 overage allowed: a file asking for shed is read as monitor; neither background nor a person is refused over the cap');
    env.NIGRAAN_CALL_BUDGET_MODE = 'monitor'; ok(cb.mode() === 'monitor' && cb.allow('background', 1e6), 'U16 NIGRAAN_CALL_BUDGET_MODE overrides the file'); delete env.NIGRAAN_CALL_BUDGET_MODE;
    HIST.push({ day: '2026-10-17', backendWeighted: 100000, browserWeighted: 200000 }, { day: '2026-10-19', backendWeighted: 0, browserWeighted: 300000 }, { day: '2026-09-01', browserWeighted: 9e9 });
    const P = cb.projection(day0);
    ok(P.completedDays === 3 && P.meanDailyWeighted === 200000 && P.projected30DayWeighted === 6000000 && P.exceedsPlan === true && P.projectedShareOfPlan === 1.2, 'U17 projection: mean over completed days since the first record (the missing 18 Oct counts 0, the old September day is outside the 30 days) x 30, against the plan', JSON.stringify(P));
    const AL = []; const cb2 = M.createCallBudget({ dataDir: D, provider, store, env, alert: async (...a) => { AL.push(a); } });
    await cb2.checkPlan(day0); ok(AL.length === 0 && cb2.projection(day0).exceedsPlan === true && cb2.status().monthToDate && /^allowed/.test(cb2.status().monthToDate.overage), 'U18 overage allowed: a projection above the plan raises no alert; it is information (status.monthToDate)', JSON.stringify({ alerts: AL.length, exceeds: cb2.projection(day0).exceedsPlan, mtd: cb2.status().monthToDate }).slice(0, 300));
    { const m = cb2.month(Date.parse('2026-10-20T12:00:00Z')); ok(m.month === '2026-10' && m.usedWeighted === 600000 + (W.backendWeighted || 0) + (W.browserWeighted || 0) && m.monthlyPlanWeighted === 5000000 && m.overByWeighted === 0 && m.projectedMonthWeighted > 0, 'U18b month to date: the UTC month\'s weighted calls against the plan (the September day is outside the month)', JSON.stringify(m)); }
    HIST.length = 0; HIST.push({ day: '2026-10-19', browserWeighted: 100000 }); AL.length = 0; await cb2.checkPlan(day0);
    ok(AL.length === 0 && cb2.projection(day0).exceedsPlan === false, 'U19 ... and not when it is under the plan (3,000,000)');
    cb.note('user', 3, 'page /customize'); cb.note('background', 7, 'sweep-warm');
    ok(W.budgetByTag['page /customize'].cls === 'user' && W.budgetByTag['sweep-warm'].weighted === 7 && cb.status().topTagsToday[0].tag === 'sweep-warm', 'U20 use per caller tag on the day window', JSON.stringify(cb.status().topTagsToday));
    writeFileSync(join(D, 'provider-budget.json'), JSON.stringify({ mode: 'block', dailyWeightedCap: 1000, shedBackgroundAtShare: 0.8 })); await new Promise((r) => setTimeout(r, 20));
    ok(cb.status().configured === false && /mode must be/.test(cb.status().why || ''), 'U21 an unknown mode is refused with the reason', cb.status().why);
    /* the gate keeps the per-caller record honest: provider.mjs names the first module outside provider.mjs, never the wrapper */
    { const PM = await import(pathToFileURL(join(ROOT, 'server', 'api', 'provider.mjs')).href);
      const rows = []; const st = { find: (c, f) => rows.find(f), all: () => rows, saveSoon: () => {} };
      const pv = PM.createProvider(st); const seen = []; pv.hooks.onCall = (x) => seen.push(x.caller);
      const k0 = process.env.MACH_API_KEY, f0 = globalThis.fetch; process.env.MACH_API_KEY = 'test-not-a-key';
      globalThis.fetch = async () => new Response('{"ok":1}', { status: 200 });
      writeFileSync(join(D, 'provider-budget.json'), JSON.stringify({ mode: 'monitor', monthlyPlanWeighted: 5000000, dailyWeightedCap: 1000, shedBackgroundAtShare: 0.8 })); await new Promise((r) => setTimeout(r, 20));
      const cb3 = M.createCallBudget({ dataDir: D, provider: pv, store: st, env: {} }); M.gateProvider(pv, cb3, PM.weightOf, () => new Error('refused'));
      try { await pv.call('forecast', '/v1/forecast', { latitude: 33.7, longitude: 73, hourly: 'temperature_2m' }); } finally { globalThis.fetch = f0; if (k0 == null) delete process.env.MACH_API_KEY; else process.env.MACH_API_KEY = k0; }
      ok(seen[0] === 'callbudget.unit.test.mjs', 'U22 behind the gate the per-caller record still names the calling module (not the wrapper)', JSON.stringify(seen));
      ok(pv.windowFor().budgetByClass && pv.windowFor().budgetByClass.background === 1 && pv.windowFor().budgetByTag['(backend job) callbudget.unit.test.mjs'].weighted === 1, 'U23 a backend call outside any request is tallied as background, tag "(backend job) <module>" (v283.26)', JSON.stringify(pv.windowFor().budgetByTag)); }
    writeFileSync(join(D, 'provider-budget.json'), JSON.stringify({ dailyWeightedCap: -1, shedBackgroundAtShare: 0.8 }));
    await new Promise((r) => setTimeout(r, 20));
    ok(cb.status().configured === false && /dailyWeightedCap/.test(cb.status().why || ''), 'U13 an invalid file is refused with the reason (never a made-up cap)', JSON.stringify(cb.status()));
  } finally { rmSync(D, { recursive: true, force: true }); }
}
console.log(`\ncallbudget unit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
