// v91.17.283 · WS2 data integrity · unit checks (no server). Each check reproduces a reviewed defect and fails on the base tree.
// usage: node scripts/tests283/ws2/ws2.test.mjs            (this tree)
//        TREE=/tmp/claude-0/v2821/srv node scripts/tests283/ws2/ws2.test.mjs   (run the same checks against another tree, e.g. the base)
// Items: C1 (limits / river / outlook missing members), F2 (nearTerm coverage), C5 (held layers), C10 (extended range outlook-only),
// F1 (fleet range screen), F1b (lone station 47 C), B-01 (alert severity leak), A (heat High+/cold Indicative), 8 / D (Khaplu shielded,
// station hold list), D18 (shore points snapped, at-sea message).
import { readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.TREE || join(HERE, '..', '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { d = String(d).replace(/\n/g, ' | '); if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + d.slice(0, 300) : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' · ' + d.slice(0, 600) : '')); } };
const tryRun = (n, f) => { try { f(); } catch (e) { ok(false, n, 'threw: ' + e.message); } };
const tryAsync = async (n, f) => { try { await f(); } catch (e) { ok(false, n, 'threw: ' + e.message); } };
const src = (rel) => readFileSync(join(ROOT, rel), 'utf8');
function fnText(rel, name) {
  const s = src(rel); const m = new RegExp('(?:function\\s+' + name + '\\s*\\(|const\\s+' + name + '\\s*=)').exec(s); if (!m) throw new Error('not found ' + name + ' in ' + rel);
  let i = s.indexOf('{', m.index), depth = 0, j = i; for (; j < s.length; j++) { const c = s[j]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) break; } } return s.slice(m.index, j + 1);
}
const constLine = (rel, name) => { const l = src(rel).split('\n').find(x => x.trim().startsWith('const ' + name + ' =')); return l ? l.trim() : ''; };
const imp = (rel) => import(pathToFileURL(join(ROOT, rel)).href);
const H = `const PKT_MS=5*3600e3; const pktDate=(ms)=>new Date(ms+PKT_MS).toISOString().slice(0,10); const pktHour=(ms)=>new Date(ms+PKT_MS).getUTCHours();
const r1=(x)=>(x==null||!isFinite(x))?null:Math.round(x*10)/10; const pad=(n)=>String(n).padStart(2,'0'); const fmtDay=(d)=>d; const fmtPKT=(ms)=>String(ms);
const tUTC=(s)=>Date.parse(String(s).length<=16?s+':00Z':s);
const quant=(a,q)=>{const s=a.filter(v=>v!=null&&isFinite(v)).sort((x,y)=>x-y);if(!s.length)return null;const p=(s.length-1)*q,lo=Math.floor(p),hi=Math.ceil(p);return s[lo]+(s[hi]-s[lo])*(p-lo);}; const median=(a)=>quant(a,.5);
const mosCorrect=(k,v)=>({value:v,applied:false}); const NEAR_H=72; const INTERNAL=false; const CAL=()=>'calibration';`;
const LIM = 'server/api/limits.mjs';
const limitsFn = (names) => new Function(H + '\n' + ['overFn', 'peakOf', 'marginOf', 'roll24', 'MIN_MEMBER_HOURS', 'minValidMembers', 'COMPLETE_SHARE'].map(n => constLine(LIM, n)).join('\n') + '\n' + names.map(n => fnText(LIM, n)).join('\n') + '\nreturn {' + names.join(',') + '};')();

