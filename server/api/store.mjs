/* Durable local store. One JSON document per collection set, written atomically
   (write temp -> fsync -> rename) through a serial queue so two requests can never
   interleave a write. Development-grade by design: security.posture reports it as a
   production blocker and database-migrations/plan emits the PostgreSQL target. */
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, openSync, fsyncSync, closeSync, copyFileSync, statSync, readdirSync, unlinkSync, readSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { uptime } from 'node:os';
import { promises as fsp } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';

/* ══ v91.17.283 · WS3 · ATOMIC FILE WRITES FOR EVERY STATE / CACHE FILE ════════════════════════════════════════════════════════════
   writeFileAtomicSync(f, data): a temp file next to the target (unique per process), written, fsynced, closed, renamed over the target,
   then the folder fsynced where the platform allows it (POSIX; Windows refuses to open a folder and the rename is already durable
   there). A crash leaves the old file or the new file, never half of one. A target held by another program (Windows: antivirus) is
   retried a few times; the error is thrown after that so the caller sees it. writeJsonAtomicSync(f, obj) is the JSON form. */
const sleepSync = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(0, ms)); } catch (_) {} };
export function fsyncDir(d) { try { const fd = openSync(d, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } } catch (_) {} }
export function writeFileAtomicSync(f, data) {
  const t = join(dirname(f), '.' + basename(f) + '.' + process.pid + '.' + (++ATOMIC_SEQ) + '.tmp');
  const fd = openSync(t, 'w');
  try { writeFileSync(fd, data); fsyncSync(fd); } catch (e) { try { closeSync(fd); } catch (_) {} try { unlinkSync(t); } catch (_) {} throw e; }
  closeSync(fd);
  let last = null;
  for (let i = 0; i < 8; i++) { try { renameSync(t, f); fsyncDir(dirname(f)); return; } catch (e) { last = e; sleepSync(25 * (i + 1)); } }
  try { unlinkSync(t); } catch (_) {}
  throw last;
}
let ATOMIC_SEQ = 0;
export const writeJsonAtomicSync = (f, o, space) => writeFileAtomicSync(f, JSON.stringify(o, null, space));
/* append one line to a journal (jsonl): a torn last line (a crash in the middle of an append) is closed with a newline first, so the
   new line is never glued onto it and lost with it; the descriptor is fsynced before it is closed */
