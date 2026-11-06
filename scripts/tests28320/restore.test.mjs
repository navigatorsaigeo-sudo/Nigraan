import * as __T from '../lib/testenv.mjs';
/* v91.17.283.20 · SCIENCE RESTORED, FIRST ANSWER AT ONCE (owner, 25 Oct 2026: the science audit of 283.17-283.19 and the live check of
   283.19). Against a running server (argv[2]); the code checks read this tree.
     A1  flood facts are lent BY LOCATION as in v283.16 (the nearest row within 1 km, "here" within 0.1 km): 100 points on the 0.01 deg
         grid, every fact equal to the facts of the nearest row found by brute force over the whole table; the place table only names it
     A2  the record's now carries UTCI in the sun (utciSunC, tmrtSunC) by the v283.16 formula (utci.mjs tmrt + utci at the sun's elevation)
     A3  the operator bundle carries part state (WBGT Liljegren, Tmrt, wind pressure, FDH, snow) and the customer bundle does not; the old
         route /api/state/point stays retired; skill.mjs cites only fields that exist
     A4  the land part carries the v283.16 compound-flood request (15-minute rain now, 7 past days + all of today); the operator part mos is
         the MOS adjustment (app.mos.adjust); the frozen run is asked at the site's height
     A5  /api/point/batch?with=inputs: each point carries its model inputs (soil, MSL pressure, 850 hPa, ET0) in ONE request, 600 points
     A6  the accuracy monitor's cities are the v283.16 set (GeoNames PPLC / PPLA / PPLA2 of data/pk-places.tsv.gz), named by a register
     A7  keep.json names the kept page scripts by id or a unique line of code (never by position); the module list holds agn-hz5-js,
         agn-alerts-one and mach-district-forecast-repair and equals the v283.16 kept set (less the deleted agn-perf-js)
     A8  the thresholds register records the exact-point rule (pointstate.pointPrecision)
     B4  /api/registry/levels: the heat legend from 26 C (Low 26-32 mild, Moderate 32-38, High 38-46, Severe 46+), cold from 0 (Low 0 to -13 mild), words, "not assessed"
     B6  /api/levels?layers=a,b answers every layer in one response, each equal to its single-layer answer
     B7  no page function is defined in more than one script block (selectCity, driveFromPoint, activeAlerts, aiRender, _alertSevWord,
         toggleIndus, MACH_TIME, AGN.health, AGN.writeRefusal); no save-and-wrap of a page global; no fixed-coordinate provider probe
     B8  the first answer of a new place is served before its slow parts (pending listed), the completion read (&complete=1) answers the
         SAME bundle complete; a held complete bundle is answered at once
   usage: node scripts/tests28320/restore.test.mjs [http://127.0.0.1:8787] */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