/* ── C1 · asset limits: a missing member is not a member below the limit ── */
tryRun('C1 limits', () => {
  const { daysAhead } = limitsFn(['memberSeries', 'daysAhead']);
  const t0 = Date.UTC(2026, 9, 21, 19, 0), ms = Array.from({ length: 24 }, (_, i) => t0 + i * 3600e3);
  const hot = ms.map((_, i) => 30 + (i === 10 ? 15 : 0));   /* one member peaks 45 C */
  const nul = ms.map(() => null);
  const L = { variable: 'temperature_2m', dir: 'above', limit: 40, durationMin: 60 };
  const E = (mem) => ({ members: mem.length, ms, time: ms.map(m => new Date(m).toISOString()), mem: { temperature_2m: mem, relative_humidity_2m: mem.map(() => []) } });
  const a = daysAhead(E([nul, nul]), L, { kind: 'dailymax', unit: 'C' }, 0, t0)[0];
  ok(a.chance == null && a.state === 'not-assessed', 'C1a two all-missing members: not assessed, never 0 %', JSON.stringify(a));
  const b = daysAhead(E([hot, nul]), L, { kind: 'dailymax', unit: 'C' }, 0, t0)[0];
  ok(b.chance !== 50 && (b.chance == null || (b.chance === 100 && b.validMembers === 1 && b.of === 2)), 'C1b one 45 C member + one missing, limit 40: not 50 % (computed on the valid member, coverage flagged)', JSON.stringify(b));
  const bh = daysAhead(E([hot, nul]), L, { kind: 'hourly', unit: 'C' }, 0, t0)[0];
  ok(bh.chance !== 50 && bh.validMembers === 1, 'C1b hourly limit: the missing member is out of the denominator', JSON.stringify(bh));
  const ms2 = Array.from({ length: 29 }, (_, i) => t0 + i * 3600e3), s43 = ms2.map(() => 43);
  const E2 = { members: 3, ms: ms2, time: ms2.map(String), mem: { temperature_2m: [s43, s43, s43], relative_humidity_2m: [[], [], []] } };
  const c = daysAhead(E2, { ...L, durationMin: null }, { kind: 'dailymax', unit: 'C' }, 0, t0);
  ok(c[0].chance === 100 && c[1].chance == null && c[1].state === 'not-assessed', 'C1c partial PKT day of 5 h (every member 43 C, limit 40): not assessed, not 0 %; the full day stays 100 %', JSON.stringify(c.map(d => [d.date, d.chance, d.validMembers, d.partial])));
  const E3 = E(Array.from({ length: 51 }, (_, i) => i < 25 ? hot : nul));
  const d3 = daysAhead(E3, L, { kind: 'dailymax', unit: 'C' }, 0, t0)[0];
  ok(d3.chance == null && d3.validMembers === 25, 'C1 coverage: 25 of 51 members valid (< ceil(51/2) = 26) -> not assessed', JSON.stringify(d3));
});
tryRun('C1 river', () => {
  const { riverDays } = limitsFn(['riverDays']);
  const R = { dates: ['2026-10-21'], members: [[900], [null], [null]], control: [500] };
  const r = riverDays(R, { dir: 'above', limit: 800 })[0];
  ok(r.chance == null && r.validMembers === 1, 'S4 river: 1 of 3 members with a discharge -> not assessed (was 33 %)', JSON.stringify(r));
  const r2 = riverDays({ dates: ['d'], members: [[900], [700], [null]], control: [1] }, { dir: 'above', limit: 800 })[0];
  ok(r2.chance === 50 && r2.of === 3 && r2.validMembers === 2, 'S4 river: 2 of 3 valid -> chance over the valid members (50 %, of 3, valid 2)', JSON.stringify(r2));
});
tryRun('C1 outlook', () => {
  const s = src('server/api/outlook.mjs'); const a = s.indexOf('  const EVENTS = ['), b = s.indexOf('];', a) + 2;
  const memberEvents = new Function("const SNOW_CM_TO_MM_DIVISOR=0.7; const HEAT_CLASSES_WHY='x'; const r1=(x)=>x==null||!isFinite(x)?null:Math.round(x*10)/10;\n" + fnText('server/api/outlook.mjs', 'pct') +
    "\nconst THRESHOLDS=[{id:'tx40',x:40}]; const app={}; const defs=()=>null; const eraOffset=()=>null; const zoneOf=()=>'plains'; const isCoastal=()=>false; const coastKm=()=>500; const EC={info:()=>({})};\n" + s.slice(a, b) + '\n' + fnText('server/api/outlook.mjs', 'memberEvents') + '\nreturn memberEvents;')();
  const dates = Array.from({ length: 8 }, (_, i) => '2026-12-' + String(10 + i)), n = (v) => Array(8).fill(v);
  const r = memberEvents({ unitId: 'x', elevM: 1000, lat: 34, lon: 73 }, dates, { tx: [n(10), n(10)], tn: [n(-2), n(null)], pr: [n(0), n(null)], sn: [n(0), n(0)], gu: [n(0), n(0)], at: [n(5), n(5)] });
  ok(r.frostSpell.p === 100, 'C1 outlook: one frost member + one member without Tmin -> frost spell 100 % of the valid member (was 50 %)', JSON.stringify(r.frostSpell).slice(0, 200));
  const r2 = memberEvents({ unitId: 'x', elevM: 1000, lat: 34, lon: 73 }, dates, { tx: [n(10)], tn: [n(-1)], pr: [n(null)], sn: [n(0)], gu: [n(0)], at: [n(5)] });
  ok(r2.rain3_75.p == null && (r2.rainUnion == null || r2.rainUnion.p == null), 'C1 outlook: all rain missing -> heavy rain not assessed (was 0 %)', JSON.stringify([r2.rain3_75, r2.rainUnion]).slice(0, 300));
  const r3 = memberEvents({ unitId: 'x', elevM: 1000, lat: 34, lon: 73 }, dates, { tx: [n(10), n(10)], tn: [n(-2), n(5)], pr: [n(30), n(0)], sn: [n(0), n(0)], gu: [n(0), n(0)], at: [n(5), n(5)] });
  ok(r3.frostSpell.p === 50 && r3.rain3_75.p === 50 && r3.frostSpell.validMembers === undefined, 'C1 outlook: complete members are counted as before (50 %, no coverage field)', JSON.stringify([r3.frostSpell.p, r3.rain3_75.p]));
});

