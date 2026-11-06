/* v91.17.270 · FIT agent · B2 baseline: THE SERVED CHAIN REPLAYED ON THE GFS PROFILE INPUT (the same model input the new terms are fitted on).
   Copy of chain_replay_s2p.mjs's sandbox (v91.17.262) with a different input: ds2/b2_chain_input.py writes one line per station with the
   continuous hourly GFS series at the station (temperature at the station height by the provider's -6.5 C/km, dew point, cloud, wind
   km/h, shortwave; wind direction and precipitation are missing in the pack and go in as null) and the station's laptop-sampled static
   bands. For every station and Pakistan... (UTC) day D from the 4th day on, the request the page would send for that place is replayed:
   96 hours (D-3 .. D+1), issued at D-1 12:00 UTC (lead day 1, as the step-2 replays), through verification.correctResponse with the live
   layers off (historical hours: the synoptic running term and the MACH live layer are today's corrections) and the weather MOS on.
   The zone merge (mountain / hills: ICON, GFS and Meteo-France members) and the plains multi-model start (blend v3) need the other
   models' forecasts, which the pack does not hold: those steps do not run (best_match path, as the v266 chain for a plain request).
   FEATURE BANDS: the cloud copy of data/feat lacks the terrain bands (t_slope, t_valley_depth, hz_*, ...) the national model and the
   weather MOS read; where the backend asks for a band the copy does not hold, at the station's own g9 cell, the station's laptop-sampled
   value (station_meta b_<band>) is answered. Every other missing band stays missing (counted in the summary line).
   SANDBOX: every file write outside the output folder is a no-op, network and child processes fail, long timers never fire.
   node scripts/replay/chain_gfs_replay.mjs --in <chain_input.jsonl.gz> --out <chain_out.jsonl> [--shard i/n] [--every 1] [--days N] */
import fsAll from 'node:fs';
import zlib from 'node:zlib';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import { Writable } from 'node:stream';
import { EventEmitter } from 'node:events';
import http from 'node:http'; import https from 'node:https'; import cp from 'node:child_process';
const readFileSync = (...a) => fsAll.readFileSync(...a), existsSync = (...a) => fsAll.existsSync(...a);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
process.env.NIGRAAN_WORKER = '0'; process.env.NIGRAAN_ENGINE = '0'; process.env.NIGRAAN_PYJOBS = '0';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, A) => (x.startsWith('--') ? a.concat([[x.slice(2), A[i + 1]]]) : a), []));
if (!args.in || !args.out) { console.error('usage: --in <chain_input.jsonl.gz> --out <file.jsonl> [--shard i/n]'); process.exit(2); }
const OUT = resolve(args.out);
const OUTDIR = resolve(dirname(OUT)).toLowerCase(); const KEEP = { append: fsAll.appendFileSync, write: fsAll.writeFileSync, rename: fsAll.renameSync };
const blocked = []; const note = (k, p) => { if (blocked.length < 40) blocked.push(k + ' ' + String(p).slice(0, 160)); };
const inOut = (p) => { try { return resolve(String(p)).toLowerCase().startsWith(OUTDIR); } catch (_) { return false; } };
for (const k of ['writeFileSync', 'appendFileSync', 'renameSync', 'unlinkSync', 'rmSync', 'rmdirSync', 'copyFileSync', 'truncateSync', 'writeSync']) {
  const orig = fsAll[k]; if (typeof orig !== 'function') continue;
  fsAll[k] = function (p, ...r) { if (k !== 'writeSync' && inOut(p) && !/^(unlink|rm)/.test(k)) return orig.call(this, p, ...r); note(k, p); return k === 'writeSync' ? 0 : undefined; }; }
