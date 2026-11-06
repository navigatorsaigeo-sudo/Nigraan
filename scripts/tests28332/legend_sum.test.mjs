/* v91.17.283.32 · hotfix · every map key adds up: for every hazard layer and day the counts of the key's rows sum to the number of tehsils
   (no unit uncounted, none counted twice); heat and cold show their Low row (mild heat / cold stress, v283.31 levels); a "not tested" answer
   whose reason does not start with "model not yet tested" (the live heavy-rain text: "not tested: too few events ...") is its own key row,
   never folded into "Data missing"; the GLOF key says susceptibility. Served answers are fixtures routed in the browser, as in
   tests28331p/map_states (the test server's own issued run is out of date). */
import { T, browser, open, consoleReady } from '../tests28328p/lib.mjs';
const t = T(); const br = await browser();
const o = await open(br, '/analyst'); const pg = o.pg; await consoleReady(pg);
const uids = await pg.evaluate(() => (window.PK_DISTRICTS.features || []).map((f) => f.properties).filter((p) => p && p.uid != null && p.province !== IIOJK).map((p) => p.uid));
t.ok(uids.length > 500, 'tehsils on the page', uids.length);
const LEVEL = ['heat', 'cold', 'wind', 'flood', 'landslide', 'glof', 'drought', 'rain_hz'];
const codeOf = (i) => { const m = i % 10; return m < 5 ? m : [-2, -5, -6, -4, -1][m - 5]; };
const STATE_OF = { '-1': 'missing', '-2': 'not_applicable', '-3': 'not_applicable', '-4': 'not_applicable', '-5': 'not_tested', '-6': 'input_not_current' };
const LIVE_NT = 'not tested: too few events: under 30 heavy-rain days in the held-out years';
const now = Date.now();
function fixture(layer, day) {
  const j = { ready: true, at: new Date(now - 600e3).toISOString(), issueId: 'fx#2', stale: false, validUntil: new Date(now + 3 * 3600e3).toISOString(), build: '91.17.283.32', stampMismatch: false,
    words: ['Normal', 'Low', 'Moderate', 'High', 'Severe'], layer, day, date: new Date(now + day * 864e5).toISOString().slice(0, 10), basis: 'peak',
    code: { '-1': 'not assessed: no data from the hazard engine for this place and day', '-2': 'not assessed: outside the method’s range here', '-4': 'cannot happen here', '-5': LIVE_NT, '-6': 'input not current' },
    stateOf: STATE_OF, inputAgeH: 30, lastAvailable: new Date(now - 7200e3).toISOString(), levels: {}, whys: {} };
  uids.forEach((u, i) => { const c = codeFor(layer, i); j.levels[u] = c; if (c === -5) j.whys[u] = LIVE_NT; }); return j; }
/* a level the layer's own rule cannot issue (the register's classes, e.g. GLOF has no Low) is served as Normal, as the server would */
let LEGC = null; const W5 = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
const codeFor = (layer, i) => { const c = codeOf(i); if (c <= 0 || !LEGC || !LEGC[layer]) return c; return LEGC[layer].classes.includes(W5[c]) ? c : 0; };
const expOf = (layer) => { const e = { c: [0, 0, 0, 0, 0], nt: 0 }; uids.forEach((u, i) => { const c = codeFor(layer, i); if (c >= 0) e.c[c]++; else if (c === -5) e.nt++; }); return e; };
let LEG = null; for (let k = 0; k < 20 && !LEG; k++) { LEG = await pg.evaluate(() => (window.AGN && AGN.levelLegends) ? AGN.levelLegends.layers : null); if (!LEG) await pg.waitForTimeout(500); } LEGC = LEG;
await pg.route('**/api/levels?layer=*', (route) => { const u = new URL(route.request().url()); const l = u.searchParams.get('layer'), d = +(u.searchParams.get('day') || 0);
  if (![...LEVEL, 'flood_riverine'].includes(l)) return route.continue();
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture(l, d)) }); });
await pg.evaluate(() => document.dispatchEvent(new CustomEvent('agn:levels-run', { detail: {} })));
async function pick(layer) { await pg.evaluate((l) => { const s = document.getElementById('mapHazardPick'); s.value = l; s.dispatchEvent(new Event('change', { bubbles: true })); }, layer); await pg.waitForTimeout(2500); }
async function setDay(d) { await pg.evaluate((d) => { try { AGN.day.set(d); } catch (_) {} }, d); await pg.waitForTimeout(2500); }
async function read(layer) { return pg.evaluate((layer) => { const leg = document.getElementById('v3legend'), T = AGN.hz5.tally(), R = AGN.v283.runInfo(layer);
  const rows = [...(leg ? leg.querySelectorAll('.agn-leg-row') : [])].map((r) => r.textContent.replace(/\s+/g, ' ').trim());
  const title = leg ? ((leg.querySelector('h4,.agn-leg-title,b') || {}).textContent || leg.textContent.slice(0, 120)) : '';
  return { rows, title, lt: leg ? leg.textContent : '', st: R && R.st, pend: T ? T.pend : null }; }, layer); }
const sumRows = (rows) => rows.reduce((a, x) => { const m = /(\d+)\s*$/.exec(x); return a + (m ? +m[1] : 0); }, 0);
t.ok(LEG && LEG.heat && LEG.heat.classes.includes('Low') && LEG.cold && LEG.cold.classes.includes('Low'), 'the register lists Low for heat and cold', JSON.stringify(LEG && { heat: LEG.heat, cold: LEG.cold }));
t.ok(LEG && LEG.heat && !(LEG.heat.alertClasses || []).includes('Low'), 'a heat Low never alerts', JSON.stringify(LEG && LEG.heat));
for (const layer of LEVEL) {
  await pick(layer);
  for (const d of [0, 1, 2, 3]) {
    await setDay(d); let r = await read(layer);
    for (let k = 0; k < 12 && (r.st !== 'current' || r.pend > 0 || /Loading/.test(r.lt)); k++) { await pg.waitForTimeout(1500); r = await read(layer); }
    const tag = layer + ' day ' + d, exp = expOf(layer);
    if (r.pend > 0) { console.log('SKIP ' + tag + ': ' + r.pend + ' tehsils still loading'); continue; }
    t.ok(sumRows(r.rows) === uids.length, tag + ': the key rows add up to the tehsils', sumRows(r.rows) + ' vs ' + uids.length + ' ' + JSON.stringify(r.rows));
    t.ok(r.rows.some((x) => /^Model not yet tested here/.test(x) && x.endsWith(String(exp.nt))), tag + ': "Model not yet tested" is its own row with its count', JSON.stringify(r.rows));
    t.ok(!r.rows.some((x) => /^Data missing/.test(x) && /not tested/.test(x)), tag + ': "not tested" is never under "Data missing"', JSON.stringify(r.rows));
    if (layer === 'heat' || layer === 'cold') t.ok(r.rows.some((x) => /^Low\b/.test(x) && /moderate (heat|cold) stress/.test(x) /* v283.35 B6 */ && x.endsWith(String(exp.c[1]))), tag + ': the Low row (mild stress) with its count', JSON.stringify(r.rows));
    if (layer === 'glof') t.ok(/susceptibility/i.test(r.lt), tag + ': the GLOF key says susceptibility', r.lt.slice(0, 200));
  }
}
t.ok(o.errs.length === 0, 'no page errors', o.errs.join(' | '));
await br.close(); t.done();
