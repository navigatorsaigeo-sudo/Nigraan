// v91.17.283.48 · "What to do here" on a running server: GET /api/guidance (flag ON), the flag OFF behaviour, the AI "what should I do",
// the report context and the panel script. A server of its own with GUIDANCE_PANEL=1 (ownServer: a throw-away copy, mock provider), or
// the server named by NIGRAAN_GUIDANCE_BASE when it already runs with the flag ON. The shared test server (argv[2], flag OFF by default)
// is used for the OFF checks when it answers with the panel off.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownServer, req, counter } from '../tests283/permanent/lib.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const C = counter('GUIDANCE-SERVER'); const ok = C.ok;
const UNITS = JSON.parse(readFileSync(join(ROOT, 'server', 'contract', 'units.json'), 'utf8'));
const LOCAL = { 'sec-fetch-site': 'same-origin' }, CUST = { 'x-agn-view': 'customer' }, OP = { 'x-agn-view': 'operator' };
const SHARED = /^https?:/.test(process.argv[2] || '') ? process.argv[2].replace(/\/$/, '') : null;

/* ── flag OFF: the shared server (when it runs with the panel off) ── */
if (SHARED) { const js = await req(SHARED, '/agn-guidance.js');
  if (js.status === 200 && /panel is off/.test(js.text)) {
    const g = await req(SHARED, '/api/guidance?lat=31.5204&lon=74.3587'), u = await req(SHARED, '/api/no-such-route-48');
    ok(g.status === 404 && g.json && g.json.error === 'not_found' && u.status === 404, 'flag OFF: /api/guidance does not exist (the same 404 as any unknown route)', g.status + ' ' + g.text.slice(0, 160));
    const css = await req(SHARED, '/agn-guidance.css'); ok(css.status === 200 && css.text === '' && js.text.trim().startsWith('/*') && !/function/.test(js.text), 'flag OFF: the page block loads an empty script and an empty style sheet (the page renders as before)');
    const rc = await req(SHARED, '/api/report/context?lat=31.5204&lon=74.3587&section=operations', { headers: CUST, timeoutMs: 120000 });
    ok(rc.json && !('guidance' in rc.json) && !(rc.json.provenance && rc.json.provenance.guidance), 'flag OFF: the report context carries no guidance section');
    const ai = await req(SHARED, '/api/ai/chat', { method: 'POST', headers: LOCAL, body: { prompt: 'What should I do in Lahore?', context: { location: 'Lahore', place: { name: 'Lahore', lat: 31.5204, lon: 74.3587 } } }, timeoutMs: 120000 });
    ok(ai.json && ai.json.kind !== 'guidance' && !('guidanceItems' in ai.json), 'flag OFF: the AI answers "what should I do" as before (no guidance kind)', ai.text.slice(0, 160));
  } else C.note('flag OFF checks', 'the shared server runs with GUIDANCE_PANEL=1 (or did not answer): OFF checks not run here'); }

