/* == v91.17.283.22 . THE RUN-KEYED CACHES SURVIVE A RESTART: written safely, capped, read defensively ===================================
   Each restart emptied the in-memory caches that are keyed on the provider's model run (the model metadata state, the backend answer cache,
   the proxy's run memo, the tehsil superset rows and, since v283.22, the zone / national pool members and the blend member rows), so the
   first hour after a start fetched everything again. Each part registers here (dump / load); the parts are written gzipped to
   data/cache/runstate/<name>.json.gz and read back at start.
   Writing (v91.17.283.22: the laptop's disk has issued resets; one cache can hold tens of MB):
     - the timed save is asynchronous and off the request path: an array snapshot is serialised in slices of about 8 ms (the event loop
       runs between slices) straight into a gzip stream (compressed in the thread pool, no one large string or buffer) and written with non-blocking file calls;
     - atomic: written to <name>.json.gz.tmp, flushed to the disk (fsync), then renamed over the old file; a torn write leaves the old file;
     - at most once per model run per cache: a part is written again only when its content changed AND the model runs changed since its
       last write, and only after the new runs have settled (settleMin) so the run's fetches are in it; the drain / signal save (the hand-over
       to the next server) always writes, synchronously, with the same atomic steps;
     - size cap: a part whose serialised form exceeds its cap is not written (logged, named in status()); the old file stays;
     - only the current and the previous run are kept (keepRecentRuns, used by the member and blend dumps);
     - cap, runs kept, settle time and the timed save's period are data: data/runstate-config.json (capMB, keepRuns, settleMin,
       saveEveryMin, parts.<name>.capMB).
   Reading:
     - a file older than maxAgeMs (default 6 h, NIGRAAN_RUNSTATE_MAX_H) is not read: the server starts cold for that part;
     - every kept answer is keyed on its run key and its day: an answer of another run or day is never used;
     - a file that does not decompress or parse, has an unknown format, exceeds the cap or whose load throws is moved aside
       (<name>.json.gz.bad, the previous .bad replaced) and named in status(); startup never fails on it; stray .tmp files are removed.
   NIGRAAN_RUNSTATE=0 turns it off (nothing written or read). */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, rmSync, openSync, writeSync, fsyncSync, closeSync } from 'node:fs';
import { join, basename } from 'node:path';
import { gzipSync, gunzipSync, createGzip } from 'node:zlib';
import { open as openP, rename as renameP, mkdir as mkdirP, rm as rmP } from 'node:fs/promises';

export const RUNSTATE_DEFAULTS = Object.freeze({ capMB: 40, keepRuns: 2, settleMin: 10, saveEveryMin: 5, sameRunRewriteMin: 30 });
/* the config file (data/runstate-config.json); a missing or unreadable file gives the defaults (named in status) */
export function loadRunStateConfig(files) {
  const out = { ...RUNSTATE_DEFAULTS, parts: {}, source: 'defaults' };
  for (const f of [].concat(files || [])) {
    try { if (!f || !existsSync(f)) continue; const j = JSON.parse(readFileSync(f, 'utf8'));
      for (const k of ['capMB', 'keepRuns', 'settleMin', 'saveEveryMin', 'sameRunRewriteMin']) if (Number.isFinite(+j[k]) && +j[k] >= 0) out[k] = +j[k];
      if (j.parts && typeof j.parts === 'object') out.parts = j.parts; out.source = basename(f); return out;
    } catch (e) { out.source = 'defaults (' + String((e && e.message) || e).slice(0, 80) + ')'; }
  }
  return out;
}
/* entries [key, at, run, value]: keep the entries of the newest keepRuns runs of their kind (runs ordered by their newest fetch); an entry
   without a run is kept while it is within ttlMs */
export function keepRecentRuns(entries, { keepRuns = RUNSTATE_DEFAULTS.keepRuns, ttlMs = 60 * 60e3, now = Date.now(), kindOf = () => '' } = {}) {
  const runs = {};
  for (const [k, at, run] of entries) if (run != null) { const kd = kindOf(k); const g = runs[kd] || (runs[kd] = new Map()); g.set(run, Math.max(g.get(run) || 0, at || 0)); }
  const keep = {}; for (const [kind, g] of Object.entries(runs)) keep[kind] = new Set([...g.entries()].sort((a, b) => b[1] - a[1]).slice(0, Math.max(1, keepRuns)).map((x) => x[0]));
  return entries.filter(([k, at, run]) => (run != null ? !!(keep[kindOf(k)] && keep[kindOf(k)].has(run)) : now - at <= ttlMs));
}

