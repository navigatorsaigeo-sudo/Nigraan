#!/usr/bin/env node
/* v91.17.283.15 · rainprob.mjs unit tests (no server, no network).
   Usage: node scripts/tests28315/rainprob.test.mjs  (server/api/rainprob.mjs, data/rain-prob-coefs.json, scripts/tests28315/rain_parity_vectors.json)
   Prints PASS / FAIL per check; exit 1 on any FAIL. */
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..'), A2 = process.argv.slice(2).filter((x) => !/^https?:/.test(x));   /* v283.15: module in server/api, coefficients in data, vectors beside this test */
const M = await import(pathToFileURL(join(ROOT, 'server', 'api', 'rainprob.mjs')).href);
const C = JSON.parse(readFileSync(join(ROOT, 'data', 'rain-prob-coefs.json'), 'utf8'));
const V = JSON.parse(readFileSync(join(HERE, 'rain_parity_vectors.json'), 'utf8'));
let fails = 0, passes = 0;
const check = (name, ok, detail = '') => { if (ok) passes++; else fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : '')); };

// 1 parity with the Python fit (the probabilities scored in RESULTS_RAIN.md)
let worst = 0; for (const t of V) { const r = M.rainClassProbs(C, t.v, t.nAll, t.ctx); t.p.forEach((q, j) => { worst = Math.max(worst, Math.abs(r.p[String(M.RAIN_CLASS_MM[j])] - q)); }); }
check('1 parity with the fitted model on ' + V.length + ' vectors (max |diff| < 1e-6)', worst < 1e-6, 'max diff ' + worst.toExponential(2));
// 2 coverage rule kept: fewer than half the members valid -> not assessed
const few = M.rainClassProbs(C, Array(20).fill(30), 51, { zone: 'plains', month: 7, lead: 1 });
check('2 fewer than ceil(N/2) valid members -> p null with the reason', few.p === null && /at least 26/.test(few.why), few.why);
check('2b nulls and NaN are not members', M.memberStats([1, null, NaN, 3]).n === 2);
// 3 monotone across classes and inside [0.001, 0.999]
let mono = true, inr = true; for (const t of V) { const r = M.rainClassProbs(C, t.v, t.nAll, t.ctx); const p = M.RAIN_CLASS_MM.map((k) => r.p[String(k)]);
  for (let j = 1; j < 4; j++) if (p[j] > p[j - 1] + 1e-12) mono = false; for (const q of p) if (q < 0.001 - 1e-12 || q > 0.999 + 1e-12) inr = false; }
check('3 P(>=64.5) <= P(>=15.6) <= ... (monotone)', mono); check('3b probabilities inside [0.001, 0.999]', inr);
// 4 a wetter forecast of the same shape (every member scaled up) never lowers the probability, all zones / leads / months.
//   (A degenerate ensemble with sd = 0 lies outside the fitted domain and is not part of this check: see RESULTS_RAIN.md.)
const SHAPE = [0, 0, 0, 0, 0.1, 0.2, 0.3, 0.5, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 30, 33, 36, 40, 44, 48, 52, 57, 62, 68, 75, 82, 90, 100];
let up = true, bad = ''; for (const z of ['plains', 'hills', 'mountain', 'coast']) for (const lead of [1, 2, 3]) for (let month = 1; month <= 12; month++) for (let ci = 0; ci < 4; ci++) { let prev = -1;
  for (const sc of [0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1, 1.5, 2, 3]) { const q = M.rainClassProbs(C, SHAPE.map((a) => a * sc), 51, { zone: z, month, lead }).p[String(M.RAIN_CLASS_MM[ci])]; const tol = 0.005; /* the export removes any zone cell that drops more than 0.5 pp (RESULTS deviation 3); pooled cells are held to the same 0.5 pp */ if (q < prev - tol) { up = false; bad = z + ' lead ' + lead + ' month ' + month + ' class ' + M.RAIN_CLASS_MM[ci]; } prev = q; } }
check('4 every member scaled up (same ensemble shape): P never falls by more than 0.5 pp', up, bad);
// 5 a screening class never sets the level; the level only comes from tested classes and the training cuts
let lvOk = true; for (const t of V) { const r = M.rainClassProbs(C, t.v, t.nAll, t.ctx); const L = M.rainLevel(C, r);
  for (const k of L.classes) if (r.status[k] !== 'tested' || r.p[k] < C.cuts[k]) lvOk = false;
  const top = M.RAIN_CLASS_MM.map(String).filter((k) => r.status[k] === 'tested' && r.p[k] >= C.cuts[k]).map((k) => M.RAIN_CLASS_MM.map(String).indexOf(k) + 1);
  if (L.L !== (top.length ? Math.max(...top) : 0)) lvOk = false; }
check('5 level = highest tested class at or above its cut; screening classes never set it', lvOk);
const anyTested = Object.values(C.gate).some((g) => g.tested);
const allScr = JSON.parse(JSON.stringify(C)); for (const g of Object.values(allScr.gate)) { g.tested = false; for (const z in g.zones) g.zones[z] = false; }
check('5b with every class screening the level is 0 even at 300 mm in all members', M.rainLevel(allScr, M.rainClassProbs(allScr, Array(51).fill(300), 51, { zone: 'plains', month: 7, lead: 1 })).L === 0);
// 6 outside lead days 1-3: raw share, labelled uncalibrated + screening
const l5 = M.rainClassProbs(C, [...Array(26).fill(20), ...Array(25).fill(0)], 51, { zone: 'plains', month: 7, lead: 5 });
check('6 lead 5 -> raw share 26/51, uncalibrated, screening', l5.calibrated === false && Math.abs(l5.p['15.6'] - 26 / 51) < 1e-12 && l5.status['15.6'] === 'screening');
// 7 no place in the coefficients: cell keys are zone|regime|lead|class only
const keyOk = Object.keys(C.cells).every((k) => /^(\*|plains|hills|mountain|coast)\|(\*|monsoon|rest)\|[123]\|(15\.6|64\.5|115\.6|204\.5)$/.test(k));
check('7 coefficient cells are keyed by zone / regime / lead / class only (no place)', keyOk);
// 8 drop-in shape for outlook.mjs row.prc
const d = M.rainClassSharesCalibrated(C, Array(51).fill(70), 51, { zone: 'plains', month: 8, lead: 1 });
check('8 rainClassSharesCalibrated: percentages, status, level present', d.p && typeof d.p['15.6'] === 'number' && d.status && Number.isInteger(d.L), JSON.stringify(d));
console.log((fails ? 'FAILED ' : 'ALL PASS ') + passes + ' passed, ' + fails + ' failed' + (anyTested ? '' : ' (note: no class x lead is tested in this coefficient file)'));
process.exit(fails ? 1 : 0);
