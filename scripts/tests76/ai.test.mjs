import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.76 · A · 09 AI Decision: lead-time scoring, place resolution, the four Analyst commands, the AI models card, the
   Watchlist, the week question (UX audit v91.17.75 B-01, B-02, B-03, B-12, B-13, B-36, B-37, B-38; CEO decision 1).
     node scripts/tests76/ai.test.mjs [baseUrl]        default http://127.0.0.1:8787
   A · offline, no language model in this box: server/api/ai.mjs with a stand-in OpenAI-compatible model on a loopback port
       (the scripts/tests75/stub-llm.mjs pattern). The four chips are answered by code in LLM mode too (zero model calls),
       four different answers; the week facts; the operator-only held-out figures.
   B · the served API: ordinary words are not places (B-02), the v54 guard and the Karachi split-city rule still hold, the
       chips answer four ways with no key-file path, the national week answer is in PKT with a window, the models block.
   C · the page (Playwright): the models card first on every 09 pane with the error figures operator-only, no engineering
       text, the Predictions score and tiles computed from the lead's hour for every hazard, greyed leads for standing
       hazards, B-37 tiles, the four chips, the week question, the Watchlist, the AI-corrected badge, zero page errors.
   PASS/FAIL lines; exit 1 on any FAIL. */
import { createRequire as __agnCR } from 'node:module'; import { pathToFileURL as __agnP2U } from 'node:url'; import { existsSync as __agnEx } from 'node:fs';
/* v91.17.255 · B-7 · Windows: Playwright from the app's node_modules, the bundled browser when the Linux one is absent, file URLs for absolute imports */
const __agnPW = __T.playwrightUrl() || 'playwright';
const __agnChrome = (p) => (p && __agnEx(p)) ? p : undefined;
const __agnImp = (p) => import(/^([A-Za-z]:)?[\\/]/.test(String(p)) ? __agnP2U(String(p)).href : p);
import { readFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv.slice(2).find(a => /^https?:/.test(a)) || 'http://127.0.0.1:8787';
const DATA = process.env.NIGRAAN_DATA_DIR || join(HERE, '..', '..', 'data');
const PW = process.env.PW_MODULE || __agnPW;
const CHROME = process.env.PW_CHROME || __agnChrome(__T.chromiumPath());
let fails = 0, passes = 0;
const ok = (c, name, detail) => { if (c) passes++; else fails++; console.log((c ? 'PASS ' : 'FAIL ') + name + (detail != null ? ' · ' + String(detail).replace(/\s+/g, ' ').slice(0, 300) : '')); };
const WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
const ENG = /ai\.key|nigraan-local\\|Governed numbers|connector configured|Operational use requires|LOCAL RETRIEVAL|NO LANGUAGE MODEL/;
const getJ = async (p) => { const r = await fetch(BASE + p, { headers: { 'Sec-Fetch-Site': 'same-origin' } }); return r.json(); };
const postJ = async (p, b) => { const r = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', 'Sec-Fetch-Site': 'same-origin' }, body: JSON.stringify(b) }); return r.json(); };
const CHIPS = { explain: 'Explain the current top risk and its main drivers.', compare: 'Compare the selected location with another high-risk district.', brief: 'Prepare a concise executive climate briefing.', evidence: 'What evidence is missing before an operational advisory?' };
const ONLY = process.env.P76_ONLY || '';   /* e.g. P76_ONLY=C runs the page section alone */
const VILLAGES = /\bTop\b[^\n]{0,40}Bajaur|\bMain\b[^\n]{0,40}Mansehra|Bajaur Agency/;

/* ═══ A · offline ═══ */
if (!ONLY || ONLY.includes('A')) {
  const [dn, gn, fn] = await Promise.all([getJ('/api/climatology/drought'), getJ('/api/glof/national'), getJ('/api/flood/national?day=0')]);
  const fc = JSON.parse(readFileSync(join(DATA, 'pk-tehsils.json'), 'utf8'));
  const tehsil = fc.features.map((f) => { const p = f.properties; return { unitId: p.uid, key: p.key, name: p.tehsil, district: p.district, province: p.province, disputed: /Occupied/i.test(p.province || ''), lat: 33.7, lon: 73.0 }; });
  let calls = 0;
  const fake = createServer((req, res) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.url.endsWith('/models')) return res.end(JSON.stringify({ object: 'list', data: [{ id: 'stub:1b', object: 'model' }] }));
    calls++; res.end(JSON.stringify({ choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'The dashboard facts describe the conditions for this place.\nBased on: dashboard' } }], usage: {} })); }); });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  Object.assign(process.env, { NIGRAAN_AI_PROVIDER: 'ollama', NIGRAAN_AI_BASE: 'http://127.0.0.1:' + fake.address().port + '/v1', NIGRAAN_AI_MODEL: 'stub:1b', NIGRAAN_AI_KEY: 'ollama', NIGRAAN_DATA_DIR: DATA });
  const { createAI } = await import('../../server/api/ai.mjs');
  const floodDays = (d) => Object.assign({}, fn, { date: fn.date, rows: (fn.rows || []).map((r) => (d === 2 && r === fn.rows[0]) ? Object.assign({}, r, { class: 'Watch', level: 'Moderate', levelIndex: 2 }) : r) });   /* v91.17.226 · audit D-18: the server serves the level (5-year flow = Moderate) */
  const app = { dataDir: DATA, units: { tehsil }, store: { all: () => [], find: () => null, filter: () => [], insert: async () => {} },
    verification: { grades: () => ({ summary: null }), guarded: () => null }, climatology: { droughtNational: () => dn }, glof: { national: () => gn },
    flood: { national: (d) => floodDays(Number(d) || 0) }, provider: { call: async () => { throw new Error('offline test'); } } };
  const ai = createAI(app, mkdtempSync(join(tmpdir(), 'p76-')));
  const isb = tehsil.find((u) => u.name === 'Islamabad') || tehsil[0], other = tehsil.find((u) => u.name === 'Kharan') || tehsil[5];
  const lv = (hz, level, i, score, extra) => Object.assign({ hazard: hz, label: hz, level, i, score, na: false, nd: false }, extra || {});
  const IC = { unit: isb.name, place: isb.name, lead: 24, validTo: 'Mon 28 Sep 03:00 PKT',
    levels: [lv('heat', 'Low', 1, 30, { drivers: [{ label: 'Wet-bulb stress', value: '30', note: '24.1°C wet-bulb' }, { label: 'Air-temp stress', value: '12', note: 'vs 35.1°C local 90th pct' }], trajectory: [6, 12, 24, 48, 72].map((l, k) => ({ lead: l, level: k < 2 ? 'Normal' : 'Low', score: 10 + k * 5 })) }),
      lv('flood', 'Normal', 0, 5), lv('wind', null, null, null, { nd: true, why: 'no gust value for this unit' }), lv('glof', null, null, null, { na: true })],
    tehsil: [lv('drought', 'Low', 1, 30), lv('heat', 'Normal', 0, 9), lv('flood', 'Normal', 0, 3, { drivers: [{ label: 'Riverine pathway', value: '0', note: 'no gauge upstream — river state unknown' }] })],
    compareWith: { unit: other.name, district: other.district, province: other.province, hazard: 'drought', level: 'Severe', levels: [lv('drought', 'Severe', 4, 90, { drivers: [{ label: 'SPEI-90', value: '-2.1', note: 'extreme' }] }), lv('heat', 'Low', 1, 28), lv('flood', 'Normal', 0, 0)] },
    nationalTop: { rows: [{ hazard: 'drought', label: 'Drought', level: 'Severe', tehsils: 5, worst: other.name, district: other.district }] },
    window72: { tmax: 32.4, tmin: 19.9, rain: 7.9, gustMax: 31, aiCorrected: true },
    gaps: { ensembleLive: false, hourlyLoaded: true, aiCorrected: true, readiness: { scenario: false, management: true, ai: false, spatial: true, horizon: true, financial: false, issuable: false }, readinessWhy: 'no client asset' } };
  const ans = {};
  for (const [k, q] of Object.entries(CHIPS)) ans[k] = (await ai.chat({ prompt: q, context: { location: isb.name }, intentContext: IC }, {})).json;
  ok(calls === 0 && Object.values(ans).every((j) => j.provider === 'retrieval' && j.firewall && j.firewall.slots === true), 'A1 LLM mode: the four chips are answered by code (0 model calls) and pass the client firewall check', 'model calls ' + calls);
  const heads = Object.values(ans).map((j) => String(j.answer).slice(0, 300));
  ok(new Set(heads).size === 4, 'A2 four chips, four different answers (first 300 characters)', heads.map((h) => h.slice(0, 50)).join(' | '));
  ok(/the highest level is heat — Low \(index 30\/100\)/i.test(ans.explain.answer) && /Wet-bulb stress: 30/.test(ans.explain.answer) && /12 h Normal/.test(ans.explain.answer) && /cannot occur here: glof/i.test(ans.explain.answer), 'A3 Explain: the top level, its drivers, how it moves over 6-72 h, the other hazards', ans.explain.answer.split('\n').slice(0, 2).join(' | '));
  ok(new RegExp('^Compare ' + isb.name + '.* with ' + other.name).test(ans.compare.answer) && /highest level in Pakistan today, drought Severe/i.test(ans.compare.answer) && /Hazard\s+/.test(ans.compare.answer), 'A4 Compare names the second, higher-risk tehsil from the sweep and prints both columns', ans.compare.answer.split('\n').slice(0, 2).join(' | '));
  ok(/^Executive brief — /.test(ans.brief.answer) && /Headline: heat Low/i.test(ans.brief.answer) && /Across Pakistan: the highest level today is Severe/.test(ans.brief.answer) && /\(AI-corrected\)/.test(ans.brief.answer), 'A5 Brief: headline, next 72 h, the place, the national picture', ans.brief.answer.split('\n').slice(0, 4).join(' | '));
  ok(/does not have yet:/.test(ans.evidence.answer) && /1\. wind: no reading/i.test(ans.evidence.answer) && /ensemble spread/i.test(ans.evidence.answer) && /River: no gauge upstream/.test(ans.evidence.answer) && /Decision case: no scenario run/.test(ans.evidence.answer) && !/10 Result|financial estimate/.test(ans.evidence.answer), 'A6 (v266) Evidence lists the gaps that exist: no-reading hazards, river gauge, ensemble spread, the open decision-case items (no 10 Result tab, no financial item) · was: the open 10 Result items', ans.evidence.answer.split('\n').slice(0, 4).join(' | '));
  ok(Object.values(ans).every((j) => !VILLAGES.test(j.answer) && !ENG.test(j.answer) && !/\bMinimal\b|\bMonitor\b/.test(j.answer)), 'A7 no village called Top or Main, no key-file path, no Minimal/Monitor in any chip answer');
  const noCtx = (await ai.chat({ prompt: CHIPS.compare, context: { location: isb.name } }, {})).json;
  ok(/not attached/.test(noCtx.answer) && calls === 0, 'A8 without the page\'s levels Compare says what is missing instead of inventing a district', noCtx.answer.split('\n')[0]);
  const st = await ai.status(), stR = await ai.status({ loopback: false });
  ok(st.models && st.models.temperature && st.models.temperature.heldOut && st.models.temperature.heldOutOperatorOnly === true && !stR.models.temperature.heldOut, 'A9 CEO decision 1: held-out figures flagged operator-only and withheld from a non-loopback caller');
  ok(st.models.temperature.does && /live in|not live/.test(st.models.temperature.where || '') && /badge/.test(st.models.temperature.badge || '') && st.models.analyst && st.models.analyst.runs, 'A10 the models block says what the correction does, where it runs and what the Analyst runs', st.models.temperature.where);
  fake.close();
  /* retrieval mode: the week question */
  for (const k of ['NIGRAAN_AI_PROVIDER', 'NIGRAAN_AI_BASE', 'NIGRAAN_AI_MODEL', 'NIGRAAN_AI_KEY']) delete process.env[k];
  const ai2 = createAI(app, mkdtempSync(join(tmpdir(), 'p76r-')));
  const wkq = 'What is the flood risk in Pakistan this week?';
  const nc = { lead: 24, day: '27 Sep 03:00 PKT', hazards: {}, week: { window: { from: '2026-09-27', to: '2026-09-30', days: 4, missing: ['2026-10-01', '2026-10-02', '2026-10-03'] }, hazards: { flood: { counts: { Normal: 570, Low: 4, Moderate: 1, High: 0, Severe: 0 }, cannotOccur: 1, noData: 0, worst: [{ tehsil: 'Daghoni', district: 'Ghanche', level: 'Moderate', peakDay: '2026-09-29' }] } } } };
  const w1 = (await ai2.chat({ prompt: wkq, context: { location: 'Islamabad' } }, {})).json;
  ok(w1.needNational && w1.needNational.days === 7 && w1.needNational.layers.includes('flood'), 'A11 a week question asks the page for its forecast days (needNational.days = 7)', JSON.stringify(w1.needNational));
  const w2 = (await ai2.chat({ prompt: wkq, context: { location: 'Islamabad' }, nationalContext: nc }, {})).json; const a2 = String(w2.answer || '');
  ok(/this week \(as of \d{1,2} \w{3} \d{2}:\d{2} PKT\)/.test(a2) && !/UTC/.test(a2) && /Flood \(worst level in the window Sun 27 Sep to Wed 30 Sep \(4 forecast days\)\): Normal 570 · Low 4 · Moderate 1/.test(a2) && /Daghoni \(Ghanche\) Moderate on Tue 29 Sep/.test(a2) && /No engine forecast for Thu 1 Oct/.test(a2), 'A12 the week answer: the window in Pakistan days, the worst level per tehsil with its day, the days no engine holds, PKT not UTC', a2.split('\n').slice(0, 5).join(' | '));
  ok(/Rivers \(\d+ reaches, worst level in the window/.test(a2) && /Moderate on/.test(a2) && !/\bMonitor\b|\bWatch\b|\bAct\b/.test(a2.replace(/engine level \w+/g, '')), 'A13 river reaches over the week on the level words (a reach at the 5-year flow on day 3 reads Moderate, the map word)', (a2.match(/Rivers[^\n]*/) || [''])[0]);
}

