/* v91.17.283.28 · P21 · rain verification on the console reads the server's gauge scores first: the operator card "What we said vs what
   happened" prints rainGauge (issued vs rain gauges, the truth) and chancesGauge before the satellite (IMERG Late, Pakistan day) tables;
   the skill card's wet-day table is against rain gauges and the satellite table, when served, is labelled "not a measurement".
   The verify answer is replaced here by a fixed one so the rows are known. usage: node scripts/tests28328p/p21.test.mjs [base] */
import { T, src, MACH, browser, open, consoleReady, place, tab } from './lib.mjs';
const { ok, done } = T(); const S = src(MACH);
ok(/var RG=V\.rainGauge\|\|\{\}/.test(S) && /V\.chancesGauge\|\|\{\}/.test(S) && /<h4>Rain: wet day \(1 mm or more\) against rain gauges<\/h4>/.test(S) && /R\.satellite&&R\.satellite\.wet\?'<h5>'\+esc\(R\.satellite\.label\)\+' \(not a measurement\)<\/h5>'/.test(S), 'P21 static: gauge tables, chances vs gauges and the satellite wet-day table labelled "not a measurement"');
const V = { built: '2026-10-28', temperature: { why: 'none' }, rainGauge: { byLead: { 1: { n: 40, fcTotalMm: 12.5, gaugeTotalMm: 10, ratio: 1.25, biasMmPerDay: 0.06, categories: [{ thr_mm: 1, pod: 0.7, far: 0.2 }] } } },
  rain: { byLead: { 1: { n: 500, fcTotalMm: 120, obsTotalMm: 100, ratio: 1.2, categories: [{ thr_mm: 10, pod: 0.5, far: 0.4 }] } } },
  chancesGauge: { 'day:pr10': { n: 40, thr_mm: 10, baseRate: 0.05, brier: 0.04, brierSkill: 0.1 } }, chances: { 'day:pr10': { n: 500, thr_mm: 10, baseRate: 0.04, brier: 0.045, brierSkill: -0.07 } } };
const br = await browser(); const o = await open(br, '/analyst');
await o.pg.route(/\/api\/ops\/verify$/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, verify: V, registry: null }) }));
await consoleReady(o.pg, true); await place(o.pg); await tab(o.pg, 'operations', 7000);
const r = await o.pg.evaluate(() => { const b = document.getElementById('agnTrkBody'); return b ? { h: [...b.querySelectorAll('h4')].map((x) => x.textContent), t: b.innerText } : null; });
ok(r && /issued vs rain gauges \(the truth\)/.test(r.h[1] || '') && /satellite \(IMERG Late\), Pakistan day/.test(r.h[2] || ''), 'P21 page: gauges first, then the satellite (named)', JSON.stringify(r && r.h));
ok(r && /gauge mm/.test(r.t) && /bias mm\/day/.test(r.t) && /satellite \(IMERG Late\) mm/.test(r.t) && r.h.some((x) => /vs rain gauges: Brier/.test(x)) && r.h.some((x) => /vs satellite \(IMERG Late\): Brier/.test(x)), 'P21 page: gauge columns, satellite column and both chance tables', r && r.t.slice(0, 400));
ok(o.errs.length === 0, 'P21 no page error', o.errs.join(' | ')); await br.close(); done();
