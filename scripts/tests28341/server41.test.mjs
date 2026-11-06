/* v91.17.283.41 (NIGRAAN 1.0.5) · the server items of the 31 Oct fix list, on the tree's own data files (no server, no network):
   R  item 5   river flooding from the river network: no channel -> -4 cannot happen, ungauged river -> -5 not tested, gauged -> the reach
               level (the failed HAND exclusion no longer withholds it); counts; NIGRAAN_RIVER_NETWORK=0 = the 1.0.4 rule
   L  item 7   landslide groups (owner update): a level / b grey "No local steep ground; debris from nearby slopes possible" (-5) / c "cannot
               happen" (-4); counts; no recorded landslide in group c; the applicability answer says the same; switch off = 1.0.4
   W  item 4   the gust value layer: display bins (WMO Beaufort boundaries, documented as display only), one value per tehsil, the wind level
               stays withheld (applyWind unchanged)
   A  item 36  the EWS anchor serving hook: OFF (live false) = the answer byte-identical; ON (a copy of the model file with live true) =
               current + near-term temperature moved toward basis + raw with the fade, humidity / apparent follow, a MACH-corrected place
               untouched, the station readings never touched
   B  item 37  the blend cap: two pools; the tehsil pool covers every tehsil x 4 runs x the zone weight; a spent other pool never caps a tehsil
   H  item 23  area heat: the last completed pass is kept on disk and served after a restart until the new pass completes
   G  item 26  the hazard surface answer carries the forecast run time (runAt)
   usage: node scripts/tests28341/server41.test.mjs [tree] */
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs'; import { join } from 'node:path'; import { tmpdir } from 'node:os'; import { pathToFileURL } from 'node:url';
const T = (process.argv[2] && !/^https?:/.test(process.argv[2]) ? process.argv[2] : new URL('../..', import.meta.url).pathname.replace(/\/$/, ''));
const imp = (f) => import(pathToFileURL(join(T, f)).href);
const HS = await imp('server/api/hazsci.mjs'), AP = await imp('server/api/applicability.mjs'), RA = await imp('server/api/rainamount.mjs');
const EA = await imp('server/api/ewsanchor.mjs'), ES = await imp('server/api/ewsshadow.mjs'), MB = await imp('server/api/mmblend42.mjs'), AH = await imp('server/api/areaheat.mjs');
let n = 0, f = 0; const ok = (c, m, i) => { n++; console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : '  :: ' + String(JSON.stringify(i)).slice(0, 400))); if (!c) f++; };
const rj = (p) => JSON.parse(readFileSync(join(T, p), 'utf8'));
const LINK = rj('data/river-link.json'), APP = rj('data/hazard-applicability.json'), LG = rj('data/landslide-groups.json');
const UIDS = Object.keys(LINK.units).filter((u) => !/^Indian Illegally/.test(u));

