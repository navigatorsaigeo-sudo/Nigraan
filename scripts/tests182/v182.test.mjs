/* v91.17.182 · the MACH fleet read from AGN's observation database: one call, metric values taken as stated, Apple rows kept out of
   calibration, the key only in the header, and the per-station reads as the fallback.  usage: node scripts/tests182/v182.test.mjs */
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path'; import { fileURLToPath } from 'node:url'; import { tmpdir } from 'node:os';
import { createFleet } from '../../server/api/fleet.mjs';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..'); let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('  FAIL', m); } };
const KEY = 'test-key-0123456789abcdef'; const seen = []; let dbDown = false;
const REG = JSON.parse(readFileSync(join(APP, 'data', 'mach-fleet-stations.json'), 'utf8')).stations.filter((s) => s.lat != null);
const now = new Date(Date.now() - 4 * 60e3).toISOString();
const met = (t, extra = {}) => ({ temperatureC: t, dewPointC: t - 8, humidityPct: 60, windSpeedKmh: 5, windGustKmh: 9, pressureHpa: null, precipRateMmHr: 0, precipTotalMm: 0, solarWm2: 300, uvIndex: 3, windDirectionText: 'N', ...extra });
const srv = createServer((req, res) => {
  seen.push({ url: req.url, key: req.headers['x-api-key'] || null });
  if (req.url.startsWith('/obs/v1/latest')) {
    if (dbDown) { res.writeHead(500); return res.end('{}'); }
    const st = REG.map((s, i) => ({ key: s.key, lat: s.lat, lng: s.lon, provider: i === 1 ? 'apple_qm' : 'wu', time: now, metrics: met(i === 0 ? 35 : 20 + (i % 9) * 0.37, i === 0 ? {} : { humidityPct: 50 + (i % 7), dewPointC: 8 + (i % 5) * 0.21 }) }));
    res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ updatedAt: now, count: st.length, stations: st }));
  }
  if (req.url.startsWith('/api/weather/latest')) { const k = new URL(req.url, 'http://x').searchParams.get('location');
    res.writeHead(200, { 'content-type': 'application/json' }); const i = REG.findIndex((s) => s.key === k); return res.end(JSON.stringify({ stationKey: k, lastUpdated: now, temperature: (18 + i * 0.1).toFixed(1) + ' °C', humidity: '55 %', dewPoint: (8.6 + i * 0.1).toFixed(1) + ' °C' })); }
  res.writeHead(404); res.end();
}).listen(0);
await new Promise((r) => srv.on('listening', r)); const port = srv.address().port;
const root = join(mkdtempSync(join(tmpdir(), 'fleet182-')), 'nigraan-local'); mkdirSync(root, { recursive: true });
writeFileSync(join(root, 'obs.key'), `base=http://127.0.0.1:${port}/obs\r\nkey=${KEY}\r\n`);
writeFileSync(join(root, 'fleet.key'), `base=http://127.0.0.1:${port}\n`);
process.env.NIGRAAN_FLEET_SHEETS = '0';
const F = createFleet({}, root, join(APP, 'data'));
await F.poll(); let st = F.status(), L = F.latest();
ok(st.db && st.db.ok === true && st.db.from === REG.length, 'one database call read every located station (' + (st.db && st.db.from) + '/' + REG.length + ')');
ok(seen.filter((x) => x.url.startsWith('/obs/')).length === 1 && seen.every((x) => !x.url.includes(KEY)), 'one request; the key never in a URL');
ok(seen[0].key === KEY, 'key sent as the X-API-Key header');
ok(!JSON.stringify(st).includes(KEY) && !JSON.stringify(L).includes(KEY), 'status and latest never carry the key');
const r0 = L.rows.find((r) => r.key === REG[0].key), r1 = L.rows.find((r) => r.key === REG[1].key);
ok(r0 && (Math.abs(r0.tempC - 35) < 1e-9 || r0.qc.includes('value-failed')) && !r0.qc.includes('units-unverified') && !r0.qc.includes('imperial-converted'), 'metric 35 °C with no pressure taken as stated, not converted (v91.17.283.14: 15 C above its neighbours, the value itself may fail the buddy check) ('  + (r0 && r0.qc.join('/')) + ')');
ok(r1 && !r1.usable && r1.qc.includes('forecast-not-station'), 'apple_qm row kept out of calibration');
ok(L.rows.filter((r) => r.usable).length >= REG.length - 3, 'the rest usable (' + L.rows.filter((r) => r.usable).length + ')');
process.env.NIGRAAN_FLEET_APPLE = '1'; await F.poll(); L = F.latest();
ok(L.rows.find((r) => r.key === REG[1].key).usable, 'NIGRAAN_FLEET_APPLE=1 keeps the Apple row');
delete process.env.NIGRAAN_FLEET_APPLE; dbDown = true; seen.length = 0; await F.poll(); st = F.status(); L = F.latest();
ok(st.db.ok === false && seen.some((x) => x.url.startsWith('/api/weather/latest')) && L.rows.filter((r) => r.usable).length > 0, 'database down: per-station reads used (' + L.rows.filter((r) => r.usable).length + ' usable)');
ok(seen.filter((x) => x.url.startsWith('/api/weather/latest')).every((x) => x.key == null), 'the database key is not sent to the per-station route');
/* the backfill: 16 days of database readings paired with the basis, Apple and shared-id stations left out (in a temporary data folder) */
const dd = mkdtempSync(join(tmpdir(), 'fleet182d-')); const SUB = REG.slice(0, 8);
writeFileSync(join(dd, 'mach-fleet-stations.json'), JSON.stringify({ stations: SUB }));
writeFileSync(join(dd, 'mach-running-bias.json'), JSON.stringify({ stations: { [SUB[1].key]: { lat: SUB[1].lat, lon: SUB[1].lon, elevM: 500, hours: { '2026-10-01T00': [20, 0, 10, 0] } } } }));
const meta = SUB.map((s, i) => ({ station_key: s.key, provider: i === 1 ? 'apple_qm' : 'wu', provider_station_id: i === 2 || i === 3 ? 'SAME' : 'ID' + i, lat: s.lat, lng: s.lon }));
const H0 = Math.floor(Date.now() / 3600e3) * 3600e3 - 17 * 864e5;
const srv2 = createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); const J = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/obs/v1/latest') { dbDown = false; return J({ updatedAt: now, stations: [] }); }
  if (u.pathname === '/obs/v1/stations') return J({ stations: meta });
  const m = u.pathname.match(/^\/obs\/v1\/stations\/([^/]+)\/observations$/);
  if (m) { const i = SUB.findIndex((s) => s.key === decodeURIComponent(m[1])); const from = Date.parse(u.searchParams.get('from')); const o = [];
    for (let t = H0; t < Date.now(); t += 3600e3) if (t >= from) o.push({ time: new Date(t + 2 * 60e3).toISOString(), source: 'wu', metrics: { temperatureC: 21 + i * 0.3 + (t % 7200e3 ? 0.1 : 0), humidityPct: 50, dewPointC: +(10 + i * 0.3).toFixed(1) } });
    return J({ observations: o, truncated: false }); }
  if (u.pathname === '/px/v1/forecast') { const time = [], T = [], D = []; for (let t = H0 - 864e5; t < Date.now() + 2 * 864e5; t += 3600e3) { time.push(new Date(t).toISOString().slice(0, 16)); T.push(20); D.push(9); }
    return J({ elevation: 500, hourly: { time, temperature_2m: T, dew_point_2m: D } }); }
  res.writeHead(404); res.end();
}).listen(0); await new Promise((r) => srv2.on('listening', r)); const p2 = srv2.address().port;
const root2 = join(mkdtempSync(join(tmpdir(), 'fleet182r-')), 'nigraan-local'); mkdirSync(root2, { recursive: true });
writeFileSync(join(root2, 'obs.key'), `base=http://127.0.0.1:${p2}/obs\nkey=${KEY}\n`);
process.env.PORT = String(p2); process.env.NIGRAAN_FLEET = '0';
const F2 = createFleet({}, root2, dd); const bf = await F2.backfill();
const RB2 = JSON.parse(readFileSync(join(dd, 'mach-running-bias.json'), 'utf8')).stations;
ok(bf.stations === SUB.length - 1 && bf.skipped.apple === 1 && !bf.skipped['shared-source-id'], 'backfill: ' + bf.stations + ' stations; Apple left out, the two shared-id stations read (v91.17.283.14: their identical values fail obsqc copy check, the stations stay) (' + JSON.stringify(bf.skipped) + ')');
ok(!RB2[SUB[1].key] && bf.removed.includes(SUB[1].key), 'earlier pairs of the Apple station removed');
const h0 = RB2[SUB[0].key] ? Object.keys(RB2[SUB[0].key].hours).length : 0;
ok(h0 >= 15 * 24 && h0 <= 16 * 24 + 1, 'about 16 days of hours held per station (' + h0 + ')');
const v0 = RB2[SUB[0].key] && Object.values(RB2[SUB[0].key].hours)[5];
ok(v0 && Math.abs(v0[1] - (v0[0] - 20)) < 0.06 && Math.abs(v0[3] - (v0[2] - 9)) < 0.06, 'residual = reading minus basis, temperature and dew point (' + JSON.stringify(v0) + ')');
srv2.close();
srv.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
