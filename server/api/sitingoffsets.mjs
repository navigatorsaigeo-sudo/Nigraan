/* ══ v91.17.186 · SITING OFFSETS AGAINST A REFERENCE (the live layer's station correction) ═══════════════════════════════════════
   Why: a MACH station reads its own site (roof, wall, sun on the shield). Before v186 the live layer used a station by day only when
   a PMD-fitted sun table existed for it (20 stations), and never used unscreened ones: on 6 Oct Karachi's live correction came from
   three warm sensors and Gilgit's correct reading was thrown away.

   Method (tested 6 Oct, step 0: every hour 25 Mar - 5 Oct 2026, 85 stations, each station hidden in turn; scripts/tests186):
     residual(station, hour) = reading (after any sun table) - forecast basis at the station for that hour (rbNote, fleet.mjs)
     reference residual      = median residual of the station's MACH neighbours at that hour (the siting screen's own radius,
                               height step and minimum count: rule().screen), when they give at least min_days days;
                               otherwise the residual of the nearest PMD synop station within the live layer's radius and the
                               same height step (reading minus the basis at the synop point), when it gives min_days days
     offset by day part      = mean(residual - reference residual) over the day (09-16 PKT), night (20-05) and the hours between
   The offset is removed from the live reading before it enters the layer. It is measured against neighbours or synop, never
   against the forecast: measured against the forecast it also removed the real area error the layer exists to correct (hindcast
   MAE at trusted stations 0.88 -> 0.93 C). v91.17.283.14 (owner decision 24 Oct 2026: values, not stations, are dropped): the screens
   below no longer hold a station out of the live layer. They FLAG it (flag, why): a flagged station's offset is not removed (it is not
   a stable site term) and its readings enter the layer exactly when obsqc.mjs passes them, value by value. Flags:
     scatter  the spread of (residual - reference) is wider than the screen's iqr_c: the station is not a stable site
     faulty   a station with no reference whose mean residual in a day part lies beyond Tukey's far-out fences of all stations'
              mean residuals in the window (MACH 27 reads about 11 C low and passed every per-reading check)
     tested, not used (v91.17.188): the WMO persistence test (Zahumensky 2004: air temperature must vary by >= 0.1 C over 60 min),
              station held out when its share of failing hours lies beyond Tukey's far-out fence (persistenceScreen, the optional
              persist argument). Daily-refit hindcast 25 Mar - 5 Oct (scripts/tests188): trusted-station MAE 0.900 -> 0.907,
              Peshawar-Mardan 1.659 -> 1.684: it mostly caught feeds that repeat the last upload (Quaid, Avenue, Chitti, Tahir),
              whose hourly value is still right. fleet.mjs does not pass it.
     flat     v91.17.188: the last 24 hours' reading range over the forecast's range at the station, below Tukey's far-out fence
              (Q1 - 3 x IQR, on the logarithm) of every station-day's ratio in the window; a day counts with >= 20 of 24 hours (the
              80 % daily validity of CrowdQC+, Fenner et al. 2021). An indoor, enclosed or stuck sensor loses the daily cycle; a
              reduced cycle is the signature CrowdQC uses for indoor stations (Napoly et al. 2018). Daily-refit hindcast: fence about
              0.30, trusted-station MAE 0.900 -> 0.900, no region worse (it held out MACH 44 Dolmen, MACH 39 Al-Jazari after it
              failed, MACH 64 and a few rainy days elsewhere). Khaplu (MACH 106, 5-6 Oct, not in the hindcast): 16.5-17.4 C for
              22 hours with zero sun and wind against a 12 C forecast cycle, ratio 0.24 on the 6 Oct server state (fence 0.37 there; MACH 39 Al-Jazari 0.04).
     mixup    v91.17.192: two stations farther apart than the live layer's radius whose hourly readings agree more closely than any
              real pair at that distance can: the median |difference| over their shared hours (>= 72) lies below Tukey's far-out
              fence (Q1 - 3 x IQR, on the logarithm) of all such pairs in the window. Both are held out (which of the two carries the
              other's feed cannot be told). 6 Oct 2026, 16 days: gw1100c_wifi547f / mach2 / mach8 (137-800 km apart, median 0.1-0.2 C
              against 2.5 C for far pairs); LAMHA's duplicate-feed list (6 Oct) names the same mix-ups and i_9_2 / sargodha_avenue.
   A flat or mixed-up station is no neighbour reference for others either.
   Pure function: fleet.mjs calls it after the daily database backfill; the hindcast harness calls the same code. */

