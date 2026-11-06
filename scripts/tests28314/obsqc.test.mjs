/* v91.17.283.14 · unit tests of the value-level quality control (server/api/obsqc.mjs): one synthetic case per check, the owner's rule
   (a failing value drops that value only), the copy check, the buddy check with height correction and with the forecast residual,
   the background check, the owner mark, the hourly pick, the command line, and that no consumer reads a station list any more.
   node scripts/tests28314/obsqc.test.mjs        exit 0 all pass, 1 a failure
   v91.17.283.16: the command-line case uses a MACH id (a partner EWS id, aws:..., is no longer buddy-checked: tests28316/ewsnet.test.mjs) */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as Q from '../../server/api/obsqc.mjs';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const P = Q.loadParams(join(APP, 'data')); P.marks = [];
let fails = 0, n = 0; const ok = (c, m) => { n++; if (c) console.log('PASS ' + m); else { fails++; console.log('FAIL ' + m); } };
const H = 3600e3, T0 = Date.UTC(2026, 9, 10, 0);
const test = (r) => r.f || {};

/* 1 gross range (Zahumensky 2004 limits) */
{ const r = { ms: T0, T: 75, RH: 50 }; Q.grossCheck(r, P); ok(test(r).T && test(r).T.test === 'gross-range' && !test(r).RH, 'gross: 75 C fails the temperature only, humidity stays'); }
{ const r = { ms: T0, W: -3, T: 20 }; Q.grossCheck(r, P); ok(test(r).W && test(r).W.test === 'gross-range' && !test(r).T, 'gross: a negative wind fails the wind only'); }
/* 1b climatological range against the forecast hour */
{ const r = { ms: T0, T: 40 }; Q.grossCheck(r, P, { bgT: 20 }); ok(test(r).T && test(r).T.test === 'climate-range', 'climate: 20 C above the served forecast fails (data/fleet-range-screen.json residual range)'); }
{ const r = { ms: T0, T: 24 }; Q.grossCheck(r, P, { bgT: 20 }); ok(!test(r).T, 'climate: 4 C above the forecast passes'); }
/* 3 internal consistency */
{ const r = { T: 20, Td: 23, RH: 80 }; Q.internalCheck(r, P); ok(test(r).Td && test(r).RH && !test(r).T, 'internal: dew point above the temperature fails dew point and humidity, the temperature stays'); }
{ const r = { T: 30, Td: 10, RH: 90 }; Q.internalCheck(r, P); ok(test(r).Td && test(r).Td.test === 'internal' && !test(r).T, 'internal: a reported dew point 15 C from the one implied by T and RH fails the humidity pair'); }
{ const r = { T: 20, RH: 1 }; Q.internalCheck(r, P); ok(test(r).RH && !test(r).T, 'internal: RH 1 % is a sensor floor (Gulzar-e-Quaid): humidity fails, temperature stays'); }
{ const r = { T: 36, RH: 95 }; Q.internalCheck(r, P); ok(test(r).T && test(r).RH, 'internal: an implied dew point above 32 C fails the pair (it cannot say which sensor is wrong)'); }
{ const r = { T: 20, Tmax: 18 }; Q.internalCheck(r, P); ok(test(r).T, 'internal: T above the reported Tmax fails'); }
{ const r = { W: 20, G: 10 }; Q.internalCheck(r, P); ok(test(r).G && !test(r).W, 'internal: a gust below the mean wind fails the gust'); }
{ const r = { P: 880 }; Q.internalCheck(r, P, 2400); ok(test(r).P, 'internal: 880 hPa at 2400 m fits neither station nor sea level'); }
{ const r = { P: 760 }; Q.internalCheck(r, P, 2400); ok(!test(r).P, 'internal: 760 hPa at 2400 m fits the station level'); }
/* 2 series: persistence, spike, frozen temperature */
{ const rows = []; for (let i = 0; i < 30; i++) rows.push({ ms: T0 + i * 10 * 6e4, T: 20 + 0.1 * Math.sin(i), RH: 61.3 + (i % 3) * 0.1 });
  for (let i = 30; i < 60; i++) rows.push({ ms: T0 + i * 10 * 6e4, T: 20 + 0.1 * Math.sin(i), RH: 55.2 });
  Q.seriesCheck(rows, P, {}); ok(rows[45].f && rows[45].f.RH && rows[45].f.RH.test === 'persistence' && !rows[10].f, 'series: one humidity value for 5 h fails persistence, earlier varying values pass'); }
{ const rows = []; for (let i = 0; i < 30; i++) rows.push({ ms: T0 + i * 10 * 6e4, T: 20 + 0.1 * Math.sin(i), RH: 100 });
  Q.seriesCheck(rows, P, {}); ok(!rows[29].f, 'series: humidity held at saturation (fog) is not a persistence fault'); }
{ const rows = []; for (let i = 0; i < 12; i++) rows.push({ ms: T0 + i * 10 * 6e4, T: 20 + 0.05 * i, RH: 50.1 + 0.1 * (i % 2) });
  rows[6].RH = 95.3; Q.seriesCheck(rows, P, {}); ok(rows[6].f && rows[6].f.RH && rows[6].f.RH.test === 'step' && !(rows[7].f && rows[7].f.RH), 'series: a humidity spike out and back fails that value only'); }
{ const rows = []; for (let i = 0; i < 20; i++) rows.push({ ms: T0 + i * 10 * 6e4, T: 21.3, RH: 40 + i * 0.3 });
  Q.seriesCheck(rows, P, {}); ok(rows[19].f && rows[19].f.T && rows[19].f.T.test === 'frozen' && !rows[19].f.RH, 'series: a temperature frozen for 3 h fails, its humidity stays'); }
{ const rows = []; for (let i = 0; i < 40; i++) rows.push({ ms: T0 + i * 3 * H, T: 21 + (i % 2) * 0.5, Td: 15 });
  Q.seriesCheck(rows, P, {}); ok(!rows.some((r) => r.f), 'series: half-degree 3-hourly synoptic reports are not judged by the sensor-repeat tests'); }
