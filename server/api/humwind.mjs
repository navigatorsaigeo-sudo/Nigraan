/* ══ v91.17.92 · THE MOUNTAIN HUMIDITY AND WIND CORRECTION (data/humwind-model.json, station-lake/scripts/humwind_final.py) ══
   The global model is ~9 % too humid and ~0.8 m/s too calm in the northern valleys (102 / 32 PMD-EWS valley stations,
   2024-2026). Two small LightGBM models, trained on those stations and tested on stations they never saw (humidity MAE
   16.3 -> 11.7 %, wind 1.32 -> 1.14 m/s), correct the hourly relative humidity and 10 m wind speed.
     where    the mountain zone AND inside the training stations' box (34.7-36.9 N, 71.4-76.6 E) AND 1000-5000 m: nowhere else,
              because nowhere else was tested
     input    the model's own humidity and wind BEFORE the temperature correction (the national model moves temperature at
              constant dew point; this replaces that humidity with the station-trained one), the served height, lat, lon,
              the UTC hour and the month
     output   hourly relative_humidity_2m (1-100) and wind_speed_10m (the request's unit); current values follow the hour
              nearest to now; loc.agn_humwind = { applied, version } so every consumer can see it was applied
   NIGRAAN_HUMWIND=0 switches it off.
   v91.17.93 (science audit) · two more steps live here:
     lowland dew point  plains and coast: the model dew point is too dry (-2.8 / -0.8 C against 36 synop stations), so the
              served wet bulb read ~1.5 C low in the plains. data/dew-offset-lowland.json adds the measured offset (zone x month
              x 4-hour block); held out: plains daily wet-bulb max bias -1.47 -> -0.06 C, wet bulb >= 28 C caught 0.41 -> 0.78.
     one physical state  after the temperature model and these corrections, dew point, wet bulb and the daily humidity
              families are recomputed from the final temperature and humidity, so the API, the card and the hazards agree. */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { lgbEval } from './natmodel.mjs';
import { dewPointC, rhFromDew, wetBulbC, esatHpa, r1 as r1p } from './psychro.mjs';
/* v91.17.157 · audit: the provider's apparent temperature (Steadman 1994, non-radiative: AT = T + 0.33 e - 0.70 ws - 4.00, e in hPa) is moved
   with the vapour pressure when a humidity correction changes it (dAT/de = 0.33); it kept the old moisture before (40 C, Td 20 -> 22.8 C:
   +1.4 C missed). Temperature-only steps shift AT by dT elsewhere (dAT/dT = 1 at constant e). */
const atShift = (H, i, de) => { const A = H && H.apparent_temperature; if (Array.isArray(A) && A[i] != null && Number.isFinite(de)) A[i] = Math.round((A[i] + 0.33 * de) * 10) / 10; };
const tdOfRh = (t, r) => dewPointC(t, Math.max(1, r));
const rhOfTd = (t, td) => rhFromDew(t, td);
const wetBulb = (T, R, elev) => r1p(wetBulbC(T, R, Number.isFinite(elev) ? { elevationM: elev } : null));
const r1 = (v) => Math.round(v * 10) / 10;

