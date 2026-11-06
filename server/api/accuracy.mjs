/* == v91.17.283.28 · S6 · ONE FORECAST-ACCURACY FIGURE, ONE HOME: THE VERIFICATION AGENT'S LEDGER ======================================
   Every accuracy figure a place shows (the "now" and day confidence of the place record, the place record's accuracy, the report) is
   read here from data/agents/verify/summary.json: the verification agent (scripts/agents/verify.mjs) scores the AS-ISSUED tehsil
   forecasts against quality-controlled station observations every Pakistan day and keeps a 400-day ledger; the summary's table holds,
   per variable x zone x lead, the MAE over the last 30 ledger days with its 95 % day-block bootstrap interval. The figure names its basis:
   the verification set, the variable, the zone, the lead and the period. No figure is typed; a cell the ledger does not hold is
   'not measured' with the agent's reason (never a figure from another test). The earlier sources (national-model held-out MAE, the live
   MACH layer's held-out MAE, the fleet-history cohort) are design tests of single steps, not the served forecast: they are no longer
   shown as the place's accuracy. */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const isN = (x) => typeof x === 'number' && Number.isFinite(x);
/* v91.17.283.29: the set is printed in reports and on screen, so it names no code file (the ledger is written by scripts/agents/verify.mjs) */
export const ACCURACY_SET = 'NIGRAAN verification ledger: the as-issued tehsil forecast against quality-controlled station observations';
const VAR_WORDS = { T: '2 m air temperature, hourly', TX: 'daily maximum temperature', TN: 'night minimum temperature' };
let C = null;
export function ledgerSummary(dataDir) { const f = join(dataDir, 'agents', 'verify', 'summary.json'); try { const m = statSync(f).mtimeMs; if (C && C.f === f && C.m === m) return C.v; const v = JSON.parse(readFileSync(f, 'utf8')); C = { f, m, v }; return v; } catch (_) { return null; } }
/* the MAE of a variable in a zone at a lead (0-3), with its basis; maeC null with the reason when the ledger does not hold it */
/* v91.17.283.31 · owner 3.5 · a figure only for a SCORED lead (0-3) and only with at least MIN_SCORED_DAYS scored days, with the count; a
   lead beyond the scored range is "not measured" (until v283.30 lead 6 was clamped to lead 3 and showed lead 3's figure) */
export const MIN_SCORED_DAYS = 10;
export const SCORED_LEADS = [0, 1, 2, 3];
export const MIN_DAYS_SOURCE = 'NIGRAAN rule (owner 3.5, v283.31): at least 10 scored days in the ledger window (one third of the 30-day window) before an error figure is shown';
export function accuracyCell(dataDir, { variable = 'T', zone, lead = 0 } = {}) {
  const S = ledgerSummary(dataDir), L0 = Math.round(Number(lead) || 0), L = Math.max(0, Math.min(3, L0));
  if (!(L0 >= 0 && L0 <= 3)) return { set: ACCURACY_SET, variable: VAR_WORDS[variable] || variable, varKey: variable, zone: zone || null, lead: L0, maeC: null, notMeasured: true, scoredLeads: SCORED_LEADS,
    why: 'not measured: lead day ' + L0 + ' is beyond the scored leads (days 0-3)' };
  const base = { set: ACCURACY_SET, variable: VAR_WORDS[variable] || variable, varKey: variable, zone: zone || null, lead: L, period: S && S.window ? { from: S.window.from, to: S.window.to, days: S.window.days, ledgerDays: S.window.ledgerDays } : null, built: S ? S.built || null : null };
  if (!S || !S.ready || !Array.isArray(S.table)) return { ...base, maeC: null, why: 'not measured: the verification ledger has not been built on this server yet' };
  if (!zone) return { ...base, maeC: null, why: 'not measured: the point has no forecast zone' };
  const row = S.table.find((r) => r.var === variable && r.zone === zone && r.lead === L);
  if (!row || !isN(row.mae) || !row.n) return { ...base, maeC: null, why: 'not measured: ' + ((row && row.why) || 'the ledger holds no ' + (VAR_WORDS[variable] || variable) + ' cell for the ' + zone + ' zone at lead ' + L) };
  const nDays = isN(row.days) ? row.days : isN(row.nDays) ? row.nDays : null;
  if (nDays == null || nDays < MIN_SCORED_DAYS) return { ...base, maeC: null, notEnoughDays: true, scoredDays: nDays, minDays: MIN_SCORED_DAYS,
    why: 'not enough days: ' + (nDays == null ? 'the ledger does not count the scored days of this cell' : nDays + ' scored day' + (nDays === 1 ? '' : 's')) + ' (a figure needs at least ' + MIN_SCORED_DAYS + ')' };
  return { ...base, scoredDays: nDays, minDays: MIN_SCORED_DAYS, maeC: Math.round(row.mae * 100) / 100, maeCi: Array.isArray(row.maeCi) ? row.maeCi : null, biasC: isN(row.bias) ? Math.round(row.bias * 100) / 100 : null, n: row.n, days: row.days ?? null, trend: row.trend || null };
}
/* the place's accuracy block: the headline (hourly temperature, lead day 1) and every zone x lead cell of T, TX and TN */
export function placeAccuracy(dataDir, zone) {
  const head = accuracyCell(dataDir, { variable: 'T', zone, lead: 1 });
  const byLead = {}; for (const v of ['T', 'TX', 'TN']) byLead[v] = [0, 1, 2, 3, 4, 5, 6].map((L) => { const c = accuracyCell(dataDir, { variable: v, zone, lead: L }); return { lead: L, maeC: c.maeC, ...(c.maeCi ? { maeCi: c.maeCi } : {}), ...(c.n ? { n: c.n } : {}), ...(c.scoredDays != null ? { scoredDays: c.scoredDays } : {}), ...(c.notMeasured ? { notMeasured: true } : {}), ...(c.notEnoughDays ? { notEnoughDays: true } : {}), ...(c.why ? { why: c.why } : {}) }; });
  return { ok: true, headline: head, byLead, basis: ACCURACY_SET + '; MAE (forecast minus observed, absolute) over the period, 95 % day-block bootstrap interval; zone ' + (zone || 'unknown'),
    text: isN(head.maeC) ? 'average error ' + head.maeC.toFixed(1) + ' °C (' + head.variable + ', day-1 forecasts, ' + (head.zone || '') + ' zone, ' + (head.period ? head.period.from + ' to ' + head.period.to : '') + ')' : head.why };
}
