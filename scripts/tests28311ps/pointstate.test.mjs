/* v91.17.283.11 · ONE CALCULATION POINT · unit tests of server/api/pointstate.mjs, offline: the server's /px/v1/forecast answer is stubbed
   (a served-chain-shaped answer per location, with its agn_* records), the place layer (v91.17.283.18: app.places) and the fleet are stubbed; the real
   national-model.json, hyperlocal-model.json and fleet-history-skill.json of data/ give the measured errors.
     C1-C5  cache: one computation per (point as asked, run, live-station read; v283.19: key 4 decimals, no 0.01 deg cell); a second ask is a
            cache read, a point 0.001 deg away is its own record; a new live-station read recomputes; a batch of N points is ONE request for N locations
     S1-S6  the numbers ARE the served answer's (now = the served value of the current PKT hour; every hour equal); the request is the
            point engine's (variables, Asia/Karachi, forecast height, user tag); the chain steps come from the answer's records;
            "MACH forecast" only when the live layer covers this hour; the 9 km values are named only when the served answer carries
            them (the module never reads the 0.1 deg run); ?run= of another run is refused
     U1-U3  UTCI levels (Blazejczyk 2013): 31.9 none, 32 Moderate, 38 High, 46 Severe; cold -12.9 none, -13 Moderate, -27 High, -40 Severe
     H1-H2  every full day's hottest hour = its Tmax, coldest = its Tmin; days 0-6
     K1-K4  confidence: national held-out MAE of the zone and variant that ran; the live layer's when it ran this hour; the fleet's
            day-1 / day-3 MAE for later plains days; words + number
     B1     a single point carries how "now" is made (raw read of the same request)
   usage: node scripts/tests28311ps/pointstate.test.mjs */
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PS = await import(pathToFileURL(join(ROOT, 'server', 'api', 'pointstate.mjs')).href);
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 400) : '')); } };
const DATA = join(ROOT, 'data'), H = 3600e3;
const NOW = Date.parse('2026-10-23T19:45:00Z');   /* 24 Oct 00:45 PKT, the owner's screenshot */
const NM = JSON.parse(readFileSync(join(DATA, 'national-model.json'), 'utf8')), HL = JSON.parse(readFileSync(join(DATA, 'hyperlocal-model.json'), 'utf8')), FH = JSON.parse(readFileSync(join(DATA, 'fleet-history-skill.json'), 'utf8'));

/* a served-chain-shaped answer: 7 PKT days of hours from 00:00 PKT on 24 Oct, values from the coordinate */
const T0 = Date.parse('2026-10-23T19:00:00Z');
const served = (lat, lon, h, raw) => Math.round((14 + lat / 10 + lon / 100 + 6 * Math.sin(((h % 24) - 9) / 24 * 2 * Math.PI) + (raw ? -0.8 : 0)) * 10) / 10;
function stubPx(log, extra = {}) {
  return async (qs) => { const q = new URLSearchParams(qs); log.push(q); const raw = q.get('__raw') === '1';
    const lats = q.get('latitude').split(',').map(Number), lons = q.get('longitude').split(',').map(Number);
    const one = (i) => { const time = [], T = []; for (let h = 0; h < 7 * 24; h++) { time.push(new Date(T0 + h * H + 5 * H).toISOString().slice(0, 16)); T.push(served(lats[i], lons[i], h, raw)); }
      return { latitude: lats[i], longitude: lons[i], elevation: 500, hourly: { time, temperature_2m: T, relative_humidity_2m: T.map(() => 55), wind_speed_10m: T.map(() => 8), dew_point_2m: T.map(() => 6),
        apparent_temperature: T.map((t) => t - 1), precipitation: T.map(() => 0.1), wind_gusts_10m: T.map(() => 20), cloud_cover: T.map(() => 30) },
        agn_temperature_basis: { zone: extra.zone || 'plains', calibration: { applied: true } }, agn_national: { applied: true, zone: extra.zone || 'plains', variant: 'pool' },
        agn_hyperlocal: extra.live ? { applied: true, hours: 7, stations: 4, nearestKm: 3.2, plusMinus90C: 1.1 } : { applied: false, why: 'no live MACH station within 40 km' },
        ...(extra.e010 ? { agn_ecmwf010: { run: '2026102312', variables: ['temperature_2m'] } } : {}) }; };
    return lats.length === 1 ? one(0) : lats.map((_, i) => one(i)); };
}
function mkApp(over = {}) {
  return { dataDir: DATA, places: { pointRow: () => ({ administered: true, tehsil: 'Testpur', district: 'Test', province: 'Punjab', unitId: 'P|T|Testpur', forecastElevM: 500, heightBasis: '30 m terrain' }) },
    hyperlocal: { status: () => ({ liveStations: over.liveStations || 5 }) }, fleet: { latest: () => ({ at: over.fleetAt || 'r1' }), nearest: () => null }, ...over.app };
}

