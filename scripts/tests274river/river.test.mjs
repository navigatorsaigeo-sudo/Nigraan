import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.274 RIVER · stale-sheet switch, operator gauge-equivalent flow, switch off, customer view clean.
   node scripts/tests274river/river.test.mjs        (offline; starts its own server on a temp data folder, port 8982) */
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const ROOT = (__T.ROOT + '/');
let pass = 0, fail = 0; const ok = (c, n, x) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 400) : '')); } };

/* ── A · module ─────────────────────────────────────────────────────────── */
const { createRiverCal } = await import(ROOT + 'server/api/rivercal.mjs');
const RC = createRiverCal(ROOT + 'data'); const C = JSON.parse(readFileSync(ROOT + 'data/river-cal.json', 'utf8'));
ok(Object.values(C.reaches).every(r => r.levelGate && r.levelGate.passes === false), 'no reach map level is replaced (no calibration passed the level gate)');
ok(RC.switchAgeDays('khanki') === C.reaches.khanki.staleSheet.switchAgeDays && RC.switchAgeDays('guddu') === null, 'switch ages come from the file (khanki ' + RC.switchAgeDays('khanki') + ' d; guddu none)');
const flowIds = Object.entries(C.reaches).filter(([, r]) => r.flow).map(([k]) => k);
ok(flowIds.length && flowIds.every(k => C.reaches[k].flowGate.passes), 'gauge-equivalent flow only on reaches whose flow passed (' + flowIds.join(', ') + ')');
ok(!C.reaches.balloki.flow && !C.reaches.sidhnai.flow && !C.reaches.taunsa.flow, 'no flow table where the gate failed (Balloki, Sidhnai, Taunsa)');
/* reference values computed with the Python fit's own apply_map (rivercal.py) */
const days = (L) => L.map(([date, q]) => ({ date, q: [q * 0.8, q, q * 1.2] }));
const g = RC.gaugeEquivalent('guddu', days([['2026-07-18', 15000], ['2026-07-19', 15000], ['2026-07-20', 15000], ['2026-07-21', 60000], ['2026-07-22', 60000], ['2026-07-23', 60000]]));
ok(g && g.lagDays === -2 && g.days[0].kcusecs === null && g.days[1].kcusecs === null, 'lag -2: the first two days of a run carry no value');
ok(g && Math.abs(g.days[2].kcusecs - 425.6) < 0.15, 'guddu 15000 m³/s on 20 Jul -> 425.6 thousand cusecs (Python 425.6)', g && g.days[2].kcusecs);
ok(g && Math.abs(g.days[5].kcusecs - 1545.8) < 0.15, 'above the fitted range the top ratio is carried (Python 1545.8)', g && g.days[5].kcusecs);
const g2 = RC.gaugeEquivalent('guddu', days([['2026-08-01', 9000], ['2026-08-02', 9000], ['2026-08-03', 9000]]));
ok(g2 && Math.abs(g2.days[2].kcusecs - 176.6) < 0.15, 'guddu 9000 m³/s on 3 Aug -> 176.6 (Python 176.6)', g2 && g2.days[2].kcusecs);
const g3 = RC.gaugeEquivalent('guddu', days([['2026-12-03', 3000], ['2026-12-04', 3000], ['2026-12-05', 3000]]));
ok(g3 && g3.days[2].kcusecs === null && /outside the season/.test(g3.days[2].why), 'December: no value (outside the season the calibration was tested on)');
ok(RC.gaugeEquivalent('taunsa', days([['2026-07-18', 9000]])) === null, 'no gauge-equivalent flow for a reach that failed');
process.env.NIGRAAN_RIVERCAL = '0';
ok(RC.switchAgeDays('khanki') === null && RC.gaugeEquivalent('guddu', days([['2026-07-20', 1]])) === null, 'NIGRAAN_RIVERCAL=0 turns both off');
delete process.env.NIGRAAN_RIVERCAL;

/* ── B · the gauge panel through the server ─────────────────────────────── */
const PORT = await __T.freePort(), O = 'http://127.0.0.1:' + PORT;
const dir = mkdtempSync(join(tmpdir(), 'river274-'));
for (const f of readdirSync(ROOT + 'data')) if (!['flood.json', 'river-outlook.json', 'server.log'].includes(f)) symlinkSync(join(ROOT, 'data', f), join(dir, f));
const pkt = (dd) => new Date(Date.now() + 5 * 3600e3 + dd * 864e5).toISOString().slice(0, 10);
const fdays = [-2, -1, 0, 1, 2, 3, 4, 5].map(pkt);
const pt = (id, q) => ({ point: { id, name: id, river: 'x', kind: 'barrage', province: 'Punjab' }, climate: null, days: fdays.map(date => ({ date, n: 51, q: [q * 0.8, q, q * 1.2], p: null })) });
writeFileSync(join(dir, 'flood.json'), JSON.stringify({ snapped: { at: new Date().toISOString(), points: {}, failed: [] }, climate: null,
  forecast: { at: new Date().toISOString(), days: fdays, members: 50, failed: [], points: { khanki: pt('khanki', 3200), marala: pt('marala', 400), guddu: pt('guddu', 15000), taunsa: pt('taunsa', 9000) } } }));
