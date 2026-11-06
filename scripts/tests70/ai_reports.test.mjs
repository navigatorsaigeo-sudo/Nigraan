/* v91.17.70 · Sprint 1 · AI firewall, customer reports and the Sources page (s70/CHANGES_ai_reports.md).
   Runs against the local server after the integrator restarts it:  node nigraan-local/scripts/tests70/ai_reports.test.mjs
   Prints PASS/FAIL lines and exits 1 on any FAIL. Tests what a customer receives: the assistant's answers, the report
   context, the case document, the methods sheet, the Sources page and the client fragments in the served page. */
import { readFileSync } from 'node:fs';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, name, extra) => { if (c) { passes++; console.log('PASS ' + name); } else { fails++; console.log('FAIL ' + name + (extra ? ' :: ' + String(extra).slice(0, 400) : '')); } };
const get = async (p) => { const r = await fetch(BASE + p, { signal: AbortSignal.timeout(90000) }); let j = null; try { j = await r.json(); } catch (_) {} return { status: r.status, json: j }; };
const post = async (p, body) => { const r = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(200000) }); let j = null; try { j = await r.json(); } catch (_) {} return { status: r.status, json: j }; };
/* names that may not reach a customer (data-source decision option 2) */
const NAMED = /\b(PMD|FFD|Pakistan Meteorological Department|airport thermometer)\b/;   // (97) SUPARCO credited by name (CEO 30 Sep)
// was: PMD|SUPARCO|FFD|...;

/* ── 1. the AI number firewall: the board's adversarial strings (seat_ai_ml.md W6, fw_test.mjs) plus Urdu ──────────── */
const days = ['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'];
const facts = { askedUnits: [{ name: 'Gilgit', district: 'Gilgit', elevM: 1500,
  forecast: { runId: 'run-7', days: days.map((d, i) => ({ date: d, tmax: +(27.4 - i * 0.3).toFixed(1), tmin: +(12.1 + (i % 3) * 0.4).toFixed(1), rainMm: [0, 0, 0.4, 1.2, 0, 0, 0][i], gustKmh: 22 + i })) },
  outlook: days.map((d, i) => ({ date: d, tx40: { chance_pct: 0 }, tn0: { chance_pct: i > 4 ? 4 : 0 }, pr10: { chance_pct: [0, 2, 6, 12, 4, 0, 0][i] }, pr25: { chance_pct: 0 }, pr50: { chance_pct: 0 }, gu60: { chance_pct: 0 } })) }],
  hazardVerdicts: [{ unit: 'Gilgit', hazard: 'flood', score: 31, band: 'Low', verdictClass: 'Monitor' }] };