/* -- C -- (v91.17.283.19: the record is computed at the point asked, keyed to 4 decimals (about 11 m); no 0.01 deg cell) */
{ const log = [], A = mkApp(); const P = PS.createPointState(A, { now: () => NOW, fetchPx: stubPx(log) });
  const a = await P.many([{ lat: 31.5204, lon: 74.3587 }]); const n1 = log.length;
  const b = await P.many([{ lat: 31.5204, lon: 74.3587 }]), b2 = await P.many([{ lat: 31.52041, lon: 74.35871 }]); const n2 = log.length;
  const c = await P.many([{ lat: 31.5195, lon: 74.3612 }]);
  ok(a[0].ok && n1 === 1, 'C1 first ask: one request', JSON.stringify([a[0].ok, a[0].why, n1]));
  /* v91.17.283.23 · audit 18: the key is the point as asked (5 decimals): a point 1 m away is its own record */
  ok(b[0] === a[0] && b2[0] !== a[0] && n2 === 2 && a[0].key === '31.52040,74.35870', 'C2 the same point again is the cached record; a point 1 m away is its own (' + a[0].key + ')');
  ok(c[0] !== a[0] && c[0].ok && log.length === 3 && c[0].key === '31.51950,74.36120' && log[2].get('latitude') === '31.51950', 'C3 a point 0.001 deg away is computed where it is asked, its own record (' + c[0].key + '; no 0.01 deg cell)');
  A.fleet.latest = () => ({ at: 'r2' }); await P.many([{ lat: 31.5204, lon: 74.3587 }]);
  ok(log.length === 4, 'C4 a new live-station read recomputes (the chain’s live layer may differ)');
  const log2 = []; const P2 = PS.createPointState(mkApp(), { now: () => NOW, fetchPx: stubPx(log2) });
  const r = await P2.many([[30.18, 66.97], [27.70, 68.86], [28.28, 68.44], [33.70, 73.00], [34.37, 73.47]].map(([lat, lon]) => ({ lat, lon })));
  ok(r.every((x) => x.ok) && log2.length === 1 && log2[0].get('latitude').split(',').length === 5, 'C5 a batch of 5 points is ONE request for 5 locations'); }

