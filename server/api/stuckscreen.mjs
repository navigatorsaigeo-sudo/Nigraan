/* ══ v91.17.272 · STUCK / REPLAYED READING SCREEN (hotfix, 16 Oct 2026) ═══════════════════════════════════════════════════════════
   Live fault 16 Oct 2026 21:30 PKT: Islamabad served 23.8 °C at I-8 while MACH 1 (wu_api) read 18.8 °C. The MACH database's scraped
   'wu' source alternates, in the evening, between the station's real reading and a frozen copy of an afternoon record (the whole
   record repeats: temperature, dew point, humidity, pressure), e.g. nutech 27.3 / 19.8, Rawal 29.2 / 19.9, Garden 29.4 / 20.4 °C.
   Measured on LAMHA's copy of the MACH database (obs_20261006..16.csv): 'wu' readings 18-23 PKT that this screen rejects 48 %; the
   live layer took them as residuals of +6 to +7 °C and the buddy check could not, because most city stations share the fault.

   Each station's own readings, in time order, are judged against the station's own recent state (no neighbour, no forecast):
     replay   the whole record (temperature + at least two of dew point, humidity, pressure, to 0.01) equals a record the station
              reported earlier while a different record came in between (a frozen copy coming back). Rejected when it departs from
              the station's last accepted reading by more than the 99th percentile of a clean station's change over the same time
              (K99), or when there is no accepted reading in the last MAXGAP minutes. A natural return to the same value is close
              to the last reading and is kept.
     jump     a change from the last accepted reading larger than the 99.9th percentile of a clean station's change over the same
              time (K999). Held back until a second new reading agrees with it within the same limit, then the station's state
              moves there (a real front or shower is late by one reading, never lost). The confirming reading must be new: not a
              whole-record replay, and not a temperature the station reported in the MAXGAP minutes before the jump (a frozen value whose
              humidity still moves, 16 Oct 2026 Karachi DHA City North 35.0 C, cannot confirm itself).
     frozen   the temperature unchanged for longer than FROZEN minutes.
   The limits are learned from clean stations, not typed: 45,837 consecutive-reading pairs (gap <= 90 min) of the 36 'wu_api' and
   'ecowitt' stations, 6-16 Oct 2026, LAMHA copy of the MACH database: |change| / sqrt(gap / 10 min) has 99th percentile 1.27 °C
   (K99) and 99.9th 3.44 °C (K999); a temperature held unchanged has 99.9th percentile 120 min over 25,444 runs of the 27 of those
   stations whose humidity sensor passes the fleet's own range rules (FROZEN). MAXGAP 90 min: the longest gap with clean pairs in
   every bin. Measured effect (same files): rejected readings wu_api 0.5 %, ecowitt 3.2 % (frozen sensors), wu 19 % (18-23 PKT 48 %);
   Islamabad-Rawalpindi stations minus the clean MACH 1 / MACH 8 mean, 18-23 PKT: +2.2..+4.3 °C raw -> 0.0..+0.9 °C screened;
   08:30-16:30 PKT: 3 of 864 station values changed. scripts/tests272/stuck_screen.py holds the derivation and the parity check. */
export const STUCK_RULE = Object.freeze({ K99: 1.27, K999: 3.44, MAXGAP_MIN: 90, FROZEN_MIN: 120,
  source: 'LAMHA copy of the MACH database, obs_20261006-20261016, 36 wu_api/ecowitt stations, 45,837 pairs (K), 25,444 constant-temperature runs (FROZEN)' });