export function appendLineSync(f, line) {
  let needNl = false;
  try { const st = statSync(f); if (st.size > 0) { const fd0 = openSync(f, 'r'); try { const b = Buffer.alloc(1); readSync(fd0, b, 0, 1, st.size - 1); needNl = b[0] !== 10; } finally { closeSync(fd0); } } } catch (_) {}
  const fd = openSync(f, 'a'); try { writeFileSync(fd, (needNl ? '\n' : '') + line + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
}

/* ══ v91.17.283 · WS3 · ONE SET OF PROCESS HOOKS FOR EVERY STORE: THE LAST WRITE ON EXIT AND ON A STOP SIGNAL ══════════════════════
   Every live store is in LIVE. On 'exit' (any process.exit, including the one server.mjs makes after a signal) each writer store whose
   memory holds changes not yet on disk writes them synchronously (bounded by NIGRAAN_STORE_SHUTDOWN_MS, default 10 s). On SIGINT,
   SIGTERM, SIGHUP and SIGBREAK the same final write is made first; when no other listener handles the signal (a script that opened a
   store), the process then exits as the signal would have ended it. */
const LIVE = new Set();
let HOOKED = false;
function hookProcess() {
  if (HOOKED) return; HOOKED = true;
  process.on('exit', () => { for (const s of LIVE) { try { s._exitFlush(); } catch (_) {} } });
  const SIG = { SIGINT: 2, SIGTERM: 15, SIGHUP: 1, SIGBREAK: 21 };
  for (const sig of Object.keys(SIG)) {
    if (sig === 'SIGBREAK' && process.platform !== 'win32') continue;
    try { process.on(sig, function storeOnSignal() { for (const s of LIVE) { try { s._exitFlush(); } catch (_) {} }
      if (process.listenerCount(sig) <= 1) process.exit(128 + SIG[sig]); }); } catch (_) {}
  }
}

export const COLLECTIONS = [
  'runs', 'records', 'jobs', 'schedules', 'workers', 'workerEvents', 'alerts', 'quotaWindows', 'quotaResets',
  'evaluations', 'promotions', 'actions', 'outcomes', 'assessments', 'verificationRuns', 'skill', 'experiments',
  'audit', 'accessDecisions', 'migrationPlans', 'acceptanceRuns', 'backups', 'restoreTests', 'failoverTests',
  'signoffs', 'goNoGo', 'attestations', 'dossiers', 'releaseDecisions', 'idempotency', 'explanations', 'urbanHeat', 'unitSkill', 'verificationSummaries', 'aiCalls', 'biasCorrections', 'forecastLog', 'crossingLedger',
  /* v91.17.66 · the casebook */ 'projects', 'assetFields', 'interventions', 'caseSnapshots'
];

export function createStore(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, 'nigraan-db.json');
  let db = { schemaVersion: 1, createdAt: new Date().toISOString(), collections: {} };
  /* v91.17.126 · external audit A22 · FAIL CLOSED. An unreadable database used to be copied aside and the server carried on with EMPTY
     collections, which the next save then wrote over the original name. Now: the bad file is kept, the previous good copy
     (nigraan-db.json.prev, kept by every successful save) or the newest readable backup is loaded instead, and if none can be read the
     store opens READ-ONLY (writes refused, nothing overwritten) and says so on /health. */
  let readOnly = null, recoveredFrom = null;
  const tryLoad = (f) => { try { const j = JSON.parse(readFileSync(f, 'utf8')); return (j && j.collections) ? j : null; } catch (_) { return null; } };
  /* ══ v91.17.283 · WS3 · RECOVERY ORDER: THE NEWEST GOOD SNAPSHOT, THEN THE JOURNAL ══════════════════════════════════════════════
     A write leaves at most four copies: the database, its .prev (the previous good one), and the two temp files (.tmp from the
     synchronous write, .tmpa from the background one). A crash after the temp file was fsynced and before the rename leaves the NEWEST
     complete copy in a temp file, and the database was missing or older. Every write now stamps saveSeq (one higher each time); the
     highest readable copy is loaded (on a tie, or for files written before v283 without saveSeq: the database, then .prev, then the temp
     files). Only when none of the four reads: the backups and the nightly copies, newest first. Then the journal: the run-record files
     (data/records/run_*.json, written before the database points at them) that the snapshot does not hold are replayed (below). */
  const seqOf = (j) => (j && Number.isFinite(Number(j.saveSeq))) ? Number(j.saveSeq) : -1;
  const LOCAL = [file, file + '.prev', file + '.tmp', file + '.tmpa'];
  const local = LOCAL.map((f, i) => ({ f, i, exists: existsSync(f), j: existsSync(f) ? tryLoad(f) : null }));
  const goodLocal = local.filter((x) => x.j).sort((a, b) => seqOf(b.j) - seqOf(a.j) || a.i - b.i);
  const recovery = { candidates: local.map((x) => ({ file: basename(x.f), exists: x.exists, readable: !!x.j, saveSeq: x.j ? seqOf(x.j) : null })), loaded: null };
  if (local[0].exists && !local[0].j) { const bad = file + '.corrupt-' + Date.now(); try { copyFileSync(file, bad); } catch (_) {} console.error('  store: unreadable database kept as ' + bad); recovery.corruptCopy = bad; }
  if (goodLocal.length) {
    db = goodLocal[0].j; recovery.loaded = basename(goodLocal[0].f);
    if (goodLocal[0].f !== file) { recoveredFrom = goodLocal[0].f; console.error('  store: loaded ' + recoveredFrom + ' (saveSeq ' + seqOf(db) + '): the newest complete copy; ' + (local[0].exists ? (local[0].j ? 'the database held saveSeq ' + seqOf(local[0].j) : 'the database was unreadable') : 'the database was missing (interrupted swap)')); }
  } else if (local.some((x) => x.exists)) {
    const cands = [];
    try { const bd = join(dataDir, 'backups'); for (const n of readdirSync(bd).filter(n => /^bak_.*\.json$/.test(n)).map(n => ({ n, t: statSync(join(bd, n)).mtimeMs })).sort((a, b) => b.t - a.t)) cands.push(join(bd, n.n)); } catch (_) {}
    /* v91.17.279 · OPS-01 · the nightly copies (ops.mjs backup(): data/nightly/YYYY-MM-DD/nigraan-db.json), newest day first */
    try { const nd = join(dataDir, 'nightly'); for (const d of readdirSync(nd).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort().reverse()) cands.push(join(nd, d, 'nigraan-db.json')); } catch (_) {}
    for (const c of cands) { if (!existsSync(c)) continue; const k = tryLoad(c); if (k) { db = k; recoveredFrom = c; recovery.loaded = c; break; } }
    if (recoveredFrom) console.error('  store: recovered from ' + recoveredFrom + ' (records after that copy are in ' + (recovery.corruptCopy || 'the unreadable files') + ')');
    else { readOnly = 'the database could not be read and no readable copy was found; writes are refused so nothing is overwritten (' + (recovery.corruptCopy || file) + ')'; console.error('  store: READ-ONLY: ' + readOnly); }
  }
  /* v91.17.126 · system audit S-09 · ONE WRITER PER DATA FOLDER. Servers on other ports were writing the same nigraan-db.json and
     quota counters, so updates were lost. A lock file names the writing process; a second live process opens read-only. */
  const lockFile = join(dataDir, '.store.lock');
  const myPort = Number(process.env.PORT || 8787);
  /* v91.17.269 · INFRA A6 · HAND-OVER INSTEAD OF READ-ONLY FOR GOOD. A zero-downtime deploy (scripts/wd/supervisor.mjs) starts the new
     server on the free port while the old one still writes. The new one used to open read-only for its whole life. Now it opens in
     STANDBY: it serves reads, its durable writes wait for the hand-over (NIGRAAN_STANDBY_WAIT_MS, default 30 s), and it watches the
     lock. When the old process releases the lock (release(): last full write, lock removed) or dies, the standby re-reads the database
     and the run files from disk, adds the quota counts it made meanwhile (quotaWindows, by delta from what it loaded), takes the lock
     and becomes the writer. Read-only for a corrupt database (A22) is unchanged and never ends by itself. */
  let standby = null, lockBeat = null, S0q = null;
  const promotedCbs = [], writableWaiters = [];
  /* ══ v91.17.279 · OPS-04 · AN EXCLUSIVE WRITER LOCK ══════════════════════════════════════════════════════════════════════════════
     The lock was read-then-written in place every 30 s: a reader could catch it half-written (unreadable), and the standby took an
     unreadable lock for "released" and promoted while the writer still wrote; two processes starting together could both take it; a
     writer whose heartbeat was 90 s old was judged gone while its process still ran. Now:
       - the lock is created with O_EXCL ('wx'): of two processes only one creates it; the heartbeat is written to a temp file and
         renamed over it (a reader sees the old or the new text, never half);
       - an unreadable lock is HELD (retried), never "released"; only a missing lock is free;
       - a holder is gone only when its process is dead, or when the lock was last written before this computer started (a reboot: the
         pid may now belong to another program). A slow heartbeat or the same port no longer counts;
       - a stale lock is taken over by renaming it aside (only one process can rename it) and then creating a new one with O_EXCL;
       - the writer checks that the lock still names it before every save and before every heartbeat; if another process holds it,
         this one stops writing (read-only) instead of overwriting that process's database. */
  const BOOT_MS = () => Date.now() - uptime() * 1000;
  const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
  const lockOwnerGone = (o, mtimeMs) => { if (!o || !o.pid || o.pid === process.pid) return true;
    if (!pidAlive(o.pid)) return true;
    const written = Number.isFinite(mtimeMs) ? mtimeMs : Date.parse(o.at || 0);
    return Number.isFinite(written) && written < BOOT_MS() - 60e3; };   /* written before this computer started: a pid from the previous boot */
  /* null = no lock file; {unreadable:true} = a file that cannot be read or parsed (held); else the lock with its mtime */
  const readLockState = () => { let txt, mt; try { txt = readFileSync(lockFile, 'utf8'); mt = statSync(lockFile).mtimeMs; } catch (e) { return e.code === 'ENOENT' ? null : { unreadable: true }; }
    try { const o = JSON.parse(txt); return o && typeof o === 'object' ? { ...o, mtimeMs: mt } : { unreadable: true }; } catch (_) { return { unreadable: true }; } };
  const readLock = () => { const o = readLockState(); return o && !o.unreadable ? o : null; };
  const lockText = () => JSON.stringify({ pid: process.pid, port: myPort, at: new Date().toISOString() });
  const LS = { lost: null, takeovers: 0, unreadableSeen: 0 };
  /* create the lock exclusively; a stale one (holder gone) is renamed aside first. true = this process holds it now */
  function acquireLock() {
    for (let i = 0; i < 3; i++) {
      try { const fd = openSync(lockFile, 'wx'); try { writeFileSync(fd, lockText()); fsyncSync(fd); } finally { closeSync(fd); } return true; }
      catch (e) { if (e.code !== 'EEXIST') return false; }
      const o = readLockState();
      if (!o) continue;   /* removed meanwhile: try the exclusive create again */
      if (o.unreadable) { LS.unreadableSeen++; return false; }
      if (o.pid === process.pid) { beatWrite(); return true; }
      if (!lockOwnerGone(o, o.mtimeMs)) return false;
      const aside = lockFile + '.stale-' + process.pid + '-' + Date.now();
      try { renameSync(lockFile, aside); } catch (_) { continue; }   /* another process renamed it first */
      /* verify that what was moved is the stale lock judged above, not a fresh lock another process created in between */
      let moved = null; try { moved = JSON.parse(readFileSync(aside, 'utf8')); } catch (_) {}
      if (moved && moved.pid !== o.pid && !lockOwnerGone(moved)) { try { renameSync(aside, lockFile); } catch (_) {} return false; }
      try { unlinkSync(aside); } catch (_) {}
      LS.takeovers++;
    }
    return false;
  }
  function beatWrite() { const t = lockFile + '.' + process.pid + '.tmp'; writeFileSync(t, lockText()); renameSync(t, lockFile); }
  /* the writer: is the lock still mine? 'mine' | 'lost' (another live process holds it) | 'unsure' (unreadable: retry later) */
  function lockMine() {
    if (!lockBeat) return 'mine';   /* not lock-managed (forced, or the writer of a read-only store) */
    const o = readLockState();
    if (!o) { try { const fd = openSync(lockFile, 'wx'); try { writeFileSync(fd, lockText()); } finally { closeSync(fd); } return 'mine'; } catch (_) { return 'unsure'; } }
    if (o.unreadable) { LS.unreadableSeen++; return 'unsure'; }
    if (o.pid === process.pid) return 'mine';
    return lockOwnerGone(o, o.mtimeMs) ? 'unsure' : 'lost';
  }
  function loseLock(o) {
    if (lockBeat) { clearInterval(lockBeat); lockBeat = null; }
    LS.lost = { at: new Date().toISOString(), byPid: o && o.pid, byPort: o && o.port };
    readOnly = 'lost the writer lock: another NIGRAAN process (pid ' + (o && o.pid) + ', port ' + ((o && o.port) || '?') + ') writes this data folder; this process stopped writing';
    console.error('  store: ' + readOnly);
  }
  function takeLock() {
    const beat = () => { try { const m = lockMine(); if (m === 'lost') return loseLock(readLock()); if (m === 'mine') beatWrite(); } catch (_) {} };
    try { beatWrite(); } catch (_) {}
    lockBeat = setInterval(beat, 30e3); if (lockBeat.unref) lockBeat.unref();
  }
  const dropLock = () => { if (lockBeat) { clearInterval(lockBeat); lockBeat = null; } const o = readLock(); if (o && o.pid === process.pid) { try { unlinkSync(lockFile); } catch (_) {} } };
  hookProcess();   /* v91.17.283 · WS3 · registered before dropLock: on exit the final write comes first, then the lock goes */
  process.once('exit', dropLock);
  try {
    let got = !!process.env.NIGRAAN_STORE_FORCE || acquireLock();
    for (let i = 0; !got && i < 8 && (readLockState() || {}).unreadable; i++) { const t = Date.now() + 25; while (Date.now() < t) {} got = acquireLock(); }   /* a lock being renamed into place: a few short retries */
    const other = got ? null : (readLock() || { pid: '?', port: null });
    if (!got) {
      if (readOnly) console.error('  store: READ-ONLY: ' + readOnly);
      else { standby = { since: new Date().toISOString(), holderPid: other.pid, holderPort: other.port || null };
        readOnly = 'standby: another NIGRAAN process (pid ' + other.pid + ', port ' + (other.port || '?') + ') writes this data folder; this one takes over when it hands over';
        console.error('  store: STANDBY: ' + readOnly); }
    } else takeLock();
  } catch (e) { console.error('  store: lock check failed (' + (e && e.message) + ')'); }
  for (const c of COLLECTIONS) db.collections[c] = db.collections[c] || [];
  if (standby) { try { S0q = JSON.parse(JSON.stringify(db.collections.quotaWindows)); } catch (_) { S0q = []; } }
  /* v91.17.126 · system audit S-08 · THE FORECAST RECORDS LIVE IN THEIR OWN FILES. 46 of the 56 MB that every save serialised on the
     main thread were the national run records (12 runs x 577 tehsils); the server logged 4,739 stalls over 2 s, 31 over a minute.
     Records are now one file per run under data/records/ (written once when the run lands, deleted when the run is pruned); the main
     database no longer carries them, so a save writes ~10 MB. Reads are unchanged: the records stay in memory under the same API. A
     database from an earlier version still holding records is split into run files on its first save. */
  const recDir = join(dataDir, 'records'); mkdirSync(recDir, { recursive: true });
  const recDirty = new Set(), recGone = new Set(); let legacyRecords = db.collections.records.length > 0;
  try { const have = new Set(db.collections.records.map(r => r.runId));
    for (const n of readdirSync(recDir).filter(n => /^run_[A-Za-z0-9_-]+\.json$/.test(n))) { const id = n.slice(0, -5); if (have.has(id)) continue;
      try { const a = JSON.parse(readFileSync(join(recDir, n), 'utf8')); if (Array.isArray(a)) for (const r of a) db.collections.records.push(r); } catch (e) { console.error('  store: unreadable record file ' + n + ' (' + e.message + '), skipped'); } } } catch (_) {}
  if (legacyRecords) for (const r of db.collections.records) recDirty.add(r.runId);
  function writeShards() {
    if (!recDirty.size && !recGone.size) return;
    const by = new Map(); for (const r of db.collections.records) if (recDirty.has(r.runId)) (by.get(r.runId) || by.set(r.runId, []).get(r.runId)).push(r);
    for (const id of recDirty) { const f = join(recDir, id + '.json'), rows = by.get(id);
      if (!rows || !rows.length) { try { unlinkSync(f); } catch (_) {} continue; }
      const t = f + '.tmp'; const fd = openSync(t, 'w'); try { writeFileSync(fd, JSON.stringify(rows)); fsyncSync(fd); } finally { closeSync(fd); } renameSync(t, f); }
    for (const id of recGone) { if (recDirty.has(id)) continue; try { unlinkSync(join(recDir, id + '.json')); } catch (_) {} }
    recDirty.clear(); recGone.clear(); legacyRecords = false;
  }
  /* ══ v91.17.231/233 · ONLY WHAT CHANGED IS SERIALISED AGAIN ════════════════════════════════════════════════════════════════════
     The laptop database is 15 MB and was serialised and encoded whole on the server's thread at every save (about every 4 s while the
     server works). A recording on the laptop (10 Oct, 150 s of a page load, /api/ops/diag/profile) put 22 s of the server's thread in
     those saves: 11.6 s serialising, 4.2 s turning the text into bytes, the rest writing. Most saves change a counter; the forecast log,
     the audit chain, the idempotency keys and the crossing ledger (most of the bytes) change rarely.
     Now each collection keeps its encoded bytes and they are rebuilt only when needed:
       - a collection under 256 KB is rebuilt at every save (cheap; counters live there and are changed through rows found by find()),
       - a larger one (v234: over 1 MB) when it was written through the store (insert, update, remove) or handed out by allForWrite(),
       - every collection at least every 5 minutes (v235) and at shutdown; a caller that changes rows of a large collection in place
         marks it with allForWrite() before saving (v235: a plain save() no longer rebuilds everything).
     find(), filter() and all() (v234) no longer mark a large collection; a large row changed through them and saved with saveSoon() (not
     save()) reaches the disk within a minute, as a deferred counter already did. The bytes on disk are the same JSON.stringify gave
     (same key order); the file is written from the kept buffers. */
  /* ══ v91.17.283 · WS3 · A LARGE COLLECTION IS REBUILT WHEN ITS ROWS CHANGED, HOWEVER THEY WERE CHANGED ═════════════════════════════
     The kept bytes of a collection over 1 MB were reused unless the collection had been written through the store. A handler that took
     a row with find(), changed it and called save() (operations.actions.update: open -> approved) answered 200 while the file kept
     "open" until the next 5-minute rebuild, and a crash in between lost the approval. Now the store sees the change itself:
       - each large collection keeps, from its last build, the array it was built from, its length, the row references in order and the
         JSON text of every row (rows are encoded one by one; the joined text is byte-identical to JSON.stringify of the array);
       - find() and filter() record the rows they hand out (with the time), all() records that the whole array was handed out;
       - at a save the large collection is rebuilt when it was written through the store, OR its array or length changed, OR a row
         handed out in the last NIGRAAN_STORE_HAND_HOLD_MS (default 5 min, the safety-net rebuild period) encodes differently from its
         kept text, OR (after all()) any row is a different object or encodes differently. Unchanged collections keep their bytes;
       - save('name', ...) and allForWrite('name') still mark a collection outright.
     The 5-minute full rebuild and the full write at shutdown stay. writeStats().rebuild.detected counts the rebuilds this check caused. */
  const cbuf = new Map(), cdirty = new Set(); let fullAt = 0, fullNext = false;
  const SMALL = 1024 * 1024, FULL_MS = 300e3;
  const HOLD_MS = Math.max(0, Number(process.env.NIGRAAN_STORE_HAND_HOLD_MS ?? FULL_MS));
  const RB = { flushes: 0, ms: 0, rebuiltBytes: 0, byCollection: {}, detected: 0, detectedBy: {} };   /* v91.17.234 · what the saves rebuild (writeStats) */
  const CM = new Map(), HAND = new Map(), HAND_ALL = new Set();
  let changeSeq = 0, writtenSeq = 0, buildSeq = 0;
  const touch = (name) => { cdirty.add(name); changeSeq++; };
  const knownSmall = (c) => { const b = cbuf.get(c); return !!b && b.length < SMALL; };
  function hand(c, x) {
    if (knownSmall(c) || x == null) return x;
    if (Array.isArray(x)) {
      if (x === db.collections[c]) { HAND_ALL.add(c); return x; }
      if (!x.length) return x;
      let m = HAND.get(c); if (!m) HAND.set(c, m = new Map()); const t = Date.now(); for (const r of x) if (r && typeof r === 'object') m.set(r, t); return x;
    }
    if (typeof x === 'object') { let m = HAND.get(c); if (!m) HAND.set(c, m = new Map()); m.set(x, Date.now()); }
    return x;
  }
  /* why a large collection must be rebuilt (null: its kept bytes are still right) */
  function changedSinceBuild(c, arr) {
    const m = CM.get(c);
    if (!m || m.arr !== arr || !Array.isArray(arr) || m.len !== arr.length) return 'array or length changed';
    if (HAND_ALL.has(c)) for (let i = 0; i < arr.length; i++) { const r = arr[i]; if (r !== m.refs[i]) return 'a row was replaced (all())'; if (r && typeof r === 'object' && JSON.stringify(r) !== m.strs.get(r)) return 'a row changed (all())'; }
    const h = HAND.get(c), now = Date.now();
    if (h) for (const [r, t] of h) { if (now - t > HOLD_MS) { h.delete(r); continue; } const kept = m.strs.get(r); if (kept === undefined) { h.delete(r); continue; } if (JSON.stringify(r) !== kept) return 'a row handed out by find()/filter() changed'; }
    return null;
  }
  function encodeCollection(c, arr) {
    if (!Array.isArray(arr)) return { text: JSON.stringify(c) + ':' + JSON.stringify(arr), strs: null };
    const strs = new WeakMap(), parts = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) { const r = arr[i]; let t = JSON.stringify(r); if (t === undefined) t = 'null'; parts[i] = t; if (r && typeof r === 'object') strs.set(r, t); }
    return { text: JSON.stringify(c) + ':[' + parts.join(',') + ']', strs };
  }
  function dbBuffers(full) {
    const t0 = Date.now(); RB.flushes++;
    if (full || fullNext || Date.now() - fullAt > FULL_MS) { cbuf.clear(); fullAt = Date.now(); fullNext = false; }   /* v91.17.235 · the safety-net rebuild every 5 min (was 1 min) */
    buildSeq = changeSeq;
    db.saveSeq = seqOf(db) + 1; db.savedAt = new Date().toISOString();   /* v91.17.283 · WS3 · recovery picks the highest saveSeq */
    const out = [], B = (x) => Buffer.from(x, 'utf8');
    const keys = Object.keys(db), cols = Object.keys(db.collections);
    out.push(B('{'));
    keys.forEach((k, ki) => {
      if (ki) out.push(B(','));
      if (k !== 'collections') { const v = JSON.stringify(db[k]); out.push(B(JSON.stringify(k) + ':' + (v === undefined ? 'null' : v))); return; }
      out.push(B(JSON.stringify(k) + ':{'));
      cols.forEach((c, ci) => {
        if (ci) out.push(B(','));
        if (c === 'records') { out.push(B('"records":[]')); return; }
        const arr = db.collections[c];
        let b = cbuf.get(c), why = null;
        if (!b || cdirty.has(c) || b.length < SMALL) why = 'rebuild';
        else { why = changedSinceBuild(c, arr); if (why) { RB.detected++; RB.detectedBy[c] = (RB.detectedBy[c] || 0) + 1; } }
        if (why) {
          const e = encodeCollection(c, arr); b = B(e.text); cbuf.set(c, b); RB.rebuiltBytes += b.length; if (b.length >= SMALL) RB.byCollection[c] = (RB.byCollection[c] || 0) + 1;
          if (b.length >= SMALL && e.strs) { CM.set(c, { arr, len: arr.length, refs: arr.slice(), strs: e.strs }); const h = HAND.get(c); if (h) for (const r of h.keys()) if (!e.strs.has(r)) h.delete(r); }
          else { CM.delete(c); HAND.delete(c); }
        }
        HAND_ALL.delete(c);
        out.push(b);
      });
      out.push(B('}'));
    });
    out.push(B('}'));
    cdirty.clear(); RB.ms += Date.now() - t0;
    return out;
  }
  let pending = null, timer = null, writing = false, gen = 0;
  /* v91.17.283.53 · C · dbBuffers in slices (flush only; flushSync at shutdown keeps the one-piece build): the same bytes, rows encoded one
     by one as encodeCollection does, the event loop free between slices */
  const ENC_SLICE_MS = Math.max(5, Number(process.env.NIGRAAN_STORE_SLICE_MS) || 30);
  const yieldNow = () => new Promise((ok) => setImmediate(ok));
  async function encodeCollectionAsync(c, arr, clock) {
    if (!Array.isArray(arr)) return { text: JSON.stringify(c) + ':' + JSON.stringify(arr), strs: null };
    const strs = new WeakMap(), parts = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) { const r = arr[i]; let t = JSON.stringify(r); if (t === undefined) t = 'null'; parts[i] = t; if (r && typeof r === 'object') strs.set(r, t);
      if ((i & 255) === 255 && Date.now() - clock.t > ENC_SLICE_MS) { await yieldNow(); clock.t = Date.now(); } }
    return { text: JSON.stringify(c) + ':[' + parts.join(',') + ']', strs };
  }
  async function changedSinceBuildAsync(c, arr, clock) {   /* changedSinceBuild in slices (the same answer; the all() check stringifies every row) */
    const m = CM.get(c);
    if (!m || m.arr !== arr || !Array.isArray(arr) || m.len !== arr.length) return 'array or length changed';
    const tick = async (i) => { if ((i & 255) === 255 && Date.now() - clock.t > ENC_SLICE_MS) { await yieldNow(); clock.t = Date.now(); } };
    if (HAND_ALL.has(c)) for (let i = 0; i < arr.length; i++) { const r = arr[i]; if (r !== m.refs[i]) return 'a row was replaced (all())'; if (r && typeof r === 'object' && JSON.stringify(r) !== m.strs.get(r)) return 'a row changed (all())'; await tick(i); }
    const h = HAND.get(c), now = Date.now();
    if (h) { let i = 0; for (const [r, t] of [...h]) { if (now - t > HOLD_MS) { h.delete(r); continue; } const kept = m.strs.get(r); if (kept === undefined) { h.delete(r); continue; } if (JSON.stringify(r) !== kept) return 'a row handed out by find()/filter() changed'; await tick(i++); } }
    return null;
  }
  async function dbBuffersAsync(full) {
    const t0 = Date.now(), clock = { t: Date.now() }; let busy = 0; RB.flushes++;
    if (full || fullNext || Date.now() - fullAt > FULL_MS) { cbuf.clear(); fullAt = Date.now(); fullNext = false; }
    buildSeq = changeSeq;
    db.saveSeq = seqOf(db) + 1; db.savedAt = new Date().toISOString();
    const dirty = new Set(cdirty); cdirty.clear();   /* a collection touched while this runs stays marked for the next write */
    const keys = Object.keys(db), cols = Object.keys(db.collections);
    const top = keys.map((k) => (k === 'collections' ? null : [k, JSON.stringify(db[k])]));
    const snap = new Map(cols.map((c) => [c, Array.isArray(db.collections[c]) ? db.collections[c] : db.collections[c]]));
    const rowsOf = new Map(cols.map((c) => [c, Array.isArray(snap.get(c)) ? snap.get(c).slice() : snap.get(c)]));   /* every collection's rows as of now */
    const out = [], B = (x) => Buffer.from(x, 'utf8');
    out.push(B('{'));
    for (let ki = 0; ki < keys.length; ki++) { const k = keys[ki];
      if (ki) out.push(B(','));
      if (k !== 'collections') { const v = top[ki][1]; out.push(B(JSON.stringify(k) + ':' + (v === undefined ? 'null' : v))); continue; }
      out.push(B(JSON.stringify(k) + ':{'));
      for (let ci = 0; ci < cols.length; ci++) { const c = cols[ci];
        if (ci) out.push(B(','));
        if (c === 'records') { out.push(B('"records":[]')); continue; }
        const arr = snap.get(c), rows = rowsOf.get(c);
        let b = cbuf.get(c), why = null;
        if (!b || dirty.has(c) || b.length < SMALL) why = 'rebuild';
        else { why = await changedSinceBuildAsync(c, arr, clock); if (why) { RB.detected++; RB.detectedBy[c] = (RB.detectedBy[c] || 0) + 1; } }
        if (why) {
          const e = await encodeCollectionAsync(c, rows, clock); b = B(e.text); cbuf.set(c, b); RB.rebuiltBytes += b.length; if (b.length >= SMALL) RB.byCollection[c] = (RB.byCollection[c] || 0) + 1;
          if (b.length >= SMALL && e.strs && Array.isArray(rows)) { CM.set(c, { arr, len: rows.length, refs: rows, strs: e.strs }); const h = HAND.get(c); if (h) for (const r of h.keys()) if (!e.strs.has(r)) h.delete(r); }
          else { CM.delete(c); HAND.delete(c); }
        }
        HAND_ALL.delete(c);
        out.push(b);
        if (Date.now() - clock.t > ENC_SLICE_MS) { busy += Date.now() - clock.t; await yieldNow(); clock.t = Date.now(); }
      }
      out.push(B('}'));
    }
    out.push(B('}'));
    RB.ms += Date.now() - t0; RB.asyncFlushes = (RB.asyncFlushes || 0) + 1;
    return out;
  }

  let failures = 0, renameFails = 0;
  /* v91.17.279 · OPS-12 · a write that keeps failing (disk full, a folder made read-only) is seen: since when, the last error */
  const WF = { since: 0, lastError: null, lastErrorAt: null, saveTimeouts: 0 };
  const wfail = (e) => { if (!WF.since) WF.since = Date.now(); WF.lastError = String((e && (e.code || e.message)) || e).slice(0, 200); WF.lastErrorAt = new Date().toISOString(); };
  const wok = () => { WF.since = 0; };
  const roErr = () => Object.assign(new Error('the store is read-only: ' + readOnly), { code: 'STORE_READ_ONLY', status: 503 });
  /* v91.17.279 · OPS-04 · before a write: the lock must still name this process */
  function lockGate() { const m = lockMine(); if (m === 'lost') { loseLock(readLock()); return 'lost'; } return m; }
  function flushSync() {
    timer = null; gen++;
    if (!readOnly && lockGate() === 'unsure') { failures++; wfail(new Error('the writer lock could not be read')); timer = setTimeout(flush, Math.min(5000, 200 * failures)); return; }
    if (readOnly) { stats.refused = (stats.refused || 0) + 1; if (pending) { const p = pending; pending = null; const e = roErr(); p.forEach(fn => fn(e)); } return; }
    const tmp = file + '.tmp';
    try {
      writeShards();   /* run files first: the main file never points at records that are not on disk */
      const text = Buffer.concat(dbBuffers(true));
      const fd = openSync(tmp, 'w'); try { writeFileSync(fd, text); fsyncSync(fd); } finally { closeSync(fd); }
      /* Windows: antivirus or an editor can hold the target briefly; retry the swap */
      /* v91.17.68 · no busy-wait on the event loop (audit C17): a held target is retried on a timer; after five tries the file is written in place */
      /* v91.17.126 · A22 · never write in place (a crash mid-write would leave neither copy): keep the last good file as .prev, then
         swap; a held target is retried with back-off for as long as it takes */
      let ok = false, last = null;
      try { if (existsSync(file)) { try { unlinkSync(file + '.prev'); } catch (_) {} renameSync(file, file + '.prev'); } renameSync(tmp, file); ok = true; } catch (e) { last = e; }
      if (!ok) {
        renameFails++;
        if (!existsSync(file) && existsSync(file + '.prev')) { try { copyFileSync(file + '.prev', file); } catch (_) {} }
        if (renameFails % 10 === 1) console.error('  store: swap retried ' + renameFails + ' time(s) (' + (last && last.code) + ')');
        timer = setTimeout(flush, Math.min(5000, 40 * renameFails)); return;
      }
      renameFails = 0; failures = 0; wok(); writtenSeq = Math.max(writtenSeq, buildSeq); fsyncDir(dataDir);
    } catch (e) {
      failures++; wfail(e); console.error('  store: write failed (' + (e.code || e.message) + '), retrying'); timer = setTimeout(flush, Math.min(5000, 200 * failures)); return;
    }
    if (pending) { const p = pending; pending = null; p.forEach(fn => fn()); }
    lastFlushAt = Date.now(); firstPendingAt = 0;
    stats.writes++; stats.lastMs = lastFlushAt;
    try { stats.bytes = statSync(file).size; } catch {}
  }
  /* v91.17.155 · the 12 MB database was written and fsynced on the server's one thread at every durable save: 0.3-3 s in which
     no other request was answered (the "stall event loop blocked" lines). The serialisation stays here (it fixes the snapshot);
     the write and the fsync now run off the event loop, then the same .prev swap. One write at a time; saves that arrive during
     a write are carried by the next one. flushNow (shutdown) still writes synchronously. */
  function flush() {
    timer = null;
    if (readOnly || writing) { if (readOnly) return flushSync(); timer = setTimeout(flush, 50); return; }
    { const m = lockGate(); if (m === 'lost') return flushSync(); if (m === 'unsure') { failures++; wfail(new Error('the writer lock could not be read')); timer = setTimeout(flush, Math.min(5000, 200 * failures)); return; } }
    /* v91.17.283.53 · C · event loop: the encoding of a large collection (the forecast log: 58,854 rows, 15 MB; the 5-minute full rebuild)
       held the server's one thread for 1-2 s. It now runs in slices of at most ENC_SLICE_MS with the event loop free between them
       (dbBuffersAsync: the same bytes, the row lists of every collection taken at the start). The saves waiting now are the ones this write
       carries (a save that arrives while it encodes waits for the next write, so it is never acknowledged by bytes that miss it). */
    const p = pending; pending = null; writing = true; const gen0 = gen;
    (async () => { writeShards(); const t = await dbBuffersAsync(false); return t; })().then((text) => {
      writing = false; if (gen !== gen0) { if (p) p.forEach(fn => fn()); return; }   /* a synchronous flush (shutdown) wrote meanwhile */
      flushWrite(text, buildSeq, p); }, (e) => {
      writing = false; pending = p ? (pending ? p.concat(pending) : p) : pending;
      failures++; wfail(e); console.error('  store: write failed (' + (e.code || e.message) + '), retrying'); timer = setTimeout(flush, Math.min(5000, 200 * failures)); });
  }
  function flushWrite(text, seqHere, p) {
    writing = true; const myGen = ++gen;
    const tmp = file + '.tmpa';
    (async () => { const fh = await fsp.open(tmp, 'w'); try { await fh.writeFile(Buffer.concat(text)); await fh.sync(); } finally { await fh.close(); } })()
      .then(() => {
        if (myGen !== gen) { try { unlinkSync(tmp); } catch (_) {} writing = false; if (p) p.forEach(fn => fn()); return; }   /* a synchronous flush (shutdown) wrote newer state meanwhile */
        let ok = false, last = null;
        try { if (existsSync(file)) { try { unlinkSync(file + '.prev'); } catch (_) {} renameSync(file, file + '.prev'); } renameSync(tmp, file); ok = true; } catch (e) { last = e; }
        if (!ok) { renameFails++; wfail(last); if (!existsSync(file) && existsSync(file + '.prev')) { try { copyFileSync(file + '.prev', file); } catch (_) {} }
          if (renameFails % 10 === 1) console.error('  store: swap retried ' + renameFails + ' time(s) (' + (last && last.code) + ')');
          pending = p ? (pending ? p.concat(pending) : p) : pending; writing = false; if (!timer) timer = setTimeout(flush, Math.min(5000, 40 * renameFails)); return; }
        renameFails = 0; failures = 0; wok(); writing = false; writtenSeq = Math.max(writtenSeq, seqHere); fsyncDir(dataDir);
        if (p) p.forEach(fn => fn());
        lastFlushAt = Date.now(); firstPendingAt = pending ? Date.now() : 0; stats.writes++; stats.lastMs = lastFlushAt;
        try { stats.bytes = statSync(file).size; } catch {}
        if (pending && !timer) timer = setTimeout(flush, 25);
      })
      .catch((e) => { failures++; wfail(e); writing = false; pending = p ? (pending ? p.concat(pending) : p) : pending; console.error('  store: write failed (' + (e.code || e.message) + '), retrying'); if (!timer) timer = setTimeout(flush, Math.min(5000, 200 * failures)); });
  }
  /* ══ v91.17.3 · 3.8 · THE STORE STOPPED BEING REWRITTEN ON EVERY CALL ═══════
     Every provider call ends with store.save(), and save() scheduled a flush
     25 ms later. The database is ~6 MB and grows; a national sweep makes
     hundreds of provider calls in a burst, and a 25 ms debounce coalesces
     almost none of them. Measured: the file was serialised, fsynced and
     renamed dozens of times a second during a sweep, which is most of the
     disk time this process spends and none of it is needed — a quota counter
     that is 2 seconds stale costs nothing, and a crash loses 2 seconds of
     counters, not data.

     The debounce is now adaptive. A write that follows a quiet period still
     goes out in 25 ms, so an interactive change is durable immediately. A
     write that arrives during a burst is coalesced for up to QUIET_MS, and
     MAX_DEFER_MS is a hard ceiling so a continuous burst can never starve the
     flush indefinitely. writes/coalesced are counted so the health endpoint
     can show the ratio rather than anyone having to take this on trust. */
  /* v91.17.132 · SPEED · counter-only flushes (provider call counts, fleet state) rewrote the whole 12-15 MB database every 1.5-5 s
     while busy, each time a synchronous serialise + fsync on the server's one thread. Counters now wait up to 20 s of quiet and
     never more than 60 s; durable writes (every insert, update, remove that an API call awaits) still flush in ~25 ms. */
  const QUIET_MS = 20000, MAX_DEFER_MS = 60000;
  const SAVE_TIMEOUT_MS = Math.max(100, Number(process.env.NIGRAAN_STORE_SAVE_TIMEOUT_MS) || 30000);
  let lastFlushAt = 0, firstPendingAt = 0;
  const stats = { writes: 0, coalesced: 0, deferred: 0, bytes: 0, lastMs: 0 };

  function schedule(urgent) {
    if (timer) { stats.coalesced++; if (urgent) { clearTimeout(timer); timer = setTimeout(flush, 25); } return; }
    const now = Date.now();
    if (!firstPendingAt) firstPendingAt = now;
    let delay;
    if (urgent) delay = 25;
    else {
      /* quiet: go soon. Busy: coalesce, but never past the ceiling. */
      const sinceFlush = now - lastFlushAt;
      delay = sinceFlush >= QUIET_MS ? 25 : QUIET_MS - sinceFlush;
      const waited = now - firstPendingAt;
      if (waited + delay > MAX_DEFER_MS) delay = Math.max(0, MAX_DEFER_MS - waited);
      stats.deferred++;
    }
    timer = setTimeout(flush, delay);
  }

  /* A DURABLE write. The caller awaits the disk, so an API handler that
     returns 201 has the record on disk before the client sees the response.
     This is the path every insert, update and remove takes and its latency is
     unchanged: ~25 ms. */
  /* v91.17.283 · WS3 · save('actions', ...): the caller names the collections whose rows it changed in place; they are rebuilt at this
     write (the change check above finds them too; naming them makes it explicit and costs nothing) */
  async function save(...names) {
    for (const n of names.flat()) { if (typeof n === 'string' && db.collections[n]) cdirty.add(n); }
    changeSeq++;
    if (standby) await whenWritable();   /* v91.17.269 · a standby waits for the hand-over */
    if (readOnly) return Promise.reject(Object.assign(new Error('the store is read-only: ' + readOnly), { code: 'STORE_READ_ONLY' }));
    /* v91.17.279 · OPS-12 · a save that has not reached the disk after SAVE_TIMEOUT_MS is answered with an error (STORE_WRITE_FAILED,
       HTTP 503) instead of hanging the request; the change stays in memory and the flush keeps retrying, so it lands when the disk recovers */
    return new Promise((res, rej) => { let done = false;
      const t = setTimeout(() => { if (done) return; done = true; WF.saveTimeouts++;
        rej(Object.assign(new Error('the database could not be written within ' + Math.round(SAVE_TIMEOUT_MS / 1000) + ' s (' + (WF.lastError || 'no write completed') + '); the change is kept in memory and written when the disk recovers'), { code: 'STORE_WRITE_FAILED', status: 503 })); }, SAVE_TIMEOUT_MS);
      if (t.unref) t.unref();
      (pending = pending || []).push((err) => { if (done) return; done = true; clearTimeout(t); if (err) rej(err); else res(); }); schedule(true); });
  }
  /* v91.17.279 · OPS-12 · the write health /health and the ops board show: failing = writes have failed for over 10 s without one succeeding */
  function writeHealth() { const now = Date.now(); return { failing: !!WF.since && now - WF.since > 10e3, failingSince: WF.since ? new Date(WF.since).toISOString() : null, lastError: WF.lastError, lastErrorAt: WF.lastErrorAt, saveTimeouts: WF.saveTimeouts, saveTimeoutMs: SAVE_TIMEOUT_MS, lock: { held: !!lockBeat, lost: LS.lost, takeovers: LS.takeovers, unreadableSeen: LS.unreadableSeen } }; }

  /* ══ v91.17.3 · 3.8 · A COUNTER IS NOT A RECORD ═════════════════════════════
     Every provider call ended with store.save(), and save() serialises,
     fsyncs and renames the whole ~6 MB database. A national sweep makes
     hundreds of provider calls in a burst; the quota counter it is updating is
     four integers, and a counter that is two seconds stale costs nothing while
     a crash loses two seconds of counters rather than any data.

     saveSoon() marks the database dirty and returns immediately. The flush is
     coalesced for up to QUIET_MS and MAX_DEFER_MS is a hard ceiling so a
     continuous burst can never starve it. A durable save() arriving meanwhile
     pulls the flush forward and carries the counters with it.

     The distinction matters in the other direction too: an earlier draft made
     ALL writes deferred, which added up to 1.5 s to every API write because
     handlers await save(). Measured on the backend suite that turned a 90 s
     run into one that had not finished in 6 minutes. Counters defer; records
     do not. */
  function saveSoon(...names) { for (const n of names.flat()) { if (typeof n === 'string' && db.collections[n]) cdirty.add(n); } changeSeq++; schedule(false); }
  const col = (name) => { if (!db.collections[name]) throw new Error('unknown collection ' + name); return db.collections[name]; };
  /* v91.17.210 · audit A03/A04 · WRITABILITY IS CHECKED BEFORE THE MUTATION. insert/update/remove changed the in-memory collection and
     only then learned from save() that the store is read-only, so memory and disk disagreed and later reads served a record that was
     never written. The check now comes first: a read-only store refuses the write and memory is unchanged. */
  const writable = () => { if (readOnly) throw Object.assign(new Error('the store is read-only: ' + readOnly), { code: 'STORE_READ_ONLY', status: 503 }); };

  /* v91.17.269 · INFRA A6 · standby -> writer (see the lock block above) */
  const STANDBY_WAIT_MS = Math.max(0, Number(process.env.NIGRAAN_STANDBY_WAIT_MS ?? 30000));
  const whenWritable = (ms = STANDBY_WAIT_MS) => (!standby ? Promise.resolve(!readOnly) : new Promise((res) => {
    const w = { done: false, res: (v) => { if (w.done) return; w.done = true; clearTimeout(w.t); res(v); } };
    w.t = setTimeout(() => w.res(false), ms); writableWaiters.push(w); }));
  const awaitStandby = async () => { if (standby) await whenWritable(); };
  const qKey = (w) => String(w && w.providerId) + '|' + String(w && w.day);
  /* the counts this standby process added to a quota window = its value now minus the value it loaded; added to the disk's value */
  function mergeQuota(memRows, diskRows) {
    const s0 = new Map((S0q || []).map(w => [qKey(w), w])), mem = new Map(memRows.map(w => [qKey(w), w])), out = [];
    for (const d of diskRows) {
      const m = mem.get(qKey(d)); if (!m) { out.push(d); continue; }
      mem.delete(qKey(d));
      const b = s0.get(qKey(d)) || {}, merged = { ...d };
      for (const [k, v] of Object.entries(m)) {
        if (typeof v !== 'number' || !Number.isFinite(v)) { if (!(k in merged)) merged[k] = v; continue; }
        const delta = v - (typeof b[k] === 'number' ? b[k] : 0);
        if (delta > 0) merged[k] = (typeof d[k] === 'number' ? d[k] : 0) + delta;
      }
      if (m.lastCallAt && (!d.lastCallAt || String(m.lastCallAt) > String(d.lastCallAt))) { merged.lastCallAt = m.lastCallAt; merged.lastStatus = m.lastStatus; }
      for (const k of Object.keys(m)) delete m[k];
      out.push(Object.assign(m, merged));   /* the same object: a provider call in flight keeps counting into the merged row */
    }
    for (const m of mem.values()) if (!s0.has(qKey(m))) out.push(m);   /* a window opened during standby (a new UTC day) */
    return out;
  }
  function promote(why) {
    if (!standby) return true;
    const t0 = Date.now();
    const disk = tryLoad(file) || tryLoad(file + '.prev');
    if (!disk) { console.error('  store: hand-over: the database on disk could not be read; staying in standby'); return false; }
    for (const c of COLLECTIONS) {
      if (c === 'records') continue;
      const arr = db.collections[c], rows = Array.isArray(disk.collections[c]) ? disk.collections[c] : [];
      const next = c === 'quotaWindows' ? mergeQuota(arr.slice(), rows) : rows;
      arr.length = 0; for (const r of next) arr.push(r);   /* in place: modules hold these arrays */
    }
    for (const k of Object.keys(disk)) if (k !== 'collections') db[k] = disk[k];
    /* the run files: the old writer may have added or pruned runs since this process loaded them */
    let added = 0, dropped = 0;
    try {
      const onDisk = new Set(readdirSync(recDir).filter(n => /^run_[A-Za-z0-9_-]+\.json$/.test(n)).map(n => n.slice(0, -5)));
      const R = db.collections.records, inMem = new Set(R.map(r => r.runId));
      if ([...inMem].some(id => !onDisk.has(id))) { const keep = R.filter(r => onDisk.has(r.runId)); dropped = R.length - keep.length; R.length = 0; for (const r of keep) R.push(r); }
      for (const id of onDisk) { if (inMem.has(id)) continue;
        try { const a = JSON.parse(readFileSync(join(recDir, id + '.json'), 'utf8')); if (Array.isArray(a)) { for (const r of a) R.push(r); added += a.length; } }
        catch (e) { console.error('  store: unreadable record file ' + id + '.json (' + e.message + '), skipped'); } }
    } catch (_) {}
    recDirty.clear(); recGone.clear(); legacyRecords = false; cbuf.clear(); cdirty.clear(); fullNext = true;
    takeLock();   /* the lock itself was created exclusively by the poll (acquireLock) */
    const was = standby; standby = null; readOnly = null; S0q = null;
    console.error('  store: hand-over done (' + why + '): this process now writes the data folder; database re-read in ' + (Date.now() - t0) + ' ms, run records +' + added + ' / -' + dropped + ' (standby since ' + was.since + ')');
    for (const w of writableWaiters.splice(0)) w.res(true);
    for (const f of promotedCbs.splice(0)) { try { f(); } catch (e) { console.error('  store: after hand-over: ' + (e && e.message)); } }
    return true;
  }
  if (standby) {
    const poll = setInterval(() => { if (!standby) return clearInterval(poll); const o = readLockState();
      if (o && o.unreadable) { LS.unreadableSeen++; return; }   /* v91.17.279 · OPS-04 · unreadable = held: wait */
      if (o && o.pid !== standby.holderPid && !lockOwnerGone(o, o.mtimeMs)) { standby.holderPid = o.pid; standby.holderPort = o.port || null; return; }   /* another writer took over meanwhile: wait for that one */
      if (o && !lockOwnerGone(o, o.mtimeMs)) return;
      if (!acquireLock()) return;   /* another standby got it first, or it is held again */
      if (promote(o ? 'the previous writer is gone' : 'the previous writer released the lock')) clearInterval(poll); else dropLock(); },
    Math.max(50, Number(process.env.NIGRAAN_STANDBY_POLL_MS) || 250));
    if (poll.unref) poll.unref();
  }
  /* the old process at a hand-over: one full synchronous write (an async write in flight is superseded by it), then the lock goes */
  /* ══ v91.17.283 · WS3 · THE FINAL WRITE ═══════════════════════════════════════════════════════════════════════════════════════════
     finalFlush(): one synchronous full write of everything in memory (a background write in flight is superseded by it), retried until
     it lands or NIGRAAN_STORE_SHUTDOWN_MS (default 10 s) has passed; it says whether it landed. It runs on process exit and on a stop
     signal (hookProcess above), from flushNow() and from shutdown(). Before v283 flushNow() skipped the write when a background write
     was in flight with no awaited save behind it (counters changed meanwhile were lost at a stop), and a failed rename at a stop was
     left to a timer that never ran. A standby or read-only store never writes. */
  const SHUTDOWN_MS = Math.max(100, Number(process.env.NIGRAAN_STORE_SHUTDOWN_MS) || 10000);
  const FF = { last: null };
  function finalFlush({ timeoutMs = SHUTDOWN_MS, force = false } = {}) {
    if (standby) return (FF.last = { ok: false, skipped: 'standby' });
    if (readOnly) return (FF.last = { ok: false, skipped: readOnly });
    if (!force && changeSeq === writtenSeq && !pending && !timer) return (FF.last = { ok: true, skipped: 'nothing to write' });
    if (!existsSync(dataDir)) return (FF.last = { ok: false, skipped: 'the data folder ' + dataDir + ' no longer exists' });
    const t0 = Date.now(), w0 = stats.writes;
    for (;;) {
      if (timer) { clearTimeout(timer); timer = null; }
      flushSync();
      if (timer) { clearTimeout(timer); timer = null; }
      if (stats.writes > w0) return (FF.last = { ok: true, ms: Date.now() - t0, at: new Date().toISOString() });
      if (readOnly) return (FF.last = { ok: false, why: readOnly, ms: Date.now() - t0 });
      const left = timeoutMs - (Date.now() - t0);
      if (left <= 0) { const why = 'the final write did not complete within ' + timeoutMs + ' ms (' + (WF.lastError || 'no error recorded') + '); the previous good copy stays on disk';
        console.error('  store: ' + why); return (FF.last = { ok: false, why, ms: Date.now() - t0 }); }
      sleepSync(Math.min(100, left));
    }
  }
  /* the old process at a hand-over: one full write (an async write in flight is superseded by it), retried without blocking the thread
     for up to NIGRAAN_STORE_SHUTDOWN_MS, then the lock goes */
  async function release() {
    if (standby || readOnly) return { released: false, why: readOnly || 'not the writer' };
    const t0 = Date.now();
    while (writing && Date.now() - t0 < SHUTDOWN_MS / 2) await new Promise(r => setTimeout(r, 50));
    const w0 = stats.writes;
    while (Date.now() - t0 < SHUTDOWN_MS) {   /* a held target (antivirus) is retried here, not on the timer */
      if (timer) { clearTimeout(timer); timer = null; }
      flushSync();
      if (timer) { clearTimeout(timer); timer = null; }
      if (stats.writes > w0) break;
      await new Promise(r => setTimeout(r, 100));
    }
    if (stats.writes === w0) console.error('  store: hand-over: the last write did not complete within ' + SHUTDOWN_MS + ' ms; the next server re-reads the previous good copy');
    readOnly = 'released: this process handed the data folder over to the next server';
    dropLock();
    return { released: true, writes: stats.writes, lastWriteOk: stats.writes > w0, ms: Date.now() - t0 };
  }
  /* v91.17.283 · WS3 · REPLACE IN ONE STEP. The casebook replaced a project, a field record or an intervention with removeWhere() then
     insert(): two writes, and a crash or a failed second write between them left the record deleted on disk; two requests at once could
     both remove and both insert (a duplicate). replace() removes every row the predicate matches and puts the new row where the first one
     was (or at the end), in memory in one synchronous step, then one durable write. Returns { row, replaced: n }. */
  async function replace(name, pred, row) {
    await awaitStandby(); writable(); touch(name);
    const c = col(name); let at = -1, n = 0;
    for (let i = c.length - 1; i >= 0; i--) if (pred(c[i])) { if (name === 'records') recGone.add(c[i].runId); c.splice(i, 1); n++; at = i; }
    if (at >= 0) c.splice(at, 0, row); else c.push(row);
    if (name === 'records') recDirty.add(row.runId);
    await save(); return { row, replaced: n };
  }
  const self = { _exitFlush: () => finalFlush({ timeoutMs: SHUTDOWN_MS }) };
  LIVE.add(self);
  return {
    file, dataDir, readOnly: () => readOnly, recoveredFrom: () => recoveredFrom,
    /* v91.17.269 · INFRA A6 · hand-over: standby() is null for the writer; onPromoted(f) runs f once this process becomes the writer */
    standby: () => standby, whenWritable, release, onPromoted: (f) => { if (!standby) { if (!readOnly) f(); return; } promotedCbs.push(f); },
    /* v91.17.234 · all() hands out the rows for reading; a caller that changes them in place uses allForWrite() (or saves with save()) */
    all: (name) => hand(name, col(name)),
    allForWrite: (name) => { touch(name); return col(name); },
    find: (name, pred) => hand(name, col(name).find(pred) || null),
    filter: (name, pred) => hand(name, col(name).filter(pred)),
    replace,
    insert: async (name, row) => { await awaitStandby(); writable(); touch(name); col(name).push(row); if (name === 'records') recDirty.add(row.runId); await save(); return row; },
    insertMany: async (name, rows) => { await awaitStandby(); writable(); touch(name); const c = col(name); for (const r of rows) { c.push(r); if (name === 'records') recDirty.add(r.runId); } await save(); return rows.length; },
    update: async (name, pred, patch) => {
      await awaitStandby();
      touch(name); const r = col(name).find(pred); if (!r) return null; writable();
      Object.assign(r, typeof patch === 'function' ? patch(r) : patch); if (name === 'records') recDirty.add(r.runId); await save(); return r;
    },
    removeWhere: async (name, pred) => { await awaitStandby(); writable(); touch(name); const c = col(name); const keep = c.filter(x => !pred(x)); const n = c.length - keep.length;
      if (name === 'records' && n) { const kept = new Set(keep.map(r => r.runId)); for (const r of c) if (!kept.has(r.runId)) recGone.add(r.runId); else if (pred(r)) recDirty.add(r.runId); }
      db.collections[name] = keep; await save(); return n; },
    /* a caller's own save() (after changing rows it holds) rebuilds every collection's text; saveSoon (counters) only the touched ones */
    /* v91.17.235 · a caller's save() no longer rebuilds every collection: the laptop rebuilt 15 MB at every save (110 saves, 0.9 s each in 18 min)
       because the run and job bookkeeping calls save() often. The two callers that change rows of a large collection in place mark it (allForWrite). */
    save, saveSoon, writeHealth,
    /* v91.17.283 · WS3 · flushNow() writes whatever memory holds that is not on disk (synchronously, retried up to NIGRAAN_STORE_SHUTDOWN_MS) and says whether it landed;
       shutdown() is the awaited form for a caller that stops the process itself; close() also takes the store out of the exit hooks */
    flushNow: (o) => finalFlush({ ...(o || {}) }),
    shutdown: async (o) => finalFlush({ ...(o || {}) }),
    lastFinalFlush: () => FF.last,
    close: () => { const r = finalFlush({}); LIVE.delete(self); return r; },
    recovery: () => recovery,
    /* v91.17.3 · 3.8 · what the debounce actually saved, as a number */
    writeStats: () => ({ ...stats, rebuild: { ...RB, byCollection: { ...RB.byCollection }, detectedBy: { ...RB.detectedBy }, avgMs: RB.flushes ? Math.round(RB.ms / RB.flushes) : null, avgMB: RB.flushes ? Math.round(RB.rebuiltBytes / RB.flushes / 1e4) / 100 : null }, coalescedShare: (stats.writes + stats.coalesced)
      ? Math.round(1000 * stats.coalesced / (stats.writes + stats.coalesced)) / 10 : null,
      quietMs: QUIET_MS, maxDeferMs: MAX_DEFER_MS }),
    snapshotText: () => JSON.stringify(db),
    counts: () => Object.fromEntries(COLLECTIONS.map(c => [c, col(c).length])),
    meta: db,
  };
}

export const sha256 = (x) => createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
export const newId = (prefix) => prefix + '_' + randomUUID().replace(/-/g, '').slice(0, 20);
export const nowIso = () => new Date().toISOString();
/* stable JSON: key order must not change a hash */
export function stable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
}
export const hashStable = (v) => createHash('sha256').update(stable(v)).digest('hex');