/* copy */
{ const mk = (pid) => ({ pid, r: { T: 24.3, RH: 61, Td: 16.2, P: 951.2 } }); const a = mk('mach:a'), b = mk('mach:b');
  Q.copyCheck([a, b]); ok(a.r.f && b.r.f && a.r.f.T.test === 'copy', 'copy: two keys with one identical record and no identity record: both values fail (order is not evidence)'); }
{ const mk = (pid) => ({ pid, r: { T: 24.3, RH: 61, Td: 16.2, P: 951.2 } }); const a = mk('mach:dup'), b = mk('mach:orig');
  Q.copyCheck([a, b], new Map([['mach:dup', 'mach:orig']])); ok(a.r.f && !b.r.f, 'copy: the registry identity record names the copy: only its values fail, the genuine station keeps them'); }
{ const a = { pid: 'x', r: { T: 24.3 } }, b = { pid: 'y', r: { T: 24.3 } }; Q.copyCheck([a, b]); ok(!a.r.f && !b.r.f, 'copy: a temperature alone is no evidence of a copy'); }
/* 4 buddy check (TITAN) */
const ring = (n, lat0, lon0, T, z = 200, zone = 'plains') => Array.from({ length: n }, (_, i) => ({ pid: 's' + i, lat: lat0 + 0.05 * Math.cos(i), lon: lon0 + 0.05 * Math.sin(i), elev: z, zone, r: { T: T + 0.4 * Math.sin(3 * i) } }));
{ const it = ring(6, 31.5, 74.3, 20); it[0].r.T = 7.4; const c = Q.spatialCheck(it, 'T', P);
  ok(it[0].r.f && it[0].r.f.T.test === 'buddy' && it.slice(1).every((x) => !x.r.f), 'buddy: a value 12.6 C colder than its neighbours fails (Kot Radha Kishan), the neighbours pass'); ok(c.checked === 6, 'buddy: every value with 3+ buddies was checked'); }
{ const it = ring(6, 31.5, 74.3, 20); it[0].elev = 340; it[0].r.T = 20 - 0.0065 * 140; Q.spatialCheck(it, 'T', P); ok(!it[0].r.f, 'buddy: a value 140 m higher and 0.9 C colder passes (lapse-rate height correction)'); }
{ const it = ring(6, 31.5, 74.3, 20); it[0].r.T = 30; it[0].zone = 'hills'; Q.spatialCheck(it, 'T', P); ok(!(it[0].r.f && it[0].r.f.T.test === 'buddy'), 'buddy: buddies come from the same terrain zone only'); }
{ const it = ring(6, 35.9, 74.3, 10, 2500, 'mountain'); for (const [k, x] of it.entries()) { x.elev = 2000 + 100 * k; x.bg = 12 - 0.0065 * (x.elev - 2000); x.r.T = x.bg - 1 + 0.3 * Math.sin(k); }
  it[2].r.T = it[2].bg + 9; Q.spatialCheck(it, 'T', P); ok(it[2].r.f && it[2].r.f.T.test === 'buddy' && it[2].r.f.T.on === 'residual from the forecast', 'buddy (residual mode): +10 C against the forecast where the neighbours read -1 C fails, across heights'); }
{ const it = [{ pid: 'a', lat: 30, lon: 70, elev: 100, zone: 'plains', r: { T: 21 }, bg: 20 }]; for (let i = 0; i < 6; i++) it.push({ pid: 'z' + i, lat: 25 + i, lon: 66 + i, elev: 50, zone: 'plains', r: { T: 30 + 0.5 * i }, bg: 30 + 0.5 * i + 0.2 * (i % 2) });
  it[0].r.T = 20 - 14; Q.spatialCheck(it, 'T', P); ok(it[0].r.f && it[0].r.f.T.test === 'background', 'background: a lone station 14 C below the forecast while its zone reads on it fails'); }
{ const it = ring(2, 31.5, 74.3, 20); const c = Q.spatialCheck(it, 'T', P); ok(c.unchecked === 2 && !it[0].r.f, 'no buddies and no forecast: the value passes, counted as unchecked'); }
/* owner mark */
{ const P2 = { ...P, marks: [{ pid: 'mach:X', v: 'RH', why: 'test', from: -Infinity, to: Infinity }] }; const r = { ms: T0, T: 20, RH: 50 }; Q.markCheck('mach:X', r, P2);
  ok(r.f && r.f.RH && r.f.RH.test === 'owner-mark' && !r.f.T, 'owner mark: fails the marked variable only'); }
