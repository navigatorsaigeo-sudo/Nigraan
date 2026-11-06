/* v91.17.283 INTEG · the installed landslide model (monotone refit, P1 + P3) is read from its file: features required are only the ones
   the model lists, more rain never lowers the odds, the inputs printed are the ones the model reads, and the wording says
   "the day's and the 3-day rain". No server. usage: node scripts/tests283/integ/landslide283.test.mjs [tree] */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT as R0 } from '../../lib/testenv.mjs';
const TREE = process.argv.slice(2).find((a) => !/^https?:/.test(a)) || R0;   /* the runner may pass the test server's address: ignored */
let pass = 0, fail = 0;
const ok = (c, name, info = '') => { if (c) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (info ? ' · ' + info : '')); } };
const L = await import(pathToFileURL(join(TREE, 'server', 'api', 'landslideodds.mjs')).href);
const M = JSON.parse(readFileSync(join(TREE, 'data', 'landslide-odds-model.json'), 'utf8'));
ok(JSON.stringify(M.features) === '["P1","P3"]' && M.coef.every((c) => c >= 0), 'L1 the installed model is the monotone refit: features P1, P3, every coefficient >= 0', JSON.stringify([M.features, M.coef]));
/* 5 days of rain only: a P7 / API15 model could not assess the last day; this model can */
const rain = [0, 2, 10, 30, 5];
const f = L.features(rain, 3, M.features);
ok(f && f.P1 === 30 && f.P3 === 42 && f.P7 == null, 'L2 a P1/P3 model is assessed from 3 days of rain (no 7-day or 60-day history needed)', JSON.stringify(f));
ok(L.features(rain, 3) === null, 'L3 the full v162 feature set still needs the 7-day and 60-day history (default unchanged)');
ok(L.features([null, 2, 10, 30], 3, M.features) && L.features([0, null, 10, 30], 3, M.features) === null, 'L4 a missing day inside the 3-day window is not assessed; a missing day outside it does not matter');
ok(/2 days before/.test(L.featuresWhy(M.features)) && /60 antecedent/.test(L.featuresWhy(['P1', 'P3', 'P7', 'API15'])), 'L5 the not-assessed reason names the window the model reads');
/* monotone: raising any day's rain never lowers the ratio, every month */
let worse = 0, n = 0;
for (let mo = 1; mo <= 12; mo++) for (const base of [[0, 0, 0, 0], [5, 0, 20, 3], [40, 60, 0, 10]]) for (let k = 0; k < 4; k++) for (const add of [1, 10, 100]) {
  const a = L.features(base, 2, M.features), b2 = base.slice(); b2[k] += add; const b = L.features(b2, 2, M.features); if (!a || !b) continue; n++;
  if (L.oddsRatio(M, b, mo) < L.oddsRatio(M, a, mo) - 1e-12) worse++; }
ok(n > 100 && worse === 0, 'L6 more rain never lowers the odds (A8): ' + n + ' raised-rain cases, ' + worse + ' lower', '');
const S = JSON.parse(readFileSync(join(TREE, 'data', 'map-layer-scales.json'), 'utf8')).layers.landslide_odds;
ok(/the day's and the 3-day rain/.test(S.measure) && !/7-day|60-day/.test(S.measure), 'L7 the layer measure reads "the day\'s and the 3-day rain"', S.measure);
const idx = readFileSync(join(TREE, 'server', 'api', 'index.mjs'), 'utf8'), page = readFileSync(join(TREE, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html'), 'utf8');
ok(!/3-day, 7-day and 60-day/.test(idx) && !/3-day, 7-day and 60-day/.test(page), 'L8 no route or page text still says "day, 3-day, 7-day and 60-day rain"');
const G = JSON.parse(readFileSync(join(TREE, 'data', 'model-gate.json'), 'utf8')).entries.find((e) => e.id === 'landslide-odds');
ok(G && G.version === M.version && G.skill_metrics.auc_served_form === M.validation.auc, 'L9 the gate entry carries the installed model version and its held-out AUC', JSON.stringify(G && [G.version, G.skill_metrics]));
console.log('landslide283 ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
