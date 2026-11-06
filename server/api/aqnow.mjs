/* == v91.17.283.52 set E · NIGRAAN 1.0.10.3 · AIR QUALITY MEASURED NOW NEAR A PLACE (owner approval 3 Nov 2026 23:58 PKT) =====================
   Two live ground sources, both read every 30 minutes by the server:
     - the Punjab provincial stations (epdaq.mjs, ~50 sites, hourly PM2.5, 14 days kept);
     - the four US Department of State monitors (dosaq.mjs: Islamabad, Lahore, Karachi, Peshawar, hourly PM2.5, 48 h kept).
   ONE RULE (the temperature "measured now" rule of shownplace.mjs / pointstate.mjs, set D): the nearest monitor within 25 km of the exact
   point and within the fleet's height rule (data/mach-siting.json screen.dz_m, 150 m; both heights from the same GLO-30 point-height model,
   pointheight.mjs), whose latest reading passed the QC below and is younger than 90 minutes. Where a Punjab station and an embassy monitor both
   qualify, the nearest valid one is used.
   QC of the latest reading (a failed reading is not used; the monitor is skipped):
     - missing: null / non-number / the -999 missing code;
     - zero or negative (an hourly PM2.5 of 0 is an instrument fault; 14 of 10,958 Punjab readings, 2 Nov 2026 data);
     - out of range: above 1,500 ug/m3 or PM2.5 more than 10 % above PM10 (epdaq.mjs plausibility, kept as it is); a PM2.5 reading the
       agency flagged (maintenance, calibration) is not used;
     - stuck: the same value repeated in STUCK_RUN consecutive hours or more, ending at the latest hour. The run length is the one the
       genuine data never reach (obsqc.mjs method: the 99.9th percentile of runs of unchanged values):
         Punjab stations (0.01 ug/m3 resolution): 14-day cache 20 Oct - 3 Nov 2026, 10,587 runs: 2 -> 59, 3 -> 1 (0.01 %): stuck at >= 3;
         embassy monitors (whole ug/m3): AirNow history Nov 2024 - Feb 2026 (data/../inputs/air_quality/airnow), 5,388 runs: 2 -> 181,
         3 -> 10 (0.19 %), 4 or more -> 0: stuck at >= 4.
   THE VALUE: the US EPA AQI (2024 PM2.5 breakpoints, 89 FR 16202; smog.mjs aqiOf, the function the forecast uses) of the NowCast PM2.5
   (EPA NowCast, smog.mjs nowcastPm: the 12 latest hourly values, at least 2 of the 3 latest present, QC-failed hours left out), and the latest
   hourly PM2.5. The point bundle that carries the line lives up to PS_TTL_MS (10 min), so point.mjs asks for a reading younger than
   90 - 10 = 80 minutes at the decision: no page shows a reading 90 minutes old or older. No NowCast (fewer than 2 of the 3 latest hours) -> no measured line.
   Customers never see the monitor, the agency, the distance or the age: the sentence is "Air quality measured now near <place>: AQI <n> ·
   <class> (PM2.5 <x> ug/m3, hourly)". The operator view carries the monitor detail separately (point.mjs B.airStation). */
import { createPointHeight } from './pointheight.mjs';
import { aqiOf, nowcastPm } from './smog.mjs';

export const AQNOW_VERSION = 'aqnow-1 (v91.17.283.52 E)';
export const AQ_NEAR_KM = 25;            /* the station rule of pointstate.mjs (set D) */
export const AQ_MAX_AGE_MIN = 90;        /* owner 3 Nov 23:58 PKT: younger than 90 minutes */
export const AQ_PM25_MAX = 1500;         /* epdaq.mjs plausibility (embassy history maximum 939 ug/m3, Nov 2024 - Feb 2026) */
export const STUCK_RUN = { epd: 3, dos: 4 };
const isN = (x) => typeof x === 'number' && Number.isFinite(x);
const km = (a, b, c, d) => { const R = Math.PI / 180, x = Math.sin(a * R) * Math.sin(c * R) + Math.cos(a * R) * Math.cos(c * R) * Math.cos((d - b) * R); return 6371 * Math.acos(Math.min(1, Math.max(-1, x))); };