/* ── F2 · 0-72 h coverage ── */
tryRun('F2', () => {
  const { nearTerm } = limitsFn(['nearTerm']);
  const t0 = Date.UTC(2026, 5, 10, 19), time = [], T = [];
  for (let i = 0; i < 72; i++) { time.push(new Date(t0 + i * 3600e3).toISOString().slice(0, 16)); T.push(30 + 14 * Math.sin(Math.PI * ((i % 24) - 8) / 12)); }
  const L = { dir: 'above', limit: 40, variable: 'temperature_2m', durationMin: 60 };
  const full = nearTerm({ ok: true, series: { time, temperature_2m: T.slice() } }, L, { kind: 'hourly', label: 'Temperature', unit: 'C' }, t0);
  ok(full.state === 'crosses', 'F2 full series still crosses', full.state);
  const sp = nearTerm({ ok: true, series: { time, temperature_2m: T.map((v, i) => (i === 3 || i === 4) ? v : null) } }, L, { kind: 'hourly', label: 'Temperature', unit: 'C' }, t0);
  ok(sp.state === 'not-evaluated', 'F2a 2 of 72 hours valid: not evaluated (was "clear, no crossing in the next 72 h")', JSON.stringify(sp).slice(0, 200));
  const night = nearTerm({ ok: true, series: { time, temperature_2m: T.map((v, i) => { const h = i % 24; return (h >= 7 && h <= 18) ? null : v; }) } }, { ...L, variable: 'temperature_2m_max' }, { kind: 'dailymax', label: 'Daily maximum temperature', unit: 'C' }, t0);
  ok(night.state === 'not-evaluated', 'F2b only the 12 night hours of each day: the daily maximum is not read from the night', night.state + ' | ' + night.why);
  const clearFull = nearTerm({ ok: true, series: { time, temperature_2m: T.map(v => v - 10) } }, L, { kind: 'hourly', label: 'Temperature', unit: 'C' }, t0);
  ok(clearFull.state === 'clear' && /^no crossing in the next 72 h/.test(clearFull.why), 'F2 a complete clear series answers clear with the same words', clearFull.why);
});

