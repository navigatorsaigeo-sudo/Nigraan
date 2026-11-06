/* v91.17.283.28 · P3 · Client Risk with no project loaded shows a neutral first step, never "This workspace follows the decision subject and
   the subject is not complete". usage: node scripts/tests28328p/p3.test.mjs [base] */
import { T, browser, open, consoleReady, place, tab } from './lib.mjs';
const { ok, done } = T(); const br = await browser();
for (const op of [false, true]) { const o = await open(br, '/analyst'); await consoleReady(o.pg, op); await place(o.pg); await tab(o.pg, 'assessments', 4000);
  const r = await o.pg.evaluate(() => { const e = document.getElementById('agnSubjectStrip-assessments'); return { t: e ? e.textContent : null, vis: !!(e && e.getClientRects().length), first: e && e.dataset.agnFirstStep, page: document.querySelector('.view[data-view="assessments"]').innerText }; });
  ok(r.t && /^First step:/.test(r.t) && r.first === '1', 'P3 ' + (op ? 'operator' : 'client') + ': the strip is the first step ("' + String(r.t).slice(0, 80) + '")', JSON.stringify(r).slice(0, 300));
  ok(!/subject is not complete|follows the decision subject and/.test(r.page), 'P3 ' + (op ? 'operator' : 'client') + ': no "subject is not complete" banner without a project');
  ok(o.errs.length === 0, 'P3 no page error', o.errs.join(' | ')); await o.ctx.close(); }
await br.close(); done();
