import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.267 · AI Decision tab: operator material is operator view only.
     node scripts/tests267/ai_client.test.mjs [baseUrl]        default http://127.0.0.1:8787
   Drives the served page in Chromium (CSP enforced, 1600x1000), client view (html without .agn-operator) and operator view.
   Client: the Analyst header line, LOCATION / WEATHER / HAZARD SIGNAL chips, suggestion chips, the four command cards and the
   input box are visible; the "NIGRAAN AI models / What runs in this dashboard" card, "Engine numbers behind the answers",
   the EVIDENCE Linked and REVIEW Human required chips and the "Language model + NIGRAAN data" badge are not.
   Operator: all of them are present and rendered (the models card is built after /api/ai/status answers).
   Zero page errors and zero CSP violations in both views. PASS/FAIL lines; exit 1 on any FAIL. */
import { createRequire } from 'node:module'; import { existsSync } from 'node:fs';
const BASE = (process.argv[2] || process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787').replace(/\/$/, '');
const PWP = __T.playwrightUrl() || 'playwright';
const pw = await __T.playwright(); const chromium = (pw.default || pw).chromium;
const exe = process.env.PW_CHROME || __T.chromiumPath();
let pass = 0, fail = 0; const ok = (c, n, d) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (d != null ? ' · ' + String(d).slice(0, 400) : '')); };
const browser = await __T.launch(chromium, existsSync(exe) ? { executablePath: exe, args: ['--no-sandbox'] } : { args: ['--no-sandbox'] });
const json = (r, status, body) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
/* /api/ai/status answers as with a language model configured, so the badge would read "Language model + NIGRAAN data" */
const STATUS = { ok: true, configured: true, provider: 'test', mode: 'llm', models: { temperature: { live: true, does: 'corrects the forecast temperature for local terrain and land cover', where: 'mountains and plains', badge: 'shown as AI-corrected' },
  analyst: { runs: 'answers questions from NIGRAAN data', model: 'test-model', reachable: true }, planned: [] } };
