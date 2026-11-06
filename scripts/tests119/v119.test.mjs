import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.119 · the Rainfall level is the official rain class the day most likely reaches. node nigraan-local/scripts/tests119/v119.test.mjs */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 600) : '')); } };
const ROOT = (__T.ROOT + '/');
const M = JSON.parse(readFileSync(ROOT + 'data/rain-chance-model.json', 'utf8'));
ok(M.thresholds['15.6'] && M.thresholds['15.6'].serve.plains && M.thresholds['64.5'] && !M.thresholds['64.5'].serve.plains && !M.thresholds['64.5'].serve.mountain, 'model: the 15.6 mm chance is served, the 64.5 mm chance withheld (no skill)');
const RP = ROOT + '../station-lake/reports/rain_chance_model.json';
if (existsSync(RP)) { const R = JSON.parse(readFileSync(RP, 'utf8')).thresholds;
  ok(R['15.6'].cells.plains.brierSkill >= 0.1 && R['64.5'].cells.plains.brierSkill < 0.1, 'held-out skill: 15.6 mm ' + R['15.6'].cells.plains.brierSkill + ', 64.5 mm ' + R['64.5'].cells.plains.brierSkill);
  const hi = R['15.6'].cells.plains.reliability.filter(b => b[0] >= 0.5); ok(hi.length && hi.every(b => b[3] >= 0.5), 'days forecast at 50 % or more were wet more often than not (' + hi.map(b => b[3]).join(', ') + ')'); }
const C = await (await fetch(BASE + '/api/rain/chance')).json(); const u = Object.values(C.units || {})[0];
ok(C.ready && u && u.days[0].p && ('15.6' in u.days[0].p), 'server serves the 15.6 mm chance', JSON.stringify(u && u.days[0].p));
const L = await (await fetch(BASE + '/api/map/layer?id=rc:15.6&i=0', { headers: { 'x-agn-view': 'customer' } })).json();
ok(L.ready && Object.keys(L.values).length > 300, 'map layer rc:15.6 (' + Object.keys(L.values || {}).length + ' tehsils)');
const { chromium } = __T.playwrightSync();
const br = await __T.launch(chromium, { executablePath: process.env.PW_CHROME || __T.chromiumPath() });
const pg = await br.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
await pg.waitForFunction(() => { try { return AGN.hz5.sweep().done && window.agnRainChance && agnRainChance.ready() && AGN.selfcheck && AGN.selfcheck.unitOn; } catch (_) { return false; } }, null, { timeout: 400000, polling: 2000 }).catch(() => {});
await pg.waitForFunction(() => { try { const c = AGN.selfcheck.run().layers.rain_hz.counts; return c.reduce((a, b) => a + b, 0) > 400; } catch (_) { return false; } }, null, { timeout: 180000, polling: 5000 }).catch(() => {});
const P = await pg.evaluate(() => { const r = JSON.stringify(FR('rainChance.levels')); const L = AGN.selfcheck.run().layers.rain_hz; const lv = Object.values(L.levels);
  const bad = []; for (const k of Object.keys(DISTRICT_IN).slice(0, 600)) { const row = agnRainChance.forKey(k, 0); if (!row || !row.p) continue; const want = (row.p['15.6'] != null && row.p['15.6'] >= 50) ? 1 : 0; const got = L.levels[(window.PK_KEY_TO_UID || {})[k] || k]; if (got != null && got >= 0 && got !== want) bad.push(k + ' ' + got + '/' + want); }
  return { r, max: Math.max(...lv), counts: L.counts, bad: bad.slice(0, 5), nbad: bad.length }; });
ok(P.r === '[{"level":"Low","thr":"15.6","p":50}]', 'page rule: Low when moderate rain is more likely than not', P.r);
ok(P.counts.reduce((a, b) => a + b, 0) > 400 && P.max <= 1, 'the Rainfall map scores the tehsils and paints nothing above Low (counts ' + JSON.stringify(P.counts) + ')');
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close();
console.log((fails ? 'FAIL' : 'PASS') + ' v119: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
