/* Forecast verification, tested bias correction and the grade A rule.

   Backfill (daily): for every tehsil, the provider's lead-specific past forecasts
   (previous-runs archive, best_match, issued 1/2/3 days before valid time) and ERA5
   reanalysis are fetched at the SAME elevation the dashboard requests, over 60 days
   ending 6 days ago (ERA5 lag).
     - TRAIN = first 30 days: hour-of-day mean error per lead  -> the correction.
     - TEST  = last 30 days: RMSE raw and RMSE corrected, on data the correction never saw.
   A correction is applied to live temperatures only for a tehsil and lead where it
   lowered the TEST RMSE. A tehsil passes on its TEST RMSE (corrected if applied).

   Live ledger: once a day the served 24/48/72 h temperatures are logged; entries
   are scored against ERA5 when the reanalysis for their valid time exists. */
import { drive, setBackground } from './lgbpool.mjs';
import { applySkillChoice } from './skillchoice.mjs';   /* v91.17.283.49 · 1.0.10 item 5: raw or corrected per variable / zone / lead from the stored evidence */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { labelDayEnding, HOUR_ENDING_RULE } from './pktday.mjs';
import { newId, nowIso } from './core.mjs';
import { reanalysisModel, alignBatch } from './provider.mjs';
import { internalNames, label } from './refmode.mjs';
import { downscaleFor, aiEnabled, INPUT_VARIABLES as DS_INPUTS } from './downscale.mjs';
import { esatHpa, dewPointC, rhFromDew, wetBulbC, r1 as r1p } from './psychro.mjs';

/* ══ v283 WS5 · audit A14 · PER-ZONE 90 % RANGE, TESTED HELD OUT ═════════════════════════════════════════════════════════════════
   data/range90-zone.json (scripts/gen/ws5/range90_zone_test.py + range90_zone_fit.py): side factors per zone, about the served value
   T: lo' = T - kLo (T - lo), hi' = T + kHi (hi - T). Applied only for a zone whose held-out test passed (serve: true), only on the lead
   days and calendar months it was fitted and tested on, after the range has been moved to the served value (recentreRange90).
   Everything else keeps the served range. NIGRAAN_RANGE90_ZONE=0 switches it off. Pure: (R, T, leadOf(i), monthOf(i), cell). */
export function scaleRange90(R, T, leadOf, monthOf, cell) {
  if (!R || !Array.isArray(R.lo) || !Array.isArray(R.hi) || !Array.isArray(T) || !cell || cell.serve !== true) return 0;
  const kl = Number(cell.kLo), kh = Number(cell.kHi); if (!(kl > 0) || !(kh > 0)) return 0;
  const L = new Set(cell.leads || []), M = new Set(cell.months || []); const rnd = (x) => Math.round(x * 10) / 10; let n = 0;
  for (let i = 0; i < T.length; i++) { const t = T[i], lo = R.lo[i], hi = R.hi[i]; if (t == null || lo == null || hi == null || !(lo <= t && t <= hi)) continue;
    if (!L.has(leadOf(i)) || !M.has(monthOf(i))) continue; R.lo[i] = rnd(t - kl * (t - lo)); R.hi[i] = rnd(t + kh * (hi - t)); n++; }
  return n;
}

export const RULE = {
  variable: 'temperature_2m', reference: 'ECMWF IFS analysis (models=ecmwf_ifs) for windows from 2017; ERA5 before', model: 'best_match',
  trainDays: 30, testDays: 30, lagDays: 6, gateLeadHours: 24, maxRmseC: 2.0, minHours: 480,
  nationalPassShare: 0.8, maxAgeDays: 30,
  text: 'A tehsil passes when its 24 h temperature forecast, as served (bias-corrected where the correction was shown to help), has RMSE <= 2.0 °C against the reanalysis (ECMWF IFS analysis for recent windows) over an independent 30-day test month on at least 480 hours. The correction is learned only from the month before. National grade A needs >= 80% of tehsils passing, a check under 30 days old, and the grade-B coverage and freshness conditions.',
};
const LEADS = [24, 48, 72];

/* the mountain correction is injected after construction (index.mjs wires it) */
/* v91.17.71 · the moist-air relations shared by the calibration humidity pass (Magnus, the constants of the L2 pass) */
/* v91.17.128 · one psychrometric module (psychro.mjs): Bolton saturation pressure and its exact inverse; the wet bulb solved at the
   served point's air pressure (was Stull's sea-level fit, duplicated three times in this file) */
const tdOfRh = (t, r) => dewPointC(t, Math.max(1, r));
const esOf = esatHpa;
const rhOfTd = (t, td) => rhFromDew(t, td);
const wetBulb = (T, R, elev) => r1p(wetBulbC(T, R, Number.isFinite(elev) ? { elevationM: elev } : null));
/* v91.17.109 · an early-ending zone member continued from the members still running (see mergeZone) */
export function carryMembers(P) {
  const n = Math.max(...P.map(a => a.length)); const lastOf = (a) => { for (let i = a.length - 1; i >= 0; i--) if (a[i] != null) return i; return -1; };
  const L = P.map(lastOf); const maxL = Math.max(...L); if (L.every(x => x === maxL)) return P;
  return P.map((arr, m) => {
    if (L[m] < 0 || L[m] >= maxL || L[m] < 48) return arr;
    const dep = new Array(24).fill(null).map(() => []);
    for (let i = L[m] - 47; i <= L[m]; i++) { if (arr[i] == null) continue; const o = P.filter((_, k) => k !== m && L[k] >= i).map(a => a[i]).filter(x => x != null); if (!o.length) continue; dep[i % 24].push(arr[i] - o.reduce((s, x) => s + x, 0) / o.length); }
    const d = dep.map(v => v.length ? v.reduce((s, x) => s + x, 0) / v.length : null); if (d.some(x => x == null)) return arr;
    const out = arr.slice(); while (out.length < n) out.push(null);
    for (let i = L[m] + 1; i < n; i++) { const o = P.filter((_, k) => k !== m).map(a => a[i]).filter(x => x != null); if (!o.length) continue; out[i] = Math.round((o.reduce((s, x) => s + x, 0) / o.length + d[i % 24]) * 10) / 10; }
    return out;
  });
}

