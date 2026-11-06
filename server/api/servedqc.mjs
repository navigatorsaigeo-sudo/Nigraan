/* ══ v91.17.283.46 (NIGRAAN 1.0.8.1) · THE SERVED-VALUE PLAUSIBILITY SCREEN (v283.47: the national envelope is now only the last fallback of
   curveCheck below) ═══════════════════════════════════════════════════════════
   Why: on 2 Nov 2026 the served temperature at Skardu tehsil read 47 C at 07:00-09:00 PKT (RH 4-8 %) and set the only heat High in
   Pakistan. The value-level QC (obsqc.mjs) screens OBSERVATIONS only; nothing screened what the chain SERVES. Root cause (fixed at the
   source in verification.mjs / national.mjs / ewsshadow.mjs): the EWS live anchor was applied inside the national tehsil run, whose
   records are the anchor's own basis, so each hourly run added the kriged residual again (a feedback loop; Skardu tehsil basis 33.6 C
   at 08:00 PKT in the 03 UTC run).
   What: a served hourly temperature outside the calendar month's envelope of the existing climatological range check is withheld:
   above the highest daily maximum measured in Pakistan in that calendar month (NOAA GSOD, 55 stations, data/fleet-range-screen.json
   absolute.byMonth[m].gsodMax; temperature falls with height, so the hottest stations of the record bound every place), or below the
   month's widened lower limit (absolute.byMonth[m].lo; the GSOD stations do not reach the high mountains, so their own minimum is not a
   bound there). Both numbers are the file's, derived from data (derive_range.py), none typed here. A withheld hour carries no value,
   so it can set no level, no day extreme and no alert (a day missing an hour is "not assessed" by the existing day rule); the record
   lists the withheld hours with the reason, and the server log names the point. NIGRAAN_SERVED_QC=0 switches the screen off. */
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const fin = (x) => typeof x === 'number' && Number.isFinite(x);
let CACHE = { f: null, t: -1, v: null };
function envelope(dataDir) {
  const f = join(dataDir, 'fleet-range-screen.json'); if (!existsSync(f)) return null;
  try { const t = statSync(f).mtimeMs; if (CACHE.f !== f || CACHE.t !== t) CACHE = { f, t, v: JSON.parse(readFileSync(f, 'utf8')) }; } catch (_) { return null; }
  const B = CACHE.v && CACHE.v.absolute && CACHE.v.absolute.byMonth; return B || null;
}
export const servedQcOn = () => process.env.NIGRAAN_SERVED_QC !== '0';
/* the bound for a calendar month (1-12), or null when the file is absent */
export function servedBound(dataDir, month) {
  const B = envelope(dataDir); const r = B && B[String(month)]; if (!r || !fin(r.gsodMax) || !fin(r.lo)) return null;
  return { hi: r.gsodMax, lo: r.lo, source: 'data/fleet-range-screen.json absolute.byMonth[' + month + '] (NOAA GSOD Pakistan)' };
}
/* is this served hourly temperature (C) at a Pakistan local time 'YYYY-MM-DDTHH:MM' plausible? -> null when it is, else the reason */
export function servedImplausible(dataDir, tempC, pktTime) {
  if (!servedQcOn() || !fin(tempC)) return null; const m = Number(String(pktTime).slice(5, 7)); const b = servedBound(dataDir, m); if (!b) return null;
  if (tempC > b.hi) return { test: 'above-record', valueC: tempC, boundC: b.hi, why: 'withheld: ' + tempC + ' C is above the highest temperature measured anywhere in Pakistan in this calendar month (' + b.hi + ' C, NOAA GSOD); no level or alert is set from it' };
  if (tempC < b.lo) return { test: 'below-range', valueC: tempC, boundC: b.lo, why: 'withheld: ' + tempC + ' C is below the lower limit of this calendar month (' + b.lo + ' C, NOAA GSOD widened by the served residual range); no level or alert is set from it' };
  return null;
}

