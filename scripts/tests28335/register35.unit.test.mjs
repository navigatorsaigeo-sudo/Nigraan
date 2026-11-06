/* v91.17.283.36: six checks updated to the NIGRAAN 1.0 behaviour (A3, B2, B6, B7, C6, L5: intended changes of the launch list).
   v91.17.283.35 · ONE REGRESSION CHECK PER DEFECT of the 30 Oct 2026 audit (register A1-A5, A4b, B1-B8, C1-C6, D1-D6; live findings L1-L9;
   owner items 1-13). Each check fails on v91.17.283.34 and passes on v91.17.283.35.
   usage: node scripts/tests28335/register35.unit.test.mjs [tree]      (tree: the build to test; default this one)
   No server, no network: the server modules are imported from the tree, the page is read from its artefact. */
import { readFileSync, existsSync } from 'node:fs'; import { join, dirname } from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
const ROOT = (process.argv[2] && !/^https?:/.test(process.argv[2]) ? process.argv[2] : null) || process.env.NIGRAAN_TREE || join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let n = 0, f = 0; const ok = (c, m, i) => { n++; console.log((c ? 'PASS ' : 'FAIL ') + m + (c || i === undefined ? '' : '  :: ' + JSON.stringify(i).slice(0, 400))); if (!c) f++; };
const imp = async (rel) => { try { return await import(pathToFileURL(join(ROOT, rel)).href); } catch (e) { return { __err: String(e && e.message || e) }; } };
const safe = (fn) => { try { return fn(); } catch (e) { return { __err: String(e && e.message || e) }; } };
const read = (rel) => { try { return readFileSync(join(ROOT, rel), 'utf8'); } catch (_) { return ''; } };
const HTML = read('artefact/AI_GEO_NIGRAAN_v91_17_MACH.html'), N3 = read('artefact/NIGRAAN_3.html');
const HZ = await imp('server/api/hazsci.mjs'), SV = await imp('server/api/served.mjs'), RP = await imp('server/api/report.mjs');
const UL = await imp('server/api/utcilevel.mjs'), SC = await imp('server/api/scalecuts.mjs'), AH = await imp('server/api/areaheat.mjs');
const RL = await imp('server/api/reflayers.mjs'), SM = await imp('server/api/smog.mjs'), HI = await imp('server/api/heatindex.mjs');
const CF = await imp('server/api/comfort.mjs'), LO = await imp('server/api/landslideodds.mjs'), SCH = await imp('server/api/sitechange.mjs');
const ST = await imp('server/api/states.mjs'), AP = await imp('server/api/applicability.mjs');
const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10), dayOff = (k) => new Date(Date.parse(today + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);
const jsonOf = (rel) => { try { return JSON.parse(read(rel)); } catch (_) { return null; } };
/* a page function, evaluated on its own from the artefact */
function pageFn(name, extra = '') { const i = HTML.indexOf('function ' + name + '('); if (i < 0) return null; let d = 0, j = HTML.indexOf('{', i);
  for (let k = j; k < HTML.length; k++) { if (HTML[k] === '{') d++; else if (HTML[k] === '}') { d--; if (!d) { j = k + 1; break; } } }
  const ctx = { Math, isFinite, Number, clamp: (v, a, b) => Math.max(a, Math.min(b, v)) }; vm.createContext(ctx); vm.runInContext(extra + HTML.slice(i, j) + '; this.__f=' + name + ';', ctx); return ctx.__f; }
const constOf = (name) => { const m = new RegExp('const ' + name + ' = (\\{[^;]*\\});').exec(HTML); return m ? JSON.parse(m[1]) : null; };

/* ---------- A1 · river: an official measured class is the level, never multiplied by the HAND factor ---------- */
{ const link = { units: { U1: { reaches: { g1: { river: 'Indus' } } } } };
  const sig = safe(() => HZ.reachSignal('g1', today, { gauges: { g1: { lastReading: today, cls: 4, current: true } }, dayView: null }));
  const c = safe(() => HZ.riverCell('U1', link, { g1: sig }, { floodplainShare: 0.05, factor: 0.335 }));
  ok(c && c.L === 4, 'A1 a measured Very High class with a floodplain factor of 0.3 is Severe (was Low: 88 x 0.3 = 26.4)', c);
  const c2 = safe(() => HZ.riverCell('U1', link, { g1: safe(() => HZ.reachSignal('g1', today, { gauges: { g1: { lastReading: today, cls: 2, current: true } } })) }, { floodplainShare: 0.4, factor: 0.8 }));
  ok(c2 && c2.L === 2 && c2.facts && /% of the tehsil/.test(String(c2.facts.floodplainText || '')) && c2.facts.handFactor === undefined, 'A1 Medium -> Moderate unreduced; the floodplain share is a separate fact, no factor', c2 && { L: c2.L, facts: c2.facts }); }
/* ---------- A2 · river status of the place record = the issued cell (floodplain rule included) ---------- */
{ const day = (lv, why) => ({ day: 0, date: today, layers: { flood_riverine: { name: 'River flooding', level: lv, ...(why ? { why } : {}) } } });
  const app = { engine: { unit: () => ({ ready: true, unit: 'U1', words: ['Normal', 'Low', 'Moderate', 'High', 'Severe'], days: [day(-4, 'cannot happen here: off the floodplain')], alerts: [] }) },
    hazSci: { riverLink: () => ({ ready: true, reaches: { g1: { river: 'Indus' } }, offFloodplain: true }) }, riverSheet: { measuredFor: () => ({ level: 3, ageDays: 0, date: today, station: 'S', status: 'HIGH' }) },
    gate: { full: () => ({ ready: true, client_rules: { hidden_layers: {}, substitute: {} } }), entryOf: () => null, tagOf: () => ({ productType: null }) } };
  const r = safe(() => SV.riverStatus(app, 'U1'));
  ok(r && r.days && r.days[0] && r.days[0].assessed === false && r.days[0].state === 'not_applicable', 'A2 an off-floodplain tehsil is "cannot happen here" in the place record too (the sheet does not override the issued cell)', r && r.days); }
/* ---------- A3 · no all-clear without an assessment ---------- */
{ const L = { ready: true, days: [{ day: 0, date: today, layers: { heat: { name: 'Heat stress', word: 'Not assessed', notAssessedWhy: 'no point state' }, rain_hz: { name: 'Heavy rain', word: 'Not assessed' }, flood: { name: 'Flood', word: 'Not assessed' }, landslide: { name: 'Landslide', word: 'Not assessed' } } }] };
  const h = safe(() => RP.hazardListOf(L));
  ok(h && h.none == null && Array.isArray(h.notAssessed) && h.notAssessed.length === 4, 'A3 every layer not assessed: no "No hazard at this site", the layers listed with reasons', h);
  const h2 = safe(() => RP.hazardListOf({ ready: true, days: [{ day: 0, date: today, layers: { heat: { name: 'Heat stress', word: 'Low' }, wind: { name: 'Wind', word: 'Normal' }, rain_hz: { name: 'Heavy rain', word: 'Not assessed', notAssessedWhy: 'x' } } }] }));
  ok(h2 && h2.none == null && /not assessed: Heavy rain/.test(String(h2.partial || '')), 'A3 partly assessed: "no hazard reached Moderate among the assessed; not assessed: ..."', h2);
  const h3 = safe(() => RP.hazardListOf({ ready: true, days: [{ day: 0, date: today, layers: { heat: { name: 'Heat stress', word: 'Low' }, wind: { name: 'Wind', word: 'Normal' } } }] }));
  ok(h3 && h3.none === 'Every daily hazard was assessed; none reached Moderate in the period', 'A3 every layer assessed below Moderate: the all-assessed line (v283.36 item 23: no "no hazard" wording)', h3); }
/* ---------- A4 / L1 · no demo values in the page ---------- */
{ const m = /const DISTRICT_IN = (\{.*?\});/.exec(HTML); let rows = null; try { rows = JSON.parse(m[1]); } catch (_) {}
  const nums = rows ? Object.values(rows).filter((r) => Object.keys(r || {}).length).length : -1;
  ok(rows && Object.keys(rows).length > 500 && nums === 0, 'A4 / L1 DISTRICT_IN ships keys only (no seed t / hum / aqi / pm25 / uv)', { rows: rows ? Object.keys(rows).length : null, withValues: nums });
  ok(/if\(v&&v\.aqiLive===true&&v\.aqi!=null\) rows\[name\]=/.test(HTML), 'A4 the AQI cache stores live (server) values only');
  const dcbn = HTML.slice(HTML.indexOf('function districtComfortByName('), HTML.indexOf('function districtComfortByName(') + 400);
  ok(/AGN\.comfort35/.test(dcbn) && !/stationComfort/.test(dcbn), 'A4 / L9 the comfort map value is the server’s (AGN.comfort35), not a page calculation on the input rows'); }
/* ---------- A4b · STATIONS seeds and the hill-torrent reader ---------- */
ok(/\['t','feels','hum','wind','gust','rain','uv','aqi','pm25','sev','alert'\]\.forEach/.test(HTML), 'A4b the STATIONS seed values sev and alert are nulled too');
ok(/if\(r && !\(r\.weatherLive\|\|r\.nationalLive\|\|r\.forecastLive\)\) continue;/.test(HTML), 'A4b AGN.hillTorrent reads live rows only');
/* ---------- A5 · one UTCI level scale: page = server, no engine fallback ---------- */
{ const HM = constOf('AGN_UTCI_AGN_MAP'), CM = constOf('AGN_UTCI_COLD_MAP'); let bad = 0, chk = 0;
  const pg = (P, u, cold) => { if (!cold) { if (u <= P[0][0]) return 0; for (let i = 1; i < P.length; i++) { if (u === P[i][0]) return P[i][1]; if (u < P[i][0]) return Math.min(P[i][1] - 1, Math.round(P[i - 1][1] + (u - P[i - 1][0]) / (P[i][0] - P[i - 1][0]) * (P[i][1] - P[i - 1][1]))); } return 100; }
    if (u >= P[0][0]) return 0; for (let i = 1; i < P.length; i++) { if (u === P[i][0]) return P[i][1] - 1; if (u > P[i][0]) return Math.min(P[i][1] - 1, Math.round(P[i - 1][1] + (P[i - 1][0] - u) / (P[i - 1][0] - P[i][0]) * (P[i][1] - P[i - 1][1]))); } return 100; };
  if (HM && CM && UL.heatLevelOf) for (let u = -52; u <= 55; u = Math.round((u + 0.05) * 100) / 100) { chk++; const h = u >= 9 ? SC.levelOfScreeningScore(pg(HM.points, u, false)) : null, c = u <= 9 ? SC.levelOfScreeningScore(pg(CM.points, u, true)) : null;
    if (h != null && h !== UL.heatLevelOf(u)) bad++; if (c != null && c !== UL.coldLevelOf(u)) bad++; }
  ok(chk > 2000 && bad === 0, 'A5 the page UTCI level maps place every UTCI on the server’s level (29 C heat and -5 C cold are Low on both)', { chk, bad });
  const rec = { days: [{ day: 0, date: today, layers: { heat: { L: { U1: 3 }, S: {} }, cold: { L: { U1: 2 }, S: {} } } }] };
  safe(() => AH.applyTo(rec, {}, {}));
  ok(rec.days[0].layers.heat.L.U1 === -1 && rec.days[0].layers.cold.L.U1 === -1, 'A5 a tehsil without a point state is not assessed (never the page engine’s level)', rec.days[0].layers); }
/* ---------- B1 / L6 · cyclone: "no gale on the record" is a class, not "cannot happen" ---------- */
{ const app = { units: { tehsil: [{ unitId: 'Azad Kashmir|Bagh|Bagh' }, { unitId: 'Sindh|Badin|Badin' }] } };
  const L = safe(() => RL.createRefLayers(app, join(ROOT, 'data')).layer('cyclone'));
  ok(L && L.ready && L.levels['Azad Kashmir|Bagh|Bagh'] === 0 && /^No gale on record/.test(L.words[0]) && !Object.values(L.levels).includes(-4), 'B1 / L6 Bagh: "No gale on record 1980-2025" (class 0), never -4', L && { levels: L.levels, words: L.words }); }
/* ---------- B2 / L4 · the map states ---------- */
{ const m = /var STATE_DEF=(\{[^}]*\})/.exec(HTML); let D = null; try { D = Function('return ' + m[1])(); } catch (_) {}
  ok(D && D['-2'] === 'outside_range' && D['-3'] === 'no_reach' && D['-4'] === 'not_applicable', 'B2 / L4 page: -2 outside the method’s range, -3 no gauged reach, only -4 "cannot happen here"', D);
  ok(ST.STATE_CODES && ST.STATE_CODES['-2'] === 'outside_range' && ST.STATE_CODES['-3'] === 'no_reach', 'B2 / L4 server stateOf: the same split', ST.STATE_CODES);
  ok(!/else if\(hz==='flood_riverine'&&!h\.provisional\) t\.na\+\+;/.test(HTML), 'B2 river flooding: a missing feed is not counted as "cannot occur here"');
  const ls = safe(() => { const rec = { days: [{ day: 0, date: today, layers: { landslide: { L: { U1: 0 } } } }] }; HZ.applyLandslide(rec, { mask: { U1: { applies: false, steepShare30m: 0 } }, odds: null }); return rec.days[0].layers.landslide; });
  ok(ls && ls.L && ls.L.U1 === -1 && /no local steep ground/.test(ls.why.U1), 'B2 (v283.36 item 24 + C-now 2b) flat ground: not assessed, no local steep ground, run-out not modelled (never cannot happen)', ls); }
