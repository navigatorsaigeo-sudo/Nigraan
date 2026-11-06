/* ══ v91.17.73 · AI LOCAL CORRECTION (terrain and land surface) ═══════════════════════════════════════════════════════
   T_local = T_served + R.  R is the residual model trained by station-lake/scripts/train_downscale.py and written by
   downscale_final.py to data/downscale-model.json: a day model (Tmax residual) and a night model (Tmin residual) per
   served basis ('zone' = the mountain blend + v91.17.71 calibration, mountain and hills zones; 'best_match' = plains and
   coast), LightGBM trees (flat arrays, evaluated here in plain JS) or additive spline tables.

   Inputs at any point:
     static   the 9-arc-second feature-grid cell (featgrid.mjs value(band, lat, lon)); the model was TRAINED on these cell
              values at the station cells, so the served value is the validated value
     dynamic  the served forecast of that Pakistan day: cloud, wind, shortwave, precipitation, the basis day max / min, the
              day of year, and the height the forecast is served at (servedElevM)
   Serving rule: the model file's `gate`. If it failed, `shadow` is true: every call still returns the computed dT (for the
   log) with shadow: true and applied: false, and a caller must not add it. A zone outside `applyZones` returns dT 0.

   API
     residualDay(lat, lon, { date | month+doy, zone, servedElevM, tmax, tmin, cloudDay, cloudNight, windDay, windNight,
                             sw, precip }) -> { dTx, dTn, basis, shadow, applied, zone }
     residual(lat, lon, { month, hour, cloud, wind, sw, precip, servedElevM, zone?, tmax?, tmin?, doy? })
                          -> { dT, dTx, dTn, basis, shadow, applied }   (one weather state for day and night; hour = PKT hour
                             picks the day (Tmax) / night (Tmin) residual, blended linearly between 07-09 and 18-21 PKT)
     dayInputs(tMs[], hourly) -> Map(pktDayKey -> residualDay options) from a served hourly response (temperature_2m,
                             cloud_cover, wind_speed_10m, shortwave_radiation, precipitation; the basis curve BEFORE calibration)
     status() -> { on, shadow, version, label, applyZones } (generic; no figures)
   Integration (not wired here): see s72/CHANGES_downscale.md. The residual goes into the stretch anchors (tx + dTx,
   tn + dTn) so the day card stays the curve (T4). */
import { capped } from './capcount.mjs';
import { readFileSync, existsSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createFeatGrid } from './featgrid.mjs';
import { limitH as dataLimitH } from './dataage.mjs';   /* v283.36 item 29 */
import { stationData } from './refmode.mjs';

const SEASON = { 12: 'djf', 1: 'djf', 2: 'djf', 3: 'mam', 4: 'mam', 5: 'mam', 6: 'jja', 7: 'jja', 8: 'jja', 9: 'son', 10: 'son', 11: 'son' };
const LABEL = 'AI local correction (terrain and land surface)';
import { pktDay as pktDayKey } from './pktday.mjs';
const num = (v) => (v == null || !Number.isFinite(Number(v))) ? null : Number(v);
/* the served forecast variables the model reads (v91.17.73 serving: carried by every served path; shortwave is not) */
export const INPUT_VARIABLES = ['temperature_2m', 'cloud_cover', 'wind_speed_10m', 'precipitation'];
const DYN_FEATURES = new Set(['fc_tmax', 'fc_dtr', 'cloud_day', 'cloud_night', 'wind_day', 'wind_night', 'sw', 'precip', 'calm_clear', 'capp_cc', 'vdepth_cc']);
/* kill switch NIGRAAN_AI_DOWNSCALE=0; the model is trained on partner station data, so it follows stationData() as the calibration does */
export const aiEnabled = () => process.env.NIGRAAN_AI_DOWNSCALE !== '0' && stationData();

/* one instance per backend: verification.mjs, outlook.mjs and pool.mjs all reach it through the app */
export function downscaleFor(app) {
  if (!app) return null;
  if (!app.downscale && app.dataDir) { try { app.downscale = createDownscale({ dataDir: app.dataDir, featGrid: app.featGrid || null, runClock: () => { try { const r = app.store.all('runs').filter((x) => x.status === 'complete' && x.completed_at).map((x) => Date.parse(x.completed_at)).filter(Number.isFinite); return r.length ? Math.max(...r) : null; } catch (_) { return null; } } }); } catch { app.downscale = null; } }
  return app.downscale || null;
}

