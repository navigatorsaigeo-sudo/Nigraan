/* == v91.17.283.28 · S4 · DAILY EXTREMES NEED THEIR WHOLE PART OF THE DAY ============================================================
   A day's maximum (air temperature, feels-like, UTCI, wind, gust) is only known when every DAYTIME hour of that day is held, and its
   minimum (air temperature, UTCI) only when every NIGHT hour is held; otherwise it is null with the reason (the hours held). Daytime is
   computed at the point for the date: the hours whose instant has the sun above the standard sunrise/sunset horizon, -0.833 deg (NOAA
   Solar Calculator definition: 34' of atmospheric refraction plus the sun's 16' semi-diameter), from the NOAA general solar position
   (utci.mjs sunElev). Night is the other hours of the PKT day. ONE home: every daily extreme the server makes reads extremeOfDay(). */
import { sunElev } from '../../../server/api/utci.mjs';
import { checkHours } from '../../../server/api/completeness.mjs';   /* v283.31 · 3.7 */
export const SUN_HORIZON_DEG = -0.833;
export const SUN_HORIZON_SOURCE = 'NOAA Solar Calculator: sunrise/sunset at a solar elevation of -0.833 deg (refraction 34′ + semi-diameter 16′)';
const isN = (x) => typeof x === 'number' && Number.isFinite(x);
const memo = new Map();
/* the PKT hours (0-23, instant labels HH:00) of a date that are daytime / night at the point, with sunrise and sunset to the minute */
export function dayNight(lat, lon, date) {
  const k = lat.toFixed(3) + ',' + lon.toFixed(3) + ',' + date; const m = memo.get(k); if (m) return m;
  const t0 = Date.parse(date + 'T00:00:00Z') - 5 * 3600e3, day = [], night = [];
  for (let h = 0; h < 24; h++) (sunElev(lat, lon, t0 + h * 3600e3) > SUN_HORIZON_DEG ? day : night).push(h);
  const edge = (from, dir) => { for (let mi = 0; mi < 24 * 60; mi++) { const a = sunElev(lat, lon, t0 + mi * 60e3) > SUN_HORIZON_DEG, b = sunElev(lat, lon, t0 + (mi + 1) * 60e3) > SUN_HORIZON_DEG; if (dir > 0 && !a && b) return mi + 1; if (dir < 0 && a && !b) return mi + 1; } return null; };
  const hm = (x) => (x == null ? null : String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0'));
  const r = { day, night, sunrise: hm(edge(0, 1)), sunset: hm(edge(0, -1)), basis: SUN_HORIZON_SOURCE };
  memo.set(k, r); if (memo.size > 20000) memo.clear(); return r;
}
/* the extreme of `key` over the day's hours (objects with .time 'YYYY-MM-DDTHH:MM' PKT); { v, at, why }.
   v91.17.283.31 · owner 3.2 · ONE COMPLETENESS LAYER (completeness.mjs): a daily high or low needs ALL 24 different hours of the PKT day
   with a value (until v283.30 the daytime hours for a maximum and the night hours for a minimum); a missing or duplicated hour leaves it
   null with the reason. `kind` picks max or min. dayNight() still gives the sunrise and sunset the day carries. */
export function extremeOfDay(hours, key, kind, lat, lon, date, o = {}) {
  const C = checkHours(hours, key, date, { label: o.label || key });
  if (!C.complete) return { v: null, at: null, why: C.why, hoursHeld: C.held, hoursNeeded: C.need, ...(C.duplicates.length ? { duplicates: C.duplicates } : {}) };
  let best = null; for (const e of C.values) if (best == null || (kind === 'max' ? e.v > best.v : e.v < best.v)) best = e;
  return { v: best.v, at: String(best.h.time).slice(11, 16), why: null, hoursNeeded: C.need };
}
