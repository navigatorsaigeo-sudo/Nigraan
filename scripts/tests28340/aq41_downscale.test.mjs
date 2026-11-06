// aq41 · the 1 km PM2.5 downscaling layer: one value per place (tehsil row, national table, 1 km grid), released regions only,
// factor 1 elsewhere, switch-off, AQI from the downscaled value. Runs the real smog.mjs run() on a fake provider in a temp data folder
// holding only the aq41 files (the served per-city / national models are switched off so the base is the composition value).
// usage: node scripts/tests28340/aq41_downscale.test.mjs   (SRVFIX_TREE=<tree> to test another tree)
import { mkdtempSync, rmSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const TREE = process.env.SRVFIX_TREE || join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const imp = (rel) => import(pathToFileURL(join(TREE, rel)).href);
let pass = 0, fail = 0; const ok = (c, n, d = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? ' - ' + d : '')); };
process.env.NIGRAAN_PMC = '0'; process.env.NIGRAAN_PMN = '0'; process.env.NIGRAAN_FIRES = '0';
const { createSmog, aqiOf } = await imp('server/api/smog.mjs');
const { createFeatGrid } = await imp('server/api/featgrid.mjs');
import { mkdirSync } from 'node:fs';
const base = join(tmpdir(), 'aq41t-' + process.pid, 'nig'); mkdirSync(base, { recursive: true });   /* the issued log goes to <dataDir>/../../station-lake: kept inside base's parent */
const dir = mkdtempSync(join(base, 'data-'));
for (const f of ['pm25-downscale.json', 'aqds']) symlinkSync(join(TREE, 'data', f), join(dir, f));
const U = JSON.parse(readFileSync(join(TREE, 'data', 'aqds', 'pm25-ds-units.json'), 'utf8'));
const units = { tehsil: [
  { unitId: 'Punjab|Lahore|Lahore City', name: 'Lahore City', district: 'Lahore', province: 'Punjab', lat: 31.56, lon: 74.33, elevM: 215 },
  { unitId: 'Khyber Pakhtunkhwa|Peshawar|Town-Iv', name: 'Town-Iv', district: 'Peshawar', province: 'Khyber Pakhtunkhwa', lat: 34.0, lon: 71.55, elevM: 350 },
  { unitId: 'Federal Capital|Islamabad|Islamabad', name: 'Islamabad', district: 'Islamabad', province: 'Federal Capital', lat: 33.70, lon: 73.05, elevM: 540 }] };
