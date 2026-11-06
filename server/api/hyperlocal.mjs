/* ══ v91.17.88 · L3 · LIVE HYPERLOCAL TEMPERATURE ═══════════════════════════════════════════════════════════════════════
   The served temperature at any point (L0 basis + station / zone / AI / urban corrections) plus what AGN's own MACH
   stations measure right now around that point:

     1. each live MACH reading is corrected for its siting: (until v190) the PMD sun table where one exists (data/mach-sun-correction.json;
        off from v91.17.191, see siteCorrect), then
        (v91.17.186) its offset against its MACH neighbours or the nearest PMD synop by part of the day (sitingoffsets.mjs, fitted
        daily in fleet.mjs); a station flagged there as unsteady or faulty keeps its reading, without an offset. Day and night.
     2. residual = corrected reading - the SERVED value at the reading's hour (fleet.mjs liveReadings: the served value is the
        same correction chain a dashboard request gets, taken on the provider's raw number)
     3. v91.17.283.14: only readings whose temperature value passed obsqc.mjs reach this layer (fleet.mjs liveReadings: usable rows); its
        buddy check (TITAN, on the departure from the served basis) replaced this layer's own residual buddy check, which is removed
     4. at a point: simple kriging (zero mean, exponential covariance, data/hyperlocal-model.json) of the residuals within
        40 km. Zero mean means the correction returns to 0 away from the stations: the served forecast is never pulled toward
        a distant station.
     5. in a served response: every hour from one hour before the newest reading to 6 h after it takes the residual x a weight
        falling linearly from 1 to 0 over those 6 hours (the held-out test: 0.98 C at the hour, 1.64 C at +6 h, worse than
        raw beyond); `current` takes the full weight.

   Held-out (leave one station out, Islamabad-Rawalpindi, 2025-01..2026-09): typical error at a place with no station
   1.72 C raw -> 0.98 C (simple kriging; 0.95 regression kriging). Numbers: data/hyperlocal-model.json.
   NIGRAAN_HYPERLOCAL=0 switches it off.
   v91.17.190 · NOWCAST (data/nowcast-model.json, station-lake/scripts/nowcast): the hours after the newest reading no longer take
   the residual x a straight fade to zero at +6 h. They take that straight fade plus a learned correction to it (LightGBM) from the
   residual now, 1 h and 3 h ago and at the same hour yesterday (the layer keeps an hourly copy of its residual set for 30 h,
   data/hyperlocal-history.json), the forecast cloud now and at the hour and its change, forecast sun and rain, hour of day, day of
   year and the lead, out to 12 h. Trained on the 8 METAR airports (2024-26, all seasons) and the trusted MACH stations (2026);
   tested as served (the layer's own kriged residual with the station left out). NIGRAAN_NOWCAST=0 returns to the straight fade. */
