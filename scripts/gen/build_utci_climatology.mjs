/* v91.17.110 · THE HEAT-STRESS CLIMATE OF EACH PLACE. Per tehsil and calendar day: the 50th, 90th and 95th percentile of the daily
   maximum shade UTCI (Tmrt = Ta) over 1996-2025 (the operational 30-year normal the temperature percentiles use, WMO-No. 1203),
   pooled over a 15-day window (30 years x 15 days = 450 days), plus the mean number of days per year at each heat level.
   Daily maximum shade UTCI = UTCI(daily Tmax, daily minimum relative humidity, daily mean 10 m wind): checked against the daily max of
   hourly UTCI at 24 tehsils, 2023-2025 (station-lake/reports/utci_daily_proxy_check.json): on days with UTCI >= 32 C, MAE 0.32 C,
   bias -0.14 C. ERA5 daily via the paid archive at each tehsil's settlement height (key from mach.key, never printed).
   Output data/utci-climatology.json. This is context ("unusual for this place"): it does not change the heat level. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = new URL('../../', import.meta.url).pathname;
const { utci, utciAgnScore, utciColdScore } = await import(join(ROOT, 'server/api/utci.mjs'));
/* v91.17.111 · --cold: the same for the day's LOWEST shade UTCI = UTCI(Tmin, daily maximum RH, wind = mean of the daily mean and
   daily maximum 10 m wind), checked the same way (reports/utci_daily_proxy_check_cold.json: cold days MAE 0.85 C, bias +0.34 C);
   percentiles 5 / 10 / 50 and days per year at each cold level. Output data/utci-cold-climatology.json. */
const COLD = process.argv.includes('--cold');
const U = JSON.parse(readFileSync(join(ROOT, '..', 'station-lake', 'archive', 'units_tehsil.json'), 'utf8'));
const KEY = readFileSync(join(ROOT, 'mach.key'), 'utf8').trim();
const Y0 = 1996, Y1 = 2025, HALF = 7;
const band = (s) => s == null ? null : s >= 82 ? 4 : s >= 65 ? 3 : s >= 45 ? 2 : s >= 25 ? 1 : 0;
const doy = (iso) => { const d = new Date(iso + 'T00:00:00Z'); const y = d.getUTCFullYear(); let n = Math.floor((d - Date.UTC(y, 0, 1)) / 864e5); const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; if (!leap && n >= 59) n++; return n; };   /* 0..365, Feb 29 = 59 */
const q = (us) => 'https://customer-archive-api.open-meteo.com/v1/archive?' + new URLSearchParams({ latitude: us.map(u => u.lat).join(','), longitude: us.map(u => u.lon).join(','), elevation: us.map(u => u.elevM ?? 'nan').join(','),
  daily: COLD ? 'temperature_2m_min,relative_humidity_2m_max,wind_speed_10m_mean,wind_speed_10m_max' : 'temperature_2m_max,relative_humidity_2m_min,wind_speed_10m_mean', wind_speed_unit: 'ms', start_date: Y0 + '-01-01', end_date: Y1 + '-12-31', timezone: 'Asia/Karachi', models: 'era5', apikey: KEY }).toString();
