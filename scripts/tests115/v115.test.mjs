import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.115 · landslide rain-only limit, river wording and withheld reaches, station-calibration radius, key-check AI path.
   node nigraan-local/scripts/tests115/v115.test.mjs  (server running) */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 600) : '')); } };
const ROOT = (__T.ROOT + '/');
const J = (p) => JSON.parse(readFileSync(ROOT + p, 'utf8'));
const SUP = /ECMWF|GloFAS|NASA|ERA5|IMERG|Open-Meteo|\bPMD\b|\bFFD\b/;

/* landslide */
const M = J('data/landslide-odds-model.json'); ok(M.limits.some(l => /rain-triggered only/.test(l) && /melt/.test(l)), 'landslide model states it is rain-triggered only');
const L = await (await fetch(BASE + '/api/map/layer?id=ls:odds&i=0', { headers: { 'x-agn-view': 'customer' } })).json();
ok(/melt/.test(L.source || '') && !SUP.test(L.source || ''), 'ls:odds layer text carries the melt/thaw limit, no supplier name');

/* river */
const R = J('data/river-rarity.json').reaches; const W = ['mangla', 'rasul', 'trimmu', 'balloki', 'sidhnai'];
ok(W.every(k => R[k].modelRepresentsRiver === false && R[k].modelRepresentsRiverWhy), 'Mangla, Rasul, Trimmu, Balloki, Sidhnai withheld with a reason each');
const { rarityClass } = await import(ROOT + 'server/api/flood.mjs');
ok(['mangla', 'rasul', 'trimmu'].every(k => rarityClass(R[k], R[k].levels.rp5 * 2, '2026-08-15') === null), 'server: no class at a withheld reach, even at a large flow');
const AI = readFileSync(ROOT + 'server/api/ai.mjs', 'utf8'); ok(/Never call a flow that is only high for the time of year a flood/.test(AI) && !/Moderate = high for the time of year/.test(AI), 'AI river meaning follows the bulletin evidence');

/* station calibration radius */
const T = J('data/temp-correction.json'); ok(T.rule.nbKm === 5 && T.rule.nbDz === 150 && /calib_radius_test/.test(T.rule.nbNote), 'station calibration copies a neighbour only within 5 km / 150 m (evidence noted)');
const MOS = readFileSync(ROOT + 'server/api/mos.mjs', 'utf8'); ok(/R\.nbKm \?\? 5\) && dz <= \(R\.nbDz \?\? 150\)/.test(MOS), 'server fallback default matches');

/* key check: local AI path */
const K = readFileSync(ROOT + 'scripts/check_keys.mjs', 'utf8'); ok(/replace\(\/\\\/v1\$\/, ''\)/.test(K) && /NOT installed/.test(K), 'key check reads the local model list from the server root, checks the model');
ok(!/console\.log\([^)]*\.secret/.test(K) && !/say\([^)]*secret/.test(K), 'key check never prints a key value');

/* page */
const { chromium } = __T.playwrightSync();
const br = await __T.launch(chromium, { executablePath: process.env.PW_CHROME || __T.chromiumPath() });
const pg = await br.newPage({ viewport: { width: 1500, height: 1000 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
await pg.waitForFunction(() => { try { return AGN.hz5.sweep().done && RIVER_STATE.loaded; } catch (_) { return false; } }, null, { timeout: 400000, polling: 2000 }).catch(() => {});
const P = await pg.evaluate(() => ({ names: PK_RIVER_GAUGES.map(g => g.name), why: (PK_RIVER_GAUGES_ALL.find(g => g.name === 'Jhelum @ Mangla') || {}).withheldWhy || '' }));
ok(!P.names.some(n => /Mangla|Rasul|Trimmu|Balloki|Sidhnai|Shahdara/.test(n)), 'page: withheld reaches are not scored (' + P.names.length + ' reaches)');
ok(/regulated dam/.test(P.why), 'page: Mangla carries its own reason');
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close();
console.log((fails ? 'FAIL' : 'PASS') + ' v115: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