import { capped } from './capcount.mjs';
import { readFileSync, statSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { lgbEval } from './natmodel.mjs';
import { join } from 'node:path';
import { esatHpa } from './psychro.mjs';

const SEASON = { 12: 'DJF', 1: 'DJF', 2: 'DJF', 3: 'MAM', 4: 'MAM', 5: 'MAM', 6: 'JJA', 7: 'JJA', 8: 'JJA', 9: 'SON', 10: 'SON', 11: 'SON' };
const pk = (ms) => { const d = new Date(ms + 5 * 3600e3); return { h: d.getUTCHours(), m: d.getUTCMonth() + 1 }; };
const km = (a, b, c, d) => { const p = Math.PI / 180; const x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
const median = (a) => { const q = a.filter(Number.isFinite).sort((x, y) => x - y); if (!q.length) return null; const m = q.length >> 1; return q.length % 2 ? q[m] : (q[m - 1] + q[m]) / 2; };
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;

/* Gaussian elimination with partial pivoting (the systems are small: at most ~40 stations) */
export function solve(A, b) {   /* v91.17.283.25 · exported: the EWS shadow anchor (ewsanchor.mjs) solves its kriging system with the same code */
  const n = b.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null; [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = M[r][n]; for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]; x[r] = s / M[r][r]; }
  return x;
}

export function createHyperlocal(app, dataDir) {
  const on = () => process.env.NIGRAAN_HYPERLOCAL !== '0';
  let M = null, SUN = [], stamp = 0, sunStamp = 0;
  function load() {
    try { const f = join(dataDir, 'hyperlocal-model.json'); const t = statSync(f).mtimeMs; if (t !== stamp) { M = JSON.parse(readFileSync(f, 'utf8')); stamp = t; } } catch (_) { M = null; }
    try {
      const f = join(dataDir, 'mach-sun-correction.json'); const t = statSync(f).mtimeMs;
      if (t !== sunStamp) {
        SUN = (JSON.parse(readFileSync(f, 'utf8')).stations || []).map(s => {
          /* the table is 3-hourly where the PMD reference is a synop: the gaps are filled linearly between the fitted daytime hours,
             0 before 07 and after 18 local (no sun error outside the day) */
          const sun = {};
          for (const [se, arr] of Object.entries(s.sun || {})) {
            const v = arr.slice(); v[6] = v[6] ?? 0; v[19] = v[19] ?? 0;
            for (let h = 0; h < 24; h++) if (h < 7 || h > 18) v[h] = 0;
            for (let h = 7; h <= 18; h++) if (v[h] == null) { let a = h - 1; while (v[a] == null) a--; let b = h + 1; while (v[b] == null) b++; v[h] = v[a] + (v[b] - v[a]) * (h - a) / (b - a); }
            sun[se] = v;
          }
          return { ...s, sun };
        });
        sunStamp = t;
      }
    } catch (_) { SUN = []; }
  }
  load();
  const P = () => M || { variogram: { nugget: 0.54, psill: 1.64, range_km: 34 }, radius_km: 40, min_stations: 2, max_age_min: 60, buddy: { radius_km: 30, min_c: 3, mad_k: 3 }, fade_hours: 6 };

  /* v91.17.190 · hourly copies of the residual set (30 h), read back at start, for the nowcast's earlier-hour inputs */
  const histFile = join(dataDir, 'hyperlocal-history.json'); let HIST = new Map(), histSaved = 0;
  try { if (existsSync(histFile)) { const j = JSON.parse(readFileSync(histFile, 'utf8')); for (const [k, v] of Object.entries(j.hours || {})) HIST.set(Number(k), v); } } catch (_) {}
  function keep(rows, now) {
    if (!rows || !rows.length) return; const newest = Math.max(...rows.map(r => r.obsMs)); const hk = Math.round(newest / 3600e3) * 3600e3;
    HIST.set(hk, rows.map(r => ({ key: r.key, lat: r.lat, lon: r.lon, res: r2(r.res) })));
    for (const k of [...HIST.keys()]) if (k < hk - 30 * 3600e3) HIST.delete(k);
    if (now - histSaved > 5 * 60e3) { histSaved = now; try { const t = histFile + '.tmp'; writeFileSync(t, JSON.stringify({ version: 'hlh-91.17.190', hours: Object.fromEntries(HIST) })); renameSync(t, histFile); } catch (_) {} }
  }
  let NC = null, ncStamp = 0, ncAt = 0;
  /* v91.17.233 · the file is checked on disk at most every 30 s (the laptop profile: existsSync/statSync on every call, 8 s in 150 s) */ 
  function nowcastModel() { if (NC && Date.now() - ncAt < 30e3) return NC; ncAt = Date.now(); try { const f = join(dataDir, 'nowcast-model.json'); if (!existsSync(f)) return null; const t = statSync(f).mtimeMs; if (t !== ncStamp) { NC = JSON.parse(readFileSync(f, 'utf8')); ncStamp = t; } return NC; } catch (_) { return null; } }

  /* 1 · siting correction of one reading */
  function siteCorrect(lat, lon, tempC, obsMs) {
    if (!Number.isFinite(tempC)) return null;
    load();
    /* v91.17.191 · the daytime sun tables are off (data/hyperlocal-model.json sun_tables: false): at PMD and airport thermometers
       none of the layer's stations was fitted against, the layer built WITHOUT them was closest (station-lake/scripts/sunmodel/
       sun_judge.py, 2023-26, 11 judge sites, 31,432 daytime hours, as served with day-part offsets: MAE 1.160 C without tables,
       1.242 with the tables in use until now, 1.204 with tables refitted on the right sensors). The Islamabad tables had also been
       fitted on the wrong sensors (history files Mach1-14 carried the next station's readings). The day-part siting offset
       (sitingoffsets.mjs) still removes each station's mean daytime difference from its neighbours. */
    if (M && M.sun_tables === false) { const { h } = pk(obsMs); return { t: tempC, table: false, night: h >= 19 || h <= 6 }; }
    let best = null; for (const s of SUN) { const d = km(lat, lon, s.lat, s.lon); if (d <= 0.3 && (!best || d < best.d)) best = { s, d }; }
    const { h, m } = pk(obsMs);
    if (!best) return { t: tempC, table: false, night: h >= 19 || h <= 6 };
    const se = SEASON[m]; const tab = best.s.sun[se] || Object.values(best.s.sun)[0];
    const c = tab ? (tab[h] || 0) : 0;
    return { t: tempC - c, table: true, sunC: r2(c), ref: best.s.ref, night: h >= 19 || h <= 6 };
  }

  /* 2-3 · the live residual set, rebuilt from the fleet's last poll */
  let live = { at: 0, rows: [], dropped: [], injected: false };
  function refresh(force = false) {
    if (!force && Date.now() - live.at < 60e3) return live;
    if (live.injected && Date.now() - live.at < 30 * 60e3) return live;
    let src = []; try { src = app.fleet && app.fleet.liveReadings ? app.fleet.liveReadings() : []; } catch (_) {}
    const maxAge = P().max_age_min * 60e3, now = Date.now();
    const { rows, skipped } = rowsFrom(src, now, maxAge);
    /* v91.17.144 · B7 · a fleet poll gap (empty or partial source) must not switch the live layer off between two requests of the
       same minute: rows from the last good build stay while they are inside the reading age limit */
    const keepOld = (live.rows || []).filter(o => now - o.obsMs <= maxAge && !rows.some(r => r.key === o.key));
    const built = buddy(rows.concat(src.length ? [] : keepOld));
    live = { at: now, ...built, skipped, injected: false };
    try { keep(live.rows, now); } catch (_) {}
    return live;
  }
  /* v91.17.273 · ACC · the residual rows of one reading set (the live poll, or a past hour replayed by the accuracy monitor from the copied
     MACH database): the same siting correction, day-part offset and hold-out as the live layer; refresh() and replay() share it */
  function rowsFrom(src, now, maxAge) {
    const rows = [], skipped = [];
    /* v91.17.186 · every station the per-reading QC passed enters, day and night, with its siting offset against its MACH
       neighbours or PMD synop removed (sitingoffsets.mjs; v91.17.283.14: a flagged station enters without an offset). Before: a station
       entered by day only with a PMD sun table (20 of 106) and never when unscreened. Hindcast (step 0, every hour 25 Mar - 5 Oct,
       each station hidden in turn): MAE at trusted stations 0.97 -> 0.85 C, at unscreened stations 1.42 -> 1.34 C. */
    for (const r of src) {
      if (now - r.obsMs > maxAge) continue;
      const o = r.offset || null;
      const c = siteCorrect(r.lat, r.lon, r.tempC, r.obsMs); if (!c) continue;
      const part = (() => { const lh = pk(r.obsMs).h; return lh >= 9 && lh <= 16 ? 'day' : (lh >= 20 || lh <= 5) ? 'night' : 'between'; })();
      const offC = o && o.off && !o.flag && Number.isFinite(o.off[part]) ? o.off[part] : 0;   /* v91.17.283.14 · a flagged station's offset is no site term */
      const t = c.t - offC;
      rows.push({ key: r.key, name: r.name, lat: r.lat, lon: r.lon, obsMs: r.obsMs, read: r.tempC, corrected: r1(t), sunC: c.sunC || 0, offsetC: r2(offC), reference: o && o.ref ? o.ref + ' (' + o.refName + ')' : null, served: r.served, res: t - r.served });
    }
    return { rows, skipped };
  }
  function buddy(rows) {
    const keep = rows.slice(), dropped = [];   /* v91.17.283.14 · no drop here: obsqc.mjs judged every reading before it arrived */
    const B = P().buddy || { radius_km: 30 };   /* the clamp's neighbourhood */
    /* one station must not carry a neighbourhood on its own: a kept residual is held within 2.5 C of its neighbours' median */
    /* v91.17.186 · the clamp is read from the model file (clamp_c); null switches it off. The step-0 hindcast was run without it */
    const CL = P().clamp_c === undefined ? 2.5 : P().clamp_c;
    if (CL != null) for (const r of keep) {
      const nb = keep.filter(o => o !== r && km(r.lat, r.lon, o.lat, o.lon) <= B.radius_km).map(o => o.res);
      if (nb.length >= 3) { const md = median(nb); const c = Math.min(md + CL, Math.max(md - CL, r.res)); if (c !== r.res) { r.resRaw = r.res; r.res = c; } }
    }
    return { rows: keep, dropped };
  }

  /* 4 · the residual at a point */
  function at(lat, lon, opt = {}) {
    if (!on()) return { applied: false, why: 'switched off (NIGRAAN_HYPERLOCAL=0)' };
    const L = refresh(); const V = P().variogram, R = P().radius_km;
    const S = L.rows.filter(r => !opt.exclude || r.key !== opt.exclude).map(r => ({ ...r, d: km(lat, lon, r.lat, r.lon) })).filter(r => r.d <= R).sort((a, b) => a.d - b.d).slice(0, 25);   /* opt.exclude: the hindcast harness leaves the scored station out */
    if (S.length < P().min_stations) {
      /* v91.17.146 · CEO 4 Oct ("in 40 km many MACH stations are"): the reason names how many stations are there and how many reported.
         The fleet stops uploading for hours at night, so "no station" was wrong: the stations exist, their readings are too old. */
      /* v154 · the reason also names why reporting stations were not used: in daytime only stations with a measured siting
         correction enter the layer (the rest read hot in sun), and readings failing the quality screen are left out */
      let tot = 0, rep = 0, polled = true, nRows = 0;
      try { const LT = app.fleet && app.fleet.latest ? app.fleet.latest() : null; polled = !!(LT && LT.at); const rows = (LT && LT.rows) || []; nRows = rows.length;
        for (const r of rows) { if (!Number.isFinite(r.lat) || km(lat, lon, r.lat, r.lon) > R) continue; tot++; if (r.usable && r.ageMin != null && r.ageMin <= P().max_age_min) rep++; } } catch (_) {}
      const sk = (L.skipped || []).filter(r => Number.isFinite(r.lat) && km(lat, lon, r.lat, r.lon) <= R);
      const nSit = sk.filter(r => r.why === 'siting').length, nQc = sk.filter(r => r.why === 'qc').length, nHeld = sk.filter(r => r.why === 'held').length;
      const need = P().min_stations;
      let why;
      if (!polled) why = 'the AGN station readings are still arriving (the first reading after a restart takes a few minutes)';   /* v91.17.283.51 g1 (audit P2): plain words */
      else if (!nRows) why = 'the MACH fleet feed returned no readings at the last poll';
      else if (!tot) why = 'no MACH station within ' + R + ' km';
      else if (!rep) why = tot + ' MACH station' + (tot > 1 ? 's' : '') + ' within ' + R + ' km, none reporting in the last hour';
      else { const parts = []; if (nSit) parts.push(nSit + ' without a measured daytime siting correction'); if (nQc) parts.push(nQc + ' failing the quality screen'); if (nHeld) parts.push(nHeld + ' held out as unsteady or faulty against its reference');
        why = rep + ' of ' + tot + ' MACH stations within ' + R + ' km reporting; ' + S.length + ' usable for the live layer' + (parts.length ? ' (' + parts.join(', ') + ')' : '') + ', it needs ' + need; }
      return { applied: false, why, stations: S.length, fleetWithin: tot, reporting: rep, skippedSiting: nSit, skippedQc: nQc, heldOut: nHeld };
    }
    const C = (d) => V.psill * Math.exp(-3 * d / V.range_km);
    const K = S.map((a, i) => S.map((b, j) => C(km(a.lat, a.lon, b.lat, b.lon)) + (i === j ? V.nugget : 0)));
    const k = S.map(s => C(s.d)); const w = solve(K, k);
    if (!w) return { applied: false, why: 'kriging system singular', stations: S.length };
    /* v91.17.186 · the cap is read from the model file (cap_c); null = no cap. Hindcast (step 0): on the 3.3 % of station-hours where the
       layer moved a place by more than 3 C, served error 4.25 C -> 1.55 C without the cap, 2.09 C with it */
    const CAP = P().cap_c === undefined ? 3 : P().cap_c; const raw0 = w.reduce((a, x, i) => a + x * S[i].res, 0);
    /* ══ v91.17.283 · WS2 F1b · ONE STATION DOES NOT MOVE A PLACE BEYOND WHAT AN UNCHECKED READING MAY ═════════════════════════════
       With min_stations 1 and no neighbour within the buddy radius, a lone station skips the buddy check entirely, so its whole
       residual was kriged onto the area: a 75 C reading 2.9 km from Khaplu served 47.2 C with a +-2 C range (SELF-A F1b). When only one
       station supports the correction at this point it is applied only if its residual is within the buddy rule's own floor
       (buddy.min_c of data/hyperlocal-model.json: the smallest departure the layer ever treats as a fault when neighbours CAN check it);
       beyond that the point falls back to the model chain (applied false, with the reason). Two or more stations: unchanged. */
    if (S.length < 2) { const B = P().buddy || {}; const lim = Number.isFinite(B.min_c) ? B.min_c : null;
      if (lim == null || Math.abs(S[0].res) > lim) return { applied: false, lone: true, stations: 1, nearestKm: r1(S[0].d),
        why: 'one MACH station within ' + R + ' km supports the live correction here and its residual (' + r2(S[0].res) + ' C) is beyond what an unchecked reading may move a place (' + (lim == null ? 'no buddy floor in the model file' : lim + ' C') + '): the model chain is served' }; }
    const dT = CAP == null ? raw0 : capped('live.L3', raw0, CAP);
    const varK = Math.max(V.psill + V.nugget - w.reduce((a, x, i) => a + x * k[i], 0), 0);
    const newest = Math.max(...S.map(s => s.obsMs));
    return { applied: true, dT: r2(dT), sigma: r2(Math.sqrt(varK)), interval90: r1(1.645 * Math.sqrt(varK)), stations: S.length, ...(S.length < 2 ? { lone: true } : {}), nearestKm: r1(S[0].d), newestMs: newest,
             top: S.slice(0, 4).map((s, i) => ({ key: s.key, name: s.name, km: r1(s.d), weight: r2(w[i]), residual: r2(s.res), sunRemovedC: s.sunC, siteOffsetRemovedC: s.offsetC, reference: s.reference })) };
  }

  /* v91.17.190 · the same kriging on an earlier hour's residual set (the nowcast's inputs); null when too few stations */
  function krigeRows(rows, lat, lon) {
    if (!rows || !rows.length) return null; const V = P().variogram, R = P().radius_km;
    const S = rows.map(r => ({ ...r, d: km(lat, lon, r.lat, r.lon) })).filter(r => r.d <= R).sort((a, b) => a.d - b.d).slice(0, 25);
    if (S.length < P().min_stations) return null;
    const C = (d) => V.psill * Math.exp(-3 * d / V.range_km);
    const K = S.map((a, i) => S.map((b, j) => C(km(a.lat, a.lon, b.lat, b.lon)) + (i === j ? V.nugget : 0))); const w = solve(K, S.map(s => C(s.d)));
    if (!w) return null; return w.reduce((a, x, i) => a + x * S[i].res, 0);
  }
  /* v91.17.190 · the nowcast at lead h (1..horizon): the straight fade + the model's correction; null = use the straight fade */
  function nowcastFn(lat, lon, e0, t0, loc) {
    if (process.env.NIGRAAN_NOWCAST === '0') return null; const m = nowcastModel(); if (!m || !m.residual || !Array.isArray(m.features)) return null;
    const hk = Math.round(t0 / 3600e3) * 3600e3; const ek = (ms) => { const rows = HIST.get(ms); const v = rows ? krigeRows(rows, lat, lon) : null; return v == null ? null : v; };
    const e1 = ek(hk - 3600e3), e3 = ek(hk - 3 * 3600e3);
    const H = loc.hourly, raw = loc.__rawH || {}, off = (loc.utc_offset_seconds || 0) * 1000;
    const ser = (k) => Array.isArray(raw[k]) ? raw[k] : (Array.isArray(H[k]) ? H[k] : null);
    const cc = ser('cloud_cover'), sw = ser('shortwave_radiation'), pr = ser('precipitation');
    const idx = new Map(); H.time.forEach((t, i) => idx.set(Math.round((Date.parse(t.length <= 16 ? t + 'Z' : t) - off) / 3600e3) * 3600e3, i));
    const val = (a, ms) => { const i = idx.get(ms); return a && i != null && a[i] != null ? Number(a[i]) : null; };
    const cc0 = val(cc, hk), sw0 = val(sw, hk); const yCache = new Map();
    return (h) => {
      if (!(h >= 1 && h <= (m.horizon_h || 12))) return null;
      const ms = hk + h * 3600e3, d = new Date(ms), lh = (d.getUTCHours() + 5) % 24;
      const doy = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5) + 1;
      const yk = ms - 24 * 3600e3; if (!yCache.has(yk)) yCache.set(yk, ek(yk));
      const ccH = val(cc, ms); const lin = e0 * Math.max(0, Math.min(1, 1 - h / 6));
      const f = { e0, e1, e3, eY: yCache.get(yk), cc0, ccH, dcc: ccH != null && cc0 != null ? ccH - cc0 : null, swH: val(sw, ms), sw0, prH: val(pr, ms),
        hs: Math.sin(2 * Math.PI * lh / 24), hc: Math.cos(2 * Math.PI * lh / 24), ds: Math.sin(2 * Math.PI * doy / 365.25), dc: Math.cos(2 * Math.PI * doy / 365.25), h, lin };
      const p = lgbEval(m.residual, m.features.map(c => f[c] ?? null)); return Number.isFinite(p) ? lin + p : null;
    };
  }

  /* 5 · apply to a served response (hourly and current temperature) */
  /* v91.17.125 · external audit A12 · the live layer moves temperature at constant water vapour, as the national model does: the dew
     point is kept, relative humidity follows RH' = RH * es(T) / es(T'), and the apparent temperature moves by the same dT. Before,
     temperature moved while humidity and apparent temperature stayed, so the heat indices downstream read a mixed state. */
  const esat = esatHpa;   /* v91.17.128 · the one psychrometric module */
  function follow(o, i, T0, T1) { const get = (k) => (i == null ? o[k] : (Array.isArray(o[k]) ? o[k][i] : undefined)), set = (k, v) => { if (i == null) o[k] = v; else o[k][i] = v; };
    const rh = get('relative_humidity_2m'); if (typeof rh === 'number' && Number.isFinite(rh)) set('relative_humidity_2m', Math.round(Math.max(1, Math.min(100, rh * esat(T0) / esat(T1))) * 10) / 10);
    const td = get('dew_point_2m'); if (typeof td === 'number' && td > T1) set('dew_point_2m', T1);
    const ap = get('apparent_temperature'); if (typeof ap === 'number' && Number.isFinite(ap)) set('apparent_temperature', r1(ap + (T1 - T0))); }
  /* v91.17.244 · CEO 10 Oct ("temp 27 but in left panel max is 26.9 why"): the live layer corrected the present hour and the hours ahead,
     but the hours already gone today kept the uncorrected forecast, so the day's maximum could sit below the temperature shown now.
     Each past hour now takes the ANALYSIS of that hour: the same kriging on the residual set the stations reported in that hour
     (HIST, kept 30 h). Lead 0 is where the layer is tested (hindcast step 0); an hour with too few stations keeps the forecast. */
  function pastHours(loc, lat, lon, beforeMs) {
    const H = loc && loc.hourly; if (!H || !Array.isArray(H.time) || !Array.isArray(H.temperature_2m) || !HIST.size) return 0;
    const off = (loc.utc_offset_seconds || 0) * 1000, CAP = P().cap_c === undefined ? 3 : P().cap_c; let k = 0;
    H.time.forEach((t, i) => {
      const ms = Date.parse(t.length <= 16 ? t + 'Z' : t) - off; if (!(ms < beforeMs) || H.temperature_2m[i] == null) return;
      const rows = HIST.get(Math.round(ms / 3600e3) * 3600e3); let d = rows ? krigeRows(rows, lat, lon) : null;
      if (d == null || !Number.isFinite(d) || Math.abs(d) < 0.05) return; if (CAP != null) d = Math.max(-CAP, Math.min(CAP, d));
      const T0 = H.temperature_2m[i], T1 = r1(T0 + d); H.temperature_2m[i] = T1; follow(H, i, T0, T1); k++;
    });
    return k;
  }
    /* v91.17.108 · audit v107 F7: the day's max / min / mean stay the corrected curve's own (the rule the chain applies before
       this layer), so today's day card cannot disagree with the hourly curve drawn beside it */
  function dayStats(loc) { const H = loc.hourly;
    try { const Dd = loc.daily;
      if (H && Dd && Array.isArray(Dd.time)) { const by = new Map(); H.time.forEach((t, i) => { const d = String(t).slice(0, 10); const v = H.temperature_2m[i]; const a2 = by.get(d) || by.set(d, []).get(d); a2.push(v); });
        Dd.time.forEach((d, i) => { const v = by.get(String(d).slice(0, 10)); if (!v || v.length < 24 || v.some(x => x == null)) return;
          if (Array.isArray(Dd.temperature_2m_max) && Dd.temperature_2m_max[i] != null) Dd.temperature_2m_max[i] = r1(Math.max(...v));
          if (Array.isArray(Dd.temperature_2m_min) && Dd.temperature_2m_min[i] != null) Dd.temperature_2m_min[i] = r1(Math.min(...v));
          if (Array.isArray(Dd.temperature_2m_mean) && Dd.temperature_2m_mean[i] != null) Dd.temperature_2m_mean[i] = r1(v.reduce((x, y) => x + y, 0) / v.length); }); } } catch (_) {}
  }
  function apply(loc, lat, lon) {
    if (!on() || !loc) return false;
    const a = at(lat, lon); if (!a.applied || Math.abs(a.dT) < 0.05) { const np = pastHours(loc, lat, lon, Date.now() - 3600e3); if (np) dayStats(loc);
      loc.agn_hyperlocal = a.applied ? { ...a, applied: false, why: 'live correction under 0.05 C', top: undefined, radiusKm: P().radius_km, asOf: live.at, pastHours: np } : { applied: false, why: a.why, stations: a.stations || 0, radiusKm: P().radius_km, asOf: live.at, pastHours: np };   /* v91.17.144 · B7 · the reason travels with the response: every reader uses this one decision */   /* v91.17.90 · the spread used to overwrite applied:false with true */ return false; }
    const off = (loc.utc_offset_seconds || 0) * 1000, F = P().fade_hours * 3600e3, t0 = a.newestMs;
    let n = 0, ncN = 0;
    const H = loc.hourly;
    if (H && Array.isArray(H.time) && Array.isArray(H.temperature_2m)) {
      let nc = null; try { nc = nowcastFn(lat, lon, a.dT, t0, loc); } catch (_) { nc = null; }
      const hk = Math.round(t0 / 3600e3) * 3600e3, NH = nc ? ((nowcastModel() || {}).horizon_h || 12) * 3600e3 : 0;
      H.time.forEach((t, i) => {
        const ms = Date.parse(t.length <= 16 ? t + 'Z' : t) - off; const dt = ms - t0;
        if (H.temperature_2m[i] == null || dt < -3600e3) return;
        let d = null; const h = Math.round((ms - hk) / 3600e3);
        if (nc && h >= 1 && ms - hk <= NH) { d = nc(h); if (d != null) ncN++; }
        if (d == null) { if (dt > F) return; d = a.dT * (dt <= 0 ? 1 : 1 - dt / F); }
        const T0 = H.temperature_2m[i], T1 = r1(T0 + d); H.temperature_2m[i] = T1; follow(H, i, T0, T1); n++;
      });
    }
    const Cu = loc.current;
    if (Cu && Cu.temperature_2m != null) { const T0 = Cu.temperature_2m, T1 = r1(T0 + a.dT); Cu.temperature_2m = T1; follow(Cu, null, T0, T1); n++; }
    const nPast = pastHours(loc, lat, lon, t0 - 3600e3);
    if (n || nPast) dayStats(loc);
    loc.agn_hyperlocal = { applied: n > 0, why: n > 0 ? null : 'no forecast hour inside the live window', pastHours: nPast, asOf: live.at, radiusKm: P().radius_km, hours: n, dTC: a.dT, plusMinus90C: a.interval90, stations: a.stations, nearestKm: a.nearestKm, fadeHours: P().fade_hours, nowcastHours: ncN, nowcast: ncN ? (nowcastModel() || {}).version : null,
      reference: 'AGN MACH fleet, live, each station corrected for its siting against its MACH neighbours or the national synoptic stations; simple kriging (data/hyperlocal-model.json)', top: a.top };
    return n > 0;
  }

  /* v91.17.273 · ACC · for the accuracy monitor (accmon.mjs), read only: nothing here changes a served value or the live state.
     looAt: the layer's value at a point from a residual set with one station left out (the scored station: the monitor measures the
     chain, not the station echoing itself; the layer's own held-out test does the same). The cap is the served one, not counted.
     replay: a past hour's residual set built from readings the caller supplies (rowsFrom + buddy, as refresh()).
     atHour: the analysis of a past hour from the 30-h history (what a page shows for that hour), null when the hour is not held. */
  function looAt(lat, lon, exclude, rowsIn) {
    if (!on()) return { applied: false, dT: 0, stations: 0 };
    const rows = rowsIn || refresh().rows; const V = P().variogram, R = P().radius_km;
    const S = rows.filter(r => r.key !== exclude).map(r => ({ ...r, d: km(lat, lon, r.lat, r.lon) })).filter(r => r.d <= R).sort((a, b) => a.d - b.d).slice(0, 25);
    if (S.length < P().min_stations) return { applied: false, dT: 0, stations: S.length };
    const C = (d) => V.psill * Math.exp(-3 * d / V.range_km);
    const K = S.map((a, i) => S.map((b, j) => C(km(a.lat, a.lon, b.lat, b.lon)) + (i === j ? V.nugget : 0)));
    const w = solve(K, S.map(s => C(s.d))); if (!w) return { applied: false, dT: 0, stations: S.length };
    const CAP = P().cap_c === undefined ? 3 : P().cap_c; let d = w.reduce((a, x, i) => a + x * S[i].res, 0); if (CAP != null) d = Math.max(-CAP, Math.min(CAP, d));
    if (Math.abs(d) < 0.05) d = 0;   /* apply(): a correction under 0.05 C is not applied */
    return { applied: d !== 0, dT: r2(d), stations: S.length, nearestKm: r1(S[0].d) };
  }
  function replay(src, nowMs) { const { rows, skipped } = rowsFrom(src, nowMs, P().max_age_min * 60e3); return { ...buddy(rows), skipped }; }
  function atHour(ms, lat, lon) { if (!on()) return 0; const rows = HIST.get(Math.round(ms / 3600e3) * 3600e3); if (!rows) return null;
    let d = krigeRows(rows, lat, lon); if (d == null || !Number.isFinite(d)) return 0; const CAP = P().cap_c === undefined ? 3 : P().cap_c; if (CAP != null) d = Math.max(-CAP, Math.min(CAP, d)); return Math.abs(d) < 0.05 ? 0 : r2(d); }
  function status() {
    const L = refresh(); load();
    return { on: on(), version: M && M.version, liveStations: L.rows.length, dropped: L.dropped, heldOut: (L.skipped || []).filter(r => r.why === 'held').map(r => ({ key: r.key, why: r.reason })), sitingTables: SUN.length, at: L.at ? new Date(L.at).toISOString() : null,
             injected: !!L.injected, validation: M && M.validation, nowcast: (() => { const m = nowcastModel(); return { on: process.env.NIGRAAN_NOWCAST !== '0' && !!m, version: m && m.version, horizonH: m && m.horizon_h, historyHours: HIST.size }; })(), rule: M && { radius_km: M.radius_km, fade_hours: M.fade_hours, variogram: M.variogram, min_stations: M.min_stations, cap_c: M.cap_c ?? null, clamp_c: M.clamp_c ?? null } };
  }
  /* test hook (local / signed callers only, wired in index.mjs): a set of readings with their served values, kept 30 min */
  function inject(rows) {
    if (!rows || !rows.length) { live = { at: 0, rows: [], dropped: [], injected: false }; refresh(true); return { cleared: true, liveStations: live.rows.length }; }
    const clean = (rows || []).filter(r => [r.lat, r.lon, r.tempC, r.served].every(Number.isFinite)).map(r => {
      const obsMs = r.obsMs || Date.now(); const c = siteCorrect(r.lat, r.lon, r.tempC, obsMs);
      return { key: r.key || 'test', name: r.name || r.key || 'test', lat: r.lat, lon: r.lon, obsMs, read: r.tempC, corrected: r1(c.t), sunC: c.sunC || 0, served: r.served, res: c.t - r.served };
    });
    live = { at: Date.now(), ...buddy(clean), injected: true }; return { kept: live.rows.length, dropped: live.dropped };
  }
  /* test hook (unit tests only): an earlier hour's residual set for the nowcast's inputs */
  function seedHistory(hourMs, rows) { HIST.set(Math.round(hourMs / 3600e3) * 3600e3, rows.map(r => ({ key: r.key, lat: r.lat, lon: r.lon, res: r.res }))); }
  return { siteCorrect, at, apply, status, refresh, inject, seedHistory, radiusKm: () => P().radius_km, looAt, replay, atHour, maxAgeMin: () => P().max_age_min };
}
