import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.84 · CEO asks of 28 Sep, checked on the page a browser loads.
     node scripts/tests84/v84.test.mjs [baseUrl]      default http://127.0.0.1:8787
   V1 map layer menu: weather now first, hazards next, ground sponginess second last, earthquake last
   V2 map key has the meaning line; no-reading purple and does-not-occur pink hatch are defined; no grey no-data fill
   V3 tab bar: every tab has its own colour, and the bar spans the page
   V4 Overview live bar shows a temperature for the selected place
   V5 sample-client and templates bar on every view; the 15-template pack builds
   V6 NIGRAAN AI panel in Predictions with a chart and a day table (no derived caption); Predictions is operator view since v91.17.266
   V7 Scenario: presets change the result; response curves drawn
   V8 (v91.17.266) the Financial and Sustainability tabs are gone (owner decision); Report has its own tab
   zero page errors */
import { createRequire as __agnCR } from 'node:module'; import { pathToFileURL as __agnP2U } from 'node:url'; import { existsSync as __agnEx } from 'node:fs';
/* v91.17.255 · B-7 · Windows: Playwright from the app's node_modules, the bundled browser when the Linux one is absent, file URLs for absolute imports */
const __agnPW = __T.playwrightUrl() || 'playwright';
const __agnChrome = (p) => (p && __agnEx(p)) ? p : undefined;
const __agnImp = (p) => import(/^([A-Za-z]:)?[\\/]/.test(String(p)) ? __agnP2U(String(p)).href : p);
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const _pw = await __T.playwright(); const chromium = _pw.chromium || _pw.default.chromium;
let fails = 0, passes = 0;
const ok = (c, name, detail) => { if (c) passes++; else fails++; console.log((c ? 'PASS ' : 'FAIL ') + name + (detail != null ? ' · ' + String(detail).slice(0, 300) : '')); };
const b = await __T.launch(chromium, { executablePath: process.env.PW_CHROME || __agnChrome(__T.chromiumPath()), args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true }); const errs = []; const dls = []; page.on('download', d => dls.push(d.suggestedFilename())); page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await page.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => !!(window.AGN && AGN.hz5), null, { timeout: 180000 }); await page.waitForTimeout(15000);

const M = await page.evaluate(() => { const s = document.getElementById('mapHazardPick'); return s ? [...s.querySelectorAll('optgroup')].map(g => ({ l: g.label, v: [...g.querySelectorAll('option')].map(o => o.value) })) : []; });
const lab = M.map(g => g.l).join(' | ');
ok(M.length >= 4 && /weather/i.test(M[0].l) && /hazard/i.test(M[1].l) && /spong|ground/i.test(M[M.length - 2].l) && M[M.length - 1].v.join() === 'seismic', 'V1 layer menu order', lab);
ok(M[1] && M[1].v[0] === 'flood', 'V1 hazards start with flood', M[1] && M[1].v.join(','));

const K = await page.evaluate(() => ({ meaning: !!document.querySelector('#v3legend .agn-leg-meaning'), nd: AGN.hz5.noData && AGN.hz5.noData.fill, na: AGN.hz5.notApplicable && AGN.hz5.notApplicable.fill, pat: !!document.getElementById('agnNAHatch') }));
ok(K.meaning, 'V2 map key has the meaning line');
ok(K.nd === '#9467c9' && /agnNAHatch/.test(String(K.na)) && K.pat, 'V2 no reading purple, does-not-occur pink hatch', JSON.stringify(K));

const T = await page.evaluate(() => { const bs = [...document.querySelectorAll('#machNav > button[role="tab"]')]; const nav = document.getElementById('machNav');
  return { n: bs.length, cols: new Set(bs.map(x => getComputedStyle(x).getPropertyValue('--t84').trim())).size, w: nav.getBoundingClientRect().width, pw: nav.parentElement.getBoundingClientRect().width }; });
