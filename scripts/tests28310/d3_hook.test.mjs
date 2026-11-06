// v91.17.283.10 · the step log (the only served-code hook of the diagnostic agent), offline: no server, no network, the clock frozen.
//  H1 identity: the served chain with a step log gives byte-identical answers to the chain without one, at plains, hills, mountain and
//     coast points, at three issue times (a log only copies arrays)
//  H2 the log holds the temperature after each stage in chain order (start, static calibration, national residual model, static chain,
//     each later stage run), and its last entry is the served temperature
//  H3 the fleet pairing writes the log beside its pairs (fleet_pairs_steps_YYYY-MM.csv) and the agent reads the three files back into one
//     record per station-hour with every step
//  H4 the request path never asks for a log (only the fleet pairing passes stepLog)
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ok, done, imp, src, TREE } from './lib.mjs';
process.env.NIGRAAN_WORKER = '0'; process.env.NIGRAAN_AUTO_SCHEDULE = '0'; process.env.NIGRAAN_ENGINE = '0'; process.env.NIGRAAN_AGENTS = '0';
const FIX = Date.parse('2026-10-21T06:00:00Z'); const realNow = Date.now; Date.now = () => FIX;
const quiet = console.log; console.log = () => {};
const { createBackend } = await imp('server/api/index.mjs');
const B = createBackend({ root: TREE, dataDir: join(TREE, 'data') }); await new Promise((r) => setTimeout(r, 2500)); console.log = quiet;
const V = B.app.verification;
function body(lat, lon, elev, t0) { const time = [], T = [], Td = [], RH = [], W = [], CL = [], SW = [], PR = [], WD = [];
  for (let h = -72; h < 96; h++) { const ms = t0 + h * 3600e3; time.push(new Date(ms).toISOString().slice(0, 16)); const pk = (new Date(ms).getUTCHours() + 5) % 24;
    const t = 22 - elev / 200 + 7 * Math.sin(2 * Math.PI * (pk - 9) / 24) + 0.3 * Math.sin(h / 7); const td = t - 8 - 2 * Math.cos(2 * Math.PI * pk / 24);
    T.push(Math.round(t * 10) / 10); Td.push(Math.round(td * 10) / 10); RH.push(Math.round(100 * Math.exp(17.625 * td / (243.04 + td)) / Math.exp(17.625 * t / (243.04 + t))));
    W.push(Math.round(6 + 4 * Math.sin(h / 5))); WD.push(200); CL.push(pk > 12 && pk < 17 ? 30 : 5); SW.push(Math.max(0, Math.round(700 * Math.sin(Math.PI * (pk - 6) / 12)))); PR.push(0); }
  return { latitude: lat, longitude: lon, elevation: elev, utc_offset_seconds: 0, timezone: 'GMT', hourly_units: { temperature_2m: '°C', wind_speed_10m: 'km/h' },
    hourly: { time, temperature_2m: T, dew_point_2m: Td, relative_humidity_2m: RH, wind_speed_10m: W, wind_direction_10m: WD, cloud_cover: CL, shortwave_radiation: SW, precipitation: PR } }; }
const PLACES = [['Lahore plains', 31.52, 74.35, 215], ['Multan plains', 30.2, 71.47, 122], ['Murree hills', 33.9, 73.39, 2000], ['Abbottabad hills', 34.15, 73.22, 1250], ['Gilgit mountain', 35.92, 74.31, 1500], ['Skardu mountain', 35.3, 75.63, 2230], ['Karachi coast', 24.86, 67.01, 10]];
const ISSUES = [Date.parse('2026-10-19T19:00:00Z'), Date.parse('2026-10-20T19:00:00Z'), Date.parse('2026-10-21T01:00:00Z')];
let same = 0, n = 0, logged = 0, ordered = 0, lastIsServed = 0; const stagesSeen = new Set(); const diffs = [];
for (const t0 of ISSUES) for (const [name, la, lo, el] of PLACES) { Date.now = () => t0 + 3600e3;
  const a = body(la, lo, el, t0), b = body(la, lo, el, t0); const log = [];
  try { V.servedChain(a, la, lo, { upTo: 'synop', daily: false }); V.servedChain(b, la, lo, { upTo: 'synop', daily: false, stepLog: log }); } catch (e) { diffs.push(name + ': ' + e.message); continue; }
  n++; const ja = JSON.stringify(a), jb = JSON.stringify(b); if (ja === jb && JSON.stringify(a.agn_chain || null) === JSON.stringify(b.agn_chain || null)) same++; else diffs.push(name);
  if (log.length) { logged++; log.forEach(([id]) => stagesSeen.add(id)); const ids = log.map((x) => x[0]); const ORD = ['start', 'calibration', 'national', 'static', 'wxmos', 'tdown', 'synop'];
    if (ids.every((id, k) => k === 0 || ORD.indexOf(id) > ORD.indexOf(ids[k - 1]))) ordered++;
    const last = log[log.length - 1][1]; if (JSON.stringify(last) === JSON.stringify(b.hourly.temperature_2m)) lastIsServed++; } }
