// v91.17.283.10 - owner decision 23 Oct 2026 00:42 PKT ("put on hold"): MACH Kot Radha Kishan (mach:AKZSFWS, temperature sensor fault)
// and MACH Gulzar-e-Quaid (mach:FLT, humidity sensor fault) are held through data/station-holds.json, NOT permanent.
// Checks every consumer on the SHIPPED hold list: the fleet module (corrections / siting screen, live layer, nearest station,
// siting neighbours), the national score, the verification truth (scripts/agents/verify.mjs), the ECMWF shadow scoring
// (scripts/ecmwf/score_shadow.py) and that a "cleared" entry releases these two (they are not permanent; Khaplu stays permanent).
// usage: node scripts/tests28310/holds_mach.test.mjs     (unit checks, no server; writes only in a temporary folder)
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PYTHON } from '../lib/testenv.mjs';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + d : '')); } };
const imp = (rel) => import(pathToFileURL(join(APP, rel)).href);
const T = mkdtempSync(join(tmpdir(), 'holds28310-'));
const prevFleet = process.env.NIGRAAN_FLEET; process.env.NIGRAAN_FLEET = '0';
const KEYS = { AKZSFWS: { no: 27, re: /temperature sensor fault: reads 12\.7 C colder/ }, FLT: { no: 6, re: /humidity sensor fault: reads 69 points drier/ } };
try {
  /* 1. the shipped hold list */
  const H = JSON.parse(readFileSync(join(APP, 'data', 'station-holds.json'), 'utf8'));
  const reg = JSON.parse(readFileSync(join(APP, 'data', 'mach-fleet-stations.json'), 'utf8'));
  for (const [key, w] of Object.entries(KEYS)) {
    const h = (H.holds || []).find((x) => x.key === key); const r = (reg.stations || []).find((s) => s.key === key);
    ok(h && h.no === w.no && r && r.no === w.no && h.name === r.name, 'hold list: ' + key + ' is the registry station no ' + w.no + ' (' + (r && r.name) + ')', JSON.stringify(h && { no: h.no, name: h.name }));
    ok(h && w.re.test(h.why) && /diagnostic agent 2026-10-21/.test(h.why) && h.decided === '2026-10-23 owner', 'hold list: ' + key + ' carries the owner\'s stated reason and decision', h && h.why);
    ok(h && h.permanent === false && h.cleared == null && h.expires == null && /not permanent/.test(h.clearWhen || ''), 'hold list: ' + key + ' is NOT permanent, not cleared, clears on a site check', JSON.stringify(h && { permanent: h.permanent, cleared: h.cleared }));
  }
  const kh = (H.holds || []).find((x) => x.key === 'khaplu');
  ok(kh && kh.permanent === true && !kh.cleared, 'hold list: Khaplu is still the permanent hold');

  /* 2. the fleet module on the shipped list: corrections (siting screen), live layer, nearest, neighbours */
  const { createFleet } = await imp('server/api/fleet.mjs');
  const D = join(T, 'data'), RT = join(T, 'root'); mkdirSync(D, { recursive: true }); mkdirSync(RT, { recursive: true });
  for (const f of ['mach-fleet-stations.json', 'station-holds.json', 'mach-siting.json']) { try { copyFileSync(join(APP, 'data', f), join(D, f)); } catch (_) {} }
  const FL = createFleet({}, RT, D);
  for (const key of Object.keys(KEYS)) {
    ok(FL.excluded(key) === true, 'fleet: ' + key + ' is excluded (corrections, live layer, nearest station, siting neighbours)', String(FL.excluded(key)));
    const sc = FL.screen(key); ok(sc && sc.verdict === 'excluded' && sc.trusted === false, 'corrections: the siting screen marks ' + key + ' excluded and untrusted', JSON.stringify(sc).slice(0, 200));
  }
  ok(/hold list/.test((FL.screen('FLT') || {}).source || ''), 'fleet: FLT is excluded by the hold list (no earlier registry exclusion)', (FL.screen('FLT') || {}).source);
  ok(FL.excluded('gilgit') === false && FL.excluded('khaplu') === true, 'fleet: other stations untouched; Khaplu still held');
  const src = readFileSync(join(APP, 'server', 'api', 'fleet.mjs'), 'utf8');
  ok(/r\.usable \|\| EXCL\.has\(r\.key\)/.test(src) && /!r\.usable \|\| r\.tempC == null \|\| !r\.lastUpdated \|\| EXCL\.has\(r\.key\)/.test(src) && /filter\(\(\[k\]\) => !EXCL\.has\(k\)\)/.test(src),
    'fleet source: nearest(), liveReadings() and the siting offsets skip held keys');
  /* the registry exclusion alone is not the hold: with the registry exclusion removed AKZSFWS is still held by the list */
  const reg2 = JSON.parse(JSON.stringify(reg)); for (const s of reg2.stations) if (s.key === 'AKZSFWS') delete s.exclude;
  const D2 = join(T, 'data2'); mkdirSync(D2, { recursive: true }); writeFileSync(join(D2, 'mach-fleet-stations.json'), JSON.stringify(reg2)); copyFileSync(join(APP, 'data', 'station-holds.json'), join(D2, 'station-holds.json'));
  const FL2 = createFleet({}, RT, D2); ok(FL2.excluded('AKZSFWS') === true && /hold list/.test((FL2.screen('AKZSFWS') || {}).source || ''), 'fleet: AKZSFWS stays held by the hold list even without the registry exclusion');
  /* not permanent: "cleared" releases them */
  const H3 = JSON.parse(JSON.stringify(H)); for (const h of H3.holds) if (KEYS[h.key]) h.cleared = { date: '2099-01-01', evidence: 'test: sensor verified on site' };
  const D3 = join(T, 'data3'); mkdirSync(D3, { recursive: true }); writeFileSync(join(D3, 'mach-fleet-stations.json'), JSON.stringify(reg2)); writeFileSync(join(D3, 'station-holds.json'), JSON.stringify(H3));
  const FL3 = createFleet({}, RT, D3); ok(FL3.excluded('FLT') === false && FL3.excluded('AKZSFWS') === false && FL3.excluded('khaplu') === true, 'fleet: setting "cleared" releases FLT and AKZSFWS (not permanent); Khaplu is not released');

  /* 3. the national score: recorded pairs of a held station are not scored (excluded() from the fleet) */
  const { createNatScore } = await imp('server/api/natscore.mjs');
  const root = join(T, 'nat', 'nigraan-local'), lake = join(T, 'nat', 'station-lake', 'archive', 'fleet'); mkdirSync(root, { recursive: true }); mkdirSync(lake, { recursive: true });
  const hdr = 'paired_utc,key,lat,lon,model_elev_m,obs_utc,hour_utc,lead_h,temp_c,rh_pct,dew_c,wind_kmh,fc_raw_c,fc_served_c,fc_rh_pct,fc_served_rh_pct,fc_wind_kmh,corrected';
  const row = (key, lat, lon, t, raw, served) => ['2026-10-20T06:05:00Z', key, lat, lon, 500, '2026-10-20T06:00:00Z', '2026-10-20T06:00Z', 1, t, '', '', '', raw, served, '', '', '', 0].join(',');
  writeFileSync(join(lake, 'fleet_pairs_2026-10.csv'), [hdr, row('FLT', 33.56, 73.04, 20.0, 25.0, 25.0), row('AKZSFWS', 31.16, 74.12, 10.0, 22.0, 22.0), row('gilgit', 35.92, 74.31, 20.0, 19.0, 19.5)].join('\n') + '\n');
  const NS = createNatScore({ fleet: { liveReadings: () => [{ key: 'gilgit', trusted: true }], excluded: (k) => FL.excluded(k) } }, root, join(T, 'nat', 'data'));
  const r = NS.scoreDay('2026-10-20');
  ok(r.all && r.all.n === 1 && r.all.stations === 1, 'national score: the two held stations\' pairs are left out (1 pair kept)', JSON.stringify(r.all));

  /* 4. verification truth (agent 2) */
  const { loadStations } = await imp('scripts/agents/verify.mjs');
  const st = await loadStations({ dataDir: join(APP, 'data'), copiesDir: join(T, 'nocopies') });
  for (const key of Object.keys(KEYS)) { const s = st.find((x) => x.pid === 'mach:' + key); ok(s && /^held: /.test(s.excluded || ''), 'verification truth: mach:' + key + ' is excluded as held (counted, never scored)', s && s.excluded); }
  const g = st.find((x) => x.pid === 'mach:gilgit'); ok(g && !g.excluded, 'verification truth: other MACH stations stay in', g && String(g.excluded));

  /* 5. ECMWF shadow scoring: rows of the held stations dropped even when written with excluded=0 */
  const S = join(T, 'shadowapp'); mkdirSync(join(S, 'data', 'ecmwf010-shadow', '2026-10'), { recursive: true });
  copyFileSync(join(APP, 'data', 'station-holds.json'), join(S, 'data', 'station-holds.json'));
  writeFileSync(join(S, 'data', 'mach-fleet-stations.json'), JSON.stringify(reg2));   /* registry exclusion removed: the hold list alone must drop AKZSFWS */
  const head = 'shadow_utc,run_utc,valid_utc,lead_h,interval_h,key,zone,excluded,lat,lon,e_t2m,c_t2m_served';
  writeFileSync(join(S, 'data', 'ecmwf010-shadow', '2026-10', '2026102000.csv'), [head,
    '2026-10-20T10:00Z,2026-10-20T00:00Z,2026-10-20T12:00Z,12,3,FLT,hills,0,33.56,73.04,20,21',
    '2026-10-20T10:00Z,2026-10-20T00:00Z,2026-10-20T12:00Z,12,3,AKZSFWS,plains,0,31.16,74.12,20,21',
    '2026-10-20T10:00Z,2026-10-20T00:00Z,2026-10-20T12:00Z,12,3,gilgit,mountain,0,35.92,74.31,20,21'].join('\n') + '\n');
  const out = join(T, 'score.json');
  const p = spawnSync(PYTHON, [join(APP, 'scripts', 'ecmwf', 'score_shadow.py'), '--app', S, '--out', out], { encoding: 'utf8', timeout: 60000 });
  if (p.error || p.status !== 0) ok(false, 'ECMWF shadow: score_shadow.py ran', (p.error && p.error.message) || p.stderr.slice(0, 300));
  else { const J = JSON.parse(readFileSync(out, 'utf8')); ok(J.shadowRows === 1, 'ECMWF shadow scoring: FLT and AKZSFWS rows dropped by the hold list (1 of 3 rows kept)', 'shadowRows ' + J.shadowRows); }
  const e = readFileSync(join(APP, 'server', 'api', 'ecmwf010.mjs'), 'utf8');
  ok(/F\.excluded && F\.excluded\(String\(s\.key\)\)/.test(e), 'ECMWF shadow: rows are written with excluded=1 for held stations (fleet.excluded)');
} finally {
  if (prevFleet === undefined) delete process.env.NIGRAAN_FLEET; else process.env.NIGRAAN_FLEET = prevFleet;
  rmSync(T, { recursive: true, force: true });
}
console.log(`\nHOLDS28310 ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
