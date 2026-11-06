/* v91.17.283.34 · Scenario Lab B site change (server/api/sitechange.mjs), no server needed:
     S1  every unit vector of the specification (runoff, Kirpich, Bell, TR-55, slope factor) to its stated precision
     S2  every worked case: the full result of the reference sitechange.py, key by key, EXACTLY (rounding included)
     S3  the AFTER shares from the controls: sum to 1, refused (never rescaled) when the parts exceed the site
     S4  the slope flag: >= 25 deg, or >= 15 deg in a high/very high tehsil; label "not a stability analysis"
     S5  the vegetation "after" is the cover-weighted typical index (green roof = grass, paving = built); missing cover -> null with why
     S6  the fixed labels: engineering estimate, heat direction with no number, air heat "not modelled"; valid up to 80 ha
     S7  geometry: a 2 ha square reads 2 ha; inside-ring test */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const M = await import(join(ROOT, 'server', 'api', 'sitechange.mjs'));
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 600) : '')); } };
const V = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'sitechange_vectors.json'), 'utf8'));
const r3 = (x) => M.pyRound(x, 3), r4 = (x) => M.pyRound(x, 4);
for (const u of V.units.runoff_mm) ok(r3(M.runoffMm(u.P, u.cn, u.f)) === u.q, 'S1 runoff P ' + u.P + ' CN ' + u.cn + ' f ' + u.f + ' = ' + u.q, M.runoffMm(u.P, u.cn, u.f));
for (const u of V.units.kirpich) ok(M.pyRound(M.kirpichMin(u.L, u.S, u.sealed), 1) === u.tc, 'S1 Kirpich L ' + u.L + ' S ' + u.S + ' sealed ' + u.sealed + ' = ' + u.tc);
for (const u of V.units.bell) ok(r4(M.bellRatio(u.D)) === u.r, 'S1 Bell ' + u.D + ' min = ' + u.r, M.bellRatio(u.D));
for (const u of V.units.tr55) ok(r4(M.tr55StorageRatio(u.alpha)) === u.ratio, 'S1 TR-55 alpha ' + u.alpha + ' = ' + u.ratio, M.tr55StorageRatio(u.alpha));
for (const u of V.units.f_slope) ok(M.fSlope(u.slope) === u.f, 'S1 slope factor ' + u.slope + ' % = ' + u.f);
const deep = (a, b, p, bad) => { if (a && typeof a === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b || {})])) deep(a[k], (b || {})[k], p + '.' + k, bad); } else if (a !== b) bad.push(p + ': ' + a + ' vs ' + b); return bad; };
for (const c of V.cases) { const r = M.scenarioCalc(c.A_m2, c.L_m, c.slope_pct, c.hsg, c.before, c.after, c.rl, c.pond_m3);
  const bad = deep(c.result, r, c.name, []); ok(!bad.length, 'S2 ' + c.name + ': every value of the reference result, exactly (' + Object.keys(c.result).length + ' return periods)', bad.join('; ')); }
