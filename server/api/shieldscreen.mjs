/* ══ v91.17.283 · WS2 item 8 · SHIELDED / STUCK OUTDOOR SENSOR, JUDGED AGAINST THE NEIGHBOURS ══════════════════════════════════════
   Owner evidence 20 Oct 2026 (MACH 106 Khaplu): after a reset the station read a flat 10.8-11.2 C from 07 to 14 PKT with solar 0-1.1
   W/m2 and wind 0, while its neighbours read 186-303 W/m2. The array-silent rule (stuckscreen.mjs ARRAY_RULE) needs solar EXACTLY 0,
   so a solar sensor leaking 0.5-1 W/m2 kept the station "speaking" and its frozen temperature entered the corrections.

   A station is judged over its latest complete daylight window (WINDOW_MIN, clock-aligned; every reading counted has the sun at or
   above ELEV_DEG, at least MIN_READINGS of them, each with a solar value):
     flat   its temperature range in the window <= FLAT_RANGE_C
     dark   its mean solar / the median mean solar of its K nearest solar-reporting reference stations in the same window <= DARK_RATIO
            (at least MIN_NEIGHBOURS of them with a window; their median above 0)
     calm   every wind and gust reading exactly 0 (or absent)
   Marked when flat AND dark AND calm; a later daylight window that is judged and not marked clears it.
   The rule's numbers are data (data/station-shield-rule.json), derived by scripts/tests283/ws2/derive_shield.py from the LAMHA copy of
   the MACH database (6-20 Oct 2026): FLAT_RANGE_C and DARK_RATIO are the 1st percentiles of 1,911 daylight windows at 58 reference
   stations (registered, not excluded, with a solar sensor; Khaplu and the 5 % of stations most often darker than half their
   neighbours left out as the population under test). The joint rule marks 0 of the 1,911 reference windows and 31 of Khaplu's 49. */
import { sunElev } from './stuckscreen.mjs';

const km = (a, b, c, d) => { const p = Math.PI / 180; const x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
const fin = (x) => x != null && Number.isFinite(x);
const median = (a) => { const q = a.slice().sort((x, y) => x - y); const m = q.length >> 1; return q.length % 2 ? q[m] : (q[m - 1] + q[m]) / 2; };

/* hist: Map key -> { lat, lon, rows: [{ ms, T, S, W, G }] } (time order). R: the rule. now: ms. isRef(key): may serve as a neighbour.
   Returns Map key -> { marked, clean, why, window } for every station with a judged window (others are absent: no verdict). */
export function judgeShield(hist, R, now, isRef = () => true) {
  const out = new Map(); if (!R || !hist) return out;
  const W = R.WINDOW_MIN * 60e3, w = Math.floor(now / W) - 1;   /* the latest window that has fully elapsed */
  const win = new Map();
  for (const [k, h] of hist) {
    if (!h || !fin(h.lat) || !fin(h.lon) || !Array.isArray(h.rows)) continue;
    const v = h.rows.filter((r) => r && Math.floor(r.ms / W) === w && fin(r.T) && fin(r.S) && sunElev(h.lat, h.lon, r.ms) >= R.ELEV_DEG);
    if (v.length >= R.MIN_READINGS) win.set(k, { lat: h.lat, lon: h.lon, v, s: v.reduce((a, r) => a + r.S, 0) / v.length });
  }
  /* the K nearest reference stations that report solar at all, then those of them with a window (as derive_shield.py) */
  const solarRef = [...hist.entries()].filter(([k, h]) => isRef(k) && h && fin(h.lat) && fin(h.lon) && Array.isArray(h.rows) && h.rows.some((r) => r && fin(r.S) && r.S > 0));
  for (const [k, x] of win) {
    const nb = solarRef.filter(([o]) => o !== k).map(([o, h]) => ({ o, d: km(x.lat, x.lon, h.lat, h.lon) })).sort((a, b) => a.d - b.d).slice(0, R.K)
      .filter((n) => win.has(n.o)).map((n) => ({ d: n.d, s: win.get(n.o).s }));
    if (nb.length < R.MIN_NEIGHBOURS) continue;
    const nm = median(nb.map((o) => o.s)); if (!(nm > 0)) continue;
    const T = x.v.map((r) => r.T), range = Math.max(...T) - Math.min(...T), ratio = x.s / nm;
    const calm = x.v.every((r) => !(fin(r.W) && r.W > 0) && !(fin(r.G) && r.G > 0));
    const marked = range <= R.FLAT_RANGE_C && ratio <= R.DARK_RATIO && calm;
    out.set(k, { marked, clean: !marked, window: new Date(w * W).toISOString(),
      why: marked ? 'outdoor array reads shielded: temperature range ' + (Math.round(range * 10) / 10) + ' C over ' + R.WINDOW_MIN + ' min of daylight, mean solar ' + (Math.round(x.s * 10) / 10) + ' W/m2 against ' + Math.round(nm) + ' W/m2 at its ' + nb.length + ' nearest solar stations, wind 0' : null });
  }
  return out;
}
