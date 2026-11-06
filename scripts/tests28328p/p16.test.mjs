/* v91.17.283.28 · P16 · AI Decision: the duplicate Predictions sub-tab is dropped (with its fixed template advice, the empty trajectory chart
   and the demo source text), no review badge without a review mechanism, no "Planned" / "Watchlist" / "Model Lab" wording.
   usage: node scripts/tests28328p/p16.test.mjs [base] */
import { T, src, MACH, browser, open, consoleReady, place, tab } from './lib.mjs';
const { ok, done } = T(); const S = src(MACH);
ok(!/data-ai-workspace="predictions"|data-ai-workspace-pane="predictions"|id="aiRiskChart"|function aiActionText|function aiDrawChart|function aiCopyBrief|agn-v84-ai-js/.test(S), 'P16 static: the Predictions panes, the template advice, the trajectory chart and the copy-advisory are deleted');
ok(!/Rule based preview over live or fallback weather fields|demo · not validated|<small>Review<\/small><b>Human required<\/b>|<span>Human reviewed<\/span>/.test(S), 'P16 static: no demo source text and no review badges');
const br = await browser();
for (const op of [false, true]) { const o = await open(br, '/analyst'); await consoleReady(o.pg, op); await place(o.pg); await tab(o.pg, 'airisk', 6000);
  const r = await o.pg.evaluate(() => ({ tabs: [...document.querySelectorAll('#aiWorkspaceTabs [data-ai-workspace]')].map((b) => b.textContent), txt: document.querySelector('.view[data-view="airisk"]').innerText }));
  ok(r.tabs.length === 1 && /AI Analyst/.test(r.tabs[0]), 'P16 ' + (op ? 'operator' : 'client') + ': one AI workspace (the Analyst)', JSON.stringify(r.tabs));
  ok(!/\bPlanned\b|Watchlist|Model Lab|Human reviewed|Human required|Predictions & explainability/.test(r.txt), 'P16 ' + (op ? 'operator' : 'client') + ': no Planned / Watchlist / Model Lab / review wording', (r.txt.match(/.{0,60}(Planned|Watchlist|Model Lab|Human re).{0,40}/) || [''])[0]);
  ok(o.errs.length === 0, 'P16 no page error', o.errs.join(' | ')); await o.ctx.close(); }
await br.close(); done();
