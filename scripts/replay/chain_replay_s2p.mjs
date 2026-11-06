/* v91.17.264 · --basekeep 1 (with --base): only best_match is replaced by the blend; the zone members keep their own forecasts
   (the mountain / hills test of whether setting the members equal to the blend caused the -1 C shift of Step 2c/2d).
   v91.17.262 · STEP 2e copy of chain_replay_s2.mjs: --natmem 1 gives the national model its POOL members (ICON, GFS, Meteo-France
   temperature at the same lead) beside a plain best_match request, as the live server does for a page request of up to 40 places
   (server.mjs natMem). The members come from the point's own lead cache where fetch_leads.py fetched them, else from the natmem
   cache (station-lake/scripts/step2_fetch_natmem.py). They are read BEFORE --base replaces the start, so they stay the real models
   (the 'keep' option of the live blend). Everything else is chain_replay_s2.mjs unchanged.
   v91.17.261 · STEP 2 copy of chain_replay.mjs (v91.17.109), for the blend-first test. Differences from the original:
   - runs on Windows (paths from fileURLToPath, the backend imported by file URL);
   - --base <dir>: the starting forecast is replaced by the model blend in <dir>/<pid>.json (step2_blend.py): temperature and dew point
     at every lead, for best_match and for the zone members where the point has them; an hour the blend does not cover is left empty;
   - SANDBOX: this process must never touch the live server's state. Before the backend loads, every file write outside the output
     folder becomes a no-op, network calls and child processes fail, and timers of more than 1 s set while the backend is created
     never fire (its schedulers stay idle). The replay only reads.
   - --tc <file> (step 2c): the station calibration table is read from <file> instead of data/temp-correction.json.
   node scripts/replay/chain_replay_s2.mjs --pids <test_locked.json> --modes full --start YYYY-MM-DD --end YYYY-MM-DD --out <file> [--base <dir>] [--tc <file>] [--zones mountain,hills] */
import fsAll from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { Writable } from 'node:stream';
import { EventEmitter } from 'node:events';
import http from 'node:http'; import https from 'node:https'; import cp from 'node:child_process';
const readFileSync = (...a) => fsAll.readFileSync(...a), existsSync = (...a) => fsAll.existsSync(...a), readdirSync = (...a) => fsAll.readdirSync(...a);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), LAKE = join(ROOT, '..', 'station-lake');
process.env.NIGRAAN_WORKER = '0'; process.env.NIGRAAN_ENGINE = '0'; process.env.NIGRAAN_PYJOBS = '0';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, A) => (x.startsWith('--') ? a.concat([[x.slice(2), A[i + 1]]]) : a), []));
const OUT = args.out || join(LAKE, 'archive', 'replay', 'replay_' + (process.env.NIGRAAN_NATIONAL_HORIZON_H ? 'nofade' : 'v108') + '.jsonl');
const OUTDIR = resolve(dirname(OUT)).toLowerCase(); const KEEP = { append: fsAll.appendFileSync, write: fsAll.writeFileSync, rename: fsAll.renameSync };
const blocked = []; const note = (k, p) => { if (blocked.length < 40) blocked.push(k + ' ' + String(p).slice(0, 160)); };
const inOut = (p) => { try { return resolve(String(p)).toLowerCase().startsWith(OUTDIR); } catch (_) { return false; } };
for (const k of ['writeFileSync', 'appendFileSync', 'renameSync', 'unlinkSync', 'rmSync', 'rmdirSync', 'copyFileSync', 'truncateSync', 'writeSync']) {
  const orig = fsAll[k]; if (typeof orig !== 'function') continue;
  fsAll[k] = function (p, ...r) { if (k !== 'writeSync' && inOut(p) && !/^(unlink|rm)/.test(k)) return orig.call(this, p, ...r); note(k, p); return k === 'writeSync' ? 0 : undefined; }; }
