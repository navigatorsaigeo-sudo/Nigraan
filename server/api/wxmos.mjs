/* ══ v91.17.187 · WEATHER MOS (data/weather-mos.json, station-lake/scripts/wxmos_train.py) ═══════════════════════════════════════════
   The served temperature corrected for the weather of the hour. The fixed steps of the chain (zone basis, station calibration) do not
   change with cloud, sun, rain or wind; the step-0 hindcast (6 Oct 2026) found the chain 1.5 C warm under overcast skies, with no gain
   over the raw forecast there. This model learns what the whole chain, as served without live terms, still gets wrong:
       y = observed - served           (191 stations: MACH database, PMD-EWS valley AWS, PMD AWS; 25 Mar - 5 Oct 2026)
       x = the national model's feature rows from the provider's own values (natmodel internals.rows) + (served - raw)
       served' = served + w_zone x LightGBM(x), only in zones that passed both held-out tests (weather-mos.json zones)
   Placed after the static chain and the airport offsets, before the synop and live MACH terms (they are measured against it).
   Features are read from the provider's values as they arrived (loc.__rawH, stashed before anything moved them), as in training.
   Horizon: full weight to the national model's horizon, fading with it (it was fitted on short-lead forecasts).
   NIGRAAN_WXMOS=0 switches it off; /px __nowx=1 leaves it out of a response (its own training replays).
   v91.17.189 · SEASON GATE: applied only to forecast hours whose PKT calendar day lies inside the season the model was fitted on
   (weather-mos.json season, else training.window: 25 Mar - 5 Oct). Evidence (station-lake/scripts/wxmos_oof_train.py, 6 Oct): on the
   national model's out-of-fold served values (places and weeks it never saw), the same method refitted with folds shared with the
   national model beat the served value inside the season in 2026 (mountain 1.724 -> 1.610, hills 2.083 -> 1.974, plains
   1.422 -> 1.395 C), but outside it, on 2024-26 rows, no zone gained by the 0.02 C promotion margin (mountain -0.013, hills -0.001)
   and plains got worse (+0.026; Nov - Feb +0.03 to +0.04, mountain December +0.05). It does not extrapolate into a winter it has
   not seen; a winter version needs this winter's rows. */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { evalBatch, evalLocal, drive } from './lgbpool.mjs';
import { esatHpa } from './psychro.mjs';

const r1 = (v) => Math.round(v * 10) / 10;
export const RAW_KEYS = ['dew_point_2m', 'relative_humidity_2m', 'wind_speed_10m', 'wind_direction_10m', 'cloud_cover', 'shortwave_radiation', 'precipitation'];

/* the fitted season as month-day numbers (MMDD), from weather-mos.json season {from:'MM-DD', to:'MM-DD'} or training.window */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function seasonOf(m) {
  const w = (m && m.season && m.season.from && m.season.to) ? [m.season.from, m.season.to] : (m && m.training && Array.isArray(m.training.window) ? m.training.window.map(x => String(x).slice(5, 10)) : null);
  if (!w || !/^\d\d-\d\d$/.test(w[0]) || !/^\d\d-\d\d$/.test(w[1])) return null;
  const md = (x) => Number(x.slice(0, 2)) * 100 + Number(x.slice(3, 5)); const lab = (x) => Number(x.slice(3, 5)) + ' ' + MON[Number(x.slice(0, 2)) - 1];
  if (w[0] === '01-01' && w[1] === '12-31') return null;
  return { from: md(w[0]), to: md(w[1]), label: lab(w[0]) + ' - ' + lab(w[1]) };
}
export function inSeason(tsMs, S) {
  const d = new Date(tsMs + 5 * 3600e3); const md = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();   /* PKT calendar day */
  return S.from <= S.to ? (md >= S.from && md <= S.to) : (md >= S.from || md <= S.to);
}
/* v189 · the held-out figure shown: the out-of-fold check at places neither the national model nor this model saw (season evidence), else the fit's own */
function heldOutText(m, zone, Z) { const e = m.season && m.season.evidence && m.season.evidence.inSeason_2026_sameMethod_foldsSharedWithNational; const v = e && e[zone];
  if (Array.isArray(v)) return v[0] + ' -> ' + v[1] + ' C at places it never saw'; return Z.spatial ? Z.spatial.served + ' -> ' + Z.spatial.mos + ' C' : ''; }
