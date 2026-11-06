/* v91.17.283.24 . SERVER LANE (self-audit P / H / D items, the 24 Oct leftovers and heavy-rain method d), offline: no server, no provider.
     P3   a sweep is a sweep by its route (page / engine), the keep-warm replays only remembered sweep keys, the keys are bounded
     P4   the point record's "how it is made" is read from its own provider answer (no __raw re-request)
     P6   runstate: every write has its own temp file; a timed save that started before a drain save does not rename over it
     P7   point products: held by bytes and age, not only by count
     P8   the operator mos part: a point without a height is not assessed (was read at 0 m)
     P9   fleet.nearest: the "no station" reason is the call's own (opts.out), not a shared lastWhy
     P12  runstate: a part changed again in the same run is written again after sameRunRewriteMin; the model-run cache is cut under its cap
     P13  the point engine runs no forecast chain of its own: the daily archive reads the served point record
     H13  limits 0-72 h read the served point state (no named IFS run, no second calibration)
     H15  report GLOF row from the served national record
     H17  one home for the level cuts (data/hazard-scale.json), values unchanged
     H18  flood facts: the search covers 1 km in distance at high latitude
     H20  sponge views carry the gate's own caveat; days 1-3 say they hold day 0's observed state
     H21  one rain definition (liquid) on every day; the calibrated model only on snow-free days
     L1-L4 leftovers: one GLOF table; no provider us_aqi; drought type views carry their own dates; sponge layers made when the engine left one out
     D    dead code removed (routes, app.wxhaz, exports)
     R1-R8 heavy-rain method d: probabilities as fitted, the serving rule (Normal / Low or heavier, plains, leads 1-3), the 00 UTC day totals
          from the server's own 0.1 deg runs, no alert, register rows
   usage: node scripts/tests28324/server.unit.test.mjs */
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api'), DATA = join(ROOT, 'data');
const imp = (f) => import(pathToFileURL(join(API, f)).href);
const src = (f) => readFileSync(join(ROOT, f), 'utf8');
const code = (f) => src(f).replace(/\/\*[\s\S]*?\*\//g, '');   /* the source without its comments */
const J = (f) => JSON.parse(readFileSync(join(DATA, f), 'utf8'));
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 400) : '')); } };
const TMP = mkdtempSync(join(tmpdir(), 'srv28324-'));
const SV = src('server/server.mjs');

/* P3 */
{ ok(/const SWEEP_CALLERS = new Set\(\['', 'engine'\]\)/.test(SV) && /_locsN >= 20 && !qs\.has\('start_date'\) && \(SWEEP_CALLERS\.has\(_swCaller\) \|\| _swCaller === 'sweep-warm'\)/.test(SV) && /for \(const \[sk, v\] of \[\.\.\.PX_SWEEP_SEEN\]\)/.test(SV),
    'P3 a sweep is a 20+ location request from the page or the engine; the keep-warm task replays only remembered keys');
  ok(/function sweepSeenSave\(\)/.test(SV) && /route: 'sweep'/.test(SV) && /v\.route === 'sweep'/.test(SV), 'P3 seen.json entries carry route sweep; entries without it are not replayed; the save function exists');
  ok(/const SWEEP_KEYS_MAX = 64;/.test(SV) && /while \(PX_CORR_PREV\.size > SWEEP_KEYS_MAX\)/.test(SV) && /function sweepPrune\(\)/.test(SV) && /sweepBound\(\); sweepPrune\(\);/.test(SV), 'P3 keys, corrected copies and their files are bounded and pruned');
  ok(/'x-agn-internal': tag \|\| 'point-engine'/.test(src('server/api/pointstate.mjs')), 'P3 the point records are tagged (never a sweep)'); }

/* P4 */
{ ok(/x-agn-keep-raw/.test(src('server/api/pointstate.mjs')) && !/__raw: '1'/.test(src('server/api/pointstate.mjs')) && /function rawKeep\(qs, body\)/.test(SV) && /backend\.app\.pxRawTake = /.test(SV),
    'P4 no __raw re-request in the point record: the raw series is kept from its own provider body (server.mjs rawKeep / pxRawTake)');
  ok(/PX_RAWKEEP\.size <= 400 && v\.at >= cut/.test(SV), 'P4 the kept raw bodies are bounded (400 entries, 5 minutes)'); }

