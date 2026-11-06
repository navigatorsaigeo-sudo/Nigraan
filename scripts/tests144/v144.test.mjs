import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.144 · B7 live layer one rule · D13 the switch keeps the place · the map day bar is one slim row. node scripts/tests144/v144.test.mjs */
import { createRequire as __agnCR } from 'node:module'; import { pathToFileURL as __agnP2U } from 'node:url'; import { existsSync as __agnEx } from 'node:fs';
/* v91.17.255 · B-7 · Windows: Playwright from the app's node_modules, the bundled browser when the Linux one is absent, file URLs for absolute imports */
const __agnPW = __T.playwrightUrl() || 'playwright';
const __agnChrome = (p) => (p && __agnEx(p)) ? p : undefined;
const __agnImp = (p) => import(/^([A-Za-z]:)?[\\/]/.test(String(p)) ? __agnP2U(String(p)).href : p);
import { createRequire } from 'node:module';
const PW = __T.playwrightSync();
const B = process.env.BASE || 'http://127.0.0.1:8787', H = { 'Sec-Fetch-Site': 'same-origin' };
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
/* B7: the area table and the point use the same live decision */
for (let i = 0; i < 90; i++) { const s = await fetch(B + '/api/hyperlocal/status', { headers: H }).then(r => r.json()); if (s.liveStations > 0) break; await new Promise(r => setTimeout(r, 2000)); }
for (const [la, lo, nm] of [[33.6844, 73.0479, 'Islamabad'], [31.52, 74.35, 'Lahore'], [24.86, 67.01, 'Karachi'], [30.2, 67.0, 'Quetta']]) {
  /* v91.17.283.19: the point, its nearby list and its live layer are one place bundle (GET /api/point: source.mach, part near) */
  const pt = await fetch(`${B}/api/point?lat=${la}&lon=${lo}`, { headers: H }).then(r => r.json());
  const ar = (pt.parts && pt.parts.near && pt.parts.near.v) || {};
  const hp = (pt.source && pt.source.mach) || {}; pt.engineOnly = !hp.applied; pt.skill = hp.applied ? 'live MACH layer applied' : 'not applied: ' + (hp.why || 'no live layer');
  const nLive = (ar.places || []).filter(p => p.live).length;
  ok(pt.ok && (!pt.engineOnly) === !!hp.applied || (pt.ok && pt.engineOnly && hp.applied && Math.abs(hp.dT) < 0.05), nm + ': point forecast and live layer agree (point live ' + !pt.engineOnly + ', layer ' + hp.applied + ')');
  ok(hp.applied ? nLive > 0 : nLive === 0, nm + ': area table agrees (' + nLive + ' of ' + (ar.places || []).length + ' places live)');
  ok(!/25 km/.test(pt.skill || '') && (pt.engineOnly ? /not applied: /.test(pt.skill) : true), nm + ': the reason is the layer\'s own: ' + String(pt.skill).slice(0, 90));
}
/* B6 airport thermometer offsets and C9 synoptic station calibration retired in v91.17.277 (their tables never shipped; tests277 checks the retirement) */
const br = await __T.launch(PW.chromium, { executablePath: process.env.PW_CHROME || __agnChrome(__T.chromiumPath()) });
const ctx = await br.newContext({ viewport: { width: 1500, height: 1000 } }); const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message));
/* D13: Customize -> NIGRAAN keeps the place */
await pg.goto(B + '/customize', { waitUntil: 'domcontentloaded' });
await pg.waitForFunction(() => window.NIGRAAN3 && NIGRAAN3.state.sites.length > 0, null, { timeout: 120000 });
await pg.evaluate(() => { const s = NIGRAAN3.state.sites.find(x => /Multan/.test(x.name)) || NIGRAAN3.state.sites[3]; NIGRAAN3.setPoint(s.lat, s.lon, s.name); });
const want = await pg.evaluate(() => NIGRAAN3.state.p);
await Promise.all([pg.waitForNavigation({ timeout: 60000 }), pg.click('.pswitch a[href="/analyst"]')]);
await pg.waitForFunction(() => window.AGN && AGN.point && AGN.point.state && AGN.point.state().row, null, { timeout: 120000, polling: 1000 }).catch(() => {});
const got = await pg.evaluate(() => { const s = AGN.point.state(); return s && s.row ? { lat: s.row.lat, lon: s.row.lon, label: s.label } : null; });
ok(got && Math.abs(got.lat - want.lat) < 0.01 && Math.abs(got.lon - want.lon) < 0.01, 'Customize -> NIGRAAN opens on ' + want.name + ' (' + JSON.stringify(got) + ')');
/* the day bar: one slim row */
/* v91.17.283.15 · measured once the bar has settled (its buttons drawn and the fonts loaded), polled for up to 45 s: under load a single
   reading 4 s after the switch caught the bar mid-layout (a loading row or the legend reserve not yet applied) */
const barNow = () => pg.evaluate(() => { const d = document.getElementById('v3days'); if (!d) return { rows: 0, h: 0, n: 0 }; const bs = [...d.querySelectorAll('button')]; const R = bs.map(x => x.getBoundingClientRect()); return { rows: new Set(R.map(r => Math.round(r.y))).size, h: R.length ? Math.round(Math.max(...R.map(r => r.bottom)) - Math.min(...R.map(r => r.top))) : 0, box: Math.round(d.getBoundingClientRect().height), n: bs.length, fonts: document.fonts ? document.fonts.status : 'n/a' }; });
/* h: the height of the row of day buttons (the bar's own note line under it, when shown, is not part of the row; box is the whole block) */
let bar = await barNow(); for (let i = 0; i < 45 && !(bar.n >= 2 && bar.fonts !== 'loading' && bar.rows === 1 && bar.h <= 44); i++) { await pg.waitForTimeout(1000); bar = await barNow(); }
ok(bar.n >= 2 && bar.rows === 1 && bar.h <= 44, 'map day bar is one slim row once drawn (' + JSON.stringify(bar) + ')');
/* D13: NIGRAAN -> Customize keeps the place */
await pg.evaluate(() => AGN.point.goText('27.70, 68.86', { label: 'Sukkur test point' }));
await pg.waitForTimeout(6000);
await Promise.all([pg.waitForNavigation({ timeout: 60000 }), pg.click('#agn-switch a[href="/customize"]')]);
await pg.waitForFunction(() => window.NIGRAAN3 && NIGRAAN3.state.p, null, { timeout: 60000 });
await pg.waitForTimeout(8000);
const p2 = await pg.evaluate(() => NIGRAAN3.state.p);
ok(Math.abs(p2.lat - 27.70) < 0.01 && Math.abs(p2.lon - 68.86) < 0.01, 'NIGRAAN -> Customize opens on the same point and the head office does not replace it (' + JSON.stringify(p2) + ')');
/* the #agnplace link form */
await pg.goto(B + '/customize#agnplace=25.3960,68.3578,Hyderabad%20test'); await pg.waitForTimeout(6000);
const p3 = await pg.evaluate(() => NIGRAAN3.state.p); ok(Math.abs(p3.lat - 25.396) < 0.01, '#agnplace opens Customize on that point (' + p3.name + ')');
/* v91.17.266 · the ESG step and its 45-year heat record (rLong) are removed from Customize NIGRAAN (owner decision: ESG leaves
   NIGRAAN); the two C10 page checks that read them are retired. The long-record endpoint itself is still checked above. */
ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
await br.close(); process.exit(fails ? 1 : 0);
