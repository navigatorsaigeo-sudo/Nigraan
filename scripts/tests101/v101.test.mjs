/* v91.17.101 · Phase 0 of the full audit: wrong outputs fixed, customer leaks closed, issued-products archive, hands-free deploy.
   node nigraan-local/scripts/tests101/v101.test.mjs  (server running) */
import { readFileSync, existsSync } from 'node:fs';
import { viaBundle } from '../lib/retired.mjs';
const BASE = process.env.NIGRAAN_BASE || 'http://127.0.0.1:8787';
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + String(x).slice(0, 300) : '')); } };
const rd = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const get = async (p, h = {}) => { const r = await fetch(BASE + p, { headers: h, signal: AbortSignal.timeout(180000) }); let j = null; try { j = await r.json(); } catch (_) {} return { status: r.status, json: j }; };
const getB = viaBundle(get);   /* v91.17.283.19: the retired place routes read the place bundle's part (scripts/lib/retired.mjs) */
const CUST = { 'x-agn-view': 'customer' };

/* ── the page ── */
const B = rd('../../build/base/AI_GEO_NIGRAAN_v91_17_BASE80.html');
ok(/function hzRainIntensityIndex[\s\S]{0,900}FR\('flood\.rainBands'\)/.test(B), 'A2 rainfall layer reads the model-space rain rungs (can pass Moderate)');
ok(/function agnRainRate\(v, cur\)/.test(B) && (B.match(/agnRainRate\(/g) || []).length >= 6, 'A2 the 15-minute current precipitation is converted to a rate');
ok(!/'Cloudburst intensity'/.test(B), 'A2 no "cloudburst" claimed from model rain');
ok(/serverClass:\(d\.droughtClass&&d\.droughtClass\.class\)/.test(B) && /_category=\(String\(dr\.serverClass\)==='Low'\)\?'Normal':dr\.serverClass/.test(B), 'A1 the map paints the served drought class (Low reads Normal)');
ok(/highValley:!!d\.provisional/.test(B), 'A1 the high-valley provisional flag reaches the map card');
ok(/_hiCut=\(\(typeof AGN_BAND_CUTS/.test(B), 'A6 landslide threshold scores at the High cut read from the band ladder');
ok(/function arcPos\(api\)/.test(B) && /amcBandMm: \[36, 53\]/.test(B), 'A3 ground wetness anchored on the NEH-4 antecedent classes');
ok(/hazard==='nss_runoff'[\s\S]{0,400}_fcRain/.test(B) && /Run-off from today\\u2019s forecast rain/.test(B), 'A3 run-off today comes from the forecast rain');
ok(!/<option value="nss_retention">/.test(B), 'A3 the duplicate storm-retention layer is out of the picker');
ok(/if\(t==null\|\|rh==null\|\|!isFinite\(\+t\)\|\|!isFinite\(\+rh\)\) return null;/.test(B), 'A9 comfort refuses a missing humidity');
ok(/AGN_CYCLONE_COAST_KM=25/.test(B) && /_coastKmOf\(name\)/.test(B), 'A9 the coastal cyclone default is limited to units on the coast');
ok(/_noScore\('Wind \(screening\)', w\.reason, 'Wind', 'ineligible'\)/.test(B), '#9 mountain wind is a settled "not assessed", not "no reading"');
ok(/gustFromWindK:  \{ value:1\.5,/.test(B) && !/\*1\.8\)/.test(B.replace(/gust:w\*1\.8/g, '')), 'wind gust factor 1.5 from the registry');
ok(/var _ehfClim = _t95c!=null \|\| !\(inp\.t95Basis && inp\.t95Basis\.isClimatology===false\)/.test(B), 'heat EHF withheld while its T95 is not a climatology (unless the climatological tm95 is joined)');
ok(/const _tminDay =/.test(B), 'cold compares the day minimum with tn10');
ok(/var BASIS='peak';/.test(B), '#4 the map opens on the day’s peak');
ok(/category:\(_N\.class==='Low'\?'Normal':_gStand\?'Susceptible \(standing, not a forecast\)':_N\.class\)/.test(B), '#7 GLOF ladder Low reads Normal (v150: Monitor reads Susceptible, standing)');
const MUI = rd('../../build/map_ui.html');
ok(/\^very low/.test(MUI), 'seismic zone 1 "Very Low" is the bottom level');
const OP = rd('../../build/operator_ui.html');
ok(/h\.set\('x-agn-view','customer'\)/.test(OP), 'L5 the page marks its API calls in customer mode');
const V84 = rd('../../build/v84_ui.html');
ok(!/corrected against PMD/.test(V84) && /Internal: tested on held-out/.test(V84), 'L5 the held-out sentence is operator-only and names no supplier');
const KA = rd('../keepalive.vbs');
ok(/READY_APPLY\.txt/.test(KA) && /applied_v" & ver & "\.txt/.test(KA) && !/XMLHTTP|WinHttp/i.test(KA), '#111 hands-free deploy trigger (no web request)');
const SC = JSON.parse(rd('../../data/map-layer-scales.json'));
ok(SC.layers.nss_runoff.unit === 'mm' && SC.layers.nss_runoff.cuts[0].min === 25, 'run-off layer bands are depths in mm');
const DC = JSON.parse(rd('../../data/drought-class.json'));
ok(Array.isArray(DC.indexOrder) && DC.indexOrder[0] === 'SPI-90' && DC.indexOrderWhy, 'drought index order in the data file, SPI-90 first, with the reason');

/* ── the server ── */
const D = await get('/api/climatology/drought');
const U = Object.values((D.json && D.json.spi) || {});
const byIdx = {}; U.forEach(u => { const i = u.drought && u.drought.index; if (i) byIdx[i] = (byIdx[i] || 0) + 1; });
ok(((byIdx['SPI-90'] || 0) + (byIdx['SPI-3'] || 0)) > 500, 'drought classes read the 90-day slot first: SPI-90, labelled SPI-3 since the calendar-month basis of v91.17.167 (' + JSON.stringify(byIdx) + ')');
ok(U.filter(u => u.drought && u.drought.class === 'Watch').length <= 5, 'no ET0-driven Watch burst (' + U.filter(u => u.drought && u.drought.class === 'Watch').length + ')');
const N0 = await get('/api/hyperlocal/national', CUST);
ok(N0.json && !('training' in N0.json) && !('evaluation' in N0.json) && !JSON.stringify(N0.json).includes('pmdaws'), 'L5 customer view of the national model: no networks, stations or held-out scores', JSON.stringify(N0.json).slice(0, 200));
const N1 = await get('/api/hyperlocal/national');
ok(N1.json && 'training' in N1.json, 'operator (this computer, no customer mark) still gets the full record');
const G0 = await get('/api/flood/gauges', CUST);
if (G0.json && G0.json.ready) {
  const g = G0.json.gauges || [];
  ok(G0.json.customerView && g.every(x => x.kcusecs == null && x.m3s == null && !x.limits && ['Normal', 'Low', 'Moderate', 'High', 'Severe', null].includes(x.clsName)), 'L5 customer gauge outlook: AGN levels only, no flows, limits or supplier class names');
  ok(!('heldOut' in G0.json), 'L5 no held-out gauge skill in the customer view');
} else ok(true, 'gauge outlook not loaded here (no sheet) - skipped');
const M = await get('/api/map/layer?id=month:p&i=0');
if (M.json && M.json.ready) {
  const cur = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 7);
  ok(String(M.json.valid).slice(0, 7) > cur, 'season-ahead opens on a month still ahead (' + M.json.valid + ')');
  const whys = Object.values(M.json.whys || {}).join(' | ');
  ok(!/climatological mean is/.test(whys), 'season-ahead screen tests the normal, not the forecast total');
} else ok(true, 'seasonal run not stored here - skipped');
const A = await (await fetch(BASE + '/api/ops/archive/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ issued: true }), signal: AbortSignal.timeout(180000) })).json();
ok(A && A.status && A.status.kinds && A.status.kinds.issued && A.status.kinds.issued.days >= 1, '#9 the issued products are archived per day', JSON.stringify(A && A.issued));
ok(A && A.status && A.status.schema && /issued/.test(A.status.schema.issued || ''), 'the archive states the issued schema');
const OUTL = rd('../../server/api/outlook.mjs');
ok(/const liq = \(j\) =>/.test(OUTL) && /row\._prRain/.test(OUTL), 'A5 the rain outlook events and thresholds count liquid rain only');
ok(/partial run kept aside/.test(OUTL) && /partial run kept aside/.test(rd('../../server/api/smog.mjs')), 'a partial provider run no longer replaces the last complete one');

/* ── Phase 1 (same release): rain chances, GLOF label leak, river table, registry ── */
const RC = await get('/api/rain/chance');
ok(RC.json && RC.json.ready && Object.keys(RC.json.units || {}).length >= 560 && RC.json.units['Federal Capital|Islamabad|Islamabad'] !== undefined, '#11 calibrated rain chances served for every tehsil', JSON.stringify(RC.json && { ready: RC.json.ready, why: RC.json.why }).slice(0, 200));
ok(RC.json && Object.values(RC.json.units).every(u => u.days.every(d => d.p['50'] === null)), '#11 the 50 mm chance is withheld (failed its held-out skill test)');
const RCM = JSON.parse(rd('../../data/rain-chance-model.json'));
ok(/2026/.test(RCM.test) && /2025-12/.test(RCM.train) && RCM.satFeature === false, '#11 the rain model is trained on 2024-25 and tested on 2026 (blocked in time)');
const RCL = await get('/api/map/layer?id=rc:10&i=0');
ok(RCL.json && RCL.json.ready && RCL.json.type === 'chance', '#11 the 10 mm chance is a map outlook layer');
const GL = await get('/api/glof/national?force=1');
ok(GL.json && GL.json.counts && GL.json.counts.Watch === 0 || (GL.json && Object.values(GL.json.units).filter(u => u.class === 'Watch').every(u => !/documented outburst/.test(JSON.stringify(u)))), 'L3 no GLOF Watch comes from the outburst record that labels the model');
const GLS = rd('../../server/api/glof.mjs');
ok(/const _sm = \(L\.sModel != null/.test(GLS) && /out\.history = \{ kind: 'recent-outburst'/.test(GLS), 'L3 the ladder reads the model S; outburst history is shown, not a precursor');
ok(/const PK_RIVER_REACHES = \/\*__RIVER_REACHES__\*\/null;/.test(B) && /g\.withheldWhy='the server refuses a return-period fit/.test(B), 'B one river threshold table: the browser takes the server\u2019s snapped cells and levels');
const ART = rd('../../artefact/AI_GEO_NIGRAAN_v91_17_MACH.html');
ok(/const PK_RIVER_REACHES = \{"tarbela":/.test(ART), 'B the river reaches are inlined in the built page');
ok(/riverine = hzClamp\(\(_base\+_tail\) \+ melt, 0, 100\);/.test(B), 'B river severity: no dry-ground discount and no HAND multiplier');
ok(/'Chenab @ Trimmu':\['Multan','Khanewal','Toba Tek Singh'\]/.test(B), 'B orphan riparian districts linked to a reach');
ok(/if\(suscClass!=null\)\{ slopeF=1; reliefF=1; \}/.test(B), 'C landslide slope counted once');
const REG = JSON.parse(rd('../../data/model-registry.json'));
ok(REG.models.length >= 12 && REG.models.every(m => m.clean === (m.findings.length === 0)), '#68 model registry present, every entry checked');
ok(REG.models.find(m => m.id === 'rain-chance').clean && REG.models.find(m => m.id === 'glof-ladder').clean && REG.models.find(m => m.id === 'landslide-threshold').clean, '#70 rain chance, GLOF ladder and landslide anchor pass the leakage checks');
const OPM = await get('/api/ops/models', CUST);
ok(OPM.status === 403, '#68 the registry is operator-only');

const MP = await get('/api/map/layer?id=month:p&i=0');
if (MP.json && MP.json.ready) ok(MP.json.confidence && MP.json.skill && /skill/.test(MP.json.source), 'N5 the season layer carries its skill gate (' + MP.json.confidence + ')'); else ok(true, 'seasonal run not stored - skipped');
const SS = await getB('/api/site/screening?lat=27.0&lon=67.5');
const par = (SS.json && SS.json.rows || []).map(r => r.parameter);
ok(par.includes('Rain chance (next days, calibrated)') && par.includes('Drought (last 30-90 days)') && par.includes('What happened here before'), '#98-105 site screening carries rain chances, drought and the event record', par.join(' | '));

/* Rainfall layer on forecast days reads the calibrated daily chances (rungs finding L6) */
ok(/window\.agnRainChance=\(function\(\)/.test(B) && /FR\('rainChance\.levels'\)/.test(B) && /rainChance: \{/.test(B), 'L6 the Rainfall layer reads calibrated daily chances on forecast days');
ok(REG.models.find(m => m.id === 'pluvial-rain-rungs').clean, 'L6 the hourly rain rungs no longer drive the forecast Rainfall layer');
const RCC = await get('/api/rain/chance', CUST);
ok(RCC.json && RCC.json.customerView && !/NASA|IMERG|GPM/.test(JSON.stringify(RCC.json)), 'customer view of rain chances names no supplier');

/* register findings closed or mitigated in the same release */
ok(/window\.agnGaugeOutlook=\(function\(\)/.test(B) && /FR\('gaugeOutlookCore'\)/.test(B) && /gaugeOutlook:_gOut/.test(B), 'river-ladder the measured gauge outlook sets the river pathway at a gauged reach (days it covers)');
const HS = rd('../../server/api/hand.mjs');
ok(/bandWeightsHeldOut/.test(HS) && /if \(r\.basis === 'observed-extent-2022'\) return/.test(HS), 'flood-hand-weights the held-out (2010 + 2014, tested 2025) weights are served; the observed-2022 basis is withdrawn');
ok(REG.models.find(m => m.id === 'flood-hand-weights').clean, 'flood-hand-weights passes the leakage checks');
ok(/uhiRanked\(\)/.test(rd('../../server/api/ai.mjs')) && /morphologyScaling/.test(rd('../../server/api/fleethistory.mjs')), 'urban-heat the within-city gap is a ranking of urban form until the fleet rank check passes');
ok(/summary\.forward = prevEnd/.test(rd('../../server/api/verification.mjs')), 'ens-bias each run forward-scores the previous corrections');

const FELL = await get('/api/map/layer?id=fell:day');
ok(FELL.json && (FELL.json.ready ? (FELL.json.type === 'levels' && FELL.json.classes.length === 5) : /satellite rain days/.test(FELL.json.why || '')), 'the rain that fell is an outlook layer on the regional daily categories (or says why it is empty)');
ok(JSON.parse(rd('../../data/hazard-scale.json')).rainClasses24h.value.length === 4 /* v283.27 item 3: the one home of the classes */ && /d\.type==='levels'/.test(rd('../../build/map_ui.html')), 'the rain-that-fell cuts are a data file with a source; the map reads level-named classes');
const FELLC = await get('/api/map/layer?id=rc:10&i=0', CUST);
ok(!/IMERG|NASA/.test(JSON.stringify(FELLC.json || {})), 'customer view of the chance layer names no supplier');

/* N1 · UTCI: one generated module, server and page */
const UT = await import('../../server/api/utci.mjs');
ok(UT.utci(25, 25, 1, 50) === 24.6 && UT.utci(40, 40, 1, 50) === 43.6 && UT.utci(60, 60, 1, 50) === null, 'N1 UTCI matches the reference polynomial (25/25/1/50 -> 24.6) and refuses outside its range');
ok(UT.utciClass(20) === 'No thermal stress' && UT.utciClass(47) === 'Extreme heat stress' && UT.UTCI_CLASSES.length === 10, 'N1 the ten UTCI classes come from data/utci.json');
ok(/agnUtci\(localTemp, localTemp, _v10, s\.hum\)/.test(B) && /\/\*__UTCI__\*\//.test(B) && /function agnUtci\(/.test(ART), 'N1 the page computes comfort from the inlined UTCI module');
ok(/utci_shade_c/.test(rd('../../server/api/ai.mjs')), 'N1 the analyst reads UTCI (shade and sun) for a place');

/* C1/N8 + C3 · vegetation health and canal-fed tehsils beside the rain-based drought index */
const VH = await get('/api/map/layer?id=veg:vhi&i=0');
ok(VH.json && (VH.json.ready ? (VH.json.type === 'levels' && Object.keys(VH.json.values).length >= 300) : /vegetation-health weeks/.test(VH.json.why || '')), 'C1 vegetation health is a weekly map layer on the Kogan classes', VH.json && (VH.json.ready ? Object.keys(VH.json.values).length + ' units' : VH.json.why));
const CFD = JSON.parse(rd('../../data/canal-fed.json'));
ok(CFD.counts.canalFed >= 150 && CFD.units['Punjab|Faisalabad|Faisalabad City'] !== undefined && CFD.cut === JSON.parse(rd('../../data/canal-fed-scale.json')).canalFedKmPer100Km2, 'C3 canal-fed tehsils tagged from the canal network, cut from a data file', JSON.stringify(CFD.counts));
const VU = await get('/api/vegetation/unit?unit=' + encodeURIComponent('Punjab|Bahawalpur|Bahawalpur'), CUST);
ok(VU.status === 200 && VU.json && VU.json.canal && !/NOAA|IWMI/.test(JSON.stringify(VU.json)), 'C1 the unit vegetation reading carries the canal tag and no supplier name');
const SS2 = await getB('/api/site/screening?lat=29.39&lon=71.68');
ok((SS2.json && SS2.json.rows || []).some(r => r.parameter === 'Vegetation health (satellite, weekly)'), 'C1 site screening reads vegetation health beside the drought row');

/* what we said vs what happened: operator-only */
const OV = await get('/api/ops/verify', CUST); const OV2 = await get('/api/ops/verify');
ok(OV.status === 403 && OV2.status === 200 && OV2.json && OV2.json.registry && OV2.json.registry.models.length >= 12, 'the issued-vs-observed report and the model register are served to the operator only');
ok(/id='agnTrkCard'|c\.id='agnTrkCard'/.test(ART) && /if\(!isOp\(\)\)\{ if\(c\) c\.remove\(\); return; \}/.test(ART), 'the track-record card is built only in operator mode');

/* dams upstream: a screening list from the dam inventory and the river network */
const DX = JSON.parse(rd('../../data/dam-exposure.json'));
ok(DX.counts.unitsBelowLarge >= 80 && DX.units['Khyber Pakhtunkhwa|Swabi|Topi'] && DX.units['Khyber Pakhtunkhwa|Swabi|Topi'].some(e => /Tarbela/.test(e.name)) && JSON.stringify(DX.reachKm) === JSON.stringify(JSON.parse(rd('../../data/dam-exposure-scale.json')).reachKm), 'dams: Tarbela reaches Topi downstream; the screening reach is a data file', JSON.stringify(DX.counts));
const SS3 = await getB('/api/site/screening?lat=34.07&lon=72.62');
ok((SS3.json && SS3.json.rows || []).some(r => r.parameter === 'Dams upstream (screening reach)' && /Tarbela/.test(r.values)), 'site screening lists the large dams upstream');

/* EHF's T95 from the climatology (95th percentile of daily mean temperature, all days of the normal period) */
const TH = await get('/api/climatology/thresholds');
const nTm = TH.json && TH.json.thresholds ? Object.values(TH.json.thresholds).filter(t => t.tm95 != null).length : 0;
ok(nTm >= 500 && /_t95c = \(inp\.tm95Clim!=null/.test(B) && /D\[k\]\.tm95Clim=t\.tm95/.test(B), 'A heat: EHF reads a climatological T95 (tm95) for ' + nTm + ' units');

/* 1 Oct review: the river ladder, the station height rule, the left comfort tile */
const RLS = JSON.parse(rd('../../data/river-level-scale.json'));
/* v91.17.113 · superseded by the rung evidence: below the 5-year flow is Normal, the 5-year flow Moderate */ ok(RLS.knots.find(k => k[0] === 'p95')[1] < 0.25 && RLS.knots.find(k => k[0] === 'rp2')[1] < 0.25 && RLS.knots.find(k => k[0] === 'rp5')[1] >= 0.45 && /AGN_RIVER_LEVEL_SCALE = \{/.test(ART) && /var k=_RLS\.knots\.map/.test(B), 'river: flow under the 5-year model flow is Normal, the 5-year flow Moderate (data file, inlined)');
for (let w = 0; w < 24; w++) { const FS = await get('/api/fleet/status'); if (FS.json && FS.json.polls >= 1 && FS.json.usable > 0) break; await new Promise(r => setTimeout(r, 5000)); }   /* the fleet answers after its first poll */
const NP = await getB('/api/fleet/nearest?lat=33.78411&lon=73.10997&km=15');
ok(NP.json && NP.json.station === null && NP.json.skippedWhy && NP.json.skippedWhy.pointElevM > 1000, 'Pir Sohawa (1,228 m) is not read off a MACH station 600 m lower', JSON.stringify(NP.json && NP.json.skippedWhy).slice(0, 160));
const NI = await getB('/api/fleet/nearest?lat=33.6938&lon=73.0652&km=15');
ok(NI.json && NI.json.station && Math.abs(NI.json.station.stationElevM - NI.json.station.pointElevM) <= 150, 'Islamabad still reads its MACH station (within 150 m of height)');
ok(/data-agn-utci="1"/.test(ART) && /Thermal stress \(UTCI\) \\u00b7 '\+_uHead\+'/.test(B) && /hottest hour'\+\(_uHm/.test(B), 'the left card comfort tile is UTCI at the hour it names (the hottest hour of the day, or the present hour)');

console.log((fails ? 'FAIL' : 'PASS') + ' v101: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