export function createWxMos(app, dataDir) {
  const file = join(dataDir, 'weather-mos.json'); let M = null, mt = 0, err = null;
  /* v91.17.193 · a second, winter model (data/weather-mos-winter.json, fitted on Nov 2025 - Mar 2026 with the same tests) covers the
     days outside the summer model's season; each hour is corrected by the model whose season holds its PKT day, never by both */
  const fileW = join(dataDir, 'weather-mos-winter.json'); let MW = null, mtW = 0;
  const on = () => process.env.NIGRAAN_WXMOS !== '0';
  /* v91.17.233 · the file is checked on disk at most every 30 s (the laptop profile: existsSync/statSync on every call, 8 s in 150 s) */ 
  let mAt = 0, wAt = 0;
  function model() { if (M && Date.now() - mAt < 30e3) return M; mAt = Date.now(); try { if (!existsSync(file)) return null; const t = statSync(file).mtimeMs; if (!M || t !== mt) { M = JSON.parse(readFileSync(file, 'utf8')); mt = t; err = null; } return M; } catch (e) { err = String(e.message || e); return null; } }
  function winter() { if (MW && Date.now() - wAt < 30e3) return MW; wAt = Date.now(); try { if (!existsSync(fileW)) return null; const t = statSync(fileW).mtimeMs; if (!MW || t !== mtW) { MW = JSON.parse(readFileSync(fileW, 'utf8')); mtW = t; } return MW; } catch (e) { err = String(e.message || e); return null; } }
  /* the provider's values before any step moves them (called first thing in correctLocation) */
  function stash(loc) { try { const H = loc && loc.hourly; if (!H || !Array.isArray(H.time)) return; const s = {}; for (const k of RAW_KEYS) if (Array.isArray(H[k])) s[k] = H[k].slice();
    Object.defineProperty(loc, '__rawH', { value: s, enumerable: false, configurable: true }); } catch (_) {} }
  function apply(loc, lat, lon) { return drive(applySteps(loc, lat, lon, false)); }
  /* v91.17.231 · applySteps: the same computation as a generator; with A (async) the tree batches go to the worker pool (lgbpool.mjs) */
  function* applySteps(loc, lat, lon, A = false) {
    if (!on() || !loc || !loc.hourly) return false;
    const m = model(); const H = loc.hourly; const T0 = loc.__T0;
    if (!m) return false;
    if (!Array.isArray(T0) || !Array.isArray(H.temperature_2m) || T0.length !== H.temperature_2m.length) { loc.agn_wxmos = { applied: false, why: 'no raw forecast series for this response' }; return false; }
    const elev = loc.elevation != null ? Number(loc.elevation) : null;
    let zone = null; try { zone = app.mos && app.mos.zoneOfPoint ? app.mos.zoneOfPoint(lat, lon, elev) : null; } catch (_) { zone = null; }
    const W = winter(); const MODELS = [m].concat(W && W.features && W.features.join() === (m.features || []).join() ? [W] : [])
      .map(mm => ({ mm, S: seasonOf(mm), Z: zone && mm.zones && mm.zones[zone] })).filter(x => x.Z && x.Z.applied && x.Z.w > 0);
    const Z = MODELS.length ? MODELS[0].Z : null;
    if (!MODELS.length) { loc.agn_wxmos = { applied: false, zone, why: 'the held-out tests did not beat the served chain in this zone' }; return false; }
    const N = app.national && app.national.internals; if (!N || !N.rows) return false;
    /* best_match's own humidity and wind where a zone merge blended the members (the stash the merge keeps), else the values as they arrived */
    const raw = { ...(loc.__rawH || {}) }; const NT = H.__natT;
    if (NT) { if (Array.isArray(NT.__dew)) raw.dew_point_2m = NT.__dew; if (Array.isArray(NT.__rh)) raw.relative_humidity_2m = NT.__rh; if (Array.isArray(NT.__ws)) raw.wind_speed_10m = NT.__ws; }
    const L2 = { ...loc, hourly: { ...H, ...raw, temperature_2m: T0 } };
    const horizonH0 = loc.__natH != null ? Number(loc.__natH) : 132;
    /* rows whose fade is zero are not read: build only to the horizon + 24 h (+ 1 h for the time this call takes) */
    const cutMs = Number.isFinite(horizonH0) ? Date.now() + (horizonH0 + 25) * 3600e3 : null;
    let rows; try { rows = N.rows(L2, lat, lon, T0, null, 1, cutMs); } catch (e) { loc.agn_wxmos = { applied: false, why: 'feature rows failed: ' + e.message }; return false; }
    const { out, ts } = rows; const F = m.features; const now = Date.now();
    const horizonH = loc.__natH != null ? Number(loc.__natH) : 132;
    const SEA = seasonOf(m); let outside = 0; const used = {};
    const before = H.temperature_2m.slice(); let n = 0, sum = 0;
    /* the rows to evaluate, grouped by the model whose season holds them; evaluated in one batch per model */
    const plan = [];
    for (let i = 0; i < out.length; i++) {
      const f = out[i];
      /* an hour past the cut has no row, but is still counted when it lies outside every model's season (hoursOutsideSeason) */
      if (!f) { if (cutMs != null && ts[i] > cutMs && before[i] != null && T0[i] != null && !MODELS.find(x => !x.S || inSeason(ts[i], x.S))) outside++; continue; }
      if (before[i] == null || T0[i] == null) continue;
      const hit = MODELS.find(x => !x.S || inSeason(ts[i], x.S));
      if (!hit) { outside++; continue; }
      const ahead = (ts[i] - now) / 3600e3; const fade = Math.max(0, Math.min(1, (horizonH + 24 - ahead) / 24)); if (fade <= 0) continue;
      f.srv_d = before[i] - T0[i];
      plan.push({ i, hit, fade, x: F.map(c => f[c] ?? null) });
    }
    if (A && plan.length) yield 'wx-rows';   /* a turn for other requests between building the rows and evaluating them */
    const pv = new Map();
    for (const mm of new Set(plan.map(q => q.hit.mm))) {
      const part = plan.filter(q => q.hit.mm === mm), X = part.map(q => q.x);
      let v = null; if (A) { const r = yield evalBatch({ file: mm === m ? file : fileW, path: ['mean'], version: mm.version }, X); if (r) v = Array.from(r); }
      if (!v) v = evalLocal(mm.mean, X);
      part.forEach((q, j) => pv.set(q.i, v[j]));
    }
    for (const q of plan) {
      const i = q.i, hit = q.hit, fade = q.fade;
      const p = pv.get(i); if (!Number.isFinite(p)) continue;
      const T1 = r1(before[i] + hit.Z.w * p * fade); if (T1 === before[i]) continue; used[hit.mm.version] = (used[hit.mm.version] || 0) + 1;
      H.temperature_2m[i] = T1; sum += T1 - before[i]; n++;
      if (Array.isArray(H.relative_humidity_2m) && H.relative_humidity_2m[i] != null) H.relative_humidity_2m[i] = Math.max(1, Math.min(100, Math.round(H.relative_humidity_2m[i] * esatHpa(before[i]) / esatHpa(T1))));
      if (Array.isArray(H.dew_point_2m) && H.dew_point_2m[i] != null && H.dew_point_2m[i] > T1) H.dew_point_2m[i] = T1;
      if (Array.isArray(H.apparent_temperature) && H.apparent_temperature[i] != null) H.apparent_temperature[i] = r1(H.apparent_temperature[i] + (T1 - before[i]));
    }
    const C = loc.current, off = (loc.utc_offset_seconds || 0) * 1000;
    if (n && C && C.temperature_2m != null && C.time) {
      const tc = Date.parse(C.time + 'Z') - off; let k = -1, best = 1e18; ts.forEach((t, i) => { const d = Math.abs(t - tc); if (d < best) { best = d; k = i; } });
      if (k >= 0 && best <= 3600e3 && before[k] != null) { const d = H.temperature_2m[k] - before[k]; if (d) { const t0 = C.temperature_2m; C.temperature_2m = r1(t0 + d);
        if (C.relative_humidity_2m != null) C.relative_humidity_2m = Math.max(1, Math.min(100, Math.round(C.relative_humidity_2m * esatHpa(t0) / esatHpa(C.temperature_2m))));
        if (C.apparent_temperature != null) C.apparent_temperature = r1(C.apparent_temperature + d); } }
    }
    if (!n && outside) { loc.agn_wxmos = { applied: false, version: m.version, zone, why: 'outside the seasons its models were fitted on (' + MODELS.map(x => x.S ? x.S.label : 'all year').join(', ') + ')' }; return false; }
    loc.agn_wxmos = { applied: n > 0, version: Object.keys(used).join(' + ') || m.version, zone, weight: Z.w, hours: n, meanChangeC: n ? r1(sum / n) : 0, season: MODELS.map(x => x.S ? x.S.label : 'all year').join(' + '), hoursOutsideSeason: outside, hoursByModel: used,
      note: 'weather MOS: the served value corrected for the hour’s cloud, sun, rain and wind (held out: ' + (function () { const top = Object.entries(used).sort((a, b) => b[1] - a[1])[0]; const x = (top && MODELS.find(y => y.mm.version === top[0])) || MODELS[0]; return heldOutText(x.mm, zone, x.Z); })() + ')' };
    return n > 0;
  }
  function status() { const m = model(), w = winter(); return { on: on(), version: m && m.version, built: m && m.built, zones: m && m.zones, evaluation: m && m.evaluation, training: m && m.training, error: err,
    winter: w ? { version: w.version, built: w.built, season: w.season && { from: w.season.from, to: w.season.to }, zones: w.zones, sameFeatures: !!(w.features && m && w.features.join() === (m.features || []).join()) } : null }; }
  return { apply, applySteps, stash, status, model };
}
