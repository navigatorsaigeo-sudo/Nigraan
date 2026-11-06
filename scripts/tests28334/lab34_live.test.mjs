/* v91.17.283.34 · the AI Assistant and the Scenario Lab on the running server (argv[2] / NIGRAAN_BASE):
     W1  Lab A: one place answers with the member outcomes (method, seed); the same inputs give the same answer (id, values, seed)
     W2  with members held: heat / cold / wind per day as a level with a range (10th-90th percentile member); without: the reason is said
     W3  an assumed rain day: the rain class of the assumed amount on that day (certain, no range); the district flood chance is a Monte
         Carlo central value inside its 90 % range, or "not modelled" with the reason; landslide and vegetation stress "not modelled yet"
     W4  a list of places: levels only (no member outcomes)
     W5  the kept result: GET /api/scenario/result returns the same values and checksum; the report of 1-3 saved results is written by
         the server, carries each id and checksum; an edited shown value or a missing checksum is refused (409 record_mismatch)
     W6  Lab B: POST /api/sitechange answers or says why (land cover not held here); 90 ha: no area cut-off (v283.36); customer text has no code text
     W7  GET /api/hazards/applicability: a flat plains place says "not assessed: no local steep ground; run-out from upstream not modelled" for landslide (v283.36)
     W8  the AI answer carries basis (place, time) and chips
     W9  the pages: the AI tab is "AI Assistant" with four questions naming the place and none of the moved parts; Methods holds them
         (operator only); the Scenario Lab has the site-change section and the saved-scenario box; the old joint heat-and-flood card is
         not shown to clients; the temperature control is +0 to 4 °C; no code text and no page error
   usage: node scripts/tests28334/lab34_live.test.mjs [base] */
