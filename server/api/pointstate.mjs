/* == v91.17.283.11 . POINT STATE: ONE CALCULATION POINT FOR A PLACE ==================================================================
   Owner 24 Oct 2026 (Muzaffarabad, 00:45 PKT): the same place showed 13.3 in the popup, 15 in the 24-hour strip, 15.8 in "Temperature now
   nearby" and something else on the map chip, because each widget read its own request. This module computes the state of a point ONCE
   per (point, model run, live-station read) and every page reads it through the one place bundle (server/api/point.mjs: GET /api/point,
   /api/point/batch). v91.17.283.19: the point is computed where it is asked (5 decimals, about 1 m); since v283.23 the cache key is the same
   5 decimals, never a 0.01 deg cell (which made every point within about 1 km share one forecast, height and station).

   NO PARALLEL CHAIN (coordinator, 24 Oct): the numbers are the SERVED forecast's, by construction. The state is read from the server's own
   /px/v1/forecast answer, the same request and the same correction chain the point engine (pointengine.mjs) and the map use: the zone
   basis, station calibration, the national model, the weather correction, the urban term and the live MACH layer, in that chain's order.
   The ECMWF IFS 0.1 deg (9 km) values enter only where that chain puts them: ecmwf010.mjs substitute(), gated by NIGRAAN_ECMWF010_SERVE
   and the switch rule of data/ecmwf010-score.json (the 25 Oct rule); this module never reads the 0.1 deg run itself. Several points
   are asked in ONE multi-location request (as /api/hyperlocal/area did), so the nearby list costs one provider call, not one per place.
   The request is the point engine's (same variables, Asia/Karachi hours, the point's forecast height from places.pointRow) with 7
   days and cloud cover added, under the user-class tag 'point-engine'.

   What is added here, display arithmetic only:
     now      the hour of the current PKT hour of the served curve (the point engine's rule)
     days     PKT day max / min of the served hourly curve (days with >= 20 hours; the point engine's rule), so the hottest hour of a day IS
              its Tmax; day rain sum, wind and gust max, humidity and cloud means, the day's hottest / coldest UTCI hour
     heat     UTCI in shade per hour (pointengine.mjs comfortOf: utci.mjs, Broede et al. 2012, Tmrt = air temperature) and its level on
              the UTCI assessment scale (Blazejczyk et al. 2013): a hazard level only from strong stress; heat Moderate 32-38, High 38-46,
              Severe >= 46 C; cold Moderate -27 to -13, High -40 to -27, Severe below -40 C; between them the level is None and the class
              is named
     source   the chain steps that ran (the answer's own agn_* records); "MACH forecast" only when the live MACH layer was applied to
              this hour, else "Model forecast"
     confidence  words + the measured error of THIS chain, never a fixed badge: the national model's held-out MAE for the zone and
              variant that ran (data/national-model.json zones[variant][zone].heldOut, hourly); with the live MACH layer on this hour the
              layer's held-out MAE (data/hyperlocal-model.json validation_v186, trusted stations); later days in the plains the AGN fleet's
              day-1 and day-3 MAE of the served forecast (data/fleet-history-skill.json cohort); the mountains have no lead test and say so
     area     the tehsil the point lies in, labelled as the area */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { comfortOf } from './pointengine.mjs';
import { hourEndingTotals } from './pktday.mjs';
import { shownRainMm } from './rainamount.mjs';   /* v283.31 */
import { extremeOfDay, dayNight } from './dayext.mjs';
import { heatCellOf, coldCellOf, UTCI_CATEGORY_LABEL } from './utcilevel.mjs';
import { accuracyCell } from './accuracy.mjs';
import { utciClass, utci as utciOf, tmrt as tmrtOf, sunElev as sunElevOf } from './utci.mjs';

export const PS_VERSION = 'pointstate-7 (v91.17.283.23)';
const H = 3600e3, PKT = 5 * H;
const isN = (x) => typeof x === 'number' && Number.isFinite(x);
const v0 = (Hh, n, i) => (Array.isArray(Hh[n]) && isN(Hh[n][i]) ? Hh[n][i] : null);
const r1 = (x) => (isN(x) ? Math.round(x * 10) / 10 : null);
const pktHour = (ms) => new Date(ms + PKT).toISOString().slice(0, 13);
/* v91.17.283.28 · S1 · a record's "now" is the PKT hour it was built in: a cached record is served only within its own age (PS_TTL_MS) AND
   within that PKT hour (the cache key was the run and live read only, so a record built at 10:55 PKT answered "now" = 10:00 at 11:05) */
export const PS_TTL_MS = 10 * 60e3;
/* v91.17.283.52 · F1 · the background sweeps that may ask many points in one request (their records are not stored for people's requests) and
   how many one-place requests run at once for a person's list */
export const SWEEP_TAGS = new Set(['pointstate-area', 'pointstate-area-retry', 'hazard-grid']);   /* a retry stays one multi-location request, as the pass itself */
const ONE_PAR = Math.max(1, Math.min(16, Number(process.env.NIGRAAN_POINT_PAR) || 6));
/* v91.17.283.53 · C · N1 (live 3 Nov, Lahore Cantt: the place card waited 75-95 s, then "provider did not answer in time"). Since F1 every
   place of a card's 36-point nearby list is its own /px request (each with its own correction chain and member calls), 6 at a time PER LIST,
   with no limit across lists and no order: the place a person opened queued behind the nearby lists of the places opened before it, and
   behind the sweeps. Now every one-place request of this module takes a slot by priority: 'hi' = the point a person asked for (state(), a
   batch: NIGRAAN_POINT_PAR_TOTAL at once, default 12), 'lo' = the nearby list and the background sweeps (NIGRAAN_POINT_PAR_LOW, default 4,
   only while no 'hi' request waits; their /px request carries x-agn-priority: low, so its provider calls are paced as background and its
   correction gives way to a person's); a 'hi' request that joins a record queued as 'lo' lifts it to 'hi'. Values are unchanged (same
   requests, same chain); only the order and the overlap change. */
const PAR_HI = Math.max(1, Math.min(32, Number(process.env.NIGRAAN_POINT_PAR_TOTAL) || 12)), PAR_LO = Math.max(1, Math.min(PAR_HI, Number(process.env.NIGRAAN_POINT_PAR_LOW) || 4));
/* 'hi' requests have their own slots (a low one never holds a slot a person's request needs: no priority inversion); 'lo' at most PAR_LO at
   once and only while no 'hi' request waits */