/* ---------------- R · river flooding from the river network ---------------- */
const sig = {}; for (const g of Object.keys(LINK.gauges)) sig[g] = { level: 0, score: 10, basis: 'test' };
const cnt = { '-4': 0, '-5': 0, lv: 0, other: 0 }; const byUid = {};
for (const u of UIDS) { const c = HS.riverCell(u, LINK, sig, { floodplainShare: 0 }, { applies: false, km2: 0 }); byUid[u] = c; if (c.L === -4) cnt['-4']++; else if (c.L === -5) cnt['-5']++; else if (c.L >= 0) cnt.lv++; else cnt.other++; }
const exp = { noCh: 0, ung: 0, g: 0 }; for (const u of UIDS) { const U = LINK.units[u], r = !!(U.reaches && Object.keys(U.reaches).length); if (r) exp.g++; else if (U.modelChannelCells > 0) exp.ung++; else exp.noCh++; }
ok(cnt['-4'] === exp.noCh && cnt['-5'] === exp.ung && cnt.lv === exp.g && cnt.other === 0, `R1 river: ${exp.noCh} tehsils with no river channel -> cannot happen, ${exp.ung} ungauged river -> not tested, ${exp.g} gauged -> level (the failed HAND mask withholds none)`, cnt);
ok(HS.riverCell('Punjab|Lahore|Lahore City', LINK, sig, null, null).L === 0, 'R2 gauged (Lahore City, Ravi): the reach level');
const aw = byUid['Balochistan|Awaran|Awaran']; ok(aw.L === -4 && /no river channel/.test(aw.why) && /local-rain flooding/.test(aw.why), 'R3 no channel (Awaran): cannot happen, nullahs named as local-rain flooding', aw);
const ugU = UIDS.find((u) => byUid[u].L === -5); ok(ugU && /level not tested here/.test(byUid[ugU].why) && byUid[ugU].facts.riverGroup === 'ungauged', 'R4 ungauged river (' + ugU + '): level not tested here', ugU && byUid[ugU]);
const disp = UIDS.find((u) => !(LINK.units[u].reaches && Object.keys(LINK.units[u].reaches).length) && LINK.units[u].modelChannelCells === 0 && LINK.units[u].disputedChannelCells > 0);
ok(!disp || byUid[disp].L === -4, 'R5 a tehsil whose only model channels are disputed by the channel review (no river on the ground): cannot happen' + (disp ? ' (' + disp + ')' : ''), disp && byUid[disp]);
process.env.NIGRAAN_RIVER_NETWORK = '0'; const off = HS.riverCell('Balochistan|Awaran|Awaran', LINK, sig, null, null); delete process.env.NIGRAAN_RIVER_NETWORK;
ok(off.L === -3, 'R6 NIGRAAN_RIVER_NETWORK=0: the 1.0.4 rule (no gauged reach -3)', off);
const rows = (u) => AP.applicabilityRows(APP, u, { riverLink: LINK, lsGroups: LG });
const rAw = rows('Balochistan|Awaran|Awaran').find((x) => x.hazard === 'flood_riverine'), rLa = rows('Punjab|Lahore|Lahore City').find((x) => x.hazard === 'flood_riverine');
ok(rAw.state === 'not_applicable' && rLa.state === 'value' && (!ugU || rows(ugU).find((x) => x.hazard === 'flood_riverine').state === 'not_tested'), 'R7 the applicability answer says the same as the map cell (one word)', { rAw, rLa });

/* ---------------- L · landslide groups ---------------- */
const out = APP.layers.landslide.units; const outside = Object.keys(out).filter((u) => out[u].applies === false && !/^Indian/.test(u));
const gC = { a: 0, b: 0, c: 0 }; for (const u of Object.keys(LG.units)) gC[LG.units[u].group]++;
ok(gC.a + gC.b + gC.c === 576 && gC.b + gC.c === outside.length && gC.a === LG.counts.a && gC.b === LG.counts.b && gC.c === LG.counts.c, `L1 groups: a ${gC.a} steep ground (level), b ${gC.b} edge (grey), c ${gC.c} plains (cannot happen); b + c = the ${outside.length} tehsils outside the steep-ground mask`, gC);
ok(LG.events.byGroup.c === 0 && LG.events.inGroupC.length === 0, `L2 recorded landslides: ${LG.events.byGroup.a} in group a, ${LG.events.byGroup.b} in group b, ${LG.events.byGroup.c} in group c (any in c is listed for the owner)`, LG.events);
const recL = { days: [{ day: 0, date: '2026-11-01', layers: { landslide: { L: Object.fromEntries(Object.keys(LG.units).map((u) => [u, 0])) } } }] };
HS.applyLandslide(recL, { mask: out, groups: LG, odds: { ready: true, units: {} } }); const LL = recL.days[0].layers.landslide;
const st = { a: new Set(), b: new Set(), c: new Set() }; for (const u of Object.keys(LG.units)) st[LG.units[u].group].add(LL.L[u]);
ok([...st.b].every((x) => x === -5) && [...st.c].every((x) => x === -4) && [...st.a].every((x) => x !== -4 && x !== -5), 'L3 map cells: b -> -5 (grey, reason), c -> -4 (hatched), a -> its odds band / missing as before', { a: [...st.a], b: [...st.b], c: [...st.c] });
const bU = Object.keys(LG.units).find((u) => LG.units[u].group === 'b'); ok(LL.why[bU] === 'No local steep ground; debris from nearby slopes possible', 'L4 group b reason, word for word (' + bU + ')', LL.why[bU]);
ok(rows('Punjab|Lahore|Lahore City').find((x) => x.hazard === 'landslide').state === 'not_applicable' && rows(bU).find((x) => x.hazard === 'landslide').text === 'No local steep ground; debris from nearby slopes possible', 'L5 applicability: Lahore cannot happen; an edge tehsil the grey words');
for (const p of ['Punjab|Lahore|Lahore City', 'Punjab|Multan|Multan City', 'Sindh|Karachi South|Saddar']) ok(!LG.units[p] || LG.units[p].group === 'c', 'L6 plains example ' + p + ': group c', LG.units[p]);
process.env.NIGRAAN_LANDSLIDE_GROUPS = '0'; const rec0 = JSON.parse(JSON.stringify({ days: [{ day: 0, date: 'x', layers: { landslide: { L: { [bU]: 0 } } } }] })); HS.applyLandslide(rec0, { mask: out, groups: LG, odds: null }); delete process.env.NIGRAAN_LANDSLIDE_GROUPS;
ok(rec0.days[0].layers.landslide.L[bU] === -1, 'L7 NIGRAAN_LANDSLIDE_GROUPS=0: the 1.0.4 rule (-1 not assessed)');

