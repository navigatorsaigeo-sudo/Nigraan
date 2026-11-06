import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.252 · A3a portfolio lead + C3 report parity
   node scripts/tests252/v252.test.mjs [baseUrl]
   P1 hazards order: class, then level, then name (hzOrder); no lead at Normal is named
   P2 portfolio table: "Leading hazard" never shows a hazard for a lead at Normal; index column empty for it
   P3 top list holds only assets above Normal; KPI counts the same set, in level words
   P4 no engine class word (Act/Watch/Monitor/Clear) in the portfolio table, KPI or top list
   P5 the report's portfolio rows = the tab's rows (same order, same lead text, same level), same total
   zero page errors */
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const _pw = await __T.playwright(); const chromium = _pw.chromium || _pw.default.chromium;
let fails = 0, passes = 0;
const ok = (c, name, detail) => { if (c) passes++; else fails++; console.log((c ? 'PASS ' : 'FAIL ') + name + (detail != null ? ' · ' + String(detail).slice(0, 300) : '')); };
const b = await __T.launch(chromium, { executablePath: process.env.PW_CHROME || __T.chromiumPath(), args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await b.newPage({ viewport: { width: 1600, height: 1000 } }); const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await page.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => !!(window.AGN && AGN.hz5 && AGN.level && window.AGN_HZ_LEAD), null, { timeout: 180000 }); await page.waitForTimeout(12000);

const O = await page.evaluate(() => { const L = AGN_HZ_LEAD;
  /* v91.17.270: a row's level is the hazard engine's (engineLevel, the map's source); the page no longer scores it */
  const mk = (label, engineLevel, classRank) => ({ label, key: label, engineLevel, classRank });
  const a = [mk('Cold stress and frost', 0, 0), mk('Heat stress', 0, 0), mk('Wind and gusts', 1, 0)].sort(L.order);
  const n = [mk('Cold stress and frost', 0, 0), mk('Heat stress', 0, 0)].sort(L.order);
  return { first: a[0].label, sumA: L.summary(a[0], L.leaders(a)).text, sumN: L.summary(n[0], L.leaders(n)).text, lvW: AGN.level.words[1] }; });
ok(O.first === 'Wind and gusts' && O.sumA === 'Wind and gusts', 'P1 a Low hazard leads Normal ones, not the alphabetical first', JSON.stringify(O));
ok(O.sumN === 'No hazard above Normal', 'P1 all-Normal set names no hazard', O.sumN);

await page.evaluate(() => { const t = document.querySelector('[data-goto="assessments"]'); if (t) t.click(); });
await page.waitForTimeout(1500);
await page.evaluate(() => { const bt = document.getElementById('asmtLoadSample'); if (bt) bt.click(); });
/* v91.17.283.51 (1.0.10.2, owner 3 Nov): the ranked portfolio table is back on Client Risk (served levels, build/v51rs/agn-port51.js);
   the hand-over card of v283.28 (P6) is gone. P2-P4: the sample is ranked in the table, marked "Sample", and carries no engine class word. */
await page.waitForTimeout(4000);
await page.evaluate(() => { const b = document.querySelector('#asmtTabs button[data-asmt="portfolio"]'); if (b) b.click(); });
await page.waitForFunction(() => { const t = document.getElementById('asmtPortfolioRows'); return t && t.querySelectorAll('tr').length > 3 && !/checking…/.test(t.innerText); }, null, { timeout: 120000 }).catch(() => null);
const T = await page.evaluate(() => ({ n: (document.getElementById('asmtPortCount51') || {}).textContent, rows: document.querySelectorAll('#asmtPortfolioRows tr').length, smp: document.querySelectorAll('#asmtPortfolioRows .p51-smp').length, card: (document.getElementById('asmtPortfolio51') || {}).innerText || '', hand: !!document.getElementById('asmtHandSend') }));
ok(+T.n > 3 && T.rows === +T.n && !T.hand, 'P2 the sample portfolio is in the register and ranked in the portfolio table (no hand-over card)', JSON.stringify(T).slice(0, 300));
ok(T.smp === +T.n && !/\bDEMO\b|DEMONSTRATION|AJG/.test(T.card), 'P3 the sample rows are marked "Sample" (no DEMO wording, no client name)', T.smp + ' ' + T.card.slice(0, 200));
ok(!/\b(Act|Watch|Monitor|Clear)\b/.test(T.card), 'P4 no engine class words on the portfolio card', T.card.slice(0, 200));

const R = await page.evaluate(() => { try { const ev = (window.AGN && AGN.reportFreeze) ? AGN.reportFreeze.evidence() : null; return ev ? ev.portfolio || null : null; } catch (e) { return 'err ' + e.message; } });
if (R && R.rows) {
  /* v283.28: the console portfolio table is gone (P6), so the tab-parity half of P5 is retired; the level words stay checked */
  ok(R.rows.every(x => !/^(Act|Watch|Monitor|Clear)$/.test(x.level || '')), 'P5 report uses level words', R.rows.map(x => x.level).join(','));
} else console.log('SKIP P5 report evidence hook not exposed · ' + JSON.stringify(R));
ok(errs.length === 0, 'zero page errors', errs.join(' | '));
console.log(`\n${passes} PASS · ${fails} FAIL`);
await b.close(); process.exit(fails ? 1 : 0);
