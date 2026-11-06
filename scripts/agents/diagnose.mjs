/* == v91.17.283.10 . AGENT 5: DIAGNOSTIC ("what is causing it"; daily 06:50 PKT, a child process of the server; server/api/agents.mjs) ===
   When the verification agent (verify.mjs) flags drift or a persistent error, this agent finds WHERE it comes from. It automates the
   hand-made bias trace of 22 Oct 2026 (/tmp/claude-0/biastrace: replay_bt*.mjs and the per-step breakdown t4.py) and the station checks.
   It writes candidates with their evidence; it NEVER acts on them. v91.17.283.14 (owner decision 24 Oct 2026): there is no station
   list to add to - every value is judged by server/api/obsqc.mjs, and a sensor that is off but steady loses its values there by itself.
   This agent reports, per station and variable, the share of hourly values failing and which check fails them ("values failing X % of
   hours"), with a site-check suggestion; the station offsets below are measured on the values that pass the station's own checks
   (range, series, internal consistency), not the neighbour checks, so a steady offset stays visible. It never changes a served value.
   WHAT IT LOOKS AT (the last 30 Pakistan days to yesterday; every interval a 95 % day-block bootstrap, 2,000 draws, fixed seed)
     1 STEPS     temperature error after each step of the served chain, per zone x urban/rural x hour block (and per station):
                   best_match -> start (the multi-model mix where the gate mixes it) -> static calibration -> national residual model ->
                   weather MOS -> served (the chain up to the synoptic running term, which the fleet pairs measure)
                 sources: (a) the fleet pairs at the MACH stations (station-lake/archive/fleet: fleet_pairs_* = start and served,
                 fleet_pairs_basis_* = best_match and start, and from v91.17.283.10 fleet_pairs_steps_* = every step, written by the
                 fleet pairing outside the request path); (b) the chain replays the operator lists in data/agents/diagnose/sources.json
                 (the replay tool's step modes raw / nonatwx / nowx / full against a daily Tmin / Tmax truth; scripts/agents/
                 diagnose_replay.py). A step is RESPONSIBLE where its change of the error has a 95 % interval that excludes 0, stays
                 significant after Benjamini-Hochberg at 5 % over every step test of that source, moves the bias away from 0 AND raises the mean absolute
                 error (its interval above 0), and moves it by at least the stations' 0.1 C resolution: the step makes the forecast worse
                 there, not merely different.
     2 STATIONS  per station (all networks), the error of the issued tehsil forecast moved to
                 the station height (verify.mjs matching), leads 0-2 averaged per hour. A NON-REPRESENTATIVE candidate: its daily offset
                 against its three nearest same-zone stations AND against the rest of its zone both have 95 % intervals excluding 0, the
                 neighbour test survives Benjamini-Hochberg at 5 % over all stations, and the offset is larger than the forecast's own mean
                 absolute error in that zone: persistent (the interval), isolated (neighbours and zone do not share it) and large (the
                 site disagrees with its area by more than the forecast usually misses).
                 SENSORS: the same test on humidity; a network's hygrometers against the standard-exposure networks (synoptic and
                 airport) under the same forecast; frozen days (a whole day of identical hourly values); readings the MACH stuck /
                 replay / jump / frozen / array-silent screen removed (Tukey outliers of the share); a diurnal range shrunk against the
                 neighbours (a shielded or indoor sensor); a time-stamp offset: the lag (-6..+6 h; more than 1 h) that best aligns the station's mean
                 diurnal cycle with its three nearest stations', when it differs from its zone's usual lag in at least 95 % of day resamples.
     3 HEAT      the observed-UTCI inputs by network (the heatskill finding): how much the measured humidity lifts the observed day-peak
                 UTCI against the forecast humidity, per network and against the standard networks; what the low-mast wind would do.
     4 FLAGS     each verification drift flag and each persistent bias cell (bias interval excluding 0) is linked to its causes: the
                 responsible step of the same zone / urban / variable, and whether one station alone drives it (leave-one-station-out:
                 without it the interval includes 0).
   OUTPUT  data/agents/diagnose/YYYY-MM-DD.json (the day's diagnosis; 400 kept) and latest.json; each item: the step or station
           responsible, its size with the interval, the evidence, and a suggested next test stated as a HYPOTHESIS for the experimentation
           agent or the owner (never an action). A plain-language summary from a template (no language model). No network code.
   usage: node scripts/agents/diagnose.mjs --app <nigraan-local> --data <dir> --copies <dir> [--lake <station-lake>] [--day YYYY-MM-DD]
          [--window 30] [--sources <sources.json>] [--force]                                 exit 0 done, 5 another copy running */
import { readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { args, readJson, writeJsonAtomic, quantile, median, mean, fin, pktDay, pktHour, dayStartMs, addDays, pktText, takeLock, agentLog, readCsv, utcMs, num, rng, r1, r2, r3 } from './lib.mjs';
import { loadStations, loadForecasts, loadObs, utciInRange, dailyExtremes, LAPSE_K_PER_M, DAY_MIN_HOURS, HEAT_TRUTH_NETS, TEN_M_WIND_NETS, WINDOW, RECENT, MIN_REF_DAYS, urbanGrid, URBAN_POP_KM2 } from './verify.mjs';
import { candidateFor } from './exp_registry.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const API = join(HERE, '..', '..', 'server', 'api');
export const DIAG_KEEP_DAYS = 400;
export const K_NEIGHBOURS = 3;          /* the three nearest same-zone stations: the smallest set whose median survives one odd neighbour */
export const BOOT = 2000, FDR = 0.05;   /* the verification agent's bootstrap size and false-discovery rate */
export const TUKEY_K = 1.5;   /* Tukey's fences (Tukey 1977) */
export const LAG_MAX_H = 6;             /* time-stamp offsets looked for: -6..+6 h (a clock slip is whole hours; UTC logged as PKT is 5 h) */
export const LAG_PHYS_H = 1;            /* nearby sites differ in diurnal phase by up to about an hour (slope aspect, sea breeze, valley
                                           winds), so a 1 h shift cannot be told from a clock slip: shown in the table, never a candidate */
export const LAG_RESAMPLES = 400, LAG_STABLE = 0.95;
export const STEP_MIN_DAYS = RECENT;    /* a step group is assessed from 7 days (the drift test's recent window) */
export const OBS_RESOLUTION_C = 0.1;    /* the stations report temperature to 0.1 C: a step that moves the error by less is below what they can resolve */
export const HOUR_BLOCK_H = 3;          /* 8 blocks of 3 h, Pakistan time */
export const STEP_NAMES = { raw: 'best_match (raw model)', start: 'start (multi-model mix where the gate mixes it)', calibration: 'static calibration', national: 'national residual model', static: 'static chain (calibration, national model, humidity)', wxmos: 'weather MOS', tdown: 'downscaling (B2/B5)', synop: 'synoptic running term', served: 'served', final: 'weather MOS (the replay\'s full chain)' };
const UNIT = { T: '°C', TN: '°C', TX: '°C', RH: '%' };
const VNAME = { T: 'temperature (hourly)', TN: 'night minimum', TX: 'daily maximum', RH: 'humidity (hourly)' };
const ZNAME = { plains: 'Plains', hills: 'Hills', mountain: 'Mountains', coast: 'Coast', all: 'All zones' };
const NETNAME = { mach: 'MACH', metar: 'airport (METAR)', synop: 'synoptic (PMD)', aws: 'AWS (partner network)', pmd: 'PMD', isd: 'ISD synoptic', syn: 'synoptic' };

/* ---------------------------------------------------------------------------------------------------------------------------- */
/* statistics: day-block bootstrap of a mean (blocks: {day, num, den}); two-sided p of the mean against 0 from the bootstrap draws */
export function bootMean(blocks, seed = 20261023, B = BOOT) {
  const b = blocks.filter((x) => x && x.den > 0); if (!b.length) return null;
  const n = b.reduce((a, x) => a + x.den, 0), v = b.reduce((a, x) => a + x.num, 0) / n;
  if (b.length < 2) return { v, ci: null, p: 1, n, days: b.length };
  const R = rng(seed), d = new Float64Array(B);
  for (let i = 0; i < B; i++) { let s = 0, m = 0; for (let j = 0; j < b.length; j++) { const x = b[Math.floor(R() * b.length)]; s += x.num; m += x.den; } d[i] = s / m; }
  const arr = Array.from(d); let lo = 0, hi = 0; for (const x of arr) { if (x <= 0) lo++; if (x >= 0) hi++; }
  const p = Math.min(1, 2 * Math.min((lo + 1) / (B + 1), (hi + 1) / (B + 1)));
  return { v, ci: [quantile(arr, 0.025), quantile(arr, 0.975)], p, n, days: b.length };
}
export const excludes0 = (s) => !!(s && s.ci && (s.ci[0] > 0 || s.ci[1] < 0));
/* Benjamini-Hochberg: the largest p that passes at rate q over the family (null: none) */
export function bhCut(ps, q = FDR) { const s = ps.filter(fin).slice().sort((a, b) => a - b); const m = s.length; let cut = null; s.forEach((p, i) => { if (p <= q * (i + 1) / m) cut = p; }); return cut; }
export function tukeyFences(vals, k = TUKEY_K) { const q1 = quantile(vals, 0.25), q3 = quantile(vals, 0.75); if (q1 == null) return null; const iqr = q3 - q1; return { lo: q1 - k * iqr, hi: q3 + k * iqr, q1, q3 }; }
const km = (a, b) => { const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLon = (b.lon - a.lon) * Math.PI / 180; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };
const sgn = (x) => (x > 0 ? '+' : '') + r2(x);
const ciTxt = (ci) => ci ? '[' + sgn(ci[0]) + ', ' + sgn(ci[1]) + ']' : '[no interval]';
const sizeOf = (s, unit) => s ? { value: r2(s.v), ci: s.ci ? s.ci.map(r2) : null, unit, n: s.n, days: s.days, p: s.p == null ? null : r3(s.p) } : null;
const idOf = (...a) => createHash('sha1').update(a.join('|')).digest('hex').slice(0, 10);
const hourBlock = (pkH) => Math.floor(pkH / HOUR_BLOCK_H);
const blockName = (b) => String(b * HOUR_BLOCK_H).padStart(2, '0') + '-' + String((b + 1) * HOUR_BLOCK_H).padStart(2, '0') + ' PKT';
export const NIGHT_BLOCKS = [0, 1, 7];   /* 21-06 PKT: the hours that set the night minimum */

/* hourly values: the reading nearest the top of each UTC hour within 15 min (verify.mjs NEAREST_MIN, the same rule) */
function hourly(rows, h0, h1) { const H = new Map(); let j = 0;
  for (let h = h0; h < h1; h += 3600e3) { while (j < rows.length && rows[j].ms < h - 15 * 6e4) j++; let best = null;
    for (let k = j; k < rows.length && rows[k].ms <= h + 15 * 6e4; k++) { const r = rows[k]; if (r.bad) continue; if (!best || Math.abs(r.ms - h) < Math.abs(best.ms - h)) best = r; }
    if (best) H.set(h, best); }
  return H; }
const daysBetween = (a, b) => { const o = []; for (let d = a; d <= b; d = addDays(d, 1)) o.push(d); return o; };

/* ---------------------------------------------------------------------------------------------------------------------------- */
/* 2 · per station: hourly and daily errors of the issued tehsil forecast (leads 0-2 averaged per hour), the observed series */
export function stationErrors(stations, FC, OB, days) {
  const zoneOf = new Map(); for (const m of FC.values()) for (const [u, r] of m) if (r.z && !zoneOf.has(u)) zoneOf.set(u, r.z);
  const out = new Map();
  for (const s of stations) {
    const rows = OB.byPid.get(s.pid) || []; if (!rows.length || !s.uid) continue; const zone = zoneOf.get(s.uid); if (!zone) continue;
    const st = { pid: s.pid, net: s.net, name: s.name, lat: s.lat, lon: s.lon, zone, uid: s.uid, urban: s.urban, elevM: s.elevM, days: new Map(), bad: rows.filter((r) => r.bad).length, readings: rows.length };
    for (const D of days) {
      const d0 = dayStartMs(D), d1 = d0 + 864e5, H = hourly(rows, d0, d1); if (!H.size) continue;
      const rec = { T: [0, 0], RH: [0, 0], Tabs: 0, RHabs: 0, obsT: new Array(24).fill(null), fcT: new Array(24).fill(null), obsRH: new Array(24).fill(null), fcRH: new Array(24).fill(null), byBlock: new Map() };
      const lead = [0, 1, 2].map((L) => { const f = (FC.get(addDays(D, -L)) || new Map()).get(s.uid); if (!f) return null; let cov = 0; for (let h = d0; h < d1; h += 3600e3) { const i = Math.round((h - f.t0) / 3600e3); if (i >= 0 && i < f.n) cov++; } return cov >= DAY_MIN_HOURS ? f : null; });
      const tn = [], tx = [];
      for (let k = 0; k < 24; k++) { const h = d0 + k * 3600e3; const o = H.get(h);
        const fT = [], fR = []; for (const f of lead) { if (!f) continue; const i = Math.round((h - f.t0) / 3600e3); if (i < 0 || i >= f.n) continue;
          const adj = fin(s.elevM) && fin(f.sel) ? -LAPSE_K_PER_M * (s.elevM - f.sel) : 0; if (f.T && f.T[i] != null) fT.push(f.T[i] / 10 + adj); if (f.RH && f.RH[i] != null) fR.push(f.RH[i]); }
        const ft = fT.length ? mean(fT) : null, fr = fR.length ? mean(fR) : null; rec.fcT[k] = ft; rec.fcRH[k] = fr;
        if (!o) continue; if (fin(o.T)) rec.obsT[k] = o.T; if (fin(o.RH)) rec.obsRH[k] = o.RH;
        if (fin(ft) && fin(o.T)) { rec.T[0] += ft - o.T; rec.T[1]++; rec.Tabs += Math.abs(ft - o.T); const b = hourBlock((k + 0) % 24); const a = rec.byBlock.get(b) || [0, 0]; a[0] += ft - o.T; a[1]++; rec.byBlock.set(b, a); }
        if (fin(fr) && fin(o.RH)) { rec.RH[0] += fr - o.RH; rec.RH[1]++; rec.RHabs += Math.abs(fr - o.RH); } }
      /* daily minimum and maximum (at least DAY_MIN_HOURS hours on both sides, like for like), per lead and averaged over the leads */
      const oT = rec.obsT.filter(fin); if (oT.length >= DAY_MIN_HOURS) { rec.obsTN = Math.min(...oT); rec.obsTX = Math.max(...oT); rec.dtr = rec.obsTX - rec.obsTN; rec.frozenT = rec.dtr === 0; }
      const oR = rec.obsRH.filter(fin); if (oR.length >= DAY_MIN_HOURS) rec.frozenRH = Math.max(...oR) === Math.min(...oR) && oR[0] < 100;
      /* v91.17.283.24 · J16 · the errors of the daily extremes on the same hours both sides (verify.mjs dailyExtremes, one rule) */
      { for (const f of lead) { if (!f) continue; const adj = fin(s.elevM) && fin(f.sel) ? -LAPSE_K_PER_M * (s.elevM - f.sel) : 0; const pairs = [];
          for (let k = 0; k < 24; k++) { const h = d0 + k * 3600e3, i = Math.round((h - f.t0) / 3600e3); if (i >= 0 && i < f.n && f.T && f.T[i] != null && fin(rec.obsT[k])) pairs.push([f.T[i] / 10 + adj, rec.obsT[k]]); }
          const X = dailyExtremes(pairs); if (X) { tn.push(X.fTN - X.oTN); tx.push(X.fTX - X.oTX); } }
        if (tn.length) { rec.TN = mean(tn); rec.TX = mean(tx); } }
      st.days.set(D, rec); }
    if (st.days.size) out.set(s.pid, st); }
  return out;
}
/* note: hours of the day k are UTC hours from 00 PKT (d0 = 00:00 PKT), so k is the Pakistan hour itself */

const absErr = (rec, v) => v === 'T' ? (rec.T[1] ? [rec.Tabs, rec.T[1]] : null) : v === 'RH' ? (rec.RH[1] ? [rec.RHabs, rec.RH[1]] : null) : (v === 'TN' || v === 'TX') && fin(rec[v]) ? [Math.abs(rec[v]), 1] : null;
const dayErr = (rec, v) => v === 'T' ? (rec.T[1] ? rec.T[0] / rec.T[1] : null) : v === 'RH' ? (rec.RH[1] ? rec.RH[0] / rec.RH[1] : null) : v === 'TN' ? (fin(rec.TN) ? rec.TN : null) : v === 'TX' ? (fin(rec.TX) ? rec.TX : null) : null;

/* the K nearest same-zone stations with data (any network; never the station itself) */
export function neighboursOf(st, all, k = K_NEIGHBOURS) {
  return [...all.values()].filter((o) => o.pid !== st.pid && o.zone === st.zone).map((o) => ({ o, km: km(st, o) })).sort((a, b) => a.km - b.km).slice(0, k); }

/* the persistent-and-isolated test of one variable over all stations */
export function isolationTest(SE, v, seed0 = 500) {
  const res = []; let seed = seed0;
  for (const st of SE.values()) {
    const nb = neighboursOf(st, SE); if (!nb.length) continue; const zoneMates = [...SE.values()].filter((o) => o.pid !== st.pid && o.zone === st.zone);
    const nbB = [], znB = [], ownB = [];
    for (const [D, rec] of st.days) { const e = dayErr(rec, v); if (!fin(e)) continue; ownB.push({ day: D, num: e, den: 1 });
      const ne = nb.map((x) => x.o.days.get(D)).filter(Boolean).map((r) => dayErr(r, v)).filter(fin); if (ne.length) nbB.push({ day: D, num: e - mean(ne), den: 1 });
      const ze = zoneMates.map((o) => o.days.get(D)).filter(Boolean).map((r) => dayErr(r, v)).filter(fin); if (ze.length) znB.push({ day: D, num: e - mean(ze), den: 1 }); }
    if (ownB.length < MIN_REF_DAYS || nbB.length < MIN_REF_DAYS) continue;
    res.push({ st, own: bootMean(ownB, seed++), nb: bootMean(nbB, seed++), zn: znB.length >= MIN_REF_DAYS ? bootMean(znB, seed++) : null, neighbours: nb.map((x) => ({ pid: x.o.pid, name: x.o.name, km: r1(x.km), net: x.o.net })) }); }
  /* large: the persistent offset against the neighbours is larger than the forecast's own typical error in that zone (the zone's mean
     absolute error over the same window and stations): the site disagrees with its area by more than the
     forecast usually misses it, so the site, not the forecast, is the first suspect */
  const cut = bhCut(res.map((r) => r.nb.p)); const fences = {};
  for (const z of new Set(res.map((r) => r.st.zone))) { let a = 0, n = 0; for (const st of SE.values()) { if (st.zone !== z) continue; for (const rec of st.days.values()) { const m = absErr(rec, v); if (m) { a += m[0]; n += m[1]; } } } fences[z] = n ? { mae: a / n, n } : null; }
  for (const r of res) { const F = fences[r.st.zone]; r.fence = F; r.candidate = !!(F && cut != null && r.nb.p <= cut && excludes0(r.nb) && excludes0(r.own) && Math.sign(r.nb.v) === Math.sign(r.own.v) && r.zn && excludes0(r.zn) && Math.sign(r.nb.v) === Math.sign(r.zn.v) && Math.abs(r.nb.v) > F.mae); }
  return { tested: res.length, fences: Object.fromEntries(Object.entries(fences).filter(([, F]) => F).map(([z, F]) => [z, { zoneMae: r2(F.mae), n: F.n }])), bhCut: cut, rows: res };
}

/* the diurnal range against the neighbours: log of the station's daily range over the neighbours' mean range */
export function dtrTest(SE, seed0 = 900) {
  const res = []; let seed = seed0;
  for (const st of SE.values()) { const nb = neighboursOf(st, SE); const B = [];
    for (const [D, rec] of st.days) { if (!(rec.dtr > 0)) continue; const nd = nb.map((x) => x.o.days.get(D)).filter((r) => r && r.dtr > 0).map((r) => r.dtr); if (!nd.length) continue; B.push({ day: D, num: Math.log(rec.dtr / mean(nd)), den: 1 }); }
    if (B.length < MIN_REF_DAYS) continue; res.push({ st, s: bootMean(B, seed++), neighbours: nb.map((x) => x.o.name) }); }
  const cut = bhCut(res.map((r) => r.s.p)); const F = tukeyFences(res.map((r) => r.s.v));
  for (const r of res) r.candidate = !!(F && cut != null && r.s.p <= cut && excludes0(r.s) && r.s.v < F.lo);   /* only a SHRUNK range is a sensor sign */
  return { tested: res.length, rows: res };
}

/* time-stamp offset: the lag that best aligns the station's mean diurnal cycle (anomalies from each day's mean) with that of its three
   nearest same-zone stations (measured, so the forecast's own phase error does not enter) */
function bestLag(dayList) {
  const O = new Array(24).fill(0), Fc = new Array(24).fill(0), n = new Array(24).fill(0);
  for (const r of dayList) { const ok = []; for (let k = 0; k < 24; k++) if (fin(r.obsT[k]) && fin(r.fcT[k])) ok.push(k); if (ok.length < DAY_MIN_HOURS) continue;
    const mo = mean(ok.map((k) => r.obsT[k])), mf = mean(ok.map((k) => r.fcT[k])); for (const k of ok) { O[k] += r.obsT[k] - mo; Fc[k] += r.fcT[k] - mf; n[k]++; } }
  if (n.some((x) => !x)) return null; for (let k = 0; k < 24; k++) { O[k] /= n[k]; Fc[k] /= n[k]; }
  let best = null; for (let L = -LAG_MAX_H; L <= LAG_MAX_H; L++) { let sxy = 0, sxx = 0, syy = 0; for (let k = 0; k < 24; k++) { const x = O[(k + L + 24) % 24], y = Fc[k]; sxy += x * y; sxx += x * x; syy += y * y; }
    const c = sxy / Math.sqrt(sxx * syy || 1); if (!best || c > best.c) best = { lag: L, c }; }
  return best; }
export function lagTest(SE, seed = 1300) {
  const R = rng(seed); const rows = [];
  for (const st of SE.values()) { const nb = neighboursOf(st, SE); const dl = [];
    for (const [D, r] of st.days) { const ref = new Array(24).fill(null); for (let k = 0; k < 24; k++) { const v = nb.map((x) => x.o.days.get(D)).filter(Boolean).map((q) => q.obsT[k]).filter(fin); if (v.length) ref[k] = mean(v); } dl.push({ obsT: r.obsT, fcT: ref }); }
    if (dl.length < MIN_REF_DAYS) continue; const b = bestLag(dl); if (!b) continue;
    const boots = []; for (let i = 0; i < LAG_RESAMPLES; i++) { const s = []; for (let j = 0; j < dl.length; j++) s.push(dl[Math.floor(R() * dl.length)]); const x = bestLag(s); if (x) boots.push(x.lag); }
    rows.push({ st, lag: b.lag, corr: r3(b.c), boots }); }
  const zoneMode = {}; for (const z of new Set(rows.map((r) => r.st.zone))) { const c = {}; for (const r of rows.filter((x) => x.st.zone === z)) c[r.lag] = (c[r.lag] || 0) + 1; zoneMode[z] = Number(Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]); }
  for (const r of rows) { const m = zoneMode[r.st.zone]; r.zoneLag = m; r.stable = r.boots.length ? r.boots.filter((x) => x === r.lag).length / r.boots.length : 0; r.phaseOnly = r.lag !== m && Math.abs(r.lag - m) <= LAG_PHYS_H; r.candidate = Math.abs(r.lag - m) > LAG_PHYS_H && r.stable >= LAG_STABLE; delete r.boots; }
  return { tested: rows.length, zoneLag: zoneMode, rows };
}

