/* v91.17.283.28 · P17 · Operations: with no client project and no asset type picked no sector is assumed (never "Agriculture"); the
   action count has one source (the Tracked-actions badge and "What changed" read actionCounts()). usage: node scripts/tests28328p/p17.test.mjs [base] */
import { T, src, MACH, browser, open, consoleReady, place, tab } from './lib.mjs';
const { ok, done } = T(); const S = src(MACH);
ok(/function actionCounts\(\)/.test(S) && /\['Actions',`\$\{_ac\.active\} active action/.test(S) && /\$\('opsxActionCountBadge'\)\.textContent=`\$\{_ac\.active\} active action/.test(S), 'P17 static: the badge and "What changed" read the one actionCounts()');
const br = await browser(); const o = await open(br, '/analyst'); await consoleReady(o.pg); await place(o.pg); await tab(o.pg, 'operations', 8000);
const r = await o.pg.evaluate(() => { const v = document.querySelector('.view[data-view="operations"]'); const ev = [...document.querySelectorAll('#opsxEventStream .opsx-stream-item')].map((x) => x.innerText.replace(/\s+/g, ' ')).find((x) => /^Actions/.test(x)) || '';
  return { agri: /agricultur|farm or agriculture/i.test(v.innerText), badge: (document.getElementById('opsxActionCountBadge') || {}).textContent, ev, sr: ((document.getElementById('agnSiteRisk') || {}).innerText || '').slice(0, 300), sector: AGN.sector.get(), asset: document.getElementById('asmtAsset').value }; });
ok(!r.agri && r.asset === '', 'P17 page: no sector assumed on Operations (asset type "' + r.asset + '")', JSON.stringify(r).slice(0, 400));
const n1 = (/(\d+) active action/.exec(r.badge || '') || [])[1], n2 = (/(\d+) active action/.exec(r.ev) || [])[1];
ok(n1 != null && n1 === n2, 'P17 page: the badge and "What changed" give the same count (' + n1 + ' / ' + n2 + ')', JSON.stringify({ b: r.badge, e: r.ev }));
ok(o.errs.length === 0, 'P17 no page error', o.errs.join(' | ')); await br.close(); done();
