/* v91.17.283 · WS4 · wording, claims and scope, item by item. Every check FAILS on v91.17.282.1 (the base tree) and passes after WS4.
   Part 1 (no server): the model gate (owner decisions A and B, evidence-derived, no inheritance), the measured-skill evidence (generated, not
   typed), dead code, site-risk pathway bases, canonical spellings, the report context on a fake app (C10 outlook rows, D13 coast, no Finance).
   Part 2 (one server, mock provider, a FIXTURE engine run laid into a throw-away data folder): the served levels the AI quotes against
   /api/levels/unit at 10 places, heat High / cold Indicative and withheld alerts, pluvial flood hidden, "Not assessed" wording, the accuracy
   answer, the ESG / financial scope answer, no PMD / FFD name on any client surface, map-layer product types, Urdu search, D32 day wording.
   usage: node scripts/tests283/ws4/ws4.test.mjs [--root <tree>]   env WS4_PORT (default 9471). Stops its server on exit. */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { startServer } from './serve.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ai = process.argv.indexOf('--root');
const ROOT = resolve(ai > 0 ? process.argv[ai + 1] : join(HERE, '..', '..', '..'));
const PORT = Number(process.env.WS4_PORT || 9471);
let pass = 0, fail = 0;
const ok = (c, n, d = '') => { d = String(d == null ? '' : d).replace(/\n/g, ' | '); if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + d.slice(0, 260) : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' · ' + d.slice(0, 900) : '')); } };
const J = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const txt = (p) => readFileSync(join(ROOT, p), 'utf8');
const NAMES = /(?<![\w-])(?:PMD|FFD)(?![\w-])|Pakistan Meteorological|Flood Forecasting Division/;

