/* v91.17.283.12 · the server rules of Package B, without a server:
     P  the one place rule (v91.17.283.18: in server/api/places.mjs search): a town name -> the settlement; an explicit "X tehsil" -> its main settlement with a
        label saying so; a district row "in the middle of its tehsils" -> the main settlement of its most populous tehsil; every unit row
        carries its label
     H  the area heat (server/api/areaheat.mjs): a tehsil's heat level = the highest over its point states (main settlement and centre),
        a level only from strong heat stress (UTCI 32 C); a heat-only alert row whose tehsil no longer reaches its level is dropped
     U  the one UTCI map (server/api/utci.mjs and the page's inline map): 31.9 C -> Normal, 32 -> Moderate, 38 -> High, 46 -> Severe; cold
        at -13 / -27 / -40; the page no longer clips inputs to 49.9 C / 16.9 m/s
     A  the one alert rule: the page's agnAlertLevelOk and the server's alertGate agree for heat, cold, wind and rain at every level
   usage: node scripts/tests28312/rules.test.mjs */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
process.env.NIGRAAN_DATA_DIR = join(ROOT, 'data');
const { createPlaces } = await import('../../server/api/places.mjs');
const { pointsOf, aggregate: aggregate0, applyTo, levelOfScore } = await import('../../server/api/areaheat.mjs');
/* v283.36 item 16: aggregate has no 0.25 fallback; the tests pass the rule file's share (data/tehsil-popcells.json rule.share = 0.25) */
const aggregate = (P, s, o) => aggregate0(P, s, { share: 0.25, ...(o || {}) });
const U = await import('../../server/api/utci.mjs');
const { alertGate, gatePolicy } = await import('../../server/api/engine.mjs');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 500) : '')); } };

/* ---- P ---- (v91.17.283.18: the rule is part of the one place layer's search, server/api/places.mjs) */
const A = JSON.parse(readFileSync(join(ROOT, 'data', 'tehsil-anchor.json'), 'utf8')).units;
const PL = createPlaces({ dataDir: join(ROOT, 'data'), units: { tehsil: JSON.parse(readFileSync(join(ROOT, 'server', 'contract', 'units.json'), 'utf8')) } });
const town = await PL.search('Murree'); ok(town.results[0].level === 'settlement' && /settlement/.test(town.results[0].resolvedAs) && town.results[0].resolvedLabel === 'Murree' && !town.results.some((r) => r.level === 'tehsil' && r.name === 'Murree'), 'P1 "Murree": the town is the one row of that name (the tehsil it stands in is not listed beside it) (' + town.results[0].resolvedAs + ')');
const exp = await PL.search('Murree tehsil'); ok(exp.results[0].level === 'tehsil' && /main settlement/.test(exp.results[0].resolvedAs) && /^Murree tehsil · main settlement Murree/.test(exp.results[0].resolvedLabel), 'P2 "Murree tehsil": the unit, its main settlement, labelled (' + exp.results[0].resolvedLabel + ')');
const other = await PL.search('Kahuta'); ok(other.results[0].level === 'settlement', 'P3 "Kahuta": the settlement of that name is first (' + other.results[0].level + ', ' + other.results[0].resolvedAs + ')');
const dk = Object.entries(A).filter(([k]) => k.split('|')[1] === 'Hunza').sort((x, y) => ((y[1].anchor || {}).population || (y[1].anchor || {}).peopleWithin750m || 0) - ((x[1].anchor || {}).population || (x[1].anchor || {}).peopleWithin750m || 0))[0];
const dist = await PL.search('Hunza district'); const d0 = dist.results[0];
ok(dk && d0 && d0.level === 'district' && d0.lat === dk[1].anchor.lat && /main settlement/.test(d0.resolvedLabel || ''), 'P4 "Hunza district": the district stands at the main settlement of its most populous tehsil, labelled (' + (d0 && d0.lat + ',' + d0.lon + ' ' + d0.resolvedLabel) + ')');
const coords = await PL.search('33.6, 73.0'); ok(coords.results[0].level === 'coordinates' && coords.results[0].lat === 33.6, 'P5 a typed coordinate is left as typed');

