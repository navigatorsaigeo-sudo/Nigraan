/* ══ v91.17.269 · ONE MONTH OF THE MACH OBSERVATION RECORD, PARSED OFF THE MAIN THREAD (PERF A3) ═════════════════════════════════
   The past-30-days interface (past30.mjs) reads station-lake/archive/fleet/db/mach_db_YYYY-MM.csv: per station, per Pakistan day,
   the highest and lowest screened reading and the Pakistan hours that held one. Measured on v268: one month (94 000 rows, 10 MB)
   took 1.4-1.6 s on the server's main thread, so every request in that time waited (2.3-4.3 s for the first answer on the laptop).
   The same parse now runs in a worker thread; the main thread receives the finished table. parseMonthText is the v91.17.267 code
   unchanged (moved here from past30.mjs), so the table is the one the main thread built before; it is also the fallback when a
   worker cannot start. The hours travel as a 24-bit mask and become the same Set of hours again. */
import { readFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { histQc } from './fleet.mjs';
import { pktDay } from './pktday.mjs';
import { seriesRows, copyCheck } from './obsqc.mjs';   /* v91.17.283.14 · the value-level quality control (its series checks include the v91.17.272 screen) */

export function parseMonthText(text, noApple, pos = null) {
  const M = new Map(); const lines = text.split(/\r?\n/); const h = (lines[0] || '').split(','); const ix = (n) => h.indexOf(n);
  const iT = ix('time'), iK = ix('station_key'), iS = ix('source'), iTe = ix('temperature_c'), iD = ix('dew_point_c'), iH = ix('humidity_pct'), iP = ix('pressure_hpa'), iPv = ix('provider');
  const iSo = ix('solar_wm2'), iW = ix('wind_speed_kmh'), iG = ix('wind_gust_kmh');   /* v91.17.278 · the outdoor-array screen (stuckscreen.mjs ARRAY_RULE) */
  if (iT >= 0 && iK >= 0 && iTe >= 0) {
    const keep = [], sig = new Map();
    for (let i = 1; i < lines.length; i++) { const c = lines[i].split(','); if (c.length !== h.length) continue;   /* a row two writers merged is skipped, as fleet.mjs does */
      if (iS >= 0 && c[iS] === 'qm') continue; if (noApple && iPv >= 0 && /^apple/i.test(c[iPv])) continue;
      const ms = Date.parse(c[iT]); if (!Number.isFinite(ms)) continue;
      const v = (j) => (j < 0 || c[j] === '' || c[j] == null) ? null : (Number.isFinite(+c[j]) ? +c[j] : null);
      const q = histQc({ temperatureC: v(iTe), dewPointC: v(iD), humidityPct: v(iH), pressureHpa: v(iP) }); if (!q) continue;
      const o = { k: c[iK], ms, T: q.tempC, cut: false, x: { ms, T: v(iTe), Td: v(iD), RH: v(iH), P: v(iP), S: v(iSo), W: v(iW), G: v(iG) } }; keep.push(o);
      /* a reading two stations carry identically in the same hour is a copied record (obsqc.mjs copyCheck, v91.17.283.14) */
      const hk = Math.round(ms / 3600e3); (sig.get(hk) || sig.set(hk, []).get(hk)).push({ pid: o.k, r: { T: q.tempC, RH: q.rhPct, Td: q.dewC, P: q.pressureHpa }, o }); }
    for (const g of sig.values()) { if (g.length < 2) continue; copyCheck(g); for (const it of g) if (it.r.f && it.r.f.T) it.o.cut = true; }
    /* each station's record through the quality control's series checks (obsqc.mjs seriesRows), as the live poll */
    for (const o of seriesRows(keep, (o) => o.k, (o) => o.x, pos ? (k) => (pos[k] ? { lat: pos[k][0], lon: pos[k][1] } : null) : null).keys()) o.cut = true;
    for (const o of keep) { if (o.cut) continue; const d = pktDay(o.ms), hr = Math.floor(((o.ms + 5 * 3600e3) % 864e5) / 3600e3);
      const S = M.get(o.k) || M.set(o.k, new Map()).get(o.k); const D = S.get(d) || S.set(d, { hi: null, lo: null, h: new Set() }).get(d);
      D.h.add(hr); if (D.hi == null || o.T > D.hi) D.hi = o.T; if (D.lo == null || o.T < D.lo) D.lo = o.T; }
  }
  return M;
}
/* the table as plain arrays for postMessage: [[station, [[day, hi, lo, hourMask], ...]], ...] */
function pack(M) { const out = []; for (const [k, S] of M) { const days = []; for (const [d, D] of S) { let m = 0; for (const x of D.h) m |= 1 << x; days.push([d, D.hi, D.lo, m]); } out.push([k, days]); } return out; }
function unpack(a) { const M = new Map(); for (const [k, days] of a) { const S = new Map(); for (const [d, hi, lo, m] of days) { const h = new Set(); for (let x = 0; x < 24; x++) if (m & (1 << x)) h.add(x); S.set(d, { hi, lo, h }); } M.set(k, S); } return M; }

/* parse the files in one worker thread: resolves to Map(file -> table); a file the worker could not read maps to null. With no
   worker (it failed to start or died) the files are parsed here, on the calling thread, as before. */
export function parseMonths(files, noApple, pos = null) {
  return new Promise((resolve) => {
    const out = new Map(); let done = false;
    const local = () => { if (done) return; done = true; for (const f of files) if (!out.has(f)) { try { out.set(f, parseMonthText(readFileSync(f, 'utf8'), noApple, pos)); } catch (_) { out.set(f, null); } } resolve(out); };
    let w; try { w = new Worker(new URL(import.meta.url), { workerData: { past30parse: true, files, noApple, pos } }); } catch (_) { return local(); }
    w.unref();
    w.on('message', (m) => { if (m && m.f) out.set(m.f, m.err ? null : unpack(m.t)); if (m && m.end && !done) { done = true; resolve(out); } });
    w.on('error', local); w.on('exit', () => { if (!done) local(); });
  });
}
if (!isMainThread && workerData && workerData.past30parse) {
  for (const f of workerData.files) { try { parentPort.postMessage({ f, t: pack(parseMonthText(readFileSync(f, 'utf8'), workerData.noApple, workerData.pos || null)) }); } catch (e) { parentPort.postMessage({ f, err: String(e && e.message || e) }); } }
  parentPort.postMessage({ end: true });
}
