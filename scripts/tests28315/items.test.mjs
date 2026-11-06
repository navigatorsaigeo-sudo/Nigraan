#!/usr/bin/env node
/* v91.17.283.15 · one check per item of the package, no server needed (the page checks are in page.test.mjs).
   Usage: node scripts/tests28315/items.test.mjs [dataDir]   (default NIGRAAN_DATA_DIR, else <tree>/data; the live data folder of the
   laptop gives the real counts: engine-latest.json, drought-national.json, vegetation-health.json, era5land-recent.json, drought-water.json,
   drought-chirps.json, sponge-tehsil.v2.json, landslide-rain.json). A first argument that is a URL is ignored. */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeApp } from '../tests28313/harness.mjs';
import { createClimatology } from '../../server/api/climatology.mjs';
import { createVegetation } from '../../server/api/vegetation.mjs';
import { DTYPE_VIEWS, runoffOf, runoffLevel, levelOfSpi, rainCell } from '../../server/api/hazsci.mjs';
import { rainClassSharesCalibrated } from '../../server/api/rainprob.mjs';
import { requestOf, PRODUCTS } from '../../server/api/pointprod.mjs';
import { createFloodFacts, factsOf } from '../../server/api/floodfacts.mjs';
import { servedUnit, levelTag } from '../../server/api/served.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const A = process.argv.slice(2).filter((x) => !/^https?:/.test(x));
const DATA = resolve(A[0] || process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data'));
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? ' :: ' + String(d).slice(0, 900) : '')); };
const J = (f, dir = DATA) => { try { return JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch (_) { return null; } };
const W = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];

/* ---------------- item 1 · drought type views ---------------- */
const ENG = J('engine-latest.json');
let S = null, app = null;
if (ENG) {
  app = makeApp(DATA); try { app.vegetation = createVegetation(app, DATA); } catch (_) {} app.climatology = createClimatology(app, DATA);
  S = JSON.parse(JSON.stringify(ENG)); app.hazSci.apply(S);
  const d0 = S.days[0].layers, DN = app.climatology.droughtNational(), U = (DN && DN.spi) || {};
  ok(Object.keys(DTYPE_VIEWS).every((k) => S.days.every((d) => d.layers[k] && d.layers[k].L)), '1a every day carries the four drought views (drought_rain, drought_soil, drought_crops, drought_water), one record per tehsil per run');
  const band = (u, v) => { const I = u && u.dtype && u.dtype.indicators; if (!I) return null;
    if (v === 'drought_soil') return I.soil ? I.soil.band : null; if (v === 'drought_crops') return I.crops ? I.crops.band : null;
    if (v === 'drought_water') { const b = [I.snow && I.snow.band, ...(I.rivers || []).map((r) => r.band)].filter((x) => x != null); return b.length ? Math.max(...b) : null; } return null; };
  /* 20 tehsils: the first 20 (sorted) where the views' own indices are not all equal, so a single colour would be wrong */
  const uids = Object.keys(d0.drought.L).sort().filter((u) => { const b = ['drought_soil', 'drought_crops'].map((v) => band(U[u], v)); return b.every((x) => x != null) && new Set([d0.drought.L[u], ...b]).size > 1; }).slice(0, 20);
  const rows = uids.map((u) => ({ u: u.split('|').pop(), head: d0.drought.L[u], rain: d0.drought_rain.L[u], soil: d0.drought_soil.L[u], crops: d0.drought_crops.L[u], water: d0.drought_water.L[u],
    soilIdx: band(U[u], 'drought_soil'), cropsIdx: band(U[u], 'drought_crops'), waterIdx: band(U[u], 'drought_water') }));
  const own = rows.every((r) => r.soil === r.soilIdx && r.crops === r.cropsIdx && (r.waterIdx == null ? r.water === -1 : r.water === r.waterIdx) && r.rain === r.head);
  const differ = rows.filter((r) => new Set([r.rain, r.soil, r.crops]).size > 1).length;
  if (!uids.length) console.log('NOTE 1b: this data folder holds no drought indicator record (drought-national.json and the indicator files): the live counts need the laptop data');
  ok(uids.length ? uids.length === 20 && own && differ === 20 : !DN || !DN.ready, '1b 20 tehsils whose indices differ: each view shows its own index on its own published classes, so the views differ (' + differ + ' of ' + uids.length + ')',
    rows.slice(0, 20).map((r) => r.u + ' rain ' + r.rain + ' soil ' + r.soil + ' crops ' + r.crops + ' water ' + r.water).join(' | '));
  const leak = Object.keys(DTYPE_VIEWS).filter((k) => k !== 'drought_rain').map((k) => Object.keys(d0[k].L).filter((u) => d0[k].L[u] === -1 && !/^no reading/.test((d0[k].why || {})[u] || '')).length);
  ok(leak.every((n) => n === 0), '1c a view with no reading says "no reading" (never the headline level)', leak.join(','));
  const T = {}; for (const k of ['drought', ...Object.keys(DTYPE_VIEWS)]) { const c = d0[k].counts || [0, 0, 0, 0, 0]; T[k] = W.map((w, i) => w + ' ' + c[i]).join(', ') + ', no reading ' + (d0[k].nd || 0) + ', not applicable ' + (d0[k].na || 0); }
  console.log('COUNTS per type per class (day 0):'); for (const [k, v] of Object.entries(T)) console.log('  ' + k + ': ' + v);
  ok(levelOfSpi(-0.9) === 2 && levelOfSpi(-0.4) === 0, '1d the headline stays SPI-3 on the US Drought Monitor categories (-0.9 -> D1 Moderate)');
} else console.log('SKIP 1: no engine-latest.json in ' + DATA);