for (const k of ['writeFile', 'appendFile', 'rename', 'unlink', 'rm', 'copyFile']) { if (typeof fsAll[k] === 'function') fsAll[k] = function (p, ...r) { note(k, p); const cb = r[r.length - 1]; if (typeof cb === 'function') process.nextTick(cb, null); }; }
for (const k of ['writeFile', 'appendFile', 'rename', 'unlink', 'rm', 'copyFile']) { if (fsAll.promises && typeof fsAll.promises[k] === 'function') fsAll.promises[k] = async (p) => { note('promises.' + k, p); }; }
fsAll.createWriteStream = (p) => { note('createWriteStream', p); return new Writable({ write(c, e, cb) { cb(); } }); };
const fakeEmitter = (what) => { const e = new EventEmitter(); const err = new Error('step2 replay: ' + what + ' is off');
  for (const k of ['end', 'write', 'abort', 'destroy', 'setTimeout', 'setNoDelay', 'setHeader', 'flushHeaders', 'kill', 'unref', 'ref']) e[k] = () => e;
  e.stdout = new EventEmitter(); e.stderr = new EventEmitter(); e.stdin = { write() {}, end() {} };
  process.nextTick(() => { if (e.listenerCount('error')) e.emit('error', err); }); return e; };
const noNet = () => { note('network', ''); return fakeEmitter('network'); };
http.request = http.get = https.request = https.get = noNet; globalThis.fetch = async () => { throw new Error('step2 replay: network is off'); };
for (const k of ['spawn', 'exec', 'execFile', 'fork']) cp[k] = () => { note('child', k); return fakeEmitter('child process'); };
for (const k of ['spawnSync', 'execSync', 'execFileSync']) cp[k] = () => { throw new Error('step2 replay: child processes are off'); };
/* v91.17.261 step 2c · --tc <file>: the station calibration table (data/temp-correction.json) is read from <file> instead */
if (args.tc) { const TCF = resolve(args.tc); const rf = fsAll.readFileSync, ex = fsAll.existsSync;
  const isTc = (p) => typeof p === 'string' && /[\\/]data[\\/]temp-correction\.json$/i.test(p);
  fsAll.readFileSync = function (p, ...r) { return rf.call(this, isTc(p) ? TCF : p, ...r); };
  fsAll.existsSync = function (p) { return ex.call(this, isTc(p) ? TCF : p); }; }
syncBuiltinESMExports();
if (existsSync(OUT) && !args.resume) KEEP.rename(OUT, OUT + '.prev-' + Date.now());
const EVERY = Number(args.every || 1), NPTS = Number(args.points || 0), LEADS = (args.leads || '1,2,3,5').split(',').map(Number);
const MODES = (args.modes || (process.env.NIGRAAN_NATIONAL_HORIZON_H ? 'full' : 'chain,full,old')).split(',');
const VARS = ['temperature_2m', 'dew_point_2m', 'cloud_cover', 'wind_speed_10m', 'wind_direction_10m', 'shortwave_radiation', 'precipitation'];
const MEMBERS = ['icon_seamless', 'gfs_seamless', 'meteofrance_seamless'];
const realNow = Date.now.bind(Date); let fake = null; Date.now = () => (fake != null ? fake : realNow());
const RT = { si: globalThis.setInterval, st: globalThis.setTimeout };
const dummyTimer = { unref() { return this; }, ref() { return this; }, hasRef() { return false; }, refresh() { return this; }, [Symbol.toPrimitive]() { return 0; } };
globalThis.setInterval = () => dummyTimer; globalThis.setTimeout = (fn, ms, ...a) => (Number(ms) > 1000 ? dummyTimer : RT.st(fn, ms, ...a));
const { createBackend } = await import(pathToFileURL(join(ROOT, 'server', 'api', 'index.mjs')).href);
const quiet = console.log; console.log = () => {};
const backend = createBackend({ root: ROOT, dataDir: join(ROOT, 'data') }); const app = backend.app;
globalThis.setInterval = RT.si; globalThis.setTimeout = RT.st;
console.log = quiet;
const V = app.verification, MOS = app.mos, ZREQ = MOS.requestModels();
const rh = (t, td) => (t == null || td == null) ? null : Math.max(1, Math.min(100, Math.round(100 * Math.exp(17.625 * td / (243.04 + td)) / Math.exp(17.625 * t / (243.04 + t)))));
/* cache: points -> {time -> values} per lead/model */
const files = readdirSync(join(LAKE, 'archive', 'model', 'cache_leads')).filter(f => f.endsWith('.json'));
/* the cache files of a point are found exactly as fetch_leads.py names them (sha1 of the request), not by the coordinates the
   provider returns (it snaps to its grid, and two stations can share a cell) */