/* ---------- B3 · /api/hazards/applicability ---------- */
{ const A = jsonOf('data/hazard-applicability.json');
  const rows = AP.applicabilityRows ? safe(() => AP.applicabilityRows(A, 'Balochistan|Gwadar|Gwadar', { cycloneUnit: { assessed: true, level: 2, word: 'Storm force reached' } })) : null;
  const R = (k) => rows && rows.find && rows.find((r) => r.hazard === k);
  ok(rows && R('frost') && /^not expected here/.test(R('frost').text) && !/minSteep|coastKm|frostMarginC/.test(JSON.stringify(rows)), 'B3 a statistical rule (frost) says "not expected here (rule: ...)", in words without variable names', R('frost'));
  const g = AP.applicabilityRows ? safe(() => AP.applicabilityRows(A, 'Azad Kashmir|Bagh|Bagh', { cycloneUnit: { assessed: true, level: 0, word: 'No gale on record 1980–2025', facts: { note: 'x' } } })) : null;
  const gc = g && g.find && g.find((r) => r.hazard === 'cyclone'), co = g && g.find && g.find((r) => r.hazard === 'coastal');
  ok(gc && gc.applies === false && /No gale on record/.test(gc.text) && co && co.applies === false, 'B3 Gilgit: no "Tropical cyclone: can happen here"; coastal listed = outside (the map mask’s reading)', { gc, co }); }
