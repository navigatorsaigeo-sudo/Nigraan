/* ══ v91.17.283.25 · THE EWS LIVE ANCHOR: THE METHOD (one home; pure, no network, no server state) ══════════════════════════════════════
   The coefficients file, the fade and the simple kriging of the EWS live anchor. The server's hourly shadow (ewsshadow.mjs) and the
   verification agent (scripts/agents/verify.mjs, section EWS-ANCHOR SHADOW) both call anchorAt(), so the anchor scored is the anchor
   computed. What the layer is and why it is shadow only: ewsshadow.mjs. */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { solve } from './hyperlocal.mjs';

const H = 3600e3;
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
export const kmBetween = (a, b, c, d) => { const p = Math.PI / 180; const x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2; return 12742 * Math.asin(Math.sqrt(Math.min(1, x))); };
export const EWS_ELEMENT = 'Air Temperature';   /* the element the verification agent reads (verify.mjs loadObs) */

/* v91.17.283.44 · EWS FULL SCALE · THE TEMPERATURE / HUMIDITY CHANNEL OF EACH EWS STATION (switch NIGRAAN_EWS_THS=1; OFF by default).
   Off: only the element 'Air Temperature' (and 'Relative Humidity') is read, as before - 14 of the 91 field stations with a temperature
   sensor (the high AWS-H masts) carry none and are not read at all. On: per station, from NIGRAAN's own element catalogue
   (nig/own/data/pmd/ews_live/aegis_elements.csv): 'Air Temperature' where the station has it, else 'Air Temperature THS' (the shielded
   temperature-humidity sensor of the AWS-H masts); 'Relative Humidity' else 'Relative Humidity THS'. 'Air Temperature Hukseflux' (the
   radiometer's channel: 3 to 7 C warmer than the THS sensor on the same mast at midday, within 1 C at night, archive Oct 2025 - Oct 2026)
   is never read as air temperature. Same rule as the weekly retrain's owner truth (station-lake/scripts/lib44/ews_truth.py).
   The E1 shadow ledger (ews-anchor@1) was registered on 'Air Temperature' only: switching this on changes the anchor's inputs and needs
   a new promotion id. */
export const EWS_THS_ON = () => process.env.NIGRAAN_EWS_THS === '1';
const T_ORDER = ['Air Temperature', 'Air Temperature THS'], RH_ORDER = ['Relative Humidity', 'Relative Humidity THS'];
export function ewsChannels(copiesDir) {
  const out = { T: new Map(), RH: new Map() };
  let txt = ''; try { txt = readFileSync(join(copiesDir, 'data', 'pmd', 'ews_live', 'aegis_elements.csv'), 'utf8'); } catch (_) { return out; }
  const lines = txt.split(/\r?\n/); const head = (lines.shift() || '').replace(/^\uFEFF/, '').split(',').map((h) => h.trim()); const is = head.indexOf('station_id'), ie = head.indexOf('element');
  if (is < 0 || ie < 0) return out;
  const has = new Map(); for (const l of lines) { if (!l) continue; const c = l.split(','); const id = String(c[is]); (has.get(id) || has.set(id, new Set()).get(id)).add(c[ie]); }
  for (const [id, s] of has) { const t = T_ORDER.find((e) => s.has(e)); if (t) out.T.set(id, t); const r = RH_ORDER.find((e) => s.has(e)); if (r) out.RH.set(id, r); }
  return out;
}
/* (stationId, element) -> is this reading the station's temperature (var 'T') or humidity ('RH')? Off: the single element, as before */
export function ewsAccept(copiesDir, v = 'T') {
  const one = v === 'T' ? EWS_ELEMENT : 'Relative Humidity';
  if (!EWS_THS_ON()) return (_id, el) => el === one;
  const ch = ewsChannels(copiesDir)[v];
  if (!ch.size) return (_id, el) => el === one;          /* no catalogue: as before */
  return (id, el) => { const c = ch.get(String(id)); return c ? el === c : el === one; };
}

/* ── the model file (one home of every coefficient): data/ews-live-anchor.json ── */
const MC = new Map();
export function loadAnchorModel(dataDir) {
  const f = join(dataDir, 'ews-live-anchor.json'); let t = null; try { t = statSync(f).mtimeMs; } catch (_) { return null; }
  const c = MC.get(f); if (c && c.t === t) return c.m;
  let m = null; try { m = JSON.parse(readFileSync(f, 'utf8')); } catch (_) { m = null; }
  if (m && !(m.variogram && fin(m.variogram.psill) && fin(m.variogram.nugget) && fin(m.variogram.range_km) && fin(m.radius_km) && fin(m.fade_hours) && fin(m.min_stations))) m = null;
  MC.set(f, { t, m }); return m;
}

/* ── the fade (hyperlocal.mjs rule): 1 at the newest reading used, linear to 0 at fade_hours after it; null = too old (no anchor) ── */
export function fadeWeight(M, atMs, newestMs) {
  if (!M || !fin(atMs) || !fin(newestMs)) return null; const dt = atMs - newestMs, F = M.fade_hours * H;
  if (dt <= 0) return 1; if (dt > F) return null; return 1 - dt / F;
}

/* ── the anchor at a point from a residual set: rows [{ id, lat, lon, res, obsMs }]; opt.exclude: an id left out (the held-out station);
      the stations within exclude_within_km of the point are left out as in the test. Returns { applied, dT, raw, weight, n, nearestKm,
      newestMs } or { applied: false, why } ── */
export function anchorAt(M, rows, lat, lon, atMs, opt = {}) {
  if (!M) return { applied: false, why: 'no model file (data/ews-live-anchor.json)' };
  if (!rows || !rows.length) return { applied: false, why: 'no EWS reading in the last ' + M.fade_hours + ' h' };
  const R = M.radius_km, ex = fin(M.exclude_within_km) ? M.exclude_within_km : 0, maxN = fin(M.maxNeighbours) ? M.maxNeighbours : rows.length;
  const S = rows.filter((r) => r.id !== opt.exclude && fin(r.res) && fin(r.lat) && fin(r.lon)).map((r) => ({ ...r, d: kmBetween(lat, lon, r.lat, r.lon) }))
    .filter((r) => r.d <= R && r.d > ex).sort((a, b) => a.d - b.d).slice(0, maxN);
  if (S.length < M.min_stations) return { applied: false, why: 'no EWS station within ' + R + ' km', n: S.length };
  const newestMs = Math.max(...S.map((s) => s.obsMs)); const w0 = fadeWeight(M, atMs, newestMs);
  if (w0 == null) return { applied: false, why: 'the newest EWS reading within ' + R + ' km is older than ' + M.fade_hours + ' h', n: S.length, newestMs };
  const V = M.variogram, C = (d) => V.psill * Math.exp(-3 * d / V.range_km);
  const K = S.map((a, i) => S.map((b, j) => C(kmBetween(a.lat, a.lon, b.lat, b.lon)) + (i === j ? V.nugget : 0)));
  const w = solve(K, S.map((s) => C(s.d))); if (!w) return { applied: false, why: 'kriging system singular', n: S.length };
  const raw = w.reduce((a, x, i) => a + x * S[i].res, 0);
  return { applied: true, dT: raw * w0, raw, weight: w0, n: S.length, nearestKm: Math.round(S[0].d * 10) / 10, newestMs };
}
