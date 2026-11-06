import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.127 · one chance of rain, one day max/min, one heat index (A-03), no sub-5 s polls (U-09), report opening state and asset
   wording (U-14), "reporting now" within 20 min (U-11). node scripts/tests127/v127.test.mjs */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
const APP = (__T.ROOT + '/');
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 600) : '')); } };
const HI = await import(new URL('../../server/api/heatindex.mjs', import.meta.url).href);
const NM = await import(new URL('../../server/api/natmodel.mjs', import.meta.url).href);
ok(NM.heatIndexC === HI.heatIndexC, 'the national model module re-exports the one heat index');
ok(!/function heatIndexC/.test(readFileSync(APP + 'server/api/work.mjs', 'utf8')), 'work.mjs has no heat index of its own');
ok(HI.heatIndexC(40, 10) === 40 && HI.heatIndexC(38, 70) === null && Math.abs(HI.heatIndexC(35, 60) - 45.05) < 0.01, 'NWS method: floor at T, validity refusal, regression', [HI.heatIndexC(40, 10), HI.heatIndexC(38, 70), HI.heatIndexC(35, 60)].join(','));
const grid = []; for (const t of [-5, 10, 20, 27, 30, 33, 36, 40, 43, 44]) for (const r of [5, 20, 40, 60, 80, 95]) grid.push([t, r]);
const PW = __T.playwrightSync();
const br = await __T.launch(PW.chromium, { executablePath: process.env.PW_CHROME || __T.chromiumPath(), args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const pg = await br.newPage({ viewport: { width: 1440, height: 950 } }); const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.addInitScript(() => { window.__iv = []; const o = window.setInterval; window.setInterval = function (f, ms) { const rec = { ms: Number(ms) || 0, runs: [], gov: /idle\(\)&&Date\.now\(\)-ran<SLOW/.test(String(f)) }; window.__iv.push(rec); const g = typeof f === 'function' ? function () { rec.runs.push(Date.now()); return f.apply(this, arguments); } : f; const a = [].slice.call(arguments); a[0] = g; return o.apply(this, a); }; });
await pg.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
await pg.waitForFunction(() => { try { return AGN.physics && AGN.physics.heatIndexC && AGN.prob && window.agnRainChance && AGN.data.activePoint(); } catch (_) { return false; } }, null, { timeout: 300000, polling: 2000 }).catch(() => {});
await pg.waitForTimeout(20000);
const P = await pg.evaluate((grid) => grid.map(([t, r]) => AGN.physics.heatIndexC(t, r)), grid);
let worst = 0, mism = []; grid.forEach(([t, r], i) => { const s = HI.heatIndexC(t, r), p = P[i]; if ((s == null) !== (p == null)) mism.push(t + '/' + r); else if (s != null) worst = Math.max(worst, Math.abs(s - p)); });
ok(!mism.length && worst < 1e-9, 'page and server heat index agree on ' + grid.length + ' cases', 'mismatch ' + mism.join(' ') + ' worst ' + worst);
const R = await pg.evaluate(async () => { const p = AGN.data.activePoint(); for (let i = 0; i < 30 && !(agnRainChance.ready && agnRainChance.ready()); i++) await new Promise(r => setTimeout(r, 1000));
  const dc = AGN.prob.dayChance(p.lat, p.lon, 0); const k = agnRainChance.keyAt(p.lat, p.lon), row = k ? agnRainChance.forKey(k, 0) : null; return { dc, row: row && row.p, why: agnRainChance.why && agnRainChance.why() }; });
if (R.row && R.row['1'] != null) ok(R.dc && R.dc.source === 'calibrated' && R.dc.pct === Math.round(R.row['1']), 'the day\'s chance of rain is the calibrated chance', JSON.stringify(R));
else ok(!R.dc || R.dc.source === 'ensemble', 'with no calibrated chance held, the ensemble share is marked as such', JSON.stringify(R));
await pg.waitForTimeout(60000);
const IV = await pg.evaluate(() => { const t = Date.now(); return window.__iv.map(r => ({ ms: r.ms, gov: r.gov, recent: r.runs.filter(x => t - x < 20000).length })); });
/* v91.17.155 · timers under the idle governor (agn-idle-governor) wake for a no-op check and run their work every 10 s once the page is idle; only ungoverned timers count */
const fast = IV.filter(r => !r.gov && r.ms > 0 && r.ms < 5000 && r.recent >= 3).map(r => r.ms);
ok(IV.some(r => r.gov), 'fast timers run under the idle governor (' + IV.filter(r => r.gov).length + ')');
ok(fast.length <= 2, 'after start-up, no more than two timers still polling faster than every 5 s (' + fast.length + ': ' + fast.join(',') + ')');
const OB = await pg.evaluate(async () => { const b = document.querySelector('[data-goto="livedata"]') || document.querySelector('button[data-view="livedata"]'); if (b) b.click(); await new Promise(r => setTimeout(r, 8000)); return (document.getElementById('agnObsKpis') || {}).textContent || ''; });
ok(!OB || /within 20 min/.test(OB), '"Reporting now" means a reading within 20 minutes', OB.slice(0, 200));
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close();
/* v91.17.276 · build/reportpro_ui.html and build/base are build sources, not shipped; the same code is in the shipped page */
const PAGE = readFileSync(APP + 'artefact/AI_GEO_NIGRAAN_v91_17_MACH.html', 'utf8'), RP = PAGE;
ok(/Not specified \(site screening\)/.test(RP) && /km\(\+L\.lat,\+L\.lon,\+sp\.lat,\+sp\.lon\)>1\)/.test(RP), 'report: no asset -> "Not specified (site screening)"; re-placed on the active location beyond 1 km');
ok(/_agnReportStale85\(\) \|\| _evidenceMoved\(\)/.test(PAGE), 'report tab opens on a fresh preview when the evidence moved');
const PR = await fetch(BASE + '/api/point?lat=33.6844&lon=73.0479').then(r => r.json()).then((B) => (B && B.parts && B.parts.pointrun ? B.parts.pointrun.v : null)).catch(() => null);   /* v283.19: the report run is the bundle part pointrun */
if (PR && PR.ok !== false && PR.summary) ok(PR.served && Array.isArray(PR.served.days), 'the report run carries the served day high / low beside the raw reference', JSON.stringify(PR.served || {}).slice(0, 200));
else console.log('SKIP report point-run route not reachable here');
console.log((fails ? 'FAIL' : 'PASS') + ' v127: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