const km = (a, b, c, d) => { const p = Math.PI / 180, x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
const median = (a) => { const q = a.filter(Number.isFinite).sort((x, y) => x - y); if (!q.length) return null; const m = q.length >> 1; return q.length % 2 ? q[m] : (q[m - 1] + q[m]) / 2; };
const quant = (a, p) => { const q = a.filter(Number.isFinite).sort((x, y) => x - y); if (!q.length) return null; const i = (q.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return q[lo] + (q[hi] - q[lo]) * (i - lo); };
const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const r2 = (v) => v == null ? null : Math.round(v * 100) / 100;
export const PARTS = ['day', 'night', 'between'];
export function partOf(isoHourUtc) { const lh = (Number(String(isoHourUtc).slice(11, 13)) + 5) % 24; return lh >= 9 && lh <= 16 ? 'day' : (lh >= 20 || lh <= 5) ? 'night' : 'between'; }

/* stations: { key: { lat, lon, elevM, hours: { 'YYYY-MM-DDTHH': [reading, residual, ...] } } }
   synops:   [{ sid, name, lat, lon, elevM, hours: { 'YYYY-MM-DDTHH': residual } }]
   rule:     { radius_km, dz_m, min_neighbours, min_days, abs_c, iqr_c }, refKm: the live layer's radius
   persist:  optional { key: { 'YYYY-MM-DDTHH': true (the hour failed the persistence test) | false } } */
export const PERSIST_MIN_HOURS = 24;
export function persistenceScreen(persist) {
  const share = {};
  for (const [k, h] of Object.entries(persist || {})) { const v = Object.values(h || {}); if (v.length >= PERSIST_MIN_HOURS) share[k] = { n: v.length, share: v.filter(Boolean).length / v.length }; }
  const a = Object.values(share).map(x => x.share); if (a.length < 8) return { fence: null, share, stuck: new Set() };
  const q1 = quant(a, 0.25), q3 = quant(a, 0.75), fence = q3 + 3 * (q3 - q1);
  return { fence, share, stuck: new Set(Object.entries(share).filter(([, x]) => x.share > fence).map(([k]) => k)) };
}
const pktDay = (iso) => new Date(Date.parse(iso + ':00:00Z') + 5 * 3600e3).toISOString().slice(0, 10);
export const DAY_MIN_HOURS = 20;
/* stations as computeOffsets takes them: hours[iso] = [reading, reading - forecast basis, ...] */
export function flatScreen(stations) {
  const lr = [], per = {}; let lastMs = -Infinity;
  for (const [k, s] of Object.entries(stations || {})) { const h = Object.entries((s && s.hours) || {}).filter(([, v]) => v && Number.isFinite(v[0]) && Number.isFinite(v[1]));
    per[k] = h; for (const [iso] of h) lastMs = Math.max(lastMs, Date.parse(iso + ':00:00Z')); }
  const ratio = (h) => { if (h.length < DAY_MIN_HOURS) return null; const o = h.map(([, v]) => v[0]), f = h.map(([, v]) => v[0] - v[1]);
    const fr = Math.max(...f) - Math.min(...f); if (!(fr > 0)) return null; return Math.max(Math.max(...o) - Math.min(...o), 0.1) / fr; };
  for (const h of Object.values(per)) { const byDay = {}; for (const x of h) (byDay[pktDay(x[0])] || (byDay[pktDay(x[0])] = [])).push(x);
    for (const d of Object.values(byDay)) { const r = ratio(d); if (r != null) lr.push(Math.log(r)); } }
  const last = {}; for (const [k, h] of Object.entries(per)) { const r = ratio(h.filter(([iso]) => Date.parse(iso + ':00:00Z') > lastMs - 24 * 3600e3)); if (r != null) last[k] = r; }
  if (lr.length < 30) return { fence: null, last, flat: new Set() };
  const q1 = quant(lr, 0.25), q3 = quant(lr, 0.75), fence = Math.exp(q1 - 3 * (q3 - q1));
  return { fence, last, flat: new Set(Object.entries(last).filter(([, r]) => r < fence).map(([k]) => k)) };
}
export const MIX_MIN_HOURS = 72;
export function mixupScreen(stations, farKm) {
  const ks = Object.keys(stations || {}).filter(k => stations[k] && Number.isFinite(stations[k].lat) && stations[k].hours);
  const pairs = [];
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
    const a = stations[ks[i]], b = stations[ks[j]]; if (km(a.lat, a.lon, b.lat, b.lon) <= farKm) continue;
    const d = []; for (const [h, v] of Object.entries(a.hours)) { const w = b.hours[h]; if (v && w && Number.isFinite(v[0]) && Number.isFinite(w[0])) d.push(Math.abs(v[0] - w[0])); }
    if (d.length >= MIX_MIN_HOURS) pairs.push([ks[i], ks[j], median(d), d.length]);
  }
  if (pairs.length < 30) return { fence: null, pairs: [], mixed: new Map() };
  const lg = pairs.map(p => Math.log(Math.max(p[2], 0.05))); const q1 = quant(lg, 0.25), q3 = quant(lg, 0.75), fence = Math.exp(q1 - 3 * (q3 - q1));
  const mixed = new Map(); const bad = pairs.filter(p => p[2] < fence);
  for (const [a, b, m] of bad) { mixed.set(a, [b, m]); mixed.set(b, [a, m]); }
  return { fence, pairs: bad, mixed };
}
export function computeOffsets(stations, synops, rule, refKm, persist = null, opt = {}) {
  const out = {}, PS = persistenceScreen(persist), FS = opt.flat === false ? { fence: null, last: {}, flat: new Set() } : flatScreen(stations), keys = Object.keys(stations || {});
  const MX = opt.mixup === false ? { fence: null, mixed: new Map() } : mixupScreen(stations, refKm);
  const bad = (k) => PS.stuck.has(k) || FS.flat.has(k) || MX.mixed.has(k);
  const near = (s, o) => km(s.lat, s.lon, o.lat, o.lon);
  const dzOk = (s, o) => s.elevM == null || o.elevM == null || Math.abs(s.elevM - o.elevM) <= rule.dz_m;
  for (const key of keys) {
    const s = stations[key]; if (!s || !s.hours) continue;
    const own = Object.entries(s.hours).filter(([, v]) => v && Number.isFinite(v[1]));
    const meanRes = {}; for (const p of PARTS) { const a = own.filter(([h]) => partOf(h) === p).map(([, v]) => v[1]); meanRes[p] = a.length ? mean(a) : null; }
    let ref = null, d = [];
    const nb = keys.filter(k => k !== key && !bad(k) && stations[k] && near(s, stations[k]) <= rule.radius_km && dzOk(s, stations[k]));
    if (nb.length >= rule.min_neighbours) {
      const days = new Set(), dd = [];
      for (const [h, v] of own) { const vals = nb.map(k => { const x = stations[k].hours[h]; return x && Number.isFinite(x[1]) ? x[1] : null; }).filter(x => x != null);
        if (vals.length >= 2) { dd.push([h, v[1] - median(vals)]); days.add(h.slice(0, 10)); } }
      if (days.size >= rule.min_days) { ref = { kind: 'MACH neighbours', name: nb.length + ' within ' + rule.radius_km + ' km', days: days.size }; d = dd; }
    }
    if (!ref && Array.isArray(synops)) {
      const cand = synops.filter(y => y && y.hours && near(s, y) <= refKm && dzOk(s, y)).sort((a, b) => near(s, a) - near(s, b));
      for (const y of cand) {
        const days = new Set(), dd = [];
        for (const [h, v] of own) { const x = y.hours[h]; if (Number.isFinite(x)) { dd.push([h, v[1] - x]); days.add(h.slice(0, 10)); } }
        if (days.size >= rule.min_days) { ref = { kind: 'synop', name: y.name || y.sid, sid: y.sid, km: Math.round(near(s, y) * 10) / 10, days: days.size }; d = dd; break; }
      }
    }
    const rec = { ref: ref ? ref.kind : null, refName: ref ? ref.name : null, refKm: ref && ref.km != null ? ref.km : null, days: ref ? ref.days : 0, hours: d.length,
                  off: null, iqr: null, meanRes: Object.fromEntries(PARTS.map(p => [p, r2(meanRes[p])])), flag: false, why: null };
    if (ref) {
      const all = d.map(x => x[1]); const o = {};
      for (const p of PARTS) { const a = d.filter(([h]) => partOf(h) === p).map(x => x[1]); o[p] = r2(a.length ? mean(a) : mean(all)); }
      const dev = d.map(([h, x]) => x - o[partOf(h)]);   /* scatter around the day-part offset: the day-night difference is the offset itself, not unsteadiness */
      rec.off = o; rec.iqr = r2(quant(dev, 0.75) - quant(dev, 0.25));
      if (rec.iqr > rule.iqr_c) { rec.flag = true; rec.why = 'reads unsteadily against its reference (' + ref.kind + ', ' + ref.name + '): spread ' + rec.iqr + ' C, the screen allows ' + rule.iqr_c; }
    }
    const ps = PS.share[key]; if (ps) rec.persist = { hours: ps.n, failShare: r2(ps.share), fence: r2(PS.fence) };
    if (FS.last[key] != null) rec.dayRange = { ratio: r2(FS.last[key]), fence: FS.fence == null ? null : r2(FS.fence) };
    if (FS.flat.has(key)) { rec.flag = true; rec.stuck = true; rec.why = 'its last 24 hours\u2019 range was ' + Math.round(FS.last[key] * 100) + ' % of the forecast daily cycle at its place, beyond the far-out fence of all station-days (' + Math.round(FS.fence * 100) + ' %): an indoor, enclosed or stuck sensor'; }
    if (MX.mixed.has(key)) { const [o, m] = MX.mixed.get(key); rec.flag = true; rec.stuck = true; rec.mixup = o; rec.why = 'its hourly readings match ' + o + '\u2019s (beyond ' + refKm + ' km away) to a median ' + r2(m) + ' C, closer than the far-out fence of all distant pairs (' + r2(MX.fence) + ' C): one feed carries the other\u2019s readings'; }
    if (PS.stuck.has(key)) { rec.flag = true; rec.stuck = true; rec.why = 'its temperature stayed within 0.1 C through the hour (WMO persistence test) in ' + Math.round(ps.share * 100) + ' % of ' + ps.n + ' tested hours, beyond the far-out fence of all stations (' + Math.round(PS.fence * 100) + ' %): a stuck, enclosed or stale sensor'; }
    out[key] = rec;
  }
  /* faulty: no reference, and a mean residual (reading minus forecast) in a day part beyond Tukey's far-out fences of every station's
     mean residual in the same window (quartile -/+ 3 x interquartile range; Tukey 1977). The forecast's own regional error spreads the
     stations' means by a few degrees; a sensor reading 11 C off sits far outside it. (First tried: the range of well-sited stations
     only; it held out 8-48 sound stations per window in the hindcast, because the well-sited ones are the dense cities.) */
  const range = {};
  for (const p of PARTS) { const a = Object.values(out).filter(r => !r.stuck).map(r => r.meanRes[p]).filter(Number.isFinite); if (a.length < 8) { range[p] = null; continue; }
    const q1 = quant(a, 0.25), q3 = quant(a, 0.75), k = 3 * (q3 - q1); range[p] = [q1 - k, q3 + k]; }
  for (const [key, r] of Object.entries(out)) {
    if (r.ref || r.stuck) continue;
    const bad = PARTS.filter(p => range[p] && Number.isFinite(r.meanRes[p]) && (r.meanRes[p] < range[p][0] || r.meanRes[p] > range[p][1]));
    if (bad.length) { const p = bad[0]; r.flag = true; r.why = 'no reference station in reach, and it reads ' + r2(-r.meanRes[p]) + ' C from the forecast in the ' + p + ' (forecast minus reading), beyond the far-out fences (' + r2(range[p][0]) + ' to ' + r2(range[p][1]) + ' C) of all stations\u2019 reading-minus-forecast'; }
  }
  return { stations: out, fences: Object.fromEntries(PARTS.map(p => [p, range[p] ? range[p].map(r2) : null])), persistFence: PS.fence == null ? null : r2(PS.fence), dayRangeFence: FS.fence == null ? null : r2(FS.fence), mixupFence: MX.fence == null ? null : r2(MX.fence) };
}