/* ---- H ---- */
const P = pointsOf({ 'P|D|T1': { anchor: { lat: 30, lon: 70 }, centre: { lat: 30.2, lon: 70.2 } }, 'P|D|T2': { anchor: { lat: 31, lon: 71 }, centre: { lat: 31.01, lon: 71.01 } } });
ok(P.length === 3 && P.filter((p) => p.uid === 'P|D|T1').length === 2 && P.filter((p) => p.uid === 'P|D|T2').length === 1, 'H1 points: the main settlement, and the centre only when more than 5 km away (' + P.map((p) => p.uid + ':' + p.kind).join(', ') + ')');
const day = (date, u) => ({ date, lead: 0, heat: { utciMaxC: u, at: '14:00', cls: '' } });
const S = [{ ok: true, days: [day('2026-10-24', 33.0)] }, { ok: true, days: [day('2026-10-24', 34.5)] }, { ok: true, days: [day('2026-10-24', 31.0)] }];   /* v283.31 owner 2.2: the main settlement (populated) decides; the centre is the hottest point, reported */
const AG = aggregate(P, S);
ok(AG['P|D|T1'].days['2026-10-24'].utciMaxC === 34.5 && AG['P|D|T1'].days['2026-10-24'].extremePoint.point === 'centre' && AG['P|D|T1'].days['2026-10-24'].level === 2 && AG['P|D|T2'].days['2026-10-24'].level === 0, 'H2 (v283.31) the tehsil level from its populated point (33.0 C -> Moderate), the hottest point (centre 34.5) served beside it; 31.0 C -> Normal');
const rec = { days: [{ day: 0, date: '2026-10-24', layers: { heat: { L: { 'P|D|T1': 0, 'P|D|T2': 3, 'P|D|T3': -2 }, S: { 'P|D|T1': 10, 'P|D|T2': 70, 'P|D|T3': null }, counts: [1, 0, 0, 1, 0] } } }],
  unitKeys: { 'P|D|T1': 'T1', 'P|D|T2': 'T2' }, alertsCtx: { day: 0 }, alerts: [{ name: 'T2', hazard: 'heat', hazards: ['heat'], band: 'high' }, { name: 'T1', hazard: 'heat', hazards: ['heat'], band: 'moderate' }, { name: 'T2', hazards: ['heat', 'flood'], band: 'high' }] };
const r1 = applyTo(rec, AG, { run: 'x' }); const H = rec.days[0].layers.heat;
ok(H.L['P|D|T1'] === 2 && H.L['P|D|T2'] === 0 && H.L['P|D|T3'] === -2 && H.counts.join(',') === '1,0,1,0,0', 'H3 the issued heat layer is the area values (T1 Moderate, T2 Normal, not-applicable kept): ' + JSON.stringify(H.L) + ' counts ' + H.counts);
ok(rec.alerts.length === 2 && rec.alerts.some((r) => r.name === 'T1') && rec.alerts.some((r) => r.hazards.length === 2) && r1.dropped === 1, 'H4 the heat-only row of T2 (now Normal) is dropped; T1 (Moderate) and the mixed row stay (' + JSON.stringify(rec.alerts.map((r) => r.name + ':' + (r.hazards || []).join('+'))) + ')');
ok(levelOfScore(24) === 0 && levelOfScore(45) === 2 && levelOfScore(65) === 3 && levelOfScore(82) === 4, 'H5 the AGN band cuts 25 / 45 / 65 / 82');

