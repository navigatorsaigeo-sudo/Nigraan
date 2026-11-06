/* r43 (NIGRAAN 1.0.7) · the classic report buttons and the Monte Carlo on the React pages, through the server endpoints only:
   - Overview Full report, Client Risk Site report and Executive brief, Operations Situation report, 72-hour readiness brief, Executive
     brief, Forecast Situation report: each click issues on the server (POST /api/reports/issue) and the report is then listed by
     GET /api/reports with its kind, and re-opens from the server (GET /api/reports/<id>);
   - My reports lists the same reports; Sources & licences shows the server's sources;
   - Scenario: a stress test runs on the server (GET /api/scenario) and the page shows the levels, the highest-level table and the Monte
     Carlo block; Save + Report of the saved scenarios issues the scenario report (POST /api/scenario/report);
   - Customize: the scenario step runs a stress test over the site list (GET /api/scenario?pts=) and lists the sites.
   usage: node scripts/tests28343/reports43.test.mjs <base> */
const BASE = process.argv[2] || process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
const T = await import(new URL('../lib/testenv.mjs', import.meta.url).href); const PW = T.playwrightSync(); if (!PW) T.skip('no Playwright');
const br = await T.launch(PW.chromium, { executablePath: T.chromiumPath(), args: ['--no-sandbox'] });
let pass = 0, fail = 0; const ok = (c, n, d) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + JSON.stringify(d).slice(0, 500))); };
const list = async () => ((await (await fetch(BASE + '/api/reports?limit=200')).json()).reports || []);
const before = new Set((await list()).map((r) => r.id));
const ctx = await br.newContext({ viewport: { width: 1440, height: 675 }, geolocation: { latitude: 33.6844, longitude: 73.0479 }, permissions: ['geolocation'] }); await ctx.addInitScript(() => { window.open = () => null; });
const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
await pg.goto(BASE + '/app/analyst', { waitUntil: 'load', timeout: 180000 }); await pg.waitForFunction(() => document.querySelector('.ov-hero [data-num="tempNow"]'), null, { timeout: 120000 }).catch(() => null); await pg.waitForTimeout(3000);
const clickIssue = async (tab, label, kind) => { if (tab) { await pg.click('#r41-tab-' + tab); await pg.waitForTimeout(5000); }
  const b = pg.locator('section.view:not([hidden]) button', { hasText: label }).first(); await b.click({ timeout: 20000 }).catch(() => null);
  const t0 = Date.now(); let msg = ''; while (Date.now() - t0 < 60000) { msg = await pg.evaluate(() => [...document.querySelectorAll('section.view:not([hidden]) .r43-msg, section.view:not([hidden]) .small')].map((e) => e.textContent).join(' | ')); if (/Issued|issued\.|Not issued/.test(msg)) break; await pg.waitForTimeout(500); }
  /* the same place, data and kind give the same report id: a second button of the same kind is answered by the stored copy (dup) */
  const all = await list(); const L = all.filter((r) => !before.has(r.id)); const hit = L.find((r) => (r.kind || '').toLowerCase() === kind.toLowerCase()) || (/Issued|issued\./.test(msg) ? all.find((r) => (r.kind || '').toLowerCase() === kind.toLowerCase()) : null);
  ok(!!hit && !/Not issued/.test(msg), (tab || 'overview') + ' · ' + label + ' issued as "' + kind + '"', { msg: msg.slice(0, 200), new: L.map((r) => r.kind) });
  if (hit) { const r = await fetch(BASE + '/api/reports/' + encodeURIComponent(hit.id)); const h = await r.text(); ok(r.status === 200 && h.length > 2000 && h.includes(hit.id), '  re-opens from the server (' + hit.id + ')', { status: r.status, len: h.length }); before.add(hit.id); } };
