/* ══ v91.17.274 · RIVER · the model river flow checked against the daily river-gauge record ═══════════════════════════════════
   data/river-cal.json (built offline: _work/rivercal*.py; method, scope and per-reach held-out gate inside the file).
   What the held-out test found, and therefore all this module does:
     1. MAP LEVEL: unchanged. No calibration of the model flow (quantile map, log-linear, seasonal quantile map) placed a reach's
        map level closer to the gauge class than the served rarity level on held-out seasons, on any reach. Nothing here touches it.
     2. GAUGE PANEL WHEN THE RIVER SHEET STOPS: a gauge's last reading stays the better guess for days. Only from the sheet age at
        which the reach model level matched the gauge class better on held-out data (staleSheet.switchAgeDays, per gauge) does the
        panel show the reach model level for that gauge instead of the old reading. Gauges without such an age keep the reading.
     3. OPERATOR ONLY: a gauge-equivalent model flow (thousand cusecs) for reaches whose calibrated flow beat the raw model flow on
        held-out seasons (flowGate.passes). Never in the customer view.
   Switch: NIGRAAN_RIVERCAL=0 turns 2 and 3 off (default ON, and ON only where the file says the reach passed).
   Light: a file read every 10 minutes, then lookups and one interpolation per day. */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/* v91.17.283.13 · audit B5 · the age of ONE gauge's reading (PKT days since its own last reading day, the sheet's day when the gauge names
   none) and the rule that a gauge more than GAUGE_STALE_DAYS days old is not current. Used by /api/flood/gauges (index.mjs). */
import { limitH as dataLimitH } from './dataage.mjs';
export const GAUGE_STALE_DAYS = dataLimitH('gauge') / 24;   /* v283.36 item 29: daily sheet 24 h cycle + 24 h delivery (= 2 days, from the table) */
export function gaugeAge(g, basedOn, now = Date.now()) { const last = (g && g.lastReading) || basedOn || null;
  const age = last ? (now - Date.parse(last + 'T01:00:00Z')) / 864e5 : null;
  return { ...g, lastReading: (g && g.lastReading) || last, ageDays: age == null ? null : Math.floor(age), stale: age == null || age > GAUGE_STALE_DAYS }; }
export function gaugeCurrent(g) { if (!g || !g.stale) return g;
  return { ...g, cls: null, clsName: null, kcusecs: null, m3s: null, days: [], current: false, lastMeasured: { date: g.lastReading || null, cls: g.cls ?? null, clsName: g.clsName ?? null, kcusecs: g.kcusecs ?? null },
    why: 'last measured ' + (g.lastReading || 'never') + ' (' + g.ageDays + ' days ago): not current' }; }
export function createRiverCal(dataDir) {
  const file = join(dataDir, 'river-cal.json');
  let C = null, at = 0;
  function table() {
    const now = Date.now();
    if (now - at > 10 * 60e3) { at = now; try { C = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
      if (C) { C._ages = {}; for (const [k, v] of Object.entries(C.reaches || {})) { const a = v.staleSheet ? v.staleSheet.switchAgeDays : null; if (Number.isFinite(a)) C._ages[k] = a; } } } catch { /* keep the last */ } }
    return C;
  }
  const enabled = () => process.env.NIGRAAN_RIVERCAL !== '0';
  const reach = (id) => { const T = table(); return T && T.reaches ? T.reaches[String(id || '').toLowerCase()] || null : null; };

  /* the sheet age (days) from which this gauge reads the reach model level; null = keep the last reading at any age */
  function switchAgeDays(id) {
    if (!enabled()) return null;
    const T = table(); const a = T && T._ages ? T._ages[String(id || '').toLowerCase()] : undefined;
    return a === undefined ? null : a;
  }

  function interp(x, m, o) {
    const n = m.length; if (!n) return null;
    if (x > m[n - 1]) return m[n - 1] > 0 ? x * (o[n - 1] / m[n - 1]) : null;   /* above the fitted range: the top ratio is carried */
    if (x < m[0]) return m[0] > 0 ? x * (o[0] / m[0]) : null;
    for (let i = 1; i < n; i++) if (x <= m[i]) { const t = m[i] > m[i - 1] ? (x - m[i - 1]) / (m[i] - m[i - 1]) : 0; return o[i - 1] + t * (o[i] - o[i - 1]); }
    return o[n - 1];
  }
  const halfMonth = (iso) => { const mo = Number(String(iso).slice(5, 7)), d = Number(String(iso).slice(8, 10)); return mo >= 1 && mo <= 12 ? (mo - 1) * 2 + (d > 15 ? 1 : 0) : null; };

  /* operator only: gauge-equivalent flow per forecast day from the ensemble median (m³/s) of the reach; the fitted lag means the
     model day t+lag stands for the gauge day t, so the last |lag| days of a run have no value */
  function gaugeEquivalent(id, days) {
    if (!enabled()) return null;
    const R = reach(id); const F = R && R.flowGate && R.flowGate.passes && R.flow;
    if (!F || !Array.isArray(days)) return null;
    const L = F.lagDays | 0;
    const out = days.map((d, j) => {
      const src = days[j + L]; const q = src && src.q ? src.q[1] : null;
      if (q == null || !isFinite(q)) return { date: d.date, kcusecs: null, why: src ? 'no ensemble median for the model day' : 'the model day this gauge day needs (lag ' + L + ' d) is not in the run' };
      const b = halfMonth(d.date);
      if (b == null || !Array.isArray(F.testedBins) || !F.testedBins.includes(b)) return { date: d.date, kcusecs: null, why: 'outside the season the calibration was tested on' };
      const T = (F.halfMonth && F.halfMonth[b]) || F.all;
      const v = interp(q, T.m, T.o);
      return { date: d.date, kcusecs: v == null ? null : Math.round(v * 10) / 10 };
    });
    return { unit: 'thousand cusecs', lagDays: L, days: out, maeHeldOut: { raw: R.flowGate.maeRaw, calibrated: R.flowGate.maeCal }, version: table().version };
  }

  function status() {
    const T = table(); if (!T) return { ready: false, why: 'data/river-cal.json missing' };
    const r = Object.entries(T.reaches || {});
    return { ready: true, enabled: enabled(), version: T.version, built: T.built,
      levelPasses: r.filter(([, v]) => v.levelGate && v.levelGate.passes).map(([k]) => k),
      flowPasses: r.filter(([, v]) => v.flowGate && v.flowGate.passes && v.flow).map(([k]) => k),
      staleSwitch: Object.fromEntries(r.filter(([, v]) => v.staleSheet && v.staleSheet.switchAgeDays != null).map(([k, v]) => [k, v.staleSheet.switchAgeDays])),
      scope: T.scope };
  }
  /* all gauges' switch ages in one read (one switch check per request); null when the switch is off */
  function switchAges() { if (!enabled()) return null; const T = table(); return (T && T._ages) || {}; }
  return { switchAgeDays, switchAges, gaugeEquivalent, status, reach, enabled };
}