const SLOTS = { hiN: 0, loN: 0, hi: [], lo: [], st: { hiRan: 0, loRan: 0, promoted: 0, hiWaitedMsMax: 0, loWaitedMsMax: 0 } };
function slotTake(pri, cks) { return new Promise((ok) => { const e = { ok, pri, cks, at: Date.now() };
  if (pri === 'hi' && SLOTS.hiN < PAR_HI) { SLOTS.hiN++; e.held = 'hi'; return ok(e); }
  if (pri !== 'hi' && SLOTS.loN < PAR_LO && !SLOTS.hi.length) { SLOTS.loN++; e.held = 'lo'; return ok(e); }
  (pri === 'hi' ? SLOTS.hi : SLOTS.lo).push(e); }); }
function slotPump() { while (SLOTS.hi.length && SLOTS.hiN < PAR_HI) { const e = SLOTS.hi.shift(); SLOTS.hiN++; e.held = 'hi'; SLOTS.st.hiWaitedMsMax = Math.max(SLOTS.st.hiWaitedMsMax, Date.now() - e.at); e.ok(e); }
  while (SLOTS.lo.length && !SLOTS.hi.length && SLOTS.loN < PAR_LO) { const e = SLOTS.lo.shift(); SLOTS.loN++; e.held = 'lo'; SLOTS.st.loWaitedMsMax = Math.max(SLOTS.st.loWaitedMsMax, Date.now() - e.at); e.ok(e); } }
function slotGive(e) { if (e.held === 'hi') SLOTS.hiN--; else SLOTS.loN--; slotPump(); }
function slotPromote(ck) { const i = SLOTS.lo.findIndex((e) => e.cks && e.cks.includes(ck)); if (i < 0) return; const [e] = SLOTS.lo.splice(i, 1); e.pri = 'hi'; SLOTS.hi.push(e); SLOTS.st.promoted++; slotPump(); }
/* v91.17.283.53 · C · N1 (b) · the last good record of every point a person asked (any run): served, labelled with its own run and time, when
   the current one is not ready within the caller's deadline (point.mjs: the place card never waits more than NIGRAAN_POINT_STATE_MS) */
const LAST_MAX = Math.max(50, Number(process.env.NIGRAAN_POINT_LASTGOOD) || 400);
export const pktHourOf = pktHour;
export const fineKey = (lat, lon) => (+lat).toFixed(5) + ',' + (+lon).toFixed(5);   /* v91.17.283.23 · audit 18 · the cache key is the point as asked (5 decimals, about 1 m): two points never share a record (was 4 decimals, a cell of about 11 x 10 m that could cross a tehsil edge) */
export const HOURLY = 'temperature_2m,relative_humidity_2m,wind_speed_10m,dew_point_2m,apparent_temperature,precipitation,wind_gusts_10m,cloud_cover,weather_code,precipitation_probability,snowfall,surface_pressure,shortwave_radiation,uv_index';   /* v91.17.283.12: every weather value a page shows comes from this one request */
const SUP = /\b(PMD|FFD|NASA|ERA5|IMERG|ECMWF|GloFAS|Open-Meteo|NOAA|DWD|Met Office|ICON|GFS)\b/gi;
const clean = (s) => String(s == null ? '' : s).replace(SUP, '').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').replace(/\s+([,.;)])/g, '$1').trim();

/* -- the UTCI assessment scale (Blazejczyk et al. 2013) and the hazard levels taken from it: ONE class function, utci.mjs (the page's
      inline copy is the same code), so a class bound is the same everywhere (a value on a bound belongs to the warmer class for cold,
      to the class it opens for heat: 32.0 is strong heat stress, -13.0 is moderate cold stress) -- */
export const LEVEL_OF_CLASS = { 'Strong heat stress': ['heat', 'Moderate'], 'Very strong heat stress': ['heat', 'High'], 'Extreme heat stress': ['heat', 'Severe'],
  'Strong cold stress': ['cold', 'Moderate'], 'Very strong cold stress': ['cold', 'High'], 'Extreme cold stress': ['cold', 'Severe'] };
/* v91.17.283.28 · S6 · the level of an hour or a day is placed by the ONE rule (utcilevel.mjs: the AGN UTCI maps on the customer scale, the
   rule the tehsil heat and the site levels read); a level below Moderate is the scale's word 'Normal' (it was 'None', a second word) */
export function utciLevel(u) {
  if (!isN(u)) return { utciC: null, cls: null, heat: null, cold: null, level: null };
  const name = utciClass(u), H = heatCellOf(u), C = coldCellOf(u);
  const heat = H.level >= 1 ? H.word : null, cold = C.level >= 1 ? C.word : null;
  /* v91.17.283.31 · a Low carries its condition words ("moderate heat stress" / "moderate cold stress", thresholds register), never an alert */
  return { utciC: r1(u), cls: name ? name.toLowerCase() : null, heat, cold, level: heat || cold || 'Normal', ...(H.condition || C.condition ? { condition: H.condition || C.condition } : {}) };
}

/* v91.17.283.23 · audit 4 · "None" is a level only for an assessed UTCI; an hour without one is not assessed, with its reason */
export const CALM_NOTE = 'no wind in the forecast for this hour: UTCI uses the calm reference wind (0.5 m/s), an upper bound for heat and a lower bound for cold';
export const hourUtciWhy = (h) => h.utciNotAssessed || (h.rh == null ? 'not assessed: humidity missing for this hour' : 'not assessed: UTCI could not be computed for this hour');
export const hourLevel = (h, k) => (isN(h.utciShadeC) ? h[k] || 'Normal' : null);
/* v91.17.283.28 · S4 · a day's UTCI maximum needs the UTCI of every daytime hour, its minimum of every night hour (dayext.mjs); the reason
   names the first hour of that part that has no UTCI, or the part's hours the day does not hold (was: every one of 24 hours) */
export function utciPartWhy(a, e, need) {
  const byH = new Map(a.map((h) => [Number(h.time.slice(11, 13)), h]));
  const miss = need.map((hh) => byH.get(hh)).filter((h) => h && !isN(h.utciShadeC)); if (miss.length) return hourUtciWhy(miss[0]) + ' (' + miss[0].time.slice(11, 16) + (miss.length > 1 ? ' and ' + (miss.length - 1) + ' more hour' + (miss.length > 2 ? 's' : '') : '') + '): the day\u2019s UTCI extreme is not known';
  return e.why || 'not assessed';
}

