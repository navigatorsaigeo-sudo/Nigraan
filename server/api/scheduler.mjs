/* ══ v91.17.218 · ONE SCHEDULER (system audit S-11) ═══════════════════════════════════════════════════════════════════════════════
   Each background job used to start its own setInterval, so nothing could say what runs when, a slow run could overlap the next
   one, and nobody could see a job that kept failing. Every recurring job now registers here:
     every(id, everyMs, fn, { firstMs, heavy, label })
   - a job never overlaps itself: a tick that arrives while the last run is still going is counted as skipped, not started;
   - heavy jobs (Python children, satellite downloads, national recomputes) wait for a free heavy slot (NIGRAAN_HEAVY_SLOTS, default 2),
     so they no longer all start in the same minute after a restart;
   - heavy: 'bulk' marks the long back-fills (MACH database, ensemble archive, fleet backfill, drop import; up to an hour each). They
     share one slot of their own (NIGRAAN_BULK_SLOTS, default 1), so a back-fill never holds up the satellite rain check or a national score;
   - heavy: 'long' (v91.17.283.24 · self-audit J8) marks the long compute runs (the weekly experiments, up to 3 h 20; the flood shadow and
     its truth scorer, up to 50 min). They share one slot of their own (NIGRAAN_LONG_SLOTS, default 1): before, they held the one bulk
     slot, so on Sunday the LAMHA copy and the MACH database sync waited up to 3 h behind the experiments and feed-health wrote false
     LATE / DOWN lines;
   - heavy: 'sync' (v91.17.283.24 · J8) marks the data copies and syncs whose age the feed-health agent watches (the LAMHA copy; the MACH
     database sync should register here too). They share a slot pool of their own (NIGRAAN_SYNC_SLOTS, default 2: the copy and the sync
     never wait for each other), so a data copy or sync never waits behind a back-fill or a long compute run;
   - each job keeps runs, last start, last duration, last error and skipped ticks; GET /api/ops/schedule lists them.
   Timers are unref'd: the scheduler never keeps the process alive on its own.
   v91.17.283.50 (1.0.10.1) · CATCH-UP AFTER A LONG GAP. Laptop 3 Nov 2026 (data/server.log): the laptop slept 06:05-09:29 PKT; on wake every
   job's timer fired in the same second (MACH sync, feed health, verify, flood shadow, LAMHA copy, rain 24 h, WN3 import, EPD import, EWS
   sync, retrain check, METAR sync ...), the event loop was blocked up to 28 s and the watchdog restarted the server at 09:31. A tick that
   arrives more than NIGRAAN_CATCHUP_LATE_S (default 120) after it was due is a catch-up tick: it is not started at once but queued, and
   the queue runs ONE job at a time, NIGRAAN_CATCHUP_SPACING_S (default 20) apart, each given up to NIGRAAN_CATCHUP_WAIT_S (default 180)
   before the next starts; light jobs first, then sync, heavy, and last the bulk back-fills and long compute runs, which also wait
   NIGRAAN_CATCHUP_DEFER_MIN (default 5) after the gap ended. A job already queued is not queued twice; the normal interval resumes after. */
