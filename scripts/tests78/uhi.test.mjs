/* v91.17.78 · agent U · urban heat: town-size term (Oke 1973), constants in data/urban-heat-model.json, clamps reviewed,
   Karachi coastal label, plain words. Usage: node scripts/tests78/uhi.test.mjs [baseURL]   (default http://127.0.0.1:8787)
   Server checks need the server restarted on the v78 urbanheat.mjs. The refit check runs the fit script locally (~3 s). */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let fails = 0;
const ok = (c, name, info) => { console.log((c ? 'PASS ' : 'FAIL ') + name + (info != null ? ' · ' + info : '')); if (!c) fails++; };
const J = async (p) => { const r = await fetch(BASE + p, { signal: AbortSignal.timeout(60000) }); return r.json(); };
const M = JSON.parse(readFileSync(join(ROOT, 'data', 'urban-heat-model.json'), 'utf8'));
const src = readFileSync(join(ROOT, 'server', 'api', 'urbanheat.mjs'), 'utf8');

/* 1 · constants live in the data file, each with a status and a basis or source */
const stat = (o) => !!(o && (o.status || o.source || o.basis));
ok(stat(M.canyon) && stat(M.lczCanopy) && stat(M.classScale.clamp) && stat(M.footprintFallback) && stat(M.vegetation.coolingCoefficient)
  && stat(M.vegetation.ndviBare) && stat(M.calibration) && stat(M.townSize) && stat(M.townSize.referencePopulation) && stat(M.diurnal)
  && stat(M.anthropogenic.wattsPerCapita) && stat(M.coastal), 'every model constant carries a status/basis in data/urban-heat-model.json');
ok(/Oke T\.R\. \(1973\)/.test(M.townSize.source) && M.townSize.slope === 2.01 && M.townSize.intercept === -4.06 && M.townSize.applied === true,
  'town-size term is Oke (1973) European line, applied', M.townSize.slope + ' log10 P ' + M.townSize.intercept);
ok(/declared/.test(M.vegetation.coolingCoefficient.status) && /\[measured v78\]/.test(M.vegetation.coolingCoefficient.basis), 'vegetation coefficient is labelled declared, with the fleet test written out', M.vegetation.coolingCoefficient.value);
ok(!/=\s*0\.559\s*;|VEG_COOLING\s*=\s*0\.4|clamp\(g \/ gm, 0\.4, 2\.5\)|7\.45 \+ 3\.97 \* Math/.test(src), 'no model constants typed in urbanheat.mjs (calibration, vegetation, class-scale clamp, Oke coefficients)');
ok(M.skill && /leave-one-out MAE/.test(M.skill.summary) && M.skill.v78 && M.skill.v78.loo.n === 18, 'skill before/after at the 18 points is recorded', M.skill && M.skill.summary);

/* 2 · the calibration in the file is the leave-one-out refit over the 18 points (fit script, local) */
try {
  const F = await import(pathToFileURL(join(ROOT, 'station-lake', 'scripts', 'urban_town_fit.mjs')).href).catch(() => import(pathToFileURL(join(ROOT, '..', 'station-lake', 'scripts', 'urban_town_fit.mjs')).href));
  const { createUrbanHeat } = await import(pathToFileURL(join(ROOT, 'server', 'api', 'urbanheat.mjs')).href);
  const uh = createUrbanHeat({}, join(ROOT, 'data')); const k = F.skill(F.points(uh, join(ROOT, 'data')));
  ok(k.n === 18 && Math.abs(k.calibration - M.calibration.value) <= 0.005, 'calibration = least-squares refit over the 18 scored points', k.calibration + ' vs file ' + M.calibration.value + ', LOO MAE ' + k.maeLoo + ' K, Spearman ' + k.spearmanLoo);
  ok(k.maeLoo <= M.skill.v77.loo.maeLoo + 0.02, 'leave-one-out MAE is no worse than v77', M.skill.v77.loo.maeLoo + ' -> ' + k.maeLoo);
} catch (e) { ok(false, 'fit script runs', e.message); }