/* ---- U ---- */
const sc = (u) => U.utciAgnScore(u), lv = (u) => levelOfScore(sc(u));
ok(lv(25.9) === 0 && lv(26) === 1 && lv(31.9) === 1 && lv(32) === 2 && lv(37.9) === 2 && lv(38) === 3 && lv(45.9) === 3 && lv(46) === 4, 'U1 heat (v283.35 A5: the map places the register levels): 26 Low (moderate heat stress), 32 Moderate, 38 High, 46 Severe', [31.9, 32, 37.9, 38, 45.9, 46].map((x) => x + ':' + sc(x)).join(' '));
const cs = (u) => levelOfScore(U.utciColdScore(u));
ok(cs(0) === 0 && cs(-0.1) === 1 && cs(-12.9) === 1 && cs(-13.1) === 2 && cs(-27.1) === 3 && cs(-40.1) === 4, 'U2 cold (v283.35 A5: the register levels): below 0 Low (moderate cold stress), -13 Moderate, -27 High, -40 Severe', [-12.9, -13.1, -27.1, -40.1].map((x) => x + ':' + U.utciColdScore(x)).join(' '));
const page = readFileSync(join(ROOT, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html'), 'utf8');
const pm = /const AGN_UTCI_AGN_MAP = (\{[^\n;]*\});/.exec(page), pc = /const AGN_UTCI_COLD_MAP = (\{[^\n;]*\});/.exec(page);
ok(pm && JSON.stringify(JSON.parse(pm[1])) === JSON.stringify(U.UTCI_AGN_MAP) && pc && JSON.stringify(JSON.parse(pc[1])) === JSON.stringify(U.UTCI_COLD_MAP), 'U3 the page carries the server\'s UTCI maps (' + (pm && JSON.parse(pm[1]).version) + ')');
ok(!/Math\.max\(-49\.9,Math\.min\(t,49\.9\)\)/.test(page) && /function hzUtciInRange\(t,v,h\)\{ var u=agnUtci\(t,t,v,h\); return \(u!=null&&isFinite\(u\)\)\?u:null; \}/.test(page), 'U4 the page no longer clips UTCI inputs to 49.9 C / 16.9 m/s');

/* ---- A ---- */
const fn = /function agnAlertLevelOk\(h, rank\)\{[\s\S]*?\n  return rank>=ALERT_MIN_CLASS_RANK; \}/.exec(page);
const gm = [null, readFileSync(join(ROOT, 'data', 'model-gate.slim.json'), 'utf8')];   /* the gate the page reads (/api/registry/gate) */
const ctx = vm.createContext({ window: {} }); vm.runInContext('var ALERT_MIN_CLASS_RANK=' + JSON.stringify(JSON.parse(gm[1]).alertMinClassRank) + '; window.AGN_MODEL_GATE=' + gm[1] + ';' + fn[0], ctx);   /* v283.24: the rank is the slim gate's */
const G = JSON.parse(readFileSync(join(ROOT, 'data', 'model-gate.resolved.json'), 'utf8')), pol = gatePolicy(G);
const canAlert = (k) => { const id = JSON.parse(gm[1]).layers[k]; const e = id && JSON.parse(gm[1]).entries[id]; return !!(e && e.canAlert); };
const scale = JSON.parse(readFileSync(join(ROOT, 'data', 'hazard-scale.json'), 'utf8'));
const gate = alertGate({ canAlert, scale, policy: pol, names: {}, domainOk: null });
const IDX = [10, 30, 50, 70, 90], W = ['Normal', 'Low', 'Moderate', 'High', 'Severe'], diff = [];
for (const hz of ['heat', 'cold', 'wind', 'rain_hz', 'flood']) for (let i = 1; i <= 4; i++) {
  const pageOk = vm.runInContext('agnAlertLevelOk(' + JSON.stringify(hz) + ',' + i + ')', ctx);
  const srv = gate([{ name: 'x', hazard: hz, index: IDX[i], holders: [{ hazard: hz, index: IDX[i] }], classRank: i }]).length > 0;
  if (pageOk !== srv) diff.push(hz + ' ' + W[i] + ': page ' + pageOk + ', server ' + srv); }
ok(!diff.length, 'A1 the page and the server raise an alert at the same levels (heat from Moderate where the gate allows it, cold never, others from High)', diff.join(' | '));
ok(vm.runInContext("agnAlertLevelOk('heat',2)", ctx) === true && vm.runInContext("agnAlertLevelOk('heat',3)", ctx) === false && vm.runInContext("agnAlertLevelOk('cold',4)", ctx) === false && vm.runInContext("agnAlertLevelOk('rain_hz',2)", ctx) === false && vm.runInContext("agnAlertLevelOk('rain_hz',3)", ctx) === false, 'A2 heat Moderate alerts (tested), heat High does not (Indicative), cold never, rain never (v283.13: the rain level is screening, no per-level event test)');
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
