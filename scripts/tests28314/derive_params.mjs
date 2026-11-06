/* v91.17.283.14 · derivation of the data-estimated numbers in data/obs-qc-params.json (server/api/obsqc.mjs), on NIGRAAN's own copies of
   the observations (MACH database record, airport METAR, synoptic reports, partner-network AWS) over a window of Pakistan days.
     step.k (Td, RH, P)       the 99.9th percentile of |hourly-scaled change| between consecutive readings (gap <= maxgap_min) at the
                              reference population; scaled per sqrt(gap / 60 min) as stuckscreen.mjs scales its K
     persist.max_min          the 99.9th percentile of unchanged-value run lengths at the stations whose share of time in such runs is at
                              or below the 95th percentile of all stations (the population under test left out, as derive_shield.py)
     buddy.min_std[zone]      the median standard deviation of the height-adjusted buddy sets, per variable and zone (TITAN buddy check
                              geometry: radius_km, max_elev_diff_m, num_min, elev_gradient), over every hour of the window
     buddy.threshold[zone]    the smallest k (step 0.25 from 2) at which no more than FALSE_RATE of the values at the WMO-sited
                              reference stations (synoptic, airport) of the zone fail; zones with fewer than MIN_REF reference values
                              take the pooled k of all zones
     background (T)           the same rule on the departure from the issued forecast (zone spread, min_std floor)
   usage: node scripts/tests28314/derive_params.mjs --data <dir> --copies <dir> --lake <dir> --from YYYY-MM-DD --to YYYY-MM-DD [--write] */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadAll } from './lib.mjs';
import * as Q from '../../server/api/obsqc.mjs';
import { args, quantile } from '../agents/lib.mjs';

export const FALSE_RATE = 0.01, MIN_REF = 300, REF_NETS = new Set(['synop', 'metar']), Q999 = 0.999;
const GEOM = { radius_km: 30, max_elev_diff_m: 150, num_min: 3, num_iterations: 2,
  source: 'radius 30 km and at least 3 buddies: the live MACH layer\'s buddy rule (data/hyperlocal-model.json buddy, hindcast-tested v91.17.186); 150 m: the fleet neighbour rule dz_m (data/mach-siting.json rule); 2 iterations: titanlib buddy_check' };
const GRAD = { T: -0.0065, Td: 0, RH: 0 };
export const RESID_DZ = [300, 600, 1000], RESID_KM = [30, 60, 100], SYNTH_C = 5;   /* 5 C: about half the largest sensor offsets the diagnostic agent named on 23 Oct 2026 (4-13 C) */
const fin = (x) => x != null && Number.isFinite(x);

