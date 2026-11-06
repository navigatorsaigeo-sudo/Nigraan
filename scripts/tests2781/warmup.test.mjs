// v91.17.278.1 · FIX2781 · the warm-up window after a server start: before the MACH fleet's first poll has finished, no station is
// called "silent, no reading received" (status pending: no status, no note), a past-30-days answer built then is served but not kept,
// and once the first poll has finished the next answer carries each station's real status and is kept as before. Live defect 17 Oct
// 19:36-19:42 PKT (every Lahore station "No reading received from this station yet." for 5 min after the v278 deploy).
// Module test on a temporary fleet and MACH record (no server). usage: node scripts/tests2781/warmup.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createPast30 } from '../../server/api/past30.mjs';
import { pktDay } from '../../server/api/pktday.mjs';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { createFleet } = await import(join(APP, 'server/api/fleet.mjs'));
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + String(d).slice(0, 300) : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' · ' + String(d).slice(0, 600) : '')); } };
const tmp = mkdtempSync(join(tmpdir(), 'w2781-')); const NL = join(tmp, 'nigraan-local'), dataDir = join(NL, 'data'), db = join(tmp, 'db'); mkdirSync(dataDir, { recursive: true }); mkdirSync(db);
/* the three registered Lahore stations of the live report (Lahore Cantt, DHA, Bahria Town area) from the real registry */
const REG = JSON.parse(readFileSync(join(APP, 'data', 'mach-fleet-stations.json'), 'utf8')).stations.filter((s) => ['Cantt', 'test_device', 'alaudin_road'].includes(s.key));
writeFileSync(join(dataDir, 'mach-fleet-stations.json'), JSON.stringify({ stations: REG }));
writeFileSync(join(dataDir, 'mach-siting.json'), JSON.stringify({ rule: JSON.parse(readFileSync(join(APP, 'data', 'mach-siting.json'), 'utf8')).rule, stations: {} }));
writeFileSync(join(dataDir, 'mach-running-bias.json'), JSON.stringify({ version: 'test', stations: {} }));
/* v91.17.283.28 · the poll asks the MACH database with NIGRAAN's own key (obs.key, /v1/latest; the LAMHA copy path is retired): a local
   stand-in answers it below */
writeFileSync(join(db, 'stations.json'), JSON.stringify({ stations: REG.map((s) => ({ station_key: s.key, lat: s.lat, lng: s.lon })) }));
const D = 864e5, now = Date.now(); const lines = ['time,station_key,source,temperature_c,dew_point_c,humidity_pct,pressure_hpa,solar_wm2,wind_speed_kmh,wind_gust_kmh,provider']; const months = new Set();
for (let d = 25; d >= 1; d--) for (let h = 0; h < 24; h++) { const ms = Date.parse(pktDay(now - d * D) + 'T00:00:00Z') - 5 * 3600e3 + h * 3600e3 + 600e3; const t = new Date(ms).toISOString().replace('.000', ''); months.add(t.slice(0, 7));
  const T = 22 + 8 * Math.sin((h - 9) / 24 * 2 * Math.PI), sol = h >= 2 && h <= 11 ? 300 : 0;
  for (const k of ['Cantt', 'alaudin_road']) lines.push([t, k, 'wu', T.toFixed(1), 12, 50, 990, sol, 5, 9, 'wu'].join(','));
  if (d >= 12) lines.push([t, 'test_device', 'ecowitt', (T + 1).toFixed(1), 12, 50, 990, sol, 4, 8, 'ecowitt'].join(',')); }
for (const m of months) writeFileSync(join(db, 'mach_db_' + m + '.csv'), lines.filter((l, i) => i === 0 || l.slice(0, 7) === m).join('\n') + '\n');
/* the copy the first poll reads: Cantt and alaudin_road reporting now, test_device last seen 12 days ago */
const nowIso = new Date(now - 5 * 60e3).toISOString();
const rd = (T) => ({ time: nowIso, provider: 'wu', temperatureC: T, humidityPct: 50, dewPointC: 12, windSpeedKmh: 5, windGustKmh: 9, pressureHpa: 990, solarWm2: 300 });
/* the database's latest answer the first poll reads: Cantt and alaudin_road reporting now, test_device last seen 12 days ago */
const met = (r) => ({ temperatureC: r.temperatureC, humidityPct: r.humidityPct, dewPointC: r.dewPointC, windSpeedKmh: r.windSpeedKmh, windGustKmh: r.windGustKmh, pressureHpa: r.pressureHpa, solarWm2: r.solarWm2 });
const LATEST = { updatedAt: nowIso, stations: [{ key: 'Cantt', time: nowIso, provider: 'wu', metrics: met(rd(27.1)) }, { key: 'alaudin_road', time: nowIso, provider: 'wu', metrics: met(rd(27.4)) },
  { key: 'test_device', time: new Date(now - 12 * D).toISOString(), provider: 'ecowitt', metrics: met({ ...rd(23), solarWm2: 0 }) }] };
