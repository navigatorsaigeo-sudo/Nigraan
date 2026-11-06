// v91.17.283.3 · SCI item 6 · audit C9 · snow still lying for rain-on-snow: 5-day degree-day pack instead of the 5-day snowfall sum.
// usage: node scripts/tests2833/sci/c9_snowpack.test.mjs     (no server, no network)
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { APP, mod, ok, done } from './lib.mjs';
const F = join(APP, 'data', 'snowpack-ddf.json'); ok(existsSync(F), 'data/snowpack-ddf.json present');
const P = existsSync(F) ? JSON.parse(readFileSync(F, 'utf8')) : {};
ok(P.served === true && P.ddf >= P.ddfBounds[0] && P.ddf <= P.ddfBounds[1] && /Hock/.test(P.ddfSource || ''), 'DDF inside the published snow range (Hock 2003)', String(P.ddf));
ok(P.test && P.test.heldOut.dailyMeanT.pssDiffCi[0] > 0 && P.test.heldOut.tmaxTminMean.pssDiffCi[0] > 0, 'held-out winter: paired Peirce CI above 0 (daily mean T and (Tmax+Tmin)/2)');
const M = await mod('server/api/outlook.mjs');
ok(typeof M.lyingSnowCm === 'function', 'outlook exports lyingSnowCm');
if (typeof M.lyingSnowCm === 'function') {
  /* AUDIT283 C9 repro: 5 cm of snow, then four days with a 15 C maximum -> the old rule says 5 cm still lying */
  const sn = [5, 0, 0, 0, 0, 0], tx = [-2, 15, 15, 15, 15, 15], tn = [-8, 3, 3, 3, 3, 3];
  const old = sn.slice(0, 5).reduce((a, b) => a + b, 0);
  const L = M.lyingSnowCm(sn, tx, tn, 5, P);
  ok(old === 5 && L === 0, 'AUDIT C9 case: 5 cm then four 15 C days -> melted (0 cm), the old sum said 5 cm', String(L));
  const cold = M.lyingSnowCm([5, 2, 0, 0, 0, 0], [-5, -4, -6, -3, -2, 0], [-12, -10, -14, -11, -9, -8], 5, P);
  ok(Math.abs(cold - 7) < 1e-9, 'cold days: nothing melts, the pack equals the 5-day sum (7 cm)', String(cold));
  const part = M.lyingSnowCm([10, 0, 0, 0, 0, 0], [-1, 4, -3, -3, -3, -3], [-9, -2, -9, -9, -9, -9], 5, P);
  ok(Math.abs(part - (10 / 0.7 - P.ddf * 1) * 0.7) < 1e-9, 'one day at mean 1 C melts ddf x 1 mm', String(part));
  ok(M.lyingSnowCm([5, 0, 0, 0, 0, 0], [0, null, 0, 0, 0, 0], [-5, -5, -5, -5, -5, -5], 5, P) === null, 'a window day without Tmax -> not assessed (null), never the old sum');
  ok(M.lyingSnowCm(sn, tx, tn, 5, { ddf: 0 }) === null, 'no DDF -> null');
}
const src = readFileSync(join(APP, 'server', 'api', 'outlook.mjs'), 'utf8');
ok(/snowpack-ddf\.json/.test(src) && /lyingSnowCm\(sn, tx, tn, k, spk\)/.test(src), 'the rain-on-snow member test reads the pack');
done();
