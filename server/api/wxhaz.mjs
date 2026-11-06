/* v91.17.271 · B9 / E2 / B7 · FOG CHANCE, THUNDERSTORM CHANCE, SNOW CHANCE (fitted offline on the SERVED forecast fields) · OFF BY DEFAULT.
   Tables: data/wx-hazards.json section "served" (nig/ds2/wx/wx_served_fit.py + wx_export2.py; fitted on the Open-Meteo default model at
   the place height, historical forecast 1 Oct 2025 - 15 Oct 2026, scored against 92,576 synop reports at 47 stations).
   A hazard is used only when NIGRAAN_WX=1 AND it is listed in servedHazards. In v271 the list is empty: no hazard passed the owner's
   customer-view rule in every zone (data/wx-hazards.json served.verdict / whyNot; _admin/docs/v271/wx/WX_RESULTS.md).
     ts       chance of thunder at the place in the PKT day: logistic on the day's max CAPE, min lifted index, max CIN, log(1 + rain),
              any weather code >= 95, max low cloud, max RH, max temperature, height band, season, and the station x season climatology
              (nearest synop within 30 km and 300 m, else the band x season rate)
     fog      chance of fog on the morning of PKT date D (23:00 D-1 .. 11:00 D): max RH, log10 min visibility, mean wind, min boundary
              layer, max (T925 - T2m), mean low cloud, min temperature, any weather code 45/48, band, season, climatology
     snowline P(snow or sleet | height - freezing level, 2 m temperature) at the hour
   Inputs: the forecast answer's hourly block (time in UTC as ISO strings or unix seconds) with the fields named in the tables.
   Light: per place-day a few dozen adds and multiplies; the table is re-read only when its file changes. */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const hav = (a1, o1, a2, o2) => { const p = Math.PI / 180, x = Math.sin((a2 - a1) * p / 2) ** 2 + Math.cos(a1 * p) * Math.cos(a2 * p) * Math.sin((o2 - o1) * p / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(Math.min(1, x))); };
const ms = (tv) => (typeof tv === 'number' ? tv * 1000 : Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(tv) ? tv : tv + 'Z'));
const fin = (x) => (Number.isFinite(x) ? x : null);

/* feature vector -> chance (the exported logistic; a missing feature reads as the training mean) */
export function chanceFrom(m, feat, zone, season, climo) {
  let z = m.intercept;
  m.features.forEach((f, k) => {
    let x;
    if (f === 'climo_logit') x = Math.log(climo / (1 - climo));
    else if (f.startsWith('zone=')) x = zone === f.slice(5) ? 1 : 0;
    else if (f.startsWith('season=')) x = season === f.slice(7) ? 1 : 0;
    else x = feat[f];
    z += m.coef[k] * (x == null || !Number.isFinite(x) ? 0 : (x - m.mean[k]) / m.sd[k]);
  });
  return 1 / (1 + Math.exp(-z));
}

/* daily features from an hourly block (wx_served_fit.py definitions) */
export function tsDays(H) {
  const D = new Map(); const col = (k) => H[k] || [];
  const C = col('cape'), L = col('lifted_index'), N = col('convective_inhibition'), P = col('precipitation'), W = col('weather_code'), LC = col('cloud_cover_low'), RH = col('relative_humidity_2m'), T = col('temperature_2m');
  for (let i = 0; i < H.time.length; i++) {
    const date = new Date(ms(H.time[i]) + 5 * 3600e3).toISOString().slice(0, 10);
    const d = D.get(date) || { cape: -Infinity, li: Infinity, cin: -Infinity, pr: 0, wc_ts: 0, lcc: -Infinity, rh: -Infinity, t2max: -Infinity, n: 0 };
    if (Number.isFinite(C[i])) d.cape = Math.max(d.cape, C[i]); if (Number.isFinite(L[i])) d.li = Math.min(d.li, L[i]); if (Number.isFinite(N[i])) d.cin = Math.max(d.cin, N[i]);
    if (Number.isFinite(P[i])) d.pr += P[i]; if (W[i] >= 95) d.wc_ts = 1; if (Number.isFinite(LC[i])) d.lcc = Math.max(d.lcc, LC[i]);
    if (Number.isFinite(RH[i])) d.rh = Math.max(d.rh, RH[i]); if (Number.isFinite(T[i])) d.t2max = Math.max(d.t2max, T[i]); d.n++; D.set(date, d);
  }
  const out = [];
  for (const [date, d] of D) if (d.n >= 24) out.push({ date, feat: { cape: fin(d.cape), li: fin(d.li), cin: fin(d.cin), logpr: Math.log1p(d.pr), wc_ts: d.wc_ts, lcc: fin(d.lcc), rh: fin(d.rh), t2max: fin(d.t2max) } });
  return out;
}
export function fogMornings(H) {
  const D = new Map(); const col = (k) => H[k] || [];
  const RH = col('relative_humidity_2m'), V = col('visibility'), WS = col('wind_speed_10m'), B = col('boundary_layer_height'), T925 = col('temperature_925hPa'), T = col('temperature_2m'), LC = col('cloud_cover_low'), W = col('weather_code');
  for (let i = 0; i < H.time.length; i++) {
    const t6 = new Date(ms(H.time[i]) + 6 * 3600e3); if (t6.getUTCHours() > 12) continue;   // 18 .. 06 UTC = 23:00 .. 11:00 PKT
    const date = t6.toISOString().slice(0, 10);
    const d = D.get(date) || { rh_max: -Infinity, vmin: Infinity, ws: 0, nws: 0, blh_min: Infinity, inv_max: -Infinity, lc: 0, nlc: 0, t2_min: Infinity, wc_fog: 0, n: 0 };
    if (Number.isFinite(RH[i])) d.rh_max = Math.max(d.rh_max, RH[i]); if (Number.isFinite(V[i])) d.vmin = Math.min(d.vmin, V[i]);
    if (Number.isFinite(WS[i])) { d.ws += WS[i]; d.nws++; } if (Number.isFinite(B[i])) d.blh_min = Math.min(d.blh_min, B[i]);
    if (Number.isFinite(T925[i]) && Number.isFinite(T[i])) d.inv_max = Math.max(d.inv_max, T925[i] - T[i]);
    if (Number.isFinite(LC[i])) { d.lc += LC[i]; d.nlc++; } if (Number.isFinite(T[i])) d.t2_min = Math.min(d.t2_min, T[i]);
    if (W[i] === 45 || W[i] === 48) d.wc_fog = 1; d.n++; D.set(date, d);
  }
  const out = [];
  for (const [date, d] of D) if (d.n >= 13) out.push({ date, feat: { rh_max: fin(d.rh_max), logvis: Number.isFinite(d.vmin) ? Math.log10(Math.max(d.vmin, 10)) : null, wind_mean: d.nws ? d.ws / d.nws : null,
    blh_min: fin(d.blh_min), inv_max: fin(d.inv_max), lcc_mean: d.nlc ? d.lc / d.nlc : null, t2_min: fin(d.t2_min), wc_fog: d.wc_fog } });
  return out;
}