/* one hourly reading -> why it fails QC (null = passes); o: { pm25, pm10, pm25bad, flags } */
export function readingFault(o) {
  if (!o) return 'missing';
  const v = o.pm25;
  if (v == null || typeof v !== 'number' || !Number.isFinite(v) || v <= -999) return 'missing';
  if (v <= 0) return 'zero or negative';
  if (v > AQ_PM25_MAX || o.pm25bad || (isN(o.pm10) && o.pm10 > 0 && v > o.pm10 * 1.1)) return 'out of range';
  /* the Punjab page flags per pollutant ({"pm10": "M"}, {"no2": "D"}: maintenance, calibration...); only a PM2.5 flag stops the PM2.5 reading */
  if (o.flags && typeof o.flags === 'object' && Object.keys(o.flags).some((k) => /^pm_?2[._]?5$/i.test(k) && o.flags[k])) return 'flagged by the operator of the monitor';
  return null;
}
/* the series of one monitor: [[isoTime, reading], ...] ascending; the latest reading's QC and the NowCast of the last 12 hours */
export function judgeSeries(series, src, nowMs = Date.now(), hourBegin = false, maxAgeMin = AQ_MAX_AGE_MIN) {
  if (!Array.isArray(series) || !series.length) return { ok: false, why: 'no reading' };
  const [t, last] = series[series.length - 1]; const tMs = Date.parse(t); if (!Number.isFinite(tMs)) return { ok: false, why: 'no reading time' };
  const endMs = tMs + (hourBegin ? 3600e3 : 0), ageMin = (nowMs - endMs) / 60e3;
  const f = readingFault(last); if (f) return { ok: false, why: f, t, ageMin };
  const need = STUCK_RUN[src] || 3; let run = 1;
  for (let i = series.length - 2; i >= 0 && run < need; i--) { const [ti, r] = series[i]; if (tMs - Date.parse(ti) !== (series.length - 1 - i) * 3600e3) break; if (!r || r.pm25 !== last.pm25) break; run++; }
  if (run >= need) return { ok: false, why: 'stuck (the same value ' + run + ' hours running)', t, ageMin };
  if (!(ageMin <= maxAgeMin)) return { ok: false, why: 'older than ' + Math.round(maxAgeMin) + ' minutes', t, ageMin };
  if (ageMin < -15) return { ok: false, why: 'reading time in the future', t, ageMin };
  /* NowCast input: the 12 hours ending at the latest hour, newest LAST, a QC-failed or missing hour = null */
  const byT = new Map(series.map(([ti, r]) => [Date.parse(ti), r])); const v = [];
  for (let k = 11; k >= 0; k--) { const r = byT.get(tMs - k * 3600e3); v.push(r && !readingFault(r) ? r.pm25 : null); }
  const nc = nowcastPm(v); if (nc == null) return { ok: false, why: 'too few recent hours for the NowCast (2 of the 3 latest needed)', t, ageMin };
  const a = aqiOf(nc, null); if (!a) return { ok: false, why: 'no AQI', t, ageMin };
  return { ok: true, t, ageMin, pm25: last.pm25, nowcast: Math.round(nc * 10) / 10, aqi: a.aqi, category: a.category };
}
export const pm25Text = (x) => (Math.floor(x * 10 + 1e-9) / 10).toFixed(1);   /* truncated to 0.1 ug/m3, as EPA truncates before classing */
export function airNowLabel(placeName, r) { return 'Air quality measured now near ' + placeName + ': AQI ' + r.aqi + ' · ' + r.category + ' (PM2.5 ' + pm25Text(r.pm25) + ' µg/m³, hourly)'; }

