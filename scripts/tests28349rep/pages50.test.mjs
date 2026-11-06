#!/usr/bin/env node
/* v91.17.283.49 · 1.0.10 report engine · the pages (one browser, one page at a time): the Report buttons of the classic analyst page and of
   Customize download the server PDF; the report is in My reports at once; My reports opens a stored report as its own, styled document;
   the start page's Report tab shows the engine's report and its PDF link. usage: node pages50.test.mjs <base> <outdir> */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const T = await import('../lib/testenv.mjs');
const B = (process.argv[2] || T.BASE).replace(/\/$/, ''), O = process.argv[3] || '/dev/shm/pages50'; mkdirSync(O, { recursive: true });
let PW; try { PW = T.playwrightSync(); } catch (e) { console.log('SKIP (whole file) no Playwright'); process.exit(T.SKIP_EXIT); }
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL", m); } };
const br = await T.launch(PW.chromium, { executablePath: T.chromiumPath(), args: ['--no-sandbox', '--disable-gpu', '--renderer-process-limit=2', '--disable-extensions', '--disable-background-networking'] });
const LAT = 33.66860, LON = 73.07520;
async function fresh() { const ctx = await br.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true }); const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push(String(e.message || e).slice(0, 200))); await pg.route(/\/tiles\/|\/api\/hazardgrid|\/api\/map\/layer\b/, (r) => r.abort()); return { ctx, pg, errs }; }
async function until(pg, fn, ms, arg) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await pg.evaluate(fn, arg).catch(() => null); if (v) return v; await pg.waitForTimeout(1500); } return null; }

/* 1 · classic analyst page: Situation report -> PDF download, then My reports -> Open */
{ const { ctx, pg, errs } = await fresh();
  await pg.goto(B + '/analyst#agnplace=' + LAT.toFixed(5) + ',' + LON.toFixed(5) + ',I-8', { waitUntil: 'load', timeout: 180000 });
  ok(await until(pg, () => !!window.AGNREP50, 60000), 'classic: AGNREP50 loaded (CSP allows the script)');
  const gate = await until(pg, () => { try { const g = window.AGN && AGN.reportGate && AGN.reportGate('situation'); return g && g.ok ? 'ok' : null; } catch (_) { return null; } }, 150000);
  ok(gate === 'ok', 'classic: the report gate opened');
  const dl = pg.waitForEvent('download', { timeout: 120000 }).catch(() => null);
  await pg.evaluate(() => { const b = document.querySelector('[data-r268-report="situation"]'); b.disabled = false; b.click(); });
  const d = await dl; ok(!!d && /^NGR-\d{8}-\d{4}-[0-9a-f]{8}\.pdf$/.test(d.suggestedFilename()), 'classic: Situation report downloads the server PDF (' + (d && d.suggestedFilename()) + ')');
  if (d) { await d.saveAs(join(O, 'classic_situation.pdf')); }
  const st = await until(pg, () => { const e = document.getElementById('agnRep50'); return e && /kept in My reports/.test(e.textContent) ? e.textContent : null; }, 20000); ok(!!st, 'classic: status line says the report is kept in My reports');
  const overlay = await pg.evaluate(() => !!document.querySelector('.rk-overlay')); ok(!overlay, 'classic: the old in-page reader did not open');
  await pg.screenshot({ path: join(O, 'classic_after_download.png') });
  /* My reports */
  await pg.evaluate(() => { const b = document.getElementById('agnMyReports'); if (b) b.click(); });
  const id = await until(pg, () => { const r = document.querySelector('#r268List tr[data-id^="NGR-"]'); return r ? r.getAttribute('data-id') : null; }, 30000);
  ok(!!id, 'classic: My reports lists the generated report');
  await pg.screenshot({ path: join(O, 'classic_myreports.png') });
  if (id) { const pop = ctx.waitForEvent('page', { timeout: 30000 }).catch(() => null);
    await pg.evaluate((i) => { const b = document.querySelector('#r268List tr[data-id="' + i + '"] [data-r268-lib="open"]'); b.click(); }, id);
    const p2 = await pop; ok(!!p2, 'classic: Open makes a new tab');
    if (p2) { await p2.waitForLoadState('load').catch(() => {}); await p2.waitForTimeout(1500);
      const info = await p2.evaluate(() => ({ url: location.pathname, svgs: document.querySelectorAll('section.pg svg').length, font: getComputedStyle(document.querySelector('svg text')).fontFamily, bg: getComputedStyle(document.body).backgroundColor,
        fontOk: document.fonts ? [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'AGN Carlito' && f.status === 'loaded') : null }));
      ok(info.url === '/api/reports/' + id && info.svgs >= 3, 'classic: the stored report opens as its own document (' + JSON.stringify(info) + ')');
      ok(/AGN Carlito/.test(info.font) && info.bg !== 'rgba(0, 0, 0, 0)' && info.fontOk !== false, 'classic: the opened report is styled (font ' + info.font + ', loaded ' + info.fontOk + ')');
      await p2.setViewportSize({ width: 1000, height: 1300 }); await p2.screenshot({ path: join(O, 'classic_myreports_open.png') }); } }
  ok(!errs.length, 'classic: page errors ' + errs.join(' | '));
  await ctx.close(); }

