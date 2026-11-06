import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.266 · Customize NIGRAAN for AJG Supplies at /customize: five tabs (Overview · Outlook · Sites & operations · Scenario ·
   Proof & report); the nearby temperatures in the Overview's left panel; no ESG, no money, no supplier names. Rewritten for v266 from
   the v91.17.143 seven-step test (the Hyperlocal weather, Hazard check and ESG steps it checked are removed).
   usage: NIGRAAN_BASE=http://127.0.0.1:8787 node scripts/tests144/customize.test.mjs */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
const BASE = process.env.NIGRAAN_BASE || process.argv[2] || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 600) : '')); } };
const html = readFileSync(new URL('../../artefact/NIGRAAN_3.html', import.meta.url), 'utf8');
ok(html.length < 400 * 1024, 'the client page is small (' + Math.round(html.length / 1024) + ' KB; the main page is 7 MB)');
ok(!/s-esg|rEsg|HISAAB_TYPE|\/api\/hisaab|id="ov-area"|data-s="weather"|data-s="hazard"|data-s="impact"/.test(html), 'no ESG, HISAAB, Hyperlocal weather, Hazard check or Impact step left in the file');
const req = createRequire(import.meta.url);
const PW = __T.playwrightSync();
const chrome = process.env.PW_CHROME || __T.chromiumPath();
const br = await __T.launch(PW.chromium, existsSync(chrome) ? { executablePath: chrome } : {});
const pg = await br.newPage({ viewport: { width: 1600, height: 1000 } }); const errs = [];
await pg.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; window.__CLS = 0; try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__CLS += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (_) {} });
pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/status of 404/.test(m.text())) errs.push(m.text().slice(0, 160)); });
await pg.goto(BASE + '/customize', { waitUntil: 'domcontentloaded' });
await pg.waitForFunction(() => window.NIGRAAN3 && NIGRAAN3.state.sites.length > 0 && NIGRAAN3.state.p && NIGRAAN3.state.p.name !== 'Islamabad', null, { timeout: 150000 }).catch(() => {});
await pg.waitForFunction(() => /°C/.test(document.querySelector('#ov-now').innerText) && /places within/.test(document.querySelector('#ov-left').innerText), null, { timeout: 150000, polling: 500 }).catch(() => {});
await pg.waitForTimeout(3000);
const tabs = await pg.evaluate(() => [...document.querySelectorAll('#steps [role=tab]')].map(b => b.dataset.s));
ok(JSON.stringify(tabs) === '["overview","outlook","sites","lab","proof"]', 'five tabs: Overview, Outlook, Sites & operations, Scenario, Proof & report', JSON.stringify(tabs));
const pf = await pg.evaluate(() => fetch('/api/point?lat=' + NIGRAAN3.state.p.lat + '&lon=' + NIGRAAN3.state.p.lon).then(r => r.json()));   /* v91.17.283.19: the place bundle, the record Customize reads */
/* Overview: flip panels; the nearby list (port of the main page's left-panel list) in the left panel */
const near = await pg.evaluate(() => ({ left: document.querySelector('#ov-left').innerText, rows: [...document.querySelectorAll('#ov-left .near .rows button')].map(b => b.innerText.replace(/\s+/g, ' ')), vis: [...document.querySelectorAll('#ov-left .near .rows button')].filter(b => b.offsetParent).length, area: !!document.getElementById('ov-area') }));
ok(/Temperature now nearby/.test(near.left) && /places within 12 km · spread/.test(near.left) && /^This spot/.test(near.rows[0] || '') && near.vis === Math.min(9, near.rows.length) && !near.area, 'overview: nearby list in the left panel, "This spot" first, 9 rows then "Show all", #ov-area gone', JSON.stringify(near).slice(0, 300));
ok(near.rows[0] && pf.now && near.rows[0].includes(Number(pf.now.tempC).toFixed(1)), '"This spot" carries the served value of this hour', near.rows[0]);
await pg.waitForFunction(() => /Days ≥ 40 °C/.test(document.querySelector('#ov-side').innerText), null, { timeout: 120000, polling: 1000 }).catch(() => {});
const fl = await pg.evaluate(() => ({ left: document.querySelector('#ov-left').innerText, right: document.querySelector('#ov-side').innerText, lw: document.querySelector('#ov-lwrap').getBoundingClientRect().width, rw: document.querySelector('#ov-rwrap').getBoundingClientRect().width, mw: document.querySelector('#map').getBoundingClientRect().width }));
ok(/TEMP MAX/i.test(fl.left) && /CMIP6/.test(fl.right) && fl.lw > 250 && fl.rw > 250 && fl.mw > 500, 'overview: flip panels each side of the map (weather and nearby left; hazards and the CMIP6 shift right)', JSON.stringify(fl).slice(0, 300));
await pg.click('#ov-lwrap [data-close]'); await pg.waitForTimeout(400); const shut = await pg.evaluate(() => document.querySelector('#ov-lwrap').getBoundingClientRect().width); await pg.click('.mopen[data-open=l]'); await pg.waitForTimeout(400);
ok(shut < 2 && (await pg.evaluate(() => document.querySelector('#ov-lwrap').getBoundingClientRect().width)) > 250, 'a panel closes with × and opens again from its tab');
const aj = await pg.evaluate(() => document.querySelector('#ov-ajg').innerText);
ok(/(\d+) sites in \d+ regions · \d+ of \1 checked/.test(aj), 'overview: the AJG network block counts checked sites (and those with no levels)', aj.slice(0, 200));
/* Outlook */
await pg.evaluate(() => NIGRAAN3.go('outlook'));
await pg.waitForFunction(() => document.querySelectorAll('#o-72 path').length >= 2 && document.querySelectorAll('#o-15 tbody tr').length >= 10 && document.querySelectorAll('#o-cmip circle').length >= 10, null, { timeout: 180000, polling: 1000 }).catch(() => {});
const o = await pg.evaluate(() => ({ p72: document.querySelectorAll('#o-72 path').length, d15: document.querySelectorAll('#o-15 tbody tr').length, ev: document.querySelectorAll('#o-evt tr').length, cm: document.querySelectorAll('#o-cmip circle').length, ct: document.querySelector('#o-cmip-t').innerText }));
ok(o.p72 >= 2 && o.d15 >= 10 && o.ev >= 1 && o.cm >= 10 && /2041–2050/.test(o.ct), 'outlook: 72 hours, 15 days, event chances, and the CMIP6 chart and table', JSON.stringify(o).slice(0, 300));
/* Sites & operations */
await pg.evaluate(() => NIGRAAN3.go('sites'));
await pg.waitForFunction(() => /(\d+) of \1 checked/.test(document.querySelector('#pf-status').innerText) && NIGRAAN3.state.sites.every(s => s.scr !== undefined), null, { timeout: 200000, polling: 1000 }).catch(() => {});
await pg.waitForFunction(() => !/Checking the forecast against each limit/.test(document.querySelector('#i-ops').innerText), null, { timeout: 90000, polling: 1000 }).catch(() => {});
const im = await pg.evaluate(() => ({ screen: document.querySelectorAll('#i-screen tbody tr').length, act: document.querySelector('#i-actions').innerText.length, ops: document.querySelector('#i-ops').innerText, pf: [...document.querySelectorAll('#pf-table tbody tr')].map(r => r.innerText.replace(/\s+/g, ' ')), st: document.querySelector('#pf-status').innerText }));
ok(im.screen >= 4 && im.act > 40, 'sites: site screening and what to do, when', JSON.stringify({ screen: im.screen, act: im.act }));
ok(!/Pick an AJG site|Checking the forecast against each limit/.test(im.ops), 'operations card opens on the start-up AJG site and does not stay on "Checking…"', im.ops.slice(0, 200));
ok(im.pf.length >= 20 && im.pf.every(r => /(Normal|Low|Moderate|High|Severe|no data)/.test(r)) && /(\d+) of \1/.test(im.st), 'AJG Supplies: every site checked at its own place, worst first (' + im.pf.length + ')', im.pf.slice(0, 2).join(' | '));
ok(!im.pf.every(r => /not available/.test(r)), 'flood position is not "not available" for every site', im.pf.slice(0, 3).join(' | '));
/* Scenario · v91.17.283.29 (W1): the section prints the SERVER's scenario run (GET /api/scenario: presets, levels now and under the
   stress test, at the place and at every AJG site); the page-side Monte Carlo stays deleted; no money figure */
