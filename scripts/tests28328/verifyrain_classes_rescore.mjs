/* v91.17.283.28 . V6 · THE RAIN-CLASSES GATE VERDICT RE-SCORED AGAINST QUALITY-CONTROLLED GAUGES AND AGAINST THE SATELLITE (read only)
   The model-gate entry rain-classes (data/model-gate.json) was tested 17 Sep - 22 Oct 2026 against IMERG Late UTC-day tehsil totals only. This
   tool re-scores the same rule (level Low or heavier = at least half of the VALID ensemble members reach 15.6 mm in the Pakistan day; Moderate
   or heavier = 64.5 mm; IMD classes, data/hazard-scale.json rainClasses24h) against
     (a) the MACH gauges with the verification's rain truth (scripts/agents/verify.mjs rainTruthTable: counter increments, flips / stuck /
         isolated gauges held; data/obs-qc-params.json "rain"), at the 0.25 deg ensemble grid point nearest the gauge, and
     (b) the satellite (IMERG Late, Pakistan day, data/imerg/pkt) at the gauge's tehsil on the SAME station-days, and at every tehsil
         (the forecast archive's tehsil point, nearest grid point).
   Ensemble input: the member archive the server keeps (station-lake/archive/ens/ecmwf_ifs025/YYYY/MM/*.npz: 51 members x 1743 points x
   3-hourly sums ending at the valid time). Pakistan day D = (19:00 UTC D-1, 19:00 UTC D]; the 3-hour sum ending 21:00 UTC is split 1/3 to
   the day before and 2/3 to the day (the provider's hourly values inside a native 3-hour step are that step spread evenly). Issue day =
   the Pakistan day of the run's initial time; leads 1-3 = issue day + 1..3 (the served outlook's leads).
   The gate rule (data/model-gate.json alert_rule / evidence_rule) is applied as written: a level passes only with at least MIN_EVENTS
   observed events and the lower end of the 95 % day-block bootstrap interval of the equitable threat score above 0 (the random-forecast
   baseline). Nothing is written to the gate; the result goes to --out.
   usage: node scripts/tests28328/verifyrain_classes_rescore.mjs --data <nigraan-local/data> --lake <station-lake> [--copies <dir>] --out <json> */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const V = await import(pathToFileURL(join(ROOT, 'scripts', 'agents', 'verify.mjs')).href);
const L = await import(pathToFileURL(join(ROOT, 'scripts', 'agents', 'lib.mjs')).href);
const A = L.args(); const dataDir = A.data, lake = A.lake, out = A.out;
const CLASSES = (() => { const H = L.readJson(join(dataDir, 'hazard-scale.json'), null) || L.readJson(join(ROOT, 'data', 'hazard-scale.json'), {}); const v = (H.rainClasses24h || {}).value;
  if (!Array.isArray(v) || v.length < 2) throw new Error('data/hazard-scale.json rainClasses24h.value missing'); return { Low: v[0], Moderate: v[1] }; })();
const MIN_EVENTS = 10, B = 2000, SEED = 2826;

/* .npz (a zip of .npy arrays, deflated) */
function npz(file) { const buf = readFileSync(file); const out = {}; let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16);
  for (let k = 0; k < n; k++) { const meth = buf.readUInt16LE(p + 10), csz = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nl).toString(); p += 46 + nl + xl + cl;
    const lnl = buf.readUInt16LE(off + 26), lxl = buf.readUInt16LE(off + 28); const raw = buf.slice(off + 30 + lnl + lxl, off + 30 + lnl + lxl + csz); const data = meth === 8 ? inflateRawSync(raw) : raw;
    const hl = data.readUInt16LE(8); const head = data.slice(10, 10 + hl).toString(); const descr = /'descr':\s*'([^']+)'/.exec(head)[1]; const shape = /'shape':\s*\(([^)]*)\)/.exec(head)[1].split(',').map((x) => x.trim()).filter(Boolean).map(Number);
    const body = data.slice(10 + hl); const ab = body.buffer.slice(body.byteOffset, body.byteOffset + body.length);
    const arr = descr === '<u2' ? new Uint16Array(ab) : descr === '<f4' ? new Float32Array(ab) : descr === '<f8' ? new Float64Array(ab) : descr === '<i8' ? Array.from(new BigInt64Array(ab), Number) : null;
    out[name.replace(/\.npy$/, '')] = { arr, shape }; }
  return out; }

