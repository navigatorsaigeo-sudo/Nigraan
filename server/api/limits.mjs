/* ══ v91.17.26 · P1-2 / P1-3 · CLIENT OPERATING LIMITS AGAINST THE FORECAST, NOW TO 15 DAYS ══
   The asset board in the browser answers one question well: does the 15-minute nowcast
   cross this limit in the next 48 hours? It could not answer the questions a site manager
   writes limits for: wet bulb above 32 °C for four hours, a 24-hour rain total, a daily
   minimum, a river flow at the plant's own reach, and anything beyond two days.

   This module evaluates each registered limit on two horizons, from two named sources:

     0-72 h     the SERVED forecast at the asset's place (v91.17.283.24: the point state every section shows; before, one
                named ECMWF IFS run). Deterministic: when the limit is first held
                for the registered duration, for how long, the peak and the margin.
     days 1-15  the 51-member ECMWF ensemble (0.25°). The chance is the share of members
                that hold the limit for the registered duration on that local day, with
                the hour window those members agree on and the typical duration.

   The ensemble temperature is moved onto the served forecast's basis at the asset (mean hourly
   difference over the hours both cover), because the Gojal heat-spell error of v91.17.25
   came from comparing two bases. Dew point is held, so humidity stays physically
   consistent when temperature moves. Rain, wind and river flow are not adjusted.

   What this does NOT do: estimate downtime, money or damage. A row says the forecast
   crosses a limit written for this asset; the consequence column repeats what the client
   recorded (criticality, tolerable downtime, backup), it does not compute one.

   Every row carries the measured error of that variable where one exists, and says so
   where none does. Nothing is ranked across limits: rows are ordered by time. */

const PKT_MS = 5 * 3600e3;
const DAY_MS = 86400e3;
const r1 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 10) / 10;
const pad = (n) => String(n).padStart(2, '0');
const tUTC = (s) => Date.parse(String(s).length <= 16 ? s + ':00Z' : s);
const pktDate = (ms) => new Date(ms + PKT_MS).toISOString().slice(0, 10);
const pktHour = (ms) => new Date(ms + PKT_MS).getUTCHours();
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtPKT = (ms) => { const d = new Date(ms + PKT_MS); return DOW[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + pad(d.getUTCHours()) + ':00 PKT'; };
const fmtDay = (iso) => { const d = new Date(iso + 'T12:00:00Z'); return DOW[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()]; };
const quant = (a, q) => { const s = a.filter(v => v != null && isFinite(v)).sort((x, y) => x - y); if (!s.length) return null; const p = (s.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return s[lo] + (s[hi] - s[lo]) * (p - lo); };
const median = (a) => quant(a, 0.5);

/* v91.17.128 · A-03 · the wet bulb is the one psychrometric solution (psychro.mjs) at the asset's height, not Stull's sea-level fit
   (which overstated it by 1.2-1.4 C above 1,500 m). The exported name is kept for callers; elev is optional (sea level without it). */
/* v91.17.283.37 · a reason for a client screen: no file names or code paths */
const plainWhy = (w) => String(w || '').replace(/\s*\((?:data|station-lake|scripts)\/[^)]*\)/g, '').replace(/\b(?:data|station-lake|scripts)\/[\w./-]+/g, 'the install');

export function stullWetBulb(t, rh, elev) {
  if (t == null || rh == null || !isFinite(t) || !isFinite(rh)) return null;
  return wetBulbC(t, Math.max(1, Math.min(100, rh)), Number.isFinite(elev) ? { elevationM: elev } : null);
}
const dewPoint = (t, rh) => dewPointC(t, Math.max(1, rh));
const rhFrom = (t, td) => rhFromDew(t, td);

/* ── the variables a limit can be written on ───────────────────────────────────────────── */
export const LIMIT_VARS = {
  temperature_2m:          { label: 'Air temperature', unit: '°C', kind: 'hourly', hazard: 'heat' },
  wet_bulb_temperature_2m: { label: 'Wet-bulb temperature', unit: '°C', kind: 'hourly', hazard: 'heat' },
  apparent_temperature:    { label: 'Apparent (feels-like) temperature', unit: '°C', kind: 'hourly', hazard: 'heat' },
  heat_index:              { label: 'Heat index (NWS)', unit: '°C', kind: 'hourly', hazard: 'heat' },
  utci_shade:              { label: 'Heat stress, UTCI in shade', unit: '°C', kind: 'hourly', hazard: 'heat' },   /* v91.17.207 · NIGRAAN's one public heat scale (CEO 3 Oct) */
  temperature_2m_max:      { label: 'Daily maximum temperature', unit: '°C', kind: 'dailymax', hazard: 'heat' },
  temperature_2m_min:      { label: 'Daily minimum temperature', unit: '°C', kind: 'dailymin', hazard: 'cold' },
  precipitation:           { label: 'Hourly rainfall', unit: 'mm', kind: 'hourly', hazard: 'rain_hz' },
  precipitation_24h:       { label: '24-hour rainfall', unit: 'mm', kind: 'roll24', hazard: 'rain_hz' },
  wind_gusts_10m:          { label: 'Wind gust', unit: 'km/h', kind: 'hourly', hazard: 'wind' },
  wind_speed_10m:          { label: 'Wind speed', unit: 'km/h', kind: 'hourly', hazard: 'wind' },
  river_discharge:         { label: 'River discharge at the nearest model river cell', unit: 'm³/s', kind: 'river', hazard: 'flood' },
  flood_depth:             { label: 'Flood depth at the site', unit: 'm', kind: 'refused', hazard: 'flood' },
};
export const LIMIT_ALIASES = {
  temperature: 'temperature_2m', air_temperature: 'temperature_2m', t2m: 'temperature_2m',
  wet_bulb: 'wet_bulb_temperature_2m', wetbulb: 'wet_bulb_temperature_2m', wbt: 'wet_bulb_temperature_2m', tw: 'wet_bulb_temperature_2m',
  utci: 'utci_shade', utci_shade: 'utci_shade', heat_stress: 'utci_shade',
  apparent: 'apparent_temperature', feels_like: 'apparent_temperature', heat_index: 'heat_index', hi: 'heat_index', nws_heat_index: 'heat_index',   /* v91.17.157 · audit: heat_index was read as the Steadman apparent temperature (38 C / 50 %: AT 43.6 vs NWS 48.6) */
  tmax: 'temperature_2m_max', max_temperature: 'temperature_2m_max', daily_max: 'temperature_2m_max',
  tmin: 'temperature_2m_min', min_temperature: 'temperature_2m_min', daily_min: 'temperature_2m_min',
  rain: 'precipitation', rainfall: 'precipitation', rain_1h: 'precipitation',
  rain_24h: 'precipitation_24h', rainfall_24h: 'precipitation_24h', precip_24h: 'precipitation_24h',
  gust: 'wind_gusts_10m', wind_gust: 'wind_gusts_10m', wind_gusts: 'wind_gusts_10m',
  wind: 'wind_speed_10m', wind_speed: 'wind_speed_10m',
  discharge: 'river_discharge', river_flow: 'river_discharge', streamflow: 'river_discharge',
  water_depth: 'flood_depth', inundation_depth: 'flood_depth', river_level: 'flood_depth', water_level: 'flood_depth',
};
const ENS_VARS = ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'precipitation', 'wind_gusts_10m', 'wind_speed_10m'];
const NEAR_H = 72;

import { STATE_WORD } from './states.mjs';   /* v91.17.283.37 */
import { dayNight } from './dayext.mjs';
import { RIVER_TZ, riverDaysFromToday } from './flood.mjs';   /* v283.10 */
import { readFileSync } from 'node:fs';
import { wetBulbC, dewPointC, rhFromDew } from './psychro.mjs';
import { heatIndexDetail, HEAT_VALIDITY } from './heatindex.mjs';
import { utci as utciF } from './utci.mjs';   /* v91.17.207 */
/* v91.17.157 · NWS heat index for a limit. Above the table's 43.3 C dry bulb the index is refused; the index is never below the air
   temperature there, so the air temperature is used as its lower bound (a limit at or under it is reached, never missed). */
/* v91.17.207 · UTCI in shade (mean radiant temperature = air temperature), wind in km/h as the runs return it */
const utciOf = (t, rh, wkmh) => { if (t == null || rh == null || !isFinite(t) || !isFinite(rh)) return null; const v = wkmh != null && isFinite(wkmh) ? wkmh / 3.6 : 1; const u = utciF(t, t, Math.min(17, Math.max(0.5, v)), rh); return u != null && isFinite(u) ? Math.round(u * 10) / 10 : null; };
const hiOf = (t, rh) => { if (t == null || rh == null || !isFinite(t) || !isFinite(rh)) return null; const d = heatIndexDetail(t, rh); if (!d.refused) return d.value;
  if (d.bound === 'maxIndexC') return Math.max(HEAT_VALIDITY.maxIndexC, d.extrapolated || 0);   /* v91.17.161 · above the table ceiling: at least 58.3 C (review: humid heat read clear) */
  return t > HEAT_VALIDITY.maxAirTempC ? t : null; };
import { join } from 'node:path';
import { unitAtPoint } from './unitresolve.mjs';   /* v91.17.70 */
import { internalNames, stationData } from './refmode.mjs';   /* v91.17.71 · data use vs naming */