/* ── C5 · only once-per-issue layers are held ── */
await tryAsync('C5', async () => {
  const { holdIssueLevels } = await imp('server/api/engine.mjs');
  const rec = { days: [{ day: 0, layers: { heat: { L: { u1: 4 } }, cold: { L: { u1: 2 } }, rain_hz: { L: { u1: 3 } }, drought: { L: { u1: 1 } }, glof: { L: { u1: 0 } }, flood_riverine: { L: { u1: 2 } }, nss_baseline: { L: { u1: 1 } }, nss_dynamic: { L: { u1: 1 } } } }, { day: 1, layers: { cold: { L: { u1: 1 } } } }] };
  holdIssueLevels(rec); const d1 = rec.days[1].layers;
  ok(!d1.heat && !d1.rain_hz, 'C5 a missing day-1 heat / rain layer stays missing (day-0 Severe heat is not carried forward)', JSON.stringify(Object.keys(d1)));
  ok(['drought', 'glof', 'flood_riverine', 'nss_baseline', 'nss_dynamic'].every(k => d1[k] && d1[k].held === 0) && d1.cold.L.u1 === 1, 'C5 the five once-per-issue layers are still held; a present day layer is untouched', JSON.stringify(Object.keys(d1)));
});

/* ── C10 · EC46 / SEAS5 are outlook only ── */
tryRun('C10', () => {
  const ext = new Function('app', 'let _seasSkill = null, _seasSkillAt = 0;\n' + fnText('server/api/outlook.mjs', 'extendedUse') + '\nreturn extendedUse;');
  const none = ext({ seasVerify: { summary: () => ({ ec46: {}, seas5: {} }) } })('ec46');
  ok(none.outlookOnly === true && none.canAlert === false && none.verifiedSkill === false, 'C10 EC46 with no scored week: outlook only, cannot alert, no verified skill', JSON.stringify(none));
  const bad = ext({ seasVerify: { summary: () => ({ ec46: { w2: { brierWarmer: 0.33, brierWetter: 0.2 } } }) } })('ec46');
  ok(bad.verifiedSkill === false && bad.canAlert === false, 'C10 week-2 Brier 0.33 (worse than always 50 %): not verified', JSON.stringify(bad));
  const s = src('server/api/outlook.mjs');
  ok(/use: extendedUse\('ec46'\)/.test(s) && /use: extendedUse\('seas5'\)/.test(s), 'C10 both the weeks block and the season block carry the use label');
});

