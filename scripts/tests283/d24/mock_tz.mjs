/* v91.17.283.2 · D2/D4 test fixture (copy of the WS perf mock, mockom.mjs, with per-location `auto` time zones: MOCK_KOLKATA="lat,lon;..." points
   resolve to Asia/Kolkata, as a point in the IIOJK polygons does at the provider). A deterministic Open-Meteo-shaped provider.
   - every https request to *.open-meteo.com is answered here from a synthetic generator (no network, no key leaves);
   - every other non-loopback request fails at once (offline, deterministic);
   - MOCK_FREEZE=<epoch ms> freezes Date.now()/new Date() (value-comparison runs only; timing runs use the real clock);
   - MOCK_LOG=<file> appends one JSON line per provider call {t, host, path, nLoc, nVar, models, days, caller}. */
import { appendFileSync } from 'node:fs';
const FREEZE = Number(process.env.MOCK_FREEZE || 0);
if (FREEZE) {
  const RD = Date;
  class FD extends RD { constructor(...a) { if (a.length) super(...a); else super(FREEZE); } static now() { return FREEZE; } }
  globalThis.Date = FD;
}
const LOG = process.env.MOCK_LOG || '';
const realFetch = globalThis.fetch;
const h32 = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; };
const r01 = (...k) => h32(k.join('|')) / 4294967296;
const MOFF = (m) => m === 'best_match' || !m ? 0 : (m === 'icon_seamless' ? 0.4 : m === 'gfs_seamless' ? -0.35 : m === 'meteofrance_seamless' ? 0.25 : (r01('m', m) - 0.5) * 1.6);
const elevOf = (la, lo) => Math.max(0, Math.round((la - 29.5) * 520 + (lo - 70) * 60 + r01('e', la.toFixed(3), lo.toFixed(3)) * 120));
function tAt(la, lo, el, ms, m, mem) {
  const d = new Date(ms); const hUtc = d.getUTCHours() + d.getUTCMinutes() / 60; const doy = Math.floor(ms / 864e5) % 365;
  const base = 31 - 0.0065 * el - (la - 25) * 0.9 - 6 * Math.cos(2 * Math.PI * (doy - 200) / 365) * 0 - 3;
  const amp = 6 + 3 * r01('amp', la.toFixed(2), lo.toFixed(2));
  const trend = 1.5 * Math.sin(ms / 864e5 / 2.7 + la);
  return base + amp * Math.sin(2 * Math.PI * (hUtc - 4) / 24) + trend + MOFF(m) + (mem != null ? (r01('mem', mem, Math.floor(ms / 864e5)) - 0.5) * 3 : 0) + (r01('n', la.toFixed(3), lo.toFixed(3), Math.floor(ms / 3600e3), m || '') - 0.5) * 0.8;
}
const magnus = (t, td) => Math.max(1, Math.min(100, 100 * Math.exp((17.625 * td) / (243.04 + td)) / Math.exp((17.625 * t) / (243.04 + t))));
function val(v, la, lo, el, ms, m, mem) {
  const T = tAt(la, lo, el, ms, m, mem); const day = Math.floor(ms / 864e5); const hr = new Date(ms).getUTCHours();
  const dep = 6 + 10 * r01('dep', la.toFixed(2), lo.toFixed(2), day); const Td = T - dep;
  const wet = r01('wet', la.toFixed(1), lo.toFixed(1), day, m || '') < 0.18; const pr = wet && (hr % 6 < 3) ? Math.round(r01('p', la, lo, ms, m || '') * 40) / 10 : 0;
  const cl = Math.round(wet ? 70 + r01('c', la, lo, ms) * 30 : r01('c', la, lo, ms) * 60);
  const ws = Math.round((3 + r01('w', la, lo, ms, m || '') * 18) * 10) / 10;
  const sw = Math.max(0, Math.round(850 * Math.sin(Math.PI * (hr - 1) / 13) * (1 - cl / 150)));
  const R1 = (x) => Math.round(x * 10) / 10;
  switch (v) {
    case 'temperature_2m': return R1(T);
    case 'dew_point_2m': return R1(Td);
    case 'relative_humidity_2m': return Math.round(magnus(T, Td));
    case 'apparent_temperature': return R1(T + (magnus(T, Td) - 40) * 0.05 - ws * 0.05);
    case 'precipitation': return pr; case 'rain': return T > 1 ? pr : 0; case 'showers': return 0; case 'snowfall': return T <= 1 ? R1(pr * 0.7) : 0;
    case 'precipitation_probability': return wet ? 60 + Math.round(r01('pp', la, lo, day) * 40) : Math.round(r01('pp', la, lo, day) * 20);
    case 'weather_code': return pr > 0 ? (T <= 1 ? 71 : 61) : cl > 80 ? 3 : cl > 40 ? 2 : 0;
    case 'pressure_msl': return R1(1008 + 6 * Math.sin(ms / 864e5 / 3));
    case 'surface_pressure': return R1(1008 * Math.exp(-el / 8400));
    case 'cloud_cover': return cl; case 'cloud_cover_low': return Math.round(cl * 0.5); case 'cloud_cover_mid': return Math.round(cl * 0.3); case 'cloud_cover_high': return Math.round(cl * 0.4);
    case 'wind_speed_10m': return ws; case 'wind_direction_10m': return Math.round(r01('wd', la, lo, day) * 359); case 'wind_gusts_10m': return R1(ws * 1.7);
    case 'shortwave_radiation': case 'direct_radiation': case 'global_tilted_irradiance': return sw; case 'diffuse_radiation': return Math.round(sw * 0.25);
    case 'et0_fao_evapotranspiration': return Math.round(sw / 900 * 0.6 * 100) / 100; case 'vapour_pressure_deficit': return Math.round(Math.max(0, 0.6108 * Math.exp(17.27 * T / (T + 237.3)) * (1 - magnus(T, Td) / 100)) * 100) / 100;
    case 'cape': return Math.round(r01('cape', la, lo, ms) * (wet ? 1500 : 200)); case 'uv_index': return R1(sw / 90); case 'is_day': return sw > 0 ? 1 : 0;
    case 'freezing_level_height': return Math.round(4200 + 600 * Math.sin(ms / 864e5 / 5)); case 'boundary_layer_height': return Math.round(300 + sw * 2);
    case 'visibility': return wet ? 8000 : 24000; case 'snow_depth': return el > 3500 ? 0.2 : 0; case 'soil_temperature_0cm': return R1(T + sw / 200);
    case 'river_discharge': case 'river_discharge_mean': case 'river_discharge_median': case 'river_discharge_max': case 'river_discharge_min': case 'river_discharge_p25': case 'river_discharge_p75': return R1(50 + 400 * r01('q', la, lo) + 30 * Math.sin(ms / 864e5 / 4));
    case 'pm2_5': case 'pm10': case 'us_aqi': case 'european_aqi': case 'nitrogen_dioxide': case 'ozone': case 'carbon_monoxide': case 'sulphur_dioxide': case 'dust': case 'aerosol_optical_depth': return R1(20 + 60 * r01('aq', v, la, lo, hr));
    default:
      if (/^soil_moisture/.test(v)) return Math.round((0.08 + 0.2 * r01('sm', la, lo, day)) * 1000) / 1000;
      if (/^temperature_\d+hPa|^temperature_2m_previous/.test(v)) return R1(T - 2);
      return R1(r01(v, la, lo, ms) * 10);
  }
}
const DAILY = { temperature_2m_max: ['temperature_2m', 'max'], temperature_2m_min: ['temperature_2m', 'min'], temperature_2m_mean: ['temperature_2m', 'mean'], apparent_temperature_max: ['apparent_temperature', 'max'], apparent_temperature_min: ['apparent_temperature', 'min'],
  precipitation_sum: ['precipitation', 'sum'], rain_sum: ['rain', 'sum'], snowfall_sum: ['snowfall', 'sum'], wind_speed_10m_max: ['wind_speed_10m', 'max'], wind_gusts_10m_max: ['wind_gusts_10m', 'max'], shortwave_radiation_sum: ['shortwave_radiation', 'sum'], uv_index_max: ['uv_index', 'max'], precipitation_probability_max: ['precipitation_probability', 'max'], et0_fao_evapotranspiration: ['et0_fao_evapotranspiration', 'sum'], weather_code: ['weather_code', 'max'], precipitation_hours: ['precipitation', 'count'], river_discharge: ['river_discharge', 'mean'], river_discharge_mean: ['river_discharge', 'mean'], river_discharge_median: ['river_discharge', 'mean'], river_discharge_max: ['river_discharge', 'max'], river_discharge_min: ['river_discharge', 'min'], river_discharge_p25: ['river_discharge', 'min'], river_discharge_p75: ['river_discharge', 'max'] };