export function createVerification(app) {
  const { store, provider, units, audit } = app;
  let running = false, corrIndex = null;
  /* station guard: a correction learned against ERA5 is switched off near an airport whose
     thermometer says it makes the forecast worse (ERA5 itself is biased there). */
  const GUARD_KM = 40, GUARD_MARGIN_C = 0.1, STATION_MIN_HOURS = 400;
  let guard = new Map(), stationCheck = null;
  function setStationResults(sv) {
    guard = new Map(); stationCheck = null;
    if (!sv || !Array.isArray(sv.stations)) return;
    const tehsils = units.tehsil.filter(u => u.lat != null);
    const rows = [];
    for (const st of sv.stations) {
      const out = { id: st.id, name: st.name, nearestTehsil: st.nearestTehsil, era5Bias: st.era5 && st.era5.bias, leads: {} };
      for (const [L, x] of Object.entries(st.leads || {})) {
        if (!x || x.n < STATION_MIN_HOURS) continue;
        const harmful = x.correction_applied && x.rmse_served > x.rmse_raw + GUARD_MARGIN_C;
        out.leads[L] = { n: x.n, raw: x.rmse_raw, candidate: x.rmse_served, served: harmful ? x.rmse_raw : x.rmse_served, guarded: harmful };
        if (harmful) for (const u of tehsils) {
          const km = Math.hypot(u.lat - st.lat, (u.lon - st.lon) * Math.cos(st.lat * Math.PI / 180)) * 111;
          if (km <= GUARD_KM) { const k = u.unitId + '|' + L, g = guard.get(k); if (!g || g.km > km) guard.set(k, { station: st.id, km: Math.round(km), raw: x.rmse_raw, candidate: x.rmse_served }); }
        }
      }
      if (Object.keys(out.leads).length) rows.push(out);
    }
    const g24 = rows.map(r => r.leads[24]).filter(Boolean);
    const med = (a) => { const q = a.filter(v => v != null).sort((x, y) => x - y); return q.length ? q[Math.floor(q.length / 2)] : null; };
    const passN = g24.filter(x => x.served <= RULE.maxRmseC).length;
    const enough = g24.length >= 4;
    stationCheck = { at: sv.at, window: sv.window, stations: g24.length, passServed: passN, passShareNeeded: 0.75, medianRaw: med(g24.map(x => x.raw)), medianCandidate: med(g24.map(x => x.candidate)), medianServed: med(g24.map(x => x.served)),
      guardedStations: rows.filter(r => r.leads[24] && r.leads[24].guarded).map(r => r.id), guardedTehsils24: [...guard.keys()].filter(k => k.endsWith('|24')).length, rows,
      ok: enough ? (passN / g24.length >= 0.75 && med(g24.map(x => x.served)) <= med(g24.map(x => x.raw)) + 0.05) : null,
      note: enough ? null : 'fewer than 4 stations with enough hours; station check not applied' };
    /* v91.17.60 · the served learned model must have been fitted from data that ends BEFORE the check window; otherwise
       the airports are scored in-sample and the check says nothing. train_ml.py exports fit_until (36-day embargo). */
    try {
      const ml = app.mos && app.mos.ml && app.mos.ml(); const st = ml && ml.status ? ml.status() : null;
      if (st && st.enabled) {
        const fitUntil = st.fitUntil || null; const winStart = sv.window && sv.window.start_date;
        const inSample = !fitUntil || (winStart && fitUntil > winStart);
        stationCheck.learnedModel = { fitUntil, inSample };
        if (inSample) { stationCheck.ok = false; stationCheck.note = 'served learned model fitted ' + (fitUntil ? 'through ' + fitUntil : 'without an embargo date') + ', inside the check window from ' + winStart + ': in-sample score, check not accepted'; }
      }
    } catch {}
  }
  const guarded = (unitId, L) => guard.get(unitId + '|' + L) || null;
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  /* v91.17.36 · AUDIT V-01/R-04 · "served" means what /px and the national sweep actually emit.
     The ERA5 hour-of-day correction is fitted here and only SERVED when NIGRAAN_ERA5_BIAS=1
     (off by default since v91.17.23). The summary, the rows and the report used to say
     "as served 1.049 °C · applied" from the fitted figure while the served forecast was raw. */
  const enabled = () => process.env.NIGRAAN_BIAS_CORRECTION !== '0';
  const servingEra5 = () => process.env.NIGRAAN_ERA5_BIAS === '1';
  let mosApi = null;
  const setMos = (m) => { mosApi = m; };
  /* the mountain correction applies here, and at what height */
  function mosFor(lat, lon, loc) {
    if (!mosApi || !mosApi.enabled()) return null;
    const elevM = (loc && loc.elevation != null) ? loc.elevation : null;
    const mlSite = (() => { try { const m = mosApi.ml && mosApi.ml(); return !!(m && m.siteNear && m.siteNear(lat, lon, elevM)); } catch { return false; } })();   /* v91.17.60 · site-validated learned model */
    if (elevM == null || !(mosApi.inDomain(lat, lon, elevM) || (mosApi.hasSynop && mosApi.hasSynop(lat, lon, elevM)) || mlSite)) return null;   /* v91.17.59 · synop entries outside the box */
    /* v91.17.59 · applicability is decided per hour inside biasAt (a synop entry may exist for March and not for
       September); the old test at "now" switched the whole response off when the current month had no entry */
    return { elevM };
  }

  function buildIndex() {
    const by = new Map();
    for (const c of store.all('biasCorrections')) { let u = by.get(c.unitId); if (!u) by.set(c.unitId, u = { unitId: c.unitId, lat: c.lat, lon: c.lon, key: c.key, leads: {} }); u.leads[c.lead_hours] = c; }
    corrIndex = [...by.values()];
  }
  function nearest(lat, lon) {
    if (!corrIndex) buildIndex();
    let best = null, bd = 0.15 * 0.15;
    for (const u of corrIndex) { const d = (u.lat - lat) ** 2 + (u.lon - lon) ** 2; if (d < bd) { bd = d; best = u; } }
    return best;
  }

  /* ══ v91.17.70 · THE TEMPERATURE BASIS OF A RESPONSE ═════════════════════════════════════════════════════════════
     mergeZone folds a zone request (models = data/model-zone.json request.models, e.g. best_match + the mountain model +
     its full-horizon fallback) into ONE plain response: the temperature family (temperature, apparent temperature, dew
     point, relative humidity, wet bulb; hourly, daily, current, 15-minutely) from the point's zone model, every other
     variable from best_match. The zone is decided per point from its RESOLVED height (loc.elevation, the provider's DEM
     or the caller's settlement height) and the zone geometry in the file. Past the zone model's own horizon the fallback
     takes over, blended linearly over blendHours so the curve has no step; a zone model's last (partial) day is not used
     for daily values. */
  const ZONE_VERSION = 'tc-91.17.70';
  function basisOf(loc, lat, lon, correction) {
    try {
      if (!loc) return null;
      if (!loc.agn_temperature_basis) {
        const zone = mosApi && mosApi.zoneOfPoint ? mosApi.zoneOfPoint(lat, lon, loc.elevation != null ? loc.elevation : null) : null;
        loc.agn_temperature_basis = { zone, model: 'best_match', fallback: null, elevM: loc.elevation ?? null, version: ZONE_VERSION, merged: false };
      }
      if (correction) loc.agn_temperature_basis.correction = correction;
      return loc.agn_temperature_basis;
    } catch { return null; }
  }
  /* v91.17.108 · lay a members-only response beside a best_match location as the suffixed keys a zone request carries
     (same request window, so the same time axis; checked by the time strings). */
  function injectMembers(loc, row, modelsStr) {
    try {
      const models = String(modelsStr).split(',').map(x => x.trim()).filter(Boolean); const base = models[0]; const mem = models.slice(1);
      let any = false;
      for (const sec of ['hourly', 'daily']) {
        const S = loc && loc[sec], R = row && row[sec]; if (!S || !R || !Array.isArray(S.time) || !Array.isArray(R.time)) continue;
        if (S.time.length !== R.time.length || S.time[0] !== R.time[0]) continue;
        const bases = new Set(); for (const k of Object.keys(R)) for (const m of mem) if (k.endsWith('_' + m)) bases.add(k.slice(0, k.length - m.length - 1));
        for (const b of bases) { if (!Array.isArray(S[b])) continue; S[b + '_' + base] = S[b]; for (const m of mem) if (Array.isArray(R[b + '_' + m])) S[b + '_' + m] = R[b + '_' + m]; any = true; }
      }
      return any;
    } catch (_) { return false; }
  }
  function mergeZone(loc, lat, lon, modelsStr) {
    if (!loc || !mosApi || !mosApi.zoneOfPoint) return false;
    const models = String(modelsStr || '').split(',').map(x => x.trim()).filter(Boolean); if (models.length < 2) return false;
    const baseModel = models[0];
    const elevM = loc.elevation != null ? loc.elevation : null;
    const zone = mosApi.zoneOfPoint(lat, lon, elevM); const zm = mosApi.zoneModel(zone || 'plains');
    const fam = (mosApi.temperatureFamily && mosApi.temperatureFamily()) || { hourly: ['temperature_2m', 'apparent_temperature', 'dew_point_2m', 'relative_humidity_2m'], daily: ['temperature_2m_max', 'temperature_2m_min', 'temperature_2m_mean'] };
    const famH = new Set(fam.hourly || []), famD = new Set(fam.daily || []);
    /* the zone's members (one model, or an equal-weight blend); best_match as a member is the base model's own series */
    const mem = (zm.members || [zm.temperature]).filter(m => m && m !== 'best_match' && models.includes(m));
    const useZone = mem.length > 0 && !(zm.members || []).includes('best_match');
    const fb = useZone ? (zm.fallback && zm.fallback !== 'best_match' && models.includes(zm.fallback) ? zm.fallback : baseModel) : null;
    const B = Math.max(1, Number(zm.blendHours) || 1);
    const suf = (k) => { for (const m of models) if (k.endsWith('_' + m)) return m; return null; };
    for (const sec of ['hourly', 'daily', 'current', 'minutely_15']) {
      const S = loc[sec]; if (!S || typeof S !== 'object') continue;
      const U = loc[sec + '_units'] || null;
      const bases = new Set(Object.keys(S).filter(k => suf(k)).map(k => k.slice(0, k.length - suf(k).length - 1)));
      const step = sec === 'minutely_15' ? 4 : 1;   /* blend hours in samples */
      for (const b of bases) {
        const inFam = useZone && (sec === 'daily' ? famD.has(b) : famH.has(b));
        const bv = S[b + '_' + baseModel];
        let P = inFam ? mem.map(m => S[b + '_' + m]).filter(x => x !== undefined) : [];
        /* v91.17.109 · A MEMBER THAT ENDS EARLY IS CARRIED, NOT DROPPED. The zone basis is the mean of its members and the station
           calibration was fitted on that full mean. Meteo-France ends at about 108 h while ICON and GFS run on, so from day 5 the
           mean silently became a two-member mean (replay: hills day-5 bias -1.3 C). The ending member is continued as the mean of
           the members still running plus its own departure from them, by hour of day, over its last 48 h. NIGRAAN_ZONE_CARRY=0 off. */
        if (sec === 'hourly' && P.length > 1 && Array.isArray(P[0]) && process.env.NIGRAAN_ZONE_CARRY !== '0') P = carryMembers(P);
        let out;
        if (!inFam || !P.length) out = bv;
        else if (!Array.isArray(P[0])) { const v = P.filter(x => x != null); out = v.length ? Math.round(v.reduce((a, x) => a + x, 0) / v.length * 10) / 10 : (S[b + '_' + fb] ?? bv); }
        else {
          const F = Array.isArray(S[b + '_' + fb]) ? S[b + '_' + fb] : bv;
          const last = P.map(arr => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return i; return -1; });
          out = P[0].map((_, i) => {
            let sw = 0, sx = 0;
            P.forEach((arr, m) => {
              const x = arr[i]; if (x == null) return;
              let w;
              if (sec === 'daily') w = i < last[m] ? 1 : 0;                       /* a member's last (partial) day is not used */
              else { const L = last[m], Bs = B * step; w = i <= L - Bs ? 1 : (i <= L ? (L - i + 0.5) / Bs : 0); }
              sw += w; sx += w * x;
            });
            const f = F ? F[i] : null;
            if (sw >= 1 || (sw > 0 && f == null)) return Math.round(sx / sw * 10) / 10;
            if (sw > 0 && f != null) return Math.round((sx + (1 - sw) * f) * 10) / 10;   /* fading out into the fallback */
            return f != null ? f : null;
          });
        }
        S[b] = out;
        if (U) { const uk = Object.keys(U).find(k => k.startsWith(b + '_') && suf(k)); if (uk && U[b] === undefined) U[b] = U[uk]; }
      }
      /* v91.17.73 · the AI local correction reads cloud, wind and precipitation as the zone MEMBERS' mean (its training basis);
         the served variables stay best_match's. The mean is kept on a non-enumerable property (never serialised). */
      if (sec === 'hourly' && useZone) {
        const dsIn = {};
        for (const v of DS_INPUTS) { if (v === 'temperature_2m') continue; const P = mem.map(m => S[v + '_' + m]).filter(Array.isArray); if (!P.length) continue;
          dsIn[v] = P[0].map((_, i) => { let sx = 0, n = 0; for (const a of P) if (a[i] != null) { sx += a[i]; n++; } return n ? sx / n : null; }); }
        if (Object.keys(dsIn).length) Object.defineProperty(S, '__dsIn', { value: dsIn, enumerable: false, configurable: true });
      }
      /* v91.17.89 · the national model reads T0 = best_match and the other pool members; kept non-enumerable (never serialised) */
      if (sec === 'hourly') { const st = {}; for (const m of models) { const x = S['temperature_2m_' + m]; if (Array.isArray(x)) st[m] = x.slice(); }
        if (Array.isArray(S['dew_point_2m_' + baseModel])) st.__dew = S['dew_point_2m_' + baseModel].slice();   /* the base model's own dew point (the zone merge blends it) */
        if (Array.isArray(S['relative_humidity_2m_' + baseModel])) st.__rh = S['relative_humidity_2m_' + baseModel].slice();
        if (Array.isArray(S['wind_speed_10m_' + baseModel])) st.__ws = S['wind_speed_10m_' + baseModel].slice();   /* v91.17.177 · the base model's own wind */
        if (st.best_match) Object.defineProperty(S, '__natT', { value: st, enumerable: false, configurable: true }); }
      for (const k of Object.keys(S)) if (suf(k)) delete S[k];
      if (U) for (const k of Object.keys(U)) if (suf(k)) delete U[k];
    }
    loc.agn_temperature_basis = { zone, model: useZone ? mem.join('+') : 'best_match', fallback: useZone ? fb : null, blendHours: useZone ? B : null, elevM, version: ZONE_VERSION, merged: true };
    return true;
  }
  /* ══ v91.17.71 · THE STATION CALIBRATION ON THE ZONE BASIS (mos.mjs calibrationAt / stretchAdj) ═══════════════════
     Where the point's zone (mountain, hills) has a calibration table fitted on the basis this response carries
     (agn_temperature_basis.model equals the table's basis: the merged mountain blend, or best_match in the hills), the
     hourly curve is moved by the diurnal stretch: each Pakistan day's forecast maximum by the site's Tmax offset and its
     minimum by the Tmin offset, the hours between following the curve itself. A response whose basis differs (a mountain
     point requested without the zone models) is left on its own basis: the table would not fit it. Station data use:
     stationData() (default ON); NIGRAAN_STATION_DATA=0 serves the pure zone basis. */
  /* ══ v91.17.73 · THE AI LOCAL CORRECTION (terrain and land surface) · downscale.mjs ═══════════════════════════════════
     T_local = T_served + R: a day-1 Tmax / Tmin residual from the 250 m feature-grid cell and the day's served weather
     (cloud, wind, precipitation, the basis day max / range), trained against what an UNSTATIONED point is served. It rides
     the same diurnal stretch as the station calibration (the day's anchors take offset + R), so the day card stays the
     curve (T4). Mountain: added to the calibration only where the point takes it from a nearby site, the area or the band
     (never at a station site, whose own offset already holds the local effect). Plains: an AI-only stretch where neither
     the MACH running correction nor the fleet urban term applies. Hills and coast: not applied (the model file's gate).
     NIGRAAN_AI_DOWNSCALE=0 switches it off. */
  const AI_VIA = new Set(['nearby', 'area', 'band']);
  const WK = { kmh: 1, ms: 3.6, mph: 1.609344, kn: 1.852 };
  const pktKey = (tMs) => new Date(tMs + 5 * 3600e3).toISOString().slice(0, 10);
  const capAi = (v) => Math.max(-6, Math.min(6, v));
  const dsApi = () => downscaleFor(app);
  /* (dayKey) -> the applied residual {dTx, dTn} | null, memoised; .used = the days that took it */
  function aiDays(lat, lon, zone, elevM, ts, H, windUnit) {
    const D = dsApi(); if (!D || !aiEnabled() || !ts || !H) return null;
    const src = H.__dsIn || {};
    const inp = D.dayInputs(ts, { temperature_2m: H.temperature_2m, cloud_cover: src.cloud_cover || H.cloud_cover, wind_speed_10m: src.wind_speed_10m || H.wind_speed_10m, precipitation: src.precipitation || H.precipitation }, { windFactor: WK[String(windUnit || 'kmh')] || 1 });
    const memo = new Map(), used = new Map();
    const f = (key) => {
      if (memo.has(key)) return memo.get(key);
      const o = inp.get(key); let r = null;
      if (o) { const x = D.residualDay(lat, lon, { ...o, servedElevM: elevM, zone }); if (x.applied) { r = x; used.set(key, x); D.remember(lat, lon, key, x); } }
      memo.set(key, r); return r;
    };
    f.used = used; f.version = (D.status() || {}).version || null;
    return f;
  }
  function aiBlock(ai) {
    const v = [...ai.used.values()]; const m = (k) => v.length ? +(v.reduce((a, x) => a + x[k], 0) / v.length).toFixed(2) : null;
    /* v91.17.75 (agent P, C1) · the applied day and night terms per Pakistan day, so the Current Conditions card can say what the
       correction did today; a correction value, not a skill figure */
    const terms = [...ai.used.entries()].sort((x, y) => String(x[0]).localeCompare(String(y[0]))).slice(0, 24).map(([d, x]) => ({ date: String(d).slice(0, 10), dayC: x.dTx != null ? Math.round(x.dTx * 10) / 10 : null, nightC: x.dTn != null ? Math.round(x.dTn * 10) / 10 : null }));
    return { applied: true, label: 'AI local correction (terrain and land surface)', tier: 'B', reference: label('calibration'), version: ai.version, days: v.length, terms, ...(internalNames() ? { internal: { model: v[0] && v[0].basis ? v[0].basis.model : null, meanTxC: m('dTx'), meanTnC: m('dTn') } } : {}),
             method: 'day-1 maximum and minimum residual from the 250 m terrain and land-surface cell and the day\'s forecast weather, applied as a diurnal stretch of the hourly curve; the day card is the corrected curve' };
  }
  function aiOnly(loc, lat, lon, windUnit) {
    try {
      if (!mosApi || !mosApi.stretchAdj || !aiEnabled()) return null;
      const elevM = loc.elevation != null ? loc.elevation : null; if (elevM == null) return null;
      const zone = mosApi.zoneOfPoint(lat, lon, elevM); if (zone !== 'plains' && zone !== 'coast') return null;
      const basisModel = (loc.agn_temperature_basis && loc.agn_temperature_basis.model) || 'best_match'; if (basisModel !== 'best_match') return null;
      const H = loc.hourly; if (!H || !Array.isArray(H.time) || !Array.isArray(H.temperature_2m) || !H.time.length) return null;
      const off = (loc.utc_offset_seconds || 0) * 1000; const ts = H.time.map(t => Date.parse(t + 'Z') - off);
      const ai = aiDays(lat, lon, zone, elevM, ts, H, windUnit); if (!ai) return null;
      const cal = (month, key) => { const r = key ? ai(key) : null; return r ? { tx: capAi(r.dTx), tn: capAi(r.dTn) } : null; };
      const st = mosApi.stretchAdj(ts, H.temperature_2m, cal); if (!ai.used.size) return null;
      const idx = new Map(ts.map((t, i) => [t, i]));
      const shape = (tMs) => { const d = new Date(tMs); const h = d.getUTCHours() + d.getUTCMinutes() / 60; return h <= 9 ? h / 9 : Math.max(0, (24 - h) / 15); };
      const adjAt = (tMs) => {
        const i = idx.get(tMs); if (i != null) return st.adj[i];
        if (tMs > ts[0] && tMs < ts[ts.length - 1]) { let lo = 0, hi = ts.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ts[mid] <= tMs) lo = mid; else hi = mid; } const f = (tMs - ts[lo]) / (ts[hi] - ts[lo]); return st.adj[lo] + f * (st.adj[hi] - st.adj[lo]); }
        const c = cal(null, pktKey(tMs)); if (!c) return 0; const w = shape(tMs); return c.tn + (c.tx - c.tn) * w;
      };
      const dayAdj = (dateStr) => cal(null, String(dateStr).slice(0, 10));
      return { zone, elevM, adjAt, dayAdj, ts, ai, aiOnly: true };
    } catch (_) { return null; }
  }
  function zoneCalibration(loc, lat, lon, windUnit = 'kmh') {
    try {
      if (!mosApi || !mosApi.calibrationOn || !mosApi.calibrationOn()) return null;
      const elevM = loc.elevation != null ? loc.elevation : null; if (elevM == null) return null;
      const zone = mosApi.zoneOfPoint(lat, lon, elevM); if (zone !== 'mountain' && zone !== 'hills' && !((zone === 'plains' || zone === 'coast') && mosApi.calibratedZone && mosApi.calibratedZone(zone))) return null;
      /* v91.17.139 · plains / coast synop sites (Balochistan record): AGN's own MACH running correction takes precedence where it applies */
      if ((zone === 'plains' || zone === 'coast') && !(loc && loc.__noLive) && app.fleet && app.fleet.runningBias) { try { const r = app.fleet.runningBias(lat, lon, elevM, Date.now()); if (r && r.applied) return null; } catch (_) {} }
      const basisModel = (loc.agn_temperature_basis && loc.agn_temperature_basis.model) || 'best_match';
      if (mosApi.calibrationBasis(zone) !== basisModel) return null;
      const memo = new Map(); const cal0 = (month) => { if (!memo.has(month)) memo.set(month, mosApi.calibrationAt(lat, lon, elevM, zone, month)); return memo.get(month); };
      const nowMonth = new Date(Date.now() + 5 * 3600e3).getUTCMonth() + 1; const probe = cal0(nowMonth);
      const off = (loc.utc_offset_seconds || 0) * 1000; const H = loc.hourly;
      let st = null, ts = null, idx = null, ai = null;
      if (H && Array.isArray(H.time) && Array.isArray(H.temperature_2m) && H.time.length) ts = H.time.map(t => Date.parse(t + 'Z') - off);
      /* v91.17.73 · the AI residual joins the day's offsets (not at a station site) before the stretch */
      if (ts && zone === 'mountain') ai = aiDays(lat, lon, zone, elevM, ts, H, windUnit);
      const cal = (month, key) => { const c = cal0(month); if (!c || !key || !ai || !AI_VIA.has(c.via)) return c; const r = ai(key); return r ? { ...c, tx: capAi(c.tx + r.dTx), tn: capAi(c.tn + r.dTn), ai: true } : c; };
      if (ts) { st = mosApi.stretchAdj(ts, H.temperature_2m, cal); idx = new Map(ts.map((t, i) => [t, i])); }
      if (!probe && !(st && st.adj.some(v => v))) return null;
      const dayCal = (tMs) => cal(new Date(tMs + 5 * 3600e3).getUTCMonth() + 1, pktKey(tMs));
      const shape = (tMs) => { const d = new Date(tMs); const h = d.getUTCHours() + d.getUTCMinutes() / 60; return h <= 9 ? h / 9 : Math.max(0, (24 - h) / 15); };   /* 0 at 00 UTC (05 PKT, the minimum), 1 at 09 UTC (14 PKT, the maximum) */
      const adjAt = (tMs) => {
        if (st) {
          const i = idx.get(tMs); if (i != null) return st.adj[i];
          if (tMs > ts[0] && tMs < ts[ts.length - 1]) { let lo = 0, hi = ts.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (ts[mid] <= tMs) lo = mid; else hi = mid; } const f = (tMs - ts[lo]) / (ts[hi] - ts[lo]); return st.adj[lo] + f * (st.adj[hi] - st.adj[lo]); }
        }
        const c = dayCal(tMs); if (!c) return 0; const w = shape(tMs); return c.tn + (c.tx - c.tn) * w;
      };
      const dayAdj = (dateStr) => cal(Number(String(dateStr).slice(5, 7)), String(dateStr).slice(0, 10));
      return { zone, elevM, probe, adjAt, dayAdj, ts, ai: ai && ai.used.size ? ai : null, credit: mosApi.calibrationCredit(zone), via: probe ? probe.via : null, siteKm: probe ? probe.siteKm : null, siteId: probe ? probe.siteId : null, natOff: !!(probe && probe.natOff) };
    } catch (_) { return null; }
  }
  /* shift temperature fields of one Open-Meteo location object in place */
  /* ══ v91.17.89 · THE NATIONAL HYPERLOCAL MODEL (natmodel.mjs) on top of the served chain, inside correctLocation so the
     page, the fleet pairs and the live layer all see one number. T0 = best_match: the zone merge's stash, or the caller's own
     series when the request is a plain best_match one. */
  let _RQ = null, _RQm = 0, _RQc = 0;
  function rainQm() { const now = Date.now(); if (_RQ !== null && now - _RQc < 60000) return _RQ; _RQc = now;
    try { const f = join(app.dataDir || join(process.cwd(), 'data'), 'rain-qm-north.json'); if (!existsSync(f)) return (_RQ = false); const t = statSync(f).mtimeMs; if (t !== _RQm) { _RQ = JSON.parse(readFileSync(f, 'utf8')); _RQm = t; } } catch (_) { _RQ = false; } return _RQ; }
  /* v91.17.231 · correctLocationSteps: the same chain as a generator; with A (async) the model trees are evaluated in the worker pool
     (lgbpool.mjs) and the server answers other requests meanwhile. correctLocation runs it to the end on this thread. */
  function correctLocation(loc, lat, lon, nowMs = Date.now(), windUnit = 'kmh') { return drive(correctLocationSteps(loc, lat, lon, nowMs, windUnit, false)); }
  /* v91.17.283.10 · one step-log entry: [stage, a copy of the hourly temperature] (never a reference: later stages cannot alter it) */
  function stepSnap(SL, loc, id) { if (!SL) return; try { const T = loc && loc.hourly && loc.hourly.temperature_2m; if (Array.isArray(T)) SL.push([id, T.slice()]); } catch (_) {} }
  function* correctLocationSteps(loc, lat, lon, nowMs = Date.now(), windUnit = 'kmh', A = false) {
    try { if (app.wxmos) app.wxmos.stash(loc); } catch (_) {}   /* v91.17.187 · the provider's own values, for the weather MOS features */
    /* 28 Oct 2026 · the owner-approved IFS bias-removal set (ifsretrain.mjs): its per-hour terms are read here, before anything moves a
       value, from the IFS-basis hours this location carries; null (nothing set, nothing changes) without an approved set */
    try { if (app.ifsRetrain) app.ifsRetrain.plan(loc, lat, lon, windUnit); } catch (_) {}
    const H = loc && loc.hourly; let T0 = null, mem = null;
    try {
      if (app.national && app.national.enabled() && !loc.__noNat && H && Array.isArray(H.temperature_2m) && Array.isArray(H.time)) {
        if (H.__natT) { T0 = H.__natT.best_match; mem = H.__natT; }
        else if (!loc.__req || loc.__req === 'best_match') T0 = H.temperature_2m.slice();
      }
    } catch (_) { T0 = null; }
    /* v91.17.92 · the mountain humidity / wind correction reads the model's own values before anything moves them */
    let raw = null, rawDew = null;
    try { if (app.humWind && H && !loc.__noNat && app.humWind.inDomain(lat, lon, loc.elevation)) raw = { rh: (H.__natT && H.__natT.__rh) || (Array.isArray(H.relative_humidity_2m) ? H.relative_humidity_2m.slice() : null), ws: Array.isArray(H.wind_speed_10m) ? H.wind_speed_10m.slice() : null }; } catch (_) { raw = null; }
    /* v91.17.93 · plains / coast: the model's own dew point before anything moves it (the zone merge's base-model stash first) */
    try { if (app.humWind && H && !loc.__noNat && Array.isArray(H.temperature_2m) && app.humWind.lowZone(lat, lon, loc.elevation)) {
      rawDew = (H.__natT && H.__natT.__dew) || (Array.isArray(H.dew_point_2m) ? H.dew_point_2m.slice() : null);
      if (!rawDew && Array.isArray(H.relative_humidity_2m)) { const RR = (H.__natT && H.__natT.__rh) || H.relative_humidity_2m, TT = (H.__natT && H.__natT.best_match) || H.temperature_2m;
        rawDew = TT.map((t, i) => (t == null || RR[i] == null) ? null : tdOfRh(t, RR[i])); } } } catch (_) { rawDew = null; }
    /* v91.17.177 · the national dew point / wind model reads best_match's own dew point and the model's own wind before anything moves them */
    let mPlan = null, mDew = null, mWs = null;
    try { if (app.moist && T0 && H && !loc.__noNat) { mPlan = app.moist.plan(lat, lon, loc.elevation);
      if (mPlan) { mDew = (H.__natT && H.__natT.__dew) || (Array.isArray(H.dew_point_2m) ? H.dew_point_2m.slice() : null);
        if (!mDew && Array.isArray(H.relative_humidity_2m)) { const RR = (H.__natT && H.__natT.__rh) || H.relative_humidity_2m; mDew = T0.map((t, i) => (t == null || RR[i] == null) ? null : tdOfRh(t, RR[i])); }
        mWs = (H.__natT && H.__natT.__ws) || (Array.isArray(H.wind_speed_10m) ? H.wind_speed_10m.slice() : null); } } } catch (_) { mPlan = null; }
    if (A) yield 'pre-chain';
    const a = correctChain(loc, lat, lon, nowMs, windUnit);
    if (loc.__stepLog) stepSnap(loc.__stepLog, loc, 'calibration');   /* v91.17.283.10 · step log (fleet pairing only) */
    if (A) yield 'chain';
    let b = false, c = false;
    const wk = { kmh: 1, ms: 3.6, mph: 1.609344, kn: 1.852 }[String(windUnit || 'kmh')] || 1;
    if (T0) { try { b = app.national.applySteps ? yield* app.national.applySteps(loc, lat, lon, T0, mem, wk, { rangeOnly: !!loc.__scNatOff }, A) : app.national.apply(loc, lat, lon, T0, mem, wk, { rangeOnly: !!loc.__scNatOff }); } catch (e) { loc.agn_national = { applied: false, error: String(e.message || e) }; } }
    if (loc.__stepLog) stepSnap(loc.__stepLog, loc, 'national');   /* v91.17.283.10 · step log (fleet pairing only) */
    try { if (T0) Object.defineProperty(loc, '__T0', { value: T0, enumerable: false, configurable: true }); } catch (_) {}   /* v91.17.187 · the raw series for the weather MOS */
    let mo = { dew: false, wind: false };
    if (mPlan) { try { mo = app.moist.applySteps ? yield* app.moist.applySteps(loc, lat, lon, T0, mDew, mWs, wk, A) : app.moist.apply(loc, lat, lon, T0, mDew, mWs, wk); } catch (e) { loc.agn_moist = { applied: false, error: String(e.message || e) }; } }
    /* where the national dew point model serves, the earlier humidity steps stand aside (they were judged against it, held out) */
    if (raw && !mo.dew) { try { c = app.humWind.apply(loc, lat, lon, raw, wk); } catch (e) { loc.agn_humwind = { applied: false, error: String(e.message || e) }; } }
    let d = false;
    if (rawDew && !mo.dew) { try { d = app.humWind.applyDew(loc, lat, lon, rawDew); } catch (e) { loc.agn_dew = { applied: false, error: String(e.message || e) }; } }
    if (app.humWind && (b || c || d || mo.dew)) { try { app.humWind.consistency(loc); } catch (_) {} }   /* v91.17.93 · one physical state */
    /* v91.17.93 science audit (A2): in the mountain zone the model's rain chance has no skill at the valley gauges
       (93 PMD-EWS gauges, 2024-2026: >= 1 mm days false-alarm ratio 0.70, >= 10 mm 0.90; station-lake/reports/extra_vars_test.md).
       The hourly, current and daily rain chance are withheld there with the reason; rain amounts stay. NIGRAAN_MTN_RAINPROB=1 keeps them. */
    let e = false;
    try { if (process.env.NIGRAAN_MTN_RAINPROB !== '1' && mosApi && mosApi.zoneOfPoint && mosApi.zoneOfPoint(lat, lon, loc.elevation != null ? loc.elevation : null) === 'mountain') {
      const why = 'rain chance withheld in the mountains: at 93 valley gauges the model called 7 of 10 rain days that stayed dry';
      if (H && Array.isArray(H.precipitation_probability)) { H.precipitation_probability = H.precipitation_probability.map(() => null); e = true; }
      if (loc.current && loc.current.precipitation_probability != null) { loc.current.precipitation_probability = null; e = true; }
      if (loc.daily && Array.isArray(loc.daily.precipitation_probability_max)) { loc.daily.precipitation_probability_max = loc.daily.precipitation_probability_max.map(() => null); e = true; }
      if (e) loc.agn_rainprob = { withheld: true, why };
    } } catch (_) {}
    /* v91.17.93 · the northern rain correction (CEO 30 Sep: yes). data/rain-qm-north.json (station-lake/scripts/rain_qm_north.py):
       mountain zone, liquid days (model daily mean T >= 3 C), monthly quantile mapping to the valley gauges. Two outputs:
         precipitation_corrected / precipitation_sum_corrected  the displayed amount (full map; held out, totals 1.94x -> 1.17x the gauges)
         precipitation / precipitation_sum from liveFrom         the warning input (tail-preserving map: light rain cut, heavy days
                                                                 kept; >= 10 mm POD 0.42 raw, 0.40 this); raw kept as *_raw
       Before liveFrom the warnings keep the raw rain (the shadow week). NIGRAAN_RAINQM=0 switches it off. */
    /* v91.17.283.28 · S2 · ONE DAY RULE FOR AMOUNTS: the provider's day total adds the values stamped 00:00-23:00 of the day (rain of
       23:00 the day before to 23:00); the day total of an answer that carries the hours is re-made from them by the hour-ending rule
       (pktday.mjs: the hours ending 01:00 to 24:00), only where all 24 hours of that day are present; the provider's own total is kept as
       *_provider. A day the hours do not cover in full keeps the provider's total and is named in agn_daybasis.partial. */
    let dq = false; try { const Dd0 = loc.daily; if (H && Array.isArray(H.time) && Dd0 && Array.isArray(Dd0.time)) { const part = [];
      for (const [hv, dv] of [['precipitation', 'precipitation_sum'], ['snowfall', 'snowfall_sum'], ['rain', 'rain_sum']]) {
        if (!Array.isArray(H[hv]) || !Array.isArray(Dd0[dv])) continue; const by = new Map();
        H.time.forEach((t, k) => { const d = labelDayEnding(t), v = H[hv][k]; const e = by.get(d) || by.set(d, { s: 0, n: 0, dup: 0, seen: new Set() }).get(d); const tk = String(t).slice(0, 16); if (e.seen.has(tk)) { e.dup++; return; } e.seen.add(tk); if (typeof v === 'number' && Number.isFinite(v)) { e.s += v; e.n++; } });   /* v283.31 · 3.6: 24 different hours */
        Dd0[dv + '_provider'] = Dd0[dv].slice(); dq = true;
        Dd0[dv] = Dd0.time.map((d, i) => { const e = by.get(String(d).slice(0, 10)); if (e && e.n === 24 && !e.dup) return Math.round(e.s * 100) / 100; part.push(String(d).slice(0, 10)); return Dd0[dv][i]; }); }
      if (dq) loc.agn_daybasis = { rule: HOUR_ENDING_RULE, partial: [...new Set(part)] }; } } catch (_) {}
    let q = false;
    try { if (process.env.NIGRAAN_RAINQM !== '0' && H && Array.isArray(H.precipitation) && Array.isArray(H.time) && mosApi && mosApi.zoneOfPoint && mosApi.zoneOfPoint(lat, lon, loc.elevation != null ? loc.elevation : null) === 'mountain') {
      const Q = rainQm(); if (Q && Q.months) {
        const live = Q.liveFrom && Date.now() >= Date.parse(Q.liveFrom + 'T00:00:00+05:00');
        const QS = Array.from({ length: 199 }, (_, i) => 0.005 + i * 0.005);
        const interp = (x, xs, ys) => { if (x <= xs[0]) return ys[0]; for (let i = 1; i < xs.length; i++) if (x <= xs[i]) { const w = xs[i] > xs[i - 1] ? (x - xs[i - 1]) / (xs[i] - xs[i - 1]) : 1; return ys[i - 1] + w * (ys[i] - ys[i - 1]); } return ys[ys.length - 1]; };
        const map = (m, x) => { const r = Q.months[String(m)]; if (!r || !(x > 0)) return x > 0 ? x : 0; const mq = r.mq, oq = r.oq; return x > mq[mq.length - 1] ? x * (mq[mq.length - 1] > 0 ? oq[oq.length - 1] / mq[mq.length - 1] : 1) : interp(x, mq, oq); };
        const tail = (m, x) => { const r = Q.months[String(m)]; if (!r || !(x > 0)) return x > 0 ? x : 0; const y = map(m, x), tp = Q.tailPreserve || [0.8, 0.9]; const lo = interp(tp[0], QS, r.mq), hi = interp(tp[1], QS, r.mq); const w = x <= lo ? 0 : x >= hi ? 1 : (x - lo) / (hi - lo); return (1 - w) * y + w * Math.max(x, y); };
        const P = H.precipitation, T = H.temperature_2m || [], byDay = new Map();
        H.time.forEach((t, i) => { const d = labelDayEnding(t); (byDay.get(d) || byDay.set(d, []).get(d)).push(i); });   /* v283.28 S2: hour-ending values (pktday.mjs, one rule) */
        const cor = P.slice(), warn = P.slice(), dayC = {}, dayW = {}, dayR = {}; let mapped = 0, noT = 0;
        /* v91.17.213 · rainfall completeness: a missing hour is not a dry hour. The 24-h equivalent is scaled from the hours that hold a
           value, and the daily total is replaced from the hourly curve only when all 24 hours are present; a part day (the first and last
           day of a request, trimmed past hours) keeps the provider's day total, scaled by the same mapping ratio */
        for (const [d, ks] of byDay) { const tot = ks.reduce((s0, k) => s0 + (P[k] || 0), 0), nv = ks.filter((k) => P[k] != null).length; dayR[d] = { n: nv, mapped: false }; const tv = ks.map((k) => T[k]).filter((v) => v != null); const tm = tv.length ? tv.reduce((s0, v) => s0 + v, 0) / tv.length : null;
          const m = +d.slice(5, 7); if (tot > 0 && tm == null) noT++; if (!(tot > 0) || tm == null || tm < ((Q.domain && Q.domain.liquidMinDailyMeanC) || 3)) { dayC[d] = tot; dayW[d] = tot; continue; } mapped++;
          const scale = tot * 24 / nv; const yc = map(m, scale) * nv / 24, yw = tail(m, scale) * nv / 24; dayC[d] = yc; dayW[d] = yw; dayR[d] = { n: nv, mapped: true, m };
          for (const k of ks) { if (P[k] == null) continue; cor[k] = Math.round(P[k] * yc / tot * 100) / 100; warn[k] = Math.round(P[k] * yw / tot * 100) / 100; } }
        H.precipitation_corrected = cor;
        /* a part day: the provider's day total is already the 24-h amount the mapping was fitted on, so it is mapped directly */
        const dayTot = (D0, fn) => (t, i) => { const k = String(t).slice(0, 10), v = D0[k], R = dayR[k], p = Dd.precipitation_sum[i]; return v == null ? p : (R && R.n < 24) ? (p == null || !R.mapped ? p : Math.round(fn(R.m, p) * 10) / 10) : Math.round(v * 10) / 10; };
        const Dd = loc.daily; if (Dd && Array.isArray(Dd.time) && Array.isArray(Dd.precipitation_sum)) Dd.precipitation_sum_corrected = Dd.time.map(dayTot(dayC, map));
        if (live) { H.precipitation_raw = P.slice(); H.precipitation = warn;
          if (Dd && Array.isArray(Dd.time) && Array.isArray(Dd.precipitation_sum)) { Dd.precipitation_sum_raw = Dd.precipitation_sum.slice(); Dd.precipitation_sum = Dd.time.map(dayTot(dayW, tail)); } }
        /* v91.17.147 · audit data F3 · 'applied' only when a wet day was actually mapped; a wet day without temperature is said so */
        loc.agn_rainqm = { applied: mapped > 0, daysMapped: mapped, version: Q.version, mode: live ? 'live' : 'shadow', liveFrom: Q.liveFrom, ...(noT ? { why: noT + ' wet day(s) left unmapped: no temperature in the request' } : {}) }; q = true;
      } } } catch (err) { loc.agn_rainqm = { applied: false, error: String(err.message || err) }; }
    /* v91.17.147 · plains and coast, monsoon months (Jun-Sep): the displayed daily rain amount is quantile-mapped onto the synoptic
       gauges (data/rain-qm-plains.json). Station left out, 28 stations, Jun-Oct 2026: heavy-day (>= 10 mm) detection 0.27 -> 0.42,
       critical success 0.20 -> 0.27, wet days 551 -> 275 against 284 observed; the daily MAE rises 1.90 -> 2.36 mm (the spread of
       daily totals is restored). Display only (precipitation_corrected); the warnings keep the provider's rain. NIGRAAN_RAINQM=0 off. */
    try { if (!q && process.env.NIGRAAN_RAINQM !== '0' && H && Array.isArray(H.precipitation) && Array.isArray(H.time) && mosApi && mosApi.zoneOfPoint) {
      const zz = mosApi.zoneOfPoint(lat, lon, loc.elevation != null ? loc.elevation : null);
      const Q2 = rainQmPlains(); if (Q2 && (zz === 'plains' || zz === 'coast') && !(loc.elevation > Q2.domain.maxElevM)) {
        const ip = (x, xs, ys) => { if (x <= xs[0]) return ys[0] * (xs[0] > 0 ? x / xs[0] : 0); for (let i = 1; i < xs.length; i++) if (x <= xs[i]) { const w = xs[i] > xs[i - 1] ? (x - xs[i - 1]) / (xs[i] - xs[i - 1]) : 1; return ys[i - 1] + w * (ys[i] - ys[i - 1]); } return x * ys[ys.length - 1] / Math.max(xs[xs.length - 1], 1e-6); };
        const P = H.precipitation, byDay = new Map(); H.time.forEach((t, i) => { const dd = labelDayEnding(t); (byDay.get(dd) || byDay.set(dd, []).get(dd)).push(i); });   /* v283.28 S2 */
        const cor = P.slice(), dayC = {}; let touched = 0;
        for (const [dd, ks] of byDay) { const m = +dd.slice(5, 7); const tot = ks.reduce((s0, k) => s0 + (P[k] || 0), 0); if (!Q2.domain.months.includes(m) || !(tot > 0) || ks.length < 24 || ks.some((k) => P[k] == null)) continue;   /* v91.17.213 · an unmapped day keeps the provider's day total (a part day's hourly sum is not the day's rain) */   /* v91.17.147 · audit F10 · whole days only: a part day or a missing hour is not mapped (the fit is on 24 h totals; the 5 h shift between the gauges' UTC day and the response's day leaves the distribution of 24 h totals unchanged) */
          const y = ip(tot, Q2.mq, Q2.oq); dayC[dd] = y; touched++; for (const k of ks) if (P[k] != null) cor[k] = Math.round(P[k] * y / tot * 100) / 100; }
        if (touched) { H.precipitation_corrected = cor; const Dd = loc.daily; if (Dd && Array.isArray(Dd.time) && Array.isArray(Dd.precipitation_sum)) Dd.precipitation_sum_corrected = Dd.time.map((t, i) => { const v = dayC[String(t).slice(0, 10)]; return v == null ? Dd.precipitation_sum[i] : Math.round(v * 10) / 10; });
          loc.agn_rainqm = { applied: true, version: Q2.version, mode: 'display', zone: zz }; q = true; } } } } catch (_) {}
    let w = false;   /* 28 Oct 2026 · the approved IFS wind on its IFS-basis hours, and the provenance block (ifsretrain.mjs; nothing without an approved set) */
    try { if (app.ifsRetrain && loc.__ifsr) { w = app.ifsRetrain.applyWind(loc); app.ifsRetrain.note(loc); } } catch (_) {}
    return a || b || c || d || e || q || w || dq;
  }
  let RQP = null, RQPAt = 0;
  function rainQmPlains() { if (RQP !== null && Date.now() - RQPAt < 600000) return RQP || null; RQPAt = Date.now(); try { const f = join(app.dataDir || join(process.cwd(), 'data'), 'rain-qm-plains.json'); RQP = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : false; } catch (_) { RQP = false; } return RQP || null; }
  function correctChain(loc, lat, lon, nowMs = Date.now(), windUnit = 'kmh') {
    if (!enabled() || !loc) return false;
    /* In the northern mountains the ERA5-trained correction is the wrong reference:
       measured against 44 stations it is 1.5 C further out than the raw forecast. The
       station-trained correction takes over inside its own domain and the ERA5 one is
       not applied there at all, so the two never stack. */
    const mos = mosFor(lat, lon, loc);
    const zcal = mos ? null : zoneCalibration(loc, lat, lon, windUnit);   /* v91.17.71 · station calibration on the zone basis (v91.17.73: + the AI local correction) */
    if (zcal && zcal.natOff) { try { Object.defineProperty(loc, '__scNatOff', { value: true, enumerable: false, configurable: true }); } catch (_) {} }   /* v91.17.139 */
    /* v91.17.23 · P4-1 · THE ERA5 HOUR-OF-DAY CORRECTION IS OFF BY DEFAULT. Its own ledger
       (data/station-verification.json) scores the served forecast worse than the raw one at
       the airport thermometers (median RMSE 1.84 vs 1.71 C), and its reference is reanalysis,
       not an observation. NIGRAAN_ERA5_BIAS=1 turns it back on. */
    const u = (mos || zcal || process.env.NIGRAAN_ERA5_BIAS !== '1') ? null : nearest(lat, lon);
    const uGuard = mos ? nearest(lat, lon) : null;   /* v91.17.68 · the unit whose station guard applies to the MOS branch (B7) */
    const _hasDaily = !!(loc.daily && Array.isArray(loc.daily.time));
    /* v91.17.64 · the fleet urban term: at a built cell in Islamabad-Rawalpindi or Karachi the served temperature carries
       the fleet-measured season × hour residual (see fleethistory.mjs). Whether the airport correction is on this point
       decides which of the two tables applies; that is a location-level fact, read once. */
    const FH = app.fleetHistory && app.fleetHistory.ready() ? app.fleetHistory : null;
    const mosOnPoint = !!(mos && mosApi.adjust(lat, lon, mos.elevM, nowMs, 25).applied);
    /* ══ v91.17.70 · THE MACH RUNNING CORRECTION (L2) · fleet.mjs runningBias ═══════════════════════════════════════
       At a point within reach of a trusted MACH station the served temperature (and dew point, where that station's
       humidity is trusted) carries the station's daily-updated bias against the served basis. It replaces the static
       fleet urban term there (the running bias already contains the local urban effect the station measures), and it
       never stacks with the internal-reference station tables. */
    const elevPt = loc.elevation != null ? loc.elevation : null;
    const FL = (!(loc && loc.__noLive) && !mos && !zcal && app.fleet && app.fleet.runningBias) ? app.fleet : null;   /* v91.17.108 · __nolive: no live MACH term (historical replays) */
    const l2Probe = FL ? FL.runningBias(lat, lon, elevPt, nowMs) : null; const l2On = !!(l2Probe && l2Probe.applied);
    let l2Hours = 0, l2Sum = 0;
    const l2At = (tMs) => { if (!l2On) return null; const r = FL.runningBias(lat, lon, elevPt, tMs); return r.applied ? r : null; };
    const l2T = !!(l2On && l2Probe.temperature);
    const urbanProbe = (FH && !l2T && !zcal) ? FH.urbanTerm(lat, lon, nowMs, mosOnPoint) : null; const urbanOn = !!(urbanProbe && urbanProbe.applied);
    let urbanHours = 0, urbanSum = 0;
    const urbanAt = (tMs, mosThisHour) => { if (!urbanOn) return 0; const t = FH.urbanTerm(lat, lon, tMs, !!mosThisHour); if (!t.applied) return 0; urbanHours++; urbanSum += t.termC; return t.termC; };   /* the table is chosen per hour: the synop entry may apply in March and not in September */
    const _hasHourlyT = !!(loc.hourly && Array.isArray(loc.hourly.time) && Array.isArray(loc.hourly.temperature_2m));
    /* v91.17.73 · plains: the AI local correction alone, where no station-measured term (running correction, urban term) applies */
    const aic = (!mos && !zcal && !l2On && !urbanOn && !u) ? aiOnly(loc, lat, lon, windUnit) : null;
    let aiHours = 0, aiSum = 0;
    if (!u && !mos && !_hasDaily && !urbanOn && !l2On && !zcal && !aic) { basisOf(loc, lat, lon); return false; }
    /* v91.17.23 · P4-1 · THE MOUNTAIN CORRECTION IS DAYTIME ONLY. Measured on an independent
       network (PMD synop via NOAA GSOD, Feb 2024 - Aug 2025, a period before the table's
       training window): at the valley stations it improves Tmax (MAE 3.67 -> 3.24 C) but
       worsens Tmin (2.86 -> 4.05 C; Gilgit bias +3.9 -> +6.0 C) and lowers frost detection
       from 0.33 to 0.21. It is applied to the dawn and day parts (03-14 UTC, 08-19 PKT) only;
       night and dusk hours, and so the daily minimum, are left uncorrected.
       NIGRAAN_MOS_NIGHT=1 restores the old behaviour. */
    /* weight by UTC hour, tapered at both ends so the served curve has no step where the
       correction switches off (a hard cut produced a 4 C drop between 14 and 15 UTC) */
    const _MOS_W = [0, 0, 0.25, 0.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 0.25, 0, 0, 0, 0, 0, 0, 0, 0];
    /* ══ v91.17.59 · THE NIGHT RULE IS REVERSED: THE CORRECTION NOW APPLIES AT ALL HOURS ═══════════════════════
       v91.17.23 switched night off on one test (GSOD daily minima, Gilgit Tmin bias +3.9 -> +6.0 C). Two independent
       records now say the opposite for the same stations and the same year: NOAA ISD-Lite hourly at the PMD synop
       sites (Jan-Aug 2025: raw forecast colder than observed at every hour, Gilgit 21 UTC -2.7 C, Skardu Tmin -4.7)
       and the valley AWS lake (Sep 2025 - Aug 2026, 5,247 station-days, 14-day-block hold-out): daily minimum bias
       raw -5.87 C / MAE 6.09, daytime-only -5.82 / 6.03, ALL HOURS -1.01 / 2.40; frost false-alarm ratio 0.26 -> 0.12
       at POD 0.95; Tmax unchanged (1.96 vs 1.99). The v23 GSOD comparison could not be reproduced against ISD-Lite for
       the same station and window (GSOD Gilgit Tmin +3.9 vs ISD-Lite -1.8) and is treated as a scoring fault.
       NIGRAAN_MOS_NIGHT=0 restores the daytime-only taper. */
    const _mosW = (tMs) => (process.env.NIGRAAN_MOS_NIGHT === '0') ? _MOS_W[new Date(tMs).getUTCHours()] : 1;
    const _mosPartOk = (tMs) => _mosW(tMs) > 0;
    const off = (loc.utc_offset_seconds || 0) * 1000;
    const leadFor = (tMs) => { const h = (tMs - nowMs) / 3600e3; return h <= 36 ? 24 : h <= 60 ? 48 : 72; };
    let mlHours = 0, zcHours = 0, zcSum = 0;
    const biasAt = (tMs, tModel = null, feat = null) => {
      /* v91.17.64 · served = value − biasAt, so the urban term enters as −term */
      /* v91.17.68 · the station guard applies to the MOS branch too: a correction the airport check measured as harmful is not served
         on either path (audit B7; grades() and the ensemble adjustment already treat the unit as guarded) */
      if (mos && uGuard && guarded(uGuard.unitId, leadFor(tMs))) return -urbanAt(tMs, false);
      if (mos) { const a = mosApi.adjust(lat, lon, mos.elevM, tMs, tModel, feat); if (!a.applied) return -urbanAt(tMs, false); const w = a.allHours ? 1 : _mosW(tMs); if (a.ml) mlHours++; return (w ? -a.adj * w : 0) - urbanAt(tMs, w > 0); }
      if (zcal) { const r = loc.__ifsr ? loc.__ifsr.tAt(tMs) : null; if (r != null) { loc.__ifsr.used.t++; return -r; }   /* 28 Oct 2026 · an approved IFS set replaces the calibration term on its IFS-basis hours (ifsretrain.mjs) */
        const a = zcal.adjAt(tMs); if (a) { zcHours++; zcSum += a; } return -a; }   /* v91.17.71 · served = value − biasAt */
      if (l2T) { const r = l2At(tMs); if (r && r.temperature) { l2Hours++; l2Sum += r.t; return -r.t; } return 0; }
      if (aic) { const a = aic.adjAt(tMs); if (a) { aiHours++; aiSum += a; } return -a; }   /* v91.17.73 · served = value − biasAt */
      const ub = urbanAt(tMs, false);
      if (!u) return -ub;   /* v91.17.58 · the model temperature picks the bin; v91.17.59 · a synop entry applies at all hours; the learned model where its verdict says so */
      const L = leadFor(tMs), c = u.leads[L];
      return (c && c.applied && !guarded(u.unitId, L) ? c.hourBias[new Date(tMs).getUTCHours()] : 0) - ub;
    };
    let touched = false;
    const H = loc.hourly;
    if (H && Array.isArray(H.time)) {
      const ts = H.time.map(t => Date.parse(t + 'Z') - off);
      const T2 = Array.isArray(H.temperature_2m) ? H.temperature_2m.slice() : null;   /* the model's own temperature, read before either field is changed */
      if (T2) Object.defineProperty(H, '__t0', { value: T2, enumerable: false, configurable: true });   /* v91.17.70 · for the L2 humidity pass; never serialised */
      const RH2 = Array.isArray(H.relative_humidity_2m) ? H.relative_humidity_2m.slice() : null, W2 = Array.isArray(H.wind_speed_10m) ? H.wind_speed_10m : null;
      const wk = { kmh: 1, ms: 3.6, mph: 1.609344, kn: 1.852 }[String(windUnit || 'kmh')] || 1;   /* the learned model was trained on km/h */
      const featAt = (i) => (RH2 || W2) ? { rh: RH2 ? RH2[i] : null, windKmh: W2 && W2[i] != null ? W2[i] * wk : null, modelElevM: loc.elevation } : { modelElevM: loc.elevation };
      for (const f of ['temperature_2m', 'apparent_temperature']) { const a = H[f]; if (!Array.isArray(a)) continue; for (let i = 0; i < a.length; i++) if (a[i] != null) { const b = biasAt(ts[i], T2 ? T2[i] : null, featAt(i)); if (b) { a[i] = Math.round((a[i] - b) * 10) / 10; touched = true; } } }
    }
    const C = loc.current;
    if (C && C.temperature_2m != null && C.time) { const b = biasAt(Date.parse(C.time + 'Z') - off, C.temperature_2m, { rh: C.relative_humidity_2m, windKmh: C.wind_speed_10m != null ? C.wind_speed_10m * ({ kmh: 1, ms: 3.6, mph: 1.609344, kn: 1.852 }[String(windUnit || 'kmh')] || 1) : null, modelElevM: loc.elevation }); if (b) { C.temperature_2m = Math.round((C.temperature_2m - b) * 10) / 10; touched = true; } }
    /* The plains need a different correction from the mountains: the hourly field is
       close, the daily extremes are not. Where a calibrated city is near, its monthly
       offsets are applied to the daily maximum and minimum and the hourly path is left
       alone. */
    const Dd = loc.daily;
    /* v91.17.4 · which days already carry the plains city offset. Two
       corrections of the same sign were being applied to the same array: the
       PMD city offset here, and the ERA5 hour-of-day bias in the block below,
       whose condition (u || mos) is satisfied in the plains because `nearest()`
       finds a bias record within 0.15 deg of any Lahore/Karachi/Multan tehsil.
       Karachi's tmax_offset runs +1.1 to +1.8 C by month against an ERA5 bias
       of similar magnitude and the same sign — a 1-3 C double count landing on
       the 40 C class boundary. Both the comment above and mos-table.json say
       the city offset applies INSTEAD OF, not on top of. */
    const plainsDone = { tmax: new Set(), tmin: new Set() }; try { Object.defineProperty(loc, '__dailyOnly', { value: plainsDone, enumerable: false, configurable: true }); } catch (_) {}
    if (Dd && Array.isArray(Dd.time) && mosApi && mosApi.enabled()) {
      const elev = loc.elevation != null ? loc.elevation : null;
      for (let i = 0; i < Dd.time.length; i++) {
        const pl = mosApi.adjustDaily(lat, lon, elev, String(Dd.time[i]).slice(0, 10));
        if (!pl.applied) continue;
        if (Dd.temperature_2m_max && Dd.temperature_2m_max[i] != null && pl.tmax) {
          Dd.temperature_2m_max[i] = Math.round((Dd.temperature_2m_max[i] + pl.tmax) * 10) / 10; touched = true; plainsDone.tmax.add(i);
        }
        if (Dd.temperature_2m_min && Dd.temperature_2m_min[i] != null && pl.tmin) {
          Dd.temperature_2m_min[i] = Math.round((Dd.temperature_2m_min[i] + pl.tmin) * 10) / 10; touched = true; plainsDone.tmin.add(i);
        }
        /* v91.17.4 · `touched` may already be true from the hourly pass, which
           would attach a plains-correction provenance block to a location the
           plains table never changed. Keyed on this loop's own work instead. */
        if (plainsDone.tmax.has(i) || plainsDone.tmin.has(i)) loc.agn_plains_correction = { applied: true, city: pl.city, km: pl.km,
          fields: 'daily maximum and minimum only',
          appliedTo: { tmax: plainsDone.tmax.size, tmin: plainsDone.tmin.size },
          supersedes: 'the ERA5 hour-of-day bias is NOT also applied to these fields on these days',
          method: (internalNames() ? 'monthly offset against the PMD-reported daily extremes' : 'monthly offset against the reference daily extremes (internal calibration)') + '; the 45 C tail is not calibrated' };   /* v91.17.70 · label only */
      }
    }
    /* ══ v91.17.70 · ONE PATH: THE DAY CARD IS THE SERVED HOURLY CURVE'S OWN MAXIMUM AND MINIMUM ═════════════════════
       Measured by the meteorologist seat (W2/T4): the day card's Tmax was corrected at one hour with a different lookup
       from the hourly curve drawn beside it, and ran 0.9 C colder than the curve's own maximum. Where this response
       carries the full hourly temperature for a day (same timezone, so the same local day), the daily maximum, minimum
       and mean ARE the curve's; the at(i, 9) / at(i, 0) path below remains only for days the hourly field does not
       cover, and then samples the same biasAt at the Pakistan afternoon and dawn hours. */
    const curveDone = { tmax: new Set(), tmin: new Set(), tmean: new Set() };
    if (Dd && Array.isArray(Dd.time) && _hasHourlyT && !plainsDone.tmax.size && !plainsDone.tmin.size) {
      const byDay = new Map(); H.time.forEach((t, k) => { const d = String(t).slice(0, 10); const a = byDay.get(d) || byDay.set(d, []).get(d); if (H.temperature_2m[k] != null) a.push(H.temperature_2m[k]); });
      const hoursIn = new Map(); H.time.forEach(t => { const d = String(t).slice(0, 10); hoursIn.set(d, (hoursIn.get(d) || 0) + 1); });
      for (let i = 0; i < Dd.time.length; i++) {
        const d = String(Dd.time[i]).slice(0, 10), v = byDay.get(d);
        if (!v || v.length < 24 || v.length !== hoursIn.get(d)) continue;
        const mx = Math.round(Math.max(...v) * 10) / 10, mn = Math.round(Math.min(...v) * 10) / 10, me = Math.round(v.reduce((a, x) => a + x, 0) / v.length * 10) / 10;
        if (Dd.temperature_2m_max && Dd.temperature_2m_max[i] != null) { if (Dd.temperature_2m_max[i] !== mx) touched = true; Dd.temperature_2m_max[i] = mx; curveDone.tmax.add(i); }
        if (Dd.temperature_2m_min && Dd.temperature_2m_min[i] != null) { if (Dd.temperature_2m_min[i] !== mn) touched = true; Dd.temperature_2m_min[i] = mn; curveDone.tmin.add(i); }
        if (Dd.temperature_2m_mean && Dd.temperature_2m_mean[i] != null) { Dd.temperature_2m_mean[i] = me; curveDone.tmean.add(i); }
      }
      if (curveDone.tmax.size || curveDone.tmin.size) loc.agn_daily_basis = { fromHourlyCurve: true, days: Math.max(curveDone.tmax.size, curveDone.tmin.size), rule: 'daily max / min / mean = the served hourly curve\'s own, day by day (local days of this response)' };
    }
    if (Dd && Array.isArray(Dd.time) && (u || mos || l2On || urbanOn || zcal || aic)) {
      /* ══ v91.17.4 · THE BIAS WAS SAMPLED FIVE HOURS OFF THE PEAK ═════════
         `biasAt` indexes hourBias by TRUE UTC hour, and 9 and 0 are the right
         UTC hours: 09 UTC is 14:00 PKT (when Tmax occurs) and 00 UTC is 05:00
         PKT (when Tmin occurs). Subtracting `off` here shifted both back by the
         local offset, so with timezone=auto — which the dashboard sends at 27
         call sites — Tmax was corrected with the 09:00 PKT bias and Tmin with
         the midnight bias, both on the wrong side of the diurnal error curve.
         With timezone=GMT (off = 0) the constants were already right, which is
         why every internal job was unaffected and only client traffic was hit.

         The daily MEAN is shift-invariant over 24 hours, so `mean` is unchanged
         by this either way; it is rewritten only to share the corrected `at`. */
      const at = (i, utcH) => { if (zcal || aic) { const c = (zcal || aic).dayAdj(Dd.time[i]); return c ? -(utcH === 9 ? c.tx : utcH === 0 ? c.tn : c.tn + (c.tx - c.tn) * (utcH <= 9 ? utcH / 9 : Math.max(0, (24 - utcH) / 15))) : 0; } const t = Date.parse(Dd.time[i] + 'T00:00Z') + utcH * 3600e3; return biasAt(t); };   /* v91.17.71 · a day the hourly curve does not cover takes the day's own Tmax / Tmin offset */
      const mean = (i) => { let s = 0, n = 0; for (let h = 0; h < 24; h++) { s += at(i, h); n++; } return s / n; };
      for (let i = 0; i < Dd.time.length; i++) {
        /* A day that already took the PMD city offset does not also take the
           ERA5 hour-of-day bias. Skipped per FIELD, not per day, because the
           city table can carry a tmax offset and no tmin offset. */
        if (Dd.temperature_2m_max && Dd.temperature_2m_max[i] != null && !plainsDone.tmax.has(i) && !curveDone.tmax.has(i)) { const b = at(i, 9); if (b) { Dd.temperature_2m_max[i] = Math.round((Dd.temperature_2m_max[i] - b) * 10) / 10; touched = true; } }
        if (Dd.temperature_2m_min && Dd.temperature_2m_min[i] != null && !plainsDone.tmin.has(i) && !curveDone.tmin.has(i)) { const b = at(i, 0); if (b) { Dd.temperature_2m_min[i] = Math.round((Dd.temperature_2m_min[i] - b) * 10) / 10; touched = true; } }
        if (Dd.temperature_2m_mean && Dd.temperature_2m_mean[i] != null && !curveDone.tmean.has(i)) { const b = mean(i); if (b) { Dd.temperature_2m_mean[i] = Math.round((Dd.temperature_2m_mean[i] - b) * 10) / 10; touched = true; } }
        /* v91.17.70 · the daily apparent-temperature extremes follow the same shift as the temperature ones */
        if (!mos && Dd.apparent_temperature_max && Dd.apparent_temperature_max[i] != null) { const b = at(i, 9); if (b) { Dd.apparent_temperature_max[i] = Math.round((Dd.apparent_temperature_max[i] - b) * 10) / 10; touched = true; } }
        if (!mos && Dd.apparent_temperature_min && Dd.apparent_temperature_min[i] != null) { const b = at(i, 0); if (b) { Dd.apparent_temperature_min[i] = Math.round((Dd.apparent_temperature_min[i] - b) * 10) / 10; touched = true; } }
      }
    }
    /* Humidity travels with temperature. Correcting one without the other leaves wet
       bulb biased (+0.99 C measured); correcting both gives +0.24 C. Dew point is
       recomputed from the corrected pair rather than shifted on its own. */
    if (mos && H && Array.isArray(H.time)) {
      const rh = H.relative_humidity_2m, dp = H.dew_point_2m, ta = H.temperature_2m;
      if (Array.isArray(rh)) {
        const ts = H.time.map(t => Date.parse(t + 'Z') - off);
        for (let i = 0; i < rh.length; i++) {
          if (rh[i] == null) continue;
          if (!_mosPartOk(ts[i])) continue;   /* humidity follows temperature: daytime only */
          const a = mosApi.adjustRh(lat, lon, mos.elevM, ts[i]);
          if (!a.applied || !a.adj) continue;
          rh[i] = Math.round(Math.max(5, Math.min(100, rh[i] + a.adj * _mosW(ts[i]))) * 10) / 10;
          touched = true;
          if (Array.isArray(dp) && Array.isArray(ta) && dp[i] != null && ta[i] != null) {
            /* Magnus, so the three stay physically consistent */
            dp[i] = r1p(dewPointC(ta[i], rh[i]));   /* v91.17.128 · the one module */
          }
        }
      }
    }
    /* v91.17.70 · L2 humidity: the dew point takes the MACH station's dew-point bias (where its humidity sensor is trusted);
       relative humidity and wet bulb are recomputed from the corrected temperature and dew point, so the three stay one
       physical state. Where only temperature was corrected, dew point is kept and RH follows the new temperature. */
    if (l2On && H && Array.isArray(H.time) && Array.isArray(H.temperature_2m)) {
      const ts = H.time.map(t => Date.parse(t + 'Z') - off); const ta = H.temperature_2m, rh = H.relative_humidity_2m, dp = H.dew_point_2m, wb = H.wet_bulb_temperature_2m;
      const T0 = H.__t0 || null;
      const es = esOf, tdOf = tdOfRh;   /* v91.17.128 · the one module */
      for (let i = 0; i < ta.length; i++) {
        if (ta[i] == null) continue;
        const r = l2At(ts[i]); if (!r) continue;
        const tRaw = T0 ? T0[i] : ta[i] - r.t;
        let td = Array.isArray(dp) && dp[i] != null ? dp[i] : (Array.isArray(rh) && rh[i] != null && tRaw != null ? tdOf(tRaw, rh[i]) : null);
        if (td == null) continue;
        if (r.td != null) td = td + r.td;
        td = Math.min(td, ta[i]);
        if (Array.isArray(dp) && dp[i] != null) dp[i] = Math.round(td * 10) / 10;
        const rhN = Math.max(1, Math.min(100, 100 * es(td) / es(ta[i])));
        if (Array.isArray(rh) && rh[i] != null) rh[i] = Math.round(rhN * 10) / 10;
        if (Array.isArray(wb) && wb[i] != null) wb[i] = wetBulb(ta[i], rhN, loc && loc.elevation);
        touched = true;
      }
    }
    /* v91.17.71 · humidity travels with the calibrated temperature. Mountain: the dew point takes the band x month x part
       offset of data/temp-correction.json (dewPoint.design tdTable; leave-one-station-out RH MAE 15.4 -> 12.1 %, dew point
       3.55 -> 2.91 C [measured, internal]); hills: the model dew point is kept. Relative humidity and wet bulb are
       recomputed from the corrected pair, so the three stay one physical state. */
    let zcDew = 0;
    const hc = zcal || aic;   /* v91.17.73 · the plains AI path: dew point kept, relative humidity and wet bulb follow the corrected temperature */
    if (hc && H && Array.isArray(H.time) && Array.isArray(H.temperature_2m)) {
      const ts = H.time.map(t => Date.parse(t + 'Z') - off); const ta = H.temperature_2m, rh = H.relative_humidity_2m, dp = H.dew_point_2m, wb = H.wet_bulb_temperature_2m;
      const T0 = H.__t0 || null;
      for (let i = 0; i < ta.length; i++) {
        if (ta[i] == null) continue;
        const tRaw = T0 ? T0[i] : ta[i];
        let td = Array.isArray(dp) && dp[i] != null ? dp[i] : (Array.isArray(rh) && rh[i] != null && tRaw != null ? tdOfRh(tRaw, rh[i]) : null);
        if (td == null) continue;
        const o = zcal ? mosApi.dewOffset(zcal.zone, zcal.elevM, ts[i]) : null; if (o != null) { td += o; zcDew++; }
        td = Math.min(td, ta[i]);
        if (Array.isArray(dp) && dp[i] != null) dp[i] = Math.round(td * 10) / 10;
        const rhN = rhOfTd(ta[i], td);
        if (Array.isArray(rh) && rh[i] != null) rh[i] = Math.round(rhN * 10) / 10;
        if (Array.isArray(wb) && wb[i] != null) wb[i] = wetBulb(ta[i], rhN, loc && loc.elevation);
        touched = true;
      }
      /* the daily humidity fields of a day the hourly curve covers are the curve's own (the T4 rule, extended) */
      if (Dd && Array.isArray(Dd.time)) {
        const byDay = new Map(); H.time.forEach((t, k) => { const d = String(t).slice(0, 10); (byDay.get(d) || byDay.set(d, []).get(d)).push(k); });
        const fam = [['dew_point_2m', dp], ['relative_humidity_2m', rh], ['wet_bulb_temperature_2m', wb], ['apparent_temperature', H.apparent_temperature]];
        for (let i = 0; i < Dd.time.length; i++) {
          const ks = byDay.get(String(Dd.time[i]).slice(0, 10)); if (!ks || ks.length < 24) continue;
          for (const [f, arr] of fam) { if (!Array.isArray(arr)) continue; const v = ks.map(k => arr[k]).filter(x => x != null); if (v.length < 24) continue;
            if (Dd[f + '_max'] && Dd[f + '_max'][i] != null) Dd[f + '_max'][i] = Math.round(Math.max(...v) * 10) / 10;
            if (Dd[f + '_min'] && Dd[f + '_min'][i] != null) Dd[f + '_min'][i] = Math.round(Math.min(...v) * 10) / 10;
            if (Dd[f + '_mean'] && Dd[f + '_mean'][i] != null) Dd[f + '_mean'][i] = Math.round(v.reduce((a, x) => a + x, 0) / v.length * 10) / 10; }
        }
      }
      const Cc = loc.current;
      if (Cc && Cc.time && Cc.temperature_2m != null) {
        const tC = Date.parse(Cc.time + 'Z') - off; const a = hc.adjAt(tC);
        const tCor = Cc.temperature_2m, t0 = Cc.temperature_2m - a;   /* the current temperature was calibrated above; t0 is the model's own */
        let td = Cc.dew_point_2m != null ? Cc.dew_point_2m : (Cc.relative_humidity_2m != null ? tdOfRh(t0, Cc.relative_humidity_2m) : null);
        if (td != null) { const o = zcal ? mosApi.dewOffset(zcal.zone, zcal.elevM, tC) : null; if (o != null) td += o; td = Math.min(td, tCor);
          if (Cc.dew_point_2m != null) Cc.dew_point_2m = Math.round(td * 10) / 10;
          if (Cc.relative_humidity_2m != null) Cc.relative_humidity_2m = Math.round(rhOfTd(tCor, td) * 10) / 10;
          if (Cc.apparent_temperature != null && a) Cc.apparent_temperature = Math.round((Cc.apparent_temperature + a) * 10) / 10; }
      }
      const M15 = loc.minutely_15;
      if (M15 && Array.isArray(M15.time)) { const t15 = M15.time.map(t => Date.parse(t + 'Z') - off);
        for (const f of ['temperature_2m', 'apparent_temperature']) { const arr = M15[f]; if (!Array.isArray(arr)) continue; for (let i = 0; i < arr.length; i++) if (arr[i] != null) { const a = hc.adjAt(t15[i]); if (a) arr[i] = Math.round((arr[i] + a) * 10) / 10; } } }
    }
    if (H) delete H.__t0;
    if (touched && l2On) loc.agn_bias_correction = { applied: true, reference: 'AGN MACH fleet, running correction', stations: l2Probe.stations, dewStations: l2Probe.dewStations || [], hours: l2Hours, meanTermC: l2Hours ? +(l2Sum / l2Hours).toFixed(2) : null, dewPoint: l2Probe.td != null ? 'corrected from the same stations; relative humidity and wet bulb recomputed' : 'dew point kept; relative humidity follows the corrected temperature', version: l2Probe.version, method: 'daily-updated bias of the served model against trusted MACH stations (data/model-zone.json l2Rule), by 3-hour block of the Pakistan day: temperature at a station\'s own site, dew point as the city median' };
    const aiUsed = zcal ? zcal.ai : (aic && touched ? aic.ai : null);
    basisOf(loc, lat, lon, l2On ? 'L0+L2' : (mos ? 'internal-reference' : (zcal && touched ? (aiUsed ? 'L0+SC+AI' : 'L0+SC') : (aic && touched ? 'L0+AI' : 'L0'))));
    if (aiUsed && touched && loc.agn_temperature_basis) loc.agn_temperature_basis.aiLocal = aiBlock(aiUsed);
    if (aic && touched && aiUsed) {
      const b = aiBlock(aiUsed);
      loc.agn_bias_correction = { applied: true, label: b.label, reference: b.reference, tier: 'B', hours: aiHours, meanTermC: aiHours ? +(aiSum / aiHours).toFixed(2) : null, version: b.version,
        dewPoint: 'dew point kept; relative humidity and wet bulb follow the corrected temperature', method: b.method };
    }
    if (zcal && touched) {
      /* v91.17.71 · tier B (station-calibrated), credited generically; the site identity and distance only under internalNames() */
      const calib = { applied: true, label: label('calibration'), source: zcal.credit, tier: 'B', via: zcal.via, version: mosApi.version || null, hours: zcHours, meanTermC: zcHours ? +(zcSum / zcHours).toFixed(2) : null,
                      dewPoint: zcal.zone === 'mountain' ? 'dew point calibrated in the same pass; relative humidity and wet bulb recomputed' : 'dew point kept; relative humidity and wet bulb follow the calibrated temperature',
                      ...(internalNames() ? { internal: { siteId: zcal.siteId, siteKm: zcal.siteKm, table: 'data/temp-correction.json', dewHours: zcDew } } : {}) };
      if (zcal.ai) calib.aiLocal = aiBlock(zcal.ai);   /* v91.17.73 */
      try { const tH = Math.floor(Date.now() / 3600e3) * 3600e3; const v = zcal.adjAt(tH); if (Number.isFinite(v)) calib.nowTermC = Math.round(v * 10) / 10; } catch (_) {}   /* v91.17.139 · the step the point engine shows */
      if (loc.agn_temperature_basis) loc.agn_temperature_basis.calibration = calib;
      loc.agn_bias_correction = { applied: true, reference: zcal.credit, tier: 'B', label: label('calibration'), hours: zcHours, meanTermC: calib.meanTermC, dewPoint: calib.dewPoint, version: calib.version,
        method: 'station calibration of the served zone basis: day-1 daily maximum and minimum offsets by site (or height band) and month, applied as a diurnal stretch of the hourly curve; the day card is the corrected curve\'s own maximum and minimum' + (zcal.ai ? '; with the AI local correction (terrain and land surface) added to the day\'s offsets' : ''), ...(zcal.ai ? { aiLocal: calib.aiLocal } : {}) };
    }
    if (touched && mos) loc.agn_bias_correction = { applied: true, learnedModelHours: mlHours, hours: (process.env.NIGRAAN_MOS_NIGHT === '0' ? 'daytime only: full weight 04-13 UTC, tapered at 02-03 and 14-15 UTC (NIGRAAN_MOS_NIGHT=0)' : 'all hours'), /* v91.17.70 · labels only: the network is an internal reference (option 2) and the skill figures live in the internal sheet, not in a string (seat_ai_ml W3) */ reference: internalNames() ? 'PMD mountain AWS network (GB / Chitral) and, outside it, the PMD synop network via NOAA ISD-Lite' : 'station calibration (internal reference)', domain: internalNames() ? 'northern mountains, plus 30 km around each synop station' : 'northern mountains and the calibrated plains points', method: 'station or height-band mean error by month, part of day and model-temperature bin' + (internalNames() ? '; skill figures: internal skill sheet temperature_mountain' : ''), internalDiagnostic: true, humidity: (function(){ try { const m = mosApi && mosApi.status && mosApi.status(); const h = m && m.measured && m.measured.humidity; return 'corrected in the same pass (' + (h && h.raw_bias_pct != null ? ('+' + h.raw_bias_pct + '% -> +' + h.corrected_bias_pct + '%, MAE ' + h.raw_mae_pct + ' -> ' + h.corrected_mae_pct + '%') : 'figures from the MOS table') + '); dew point recomputed from the corrected pair'; } catch { return 'corrected in the same pass (figures from the MOS table); dew point recomputed from the corrected pair'; } })() };
    else if (touched && u) loc.agn_bias_correction = { applied: true, unit: u.key, reference: 'ECMWF IFS analysis (models=ecmwf_ifs)', method: 'hour-of-day mean error per lead, learned on a training month, kept only where it lowered RMSE on the following month' };
    if (touched && urbanOn && urbanHours) {
      if (!loc.agn_bias_correction) loc.agn_bias_correction = { applied: true, reference: 'AGN MACH fleet (Tier B)', method: 'fleet urban residual only' };
      loc.agn_bias_correction.urban = { applied: true, city: urbanProbe.cityName, airport: urbanProbe.city, stations: urbanProbe.stations, table: urbanProbe.source, scale: urbanProbe.scale, lcz: urbanProbe.lcz, hours: urbanHours, meanTermC: +(urbanSum / urbanHours).toFixed(2), termNowC: urbanProbe.termC, tier: 'B', holdout: urbanProbe.holdout, method: 'season × local-hour median residual of the MACH fleet at built-up points (leave-one-station-out validated), scaled by the cell\'s heat-island potential within [0.5, 1.2]' };
    }
    return touched;
  }
  /* for a proxied /v1/forecast response body */
  /* v91.17.132 · SPEED (CEO 3 Oct). A many-place request (the map and district layers ask for up to a few hundred places) ran the
     whole correction in one block: 5-30 s in which the server answered nothing else. The work is now done place by place
     (correctSteps) and the server's request path (correctResponseAsync) lets other requests through every few places. Same
     results; correctResponse (all at once) stays for jobs and tests. */
  function correctResponse(...a) { const g = correctSteps(...a); let r = g.next(); while (!r.done) r = g.next(); return r.value; }
  /* v91.17.144 · B5 · the slices were per request: twenty corrections in flight each ran 40 ms in the same turn of the event loop,
     so nothing else was answered for 0.8-2 s (measured with two Customize pages and NIGRAAN loading at once). All corrections now
     share ONE round-robin queue that runs a single slice of about 25 ms per turn of the loop; other requests are answered between
     slices. The results are unchanged (the same generator, stepped in the same order within each request). */
  const RR = { q: [], running: false, fgRun: 0 };
  /* v91.17.270 · OPS A13 · BACKGROUND JOBS GIVE WAY. A job marked background (the national hourly run's places) takes a slice only when
     no customer job is waiting, or after FG_TURNS customer slices in a row (so the run always moves on: at least one slice in
     FG_TURNS + 1). Before, the queue was strictly round robin: a customer correction waited behind one national slice per round
     (up to 25 ms); with several national places in flight it would wait behind each of them. The order of the customer jobs among
     themselves is unchanged (the first waiting one), and so are the results (each job is the same generator, stepped in the same order). */
  const FG_TURNS = 4, BG_SLICE_MS = 10;
  function nextJob() {
    const q = RR.q; if (!q.length) return null;
    if (q[0].bg) { const i = q.findIndex((j) => !j.bg);
      if (i > 0 && RR.fgRun < FG_TURNS) { RR.fgRun++; return q.splice(i, 1)[0]; } }
    const j = q.shift(); RR.fgRun = j.bg ? 0 : (q.some((x) => x.bg) ? RR.fgRun + 1 : 0); return j;
  }
  /* v91.17.231 · a step may hand back a promise (a batch of trees evaluating in the worker pool): the job leaves the queue until the batch
     returns, and the other jobs (and every other request) go on meanwhile */
  const thenable = (v) => v && typeof v.then === 'function';
  function park(job, pr) { pr.then((v) => { job.send = v; RR.q.push(job); if (!RR.running) { RR.running = true; setImmediate(pump); } }); }
  function pump() { const job = nextJob(); if (!job) { RR.running = false; return; }
    const t = Date.now(); setBackground(job.bg); try { let r = job.g.next(job.send); job.send = undefined;
      let from = job.at || 'start';
      const budget = job.bg ? BG_SLICE_MS : 25;   /* v91.17.270 · OPS A13 · a background slice is shorter: a request arriving meanwhile waits less */
      while (!r.done && !thenable(r.value) && Date.now() - t < budget) { from = r.value; r = job.g.next(); }
      setBackground(false);
      job.at = r.done ? 'end' : (thenable(r.value) ? 'pool' : r.value);
      if (!r.done && thenable(r.value)) { park(job, r.value); if (RR.q.length) setImmediate(pump); else RR.running = false; return; }
      /* v91.17.155 · NIGRAAN_STEPLOG=1 names a correction slice that held the server for more than 300 ms */
      if (process.env.NIGRAAN_STEPLOG === '1' && Date.now() - t > 300) console.log('  correction slice ' + (Date.now() - t) + ' ms: ' + job.tag + ' (from ' + from + ' to ' + job.at + ')'); if (r.done) job.ok(r.value); else RR.q.push(job); } catch (e) { setBackground(false); job.no(e); }
    if (RR.q.length) setImmediate(pump); else RR.running = false; }
  /* v91.17.231 · one location's served chain through the same queue (the fleet's station pairs): the server answers other requests while it runs */
  /* v91.17.270 · OPS A13 · q.background: the job gives way to customer jobs (nextJob above); the national run marks its places */
  function servedChainAsync(loc, la, lo, o = {}, q = {}) { return new Promise((ok, no) => { RR.q.push({ g: servedChainSteps(loc, la, lo, o, true), ok, no, tag: q.background ? 'chain 1 place (background)' : 'chain 1 place', bg: !!q.background }); if (!RR.running) { RR.running = true; setImmediate(pump); } }); }
  function correctResponseAsync(...a) { const b = a.slice(0, 10); while (b.length < 10) b.push(undefined);   /* v91.17.267 · + blendMem */ return new Promise((ok, no) => { RR.q.push({ g: correctSteps(...b, true), ok, no, tag: (a[1] && a[1].get ? String(a[1].get('latitude') || '').split(',').length + ' place(s)' : '') + ', ' + ((a[0] && a[0].length) || 0) + ' bytes', bg: !!(a[10] && a[10].bg) });   /* v283.53 C: a low-priority request (nearby list, sweep) gives way to a person's */ if (!RR.running) { RR.running = true; setImmediate(pump); } }); }
  function dailyFromCurve(loc) { try { const H = loc && loc.hourly, Dd = loc && loc.daily; if (!H || !Dd || !Array.isArray(Dd.time) || !Array.isArray(H.time) || !Array.isArray(H.temperature_2m)) return;
    const by = new Map(); H.time.forEach((t, i) => { const d = String(t).slice(0, 10); (by.get(d) || by.set(d, []).get(d)).push(H.temperature_2m[i]); });
    const r1d = (x) => Math.round(x * 10) / 10;
    Dd.time.forEach((d, i) => { const v = by.get(String(d).slice(0, 10)); if (!v || v.length < 24 || v.some((x) => x == null)) return;
      const DO = loc.__dailyOnly;   /* review F10: a daily-only offset (the plains city table) is kept, not overwritten by the curve */
      if (Array.isArray(Dd.temperature_2m_max) && Dd.temperature_2m_max[i] != null && !(DO && DO.tmax.has(i))) Dd.temperature_2m_max[i] = r1d(Math.max(...v));
      if (Array.isArray(Dd.temperature_2m_min) && Dd.temperature_2m_min[i] != null && !(DO && DO.tmin.has(i))) Dd.temperature_2m_min[i] = r1d(Math.min(...v));
      if (Array.isArray(Dd.temperature_2m_mean) && Dd.temperature_2m_mean[i] != null) Dd.temperature_2m_mean[i] = r1d(v.reduce((x, y) => x + y, 0) / v.length);
      /* v91.17.157 · audit: the daily feels-like extremes follow the final hourly curve too (they kept an earlier step's values) */
      if (Array.isArray(H.apparent_temperature)) { const a = []; H.time.forEach((t, k) => { if (String(t).slice(0, 10) === String(d).slice(0, 10)) a.push(H.apparent_temperature[k]); });
        if (a.length >= 24 && !a.some((x) => x == null)) { if (Array.isArray(Dd.apparent_temperature_max) && Dd.apparent_temperature_max[i] != null) Dd.apparent_temperature_max[i] = r1d(Math.max(...a));
          if (Array.isArray(Dd.apparent_temperature_min) && Dd.apparent_temperature_min[i] != null) Dd.apparent_temperature_min[i] = r1d(Math.min(...a)); } } }); } catch (_) {} }
  /* ══ v91.17.207 · ONE SERVED CHAIN (audit S01, phase B) ══════════════════════════════════════════════════════════════════════════
     Every consumer of a corrected forecast takes it from this one function, in this one order:
        zone basis (merge) -> static chain (correctLocation: L0 basis, station / zone calibration, national model, urban, moisture)
        -> weather MOS -> synoptic running term (live) -> MACH live layer (live) -> day card from the curve.
     Before, four places assembled the chain themselves: the page proxy (all steps), the national sweep (no weather MOS), the fleet
     pairs that the live layer's residuals are measured against (no weather MOS) and the AI's fallback (static chain only). The live
     layer therefore measured each station's residual against a number without the weather MOS and added it on top of a number with
     it: near a station the weather-MOS term was counted twice. Options: live (false for historical replays), wx (false for the weather
     MOS's own training replays), upTo (stop after a stage: the fleet pairs stop before the live layer, which is what they measure for).
     The steps taken are recorded on the response (agn_chain), so a stored record says which chain produced it. */
  const CHAIN_STAGES = ['wxmos', 'skillchoice', 'tdown', 'synop', 'live', 't2final', 'cloudt', 'dewfix'];   /* v91.17.270 · + tdown (B2/B5 downscaling; OFF unless NIGRAAN_TDOWN=1, and then only in a zone whose gate passed); v91.17.271 · + t2final (B2 v2 final correction on the served residual; OFF unless NIGRAAN_T2FINAL=1, same zone gate); v91.17.273 · + cloudt (forecast-cloud final correction; served only in a zone whose gate passed: none on 17 Oct 2026; NIGRAAN_CLOUDT=0 off) */   /* v91.17.275 · + dewfix (final dew-point offset of the served chain, data/dew-final.json; served only in a zone whose gate passed: mountain, Sep-Oct, to 72 h; NIGRAAN_DEWFIX=0 off) */
  /* v91.17.280 · FIX280-1 (live 19 Oct 03:00 PKT: Gilgit 9.7 C, 90 % range 7.2-17.7) · the national model's 90 % range is built at the
     national stage, centred on the value served THEN; the synoptic running correction (Gilgit -3 C at night), the weather MOS, the live
     stations and the final corrections moved the temperature afterwards and left the range where it was, so the night value sat at the
     bottom of a band whose top was near the day's high. Each hour's range is moved by that hour's own later change: its width and shape
     (the hour's quantile spread, conformal widening included) are unchanged; nothing is typed. */
  function recentreRange90(loc) {
    const H = loc && loc.hourly; const N = loc && loc.agn_national; if (!H || !Array.isArray(H.temperature_2m) || !Array.isArray(H.__natSv)) return false;
    const sv = H.__natSv, T = H.temperature_2m, rnd = (x) => Math.round(x * 10) / 10; let moved = 0;
    const shift = (R) => { if (!R || !Array.isArray(R.lo) || !Array.isArray(R.hi)) return;
      for (let i = 0; i < T.length && i < sv.length; i++) { if (R.lo[i] == null || R.hi[i] == null || T[i] == null || sv[i] == null) continue;
        const d = T[i] - sv[i]; if (d === 0) continue; R.lo[i] = rnd(R.lo[i] + d); R.hi[i] = rnd(R.hi[i] + d); moved++; } };
    const a = N && N.range90, b = H.agn_range90; shift(a); if (b && b !== a && !(a && b.lo === a.lo)) shift(b);
    H.__natSv = T.slice();
    /* v283 WS5 · A14 · the per-zone width, once per response (the flag travels with the hourly block) */
    try { if (process.env.NIGRAAN_RANGE90_ZONE !== '0' && !H.__z90 && Array.isArray(H.time) && mosApi && mosApi.zoneOfPoint) {
      const Z = range90Zone(); const zone = Z ? mosApi.zoneOfPoint(loc.latitude, loc.longitude, loc.elevation != null ? loc.elevation : null) : null; const cell = Z && zone && Z.zones ? Z.zones[zone] : null;
      if (cell && cell.serve === true) {
        const off = Number(loc.utc_offset_seconds) || 0, pk = (i) => new Date(Date.parse(H.time[i] + (/Z|[+-]\d\d:?\d\d$/.test(H.time[i]) ? '' : 'Z')) - (/Z|[+-]\d\d:?\d\d$/.test(H.time[i]) ? 0 : off * 1000) + 5 * 3600e3).toISOString().slice(0, 10);
        const today = Date.parse(new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10));
        const leadOf = (i) => Math.round((Date.parse(pk(i)) - today) / 864e5), monthOf = (i) => Number(pk(i).slice(5, 7));
        let k = scaleRange90(a, T, leadOf, monthOf, cell); if (b && b !== a && !(a && b.lo === a.lo)) k += scaleRange90(b, T, leadOf, monthOf, cell);
        Object.defineProperty(H, '__z90', { value: { zone, version: Z.version, hours: k }, enumerable: false, configurable: true }); } } } catch (_) {}
    /* v91.17.283.6 · item 5 · above the highest training station, the cold side of the range is widened by the measured amount, once per
       response and after the zone width, only when data/height-extrapolation.json says the widening passed its held-out test (natmodel.mjs
       heightNote: widened / widenLowerC). The central value and the warm side are unchanged. */
    try { const X = N && N.heightExtrapolation; if (X && X.widened && X.widenLowerC > 0 && !H.__hx90) { const wl = X.widenLowerC, rnd1 = (x) => Math.round(x * 10) / 10;
      const cold = (R) => { if (!R || !Array.isArray(R.lo)) return; for (let i = 0; i < R.lo.length; i++) if (R.lo[i] != null) R.lo[i] = rnd1(R.lo[i] - wl); };
      cold(a); if (b && b !== a && !(a && b.lo === a.lo)) cold(b);
      Object.defineProperty(H, '__hx90', { value: wl, enumerable: false, configurable: true }); } } catch (_) {}
    return moved > 0; }
  let _R90 = null, _R90m = 0;
  function range90Zone() { try { const f = join(app.dataDir || join(process.cwd(), 'data'), 'range90-zone.json'); if (!existsSync(f)) return null; const t = statSync(f).mtimeMs; if (t !== _R90m) { _R90 = JSON.parse(readFileSync(f, 'utf8')); _R90m = t; } return _R90; } catch (_) { return null; } }
  function servedChain(loc, la, lo, o = {}) { return drive(servedChainSteps(loc, la, lo, o, false)); }
  function* servedChainSteps(loc, la, lo, o = {}, A = false) {
    const steps = []; let n = 0, merged = false;
    if (!loc || typeof loc !== 'object') return { n, merged, steps };
    try { if (app.ifsRetrain) app.ifsRetrain.mark(loc, o.wind || 'kmh'); } catch (_) {}   /* 28 Oct 2026 · which hours hold the substituted IFS values before the zone merge and the plains mix (ifsretrain.mjs; nothing without an approved set) */
    try {
      if (o.zoneModels && mergeZone(loc, la, lo, o.zoneModels)) merged = true;
      else if (o.zoneMember && injectMembers(loc, o.zoneMember.row, o.zoneMember.models) && mergeZone(loc, la, lo, o.zoneMember.models)) merged = true;
    } catch (_) { merged = false; }
    if (merged) steps.push('zone');
    /* v91.17.267 · THE PLAINS START FROM THE MULTI-MODEL MIX (blend.mjs, data/blend-gate.json). o.blend: the nine-model members answer for
       this place. Where the place's zone (its resolved height) is in the gate, the start temperature and dew point (and the humidity made
       from them) are replaced by the mix BEFORE the static chain, as the gate replay (arm Bk3) replaced best_match; the national model's
       T0 stash becomes the mix and keeps its pool members. The basis keeps model 'best_match' (the key the calibration tables and the
       national model were fitted and gated on, as in the replay); agn_temperature_basis.start records the mix (operator-only). No members
       row, another zone, or no complete model set at an hour: best_match stays (that hour). NIGRAAN_BLEND=0 switches it off. The record
       is attached at the end, so the answer's other fields keep their v266 order. */
    let blendProv = null;
    if (o.blend && enabled() && app.blend) { try {
        const zb = mosApi && mosApi.zoneOfPoint ? mosApi.zoneOfPoint(la, lo, loc.elevation != null ? loc.elevation : null) : null;
        const r = app.blend.applyTo(loc, o.blend, { zone: zb, internal: internalNames() });
        if (r.applied) { blendProv = r.provenance; steps.push('blend'); } } catch (_) { steps.push('blend:failed'); } }
    /* v91.17.283.10 · the step log (the diagnostic agent): a caller that passes o.stepLog (an array) gets the hourly temperature after each
       stage; only the fleet pairing passes one (station points, outside the request path). Copies only: no value is changed. */
    const SL = Array.isArray(o.stepLog) ? o.stepLog : null; const snapT = (id) => stepSnap(SL, loc, id);
    if (SL) { snapT('start'); try { Object.defineProperty(loc, '__stepLog', { value: SL, enumerable: false, configurable: true, writable: true }); } catch (_) {} }
    if (A) yield 'zone';
    /* v91.17.283.49 · item 5 · the start of the static chain (after the zone merge and the plains mix): the "raw" of the T1 replay, kept for the
       skill choice (skillchoice.mjs); non-enumerable, never served */
    try { if (loc.hourly && Array.isArray(loc.hourly.temperature_2m)) Object.defineProperty(loc, '__startT', { value: loc.hourly.temperature_2m.slice(), enumerable: false, configurable: true }); } catch (_) {}
    let base = false; try { base = enabled() && (yield* correctLocationSteps(loc, la, lo, Date.now(), o.wind || 'kmh', A)); } catch (_) { base = false; }
    if (SL) { snapT('static'); try { delete loc.__stepLog; } catch (_) {} }
    if (base) { n++; steps.push('static'); } else { try { basisOf(loc, la, lo, 'L0'); } catch (_) {} }
    if (A) yield 'static';
    const run = { tdown: () => !!(app.tdown && app.tdown.on() && app.tdown.apply(loc, la, lo, { zone: mosApi && mosApi.zoneOfPoint ? mosApi.zoneOfPoint(la, lo, loc.elevation != null ? loc.elevation : null) : null, record: !!o.record })),
                  skillchoice: () => base && applySkillChoice(loc, la, lo, { dataDir: app.dataDir || join(process.cwd(), 'data'), zone: mosApi && mosApi.zoneOfPoint ? mosApi.zoneOfPoint(la, lo, loc.elevation != null ? loc.elevation : null) : null, record: !!o.record }) > 0,   /* v283.49 item 5 */
                  synop: () => o.live !== false && app.synop && app.synop.apply(loc, la, lo),
                  live: () => { const h = o.live !== false && app.hyperlocal && app.hyperlocal.apply(loc, la, lo); let e = false; try { e = o.live !== false && o.ewsLive !== false && !!(app.ewsAnchor && app.ewsAnchor.serve && app.ewsAnchor.serve(loc, la, lo)); } catch (_) { e = false; } return h || e; },   /* v91.17.283.41 · item 36: the EWS live anchor (off until its live pointer is flipped; ewsshadow.mjs serve) */
                  t2final: () => !!(app.t2final && app.t2final.on() && app.t2final.apply(loc, la, lo, { zone: mosApi && mosApi.zoneOfPoint ? mosApi.zoneOfPoint(la, lo, loc.elevation != null ? loc.elevation : null) : null, record: !!o.record })),
                  dewfix: () => !!(app.dewfix && app.dewfix.on() && app.dewfix.anyServed() && app.dewfix.apply(loc, la, lo, { zone: mosApi && mosApi.zoneOfPoint ? mosApi.zoneOfPoint(la, lo, loc.elevation != null ? loc.elevation : null) : null, record: !!o.record })),
                  cloudt: () => !!(app.cloudt && app.cloudt.on() && app.cloudt.model() && (app.cloudt.model().servedZones || []).length && app.cloudt.apply(loc, la, lo, { zone: mosApi && mosApi.zoneOfPoint ? mosApi.zoneOfPoint(la, lo, loc.elevation != null ? loc.elevation : null) : null, record: !!o.record })) };
    for (const id of CHAIN_STAGES) { try {
        const ok = id === 'wxmos' ? (o.wx !== false && app.wxmos && (app.wxmos.applySteps ? yield* app.wxmos.applySteps(loc, la, lo, A) : app.wxmos.apply(loc, la, lo))) : run[id]();
        if (ok) { n++; steps.push(id); if (SL) snapT(id); } } catch (_) { steps.push(id + ':failed'); } if (o.upTo === id) break; }
    try { recentreRange90(loc); } catch (_) {}
    if (n && o.daily !== false) dailyFromCurve(loc);
    if (blendProv) { try { const bs = basisOf(loc, la, lo); if (bs) bs.start = blendProv; } catch (_) {} }   /* v91.17.267 · operator-only: the start was the multi-model mix */
    try { Object.defineProperty(loc, 'agn_chain', { value: { version: 'chain@207', steps, live: o.live !== false, upTo: o.upTo || null }, enumerable: !!o.record, configurable: true, writable: true }); } catch (_) {}
    return { n, merged, steps };
  }
  function* correctSteps(buf, qs, strip = [], natMem = null, pastDays = 0, noNat = false, zoneMem = null, noLive = false, noWx = false, blendMem = null, ASYNC = false) {
    /* v91.17.147 · audit data F1 · {d, h}: d whole past days were added upstream; keep only the last h past hours */
    let keepH = null; if (pastDays && typeof pastDays === 'object') { keepH = pastDays.h; pastDays = pastDays.d; }
    /* v91.17.70 · the zone request (models = data/model-zone.json request.models) is always folded into one plain
       response, correction switch or not: a caller that asked for the zone basis must never receive suffixed keys.
       The ERA5 table gate (biasCorrections) no longer blocks the MACH running correction. */
    const models = String(qs.get('models') || 'best_match');
    const zoneReq = mosApi && mosApi.requestModels ? mosApi.requestModels() : null;
    const isZone = !!(zoneReq && models === zoneReq);
    const stripOnly = (b0) => { if (!strip.length && !pastDays) return { buf: b0, n: 0 }; try { const jj = JSON.parse(b0.toString('utf8')); (Array.isArray(jj) ? jj : [jj]).forEach(dropAdded); return { buf: Buffer.from(JSON.stringify(jj)), n: 0 }; } catch { return { buf: b0, n: 0 }; } };
    /* v91.17.89 · the hourly variables the proxy added for the national model leave the response again */
    const dropAdded = (loc) => { if (!loc) return;
      if (loc.hourly) for (const k of strip) { delete loc.hourly[k]; if (loc.hourly_units) delete loc.hourly_units[k]; }
      if (strip.length && loc.hourly && Object.keys(loc.hourly).every((k) => k === 'time' || (/_corrected$/.test(k) && !(k.replace(/_corrected$/, '') in loc.hourly)))) { delete loc.hourly; delete loc.hourly_units; if (loc.agn_national && loc.agn_national.range90) delete loc.agn_national.range90; }   /* v91.17.161 · the hourly range goes with the hourly block */   /* v91.17.157 · a daily-only request gets no empty hourly block */
      /* v91.17.90 · the past days the proxy added for the national model leave again (whole days: 24 h, 1 daily row, 96 quarter-hours) */
      if (pastDays > 0) for (const [sec, per] of [['hourly', 24], ['daily', 1], ['minutely_15', 96]]) { const S = loc[sec]; if (!S || typeof S !== 'object') continue;
        if (keepH != null && sec !== 'daily') continue;   /* v91.17.147 · review F3 · a past_hours request is cut by time below, not by whole days (the hours before midnight stay) */
        for (const k of Object.keys(S)) if (Array.isArray(S[k])) S[k] = S[k].slice(pastDays * per);
        if (sec === 'hourly' && loc.agn_national && loc.agn_national.range90) { const R = loc.agn_national.range90; R.lo = R.lo.slice(pastDays * per); R.hi = R.hi.slice(pastDays * per); }  }
      if (keepH != null) { const off = (loc.utc_offset_seconds || 0) * 1000;
        const nowH = loc.current && loc.current.time ? Date.parse(String(loc.current.time).slice(0, 13) + ':00Z') : Math.floor((Date.now() + off) / 3600e3) * 3600e3;
        const t0 = nowH - keepH * 3600e3;
        for (const sec of ['hourly', 'minutely_15']) { const S = loc[sec]; if (!S || !Array.isArray(S.time)) continue;
          let k = S.time.findIndex((t) => Date.parse(t + 'Z') >= t0); if (k < 0) k = S.time.length;
          if (k > 0) { for (const key of Object.keys(S)) if (Array.isArray(S[key])) S[key] = S[key].slice(k);
            if (sec === 'hourly' && loc.agn_national && loc.agn_national.range90) { const R = loc.agn_national.range90; R.lo = R.lo.slice(k); R.hi = R.hi.slice(k); } } } } };
    if (!isZone && !(zoneMem && zoneMem.some(Boolean)) && !(blendMem && blendMem.some(Boolean) && enabled()) && (!enabled() || models.includes(','))) return stripOnly(buf);   /* v91.17.267 · + blendMem */
    let j; try { j = JSON.parse(buf.toString('utf8')); } catch { return { buf, n: 0 }; }
    if (ASYNC) yield 'parsed';   /* v91.17.231 · a turn for other requests after reading the body */
    const lats = String(qs.get('latitude') || '').split(',').map(Number), lons = String(qs.get('longitude') || '').split(',').map(Number);
    const arr = Array.isArray(j) ? j : [j]; let n = 0, merged = 0;
    const wu = String(qs.get('wind_speed_unit') || 'kmh');
    for (let i = 0; i < arr.length; i++) { const loc = arr[i]; if (i) yield i;
      const la = Number.isFinite(lats[i]) ? lats[i] : loc.latitude, lo = Number.isFinite(lons[i]) ? lons[i] : loc.longitude;
      if (loc && typeof loc === 'object') Object.defineProperty(loc, '__req', { value: models, enumerable: false, configurable: true });
      if (noNat && loc && typeof loc === 'object') Object.defineProperty(loc, '__noNat', { value: true, enumerable: false, configurable: true });
      if (noLive && loc && typeof loc === 'object') Object.defineProperty(loc, '__noLive', { value: true, enumerable: false, configurable: true });
      if (loc && typeof loc === 'object' && arr.length > 40) Object.defineProperty(loc, '__natH', { value: 156, enumerable: false, configurable: true });   /* v91.17.108: the tested horizon (see natmodel) */   /* v91.17.89 · the sweep: national layer to 96 h */
      /* v91.17.89 · members fetched beside a single-point plain request (server.mjs natMem), aligned on the hour strings */
      try { const H = loc && loc.hourly; const nm = Array.isArray(natMem) ? natMem[i] : natMem;
        if (nm && !isZone && H && Array.isArray(H.time) && Array.isArray(H.temperature_2m) && !H.__natT) { const natMem = nm;
        const ix = new Map(natMem.time.map((t, k) => [t, k])); const st = { best_match: H.temperature_2m.slice() };
        for (const m of ['icon_seamless', 'gfs_seamless', 'meteofrance_seamless']) st[m] = Array.isArray(natMem[m]) ? H.time.map(t => { const k = ix.get(t); return k == null ? null : natMem[m][k]; }) : null;
        if (['icon_seamless', 'gfs_seamless', 'meteofrance_seamless'].every(m => Array.isArray(st[m]))) Object.defineProperty(H, '__natT', { value: st, enumerable: false, configurable: true }); } } catch (_) {}
      const c = yield* servedChainSteps(loc, la, lo, { zoneModels: isZone ? models : null, zoneMember: !isZone && zoneMem ? zoneMem[i] : null, blend: Array.isArray(blendMem) ? blendMem[i] : null, wind: wu, live: !noLive, wx: !noWx }, ASYNC);
      n += c.n; if (c.merged) merged++;
      dropAdded(loc);
    }
    return (n || merged || strip.length || pastDays) ? { buf: Buffer.from(JSON.stringify(j)), n } : { buf, n: 0 };
  }

  async function run(ctx = { identity: { actorId: 'verification-job', tenantId: 'agn-local' } }) {
    if (running) return { started: false, why: 'already running' };
    if (!provider.configured()) return { started: false, why: 'no paid provider key' };
    running = true;
    const end = Date.now() - RULE.lagDays * 864e5, start = end - (RULE.trainDays + RULE.testDays - 1) * 864e5;
    const window = { start_date: day(start), end_date: day(end) };
    const testFrom = day(start + RULE.trainDays * 864e5);
    const list = units.tehsil.filter(u => !u.disputed);
    const rows = [], corr = [], errors = [];
    /* v91.17.101 · registry ens-bias (L1): the correction is kept where it helped on the test month, and that same month was
       quoted as its skill. The corrections stored by the PREVIOUS run are now scored on the hours after that run's window,
       before they are replaced: a forward score on hours neither the fit nor the keep/drop choice saw. */
    const prevSum = (store.all('verificationSummaries') || []).slice(-1)[0] || null;
    const prevEnd = prevSum && prevSum.window ? prevSum.window.end_date : null;
    const prevCorr = new Map(); for (const c of store.all('biasCorrections') || []) if (c.applied) prevCorr.set(c.unitId + '|' + c.lead_hours, c);
    const fwd = [];
    try {
      for (let i = 0; i < list.length; i += 50) {
        const b = list.slice(i, i + 50);
        const common = { latitude: b.map(u => u.lat), longitude: b.map(u => u.lon), elevation: b.map(u => u.elevM ?? 'nan'), ...window, timezone: 'GMT' };
        let fc, ob;
        try {
          fc = await provider.call('previousRuns', '/v1/forecast', { ...common, hourly: ['temperature_2m_previous_day1', 'temperature_2m_previous_day2', 'temperature_2m_previous_day3'] }, { locations: b.length });
          /* v91.17.3 · 1.11 · IFS 9 km beats ERA5 at 14 of 14 mountain stations (median 1.77 °C MAE) */
          ob = await provider.call('archive', '/v1/archive', { ...common, hourly: 'temperature_2m', models: reanalysisModel(common.start_date) }, { locations: b.length });
        } catch (e) { errors.push({ batch: i / 50, code: e.code, message: e.message }); if (e.code === 'PROVIDER_QUOTA_EXHAUSTED') break; continue; }
        fc = alignBatch(fc, b); ob = alignBatch(ob, b);   /* v91.17.157 · audit: matched by coordinate, not index */
        b.forEach((u, k) => {
          const F = fc[k] && fc[k].hourly, O = ob[k] && ob[k].hourly; if (!F || !O) return;
          const times = F.time || [], obs = O.temperature_2m || [];
          const split = times.findIndex(t => t.slice(0, 10) >= testFrom);
          LEADS.forEach((L, li) => {
            const f = F['temperature_2m_previous_day' + (li + 1)] || [];
            const sum = new Array(24).fill(0), cnt = new Array(24).fill(0); let tn = 0, tall = 0;
            for (let h = 0; h < split; h++) if (f[h] != null && obs[h] != null) { const hr = Number(times[h].slice(11, 13)); sum[hr] += f[h] - obs[h]; cnt[hr]++; tall += f[h] - obs[h]; tn++; }
            const meanAll = tn ? tall / tn : 0;
            /* shrink thin hours toward the all-hours mean */
            const hourBias = sum.map((s, hr) => { const n = cnt[hr]; return n ? +(((s / n) * n + meanAll * 5) / (n + 5)).toFixed(3) : +meanAll.toFixed(3); });
            let n = 0, seR = 0, seC = 0, eR = 0, eC = 0;
            for (let h = split; h < Math.min(f.length, obs.length); h++) if (f[h] != null && obs[h] != null) {
              const hr = Number(times[h].slice(11, 13)); const r = f[h] - obs[h], c = r - hourBias[hr];
              n++; seR += r * r; seC += c * c; eR += r; eC += c;
            }
            const rmseRaw = n ? Math.sqrt(seR / n) : null, rmseCor = n ? Math.sqrt(seC / n) : null;
            { const pc = prevEnd ? prevCorr.get(u.unitId + '|' + L) : null;
              if (pc && Array.isArray(pc.hourBias)) { let m = 0, a = 0, b = 0;
                for (let h = 0; h < Math.min(f.length, obs.length); h++) if (times[h].slice(0, 10) > prevEnd && f[h] != null && obs[h] != null) { const r = f[h] - obs[h], c = r - pc.hourBias[Number(times[h].slice(11, 13))]; m++; a += r * r; b += c * c; }
                if (m >= 48) fwd.push({ lead: L, n: m, raw: Math.sqrt(a / m), cor: Math.sqrt(b / m) }); } }
            const fitted = !!(tn >= 240 && n >= 240 && rmseCor < rmseRaw - 0.05);
            const applied = fitted && servingEra5();
            const served = applied ? rmseCor : rmseRaw;
            rows.push({ unitId: u.unitId, key: u.key || u.tehsil, name: u.name, district: u.district, lead_hours: L, n, trainHours: tn,
              rmse_raw: rmseRaw != null ? +rmseRaw.toFixed(3) : null, rmse_corrected: rmseCor != null ? +rmseCor.toFixed(3) : null,
              bias_raw: n ? +(eR / n).toFixed(3) : null, bias_corrected: n ? +(eC / n).toFixed(3) : null,
              correction_applied: applied, correction_fitted: fitted, correction_serving: servingEra5(), rmse_served: served != null ? +served.toFixed(3) : null,
              pass: L === RULE.gateLeadHours ? (n >= RULE.minHours && served != null && served <= RULE.maxRmseC) : null });
            corr.push({ unitId: u.unitId, key: u.key || u.tehsil, lat: u.lat, lon: u.lon, lead_hours: L, hourBias, meanBias: +meanAll.toFixed(3), applied: fitted, fitted, serving: servingEra5() });
          });
        });
      }
      const gate = rows.filter(r => r.lead_hours === RULE.gateLeadHours);
      const med = (a) => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
      const passServed = gate.filter(r => r.pass).length, passRaw = gate.filter(r => r.n >= RULE.minHours && r.rmse_raw <= RULE.maxRmseC).length;
      const summary = { summary_id: newId('ver'), at: nowIso(), window, trainWindow: { start_date: window.start_date, end_date: day(Date.parse(testFrom) - 864e5) }, testWindow: { start_date: testFrom, end_date: window.end_date },
        rule: RULE, unitsScored: gate.length, unitsTotal: list.length, correctionEnabled: enabled(), correctionServing: servingEra5(),
        correctionsFitted24: gate.filter(r => r.correction_fitted).length,
        referenceModel: reanalysisModel(testFrom), referenceNote: 'recent windows are scored against the ECMWF IFS analysis (models=ecmwf_ifs, 9 km); ERA5 is used only for windows before 2017',
        verifiedModel: RULE.model, verifiedModelNote: 'the screening feed (best_match blend) is what is verified; no error is measured here for the ECMWF IFS ensemble or the named IFS run printed elsewhere',
        passed: enabled() ? passServed : passRaw, passedRaw: passRaw, passedCorrected: passServed,
        passShare: +((enabled() ? passServed : passRaw) / list.length).toFixed(3),
        medianRmse24Raw: med(gate.map(r => r.rmse_raw)), medianRmse24Served: med(gate.map(r => enabled() ? r.rmse_served : r.rmse_raw)),
        correctionsApplied24: gate.filter(r => r.correction_applied).length, errors };
      summary.medianRmse24 = summary.medianRmse24Served;
      { const g = fwd.filter(x => x.lead === RULE.gateLeadHours);
        summary.forward = prevEnd ? { after: prevEnd, previousRun: prevSum.summary_id, unitsScored: g.length, hours: g.reduce((a, x) => a + x.n, 0),
          medianRmseRaw: med(g.map(x => +x.raw.toFixed(3))), medianRmseCorrected: med(g.map(x => +x.cor.toFixed(3))),
          improvedShare: g.length ? +(g.filter(x => x.cor < x.raw).length / g.length).toFixed(3) : null,
          note: 'corrections from the previous run scored on hours after its window: neither the fit nor the keep/drop choice saw them' } : { why: 'no previous run to forward-score' }; }
      summary.eligible = list.length > 0 && summary.passShare >= RULE.nationalPassShare && errors.length === 0;
      if (gate.length) {
        await store.removeWhere('unitSkill', () => true); await store.insertMany('unitSkill', rows.map(r => ({ ...r, summary_id: summary.summary_id })));
        await store.removeWhere('biasCorrections', () => true); await store.insertMany('biasCorrections', corr.map(c => ({ ...c, summary_id: summary.summary_id }))); buildIndex();
      }
      await store.insert('verificationSummaries', summary);
      await audit.record('verification.national', summary.eligible ? 'eligible' : 'not-eligible', ctx, { passedRaw: passRaw, passedCorrected: passServed, medianRaw: summary.medianRmse24Raw, medianServed: summary.medianRmse24Served });
      console.log('  verify     ' + new Date().toLocaleTimeString() + '  24 h temp vs ERA5 (test month): raw ' + passRaw + '/' + list.length + ' pass, median ' + summary.medianRmse24Raw + ' °C  ->  corrected ' + passServed + '/' + list.length + ', median ' + summary.medianRmse24Served + ' °C');
      return { started: true, summary };
    } finally { running = false; }
  }

  /* ── live ledger ───────────────────────────────────────────────────── */
  async function logServed(run) {
    try {
      if (!run || run.unit_level !== 'tehsil' || run.status !== 'complete' || !run.variables.includes('temperature_2m')) return;
      const d = run.completed_at.slice(0, 10);
      if (store.find('forecastLog', x => x.issuedDay === d)) return;
      const recs = store.filter('records', r => r.runId === run.run_id);
      const rows = [];
      for (const r of recs) for (const L of LEADS) { const v = r.leads[String(L)]; if (v && v.temperature_2m != null && v.validTime) rows.push({ issuedDay: d, runId: run.run_id, unitId: r.unitKey, lat: r.lat, lon: r.lon, lead_hours: L, validTime: v.validTime, value: v.temperature_2m, corrected: !!r.biasCorrected, observed: null }); }
      await store.insertMany('forecastLog', rows);
      console.log('  ledger     logged ' + rows.length + ' served forecasts for ' + d);
    } catch (e) { console.error('  ledger error', e.message); }
  }
  async function scoreLedger() {
    const cutoff = Date.now() - RULE.lagDays * 864e5;
    const due = store.filter('forecastLog', x => x.observed == null && Date.parse(x.validTime) < cutoff);
    if (!due.length) return 0;
    const byUnit = new Map(); for (const x of due) { const a = byUnit.get(x.unitId) || []; a.push(x); byUnit.set(x.unitId, a); }
    const list = [...byUnit.entries()]; let scored = 0;
    for (let i = 0; i < list.length; i += 50) {
      const b = list.slice(i, i + 50); const times = b.flatMap(([, a]) => a.map(x => Date.parse(x.validTime)));
      const s = day(Math.min(...times)), e = day(Math.max(...times));
      let ob; try { ob = await provider.call('archive', '/v1/archive', { latitude: b.map(([, a]) => a[0].lat), longitude: b.map(([, a]) => a[0].lon), elevation: b.map(([id]) => { const u = units.tehsil.find(t => t.unitId === id); return u && u.elevM != null ? u.elevM : 'nan'; }), hourly: 'temperature_2m', models: reanalysisModel(s), start_date: s, end_date: e, timezone: 'GMT' }, { locations: b.length }); } catch { break; }
      ob = Array.isArray(ob) ? ob : [ob];
      b.forEach(([, a], k) => { const O = ob[k] && ob[k].hourly; if (!O) return; const idx = new Map(O.time.map((t, j) => [t, j]));
        for (const x of a) { const j = idx.get(x.validTime.slice(0, 13) + ':00'); if (j != null && O.temperature_2m[j] != null) { x.observed = O.temperature_2m[j]; x.error = +(x.value - x.observed).toFixed(2); scored++; } } });
    }
    if (store.allForWrite) store.allForWrite('forecastLog');   /* v91.17.235 · rows were changed in place: the store writes the log again */
    await store.save(); return scored;
  }
  function ledgerSummary() {
    const s = store.filter('forecastLog', x => x.observed != null);
    const out = { logged: store.all('forecastLog').length, scored: s.length, days: new Set(store.all('forecastLog').map(x => x.issuedDay)).size, byLead: {} };
    for (const L of LEADS) { const a = s.filter(x => x.lead_hours === L); out.byLead[L] = a.length ? { n: a.length, rmse: +Math.sqrt(a.reduce((q, x) => q + x.error * x.error, 0) / a.length).toFixed(3), bias: +(a.reduce((q, x) => q + x.error, 0) / a.length).toFixed(3) } : null; }
    return out;
  }

  function latest() { return store.all('verificationSummaries').slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] || null; }
  function grades() {
    const s = latest(); const fresh = !!(s && (Date.now() - Date.parse(s.at)) < RULE.maxAgeDays * 864e5);
    const unitsOut = {};
    for (const r of store.all('unitSkill')) { const u = unitsOut[r.key] || (unitsOut[r.key] = { name: r.name, district: r.district }); u[r.lead_hours] = { rmseRaw: r.rmse_raw, rmseCorrected: r.rmse_corrected, biasRaw: r.bias_raw, corrected: r.correction_applied, rmseServed: r.rmse_served, hours: r.n }; if (r.lead_hours === 24) u.pass = r.pass; }
    let summary = null;
    if (s) {
      /* where the station guard switched a correction off, the ERA5 score is not trusted; the unit counts as the station scored it */
      const gate = store.all('unitSkill').filter(r => r.lead_hours === RULE.gateLeadHours);
      let passed = 0, overridden = 0;
      for (const r of gate) { const g = guarded(r.unitId, RULE.gateLeadHours); if (g) { overridden++; if (g.raw <= RULE.maxRmseC && r.n >= RULE.minHours) passed++; } else if (r.pass) passed++; }
      if (!gate.length) passed = s.passed;
      const passShare = s.unitsTotal ? +(passed / s.unitsTotal).toFixed(3) : 0;
      const era5Ok = passShare >= RULE.nationalPassShare && !(s.errors && s.errors.length);
      const stationOk = stationCheck ? stationCheck.ok !== false : true;
      /* v91.17.36 · AUDIT R-06/R-02 · grade A is a PLAINS statement. The reanalysis agreement is
         ~100% nationally while the station-measured mountain error is 4.7 °C MAE (47 PMD stations)
         and the reanalysis itself is −5.96 °C biased there. The grade carries a domain and a
         mountain caveat; the report prints the measured mountain error for units above 1,000 m. */
      const mountainCaveat = 'grade applies to the plains cohort: above ~1,000 m the station-measured error (internal skill sheet temperature_mountain) is the figure to read, not the reanalysis agreement';   /* v91.17.70 · no agency named */
      summary = { ...s, passedEra5Only: s.passed, passed, passShare, stationOverriddenTehsils: overridden, stationCheck, fresh, eligible: !!(era5Ok && stationOk && fresh),
        gradeDomain: 'plains (reanalysis agreement + reference thermometers); mountains not covered', mountainCaveat, /* v91.17.70 · the grade is model against its own reanalysis: an internal diagnostic, never a customer label */ label: 'internal diagnostic', internalDiagnostic: true,
        eligibleBasis: 'reanalysis (ECMWF IFS analysis) national pass share ' + Math.round(passShare * 100) + '% (need 80%)' + (stationCheck ? (stationCheck.ok == null ? '; station check not applied (' + stationCheck.note + ')' : '; stations ' + stationCheck.passServed + '/' + stationCheck.stations + ' within 2.0 °C, median ' + stationCheck.medianServed + ' °C served vs ' + stationCheck.medianRaw + ' °C raw') : '; station check not run yet') };
    }
    for (const [k, g] of guard) { const cut = k.lastIndexOf('|'), unitId = k.slice(0, cut), L = k.slice(cut + 1); const r = store.find('unitSkill', x => x.unitId === unitId && String(x.lead_hours) === L); if (r && unitsOut[r.key] && unitsOut[r.key][L]) Object.assign(unitsOut[r.key][L], { corrected: false, stationGuard: g, rmseServed: r.rmse_raw }); }
    return { rule: RULE, summary, ledger: ledgerSummary(), units: unitsOut, running };
  }
  /* v91.17.35 · a run whose provider batches failed (a network blip) left ~100 tehsils unscored and the
     national grade at B for a full day, because the rule needs zero errors and the next run was 24 h away.
     A run with errors is now retried after 1 h. */
  function due() { const s = latest(); if (!s || !s.testWindow) return true; const age = Date.now() - Date.parse(s.at); return age > 24 * 3600e3 || ((s.errors || []).length > 0 && age > 3600e3); }
  return { run, grades, due, isRunning: () => running, correctResponse, correctResponseAsync, correctLocation, servedChain, servedChainAsync, mergeZone, basisOf, setMos, logServed, scoreLedger, setStationResults, guarded, stationCheck: () => stationCheck };
}
