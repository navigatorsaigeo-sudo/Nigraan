/* ══ v91.17.283.44 · EWS FULL SCALE · MEASURED PAST-24 H RAIN AT A NEARBY MOUNTAIN GAUGE (switch NIGRAAN_EWS_RAIN24=1; OFF by default) ══
   Where a rain gauge of the partner mountain network stands near a place, the rain it MEASURED over the last 24 hours is shown beside the
   model's past-day rain, labelled as a measurement. It is a fact, never a level, a trigger or an input of a hazard score.
   Producer: station-lake/scripts/ews_rain24.py (accumulating gauges, the archive's screen and increment rule, a window with an outage
   gives no value) -> data/ews-rain24.json. Gauges shown: only those in data/ews-rain24-gauges.json "ids" (the gauges whose own 24 h
   totals matched the archive's independent derivation of the same record, RULES_EWSFULL_RETRAIN C2: median |difference| <= 0.2 mm and
   >= 90 % of windows within 0.5 mm, Oct 2026). Reach: REACH_KM horizontally and REACH_DZ_M in height (C3). A file older than MAX_AGE_H
   gives nothing. Internal partner data: the customer text never names the network. Off: measuredRain24() returns null, reads nothing. */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* v91.17.283.45 (NIGRAAN 1.0.8): SERVED by default (C2 passed at 44 gauges; C3 reach and label as built); NIGRAAN_EWS_RAIN24=0 switches it off */
export const EWS_RAIN24_ON = () => process.env.NIGRAAN_EWS_RAIN24 !== '0';
export const REACH_KM = 5, REACH_DZ_M = 500, MAX_AGE_H = 3;
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const km = (a, b, c, d) => { const p = Math.PI / 180; const x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2; return 12742 * Math.asin(Math.sqrt(Math.min(1, x))); };
const C = new Map();
function readJson(f) { try { const m = statSync(f).mtimeMs; const c = C.get(f); if (c && c.m === m) return c.v; const v = JSON.parse(readFileSync(f, 'utf8')); C.set(f, { m, v }); return v; } catch (_) { return null; } }

export function measuredRain24(dataDir, lat, lon, elev = null, nowMs = Date.now()) {
  if (!EWS_RAIN24_ON() || !dataDir || !fin(lat) || !fin(lon)) return null;
  const D = readJson(join(dataDir, 'ews-rain24.json')); const A = readJson(join(dataDir, 'ews-rain24-gauges.json'));
  if (!D || !Array.isArray(D.gauges) || !A || !Array.isArray(A.ids)) return null;
  const endMs = Date.parse(D.end); if (!fin(endMs) || nowMs - endMs > MAX_AGE_H * 3600e3 || endMs > nowMs + 3600e3) return null;
  const allow = new Set(A.ids.map(String)); let best = null;
  for (const g of D.gauges) {
    if (!g || !g.complete || !fin(g.mm24) || !allow.has(String(g.id)) || !fin(g.lat) || !fin(g.lon)) continue;
    const d = km(lat, lon, g.lat, g.lon); if (d > REACH_KM) continue;
    if (fin(elev) && fin(g.elev) && Math.abs(elev - g.elev) > REACH_DZ_M) continue;
    if (!best || d < best.d) best = { d, g };
  }
  if (!best) return null;
  return { mm: Math.round(best.g.mm24 * 10) / 10, km: Math.round(best.d * 10) / 10, end: D.end, basis: 'measured at a nearby rain gauge (' + (Math.round(best.d * 10) / 10) + ' km away), last 24 hours',
    note: 'a measurement, shown beside the model past-day rain; it does not set any level' };
}
