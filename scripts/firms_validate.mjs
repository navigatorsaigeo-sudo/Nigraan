#!/usr/bin/env node
/* ══ v91.17.72 · DOES THE UPWIND FIRE LOAD ADD SKILL FOR SMOG DAYS? ═══════════════════════════════════════════════════
   Oct-Dec 2023 and 2024 (2025 FIRMS country archive not published [measured: 404]), Punjab + KP plains tehsils
   (elevation < 500 m), one row per tehsil-day.
   Target: CAMS PM2.5 daily mean ≥ 55.5 µg/m³ (US EPA "Unhealthy" or worse) from the provider's air-quality archive.
   This is the CAMS model, not a monitor: no PM2.5 monitor history is held (smog.mjs header). CAMS assimilates fire
   emissions (GFAS, from MODIS FRP), so a fire signal in CAMS is partly the same fires [inference].
   Predictors (all known at issue for a lead-0 forecast): month (Oct/Nov/Dec), log afternoon ventilation index
   (ERA5 BLH × 10 m wind, 12-16 PKT), daily mean 10 m wind; + the upwind fire load of fires observed on days t-3..t-1
   (server/api/fireload.mjs, ERA5 daily vector wind standing in for the forecast wind).
   Logistic regression, leave-one-season-out (fit 2023 → score 2024 and back). Reports AUC and Brier skill.
   Also: persistence of regional fire counts (days t-3..t-1 vs t..t+4, 2019-2024), smog-day rate by upwind count,
   and load quantiles for the map classes. Writes the result into data/fires-config.json "validation".
     node scripts/firms_validate.mjs --points <archive points json from firms_fetch.mjs --archive --points> [--n 60]
   The provider key is read from MACH_API_KEY / OPEN_METEO_API_KEY or mach.key and never printed. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireLoadAt, vectorWind } from '../server/api/fireload.mjs';
import { fetchArchive, loadFireConfig } from './firms_fetch.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..'), DATA = join(ROOT, 'data');
const a = process.argv.slice(2), arg = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const KEY = process.env.MACH_API_KEY || process.env.OPEN_METEO_API_KEY || (existsSync(join(ROOT, 'mach.key')) ? readFileSync(join(ROOT, 'mach.key'), 'utf8').trim().split(/\s+/)[0] : '');
if (!KEY) { console.error('no provider key'); process.exit(1); }
const C = loadFireConfig(DATA), P = C.params;
const YEARS = [2023, 2024], SMOG = 55.5;

let ptsFile = arg('--points', null);
if (!ptsFile || !existsSync(ptsFile)) { ptsFile = join(process.env.TMPDIR || '/tmp', 'firms_points.json'); await fetchArchive({ dataDir: DATA, pointsFile: ptsFile }); }
const PTS = JSON.parse(readFileSync(ptsFile, 'utf8'));   /* [lat, lon, date, frp, night] */
const byDate = new Map(); for (const [lat, lon, d, frp] of PTS) { if (!byDate.has(d)) byDate.set(d, []); byDate.get(d).push({ lat, lon, frp }); }

const units = JSON.parse(readFileSync(join(ROOT, 'server', 'contract', 'units.json'), 'utf8'))
  .filter(u => !u.disputed && u.lat != null && u.elevM != null && u.elevM < 500 && (u.province === 'Punjab' || u.province === 'Khyber Pakhtunkhwa'));
const N = +arg('--n', 60), step = units.length / N; const sample = []; for (let i = 0; i < N && Math.floor(i * step) < units.length; i++) sample.push(units[Math.floor(i * step)]);
console.log(`  ${units.length} plains tehsils in Punjab/KP, sampled ${sample.length}`);

