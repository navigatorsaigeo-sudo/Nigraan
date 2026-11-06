// v91.17.283.10 · DRYSPONGE · drought and curve-number sponge after the pre-registered tests (data/evidence/drysponge/RULES.md).
//   D  the hydrological drought type (no observed truth) is never named; its indicator readings stay, marked untested
//   G  the gate carries the measured drought evidence and the served USDM cuts; the sponge day views are client-hidden
//   S  served layers: drought and the static sponge carry their screening wording; the hidden day views reach no client
// usage: node scripts/tests28310/drysponge/drysponge.test.mjs        (no server; DS_APP=<tree> to point at another tree)
import { readFileSync, mkdtempSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
const APP = process.env.DS_APP || join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + d : '')); } };
const J = (f) => { try { return JSON.parse(readFileSync(join(APP, 'data', f), 'utf8')); } catch (_) { return {}; } };
const imp = (f) => import(pathToFileURL(join(APP, 'server', 'api', f)).href);

/* ---- D: drought type */
{
  const tmp = mkdtempSync(join(tmpdir(), 'ds10-'));
  for (const f of ['drought-type.json', 'drought-class.json']) copyFileSync(join(APP, 'data', f), join(tmp, f));
  const { createDroughtType } = await imp('droughttype.mjs');
  const DT = createDroughtType(tmp);
  /* level Monitor; rain SPI -0.9 (moderate), soil 15th percentile (moderate), snow 3rd percentile (extreme) */
  const U = { 'X|Y|Z': { drought: { applicable: true, class: 'Monitor' }, smRoot: { percentile: 15 } } };
  const res = DT.attach(U, { water: null, recent: { units: { 'X|Y|Z': { sdPct: 3 } } }, outlook: null, outlookOn: false, idx: () => ({ name: 'SPI-3', value: -0.9 }) });
  const t = U['X|Y|Z'].dtype;
  ok(res && t, 'drought type attached');
  ok(t.main !== 'hydrological', 'the hydrological type is never named as the main type (no observed truth)', 'main=' + t.main);
  ok(t.main === 'agricultural', 'the main type falls to the tested types (agricultural, the later stage of the tie)', 'main=' + t.main);
  ok(!t.active.includes('hydrological') && t.types.hydrological == null, 'hydrological is not active and carries no band among the named types');
  ok(t.indicators.snow && t.indicators.snow.band === 4 && t.indicators.snow.untested === true, 'the snow reading stays in indicators, marked untested');
  ok(Array.isArray(t.withheld) && t.withheld.some((w) => w.type === 'hydrological' && /not tested/.test(w.why)), 'the unit says why the hydrological type is withheld');
  ok(res.counts.hydrological === 0, 'national counts name no hydrological drought');
  const S = J('drought-type.json');
  ok(S.withheld && /drought-test-drysponge\.json D4/.test(S.withheld.hydrological || ''), 'drought-type.json withheld cites its evidence');
}

/* ---- G: gate */
const R = J('model-gate.resolved.json'), DC = J('drought-class.json');
const ent = (id) => (R.entries || []).find((e) => e.id === id);
{
  const d = ent('drought');
  ok(d && ['Monitor', 'Watch', 'Act'].every((k) => String(d.operational_threshold).includes(String(DC.categories[k].indexAtMost))), 'drought gate: the operational threshold names the served USDM cuts', d && d.operational_threshold);
  ok(d && !/-1\.0 \/ -1\.5 \/ -2\.0/.test(String(d.operational_threshold)), 'drought gate: the old SPI -1.0/-1.5/-2.0 text is gone');
  ok(d && /rain-fed wheat/i.test(d.independent_test) && /documented droughts/i.test(d.independent_test), 'drought gate: independent test cites wheat-loss and documented-drought evidence');
  ok(d && d.product_type === 'Screening index' && d.client_limitations.length === d.known_limitations.length, 'drought gate: screening index, one client limitation per limitation');
  const E = J('drought-test-drysponge.json');
  ok(d && d.skill_metrics && E.D1_wheat && d.skill_metrics.wheatLossAuc === E.D1_wheat.aucLevel && d.skill_metrics.episodeAuc === E.D2_episodes.independentEventsE1toE5.auc, 'drought gate: skill numbers are the evidence file numbers');
  const r = ent('retention');
  ok(r && r.layers.length === 1 && r.layers[0] === 'nss_baseline' && r.product_type === 'Screening index', 'sponge gate: the static view is a screening index on its own');
  ok(r && /not a tested runoff forecast/.test((r.client_limitations || []).join(' ')), 'sponge gate: client wording says it is not a tested runoff forecast');
  const H = (R.client_rules || {}).hidden_layers || {};
  ok(['nss_dynamic', 'nss_runoff', 'nss_retention'].every((k) => k in H), 'client rules: the sponge day views are hidden from clients');
  ok(!('nss_baseline' in H) && 'flood_pluvial' in H, 'client rules: the static sponge stays, local-rain flooding stays hidden');
  const SP = J('sponge-cn-test-drysponge.json');
  ok(SP.decision && SP.decision.supported === false && SP.decision.yearsWhereCnAddsSkill < 2, 'sponge evidence: curve number not supported beyond rain (pre-set 2-of-3 rule)');
  const slim = JSON.parse(readFileSync(join(APP, 'build', 'gen', 'gate.slim.json'), 'utf8'));
  ok(['nss_dynamic', 'nss_runoff', 'nss_retention'].every((k) => k in ((slim.clientRules || {}).hidden_layers || {})), 'slim gate (inlined at the next page build) carries the same hidden layers');
}

/* ---- S: served layers */
{
  const S = await imp('served.mjs'); const { createGate } = await imp('gate.mjs');
  const W = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
  const unit = { ready: true, unit: 'Punjab|Lahore|Lahore City', words: W, days: [{ day: 0, date: '2026-10-23', layers: {
    drought: { name: 'Drought', level: 2, word: 'Moderate', score: 50 }, nss_baseline: { name: 'Ground sponge', level: 3, word: 'High' },
    nss_dynamic: { name: 'Retention today', level: 3, word: 'High' }, heat: { name: 'Heat stress', level: 1, word: 'Low' } } }], alerts: [] };
  const app = { dataDir: join(APP, 'data'), engine: { unit: () => JSON.parse(JSON.stringify(unit)) }, gate: createGate(join(APP, 'data')) };
  const c = S.servedUnit(app, 'u', false), o = S.servedUnit(app, 'u', true);
  const L = c.days[0].layers;
  ok(!('nss_dynamic' in L) && 'nss_dynamic' in o.days[0].layers, 'client unit: retention today is not served; the operator keeps it');
  ok(L.nss_baseline && L.nss_baseline.productType === 'Screening index' && L.nss_baseline.testStatus === 'not a tested runoff forecast', 'client unit: the static sponge is a screening index, not a tested runoff forecast');
  ok(/screening index/.test(S.levelPhrase(L.nss_baseline)) && /soil and land cover/.test(S.levelPhrase(L.nss_baseline)), 'client phrase for the sponge', S.levelPhrase(L.nss_baseline));
  ok(L.drought && L.drought.observed === true && /Low level does not rule out drought/.test(L.drought.basisNote || ''), 'client drought row: observed, screening wording', S.levelPhrase(L.drought));
  ok(L.drought.level === 2 && L.drought.word === 'Moderate' && L.heat.basisNote === undefined, 'levels and words unchanged; other layers carry no new note');
  const n = S.servedNational(app, 'nss_runoff', 0, false);
  ok(n.ready === false && n.hidden === true, 'national: rain run-off today is not served to clients');
}
console.log(`\nDRYSPONGE ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
