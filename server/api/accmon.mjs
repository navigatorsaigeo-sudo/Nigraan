/* ══ v91.17.273 · ACCURACY MONITOR (operator only) ═══════════════════════════════════════════════════════════════════════════════
   Why: the 16 Oct 2026 evening fault (frozen MACH readings fed the live layer; Islamabad served 23.8 °C while MACH 1 read 18.8) was seen
   by the owner, not by NIGRAAN. This module pairs, every hour, the temperature NIGRAAN SERVED at a station's coordinate with what the
   station measured, and says when a city's error leaves its own normal range.

   Pairs (one per station and UTC hour):
     MACH     every clean station of the last poll (the fleet's five-rule screen and the stuck / replayed reading screen passed, not
              excluded in data/mach-fleet-stations.json, reading at most the live layer's age limit old). Served = the served chain up
              to the live layer at that station and hour (the fleet pairs' own forecast cache: the same chain a customer's request goes
              through) + the live MACH layer at that coordinate with THIS station left out (hyperlocal.looAt). Leaving the scored station out measures
              the chain a customer gets between stations instead of the station echoing itself.
     synop    every synoptic / airport report the synoptic module holds (12 days). Served = its own pair value (the full chain without
              the two live terms, __nolive) + the synoptic running term as it stood before that report (synop.termAt) + the live MACH
              layer of that hour (hyperlocal.atHour, the 30-h history). A report whose hour
              the history no longer holds is scored only where no registered MACH station lies within the layer's radius.
   Statistics, rolling 24 h and 7 d: MAE, bias (observed minus served is the error; bias = mean of served minus observed, so + = served
   too warm), n, worst station (largest mean absolute error with at least 3 pairs), per city cluster and per zone, and national.
     city cluster   the stations within 40 km (the live layer's radius) of a named city: GeoNames PPLC / PPLA / PPLA2 (the national,
                    provincial and district seats) named by data/accmon-register.json (v283.16 set, v283.20). A station near two seats counts for both.
     zone           data/model-zone.json's zone rule at the station (mos.zoneOfPoint): plains, hills, mountain, coast.
   Flag (data-derived, no typed limit): a city is flagged when its 24-h MAE, or its 24-h |bias|, is above the 95th percentile of the
   same statistic in its own hourly record of the past 30 days (the last 24 h left out, so the window under test is not its own
   reference). Until the city's own record spans 14 days, the national record (every city's hourly values, same window) is the
   reference, and the flag says so. A 24-h statistic needs at least 6 pairs (a quarter of a day's hours) to be judged; a reference
   needs at least 48 hourly values. v91.17.277: a window thinner than the reference windows (stations or reports missing) must lie
   beyond the percentile by more than its extra sampling noise (ACC_RULE.why.noiseZ).
   Job freshness (flags in /health accMon): the ensemble archive saved a run today (PKT; nig/archive/ens/index.jsonl), the copies
   retention ran within its monthly cycle, the METAR and MACH copies are fresh (copies.mjs gate) and the synoptic poll ran within 2 h.
   Persisted: data/accmon/YYYY-MM.jsonl, one line per hour of pairs ({ty:'h'}, temperatures in tenths), one per hourly city snapshot
   ({ty:'s'}), one per new station ({ty:'m'}); about 2 MB a month. Read back at start (this and last month).
   Cost: hourly in the bulk slot, lookups only (no provider call, no file the server does not already read); measured < 50 ms CPU.
   Backfill (once, when the monitor holds no pairs): the copied MACH database days the copies hold, hour by hour, with the live
   layer replayed from those readings (hyperlocal.replay) and the served chain from the fleet pairs file (station-lake, read only,
   as recorded when served) or the pairs' forecast cache. Before the stuck-reading hotfix went live (HOTFIX_AT, 16 Oct 2026 22:20 PKT,
   v272 INTEGRATE.md) the layer is replayed from every reading, as it was served; after it, from the screened readings. The self-test
   (selftest) compares both replays on the same hours: the 16 Oct evening fault and its removal.
   NIGRAAN_ACCMON=0 switches it off. Client view: nothing (no route, no text, no skill number). */
import { existsSync, mkdirSync, readFileSync, appendFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { Worker } from 'node:worker_threads';
import { gunzipSync } from 'node:zlib';
import { schedule } from './scheduler.mjs';
import * as QC from './obsqc.mjs';   /* v91.17.283.14 · the value-level quality control of the readings it replays */
import { streamCsv, pick, utcMs } from './copies.mjs';
import { ownDir } from './ownpaths.mjs';

/* v91.17.277 · ACCFLAG · the standard normal quantile (Acklam's rational approximation, |error| < 1.2e-9): the sampling-noise margin
   below uses the same confidence level as the reference percentile (refPct), so no second number is typed */
export function probit(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239], b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572],
    c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783], d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416], lo = 0.02425;
  if (!(p > 0 && p < 1)) return NaN;
  if (p < lo) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - lo) return -probit(1 - p);
  const q = p - 0.5, r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
/* v91.17.277 · ACCFLAG 2 · the station's siting offset as the live layer itself applies it (hyperlocal.mjs rowsFrom: the record from
   fleet.offsetFor, i.e. data/mach-offsets.json / sitingoffsets.mjs; day-part by PKT hour: 09-16 day, 20-05 night, else between; a
   part without a fitted offset = 0). The monitor scores the reading minus this offset: a rooftop station the layer already corrects
   (16 Oct 2026: Gilgit MACH 105, +3.1..+3.5 C warm at night vs the Gilgit synop 2.6 km away, night offset +2.65) is scored as the layer
   uses it, not as a forecast error. A station without an offset is scored as before. Parity with the layer: tests277 accflag O1. */
export function siteOffsetC(o, obsMs) {
  if (!o || !o.off || !Number.isFinite(obsMs)) return 0; const lh = new Date(obsMs + 5 * 3600e3).getUTCHours();
  const part = lh >= 9 && lh <= 16 ? 'day' : (lh >= 20 || lh <= 5) ? 'night' : 'between'; const v = o.off[part]; return Number.isFinite(v) ? v : 0;
}
export const ACC_RULE = Object.freeze({ cityKm: 40, minN: 6, refPct: 0.95, ownDays: 14, refDays: 30, minRef: 48, worstMinN: 3, keepPairsDays: 8, keepSnapDays: 31,
  hotfixAt: '2026-10-16T17:20:00Z', synopMaxAgeH: 2, noiseZ: Math.round(probit(0.95) * 1e4) / 1e4, why: {
    noiseZ: 'v91.17.277: a window with fewer pairs than the reference windows (n < nRef, the median n of the reference values) is flagged only when its MAE (or |bias|) minus noiseZ x sd x sqrt(1/n - 1/nRef) still lies beyond the reference 95th percentile (sd: the reference\'s median pair sd, else the window\'s); noiseZ = the one-sided normal quantile at refPct (1.6449)',
    cityKm: 'the live layer radius (data/hyperlocal-model.json radius_km)', minN: 'a quarter of a day\'s hours', refPct: 'owner order: beyond the 95th percentile of its own past-30-day distribution',
    ownDays: 'owner order: own record once 14 days exist; before, the zone record (owner decision 17 Oct 2026), national only when the zone holds fewer than minRef values', minRef: 'two days of hourly values', hotfixAt: 'stuck-reading hotfix v91.17.271.1 deployed 16 Oct 2026 22:20 PKT (v272 INTEGRATE.md)' } });

const PKT = 5 * 3600e3, H = 3600e3, D = 864e5;
const km = (a, b, c, d) => { const p = Math.PI / 180, x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
const r2 = (x) => Math.round(x * 100) / 100, r1 = (x) => Math.round(x * 10) / 10;
const hourOf = (ms) => Math.round(ms / H) * H;
const iso = (ms) => new Date(ms).toISOString().slice(0, 16) + 'Z';
/* v91.17.273.1 · a cooperative time slice: the monitor never holds the event loop longer than SLICE_MS at a time (the live deploy check
   of 17 Oct 2026 saw the point forecast answer ok:false while the first-start backfill ran in one piece) */
export const SLICE_MS = 8;
export const SLICE_STATS = { max: 0, n: 0 };   /* the longest slice seen (ms), for /api/accuracy and the tests */
export function slicer(ms = SLICE_MS) { let t = performance.now(); const f = async () => { const d = performance.now() - t; if (d >= ms) { if (d > SLICE_STATS.max) SLICE_STATS.max = Math.round(d * 10) / 10; SLICE_STATS.n++; await new Promise((r) => setImmediate(r)); t = performance.now(); } }; f.reset = () => { t = performance.now(); }; return f; }
const pktIso = (ms) => new Date(ms + PKT).toISOString().slice(0, 16).replace('T', ' ') + ' PKT';
/* the q-quantile (linear between order statistics, as numpy's default) by selection, not a full sort: the national pool holds up to
   30 days x 24 h x ~120 cities values and is read once an hour */
function kth(a, k) { let l = 0, r = a.length - 1; while (r > l) { const p = a[(l + r) >> 1]; let i = l, j = r; while (i <= j) { while (a[i] < p) i++; while (a[j] > p) j--; if (i <= j) { const t = a[i]; a[i] = a[j]; a[j] = t; i++; j--; } } if (k <= j) r = j; else if (k >= i) l = i; else return a[k]; } return a[k]; }
export const pct = (a0, q) => { if (!a0.length) return null; const a = Float64Array.from(a0); const i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); const x = kth(a, lo); if (hi === lo) return x; let y = Infinity; for (let k = lo + 1; k < a.length; k++) if (a[k] < y) y = a[k]; return x + (y - x) * (i - lo); };

/* the statistic of a list of errors e = served - observed */
function stat(errs) { if (!errs.length) return null; let s = 0, a = 0; for (const e of errs) { s += e; a += Math.abs(e); } return { n: errs.length, mae: r2(a / errs.length), bias: r2(s / errs.length) }; }

