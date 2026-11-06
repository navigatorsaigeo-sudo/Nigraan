/* == v91.17.283.31 · data lane (scratchpad/river31/RESULTS.md) · THE MEASURED RIVER FLOWS, AND NO RAW MODEL FLOW ======================
   1. The river gauge sheet (the owner's daily sheet, 33 stations, link-public CSV export; INTERNAL source name "river gauge sheet": the
      agencies behind it are never named to a customer) is read daily into station-lake/archive/irsa/irsa_daily.csv by
      station-lake/scripts/irsa_sync.py (seeded from D:\NIGRAAN\inputs\irsa_daily\irsa_daily_clean.csv). Served:
        today      the measured flow (cusec) and the official status of each station, as an OBSERVED FACT (not a model)
        days 1-3   the measured flow carried forward with the global river model's day-to-day CHANGE applied (its change, never its
                   flow: tested 9.8 % vs 9.6 % error at day 1, 13.8 % vs 15.4 % at day 3 against plain persistence), and the status
                   carried forward with its tested skill: POD / FAR 0.80 / 0.20, 0.68 / 0.32, 0.57 / 0.43 (status persistence, 197
                   flood event-days of Jul-Sep 2026, >= Low). No routing model passed (all worse than persistence), so none is served.
   2. The global river model's FLOWS are never shown: against the sheet they read 1.2-7.7x the measured flow (no barrage diversions).
      flowChangeOnly() turns a model daily record into its day-to-day change (ratio to the first day of the record) and drops every
      absolute value; the place bundle's riverflow part and the riverflow point product go through it for every view. The served river
      LEVELS (hazsci.mjs, model-flow rarity and gauge classes) are unchanged.
   3. The river status of a gauged reach uses the nearest measured station on the same reach (served.mjs riverStatus -> measuredFor). */
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const STATUS_LEVEL = Object.freeze({ NILL: 0, NIL: 0, NORMAL: 0, LOW: 1, MEDIUM: 2, HIGH: 3, 'VERY HIGH': 4, EXCEPTIONAL: 4 });
/* v91.17.283.40 · item 30 · the official class words as the flood office publishes them ("Very High", "Exceptionally High"; peaks page
   "VH" / "EH"; underscore and spacing variants of the sheet): every spelling reaches its class. Before, "EXCEPTIONALLY HIGH" or
   "VERY_HIGH" in the sheet gave no level at all (the reading was dropped silently). Only the words map; no class limit is involved. */
const STATUS_ALIAS = Object.freeze({ VH: 'VERY HIGH', 'V HIGH': 'VERY HIGH', 'EXCEPTIONALLY HIGH': 'EXCEPTIONAL', 'EXCEPTIONAL HIGH': 'EXCEPTIONAL',
  'EX HIGH': 'EXCEPTIONAL', 'EXCEP HIGH': 'EXCEPTIONAL', EH: 'EXCEPTIONAL', MED: 'MEDIUM' });
export function normStatus(s) { const k = String(s || '').toUpperCase().replace(/\bFLOODS?\b/g, ' ').replace(/[^A-Z]+/g, ' ').trim();
  return k ? (STATUS_ALIAS[k] || k) : null; }
export const STATUS_SKILL = Object.freeze({ 1: { pod: 0.80, far: 0.20 }, 2: { pod: 0.68, far: 0.32 }, 3: { pod: 0.57, far: 0.43 },
  basis: 'status persistence, 197 flood event-days (>= Low) of Jul-Sep 2026 at the sheet stations (scratchpad/river31)' });
const WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];

/* -- the model's change only -- */
export function flowChangeOnly(daily) {
  if (!daily || !Array.isArray(daily.time)) return null;
  const out = { time: daily.time.slice() }; let any = false;
  for (const [k, v] of Object.entries(daily)) { if (k === 'time' || !Array.isArray(v) || !/discharge/.test(k)) continue;
    const i0 = v.findIndex((x) => Number.isFinite(x) && x > 0); const b = i0 >= 0 ? v[i0] : null;
    out[k.replace('river_discharge', 'river_flow_change')] = v.map((x) => (b && Number.isFinite(x) ? Math.round((x / b) * 1000) / 1000 : null)); any = true; }
  return any ? { ...out, unit: 'ratio to the first day of the record (the model\u2019s change; its flows are not shown)' } : null;
}

/* -- the sheet -- */
const norm = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/\b(dam|barrage|headworks|bridge|qila|new|river|at|reach|sharif|benazeer)\b/g, ' ').replace(/[^a-z]/g, '');
export function parseSheet(text) {
  const lines = String(text || '').split(/\r?\n/).filter(Boolean); if (!lines.length) return [];
  const split = (l) => { const o = []; let c = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(c); c = ''; } else c += ch; } o.push(c); return o; };
  const H = split(lines.shift()); const ix = (n) => H.indexOf(n);
  const I = { date: ix('date'), station: ix('station'), river: ix('river'), lat: ix('lat'), lon: ix('lon'), inflow: ix('inflow_cusec'), outflow: ix('outflow_cusec'), status: ix('status'), trend: ix('outflow_trend') };
  const num = (x) => { const v = Number(String(x || '').replace(/,/g, '')); return Number.isFinite(v) && String(x).trim() !== '' ? v : null; };
  return lines.map((l) => { const c = split(l); return { date: c[I.date], station: (c[I.station] || '').trim(), river: c[I.river] || null, lat: num(c[I.lat]), lon: num(c[I.lon]),
    inflowCusec: num(c[I.inflow]), outflowCusec: num(c[I.outflow]), status: normStatus(c[I.status]), trend: I.trend >= 0 ? (c[I.trend] || null) : null }; })
    .filter((r) => r.station && /^\d{4}-\d{2}-\d{2}/.test(r.date || ''));
}