/* ═══ B · the served API ═══ */
if (!ONLY || ONLY.includes('B')) {
  const ev = async (q) => (await getJ('/api/ai/evidence?prompt=' + encodeURIComponent(q) + '&location=Islamabad')).facts || {};
  const e1 = await ev(CHIPS.explain);
  ok(!e1.askedPlace && !e1.askedPlaceUnresolved && (e1.placeResolution || []).filter((t) => t.skipped).length >= 2, 'B1 B-02: "the current top risk and its main drivers" names no place (ordinary words skipped)', (e1.placeResolution || []).map((t) => t.candidate + (t.skipped ? '(skip)' : '')).join(','));
  const e2 = await ev('flood risk in Top');
  ok(!!(e2.askedPlace && /^Top$/i.test(e2.askedPlace.name)), 'B2 a place clearly named ("in Top") still resolves', e2.askedPlace && e2.askedPlace.whereThisIs);
  const e3 = await ev('What is the flood outlook for Lahore City in the next 24 hours? One short paragraph.');
  ok(!e3.askedPlace && !e3.askedPlaceUnresolved && !!(e3.askedUnits && /Lahore City/.test(e3.askedUnits[0].name)), 'B3 the v54 guard holds: "One short paragraph" is not a place; Lahore City is', (e3.askedUnits || []).map((u) => u.name).join(','));
  const e4 = await ev('smog in Karachi');
  ok(!!(e4.askedPlace && /Karachi/.test(String(e4.askedPlace.whereThisIs || ''))), 'B4 the Karachi split-city rule holds', e4.askedPlace && e4.askedPlace.whereThisIs);
  const e5 = await ev('naran temp');
  ok(!!(e5.askedPlace && /Naran/.test(e5.askedPlace.name)), 'B5 a lowercase place name that is not an English word still resolves ("naran temp")', e5.askedPlace && e5.askedPlace.whereThisIs);
  const A = {}; for (const [k, q] of Object.entries(CHIPS)) A[k] = await postJ('/api/ai/chat', { prompt: q, context: { location: 'Islamabad' } });
  ok(new Set(Object.values(A).map((j) => String(j.answer).slice(0, 200))).size === 4 && Object.values(A).every((j) => j.intent && !VILLAGES.test(j.answer) && !ENG.test(j.answer)), 'B6 served chips: four intents, four answers, no village, no engineering text', Object.values(A).map((j) => j.intent + ':' + String(j.answer).slice(0, 40)).join(' | '));
  const n = await postJ('/api/ai/chat', { prompt: 'What is the flood risk in Pakistan this week?', context: { location: 'Islamabad' } }); const na = String(n.answer || '');
  ok(/this week \(as of .* PKT\)/.test(na) && !/UTC/.test(na) && /worst level in the window/.test(na) && n.needNational && n.needNational.days === 7, 'B7 B-38 served: a week answer in PKT with a window; the page is asked for its days', na.split('\n').slice(0, 3).join(' | '));
  const typed = await postJ('/api/ai/chat', { prompt: 'temperature in Lahore', context: { location: 'Islamabad' } });
  /* v91.17.266 · the look-up note is provenance: it travels in notes / sourceChips marked operatorOnly, not in the answer */
  ok(!ENG.test(String(typed.answer)) && !/computed, not generated/.test(String(typed.answer)) && (typed.notes || []).some((x) => /computed, not generated/.test(x)) && (typed.sourceChips || []).every((c) => c.operatorOnly === true), 'B8 B-13 (v266): the answer carries no method note; the look-up note is an operator-only chip', String(typed.answer).split('\n').slice(-1)[0]);
  const st = await getJ('/api/ai/status');
  ok(st.models && st.models.temperature && st.models.temperature.heldOutOperatorOnly === true && st.models.temperature.does && st.models.analyst && st.models.analyst.runs, 'B9 /api/ai/status: what runs, where, and the operator-only flag on the held-out figures', st.models && st.models.temperature && st.models.temperature.where);
}