async function open(operator) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(String(e.message || e).slice(0, 240)));
  await page.addInitScript(op => { document.addEventListener('securitypolicyviolation', e => { (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI); });
    try { if (op) localStorage.setItem('agn.operator.v1', '1'); else localStorage.removeItem('agn.operator.v1'); } catch (_) {} }, operator);
  await page.route('**/api/ai/status*', r => json(r, 200, STATUS));
  await page.goto(BASE + '/analyst' + (operator ? '?operator=1' : ''), { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => window.AGN && document.getElementById('nigraanLlmSection'), null, { timeout: 180000 });
  await page.waitForTimeout(8000);
  await page.evaluate(() => { const b = document.querySelector('#machNav button[data-goto="airisk"]'); if (b) b.click(); });
  await page.waitForTimeout(8000);
  /* the operator view can open on another workspace pane; the analyst pane is the one under test */
  await page.evaluate(() => { const t = document.querySelector('#aiWorkspaceTabs [data-ai-workspace="analyst"]'); if (t && document.documentElement.classList.contains('agn-operator')) t.click(); });
  await page.waitForTimeout(1500);
  return { ctx, page, errs };
}
const probe = page => page.evaluate(() => {
  const vis = el => !!(el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  const view = document.querySelector('.view[data-view="airisk"]'), txt = view ? view.innerText : '';
  const chips = [...document.querySelectorAll('#nigraanLlmSection .ai-context-strip > span')].filter(vis).map(s => s.innerText.replace(/\s+/g, ' ').trim());
  return { op: document.documentElement.classList.contains('agn-operator'), active: vis(view),
    models: vis(document.getElementById('agnAiModelsTop')), modelsBuilt: !!document.querySelector('#agnAiModelsTop ul li'),
    quant: vis(document.getElementById('aiQuantSection')), badge: vis(document.getElementById('nigraanLlmStatus')), badgeText: (document.getElementById('nigraanLlmStatus') || {}).textContent || '',
    header: vis(document.getElementById('nigraanLlmTitle')) && vis(document.querySelector('#nigraanLlmSection .llm-head p')), chips,
    cards: [...document.querySelectorAll('#nigraanLlmSection .llm-prompts button')].filter(vis).length,
    input: vis(document.getElementById('nigraanLlmInput')) && vis(document.getElementById('nigraanLlmSend')), thread: vis(document.getElementById('nigraanLlmThread')),
    words: ['What runs in this dashboard', 'NIGRAAN AI models', 'Engine numbers behind the answers', 'Human required', 'Language model + NIGRAAN data'].filter(w => txt.indexOf(w) >= 0),
    csp: (window.__csp || []).length };
});
/* client */
{
  const { ctx, page, errs } = await open(false); const p = await probe(page);
  ok(!p.op && p.active, 'client view, AI Decision tab open');
  ok(!p.models && !p.quant && !p.badge, 'client: models card, engine numbers and the language-model badge are hidden', JSON.stringify({ models: p.models, quant: p.quant, badge: p.badge }));
  ok(p.chips.length === 3 && /^Location/i.test(p.chips[0]) && /^Weather/i.test(p.chips[1]) && /^Hazard signal/i.test(p.chips[2]), 'client: only the LOCATION / WEATHER / HAZARD SIGNAL chips', p.chips.join(' | '));
  ok(p.words.length === 0, 'client: no operator wording in the AI Decision tab', p.words.join(', '));
  ok(p.header && p.cards === 4 && p.input && p.thread, 'client: Analyst header line, four command cards, input box and answer thread visible', JSON.stringify({ header: p.header, cards: p.cards, input: p.input, thread: p.thread }));
  /* suggestion chips under an answer stay for clients */
  await page.route('**/api/ai/chat', r => json(r, 200, { answer: 'Clean answer for the test.', followUps: ['Rain tomorrow?'], suggestions: ['Rain tomorrow?'], provider: 'retrieval', kind: 'explanation' }));
  await page.evaluate(() => { const i = document.getElementById('nigraanLlmInput'); i.value = 'forecast for the next 7 days'; document.getElementById('nigraanLlmForm').dispatchEvent(new Event('submit', { cancelable: true })); });
  await page.waitForTimeout(4000);
  const ans = await page.evaluate(() => { const a = [...document.querySelectorAll('#nigraanLlmThread article.assistant')].pop(); return a ? a.innerText : ''; });
  ok(/Clean answer for the test\./.test(ans), 'client: the answer is shown', ans.slice(0, 160));
  ok(errs.length === 0, 'client: zero page errors', errs.slice(0, 3).join(' | '));
  ok(!(await page.evaluate(() => (window.__csp || []).length)), 'client: zero CSP violations');
  await ctx.close();
}
/* operator */
{
  const { ctx, page, errs } = await open(true); const p = await probe(page);
  ok(p.op && p.active, 'operator view, AI Decision tab open');
  ok(p.models && p.modelsBuilt && p.quant && p.badge && /Language model \+ NIGRAAN data/.test(p.badgeText), 'operator: models card (built), engine numbers and the badge are shown', JSON.stringify({ models: p.models, built: p.modelsBuilt, quant: p.quant, badge: p.badgeText }));
  ok(p.chips.length === 4 && p.chips.some(c => /Evidence\s*Linked/i.test(c)) && !p.chips.some(c => /Review\s*Human required/i.test(c)), 'operator: EVIDENCE chip shown (v283.28 P16: the review badge is removed with the Predictions tab)', p.chips.join(' | '));
  ok(p.header && p.cards === 4 && p.input, 'operator: the client controls are there too');
  ok(errs.length === 0, 'operator: zero page errors', errs.slice(0, 3).join(' | '));
  ok(!p.csp, 'operator: zero CSP violations');
  await ctx.close();
}
await browser.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