/* ---------------- item 2 · sponge views ---------------- */
{ const G = J('model-gate.json', join(ROOT, 'data')), E = Object.fromEntries(G.entries.map((e) => [e.id, e])), H = G.client_rules.hidden_layers;
  const own = (l) => G.entries.find((e) => (e.layers || []).includes(l));
  ok(['nss_dynamic', 'nss_runoff'].every((l) => (l in H) && own(l).client_hidden && own(l).product_type === 'Screening index'), '2a v283.35 audit B4: the gate entries of nss_dynamic and nss_runoff are hidden from clients (owner decision DRYSPONGE), Screening index for operators (at the source, not a page override)', ['nss_dynamic', 'nss_runoff'].map((l) => own(l).id + ' ' + own(l).product_type).join(', '));
  const R = J('model-gate.resolved.json', join(ROOT, 'data')); const res = (l) => R.entries.find((e) => (e.layers || []).includes(l)).resolved;
  ok(['nss_dynamic', 'nss_runoff'].every((l) => res(l).canAlert === false), '2b they never raise alerts (class experimental: display only)');
  const ML = J('map-layer-scales.json', join(ROOT, 'data'));
  ok(runoffLevel(0.4, ML.layers.nss_runoff.cuts) === 0 && runoffLevel(12, ML.layers.nss_runoff.cuts) === 3 && Math.abs(runoffOf({ covers: ['crops'], cn2: { crops: [85] }, fSlope: [1] }, { bins: [[0, 0, 0, 1]] }, 50) - 19.6) < 0.1,
    '2c run-off of the observed rain by the NRCS equation (P 50 mm on CN 85: 19.6 mm) on the scale\'s own bands (read from map-layer-scales.json)');
  if (S) { const d0 = S.days[0].layers, rain5 = (u) => app.landslideOdds.rain5 ? app.landslideOdds.rain5(u, S.days[0].date) : null;
    const miss = Object.keys(d0.nss_runoff.L).filter((u) => !(rain5(u) && Number.isFinite(rain5(u).mm)) && !/250 m/.test((d0.nss_baseline.why || {})[u] || ''));
    ok(miss.every((u) => d0.nss_runoff.L[u] === -1 && d0.nss_dynamic.L[u] === -1 && /^no reading/.test(d0.nss_runoff.why[u])), '2d tehsils without the observed 5-day rain say "no reading" on both day views (' + miss.length + ')');
    ok(S.days.every((d) => d.layers.nss_runoff && d.layers.nss_runoff.L), '2e nss_runoff is a server layer of every issued day (the 250 m NRCS table + the observed 5-day rain)', 'day 0 counts ' + JSON.stringify(d0.nss_runoff.counts) + ', no reading ' + d0.nss_runoff.nd); }
}