/* batch: a station wrong in temperature keeps its humidity; hourly pick prefers a passing reading */
{ const st = Array.from({ length: 6 }, (_, i) => ({ pid: 'mach:s' + i, lat: 31.5 + 0.03 * i, lon: 74.3 + 0.02 * i, elev: 200, zone: 'plains' }));
  const rows = new Map(st.map((s, i) => [s.pid, Array.from({ length: 48 }, (_, h) => ({ ms: T0 + h * H + 2 * 6e4, T: 20 + 5 * Math.sin(h / 24 * 6.283) + 0.2 * i, RH: 50 + 10 * Math.cos(h / 24 * 6.283) + i }))]));
  for (const r of rows.get('mach:s0')) r.T -= 12.6;
  const res = Q.qcBatch(st, rows, P, { nearestMin: 15 }); const H0 = [...res.hourly.get('mach:s0').values()];
  ok(H0.filter((r) => r.f && r.f.T).length >= 40, 'batch: a thermometer 12.6 C off fails at (nearly) every hour');
  ok(H0.every((r) => !(r.f && r.f.RH)), 'batch: the same station\'s humidity stays (value, not station)');
  ok([...res.hourly.get('mach:s3').values()].every((r) => !r.f), 'batch: the neighbours pass');
  const S = Q.stationShares(res.hourly); ok(S['mach:s0'].T.fail / S['mach:s0'].T.n > 0.8 && S['mach:s0'].RH.fail === 0, 'stationShares: the diagnostic share per station and variable'); }
{ const st = [{ pid: 'p', lat: 30, lon: 70, elev: 100, zone: 'plains' }]; const rows = new Map([['p', [{ ms: T0 + 3 * 6e4, T: 75 }, { ms: T0 + 9 * 6e4, T: 20 }]]]);
  const res = Q.qcBatch(st, rows, P, { nearestMin: 15 }); ok(res.hourly.get('p').get(T0).T === 20, 'hourly pick: the nearest reading whose temperature passes'); }