export async function derive(ctx, from, to) {
  const A = await loadAll(ctx, from, to); const base = JSON.parse(readFileSync(join(ctx.dataDir, 'obs-qc-params.json'), 'utf8'));
  const P = Q.loadParams(ctx.dataDir); P.step = {}; P.persist = {}; P.buddy = {}; P.background = {};
  const net = new Map(A.qs.map((s) => [s.pid, s.net]));
  /* checks 1 and 3 and the temperature series first: the step / persistence statistics are taken on values that pass them */
  for (const [pid, rows] of A.OB.byPid) { const s = A.qs.find((x) => x.pid === pid); for (const r of rows) { Q.grossCheck(r, P, {}); Q.internalCheck(r, P, s && s.elev); } Q.seriesCheck(rows, P, s || {}); }
  const step = {}, persist = {};
  for (const v of ['Td', 'RH', 'P']) {
    const d = [], runsBy = new Map();
    for (const [pid, rows] of A.OB.byPid) { const n = net.get(pid); const ok = rows.filter((r) => Q.passes(r, v));
      if (REF_NETS.has(n) || (v === 'P' && n === 'mach')) for (let i = 1; i < ok.length; i++) { const g = (ok[i].ms - ok[i - 1].ms) / 6e4; if (g <= 0 || g > 90) continue; d.push(Math.abs(ok[i][v] - ok[i - 1][v]) / Math.sqrt(Math.max(g, 1) / 60)); }
      if (n === 'mach' || n === 'aws') { const runs = []; let s0 = 0; for (let i = 1; i <= ok.length; i++) { const end = i === ok.length || ok[i][v] !== ok[s0][v] || (ok[i].ms - ok[i - 1].ms) / 6e4 > 90;
          if (end) { const run = (ok[i - 1].ms - ok[s0].ms) / 6e4; if (!(v === 'RH' && ok[s0].RH >= 99)) runs.push(run); s0 = i; } } if (runs.length) runsBy.set(pid, runs); } }
    if (d.length > 1000) step[v] = { k: Math.round(quantile(d, Q999) * 100) / 100, maxgap_min: 90, live_single_sided: false, pairs: d.length, population: v === 'P' ? 'MACH stations (no reference network reports station pressure)' : 'synoptic and airport reports' };
    const share = [...runsBy].map(([pid, rs]) => [pid, rs.filter((x) => x > 60).reduce((a, x) => a + x, 0) / Math.max(1, rs.reduce((a, x) => a + x, 0) + rs.length * 10)]);
    const cut = quantile(share.map((x) => x[1]), 0.95); const all = share.filter((x) => x[1] <= cut).flatMap(([pid]) => runsBy.get(pid));
    if (all.length > 1000) persist[v] = { max_min: Math.round(quantile(all, Q999)), maxgap_min: 90, saturation_guard_pct: 99, runs: all.length, stations: share.filter((x) => x[1] <= cut).length, leftOut: share.filter((x) => x[1] > cut).map((x) => x[0]) };
  }
  P.step = step; P.persist = persist;
  for (const [pid, rows] of A.OB.byPid) { for (const r of rows) delete r.f; const s = A.qs.find((x) => x.pid === pid); for (const r of rows) { Q.grossCheck(r, P, {}); Q.internalCheck(r, P, s && s.elev); } Q.seriesCheck(rows, P, s || {}); }
  /* buddy statistics over every hour (TITAN geometry; no flagging here: the raw z of each value against its full buddy set) */
  const buddy = {}, background = {};
  const hours = new Map(); for (const [pid, rows] of A.OB.byPid) { const s = A.qs.find((x) => x.pid === pid); if (!s || !s.zone) continue; const H = new Map();
    for (const r of rows) { const h = Math.round(r.ms / 3600e3) * 3600e3; if (Math.abs(r.ms - h) > 15 * 6e4) continue; const c = H.get(h); if (!c || Math.abs(r.ms - h) < Math.abs(c.ms - h)) H.set(h, r); }
    for (const [h, r] of H) (hours.get(h) || hours.set(h, []).get(h)).push({ s, r, h }); }
  for (const v of ['T', 'Td', 'RH', 'W']) {
    const sds = {}, zs = {}, bz = {};
    for (const [h, items] of hours) { const live = items.filter((it) => Q.passes(it.r, v));
      if (v !== 'W') for (const it of live) { const bud = live.filter((o) => o !== it && o.s.zone === it.s.zone && Q.km(it.s.lat, it.s.lon, o.s.lat, o.s.lon) <= GEOM.radius_km && (!fin(it.s.elev) || !fin(o.s.elev) || Math.abs(it.s.elev - o.s.elev) <= GEOM.max_elev_diff_m));
        if (bud.length < GEOM.num_min) continue; const adj = bud.map((o) => o.r[v] + (fin(it.s.elev) && fin(o.s.elev) ? GRAD[v] * (it.s.elev - o.s.elev) : 0));
        const m = adj.reduce((a, x) => a + x, 0) / adj.length, sd = Math.sqrt(adj.reduce((a, x) => a + (x - m) ** 2, 0) / (adj.length - 1));
        (sds[it.s.zone] || (sds[it.s.zone] = [])).push(sd); (zs[it.s.zone] || (zs[it.s.zone] = [])).push({ d: it.r[v] - m, sd, ref: REF_NETS.has(it.s.net) }); }
      if (true) { const byZ = new Map(); for (const it of live) { const b = (A.bgAt(it.s.pid, h) || {})[v]; if (fin(b)) (byZ.get(it.s.zone) || byZ.set(it.s.zone, []).get(it.s.zone)).push({ it, dep: it.r[v] - b }); }
        for (const [z, L] of byZ) { if (L.length < 5) continue; const md = quantile(L.map((x) => x.dep), 0.5); const mad = 1.4826 * quantile(L.map((x) => Math.abs(x.dep - md)), 0.5);
          for (const x of L) (bz[z] || (bz[z] = [])).push({ d: x.dep - md, sp: mad, ref: REF_NETS.has(x.it.s.net) }); } } }
    const minStd = {}; for (const [z, a] of Object.entries(sds)) if (a.length >= 200) minStd[z] = Math.round(quantile(a, 0.5) * 100) / 100;
    const pooledMin = Object.values(sds).flat().length ? Math.round(quantile(Object.values(sds).flat(), 0.5) * 100) / 100 : null;
    const kFor = (L, ms) => { for (let k = 2; k <= 8; k += 0.25) { const f = L.filter((x) => Math.abs(x.d) > k * Math.max(x.sd ?? x.sp, ms)).length / L.length; if (f <= FALSE_RATE) return k; } return 8; };
    const refAll = Object.entries(zs).flatMap(([z, L]) => L.filter((x) => x.ref).map((x) => ({ ...x, z })));
    const kPool = refAll.length >= MIN_REF ? kFor(refAll.map((x) => ({ ...x, sd: Math.max(x.sd, minStd[x.z] ?? pooledMin) })), 0) : null;
    const thr = {}, refN = {}; for (const [z, L] of Object.entries(zs)) { const R = L.filter((x) => x.ref); refN[z] = R.length; if (R.length >= MIN_REF) thr[z] = kFor(R, minStd[z] ?? pooledMin); }
    if (v !== 'W') buddy[v] = { ...GEOM, elev_gradient_per_m: GRAD[v], min_std: pooledMin, min_std_by_zone: minStd, threshold: kPool ?? 3, threshold_by_zone: thr, referenceValues: refN, values: Object.fromEntries(Object.entries(zs).map(([z, L]) => [z, L.length])) };
    if (v === 'T') {
      /* residual mode: value - forecast at its height against the same of its buddies; the elevation window is the candidate that detects
         the most synthetic SYNTH_C errors (added to every value) at its own 1 % reference false rate */
      const cand = {}; for (const rk of RESID_KM) for (const dz of RESID_DZ) { const zl = {};
        for (const [h, items] of hours) { const live = items.filter((it) => Q.passes(it.r, 'T')).map((it) => ({ ...it, bg: (A.bgAt(it.s.pid, h) || {}).T })).filter((it) => fin(it.bg));
          for (const it of live) { const bud = live.filter((o) => o !== it && o.s.zone === it.s.zone && Q.km(it.s.lat, it.s.lon, o.s.lat, o.s.lon) <= rk && (!fin(it.s.elev) || !fin(o.s.elev) || Math.abs(it.s.elev - o.s.elev) <= dz));
            const L = zl[it.s.zone] || (zl[it.s.zone] = { all: 0, x: [] }); L.all++; if (bud.length < GEOM.num_min) continue;
            const y = bud.map((o) => o.r.T - o.bg), m = y.reduce((a, q) => a + q, 0) / y.length, sd = Math.sqrt(y.reduce((a, q) => a + (q - m) ** 2, 0) / (y.length - 1));
            L.x.push({ d: (it.r.T - it.bg) - m, sd, ref: REF_NETS.has(it.s.net) }); } }
        const ms = {}, th = {}; let det = 0, all = 0; const pooledRef = [];
        for (const [z, L] of Object.entries(zl)) { all += L.all; if (L.x.length < 200) continue; ms[z] = Math.round(quantile(L.x.map((q) => q.sd), 0.5) * 100) / 100; const R = L.x.filter((q) => q.ref); pooledRef.push(...R.map((q) => ({ ...q, sd: Math.max(q.sd, ms[z]) }))); if (R.length >= MIN_REF) th[z] = kFor(R, ms[z]); }
        const kP = pooledRef.length >= MIN_REF ? kFor(pooledRef, 0) : null; if (kP == null) continue;
        for (const [z, L] of Object.entries(zl)) { if (!fin(ms[z])) continue; const k = th[z] ?? kP; det += L.x.filter((q) => Math.abs(q.d + SYNTH_C) > k * Math.max(q.sd, ms[z])).length; }
        cand[rk + 'km/' + dz + 'm'] = { radius_km: rk, max_elev_diff_m: dz, min_std_by_zone: ms, min_std: Math.round(quantile(Object.values(zl).flatMap((L) => L.x.map((q) => q.sd)), 0.5) * 100) / 100, threshold: kP, threshold_by_zone: th, power: Math.round(1000 * det / all) / 1000, referenceValues: pooledRef.length }; }
      const best = Object.values(cand).sort((a, b) => b.power - a.power)[0];
      if (best) buddy.T.resid = { ...best, candidates: Object.fromEntries(Object.entries(cand).map(([k, c]) => [k, { power: c.power, threshold: c.threshold }])), rule: 'the radius and elevation window detecting the most synthetic +' + SYNTH_C + ' C errors at a 1 % reference false rate (power = detected / all values with a forecast)' };
    }
    /* the background check: departures from the issued forecast minus the zone median that hour, over the zone spread floored at the buddy
       min_std (wind, which has no buddy check: at the median zone spread of the window) */
    if (Object.keys(bz).length) { const floorW = v === 'W' ? Math.round(quantile(Object.values(bz).flat().map((x) => x.sp), 0.5) * 100) / 100 : null;
      const fl = (z) => v === 'W' ? floorW : (minStd[z] ?? pooledMin);
      const refB = Object.entries(bz).flatMap(([z, L]) => L.filter((x) => x.ref).map((x) => ({ ...x, sp: Math.max(x.sp, fl(z)) })));
      const thrB = {}; for (const [z, L] of Object.entries(bz)) { const R = L.filter((x) => x.ref).map((x) => ({ ...x, sp: Math.max(x.sp, fl(z)) })); if (R.length >= MIN_REF) thrB[z] = kFor(R, 0); }
      background[v] = { num_min: 5, threshold: refB.length >= MIN_REF ? kFor(refB, 0) : 3, threshold_by_zone: thrB, ...(v === 'W' ? { min_std: floorW } : {}), referenceValues: refB.length, source: 'departure from the issued tehsil forecast (temperature at the station height, verify.mjs backgroundOf) minus the zone median that hour, over the zone spread (MAD x 1.4826) floored at ' + (v === 'W' ? 'the median zone spread of the window' : 'the buddy min_std') + '; threshold: the smallest k with at most 1 % of reference values failing' }; }
  }
  return { ...base, version: 'obsqc-91.17.283.14', step, persist, buddy, background,
    derivation: { script: 'scripts/tests28314/derive_params.mjs', window: [from, to], falseRate: FALSE_RATE, minRef: MIN_REF, referenceNetworks: [...REF_NETS], at: new Date().toISOString(),
      data: 'NIGRAAN copies: station-lake/archive/fleet/db/mach_db_YYYY-MM.csv, copies/lamha/data (METAR, partner-network AWS raw), station-lake/archive/synop; issued forecasts data/archive/forecast', sources: A.OB.src } };
}
const here = process.argv[1] && process.argv[1].endsWith('derive_params.mjs');
if (here) { const o = args(process.argv.slice(2)); const out = await derive({ dataDir: o.data, copiesDir: o.copies, lake: o.lake }, o.from, o.to);
  const txt = JSON.stringify(out, null, 1); if (o.write) writeFileSync(join(o.data, 'obs-qc-params.json'), txt + '\n'); process.stdout.write(txt + '\n'); }