const pct = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return Math.round((s[lo] + (s[hi] - s[lo]) * (i - lo)) * 10) / 10; };
const out = COLD ? { built: new Date().toISOString(), version: 'utci-cold-clim-91.17.111', period: Y0 + '-' + Y1, windowDays: 2 * HALF + 1,
  method: 'daily minimum shade UTCI = UTCI(ERA5 daily Tmin, daily maximum RH, mean of daily mean and daily maximum 10 m wind); percentiles 5/10/50 per calendar day over a 15-day window and 30 years; days per year at each AGN cold level (utci.json agnColdMapping)',
  check: JSON.parse(readFileSync(join(ROOT, '..', 'station-lake', 'reports', 'utci_daily_proxy_check_cold.json'), 'utf8')).result.mid,
  source: 'ERA5 reanalysis (Copernicus Climate Change Service / ECMWF) daily fields at the tehsil settlement height, via the paid reanalysis archive', licence: 'CC-BY-4.0 (Copernicus)',
  use: 'context only: how unusual tonight\'s cold stress is for this place and date. The cold level itself is the absolute UTCI cold mapping.',
  levels: ['Normal', 'Low', 'Moderate', 'High', 'Severe'], units: {} } : { built: new Date().toISOString(), version: 'utci-clim-91.17.110', period: Y0 + '-' + Y1, windowDays: 2 * HALF + 1,
  method: 'daily maximum shade UTCI (Tmrt = air temperature) = UTCI(ERA5 daily Tmax, daily minimum RH, daily mean 10 m wind); percentiles per calendar day over a 15-day window and 30 years; days per year at each AGN heat level (utci.json mapping, AGN_BAND_CUTS 25/45/65/82)',
  check: JSON.parse(readFileSync(join(ROOT, '..', 'station-lake', 'reports', 'utci_daily_proxy_check.json'), 'utf8')).result.mean,
  source: 'ERA5 reanalysis (Copernicus Climate Change Service / ECMWF) daily fields at the tehsil settlement height, via the paid reanalysis archive', licence: 'CC-BY-4.0 (Copernicus)',
  use: 'context only: how unusual today\'s heat stress is for this place and date. The heat level itself stays the absolute UTCI mapping.',
  levels: ['Normal', 'Low', 'Moderate', 'High', 'Severe'], units: {} };
for (let i = 0; i < U.length; i += 25) {
  const b = U.slice(i, i + 25); let arr = null;
  for (let a = 0; a < 4 && !arr; a++) { try { const r = await fetch(q(b), { signal: AbortSignal.timeout(600000) }); if (!r.ok) throw new Error('HTTP ' + r.status); const j = await r.json(); const x = Array.isArray(j) ? j : [j]; if (x.length === b.length) arr = x; else throw new Error('short batch ' + x.length); } catch (e) { console.error('batch', i, 'attempt', a, e.message); await new Promise(r => setTimeout(r, 20000 * (a + 1))); } }
  if (!arr) { console.error('batch', i, 'FAILED'); continue; }
  arr.forEach((L, k) => { const D = L.daily; const byDoy = Array.from({ length: 366 }, () => []); const lvYear = [0, 0, 0, 0, 0]; let nd = 0;
    D.time.forEach((t, j) => { const v = COLD ? (D.wind_speed_10m_max[j] == null || D.wind_speed_10m_mean[j] == null ? null : utci(D.temperature_2m_min[j], D.temperature_2m_min[j], (D.wind_speed_10m_mean[j] + D.wind_speed_10m_max[j]) / 2, D.relative_humidity_2m_max[j])) : utci(D.temperature_2m_max[j], D.temperature_2m_max[j], D.wind_speed_10m_mean[j], D.relative_humidity_2m_min[j]); if (v == null) return; byDoy[doy(t)].push(v); nd++; const bb = band(COLD ? utciColdScore(v) : utciAgnScore(v)); if (bb != null) lvYear[bb]++; });
    const p = COLD ? { p05: [], p10: [], p50: [] } : { p50: [], p90: [], p95: [] };
    for (let d = 0; d < 366; d++) { let w = []; for (let o = -HALF; o <= HALF; o++) w = w.concat(byDoy[(d + o + 366) % 366]); if (COLD) { p.p05.push(pct(w, 0.05)); p.p10.push(pct(w, 0.1)); p.p50.push(pct(w, 0.5)); } else { p.p50.push(pct(w, 0.5)); p.p90.push(pct(w, 0.9)); p.p95.push(pct(w, 0.95)); } }
    const yrsN = nd / 365.25; out.units[b[k].uid] = { ...p, daysPerYear: lvYear.map(x => Math.round(x / yrsN * 10) / 10), n: nd };
  });
  console.log('done', Math.min(i + 25, U.length), '/', U.length);
}
writeFileSync(join(ROOT, 'data', COLD ? 'utci-cold-climatology.json' : 'utci-climatology.json'), JSON.stringify(out)); console.log('units', Object.keys(out.units).length);