export function createRiverSheet(app, { lakeDir, dataDir = null }) {
  let RLk = null; const gaugeMeta = (id) => { try { if (!RLk && dataDir) RLk = JSON.parse(readFileSync(join(dataDir, 'river-link.json'), 'utf8')); } catch (_) { RLk = null; } return RLk && RLk.gauges ? RLk.gauges[id] || null : null; };
  const file = () => join(lakeDir, 'archive', 'irsa', 'irsa_daily.csv');
  let C = null, CK = null;
  function rows() { const f = file(); if (!existsSync(f)) return null; let k = null; try { const s = statSync(f); k = s.mtimeMs + ':' + s.size; } catch (_) { return null; }
    if (C && k === CK) return C; try { C = parseSheet(readFileSync(f, 'utf8')); CK = k; } catch (_) { C = null; } return C; }
  function stations() {
    const R = rows(); if (!R) return { ready: false, why: 'missing: the river gauge sheet archive is not held yet (station-lake/archive/irsa/irsa_daily.csv)' };
    const by = new Map(); for (const r of R) { const a = by.get(r.station) || []; a.push(r); by.set(r.station, a); }
    const out = []; for (const [name, a] of by) { a.sort((x, y) => (x.date < y.date ? -1 : 1)); const t = a[a.length - 1];
      out.push({ station: name, river: t.river, lat: t.lat, lon: t.lon, date: t.date.slice(0, 10), flowCusec: t.inflowCusec ?? t.outflowCusec, inflowCusec: t.inflowCusec, outflowCusec: t.outflowCusec,
        status: t.status, level: STATUS_LEVEL[t.status] ?? null, word: STATUS_LEVEL[t.status] != null ? WORDS[STATUS_LEVEL[t.status]] : null, history: a.length }); }
    const newest = out.reduce((m, s) => (s.date > m ? s.date : m), '');
    return { ready: true, kind: 'observed', source: 'river gauge sheet (measured)', newest, stations: out, n: out.length };
  }
  /* the nearest sheet station of a model reach gauge (river-link.json gauges: name, river) on the same river */
  function matchGauge(g) { const S = stations(); if (!S.ready || !g) return null; const gn = norm(g.name), gr = norm(g.river);
    let hit = S.stations.find((s) => { const sn = norm(s.station); return sn && gn && (sn === gn || gn.startsWith(sn) || sn.startsWith(gn) || (g.name && new RegExp('\\b' + s.station.split(' ')[0] + '\\b', 'i').test(g.name))); });
    if (hit && gr && hit.river && norm(hit.station) !== gn && !norm(hit.river).includes(gr) && !gr.includes(norm(hit.river))) hit = null;   /* same river only (unless the station name is the same: Panjnad) */
    return hit || null; }
  /* days 0-3 at a station: today measured; 1-3 carried forward, the model's change applied to the flow */
  async function forecast(st) {
    if (!st) return null; let ch = null;
    try { const r = app.pointProducts ? await app.pointProducts.get('riverflow', { latitude: String(st.lat), longitude: String(st.lon), daily: 'river_discharge', forecast_days: '5', past_days: '1', timezone: 'Asia/Karachi' }) : null;
      const d = r && r.status === 200 && r.body && r.body.daily; if (d && Array.isArray(d.time)) { const i0 = d.time.indexOf(st.date); const q = d.river_discharge || [];
        if (i0 >= 0 && Number.isFinite(q[i0]) && q[i0] > 0) ch = [1, 2, 3].map((k) => (Number.isFinite(q[i0 + k]) ? q[i0 + k] / q[i0] : null)); } } catch (_) { ch = null; }
    const day = (k) => new Date(Date.parse(st.date + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);
    return { station: st.station, river: st.river, basis: 'measured flow carried forward with the global river model\u2019s day-to-day change; status carried forward', skill: STATUS_SKILL,
      days: [{ day: 0, date: st.date, flowCusec: st.flowCusec, status: st.status, level: st.level, word: st.word, observed: true }]
        .concat([1, 2, 3].map((k) => ({ day: k, date: day(k), flowCusec: st.flowCusec != null ? (ch && ch[k - 1] != null ? Math.round(st.flowCusec * ch[k - 1]) : st.flowCusec) : null,
          changeApplied: !!(ch && ch[k - 1] != null), status: st.status, level: st.level, word: st.word, carried: true, statusSkill: STATUS_SKILL[k] }))) };
  }
  /* the measured status of a reach gauge id, from its sheet station: today observed, days 1-3 carried forward with the tested skill */
  function measuredFor(gaugeId) { const g = gaugeMeta(gaugeId); const st = g ? matchGauge(g) : null; if (!st) return null;
    const age = Math.round((Date.now() - Date.parse(st.date + 'T06:00:00+05:00')) / 864e5);
    return { gauge: gaugeId, station: st.station, river: st.river, date: st.date, ageDays: age, flowCusec: st.flowCusec, status: st.status, level: st.level, word: st.word, source: 'river gauge sheet (measured)' }; }
  function syncStatus() { try { return JSON.parse(readFileSync(join(lakeDir, 'archive', 'irsa', 'sync_status.json'), 'utf8')); } catch (_) { return null; } }
  return { rows, stations, matchGauge, forecast, measuredFor, gaugeMeta, syncStatus };
}