Date.now = () => FIX;
ok(n === 21 && same === n, 'H1 identity: ' + same + ' of ' + n + ' answers byte-identical with and without the step log (7 places x 3 issues)', diffs.join('; '));
ok(logged === n && ordered === n && stagesSeen.has('start') && stagesSeen.has('calibration') && stagesSeen.has('national') && stagesSeen.has('static'), 'H2 the log holds every stage in chain order', [...stagesSeen].join(' -> ') + ' logged ' + logged + ' ordered ' + ordered);
ok(lastIsServed === n, 'H2 the last entry equals the served temperature (' + lastIsServed + ' of ' + n + ')');
/* H3 write the three files the fleet pairing writes and read them back with the agent */
const FS = src('server/api/fleet.mjs'); const hdr = (FS.match(/'(paired_utc,key,hour_utc,lead_h,temp_c,fc_start_c,fc_calibration_c[^']*)\\n'/) || [])[1];
const D = await imp('scripts/agents/diagnose.mjs').catch(() => null);
let rec = null; if (hdr && D) { const lake = mkdtempSync(join(tmpdir(), 'dx-')); const f = join(lake, 'archive', 'fleet'); mkdirSync(f, { recursive: true });
  writeFileSync(join(f, 'fleet_pairs_2026-10.csv'), 'paired_utc,key,lat,lon,model_elev_m,obs_utc,hour_utc,lead_h,temp_c,rh_pct,dew_c,wind_kmh,fc_raw_c,fc_served_c,fc_rh_pct,fc_served_rh_pct,fc_wind_kmh,corrected\n2026-10-19T20:00:00.001Z,k1,31.5,74.3,215,2026-10-19T19:58:00Z,2026-10-19T20:00Z,0,14.0,80,10.6,2,15.5,15.1,70,72,3,1\n');
  writeFileSync(join(f, 'fleet_pairs_basis_2026-10.csv'), 'paired_utc,key,hour_utc,basis_start,fc_best_match_c,fc_start_c\n2026-10-19T20:00:00.002Z,k1,2026-10-19T20:00Z,multi-model mix,14.6,15.5\n');
  writeFileSync(join(f, 'fleet_pairs_steps_2026-10.csv'), hdr + '\n2026-10-19T20:00:00.003Z,k1,2026-10-19T20:00Z,0,14.0,15.5,15.4,15.2,15.2,15.1,,15.1,15.1\n');
  const R = D.readPairs(lake, ['2026-10-20'], new Map([['mach:k1', { zone: 'plains', urb: 'rural', name: 'k1' }]])); rec = R.recs[0]; }
ok(rec && rec.steps.raw === 14.6 && rec.steps.start === 15.5 && rec.steps.calibration === 15.4 && rec.steps.national === 15.2 && rec.steps.wxmos === 15.1 && rec.steps.served === 15.1 && !('tdown' in rec.steps) && rec.obs === 14 && rec.night === true && rec.block === 0 && rec.day === '2026-10-20',
  'H3 the pairs, the basis and the step log join into one record per station-hour (a stage that did not run is left out)', JSON.stringify(rec));
ok(/stepLog/.test(FS) && /NIGRAAN_STEPLOG/.test(FS), 'H3 the fleet pairing passes the log (NIGRAAN_STEPLOG=0 switches it off)');
const callers = ['server/server.mjs', 'server/api/index.mjs', 'server/api/national.mjs', 'server/api/ai.mjs', 'server/api/pointengine.mjs'].filter((f) => /stepLog/.test(src(f)));
ok(callers.length === 0 && /Array\.isArray\(o\.stepLog\)/.test(src('server/api/verification.mjs')), 'H4 no request-path caller passes a step log; the chain logs only when asked', callers.join(', '));
done('D3-HOOK');