/* ══ v91.17.283.47 (NIGRAAN 1.0.8.2) · THE SERVED-CURVE CHECK ON THE PLACE'S OWN OBSERVED RECORD ═══════════════════════════════════════════
   Why: the national monthly record (39.5 C in November) does not protect a mountain place: on 2 Nov the served Skardu curve went 16.5 ->
   24.3 -> 19.7 C in two hours and set the day's maximum. The limits now come from NIGRAAN's held hourly observations
   (data/served-qc-climate.json, build/v47/served_qc_climate.py):
     one-hour change  |T(h) - T(h-1)| above the 99.9th percentile of observed one-hour changes of the place's zone in that calendar month
                      (step[zone][month], at least 1000 observed pairs; else the zone's pooled value over every month it holds)
     range            above the highest hourly temperature observed in that calendar month at any long-record station (PMD synop, PMD AWS;
                      not the one-month EWS series) of the place's zone at or below the place's height (lower ground is warmer), or below
                      the lowest at any such station at or above it; no station at or below: the national record (data/fleet-range-
                      screen.json gsodMax); no station at or above: no cold bound
   (see curveCheck for the two tests actually applied: the bend of three hours and the widened range). A withheld hour carries no value,
   so no day extreme, level or alert from it. */
let CL = { f: null, t: -1, v: null };
function climate(dataDir) {
  const f = join(dataDir, 'served-qc-climate.json'); if (!existsSync(f)) return null;
  try { const t = statSync(f).mtimeMs; if (CL.f !== f || CL.t !== t) CL = { f, t, v: JSON.parse(readFileSync(f, 'utf8')) }; } catch (_) { return null; }
  return CL.v;
}
const MIN_PAIRS = 1000, MIN_HOURS = 600;   /* a month's statistic is used with at least this many observed pairs / hours behind it */
export function stepLimit(dataDir, zone, month) {
  const C = climate(dataDir); if (!C || !zone) return null; const s = C.step && C.step[zone] && C.step[zone][String(month)];
  if (s && s.pairs >= MIN_PAIRS && fin(s.p999)) return { limitC: s.p999, basis: zone + ' zone, month ' + month + ': 99.9th percentile of ' + s.pairs + ' observed one-hour changes' };
  const p = C.stepPooled && C.stepPooled[zone]; return p && fin(p.p999) ? { limitC: p.p999, basis: zone + ' zone, all held months: 99.9th percentile of ' + p.pairs + ' observed one-hour changes' } : null;
}
export function rangeAt(dataDir, zone, elevM, month) {
  const C = climate(dataDir), m = String(month); let hi = null, lo = null, hiB = null, loB = null;
  const S = C && Array.isArray(C.stations) ? C.stations.filter((s) => s.zone === zone && !/^ews:/.test(s.id) && s.n && s.n[m] >= MIN_HOURS && fin(s.max[m]) && fin(s.min[m])) : [];
  if (S.length) {
    const below = fin(elevM) ? S.filter((s) => fin(s.elevM) && s.elevM <= elevM) : [], above = fin(elevM) ? S.filter((s) => fin(s.elevM) && s.elevM >= elevM) : [];
    if (below.length) { hi = Math.max(...below.map((s) => s.max[m])); hiB = 'highest at ' + below.length + ' ' + zone + ' station(s) at or below ' + Math.round(elevM) + ' m, month ' + m; }
    if (above.length) { lo = Math.min(...above.map((s) => s.min[m])); loB = 'lowest at ' + above.length + ' ' + zone + ' station(s) at or above ' + Math.round(elevM) + ' m, month ' + m; }
  }
  /* no long-record station at or below the place: the national record bounds the heat (the hottest stations of the record are low); no such
     station at or above it: no cold bound (no held observation covers that height, and colder ground lies above) */
  const N = servedBound(dataDir, month);
  if (hi == null && N) { hi = N.hi; hiB = 'national record (NOAA GSOD), month ' + m; }
  return hi == null && lo == null ? null : { hi, lo, hiBasis: hiB, loBasis: loB };
}
export function curvLimit(dataDir, zone, month) {
  const C = climate(dataDir); if (!C || !zone) return null; const s = C.curv && C.curv[zone] && C.curv[zone][String(month)];
  if (s && s.triples >= MIN_PAIRS && fin(s.p999)) return { limitC: s.p999, basis: zone + ' zone, month ' + month + ': 99.9th percentile of ' + s.triples + ' observed three-hour bends' };
  const p = C.curvPooled && C.curvPooled[zone]; return p && fin(p.p999) ? { limitC: p.p999, basis: zone + ' zone, all held months: 99.9th percentile of ' + p.triples + ' observed three-hour bends' } : null;
}
/* hours: [{ time: 'YYYY-MM-DDTHH:MM' (PKT), T }] in time order -> Map(time -> { test, why }) of the hours to withhold.
   bend:  an hour that stands off the line of its two neighbours, |T(h) - (T(h-1) + T(h+1)) / 2|, by more than the 99.9th percentile of the
          same bend in the observed hourly record of the place's zone and month (curv): a one-hour spike, or the hour that makes a step. A
          smooth climb (a steep sunrise) bends little and passes; the bend, not the one-hour change, is what separates an artefact from weather.
   range: the observed record of the place (rangeAt) widened by one observed one-hour change (stepLimit): a curve reaches a new record by
          climbing from recorded values, so a value beyond record + the largest normal hourly change is not weather. */
