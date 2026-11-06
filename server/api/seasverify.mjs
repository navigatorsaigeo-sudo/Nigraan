/* Weeks-ahead (EC46) and seasonal (SEAS5) forecast record and scores.
   Logged: one EC46 issue per week (the first run seen for a new first-week date) and one SEAS5
   issue per calendar month, for every tehsil. Scored once the target period has ended plus
   6 days for ERA5, against the ERA5 1993-2016 anomaly climate:
     sign hit rate of the temperature/rain anomaly (weeks with an observed anomaly under
       0.25 °C or 2 mm are skipped as "near normal")
     Brier score of "warmer than normal" and "wetter than normal" chances (EC46)
     correlation of forecast and observed anomalies across tehsils
     mean absolute error of the anomaly                                                     */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { alignBatch } from './provider.mjs';

const LAG = 6, DAY = 864e5;
const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);
const r3 = (x) => x == null || !isFinite(x) ? null : Math.round(x * 1000) / 1000;

export function createSeasVerify(app, dataDir) {
  const { provider, units } = app;
  const dir = join(dataDir, 'seasonal-log'); mkdirSync(dir, { recursive: true });
  const scoreFile = join(dataDir, 'seasonal-scores.json');
  let scoring = false, lastError = null;
  const read = (f, d) => { try { return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d; } catch { return d; } };

  function log(X) {
    if (!X || !X.units) return;
    const today = new Date().toISOString().slice(0, 10);
    const ecName = 'ec46-' + X.weeks[0] + '.json';
    if (!existsSync(join(dir, ecName))) {
      const rec = { kind: 'ec46', issued: today, weeks: X.weeks, units: {} };
      for (const [id, u] of Object.entries(X.units)) rec.units[id] = u.w.map(a => [a[0], a[1], a[4], a[5]]); // tAnom, pT0, pAnom, pP0
      writeFileSync(join(dir, ecName), JSON.stringify(rec)); console.log('  seasonal log: ' + ecName);
    }
    const smName = 'seas5-' + today.slice(0, 7) + '.json';
    if (!existsSync(join(dir, smName))) {
      const rec = { kind: 'seas5', issued: today, months: X.months, units: {} };
      for (const [id, u] of Object.entries(X.units)) rec.units[id] = u.m.map(a => [a[1], a[3]]); // tAnom, pAnom
      writeFileSync(join(dir, smName), JSON.stringify(rec)); console.log('  seasonal log: ' + smName);
    }
  }

  async function obsAnomalies(ids, start, end) {
    const byId = new Map(units.tehsil.map(u => [u.unitId, u])), out = new Map();
    for (let i = 0; i < ids.length; i += 50) {
      const b = ids.slice(i, i + 50).map(id => byId.get(id)).filter(Boolean);
      let body; try { body = await provider.call('archive', '/v1/archive', { latitude: b.map(u => u.lat), longitude: b.map(u => u.lon), elevation: b.map(u => u.elevM ?? 'nan'), daily: ['temperature_2m_mean', 'precipitation_sum'], start_date: start, end_date: end, timezone: 'Asia/Karachi', models: 'era5' }, { locations: b.length }); }   /* v91.17.68 · ERA5 (lag 5 d < LAG 6), the same basis as the normal (B5) */
      catch (e) { lastError = e.message; return null; }
      alignBatch(body, b).forEach((loc, k) => { const d = loc && loc.daily; if (!d) return; const m = new Map(); d.time.forEach((t, j) => { const n = app.climatology.normals(b[k].unitId, t, { raw: true });   /* v91.17.68 · the observation is ERA5, so its anomaly is against the ERA5 normal without the station shift (B5) */ if (n && d.temperature_2m_mean[j] != null && d.precipitation_sum[j] != null) m.set(t, [d.temperature_2m_mean[j] - n.tm, d.precipitation_sum[j] - n.pr]); }); out.set(b[k].unitId, m); });
    }
    return out;
  }
  function blank() { return { updated: null, complete: [], ec46: {}, seas5: {} }; }
  function acc(A, key) { return A[key] = A[key] || { n: 0, tHit: 0, tN: 0, pHit: 0, pN: 0, briT: 0, briP: 0, briN: 0, tAbs: 0, pAbs: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0 }; }
  /* ══ v91.17.4 · A NULL FORECAST LEG IS NOT A FORECAST OF ZERO ═══════════
     The caller guarded only fc[0]. The RAIN leg — fc[2] for EC46, fc[1] for
     SEAS5 — could still be null, and `Math.abs(null - oP)` is `Math.abs(-oP)`:
     a fabricated "exactly normal" rain forecast contributing a real MAE term,
     plus a sign miss from `Math.sign(0)`. Each leg is now counted only where it
     exists, and each carries its own denominator so a partially-scored leg
     cannot be read as a fully-scored one. */
  function add(a, fT, oT, fP, oP, pT0, pP0) {
    a.n++;
    const tOk = fT != null && isFinite(fT) && oT != null && isFinite(oT);
    const pOk = fP != null && isFinite(fP) && oP != null && isFinite(oP);
    if (tOk) { a.tn = (a.tn || 0) + 1; a.tAbs += Math.abs(fT - oT);
      if (Math.abs(oT) >= 0.25) { a.tN++; if (Math.sign(fT) === Math.sign(oT)) a.tHit++; }
      a.sx += fT; a.sy += oT; a.sxx += fT * fT; a.syy += oT * oT; a.sxy += fT * oT; a.cn = (a.cn || 0) + 1; }
    if (pOk) { a.pn = (a.pn || 0) + 1; a.pAbs += Math.abs(fP - oP);
      if (Math.abs(oP) >= 2) { a.pN++; if (Math.sign(fP) === Math.sign(oP)) a.pHit++; } }
    if (tOk && pOk && pT0 != null && pP0 != null) { a.briN++; a.briT += (pT0 / 100 - (oT > 0 ? 1 : 0)) ** 2; a.briP += (pP0 / 100 - (oP > 0 ? 1 : 0)) ** 2; }
  }
  async function score() {
    if (scoring || !provider.configured() || !app.climatology.anomalyReady()) return { started: false };
    scoring = true;
    try {
      const S = read(scoreFile, blank()); const cutoff = addDays(new Date().toISOString().slice(0, 10), -LAG);
      for (const f of readdirSync(dir).filter(x => x.endsWith('.json')).sort()) {
        const rec = read(join(dir, f), null); if (!rec) continue; rec.scored = rec.scored || [];
        const ids = Object.keys(rec.units);
        if (rec.kind === 'ec46') {
          const todo = rec.weeks.map((w, k) => ({ w, k })).filter(x => !rec.scored.includes(x.w) && addDays(x.w, 6) <= cutoff);
          if (!todo.length) continue;
          const obs = await obsAnomalies(ids, todo[0].w, addDays(todo[todo.length - 1].w, 6)); if (!obs) break;
          for (const { w, k } of todo) {
            const lead = 'week' + (k + 1), a = acc(S.ec46, lead);
            for (const id of ids) { const m = obs.get(id), fc = rec.units[id][k]; if (!m || !fc || fc[0] == null) continue;
              let t = 0, p = 0, n = 0; for (let d = 0; d < 7; d++) { const v = m.get(addDays(w, d)); if (v) { t += v[0]; p += v[1]; n++; } }
              if (n < 6) continue; add(a, fc[0], t / n, fc[2], p * 7 / n, fc[1], fc[3]); }
            rec.scored.push(w);
          }
        } else {
          const todo = rec.months.map((mo, k) => ({ mo, k })).filter(x => x.k > 0 && !rec.scored.includes(x.mo) && addDays(x.mo + '-01', 31) <= cutoff);
          if (!todo.length) continue;
          for (const { mo, k } of todo) {
            const end = new Date(Date.UTC(Number(mo.slice(0, 4)), Number(mo.slice(5, 7)), 0)).toISOString().slice(0, 10);
            const obs = await obsAnomalies(ids, mo + '-01', end); if (!obs) break;
            const a = acc(S.seas5, 'month' + k);
            for (const id of ids) { const m = obs.get(id), fc = rec.units[id][k]; if (!m || !fc || fc[0] == null) continue; let t = 0, p = 0, n = 0; for (const v of m.values()) { t += v[0]; p += v[1]; n++; } if (n < 25) continue; const dim = new Date(Date.UTC(Number(mo.slice(0, 4)), Number(mo.slice(5, 7)), 0)).getUTCDate(); add(a, fc[0], t / n, fc[1], p * dim / n,   /* v91.17.68 · the monthly rain anomaly scaled to the month's days, as the weekly leg scales to 7 (B15) */ null, null); }
            rec.scored.push(mo);
          }
        }
        writeFileSync(join(dir, f), JSON.stringify(rec)); S.updated = new Date().toISOString(); writeFileSync(scoreFile, JSON.stringify(S));
        console.log('  seasonal score: ' + f);
      }
      return { started: true };
    } finally { scoring = false; }
  }
  function sum(a) {
    /* the sums are accumulated only over pairs where BOTH legs existed, so the
       denominator has to be that count (a.cn), not the total pair count. */
    const cn = a.cn || 0;
    const corr = cn > 2 ? (cn * a.sxy - a.sx * a.sy) / Math.sqrt(Math.max(1e-9, (cn * a.sxx - a.sx ** 2) * (cn * a.syy - a.sy ** 2))) : null;
    return { pairs: a.n, scored: { temp: a.tn || 0, rain: a.pn || 0 },
      tempSignHit: a.tN ? r3(a.tHit / a.tN) : null, rainSignHit: a.pN ? r3(a.pHit / a.pN) : null,
      brierWarmer: a.briN ? r3(a.briT / a.briN) : null, brierWetter: a.briN ? r3(a.briP / a.briN) : null,
      tempAnomalyCorrelation: r3(corr),
      correlationCaveat: 'tehsils and issue dates are pooled into one sample, so n overstates the independent degrees of freedom by roughly the number of tehsils sharing a large-scale anomaly. Read this as a pattern statistic, not a significance test.',
      tempMae: a.tn ? r3(a.tAbs / a.tn) : null, rainMae: a.pn ? r3(a.pAbs / a.pn) : null };
  }
  function summary() {
    const S = read(scoreFile, blank()), files = readdirSync(dir).filter(x => x.endsWith('.json')).sort();
    return { logs: { ec46: files.filter(f => f.startsWith('ec46')).length, seas5: files.filter(f => f.startsWith('seas5')).length }, first: files[0] || null, updated: S.updated, anomalyClimate: app.climatology.anomalyReady(),
      ec46: Object.fromEntries(Object.entries(S.ec46).map(([k, a]) => [k, sum(a)])), seas5: Object.fromEntries(Object.entries(S.seas5).map(([k, a]) => [k, sum(a)])),
      reading: 'A sign hit rate of 0.5 is no better than a coin; a Brier score of 0.25 is no better than always saying 50%.', scoring, lastError };
  }
  return { log, score, summary };
}