/* a network's hygrometers against the standard-exposure networks under the same forecast: per day, the network's mean RH error minus the
   standard networks' mean RH error in the same zones (weighted by the network's hours), day hours (09-18 PKT) and all hours */
export function networkHumidity(SE, nets = ['mach', 'aws'], ref = HEAT_TRUTH_NETS, seed = 1700) {
  const out = {}; const days = [...new Set([...SE.values()].flatMap((s) => [...s.days.keys()]))].sort();
  for (const net of nets) { out[net] = {};
    for (const span of ['day', 'all']) { const hrs = span === 'day' ? [9, 10, 11, 12, 13, 14, 15, 16, 17] : [...Array(24).keys()]; const B = [], own = [], std = [];
      for (const D of days) { const acc = {}; for (const st of SE.values()) { const r = st.days.get(D); if (!r) continue; const isNet = st.net === net, isRef = ref.includes(st.net); if (!isNet && !isRef) continue;
          for (const k of hrs) { if (!fin(r.obsRH[k]) || !fin(r.fcRH[k])) continue; const a = acc[st.zone] || (acc[st.zone] = { n: [0, 0], r: [0, 0] }); const e = r.fcRH[k] - r.obsRH[k]; if (isNet) { a.n[0] += e; a.n[1]++; } else { a.r[0] += e; a.r[1]++; } } }
        let num = 0, den = 0, on = 0, oc = 0, rn = 0, rc = 0; for (const a of Object.values(acc)) { if (!a.n[1] || !a.r[1]) continue; num += (a.n[0] / a.n[1] - a.r[0] / a.r[1]) * a.n[1]; den += a.n[1]; on += a.n[0]; oc += a.n[1]; rn += a.r[0]; rc += a.r[1]; }
        if (den) { B.push({ day: D, num, den }); own.push({ day: D, num: on, den: oc }); std.push({ day: D, num: rn, den: rc }); } }
      out[net][span] = { diff: bootMean(B, seed++), net: bootMean(own, seed++), ref: bootMean(std, seed++) }; } }
  return out;
}

/* 3 · heat: the observed day-peak UTCI with the measured humidity against the same with the forecast humidity (same temperature and wind
   rule as the verification's heat truth), per network; and, at the low-mast networks, the station's own wind against the served 10 m wind */
export function heatInputs(SE, OB, FC, U, seed = 2100) {
  const byNet = {}; const days = [...new Set([...SE.values()].flatMap((s) => [...s.days.keys()]))].sort();
  const servedAt = (uid, D, field) => { for (let L = 0; L <= 4; L++) { const f = (FC.get(addDays(D, -L)) || new Map()).get(uid); if (!f || !f[field]) continue; return (h) => { const i = Math.round((h - f.t0) / 3600e3); return i >= 0 && i < f.n && f[field][i] != null ? f[field][i] : null; }; } return null; };
  for (const st of SE.values()) { const rows = OB.byPid.get(st.pid) || []; if (!rows.length) continue;
    for (const D of days) { if (!st.days.has(D)) continue; const d0 = dayStartMs(D), H = hourly(rows, d0, d0 + 864e5); const fRH = servedAt(st.uid, D, 'RH'), fW = servedAt(st.uid, D, 'W'); if (!fRH) continue;
      let pObs = null, pFc = null, pMast = null, hrs = 0;
      for (const [h, r] of H) { if (!fin(r.T) || !fin(r.RH)) continue; const fr = fRH(h); if (!fin(fr)) continue; let w;
        if (TEN_M_WIND_NETS.has(st.net)) w = fin(r.W) ? Math.max(0.5, r.W / 3.6) : 0.5; else { const fw = fW ? fW(h) : null; if (!fin(fw)) continue; w = Math.max(0.5, fw / 3.6); }
        const a = utciInRange(U, r.T, w, r.RH), b = utciInRange(U, r.T, w, fr); if (!fin(a) || !fin(b)) continue; hrs++; if (pObs == null || a > pObs) pObs = a; if (pFc == null || b > pFc) pFc = b;
        if (!TEN_M_WIND_NETS.has(st.net) && fin(r.W)) { const m = utciInRange(U, r.T, Math.max(0.5, r.W / 3.6), r.RH); if (fin(m) && (pMast == null || m > pMast)) pMast = m; } }
      if (hrs < (st.net === 'synop' ? 6 : DAY_MIN_HOURS)) continue; const N = byNet[st.net] || (byNet[st.net] = { hum: new Map(), mast: new Map(), stations: new Set() }); N.stations.add(st.pid);
      const a = N.hum.get(D) || { day: D, num: 0, den: 0 }; a.num += pObs - pFc; a.den++; N.hum.set(D, a);
      if (pMast != null) { const m = N.mast.get(D) || { day: D, num: 0, den: 0 }; m.num += pMast - pObs; m.den++; N.mast.set(D, m); } } }
  const out = {}; for (const [net, N] of Object.entries(byNet)) out[net] = { stations: N.stations.size, humidityLift: bootMean([...N.hum.values()], seed++), mastWindLift: N.mast.size ? bootMean([...N.mast.values()], seed++) : null };
  /* the contrast against the standard-exposure networks: per day, the network's mean lift minus the standard networks' mean lift */
  const ref = (D) => { let s = 0, n = 0; for (const r of HEAT_TRUTH_NETS) { const x = byNet[r] && byNet[r].hum.get(D); if (x) { s += x.num; n += x.den; } } return n ? s / n : null; };
  for (const [net, N] of Object.entries(byNet)) { if (HEAT_TRUTH_NETS.includes(net)) continue; const B = []; for (const [D, x] of N.hum) { const r = ref(D); if (r == null) continue; B.push({ day: D, num: x.num - r * x.den, den: x.den }); } out[net].vsStandard = bootMean(B, seed++); }
  return out;
}