async function om(host, path, q) {
  const qs = new URLSearchParams({ ...q, apikey: KEY });
  for (let t = 0; t < 3; t++) { const r = await fetch(`https://${host}${path}?${qs}`); if (r.ok) return r.json(); if (t === 2) throw new Error(host + ' ' + r.status); await new Promise(z => setTimeout(z, 3000)); }
}
const addDays = (d, k) => new Date(Date.parse(d + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);
const rows = [];
for (const y of YEARS) {
  for (let i = 0; i < sample.length; i += 20) {
    const b = sample.slice(i, i + 20), base = { latitude: b.map(u => u.lat).join(','), longitude: b.map(u => u.lon).join(','), start_date: y + '-10-01', end_date: y + '-12-31', timezone: 'Asia/Karachi' };
    const A = [].concat(await om('customer-air-quality-api.open-meteo.com', '/v1/air-quality', { ...base, hourly: 'pm2_5' }));
    const M = [].concat(await om('customer-archive-api.open-meteo.com', '/v1/archive', { ...base, hourly: 'wind_speed_10m,wind_direction_10m,boundary_layer_height' }));
    b.forEach((u, k) => {
      const aq = A[k].hourly, me = M[k].hourly, day = new Map();
      const g = (d) => { let o = day.get(d); if (!o) day.set(d, o = { pm: [], ws: [], wd: [], aft: [] }); return o; };
      aq.time.forEach((t, j) => { if (aq.pm2_5[j] != null) g(t.slice(0, 10)).pm.push(aq.pm2_5[j]); });
      me.time.forEach((t, j) => { const o = g(t.slice(0, 10)), h = +t.slice(11, 13); o.ws.push(me.wind_speed_10m[j]); o.wd.push(me.wind_direction_10m[j]); if (h >= 12 && h <= 16 && me.boundary_layer_height[j] != null && me.wind_speed_10m[j] != null) o.aft.push(me.boundary_layer_height[j] * me.wind_speed_10m[j] / 3.6); });
      for (const [d, o] of day) {
        if (o.pm.length < 20 || !o.aft.length) continue;
        const pm = o.pm.reduce((x, z) => x + z, 0) / o.pm.length, vi = o.aft.reduce((x, z) => x + z, 0) / o.aft.length, w = vectorWind(o.ws, o.wd);
        const fires = []; for (let k2 = 1; k2 <= P.windowDays; k2++) { const f = byDate.get(addDays(d, -k2)); if (f) fires.push(...f); }
        const L = fireLoadAt(u.lat, u.lon, w.fromDeg, w.ms, fires, P);
        rows.push({ y, uid: u.unitId, d, m: +d.slice(5, 7), smog: pm >= SMOG ? 1 : 0, pm, lvi: Math.log(Math.max(50, vi)), ws: w.scalarMs ?? 0, ...L });
      }
    });
    process.stdout.write('.');
  }
}
console.log(`\n  ${rows.length} tehsil-days`);

/* ── logistic regression (IRLS, small ridge) ── */
function fit(X, y, lam = 1e-3) {
  const p = X[0].length; let w = new Array(p).fill(0);
  for (let it = 0; it < 50; it++) {
    const H = Array.from({ length: p }, () => new Array(p).fill(0)), g = new Array(p).fill(0);
    for (let i = 0; i < X.length; i++) { const z = X[i].reduce((s, x, j) => s + x * w[j], 0), q = 1 / (1 + Math.exp(-z)), r = q * (1 - q);
      for (let j = 0; j < p; j++) { g[j] += (y[i] - q) * X[i][j]; for (let k = 0; k < p; k++) H[j][k] += r * X[i][j] * X[i][k]; } }
    for (let j = 0; j < p; j++) { H[j][j] += lam * X.length; g[j] -= lam * X.length * w[j]; }
    const s = solve(H, g); w = w.map((x, j) => x + s[j]); if (Math.max(...s.map(Math.abs)) < 1e-8) break;
  }
  return w;
}
function solve(A, b) { const n = b.length, M = A.map((r, i) => [...r, b[i]]); for (let i = 0; i < n; i++) { let m = i; for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[m][i])) m = k; [M[i], M[m]] = [M[m], M[i]]; for (let k = i + 1; k < n; k++) { const f = M[k][i] / M[i][i]; for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j]; } } const x = new Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; } return x; }
const pred = (w, x) => 1 / (1 + Math.exp(-x.reduce((s, v, j) => s + v * w[j], 0)));
function auc(p, y) { const o = p.map((v, i) => [v, y[i]]).sort((a1, b1) => a1[0] - b1[0]); let r = 0, np = 0, nn = 0, rank = 1; for (let i = 0; i < o.length;) { let j = i; while (j < o.length && o[j][0] === o[i][0]) j++; const avg = (rank + rank + j - i - 1) / 2; for (let k = i; k < j; k++) if (o[k][1]) { r += avg; np++; } else nn++; rank += j - i; i = j; } return (r - np * (np + 1) / 2) / (np * nn); }
const brier = (p, y) => p.reduce((s, v, i) => s + (v - y[i]) ** 2, 0) / p.length;
const FEAT = {
  met: (r) => [1, r.m === 11 ? 1 : 0, r.m === 12 ? 1 : 0, r.lvi, r.ws],
  metFire: (r) => [1, r.m === 11 ? 1 : 0, r.m === 12 ? 1 : 0, r.lvi, r.ws, Math.log1p(r.load)],
  metFireIso: (r) => [1, r.m === 11 ? 1 : 0, r.m === 12 ? 1 : 0, r.lvi, r.ws, Math.log1p(r.within)],
};
function cv(name) {
  const f = FEAT[name], P0 = [], Y0 = [], per = {};
  for (const test of YEARS) {
    const tr = rows.filter(r => r.y !== test), te = rows.filter(r => r.y === test);
    /* standardise on the training season */
    const Xtr = tr.map(f), Xte = te.map(f), p = Xtr[0].length, mu = [], sd = [];
    for (let j = 0; j < p; j++) { const v = Xtr.map(x => x[j]); mu[j] = j === 0 ? 0 : v.reduce((s, x) => s + x, 0) / v.length; sd[j] = j === 0 ? 1 : Math.sqrt(v.reduce((s, x) => s + (x - mu[j]) ** 2, 0) / v.length) || 1; }
    const z = (X) => X.map(x => x.map((v, j) => (v - mu[j]) / sd[j]));
    const w = fit(z(Xtr), tr.map(r => r.smog)), pp = z(Xte).map(x => pred(w, x)), yy = te.map(r => r.smog);
    per[test] = { auc: +auc(pp, yy).toFixed(3), brier: +brier(pp, yy).toFixed(4), n: te.length, smogDays: yy.reduce((s, x) => s + x, 0), coefFire: w.length > 5 ? +w[5].toFixed(3) : undefined };
    P0.push(...pp); Y0.push(...yy);
  }
  return { auc: +auc(P0, Y0).toFixed(3), brier: +brier(P0, Y0).toFixed(4), perSeason: per };
}
const res = { met: cv('met'), metFire: cv('metFire'), metFireIso: cv('metFireIso') };
const base = rows.reduce((s, r) => s + r.smog, 0) / rows.length;
const bsClim = base * (1 - base);
for (const k in res) res[k].bss = +(1 - res[k].brier / bsClim).toFixed(3);
res.fireAddsBrierSkill = +(1 - res.metFire.brier / res.met.brier).toFixed(3);
console.log(JSON.stringify(res, null, 1));