const pad = (n) => String(n).padStart(2, '0');
const iso = (ms, off) => { const d = new Date(ms + off * 1000); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); };
const KOL = new Set(String(process.env.MOCK_KOLKATA || '').split(';').filter(Boolean).map((x) => x.split(',').map(Number).join(',')));
function tzOf(tz, la, lo) { if (/^auto$/i.test(tz)) return KOL.has(la + ',' + lo) ? ['Asia/Kolkata', 19800, 'GMT+5:30'] : ['Asia/Karachi', 18000, 'GMT+5']; if (/karachi/i.test(tz)) return ['Asia/Karachi', 18000, 'GMT+5']; if (/kolkata/i.test(tz)) return ['Asia/Kolkata', 19800, 'GMT+5:30']; return ['GMT', 0, 'GMT']; }
function build(u) {
  const q = u.searchParams; const path = u.pathname; const ens = path === '/v1/ensemble';
  const las = String(q.get('latitude') || '').split(',').filter(Boolean).map(Number), los = String(q.get('longitude') || '').split(',').filter(Boolean).map(Number);
  const els = String(q.get('elevation') || '').split(',');
  const tz = String(q.get('timezone') || 'GMT');
  const hv = String(q.get('hourly') || '').split(',').filter(Boolean), dv = String(q.get('daily') || '').split(',').filter(Boolean), cv = String(q.get('current') || '').split(',').filter(Boolean), m15 = String(q.get('minutely_15') || '').split(',').filter(Boolean);
  const models = String(q.get('models') || '').split(',').filter(Boolean); const multi = models.length > 1;
  const now = Date.now(); const nowH = Math.floor(now / 3600e3) * 3600e3;
  const win = (off) => { const dayStart = Math.floor((now + off * 1000) / 864e5) * 864e5 - off * 1000; let t0, nH;
  if (q.get('start_date') && q.get('end_date')) { t0 = Date.parse(q.get('start_date') + 'T00:00:00Z') - off * 1000; nH = Math.round((Date.parse(q.get('end_date') + 'T00:00:00Z') - Date.parse(q.get('start_date') + 'T00:00:00Z')) / 3600e3) + 24; }
  else if (q.get('start_hour') && q.get('end_hour')) { t0 = Date.parse(q.get('start_hour') + 'Z') - off * 1000; nH = Math.round((Date.parse(q.get('end_hour') + 'Z') - Date.parse(q.get('start_hour') + 'Z')) / 3600e3) + 1; }
  else if (q.has('past_hours') || q.has('forecast_hours')) { const ph = Number(q.get('past_hours') || 0), fh = Number(q.get('forecast_hours') || (Number(q.get('forecast_days') || 7) * 24)); t0 = nowH - ph * 3600e3; nH = ph + fh; }
  else { const pd = Number(q.get('past_days') || 0), fd = Number(q.get('forecast_days') || (ens ? 7 : path === '/v1/flood' ? 92 : 7)); t0 = dayStart - pd * 864e5; nH = (pd + fd) * 24; }
  nH = Math.max(1, Math.min(nH, 24 * 400)); return [t0, nH]; };
  const mList = ens ? [models[0] || 'ens'] : (models.length ? models : ['best_match']);
  const memList = ens ? Array.from({ length: 30 }, (_, i) => i) : [null];
  const out = las.map((la, i) => {
    const lo = los[i] ?? los[0]; const [tzName, off, tzAbbr] = tzOf(tz, la, lo); const [t0, nH] = win(off); const e0 = els[i] != null && els[i] !== '' && els[i] !== 'nan' ? Number(els[i]) : elevOf(la, lo);
    const L = { latitude: Math.round(la * 1e4) / 1e4, longitude: Math.round(lo * 1e4) / 1e4, generationtime_ms: 0.5, utc_offset_seconds: off, timezone: tzName, timezone_abbreviation: tzAbbr, elevation: e0 };
    const keyOf = (v, m, k) => v + (multi ? '_' + m : '') + (k != null ? (k === 0 ? '' : '_member' + pad(k)) : '');
    if (hv.length) { const H = { time: [] }, HU = { time: 'iso8601' }; for (let k = 0; k < nH; k++) H.time.push(iso(t0 + k * 3600e3, off));
      for (const v of hv) for (const m of mList) for (const mem of memList) { const a = new Array(nH); for (let k = 0; k < nH; k++) a[k] = val(v, la, lo, e0, t0 + k * 3600e3, m, mem); H[keyOf(v, m, mem)] = a; HU[keyOf(v, m, mem)] = 'u'; }
      L.hourly_units = HU; L.hourly = H; }
    if (m15.length) { const n = nH * 4, M = { time: [] }; for (let k = 0; k < n; k++) M.time.push(iso(t0 + k * 900e3, off)); for (const v of m15) for (const m of mList) { const a = new Array(n); for (let k = 0; k < n; k++) a[k] = val(v, la, lo, e0, t0 + k * 900e3, m); M[keyOf(v, m, null)] = a; } L.minutely_15 = M; }
    if (dv.length) { const nD = Math.max(1, Math.round(nH / 24)); const D = { time: [] }; for (let d = 0; d < nD; d++) D.time.push(iso(t0 + d * 864e5, off).slice(0, 10));
      for (const v of dv) for (const m of mList) for (const mem of memList) { const spec = DAILY[v] || [v, 'max']; const a = new Array(nD);
        for (let d = 0; d < nD; d++) { const xs = []; for (let k = 0; k < 24; k++) xs.push(val(spec[0], la, lo, e0, t0 + d * 864e5 + k * 3600e3, m, mem));
          a[d] = spec[1] === 'max' ? Math.max(...xs) : spec[1] === 'min' ? Math.min(...xs) : spec[1] === 'sum' ? Math.round(xs.reduce((x, y) => x + y, 0) * 10) / 10 : spec[1] === 'count' ? xs.filter((x) => x > 0).length : Math.round(xs.reduce((x, y) => x + y, 0) / 24 * 10) / 10; }
        D[keyOf(v, m, mem)] = a; }
      L.daily_units = Object.fromEntries(Object.keys(D).map((k) => [k, 'u'])); L.daily = D; }
    if (cv.length) { const C = { time: iso(Math.floor(now / 900e3) * 900e3, off), interval: 900 }; for (const v of cv) for (const m of mList) C[keyOf(v, m, null)] = val(v, la, lo, e0, Math.floor(now / 900e3) * 900e3, m); L.current = C; }
    return L;
  });
  if (path === '/v1/search') return { results: [] };
  if (path === '/v1/elevation') return { elevation: las.map((la, i) => elevOf(la, los[i] ?? los[0])) };
  return out.length === 1 ? out[0] : out;
}
globalThis.fetch = async function (input, init) {
  const url = typeof input === 'string' ? input : (input && input.url) || String(input);
  let u; try { u = new URL(url); } catch { return realFetch(input, init); }
  if (/^(127\.0\.0\.1|localhost|\[::1\])$/.test(u.hostname)) return realFetch(input, init);
  if (/open-meteo\.com$/.test(u.hostname)) {
    const _t0 = performance.now(); const body = JSON.stringify(build(u)); const _ms = Math.round(performance.now() - _t0);
    if (LOG) { try { const q = u.searchParams; appendFileSync(LOG, JSON.stringify({ t: Date.now(), ms: _ms, host: u.hostname, path: u.pathname, nLoc: String(q.get('latitude') || '').split(',').filter(Boolean).length, hourly: String(q.get('hourly') || '').split(',').filter(Boolean).length, daily: String(q.get('daily') || '').split(',').filter(Boolean).length, models: q.get('models') || '', fd: q.get('forecast_days'), pd: q.get('past_days'), sd: q.get('start_date'), ed: q.get('end_date'), ua: (init && init.headers && (init.headers['user-agent'] || '')) || '', stack: new Error().stack.split('\n').slice(2, 6).map((s) => s.trim().replace(/^at /, '').replace(/\(file:\/\/.*\/server\//, '(').slice(0, 90)).join(' < ') }) + '\n'); } catch (_) {} }
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new TypeError('fetch failed (offline measurement: ' + u.hostname + ')');
};