/* ══ v91.17.278 · FIX278 5 · OUTDOOR ARRAY SILENT (the frozen-console state after a power cut) ══════════════════════════════════════
   Owner evidence 17 Oct 2026 (MACH 106 Khaplu): after power returned the console reported 12.7 °C, dew 11.4 °C, RH 92 % with solar 0
   and wind 0 from 07:14 to about 12:00 PKT, the temperature drifting 12.7 -> 12.0 (the frozen rule needs an unchanged value, so it
   passed); real readings came back with solar 156 W/m2. 6-16 Oct the same state held most of the time (the "damped" pattern that led
   to the v91.17.277 indoor exclusion). The signature is the outdoor array saying nothing: solar exactly 0 AND wind and gust exactly 0
   (or absent) while the sun is up. Learned from the fleet (scripts/tests278/array_screen.py, LAMHA copy of the MACH database
   obs_20261006-20261017, the 61 registered, not excluded stations with a solar sensor, 'qm' rows left out):
     ELEV_DEG  10: the lowest 5-degree sun-elevation bin whose exactly-zero solar share (0.95 %) is at most 1.5 x the median share of the
               bins above it (0-5 degrees 2.52 %, 5-10 degrees 1.44 %, then 0.95 % falling to 0.23 %).
     RUN_MIN   0: the longest daylight array-silent run at any station whose daylight array-silent share is at or below the 95th
               percentile of the station shares. 59 of the 61 stations never report one; the other two (DANDAO 0.4 %, easyweather_wifi_87910
               27 %) are the population under test. So a run of two or more daylight array-silent readings (longer than 0 min) marks the
               array silent.
   Once marked, every reading of that station is rejected ('array-silent', night included) until the array speaks again: solar, wind
   or gust above 0. A row without solar (no sensor reported) is never judged by this rule. Rows carry S, W, G and the station's lat,
   lon (screenSeries) or screenRows gets posOf(key). */
export const ARRAY_RULE = Object.freeze({ ELEV_DEG: 10, RUN_MIN: 0, MAXGAP_MIN: 90,
  source: 'scripts/tests278/array_screen.py on the LAMHA copy of the MACH database obs_20261006-20261017: 61 stations with a solar sensor, ELEV_DEG the start of the zero-solar plateau, RUN_MIN the longest daylight array-silent run of the 59 stations at or below the 95th percentile share' });
/* the sun's elevation (degrees) at a point and time: NOAA's general solar position formulas (Spencer 1971 series) */
export function sunElev(lat, lon, ms) {
  const d = new Date(ms), y0 = Date.UTC(d.getUTCFullYear(), 0, 1), n = Math.floor((ms - y0) / 864e5) + 1, h = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const g = 2 * Math.PI / 365 * (n - 1 + (h - 12) / 24);
  const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const ha = ((h * 60 + eq + 4 * lon) / 4 - 180) * Math.PI / 180, la = lat * Math.PI / 180;
  return Math.asin(Math.max(-1, Math.min(1, Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha)))) * 180 / Math.PI;
}
/* rows in time order, one station: true where the outdoor array is silent (see ARRAY_RULE). st (optional, { lost, runStart, runLast })
   carries the state from one call to the next (the live poll keeps only 3 h of readings) and is updated. */
export function arraySilent(rows, A = ARRAY_RULE, st = null) {
  const S0 = st || {}; let lost = !!S0.lost, rs = S0.runStart ?? null, rl = S0.runLast ?? null, ri = []; const out = new Array(rows.length).fill(false);
  for (let i = 0; i < rows.length; i++) { const r = rows[i]; if (!r || !fin(r.ms) || !fin(r.S)) continue;
    const speaks = r.S > 0 || (fin(r.W) && r.W > 0) || (fin(r.G) && r.G > 0);
    if (speaks) { lost = false; rs = rl = null; ri = []; continue; }
    const day = fin(r.lat) && fin(r.lon) && sunElev(r.lat, r.lon, r.ms) >= A.ELEV_DEG;
    if (day) { if (rl != null && (r.ms - rl) / 6e4 <= A.MAXGAP_MIN) { rl = r.ms; ri.push(i); } else { rs = rl = r.ms; ri = [i]; }
      if ((rl - rs) / 6e4 > A.RUN_MIN) { if (!lost) for (const j of ri) out[j] = true; lost = true; } }   /* the run's first readings too (a batch screen) */
    if (lost) out[i] = true; }
  if (st) { st.lost = lost; st.runStart = rs; st.runLast = rl; }
  return out;
}
const fin = (x) => x != null && Number.isFinite(x);
function sigOf(T, Td, RH, P) {
  if ([Td, RH, P].filter(fin).length < 2) return null;
  return [T, Td, RH, P].map((x) => (fin(x) ? Math.round(x * 100) / 100 : '-')).join('|');
}
const lim = (k, dtMin) => k * Math.sqrt(Math.max(dtMin, 1) / 10);