/* ---------------------------------------------------------------------------------------------------------------------------- */
/* 1 · steps. A record: {source, pid, zone, urb, day, var (T | TN | TX), block, lead, obs, steps: {name: value}} in chain order */
export const STEP_ORDER = ['raw', 'start', 'calibration', 'national', 'static', 'wxmos', 'tdown', 'synop', 'served', 'final'];
/* the fleet pairs (MACH): pairs (start, served), basis (best_match, start), steps (every stage, v91.17.283.10); joined on station and hour
   (each station-hour is paired once; the three files stamp paired_utc separately, so the stamp is not a join key) */
export function readPairs(lake, days, stationInfo) {
  const months = [...new Set(days.map((d) => d.slice(0, 7)))]; const dir = join(lake || '', 'archive', 'fleet'); const recs = []; const src = { pairs: 0, basis: 0, steps: 0, files: [] };
  const lo = dayStartMs(days[0]), hi = dayStartMs(addDays(days[days.length - 1], 1)); const seenP = new Set();
  for (const m of months) {
    const P = readCsv(join(dir, 'fleet_pairs_' + m + '.csv'), { at: ['paired_utc'], key: ['key'], hour: ['hour_utc'], lead: ['lead_h'], obs: ['temp_c'], start: ['fc_raw_c'], served: ['fc_served_c'] }); if (!P) continue; src.files.push('fleet_pairs_' + m + '.csv');
    const Bm = new Map(); const Bf = readCsv(join(dir, 'fleet_pairs_basis_' + m + '.csv'), { at: ['paired_utc'], key: ['key'], hour: ['hour_utc'], bm: ['fc_best_match_c'], st: ['fc_start_c'] }); if (Bf) { src.files.push('fleet_pairs_basis_' + m + '.csv'); for (const r of Bf) { const k = r.key + '|' + r.hour; if (!Bm.has(k)) Bm.set(k, r); } }
    const Sm = new Map(); const Sf = readCsv(join(dir, 'fleet_pairs_steps_' + m + '.csv'), { at: ['paired_utc'], key: ['key'], hour: ['hour_utc'], calibration: ['fc_calibration_c'], national: ['fc_national_c'], static: ['fc_static_c'], wxmos: ['fc_wxmos_c'], tdown: ['fc_tdown_c'], synop: ['fc_synop_c'] }); if (Sf) { src.files.push('fleet_pairs_steps_' + m + '.csv'); for (const r of Sf) { const k = r.key + '|' + r.hour; if (!Sm.has(k)) Sm.set(k, r); } }
    for (const r of P) { const ms = utcMs(String(r.hour).replace(/Z?$/, 'Z')); if (!fin(ms) || ms < lo || ms >= hi) continue; const obs = num(r.obs), start = num(r.start), served = num(r.served); if (!fin(obs) || !fin(start) || !fin(served)) continue;
      const I = stationInfo.get('mach:' + r.key); if (!I || !I.zone) continue; const k = r.key + '|' + r.hour; if (seenP.has(k)) continue; seenP.add(k); src.pairs++; const b = Bm.get(k), s = Sm.get(k); const steps = {};
      if (b && fin(num(b.bm))) { steps.raw = num(b.bm); src.basis++; } steps.start = start;
      if (s) { src.steps++; for (const n of ['calibration', 'national', 'static', 'wxmos', 'tdown', 'synop']) { const x = num(s[n]); if (fin(x)) steps[n] = x; } }
      steps.served = served; const pk = pktHour(ms);
      recs.push({ source: 'pairs', pid: 'mach:' + r.key, name: I.name, zone: I.zone, urb: I.urb, day: pktDay(ms), var: 'T', block: hourBlock(pk), night: NIGHT_BLOCKS.includes(hourBlock(pk)), lead: num(r.lead), obs, steps }); } }
  return { recs, src };
}
/* the replay sources listed in data/agents/diagnose/sources.json (the replay tool's outputs; diagnose_replay.py) */
export function readReplay(o, sources, urb) {
  const recs = [], notes = [];
  for (const S of sources || []) {
    const tmp = mkdtempSync(join(tmpdir(), 'nig-dx-')); const out = join(tmp, 'rows.jsonl'); const sf = join(tmp, 'source.json');
    try { const base = S.__base || '.'; const abs = (p) => (p && !/^([a-zA-Z]:)?[\\/]/.test(p) ? join(base, p) : p);
      const s2 = { ...S, runs: { best_match: abs(S.runs && S.runs.best_match), served: abs(S.runs && S.runs.served) }, points: abs(S.points), truth: { ...(S.truth || {}), file: abs(S.truth && S.truth.file) } }; delete s2.__base;
      const miss = [s2.runs.best_match, s2.runs.served, s2.truth.file].filter((f) => !f || !existsSync(f)); if (miss.length) { notes.push({ source: S.name, status: 'not assessed', why: 'not on this computer: ' + miss.map((f) => String(f).split(/[\\/]/).slice(-2).join('/')).join(', ') }); continue; }
      writeJsonAtomic(sf, s2); const py = process.env.NIGRAAN_PYTHON || (process.platform === 'win32' ? 'py' : 'python3');
      const r = spawnSync(py, (py === 'py' ? ['-3'] : []).concat([join(HERE, 'diagnose_replay.py'), '--source', sf, '--out', out]), { encoding: 'utf8', timeout: 15 * 60e3, windowsHide: true });
      if (r.status !== 0) { notes.push({ source: S.name, status: 'not assessed', why: 'the replay reader failed: ' + ((r.stderr || r.stdout || String(r.error || '')).trim().split('\n').slice(-1)[0] || 'exit ' + r.status) }); continue; }
      let n = 0; for (const l of readFileSync(out, 'utf8').split('\n')) { if (!l) continue; let x; try { x = JSON.parse(l); } catch (_) { continue; }
        const u = fin(x.lat) && urb ? urb(x.lat, x.lon) : null; const ub = u == null ? 'unknown' : u >= URBAN_POP_KM2 ? 'urban' : 'rural';
        for (const v of ['TN', 'TX']) if (x[v] && x.obs && fin(x.obs[v])) { recs.push({ source: 'replay:' + S.name, pid: x.pid, name: x.pid, zone: x.zone, urb: ub, day: x.day, var: v, block: null, night: v === 'TN', lead: (x.L || 0) * 24, obs: x.obs[v], steps: x[v] }); n++; } }
      notes.push({ source: S.name, status: 'ok', rows: n, reader: (r.stdout || '').trim().split('\n').slice(-1)[0] });
    } finally { try { rmSync(tmp, { recursive: true, force: true }); } catch (_) {} } }
  return { recs, notes };
}

/* the step tests of one source: group -> each consecutive pair of steps present on the same records */
export function stepTests(recs, groupKeys, seed0 = 3000) {
  const groups = new Map();
  for (const r of recs) { for (const gk of groupKeys) { const k = gk.map((f) => f + '=' + (f === 'block' ? (r.block == null ? 'day' : r.block) : r[f])).join('|'); let g = groups.get(k); if (!g) groups.set(k, g = { key: k, where: Object.fromEntries(gk.map((f) => [f, r[f]])), recs: [] }); g.recs.push(r); } }
  const tests = []; let seed = seed0;
  for (const g of groups.values()) {
    const names = STEP_ORDER.filter((n) => g.recs.some((r) => fin(r.steps[n])));
    const per = {}; for (const n of names) { const B = new Map(); for (const r of g.recs) { if (!fin(r.steps[n])) continue; const b = B.get(r.day) || { day: r.day, num: 0, den: 0 }; b.num += r.steps[n] - r.obs; b.den++; B.set(r.day, b); } per[n] = bootMean([...B.values()], seed++); }
    for (let i = 1; i < names.length; i++) { const a = names[i - 1], b = names[i]; const B = new Map(), stD = new Map(); let nRec = 0;
      for (const r of g.recs) { if (!fin(r.steps[a]) || !fin(r.steps[b])) continue; nRec++; const x = B.get(r.day) || { day: r.day, num: 0, den: 0, ea: 0, eb: 0, ma: 0 }; x.num += r.steps[b] - r.steps[a]; x.den++; x.ea += r.steps[a] - r.obs; x.eb += r.steps[b] - r.obs; x.ma += Math.abs(r.steps[b] - r.obs) - Math.abs(r.steps[a] - r.obs); B.set(r.day, x);
        const s = stD.get(r.pid) || [0, 0]; s[0] += r.steps[b] - r.steps[a]; s[1]++; stD.set(r.pid, s); }
      if (B.size < STEP_MIN_DAYS) { tests.push({ group: g.key, where: g.where, from: a, to: b, assessed: false, days: B.size }); continue; }
      const Bl = [...B.values()]; const d = bootMean(Bl, seed++), ea = bootMean(Bl.map((x) => ({ day: x.day, num: x.ea, den: x.den })), seed++), eb = bootMean(Bl.map((x) => ({ day: x.day, num: x.eb, den: x.den })), seed++), dm = bootMean(Bl.map((x) => ({ day: x.day, num: x.ma, den: x.den })), seed++);
      const st = [...stD.values()].filter((s) => s[1] >= 1).map((s) => s[0] / s[1]); const same = st.filter((x) => Math.sign(x) === Math.sign(d.v)).length;
      tests.push({ group: g.key, where: g.where, from: a, to: b, assessed: true, delta: d, before: ea, after: eb, maeChange: dm, stations: st.length, sameSign: same, records: nRec, steps: Object.fromEntries(names.map((n) => [n, per[n]])) }); } }
  const A = tests.filter((t) => t.assessed); const cut = bhCut(A.map((t) => t.delta.p));
  for (const t of A) { t.significant = cut != null && t.delta.p <= cut && excludes0(t.delta); t.worsens = Math.abs(t.after.v) > Math.abs(t.before.v); t.maeWorse = !!(t.maeChange && t.maeChange.ci && t.maeChange.ci[0] > 0); t.resolved = Math.abs(t.delta.v) >= OBS_RESOLUTION_C; t.responsible = t.significant && t.worsens && t.maeWorse && t.resolved; }
  return { tests, bhCut: cut, groups: groups.size };
}

