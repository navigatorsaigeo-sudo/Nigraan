import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.277 · FIX277 L4 · every report type as drawn (situation, site, portfolio, executive, assurance, readiness72), client and
   operator, with the 10-site sample: no code words (null / undefined / NaN / [object / registry and function identifiers / .js .py
   names). The v276 walk found "drought is declared null in FORMULA_REGISTRY.mc.bridges" and "scores null, not zero" in the operator
   assurance report (recorded deviations).
   usage: node scripts/tests277/reports277.test.mjs http://127.0.0.1:8962 */
import { createRequire } from 'node:module';
const BASE = process.argv[2] || process.env.BASE || 'http://127.0.0.1:8962';
const req = createRequire(import.meta.url);
let PW = __T.playwrightSync();
const exe = process.env.PW_CHROME || __T.chromiumPath();
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i ? ' :: ' + String(i).slice(0, 500) : '')); } };
const br = await __T.launch(PW.chromium, { executablePath: exe, args: ['--no-sandbox'] });
const open = async (op) => { const ctx = await br.newContext({ viewport: { width: 1600, height: 1000 } }); const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await pg.addInitScript((o) => { try { if (o) localStorage.setItem('agn.operator.v1', '1'); else localStorage.removeItem('agn.operator.v1'); } catch (_) {} }, op);
  await pg.goto(BASE + '/analyst' + (op ? '?operator=1' : ''), { waitUntil: 'domcontentloaded', timeout: 180000 });
  await pg.waitForFunction(() => window.AGN && AGN.reports268 && AGN.flow && AGN.flow.setActiveLocation, null, { timeout: 180000 }); await pg.waitForTimeout(5000);
  return { ctx, pg, errs }; };
const JUNK = /\b(null|undefined|NaN)\b|\[object|FORMULA_REGISTRY|AGN_TUNING|\b[a-z]+[A-Z][A-Za-z]+\.[a-z]\w*|\b\w+\(\w*\)\s|\.(?:js|py|mjs)\b/;
for (const op of [false, true]) {
  const o = await open(op);
  await o.pg.evaluate(() => { const S = samplePortfolio(); AGN.portfolio.intake.fromObjects(S.map((x) => { const y = Object.assign({}, x); ['demo', 'origin', 'origin_company', 'source'].forEach((k) => delete y[k]); return y; })); });
  await o.pg.waitForTimeout(3000); await o.pg.evaluate(() => AGN.flow.setActiveLocation({ name: 'Lahore', lat: 31.5204, lon: 74.3587 }, 'Lahore', { src: 'search' })); await o.pg.waitForTimeout(4000);
  for (const k of ['situation', 'site', 'portfolio', 'executive', 'assurance', 'readiness72']) {
    await o.pg.evaluate((k) => { window.print = function () {}; AGN.reports268.open(k, null); }, k);
    const ready = await o.pg.waitForFunction((k) => { const c = AGN.reports268.current(); const ov = document.querySelector('.rk-overlay'); return c && c.kind === k && ov && !ov.querySelector('#r268Prep') && ov.querySelector('.rk-cover,.rk-brief,.rk-bhead,.rk h2'); }, k, { timeout: 150000 }).then(() => true).catch(() => false);
    await o.pg.waitForTimeout(1200);
    const t = await o.pg.evaluate(() => { const ov = document.querySelector('.rk-overlay'); return ov ? ov.innerText : ''; });
    const hits = [...new Set(t.split('\n').filter((l) => JUNK.test(l)).map((l) => l.trim().slice(0, 140)))];
    ok(ready && !hits.length, 'L4 ' + (op ? 'operator' : 'client') + ' ' + k + ' report: no code words', hits.slice(0, 3).join(' | '));
    await o.pg.evaluate(() => { try { AGNRK.close(); } catch (_) {} document.querySelectorAll('.rk-overlay .rk-bar button').forEach((b) => { if (b.textContent === 'Close') b.click(); }); }); await o.pg.waitForTimeout(600);
  }
  ok(!o.errs.length, (op ? 'operator' : 'client') + ' reports: no page errors', o.errs.slice(0, 3).join(' | '));
  await o.ctx.close();
}
await br.close();
console.log(`\n${fail ? 'FAIL' : 'PASS'} reports277: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
