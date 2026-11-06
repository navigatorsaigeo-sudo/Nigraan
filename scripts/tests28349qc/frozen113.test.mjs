// v91.17.283.49 · 1.0.10 change set "station QC frozen check" · the evening of 2 Nov 2026 re-played through the REAL live poll
// (server/api/fleet.mjs createFleet -> stuckLive -> obsqc.mjs seriesCheck -> stuckscreen.mjs screenSeries), with a local mock of the
// MACH database's /v1/latest (each station's newest reading at the simulated clock) and the start-up seed read from NIGRAAN's own record.
// Owner report: after ~15:00 PKT the usable stations fell 60 -> 26 of 108, "T:frozen" 5 -> 47, while LAMHA's copy of the database took in
// 105-112 new readings every 10 min. Fixture: data/mach_20261102_evening.csv = the real rows of 24 stations from
// D:\NIGRAAN\nig\own\data\mach\db\obs_20261102.csv (00:00-19:00 UTC): 15 'wu' / ecowitt feeds the screen flagged and 9 live consoles
// (wu_api, ecowitt, qm) in the same cities. What it pins:
//   1 a repeated poll of the SAME reading timestamp never lengthens a run (polling every 2 min gives the verdicts of polling every 10 min)
//   2 the flagged feeds are frozen RECORDS: the new readings carry new timestamps but the identical T / Td / RH / P (the 'wu' scrape stops
//     updating at ~14:30 PKT; 0 % of its readings change 19-23 PKT) - the screen catches every one of them by 18:37 PKT
//   3 no live console in the fixture is flagged frozen (they move by 0.1 C within the measured run limit)
//   4 at 18:37 PKT the frozen feeds read +2 to +7 C above the live consoles of their city: passing them would have put afternoon
//     temperatures into the evening layer (the 16 Oct / 1 Nov fault)
//   5 the run limit in force (stuckscreen.mjs FROZEN_MIN) is the one re-measured on 6 Oct - 2 Nov in data/obs-qc-params.json persist_evidence
// usage: node scripts/tests28349qc/frozen113.test.mjs      exit 0 all pass, 1 a failure
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)), APP = join(HERE, '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + d : '')); } };
const imp = (rel) => import(pathToFileURL(join(APP, rel)).href);

/* the fixture: real database rows */
const FIX = join(HERE, 'data', 'mach_20261102_evening.csv'); const TXT = readFileSync(FIX, 'utf8');
const L = TXT.split(/\r?\n/).filter(Boolean), H = L[0].split(','); const ix = (c) => H.indexOf(c);
const num = (x) => (x === '' || x == null || !Number.isFinite(+x) ? null : +x);
const BY = new Map();
for (const l of L.slice(1)) { const c = l.split(','); const r = { key: c[ix('stationKey')], ms: Date.parse(c[ix('time')]), time: c[ix('time')], src: c[ix('source')], T: num(c[ix('temperatureC')]), Td: num(c[ix('dewPointC')]), RH: num(c[ix('humidityPct')]), P: num(c[ix('pressureHpa')]), S: num(c[ix('solarWm2')]), W: num(c[ix('windSpeedKmh')]), G: num(c[ix('windGustKmh')]) };
  (BY.get(r.key) || BY.set(r.key, []).get(r.key)).push(r); }
for (const a of BY.values()) a.sort((x, y) => x.ms - y.ms);
const LIVE = ['mach8', 'i_9_2', 'e_7_4', 'h12', 'adyala', 'shaheed', 'sanam', 'park', 'al_jazari'];
const FROZEN = [...BY.keys()].filter((k) => !LIVE.includes(k));

/* the simulated clock and the mock database */
let NOW = Date.parse('2026-11-02T09:57:00Z');   /* the 14:57 PKT restart of 2 Nov (server-console.log: "proxy: switched 8792 -> 8791") */
const realNow = Date.now; Date.now = () => NOW;
const srv = createServer((req, res) => {
  if (!req.url.startsWith('/v1/latest')) { res.writeHead(404); res.end('{}'); return; }
  const st = []; for (const [k, a] of BY) { let r = null; for (let i = a.length - 1; i >= 0; i--) if (a[i].ms <= NOW) { r = a[i]; break; } if (!r) continue;
    st.push({ key: k, time: r.time, provider: r.src, metrics: { temperatureC: r.T, dewPointC: r.Td, humidityPct: r.RH, pressureHpa: r.P, solarWm2: r.S, windSpeedKmh: r.W, windGustKmh: r.G } }); }
  res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ updatedAt: new Date(NOW).toISOString(), stations: st })); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;

