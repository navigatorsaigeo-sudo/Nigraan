/* ══ v91.17.177 · THE NATIONAL DEW POINT AND WIND MODEL (data/moist-model.json, station-lake/scripts/moist_final.py) ══════════
   One residual model per quantity for every point in Pakistan, on the national temperature model's basis and predictors
   (T0 = best_match at the point height; the same 30 m terrain / land-surface bands, seasonal satellite bands, climatology and the
   hour's own weather, read by natmodel.mjs rows()), trained on the mountain AWS network, the synop network, METAR and (dew point
   only) MACH, 2024-05 .. 2026-09.
     dew    served dew point = T0 dew point + R, capped at the final air temperature; relative humidity follows from the final
            temperature (one physical state: humwind.consistency recomputes wet bulb and the daily families afterwards)
     wind   served 10 m wind = the evaluated variant (log ratio with Duan smearing, or difference), m/s, floored at 0; the daily
            maximum of a fully covered day follows the hourly curve
     where  only in the zones that passed the held-out gate (spatial blocks x alternate 14-day blocks, against what NIGRAAN served
            before, past-event days and every network with >= 3 stations not worse): data/moist-model.json zones[z].applied.
            Where it is not applied, the earlier steps (lowland dew offset, valley humidity model) keep serving unchanged.
   Applied inside correctLocation after the national temperature model. NIGRAAN_MOIST=0 switches it off; NIGRAAN_MOIST_WIND=0 the
   wind part only. */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { lgbEval } from './natmodel.mjs';
import { evalBatch, evalLocal, drive } from './lgbpool.mjs';
import { rhFromDew, esatHpa, dewPointC } from './psychro.mjs';

const r1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, c) => Math.max(-c, Math.min(c, v));

