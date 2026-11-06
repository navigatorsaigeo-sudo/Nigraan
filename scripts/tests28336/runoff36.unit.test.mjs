/* v91.17.283.36 · launch item 6 · RUNOFF PER STORM: fixed reference cases (not agreement with the old method). The expected values are worked
   by hand from the NRCS equation Q = (P - 0.2 S)^2 / (P + 0.8 S), S = 25400 / CN - 254, CN 80 at AMC II (S 63.5 mm, Ia 12.7 mm);
   AMC I / III by NEH-4 (CN 62.7 / 90.2). usage: node scripts/tests28336/runoff36.unit.test.mjs [tree] */
import { join, dirname } from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = (process.argv[2] && !/^https?:/.test(process.argv[2]) ? process.argv[2] : null) || join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let n = 0, f = 0; const ok = (c, m, i) => { n++; console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : '  :: ' + String(JSON.stringify(i)).slice(0, 300))); if (!c) f++; };
let HZ = {}; try { HZ = await import(pathToFileURL(join(ROOT, 'server/api/hazsci.mjs')).href); } catch (e) { HZ = {}; }
const Q = (P, cn) => { const S = 25400 / cn - 254, ia = 0.2 * S; return P <= ia ? 0 : (P - ia) ** 2 / (P + 0.8 * S); };
const CN = { 1: 80 / (2.281 - 0.01281 * 80), 2: 80, 3: 80 / (0.427 + 0.00573 * 80) };
const run = (mm, am) => Q(mm, CN[am]);
const T0 = Date.parse('2026-10-20T00:00:00+05:00'), H = 3600e3;
const series = (spec) => { const a = []; for (let k = -120; k < 5 * 24; k++) a.push({ t: T0 + k * H, mm: 0 }); for (const [h, mm] of spec) a[h + 120].mm = mm; return a; };
const has = typeof HZ.stormRunoff === 'function';
ok(has, 'stormRunoff exists (per-storm NRCS runoff from hourly rain)');
if (has) {
  /* case 1 · a storm crossing midnight: 20 mm 22:00-23:59 and 20 mm 00:00-01:59 = ONE storm of 40 mm (AMC I: no rain before) */
  { const r = HZ.stormRunoff(series([[22, 10], [23, 10], [24, 10], [25, 10]]), T0, T0 + 5 * 24 * H, run), want = run(40, 1);
    ok(r.ok && r.storms.length === 1 && Math.abs(r.runoffMm - Math.round(want * 10) / 10) < 0.051, 'case 1 storm crossing midnight: one storm of 40 mm, Q = ' + want.toFixed(1) + ' mm (per day it was 2 x Q(20) = ' + (2 * run(20, 1)).toFixed(1) + ' mm)', r); }
  /* case 2 · two storms with a dry gap of 8 h on one day: 30 mm 02:00-04:59, 30 mm 13:00-15:59 = TWO storms; the second at the AMC of the first */
  { const r = HZ.stormRunoff(series([[2, 10], [3, 10], [4, 10], [13, 10], [14, 10], [15, 10]]), T0, T0 + 5 * 24 * H, run), want = run(30, 1) + run(30, 1);
    ok(r.ok && r.storms.length === 2 && Math.abs(r.runoffMm - Math.round(want * 10) / 10) < 0.051, 'case 2 two storms with an 8 h dry gap: two storms, Q = ' + want.toFixed(1) + ' mm (one day total 60 mm gave ' + run(60, 1).toFixed(1) + ')', r);
    const r2 = HZ.stormRunoff(series([[2, 10], [3, 10], [4, 10], [9, 10], [10, 10], [11, 10]]), T0, T0 + 5 * 24 * H, run);
    ok(r2.ok && r2.storms.length === 1, 'case 2b a 4 h dry gap (under 6 h) keeps one storm', r2); }
  /* case 3 · incomplete hourly data: one hour missing in the window -> not per storm (the per-day method is used, said so) */
  { const s = series([[30, 20]]); s.splice(140, 1); const r = HZ.stormRunoff(s, T0, T0 + 5 * 24 * H, run);
    ok(r.ok === false && /incomplete/.test(r.why), 'case 3 incomplete hourly data: no per-storm result (falls back to per day, labelled)', r); }
  /* case 4 · changing wetness: 40 mm on day 1 then 40 mm on day 3: the second storm sees 40 mm in its 5 days before (AMC II), the first AMC I */
  { const r = HZ.stormRunoff(series([[10, 20], [11, 20], [58, 20], [59, 20]]), T0, T0 + 5 * 24 * H, run), want = run(40, 1) + run(40, 2);
    ok(r.ok && r.storms.length === 2 && r.storms[0].amc === 1 && r.storms[1].amc === 2 && Math.abs(r.runoffMm - Math.round(want * 10) / 10) < 0.051, 'case 4 changing wetness: AMC I then II, Q = ' + want.toFixed(1) + ' mm', r); }
}
console.log('\n' + (n - f) + '/' + n + ' passed'); process.exit(f ? 1 : 0);
