/* 1.0.4 · THE SERVED VENTILATION INDEX KEPT DAILY (internal), offline (temp install, a fake provider):
     V1  a smog run writes station-lake/archive/aq/vent_YYYY-MM.jsonl.gz: one line per tehsil and forecast day (lead 0-4) with the served
         ventilation index, the dispersion class, the afternoon boundary-layer height and wind, their hours, the day's minimum BLH and mean wind
     V2  every archived ventServed / dispersion equals afternoonVentilation / dispersion of data/smog.json; the inputs reproduce the index
         from the provider hours (mean over 12-16 h of BLH x wind / 3.6)
     V3  once per PKT run day: a second run the same day adds nothing
     V4  no extra provider call: the same calls with the archive on and off
     V5  the archive changes no served value: smog.json identical with the archive off and with the folder unwritable
     V6  internal only: no route names it
   usage: node scripts/tests28340/ventarchive40.test.mjs */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, copyFileSync, symlinkSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + JSON.stringify(i).slice(0, 600) : '')); } };
process.env.NIGRAAN_FIRES = '0';
const SM = await import(pathToFileURL(join(API, 'smog.mjs')).href);
function install() { const T = mkdtempSync(join(tmpdir(), 'vent40-')); const D = join(T, 'nig', 'nigraan-local', 'data'); mkdirSync(D, { recursive: true });
  for (const f of ['pm25-national.json', 'pm25-correction.json']) copyFileSync(join(ROOT, 'data', f), join(D, f)); symlinkSync(join(ROOT, 'data', 'feat'), join(D, 'feat')); return { T, D, lake: join(T, 'nig', 'station-lake', 'archive', 'aq') }; }
const units = [{ unitId: 'Punjab|Lahore|Lahore City', lat: 31.55, lon: 74.34, elevM: 215 }, { unitId: 'Sindh|Keamari|Site Town', lat: 24.94, lon: 67.02, elevM: 20 },
  { unitId: 'Gilgit-Baltistan|Hunza|Khunjerab', lat: 36.85, lon: 75.4, elevM: 4600 }];
const hours = () => { const out = []; const d0 = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10); for (let d = 0; d < 5; d++) for (let h = 0; h < 24; h++) out.push(new Date(Date.parse(d0) + d * 864e5).toISOString().slice(0, 10) + 'T' + String(h).padStart(2, '0') + ':00'); return out; };
const BLH = (i, k) => 150 + 60 * (i % 24) + 11 * k, WS = (i, k) => 3 + (i % 7) + k;
let calls = [];
const provider = { configured: () => true, call: async (kind, path, p) => { calls.push(kind + '|' + (p.models || 'best') + '|' + p.latitude.length); const n = p.latitude.length, t = hours();
  return Array.from({ length: n }, (_, k) => { const base = { latitude: p.latitude[k], longitude: p.longitude[k] };
    if (kind === 'airQuality') { const v = (a) => t.map((_, i) => a + 10 * Math.sin(i / 5) + k); return { ...base, hourly: { time: t, pm2_5: v(80), pm10: v(140), dust: v(20), aerosol_optical_depth: v(0.6), nitrogen_dioxide: v(30), carbon_monoxide: v(600), sulphur_dioxide: v(10), ozone: v(40) } }; }
    if (p.models === 'icon_global') return { ...base, hourly: { time: t, temperature_2m: t.map(() => 14), temperature_925hPa: t.map((_, i) => (i % 24) < 9 ? 16 : 10), surface_pressure: t.map(() => 990) } };
    return { ...base, elevation: p.elevation ? p.elevation[k] : null, hourly: { time: t, boundary_layer_height: t.map((_, i) => BLH(i, k)), wind_speed_10m: t.map((_, i) => WS(i, k)), wind_direction_10m: t.map(() => 300), relative_humidity_2m: t.map(() => 70),
      temperature_2m: t.map(() => 18), visibility: t.map(() => 5000), cloud_cover: t.map(() => 20), precipitation: t.map(() => 0), shortwave_radiation: t.map(() => 200) } }; }); } };
