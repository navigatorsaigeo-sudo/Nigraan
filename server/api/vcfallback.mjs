/* ══ v91.17.147 · FORECAST FALLBACK WHEN THE PAID FORECAST LIMIT IS REACHED (Visual Crossing, vc.key) ═════════════════════
   Used when the forecast provider refuses a point request because its quota is spent (HTTP 429), for up to 5 locations;
   v91.17.269 (INFRA A7): also when it fails (5xx after the retry, no answer, a timeout) or is in an outage (server.mjs OM_OUTAGE).
   The Visual Crossing timeline (hourly, 15 days) is mapped onto the same response shape the pages read, and marked
   agn_fallback. NIGRAAN's corrections are NOT applied to it: they were fitted and tested on the main provider's numbers, and
   applying them to another model's output is untested (it could correct twice). The page shows the fallback as the global
   forecast with reduced confidence. The key stays in this process; the browser never sees it. */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createSign, createPrivateKey } from 'node:crypto';

/* v91.17.157 · audit: Visual Crossing 'feelslike' is a heat index / wind chill, not the Steadman apparent temperature; it is no longer
   served under that name (apparent_temperature is null and listed in agn_fallback.missing) */
const MAP = { temperature_2m: 'temp', relative_humidity_2m: 'humidity', dew_point_2m: 'dew', precipitation: 'precip',
  precipitation_probability: 'precipprob', wind_speed_10m: 'windspeed', wind_gusts_10m: 'windgust', wind_direction_10m: 'winddir', pressure_msl: 'pressure', cloud_cover: 'cloudcover' };
const WIND = { kmh: 1, ms: 1 / 3.6, mph: 1 / 1.609344, kn: 1 / 1.852 };
export function vcKey(root) { try { const f = join(root, 'vc.key'); if (!existsSync(f)) return null; const v = readFileSync(f, 'utf8').trim(); return /^[A-Za-z0-9]{16,64}$/.test(v) ? v : null; } catch (_) { return null; } }
/* the request as the page asked it (the main forecast's parameters) */
function parseAsk(qs) {
  const lats = String(qs.get('latitude') || '').split(',').map(Number), lons = String(qs.get('longitude') || '').split(',').map(Number);
  if (!lats.length || lats.length > 5 || lats.length !== lons.length || lats.some((x) => !Number.isFinite(x))) return null;
  const tz = String(qs.get('timezone') || 'GMT'); const off = /karachi|auto/i.test(tz) ? 18000 : 0;
  const hv = String(qs.get('hourly') || '').split(',').filter(Boolean), dv = String(qs.get('daily') || '').split(',').filter(Boolean), cv = String(qs.get('current') || '').split(',').filter(Boolean);
  const wk = WIND[String(qs.get('wind_speed_unit') || 'kmh')] || 1;
  const days = Math.min(15, Number(qs.get('forecast_days') || 7)), past = Math.min(5, Number(qs.get('past_days') || 0));
  return { lats, lons, off, hv, dv, cv, wk, days, past };
}
/* v91.17.269 · one shaping for every secondary forecast: hours and current conditions in the units and names of the first secondary
   source (temp C, humidity %, dew C, precip mm, precipprob %, windspeed/windgust km/h, winddir deg, pressure hPa, cloudcover %,
   datetimeEpoch s) become the main forecast's response shape; daily values are rebuilt from whole local days of hours */
