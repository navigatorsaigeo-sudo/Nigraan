/* ══ v91.17.59 · THE MACHINE-LEARNED TEMPERATURE CORRECTION, EVALUATED IN NODE ═══════════════════════════════════
   station-lake/scripts/train_ml.py fits one LightGBM regressor on every observation-forecast pair in the lake (valley
   AWS + synop + airport METAR, ~500k hours) and dumps the trees as JSON (data/ml-mos.json). This module walks those
   trees; there is no Python, no native library and no network at serving time. Features are the model's own fields for
   the hour plus time and site: t, rh, wind (km/h), hour and day-of-year as sin/cos, station height, model-minus-station
   height, latitude, longitude, network flag. The output is Celsius to ADD to the model temperature, capped.

   Where it serves is decided by the export's `serve` verdicts, re-judged at every retrain (reports/ml_fit.md):
     seen_station     lake, 14-day-block hold-out: model 1.60 C vs table 1.82 C  -> the model replaces a station entry
     unseen_mountain  lake, leave-one-station-out on a 12-station draw: the verdict flipped between draws (2.78 vs 2.54, then 1.93 vs 2.54), so mos.mjs does NOT serve the model at unseen mountain points whatever the export says; a full LOSO is the v61 task
     synop_airports   fit <= 2025, scored on 2026: model 1.21 C vs raw 1.33      -> the model replaces a synop entry
   mos.mjs asks for it only where the table itself had a station or synop entry; where the table had nothing (plains
   away from a synop station), nothing is served, as before. */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function createMlMos({ dataDir, log }) {
  const file = join(dataDir, 'ml-mos.json');
  let M = null, err = null, loadedAt = null;
  function load() {
    /* v91.17.269 · PERF A5 · the trees are read only when the replay is switched on (NIGRAAN_MOS_V69=1, the only state in which predict()
       and siteNear() answer): otherwise the model was held in memory and never served. PUT /api/mos/learned still reloads on demand. */
    if (process.env.NIGRAAN_MOS_V69 !== '1') { M = null; loadedAt = null; err = 'not loaded: replay only (NIGRAAN_MOS_V69=1 loads it)'; if (log) log('mlmos', err); return; }
    try { if (existsSync(file)) { M = JSON.parse(readFileSync(file, 'utf8')); loadedAt = new Date().toISOString(); err = null; } else { M = null; err = 'data/ml-mos.json missing'; } }
    catch (e) { M = null; err = e.message; }
    if (log) log('mlmos', M ? `${M.model.n_trees} trees, ${M.rows} rows, serve ${JSON.stringify(M.serve)}` : err);
  }
  load();
  /* v91.17.71 · fitted on best_match (lake + synop), which the mountain zone no longer serves: replay only (NIGRAAN_MOS_V69=1), never a customer path */
  const enabled = () => !!M && process.env.NIGRAAN_ML_MOS !== '0' && process.env.NIGRAAN_MOS_V69 === '1';   /* v91.17.71 · replay only (fitted on best_match), see mos.mjs */
  const FI = () => M.features;
  function walk(node, x) {
    for (;;) {
      if (node.leaf_value != null && node.split_feature == null) return node.leaf_value;
      const v = x[node.split_feature];
      let goLeft;
      if (v == null || Number.isNaN(v)) goLeft = node.default_left !== false;
      else if (node.decision_type === '==') goLeft = String(node.threshold).split('||').includes(String(v));
      else goLeft = v <= node.threshold;
      node = goLeft ? node.left_child : node.right_child;
      if (node.leaf_value != null && node.left_child == null) return node.leaf_value;
    }
  }
  function predict(feat) {
    if (!enabled()) return null;
    const names = FI(); const x = names.map(n => feat[n]);
    let s = 0; for (const t of M.model.trees) s += walk(t, x);
    const cap = M.cap_c || 8; return Math.max(-cap, Math.min(cap, Math.round(s * 100) / 100));
  }
  /* features from what the hour offers; missing rh/wind go in as NaN and the trees take their default branch */
  function features({ tModel, rh, windKmh, whenMs, elevM, modelElevM, lat, lon, net }) {
    const d = new Date(whenMs); const h = d.getUTCHours() + d.getUTCMinutes() / 60;
    const doy = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1;
    return { t_model: tModel, rh_model: rh ?? NaN, wind_model: windKmh ?? NaN, hour_sin: Math.sin(2 * Math.PI * h / 24), hour_cos: Math.cos(2 * Math.PI * h / 24),
             doy_sin: Math.sin(2 * Math.PI * doy / 365.25), doy_cos: Math.cos(2 * Math.PI * doy / 365.25), elev_m: elevM, dz_m: (modelElevM != null && elevM != null) ? modelElevM - elevM : NaN,   /* v91.17.68 · unknown height difference is NaN (default branch of the trees), not 0 (B17) */ lat, lon, net };
  }
  const serve = (zone) => !!(M && M.serve && M.serve[zone]);
  /* v91.17.60 · a site the export validated on its own unseen year, within 30 km and 300 m */
  const kmBetween = (aLat, aLon, bLat, bLon) => { const d = Math.PI / 180, dLat = (bLat - aLat) * d, dLon = (bLon - aLon) * d; const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * d) * Math.cos(bLat * d) * Math.sin(dLon / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(h)); };
  function siteNear(lat, lon, elevM) {
    if (!enabled() || !Array.isArray(M.ml_sites)) return null; let best = null;
    for (const s of M.ml_sites) { const km = kmBetween(lat, lon, s.lat, s.lon); if (km <= 30 && Math.abs((s.elev_m ?? elevM) - elevM) <= 300 && (!best || km < best.km)) best = { ...s, km }; }
    return best;
  }
  const status = () => ({ enabled: enabled(), loadedAt, error: err, built: M && M.built, fitUntil: M && M.fit_until, embargoDays: M && M.embargo_days, rowsAvailable: M && M.rows_available, trees: M && M.model.n_trees, rows: M && M.rows, features: M && M.features, serve: M && M.serve, sites: M && M.ml_sites ? M.ml_sites.map(s => s.id) : [], holdout: M && M.holdout, windows: M && M.windows });
  return { predict, features, serve, siteNear, status, reload: load };
}