/* command line (the retrain reader's path) */
{ const d = mkdtempSync(join(tmpdir(), 'obsqc-')); try {
    writeFileSync(join(d, 's.csv'), 'pid,lat,lon,elev,zone\n"mach:A, B",30,70,100,plains\nb,30.05,70.02,100,plains\nc,30.02,70.05,100,plains\nd,30.04,70.01,100,plains\n');
    writeFileSync(join(d, 'o.csv'), 'pid,time_utc,T,RH\n"mach:A, B",2026-10-10T00:00:00Z,8,50\nb,2026-10-10T00:00:00Z,20,51\nc,2026-10-10T00:00:00Z,20.3,52\nd,2026-10-10T00:00:00Z,19.8,49\n');
    const r = spawnSync(process.execPath, [join(APP, 'server', 'api', 'obsqc.mjs'), '--data', join(APP, 'data'), '--stations', join(d, 's.csv'), '--obs', join(d, 'o.csv'), '--out', join(d, 'out.csv')], { encoding: 'utf8' });
    const out = existsSync(join(d, 'out.csv')) ? readFileSync(join(d, 'out.csv'), 'utf8') : '';
    ok(r.status === 0 && /^"mach:A, B",2026-10-10T00:00Z,T,8,0,buddy,/m.test(out) && /^"mach:A, B",2026-10-10T00:00Z,RH,50,1,,/m.test(out), 'command line: a quoted station id round-trips; its temperature fails, its humidity passes');
  } finally { rmSync(d, { recursive: true, force: true }); } }
/* the source: no station list is read in operation */
{ const src = (f) => readFileSync(join(APP, f), 'utf8');
  ok(!/station-holds\.json/.test(src('server/api/fleet.mjs').replace(/\/\*[\s\S]*?\*\//g, '')), 'fleet.mjs reads no hold list');
  ok(!/EXCL\b/.test(src('server/api/fleet.mjs')) && !/excluded:\s*\(key\)/.test(src('server/api/fleet.mjs')), 'fleet.mjs has no station exclusion map or excluded() API');
  ok(!/nonrepresentative|station-holds/.test(src('scripts/agents/verify.mjs').replace(/\/\*[\s\S]*?\*\//g, '')), 'verify.mjs reads no station list');
  ok(!/heldOut\s*=\s*true/.test(src('server/api/sitingoffsets.mjs')), 'sitingoffsets.mjs holds no station out (it flags)');
  ok(!/o\.heldOut/.test(src('server/api/hyperlocal.mjs')), 'hyperlocal.mjs skips no held-out station');
  ok(!/nonrep-stations/.test(src('scripts/agents/exp_pointer.mjs').replace(/\/\*[\s\S]*?\*\//g, '')), 'the experiment pointer has no station-list target');
  ok(/obsqc/.test(src('scripts/agents/verify.mjs')) && /obsqc/.test(src('server/api/fleet.mjs')) && /obsqc/.test(src('server/api/accmon.mjs')) && /obsqc/.test(src('server/api/past30parse.mjs')), 'every consumer calls obsqc.mjs (v283.28: copies.mjs copies nothing now, LAMHA independence)'); }
console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