function shapeLocation(A, lat, lon, elevation, hours, current, why) {
  const { off, hv, dv, cv, wk, days, past } = A;
  /* hours from local midnight of the first requested day (the main forecast's convention) */
  const startLocal = Date.parse(new Date(Date.now() + off * 1000 - past * 864e5).toISOString().slice(0, 10) + 'T00:00:00Z') - off * 1000;
  const hrs = hours.filter((h) => h.datetimeEpoch * 1000 >= startLocal && h.datetimeEpoch * 1000 < startLocal + (past + days) * 864e5).sort((a, b) => a.datetimeEpoch - b.datetimeEpoch);
  const iso = (ep) => new Date((ep + off) * 1000).toISOString().slice(0, 16);
  const loc = { latitude: lat, longitude: lon, elevation, utc_offset_seconds: off, timezone: off ? 'Asia/Karachi' : 'GMT' };
  if (hv.length) { loc.hourly = { time: hrs.map((h) => iso(h.datetimeEpoch)) }; loc.hourly_units = {};
    for (const v of hv) { const k = MAP[v]; loc.hourly[v] = hrs.map((h) => (k && h[k] != null) ? (v.startsWith('wind_') && v !== 'wind_direction_10m' ? Math.round(h[k] * wk * 10) / 10 : h[k]) : null); } }
  /* v91.17.157 · audit: the provider's days are UTC days (timezone=Z); daily values are rebuilt from the hours on the requested local
     day (PKT when asked), whole days only, so a night minimum or evening rain is not put on the wrong day */
  if (dv.length) { const by = new Map(); hrs.forEach((h) => { const d = iso(h.datetimeEpoch).slice(0, 10); (by.get(d) || by.set(d, []).get(d)).push(h); });
    const ds = [...by.keys()].sort(); loc.daily = { time: ds };
    const whole = (d) => (by.get(d) || []).length >= 24;
    const agg = (d, k, f) => { if (!whole(d)) return null; const v = by.get(d).map((h) => h[k]).filter((x) => x != null && Number.isFinite(x)); return v.length >= 24 ? f(v) : null; };
    for (const v of dv) loc.daily[v] = ds.map((d) => v === 'temperature_2m_max' ? agg(d, 'temp', (a) => Math.max(...a)) : v === 'temperature_2m_min' ? agg(d, 'temp', (a) => Math.min(...a))
      : v === 'precipitation_sum' ? agg(d, 'precip', (a) => Math.round(a.reduce((x, y) => x + y, 0) * 10) / 10) : null); }
  if (cv.length && current) { const c = current; loc.current = { time: iso(c.datetimeEpoch) }; for (const v of cv) { const k = MAP[v]; loc.current[v] = k && c[k] != null ? (v.startsWith('wind_') && v !== 'wind_direction_10m' ? Math.round(c[k] * wk * 10) / 10 : c[k]) : null; } }
  const missing = [...new Set([...hv.filter((v) => !MAP[v]), ...dv.filter((v) => !/^(temperature_2m_max|temperature_2m_min|precipitation_sum)$/.test(v)), ...cv.filter((v) => !MAP[v])])];
  loc.agn_fallback = { applied: true, source: 'secondary global forecast (' + (why === 'outage' ? 'the main forecast is unavailable' : 'the main forecast quota is spent') + ')', corrected: false, missing, missingWhy: missing.length ? 'not carried by the secondary forecast: shown as no data, not as zero' : null,
    note: "NIGRAAN's corrections are tested on the main forecast only and are not applied to this one; confidence is reduced" };
  return loc;
}
export async function vcForecast(qs, key, why = 'quota') {
  const A = parseAsk(qs); if (!A) return null;
  const { lats, lons, days, past } = A;
  const out = [];
  for (let i = 0; i < lats.length; i++) {
    const d0 = new Date(Date.now() - (past + 1) * 864e5).toISOString().slice(0, 10), d1 = new Date(Date.now() + (days - 1) * 864e5).toISOString().slice(0, 10);
    const u = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${lats[i]},${lons[i]}/${d0}/${d1}?unitGroup=metric&include=hours,current,days&timezone=Z&elements=datetime,datetimeEpoch,tempmax,tempmin,${Object.values(MAP).join(',')}&key=${encodeURIComponent(key)}`;
    const r = await fetch(u, { signal: AbortSignal.timeout(45000) }); if (!r.ok) return null; const j = await r.json();
    out.push(shapeLocation(A, lats[i], lons[i], j.elevation ?? null, (j.days || []).flatMap((d) => d.hours || []), j.currentConditions || null, why));
  }
  return out.length === 1 ? out[0] : out;
}

/* ══ v91.17.269 · INFRA A7 · A FURTHER SECONDARY FORECAST, ONLY IF ITS KEY FILE EXISTS (weatherkit.key beside vc.key) ═══════════════
   Internal: never named to clients (the answer is the same "secondary global forecast", header x-agn-fallback: 2). Used for a point
   request when the main forecast failed or is in an outage (or its quota is spent) and the first secondary forecast is not configured
   or did not answer. The key file (team=, keyid=, service= lines and the private key block) is read by this process only, signed into
   a 5-minute token here, and never logged or sent to the browser. Units of the source (REST API, metric): temperature and dew point
   C, humidity / precipitationChance / cloudCover 0-1 (here x100 to %), precipitationAmount mm per hour, windSpeed / windGust km/h,
   windDirection deg, pressure mb (= hPa, sea level). Its hourly forecast reaches 10 days (240 h); later days are left empty (no data,
   not zero), as are the variables it does not carry. Same rules as the first secondary forecast: not corrected, confidence reduced. */
export function wkPresent(root) { try { return existsSync(join(root, 'weatherkit.key')); } catch (_) { return false; } }
function wkCred(root) {
  try { const t = readFileSync(join(root, 'weatherkit.key'), 'utf8'); const g = (k) => (t.match(new RegExp('^\\s*' + k + '\\s*=\\s*(\\S+)', 'mi')) || [])[1];
    const pem = (t.match(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/) || [])[0]; const team = g('team'), kid = g('keyid'), sid = g('service');
    return team && kid && sid && pem ? { team, kid, sid, pem } : null; } catch (_) { return null; }
}
function wkToken(c) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'), now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'ES256', kid: c.kid, id: c.team + '.' + c.sid }), q = b64({ iss: c.team, iat: now, exp: now + 300, sub: c.sid });
  return h + '.' + q + '.' + createSign('SHA256').update(h + '.' + q).sign({ key: createPrivateKey(c.pem), dsaEncoding: 'ieee-p1363' }).toString('base64url');
}
const pct = (x) => (x == null || !Number.isFinite(Number(x)) ? null : Math.round(Number(x) * 1000) / 10);
/* one hour (or the current conditions) of the source in the shaping's names and units */
export function wkHour(h, timeKey) {
  const ep = Math.floor(Date.parse(h[timeKey]) / 1000); if (!Number.isFinite(ep)) return null;
  return { datetimeEpoch: ep, temp: h.temperature ?? null, humidity: pct(h.humidity), dew: h.temperatureDewPoint ?? null, precip: h.precipitationAmount ?? null,
    precipprob: pct(h.precipitationChance), windspeed: h.windSpeed ?? null, windgust: h.windGust ?? null, winddir: h.windDirection ?? null, pressure: h.pressure ?? null, cloudcover: pct(h.cloudCover) };
}
export function wkShape(qs, rows, why) {   /* rows: one parsed source answer per location (tests call this with fixtures) */
  const A = parseAsk(qs); if (!A || rows.length !== A.lats.length) return null;
  const out = rows.map((j, i) => shapeLocation(A, A.lats[i], A.lons[i], null, ((j.forecastHourly && j.forecastHourly.hours) || []).map((h) => wkHour(h, 'forecastStart')).filter(Boolean),
    j.currentWeather ? wkHour(j.currentWeather, 'asOf') : null, why));
  return out.length === 1 ? out[0] : out;
}
export async function wkForecast(qs, root, why = 'outage') {
  const A = parseAsk(qs); if (!A) return null;
  const c = wkCred(root); if (!c) return null;
  const tok = wkToken(c), rows = [];
  const startLocal = Date.parse(new Date(Date.now() + A.off * 1000 - A.past * 864e5).toISOString().slice(0, 10) + 'T00:00:00Z') - A.off * 1000;
  const end = Math.min(startLocal + (A.past + A.days) * 864e5, Date.now() + 240 * 3600e3);
  for (let i = 0; i < A.lats.length; i++) {
    const u = 'https://weatherkit.apple.com/api/v1/weather/en/' + A.lats[i] + '/' + A.lons[i] + '?dataSets=currentWeather,forecastHourly&timezone=' + (A.off ? 'Asia/Karachi' : 'Etc/UTC')
      + '&hourlyStart=' + encodeURIComponent(new Date(startLocal).toISOString()) + '&hourlyEnd=' + encodeURIComponent(new Date(end).toISOString());
    const r = await fetch(u, { headers: { Authorization: 'Bearer ' + tok }, signal: AbortSignal.timeout(45000) }); if (!r.ok) return null;
    rows.push(await r.json());
  }
  return wkShape(qs, rows, why);
}
/* the secondary forecasts in order: the first (vc.key), then the further one (weatherkit.key); null when none is configured or answers */
export async function secondaryForecast(root, qs, why) {
  const key = vcKey(root);
  if (key) { try { const fb = await vcForecast(qs, key, why); if (fb) return { body: fb, tier: 1 }; } catch (_) {} }
  if (wkPresent(root)) { try { const fb = await wkForecast(qs, root, why); if (fb) return { body: fb, tier: 2 }; } catch (_) {} }
  return null;
}
