/* v91.17.127 · A-03 · ONE HEAT INDEX. The page (build/base heatIndexDetail / heatIndexRaw) and two server copies (natmodel.mjs,
   work.mjs) used three rule sets: at 40 C / 10 % the page gave 40.0 and the server 36.7; at 38 C / 70 % the page refused and the server
   gave 62.5. This module is the page's method exactly, and every server caller uses it:
     NWS (Rothfusz 1990, NWS SR 90-23): simple = 0.5 (T + 61 + 1.2 (T - 68) + 0.094 RH) in F; avg = (simple + T) / 2;
     avg < 80 F -> avg; otherwise the Rothfusz regression with the NWS low- and high-humidity adjustments (v283.35: no floor at T, NWS exactly).
     Validity (the published table): dry bulb -30..43.3 C, index up to 58.3 C; outside -> null with the reason. */
export const HEAT_VALIDITY = { minAirTempC: -30, maxAirTempC: 43.3, maxIndexC: 58.3 };
export function heatIndexRaw(tC, rh) {
  const T = Number(tC) * 9 / 5 + 32, R = Math.max(1, Math.min(100, Number(rh)));
  if (!Number.isFinite(T) || !Number.isFinite(R)) return null;
  const simple = 0.5 * (T + 61 + ((T - 68) * 1.2) + (R * 0.094)), avg = (simple + T) / 2;
  /* v91.17.283.35 · audit D5 · NWS (Rothfusz 1990; NWS heat index equation): below 80 F the heat index IS the simple formula averaged with
     the temperature; above it the regression with its adjustments, with no floor at T (the page's max(T, ...) floors are not the NWS method) */
  if (avg < 80) return (avg - 32) * 5 / 9;
  let HI = -42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R - 0.00683783 * T * T - 0.05481717 * R * R + 0.00122874 * T * T * R + 0.00085282 * T * R * R - 0.00000199 * T * T * R * R;
  if (R < 13 && T >= 80 && T <= 112) HI -= ((13 - R) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
  if (R > 85 && T >= 80 && T <= 87) HI += ((R - 85) / 10) * ((87 - T) / 5);
  return (HI - 32) * 5 / 9;
}
export function heatIndexDetail(tC, rh) {
  const T = Number(tC), R = Number(rh);
  if (tC == null || rh == null || !Number.isFinite(T) || !Number.isFinite(R)) return { value: null, refused: true, why: 'air temperature and relative humidity are both required' };
  if (T > HEAT_VALIDITY.maxAirTempC) return { value: null, refused: true, bound: 'maxAirTempC', why: 'air temperature above the heat-index table (43.3 C dry bulb)' };
  if (T < HEAT_VALIDITY.minAirTempC) return { value: null, refused: true, bound: 'minAirTempC', why: 'air temperature below the range the index is defined over' };
  const v = heatIndexRaw(T, R); if (v == null) return { value: null, refused: true, why: 'not evaluable' };
  if (v > HEAT_VALIDITY.maxIndexC) return { value: null, refused: true, bound: 'maxIndexC', extrapolated: Math.round(v * 10) / 10, why: 'above the published table ceiling (58.3 C)' };
  return { value: v, refused: false };
}
export function heatIndexC(tC, rh) { const d = heatIndexDetail(tC, rh); return d.refused ? null : d.value; }
/* == v91.17.283.40 · owner "ok both" 31 Oct 2026 · THE HEAT-INDEX BAND OF A DAY (NWS) =================================================
   Bands from the published NWS classification (data/heat-index-bands.json: SR 90-23, Rothfusz 1990): Extreme Caution 90 F (32.2 C),
   Danger 105 F (40.6 C); Extreme Danger 130 F failed its test, so a day at or above it is "Danger or higher". The day band is the band of
   the day's highest hourly index, all 24 hours of the PKT day required (completeness.mjs, the comfort rule); an hour outside the published
   table (dry bulb above 43.3 C, index above 58.3 C) is never extrapolated: the day is then not assessed with that reason. Served for lead
   days 1-3 (the tested leads; scripts/tests28340/heat40.py); today and days 4+ say not tested. Hours at or above each band and their
   measured error are Methods / operator facts only (engine.mjs OPERATOR_FACTS). */
import { readFileSync as _rf, statSync as _st } from 'node:fs';
import { join as _join } from 'node:path';
import { checkHours } from './completeness.mjs';
let _HB = null, _HBk = null;
export function heatBands(dataDir) {
  try { const f = _join(dataDir, 'heat-index-bands.json'), s = _st(f), k = s.mtimeMs + ':' + s.size; if (!_HB || _HBk !== k) { _HB = JSON.parse(_rf(f, 'utf8')); _HBk = k; } return _HB; } catch (_) { return null; } }
export function heatBandOf(v, B) { if (!B || !B.cutsC || v == null || !Number.isFinite(v)) return null;
  const c = B.cutsC, level = v >= c.danger ? 2 : v >= c.extremeCaution ? 1 : 0; return { level, word: B.levels[level], extremeDangerNotTested: v >= c.extremeDanger }; }
export function heatIndexDays(ps, B, maxLead = 3) {
  if (!B) return [];
  const leads = new Set(B.servedLeads || []);
  const H = (ps && ps.hours || []).map((h) => { const d = heatIndexDetail(h.tempC, h.rh); return { time: h.time, hi: d.refused ? null : d.value, refusedWhy: d.refused && d.bound ? d.why : null }; });
  return (ps && ps.days || []).filter((d) => d.lead >= 0 && d.lead <= maxLead).map((d) => {
    if (!leads.has(d.lead)) return { date: d.date, lead: d.lead, assessed: false, notTested: true, why: 'not tested: ' + (B.leadNote || 'outside the tested lead days') };
    const day = H.filter((h) => String(h.time).slice(0, 10) === d.date), out = day.find((h) => h.refusedWhy);
    if (out) return { date: d.date, lead: d.lead, assessed: false, why: 'outside range: ' + out.refusedWhy + ' at ' + String(out.time).slice(11, 16) + ' (the heat index is not extrapolated)' };
    const C = checkHours(H, 'hi', d.date, { label: 'heat index (temperature and humidity)' });
    if (!C.complete) return { date: d.date, lead: d.lead, assessed: false, why: 'incomplete day: ' + String(C.why).replace(/^not assessed:\s*/, '') };
    const top = C.values.reduce((m, e) => (m == null || e.v > m.v ? e : m), null), b = heatBandOf(top.v, B);
    const hours = Object.fromEntries(Object.entries(B.cutsC).filter(([k]) => k !== 'extremeDanger').map(([k, t]) => [k, C.values.filter((e) => e.v >= t).length]));
    const err = B.methodsOnly && B.methodsOnly.hoursAtOrAboveError ? Object.fromEntries(Object.keys(hours).map((k) => [k, (B.methodsOnly.hoursAtOrAboveError[k] || {})[String(d.lead)] ? B.methodsOnly.hoursAtOrAboveError[k][String(d.lead)].hoursMAE : null])) : null;
    return { date: d.date, lead: d.lead, assessed: true, hiMaxC: Math.round(top.v * 10) / 10, at: String(top.h.time).slice(11, 16), level: b.level, word: b.word,
      ...(b.extremeDangerNotTested ? { extremeDangerNotTested: true } : {}), hoursAtOrAbove: hours, hoursErrorMAE: err };
  });
}