/* ═══ C · the page ═══ */
if (!ONLY || ONLY.includes('C')) {
const _pw = await __T.playwright(); const chromium = _pw.chromium || (_pw.default && _pw.default.chromium);
const browser = await __T.launch(chromium, { executablePath: CHROME, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-zygote', '--single-process', '--disable-extensions', '--disable-background-networking', '--js-flags=--max-old-space-size=900'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(90000);
  const perr = []; page.on('pageerror', (e) => perr.push(String(e && e.message).slice(0, 200)));
  let dl = null; page.on('download', (d) => { dl = d; });
  await page.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 180000 });
  const ready = await page.waitForFunction(() => !!(window.AGN && AGN.p76 && AGN.p75 && AGN.hz5 && typeof selectCity === 'function'), null, { timeout: 180000 }).then(() => true).catch(() => false);
  ok(ready, 'C0 page loaded with the v76 AI block');
  await page.waitForTimeout(22000);
  await page.evaluate(() => document.getElementById('agn-tab-airisk').click()); await page.waitForTimeout(2000);
  const pane = async (t) => { await page.evaluate((t) => document.querySelector('[data-ai-workspace="' + t + '"]').click(), t); await page.waitForTimeout(1200); };
  /* v91.17.266 · 02 Predictions and 03 Explainability are one operator view; the workspace tabs are operator only (clients have the Analyst) */
  const opSet = (on) => page.evaluate((on) => AGN.operator.set(on), on).then(() => page.waitForTimeout(600));
  /* C1 · the AI models card */
  const cardOn = [];
  await opSet(true);
  for (const t of ['analyst']) { await pane(t);   /* v91.17.283.28 (owner, P16): the duplicate Predictions pane is dropped */   /* v91.17.277 · the hidden watch pane is removed (L9) */ cardOn.push(await page.evaluate(() => { const c = document.getElementById('agnAiModelsTop'), n = document.getElementById('aiWorkspaceTabs'); if (!c || !n) return null; const r = c.getBoundingClientRect(); return { vis: r.height > 40 && getComputedStyle(c).display !== 'none', first: !!(c.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING), y: Math.round(r.top + scrollY) }; })); }
  ok(cardOn.every((c) => c && c.vis && c.first), 'C1 B-12: "NIGRAAN AI models" is its own card above the 09 sub-tabs, visible on the Analyst pane (operator view; the Predictions pane is dropped in v283.28)', JSON.stringify(cardOn));
  await opSet(false); await pane('analyst');
  await page.waitForFunction(() => /AI temperature correction/.test((document.getElementById('agnAiModelsTop') || {}).innerText || ''), null, { timeout: 90000 }).catch(() => {});
  const card = await page.evaluate(() => { const c = document.getElementById('agnAiModelsTop'); const t = c.innerText; document.documentElement.classList.add('agn-operator'); const t2 = c.innerText; document.documentElement.classList.remove('agn-operator'); return { t, t2 }; });
  ok(/AI temperature correction/.test(card.t) && /(live|not live)/.test(card.t) && /AI-corrected/.test(card.t) && !/\d\.\d\d\s*→/.test(card.t), 'C2 CEO decision 1: customers read what the correction does and where it runs, not the error figures', card.t.slice(0, 160));
  /* v91.17.283 · the customer page no longer receives the AI held-out figures at all (by design), so C3 loads the operator page */
  { const op = page;   /* the same page (the browser runs single-process: a second page closes it), then back to the customer page */
    await op.goto(BASE + '/analyst?operator=1', { waitUntil: 'domcontentloaded', timeout: 180000 });
    await op.waitForFunction(() => !!(window.AGN && AGN.p76 && document.getElementById('agn-tab-airisk')), null, { timeout: 180000 }).catch(() => {});
    await op.waitForTimeout(8000);
    await op.evaluate(() => { document.getElementById('agn-tab-airisk').click(); }); await op.waitForTimeout(1500);
    await op.evaluate(() => { const b = document.querySelector('[data-ai-workspace="analyst"]'); if (b) b.click(); }); await op.waitForTimeout(1200);
    await op.waitForFunction(() => /\d\.\d\d\s*→\s*\d\.\d\d/.test((document.getElementById('agnAiModelsTop') || {}).innerText || ''), null, { timeout: 90000 }).catch(() => {});
    const t3 = await op.evaluate(() => (document.getElementById('agnAiModelsTop') || {}).innerText || '');
    ok(/\d\.\d\d\s*→\s*\d\.\d\d/.test(t3), 'C3 the operator page (/analyst?operator=1) shows the held-out figures', (t3.match(/held-out[^\n]*/) || [t3.slice(0, 160)])[0]);
    await page.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => !!(window.AGN && AGN.p76 && AGN.p75 && AGN.hz5 && typeof selectCity === 'function'), null, { timeout: 180000 }).catch(() => {});
    await page.waitForTimeout(22000);
    await page.evaluate(() => document.getElementById('agn-tab-airisk').click()); await page.waitForTimeout(2000);
    await opSet(false); }   /* ?operator=1 is remembered by the page: back to the customer view for C4 on */
  await pane('analyst');
  const txt09 = await page.evaluate(() => document.querySelector('.view[data-view="airisk"]').innerText);
  ok(!ENG.test(txt09), 'C4 B-12/B-13: no "NO LANGUAGE MODEL" banner, key-file path, governed-number list or "connector configured" on 09 in the customer view', (txt09.match(ENG) || [''])[0]);
  /* C5-C13 retired in v91.17.283.28 (owner, P16): the Predictions sub-tab repeated Overview / Forecast and is dropped with its tiles, lead
     buttons, template advice and trajectory chart; the levels it showed are the served levels the Overview and Forecast tabs print */
  await opSet(true);
  const predGone = await page.evaluate(() => !document.querySelector('[data-ai-workspace="predictions"],[data-ai-workspace-pane="predictions"],#aiPredSection'));
  ok(predGone, 'C5 v283.28: no Predictions pane on AI Decision (it repeated Overview / Forecast)');
  /* C14 · the four chips */
  await pane('analyst'); await opSet(false);
  const chip = async (k) => { const n0 = await page.evaluate(() => document.querySelectorAll('#nigraanLlmThread .llm-message.assistant').length);
    await page.evaluate((k) => { const b = [...document.querySelectorAll('[data-llm-prompt]')].find((x) => x.getAttribute('data-llm-prompt').toLowerCase().startsWith(k)); b.click(); }, k);
    await page.waitForFunction((n0) => { const a = [...document.querySelectorAll('#nigraanLlmThread .llm-message.assistant')]; return a.length > n0 && /computed|Written by code|not attached/.test(a[a.length - 1].innerText); }, n0, { timeout: 90000 }).catch(() => {});
    return page.evaluate(() => { const a = [...document.querySelectorAll('#nigraanLlmThread .llm-message.assistant')]; return a[a.length - 1].innerText; }); };
  const P = { explain: await chip('explain'), compare: await chip('compare'), brief: await chip('prepare'), evidence: await chip('what evidence') };
  ok(new Set(Object.values(P).map((t) => t.slice(0, 260))).size === 4, 'C14 B-03: the four chips give four different answers', Object.values(P).map((t) => t.replace(/\s+/g, ' ').slice(0, 60)).join(' | '));
  ok(/the highest level is/.test(P.explain) && !VILLAGES.test(P.explain) && !/It is not part of this answer/.test(P.explain), 'C15 B-02: Explain answers for the selected place, with no village called Top or Main', P.explain.split('\n').slice(1, 3).join(' | '));
  const cm = P.compare.match(/Compare (.+?) with (.+?)[.(]/);
  ok(!!cm && cm[1].trim() !== cm[2].trim() && /Hazard/.test(P.compare), 'C16 B-03: Compare names a second tehsil from the national sweep and puts them side by side', cm ? cm[1] + ' vs ' + cm[2] : P.compare.slice(0, 120));
  ok(/does not have yet/.test(P.evidence) && !/10 Result/.test(P.evidence) && /^Executive brief/m.test(P.brief), 'C17 B-03: Evidence lists what is missing (no stale 10 Result line, v266); Brief is a brief', P.evidence.split('\n').slice(1, 4).join(' | '));
  ok(Object.values(P).every((t) => !ENG.test(t)), 'C18 B-13: no engineering text in the chip answers');
  /* C19 · B-38 · the week question (after the national forecast sweep has landed: the week is read from it) */
  const swept = await page.waitForFunction(() => { const d = window.machDataState; return !!(d && d.total && (d.liveCount || 0) / d.total >= 0.95); }, null, { timeout: 240000 }).then(() => true).catch(() => false);
  if (!swept) console.log('NOTE the national forecast sweep did not land in 240 s (provider slow or refused): C19 and C22 check the honest "not scored yet" states instead');
  const n0 = await page.evaluate(() => document.querySelectorAll('#nigraanLlmThread .llm-message.assistant').length);
  await page.evaluate(() => { const i = document.getElementById('nigraanLlmInput'); i.value = 'What is the flood risk in Pakistan this week?'; document.getElementById('nigraanLlmForm').requestSubmit(); });
  await page.waitForFunction((n0) => { const a = [...document.querySelectorAll('#nigraanLlmThread .llm-message.assistant')]; return a.length > n0 && /tehsils/.test(a[a.length - 1].innerText); }, n0, { timeout: 120000 }).catch(() => {});
  const wk = await page.evaluate(() => { const a = [...document.querySelectorAll('#nigraanLlmThread .llm-message.assistant')]; return a[a.length - 1].innerText; });
  ok(/this week \(as of .* PKT\)/.test(wk) && !/UTC/.test(wk) && /Rivers \(\d+ reaches, worst level in the window/.test(wk)
     && (swept ? /Flood \(worst level in the window [A-Z][a-z]{2} \d+ \w{3} to [A-Z][a-z]{2} \d+ \w{3}/.test(wk) : /Flood: not scored for the week yet/.test(wk)),
     'C19 B-38: "flood risk in Pakistan this week" answers from the forecast days in PKT (page engine and river reaches)' + (swept ? '' : ' [sweep not loaded: the page hazard says so]'), (wk.match(/Flood[ :(][^\n]*/) || [wk.slice(0, 160)])[0]);
  /* C20-C24 (the Watchlist pane) retired in v91.17.277: the pane was hidden since v91.17.244 and is removed with its code (FIX277 L9) */
  /* C25 · the AI-corrected badge and the corrected card request */
  const bd = await page.evaluate(async () => { const s = STATIONS.find((x) => x.name === 'Faisalabad') || STATIONS.find((x) => x.name === 'Multan'); if (!s) return null; selectCity(s.id, true);
    for (let i = 0; i < 90; i++) { await new Promise((r) => setTimeout(r, 1000)); const b = document.getElementById('p76CcAi'); if (b) return { name: s.name, badge: b.textContent, t: document.getElementById('ccTemp').textContent }; }
    return { name: s.name, badge: null, served: AGN.p75 && AGN.p75.served ? AGN.p75.served().slice(-2) : null }; });
  ok(!!(bd && /^AI-corrected( [+−±]\d+\.\d °C)?$/.test(bd.badge || '')), 'C25 B-12: the card at a plains city carries "AI-corrected" with the size of the correction (the card now requests cloud cover and no pinned model)', JSON.stringify(bd));
  ok(perr.length === 0, 'C26 no page errors', perr.slice(0, 3).join(' | '));
} finally { await browser.close(); }
}
console.log('\n' + passes + ' PASS, ' + fails + ' FAIL');
process.exit(fails ? 1 : 0);
