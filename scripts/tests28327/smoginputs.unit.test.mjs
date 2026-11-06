/* v91.17.283.27 . ITEM 7 · THE INPUTS OF THE SERVED PM2.5 ARE ARCHIVED BY LEAD (internal), offline (temp install, a fake provider):
     S1  a smog run writes station-lake/archive/aq/inputs_YYYY-MM.jsonl.gz (whole gzip members), one line per tehsil and day with its lead
         0..4, its place group (monitor:<city> / national / composition), the basis, the model inputs exactly as that model read them (the
         national model's whole feature vector, in the order of data/pm25-national.json) and the served value
     S2  every archived served value equals the PM2.5 of data/smog.json for that tehsil and day, and the group matches its pm25Basis
     S3  the archive does not change any served value: the same run with the archive path unwritable serves the identical smog.json
     S4  one member per 12-hour block (a second run in the same block adds nothing); the archive is internal: no route serves it
   usage: node scripts/tests28327/smoginputs.unit.test.mjs */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, copyFileSync, symlinkSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + JSON.stringify(i).slice(0, 600) : '')); } };
process.env.NIGRAAN_FIRES = '0';
const SM = await import(pathToFileURL(join(API, 'smog.mjs')).href);
function install() { const T = mkdtempSync(join(tmpdir(), 'sm27-')); const D = join(T, 'nig', 'nigraan-local', 'data'); mkdirSync(D, { recursive: true });
  for (const f of ['pm25-national.json', 'pm25-correction.json']) copyFileSync(join(ROOT, 'data', f), join(D, f)); symlinkSync(join(ROOT, 'data', 'feat'), join(D, 'feat')); return { T, D, lake: join(T, 'nig', 'station-lake', 'archive', 'aq') }; }
const units = [{ unitId: 'Punjab|Lahore|Lahore City', lat: 31.55, lon: 74.34, elevM: 215 }, { unitId: 'Punjab|Faisalabad|Faisalabad City', lat: 31.42, lon: 73.08, elevM: 185 },
  { unitId: 'Punjab|Multan|Multan City', lat: 30.2, lon: 71.47, elevM: 122 }, { unitId: 'Gilgit-Baltistan|Hunza|Khunjerab', lat: 36.85, lon: 75.4, elevM: 4600 }];
const hours = () => { const out = []; const d0 = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10); for (let d = 0; d < 5; d++) for (let h = 0; h < 24; h++) out.push(new Date(Date.parse(d0) + d * 864e5).toISOString().slice(0, 10) + 'T' + String(h).padStart(2, '0') + ':00'); return out; };
const provider = { configured: () => true, call: async (kind, path, p) => { const n = p.latitude.length, t = hours();
  return Array.from({ length: n }, (_, k) => { const lat = p.latitude[k], lon = p.longitude[k], base = { latitude: lat, longitude: lon };
    if (kind === 'airQuality') { const v = (a) => t.map((_, i) => a + 10 * Math.sin(i / 5) + k); return { ...base, hourly: { time: t, pm2_5: v(80), pm10: v(140), dust: v(20), aerosol_optical_depth: v(0.6), nitrogen_dioxide: v(30), carbon_monoxide: v(600), sulphur_dioxide: v(10), ozone: v(40) } }; }
    if (p.models === 'icon_global') return { ...base, hourly: { time: t, temperature_2m: t.map(() => 14), temperature_925hPa: t.map((_, i) => (i % 24) < 9 ? 16 : 10), surface_pressure: t.map(() => 990) } };
    return { ...base, elevation: p.elevation ? p.elevation[k] : null, hourly: { time: t, boundary_layer_height: t.map((_, i) => 200 + 50 * (i % 24)), wind_speed_10m: t.map(() => 5), wind_direction_10m: t.map(() => 300), relative_humidity_2m: t.map(() => 70),
      temperature_2m: t.map(() => 18), visibility: t.map(() => 5000), cloud_cover: t.map(() => 20), precipitation: t.map(() => 0), shortwave_radiation: t.map(() => 200) } }; }); } };
const A = install();
const S = SM.createSmog({ provider, units: { tehsil: units } }, A.D); await S.run();
const smog = JSON.parse(readFileSync(join(A.D, 'smog.json'), 'utf8'));
const files = existsSync(A.lake) ? readdirSync(A.lake).filter((f) => /^inputs_\d{4}-\d{2}\.jsonl\.gz$/.test(f)) : [];
const lines = files.length ? gunzipSync(readFileSync(join(A.lake, files[0]))).toString('utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
/* ── S1 ── */
ok(files.length === 1 && lines.length === units.length * 5, 'S1a one monthly archive file, a line per tehsil and day (4 x 5)', { files, lines: lines.length });
ok(lines.every((x) => [0, 1, 2, 3, 4].includes(x.lead) && x.uid && x.date && x.issued && x.group && x.basis && x.in), 'S1b each line: lead 0-4, tehsil, day, issue time, group, basis, inputs', lines[0]);
const N = JSON.parse(readFileSync(join(ROOT, 'data', 'pm25-national.json'), 'utf8'));
const nat = lines.filter((x) => x.group === 'national'), mon = lines.filter((x) => /^monitor:/.test(x.group)), comp = lines.filter((x) => x.group === 'composition');
ok(nat.length && nat.every((x) => JSON.stringify(Object.keys(x.in)) === JSON.stringify(N.features)), 'S1c national model: the whole feature vector in the model\'s own order', nat[0] && Object.keys(nat[0].in).length);
ok(mon.length && mon.every((x) => x.group === 'monitor:Lahore' && x.in.cams_pm2_5 != null && x.in.doy != null), 'S1d ground-checked: the monitor city, the composition PM2.5 and the day of year', mon[0]);
ok(comp.length > 0, 'S1e the composition-only group is archived too', comp.length);
/* ── S2 ── */
const bad = lines.filter((x) => { const r = (smog.units[x.uid] || []).find((d) => d.date === x.date); return !r || r.pm25 !== x.served || r.pm25Basis !== x.basis; });
ok(!bad.length, 'S2 every archived served value and basis is the one in smog.json', bad.slice(0, 2));
/* ── S4 ── */
await S.run(); const again = gunzipSync(readFileSync(join(A.lake, files[0]))).toString('utf8').trim().split('\n').length;
ok(again === lines.length, 'S4a a second run in the same 12-hour block adds nothing', again);
const idx = readFileSync(join(API, 'index.mjs'), 'utf8') + readFileSync(join(ROOT, 'server', 'server.mjs'), 'utf8');
ok(!/inputs_/.test(idx), 'S4b no route serves the archive (internal only)');
/* ── S3 ── */
{ const B = install(); mkdirSync(join(B.T, 'nig', 'station-lake', 'archive'), { recursive: true }); writeFileSync(B.lake, 'not a folder');   /* the archive cannot be written */
  const S2 = SM.createSmog({ provider, units: { tehsil: units } }, B.D); await S2.run();
  const s2 = JSON.parse(readFileSync(join(B.D, 'smog.json'), 'utf8'));
  const strip = (o) => JSON.stringify(Object.fromEntries(Object.entries(o.units).map(([k, v]) => [k, v.map((d) => ({ ...d, aqiNow: null }))])));
  ok(strip(s2) === strip(smog), 'S3 the served values are identical when the archive cannot be written (the archive changes no value)');
  rmSync(B.T, { recursive: true, force: true }); }
rmSync(A.T, { recursive: true, force: true });
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
