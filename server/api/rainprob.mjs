/* v91.17.283.15 · rainprob.mjs — calibrated daily heavy-rain probability from the ENS members (pure: no I/O, no clock).
   Replaces the bare member share of outlook.mjs rainClassShares with the probability fitted and tested in
   D:\NIGRAAN\_admin\rain\RULES_RAIN.md / RESULTS_RAIN.md (IFS ENS 0.25 deg, 12 UTC run, IMERG V07 areal truth, Feb 2025 - Aug 2026 fit,
   Sep - Oct 2026 held-out test). Coefficients, cuts and the per-class / per-lead / per-zone gate come from data/rain-prob-coefs.json;
   nothing here is a place, a threshold or a cut of its own.
   A class whose gate did not pass is published as a fact with status 'screening' and never sets the level. */

import { rainClasses24h } from './scalecuts.mjs';
/* v91.17.283.27 · item 3 · the 24-hour rain classes are read from their one home, data/hazard-scale.json rainClasses24h (India Meteorological
   Department daily rainfall categories), never typed here. cls() is the live read; RAIN_CLASS_MM is the register's value at load (for the
   readers that import a list). No register: no classes, so every probability is empty and the caller says not assessed. */
const cls = () => rainClasses24h() || [];
export const RAIN_CLASS_MM = Object.freeze(cls());
export const rainClassMm = cls;

const sig = (z) => 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, z))));
const logit = (p) => Math.log(p / (1 - p));