const runs = []; const base = join(lake, 'archive', 'ens', 'ecmwf_ifs025');
const walk = (d) => { if (!existsSync(d)) return; for (const f of readdirSync(d, { withFileTypes: true })) { const p = join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.npz$/.test(f.name)) runs.push(p); } }; walk(base); runs.sort();
const ctx = { dataDir, copiesDir: A.copies || null, lake }; const stations = await V.loadStations(ctx); const RP = V.rainParams(dataDir); const imergAt = V.imergPktReader(dataDir);
const cells = []; const days = new Set();
for (const f of runs) { const Z = npz(f); const [M, NP, NT] = Z.precipitation.shape; const P = Z.precipitation.arr, vt = Z.valid_unix.arr, la = Z.lat.arr, lo = Z.lon.arr;
  const init = Number((/_(\d{10})\.npz$/.exec(f) || [])[1] ? Date.UTC(+f.slice(-14, -10), +f.slice(-10, -8) - 1, +f.slice(-8, -6), +f.slice(-6, -4)) : NaN); const issue = L.pktDay(init);
  const near = (lat, lon) => { let b = -1, bd = Infinity; for (let i = 0; i < NP; i++) { const d = (la[i] - lat) ** 2 + (lo[i] - lon) ** 2; if (d < bd) { bd = d; b = i; } } return bd <= 0.2 * 0.2 * 2 ? b : -1; };
  /* member day totals at a point for one Pakistan day; null when a member misses a step of the day (not valid) */
  const dayTotals = (pt, D) => { const d0 = L.dayStartMs(D) / 1000, d1 = d0 + 86400; const tot = []; for (let m = 0; m < M; m++) { let s = 0, ok = true, cov = 0;
      for (let t = 0; t < NT; t++) { const e = vt[t], st = e - 3 * 3600; const ov = Math.max(0, Math.min(e, d1) - Math.max(st, d0)); if (!ov) continue; const v = P[(m * NP + pt) * NT + t]; if (v === 65535) { ok = false; break; } s += v / 10 * ov / (3 * 3600); cov += ov; }
      tot.push(ok && cov === 86400 ? s : null); } return tot; };
  const level = (tot) => { const v = tot.filter((x) => x != null); if (v.length < M / 2) return null; const sh = (t) => v.filter((x) => x >= t).length / v.length; return { Low: sh(CLASSES.Low) >= 0.5, Moderate: sh(CLASSES.Moderate) >= 0.5, members: v.length }; };
  const runDays = [1, 2, 3].map((Ld) => [Ld, L.addDays(issue, Ld)]); for (const [, D] of runDays) days.add(D);
  cells.push({ file: f.split(/[\\/]/).slice(-1)[0], init: new Date(init).toISOString(), issue, near, dayTotals, level, runDays }); }
const allDays = [...days].sort(); if (!allDays.length) { console.log('no ensemble runs under ' + base); process.exit(2); }
const w = Math.max(RP.stuck.window_days, RP.isolation.window_days); const from = L.addDays(allDays[0], -(w - 1)), to = allDays[allDays.length - 1];
const RR = V.loadRainRows(ctx, from, to, stations); const dl = []; for (let d = from; d <= to; d = L.addDays(d, 1)) dl.push(d);
const TRUTH = V.rainTruthTable(stations, RR, dl, RP, imergAt).table;
/* tehsil points from the forecast archive (the served tehsil point) */
const FC = await V.loadForecasts(dataDir, cells.map((c) => c.issue)); const tehsilPt = new Map(); for (const m of FC.values()) for (const [u, r] of m) if (!tehsilPt.has(u)) tehsilPt.set(u, [r.lat, r.lon]);
const rows = [];   /* { truth, level, lead, day, f, o } */
for (const c of cells) for (const [Ld, D] of c.runDays) {
  for (const s of stations) { if (s.net !== 'mach') continue; const t = TRUTH.get(s.pid + '|' + D); if (!t || !L.fin(t.mm)) continue; const pt = c.near(s.lat, s.lon); if (pt < 0) continue;
    const lv = c.level(c.dayTotals(pt, D)); if (!lv) continue; rows.push({ truth: 'gauge', lead: Ld, day: D, lv, o: t.mm });
    const im = s.uid ? imergAt(s.uid, D) : null; if (L.fin(im)) rows.push({ truth: 'satellite at the gauges', lead: Ld, day: D, lv, o: im }); }
  for (const [u, [la, lo]] of tehsilPt) { const im = imergAt(u, D); if (!L.fin(im)) continue; const pt = c.near(la, lo); if (pt < 0) continue; const lv = c.level(c.dayTotals(pt, D)); if (!lv) continue; rows.push({ truth: 'satellite at every tehsil', lead: Ld, day: D, lv, o: im }); } }