/* ── F1 · range screen of one live reading ── */
await tryAsync('F1', async () => {
  const { dewPointC } = { dewPointC: (T, rh) => { const a = 17.62, b = 243.12, g = Math.log(rh / 100) + a * T / (b + T); return b * g / (a - g); } };
  let RANGE = null; try { RANGE = JSON.parse(src('data/fleet-range-screen.json')); } catch (_) {}
  const fc = new Map(); const now = Date.now(), iso = (ms) => new Date(ms).toISOString(), hk = (ms) => new Date(Math.round(ms / 3600e3) * 3600e3).toISOString().slice(0, 13);
  const t5 = now - 5 * 60e3; fc.set('db-fc', { hours: new Map([[hk(t5), { served: 15, raw: 14 }]]) }); fc.set('db-fc2', { hours: new Map([[hk(t5), { served: 15, raw: 14 }]]) });
  /* v91.17.283.14 · screen() judges values through obsqc.mjs: the harness hands it the module, its parameters and the few helpers it reads */
  const QC = await import(pathToFileURL(join(ROOT, 'server', 'api', 'obsqc.mjs')).href); const QCP = QC.loadParams(join(ROOT, 'data')); QCP.marks = [];
  const screen = new Function('dewPointC', 'fc', 'RANGE', 'QC', 'QCP', 'const FRESH_MIN = 60; const state = { rangeRejectedTotal: 0, qc: null }; const SHIELDED = new Map(); const COPYOF = new Map(); const zoneAt = () => \'plains\'; const elevAt = () => null;\n' +
    "const VMAP = [['T', 'tempC'], ['Td', 'dewC'], ['RH', 'rhPct'], ['P', 'pressureHpa'], ['W', 'windKmh'], ['G', 'gustKmh'], ['S', 'solarWm2'], ['PR', 'precipRateMm']];\n" + fnText('server/api/fleet.mjs', 'screen') + '\nreturn (rows) => ({ counts: screen(rows), state });')(dewPointC, fc, RANGE, QC, QCP);
  const rows = [
    { key: 'db-hot', fromDb: true, source: 'db', lat: 35.15, lon: 76.33, lastUpdated: iso(t5), tempC: 75, rhPct: 5, pressureHpa: null },
    { key: 'db-cold', fromDb: true, source: 'db', lat: 24.86, lon: 67.0, lastUpdated: iso(t5), tempC: -45, rhPct: 40, pressureHpa: null },
    { key: 'db-future', fromDb: true, source: 'db', lat: 33.7, lon: 73.0, lastUpdated: iso(now + 5 * 3600e3), tempC: 24, rhPct: 50, pressureHpa: null },
    { key: 'db-neg', fromDb: true, source: 'db', lat: 31.5, lon: 74.3, lastUpdated: iso(t5), tempC: 26, rhPct: 50, windKmh: -12, gustKmh: -20, precipRateMm: -4, pressureHpa: null },
    { key: 'db-fc', fromDb: true, source: 'db', lat: 33.6, lon: 73.1, lastUpdated: iso(t5), tempC: 30, rhPct: 40, pressureHpa: null },
    { key: 'db-fc2', fromDb: true, source: 'db', lat: 33.6, lon: 73.1, lastUpdated: iso(t5), tempC: 25, rhPct: 50, pressureHpa: null },
  ];
  const { counts, state } = screen(rows); const by = Object.fromEntries(rows.map(r => [r.key, r]));
  ok(!by['db-hot'].usable && !by['db-cold'].usable, 'F1 a 75 C and a -45 C database reading are not usable (outside the month envelope from data)', JSON.stringify([by['db-hot'].qc, by['db-cold'].qc]));
  ok(!by['db-future'].usable, 'F1 a time stamp 5 h in the future is not usable', JSON.stringify(by['db-future'].qc));
  ok(by['db-neg'].usable && by['db-neg'].windKmh == null && by['db-neg'].gustKmh == null && by['db-neg'].precipRateMm == null, 'F1 negative wind / gust / rain are dropped; the temperature stays usable', JSON.stringify(by['db-neg']).slice(0, 300));
  ok(!by['db-fc'].usable && by['db-fc2'].usable, 'F1 with a served forecast: +15 C from it is rejected, +10 C (inside the clean pair history) kept', JSON.stringify([by['db-fc'].qc, by['db-fc2'].qc]));
  ok(state.rangeRejectedTotal >= 4 && ((counts.values['T:climate-range'] || 0) + (counts.values['T:gross-range'] || 0)) >= 3, 'F1 rejections are counted (v91.17.283.14: per value and test, obsqc.mjs)', JSON.stringify(counts));
});