const read = (lake) => { const f = existsSync(lake) ? readdirSync(lake).filter((x) => /^vent_\d{4}-\d{2}\.jsonl\.gz$/.test(x)) : []; return { f, lines: f.length ? gunzipSync(readFileSync(join(lake, f[0]))).toString('utf8').trim().split('\n').map((l) => JSON.parse(l)) : [] }; };
const A = install(); calls = [];
const S = SM.createSmog({ provider, units: { tehsil: units } }, A.D); await S.run(); const callsOn = calls.slice();
const smog = JSON.parse(readFileSync(join(A.D, 'smog.json'), 'utf8'));
const { f: files, lines } = read(A.lake);
const nRows = Object.values(smog.units).reduce((a, r) => a + r.length, 0);
ok(files.length === 1 && lines.length === nRows && nRows === units.length * 5, 'V1a one monthly file, one line per tehsil and forecast day (' + lines.length + ')', { files, lines: lines.length, nRows });
ok(lines.every((x) => [0, 1, 2, 3, 4].includes(x.lead) && x.uid && x.date && x.runDay && x.run && ['ventServed', 'dispersion', 'blhAftM', 'windAftKmh', 'hoursAft', 'blhMinM', 'windMeanKmh'].every((k) => k in x)),
  'V1b each line: run day, run, tehsil, day, lead, served index, class, afternoon BLH and wind, hours, minimum BLH, mean wind', lines[0]);
const bad = lines.filter((x) => { const r = (smog.units[x.uid] || []).find((d) => d.date === x.date); return !r || r.afternoonVentilation !== x.ventServed || r.dispersion !== x.dispersion || r.blhMin !== x.blhMinM; });
ok(!bad.length, 'V2a archived index, class and minimum BLH = data/smog.json', bad.slice(0, 2));
const T = hours(); let worst = 0;
for (const x of lines) { const k = units.findIndex((u) => u.unitId === x.uid); const ix = T.map((t, i) => [t, i]).filter(([t]) => t.slice(0, 10) === x.date && +t.slice(11, 13) >= 12 && +t.slice(11, 13) <= 16).map(([, i]) => i);
  const vi = ix.reduce((a, i) => a + BLH(i, k) * WS(i, k) / 3.6, 0) / ix.length, bm = ix.reduce((a, i) => a + BLH(i, k), 0) / ix.length;
  worst = Math.max(worst, Math.abs(Math.round(vi) - x.ventServed), Math.abs(Math.round(bm) - x.blhAftM), x.hoursAft === ix.length ? 0 : 99); }
ok(worst === 0, 'V2b the index and the afternoon BLH reproduce from the provider hours (12-16 h, BLH x wind / 3.6)', worst);
await S.run(); ok(read(A.lake).lines.length === lines.length, 'V3 a second run the same PKT day adds nothing');
{ const B = install(); process.env.NIGRAAN_VENT_ARCHIVE = '0'; calls = []; const S2 = SM.createSmog({ provider, units: { tehsil: units } }, B.D); await S2.run(); delete process.env.NIGRAAN_VENT_ARCHIVE;
  ok(JSON.stringify(calls) === JSON.stringify(callsOn), 'V4 no extra provider call (archive on vs off: ' + callsOn.length + ' calls)', { on: callsOn, off: calls });
  const s2 = JSON.parse(readFileSync(join(B.D, 'smog.json'), 'utf8')); const strip = (o) => JSON.stringify(Object.fromEntries(Object.entries(o.units).map(([k, v]) => [k, v.map((d) => ({ ...d, aqiNow: null }))])));
  ok(strip(s2) === strip(smog) && !read(B.lake).f.length, 'V5a archive off: smog.json identical, no file');
  rmSync(B.T, { recursive: true, force: true }); }
{ const B = install(); mkdirSync(join(B.T, 'nig', 'station-lake', 'archive'), { recursive: true }); writeFileSync(B.lake, 'not a folder');
  const S3 = SM.createSmog({ provider, units: { tehsil: units } }, B.D); await S3.run(); const s3 = JSON.parse(readFileSync(join(B.D, 'smog.json'), 'utf8'));
  const strip = (o) => JSON.stringify(Object.fromEntries(Object.entries(o.units).map(([k, v]) => [k, v.map((d) => ({ ...d, aqiNow: null }))])));
  ok(strip(s3) === strip(smog), 'V5b archive folder unwritable: smog.json identical'); rmSync(B.T, { recursive: true, force: true }); }
const idx = readFileSync(join(API, 'index.mjs'), 'utf8') + readFileSync(join(ROOT, 'server', 'server.mjs'), 'utf8');
ok(!/vent_/.test(idx), 'V6 no route serves the archive (internal only)');
rmSync(A.T, { recursive: true, force: true });
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