const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const hours = []; for (let k = 0; k < 5; k++) { const d = new Date(Date.parse(today + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10); for (let h = 0; h < 24; h++) hours.push(d + 'T' + String(h).padStart(2, '0') + ':00'); }
const PM = 80;
const provider = { configured: () => true, call: async (kind, path, q) => q.latitude.map((la, i) => ({ latitude: la, longitude: q.longitude[i], hourly: kind === 'airQuality'
  ? { time: hours, pm2_5: hours.map(() => PM), pm10: hours.map(() => 120), dust: hours.map(() => 10), aerosol_optical_depth: hours.map(() => 0.5), nitrogen_dioxide: hours.map(() => 20), carbon_monoxide: hours.map(() => 400), sulphur_dioxide: hours.map(() => 5), ozone: hours.map(() => 40) }
  : { time: hours, boundary_layer_height: hours.map(() => 600), wind_speed_10m: hours.map(() => 5), wind_direction_10m: hours.map(() => 90), relative_humidity_2m: hours.map(() => 60), temperature_2m: hours.map(() => 15), temperature_925hPa: hours.map(() => 14), surface_pressure: hours.map(() => 990), visibility: hours.map(() => 9000), cloud_cover: hours.map(() => 10), precipitation: hours.map(() => 0), shortwave_radiation: hours.map(() => 200) } })) };
const app = { provider, units, dataDir: dir };
const S = createSmog(app, dir); await S.run();
const season = (d) => { const m = +d.slice(5, 7); return m >= 10 || m <= 2 ? 'smog' : 'rest'; };
const r1 = (x) => Math.round(x * 10) / 10;
const n0 = S.national(0);
for (const u of units.tehsil) {
  const r = S.unit(u.unitId); const d = r && r.days.find((x) => x.date === n0.date); const row = n0.ready && n0.top.pm25.find((x) => x.unitId === u.unitId);
  const f = U.units[u.unitId] && U.units[u.unitId][season(n0.date)];
  if (f) {
    ok(d && d.pm25 === r1(PM * f), u.name + ': the served value is the base x the tehsil factor', JSON.stringify({ pm25: d && d.pm25, f }));
    ok(d && d.pm25Downscale && d.pm25Downscale.factor === f && d.pm25Downscale.servedBefore === PM, u.name + ': the row says the factor and the value before it');
  } else ok(d && d.pm25 === PM && !d.pm25Downscale, u.name + ': outside the released regions the served value is unchanged', JSON.stringify({ pm25: d && d.pm25 }));
  const a = aqiOf(d.pm25, 120);
  ok(d.aqi === a.aqi && d.aqiCategory === a.category, u.name + ': the AQI and its category come from the downscaled value', d.aqi + ' ' + d.aqiCategory);
  ok(row && row.pm25 === d.pm25 && row.aqi === d.aqi, u.name + ': the national table (map, alerts, top lists) reads the same value as the place panel', JSON.stringify({ table: row && row.pm25, panel: d.pm25 }));
}
// the 1 km grid
const P = app.pm25ds; ok(!!P && P.on(), 'the downscaling layer is installed and on');
const G = P.grid((uid) => { const r = S.unit(uid); return r && r.days.find((x) => x.date === n0.date) || null; });
ok(G.ready && G.n > 0, 'the 1 km grid has cells', G.n + ' cells');
const pop = createFeatGrid(TREE + '/data'); const lah = U.units['Punjab|Lahore|Lahore City']; let sw = 0, sv = 0, n = 0;
const byRc = new Map(G.cells.map((c) => [c[0] + ',' + c[1], c[2]]));
for (const [rr, cc] of lah.cells) { const v = byRc.get(rr + ',' + cc); if (v == null) continue; const lat = G.north - (rr + 0.5) * G.cell, lon = G.west + (cc + 0.5) * G.cell; let w = 0;
  for (const dy of [-0.375, -0.125, 0.125, 0.375]) for (const dx of [-0.375, -0.125, 0.125, 0.375]) { const p = pop.value('p_pop', lat + dy * G.cell, lon + dx * G.cell); if (p > 0) w += p; }
  sw += w; sv += w * v; n++; }
const dL = S.unit('Punjab|Lahore|Lahore City').days.find((x) => x.date === n0.date);
ok(n === lah.cells.length && Math.abs(sv / sw - dL.pm25) / dL.pm25 < 0.01, 'Lahore City: the population-weighted mean of its 1 km cells is the tehsil value (within 1 %)', r1(sv / sw) + ' vs ' + dL.pm25);
ok(!G.cells.some((c) => { const lat = G.north - (c[0] + 0.5) * G.cell, lon = G.west + (c[1] + 0.5) * G.cell; return Math.abs(lat - 33.70) < 0.15 && Math.abs(lon - 73.05) < 0.15; }), 'no 1 km cell in a region that failed (Islamabad)');
const M = JSON.parse(readFileSync(join(TREE, 'data', 'pm25-downscale.json'), 'utf8')); const [lo, hi] = M.clip;
ok(G.cells.every((c) => { const lat = G.north - (c[0] + 0.5) * G.cell, lon = G.west + (c[1] + 0.5) * G.cell; const f = P.cellFactor(lat, lon, n0.date); return f >= lo * 0.999 && f <= hi * 1.001; }), 'every cell factor is inside the clip range', lo.toFixed(3) + '-' + hi.toFixed(3));
// switch off
process.env.NIGRAAN_PM25DS = '0'; const S2 = createSmog({ provider, units, dataDir: dir }, dir); await S2.run();
const d2 = S2.unit('Punjab|Lahore|Lahore City').days.find((x) => x.date === n0.date);
ok(d2.pm25 === PM && !d2.pm25Downscale, 'NIGRAAN_PM25DS=0: the served value is unchanged');
rmSync(dirname(base), { recursive: true, force: true });
console.log(`\nAQ41-DOWNSCALE ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
