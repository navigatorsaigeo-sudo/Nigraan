/* v91.17.283.33 · Scenario Lab flood outcome (server/api/floodoutcome.mjs, data/flood-outcome-model.json), no server needed:
     F1  the served file is the candidate model unchanged (version, coefficients, bootstrap) and its sha256 is the register row's
     F2  the served function reproduces every worked example of the candidate (central value and 90 % range, 4 decimals)
     F3  outside the trained rain range (mountain 0-74 mm, plains 0-84 mm): "not modelled" with the reason
     F4  monotone: more rain or wetter ground never lowers the chance (central value and both range ends)
     F5  Karachi: "not modelled" with the reason; a place outside the trained districts: "not modelled"
     F6  the answer carries the label, the duration note and "display only"; the usual rate reads "about 1 day in N"
     F7  only the Scenario Lab reads it: no other server module and no map or alert path imports floodoutcome.mjs */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FO = await import(join(ROOT, 'server', 'api', 'floodoutcome.mjs'));
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 600) : '')); } };
const file = join(ROOT, 'data', 'flood-outcome-model.json'), M = JSON.parse(readFileSync(file, 'utf8'));
const sha = createHash('sha256').update(readFileSync(file)).digest('hex');
const REG = JSON.parse(readFileSync(join(ROOT, 'data', 'thresholds-register.json'), 'utf8')).rows.find((r) => r.id === 'floodOutcome.model');
ok(!!REG && REG.value.sha256 === sha, 'F1 register row floodOutcome.model carries the file sha256', REG && REG.value.sha256 + ' vs ' + sha);
ok(M.version === 'flood-outcome-candidate-scen33' && M.coef.length === 7 && M.bootstrap.sets.length === 200 && M.pass.mountain && M.pass.plains, 'F1 the candidate model, both regions passed the locked test');
/* F2: the candidate examples used mountain (MTN 0.9, LOWH 0.05) and plains (MTN 0, LOWH 0.8) districts */
const TER = { 'mountain district': [0.05, 0.9], 'plains district': [0.8, 0.0] };
for (const e of M.examples) { const [LOWH, MTN] = TER[e.place]; const r = FO.predict(M, e.R24, e.I1, e.W, LOWH, MTN); const q = (x) => Math.round(x * 1e4) / 1e4;
  ok(Math.abs(q(r.p) - e.p) <= 1e-4 && Math.abs(q(r.p5) - e.p5) <= 1e-4 && Math.abs(q(r.p95) - e.p95) <= 1e-4, 'F2 ' + e.place + ' ' + e.R24 + ' mm, wetness ' + e.W + ' = ' + e.p + ' [' + e.p5 + ', ' + e.p95 + ']', JSON.stringify(r)); }
/* the module with a stub app: the data dir is the tree's own data/ */
const mk = (api15Mm) => FO.createFloodOutcome({ climatology: { droughtNational: () => ({ spi: new Proxy({}, { get: () => (api15Mm == null ? null : { api: { api15Mm, asOf: '2026-10-28' } }) }) }) } }, { dataDir: join(ROOT, 'data') });
const D = M.districts; const mtn = D.find((d) => d.covered && d.region === 'mountain'), pln = D.find((d) => d.covered && d.region === 'plains');
const A = mk(20);
for (const [d, hi] of [[mtn, 74], [pln, 84]]) { const uid = d.tehsils[0];
  const a = A.answer({ uid, day: '2026-10-29', baseMm: 10, scenMm: hi + 30, wetPct: 50 });
  ok(a.modelled && a.baseline.modelled && !a.scenario.modelled && /^not modelled: .*outside the trained rain range/.test(a.scenario.why) && a.scenario.why.indexOf(String(hi)) >= 0, 'F3 ' + d.region + ': ' + (hi + 30) + ' mm is not modelled, with the range', JSON.stringify(a.scenario));
  const b = A.answer({ uid, day: '2026-10-29', baseMm: hi - 1, scenMm: hi - 1, wetPct: 50 }); ok(b.scenario.modelled, 'F3 ' + d.region + ': ' + (hi - 1) + ' mm is modelled', JSON.stringify(b.scenario)); }
