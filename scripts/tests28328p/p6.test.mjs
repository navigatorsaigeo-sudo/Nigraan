/* v91.17.283.28 · P6 (SUPERSEDED in v91.17.283.51 / NIGRAAN 1.0.10.2, owner 3 Nov 11:53 PKT) · the hand-over of Client Risk sites to the
   Customize page is gone: Client Risk > Client portfolio ranks the register again (the v264 table, from the served levels, build/v51rs/
   agn-port51.js). This suite now checks that contract: no hand-over card and no POST /customize/sites from the analyst page; the sample
   and the client's own rows are ranked in #asmtPortfolioRows; nothing is sent to the Customize site list.
   usage: node scripts/tests28328p/p6.test.mjs [base] */
import { T, src, MACH, browser, open, consoleReady, tab } from './lib.mjs';
const { ok, done } = T(); const S = src(MACH);
ok(/id="asmtPortfolioRows"/.test(S) && /id="agn-port51-js"/.test(S), 'P6 static: the ranked portfolio table and its script are on the page');
ok(!/id="asmtHandSend"|id="asmtHandOpen"|function sendHandover|Nothing is ranked on this tab/.test(S), 'P6 static: the hand-over card and its code are deleted');
const br = await browser(); const o = await open(br, '/analyst'); await consoleReady(o.pg); await tab(o.pg, 'assessments');
let posts = 0; await o.pg.route(/\/customize\/sites$/, async (route) => { posts++; await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
await o.pg.evaluate(() => document.querySelector('#asmtTabs button[data-asmt="portfolio"]').click());
const a = await o.pg.evaluate(() => ({ lab: document.querySelector('#asmtTabs button[data-asmt="portfolio"]').textContent, rows: document.getElementById('asmtPortfolioRows').innerText }));
ok(a.lab === 'Client portfolio' && /No sites yet/.test(a.rows), 'P6 page: the sub-tab is "Client portfolio"; with no sites the table says so', JSON.stringify(a));
await o.pg.evaluate(() => { try { AGN.portfolio.intake.fromObjects([{ asset_id: 'T6-1', name: 'Test depot', asset_type: 'commercial', latitude: 31.52, longitude: 74.36 }, { asset_id: 'T6-2', name: 'Test yard', asset_type: 'industrial', latitude: 24.86, longitude: 67.01 }], { source: 'test' }); } catch (e) { window.__p6 = String(e && e.message || e); } });
await o.pg.waitForFunction(() => { const t = document.getElementById('asmtPortfolioRows'); return t && t.querySelectorAll('tr').length === 2 && !/checking…/.test(t.innerText); }, null, { timeout: 120000 }).catch(() => null);
const r = await o.pg.evaluate(() => ({ rows: [...document.querySelectorAll('#asmtPortfolioRows tr')].map((tr) => tr.children[1] ? tr.children[1].innerText + ' | ' + tr.children[5].innerText : tr.innerText), err: window.__p6 || null }));
ok(r.rows.length === 2 && r.rows.every((x) => /Test (depot|yard) \| (Normal|Low|Moderate|High|Severe)/.test(x)) && !r.err, 'P6 page: the client rows are ranked with their served level', JSON.stringify(r));
ok(posts === 0, 'P6 page: nothing is posted to the Customize site list', posts);
ok(o.errs.length === 0, 'P6 no page error', o.errs.join(' | ')); await br.close(); done();