/* ---------- B4 · the sponge day views are hidden from clients (generated gate) ---------- */
{ const g = jsonOf('build/gen/gate.slim.json'), H = g && (g.clientRules || g.client_rules || {}).hidden_layers || {};
  ok('nss_dynamic' in H && 'nss_runoff' in H, 'B4 client hidden_layers holds nss_dynamic and nss_runoff (gen_gate.py)', Object.keys(H)); }
/* ---------- B5 · the 5-day rain is model rain, labelled so ---------- */
{ const r = LO.rain5Of ? safe(() => LO.rain5Of({ obs: Object.fromEntries([1, 2, 3, 4, 5].map((k) => [dayOff(-k), 2])) }, today)) : null;
  ok(r && /model rain of the last 5 days \(not measured\)/.test(String(r.basis || '')), 'B5 the "observed" 5-day rain is labelled model rain, not measured', r); }
/* ---------- B6 · UTCI class names ---------- */
{ const reg = jsonOf('data/thresholds-register.json'), rows = reg ? (reg.rows || reg) : [], h = rows.find && rows.find((x) => x.id === 'utci.heatLevels'), c = rows.find && rows.find((x) => x.id === 'utci.coldLevels');
  ok(h && c && h.value.lowWords === 'moderate heat stress' && c.value.lowWords === 'moderate cold stress' && RP.lowConditionOf && RP.lowConditionOf('heat') === 'Low heat stress', 'B6 (v283.36 item 23: the level word "Low heat stress" with its UTCI value) Low is worded with the published class: moderate heat / cold stress (not "mild")', { h: h && h.value.lowWords, c: c && c.value.lowWords }); }