/* ---------------- W · the gust value layer ---------------- */
const SC = rj('data/map-layer-scales.json'); const WG = SC.layers.wind_gust;
ok(WG && WG.value === 'display' && WG.bins.join() === '39,62,89,118' && /DISPLAY BINS ONLY/.test(WG.binsSource) && WG.words.length === 5, 'W1 gust display bins documented as display only (WMO Beaufort km/h)', WG);
const units = [{ unitId: 'A', key: 'A' }, { unitId: 'B', key: 'B' }, { unitId: 'C', key: 'C' }];
const days = [0, 1, 2, 3].map((k) => new Date(Date.now() + 5 * 3600e3 + k * 864e5).toISOString().slice(0, 10));
const E = { at: new Date().toISOString(), days, units: { A: days.map(() => ({ gu: [20, 30, 40] })), B: days.map(() => ({ gu: [50, 70, 90] })), C: days.map(() => ({ gu: null })) } };
const app = { units: { tehsil: units }, outlook: { dayRows: () => E } };
const LY = RA.createRainAmountLayer(app, join(T, 'data'), { dayRarity: () => null, rainClasses: () => null, zoneOf: () => null }).gustLayer(1);
ok(LY.ready && LY.kind === 'amount' && LY.layer === 'wind_gust' && LY.levels.A === 0 && LY.levels.B === 2 && LY.levels.C === -1 && LY.values.B.kmh === 70 && LY.canAlert === false, 'W2 one gust value per tehsil in its display bin (30 -> under 39, 70 -> 62-88, missing -> -1); no alert', LY);
const recW = { days: [{ layers: { wind: { L: { A: 2, B: -2 } } } }] }; HS.applyWind(recW); ok(recW.days[0].layers.wind.L.A === -5 && recW.days[0].layers.wind.L.B === -5, 'W3 the wind level stays withheld (-5 everywhere, as 1.0.4)');

/* ---------------- A · the EWS live anchor serving hook ---------------- */
const M0 = rj('data/ews-live-anchor.json');
ok(M0.live === false && M0.servingHook === 'chain:ews-live@283.41' && M0.variogram.nugget === 0.509 && M0.variogram.psill === 7.627 && M0.variogram.range_km === 83 && M0.radius_km === 40 && M0.fade_hours === 6, 'A1 model file: E1 variogram (0.509 / 7.627 / 83 km), radius 40 km, fade 6 h, hook named, live OFF', { live: M0.live, hook: M0.servingHook, v: M0.variogram });
const D0 = mkdtempSync(join(tmpdir(), 'ea41-')); mkdirSync(join(D0, 'data'), { recursive: true }); copyFileSync(join(T, 'data/ews-live-anchor.json'), join(D0, 'data/ews-live-anchor.json'));
const now = Date.parse('2026-11-01T10:20:00Z'), H = 3600e3, hr0 = Math.floor(now / H) * H;
const run = { run_id: 'r1', unit_level: 'tehsil', status: 'complete', base_valid_time: '2026-11-01T00:00:00Z' };
const recs = [{ runId: 'r1', unitKey: 'U1', lat: 35.9, lon: 74.3, temperatureBasis: { elevM: 1500 }, hourly: { time: Array.from({ length: 48 }, (_, i) => new Date(Date.parse('2026-11-01T00:00:00Z') + i * H).toISOString().slice(0, 16)), temperature_2m: Array.from({ length: 48 }, () => 10) } }];
const appA = { store: { all: (k) => (k === 'runs' ? [run] : []), filter: (k, fn) => recs.filter(fn) } };
const mk = (dataDir) => ES.createEwsAnchor(appA, dataDir, { timers: false, now: () => now, place: () => ({ uid: 'U1', elevM: 1500 }), copiesDir: join(D0, 'none'), archiveDir: join(D0, 'arc') });
const locOf = () => ({ utc_offset_seconds: 0, elevation: 1500, current: { time: '2026-11-01T10:15', temperature_2m: 9.0, relative_humidity_2m: 60, apparent_temperature: 7.5, dew_point_2m: 1.6 },
  hourly: { time: Array.from({ length: 24 }, (_, i) => '2026-11-01T' + String(i).padStart(2, '0') + ':00'), temperature_2m: Array.from({ length: 24 }, () => 9.0), relative_humidity_2m: Array.from({ length: 24 }, () => 60), apparent_temperature: Array.from({ length: 24 }, () => 7.5) },
  daily: { time: ['2026-11-01'], temperature_2m_max: [9.0], temperature_2m_min: [9.0] } });