/* P6 + P12 */
{ const RS = await imp('runstate.mjs'); const dir = join(TMP, 'rs'); mkdirSync(dir, { recursive: true });
  let t = Date.parse('2026-10-27T00:00:00Z'); let data = Array.from({ length: 4000 }, (_, i) => ({ i, s: 'x'.repeat(50) })), sig = 1;
  const S = RS.createRunState({ dir, now: () => t, config: { capMB: 40, keepRuns: 2, settleMin: 0, saveEveryMin: 5, sameRunRewriteMin: 30 }, runKey: () => 'run1' });
  S.register('p', { dump: () => data, load: () => 0, sig: () => sig });
  const pa = S.saveAllAsync(); sig = 2; data = [{ newer: true }]; const sy = S.saveOne('p'); await pa;
  const f = join(dir, 'p.json.gz'); const o = JSON.parse(gunzipSync(readFileSync(f)).toString());
  ok(sy && o.data.length === 1 && o.data[0].newer === true, 'P6 a timed save that started before a drain save does not rename its older content over it', JSON.stringify(S.status().held));
  ok(!readdirSync(dir).some((x) => x.endsWith('.tmp')), 'P6 no temp file left; each write had its own (' + readdirSync(dir).join(',') + ')');
  ok(/tmpOf\(f\)/.test(src('server/api/runstate.mjs')) && !/f \+ '\.tmp', 'w'/.test(src('server/api/runstate.mjs')), 'P6 no shared <name>.json.gz.tmp writer left');
  sig = 3; data = [{ third: true }]; t += 10 * 60e3; await S.saveAllAsync();
  ok(/written for this model run/.test(S.status().held.p || ''), 'P12 changed again 10 min later in the same run: held', JSON.stringify(S.status().held));
  t += 25 * 60e3; await S.saveAllAsync(); const o2 = JSON.parse(gunzipSync(readFileSync(f)).toString());
  ok(o2.data[0] && o2.data[0].third === true, 'P12 changed again 35 min after the run’s write: written again (sameRunRewriteMin 30)');
  ok(J('runstate-config.json').sameRunRewriteMin === 30, 'P12 sameRunRewriteMin is in the register');
  const MR = src('server/server.mjs'); ok(/MRx\.snapshot\(Date\.now\(\), Math\.floor\(RS\.capChars\('modelruns'\) \* 0\.9\)\)/.test(MR) && /RS\.capChars\('pxrunmemo'\)/.test(MR), 'P12 the model-run cache and the run memo are cut under their part’s cap (newest first)'); }

/* P7 */
{ const PP = await imp('pointprod.mjs'); process.env.NIGRAAN_POINTPROD_MB = '8'; let calls = 0;
  const big = 'y'.repeat(1.5 * 1048576);
  const P = PP.createPointProducts({}, { fetchPx: async () => { calls++; return { status: 200, j: { big }, bytes: big.length + 10 }; } });
  const q = (i) => ({ latitude: String(30 + i / 100), longitude: '70', start_date: '2030-01-01', end_date: '2030-12-31', models: 'EC_Earth3P_HR', daily: 'temperature_2m_max,precipitation_sum' });
  await P.get('cmip6', q(0)); await P.get('cmip6', q(0)); const c1 = calls;
  for (let i = 1; i <= 8; i++) await P.get('cmip6', q(i)); await P.get('cmip6', q(0));
  ok(c1 === 1 && calls === 10, 'P7 a second ask is a cache read; after 12 MB of newer projections the first (8 MB cap) was let go and asked again (' + calls + ' calls)');
  delete process.env.NIGRAAN_POINTPROD_MB;
  ok(/STATIC_MS = 6 \* 3600e3/.test(src('server/api/pointprod.mjs')) && /c\.st === 'static' && now\(\) - c\.at > STATIC_MS/.test(src('server/api/pointprod.mjs')), 'P7 a projection is held at most 6 h in memory'); }