export function createMoist({ dataDir, national, zoneOf }) {
  const file = join(dataDir, 'moist-model.json');
  let M = null, mtime = 0, checked = 0, err = null; const MEMO = new Map(); let mHour = -1;
  function model() {
    const now = Date.now(); if (M && now - checked < 60000) return M; checked = now;
    try { if (!existsSync(file)) { err = 'data/moist-model.json missing'; return (M = null); } const t = statSync(file).mtimeMs; if (t !== mtime) { M = JSON.parse(readFileSync(file, 'utf8')); mtime = t; err = null; } }
    catch (e) { err = String(e.message || e); M = null; }
    return M;
  }
  const on = () => process.env.NIGRAAN_MOIST !== '0';
  const windOn = () => process.env.NIGRAAN_MOIST_WIND !== '0';
  function zone(lat, lon, elev) { try { return zoneOf ? zoneOf(lat, lon, elev) : null; } catch (_) { return null; } }
  /* which parts apply at a point (the caller captures the raw series only where something applies) */
  function plan(lat, lon, elev) {
    const m = on() && model(); if (!m || elev == null || !national) return null;
    const z = zone(lat, lon, elev); if (!z) return null;
    const dew = !!(m.dew && m.dew.zones && m.dew.zones[z] && m.dew.zones[z].applied);
    const wind = windOn() && !!(m.wind && m.wind.model && m.wind.zones && m.wind.zones[z] && m.wind.zones[z].applied);
    return dew || wind ? { zone: z, dew, wind } : null;
  }

  /* T0: best_match temperature (the national model's own basis); rawDew: best_match's own dew point; rawWs: the model's own wind in
     the request unit (wk = km/h per unit). Returns { dew, wind } booleans. */
  function apply(loc, lat, lon, T0, rawDew, rawWs, wk = 1) { return drive(applySteps(loc, lat, lon, T0, rawDew, rawWs, wk, false)); }
  /* v91.17.231 · applySteps: the same computation as a generator; with A (async) the tree batches go to the worker pool (lgbpool.mjs).
     Rows past the served horizon are no longer evaluated (they were evaluated and never used); the horizon is part of the memo key. */
  function* applySteps(loc, lat, lon, T0, rawDew, rawWs, wk = 1, A = false) {
    const H = loc && loc.hourly; const res = { dew: false, wind: false };
    if (!H || !Array.isArray(H.time) || !Array.isArray(T0)) return res;
    const P = plan(lat, lon, loc.elevation); if (!P) return res;
    const m = model(); const doDew = P.dew && Array.isArray(rawDew) && Array.isArray(H.temperature_2m); const doWind = P.wind && Array.isArray(rawWs) && Array.isArray(H.wind_speed_10m);
    if (!doDew && !doWind) return res;
    /* v91.17.179 · the residuals are memoised for the hour (same point, same inputs): a page load answered from the sweep cache no longer
       re-evaluates 500 trees per hour per mountain tehsil (measured +4 s per 120-tehsil batch on a cold load) */
    const hk = (a) => { if (!Array.isArray(a)) return 0; let h = 0; for (let k = 0; k < a.length; k++) h = (h * 31 + Math.round((a[k] == null ? -999 : a[k]) * 10)) | 0; return h; };
    const natH = loc.__natH != null && Number.isFinite(+loc.__natH) ? +loc.__natH : 132;
    /* served only to the last lead the 1-5 day as-issued check passed (zones[z].horizonH), never beyond the national model's horizon */
    const hzD = Math.min(natH, (m.dew && m.dew.zones[P.zone] && m.dew.zones[P.zone].horizonH) || 0), hzW = Math.min(natH, (m.wind && m.wind.zones[P.zone] && m.wind.zones[P.zone].horizonH) || 0);
    const horizonH = Math.max(hzD, hzW);
    const off = (loc.utc_offset_seconds || 0) * 1000;
    const mk = [lat.toFixed(5), lon.toFixed(5), loc.elevation, m.version, wk, loc.utc_offset_seconds || 0, H.time[0], H.time.length, hk(T0), hk(rawDew), hk(rawWs),
      ...['cloud_cover', 'wind_speed_10m', 'wind_direction_10m', 'shortwave_radiation', 'precipitation'].map((k) => hk(H[k])), Math.floor(Date.now() / 3600e3), horizonH].join('|');
    let RR = MEMO.get(mk);
    if (!RR) {
      /* only the rows the apply loop can read: inside the horizon as seen from any moment of this clock hour (the memo key's hour), so a
         later call with the same key, whose horizon reaches up to an hour further, still finds every row it reads */
      const t1 = (Math.floor(Date.now() / 3600e3) + 1) * 3600e3, idx = [], X = [];
      const { out } = national.internals.rows(loc, lat, lon, T0, Array.isArray(rawDew) ? { __dew: rawDew } : null, wk, t1 + horizonH * 3600e3);
      if (A) yield 'moist-rows';   /* a turn for other requests between building the rows and evaluating them */
      for (let i = 0; i < out.length; i++) { const f = out[i]; if (!f) continue;
        if ((Date.parse(H.time[i] + 'Z') - off - t1) > horizonH * 3600e3) continue;
        const t0 = f.temperature_2m, td0 = f.dew_point_2m;
        f.rh_fc = (t0 == null || td0 == null) ? null : Math.max(1, Math.min(100, 100 * esatHpa(td0) / esatHpa(t0)));
        idx.push(i); X.push(m.features.map((c) => f[c])); }
      const batch = function* (part, P) { if (!X.length) return []; if (A) { const r = yield evalBatch({ file, path: [part, 'model'], version: m.version }, X); if (r) return Array.from(r); } return evalLocal(P, X); };
      const vd = doDew ? yield* batch('dew', m.dew.model) : null, vw = (doWind && m.wind.model) ? yield* batch('wind', m.wind.model) : null;
      RR = { d: new Array(out.length).fill(null), w: new Array(out.length).fill(null) };
      idx.forEach((i, j) => { if (vd) RR.d[i] = clamp(vd[j], m.dew.capC || 15); if (vw) RR.w[i] = clamp(vw[j], m.wind.cap || 3); });
      { const hb = Math.floor(Date.now() / 3600e3); if (hb !== mHour) { MEMO.clear(); mHour = hb; } }   /* v236 · older hours can no longer be hit (the key holds the hour) */
      MEMO.set(mk, RR); if (MEMO.size > 3000) MEMO.delete(MEMO.keys().next().value);
    }
    const now = Date.now();
    let nd = 0, nw = 0, sd = 0, sw = 0;
    const smear = (m.wind && m.wind.smearing && m.wind.smearing[P.zone]) || 1;
    /* v91.17.228 · the tail map (station-lake/scripts/moist_qm_check.py): in a zone that carries one, the model's dew point is moved a
       share w of the way to its quantile-mapped value (the model's out-of-fold distribution mapped onto the observed one), which puts
       back the humid-hot tail a least-squares model shrinks. Plains: w 0.25 chosen on held-out folds; held out, hourly MAE 2.71 ->
       2.25 C, humid-hot days (station 98th-percentile wet-bulb maximum) threat score 0.127 -> 0.171, frequency bias 1.67 -> 0.84. */
    const QZ = doDew && m.dew.zones[P.zone] && m.dew.zones[P.zone].qm;
    const qmDew = (x) => { if (!QZ || !Array.isArray(QZ.p) || !Array.isArray(QZ.o) || !(QZ.w > 0)) return x; const a = QZ.p, b = QZ.o, n = a.length;
      let y; if (x <= a[0]) y = x + (b[0] - a[0]); else if (x >= a[n - 1]) y = x + (b[n - 1] - a[n - 1]);
      else { let lo = 0, hi = n - 1; while (hi - lo > 1) { const md = (lo + hi) >> 1; if (a[md] <= x) lo = md; else hi = md; } const f = a[hi] > a[lo] ? (x - a[lo]) / (a[hi] - a[lo]) : 0; y = b[lo] + f * (b[hi] - b[lo]); }
      return x + QZ.w * (y - x); };
    for (let i = 0; i < RR.d.length; i++) {
      if (RR.d[i] == null && RR.w[i] == null) continue;
      const ts = Date.parse(H.time[i] + 'Z') - off; if ((ts - now) > horizonH * 3600e3) continue;   /* the national model's horizon */
      const hAhead = (ts - now) / 3600e3;
      if (doDew && hAhead <= hzD && RR.d[i] != null && rawDew[i] != null && H.temperature_2m[i] != null) {
        const T = H.temperature_2m[i]; const td = Math.min(qmDew(rawDew[i] + RR.d[i]), T);
        const before = Array.isArray(H.dew_point_2m) && H.dew_point_2m[i] != null ? Math.min(H.dew_point_2m[i], T)
          : (Array.isArray(H.relative_humidity_2m) && H.relative_humidity_2m[i] != null ? dewPointC(T, H.relative_humidity_2m[i]) : null);
        if (Array.isArray(H.apparent_temperature) && H.apparent_temperature[i] != null && before != null) H.apparent_temperature[i] = r1(H.apparent_temperature[i] + 0.33 * (esatHpa(td) - esatHpa(before)));   /* Steadman 1994: dAT/de = 0.33 */
        if (Array.isArray(H.dew_point_2m)) H.dew_point_2m[i] = r1(td);
        if (Array.isArray(H.relative_humidity_2m)) H.relative_humidity_2m[i] = Math.round(rhFromDew(T, td) * 10) / 10;
        sd += td - rawDew[i]; nd++;
      }
      if (doWind && hAhead <= hzW && RR.w[i] != null && rawWs[i] != null) {
        const ms = rawWs[i] * wk / 3.6; const R = RR.w[i];
        const v = Math.max(0, m.wind.variant === 'log' ? (ms + 0.5) * Math.exp(R) * smear - 0.5 : ms + R);
        H.wind_speed_10m[i] = r1(v * 3.6 / wk); sw += v - ms; nw++;
      }
    }
    if (nw) {   /* the daily maximum of a fully covered day follows the hourly curve */
      const Dd = loc.daily;
      if (Dd && Array.isArray(Dd.time) && Array.isArray(Dd.wind_speed_10m_max)) {
        const byDay = new Map(); H.time.forEach((t, k) => { const d = String(t).slice(0, 10); (byDay.get(d) || byDay.set(d, []).get(d)).push(k); });
        Dd.time.forEach((d, j) => { const ks = byDay.get(String(d).slice(0, 10)); if (!ks || ks.length < 24 || Dd.wind_speed_10m_max[j] == null) return;
          const v = ks.map((k) => H.wind_speed_10m[k]).filter((x) => x != null); if (v.length >= 24) Dd.wind_speed_10m_max[j] = r1(Math.max(...v)); });
      }
      const C = loc.current; if (C && C.time && C.wind_speed_10m != null) { const k = H.time.indexOf(String(C.time).slice(0, 13) + ':00'); if (k >= 0 && H.wind_speed_10m[k] != null) C.wind_speed_10m = H.wind_speed_10m[k]; }
    }
    res.dew = nd > 0; res.wind = nw > 0;
    if (nd || nw) loc.agn_moist = { version: m.version, zone: P.zone, dew: nd > 0, wind: nw > 0, meanDewChangeC: nd ? r1(sd / nd) : 0, meanWindChangeMs: nw ? r1(sw / nw) : 0 };
    return res;
  }
  function status() {
    const m = model(); if (!m) return { ok: false, why: err || 'no model' };
    return { ok: true, enabled: on(), version: m.version, built: m.built, features: m.features.length,
      dew: { zones: Object.fromEntries(Object.entries(m.dew.zones).map(([z, v]) => [z, { applied: v.applied, horizonH: v.horizonH, why: v.why, heldOut: v.heldOut, events: v.events, leads: v.leads, tailMap: v.qm ? { w: v.qm.w, basis: v.qm.basis } : null }])), training: m.dew.training },
      wind: { enabled: windOn(), variant: m.wind.variant, shipped: !!m.wind.model, zones: Object.fromEntries(Object.entries(m.wind.zones).map(([z, v]) => [z, { applied: v.applied, horizonH: v.horizonH, why: v.why, heldOut: v.heldOut, synop: v.synop, events: v.events, leads: v.leads }])), training: m.wind.training } };
  }
  /* the exported trees reproduce the Python predictions */
  function selfcheck() {
    const m = model(); if (!m) return null; let d = 0;
    for (const k of ['dew', 'wind']) for (const s of (m[k] && m[k].model && m[k].model.selfcheck) || []) d = Math.max(d, Math.abs(lgbEval(m[k].model, m.features.map((c) => s.x[c])) - s.y));
    return d;
  }
  return { apply, applySteps, plan, status, selfcheck };
}
