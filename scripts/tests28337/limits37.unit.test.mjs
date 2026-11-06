/* v91.17.283.37 (NIGRAAN 1.0.1, live 1.0 check of POST /api/limits/evaluate, 30 Oct) · MY SITES / LIMITS: NO LEVEL FROM UNTESTED CUTS
   L1 physical.catchmentRain: no class (Low / Monitor / Watch) and no "no heavy rain signal" word from the untested member-share cuts; the
      facts only (share of members reaching the catchment's 2-year wettest day, the day, the level in mm, the catchment area, the basis) and
      state -5 with the server's word (states.mjs STATE_WORD "Not tested"); a not-assessed catchment is -1 with a plain reason (no file names)
   L2 physical.river: the class comes only from the tested rung of the model-flow ladder (the 5-year flow, bulletin evidence 79 %); no step
      from the untested 20-year rungs; the answer says it is tested and on what
   L3 physical.glof: applicable false -> no route length (routeKm) beside "No glacial lake upstream"
   L4 every reader: the analyst page prints the word (not a class pill) for a catchment without a class; skill text and harness carry no cuts;
      no AI, report or alert module reads physical.catchmentRain
   L5 live (when a server is given): POST /api/limits/evaluate for the two live-check assets
   usage: node scripts/tests28337/limits37.unit.test.mjs [base] */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + JSON.stringify(i).slice(0, 600) : '')); } };
const ST = await import(pathToFileURL(join(API, 'states.mjs')).href);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const lim = strip(readFileSync(join(API, 'limits.mjs'), 'utf8')), cat = strip(readFileSync(join(API, 'catchment.mjs'), 'utf8'));
/* L1 */
ok(/class: null, level: 'heavy rain', state: 'not_tested', code: -5, word: STATE_WORD\['-5'\]/.test(cat) && !/CUT\.(Watch|Monitor|likely)/.test(cat) && !/no heavy rain signal/.test(cat), 'L1 catchment.mjs: no class or "no signal" word from the cuts; state -5 with the states.mjs word');
ok(/physical\.catchmentRain = \{ class: null, state: 'not_tested', code: -5, word: STATE_WORD\['-5'\]/.test(lim) && !/class: HR\.class|word: HR\.word|cuts: HR\.cuts/.test(lim), 'L1 limits.mjs: catchmentRain carries no class, word or cuts from the catchment answer; state -5 and its word');
for (const f of ['memberSharePct', 'peakDay', 'levelMm', 'catchmentKm2', 'basis', 'against']) ok(new RegExp(f + ':').test(lim.slice(lim.indexOf("physical.catchmentRain = { class: null, state: 'not_tested'"))), 'L1 the fact "' + f + '" is kept');
ok(/notAssessed: true, state: 'missing', code: -1, word: STATE_WORD\['-1'\], why: plainWhy\(HR\.why\)/.test(lim), 'L1 a not-assessed catchment: -1 "Not assessed" with a plain reason');
const PW = (() => { const m = /const plainWhy = (\(w\) => [^\n]+);/.exec(lim); return m ? eval(m[1]) : null; })();
ok(PW && !/data\//.test(PW('not assessed: the rain return levels (data/rain-return-levels.json) are not in this install')), 'L1 plain reason: no file name', PW && PW('not assessed: the rain return levels (data/rain-return-levels.json) are not in this install'));
/* L2 */
const fl = readFileSync(join(API, 'flood.mjs'), 'utf8'); const rc = /const cls = q >= lv\.rp5 \? 'Watch' : 'Low';/.test(fl);
ok(rc && !/q >= lv\.rp20 \? '(Act|Severe|High)'/.test(fl), 'L2 the asset river class uses the tested 5-year rung only (Watch / Low), no step from the untested 20-year rungs');
ok(/tested: true, testBasis: 'the 5-year model flow was most often a Medium flood/.test(lim) && !/station-lake\/scripts|data\/river-level-scale\.json/.test(lim.slice(lim.indexOf('physical.river'))), 'L2 the river answer says it is tested and on what; no code text');
/* L3 */
ok(/physical\.glof = \{ class: null, applicable: false, why: GL\.why, counts:/.test(lim), 'L3 GLOF not applicable: no routeKm');
/* L4 */
const mods = readdirSync(join(ROOT, 'server', 'science', 'modules')); const pg = mods.map((m) => readFileSync(join(ROOT, 'server', 'science', 'modules', m), 'utf8')).join('\n');
ok(/P\.catchmentRain\.class\?cc\(P\.catchmentRain\.class\):'<span class="opsx-state nt" data-code="'\+esc\(P\.catchmentRain\.code\)\+'">'\+esc\(P\.catchmentRain\.word\|\|'Not tested'\)/.test(pg), 'L4 the analyst page prints the server word for a catchment without a class (no class pill, no "Normal")');
const others = readdirSync(API).filter((f) => /\.mjs$/.test(f) && !['limits.mjs', 'catchment.mjs', 'skill.mjs', 'index.mjs'].includes(f)).filter((f) => /catchmentRain|heavyRain\(/.test(readFileSync(join(API, f), 'utf8')));
ok(others.length === 0, 'L4 no AI, report, alert or other module reads the catchment class', others);
ok(!/Monitor 10 \/ Watch 30/.test(readFileSync(join(API, 'skill.mjs'), 'utf8')), 'L4 skill text carries no cuts');
ok(ST.STATE_WORD['-5'] === 'Not tested' && ST.STATE_WORD['-1'] === 'Not assessed', 'L4 the words come from states.mjs');
/* L5 live */
const BASE = process.argv.slice(2).find((a) => /^https?:\/\//.test(a)) || process.env.NIGRAAN_BASE || process.env.BASE || null;
if (BASE) {
  const body = { assets: [{ id: 'Multan test', name: 'Multan test', lat: 30.1984, lon: 71.4687, limits: [] }, { id: 'Lahore test', name: 'Lahore test', lat: 31.5204, lon: 74.3587, limits: [] }] };
  const r = await fetch(BASE + '/api/limits/evaluate', { method: 'POST', headers: { 'content-type': 'application/json', 'x-agn-view': 'customer' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => null);
  ok(r.status === 200 && j && j.ok, 'L5 POST /api/limits/evaluate answers (customer view)', r.status + ' ' + JSON.stringify(j).slice(0, 200));
  for (const a of (j && j.assets) || []) { const P = a.physical || {}, C = P.catchmentRain, G = P.glof;
    if (C) ok(C.class == null && (C.code === -5 || C.code === -1) && C.word === ST.STATE_WORD[String(C.code)] && !C.cuts && !/no heavy rain signal/.test(JSON.stringify(C)), 'L5 ' + a.name + ': catchment rain without a class, word "' + (C && C.word) + '"', C);
    else ok(true, 'L5 ' + a.name + ': no catchment answer on this server (catchment data absent)');
    if (G && G.applicable === false) ok(!('routeKm' in G), 'L5 ' + a.name + ': GLOF not applicable without routeKm', G);
    if (P.river && P.river.class) ok(['Low', 'Watch'].includes(P.river.class) && P.river.tested === true, 'L5 ' + a.name + ': river class from the tested rung only', P.river);
    ok(!/data\/|station-lake\/|\.py\b|\.json\b/.test(JSON.stringify(P)), 'L5 ' + a.name + ': no code text in the physical check', JSON.stringify(P).match(/.{40}(data\/|station-lake\/|\.py\b|\.json\b).{40}/)); }
}
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