/* ---------- B7 · one staleness rule ---------- */
{ const ra = read('server/api/rainamount.mjs'), rd = read('server/api/readiness.mjs');
  ok(/RAIN_ENS_STALE_H/.test(ra) && /RAIN_ENS_STALE_H/.test(rd) && !/ageH <= 36/.test(ra) && HZ.RAIN_ENS_STALE_H === 25, 'B7 (v283.36 item 29: 12 h cycle + 13 h delivery from the data-age table) the heavy-rain level, the rain amount and readiness read one ensemble staleness constant'); }
/* ---------- B8 · a sheet older than today is "last measured", with the skill of the true lead ---------- */
{ const m = { level: 3, date: dayOff(-1), station: 'Taunsa', status: 'HIGH' }, SK = { 1: { pod: 0.8, far: 0.2 }, 2: { pod: 0.68, far: 0.32 }, 3: { pod: 0.57, far: 0.43 } };
  const s0 = HZ.sheetSignal ? safe(() => HZ.sheetSignal(m, today, today, SK)) : null, s3 = HZ.sheetSignal ? safe(() => HZ.sheetSignal(m, dayOff(3), today, SK)) : null;
  ok(s0 && /^last measured/.test(s0.basis) && s0.measured && s0.measured.observed === false && s0.measured.lead === 1 && s0.measured.pod === 0.8, 'B8 yesterday’s sheet on day 0: "last measured", lead 1 skill (never "today’s measured")', s0);
  ok(s3 && s3.none === true, 'B8 day 3 from a 1-day-old sheet is lead 4: not tested, not used', s3); }
