/* ══ v283 WS9 · RIVER MODEL FLOW CORRECTED TO THE DAILY GAUGE SHEET, PER GAUGE (INTERNAL) ══════════════════════════════════════════
   data/flood-glofascal/glofascal.json is fitted offline (scripts/gen/flood_glofascal/glofascal.py) while the daily river-gauge sheet
   runs: per gauge, quantile mapping (QM) and log-linear with a seasonal term (LLS) of the GloFAS reach flow to the gauge inflow,
   tested leave-one-season-out (2024, 2025, 2026). A gauge carries a correction only when its form beat the raw model flow on held-out
   seasons (MAE gain lower 95 % bound > 0, no held-out season worse, |bias| not larger, Low-limit CSI not lower); the file names it.
   Use: when the sheet stops, NIGRAAN still has a gauge-equivalent flow (thousand cusecs) from the river forecast, per forecast day.
   Scope: the test is at lead 0 (reanalysis flow); forecast days add the weather-forecast error. OPERATOR ONLY: the response never
   names the gauge-sheet source, and the customer view does not use it. Switch: NIGRAAN_GLOFASCAL=0 turns it off.
   Light: the file is re-read when it changes (checked at most once a minute); one interpolation per day.
   v283.10 · DATE FRAME: the table must be fitted on the served river flow (provider API, timezone GMT since v283.10 part 3:
   modelFrame 'provider-api-gmt'; flood.mjs RIVER_DATE_FRAME). glofascal-283.1 was fitted on the station file glofas_irsa_daily.csv.gz, whose day labels are 1 day
   (to 2023-07) and 2 days (2023-08 on) earlier than the served forecast rows and whose Tarbela, Balloki and Sidhnai cells are other
   model cells; its lag and scale do not hold on the served flow, so a table without the served frame is refused here. */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function createGlofasCal(dataDir) {
  const file = join(dataDir, 'flood-glofascal', 'glofascal.json');
  let C = null, stamp = null, checked = 0, err = null;
  function table() {
    const now = Date.now();
    if (now - checked < 60e3) return C;
    checked = now;
    try { const m = statSync(file).mtimeMs; if (m !== stamp) { C = JSON.parse(readFileSync(file, 'utf8')); stamp = m; err = null; } }
    catch (e) { C = null; stamp = null; err = e.code === 'ENOENT' ? 'data/flood-glofascal/glofascal.json is not installed' : e.message; }
    return C;
  }
  const FRAME = 'provider-api-gmt';
  const frameOk = (T) => !!T && T.modelFrame === FRAME;
  const FRAME_WHY = 'the calibration table was fitted on another date frame than the served river flow; refit with scripts/gen/flood_glofascal (v283.10)';
  const enabled = () => process.env.NIGRAAN_GLOFASCAL !== '0';
  const reach = (id) => { const T = table(); return T && T.reaches ? T.reaches[String(id || '').toLowerCase()] || null : null; };

  function interp(x, m, o) {
    const n = m.length; if (!n || !Number.isFinite(x)) return null;
    if (x > m[n - 1]) return m[n - 1] > 0 ? x * (o[n - 1] / m[n - 1]) : null;
    if (x < m[0]) return m[0] > 0 ? x * (o[0] / m[0]) : null;
    let lo = 0, hi = n - 1; while (hi - lo > 1) { const k = (lo + hi) >> 1; if (m[k] <= x) lo = k; else hi = k; }
    const t = m[hi] > m[lo] ? (x - m[lo]) / (m[hi] - m[lo]) : 0; return o[lo] + t * (o[hi] - o[lo]);
  }
  const doy = (iso) => { const t = Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z'); if (!Number.isFinite(t)) return null; return Math.floor((t - Date.UTC(new Date(t).getUTCFullYear(), 0, 1)) / 864e5) + 1; };

  /* one model flow (m³/s) on one date -> gauge-equivalent thousand cusecs, by the reach's served form; null with why otherwise */
  function correct(id, qM3s, dateIso) {
    const T = table(); if (!enabled()) return { value: null, why: 'switched off (NIGRAAN_GLOFASCAL=0)' };
    if (!T) return { value: null, why: err || 'no calibration table' };
    if (!frameOk(T)) return { value: null, why: FRAME_WHY };
    const R = reach(id); if (!R) return { value: null, why: 'this gauge has no calibration record' };
    if (!R.served) return { value: null, why: 'the correction did not beat the raw model flow on held-out seasons at this gauge' };
    const q = Number(qM3s); if (!(q >= 0)) return { value: null, why: 'no model flow' };
    const mk = q / T.m3sPerKcusecs, mo = Number(String(dateIso).slice(5, 7));
    if (Array.isArray(R.fitMonths) && !R.fitMonths.includes(mo)) return { value: null, why: 'outside the months the correction was fitted and tested on' };
    let v = null;
    if (R.served === 'QM') v = interp(mk, R.fit.QM.modelKcusecs, R.fit.QM.gaugeKcusecs);
    else if (R.served === 'LLS') { const b = R.fit.LLS.beta, d = doy(dateIso); if (d == null) return { value: null, why: 'bad date' };
      const w = 2 * Math.PI * d / 365.25; v = Math.exp(b[0] + b[1] * Math.log(Math.max(mk, 1e-3)) + b[2] * Math.sin(w) + b[3] * Math.cos(w)) * R.fit.LLS.smear; }
    return v == null || !Number.isFinite(v) ? { value: null, why: 'no value' } : { value: Math.round(v * 10) / 10, form: R.served };
  }

  /* per forecast day: the model day t+lag stands for the gauge day t (the fitted lag); the ensemble q10 / median / q90 each corrected */
  function gaugeEquivalent(id, days) {
    if (!enabled()) return null;
    if (table() && !frameOk(table())) return { ready: false, why: FRAME_WHY };
    const R = reach(id); if (!R || !Array.isArray(days)) return null;
    if (!R.served) return { ready: false, why: 'the correction did not beat the raw model flow on held-out seasons at this gauge', heldOut: summary(R) };
    const L = R.fit.lagDays | 0;
    const out = days.map((d, j) => {
      const src = days[j + L]; const q = src && Array.isArray(src.q) ? src.q : null;
      if (!q) return { date: d.date, kcusecs: null, why: src ? 'no ensemble flow for the model day' : 'the model day this gauge day needs (lag ' + L + ' d) is not in the run' };
      const c = q.map((x) => correct(id, x, d.date));
      return { date: d.date, kcusecs: c[1].value, range: [c[0].value, c[2].value], why: c[1].value == null ? c[1].why : undefined };
    });
    return { ready: true, unit: 'thousand cusecs', form: R.served, lagDays: L, days: out, heldOut: summary(R), version: table().version, productType: 'Internal calibration' };
  }
  const summary = (R) => R ? { vsPersistence: R.vsPersistence || null, n: R.heldOut.n, maeRaw: R.heldOut.raw.mae, maeCal: R.served ? R.heldOut[R.served].mae : null, biasRaw: R.heldOut.raw.bias, biasCal: R.served ? R.heldOut[R.served].bias : null,
    lowLimitCsiRaw: R.heldOut.raw.low ? R.heldOut.raw.low.csi : null, lowLimitCsiCal: R.served && R.heldOut[R.served].low ? R.heldOut[R.served].low.csi : null, gate: R.gate } : null;

  function status() {
    const T = table(); if (!T) return { ready: false, why: err || 'no calibration table' };
    if (!frameOk(T)) return { ready: false, version: T.version, why: FRAME_WHY };
    const r = Object.entries(T.reaches || {});
    return { ready: true, enabled: enabled(), version: T.version, modelFrame: T.modelFrame, built: T.built, productType: T.productType, summary: T.summary,
      served: Object.fromEntries(r.filter(([, v]) => v.served).map(([k, v]) => [k, v.served])),
      notServed: Object.fromEntries(r.filter(([, v]) => !v.served).map(([k, v]) => [k, [...new Set([...(v.gate.QM.why || []), ...(v.gate.LLS.why || [])])]])) };
  }
  return { correct, gaugeEquivalent, status, reach, enabled };
}
