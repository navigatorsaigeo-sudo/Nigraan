/* v91.17.283.28 · P8 · the server's provisional AJG list is a synthetic DEMO list: every view that ranks sites says DEMO (page banner, each
   ranking table, the map tooltips, the network report), never AJG's real network. The test server holds the provisional list.
   usage: node scripts/tests28328p/p8.test.mjs [base] */
import { T, src, N3, BASE, browser, open } from './lib.mjs';
const { ok, done } = T(); const S = src(N3);
ok(/function isDemo\(\)\{ return !!\(AJG\.provisional&&S\.sitesLabel==='AJG Supplies'\); \}/.test(S), 'P8 static: one DEMO rule (the server\'s provisional flag on the AJG list)');
const j = await fetch(BASE + '/customize/sites.json').then((r) => r.json()).catch(() => null);
if (!j || !j.provisional) { console.log('SKIP P8 page: the test server\'s AJG list is not provisional'); done(); }
const br = await browser(); const o = await open(br, '/customize'); await o.pg.waitForTimeout(10000);
const a = await o.pg.evaluate(() => { const b = document.getElementById('demo-banner'); return { hidden: b.hidden, t: b.textContent, ov: [...document.querySelectorAll('#ov-ajg table')].map((t) => (t.querySelector('caption') || {}).textContent || null), hd: (document.querySelector('#ov-ajg .ajg-hd b') || {}).textContent }; });
ok(!a.hidden && /^DEMO site list/.test(a.t) && /not AJG Supplies' real network/.test(a.t), 'P8 page: the banner says DEMO ("' + a.t.slice(0, 70) + '")', JSON.stringify(a));
ok(a.ov.length >= 2 && a.ov.every((c) => /^DEMO/.test(c || '')) && /DEMO list/.test(a.hd || ''), 'P8 page: both Overview ranking tables and the network heading say DEMO', JSON.stringify(a));
await o.pg.evaluate(() => NIGRAAN3.go('sites')); await o.pg.waitForTimeout(5000);
const b = await o.pg.evaluate(() => ({ cap: (document.querySelector('#pf-table caption') || {}).textContent || null, lead: document.getElementById('pf-lead').textContent }));
ok(/^DEMO/.test(b.cap || '') && /^DEMO list/.test(b.lead), 'P8 page: the all-sites table and its lead say DEMO', JSON.stringify(b));
ok(o.errs.length === 0, 'P8 no page error', o.errs.join(' | ')); await br.close(); done();