/* ---------- C1 / C3 / C4 · untested thresholds: labelled, no client alert ---------- */
ok(SV.NO_CLIENT_ALERT && SV.NO_CLIENT_ALERT.wind && SV.NO_CLIENT_ALERT.glof && SV.NO_CLIENT_ALERT.landslide && /thresholds not tested/.test(SV.UNTESTED_LABEL || ''), 'C1 / C3 / C4 wind, GLOF and landslide: "indicative — thresholds not tested", never a client alert');
{ const w = safe(() => { const rec = { days: [{ day: 0, date: today, layers: { wind: { L: { U1: -2, U2: 0 } } } }] }; HZ.applyWind(rec); return rec.days[0].layers.wind; });
  ok(w && w.L && w.L.U1 === -5 && /not tested here/.test(w.why.U1), 'C1 / L5 wind above 1,500 m: "not tested here" with its reason (was -2 with none)', w); }
/* ---------- C2 · the 25 % rule disclosed ---------- */
{ const g = jsonOf('data/model-gate.json'), u = g && g.entries.find((e) => e.id === 'utci');
  ok(u && (u.known_limitations || []).some((x) => /AGN rule, untested/.test(x)), 'C2 the 25 % population rule is disclosed as "AGN rule, untested" (operator Methods: model gate)'); }
/* ---------- C3 · landslide basis map served only after its held-out test ---------- */
{ const M = jsonOf('data/landslide-basis-map.json'); ok(!M || M.served === false || M.passed === true, 'C3 the landslide basis map is not served unless its held-out test passed (2026-10-21 fit: failed)'); ok(SV.NO_CLIENT_ALERT && SV.NO_CLIENT_ALERT.landslide, 'C3 landslide levels raise no client alert'); }
/* ---------- C5 / C6 ---------- */
ok(typeof SM.AIR_UNTESTED === 'string' && /dust bands/.test(SM.AIR_UNTESTED), 'C5 dust, dispersion, smog-day and fog rules labelled untested');
ok(typeof SCH.UNTESTED_ADJUST === 'string' && /withheld: WITHHELD_SITE/.test(read('server/api/sitechange.mjs')) && /NOT_MODELLED_SITE/.test(read('server/api/sitechange.mjs')), 'C6 (v283.36 items 3 / 26) Lab B: the untested slope / green roof / paving / Kirpich steps are withheld, said so in the result');
/* ---------- D1 · code dictionary ---------- */
{ const d = ST.codeDict ? ST.codeDict() : {}; ok(['-4', '-5', '-6', '-3', '-2', '-1'].every((k) => typeof d[k] === 'string' && d[k].length > 10) && /codeDict\(\)/.test(read('server/api/engine.mjs')), 'D1 /api/levels and the engine carry the text of -4, -5 and -6', d); }
/* ---------- D2 · drought month ---------- */
{ const mk = (month, prelim) => { const rec = { days: [{ day: 0, date: today, layers: { drought: { L: { U1: 0 } } } }] }; const ch = { monthBasis: { month, prelim }, units: { U1: { monthly: { month: { month, spi3: { value: -0.9 } } } } } };
    safe(() => HZ.applyDrought(rec, { chirps: ch })); return rec.days[0].layers.drought; };
  const cur = mk(dayOff(-20).slice(0, 7), true), old = mk(dayOff(-120).slice(0, 7), false);
  ok(cur.facts && cur.facts.U1 && cur.facts.U1.prelim === true && /preliminary/.test(cur.basis || ''), 'D2 a preliminary CHIRPS month is flagged on the cell and the basis', cur.facts);
  ok(old.L.U1 === -6, 'D2 a month whose successor is overdue is "input not current"', old.L); }
