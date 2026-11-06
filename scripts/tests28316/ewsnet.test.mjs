/* v91.17.283.16 · unit tests of the per-network setting of the value-level quality control (server/api/obsqc.mjs networkOf / allows,
   data/obs-qc-params.json networks). Owner decision 24 Oct 2026 22:07 PKT: the partner EWS network (pid aws:<station>, net aws) has
   correct data; only the technical checks apply to it (gross range with the sentinels, internal consistency, stuck / flat and spike);
   no buddy and no background check of its values; never adjusted. Every case is run for an EWS station and for a MACH station in the
   same place, so the difference is the setting and nothing else.
   node scripts/tests28316/ewsnet.test.mjs        exit 0 all pass, 1 a failure */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as Q from '../../server/api/obsqc.mjs';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const P = Q.loadParams(join(APP, 'data')); P.marks = [];
let fails = 0, n = 0; const ok = (c, m) => { n++; if (c) console.log('PASS ' + m); else { fails++; console.log('FAIL ' + m); } };
const T0 = Date.UTC(2026, 9, 10, 0); const tf = (r, v) => (r.f && r.f[v] ? r.f[v].test : null);

/* 1 the setting itself, from the parameters file */
const N = P.networks && P.networks.ews;
ok(!!N && N.spatial === false && N.background === false && N.adjust === false, 'params: networks.ews spatial=false, background=false, adjust=false');
ok(Q.networkOf(P, { pid: 'aws:Khaplu_AWS_1' }) && Q.networkOf(P, { pid: 'aws:Khaplu_AWS_1' }).name === 'ews', 'networkOf: an aws: pid is the EWS network');
ok(Q.networkOf(P, { pid: 'x', net: 'aws' }) && Q.networkOf(P, { pid: 'x', net: 'aws' }).name === 'ews', 'networkOf: net aws is the EWS network whatever the pid');
ok(Q.networkOf(P, { pid: 'mach:e_7_4', net: 'mach' }) === null && Q.networkOf(P, { pid: 'metar:OPIS' }) === null, 'networkOf: MACH and METAR have no setting (every check applies)');
ok(!Q.allows(Q.networkOf(P, { pid: 'aws:A' }), 'spatial') && Q.allows(null, 'spatial'), 'allows: false only where the network says false');
{ const P2 = JSON.parse(JSON.stringify(P)); P2.networks.ews.spatial = true; P2.networks.ews.background = true;
  const it = ring(6, 36.3, 74.6, 5, 2600, 'mountain', 'aws:'); it[0].r.T = -8; Q.spatialCheck(it, 'T', P2);
  ok(tf(it[0].r, 'T') === 'buddy', 'the setting is data: with spatial=true in the file the same EWS value fails the buddy check (no code path names EWS)'); }

/* 2 buddy check: not applied to EWS values; EWS values are still buddies of others */
function ring(k, lat0, lon0, T, z, zone, pre) { return Array.from({ length: k }, (_, i) => ({ pid: pre + 's' + i, lat: lat0 + 0.05 * Math.cos(i), lon: lon0 + 0.05 * Math.sin(i), elev: z, zone, r: { T: T + 0.4 * Math.sin(3 * i) } })); }
for (const [pre, want] of [['aws:', null], ['mach:', 'buddy']]) { const it = ring(6, 36.3, 74.6, 5, 2600, 'mountain', pre); it[0].r.T = -8; const c = Q.spatialCheck(it, 'T', P);
  ok(tf(it[0].r, 'T') === want, 'buddy: a value 13 C below its neighbours ' + (want ? 'fails at MACH' : 'passes at EWS (no buddy check)') + (want ? '' : '; counted exempt ' + c.exempt)); }
{ const it = ring(6, 36.3, 74.6, 5, 2600, 'mountain', 'aws:'); it[0].pid = 'mach:m0'; it[0].r.T = -8; Q.spatialCheck(it, 'T', P);
  ok(tf(it[0].r, 'T') === 'buddy' && it.slice(1).every((x) => !x.r.f), 'buddy: a MACH value 13 C off its EWS neighbours fails (EWS values are references); the EWS values pass'); }