await pg.evaluate(() => NIGRAAN3.go('lab'));
await pg.waitForFunction(() => { const L = NIGRAAN3.lab && NIGRAAN3.lab.state; return !!(L && L.last && L.last.j); }, null, { timeout: 180000, polling: 1000 }).catch(() => {});
await pg.waitForTimeout(1500);
const lb = await pg.evaluate(() => ({ t: document.querySelector('#s-lab').innerText, presets: document.querySelectorAll('#l-presets button').length, rows: document.querySelectorAll('#l-body table tbody tr').length, srv: !!(NIGRAAN3.lab.state.last && NIGRAAN3.lab.state.last.j && NIGRAAN3.lab.state.last.j.version) }));
ok(lb.srv && lb.presets >= 2 && lb.rows >= 7 && /scenario run/i.test(lb.t) && !/PKR|loss estimate is|asset value|cost/i.test(lb.t.replace(/no downtime or loss estimate/gi, '')) && !/copula/i.test(html), 'Scenario: the server scenario run (presets and levels from GET /api/scenario); no page Monte Carlo; no money', lb.t.slice(0, 200) + ' ' + JSON.stringify({ presets: lb.presets, rows: lb.rows, srv: lb.srv }));
/* Proof & report */
await pg.evaluate(() => NIGRAAN3.go('proof')); await pg.waitForTimeout(10000);
const pr = await pg.evaluate(() => ({ chain: document.querySelector('#p-chain').innerText.replace(/\s+/g, ' '), skill: document.querySelector('#p-skill').innerText, past: document.querySelector('#p-past-b').innerText, hv: document.querySelector('#proof-hv').innerText }));
ok(pf.build && new RegExp(Number(pf.build.servedC).toFixed(1) + ' °C').test(pr.chain) && /Across Pakistan/.test(pr.skill), 'proof: the hour from raw to served and the tested accuracy', pr.skill.slice(0, 200));
ok(pr.past.length > 20 && !/Loading/.test(pr.past) && (/Hottest day/.test(pr.past) || /not available/.test(pr.past)), 'proof: the past 30 days (GET /api/report/past30), or a plain "not available"', pr.past.slice(0, 200));
const fs0 = await pg.evaluate(() => fetch('/api/fleet/status').then(r => r.json()).catch(() => ({})));
const nst = fs0.registered != null ? fs0.registered : fs0.stations;
ok(nst == null ? !/AGN MACH stations/.test(pr.hv) : new RegExp('\\b' + nst + '\\s*AGN MACH stations').test(pr.hv), 'proof: the station count comes from the fleet (' + nst + '), not a typed number', pr.hv);
const types = await pg.evaluate(() => [...document.querySelectorAll('#report-type option')].map(x => x.value));
ok(JSON.stringify(types) === '["network","full","sector"]', 'report types: network, site, site briefing (no ESG)', JSON.stringify(types));
await pg.evaluate(() => { NIGRAAN3.setReportType('network'); }); await pg.click('#report-btn');
await pg.waitForFunction(() => /Prepared for AJG Supplies/.test(document.getElementById('report').innerText) && /Network/.test(document.getElementById('report').innerText), null, { timeout: 240000, polling: 1000 }).catch(() => {});
const net = await pg.evaluate(() => document.getElementById('report').innerText);
ok(/AJG Supplies · Network/.test(net) && /Every site, worst first/.test(net) && /All AJG sites · the past 30 days/.test(net) && /Key findings/.test(net), 'the AJG network report: every site worst first, and the past 30 days across all sites', net.slice(0, 160));
await pg.evaluate(() => { NIGRAAN3.setReportType('full'); NIGRAAN3.buildReport(); }); const rep = await pg.evaluate(() => document.getElementById('report').innerText);
const repSvg = await pg.evaluate(() => document.getElementById('report').querySelectorAll('svg').length);
ok(repSvg >= 6, 'the report carries its charts (' + repSvg + ')');
ok(/Key findings/.test(rep) && /Design values/.test(rep) && /What to do/.test(rep) && /past 30 days/.test(rep) && /days of disruption/.test(rep) && /does not claim/.test(rep) && !/\bESG\b|\bPKR\b|IFRS|Portfolio/.test(rep), 'the site report has every section and no ESG or money', rep.slice(0, 200));
const vis = await pg.evaluate(() => document.body.innerText + ' ' + document.getElementById('report').innerText);
const BAN = /\b(ECMWF|IFS|ERA5|SEAS5|EC46|Open-Meteo|PMD|FFD|NOAA|DWD|JRC|GloFAS|HAND|NDMA|HISAAB|HighResMIP|IFRS|CBAM|GHG|PKR|ESG)\b|v91\.|Seed \d|synthetic/i;
ok(!BAN.test(vis), 'no supplier, agency, build or finance names on screen or in the reports', (vis.match(new RegExp(BAN.source, 'gi')) || []).slice(0, 8).join(','));
const pv = await pg.evaluate(() => ({ w: document.querySelectorAll('#p-water rect').length, s: document.querySelectorAll('#p-skillchart rect').length }));
ok(pv.w >= 3 && pv.s >= 2, 'proof: waterfall from the global box to the point, and the error before and after', JSON.stringify(pv));
const sw = await pg.evaluate(() => [...document.querySelectorAll('.pswitch a')].map(a => a.getAttribute('href')).join(','));
ok(sw === '/,/customize', 'two pages, one switch: NIGRAAN and Customize NIGRAAN', sw);
await pg.evaluate(() => NIGRAAN3.go('overview')); await pg.click('#ov-hor [data-h=w26]'); await pg.waitForFunction(() => /vs normal|Not available yet/.test(document.querySelector('#legend').innerText), null, { timeout: 30000 }).catch(() => {});
const lw = await pg.evaluate(() => document.querySelector('#legend').innerText); await pg.click('#ov-hor [data-h=d15]'); await pg.waitForTimeout(1500); await pg.click('#ov-count'); await pg.waitForTimeout(500);
const popn = await pg.evaluate(() => document.querySelectorAll('#ov-pop [data-u]').length); const more = await pg.evaluate(() => document.querySelectorAll('#ov-more option').length); const ajm = await pg.evaluate(() => document.querySelectorAll('.ajgm').length);
ok(/vs normal|Not available yet/.test(lw) && popn > 0 && more > 30 && ajm >= 20, 'map controls: forecast ranges (weeks), more layers (' + more + '), the High / Severe list (' + popn + '), AJG sites on the map (' + ajm + ')', JSON.stringify({ lw: lw.slice(0, 60), popn, more, ajm }));
const ovf = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(ovf <= 0, 'no horizontal page scroll at 1600 px', ovf);
const m = await pg.evaluate(() => window.__CLS);
ok(m < 0.25, 'steady: layout shift ' + m.toFixed(3));
ok(errs.length === 0, 'no page errors', errs.join(' | '));
await br.close();
console.log((fails ? 'FAIL' : 'PASS') + ' v266 Customize NIGRAAN: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
