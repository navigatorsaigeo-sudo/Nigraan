// v91.17.283 · WS2 · the 60-place request list: the URL set of i2731/bin/compare3.mjs (60 places + sweeps, lines 7-29 copied) plus the WS2 routes
// (levels per layer and day 0-3, alerts, verdicts, outlook unit / national, POST /api/limits/evaluate on 12 assets). usage: node urls60.mjs <units.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
const [UNITS, OUT] = process.argv.slice(2);
const U = JSON.parse(readFileSync(UNITS, 'utf8')).filter((u) => !u.disputed);
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);
const places = []; for (let i = 0; i < 60; i++) { const u = U[(i * 9) % U.length]; places.push({ la: +(u.lat + 0.0137 * ((i % 5) - 2)).toFixed(4), lo: +(u.lon + 0.0111 * ((i % 3) - 1)).toFixed(4), uid: u.unitId, name: u.tehsil }); }
const HV = 'temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation,precipitation_probability,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,shortwave_radiation,uv_index';
const DV = 'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max,uv_index_max,weather_code';
const urls = [];
for (const p of places) {
  const ll = `lat=${p.la}&lon=${p.lo}`, uq = encodeURIComponent(p.uid);
  urls.push(['chain:point15d', `/px/v1/forecast?__omhost=api.open-meteo.com&latitude=${p.la}&longitude=${p.lo}&hourly=${HV}&daily=${DV}&current=temperature_2m,relative_humidity_2m,wind_speed_10m&forecast_days=15&timezone=Asia%2FKarachi`]);
  urls.push(['chain:point3d-utc', `/px/v1/forecast?__omhost=api.open-meteo.com&latitude=${p.la}&longitude=${p.lo}&hourly=temperature_2m,relative_humidity_2m,precipitation&forecast_days=3&timezone=UTC`]);
  urls.push(['chain:nonat', `/px/v1/forecast?__omhost=api.open-meteo.com&latitude=${p.la}&longitude=${p.lo}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m,cloud_cover,precipitation&forecast_days=1&past_days=3&timezone=UTC&__nonat=1`]);
  for (const e of ['/api/report/past30', '/api/point/forecast', '/api/state/point', '/api/pool/point', '/api/hyperlocal/point', '/api/mos/point', '/api/geo/reverse', '/api/urban/point', '/api/glof/upstream', '/api/landslide/odds', '/api/flood/chance', '/api/fleet/nearest', '/api/faults/nearest', '/api/site/operations', '/api/ai/local', '/api/report/context'])
    urls.push([e, `${e}?${ll}&unit=${uq}`]);
  urls.push(['/api/levels/unit', `/api/levels/unit?unit=${uq}`]); urls.push(['/api/rain/chance', `/api/rain/chance?unit=${uq}`]); urls.push(['/api/smog/unit', `/api/smog/unit?unit=${uq}`]);
}
const sweepU = U.slice(0, 120);
urls.push(['chain:sweep120', `/px/v1/forecast?__omhost=api.open-meteo.com&latitude=${sweepU.map((u) => u.lat.toFixed(4)).join(',')}&longitude=${sweepU.map((u) => u.lon.toFixed(4)).join(',')}&hourly=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m&current=temperature_2m&forecast_days=4&timezone=UTC`]);
urls.push(['chain:zone', `/px/v1/forecast?__omhost=api.open-meteo.com&latitude=35.9187,35.2971,36.3167&longitude=74.3125,75.6333,74.65&hourly=temperature_2m,relative_humidity_2m,dew_point_2m&models=best_match,icon_seamless,gfs_seamless,meteofrance_seamless&forecast_days=7&timezone=UTC`]);
for (const q of ['lahore', 'gilgit', 'skardu', 'e-7', 'karachi', 'murree', 'naran', 'quetta', 'peshawar', 'multan', 'hunza', 'chitral', 'gwadar', 'thar', 'mianwali', 'kalam', 'swat', 'sukkur', 'islamabad f-7', 'hyderabad'])
  urls.push(['/api/geo/search', `/api/geo/search?q=${encodeURIComponent(q)}`]);
for (const e of ['/api/smog/national?day=1', '/api/urban/national', '/api/map/layers', '/api/fleet/check', '/api/glof/national', '/api/hyperlocal/national', '/api/sources', '/api/levels?layer=heat&day=0', '/api/verification/grades', '/api/climatology/drought', '/api/landslide/calibration', '/api/idf', '/api/report/gate-status'])
  urls.push([e.split('?')[0], e]);
const reqs = urls.map(([k, p]) => ({ kind: k, m: 'GET', path: p }));
for (const L of ['heat', 'cold', 'rain_hz', 'wind', 'flood', 'flood_pluvial', 'flood_riverine', 'landslide', 'glof', 'drought', 'nss_baseline', 'nss_dynamic']) for (const d of [0, 1, 2, 3]) reqs.push({ kind: '/api/levels(layer,day)', m: 'GET', path: `/api/levels?layer=${L}&day=${d}` });
for (const p of ['/api/alerts', '/api/verdicts', '/api/outlook/national?day=3', '/api/outlook/status']) reqs.push({ kind: p.split('?')[0], m: 'GET', path: p });
for (const p of places.slice(0, 30)) reqs.push({ kind: '/api/outlook/unit', m: 'GET', path: `/api/outlook/unit?unit=${encodeURIComponent(p.uid)}` });
const lim = [{ variable: 'temperature_2m', limit: 30, dir: 'above', durationMin: 120 }, { variable: 'temperature_2m_max', limit: 35, dir: 'above' }, { variable: 'temperature_2m_min', limit: 5, dir: 'below' },
  { variable: 'precipitation_24h', limit: 10, dir: 'above' }, { variable: 'wind_gusts_10m', limit: 50, dir: 'above' }, { variable: 'utci_shade', limit: 32, dir: 'above' }, { variable: 'river_discharge', limit: 2000, dir: 'above' }];
for (let i = 0; i < 12; i++) { const p = places[i * 5]; reqs.push({ kind: 'POST /api/limits/evaluate', m: 'POST', path: '/api/limits/evaluate', body: { assets: [{ id: 'a' + i, name: 'asset ' + i, lat: p.la, lon: p.lo, limits: lim }] } }); }
for (const [la, lo] of [[25.2088, 64.6357], [24.8125, 66.97], [24.75, 66.9], [34.5553, 69.2075]]) reqs.push({ kind: '/api/point/forecast (D18)', m: 'GET', path: '/api/point/forecast?lat=' + la + '&lon=' + lo });
writeFileSync(OUT, JSON.stringify(reqs)); console.log('requests', reqs.length);
