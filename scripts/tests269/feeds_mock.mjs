/* v91.17.269 · INFRA A7 · test preload (node --import) for feeds.test.mjs: no network. Every https request is answered here.
   FEEDS_CTL=<json file> {"om": "ok" | "503" | "429" | "throw"} is read on every call; FEEDS_LOG=<file> gets one JSON line per call
   {host, path, status}. The main forecast (*.open-meteo.com) follows the mode; the first secondary forecast (weather.visualcrossing.com)
   and the further one (weatherkit.apple.com: its bearer token is checked against FEEDS_WK_PUB, the test key's public half) answer with
   synthetic hours; anything else fails at once. */
import { readFileSync, appendFileSync } from 'node:fs';
import { createVerify, createPublicKey } from 'node:crypto';
const real = globalThis.fetch;
const mode = () => { try { return JSON.parse(readFileSync(process.env.FEEDS_CTL, 'utf8')).om || 'ok'; } catch (_) { return 'ok'; } };
const log = (o) => { try { appendFileSync(process.env.FEEDS_LOG, JSON.stringify(o) + '\n'); } catch (_) {} };
const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const H = 3600e3;
function omBody(q) {
  const la = String(q.get('latitude') || '').split(',').map(Number), lo = String(q.get('longitude') || '').split(',').map(Number);
  const hv = String(q.get('hourly') || '').split(',').filter(Boolean), dv = String(q.get('daily') || '').split(',').filter(Boolean);
  const days = Number(q.get('forecast_days') || 7), past = Number(q.get('past_days') || 0);
  const t0 = Date.parse(new Date(Date.now() - past * 864e5).toISOString().slice(0, 10) + 'T00:00:00Z'), n = (days + past) * 24;
  const rows = la.map((a, i) => { const o = { latitude: a, longitude: lo[i], elevation: 200, utc_offset_seconds: 0, timezone: 'GMT', hourly: { time: [] }, hourly_units: {} };
    for (let k = 0; k < n; k++) o.hourly.time.push(new Date(t0 + k * H).toISOString().slice(0, 16));
    for (const v of hv) o.hourly[v] = o.hourly.time.map((_, k) => 20 + 5 * Math.sin(k / 24 * 2 * Math.PI));
    if (dv.length) { o.daily = { time: [] }; for (let d = 0; d < days + past; d++) o.daily.time.push(new Date(t0 + d * 864e5).toISOString().slice(0, 10)); for (const v of dv) o.daily[v] = o.daily.time.map(() => 25); }
    return o; });
  return rows.length === 1 ? rows[0] : rows;
}
function vcBody(u) {
  const m = u.pathname.match(/timeline\/([^/]+)\/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})/); const d0 = Date.parse(m[2] + 'T00:00:00Z'), d1 = Date.parse(m[3] + 'T00:00:00Z');
  const days = []; for (let t = d0; t <= d1; t += 864e5) { const hours = []; for (let h = 0; h < 24; h++) { const ep = (t + h * H) / 1000;
    hours.push({ datetime: String(h).padStart(2, '0') + ':00:00', datetimeEpoch: ep, temp: 30 + h / 10, humidity: 40, dew: 15, precip: h === 3 ? 1.2 : 0, precipprob: 20, windspeed: 10, windgust: 18, winddir: 270, pressure: 1006, cloudcover: 30 }); }
    days.push({ datetime: new Date(t).toISOString().slice(0, 10), tempmax: 32.3, tempmin: 30, hours }); }
  return { elevation: 210, days, currentConditions: { datetimeEpoch: Math.floor(Date.now() / 3600e3) * 3600, temp: 31, humidity: 40, dew: 15, precip: 0, windspeed: 10, windgust: 18, winddir: 270, pressure: 1006, cloudcover: 30 } };
}
function wkOk(auth) {
  try { const [h, p, s] = String(auth || '').replace(/^Bearer /, '').split('.'); const hd = JSON.parse(Buffer.from(h, 'base64url')), pl = JSON.parse(Buffer.from(p, 'base64url'));
    if (hd.alg !== 'ES256' || !hd.kid || !hd.id || !pl.iss || !pl.sub || !(pl.exp > Date.now() / 1000)) return false;
    return createVerify('SHA256').update(h + '.' + p).verify({ key: createPublicKey(process.env.FEEDS_WK_PUB), dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')); } catch (_) { return false; }
}
function wkBody(u) {
  const a = Date.parse(u.searchParams.get('hourlyStart')), b = Date.parse(u.searchParams.get('hourlyEnd')); const hours = [];
  for (let t = Math.ceil(a / H) * H; t < b; t += H) hours.push({ forecastStart: new Date(t).toISOString().replace('.000', ''), temperature: 28, temperatureDewPoint: 12, humidity: 0.42, precipitationAmount: 0, precipitationChance: 0.15,
    windSpeed: 12, windGust: 20, windDirection: 90, pressure: 1004, cloudCover: 0.25, temperatureApparent: 29 });
  return { currentWeather: { asOf: new Date(Math.floor(Date.now() / H) * H).toISOString(), temperature: 28, temperatureDewPoint: 12, humidity: 0.42, windSpeed: 12, windGust: 20, windDirection: 90, pressure: 1004, cloudCover: 0.25 }, forecastHourly: { hours } };
}
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url; const u = new URL(url);
  if (/^(127\.0\.0\.1|localhost|\[::1\])$/.test(u.hostname)) return real(input, init);
  if (u.hostname.endsWith('open-meteo.com')) { const m = mode(); log({ host: u.hostname, path: u.pathname, mode: m });
    if (m === 'throw') throw new TypeError('fetch failed (test: main forecast unreachable)');
    if (m === '503') return J({ error: true, reason: 'test outage' }, 503);
    if (m === '429') return J({ error: true, reason: 'Daily API request limit exceeded' }, 429);
    return J(omBody(u.searchParams)); }
  if (u.hostname === 'weather.visualcrossing.com') { log({ host: u.hostname, path: '/timeline' }); return J(vcBody(u)); }
  if (u.hostname === 'weatherkit.apple.com') { const ok = wkOk((init.headers || {}).Authorization); log({ host: u.hostname, path: u.pathname, auth: ok }); return ok ? J(wkBody(u)) : J({ reason: 'NOT_ENABLED' }, 401); }
  log({ host: u.hostname, path: u.pathname, refused: true });
  throw new TypeError('fetch failed (test: offline)');
};