/* -- the measured error of the served chain (files read on change) -- */
const WORDS = [[1.6, 'Good'], [2.5, 'Fair'], [Infinity, 'Low']];   /* Good up to 1.6 C (the plains figures), Fair up to 2.5 C, Low above */
export const wordOf = (mae) => (isN(mae) ? WORDS.find(([m]) => mae <= m)[1] : 'Not measured');
/* v91.17.283.28 · S6 · ONE ACCURACY FIGURE: the verification agent's ledger (accuracy.mjs), the as-issued forecast against the stations,
   for the point's zone and lead (hourly temperature for "now", the daily maximum for a day); a cell the ledger does not hold is 'Not
   measured' with the agent's reason. The national-model held-out MAE, the live layer's held-out MAE and the fleet cohort are no longer
   quoted as the place's accuracy (they test single steps, not the served forecast). */
export function confidence(dataDir, { zone, lead = 0, kind = 'hourly' }) {
  const c = accuracyCell(dataDir, { variable: kind === 'daily' ? 'TX' : 'T', zone, lead });
  return { words: wordOf(c.maeC), maeC: c.maeC, basis: c.set + '; ' + c.variable + ', ' + (zone || 'unknown') + ' zone, lead day ' + c.lead + (c.period ? ', ' + c.period.from + ' to ' + c.period.to : ''),
    ...(c.maeCi ? { maeCi: c.maeCi } : {}), ...(c.why ? { why: c.why } : {}), text: isN(c.maeC) ? wordOf(c.maeC) + ' \u00b7 average error ' + c.maeC.toFixed(1) + ' \u00b0C' : 'error not measured here' };
}

/* v91.17.283.28 · S4 / S10 · ONE DAY CORE: a day's extremes and its UTCI heat and cold from its hours (the place record's days, and the
   scenario run on perturbed hours, read this one function) */
const ALL24 = Array.from({ length: 24 }, (_, i) => i);   /* v283.31 · 3.2: every hour of the day */
export function dayCore(a, d, lat, lon) {
  const X = (k, kind, label) => extremeOfDay(a, k, kind, lat, lon, d, { label });
  const eTx = X('tempC', 'max', 'temperature'), eTn = X('tempC', 'min', 'temperature'), eFx = X('feelsC', 'max', 'feels-like temperature'), eWx = X('windKmh', 'max', 'wind'), eGx = X('gustKmh', 'max', 'gust');
  const eUx = X('utciShadeC', 'max', 'UTCI'), eUn = X('utciShadeC', 'min', 'UTCI');
  const uMax = eUx.v != null ? a.find((h) => h.utciShadeC === eUx.v && h.time.slice(11, 16) === eUx.at) : null, uMin = eUn.v != null ? a.find((h) => h.utciShadeC === eUn.v && h.time.slice(11, 16) === eUn.at) : null;
  const hl = utciLevel(uMax ? uMax.utciShadeC : null), cl = utciLevel(uMin ? uMin.utciShadeC : null), DN = dayNight(lat, lon, d);
  const uWhyMax = eUx.v == null ? utciPartWhy(a, eUx, ALL24) : null, uWhyMin = eUn.v == null ? utciPartWhy(a, eUn, ALL24) : null;
  const calmPeak = !!(uMax && uMax.calmWind), calmLow = !!(uMin && uMin.calmWind);
  return { tmaxC: eTx.v, tminC: eTn.v, tmaxAt: eTx.at, tminAt: eTn.at, sun: { sunrise: DN.sunrise, sunset: DN.sunset, daytimeHours: DN.day.length, basis: DN.basis },
    whys: { ...(eTx.why ? { tmaxWhy: eTx.why } : {}), ...(eTn.why ? { tminWhy: eTn.why } : {}), ...(eFx.why ? { feelsMaxWhy: eFx.why } : {}), ...(eWx.why ? { windMaxWhy: eWx.why } : {}), ...(eGx.why ? { gustMaxWhy: eGx.why } : {}) },
    windMaxKmh: r1(eWx.v), gustMaxKmh: eGx.v, feelsMaxC: eFx.v,
    heat: uWhyMax ? { utciMaxC: null, at: null, cls: null, level: null, assessed: false, why: uWhyMax }
      : { utciMaxC: hl.utciC, at: uMax ? uMax.time.slice(11, 16) : null, cls: hl.cls, level: hl.heat || 'Normal', assessed: true, ...(calmPeak ? { calmWind: true, calmWindNote: CALM_NOTE } : {}) },
    cold: uWhyMin ? { utciMinC: null, at: null, cls: null, level: null, assessed: false, why: uWhyMin }
      : { utciMinC: cl.utciC, at: uMin ? uMin.time.slice(11, 16) : null, cls: cl.cls, level: cl.cold || 'Normal', assessed: true, ...(calmLow ? { calmWind: true, calmWindNote: CALM_NOTE } : {}) } };
}
/* the UTCI fields of one hour (the record's hours and the scenario's perturbed hours) */
export function hourComfort(T, rh, windKmh) { const c = comfortOf(T, rh, windKmh), lv = utciLevel(c.utciShadeC);
  return { utciShadeC: c.utciShadeC, utciClass: lv.cls, heatLevel: lv.heat, coldLevel: lv.cold, ...(c.utciNotAssessed ? { utciNotAssessed: c.utciNotAssessed } : {}), ...(c.utciCalmWind ? { calmWind: true } : {}) }; }

