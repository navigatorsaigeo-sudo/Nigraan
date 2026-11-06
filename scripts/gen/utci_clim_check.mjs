/* v91.17.110 · can the daily maximum shade UTCI be computed from daily ERA5 fields? Hourly ERA5 (T, RH, wind) at 24 tehsils across
   the zones, 2023-2025: the true daily max of hourly shade UTCI (Tmrt = Ta) against UTCI from daily fields. Paid archive, key from
   mach.key (never printed). Output station-lake/reports/utci_daily_proxy_check.json */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = new URL('../../', import.meta.url).pathname;
const { utci } = await import(join(ROOT, 'server/api/utci.mjs'));
process.env.NIGRAAN_WORKER = '0'; process.env.NIGRAAN_ENGINE = '0';
const quiet = console.log; console.log = () => {};
const { createBackend } = await import(join(ROOT, 'server/api/index.mjs'));
const app = createBackend({ root: ROOT, dataDir: join(ROOT, 'data') }).app; console.log = quiet;
const U = app.units.tehsil.filter(u => !u.disputed && u.lat != null);
writeFileSync(join(ROOT, '..', 'station-lake', 'archive', 'units_tehsil.json'), JSON.stringify(U.map(u => ({ uid: u.unitId, lat: u.lat, lon: u.lon, elevM: u.elevM ?? null, zone: app.mos.zoneOfPoint(u.lat, u.lon, u.elevM) }))));
const KEY = readFileSync(join(ROOT, 'mach.key'), 'utf8').trim();
const pick = []; const byZ = {}; for (const u of U) { const z = app.mos.zoneOfPoint(u.lat, u.lon, u.elevM); (byZ[z] = byZ[z] || []).push(u); }
for (const [z, a] of Object.entries(byZ)) { const step = Math.max(1, Math.floor(a.length / 6)); for (let i = 0; i < a.length && pick.filter(p => p.z === z).length < 6; i += step) pick.push({ ...a[i], z }); }
const q = (o) => 'https://customer-archive-api.open-meteo.com/v1/archive?' + new URLSearchParams({ ...o, apikey: KEY }).toString();
const base = { latitude: pick.map(u => u.lat).join(','), longitude: pick.map(u => u.lon).join(','), elevation: pick.map(u => u.elevM ?? 'nan').join(','), start_date: '2023-01-01', end_date: '2025-12-31', timezone: 'Asia/Karachi', models: 'era5' };
const H = await (await fetch(q({ ...base, hourly: 'temperature_2m,relative_humidity_2m,wind_speed_10m', wind_speed_unit: 'ms' }))).json();
const D = await (await fetch(q({ ...base, daily: 'temperature_2m_max,temperature_2m_min,relative_humidity_2m_min,relative_humidity_2m_max,relative_humidity_2m_mean,wind_speed_10m_mean,wind_speed_10m_max', wind_speed_unit: 'ms' }))).json();
const COLD = process.argv.includes('--cold');
const res = {}; const err = { mean: [], max: [], mid: [] };
(Array.isArray(H) ? H : [H]).forEach((h, k) => {
  const d = (Array.isArray(D) ? D : [D])[k], z = pick[k].z; const truth = new Map();
  h.hourly.time.forEach((t, i) => { const v = utci(h.hourly.temperature_2m[i], h.hourly.temperature_2m[i], h.hourly.wind_speed_10m[i], h.hourly.relative_humidity_2m[i]); if (v == null) return; const day = t.slice(0, 10); if (!truth.has(day) || (COLD ? v < truth.get(day) : v > truth.get(day))) truth.set(day, v); });
  d.daily.time.forEach((day, i) => { const tr = truth.get(day); if (tr == null) return; const T = COLD ? d.daily.temperature_2m_min[i] : d.daily.temperature_2m_max[i], R = COLD ? d.daily.relative_humidity_2m_max[i] : d.daily.relative_humidity_2m_min[i];
    const a = utci(T, T, d.daily.wind_speed_10m_mean[i], R), b = utci(T, T, d.daily.wind_speed_10m_max[i], R), c = utci(T, T, (d.daily.wind_speed_10m_mean[i] + d.daily.wind_speed_10m_max[i]) / 2, R);
    for (const [k2, v] of [['mean', a], ['max', b], ['mid', c]]) if (v != null) { err[k2].push([z, v - tr, tr]); } });
});
const st = (arr, f) => { const a = arr.filter(f); const e = a.map(x => x[1]); return a.length ? { n: a.length, bias: +(e.reduce((s, x) => s + x, 0) / e.length).toFixed(2), mae: +(e.reduce((s, x) => s + Math.abs(x), 0) / e.length).toFixed(2), p95abs: +e.map(Math.abs).sort((x, y) => x - y)[Math.floor(e.length * 0.95)].toFixed(2) } : null; };
for (const k2 of ['mean', 'max', 'mid']) { res[k2] = { all: st(err[k2], () => true), hot_days_utci_ge_32: st(err[k2], x => x[2] >= 32), cold_days_utci_le_0: st(err[k2], x => x[2] <= 0) }; for (const z of Object.keys(byZ)) res[k2][z] = st(err[k2], x => x[0] === z); }
const out = { method: (COLD ? 'daily MIN of hourly shade UTCI vs UTCI(Tmin, RHmax, daily wind)' : 'daily max of hourly shade UTCI (Tmrt = Ta) vs UTCI(Tmax, RHmin, daily wind)') + ', ERA5 2023-2025, ' + pick.length + ' tehsils', result: res };
writeFileSync(join(ROOT, '..', 'station-lake', 'reports', COLD ? 'utci_daily_proxy_check_cold.json' : 'utci_daily_proxy_check.json'), JSON.stringify(out, null, 1)); quiet(JSON.stringify(out, null, 1)); process.exit(0);
