/* == v91.17.283.7 . THE IN-PRODUCT AGENTS: SHARED HELPERS ==========================================================================
   Used by scripts/agents/feed_health.mjs and scripts/agents/verify.mjs, which server/api/agents.mjs starts as low-priority, time-limited
   child processes (outside the request path). The agents only READ archives, copies and logs and only WRITE under data/agents/ (and one
   plain line per feed alert to _admin\alerts.log). No module here opens a network connection (scripts/tests2837/agents_static checks the
   import graph), so an agent can never spend provider calls.
   Statistics are standard: empirical quantiles (Hyndman-Fan type 7, the R / numpy default), Wilson score intervals for proportions,
   day-block bootstrap intervals with a fixed seed (the same ledger always gives the same interval). */
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, appendFileSync, openSync, closeSync, unlinkSync, statSync, writeSync } from 'node:fs';
import { join, dirname } from 'node:path';

export const PKT_MS = 5 * 3600e3;
export const pktDay = (ms) => new Date(ms + PKT_MS).toISOString().slice(0, 10);
export const pktHour = (ms) => new Date(ms + PKT_MS).getUTCHours();
export const dayStartMs = (day) => Date.parse(day + 'T00:00:00Z') - PKT_MS;   /* 00:00 PKT of a Pakistan day */
export const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
export const pktText = (ms) => (ms == null || !Number.isFinite(ms)) ? null : new Date(ms + PKT_MS).toISOString().slice(0, 16).replace('T', ' ') + ' PKT';
export const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
export const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
export const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
export const fin = (x) => x != null && Number.isFinite(x);

export function args(argv = process.argv.slice(2)) {
  const o = {}; for (let i = 0; i < argv.length; i++) { const k = argv[i]; if (!k.startsWith('--')) continue; const v = argv[i + 1];
    if (v == null || v.startsWith('--')) o[k.slice(2)] = true; else { o[k.slice(2)] = v; i++; } }
  return o;
}
export function readJson(f, d = null) { try { return JSON.parse(readFileSync(f, 'utf8')); } catch (_) { return d; } }
export function writeJsonAtomic(f, o) { mkdirSync(dirname(f), { recursive: true }); const t = f + '.tmp' + process.pid; writeFileSync(t, JSON.stringify(o, null, 1)); renameSync(t, f); }
export function appendLine(f, line) { mkdirSync(dirname(f), { recursive: true }); appendFileSync(f, line.endsWith('\n') ? line : line + '\n'); }

/* -- quantile (type 7) on a sorted copy -- */
export function quantile(a, p) {
  const q = a.filter(fin).sort((x, y) => x - y); if (!q.length) return null;
  const h = (q.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h); return q[lo] + (h - lo) * (q[hi] - q[lo]);
}
export const median = (a) => quantile(a, 0.5);
export const mean = (a) => { const q = a.filter(fin); return q.length ? q.reduce((s, x) => s + x, 0) / q.length : null; };

/* -- Wilson score 95 % interval for k of n -- */
export function wilson(k, n, z = 1.959964) {
  if (!(n > 0)) return null; const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), w = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [r3((c - w) / d), r3((c + w) / d)];
}

/* -- seeded RNG (mulberry32) for reproducible bootstrap intervals -- */
export function rng(seed = 20261022) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/* day-block bootstrap of a ratio statistic: blocks = [{num, den}] (one per day); returns the 2.5 / 97.5 % of sum(num)/sum(den) */
export function bootRatio(blocks, B = 2000, seed = 20261022) {
  const b = blocks.filter((x) => x && x.den > 0); if (b.length < 2) return null; const R = rng(seed), out = [];
  for (let i = 0; i < B; i++) { let n = 0, d = 0; for (let j = 0; j < b.length; j++) { const x = b[Math.floor(R() * b.length)]; n += x.num; d += x.den; } if (d > 0) out.push(n / d); }
  return [quantile(out, 0.025), quantile(out, 0.975)];
}

/* -- a lock file against a second copy of the same agent. Taken with O_EXCL; a lock whose process is gone (or older than maxAgeMs, a
      killed run on a machine that reuses pids) is taken over. Returns a release function, or null when another live copy holds it. -- */
export function takeLock(file, maxAgeMs) {
  mkdirSync(dirname(file), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try { const fd = openSync(file, 'wx'); writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() })); closeSync(fd);
      return () => { try { const o = readJson(file); if (o && o.pid === process.pid) unlinkSync(file); } catch (_) {} };
    } catch (e) { if (e.code !== 'EEXIST') throw e; }
    const o = readJson(file, {}); let alive = false; try { if (o && o.pid) { process.kill(o.pid, 0); alive = true; } } catch (e) { alive = e.code === 'EPERM'; }
    let age = Infinity; try { age = Date.now() - statSync(file).mtimeMs; } catch (_) {}
    if (alive && age < maxAgeMs) return null;
    try { unlinkSync(file); } catch (_) {}
  }
  return null;
}

