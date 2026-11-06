/* v91.17.42 · CATCHMENT WETNESS: the state half of the sponge ═══════════════════════════════
   The flood engines carried soil moisture as one more 0-100 driver. This is the hydrology behind
   it, per tehsil, refreshed every 6 h from the provider's five soil-moisture layers (0-1, 1-3,
   3-9, 9-27, 27-81 cm, hourly, forecast to +3 days):

     θ_rz     depth-weighted root-zone water content over 0-81 cm
     WS       = (θ_rz − lo) / (hi − lo), clipped 0-1          the current wetness state, lo/hi = the model's
                                                              own yearly p05/p95 here (soil-model-range.json)
     AWS      = (hi − θ_rz) × 810                              millimetres the root zone can still take
     SSC      the static sponge capacity: share of a 100 mm storm held (250 m NRCS table, v91.17.283.13)
     ES       = SSC × (1 − WS)                                the effective sponge NOW
     excess   ≈ P72 × (1 − ES)                                a linear stand-in until the curve number lands

   The range is the model's own at that place (a pedotransfer FC/WP is not the model's: 88 tehsils sat
   above the SoilGrids field capacity on a dry day), so WS is a state relative to what THAT model soil
   does THERE, not a national scale; the SoilGrids capacity stays in the static sponge (AWC). The forecast soil
   moisture at +24 and +72 h is the model's own (it includes the rain it forecasts), so the record
   also says where the root zone is heading. Nothing here is verified against a soil-moisture gauge:
   none exists in the PMD lake. It is a state description, and it is labelled as such.

   Served: /api/flood/wetness (national, ?unit=), the outlook unit payload, AI facts, the report. */
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';

/* v91.17.283.10 · ONE SOURCE. The five layer names are the provider's ICON-style names; under best_match the values for Pakistan are
   ECMWF IFS 9 km (0-1, 1-3 and 3-9 cm all = IFS layer 1, 0-7 cm; 9-27 = IFS 7-28 cm; 27-81 = IFS 28-100 cm; measured 23 Oct 2026, Lahore:
   best_match 0.139/0.252/0.319 = ecmwf_ifs, ICON 0.195/0.220/0.234), and the yearly range WS is read against (soil-model-range.json,
   station-lake soil_model_range.py) was built from the same best_match series. best_match falls back to ICON for an hour IFS lacks, so
   the call now names ecmwf_ifs: the live state and its range stay one model (the range script should pin the same model when rebuilt). */
const LAYERS = [['soil_moisture_0_to_1cm', 10], ['soil_moisture_1_to_3cm', 20], ['soil_moisture_3_to_9cm', 60], ['soil_moisture_9_to_27cm', 180], ['soil_moisture_27_to_81cm', 540]];   /* mm */
const RZ = 810;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const r2 = (x) => x == null || !isFinite(x) ? null : Math.round(x * 100) / 100;

import { alignBatch } from './provider.mjs';
import { label } from './refmode.mjs';
import { spongeOf } from './hazsci.mjs';   /* v91.17.283.13 · one sponge method */
/* v91.17.78 · C · LAND-REANALYSIS ANTECEDENT SOIL WATER AND SNOW (data/era5land-recent.json, scripts/era5land.py, LEARN_ALL job
   "era5land"; climatology data/era5land-climatology.json, 1996-2025 monthly means). Carried beside the forecast-model state as
   an input, not a driver: the 30-day root-zone (0-100 cm) water as a percentile of the same part of the year in 30 years (monthly means),
   the 0-7 cm layer likewise, and the snow water with its 7- and 14-day change (negative = melt or sublimation). 2022 flood
   back-test [measured 27 Sep 2026, data/era5land-backtest.json]: on its own the July anomaly ranks the observed flooded share
   better than the ERA5 soil anomaly (Spearman 0.67 vs 0.54, VIIRS 2022, 457 tehsils; 0.59 vs 0.09 on the high-resolution set),
   but once rain x floodplain is known it adds -0.02..0.09 nationally, so it does not move WS or the class. */