/* v91.17.266 · nine tabs (Financial, Sustainability and 09 Result removed; Report on its own) */
ok(T.n >= 8 && T.cols >= T.n - 1, 'V3 each tab has its own colour', JSON.stringify(T));
ok(T.w >= T.pw * 0.95, 'V3 tab bar spans the page', T.w + ' / ' + T.pw);

await page.waitForFunction(() => /\d\s*°C/.test((document.getElementById('agnLive84') || {}).innerText || ''), null, { timeout: 40000, polling: 1000 }).catch(() => null);
const L = await page.evaluate(() => { const l = document.getElementById('agnLive84'); return l ? l.innerText.replace(/\s+/g, ' ') : ''; });
ok(/-?\d+(\.\d)?\s*°C/.test(L), 'V4 Overview live temperature', L);

const kitN = await page.evaluate(() => document.querySelectorAll('.agn-kit84').length);
ok(kitN === 1 && await page.evaluate(() => !!document.querySelector('.view[data-view="assessments"] > .agn-kit84')), 'V5 sample-client and templates bar on the Assets tab only (CEO 3 Oct)', kitN);
const reg = await page.evaluate(() => (AGN.templateRegistry && Object.keys(AGN.templateRegistry.all ? AGN.templateRegistry.all() : AGN.templateRegistry).length) || 0);
ok(!!(await page.evaluate(() => AGN.kit84 && typeof AGN.kit84 === 'object')), 'V5 kit module loaded', 'registry keys ' + reg);

await page.click('#machNav [data-goto="airisk"]'); await page.waitForTimeout(1500);
/* v91.17.266 · 02 Predictions & explainability is the operator view (clients have the Analyst) */
const opOn = await page.evaluate(() => AGN.operator && AGN.operator.set ? AGN.operator.set(true) : false); await page.waitForTimeout(800);
/* v91.17.283.28 (owner, P16): the Predictions pane and its NIGRAAN AI chart repeated Overview / Forecast and are dropped */
const A = await page.evaluate(() => ({ pred: !!document.querySelector('[data-ai-workspace="predictions"]'), ai84: !!document.getElementById('agnAi84') }));
ok(!A.pred && !A.ai84, 'V6 (v283.28) no Predictions pane and no duplicate AI chart on AI Decision', JSON.stringify(A));
ok(opOn, 'V6 the operator view opens on loopback');
await page.evaluate(() => AGN.operator.set(false)); await page.waitForTimeout(800);

await page.click('#machNav [data-goto="hybridlab"]').catch(() => null);
await page.waitForFunction(() => { const L = document.querySelector('#agnScn button[data-scn-load]'); if (L) L.click(); return !!document.querySelector('#agnScnPresets button[data-preset]'); }, null, { timeout: 90000, polling: 1000 }).catch(() => null);   /* v283.29: the stress tests load on request */
const S = await page.evaluate(() => ({ curve: !!document.querySelector('#agnScnCurve84 svg'), api: !!(AGN.scenario76), server: !!(AGN.scenario76 && AGN.scenario76.state().server), presets: document.querySelectorAll('#agnScnPresets button[data-preset]').length }));
ok(S.api && S.server && S.presets >= 2 && !S.curve, 'V7 (v283.29) the Scenario panel runs on the server (presets from /api/scenario); the page-drawn response curves are deleted', JSON.stringify(S));

await page.click('#machNav [data-goto="assessments"]').catch(() => null); await page.waitForTimeout(1500);
/* v91.17.266 · the one Add sites box: its sample button reads "Load sample" (#asmtLoadSample) */
await page.evaluate(() => { const bt = document.getElementById('asmtLoadSample') || [...document.querySelectorAll('.agn-kit84 button')].find(x => /Load sample/.test(x.textContent) && x.offsetParent); if (bt) bt.click(); });
await page.waitForTimeout(8000);
const F = await page.evaluate(() => ({ tabs: [...document.querySelectorAll('#machNav [data-goto]')].map(b => b.getAttribute('data-goto')), card: !!document.getElementById('agnFinCase84') }));
ok(!F.tabs.some(t => /financial|sustainability|executive/.test(t)) && F.tabs.indexOf('report') >= 0 && !F.card, 'V8 no Financial, Sustainability or 09 Result tab; Report has its own tab (v91.17.266)', F.tabs.join(','));

