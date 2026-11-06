/* v91.17.283.28 · P15 · Methods & Verification (was "Evidence & Methods"): the placeholder panels are gone (data fabric, model suitability
   matrix, dataset readiness with "Locationforecast", "the HTML tests each stage", the J10 journey self-test badge) and the verification
   ledger is the server's (GET /api/verification/grades ledger). usage: node scripts/tests28328p/p15.test.mjs [base] */
import { T, src, MACH, browser, open, consoleReady, place } from './lib.mjs';
const { ok, done } = T(); const S = src(MACH);
ok(!/id="susFabricCard"|<h3>Regional model suitability matrix<\/h3>|<h3>Dataset readiness and role matrix<\/h3>|<h3>Production system flow<\/h3>|The HTML tests each stage|independent forecast provider Locationforecast|agn-v91-j10|agnV91JourneyGate/.test(S), 'P15 static: the placeholder panels and the J10 badge are deleted');
ok(/>Methods &amp; Verification<\/button>/.test(S) && !/>Evidence &amp; Methods<\/button>/.test(S), 'P15 static: the tab is "Methods & Verification"');
const br = await browser(); const o = await open(br, '/analyst'); await consoleReady(o.pg, true); await place(o.pg);
const grades = await o.pg.evaluate(() => fetch('/api/verification/grades', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).catch(() => null));
await o.pg.evaluate(() => document.getElementById('agnV91HiddenModelRoute').click()); await o.pg.waitForTimeout(6000);
const r = await o.pg.evaluate(() => ({ btn: document.getElementById('agnV91HiddenModelRoute').textContent, cnt: (document.getElementById('agnVerifyCount') || {}).textContent || null, txt: document.querySelector('.view[data-view="modelab"]').innerText }));
ok(r.btn === 'Methods & Verification', 'P15 page: the tab button reads "' + r.btn + '"');
ok(!/Data fabric|Regional model suitability|EVALUATION PENDING|Dataset readiness|Production system flow|decision journey|Locationforecast/i.test(r.txt), 'P15 page: no placeholder panel on the tab');
const L = grades && grades.ledger;
ok(L ? r.cnt === L.logged + ' logged · ' + L.scored + ' scored · ' + L.days + ' issue day' + (L.days === 1 ? '' : 's') : /reading the server ledger/.test(r.cnt || ''), 'P15 page: the ledger count is the server\'s ("' + r.cnt + '")', JSON.stringify(L));
ok(o.errs.length === 0, 'P15 no page error', o.errs.join(' | ')); await br.close(); done();