/* ───────────────────────── part 1 · no server ───────────────────────── */
{ /* G · the gate */
  let R = null; try { R = J('data/model-gate.resolved.json'); } catch (_) {}
  const E = R ? Object.fromEntries(R.entries.map((e) => [e.id, e])) : {};
  const u = E.utci || {}, c = E.cold || {}, f = E.flood || {}, lv = (u.resolved || {}).levels || {};
  ok(lv.Moderate && lv.Moderate.canAlert === true && lv.Moderate.productType === 'Forecast', 'G1 decision A: heat Moderate keeps alerts (Forecast), derived from its own evidence', JSON.stringify(lv.Moderate || null));
  ok(lv.High && lv.High.canAlert === false && lv.High.productType === 'Indicative' && lv.Severe && lv.Severe.canAlert === false && lv.Severe.productType === 'Indicative', 'G2 decision A: heat High and Severe Indicative, canAlert false', JSON.stringify({ High: lv.High, Severe: lv.Severe }));
  ok(c.product_type === 'Indicative' && c.resolved && c.resolved.canAlert === false && Object.values(c.resolved.levels || {}).length >= 3 && Object.values(c.resolved.levels).every((v) => !v.canAlert), 'G3 decision A: cold Indicative, no level can alert (untestable: no observed cold-stress day)', JSON.stringify(c.resolved || null).slice(0, 300));
  ok(!(u.baseline_test && u.baseline_test.inherits) && !(c.baseline_test && c.baseline_test.inherits), 'G4 no inheritance: heat and cold carry their own evidence (SCI2821 C6)');
  ok(f.product_type === 'Indicative' && !(f.layers || []).includes('flood_pluvial') && E['flood-pluvial'] && E['flood-pluvial'].client_hidden === true && R.client_rules && R.client_rules.hidden_layers && R.client_rules.hidden_layers.flood_pluvial && R.client_rules.substitute.flood.from === 'flood_riverine',
    'G5 decision B: river flood Indicative; the pluvial layer in its own client-hidden entry; client flood = river flooding', JSON.stringify({ f: f.product_type, cr: R && R.client_rules && Object.keys(R.client_rules) }));
  const lim = (u.client_limitations || []).join(' | ');
  /* v91.17.283.8 HEATSKILL: the heat sentences come from data/evidence/heat2838 (issued level against standard stations, Sindh and Punjab,
     forecast days 1 and 2, with intervals); the numbers are read from that table here, never typed */
  { let EV = null; try { EV = J('data/skill-evidence.json'); } catch (_) {}
    const hl = EV && EV.lines && EV.lines.heat || [];
    ok(hl.length === 2 && hl.every((x) => lim.includes(x)) && /95 % interval \d+–\d+ %/.test(hl[0]) && /not yet verified/.test(hl[0]) && /Sindh and Punjab/.test(hl[0]) && /forecast days 1 and 2/.test(hl[0]) && !/80–85 %|4–8 %/.test(lim) && (c.client_limitations || []).some((x) => /could not be tested/.test(x)),
      'G6 the client limitations carry the generated heat sentences (domain, period, interval, "not yet verified" outside; the unreproduced 80–85 % / 4–8 % is gone; cold untestable)', lim.slice(0, 400)); }
  { const pol = (() => { try { return JSON.parse(readFileSync(process.env.WS2_POLICY, 'utf8')   /* INTEG: data/alert-policy.json retired into the gate; without WS2_POLICY the owner decision A lists below are the reference */).layers; } catch (_) { return { heat: { alertLevels: ['Low', 'Moderate'], indicativeLevels: ['High', 'Severe'] }, cold: { alertLevels: [], indicativeLevels: ['Normal', 'Low', 'Moderate', 'High', 'Severe'] } }; } })();
    const same = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);
    ok(same(u.resolved && u.resolved.alertLevels, pol.heat.alertLevels) && same(u.resolved && u.resolved.indicativeLevels, pol.heat.indicativeLevels) && same(c.resolved && c.resolved.alertLevels, pol.cold.alertLevels) && same(c.resolved && c.resolved.indicativeLevels, pol.cold.indicativeLevels) && lv.Low && lv.Low.ownerDecision === true,
      'G9 WS2 request R2: the gate\u2019s heat / cold alert and indicative levels equal the engine\u2019s alert policy (heat Low by owner decision, recorded as such)', JSON.stringify({ heat: [u.resolved && u.resolved.alertLevels, u.resolved && u.resolved.indicativeLevels], cold: [c.resolved && c.resolved.alertLevels] })); }
  let slim = null; try { slim = J('build/gen/gate.slim.json'); } catch (_) {}
  ok(slim && slim.clientRules && slim.clientRules.hidden_layers && slim.entries.utci.levels && slim.entries.utci.levels.High.canAlert === false && slim.entries.cold.productType === 'Indicative' && slim.entries['flood-pluvial'].clientHidden === true,
    'G7 the page gate (gate.slim.json) carries the per-level rules and the client rules', JSON.stringify(slim ? slim.entries.utci.levels : null));
  /* a changed evidence file makes the gate fail closed (C2) */
  const T = mkdtempSync(join(tmpdir(), 'ws4g-'));
  try { const g = J('data/model-gate.json'); const ent = g.entries.find((e) => e.id === 'utci'); if (ent && ent.evidence) ent.evidence.sha256 = '0'.repeat(64); writeFileSync(join(T, 'g.json'), JSON.stringify(g));
    let out = ''; try { out = execFileSync('python3', [join(ROOT, 'scripts', 'gen', 'gen_gate.py'), '--in', join(T, 'g.json'), '--dry'], { encoding: 'utf8' }); } catch (e) { out = String(e.stdout || ''); }
    let D = null; try { D = JSON.parse(out); } catch (_) {}
    ok(D && D.resolved && D.resolved.utci && D.resolved.utci.canAlert === false && Object.values(D.resolved.utci.levels || {}).every((v) => !v.canAlert), 'G8 an evidence file whose sha256 differs from the entry: heat raises no alert at any level (stale evidence fails closed)', out.slice(0, 200));
  } finally { rmSync(T, { recursive: true, force: true }); }
}
{ /* E · the evidence is generated, never typed */
  let E = null; try { E = J('data/skill-evidence.json'); } catch (_) {}
  const L = E ? [...E.lines.temperature, ...E.lines.heat, ...E.lines.cold].join(' | ') : '';
  ok(/1\.47 °C/.test(L) && /1\.53 °C/.test(L) && /1\.48 °C/.test(L) && /plains off by 1\.30/.test(L) && /mountains 1\.98/.test(L) && /hills 2\.57 °C \(about 2\.1/.test(L), 'E1 temperature lines: Tmax day-1 1.47, Tmin 1.53 (raw 1.48: chain worse), plains 1.30, mountains 1.98, hills 2.57 (bias 2.1)', L.slice(0, 400));
  ok(/94–95 %/.test(L) && /85 % in the hills/.test(L) && /97\.5 % in the mountains/.test(L), 'E2 coverage line: 94–95 % overall, hills 85 %, mountains 97.5 %');
  const T = mkdtempSync(join(tmpdir(), 'ws4e-'));
  try { execFileSync('python3', [join(ROOT, 'scripts', 'gen', 'gen_evidence.py'), join(ROOT, 'data', 'evidence', 'sci2821'), join(T, 'e.json')], { encoding: 'utf8' });
    const G = JSON.parse(readFileSync(join(T, 'e.json'), 'utf8')); ok(E && JSON.stringify(G.lines) === JSON.stringify(E.lines) && JSON.stringify(G.evidence) === JSON.stringify(E.evidence), 'E3 data/skill-evidence.json regenerates byte-for-byte in its lines from the evidence files (no hand-typed figure)');
  } catch (e) { ok(false, 'E3 regenerate the evidence', e.message); } finally { rmSync(T, { recursive: true, force: true }); }
  const sk = txt('server/api/skill.mjs');
  ok(!/Temperature accuracy is checked internally against reference records/.test(sk) && /measured: evidenceForClient\(\)/.test(sk), 'E4 the customer methods sheet no longer makes the unscoped accuracy claim; it carries the generated evidence');
}
{ /* D · dead code (item 7) */
  ok(!/function levelOfScore\(/.test(txt('server/api/ai.mjs')), 'D1 ai.mjs: unused levelOfScore removed');
  ok(!existsSync(join(ROOT, 'server', 'api', 'gazetteer.mjs')) || !/function loadPlaces\(/.test(txt('server/api/gazetteer.mjs')), 'D2 the old gazetteer (and its unused loadPlaces) is gone (v91.17.283.18: server/api/places.mjs)');
  ok(!/import \{[^}]*\bsolarPosition\b/.test(txt('server/api/tdown.mjs')), 'D3 tdown.mjs: unused solarPosition import removed');
  ok(!/import \{[^}]*\blgbEval\b/.test(txt('server/api/wxmos.mjs')), 'D4 wxmos.mjs: unused lgbEval import removed');
}
{ /* P · site-risk pathway cuts (B6) */
  const P = J('data/site-risk-pathways.json');
  ok(P.productType === 'Indicative' && Object.values(P.rules).every((r) => typeof r.basis === 'string' && r.basis.length > 20), 'P1 every site-risk pathway rule names its basis; the pathways are Indicative', Object.keys(P.rules).join(','));
}
{ /* S · one shared credit list: rivers are OpenStreetMap (D14) */
  const R = txt('data/pk-rivers.json').slice(0, 65536);
  ok(/"licence":\[\{"id":"osm"/.test(R), 'S1 data/pk-rivers.json carries the OpenStreetMap licence header in its first 64 kB, so the one credit list (/api/sources methodsLine) credits rivers to OpenStreetMap');
}
{ /* N · one naming function (D17); v91.17.283.18: the spelling and the Urdu names are names of the records of the one place table */
  const PM = await import(pathToFileURL(join(ROOT, 'server', 'api', 'places.mjs')).href);
  const PL = PM.createPlaces({ dataDir: join(ROOT, 'data'), units: { tehsil: J('server/contract/units.json') } });
  const near = (la, lo) => PL.resolvePoint(la, lo);
  const g = await PL.search('Khomar'), h = await PL.search('Khumar Haripur'), k = await PL.search('Khunjrab');
  const gk = g.results.find((r) => r.name === 'Khomar' && r.district === 'Gilgit');
  ok(gk && near(gk.lat, gk.lon).tehsil === gk.tehsil && h.results.some((r) => r.name === 'Khumar' && r.district === 'Haripur') && k.results[0] && /Khunjerab/.test(k.results[0].name),
    'N1 canonical spelling: the Gilgit locality is Khomar (AGN register), Khumar in Haripur keeps its name, Khunjrab -> Khunjerab (' + (gk && gk.name + ', ' + gk.district) + '; ' + (k.results[0] && k.results[0].name) + ')');
  ok(PM.norm('\u0644\u0627\u06be\u0648\u0631') === PM.norm('\u0644\u0627\u06c1\u0648\u0631') && PM.norm('\u0643\u0631\u0627\u0686\u064a') === PM.norm('\u06a9\u0631\u0627\u0686\u06cc'), 'N2 Urdu normalisation folds the Arabic / Urdu letter forms');
}
/* R · the report context on a fake app: C10 outlook rows to the watch list, D13 coast from data, no Finance owner */
{
  let mk = null; try { mk = (await import(pathToFileURL(join(ROOT, 'server', 'api', 'report.mjs')).href)).createReport; } catch (e) { mk = null; }
  const tehs = J('data/pk-tehsils.json').features.map((f) => ({ unitId: f.properties.uid, key: f.properties.key, name: f.properties.tehsil, district: f.properties.district, province: f.properties.province, lat: 25, lon: 67, elevM: 10 }));
  const iso = (n) => new Date(Date.now() + 5 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
  const app = { dataDir: join(ROOT, 'data'), provider: { call: async () => { throw new Error('offline'); } }, units: { tehsil: tehs },
    outlook: { findUnit: (k) => tehs.find((t) => t.unitId === k || t.key === k) || null, unit: () => ({ unit: { elevM: 10 }, events: null }),
      seasonalUnit: () => ({ at: new Date().toISOString(), subseasonal: { weeks: [{ start: iso(14), tAnom: 2, pAnom: 12, pT1: 80, pP10: 60, pP0: 60 }] },
        seasonal: { months: [{ month: iso(0).slice(0, 7), tAnom: 0 }, { month: iso(40).slice(0, 7), tAnom: 1.5, pMean: 80, pAnom: 40 }] } }) },
    smog: { unit: () => null }, seasVerify: { summary: () => ({ logs: { ec46: 3, seas5: 1 }, ec46: {}, seas5: {} }) }, skill: { sheet: () => ({}) }, sources: { methodsLine: () => 'Sources: test' }, gate: null };
  if (mk) {
    const R = mk(app);
    const kar = await R.context({ unit: 'Sindh|South Karachi|Saddar Town', section: 'operations' }, { customer: true });
    const hyd = await R.context({ unit: 'Sindh|Hyderabad|Hyderabad City', section: 'portfolio' }, { customer: true });
    const mit = await R.context({ unit: 'Sindh|Tharparkar|Mithi' }, { customer: true });
    const acts = (kar.actions || []).map((a) => a.hazard), wl = (kar.watch || []).filter((w) => /outlook only, no verified skill yet/.test(w.what));
    ok(!acts.some((h) => /Warm anomaly|^Rain$|Dry spell|\(season\)/.test(h)) && wl.length >= 2, 'R1 audit C10 (P1): weeks-ahead and season rows raise no action without verified skill; they are on the watch list marked "outlook only, no verified skill yet"', 'actions ' + acts.join(',') + ' · watch ' + wl.map((w) => w.hazard).join(','));
    { /* WS2 R1: the outlook blocks' own use block (even a verified outlook stays outlook only) */
      const app2 = { ...app, outlook: { ...app.outlook, seasonalUnit: () => { const s0 = app.outlook.seasonalUnit(); s0.subseasonal.use = { outlookOnly: true, canAlert: false, verifiedSkill: true, why: 'x' }; s0.seasonal.use = { outlookOnly: true, canAlert: false, verifiedSkill: false, why: 'no verified skill yet' }; return s0; } } };
      const c2 = await mk(app2).context({ unit: 'Sindh|South Karachi|Saddar Town' }, { customer: true });
      ok(!(c2.actions || []).some((a) => /Warm anomaly|^Rain$|\(season\)/.test(a.hazard)) && (c2.watch || []).some((w) => /outlook only, skill measured, still an outlook only/.test(w.what)) && (c2.watch || []).some((w) => /outlook only, no verified skill yet/.test(w.what)),
        'R1b WS2 request R1: the use block decides the words; a verified outlook is still never an action'); }
    ok(!JSON.stringify(kar).includes('Finance'), 'R2 scope: no action is owned by Finance (financial content left NIGRAAN)');
    const coast = (x) => (x.standing || []).some((s) => s.id === 'coastal');
    ok(coast(kar) && !coast(hyd) && !coast(mit), 'R3 D13: the storm-surge / coastal measure follows the distance to the sea edge (Karachi Saddar yes; Hyderabad City, Mithi no)', [coast(kar), coast(hyd), coast(mit)].join(','));
    ok(kar.report && kar.report.kind === 'site_assessment' && hyd.report && hyd.report.kind === 'portfolio_screening' && mit.report && mit.report.kind === null && kar.report.language === 'en' && (kar.report.structure || []).some((s) => /^Prescriptive/.test(s)),
      'R4 item 6: a site assessment comes from Operations / Assets, a portfolio screening from Portfolio; no section -> no kind; English only; the report structure is kept', JSON.stringify(kar.report || null).slice(0, 200));
    ok(kar.measuredSkill && kar.measuredSkill.ready && kar.measuredSkill.lines.temperature.length === 3, 'R5 the report context carries the measured out-of-sample evidence lines');
  } else ok(false, 'R0 report.mjs loads');
}

/* ───────────────────────── part 2 · one server ───────────────────────── */
const PLACES = ['Punjab|Lahore|Lahore City', 'Gilgit Baltistan|Gilgit|Gilgit', 'Khyber Pakhtunkhwa|Peshawar|Town-I', 'Balochistan|Quetta|Quetta City', 'Punjab|Multan|Multan City',
  'Punjab|Rawalpindi|Murree', 'Gilgit Baltistan|Skardu|Skardu', 'Sindh|Jacobabad|Jacobabad', 'Sindh|Hyderabad|Hyderabad City', 'Sindh|South Karachi|Saddar Town'];
/* FIXTURE: the stored engine run with levels set at the 10 places (every level word, -1 and -2 among them) and two heat alerts */
const EL = J('data/engine-latest.json');
const now = Date.now(), d0 = new Date(now + 5 * 3600e3).toISOString().slice(0, 10);
EL.received = new Date(now - 10 * 60e3).toISOString(); EL.at = EL.received;
EL.days.forEach((d, i) => { d.date = new Date(Date.parse(d0 + 'T00:00:00Z') + i * 864e5).toISOString().slice(0, 10); });
const PAT = { heat: [3, 4, 2, 1, 0, 3, 2, -1, 4, 2], cold: [0, 1, 2, 0, 3, 2, 3, -1, 0, 0], flood: [3, 0, 2, 0, 1, 3, 0, 1, 2, 0], flood_pluvial: [3, 0, 2, 0, 1, 3, 0, 1, 2, 0], flood_riverine: [1, -2, 0, -2, 1, 0, -2, 1, 2, 0],
  wind: [-2, 1, 0, -2, 0, 1, 2, 0, -1, 0], rain_hz: [0, 1, 2, 0, -1, 2, 1, 0, 0, 3] };
for (const d of EL.days) for (const [k, arr] of Object.entries(PAT)) { const L = d.layers[k]; if (!L) continue; PLACES.forEach((uid, i) => { L.L[uid] = arr[(i + d.day) % arr.length]; }); }
EL.alerts = [{ name: 'Lahore City', district: 'Lahore', hazard: 'heat', alert: 'Heat stress High', sev: 3 }, { name: 'Multan City', district: 'Multan', hazard: 'heat', alert: 'Heat stress Moderate', sev: 2 }];
let S = null;
try { S = await startServer(ROOT, PORT, {}, { 'engine-latest.json': EL }); } catch (e) { ok(false, 'server start', e.message); }
const B = S ? S.base : null;
const get = async (p, cust = true) => { const r = await fetch(B + p, { headers: cust ? { 'x-agn-view': 'customer' } : {} }); return r.json(); };
const chat = async (prompt, extra = {}) => { const r = await fetch(B + '/api/ai/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, ...extra }) }); return r.json(); };
if (B) try {
  /* AI vs API at 10 places (item 8) */
  const R = J('data/model-gate.resolved.json'); const hidden = Object.keys((R.client_rules || {}).hidden_layers || {}), sub = (R.client_rules || {}).substitute || {};
  let same = 0, diff = [], pluv = 0, heatTag = 0, na2 = 0;
  for (const uid of PLACES) {
    const api = await get('/api/levels/unit?unit=' + encodeURIComponent(uid));
    const name = uid.split('|').pop();
    const ev = await get('/api/ai/evidence?prompt=' + encodeURIComponent('heat flood cold wind in ' + name) + '&location=' + encodeURIComponent(name), false);
    const U = ((ev.facts && (ev.facts.askedUnits || [])) || []).find((x) => x.mapLevels) || (ev.facts && ev.facts.selectedUnit) || null;
    const ML = U && U.mapLevels;
    if (!ML || !api.ready) { diff.push(uid + ': no ' + (!ML ? 'AI levels' : 'API levels')); continue; }
    for (const d of api.days) { const md = ML.days.find((x) => x.date === d.date); if (!md) { diff.push(uid + ' ' + d.date + ' missing day'); continue; }
      for (const [k, v] of Object.entries(d.layers)) {
        const m = md.hazards.find((h) => h.layer === k);
        if (hidden.includes(k)) { if (m) pluv++; continue; }
        const srcV = sub[k] ? d.layers[sub[k].from] : v;   /* until the route owners apply served.mjs, the API still carries the raw governing flood */
        const want = !srcV ? 'Not assessed' : srcV.level < 0 ? 'Not assessed' : srcV.word;
        if (m && m.level === want) same++; else diff.push(uid + ' ' + d.date + ' ' + k + ' api ' + want + ' ai ' + (m && m.level));
        if (m && k === 'heat' && srcV && srcV.level >= 3 && m.productType === 'Indicative' && m.raisesNoAlert) heatTag++;
        if (m && srcV && srcV.level === -2 && /outside the method/.test(m.notAssessedWhy || '')) na2++;
      } }
  }
  ok(!diff.length && same > 200, 'S1 item 8: at 10 places the AI quotes exactly the served level of every layer and day (/api/levels/unit, with the gate client rules)', same + ' equal; ' + diff.slice(0, 6).join('; '));
  ok(pluv === 0, 'S2 decision B: the local-rain (pluvial) flood level never reaches an AI answer; the client flood is the river-flooding level', 'pluvial rows in AI: ' + pluv);
  ok(heatTag > 0, 'S3 decision A: heat High / Severe reach the AI as Indicative and "raises no alert"', heatTag + ' tagged');
  ok(na2 > 0, 'S4 D12: engine code -2 is "Not assessed (outside the method’s range)", never "does not occur"', na2 + ' rows');
  const evL = await get('/api/ai/evidence?prompt=' + encodeURIComponent('heat in Lahore City') + '&location=Lahore%20City', false);
  const ML0 = ((evL.facts.askedUnits || [])[0] || evL.facts.selectedUnit || {}).mapLevels || {};
  ok((ML0.alertsWithheld || []).some((a) => a.hazard === 'heat') && !(ML0.alerts || []).some((a) => a.hazard === 'heat' && /High/.test(a.alert)), 'S5 decision A: an engine alert on heat High is withheld from the served list, with the reason', JSON.stringify(ML0.alertsWithheld || null).slice(0, 200));
  /* answers */
  const h = await chat('heat risk in Lahore City');
  ok(/Heat stress: .*\(indicative, raises no alert\)/.test(h.answer || '') && !/\/ ?100/.test(h.answer || ''), 'A1 a hazard question is answered from the served levels with the product type; no 0-100 score', (h.answer || '').slice(0, 300));
  const f = await chat('flood risk in Murree');
  ok(/river flooding only/.test(f.answer || '') && !/Flash and urban flooding from rain: (?!not shown)/.test(f.answer || '') && /Flash and urban flooding from rain: not shown/.test(f.answer || ''), 'A2 a flood question answers the river-flooding level and says local-rain flooding is not shown', (f.answer || '').slice(0, 300));
  const a = await chat('how accurate is NIGRAAN?'); const ev = J('data/skill-evidence.json');
  ok([...ev.lines.temperature, ...ev.lines.heat, ...ev.lines.cold].every((x) => (a.answer || '').includes(x)), 'A3 the accuracy answer is the generated evidence, sentence for sentence', (a.answer || '').slice(0, 200));
  const esg = await chat('what is the ESG score and financial loss in PKR for my factory in Lahore');
  ok(/outside NIGRAAN/.test(esg.answer || '') && !/\d/.test(esg.answer || ''), 'A4 item 5: an ESG / financial question gets the scope answer and no figure', (esg.answer || '').slice(0, 200));
  const t = await chat('weather today in Gilgit');
  ok(!/on these days/.test(t.answer || ''), 'A5 D32: a question about today never says "on these days"', (t.answer || '').slice(0, 300));
  { const pf = await get('/api/point?lat=35.9668&lon=74.5088', false);   /* v283.19: the place bundle (its hours are the panel's) */ const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
    const hrs = (pf.hours || []).filter((x) => String(x.time).slice(0, 10) === today).map((x) => x.gustKmh).filter((v) => v != null);
    const panelGust = hrs.length ? Math.round(Math.max(...hrs)) : null; const m = /gusts (\d+) km\/h/.exec(t.answer || '');
    ok(panelGust == null || (m && +m[1] === panelGust), 'A6 D32: the AI’s gust for today is the panel’s (maximum of the served hourly curve)', 'panel ' + panelGust + ' · AI ' + (m && m[1]));
  }
  /* PMD / FFD never named; supplier names out (item 4) */
  const surfaces = { skill: await get('/api/skill'), gate: await get('/api/report/gate-status'), sources: await get('/api/sources'), ctx: await get('/api/report/context?unit=' + encodeURIComponent(PLACES[0]) + '&section=operations'),
    rv: await get('/api/map/layer?id=rv:1'), week: await get('/api/map/layer?id=week:t'), air: await get('/api/map/layer?id=air:pm25'), lv: await get('/api/levels/unit?unit=' + encodeURIComponent(PLACES[8])) };
  for (const p of ['flood in Sukkur', 'drought in Pakistan', 'river flood chance in Hyderabad', 'heat across the country', 'rain tomorrow in Skardu', 'glacial lake risk in Gilgit']) surfaces['ai ' + p] = await chat(p);
  const bad = Object.entries(surfaces).filter(([, v]) => NAMES.test(JSON.stringify(v))).map(([k, v]) => k + ': ' + (JSON.stringify(v).match(NAMES) || [''])[0]);
  ok(!bad.length, 'N3 item 4: PMD / FFD are named on no client surface (methods sheet, gate status, sources, report context, map layers, levels, 6 AI answers)', bad.join('; '));
  const sk = surfaces.skill;
  ok(sk.measured && sk.measured.ready && (sk.parameters || []).some((p) => p.id === 'scenario_monte_carlo' && /What it simulates/.test(p.measurand) && /Inputs/.test(p.measurand)) && (sk.parameters || []).some((p) => p.id === 'long_term_projection'),
    'M1 item 5: the methods sheet explains the Monte Carlo (what it simulates, its inputs) and keeps the CMIP6 projection; it carries the measured evidence');
  { const ml = txt('server/api/maplayers.mjs'); /* the layers need data this cloud tree may not hold: the served text is checked when ready, the source otherwise */
    ok(surfaces.rv.ready ? (surfaces.rv.productType === 'Indicative' && /did worse than simply carrying/.test(surfaces.rv.source || '')) : (/did worse than simply carrying today/.test(ml) && !/turned into a calibrated chance of the official/.test(ml)), 'M2 item 1: the river-chance layer reads as the gate says (Indicative, worse than persistence)', surfaces.rv.ready ? surfaces.rv.source : 'not ready here: checked in the source');
    ok(surfaces.week.ready ? /outlook only/.test(surfaces.week.source || '') : /an outlook only, no action is raised from it/.test(ml), 'M3 item 4: the weeks-ahead and season layers are an outlook only', surfaces.week.ready ? surfaces.week.source : 'not ready here: checked in the source');
    ok(/out\.productType = t\.productType/.test(ml), 'M4 every map layer names its product type from the gate'); }
  ok(surfaces.ctx.levels && surfaces.ctx.levels.days && surfaces.ctx.levels.days.every((d) => !('flood_pluvial' in d.layers) && (!d.layers.flood || /river flooding only/.test(d.layers.flood.basis || ''))) && surfaces.ctx.measuredSkill && surfaces.ctx.measuredSkill.ready, 'R6 the report context prints the served levels (no pluvial layer) and the measured evidence');
  /* the self-check record carries the server's build identity, not the page's stamp */
  { const pkg = J('package.json'); const gv = J('data/model-gate.resolved.json').version;
    await fetch(B + '/api/selfcheck/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ at: new Date().toISOString(), build: '91.17.280', gate: 'gate-91.17.279', day: 0, basis: 'peak', units: 1, checks: [] }) });
    const sc = await get('/api/ops/selfcheck', false);
    ok(sc.build === pkg.version && sc.gate === gv && sc.pageBuild === '91.17.280' && sc.pageGate === 'gate-91.17.279' && sc.stampMismatch === true, 'B1 the self-check record names the deployed build (package.json) and served gate; an old page stamp is kept apart and flagged', JSON.stringify({ build: sc.build, gate: sc.gate, page: sc.pageBuild, mismatch: sc.stampMismatch })); }
  /* Urdu search (D19) */
  const u1 = await get('/api/geo/search?q=' + encodeURIComponent('لاہور')), u2 = await get('/api/geo/search?q=' + encodeURIComponent('اسلام آباد')), u3 = await get('/api/geo/search?q=' + encodeURIComponent('کراچی'));
  ok(u1.chosen && /Lahore/.test(u1.chosen.name) && u2.chosen && /Islamabad/.test(u2.chosen.name) && u3.chosen && /Karachi/.test(u3.chosen.name), 'U1 D19: Urdu names find the place (لاہور, اسلام آباد, کراچی)', [u1, u2, u3].map((x) => x.chosen && x.chosen.name).join(' / '));
  const src = surfaces.sources; ok(/OpenStreetMap/.test(src.methodsLine || '') && (src.entries || []).some((e) => e.id === 'osm' && (e.files || []).includes('data/pk-rivers.json')), 'S6 D14: the one credit list credits the rivers to OpenStreetMap', (src.methodsLine || '').slice(0, 200));
} catch (e) { ok(false, 'part 2 threw', e.stack); }
finally { if (S) S.stop(); }
/* ───────────────────────── part 3 · WS2 request R4 (territory.mjs from WS2's tree, overlaid on a copy of this server folder) ───────────────────────── */
{ const W2 = process.env.WS4_WS2_ROOT || '/tmp/claude-0/v283/WS2/srv';
  if (existsSync(join(W2, 'server', 'api', 'territory.mjs')) && existsSync(join(W2, 'data', 'territory-snap.json'))) {
    const O = mkdtempSync(join(tmpdir(), 'ws4o-')); let S3 = null;
    try {
      const { readdirSync, symlinkSync, cpSync } = await import('node:fs');
      for (const n of readdirSync(ROOT)) { if (n === 'server') cpSync(join(ROOT, n), join(O, n), { recursive: true }); else symlinkSync(join(ROOT, n), join(O, n)); }
      for (const f of ['territory.mjs', 'outlook.mjs']) copyFileSync(join(W2, 'server', 'api', f), join(O, 'server', 'api', f));
      S3 = await startServer(O, PORT + 1, {}, { 'territory-snap.json': readFileSync(join(W2, 'data', 'territory-snap.json'), 'utf8') });
      const q = async (t) => (await (await fetch(S3.base + '/api/geo/search?q=' + encodeURIComponent(t), { headers: { 'x-agn-view': 'customer' } })).json());
      const o = await q('25.2088, 64.6357'), k = await q('24.8125, 66.97'), sea = await q('24.5, 66.5');
      const r0 = (x) => (x.results || [])[0] || {};
      ok(r0(o).administered === true && r0(o).unitId === 'Balochistan|Gwadar|Ormara' && r0(o).snapped && /Kemari/.test(r0(k).unitId || '') && r0(sea).atSea === true && !r0(sea).administered,
        'T1 WS2 request R4 / D18: place search snaps Ormara town and Kemari port into their tehsils and calls the sea "at sea"', JSON.stringify([r0(o).unitId, r0(o).snapped, r0(k).unitId, r0(sea).atSea, r0(sea).why]).slice(0, 300));
    } catch (e) { ok(false, 'T1 overlay run', e.message); }
    finally { if (S3) S3.stop(); rmSync(O, { recursive: true, force: true }); }
  } else console.log('SKIP T1 (WS2 territory.mjs not found at ' + W2 + ')');
}
console.log(`\nws4: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