const X = await page.evaluate(() => ({ n: (AGN.project.state().assets || []).length, prov: [...new Set((AGN.project.state().assets || []).map(a => (AGN.case84 && AGN.case84.sample[a.asset_id] || {}).province).filter(Boolean))].length,
  leg: (() => { const l = document.getElementById('v3legend'), w = document.getElementById('mpMapWrap'); const a = l.getBoundingClientRect(), b = w.getBoundingClientRect(); return b.right - a.right < 40; })(),
  bar: !!document.querySelector('#agnMapBar84 .maptools') }));
ok(X.n >= 9 && X.prov >= 7, 'V9 sample client: 9 sites across Punjab, Sindh, KP, Balochistan, GB, AJK, ICT', JSON.stringify(X));
ok(X.bar, 'V10 map controls in the bar above the map; key on the right', JSON.stringify(X));
ok(dls.length === 0, 'V11 loading / clearing the sample downloads nothing', dls.join(','));
/* v91.17.85 · Sprint 1 */
const goT = async (g) => { await page.evaluate((g) => document.querySelector('#machNav [data-goto="' + g + '"]').click(), g); await page.waitForTimeout(5000); };
await goT('livedata'); const AL = await page.evaluate(() => (document.getElementById('railAlerts') || {}).innerText || '');
ok(/^AT\b[^\n]*SHEIKHUPURA/i.test(AL.trim()), 'V12 Forecast alerts: this place first, the rest under "Elsewhere in Pakistan"', AL.replace(/\s+/g, ' ').slice(0, 120));
await goT('hybridlab'); await page.waitForTimeout(3000);
await page.waitForFunction(() => !!document.getElementById('agnScnName'), null, { timeout: 60000, polling: 1000 }).catch(() => {});   /* v113: the panel renders after the sites load */
/* v91.17.266 · Scenario has no place list of its own: it follows the active site (else the global place), shown read only with Change */
const SC = await page.evaluate(() => { const ro = document.querySelector('#agnScn .scn-place .agn-place-ro'); return { name: (document.getElementById('agnScnName') || {}).textContent, kind: ro ? (ro.querySelector('.k') || {}).textContent : null, change: !!(ro && ro.querySelector('[data-agn-change-place]')), list: !!document.getElementById('agnScnPlace') }; });
ok(/Sheikhupura/.test(SC.name || '') && SC.kind === 'Site' && SC.change && !SC.list, 'V13 Scenario opens on the subject (the active site), one global place picker', JSON.stringify(SC));
await goT('assessments'); const PF = await page.evaluate(() => ({ client: (document.getElementById('agnProjClient') || {}).value, gone: ['agnProjCurrency', 'agnProjPeriod'].filter(i => document.getElementById(i)) }));
ok(!!PF.client && PF.gone.length === 0, 'V14 Assets: the project form shows the loaded client (no currency or reporting period since v91.17.266)', JSON.stringify(PF));
await goT('operations'); await page.waitForTimeout(2000);
const OP = await page.evaluate(() => ({ nat: !!document.querySelector('#agnNatWatch85:not([open])'), chain: (document.getElementById('opsxDecisionChain') || {}).innerText || '' }));
ok(OP.nat && /Sheikhupura/.test(OP.chain) && !/cannot be stated/.test(OP.chain), 'V15 Operations: national picture folded; decision chain on the subject', OP.chain.replace(/\s+/g, ' ').slice(0, 160));
/* v91.17.266 · V16 (Financial forms) retired with the Financial tab */
ok(errs.length === 0, 'zero page errors', errs.join(' | '));
console.log(`\n${passes} passed, ${fails} failed`); await b.close(); process.exit(fails ? 1 : 0);