/* ── F1b · one station moves a place to 47 C ── */
await tryAsync('F1b', async () => {
  const { createHyperlocal } = await imp('server/api/hyperlocal.mjs');
  const D = mkdtempSync(join(tmpdir(), 'ws2hl-')); copyFileSync(join(ROOT, 'data', 'hyperlocal-model.json'), join(D, 'hyperlocal-model.json'));
  const prev = process.env.NIGRAAN_NOWCAST; process.env.NIGRAAN_NOWCAST = '0';
  try {
    const HL = createHyperlocal({ fleet: { liveReadings: () => [], latest: () => ({ at: new Date().toISOString(), rows: [] }) } }, D);
    HL.inject([{ key: 'khaplu-test', lat: 35.15, lon: 76.33, tempC: 75, served: 15 }]);
    const a = HL.at(35.17, 76.35);
    ok(!a.applied, 'F1b one station 2.9 km away with a +60 C residual: no live correction (was dT +35 C, served 47.2 C)', JSON.stringify(a).slice(0, 300));
    HL.inject([{ key: 'k1', lat: 35.15, lon: 76.33, tempC: 17, served: 15 }]);
    const b = HL.at(35.17, 76.35);
    ok(b.applied && b.lone === true && Math.abs(b.dT) <= 2, 'F1b one station with a +2 C residual still corrects, marked lone', JSON.stringify(b).slice(0, 200));
    HL.inject([{ key: 'k1', lat: 35.15, lon: 76.33, tempC: 20, served: 15 }, { key: 'k2', lat: 35.16, lon: 76.34, tempC: 20.5, served: 15 }]);
    const c = HL.at(35.17, 76.35);
    ok(c.applied && c.stations === 2 && !c.lone, 'F1b two supporting stations: unchanged rule (applied)', JSON.stringify(c).slice(0, 200));
  } finally { if (prev === undefined) delete process.env.NIGRAAN_NOWCAST; else process.env.NIGRAAN_NOWCAST = prev; rmSync(D, { recursive: true, force: true }); }
});