/* 3 · server */
const st = await J('/api/urban/status');
ok(st.ready === true && st.calibration === M.calibration.value && st.model && st.model.file === 'data/urban-heat-model.json', 'server reads the model file', st.calibration + ' · ' + (st.model && st.model.version));
ok(st.model && st.model.townSize && st.model.townSize.applied === true && st.model.townSize.referencePopulation === M.townSize.referencePopulation.value, 'server applies the town-size term', st.model && JSON.stringify(st.model.townSize && st.model.townSize.referencePopulation));
ok(st.mask && /urban areas only/.test(st.mask.legend.subtitle || '') && /calm, clear night/.test(st.mask.legend.subtitle || ''), 'key keeps "urban areas only" and says typical calm, clear night', st.mask && st.mask.legend.subtitle);
/* v91.17.283.6 · expected behaviour updated to the intended decisions, checks kept at full strength:
   - C12 (data/urban-heat-c12.json, v91.17.283.3/.5): while the file is applied the SERVER answers every point (towns and villages), the cells
     and the roll-up "not assessed" with the file's reason and no figure; released (applied: false) the v78 server checks below run as before;
   - v91.17.283.2 mountain rule: Gilgit and Skardu carry no served heat island even when C12 is released.
   The v78 MODEL checks (Oke 1973 town factor, small-town factor of Skardu and Gilgit, their bazaar maxima, Karachi coastal label, plain
   words, maxBasis, roll-up method, national cell maximum) are run on the layer itself in this process with the decision released (the
   analysis path createUrbanHeat(..., { nationalWithheld: false }); Skardu and Gilgit through pointTerms, as they are mountain-withheld). */
let C12 = null; try { C12 = JSON.parse(readFileSync(join(ROOT, 'data', 'urban-heat-c12.json'), 'utf8')); if (!C12.applied) C12 = null; } catch (_) { C12 = null; }
const P = async (la, lo) => J('/api/urban/point?lat=' + la + '&lon=' + lo + '&hoursFromSunset=2');
const { createUrbanHeat: CU } = await import(pathToFileURL(join(ROOT, 'server', 'api', 'urbanheat.mjs')).href);
const OFF = CU(null, join(ROOT, 'data'), { nationalWithheld: false });
const L = (la, lo) => OFF.estimate(la, lo, { hoursFromSunset: 2 });
const PTS = { isb: [33.71, 73.055], sk: [35.297, 75.633], gil: [35.92, 74.308], kar: [24.856, 67.029], lhr: [31.569, 74.31] };
for (const [k, [la, lo]] of Object.entries(PTS)) { const r = await P(la, lo);
  if (C12) ok(r.ready && r.withheld === true && r.assessed === false && !r.heatIsland && r.why === C12.reason, 'server, C12 applied: ' + k + ' point not assessed with the reason, no figure', String(r.why).slice(0, 80));
  else if (k === 'sk' || k === 'gil') ok(r.withheld === true && !r.heatIsland, 'server: ' + k + ' (mountain town, v283.2) carries no heat island', String(r.why).slice(0, 80));
  else ok(r.urban === true && r.heatIsland && r.heatIsland.maxC > 0, 'server: ' + k + ' carries its heat island', r.heatIsland && r.heatIsland.maxC); }