/* -- the agents' plain day log: data/agents/log/<PKT day>.jsonl (what the agents did today) -- */
export function agentLog(dataDir, agent, text, extra = {}, nowMs = Date.now()) {
  appendLine(join(dataDir, 'agents', 'log', pktDay(nowMs) + '.jsonl'), JSON.stringify({ at: new Date(nowMs).toISOString(), agent, text, ...extra }));
}

/* -- MACH database rows (LAMHA's copy) -- */
export const FORECAST_SRC = new Set(['qm', 'apple']);   /* forecast rows stored beside the readings (copies.mjs): never observations */
export const MACH_ALIASES = { key: ['stationKey', 'station_key', 'key'], time: ['time', 'time_utc', 'obs_utc'], source: ['source'], T: ['temperatureC', 'temperature_c'], Td: ['dewPointC', 'dew_point_c'],
  RH: ['humidityPct', 'humidity_pct'], W: ['windSpeedKmh', 'wind_speed_kmh'], G: ['windGustKmh', 'wind_gust_kmh'], P: ['pressureHpa', 'pressure_hpa'], S: ['solarWm2', 'solar_wm2'], PT: ['precipTotalMm', 'precip_total_mm'] };
/* a plain CSV line splitter (quoted fields) */
export function splitCsv(line) { const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else if (c !== '\r') cur += c; }
  out.push(cur); return out; }
export function utcMs(v) { const s = String(v == null ? '' : v).trim(); if (!s) return NaN; if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Date.parse(s + 'T00:00:00Z');
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) return Date.parse(s.replace(' ', 'T') + 'Z'); return Date.parse(s); }
/* read a whole CSV (small daily files) into rows of named columns, the header aliases resolved */
export function readCsv(file, aliases) {
  let txt; try { txt = readFileSync(file, 'utf8'); } catch (_) { return null; }
  const lines = txt.replace(/^\uFEFF/, '').split('\n'); while (lines.length && !lines[0].trim()) lines.shift(); if (!lines.length) return [];
  const head = splitCsv(lines[0]).map((h) => h.trim()); const idx = {};
  for (const [k, names] of Object.entries(aliases)) { const i = head.findIndex((h) => names.some((n) => n.toLowerCase() === h.toLowerCase())); if (i >= 0) idx[k] = i; }
  const endsNl = txt.endsWith('\n'); const out = [];
  for (let i = 1; i < lines.length; i++) { const l = lines[i]; if (!l.trim()) continue; if (i === lines.length - 1 && !endsNl) break;   /* a torn last line */
    const c = splitCsv(l); if (c.length < head.length - 1) continue; const o = {}; for (const [k, j] of Object.entries(idx)) o[k] = c[j]; out.push(o); }
  return out;
}
export const num = (v) => { if (v == null || v === '') return null; const x = Number(v); return Number.isFinite(x) ? x : null; };

/* -- the operator's admin folder (D:\NIGRAAN\_admin = <app>\..\..\_admin), or NIGRAAN_AGENTS_ADMIN_DIR; '-' switches the line off -- */
export function adminDir(app) { const e = process.env.NIGRAAN_AGENTS_ADMIN_DIR; if (e === '-') return null; return e || join(app, '..', '..', '_admin'); }
export function adminAlert(dir, line) { if (!dir) return false; try { if (!existsSync(dir)) return false; appendFileSync(join(dir, 'alerts.log'), line.replace(/[^\x20-\x7e]/g, '?') + '\r\n'); return true; } catch (_) { return false; } }

/* -- an append-only gzip file read member by member: a damaged member (two writers interleaved, a torn write) is skipped and counted, the
      members after it are still read (Node's gunzip stops at the first bad byte). Members start at the gzip magic 1f 8b 08. -- */
import { gunzipSync } from 'node:zlib';
export function gzMembers(file) {
  let b; try { b = readFileSync(file); } catch (_) { return null; }
  const starts = []; for (let i = b.indexOf(0x1f); i >= 0 && i < b.length - 2; i = b.indexOf(0x1f, i + 1)) if (b[i + 1] === 0x8b && b[i + 2] === 0x08) starts.push(i);
  starts.push(b.length); const texts = [], damaged = []; let s = 0, k = 1;
  if (starts[0] !== 0) { damaged.push({ at: 0, bytes: starts[0] }); s = starts[0]; }
  while (s < b.length) { let done = false;
    for (let j = k; j < starts.length; j++) { const e = starts[j]; if (e <= s) continue; try { texts.push(gunzipSync(b.subarray(s, e)).toString('utf8')); s = e; k = j + 1; done = true; break; } catch (_) {} }
    if (!done) { const nx = starts.find((x) => x > s); damaged.push({ at: s, bytes: (nx ?? b.length) - s }); if (nx == null || nx >= b.length) break; s = nx; k = starts.indexOf(nx) + 1; } }
  return { texts, damaged };
}
