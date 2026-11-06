import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.75 · P · the AI Analyst and Predictions tabs on the one hazard scale (CEO list B1, B3-B7, C1, C2).
     node scripts/tests75/ai_predictions.test.mjs [baseUrl]        default http://127.0.0.1:8787
   A · the model pack, offline (no language model needed): server/api/ai.mjs is loaded with the server's own national tables
       (read from baseUrl) and a stand-in OpenAI-compatible model on a loopback port. The national drought question
       ("paksitan") gets a national pack (counts per level, arid units apart, worst ten, date), no dashboard selection, no
       "Screening not loaded" / "Clear" / "Minimal"; the model is shown the slotted pack and the NATIONAL rule; a number the
       model types is removed and a slot is filled by code.
   B · the served API: the same question answered by retrieval leads with the national block.
   C · the page (Playwright): Gilgit, Lahore, Karachi; every hazard of every sector in the Predictions dropdown; the 6h and
       72h buttons; the folded Engine-numbers line; the context chip; the national question typed into the AI Analyst; the
       Current-conditions AI line; the "NIGRAAN AI models" panel; zero page errors.
   PASS/FAIL lines; exit 1 on any FAIL. */
import { readFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv.slice(2).find(a => /^https?:/.test(a)) || 'http://127.0.0.1:8787';
const DATA = process.env.NIGRAAN_DATA_DIR || join(HERE, '..', '..', 'data');
const PW = __T.playwrightUrl() || 'playwright';
const CHROME = process.env.PW_CHROME || __T.chromiumPath();
let fails = 0, passes = 0;
const ok = (c, name, detail) => { if (c) passes++; else fails++; console.log((c ? 'PASS ' : 'FAIL ') + name + (detail != null ? ' · ' + String(detail).slice(0, 300) : '')); };
const STALE = /Screening not loaded|\bClear\b|\bminimal\b/i;
const WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
const getJ = async (p) => { const r = await fetch(BASE + p, { headers: { 'Sec-Fetch-Site': 'same-origin' } }); return r.json(); };

/* ═══ A · the model pack, offline ═══ */
{
  const [dn, gn, fn] = await Promise.all([getJ('/api/climatology/drought'), getJ('/api/glof/national'), getJ('/api/flood/national?day=0')]);
  const fc = JSON.parse(readFileSync(join(DATA, 'pk-tehsils.json'), 'utf8'));
  const tehsil = fc.features.map((f) => { const p = f.properties; return { unitId: p.uid, key: p.key, name: p.tehsil, tehsil: p.tehsil, district: p.district, province: p.province, disputed: /Occupied/.test(p.province), lat: null, lon: null }; });
  let seen = null;   /* the request the stand-in model received */
  let reply = '';
  const fake = createServer((req, res) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.url.endsWith('/models')) return res.end(JSON.stringify({ data: [{ id: 'fake:1b' }] }));
    seen = JSON.parse(b || '{}');
    res.end(JSON.stringify({ choices: [{ message: { content: reply }, finish_reason: 'stop' }], usage: {} })); }); });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  const port = fake.address().port;
  Object.assign(process.env, { NIGRAAN_AI_PROVIDER: 'ollama', NIGRAAN_AI_BASE: 'http://127.0.0.1:' + port + '/v1', NIGRAAN_AI_MODEL: 'fake:1b', NIGRAAN_AI_KEY: 'ollama', NIGRAAN_DATA_DIR: DATA });
  const { createAI, slotPack } = await import('../../server/api/ai.mjs');
  const app = { dataDir: DATA, units: { tehsil }, store: { all: () => [], find: () => null, filter: () => [], insert: async () => {} },
    verification: { grades: () => ({ summary: null }), guarded: () => null }, climatology: { droughtNational: () => dn }, glof: { national: () => gn }, flood: { national: () => fn } };
  const ai = createAI(app, mkdtempSync(join(tmpdir(), 'p75-')));
  const stale = { location: 'Gilgit', condition: 'Clear', riskBand: 'Screening not loaded', riskScore: '—', driver: '—' };
  const ev = (await ai.evidence({ prompt: 'drought condition in paksitan', context: stale })).json;
  const N = ev.facts.national, D = N && N.hazards && N.hazards.drought;
  ok(!!N && N.scope === 'Pakistan', 'A1 "drought condition in paksitan" is a national question', N && N.scope);
  ok(!ev.facts.dashboard && !ev.facts.selectedUnit && !ev.facts.askedPlaceUnresolved, 'A2 the dashboard selection is not in a national pack', ev.keys.join(','));
  const lv = D && D.levels ? D.levels.map((x) => x.level) : [];
  const tot = D && D.levels ? D.levels.reduce((a, x) => a + x.tehsils, 0) + D.indexNotDefined.tehsils + (D.noData || 0) : 0;
  ok(JSON.stringify(lv) === JSON.stringify(WORDS) && tot === N.tehsils && tot >= 570, 'A3 drought counts per level on the v74 scale cover every scored tehsil', (D && D.levels.map((x) => x.level + ' ' + x.tehsils).join(' · ')) + ' · arid ' + (D && D.indexNotDefined.tehsils) + ' · of ' + (N && N.tehsils));
  ok(D && D.indexNotDefined.tehsils > 0 && /not defined/i.test(D.indexNotDefined.why), 'A4 arid units are counted apart as "index not defined"', D && D.indexNotDefined.tehsils);
  ok(D && D.worst.length > 0 && D.worst.length <= 10 && D.worst.every((w) => WORDS.includes(w.level) && w.tehsil), 'A5 the worst tehsils carry a level', D && D.worst.slice(0, 3).map((w) => w.tehsil + ' ' + w.level).join('; '));
  ok(D && /^\d{4}-\d{2}-\d{2}/.test(String(D.asOf)), 'A6 the pack carries the date', D && D.asOf);
  ok(!STALE.test(JSON.stringify(ev.facts)), 'A7 no "Screening not loaded", "Clear" or "Minimal" in the national pack');
  for (const q of ['drought in Pakstan', 'national heat', 'drought in Sindh', 'hazards across the country']) {
    const e = (await ai.evidence({ prompt: q, context: stale })).json;
    ok(!!e.facts.national, 'A8 national scope recognised: "' + q + '"', e.facts.national && (e.facts.national.scope + ' · ' + Object.keys(e.facts.national.hazards).join(',') + ' · page: ' + (e.facts.national.awaitingPage || []).join(',')));
  }
  const loc = (await ai.evidence({ prompt: 'temperature here', context: stale })).json;
  ok(!STALE.test(JSON.stringify(loc.facts.dashboard || {})) && loc.facts.dashboard && loc.facts.dashboard.skyNow, 'A9 a local question: the stale fallback is dropped and the sky is not a "condition"', JSON.stringify(loc.facts.dashboard));
  /* the model call: the slotted pack and the rules it is shown */
  const pk = slotPack(ai.compact(ev.facts));
  const sev = [...pk.slots.values()].find((s) => /national\.hazards\.drought\.levels\[4\]\.tehsils/.test(s.path));
  reply = 'Across Pakistan, {' + (sev ? sev.id : 'n0') + '} tehsils are at the Severe drought level. Drought is Severe in 7 tehsils. Drought is Minimal in most places.\nBased on: national';
  const ch = (await ai.chat({ prompt: 'drought condition in paksitan', context: stale }, {})).json;
  const sys = seen && seen.messages && seen.messages[0].content, usr = seen && seen.messages && seen.messages[1].content;
  ok(!!sys && /NATIONAL\. If `national` is present/.test(sys) && /Never call a hazard Minimal or Clear/.test(sys), 'A10 the model is told to lead with the national block and never to use Minimal/Clear');
  ok(!!usr && /"national":/.test(usr) && /\{n\d+\} 5/.test(usr) && !/Screening not loaded|"condition"/.test(usr), 'A11 the model reads the slotted national pack and no stale screen text', usr && usr.slice(0, 160));
  ok(!!sev && ch.answer.includes(sev.value + ' tehsils are at the Severe drought level'), 'A12 the slot is filled by code from the pack', ch.answer.split('\n')[0]);
  ok(/\[Removed: a number the model wrote itself/.test(ch.answer) && /\[Removed: a hazard class/.test(ch.answer), 'A13 a typed number and a retired class word are removed by the firewall', ch.answer.replace(/\n/g, ' ').slice(0, 260));
  fake.close();
}

/* ═══ B · the served API (retrieval) ═══ */
{
  const r = await fetch(BASE + '/api/ai/chat', { method: 'POST', headers: { 'content-type': 'application/json', 'Sec-Fetch-Site': 'same-origin' }, body: JSON.stringify({ prompt: 'drought condition in paksitan', context: { location: 'Gilgit', condition: 'Clear', riskBand: 'Screening not loaded' } }) });
  const j = await r.json(); const a = String(j.answer || '');
  ok(/^Pakistan — \d+ tehsils/.test(a) && /Drought \(as of \d{4}-\d{2}-\d{2}\): Normal \d+ · Low \d+ · Moderate \d+ · High \d+ · Severe \d+/.test(a), 'B1 the answer leads with the national drought counts and the date', a.split('\n').slice(0, 3).join(' | '));
  ok(/Worst: /.test(a) && !/\bGilgit\b/.test(a) && !STALE.test(a), 'B2 worst tehsils listed; nothing about the selected Gilgit; no stale words');
  const st = await getJ('/api/ai/status');
  ok(st.models && st.models.temperature && Array.isArray(st.models.temperature.heldOut.mountains.tmax) && st.models.analyst && st.models.planned.length === 2, 'B3 /api/ai/status carries the AI models block', JSON.stringify(st.models && st.models.temperature && st.models.temperature.heldOut.mountains));
}

/* ═══ C · the page ═══ */
const _pw = await __T.playwright(); const chromium = _pw.chromium || (_pw.default && _pw.default.chromium);
const browser = await __T.launch(chromium, { executablePath: CHROME, args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
  const perr = []; page.on('pageerror', (e) => perr.push(String(e && e.message).slice(0, 200)));
  await page.goto(BASE + '/analyst', { waitUntil: 'domcontentloaded', timeout: 180000 });
  const ready = await page.waitForFunction(() => !!(window.AGN && AGN.p75 && AGN.hz5 && typeof selectCity === 'function'), null, { timeout: 180000 }).then(() => true).catch(() => false);
  ok(ready, 'C0 page loaded with the v75 AI module');
  await page.waitForTimeout(20000);
  const city = async (c) => { await page.evaluate((c) => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim().startsWith(c)); if (b) b.click(); }, c);
    await page.waitForFunction((c) => window.LIVE_HOURLY && aiState.station && aiState.station.name === c && LIVE_HOURLY[aiState.station.id] && LIVE_HOURLY[aiState.station.id].nowIdx != null, c, { timeout: 60000 }).catch(() => {}); await page.waitForTimeout(1500); };
  const tab = async (t) => { await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find((x) => /^09\s*AI Decision/.test((x.textContent || '').trim())); if (b) b.click(); }); await page.waitForTimeout(600);
    await page.evaluate((t) => document.querySelector('[data-ai-workspace="' + t + '"]').click(), t); await page.waitForTimeout(900); };
  const read = () => page.evaluate(() => { const g = (id) => { const e = document.getElementById(id); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; };
    const r = aiState.last && aiState.last.r; const hz = aiState.hazard;
    /* the expected level from the map's own function (map_ui AGN.hz5.levelOf), independent of the v75 module */
    let exp = null; if (r) { const cat = r.categorical === true; const na = r.notApplicable === true || r.noDataClass === 'ineligible' || r.noDataClass === 'undefined';
      const L = AGN.hz5.levelOf(hz, cat ? r.mapValue : (r.screeningIndex != null ? r.screeningIndex : r.score), { category: cat ? (r.category != null ? r.category : r.screeningBand) : null, notApplicable: na, noData: !!r.noData && !na, provisional: !!r.provisional });
      exp = L.na ? 'NA' : L.nd ? 'ND' : AGN.hz5.words[L.i]; }
    return { hz, ring: g('aiRiskScore'), band: g('aiBand'), note: g('aiBandNote'), prob: g('aiProb'), lead: g('aiLeadLabel'), sum: g('aiSummary'), brief: g('aiBriefText'),
      m: [1, 2, 3, 4].map((i) => g('aiM' + i + 'Label') + '=' + g('aiM' + i) + ' (' + g('aiM' + i + 'Note') + ')').join(' | '), scen: g('aiScenarios'), exp }; });
  const setSel = (id, v) => page.evaluate(({ id, v }) => { const s = document.getElementById(id); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, { id, v });

  for (const c of ['Gilgit', 'Lahore', 'Karachi']) {
    await city(c); await tab('predictions');
    const sectors = await page.evaluate(() => [...document.querySelectorAll('#aiSectorSel option')].map((o) => o.value));
    const seenHz = new Set(); const bad = []; let checked = 0, withLevel = 0;
    for (const sec of sectors) {
      await setSel('aiSectorSel', sec); await page.waitForTimeout(500);
      const hzs = await page.evaluate(() => [...document.querySelectorAll('#aiHazardSelect option')].map((o) => o.value));
      for (const hz of hzs) {
        if (seenHz.has(hz)) continue; seenHz.add(hz);
        await setSel('aiHazardSelect', hz); await page.waitForTimeout(700);
        const r = await read(); checked++;
        const txt = [r.ring, r.band, r.note, r.prob].join(' | ');
        if (r.exp && r.exp !== 'ND') { withLevel++;
          if (/Not scored/.test(txt)) bad.push(hz + ': "Not scored" beside an engine level ' + r.exp);
          if (r.exp === 'NA') { if (!/Cannot occur here|Index not defined/i.test(r.band)) bad.push(hz + ': band ' + r.band + ' for a not-applicable unit'); }
          else { if (!r.band.toLowerCase().startsWith(r.exp.toLowerCase())) bad.push(hz + ': band "' + r.band + '" but the engine level is ' + r.exp);
            if (!r.prob.toLowerCase().startsWith(r.exp.toLowerCase())) bad.push(hz + ': risk card "' + r.prob + '" but the engine level is ' + r.exp);
            if (r.ring === '—' || r.ring === '') bad.push(hz + ': empty ring for level ' + r.exp); } }
        if (STALE.test(txt + ' ' + r.sum)) bad.push(hz + ': stale word in "' + txt.slice(0, 120) + '"');
        if (/null out of 100/.test(r.sum)) bad.push(hz + ': "null out of 100" in the summary');
        if (hz === 'glof' && r.exp !== 'NA') {
          if (/S 0\.\d|reach 0\.\d|add up to|expert register|Gil_gl|\(Monitor from/.test(r.m + ' ' + r.brief)) bad.push('glof: internals on a card: ' + r.m.slice(0, 200));
          if (/Lakes growing[^|]*=—/i.test(r.m) || !/(None growing|\d+ growing) in the latest reads/.test(r.m)) bad.push('glof: the lakes-growing card is empty: ' + r.m.slice(-120));
          if (/Not scored/.test(r.scen)) bad.push('glof: Explainability says Not scored');
          if (c === 'Gilgit') ok(/glacial lakes? drains? towards Gilgit; nearest: .+ \((priority|elevated|inventory)\), \d+ km upstream/.test(r.m), 'C1 ' + c + ' · the GLOF card says it plainly', r.m.split(' | ')[0]);
        }
      }
    }
    ok(bad.length === 0 && checked >= 10, 'C2 ' + c + ' · every Predictions hazard (' + checked + ' across the sectors, ' + withLevel + ' with an engine level) shows the engine level on the ring, band and risk card; no "Not scored", no stale word', bad.slice(0, 4).join(' ;; ') || [...seenHz].join(','));

    /* B5 · the horizon buttons, clicked with the mouse, for a forecast hazard and two standing ones */
    await setSel('aiSectorSel', 'agriculture'); await page.waitForTimeout(400);
    for (const hz of ['flood', 'glof', 'drought']) {
      await setSel('aiHazardSelect', hz); await page.waitForTimeout(600);
      const click = async (L) => { const bx = await page.locator('#aiLeadSeg [data-lead="' + L + '"]').boundingBox(); await page.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2); await page.waitForTimeout(900); return read(); };
      const a = await click('6'), b = await click('72');
      const modal = await page.evaluate(() => { const x = document.getElementById('agnBackendClose'); const m = x && x.closest('.open'); return !!m; });
      if (modal) await page.keyboard.press('Escape');
      const changed = a.sum !== b.sum || a.note !== b.note || a.m !== b.m;
      ok(/^6h/.test(a.lead) && /^72h/.test(b.lead) && changed && !modal, 'C3 ' + c + ' · ' + hz + ' · 6h then 72h: the window label and the values move', a.lead + ' → ' + b.lead + ' · ' + (a.note !== b.note ? 'note changed' : a.sum !== b.sum ? 'summary changed' : 'cards changed') + (modal ? ' · MODAL OPENED' : ''));
      await click('24');
    }

    /* B6 + B7 */
    await tab('analyst'); await page.waitForTimeout(1500);
    const hd = await page.evaluate(() => ({ sum: (document.getElementById('aiQuantSummary') || {}).textContent || '', chip: (document.getElementById('llmContextRisk') || {}).textContent || '', panes: [...document.querySelectorAll('[data-ai-workspace-pane]')].map((x) => x.innerText).join('\n') }));
    ok(new RegExp('^[^,]+, next 24 h: (all hazards (Normal|Low|Moderate|High|Severe)|.+, others (Normal|Low|Moderate|High|Severe))').test(hd.sum.trim()) && !/co-equally|operational class/.test(hd.sum), 'C4 ' + c + ' · the folded Engine-numbers header is one plain line', hd.sum);
    ok(/^[A-Z][\w /()-]*: (Normal|Low|Moderate|High|Severe|Cannot occur here)/.test(hd.chip.trim()) && !/^0 ·|minimal/i.test(hd.chip), 'C5 ' + c + ' · the context chip reads hazard: level', hd.chip);
    const staleLines = hd.panes.split('\n').filter((l) => /\bMinimal\b|Screening not loaded|Not scored — no band/i.test(l));
    ok(staleLines.length === 0, 'C6 ' + c + ' · no Minimal / Screening not loaded / "Not scored — no band" in the four AI panes', staleLines.slice(0, 3).join(' ;; '));
  }

  /* B1 · the national question typed into the AI Analyst (retrieval here; the pack itself is tested in A) */
  const ask = async (q) => { await page.fill('#nigraanLlmInput', q); await page.click('#nigraanLlmSend');
    const t0 = Date.now(); let last = '';
    while (Date.now() - t0 < 90000) { await page.waitForTimeout(1500); last = await page.evaluate(() => { const m = [...document.querySelectorAll('#nigraanLlmThread .llm-message.assistant')]; return m.length ? m[m.length - 1].innerText : ''; }); if (/Pakistan — /.test(last)) break; }
    return last; };
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find((x) => /^09\s*AI Decision/.test((x.textContent || '').trim())); if (b) b.click(); });
  const a1 = await ask('drought condition in paksitan');
  ok(/Pakistan — \d+ tehsils/.test(a1) && /Drought \(as of [\d-]+\): Normal \d+ · Low \d+ · Moderate \d+ · High \d+ · Severe \d+ · Drought index not defined \(arid climate\) \d+/.test(a1) && /Worst: /.test(a1), 'C7 the national drought question is answered nationally (counts, arid apart, worst, date)', a1.split('\n').slice(0, 4).join(' | ').slice(0, 280));
  ok(!STALE.test(a1) && !/dashboard indicates|Gilgit/.test(a1), 'C8 the answer carries no stale screen text and nothing about the selected unit');
  const a2 = await ask('hazards across the country');
  ok(/\nHeat \(as of [^)]+\): Normal \d+/.test(a2) && /\nFlood \(as of/.test(a2) && !/Not in this answer yet/.test(a2), 'C9 an all-hazard national question: the page attaches its engine\'s national levels (needNational round trip)', (a2.match(/\n(Heat|Flood|Wind)[^\n]*/g) || []).slice(0, 3).join(' | ').slice(0, 280));

  /* C1 · the AI local correction line: present exactly when the served forecast for the card's point carries it */
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,a')].find((x) => /^02\s*Forecast/.test((x.textContent || '').trim())); if (b) b.click(); });
  const cc = [];
  for (const c of ['Gilgit', 'Lahore', 'Karachi', 'Faisalabad']) {
    await city(c); await page.waitForTimeout(1500);
    /* the card's own forecast, and one with the model inputs (the served path applies the correction only with them) */
    const r = await page.evaluate(async (c) => {
      const s = STATIONS.find((x) => x.name === c);
      const u = 'https://api.open-meteo.com/v1/forecast?latitude=' + s.lat + '&longitude=' + s.lon + '&current=temperature_2m&hourly=temperature_2m,cloud_cover,wind_speed_10m,precipitation&forecast_days=3&timezone=auto';
      try { const rr = await AGN.api.fetch(u, { cache: 'no-store' }); await rr.clone().json(); } catch (_) {}
      await new Promise((r) => setTimeout(r, 1500));
      const sv = AGN.p75.served().find((x) => Math.abs(x.lat - s.lat) < 1e-3 && Math.abs(x.lon - s.lon) < 1e-3);
      return { line: (document.getElementById('ccAiLocal') || {}).textContent || null, served: sv ? { c: sv.correction, ai: !!(sv.aiLocal && sv.aiLocal.applied !== false) } : null };
    }, c);
    cc.push(c + ': ' + (r.served ? r.served.c : 'no forecast') + ' → ' + (r.line || 'no line'));
    const want = !!(r.served && (r.served.ai || /AI/.test(r.served.c || '')));
    ok(want ? /^AI local correction: [+−]?\d+\.\d °C \(terrain and land cover; today: day [+−]?[\d.]+ °C, night [+−]?[\d.]+ °C\)$|^AI local correction applied/.test(r.line || '') : !r.line, 'C10 ' + c + ' · the Current-conditions AI line follows the served forecast', cc[cc.length - 1]);
  }
  ok(cc.some((x) => /AI → AI local correction/.test(x)), 'C11 at least one test city is served with the AI correction and shows the line', cc.join(' ; '));

  /* C2 · the models panel */
  await tab('analyst');
  const mp = await page.evaluate(() => (document.getElementById('agnAiModels') || {}).innerText || '');
  const L = JSON.parse(readFileSync(join(DATA, 'source-labels.json'), 'utf8')).forbiddenInCustomerOutput || [];
  const named = L.filter((t) => new RegExp('(?<![\\p{L}\\p{N}_])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{N}_])', 'u').test(mp));
  ok(/NIGRAAN AI models/.test(mp) && /AI temperature correction — live in the mountains and plains/.test(mp) && /\d\.\d\d → \d\.\d\d °C/.test(mp) && /AI Analyst/.test(mp) && /Planned — anomaly detection/.test(mp) && named.length === 0, 'C12 the NIGRAAN AI models panel: live zones, held-out result, analyst, planned; no supplier name', mp.replace(/\n/g, ' ').slice(0, 300) + (named.length ? ' · NAMED ' + named.join(',') : ''));

  ok(perr.length === 0, 'C13 no page errors', perr.slice(0, 3).join(' ;; '));
} finally { await browser.close(); }
console.log('\n' + passes + ' PASS, ' + fails + ' FAIL');
process.exit(fails ? 1 : 0);