async function replay(stepMin, untilIso) {
  const T = mkdtempSync(join(tmpdir(), 'fz113-')), RT = join(T, 'nigraan-local'), D = join(RT, 'data'), OWN = join(T, 'own', 'data', 'mach', 'db');
  mkdirSync(D, { recursive: true }); mkdirSync(OWN, { recursive: true });
  for (const f of ['mach-fleet-stations.json', 'mach-siting.json', 'obs-qc-params.json', 'obs-qc-marks.json', 'fleet-range-screen.json', 'station-shield-rule.json', 'mach-rain-holds.json']) { try { copyFileSync(join(APP, 'data', f), join(D, f)); } catch (_) {} }
  writeFileSync(join(OWN, 'obs_20261102.csv'), TXT);   /* the start-up seed reads NIGRAAN's own record (v283.44 seedSeries) */
  writeFileSync(join(RT, 'obs.key'), 'base=http://127.0.0.1:' + port + '\nkey=TEST-NOT-A-KEY\n');
  process.env.NIGRAAN_FLEET = '0'; delete process.env.NIGRAAN_FLEET_SEED; delete process.env.NIGRAAN_OWN_DIR;
  const { createFleet } = await import(pathToFileURL(join(APP, 'server/api/fleet.mjs')).href + '?r=' + stepMin);   /* a fresh module per replay */
  NOW = Date.parse('2026-11-02T09:57:00Z'); const FL = createFleet({}, RT, D); delete process.env.NIGRAAN_FLEET;
  const out = new Map(); const end = Date.parse(untilIso);
  for (NOW = Date.parse('2026-11-02T09:57:00Z') + stepMin * 6e4; NOW <= end; NOW += stepMin * 6e4) {
    await FL.poll(); const pkt = new Date(NOW + 5 * 3600e3).toISOString().slice(11, 16);
    const rows = (FL.latest({}).rows || []).filter((r) => BY.has(r.key));
    out.set(pkt, { seed: FL.status().seriesSeed, rows, screened: FL.status().screened }); }
  try { rmSync(T, { recursive: true, force: true }); } catch (_) {}
  return out;
}
/* the T verdict of a row: fleet latest() hides r.qcv; the screened counts carry 'T:frozen' and a failed temperature is served as null */
const r10 = await replay(10, '2026-11-02T13:47:00Z');
const r2 = await replay(2, '2026-11-02T13:47:00Z');
const at = (R, pkt) => R.get(pkt);
const p10 = at(r10, '18:37'), p2 = at(r2, '18:37');
ok(p10 && p10.seed && p10.seed.stations >= 20, 'the start-up seed read the own record (stations seeded)', JSON.stringify(p10 && p10.seed));
const tOut = (p) => new Set(p.rows.filter((r) => r.tempC == null).map((r) => r.key));
const frz = (p) => (p.screened && p.screened.values && p.screened.values['T:frozen']) || 0;
/* 1 distinct reading timestamps only */
let same = true; const diffs = []; for (const [pkt, a] of r10) { const b = r2.get(pkt); if (!b) continue; const A = [...tOut(a)].sort().join(','), B = [...tOut(b)].sort().join(','); if (A !== B || frz(a) !== frz(b)) { same = false; diffs.push(pkt); } }
ok(same && r10.size > 20, '1 polling every 2 min (the same reading re-polled up to 5 times) gives the verdicts of polling every 10 min at every shared poll', diffs.slice(0, 5).join(' '));
/* 2 the flagged feeds are frozen records and every one is caught by 18:37 PKT */
const cut = Date.parse('2026-11-02T13:37:00Z');
const recRun = (k) => { const a = BY.get(k).filter((r) => r.ms <= cut); const s = (r) => [r.T, r.Td, r.RH, r.P].join('|'); let j = a.length - 1; while (j > 0 && s(a[j - 1]) === s(a[a.length - 1])) j--; return (a[a.length - 1].ms - a[j].ms) / 6e4; };
const tRun = (k) => { const a = BY.get(k).filter((r) => r.ms <= cut); let j = a.length - 1; while (j > 0 && a[j - 1].T === a[a.length - 1].T) j--; return (a[a.length - 1].ms - a[j].ms) / 6e4; };
const wholeFrozen = FROZEN.filter((k) => recRun(k) > 120);
ok(wholeFrozen.length >= 10, '2a ' + wholeFrozen.length + ' of the ' + FROZEN.length + ' flagged feeds carry ONE identical record (T, Td, RH, P) for more than 120 min of new timestamps at 18:37 PKT', wholeFrozen.map((k) => k + ' ' + Math.round(recRun(k))).join(', '));
const caught = tOut(p10); const missed = FROZEN.filter((k) => tRun(k) > 120 && !caught.has(k));
ok(!missed.length, '2b every feed whose temperature is unchanged for more than 120 min is withheld at 18:37 PKT', missed.join(', ') || [...caught].filter((k) => FROZEN.includes(k)).length + ' withheld');
/* 3 the live consoles pass */
const liveOut = LIVE.filter((k) => k !== 'al_jazari' && caught.has(k));
ok(!liveOut.length, '3 no live console (mach8 wu_api; i_9_2, e_7_4 ecowitt; h12, adyala, shaheed, sanam, park qm) loses its temperature at 18:37 PKT', liveOut.join(', '));
/* 4 the frozen feeds against the live consoles of their city at 18:37 PKT */
const last = (k) => { const a = BY.get(k).filter((r) => r.ms <= cut); return a.length ? a[a.length - 1] : null; };
const med = (a) => { const q = a.slice().sort((x, y) => x - y); const m = q.length >> 1; return q.length % 2 ? q[m] : (q[m - 1] + q[m]) / 2; };
const isb = med(['mach8', 'i_9_2', 'e_7_4', 'h12', 'adyala', 'shaheed', 'sanam', 'park'].map((k) => last(k).T));
const isbFrozen = ['Garden', 'Rawal', 'E11', 'Bad', 'Shah', 'nutech', 'Davis'];
const dep = isbFrozen.map((k) => last(k).T - isb);
ok(dep.every((d) => d >= 2), '4 Islamabad-Rawalpindi frozen feeds read ' + Math.min(...dep).toFixed(1) + '..+' + Math.max(...dep).toFixed(1) + ' C above the median of 8 live consoles (' + isb.toFixed(1) + ' C) at 18:37 PKT');
/* 5 the run limit in force is the measured one */
const { STUCK_RULE } = await imp('server/api/stuckscreen.mjs');
const EV = JSON.parse(readFileSync(join(APP, 'data', 'obs-qc-params.json'), 'utf8')).persist_evidence;
const tq = EV && EV.T && EV.T.windows && EV.T.windows['6 Oct - 2 Nov 2026'];
ok(!!tq && Math.abs(tq.evening_night_q999_min - STUCK_RULE.FROZEN_MIN) <= 15 && Math.abs(tq.all_q999_min - STUCK_RULE.FROZEN_MIN) <= 15,
  '5 FROZEN_MIN ' + STUCK_RULE.FROZEN_MIN + ' min is within one reporting step (10-15 min) of the measured 99.9th percentile of genuine unchanged-temperature runs, all hours and 15-06 PKT (persist_evidence)', tq ? JSON.stringify({ all: tq.all_q999_min, eveningNight: tq.evening_night_q999_min }) : 'no persist_evidence.T');
/* the counts of the replay (for the build notes) */
console.log('replay T:frozen at 10-min polls: ' + [...r10].filter(([p]) => /[0-9]7$/.test(p)).map(([p, v]) => p + ' ' + frz(v)).join(' | '));
Date.now = realNow; srv.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
