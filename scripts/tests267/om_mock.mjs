/* v91.17.267 · a deterministic stand-in for the provider's /v1/forecast answer (tests only; no network).
   omAnswer(params, nowMs) -> the JSON the provider would return for these query parameters: one object per location (an array for
   several), hourly time axis from local midnight past_days before the issue day, forecast_days ahead, in the request's time zone;
   every requested hourly variable, once per model with a _<model> suffix when several models are asked. Values are smooth functions
   of place, hour and model, rounded like the provider's (0.1 / integers). Model run ends follow the real ones roughly (ARPEGE ~4 d,
   UKMO 7 d, ICON 7.5 d) and a few gaps are cut in, so the nested model sets of the blend are exercised. */
const TZ = { GMT: 0, UTC: 0, 'Asia/Karachi': 18000, auto: 18000 };
const MODEL_BIAS = { best_match: 0.0, ecmwf_ifs025: 0.4, gfs_global: -0.9, icon_global: 0.8, gem_global: -0.4, jma_gsm: 0.3,
  ukmo_global_deterministic_10km: -0.2, cma_grapes_global: 1.4, meteofrance_arpege_world: -1.1, ecmwf_aifs025_single: 0.2,
  icon_seamless: 0.7, gfs_seamless: -0.8, meteofrance_seamless: -1.0 };