export function createScheduler() {
  const jobs = new Map();
  const pool = (n) => { const p = { n, busy: 0, q: [] };
    p.take = () => new Promise((res) => { if (p.busy < p.n) { p.busy++; res(); } else p.q.push(res); });
    p.give = () => { const nx = p.q.shift(); if (nx) nx(); else p.busy = Math.max(0, p.busy - 1); };
    return p; };
  const POOLS = { heavy: pool(Math.max(1, Number(process.env.NIGRAAN_HEAVY_SLOTS) || 2)), bulk: pool(Math.max(1, Number(process.env.NIGRAAN_BULK_SLOTS) || 1)), long: pool(Math.max(1, Number(process.env.NIGRAAN_LONG_SLOTS) || 1)), sync: pool(Math.max(1, Number(process.env.NIGRAAN_SYNC_SLOTS) || 2)) };

  /* v91.17.269 · INFRA A6 · a gate (set by the backend): a server in standby (a deploy's new server before the hand-over) or draining
     (the old one after it) starts no job. An interval tick is skipped; a first run is tried again 15 s later, so it still runs once the
     server becomes the writer. */
  let gate = null;
  /* v91.17.283.50 · catch-up queue (see the head note) */
  const envN = (k, d) => { const v = Number(process.env[k]); return Number.isFinite(v) && v >= 0 ? v : d; };
  const LATE_MS = envN('NIGRAAN_CATCHUP_LATE_S', 120) * 1000, SPACING_MS = envN('NIGRAAN_CATCHUP_SPACING_S', 20) * 1000,
    WAIT_MS = envN('NIGRAAN_CATCHUP_WAIT_S', 180) * 1000, DEFER_MS = envN('NIGRAAN_CATCHUP_DEFER_MIN', 5) * 60e3;
  const RANK = { light: 0, sync: 1, heavy: 2, bulk: 3, long: 4 }, rankOf = (j) => RANK[j.heavy || 'light'];
  const CU = { queue: [], draining: false, gapEndedAt: null, gaps: 0, ran: 0, order: [] };
  const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); if (t.unref) t.unref(); });
  function catchUp(j, why, lateMs) {
    CU.gapEndedAt = Date.now(); if (!CU.draining && !CU.queue.length) CU.gaps++;
    j.catchups = (j.catchups || 0) + 1; j.lastLateMs = lateMs;
    if (j.running || CU.queue.some((x) => x.j === j)) { j.skipped++; return; }
    CU.queue.push({ j, why }); if (!CU.draining) drain();
  }
  async function drain() {
    CU.draining = true;
    try {
      await sleep(Math.min(5000, SPACING_MS));   /* the other late ticks of the same wake arrive in this second: sort them first */
      while (CU.queue.length) {
        CU.queue.sort((a, b) => rankOf(a.j) - rankOf(b.j) || a.j.everyMs - b.j.everyMs);
        const { j, why } = CU.queue[0];
        if (rankOf(j) >= RANK.bulk) { const wait = CU.gapEndedAt + DEFER_MS - Date.now(); if (wait > 0) { await sleep(Math.min(wait, 60e3)); continue; } }
        CU.queue.shift(); CU.ran++; CU.order.push(j.id); if (CU.order.length > 50) CU.order.shift();
        await Promise.race([runJob(j, why === 'first' ? 'first' : 'catchup'), sleep(WAIT_MS)]);
        if (CU.queue.length) await sleep(SPACING_MS);
      }
    } finally { CU.draining = false; }
  }
  async function runJob(j, why) {
    if (gate && !gate()) { j.skipped++; j.gated = (j.gated || 0) + 1; if (why === 'first' || why === 'gated-first') { const t = setTimeout(() => runJob(j, 'gated-first'), 15e3); if (t.unref) t.unref(); } return; }
    if (j.running) { j.skipped++; return; }
    const P = j.heavy ? POOLS[j.heavy] : null;
    j.running = true; j.waiting = !!P; let t0 = Date.now(); let got = false;
    try {
      if (P) { await P.take(); got = true; j.lastWaitMs = Date.now() - t0; t0 = Date.now();
        /* v91.17.279 · OPS-03 · the gate is checked again once the slot is free: a job queued before a deploy closed the gate does not
           start on the draining or standby server; the slot goes back and a first run is re-armed like a gated tick */
        if (gate && !gate()) { got = false; P.give(); j.skipped++; j.gated = (j.gated || 0) + 1; j.running = false; j.waiting = false;
          if (why === 'first' || why === 'gated-first') { const t = setTimeout(() => runJob(j, 'gated-first'), 15e3); if (t.unref) t.unref(); }
          return; } }
      j.waiting = false; j.lastStart = new Date().toISOString(); j.runs++;
      await j.fn(why);
      j.lastOk = new Date().toISOString(); j.lastError = null;
    } catch (e) { j.errors++; j.lastError = String((e && e.message) || e).slice(0, 300); }
    finally { j.lastMs = Date.now() - t0; j.running = false; j.waiting = false; if (got) P.give(); }
  }
  function every(id, everyMs, fn, o = {}) {
    if (jobs.has(id)) return jobs.get(id);
    const j = { id, label: o.label || id, everyMs, heavy: o.heavy === 'bulk' || o.heavy === 'long' || o.heavy === 'sync' ? o.heavy : (o.heavy ? 'heavy' : null), fn, lastWaitMs: null, runs: 0, errors: 0, skipped: 0, running: false, waiting: false,
      lastStart: null, lastOk: null, lastMs: null, lastError: null, timer: null, first: null };
    /* v91.17.269 · PERF · a period that is not a number of at least one second is refused, not run: Node turns setInterval(NaN) into a
       1 ms loop. MEASURED: data/seismic-felt-rule.json without poll.revisionSeconds made 'quake-revise' run 60 439 times in 20 min. */
    if (!(Number.isFinite(everyMs) && everyMs >= 1000)) { j.lastError = 'not scheduled: the period (' + everyMs + ' ms) is not a number of at least 1000 ms'; jobs.set(id, j); return j; }
    j.due = Date.now() + everyMs;
    j.timer = setInterval(() => { const now = Date.now(), late = now - j.due; j.due = now + everyMs; if (LATE_MS > 0 && late > LATE_MS) return catchUp(j, 'interval', late); runJob(j, 'interval'); }, everyMs); if (j.timer.unref) j.timer.unref();
    if (o.firstMs != null) { const fdue = Date.now() + o.firstMs; j.first = setTimeout(() => { const late = Date.now() - fdue; if (LATE_MS > 0 && late > LATE_MS) return catchUp(j, 'first', late); runJob(j, 'first'); }, o.firstMs); if (j.first.unref) j.first.unref(); }
    jobs.set(id, j); return j;
  }
  function list() {
    return { slots: Object.fromEntries(Object.entries(POOLS).map(([k, p]) => [k, { slots: p.n, busy: p.busy, queued: p.q.length }])),
      catchup: { lateS: LATE_MS / 1000, spacingS: SPACING_MS / 1000, deferMin: DEFER_MS / 60e3, gaps: CU.gaps, lastGapEndedAt: CU.gapEndedAt ? new Date(CU.gapEndedAt).toISOString() : null, queued: CU.queue.map((x) => x.j.id), ran: CU.ran, lastOrder: CU.order.slice(-20) },
      jobs: [...jobs.values()].map((j) => ({ id: j.id, label: j.label, everyMin: Math.round(j.everyMs / 6e3) / 10, heavy: j.heavy, running: j.running, waiting: j.waiting,
        runs: j.runs, errors: j.errors, skipped: j.skipped, catchups: j.catchups || 0, lastStart: j.lastStart, lastOk: j.lastOk, lastMs: j.lastMs, lastWaitMs: j.lastWaitMs, lastError: j.lastError })) };
  }
  function runNow(id) { const j = jobs.get(id); if (!j) return false; runJob(j, 'manual'); return true; }
  return { every, list, runNow, setGate: (f) => { gate = typeof f === 'function' ? f : null; } };
}

/* a module registers through this: the app's scheduler when there is one, else the plain timers it used before (tests, scripts) */
export function schedule(app, id, everyMs, fn, o = {}) {
  if (app && app.scheduler) return app.scheduler.every(id, everyMs, fn, o);
  if (!(Number.isFinite(everyMs) && everyMs >= 1000)) return null;   /* v91.17.269 · as every() above: no 1 ms loop from a missing period */
  const t = setInterval(() => { Promise.resolve().then(() => fn('interval')).catch(() => {}); }, everyMs); if (t.unref) t.unref();
  if (o.firstMs != null) { const f = setTimeout(() => { Promise.resolve().then(() => fn('first')).catch(() => {}); }, o.firstMs); if (f.unref) f.unref(); }
  return null;
}
