#!/usr/bin/env node
/* shots50: reports open on screen (no automatic download) on the analyst page, start page, Customize and My reports, customer and
   operator view, place E-7 Islamabad; plus the failure state (generate answered "not ready") and the print rendering of a report view.
   usage: node shots50.mjs <base> <outdir> */
import { mkdirSync, writeFileSync } from 'node:fs';
const T = await import('../lib/testenv.mjs'); const PW = T.playwrightSync();
const B = process.argv[2], O = process.argv[3]; mkdirSync(O, { recursive: true });
const P = { lat: 33.7233, lon: 73.0435, name: 'E-7' }, HASH = '#agnplace=' + P.lat + ',' + P.lon + ',E-7';
const br = await T.launch(PW.chromium, { executablePath: T.chromiumPath(), args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--renderer-process-limit=1'] });
let pass = 0, fail = 0; const res = []; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } res.push([c ? 'ok' : 'FAIL', m]); };
async function ctxFor(view) { const ctx = await br.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript((op) => { try { if (op) { localStorage.setItem('agn.operator', '1'); localStorage.setItem('agn.operator.v2', '1'); } } catch (_) {} }, view === 'operator'); return ctx; }
async function frameLoaded(pg, sel, ms = 200000) { await pg.waitForFunction((s) => { const f = document.querySelector(s); if (!f || !f.getAttribute('src') || f.hidden || f.offsetParent === null) return false; try { return !!f.contentDocument && !!f.contentDocument.querySelector('section.pg'); } catch (_) { return false; } }, sel, { timeout: ms }); }
async function viewerCheck(pg, tag, view) {
  await frameLoaded(pg, '#agnRepViewFrame'); await pg.waitForTimeout(800);
  const st = await pg.evaluate(() => { const v = document.getElementById('agnRepView'), f = document.getElementById('agnRepViewFrame'), r = v.getBoundingClientRect();
    const vis = (id) => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none' && e.offsetParent !== null; };
    return { full: r.width >= innerWidth - 2 && r.height >= innerHeight - 2, print: vis('agnRepViewPrint'), pdf: vis('agnRepViewPdf'), pdfHref: document.getElementById('agnRepViewPdf').getAttribute('href'), title: document.getElementById('agnRepViewTitle').textContent, src: f.getAttribute('src'), pages: f.contentDocument.querySelectorAll('section.pg').length }; });
  ok(st.full && st.print && st.pdf && /\.pdf\?download=1/.test(st.pdfHref || '') && st.pages >= 2, tag + ' ' + view + ': viewer full screen, Print + Download PDF, ' + st.pages + ' pages (' + st.title + ')');
  const opExpected = view === 'operator' && !/Customize/.test(tag);   /* Customize is the client product: its reports are always the customer view */
  ok(opExpected ? /view=operator/.test(st.src) : !/view=operator/.test(st.src), tag + ' ' + view + ': the view of the report is the page view (' + st.src + ')');
  return st; }