/* leave one station out of a cell (variable x zone x urban/rural): does one station alone carry the cell's bias? */
export function leaveOneOut(SE, v, zone, urb, seed = 4100) {
  const sts = [...SE.values()].filter((s) => (zone === 'all' || s.zone === zone) && (urb === 'all' || (urb === 'urban' ? s.urban === true : urb === 'rural' ? s.urban === false : true)));
  const blocks = (list) => { const B = new Map(); for (const s of list) for (const [D, r] of s.days) { const e = dayErr(r, v); if (!fin(e)) continue; const x = B.get(D) || { day: D, num: 0, den: 0 }; x.num += e; x.den++; B.set(D, x); } return [...B.values()]; };
  const all = bootMean(blocks(sts), seed); if (!all) return null; let best = null;
  for (const s of sts) { const B = blocks(sts.filter((x) => x !== s)); const n = B.reduce((a, x) => a + x.den, 0); if (!n) continue; const v2 = B.reduce((a, x) => a + x.num, 0) / n; if (!best || Math.abs(all.v - v2) > Math.abs(all.v - best.v)) best = { st: s, v: v2 }; }
  /* and one network out (a network's sensors or siting, e.g. the MACH hygrometers) */
  let net = null; const nets = [...new Set(sts.map((x) => x.net))];
  if (nets.length > 1) for (const n of nets) { const rest = sts.filter((x) => x.net !== n); const w2 = bootMean(blocks(rest), seed + 7); if (!w2) continue; const share = blocks(sts.filter((x) => x.net === n)).reduce((a, x) => a + x.den, 0) / Math.max(1, all.n);
    if (!net || Math.abs(all.v - w2.v) > Math.abs(all.v - net.without.v)) net = { net: n, without: w2, share: r2(share), stations: sts.length - rest.length, drives: excludes0(all) && !excludes0(w2) }; }
  if (!best) return { all, stations: sts.length, net }; const w = bootMean(blocks(sts.filter((x) => x !== best.st)), seed + 1);
  return { all, stations: sts.length, net, top: { pid: best.st.pid, name: best.st.name, without: w, drives: excludes0(all) && w && !excludes0(w) } };
}

/* v91.17.283.14 · the quality control's share of failing hourly values per station and variable (OQ.hourly: obsqc qcBatch) */
const QVN = { T: 'temperature', Td: 'dew point', RH: 'humidity', P: 'pressure', W: 'wind', G: 'gust', S: 'solar' };
const QTEST = { buddy: 'off its neighbours at its height', background: 'off the forecast beyond its zone\'s spread', 'climate-range': 'outside the climatological range', copy: 'the same record as another station',
  'stuck-replay': 'a frozen record coming back', frozen: 'one value for hours', jump: 'unconfirmed jumps', persistence: 'one value for hours', step: 'spikes', internal: 'inconsistent with its own other sensors',
  'array-silent': 'outdoor array silent', 'shielded-array': 'outdoor array shielded', 'gross-range': 'physically impossible values', 'owner-mark': 'marked by the owner' };
function qcShares(OQ) { const list = [];
  for (const [pid, H] of (OQ.hourly || new Map())) { const o = {}; for (const r of H.values()) for (const v of Object.keys(QVN)) { const raw = r.raw && r.raw[v] != null ? r.raw[v] : r[v]; if (raw == null || !Number.isFinite(raw)) continue;
      const x = o[v] || (o[v] = { n: 0, fail: 0, tests: {} }); x.n++; if (r.f && r.f[v]) { x.fail++; x.tests[r.f[v].test] = (x.tests[r.f[v].test] || 0) + 1; } }
    for (const [v, x] of Object.entries(o)) list.push({ pid, v, n: x.n, fail: x.fail, share: x.n ? x.fail / x.n : 0, tests: x.tests, top: Object.entries(x.tests).sort((a, b) => b[1] - a[1]).map((e) => e[0])[0] || 'none' }); }
  return { list, by: new Map(list.map((x) => [x.pid + '|' + x.v, x])) }; }
const qcLine = (QS, pid, v) => { const x = QS.by.get(pid + '|' + v); return x ? 'quality control: ' + Math.round(100 * x.share) + ' % of its hourly ' + QVN[v] + ' values fail (' + x.fail + ' of ' + x.n + (x.fail ? ', mostly ' + x.top : '') + ') and are left out of corrections, scores and training' : 'quality control: no hourly values judged'; };

/* ---------------------------------------------------------------------------------------------------------------------------- */
const hyp = {
  step: (t, zone, urb, v, blk) => 'Hypothesis (for the experimentation agent): the ' + stepLabel(t) + ' step moves the ' + VNAME[v] + ' error by ' + sgn(t.delta.v) + ' ' + UNIT[v] + ' in ' + (ZNAME[zone] || zone) + ' ' + urb + (blk ? ' (' + blk + ')' : '') + '. Test: replay the same days with this step left out for that stratum (arm A) against the served chain (arm B) on held-out days; a change is promoted only if the MAE gain interval excludes 0 (RULES). Nothing is switched by this agent.',
  station: (st, v) => 'Hypothesis (for the owner): ' + st.name + ' does not represent its tehsil for ' + VNAME[v] + '. Site check: mast height, slope and aspect, shading, rain-gauge-only mast, or a standard screen beside it for 7 days. The quality control already drops each of its values that fails the neighbour or forecast check; this agent changes nothing.',
  qc: (name, x) => 'Site check (for the owner): ' + name + ' - ' + QVN[x.v] + ' fails ' + Math.round(100 * x.share) + ' % of hours, mostly ' + x.top + ' (' + (QTEST[x.top] || 'see the evidence') + '). Its failing values are dropped automatically and come back when it reads right again; an owner mark (data/obs-qc-marks.json) is needed only to keep a variable out that passes the checks.',
  rh: (st) => 'Hypothesis (for the owner): the hygrometer at ' + st.name + ' reads off. Test: a reference psychrometer beside it for 7 days, or swap the sensor; holding it is the owner\'s decision.',
  net: (net) => 'Hypothesis (for the owner and the experimentation agent): the ' + NETNAME[net] + ' hygrometers read more humid than standard screens (siting or sensor). Test: a reference psychrometer at two ' + NETNAME[net] + ' sites for 7 days; until then keep ' + NETNAME[net] + ' humidity out of any training or heat truth (already so for the client heat line).',
  frozen: (st) => 'Hypothesis (for the owner): the sensor at ' + st.name + ' is stuck, shielded or indoors. Site check: the console and the radiation shield; its stuck values are dropped by the quality control as they occur.',
  lag: (st, L) => 'Hypothesis (for the owner): the clock or time zone of ' + st.name + ' is off by ' + (L > 0 ? '+' : '') + L + ' h. Test: compare the logger\'s raw time stamps with the database time for one day.',
  heat: (net) => 'Hypothesis (for the experimentation agent): observed UTCI at ' + NETNAME[net] + ' stations is lifted by their humidity (siting or sensor), not by heat. Test: score the heat level against the same stations with the forecast humidity in the observed UTCI (arm A) and with the measured humidity (arm B); keep the client heat truth on the standard networks (already the rule).',
  drive: (st) => 'Hypothesis (for the owner): one station, ' + st.name + ', carries this cell. Test: confirm the station checks above and its quality-control share; an owner mark (data/obs-qc-marks.json) is the owner\'s decision.'
};
const stepLabel = (t) => (t.from === 'start' && t.to === 'served') ? 'chain from the start to the served value (static calibration, national model, weather MOS and synoptic term together, until the step log splits them)' : STEP_NAMES[t.to];
const snr = (s) => s && s.ci ? Math.abs(s.v) / Math.max(1e-9, (s.ci[1] - s.ci[0]) / 3.92) : 0;