/* v91.17.283.20 · item A6 · the city set of the accuracy monitor is the v283.16 definition again (so the scores stay comparable across
   releases), held in a data register, not in code: data/accmon-register.json names the source table and the feature codes (GeoNames
   PPLC / PPLA / PPLA2: the national, provincial and district seats), one city per name (first row), at the row's point and height */
export function citySetRule(dataDir) { try { return JSON.parse(readFileSync(join(dataDir, 'accmon-register.json'), 'utf8')).citySet || null; } catch (_) { return null; } }
export function loadCities(dataDir) {
  const out = [], seen = new Set(), R = citySetRule(dataDir); if (!R || !R.table || !Array.isArray(R.featureCodes) || !R.columns) return out;
  const FC = new Set(R.featureCodes), C = R.columns;
  try { const t = gunzipSync(readFileSync(join(dataDir, R.table))).toString('utf8');
    for (const line of t.split('\n')) { const c = line.split('\t'); if (c.length < C.minColumns) continue; if (!FC.has(c[C.featureCode])) continue;
      const lat = Number(c[C.lat]), lon = Number(c[C.lon]); if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const name = c[C.name] || c[C.nameFallback]; if (seen.has(name)) continue; seen.add(name);
      out.push({ name, lat, lon, pop: Number(c[C.pop]) || 0, el: c[C.elev] !== undefined && c[C.elev] !== '' && Number.isFinite(Number(c[C.elev])) ? Number(c[C.elev]) : null }); } } catch (_) {}
  return out;
}