for (const view of ['customer', 'operator']) {
  const ctx = await ctxFor(view); const pg = await ctx.newPage(); let downloads = 0; pg.on('download', () => downloads++); const errs = []; pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  /* 1 analyst: Full report */
  await pg.goto(B + '/analyst' + HASH, { waitUntil: 'load', timeout: 180000 }); await pg.waitForSelector('#agnFullReport', { timeout: 120000 }); await pg.waitForTimeout(6000);
  await pg.click('#agnFullReport'); await viewerCheck(pg, 'analyst Full report', view); await pg.screenshot({ path: O + '/' + view + '_1_analyst_full_report.png' });
  /* the print rendering of the report view (what Print prints: the frame's document only) */
  if (view === 'customer') { const src = await pg.getAttribute('#agnRepViewFrame', 'src'); const p2 = await ctx.newPage(); await p2.goto(B + src); await p2.emulateMedia({ media: 'print' }); await p2.screenshot({ path: O + '/print_media_report_view.png', fullPage: false }); await p2.close(); }
  const pdfBtn = await pg.$('#agnRepViewPdf'); const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }).catch(() => null), pdfBtn.click()]);
  ok(dl && /\.pdf$/.test(dl.suggestedFilename()), view + ': Download PDF on request saves ' + (dl ? dl.suggestedFilename() : 'nothing')); const dlAfterClick = downloads;
  await pg.click('#agnRepViewClose'); ok(!(await pg.$('#agnRepView')), view + ': viewer closes');
  /* 2 analyst: My reports -> Open */
  await pg.click('#agnMyReports'); await pg.waitForSelector('[data-r268-lib="open"]', { timeout: 60000 }); await pg.waitForTimeout(800);
  await pg.click('[data-r268-lib="open"] >> nth=0'); await viewerCheck(pg, 'analyst My reports Open', view); await pg.screenshot({ path: O + '/' + view + '_2_analyst_myreports_open.png' });
  await pg.keyboard.press('Escape'); ok(!(await pg.$('#agnRepView')), view + ': Escape closes the viewer');
  /* 3 start page: Report tab */
  await pg.goto(B + '/' + HASH, { waitUntil: 'load', timeout: 180000 }); await pg.waitForSelector('#tab_rep', { timeout: 120000 }); await pg.waitForTimeout(4000); await pg.click('#tab_rep');
  await frameLoaded(pg, '#rep50Frame'); await pg.waitForTimeout(800);
  const sp = await pg.evaluate(() => { const b = document.getElementById('rep50Btns'); return { btns: !!b && getComputedStyle(b).display !== 'none', print: !!document.getElementById('rep50Print'), pdf: (document.getElementById('rep50Pdf') || {}).href || '', open: !!document.getElementById('rep50Open'), st: (document.getElementById('rep50St') || {}).textContent }; });
  ok(sp.btns && sp.print && /\.pdf\?download=1/.test(sp.pdf) && !sp.open, view + ' start Report tab: report on screen, Print + Download PDF (' + sp.st + ')');
  await pg.locator('#rep50').scrollIntoViewIfNeeded(); await pg.screenshot({ path: O + '/' + view + '_3_start_report_tab.png' });
  /* 4 Customize: Site report, then My reports Open */
  await pg.goto(B + '/customize' + HASH, { waitUntil: 'load', timeout: 180000 }); await pg.waitForFunction(() => !!(window.AGNREP50 && window.NIGRAAN3), null, { timeout: 120000 });
  await pg.evaluate(([a, b]) => window.NIGRAAN3.setPoint(a, b, 'E-7'), [P.lat, P.lon]); await pg.waitForTimeout(4000);
  await pg.evaluate(() => document.getElementById('rep-site').click()); await viewerCheck(pg, 'Customize Site report', view); await pg.screenshot({ path: O + '/' + view + '_4_customize_site_report.png' }); await pg.click('#agnRepViewClose');
  await pg.waitForTimeout(1500); const lo = await pg.$('a[data-rep50-open]');
  if (!lo) { await pg.goto(B + '/customize' + HASH, { waitUntil: 'load' }); await pg.waitForTimeout(6000); }
  const lo2 = await pg.waitForSelector('a[data-rep50-open]', { timeout: 60000, state: 'attached' }).catch(() => null); ok(!!lo2, view + ' Customize My reports lists the report');
  if (lo2) { await lo2.evaluate((a) => a.click()); await viewerCheck(pg, 'Customize My reports Open', view); await pg.screenshot({ path: O + '/' + view + '_5_customize_myreports_open.png' }); await pg.click('#agnRepViewClose'); }
  ok(downloads === dlAfterClick && dlAfterClick === 1, view + ': no automatic download (downloads ' + downloads + ', all on request: ' + dlAfterClick + ')');
  ok(!errs.length, view + ': no page error ' + errs.join(' | '));
  /* 5 failure state (generate answers "not ready"): the reason in plain words, no Print / Download / Open */
  await pg.route('**/api/report/generate', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'report_not_ready', why: 'The report could not be finished for this place right now. Please try again in a few minutes.' }) }));
  await pg.goto(B + '/analyst' + HASH, { waitUntil: 'load', timeout: 180000 }); await pg.waitForSelector('#agnFullReport'); await pg.waitForTimeout(5000); await pg.click('#agnFullReport');
  await pg.waitForFunction(() => { const m = document.getElementById('agnRepViewMsg'); return m && !m.hidden && /could not/.test(m.textContent); }, null, { timeout: 60000 });
  const fv = await pg.evaluate(() => ({ msg: document.getElementById('agnRepViewMsg').textContent, print: getComputedStyle(document.getElementById('agnRepViewPrint')).display, pdf: getComputedStyle(document.getElementById('agnRepViewPdf')).display, frame: document.getElementById('agnRepViewFrame').hidden }));
  ok(fv.print === 'none' && fv.pdf === 'none' && fv.frame, view + ' failure in the viewer: reason shown, no Print / Download (' + fv.msg + ')'); await pg.screenshot({ path: O + '/' + view + '_6_failure_viewer.png' });
  await pg.goto(B + '/?f=1' + HASH, { waitUntil: 'load', timeout: 180000 }); await pg.waitForSelector('#tab_rep'); await pg.waitForTimeout(3000); await pg.click('#tab_rep');
  await pg.waitForFunction(() => /could not/.test((document.getElementById('rep50St') || {}).textContent || ''), null, { timeout: 60000 });
  const fs = await pg.evaluate(() => ({ st: document.getElementById('rep50St').textContent, btns: getComputedStyle(document.getElementById('rep50Btns')).display, open: !!document.getElementById('rep50Open'), frame: document.getElementById('rep50Frame').hidden }));
  ok(fs.btns === 'none' && !fs.open && fs.frame, view + ' failure on the start Report tab: reason shown, no Download / Open (' + fs.st + ')'); await pg.locator('#rep50').scrollIntoViewIfNeeded(); await pg.screenshot({ path: O + '/' + view + '_7_failure_start_tab.png' });
  await ctx.close(); }
await br.close(); writeFileSync(O + '/shots50.json', JSON.stringify(res, null, 1));
console.log('\nshots50: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