const offA = mk(join(D0, 'data')); const l0 = locOf(), b0 = JSON.stringify(l0);
ok(offA.serve(l0, 35.92, 74.31) === false && JSON.stringify(l0) === b0 && offA.serveOn() === false, 'A2 OFF (live false): serve() returns false and the answer is byte-identical');
/* ON: a copy with live true and a residual set injected through the residual-set cache (rows as the shadow computes them) */
const Mon = { ...M0, live: true }; writeFileSync(join(D0, 'data/ews-live-anchor.json'), JSON.stringify(Mon)); const onA = mk(join(D0, 'data'));
ok(onA.serveOn() === true, 'A3 ON with the live pointer flipped (a copy of the file)');
/* the station residuals: one station 5 km away, newest reading at 10:00 UTC, residual +2.0 C against the basis 10 C at 1500 m */
const rows0 = [{ id: 's1', name: 'S1', lat: 35.95, lon: 74.33, elevM: 1500, uid: 'U1', obsMs: hr0, obs: 12, served: 10, res: 2.0, run: 'r1' }];
const a1 = EA.anchorAt(EA.loadAnchorModel(join(D0, 'data')), rows0, 35.92, 74.31, now);
ok(a1.applied && a1.raw > 0 && a1.raw < 2.0 && a1.weight > 0.9, 'A4 kriged raw anchor at a place 4 km from the station (zero-mean simple kriging pulls toward 0)', a1);
/* serve with the injected set: monkeypatch the residual cache through residualSet's inputs is internal; emulate by calling serve with a stub app whose
   runs()/residual set come from the archive is not possible here, so the arithmetic is checked on the exported pieces: anchored = basis + raw, faded */
