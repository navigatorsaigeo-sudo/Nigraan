// v91.17.283.6 item 5 · above the highest training station (natmodel.mjs heightNote, verification.mjs recentreRange90).
//  X1 the highest training station is read from data/national-model.json (bias.stations), not typed: 4,669 m in the shipped model
//  X2 a point at or below top + marginM (data/height-extrapolation.json) carries no label; above it: confidence "lower" with the measured
//     warm bias and its interval in the label
//  X3 the shipped decision (widen.serve false: the held-out rule failed at the 4,000 m ceiling) widens nothing: lo90 / hi90 unchanged
//  X4 with widen.serve true (a test copy of the file) the cold side moves down by exactly widen.lowerC, the warm side and the central
//     value do not move, once per response (a second pass changes nothing), and the shared lo array of agn_range90 is moved once
//  X5 the data file is the test's own output: margin, bias, interval and the serve flag equal scripts/gen/sci/h5_height_range.json
// usage: node scripts/tests2836/height_x.test.mjs
import { readFileSync, mkdtempSync, writeFileSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + String(d).slice(0, 600) : '')); } };
const { createNational } = await import(pathToFileURL(join(APP, 'server/api/natmodel.mjs')).href);
const { lift } = await import(pathToFileURL(join(APP, 'scripts/tests2833/srvfix/lib.mjs')).href);
const D = join(APP, 'data'); const X = JSON.parse(readFileSync(join(D, 'height-extrapolation.json'), 'utf8'));
const NM = JSON.parse(readFileSync(join(D, 'national-model.json'), 'utf8')); const top0 = Math.max(...NM.bias.stations.map((s) => Number(s.elev)));
const N = createNational({ dataDir: D });
ok(N.topStationM() === top0 && top0 === 4669, 'X1 highest training station read from the model file', N.topStationM());
const m = X.marginM;
ok(N.heightNote(top0) === null && N.heightNote(top0 + m) === null && N.heightNote(3000) === null, 'X2a no label at or below top + ' + m + ' m');
const h = N.heightNote(top0 + m + 331);
ok(h && h.confidence === 'lower' && h.aboveTopM === m + 331 && h.topStationM === top0 && h.warmBiasC === X.warmBiasC.mean && /Lower confidence: this point is 631 m above the highest station the temperature model was trained on \(4,669 m\)/.test(h.label) && /2\.2 °C too warm on average \(95 % interval 1\.5 to 2\.7 °C\)/.test(h.label), 'X2b label above it, with the measured warm bias and interval', h && h.label);
ok(h && h.widened === false && h.widenLowerC === 0 && /did not pass its held-out test/.test(h.label) && X.widen.serve === false, 'X3a shipped decision: no widening served, the label says so');
const fnText = lift(readFileSync(join(APP, 'server/api/verification.mjs'), 'utf8'), 'recentreRange90');
const recentre = new Function('mosApi', 'range90Zone', 'scaleRange90', 'return ' + fnText)(null, () => null, () => 0);
const mk = (hx) => { const lo = [10, 11, 12], hi = [14, 15, 16]; const H = { time: ['a', 'b', 'c'], temperature_2m: [12, 13, 14] }; Object.defineProperty(H, '__natSv', { value: [12, 13, 14], writable: true, configurable: true });
  Object.defineProperty(H, 'agn_range90', { value: { lo, hi }, configurable: true }); return { hourly: H, agn_national: { range90: { lo, hi }, ...(hx ? { heightExtrapolation: hx } : {}) } }; };
let L = mk(h); recentre(L);
ok(JSON.stringify(L.agn_national.range90) === JSON.stringify({ lo: [10, 11, 12], hi: [14, 15, 16] }), 'X3b shipped decision: lo90 / hi90 unchanged');
const T = mkdtempSync(join(tmpdir(), 'hx-')); symlinkSync(join(D, 'national-model.json'), join(T, 'national-model.json'));
writeFileSync(join(T, 'height-extrapolation.json'), JSON.stringify({ ...X, widen: { ...X.widen, serve: true } }));
const h2 = createNational({ dataDir: T }).heightNote(top0 + 1000);
ok(h2 && h2.widened === true && h2.widenLowerC === X.widen.lowerC && /widened by 2\.0 °C on the cold side/.test(h2.label), 'X4a serve true: label and amount from the file', h2 && h2.label);
L = mk(h2); recentre(L); const R1 = JSON.stringify(L.agn_national.range90); recentre(L);
ok(R1 === JSON.stringify({ lo: [7.96, 8.96, 9.96].map((v) => Math.round(v * 10) / 10), hi: [14, 15, 16] }) && JSON.stringify(L.agn_national.range90) === R1 && JSON.stringify(L.hourly.temperature_2m) === '[12,13,14]', 'X4b cold side down by widen.lowerC once, warm side and central value unchanged', R1);
const R = JSON.parse(readFileSync(join(APP, 'scripts/gen/sci/h5_height_range.json'), 'utf8'));
ok(X.marginM === R.marginM && X.warmBiasC.mean === R.extrapolationBias.hourWeightedMeanC && JSON.stringify(X.warmBiasC.ci95) === JSON.stringify(R.extrapolationBias.ci95C) && X.widen.serve === !!R.candidate2_pass && X.widen.lowerC === R.candidate2_B_C, 'X5 data file = the held-out test output');
console.log(`\nheight_x ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
