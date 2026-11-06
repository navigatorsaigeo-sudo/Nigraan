/* v91.17.259 · D2/D3 · LIVE HELD-OUT CHECK OF THE 250 m DEW POINT / HUMIDITY / SHADE UTCI MAP
   One sample per run, for the current UTC hour. For every fleet station that was NOT in the dew model's training table
   (ds_stations.json: more than 0.3 km from every training station) and has a reading within 30 min of the hour:
     cell    the 250 m map value at the station's cell (/api/hyperlocal/grid?q=moist&shadow=1, 0.0025 deg cells)
     point   the served chain at the station itself (/px/v1/forecast, the point forecast the page uses)
     tehsil  the served chain at the tehsil centre (centre of the tehsil bounds, as the page's unit card)
   each with and without the live MACH layer where the chain offers it (__nolive), against the station's own reading.
   UTCI in shade for every candidate from its own temperature, humidity and wind; the observed UTCI uses the observed
   temperature and humidity with the SAME candidate's wind (fleet anemometers are not 10 m standard, WMO-No. 8).
   Appends one JSON line per station to D:\NIGRAAN\_admin\ds\live_check.jsonl.
   node scripts\ds\ds_live_check.mjs [base]   (base default http://127.0.0.1:8787) */
import { readFileSync, appendFileSync, mkdirSync, existsSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { utci } from '../../server/api/utci.mjs';
import { rhFromDew } from '../../server/api/psychro.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');                       // nigraan-local
const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const OUTD = join(ROOT, '..', '..', '_admin', 'ds'); mkdirSync(OUTD, { recursive: true });
const OUT = join(OUTD, 'live_check.jsonl');
const ST = JSON.parse(readFileSync(join(HERE, 'ds_stations.json'), 'utf8')).stations.filter((s) => !s.trained && s.tehsilLat != null);
const H = { 'Sec-Fetch-Site': 'same-origin', 'x-agn-internal': 'hyperlocal-grid' };
const now = new Date(); const hourIso = now.toISOString().slice(0, 13); const hourMs = Date.parse(hourIso + ':00:00Z');

/* the fleet readings: the tail of this month's archive (fleet.mjs appends every poll) */
function tail(f, bytes) { const sz = statSync(f).size, n = Math.min(sz, bytes), b = Buffer.alloc(n); const fd = openSync(f, 'r'); try { readSync(fd, b, 0, n, sz - n); } finally { closeSync(fd); } return b.toString('utf8'); }
const lake = join(ROOT, '..', 'station-lake', 'archive', 'fleet');
const obs = new Map();
for (const m of [hourIso.slice(0, 7)]) {
  const f = join(lake, 'fleet_obs_' + m + '.csv'); if (!existsSync(f)) continue;
  for (const ln of tail(f, 3e6).split('\n')) { const c = ln.split(','); if (c.length < 13 || c[0] === 'polled_utc') continue;
    const t = Date.parse(c[4]); if (!Number.isFinite(t) || Math.abs(t - hourMs) > 30 * 60e3) continue;
    const T = c[5] === '' ? null : +c[5], RH = c[6] === '' ? null : +c[6], TD = c[7] === '' ? null : +c[7]; if (T == null || (RH == null && TD == null)) continue;
    const prev = obs.get(c[1]); const lag = Math.abs(t - hourMs) / 60e3; if (!prev || lag < prev.lagMin) obs.set(c[1], { t: c[4], lagMin: lag, T, RH, TD }); }
}
const S = ST.filter((s) => obs.has(s.key));
if (!S.length) { console.log('no held-out station has a reading within 30 min of ' + hourIso + ':00Z'); process.exit(0); }

/* clusters of at most 0.35 deg so the grid cells are 250 m */
const cl = []; for (const s of [...S].sort((a, b) => a.lat - b.lat || a.lon - b.lon)) {
  let k = cl.find((c) => Math.max(c.n, s.lat) - Math.min(c.s, s.lat) <= 0.35 && Math.max(c.e, s.lon) - Math.min(c.w, s.lon) <= 0.35);
  if (!k) cl.push(k = { s: s.lat, n: s.lat, w: s.lon, e: s.lon, st: [] });
  k.s = Math.min(k.s, s.lat); k.n = Math.max(k.n, s.lat); k.w = Math.min(k.w, s.lon); k.e = Math.max(k.e, s.lon); k.st.push(s); }