/* ---------- D3 / D4 · PM2.5 truncation, dust completeness ---------- */
ok(SM.pmClass && SM.pmClass(9.04) === 0 && SM.pmClass(9.1) === 1, 'D3 PM2.5 is truncated to 0.1 before classing (9.04 is Good)');
ok(/d\.dust\.length >= AQ_DAY_MIN_HOURS/.test(read('server/api/smog.mjs')), 'D4 the dust daily mean needs 18 of 24 hours');
/* ---------- D5 · NWS heat index ---------- */
{ const T = 25 * 9 / 5 + 32, simple = 0.5 * (T + 61 + (T - 68) * 1.2 + 50 * 0.094), avg = (simple + T) / 2, want = (avg - 32) * 5 / 9;
  ok(HI.heatIndexRaw && Math.abs(HI.heatIndexRaw(25, 50) - want) < 1e-9, 'D5 below 80 F the NWS average (no max(T, ...))', [HI.heatIndexRaw && HI.heatIndexRaw(25, 50), want]);
  const pr = pageFn('heatIndexRaw'); ok(pr && Math.abs(pr(25, 50) - want) < 1e-9, 'D5 the page heat index is the same NWS method', pr && pr(25, 50)); }
ok(/Hawkins et al\. \(1985\)/.test(read('server/api/hazsci.mjs')), 'D6 the AMC conversion is cited to Hawkins et al. (1985) / NEH-630');
/* ---------- L2 / L3 / item 5 · comfort ---------- */
{ ok(CF.comfortDays && CF.COMFORT_NAME === 'Heat discomfort (DI)', 'L3 the layer is "Heat discomfort (DI)"');
  const hrs = []; for (let h = 0; h < 24; h++) hrs.push({ time: today + 'T' + String(h).padStart(2, '0') + ':00', tempC: h === 14 ? 21.05 : 18, rh: h === 14 ? 96 : 50 });
  const ps = { hours: hrs, days: [{ date: today, lead: 0 }] }; const d = CF.comfortDays ? safe(() => CF.comfortDays(ps)) : null;
  const di = 21.05 - 0.55 * (1 - 0.96) * (21.05 - 14.5);
  ok(d && d[0] && d[0].assessed && d[0].level === (di >= 21 ? 1 : 0) && d[0].diMax === Math.round(di * 10) / 10, 'L2 the class is placed on the full-precision DI, then rounded for display', { d, di });
  const ps2 = { hours: hrs.map((h, i) => (i === 3 ? { ...h, rh: null } : h)), days: [{ date: today, lead: 0 }] }, d2 = CF.comfortDays ? safe(() => CF.comfortDays(ps2)) : null;
  ok(d2 && d2[0] && d2[0].assessed === false && /incomplete day/.test(d2[0].why), 'item 5 a missing humidity hour: "incomplete day", never 0', d2);
  const dp = pageFn('discomfortIndex'); ok(dp && dp(30, 120) === null && dp(30, null) === null && Math.abs(dp(30, 50) - 25.7375) < 1e-9, 'item 5 the page has no humidity clamp: RH 120 % is refused, missing stays missing');
  const dew = pageFn('dewPointC', 'function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }'); ok(dew && Number.isNaN(dew(20, null)), 'item 5 no Number(null)=0: the page dew point of a missing humidity is missing', dew && dew(20, null)); }
