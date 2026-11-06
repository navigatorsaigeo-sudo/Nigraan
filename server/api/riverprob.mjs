/* v91.17.105 · RIVER FLOOD AS A PROBABILITY OF THE OFFICIAL FLOW CLASS.
   station-lake/scripts/river_prob_model.py fits a pooled cumulative-logistic model with isotonic recalibration that turns the river
   model's daily discharge at a gauged reach into P(official observed class >= Low) and P(>= Medium), validated leave-one-monsoon-out
   on 2024 and 2025 (Brier skill vs climatology 0.09-0.24, AUC 0.73-0.85). P(>= High) failed its held-out test in 2025 and is withheld.
   The probability and the official class are separate outputs: nothing here is converted into a class.
   Inputs: data/river-prob-model.json, data/river-rarity.json (each reach's model 2-year flow and half-month p95), data/flood.json
   (the river forecast: ensemble median per reach and day), data/river-link.json (reach -> tehsils along the river, v91.17.283.13; was the page's reach table).
   A reach is served only if the model was trained on it (it has official flood limits) and its own model fit is not refused or
   found to under-call at the gauges. */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RIVER_STALE_H } from './flood.mjs';

export function createRiverProb(dataDir) {
  const cache = {};
  function rd(name) {
    const f = join(dataDir, name);
    try { const m = statSync(f).mtimeMs; if (!cache[name] || cache[name].m !== m) cache[name] = { m, j: JSON.parse(readFileSync(f, 'utf8')) }; return cache[name].j; } catch (_) { return null; }
  }
  const halfMonth = (iso) => { const m = Number(iso.slice(5, 7)), d = Number(iso.slice(8, 10)); return (m - 1) * 2 + (d > 15 ? 1 : 0); };
  function pOf(T, x) {
    let s = T.intercept; for (let i = 0; i < T.coef.length; i++) s += T.coef[i] * x[i];
    const p = 1 / (1 + Math.exp(-s)), X = T.isotonic.x, Y = T.isotonic.y;
    if (!X.length) return p; if (p <= X[0]) return Y[0]; if (p >= X[X.length - 1]) return Y[Y.length - 1];
    let k = 1; while (k < X.length && X[k] < p) k++; const f = (p - X[k - 1]) / ((X[k] - X[k - 1]) || 1); return Y[k - 1] + f * (Y[k] - Y[k - 1]);
  }
  function national() {
    const M = rd('river-prob-model.json'), R = rd('river-rarity.json'), F = rd('flood.json'), U = rd('river-link.json');   /* v91.17.283.13 · audit B4 · tehsils by drainage (river-link.json), not the district list */
    if (!M) return { ready: false, why: 'data/river-prob-model.json is missing (station-lake/scripts/river_prob_model.py)' };
    if (!F || !F.forecast) return { ready: false, why: 'the river forecast job has not run' };
    if (!R || !R.reaches) return { ready: false, why: 'data/river-rarity.json is missing' };
    /* v91.17.157 · audit · the chance is withheld on a forecast older than 30 h (the riverine stale rule), not served as today's */
    const fAgeH = (Date.now() - Date.parse(F.forecast.at)) / 3600e3;
    if (!(fAgeH <= RIVER_STALE_H)) return { ready: false, stale: true, forecastAt: F.forecast.at, why: 'the river forecast is ' + (isFinite(fAgeH) ? Math.round(fAgeH) + ' h' : 'of unknown age') + ' old; chances are withheld until it refreshes' };
    const thr = Object.entries(M.thresholds).filter(([, t]) => t.served).map(([k]) => k);
    const out = { ready: true, version: M.version, forecastAt: F.forecast.at, days: F.forecast.days, served: thr.map(k => M.thresholds[k].name), withheld: Object.entries(M.thresholds).filter(([, t]) => !t.served).map(([, t]) => t.name + ': did not pass its held-out test in both monsoons'), reaches: {} };
    for (const id of M.reaches || []) {
      const P = F.forecast.points[id], RR = R.reaches[id];
      const row = { name: P && P.point ? P.point.name : id, river: P && P.point ? P.point.river : null, units: U && U.units ? Object.keys(U.units).filter((k) => U.units[k].reaches && U.units[k].reaches[id]) : [], days: [] };
      if (!P) { row.why = 'no river forecast for this reach'; out.reaches[id] = row; continue; }
      if (P.carriedFrom && (Date.now() - Date.parse(P.carriedFrom)) / 3600e3 > RIVER_STALE_H) { row.why = 'this reach failed in the last runs; its last forecast is older than ' + RIVER_STALE_H + ' h'; out.reaches[id] = row; continue; }
      /* v91.17.124 · the same withholding rule as flood.mjs rarityClass(): a reach the model does not represent (regulated dams,
         flow 8x or 1/100 of observed) gets no chance either; before this the chance was still served at three such reaches */
      if (!RR || !RR.levels || RR.fitRefused || RR.modelRepresentsRiver === false || (RR.gaugeCheck && RR.gaugeCheck.verdict === 'under-call')) { row.why = 'the river model does not represent this reach well enough'; out.reaches[id] = row; continue; }
      for (const d of P.days || []) {
        const q = d && d.q ? d.q[1] : null; const bin = RR.seasonal && RR.seasonal[halfMonth(d.date)]; const p95 = bin && bin[3];
        if (!(q > 0) || !(RR.levels.rp2 > 0) || !(p95 > 0)) { row.days.push({ date: d.date, p: null, why: 'no model flow or rarity for this day' }); continue; }
        const x = { r2: Math.log(q / RR.levels.rp2), r95: Math.log(q / p95) }; const xv = M.features.map(f => x[f]);
        const p = {}; let prev = 1;
        for (const k of ['1', '2', '3']) { const T = M.thresholds[k]; if (!T) continue; const v = Math.min(prev, pOf(T, xv)); prev = v; if (T.served) p[k] = Math.round(v * 1000) / 10; }
        row.days.push({ date: d.date, p });
      }
      out.reaches[id] = row;
    }
    return out;
  }
  /* per tehsil for a map layer: the highest chance among the reaches routed through it */
  function unitLayer(k, dayIdx) {
    const N = national(); if (!N.ready) return N;
    const date = N.days[Math.min(Math.max(0, dayIdx | 0), N.days.length - 1)]; const values = {}, whys = {};
    if (!N.served.length || !(k in ((rd('river-prob-model.json') || {}).thresholds || {})) || !(rd('river-prob-model.json').thresholds[k].served)) return { ready: false, why: 'this threshold did not pass its held-out test' };
    for (const r of Object.values(N.reaches)) for (const uid of r.units) {
      const d = r.days.find(x => x.date === date);
      if (d && d.p && d.p[k] != null) { if (values[uid] == null || d.p[k] > values[uid]) values[uid] = d.p[k]; }
      else if (values[uid] == null) whys[uid] = r.why || (d && d.why) || 'no chance for this day';
    }
    return { ready: true, date, days: N.days, values, whys, version: N.version };
  }
  return { national, unitLayer };
}
