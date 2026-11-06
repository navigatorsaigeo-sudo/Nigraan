/* Ensemble forecast log and scoring. There is no archive of past ensemble members to backfill
   from, so the record starts with the first logged run. One run per issue day is logged (the
   first run after 09:00 UTC, when the 00 UTC ECMWF ensemble is complete) for lead days
   1, 2, 3, 5, 7 and 10. Six days after a valid date, ERA5 at the same tehsil elevation is used
   to score it:
     Brier score per threshold (0 = perfect; lower is better) and its skill against the sample
       climatology of the same verification set
     reliability: forecast chance in 10% bins vs how often it happened (calibration curve)
     coverage of the 10-90% range (should be close to 80%; lower = ensemble too confident)
     mean absolute error of the median                                                    */
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { THRESHOLDS } from './outlook.mjs';
import { reanalysisModel, alignBatch } from './provider.mjs';

const LEADS = [1, 2, 3, 5, 7, 10];
const LAG_DAYS = 6;
const r3 = (x) => Math.round(x * 1000) / 1000;

export function createEnsVerify(app, dataDir) {
  const { provider, units } = app;
  const dir = join(dataDir, 'ensemble-log'); mkdirSync(dir, { recursive: true });
  const scoreFile = join(dataDir, 'ensemble-scores.json');
  let scoring = false, lastError = null;
  const write = (f, obj) => { const t = f + '.tmp'; writeFileSync(t, JSON.stringify(obj)); try { renameSync(t, f); } catch { writeFileSync(f, JSON.stringify(obj)); } };
  const read = (f, dflt) => { try { return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : dflt; } catch { return dflt; } };
  const blankScores = () => ({ updated: null, verifiedPairs: 0, issues: [], complete: [], leads: {} });

  async function log(E) {
    const now = new Date(); if (now.getUTCHours() < 9) return { logged: false, why: 'waiting for the complete 00 UTC run (after 09:00 UTC)' };
    const issue = E.days[0], f = join(dir, issue + '.json');
    if (existsSync(f)) return { logged: false, why: 'already logged for ' + issue };
    /* v91.17.70 (temperature sprint) · the basis of every issue travels with it: height (elevM), reference and correction
       version per unit, so verification never mixes an anchor-height issue with a settlement-height one (Met W9) */
    const rec = { issue, issued_at: E.at, model: E.model, members: E.members, leads: LEADS, basis: E.basis ? { version: E.basis.version || null, height: E.basis.height || null, units: E.basis.units || {} } : null, units: {} };
    for (const [id, days] of Object.entries(E.units)) {
      rec.units[id] = {};
      for (const L of LEADS) if (days[L]) rec.units[id][L] = { date: E.days[L], tx: days[L].tx, tn: days[L].tn, pr: days[L].pr, p: days[L].p, ...(days[L].prs ? { prs: days[L].prs } : {}), ...(days[L].prc ? { prc: days[L].prc } : {}) };   /* v91.17.283.15 · item 9: the member statistics and the rain probability */
    }
    write(f, rec); console.log('  ensemble log: issue ' + issue + ' saved (' + Object.keys(rec.units).length + ' tehsils)');
    return { logged: true, issue };
  }

  async function score() {
    if (scoring || !provider.configured()) return { started: false };
    scoring = true;
    try {
      const S = read(scoreFile, blankScores());
      const cutoff = new Date(Date.now() - LAG_DAYS * 86400e3).toISOString().slice(0, 10);
      const files = readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
      const byId = new Map(units.tehsil.map(u => [u.unitId, u]));
      for (const fname of files) {
        S.complete = S.complete || []; if (S.complete.includes(fname.slice(0, 10))) continue;
        const f = join(dir, fname), rec = read(f, null); if (!rec) continue;
        rec.scored = rec.scored || [];
        const todo = LEADS.filter(L => !rec.scored.includes(L) && Object.values(rec.units)[0] && Object.values(rec.units)[0][L] && Object.values(rec.units)[0][L].date <= cutoff);
        if (!todo.length) continue;
        const dates = todo.map(L => Object.values(rec.units)[0][L].date).sort();
        const ids = Object.keys(rec.units).filter(id => byId.has(id));
        const obs = new Map();
        for (let i = 0; i < ids.length; i += 50) {
          const b = ids.slice(i, i + 50).map(id => byId.get(id));
          let body; try {
            body = await provider.call('archive', '/v1/archive', { latitude: b.map(u => u.lat), longitude: b.map(u => u.lon), elevation: b.map(u => u.elevM ?? 'nan'), models: reanalysisModel(dates[0]), timezone: 'Asia/Karachi',
              daily: ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum'], start_date: dates[0], end_date: dates[dates.length - 1] }, { locations: b.length });
          } catch (e) { lastError = e.message; if (e && e.code === 'PROVIDER_QUOTA_EXHAUSTED') { scoring = false; return { scored: false, why: 'provider quota exhausted; scoring stops until the reset' }; } break; }   /* v91.17.68 · a quota error stops the whole scoring pass, not one batch (B20) */
          alignBatch(body, b).forEach((loc, k) => {   /* v91.17.68 · aligned by coordinate (B10) */ const d = loc && loc.daily; if (!d) return; const m = new Map(); d.time.forEach((t, j) => m.set(t, { tx: d.temperature_2m_max[j], tn: d.temperature_2m_min[j], pr: d.precipitation_sum[j] })); obs.set(b[k].unitId, m); });
        }
        if (obs.size < ids.length * 0.9) continue;
        for (const L of todo) {
          const A = S.leads[L] = S.leads[L] || { thresholds: {}, coverage: { tx: [0, 0], tn: [0, 0] }, mae: { tx: [0, 0], tn: [0, 0], pr: [0, 0] } };
          for (const id of ids) {
            const fc = rec.units[id] && rec.units[id][L]; if (!fc || !fc.date) continue; const o = obs.get(id) && obs.get(id).get(fc.date); if (!o) continue;   /* v91.17.68 · a log record with a missing lead is skipped, not a crash that stops every checks tick (B19) */
            for (const th of THRESHOLDS) {
              const pf = fc.p && fc.p[th.id]; const ov = o[th.v]; if (pf == null || ov == null) continue;
              const happened = (th.op === '>=' ? ov >= th.x : ov <= th.x) ? 1 : 0, pr = pf / 100;
              const T = A.thresholds[th.id] = A.thresholds[th.id] || { n: 0, brier: 0, events: 0, bins: Array.from({ length: 11 }, () => [0, 0, 0]) };
              T.n++; T.brier += (pr - happened) ** 2; T.events += happened;
              const bin = T.bins[Math.round(pf / 10)]; bin[0]++; bin[1] += pr; bin[2] += happened;
            }
            for (const v of ['tx', 'tn']) if (fc[v] && o[v] != null) { A.coverage[v][0]++; if (o[v] >= fc[v][0] && o[v] <= fc[v][2]) A.coverage[v][1]++; }
            for (const v of ['tx', 'tn', 'pr']) if (fc[v] && o[v] != null) { A.mae[v][0]++; A.mae[v][1] += Math.abs(fc[v][1] - o[v]); }
            S.verifiedPairs++;
          }
          rec.scored.push(L);
        }
        if (!S.issues.includes(rec.issue)) S.issues.push(rec.issue);
        if (LEADS.every(L => rec.scored.includes(L))) S.complete.push(rec.issue);
        write(f, rec); S.updated = new Date().toISOString(); write(scoreFile, S);
        console.log('  ensemble score: issue ' + rec.issue + ' leads ' + todo.join(','));
      }
      return { started: true };
    } finally { scoring = false; }
  }

  function summary() {
    const S = read(scoreFile, blankScores());
    const logs = readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    const leads = {};
    for (const [L, A] of Object.entries(S.leads)) {
      const th = {};
      for (const [id, T] of Object.entries(A.thresholds)) {
        /* ══ v91.17.4 · GATE THE NUMBER, NOT THE BADGE ═══════════════════
           brier and brierSkill were emitted at any n >= 1 while
           calibrationReady (n >= 100) was only a display flag. For a rare
           threshold such as tx45 the base rate is near zero, so ref = p(1-p) is
           a tiny denominator and a handful of pairs produce a wildly negative
           skill score that reads as a measured result. A score computed on too
           few events is not a conservative score, it is a wrong one, so it is
           now withheld rather than published beside a caveat. */
        const MIN_EVENTS_FOR_SKILL = 100;
        const base = T.n ? T.events / T.n : 0, bsRaw = T.n ? T.brier / T.n : null, ref = base * (1 - base);
        /* v91.17.68 · the gate is on EVENTS and NON-EVENTS, not on pairs: 576 tehsils give n ≥ 100 after one day while a rare
           threshold has 0-3 events and ref ≈ 0.002, exactly the wildly negative score the comment above describes (B6) */
        const enough = T.events >= MIN_EVENTS_FOR_SKILL && (T.n - T.events) >= MIN_EVENTS_FOR_SKILL;
        const bs = enough ? bsRaw : null;
        th[id] = { n: T.n, events: T.events, brier: bs == null ? null : r3(bs), brierSkill: enough && ref > 0 && bs != null ? r3(1 - bs / ref) : null,
          withheld: enough ? null : 'fewer than ' + MIN_EVENTS_FOR_SKILL + ' observed events (' + T.events + ') or non-events (' + (T.n - T.events) + ') among ' + T.n + ' scored pairs; a Brier score on this sample is noise, not skill',
          reliability: T.bins.map((b, i) => b[0] ? { bin: i * 10, n: b[0], forecast: Math.round(100 * b[1] / b[0]), observed: Math.round(100 * b[2] / b[0]) } : null).filter(Boolean) };
      }
      leads[L] = { thresholds: th, coverage10to90: { tx: A.coverage.tx[0] ? Math.round(100 * A.coverage.tx[1] / A.coverage.tx[0]) : null, tn: A.coverage.tn[0] ? Math.round(100 * A.coverage.tn[1] / A.coverage.tn[0]) : null },
        maeMedian: { tx: A.mae.tx[0] ? r3(A.mae.tx[1] / A.mae.tx[0]) : null, tn: A.mae.tn[0] ? r3(A.mae.tn[1] / A.mae.tn[0]) : null, pr: A.mae.pr[0] ? r3(A.mae.pr[1] / A.mae.pr[0]) : null }, pairs: A.mae.tx[0] };
    }
    const first = logs[0] ? logs[0].slice(0, 10) : null;
    const firstScorable = first ? new Date(Date.parse(first) + (1 + LAG_DAYS) * 86400e3).toISOString().slice(0, 10) : null;
    return { logs: logs.length, firstIssue: first, lastIssue: logs.length ? logs[logs.length - 1].slice(0, 10) : null, firstScoreExpected: firstScorable, updated: S.updated, verifiedPairs: S.verifiedPairs, leads,
      calibrationReady: Object.values(leads).some(x => Object.values(x.thresholds).some(t => t.events >= 100)), rule: 'Chances are shown as calibrated only after at least 100 observed events per threshold; expect 2-3 months, longer for rare events.', scoring, lastError };
  }
  return { log, score, summary, LEADS };
}