/* S3 */
const before = { trees: 0.3, grass: 0.6, bare: 0.1 };
let A = M.afterShares(before, { built: 0.7 }); const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
ok(A.ok && Math.abs(sum(A.after) - 1) < 1e-9 && Math.abs(A.after.built - 0.7) < 1e-12 && Math.abs(A.after.trees - 0.09) < 1e-9 && Math.abs(A.after.grass - 0.18) < 1e-9, 'S3 70 % built: the rest keeps the present mix (trees 9 %, grass 18 %, bare 3 %), sum 1', JSON.stringify(A));
A = M.afterShares(before, { built: 0.35, greenRoof: 0.35, treesDelta: 0.01 });
ok(A.ok && Math.abs(sum(A.after) - 1) < 1e-9 && A.after.green_roof === 0.35 && Math.abs(A.after.trees - 0.1) < 1e-9, 'S3 green roof + 1 % trees added: trees 10 %, sum 1', JSON.stringify(A));
A = M.afterShares(before, { built: 0.8, permeable: 0.3 }); ok(!A.ok && /exceed/.test(A.why), 'S3 parts over 100 % refused, never rescaled', JSON.stringify(A));
A = M.afterShares(before, { built: 0.5, treesDelta: -0.4 }); ok(!A.ok && /more trees removed/.test(A.why), 'S3 removing more trees than are left refused', JSON.stringify(A));
A = M.afterShares(before, { built: 1.2 }); ok(!A.ok, 'S3 a share above 1 refused');
A = M.afterShares({ trees: 0.2, grass: 0.5, built: 0.3 }, {}); ok(A.ok && Math.abs(A.after.built - 0.3) < 1e-12 && Math.abs(A.after.trees - 0.2) < 1e-12 && Math.abs(A.after.grass - 0.5) < 1e-12, 'S3 no control set: the ground stays as it is (after = before)', JSON.stringify(A));
/* the S2 worked case from the controls: green roof case = built 0.35 + green roof 0.35, trees 0.1, grass 0.2 */
A = M.afterShares({ trees: 0.25, grass: 0.5, bare: 0.25 }, { built: 0.5 }); ok(A.ok && Math.abs(A.after.bare - 0.125) < 1e-12, 'S3 proportional rest (bare 12.5 %)', JSON.stringify(A));
/* S4 */
ok(M.slopeFlag(26, 2).flag && M.slopeFlag(26, 2).text === 'steep cut/fill — needs a geotechnical check', 'S4 26 deg face: flagged');
ok(!M.slopeFlag(20, 3).flag && M.slopeFlag(20, 4).flag && M.slopeFlag(15, 5).flag && !M.slopeFlag(14.9, 5).flag, 'S4 15 deg rule only in a high/very high tehsil');
ok(/not a stability analysis/.test(M.slopeFlag(10, 1).label) && M.slopeFlag(null, 1).flag === false, 'S4 label; no face given: no flag');
/* S5 */
const typ = { trees: { ndvi: 0.6, ndmi: 0.15 }, grass: { ndvi: 0.5, ndmi: 0.06 }, built: { ndvi: 0.2, ndmi: 0.0 } };
let I = M.afterIndex({ built: 0.5, green_roof: 0.2, permeable_paving: 0.1, trees: 0.2 }, typ, 'ndvi');
ok(Math.abs(I.value - (0.5 * 0.2 + 0.2 * 0.5 + 0.1 * 0.2 + 0.2 * 0.6)) < 1e-9, 'S5 after NDVI = cover-weighted typical (green roof as grass, paving as built)', JSON.stringify(I));
I = M.afterIndex({ built: 0.5, crops: 0.5 }, typ, 'ndvi'); ok(I.value === null && /crops/.test(I.why), 'S5 a cover with no nearby ground: no value, the reason', JSON.stringify(I));
/* S6 */
ok(/not a forecast and not a design approval/.test(M.LABEL) && /Engineering estimate by standard method/.test(M.LABEL), 'S6 the fixed label');
ok(/No temperature figure/.test(M.HEAT_DIRECTION) && !/\d+(\.\d+)?\s*°C/.test(M.HEAT_DIRECTION) && /not modelled/.test(M.AIR_HEAT), 'S6 heat: direction only, no °C; air heat not modelled');
ok(M.AREA_MAX_M2 === 800000 && M.AREA_MIN_M2 === 100, 'S6 valid 100 m² to 80 ha');
/* S7 */
const d = 141.42 / 111195, dl = d / Math.cos(33.69 * Math.PI / 180); const ring = [[33.69, 73.05], [33.69, 73.05 + dl], [33.69 + d, 73.05 + dl], [33.69 + d, 73.05]];
const G = M.ringGeometry(ring); ok(Math.abs(G.areaM2 - 20000) < 100, 'S7 a 141 m square is 2 ha', G.areaM2);
ok(M.inRing(33.69 + d / 2, 73.05 + dl / 2, ring) && !M.inRing(33.70, 73.06, ring), 'S7 inside / outside the ring');
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
