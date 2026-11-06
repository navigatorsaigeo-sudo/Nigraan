/* v91.17.274 · DROUGHT agent · drought type per tehsil, 15-day outlook gate, one Drought layer coloured by type.
     node scripts/tests274/drought274.test.mjs                                   unit part (no server)
     node scripts/tests274/drought274.test.mjs --base http://127.0.0.1:8963 [--cmp http://127.0.0.1:8973]
        + the running test copy; --cmp = the v273 base with the same data: the drought LEVEL must be identical for every unit */
import { readFileSync, mkdtempSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const a = process.argv.slice(2); const arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const BASE = arg('base', null), CMP = arg('cmp', null);
let P = 0, F = 0; const ok = (c, n, d = '') => { if (c) { P++; console.log('PASS ' + n); } else { F++; console.log('FAIL ' + n + ' :: ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 500)); } };
const { bandOf, mainOf, createDroughtType } = await import(join(ROOT, 'server/api/droughttype.mjs'));
const S = JSON.parse(readFileSync(join(ROOT, 'data/drought-type.json'), 'utf8'));
const DC = JSON.parse(readFileSync(join(ROOT, 'data/drought-class.json'), 'utf8'));

/* U1 · bands follow the published tables exactly (USDM SPI ranges, USDM percentiles, Kogan VHI) at and around every cut */
{
  const R = S.indicators.rain, SO = S.indicators.soil, C = S.indicators.crops;
  ok([[-0.49, 0], [-0.5, 1], [-0.79, 1], [-0.8, 2], [-1.3, 3], [-1.6, 4], [-2.4, 4], [0.7, 0]].every(([v, b]) => bandOf(v, R) === b), 'U1a SPI bands: D0 -0.5, D1 -0.8, D2 -1.3, D3+ -1.6 (Svoboda et al. 2002)');
  ok([[31, 0], [30, 1], [20, 2], [10, 3], [5, 4], [2, 4]].every(([v, b]) => bandOf(v, SO) === b), 'U1b percentile bands: D0 30, D1 20, D2 10, D3+ 5');
  ok([[40, 0], [39.9, 1], [29.9, 2], [19.9, 3], [9.9, 4]].every(([v, b]) => bandOf(v, C) === b), 'U1c VHI: < 40 mild, < 30 moderate, < 20 severe, < 10 extreme (Kogan 2002)');
  ok(bandOf(null, R) === null && bandOf(NaN, SO) === null, 'U1d missing value -> null, never band 0');
  ok(Object.values(S.indicators).every(i => /Svoboda|Kogan/.test(i.source)), 'U1e every indicator cites its published class table');
}
/* U2 · active band read from drought-class.json (Monitor = USDM D1) and the main-type rule */
{
  const T = mkdtempSync(join(tmpdir(), 'dt274-'));
  for (const f of ['drought-type.json', 'drought-class.json', 'pk-tehsils.json']) copyFileSync(join(ROOT, 'data', f), join(T, f));
  const DT = createDroughtType(T);
  ok(DT.activeBand() === bandOf(DC.categories.Monitor.indexAtMost, S.indicators.rain) && DT.activeBand() === 2, 'U2a active band = band of the Monitor category (D1) = 2', DT.activeBand());
  ok(mainOf({ meteorological: 3, agricultural: 2, hydrological: null }, 2) === 'meteorological', 'U2b most severe type wins');
  ok(mainOf({ meteorological: 2, agricultural: 2, hydrological: 2 }, 2) === 'hydrological', 'U2c tie -> later stage of the propagation sequence');
  ok(mainOf({ meteorological: 1, agricultural: 1, hydrological: 0 }, 2) === null, 'U2d nothing at the active band -> no type');
  /* U3 · gauge inside the tehsil polygon, no distance rule */
  const fc = JSON.parse(readFileSync(join(T, 'pk-tehsils.json'), 'utf8'));
  const f0 = fc.features.find(f => f.properties.uid === 'Punjab|Lahore|Lahore City') || fc.features[100];
  const ring = f0.geometry.type === 'Polygon' ? f0.geometry.coordinates[0] : f0.geometry.coordinates[0][0];
  let cx = 0, cy = 0; ring.forEach(p => { cx += p[0]; cy += p[1]; }); cx /= ring.length; cy /= ring.length;
  const water = { built: 't', asOf: 't', rivers: [{ station: 'IN', lat: cy, lon: cx, percentile: 8, band: 3, shown: true }, { station: 'OUT', lat: 10, lon: 10, percentile: 1, shown: true }] };
  const G = DT.gaugesByUnit(water);
  const inside = Object.entries(G).filter(([, v]) => v.some(r => r.station === 'IN')).map(([k]) => k);
  ok(inside.length === 1 && !Object.values(G).flat().some(r => r.station === 'OUT'), 'U3 a gauge belongs to the one tehsil whose polygon holds it; a gauge outside every polygon to none', inside);
  /* U4 · attach on synthetic units */
  const U = {
    a: { spi90: { value: -1.4 }, smRoot: { percentile: 50 }, veg: { vhi: 55, canalFed: true }, drought: { class: 'Low' } },
    b: { spi90: { value: -0.9 }, smRoot: { percentile: 9 }, veg: { vhi: 25 }, drought: { class: 'Monitor' } },
    c: { spi90: { value: 0.2 }, smRoot: { percentile: 60 }, drought: { class: 'Low' } },
    d: { drought: { applicable: false, class: null }, smRoot: { percentile: 4 } },
    [inside[0]]: { spi90: { value: 0.1 }, smRoot: { percentile: 40 }, drought: { class: 'Low' } },
  };
  const idx = (u) => u.spi90 && u.spi90.value != null ? { name: 'SPI-3', value: u.spi90.value } : null;
  const out = { validTo: '2099-01-15', units: { a: { bandNow: 3, bandOutlook: 1 }, b: { bandNow: 2, bandOutlook: 4 } } };
  const r = DT.attach(U, { water, recent: { units: { c: { sdPct: 12 } } }, outlook: out, outlookOn: true, idx });
  /* v91.17.283 (WS5 contract, audit A10): a drought TYPE is named only where the drought LEVEL is Monitor or above; below that (Low, no
     level) the dry indicators stay visible as a view with the reason (heldByLevel), and no type is named */
  ok(U.a.dtype.main === null && U.a.dtype.types.meteorological >= 2 && U.a.dtype.types.agricultural === 0 && /does not confirm/.test(U.a.dtype.heldByLevel || ''), 'U4a rain shortage only at level Low -> no type named; the dry rain indicator stays visible with the reason', U.a.dtype);
  ok(U.b.dtype.main === 'agricultural' && U.b.dtype.types.agricultural === 3 && U.b.dtype.types.meteorological === 2, 'U4b soil at D2 over rain at D1 -> agricultural', U.b.dtype.types);
  ok(U.c.dtype.main === null && (U.c.dtype.types.hydrological === 2 ? !!U.c.dtype.heldByLevel : (U.c.dtype.types.hydrological === null && (U.c.dtype.withheld || []).some((w) => w.type === 'hydrological') && U.c.dtype.indicators.snow.untested === true)) && U.c.dtype.indicators.snow.band === 2,   /* v91.17.283.10 DRYSPONGE: the hydrological type may be withheld (never named), its indicator still shown, marked untested */ 'U4c snow 12th percentile = D1 (band 2) at level Low -> hydrological indicator shown, no type named', U.c.dtype);
  ok(U.d.dtype.types.meteorological === null && U.d.dtype.types.agricultural >= 3 && U.d.dtype.main === null, 'U4d arid (no level): no rain type (index not defined), soil still read, no type named', U.d.dtype);
  ok((U[inside[0]].dtype.types.hydrological === 3 || (U[inside[0]].dtype.types.hydrological === null && U[inside[0]].dtype.indicators.rivers[0].band === 3 && U[inside[0]].dtype.indicators.rivers[0].untested === true)) && U[inside[0]].dtype.indicators.rivers[0].station === 'IN' && U[inside[0]].dtype.main === null, 'U4e river gauge inside the tehsil at 8th percentile -> hydrological D2 indicator; level Low -> no type named', U[inside[0]].dtype);
  ok(U.a.dtype.outlook && U.a.dtype.outlook.main === null && U.a.dtype.outlook.rainBand15 === 1, 'U4f 15-day: rain easing to D0 -> no type in 15 days', U.a.dtype.outlook);
  ok(U.b.dtype.outlook && U.b.dtype.outlook.main === 'meteorological' && U.b.dtype.outlook.carried.join() === 'agricultural,hydrological', 'U4g 15-day: rain to D3+ overtakes soil; soil/crops/rivers carried as now', U.b.dtype.outlook);
  ok(!U.c.dtype.outlook, 'U4h no outlook for a unit the outlook does not hold');
  ok(r && r.activeBand === 2 && r.counts.meteorological + r.counts.agricultural + r.counts.hydrological + r.counts.none + r.counts.noData === Object.keys(U).length, 'U4i counts add up', r && r.counts);
  const r2 = DT.attach(JSON.parse(JSON.stringify(U)), { water, recent: null, outlook: out, outlookOn: false, idx });
  ok(r2.outlookCounts === null, 'U4j outlook off -> no outlook counts');
}
/* U5 · the client carries no drought cut of its own */
{
  const html = readFileSync(join(ROOT, 'artefact/AI_GEO_NIGRAAN_v91_17_MACH.html'), 'utf8');
  ok(!html.includes('[-0.5,-0.8,-1.3,-1.6]') && !html.includes('[30,20,10,5],true') && !html.includes('[40,30,20,10],false'), 'U5a drought type bands come from the server (no SPI/percentile/VHI cuts typed in the page)');
  ok(!html.includes('bd<=100'), 'U5b no 100 km nearest-gauge rule in the page (gauges inside the tehsil, server side)');
  ok(html.includes("['overall','All types']") && html.includes('function dTypeStyle('), 'U5c one Drought layer, All types view coloured by type');
  ok(!/\b(PMD|FFD)\b/.test(html.slice(html.indexOf('AGN.droughtLines='), html.indexOf('AGN.droughtLines=') + 4000)), 'U5d no PMD/FFD names in the drought popup lines');
  const pal = S.palette; ok(['meteorological', 'agricultural', 'hydrological'].every(t => Array.isArray(pal[t]) && pal[t].length === 4), 'U5e four shades per type for Low..Severe');
}
/* U6 · monthly outlook gate file */
{
  const M = JSON.parse(readFileSync(join(ROOT, 'data/drought-outlook-test-months.json'), 'utf8'));
  ok(Object.keys(M.months).length === 12, 'U6a all 12 issue months scored');
  ok(Object.entries(M.months).every(([m, v]) => v.climFill.passed === (v.climFill.w1.gain90[0] > 0 && v.climFill.w2.gain >= 0)), 'U6b pass = window 1 lower bound > 0 and window 2 gain >= 0 (v270 gate)');
  ok(M.passedMonths === null ? /laptop/.test(M.gefsNote) : Array.isArray(M.passedMonths), 'U6c without the GEFS cache the file says the forecast score is pending');
}

if (BASE) {
  const get = async (u) => { const t0 = Date.now(); const r = await fetch(u); return { j: await r.json(), ms: Date.now() - t0 }; };
  const { j: D, ms } = await get(BASE + '/api/climatology/drought');
  ok(D.ready && D.views && D.views.types && D.views.types.activeBand === 2, 'S1 /api/climatology/drought carries views.types', D.views && D.views.types);
  const units = Object.values(D.spi);
  ok(units.every(u => u.dtype && u.dtype.types), 'S2 every unit carries dtype', units.filter(u => !u.dtype).length);
  ok(units.every(u => !u.dtype.main || u.dtype.types[u.dtype.main] >= 2), 'S3 a main type is always at or above the active band');
  ok(units.filter(u => u.drought && u.drought.class && u.drought.class !== 'Low').every(u => u.dtype.main), 'S4 every unit above Low has a main type (the level needs rain and soil at D1)');
  const c = D.views.types.counts; ok(Object.values(c).reduce((x, y) => x + y, 0) === units.length, 'S5 type counts cover every unit', c);
  const O = D.views.outlook; const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
  ok(!(O.shown && O.validTo < today), 'S6 an outlook whose valid-to has passed is never shown', { validTo: O.validTo, shown: O.shown });
  ok(O.monthGate && typeof O.monthGate.passed === 'boolean' && /monthly|pooled/.test(O.monthGate.basis), 'S7 the outlook states its monthly gate', O.monthGate);
  ok(ms < 3000, 'S8 drought route answers in < 3 s (' + ms + ' ms, cold)');
  if (CMP) {
    const { j: B } = await get(CMP + '/api/climatology/drought');
    const keys = Object.keys(B.spi); let diff = [];
    for (const k of keys) { const x = (B.spi[k] || {}).drought || {}, y = (D.spi[k] || {}).drought || {}; if (x.class !== y.class || x.score !== y.score) diff.push(k); }
    ok(keys.length === Object.keys(D.spi).length && diff.length === 0, 'S9 drought LEVEL identical to base for all ' + keys.length + ' units', diff.slice(0, 5));
    const t = []; for (let i = 0; i < 5; i++) { const t0 = Date.now(); await fetch(BASE + '/api/climatology/drought').then(r => r.arrayBuffer()); t.push(Date.now() - t0); }
    const tb = []; for (let i = 0; i < 5; i++) { const t0 = Date.now(); await fetch(CMP + '/api/climatology/drought').then(r => r.arrayBuffer()); tb.push(Date.now() - t0); }
    const med = (v) => v.slice().sort((p, q) => p - q)[2];
    console.log('     timing drought route median warm: new ' + med(t) + ' ms, base ' + med(tb) + ' ms');
    ok(med(t) <= med(tb) * 1.1 + 15, 'S10 speed gate: drought route not slower than base by > 10 % (+15 ms jitter)', { new: t, base: tb });
  }
}
console.log('\n' + P + ' passed, ' + F + ' failed'); process.exit(F ? 1 : 0);