export function createLimits(app) {
  const { provider } = app;
  /* v91.17.71 · NAMING: the texts that name the station networks are shown only with NIGRAAN_INTERNAL_REF=1 (internalNames()).
     v91.17.283.24 · H13: the IFS daily-extreme calibration (ifs-mos.json) is no longer applied here: 0-72 h is the served forecast. */
  const INTERNAL = internalNames();
  /* ══ v91.17.283.24 · self-audit H13 · 0-72 h READS THE SERVED POINT STATE ═══════════════════════════════════════════════════════
     The near horizon read one raw ECMWF IFS run (report.pointRun) with its own daily-extreme calibration (ifs-mos.json), so an asset's
     limit row could print a value no other section of the place showed. It now reads the served point state of the asset's place
     (pointstate.mjs: the one corrected value per place per run every page shows), its next 72 hours from the current hour:
     temperature, humidity, wind, gust, rain and feels-like as served, UTCI in shade as served, and the wet bulb derived from those
     served values here (psychro.mjs at the asset's height; the heat index as before). The served chain carries its own station
     calibration and national model, so no second calibration is applied. The ensemble is moved onto this served basis. */
  async function servedRun(lat, lon, elevIn, nowMs) {
    let ps = null; try { ps = await app.pointState.state(lat, lon, { noBuild: true }); } catch (e) { return { ok: false, why: 'the served forecast at this point is not available: ' + String(e && e.message || e).slice(0, 120) }; }
    if (!ps || !ps.ok) return { ok: false, why: (ps && ps.why) || 'the served forecast at this point is not available' };
    const elev = elevIn != null ? elevIn : (ps.point && ps.point.elevM != null ? ps.point.elevM : null);
    const H = (ps.hours || []).map((h) => ({ h, ms: Date.parse(h.time + ':00Z') - PKT_MS })).filter((x) => Number.isFinite(x.ms) && x.ms >= nowMs - 3600e3).slice(0, NEAR_H);
    const col = (f) => H.map(({ h }) => { const v = f(h); return v == null || !isFinite(v) ? null : v; });
    const series = { time: H.map(({ ms }) => new Date(ms).toISOString().slice(0, 16)), temperature_2m: col((h) => h.tempC), relative_humidity_2m: col((h) => h.rh),
      wind_speed_10m: col((h) => h.windKmh), wind_gusts_10m: col((h) => h.gustKmh), precipitation: col((h) => h.rainMm), apparent_temperature: col((h) => h.feelsC),
      utci_shade: col((h) => h.utciShadeC) };
    series.wet_bulb_temperature_2m = series.temperature_2m.map((t, i) => stullWetBulb(t, series.relative_humidity_2m[i], elev));
    if (!series.time.length) return { ok: false, why: 'the served forecast at this point holds no hour from now on' };
    return { ok: true, served: true, model: 'served', modelLabel: 'NIGRAAN served forecast at the place', run: ps.run || null, issuedAt: ps.issuedAt || null,
      site: { lat, lon, elevation: elev, elevationSource: elevIn != null ? 'supplied with the asset' : 'the place’s forecast height' }, gridCell: null, series };
  }
  const ensCache = new Map(), floodCache = new Map();
  const ENS_TTL = 3 * 3600e3;

  /* ── measured error, read from the skill sheet so the two cannot drift ─────────────── */
  function confidenceFor(variable, elev) {
    const P = (id) => { try { return app.skill.parameter(id); } catch (_) { return null; } };
    const mtn = elev != null && elev >= 1000;
    const out = (label, text, extra = {}) => ({ label, text, ...extra });
    /* v91.17.70 · the customer text quotes no internal-reference record: the plains error is the AGN MACH fleet check
       (data/fleet-history-skill.json via the skill sheet); no MACH station verifies the mountains, so none is claimed there.
       v91.17.71 · the daily extremes carry the station calibration again (tier B, stationData()); the station-measured
       errors of that calibration stay internal (internalNames()), so the text says the calibration is applied and quotes
       only the MACH figure. */
    if (/^(temperature_2m|temperature_2m_max|temperature_2m_min|wet_bulb_temperature_2m|precipitation|precipitation_24h|wind_gusts_10m|wind_speed_10m)$/.test(variable)) {   /* v283.24 H13: the served forecast in both views */
      const F = P('fleet_history_verification'), fr = (F && F.result) || null;
      const macht = fr && Number.isFinite(fr.maeC) ? fr.maeC : null;
      const what = variable === 'temperature_2m' ? 'hourly temperature' : variable === 'temperature_2m_max' ? 'daily maximum' : variable === 'temperature_2m_min' ? 'daily minimum' : null;
      const basis = what + ' from the served forecast at the place' + (stationData() ? ' (its station calibration and national model applied)' : ' (its national model applied; no station-fitted correction on this install)');
      if (what) {
        if (mtn || macht == null) return out('not measured here', basis + '. No AGN MACH station verifies this height' + (mtn ? ' band' : '') + ', so no error is claimed; treat a margin under ' + (mtn ? 5 : 3) + ' °C as reachable.');
        return out('measured', basis + '. Against the AGN MACH stations (' + (fr.trusted || fr.stations) + ' trusted, ' + fr.hours + ' paired hours) the served hourly temperature errs ' + macht + ' °C on average (night bias ' + fr.nightBiasC + ' °C). Treat a margin under 3 °C as reachable.', { maeC: macht });
      }
      if (variable === 'wet_bulb_temperature_2m') return out('not measured here', 'wet bulb from the served temperature and humidity at the asset: no AGN MACH station verifies wet bulb' + (mtn ? ' at this height' : '') + '; its error is mostly the model humidity near the ground. A limit within 3 °C above the forecast is reachable.');
      if (/^precipitation/.test(variable)) return out('measured: weak', fr && fr.pod10 != null ? 'against the AGN MACH rain gauges (' + fr.rainGauges + ') the served forecast catches ' + Math.round(fr.pod10 * 100) + ' % of 10 mm days with ' + Math.round(fr.far10 * 100) + ' % false alarms, and its totals run at ' + fr.rainRatio + ' of the observed. Read the chance, not the amount.' : 'the model misses convective peaks. Read the chance, not the amount.');
      return out('not measured here', 'model wind has no verified error at an AGN MACH station; in the mountains it is withheld. A site anemometer should decide this limit.');
    }
    switch (variable) {
      case 'apparent_temperature': return out('not measured', 'the apparent temperature is derived from temperature, humidity and wind; it has not been verified against observations.');
      case 'utci_shade': return out('not measured', 'UTCI in shade (radiant temperature = air temperature) from the served temperature, humidity and wind; the temperature is tested, the humidity and wind near the ground are not. Sun adds several degrees in the open.');
      case 'heat_index': return out('not measured', 'the NWS heat index (Rothfusz 1990) is derived from the served temperature and humidity; it has not been verified against observations. Above 43.3 °C air temperature the index is off its table and the air temperature is read as its lower bound.');
      case 'river_discharge':
        { const p = P('glofas_discharge'); return out('measured: weak', 'GloFAS river discharge, tested on ' + (p ? p.sample : 'eight mountain gauges') + ': day-to-day change correlation ' + (p ? p.raw.dayToDayChangeCorrelation : 0.00) + '. Return levels are fitted to the model\'s own 30-year record, not to WAPDA gauge records, which are not in this build. The model carries no canal withdrawal, so on the lower Indus it runs high.'); }
      default: return out('not measured', 'no measured error for this variable.');
    }
  }

  /* ── inputs ─────────────────────────────────────────────────────────────────────────── */
  async function ensemble(lat, lon, elev) {
    const key = lat.toFixed(3) + ',' + lon.toFixed(3) + ',' + (elev == null ? '-' : Math.round(elev));
    const c = ensCache.get(key); if (c && Date.now() - c.at < ENS_TTL) return c.v;
    const j = await provider.call('ensemble', '/v1/ensemble', { latitude: lat, longitude: lon, elevation: elev == null ? undefined : elev,
      models: 'ecmwf_ifs025', hourly: ENS_VARS, forecast_days: 15, timezone: 'GMT' }, { timeoutMs: 90000 });
    const H = j.hourly || {}, time = H.time || [];
    const mem = {};
    ENS_VARS.forEach(v => {
      const keys = Object.keys(H).filter(k => k === v || k.startsWith(v + '_member'));
      mem[v] = keys.map(k => H[k]);
    });
    const v = { time, ms: time.map(tUTC), mem, members: (mem.temperature_2m || []).length, retrievedAt: new Date().toISOString(), elevation: j.elevation,
      gridLat: j.latitude, gridLon: j.longitude };
    if (ensCache.size > 500) ensCache.delete(ensCache.keys().next().value); ensCache.set(key, { at: Date.now(), v });
    return v;
  }
  /* ══ v91.17.27 · P6-5 · A RIVER LIMIT IS BOUND TO A REACH, NOT TO A COORDINATE ══════════════
     The flood API returns the model cell at the coordinate, and GloFAS warns that the nearest cell
     may be a different river. The asset is bound, in order: to the reach the limit names (an FFD
     point id); to a named FFD reach within 20 km, using that point's snapped cell; or by the same
     snapping rule the FFD points use (nearest cell carrying at least 20 % of the local channel's
     flow within 15 km). If no cell qualifies the limit is refused rather than read off a ditch. */
  const bindCache = new Map();
  async function bindReach(lat, lon, reachId) {
    const k = lat.toFixed(3) + ',' + lon.toFixed(3) + ',' + (reachId || '');
    if (bindCache.has(k)) return bindCache.get(k);
    let out = null;
    const snapped = (app.flood && app.flood.snapped && app.flood.snapped()) || null, P = snapped && snapped.points ? Object.values(snapped.points) : [];
    const kmTo = (a, b, c, d) => { const R = 6371, r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
    if (reachId) { const p = P.find(x => x.id === reachId); if (p) out = { method: 'the reach named in the limit (' + p.name + ', ' + p.river + ')', lat: p.snapLat, lon: p.snapLon, reach: p.id, distanceKm: r1(kmTo(lat, lon, p.snapLat, p.snapLon)) }; }
    if (!out) { const near = P.map(p => ({ p, d: kmTo(lat, lon, p.lat, p.lon) })).filter(x => x.d <= 20).sort((a, b) => a.d - b.d)[0];
      if (near) out = { method: 'the nearest named river reach, ' + near.p.name + ' on the ' + near.p.river + ', ' + r1(near.d) + ' km away (its snapped model cell)', lat: near.p.snapLat, lon: near.p.snapLon, reach: near.p.id, distanceKm: r1(kmTo(lat, lon, near.p.snapLat, near.p.snapLon)) }; }
    if (!out && app.flood && app.flood.snapCoordinate) {
      let sr = await app.flood.snapCoordinate(lat, lon);
      if (sr.ok && !(sr.snap.snapDischarge >= 5)) sr = { ok: false, why: 'the nearest model channel within 15 km carries ' + sr.snap.snapDischarge + ' m³/s today: no river passes this asset in the model. Name the reach in the limit (column reach, a reach id such as sukkur or taunsa) if the asset draws on one further away' };
      out = sr.ok ? { method: 'snapped at the asset by the reach rule: ' + sr.snap.snapWhy, lat: sr.snap.snapLat, lon: sr.snap.snapLon, reach: null, distanceKm: sr.snap.snapKm, shareOfLocalChannel: sr.snap.snapShareOfLocalChannel, scaleNote: sr.snap.snapScaleNote }
                  : { refused: true, why: sr.why };
    }
    if (!out) out = { refused: true, why: 'no reach binding was possible' };
    if (bindCache.size > 500) bindCache.delete(bindCache.keys().next().value); bindCache.set(k, out); return out;
  }
  async function river(latIn, lonIn, reachId) {
    const B = await bindReach(latIn, lonIn, reachId);
    if (B.refused) { const e = new Error('no river reach could be bound to this asset: ' + B.why); e.refused = true; throw e; }
    const lat = B.lat, lon = B.lon;
    const key = lat.toFixed(3) + ',' + lon.toFixed(3);
    const c = floodCache.get(key); if (c && Date.now() - c.at < ENS_TTL) return { ...c.v, binding: B };
    const j = await provider.call('flood', '/v1/flood', { latitude: lat, longitude: lon, daily: 'river_discharge', ensemble: 'true', forecast_days: 16, timezone: RIVER_TZ }, { timeoutMs: 60000 });   /* v283.10 · the river date frame of flood.mjs (day D = UTC mean of D-1) */
    const D = riverDaysFromToday(j.daily || {}, undefined, 15);
    const keys = Object.keys(D).filter(k => k.startsWith('river_discharge_member'));
    const v = { dates: D.time || [], control: D.river_discharge || [], members: keys.map(k => D[k]), cellLat: j.latitude, cellLon: j.longitude, retrievedAt: new Date().toISOString() };
    if (floodCache.size > 500) floodCache.delete(floodCache.keys().next().value); floodCache.set(key, { at: Date.now(), v });
    return { ...v, binding: B };
  }

  /* move ensemble temperature onto the served forecast at this point (dew point held) */
  function basisShift(run, E) {
    if (!run || !run.series || !E || !E.members) return { tempC: 0, hours: 0, basis: 'no overlap with the served forecast; ensemble used as issued' };
    const idx = new Map(E.ms.map((m, i) => [m, i]));
    const d = [];
    run.series.time.forEach((t, k) => {
      const i = idx.get(tUTC(t)); const v = run.series.temperature_2m[k];
      if (i == null || v == null) return;
      const vals = E.mem.temperature_2m.map(m => m[i]).filter(x => x != null);
      if (vals.length) d.push(v - vals.reduce((a, b) => a + b, 0) / vals.length);
    });
    if (d.length < 24) return { tempC: 0, hours: d.length, basis: 'fewer than 24 hours overlap the served forecast; ensemble used as issued' };
    /* v91.17.283 · WS2 S4 · the shift is still held within ±6 °C, but a held shift is now said (clamped, with the measured mean) */
    const mean = d.reduce((a, b) => a + b, 0) / d.length, s = Math.max(-6, Math.min(6, mean)), clamped = s !== mean;
    return { tempC: r1(s), hours: d.length, ...(clamped ? { clamped: true, measuredC: r1(mean) } : {}), basis: 'ensemble temperature moved onto the served forecast at this asset: mean hourly difference over the ' + d.length + ' hours both cover' + (clamped ? ' (' + r1(mean) + ' °C measured, held at ' + r1(s) + ' °C)' : '') + '. Dew point is held, so humidity follows. Rain, wind and river flow are not adjusted.' };
  }

  /* a member's hourly series for a limit variable, on the shifted basis */
  function memberSeries(E, variable, m, shift) {
    const T = E.mem.temperature_2m[m] || [], RH = E.mem.relative_humidity_2m[m] || [];
    const sT = (i) => T[i] == null ? null : T[i] + shift;
    if (variable === 'temperature_2m' || variable === 'temperature_2m_max' || variable === 'temperature_2m_min') return E.time.map((_, i) => sT(i));
    if (variable === 'wet_bulb_temperature_2m') return E.time.map((_, i) => {
      if (T[i] == null || RH[i] == null) return null;
      if (!shift) return stullWetBulb(T[i], RH[i], E.elevation);
      const td = dewPoint(T[i], RH[i]); const t2 = T[i] + shift; return stullWetBulb(t2, rhFrom(t2, Math.min(td, t2)), E.elevation);
    });
    if (variable === 'heat_index') return E.time.map((_, i) => {
      if (T[i] == null || RH[i] == null) return null;
      if (!shift) return hiOf(T[i], RH[i]);
      const td = dewPoint(T[i], RH[i]); const t2 = T[i] + shift; return hiOf(t2, rhFrom(t2, Math.min(td, t2)));
    });
    if (variable === 'utci_shade') { const W = E.mem.wind_speed_10m[m] || []; return E.time.map((_, i) => {
      if (T[i] == null || RH[i] == null) return null;
      if (!shift) return utciOf(T[i], RH[i], W[i]);
      const td = dewPoint(T[i], RH[i]); const t2 = T[i] + shift; return utciOf(t2, rhFrom(t2, Math.min(td, t2)), W[i]); }); }
    if (variable === 'apparent_temperature') { const A = E.mem.apparent_temperature[m] || []; return E.time.map((_, i) => A[i] == null ? null : A[i] + shift); }
    if (variable === 'precipitation' || variable === 'precipitation_24h') return (E.mem.precipitation[m] || []).slice();
    if (variable === 'wind_gusts_10m') return (E.mem.wind_gusts_10m[m] || []).slice();
    if (variable === 'wind_speed_10m') return (E.mem.wind_speed_10m[m] || []).slice();
    return null;
  }

  const overFn = (dir, lim) => dir === 'below' ? (v) => v != null && v <= lim : (v) => v != null && v >= lim;
  const peakOf = (dir, a) => { let b = null; a.forEach(v => { if (v != null && (b == null || (dir === 'below' ? v < b : v > b))) b = v; }); return b; };
  const marginOf = (dir, lim, v) => v == null ? null : r1(dir === 'below' ? lim - v : v - lim);
  const roll24 = (a) => a.map((_, i) => { if (i < 23) return null; let s = 0, n = 0; for (let k = i - 23; k <= i; k++) { if (a[k] != null) { s += a[k]; n++; } } return n === 24 ? s : null; });   /* v91.17.68 · a 24-hour total is 24 hours; 20 hours were served as one (C20) */

  /* ── 0-72 h on the named run ─────────────────────────────────────────────────────────── */
  /* ══ v91.17.283 · WS2 F2 · COVERAGE OF THE 0-72 H ANSWER ═══════════════════════════════════════════════════════════════════
     nearTerm never checked how much of the window it had: 70 of 72 hours missing still answered "clear, no crossing in the next
     72 h", and a PKT day holding only its 12 night hours had its "maximum" read from the night (SELF-A F2). Now the completeness
     rule of the 24-hour standards (EPA 40 CFR 50 App. N: a day is complete with at least 75 % of its hours, 18 of 24) is applied:
       daily maximum / minimum   a day is read only with at least COMPLETE_SHARE of its 24 hours valid (was 12 hours, any 12)
       hourly / 24-hour limits   'clear' needs at least COMPLETE_SHARE of the window's hours valid; below that the answer is
                                 not evaluated with the count. A crossing found in the valid hours is reported whatever the rest.
     Every answer carries coverage { valid, of }. */
  const COMPLETE_SHARE = 0.75;
  function nearTerm(run, L, spec, nowMs) {
    if (!run || !run.ok) return { state: 'not-evaluated', why: 'the served forecast could not be read: ' + ((run && run.why) || 'no answer') };
    const S = run.series, ms = S.time.map(tUTC);
    const over = overFn(L.dir, L.limit), req = Math.max(1, Math.ceil((L.durationMin || 60) / 60));
    let vals;
    if (spec.kind === 'hourly') vals = S[L.variable];
    else if (spec.kind === 'roll24') vals = roll24(S.precipitation || []);
    else if (spec.kind === 'dailymax' || spec.kind === 'dailymin') {
      const by = new Map(); ms.forEach((m, i) => { const d = pktDate(m); if (!by.has(d)) by.set(d, []); by.get(d).push(i); });
      const days = [];
      for (const [d, ii] of by) {
        const v = ii.map(i => S.temperature_2m[i]).filter(x => x != null); if (v.length < Math.ceil(24 * COMPLETE_SHARE)) continue;
        const pick = spec.kind === 'dailymax' ? Math.max(...v) : Math.min(...v);
        const at = ii.find(i => S.temperature_2m[i] === pick);
        days.push({ date: d, value: r1(pick), atMs: ms[at], partial: ii.length < 24 });   /* v283.24 H13: the served day extreme (no second calibration) */
      }
      if (!days.length) return { state: 'not-evaluated', why: 'no day in the next 72 h had ' + Math.ceil(24 * COMPLETE_SHARE) + ' or more valid hours of 24 in the served forecast' };
      const hit = days.find(x => over(x.value));
      const pk = peakOf(L.dir, days.map(x => x.value));
      if (!hit) return { state: 'clear', peak: pk, margin: marginOf(L.dir, L.limit, pk), horizonH: NEAR_H,
        why: 'no ' + spec.label.toLowerCase() + ' ' + (L.dir === 'below' ? 'at or below ' : 'at or above ') + L.limit + ' ' + spec.unit + ' in the next 72 h; closest ' + pk + ' ' + spec.unit, days };
      const lead = Math.max(0, Math.round((hit.atMs - nowMs) / 60000));
      return { state: hit.date === pktDate(nowMs) && hit.atMs <= nowMs ? 'over-now' : 'crosses', startMs: hit.atMs, start: new Date(hit.atMs).toISOString(), startText: fmtDay(hit.date),
        endMs: null, hours: null, peak: hit.value, peakAt: new Date(hit.atMs).toISOString(), margin: marginOf(L.dir, L.limit, hit.value), leadMin: lead, day: hit.date, days,
        why: spec.label + ' ' + hit.value + ' ' + spec.unit + ' on ' + fmtDay(hit.date) + ' against a limit of ' + L.limit };
    } else return { state: 'not-evaluated', why: 'no deterministic series for ' + spec.label };
    if (!vals || !vals.some(v => v != null)) return { state: 'not-evaluated', why: spec.label + ' is not in the served forecast' };
    const nValid = vals.filter(v => v != null && isFinite(v)).length, coverage = { valid: nValid, of: vals.length };
    let runStart = -1;
    for (let i = 0; i < vals.length; i++) {
      if (!over(vals[i])) { runStart = -1; continue; }
      if (runStart < 0) runStart = i;
      if (i - runStart + 1 >= req) {
        let end = i; while (end + 1 < vals.length && over(vals[end + 1])) end++;
        const seg = vals.slice(runStart, end + 1), pk = peakOf(L.dir, seg), pi = runStart + seg.indexOf(pk);
        const startMs = ms[runStart], lead = Math.max(0, Math.round((startMs - nowMs) / 60000));
        const already = runStart === 0 && startMs <= nowMs + 3600e3;
        return { state: already ? 'over-now' : 'crosses', startMs, start: new Date(startMs).toISOString(), startText: fmtPKT(startMs),
          endMs: ms[end] + 3600e3, endText: fmtPKT(ms[end] + 3600e3), hours: end - runStart + 1, endsInsideHorizon: end + 1 < vals.length,
          peak: r1(pk), peakAt: new Date(ms[pi]).toISOString(), margin: marginOf(L.dir, L.limit, pk), leadMin: lead,
          coverage, why: (already ? 'held now' : 'first held ' + fmtPKT(startMs)) + ' for ' + (end - runStart + 1) + ' h (limit asks ' + req + ' h), peak ' + r1(pk) + ' ' + spec.unit };
      }
    }
    if (nValid < Math.ceil(vals.length * COMPLETE_SHARE)) return { state: 'not-evaluated', coverage,
      why: 'not assessed: the served forecast holds ' + nValid + ' of ' + vals.length + ' hours of ' + spec.label.toLowerCase() + ' in the window; a clear answer needs at least ' + Math.round(COMPLETE_SHARE * 100) + ' %' };
    const pk = peakOf(L.dir, vals);
    const brief = vals.some(over);
    return { state: 'clear', peak: r1(pk), margin: marginOf(L.dir, L.limit, pk), horizonH: NEAR_H, coverage,
      why: (nValid < vals.length ? '(' + (vals.length - nValid) + ' of ' + vals.length + ' hours missing in the served forecast) ' : '') + (brief ? 'reaches the limit but not for the ' + req + ' h the limit asks within 72 h (peak ' + r1(pk) + ' ' + spec.unit + ')'
                 : 'no crossing in the next 72 h; closest ' + r1(pk) + ' ' + spec.unit + ' (' + Math.abs(marginOf(L.dir, L.limit, pk)) + ' ' + spec.unit + (marginOf(L.dir, L.limit, pk) < 0 ? ' short of' : ' past') + ' the limit)') };
  }

  /* ── days 1-15 on the ensemble ───────────────────────────────────────────────────────── */
  /* ══ v91.17.283 · WS2 C1 / S4 · A MISSING MEMBER IS NOT A MEMBER THAT STAYED BELOW THE LIMIT ════════════════════════════════
     The chance was hits / N with N = every member the ensemble lists, so a member with no values on a day counted as "no crossing":
     two all-missing members gave 0 %, one crossing member beside one missing member gave 50 %, and a partial last PKT day (5 h) with
     every member at 43 C against a 40 C limit gave 0 % (AUDIT283 C1). Now each member is judged on its own values for the day:
       valid    it holds the limit for the registered duration (a hit is a hit whatever else is missing), or it has at least
                MIN_MEMBER_HOURS valid hours that day (the rule the daily extremes already used: a quarter of the day; a daily
                extreme needs them in any case, since its maximum or minimum is unknown without them)
     The chance is hits / valid members. A day is assessed only when the valid members are at least half the ensemble in use
     (minValidMembers(N) = ceil(N / 2): 26 of the 51 ECMWF members, 26 of 51 GloFAS members); below that the day carries
     chance null, state 'not-assessed' and the reason, never 0 %. Every day carries validMembers beside of (= N). */
  const MIN_MEMBER_HOURS = 6;
  const minValidMembers = (N) => Math.ceil(N / 2);
  function daysAhead(E, L, spec, shift, nowMs) {
    const over = overFn(L.dir, L.limit), req = Math.max(1, Math.ceil((L.durationMin || 60) / 60));
    const N = E.members, dates = [], byDay = new Map(), need = minValidMembers(N);
    E.ms.forEach((m, i) => { if (m < nowMs - 3600e3) return; const d = pktDate(m); if (!byDay.has(d)) { byDay.set(d, []); dates.push(d); } byDay.get(d).push(i); });
    const perMember = [];
    for (let m = 0; m < N; m++) {
      let s = memberSeries(E, L.variable, m, shift); if (!s) return null;
      if (spec.kind === 'roll24') s = roll24(s);
      perMember.push(s);
    }
    const out = [];
    dates.forEach((d, di) => {
      const ii = byDay.get(d); if (!ii.length) return;
      let hit = 0, valid = 0; const hoursHit = [], peaks = [], hourCount = new Array(24).fill(0);
      perMember.forEach(s => {
        const seg = ii.map(i => s[i]);
        const nValid = seg.filter(x => x != null && isFinite(x)).length;
        let ok = false, hrs = 0;
        if (spec.kind === 'dailymax' || spec.kind === 'dailymin') {
          const v = seg.filter(x => x != null); if (v.length < MIN_MEMBER_HOURS) { peaks.push(null); return; }
          let pk = spec.kind === 'dailymax' ? Math.max(...v) : Math.min(...v);
          /* v91.17.283.28 · S4 · a member's day maximum is known only with every daytime hour of the day at the point (its minimum with every
             night hour; dayext.mjs, the one rule); a member that crosses in the hours it holds is a real hit, one that does not and lacks
             hours of that part is not a valid member of the day */
          if (!over(pk) && isFinite(E.gridLat) && isFinite(E.gridLon)) { const need = dayNight(E.gridLat, E.gridLon, d)[spec.kind === 'dailymax' ? 'day' : 'night'];
            const held = new Set(); ii.forEach((i, k) => { if (seg[k] != null && isFinite(seg[k])) held.add(pktHour(E.ms[i])); }); if (need.some((hh) => !held.has(hh))) { peaks.push(null); return; } }
          peaks.push(pk); ok = over(pk);
          if (ok) ii.forEach((i, k) => { if (seg[k] === pk) hourCount[pktHour(E.ms[i])]++; });
        } else {
          let run = 0, best = 0; seg.forEach(v => { if (over(v)) { run++; best = Math.max(best, run); } else run = 0; });
          ok = best >= req; hrs = best;
          if (!ok && nValid < MIN_MEMBER_HOURS) { peaks.push(null); return; }   /* neither a hit nor enough hours to say it stayed clear */
          peaks.push(peakOf(L.dir, seg));
          if (ok) ii.forEach((i, k) => { if (over(seg[k])) hourCount[pktHour(E.ms[i])]++; });
        }
        valid++;
        if (ok) { hit++; if (hrs) hoursHit.push(hrs); }
      });
      let assessed = valid >= need && valid > 0;
      let chance = assessed ? Math.round(100 * hit / valid) : null;
      /* v91.17.283 · COORDINATOR DECISION (21 Oct, permanent F7) · A PARTIAL PKT DAY: hours on record only add evidence (a member that
         crosses in them is a real hit; the missing hours can only add hits), so the chance of a partial day is a LOWER BOUND:
           (a) the day has hits      -> "at least N % (based on H of 24 hours)"; every valid member crossing -> 100 %, certain
           (b) no hit, H < 18 of 24  -> not assessed: "only H hours of this day are in the forecast", never 0 %
           (c) no hit, H >= 18       -> the normal value (the coverage rule of the near-term check, COMPLETE_SHARE of the day) */
      const H = ii.length, COVER_H = Math.ceil(COMPLETE_SHARE * 24); let partialNote = null, lowerBound = false, partialWhy = null;
      if (H < 24 && hit === 0 && H < COVER_H) { assessed = false; chance = null; partialWhy = 'not assessed: only ' + H + ' hours of ' + (di === 0 ? 'today remain' : 'this day are') + ' in the forecast (a clear answer needs ' + COVER_H + ' of 24)'; }   /* (b) also when too few hours left members short of the member rule */
      else if (assessed && H < 24) {
        if (hit > 0) { lowerBound = hit < valid; partialNote = hit < valid ? 'at least ' + chance + ' % (based on ' + H + ' of 24 hours)' : '100 % (every member crosses in the ' + H + ' hours of this day in the forecast)'; }
        else if (H < COVER_H) { assessed = false; chance = null; partialWhy = 'not assessed: only ' + H + ' hours of ' + (di === 0 ? 'today remain' : 'this day are') + ' in the forecast (a clear answer needs ' + COVER_H + ' of 24)'; }
      }
      let window = null;
      if (assessed && hit && spec.kind !== 'dailymax' && spec.kind !== 'dailymin') {
        const need3 = Math.max(1, Math.ceil(hit / 3)), hrs = hourCount.map((c, h) => c >= need3 ? h : -1).filter(h => h >= 0);
        if (hrs.length >= 20) window = 'most of the day';
        else if (hrs.length) window = pad(hrs[0]) + ':00–' + pad((hrs[hrs.length - 1] + 1) % 24) + ':00 PKT';
      }
      out.push({ date: d, dayIndex: di, dayText: fmtDay(d), partial: ii.length < 24, chance, members: assessed ? hit : null, of: N, window, validMembers: valid,
        ...(H < 24 ? { hoursOnRecord: H } : {}), ...(partialNote ? { chanceText: partialNote, chanceIsLowerBound: lowerBound } : {}),
        ...(partialWhy ? { state: 'not-assessed', why: partialWhy } : assessed ? {} : { state: 'not-assessed', why: 'not assessed: ' + valid + ' of ' + N + ' ensemble members carry ' + (spec.kind === 'dailymax' || spec.kind === 'dailymin' ? 'the ' + MIN_MEMBER_HOURS + ' hours a daily extreme needs' : 'a crossing or ' + MIN_MEMBER_HOURS + ' valid hours') + ' on this day' + (ii.length < 24 ? ' (' + ii.length + ' h of the day in the forecast)' : '') + '; at least ' + need + ' are needed' }),
        typicalHours: assessed && hoursHit.length ? Math.round(median(hoursHit)) : null,
        p10: assessed ? r1(quant(peaks, 0.1)) : null, p50: assessed ? r1(quant(peaks, 0.5)) : null, p90: assessed ? r1(quant(peaks, 0.9)) : null,
        interpolated: (E.ms[ii[0]] - E.ms[0]) > 144 * 3600e3 });
    });
    return out;
  }

  function riverDays(R, L) {
    const over = overFn(L.dir, L.limit), N = R.members.length, need = minValidMembers(N);
    return R.dates.map((d, di) => {
      const vals = R.members.map(m => m ? m[di] : null).filter(v => v != null && isFinite(v));
      const hit = vals.filter(over).length, valid = vals.length, assessed = N > 0 && valid >= need;
      return { date: d, dayIndex: di, dayText: fmtDay(d), chance: assessed ? Math.round(100 * hit / valid) : null, members: assessed ? hit : null, of: N, validMembers: valid,
        ...(assessed ? {} : { state: 'not-assessed', why: 'not assessed: ' + valid + ' of ' + N + ' river ensemble members returned a discharge for this day; at least ' + need + ' are needed' }),
        p10: assessed ? r1(quant(vals, 0.1)) : null, p50: assessed ? r1(quant(vals, 0.5)) : null, p90: assessed ? r1(quant(vals, 0.9)) : null, control: r1(R.control[di]) };
    });
  }

  function episodes(days, minChance = 10) {
    const eps = []; let cur = null;
    (days || []).forEach(d => {
      if (d.chance != null && d.chance >= minChance) {
        if (!cur) cur = { from: d.date, to: d.date, fromText: d.dayText, toText: d.dayText, peakChance: d.chance, peakDay: d.date, days: 1, windows: [], typicalHours: [], p50: [], p90: [], firstDayIndex: d.dayIndex };
        else { cur.to = d.date; cur.toText = d.dayText; cur.days++; }
        if (d.chance > cur.peakChance) { cur.peakChance = d.chance; cur.peakDay = d.date; }
        if (d.window) cur.windows.push(d.window); if (d.typicalHours) cur.typicalHours.push(d.typicalHours);
        if (d.p50 != null) cur.p50.push(d.p50); if (d.p90 != null) cur.p90.push(d.p90);
        if (d.interpolated) cur.interpolated = true;
      } else if (cur) { eps.push(cur); cur = null; }
    });
    if (cur) eps.push(cur);
    return eps.map(e => ({ ...e, window: e.windows.length ? mode(e.windows) : null, typicalHours: e.typicalHours.length ? Math.round(median(e.typicalHours)) : null }));
  }
  const mode = (a) => { const c = {}; a.forEach(x => c[x] = (c[x] || 0) + 1); return Object.keys(c).sort((x, y) => c[y] - c[x])[0]; };

  function consequence(L, A) {
    if (L.consequence) return { text: String(L.consequence), source: 'client limit register' };
    const n = [];
    if (A.criticality) n.push('criticality ' + A.criticality);
    if (A.maximum_tolerable_downtime_hr != null && isFinite(A.maximum_tolerable_downtime_hr)) n.push('tolerable downtime ' + A.maximum_tolerable_downtime_hr + ' h');
    if (A.backup_power === true || A.backup_power === 'yes' || A.backup_power === 'Yes') n.push('backup power' + (A.backup_duration_hr != null ? ' ' + A.backup_duration_hr + ' h' : ''));
    else if (A.backup_power === false || A.backup_power === 'no' || A.backup_power === 'No') n.push('no backup power');
    if (LIMIT_VARS[L.variable] && LIMIT_VARS[L.variable].hazard === 'flood' && A.flood_protection != null) n.push('flood protection ' + A.flood_protection + ' m');
    return n.length ? { text: n.join(' · '), source: 'client asset record' }
      : { text: 'not recorded: add criticality, tolerable downtime and backup to the asset so this column says what the crossing stops', source: null };
  }

  /* ── one asset ──────────────────────────────────────────────────────────────────────── */
  /* v91.17.70 · the physical check's references, from data (see engineering_refs.py); never a constant in this file */
  let ENGREF = undefined;
  const engRefs = () => { if (ENGREF !== undefined) return ENGREF; try { ENGREF = JSON.parse(readFileSync(join(app.dataDir, 'engineering-references.json'), 'utf8')); } catch (_) { ENGREF = null; } return ENGREF; };
  function physicalRefs({ lat, lon, elev, limitsIn, wb, tx, tn }) {
    const REF = engRefs(), R = (REF && REF.references) || {};
    const lapse = R.standard_lapse_rate_C_per_m ? R.standard_lapse_rate_C_per_m.value : null;
    let U = null; try { U = unitAtPoint(app, lat, lon); } catch (_) {}
    let clim = null; try { if (U && app.climatology && app.climatology.ready && app.climatology.ready()) clim = app.climatology.thresholds(U.unit.unitId, pktDate(Date.now()), { raw: true }); } catch (_) {}
    const dz = (U && elev != null && U.unit.elevM != null && lapse != null) ? (elev - U.unit.elevM) * lapse : 0;
    const own = (variable, dir) => { const L = limitsIn.filter(l => (LIMIT_ALIASES[String(l.variable || '').toLowerCase()] || l.variable) === variable && (l.dir || 'above') === dir && isFinite(Number(l.limit)));
      if (!L.length) return null; const v = L.map(l => Number(l.limit)); return dir === 'above' ? Math.min(...v) : Math.max(...v); };
    const fmtRef = (x) => Math.round(x * 10) / 10;
    function measure(variable, dir, value, extra) {
      const base = { value: r1(value), unit: '°C', ...extra };
      if (value == null) return { ...base, class: null, why: 'the served forecast does not hold this variable' };
      const lim = own(variable, dir);
      if (lim != null) { const hit = dir === 'above' ? value >= lim : value <= lim;
        return { ...base, class: hit ? 'Act' : 'Low', against: 'client limit', cuts: 'your registered limit ' + (dir === 'above' ? '≥ ' : '≤ ') + lim + ' °C', basis: 'the limit registered for this asset (operating trigger); Act when the forecast reaches it' }; }
      const spec = R[variable]; if (!spec || !Array.isArray(spec.levels)) return { ...base, class: 'Low', against: 'none', cuts: 'no limit registered', basis: 'register a limit for this variable to get an operating trigger' };
      let cls = 'Low'; const parts = [];
      for (const lv of spec.levels) {
        const raw = lv.atOrAbove != null ? lv.atOrAbove : lv.atOrBelow; const up = lv.atOrAbove != null;
        let thr = typeof raw === 'number' ? raw : (clim && clim[raw] != null ? clim[raw] + dz : null);
        if (thr == null) continue; thr = fmtRef(thr);
        parts.push(lv.level + ' ' + (up ? '≥ ' : '≤ ') + thr + ' °C (' + lv.rule + ')');
        if (up ? value >= thr : value <= thr) { if (lv.level === 'Watch' || cls === 'Low') cls = lv.level; }
      }
      return { ...base, class: cls, against: 'reference', cuts: parts.length ? parts.join(' · ') : 'no reference at this place', basis: spec.source + (U ? ' · tehsil ' + U.unit.unitId.split('|').pop() + ' (' + U.by + ')' : '') + ' · no client limit registered: Act needs one' };
    }
    return {
      heat: measure('wet_bulb_temperature_2m', 'above', wb, { measure: 'hourly wet-bulb maximum' }),
      dryHeat: measure('temperature_2m_max', 'above', tx, { measure: 'daily maximum (served forecast)' }),   /* v283.24 H13: the served day maximum */
      cold: measure('temperature_2m_min', 'below', tn, { measure: 'daily minimum' }),
      references: REF ? { ...(INTERNAL ? { file: 'data/engineering-references.json' } : {}), built: REF.built, levels: REF.levels } : { why: 'the engineering references are not in this install' } };   /* v283.37: no file name in a client answer */
  }
  async function evaluateAsset(A, nowMs) {
    const lat = Number(A.lat != null ? A.lat : A.latitude), lon = Number(A.lon != null ? A.lon : A.longitude);
    const elevIn = (A.elev != null && A.elev !== '' && isFinite(Number(A.elev))) ? Number(A.elev) : null;
    const base = { id: String(A.id || A.asset_id || A.name || ''), name: A.name || A.asset_name || A.id, lat, lon };
    if (!isFinite(lat) || !isFinite(lon) || lat < 23 || lat > 38 || lon < 60 || lon > 78) return { ...base, ok: false, why: 'no coordinate inside Pakistan', limits: [] };
    const limitsIn = Array.isArray(A.limits) ? A.limits : [];
    const needAtm = limitsIn.some(L => { const v = LIMIT_ALIASES[String(L.variable || '').toLowerCase()] || L.variable; return LIMIT_VARS[v] && !['river', 'refused'].includes(LIMIT_VARS[v].kind); });
    const needRiver = process.env.NIGRAAN_INTERNAL_REF === '1' && limitsIn.some(L => (LIMIT_ALIASES[String(L.variable || '').toLowerCase()] || L.variable) === 'river_discharge');
    let run = null, E = null, R = null, runErr = null, ensErr = null, rivErr = null;
    if (needAtm) {
      try { run = await servedRun(lat, lon, elevIn, nowMs); } catch (e) { runErr = e.message; }
      try { const S = run && run.series; if (S && S.temperature_2m && S.relative_humidity_2m && !S.heat_index) S.heat_index = S.temperature_2m.map((t, i) => hiOf(t, S.relative_humidity_2m[i])); } catch (_) {}
      try { const S = run && run.series; if (S && S.temperature_2m && S.relative_humidity_2m && !S.utci_shade) S.utci_shade = S.temperature_2m.map((t, i) => utciOf(t, S.relative_humidity_2m[i], S.wind_speed_10m ? S.wind_speed_10m[i] : null)); } catch (_) {}
      try { E = await ensemble(lat, lon, elevIn); } catch (e) { ensErr = e.message; }
    }
    const reachId = (limitsIn.find(L => (LIMIT_ALIASES[String(L.variable || '').toLowerCase()] || L.variable) === 'river_discharge' && L.reach) || {}).reach || A.reach || null;
    if (needRiver) { try { R = await river(lat, lon, reachId); } catch (e) { rivErr = e.message; } }
    const elev = elevIn != null ? elevIn : (run && run.site && run.site.elevation != null ? run.site.elevation : (E && E.elevation));
    const shift = E ? basisShift(run, E) : null;
    const limits = limitsIn.map((Lraw, k) => {
      const v0 = String(Lraw.variable || '').trim(), variable = LIMIT_ALIASES[v0.toLowerCase()] || v0;
      const spec = LIMIT_VARS[variable];
      const lim = Number(Lraw.limit), dir = (Lraw.dir === 'below' ? 'below' : 'above');
      const L = { variable, limit: lim, dir, durationMin: (Lraw.durationMin != null && isFinite(Number(Lraw.durationMin)) && Number(Lraw.durationMin) > 0) ? Number(Lraw.durationMin) : null,
        authority: Lraw.authority || null, reference: Lraw.reference || null, actionMin: (Lraw.actionMin != null && isFinite(Number(Lraw.actionMin))) ? Number(Lraw.actionMin) : null,
        action: Lraw.action || null, owner: Lraw.owner || null, consequence: Lraw.consequence || null };
      const head = { index: k, variable, label: spec ? spec.label : variable, unit: spec ? spec.unit : null, hazard: spec ? spec.hazard : null,
        limit: lim, dir, durationMin: L.durationMin, requiredHours: Math.max(1, Math.ceil((L.durationMin || 60) / 60)), authority: L.authority, reference: L.reference,
        actionMin: L.actionMin, action: L.action, owner: L.owner, consequence: consequence(L, A) };
      if (!spec) return { ...head, state: 'not-evaluated', why: '"' + v0 + '" is not a variable this build forecasts (' + Object.keys(LIMIT_VARS).join(', ') + ')' };
      if (!isFinite(lim)) return { ...head, state: 'not-evaluated', why: 'the limit is not a number' };
      if (spec.kind === 'refused') return { ...head, state: 'not-evaluated', confidence: confidenceFor(variable, elev),
        why: 'NIGRAAN does not forecast water depth at a site: that needs a flood model with the site\'s ground level and defences, which this build does not run. Register the limit as the river discharge at which the protection is overtopped (variable river_discharge, in m³/s at the reach) and it is evaluated to 15 days' + (A.flood_protection != null ? '; the recorded protection is ' + A.flood_protection + ' m' : '') + '.' };
      if (spec.hazard === 'wind' && elev != null && elev >= 1500) return { ...head, state: 'not-evaluated', confidence: confidenceFor(variable, elev),
        why: 'wind limits are not evaluated above 1,500 m (this asset: ' + Math.round(elev) + ' m): mountain gust alerts were 19 in 20 false. Use a site anemometer.' };
      const conf = confidenceFor(variable, elev);
      if (spec.kind === 'river' && process.env.NIGRAAN_INTERNAL_REF !== '1')   /* v283.31 · data lane: no model river flow is shown or compared */
        return { ...head, state: 'not-evaluated', confidence: conf, why: 'a river-flow limit is not evaluated: the global river model\u2019s flows read 1.2 to 7.7 times the measured flow at the gauged stations, so a limit in m\u00b3/s compared with them would mislead. The river status of the reach (from the nearest measured gauge) is shown in the place record.' };
      if (spec.kind === 'river') {
        if (!R) return { ...head, state: 'not-evaluated', confidence: conf, why: /no river reach/.test(rivErr || '') ? rivErr : 'the river forecast did not answer: ' + (rivErr || 'no data') };
        const days = riverDays(R, L), eps = episodes(days);
        const today = days[0], near = today && today.control == null ? { state: 'not-evaluated', why: 'the control run returned no discharge for today at the river cell' } : today ? { state: overFn(dir, lim)(today.control) ? 'over-now' : 'clear', peak: today.control, margin: marginOf(dir, lim, today.control),
          why: 'model control run today ' + today.control + ' m³/s at the river cell ' + R.cellLat + ', ' + R.cellLon } : { state: 'not-evaluated', why: 'no river day returned' };
        return { ...head, confidence: conf, source: { river: 'GloFAS (Copernicus) via the provider, ' + (R.members ? R.members.length : '–') + '-member ensemble; days are Pakistan dates', cell: { lat: R.cellLat, lon: R.cellLon }, retrievedAt: R.retrievedAt,
          binding: R.binding, caution: 'bound to ' + (R.binding ? R.binding.method : 'the model cell') + '; median flow today ' + (today ? today.p50 : '–') + ' m³/s' },
          near, days, episodes: eps, state: near.state === 'over-now' ? 'over-now' : eps.length ? 'possible' : (near.state === 'not-evaluated' || !(R.members && R.members.length)) ? 'not-evaluated' : 'clear',   /* v91.17.68 · no members or no river day is not-evaluated, never clear (audit C2) */
          stateWhy: (near.state !== 'over-now' && !eps.length && (near.state === 'not-evaluated' || !(R.members && R.members.length))) ? (near.why || 'the river ensemble returned no members') : null };
      }
      const near = run ? nearTerm(run, L, spec, nowMs) : { state: 'not-evaluated', why: 'the served forecast did not answer: ' + (runErr || 'no data') };
      if (near.leadMin != null && L.actionMin != null && near.state === 'crosses') { near.timeLeftToActMin = near.leadMin - L.actionMin; near.prepareByMs = Math.max(nowMs, (near.startMs || nowMs) - L.actionMin * 60000); near.windowClosed = near.timeLeftToActMin < 0; }
      let days = null, eps = [];
      if (E) { days = daysAhead(E, L, spec, shift ? shift.tempC || 0 : 0, nowMs) || null; eps = episodes(days); }
      /* the chance the ensemble gives on the day of a near-term crossing is its confidence */
      if (days && near.startMs) { const dd = days.find(d => d.date === pktDate(near.startMs)); near.ensembleChance = dd ? dd.chance : null; }
      /* v91.17.283 · WS2 C1 · a day the ensemble could not assess is not a clear day: with the named run not evaluated either, a
         limit whose every ensemble day is not assessed is not evaluated; otherwise the unassessed days are counted beside the state */
      const daysNA = days ? days.filter(x => x.chance == null).length : 0, allNA = !!days && days.length > 0 && daysNA === days.length;
      const state = near.state === 'over-now' || near.state === 'crosses' ? near.state : (eps.length ? 'possible' : (near.state === 'not-evaluated' && (!days || allNA) ? 'not-evaluated' : 'clear'));
      return { ...head, confidence: conf, near, days, episodes: eps, state, ...(daysNA ? { daysNotAssessed: daysNA } : {}), ...(state === 'not-evaluated' && allNA ? { why: near.why + '; the ensemble assessed no day: ' + days[0].why } : {}),
        ensembleWhy: E ? null : ('the ensemble did not answer: ' + (ensErr || 'no data')) };
    });
    /* ══ v91.17.30 · P5-1 · A PHYSICAL CHECK AT EVERY ASSET, ON STATED CUTS ════════════════════
       The hazard class on the other surfaces comes from the screening index. Here each asset also gets
       the class its governing PHYSICAL quantity gives, from the same named run: heat on the hourly wet
       bulb (26 / 28 / 31 °C), dry heat on the station-corrected daily maximum (40 / 43 / 45 °C), cold on
       the daily minimum (3 / 0.5 / -2 °C), and river flow on the ensemble chance of passing the bound
       reach's own model return levels. The cuts are printed; they are screening cuts, not the client's
       limits, and they are scored by the crossing ledger before they replace the index class. */
    let physical = null;
    try {
      if (!run) { try { run = await servedRun(lat, lon, elevIn, nowMs); } catch (_) {} }
      if (run && run.ok) {
        /* v91.17.70 · level set Low / Monitor / Watch / Act: "Clear" is retired on every hazard surface */
        const S = run.series;
        const wb = peakOf('above', S.wet_bulb_temperature_2m || []);
        const ms = S.time.map(tUTC), by = new Map(); ms.forEach((m, i) => { const d = pktDate(m); if (!by.has(d)) by.set(d, []); by.get(d).push(i); });
        let tx = null, tn = null;
        for (const [d, ii] of by) { const v = ii.map(i => S.temperature_2m[i]).filter(x => x != null); if (v.length < Math.ceil(24 * COMPLETE_SHARE)) continue;   /* v91.17.283 · WS2 F2 · a complete day, as nearTerm */
          const mx = Math.max(...v), mn = Math.min(...v);
          if (tx == null || mx > tx) tx = mx; if (tn == null || mn < tn) tn = mn; }
        /* v91.17.70 · NO WRITTEN-IN CUTS. The v30 cuts (wet bulb 26/28/31, daily max 40/43/45, daily min 3/0.5/-2 °C, and a
           "Clear" class) had no source (E-W2). Each measure is now classed against, in order: (1) the limit the client
           registered for that variable at this asset: Act when the forecast reaches it (the operating trigger); (2) the
           references in data/engineering-references.json (engineering_refs.py): a published wet-bulb limit (Vecellio et
           al. 2022), the place's own ERA5 1991-2020 percentiles for the tehsil the asset lies IN (point in polygon), moved
           to the asset height at the ICAO lapse, and the freezing point. A reference raises Monitor or Watch; below
           every reference the level is Low. */
        physical = { run: run.run, horizon: 'next 72 h', ...physicalRefs({ lat, lon, elev: elevIn != null ? elevIn : (run.site && run.site.elevation), limitsIn, wb, tx, tn }) };
        const elevP = elev != null ? elev : (run.site && run.site.elevation != null ? run.site.elevation : null);
        physical.elevation = elevP == null ? null : Math.round(elevP);
        if (elevP != null && elevP >= 1500) physical.wind = { class: null, why: 'wind is not scored above 1,500 m' };
      }
      const P2 = (app.flood && app.flood.snapped && app.flood.snapped()) || null;
      if (P2 && P2.points) {
        const kmTo = (a, b, c, d) => { const R = 6371, rr = Math.PI / 180, x = Math.sin((c - a) * rr / 2) ** 2 + Math.cos(a * rr) * Math.cos(c * rr) * Math.sin((d - b) * rr / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
        const near = Object.values(P2.points).map(p => ({ p, d: kmTo(lat, lon, p.lat, p.lon) })).filter(x => x.d <= 20).sort((a, b) => a.d - b.d)[0];
        /* ══ v91.17.70 · THE RIVER CLASS IS RARITY IN THE MODEL'S OWN RECORD (data/river-rarity.json) ══════════
           Each day's ensemble median is placed on the reach's own ladder (Monitor >= the half-month 95th percentile of
           the model's daily flow, Watch >= its 2-year flow, Act >= its 5-year flow); the class is the highest over
           days 0-14. The official barrage limits are not read, and no model discharge is printed to the customer. */
        const RR = near && app.flood.reachRarity ? app.flood.reachRarity(near.p.id) : null;
        if (near && !(RR && RR.levels)) { physical = physical || {}; physical.river = { class: null, state: 'missing', code: -1, word: STATE_WORD['-1'], why: near.p.name + ' is ' + r1(near.d) + ' km away but carries no flow record yet', reach: near.p.name + ' (' + near.p.river + ')', distanceKm: r1(near.d) }; }
        if (near && RR && RR.levels) {
          const R2 = await river(lat, lon, near.p.id);
          const ORD = { Low: 0, Monitor: 1, Watch: 2, Act: 3 };
          let p2 = 0, p5 = 0, best = null;
          R2.dates.forEach((d, di) => { const vals = R2.members.map(m => m ? m[di] : null).filter(v => v != null && isFinite(v)); if (!vals.length || vals.length < minValidMembers(R2.members.length)) return;   /* v91.17.283 · WS2 C1 · same coverage rule */
            p2 = Math.max(p2, vals.filter(v => v >= RR.levels.rp2).length / vals.length); p5 = Math.max(p5, vals.filter(v => v >= RR.levels.rp5).length / vals.length);
            const rc = app.flood.rarityClass(RR, quant(vals, 0.5), d);
            if (rc && (!best || ORD[rc.class] > ORD[best.class])) best = { ...rc, date: d }; });
          physical = physical || {};
          physical.river = { reach: near.p.name + ' (' + near.p.river + ')', distanceKm: r1(near.d), chanceAbove2yr: Math.round(100 * p2), chanceAbove5yr: Math.round(100 * p5),
            class: best ? best.class : null, word: best ? best.word : null, peakDay: best ? best.date : null,
            /* v91.17.283.37 · the class uses only the TESTED rung of the model-flow ladder (the 5-year flow: most often a Medium flood in the 2024-25
               bulletins, 79 % of days at or above the official Low limit); the 20-year rungs are untested and give no step above it */
            tested: true, testBasis: 'the 5-year model flow was most often a Medium flood in the 2024-25 flood bulletins (79 % of days at or above the official Low limit)',
            cuts: 'class of the ensemble-median flow on the tested model-flow ladder: Watch at or above the model\'s 5-year flow at this reach, otherwise Low; no higher step (untested); Act needs an observed signal', members: R2.members ? R2.members.length : null,
            basis: 'highest daily class over days 0-14 of ' + (R2.members ? R2.members.length : '–') + ' GloFAS (Copernicus CEMS) members, each day\'s median read against the same model\'s 1997-onward record at this reach, so a model that runs high or low at this reach is compared only with itself.' };
        }
      }
      /* v91.17.30 · P4-4 / P6-6 · heavy rain over the asset's own catchment, against its own record (v283.27: its 2-year day of the
         satellite record, data/rain-return-levels.json; a catchment outside the satellite clip is not assessed, with the reason) */
      if (app.catchment) { try { const HR = await app.catchment.heavyRain(lat, lon);
        /* v91.17.70 · heavy-rain LEVELS (Low / Monitor / Watch), never Act from rain alone (catchment.mjs) */
        if (HR && !HR.ok && HR.notAssessed) { physical = physical || {}; physical.catchmentRain = { class: null, notAssessed: true, state: 'missing', code: -1, word: STATE_WORD['-1'], why: plainWhy(HR.why), catchmentKm2: HR.catchment ? HR.catchment.areaKm2 : null }; }
        /* v91.17.283.37 · launch item A4: the member-share cuts are untested, so no class (Low / Monitor / Watch) and no "no heavy rain" word: the facts
           and state -5 "Not tested" (states.mjs) */
        if (HR && HR.ok) { physical = physical || {}; physical.catchmentRain = { class: null, state: 'not_tested', code: -5, word: STATE_WORD['-5'], testStatus: HR.testStatus || 'not tested',
          level: 'heavy rain', chance: HR.peakChance, memberSharePct: HR.peakChance, peakDay: HR.peakDay, levelMm: HR.record.levelsMm ? HR.record.levelsMm[2] : null, against: HR.record.against || null, years: HR.record.years ?? null,
          screening: HR.screening === true, productType: HR.productType || null, catchmentKm2: HR.catchment.areaKm2, basis: HR.basis, caution: HR.record.caution, actRule: HR.actRule || null }; } } catch (_) {} }
      /* v91.17.31 · P6-10 · named glacial lakes upstream. v91.17.70 · with no lake upstream the class is the module's own Low, never null.
         v91.17.70 · the catchment heavy-rain class is no longer passed as a GLOF trigger: rain alone does not raise any
         class to Act (Sprint 1; Act needs an observed signal, which the lake module decides) */
      if (app.glof) { try { const GL = app.glof.upstream(lat, lon, { limit: 8 });
        if (GL && GL.ok && !GL.basin) { physical = physical || {}; physical.glof = { class: null, applicable: false, why: GL.why, counts: { priority: 0, watch: 0, expanding: 0, withSensor: 0 }, lakes: [] }; }
        else if (GL && GL.ok) { physical = physical || {}; physical.glof = { applicable: true, class: GL.class, basis: GL.basis || GL.why, counts: GL.counts || { priority: 0, watch: 0, expanding: 0, withSensor: 0 }, routeKm: GL.routeKm,
          bulletin: GL.bulletin ? GL.bulletin.published : null, bulletinAgeDays: GL.bulletin ? GL.bulletin.ageDays : null, feedStale: GL.feed ? GL.feed.stale : null,
          lakes: (GL.lakes || []).map(l => ({ id: l.id, name: l.name, tier: l.tierLabel, kmAlong: l.kmAlong, areaKm2: l.areaKm2, dam: l.dam, sensor: (l.listed || l.suparco) ? !!(l.listed || l.suparco).sensor : false,
            ...(INTERNAL ? { suparco: (l.suparco || l.listed) ? (l.suparco || l.listed).status : null } : { listed: (l.listed || l.suparco) ? ((l.listed || l.suparco).status || null) : null }),   /* v91.17.71 · glof.mjs serves the generic key "listed" */   /* v91.17.71 · the list is data (kept, generic key); its supplier's name is internal */
            condition: l.condition ? l.condition.state : null, conditionText: l.condition ? (l.condition.stale || l.condition.text) : null })) }; } } catch (_) {} }
    } catch (e) { physical = physical || { error: e.message }; }
    return { ...base, ok: true, physical, elevation: elev != null ? Math.round(elev) : (physical && physical.elevation != null ? physical.elevation : null), type: A.type || A.asset_type || null,
      run: run && run.ok ? { model: run.model, modelLabel: run.modelLabel, run: run.run, inputHash: run.inputHash, gridCell: run.gridCell } : { error: runErr || (run && run.why) || null },
      ensemble: E ? { model: 'ecmwf_ifs025', label: 'ECMWF ensemble, 51 members, 0.25°', members: E.members, retrievedAt: E.retrievedAt, shift,
        note: 'ECMWF ensemble output is 3-hourly to day 6 and 6-hourly after; hour windows after day 6 are interpolated and approximate.' } : { error: ensErr },
      limits };
  }

  /* ── crossing rows · one per crossing, ordered by time, nothing ranked ───────────────── */
  function rowsFor(assets, nowMs) {
    const rows = [], clear = [], notEvaluated = [];
    assets.forEach(a => (a.limits || []).forEach(L => {
      const common = { assetId: a.id, asset: a.name, variable: L.variable, label: L.label, unit: L.unit, limit: L.limit, dir: L.dir, requiredHours: L.requiredHours,
        authority: L.authority, reference: L.reference, hazard: L.hazard, confidence: L.confidence ? L.confidence.label + ' — ' + L.confidence.text : null,
        consequence: L.consequence ? L.consequence.text : null, consequenceSource: L.consequence ? L.consequence.source : null,
        owner: L.owner || null, action: L.action || null, actionMin: L.actionMin, ownerSource: L.owner ? 'client limit register' : null };
      if (L.state === 'not-evaluated') { notEvaluated.push({ ...common, why: L.why }); return; }
      const N = L.near || {};
      let nearDay = null;
      if (N.state === 'over-now' || N.state === 'crosses') {
        nearDay = N.day || (N.startMs ? pktDate(N.startMs) : null);
        rows.push({ ...common, horizon: L.variable === 'river_discharge' ? 'today' : '0–72 h', source: L.variable === 'river_discharge' ? 'GloFAS control run' : 'served forecast',
          state: N.state, startMs: N.startMs || nowMs, when: N.state === 'over-now' ? 'now' : N.startText, until: N.endText || null, hours: N.hours,
          value: N.peak, margin: N.margin, leadMin: N.leadMin, chance: N.ensembleChance != null ? N.ensembleChance : null,
          timeLeftToActMin: N.timeLeftToActMin != null ? N.timeLeftToActMin : null, windowClosed: !!N.windowClosed,
          prepareBy: N.prepareByMs ? new Date(N.prepareByMs).toISOString() : null,
          prepareByText: N.state === 'over-now' ? 'now — the limit is already held' : (N.windowClosed ? 'now — the response time is longer than the time left' : (N.prepareByMs ? fmtPKT(N.prepareByMs) : null)) });
      }
      /* 0-72 h belongs to the named run when it crosses: the ensemble's chance on that day is
         printed as its confidence, and ensemble rows start at day 3 so one crossing is not listed
         twice. When the named run stays clear, a 0-72 h ensemble episode is kept: the run is one
         member-like answer and a third of members crossing is worth a row. */
      const eps = nearDay && L.days ? episodes(L.days.filter(d => d.dayIndex >= 3)) : (L.episodes || []);
      eps.forEach(e => {
        const startMs = Date.parse(e.from + 'T00:00:00+05:00');
        const prep = L.actionMin != null ? Math.max(nowMs, startMs - L.actionMin * 60000) : null;
        rows.push({ ...common, horizon: 'days ' + (e.firstDayIndex) + (e.days > 1 ? '–' + (e.firstDayIndex + e.days - 1) : ''), source: L.variable === 'river_discharge' ? ('GloFAS ' + ((L.days && L.days[0] && L.days[0].of) || '–') + '-member ensemble') : 'ECMWF 51-member ensemble',
          state: 'possible', startMs, when: e.fromText + (e.days > 1 ? ' – ' + e.toText : ''), window: e.window, hours: e.typicalHours,
          value: e.p50.length ? peakOf(L.dir, e.p50) : null, valueHigh: e.p90.length ? peakOf(L.dir, e.p90) : null,
          margin: e.p50.length ? marginOf(L.dir, L.limit, peakOf(L.dir, e.p50)) : null, chance: e.peakChance, chanceDay: e.peakDay, interpolated: !!e.interpolated,
          prepareBy: prep ? new Date(prep).toISOString() : null, prepareByText: prep ? fmtPKT(prep) : null });
      });
      if (L.state === 'clear') clear.push({ ...common, why: (N.why || '') + (L.days ? ' · ensemble: no day with 10 % or more of members to day 15' : '') ,
        peak: N.peak, margin: N.margin });
    }));
    rows.sort((x, y) => (x.startMs - y.startMs) || String(x.asset).localeCompare(String(y.asset)) || String(x.variable).localeCompare(String(y.variable)));
    return { rows, clear, notEvaluated };
  }


  /* ══ v91.17.27 · P2-6 · THE CROSSING LEDGER: EVERY FORECAST CROSSING IS SCORED AFTERWARDS ══════
     Each evaluation files, per limit and per issue day, what was forecast for each local day: the
     named run's yes/no for days 0-2 and the ensemble chance for days 0-14. Two days after a day
     has passed it is checked against a reference series at the same point: ECMWF IFS analysis from
     the archive (river: GloFAS). The reference is NOT an observation and shares a model family
     with the forecast, so these scores measure consistency with the analysis, not ground truth;
     that is printed with every figure. A site sensor, when a client supplies one, replaces it.
     Scores: hits, misses, false alarms and correct rejections for the named run; Brier score and
     the same table at 50 % for the ensemble. Harness traffic is filed with its origin and left out
     of the client figures. */
  const LEDGER = 'crossingLedger', LEDGER_MAX = 6000;
  /* v91.17.234 · ledgerRows(true) for the callers that change rows in place (record, verify), so the store writes the ledger again */
  function ledgerRows(write) { try { return (write && app.store.allForWrite) ? app.store.allForWrite(LEDGER) : app.store.all(LEDGER); } catch (_) { return []; } }
  function record(assets, nowMs, origin) {
    const L = ledgerRows(true); if (!Array.isArray(L)) return;
    const issueDay = pktDate(nowMs);   /* v91.17.34 · AUDIT B18 · the same Pakistan day the rows carry */
    assets.forEach(a => (a.limits || []).forEach(x => {
      if (x.state === 'not-evaluated' || !x.days) return;
      const key = [a.id, x.variable, x.limit, x.dir, x.requiredHours].join('|');
      const nearDays = new Set();
      const N = x.near || {};
      if ((N.state === 'over-now' || N.state === 'crosses') && N.startMs) {
        const end = N.endMs || N.startMs; for (let t = N.startMs; t <= end; t += 3600e3) nearDays.add(pktDate(t));
        if (N.day) nearDays.add(N.day);
      }
      const near72 = new Set([0, 1, 2].map(k => pktDate(nowMs + k * DAY_MS)));
      const rec = { key, origin, issueDay, issuedAt: new Date(nowMs).toISOString(), assetId: a.id, asset: a.name, lat: (x.source && x.source.binding && x.source.binding.lat != null) ? x.source.binding.lat : a.lat, lon: (x.source && x.source.binding && x.source.binding.lon != null) ? x.source.binding.lon : a.lon, elev: a.elevation,
        variable: x.variable, limit: x.limit, dir: x.dir, requiredHours: x.requiredHours, run: a.run && a.run.run || null,
        days: x.days.map(d => ({ date: d.date, chance: d.chance, near: x.variable === 'river_discharge' ? null : (near72.has(d.date) && N.state !== 'not-evaluated' ? nearDays.has(d.date) : null), obs: null })) };
      const i = L.findIndex(r => r.key === key && r.issueDay === issueDay && r.origin === origin);
      if (i >= 0) L[i] = rec; else L.push(rec);
    }));
    if (L.length > LEDGER_MAX) L.splice(0, L.length - LEDGER_MAX);
    app.store.saveSoon();
  }

  async function truthSeries(lat, lon, elev, start, end, variable) {
    if (variable === 'river_discharge') {
      const j = await provider.call('flood', '/v1/flood', { latitude: lat, longitude: lon, daily: 'river_discharge', start_date: start, end_date: end });
      return { kind: 'daily', dates: (j.daily || {}).time || [], values: (j.daily || {}).river_discharge || [], source: 'GloFAS river discharge (model reanalysis / analysis), not a gauge' };
    }
    const j = await provider.call('archive', '/v1/archive', { latitude: lat, longitude: lon, elevation: elev == null ? undefined : elev, models: 'ecmwf_ifs',
      hourly: ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'precipitation', 'wind_gusts_10m', 'wind_speed_10m'], start_date: start, end_date: end, timezone: 'GMT' });
    const H = j.hourly || {};
    return { kind: 'hourly', time: H.time || [], H, lat, lon, elevation: j.elevation != null ? j.elevation : elev, source: 'ECMWF IFS analysis at the asset (archive), not an observation' };
  }
  function obsFor(T, rec, date) {
    const over = overFn(rec.dir, rec.limit), req = rec.requiredHours || 1;
    if (T.kind === 'daily') { const i = T.dates.indexOf(date); if (i < 0 || T.values[i] == null) return null; return { event: over(T.values[i]), value: r1(T.values[i]) }; }
    const ms = T.time.map(tUTC), H = T.H;
    let s;
    if (rec.variable === 'wet_bulb_temperature_2m') s = ms.map((_, i) => stullWetBulb(H.temperature_2m[i], H.relative_humidity_2m[i], T.elevation != null ? T.elevation : undefined));
    else if (rec.variable === 'heat_index') s = ms.map((_, i) => hiOf(H.temperature_2m[i], H.relative_humidity_2m[i]));
    else if (rec.variable === 'utci_shade') s = ms.map((_, i) => utciOf(H.temperature_2m[i], H.relative_humidity_2m[i], H.wind_speed_10m ? H.wind_speed_10m[i] : null));
    else if (rec.variable === 'temperature_2m_max' || rec.variable === 'temperature_2m_min') s = H.temperature_2m;
    else if (rec.variable === 'precipitation_24h') s = roll24(H.precipitation || []);
    else s = H[rec.variable];
    if (!s) return null;
    const idx = ms.map((m, i) => pktDate(m) === date ? i : -1).filter(i => i >= 0);
    const seg = idx.map(i => s[i]).filter(v => v != null);
    if (seg.length < 18) return null;
    if (rec.variable === 'temperature_2m_max' || rec.variable === 'temperature_2m_min') {
      /* v91.17.283.28 · S4 · the day's maximum needs every daytime hour, its minimum every night hour (dayext.mjs) */
      if (isFinite(T.lat) && isFinite(T.lon)) { const need = dayNight(T.lat, T.lon, date)[rec.variable === 'temperature_2m_max' ? 'day' : 'night']; const held = new Set(idx.filter((i) => s[i] != null).map((i) => pktHour(ms[i]))); if (need.some((hh) => !held.has(hh))) return null; }
      const v = rec.variable === 'temperature_2m_max' ? Math.max(...seg) : Math.min(...seg); return { event: over(v), value: r1(v) };
    }
    let run = 0, best = 0; idx.forEach(i => { if (over(s[i])) { run++; best = Math.max(best, run); } else run = 0; });
    return { event: best >= req, value: r1(peakOf(rec.dir, seg)), hours: best };
  }
  async function verifyEntries(entries, nowMs) {
    const cutoff = pktDate(nowMs - 2 * DAY_MS);
    const groups = new Map();
    entries.forEach(rec => (rec.days || []).forEach(d => {
      if (d.obs || d.date > cutoff) return;
      const g = rec.lat.toFixed(3) + ',' + rec.lon.toFixed(3) + '|' + (rec.variable === 'river_discharge' ? 'river' : 'atm');
      if (!groups.has(g)) groups.set(g, { lat: rec.lat, lon: rec.lon, elev: rec.elev, river: rec.variable === 'river_discharge', min: d.date, max: d.date, recs: new Set() });
      const G2 = groups.get(g); if (d.date < G2.min) G2.min = d.date; if (d.date > G2.max) G2.max = d.date; G2.recs.add(rec);
    }));
    let checked = 0; const errors = [];
    for (const G2 of groups.values()) {
      let T = null;
      const start = new Date(Date.parse(G2.min + 'T00:00:00Z') - DAY_MS).toISOString().slice(0, 10);
      try { T = await truthSeries(G2.lat, G2.lon, G2.elev, start, G2.max, G2.river ? 'river_discharge' : 'atm'); } catch (e) { errors.push(e.message); continue; }
      for (const rec of G2.recs) for (const d of rec.days) { if (d.obs || d.date > cutoff) continue; const o = obsFor(T, rec, d.date); if (o) { d.obs = { ...o, source: T.source, checkedAt: new Date(nowMs).toISOString() }; checked++; } }
    }
    return { checked, errors };
  }
  function score(entries) {
    const by = {};
    const cell = () => ({ hits: 0, misses: 0, falseAlarms: 0, correctRejections: 0 });
    entries.forEach(rec => (rec.days || []).forEach(d => {
      if (!d.obs) return;
      const v = by[rec.variable] || (by[rec.variable] = { run: cell(), ensemble50: cell(), brierSum: 0, brierN: 0, days: 0, events: 0 });
      v.days++; if (d.obs.event) v.events++;
      const add = (c, f, o) => { if (f && o) c.hits++; else if (!f && o) c.misses++; else if (f && !o) c.falseAlarms++; else c.correctRejections++; };
      if (d.near != null) add(v.run, d.near, d.obs.event);
      if (d.chance != null) { add(v.ensemble50, d.chance >= 50, d.obs.event); v.brierSum += Math.pow(d.chance / 100 - (d.obs.event ? 1 : 0), 2); v.brierN++; }
    }));
    Object.values(by).forEach(v => {
      const c = v.run, e = v.ensemble50;
      v.run.pod = (c.hits + c.misses) ? r1(100 * c.hits / (c.hits + c.misses)) : null;
      v.run.far = (c.hits + c.falseAlarms) ? r1(100 * c.falseAlarms / (c.hits + c.falseAlarms)) : null;
      e.pod = (e.hits + e.misses) ? r1(100 * e.hits / (e.hits + e.misses)) : null;
      e.far = (e.hits + e.falseAlarms) ? r1(100 * e.falseAlarms / (e.hits + e.falseAlarms)) : null;
      v.brier = v.brierN ? Math.round(1000 * v.brierSum / v.brierN) / 1000 : null; delete v.brierSum;
    });
    return by;
  }
  let lastVerify = 0, verifying = null;
  async function ledgerVerify(opts = {}) {
    const nowMs = Date.now();
    if (Array.isArray(opts.entries)) {
      /* dry run on supplied entries: verified and scored, never filed */
      const E = JSON.parse(JSON.stringify(opts.entries)).map(e => ({ ...e, days: (e.days || []).map(d => ({ ...d, obs: null })) }));
      const r = await verifyEntries(E, nowMs);
      return { ok: true, dryRun: true, ...r, entries: E, scores: score(E) };
    }
    if (verifying) return verifying;
    verifying = (async () => { const r = await verifyEntries(ledgerRows(true), nowMs); lastVerify = nowMs; ledgerRows(true); app.store.saveSoon(); return r; })()
      .finally(() => { verifying = null; });
    return verifying;
  }
  function ledgerSummary(q = {}) {
    const inc = q.origin || 'client';
    const E = ledgerRows().filter(r => inc === 'all' || r.origin === inc);
    if (Date.now() - lastVerify > 6 * 3600e3 && !verifying) ledgerVerify().catch(() => {});
    const verifiedDays = E.reduce((n, r) => n + r.days.filter(d => d.obs).length, 0);
    return { ok: true, origin: inc, entries: E.length, verifiedDays, lastVerifiedAt: lastVerify ? new Date(lastVerify).toISOString() : null,
      reference: 'ECMWF IFS analysis at the asset (river: GloFAS). Not an observation, and the same model family as the forecast: these scores measure agreement with the analysis. A site sensor replaces it when the client supplies one.',
      scores: score(E),
      recent: E.slice(-20).map(r => ({ asset: r.asset, variable: r.variable, limit: r.limit, dir: r.dir, issueDay: r.issueDay,
        verified: r.days.filter(d => d.obs).map(d => ({ date: d.date, chance: d.chance, near: d.near, event: d.obs.event, value: d.obs.value })) })) };
  }

  async function evaluate(body) {
    const nowMs = Date.now();
    const list = Array.isArray(body && body.assets) ? body.assets.slice(0, 25) : [];
    if (!list.length) return { ok: false, why: 'no assets: send { assets: [ { id, name, lat, lon, limits: [ { variable, limit, dir, durationMin, actionMin, authority, action, owner } ] } ] }' };
    const assets = [];
    for (const A of list) { try { assets.push(await evaluateAsset(A, nowMs)); } catch (e) { assets.push({ id: A.id, name: A.name, ok: false, why: e.message, limits: [] }); } }
    const R = rowsFor(assets, nowMs);
    try { record(assets, nowMs, (body && body.origin) || 'client'); } catch (e) { /* the ledger never blocks an evaluation */ }
    return { ok: true, issued: new Date(nowMs).toISOString(), horizons: { near: '0–72 h, the served forecast at the place (the value every section shows)', ahead: 'days 0–14, ECMWF 51-member ensemble (river: GloFAS, member count as returned, 50 at present)' },
      scope: 'exposure only: whether the forecast crosses a limit written for the asset. Not a downtime estimate and not a loss estimate. Rows are ordered by time; nothing is ranked across limits.',
      assets, ...R, vars: Object.keys(LIMIT_VARS) };
  }

  return { evaluate, LIMIT_VARS, LIMIT_ALIASES, stullWetBulb, confidenceFor, ledgerSummary, ledgerVerify, physicalRefs };   /* v91.17.70 · physicalRefs exposed for the engineering test */
}
