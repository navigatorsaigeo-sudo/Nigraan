// v91.17.283.14 - owner decision 24 Oct 2026 08:29 PKT: a wrong value is dropped, never a whole station. Replaces the hold tests of
// v91.17.283.2 (scripts/tests2832/holds.test.mjs) and v91.17.283.10 (scripts/tests28310/holds_mach.test.mjs), moved to the archive:
// the fleet module no longer excludes a station (no excluded() API, the siting screen gives no 'excluded' verdict from the hold list or
// the registry), the national score scores every recorded pair, the ECMWF shadow scoring keeps every station's rows, the history files
// say HISTORY, and Kot Radha Kishan and Gulzar-e-Quaid come back value by value (their good variables pass obsqc.mjs).
// usage: node scripts/tests28314/consumers.test.mjs     (unit checks, no server; writes only in a temporary folder)
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PYTHON } from '../lib/testenv.mjs';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + d : '')); } };
const imp = (rel) => import(pathToFileURL(join(APP, rel)).href);
const T = mkdtempSync(join(tmpdir(), 'qc28314-'));
const prevFleet = process.env.NIGRAAN_FLEET; process.env.NIGRAAN_FLEET = '0';
try {
  /* 1. the history files */
  for (const f of ['station-holds.json', 'nonrepresentative-stations.json']) { const J = JSON.parse(readFileSync(join(APP, 'data', f), 'utf8')); ok(/^HISTORY ONLY/.test(J.status || ''), f + ' is marked history only', J.status && J.status.slice(0, 60)); }
  const REG = JSON.parse(readFileSync(join(APP, 'data', 'mach-fleet-stations.json'), 'utf8')).stations;
  ok(!REG.some((s) => s.exclude), 'registry: no station carries an "exclude" record (identity records and history only)');
  ok(REG.filter((s) => s.identity && s.identity.of).length >= 10, 'registry: the duplicate / mixup identity records are kept for the copy check');
  const M = JSON.parse(readFileSync(join(APP, 'data', 'obs-qc-marks.json'), 'utf8')).marks || [];
  ok(!M.some((m) => /AKZSFWS|FLT|khaplu/i.test(m.pid)), 'marks: Kot Radha Kishan, Gulzar-e-Quaid and Khaplu carry no mark (automatic)');
  /* 2. the fleet module */
  const { createFleet } = await imp('server/api/fleet.mjs');
  const D = join(T, 'data'), RT = join(T, 'root'); mkdirSync(D, { recursive: true }); mkdirSync(RT, { recursive: true });
  for (const f of ['mach-fleet-stations.json', 'mach-siting.json', 'station-holds.json', 'obs-qc-params.json', 'obs-qc-marks.json', 'fleet-range-screen.json']) { try { copyFileSync(join(APP, 'data', f), join(D, f)); } catch (_) {} }
  const FL = createFleet({}, RT, D);
  ok(FL.excluded === undefined, 'fleet: no excluded() API (no station exclusion anywhere)');
  ok(typeof FL.qcLatest === 'function' && FL.qcLatest().params && /obsqc/.test(FL.qcLatest().params || 'obsqc'), 'fleet: the value-level verdicts of the last poll are served (qcLatest)');
  for (const k of ['khaplu', 'AKZSFWS', 'FLT', 'mach2', 'al_jazari']) { const sc = FL.screen(k); ok(!sc || sc.verdict !== 'excluded', 'fleet: ' + k + ' gets no "excluded" verdict', JSON.stringify(sc || {}).slice(0, 100)); }
  /* 3. the national score: every recorded pair is scored */
  const { createNatScore } = await imp('server/api/natscore.mjs');
  const root = join(T, 'nat', 'nigraan-local'), lake = join(T, 'nat', 'station-lake', 'archive', 'fleet'); mkdirSync(root, { recursive: true }); mkdirSync(lake, { recursive: true });
  const hdr = 'paired_utc,key,lat,lon,model_elev_m,obs_utc,hour_utc,lead_h,temp_c,rh_pct,dew_c,wind_kmh,fc_raw_c,fc_served_c,fc_rh_pct,fc_served_rh_pct,fc_wind_kmh,corrected';
  const row = (key, lat, lon, t, raw, served) => ['2026-10-20T06:05:00Z', key, lat, lon, 2500, '2026-10-20T06:00:00Z', '2026-10-20T06:00Z', 1, t, '', '', '', raw, served, '', '', '', 0].join(',');
  writeFileSync(join(lake, 'fleet_pairs_2026-10.csv'), [hdr, row('khaplu', 35.16, 76.33, 11.0, 12.0, 12.0), row('gilgit', 35.92, 74.31, 20.0, 19.0, 19.5)].join('\n') + '\n');
  const NS = createNatScore({ fleet: { liveReadings: () => [{ key: 'gilgit', trusted: true }] } }, root, join(T, 'nat', 'data'));
  const r = NS.scoreDay('2026-10-20');
  ok(r.all && r.all.n === 2 && r.all.stations === 2, 'national score: both recorded pairs are scored (the pairs hold only values that passed)', JSON.stringify(r.all));
  /* 4. ECMWF shadow scoring keeps every station's rows */
  const S = join(T, 'shadowapp'); mkdirSync(join(S, 'data', 'ecmwf010-shadow', '2026-10'), { recursive: true });
  for (const f of ['mach-fleet-stations.json', 'obs-qc-params.json', 'obs-qc-marks.json', 'fleet-range-screen.json']) copyFileSync(join(APP, 'data', f), join(S, 'data', f));
  const head = 'shadow_utc,run_utc,valid_utc,lead_h,interval_h,key,zone,excluded,lat,lon,e_t2m,c_t2m_served';
  writeFileSync(join(S, 'data', 'ecmwf010-shadow', '2026-10', '2026102000.csv'), [head,
    '2026-10-20T10:00Z,2026-10-20T00:00Z,2026-10-20T12:00Z,12,3,khaplu,mountain,1,35.16,76.33,10,11',
    '2026-10-20T10:00Z,2026-10-20T00:00Z,2026-10-20T12:00Z,12,3,gilgit,mountain,0,35.92,74.31,20,21'].join('\n') + '\n');
  const out = join(T, 'score.json');
  const p = spawnSync(PYTHON, [join(APP, 'scripts', 'ecmwf', 'score_shadow.py'), '--app', S, '--out', out], { encoding: 'utf8', timeout: 60000 });
  if (p.error || p.status !== 0) ok(false, 'ECMWF shadow: score_shadow.py ran', (p.error && p.error.message) || p.stderr.slice(0, 300));
  else { const J = JSON.parse(readFileSync(out, 'utf8')); ok(J.shadowRows === 2, 'ECMWF shadow scoring: no station row dropped (2 of 2 kept; the observations are judged value by value)', 'shadowRows ' + J.shadowRows); }
  /* 5. the verification truth: Kot Radha Kishan's temperature fails against its neighbours, its humidity stays; Gulzar-e-Quaid's
        humidity fails (1 %), its temperature stays */
  const Q = await imp('server/api/obsqc.mjs'); const P = Q.loadParams(join(APP, 'data')); P.marks = [];
  const st = [['mach:AKZSFWS', 31.17, 74.1], ['mach:a', 31.2, 74.15], ['mach:b', 31.25, 74.05], ['mach:c', 31.15, 74.2], ['mach:FLT', 33.6, 73.0], ['mach:d', 33.62, 73.03], ['mach:e', 33.58, 72.98], ['mach:f', 33.65, 73.05]].map(([pid, lat, lon]) => ({ pid, lat, lon, elev: 210, zone: 'plains' }));
  const rows = new Map(st.map((s) => [s.pid, []])); const T0 = Date.UTC(2026, 9, 20);
  for (let h = 0; h < 48; h++) for (const s of st) rows.get(s.pid).push({ ms: T0 + h * 3600e3 + 60e3, T: 22 + 6 * Math.sin(h / 24 * 6.283) + (s.pid === 'mach:AKZSFWS' ? -12.6 : 0.3 * (s.lat - 31)), RH: s.pid === 'mach:FLT' ? 1 : 55 + 15 * Math.cos(h / 24 * 6.283) + (s.lon - 73) });
  const res = Q.qcBatch(st, rows, P, { nearestMin: 15 }); const sh = Q.stationShares(res.hourly);
  ok(sh['mach:AKZSFWS'].T.fail / sh['mach:AKZSFWS'].T.n > 0.9 && sh['mach:AKZSFWS'].RH.fail === 0, 'Kot Radha Kishan: temperature values fail (12.6 C off its neighbours), its humidity values come back', JSON.stringify(sh['mach:AKZSFWS']));
  ok(sh['mach:FLT'].RH.fail === sh['mach:FLT'].RH.n && sh['mach:FLT'].T.fail === 0, 'Gulzar-e-Quaid: humidity values fail (1 %), its temperature values come back', JSON.stringify(sh['mach:FLT']));
  /* 6. the sources */
  const src = (f) => readFileSync(join(APP, f), 'utf8');
  ok(!/excluded\(/.test(src('server/api/natscore.mjs') + src('server/api/synop.mjs') + src('server/api/accmon.mjs') + src('server/api/ecmwf010.mjs')), 'no consumer calls fleet.excluded()');
  ok(!/held_keys|station-holds\.json'/.test(src('scripts/ecmwf/score_shadow.py')), 'score_shadow.py reads no hold list');
  ok(!/registry_exclusion/.test(src('scripts/mach_db_screen.py')) && /obsqc_truth/.test(src('scripts/mach_db_screen.py')), 'mach_db_screen.py: no registry exclusion; its readings go through obsqc');
} finally {
  if (prevFleet === undefined) delete process.env.NIGRAAN_FLEET; else process.env.NIGRAAN_FLEET = prevFleet;
  rmSync(T, { recursive: true, force: true });
}
console.log(`\nVALUE-QC CONSUMERS ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