/* ── B-01 / owner decision A · served alert rows are re-gated ── */
await tryAsync('B-01', async () => {
  const { createEngine } = await imp('server/api/engine.mjs');
  const D = mkdtempSync(join(tmpdir(), 'ws2en-'));
  for (const f of ['hazard-scale.json', 'alert-policy.json', 'map-layer-scales.json']) if (existsSync(join(ROOT, 'data', f))) copyFileSync(join(ROOT, 'data', f), join(D, f));
  const now = new Date().toISOString();
  const rowLeak = { name: 'Demo', district: true, alert: 'Flood + Rainfall · Act', sev: 5, classRank: 4, band: 'Act', index: 86, hazard: 'flood', holders: [{ hazard: 'flood', index: 86 }, { hazard: 'rain_hz', index: 66 }], coEqual: true };
  const rowHeat = { name: 'Hot', alert: 'Heat · Act', sev: 5, classRank: 4, band: 'Act', index: 88, hazard: 'heat', holders: [{ hazard: 'heat', index: 88 }] };
  const rowCold = { name: 'Cold', alert: 'Cold · Watch', sev: 4, classRank: 3, band: 'Watch', index: 70, hazard: 'cold', holders: [{ hazard: 'cold', index: 70 }] };
  const rowRain = { name: 'Wet', alert: 'Rainfall · Act', sev: 5, classRank: 4, band: 'Act', index: 90, hazard: 'rain_hz', holders: [{ hazard: 'rain_hz', index: 90 }] };
  writeFileSync(join(D, 'engine-latest.json'), JSON.stringify({ received: now, at: now, build: 't', gate: 'g', words: ['Normal', 'Low', 'Moderate', 'High', 'Severe'], units: 2, unitKeys: { u1: 'P|D|T1', u2: 'P|D|T2' }, ms: 1,
    days: [{ day: 0, date: '2026-10-20', basis: 'peak', layers: { heat: { L: { u1: 3, u2: 2 }, S: {} }, cold: { L: { u1: 1, u2: 0 }, S: {} } } }], alerts: [rowLeak, rowHeat, rowCold, rowRain], alertsFull: [rowLeak, rowHeat, rowCold, rowRain] }));
  const CAN = { flood: false, wind: false, rain_hz: true, heat: true, cold: true, quake: true };
  try {
    const EN = createEngine({ gate: { alertMinRank: () => JSON.parse(src('data/model-gate.json')).alert_min_class_rank.value, canAlert: (h) => !!CAN[h], tagOf: (l) => ({ status: 'operational', canAlert: !!CAN[l], productType: 'Forecast' }), full: () => ({ ready: true, ...JSON.parse(src('data/model-gate.resolved.json')) }) } }, D, {});   /* INTEG: the alert policy is read from the gate (data/alert-policy.json retired) */
    const A = EN.alerts(); const by = Object.fromEntries((A.rows || []).map(r => [r.name, r]));
    const d = by.Demo;
    ok(d && d.band === 'Watch' && d.sev === 4 && d.classRank === 3 && d.index === 66 && /Watch$/.test(d.alert) && !/Act/.test(d.alert), 'B-01 the dropped flood lane leaves no Act band / sev 5 / rank 4 on the rain row (Watch 66 -> Watch, sev 4)', JSON.stringify(d));
    ok(!by.Hot && !by.Cold, 'A heat Severe and cold rows raise no alert (owner decision A)', JSON.stringify(Object.keys(by)));
    ok(by.Wet && by.Wet.band === 'Act' && by.Wet.sev === 5 && by.Wet.regatedBy === undefined, 'B-01 a row whose holders all pass is served unchanged', JSON.stringify(by.Wet));
    const lc = EN.levels('cold', 0, false), lh = EN.levels('heat', 0, false);
    ok(lc.gateTag && lc.gateTag.canAlert === false && lc.gateTag.productType === 'Indicative', 'A cold layer: canAlert false, Indicative', JSON.stringify(lc.gateTag));
    ok(lh.gateTag && lh.gateTag.canAlert === true && JSON.stringify(lh.gateTag.alertLevels) === '["Low","Moderate"]', 'A heat layer: Moderate keeps alerts, High / Severe listed as Indicative', JSON.stringify(lh.gateTag));
    const U = EN.unit('u1', false); const h0 = U.days && U.days[0].layers.heat, c0 = U.days && U.days[0].layers.cold;
    ok(h0 && h0.canAlert === false && h0.productType === 'Indicative' && c0 && c0.canAlert === false, 'A unit: heat High and cold entries say Indicative, cannot alert', JSON.stringify([h0, c0]));
    const U2 = EN.unit('u2', false); const h2 = U2.days[0].layers.heat;
    ok(h2 && h2.canAlert === undefined, 'A unit: heat Moderate carries no Indicative mark', JSON.stringify(h2));
    const { alertGate, gatePolicy } = await imp('server/api/engine.mjs');
    const g = alertGate({ canAlert: (h) => !!CAN[h], scale: JSON.parse(src('data/hazard-scale.json')), policy: gatePolicy(JSON.parse(src('data/model-gate.resolved.json'))), names: {}, minRank: JSON.parse(src('data/model-gate.json')).alert_min_class_rank.value });   /* v283.24: the alert minimum from the gate register */
    const compact = g([{ name: 'Demo', hazard: 'flood', alert: 'Flood + Rainfall · Act', sev: 5, band: 'Act', hazards: ['flood', 'rain_hz'] }, { name: 'Wet', hazard: 'rain_hz', alert: 'Rainfall · Act', sev: 5, band: 'Act', hazards: ['rain_hz'] }]);
    ok(compact.length === 1 && compact[0].name === 'Wet', 'B-01 compact report rows: a row that loses a holder and carries no index is not served with the dropped lane\'s Act; a passing row is kept', JSON.stringify(compact));
  } finally { rmSync(D, { recursive: true, force: true }); }
});

