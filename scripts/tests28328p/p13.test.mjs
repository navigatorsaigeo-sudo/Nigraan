/* v91.17.283.28 · P13 · labels: each table of "What we said vs what happened" names its own variable (the Brier rows name the rain event
   from the served threshold); the coverage notes count tehsils; the outlook has one name; the "Comfort brief" button says its action.
   usage: node scripts/tests28328p/p13.test.mjs [base] */
import { T, src, MACH, browser, open, consoleReady, place, tab } from './lib.mjs';
const { ok, done } = T(); const S = src(MACH);
ok(/<h4>Temperature \(daily highest and lowest, °C\): issued vs AGN stations<\/h4>/.test(S) && /<h4>Rain \(daily total, mm\): issued vs rain gauges \(the truth\)<\/h4>/.test(S) && /<h4>Rain \(daily total at the tehsil, mm\): issued vs satellite \(IMERG Late\), Pakistan day<\/h4>/.test(S) && /Issued rain chances \(the chance of a day with rain at or above the amount named\) vs rain gauges/.test(S), 'P13 static: every verification table caption names its variable');
ok(/'Rain ≥ '\+v\.thr_mm\+' mm in a day'/.test(S), 'P13 static: a Brier row names its event from the served threshold (thr_mm)');
ok(!/districts have hourly cover|districts cover this hour|of '\+\(cov\.expected\|\|576\)\+' districts/.test(S), 'P13 static: no tehsil count is called "districts"');
ok(/<span id="exportLabel">Copy comfort brief<\/span>/.test(S), 'P13 static: the brief button says what it does');
ok(/>15-day outlook · weeks 1–6 · season ahead</.test(S) && !/15-day ensemble · weeks-ahead ensemble/.test(S), 'P13 static: the outlook card names the product "15-day outlook"');
const br = await browser(); const o = await open(br, '/analyst'); await consoleReady(o.pg, true); await place(o.pg); await tab(o.pg, 'operations', 6000);
const r = await o.pg.evaluate(() => { const b = document.getElementById('agnTrkBody'); return b ? [...b.querySelectorAll('h4')].map((h) => h.textContent) : null; });
ok(r && r.length >= 3 && r.every((h) => /Temperature \(|Rain \(|rain chances|Model register/.test(h)), 'P13 page: the operator verification captions (' + (r || []).length + ')', JSON.stringify(r));
ok(o.errs.length === 0, 'P13 no page error', o.errs.join(' | ')); await br.close(); done();