const LEADS_F = [1, 2, 3, 5], FVARS = ['temperature_2m', 'dew_point_2m', 'cloud_cover', 'wind_speed_10m', 'wind_direction_10m', 'shortwave_radiation', 'precipitation'];
const HOURLY_Q = FVARS.flatMap(v => LEADS_F.map(L => v + '_previous_day' + L)).join(',');
const pyF = (x) => { const s = x.toFixed(5); return s; };
const pyElev = (e) => e == null ? 'nan' : (Number.isInteger(e) ? e.toFixed(1) : String(e));
function chunksOf(start, end, days = 28) { const out = []; let s = Date.parse(start + 'T00:00Z'); const e = Date.parse(end + 'T00:00Z');
  while (s <= e) { const c = Math.min(s + (days - 1) * 864e5, e); out.push([new Date(s).toISOString().slice(0, 10), new Date(c).toISOString().slice(0, 10)]); s = c + 864e5; } return out; }
const CH = chunksOf(args.start || '2025-10-01', args.end || '2026-09-24');
const filesOf = (p) => { const hill = (p.elev != null && p.elev >= 900) || p.lat >= 34.3; const models = 'best_match' + (hill ? ',' + MEMBERS.join(',') : '');
  return CH.map(([a, b]) => createHash('sha1').update(`leads|${pyF(p.lat)}|${pyF(p.lon)}|${pyElev(p.elev)}|${a}|${b}|${HOURLY_Q}|${models}`).digest('hex').slice(0, 20) + '.json')
    .filter(f => existsSync(join(LAKE, 'archive', 'model', 'cache_leads', f))); };
/* v91.17.262 · natmem cache files of a point (step2_fetch_natmem.py names them the same way) */
const NM_HOURLY = LEADS_F.map(L => 'temperature_2m_previous_day' + L).join(','), NM_MODELS = MEMBERS.join(',');
const natFilesOf = (p) => CH.map(([a, b]) => createHash('sha1').update(`natmem|${pyF(p.lat)}|${pyF(p.lon)}|${pyElev(p.elev)}|${a}|${b}|${NM_HOURLY}|${NM_MODELS}`).digest('hex').slice(0, 20) + '.json')
  .filter(f => existsSync(join(LAKE, 'archive', 'model', 'cache_leads', f)));
