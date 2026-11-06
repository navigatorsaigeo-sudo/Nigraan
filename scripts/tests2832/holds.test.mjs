// v91.17.283.2 - MACH 106 Khaplu permanent hold: the hold list entry (permanent, no expiry, the stated reason), the fleet module
// (held even when "cleared" is set, never auto-released; a non-permanent hold still clears), the running correction / siting screen
// (excluded, untrusted), the national score (recorded pairs of a held station not scored) and the ECMWF shadow scoring
// (rows of a held station dropped even when written with excluded=0).
// usage: node scripts/tests2832/holds.test.mjs     (unit checks, no server; writes only in a temporary folder)
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PYTHON } from '../lib/testenv.mjs';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + d : '')); } };
const imp = (rel) => import(pathToFileURL(join(APP, rel)).href);
const T = mkdtempSync(join(tmpdir(), 'holds2832-'));
const prevFleet = process.env.NIGRAAN_FLEET; process.env.NIGRAAN_FLEET = '0';
try {
  /* 1. the data file */
  const H = JSON.parse(readFileSync(join(APP, 'data', 'station-holds.json'), 'utf8'));
  const k = (H.holds || []).find((h) => h.key === 'khaplu');
  ok(k && k.no === 106 && k.permanent === true, 'hold list: MACH 106 Khaplu is a permanent hold', JSON.stringify(k && { no: k.no, permanent: k.permanent }));
  ok(k && k.why === 'outdoor data not credible (frozen packet repeats)', 'hold list: reason is "outdoor data not credible (frozen packet repeats)"', k && k.why);
  ok(k && k.expires == null && k.cleared == null, 'hold list: no expiry date and not cleared', JSON.stringify(k && { expires: k.expires, cleared: k.cleared }));

  /* 2. the fleet module: held even with "cleared" and "expires" set; a non-permanent hold with "cleared" is released */
  const { createFleet } = await imp('server/api/fleet.mjs');
  const D = join(T, 'data'), RT = join(T, 'root'); mkdirSync(D, { recursive: true }); mkdirSync(RT, { recursive: true });
  copyFileSync(join(APP, 'data', 'mach-fleet-stations.json'), join(D, 'mach-fleet-stations.json'));
  for (const f of ['mach-siting.json']) { try { copyFileSync(join(APP, 'data', f), join(D, f)); } catch (_) {} }
  const H2 = JSON.parse(JSON.stringify(H));
  for (const h of H2.holds) if (h.key === 'khaplu') { h.cleared = '2026-10-22 test: someone set cleared'; h.expires = '2026-10-01'; }
  H2.holds.push({ key: 'gilgit', no: 105, why: 'test hold, not permanent', cleared: '2026-10-21 test', permanent: false });
  writeFileSync(join(D, 'station-holds.json'), JSON.stringify(H2));
  const FL = createFleet({}, RT, D);
  ok(FL.excluded('khaplu') === true, 'fleet: Khaplu stays held when "cleared" and a past "expires" are set (no auto-release)', String(FL.excluded('khaplu')));
  ok(FL.excluded('gilgit') === false, 'fleet: a non-permanent hold with "cleared" is released (the permanence is specific)', String(FL.excluded('gilgit')));
  const sc = FL.screen('khaplu');
  ok(sc && sc.verdict === 'excluded' && sc.trusted === false && /hold list/.test(sc.source || ''), 'corrections: the siting screen marks Khaplu excluded and untrusted (running correction skips untrusted stations)', JSON.stringify(sc).slice(0, 160));
  const src = readFileSync(join(APP, 'server', 'api', 'fleet.mjs'), 'utf8');
  ok(/r\.usable \|\| EXCL\.has\(r\.key\)/.test(src) && /!r\.usable \|\| r\.tempC == null \|\| !r\.lastUpdated \|\| EXCL\.has\(r\.key\)/.test(src),
    'nearest-station and live layer: fleet.nearest() and liveReadings() skip excluded / held keys');
  ok(/filter\(\(\[k\]\) => !EXCL\.has\(k\)\)/.test(src), 'corrections: siting offsets are computed without excluded / held stations');

  /* 3. the national score: recorded pairs of a held station are not scored */
  const { createNatScore } = await imp('server/api/natscore.mjs');
  const root = join(T, 'nat', 'nigraan-local'), lake = join(T, 'nat', 'station-lake', 'archive', 'fleet'); mkdirSync(root, { recursive: true }); mkdirSync(lake, { recursive: true });
  const hdr = 'paired_utc,key,lat,lon,model_elev_m,obs_utc,hour_utc,lead_h,temp_c,rh_pct,dew_c,wind_kmh,fc_raw_c,fc_served_c,fc_rh_pct,fc_served_rh_pct,fc_wind_kmh,corrected';
  const row = (key, lat, lon, t, raw, served) => ['2026-10-20T06:05:00Z', key, lat, lon, 2500, '2026-10-20T06:00:00Z', '2026-10-20T06:00Z', 1, t, '', '', '', raw, served, '', '', '', 0].join(',');
  writeFileSync(join(lake, 'fleet_pairs_2026-10.csv'), [hdr, row('khaplu', 35.16, 76.33, 11.0, 16.0, 16.0), row('gilgit', 35.92, 74.31, 20.0, 19.0, 19.5)].join('\n') + '\n');
  const appX = { fleet: { liveReadings: () => [{ key: 'gilgit', trusted: true }], excluded: (key) => key === 'khaplu' } };
  const NS = createNatScore(appX, root, join(T, 'nat', 'data'));
  const r = NS.scoreDay('2026-10-20');
  ok(r.all && r.all.n === 1 && r.all.stations === 1 && r.all.maeRaw === 1, 'national score: the held station\'s recorded pair is left out (1 pair, Gilgit only)', JSON.stringify(r.all));

  /* 4. ECMWF shadow scoring: a held station's rows are dropped even when written with excluded=0 */
  const S = join(T, 'shadowapp'); mkdirSync(join(S, 'data', 'ecmwf010-shadow', '2026-10'), { recursive: true });
  copyFileSync(join(APP, 'data', 'station-holds.json'), join(S, 'data', 'station-holds.json'));
  copyFileSync(join(APP, 'data', 'mach-fleet-stations.json'), join(S, 'data', 'mach-fleet-stations.json'));
  const head = 'shadow_utc,run_utc,valid_utc,lead_h,interval_h,key,zone,excluded,lat,lon,e_t2m,c_t2m_served';
  writeFileSync(join(S, 'data', 'ecmwf010-shadow', '2026-10', '2026102000.csv'), [head,
    '2026-10-20T10:00Z,2026-10-20T00:00Z,2026-10-20T12:00Z,12,3,khaplu,mountain,0,35.16,76.33,10,11',
    '2026-10-20T10:00Z,2026-10-20T00:00Z,2026-10-20T12:00Z,12,3,gilgit,mountain,0,35.92,74.31,20,21'].join('\n') + '\n');
  const out = join(T, 'score.json');
  const p = spawnSync(PYTHON, [join(APP, 'scripts', 'ecmwf', 'score_shadow.py'), '--app', S, '--out', out], { encoding: 'utf8', timeout: 60000 });
  if (p.error || p.status !== 0) ok(false, 'ECMWF shadow: score_shadow.py ran', (p.error && p.error.message) || p.stderr.slice(0, 300));
  else { const J = JSON.parse(readFileSync(out, 'utf8')); ok(J.shadowRows === 1, 'ECMWF shadow scoring: Khaplu rows dropped by the hold list (1 of 2 rows kept)', 'shadowRows ' + J.shadowRows); }
  const e = readFileSync(join(APP, 'server', 'api', 'ecmwf010.mjs'), 'utf8');
  ok(/F\.excluded && F\.excluded\(String\(s\.key\)\)/.test(e), 'ECMWF shadow: rows are written with excluded=1 for held stations (fleet.excluded)');
  const a = readFileSync(join(APP, 'server', 'api', 'accmon.mjs'), 'utf8');
  ok(/!isEx\(r\.key\)/.test(a) && /exIds\(\)/.test(a), 'LAMHA copies: the accuracy monitor backfill from LAMHA\'s copy of the MACH database skips excluded / held stations');
} finally {
  if (prevFleet === undefined) delete process.env.NIGRAAN_FLEET; else process.env.NIGRAAN_FLEET = prevFleet;
  rmSync(T, { recursive: true, force: true });
}
console.log(`\nHOLDS ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