/* 3 background check: not applied to EWS values */
for (const [pre, want] of [['aws:', null], ['mach:', 'background']]) {
  const it = [{ pid: pre + 'a', lat: 36, lon: 74, elev: 2500, zone: 'mountain', r: { T: 21 }, bg: 20 }]; for (let i = 0; i < 6; i++) it.push({ pid: 'metar:z' + i, lat: 31 + i, lon: 66 + i, elev: 2000, zone: 'mountain', r: { T: 10 + 0.5 * i }, bg: 10 + 0.5 * i + 0.2 * (i % 2) });
  it[0].r.T = 20 - 16; const c = Q.spatialCheck(it, 'T', P); ok(tf(it[0].r, 'T') === want, 'background: a lone value 16 C below the forecast ' + (want ? 'fails at MACH' : 'passes at EWS (no background check), exempt ' + c.exempt)); }
{ const it = [{ pid: 'aws:a', lat: 36, lon: 74, elev: 2500, zone: 'mountain', r: { W: 200 }, bg: { W: 10 } }]; for (let i = 0; i < 6; i++) it.push({ pid: 'metar:z' + i, lat: 31 + i, lon: 66 + i, elev: 2000, zone: 'mountain', r: { W: 10 + i }, bg: { W: 10 + i } });
  Q.spatialCheck(it, 'W', P); ok(!it[0].r.f, 'background (wind, no buddy check): not applied to an EWS wind either'); }

/* 4 gross range with the sentinels: applies to EWS */
for (const x of [-2147483648, Math.fround(2147483.647), -9.997, Math.fround(-9.997)]) { const r = { ms: T0, T: x, RH: 40 }; Q.grossCheck(r, P); ok(tf(r, 'T') === 'sentinel' && !tf(r, 'RH'), 'sentinel ' + x + ': the value fails as sentinel, the station\'s other values stay'); }
{ const r = { ms: T0, RH: -9.997 }; Q.grossCheck(r, P); ok(tf(r, 'RH') === 'sentinel', 'sentinel: any variable'); }
{ const r = { ms: T0, T: -9.9, RH: 40 }; Q.grossCheck(r, P); ok(tf(r, 'T') !== 'sentinel', 'sentinel: a real -9.9 C is not a code'); }
{ const r = { ms: T0, T: 75 }; Q.grossCheck(r, P); ok(tf(r, 'T') === 'gross-range', 'gross range still applies'); }

/* 5 internal consistency: applies to EWS */
{ const r = { ms: T0, T: 5, Td: 8, RH: 60 }; Q.internalCheck(r, P, 2600); ok(tf(r, 'Td') === 'internal' && !tf(r, 'T'), 'internal: Td > T fails the dew point (T stays)'); }
{ const r = { ms: T0, T: 5, RH: 104 }; Q.grossCheck(r, P); Q.internalCheck(r, P, 2600); ok(!!tf(r, 'RH') && !tf(r, 'T'), 'internal / range: RH 104 % fails the humidity only'); }

/* 6 qcBatch: EWS station in a MACH neighbourhood - spike and flat fail, the buddy and background checks do not; no climate range */
let ROWS = null; function batch(pre, mut) {
  const st = []; const rows = new Map();
  for (let s = 0; s < 6; s++) { const pid = (s === 0 ? pre : 'mach:') + 'b' + s; st.push({ pid, net: s === 0 ? pre.slice(0, -1) : 'mach', lat: 36.3 + 0.03 * s, lon: 74.6 + 0.02 * s, elev: 2600, zone: 'mountain' });
    const a = []; for (let k = 0; k < 48 * 6; k++) { const ms = T0 + k * 600e3; a.push({ ms, T: 5 + 4 * Math.sin(k / 36) + 0.13 * ((k * 7 + s) % 5), RH: 50 + 10 * Math.cos(k / 40) + 0.37 * ((k * 3 + s) % 4) }); } rows.set(pid, a); }
  mut(rows.get(st[0].pid)); ROWS = rows.get(st[0].pid); return { res: Q.qcBatch(st, rows, P, { nearestMin: 15, bgAt: () => ({ T: 5, RH: 50 }) }), pid: st[0].pid };
}
for (const pre of ['aws:', 'mach:']) { const { res, pid } = batch(pre, (a) => { for (const r of a) r.T -= 12; });
  const H = [...res.hourly.get(pid).values()]; const failT = H.filter((r) => tf(r, 'T')).length;
  ok(pre === 'aws:' ? failT === 0 : failT >= 40, 'batch: a station 12 C below its neighbours all day: ' + failT + ' of ' + H.length + ' hourly temperatures fail at ' + (pre === 'aws:' ? 'EWS (none: no buddy / background)' : 'MACH')); }
{ batch('aws:', (a) => { a[100].RH = a[99].RH + 40; }); const r = ROWS.find((x) => x.ms === T0 + 100 * 600e3);
  ok(r && tf(r, 'RH') === 'step', 'batch: an EWS humidity spike (+40 points, back at the next reading) fails as step'); }
{ const { res, pid } = batch('aws:', (a) => { for (let k = 60; k < 120; k++) a[k].RH = 63.21; }); const H = [...res.hourly.get(pid).values()].filter((x) => x.ms >= T0 + 60 * 600e3 && x.ms < T0 + 120 * 600e3);
  ok(H.length > 0 && H.every((x) => tf(x, 'RH') === 'persistence'), 'batch: an EWS humidity flat for 10 h fails as persistence (flat)'); }
{ const { res, pid } = batch('aws:', (a) => { a[30].T = -2147483648; }); const r = ROWS.find((x) => x.ms === T0 + 30 * 600e3); const h = res.hourly.get(pid).get(T0 + 5 * 3600e3);
  ok(r && tf(r, 'T') === 'sentinel' && h && h !== r && !tf(h, 'T'), 'batch: an EWS sentinel fails as sentinel; the hour takes the nearest good reading instead'); 
  ok(res.counts.networks && res.counts.networks.ews && res.counts.networks.ews.values.T > 0 && res.counts.spatial.exempt > 0, 'batch counts: per-network values and the exempt count are reported'); }
{ const st = [{ pid: 'aws:c', net: 'aws', lat: 36, lon: 74, elev: 4200, zone: 'mountain' }]; const rows = new Map([['aws:c', [{ ms: T0, T: -45 }]]]);
  const res = Q.qcBatch(st, rows, P, { nearestMin: 15, bgAt: () => ({ T: 10 }) }); const r = res.hourly.get('aws:c').get(T0);
  ok(!tf(r, 'T'), 'batch: no climatological range at EWS (-45 C at 4,200 m against a +10 C forecast passes; gross range -80..60)'); }