export function createDownscale({ dataDir, featGrid = null, log = null, runClock = null } = {}) {
  const file = join(dataDir, 'downscale-model.json');
  let M = null, stamp = 0, err = null;
  const fg = featGrid || createFeatGrid(dataDir);
  let checkedAt = 0;
  function model() {
    /* v91.17.233 · the file is checked on disk at most every 30 s (the laptop profile: existsSync/statSync on every call, 8 s in 150 s) */ 
    if (M && Date.now() - checkedAt < 30e3) return M; checkedAt = Date.now();
    try {
      if (!existsSync(file)) { M = null; err = 'downscale-model.json not present'; return null; }
      const st = statSync(file).mtimeMs;
      if (M && st === stamp) return M;
      M = JSON.parse(readFileSync(file, 'utf8')); stamp = st; err = null; staticMemo.clear();
    } catch (e) { M = null; err = e.message; }
    return M;
  }

  /* ── static features of the cell (memoised per cell) ── */
  const staticMemo = new Map();
  function statics(lat, lon) {
    const key = Math.floor((37.25 - lat) * 400) + ':' + Math.floor((lon - 60.75) * 400);
    if (staticMemo.has(key)) return staticMemo.get(key);
    const R = model().recipe; const s = {};
    for (const b of Object.keys(R.static)) s[b] = fg.value(R.static[b], lat, lon);
    for (const b of ['t_elev_p10', 't_elev_p90']) s[b] = fg.value(b, lat, lon);
    const seas = {};
    for (const ss of ['djf', 'mam', 'jja', 'son']) for (const pre of ['s_ndvi', 's_ndmi', 'l_day', 'l_night', 'l_day_anom', 'l_night_anom']) seas[pre + '_' + ss] = fg.value(pre + '_' + ss, lat, lon);
    const clim = {};
    for (let m = 1; m <= 12; m++) { const mm = String(m).padStart(2, '0'); clim['c_tmax_' + mm] = fg.value('c_tmax_' + mm, lat, lon); clim['c_tmin_' + mm] = fg.value('c_tmin_' + mm, lat, lon); }
    const out = { s, seas, clim };
    staticMemo.set(key, out); if (staticMemo.size > 4096) staticMemo.delete(staticMemo.keys().next().value);
    return out;
  }

  /* ── the feature vector (downscale_final.py recipe; train_downscale.feature_frame) ── */
  function features(lat, lon, o) {
    const { s, seas, clim } = statics(lat, lon);
    const d = o.date ? new Date(String(o.date).slice(0, 10) + 'T00:00:00Z') : null;
    const month = num(o.month) ?? (d ? d.getUTCMonth() + 1 : null);
    let doy = num(o.doy);
    if (doy == null && d) doy = Math.round((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1;
    if (doy == null && month != null) doy = Math.round((month - 0.5) * 30.44);
    const ss = SEASON[month]; const mm = String(month).padStart(2, '0');
    const sub = (a, b) => (a == null || b == null) ? null : a - b;
    const f = { ...s };
    delete f.t_elev_p10; delete f.t_elev_p90;
    f.relief = sub(s.t_elev_p90, s.t_elev_p10);
    f.srv_elev = num(o.servedElevM); f.dz_cell = sub(s.t_elev, f.srv_elev);
    f.ndvi = seas['s_ndvi_' + ss]; f.ndmi = seas['s_ndmi_' + ss];
    f.lst_day = seas['l_day_' + ss]; f.lst_night = seas['l_night_' + ss]; f.lst_day_anom = seas['l_day_anom_' + ss]; f.lst_night_anom = seas['l_night_anom_' + ss];
    f.clim_tmax = clim['c_tmax_' + mm]; f.clim_tmin = clim['c_tmin_' + mm]; f.clim_dtr = sub(f.clim_tmax, f.clim_tmin);
    f.doy_sin = Math.sin(2 * Math.PI * doy / 365.25); f.doy_cos = Math.cos(2 * Math.PI * doy / 365.25);
    f.fc_tmax = num(o.tmax); f.fc_dtr = sub(num(o.tmax), num(o.tmin));
    f.cloud_day = num(o.cloudDay); f.cloud_night = num(o.cloudNight); f.wind_day = num(o.windDay); f.wind_night = num(o.windNight);
    f.sw = num(o.sw); f.precip = num(o.precip);
    const cn = f.cloud_night, wn = f.wind_night;
    f.calm_clear = (cn == null || wn == null) ? null : (1 - Math.min(100, Math.max(0, cn)) / 100) * Math.exp(-Math.max(0, wn) / 10);
    f.capp_cc = (f.calm_clear == null || s.t_capp == null) ? null : s.t_capp * f.calm_clear;
    f.vdepth_cc = (f.calm_clear == null || s.t_valley_depth == null) ? null : s.t_valley_depth * f.calm_clear;
    return f;
  }

  /* ── evaluators ── */
  function lgb(P, f) {
    const x = P.features.map((c) => f[c]);
    let sum = P.init || 0;
    for (const T of P.trees) {
      let i = 0;
      while (T.f[i] >= 0) {
        let v = x[T.f[i]]; const mt = T.m[i]; let left;
        const miss = v == null || Number.isNaN(v);
        if (mt === 2) left = miss ? T.d[i] === 1 : v <= T.t[i];
        else if (mt === 1) { if (miss) v = 0; left = Math.abs(v) <= 1e-35 ? T.d[i] === 1 : v <= T.t[i]; }
        else { if (miss) v = 0; left = v <= T.t[i]; }
        i = left ? T.l[i] : T.r[i];
      }
      sum += T.v[i];
    }
    return sum;
  }
  function gam(P, f) {
    let sum = P.intercept;
    for (const [c, tb] of Object.entries(P.features)) {
      let v = f[c]; if (v == null || Number.isNaN(v)) v = P.median[c];
      const X = tb.x, G = tb.g, n = X.length;
      if (v <= X[0]) { sum += G[0]; continue; } if (v >= X[n - 1]) { sum += G[n - 1]; continue; }
      let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (X[m] <= v) lo = m; else hi = m; }
      sum += G[lo] + (G[hi] - G[lo]) * (v - X[lo]) / (X[hi] - X[lo]);
    }
    return sum;
  }
  const evalPart = (P, f) => P.kind === 'lgb' ? lgb(P, f) : gam(P, f);

  function basisOf(o) {
    const Mm = model(); if (!Mm) return null;
    if (o.zone && Mm.basisOfZone[o.zone]) return { zone: o.zone, basis: Mm.basisOfZone[o.zone] };
    const z = num(o.servedElevM);   /* no zone given: >= 1,000 m is the zone basis (mountain / hills), else best_match */
    return { zone: null, basis: z != null && z >= 1000 ? 'zone' : 'best_match' };
  }

  function residualDay(lat, lon, o = {}) {
    const Mm = model();
    const none = (why) => ({ dTx: 0, dTn: 0, basis: { label: LABEL, why }, shadow: true, applied: false, zone: o.zone || null });
    if (!Mm) return none(err || 'no model');
    if (lat == null || lon == null || num(o.servedElevM) == null) return none('servedElevM and a point are required');
    const b = basisOf(o); const G = Mm.models[b.basis]; if (!G) return none('no model for this basis');
    if (!aiEnabled()) return none('switched off (NIGRAAN_AI_DOWNSCALE=0 or station data off)');
    const f = features(lat, lon, o);
    if (f.t_elev == null) return none('outside the feature grid');
    /* a day whose response lacks a model input gets no residual (never a guessed input) */
    const miss = [...new Set([...G.day.features, ...G.night.features])].filter((c) => DYN_FEATURES.has(c) && f[c] == null);
    if (miss.length) return none('the response lacks the model inputs (' + miss.join(', ') + ')');
    const cap = Mm.capC ?? 4;
    const clip = (v) => Math.round(capped('downscale.residual', v, cap) * 100) / 100;
    const dTx = clip(evalPart(G.day, f)), dTn = clip(evalPart(G.night, f));
    const inZone = b.zone ? Mm.applyZones.includes(b.zone)
      : Mm.applyZones.some((z) => Mm.basisOfZone[z] === b.basis) && Object.keys(Mm.basisOfZone).filter((z) => Mm.basisOfZone[z] === b.basis).every((z) => Mm.applyZones.includes(z));
    const shadow = !!Mm.shadow; const applied = !shadow && inZone;
    const basis = { label: LABEL, version: Mm.version, model: G.kind, served: b.basis, tier: Mm.tier || 'B' };
    if (!shadow && !inZone) return { dTx: 0, dTn: 0, basis: { ...basis, why: 'not applied in this zone' }, shadow, applied: false, zone: b.zone };
    return { dTx, dTn, basis, shadow, applied, zone: b.zone };
  }

  function residual(lat, lon, o = {}) {
    const r = residualDay(lat, lon, { month: o.month, doy: o.doy, date: o.date, zone: o.zone, servedElevM: o.servedElevM, tmax: o.tmax, tmin: o.tmin,
      cloudDay: o.cloudDay ?? o.cloud, cloudNight: o.cloudNight ?? o.cloud, windDay: o.windDay ?? o.wind, windNight: o.windNight ?? o.wind, sw: o.sw, precip: o.precip });
    const h = num(o.hour);   /* Pakistan hour */
    let w = 0.5;   /* weight of the day residual */
    if (h != null) { if (h >= 9 && h <= 18) w = 1; else if (h >= 21 || h <= 7) w = 0; else if (h < 9) w = (h - 7) / 2; else w = (21 - h) / 3; }
    const dT = Math.round((w * r.dTx + (1 - w) * r.dTn) * 100) / 100;
    return { dT, dTx: r.dTx, dTn: r.dTn, basis: r.basis, shadow: r.shadow, applied: r.applied };
  }

  /* per Pakistan day, the inputs residualDay needs, from a served hourly block (UTC ms times) */
  function dayInputs(tMs, H, { windFactor = 1 } = {}) {
    const out = new Map(); const acc = new Map();
    const T = H.temperature_2m || [], CC = H.cloud_cover || [], W = H.wind_speed_10m || [], S = H.shortwave_radiation || [], P = H.precipitation || [];
    for (let i = 0; i < tMs.length; i++) {
      const k = pktDayKey(tMs[i]); const lh = new Date(tMs[i] + 5 * 3600e3).getUTCHours();
      if (!acc.has(k)) acc.set(k, { T: [], cd: [], cn: [], wd: [], wn: [], sw: [], pr: [] });
      const a = acc.get(k);
      if (T[i] != null) a.T.push(T[i]);
      if (S[i] != null) a.sw.push(S[i]); if (P[i] != null) a.pr.push(P[i]);
      if (lh >= 9 && lh <= 16) { if (CC[i] != null) a.cd.push(CC[i]); if (W[i] != null) a.wd.push(W[i] * windFactor); }
      if (lh <= 7) { if (CC[i] != null) a.cn.push(CC[i]); if (W[i] != null) a.wn.push(W[i] * windFactor); }
    }
    const mean = (v) => v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
    for (const [k, a] of acc) {
      if (a.T.length < 20) continue;   /* the model was trained on days with >= 20 forecast hours */
      out.set(k, { date: k, tmax: Math.max(...a.T), tmin: Math.min(...a.T), cloudDay: mean(a.cd), cloudNight: mean(a.cn), windDay: mean(a.wd), windNight: mean(a.wn),
                   sw: mean(a.sw), precip: a.pr.length >= 12 ? a.pr.reduce((s, x) => s + x, 0) : null });
    }
    return out;
  }

  /* the day terms a served response actually took, by point and Pakistan day: the ensemble members (outlook.mjs) and the
     pool's dissent band (pool.mjs) read them so they carry the same term as the day card at the same point. Filled by the
     national sweep (every tehsil) and every served response; bounded (20k entries, 36 h). v91.17.73 · PERSISTED to
     data/ai-served-terms.json (header built / version / method / n; atomic write: temp file + rename, debounced 2 s) and
     loaded at startup when the file's model version is the served model's, so a restart does not leave the ensemble and
     the pool without the term until the next sweep. */
  const served = new Map();
  const TERMS_FILE = join(dataDir, 'ai-served-terms.json');
  /* v283.36 item 29 · a served term is the term of the run it was computed on: it expires as soon as a newer national run has completed
     (before: kept 36 h whatever the runs did). Without a run clock, the national run's data-age limit (hourly cycle + 2 h delivery). */
  const TTL = dataLimitH('national') * 3600e3;
  const fresh = (v, now) => { const rc = runClock ? runClock() : null; return Number.isFinite(rc) ? v.at >= rc : now - v.at < TTL; };
  const pkey = (lat, lon) => Number(lat).toFixed(4) + ',' + Number(lon).toFixed(4);
  let flushTimer = null, loadedFrom = null, lastFlush = null;
  function loadTerms() {
    try {
      const Mm = model(); if (!Mm || !existsSync(TERMS_FILE)) return;
      const J = JSON.parse(readFileSync(TERMS_FILE, 'utf8'));
      if (!J || J.version !== Mm.version || !J.terms) { loadedFrom = { file: 'ai-served-terms.json', skipped: 'model version ' + (J && J.version) + ' is not the served ' + Mm.version }; return; }
      const now = Date.now(); let n = 0;
      for (const [k, v] of Object.entries(J.terms)) { if (!Array.isArray(v) || !fresh({ at: v[2] }, now)) continue; served.set(k, { dTx: v[0], dTn: v[1], at: v[2] }); n++; }
      loadedFrom = { file: 'ai-served-terms.json', built: J.built, entries: n };
    } catch (e) { loadedFrom = { file: 'ai-served-terms.json', error: e.message }; }
  }
  function flush() {
    flushTimer = null;
    try {
      const Mm = model(); if (!Mm) return false;
      const now = Date.now(); const terms = {};
      for (const [k, v] of served) if (fresh(v, now)) terms[k] = [v.dTx, v.dTn, v.at];
      const out = { built: new Date().toISOString(), version: Mm.version, label: LABEL,
        method: 'the AI local correction terms (Tmax, Tmin residual, degC; epoch ms when served) each served response took, by point (lat,lon to 4 decimals) and Pakistan day; written by server/api/downscale.mjs as the national sweep and served responses compute them; read at startup by the ensemble members and the pool dissent band',
        source: 'server/api/downscale.mjs (model ' + Mm.version + ')', n: Object.keys(terms).length, terms };
      const tmp = TERMS_FILE + '.tmp-' + process.pid;
      writeFileSync(tmp, JSON.stringify(out)); renameSync(tmp, TERMS_FILE); lastFlush = out.built;
      return true;
    } catch (_) { return false; }
  }
  function remember(lat, lon, dayKey, r) {
    const k = pkey(lat, lon) + '|' + dayKey; served.delete(k); served.set(k, { dTx: r.dTx, dTn: r.dTn, at: Date.now() });
    while (served.size > 20000) served.delete(served.keys().next().value);
    if (!flushTimer) { flushTimer = setTimeout(flush, 30000); if (flushTimer.unref) flushTimer.unref(); }
  }
  loadTerms();
  function servedTerm(lat, lon, dayKey) { if (!aiEnabled()) return null; const v = served.get(pkey(lat, lon) + '|' + dayKey); return v && fresh(v, Date.now()) ? v : null; }
  function status() {
    const Mm = model();
    return Mm ? { on: !Mm.shadow && aiEnabled(), shadow: !!Mm.shadow, switchedOff: !aiEnabled(), version: Mm.version, label: LABEL, applyZones: Mm.applyZones, built: Mm.built, servedTerms: { entries: served.size, loadedFrom, lastFlush } } : { on: false, shadow: true, error: err };
  }

  return { residualDay, residual, dayInputs, features, status, model, remember, servedTerm, flushTerms: flush, inputVariables: () => INPUT_VARIABLES.slice(), label: LABEL, _eval: { lgb, gam, evalPart } };
}