/* ---------------- item 3 · point products ---------------- */
{ const a = requestOf('ensemble', { latitude: '31.55812', longitude: '74.35071', models: 'ecmwf_ifs025', hourly: 'precipitation', forecast_days: '5' });
  ok(a.qs && /latitude=31\.558&/.test(a.qs) && /longitude=74\.351/.test(a.qs), '3a a product request is rebuilt on the server, coordinates rounded to 0.001 deg (one record per place)', a.qs);
  ok(requestOf('ensemble', { latitude: '31.5', longitude: '74.3', apikey: 'x' }).error && requestOf('nowcast', { latitude: '31.5', longitude: '74.3', models: 'x' }).error && requestOf('bogus', {}).error && requestOf('riverflow', { latitude: '10', longitude: '74' }).error,
    '3b any key the product does not hold, an unknown product and a point outside Pakistan are refused');
  ok(!requestOf('cmip6', { latitude: '31.5', longitude: '74.3', start_date: '2041-01-01', end_date: '2050-12-31', models: 'MRI_AGCM3_2_S,EC_Earth3P_HR,MPI_ESM1_2_XR,CMCC_CM2_VHR4,HiRAM_SIT_HR,FGOALS_f3_H,NICAM16_8S', daily: 'temperature_2m_max,precipitation_sum', timezone: 'Asia/Karachi' }).error,
    '3b2 the CMIP6 request of Customize and the analyst (the seven HighResMIP model ids) is accepted');
  ok(Object.keys(PRODUCTS).length === 10 && 'inputs' in PRODUCTS, '3c ten server products (v91.17.283.20 added inputs, the district rows\' model inputs): ' + Object.keys(PRODUCTS).join(', '));
  const GA = J('scripts/tests28312/gate-allow.json', ROOT); const n = Object.values(GA.static).reduce((s, x) => s + Object.keys(x).length, 0);
  ok(n === 13, '3d gate-allow.json holds 13 entries (35 in v283.12, 18 in v283.15; v283.19 removed 4 scripts and v283.21 removed agn-pool-js, which no longer name a forbidden address)', n); }