const END_H = { meteofrance_arpege_world: 102, ukmo_global_deterministic_10km: 166, icon_global: 178, jma_gsm: 260, cma_grapes_global: 238, meteofrance_seamless: 106, icon_seamless: 178 };
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const r1 = (v) => Math.round(v * 10) / 10;
function dem(lat, lon) { return Math.round(Math.max(0, (lat - 24) * 180 + (lat > 33.5 ? (lat - 33.5) * 1800 : 0) + hash(lat.toFixed(2) + lon.toFixed(2)) * 40)); }
function tempOf(lat, lon, elev, tMs, model, nowMs) {
  const d = new Date(tMs); const hUtc = d.getUTCHours() + d.getUTCMinutes() / 60; const doy = Math.floor((tMs - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5);
  const season = 24.5 - 13 * Math.cos(2 * Math.PI * (doy - 15) / 365) - (lat - 30) * 0.6;
  const diurnal = 7.5 * Math.sin(2 * Math.PI * (hUtc + 5 - 9) / 24);
  const synoptic = 2.8 * Math.sin(2 * Math.PI * (tMs / 864e5) / 5.3 + lon) + 1.6 * Math.sin(2 * Math.PI * (tMs / 864e5) / 2.1);
  const lead = (tMs - nowMs) / 864e5; const spread = (hash(model + Math.floor(tMs / 10800e3)) - 0.5) * (0.6 + 0.25 * Math.max(0, lead));
  return season + diurnal + synoptic - 0.0065 * elev + (MODEL_BIAS[model] || 0) + spread;
}
function valueOf(v, lat, lon, elev, tMs, model, nowMs) {
  const t = tempOf(lat, lon, elev, tMs, model, nowMs);
  const dep = 7 + 4 * Math.cos(2 * Math.PI * (new Date(tMs).getUTCHours() + 5 - 15) / 24) + 3 * hash(model + 'd' + Math.floor(tMs / 21600e3));
  const td = t - Math.max(0.5, dep);
  switch (v) {
    case 'temperature_2m': return r1(t);
    case 'dew_point_2m': return r1(td);
    case 'relative_humidity_2m': return Math.round(100 * Math.exp(17.625 * td / (243.04 + td)) / Math.exp(17.625 * t / (243.04 + t)));
    case 'apparent_temperature': return r1(t + 0.2 * (td - 10));
    case 'cloud_cover': return Math.round(100 * Math.max(0, Math.sin(tMs / 864e5 + lat) - 0.3));
    case 'wind_speed_10m': return r1(6 + 5 * hash(v + model + Math.floor(tMs / 3600e3)));
    case 'wind_direction_10m': return Math.round(360 * hash('wd' + Math.floor(tMs / 10800e3)));
    case 'wind_gusts_10m': return r1(12 + 8 * hash('g' + Math.floor(tMs / 3600e3)));
    case 'shortwave_radiation': { const h = (new Date(tMs).getUTCHours() + 5) % 24; return h >= 7 && h <= 17 ? Math.round(750 * Math.sin(Math.PI * (h - 6) / 12)) : 0; }
    case 'precipitation': case 'rain': case 'showers': return hash('p' + Math.floor(tMs / 3600e3) + lat.toFixed(1)) > 0.97 ? r1(2 * hash('q' + tMs)) : 0;
    case 'snowfall': return 0;
    case 'pressure_msl': return r1(1008 + 4 * Math.sin(tMs / 864e5));
    case 'surface_pressure': return r1(1008 - elev / 8.5);
    case 'weather_code': return 1;
    case 'precipitation_probability': return 5;
    case 'cape': return 300;
    case 'freezing_level_height': return 4500;
    case 'uv_index': return 5;
    case 'visibility': return 20000;
    case 'is_day': return ((new Date(tMs).getUTCHours() + 5) % 24) >= 6 && ((new Date(tMs).getUTCHours() + 5) % 24) <= 18 ? 1 : 0;
    default: return 0;
  }
}
const UNIT = { temperature_2m: '°C', dew_point_2m: '°C', apparent_temperature: '°C', relative_humidity_2m: '%', cloud_cover: '%', wind_speed_10m: 'km/h', wind_gusts_10m: 'km/h', wind_direction_10m: '°', shortwave_radiation: 'W/m²', precipitation: 'mm' };
const isoLocal = (ms, off) => new Date(ms + off * 1000).toISOString().slice(0, 16);
/* is a model's value missing at this hour (run end, cut gaps)? */
function missing(model, v, tMs, nowMs) {
  const h = (tMs - nowMs) / 3600e3;
  if (END_H[model] != null && h > END_H[model]) return true;
  if (model === 'ecmwf_aifs025_single' && h > 30 && h < 40) return true;              /* a gap: the 9-set is not complete */
  if (model === 'cma_grapes_global' && h > 60 && h < 66) return true;
  if (model === 'jma_gsm' && v === 'dew_point_2m' && h > 10 && h < 13) return true;  /* T without Td: the set must not be used */
  return false;
}
export function omAnswer(P, nowMs) {
  const get = (k) => (P instanceof URLSearchParams ? P.get(k) : P[k]);
  const list = (k) => String(get(k) || '').split(',').filter((x) => x !== '');
  const las = list('latitude').map(Number), los = list('longitude').map(Number), els = list('elevation');
  const models = list('models').length ? list('models') : ['best_match'];
  const hourly = list('hourly'); const tz = get('timezone') || 'GMT'; const off = TZ[tz] ?? 0;
  const pd = Number(get('past_days') || 0), fd = Number(get('forecast_days') || 7);
  const out = las.map((la, i) => {
    const lo = los[i]; const e = els[i] != null && els[i] !== 'nan' && els[i] !== '' ? Number(els[i]) : dem(la, lo);
    const day0 = Math.floor((nowMs + off * 1000) / 864e5) * 864e5 - off * 1000 - pd * 864e5; const n = (pd + fd) * 24;
    const H = { time: [] }; const U = { time: 'iso8601' };
    for (let k = 0; k < n; k++) H.time.push(isoLocal(day0 + k * 3600e3, off));
    for (const v of hourly) for (const m of models) {
      const key = models.length > 1 ? v + '_' + m : v; U[key] = UNIT[v] || '';
      H[key] = H.time.map((_, k) => { const t = day0 + k * 3600e3; return missing(m, v, t, nowMs) ? null : valueOf(v, la, lo, e, t, m, nowMs); });
    }
    const loc = { latitude: Math.round(la * 10) / 10, longitude: Math.round(lo * 10) / 10, generationtime_ms: 0.5, utc_offset_seconds: off, timezone: tz === 'auto' ? 'Asia/Karachi' : tz,
      timezone_abbreviation: off ? 'GMT+5' : 'GMT', elevation: e };
    if (hourly.length) { loc.hourly_units = U; loc.hourly = H; }
    const cur = list('current'); if (cur.length) { const t = Math.floor(nowMs / 900e3) * 900e3; loc.current_units = {}; loc.current = { time: isoLocal(t, off), interval: 900 };
      for (const v of cur) loc.current[v] = valueOf(v, la, lo, e, t, models[0], nowMs); }
    return loc;
  });
  return out.length === 1 ? out[0] : out;
}
