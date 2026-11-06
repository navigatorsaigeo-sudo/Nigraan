/* v91.17.283.28 · P18 · Overview: the operator "Engineering detail" block (the legacy page-scoring rows, e.g. "Screened, not scored (10)")
   is deleted; the place card shows only the served levels. usage: node scripts/tests28328p/p18.test.mjs [base] */
import { T, src, MACH, browser, open, consoleReady, place, tab } from './lib.mjs';
const { ok, done } = T(); const S = src(MACH);
ok(!/Engineering detail \(operator\)|function placeEng|agn-mps-eng/.test(S), 'P18 static: the Engineering detail block and its placement are deleted');
const br = await browser(); const o = await open(br, '/analyst'); await consoleReady(o.pg, true); await place(o.pg); await tab(o.pg, 'overview', 6000);
const r = await o.pg.evaluate(() => { const R = document.getElementById('mpRightIn'); return R ? { t: R.innerText, card: !!R.querySelector('.agn-mps') } : null; });
ok(r && r.card && !/Engineering detail|Screened, not scored|index \d+\/100/.test(r.t), 'P18 page (operator): the place card carries no legacy scoring block', r && r.t.slice(0, 300));
ok(o.errs.length === 0, 'P18 no page error', o.errs.join(' | ')); await br.close(); done();
