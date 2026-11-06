/* ══ v91.17.232 · WHAT THE SERVER'S THREAD SPENDS ITS TIME ON, MEASURED ON THE MACHINE THAT RUNS IT ═══════════════════════════════
   GET /api/ops/diag/profile?seconds=60 (operator, this computer only) records, for that many seconds and without stopping the server:
     cpu   a V8 CPU profile of the main thread (node:inspector, sampling every 1 ms) -> data/diag/cpu-<time>.cpuprofile
     gc    every garbage-collection pause (kind, duration) -> summary in data/diag/run-<time>.json
     loop  the event-loop delay histogram and the correction queue over the same seconds
   The summary names the 25 functions that held the thread longest (self time) and the time in garbage collection, so the slow
   steps on the laptop are read from the laptop rather than inferred from the cloud copy. One recording at a time; at most 300 s.
   GET /api/ops/diag/status returns the latest summary and the worker pool's counters.
   v91.17.236 · &heap=1 also records where the memory still held at the end was allocated during the recording (V8 sampling heap
   profiler, one sample per 64 KB): the 25 allocating functions and the 25 three-frame paths by bytes still alive, with the heap
   spaces, so the 900 MB heap seen on the laptop is attributed on the laptop. */
import { Session } from 'node:inspector';
import { PerformanceObserver, monitorEventLoopDelay } from 'node:perf_hooks';
import { mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { getHeapSpaceStatistics } from 'node:v8';
import { poolStatus } from './lgbpool.mjs';

export function createDiag(dataDir, extra = null) {
  const dir = join(dataDir, 'diag'); let running = null, last = null;
  const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
  function prune() { try { const f = readdirSync(dir).map((n) => ({ n, t: statSync(join(dir, n)).mtimeMs })).sort((a, b) => b.t - a.t); for (const x of f.slice(12)) unlinkSync(join(dir, x.n)); } catch (_) {} }
  function summarise(profile) {
    const nodes = new Map(profile.nodes.map((n) => [n.id, n])); const self = new Map(); let total = 0;
    for (let i = 0; i < profile.samples.length; i++) { const id = profile.samples[i], dt = profile.timeDeltas[i] || 0; total += dt;
      const cf = nodes.get(id).callFrame; const k = (cf.functionName || '(anonymous)') + ' ' + String(cf.url || '').split(/[\\/]/).pop() + ':' + (cf.lineNumber + 1);
      self.set(k, (self.get(k) || 0) + dt); }
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => ({ fn: k, ms: Math.round(v / 1000), share: total ? Math.round(1000 * v / total) / 10 : 0 }));
    return { sampledMs: Math.round(total / 1000), top };
  }
  function summariseHeap(hp) {
    const self = new Map(), path = new Map(); let total = 0;
    const walk = (n, stack) => { const cf = n.callFrame; const k = (cf.functionName || '(anonymous)') + ' ' + String(cf.url || '').split(/[\\/]/).pop() + ':' + (cf.lineNumber + 1);
      const st = [k, ...stack].slice(0, 3); if (n.selfSize) { total += n.selfSize; self.set(k, (self.get(k) || 0) + n.selfSize); const pk = st.join(' < '); path.set(pk, (path.get(pk) || 0) + n.selfSize); }
      for (const c of n.children || []) walk(c, st); };
    walk(hp.head, []);
    const mb = (v) => Math.round(v / 1048576 * 10) / 10;
    return { liveAllocatedMB: mb(total), top: [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([fn, v]) => ({ fn, mb: mb(v) })),
      paths: [...path.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([p, v]) => ({ path: p, mb: mb(v) })) };
  }
  function start(seconds, opt = {}) {
    if (running) return { started: false, why: 'a recording is already running', file: running.file };
    const s = Math.max(5, Math.min(300, Number(seconds) || 60)); mkdirSync(dir, { recursive: true });
    const id = stamp(), file = join(dir, 'cpu-' + id + '.cpuprofile'), sumFile = join(dir, 'run-' + id + '.json');
    const gc = []; const obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) gc.push({ kind: e.detail && e.detail.kind, ms: e.duration }); });
    try { obs.observe({ entryTypes: ['gc'] }); } catch (_) {}
    const loop = monitorEventLoopDelay({ resolution: 10 }); loop.enable();
    const sess = new Session(); sess.connect();
    running = { file, at: Date.now(), seconds: s };
    const post = (m, p) => new Promise((ok, no) => sess.post(m, p || {}, (e, r) => (e ? no(e) : ok(r))));
    (async () => {
      let summary = { at: new Date().toISOString(), seconds: s };
      try {
        if (opt.heap) { await post('HeapProfiler.enable'); await post('HeapProfiler.startSampling', { samplingInterval: 65536 }); }
        await post('Profiler.enable'); await post('Profiler.setSamplingInterval', { interval: 1000 }); await post('Profiler.start');
        await new Promise((r) => setTimeout(r, s * 1000));
        const { profile } = await post('Profiler.stop');
        let heap = null;
        if (opt.heap) { try { const { profile: hp } = await post('HeapProfiler.getSamplingProfile'); await post('HeapProfiler.stopSampling'); heap = summariseHeap(hp); } catch (e) { heap = { error: String(e && e.message || e) }; } }
        writeFileSync(file, JSON.stringify(profile));
        const g = gc.reduce((a, x) => { a.n++; a.ms += x.ms; a.max = Math.max(a.max, x.ms); if (x.ms > 100) a.over100++; return a; }, { n: 0, ms: 0, max: 0, over100: 0 });
        summary = { ...summary, file: 'data/diag/' + file.split(/[\\/]/).pop(), cpu: summarise(profile),
          gc: { pauses: g.n, totalMs: Math.round(g.ms), maxMs: Math.round(g.max), over100ms: g.over100 },
          loopDelayMs: { p50: Math.round(loop.percentile(50) / 1e6), p99: Math.round(loop.percentile(99) / 1e6), max: Math.round(loop.max / 1e6) },
          heap, heapSpaces: getHeapSpaceStatistics().map((x) => ({ space: x.space_name, usedMB: Math.round(x.space_used_size / 1048576) })),
          pool: poolStatus(), extra: (() => { try { return extra ? extra() : null; } catch (_) { return null; } })(), memory: Object.fromEntries(Object.entries(process.memoryUsage()).map(([k, v]) => [k, Math.round(v / 1048576) + ' MB'])) };
      } catch (e) { summary.error = String(e && e.message || e); }
      try { obs.disconnect(); } catch (_) {} try { loop.disable(); } catch (_) {} try { sess.disconnect(); } catch (_) {}
      try { writeFileSync(sumFile, JSON.stringify(summary, null, 1)); } catch (_) {}
      last = summary; running = null; prune();
    })();
    return { started: true, seconds: s, file: 'data/diag/' + file.split(/[\\/]/).pop(), summary: 'data/diag/' + sumFile.split(/[\\/]/).pop() };
  }
  return { start, status: () => ({ running: running ? { since: new Date(running.at).toISOString(), seconds: running.seconds } : null, last, pool: poolStatus() }) };
}