let natStat = { points: 0, fromCache: 0, fromLeads: 0, none: 0 };
const rowsOf = (fs) => fs.map(f => { try { return JSON.parse(readFileSync(join(LAKE, 'archive', 'model', 'cache_leads', f), 'utf8')); } catch (_) { return null; } }).filter(Boolean);
const pts = readFileSync(join(LAKE, 'archive', 'national', 'points.csv'), 'utf8').trim().split('\n').slice(1).map(l => { const [pid, net, lat, lon, elev] = l.split(','); return { pid, net, lat: +lat, lon: +lon, elev: elev === '' ? null : +elev }; });
let done = 0; const t0 = realNow(); if (!existsSync(OUT)) KEEP.write(OUT, '');
const SKIP = new Set(); if (args.resume) for (const l of readFileSync(OUT, 'utf8').split('\n')) { if (!l) continue; try { SKIP.add(JSON.parse(l).pid); } catch (_) {} }   /* --resume 1: points already in the output are skipped */
/* v91.17.199 · --pids <json with a points list> limits the replay to those points (the locked test set) */
const PIDS = args.pids ? new Set(JSON.parse(readFileSync(args.pids, 'utf8')).points) : null;
for (const p of (NPTS ? pts.slice(0, NPTS) : pts).filter(q => !PIDS || PIDS.has(q.pid))) {
  if (SKIP.has(p.pid)) continue;
  if (args.zones) { const z0 = MOS.zoneOfPoint(p.lat, p.lon, p.elev); if (!args.zones.split(',').includes(z0)) continue; }
  const fs = filesOf(p); if (!fs.length) { quiet('no cache for', p.pid); continue; }
  const docs = rowsOf(fs); const best = { elev: docs[0].elevation };
  const T = new Map(); for (const d of docs) { const h = d.hourly; h.time.forEach((t, i) => { const o = T.get(t) || T.set(t, {}).get(t); for (const k of Object.keys(h)) if (k !== 'time') o[k] = h[k][i]; }); }
  /* v91.17.262 · --natmem: the pool members by hour and lead, read before --base touches anything */
  let NM = null;
  if (args.natmem) { natStat.points++; NM = new Map();
    const put = (t, N, m, v) => { const o = NM.get(t) || NM.set(t, {}).get(t); (o[N] || (o[N] = {}))[m] = v; };
    let src = 0;
    for (const [t, o] of T) for (const N of LEADS_F) for (const m of MEMBERS) { const k = 'temperature_2m_previous_day' + N + '_' + m; if (k in o) { put(t, N, m, o[k]); src = 1; } }
    if (src) natStat.fromLeads++;
    else { const nd = rowsOf(natFilesOf(p));
      for (const d of nd) { const h = d.hourly; h.time.forEach((t, i) => { for (const N of LEADS_F) for (const m of MEMBERS) { const k = 'temperature_2m_previous_day' + N + '_' + m; if (Array.isArray(h[k])) put(t, N, m, h[k][i]); } }); }
      if (nd.length) natStat.fromCache++; else { natStat.none++; quiet('no pool members for', p.pid); NM = null; } } }
  if (args.base) {
    const bf = join(args.base, p.pid.replace(/[:\/\\]/g, '_') + '.json'); if (!existsSync(bf)) { quiet('no blend for', p.pid); continue; }
    const BL = JSON.parse(readFileSync(bf, 'utf8')); const bi = new Map(BL.time.map((t, i) => [t, i]));
    for (const [t, o] of T) { const i = bi.get(t);
      for (const N of [1, 2, 3, 5]) { const bt = i == null ? null : BL.t[String(N)][i], bd = i == null ? null : BL.td[String(N)][i];
        for (const sfx of (args.basekeep ? ['', '_best_match'] : ['', '_best_match', ...MEMBERS.map((m) => '_' + m)])) {   /* v91.17.264 --basekeep 1: the blend replaces best_match only; the zone members stay the real models */
          const kt = 'temperature_2m_previous_day' + N + sfx, kd = 'dew_point_2m_previous_day' + N + sfx;
          if (sfx === '' || (kt in o)) { o[kt] = bt; o[kd] = bd; } } } } }
  const times = [...T.keys()].sort(); if (times.length < 24 * 10) continue;
  const zone = MOS.zoneOfPoint(p.lat, p.lon, p.elev); const zm = MOS.zoneModel(zone); const zoneish = zm.members && !zm.members.includes('best_match');
  const days = [...new Set(times.map(t => t.slice(0, 10)))].sort().slice(3);
  for (const L of LEADS) for (let di = 0; di < days.length; di += EVERY) {
    const day = days[di];
    /* --issued 1: the series a forecast issued L days before the target day would carry: past 72 h at the shortest lead, then each
       hour at its own lead (day N of the run -> previous_dayN; day 4 = mean of days 3 and 5, the leads fetched). Default: every hour
       at lead L (stitched). A single-model answer carries no model suffix. */
    const ISS = !!args.issued; const issueMs = Date.parse(day + 'T00:00Z') - (ISS ? L : 0) * 864e5;
    const startMs = (ISS ? issueMs : Date.parse(day + 'T00:00Z')) - 3 * 864e5; const NH = ISS ? 72 + L * 24 + 24 : 96;
    const tt = []; for (let h = 0; h < NH; h++) tt.push(new Date(startMs + h * 3600e3).toISOString().slice(0, 16));
    const val = (o, v, N, m) => { if (!o) return null; const x = o[v + '_previous_day' + N + '_' + m] ?? (m === 'best_match' ? o[v + '_previous_day' + N] : undefined); return x == null ? null : x; };
    const get = (v, m) => tt.map((t, i) => { const o = T.get(t);
      if (!ISS) return val(o, v, L, m);
      const lh = (startMs + i * 3600e3 - issueMs) / 3600e3; const N = lh < 0 ? 1 : Math.min(5, Math.floor(lh / 24) + 1);
      if (N === 4) { const a = val(o, v, 3, m), b = val(o, v, 5, m); return (a != null && b != null) ? (a + b) / 2 : (a ?? b); }
      return val(o, v, N, m); });
    const H = { time: tt }; for (const v of VARS) H[v] = get(v, 'best_match'); H.relative_humidity_2m = H.temperature_2m.map((x, i) => rh(x, H.dew_point_2m[i]));
    const T0i = NH - 24; const rawT = H.temperature_2m.slice(T0i, NH); if (rawT.filter(x => x != null).length < 20 || H.temperature_2m.slice(0, 72).filter(x => x != null).length < 60) continue;
    let zrow = null; if (zoneish) { const R = { time: tt }; let ok = true; for (const v of [...VARS, 'relative_humidity_2m']) for (const m of MEMBERS) { if (v === 'relative_humidity_2m') { const a = get('temperature_2m', m), b = get('dew_point_2m', m); R[v + '_' + m] = a.map((x, i) => rh(x, b[i])); } else R[v + '_' + m] = get(v, m); }
      if (R['temperature_2m_icon_seamless'].slice(T0i, NH).every(x => x == null)) ok = false; if (ok) zrow = { models: ZREQ, row: { hourly: R } }; }
    /* v91.17.262 · the members beside a plain request (natMem), at this lead, on the request's hours */
    let natMem = null;
    if (NM && !zoneish) { const o = { time: tt }; for (const m of MEMBERS) o[m] = tt.map(t => { const r = NM.get(t); const x = r && r[L] ? r[L][m] : null; return x == null ? null : x; });
      if (MEMBERS.every(m => o[m].slice(T0i, NH).some(x => x != null))) natMem = [o]; }
    const base = { latitude: p.lat, longitude: p.lon, elevation: p.elev ?? best.elev, utc_offset_seconds: 0, timezone: 'GMT', hourly_units: { temperature_2m: '°C', wind_speed_10m: 'km/h' }, hourly: H };
    const qs = new URLSearchParams({ latitude: String(p.lat), longitude: String(p.lon), models: 'best_match', hourly: Object.keys(H).filter(k => k !== 'time').join(','), wind_speed_unit: 'kmh' });
    fake = ISS ? issueMs : Date.parse(day + 'T12:00Z') - L * 864e5;   /* issued L days before the target day's midday */
    const row = { pid: p.pid, net: p.net, zone, L, day, pool: natMem ? 1 : 0, raw: rawT.map(x => x == null ? null : Math.round(x * 10) / 10) };
    for (const m of MODES) {
      const loc = JSON.parse(JSON.stringify(base)); const buf = Buffer.from(JSON.stringify([loc]));
      let r = null; try { r = V.correctResponse(buf, qs, [], natMem, 0, m === 'chain', m === 'old' ? null : (zrow ? [zrow] : null), true); } catch (e) { row[m + 'Err'] = e.message; continue; }
      let j = null; try { j = JSON.parse(r.buf.toString('utf8')); } catch (_) {}
      const o = Array.isArray(j) ? j[0] : j; row[m] = o && o.hourly ? o.hourly.temperature_2m.slice(T0i, NH) : null;
      if (m === 'full' && o) row.fullMeta = { basis: o.agn_temperature_basis && o.agn_temperature_basis.correction, nat: o.agn_national ? { a: o.agn_national.applied, w: o.agn_national.weight, v: o.agn_national.variant } : null };
    }
    fake = null; KEEP.append(OUT, JSON.stringify(row) + '\n'); done++;
    if (done % 500 === 0) quiet('rows', done, 'points', p.pid, Math.round((realNow() - t0) / 1000) + ' s');
  }
}
quiet('finished', done, 'rows ->', OUT); if (args.natmem) quiet('pool members:', JSON.stringify(natStat)); quiet('blocked side effects (first 40):', JSON.stringify(blocked)); process.exit(0);