const isb = L(...PTS.isb), kar = L(...PTS.kar), lhr = L(...PTS.lhr), skT = OFF.pointTerms(...PTS.sk), gilT = OFF.pointTerms(...PTS.gil);
const tf = (r) => r && r.heatIsland && r.heatIsland.town ? r.heatIsland.town.factor : null;
ok(Math.abs(tf(isb) - 1) < 0.01, 'Islamabad-Rawalpindi patch is the reference (factor 1)', tf(isb) + ' · ' + (isb.heatIsland && isb.heatIsland.town.population));
ok(skT.town > 0.55 && skT.town < 0.7 && gilT.town > 0.55 && gilT.town < 0.7, 'Skardu and Gilgit patches get the small-town factor (Oke 1973)', 'Skardu ' + skT.town + ', Gilgit ' + gilT.town);
ok(skT.dT < 2.0 && gilT.dT < 1.6, 'Skardu and Gilgit bazaar cells no longer read like big-city cores', 'Skardu ' + skT.dT + ' C (v77 2.60), Gilgit ' + gilT.dT + ' C (v77 1.95)');
ok(tf(lhr) > 1 && tf(kar) > 1, 'Lahore and Karachi patches are larger than the reference (factor > 1)', 'Lahore ' + tf(lhr) + ', Karachi ' + tf(kar));
ok(kar.heatIsland.coastal && kar.heatIsland.coastal.applied === false && /sea breeze/.test(kar.heatIsland.coastal.uncertainty || ''), 'Karachi carries the coastal uncertainty label (no unmeasured factor)', kar.heatIsland.coastal && kar.heatIsland.coastal.uncertainty);
ok(!isb.heatIsland.coastal, 'inland towns carry no coastal label');
ok(/typical calm, clear night/.test(isb.heatIsland.plainWords || '') && isb.heatIsland.plainWords.indexOf(isb.heatIsland.maxC.toFixed(1)) >= 0, 'point answer says the value in plain words', isb.heatIsland.plainWords);
ok(/Oke \(?1973/.test(isb.heatIsland.maxBasis || '') && /MACH/.test(isb.heatIsland.maxBasis || ''), 'maxBasis names the town term and the fleet calibration', isb.heatIsland.maxBasis);

/* 4 · v77 behaviour kept (towns only, IIOJK not described) */
const sk2T = OFF.pointTerms(35.30, 75.63); ok(sk2T.urban === true && sk2T.dT > 0, 'Skardu (35.30 N 75.63 E) is still a town cell (layer; served: withheld, mountain rule)', sk2T.dT);
const v = await P(35.35, 74.86);
if (C12) ok(v.withheld === true && !v.smallSettlement && v.why === C12.reason, 'server, C12 applied: a GB valley village is not assessed either (lowDensityAnswers)', String(v.why).slice(0, 80));
else ok(v.urban === false && v.smallSettlement === true, 'a GB valley village is still not urban', v.why);
const vL = L(35.35, 74.86); ok(vL.urban === false && vL.smallSettlement === true, 'layer: a GB valley village is still not urban', vL.why);
const sr = await P(34.08, 74.80); ok(sr.urban === false && sr.administered === false, 'Srinagar (IIOJK) still not described');
const nat = await J('/api/urban/national'), natL = OFF.national();
if (C12) ok(nat.ready && nat.withheld === true && Object.keys(nat.units || {}).length === 0 && nat.why === C12.reason, 'server, C12 applied: no tehsil roll-up, the reason given');
ok(natL.ready && natL.unitsWithUrbanCells > 400 && /Oke \(?1973/.test(natL.method || ''), 'national roll-up (layer) uses the same terms', natL.unitsWithUrbanCells + ' units');
const cells = await J('/api/urban/cells?w=60&s=23&e=78&n=37&zoom=5');
if (C12) ok(cells.ready && cells.withheld === true && (cells.cells || []).filter((x, i) => i % 3 === 2).every((v) => v === null), 'server, C12 applied: no heat value on any map cell (v91.17.283.49: the town cells are served as facts, heat null)');
const cL = OFF.cellsIn(60, 23, 78, 37); const vals = (cL.cells || []).filter((_, i) => i % 3 === 2);
ok(cL && vals.length > 100 && Math.max(...vals) < 6, 'map cells (layer), national maximum below 6 C', vals.length + ' cells, max ' + Math.max(...vals));
try { const u = await J('/api/fleet/uhi-check');
  /* v91.17.283.6 · C12 applied: the served fleet check carries no model value (srvfix C12, v91.17.283.3: "fleet history uhi check now shows no
     model value"), so there is no verdict to score; every model row says why. Released: the v78 check below runs as before. */
  if (C12) ok(u.ready !== false && !u.verdict && Array.isArray(u.stations) && u.stations.length > 0 && u.stations.every((r) => r.model && r.model.deltaTmaxC == null && /not assessed/.test(r.model.why || '')), 'fleet check, C12 applied: no model value served, every row says not assessed', (u.stations || []).length + ' stations');
  else ok(u.verdict && Math.abs(u.verdict.meanResidualC) <= 0.3, 'fleet check: mean residual at the 16 stations within 0.3 K', u.verdict && (u.verdict.meanResidualC + ' K, rho ' + u.verdict.spearman)); }
catch (e) { ok(false, 'fleet check reachable', e.message); }

console.log(fails ? fails + ' FAIL' : 'all PASS');
process.exit(fails ? 1 : 0);