/* ── flag ON ── */
let srv = null, B = process.env.NIGRAAN_GUIDANCE_BASE ? process.env.NIGRAAN_GUIDANCE_BASE.replace(/\/$/, '') : null;
if (!B) { srv = await ownServer({ mode: 'ok', env: { GUIDANCE_PANEL: '1' } }); ok(srv.up, 'own server up with GUIDANCE_PANEL=1', srv.up ? srv.base : srv.log().slice(-600)); if (!srv.up) { C.done(); process.exit(); } B = srv.base; }
try {
  const lib = await req(B, '/api/guidance/library', { headers: CUST }); ok(lib.json && lib.json.ok && lib.json.version === '1.0.0' && lib.json.review && lib.json.review.reviewer === '', 'GET /api/guidance/library: version 1.0.0, validator passed, reviewer empty', lib.text.slice(0, 200));
  /* AC2: one fixture point per province (its tehsil centre): the province's authority, NDMA first */
  const AUTH = { 'Punjab': /PDMA Punjab/, 'Sindh': /PDMA Sindh/, 'Khyber Pakhtunkhwa': /PDMA Khyber Pakhtunkhwa/, 'Balochistan': /PDMA Balochistan/, 'Azad Kashmir': /SDMA Azad Kashmir/, 'Gilgit Baltistan': /Rescue 1122 · Gilgit/, 'Federal Capital': /^NDMA helpline$/ };
  const FIX = { 'Punjab': 'Punjab|Lahore|Lahore City', 'Sindh': 'Sindh|Hyderabad|Hyderabad City', 'Khyber Pakhtunkhwa': null, 'Balochistan': null, 'Azad Kashmir': 'Azad Kashmir|Muzaffarabad|Muzaffarabad', 'Gilgit Baltistan': 'Gilgit Baltistan|Gilgit|Gilgit', 'Federal Capital': 'Federal Capital|Islamabad|Islamabad' };
  for (const [prov, re] of Object.entries(AUTH)) { const u = UNITS.find((x) => x.unitId === FIX[prov]) || UNITS.find((x) => x.province === prov);
    const g = await req(B, '/api/guidance?lat=' + u.lat + '&lon=' + u.lon + '&audience=public', { headers: CUST, timeoutMs: 120000 }); const n = g.json && g.json.contacts ? g.json.contacts.items.map((c) => c.name) : [];
    ok(g.json && g.json.ok && n[0] === 'NDMA helpline' && n.some((x) => re.test(x)) && g.json.contacts.items.every((c) => c.phone && c.phone.length), 'AC2 ' + prov + ' (' + u.tehsil + '): NDMA first and the province’s authority; customer contacts all have numbers', n.join(', ') || g.text.slice(0, 200)); }
  /* the levels and applicability states are the server's own */
  const P = UNITS.find((x) => x.unitId === 'Gilgit Baltistan|Gilgit|Gilgit');
  const [g, a, lu] = await Promise.all([req(B, '/api/guidance?lat=' + P.lat + '&lon=' + P.lon, { headers: OP, timeoutMs: 120000 }), req(B, '/api/hazards/applicability?lat=' + P.lat + '&lon=' + P.lon, { headers: CUST }), req(B, '/api/levels/unit?unit=' + encodeURIComponent(P.unitId), { headers: CUST })]);
  const stOf = (k) => ((a.json && a.json.hazards) || []).find((r) => r.hazard === k);
  ok(g.json && g.json.ok && ['flood', 'heat', 'landslide', 'glof'].every((h) => { const H = g.json.hazards.find((x) => x.hazard === h), r = stOf(h === 'flood' ? 'flood_riverine' : h); return H && (!r || (H.applicability && H.applicability.state === r.state)); }),
    'the applicability state of each hazard is the one GET /api/hazards/applicability serves (consumed, not re-derived)', JSON.stringify(g.json && g.json.hazards.map((h) => [h.hazard, h.applicability && h.applicability.state])));
  { const W = ['Normal', 'Low', 'Moderate', 'High', 'Severe']; const days = ((lu.json && lu.json.days) || []).filter((d) => d.day >= 0 && d.day <= 3);
    const peak = (k) => { let b = -1; for (const d of days) { const v = d.layers && d.layers[k]; if (v && v.assessed !== false && v.level >= 0) b = Math.max(b, v.level); } return b < 0 ? null : W[b]; };
    ok(g.json && ['flood', 'heat', 'landslide'].every((h) => (g.json.hazards.find((x) => x.hazard === h).level.word || null) === peak(h)), 'each level is the served tehsil level (GET /api/levels/unit), the highest of days 0-3', JSON.stringify(['flood', 'heat', 'landslide'].map((h) => [h, peak(h), g.json && g.json.hazards.find((x) => x.hazard === h).level.word]))); }
  ok(g.json && g.json.place && g.json.place.unitId === P.unitId && g.json.facts && g.json.facts.within1500ftOfWater, 'operator view: the tehsil id and the location facts with their rules');
  /* customer vs operator */
  const c = await req(B, '/api/guidance?lat=' + P.lat + '&lon=' + P.lon, { headers: CUST, timeoutMs: 120000 });
  const items = (j) => j.hazards.filter((h) => h.tabs).flatMap((h) => [...h.tabs.do.phases.flatMap((p) => p.items.concat(p.more)), ...h.tabs.rules.items, ...h.tabs.rights.items, ...h.tabs.rights.duties]);
  ok(c.json && c.json.ok && !c.json.place.unitId && !c.json.facts && items(c.json).every((i) => ['checked-text', 'machine-verified-official-text'].includes(i.status) && !('flagged' in i)) && items(g.json).some((i) => i.flagged),
    'AC11 the customer answer holds only customer-visible items (no flags, no tehsil id); the operator answer flags the rest');
  ok(c.json && JSON.stringify(c.json).includes('NDMA') && !/\bPMD\b|\bFFD\b/.test(JSON.stringify(c.json)), 'the customer answer cites the issuing authority (NDMA) and names no PMD / FFD');
  /* audience, language, bad input */
  const bz = await req(B, '/api/guidance?lat=' + P.lat + '&lon=' + P.lon + '&audience=business&lang=ur', { headers: CUST, timeoutMs: 120000 });
  ok(bz.json && bz.json.audience === 'business' && /not reviewed/.test(bz.json.langNote || '') && items(bz.json).filter((i) => i.id.includes('-business-')).length > 0 && !items(bz.json).some((i) => i.id.includes('-household-')), 'AC7 audience business gives the business items; Urdu asked: English with a note');
  const bad = await req(B, '/api/guidance?lat=31.5&lon=74.3&audience=farmer'), out = await req(B, '/api/guidance?lat=10&lon=10');
  ok(bad.status === 400 && out.status === 400, 'a hidden audience and a point outside the window are refused with the reason', bad.status + ' ' + out.status);
  const un = await req(B, '/api/guidance?unit=' + encodeURIComponent(P.unitId), { headers: CUST, timeoutMs: 120000 }); ok(un.json && un.json.ok && un.json.place.tehsil === 'Gilgit', 'by tehsil: GET /api/guidance?unit=');
  /* AC6 in a plains tehsil: GLOF not relevant (applicability "cannot happen here") */
  const LH = UNITS.find((x) => x.unitId === 'Punjab|Lahore|Lahore City'); const lh = await req(B, '/api/guidance?lat=' + LH.lat + '&lon=' + LH.lon, { headers: CUST, timeoutMs: 120000 });
  const la = await req(B, '/api/hazards/applicability?lat=' + LH.lat + '&lon=' + LH.lon, { headers: CUST }); const gr = ((la.json && la.json.hazards) || []).find((r) => r.hazard === 'glof');
  const gl = lh.json && lh.json.hazards.find((h) => h.hazard === 'glof');
  /* this install's GLOF drainage table decides the state (the laptop's says "cannot happen here" for Lahore; a copy without it says "outside the
     method's range"): the panel follows whatever the endpoint serves */
  ok(gl && gr && (gr.state === 'not_applicable' ? gl.status === 'not_relevant' && /not relevant here/.test(gl.line) : gl.status === 'no_level' && /no level here/.test(gl.line)),
    'AC6 Lahore: GLOF follows the applicability endpoint (' + (gr && gr.state) + '): "not relevant here" where it cannot happen, else "no level here"', gl && gl.line);
  ok(lh.json && lh.json.officialWarning === null, 'AC9 no official warning feed in v1: no banner');
  /* AI: only the endpoint's items, inserted by code */
  const ai = await req(B, '/api/ai/chat', { method: 'POST', headers: LOCAL, body: { prompt: 'What should I do in Gilgit?', context: { location: 'Gilgit', place: { name: 'Gilgit', lat: P.lat, lon: P.lon } } }, timeoutMs: 120000 });
  const lines = String((ai.json && ai.json.answer) || '').split('\n').filter((l) => l.startsWith('- '));
  ok(ai.json && ai.json.kind === 'guidance' && ai.json.model === null && lines.every((l) => /\[[a-z0-9-]+; source: /.test(l)) && (ai.json.guidanceItems || []).every((id) => c.json.provenance.itemIds.includes(id)),
    'AC8 the AI "what should I do" answer lists only items the endpoint selected, each with its id and source (no model call)', ai.text.slice(0, 300));
  const ai0 = await req(B, '/api/ai/chat', { method: 'POST', headers: LOCAL, body: { prompt: 'What should I do?', context: { location: '' } }, timeoutMs: 120000 });
  ok(ai0.json && ai0.json.kind === 'guidance' && /no place is chosen/.test(ai0.json.answer) && /111-157-157/.test(ai0.json.answer), 'AC8 no place: the AI says so and gives the national contacts, no advice');
  /* AC10: the report context carries the section; provenance records the library version and the item ids */
  const rc = await req(B, '/api/report/context?lat=' + P.lat + '&lon=' + P.lon + '&section=operations', { headers: CUST, timeoutMs: 180000 });
  ok(rc.json && rc.json.guidance && rc.json.guidance.ok && rc.json.provenance && rc.json.provenance.guidance && rc.json.provenance.guidance.libraryVersion === '1.0.0' && rc.json.provenance.guidance.itemIds.length > 0 &&
    JSON.stringify(rc.json.provenance.guidance.itemIds) === JSON.stringify(rc.json.guidance.provenance.itemIds), 'AC10 the site report context has the "What to do" data; provenance records the library version and item ids', rc.text.slice(0, 200));
  /* the panel script and its style */
  const js = await req(B, '/agn-guidance.js'), css = await req(B, '/agn-guidance.css');
  ok(js.status === 200 && /agnGuidanceOverview/.test(js.text) && /agnGuidanceClientRisk/.test(js.text) && /\/api\/guidance\?/.test(js.text) && css.status === 200 && /\.agng/.test(css.text), 'flag ON: /agn-guidance.js (Overview and Client Risk mounts, reads /api/guidance) and /agn-guidance.css are served');
  const page = readFileSync(join(ROOT, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html'), 'utf8');
  ok((page.match(/BEGIN agn-guidance/g) || []).length === 1 && /<script src="\/agn-guidance\.js"><\/script>\n<!-- ===== END agn-guidance ===== -->\n<\/body>/.test(page), 'the classic page holds one delimited block that loads /agn-guidance.js (no inline script: the page CSP is unchanged)');
} finally { if (srv) await srv.stop(); }
C.done();