import { curveCheck } from './servedqc.mjs';   /* v91.17.283.46 / 283.47 · the served-curve check */
export function createPointState(app, opts = {}) {
  const dataDir = opts.dataDir || app.dataDir;
  const now = opts.now || (() => Date.now());
  const port = () => Number(opts.port || process.env.PORT || 8787);
  const fetchPx = opts.fetchPx || (async (qs, tag, pri) => { const r = await fetch(`http://127.0.0.1:${port()}/px/v1/forecast?` + qs, { headers: { 'Sec-Fetch-Site': 'same-origin', 'x-agn-internal': tag || 'point-engine', 'x-agn-keep-raw': '1', ...(pri === 'lo' ? { 'x-agn-priority': 'low' } : {}), ...(process.env.NIGRAAN_INTERNAL_TOKEN ? { 'x-agn-internal-token': process.env.NIGRAAN_INTERNAL_TOKEN } : {}) }, signal: AbortSignal.timeout(90000) });
    if (!r.ok) throw new Error('the forecast did not arrive (' + r.status + ')'); return r.json(); });
  const cache = new Map(), inflight = new Map(), PS_MAX = Math.max(50, Number(process.env.NIGRAAN_POINT_RECORDS) || 1200);
  /* v91.17.283.51 · B (memory) · a record past PS_TTL_MS or from an earlier PKT hour is never served (state() below); removed once a minute
     instead of only when the count passes 3000 */
  { const t = setInterval(() => { const h = pktHour(now()); for (const [k, v] of cache) if (!(now() - v.at < PS_TTL_MS && v.h === h)) cache.delete(k); }, 60e3); t.unref?.(); }
  /* v91.17.283.24 · P4 / P13 · what a record's own provider answer held beside the served values, kept with the record (never sent):
     raw   the provider's temperature series before any correction (server.mjs pxRawTake: the body of the record's own request)
     range the national model's 90 % band per hour (agn_national.range90), widened by the live-station interval where that applies */
  const EXTRA = new WeakMap();

  function place(lat, lon) {
    let row = null; try { row = app.places.pointRow(lat, lon); } catch (_) { row = null; }
    if (!row) return { ok: false, why: 'the point could not be placed' };
    if (row.atSea) return { ok: false, atSea: true, why: row.why };
    if (!row.administered) return { ok: false, outside: true, why: row.why || (row.disputed ? 'IIOJK (disputed): not scored' : 'outside Pakistan-administered territory') };
    const z = isN(row.forecastElevM) ? row.forecastElevM : isN(row.elevM) ? row.elevM : null;   /* the point engine's height rule */
    return { ok: true, row, elevM: z };
  }
  /* the cache key: the provider's model run(s) of the request and the live-station read the chain used (as the point engine keys) */
  function runKey() {
    /* v91.17.283.23 · audit 6 · the run service (modelruns.mjs status) names each domain's run in `run` (ISO time); the key is the newest run
       time plus a short hash of EVERY domain's run, so a new run of any model changes it (not only the newest one) */
    let run = null; try { const st = app.modelRuns && app.modelRuns.status ? app.modelRuns.status() : null; const D = st && st.domains;
      const ent = D ? (Array.isArray(D) ? D.map((d, i) => [String(i), d]) : Object.entries(D)) : [];
      const runs = ent.map(([k, d]) => [k, d && (d.run || d.init || d.lastRunInit)]).filter(([, r]) => r).map(([k, r]) => [k, String(r)]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
      if (runs.length) { const newest = runs.map(([, r]) => r).sort().pop(); let h = 0; for (const c of runs.map((x) => x.join('=')).join('|')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
        run = newest.slice(0, 16) + '~' + h.toString(36); } } catch (_) {}
    if (!run) run = 'slot' + Math.floor(now() / H);   /* no run metadata: the hour */
    let live = ''; try { live = (app.hyperlocal ? app.hyperlocal.status().liveStations : '') + '|' + (app.fleet && app.fleet.latest ? app.fleet.latest().at : ''); } catch (_) { live = ''; }
    return { run, live };
  }

  /* one location of the served answer -> the point state */
  function build(lat, lon, P, L, key, run) {
    const Hh = L.hourly || {}; if (!Array.isArray(Hh.time) || !Array.isArray(Hh.temperature_2m)) return { ok: false, why: 'the forecast carried no hours', run };
    const N = L.agn_national || {}, L3 = L.agn_hyperlocal || {}, BC = L.agn_bias_correction || {}, TB = L.agn_temperature_basis || {}, WX = L.agn_wxmos || {}, E = L.agn_ecmwf010 || null;
    const zone = TB.zone || N.zone || null;
    const nowH = pktHour(now()), i0 = Math.max(0, Hh.time.findIndex((t) => String(t).slice(0, 13) >= nowH));
    const R90 = N.range90 || {}, range = new Map();
    Hh.time.forEach((t, i) => { const T = v0(Hh, 'temperature_2m', i); if (T == null) return; let a = isN((R90.lo || [])[i]) ? R90.lo[i] : null, b = isN((R90.hi || [])[i]) ? R90.hi[i] : null;
      if (L3.applied && i >= i0 && i < i0 + (L3.hours || 0) && isN(L3.plusMinus90C)) { a = Math.min(a == null ? Infinity : a, T - L3.plusMinus90C); b = Math.max(b == null ? -Infinity : b, T + L3.plusMinus90C); }
      range.set(String(t).slice(0, 16), [a == null || !isFinite(a) ? null : r1(a), b == null || !isFinite(b) ? null : r1(b)]); });
    const v = (n, i) => (Array.isArray(Hh[n]) && isN(Hh[n][i]) ? Hh[n][i] : null);
    const qcHeld = [];   /* v91.17.283.46 / 283.47 · servedqc.mjs curveCheck: an hour outside the place's observed range, or on either side of a
                            one-hour change no observation has shown in its zone and month, is withheld (no value, no level) */
    const QC = curveCheck(dataDir, Hh.time.map((t, i) => ({ time: String(t).slice(0, 16), T: v('temperature_2m', i) })), zone, isN(P.elevM) ? P.elevM : null);
    const hours = Hh.time.map((t, i) => { const T = v('temperature_2m', i); if (T == null) return null;
      { const q = QC.get(String(t).slice(0, 16)); if (q) { qcHeld.push({ time: String(t).slice(0, 16), ...q }); return null; } }
      const c = comfortOf(T, v('relative_humidity_2m', i), v('wind_speed_10m', i)), lv = utciLevel(c.utciShadeC);
      const live = !!(L3.applied && i >= i0 && i < i0 + (L3.hours || 0));
      return { time: String(t).slice(0, 16), tempC: r1(T), dewC: r1(v('dew_point_2m', i)), rh: isN(v('relative_humidity_2m', i)) ? Math.round(v('relative_humidity_2m', i)) : null,
        windKmh: r1(v('wind_speed_10m', i)), gustKmh: isN(v('wind_gusts_10m', i)) ? Math.round(v('wind_gusts_10m', i)) : null, rainMm: r1(v('precipitation', i)), cloudPct: isN(v('cloud_cover', i)) ? Math.round(v('cloud_cover', i)) : null,
        feelsC: r1(v('apparent_temperature', i)), weatherCode: v('weather_code', i), rainProb: v('precipitation_probability', i), snowCm: r1(v('snowfall', i)), pressureHpa: r1(v('surface_pressure', i)), swRad: isN(v('shortwave_radiation', i)) ? Math.round(v('shortwave_radiation', i)) : null, uv: isN(v('uv_index', i)) ? Math.round(v('uv_index', i)) : null, utciShadeC: c.utciShadeC, utciClass: lv.cls, heatLevel: lv.heat, coldLevel: lv.cold, live, ...(c.utciNotAssessed ? { utciNotAssessed: c.utciNotAssessed } : {}), ...(c.utciCalmWind ? { calmWind: true } : {}) }; }).filter(Boolean);
    const rainEnd = hourEndingTotals(Hh.time, (Hh.precipitation || []).map((x) => (isN(x) ? r1(x) : null))), snowEnd = hourEndingTotals(Hh.time, (Hh.snowfall || []).map((x) => (isN(x) ? r1(x) : null)));
    const byDay = new Map(); for (const h of hours) { const d = h.time.slice(0, 10); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(h); }
    const today = nowH.slice(0, 10), national = { applied: !!N.applied, zone: N.zone || zone, variant: N.variant || 'nopool' };
    const days = [...byDay.entries()].filter(([, a]) => a.length >= 20).map(([d, a]) => {
      const lead = Math.round((Date.parse(d) - Date.parse(today)) / 864e5);
      const core = dayCore(a, d, lat, lon);
      const nums = (k) => a.map((h) => h[k]).filter(isN), mean = (k) => { const q = nums(k); return q.length ? q.reduce((s, x) => s + x, 0) / q.length : null; }, max = (k) => { const q = nums(k); return q.length ? Math.max(...q) : null; };
      /* v91.17.283.23 · audit 3 / 4 · a day total or a day extreme is served only when every hour of the day carries the value; otherwise it
         is not assessed with the reason (never a sum of the hours that happen to be there, never "None" for a UTCI that could not be made) */
      /* v91.17.283.28 · S2 · the day's rain and snow are the hours ENDING 01:00 to 24:00 PKT (pktday.mjs, the one rule; the strip's eight
         3-hour windows of the day add up to it); complete only with all 24 of them */
      const RE = rainEnd.get(d), SE = snowEnd.get(d), rainN = RE ? RE.n : 0, snowN = SE ? SE.n : 0;
      const rainWhy = RE && RE.dup ? 'duplicate hour in the rain of the day (' + RE.dupStamps.slice(0, 2).join(', ') + '): the provider sent the same hour twice' : !RE || RE.hours < 24 ? 'the day holds ' + (RE ? RE.hours : 0) + ' of the 24 hours ending 01:00-24:00' : rainN < 24 ? 'rain missing for ' + (24 - rainN) + ' of 24 hours' : null;
      const snowWhy = SE && SE.dup ? 'duplicate hour in the snowfall of the day' : !SE || SE.hours < 24 ? 'the day holds ' + (SE ? SE.hours : 0) + ' of the 24 hours ending 01:00-24:00' : snowN < 24 ? 'snowfall missing for ' + (24 - snowN) + ' of 24 hours' : null;
      const conf = confidence(dataDir, { zone, lead: Math.max(0, lead), kind: 'daily' });
      return { date: d, lead, tmaxC: core.tmaxC, tminC: core.tminC, tmaxAt: core.tmaxAt, tminAt: core.tminAt, hoursHeld: a.length, sun: core.sun, ...core.whys,
        ...(rainWhy ? { rainMm: null, rainWhy: 'not assessed: ' + rainWhy } : (() => { const M = shownRainMm(dataDir, r1(RE.sum), { zone, lead, month: Number(d.slice(5, 7)) }); return { rainMm: M.mm, ...(M.rawMm != null ? { rainMmRaw: M.rawMm } : {}), rainMapping: M.mapping, rainMappingWhy: M.mappingWhy }; })()),   /* v283.31 science lane: the mountain mapping, ONE place (every surface reads this day) */ windMaxKmh: core.windMaxKmh, gustMaxKmh: core.gustMaxKmh, rhMean: isN(mean('rh')) ? Math.round(mean('rh')) : null,
        cloudMean: isN(mean('cloudPct')) ? Math.round(mean('cloudPct')) : null, dewMeanC: r1(mean('dewC')), feelsMaxC: core.feelsMaxC, uvMax: max('uv'), rainProbMax: max('rainProb'), snowCm: snowWhy ? null : r1(SE.sum), ...(snowWhy ? { snowWhy: 'not assessed: ' + snowWhy } : {}), weatherCode: (() => { const q = nums('weatherCode'); return q.length ? Math.max(...q) : null; })(),
        heat: core.heat, cold: core.cold, confidence: conf }; })
      .filter((d) => d.lead >= 0 && d.lead <= 6);
    const nh = hours.find((h) => h.time.slice(0, 13) === nowH) || null;
    const liveNow = !!(nh && nh.live);
    const steps = ['forecast for the ' + (zone || '') + ' zone at ' + (isN(P.elevM) ? Math.round(P.elevM) + ' m' : 'the model terrain height')];
    if (TB.calibration && TB.calibration.applied) steps.push('station calibration');
    if (N.applied) steps.push('national temperature model');
    if (WX.applied) steps.push('weather correction');
    if (BC.applied) steps.push(clean(BC.method || 'station correction') || 'station correction');
    if (E && E.variables && E.variables.length) steps.push('9 km model values for ' + E.variables.join(', ') + ' (switch rule passed)');
    if (L3.applied) steps.push('live observation correction (' + L3.stations + ' within ' + (L3.radiusKm || 40) + ' km, next ' + L3.hours + ' h)');
    const kind = liveNow ? 'Live-corrected forecast' : 'Model forecast';
    /* v91.17.283.19 · THE ONE NEAREST STATION of a place (every page names this one): the nearest reporting AGN station that passes the
       fleet's display screens, within 25 km and within the fleet's height rule of the point's own forecast height, measured from the
       exact point; its latest reading is an observation, labelled as such and never the place's "now" */
    let near = null; try { const nOut = {}; const n = app.fleet && app.fleet.nearest ? app.fleet.nearest(lat, lon, 25, null, P.elevM, { out: nOut }) : null;
      if (n) { const t = n.lastUpdated ? Date.parse(n.lastUpdated) : NaN;
        near = { station: n.name, id: n.key || null, no: n.no != null ? n.no : null, km: n.km, ageMin: Number.isFinite(t) ? Math.max(0, Math.round((now() - t) / 60000)) : (isN(n.ageMin) ? n.ageMin : null), usable: n.usable, status: n.status || null,
          stationElevM: isN(n.stationElevM) ? Math.round(n.stationElevM) : null, pointElevM: isN(n.pointElevM) ? Math.round(n.pointElevM) : null,
          reading: { kind: 'station', tempC: r1(n.tempC), rh: isN(n.rhPct) ? Math.round(n.rhPct) : null, windKmh: isN(n.windKmh) ? Math.round(n.windKmh) : null, observedAt: n.lastUpdated || null,
            note: 'the station\u2019s own reading (an observation, not corrected); the place\u2019s "now" is the forecast record' },
          rule: 'nearest reporting station passing the display screens, within 25 km and the height rule, from the exact point' }; }
      else { const w = nOut.why; near = { station: null, why: (w && w.why) || 'no live temperature measurement near this place', ...(w && Array.isArray(w.held) && w.held.length ? { held: w.held } : {}), rule: 'nearest reporting station passing the display screens, within 25 km and the height rule, from the exact point' }; } } catch (_) {}
    const d0 = days.find((d) => d.lead === 0) || null;
    /* v91.17.283.20 · item A2 · UTCI IN THE SUN of the hour (the v283.16 analyst page's calculation, now on the server): mean radiant
       temperature from the hour's forecast short-wave radiation at the sun's elevation now (utci.mjs tmrt: Fanger projected area, diffuse
       taken as 0.3 of global, albedo 0.20; an estimate, not measured), then the same Broede polynomial; null at night or without radiation.
       The levels stay on UTCI in shade. */
    let sun = null; if (nh) { const el = sunElevOf(lat, lon, now()); let tm = null, us = null;
      if (isN(nh.swRad) && el > 0) { tm = tmrtOf(nh.tempC, nh.swRad, null, el, null); us = utciOf(nh.tempC, tm, isN(nh.windKmh) ? nh.windKmh / 3.6 : null, nh.rh); }
      sun = { utciSunC: isN(us) ? us : null, tmrtSunC: isN(us) ? tm : null, sunElevDeg: Math.round(el * 10) / 10, utciSunClass: isN(us) ? utciClass(us) : null,
        utciSunBasis: 'UTCI in the sun: Tmrt estimated from the forecast short-wave radiation of this hour at the sun\u2019s elevation now (not measured); the heat level uses UTCI in shade' }; }
    const rec = { ok: true, version: PS_VERSION, key, run, issuedAt: new Date(now()).toISOString(),
      point: { lat, lon, elevM: isN(P.elevM) ? Math.round(P.elevM) : null, heightBasis: P.row.heightBasis || null, zone },
      area: { kind: 'area', tehsil: P.row.tehsil || null, district: P.row.district || null, province: P.row.province || null, unitId: P.row.unitId || null,
        note: 'area: the tehsil this point lies in; hazard levels on the map and in the area panel are the tehsil’s, the values here are the point’s' },
      source: { kind, label: 'served forecast chain: ' + steps.join(' + '), chain: steps, fallback: L.agn_fallback && L.agn_fallback.applied ? clean(L.agn_fallback.note || 'secondary forecast') : null,
        fineGrid: E ? { variables: E.variables, run: E.run, rule: 'switch rule passed (the 9 km test score)' } : { variables: [], why: 'the 9 km values are served only for variables whose switch rule passed' },
        mach: { applied: liveNow, anyHour: !!L3.applied, why: L3.applied ? null : (L3.why || 'live station layer not run for this forecast'), stations: L3.stations || 0, nearestKm: L3.nearestKm ?? null, plusMinus90C: L3.plusMinus90C ?? null, nearest: near },
        national },
      confidence: { now: confidence(dataDir, { zone, lead: 0, kind: 'hourly' }), today: d0 ? d0.confidence : null },
      now: nh ? { time: nh.time, tempC: nh.tempC, feelsC: nh.feelsC, dewC: nh.dewC, rh: nh.rh, windKmh: nh.windKmh, gustKmh: nh.gustKmh, rainMm: nh.rainMm, cloudPct: nh.cloudPct, weatherCode: nh.weatherCode, rainProb: nh.rainProb, snowCm: nh.snowCm, pressureHpa: nh.pressureHpa, swRad: nh.swRad, uv: nh.uv,
        utciShadeC: nh.utciShadeC, utciClass: nh.utciClass, heatLevel: hourLevel(nh, 'heatLevel'), coldLevel: hourLevel(nh, 'coldLevel'), live: nh.live, ...(isN(nh.utciShadeC) ? {} : { utciWhy: hourUtciWhy(nh) }), ...(nh.calmWind ? { calmWind: true } : {}), ...(sun || {}) } : null,
      heat: { utciCategoryLabel: UTCI_CATEGORY_LABEL, levelWords: 'Normal / Low / Moderate / High / Severe (the one customer scale; cls is the UTCI category, not a level)', scale: 'UTCI assessment scale (Blazejczyk et al. 2013): a level only from strong stress; heat Moderate 32-38, High 38-46, Severe 46+ °C; cold Moderate -13 to -27, High -27 to -40, Severe below -40 °C',
        now: nh ? { utciC: nh.utciShadeC, cls: nh.utciClass, level: hourLevel(nh, 'heatLevel'), cold: hourLevel(nh, 'coldLevel'), assessed: isN(nh.utciShadeC), ...(isN(nh.utciShadeC) ? {} : { why: hourUtciWhy(nh) }) } : null, today: d0 ? d0.heat : null, todayCold: d0 ? d0.cold : null },
      hours: hours.filter((h) => h.time.slice(0, 10) >= today && Math.round((Date.parse(h.time.slice(0, 10)) - Date.parse(today)) / 864e5) <= 3), days, ...(qcHeld.length ? { qc: { withheld: qcHeld, rule: 'served-value plausibility screen (server/api/servedqc.mjs)' } } : {}) };
    if (qcHeld.length) { try { console.warn('[servedqc] ' + qcHeld.length + ' served hour(s) withheld at ' + lat + ',' + lon + ' (' + (P.row.tehsil || '') + '): ' + qcHeld.slice(0, 4).map((q) => q.time + ' ' + q.valueC + ' C').join(', ') + ' | chain: ' + steps.join(' + ')); } catch (_) {} }
    EXTRA.set(rec, { range, raw: null });
    return rec;
  }

  /* one point asked on its own also carries HOW its "now" is made: the provider's own value of that hour from the record's own request
     (v91.17.283.24 · P4: kept from that answer, no second request), as the point engine's "How it is made" did */
  /* v91.17.283.53 · C · o.deadlineMs: answer within this time; the record keeps being made and is cached for the next read. Not ready in
     time: the last good record of the SAME point (any run, labelled stale with its run and time), else the newest record held for another
     point of the same tehsil (labelled as that tehsil's area forecast), else { ok:false, slow:true } with the reason in words */
  async function state(lat, lon, o = {}) {
    const job = many([{ lat, lon }], o).then((a) => a[0]);
    let r;
    if (o.deadlineMs > 0) { let to; r = await Promise.race([job, new Promise((ok) => { to = setTimeout(() => ok(undefined), o.deadlineMs); if (to.unref) to.unref(); })]); clearTimeout(to);
      if (r === undefined) { job.catch(() => {}); LG.st.deadline++; return stand(lat, lon); } }
    else r = await job;
    if (r && r.ok && r.now && !r.build && !o.noBuild) { const b = await rawBuild(r); if (b) r.build = b; }
    return r; }
  const LG = { m: new Map(), area: new Map(), st: { deadline: 0, servedSame: 0, servedTehsil: 0, none: 0 } };
  const lgPut = (k, v) => { LG.m.delete(k); LG.m.set(k, v); while (LG.m.size > LAST_MAX) LG.m.delete(LG.m.keys().next().value); };
  const hhmm = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t + PKT).toISOString().slice(11, 16) + ' PKT' : null; };
  function stand(lat, lon) {
    const la = Math.round(+lat * 1e5) / 1e5, lo = Math.round(+lon * 1e5) / 1e5, k = fineKey(la, lo), runNow = runKey().run;
    const same = LG.m.get(k);
    if (same) { LG.st.servedSame++; return { ...same, stale: { kind: 'same point', run: same.run, issuedAt: same.issuedAt, runNow,
      line: 'Showing the forecast made at ' + hhmm(same.issuedAt) + ': the newest forecast for this place is still being prepared.' } }; }
    let P = null; try { P = place(la, lo); } catch (_) { P = null; }
    const uid = P && P.ok ? P.row.unitId : null; let best = null, bd = Infinity;
    if (uid != null) for (const v of LG.m.values()) { if (!v || !v.area || v.area.unitId !== uid) continue; const d = Math.abs(v.point.lat - la) + Math.abs(v.point.lon - lo); if (d < bd) { bd = d; best = v; } }
    if (!best && uid != null && LG.area.has(uid)) best = LG.area.get(uid);   /* the area pass's record of the tehsil (its main settlement) */
    if (best) { LG.st.servedTehsil++; return { ...best, stale: { kind: 'tehsil area', run: best.run, issuedAt: best.issuedAt, runNow, from: { lat: best.point.lat, lon: best.point.lon, tehsil: best.area.tehsil },
      line: 'Showing the ' + (best.area.tehsil ? best.area.tehsil + ' tehsil' : 'tehsil') + ' area forecast made at ' + hhmm(best.issuedAt) + ': the forecast for this exact place is still being prepared.' } }; }
    LG.st.none++; return { ok: false, slow: true, run: runNow, why: 'the forecast for this place is still being prepared; try again in a minute' };
  }
  /* v91.17.283.19 · the "how it is made" of a record's now (the place bundle runs it beside its other parts) */
  async function rawBuild(r) { if (!r || !r.ok || !r.now) return null; if (r.build) return r.build;
    const X = EXTRA.get(r), W = X && X.raw; if (!W) return null;
    const k = W.time.findIndex((t) => String(t).slice(0, 16) === r.now.time), raw = k >= 0 ? W.t[k] : null;
    if (!isN(raw)) return null;
    return { time: r.now.time, rawC: r1(raw), servedC: r.now.tempC, totalDeltaC: r1(r.now.tempC - raw), steps: r.source.chain.slice(1), liveApplied: !!r.source.mach.applied, liveWhy: r.source.mach.applied ? null : r.source.mach.why,
      note: 'raw = the global forecast at this point and height before any NIGRAAN correction; served = the value every Overview screen shows' }; }
  /* the 90 % band of the record's hours (time -> [lo, hi]); null for a record not built from an answer here */
  const rangeOf = (r) => { const X = r && EXTRA.get(r); return X ? X.range : null; };
  /* many points: cached ones at once; the rest in ONE multi-location request per height kind (with / without a forecast height) */
  async function many(list, o = {}) {
    const K = runKey(), runId = K.run;
    if (o.run && o.run !== runId) return list.map(() => ({ ok: false, why: 'run ' + o.run + ' is not the current run (' + runId + ')', run: runId }));
    const out = new Array(list.length), todo = [];
    list.forEach((p, i) => {
      const lat = Math.round(+p.lat * 1e5) / 1e5, lon = Math.round(+p.lon * 1e5) / 1e5;   /* the point as asked (about 1 m) */
      if (!isN(lat) || !isN(lon) || lat < 23 || lat > 38 || lon < 60 || lon > 78) { out[i] = { ok: false, outside: true, why: 'not a point inside Pakistan' }; return; }
      const key = fineKey(lat, lon), ck = key + '|' + runId + '|' + K.live, hit = cache.get(ck);
      if (hit && now() - hit.at < PS_TTL_MS && hit.h === pktHour(now())) { out[i] = hit.v; return; }
      if (inflight.has(ck)) { if (o.pri !== 'lo') slotPromote(ck); out[i] = inflight.get(ck); return; }
      todo.push({ i, lat, lon, key, ck });
    });
    if (todo.length) {
      const job = (async () => {
        const res = new Map(), placed = todo.map((t) => ({ ...t, P: place(t.lat, t.lon) }));
        for (const t of placed) if (!t.P.ok) res.set(t.ck, { ok: false, ...t.P, run: runId });
        const ok = placed.filter((t) => t.P.ok);
        /* v91.17.283.52 · F1 · ONE PLACE, ONE REQUEST. A place's record was made from a multi-location request of whatever other points were asked
           with it (the 'near' list, a batch, the area pass), and that request's members, budget decisions, cache entries and model-run memo were
           keyed on the whole request: the same place showed 33.4 as a single point and 31.6 inside a 36-point list (frozen inputs). Each user
           record is now made from its OWN one-location request (the provider weighs a location the same either way), several at a time; only
           the background sweeps (area pass, hazard grid) keep multi-location requests, and their records are never stored for, or shared
           in flight with, a person's request (below). */
        const sweep = SWEEP_TAGS.has(String(o.tag || ''));
        const groups = sweep ? [ok.filter((t) => isN(t.P.elevM)), ok.filter((t) => !isN(t.P.elevM))].flatMap((grp) => { const g = []; for (let s = 0; s < grp.length; s += 40) g.push(grp.slice(s, s + 40)); return g; }) : ok.map((t) => [t]);
        const pri = sweep || o.pri === 'lo' ? 'lo' : 'hi';
        let gi = 0; await Promise.all(Array.from({ length: Math.min(sweep ? 1 : ONE_PAR, groups.length) }, async () => { while (gi < groups.length) { const part = groups[gi++];
            const slot = await slotTake(pri, sweep ? null : part.map((t) => t.ck)); SLOTS.st[slot.pri === 'hi' ? 'hiRan' : 'loRan']++; try {
            const q = new URLSearchParams({ __omhost: 'api.open-meteo.com', latitude: part.map((t) => t.lat.toFixed(5)).join(','), longitude: part.map((t) => t.lon.toFixed(5)).join(','), hourly: HOURLY, forecast_days: '8', timezone: 'Asia/Karachi' });   /* v283.28 S2: 8 days so day 7 has its 24:00 hour */
            if (isN(part[0].P.elevM)) q.set('elevation', part.map((t) => String(Math.round(t.P.elevM))).join(','));
            let arr = null, err = null; try { const j = await fetchPx(q.toString(), o.tag, slot.pri); arr = Array.isArray(j) ? j : [j]; } catch (e) { const m = String(e && e.message || e); err = /abort|timeout|timed out/i.test(m) ? 'the forecast provider did not answer in time' : /ECONN|ENOTFOUND|EAI_AGAIN|fetch failed|socket/i.test(m) ? 'the forecast provider could not be reached' : 'the forecast provider answered with an error'; }   /* a reason in words, never the raw exception */
            part.forEach((t, k) => { let v; if (!arr || !arr[k]) v = { ok: false, why: 'the forecast did not arrive' + (err ? ' (' + err + ')' : ''), run: runId };
              else { try { v = build(t.lat, t.lon, t.P, arr[k], t.key, runId); const X = v && v.ok ? EXTRA.get(v) : null; if (X && app.pxRawTake) X.raw = app.pxRawTake(t.lat, t.lon); } catch (e) { v = { ok: false, why: 'the point state could not be computed: ' + String(e && e.message || e).slice(0, 160), run: runId }; } }
              /* v91.17.283.15 · item 3: the urban heat-island field of the place is part of its record (app.urbanPoint, the one function the
                 /api/urban/point route answers too), so the urban cards read the store, not a request of their own */
              if (v && v.ok && app.urbanPoint) { try { v.urban = app.urbanPoint(t.lat, t.lon, isN(t.P.elevM) ? { elev: t.P.elevM } : {}); } catch (e) { v.urban = { ready: false, why: 'the urban field could not be computed: ' + String(e && e.message || e).slice(0, 120) }; } }
              res.set(t.ck, v); }); } finally { slotGive(slot); } } }));
        if (sweep && (String(o.tag || '') === 'pointstate-area' || String(o.tag || '') === 'pointstate-area-retry')) for (const v of res.values()) if (v && v.ok && v.area && v.area.unitId != null && (!LG.area.has(v.area.unitId) || LG.area.get(v.area.unitId).run !== runId)) LG.area.set(v.area.unitId, v);   /* v283.53 C: one area record per tehsil (its first sweep point), the fallback of last resort */
        for (const [k, v] of res) if (v && v.ok && !o.noCache && !sweep) { cache.set(k, { at: now(), h: pktHour(now()), v }); while (cache.size > PS_MAX) cache.delete(cache.keys().next().value); lgPut(String(v.key || k.split('|')[0]), v); }   /* v91.17.283.51 · memory: NIGRAAN_POINT_RECORDS (default 1200; was 3000: a place's 'near' part alone reads 36 records) */
        return res; })();
      const share = !SWEEP_TAGS.has(String(o.tag || ''));   /* a sweep's records are its own (F1) */
      if (share) for (const t of todo) inflight.set(t.ck, job.then((m) => m.get(t.ck)));
      try { const m = await job; for (const t of todo) out[t.i] = m.get(t.ck); } finally { if (share) for (const t of todo) inflight.delete(t.ck); }
    }
    return Promise.all(out);
  }
  /* the named places around a point. Their temperatures are the tehsil sweep already stored (areaheat.mjs nearNow):
     each sweep point was fetched once for the model run. This list does not call the provider. The place a person opened is still its own one-location request. */
  function near(lat, lon, radius = 12) {
    const rad = Math.min(30, Math.max(3, Number(radius) || 12));
    const j = app.areaHeat && app.areaHeat.nearNow ? app.areaHeat.nearNow(lat, lon, rad, 36) : { ok: false, why: 'the tehsil sweep is not running', places: [] };
    const places = (j.places || []).filter((x) => x && isN(x.tempC)).map((x) => ({
      name: x.name, kind: x.kind, lat: x.lat, lon: x.lon, elevM: x.elevM, km: x.km, uid: x.uid, tempC: x.tempC, time: x.time,
    })).sort((a, b) => b.tempC - a.tempC);
    return { lat, lon, radiusKm: j.radiusKm || rad, radiusAskedKm: rad, at: j.at || new Date(now()).toISOString(), places, liveLayer: 0, run: j.run || null,
      ...(places.length ? {} : { why: j.why || 'no tehsil-sweep temperature within ' + rad + ' km' }),
      note: j.source || 'temperatures from the tehsil sweep already held; no new forecast request' };
  }
  function status() { const K = runKey(); return { version: PS_VERSION, run: K.run, cached: cache.size, lastGood: LG.m.size, areaRecords: LG.area.size, lastGoodServed: { ...LG.st },
    slots: { hiMax: PAR_HI, loMax: PAR_LO, hiBusy: SLOTS.hiN, loBusy: SLOTS.loN, waitingHi: SLOTS.hi.length, waitingLo: SLOTS.lo.length, ...SLOTS.st } }; }
  /* v91.17.283.12 · the record's version for the page store (GET /api/pointstate/run): the model run and the live-station read the records
     are keyed by. The page keeps every record until this changes, then refreshes once (no section mixes runs). */
  function runStamp() { const K = runKey(); let h = 0; for (const c of String(K.live)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return { ok: true, run: K.run, stamp: K.run + '|' + h.toString(36) }; }
  return { state, many, near, rawBuild, rangeOf, status, runStamp };
}