const RO = JSON.parse(readFileSync(ROOT + 'data/river-outlook.json', 'utf8'));
const outlook = (age) => { const j = JSON.parse(JSON.stringify(RO)); j.basedOn = pkt(-age); j.gauges.forEach(g => { g.lastReading = pkt(-age); }); writeFileSync(join(dir, 'river-outlook.json'), JSON.stringify(j)); };
async function server(env) {
  const ch = spawn(process.execPath, [ROOT + 'server/server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), NIGRAAN_DATA_DIR: dir, MACH_OFFLINE: '1', ...env }, stdio: 'ignore' });
  for (let i = 0; i < 120; i++) { await new Promise(r => setTimeout(r, 1000)); try { const h = await (await fetch(O + '/health')).json(); if (h.warm) break; } catch (_) {} }
  return ch;
}
const get = async (p, h) => (await fetch(O + p, { headers: h || {} })).json();
const cust = { 'x-agn-view': 'customer' };
let ch = await server({});
try {
  outlook(10);
  const op = await get('/api/flood/gauges'); const G = Object.fromEntries(op.gauges.map(x => [x.id, x]));
  const exp = (await get('/api/flood/point?id=khanki')).days || null;
  ok(G.khanki.method === 'model-reach' && G.khanki.date === pkt(0) && G.khanki.kcusecs === null && G.khanki.lastSheet && G.khanki.lastSheet.date === pkt(-10), 'sheet 10 days old: Khanki (switch at 8 d) shows the reach model level for today, sheet reading kept for the operator', JSON.stringify(G.khanki).slice(0, 300));
  ok(G.marala.method === 'model-reach' && G.marala.cls === 0, 'Marala switched, model level Normal at a low flow');
  ok(G.khanki.cls >= 1, 'Khanki at about its 5-year model flow reads above Normal (' + G.khanki.clsName + ')');
  ok(G.guddu.method !== 'model-reach' && G.taunsa.method !== 'model-reach' && G.tarbela.method !== 'model-reach', 'gauges with no switch age keep the last sheet reading (Guddu, Taunsa, Tarbela)');
  ok(JSON.stringify(op.modelSwitch.sort()) === JSON.stringify(['khanki', 'marala']), 'modelSwitch lists the switched gauges', op.modelSwitch);
  ok(G.guddu.modelEq && G.guddu.modelEq.lagDays === -2 && G.guddu.modelEq.days.length === fdays.length && !G.taunsa.modelEq, 'operator: gauge-equivalent flow on Guddu (passed), none on Taunsa (failed)');
  const cv = await get('/api/flood/gauges', cust); const CG = Object.fromEntries(cv.gauges.map(x => [x.id, x]));
  ok(CG.khanki.method === 'model-reach' && ['Normal', 'Low', 'Moderate', 'High', 'Severe'].includes(CG.khanki.clsName), 'customer: switched gauge shows a level word');
  ok(cv.gauges.every(x => x.modelEq === undefined && x.lastSheet === undefined && x.kcusecs === null && x.limits === undefined) && !cv.heldOut, 'customer: no flows, limits, sheet record or skill');
  ok(!/PMD|FFD|Pakistan Meteorological|Flood Forecasting|IRSA/.test(JSON.stringify(cv)), 'customer: no supplier names');
  outlook(5);
  const op5 = await get('/api/flood/gauges'); ok(op5.gauges.every(x => x.method !== 'model-reach') && op5.modelSwitch.length === 0, 'sheet 5 days old: every gauge keeps its reading (no switch age reached)');
  outlook(6);
  const op6 = await get('/api/flood/gauges'); ok(JSON.stringify(op6.modelSwitch) === '[]', 'sheet 6 days old: Sulemanki would switch, but it has no reach forecast here -> keeps reading (no blank)');
  const st = await get('/api/flood/status'); ok(st.riverCal && st.riverCal.ready && st.riverCal.enabled && st.riverCal.levelPasses.length === 0, '/api/flood/status reports the river check');
} finally { ch.kill(); await new Promise(r => setTimeout(r, 1500)); }
ch = await server({ NIGRAAN_RIVERCAL: '0' });
try {
  outlook(10);
  const off = await get('/api/flood/gauges');
  ok(off.gauges.every(x => x.method !== 'model-reach' && !x.modelEq) && off.modelSwitch === undefined, 'NIGRAAN_RIVERCAL=0: the panel is the v273 panel');
} finally { ch.kill(); await new Promise(r => setTimeout(r, 1000)); }
rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