const ets = (a, b, c, d) => { const n = a + b + c + d; const ar = (a + b) * (a + c) / n; const den = a + b + c - ar; return den > 0 ? (a - ar) / den : null; };
const res = {};
for (const truth of ['gauge', 'satellite at the gauges', 'satellite at every tehsil']) for (const [lvName, thr] of Object.entries(CLASSES)) for (const Ld of [1, 2, 3]) {
  const R = rows.filter((r) => r.truth === truth && r.lead === Ld); if (!R.length) continue; const by = new Map();
  for (const r of R) { const f = r.lv[lvName], o = r.o >= thr; const x = by.get(r.day) || by.set(r.day, [0, 0, 0, 0]).get(r.day); x[f && o ? 0 : f ? 1 : o ? 2 : 3]++; }
  const tot = [0, 0, 0, 0]; for (const x of by.values()) for (let i = 0; i < 4; i++) tot[i] += x[i]; const [a, b, c2, d] = tot;
  const blocks = [...by.values()]; const rnd = L.rng(SEED + Ld); const draws = []; for (let k = 0; k < B; k++) { const s = [0, 0, 0, 0]; for (let j = 0; j < blocks.length; j++) { const x = blocks[Math.floor(rnd() * blocks.length)]; for (let i = 0; i < 4; i++) s[i] += x[i]; } const e = ets(...s); if (e != null) draws.push(e); }
  const e = ets(a, b, c2, d); const lo = draws.length ? L.quantile(draws, 0.025) : null, hi = draws.length ? L.quantile(draws, 0.975) : null; const events = a + c2;
  const pass = events >= MIN_EVENTS && lo != null && lo > 0;
  (res[truth] = res[truth] || {})[lvName + '|' + Ld] = { pairs: R.length, days: by.size, events, forecasts: a + b, hits: a, falseAlarms: b, misses: c2, correctNegatives: d, pod: events ? L.r3(a / events) : null, far: a + b ? L.r3(b / (a + b)) : null, ets: L.r3(e), etsCi95: lo == null ? null : [L.r3(lo), L.r3(hi)], passesGateRule: pass,
    why: pass ? 'events >= ' + MIN_EVENTS + ' and the ETS interval is above 0' : events < MIN_EVENTS ? events + ' observed events (' + MIN_EVENTS + ' needed)' : 'the lower end of the ETS interval (' + L.r3(lo) + ') is not above 0' }; }
const gaugePass = Object.entries(res.gauge || {}).filter(([, v]) => v.passesGateRule).map(([k]) => k);
const O = { built: new Date().toISOString(), what: 'rain-classes gate verdict re-scored (v91.17.283.28 V6); read only: the gate file is not changed by this tool', rule: 'level reached when >= 50 % of the valid members reach the class in the Pakistan day; classes ' + JSON.stringify(CLASSES),
  gateRule: 'a level passes only with >= ' + MIN_EVENTS + ' observed events and the 95 % day-block bootstrap lower bound of the ETS above 0 (beats the random forecast); data/model-gate.json alert_rule / evidence_rule',
  truthGauge: V.RAIN_TRUTH_LABEL + ' (' + V.RAIN_TRUTH_V + ', ' + RP.version + ')', truthSatellite: V.SATELLITE_LABEL + ', Pakistan day (data/imerg/pkt)',
  runs: cells.map((c) => ({ file: c.file, init: c.init, issue: c.issue, days: c.runDays.map(([Ld, D]) => Ld + ':' + D) })),
  limitation: 'only the member runs kept in the station-lake archive (' + cells.length + ' runs); the 27 tehsil ensemble logs the gate entry was tested on (data/ensemble-log) are not in this copy, so this is a check of the verdict, not a replacement test',
  results: res, gaugePassingLevels: gaugePass, decision: gaugePass.length ? 'a level passes against gauges: the owner may review a gate change' : 'no level passes the gate rule against gauges: the gate decision stays (screening, no alerts)' };
if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(O, null, 1)); }
console.log(JSON.stringify({ runs: O.runs.length, decision: O.decision, gauge: res.gauge, sat: res['satellite at the gauges'] }, null, 1).slice(0, 6000));
