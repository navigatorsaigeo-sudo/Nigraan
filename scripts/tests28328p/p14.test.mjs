/* v91.17.283.28 · P14 · the map's +1d/+2d/+3d buttons read the server's issued days (GET /api/levels days[].layers), not a page-side
   coverage sweep with a 95 % gate; the client view has no MutationObserver that rewrites a painted "index NN/100".
   usage: node scripts/tests28328p/p14.test.mjs [base] */
import { T, src, MACH, script, browser, open, consoleReady, place } from './lib.mjs';
const { ok, done } = T(); const S = src(MACH), DC = script(S, 'agn-v72-day-controller'), V = script(S, 'agn-v2834-js');
ok(DC && !/layerCoverage|95% coverage gate|95% required|__districtForecastStatus/.test(DC) && /function servedDays\(layer\)/.test(DC), 'P14 static: the day controller has no coverage sweep; it reads servedDays()');
ok(V && !/RX_IDX|skill2834|function a13|rewriteHtml/.test(V), 'P14 static: the "index NN/100" rewrite (observer and report rewrite) is deleted');
const br = await browser();
/* the server issues heat for day 0 and 1 only: +1 open, +2 and +3 closed with the server's reason */
const o = await open(br, '/analyst', { route: (pg) => pg.route(/\/api\/levels\?layer=[a-z_]+&day=0$/, async (route) => { const r = await route.fetch(); const j = await r.json(); j.days = (j.days || []).filter((d) => d.day <= 1); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) }); }) });
await consoleReady(o.pg); await place(o.pg);
await o.pg.evaluate(() => { const el = document.getElementById('mapHazardPick'); if (el) { el.value = 'heat'; el.dispatchEvent(new Event('change', { bubbles: true })); } });
await o.pg.waitForTimeout(5000);
const d = await o.pg.evaluate(() => [...document.querySelectorAll('#v3days button[data-d]')].map((b) => ({ d: b.getAttribute('data-d'), dis: b.disabled, t: b.title })));
const g = (k) => d.find((x) => x.d === String(k)) || {};
ok(g(1).dis === false && /issued by the server/.test(g(1).t) && g(2).dis === true && /server has issued no level/.test(g(2).t) && g(3).dis === true, 'P14 page: day buttons follow the served days (+1 open, +2 / +3 closed)', JSON.stringify(d));
ok(o.errs.length === 0, 'P14 no page error', o.errs.join(' | ')); await br.close(); done();