for (const d of [mtn, pln]) { const uid = d.tehsils[0]; let prev = null, okR = true, okW = true;
  for (let mm = 0; mm <= 70; mm += 5) { const a = A.answer({ uid, baseMm: mm, scenMm: mm, wetPct: 60 }).scenario; if (prev && (a.p < prev.p - 1e-12 || a.p5 < prev.p5 - 1e-12 || a.p95 < prev.p95 - 1e-12)) okR = false; prev = a; }
  prev = null; for (let w = 0; w <= 100; w += 10) { const a = A.answer({ uid, baseMm: 40, scenMm: 40, wetPct: w }).scenario; if (prev && (a.p < prev.p - 1e-12 || a.p5 < prev.p5 - 1e-12 || a.p95 < prev.p95 - 1e-12)) okW = false; prev = a; }
  ok(okR, 'F4 ' + d.region + ' ' + d.district + ': more rain never lowers the chance (central value and range)');
  ok(okW, 'F4 ' + d.region + ' ' + d.district + ': wetter ground never lowers the chance (central value and range)'); }
const KA = D.filter((d) => /Karachi|Korangi|Malir|Keamari/.test(d.district)); ok(KA.length === 7 && KA.every((d) => !d.covered), 'F5 the 7 Karachi districts are not covered', KA.map((d) => d.district + ':' + d.covered).join(', '));
{ const k = A.answer({ uid: KA[0].tehsils[0] || 'Sindh|Karachi|x', baseMm: 30, scenMm: 60, wetPct: 50 }); ok(!k.modelled && /^not modelled: Karachi is not covered/.test(k.why), 'F5 Karachi answer: not modelled with the reason', JSON.stringify(k).slice(0, 300)); }
{ const k = A.answer({ uid: 'Nowhere|None|None', baseMm: 30, scenMm: 60, wetPct: 50 }); ok(!k.modelled && /^not modelled: this place is outside/.test(k.why), 'F5 a place outside the trained districts: not modelled'); }
{ const a = mk(null).answer({ uid: mtn.tehsils[0], baseMm: 10, scenMm: 40 }); ok(!a.modelled && /not held yet; set the ground wetness/.test(a.why), 'F5 no current wetness held and none set: not modelled, asks for the wetness', a.why); }
{ const a = A.answer({ uid: mtn.tehsils[0], day: '2026-10-29', baseMm: 10, scenMm: 40 }); ok(a.modelled && a.wetness && !a.wetness.set && /current 60-day rain percentile/.test(a.wetness.basis), 'F5 default wetness = the place’s current 60-day rain percentile', JSON.stringify(a.wetness)); }
{ const a = A.answer({ uid: pln.tehsils[0], day: '2026-10-29', baseMm: 10, scenMm: 60, wetPct: 90 });
  ok(a.label === 'district-level chance, not a site forecast; river floods and lake bursts not included', 'F6 label', a.label);
  ok(a.durationNote === 'intensity and duration: not modelled separately (added nothing beyond the day total in testing)', 'F6 duration note', a.durationNote);
  ok(/never an alert, never in the live forecast or on the map/.test(a.display), 'F6 display only', a.display);
  ok(/^about 1 day in \d+$/.test(a.scenario.rate) && a.scenario.range90.length === 2, 'F6 usual rate and 90 % range', JSON.stringify(a.scenario)); }
ok(FO.rateWords(0.01) === 'about 1 day in 100' && FO.rateWords(0.113) === 'about 1 day in 9' && FO.rateWords(0.0013) === 'about 1 day in 770', 'F6 rate words', [FO.rateWords(0.01), FO.rateWords(0.113), FO.rateWords(0.0013)].join(' | '));
{ const users = readdirSync(join(ROOT, 'server', 'api')).filter((f) => f.endsWith('.mjs') && f !== 'floodoutcome.mjs' && /floodoutcome|floodOutcome/.test(readFileSync(join(ROOT, 'server', 'api', f), 'utf8')));
  ok(JSON.stringify(users.sort()) === JSON.stringify(['index.mjs', 'scenario.mjs']), 'F7 only the scenario run (and its wiring) reads the flood outcome', users.join(', '));
  const idx = readFileSync(join(ROOT, 'server', 'api', 'index.mjs'), 'utf8').split('\n').filter((l) => /floodOutcome|floodoutcome/.test(l));
  ok(idx.length === 2 && idx.every((l) => /createFloodOutcome/.test(l)), 'F7 index.mjs only creates it', idx.join(' | ')); }
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
