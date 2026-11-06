/* v91.17.283.27 . ITEM 4 · THE HOURLY RAIN RUNGS ARE A SCREENING LADDER, offline:
     H1  formula registry flood.rainBands: same rungs (2.3 / 5.3 / 7.2 / 7.7 model mm/h; no served value moves), status screening with the
         reason: the gauge ladder 2 / 7 / 20 / 50 mm/h has no source, and on the 25-year satellite 1-hour AREA levels the rungs are a
         1.0 / 1.03 / 1.15 / 1.21-year event (the top two do not separate); the 1-hour levels cannot replace a model rung without a test
         (their gauge factor failed) and no cited hourly scale applies to a model rate. The register lists the rungs as screening.
     H2  the rarity check is recorded beside the rungs and agrees with the 1-hour levels of the return-level file (recomputed here)
     H3  no reference to the missing data/rain-intensity-rungs.json; the gate entry rain-hour-rungs states the screening ladder (no typed
         2-7-20 ladder); the page's intensity words read the rungs (no typed 2 / 7 / 20 mm/h in the engine)
   usage: node scripts/tests28327/rungs.unit.test.mjs */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const J = (...p) => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + JSON.stringify(i).slice(0, 500) : '')); } };
const RB = J('data', 'formula-registry.json').flood.rainBands;
ok(JSON.stringify(RB.value) === '[2.3,5.3,7.2,7.7]', 'H1a the rungs themselves are unchanged (no served value moves)', RB.value);
ok(/^screening/.test(RB.calibrationStatus) && /no published source/.test(RB.basis) && /AREA rain/.test(RB.basis), 'H1b the rungs are labelled screening, with the reason', RB.calibrationStatus);
const row = J('data', 'thresholds-register.json').rows.find((r) => r.id === 'FR.flood.rainBands');
ok(row && row.status === 'screening', 'H1c the thresholds register lists the rungs as screening (was tested)', row && row.status);
/* H2: recompute the median return period of each rung on the tehsil 1-h GEV fits (x(T) inverted: T = 1 / (1 - F(x))) */
{
  const RL = J('data', 'rain-return-levels.json'); const F = (x, [xi, a, k]) => { const y = k === 0 ? (x - xi) / a : -Math.log(Math.max(1e-12, 1 - k * (x - xi) / a)) / k; return Math.exp(-Math.exp(-y)); };
  const med = (a) => { const s = a.slice().sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
  const T = Object.fromEntries(RB.value.map((r) => [r, med(Object.values(RL.units).map((u) => { const f = F(r, u['1h'].gev); return f >= 1 ? Infinity : 1 / (1 - f); }))]));
  const rc = RB.rarityCheck.modelRungMedianYears;
  ok(Object.entries(T).every(([r, t]) => Math.abs(t - rc[r]) <= 0.03), 'H2a the recorded rarity of each rung agrees with the 1-hour levels of the file', { recomputed: T, recorded: rc });
  ok(Math.abs(T['7.2'] - T['7.7']) < 0.1 && T['7.7'] < 2, 'H2b the top two rungs are the same rarity (both about a 1-year event)', T);
}
{
  const files = ['data/formula-registry.json', 'data/thresholds-register.json', 'data/model-gate.json'];
  ok(!files.some((f) => readFileSync(join(ROOT, f), 'utf8').includes('data/rain-intensity-rungs.json)')), 'H3a no reference to the missing data/rain-intensity-rungs.json');
  const G = J('data', 'model-gate.json').entries.find((e) => e.id === 'rain-hour-rungs');
  ok(!/<2\/2-7\/7-20\/>20/.test(G.method) && /screening/.test(G.method) && G.status === 'experimental', 'H3b the gate entry states the screening ladder, not a typed 2-7-20 ladder', G.method);
  const m57 = readdirSync(join(ROOT, 'server', 'science', 'modules')).find((f) => /031-page-script-57/.test(f));
  const src = readFileSync(join(ROOT, 'server', 'science', 'modules', m57), 'utf8');
  ok(!/kind = mm>=20\?/.test(src) && /_rbk=FR\('flood\.rainBands'\); kind = mm>=_rbk\[2\]/.test(src), 'H3c the engine\'s intensity words read the rungs (no typed 2 / 7 / 20 mm/h)');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
