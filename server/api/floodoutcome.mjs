/* == v91.17.283.33 · SCENARIO LAB ONLY · DISTRICT CHANCE OF LOCAL-RAIN FLOODING ON A RAIN DAY =========================================
   The question: given a day's rain total and how wet the ground already is, what is the chance that local flooding (flash flood, hill
   torrent or urban flooding) is reported in the district that day? Model file data/flood-outcome-model.json (sha256 in the register row
   floodOutcome.model): a logistic regression on log(1 + day total), log(1 + peak 1-h amount), the antecedent wetness percentile and two
   terrain shares of the district, fitted on June-September 2022-2026 district days against the national disaster situation reports, with
   coefficients of rain and wetness held >= 0 (more rain or wetter ground never lowers the chance). Validation (leave-one-year-out, plan
   locked before scoring): Brier skill 0.015 mountain, 0.013 plains, both 95 % intervals above 0, 4 of 5 years positive, reliable; the
   probabilities stay small (base rate about 1 district-day in 100).
   Served: in the Scenario Lab answer only, beside the hazard levels. Never an alert, never in the live forecast or on the map.
   Outside the trained rain range (mountain 0-74 mm, plains 0-84 mm) or a district outside the training set (Karachi): "not modelled".
   The 90 % range is the 5th-95th percentile of the 200 block-bootstrap refits held in the file. */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { era5Age, limitH as dataLimitH } from './dataage.mjs';   /* v283.36 item 5: wetness age from the provider cycle */
const isN = (x) => typeof x === 'number' && Number.isFinite(x);
export const FLOOD_OUTCOME_LABEL = 'district-level chance, not a site forecast; river floods and lake bursts not included';
export const DURATION_NOTE = 'intensity and duration: not modelled separately (added nothing beyond the day total in testing)';
/* one coefficient set: { mu, sd, coef } with coef[0] the intercept */
export function prob(set, R24, I1, W, LOWH, MTN) {
  const lR = Math.log1p(R24), x = [lR, Math.log1p(I1), W, LOWH, MTN, lR * MTN];
  let z = set.coef[0]; for (let i = 0; i < 6; i++) z += set.coef[i + 1] * (x[i] - set.mu[i]) / set.sd[i];
  return 1 / (1 + Math.exp(-z));
}
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
/* the full answer for one district and one input: central value, 90 % range */
export function predict(M, R24, I1, W, LOWH, MTN) {
  const p = prob({ mu: M.standardise.mu, sd: M.standardise.sd, coef: M.coef }, R24, I1, W, LOWH, MTN);
  const b = ((M.bootstrap && M.bootstrap.sets) || []).map((s) => prob(s, R24, I1, W, LOWH, MTN));
  return { p, p5: b.length ? pct(b, 0.05) : null, p95: b.length ? pct(b, 0.95) : null };
}
/* the usual-rate words: "about 1 day in 100" */
export function rateWords(p) { if (!isN(p) || p <= 0) return null; const n = 1 / p;
  const r = n >= 1000 ? Math.round(n / 100) * 100 : n >= 100 ? Math.round(n / 10) * 10 : n >= 20 ? Math.round(n / 5) * 5 : Math.max(1, Math.round(n));
  return 'about 1 day in ' + r; }
