/* ══ v91.17.231 · TREE EVALUATION OFF THE SERVER'S MAIN THREAD ══════════════════════════════════════════════════════════════════
   Why: the laptop log (9 Oct) showed the server unable to answer anything for 2-12 s at a time ("event loop blocked"), and a CPU
   profile of two page loads (cloud copy) put two thirds of the server's time in one place: evaluating the boosted trees of the
   national temperature model, the dew-point model and the weather MOS, about 200,000 feature rows per two page loads, 80 % of
   them distinct (a row cache would have saved 20 %). The work is real; it was in the wrong place.
   What: a small pool of worker threads, each holding its own flattened copy of the same tree files, evaluates whole batches of rows
   (one place's hours at a time). The correction chain hands a batch to the pool and the server answers other requests while the
   batch runs. Same arithmetic: the worker calls the same lgbEval on the same model file; a missing value travels as NaN, which
   lgbEval treats exactly as null. A batch is evaluated here, on the main thread, whenever the pool cannot answer it with the
   model version the caller holds (pool switched off, a worker failed, or a model file was replaced between the two reads).
   NIGRAAN_LGB_POOL=0 switches the pool off; NIGRAAN_LGB_THREADS sets its size (default: cores - 1, at most 4). */
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { readFileSync, statSync } from 'node:fs';
import { cpus } from 'node:os';
import { lgbEval } from './natmodel.mjs';

/* the model at path [k1, k2, ...] inside a JSON file */
const dig = (o, path) => path.reduce((a, k) => (a == null ? a : a[k]), o);

if (!isMainThread && parentPort) {
  /* worker: file -> { mtime, json } ; a model object stays the same object, so natmodel's flattening is kept per model */
  const files = new Map();
  const load = (file) => { const t = statSync(file).mtimeMs; let F = files.get(file); if (!F || F.mtime !== t) { F = { mtime: t, json: JSON.parse(readFileSync(file, 'utf8')) }; files.set(file, F); } return F; };
  parentPort.on('message', (m) => {
    const { id, file, path, version, X, n, k } = m;
    try {
      const F = load(file); const P = dig(F.json, path);
      const v = F.json && F.json.version;
      if (!P || (version != null && v !== version)) { parentPort.postMessage({ id, ok: false, why: 'model version differs' }); return; }
      const out = new Float64Array(n), x = new Array(k);
      for (let r = 0; r < n; r++) { const o = r * k; for (let j = 0; j < k; j++) x[j] = X[o + j]; out[r] = lgbEval(P, x); }
      parentPort.postMessage({ id, ok: true, out }, [out.buffer]);
    } catch (e) { parentPort.postMessage({ id, ok: false, why: String(e && e.message || e) }); }
  });
}

let POOL = null;
function pool() {
  if (POOL !== null) return POOL;
  if (process.env.NIGRAAN_LGB_POOL === '0' || !isMainThread) { POOL = false; return POOL; }
  try {
    const size = Math.max(1, Math.min(Number(process.env.NIGRAAN_LGB_THREADS) || Math.min(4, cpus().length - 1), 8));
    const ws = [];
    for (let i = 0; i < size; i++) {
      const w = new Worker(new URL(import.meta.url)); w.unref();
      const W = { w, busy: 0, dead: false, pend: new Map() };
      w.on('message', (r) => { const p = W.pend.get(r.id); if (!p) return; W.pend.delete(r.id); W.busy--; STAT.done++; p(r.ok ? r.out : null); if (!r.ok) STAT.declined++; bgNext(); });
      w.on('error', () => { W.dead = true; for (const p of W.pend.values()) p(null); W.pend.clear(); STAT.failed++; bgNext(); });
      w.on('exit', () => { W.dead = true; for (const p of W.pend.values()) p(null); W.pend.clear(); bgNext(); });
      ws.push(W);
    }
    POOL = { ws, seq: 0 };
  } catch (_) { POOL = false; }
  return POOL;
}
const STAT = { sent: 0, done: 0, declined: 0, failed: 0, rows: 0, local: 0, bgQueued: 0 };

/* rows: array of feature arrays (null / undefined = missing). spec: { file, path, version }. Resolves to an array of numbers, or null
   when the pool cannot answer (the caller then evaluates locally). Never rejects. */
export function evalBatch(spec, rows) {
  const P = pool(); if (!P || !rows.length) return null;
  const live = P.ws.filter((W) => !W.dead); if (!live.length) return null;
  const n = rows.length, k = rows[0].length, X = new Float64Array(n * k);
  for (let r = 0; r < n; r++) { const x = rows[r], o = r * k; for (let j = 0; j < k; j++) { const v = x[j]; X[o + j] = (v == null) ? NaN : v; } }
  /* v91.17.270 · OPS A13 · a batch of a BACKGROUND job (the national run: setBackground() is on while the queue steps such a job) goes to a
     worker only when one is idle; otherwise it waits here, and the next worker to finish takes it. A customer's batch is never queued
     behind more than the one background batch a worker may be evaluating. Same evaluation, same numbers (the wait is only an order). */
  if (BG.on) { const idle = live.find((W) => W.busy === 0); if (!idle) { STAT.bgQueued++; return new Promise((res) => BGQ.push({ spec, X, n, k, res })); } return send(idle, spec, X, n, k); }
  return send(live.reduce((a, b) => (b.busy < a.busy ? b : a)), spec, X, n, k);
}
function send(W, spec, X, n, k) {
  const P = POOL; const id = ++P.seq; W.busy++; STAT.sent++; STAT.rows += n;
  return new Promise((res) => { W.pend.set(id, res); try { W.w.postMessage({ id, file: spec.file, path: spec.path, version: spec.version ?? null, X, n, k }, [X.buffer]); } catch (_) { W.pend.delete(id); W.busy--; res(null); } });
}
const BG = { on: false }; const BGQ = [];
/* the correction queue (verification.mjs pump) says whether the job it is stepping is a background job */
export function setBackground(on) { BG.on = !!on; }
function bgNext() {
  if (!BGQ.length || !POOL) return;
  const live = POOL.ws.filter((W) => !W.dead);
  if (!live.length) { for (const q of BGQ.splice(0)) q.res(null); return; }   /* no worker left: the callers evaluate on this thread */
  for (const W of live) { if (!BGQ.length) break; if (W.busy === 0) { const q = BGQ.shift(); send(W, q.spec, q.X, q.n, q.k).then(q.res); } }
}
/* local evaluation of the same batch (the sync path and the fallback) */
export function evalLocal(P, rows) { STAT.local += rows.length; return rows.map((x) => lgbEval(P, x)); }
export function poolStatus() { const P = pool(); return { enabled: !!P, threads: P ? P.ws.filter((W) => !W.dead).length : 0, ...STAT }; }

/* run a correction generator to the end on this thread (no batch is handed to the pool: every step evaluates locally) */
export function drive(g) { let r = g.next(); while (!r.done) r = g.next(); return r.value; }
