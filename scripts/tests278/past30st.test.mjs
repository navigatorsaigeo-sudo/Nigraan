// v91.17.278 · FIX278 2 · the past-30-days station list: registered MACH stations only (an airport report the MACH database carries is
// not a row named "MACH station"), the status comes with the row, a station whose readings stop before the window's last day shows no
// highs and lows. Module test on a temporary MACH record (no server). usage: node scripts/tests278/past30st.test.mjs
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createPast30 } from '../../server/api/past30.mjs';
import { pktDay } from '../../server/api/pktday.mjs';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' · ' + d : '')); } };
const tmp = mkdtempSync(join(tmpdir(), 'p30-278-')); const db = join(tmp, 'db'), dataDir = join(tmp, 'data'); mkdirSync(db); mkdirSync(dataDir);
const REG = JSON.parse(readFileSync(join(APP, 'data', 'mach-fleet-stations.json'), 'utf8')).stations.filter((s) => ['Cantt', 'test_device', 'alaudin_road'].includes(s.key));
writeFileSync(join(db, 'stations.json'), JSON.stringify({ stations: [...REG.map((s) => ({ station_key: s.key, lat: s.lat, lng: s.lon })), { station_key: 'OPLA', lat: 31.5216, lng: 74.4036 }] }));
const D = 864e5, now = Date.now(), to = pktDay(now - D); const lines = ['time,station_key,source,temperature_c,dew_point_c,humidity_pct,pressure_hpa,solar_wm2,wind_speed_kmh,wind_gust_kmh,provider'];
const months = new Set();
for (let d = 25; d >= 1; d--) for (let h = 0; h < 24; h++) { const ms = Date.parse(pktDay(now - d * D) + 'T00:00:00Z') - 5 * 3600e3 + h * 3600e3 + 600e3; const t = new Date(ms).toISOString().replace('.000', ''); months.add(t.slice(0, 7));
  const T = 22 + 8 * Math.sin((h - 9) / 24 * 2 * Math.PI), sol = h >= 2 && h <= 11 ? 300 : 0;
  lines.push([t, 'Cantt', 'wu', T.toFixed(1), 12, 50, 990, sol, 5, 9, 'wu'].join(','));
  lines.push([t, 'OPLA', 'asos', (T + 0.5).toFixed(1), 12, 48, 1012, 0, 10, 15, 'asos'].join(','));
  if (d >= 12) lines.push([t, 'test_device', 'ecowitt', (T + 1).toFixed(1), 12, 50, 990, sol, 4, 8, 'ecowitt'].join(',')); }
for (const m of months) writeFileSync(join(db, 'mach_db_' + m + '.csv'), lines.filter((l, i) => i === 0 || l.slice(0, 7) === m).join('\n') + '\n');
const status = { Cantt: { status: 'checked' }, test_device: { status: 'silent', silentSince: new Date(now - 12 * D).toISOString(), statusNote: 'no reading for 12 days' }, alaudin_road: { status: 'checked' } };
const app = { fleet: { stations: () => REG, screen: () => ({ verdict: 'trusted', trusted: true }), screenRule: () => ({ radius_km: 25, dz_m: 500 }), elevOf: () => null,
  statusAll: () => REG.map((s) => ({ key: s.key, name: s.name, verdict: 'trusted', ...(status[s.key] || {}) })) } };
const P = createPast30(app, dataDir, { dbDir: db });
const j = await P.at({ lat: 31.5204, lon: 74.3587, days: 30 });
const S = j.stations || []; console.log('   rows: ' + S.map((s) => s.name + ' ' + s.tmaxC + '/' + s.tminC + ' ' + (s.status || '-')).join(' | '));
ok(j.ok && S.length === 2 && !S.some((s) => /MACH station/.test(s.name) || !s.name) && j.stationsNotInRegister === 1, 'P1 an airport report in the MACH record (OPLA) is not listed; only registered MACH stations, each with its name', 'not in the register: ' + j.stationsNotInRegister);
const od = S.find((s) => s.name === 'Old City, Lahore'), ca = S.find((s) => s.name === 'DHA, Lahore');
ok(od && od.current === false && od.tmaxC == null && od.tminC == null && od.days > 0 && od.status === 'silent' && od.silentSince, 'P2 a station silent for 12 days: no highest / lowest (its days are counted), the silent status comes with the row', JSON.stringify(od));
ok(ca && ca.current === true && ca.tmaxC != null && ca.tminC != null && ca.status === 'checked' && ca.lastDay === to, 'P3 a station reporting to the last day keeps its highest and lowest', JSON.stringify(ca));
ok(j.notes.some((n) => /stop before the last day of the window/.test(n)) && j.notes.some((n) => /Station rain is not shown/.test(n)), 'P4 the notes say why a dash is shown and why station rain is not');
ok(!S.some((s) => 'rainMm' in s && s.rainMm != null), 'P5 no station rain value is served');
console.log(`\n${fail ? 'FAIL' : 'PASS'} past30st278: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