export function createHumWind({ dataDir, zoneOf }) {
  const file = join(dataDir, 'humwind-model.json'), dewFile = join(dataDir, 'dew-offset-lowland.json');
  let M = null, mtime = 0, lastCheck = 0, DW = null, dwM = 0, dwCheck = 0;
  function dewTable() {
    const now = Date.now(); if (DW && now - dwCheck < 60000) return DW; dwCheck = now;
    try { if (!existsSync(dewFile)) return (DW = null); const t = statSync(dewFile).mtimeMs; if (t !== dwM) { DW = JSON.parse(readFileSync(dewFile, 'utf8')); dwM = t; } } catch (_) { DW = null; }
    return DW;
  }
  const lowZone = (lat, lon, elev) => { try { const z = zoneOf ? zoneOf(lat, lon, elev) : null; return z === 'plains' || z === 'coast' ? z : null; } catch (_) { return null; } };
  const on = () => process.env.NIGRAAN_HUMWIND !== '0';
  function model() {
    const now = Date.now(); if (M && now - lastCheck < 60000) return M; lastCheck = now;
    try { if (!existsSync(file)) return (M = null); const t = statSync(file).mtimeMs; if (t !== mtime) { M = JSON.parse(readFileSync(file, 'utf8')); mtime = t;
      /* v91.17.269 · PERF A5 · the wind trees (half of the file, about 5 MB in memory) are switched off unless NIGRAAN_HUMWIND_WIND=1
         (the v91.17.147 audit, in apply() below), so they are not kept in memory when they are never served. The switch is read when the
         file is read, as the file is. */
      if (process.env.NIGRAAN_HUMWIND_WIND !== '1' && M && M.models) delete M.models.wind; } } catch (_) { M = null; }
    return M;
  }
  const inDomain = (lat, lon, elev) => lat >= 34.7 && lat <= 36.9 && lon >= 71.4 && lon <= 76.6 && elev != null && elev >= 1000 && elev <= 5000 && (!zoneOf || zoneOf(lat, lon, elev) === 'mountain');

  /* raw = { rh: [...], ws: [...] } captured before any correction; wk = km/h per request wind unit */
  function apply(loc, lat, lon, raw, wk = 1) {
    const m = on() && model(); const H = loc && loc.hourly; const elev = loc && loc.elevation;
    if (!m || !H || !Array.isArray(H.time) || !inDomain(lat, lon, elev)) return false;
    const off = (loc.utc_offset_seconds || 0) / 3600; let n = 0;
    const L = Math.min(H.time.length, loc.__natH ? loc.__natH + 72 : H.time.length);   /* sweeps: the national model's horizon (plus the past days), not 16 days */
    const feat = (i, x) => { const s = String(H.time[i]); const hl = +s.slice(11, 13); const mo = +s.slice(5, 7); return [elev, lat, lon, ((hl - off) % 24 + 24) % 24, mo, x]; };
    if (raw.rh && Array.isArray(H.relative_humidity_2m) && m.models.rh) {
      for (let i = 0; i < L; i++) { const x = raw.rh[i]; if (x == null) continue; const before = H.relative_humidity_2m[i]; H.relative_humidity_2m[i] = Math.max(1, Math.min(100, Math.round(x + lgbEval(m.models.rh, feat(i, x))))); const T = H.temperature_2m && H.temperature_2m[i]; if (T != null && before != null) atShift(H, i, esatHpa(T) * (H.relative_humidity_2m[i] - before) / 100); n++; }
    }
    /* v91.17.147 · audit: the wind part is OFF by default. Against the WMO synoptic stations of the same valleys (Gilgit, Skardu,
       Chillas, Bunji, Chitral, Drosh; Jun - Oct 2026, ~890 reports each) it made the 10 m wind worse at all six stations in every
       month (e.g. Skardu MAE 0.65 -> 1.76 m/s in August). It was fitted on the valley AWS network; the synop network does not
       confirm it. The humidity part stays (better at 4 of the 6; worse at Gilgit and Skardu, recorded in the audit). NIGRAAN_HUMWIND_WIND=1 restores it. */
    if (process.env.NIGRAAN_HUMWIND_WIND === '1' && raw.ws && Array.isArray(H.wind_speed_10m) && m.models.wind) {
      for (let i = 0; i < L; i++) { const w = raw.ws[i]; if (w == null) continue; const ms = w * wk / 3.6;
        const c = Math.max(0, Math.exp(lgbEval(m.models.wind, feat(i, ms))) * (ms + 0.5) - 0.5); H.wind_speed_10m[i] = Math.round(c * 3.6 / wk * 10) / 10; n++; }
    }
    if (!n) return false;
    const C = loc.current;
    if (C && C.time) { const k = H.time.indexOf(String(C.time).slice(0, 13) + ':00');
      if (k >= 0) { if (C.relative_humidity_2m != null && H.relative_humidity_2m) C.relative_humidity_2m = H.relative_humidity_2m[k]; if (C.wind_speed_10m != null && H.wind_speed_10m) C.wind_speed_10m = H.wind_speed_10m[k]; } }
    loc.agn_humwind = { applied: true, version: m.version };
    return true;
  }
  /* plains / coast: raw dew point (the model's own, before any correction) + the measured offset, capped at the final air
     temperature; relative humidity follows. Returns true when anything changed. */
  function applyDew(loc, lat, lon, rawDew) {
    const D = on() && dewTable(); const H = loc && loc.hourly; const z = D && lowZone(lat, lon, loc && loc.elevation);
    if (!z || !D.zones || !D.zones[z] || !H || !Array.isArray(H.time) || !Array.isArray(H.temperature_2m) || !Array.isArray(rawDew)) return false;
    const Z = D.zones[z], off = (loc.utc_offset_seconds || 0) / 3600; let n = 0;
    for (let i = 0; i < H.time.length; i++) {
      const T = H.temperature_2m[i], d0 = rawDew[i]; if (T == null || d0 == null) continue;
      const s2 = String(H.time[i]); const hu = ((+s2.slice(11, 13) - off) % 24 + 24) % 24; const row = Z.table[String(+s2.slice(5, 7))];
      const ir = loc.__ifsr ? loc.__ifsr.tdAt(i) : null; if (ir != null) loc.__ifsr.used.td++;   /* 28 Oct 2026 · an approved IFS dew table replaces this table on its IFS-basis hours (ifsretrain.mjs) */
      const o = ir != null ? ir : (row && row[Math.floor(hu / 4)] != null ? row[Math.floor(hu / 4)] : Z.all); const td = Math.min(d0 + o, T);
      const tdBefore = Array.isArray(H.dew_point_2m) && H.dew_point_2m[i] != null ? H.dew_point_2m[i] : (Array.isArray(H.relative_humidity_2m) && H.relative_humidity_2m[i] != null ? tdOfRh(T, H.relative_humidity_2m[i]) : null);
      if (tdBefore != null) atShift(H, i, esatHpa(td) - esatHpa(Math.min(tdBefore, T)));
      if (Array.isArray(H.dew_point_2m)) H.dew_point_2m[i] = r1(td);
      if (Array.isArray(H.relative_humidity_2m)) H.relative_humidity_2m[i] = Math.round(rhOfTd(T, td) * 10) / 10;   /* v91.17.157 · one decimal: integer RH moved the derived dew point by up to 0.8 C in dry heat */
      n++;
    }
    if (n) loc.agn_dew = { applied: true, version: D.version, zone: z };
    return n > 0;
  }
  /* one physical state: dew point and wet bulb from the final temperature and humidity; the daily families of a fully covered
     day from the hourly curve; the current block follows its hour */
  function consistency(loc) {
    const H = loc && loc.hourly; if (!H || !Array.isArray(H.time) || !Array.isArray(H.temperature_2m) || !Array.isArray(H.relative_humidity_2m)) return false;
    const T = H.temperature_2m, R = H.relative_humidity_2m, dp = H.dew_point_2m, wb = H.wet_bulb_temperature_2m;
    for (let i = 0; i < T.length; i++) { if (T[i] == null || R[i] == null) continue;
      if (Array.isArray(dp)) dp[i] = r1(Math.min(tdOfRh(T[i], R[i]), T[i]));
      if (Array.isArray(wb)) wb[i] = wetBulb(T[i], R[i], loc.elevation); }
    const Dd = loc.daily;
    if (Dd && Array.isArray(Dd.time)) {
      const byDay = new Map(); H.time.forEach((t, k) => { const d = String(t).slice(0, 10); (byDay.get(d) || byDay.set(d, []).get(d)).push(k); });
      const fam = [['dew_point_2m', dp], ['relative_humidity_2m', R], ['wet_bulb_temperature_2m', wb], ['apparent_temperature', H.apparent_temperature]];
      for (let i = 0; i < Dd.time.length; i++) {
        const ks = byDay.get(String(Dd.time[i]).slice(0, 10)); if (!ks || ks.length < 24) continue;
        for (const [f, arr] of fam) { if (!Array.isArray(arr)) continue; const v = ks.map((k) => arr[k]).filter((x) => x != null); if (v.length < 24) continue;
          if (Dd[f + '_max'] && Dd[f + '_max'][i] != null) Dd[f + '_max'][i] = r1(Math.max(...v));
          if (Dd[f + '_min'] && Dd[f + '_min'][i] != null) Dd[f + '_min'][i] = r1(Math.min(...v));
          if (Dd[f + '_mean'] && Dd[f + '_mean'][i] != null) Dd[f + '_mean'][i] = r1(v.reduce((a, x) => a + x, 0) / v.length); }
      }
    }
    const C = loc.current;
    if (C && C.time) { const k = H.time.indexOf(String(C.time).slice(0, 13) + ':00');
      if (k >= 0 && R[k] != null && T[k] != null) {
        if (C.relative_humidity_2m != null) C.relative_humidity_2m = R[k];
        if (C.dew_point_2m != null && C.temperature_2m != null) C.dew_point_2m = r1(Math.min(tdOfRh(C.temperature_2m, R[k]), C.temperature_2m));
        if (C.wet_bulb_temperature_2m != null && C.temperature_2m != null) C.wet_bulb_temperature_2m = wetBulb(C.temperature_2m, R[k], loc.elevation); } }
    return true;
  }
  function status() { const m = model(); const D = dewTable(); return m ? { ok: true, enabled: on(), version: m.version, built: m.built, zone: m.zone, heldOut: m.heldOut, lowlandDew: D ? { version: D.version, zones: Object.keys(D.zones || {}), heldOut: D.heldOut } : null } : { ok: false, why: 'data/humwind-model.json missing' }; }
  function selfcheck() { const m = model(); if (!m) return null; let d = 0; for (const k of Object.keys(m.models)) for (const s of m.models[k].selfcheck || []) d = Math.max(d, Math.abs(lgbEval(m.models[k], m.features.map((c) => s.x[c])) - s.y)); return d; }
  return { apply, applyDew, consistency, status, selfcheck, inDomain, lowZone, dewStatus: () => { const D = dewTable(); return D ? { version: D.version, zones: Object.keys(D.zones || {}), heldOut: D.heldOut } : null; } };
}