/* ── item 8 / decision D · Khaplu 20 Oct: shielded sensor, and the hold list ── */
await tryAsync('8 shield', async () => {
  const { judgeShield } = await imp('server/api/shieldscreen.mjs');
  const R = JSON.parse(src('data/station-shield-rule.json')).rule;
  const F = JSON.parse(readFileSync(join(HERE, 'fixtures', 'khaplu_20261020.json'), 'utf8'));
  const hist = new Map(Object.entries(F.stations).map(([k, s]) => [k, { lat: s.lat, lon: s.lon, rows: s.rows.map(([t, T, S, W, G]) => ({ ms: Date.parse(t), T, S, W, G })) }]));
  const at = (iso) => judgeShield(hist, R, Date.parse(iso), (k) => k !== 'khaplu');
  const v = at('2026-10-20T08:00:00Z');   /* judges the 06:00-08:00 UTC window (11-13 PKT) */
  const k = v.get('khaplu'), g = v.get('gilgit');
  ok(k && k.marked, 'item 8 Khaplu 20 Oct 11-13 PKT: flat ~11 C, solar ~0, wind 0 against neighbours\' sun -> shielded', JSON.stringify(k));
  ok(g && !g.marked, 'item 8 Gilgit (neighbour, same window) is not marked', JSON.stringify(g));
  const night = at('2026-10-19T22:00:00Z'); ok(!night.has('khaplu'), 'item 8 no daylight window -> no verdict (the hold persists, no clearing at night)');
});
await tryAsync('D hold', async () => {
  /* v91.17.283.14 · owner decision 24 Oct 2026: no station is held out any more; MACH 106 Khaplu's values are judged one by one (its
     silent or shielded outdoor array fails them: item 8 above, obsqc.mjs 'array-silent' / 'shielded-array') */
  const { createFleet } = await imp('server/api/fleet.mjs');
  const D = mkdtempSync(join(tmpdir(), 'ws2fl-')), RT = mkdtempSync(join(tmpdir(), 'ws2rt-'));   /* an empty root: no key file is read */
  for (const f of ['mach-fleet-stations.json', 'station-holds.json', 'obs-qc-params.json', 'obs-qc-marks.json']) if (existsSync(join(ROOT, 'data', f))) copyFileSync(join(ROOT, 'data', f), join(D, f));
  const prev = process.env.NIGRAAN_FLEET; process.env.NIGRAAN_FLEET = '0';
  try {
    const FL = createFleet({}, RT, D);
    ok(FL.excluded === undefined, 'D no station exclusion API: Khaplu is not held out as a station (v91.17.283.14)');
    const sc = FL.screen('khaplu'); ok(!sc || sc.verdict !== 'excluded', 'D the siting screen gives Khaplu no "excluded" verdict', JSON.stringify(sc || {}).slice(0, 200));
  } finally { if (prev === undefined) delete process.env.NIGRAAN_FLEET; else process.env.NIGRAAN_FLEET = prev; rmSync(D, { recursive: true, force: true }); rmSync(RT, { recursive: true, force: true }); }
});

/* ── D18 · Ormara and Kemari are on land; a point at sea is told so; a land border is not snapped ── */
await tryAsync('D18', async () => {
  const { classifyOutside } = await imp('server/api/territory.mjs');
  const units = JSON.parse(src('server/contract/units.json')); const C = (la, lo) => classifyOutside(join(ROOT, 'data'), units, la, lo);
  const o = C(25.2088, 64.6357), k = C(24.8125, 66.97);
  ok(o && o.kind === 'snapped' && o.unit.unitId === 'Balochistan|Gwadar|Ormara' && k && k.kind === 'snapped' && /Kemari/.test(k.unit.unitId), 'D18 Ormara town and Kemari port are placed in their tehsils (not "outside Pakistan-administered territory")', JSON.stringify([o && o.kind, o && o.km, k && k.kind, k && k.km]));
  ok(C(24.75, 66.9).kind === 'sea' && C(24.5, 66.5).kind === 'sea', 'D18 points off Karachi are "at sea", with their own message');
  ok(C(34.5553, 69.2075).kind === 'outside' && C(31.6047, 74.60).kind === 'outside' && C(34.0837, 74.7973).kind === 'outside', 'D18 Kabul, a point 2 km inside India at Wagah and Srinagar stay outside (no snap across a land border or into IIOJK)');
  ok(/classifyOutside/.test(src('server/api/places.mjs')) && /SEA_WHY/.test(src('server/api/places.mjs')), 'D18 the point placing (places.mjs pointRow, read by the point record) uses the shore / sea classification (v283.24 P13: the point engine\'s own chain is gone)');
});

console.log(`\nWS2 ${pass} passed, ${fail} failed (tree ${ROOT})`);
process.exit(fail ? 1 : 0);