export function createRunState({ dir, maxAgeMs = (Number(process.env.NIGRAAN_RUNSTATE_MAX_H) || 6) * 3600e3, now = () => Date.now(),
  on = () => process.env.NIGRAAN_RUNSTATE !== '0', config = null, runKey = null, log = () => {} } = {}) {
  const CFG = config && typeof config === 'object' && !Array.isArray(config) ? { ...RUNSTATE_DEFAULTS, parts: {}, source: 'given', ...config } : loadRunStateConfig(config);
  const parts = new Map();   /* name -> { dump, load, sig, run, lastSig, savedRun, seen, savedAt, gen } */
  /* v91.17.283.24 · self-audit P6 · ONE WRITER PER FILE. The drain save and the timed save both wrote <name>.json.gz.tmp: a drain save that
     ran while the timed save was writing truncated the same temp file and the two buffers interleaved (a torn gzip renamed over the good
     file). Each write now has its own temp file (<name>.json.gz.<pid>.<n>.tmp) renamed atomically, and a part's generation is raised by
     every sync save: a timed save that started before it drops its temp file instead of renaming an older content over the newer one. */
  let SEQ = 0; const tmpOf = (f) => f + '.' + process.pid + '.' + (++SEQ) + '.tmp';
  const st = { loaded: {}, saved: {}, skipped: {}, errors: {}, capped: {}, movedAside: {}, held: {} };
  const file = (name) => join(dir, name + '.json.gz');
  const capOf = (name) => { const p = CFG.parts && CFG.parts[name]; const mb = p && Number.isFinite(+p.capMB) ? +p.capMB : CFG.capMB; return Math.round(mb * 1048576); };
  const iso = (t) => new Date(t).toISOString();
  function register(name, { dump, load, sig = null, run = null }) { parts.set(name, { dump, load, sig, run, lastSig: null, savedRun: null, seen: null, savedAt: 0, gen: 0 }); }
  function runOf(P) { try { const r = (P.run || runKey); return r ? r() : null; } catch (_) { return null; } }
  function moveAside(name, why) {
    const f = file(name);
    try { rmSync(f + '.bad', { force: true }); renameSync(f, f + '.bad'); st.movedAside[name] = { at: iso(now()), why }; }
    catch (_) { try { rmSync(f, { force: true }); st.movedAside[name] = { at: iso(now()), why: why + ' (deleted)' }; } catch (_) {} }
    log('runstate: ' + name + ' file set aside: ' + why);
  }
  function loadOne(name) {
    const P = parts.get(name); if (!P || !on()) return null; const f = file(name);
    try { rmSync(f + '.tmp', { force: true }); const b = basename(f) + '.'; for (const x of readdirSync(dir)) if (x.startsWith(b) && x.endsWith('.tmp') && now() - statSync(join(dir, x)).mtimeMs > 10 * 60e3) rmSync(join(dir, x), { force: true }); } catch (_) {}   /* stray temp files of any writer (older than 10 min: never a sibling's write in progress) */
    let o;
    try {
      if (!existsSync(f)) { st.skipped[name] = 'no file'; return null; }
      const s = statSync(f), age = now() - s.mtimeMs;
      if (age > maxAgeMs) { st.skipped[name] = 'file ' + Math.round(age / 60e3) + ' min old (max ' + Math.round(maxAgeMs / 60e3) + ')'; return null; }
      if (s.size > capOf(name)) { st.errors[name] = 'file ' + s.size + ' bytes over the cap ' + capOf(name); moveAside(name, 'over the cap'); return null; }
      const raw = gunzipSync(readFileSync(f), { maxOutputLength: Math.max(capOf(name) * 2, 1048576) });
      o = JSON.parse(raw.toString('utf8'));
    } catch (e) { st.errors[name] = 'unreadable: ' + String((e && e.message) || e).slice(0, 160); moveAside(name, 'unreadable'); return null; }
    if (!o || o.v !== 1 || !Number.isFinite(o.savedAt)) { st.errors[name] = 'unknown format'; moveAside(name, 'unknown format'); return null; }
    if (now() - o.savedAt > maxAgeMs) { st.skipped[name] = 'stale'; return null; }
    try { const r = P.load(o.data); st.loaded[name] = { at: iso(now()), savedAt: iso(o.savedAt), result: r ?? null }; P.savedRun = o.run ?? null; P.savedAt = Number.isFinite(+o.savedAt) ? +o.savedAt : 0; return r; }
    catch (e) { st.errors[name] = 'load failed: ' + String((e && e.message) || e).slice(0, 160); moveAside(name, 'load failed'); return null; }
  }
  function loadAll() { const out = {}; for (const n of parts.keys()) { try { out[n] = loadOne(n); } catch (_) { out[n] = null; } } return out; }
  const head = (rk) => '{"v":1,"savedAt":' + now() + ',"run":' + JSON.stringify(rk ?? null) + ',"data":';
  /* the drain / signal save: synchronous (it must finish before the process ends), atomic, capped */
  function saveOne(name, force = false) {
    const P = parts.get(name); if (!P || !on()) return false;
    try {
      const s = P.sig ? P.sig() : null; if (!force && s != null && s === P.lastSig) return false;
      const rk = runOf(P), t0 = Date.now(); const json = head(rk) + JSON.stringify(P.dump() ?? null) + '}';
      if (json.length > capOf(name)) { st.capped[name] = { at: iso(now()), chars: json.length, cap: capOf(name) }; log('runstate: ' + name + ' not written: ' + json.length + ' chars over the cap ' + capOf(name)); return false; }
      const t1 = Date.now(); const buf = gzipSync(Buffer.from(json), { level: 4 }); const t2 = Date.now();
      mkdirSync(dir, { recursive: true }); const f = file(name), tmp = tmpOf(f); P.gen++; const fd = openSync(tmp, 'w');
      try { writeSync(fd, buf); fsyncSync(fd); } finally { closeSync(fd); } renameSync(tmp, f);
      P.lastSig = s; P.savedRun = rk; P.savedAt = now(); st.saved[name] = { at: iso(now()), mode: 'sync', rawBytes: json.length, bytes: buf.length, serialiseMs: t1 - t0, gzipMs: t2 - t1, writeMs: Date.now() - t2 };
      log('runstate: ' + name + ' written ' + JSON.stringify(st.saved[name])); return true;
    } catch (e) { st.errors[name] = String((e && e.message) || e).slice(0, 200); return false; }
  }
  function saveAll(force = false) { let n = 0; for (const k of parts.keys()) if (saveOne(k, force)) n++; return n; }
  /* the timed save: serialised in slices (an array snapshot: about 8 ms a slice, the event loop runs between them), gzip in the thread pool,
     non-blocking write + fsync + rename; once per model run per part, after the run settled */
  const tick = () => new Promise((r) => setImmediate(r));
  const SLICE_MS = 8;   /* the longest the serialiser holds the event loop before it lets requests run */
  /* serialise into a gzip stream slice by slice (no one large string or buffer is built on the event loop; compression runs in the
     thread pool); stops as soon as the serialised form passes the cap */
  async function serialiseGz(name, data, rk) {
    const cap = capOf(name), z = createGzip({ level: 4 }), chunks = [];
    z.on('data', (c) => chunks.push(c)); const ended = new Promise((res, rej) => { z.on('end', res); z.on('error', rej); });
    let len = 0, maxSlice = 0, total = 0; const put = (s) => { len += s.length; return z.write(s); };
    const drain = () => new Promise((r) => z.once('drain', r));
    const t0 = Date.now(); put(head(rk));
    if (!Array.isArray(data)) { const t = Date.now(); put(JSON.stringify(data ?? null)); maxSlice = total = Date.now() - t; }
    else { put('[');
      let j = 0; while (j < data.length) { const t = Date.now(), sl = [];
        do { sl.push((j ? ',' : '') + JSON.stringify(data[j])); j++; } while (j < data.length && Date.now() - t < SLICE_MS);
        const more = put(sl.join('')); const d = Date.now() - t; total += d; if (d > maxSlice) maxSlice = d;
        if (len > cap) { z.destroy(); return { over: true, len, maxSlice, total }; }
        if (!more) await drain(); else await tick(); }
      put(']'); }
    put('}'); if (len > cap) { z.destroy(); return { over: true, len, maxSlice, total }; }
    z.end(); await ended; return { over: false, len, maxSlice, total, wallMs: Date.now() - t0, buf: Buffer.concat(chunks) };
  }
  let busy = false;
  async function saveAllAsync({ force = false } = {}) { if (busy) return 0; busy = true; let n = 0;
    try { for (const name of parts.keys()) { const P = parts.get(name); if (!P || !on()) continue;
        try { const s = P.sig ? P.sig() : null; if (!force && s != null && s === P.lastSig) continue;
          const rk = runOf(P);
          if (!force && rk != null) {
            /* v91.17.283.24 · P12 · a part whose content changed again within the same model run is written again, at most once every
               sameRunRewriteMin (data/runstate-config.json), so the fetches made after the first write of the run survive a restart */
            if (P.savedRun != null && rk === P.savedRun && now() - P.savedAt < CFG.sameRunRewriteMin * 60e3) { st.held[name] = 'written for this model run ' + Math.round((now() - P.savedAt) / 60e3) + ' min ago'; continue; }
            if (!P.seen || P.seen.run !== rk) P.seen = { run: rk, at: now() };
            if (rk !== P.savedRun && now() - P.seen.at < CFG.settleMin * 60e3) { st.held[name] = 'model run settling'; continue; } }
          delete st.held[name];
          const gen0 = P.gen; const S = await serialiseGz(name, P.dump(), rk);
          if (S.over) { st.capped[name] = { at: iso(now()), chars: S.len, cap: capOf(name) }; P.lastSig = s; P.savedRun = rk; log('runstate: ' + name + ' not written: over ' + S.len + ' chars, cap ' + capOf(name)); continue; }
          const buf = S.buf, t2 = Date.now();
          await mkdirP(dir, { recursive: true }); const f = file(name), tmp = tmpOf(f); const fh = await openP(tmp, 'w');
          try { await fh.writeFile(buf); await fh.sync(); } finally { await fh.close(); }
          if (P.gen !== gen0) { await rmP(tmp, { force: true }); st.held[name] = 'a newer save (drain) wrote this part meanwhile'; continue; }   /* P6 · one writer: never an older content over a newer one */
          await renameP(tmp, f); P.gen++;
          P.lastSig = s; P.savedRun = rk; P.savedAt = now(); delete st.capped[name];
          st.saved[name] = { at: iso(now()), mode: 'async', rawBytes: S.len, bytes: buf.length, serialiseMs: S.total, longestSliceMs: S.maxSlice, serialiseGzipWallMs: S.wallMs, writeMs: Date.now() - t2 }; n++;
          log('runstate: ' + name + ' written ' + JSON.stringify(st.saved[name]));
        } catch (e) { st.errors[name] = String((e && e.message) || e).slice(0, 200); } } }
    finally { busy = false; } return n; }
  let timer = null;
  function start(periodMs = CFG.saveEveryMin * 60e3) { if (timer || !on()) return; timer = setInterval(() => { saveAllAsync().catch(() => {}); }, periodMs); if (timer.unref) timer.unref(); }
  function stop() { if (timer) clearInterval(timer); timer = null; }
  function clear() { for (const k of parts.keys()) try { rmSync(file(k), { force: true }); } catch (_) {} }
  const status = () => ({ on: on(), dir: 'data/cache/runstate', maxAgeH: maxAgeMs / 3600e3, config: { capMB: CFG.capMB, keepRuns: CFG.keepRuns, settleMin: CFG.settleMin, saveEveryMin: CFG.saveEveryMin, sameRunRewriteMin: CFG.sameRunRewriteMin, parts: CFG.parts, source: CFG.source }, parts: [...parts.keys()], ...st });
  /* v91.17.283.24 · P12 · a part's cap in serialised characters, so a dump can hold itself under it (newest entries first) instead of being refused whole */
  return { register, loadAll, loadOne, saveAll, saveAllAsync, saveOne, start, stop, clear, status, capChars: (name) => capOf(name), keepRuns: () => CFG.keepRuns, saveEveryMs: () => Math.max(1, CFG.saveEveryMin) * 60e3 };
}