/* ---------------- item 5 · ECMWF 9 km fetcher ---------------- */
{ const py = readFileSync(join(ROOT, 'scripts', 'ecmwf', 'ingest_ecmwf010.py'), 'utf8');
  const vars = [...py.matchAll(/^\s+\('([a-z0-9]+)',\s+\(/gm)].map((m) => m[1]);
  ok(/storage\.googleapis\.com\/ecmwf-open-data/.test(py) && JSON.stringify(vars) === JSON.stringify(['t2m', 'd2m', 'u10', 'v10', 'gust', 'tp', 'tcc']), '5a the fetcher reads the Google Cloud mirror and only the fields the shadow, score and serve paths read (v283.28: + tcc for the retrain input, I6)', vars.join(','));
  ok(/'NIGRAAN_ECMWF010_MAX_STEP', '96'/.test(py) && /'NIGRAAN_ECMWF010_MAX_STEP_0012', '96'/.test(py) && /RANGES\.submit\(fetch_range/.test(py) && /last = steps\[-1\]/.test(py) && /st\['cleaned'\]/.test(py),
    '5b steps to 96 h, parallel byte ranges, a run is ready when its last needed step is out, stuck work of runs out of the window is removed'); }

/* ---------------- items 6, 7 · river flood and flash facts ---------------- */
{ /* v91.17.283.18 · the facts are named by the record of the one place table they stand on */
  const { createPlaces } = await import(pathToFileURL(join(ROOT, 'server', 'api', 'places.mjs')).href);
  const PLC = createPlaces({ dataDir: join(ROOT, 'data'), units: { tehsil: JSON.parse(readFileSync(join(ROOT, 'server', 'contract', 'units.json'), 'utf8')) } });
  const F = createFloodFacts(join(ROOT, 'data'), PLC), T = F.table();
  if (!T) ok(false, '6a data/flood-facts.json is in the package');
  else { ok(T.places > 160000 && T.lat.length === T.places, '6a the facts table holds every named place (' + T.places + ')');
    let lead = 0, bad = 0; for (let i = 0; i < T.places; i++) if (T.rs[i] === 0 && T.fy[i]) { lead++; const f = factsOf(T, i); if (!f.river.observedLeadsMap || !/^Satellites saw flood water/.test(f.river.words)) bad++; }
    ok(lead > 0 && bad === 0, '6b where satellites saw flooding but the maps say dry, the observed fact leads the sentence (' + lead + ' places)', bad + ' wrong');
    const r = F.at(27.70323, 68.85889); ok(r.found && /2022/.test(r.river.words), '6c Sukkur: the observed 2022 flood is stated', r.river && r.river.words);
    const far = F.at(29.5, 64.0); ok(!far.found || far.km <= 1, '6d no fact is lent over more than 1 km', JSON.stringify(far).slice(0, 160));
    const c = [0, 0, 0, 0, 0]; T.fl.forEach((x) => c[x]++); ok(c[4] > 0 && c[3] > 0, '7a the 1-in-100 hill-torrent corridor fact per place: in ' + c[4] + ', outside ' + c[3] + ', outside the flash domain ' + c[2] + ', outside the mapped area ' + c[1] + ', not mapped ' + c[0]); } }

/* ---------------- item 8 · small follow-ups ---------------- */
{ const ex = readFileSync(join(ROOT, 'scripts', 'agents', 'experiments.mjs'), 'utf8');
  ok(/commandLinux = \['cd "' \+ ctx\.appLinux/.test(ex) && /revertLinux/.test(ex),   /* v283.24: the Linux form is built as a const (command / revert = this computer's form); behaviour in tests28324/jobs.unit */ '8a DGX C-1: the approve / revert commands are given for Windows and Linux');
  const rq = readFileSync(join(ROOT, 'scripts', 'tests28312', 'requests.test.mjs'), 'utf8'); ok(/s\.near === nearWant/.test(rq), '8b requests.test: exactly 1 nearby request per selection (a run change counted apart)');
  const ai = readFileSync(join(ROOT, 'scripts', 'tests76', 'ai.test.mjs'), 'utf8'); ok(/C5-C13 retired in v91\.17\.283\.28/.test(ai), '8c tests76/ai C8 / C9 retired with the Predictions tab (v283.28 P16; the day buttons read the issued levels, tests28328p/p14)');
  const v = readFileSync(join(ROOT, 'scripts', 'tests144', 'v144.test.mjs'), 'utf8'); ok(/once drawn/.test(v), '8d v144 day bar measured once drawn (polled, under load)'); }

/* ---------------- item 9 · calibrated rain probability ---------------- */
{ const C = J('rain-prob-coefs.json', join(ROOT, 'data'));
  const prc = rainClassSharesCalibrated(C, Array(51).fill(90), 51, { zone: 'plains', month: 8, lead: 1 }, 'precipitation');   /* a very wet monsoon day */
  const cell = rainCell({ prc }, 51);
  ok(cell.L === -5 && /not tested: screening only/.test(cell.why || '') && cell.facts && /chance of \u226515\.6 mm: \d+ %, screening, not a tested level/.test(cell.facts.text), '9a (v283.31 -5 not tested) a calibrated day with no tested class: not tested (never Normal), the probability a fact in the reason', JSON.stringify({ L: cell.L, text: cell.facts && cell.facts.text }));
  const app2 = { engine: { unit: () => ({ ready: true, unit: 'u', words: W, days: [{ day: 1, date: '2026-10-25', layers: { rain_hz: { name: 'Heavy rain', level: cell.L, word: cell.L >= 0 ? W[cell.L] : 'no data', why: cell.why, facts: cell.facts } } }], alerts: [] }) },
    gate: { full: () => ({ ready: true, version: 't', client_rules: { hidden_layers: {}, substitute: {} } }), entryOf: () => ({ id: 'rain-classes', product_type: 'Screening index', resolved: { canAlert: true } }) } };
  const su = servedUnit(app2, 'u', false), r = su.days[0].layers.rain_hz;
  ok(r.word === 'Not assessed' && r.canAlert !== true && /screening only/.test(r.notAssessedWhy || '') && /screening, not a tested level/.test(r.fact || ''), '9b served: Not assessed with the screening reason, no alert, the probability fact present', JSON.stringify({ word: r.word, canAlert: r.canAlert, pt: r.productType, fact: r.fact }));
  const allUntested = Object.values(C.gate).every((g) => !g.tested);
  ok(allUntested, '9c no class x lead is marked tested in data/rain-prob-coefs.json (every rung screening)');
  const RT = J('rain-prob-retest.json', join(ROOT, 'data')); const crypto = await import('node:crypto');
  ok(RT && RT.window.validFrom === '2026-10-23' && RT.window.validTo === '2027-03-31' && RT.frozen.sha256 === crypto.createHash('sha256').update(readFileSync(join(ROOT, 'data', 'rain-prob-coefs.json'))).digest('hex'),
    '9d the fresh-window re-test (23 Oct 2026 - 31 Mar 2027) is pre-registered against the frozen coefficients (sha256 matches)');
  const ol = readFileSync(join(ROOT, 'server', 'api', 'outlook.mjs'), 'utf8'), ev = readFileSync(join(ROOT, 'server', 'api', 'ensverify.mjs'), 'utf8');
  ok(/k >= 1 && k <= 3 && rainCoefs\(\)/.test(ol) && /rainClassSharesCalibrated\(rainCoefs\(\), row\._pr/.test(ol) && /prs: days\[L\]\.prs/.test(ev), '9e outlook.mjs: leads 1-3 on the total precipitation members; the ensemble log keeps the member statistics'); }

console.log('\n' + pass + ' passed, ' + fail + ' failed (data ' + DATA + ')');
process.exit(fail ? 1 : 0);