export async function diagnose(o) {
  const now = o.now || Date.now(); const D1 = o.day || addDays(pktDay(now), -1); const W = Number(o.window) || WINDOW; const days = daysBetween(addDays(D1, -(W - 1)), D1);
  const ctx = { dataDir: o.dataDir, copiesDir: o.copiesDir, lake: o.lake, now };
  const stations = await loadStations(ctx); const issues = [...new Set(days.flatMap((D) => [0, 1, 2, 3, 4].map((L) => addDays(D, -L))))].sort();
  const FC = await loadForecasts(o.dataDir, issues);
  /* v91.17.283.14 · OB: the values through the station's own checks only (offsets stay measurable); OQ: the full quality control (shares) */
  const OB = await loadObs({ ...ctx, qcView: 'offsets' }, daysBetween(addDays(days[0], -4), D1), stations, FC);
  const OQ = await loadObs(ctx, daysBetween(days[0], D1), stations, FC);
  const U = await import(pathToFileURL(join(API, 'utci.mjs')).href);
  const SE = stationErrors(stations, FC, OB, days);
  const info = new Map([...SE.values()].map((s) => [s.pid, { zone: s.zone, urb: s.urban == null ? 'unknown' : s.urban ? 'urban' : 'rural', name: s.name }]));
  /* stations with no observation in the window still get their zone and urban class from the tehsil (the pairs may hold them) */
  const zoneOf = new Map(); for (const m of FC.values()) for (const [u, r] of m) if (r.z && !zoneOf.has(u)) zoneOf.set(u, r.z);
  for (const s of stations) if (!info.has(s.pid) && s.uid && zoneOf.get(s.uid)) info.set(s.pid, { zone: zoneOf.get(s.uid), urb: s.urban == null ? 'unknown' : s.urban ? 'urban' : 'rural', name: s.name });
  /* v91.17.283.16 · a network whose values the quality control never judges against neighbours or the forecast (data/obs-qc-params.json
     networks: spatial false and background false; the partner EWS network, owner decision 24 Oct 2026 22:07 PKT) is reported as
     information only: an offset of its stations or of the network is never a drop, a mark or a correction. Its technical failures
     (kind 'qc': range, sentinel, internal, stuck / flat, spike) are reported as before. */
  const QM = await import(pathToFileURL(join(API, 'obsqc.mjs')).href); let QP = null; try { QP = QM.loadParams(o.dataDir); } catch (_) { QP = null; }
  const netOfPid = new Map(stations.map((s) => [s.pid, s.net]));
  const infoOnly = (resp) => { if (!QP || !resp) return null; const r = String(resp); const st = r.startsWith('network:') ? { pid: '', net: r.slice(8) } : { pid: r, net: netOfPid.get(r) ?? null };
    const c = QM.networkOf(QP, st); return c && !QM.allows(c, 'spatial') && !QM.allows(c, 'background') ? c : null; };
  /* v91.17.283.24 · J9 · the hand-off to the experimentation agent: suggestedTest { kind, candidate, text } beside the text nextTest (the
     page shows the text). kind: site_check / sensor_check (the owner), registered_experiment (candidate = the registered experiment that
     tests this cause, exp_registry.mjs candidateFor; the experimentation agent runs it first), unregistered_experiment (no registered test:
     the owner registers one), information (a network ruled correct). R3: the 'already excluded' path is gone (no station list since
     v91.17.283.14; loadStations never set it) */
  const testKind = (it) => { const k = String(it.kind || ''); if (k === 'station' || k === 'qc') return 'site_check'; if (k === 'sensor' || k === 'timestamp' || k === 'station-drives-cell') return 'sensor_check'; return null; };
  const items = []; const add = (it) => {
    it.id = idOf(it.kind, JSON.stringify(it.where), it.responsible || ''); it.action = 'none: a candidate for the owner or the experimentation agent; this agent changes nothing';
    const io = it.kind !== 'qc' && it.kind !== 'step' ? infoOnly(it.responsible) : null;
    if (io) { it.infoOnly = true; it.action = 'none: information only - the owner ruled the ' + (io.label || io.name) + ' correct (24 Oct 2026 22:07 PKT); its values are never dropped, marked or adjusted for an offset';
      it.nextTest = 'Information only (no drop, no mark, no correction): the offset above is reported for the owner; the ' + (io.label || io.name) + ' is taken as correct, and only its technical failures (range, sentinel, internal, stuck / flat, spike) are dropped.'; }
    const cand = it.infoOnly ? null : (testKind(it) ? null : candidateFor(it));
    it.suggestedTest = { kind: it.infoOnly ? 'information' : testKind(it) || (cand ? 'registered_experiment' : 'unregistered_experiment'), candidate: cand, text: it.nextTest || null };
    items.push(it); };

  /* ---- 1 steps ---- */
  const P = readPairs(o.lake, days, info);
  const srcFile = o.sources || join(o.dataDir, 'agents', 'diagnose', 'sources.json'); const SRC = readJson(srcFile, null);
  const sources = SRC && Array.isArray(SRC.replays) ? SRC.replays.map((s) => ({ ...s, __base: dirname(srcFile) })) : [];
  const Rp = readReplay(o, sources, urbanGrid(o.dataDir));
  const stepRuns = [];
  const runSteps = (label, recs, keys) => { if (!recs.length) { stepRuns.push({ source: label, records: 0, status: 'not assessed', why: 'no records in the window' }); return null; }
    const R = stepTests(recs, keys); stepRuns.push({ source: label, records: recs.length, stations: new Set(recs.map((r) => r.pid)).size, days: new Set(recs.map((r) => r.day)).size, from: recs.reduce((a, r) => (!a || r.day < a ? r.day : a), null), to: recs.reduce((a, r) => (!a || r.day > a ? r.day : a), null), groups: R.groups, tests: R.tests.filter((t) => t.assessed).length, notAssessed: R.tests.filter((t) => !t.assessed).length, responsible: R.tests.filter((t) => t.responsible).length, bhCut: R.bhCut, stepsSeen: STEP_ORDER.filter((n) => recs.some((r) => fin(r.steps[n]))) });
    for (const t of R.tests.filter((x) => x.responsible)) { const w = t.where; const v = recs.find((r) => r.var) ? (w.var || 'T') : 'T'; const blk = w.block != null && w.block !== 'day' && fin(Number(w.block)) ? blockName(Number(w.block)) : w.night === true ? 'night 21-06 PKT' : w.night === false ? 'day 06-21 PKT' : null;
      add({ kind: 'step', title: (ZNAME[w.zone] || w.zone) + ' ' + w.urb + ' ' + VNAME[v] + (blk ? ' (' + blk + ')' : '') + ': the ' + stepLabel(t) + ' step moves the error by ' + sgn(t.delta.v) + ' ' + UNIT[v],
        where: { source: label, var: v, zone: w.zone, urb: w.urb, block: blk }, responsible: t.to, size: sizeOf(t.delta, UNIT[v]),
        evidence: ['source: ' + label, 'error before the step (' + STEP_NAMES[t.from] + '): ' + sgn(t.before.v) + ' ' + UNIT[v] + ' ' + ciTxt(t.before.ci) + '; after it: ' + sgn(t.after.v) + ' ' + UNIT[v] + ' ' + ciTxt(t.after.ci),
          'the mean absolute error ' + (t.maeChange.v > 0 ? 'rises' : 'falls') + ' by ' + r2(Math.abs(t.maeChange.v)) + ' ' + UNIT[v] + ' ' + ciTxt(t.maeChange.ci) + ' across the step',
          'the error after every step: ' + Object.entries(t.steps).map(([n, s]) => n + ' ' + (s ? sgn(s.v) : '–')).join(' → '),
          t.sameSign + ' of ' + t.stations + ' stations move the same way; ' + t.records + ' station-' + (v === 'T' ? 'hours' : 'days') + ' on ' + t.delta.days + ' days',
          'significant after Benjamini-Hochberg at 5 % over ' + R.tests.filter((x) => x.assessed).length + ' step tests of this source (p ' + r3(t.delta.p) + ')'],
        nextTest: hyp.step(t, w.zone, w.urb, v, blk), score: snr(t.delta) }); }
    return R; };
  const PR = runSteps('fleet pairs (MACH, as served at the reading hour; leads 0-6 h)', P.recs, [['zone', 'urb', 'night'], ['zone', 'urb', 'block']]);
  const byRep = new Map(); for (const r of Rp.recs) { const a = byRep.get(r.source) || []; a.push(r); byRep.set(r.source, a); }
  const RR = {}; for (const [label, recs] of byRep) RR[label] = runSteps(label, recs, [['zone', 'urb', 'var']]);

  /* ---- 2 stations and sensors ---- */
  const QS = qcShares(OQ);
  const iso = { T: isolationTest(SE, 'T', 500), TN: isolationTest(SE, 'TN', 600), TX: isolationTest(SE, 'TX', 700), RH: isolationTest(SE, 'RH', 800) };
  /* one item per station: the variable with the strongest evidence leads, the others follow in the evidence */
  const byStation = new Map(); for (const v of ['T', 'TN', 'TX']) for (const r of iso[v].rows.filter((x) => x.candidate)) { const a = byStation.get(r.st.pid) || []; a.push({ v, r }); byStation.set(r.st.pid, a); }
  for (const list of byStation.values()) { list.sort((a, b) => snr(b.r.nb) - snr(a.r.nb)); const { v, r } = list[0]; const st = r.st;
    const reads = (x) => x.r.nb.v < 0 ? 'reads ' + r2(-x.r.nb.v) + ' ' + UNIT[x.v] + ' warmer' : 'reads ' + r2(x.r.nb.v) + ' ' + UNIT[x.v] + ' colder';
    add({ kind: 'station', title: st.name + ' (' + (NETNAME[st.net] || st.net) + ', ' + (ZNAME[st.zone] || st.zone) + '): ' + list.map((x) => VNAME[x.v]).join(', ') + ' — ' + reads(list[0]) + ' than its neighbours under the same forecast (forecast − observed ' + sgn(r.own.v) + ' ' + UNIT[v] + '); site check suggested',
      where: { var: v, vars: list.map((x) => x.v), zone: st.zone, station: st.pid }, responsible: st.pid, size: sizeOf(r.nb, UNIT[v]),
      evidence: list.map((x) => VNAME[x.v] + ': its own error (forecast − observed) ' + sgn(x.r.own.v) + ' ' + UNIT[x.v] + ' ' + ciTxt(x.r.own.ci) + ' on ' + x.r.own.days + ' days; against its ' + x.r.neighbours.length + ' nearest same-zone stations ' + sgn(x.r.nb.v) + ' ' + ciTxt(x.r.nb.ci) + '; against the rest of its zone ' + sgn(x.r.zn.v) + ' ' + ciTxt(x.r.zn.ci) + '; the forecast\'s own mean absolute error in the zone ' + r2(x.r.fence.mae) + ' ' + UNIT[x.v]).concat([
        'neighbours: ' + r.neighbours.map((n) => n.name + ' (' + (NETNAME[n.net] || n.net) + ', ' + n.km + ' km)').join('; '), 'each neighbour test significant after Benjamini-Hochberg at 5 % over all tested stations (' + iso[v].tested + ')',
        'station height ' + (fin(st.elevM) ? Math.round(st.elevM) + ' m' : 'unknown') + (st.urban == null ? '' : st.urban ? ', urban cell' : ', rural cell'),
        qcLine(QS, st.pid, 'T')]),
      nextTest: hyp.station(st, v), score: snr(r.nb) }); }
  for (const r of iso.RH.rows.filter((x) => x.candidate)) { const st = r.st;
    add({ kind: 'sensor', title: st.name + ' (' + (NETNAME[st.net] || st.net) + '): the hygrometer reads ' + r2(Math.abs(r.nb.v)) + ' points ' + (r.nb.v < 0 ? 'more humid' : 'drier') + ' than its neighbours under the same forecast (sensor candidate)', where: { var: 'RH', zone: st.zone, station: st.pid }, responsible: st.pid, size: sizeOf(r.nb, '%'),
      evidence: ['forecast − observed humidity ' + sgn(r.own.v) + ' % ' + ciTxt(r.own.ci) + '; against the ' + r.neighbours.length + ' nearest same-zone stations (' + r.neighbours.map((n) => n.name + ' ' + n.km + ' km').join('; ') + ') ' + sgn(r.nb.v) + ' ' + ciTxt(r.nb.ci) + '; against the zone ' + sgn(r.zn.v) + ' ' + ciTxt(r.zn.ci), 'the offset is larger than the forecast\'s own mean absolute humidity error in the zone (' + r2(r.fence.mae) + ' %); the neighbour test significant after Benjamini-Hochberg at 5 % over ' + iso.RH.tested + ' stations'],
      nextTest: hyp.rh(st), score: snr(r.nb) }); }
  const NH = networkHumidity(SE);
  for (const [net, X] of Object.entries(NH)) { const s = X.day && X.day.diff; if (!s || !excludes0(s)) continue;
    add({ kind: 'sensor', title: (NETNAME[net] || net) + ' hygrometers read ' + sgn(-s.v) + ' points ' + (s.v < 0 ? 'more humid' : 'drier') + ' by day than synoptic and airport stations under the same forecast', where: { var: 'RH', network: net, hours: '09-18 PKT' }, responsible: 'network:' + net, size: sizeOf(s, '%'),
      evidence: ['forecast − observed humidity by day: ' + (NETNAME[net] || net) + ' ' + sgn(X.day.net.v) + ' % ' + ciTxt(X.day.net.ci) + ', synoptic + airport ' + sgn(X.day.ref.v) + ' % ' + ciTxt(X.day.ref.ci) + ' (zone-matched difference ' + sgn(s.v) + ' ' + ciTxt(s.ci) + ')',
        X.all && X.all.diff ? 'all hours: difference ' + sgn(X.all.diff.v) + ' ' + ciTxt(X.all.diff.ci) : 'all hours: not assessed', 'MACH humidity feeds the running dew-point bias (fleet.mjs) and the moist-model training (23 of 182 stations): risk for the 1 Nov retrain'],
      nextTest: hyp.net(net), score: snr(s) }); }
  const frozen = []; for (const st of SE.values()) { const fT = [...st.days.entries()].filter(([, r]) => r.frozenT).map(([d]) => d), fR = [...st.days.entries()].filter(([, r]) => r.frozenRH).map(([d]) => d); if (fT.length || fR.length) frozen.push({ st, fT, fR }); }
  for (const f of frozen) add({ kind: 'sensor', title: f.st.name + ': ' + (f.fT.length ? f.fT.length + ' day(s) with one temperature all day' : '') + (f.fT.length && f.fR.length ? ', ' : '') + (f.fR.length ? f.fR.length + ' day(s) with one humidity all day' : '') + ' (frozen sensor)', where: { station: f.st.pid, zone: f.st.zone }, responsible: f.st.pid, size: { value: f.fT.length + f.fR.length, unit: 'days', ci: null },
    evidence: ['days: ' + [...new Set([...f.fT, ...f.fR])].sort().slice(-10).join(', '), 'a whole day (at least ' + DAY_MIN_HOURS + ' hourly values) without any change is not a physical record'], nextTest: hyp.frozen(f.st), score: 3 + f.fT.length + f.fR.length });
  /* v91.17.283.14 · the value-level quality control's verdicts: a station variable whose share of failing hourly values lies above
     Tukey's upper fence of every station variable's share (Tukey 1977), or at 50 % or more, is reported with the checks that fail it */
  const QF = tukeyFences(QS.list.map((x) => x.share));
  for (const x of QS.list.filter((x) => x.n >= 24 && (x.share >= 0.5 || (QF && x.share > QF.hi)))) { const st = info.get(x.pid) || { name: x.pid };
    add({ kind: 'qc', title: (st.name || x.pid) + ': ' + QVN[x.v] + ' values failing ' + Math.round(100 * x.share) + ' % of hours (' + x.top + ')', where: { station: x.pid, var: x.v, zone: st.zone || null }, responsible: x.pid,
      size: { value: r3(x.share), unit: 'share of hourly values', ci: null, n: x.n },
      evidence: [x.fail + ' of ' + x.n + ' hourly values failed: ' + Object.entries(x.tests).sort((a, b) => b[1] - a[1]).map(([t, c]) => t + ' ' + c).join(', '), QF ? 'the usual share over all station variables is ' + Math.round(100 * QF.q1) + '-' + Math.round(100 * QF.q3) + ' % (Tukey upper fence ' + Math.round(100 * QF.hi) + ' %)' : 'fence not formed',
        'the failing values are already left out of the corrections, the scores and the training; the station\'s other variables and hours stay'],
      nextTest: hyp.qc(st.name || x.pid, x), score: 2 + x.share * 10 }); }
  const DT = dtrTest(SE); for (const r of DT.rows.filter((x) => x.candidate)) add({ kind: 'sensor', title: r.st.name + ': daily temperature range ' + Math.round(100 * Math.exp(r.s.v)) + ' % of its neighbours\' (shielded or indoor sensor candidate)', where: { station: r.st.pid, zone: r.st.zone }, responsible: r.st.pid,
    size: { value: r3(Math.exp(r.s.v)), ci: r.s.ci.map((x) => r3(Math.exp(x))), unit: 'ratio of ranges', days: r.s.days }, evidence: ['neighbours: ' + r.neighbours.join(', '), 'log ratio ' + r3(r.s.v) + ' ' + ciTxt(r.s.ci) + ' on ' + r.s.days + ' days; below Tukey\'s lower fence of all ' + DT.tested + ' stations; Benjamini-Hochberg at 5 %'], nextTest: hyp.frozen(r.st), score: snr(r.s) });
  const LG = lagTest(SE); for (const r of LG.rows.filter((x) => x.candidate)) add({ kind: 'timestamp', title: r.st.name + ': its diurnal cycle fits its neighbours\' best shifted by ' + (r.lag > 0 ? '+' : '') + r.lag + ' h (its zone: ' + (r.zoneLag > 0 ? '+' : '') + r.zoneLag + ' h)', where: { station: r.st.pid, zone: r.st.zone }, responsible: r.st.pid,
    size: { value: r.lag - r.zoneLag, unit: 'h', ci: null }, evidence: ['best lag ' + r.lag + ' h (correlation ' + r.corr + ') in ' + Math.round(100 * r.stable) + ' % of ' + LAG_RESAMPLES + ' day resamples', 'the usual lag in its zone: ' + r.zoneLag + ' h'], nextTest: hyp.lag(r.st, r.lag - r.zoneLag), score: 2 + 3 * r.stable });

  /* ---- 3 heat inputs ---- */
  const HI = heatInputs(SE, OB, FC, U);
  for (const [net, X] of Object.entries(HI)) { if (HEAT_TRUTH_NETS.includes(net) || !X.vsStandard || !excludes0(X.vsStandard)) continue;
    add({ kind: 'heat-input', title: (NETNAME[net] || net) + ': the measured humidity lifts the observed day-peak UTCI by ' + sgn(X.humidityLift.v) + ' °C (' + sgn(X.vsStandard.v) + ' °C more than at synoptic and airport stations)', where: { network: net, var: 'UTCI' }, responsible: 'network:' + net, size: sizeOf(X.vsStandard, '°C'),
      evidence: ['observed peak UTCI with the measured minus with the forecast humidity: ' + Object.entries(HI).map(([n, y]) => (NETNAME[n] || n) + ' ' + sgn(y.humidityLift.v) + ' ' + ciTxt(y.humidityLift.ci) + ' (' + y.stations + ' st.)').join('; '),
        X.mastWindLift ? 'the station\'s own (low-mast) wind instead of the served 10 m wind would move the observed peak by ' + sgn(X.mastWindLift.v) + ' °C ' + ciTxt(X.mastWindLift.ci) + ' (not used: the verification already takes the served 10 m wind at this network)' : 'no own wind', 'the client heat line already rests on synoptic and airport stations only (verify.mjs HEAT_TRUTH_NETS)'],
      nextTest: hyp.heat(net), score: snr(X.vsStandard) }); }

  /* ---- 4 the verification's flags and persistent cells, linked to their causes ---- */
  const V = readJson(join(o.dataDir, 'agents', 'verify', 'summary.json'), null); const DR = readJson(join(o.dataDir, 'agents', 'verify', 'drift.json'), null);
  const cells = []; for (const f of (DR && DR.flags) || []) if (['T', 'TN', 'TX', 'RH'].includes(f.var) && f.metric === 'bias') cells.push({ from: 'drift flag', var: f.var, zone: f.zone, urb: f.urb, text: f.text });
  for (const r of (V && V.table) || []) if (['T', 'TN', 'TX', 'RH'].includes(r.var) && r.zone !== 'all' && r.lead === 1 && r.biasCi && (r.biasCi[0] > 0 || r.biasCi[1] < 0)) cells.push({ from: 'persistent bias (day 1)', var: r.var, zone: r.zone, urb: 'all', text: (ZNAME[r.zone] || r.zone) + ' ' + VNAME[r.var] + ' bias ' + sgn(r.bias) + ' ' + UNIT[r.var] + ' ' + ciTxt(r.biasCi) + ' on day 1' });
  for (const r of (V && V.urban) || []) if (['T', 'TN', 'TX', 'RH'].includes(r.var) && r.lead === 1 && r.biasCi && (r.biasCi[0] > 0 || r.biasCi[1] < 0)) cells.push({ from: 'persistent bias (day 1)', var: r.var, zone: 'all', urb: r.urb, text: (r.urb === 'urban' ? 'Urban' : 'Rural') + ' ' + VNAME[r.var] + ' bias ' + sgn(r.bias) + ' ' + UNIT[r.var] + ' ' + ciTxt(r.biasCi) + ' on day 1' });
  const flags = [];
  for (const c of cells) { const L = leaveOneOut(SE, c.var, c.zone, c.urb);
    const sv = c.var === 'TN' ? ['TN', 'T'] : [c.var]; const steps = items.filter((it) => it.kind === 'step' && sv.includes(it.where.var) && (c.zone === 'all' || it.where.zone === c.zone) && (c.urb === 'all' || it.where.urb === c.urb) && (c.var !== 'TN' || it.where.var === 'TN' || /night|0[0-3]-0[3-6]|21-24/.test(it.where.block || '')));
    const sameSign = steps.filter((it) => L && Math.sign(it.size.value) === Math.sign(L.all.v));
    const causes = sameSign.map((it) => ({ item: it.id, text: it.title }));
    if (L && L.top && L.top.drives) { const st = SE.get(L.top.pid); add({ kind: 'station-drives-cell', title: c.text + ': driven by one station, ' + L.top.name + ' (without it ' + sgn(L.top.without.v) + ' ' + UNIT[c.var] + ' ' + ciTxt(L.top.without.ci) + ')', where: { var: c.var, zone: c.zone, urb: c.urb, station: L.top.pid }, responsible: L.top.pid, size: sizeOf(L.all, UNIT[c.var]),
        evidence: ['the cell recomputed at station level: ' + sgn(L.all.v) + ' ' + ciTxt(L.all.ci) + ' over ' + L.stations + ' stations; without ' + L.top.name + ': ' + sgn(L.top.without.v) + ' ' + ciTxt(L.top.without.ci) + ' (leave-one-station-out)'], nextTest: hyp.drive(st || { name: L.top.name }), score: snr(L.all) });
      causes.push({ item: items[items.length - 1].id, text: items[items.length - 1].title }); }
    if (L && L.net && L.net.drives) { const N = L.net; add({ kind: 'network-drives-cell', title: c.text + ': carried by the ' + (NETNAME[N.net] || N.net) + ' stations (' + N.stations + ' stations, ' + Math.round(100 * N.share) + ' % of the station-days); without them ' + sgn(N.without.v) + ' ' + UNIT[c.var] + ' ' + ciTxt(N.without.ci), where: { var: c.var, zone: c.zone, urb: c.urb, network: N.net }, responsible: 'network:' + N.net, size: sizeOf(L.all, UNIT[c.var]),
        evidence: ['the cell recomputed at station level: ' + sgn(L.all.v) + ' ' + ciTxt(L.all.ci) + ' over ' + L.stations + ' stations; without the ' + (NETNAME[N.net] || N.net) + ' stations: ' + sgn(N.without.v) + ' ' + ciTxt(N.without.ci) + ' (leave-one-network-out)'].concat(items.filter((it) => it.kind === 'sensor' && it.where.network === N.net && it.where.var === c.var).map((it) => 'see: ' + it.title)),
        nextTest: c.var === 'RH' ? hyp.net(N.net) : 'Hypothesis (for the owner): the ' + (NETNAME[N.net] || N.net) + ' siting carries this cell. Test: score the cell on the standard-exposure networks only before changing any correction.', score: snr(L.all) });
      causes.push({ item: items[items.length - 1].id, text: items[items.length - 1].title }); }
    flags.push({ from: c.from, text: c.text, var: c.var, zone: c.zone, urb: c.urb, stationLevel: L ? { bias: r2(L.all.v), ci: L.all.ci ? L.all.ci.map(r2) : null, stations: L.stations, network: L.net ? { net: L.net.net, share: L.net.share, without: r2(L.net.without.v), withoutCi: L.net.without.ci ? L.net.without.ci.map(r2) : null, drives: !!L.net.drives } : null, topStation: L.top ? { pid: L.top.pid, name: L.top.name, without: r2(L.top.without && L.top.without.v), withoutCi: L.top.without && L.top.without.ci ? L.top.without.ci.map(r2) : null, drives: !!L.top.drives } : null } : null,
      causes, verdict: causes.length ? 'cause found: ' + causes.map((x) => x.text).join(' | ') : 'no single step or station explains it in the data on this computer' }); }

  /* ---- ranking and the plain summary ---- */
  items.sort((a, b) => (b.score || 0) - (a.score || 0)); items.forEach((it, i) => { it.rank = i + 1; it.score = r2(it.score); });
  const top = items.slice(0, 5);
  const summary = items.length ? 'The diagnostic agent found ' + items.length + ' candidate cause' + (items.length === 1 ? '' : 's') + ' (' + Object.entries(items.reduce((a, x) => { a[x.kind] = (a[x.kind] || 0) + 1; return a; }, {})).map(([k, n]) => n + ' ' + k).join(', ') + '). The strongest: ' + top.map((x, i) => (i + 1) + ') ' + x.title).join(' ') + ' None of these was acted on: each is a hypothesis for the owner or the experimentation agent.' : 'No candidate cause found in the window.';
  return { day: D1, built: new Date(now).toISOString(), window: { from: days[0], to: D1, days: days.length }, version: 'diagnose@283.24',
    method: 'forecast minus observed; 95 % day-block bootstrap intervals (' + BOOT + ' draws, fixed seed); Benjamini-Hochberg at 5 % per family; Tukey fences 1.5 IQR; neighbours: the ' + K_NEIGHBOURS + ' nearest same-zone stations; steps from the fleet pairs and the listed chain replays',
    summary, items, flags, sources: { steps: stepRuns, pairs: P.src, replays: Rp.notes, obs: OB.src, stations: SE.size, sourcesFile: SRC ? 'data/agents/diagnose/sources.json (' + sources.length + ' replay source' + (sources.length === 1 ? '' : 's') + ')' : 'none: only the fleet pairs' },
    tables: { isolation: Object.fromEntries(Object.entries(iso).map(([v, x]) => [v, { tested: x.tested, fences: x.fences, candidates: x.rows.filter((r) => r.candidate).map((r) => r.st.pid), byStation: x.rows.map((r) => ({ pid: r.st.pid, net: r.st.net, zone: r.st.zone, own: r2(r.own.v), vsNeighbours: r2(r.nb.v), ci: r.nb.ci ? r.nb.ci.map(r2) : null, vsZone: r.zn ? r2(r.zn.v) : null, days: r.own.days })) }])),
      networkHumidity: Object.fromEntries(Object.entries(NH).map(([n, X]) => [n, Object.fromEntries(Object.entries(X).map(([sp, y]) => [sp, { diff: sizeOf(y.diff, '%'), net: sizeOf(y.net, '%'), standard: sizeOf(y.ref, '%') }]))])),
      heatInputs: Object.fromEntries(Object.entries(HI).map(([n, X]) => [n, { stations: X.stations, humidityLift: sizeOf(X.humidityLift, '°C'), vsStandard: sizeOf(X.vsStandard, '°C'), mastWindLift: sizeOf(X.mastWindLift, '°C') }])),
      lag: { tested: LG.tested, zoneLag: LG.zoneLag, oneHourPhase: LG.rows.filter((r) => r.phaseOnly && r.stable >= LAG_STABLE).map((r) => ({ pid: r.st.pid, lag: r.lag })) }, dtr: { tested: DT.tested },
      steps: Object.fromEntries([['pairs', PR], ...Object.entries(RR)].filter(([, R]) => R).map(([k, R]) => [k, R.tests.filter((t) => t.assessed).map((t) => ({ where: t.where, from: t.from, to: t.to, delta: sizeOf(t.delta, '°C'), before: r2(t.before.v), after: r2(t.after.v), responsible: !!t.responsible, significant: !!t.significant }))])) },
    qc: { params: OQ.qc && OQ.qc.params, counts: OQ.qc ? { values: OQ.qc.values, failed: OQ.qc.failed } : null, stationVariables: QS.list.filter((x) => x.fail > 0).sort((a, b) => b.share - a.share).slice(0, 200).map((x) => ({ pid: x.pid, var: x.v, n: x.n, failPct: Math.round(1000 * x.share) / 10, tests: x.tests })) },
    rule: 'candidates only: NIGRAAN keeps no station list; values are judged by server/api/obsqc.mjs; this agent never marks a sensor and never switches a step by itself; numbers from code, no language model, no network' };
}