import { T, browser, open, consoleReady, place, tab, BASE } from '../tests28328p/lib.mjs';
const { ok, done } = T();
const C = { 'x-agn-view': 'customer' };
const CODE = /\.mjs|\.json|server\/|data\//;
const get = async (p, h = C) => { const r = await fetch(BASE + p, { headers: h }); let j = null; try { j = await r.json(); } catch (_) {} return { s: r.status, j }; };
const post = async (p, b, h = C) => { const r = await fetch(BASE + p, { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: JSON.stringify(b) }); let j = null; try { j = await r.json(); } catch (_) {} return { s: r.status, j }; };
const hits = (o, p = '', out = []) => { if (typeof o === 'string') { if (CODE.test(o)) out.push(p + ': ' + o.slice(0, 100)); } else if (Array.isArray(o)) o.forEach((x, i) => hits(x, p + '[' + i + ']', out)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) hits(v, p + '.' + k, out); return out; };
const LA = '33.69000', LO = '73.05000';
/* W1 / W2 */
const pt = await get('/api/point?lat=' + LA + '&lon=' + LO + '&complete=1'); const sl = pt.j && pt.j.parts && pt.j.parts.siteLevels && pt.j.parts.siteLevels.v;
const dates = sl && sl.hazards && sl.hazards.heat ? sl.hazards.heat.days.map((d) => d.date).filter(Boolean) : [];
const d1 = dates[1] || dates[0];
const q = '/api/scenario?lat=' + LA + '&lon=' + LO + '&dT=1.5&rainMm=40&rainDay=' + d1 + '&wetPct=75';
const A = await get(q), B = await get(q); const PA = A.j && A.j.places && A.j.places[0], PB = B.j && B.j.places && B.j.places[0];
ok(A.s === 200 && PA && PA.ok && PA.outcomes && PA.outcomes.method && /^[0-9a-f]{16}$/.test(PA.outcomes.seed), 'W1 one place: the member outcomes with method and seed', JSON.stringify(A.j).slice(0, 300));
ok(A.j && B.j && A.j.id === B.j.id && A.j.checksum === B.j.checksum && JSON.stringify(PA.outcomes) === JSON.stringify(PB.outcomes), 'W1 the same inputs give the same answer (id, checksum, outcomes)');
const O = PA && PA.outcomes;
if (O && O.members && O.members.ok) {
  const bad = []; for (const d of O.days) for (const k of ['heat', 'cold', 'wind']) { const x = d[k]; if (!x || x.assumed) continue; if (!x.assessed) continue;
    if (!(x.range[0] <= x.level && x.level <= x.range[1]) || Math.abs(Object.values(x.shares).reduce((a, b) => a + b, 0) - 100) > 2) bad.push(d.date + ' ' + k); }
  ok(!bad.length && O.days.some((d) => d.heat && d.heat.assessed), 'W2 ' + O.members.count + ' members: levels with a range around the central member, shares sum to 100', bad.join(', '));
} else ok(!!(O && O.members && O.members.why) && O.days.every((d) => d.heat && d.heat.why), 'W2 no members held: the reason is said for every outcome', JSON.stringify(O && O.members));
/* W3 */
const rd = O && O.days.find((d) => d.date === d1); const sr = PA && PA.scenario.hazards.rain.days.find((d) => d.date === d1);
ok(rd && rd.rainClass && rd.rainClass.assumed && rd.rainClass.mm === 40 && sr && sr.assumed && sr.levelLabel === 'rain class of the assumed amount', 'W3 the assumed rain day: the rain class of the amount, no range');
const F = O && O.flood; ok(F && (F.modelled ? (F.range90[0] <= F.p && F.p <= F.range90[1] && F.draws === 2000 && F.dayTotalBasis === 'the assumed day total') : /^not modelled/.test(F.why)), 'W3 the flood chance: Monte Carlo central inside its 90 % range, or "not modelled" with the reason', JSON.stringify(F).slice(0, 300));
ok(O && O.notModelled && O.notModelled.landslide === 'not modelled yet' && O.notModelled.vegetationStress === 'not modelled yet', 'W3 landslide and vegetation stress: not modelled yet');
ok(!hits(A.j).length, 'W1 the customer answer has no code text', hits(A.j).slice(0, 3).join(' | '));
/* W4 */
const L = await get('/api/scenario?pts=' + LA + ',' + LO + ';31.55800,74.35071&dT=1'); ok(L.j && L.j.places && L.j.places.every((p) => !p.ok || p.outcomes === null), 'W4 a list of places: levels only, no member outcomes');
/* W5 */
const R = await get('/api/scenario/result?id=' + A.j.id); ok(R.s === 200 && R.j && R.j.checksum === A.j.checksum && JSON.stringify(R.j.values) === JSON.stringify(A.j.values), 'W5 the kept result = the answer the screen showed (values, checksum)');
const X = await get('/api/scenario/result?id=wx000000000000000000000000'); ok(X.s === 404 && X.j && /not held/.test(X.j.why), 'W5 an unknown id: 404 with the reason');
const pr = await post('/api/scenario/report', { ids: [A.j.id], shown: { [A.j.id]: A.j.values }, checksums: { [A.j.id]: A.j.checksum } });
ok(pr.s === 200 && pr.j && /<html/i.test(pr.j.html) && pr.j.html.includes(A.j.id) && pr.j.html.includes(A.j.checksum) && !CODE.test(pr.j.html.replace(/<[^>]+>/g, ' ')), 'W5 the report: written by the server from the kept result (id, checksum), no code text');
const k1 = Object.keys(A.j.values).find((k) => typeof A.j.values[k] === 'number');
if (k1) { const pr2 = await post('/api/scenario/report', { ids: [A.j.id], shown: { [A.j.id]: { [k1]: A.j.values[k1] + 1 } } }); ok(pr2.s === 409 && pr2.j && pr2.j.error === 'record_mismatch', 'W5 an edited shown value: refused (409 record_mismatch)', JSON.stringify(pr2.j).slice(0, 200)); }
const pr3 = await post('/api/scenario/report', { ids: [A.j.id] }); ok(pr3.s === 409, 'W5 no shown values and no checksum: refused');
const pr4 = await post('/api/scenario/report', { ids: ['a', 'b', 'c', 'd'] }); ok(pr4.s === 400, 'W5 more than 3 scenarios: refused');
/* W6 */
const sq = (lat, lon, m) => { const d = m / 111195, dl = d / Math.cos(lat * Math.PI / 180); return [[lat, lon], [lat, lon + dl], [lat + d, lon + dl], [lat + d, lon]]; };
const S1 = await post('/api/sitechange', { ring: sq(33.64, 73.0, 141.42), change: { built: 0.9 }, pondM3: 300, vegetation: 'later' });
ok(S1.s === 200 && S1.j && (S1.j.ok ? (S1.j.returnPeriods && S1.j.returnPeriods['10'] && /^sc[0-9a-f]{24}$/.test(S1.j.id) && S1.j.label && S1.j.surfaceHeat && S1.j.surfaceHeat.figure === null) : !!S1.j.why), 'W6 site change: answered, or the reason (' + (S1.j && (S1.j.ok ? 'answered' : S1.j.why)) + ')');
ok(!hits(S1.j).length, 'W6 site change customer text has no code text', hits(S1.j).slice(0, 3).join(' | '));
if (S1.j && S1.j.ok) { const R2 = await get('/api/scenario/result?id=' + S1.j.id); ok(R2.s === 200 && R2.j.checksum === S1.j.checksum, 'W6 the site result is kept by its id'); }
const S2 = await post('/api/sitechange', { ring: sq(33.64, 73.0, 950), change: { built: 0.9 } }); ok(S2.j && !(S2.j.ok === false && /catchment model/.test(S2.j.why || '')), 'W6 90 ha: no area cut-off (v283.36 item 4): answered or a data reason, never "use a catchment model"', JSON.stringify(S2.j).slice(0, 200));
/* W7 */
const H = await get('/api/hazards/applicability?lat=24.86000&lon=67.01000'); const ls = H.j && H.j.ok && H.j.hazards.find((h) => h.hazard === 'landslide');
ok(ls && ls.applies !== false && /^not assessed: no local steep ground; run-out from upstream not modelled$/.test(ls.text) && !/too flat|cannot happen/i.test(ls.why || ''), 'W7 Karachi: landslide "not assessed: no local steep ground; run-out from upstream not modelled" (v283.36 C-now 2; never "cannot happen")', JSON.stringify(ls));
/* W8 */
const AI = await post('/api/ai/chat', { prompt: 'Will it rain in Islamabad in the next 3 days?', context: { location: 'Islamabad', point: { lat: 33.69, lon: 73.05 } } });
ok(AI.j && (AI.j.answer ? (AI.j.basis && 'place' in AI.j.basis && 'at' in AI.j.basis && Array.isArray(AI.j.chips)) : true), 'W8 the AI answer carries basis (place, time) and chips', JSON.stringify(AI.j && { basis: AI.j.basis, chips: (AI.j.chips || []).length, s: AI.s }));
/* W9 pages */
const br = await browser();
{ const o = await open(br, '/analyst'); await consoleReady(o.pg); await place(o.pg, LA + ', ' + LO); await o.pg.waitForTimeout(3000);
  await tab(o.pg, 'airisk', 3000);
  const a = await o.pg.evaluate(() => { const v = document.querySelector('[data-view="airisk"]'), vis = (e) => !!(e && e.offsetParent !== null);
    const qs = [...v.querySelectorAll('[data-llm-prompt]')].filter((b) => !b.hidden).map((b) => b.getAttribute('data-llm-prompt'));
    return { h2: (v.querySelector('.ai-clean-hero h2') || {}).textContent, qs, moved: ['aiQuantSection', 'aiWorkspaceTabs', 'nigraanLlmStatus'].map((id) => { const e = document.getElementById(id); return !!(e && v.contains(e)); }),
      strip: vis(v.querySelector('.ai-context-strip')), safety: vis(v.querySelector('.llm-safety')), methods: !!document.getElementById('ai34Methods'), methodsOp: (document.getElementById('ai34Methods') || {}).className || '', txt: v.innerText }; });
  ok(a.h2 === 'AI Assistant', 'W9 the AI tab is "AI Assistant"', a.h2);
  ok(a.qs.length === 4 && a.qs.every((x) => /\?$/.test(x)), 'W9 four suggested questions for the place', JSON.stringify(a.qs));
  ok(!a.moved.some(Boolean) && !a.strip && !a.safety, 'W9 the moved parts are off the tab (engine numbers, workspace tabs, model badge, context strip, method notes)', JSON.stringify(a.moved));
  ok(a.methods && /agn-op-only/.test(a.methodsOp), 'W9 Methods & Verification holds them, operator only');
  ok(!/Governed numbers|AI execution mode|Reasoning model|temperature correction/i.test(a.txt), 'W9 no model name, execution mode or governed list on the AI tab', a.txt.slice(0, 300));
  await tab(o.pg, 'hybridlab', 4000);
  const s = await o.pg.evaluate(() => { const vis = (e) => !!(e && e.offsetParent !== null); const t = document.querySelector('#agnScn input[data-k="dT"]');
    return { site: vis(document.getElementById('lab34Site')), saved: vis(document.getElementById('lab34SavedBox')), mc: vis(document.getElementById('susMcCard')), dTmax: t && t.max, dTmin: t && t.min, txt: document.querySelector('[data-view="hybridlab"]').innerText }; });
  ok(s.site && s.saved, 'W9 Scenario Lab: the site-change section and the saved-scenario box are shown');
  ok(!s.mc, 'W9 the old joint heat-and-flood card is not shown to clients');
  ok(s.dTmin === '0' && s.dTmax === '4', 'W9 temperature control +0 to 4 °C', s.dTmin + '..' + s.dTmax);
  const m = s.txt.split('\n').filter((l) => CODE.test(l)); ok(!m.length, 'W9 Scenario Lab: no code text', m.slice(0, 3).join(' | '));
  ok(o.errs.length === 0, 'W9 console: no page error', o.errs.join(' | '));
  await o.ctx.close(); }
await br.close();
done();