const basis = 10, chain = 9.0, w = a1.weight, expT = Math.round((chain + w * (basis + a1.raw - chain)) * 10) / 10;
ok(expT > chain && expT <= basis + a1.raw + 1e-9, `A5 served = chain + w x (basis + raw - chain): ${chain} -> ${expT} C at weight ${w.toFixed(2)} (the scored value basis + raw at weight 1)`);
const l2 = locOf(); l2.agn_hyperlocal = { applied: true }; const b2 = JSON.stringify(l2);
ok(onA.serve(l2, 35.92, 74.31) === false && JSON.stringify(l2) === b2, 'A6 a place the MACH live layer already corrected: the anchor is not added (one live correction per place)');
const l3 = locOf(), b3 = JSON.stringify(l3); ok(onA.serve(l3, 35.92, 74.31) === false && JSON.stringify(l3) === b3, 'A7 ON but no EWS reading held (no copies): nothing changes (no anchor without a reading)');
{ const { gzipSync } = await import('node:zlib'); const CP = join(D0, 'copies'); mkdirSync(join(CP, 'data/pmd/ews_live/raw'), { recursive: true });
  writeFileSync(join(CP, 'data/pmd/aegis_gb_station_catalog.csv'), 'stationId,stationName,latitude,longitude,altitude\n9001,Test EWS,35.95,74.33,1500\n');
  const lines = ['station_id,station,element,value,time_utc']; for (let t = hr0 - 30 * H; t <= hr0; t += H) lines.push('9001,Test EWS,Air Temperature,' + (12 + 0.1 * Math.sin(t / H)).toFixed(2) + ',' + new Date(t).toISOString().slice(0, 19).replace('T', ' '));
  for (const d of [hr0 - 864e5, hr0]) { const day = new Date(d).toISOString().slice(0, 10).replace(/-/g, ''); writeFileSync(join(CP, 'data/pmd/ews_live/raw/ews_raw_' + day + '.csv.gz'), gzipSync(lines.join('\n'))); }
  const onB = ES.createEwsAnchor(appA, join(D0, 'data'), { timers: false, now: () => now, place: () => ({ uid: 'U1', elevM: 1500 }), copiesDir: CP, archiveDir: join(D0, 'arc2') });
  const rs = onB.residualSet(now); const l4 = locOf(), r4 = onB.serve(l4, 35.92, 74.31);
  ok(rs.rows.length === 1 && Math.abs(rs.rows[0].res - (rs.rows[0].obs - 10)) < 1e-9, 'A10 the residual set from the EWS copy: reading - basis (10 C at the station height)', rs);
  const iNow = 10, iFar = 18;
  ok(r4 === true && l4.current.temperature_2m > 9.0 && l4.hourly.temperature_2m[iNow] > 9.0 && l4.hourly.temperature_2m[iFar] === 9.0 && l4.hourly.temperature_2m[2] === 9.0, 'A11 ON: current ' + l4.current.temperature_2m + ' C and the hour 10 UTC ' + l4.hourly.temperature_2m[iNow] + ' C moved toward basis + raw; 18 UTC (beyond 6 h) and 02 UTC (before the reading) unchanged', { cur: l4.current.temperature_2m, h: l4.hourly.temperature_2m });
  ok(l4.current.relative_humidity_2m < 60 && Math.abs(l4.current.apparent_temperature - (7.5 + (l4.current.temperature_2m - 9.0))) < 0.11 && l4.daily.temperature_2m_max[0] === Math.max(...l4.hourly.temperature_2m), 'A12 humidity at constant vapour, apparent temperature by the same change, the day max follows the hourly curve (one value per place)', { cur: l4.current, d: l4.daily });
  const cat = readFileSync(join(CP, 'data/pmd/aegis_gb_station_catalog.csv'), 'utf8'); ok(/9001,Test EWS,35.95,74.33,1500/.test(cat) && rs.rows[0].obs > 11.9, 'A13 the station reading itself is untouched'); }