/* P8, P9, P13 */
{ const I = src('server/api/index.mjs'); ok(/if \(e == null\) return \{ ok: false, notAssessed: true/.test(I) && !/e = 0; r = app\.mos\.adjust/.test(I), 'P8 the mos part of a point without a height is not assessed (never read at 0 m)');
  const F = src('server/api/fleet.mjs'); ok(!/nearest\.lastWhy/.test(code('server/api/fleet.mjs') + code('server/api/pointstate.mjs')) && /opts\.out\.why = skipped\.length/.test(F) && /\{ out: nOut \}/.test(src('server/api/pointstate.mjs')), 'P9 the no-station reason is the call’s own (opts.out)');
  const PE = src('server/api/pointengine.mjs'); ok(!/\/px\/v1\/forecast|__raw|__nonat|__nolive/.test(PE) && /app\.pointState\.state\(p\.lat, p\.lon, \{ noBuild: true \}\)/.test(PE) && /app\.pointState\.rangeOf\(f\)/.test(PE), 'P13 the point engine asks the provider nothing: the archive is the served record and its 90 % band'); }

/* H13 */
{ const L = src('server/api/limits.mjs'); ok(!/report\.pointRun|mosCorrect|ifs-mos\.json'\)/.test(L.replace(/\/\*[\s\S]*?\*\//g, '')) && /async function servedRun\(lat, lon, elevIn, nowMs\)/.test(L) && /app\.pointState\.state\(lat, lon, \{ noBuild: true \}\)/.test(L), 'H13 0-72 h read the served point state; no named IFS run, no second calibration');
  const { createLimits } = await imp('limits.mjs'); const now = Date.now(), h0 = Math.floor(now / 3600e3) * 3600e3;
  const hours = Array.from({ length: 96 }, (_, k) => ({ time: new Date(h0 + k * 3600e3 + 5 * 3600e3).toISOString().slice(0, 16), tempC: 30 + (k === 30 ? 12.5 : 0), rh: 40, windKmh: 10, gustKmh: 20, rainMm: 0, feelsC: 30, utciShadeC: 31 }));
  const dd = join(TMP, 'lim'); mkdirSync(dd, { recursive: true });
  const app = { dataDir: dd, provider: { call: async () => { throw new Error('no provider in this test'); } }, pointState: { state: async () => ({ ok: true, run: 'r1', point: { elevM: 200 }, hours }) } };
  const Lm = createLimits(app); const r = await Lm.evaluate({ assets: [{ id: 'a', name: 'A', lat: 31.5, lon: 74.3, limits: [{ variable: 'temperature_2m', limit: 42, dir: 'above' }] }] });
  const x = r.assets && r.assets[0] && r.assets[0].limits[0];
  ok(x && x.near && x.near.state === 'crosses' && x.near.peak === 42.5, 'H13 the near-term crossing is the served hour (42.5 C at hour 30)', JSON.stringify(x && x.near).slice(0, 300)); }

/* H15 */
{ const R = src('server/api/report.mjs'); ok(/app\.glof\.national\(false\) : null, g = G && G\.ok !== false && G\.units \? G\.units\[u\.unitId\]/.test(R) && !/upstream\(u\.lat, u\.lon, \{ limit: 1 \}\); if \(g && g\.ok && g\.class/.test(R), 'H15 the report’s standing GLOF row reads the served national record of the tehsil (the trigger-outlook row keeps its own lake routing)'); }

/* H17 */
{ const SC = await imp('scalecuts.mjs'); ok(JSON.stringify(SC.screeningCuts()) === '[25,45,65,82]' && JSON.stringify(SC.landslideOddsEdges()) === '[2,5,10,20]' && JSON.stringify(SC.droughtSpiBounds()) === '[-0.5,-0.8,-1.3,-1.6]', 'H17 the register cuts are the old values (25/45/65/82; 2/5/10/20; USDM)');
  const HZ = await imp('hazsci.mjs'), AH = await imp('areaheat.mjs');
  ok([0, 24.9, 25, 44.9, 45, 64.9, 65, 81.9, 82, 100].map((s) => HZ.levelOfScore(s)).join() === '0,0,1,1,2,2,3,3,4,4' && AH.levelOfScore(65) === 3 && HZ.levelOfOdds(4.9) === 1 && HZ.levelOfOdds(20) === 3 /* v283.36 C-now 2: odds bands 2/5/10, top band 10x or more */ && HZ.levelOfSpi(-0.5) === 1 && HZ.levelOfSpi(-1.7) === 4 && HZ.levelOfSpi(0) === 0, 'H17 the levels read from the register are unchanged');
  const code = ['hazsci.mjs', 'areaheat.mjs', 'flood.mjs', 'shown.mjs'].map((f) => src('server/api/' + f).replace(/\/\*[\s\S]*?\*\//g, '')).join('\n');
  ok(!/\[25, 45, 65, 82\]|\[0\.25, 0\.45, 0\.65, 0\.82\]|\[2, 5, 10, 20\]|\[-0\.5, -0\.8, -1\.3, -1\.6\]|>= 82 \?/.test(code), 'H17 no copy of the cuts left in code'); }

/* H18 */
{ const FF = await imp('floodfacts.mjs'); const dd = join(TMP, 'ff'); mkdirSync(dd, { recursive: true });
  const lat0 = 37.0, lon0 = 74.0, dlon = 0.95 / (111.2 * Math.cos(lat0 * Math.PI / 180));   /* 0.95 km east: two 0.01 deg buckets away at 37 N */
  writeFileSync(join(dd, 'flood-facts.json'), JSON.stringify({ version: 't', years: [2022], lat: [Math.round(lat0 * 1e5)], lon: [Math.round((lon0 + 0.0001 + dlon) * 1e5)], rs: [0], fw: [0], f5: [0], d100: [-1], fy: [0], sy: [0], mf: [0], mo: [0], fl: [0], fh: [255] }));
  const r = FF.createFloodFacts(dd, null).at(lat0, lon0 + 0.0001);
  ok(r.found === true && r.km < 1, 'H18 a row 0.95 km away at 37 N (two longitude buckets) is found', JSON.stringify(r).slice(0, 200)); }

/* H20 + L4 */
{ const HZ = await imp('hazsci.mjs'); const G = J('model-gate.json');
  const v2 = { units: { u: { bins: [[0, 0, 0, 1]] } }, covers: ['grass'], cn2: { grass: [70] }, fSlope: [1], edgesCN: [85, 80, 75, 70] };
  const rec = { days: [0, 1].map((k) => ({ day: k, date: '2026-10-2' + (7 + k), layers: { heat: { L: { u: 0 } } } })) };
  HZ.applySponge(rec, { v2, rain5Of: () => ({ mm: 10, daily: [1, 2, 3, 4, 5].map((k) => ({ date: '2026-10-2' + k, mm: 2 })) }) /* v283.35: the per-day model rain (event-based runoff) */, runoffCuts: [{ min: 25, idx: 4 }, { min: 10, idx: 3 }, { min: 5, idx: 2 }, { min: 1, idx: 1 }, { min: null, idx: 0 }], gate: G });
  const d0 = rec.days[0].layers, d1 = rec.days[1].layers;
  ok(HZ.SPONGE_LAYERS.every((k) => d0[k] && d0[k].L.u >= 0), 'L4 the sponge layers are made by the server when the engine left them out', JSON.stringify(Object.keys(d0)));
  ok(/never raises an alert|raises no alert/.test(d0.nss_dynamic.basis) && /not a tested runoff forecast/.test(d0.nss_runoff.basis), 'H20 each sponge view carries its gate entry’s own caveat', d0.nss_dynamic.basis);
  ok(d1.nss_dynamic.heldFrom === '2026-10-27' && /held for this day \(no forecast of the sponge is issued\)/.test(d1.nss_dynamic.basis) && !d1.nss_baseline.heldFrom, 'H20 days 1-3 say they hold day 0’s observed state'); }

/* H21 */
{ const O = src('server/api/outlook.mjs'); ok(/const snowFree = !M\.sn \|\| M\.sn\.every/.test(O) && /rainCoefs\(\) && snowFree\)/.test(O), 'H21 one rain definition: the calibrated model (fitted on total precipitation) only where no member has snow (liquid = total)'); }

/* L1-L3 */
{ const HS = J('hazard-scale.json'); ok(!('glofStandingLevel' in HS) && HS.glofLadder && HS.glofLadder.Monitor === 'Normal' && /const L = \(hazardScale\(\) \|\| \{\}\)\.glofLadder/.test(src('server/api/ai.mjs')), 'L1 one GLOF class table (glofLadder) read by glof.mjs, hazsci.mjs and the AI');
  ok(!/'us_aqi'/.test(src('server/api/smog.mjs')), 'L2 the provider’s us_aqi is neither asked nor read: the AQI is the server’s (aqiOf)');
  const HZ = await imp('hazsci.mjs');
  const rec = { days: [{ day: 0, date: '2026-10-27', layers: { drought: { L: { a: 0, b: 0 } } } }] };
  const chirps = { monthBasis: { month: '2026-09' }, units: { a: { monthly: { month: { month: '2026-09', spi3: { value: -0.6 } } } }, b: { monthly: { month: { month: '2026-09', spi3: { value: 0.2 } } } } } };
  const dt = { a: { indicators: { soil: { band: 2, percentile: 15, at: '2026-10-25' }, crops: { band: 1, vhi: 38, week: '2026-W42' } } }, b: { indicators: { soil: { band: 0, percentile: 50, at: '2026-10-26' } } } };
  HZ.applyDrought(rec, { chirps, soilOf: () => null, dtypeOf: (u) => dt[u] }); const L = rec.days[0].layers;
  ok(L.drought.date === '2026-09' && L.drought_rain.date === '2026-09' && L.drought_soil.date === null && L.drought_soil.datesPerCell === true && L.drought_soil.facts.a.at === '2026-10-25' && L.drought_crops.date === '2026-W42',
    'L3 one date per value: the soil view is not dated with the SPI month; each cell carries its own reading date', JSON.stringify([L.drought_soil.date, L.drought_crops.date])); }

/* D */
{ const I = src('server/api/index.mjs');
  ok(!/'\/api\/vcarchive\/status'|'\/api\/openaq\/status'|'\/api\/openaq\/poll'/.test(I), 'D2 the uncalled status / poll routes are gone');
  ok(!/createWxHaz|app\.wxhaz/.test(code('server/api/index.mjs')), 'D3 app.wxhaz is no longer created (never read)');
  { const { existsSync: ex } = await import('node:fs'); ok(!ex(join(ROOT, 'server/api/wxhaz.mjs')) && !ex(join(ROOT, 'server/api/pluvialtrigger.mjs')), 'D3b v283.51g3: the dead modules wxhaz.mjs and pluvialtrigger.mjs are removed'); }
  ok(!/export \{ DROUGHT_SCREEN_NOTE \}/.test(code('server/api/report.mjs')) && !/if \(false\)/.test(code('server/api/hand.mjs')) && !/NOT_ASSESSED\.beyond|beyond:/.test(code('server/api/served.mjs')) && !/observedWords/.test(code('server/api/landslideodds.mjs')) && !/evidenceCacheState/.test(code('server/api/evidence.mjs')) && !/saveNow/.test(code('server/server.mjs')),
    'D4/D dead code removed (report re-export, hand.mjs if(false), NOT_ASSESSED.beyond, observedWords, evidenceCacheState, runState.saveNow)');
  ok(!/placeOf, stamp|_cache: cache/.test(src('server/api/point.mjs') + src('server/api/pointstate.mjs')) && !/stats: \(\) =>/.test(src('server/api/pointprod.mjs')), 'D point.placeOf / _cache, pointState._cache and pointprod.stats are no longer exported');
  ok(!/levelPhrase/.test(src('server/api/ai.mjs').split('\n').filter((l) => /^import/.test(l)).join('\n')), 'D6 the unused levelPhrase import is gone'); }

/* J8 (jobs lane item, server file) */
{ ok(/heavy: 'sync', label: 'MACH database sync \(Python\)'/.test(src('server/api/machdb.mjs')), 'J8 the MACH database sync runs in the sync slot pool, not the shared bulk slot'); }

/* G1 the general alert minimum has one home (the gate register); O1 a point outside the window is outside */
{ const G = J('model-gate.json'), EN = await imp('engine.mjs');
  ok(G.alert_min_class_rank && G.alert_min_class_rank.value === 3 && J('model-gate.resolved.json').alert_min_class_rank.value === 3 && !/minRank = 3/.test(src('server/api/engine.mjs')) && /alertMinRank: \(\) =>/.test(src('server/api/gate.mjs')),
    'G1 the alert minimum (High, rank 3, unchanged) is read from data/model-gate.json alert_min_class_rank, no typed default in engine.mjs');
  const scale = J('hazard-scale.json'), row = { name: 'X', hazard: 'wind', holders: [{ hazard: 'wind', index: 50 }, { hazard: 'flood', index: 70 }] };
  const g3 = EN.alertGate({ canAlert: (h) => h === 'wind', scale, policy: { layers: {} }, names: {}, minRank: 3 })([row]), g0 = EN.alertGate({ canAlert: (h) => h === 'wind', scale, policy: { layers: {} }, names: {} })([row]);
  ok(g3.length === 0 && g0.length === 0, 'G1 a Moderate holder is below the High minimum; without the register no generic alert (fail closed)');
  const g4 = EN.alertGate({ canAlert: () => true, scale, policy: { layers: {} }, names: {}, minRank: 3 })([{ name: 'Y', hazard: 'wind', holders: [{ hazard: 'wind', index: 70 }] }]); ok(g4.length === 1, 'G1 a High holder alerts at the register minimum');
  ok(/if \(c\.outside\) return send\(res, 200, \{ ok: false, outside: true, why: 'outside Pakistan-administered territory/.test(src('server/api/index.mjs')), 'O1 /api/point outside the build window: ok false, outside true, a plain reason'); }

/* R: heavy-rain method d */
{ const RP = await imp('rainprob.mjs'), HZ = await imp('hazsci.mjs'), C = J('rain-prob-coefs-ifsdet.json');
  ok(C.method === 'd' && C.gate['15.6|1'].tested && C.gate['15.6|1'].zones.plains && !C.gate['15.6|1'].zones.hills && ['64.5', '115.6', '204.5'].every((c) => [1, 2, 3].every((l) => !C.gate[c + '|' + l].tested)) && /station event test/.test(C.test), 'R1 the coefficient file: only 15.6 mm tested, plains, leads 1-3; the test reference is recorded');
  const ref = (mm, lead, mon) => { const c = C.cells['plains|' + (mon ? 'monsoon' : 'rest') + '|' + lead + '|15.6']; const x = Math.min(c.hi[0], Math.max(c.lo[0], Math.log1p(mm))); return 1 / (1 + Math.exp(-(c.w[0] + c.w[1] * x + c.w[2] * (mon ? 1 : 0)))); };
  const r = RP.rainClassProbs(C, null, 0, { zone: 'plains', month: 7, lead: 2, detMm: 30 }); ok(Math.abs(r.p['15.6'] - ref(30, 2, true)) < 1e-9 && r.status['15.6'] === 'tested' && r.status['64.5'] === 'screening', 'R2 the probability is the fitted logistic (log1p total, monsoon term)', r.p['15.6']);
  const lo = RP.detLevel(C, RP.rainClassProbs(C, null, 0, { zone: 'plains', month: 10, lead: 1, detMm: 1 })), hi = RP.detLevel(C, RP.rainClassProbs(C, null, 0, { zone: 'plains', month: 10, lead: 1, detMm: 60 }));
  ok(lo.L === 0 && hi.L === 1 && hi.lowOrHeavier && hi.words === 'Low or heavier' && hi.cut === C.cutsByLead['15.6']['1'], 'R3 serving rule: under the cut Normal, at or above it Low (said Low or heavier), the cut of the lead');
  ok(RP.detLevel(C, RP.rainClassProbs(C, null, 0, { zone: 'hills', month: 7, lead: 1, detMm: 60 })) === null && RP.rainClassProbs(C, null, 0, { zone: 'plains', month: 7, lead: 4, detMm: 60 }).p === null
    && RP.rainClassProbs(C, null, 0, { zone: 'plains', month: 7, lead: 1, detMm: null }).p === null, 'R4 hills, lead 4 and a missing total: no level from method d (never 0)');
  /* applyRain: plains days 1-3 from method d; day 0, hills and a stale ensemble keep the screening rule */
  const days = ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'];
  const rec = { days: days.map((date, k) => ({ day: k, date, layers: { rain_hz: { L: { p: 0, h: 0 } } } })) };
  const shareRow = { prc: { n: 51, p: { '15.6': 4, '64.5': 0, '115.6': 0, '204.5': 0 } } };
  const ens = { at: new Date().toISOString(), members: 51, days, units: { p: days.map(() => shareRow), h: days.map(() => shareRow) } };
  const det = (uid, date) => { const k = days.indexOf(date); if (k < 1 || k > 3) return null; return { mm: k === 2 ? 50 : 0.5, lead: k, run: '2026102700', zone: uid === 'p' ? 'plains' : 'hills', month: 10 }; };
  HZ.applyRain(rec, ens, { det, detCoefs: C }); const L = (k, u) => rec.days[k].layers.rain_hz.L[u], F = (k, u) => rec.days[k].layers.rain_hz.facts[u];
  ok(L(1, 'p') === 0 && L(2, 'p') === 1 && L(3, 'p') === 0 && F(2, 'p').levelLabel === 'Low or heavier' && F(1, 'p').method === 'd' && F(1, 'p').ensembleShares, 'R5 plains days 1-3: Normal / Low or heavier from method d; the ensemble share stays a fact', JSON.stringify([L(1, 'p'), L(2, 'p'), L(3, 'p')]));
  ok([L(0, 'p'), L(4, 'p'), L(1, 'h'), L(2, 'h')].every((x) => x === -5), 'R6 (v283.31 state codes) day 0 without a total, day 4 and the hills stay not tested (-5, screening)', JSON.stringify([L(0, 'p'), L(4, 'p'), L(1, 'h'), L(2, 'h')]));
  ok(/tested chance that the station day total reaches 15\.6 mm/.test(rec.days[1].layers.rain_hz.basis), 'R6 the layer basis says which cells are method d');
  /* the server's own 0.1 deg 00 UTC run: PKT-day totals from the accumulated rain, 19 + 24 (k - 1) .. 19 + 24 k */
  const E = await imp('ecmwf010.mjs'); const dir = join(TMP, 'e010'), run = '2026102700', rd = join(dir, run); mkdirSync(rd, { recursive: true });
  const steps = Array.from({ length: 33 }, (_, i) => i * 3), g = { lat0: 30, lon0: 70, dlat: 0.1, dlon: 0.1, ny: 3, nx: 3 }, n = g.ny * g.nx;
  const tp = new Int16Array(steps.length * n); steps.forEach((s, k) => { for (let c = 0; c < n; c++) tp[k * n + c] = k === 0 ? 0 : 100; });   /* 1 mm every 3 h (scale 0.01) */
  const t2 = new Int16Array(steps.length * n).fill(2000);
  writeFileSync(join(rd, 'tp.i16.gz'), gzipSync(Buffer.from(tp.buffer))); writeFileSync(join(rd, 't2m.i16.gz'), gzipSync(Buffer.from(t2.buffer)));
  writeFileSync(join(rd, 'meta.json'), JSON.stringify({ run, runTimeUtc: '2026-10-27T00Z', steps, grid: g, vars: { tp: { scale: 0.01, offset: 0, kind: 'acc' }, t2m: { scale: 0.01, offset: 0 } } }));
  writeFileSync(join(dir, 'index.json'), JSON.stringify({ latest: run, runs: [{ run, runTimeUtc: '2026-10-27T00Z', steps: steps.length, maxStep: 96 }] }));
  const M = E.createEcmwf010({}, ROOT, TMP, { dir }); const T = M.pktDayTotals(30.1, 70.1);
  ok(T && T.run === run && T.days['2026-10-28'].lead === 1 && Math.abs(T.days['2026-10-28'].mm - 8) < 1e-6 && T.days['2026-10-30'].lead === 3 && Math.abs(T.days['2026-10-30'].mm - 8) < 1e-6, 'R7 the 00 UTC day total of lead 1-3 (1 mm / 3 h -> 8 mm a PKT day) from the server’s own run', JSON.stringify(T && T.days));
  ok(/pktDayTotals\((?:u\.)?lat, (?:u\.)?lon\)/.test(src('server/api/hazsci.mjs')) /* v283.28 S5: one detAt for a tehsil point or a site */ && !/provider\.call|fetch\(/.test(src('server/api/rainprob.mjs')), 'R7 method d reads the run already on disk: no provider call');
  const SE = await imp('served.mjs'); ok(/v\.facts\.method === 'd'/.test(src('server/api/served.mjs')) && /t\.canAlert = false/.test(src('server/api/served.mjs'))   /* v283.31: the line also takes method d-z (zone cells) */
    && SE.levelLabelOf('rain_hz', 1, { method: 'd', tested: true, levelLabel: 'Low or heavier' }) === 'Low or heavier'   /* v283.24 integration: one home for the label (served.mjs levelLabelOf) */
    && J('model-gate.resolved.json').entries.find((e) => e.id === 'rain-classes').resolved.canAlert === false, 'R8 no alert from the method d level; Low is labelled Low or heavier; the gate entry stays experimental');
  const RG = J('thresholds-register.json').rows; ok(RG.some((r) => r.id === 'rainprob.ifsdet.cut.15.6' && r.status === 'tested' && /station event test/.test(r.source)) && RG.some((r) => r.id === 'rainprob.ifsdet.cut.64.5' && r.status === 'screening'), 'R8 the register rows carry the test reference');
  ok(existsSync(join(DATA, 'evidence', 'rain-station', 'evidence_rain_classes_station.csv')) && J('model-gate.json').entries.find((e) => e.id === 'rain-classes').method_d, 'R8 the evidence ships and the gate entry records the test'); }

try { rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
