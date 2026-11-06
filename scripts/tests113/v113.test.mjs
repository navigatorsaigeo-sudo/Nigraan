import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.113 · the river map level follows what each rung of the model-flow ladder meant in the bulletins.
   node nigraan-local/scripts/tests113/v113.test.mjs  (server running) */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 600) : '')); } };
const ROOT = (__T.ROOT + '/');

/* 1 · the data file agrees with the rung evidence */
const S = JSON.parse(readFileSync(ROOT + 'data/river-level-scale.json', 'utf8')); const K = Object.fromEntries(S.knots);
const EVF = ROOT + '../station-lake/reports/river_ladder_evidence.json';
if (existsSync(EVF)) { const E = JSON.parse(readFileSync(EVF, 'utf8'));
  for (const [r, x] of [['<p90', 'p80'], ['p90-p95', 'p95'], ['p95-rp2', 'p95'], ['rp2-rp5', 'rp2']]) {
    const most = [E.soundReaches[r].mostLikely, ...Object.values(E.byMonsoonSound).map(t => t[r].mostLikely)];
    ok(most.every(m => m === 'below Low') && K[x] < 0.25, 'rung ' + r + ': most often below the Low limit in both monsoons, and Normal on the map (' + most.join(', ') + ')'); }
  ok(E.soundReaches['>=rp5'].mostLikely === 'Medium' && K.rp5 >= 0.45 && K.rp5 < 0.65, '5-year flow: most often Medium, and Moderate on the map');
  ok(E.octoberSound['p95-rp2'].shareLowPlus <= 0.05, 'October p95-2yr rung reached Low on ' + Math.round(100 * E.octoberSound['p95-rp2'].shareLowPlus) + ' % of days');
} else console.log('SKIP evidence file (station-lake not beside the app)');
ok(K['rp5-'] < 0.25, 'a step under the 5-year flow: no flow between rungs is painted Low');

/* 2 · the server class */
const { rarityClass } = await import(ROOT + 'server/api/flood.mjs');
const RR = JSON.parse(readFileSync(ROOT + 'data/river-rarity.json', 'utf8')).reaches; const T = RR.tarbela; const b = T.seasonal[18];
ok(rarityClass(T, b[3] * 1.05, '2026-10-02').class === 'Low' && rarityClass(T, T.levels.rp2 * 1.05, '2026-10-02').class === 'Low' && rarityClass(T, T.levels.rp5 * 1.01, '2026-10-02').class === 'Watch', 'server: above p95 and above the 2-year flow are Low, the 5-year flow Watch');
ok(rarityClass(RR.balloki, 10, '2026-10-02') === null && rarityClass(RR.sidhnai, 10, '2026-10-02') === null, 'server: Ravi reaches carry no class');

/* 3 · the page */
const { chromium } = __T.playwrightSync();
const br = await __T.launch(chromium, { executablePath: process.env.PW_CHROME || __T.chromiumPath() });
const pg = await br.newPage({ viewport: { width: 1500, height: 1000 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
await pg.waitForFunction(() => { try { return AGN.hz5.sweep().done && RIVER_STATE.loaded && AGN.selfcheck && AGN.selfcheck.unitOn; } catch (_) { return false; } }, null, { timeout: 400000, polling: 2000 }).catch(() => {});
await pg.waitForTimeout(30000);
const P = await pg.evaluate(() => { const names = PK_RIVER_GAUGES.map(g => g.name); const L = AGN.selfcheck.run().layers.flood_riverine.levels;
  const below5 = (RIVER_STATE.gauges || []).every(g => !(g.q >= (g.rp5 || Infinity)));
  const raised = Object.entries(L).filter(([, v]) => v >= 1).map(([k]) => k);
  const r = riverRatio ? null : null; return { names, below5, raised: raised.length, ex: raised.slice(0, 5), normal: Object.values(L).filter(v => v === 0).length }; });
ok(!P.names.some(n => /^Ravi @ (Shahdara|Balloki|Sidhnai)$/.test(n)), 'page: Ravi reaches withheld (' + P.names.filter(n => /Ravi/.test(n)).join(', ') + ')');
ok(!P.below5 || P.raised === 0, 'page: with every reach under its 5-year flow, no tehsil is above Normal on river flood (' + P.raised + ' raised, ' + P.normal + ' Normal)', P.ex.join(' | '));
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close();
console.log((fails ? 'FAIL' : 'PASS') + ' v113: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