/* 7 copy check: not applied to EWS (two partner stations with one record are both kept); MACH as before */
for (const [pre, want] of [['aws:', false], ['mach:', true]]) { const a = { pid: pre + 'x', r: { T: 4.3, RH: 61, Td: -2.4 } }, b = { pid: pre + 'y', r: { T: 4.3, RH: 61, Td: -2.4 } };
  Q.copyCheck([a, b], new Map(), null, P); ok(!!(a.r.f || b.r.f) === want, 'copy: identical records ' + (want ? 'fail at MACH' : 'pass at EWS')); }

/* 8 the command line (the retrain reader's path) reads the same setting; time_obs is written */
{ const d = mkdtempSync(join(tmpdir(), 'ewsnet-')); try {
    writeFileSync(join(d, 's.csv'), 'pid,lat,lon,elev,zone,net\n"aws:A, B",36.3,74.6,2600,mountain,aws\nb,36.33,74.62,2600,mountain,mach\nc,36.32,74.65,2600,mountain,mach\nd,36.34,74.61,2600,mountain,mach\n');
    writeFileSync(join(d, 'o.csv'), 'pid,time_utc,T,RH\n"aws:A, B",2026-10-10T00:10:00Z,-8,50\nb,2026-10-10T00:00:00Z,5,51\nc,2026-10-10T00:00:00Z,5.3,52\nd,2026-10-10T00:00:00Z,4.8,49\n');
    const r = spawnSync(process.execPath, [join(APP, 'server', 'api', 'obsqc.mjs'), '--data', join(APP, 'data'), '--stations', join(d, 's.csv'), '--obs', join(d, 'o.csv'), '--out', join(d, 'out.csv')], { encoding: 'utf8' });
    const out = existsSync(join(d, 'out.csv')) ? readFileSync(join(d, 'out.csv'), 'utf8') : '';
    ok(r.status === 0 && /^"aws:A, B",2026-10-10T00:00Z,T,-8,1,,,2026-10-10T00:10Z$/m.test(out), 'command line: the EWS value 13 C off its neighbours passes; time_obs is the reading\'s own time');
  } finally { rmSync(d, { recursive: true, force: true }); } }

/* 9 no station named in code; no rule mark on the network; the diagnostic agent reports EWS offsets as information only */
{ const code = readFileSync(join(APP, 'server', 'api', 'obsqc.mjs'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/aws:|ews|Khaplu|Kandia|AEGIS|Datascape/i.test(code), 'obsqc.mjs code names no network or station (the setting lives in the parameters file)');
  const M = JSON.parse(readFileSync(join(APP, 'data', 'obs-qc-marks.json'), 'utf8')).marks || [];
  ok(!M.some((m) => Q.networkOf(P, { pid: m.pid }) && Q.networkOf(P, { pid: m.pid }).name === 'ews'), 'obs-qc-marks.json: no mark on an EWS station');
  const dg = readFileSync(join(APP, 'scripts', 'agents', 'diagnose.mjs'), 'utf8');
  ok(/infoOnly/.test(dg) && /networkOf/.test(dg) && /information only/.test(dg), 'diagnose.mjs: offsets of a network without spatial / background checks are information only');
  const py = readFileSync(join(APP, 'scripts', 'lib', 'obsqc_truth.py'), 'utf8');
  ok(/obsqc\.mjs/.test(py) && /ARCHIVE_DROP = \('sentinel', 'range'\)/.test(py) && /ARCHIVE_CONFIRM = \('spike', 'flat'\)/.test(py), 'obsqc_truth.py: the same command line (same setting); archive rule sentinel / range dropped, spike / flat only when confirmed'); }
console.log(n + ' checks, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
