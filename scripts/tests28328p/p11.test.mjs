/* v91.17.283.28 · P11 · Reports: opening the tab builds and freezes nothing; a report is built only by its Generate / report button, and the
   buttons stay disabled with the reason until the place's levels have loaded. usage: node scripts/tests28328p/p11.test.mjs [base] */
import { T, src, MACH, browser, open, consoleReady, place, tab } from './lib.mjs';
const { ok, done } = T(); const S = src(MACH);
ok(!/if\(!_reportFrozen\(\)\) generateReport\(\);/.test(S), 'P11 static: no automatic generateReport (tab opening, screening run)');
ok(!/\$\("asmtReportType"\)\.addEventListener\("change",generateReport\)/.test(S), 'P11 static: changing the report type builds nothing');
const br = await browser();
/* the levels part held back: the buttons wait with the reason */
{ const o = await open(br, '/analyst'); await o.pg.route(/\/api\/point\?/, async (route) => { const r = await route.fetch(); const j = await r.json(); if (j && j.parts && j.parts.levels && !/complete=1/.test(route.request().url())) { j.parts.levels = { pending: true }; j.pending = ['levels']; } await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) }); });
  await o.pg.route(/complete=1/, async (route) => { await new Promise((r) => setTimeout(r, 60000)); try { await route.abort(); } catch (_) {} });
  await consoleReady(o.pg, true); await o.pg.evaluate(() => AGN.point.goText('31.52040, 74.35870', { quiet: true, label: 'Test place' })); await o.pg.waitForTimeout(6000);
  await tab(o.pg, 'report', 3000);
  const a = await o.pg.evaluate(() => { const g = document.getElementById('asmtGenerateReport'); return { dis: g.disabled, title: g.title, pv: document.getElementById('asmtReportPreview').innerText.slice(0, 200), gate: AGN.reportGate(null) }; });
  ok(a.dis === true && /hazard levels/.test(a.title) && a.gate.ok === false, 'P11 page: before the levels load, Generate is disabled with the reason ("' + a.title + '")', JSON.stringify(a));
  ok(/press Generate preview/.test(a.pv), 'P11 page: opening the Reports tab built nothing', a.pv);
  await o.ctx.close(); }
/* the levels loaded: still nothing on opening; Generate builds */
{ const o = await open(br, '/analyst'); await consoleReady(o.pg, true); await place(o.pg); await tab(o.pg, 'report', 4000);
  const a = await o.pg.evaluate(() => ({ dis: document.getElementById('asmtGenerateReport').disabled, pv: document.getElementById('asmtReportPreview').innerText.slice(0, 200), frozen: document.getElementById('asmtFreezeState').textContent }));
  ok(a.dis === false && /press Generate preview/.test(a.pv) && /No document frozen yet/.test(a.frozen), 'P11 page: with the levels loaded the button opens and nothing was built or frozen on opening', JSON.stringify(a));
  await o.pg.evaluate(() => document.getElementById('asmtGenerateReport').click());   /* the report waits for the site screening values first (up to 75 s) */
  await o.pg.waitForFunction(() => !/press Generate preview/.test(document.getElementById('asmtReportPreview').innerText), null, { timeout: 100000, polling: 1000 }).catch(() => {});
  const b = await o.pg.evaluate(() => document.getElementById('asmtReportPreview').innerText.slice(0, 200));
  ok(!/press Generate preview/.test(b) && b.length > 20, 'P11 page: Generate builds the preview', b);
  ok(o.errs.length === 0, 'P11 no page error', o.errs.join(' | ')); await o.ctx.close(); }
await br.close(); done();