const BASE = __T.BASE, ROOT = __T.ROOT;
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 700) : '')); } };
const J = async (u, view = 'customer', t = 120000) => { const r = await fetch(BASE + u, { headers: { 'x-agn-view': view }, signal: AbortSignal.timeout(t) }); let j = null; try { j = await r.json(); } catch (_) {} return { status: r.status, j }; };
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const PAGE = readFileSync(join(ROOT, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html'), 'utf8');

/* ---- A1 · flood facts by location ---- */
{ const { createFloodFacts, factsOf, NEAR_KM, HERE_KM } = await imp('server/api/floodfacts.mjs');
  const names = []; const stub = { nearestRecord: (la, lo) => { names.push([la, lo]); return { id: 'P-test', name: 'Named place' }; } };
  const F = createFloodFacts(join(ROOT, 'data'), stub), T = F.table();
  if (!T) ok(false, 'A1 data/flood-facts.json is in the tree'); else {
    const KM = (a, b, c, d) => { const r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return 6371 * Math.hypot(x, y); };
    /* 100 points by rule on the 0.01 deg grid: every 1671st table row moved by a fixed offset (in and out of the 1 km reach) */
    const pts = []; for (let k = 0; pts.length < 100; k++) { const i = (k * 1671) % T.lat.length; const o = [[0, 0], [0.004, 0.003], [0.007, -0.006], [0.012, 0.0]][k % 4];
      pts.push([Math.round((T.lat[i] / 1e5 + o[0]) * 100) / 100, Math.round((T.lon[i] / 1e5 + o[1]) * 100) / 100]); }
    let same = 0, found = 0; const bad = [];
    for (const [la, lo] of pts) { let best = -1, bk = Infinity;
      for (let i = 0; i < T.lat.length; i++) { const dla = Math.abs(T.lat[i] / 1e5 - la); if (dla > 0.02) continue; const d = KM(la, lo, T.lat[i] / 1e5, T.lon[i] / 1e5); if (d < bk) { bk = d; best = i; } }
      const r = F.at(la, lo), want = best >= 0 && bk <= NEAR_KM;
      if (!want) { if (!r.found) same++; else bad.push(la + ',' + lo + ' found beyond 1 km'); continue; }
      found++; const here = bk <= HERE_KM, exp = factsOf(T, best, here ? 'this place' : 'X');
      const eq = r.found && r.here === here && Math.abs(r.km - Math.round(bk * 100) / 100) < 1e-9 && JSON.stringify({ ...r.river, words: null }) === JSON.stringify({ ...exp.river, words: null }) && JSON.stringify(r.observed) === JSON.stringify(exp.observed) && JSON.stringify({ ...r.flash, words: null }) === JSON.stringify({ ...exp.flash, words: null });
      if (eq) same++; else bad.push(la + ',' + lo); }
    ok(same === 100 && found >= 40, 'A1 flood facts at 100 grid points: the nearest row within 1 km (location only) lends every fact, as v283.16 (' + same + '/100 identical, ' + found + ' with facts)', bad.slice(0, 6).join('; '));
    ok(names.length > 0, 'A1 the place table only names the lending row (' + names.length + ' names asked)'); } }

/* ---- the place bundles ---- */
const s0 = (await J('/api/geo/search?q=' + encodeURIComponent('Lahore') + '&limit=3')).j; const top = s0 && s0.results && s0.results[0];
const P = top ? 'id=' + encodeURIComponent(top.id) : 'lat=31.52040&lon=74.35870';
const fresh = 'lat=' + (30.1 + Math.random() * 0.5).toFixed(5) + '&lon=' + (71.3 + Math.random() * 0.5).toFixed(5);   /* a point no test asked before */
const t0 = Date.now(); const b1 = await J('/api/point?' + fresh); const first = Date.now() - t0;
const t1 = Date.now(); const b2 = await J('/api/point?' + fresh + '&complete=1'); const second = Date.now() - t1;
const B1 = b1.j || {}, B2 = b2.j || {};
ok(B1.ok && B1.now && B1.place && B1.station && Array.isArray(B1.pending), 'B8 the first answer of a new place: place, now, hours, days, station at once (' + first + ' ms; pending: ' + (B1.pending || []).join(', ') + ')', JSON.stringify(Object.keys(B1)));
ok(B2.ok && B2.complete === true && (B2.pending || []).length === 0 && B2.assembledAt === B1.assembledAt && Object.values(B2.parts || {}).every((p) => !p.pending), 'B8 the completion read answers the SAME bundle complete (' + second + ' ms; assembled ' + B2.assembledAt + ')', JSON.stringify({ c: B2.complete, p: B2.pending, a: [B1.assembledAt, B2.assembledAt] }));
const t2 = Date.now(); const b3 = await J('/api/point?' + fresh + '&complete=1'); ok(b3.j && b3.j.complete && Date.now() - t2 < 3000, 'B8 a held complete bundle is answered at once (' + (Date.now() - t2) + ' ms)');
{ /* B8 · a link's point and name: the completion read repeats the answer's own query (self), so it is the same bundle under the same label */
  const q = 'lat=' + (34.0151 + Math.random() * 0.001).toFixed(5) + '&lon=71.52490&name=Peshawar'; const f = (await J('/api/point?' + q)).j || {};
  const g = f.self ? (await J(f.self + '&complete=1')).j || {} : {};
  ok(!!f.self && /name=Peshawar/.test(f.self) && g.ok && g.complete && g.assembledAt === f.assembledAt && g.place && f.place && g.place.name === f.place.name && g.now && f.now && g.now.tempC === f.now.tempC, 'B8 the completion read of a named point (' + f.self + ') answers the same bundle under the same label (' + (g.place && g.place.name) + ')', JSON.stringify({ self: f.self, n: [f.place && f.place.name, g.place && g.place.name] })); }
const C = (await J('/api/point?' + P + '&complete=1')).j || {}, O = (await J('/api/point?' + P + '&complete=1', 'operator')).j || {};
/* ---- A2 ---- */
{ const { utci, tmrt, sunElev } = await imp('server/api/utci.mjs'); const n = C.now || {};
  const has = 'utciSunC' in n && 'tmrtSunC' in n && 'sunElevDeg' in n;
  let agree = null; if (has && n.utciSunC != null) { const tm = tmrt(n.tempC, n.swRad, null, n.sunElevDeg, null); agree = Math.abs(tm - n.tmrtSunC) <= 0.1 + 1e-9 && Math.abs(utci(n.tempC, tm, n.windKmh / 3.6, n.rh) - n.utciSunC) <= 0.15; }
  ok(has && (n.utciSunC == null ? (n.sunElevDeg <= 0 || n.swRad == null || n.swRad <= 0) : agree), 'A2 the record carries UTCI in the sun by the v283.16 formula (' + JSON.stringify({ utciSunC: n.utciSunC, tmrtSunC: n.tmrtSunC, sunElevDeg: n.sunElevDeg, swRad: n.swRad }) + ')');
  ok(/utciSun=_rec\.now\.utciSunC/.test(PAGE) && /in the sun about/.test(PAGE), 'A2 the comfort card shows UTCI in the sun from the store'); }
/* ---- A3 ---- */
{ const st = O.parts && O.parts.state, cu = C.parts && C.parts.state;
  const v = st && st.v; ok(!!(v && v.thermal && v.thermal.now && 'wbgt' in v.thermal.now && 'tmrt' in v.thermal.now && v.wind && v.freezing && v.snow) || !!(st && st.ok === false && st.why), 'A3 the operator bundle carries part state (WBGT Liljegren, Tmrt, wind pressure, FDH, snow): ' + (st ? (st.ok ? 'computed' : 'not available: ' + st.why) : 'missing'));
  ok(!cu, 'A3 the customer bundle carries no operator part (state)');
  const gone = await fetch(BASE + '/api/state/point?lat=31.52&lon=74.35'); ok(gone.status === 404, 'A3 /api/state/point stays retired (' + gone.status + ')');
  ok(existsSync(join(ROOT, 'server', 'api', 'state.mjs')) && /import \{ createState \} from '\.\/state\.mjs'/.test(readFileSync(join(ROOT, 'server', 'api', 'index.mjs'), 'utf8')), 'A3 server/api/state.mjs is on the serving path again (loaded by the bundle)');
  const sk = readFileSync(join(ROOT, 'server', 'api', 'skill.mjs'), 'utf8'); ok(!/\/api\/point \(the point state\) (wind|freezing|snow) block/.test(sk) && /part state \(operator view\): wind\.now/.test(sk), 'A3 skill.mjs cites the fields that exist (part state wind / freezing / snow)');
  ok(/<script id="agn-state-card-js">/.test(PAGE) && /AGN\.pointState\.part\('state'/.test(PAGE), 'A3 the operator Physical state card reads the store'); }
/* ---- A4 ---- */
{ const L = C.parts && C.parts.land && C.parts.land.v, W = L && L.water;
  ok(!!(W && W.current && 'precipitation' in W.current && W.current.interval === 900 && W.hourly && Array.isArray(W.hourly.precipitation) && W.hourly.precipitation.length === 8 * 24), 'A4 land.water: the 15-minute rain now and the hourly rain of the 7 past days and all of today (' + (W && W.hourly && W.hourly.precipitation ? W.hourly.precipitation.length : 0) + ' hours, interval ' + (W && W.current && W.current.interval) + ' s)');
  const m = O.parts && O.parts.mos; ok(!!(m && (m.ok ? m.v && 'applied' in m.v && m.v.table : m.why)), 'A4 the operator part mos is the MOS adjustment of the hour (' + (m && m.ok ? 'applied ' + m.v.applied + (m.v.adj != null ? ', ' + m.v.adj + ' C' : '') : 'not available: ' + (m && m.why)) + ')');
  ok(/AGN\.pointState\.part\('mos'/.test(PAGE) && /Raw to served/.test(PAGE), 'A4 the correction panel: the MOS line, the raw-to-served change on its own line');
  ok(/LP\.water\.current/.test(PAGE), 'A4 compound flood reads the v283.16 inputs');
  ok(/app\.report\.pointRun\(\{ lat: c\.lat, lon: c\.lon, elev:/.test(readFileSync(join(ROOT, 'server', 'api', 'index.mjs'), 'utf8')), 'A4 the frozen run is asked at the site height'); }
/* ---- A5 ---- */
{ const pts = []; for (let i = 0; i < 30; i++) pts.push((25 + i * 0.37).toFixed(4) + ',' + (67 + i * 0.29).toFixed(4));
  const r = await J('/api/point/batch?with=inputs&pts=' + pts.join(';')); const S = (r.j && r.j.states) || [];
  const good = S.filter((s) => s.ok && s.inputs && s.inputs.hourly && Array.isArray(s.inputs.hourly.soil_moisture_9_to_27cm) && Array.isArray(s.inputs.hourly.temperature_850hPa) && Array.isArray(s.inputs.hourly.et0_fao_evapotranspiration) && Array.isArray(s.inputs.hourly.pressure_msl));
  ok(r.status === 200 && good.length === S.filter((s) => s.ok).length && good.length > 0, 'A5 /api/point/batch?with=inputs: ' + good.length + ' of ' + S.length + ' points carry soil moisture, MSL pressure, 850 hPa and ET0 in ONE request');
  const many = []; for (let i = 0; i < 600; i++) many.push((27 + (i % 30) * 0.1).toFixed(3) + ',' + (68 + Math.floor(i / 30) * 0.1).toFixed(3));
  const r6 = await fetch(BASE + '/api/point/batch?with=inputs&pts=' + many.join(';')); ok(r6.status === 200, 'A5 600 district points with their inputs are one request (' + r6.status + ')');
  ok(/with=inputs&pts=/.test(PAGE) && /row\.soilMoist9to27=soil\[ni\]/.test(PAGE), 'A5 the page fills its district rows from the batch inputs'); }
/* ---- A6 ---- */
{ const { loadCities } = await imp('server/api/accmon.mjs'); const R = JSON.parse(readFileSync(join(ROOT, 'data', 'accmon-register.json'), 'utf8')).citySet;
  const t = gunzipSync(readFileSync(join(ROOT, 'data', 'pk-places.tsv.gz'))).toString('utf8'), exp = [], seen = new Set();
  for (const line of t.split('\n')) { const c = line.split('\t'); if (c.length < 7 || !/^PPL(C|A|A2)$/.test(c[5])) continue; const lat = Number(c[3]), lon = Number(c[4]); if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue; const nm = c[1] || c[0]; if (seen.has(nm)) continue; seen.add(nm); exp.push(nm); }
  const got = loadCities(join(ROOT, 'data')).map((c) => c.name);
  ok(R && R.featureCodes && JSON.stringify(got) === JSON.stringify(exp) && got.length > 50, 'A6 the accuracy monitor cities are the v283.16 set (' + got.length + ' seats, rule in data/accmon-register.json)');
  ok(!/seatsOf/.test(readFileSync(join(ROOT, 'server', 'api', 'accmon.mjs'), 'utf8')), 'A6 no city set in code'); }
/* ---- A7 ---- */
{ const K = JSON.parse(readFileSync(join(ROOT, 'scripts', 'tests283', 'ws8', 'keep.json'), 'utf8')), M = JSON.parse(readFileSync(join(ROOT, 'server', 'science', 'manifest.json'), 'utf8'));
  const ids = M.modules.map((m) => m.id).filter(Boolean);
  ok(K.blocks.every((b) => b && typeof b === 'object' && (b.id || b.anchor)), 'A7 keep.json names every kept script by id or a unique line of its code (' + K.blocks.length + ' selectors, none by position)');
  ok(['agn-hz5-js', 'agn-alerts-one', 'mach-district-forecast-repair', 'agn-cascade-engine'].every((x) => ids.includes(x)) && !['agn-boot', 'agn-state-card-js'].some((x) => ids.includes(x)), 'A7 the modules hold the hazard ladder, the alerts and the district sweep, and no UI script (' + M.modules.length + ' modules)');
  const { pageBlocks, sha1 } = await imp('server/science/loader.mjs'); const { blocks } = pageBlocks(join(ROOT, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html'));
  const bad = M.modules.filter((m) => { const b = blocks[m.from.pageScript]; return !b || sha1(b.code) !== m.from.sha1; });
  ok(!bad.length, 'A7 every module is the page script it names (hash checked)', bad.map((m) => m.file).join(', ')); }
/* ---- A8 ---- */
{ const R = JSON.parse(readFileSync(join(ROOT, 'data', 'thresholds-register.json'), 'utf8')); const r = R.rows.find((x) => x.id === 'pointstate.pointPrecision');
  ok(!!(r && r.value && r.value.areaHeatAnchor === 'exact anchor point'), 'A8 the thresholds register records the exact-point rule of the point state and the area-heat anchors'); }
/* ---- B4 ---- */
{ const L = (await J('/api/registry/levels')).j || {};
  const h = L.legends && L.legends.heat, c = L.legends && L.legends.cold;
  ok(L.ok && h && /under 26/.test(h[0]) && /26 to 32/.test(h[1]) && /moderate heat stress/.test(h[1]) && !/mild/.test(h[1]) /* v283.35 B6 */ && /32 to 38/.test(h[2]) && /38 to 46/.test(h[3]) && /46 °C or more/.test(h[4]) && /0 °C or above/.test(c[0]) && /0 to −13/.test(c[1]) && /moderate cold stress/.test(c[1]) && /−13 to −27/.test(c[2]),   /* v91.17.283.32 · the Low rows (v283.31 levels) */ 'B4 the legends come from the register: heat ' + JSON.stringify(h) + '; cold ' + JSON.stringify(c));
  ok(L.words && L.words.join(',') === 'Normal,Low,Moderate,High,Severe' && /not assessed/.test(L.outside || ''), 'B4 the level words and "not assessed" outside the valid range');
  ok(!/var HW=\{heat:\[/.test(PAGE) && !/var PW=\{heat:\[/.test(PAGE) && /\/api\/registry\/levels/.test(PAGE), 'B4 the fixed legend arrays are deleted; the page reads the register'); }
/* ---- B6 ---- */
{ const ks = ['heat', 'cold', 'rain_hz', 'flood', 'wind', 'landslide', 'glof', 'drought'];
  const one = (await J('/api/levels?layers=' + ks.join(',') + '&day=0')).j || {}; let eq = 0;
  for (const k of ks) { const s = (await J('/api/levels?layer=' + k + '&day=0')).j; if (JSON.stringify(s) === JSON.stringify(one.layers && one.layers[k])) eq++; }
  ok(one.ok && eq === ks.length, 'B6 /api/levels?layers=<8 hazards> answers each layer as its own request does (' + eq + '/8)'); }
/* ---- B7 ---- */
{ const blocks = [...PAGE.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter((m) => !/application\/json|\bsrc=/.test(m[1])).map((m) => m[2]);
  const count = (re) => blocks.filter((b) => re.test(b)).length;
  const D = { selectCity: /window\.selectCity\s*=(?!=)|^function selectCity\(/m, driveFromPoint: /window\.driveFromPoint\s*=(?!=)/, activeAlerts: /G\.activeAlerts\s*=(?!=)|^function activeAlerts\(/m, aiRender: /(G|window)\.aiRender\s*=(?!=)|^function aiRender\(/m,
    _alertSevWord: /G\._alertSevWord\s*=(?!=)|^function _alertSevWord\(/m, toggleIndus: /window\.toggleIndus\s*=(?!=)/, MACH_TIME: /window\.MACH_TIME\s*=(?!=)/, 'AGN.health': /AGN\.health\s*=(?!=)/, 'AGN.writeRefusal': /AGN\.writeRefusal\s*=(?!=)/ };
  const multi = Object.entries(D).map(([k, re]) => [k, count(re)]).filter(([, n]) => n > 1);
  ok(!multi.length, 'B7 each page function is defined in one script block (' + Object.keys(D).join(', ') + ')', JSON.stringify(multi));
  const wraps = blocks.filter((b) => /var (o|f|base|orig|prev|oldAi|baseSelect)\s*=\s*(G|window)\.(activeAlerts|aiRender|selectCity|driveFromPoint|_alertSevWord)\b/.test(b)).length;
  ok(wraps === 0, 'B7 no save-and-wrap of a page function (' + wraps + ')');
  const gov = readFileSync(join(ROOT, 'server', 'api', 'governance.mjs'), 'utf8') + readFileSync(join(ROOT, 'server', 'api', 'national.mjs'), 'utf8');
  ok(!/latitude: 33\.6/.test(gov) && /probePointOf\(app\)/.test(gov), 'B7 no fixed-coordinate provider probe (the place table names the probe point)'); }
/* ---- B5 (code) ---- */
{ const ps = await fetch(BASE + '/agn-place-search.js'); const t = await ps.text();
  ok(ps.status === 200 && /AGNPlaceSearch/.test(t) && /enableHighAccuracy: true/.test(t), 'B5 the one place search and my-location is served (/agn-place-search.js)');
  const S = readFileSync(join(ROOT, 'artefact', 'NIGRAAN_START.html'), 'utf8');
  ok(/<script src="\/agn-place-search\.js"><\/script>/.test(S) && !/function acRun\(/.test(S) && ![...S.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].some((m) => /navigator\.geolocation\.getCurrentPosition/.test(m[1]) && !/_handleGeolocationError/.test(m[1])), 'B5 the start page uses it (its own search and geolocation code deleted)');
  ok(/<script src="\/agn-place-search\.js"><\/script>/.test(PAGE) && !/getUserLocation:function/.test(PAGE) && (PAGE.match(/AGN\.places\.attach\(/g) || []).length >= 5 && /AGNPlaceSearch\.mount\(/.test(PAGE), 'B5 the analyst: one search / my-location implementation, every place box attached, the Overview top bar mounted'); }

/* ---- A7 · the server's engine runs the page without /agn-place-search.js: no page script may need it to load (283.20 first build:
   three science scripts stopped in the engine, so the flood sweep and the heat / cold / wind levels were empty) ---- */
ok(!/window\.AGNPlaceSearch\.(attach|search|locate)\(/.test(PAGE) && /function attach\(o\)\{ return PS\(\)\?PS\(\)\.attach\(o\):\{run:function\(\)\{\},cancel:function\(\)\{\}\}; \}/.test(PAGE), 'A7 the page reaches the shared place search only through AGN.places (inert in the engine, which runs the page without the file)');
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