export function createAccMon(app, root, dataDir, opts = {}) {
  const R = ACC_RULE, on = () => process.env.NIGRAAN_ACCMON !== '0';
  let QCP = null; try { QCP = QC.loadParams(dataDir); } catch (_) { QCP = null; }   /* v91.17.283.14 */
  const dir = opts.dir || join(dataDir, 'accmon');
  const now = () => (opts.now ? opts.now() : Date.now());
  const CITIES = opts.cities || loadCities(dataDir);
  const META = new Map();     /* id -> { name, lat, lon, kind, zone, cities[] } */
  let pendingMeta = [];      /* new stations, written with the next pairs */
  const PAIRS = new Map();    /* hourMs -> Map(id -> [o, s]) */
  const SNAP = new Map();     /* hourMs -> { city: [mae, bias, n] } */
  const BSNAP = new Map();    /* 6-h block start (ms) -> { city: [mae, bias, n] } */
  /* ══ v91.17.278 · FIX278 4 · A STATION EXCLUDED NOW COUNTS NOWHERE ══════════════════════════════════════════════════════════════
     Khaplu was excluded in data/mach-fleet-stations.json (v91.17.277) yet Khaplu stayed flagged after the deploy: its pairs written before
     the exclusion were read back into the 24-h / 7-d windows, and the hourly city snapshots the 95th-percentile references are built from
     still held them. The exclusion was read from the registry at run time (v91.17.283.14: no station is excluded any more - values are
     judged by obsqc.mjs - so the set below is empty and this subtraction is dormant; kept for the snapshots written before):
       - its pairs are never put in the held pairs (load) and never counted in a window (windowStats);
       - they are kept aside (EXP, for the snapshot span) only to take them back out of every stored snapshot whose window held them: a
         snapshot cell is [mae, bias, n, sd |e|, sd e (, raw mae, raw bias)], so the sums n, sum e, sum |e|, sum e^2 are recovered from it
         and the excluded pairs are subtracted exactly (to the 0.01 rounding of the stored cell); a cell left under minN pairs is dropped;
       - a snapshot written from this version on records the stations already left out of it (ex), so nothing is taken out twice. */
  const EXP = new Map();      /* hourMs -> Map(id -> [o, s(, raw)]) of stations excluded now */
  const SNEX = { s: new Map(), b: new Map() };   /* snapshot / block start -> Set(ids already left out when it was written) */
  const exIds = () => new Set();   /* v91.17.283.14 · no station is excluded any more (obsqc.mjs judges values): nothing to subtract */
  const CLEAN = new Map();
  function cleanSnap(kind, hk, c) {
    if (!EXP.size || !c) return c; const key = kind + hk; const k0 = CLEAN.get(key); if (k0 && k0.c === c) return k0.v;
    const done = SNEX[kind].get(hk) || null, h0 = kind === 's' ? hk - 23 * H : hk, h1 = kind === 's' ? hk : hk + 5 * H;
    const sub = new Map();   /* city -> [n, sum e, sum |e|, sum e^2, sum e raw, sum |e raw|] */
    for (let h = h0; h <= h1; h += H) { const M = EXP.get(h); if (!M) continue;
      for (const [id, v] of M) { if (done && done.has(id)) continue; const m = META.get(id); if (!m) continue; const e = v[1] - v[0], er = v.length > 2 ? v[1] - v[2] : e;
        for (const city of m.cities || []) { if (!c[city]) continue; const a = sub.get(city) || [0, 0, 0, 0, 0, 0]; a[0]++; a[1] += e; a[2] += Math.abs(e); a[3] += e * e; a[4] += er; a[5] += Math.abs(er); sub.set(city, a); } } }
    let v = c; if (sub.size) { v = { ...c };
      for (const [city, a] of sub) { const x = c[city], n = x[2], n2 = n - a[0]; if (n2 < R.minN) { delete v[city]; continue; }
        const S1 = x[1] * n - a[1], A = x[0] * n - a[2], m2 = S1 / n2, mae2 = A / n2;
        if (x.length >= 5 && x[3] != null && x[4] != null) { const Q = x[4] * x[4] * (n - 1) + n * x[1] * x[1] - a[3];
          const y = [r2(mae2), r2(m2), n2, sdOf(n2, Q, mae2), sdOf(n2, Q, m2)];
          if (x.length >= 7) y.push(r2((x[5] * n - a[5]) / n2), r2((x[6] * n - a[4]) / n2)); v[city] = y; }
        else v[city] = [r2(mae2), r2(m2), n2]; } }
    CLEAN.set(key, { c, v }); return v;
  }
  const st = { runs: 0, lastRun: null, lastMs: null, cpuMs: null, added: 0, lastError: null, backfill: null, loaded: 0, last: null };

  /* ── station meta ── */
  function zoneOf(lat, lon, el) { try { return app.mos && app.mos.zoneOfPoint ? app.mos.zoneOfPoint(lat, lon, el) : null; } catch (_) { return null; } }
  /* a city's zone: the same zone rule (mos.zoneOfPoint) at the seat's own position and gazetteer height */
  const CZ = new Map(); const cityZone = (name) => { if (CZ.has(name)) return CZ.get(name); const c = CITIES.find((x) => x.name === name); const z = c ? zoneOf(c.lat, c.lon, c.el) : null; CZ.set(name, z); return z; };
  function citiesOf(lat, lon) { return CITIES.filter((c) => km(lat, lon, c.lat, c.lon) <= R.cityKm).map((c) => c.name); }
  function meta(id, m) {
    let x = META.get(id); if (x) { if (x._w === false && !m.noWrite) { x._w = true; pendingMeta.push({ ty: 'm', id, name: x.name, lat: x.lat, lon: x.lon, kind: x.kind, zone: x.zone }); } return x; }
    x = { name: m.name || id, lat: m.lat, lon: m.lon, kind: m.kind, zone: m.zone !== undefined ? m.zone : zoneOf(m.lat, m.lon, m.el ?? null) };
    x.cities = citiesOf(x.lat, x.lon); META.set(id, x);
    if (!m.noWrite) pendingMeta.push({ ty: 'm', id, name: x.name, lat: x.lat, lon: x.lon, kind: x.kind, zone: x.zone });
    return x;
  }
  /* ── file ── */
  function write(lines) { if (opts.noWrite || !lines.length) return; try { mkdirSync(dir, { recursive: true }); const byM = new Map();
      for (const l of lines) { const m = String(l.t || new Date(now()).toISOString()).slice(0, 7); (byM.get(m) || byM.set(m, []).get(m)).push(JSON.stringify(l)); }
      for (const [m, ls] of byM) appendFileSync(join(dir, m + '.jsonl'), ls.join('\n') + '\n'); } catch (e) { st.lastError = 'write: ' + e.message; } }
  function load() {
    if (!existsSync(dir)) return; const t = now(); const EXN = exIds(); const months = new Set([new Date(t).toISOString().slice(0, 7), new Date(t - 32 * D).toISOString().slice(0, 7)]);
    for (const f of readdirSync(dir).filter((x) => /^\d{4}-\d{2}\.jsonl$/.test(x)).sort()) { if (!months.has(f.slice(0, 7))) continue;
      for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) { if (!line) continue; let j; try { j = JSON.parse(line); } catch (_) { continue; }
        if (j.ty === 'm') { if (!META.has(j.id)) META.set(j.id, { name: j.name, lat: j.lat, lon: j.lon, kind: j.kind, zone: j.zone, cities: citiesOf(j.lat, j.lon) }); }
        else if (j.ty === 'h') { const ms = Date.parse(j.t); const age = t - ms; if (age > R.keepSnapDays * D + D) continue; const keep = age <= R.keepPairsDays * D; let M = null;
          for (const [id, o, s, w] of j.p) { const v = w != null ? [o / 10, s / 10, w / 10] : [o / 10, s / 10];
            if (EXN.has(id)) { const X = EXP.get(ms) || EXP.set(ms, new Map()).get(ms); X.set(id, v); st.excludedPairs = (st.excludedPairs || 0) + 1; continue; }
            if (!keep) continue; M = M || PAIRS.get(ms) || PAIRS.set(ms, new Map()).get(ms); M.set(id, v); } if (keep) st.loaded++; }
        else if (j.ty === 's') { const ms = Date.parse(j.t); if (t - ms > R.keepSnapDays * D) continue; SNAP.set(ms, j.c); if (Array.isArray(j.ex)) SNEX.s.set(ms, new Set(j.ex)); }
        else if (j.ty === 'b') { const ms = Date.parse(j.t); if (t - ms > R.keepSnapDays * D) continue; BSNAP.set(ms, j.c); if (Array.isArray(j.ex)) SNEX.b.set(ms, new Set(j.ex)); }
        else if (j.ty === 'bf') st.bf = j; } }
  }
  function prune() { const t = now(); for (const k of PAIRS.keys()) if (t - k > R.keepPairsDays * D) PAIRS.delete(k); for (const k of SNAP.keys()) if (t - k > R.keepSnapDays * D) SNAP.delete(k); for (const k of EXP.keys()) if (t - k > R.keepSnapDays * D + D) EXP.delete(k); for (const k of BSNAP.keys()) if (t - k > R.keepSnapDays * D) BSNAP.delete(k); }
  /* v91.17.277 · ACCFLAG 3 · raw = the reading as measured, kept (3rd value; 4th in the file line, tenths) when the station has a siting
     offset (o = raw - offset differs); flags use o, the "as measured" view and the night siting line use raw */
  function add(hourMs, id, o, s, out, raw = null) { const M = PAIRS.get(hourMs) || PAIRS.set(hourMs, new Map()).get(hourMs); if (M.has(id)) return false; const hasRaw = Number.isFinite(raw) && Math.round(raw * 10) !== Math.round(o * 10);
    M.set(id, hasRaw ? [r1(o), r1(s), r1(raw)] : [r1(o), r1(s)]); (out.get(hourMs) || out.set(hourMs, []).get(hourMs)).push(hasRaw ? [id, Math.round(o * 10), Math.round(s * 10), Math.round(raw * 10)] : [id, Math.round(o * 10), Math.round(s * 10)]); return true; }
  const flush = (out, src) => { const m = pendingMeta; pendingMeta = []; write(m.concat([...out].sort((a, b) => a[0] - b[0]).map(([ms, p]) => ({ ty: 'h', t: iso(ms), src, p })))); };

  /* ── live collection ── */
  function machNear(lat, lon) { const rk = (app.hyperlocal && app.hyperlocal.radiusKm && app.hyperlocal.radiusKm()) || R.cityKm; try { return (app.fleet.stations() || []).some((s) => Number.isFinite(s.lat) && km(lat, lon, s.lat, s.lon) <= rk); } catch (_) { return true; } }
  async function collect(Y) {
    const out = new Map(); let nM = 0, nS = 0; const t = now();
    /* MACH */
    let rows = []; try { rows = app.fleet && app.fleet.liveReadings ? app.fleet.liveReadings() : []; } catch (_) {}
    const maxAge = ((app.hyperlocal && app.hyperlocal.maxAgeMin && app.hyperlocal.maxAgeMin()) || 60) * 60e3;
    for (const r of rows) {
      if (t - r.obsMs > maxAge || !Number.isFinite(r.served) || !Number.isFinite(r.tempC)) continue;
      const id = 'm:' + r.key; const hk = hourOf(r.obsMs);
      if (PAIRS.has(hk) && PAIRS.get(hk).has(id)) continue;
      let dT = 0; if (app.hyperlocal && app.hyperlocal.looAt) { try { dT = app.hyperlocal.looAt(r.lat, r.lon, r.key).dT || 0; } catch (_) { dT = 0; } }
      meta(id, { name: r.name, lat: r.lat, lon: r.lon, kind: 'mach', el: (() => { try { return app.fleet.elevOf(r.key); } catch (_) { return null; } })() });
      let o = r.offset; if (o === undefined) { try { o = app.fleet.offsetFor ? app.fleet.offsetFor(r.key) : null; } catch (_) { o = null; } }
      if (add(hk, id, r.tempC - siteOffsetC(o, r.obsMs), r.served + dT, out, r.tempC)) nM++;
    }
    /* synop and airports */
    let SY = null; try { SY = app.synop && app.synop.records ? app.synop.records() : null; } catch (_) {}
    await Y();
    if (SY) for (const [sid, recs] of Object.entries(SY.records || {})) { await Y(); const s0 = (SY.stations || {})[sid]; if (!s0 || !Number.isFinite(s0.lat)) continue;
      let MN = null;   /* per station, once (not per report) */
      const id = (s0.kind === 'metar' ? 'a:' : 's:') + sid;
      for (const [tt, v] of Object.entries(recs)) { const ms = Date.parse(tt); if (!Number.isFinite(ms) || t - ms > R.keepPairsDays * D || ms > t) continue;
        if (!v || !Number.isFinite(v.o) || !Number.isFinite(v.s)) continue; const hk = hourOf(ms); if (PAIRS.has(hk) && PAIRS.get(hk).has(id)) continue;
        /* v91.17.273 integration: the cheap live-layer test first; a report it skips (no layer history for that hour near a MACH station) no
           longer pays for the running term every hour (8,224 held reports: 146 ms -> see CHANGES; same pairs, same values) */
        let live = 0; { const a = app.hyperlocal && app.hyperlocal.atHour ? app.hyperlocal.atHour(ms, s0.lat, s0.lon) : 0; if (a == null) { if (MN == null) MN = machNear(s0.lat, s0.lon); if (MN) continue; } else live = a; }
        const term = app.synop.termAt ? app.synop.termAt(sid, ms) : null;
        meta(id, { name: s0.name || sid, lat: s0.lat, lon: s0.lon, kind: s0.kind === 'metar' ? 'airport' : 'synop', el: s0.elevM ?? null });
        if (add(hk, id, v.o, v.s + (term || 0) + live, out)) nS++; } }
    flush(out, 'live'); st.added += nM + nS; return { mach: nM, synop: nS };
  }

  /* ── statistics ── */
  /* one pass over the held pairs: per station sums (n, sum, sum of |e|), then city / zone / national from the sums */
  /* v91.17.277 · ACCFLAG · also the sum of e^2: the sample standard deviations of e (for the bias) and of |e| (for the MAE) of the window's
     pairs, from which flagsAt / blockFlags take each statistic's standard error */
  const sdOf = (n, sq, m) => (n > 1 ? r2(Math.sqrt(Math.max(0, sq - n * m * m) / (n - 1))) : null);
  function windowStats(t, hours, ids, PX = PAIRS) {
    const per = new Map(), from = t - hours * H;   /* id -> [n, sum e, sum |e|, sum e^2, sum e raw, sum |e raw|, pairs with a raw reading] */
    const EXN = exIds();
    for (const [hk, M] of PX) { if (hk <= from || hk > t) continue; for (const [id, v] of M) { if (ids && !ids.has(id)) continue; if (EXN.has(id)) continue; const e = v[1] - v[0], er = v.length > 2 ? v[1] - v[2] : e; let a = per.get(id); if (!a) { a = [0, 0, 0, 0, 0, 0, 0]; per.set(id, a); } a[0]++; a[1] += e; a[2] += e < 0 ? -e : e; a[3] += e * e; a[4] += er; a[5] += er < 0 ? -er : er; if (v.length > 2) a[6]++; } }
    const G = { city: new Map(), zone: new Map() }, N = [0, 0, 0];
    const acc = (map, k, id, a) => { let g = map.get(k); if (!g) { g = { n: 0, s: 0, a: 0, q: 0, rs: 0, ra: 0, off: 0, st: 0, worst: null }; map.set(k, g); } g.n += a[0]; g.s += a[1]; g.a += a[2]; g.q += a[3]; g.rs += a[4]; g.ra += a[5]; if (a[6]) g.off++; g.st++;
      if (a[0] >= R.worstMinN) { const mae = a[2] / a[0]; if (!g.worst || mae > g.worst.mae) g.worst = { id, mae, a }; } };
    for (const [id, a] of per) { const m = META.get(id); if (!m) continue; N[0] += a[0]; N[1] += a[1]; N[2] += a[2];
      for (const c of m.cities || []) acc(G.city, c, id, a); acc(G.zone, m.zone || 'unknown', id, a); }
    const out = (g) => { const w = g.worst ? { id: g.worst.id, name: (META.get(g.worst.id) || {}).name || g.worst.id, kind: (META.get(g.worst.id) || {}).kind || null, n: g.worst.a[0], mae: r2(g.worst.a[2] / g.worst.a[0]), bias: r2(g.worst.a[1] / g.worst.a[0]) } : null;
      return { n: g.n, mae: r2(g.a / g.n), bias: r2(g.s / g.n), sdAbs: sdOf(g.n, g.q, g.a / g.n), sdE: sdOf(g.n, g.q, g.s / g.n), stations: g.st, worst: w, ...(g.off ? { offsetStations: g.off, rawMae: r2(g.ra / g.n), rawBias: r2(g.rs / g.n) } : {}) }; };
    return { national: N[0] ? { n: N[0], mae: r2(N[2] / N[0]), bias: r2(N[1] / N[0]) } : null, city: Object.fromEntries([...G.city].map(([k, g]) => [k, out(g)])), zone: Object.fromEntries([...G.zone].map(([k, g]) => [k, out(g)])) };
  }
  /* v91.17.277: [mae, bias, n, sd |e|, sd e]; older records hold the first three (no noise margin is taken for them) */
  const cell = (v) => (v.sdAbs != null && v.sdE != null ? (v.offsetStations ? [v.mae, v.bias, v.n, v.sdAbs, v.sdE, v.rawMae, v.rawBias] : [v.mae, v.bias, v.n, v.sdAbs, v.sdE]) : [v.mae, v.bias, v.n]);
  function snapshot(t, s24, SX = SNAP) { const hk = Math.floor(t / H) * H; const c = {}; for (const [k, v] of Object.entries(s24.city)) if (v.n >= R.minN) c[k] = cell(v); SX.set(hk, c); const ex = [...exIds()]; if (SX === SNAP) SNEX.s.set(hk, new Set(ex)); return { ty: 's', t: iso(hk), c, ...(ex.length ? { ex } : {}) }; }
  /* v91.17.277 · ACCFLAG · the sampling-noise margin of a window statistic. The reference percentile is taken over windows that held
     about nRef pairs (the median n of the reference values), so it already contains the chance spread of an nRef-pair mean. A window
     with fewer pairs (stations or reports missing that day) has more: the extra standard error is sd x sqrt(1/n - 1/nRef), and the
     window is flagged only when its value stays beyond the percentile after noiseZ times that. 0 when n >= nRef or no sd is known.
     Measured alternative not adopted: the full sd / sqrt(n) margin (flag rate 5.3 % -> 2.5 % of city-hours on the laptop record) counts
     the chance spread twice and stops flagging the 12 Oct Islamabad stuck-reading evening (tests273 S4 / S6) */
  const margin = (sd, n, nRef) => (sd != null && Number.isFinite(sd) && n > 1 && Number.isFinite(nRef) && nRef > n ? r2(R.noiseZ * sd * Math.sqrt(1 / n - 1 / nRef)) : 0);
  /* the spread is the reference's normal one (median sd over the reference values) when the reference carries it, so a fault does not
     widen its own margin; else the window's own sd */
  function judge(mae, bias, n, sdAbs, sdE, ref, label) { const why = [], mM = margin(ref.sdAbsRef != null ? ref.sdAbsRef : sdAbs, n, ref.nRef), mB = margin(ref.sdERef != null ? ref.sdERef : sdE, n, ref.nRef);
    if (mae - mM > ref.maeP95) why.push(label + 'MAE ' + mae + ' °C above its 95th percentile ' + ref.maeP95 + (mM ? ' beyond sampling noise (±' + mM + ', n ' + n + ')' : ''));
    if (Math.abs(bias) - mB > ref.absBiasP95) why.push(label + 'bias ' + (bias > 0 ? '+' : '') + bias + ' °C beyond its 95th percentile ±' + ref.absBiasP95 + (mB ? ' beyond sampling noise (±' + mB + ', n ' + n + ')' : ''));
    return { why, noise: { mae: mM, bias: mB } }; }
  /* the reference record at t, read in one pass: each city's own hourly values and the national pool (the last 24 h left out) */
  /* v91.17.277 · the reference's normal pair spread: the median sd of |e| and of e over the same reference values (records written from
     v91.17.277 on carry them); null when fewer than need values carry one (then the window's own sd is used) */
  const push = (q, v) => { q.mae.push(v[0]); q.ab.push(Math.abs(v[1])); (q.nn || (q.nn = [])).push(v[2]); if (v.length >= 5 && v[3] != null && v[4] != null) { q.sa.push(v[3]); q.se.push(v[4]); } };
  const sdRef = (q, need) => ({ ...(q.sa && q.sa.length >= need ? { sdAbsRef: r2(pct(q.sa, 0.5)), sdERef: r2(pct(q.se, 0.5)) } : { sdAbsRef: null, sdERef: null }), nRef: q.nn && q.nn.length ? pct(q.nn, 0.5) : null });
  function refIndex(t, SX = SNAP) {
    const own = new Map(), nat = { mae: [], ab: [], sa: [], se: [] }, zone = new Map();
    for (const [hk, c0] of SX) { if (hk >= t - 24 * H || hk < t - R.refDays * D) continue; const c = SX === SNAP ? cleanSnap('s', hk, c0) : c0;
      for (const k in c) { const v = c[k]; push(nat, v); let o = own.get(k); if (!o) { o = { mae: [], ab: [], sa: [], se: [], first: hk }; own.set(k, o); } push(o, v); if (hk < o.first) o.first = hk;
        const z = cityZone(k) || 'unknown'; let q = zone.get(z); if (!q) { q = { mae: [], ab: [], sa: [], se: [] }; zone.set(z, q); } push(q, v); } }
    const zP = new Map(); let natP = null;
    return { own, nat, zone, zoneP: (z) => { if (!zP.has(z)) { const q = zone.get(z); zP.set(z, q ? { maeP95: r2(pct(q.mae, R.refPct)), absBiasP95: r2(pct(q.ab, R.refPct)), ...sdRef(q, R.minRef) } : null); } return zP.get(z); },
      natP: () => natP || (natP = { maeP95: r2(pct(nat.mae, R.refPct)), absBiasP95: r2(pct(nat.ab, R.refPct)), ...sdRef(nat, R.minRef) }) };
  }
  /* own record once it spans ownDays; before that the city's ZONE record (every city of the same zone, same window; owner decision
     17 Oct 2026: the national pool is set by the mountain cities and cannot see a ~1 C plains fault); national only when the zone
     holds fewer than minRef values */
  function reference(city, t, SX = SNAP, ownDays = R.ownDays, IX = null) {
    const X = IX || refIndex(t, SX), o = X.own.get(city);
    const ownSpan = o ? (t - 24 * H - o.first) / D : 0, ownN = o ? o.mae.length : 0;
    if (ownSpan >= ownDays && ownN >= R.minRef) return { basis: 'own', why: 'own record, past 30 days', n: ownN, maeP95: r2(pct(o.mae, R.refPct)), absBiasP95: r2(pct(o.ab, R.refPct)), ...sdRef(o, R.minRef) };
    const z = cityZone(city) || 'unknown', q = X.zone.get(z), zn = q ? q.mae.length : 0, days = Math.floor(ownSpan) + ' of ' + ownDays + ' days of its own';
    if (zn >= R.minRef) return { basis: 'zone', zone: z, why: z + ' zone record (this city has ' + days + ')', n: zn, ...X.zoneP(z) };
    const n = X.nat.mae.length;
    if (n < R.minRef) return { basis: 'none', why: 'fewer than ' + R.minRef + ' hourly values in the past 30 days (' + n + ')', n };
    return { basis: 'national', why: 'national record (the ' + z + ' zone holds ' + zn + ' values; this city has ' + days + ')', n, ...X.natP() };
  }
  function flagsAt(t, s24, SX = SNAP, ownDays = R.ownDays) {
    const out = [], IX = refIndex(t, SX);
    for (const [city, v] of Object.entries(s24.city)) { if (v.n < R.minN) continue; const ref = reference(city, t, SX, ownDays, IX); if (ref.basis === 'none') continue;
      const { why, noise } = judge(v.mae, v.bias, v.n, v.sdAbs, v.sdE, ref, '24-h ');
      if (why.length) out.push({ city, mae: v.mae, bias: v.bias, n: v.n, worst: v.worst ? v.worst.name : null, why: why.join('; '), reference: ref.why, referenceN: ref.n, noise }); }
    return out.sort((a, b) => b.mae - a.mae);
  }

  /* ── 6-h blocks (00-06, 06-12, 12-18, 18-24 PKT): an evening-only fault is not diluted by the 24-h figure. Each completed block of a
     city is judged against the same block of the city's own past 30 days (one value a day), with the same ladder: own record once it
     spans 14 days (at least 14 values), else the zone's same block (at least 48 values), else national ── */
  const B6 = 6 * H, blockOf = (ms) => Math.floor((ms + PKT) / B6) * B6 - PKT;
  const blockName = (bs) => { const h = new Date(bs + PKT).getUTCHours(); return String(h).padStart(2, '0') + '-' + String(h + 6).padStart(2, '0') + ' PKT'; };
  function bsnapshot(bs, PX = PAIRS, BX = BSNAP) { const w = windowStats(bs + 5 * H, 6, null, PX); const c = {}; for (const [k, v] of Object.entries(w.city)) if (v.n >= R.minN) c[k] = cell(v); BX.set(bs, c); const ex = [...exIds()]; if (BX === BSNAP) SNEX.b.set(bs, new Set(ex)); return { ty: 'b', t: iso(bs), blk: blockName(bs), c, w, ...(ex.length ? { ex } : {}) }; }
  function blockRef(city, bs, BX = BSNAP, ownDays = R.ownDays) {
    const own = { mae: [], ab: [], sa: [], se: [], first: null }, zone = { mae: [], ab: [], sa: [], se: [] }, nat = { mae: [], ab: [], sa: [], se: [] }; const z = cityZone(city) || 'unknown';
    for (const [b, c0] of BX) { if (b >= bs || b < bs - R.refDays * D || ((bs - b) % D) !== 0) continue; const c = BX === BSNAP ? cleanSnap('b', b, c0) : c0;
      for (const k in c) { const v = c[k]; push(nat, v); if ((cityZone(k) || 'unknown') === z) push(zone, v);
        if (k === city) { push(own, v); if (own.first == null || b < own.first) own.first = b; } } }
    const span = own.first == null ? 0 : (bs - own.first) / D, days = Math.floor(span) + ' of ' + ownDays + ' days of its own';
    const P = (q, need) => ({ maeP95: r2(pct(q.mae, R.refPct)), absBiasP95: r2(pct(q.ab, R.refPct)), ...sdRef(q, need) });
    if (span >= ownDays && own.mae.length >= ownDays) return { basis: 'own', why: 'own ' + blockName(bs) + ' record, past 30 days', n: own.mae.length, ...P(own, ownDays) };
    if (zone.mae.length >= R.minRef) return { basis: 'zone', zone: z, why: z + ' zone ' + blockName(bs) + ' record (this city has ' + days + ')', n: zone.mae.length, ...P(zone, R.minRef) };
    if (nat.mae.length >= R.minRef) return { basis: 'national', why: 'national ' + blockName(bs) + ' record (this city has ' + days + ')', n: nat.mae.length, ...P(nat, R.minRef) };
    return { basis: 'none', why: 'fewer than ' + R.minRef + ' values for this block', n: nat.mae.length };
  }
  function blockFlags(bs, BX = BSNAP, ownDays = R.ownDays) {
    const out = [], c = (BX === BSNAP ? cleanSnap('b', bs, BX.get(bs)) : BX.get(bs)) || {};
    for (const [city, v] of Object.entries(c)) { const ref = blockRef(city, bs, BX, ownDays); if (ref.basis === 'none') continue;
      const { why, noise } = judge(v[0], v[1], v[2], v[3], v[4], ref, blockName(bs) + ' block ');
      if (why.length) out.push({ city, block: blockName(bs), day: new Date(bs + PKT).toISOString().slice(0, 10), mae: v[0], bias: v[1], n: v[2], why: why.join('; '), reference: ref.why, referenceN: ref.n, noise }); }
    return out.sort((a, b) => b.mae - a.mae);
  }

  /* ── v91.17.277 · ACCFLAG 3 · siting or local microclimate: the night line (operator only). The siting-offset fitter cannot tell a
     roof (siting) from open-country cooling (real microclimate) with one station pair, so the monitor flags on the offset-adjusted
     score and shows the as-measured one beside it. Second, separate line: in the night block (00-06 PKT) a city whose AS-MEASURED bias
     is beyond the 95th percentile of its own night record (the same block ladder and noise margin as the main flag) while its adjusted
     bias is not: the station differs from its reference at night, cause unresolved. Only cities holding a station with an offset.
     The percentile is the city's adjusted record (its normal error once the station difference is removed): judged against its own
     as-measured record, a difference that is there every night (Yazman -2 C vs Bahawalpur City) is its own normal and never shows. */
  const SITE_LABEL = 'station differs from reference at night: siting or local microclimate, unresolved';
  function siteNightFlags(bs, BX = BSNAP, ownDays = R.ownDays) {
    const out = [], c = (BX === BSNAP ? cleanSnap('b', bs, BX.get(bs)) : BX.get(bs)) || {};
    for (const [city, v] of Object.entries(c)) { if (v.length < 7) continue;
      const refA = blockRef(city, bs, BX, ownDays); if (refA.basis === 'none') continue; const refR = refA;
      const r = judge(v[5], v[6], v[2], v[3], v[4], refR, ''), a = judge(v[0], v[1], v[2], v[3], v[4], refA, '');
      const rawB = r.why.some((w) => /bias/.test(w)), adjB = a.why.some((w) => /bias/.test(w));
      if (rawB && !adjB) out.push({ city, line: 'site', label: SITE_LABEL, block: blockName(bs), day: new Date(bs + PKT).toISOString().slice(0, 10), n: v[2], asMeasured: { mae: v[5], bias: v[6] }, adjusted: { mae: v[0], bias: v[1] },
        why: 'as measured: ' + r.why.filter((w) => /bias/.test(w)).join('; ') + '; siting-adjusted bias ' + (v[1] > 0 ? '+' : '') + v[1] + ' °C inside ±' + refA.absBiasP95, reference: refR.why }); }
    return out;
  }
  /* per city that is flagged or holds a station with an offset: the 24-h figures as measured and siting-adjusted */
  function asMeasured(s24, flags) { const F = new Set(flags.map((f) => f.city)); return Object.entries(s24.city).filter(([k, v]) => v.n >= R.minN && (v.offsetStations || F.has(k)))
    .map(([city, v]) => ({ city, n: v.n, offsetStations: v.offsetStations || 0, asMeasured: { mae: v.rawMae ?? v.mae, bias: v.rawBias ?? v.bias }, adjusted: { mae: v.mae, bias: v.bias } })); }

  /* ── job freshness ── */
  function freshness() {
    const t = now(), out = [], flags = []; const pktDay = (ms) => new Date(ms + PKT).toISOString().slice(0, 10);
    /* ensemble archive: a run saved today (PKT), or else every model's newest saved run still inside its own limit (cadence + the
       provider's measured delay, the archive's own 'missed' test, recomputed for now): the 00 UTC ECMWF run arrives near 17 PKT, so
       "nothing saved yet today" alone is normal every morning */
    try { const f = join(root, '..', 'archive', 'ens', 'index.jsonl'); let last = null; if (existsSync(f)) last = statSync(f).mtimeMs;
      const s = app.ensArchive && app.ensArchive.status ? app.ensArchive.status() : null; const today = last != null && pktDay(last) === pktDay(t);
      const late = Object.entries((s && s.newest) || {}).filter(([, v]) => !v || !v.init || (t - Date.parse(v.init)) / H > (v.limitH || 0)).map(([m, v]) => m + (v && v.init ? ' newest ' + v.init.slice(0, 13) + ' UTC, ' + Math.round((t - Date.parse(v.init)) / H) + ' h old (limit ' + Math.round(v.limitH) + ' h)' : ' no run saved'));
      const known = !!(s && s.newest && Object.keys(s.newest).length); const ok = today || (known && !late.length);
      out.push({ job: 'ensemble archive', ok, last: last ? pktIso(last) : null, note: today ? 'a run saved today' : !known ? (last ? 'no run saved today and no model status' : 'nothing saved yet (nig/archive/ens/index.jsonl)') : late.length ? 'late: ' + late.join('; ') : 'no run saved yet today; every model\'s newest run inside its limit' });
      if (!ok) flags.push('ensemble archive: ' + (late.length ? late.join('; ') : last ? 'last save ' + pktIso(last) : 'nothing saved yet')); } catch (_) {}
    try { const s = app.copiesRetention && app.copiesRetention.status ? app.copiesRetention.status() : null;
      if (s) { const age = s.lastRun ? (t - Date.parse(s.lastRun)) / D : null; const ok = s.on === false ? true : (s.lastRun != null && s.ok !== false && age <= 32);
        out.push({ job: 'copies retention', ok, last: s.lastRun ? pktIso(Date.parse(s.lastRun)) : null, note: s.on === false ? 'switched off' : s.lastRun ? (s.ok === false ? 'last run failed' : 'monthly; last run ' + Math.round(age) + ' d ago') : 'never run' });
        if (!ok) flags.push('copies retention: ' + (s.lastRun ? (s.ok === false ? 'last run failed' : 'last run ' + Math.round(age) + ' d ago') : 'never run')); } } catch (_) {}
    /* v91.17.283.28 · independence from LAMHA: the METAR / MACH copies are retired; NIGRAAN's own feeds are checked instead (file times in the own
       folder nig/own: the MACH live window's last_sync.txt, the METAR record's sync_status.json); the 60 / 75 min limits are the retired copies' */
    try { const O = ownDir(root); const age = (f) => { try { return (t - statSync(f).mtimeMs) / 60e3; } catch (_) { return null; } };
      for (const [job, f, lim] of [['MACH database (own)', join(O, 'data', 'mach', 'db', 'last_sync.txt'), 60], ['METAR record (own)', join(O, 'data', 'obs_other', 'metar_live', 'sync_status.json'), 75]]) {
        const a = age(f); const ok = a != null && a <= lim; out.push({ job, ok, newestAgeMin: a == null ? null : r1(a), note: ok ? 'fresh' : a == null ? 'not written yet' : 'last write ' + Math.round(a) + ' min ago (limit ' + lim + ')' });
        if (!ok) flags.push(job + ': ' + (a == null ? 'not written yet' : 'last write ' + Math.round(a) + ' min ago')); } } catch (_) {}
    try { const s = app.synop && app.synop.status ? app.synop.status() : null; if (s && s.on) { const age = s.lastPoll ? (t - Date.parse(s.lastPoll)) / H : null; const ok = age != null && age <= R.synopMaxAgeH;
        out.push({ job: 'synoptic poll', ok, last: s.lastPoll ? pktIso(Date.parse(s.lastPoll)) : null, note: ok ? 'within ' + R.synopMaxAgeH + ' h' : s.lastPoll ? 'last poll ' + r1(age) + ' h ago' : 'not polled yet' });
        if (!ok) flags.push('synoptic poll: ' + (s.lastPoll ? 'last ' + r1(age) + ' h ago' : 'not polled yet')); } } catch (_) {}
    return { jobs: out, flags };
  }

  /* ── one run ── */
  async function run() {
    if (!on()) return { ok: false, why: 'switched off (NIGRAAN_ACCMON=0)' };
    const c0 = process.cpuUsage(), p0 = performance.now(); const t = now(); const parts = {}; let pt = p0; const lap = (k) => { const x = performance.now(); parts[k] = r1(x - pt); pt = x; };
    const Y = slicer(); const got = await collect(Y); prune(); lap('collect'); await Y();
    const s24 = windowStats(t, 24); await Y(); const s7 = windowStats(t, 168); lap('stats'); await Y();
    write([snapshot(t, s24)]);
    const lastB = blockOf(t) - B6, bl = []; for (let bs = lastB - 3 * B6; bs <= lastB; bs += B6) if (!BSNAP.has(bs)) { const x = bsnapshot(bs); delete x.w; bl.push(x); } if (bl.length) write(bl);
    await Y(); const flags = flagsAt(t, s24).concat(blockFlags(lastB)); let nb = lastB; while (blockName(nb) !== '00-06 PKT') nb -= B6; const siteFlags = siteNightFlags(nb); lap('flags'); await Y(); const fr = freshness(); FR = fr; frAt = Date.now(); frKey = retKey(); lap('freshness');
    const cu = process.cpuUsage(c0);
    st.runs++; st.lastRun = new Date(t).toISOString(); st.lastMs = r1(performance.now() - p0); st.cpuMs = r1((cu.user + cu.system) / 1000); st.parts = parts;
    st.last = { at: pktIso(t), added: got, h24: s24, d7: s7, flags, siteFlags, asMeasured: asMeasured(s24, flags), freshness: fr };
    return st.last;
  }

  /* ── backfill from the copied MACH database ── */
  function dbFiles() {
    const out = []; const dirs = [];
    try { dirs.push(join(ownDir(root), 'data', 'mach', 'db')); } catch (_) {}   /* v91.17.283.28 · NIGRAAN's own MACH day files (machdb.mjs live window), no LAMHA copy */
    if (opts.dbDir) dirs.unshift(opts.dbDir);
    const seen = new Set(); for (const d of dirs) { if (!existsSync(d)) continue; for (const f of readdirSync(d)) { const m = /^obs_(\d{8})\.csv$/.exec(f); if (!m || seen.has(m[1])) continue; seen.add(m[1]); out.push({ day: m[1], path: join(d, f) }); } }
    return out.sort((a, b) => a.day.localeCompare(b.day));
  }
  async function readDb(files, Y = null) {
    const rows = [];
    for (const f of files) { let ix = null;
      await streamCsv(f.path, (c, Hd) => { if (!ix) { const P = (a) => { const h = pick(Hd, a); return h == null ? -1 : Hd.indexOf(h); }; ix = { key: P(['stationKey', 'key', 'station']), t: P(['time', 'time_utc', 'timestamp']), src: P(['source']), T: P(['temperatureC', 'temp_c']), Td: P(['dewPointC', 'dew_c']), RH: P(['humidityPct', 'rh_pct']), P: P(['pressureHpa']), S: P(['solarWm2', 'solar_wm2']), W: P(['windSpeedKmh', 'wind_kmh']), G: P(['windGustKmh', 'gust_kmh']) }; }
        const g = (k) => (ix[k] < 0 ? '' : c[ix[k]]); const n = (k) => { const v = g(k); return v === '' || v == null ? null : Number(v); };
        const ms = utcMs(g('t')); const key = String(g('key') || '').trim(); if (!key || !Number.isFinite(ms)) return;
        rows.push({ key, ms, source: g('src') || '', T: n('T'), Td: n('Td'), RH: n('RH'), P: n('P'), S: n('S'), W: n('W'), G: n('G') }); }, { cells: true }); await new Promise((r) => setImmediate(r)); }
    return rows;
  }
  /* the served chain up to the live layer, as recorded when it was served: station-lake/archive/fleet/fleet_pairs_YYYY-MM.csv (read only) */
  /* the served chain up to the live layer as recorded when served, and the reading it was paired with: station-lake/archive/fleet/
     fleet_pairs_YYYY-MM.csv (READ ONLY; the laptop's file runs from 23 Sep 2026). The readings stand in for the database on days
     the copies do not hold (one reading per station and hour, the one the live layer used) */
  async function pairsFile(months, wantRows) {
    const B = new Map(), rows = []; const base = opts.pairsDir || join(root, '..', 'station-lake', 'archive', 'fleet');
    for (const m of months) { const f = join(base, 'fleet_pairs_' + m + '.csv'); if (!existsSync(f)) continue;
      await streamCsv(f, (o) => { const k = o.key, h = String(o.hour_utc || '').slice(0, 13), s = Number(o.fc_served_c); if (!k || !h || !Number.isFinite(s) || o.fc_served_c === '') return; const id = k + '|' + h; if (B.has(id)) return; B.set(id, s);
        if (wantRows) { const ms = utcMs(o.obs_utc), T = o.temp_c === '' ? NaN : Number(o.temp_c); if (Number.isFinite(ms) && Number.isFinite(T)) rows.push({ key: k, ms, source: 'pairs', T, Td: o.dew_c === '' ? null : Number(o.dew_c), RH: o.rh_pct === '' ? null : Number(o.rh_pct), P: null }); } }); }
    return { B, rows };
  }
  async function synopRecords(months) {
    const RX = {}; const base = opts.synopDir || join(root, '..', 'station-lake', 'archive', 'synop');
    for (const m of months) { const f = join(base, 'synop_' + m + '.jsonl'); if (!existsSync(f)) continue;
      for (const line of readFileSync(f, 'utf8').split('\n')) { if (!line) continue; let j; try { j = JSON.parse(line); } catch (_) { continue; } if (!j.sid || !Number.isFinite(j.t_c) || !Number.isFinite(j.served_c)) continue;
        (RX[j.sid] || (RX[j.sid] = {}))[j.t] = { o: j.t_c, s: j.served_c }; } }
    return RX;
  }
  /* replay hours [fromMs, toMs]; returns { pairs: Map(hour -> Map(id -> {o, pre, post})) } */
  async function replay(o = {}, onHour = null) {
    const Y = slicer();
    /* the window: o.fromMs, else the last refDays (30) days; the readings: the copied database days, and the fleet pairs' own readings
       on the days the copies do not hold */
    const tEnd = o.toMs != null ? o.toMs : now(), tStart = o.fromMs != null ? o.fromMs : tEnd - R.refDays * D;
    const files = dbFiles().filter((f) => { const ms = Date.parse(f.day.slice(0, 4) + '-' + f.day.slice(4, 6) + '-' + f.day.slice(6, 8) + 'T00:00:00Z'); return ms + D > tStart && ms <= tEnd; });
    const dbDays = new Set(files.map((f) => f.day));
    const months = []; for (let m = Date.UTC(new Date(tStart).getUTCFullYear(), new Date(tStart).getUTCMonth(), 1); m <= tEnd; m = Date.UTC(new Date(m).getUTCFullYear(), new Date(m).getUTCMonth() + 1, 1)) months.push(new Date(m).toISOString().slice(0, 7));
    const PF = o.basis === 'cache' ? { B: new Map(), rows: [] } : await pairsFile(months, o.pairsRows !== false); const PB = PF.B; Y.reset();   /* awaited file reads are not loop time */
    const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');
    const fromPairs = []; for (let i = 0; i < PF.rows.length; i++) { const r = PF.rows[i]; if (!dbDays.has(dayOf(r.ms)) && r.ms >= tStart - H && r.ms <= tEnd) fromPairs.push(r); if ((i & 4095) === 0) await Y(); }
    if (!files.length && !fromPairs.length) return { ok: false, why: 'neither the copies nor the fleet pairs file hold readings in the window' };
    const rows = await readDb(files, Y); Y.reset(); for (let i = 0; i < fromPairs.length; i++) { rows.push(fromPairs[i]); if ((i & 8191) === 0) await Y(); }
    const reg = new Map(); try { for (const s of app.fleet.stations() || []) if (Number.isFinite(s.lat)) reg.set(s.key, s); } catch (_) {}
    const ok = []; for (let i = 0; i < rows.length; i++) { const r = rows[i]; if (!/^(qm|apple)$/i.test(r.source) && reg.has(r.key) && Number.isFinite(r.T)) ok.push(r); if ((i & 4095) === 0) await Y(); }
    rows.length = 0;
    /* one station at a time (obsqc.mjs judges each station's own series: range, series, internal consistency), a slice between
       stations; the buddy / background check runs on each hour's readings below, as the live poll does */
    const byKey = new Map(); for (let i = 0; i < ok.length; i++) { const r = ok[i]; (byKey.get(r.key) || byKey.set(r.key, []).get(r.key)).push(r); if ((i & 8191) === 0) await Y(); }
    const bad = new Map(); for (const l of byKey.values()) { l.sort((a, b) => a.ms - b.ms); await Y(); const b = QC.seriesRows(l, (r) => r.key, (r) => ({ ms: r.ms, T: r.T, Td: r.Td, RH: r.RH, P: r.P, S: r.S, W: r.W, G: r.G }), (k) => reg.get(k) || null, QCP || undefined); for (const [r, v] of b) bad.set(r, v); await Y(); }
    const basisAt = (key, hk) => { const h = new Date(hk).toISOString().slice(0, 13); const a = PB.get(key + '|' + h); if (a != null) return { s: a, from: 'pairs' }; if (o.basis === 'pairs') return null; let c = null; try { c = app.fleet.servedAt ? app.fleet.servedAt(key, h) : null; } catch (_) {} return c == null ? null : { s: c, from: 'cache' }; };
    const maxAge = ((app.hyperlocal.maxAgeMin && app.hyperlocal.maxAgeMin()) || 60) * 60e3;
    let mn = Infinity, mx = -Infinity; for (let i = 0; i < ok.length; i++) { const r = ok[i]; if (r.ms < mn) mn = r.ms; if (r.ms > mx) mx = r.ms; if ((i & 65535) === 0) await Y(); }
    const t0 = Math.ceil(Math.max(tStart, mn, o.resumeFromMs != null ? o.resumeFromMs : -Infinity) / H) * H, t1 = Math.floor(Math.min(tEnd, mx) / H) * H;
    const RX = o.synop === false ? null : await synopRecords(months); Y.reset(); const SYS = (() => { try { return (app.synop.records() || {}).stations || {}; } catch (_) { return {}; } })();
    const out = new Map(); const used = { pairs: 0, cache: 0 };
    const idx = new Map([...byKey.keys()].map((k) => [k, 0]));
    for (let T = t0; T <= t1; T += H) {
      const pre = [], post = [], obs = [];
      for (const [k, list] of byKey) { const s0 = reg.get(k); let i = idx.get(k); while (i < list.length && list[i].ms <= T) i++; idx.set(k, i);
        await Y(); let nAny = null, nOk = null; for (let j = i - 1; j >= 0 && T - list[j].ms <= maxAge; j--) { if (!nAny) nAny = list[j]; if (!bad.has(list[j])) { nOk = list[j]; break; } }
        const off = (() => { try { return app.fleet.offsetFor(k); } catch (_) { return null; } })();
        const mk = (r) => { const b = basisAt(k, hourOf(r.ms)); if (!b) return null; used[b.from]++; return { key: k, name: s0.name, lat: s0.lat, lon: s0.lon, obsMs: r.ms, tempC: r.T, served: b.s, offset: off }; };
        if (nAny) { const x = mk(nAny); if (x) pre.push(x); }
        if (nOk) { const x = mk(nOk); if (x) { post.push(x); obs.push(x); } } }
      /* v91.17.283.14 · the hour's readings through obsqc's copy and buddy / background checks (the live poll's qcCross) */
      { const it = post.map((x) => { const el = (() => { try { return app.fleet.elevOf(x.key); } catch (_) { return null; } })(); return { pid: 'mach:' + x.key, lat: x.lat, lon: x.lon, elev: el, zone: zoneOf(x.lat, x.lon, el), r: { ms: x.obsMs, T: x.tempC }, bg: { T: x.served }, x }; });
        try { QC.qcCross(it, QCP); } catch (_) {} const okK = new Set(it.filter((y) => QC.passes(y.r, 'T')).map((y) => y.x));
        for (let i = post.length - 1; i >= 0; i--) if (!okK.has(post[i])) { obs.splice(obs.indexOf(post[i]), 1); post.splice(i, 1); } }
      const Lpre = app.hyperlocal.replay(pre, T); await Y(); const Lpost = app.hyperlocal.replay(post, T); await Y();
      const M = new Map();
      for (const x of obs) { await Y();
        const dPre = app.hyperlocal.looAt(x.lat, x.lon, x.key, Lpre.rows).dT, dPost = app.hyperlocal.looAt(x.lat, x.lon, x.key, Lpost.rows).dT;
        M.set('m:' + x.key, { o: x.tempC - siteOffsetC(x.offset, x.obsMs), raw: x.tempC, pre: x.served + dPre, post: x.served + dPost, hk: hourOf(x.obsMs), meta: { name: x.name, lat: x.lat, lon: x.lon, kind: 'mach', el: (() => { try { return app.fleet.elevOf(x.key); } catch (_) { return null; } })() } }); }
      if (RX) for (const [sid, recs] of Object.entries(RX)) { await Y(); const v = recs[iso(T).slice(0, 16) + ':00Z'] || recs[new Date(T).toISOString().slice(0, 16) + ':00Z']; const s0 = SYS[sid]; if (!v || !s0 || !Number.isFinite(s0.lat)) continue;
        const term = app.synop.termAt ? app.synop.termAt(sid, T, RX) : null;
        const lp = app.hyperlocal.looAt(s0.lat, s0.lon, null, Lpre.rows).dT, lq = app.hyperlocal.looAt(s0.lat, s0.lon, null, Lpost.rows).dT;
        M.set((s0.kind === 'metar' ? 'a:' : 's:') + sid, { o: v.o, pre: v.s + (term || 0) + lp, post: v.s + (term || 0) + lq, hk: T, meta: { name: s0.name || sid, lat: s0.lat, lon: s0.lon, kind: s0.kind === 'metar' ? 'airport' : 'synop', el: s0.elevM ?? null } }); }
      if (M.size) { if (onHour) { await onHour(T, M); Y.reset(); } else out.set(T, M); }
      await Y();
    }
    if (onHour) await onHour(null, null);
    const pd = new Set(); for (let i = 0; i < fromPairs.length; i++) { pd.add(dayOf(fromPairs[i].ms)); if ((i & 4095) === 0) await Y(); }
    return { ok: true, files: files.map((f) => f.day), pairsDays: pd.size, from: iso(t0), to: iso(t1), hours: out.size, basisUsed: used, screened: { readings: ok.length, rejected: bad.size }, pairs: out };
  }
  /* v91.17.273.1 · the replay in a worker thread (accmon_worker.mjs): its file reading, screening and garbage collection never touch the
     main thread. The main thread sends a snapshot of what the replay reads from live modules and receives finished hours. opts.inline
     (tests) or NIGRAAN_ACCMON_WORKER=0 runs it here, sliced. */
  async function replayOff(o, onHour) {
    if (opts.inline || process.env.NIGRAAN_ACCMON_WORKER === '0') return replay(o, onHour);
    const Y = slicer(); const stations = (() => { try { return (app.fleet.stations() || []).filter((x) => Number.isFinite(x.lat)).map((x) => ({ key: x.key, name: x.name, lat: x.lat, lon: x.lon })); } catch (_) { return []; } })();
    const elev = {}, zones = {}; for (const x of stations) { try { const e = app.fleet.elevOf(x.key); if (e != null) elev[x.key] = e; } catch (_) {} zones[x.lat + ',' + x.lon] = zoneOf(x.lat, x.lon, elev[x.key] ?? null); } await Y();
    let offsets = {}; try { offsets = (app.fleet.offsets && app.fleet.offsets().stations) || {}; } catch (_) {}
    let cache = {}; try { cache = o.basis === 'pairs' ? {} : (app.fleet.servedCache ? app.fleet.servedCache() : {}); } catch (_) {} await Y();
    const copiesDir = (() => { try { return app.copies && app.copies.copiesDir; } catch (_) { return null; } })();
    return await new Promise((resolve, reject) => {
      const w = new Worker(new URL('./accmon_worker.mjs', import.meta.url), { workerData: { root, dataDir, o, accOpts: { dbDir: opts.dbDir, pairsDir: opts.pairsDir, synopDir: opts.synopDir }, snap: { stations, elev, zones, offsets, cache, copiesDir } } });
      let chain = Promise.resolve(), result = null, failed = null;
      w.on('message', (m) => { chain = chain.then(async () => {
        if (m.type === 'hours') for (const [T, E] of m.hours) { const M = new Map(E.map(([id, ob, pre, post, hk, meta, raw]) => [id, { o: ob, pre, post, hk, meta, raw }])); await onHour(T, M); await Y(); }
        else if (m.type === 'done') { await onHour(null, null); result = m.result; w.terminate(); } else if (m.type === 'error') { failed = m.error; w.terminate(); } }).catch((e) => { failed = e.message; w.terminate(); }); });
      w.on('error', (e) => { failed = e.message; });
      w.on('exit', () => { chain.then(() => (failed ? reject(new Error(failed)) : resolve(result || { ok: false, why: 'the backfill worker stopped' }))); });
    });
  }
  /* the as-served record into the monitor (pre before HOTFIX_AT, post after), once. Sliced (never more than SLICE_MS of the event loop at a
     time) and written a day at a time with a progress line ({ty:'bf'}), so a restart resumes after the last day written */
  async function backfill(o = {}) {
    if (st.backfill && st.backfill.running) return st.backfill;
    const prog = st.bf || null;
    if (!o.force && prog && prog.done) return (st.backfill = { done: false, why: 'the backfill already ran (' + prog.at + ')' });
    if (!o.force && !prog && [...PAIRS.values()].some((m) => m.size)) return (st.backfill = { done: false, why: 'the monitor already holds pairs' });
    const resume = !o.force && prog && !prog.done && prog.upto ? Date.parse(prog.upto) + H : null;
    const winTo = resume != null && prog.to ? Date.parse(prog.to) : (o.toMs != null ? o.toMs : now()), winFrom = resume != null && prog.from ? Date.parse(prog.from) : (o.fromMs != null ? o.fromMs : winTo - R.refDays * D);
    st.backfill = { running: true, at: new Date(now()).toISOString(), resumedFrom: resume != null ? iso(resume) : null };
    const ELD = monitorEventLoopDelay({ resolution: 10 }); ELD.enable(); SLICE_STATS.max = 0; const w0 = Date.now();
    const loop = () => { ELD.disable(); return { eventLoopDelayMaxMs: Math.round(ELD.max / 1e5) / 10, eventLoopDelayP99Ms: Math.round(ELD.percentile(99) / 1e5) / 10, longestSliceMs: SLICE_STATS.max, wallMs: Date.now() - w0 }; };
    const Y = slicer(); const hf = Date.parse(o.hotfixAt || R.hotfixAt); let n = 0, hours = 0, first = null, last = null, day = null; let out = new Map(); const hrs = [];
    const writeDay = async () => { if (!hrs.length) return; flush(out, 'backfill'); out = new Map(); await Y();
      const snaps = []; for (const T of hrs) { snaps.push(snapshot(T + H - 1, windowStats(T + H - 1, 24))); await Y(); }
      for (let bs = blockOf(hrs[0]); bs <= blockOf(hrs[hrs.length - 1]); bs += B6) { if (bs + B6 > hrs[hrs.length - 1] + H) break; if (BSNAP.has(bs)) continue; const x = bsnapshot(bs); delete x.w; snaps.push(x); await Y(); }
      const p = { ty: 'bf', at: new Date(now()).toISOString(), from: iso(winFrom), to: iso(winTo), upto: iso(hrs[hrs.length - 1]), done: false, pairs: n };
      write(snaps.concat([p])); st.bf = p; hrs.length = 0; };
    try {
      const r = await replayOff({ ...o, fromMs: winFrom, toMs: winTo, resumeFromMs: resume }, async (T, M) => {
        if (T == null) { await writeDay(); return; }
        const d = new Date(T + PKT).toISOString().slice(0, 10); if (day && d !== day) await writeDay(); day = d;
        for (const [id, v] of M) { meta(id, v.meta); if (add(v.hk, id, v.o, T < hf ? v.pre : v.post, out, v.raw)) n++; }
        hrs.push(T); hours++; if (first == null) first = T; last = T; await Y(); });
      if (!r.ok) return (st.backfill = { done: false, why: r.why, ...loop() });
      const fin = { ty: 'bf', at: new Date(now()).toISOString(), from: iso(winFrom), to: iso(winTo), upto: last != null ? iso(last) : null, done: true, pairs: (resume != null && prog ? prog.pairs || 0 : 0) + n };
      write([fin]); st.bf = fin;
      return (st.backfill = { done: true, pairsDays: r.pairsDays, at: fin.at, days: r.files, from: r.from, to: r.to, hours, pairs: n, resumedFrom: resume != null ? iso(resume) : null, basisUsed: r.basisUsed, screened: r.screened, hotfixAt: o.hotfixAt || R.hotfixAt, ...loop() });
    } catch (e) { return (st.backfill = { done: false, error: e.message, ...loop() }); }
  }
  /* self-test: both replays on the same hours, by city and PKT part of day, and the flag each would raise */
  async function selftest(o = {}) {
    const Y = slicer();
    const r = o.replayed || await replay(o); if (!r.ok) return r;
    const part = (ms) => { const h = new Date(ms + PKT).getUTCHours(); return h >= 17 && h <= 23 ? 'evening 17-23' : h <= 5 ? 'night 00-05' : h <= 8 ? 'morning 06-08' : 'day 09-16'; };
    const agg = new Map();
    for (const [T, M] of r.pairs) for (const [id, v] of M) { const m = META.get(id) || { ...v.meta, cities: citiesOf(v.meta.lat, v.meta.lon) }; if (!META.has(id)) META.set(id, { ...m, zone: zoneOf(m.lat, m.lon, m.el ?? null), _w: false });   /* not written: meta() writes it when a pair of this station is first recorded */
      const day = new Date(T + PKT).toISOString().slice(0, 10); for (const c of (META.get(id).cities || [])) { const k = c + '|' + day + '|' + part(T); const a = agg.get(k) || agg.set(k, { pre: [], post: [] }).get(k); a.pre.push(v.pre - v.o); a.post.push(v.post - v.o); } }
    const table = [...agg].map(([k, a]) => { const [city, day, p] = k.split('|'); const A = stat(a.pre), B = stat(a.post); return { city, day, part: p, n: A.n, maePre: A.mae, maePost: B.mae, biasPre: A.bias, biasPost: B.bias }; })
      .sort((x, y) => (x.city + x.day + x.part).localeCompare(y.city + y.day + y.part));
    /* the flag each replay would raise: hourly 24-h city snapshots of both series; at 23:00 PKT of each day the pre-hotfix (as served)
       24-h statistics judged against (a) the screened series' own record (the city's normal without the fault) and (b) its own record */
    const PX = { pre: new Map(), post: new Map() };
    for (const [T, M] of r.pairs) for (const [id, v] of M) for (const k of ['pre', 'post']) { const X = PX[k].get(v.hk) || PX[k].set(v.hk, new Map()).get(v.hk); X.set(id, [v.o, v[k]]); }
    const SN = { pre: new Map(), post: new Map() }; const hours = [...r.pairs.keys()].sort((a, b) => a - b);
    if (hours.length) for (let T = hours[0]; T <= hours[hours.length - 1]; T += H) for (const k of ['pre', 'post']) { await Y(); snapshot(T + H - 1, windowStats(T + H - 1, 24, null, PX[k]), SN[k]); }
    const flags = [];
    for (let T = hours[0]; hours.length && T <= hours[hours.length - 1]; T += H) { if (new Date(T + PKT).getUTCHours() !== 23) continue; await Y(); const t = T + H - 1;
      const pre24 = windowStats(t, 24, null, PX.pre), post24 = windowStats(t, 24, null, PX.post);
      const a = flagsAt(t, pre24, SN.post), b = flagsAt(t, pre24, SN.pre), c = flagsAt(t, post24, SN.post), d = flagsAt(t, pre24, SN.post, 0), e = flagsAt(t, post24, SN.post, 0);
      const fmt = (f) => f.city + ' (MAE ' + f.mae + ', bias ' + f.bias + ')';
      flags.push({ at: pktIso(T), preVsClean: a.map(fmt), preVsOwn: b.map((f) => f.city), postVsClean: c.map((f) => f.city), preVsCleanOwnAnyLength: d.map(fmt), postVsCleanOwnAnyLength: e.map((f) => f.city),
        city: o.detailCity ? { pre: pre24.city[o.detailCity] || null, post: post24.city[o.detailCity] || null, refRule: reference(o.detailCity, t, SN.post), refNationalOnly: (() => { const X = refIndex(t, SN.post); return { n: X.nat.mae.length, ...X.natP() }; })(), refOwn: reference(o.detailCity, t, SN.post, 0) } : undefined }); }
    /* 6-h blocks: every block of the replay for both series; each as-served block judged against the screened series' same block */
    const BSN = { pre: new Map(), post: new Map() }; const blocks = [];
    if (hours.length) for (let bs = blockOf(hours[0]); bs <= blockOf(hours[hours.length - 1]); bs += B6) { await Y(); blocks.push(bs); for (const k of ['pre', 'post']) bsnapshot(bs, PX[k], BSN[k]); }
    const judgeS = (v, ref, bs) => { if (!v || ref.basis === 'none') return null; const j = judge(v[0], v[1], v[2], v[3], v[4], ref, ''); return j.why.length ? blockName(bs) + ' block: ' + j.why.join('; ') : null; };   /* the live rule (v91.17.277: with its noise margin) */
    const blockTable = []; let nPre = 0, nPost = 0;
    for (const bs of blocks) { await Y(); const P0 = BSN.pre.get(bs) || {}, Q0 = BSN.post.get(bs) || {};
      for (const city of Object.keys(P0)) { const ref = blockRef(city, bs, BSN.post); const a = judgeS(P0[city], ref, bs), b = judgeS(Q0[city], ref, bs); if (a) nPre++; if (b) nPost++;
        if (o.detailCity && city === o.detailCity) blockTable.push({ day: new Date(bs + PKT).toISOString().slice(0, 10), block: blockName(bs), pre: P0[city], post: Q0[city] || null, ref: { basis: ref.basis, n: ref.n, maeP95: ref.maeP95, absBiasP95: ref.absBiasP95, why: ref.why }, flagPre: a, flagPost: b }); } }
    let detail = null; if (o.detailAt) { const T = Date.parse(o.detailAt); const M = r.pairs.get(T); if (M) detail = [...M].map(([id, v]) => ({ id, name: v.meta.name, o: v.o, servedPre: r2(v.pre), servedPost: r2(v.post), cities: citiesOf(v.meta.lat, v.meta.lon) })).filter((x) => !o.detailCity || x.cities.includes(o.detailCity)); }
    return { ok: true, from: r.from, to: r.to, hours: r.hours, dbDays: r.files.length, pairsDays: r.pairsDays, basisUsed: r.basisUsed, screened: r.screened, table, flags, blockFlagCounts: { asServed: nPre, screened: nPost }, blockTable, detail };
  }

  /* v91.17.276 · the job-freshness flags are read from each job's CURRENT state when asked (status / health), not from the copy taken at
     the last hourly accuracy run: a copies-retention run that failed and was then fixed showed "last run failed" on /health until the
     next accuracy run while /health copiesRetention already said ok. freshness() is a few status lookups and one stat; kept 30 s, and redone at once when the retention state changes. */
  let FR = null, frAt = -Infinity, frKey = '';
  const retKey = () => { try { const s = app.copiesRetention && app.copiesRetention.status ? app.copiesRetention.status() : null; return s ? s.lastRun + '|' + s.ok + '|' + s.on : ''; } catch (_) { return ''; } };
  function freshNow() { const w = Date.now(), k = retKey(); if (!FR || k !== frKey || w - frAt > 30e3 || w < frAt) { try { FR = freshness(); frAt = w; frKey = k; } catch (_) { FR = st.last ? st.last.freshness : null; } } return FR; }
  function status() { const t = now(); const L = st.last;
    return { on: on(), rule: R, runs: st.runs, lastRun: st.lastRun ? pktIso(Date.parse(st.lastRun)) : null, lastMs: st.lastMs, cpuMs: st.cpuMs, partsMs: st.parts || null, pairsHeld: [...PAIRS.values()].reduce((a, m) => a + m.size, 0), stations: META.size, cities: CITIES.length, snapshots: SNAP.size,
      backfill: st.backfill, backfillProgress: st.bf || null, longestSliceMs: SLICE_STATS.max, slices: SLICE_STATS.n, waiting: st.waiting || null, lastError: st.lastError, h24: L ? L.h24 : null, d7: L ? L.d7 : null, flags: L ? L.flags : [], siteFlags: L ? L.siteFlags || [] : [], asMeasured: L ? L.asMeasured || [] : [], freshness: L ? freshNow() : null, file: join(dir, new Date(t).toISOString().slice(0, 7) + '.jsonl') }; }
  function health() { const L = st.last; return { on: on(), lastRun: st.lastRun ? pktIso(Date.parse(st.lastRun)) : null, pairs24h: L && L.h24.national ? L.h24.national.n : 0,
      citiesFlagged: L ? L.flags.map((f) => f.city) : [], citiesSiteFlagged: L ? (L.siteFlags || []).map((f) => f.city) : [], jobFlags: L ? ((freshNow() || {}).flags || []) : [], backfill: st.backfill ? (st.backfill.done ? 'done ' + st.backfill.pairs + ' pairs' : st.backfill.why || st.backfill.error || 'running') : null }; }

  if (!opts.noLoad) { try { load(); } catch (e) { st.lastError = 'load: ' + e.message; } }
  /* v91.17.273.1 · the first start waits: the server warm for 5 min and no customer request for 5 min (app.lastCustomerAt, server.mjs),
     checked every minute; after 60 min of waiting it starts anyway (it is sliced, it cannot hold a customer for more than SLICE_MS).
     A standby or draining server runs nothing (the scheduler's gate). */
  const IDLE_MS = 5 * 60e3, MAX_WAIT_MS = 60 * 60e3; const born = Date.now(); let retry = null;
  const quiet = () => { const w = app.warm && app.warm.ready && app.warm.at ? Date.parse(app.warm.at) : null; if (w == null || Date.now() - w < IDLE_MS) return false;
    const c = app.lastCustomerAt || 0; return Date.now() - c >= IDLE_MS || Date.now() - born >= MAX_WAIT_MS; };
  async function job() {
    if (!st.bf || !st.bf.done) { if (!quiet()) { st.waiting = 'backfill waits for 5 min after warm with no customer request'; if (!retry) { retry = setTimeout(() => { retry = null; try { app.scheduler && app.scheduler.runNow ? app.scheduler.runNow('accMon') : job(); } catch (_) {} }, 60e3); if (retry.unref) retry.unref(); } return; }
      st.waiting = null; try { await backfill(); } catch (_) {} }
    await run();
  }
  if (!opts.noSchedule && on()) schedule(app, 'accMon', 3600e3, job, { heavy: 'bulk', label: 'accuracy monitor (served vs observed, hourly; sliced)', firstMs: 10 * 60e3 });
  return { _job: job, run, status, health, backfill, replay, selftest, windowStats, flagsAt, reference, freshness, blockRef, blockFlags, bsnapshot, blockOf, siteNightFlags, asMeasured, SITE_LABEL, _pairs: PAIRS, _snap: SNAP, _bsnap: BSNAP, _exp: EXP, _load: load, _cleanSnap: cleanSnap, _meta: META, _add: add };
}
