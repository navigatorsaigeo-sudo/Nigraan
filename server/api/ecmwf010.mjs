/* == v91.17.283.2 . ECMWF IFS 0.1 deg OPEN DATA: INGESTION, POINT SERIES, SHADOW COMPARISON (nothing served unless switched on) ======
   Source: ECMWF IFS HRES open data at 0.1 deg, read from the Google Cloud mirror (storage.googleapis.com/ecmwf-open-data/<day>/<HH>z/
   ifs/0p1/oper/, the same files as data.ecmwf.int, which took up to 18 h a run: v283.15), CC-BY-4.0, commercial use allowed; credit
   "Contains ECMWF data". The files are global; scripts/ecmwf/ingest_ecmwf010.py fetches only the fields this module reads (2 m temperature
   and dew point, 10 m wind and gust, rain, orography), steps 0-96 h, by parallel HTTP byte ranges (.index offsets), crops them to
   Pakistan (23-38 N, 60-78 E) and writes data/ecmwf010/<run>/ (about 0.4 GB downloaded and 2-3 minutes a run on a fast line).
     fetch    every NIGRAAN_ECMWF010_EVERY_MIN (30) minutes, first 7 min after start, bulk slot, one at a time, 90 min cap, the real
              Python (same search as the ensemble archive). The script does nothing when no new complete run is out. Defaults:
              runs 00 and 12 UTC, steps to 96 h (about 0.8 GB a day). NIGRAAN_ECMWF010=0 stops it; NIGRAAN_ECMWF010_BASE /
              _CYCLES / _MAX_STEP / _MAX_STEP_0012 / _KEEP / _ARCHIVE_DAYS / _WORKERS / _RANGES are read by the script.
     point    GET /api/ecmwf010/point?lat=&lon=[&elev=][&hourly=1][&maxLead=]  native 3/6-hourly steps (or hourly), bilinear from the
              latest run: temperature, dew point, rain per interval, 10 m wind and gust, pressure, cloud, solar. With elev the
              temperature and dew point are moved from the model orography to that height at 6.5 K/km (the standard atmosphere
              lapse rate, as Open-Meteo applies to its own output).
     shadow   after each new run: ecmwf010 against the forecast NIGRAAN serves now (the fleet pairs' cache: the served start
              and the served temperature) at every MACH station, future hours only, written to data/ecmwf010-shadow/<YYYY-MM>/<run>.csv
     score    scripts/ecmwf/score_shadow.py after each shadow: both against the MACH observations (NIGRAAN's copies of LAMHA's
              data/mach/db/obs_YYYYMMDD.csv, then station-lake/archive/fleet/db/mach_db_YYYY-MM.csv), MAE and bias by variable,
              zone and lead; the switch rule per variable (data/ecmwf010-score.json).
     serve    OFF by default. NIGRAAN_ECMWF010_SERVE=1 replaces, in best_match /v1/forecast answers before the correction chain,
              only the variables whose switch rule passed (v91.17.283.8, the 25 Oct rule: the FULL served chain with the 9 km values
              substituted, as serving would, is not worse than the served chain at MACH stations overall and in every zone and lead bucket,
              paired, over at least 3 valid days and 3 runs; fleet.mjs writes both chains) and only for the hours the latest run covers ahead of now.
   GET /api/ecmwf010/status shows all of it; ?run=1 (operator) starts a fetch now. */