await clickIssue(null, 'Full report', 'Site report');
await clickIssue('operations', 'Situation report', 'Situation report');
await clickIssue(null, '72-hour readiness brief', '72-hour operational readiness brief');
await clickIssue(null, 'Executive brief', 'Executive climate risk brief');
await clickIssue('assessments', 'Site report', 'Site report');
await clickIssue(null, 'Executive brief', 'Executive climate risk brief');
await clickIssue('livedata', 'Situation report', 'Situation report');
/* My reports and Sources */
await pg.click('.agn-myrep'); await pg.waitForTimeout(2500); const mr = await pg.evaluate(() => { const d = document.querySelector('.r43-dlg'); return d ? d.querySelectorAll('tbody tr').length : -1; });
ok(mr >= 4, 'My reports lists the issued reports (site, situation, 72-hour, executive)', mr); await pg.click('.r43-dlg .x'); await pg.waitForTimeout(300);
await pg.locator('footer.r43-foot button', { hasText: 'Sources' }).click(); await pg.waitForTimeout(2500); const so = await pg.evaluate(() => { const d = document.querySelector('.r43-dlg'); return d ? d.querySelectorAll('tbody tr').length : -1; });
ok(so > 10, 'Sources & licences lists the server sources', so); await pg.click('.r43-dlg .x');
/* Scenario: stress test, highest-level table, Monte Carlo, save, scenario report */
await pg.click('#r41-tab-hybridlab'); await pg.waitForTimeout(6000);
await pg.locator('section.view:not([hidden]) .chips button').nth(3).click().catch(() => null); await pg.locator('section.view:not([hidden]) button', { hasText: 'Run the scenario' }).click();
await pg.waitForFunction(() => document.querySelector('section.view:not([hidden]) .sc-mc'), null, { timeout: 240000 }).catch(() => null);
const sc = await pg.evaluate(() => { const v = document.querySelector('section.view:not([hidden])'); return { mc: !!v.querySelector('.sc-mc'), mcRows: v.querySelectorAll('.sc-mc tbody tr').length, peak: [...v.querySelectorAll('h4')].some((h) => /Highest level/.test(h.textContent)), txt: (v.querySelector('.sc-mc') || {}).innerText || '' }; });
ok(sc.mc && sc.mcRows >= 4 && sc.peak, 'Scenario: levels, highest-level table and the Monte Carlo block (server run)', sc);
await pg.locator('section.view:not([hidden]) button', { hasText: 'Save the weather scenario above' }).click(); await pg.waitForTimeout(500);
await pg.locator('section.view:not([hidden]) button', { hasText: 'Report of the saved scenarios' }).click(); await pg.waitForTimeout(8000);
const sm = await pg.evaluate(() => [...document.querySelectorAll('section.view:not([hidden]) .r43-msg')].map((e) => e.textContent).join(' '));
ok(/Report ready/.test(sm), 'Scenario: the scenario report is issued by the server', sm);
ok(!errs.length, 'analyst: no page error', errs);
/* Customize: the stress test over the site list */
const p2 = await ctx.newPage(); const e2 = []; p2.on('pageerror', (e) => e2.push(e.message.slice(0, 160)));
await p2.goto(BASE + '/app/customize', { waitUntil: 'load', timeout: 180000 }); await p2.waitForTimeout(8000); await p2.click('#cz-scenario'); await p2.waitForTimeout(8000);
const cards = p2.locator('section.card', { hasText: 'stress test over the site list' }); await cards.locator('.chips button').first().click({ timeout: 30000 }).catch(() => null);
await p2.waitForFunction(() => [...document.querySelectorAll('section.card')].some((c) => /stress test over the site list/.test(c.textContent) && c.querySelectorAll('tbody tr').length > 0), null, { timeout: 300000 }).catch(() => null);
const nr = await p2.evaluate(() => { const c = [...document.querySelectorAll('section.card')].find((c) => /stress test over the site list/.test(c.textContent)); return c ? c.querySelectorAll('tbody tr').length : -1; });
ok(nr > 5, 'Customize: the stress test runs over the site list on the server', nr); ok(!e2.length, 'customize: no page error', e2);
await br.close(); console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
