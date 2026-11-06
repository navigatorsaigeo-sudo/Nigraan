/* v91.17.283.28 · P5 · Client Risk has no default asset type (nothing is screened until the user picks one); the place line uses the one
   place name (AGN.place.name, the name at the top of the page). usage: node scripts/tests28328p/p5.test.mjs [base] */
import { T, browser, open, consoleReady, place, tab } from './lib.mjs';
const { ok, done } = T(); const br = await browser(); const o = await open(br, '/analyst'); await consoleReady(o.pg); await place(o.pg); await tab(o.pg, 'assessments', 3000);
const a = await o.pg.evaluate(() => ({ v: document.getElementById('asmtAsset').value, opt: document.getElementById('asmtAsset').options[0].text, rows: document.getElementById('asmtResultsRows').innerText, nm: AGN.place.name(), chip: document.getElementById('asmtPlaceName').textContent }));
ok(a.v === '' && /Pick the asset type/.test(a.opt), 'P5 the asset type starts empty ("' + a.opt + '")', JSON.stringify(a));
ok(/Pick the asset type/.test(a.rows), 'P5 nothing is screened before a type is picked', a.rows);
await o.pg.evaluate(() => { const s = document.getElementById('asmtAsset'); s.value = 'industrial'; s.dispatchEvent(new Event('change', { bubbles: true })); document.getElementById('asmtRun').click(); });
await o.pg.waitForTimeout(4000);
const b = await o.pg.evaluate(() => ({ sum: document.getElementById('asmtSummaryNote').textContent, nm: AGN.place.name(), chip: document.getElementById('asmtPlaceName').textContent }));
ok(b.sum.indexOf('Industrial facility · ' + b.nm + ' · ') === 0 && b.chip === b.nm, 'P5 the summary and the place chip carry the one place name ("' + b.nm + '")', JSON.stringify(b));
ok(o.errs.length === 0, 'P5 no page error', o.errs.join(' | ')); await br.close(); done();