/* W from an API15 value and the district's 101 reference quantiles (linear between quantiles) */
export function wetnessPct(apiMm, Q) {
  if (!isN(apiMm) || !Array.isArray(Q) || Q.length < 2) return null;
  if (apiMm <= Q[0]) return 0; if (apiMm >= Q[Q.length - 1]) return 1;
  for (let i = 1; i < Q.length; i++) if (apiMm <= Q[i]) { const f = Q[i] > Q[i - 1] ? (apiMm - Q[i - 1]) / (Q[i] - Q[i - 1]) : 0; return Math.min(1, Math.max(0, (i - 1 + f) / (Q.length - 1))); }
  return 1;
}
export function createFloodOutcome(app, { dataDir }) {
  let M = null, at = 0, byTehsil = null;
  const model = () => { if (M && Date.now() - at < 600e3) return M; at = Date.now();
    const f = join(dataDir, 'flood-outcome-model.json'); try { M = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; } catch (_) { M = null; }
    byTehsil = new Map(); if (M) for (const d of M.districts || []) for (const t of d.tehsils || []) byTehsil.set(t, d); return M; };
  /* the place's current 60-day wetness: the tehsil's 60-day rain index (reanalysis rain at the tehsil point) in the district's record */
  function currentWetness(uid, D) {
    let a = null; try { const n = app.climatology && app.climatology.droughtNational ? app.climatology.droughtNational() : null; const t = n && n.spi && n.spi[uid]; a = t && t.api ? t.api : null; } catch (_) { a = null; }
    const W = a && isN(a.api15Mm) ? wetnessPct(a.api15Mm, D.apiRefMm) : null;
    if (W == null) return null;
    /* v283.36 · launch item 5 · the wetness is the ERA5 rain up to its last day held; ERA5 is daily with a 5-day publication delay and our
       table is rebuilt every 6 h (data-age table): older than that it is not current and the client must set the wetness first */
    const A = era5Age(a.asOf); if (A.stale) return { old: true, asOf: a.asOf || null, ageH: isN(A.ageH) ? Math.round(A.ageH) : null };
    return { W, asOf: a.asOf || null, api15Mm: a.api15Mm };
  }
  /* one place: baseline (the forecast day total) and scenario (the assumed day total) for the scenario day */
  function answer({ uid, day, baseMm, scenMm, wetPct }) {
    const m = model();
    const out = { label: FLOOD_OUTCOME_LABEL, durationNote: DURATION_NOTE, display: 'display only: never an alert, never in the live forecast or on the map', day: day || null };
    if (!m) return { ...out, modelled: false, why: 'not modelled: the flood outcome model is not in this install' };
    const D = uid ? byTehsil.get(uid) : null;
    if (!D) return { ...out, modelled: false, why: 'not modelled: this place is outside the districts the model was trained on' };
    if (!D.covered) return { ...out, modelled: false, district: D.district, why: 'not modelled: ' + (D.why || 'district not covered') };
    /* v283.36 · launch item 16 · no 0.4 fallback: the region's peak-hour ratio must be in the model file, else not modelled */
    const rng = m.validRange[D.region], ratio = m.peakHourOfDay && m.peakHourOfDay.ratio && isN(m.peakHourOfDay.ratio[D.region]) ? m.peakHourOfDay.ratio[D.region] : null;
    if (ratio == null) return { ...out, modelled: false, state: 'not available', district: D.district, why: 'not available: the model file holds no peak-hour ratio for ' + D.region + ' districts' };
    let W = null, wBasis = null;
    if (isN(wetPct)) { W = Math.min(1, Math.max(0, wetPct / 100)); wBasis = 'set by you: ' + Math.round(W * 100) + 'th percentile of the district’s June-September record'; }
    else { const c = currentWetness(uid, D); if (c && c.old) return { ...out, modelled: false, state: 'out of date', district: D.district, why: 'out of date: the place’s ground wetness (rain to ' + (c.asOf || '?') + ') is older than its data-age limit (' + dataLimitH('era5') + ' h); set the ground wetness to run it' }; if (c) { W = c.W; wBasis = 'the place’s current 60-day rain percentile (' + Math.round(W * 100) + 'th of the district’s June-September 2001-2021 record' + (c.asOf ? ', as of ' + c.asOf : '') + '; the current rain is reanalysis rain at the tehsil point, the record is satellite rain, so read it as approximate)'; } }
    if (W == null) return { ...out, modelled: false, district: D.district, why: 'not modelled: the place’s current 60-day rain is not held yet; set the ground wetness to run it' };
    const one = (mm, what) => {
      if (!isN(mm)) return { modelled: false, why: 'not modelled: no ' + what + ' day total for this day' };
      if (mm < rng.R24[0] || mm > rng.R24[1]) return { modelled: false, mm, why: 'not modelled: ' + Math.round(mm * 10) / 10 + ' mm is outside the trained rain range for ' + D.region + ' districts (' + Math.round(rng.R24[0]) + ' to ' + Math.round(rng.R24[1]) + ' mm in the day)' };
      const I1 = Math.min(rng.I1[1], mm * ratio), r = predict(m, mm, I1, W, D.LOWH, D.MTN);
      const q = (x) => (isN(x) ? Math.round(x * 1e4) / 1e4 : null);
      return { modelled: true, mm, p: q(r.p), p5: q(r.p5), p95: q(r.p95), rate: rateWords(r.p), range90: [q(r.p5), q(r.p95)] };
    };
    return { ...out, modelled: true, district: D.district, region: D.region, wetness: { pct: Math.round(W * 1000) / 10, basis: wBasis, set: isN(wetPct) },
      baseline: one(baseMm, 'forecast'), scenario: one(scenMm, 'scenario'),
      rainBasis: 'the day total at the place stands for the district’s wettest-spot day total the model was trained on',
      trainedRange: { mountain: [Math.round(m.validRange.mountain.R24[0]), Math.round(m.validRange.mountain.R24[1])], plains: [Math.round(m.validRange.plains.R24[0]), Math.round(m.validRange.plains.R24[1])], unit: 'mm in the day' },
      model: { version: m.version, validation: 'leave-one-year-out 2022-2026: Brier skill above the climatological rate in both regions, 95 % intervals above zero' } };
  }
  /* v91.17.283.34 · Scenario Lab A · Monte Carlo over the model's uncertainty: n draws of (one of the 200 bootstrap refits) x (one day
     total: the assumed amount, or one ensemble member's day total). rand() is the caller's seeded generator (reproducible). Draws whose
     day total lies outside the trained range are counted, not used; more than half outside -> "not modelled". */
  function mc({ uid, day, mmList, wetPct, rand, n = 2000 }) {
    const m = model(); const D = m && uid ? byTehsil.get(uid) : null;
    if (!m) return { modelled: false, why: 'not modelled: the flood outcome model is not in this install' };
    if (!D) return { modelled: false, why: 'not modelled: this place is outside the districts the model was trained on' };
    if (!D.covered) return { modelled: false, why: 'not modelled: ' + (D.why || 'district not covered') };
    let W = null; if (isN(wetPct)) W = Math.min(1, Math.max(0, wetPct / 100)); else { const c = currentWetness(uid, D); if (c && c.old) return { modelled: false, state: 'out of date', why: 'out of date: the place’s ground wetness (rain to ' + (c.asOf || '?') + ') is older than its data-age limit (' + dataLimitH('era5') + ' h); set the ground wetness to run it' }; W = c ? c.W : null; }
    if (W == null) return { modelled: false, why: 'not modelled: the place’s current 60-day rain is not held yet; set the ground wetness to run it' };
    const mm = (mmList || []).filter(isN); if (!mm.length) return { modelled: false, why: 'not modelled: no day total for this day' };
    const rng = m.validRange[D.region], ratio = m.peakHourOfDay && m.peakHourOfDay.ratio && isN(m.peakHourOfDay.ratio[D.region]) ? m.peakHourOfDay.ratio[D.region] : null, sets = (m.bootstrap && m.bootstrap.sets) || [];
    if (ratio == null) return { modelled: false, state: 'not available', why: 'not available: the model file holds no peak-hour ratio for ' + D.region + ' districts' };   /* v283.36 item 16 */
    if (!sets.length) return { modelled: false, why: 'not modelled: the model file holds no bootstrap refits' };
    /* v283.36 · launch item 1 · the chance is the MEAN over all N draws (the expected probability), not the median. A draw whose day total
       lies outside the trained rain range is neither set to zero nor dropped: the model says nothing about it, so the answer is a pair of
       BOUNDS - lower = sum(p of supported draws)/N (an unsupported draw counted as 0), upper = (sum(p supported) + n unsupported)/N (counted
       as 1). A single number only when every draw is inside the range; the share of draws outside is always stated. */
    const P = []; let out = 0;
    for (let i = 0; i < n; i++) { const R = mm[Math.floor(rand() * mm.length)], s = sets[Math.floor(rand() * sets.length)];
      if (R < rng.R24[0] || R > rng.R24[1]) { out++; continue; } P.push(prob(s, R, Math.min(rng.I1[1], R * ratio), W, D.LOWH, D.MTN)); }
    const q = (x) => Math.round(x * 1e4) / 1e4, sumP = P.reduce((a, b) => a + b, 0), outsideShare = q(out / n);
    const rangeTxt = Math.round(rng.R24[0]) + ' to ' + Math.round(rng.R24[1]) + ' mm in the day';
    if (!P.length) return { modelled: false, state: 'outside range', why: 'outside range: every draw lies outside the trained rain range for ' + D.region + ' districts (' + rangeTxt + ')', draws: n, used: 0, outsideRange: out, outsideShare: 1 };
    if (out > 0) { const lo = sumP / n, hi = (sumP + out) / n;
      return { modelled: true, bounded: true, district: D.district, day: day || null, p: null, bounds: [q(lo), q(hi)], range90: null, rate: null, draws: n, used: P.length, outsideRange: out, outsideShare,
        boundsWhy: Math.round(outsideShare * 100) + ' % of the draws lie outside the trained rain range for ' + D.region + ' districts (' + rangeTxt + '): lower bound counts them as no flood, upper bound as flood',
        wetnessPct: Math.round(W * 1000) / 10, wetnessSet: isN(wetPct), dayTotals: mm.length === 1 ? 'the assumed day total' : mm.length + ' ensemble members’ day totals', label: FLOOD_OUTCOME_LABEL, central: 'mean over all draws' }; }
    const mean = sumP / n;
    return { modelled: true, bounded: false, district: D.district, day: day || null, p: q(mean), central: 'mean over all draws', range90: [q(pct(P, 0.05)), q(pct(P, 0.95))], rate: rateWords(mean), draws: n, used: P.length, outsideRange: out, outsideShare,
      wetnessPct: Math.round(W * 1000) / 10, wetnessSet: isN(wetPct), dayTotals: mm.length === 1 ? 'the assumed day total' : mm.length + ' ensemble members’ day totals', label: FLOOD_OUTCOME_LABEL };
  }
  return { answer, model, mc };
}
