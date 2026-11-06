/* v91.17.104 · WHAT THE MAP SHOWED, KEPT AND SCORED.
   The page re-derives every layer for every tehsil each hour (build/selfcheck_ui.html) and posts:
     POST /api/shown/report      the levels shown per layer, keyed by tehsil uid, with the day basis, gate version and build
                                 -> data/archive/shown/shown_YYYY-MM.jsonl.gz (append-only gzip members, never pruned)
     POST /api/selfcheck/report  the invariant results -> data/selfcheck-latest.json + data/archive/selfcheck/selfcheck_YYYY-MM.jsonl.gz
   Operator reads:
     GET /api/ops/selfcheck      the latest self-check
     GET /api/ops/shown/score    the shown levels scored against what happened:
        rain  the rain layer's morning level for day 0 vs the satellite day total (data/archive/imerg): how often each level
              was followed by >= 10 mm and >= 25 mm, and POD / FAR for Low+ vs >= 10 mm and Moderate+ vs >= 25 mm
        heat  the heat layer's morning level vs the AGN level of the UTCI measured at MACH stations (data/archive/fleet: the day's
              highest shade UTCI from screened readings 09:00-18:00 PKT), exact / within one level, and the mean difference
   One record per (hour, day, basis): a second post in the same hour is ignored. Posts are accepted from this computer only. */