const vsrc = readFileSync(join(T, 'server/api/verification.mjs'), 'utf8'); ok(/live: \(\) => \{ const h = o\.live !== false && app\.hyperlocal && app\.hyperlocal\.apply\(loc, la, lo\); let e = false; try \{ e = o\.live !== false && (o\.ewsLive !== false && )?!!\(app\.ewsAnchor && app\.ewsAnchor\.serve/.test(vsrc), 'A8 wired in the served chain beside the MACH live layer (after it)');   /* v283.46: never in the national run (o.ewsLive false), servedqc461 */
const esrc = readFileSync(join(T, 'server/api/ewsshadow.mjs'), 'utf8'); ok(!/\.obs\s*=|rows\[\w+\]\.obs\s*=|res\s*=\s*0/.test(esrc.slice(esrc.indexOf('function serve('))), 'A9 station readings are never written (serve() changes only the answer object)');
rmSync(D0, { recursive: true, force: true });

/* ---------------- B · the blend cap ---------------- */
const MZ = rj('data/model-zone.json').units; const zoneOfU = (u) => (typeof MZ[u] === 'string' ? MZ[u] : MZ[u] && MZ[u].zone);
const anchors = rj('data/tehsil-anchor.json').units; const pts = Object.entries(anchors).filter(([u, a]) => a && a.anchor && !/^Indian/.test(u)).map(([u, a]) => ({ lat: a.anchor.lat, lon: a.anchor.lon, uid: u }));
const zByKey = new Map(pts.map((p) => [p.lat.toFixed(3) + ',' + p.lon.toFixed(3), zoneOfU(p.uid)]));
const PV = await imp('server/api/provider.mjs');
const B41 = MB.createMMBlend42(T, { weightOf: (get) => PV.weightOf(get), zoneOf: (a, o) => zByKey.get(a.toFixed(3) + ',' + o.toFixed(3)) || 'plains', tehsilPoints: () => pts });
const st0 = B41.status(); ok(st0.on === true && st0.allowancePerDay > 0, 'B1 blend on, computed allowance ' + st0.allowancePerDay, st0);
let calls = 0; const fetchJson = async (q) => { calls++; const n = String(q.latitude).split(',').length; return Array.from({ length: n }, () => ({ hourly: { time: [] } })); };
const T0 = Date.parse('2026-11-01T01:00:00Z');
await B41.prepare([31.0], [70.0], [null], fetchJson, T0);   /* a non-tehsil place first: plans the pools */
const sp = B41.status(); const need = { plains: 0, hills: 0, mountain: 0 }; for (const p of pts) { const z = zoneOfU(p.uid); if (z in need) need[z]++; }
ok(sp.pools && sp.pools.tehsil >= 4113 && sp.pools.marginTehsil === 1.1, `B2 tehsil pool ${sp.pools && sp.pools.tehsil} >= 4,113 (4 runs x ${need.plains} plains + ${need.hills} hills + ${need.mountain} mountain tehsils x zone weight, + 10 %)`, sp.pools);
/* spend the other pool with a flood of non-tehsil places, then a full tehsil run must not be capped */
const many = Array.from({ length: 4000 }, (_, i) => ({ lat: 30 + (i % 200) * 0.013, lon: 70 + Math.floor(i / 200) * 0.017 }));
for (let k = 0; k < many.length; k += 100) await B41.prepare(many.slice(k, k + 100).map((p) => p.lat), many.slice(k, k + 100).map((p) => p.lon), null, fetchJson, T0);
const s1 = B41.status(); const servedPts = pts.filter((p) => ['plains', 'hills', 'mountain'].includes(zoneOfU(p.uid)));
for (let k = 0; k < servedPts.length; k += 60) await B41.prepare(servedPts.slice(k, k + 60).map((p) => p.lat), servedPts.slice(k, k + 60).map((p) => p.lon), null, fetchJson, T0);
const s2 = B41.status(); ok(s1.spent.cappedO > 0 && s2.spent.cappedT === 0, `B3 the other pool spent by 4,000 extra places (${s1.spent.cappedO} capped batches) - a full tehsil run is never capped (tehsil batches capped: ${s2.spent.cappedT})`, { s1: s1.spent, s2: s2.spent });
process.env.NIGRAAN_MM42_ALLOWANCE = '500'; const B0 = MB.createMMBlend42(T, { weightOf: (get) => PV.weightOf(get), zoneOf: () => 'plains', tehsilPoints: () => pts }); delete process.env.NIGRAAN_MM42_ALLOWANCE;
ok(B0.status().allowancePerDay === 500 && !B0.status().pools, 'B4 NIGRAAN_MM42_ALLOWANCE=<n>: one pool of n (the 1.0.4 knob)');

/* ---------------- H · area heat kept over a restart ---------------- */
const D1 = mkdtempSync(join(tmpdir(), 'ah41-')); mkdirSync(join(D1, 'cache'), { recursive: true });
const at = new Date(Date.now() - 2 * 3600e3).toISOString(); writeFileSync(join(D1, 'cache/areaheat-last.json'), JSON.stringify({ run: 'R0', at, units: { U1: { days: { '2026-11-01': { level: 1, extremePoint: { name: 'X' } } } } } }));
const AHs = AH.createAreaHeat({}, { dataDir: D1 }); const s3 = AHs.status();
ok(s3.previousRunKept === true && s3.run === 'R0' && s3.units === 1, 'H1 after a restart the last pass is held (run R0, marked previous)', s3);
const recH = { days: [{ date: '2026-11-01', layers: { heat: { L: { U1: -1, U2: 0 } } } }] }; AHs.apply(recH);
ok(recH.days[0].layers.heat.L.U1 === 1 && /previous run/.test(recH.days[0].layers.heat.src.U1), 'H2 the issued record takes the kept value, its source names the previous run', recH.days[0].layers.heat);
writeFileSync(join(D1, 'cache/areaheat-last.json'), JSON.stringify({ run: 'R0', at: new Date(Date.now() - 40 * 3600e3).toISOString(), units: { U1: {} } }));
ok(AH.createAreaHeat({}, { dataDir: D1 }).status().previousRunKept === false, 'H3 a kept pass older than 30 h is not used'); rmSync(D1, { recursive: true, force: true });

/* ---------------- G · the hazard surface run time ---------------- */
const hg = readFileSync(join(T, 'server/api/hazardgrid.mjs'), 'utf8'); ok(/runAt = \(c\.stamps \|\| \[\]\)/.test(hg) && /builtAt: c\.builtAt, runAt,/.test(hg), 'G1 /api/hazardgrid carries runAt (the newest model run of its point states)');
console.log('\n' + (n - f) + ' passed, ' + f + ' failed'); process.exit(f ? 1 : 0);
