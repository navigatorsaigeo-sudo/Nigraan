import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.110 · the heat-stress climate of each place.  node scripts/tests110/v110.test.mjs (server running) */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 400) : '')); } };
const ROOT = (__T.ROOT + '/');
const UC = JSON.parse(readFileSync(ROOT + 'data/utci-climatology.json', 'utf8'));
const ids = Object.keys(UC.units);
ok(ids.length >= 570, 'utci climatology for ' + ids.length + ' tehsils');
let bad = 0; for (const k of ids) { const u = UC.units[k]; for (let d = 0; d < 366; d++) if (!(u.p50[d] <= u.p90[d] && u.p90[d] <= u.p95[d])) bad++; }
ok(bad === 0, 'percentiles ordered p50 <= p90 <= p95 on every day of every tehsil', bad + ' bad');
ok(UC.check && UC.check.hot_days_utci_ge_32 && UC.check.hot_days_utci_ge_32.mae < 0.6, 'daily-proxy check recorded (hot days MAE ' + (UC.check && UC.check.hot_days_utci_ge_32.mae) + ' C)');
const find = (re) => ids.find(k => re.test(k));
const jac = UC.units[find(/Jacobabad$/)], mur = UC.units[find(/\|Murree$/)];
ok(jac && mur && jac.p90[170] > mur.p90[170] + 8 && jac.daysPerYear[3] + jac.daysPerYear[4] > 30 && mur.daysPerYear[4] < 1, 'Jacobabad in late June far above Murree (p90 ' + (jac && jac.p90[170]) + ' vs ' + (mur && mur.p90[170]) + ' C); Jacobabad has ' + (jac && (jac.daysPerYear[3] + jac.daysPerYear[4])) + ' High+ days a year');
const T = await (await fetch(BASE + '/api/climatology/thresholds')).json();
const t0 = T.thresholds && Object.values(T.thresholds)[0];
ok(t0 && t0.u90 != null && t0.u95 >= t0.u90 && T.fields.u95, 'thresholds endpoint carries u50/u90/u95 with their meaning');
const { chromium } = __T.playwrightSync();
const br = await __T.launch(chromium, { executablePath: process.env.PW_CHROME || __T.chromiumPath() });
const pg = await br.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
await pg.waitForFunction((n) => { try { const f = PK_DISTRICTS.features.find(x => x.properties.tehsil === n); const r = DISTRICT_IN[f.properties.key]; return AGN.hz5.sweep().done && window.__agnClimAnchors && r && r.fc72 && r.utci90 != null; } catch (_) { return false; } }, 'Jacobabad', { timeout: 480000, polling: 3000 }).catch(() => {});   /* a cold server's first sweep can take minutes */
const R = await pg.evaluate(() => { const f = PK_DISTRICTS.features.find(x => x.properties.tehsil === 'Jacobabad'); const k = f.properties.key; const inp = hzDayInput(k, 'heat'); const h = hzHeat(inp, { zone: 'arid_plains', elev: 55 }); const r = aiDistrictRisk(inp, 'heat', 24, k);
  return { key: k, u90: inp && inp.utci90, local: h && h.utciLocal, level: h && h.score, note: r && r.notes && r.notes.join(' | ') }; });
ok(R.u90 != null && R.local && /percentile|median/.test(R.local.rank) && /heat stress/.test(R.note || ''), 'Jacobabad heat shows how unusual today is for the place (' + (R.local && R.local.rank) + ')', JSON.stringify(R).slice(0, 300));
const L2 = await pg.evaluate(() => { const f = PK_DISTRICTS.features.find(x => x.properties.tehsil === 'Jacobabad'); const k = f.properties.key; const inp = Object.assign({}, hzDayInput(k, 'heat')); const a = hzHeat(inp, { zone: 'arid_plains', elev: 55 }).score; inp.utci90 = -50; inp.utci95 = -40; inp.utci50 = -60; const b = hzHeat(inp, { zone: 'arid_plains', elev: 55 }).score; return [a, b]; });
ok(L2[0] === L2[1], 'the local heat climate does not move the heat level (context only)', JSON.stringify(L2));
const EV = await (await fetch(BASE + '/api/ai/evidence?prompt=' + encodeURIComponent('heat in Jacobabad today'))).json();
const hc = EV.facts && EV.facts.askedUnits && EV.facts.askedUnits[0] && EV.facts.askedUnits[0].heatClimate;
ok(hc && hc.p90C != null && hc.daysPerYearAtLevel && hc.daysPerYearAtLevel.High != null, 'AI facts carry the place\'s heat climate', JSON.stringify(hc));
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close();
console.log((fails ? 'FAIL' : 'PASS') + ' v110: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
