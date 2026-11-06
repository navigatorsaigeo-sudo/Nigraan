// science audit · the words match the evidence, on every surface (server, pages, AI facts, reports, gate):
//  W1 river flood CHANCE: no number reaches a client (negative Brier skill against persistence in both tested monsoons): /api/flood/chance and
//     the rv:* map layers answer "not yet verified; worse than persistence in tests"; the operator view keeps the numbers (live part)
//  W2 river flood LEVEL: kept; its untested rungs (the 20-year flow and Severe) are labelled untested
//  W3 landslide: the observed ratio of the model's class (2-5x -> 1.6x, 5-10x -> 2.7x, 10-20x -> 6.3x, >=20x -> 14.4x, generated from the
//     validation), never the model's own "N times more likely"
//  W4 daily minimum: no claim of improved skill; the start page line says the correction is not better than uncorrected
//  W5 mountain blend weight: "selection data, not an independent test" where its evidence is cited
//  W6 250 m: never "validated at 250 m"; the 250 m AI term says it is tested at stations
//  W7 cold "no event test yet" and GLOF "susceptibility, not a day forecast" on every surface that describes them
//  W8 the client heat line: the evidence-generated domain sentence (days 1-2, Sindh and Punjab) and "not yet verified" elsewhere
import { imp, src, json, BASE, get, CUST, ok, done, TREE } from './lib.mjs';
import { join } from 'node:path';
const I = src('server/api/index.mjs'), PG = src('artefact/AI_GEO_NIGRAAN_v91_17_MACH.html'), N3 = src('artefact/NIGRAAN_3.html'), ST = src('artefact/NIGRAAN_START.html');
const RP = json('data/river-prob-model.json'); const bss = []; for (const y of Object.values((RP && RP.validation && RP.validation.byMonsoon) || {})) for (const c of Object.values(y)) if (c && c.bssPersistence != null) bss.push(c.bssPersistence);
ok(bss.length && bss.filter((x, i) => i % 3 < 2).every((x) => x < 0), 'W1 the evidence: Brier skill against persistence below 0 (Low+ / Medium+, both monsoons)', bss.join(', '));
ok(/RIVER_CHANCE_WITHHELD = 'River flood chance: not yet verified; worse than persistence in tests/.test(I) && /\/\^rv:\/\.test\(String\(url\.searchParams\.get\('id'\) \|\| ''\)\) && customerView\(req\)/.test(I), 'W1 /api/map/layer rv:* and /api/flood/chance withhold the number for a client');
if (BASE) { const a = await get('/api/flood/chance', CUST), b = await get('/api/map/layer?id=rv:1', CUST), c = await get('/api/flood/chance');
  ok(a.j && a.j.withheld === true && /worse than persistence/.test(a.j.why) && !/"p"\s*:/.test(a.t) && b.j && b.j.withheld === true && !b.j.values, 'W1 live: the client gets no river chance number', a.t.slice(0, 200) + ' | ' + b.t.slice(0, 150));
  ok(c.s === 200 && !(c.j && c.j.withheld), 'W1 live: the operator view keeps the chance'); }
const SV = await imp('server/api/served.mjs'); const G = json('data/model-gate.resolved.json');
const app = { dataDir: join(TREE, 'data'), gate: { full: () => ({ ready: true, ...G }), entryOf: (l) => G.entries.find((e) => e.id === G.layerOwner[l]) || null, byId: (id) => G.entries.find((e) => e.id === id) || null } };
const rec = { ready: true, unit: 'Punjab|Lahore|Lahore City', words: ['Normal', 'Low', 'Moderate', 'High', 'Severe'], days: [{ day: 1, date: 'd', layers: { flood_riverine: { name: 'River', level: 3, word: 'High' }, cold: { name: 'Cold', level: 1, word: 'Low' }, glof: { name: 'GLOF', level: 2, word: 'Moderate' } } }], alerts: [] };
const U = SV.servedUnit({ ...app, engine: { unit: () => JSON.parse(JSON.stringify(rec)) } }, 'x', false); const L = (U.days && U.days[0].layers) || {};
ok(L.flood && L.flood.testStatus === 'untested' && /untested/.test(L.flood.testWhy || ''), 'W2 the client river flood level at High is kept and labelled untested', JSON.stringify(L.flood || null).slice(0, 200));
const M = json('data/landslide-odds-model.json'); const LO = await imp('server/api/landslideodds.mjs');
const obs = (LO.ratioBands ? LO.ratioBands(M) : []).map((b) => b.band + ':' + b.observed).join(' ');
ok(obs === '<1:0.3 1-2:0.7 2-5:1.6 5-10:2.7 10-20:6.3 >=20:14.4', 'W3 observed ratio per model band, from the validation', obs);
const W = (json('data/map-layer-scales.json') || { layers: {} }).layers.landslide_odds.words || [];
ok(W.join('|') === 'About an ordinary day or lower (observed 0.3-0.7 times)|Raised: slides about 1.6 times as often as on an ordinary day (observed)|Slides about 2.7 times as often as on an ordinary day (observed)|Slides about 6.3 times as often as on an ordinary day (observed)|Slides about 14.4 times as often as on an ordinary day (observed)', 'W3 the class words are the observed ratios (generated)', W.join(' | '));
const AI = src('server/api/ai.mjs'), ML = src('server/api/maplayers.mjs');
ok(!/how many times more likely/.test(AI + ML + I) && !/timesOrdinaryDay: d\.ratio/.test(AI) && /observedTimesOrdinaryDay: d\.observedRatio/.test(AI) && !/times as likely as an ordinary day here this month \('/.test(PG) && /observed for days in the model\\u2019s '\+_ob\.band\+' class/.test(PG), 'W3 no "N times more likely" multiplier in the AI facts, the map layer, the API or the console card');
const OOS = json('build/start/validation-oos.json') || {}; ok(/for the minimum the correction is not better than the uncorrected model/.test((OOS.lines || []).join(' ')) && /for the minimum the correction is not better than the uncorrected model/.test(ST), 'W4 the start page says the minimum correction is not better than uncorrected');
const all = [PG, ST, N3, AI, src('server/api/skill.mjs'), src('server/api/report.mjs'), JSON.stringify(G), JSON.stringify(json('data/skill-evidence.json'))].join('\n');
ok(!/(daily )?minimum[^.]{0,80}(improv|more accurate|better than (the )?(raw|uncorrected))/i.test(all.replace(/not better than the uncorrected model/g, '')), 'W4 no surface claims an improved minimum');
const H = G.entries.find((e) => e.id === 'hyperlocal-temperature'); ok(/selection data, not an independent test/.test(JSON.stringify(H.known_limitations)) && /selection data, not an independent test/.test(JSON.stringify(H.client_limitations)) && /selection data, not an independent test/.test(H.skill_metrics.served_blend_gate_evidence || ''), 'W5 the mountain blend evidence is labelled selection data, not an independent test');
ok(!/validated at 250|250 m[^.]{0,40}validated|validated[^.]{0,40}250 m/i.test(all) && (!/250 m grid/.test(PG) || /on a 250 m grid \(full at 09–18 h, night term 21–07 h; tested at stations, not cell by cell\)/.test(PG)), 'W6 no "validated at 250 m"; where the AI term is named it says it is tested at stations (v283.28 P16: the Predictions card that named it is removed)');
ok(L.cold && L.cold.testStatus === 'no event test yet' && /^Cold stress: no event test yet/.test((json('data/skill-evidence.json').lines.cold || [])[0] || ''), 'W7 cold: "no event test yet" on the served level and in the evidence line', JSON.stringify(L.cold || null).slice(0, 160));
ok(L.glof && L.glof.basisNote === 'susceptibility, not a day forecast' && /^susceptibility, not a day forecast/.test((await imp('server/api/engine.mjs')).HELD_NOTES.glof), 'W7 GLOF: "susceptibility, not a day forecast" on the served level and the held note');
const HL = json('data/skill-evidence.json').lines.heat || []; ok(/forecast days 1 and 2, Sindh and Punjab/.test(HL[0] || '') && /not yet verified/.test(HL[0] || ''), 'W8 the heat line states its tested domain and "not yet verified" elsewhere', (HL[0] || '').slice(0, 160));
done('SCI-WORDING');