export function createWxHaz({ dataDir } = {}) {
  const file = join(dataDir, 'wx-hazards.json'); let M = null, mt = 0, at = 0, err = null;
  const switchOn = () => process.env.NIGRAAN_WX === '1';
  function model() { if (M && Date.now() - at < 30e3) return M; at = Date.now();
    try { if (!existsSync(file)) { M = null; return null; } const t = statSync(file).mtimeMs; if (!M || t !== mt) { M = JSON.parse(readFileSync(file, 'utf8')); mt = t; err = null; } return M; }
    catch (e) { err = e.message; return null; } }
  const served = (hz) => { const m = model(); return !!(switchOn() && m && Array.isArray(m.servedHazards) && m.servedHazards.includes(hz)); };
  const zoneOf = (S, z) => { for (const [k, [lo, hi]] of Object.entries(S.zoneBands)) if (z >= lo && z < hi) return k; return 'plains'; };
  function climoOf(S, T, la, lo, z, zone, season) {
    let best = null;
    for (const s of T.stationRates) { if (s.season !== season) continue; const d = hav(la, lo, s.lat, s.lon);
      if (d <= S.nearestStationKm && Math.abs((z ?? s.z) - s.z) <= S.nearestStationDzM && (!best || d < best.d)) best = { d, rate: s.rate }; }
    return best ? best.rate : T.zoneSeasonRates[`${zone}|${season}`];
  }
  function daily(kind, H, la, lo, z, force) {
    const m = model(); const S = m && m.served; if (!S || !(force || served(kind))) return null;
    if (!H || !Array.isArray(H.time)) return null;
    /* v91.17.283.3 · audit S5 · an unknown elevation is never 0 m (the plains zone and its climatology): no height, no chance */
    if (z == null || !Number.isFinite(+z)) return null; z = +z;
    const T = kind === 'ts' ? S.tsServed : S.fogServed, zone = zoneOf(S, z);
    return (kind === 'ts' ? tsDays(H) : fogMornings(H)).map(({ date, feat }) => {
      const mo = Number(date.slice(5, 7)); const season = kind === 'ts' ? (T.warmMonths.includes(mo) ? 'warm' : 'cool') : (T.coolMonths.includes(mo) ? 'cool' : 'warm');
      return { date, chance: Math.round(chanceFrom(T, feat, zone, season, climoOf(S, T, la, lo, z, zone, season)) * 1000) / 1000 };
    });
  }
  const tsChance = (H, la, lo, z, { force = false } = {}) => daily('ts', H, la, lo, z, force);
  const fogChance = (H, la, lo, z, { force = false } = {}) => daily('fog', H, la, lo, z, force);
  function snowChance(z, fl, t2, { force = false } = {}) {
    const m = model(); const S = m && m.served; if (!S || !(force || served('snowline'))) return null;
    if (![z, fl, t2].every(Number.isFinite) || fl <= 0) return null;
    return chanceFrom(S.snowServed, { dz: z - fl, temperature_2m: t2 }, null, null, null);
  }
  function state() { const m = model(); return { switchOn: switchOn(), file: existsSync(file), error: err, version: m ? m.version : null, servedHazards: m ? m.servedHazards : [] }; }
  return { tsChance, fogChance, snowChance, state, served, model };
}