for (const k of ['writeFile', 'appendFile', 'rename', 'unlink', 'rm', 'copyFile']) { if (typeof fsAll[k] === 'function') fsAll[k] = function (p, ...r) { note(k, p); const cb = r[r.length - 1]; if (typeof cb === 'function') process.nextTick(cb, null); }; }
for (const k of ['writeFile', 'appendFile', 'rename', 'unlink', 'rm', 'copyFile']) { if (fsAll.promises && typeof fsAll.promises[k] === 'function') fsAll.promises[k] = async (p) => { note('promises.' + k, p); }; }
fsAll.createWriteStream = (p) => { note('createWriteStream', p); return new Writable({ write(c, e, cb) { cb(); } }); };
const fakeEmitter = (what) => { const e = new EventEmitter(); const err = new Error('replay: ' + what + ' is off');
  for (const k of ['end', 'write', 'abort', 'destroy', 'setTimeout', 'setNoDelay', 'setHeader', 'flushHeaders', 'kill', 'unref', 'ref']) e[k] = () => e;
  e.stdout = new EventEmitter(); e.stderr = new EventEmitter(); e.stdin = { write() {}, end() {} };
  process.nextTick(() => { if (e.listenerCount('error')) e.emit('error', err); }); return e; };
const noNet = () => { note('network', ''); return fakeEmitter('network'); };
http.request = http.get = https.request = https.get = noNet; globalThis.fetch = async () => { throw new Error('replay: network is off'); };
for (const k of ['spawn', 'exec', 'execFile', 'fork']) cp[k] = () => { note('child', k); return fakeEmitter('child process'); };
for (const k of ['spawnSync', 'execSync', 'execFileSync']) cp[k] = () => { throw new Error('replay: child processes are off'); };
syncBuiltinESMExports();
const realNow = Date.now.bind(Date); let fake = null; Date.now = () => (fake != null ? fake : realNow());
const RT = { si: globalThis.setInterval, st: globalThis.setTimeout };
const dummyTimer = { unref() { return this; }, ref() { return this; }, hasRef() { return false; }, refresh() { return this; }, [Symbol.toPrimitive]() { return 0; } };
globalThis.setInterval = () => dummyTimer; globalThis.setTimeout = (fn, ms, ...a) => (Number(ms) > 1000 ? dummyTimer : RT.st(fn, ms, ...a));
const { createBackend } = await import(pathToFileURL(join(ROOT, 'server', 'api', 'index.mjs')).href);
const quiet = console.log; console.log = () => {};
const backend = createBackend({ root: ROOT, dataDir: join(ROOT, 'data') }); const app = backend.app;
globalThis.setInterval = RT.si; globalThis.setTimeout = RT.st;
console.log = quiet;
const V = app.verification;
const rh = (t, td) => (t == null || td == null) ? null : Math.max(1, Math.min(100, Math.round(100 * Math.exp(17.625 * td / (243.04 + td)) / Math.exp(17.625 * t / (243.04 + t)))));

/* feature-grid fill at the station's own cell (g9: north 37.25, west 60.75, 0.0025 deg) */
const G9 = { north: 37.25, west: 60.75, cell: 0.0025 };
const cellOf = (la, lo) => Math.floor((G9.north - la) / G9.cell) + ',' + Math.floor((lo - G9.west) / G9.cell);
const FILL = new Map(); const asked = new Map(); const filled = new Map();
const FG = app.featGrid; const origValue = FG.value, origAt = FG.at;
FG.value = function (band, la, lo) { const v = origValue(band, la, lo); if (v != null) return v;
  const st = FILL.get(cellOf(la, lo)); asked.set(band, (asked.get(band) || 0) + 1);
  if (st && st[band] != null) { filled.set(band, (filled.get(band) || 0) + 1); return st[band]; } return v; };
FG.at = function (la, lo, bands) { const out = {}; for (const b of (bands || FG.list())) out[b] = FG.value(b, la, lo); return out; };

