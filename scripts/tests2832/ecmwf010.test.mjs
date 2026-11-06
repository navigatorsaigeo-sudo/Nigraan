// v91.17.283.2 - ECMWF 0.1 deg module: point series (bilinear, height adjustment), hourly view, serve switch (off by default and per
// variable when on), shadow rows against the fleet's served cache, and the scoring script's switch rule on synthetic MACH readings.
// usage: node scripts/tests2832/ecmwf010.test.mjs     (writes only in a temporary folder; no network)
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createEcmwf010 } from '../../server/api/ecmwf010.mjs';
import { PYTHON } from '../lib/testenv.mjs';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + d : '')); } };
const near = (a, b, t = 0.011) => a != null && b != null && Math.abs(a - b) <= t;

const T = mkdtempSync(join(tmpdir(), 'ecmwf010-'));
try {
  /* a synthetic run: 2026-10-21 00 UTC, steps 0,3,6,9, Pakistan grid 151 x 181; t2m = 20 + 0.1*row + 0.01*col + step/3 (degC) */
  const dataDir = join(T, 'data'); const dir = join(dataDir, 'ecmwf010'); const run = '2099010100'; mkdirSync(join(dir, run), { recursive: true });
  const ny = 151, nx = 181, steps = [0, 3, 6, 9];
  const meta = { run, runTimeUtc: '2099-01-01T00:00Z', grid: { lat0: 38, lon0: 60, dlat: -0.1, dlon: 0.1, ny, nx }, steps, vars: {} };
  const put = (name, scale, kind, f) => { const n = kind === 'static' ? ny * nx : steps.length * ny * nx; const a = new Int16Array(n);
    for (let k = 0; k < (kind === 'static' ? 1 : steps.length); k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const v = f(steps[k], j, i); a[(kind === 'static' ? 0 : k * ny * nx) + j * nx + i] = v == null ? -32768 : Math.round(v / scale); }
    writeFileSync(join(dir, run, name + '.i16.gz'), gzipSync(Buffer.from(a.buffer))); meta.vars[name] = { scale, offset: 0, kind }; };
  put('t2m', 0.01, 'inst', (s, j, i) => 20 + 0.1 * j + 0.01 * i + s / 3);
  put('d2m', 0.01, 'inst', (s) => 10 + s / 3);
  put('u10', 0.01, 'inst', () => 3); put('v10', 0.01, 'inst', () => 4);
  put('gust', 0.01, 'max', (s) => (s ? 9 : null)); put('msl', 0.1, 'inst', () => 1010); put('sp', 0.1, 'inst', () => 990);
  put('tcc', 0.01, 'inst', () => 50); put('tp', 0.01, 'acc', (s) => (s ? s : null)); put('ssrd', 0.1, 'acc', () => 100);
  put('orog', 1, 'static', () => 500);
  writeFileSync(join(dir, run, 'meta.json'), JSON.stringify(meta));
  writeFileSync(join(dir, 'index.json'), JSON.stringify({ latest: run, runs: [{ run }] }));

  const app = {};
  const E = createEcmwf010(app, APP, dataDir, { schedule: false });
  /* point at a grid node: row j = (38-33.6)/0.1 = 44, col i = (73.0-60)/0.1 = 130 -> 20 + 4.4 + 1.3 = 25.7 at step 0 */
  const P = E.point(33.6, 73.0, {});
  ok(P && near(P.t2m[0], 25.7), 'grid-node value', P && String(P.t2m[0]));
  const Q = E.point(33.65, 73.05, {});   // half-way in both directions: bilinear = mean of four nodes = 20 + 4.35 + 1.305
  ok(Q && near(Q.t2m[0], 25.655), 'bilinear between nodes', Q && String(Q.t2m[0]));
  const H = E.point(33.6, 73.0, { elev: 1500 });   // 1000 m above the model orography: -6.5 K
  ok(H && near(H.t2m[0], 19.2) && near(H.d2m[0], 3.5), 'height adjustment 6.5 K/km', H && H.t2m[0] + ' / ' + H.d2m[0]);
  ok(P && near(P.wind10[1], 5) && P.wdir[1] === 217, 'wind speed and direction from u, v', P && P.wind10[1] + ' m/s from ' + P.wdir[1]);
  ok(E.point(45, 73, {}) === null, 'outside the Pakistan box -> null');
  const HR = E.point(33.6, 73.0, { hourly: true });
  ok(HR && HR.lead[0] === 1 && near(HR.t2m[0], 25.7 + 1 / 3) && near(HR.tp[0], 1) && HR.lead.length === 9, 'hourly: linear temperature, rain spread over the interval', HR && HR.t2m[0] + ' / ' + HR.tp[0]);
  const r404 = E.route('/api/ecmwf010/point', new URL('http://x/api/ecmwf010/point?lat=33.6&lon=73'), {});
  ok(r404 && r404.status === 200 && r404.body.ok && /ECMWF/.test(r404.body.credit), 'route answers with the ECMWF credit');

  /* serve switch: off by default; on, only variables whose rule passed, only future hours */
  const body = { latitude: 33.6, longitude: 73.0, elevation: 500, utc_offset_seconds: 0, hourly: { time: ['2099-01-01T01:00', '2099-01-01T02:00'], temperature_2m: [1, 1], wind_speed_10m: [1, 1], precipitation: [9, 9] } };
  const qs = new URLSearchParams({ hourly: 'temperature_2m,wind_speed_10m,precipitation' }); const buf = Buffer.from(JSON.stringify(body));
  delete process.env.NIGRAAN_ECMWF010_SERVE;
  ok(E.substitute(buf, qs) === buf, 'serve flag off by default: answer unchanged');
  process.env.NIGRAAN_ECMWF010_SERVE = '1';
  ok(E.substitute(buf, qs) === buf, 'flag on, no score file: answer unchanged');
  writeFileSync(join(dataDir, 'ecmwf010-score.json'), JSON.stringify({ decision: { t2m: { pass: true }, wind10: { pass: false }, tp: { pass: true } } }));
  const out = JSON.parse(E.substitute(buf, qs).toString());
  ok(near(out.hourly.temperature_2m[0], 26.0, 0.051) && out.hourly.wind_speed_10m[0] === 1 && near(out.hourly.precipitation[0], 1, 0.051) && out.agn_ecmwf010 && out.agn_ecmwf010.variables.join() === 'temperature_2m,precipitation',
    'flag on: passed variables replaced (t2m, rain), failed one kept (wind)', JSON.stringify(out.hourly));
  const qm = new URLSearchParams({ hourly: 'temperature_2m', models: 'gfs_seamless' });
  ok(E.substitute(buf, qm) === buf, 'a named-model request is never touched');
  delete process.env.NIGRAAN_ECMWF010_SERVE;

  /* shadow against a stub fleet cache; then the scoring script on synthetic MACH readings */
  writeFileSync(join(dataDir, 'mach-fleet-stations.json'), JSON.stringify({ stations: [{ key: 'st1', lat: 33.6, lon: 73.0 }, { key: 'st2', lat: 31.5, lon: 74.3 }] }));
  const hours = []; for (let h = 0; h <= 12; h++) hours.push([new Date(Date.parse('2099-01-01T00:00Z') + h * 3600e3).toISOString().slice(0, 13), { raw: 24, served: 24.5, dew: 9, wind: 10, pr: 0.5 }]);
  app.fleet = { fcHours: (k) => ({ at: Date.parse('2098-12-31T22:00Z'), elev: 500, hours }), excluded: (k) => k === 'st2' };
  app.mos = { zoneOfPoint: () => 'plains' };
  const sh = E.shadow();
  ok(sh.ok && sh.rows === 6 && sh.withServed === 6, 'shadow rows at both stations, served values joined', JSON.stringify(sh));
  const csv = readFileSync(sh.file, 'utf8').trim().split('\n'); const hd = csv[0].split(','); const r1 = csv[1].split(',');
  ok(r1[hd.indexOf('c_tp_mm')] === '1.5' && r1[hd.indexOf('excluded')] === '0' && r1[hd.indexOf('zone')] === 'plains', 'served rain summed over the 3 h interval; zone and exclusion recorded');
  if (PYTHON && spawnSync(PYTHON, ['-c', 'import csv,json'], { encoding: 'utf8' }).status === 0) {
    /* readings: T = 26.0 at every valid time; the shadow above is in 2099, so build a scoring set dated in the past instead */
    const sd = join(T, 'shadow', '2026-10'); mkdirSync(sd, { recursive: true }); const obsD = join(T, 'obs'); mkdirSync(obsD, { recursive: true });
    const rows = [hd.join(',')]; const obs = ['stationKey,time,source,temperatureC,dewPointC,humidityPct,windDirectionDeg,windSpeedKmh,windGustKmh,pressureHpa,uvIndex,solarWm2,precipRateMmHr,precipTotalMm'];
    const base = Date.parse('2026-10-10T00:00Z');
    for (let r = 0; r < 4; r++) for (let d = 0; d < 1; d++) for (let s = 1; s <= 16; s++) for (let st = 0; st < 3; st++) {
      const v = base + r * 86400e3 + s * 3 * 3600e3; const iso = new Date(v).toISOString().slice(0, 16) + 'Z';
      const row = Object.fromEntries(hd.map((h) => [h, ''])); Object.assign(row, { run_utc: new Date(base + r * 86400e3).toISOString().slice(0, 16) + 'Z', valid_utc: iso, lead_h: s * 3, interval_h: 3, key: 'k' + st, zone: st ? 'plains' : 'mountain', excluded: 0,
        e_t2m: 26.2, c_t2m_served: 27.0, c_t2m_start: 25.0, e_d2m: 10, c_d2m: 10.5, e_wind_kmh: 8, c_wind_kmh: 6, e_tp_mm: 0, c_tp_mm: 0,
        /* v91.17.283.8 (audit 14): the candidate is scored through the full served chain (c_<var>_served_e) against the served value */
        c_t2m_served_e: 26.2, c_d2m_served: 10.5, c_d2m_served_e: 10, c_wind_served: 6, c_wind_served_e: 8, c_e_substituted: 1 });
      rows.push(hd.map((h) => row[h]).join(','));
      obs.push(['k' + st, iso, 'wu_api', 26.0, 10.2, 50, 0, 6.5, 9, 1000, 0, 0, 0, 0].join(','));
      obs.push(['k' + st, new Date(v - 3 * 3600e3).toISOString().slice(0, 16) + ':00Z', 'wu_api', 26.0, 10.2, 50, 0, 6.5, 9, 1000, 0, 0, 0, 0].join(','));
      for (const hb of [1, 2]) obs.push(['k' + st, new Date(v - hb * 3600e3).toISOString().slice(0, 16) + ':00Z', 'wu_api', 26.0, 10.2, 50, 0, 6.5, 9, 1000, 0, 0, 0, 0].join(','));
    }
    writeFileSync(join(sd, '2026101000.csv'), rows.join('\n') + '\n'); writeFileSync(join(obsD, 'obs_20261010.csv'), obs.join('\n') + '\n');
    for (const dd of ['11', '12', '13']) writeFileSync(join(obsD, 'obs_202610' + dd + '.csv'), obs[0] + '\n');
    const outF = join(T, 'score.json');
    const p = spawnSync(PYTHON, [join(APP, 'scripts', 'ecmwf', 'score_shadow.py'), '--app', T, '--shadow', join(T, 'shadow'), '--obs', obsD, '--out', outF], { encoding: 'utf8' });
    const S = existsSync(outF) ? JSON.parse(readFileSync(outF, 'utf8')) : null;
    ok(p.status === 0 && S, 'score_shadow.py runs', (p.stdout || '') + (p.stderr || '').slice(-300));
    if (S) {
      ok(S.decision.t2m.pass === true && near(S.metrics.t2m.all.ecmwf010.mae, 0.2, 0.001) && near(S.metrics.t2m.all.served.mae, 1.0, 0.001), 't2m: ecmwf010 MAE 0.2 <= served 1.0 over 4 days, 4 runs -> pass', S.decision.t2m.why);
      ok(S.decision.wind10.pass === false, 'wind: ecmwf010 MAE 1.5 > served 0.5 -> no', S.decision.wind10.why);
      ok(S.decision.d2m.pass === true && S.metrics.d2m.byZone.mountain && S.metrics.t2m.byLead['0-24 h'], 'd2m pass; by zone and by lead present', S.decision.d2m.why);
      ok(S.decision.tp.pass === false && /never switched on/.test(S.decision.tp.why || ''), 'rain: no full-chain column, reported and never switched on (v91.17.283.8, audit 14)', S.decision.tp.why);
    }
    /* fewer than 3 runs: rule refuses */
    const sd2 = join(T, 'shadow2', '2026-10'); mkdirSync(sd2, { recursive: true }); writeFileSync(join(sd2, 'x.csv'), rows.filter((l, i) => i === 0 || l.includes(',2026-10-10T00:00Z,') || l.startsWith(',2026-10-10T00:00Z')).join('\n') + '\n');
    const p2 = spawnSync(PYTHON, [join(APP, 'scripts', 'ecmwf', 'score_shadow.py'), '--app', T, '--shadow', join(T, 'shadow2'), '--obs', obsD, '--out', outF, '--min-pairs', '1'], { encoding: 'utf8' });
    const S2 = JSON.parse(readFileSync(outF, 'utf8'));
    ok(p2.status === 0 && S2.decision.t2m.pass === false && /runs/.test(S2.decision.t2m.why), 'one run, one day: the rule refuses', S2.decision.t2m.why);
  } else console.log('SKIP scoring (no Python)');
} finally { rmSync(T, { recursive: true, force: true }); }
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
