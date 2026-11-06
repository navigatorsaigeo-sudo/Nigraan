// v91.17.283.2 - the ECMWF 0.1 deg fetcher cannot slow the live server: it runs as its own child process at the lowest CPU priority with
// numpy / BLAS on one thread, carries its own time limit inside the server's kill, refuses to run twice at once (lock, exit 5, also
// across a server restart) and takes over a stale lock; the scheduler stays in the bulk slot; serving stays OFF by default.
// usage: node scripts/tests2832/ecmwf_child.test.mjs     (no network: the real script is run with no cycles; a stub script reads its own priority)
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PYTHON } from '../lib/testenv.mjs';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + d : '')); } };
const T = mkdtempSync(join(tmpdir(), 'ecmwfchild-'));
try {
  const src = readFileSync(join(APP, 'server', 'api', 'ecmwf010.mjs'), 'utf8');
  ok(/heavy: 'bulk'/.test(src) && /firstMs: 7 \* 60e3/.test(src), 'scheduled in the bulk slot (one long job at a time), first start 7 min after the server');
  ok(/serveOn = \(\) => process\.env\.NIGRAAN_ECMWF010_SERVE === '1'/.test(src), 'serving is OFF unless NIGRAAN_ECMWF010_SERVE=1');
  ok(/'--max-minutes', '85'\], 90\)/.test(src), 'fetcher: own limit 85 min inside the server\'s 90-min kill');

  /* 1. a stub fetcher reports its own priority, thread settings and arguments */
  const root = join(T, 'app'); mkdirSync(join(root, 'scripts', 'ecmwf'), { recursive: true }); mkdirSync(join(root, 'data'), { recursive: true });
  writeFileSync(join(root, 'scripts', 'ecmwf', 'ingest_ecmwf010.py'), 'import os, sys, time\ntime.sleep(0.5)\nprint("NICE", os.nice(0) if hasattr(os, "nice") else "na", "OMP", os.environ.get("OMP_NUM_THREADS"), "ARGS", " ".join(sys.argv[1:]))\n');
  const prevPy = process.env.NIGRAAN_PYTHON; process.env.NIGRAAN_PYTHON = PYTHON;
  const { createEcmwf010 } = await import(pathToFileURL(join(APP, 'server', 'api', 'ecmwf010.mjs')).href);
  const E = createEcmwf010({}, root, join(root, 'data'), { schedule: false });
  const r = await E.run();
  const line = (E.status().tail || []).join(' ');
  if (process.platform !== 'win32') ok(/NICE 19/.test(line), 'child runs at the lowest CPU priority (nice 19; Windows: IDLE class)', line);
  ok(/OMP 1/.test(line), 'numpy / BLAS held to one thread', line);
  ok(/--max-minutes 85/.test(line), 'the fetcher is given its own time limit', line);
  ok(E.status().child && E.status().child.lowPriority === true, '/api/ecmwf010/status reports the child settings', JSON.stringify(E.status().child));
  ok(r && r.started && r.code === 0, 'the server is not blocked: run() returns when the child ends', JSON.stringify(r));
  if (prevPy === undefined) delete process.env.NIGRAAN_PYTHON; else process.env.NIGRAAN_PYTHON = prevPy;

  /* 2. the real fetcher: lock (exit 5), stale lock taken over, self time limit flag accepted (no cycles -> no network) */
  const out = join(T, 'out'); mkdirSync(out, { recursive: true }); const lock = join(out, 'fetch.lock');
  const go = () => spawnSync(PYTHON, [join(APP, 'scripts', 'ecmwf', 'ingest_ecmwf010.py'), '--app', APP, '--out', out, '--status', join(T, 'st.json'), '--cycles', ',', '--max-minutes', '85'], { encoding: 'utf8', timeout: 60000 });
  /* v91.17.283.30: the lock names a process that is still running (a lock of a finished process is taken over at once, below) */
  const holder = spawn(process.execPath, ['-e', 'setTimeout(()=>{}, 60000)'], { stdio: 'ignore' });
  writeFileSync(lock, holder.pid + ' now\n');
  const a = go(); ok(a.status === 5 && existsSync(lock), 'a second fetcher exits 5 and leaves the running one\'s lock alone', 'exit ' + a.status + ' ' + (a.stdout + a.stderr).slice(-160));
  holder.kill();
  writeFileSync(lock, '999999 now\n');
  const c = go(); ok(c.status !== 5 && !existsSync(lock), 'v283.30: a fresh lock of a process that no longer runs (killed by a deploy or sleep) is taken over at once', 'exit ' + c.status + ' ' + (c.stdout + c.stderr).slice(-200));
  writeFileSync(lock, holder.pid + ' now\n');
  const old = (Date.now() - 96 * 60e3) / 1000; utimesSync(lock, old, old);
  const b = go(); ok(b.status !== 5 && !existsSync(lock), 'a lock older than the limit + 10 min is taken over and released at the end', 'exit ' + b.status + ' ' + (b.stdout + b.stderr).slice(-200));
} finally { rmSync(T, { recursive: true, force: true }); }
console.log(`\nECMWF-CHILD ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
