// v91.17.283.49 · 1.0.10 data item 4 · a failed MACH poll never replaces a good one. Owner report: the place record of 2 Nov 15:54 PKT
// (report NIGRAAN-SITE-20261102-2438b617, stations.at 10:48:49 UTC) said "0 reporting now within 25 km · 0 of 108 across the network"
// (fleet: offline 108) while the map showed station temperatures minutes old. Laptop server-console.log: the database call failed on
// alternate polls and the per-station fallback (the retired API) returned no reading for any station ("0/108 usable (0 from sheet tabs,
// 108 from the API) · dead 108, noReading 108"); that empty poll replaced the good one. Re-played here with a local mock of the MACH
// database: poll 1 good, poll 2 database down + empty fallback. Fails on 1.0.9 (every station offline after poll 2, the customer list
// empty). Then the live window passes with no good poll: every surface says "station data unavailable since HH:MM PKT".
// usage: node scripts/tests28349dat/stations113.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + d : '')); } };
const imp = (rel) => import(pathToFileURL(join(APP, rel)).href);
const REG = JSON.parse((await import('node:fs')).readFileSync(join(APP, 'data', 'mach-fleet-stations.json'), 'utf8')).stations;
let mode = 'good';
const srv = createServer((req, res) => {
  if (req.url.startsWith('/v1/latest') && mode === 'good') { const t = new Date(Date.now() - 4 * 60e3).toISOString();
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ updatedAt: t, stations: REG.map((s, i) => ({ key: s.key, time: t, provider: 'wu', metrics: { temperatureC: 20 + (i % 7) * 0.3 + 0.13, humidityPct: 50 + (i % 5), dewPointC: 9.1, windSpeedKmh: 4, windGustKmh: 7, pressureHpa: 1012 - (i % 9), solarWm2: 300 } })) })); return; }
  res.writeHead(mode === 'good' ? 404 : 503); res.end('{}'); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const port = srv.address().port;
const T = mkdtempSync(join(tmpdir(), 'st113-')), D = join(T, 'nigraan-local', 'data'), RT = join(T, 'nigraan-local'); mkdirSync(D, { recursive: true });
for (const f of ['mach-fleet-stations.json', 'mach-siting.json', 'obs-qc-params.json', 'obs-qc-marks.json', 'fleet-range-screen.json', 'station-shield-rule.json']) { try { copyFileSync(join(APP, 'data', f), join(D, f)); } catch (_) {} }
writeFileSync(join(RT, 'obs.key'), 'base=http://127.0.0.1:' + port + '\nkey=TEST-NOT-A-KEY\n'); writeFileSync(join(RT, 'fleet.key'), 'base=http://127.0.0.1:' + port + '\ntoken=TEST\n');
process.env.NIGRAAN_FLEET = '0'; process.env.NIGRAAN_FLEET_SEED = '0';
const { createFleet } = await imp('server/api/fleet.mjs');
const FL = createFleet({}, RT, D); delete process.env.NIGRAAN_FLEET;
const notOffline = (c) => c.fleet.total - c.fleet.offline;
await FL.poll(); const c1 = FL.counts({ lat: 33.66443, lon: 73.08339 });
ok(c1.fleet.total === REG.length && notOffline(c1) === REG.length, 'poll 1 (database up): every station has a fresh reading (none offline)', JSON.stringify(c1.fleet));
const near1 = c1.near.total - c1.near.offline;
mode = 'down'; await FL.poll(); const c2 = FL.counts({ lat: 33.66443, lon: 73.08339 });
ok(notOffline(c2) === REG.length && c2.near.total - c2.near.offline === near1, 'poll 2 (database down, fallback empty): the good poll is kept, no station turns offline', JSON.stringify(c2.fleet));
ok(c2.ready === true && c2.feed && c2.feed.ok === true && c2.feed.lastFailAt && !c2.unavailable, 'within the live window: counted as before, the failure recorded (feed.lastFailAt)', JSON.stringify(c2.feed || {}).slice(0, 160));
const L2 = FL.latest({ customer: true }), L2op = FL.latest({});
ok(L2op.rows.length === REG.length && L2op.rows.every((r) => r.lastUpdated), 'operator list still holds the readings of the good poll');
/* the live window passes with no good poll: unavailable, nothing counted as reporting now */
const later = Date.now() + 61 * 60e3; const c3 = FL.counts({ lat: 33.66443, lon: 73.08339, nowMs: later });
ok(c3.ready === false && /^station data unavailable since \d\d:\d\d PKT$/.test(c3.unavailable || '') && c3.fleet.reportingNow === 0, 'after the live window with no good poll: "station data unavailable since HH:MM PKT", none reporting now', c3.unavailable);
const hm = new Date(Date.parse(c2.feed.lastGoodAt) + 5 * 3600e3).toISOString().slice(11, 16); ok(c3.unavailable && c3.unavailable.includes(hm), 'the time named is the last good poll (PKT)', hm);
mode = 'good'; await FL.poll(); const c4 = FL.counts({}); ok(c4.ready === true && !c4.unavailable && notOffline(c4) === REG.length, 'a good poll again: counted, nothing unavailable');
srv.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