/* 2 · Customize: Site report -> PDF download */
{ const { ctx, pg, errs } = await fresh();
  await pg.goto(B + '/customize', { waitUntil: 'load', timeout: 180000 });
  ok(await until(pg, () => !!(window.AGNREP50 && window.NIGRAAN3), 60000), 'Customize: AGNREP50 loaded under the page CSP');
  await pg.evaluate(([a, b]) => window.NIGRAAN3.setPoint(a, b, 'I-8'), [LAT, LON]); await pg.waitForTimeout(3000);
  const dl = pg.waitForEvent('download', { timeout: 120000 }).catch(() => null);
  await pg.evaluate(() => { const b = document.getElementById('rep-site'); b.click(); });
  const d = await dl; ok(!!d && /^NGR-.*\.pdf$/.test(d.suggestedFilename()), 'Customize: Site report downloads the server PDF (' + (d && d.suggestedFilename()) + ')');
  if (d) await d.saveAs(join(O, 'customize_site.pdf'));
  const lst = await (await fetch(B + '/api/reports?edition=customize&limit=20', { headers: { 'x-agn-view': 'customer' } })).json();
  ok(lst.reports.some((r) => r.engine && r.pdf), 'Customize: the report is in its library (edition customize) with its PDF');
  ok(!errs.length, 'Customize: page errors ' + errs.join(' | '));
  await ctx.close(); }

/* 3 · the start page: the Report tab is the engine's report */
{ const { ctx, pg, errs } = await fresh();
  await pg.goto(B + '/#agnplace=' + LAT.toFixed(5) + ',' + LON.toFixed(5) + ',I-8', { waitUntil: 'load', timeout: 180000 });
  ok(await until(pg, () => !!window.AGNREP50 && !!(window.AGNSTART && window.AGNSTART.data), 90000), 'start: AGNREP50 loaded and the place opened');
  await until(pg, () => !!document.getElementById('tab_rep'), 60000);
  await pg.evaluate(() => document.getElementById('tab_rep').click());
  const src = await until(pg, () => { const f = document.getElementById('rep50Frame'); return f && !f.hidden && f.getAttribute('src') ? f.getAttribute('src') : null; }, 90000);
  ok(!!src && /^\/api\/reports\/NGR-/.test(src), 'start: the Report tab frames the stored engine report (' + src + ')');
  const pdfHref = await pg.evaluate(() => { const a = document.getElementById('rep50Pdf'); return a && a.getAttribute('href'); }); ok(/\.pdf\?download=1$/.test(pdfHref || ''), 'start: Download PDF links the stored PDF');
  await pg.waitForTimeout(3000);
  const fr = pg.frames().find((f) => /\/api\/reports\/NGR-/.test(f.url())); const n = fr ? await fr.evaluate(() => document.querySelectorAll('section.pg svg').length).catch(() => 0) : 0;
  ok(n >= 3, 'start: the framed report shows its pages (' + n + ')');
  await pg.screenshot({ path: join(O, 'start_report_tab.png') });
  ok(!errs.length, 'start: page errors ' + errs.join(' | '));
  await ctx.close(); }
await br.close();
writeFileSync(join(O, 'pages50.result.json'), JSON.stringify({ pass, fail }));
console.log('pages50: ' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