/* rows: [{ ms, T, Td, RH, P }] in time order (one station). Returns an array of verdicts: 'ok', 'stuck-replay', 'jump', 'frozen'. */
export function screenSeries(rows, R = STUCK_RULE, A = ARRAY_RULE, ast = null) {
  const silent = rows.some((r) => r && r.S != null) ? arraySilent(rows, A, ast) : null;
  const first = new Map(), tFirst = new Map(); let lastChg = -1, prev, anchor = null, pending = null, runT = null, runMs = null; const out = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const { ms, T, Td, RH, P } = rows[i];
    if (!fin(T) || !fin(ms)) { out[i] = 'ok'; continue; }   /* no temperature: the fleet's own rules decide */
    const s = sigOf(T, Td, RH, P);
    const rep = s != null && first.has(s) && lastChg > first.get(s);
    if (s != null && !first.has(s)) first.set(s, i);
    if (i > 0 && s !== prev) lastChg = i;
    prev = s;
    const tk = Math.round(T * 100) / 100, tSeen = tFirst.get(tk) || []; tFirst.set(tk, [ms, tSeen[0]]);   /* the last two times this temperature was reported */
    if (runT === null || T !== runT) { runT = T; runMs = ms; }
    const ref = anchor && (ms - anchor.ms) / 6e4 <= R.MAXGAP_MIN ? anchor : null;
    let v = 'ok';
    if (silent && silent[i]) v = 'array-silent';
    else if ((ms - runMs) / 6e4 > R.FROZEN_MIN) v = 'frozen';
    else if (rep && (!ref || Math.abs(T - ref.T) > lim(R.K99, (ms - ref.ms) / 6e4))) v = 'stuck-replay';
    else if (ref && Math.abs(T - ref.T) > lim(R.K999, (ms - ref.ms) / 6e4)) {
      if (!rep && pending && Math.abs(T - pending.T) <= lim(R.K999, (ms - pending.ms) / 6e4) && !tSeen.some((x) => x !== undefined && x < pending.ms && (pending.ms - x) / 6e4 <= R.MAXGAP_MIN)) v = 'ok';
      else { v = 'jump'; if (!rep) pending = { ms, T }; }
    }
    if (v === 'ok') { anchor = { ms, T }; if (!rep) pending = null; }
    out[i] = v;
  }
  return out;
}

/* group rows by station, screen each station's series, return Map(row -> verdict) only for rejected rows (keyOf(row), toObs(row)) */
export function screenRows(rows, keyOf, toObs, R = STUCK_RULE, posOf = null) {
  const by = new Map(); for (const r of rows) { const k = keyOf(r); (by.get(k) || by.set(k, []).get(k)).push(r); }
  const bad = new Map();
  for (const list of by.values()) {
    const o = list.map((r) => ({ r, x: toObs(r) })).sort((a, b) => a.x.ms - b.x.ms);
    if (posOf && o.length) { const p = posOf(keyOf(o[0].r)); if (p && fin(p.lat) && fin(p.lon)) for (const y of o) if (y.x && y.x.lat == null) { y.x.lat = p.lat; y.x.lon = p.lon; } }
    const v = screenSeries(o.map((y) => y.x), R);
    for (let i = 0; i < o.length; i++) if (v[i] !== 'ok') bad.set(o[i].r, v[i]);
  }
  return bad;
}