/* ---------- L7 / item 7 · runoff: event based, kept after midnight ---------- */
{ const V = { covers: ['pasture'], cn2: { pasture: [49, 69, 79, 84] }, fSlope: [1], units: { U1: { uid: 'U1', bins: [[0, 2, 0, 1]] } }, edgesCN: [90, 80, 70, 60] };
  const obs = {}; for (let k = 1; k <= 12; k++) obs[dayOff(-k)] = k === 2 ? 40 : k === 3 ? 30 : 1; obs[dayOff(-1)] = 1;
  const rain5Of = (uid, date) => LO.rain5Of({ obs }, date);
  const rec = { days: [{ day: 0, date: today, layers: { nss_baseline: { L: { U1: 0 } }, nss_dynamic: { L: { U1: 0 } }, nss_runoff: { L: { U1: 0 } } } }] };
  safe(() => HZ.applySponge(rec, { v2: V, rain5Of, runoffCuts: [{ level: 'Severe', min: 25 }, { level: 'High', min: 10 }, { level: 'Moderate', min: 5 }, { level: 'Low', min: 1 }, { level: 'Normal', min: null }] }));
  const R = rec.days[0].layers.nss_runoff, f0 = R.facts && R.facts.U1;
  let want = 0; for (let k = 5; k >= 1; k--) { const t = dayOff(-k), a5 = LO.rain5Of({ obs }, t), amc = HZ.amcOf(a5.mm); want += HZ.runoffOf(V, V.units.U1, obs[t], amc); }
  ok(f0 && Array.isArray(f0.perDay) && f0.perDay.length === 5 && Math.abs(f0.runoffMm - Math.round(want * 10) / 10) < 1e-9, 'item 7 NRCS runoff per day at its own AMC, summed over the 5 days', { f0, want });
  const obs2 = { ...obs }; delete obs2[dayOff(-1)]; const rec2 = { days: [{ day: 0, date: today, layers: { nss_baseline: { L: { U1: 0 } }, nss_dynamic: { L: { U1: 0 } }, nss_runoff: { L: { U1: 0 } } } }] };
  safe(() => HZ.applySponge(rec2, { v2: V, rain5Of: (u, d) => LO.rain5Of({ obs: obs2 }, d), runoffCuts: [{ level: 'Normal', min: null }] }));
  const R2 = rec2.days[0].layers.nss_runoff;
  ok(R2.L.U1 === -6 && /input not current/.test(R2.why.U1) && R2.facts && R2.facts.U1 && R2.facts.U1.asOf === dayOff(-1), 'L7 after midnight the last complete result is kept with its date, state "input not current" (never blank with a wrong reason)', { L: R2.L, why: R2.why, f: R2.facts && R2.facts.U1 && R2.facts.U1.asOf }); }
/* ---------- L8 · standing risk is not a day's hazard ---------- */
{ const h = safe(() => RP.hazardListOf({ ready: true, days: [{ day: 0, date: today, layers: { glof: { name: 'GLOF', word: 'High' }, heat: { name: 'Heat', word: 'Normal' } } }] }));
  ok(h && !h.hazards.some((x) => x.key === 'glof') && h.standing && h.standing.some((x) => x.key === 'glof' && x.word === 'High'), 'L8 GLOF susceptibility is listed as standing risk, not as a dated hazard', h);
  ok(/var STANDING=\{glof:1,drought:1\}/.test(HTML) && /h\.k!=='glof'&&h\.k!=='drought'/.test(N3), 'L8 the console report and the Customize site report list standing risks apart (server hazardList)'); }
/* ---------- L5 · every non-value cell has a reason ---------- */
{ const g = safe(() => { const rec = { days: [{ day: 0, date: today, layers: { glof: { L: { U1: -2, U2: -1 } } } }] }; HZ.applyGlof(rec, { nat: null, ladder: null }); return rec.days[0].layers.glof; });
  ok(g && g.why && /not available|cannot happen|not tested/.test(g.why.U1 || ''), 'L5 (v283.36 item 18) every GLOF cell without a level carries its reason', g);
  ok(/STATE_TEXT\[String\(l\)\]/.test(read('server/api/engine.mjs')), 'L5 /api/levels gives every unassessed cell a reason'); }
console.log(`\n${n - f} pass, ${f} fail`); process.exit(f ? 1 : 0);