export function curveCheck(dataDir, hours, zone, elevM) {
  const out = new Map(); if (!servedQcOn() || !Array.isArray(hours)) return out;
  const mon = (t) => Number(String(t).slice(5, 7)), ms = (t) => Date.parse(String(t).slice(0, 16) + ':00Z');
  const RC = new Map(), SC = new Map(), CC = new Map(); const memo = (M, f) => (m) => (M.has(m) ? M.get(m) : (M.set(m, f(m)), M.get(m)));
  const rOf = memo(RC, (m) => rangeAt(dataDir, zone, elevM, m)), sOf = memo(SC, (m) => stepLimit(dataDir, zone, m)), cOf = memo(CC, (m) => curvLimit(dataDir, zone, m));
  for (const h of hours) { if (!fin(h.T)) continue; const r = rOf(mon(h.time)), st = sOf(mon(h.time)); if (!r) continue; const w = st ? st.limitC : 0;
    if (fin(r.hi) && h.T > r.hi + w) out.set(h.time, { test: 'above-record', valueC: h.T, boundC: Math.round((r.hi + w) * 10) / 10, why: 'withheld: ' + h.T + ' C is above the highest temperature observed for this place (' + r.hi + ' C, ' + r.hiBasis + ') by more than one observed hourly change (' + w + ' C)' });
    else if (fin(r.lo) && h.T < r.lo - w) out.set(h.time, { test: 'below-record', valueC: h.T, boundC: Math.round((r.lo - w) * 10) / 10, why: 'withheld: ' + h.T + ' C is below the lowest temperature observed for this place (' + r.lo + ' C, ' + r.loBasis + ') by more than one observed hourly change (' + w + ' C)' }); }
  for (let i = 1; i + 1 < hours.length; i++) { const a = hours[i - 1], b = hours[i], c = hours[i + 1];
    if (![a.T, b.T, c.T].every(fin) || ms(b.time) - ms(a.time) !== 3600e3 || ms(c.time) - ms(b.time) !== 3600e3) continue;
    const L = cOf(mon(b.time)); if (!L) continue; const k = Math.round((b.T - (a.T + c.T) / 2) * 10) / 10;
    if (Math.abs(k) > L.limitC && !out.has(b.time)) out.set(b.time, { test: 'bend', valueC: b.T, bendC: k, limitC: L.limitC,
      why: 'withheld: ' + b.T + ' C at ' + b.time.slice(11, 16) + ' PKT stands ' + (k > 0 ? '+' : '') + k + ' C off the line of the hours before and after (' + a.T + ', ' + c.T + ' C), beyond any observed one-hour bend (' + L.limitC + ' C, ' + L.basis + ')' }); }
  return out;
}