const adversarial = [
  'There is a 25% chance of a flood in Gilgit this week.',
  'The 1 in 50 year flood level could be reached.',
  'Expect a one-in-fifty-year flood; losses could reach ten million rupees.',
  'Rainfall will be about double the seasonal normal.',
  'The flood risk in Gilgit is High.',
  'Temperatures will reach 31 C on Saturday.',
  'Temperatures will reach 30 C on Saturday.',
  'Flood risk for Gilgit is Act.',
  'The probability of a GLOF is 12%.',
  'گلگت میں درجہ حرارت ۳۰ ڈگری تک پہنچ جائے گا۔',          /* Urdu digits ۳۰ */
  'سیلاب کا امکان ٢٥ فیصد ہے۔',                             /* Arabic-Indic digits ٢٥, "percent", "chance" */
  'سیلاب کا پچاس فیصد امکان ہے۔',                           /* "fifty percent chance", spelled out in Urdu */
  'Gilgit sees a once in a century flood.',
  'There is a {fact:askedUnits[0].outlook[3].pr10.chance_pct}% chance of a flood.',   /* a real rain chance mislabelled as a flood chance */
  'The return period of this rain is {fact:askedUnits[0].forecast.days[3].rainMm} years.',
];
for (const t of adversarial) {
  const r = await post('/api/ai/firewall', { answer: t, facts });
  const blocked = r.status === 200 && r.json && r.json.removed >= 1 && /\[Removed/.test(r.json.text || '');
  ok(blocked, 'firewall blocks: ' + t, r.json && r.json.text);
}
/* two sentences in one line, the second after the Urdu full stop, are judged separately */
{ const r = await post('/api/ai/firewall', { answer: 'Gilgit is dry this week۔ درجہ حرارت ۳۰ ہے۔', facts });
  ok(r.json && r.json.removed === 1 && /Gilgit is dry this week/.test(r.json.text || ''), 'Urdu full stop splits sentences; only the one with a digit goes', r.json && r.json.text); }
/* no bare integer passes any more (the old firewall passed 22 of 0-100 on this pack) */
{ let passed = []; for (let k = 0; k <= 100; k++) { const r = await post('/api/ai/firewall', { answer: 'Value ' + k + ' here.', facts }); if (!(r.json && r.json.removed)) passed.push(k); }
  ok(passed.length === 0, 'no integer 0-100 typed by the model passes (was 22 of 101)', passed.join(',')); }
/* slot rendering: a token is filled by code from the facts */
{ const r = await post('/api/ai/firewall', { answer: 'The maximum on {fact:askedUnits[0].forecast.days[1].date} is {fact:askedUnits[0].forecast.days[1].tmax} °C, and rain of at least {fact:askedUnits[0].forecast.days[3].rainMm} mm has a {fact:askedUnits[0].outlook[3].pr10.chance_pct}% chance of rain.', facts });
  ok(r.json && r.json.removed === 0 && /2026-09-27/.test(r.json.text) && /27\.1 °C/.test(r.json.text) && /12% chance of rain/.test(r.json.text), 'slot tokens are rendered from the facts', r.json && r.json.text); }
{ const r = await post('/api/ai/firewall', { answer: 'The flood risk in Gilgit is Low.', facts });
  ok(r.json && r.json.removed === 0, 'a class the facts carry for that hazard stands', r.json && r.json.text); }
{ const r = await post('/api/ai/firewall', { answer: 'The maximum is {n99999} °C.', facts });
  ok(r.json && r.json.removed === 1, 'an unknown slot token is removed, not guessed', r.json && r.json.text); }

/* ── 2. local by default, cloud by opt-in ──────────────────────────────────────────────────────────────────────── */
{ const r = await get('/api/ai/status'); const s = r.json || {};
  ok(r.status === 200 && s.localByDefault === true && s.firewall && /slot/.test(s.firewall.numbers || ''), 'AI status: local by default, slot firewall declared', JSON.stringify(s).slice(0, 300));
  ok(s.mode !== 'llm' || s.local === true || s.cloudOptIn === true, 'a cloud model is used only with the opt-in', JSON.stringify(s).slice(0, 300)); }

/* ── 3. the assistant's facts and answers carry no internal-reference material ─────────────────────────────────── */
{ const r = await get('/api/ai/evidence?prompt=' + encodeURIComponent('temperature in Gilgit tomorrow'));
  const f = (r.json && r.json.facts) || {}; const t = JSON.stringify(f);
  ok(r.status === 200 && !/"stationLakeNotes"|"nationalVerification"|"station_guard"/.test(t), 'AI facts pack: no station-lake notes, no reanalysis verification, no airport guard', (t.match(/"(stationLakeNotes|nationalVerification|station_guard)"/) || [])[0]);
  ok(!NAMED.test(t), 'AI facts pack names no internal reference', (t.match(new RegExp('.{0,60}' + NAMED.source + '.{0,60}')) || [])[0]); }
{ const r = await post('/api/ai/chat', { prompt: 'temperature in Gilgit tomorrow', context: {} });
  const a = (r.json && (r.json.answer || '')) + ' ' + JSON.stringify((r.json && r.json.sources) || []);
  ok(r.status === 200 && r.json && r.json.answer, 'AI chat answers', r.status + ' ' + JSON.stringify(r.json).slice(0, 200));
  ok(!NAMED.test(a) && !/test month|RMSE/.test(a), 'AI answer: no internal reference, no reanalysis error line', a.slice(0, 300));
  ok(!r.json || r.json.provider === 'retrieval' || (r.json.firewall && r.json.firewall.slots === true), 'an LLM answer carries the slot-firewall flag the client requires', JSON.stringify(r.json && r.json.firewall)); }

/* ── 4. the Sources page ────────────────────────────────────────────────────────────────────────────────────────── */
{ let r = await get('/api/sources');
  if (!(r.json && r.json.entries)) { const v1 = await get('/api/v1/sources'); ok(false, 'GET /api/sources', v1.json && v1.json.entries ? 'the handler answers at /api/v1/sources but server.mjs does not forward /api/sources: add it to the forward list' : 'status ' + r.status); r = v1; }
  else ok(true, 'GET /api/sources');
  const S = r.json || {}; const E = S.entries || [];
  ok(E.length && E[0].id === 'mach' && /AGN/.test(E[0].attribution || ''), 'Sources: MACH (AGN) listed first', E[0] && JSON.stringify(E[0]).slice(0, 200));
  const wf = E.find(e => e.id === 'weather_feed');
  ok(wf && /CC BY 4\.0/.test(wf.licence) && /Open-Meteo/.test(wf.attribution || ''), 'Sources: the weather feed credited by name under CC BY 4.0', wf && JSON.stringify(wf).slice(0, 200));
  const need = ['copernicus_dem', 'esa_worldcover', 'esri_io_lulc', 'ghsl', 'open_buildings', 'hydrosheds', 'glofas', 'era5', 'cams', 'imerg', 'sentinel1', 'sentinel2', 'viirs', 'rgi', 'hmaglofdb'];
  const miss = need.filter(id => !E.some(e => e.id === id));
  ok(!miss.length, 'Sources: every open layer named in the brief is listed', miss.join(', '));
  /* (71) v71: partner_networks (station calibration, lake inventory, river limits used under data-sharing arrangements) has
     url:null by design (no supplier may be named or linked); it must carry the generic dataset and attribution lines instead. */
  const SL = (() => { try { return JSON.parse(readFileSync(new URL('../../data/source-labels.json', import.meta.url), 'utf8')); } catch (_) { return { labels: {} }; } })();
  const bad = E.filter(e => !e.licence || !e.attribution || (e.id !== 'mach' && e.id !== 'partner_networks' && !e.url));
  ok(!bad.length, 'Sources: every entry has a licence, an attribution and a URL (partner_networks: url null by design) (71)', bad.map(e => e.id).join(', '));
  const pn = E.find(e => e.id === 'partner_networks');
  ok(!!pn && pn.url == null && pn.dataset === SL.labels.network && pn.attribution === SL.labels.sourcesLine && !NAMED.test(JSON.stringify(pn)), 'Sources: partner_networks is credited with the generic lines, no link, no supplier name (71)', JSON.stringify(pn).slice(0, 200));
  ok(!E.some(e => e.internalOnly) && !NAMED.test(JSON.stringify(E)), 'Sources: no internal reference on the customer page', E.filter(e => e.internalOnly).map(e => e.id).join(','));
  ok(/^Sources: /.test(S.methodsLine || '') && /Open-Meteo/.test(S.methodsLine), 'Sources: a methods line for every report', (S.methodsLine || '').slice(0, 120)); }

/* ── 5. the report context: forecast basis instead of circular verification; no internal material ──────────────── */
{ const r = await get('/api/report/context?unit=Islamabad'); const C = r.json || {}; const t = JSON.stringify(C);
  ok(r.status === 200 && C.skill && /^[ABC]$/.test(C.skill.tier || '') && !C.skill.internalDiagnostic, 'report: forecast-basis tier on the accuracy page', JSON.stringify(C.skill).slice(0, 200));
  ok(C.skill && (C.skill.tier !== 'A' || (C.skill.mach && C.skill.mach.maeC === undefined && /one figure/.test(C.skill.mach.accuracy || ''))), 'report: tier A names its MACH station; the one accuracy figure is the place record\'s (v283.28 S6: no second station MAE)', JSON.stringify(C.skill && C.skill.mach));
  ok(!C.metNotes && !C.skillSheet && !(C.skill && C.skill.national), 'report: no station-lake notes, no skill-sheet reference, no national grade', Object.keys(C).join(','));
  ok(C.sources && /^Sources(: | and licences: )/.test(C.sources.line || ''), 'report: the methods note carries the sources line (v91.17.283.12: a loopback caller gets the customer wording unless it asks for the operator view)', JSON.stringify(C.sources).slice(0, 120));
  ok(!NAMED.test(t), 'report context names no internal reference', (t.match(new RegExp('.{0,80}' + NAMED.source + '.{0,80}')) || [])[0]); }
{ const r = await get('/api/report/context?unit=Gilgit'); const t = JSON.stringify(r.json || {});
  ok(r.status === 200 && !NAMED.test(t) && !/"metNotes"/.test(t), 'mountain report context (Gilgit) names no internal reference and carries no station-lake notes', (t.match(new RegExp('.{0,80}' + NAMED.source + '.{0,80}')) || [])[0]); }

/* ── 6. the case document: no "validated" verdict on a risk card ────────────────────────────────────────────────── */
{ const L = await get('/api/case/project'); const P = ((L.json && L.json.projects) || [])[0];
  if (!P) ok(true, 'case document: no project on this server (skipped)');
  else { const pj = await get('/api/case/project?id=' + encodeURIComponent(P.projectId)); const A = ((pj.json && pj.json.document && pj.json.document.assets) || [])[0];
    const d = A ? await get('/api/case/document?project=' + encodeURIComponent(P.projectId) + '&asset=' + encodeURIComponent(A.asset_id || A.name)) : { json: null };
    const cards = (d.json && d.json.riskCards) || []; const t = JSON.stringify(cards);
    ok(cards.length && !cards.some(k => 'validated' in k), 'case risk cards carry no validated verdict', cards.filter(k => 'validated' in k).map(k => k.id + ':' + k.validated).join(','));
    ok(!NAMED.test(t), 'case risk cards name no internal reference', (t.match(new RegExp('.{0,80}' + NAMED.source + '.{0,80}')) || [])[0]);
    ok(d.json && d.json.sources && /^Sources: /.test(d.json.sources.line || ''), 'case document carries the sources line'); } }

/* ── 7. methods sheet, IDF and operations labels ───────────────────────────────────────────────────────────────── */
{ const r = await get('/api/skill'); const t = JSON.stringify(r.json || {});
  ok(r.status === 200 && !NAMED.test(t) && !/"verified"/.test(t) && !/rainfall_idf|reanalysis_reference/.test(t), 'methods sheet: no internal reference, no verified flag, no IDF or reanalysis-as-truth entry', (t.match(new RegExp('.{0,60}(' + NAMED.source + '|"verified"|rainfall_idf).{0,60}')) || [])[0]); }
{ const r = await get('/api/skill?parameter=rainfall_idf'); ok(r.status === 404, 'methods sheet: the retracted IDF entry is not served', r.status); }
{ const r = await get('/api/idf'); const t = JSON.stringify(r.json || {});
  /* (71) v71: /api/idf is published again (stationData()), withheld: no gauge holds 3 complete years. No table, no supplier name,
     no MACH claim, the generic network credit as the source. */
  const SLi = (() => { try { return JSON.parse(readFileSync(new URL('../../data/source-labels.json', import.meta.url), 'utf8')); } catch (_) { return { labels: {} }; } })();
  ok(r.json && r.json.published === true && r.json.ok === false && r.json.withheld === true && /^WITHHELD/.test(r.json.why || '') && !NAMED.test(t) && !/MACH(?! forecast)|AGN's own/.test(t) && !Object.keys(r.json.stations || {}).length && r.json.source === SLi.labels.mountainNetwork, 'IDF: published but withheld: no table, generic credit, no supplier name (71)', t.slice(0, 200)); }
{ const r = await get('/api/ops/health'); const t = JSON.stringify(r.json || {});
  ok(r.status === 200 && !/\b(PMD)\b/.test(t), 'operations board names no agency', (t.match(/.{0,60}\b(PMD|SUPARCO)\b.{0,60}/) || [])[0]); }

/* ── 8. the client fragments in the served page ─────────────────────────────────────────────────────────────────── */
{ const r = await fetch(BASE + '/analyst?backend=' + encodeURIComponent(BASE + '/px') + '&integration=auto', { signal: AbortSignal.timeout(60000) }); const H = await r.text();
  const block = (id) => { const m = H.match(new RegExp('<script id="' + id + '"[^>]*>([\\s\\S]*?)</script>')); return m ? m[1] : null; };
  ok(!!block('agn-sources-js') && /\/api\/sources/.test(block('agn-sources-js') || ''), 'client: the Sources page is in the served build');
  ok(/Client number firewall/.test(H) && /AGNX\.aiMayEmit\(_kind\)/.test(H), 'client: aiMayEmit is wired into the answer path (it had no caller)');
  const mine = ['agn-report-plus-js', 'agn-obs-js', 'agn-sources-js', 'agn-crossings-js'].map(block).filter(Boolean).join('\n');
  ok(mine.length > 0 && !/\b(PMD|FFD)\b/.test(mine), 'client report / observations / operations fragments name no agency', (mine.match(/.{0,80}\b(PMD|SUPARCO|FFD)\b.{0,80}/) || [])[0]);
  ok(!/Station seen 1\.82|6\.03 → 2\.40|2\.15 -> 1\.57/.test(mine), 'client: no hard-coded skill figures in the correction card');
  ok(/data-sources="1"/.test(block('agn-report-plus-js') || ''), 'client: every report gets the sources line in its methods note'); }

console.log('\n' + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