/* -- S -- */
{ const log = []; const P = PS.createPointState(mkApp(), { now: () => NOW, fetchPx: stubPx(log) }); const s = (await P.many([{ lat: 34.37, lon: 73.47 }]))[0];
  const k0 = 0; ok(s.now.time === '2026-10-24T00:00' && s.now.tempC === served(34.37, 73.47, k0), 'S1 now = the served value of the 00:00 PKT hour (' + s.now.tempC + ')');
  ok(s.hours.length === 96 && s.hours.every((h, i) => h.tempC === served(34.37, 73.47, i)), 'S2 every hour (days 0-3, 96) equals the served answer');
  const q = log[0]; ok(q.get('hourly') === PS.HOURLY && q.get('timezone') === 'Asia/Karachi' && q.get('forecast_days') === '8' /* v283.28 S2: 8 days so day 7 holds its 24:00 hour */ && q.get('elevation') === '500' && !q.has('models'), 'S3 the request is the point engine’s (served best_match chain, Asia/Karachi, forecast height 500 m, 7 days)');
  ok(s.source.kind === 'Model forecast' && s.source.mach.applied === false && /national temperature model/.test(s.source.label) && /station calibration/.test(s.source.label) && !/9 km/.test(s.source.label),
    'S4 no live layer: "Model forecast"; the chain steps are the answer’s (' + s.source.label + ')');
  const P2 = PS.createPointState(mkApp(), { now: () => NOW, fetchPx: stubPx([], { live: true, e010: true }) }); const s2 = (await P2.many([{ lat: 33.70, lon: 73.00 }]))[0];
  ok(s2.source.kind === 'MACH forecast' && s2.source.mach.applied && s2.now.live && /live MACH stations/.test(s2.source.label) && /9 km model values for temperature_2m \(switch rule passed\)/.test(s2.source.label),
    'S5 live layer on this hour: "MACH forecast"; 9 km values named only because the served answer carries them (' + s2.source.label + ')');
  const SRC = readFileSync(join(ROOT, 'server', 'api', 'pointstate.mjs'), 'utf8');
  ok(!/app\.ecmwf010|ecmwf010\.mjs'|\.series\(|atHour\(/.test(SRC) && /\/px\/v1\/forecast/.test(SRC), 'S6 the module never reads the 0.1 deg run or bypasses its serve gate: it reads only the served /px/v1/forecast answer');
  const s3 = (await P.many([{ lat: 33.7, lon: 73 }], { run: 'other' }))[0]; ok(s3.ok === false && /not the current run/.test(s3.why), 'S7 ?run= of another run is refused (' + s3.why + ')'); }

/* -- U -- */
{ const L = PS.utciLevel;
  ok(L(25.9).level === 'Normal' && L(31.9).level === 'Low' /* v283.31 owner: utci.heatLevels, 26-32 Low (mild heat stress), mirrors the cold side */ && L(31.9).condition === 'moderate heat stress' /* v283.35 B6: the published class name */ && L(31.9).cls === 'moderate heat stress' && L(32).level === 'Moderate' && L(37.9).level === 'Moderate', 'U1 heat: 25.9 Normal, 31.9 Low (mild heat stress), 32 Moderate (strong heat stress)');
  ok(L(38).level === 'High' && L(45.9).level === 'High' && L(46).level === 'Severe' && L(23.1).level === 'Normal' && L(23.1).cls === 'no thermal stress', 'U2 heat: 38 High, 46 Severe; 23.1 no thermal stress, level None');
  ok(L(0).level === 'Normal' && L(-0.1).level === 'Low' && L(-12.9).level === 'Low' && L(-13).level === 'Low' && L(-13.1).level === 'Moderate' && L(-27.1).level === 'High' && L(-40.1).level === 'Severe', 'U3 (v283.31 owner 2.1, no gap) cold: 0 Normal, -0.1 to -13.0 Low, -13.1 Moderate, -27.1 High, -40.1 Severe'); }

/* -- H -- */
{ const P = PS.createPointState(mkApp(), { now: () => NOW, fetchPx: stubPx([]) }); const s = (await P.many([{ lat: 31.52, lon: 74.36 }]))[0];
  const bad = []; let full = 0; for (const d of s.days) { const hs = s.hours.filter((h) => h.time.slice(0, 10) === d.date); if (hs.length < 24) continue; full++;
    if (Math.abs(Math.max(...hs.map((h) => h.tempC)) - d.tmaxC) > 0.05 || Math.abs(Math.min(...hs.map((h) => h.tempC)) - d.tminC) > 0.05) bad.push(d.date); }
  ok(full === 4 && !bad.length, 'H1 hottest hour = Tmax, coldest hour = Tmin on all ' + full + ' days with hours (' + bad.join(',') + ')');
  ok(s.days.length === 7 && s.days[0].lead === 0 && s.days[6].lead === 6 && s.days.every((d) => d.heat && d.heat.level), 'H2 days 0-6, each with its UTCI heat level'); }

/* -- K -- */
{ const P = PS.createPointState(mkApp(), { now: () => NOW, fetchPx: stubPx([]) }); const s = (await P.many([{ lat: 31.52, lon: 74.36 }]))[0];
  /* v91.17.283.28 · S6 · ONE accuracy figure: the verification ledger (accuracy.mjs) for the zone and lead; the held-out design tests are no
     longer quoted (K1-K4 rewritten to the new rule) */
  const AC = await import(pathToFileURL(join(ROOT, 'server', 'api', 'accuracy.mjs')).href);
  const c0 = AC.accuracyCell(join(ROOT, 'data'), { variable: 'T', zone: 'plains', lead: 0 }), c1 = AC.accuracyCell(join(ROOT, 'data'), { variable: 'TX', zone: 'plains', lead: 1 });
  ok(s.confidence.now.maeC === c0.maeC && /verification ledger/.test(s.confidence.now.basis) && /plains zone, lead day 0/.test(s.confidence.now.basis), 'K1 now: the ledger\u2019s hourly temperature MAE for the zone at lead 0 (' + s.confidence.now.text + ')');
  ok(s.days[1].confidence.maeC === c1.maeC && /daily maximum temperature/.test(s.days[1].confidence.basis), 'K2 a later day: the ledger\u2019s daily maximum MAE at its lead (' + s.days[1].confidence.text + ')');
  const P2 = PS.createPointState(mkApp(), { now: () => NOW, fetchPx: stubPx([], { live: true }) }); const s2 = (await P2.many([{ lat: 31.52, lon: 74.36 }]))[0];
  ok(s2.confidence.now.maeC === c0.maeC && !/held out/.test(s2.confidence.now.basis), 'K3 the live layer hour quotes the same one figure, not a held-out design test (' + s2.confidence.now.text + ')');
  const P3 = PS.createPointState(mkApp(), { now: () => NOW, fetchPx: stubPx([], { zone: 'mountain' }) }); const s3 = (await P3.many([{ lat: 35.9, lon: 74.3 }]))[0];
  ok(/mountain zone/.test(s3.confidence.now.basis) && s3.confidence.now.maeC === AC.accuracyCell(join(ROOT, 'data'), { variable: 'T', zone: 'mountain', lead: 0 }).maeC, 'K4 mountain: the ledger cell of its own zone (' + s3.confidence.now.text + ')'); }

/* -- B -- */
/* v91.17.283.24 · self-audit P4 · the raw value comes from the record's OWN request (server.mjs keeps its provider body: app.pxRawTake);
   there is no second request (it was a second paid provider call per place per run) */
{ const log = []; const rawOf = (la, lo) => { const time = [], t = []; for (let h = 0; h < 7 * 24; h++) { time.push(new Date(T0 + h * H + 5 * H).toISOString().slice(0, 16)); t.push(served(la, lo, h, true)); } return { time, t }; };
  const A = mkApp({ app: { pxRawTake: (la, lo) => rawOf(la, lo) } }); const P = PS.createPointState(A, { now: () => NOW, fetchPx: stubPx(log) }); const s = await P.state(34.37, 73.47);
  ok(s.build && s.build.rawC === served(34.37, 73.47, 0, true) && s.build.servedC === s.now.tempC && log.length === 1 && log[0].get('__raw') == null, 'B1 a single point carries raw ' + (s.build && s.build.rawC) + ' -> served ' + (s.now && s.now.tempC) + ' from ONE request (no __raw re-request)', JSON.stringify([log.length, s.build]));
  const P2 = PS.createPointState(mkApp(), { now: () => NOW, fetchPx: stubPx(log) }); const s2 = await P2.state(33.1, 73.1); ok(!s2.build && log.length === 2, 'B2 without the kept provider body no "how it is made" and still no second request'); }

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