const [SH, NS] = (args.shard || '0/1').split('/').map(Number); const EVERY = Number(args.every || 1); const MAXD = Number(args.days || 0);
const lines = zlib.gunzipSync(readFileSync(resolve(args.in))).toString('utf8').trim().split('\n');
if (existsSync(OUT) && !args.resume) KEEP.rename(OUT, OUT + '.prev-' + realNow());
if (!existsSync(OUT)) KEEP.write(OUT, '');
const SKIP = new Set(); if (args.resume) for (const l of readFileSync(OUT, 'utf8').split('\n')) { if (!l) continue; try { SKIP.add(JSON.parse(l).s); } catch (_) {} }
let done = 0, failed = 0; const t0 = realNow(); const metaCount = {};
for (let li = 0; li < lines.length; li++) {
  if (li % NS !== SH) continue;
  const P = JSON.parse(lines[li]); if (SKIP.has(P.station)) continue;
  FILL.clear(); FILL.set(cellOf(P.lat, P.lon), P.bands || {});
  const t0ms = Date.parse(P.t0 + 'Z'); const NH = P.T.length; const DAYS = Array.isArray(P.days) ? new Set(P.days) : null;
  const iso = (k) => new Date(t0ms + k * 3600e3).toISOString().slice(0, 16);
  const ndays = Math.floor(NH / 24); let rowsOut = [];
  for (let di = 3; di < ndays; di += EVERY) {
    if (MAXD && di >= 3 + MAXD) break;
    const k0 = (di - 3) * 24, k1 = (di + 1) * 24; const day = iso(di * 24).slice(0, 10);
    if (DAYS && !DAYS.has(day)) continue;   /* only the days the station observed (b2_chain_input.py 'days') */
    const sl = (a) => a.slice(k0, k1);
    const H = { time: Array.from({ length: k1 - k0 }, (_, i) => iso(k0 + i)), temperature_2m: sl(P.T), dew_point_2m: sl(P.TD), cloud_cover: sl(P.CL), wind_speed_10m: sl(P.WS),
                wind_direction_10m: new Array(k1 - k0).fill(null), shortwave_radiation: sl(P.SW), precipitation: new Array(k1 - k0).fill(null) };
    if (H.temperature_2m.slice(72).filter(x => x != null).length < 20 || H.temperature_2m.slice(0, 72).filter(x => x != null).length < 60) continue;
    H.relative_humidity_2m = H.temperature_2m.map((x, i) => rh(x, H.dew_point_2m[i]));
    const base = { latitude: P.lat, longitude: P.lon, elevation: P.elev, utc_offset_seconds: 0, timezone: 'GMT', hourly_units: { temperature_2m: '°C', wind_speed_10m: 'km/h' }, hourly: H };
    const qs = new URLSearchParams({ latitude: String(P.lat), longitude: String(P.lon), models: 'best_match', hourly: Object.keys(H).filter(k => k !== 'time').join(','), wind_speed_unit: 'kmh' });
    fake = Date.parse(day + 'T12:00Z') - 864e5;
    let o = null;
    try { const r = V.correctResponse(Buffer.from(JSON.stringify([base])), qs, [], null, 0, false, null, true); const j = JSON.parse(r.buf.toString('utf8')); o = Array.isArray(j) ? j[0] : j; }
    catch (e) { failed++; fake = null; continue; }
    fake = null;
    if (!o || !o.hourly) { failed++; continue; }
    const r1 = (x) => x == null ? null : Math.round(x * 100) / 100;
    const meta = { basis: o.agn_temperature_basis && o.agn_temperature_basis.correction, nat: o.agn_national ? (o.agn_national.applied ? (o.agn_national.variant + ':' + o.agn_national.weight) : 'off') : null,
                   wx: o.agn_wxmos ? !!o.agn_wxmos.applied : null, steps: o.agn_chain ? o.agn_chain.steps : null };
    const mk = JSON.stringify(meta); metaCount[mk] = (metaCount[mk] || 0) + 1;
    rowsOut.push(JSON.stringify({ s: P.station, d: day, T: o.hourly.temperature_2m.slice(72, 96).map(r1), TD: Array.isArray(o.hourly.dew_point_2m) ? o.hourly.dew_point_2m.slice(72, 96).map(r1) : null, m: meta }));
    done++;
    if (rowsOut.length >= 200) { KEEP.append(OUT, rowsOut.join('\n') + '\n'); rowsOut = []; }
    if (done % 1000 === 0) quiet('rows', done, 'station', P.station, Math.round((realNow() - t0) / 1000) + ' s');
  }
  if (rowsOut.length) KEEP.append(OUT, rowsOut.join('\n') + '\n');
}
const summ = { done, failed, seconds: Math.round((realNow() - t0) / 1000), meta: metaCount, bandsAskedMissing: Object.fromEntries(asked), bandsFilledFromStation: Object.fromEntries(filled), blocked };
KEEP.write(OUT + '.summary.json', JSON.stringify(summ, null, 1));
quiet('finished', JSON.stringify({ done, failed, seconds: summ.seconds }));
process.exit(0);