/* the member statistics the fit used: n valid, mean, population sd, members >= each class */
export function memberStats(v) {
  const x = (v || []).filter((a) => a != null && Number.isFinite(a));
  const n = x.length; if (!n) return { n: 0 };
  const mean = x.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(x.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const m = cls().map((t) => x.filter((a) => a >= t).length);
  return { n, mean, sd, m };
}

function design(kind, st, ci, ctx = {}) {
  /* v91.17.283.24 · method d (data/rain-prob-coefs-ifsdet.json): the IFS deterministic PKT-day total and the monsoon term, as fitted */
  if (kind === 'd') return [Math.log1p(Math.max(0, ctx.detMm)), ctx.monsoon ? 1 : 0];
  const s = (j) => (st.m[j] + 0.5) / (st.n + 1);
  if (kind === 'a') return [logit(s(ci))];
  const x = [Math.log1p(st.mean), Math.log1p(st.sd), logit(s(ci))];
  if (ci > 0) x.push(logit(s(0)));
  return x;
}

export function regimeOf(C, month) { return (C.monsoonMonths || []).includes(month) ? 'monsoon' : 'rest'; }

function cellOf(C, zone, regime, lead, ci) {
  const t = String(cls()[ci]);
  for (const k of [zone + '|' + regime + '|' + lead + '|' + t, '*|' + regime + '|' + lead + '|' + t, '*|*|' + lead + '|' + t]) if (C.cells[k]) return { key: k, c: C.cells[k] };
  return null;
}

/* probability (0-1) per class for one unit-day. ctx: { zone, month (1-12, of the valid PKT day), lead (1..3) }; method d (C.method === 'd')
   reads ctx.detMm (the IFS deterministic PKT-day total, mm) instead of members; its lead is the lead from the 00 UTC run's date */
export function rainClassProbs(C, v, nAll, ctx = {}) {
  if (C && C.method === 'd') return rainClassProbsDet(C, ctx);
  const need = Math.ceil((nAll || 0) / 2);
  const st = ctx.stats && Number.isFinite(ctx.stats.n) && Array.isArray(ctx.stats.m) ? ctx.stats : memberStats(v);   /* v283.31 · 1.4: the held member statistics (row.prs) re-read at a new lead */
  if (!nAll || st.n < need) return { p: null, n: st.n, of: nAll, why: 'not assessed: ' + st.n + ' of ' + nAll + ' members carry this day\u2019s rain; at least ' + need + ' are needed' };
  const lead = ctx.lead, zone = ctx.zone || 'plains';
  if (!C || !C.cells || ![1, 2, 3].includes(lead) || !ctx.month) {
    /* outside the calibrated range (lead 0 or > 3, no coefficients): the raw share, screening */
    return { n: st.n, of: nAll, basis: 'share of members (uncalibrated outside lead days 1-3)', calibrated: false,
      p: Object.fromEntries(cls().map((t, j) => [String(t), st.m[j] / st.n])),
      status: Object.fromEntries(cls().map((t) => [String(t), 'screening'])) };
  }
  const regime = regimeOf(C, ctx.month);
  const raw = [];
  for (let ci = 0; ci < cls().length; ci++) {
    const hit = cellOf(C, zone, regime, lead, ci);
    if (!hit || hit.c.raw) { raw.push(st.m[ci] / st.n); continue; }
    const x = design(C.method, st, ci); const { w, mu, sd, lo, hi } = hit.c;
    /* each input is held inside the range seen in its fit cell (no extrapolation beyond the training sample) */
    let z = w[0]; for (let j = 0; j < x.length; j++) { const xj = lo && hi ? Math.min(hi[j], Math.max(lo[j], x[j])) : x[j]; z += w[j + 1] * (xj - mu[j]) / sd[j]; }
    raw.push(sig(z));
  }
  const p = []; let lo = 1;
  for (const q of raw) { lo = Math.min(lo, Math.max(0.001, Math.min(0.999, q))); p.push(lo); }   /* clip, then monotone across classes */
  const status = {}; cls().forEach((t) => { const g = C.gate && C.gate[t + '|' + lead]; status[String(t)] = g && g.tested && g.zones && g.zones[zone] ? 'tested' : 'screening'; });
  return { n: st.n, of: nAll, calibrated: true, basis: C.basis || 'calibrated', zone, regime, lead,
    p: Object.fromEntries(cls().map((t, j) => [String(t), p[j]])), status };
}

/* the probabilities of method d: one logistic per class x lead x zone cell on [log1p(day total), monsoon], inputs held inside the fit
   range, clipped 0.001-0.999, monotone across classes; the status of each class from the same gate keys ('<class>|<lead>' tested and
   zones[zone]) */
function rainClassProbsDet(C, ctx) {
  const lead = ctx.lead, zone = ctx.zone;
  if (!C || !C.cells || ![1, 2, 3].includes(lead) || !ctx.month || !zone) return { p: null, why: 'not assessed: method d covers lead days 1-3 of the 00 UTC run in a known zone' };
  if (!(typeof ctx.detMm === 'number' && Number.isFinite(ctx.detMm))) return { p: null, why: 'not assessed: no IFS deterministic day total for this day' };
  const regime = regimeOf(C, ctx.month), monsoon = regime === 'monsoon', raw = [];
  for (let ci = 0; ci < cls().length; ci++) {
    const hit = cellOf(C, zone, regime, lead, ci); if (!hit) return { p: null, why: 'not assessed: no method d coefficients for ' + zone + ' / lead ' + lead };
    const x = design('d', null, ci, { detMm: ctx.detMm, monsoon }); const { w, mu, sd, lo, hi } = hit.c;
    let z = w[0]; for (let j = 0; j < x.length; j++) { const xj = lo && hi ? Math.min(hi[j], Math.max(lo[j], x[j])) : x[j]; z += w[j + 1] * (xj - (mu ? mu[j] : 0)) / (sd ? sd[j] : 1); }
    raw.push(sig(z)); }
  const p = []; let m = 1; for (const q of raw) { m = Math.min(m, Math.max(0.001, Math.min(0.999, q))); p.push(m); }
  const status = {}; cls().forEach((t) => { const g = C.gate && C.gate[t + '|' + lead]; status[String(t)] = g && g.tested && g.zones && g.zones[zone] ? 'tested' : 'screening'; });
  return { calibrated: true, method: 'd', basis: C.basis || 'calibrated (method d)', zone, regime, lead, detMm: ctx.detMm,
    p: Object.fromEntries(cls().map((t, j) => [String(t), p[j]])), status };
}
/* the cut of a class at a lead: cutsByLead where the coefficient file holds one (method d), else the one cut of the class */
export function cutOf(C, cls, lead) { const k = String(cls); const b = C && C.cutsByLead && C.cutsByLead[k]; const v = b && lead != null ? b[String(lead)] : null; return v != null ? v : (C && C.cuts ? C.cuts[k] ?? null : null); }

/* ══ v91.17.283.24 · THE SERVING RULE OF METHOD D (owner approval 27 Oct 2026) ════════════════════════════════════════════════════
   Only the >= 15.6 mm class passed its station event test (plains, lead days 1-3; data/rain-prob-coefs-ifsdet.json gate). Every heavier
   class (64.5 / 115.6 / 204.5 mm) is nested inside it: a day that reaches 64.5 mm has reached 15.6 mm. So
     p(>= 15.6) <  cut   Normal: no class reached; valid because the tested class contains every heavier one
     p(>= 15.6) >= cut   Low, said as "Low or heavier": the heavier classes are not tested, so how much heavier is not said
   A class that is not tested in this zone and lead gives no level here (null: the caller keeps the cell not assessed, screening). */
export function detLevel(C, r) {
  if (!r || r.p == null) return null;
  const k = String(cls()[0]); if (!(r.status && r.status[k] === 'tested')) return null;
  const cut = cutOf(C, cls()[0], r.lead); if (cut == null) return null;
  return r.p[k] >= cut ? { L: 1, lowOrHeavier: true, cut, words: 'Low or heavier' } : { L: 0, cut, words: null };
}

/* level 0-4: the highest TESTED class whose probability reaches its training cut (RULES_RAIN 9); null when not assessed */
export function rainLevel(C, r) {
  if (!r || r.p == null) return { L: -1, why: r && r.why ? r.why : 'not assessed' };
  let L = 0; const used = [];
  cls().forEach((t, i) => { const k = String(t); const cut = cutOf(C, t, r.lead);
    if (r.status && r.status[k] === 'tested' && cut != null && r.p[k] >= cut) { L = i + 1; used.push(k); } });
  return { L, classes: used, words: L ? (C.words || [])[L - 1] || null : null };
}

/* drop-in shape for outlook.mjs row.prc: percentages, as rainClassShares returned, plus status and the calibrated level */
export function rainClassSharesCalibrated(C, v, nAll, ctx, basis = 'liquid rain') {
  const r = rainClassProbs(C, v, nAll, ctx);
  if (r.p == null) return r;
  const lv = rainLevel(C, r);
  return { n: r.n, of: r.of, basis, calibrated: r.calibrated, method: C && C.method, regime: r.regime, zone: r.zone, lead: r.lead,
    p: Object.fromEntries(Object.entries(r.p).map(([k, q]) => [k, Math.round(1000 * q) / 10])), status: r.status, L: lv.L, words: lv.words };
}
