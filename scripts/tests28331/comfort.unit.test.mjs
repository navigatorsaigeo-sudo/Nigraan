/* v91.17.283.31 · owner 2.3 · the discomfort index against known values (Thom 1959 Celsius form, Giles et al. 1990 classes), the page's
   formula is the same, and the 17-28 C bound (DI <= T above 14.5 C: never Severe).   node scripts/tests28331/comfort.unit.test.mjs */
import { readFileSync } from 'node:fs'; import { join, dirname } from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let n = 0, f = 0; const ok = (c, m, i) => { n++; console.log((c ? 'PASS ' : 'FAIL ') + m + (c || i === undefined ? '' : '  :: ' + JSON.stringify(i))); if (!c) f++; };
const C = await import(pathToFileURL(join(ROOT, 'server', 'api', 'comfort.mjs')).href);
const near = (a, b) => Math.abs(a - b) < 0.01;
ok(near(C.thomDI(30, 50), 25.7375), 'T 30 C, RH 50 %: DI 25.74 (30 - 0.55 x 0.5 x 15.5)');
ok(near(C.thomDI(35, 60), 30.49), 'T 35 C, RH 60 %: DI 30.49 (Severe)');
ok(near(C.thomDI(28, 100), 28) && near(C.thomDI(14.5, 0), 14.5), 'saturated air: DI = T; T = 14.5 C: DI = T at any humidity');
ok(C.diClass(20.9).level === 0 && C.diClass(21).level === 1 && C.diClass(24).level === 2 && C.diClass(27).level === 3 && C.diClass(29).level === 4 && C.diClass(32).name === 'State of medical emergency', 'Giles class edges 21 / 24 / 27 / 29 / 32');
let worst = -Infinity; for (let t = 17; t <= 28.0001; t += 0.5) for (let rh = 0; rh <= 100; rh += 5) worst = Math.max(worst, C.thomDI(t, rh));
ok(worst <= 28 + 1e-9 && C.diClass(worst).level < 4, 'air 17-28 C at any humidity: DI at most 28, never Severe (' + worst.toFixed(2) + ')');
ok(C.thomDI(30, null) === null && C.thomDI(30, 120) === null, 'no or impossible humidity: no index (never 0)');
const pg = readFileSync(join(ROOT, 'server', 'science', 'modules', '028-page-script-53.js'), 'utf8');
ok(/return t - 0\.55\*\(1 - 0\.01\*rh\)\*\(t - 14\.5\)/.test(pg) && /\+rh<0\|\|\+rh>100\) return null/.test(pg), 'the page formula is the same Thom Celsius form (v283.35: no humidity clamp; out-of-range refused)');
console.log(`\n${n - f} pass, ${f} fail`); process.exit(f ? 1 : 0);
