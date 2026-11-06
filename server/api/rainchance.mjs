/* ══ v91.17.101 · CALIBRATED RAIN CHANCES (audit #11) ═════════════════════════════════════════════════════════════════════
   The served forecast's rain turned into the CHANCE of a 1 / 10 / 25 / 50 mm day, from station-lake/scripts/rain_chance_model.py
   (data/rain-chance-model.json): a logistic model on the point's forecast day total, the forecast in the 0.5-degree neighbourhood
   (max, mean, wet share), the day before and after, season, zone and position, followed by an isotonic calibration, trained on
   2024-05 .. 2025-12 and tested on 2026 against NASA GPM IMERG day totals. A (threshold, zone) cell is served only where its held-out
   Brier skill cleared the gate; elsewhere the chance is withheld with the reason.
     inputs   the latest complete national tehsil run (app.store 'runs' / 'records'), Pakistan days with >= 20 forecast hours
     output   national() { ready, runId, base, days, thresholds, units: { uid: { zone, days: [{ date, fcMm, p: {1,10,25,50} }] } } }
   The model was fitted on short-lead forecasts; days 2-3 of a run carry the same model and say so (lead). */
import { readFileSync, statSync } from 'node:fs';
import { lgbEval } from './natmodel.mjs';
import { join } from 'node:path';

import { pktDay, hourEndingDay } from './pktday.mjs';
const L1 = (x) => Math.log1p(Math.max(0, x == null || !isFinite(x) ? 0 : x));