const { createServer } = await import('node:http');
const SRV = createServer((q, s) => { if (q.url.startsWith('/v1/latest') && q.headers['x-api-key'] === 'test') { s.writeHead(200, { 'content-type': 'application/json' }); s.end(JSON.stringify(LATEST)); } else { s.writeHead(404); s.end('{}'); } });
await new Promise((r) => SRV.listen(0, '127.0.0.1', r)); SRV.unref();
writeFileSync(join(NL, 'obs.key'), 'base=http://127.0.0.1:' + SRV.address().port + '\nkey=test\n');
process.env.NIGRAAN_FLEET = '0'; const F = createFleet({}, NL, dataDir); delete process.env.NIGRAAN_FLEET;   /* no timer poll: the test polls by hand */
const app = { fleet: F };
const P = createPast30(app, join(tmp, 'p30data'), { dbDir: db, cacheMs: 300e3 }); mkdirSync(join(tmp, 'p30data'));
const LAHORE = { lat: 31.5204, lon: 74.3587, days: 30 };
const show = (j) => (j.stations || []).map((s) => s.name + ':' + (s.status || '-')).join(' | ');

/* 1 · warm-up: the first poll has not finished */
ok(F.statusReady() === false, 'W1 before the first poll the fleet status is not ready');
const a0 = F.statusAll(); ok(a0.length === REG.length && a0.every((x) => x.pending === true && x.status === null && x.statusNote === null), 'W2 statusAll before the first poll: every registered station pending, no status, no note', JSON.stringify(a0));
ok(!JSON.stringify(a0).includes('No reading received'), 'W3 no station is said to have sent no reading before the first poll');
const j1 = await P.at(LAHORE);
ok(j1.ok && j1.stations.length === 3 && j1.stations.every((s) => !('status' in s) && !('statusNote' in s)), 'W4 past30 in the warm-up: the Lahore rows carry no status', show(j1));
ok(!JSON.stringify(j1).includes('No reading received') && !/silent/i.test(JSON.stringify(j1.stations)), 'W5 past30 in the warm-up never says "No reading received" or silent');
const j2 = await P.at(LAHORE); ok(j2 !== j1, 'W6 the warm-up answer is not kept (the next ask reads again)');
/* 2 · the first poll finishes */
await F.poll();
ok(F.statusReady() === true, 'W7 after the first poll the fleet status is ready');
const a1 = Object.fromEntries(F.statusAll().map((x) => [x.key, x]));
ok(!a1.Cantt.pending && a1.Cantt.status && a1.Cantt.status !== 'silent' && !a1.alaudin_road.pending && a1.alaudin_road.status !== 'silent', 'W8 reporting stations have their real status after the first poll', JSON.stringify([a1.Cantt.status, a1.alaudin_road.status]));
ok(a1.test_device.status === 'silent' && /^No reading since /.test(a1.test_device.statusNote) && a1.test_device.silentSince, 'W9 a station silent for 12 days is silent, with since when', JSON.stringify(a1.test_device));
const j3 = await P.at(LAHORE); const by = Object.fromEntries(j3.stations.map((s) => [s.name, s]));
ok(j3.stations.every((s) => s.status) && j3.stations.filter((s) => s.status === 'silent').length === 1 && j3.stations.every((s) => s.status !== 'silent' || /No reading since/.test(s.statusNote)), 'W10 past30 after the first poll: every row carries its status; only the 12-day-silent station is silent', show(j3));
const fc = Object.fromEntries(F.statusAll().map((x) => [x.name, x.status])); ok(j3.stations.every((s) => s.status === fc[s.name]), 'W11 each past30 row says what the fleet check says for that station', JSON.stringify(fc));
const j4 = await P.at(LAHORE); ok(j4 === j3, 'W12 an answer built with the status ready is kept as before (cacheMs)');
/* 3 · the poll is off (no key / NIGRAAN_FLEET=0): no status will come; nothing is called silent and answers are kept */
rmSync(join(NL, 'obs.key')); const F0 = createFleet({}, NL, dataDir); const P0 = createPast30({ fleet: F0 }, join(tmp, 'p30data'), { dbDir: db, cacheMs: 300e3 });
const k1 = await P0.at(LAHORE), k2 = await P0.at(LAHORE);
ok(F0.statusReady() === true && F0.statusAll().every((x) => x.pending && x.status === null) && k1.stations.every((s) => !('status' in s)) && k2 === k1, 'W13 poll off: status ready (nothing to wait for), stations pending with no status, answer kept', show(k1));
/* 4 · a station the registry gains after the first poll has no row yet: pending until the next poll, and the answer is not kept */
const F2stations = F.stations(); F2stations.push({ ...REG[0], key: 'later_key', name: 'Later station, Lahore', no: 999 });
const lat2 = F.statusAll().find((x) => x.key === 'later_key'); ok(lat2 && lat2.pending === true && lat2.status === null && F.statusReady() === false, 'W14 a station with no poll row yet is pending, not silent, and the status is not ready until a poll holds it', JSON.stringify(lat2));
await F.poll(); ok(F.statusReady() === true && F.statusAll().find((x) => x.key === 'later_key').status === 'silent', 'W15 the next poll holds it (never in the copied record: silent from then on)', JSON.stringify(F.statusAll().find((x) => x.key === 'later_key')));
rmSync(tmp, { recursive: true, force: true });
console.log(`\n${fail ? 'FAIL' : 'PASS'} warmup2781: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