const recentLand = (() => { let X = null, at = 0; return (dataDir) => { if (X === null || Date.now() - at > 10 * 60e3) { try { const f = join(dataDir, 'era5land-recent.json'); X = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : false; } catch (_) { X = false; } at = Date.now(); } return X; }; })();
function landBlock(dataDir, unitId) {
  const R = recentLand(dataDir); const u = R && R.units && R.units[unitId]; if (!u) return null;
  const ageD = R.to ? Math.round((Date.now() - Date.parse(R.to + 'T00:00:00Z')) / 864e5) : null;
  return { source: label('reanalysis'), through: R.to, ageDays: ageD, stale: ageD == null || ageD > 21, climatology: R.climatology && R.climatology.period,
    rootZone30d: u.rz30, rootZonePct: u.rz30Pct, rootZoneZ: u.rz30Z, surfacePct: u.s130Pct,
    snowWaterMm: u.sdMmNow, snowChange7dMm: u.sdChange7Mm, snowChange14dMm: u.sdChange14Mm, snowPct: u.sdPct,
    note: 'antecedent state from a land reanalysis about five days behind real time; percentiles against the same 30-day part of the year in 1996-2025 (monthly means). An input beside the forecast wetness state, not a flood probability.' };
}
export function createWetness(app, dataDir) {
  const { provider, units } = app;
  const file = join(dataDir, 'wetness.json');
  const load = (f) => { try { const p = join(dataDir, f); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; } catch { return null; } };
  /* v91.17.283.13 · audit B7 · ONE SPONGE SOURCE: the static sponge (SSC) and the curve numbers here come from the 250 m NRCS table
     (data/sponge-tehsil.v2.json, pixel first, spongeOf in hazsci.mjs), the table the issued sponge levels use; the SoilGrids sponge
     (sponge-tehsil.json, v1) and the tehsil-mean curve numbers (cn-tehsil.json) are no longer read. SSC = the share of a 100 mm storm the
     ground holds at usual wetness (AMC II); CN_I / CN_II / CN_III = the equivalent curve numbers of the cells at AMC I / II / III. */
  const SW = load('soil-water.json'), V2 = load('sponge-tehsil.v2.json'), MR = load('soil-model-range.json');
  const SP = { units: {} }, CN = { units: {}, built: V2 ? V2.built : null, source: V2 ? 'data/sponge-tehsil.v2.json (' + V2.version + '): ESA WorldCover 2021, HYSOGs250m, GLO-30 slope, NRCS curve numbers, pixel first' : null, status: V2 ? 'one source: the 250 m NRCS table' : 'the 250 m NRCS table is not in this install' };
  if (V2 && V2.units) for (const [k, u] of Object.entries(V2.units)) { const id = u.uid || k; const a = spongeOf(V2, u, 1), b = spongeOf(V2, u, 2), c = spongeOf(V2, u, 3); if (!b) continue;
    const hs = u.hsgShare || []; let hi = 0; for (let i = 1; i < hs.length; i++) if (hs[i] > hs[hi]) hi = i;
    SP.units[id] = { SSC: b.retainedShare, hsg: (V2.hsg || [])[hi] || null, builtShare: u.built ?? null, sscBasis: 'share of a 100 mm storm held at usual wetness (250 m cells, NRCS)' };
    CN.units[id] = { cn1: a.equivalentCN, cn2: b.equivalentCN, cn3: c.equivalentCN, s1_mm: a.equivalentS, s2_mm: b.equivalentS, s3_mm: c.equivalentS, hsg: SP.units[id].hsg, hsg_dominant: SP.units[id].hsg, soil_basis: 'HYSOGs250m', impervious_share: u.built ?? null }; }
  /* ══ v91.17.60 · NRCS CURVE NUMBER RUNOFF — the replacement for the linear rainfall-excess stand-in ═══════════════════
     v91.17.70 · data/cn-tehsil.json is again built by station-lake cn.py (the v60 ESRI/IO 2025 grid CN inflated the built class
     in the hills: Rawalakot CN_II 82.1, now 71.4): ESA WorldCover 2021 at the native 10 m grid, the built share bounded by the
     Google Open Buildings footprint share (1x-3x the roof share) and counted impervious at CN 98, x SoilGrids HSG x TR-55.
     data/cn-tehsil.json (station-lake cn.py): CN_II per tehsil from ESA WorldCover shares x hydrologic soil group shares
     (SoilGrids texture, hsg.py) x TR-55, with CN_I / CN_III by the NEH-630 conversions. Here:
       S = 25400/CN − 254 (mm), Ia = λS (λ = 0.20, NIGRAAN_CN_LAMBDA overrides), Q = (P − Ia)² / (P + S − Ia) for P > Ia
     served for the forecast 24 h and 72 h totals at CN_II (antecedent condition II) — that is the published number.
     A wetness-adjusted CN (CN_I → CN_III interpolated on the shared wetness state WS) is ALSO computed and carried as
     `runoffWet`, flagged uncalibrated: the formula book allows it on the wire only after the UNOSAT back-test
     (cn_backtest.py). Nothing here drives the flood class; the linear excessProxyMm stays beside it until then. */
  const LAMBDA = Number(process.env.NIGRAAN_CN_LAMBDA || 0.2);
  function runoff(cn, P) { if (cn == null || P == null || !(cn > 0)) return null; const S = 25400 / cn - 254, Ia = LAMBDA * S; const Q = P > Ia ? (P - Ia) ** 2 / (P + S - Ia) : 0; return { cn: Math.round(cn * 10) / 10, sMm: Math.round(S * 10) / 10, iaMm: Math.round(Ia * 10) / 10, pMm: Math.round(P), qMm: Math.round(Q * 10) / 10, runoffFraction: P > 0 ? Math.round(Q / P * 100) / 100 : 0 }; }
  function curveNumber(unitId, ws, p24, p72) {
    const c = CN && CN.units && CN.units[unitId]; if (!c || c.cn2 == null) return null;
    const cnWet = ws == null ? null : c.cn1 + (c.cn3 - c.cn1) * clamp01(ws);   /* linear on WS between ARC I and ARC III: NIGRAAN's interpolation, uncalibrated */
    return { cn1: c.cn1, cn2: c.cn2, cn3: c.cn3, s2Mm: c.s2_mm, hsg: c.hsg, hsgDominant: c.hsg_dominant, soilBasis: c.soil_basis, lambda: LAMBDA, imperviousShare: c.impervious_share ?? null, source: CN.source || null,
      runoff24: runoff(c.cn2, p24), runoff72: runoff(c.cn2, p72),
      runoffWet24: cnWet == null ? null : { ...runoff(cnWet, p24), basis: 'CN interpolated CN_I..CN_III on the wetness state; UNCALIBRATED (formula book v60: not served to the class until the UNOSAT back-test passes)' },
      status: CN.status, retention: { naturalMm: c.s2_mm, dryMm: c.s1_mm, wetMm: c.s3_mm, currentMm: cnWet == null ? null : Math.round((25400 / cnWet - 254) * 10) / 10 } };
  }   /* MR: the model's own yearly root-zone range per tehsil (soil_model_range.py) */
  let S = load('wetness.json') || null, running = false, lastErr = null;
  const pool = () => units.tehsil.filter(u => !u.disputed && u.lat != null && u.lon != null);
  const batches = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
  const list = (x, b) => alignBatch(x, b);   /* v91.17.68 · aligned to the batch by coordinate (B10) */
  const ageH = () => S && S.at ? (Date.now() - Date.parse(S.at)) / 3600e3 : Infinity;

  function stateOf(ws) { return ws == null ? 'unknown' : ws >= 0.85 ? 'saturated' : ws >= 0.65 ? 'primed' : ws >= 0.4 ? 'moderate' : 'dry'; }
  function sensitivity(awsMm, p72) {
    if (p72 == null || awsMm == null) return { level: 'unknown', why: 'no forecast rain or no storage figure' };
    if (p72 < 10) return { level: 'low', why: 'under 10 mm forecast in 72 h' };
    const ratio = awsMm / p72;
    return ratio < 0.25 ? { level: 'very high', why: `the root zone can take ${Math.round(awsMm)} mm and ${Math.round(p72)} mm are forecast in 72 h` }
      : ratio < 0.5 ? { level: 'high', why: `${Math.round(awsMm)} mm of storage against ${Math.round(p72)} mm forecast` }
      : ratio < 1 ? { level: 'moderate', why: `${Math.round(awsMm)} mm of storage against ${Math.round(p72)} mm forecast` }
      : { level: 'low', why: `${Math.round(awsMm)} mm of storage against ${Math.round(p72)} mm forecast` };
  }
  function compute(u, h, nowIdx) {
    const sw = SW && SW.d && SW.d[u.unitId]; const sp = SP && SP.units && SP.units[u.unitId]; const mr = MR && MR.units && MR.units[u.unitId];
    /* the state is read against the MODEL'S OWN range at this place (its yearly p05-p95 of root-zone water): measured 23 Sep 2026,
       88 tehsils sat above the SoilGrids field capacity on a dry day (Rohri 0.25 against a sandy-loam FC of 0.21), the same
       soil-description mismatch the drought engine avoids with percentiles. The pedotransfer FC/WP stay for the millimetre
       figures of the real soil (AWC in the sponge table) and as a fallback where the model range is not built. */
    /* v91.17.68 · the SoilGrids fallback gets the same degeneracy guard as the model range (audit A10) */
    if (!mr && sw && sw.fc != null && sw.wp != null && sw.fc - sw.wp < 0.03) return { why: `SoilGrids field capacity ${sw.fc} and wilting point ${sw.wp} are too close to define a state here`, notDefined: true, basis: 'soilgrids' };
    if (mr && mr.p95 - mr.p05 < 0.03) return { why: `the model soil barely varies here (p05 ${mr.p05} to p95 ${mr.p95} m³/m³ over ${mr.days} days): no wetness state can be read, as the drought index is not defined in the arid belt`, notDefined: true, basis: 'model range' };
    const basis = mr ? { lo: mr.p05, hi: mr.p95, name: 'model range', text: `the model's own root-zone range here over ${mr.days} days (p05 ${mr.p05}, p95 ${mr.p95} m³/m³)` }
      : sw && sw.fc != null && sw.wp != null ? { lo: sw.wp, hi: sw.fc, name: 'soilgrids', text: `SoilGrids field capacity ${sw.fc} and wilting point ${sw.wp} (pedotransfer; the model may not share them; the model range is not built for this unit)` } : null;
    if (!basis) return { why: 'no soil-water range for this unit (neither the model range nor SoilGrids)' };
    const at = (k) => {
      let th = 0, n = 0, zsum = 0;
      for (const [v, z] of LAYERS) { const x = h[v] && h[v][k]; if (x == null) continue; th += x * z; zsum += z; n++; }
      if (n < 4 || zsum <= 0) return null;
      /* v91.17.68 · the depth-weighted mean over the layers that answered, not the sum over the full column (audit A3: a missing
         27-81 cm layer used to read as a third of the true water content, i.e. "dry") */
      const theta = th / zsum; return { theta: r2(theta), ws: r2(clamp01((theta - basis.lo) / (basis.hi - basis.lo))), awsMm: Math.round(Math.max(0, basis.hi - theta) * RZ) };
    };
    const now = at(nowIdx), d1 = at(Math.min(h.time.length - 1, nowIdx + 24)), d3 = at(Math.min(h.time.length - 1, nowIdx + 72));
    if (!now) return { why: 'the soil-moisture layers did not return for this unit' };
    /* v91.17.68 · a missing hour in a rain window is a missing window, not 0 mm (audit A9) */
    /* v91.17.157 · audit: liquid rain (precipitation minus snowfall water at the provider's 0.7 ratio) drives runoff; snow does not run off on
       the day. A window that runs past the series ends is incomplete and returns null instead of a short sum. */
    const P0 = h.precipitation || [], SN = h.snowfall || null; const P = P0.map((v, i) => v == null ? null : SN ? (SN[i] == null ? null : Math.max(0, v - SN[i] / 0.7)) : v);
    const sum = (a, b) => { if (a < 0 || b > P.length) return null; let s = 0; for (let i = a; i < b; i++) { if (P[i] == null) return null; s += P[i]; } return Math.round(s); };
    const p24 = sum(nowIdx, nowIdx + 24), p72 = sum(nowIdx, nowIdx + 72), past24 = sum(nowIdx - 24, nowIdx);
    const ssc = sp && sp.SSC != null ? sp.SSC : null; const es = ssc == null ? null : r2(ssc * (1 - now.ws));
    return { at: h.time[nowIdx], basis: basis.name, basisText: basis.text, rangeLo: basis.lo, rangeHi: basis.hi, fc: sw && sw.fc, wp: sw && sw.wp, texture: null, hsg: sp && sp.hsg, awcMm: null,
      now: { ...now, state: stateOf(now.ws) }, plus24h: d1 ? { ...d1, state: stateOf(d1.ws) } : null, plus72h: d3 ? { ...d3, state: stateOf(d3.ws) } : null,
      rain: { past24Mm: past24, next24Mm: p24, next72Mm: p72 },
      ssc, effectiveSponge: es, excessProxyMm: (es == null || p72 == null) ? null : Math.round(p72 * (1 - es)),
      curveNumber: curveNumber(u.unitId, now.ws, p24, p72),   /* v91.17.60 */
      sensitivity: sensitivity(now.awsMm, p72),
      trend: d3 && now ? (d3.ws - now.ws >= 0.1 ? 'wetting' : d3.ws - now.ws <= -0.1 ? 'drying' : 'steady') : null };
  }
  async function run() {
    if (running) return { started: false, why: 'already running' };
    if (!provider.configured()) return { started: false, why: 'no paid provider key' };
    running = true; const t0 = Date.now(); const out = { at: null, units: {}, failedUnits: 0 };
    try {
      for (const b of batches(pool(), 50)) {
        let res;
        try { res = list(await provider.call('forecast', '/v1/forecast', { latitude: b.map(u => u.lat), longitude: b.map(u => u.lon), elevation: b.map(u => u.elevM ?? 'nan'), hourly: LAYERS.map(l => l[0]).concat(['precipitation', 'snowfall']).join(','), past_days: 1, forecast_days: 4, timezone: 'UTC', models: 'ecmwf_ifs' }, { locations: b.length, timeoutMs: 90000 }), b); }
        catch (e) { out.failedUnits += b.length; lastErr = e.message; continue; }
        b.forEach((u, i) => {
          const h = res[i] && res[i].hourly; if (!h || !h.time) { out.failedUnits++; return; }
          const nowIso = new Date().toISOString().slice(0, 13); let k = h.time.findIndex(t => t.slice(0, 13) >= nowIso); if (k < 0) k = Math.max(0, h.time.length - 73);
          out.units[u.unitId] = compute(u, h, k);
        });
      }
      out.at = new Date().toISOString(); out.seconds = Math.round((Date.now() - t0) / 1000);
      const nNew = Object.keys(out.units).length, nPrev = S && S.units ? Object.keys(S.units).length : 0;   /* v91.17.157 · audit: partial-run guard */
      if (nNew && nPrev && nNew < 0.9 * nPrev && S.at && (Date.now() - Date.parse(S.at)) / 3600e3 < 24) { lastErr = 'partial run kept aside: ' + nNew + ' of ' + nPrev + ' tehsils'; console.log('  wetness    ' + lastErr); return { started: true, units: nNew, keptAside: true }; }
      if (Object.keys(out.units).length) { S = out; try { writeFileSync(file + '.tmp', JSON.stringify(out)); renameSync(file + '.tmp', file); } catch (_) {} lastErr = null; }
      console.log(`  wetness    ${Object.keys(out.units).length} tehsils, ${out.failedUnits} failed, ${out.seconds}s`);
      return { started: true, units: Object.keys(out.units).length };
    } finally { running = false; }
  }
  let asideAt = 0;   /* v91.17.161 · after a kept-aside partial run, wait an hour before asking again (it re-asked every 10 min) */
  function tick() { if (process.env.NIGRAAN_WETNESS === '0' || !provider.configured()) return; if (Date.now() - asideAt < 3600e3) return; if (ageH() >= 6 && !running) run().then((r) => { if (r && r.keptAside) asideAt = Date.now(); }).catch(e => { lastErr = e.message; }); }
  /* v91.17.153 · SATELLITE CHECK. The model's surface soil water against NASA SMAP (9 km, 3x3 pixels at the tehsil point), Jun-Sep 2025:
     median r 0.59 (Punjab 0.70, Sindh 0.65, Khyber Pakhtunkhwa 0.59; Balochistan 0.28, Gilgit-Baltistan 0.22), median bias +0.02 m3/m3.
     Each tehsil carries its own r, so a state that the satellite does not follow there is read with care. */
  let SC = null; try { SC = JSON.parse(readFileSync(join(dataDir, 'smap-check.json'), 'utf8')); } catch (_) { SC = null; }
  const sat = (unitId) => { const c = SC && SC.units && SC.units[unitId]; return c ? { r: c.r, period: SC.summary.period, agreement: c.r >= 0.6 ? 'follows the satellite' : c.r >= 0.4 ? 'partly follows the satellite' : 'does not follow the satellite here: read with care', source: 'satellite soil moisture, 9 km' } : null; };
  function of(unitId) { const r = S && S.units && S.units[unitId]; if (!r) return null; const L = landBlock(dataDir, unitId); const sc = sat(unitId); return { at: S.at, ...r, ...(L ? { antecedentLand: L } : {}), ...(sc ? { satelliteCheck: sc } : {}), ...((app && app.smap && app.smap.unit(unitId)) ? { nearSurface: app.smap.unit(unitId) } : {}) }; }
  /* v91.17.172 · audit E-4 · a reader of the state (report, outlook, site card, AI) takes it only while the soil-water run is
     at most CURRENT_H old (the job re-runs every 6 h); an older run is reported as stale with its time, never printed as now */
  const CURRENT_H = 9;
  function current(unitId, maxH = CURRENT_H) { const a = ageH(); if (!(a <= maxH)) return null; return of(unitId); }
  function staleNote(maxH = CURRENT_H) { const a = ageH(); if (a <= maxH) return null; return { stale: true, at: (S && S.at) || null, ageH: Number.isFinite(a) ? Math.round(a * 10) / 10 : null, maxAgeH: maxH, why: S && S.at ? 'the soil-water run is ' + Math.round(a) + ' h old (more than ' + maxH + ' h); the catchment wetness is not shown as current' : 'the soil-water run has not completed' }; }
  function national() {
    if (!S || !S.units) return { ready: false, why: lastErr || 'the wetness job has not run (it needs the paid provider key)' };
    const rows = []; const counts = { saturated: 0, primed: 0, moderate: 0, dry: 0, notDefined: 0, unknown: 0 }; const sens = {};
    for (const u of units.tehsil) { const r = S.units[u.unitId]; if (r && r.notDefined) { counts.notDefined++; continue; } if (!r || !r.now) { counts.unknown++; continue; } counts[r.now.state]++; sens[r.sensitivity.level] = (sens[r.sensitivity.level] || 0) + 1;
      rows.push({ unitId: u.unitId, key: u.key, name: u.name, district: u.district, province: u.province, basis: r.basis, ws: r.now.ws, state: r.now.state, awsMm: r.now.awsMm, ws72: r.plus72h ? r.plus72h.ws : null, trend: r.trend, ssc: r.ssc, effectiveSponge: r.effectiveSponge, next72Mm: r.rain.next72Mm, past24Mm: r.rain.past24Mm, excessProxyMm: r.excessProxyMm, sensitivity: r.sensitivity.level, hsg: r.hsg, ...((L) => L ? { landRootZonePct: L.rootZonePct, landSnowMm: L.snowWaterMm, landSnowChange7dMm: L.snowChange7dMm } : {})(landBlock(dataDir, u.unitId)) }); }
    const order = { 'very high': 0, high: 1, moderate: 2, low: 3, unknown: 4 };
    rows.sort((a, b) => order[a.sensitivity] - order[b.sensitivity] || (b.ws ?? 0) - (a.ws ?? 0));
    return { ready: true, at: S.at, ageH: Math.round(ageH() * 10) / 10, stale: ageH() > 9, units: rows.length, counts, sensitivity: sens, rows,
      method: 'WS = (θ_rz − lo)/(hi − lo) over 0–81 cm from the provider soil-moisture layers, lo/hi = the model\'s own yearly p05/p95 of root-zone water at the tehsil (soil-model-range.json; SoilGrids WP/FC only where that is not built); AWS = (hi − θ_rz) × 810 mm; ES = SSC × (1 − WS) with SSC from sponge-tehsil.json; excess ≈ P72 × (1 − ES) (linear stand-in until the curve number); FC/WP per tehsil from SoilGrids texture (Saxton & Rawls)',
      caveat: 'a state description from a model soil-moisture field: no soil-moisture gauge exists in the PMD lake to verify it; SSC weights are starting values; the forecast wetness at +24/+72 h is the model\'s own. Sensitivity compares storage to forecast rain and is not a flood probability.' };
  }
  function status() { const LR = recentLand(dataDir); return { antecedentLand: LR ? { through: LR.to, built: LR.built, units: Object.keys(LR.units || {}).length, climatology: LR.climatology && LR.climatology.period } : null, ready: !!(S && S.units), at: S && S.at, units: S ? Object.keys(S.units).length : 0, ageH: S ? Math.round(ageH() * 10) / 10 : null, running, lastError: lastErr, sponge: V2 ? { built: V2.built, version: V2.version, units: Object.keys(SP.units).length, source: 'data/sponge-tehsil.v2.json' } : null, curveNumber: CN ? { built: CN.built, units: Object.keys(CN.units || {}).length, lambda: LAMBDA, status: CN.status } : null }; }
  /* the curve number for any point: the containing / nearest tehsil's table row, with runoff for a given rain (mm) */
  function cnAt(unitId, pMm, ws = null) { return curveNumber(unitId, ws, pMm, pMm); }
  return { run, tick, of, current, staleNote, national, status, cnAt, curveNumber };
}