/* smog-day rate by upwind count (reason threshold) */
const bins = [[0, 0], [1, 4], [5, 9], [10, 19], [20, 49], [50, 1e9]];
const byBin = bins.map(([lo, hi]) => { const s = rows.filter(r => r.upwind >= lo && r.upwind <= hi); return { upwind: hi > 1e8 ? lo + '+' : lo === hi ? String(lo) : lo + '-' + hi, n: s.length, smogRate: s.length ? +(s.reduce((x, r) => x + r.smog, 0) / s.length).toFixed(3) : null, pm25Median: s.length ? +s.map(r => r.pm).sort((x, z) => x - z)[Math.floor(s.length / 2)].toFixed(1) : null }; });
console.log(byBin);
const r0 = byBin[0].smogRate; const thr = byBin.slice(1).find(b => b.smogRate != null && b.n >= 30 && b.smogRate >= 1.5 * r0);
/* load quantiles among tehsil-days with any load */
const L = rows.map(r => r.load).filter(x => x > 0).sort((x, z) => x - z), q = (p) => L.length ? L[Math.min(L.length - 1, Math.floor(p * L.length))] : null;
const quant = { p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9), nPositive: L.length };
console.log(quant);

/* persistence: regional daily counts (Pakistan Punjab + Indian Punjab + Haryana) from the archive summary */
const AR = JSON.parse(readFileSync(join(DATA, 'fires-archive.json'), 'utf8'));
const pers = [];
for (const [y, Y] of Object.entries(AR.years)) {
  const tot = new Map(); const add = (ser) => (ser || []).forEach(([d, n]) => tot.set(d, (tot.get(d) || 0) + n));
  add(Y.provinces.Punjab); add(Y.sectors.in_punjab); add(Y.sectors.haryana);
  for (let d = y + '-10-04'; d <= y + '-11-26'; d = addDays(d, 1)) {
    let pa = 0, fu = 0; for (let k = 1; k <= 3; k++) pa += tot.get(addDays(d, -k)) || 0; for (let k = 0; k < 5; k++) fu += tot.get(addDays(d, k)) || 0;
    pers.push([Math.log1p(pa / 3), Math.log1p(fu / 5)]);
  }
}
const corr = (P2) => { const n = P2.length, mx = P2.reduce((s, p) => s + p[0], 0) / n, my = P2.reduce((s, p) => s + p[1], 0) / n; let sxy = 0, sxx = 0, syy = 0; for (const [x, y] of P2) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };
const persistence = { r_log: +corr(pers).toFixed(3), n: pers.length, what: 'Pearson r of log(1+mean daily fires) over days t-3..t-1 vs t..t+4, Pakistan Punjab + Indian Punjab + Haryana, 4 Oct-26 Nov 2019-2024' };
console.log(persistence);

const V = {
  built: new Date().toISOString().slice(0, 10), script: 'scripts/firms_validate.mjs',
  n: rows.length, tehsils: sample.length, seasons: 'Oct-Dec ' + YEARS.join(', '), smogThreshold: SMOG,
  target: 'CAMS PM2.5 daily mean >= 55.5 ug/m3 (model archive via the provider; no monitor history held). CAMS includes GFAS fire emissions, so part of any fire signal is shared input [inference].',
  baseRate: +base.toFixed(3), models: res, byUpwindCount: byBin, loadQuantiles: quant, persistence,
  reasonThreshold: thr ? { minFires: +thr.upwind.split(/[-+]/)[0], rule: 'smallest upwind-count bin (n >= 30) whose smog-day rate is >= 1.5x the rate with no upwind fire', bin: thr } : { minFires: null, rule: 'no bin reached 1.5x the no-fire rate' },
  note: '2025 not measured: the FIRMS 2025 country archive answered 404 on 26 Sep 2026.',
};
const cfg = JSON.parse(readFileSync(join(DATA, 'fires-config.json'), 'utf8'));
cfg.validation = V; writeFileSync(join(DATA, 'fires-config.json'), JSON.stringify(cfg, null, 2) + '\n');
console.log('  wrote data/fires-config.json validation');