const cellOf = new Map();
for (const c of cl) {
  const s = c.s - 0.01, n = c.n + 0.01, w = c.w - 0.01, e = c.e + 0.01;
  const nx = Math.min(160, Math.max(10, Math.ceil((e - w) / 0.0025))), ny = Math.min(160, Math.max(10, Math.ceil((n - s) / 0.0025)));
  let j = null;
  for (let tr = 0; tr < 3 && !j; tr++) { try { const r = await fetch(`${BASE}/api/hyperlocal/grid?s=${s.toFixed(4)}&w=${w.toFixed(4)}&n=${n.toFixed(4)}&e=${e.toFixed(4)}&nx=${nx}&ny=${ny}&q=moist&shadow=1`, { signal: AbortSignal.timeout(240e3) }); const x = await r.json(); if (x && x.ok) j = x; else if (x && x.preparing) await new Promise((o) => setTimeout(o, 30e3)); else break; } catch (_) { await new Promise((o) => setTimeout(o, 20e3)); } }
  if (!j || String(j.hourUtc).slice(0, 13) !== hourIso) continue;
  for (const st of c.st) {
    const r = Math.min(j.ny - 1, Math.floor((j.bbox[2] - st.lat) / (j.bbox[2] - j.bbox[0]) * j.ny)), q = Math.min(j.nx - 1, Math.floor((st.lon - j.bbox[1]) / (j.bbox[3] - j.bbox[1]) * j.nx)), k = r * j.nx + q;
    cellOf.set(st.key, { T: j.t[k], Tnl: j.inputs ? j.inputs.tNoLive[k] : null, td: j.td[k], rh: j.rh[k], utci: j.utci[k], tdRaw: j.inputs ? j.inputs.tdRaw[k] : null, ws: j.inputs ? j.inputs.wsMs[k] : null, zone: j.inputs ? j.inputs.zone[k] : null, gate: j.moist && j.moist.gate });
  }
}
/* the served chain at the station and at the tehsil centre, with and without the live layer */
async function chain(pts, nolive) {
  const res = []; for (let i = 0; i < pts.length; i += 40) { const b = pts.slice(i, i + 40);
    const q = new URLSearchParams({ __omhost: 'api.open-meteo.com', latitude: b.map((p) => p[0].toFixed(4)).join(','), longitude: b.map((p) => p[1].toFixed(4)).join(','), hourly: 'temperature_2m,dew_point_2m,relative_humidity_2m,wind_speed_10m', forecast_days: '1', timezone: 'UTC', ...(nolive ? { __nolive: '1' } : {}) });
    let a = null; for (let tr = 0; tr < 3 && !a; tr++) { try { const r = await fetch(`${BASE}/px/v1/forecast?` + q, { headers: H, signal: AbortSignal.timeout(240e3) }); if (r.ok) { const x = await r.json(); a = Array.isArray(x) ? x : [x]; } } catch (_) { await new Promise((o) => setTimeout(o, 15e3)); } }
    b.forEach((p, k) => { const L = a && a[k] && a[k].hourly; if (!L) { res.push(null); return; } const ix = L.time.findIndex((t) => String(t).slice(0, 13) === hourIso);
      res.push(ix < 0 ? null : { T: L.temperature_2m[ix], td: L.dew_point_2m ? L.dew_point_2m[ix] : null, rh: L.relative_humidity_2m ? L.relative_humidity_2m[ix] : null, ws: L.wind_speed_10m[ix] == null ? null : L.wind_speed_10m[ix] / 3.6 }); }); }
  return res; }
const pts = S.map((s) => [s.lat, s.lon]), tps = S.map((s) => [s.tehsilLat, s.tehsilLon]);
const [P, Pn, Tt, Tn] = await Promise.all([chain(pts, false), chain(pts, true), chain(tps, false), chain(tps, true)]);
const U = (T, rh, ws) => (T == null || rh == null || ws == null) ? null : utci(T, T, ws, rh);
const lines = [];
S.forEach((s, i) => {
  const o = obs.get(s.key); const oRH = o.RH != null ? o.RH : rhFromDew(o.T, o.TD); const oTD = o.TD;
  const cand = { cell: cellOf.get(s.key) || null, point: P[i], pointNoLive: Pn[i], tehsil: Tt[i], tehsilNoLive: Tn[i] };
  for (const k of Object.keys(cand)) { const c = cand[k]; if (!c) continue; if (c.rh == null && c.td != null && c.T != null) c.rh = rhFromDew(c.T, c.td); if (c.utci == null) c.utci = U(c.T, c.rh, c.ws); c.utciObs = U(o.T, oRH, c.ws); }
  lines.push(JSON.stringify({ hourUtc: hourIso + ':00Z', at: now.toISOString(), key: s.key, lat: s.lat, lon: s.lon, tehsil: s.tehsil, kmNearestTrain: s.kmNearest, obs: { t: o.t, lagMin: Math.round(o.lagMin), T: o.T, RH: oRH, TD: oTD }, ...cand }));
});
appendFileSync(OUT, lines.join('\n') + '\n');
console.log(`${hourIso}:00Z  held-out stations with a reading ${S.length}, with a 250 m cell ${cellOf.size}, clusters ${cl.length} -> ${OUT}`);