export function writeDiagnosis(dataDir, d) {
  const dir = join(dataDir, 'agents', 'diagnose'); mkdirSync(dir, { recursive: true }); writeJsonAtomic(join(dir, d.day + '.json'), d);
  const slim = { ...d, tables: { isolation: Object.fromEntries(Object.entries(d.tables.isolation).map(([v, x]) => [v, { tested: x.tested, fences: x.fences, candidates: x.candidates }])), networkHumidity: d.tables.networkHumidity, heatInputs: d.tables.heatInputs, lag: d.tables.lag } };
  writeJsonAtomic(join(dir, 'latest.json'), slim);
  const files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort(); for (const f of files.slice(0, Math.max(0, files.length - DIAG_KEEP_DAYS))) { try { unlinkSync(join(dir, f)); } catch (_) {} }
  return slim;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const A = args(); const app = A.app || join(HERE, '..', '..'); const dataDir = A.data || join(app, 'data');
  /* v91.17.283.24 · self-audit J23 · the "already written" check comes before the lock and nothing inside the try calls process.exit (it
     skipped the finally, so the lock stayed until its 40-minute age-out and the next run was refused as "another copy running") */
  const now = A.now ? Date.parse(A.now) : Date.now(); const day = A.day || addDays(pktDay(now), -1);
  if (!A.force && existsSync(join(dataDir, 'agents', 'diagnose', day + '.json'))) { console.log('diagnosis for ' + day + ' already written'); process.exit(0); }
  const rel = takeLock(join(dataDir, 'agents', 'diagnose.lock'), 40 * 60e3); if (!rel) { console.log('another diagnostic run is going'); process.exit(5); }
  try {
    const d = await diagnose({ dataDir, copiesDir: A.copies || join(app, '..', 'copies'), lake: A.lake || join(app, '..', 'station-lake'), day, window: A.window, sources: A.sources, now });
    writeDiagnosis(dataDir, d);
    agentLog(dataDir, 'diagnostic', 'diagnosis ' + d.window.from + ' to ' + d.window.to + ': ' + d.items.length + ' candidate cause(s), ' + d.flags.length + ' verification flag(s) linked' + (d.items[0] ? '; strongest: ' + d.items[0].title : ''), { day }, Date.now());
    console.log('diagnostic ' + day + ': ' + d.items.length + ' item(s); ' + d.flags.length + ' flag(s); steps ' + d.sources.steps.map((s) => s.source.split(' (')[0] + ' ' + (s.records || 0)).join(', '));
  } finally { rel(); }
}
