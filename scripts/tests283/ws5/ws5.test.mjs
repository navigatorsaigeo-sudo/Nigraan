/* v283 · WS5 hazard-method rebuilds · unit tests (no server, no network).
     node scripts/tests283/ws5/ws5.test.mjs
   Each defect test (D*) fails on the v91.17.282.1 base and passes here; gate tests (G*) check that every method that did not win its
   held-out test is shipped OFF. Fixture: fixtures/drought-class.json is the laptop copy of data/drought-class.json (25 Sep 2026),
   which is missing from the cloud tree. */
import { readFileSync, mkdtempSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const FIX = fileURLToPath(new URL('./fixtures/', import.meta.url));
let P = 0, F = 0; const ok = (c, n, d = '') => { if (c) { P++; console.log('PASS ' + n); } else { F++; console.log('FAIL ' + n + ' :: ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 400)); } };
const J = (f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
const tryImport = async (f) => { try { return await import(join(ROOT, f)); } catch (e) { return { __err: String(e) }; } };

/* ── D1 · drought (audit A10): one rule for level and type ─────────────────────────────────────────────────── */
{
  const { createDroughtType } = await tryImport('server/api/droughttype.mjs');
  const T = mkdtempSync(join(tmpdir(), 'ws5dt-'));
  copyFileSync(join(ROOT, 'data/drought-type.json'), join(T, 'drought-type.json')); copyFileSync(join(ROOT, 'data/pk-tehsils.json'), join(T, 'pk-tehsils.json'));
  copyFileSync(existsSync(join(ROOT, 'data/drought-class.json')) ? join(ROOT, 'data/drought-class.json') : join(FIX, 'drought-class.json'), join(T, 'drought-class.json'));
  const DT = createDroughtType(T);
  const U = {
    low: { spi90: { value: -1.4 }, smRoot: { percentile: 50 }, veg: { vhi: 25 }, drought: { applicable: true, class: 'Low' } },
    mon: { spi90: { value: -0.9 }, smRoot: { percentile: 9 }, veg: { vhi: 25 }, drought: { applicable: true, class: 'Monitor' } },
    arid: { smRoot: { percentile: 3 }, drought: { applicable: false, class: null } },
    nod: { spi90: { value: -2.1 }, drought: { applicable: true, class: null, noData: true } },
  };
  const idx = (u) => u.spi90 && u.spi90.value != null ? { name: 'SPI-3', value: u.spi90.value } : null;
  const out = { validTo: '2099-01-15', units: { low: { bandNow: 3, bandOutlook: 4 }, mon: { bandNow: 2, bandOutlook: 4 } } };
  const r = DT.attach(U, { water: null, recent: null, outlook: out, outlookOn: true, idx });
  ok(U.low.dtype.main === null && U.low.dtype.active.length === 0, 'D1a level Low: no drought type is named although rain and crops are dry (base named "meteorological")', U.low.dtype);
  ok(U.low.dtype.types.meteorological === 3 && U.low.dtype.indicators.rain.band === 3 && /does not confirm/.test(U.low.dtype.heldByLevel || ''), 'D1b the dry indicators stay visible as a view, with the reason', U.low.dtype);
  ok(U.mon.dtype.main === 'agricultural' && U.mon.dtype.active.includes('agricultural'), 'D1c level Monitor: the most severe converging type is named', U.mon.dtype);
  ok(U.arid.dtype.main === null && U.nod.dtype.main === null, 'D1d arid (no index) and no-data levels: no type', [U.arid.dtype.main, U.nod.dtype.main]);
  ok(U.low.dtype.outlook && U.low.dtype.outlook.main === null && U.mon.dtype.outlook.main === 'meteorological', 'D1e 15-day view follows the same rule', [U.low.dtype.outlook, U.mon.dtype.outlook]);
  ok(r.counts.heldByLevel === 3, 'D1f counts report the units held back by the level (low, arid soil-dry, no-data rain-dry)', r.counts);
}
/* ── D2 · catchment sampling (audit C4): even sample, one coverage rule ───────────────────────────────────── */
{
  const M = await tryImport('server/api/catchment.mjs');
  const T = mkdtempSync(join(tmpdir(), 'ws5c-'));
  const sq = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
  const HB = { type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { id: 1, down: 0, area: 9000, up: 18000 }, geometry: sq(70, 30, 71, 31) },
    { type: 'Feature', properties: { id: 2, down: 1, area: 9000, up: 9000 }, geometry: sq(71, 30, 72, 31) }] };
  writeFileSync(join(T, 'hybas_pk_lev07.json'), JSON.stringify(HB));
  /* v91.17.283.27 · items 1 and 5 · the catchment's record is its 24-h satellite return levels and the share cuts are in the registry */
  writeFileSync(join(T, 'rain-return-levels.json'), JSON.stringify({ returnPeriods: [2, 5, 10, 25, 50, 100], catchments: { 1: { '24h': { areaRl: [40, 60, 75, 95, 110, 125], years: 25 } } } }));
  writeFileSync(join(T, 'formula-registry.json'), JSON.stringify({ catchment: { memberShareCuts: { value: { Monitor: 10, Watch: 30, likely: 60 }, calibrationStatus: 'heuristic' } } }));
  let calls = [];
  const provider = { call: async (kind, path, q) => { calls.push(kind); const n = q.latitude.length;
    if (kind === 'historicalForecast') return Array.from({ length: n }, () => ({ daily: { time: Array.from({ length: 200 }, (_, i) => 'd' + i), precipitation_sum: Array.from({ length: 200 }, (_, i) => i % 50) } }));
    /* ensemble: only the FIRST point answers (the others are missing) */
    return Array.from({ length: n }, (_, k) => ({ daily: k === 0 ? { time: ['2026-10-21'], precipitation_sum: [500], precipitation_sum_member01: [500] } : { time: ['2026-10-21'] } })); } };
  const C = M.createCatchment ? M.createCatchment({ provider, dataDir: T }) : null;
  const f = HB.features[0];
  const pts = C && C.samplePoints ? C.samplePoints(f, 30.5, 70.5) : null;
  const mx = pts ? pts.reduce((a, p) => a + p[1], 0) / pts.length : null;
  ok(pts && pts.length === 16 && Math.abs(mx - 70.5) < 1e-6, 'D2a every inside lattice point is kept: 16 points centred on the basin (base kept the 9 western ones)', { n: pts && pts.length, meanLon: mx });
  const v = C ? await C.heavyRain(30.5, 70.5) : null;
  ok(v && v.ok === false && /no member values/.test(v.why || ''), 'D2b a member answered at 1 of 16 points is not a catchment mean (same half-of-points rule as the record)', v);
  /* v91.17.283.27 · the IFS record store (and its sampling tag) is gone: the record is the satellite return-level file */
  ok(!existsSync(join(T, 'catchment-p99.json')) && !calls.includes('historicalForecast'), 'D2c no IFS record is fetched or stored (v283.27: the catchment\'s record is its satellite return levels)', calls);
  ok(C && C.upstreamOf && C.upstreamOf(1).map(x => x.properties.id).join() === '2' && process.env.NIGRAAN_CATCHMENT_UPSTREAM !== '1', 'G2 upstream sampling exists, traced by HydroBASINS down pointers, and is OFF by default (untested)');
}
/* ── D3 · SMAP quality flags (audit C6) ───────────────────────────────────────────────────────────────────── */
{
  const M = await tryImport('server/api/smapfeed.mjs');
  const src = readFileSync(join(ROOT, 'server/api/smapfeed.mjs'), 'utf8');
  ok(typeof M.keepRecommended === 'function' && typeof M.parseDapCsvFlags === 'function', 'D3a the retrieval quality flag is parsed', Object.keys(M));
  if (M.keepRecommended) {
    const sm = M.parseDapCsv('/G/soil_moisture[0], 0.21, 0.30, 0.25, 0.40\n'), fl = M.parseDapCsvFlags('/G/retrieval_qual_flag[0], 0, 1, 65534, 8\n');
    ok(JSON.stringify(M.keepRecommended(sm, fl)) === JSON.stringify([[0.21, null, null, 0.4]]), 'D3b only bit-0-clear (recommended) retrievals are kept; fill = unknown = dropped', M.keepRecommended(sm, fl));
    ok(JSON.stringify(M.keepRecommended(sm, [])) === JSON.stringify([[null, null, null, null]]), 'D3c no flag grid -> nothing kept (quality unknown is not shown)');
  }
  ok(/retrieval_qual_flag_pm/.test(src) && /retrieval_qual_flag'/.test(src), 'D3d AM and PM flags are both requested');
  ok(!/existsSync/.test(src.split('\n').find(l => /^import .* from 'node:fs'/.test(l)) || ''), 'D3e unused existsSync import removed');
}
/* ── D4 · per-zone 90 % range (audit A14) ─────────────────────────────────────────────────────────────────── */
{
  const M = await tryImport('server/api/verification.mjs');
  const Z = existsSync(join(ROOT, 'data/range90-zone.json')) ? J('data/range90-zone.json') : null;
  ok(typeof M.scaleRange90 === 'function' && Z && Z.zones, 'D4a per-zone side factors exist (data/range90-zone.json) with a pure scaler', Object.keys(M));
  if (Z && M.scaleRange90) {
    const served = Object.entries(Z.zones).filter(([, c]) => c.serve).map(([k]) => k);
    ok(served.every(z => { const h = Z.zones[z].heldOut; return h.D1 && h.D2 && [h.D1, h.D2].every(d => d.recalCi[0] <= 0.9 && 0.9 <= d.recalCi[1] && !(d.servedCi[0] <= 0.9 && 0.9 <= d.servedCi[1])); }), 'D4b a zone is served only where its held-out test met the rule in both designs', served);
    ok(['hills', 'plains', 'coast'].every(z => Z.zones[z] && Z.zones[z].serve === false), 'G4 hills, plains, coast: the rule was not met -> served range unchanged');
    const c = Z.zones.mountain; const R = { lo: [5, 5, 5, 5], hi: [15, 15, 15, 15] }; const T = [10, 10, 10, 10];
    const lead = [0, 1, 1, 5], mon = [10, 10, 1, 10];
    const n = M.scaleRange90(R, T, (i) => lead[i], (i) => mon[i], c);
    ok(n === 1 && R.lo[0] === 5 && R.lo[2] === 5 && R.hi[3] === 15 && R.lo[1] === Math.round((10 - c.kLo * 5) * 10) / 10 && R.hi[1] === Math.round((10 + c.kHi * 5) * 10) / 10,
      'D4c applied only on the tested lead days and calendar months (lead 0, January and lead 5 keep the served range)', { n, R });
    const R2 = { lo: [5], hi: [15] }; ok(M.scaleRange90(R2, [10], () => 1, () => 10, { ...c, serve: false }) === 0 && R2.lo[0] === 5, 'D4d a zone with serve:false is never changed');
  }
}
/* ── G5 · pluvial trigger: tested, shipped OFF (owner decision B) ─────────────────────────────────────────── */
{
  const C = existsSync(join(ROOT, 'data/pluvial-trigger.json')) ? J('data/pluvial-trigger.json') : null;
  ok(C && C.served === false && C.test && C.test.events > 0 && Array.isArray(C.test.pairedPeirceTriggerMinusAmount_ci95), 'G5a pluvial trigger carries its event test and served:false');
  /* v283.51g3 · server/api/pluvialtrigger.mjs was never imported by the server (shipped OFF, owner decision B) and is removed: the
     decision and its event test stay in data/pluvial-trigger.json (G5a); no server file may serve a pluvial trigger */
  ok(!existsSync(join(ROOT, 'server/api/pluvialtrigger.mjs')), 'G5b the unused pluvialtrigger.mjs is removed (v283.51g3)');
  { const { readdirSync, readFileSync } = await import('node:fs'); const users = readdirSync(join(ROOT, 'server/api')).filter((f) => f.endsWith('.mjs') && /pluvialtrigger\.mjs'|createPluvialTrigger/.test(readFileSync(join(ROOT, 'server/api', f), 'utf8')));
    ok(users.length === 0, 'G5c no server module imports or creates the pluvial trigger', users.join(',')); }
}
/* ── G6 · landslide: the monotone (P1, P3 >= 0) model file is servable without code change; not installed in v283 ───────── */
{
  const M = await tryImport('server/api/landslideodds.mjs');
  const mono = { features: ['P1', 'P3'], coef: [0.3, 0.5], reference: { P1: 1, P3: 3 }, referenceByMonth: { 8: { P1: 3.3, P3: 8 } } };
  const f = { P1: 20, P3: 40, P7: 60, API15: 50 }, more = { ...f, P7: 160 }, wetter = { ...f, P3: 60 };
  ok(M.oddsRatio && M.oddsRatio(mono, f, 8) === M.oddsRatio(mono, more, 8) && M.oddsRatio(mono, wetter, 8) > M.oddsRatio(mono, f, 8), 'G6a a P1/P3 non-negative model: more week rain never lowers the odds; more 3-day rain raises them');
  const src = readFileSync(join(ROOT, 'scripts/gen/ws5/landslide_monotone_test.py'), 'utf8');
  ok(/SERVE RULE/.test(src) && /rule and ERA5/.test(src) && !existsSync(join(ROOT, 'data/landslide-odds-model.json')) || (existsSync(join(ROOT, 'data/landslide-odds-model.json')) && /monotone/.test(readFileSync(join(ROOT, 'data/landslide-odds-model.json'), 'utf8'))),
    'G6b the refit writes a served model only on the ERA5 basis under the stated rule; no non-monotone or POWER-basis model is installed by WS5');
}
/* ── G7 · one rain basis: the mapping is wired but switched off until a fitted, passed map file exists ─────────────────────── */
{
  const M = await tryImport('server/api/landslideodds.mjs');
  const K = { p: [0, 0.5, 1], served: [0, 1, 10], train: [0, 4, 40], dryShare: 0.4 };
  const map = { served: true, units: { u: { basis: 'tehsil', P1: K, P3: K, P7: K }, g: { basis: 'group:X' } }, groups: { X: { P1: K, P3: K, P7: K } } };
  const f = { P1: 5, P3: 5, P7: 0, API15: 1 };
  ok(typeof M.mapFeatures === 'function' && M.mapFeatures(null, 'u', f) === f && M.mapFeatures({ ...map, served: false }, 'u', f) === f, 'G7a no map file, or served:false -> features unchanged (v283 serving unchanged)');
  const m = M.mapFeatures ? M.mapFeatures(map, 'u', f) : {}; const mg = M.mapFeatures ? M.mapFeatures(map, 'g', f) : {};
  ok(Math.abs(m.P1 - 20) < 1e-9 && Math.abs(m.P7 - 1.6) < 1e-9 && Math.abs(mg.P3 - 20) < 1e-9 && m.basisMapped === true, 'G7b a passed map moves served rain onto the training basis per feature (tehsil or its group; dry maps to the training quantile at half the dry share)', [m, mg]);
  ok(!existsSync(join(ROOT, 'data/landslide-basis-map.json')), 'G7c v283 ships no fitted map (the 1 Nov retrain fits it)');
  const bat = readFileSync(join(ROOT, 'scripts/landslide_basis/FETCH_LANDSLIDE_BASIS.bat')); const py = readFileSync(join(ROOT, 'scripts/landslide_basis/fetch_landslide_basis.py'), 'utf8');
  ok(![...bat].some(b => b > 127) && /cd \/d "D:\\NIGRAAN/.test(bat.toString()) && /scrub/.test(py) && !/print\(.*KEY/.test(py), 'G7d fetch .bat is ASCII with full cd /d lines; the .py scrubs the key from every log line');
}
console.log(`\n${P} passed, ${F} failed`); process.exit(F ? 1 : 0);
