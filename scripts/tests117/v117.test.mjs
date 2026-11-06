import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.117 · the pluvial flood rarity floor follows the flood record. node nigraan-local/scripts/tests117/v117.test.mjs (server running) */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 600) : '')); } };
const ROOT = (__T.ROOT + '/');
const EV = ROOT + '../station-lake/reports/pluvial_ladder_evidence.json';
if (existsSync(EV)) { const E = JSON.parse(readFileSync(EV, 'utf8'));
  for (const s of ['pk2022', 'pk2025']) { const S = E.sets[s]; const lift = (k) => S.rungs[k]['flooded>=5%'] / S['base>=5%'];
    ok(['p90-p95 (floor Moderate)', 'p95-p99 (floor High)'].every(k => S.rungs[k].n < 10 || lift(k) < 1.1), s + ': the p90-p99 rungs flood no more often than all tehsils (no floor earned)');
    ok(lift('above 20-year max (floor Severe)') > 1.05 && S.rungs['above 20-year max (floor Severe)']['flooded>=1%'] >= 0.5, s + ': above the 20-year max floods more often, and some flooding in at least half (Moderate earned)'); } }
else console.log('SKIP evidence file');
/* v91.17.283.27 · item 1 · the floor read the ERA5 table's "above the 20-year maximum" rank; that table is replaced by the satellite
   return levels (its 20-year maximum was exceeded in 24.5 % of gauge station-years), and the rarity is not tested as a pluvial driver,
   so the floor is removed (data/model-gate.json flood-pluvial) */
const FRj = JSON.parse(readFileSync(ROOT + 'data/formula-registry.json', 'utf8')); ok(!FRj.flood_ext.rarityFloorByRank && !FRj.rain_local, 'the ERA5 rarity floor and its ranks are gone from the formula registry (v283.27)');
const R = JSON.parse(readFileSync(ROOT + 'data/rule-ledger.json', 'utf8')); ok(R.rules.some(r => r.id === 'pluvial-rarity-floor'), 'rule ledger records the change');
const { chromium } = __T.playwrightSync();
const br = await __T.launch(chromium, { executablePath: process.env.PW_CHROME || __T.chromiumPath() });
const pg = await br.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
await pg.waitForFunction(() => { try { return typeof FR === 'function' && AGN.hz5.sweep().done; } catch (_) { return false; } }, null, { timeout: 400000, polling: 2000 }).catch(() => {});
const P = await pg.evaluate(() => ({ t: !!(window.FORMULA_REGISTRY && FORMULA_REGISTRY.flood_ext && FORMULA_REGISTRY.flood_ext.rarityFloorByRank), rc: !!(window.AGN && AGN.rainClim) }));
ok(!P.t && !P.rc, 'the page registry carries no ERA5 floor and the page no ERA5 table (v283.27)', JSON.stringify(P));
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close();
console.log((fails ? 'FAIL' : 'PASS') + ' v117: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