import { existsSync, readFileSync, statSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { schedule } from './scheduler.mjs';
import { ownDir } from './ownpaths.mjs';
import { runJob, jobKeyOf } from './jobrun.mjs';

export const ECMWF010_FETCH_SCRIPT = 'scripts/ecmwf/ingest_ecmwf010.py';
export const ECMWF010_SCORE_SCRIPT = 'scripts/ecmwf/score_shadow.py';
export const ECMWF010_CREDIT = 'Contains ECMWF data (Copyright ECMWF, CC-BY-4.0, IFS open data 0.1 deg)';
const LAPSE = 0.0065;
/* Open-Meteo hourly name -> ecmwf010 series name (the serve switch) */
export const ECMWF010_SERVE_VARS = { temperature_2m: 't2m', dew_point_2m: 'd2m', precipitation: 'tp', wind_speed_10m: 'wind10' };

export function createEcmwf010(app, root, dataDir, opts = {}) {
  const dir = opts.dir || process.env.NIGRAAN_ECMWF010_DIR || join(dataDir, 'ecmwf010');
  const shadowDir = opts.shadowDir || join(dataDir, 'ecmwf010-shadow');
  const scoreFile = opts.scoreFile || join(dataDir, 'ecmwf010-score.json');
  const statusFile = join(dataDir, 'ecmwf010-status.json');
  const script = join(root, ...ECMWF010_FETCH_SCRIPT.split('/')), scorer = join(root, ...ECMWF010_SCORE_SCRIPT.split('/'));
  const on = () => process.env.NIGRAAN_ECMWF010 !== '0';
  const serveOn = () => process.env.NIGRAAN_ECMWF010_SERVE === '1';
  const t0Mod = Date.now();   /* v91.17.283.3 · for the next check time shown to the operator */
  const st = { busy: false, lastStart: null, lastEnd: null, lastCode: null, tail: null, shadow: null, score: null, scoreCode: null };
  let py = null;
  function python() {
    if (py) return py;
    const c = [];
    if (process.env.LOCALAPPDATA) c.push(join(process.env.LOCALAPPDATA, 'Python', 'bin', 'python.exe'));
    if (process.env.NIGRAAN_PYTHON) c.unshift(process.env.NIGRAAN_PYTHON);
    for (const p of c) if (existsSync(p)) return (py = p);
    return (py = process.platform === 'win32' ? 'py' : 'python3');
  }

  /* -- the latest run, decoded once per run -- */
  let R = null, idxM = 0;
  function readJson(f) { try { return JSON.parse(readFileSync(f, 'utf8')); } catch (_) { return null; } }
  /* one run decoded (meta + fields); v91.17.283.24: also a run other than the latest (the 00 UTC run of the heavy-rain day totals) */
  function decode(run) {
    const d = join(dir, run); const meta = readJson(join(d, 'meta.json')); if (!meta) return null;
    const V = {};
    for (const [name, v] of Object.entries(meta.vars)) { try { const b = gunzipSync(readFileSync(join(d, name + '.i16.gz'))); V[name] = { a: new Int16Array(b.buffer, b.byteOffset, b.length >> 1), ...v }; } catch (_) {} }
    return { run: meta.run, meta, V, t0: Date.parse(meta.runTimeUtc.replace('Z', ':00Z')), steps: meta.steps, g: meta.grid, cache: new Map() };
  }
  let IDX = null;
  function index() { const f = join(dir, 'index.json'); let m = 0; try { m = statSync(f).mtimeMs; } catch (_) { IDX = null; idxM = 0; return null; }
    if (IDX && m === idxM) return IDX; IDX = readJson(f); idxM = m; return IDX; }
  function latest() {
    const idx = index(); if (!idx || !idx.latest) return (R = null);
    if (R && R.run === idx.latest) return R;
    return (R = decode(idx.latest));
  }
  function bil(L, name, k, lat, lon) {
    const v = L.V[name]; if (!v) return null; const g = L.g;
    const fy = (lat - g.lat0) / g.dlat, fx = (lon - g.lon0) / g.dlon;
    if (!(fy >= 0 && fy <= g.ny - 1 && fx >= 0 && fx <= g.nx - 1)) return null;
    const j = Math.min(Math.floor(fy), g.ny - 2), i = Math.min(Math.floor(fx), g.nx - 2), wy = fy - j, wx = fx - i;
    const base = v.kind === 'static' ? 0 : k * g.ny * g.nx; const at = (jj, ii) => v.a[base + jj * g.nx + ii];
    const a = at(j, i), b = at(j, i + 1), c = at(j + 1, i), e = at(j + 1, i + 1);
    if (a === -32768 || b === -32768 || c === -32768 || e === -32768) return null;
    const q = (1 - wy) * ((1 - wx) * a + wx * b) + wy * ((1 - wx) * c + wx * e);
    return q * v.scale + v.offset;
  }
  const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
  /* native-step series at a point; elev (m) moves temperature and dew point from the model orography at 6.5 K/km */
  function series(lat, lon, o = {}) {
    const L = latest(); if (!L) return null;
    const key = lat.toFixed(4) + ',' + lon.toFixed(4) + ',' + (o.elev == null ? '' : Math.round(o.elev));
    if (L.cache.has(key)) return L.cache.get(key);
    const orog = bil(L, 'orog', 0, lat, lon); if (bil(L, 't2m', 0, lat, lon) == null) return null;
    const dz = (o.elev != null && Number.isFinite(o.elev) && orog != null) ? o.elev - orog : 0;
    const S = { run: L.run, runTimeUtc: L.meta.runTimeUtc, lat, lon, modelElevM: orog == null ? null : Math.round(orog), pointElevM: o.elev == null ? null : o.elev, heightAdjustedK: r2(-LAPSE * dz),
      lead: [], time: [], intervalH: [], t2m: [], d2m: [], tp: [], wind10: [], wdir: [], gust: [] };
    const extra = ['msl', 'sp', 'tcc', 'ssrd'].filter((n) => L.V[n]); for (const n of extra) S[n] = [];   /* runs fetched before v283.15 carry these */
    L.steps.forEach((s, k) => {
      S.lead.push(s); S.time.push(new Date(L.t0 + s * 3600e3).toISOString().slice(0, 16) + 'Z'); S.intervalH.push(k ? s - L.steps[k - 1] : 0);
      const t = bil(L, 't2m', k, lat, lon), d = bil(L, 'd2m', k, lat, lon), u = bil(L, 'u10', k, lat, lon), v = bil(L, 'v10', k, lat, lon);
      S.t2m.push(r2(t == null ? null : t - LAPSE * dz)); S.d2m.push(r2(d == null ? null : d - LAPSE * dz));
      S.wind10.push(u == null || v == null ? null : r2(Math.hypot(u, v))); S.wdir.push(u == null || v == null ? null : Math.round((Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360));
      for (const n of ['tp', 'gust', ...extra]) S[n].push(r2(bil(L, n, k, lat, lon)));
    });
    if (L.cache.size > 4000) L.cache.clear(); L.cache.set(key, S);
    return S;
  }
  /* one value per UTC hour (ms): instantaneous fields linear between steps; rain spread evenly over its interval; gust the interval max;
     null outside the run, or for an hour before the first interval */
  function atHour(S, ms) {
    const L = latest(); if (!L || !S) return null; const h = (ms - L.t0) / 3600e3; if (!(h > 0) || h > S.lead[S.lead.length - 1]) return null;
    let k = 1; while (k < S.lead.length && S.lead[k] < h) k++; const a = S.lead[k - 1], b = S.lead[k], w = (h - a) / (b - a);
    const lin = (n) => (!S[n] || S[n][k - 1] == null || S[n][k] == null) ? null : S[n][k - 1] + w * (S[n][k] - S[n][k - 1]);
    return { t2m: lin('t2m'), d2m: lin('d2m'), wind10: lin('wind10'), msl: lin('msl'), tcc: lin('tcc'), tp: S.tp[k] == null ? null : S.tp[k] / (b - a), gust: S.gust[k], ssrd: S.ssrd ? S.ssrd[k] : null, leadH: h };
  }
  /* ══ v91.17.283.24 · THE IFS DETERMINISTIC PKT-DAY RAIN TOTAL (heavy-rain method d, rainprob.mjs) ════════════════════════════════
     The heavy-rain station event test (data/rain-prob-coefs-ifsdet.json) calibrated the chance of >= 15.6 mm on the day total of the
     ECMWF IFS deterministic 00 UTC run of date I at the point, for the Pakistan days I+1 .. I+3: the accumulated rain from step
     19 + 24 (k - 1) to step 19 + 24 k (19 UTC = 00 PKT), each end read linearly inside its 3-hour step, negative de-accumulation 0, any
     step needed missing -> no total (never 0). The same 00 UTC run is read here from the runs this server already fetches (no
     provider call): the newest held 00 UTC run whose steps reach 91 h. Returns { run, initDate, days: { 'YYYY-MM-DD': { mm, lead } } }. */
  let D0 = null;
  let D0p = null;
  function run00(back = 0) {
    const idx = index(); const runs = idx && Array.isArray(idx.runs) ? idx.runs.filter((r) => /^\d{8}00$/.test(String(r.run)) && Number(r.maxStep) >= 91) : [];
    const id = runs.length > back ? String(runs[runs.length - 1 - back].run) : null; if (!id) return null;
    if (back === 1) { if (D0p && D0p.run === id) return D0p; if (R && R.run === id) return (D0p = R); return (D0p = decode(id)); }
    if (D0 && D0.run === id) return D0; if (R && R.run === id) return (D0 = R);
    return (D0 = decode(id));
  }
  /* v91.17.283.31 · science lane · TODAY FROM YESTERDAY'S RUN AT LEAD 1. The newest 00 UTC run's PKT days start at lead 1 (tomorrow
     once today's run is held); today is then lead 0, which was never tested. Today's day total is taken from the previous 00 UTC run,
     where it is lead 1 (a tested lead), and is marked so (fromPreviousRun, run). */
  function pktDayTotals(lat, lon) {
    const out = pktDayTotals1(run00(0), lat, lon); if (!out) return null;
    try { const P = run00(1); const prev = P ? pktDayTotals1(P, lat, lon) : null;
      if (prev) for (const [date, x] of Object.entries(prev.days)) if (x.lead === 1 && !out.days[date]) out.days[date] = { ...x, run: prev.run, fromPreviousRun: true }; } catch (_) {}
    return out;
  }
  function pktDayTotals1(L, lat, lon) {
    if (!L || !L.V.tp) return null;
    const key = 'pdt|' + lat.toFixed(4) + ',' + lon.toFixed(4); if (L.cache.has(key)) return L.cache.get(key);
    const steps = L.steps, cum = [0]; let ok = true;
    for (let k = 1; k < steps.length; k++) { const v = ok ? bil(L, 'tp', k, lat, lon) : null; if (v == null || !Number.isFinite(v)) { ok = false; cum.push(null); } else cum.push(cum[k - 1] + Math.max(0, v)); }
    const at = (h) => { const k = steps.findIndex((s) => s >= h); if (k < 0) return null; if (steps[k] === h) return cum[k]; if (k === 0 || cum[k] == null || cum[k - 1] == null) return null;
      return cum[k - 1] + (h - steps[k - 1]) / (steps[k] - steps[k - 1]) * (cum[k] - cum[k - 1]); };
    const initDate = new Date(L.t0).toISOString().slice(0, 10), days = {};
    for (const k of [1, 2, 3]) { const a = at(19 + 24 * (k - 1)), b = at(19 + 24 * k); const date = new Date(L.t0 + k * 864e5).toISOString().slice(0, 10);
      days[date] = { lead: k, mm: a == null || b == null ? null : Math.round(Math.max(0, b - a) * 100) / 100 }; }
    const out = { run: L.run, runTimeUtc: L.meta.runTimeUtc, initDate, days, credit: ECMWF010_CREDIT };
    if (L.cache.size > 4000) L.cache.clear(); L.cache.set(key, out); return out;
  }
  function point(lat, lon, o = {}) {
    const S = series(lat, lon, o); if (!S) return null;
    const maxLead = Number.isFinite(o.maxLead) ? o.maxLead : Infinity;
    if (!o.hourly) { const keep = S.lead.map((s) => s <= maxLead); const out = {}; for (const [k, v] of Object.entries(S)) out[k] = Array.isArray(v) ? v.filter((_, i) => keep[i]) : v; return { ...out, step: 'native (3 h to 144 h, 6 h after)', credit: ECMWF010_CREDIT }; }
    const L = latest(); const H = { run: S.run, runTimeUtc: S.runTimeUtc, lat, lon, modelElevM: S.modelElevM, pointElevM: S.pointElevM, step: 'hourly (linear between steps; rain spread evenly over its interval; gust is the GRIB maximum of the step: last 1 h at steps to 90 h, 3 h to 144 h, 6 h after)', time: [], lead: [], t2m: [], d2m: [], tp: [], wind10: [], gust: [], ...(S.msl ? { msl: [] } : {}), ...(S.tcc ? { tcc: [] } : {}), credit: ECMWF010_CREDIT };
    for (let h = 1; h <= Math.min(maxLead, S.lead[S.lead.length - 1]); h++) { const x = atHour(S, L.t0 + h * 3600e3); if (!x) continue; H.time.push(new Date(L.t0 + h * 3600e3).toISOString().slice(0, 16) + 'Z'); H.lead.push(h); for (const n of ['t2m', 'd2m', 'tp', 'wind10', 'gust', 'msl', 'tcc']) if (H[n]) H[n].push(r2(x[n])); }
    return H;
  }

  /* -- the fetcher and the scorer, each as its own Python process -- */
  async function runPy(file, args, capMin) {
    const OS = await import('node:os'); const exe = python();
    const a = (exe === 'py' ? ['-3'] : []).concat([file, ...args]);
    /* v91.17.283.2 · the live server is never slowed by this child: lowest CPU priority (Windows IDLE class), numpy / BLAS held to one
       thread, its own time limit inside the kill (--max-minutes for the fetcher) and a lock against a second copy (exit 5) */
    /* v283.51g3 · item 2 · runJob (jobrun.mjs): limit 3 x the normal run (ingest_ecmwf010.py, score_shadow.py), process tree ended on overrun, logged */
    const r = await runJob(jobKeyOf(file, args), exe, a, { capMin, cwd: root, env: { ...process.env, PYTHONIOENCODING: 'utf-8', OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1', NUMEXPR_NUM_THREADS: '1' },
      onSpawn: (ch) => { try { if (ch.pid) OS.setPriority(ch.pid, OS.constants.priority.PRIORITY_LOW); st.lowPriority = true; } catch (e) { st.lowPriority = 'not set: ' + e.message; } } });
    return { code: r.code, out: r.code === -1 ? r.out + ' (Python not found); scripts/ecmwf/SETUP_ECMWF010.bat installs the packages' : r.out };
  }
  async function run() {
    if (!on() || st.busy || !existsSync(script)) return { started: false, busy: st.busy, on: on(), script: existsSync(script) };
    st.busy = true; st.lastStart = new Date().toISOString(); const before = (readJson(join(dir, 'index.json')) || {}).latest || null;
    try {
      const r = await runPy(script, ['--app', root, '--out', dir, '--status', statusFile, '--max-minutes', '85'], 90);
      st.lastCode = r.code; st.tail = r.out.trim().split('\n').slice(-6).map((x) => x.slice(0, 240));
      const now = (readJson(join(dir, 'index.json')) || {}).latest || null;
      if (now && (now !== before || !existsSync(join(shadowDir, now.slice(0, 4) + '-' + now.slice(4, 6), now + '.csv')))) { try { st.shadow = shadow(); } catch (e) { st.shadow = { ok: false, why: e.message }; } }
      if (st.shadow && st.shadow.ok && process.env.NIGRAAN_ECMWF010_SCORE !== '0' && existsSync(scorer)) await score();
      return { started: true, code: r.code, latest: now };
    } finally { st.busy = false; st.lastEnd = new Date().toISOString(); }
  }
  async function score() {
    const args = ['--app', root, '--shadow', shadowDir, '--out', scoreFile];
    try { args.push('--obs', join(ownDir(root), 'data', 'mach', 'db')); } catch (_) {}   /* v91.17.283.28 · NIGRAAN's own MACH day files (no LAMHA copy) */
    args.push('--obs', join(root, '..', 'station-lake', 'archive', 'fleet', 'db'));
    const r = await runPy(scorer, args, 20); st.scoreCode = r.code; st.score = r.out.trim().split('\n').slice(-3).map((x) => x.slice(0, 240)); return r.code;
  }

  /* -- the shadow: ecmwf010 beside the forecast served now, at every MACH station, future hours -- */
  function shadow() {
    const L = latest(); if (!L) return { ok: false, why: 'no run held' };
    const F = app.fleet; if (!F || !F.fcHours) return { ok: false, why: 'fleet pairs cache not available' };
    const stations = (readJson(join(dataDir, 'mach-fleet-stations.json')) || {}).stations || [];
    const now = Date.now(), maxLead = Number(process.env.NIGRAAN_ECMWF010_SHADOW_LEAD_H) || 72;
    const head = 'shadow_utc,run_utc,valid_utc,lead_h,interval_h,key,zone,excluded,lat,lon,point_elev_m,model_elev_m,e_t2m,e_t2m_raw,e_d2m,e_wind_kmh,e_gust_kmh,e_tp_mm,c_at_utc,c_lead_h,c_t2m_start,c_t2m_served,c_d2m,c_wind_kmh,c_tp_mm,c_tp_hours,c_t2m_served_e,c_d2m_served,c_d2m_served_e,c_wind_served,c_wind_served_e,c_e_substituted';   /* v91.17.283.8 · audit 14: the served chain with the 9 km values substituted (_e) beside the served chain (fleet.mjs) */
    const lines = []; let withC = 0;
    for (const s of stations) {
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) continue;
      const C = F.fcHours(String(s.key)); const elev = C && Number.isFinite(C.elev) ? C.elev : null;
      const S = series(s.lat, s.lon, { elev }); const S0 = series(s.lat, s.lon, {}); if (!S) continue;
      let zone = null; try { zone = app.mos && app.mos.zoneOfPoint ? app.mos.zoneOfPoint(s.lat, s.lon, elev) : null; } catch (_) {}
      const ex = 0;   /* v91.17.283.14 · no station is excluded (obsqc.mjs judges values); the column stays for the file's readers */
      const HM = C ? new Map(C.hours) : new Map();
      S.lead.forEach((lead, k) => {
        const vms = L.t0 + lead * 3600e3; if (vms < now || lead > maxLead || k === 0) return;
        const iv = S.intervalH[k]; const hk = new Date(vms).toISOString().slice(0, 13); const c = HM.get(hk) || null;
        let ctp = null, ctpH = 0; if (C) { let sum = 0; for (let h = 0; h < iv; h++) { const x = HM.get(new Date(vms - h * 3600e3).toISOString().slice(0, 13)); if (x && Number.isFinite(x.pr)) { sum += x.pr; ctpH++; } } if (ctpH === iv) ctp = Math.round(sum * 100) / 100; }
        if (c) withC++;
        const kmh = (x) => (x == null ? '' : Math.round(x * 3.6 * 100) / 100);
        const row = [new Date(now).toISOString().slice(0, 16) + 'Z', S.runTimeUtc, S.time[k], lead, iv, s.key, zone || '', ex, s.lat, s.lon, elev == null ? '' : elev, S.modelElevM == null ? '' : S.modelElevM,
          S.t2m[k], S0.t2m[k], S.d2m[k], kmh(S.wind10[k]), kmh(S.gust[k]), S.tp[k],
          C ? new Date(C.at).toISOString().slice(0, 16) + 'Z' : '', C ? Math.round((vms - C.at) / 3600e3) : '', c ? c.raw : '', c ? c.served : '', c ? c.dew : '', c ? c.wind : '', ctp == null ? '' : ctp, C ? ctpH : '',
          c && c.servedE != null ? c.servedE : '', c && c.sdew != null ? c.sdew : '', c && c.sdewE != null ? c.sdewE : '', c && c.swind != null ? c.swind : '', c && c.swindE != null ? c.swindE : '', c ? (c.eSub ? 1 : 0) : ''];
        lines.push(row.map((v) => (v == null ? '' : String(v).replace(/,/g, ';'))).join(','));
      });
    }
    const m = L.run.slice(0, 4) + '-' + L.run.slice(4, 6); const d = join(shadowDir, m); mkdirSync(d, { recursive: true });
    const f = join(d, L.run + '.csv'); writeFileSync(f + '.tmp', head + '\n' + lines.join('\n') + '\n'); renameSync(f + '.tmp', f);
    return { ok: true, at: new Date(now).toISOString(), run: L.run, rows: lines.length, withServed: withC, file: f };
  }

  /* -- serve switch (off by default): which variables passed the rule -- */
  function passed() {
    const s = readJson(scoreFile); const out = new Set(); if (!s || !s.decision) return out;
    for (const [om, n] of Object.entries(ECMWF010_SERVE_VARS)) if (s.decision[n] && s.decision[n].pass === true) out.add(om);
    return out;
  }
  /* best_match /v1/forecast answer (Buffer) -> Buffer with the passed variables replaced for the hours the latest run covers ahead of now */
  function substitute(buf, qs) {
    if (!serveOn()) return buf;
    const models = qs.get('models'); if (models && models !== 'best_match') return buf;
    if ((qs.get('timeformat') || 'iso8601') !== 'iso8601') return buf;
    const P = passed(); if (!P.size || !latest()) return buf;
    const want = String(qs.get('hourly') || '').split(',').filter((v) => P.has(v));
    if ((qs.get('temperature_unit') || 'celsius') !== 'celsius') { const i = want.indexOf('temperature_2m'); if (i >= 0) want.splice(i, 1); const j = want.indexOf('dew_point_2m'); if (j >= 0) want.splice(j, 1); }
    if ((qs.get('precipitation_unit') || 'mm') !== 'mm') { const i = want.indexOf('precipitation'); if (i >= 0) want.splice(i, 1); }
    const wu = qs.get('wind_speed_unit') || 'kmh'; const wf = { kmh: 3.6, ms: 1, mph: 2.236936, kn: 1.943844 }[wu];
    if (!wf) { const i = want.indexOf('wind_speed_10m'); if (i >= 0) want.splice(i, 1); }
    if (!want.length) return buf;
    let j; try { j = JSON.parse(buf.toString('utf8')); } catch (_) { return buf; }
    const locs = Array.isArray(j) ? j : [j]; const now = Date.now(); let n = 0;
    for (const loc of locs) { const hrs = substituteLoc(loc, want, wf, now); if (hrs) { n++; loc.agn_ecmwf010 = { run: latest().run, variables: want, hours: hrs, rule: 'switch rule passed at MACH stations on the full served chain (data/ecmwf010-score.json)', credit: ECMWF010_CREDIT }; } }
    return n ? Buffer.from(JSON.stringify(Array.isArray(j) ? locs : locs[0])) : buf;
  }
  /* v91.17.283.8 · audit 14 · the substitution on one location object (the provider's answer for one point), shared by serving and by the
     shadow of the FULL served chain (fleet.mjs: the same substitution, then the same correction chain, then scored): wf = wind unit factor
     from m/s; hours before nowMs are kept; returns the number of hours changed */
  function substituteLoc(loc, want, wf = 3.6, nowMs = Date.now()) {
    const H = loc && loc.hourly; if (!H || !Array.isArray(H.time) || !Number.isFinite(loc.latitude) || !latest()) return 0;
    const S = series(loc.latitude, loc.longitude, { elev: Number.isFinite(loc.elevation) ? loc.elevation : null }); if (!S) return 0;
    const off = (Number(loc.utc_offset_seconds) || 0) * 1000; let hrs = 0;
    H.time.forEach((t, i) => { const ms = Date.parse(String(t).replace(/Z?$/, 'Z')) - off; if (!(ms >= nowMs)) return; const x = atHour(S, ms); if (!x) return; let any = false;
      for (const om of want) { const a = H[om]; if (!Array.isArray(a)) continue; const v = x[ECMWF010_SERVE_VARS[om]]; if (v == null) continue;
        a[i] = om === 'wind_speed_10m' ? Math.round(v * wf * 10) / 10 : Math.round(v * 10) / 10; any = true; }
      if (any) hrs++; });
    return hrs;
  }

  /* v91.17.283.2 · no install path in a served answer (permanent S2): folders are given relative to the install */
  function relDir(x) { if (x == null) return x; let t = String(x); for (const r of [root, join(root, '..')]) { t = t.split(r + '\\').join('').split(r + '/').join('').split(r).join('.'); } return t; }
  function status() {
    const idx = readJson(join(dir, 'index.json')); const sc = readJson(scoreFile);
    return { on: on(), serve: { on: serveOn(), flag: 'NIGRAAN_ECMWF010_SERVE=1', passed: [...passed()] }, script: ECMWF010_FETCH_SCRIPT, dir: relDir(dir), busy: st.busy, lastStart: st.lastStart, lastEnd: st.lastEnd, lastCode: st.lastCode, tail: (st.tail || []).map(relDir), child: { lowPriority: st.lowPriority ?? null, killAfterMin: 90, ownLimitMin: 85, lock: 'data/ecmwf010/fetch.lock (exit 5 = another fetcher running)', threads: 'numpy / BLAS 1 thread' },
      fetch: readJson(statusFile), runs: idx ? idx.runs : [], latest: idx ? idx.latest : null, shadow: st.shadow, scoreCode: st.scoreCode, scoreTail: st.score,
      decision: sc ? sc.decision : null, scored: sc ? sc.built : null, credit: ECMWF010_CREDIT,
      /* v91.17.283.3 · when the fetcher next looks for a new run (every everyMin minutes, the first 7 min after the server started) */
      everyMin, nextCheckAt: on() ? new Date(st.lastStart ? Date.parse(st.lastStart) + everyMin * 60e3 : t0Mod + 7 * 60e3).toISOString() : null };
  }
  function route(p, url, ctx = {}) {
    if (p === '/api/ecmwf010/status') { if (url.searchParams.get('run') === '1' && ctx.canRun) run().catch(() => {}); return { status: 200, body: { ok: true, ...status() } }; }
    if (p === '/api/ecmwf010/point') {
      const lat = Number(url.searchParams.get('lat')), lon = Number(url.searchParams.get('lon')); const e = url.searchParams.get('elev');
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { status: 400, body: { ok: false, error: 'lat and lon are required' } };
      const r = point(lat, lon, { elev: e != null && e !== '' && Number.isFinite(Number(e)) ? Number(e) : null, hourly: url.searchParams.get('hourly') === '1', maxLead: url.searchParams.has('maxLead') ? Number(url.searchParams.get('maxLead')) : undefined });
      if (!r) return { status: latest() ? 404 : 503, body: { ok: false, error: latest() ? 'outside the Pakistan box (23-38 N, 60-78 E)' : 'no ECMWF 0.1 deg run held yet' } };
      return { status: 200, body: { ok: true, ...r } };
    }
    return null;
  }
  const everyMin = Math.max(10, Number(process.env.NIGRAAN_ECMWF010_EVERY_MIN) || 30);
  if (opts.schedule !== false && on()) schedule(app, 'ecmwf010', everyMin * 60e3, () => run().then((r) => { if (r && r.code && r.code !== 0 && r.code !== 3 && r.code !== 5) throw new Error('ingest_ecmwf010.py exited ' + r.code + ': ' + ((st.tail || []).slice(-1)[0] || '')); }), { firstMs: 7 * 60e3, heavy: 'bulk', label: 'ECMWF 0.1 deg open data (Python)' });
  return { run, status, route, point, series, atHour, shadow, score, substitute, substituteLoc, serveOn, passed, latest, pktDayTotals, run00: () => { const L = run00(); return L ? L.run : null; } };
}