export function createRainChance(app, dataDir) {
  const file = join(dataDir, 'rain-chance-model.json');
  let M = null, Mt = 0, cache = null;
  function model() {
    try { const t = statSync(file).mtimeMs; if (!M || t !== Mt) { M = JSON.parse(readFileSync(file, 'utf8')); Mt = t; cache = null; } } catch (_) { M = null; }
    return M;
  }
  /* ══ v91.17.181 · RAIN AMOUNT RANGE (data/rain-amount-model.json, station-lake/scripts/rain_amount_final.py) ══════════════════════
     P10 / P50 / P90 of the day's rain over the ~10 km area around the place (IMERG day total), from the same 17 inputs as the chance.
     Held out on unseen places and the 2026 season: plains only (P50 and P90 for today and the next 3 days, P10 for today and tomorrow);
     mountains withheld (not reliable against the valley gauges). The quantile levels are re-chosen monthly; after validUntil the range is
     withheld with the reason. P50 may be 0: a dry day is part of the distribution. */
  const afile = join(dataDir, 'rain-amount-model.json'); let A = null, At = 0;
  function amodel() { try { const t = statSync(afile).mtimeMs; if (!A || t !== At) { A = JSON.parse(readFileSync(afile, 'utf8')); At = t; cache = null; } } catch (_) { A = null; } return A; }
  function amount(x, zone, lead, date) {
    const a = amodel(); if (!a) return null;
    const Z = a.zones && a.zones[zone];
    if (!Z || !Z.serve) return { why: (Z && Z.why) || 'no amount range for this zone' };
    if (a.validUntil && date > a.validUntil) return { why: 'withheld: the range is re-checked monthly and this month\u2019s check is not in yet (valid until ' + a.validUntil + ')' };
    const q = ['0.1', '0.5', '0.9'].map((k) => { const lv = String(Z.levels[k]); const m = a.models[lv]; return m ? Math.max(0, lgbEval(m, x)) : null; });
    if (q.some((v) => v == null)) return { why: 'model incomplete' };
    q.sort((u, v) => u - v);
    const r = (v) => Math.round(v * 10) / 10, ok = (k) => lead <= (Z.maxLeadDays[k] ?? -1);
    const out = { p10: ok('0.1') ? r(q[0]) : null, p50: ok('0.5') ? r(q[1]) : null, p90: ok('0.9') ? r(q[2]) : null, area: '~10 km around the place', version: a.version };
    if (a.p90cap != null && out.p90 != null && out.p90 > a.p90cap) { out.p90 = null; out.p90Over = a.p90cap; }
    if (out.p10 == null && out.p50 == null && out.p90 == null) return { why: 'withheld beyond the lead days the range passed its test' };
    return out;
  }
  function amountSelfcheck() { const a = amodel(); if (!a || !a.selfcheck) return null; let d = 0;
    for (const s of a.selfcheck) for (const [lv, y] of Object.entries(s.y)) { const m = a.models[lv]; if (m) d = Math.max(d, Math.abs(lgbEval(m, a.features.map((f) => s.x[f])) - y)); } return d; }
  /* v91.17.103 · the complete runs held, newest first (up to 8). A run starts at its base hour, so a run issued at 11:00 PKT holds
     only 13 hours of today and today failed the 20-hour rule: after the first run of the day "today" had no chance at all (the
     map's rain layer went to no-data on the laptop). Each PKT day now takes its total from the NEWEST run that still holds >= 20
     of its hours, i.e. the run issued earlier for that day; the row says which run and at what lead. */
  function completeRuns() {
    const runs = app.store.filter('runs', r => r.status === 'complete' && r.unit_level === 'tehsil' && !r.records_pruned)
      .sort((a, b) => String(b.completed_at || '').localeCompare(String(a.completed_at || '')));
    const out = [];
    for (const r of runs) { const recs = app.store.filter('records', x => x.runId === r.run_id); if (recs.length >= 400) out.push({ run: r, recs }); if (out.length >= 8) break; }
    return out;
  }
  /* ══ v91.17.259 · D14 · REGIONAL RECALIBRATION WHERE IT PASSED (data/rain-chance-recal.json, cells[].region x threshold) ══════
     p' = 1 / (1 + exp(-(a + b logit p))) (Platt 1999; Cox 1958 calibration line) on the served chance, fitted on out-of-sample
     2024-25 training predictions, tested on 2026 against IMERG: hills 10 mm Brier skill 0.141 -> 0.212 (gain +0.070, 90 %
     +0.032..+0.095), calibration slope 0.76 -> 1.02. The region is the national table zoner (mos.zoneOfPoint), the rule the
     test used. Only cells with a region and a threshold the server can place are used (the mountain-gauge ensemble cell is a
     gauge-site result and is not applied at tehsils). */
  const rfile = join(dataDir, 'rain-chance-recal.json'); let RC = null, RCt = 0;
  function recal() { try { const t = statSync(rfile).mtimeMs; if (!RC || t !== RCt) { RC = JSON.parse(readFileSync(rfile, 'utf8')); RCt = t; cache = null; } } catch (_) { RC = null; } return RC; }
  function recalCell(region, T) { const R = recal(); if (!R || !R.cells || !region) return null; const c = Object.values(R.cells).find(c => c.region === region && Number(c.threshold) === Number(T) && Number.isFinite(c.a) && Number.isFinite(c.b)); return c || null; }
  function chance(T, z) {
    const t = M.thresholds[String(T)]; if (!t) return null;
    let s = t.intercept; for (let i = 0; i < t.coef.length; i++) s += t.coef[i] * z[i];
    const p = 1 / (1 + Math.exp(-s));
    const X = t.isotonic.x, Y = t.isotonic.y; if (!X.length) return p;
    if (p <= X[0]) return Y[0]; if (p >= X[X.length - 1]) return Y[Y.length - 1];
    let k = 1; while (k < X.length && X[k] < p) k++;
    const f = (p - X[k - 1]) / ((X[k] - X[k - 1]) || 1); return Y[k - 1] + f * (Y[k] - Y[k - 1]);
  }
  function national() {
    if (!model()) return { ready: false, why: 'data/rain-chance-model.json is missing (station-lake/scripts/rain_chance_model.py)' };
    const RS = completeRuns(); if (!RS.length) return { ready: false, why: 'no complete national tehsil run held' };
    const L = RS[0], sig = RS.map(x => x.run.run_id).join(',');
    if (cache && cache.sig === sig && cache.modelVersion === M.version && cache.amtVersion === ((amodel() || {}).version || null)) return cache;
    /* per unit: PKT-day totals from the hourly precipitation (days with >= 20 hours), each day from the newest run that holds it */
    const byU = new Map(), today = pktDay(Date.now()), yesterday = pktDay(Date.now() - 864e5);
    for (const R of RS) {
      const baseDay = pktDay(Date.parse(R.run.base_valid_time || R.run.completed_at || Date.now()));
      for (const r of R.recs) {
        if (r.disputed) continue;   /* IIOJK is not scored (AGN sovereignty rule) */
        /* v91.17.283.3 · W1 · the record's hours after the last lead to the end of PKT day 4 (national.mjs rainExt, same answer) complete
           days 3 and 4; day 4 is a neighbour only (the predictor 'next day' of day 3), never served */
        const H = r.hourly || {}, P0 = r.pastToday || {}, X = r.rainExt || {}, tm = [...(P0.time || []), ...(H.time || []), ...(X.time || [])], pr = [...(P0.precipitation || []), ...(H.precipitation || []), ...(X.precipitation || [])]; const by = new Map();
        /* v91.17.125 · external audit A17 · an hour counts once (a repeated timestamp no longer fills a day) and only as a finite number */
        tm.forEach((t, i) => { const ms = Date.parse(t); if (!Number.isFinite(ms)) return; const d = hourEndingDay(ms);   /* v283.28 S2: an hour-ending amount -> its PKT day (pktday.mjs, the one rule) */ const e = by.get(d) || { s: 0, n: 0, seen: new Set() }; if (!e.seen.has(ms) && typeof pr[i] === 'number' && Number.isFinite(pr[i])) { e.seen.add(ms); e.s += pr[i]; e.n++; } by.set(d, e); });
        let u = byU.get(r.unitKey);
        if (!u) { const el = r.resolvedElevationM ?? (r.temperatureBasis && r.temperatureBasis.elevM) ?? null; u = { uid: r.unitKey, lat: +r.lat, lon: +r.lon, el, days: new Map(), src: new Map(), nbOnly: new Map() }; byU.set(r.unitKey, u); }
        /* yesterday is kept too (as the predictor 'previous day' for today), never served; a day with 20-23 hours is served flagged partial */
        for (const [d, e] of by) if (e.n >= 20 && d >= yesterday && !u.days.has(d) && !u.nbOnly.has(d)) { const lead = Math.round((Date.parse(d) - Date.parse(baseDay)) / 864e5);
          if (X.time && lead > 3) { u.nbOnly.set(d, e.s); continue; }   /* W1: a day past the engine's day 3, complete only with rainExt: neighbour only */
          u.days.set(d, e.s); u.src.set(d, { run: R.run.run_id, issued: R.run.base_valid_time || null, lead, hours: e.n }); }
      }
    }
    const U = [...byU.values()];
    const allDaysAll = [...new Set(U.flatMap(u => [...u.days.keys()]))].sort(); const allDays = allDaysAll.filter(d => d >= today);
    const dayAfter = (d) => pktDay(Date.parse(d + 'T12:00:00+05:00') + 864e5), dayBefore = (d) => pktDay(Date.parse(d + 'T12:00:00+05:00') - 864e5);
    const NB = M.neighbourhoodDeg || 0.5, mu = M.standardise.mean, sd = M.standardise.sd;
    const nb = U.map(u => U.filter(v => Math.abs(v.lat - u.lat) <= NB && Math.abs(v.lon - u.lon) <= NB));
    const out = { ready: true, sig, amtVersion: (amodel() || {}).version || null, runId: L.run.run_id, base: L.run.base_valid_time, completed: L.run.completed_at, modelVersion: M.version, days: allDays,
      thresholds: Object.keys(M.thresholds).map(Number), served: Object.fromEntries(Object.entries(M.thresholds).map(([k, t]) => [k, t.serve])),
      target: M.target, test: M.test, units: {},
      note: 'Chance of a satellite (IMERG) day total at or above the threshold over the ~10 km pixel, from the served forecast. Fitted on short-lead forecasts; later days use the same model.' };
    U.forEach((u, k) => {
      const zone = (u.el != null && u.el >= 1000) ? 'mountain' : 'plains'; const mtn = zone === 'mountain' ? 1 : 0;
      let natZone = null; try { natZone = app && app.mos && app.mos.zoneOfPoint ? app.mos.zoneOfPoint(u.lat, u.lon, u.el) : null; } catch (_) { natZone = null; }
      const rows = [];
      allDays.forEach((d, j) => {
        if (!u.days.has(d)) return;
        const fc = u.days.get(d); const vals = nb[k].map(v => v.days.get(d)).filter(v => v != null);
        const nmax = vals.length ? Math.max(...vals) : fc, nmean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : fc, nwet = vals.length ? vals.filter(v => v >= 1).length / vals.length : (fc >= 1 ? 1 : 0);
        /* A17 · the neighbour days are the calendar days before and after, looked up by date; a missing one is NOT 0 mm: the chance is
           withheld for that day with the reason (the model was trained with both neighbours present) */
        const prev = u.days.get(dayBefore(d)), next = u.days.has(dayAfter(d)) ? u.days.get(dayAfter(d)) : u.nbOnly.get(dayAfter(d)); const nbMissing = prev == null ? 'previous' : next == null ? 'next' : null;
        const m = Number(d.slice(5, 7));
        const x = [L1(fc), L1(fc) ** 2, L1(nmax), L1(nmean), nwet, L1(prev), L1(next), 0,
          Math.sin(2 * Math.PI * m / 12), Math.cos(2 * Math.PI * m / 12), Math.sin(4 * Math.PI * m / 12), Math.cos(4 * Math.PI * m / 12),
          mtn, mtn * L1(fc), mtn * L1(nmax), (u.lat - 30) / 5, (u.lon - 70) / 5];
        const z = x.map((v, i) => (v - mu[i]) / (sd[i] || 1));
        const p = {}, why = {}; let rcNote = null;
        for (const T of out.thresholds) { const ok = M.thresholds[String(T)].serve && M.thresholds[String(T)].serve[zone];
          if (ok && nbMissing) { p[T] = null; why[T] = 'withheld: the ' + nbMissing + ' day\u2019s forecast total is not held, and the model needs it'; }
          else if (ok) { let pc = chance(T, z); const rc = recalCell(natZone, T);
            if (rc && pc != null) { const q = Math.min(1 - 1e-6, Math.max(1e-6, pc)); pc = 1 / (1 + Math.exp(-(rc.a + rc.b * Math.log(q / (1 - q))))); (rcNote = rcNote || {})[T] = 'recalibrated for the ' + natZone + ' (held out on 2026: Brier skill ' + rc.heldOut.served.bss + ' -> ' + rc.heldOut.new.bss + ')'; }
            p[T] = Math.round(pc * 1000) / 10; } else { p[T] = null; why[T] = 'withheld: the ' + T + ' mm chance did not pass its held-out skill test in the ' + zone + ' zone'; } }
        const sr = u.src.get(d) || {};
        const lead = sr.lead != null ? sr.lead : j;
        let amt = null; try { amt = nbMissing ? { why: 'withheld: the ' + nbMissing + ' day\u2019s forecast total is not held' } : amount(x, zone, lead, d); } catch (_) { amt = null; }
        rows.push({ date: d, lead, run: sr.run || null, issued: sr.issued || null, fcMm: Math.round(fc * 10) / 10, hours: sr.hours ?? null, partial: (sr.hours ?? 24) < 24, p, ...(amt ? { amt } : {}), ...(Object.keys(why).length ? { why } : {}), ...(rcNote ? { recal: rcNote } : {}) });
      });
      out.units[u.uid] = { zone, days: rows };
    });
    cache = out; return out;
  }
  function unit(uid) { const n = national(); if (!n.ready) return n; const u = n.units[uid]; return u ? { ready: true, runId: n.runId, modelVersion: n.modelVersion, unit: uid, ...u, note: n.note } : { ready: false, why: 'unit not in the run' }; }
  return { national, unit, amountSelfcheck, amountModel: () => { const a = amodel(); return a ? { version: a.version, validUntil: a.validUntil, zones: a.zones, levelsChosenOn: a.levelsChosenOn } : null; } };
}