import { appendGzMember, gunzipMembers } from './gzsafe.mjs';   /* v91.17.283.8 · planned C */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { readFile, open as fsOpen } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';   /* v91.17.283 · WS4 · build identity */
import { gzipSync, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
const gunzipP = promisify(gunzip);
import { utci as utciF, utciAgnScore } from './utci.mjs';

import { pktDay } from './pktday.mjs';
import { levelOfScreeningScore } from './scalecuts.mjs';
const pktHour = (ms) => new Date(ms + 5 * 3600e3).getUTCHours();
const bandOf = (s) => levelOfScreeningScore(s);   /* v283.24 H17: data/hazard-scale.json screeningCuts (scalecuts.mjs) */

/* v91.17.236 · the laptop profile (10 Oct): one GET /api/ops/shown/score held the server for 12.5 s, reading and unzipping every month
   of the shown archive on the main thread, and the operator card asks for it every time it redraws. Now each archive file is read
   once and then only its new end (the files only grow by whole gzip members), unzipped off the main thread, and the lines are
   parsed a few thousand at a time with a turn for other requests between. A file that shrank or whose new end does not unzip is
   read again whole. fold(state, record) receives the records in file order, so every total is the one the full read gave. */
const yieldTurn = () => new Promise((r) => setImmediate(r));
async function parseLines(buf, fold, st) {
  const t = buf.toString('utf8'); let i = 0, k = 0, t0 = performance.now();
  while (i < t.length) { let j = t.indexOf('\n', i); if (j < 0) j = t.length; const l = t.slice(i, j); i = j + 1;
    if (l) { let r = null; try { r = JSON.parse(l); } catch (_) { r = null; } if (r) fold(st, r); }
    /* v91.17.283.51 · B1: a turn for other requests every 2000 lines OR every 20 ms (long lines held the loop 0.4-1.9 s per 2000) */
    if (++k % 2000 === 0 || (k % 50 === 0 && performance.now() - t0 > 20)) { await yieldTurn(); t0 = performance.now(); } }
}
async function readTail(f, from) { const h = await fsOpen(f, 'r'); try { const { size } = await h.stat(); const b = Buffer.alloc(Math.max(0, size - from)); if (b.length) await h.read(b, 0, b.length, from); return { b, size }; } finally { await h.close(); } }
/* v91.17.283.8 · planned C · damaged gzip members found by the server readers, by file (logged once per read; the agents report theirs in the verification ledger) */
export const DAMAGED_GZ = new Map();
export function gzCache(init, fold) {   /* v91.17.266 · also read by past30.mjs */
  const C = new Map();   /* file -> { size, mtime, st } */
  return async function (f) {
    let s; try { s = statSync(f); } catch (_) { C.delete(f); return init(); }
    const c = C.get(f);
    if (c && c.size === s.size && c.mtime === s.mtimeMs) return c.st;
    if (c && s.size > c.size) {
      try { const { b, size } = await readTail(f, c.size); const raw = await gunzipP(b); const st = c.st; await parseLines(raw, fold, st); C.set(f, { size, mtime: s.mtimeMs, st }); return st; }
      catch (_) { /* read whole below */ }
    }
    let st = init();
    let buf = null;
    try { buf = await readFile(f); const raw = await gunzipP(buf); await parseLines(raw, fold, st); C.set(f, { size: buf.length, mtime: s.mtimeMs, st }); }
    catch (_) {
      /* v91.17.283.8 · planned C · a damaged member no longer loses the whole month: read member by member, skip and report the damaged ones */
      st = init();
      try { if (!buf) throw new Error('unreadable'); const M = gunzipMembers(buf); await parseLines(Buffer.from(M.texts.join('')), fold, st);
        if (M.damaged.length) { DAMAGED_GZ.set(f, M.damaged); try { console.error('  archive: ' + f.split(/[\\/]/).slice(-2).join('/') + ': ' + M.damaged.length + ' damaged gzip member(s) skipped (' + M.damaged.map((d) => 'byte ' + d.at + ', ' + d.bytes + ' B').join('; ') + ')'); } catch (_) {} }
        C.set(f, { size: buf.length, mtime: s.mtimeMs, st }); }
      catch (_) { st = init(); C.delete(f); } }
    return st;
  };
}

/* v91.17.283 · WS4 · the build identity of THIS server: package.json "version" (the install root) and the gate version it serves */
const PKG = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
export function buildIdentity(app) {
  let build = null, gate = null;
  try { build = JSON.parse(readFileSync(PKG, 'utf8')).version || null; } catch (_) { build = null; }
  try { gate = app && app.gate && app.gate.version ? app.gate.version() : null; } catch (_) { gate = null; }
  return { build, gate };
}
export function createShown(app, dataDir) {
  const dir = join(dataDir, 'archive', 'shown'), scDir = join(dataDir, 'archive', 'selfcheck');
  for (const d of [dir, scDir]) mkdirSync(d, { recursive: true });
  const seen = new Set(); let latest = null;
  try { latest = JSON.parse(readFileSync(join(dataDir, 'selfcheck-latest.json'), 'utf8')); } catch (_) { latest = null; }

  function reportShown(b) {
    if (!b || typeof b !== 'object' || !b.layers || typeof b.layers !== 'object') return { ok: false, error: 'bad_body' };
    const at = Date.parse(b.at) || Date.now(), key = new Date(at).toISOString().slice(0, 13) + '|' + (b.day || 0) + '|' + (b.basis || '');
    if (seen.has(key)) return { ok: true, skipped: 'already recorded this hour' };
    seen.add(key); if (seen.size > 500) seen.clear();
    const id = buildIdentity(app);   /* v91.17.283 · WS4 · the server's build identity, the page's stamps beside it */
    const rec = { at: new Date(at).toISOString(), d: pktDay(at), h: pktHour(at), day: b.day || 0, basis: b.basis || null, gate: id.gate || b.gate || null, build: id.build || b.build || null, pageBuild: b.build || null, pageGate: b.gate || null, layers: {} };
    for (const [k, v] of Object.entries(b.layers)) { if (!v || typeof v !== 'object') continue; rec.layers[k] = { c: v.counts, na: v.na, nd: v.nd, st: v.status || null, L: v.L || {} }; }
    appendGzMember(join(dir, 'shown_' + rec.d.slice(0, 7) + '.jsonl.gz'), gzipSync(Buffer.from(JSON.stringify(rec) + '\n')));
    return { ok: true, recorded: key };
  }
  function reportSelfcheck(b) {
    if (!b || !Array.isArray(b.checks)) return { ok: false, error: 'bad_body' };
    /* v91.17.283 · WS4 · the record carries the SERVER's build identity (package.json version, the gate version the server serves); the
       page's own stamps are kept as pageBuild / pageGate, and a mismatch is flagged rather than recorded as the build (the live record said
       91.17.280 / gate-91.17.279 while 91.17.282.1 was deployed: the page stamp of an older build) */
    const id = buildIdentity(app);
    latest = { ...b, build: id.build, gate: id.gate, pageBuild: b.build || null, pageGate: b.gate || null,
      stampMismatch: (b.build && id.build && b.build !== id.build) || (b.gate && id.gate && b.gate !== id.gate) ? true : false, received: new Date().toISOString() };
    writeFileSync(join(dataDir, 'selfcheck-latest.json'), JSON.stringify(latest));
    appendGzMember(join(scDir, 'selfcheck_' + pktDay(Date.now()).slice(0, 7) + '.jsonl.gz'), gzipSync(Buffer.from(JSON.stringify(latest) + '\n')));
    return { ok: true };
  }
  /* the morning record of each Pakistan day (first at or after 06:00 PKT, else the earliest), day 0 */
  /* v236 · per file, the morning pick of each day (same rule, records in order; the first of equal scores is kept); across files the
     same rule in file order, so the result is the full read's */
  const mScore = (x) => (x.h >= 6 ? 0 : 100) + (x.h >= 6 ? x.h : 24 - x.h);
  const pick = (by, r) => { if (r.day !== 0) return; const cur = by.get(r.d); if (!cur || mScore(r) < mScore(cur)) by.set(r.d, r); };
  const shownFile = gzCache(() => new Map(), pick);
  const listFile = gzCache(() => [], (a, r) => { a.push(r); });
  async function morningRecords() {
    const by = new Map();
    let files = []; try { files = readdirSync(dir).filter(f => /^shown_\d{4}-\d{2}\.jsonl\.gz$/.test(f)).sort(); } catch (_) {}
    for (const f of files) for (const r of (await shownFile(join(dir, f))).values()) pick(by, r);
    return by;
  }
  let inflight = null;
  function score() { if (!inflight) inflight = scoreNow().finally(() => { inflight = null; }); return inflight; }   /* v236 · callers at the same time share one run */
  async function scoreNow() {
    const M = await morningRecords(), out = { archive: M.size + ' days of shown levels (morning record, day 0)', rain: null, heat: null };
    /* rain vs satellite */
    try {
      const im = new Map(); const idir = join(dataDir, 'archive', 'imerg');
      for (const f of (existsSync(idir) ? readdirSync(idir) : []).filter(f => f.endsWith('.jsonl.gz'))) for (const r of await listFile(join(idir, f))) im.set(r.d, r.u || {});
      const byLv = [0, 1, 2, 3, 4].map(() => ({ n: 0, ge10: 0, ge25: 0 })); let days = 0, a10 = 0, b10 = 0, c10 = 0, a25 = 0, b25 = 0, c25 = 0, n = 0;
      for (const [d, r] of M) { const L = r.layers && r.layers.rain_hz && r.layers.rain_hz.L, U = im.get(d); if (!L || !U) continue; days++;
        for (const [uid, lv] of Object.entries(L)) { if (lv == null || lv < 0 || U[uid] == null) continue; const mm = U[uid] / 10; n++; const g = byLv[lv]; g.n++; if (mm >= 10) g.ge10++; if (mm >= 25) g.ge25++;
          const f10 = lv >= 1, o10 = mm >= 10, f25 = lv >= 2, o25 = mm >= 25;
          if (f10 && o10) a10++; else if (f10) b10++; else if (o10) c10++;
          if (f25 && o25) a25++; else if (f25) b25++; else if (o25) c25++; } }
      if (!days) out.rain = { why: 'no day yet has both a morning rain layer and a satellite day total (the satellite total arrives about a day later)' };
      else { const r3 = (x) => x == null || !isFinite(x) ? null : Math.round(x * 1000) / 1000;
        out.rain = { days, n, byLevel: byLv.map((g, i) => ({ level: i, n: g.n, ge10: g.n ? r3(g.ge10 / g.n) : null, ge25: g.n ? r3(g.ge25 / g.n) : null })),
          low10: { pod: r3(a10 / (a10 + c10)), far: r3(b10 / (a10 + b10)), hits: a10, misses: c10, falseAlarms: b10 },
          mod25: { pod: r3(a25 / (a25 + c25)), far: r3(b25 / (a25 + b25)), hits: a25, misses: c25, falseAlarms: b25 } };
        out.rain.text = 'Low or higher before a 10 mm day: found ' + (out.rain.low10.pod ?? '–') + ', false alarms ' + (out.rain.low10.far ?? '–') + '; Moderate or higher before 25 mm: found ' + (out.rain.mod25.pod ?? '–') + ', false alarms ' + (out.rain.mod25.far ?? '–'); }
    } catch (e) { out.rain = { why: 'rain scoring failed: ' + e.message }; }
    /* heat vs MACH stations */
    try {
      const T = (app.units && app.units.tehsil) || []; const near = (lat, lon) => { let b = null, bd = 1e9; for (const u of T) { if (u.lat == null) continue; const d = (u.lat - lat) ** 2 + ((u.lon - lon) * Math.cos(lat * Math.PI / 180)) ** 2; if (d < bd) { bd = d; b = u; } } return b; };
      const fdir = join(dataDir, 'archive', 'fleet'); let n = 0, exact = 0, within = 0, diff = 0;
      for (const f of (existsSync(fdir) ? readdirSync(fdir) : []).filter(f => f.endsWith('.jsonl.gz'))) for (const r of await listFile(join(fdir, f))) {
        const S = M.get(r.d); const L = S && S.layers && S.layers.heat && S.layers.heat.L; if (!L) continue;
        let best = null; for (let i = 0; i < (r.t || []).length; i++) { if (!(r.ok && r.ok[i] === 1) || r.t[i] < 540 || r.t[i] > 1080 || r.T[i] == null || r.RH[i] == null) continue;
          const u = utciF(r.T[i] / 10, r.T[i] / 10, r.W && r.W[i] != null ? Math.max(0.5, r.W[i] / 3.6) : 0.5, r.RH[i]); if (u != null && (best == null || u > best)) best = u; }
        if (best == null) continue; const unit = near(r.lat, r.lon); if (!unit) continue; const sh = L[unit.unitId]; if (sh == null || sh < 0) continue;
        const ob = bandOf(utciAgnScore(best)); n++; if (sh === ob) exact++; if (Math.abs(sh - ob) <= 1) within++; diff += sh - ob; }
      out.heat = n ? { n, exact: Math.round(1000 * exact / n) / 1000, withinOne: Math.round(1000 * within / n) / 1000, meanShownMinusObserved: Math.round(100 * diff / n) / 100 } : { why: 'no station-day yet with both a morning heat layer and screened MACH readings 09:00-18:00 PKT' };
      if (n) out.heat.text = 'same level ' + Math.round(100 * out.heat.exact) + ' %, within one level ' + Math.round(100 * out.heat.withinOne) + ' %, shown minus measured ' + out.heat.meanShownMinusObserved + ' levels on average';
    } catch (e) { out.heat = { why: 'heat scoring failed: ' + e.message }; }
    return out;
  }
  /* a record written before v91.17.283 carries the page's stamp as its build: the server's identity is shown beside it, and a mismatch flagged */
  const latestOut = () => { if (!latest) return latest; const id = buildIdentity(app); return { ...latest, serverBuild: id.build, serverGate: id.gate,
    stampMismatch: latest.stampMismatch != null && latest.pageBuild !== undefined ? latest.stampMismatch : ((latest.build && id.build && latest.build !== id.build) || (latest.gate && id.gate && latest.gate !== id.gate) ? true : false) }; };
  return { reportShown, reportSelfcheck, latest: latestOut, score, dir, buildIdentity: () => buildIdentity(app) };
}