export function createAqNow(app, dataDir) {
  let PH = null; const ph = () => { if (PH === null) { try { PH = createPointHeight(dataDir); } catch (_) { PH = false; } } return PH || null; };
  const zCache = new Map();
  const zOf = (lat, lon) => { const k = lat.toFixed(4) + ',' + lon.toFixed(4); if (zCache.has(k)) return zCache.get(k); let z = null;
    try { const h = ph() && ph().heightAt(lat, lon); z = h && h.ok ? (h.elevM ?? h.cellElevM ?? null) : null; } catch (_) { z = null; } zCache.set(k, z); return z; };
  const dzMax = () => { try { const r = app.fleet && app.fleet.screenRule ? app.fleet.screenRule() : null; if (r && isN(r.dz_m)) return r.dz_m; } catch (_) {} return 150; };
  /* every monitor of both sources: { src, id, name, lat, lon, series: [[t, reading]] ascending, hourBegin, operatorName } */
  function monitors() {
    const out = [];
    try { const R = app.epd && app.epd.recent ? app.epd.recent() : null;
      for (const [id, st] of Object.entries((R && R.stations) || {})) { const O = (R.obs && R.obs[id]) || {}; const ts = Object.keys(O).sort().slice(-24); if (!ts.length || !isN(st.lat) || !isN(st.lon)) continue;
        out.push({ src: 'epd', id, lat: st.lat, lon: st.lon, series: ts.map((t) => [t, O[t]]), hourBegin: false, operatorName: 'Punjab EPD station ' + st.name }); } } catch (_) {}
    try { const R = app.dos && app.dos.recent ? app.dos.recent() : null;
      for (const [id, st] of Object.entries((R && R.stations) || {})) { const O = (R.obs && R.obs[id]) || {}; const ts = Object.keys(O).sort().slice(-24); if (!ts.length || !isN(st.lat) || !isN(st.lon)) continue;
        out.push({ src: 'dos', id, lat: st.lat, lon: st.lon, series: ts.map((t) => [t, O[t]]), hourBegin: true, operatorName: 'US Dept of State monitor, ' + st.name }); } } catch (_) {}
    return out;
  }
  /* the measured air quality of a point: { ok, aqi, category, pm25, nowcast, observedAt, detail (operator only) } or { ok:false, why, held } */
  function near(lat, lon, elevM = null, nowMs = Date.now(), o = {}) {
    const maxAge = isN(o.maxAgeMin) ? o.maxAgeMin : AQ_MAX_AGE_MIN;
    if (!isN(lat) || !isN(lon)) return { ok: false, why: 'no point' };
    const zP = isN(elevM) ? elevM : zOf(lat, lon), dz = dzMax(); const cand = [], held = [];
    for (const m of monitors()) { const d = km(lat, lon, m.lat, m.lon); if (!(d <= AQ_NEAR_KM)) continue;
      const zS = zOf(m.lat, m.lon); if (zP != null && zS != null && Math.abs(zS - zP) > dz) { held.push({ name: m.operatorName, km: Math.round(d * 10) / 10, why: 'height difference ' + Math.round(zS - zP) + ' m (rule ' + dz + ' m)' }); continue; }
      const j = judgeSeries(m.series, m.src, nowMs, m.hourBegin, maxAge);
      if (!j.ok) { held.push({ name: m.operatorName, km: Math.round(d * 10) / 10, why: j.why }); continue; }
      cand.push({ m, d, j }); }
    if (!cand.length) return { ok: false, why: held.length ? 'no monitor within ' + AQ_NEAR_KM + ' km passed the checks' : 'no air-quality monitor within ' + AQ_NEAR_KM + ' km', held };
    cand.sort((a, b) => a.d - b.d); const { m, d, j } = cand[0];
    const obsMs = Date.parse(j.t) + (m.hourBegin ? 3600e3 : 0);
    return { ok: true, version: AQNOW_VERSION, aqi: j.aqi, category: j.category, pm25: j.pm25, nowcast: j.nowcast, observedAt: new Date(obsMs).toISOString(), src: m.src,
      detail: { monitor: m.operatorName, km: Math.round(d * 10) / 10, minutesAgo: Math.max(0, Math.round(j.ageMin)), hourly: pm25Text(j.pm25), nowcast: j.nowcast, rule: 'nearest QC-passed monitor within ' + AQ_NEAR_KM + ' km and ' + dz + ' m height, reading younger than ' + Math.round(maxAge) + ' min at the decision (' + AQ_MAX_AGE_MIN + ' min at every display); AQI of the EPA NowCast' },
      held };
  }
  return { near, monitors, version: AQNOW_VERSION };
}
