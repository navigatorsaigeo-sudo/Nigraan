/* ══ v283.51g3 · ITEM 2 · BACKGROUND JOBS: ONE RUNNER WITH A TIME LIMIT FROM THE JOB'S OWN RECORD ══════════════════════════════════════
   Every background child process the server starts for a job (pyjobs.mjs, ensarchive.mjs, ecmwf010.mjs, agents.mjs, machdb.mjs,
   dropimport.mjs, copiesretention.mjs, sitechange.mjs) runs through runJob(). Before, each site had its own fixed cap and called
   ch.kill() on it: on Windows that ends only the process it started (the `py` launcher, not the python.exe under it; a node agent's own
   children), the job was marked ended at once although its process could still be running (a second copy could then start beside it),
   and nothing reached server.log but the bare child-exit line.
   Now, on overrun:
     · the whole process tree is ended (Windows: taskkill /PID <pid> /T /F; elsewhere the child leads its own process group: SIGTERM
       to the group, SIGKILL 5 s later);
     · the runner waits for the process to have exited (at most 15 s more) before it answers, so the job is never marked ended while
       its process still runs;
     · server.log gets "job-timeout <job> pid <pid> after <n> min (limit: <basis>) - process tree ended" (and "job-timeout-kill-failed"
       if the tree could not be ended);
     · the answer is { code: -2, timedOut: true }: every caller treats -2 as a failed run (its own status shows "stopped after <n>
       minutes"), so the success clock is not advanced and the job is retried on its next schedule (pyjobs.mjs: the next scheduler tick
       once the job's own period, at most 1 h, has passed since the failed start).
   THE LIMIT (limitFor): 3 x the job's normal duration, taken from its own runs in the operator machine's server.log (child spawn ->
   child-exit pairs with exit code 0, 31 Oct 19:39 UTC - 3 Nov 05:29 UTC 2026; "normal" = the longest such run, so a normal run is never
   cut), rounded up to whole minutes, at least 5 minutes (a slow disk or a cold Python start must not fail a job that normally takes
   seconds). A job with fewer than 3 successful runs in that log (no normal duration established), or one whose rare long mode is not in
   the log window (auto_retrain.py check runs the monthly retrain itself when it is due), keeps the cap it had. The table below is that
   measurement; NORMAL_SOURCE names it. */
import { spawn, execFile } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NORMAL_SOURCE = 'server.log of the operator machine, 31 Oct 2026 19:39 UTC - 3 Nov 2026 05:29 UTC: child spawn -> child-exit (code 0) pairs; longest run';
/* script (and mode) -> successful runs in that log, the longest and the median run in seconds */
export const JOB_NORMAL = {
  'append_lamha_ews.py': { n: 9, maxS: 63.9, medS: 54.5 }, 'auto_retrain.py check': { n: 65, maxS: 4.1, medS: 0.3, rareLong: 'the monthly retrain runs inside check when due; not in the log window' },
  'copies_retention.py': { n: 1, maxS: 0.1, medS: 0.1 }, 'diagnose.mjs': { n: 3, maxS: 41.2, medS: 32.6 }, 'drop_import.py': { n: 3, maxS: 64.2, medS: 53.4 },
  'ens_archive.py': { n: 222, maxS: 218.1, medS: 24.6 }, 'epd_daily_import.py': { n: 41, maxS: 1.8, medS: 0.3 }, 'ews_rain24.py': { n: 25, maxS: 8.6, medS: 3.2 },
  'ews_sync.py': { n: 101, maxS: 433.0, medS: 127.0 }, 'fc_archive_harvest.py --daily': { n: 3, maxS: 1997.4, medS: 1425.1 }, 'feed_health.mjs': { n: 338, maxS: 27.9, medS: 0.6 },
  'fetch_multimodel.py': { n: 2, maxS: 3109.6, medS: 3109.6 }, 'fetch_satrad.py': { n: 2, maxS: 79.5, medS: 79.5 }, 'flood_shadow.mjs': { n: 64, maxS: 6.2, medS: 0.2 },
  'ingest_ecmwf010.py': { n: 82, maxS: 653.3, medS: 1.6 }, 'irsa_sync.py': { n: 2, maxS: 3.2, medS: 3.2 }, 'isd_lite_sync.py': { n: 2, maxS: 147.0, medS: 147.0 },
  'lamha_copy.mjs': { n: 121, maxS: 26.2, medS: 3.0 }, 'mach_db_screen.py': { n: 15, maxS: 67.1, medS: 51.8 }, 'mach_db_sync.py': { n: 20, maxS: 537.7, medS: 297.6 },
  'mach_db_sync.py --live': { n: 333, maxS: 378.9, medS: 8.7 }, 'metar_sync.py': { n: 113, maxS: 21.2, medS: 1.7 }, 'model_scorecard.py': { n: 1, maxS: 0.4, medS: 0.4 },
  'radar_pull.py': { n: 9, maxS: 35.1, medS: 18.9 }, 'retrain_produce.py': { n: 2, maxS: 29.9, medS: 29.9 }, 's2site.py': { n: 1, maxS: 20.3, medS: 20.3 },
  'score_shadow.py': { n: 27, maxS: 17.0, medS: 10.6 }, 'verify.mjs': { n: 3, maxS: 47.9, medS: 39.7 }, 'wn3_live_import.py --live': { n: 6, maxS: 12.4, medS: 0.4 },
};
/* the JOB_NORMAL key of a script and its arguments: the modes the log separates (--live, --daily, check); --backfill (verify.mjs's
   30-day catch-up) is its own key, not in the log window, so it keeps its cap */
export function jobKeyOf(script, args = []) { const b = String(script).split(/[\\/]/).pop(); const a = (args || []).map(String);
  return b + (a.includes('--backfill') ? ' --backfill' : a.includes('--live') ? ' --live' : a.includes('--daily') ? ' --daily' : a[0] === 'check' ? ' check' : ''); }
export const FACTOR = 3, FLOOR_MIN = 5, MIN_RUNS = 3;
/* the time limit of a job in minutes and why: 3 x its normal (longest successful) run, at least FLOOR_MIN; else the cap it had */
export function limitFor(job, capMin) {
  const N = JOB_NORMAL[job];
  if (N && N.n >= MIN_RUNS && !N.rareLong) { const m = Math.max(FLOOR_MIN, Math.ceil(FACTOR * N.maxS / 60)); return { min: m, basis: FACTOR + ' x normal run ' + N.maxS + ' s (' + N.n + ' runs), at least ' + FLOOR_MIN + ' min' }; }
  return { min: capMin, basis: N && N.rareLong ? 'cap kept (' + N.rareLong + ')' : 'cap kept (' + (N ? N.n : 0) + ' successful runs in the log: no normal duration established)' };
}

/* server.log: server.mjs registers its logLine (setJobLog); without it (tests, a module used alone) the line goes to
   <NIGRAAN_DATA_DIR or the install's data>/server.log directly */
let LOG = null;
export function setJobLog(f) { LOG = typeof f === 'function' ? f : null; }
const LOG_FILE = () => join(process.env.NIGRAAN_DATA_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data'), 'server.log');
export function jobLog(...a) { if (LOG) { try { LOG(...a); return; } catch (_) {} }
  try { const f = LOG_FILE(); mkdirSync(dirname(f), { recursive: true }); appendFileSync(f, new Date().toISOString() + ' ' + a.map(String).join(' ') + '\n'); } catch (_) {} }

/* end a child and everything it started */
export function killTree(ch) {
  return new Promise((res) => {
    const pid = ch && ch.pid; if (!pid) return res(false);
    if (process.platform === 'win32') {
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 15000 }, (e) => { if (e) { try { ch.kill(); } catch (_) {} } res(!e); });
      return;
    }
    let ok = true; try { process.kill(-pid, 'SIGTERM'); } catch (_) { try { ch.kill('SIGTERM'); } catch (_) { ok = false; } }
    const t = setTimeout(() => { try { process.kill(-pid, 'SIGKILL'); } catch (_) { try { ch.kill('SIGKILL'); } catch (_) {} } }, 5000); t.unref?.();
    ch.once('exit', () => clearTimeout(t));
    res(ok);
  });
}

/* runJob(job, exe, args, opts): { code, out, timedOut, ms, limitMin }
     job       the key into JOB_NORMAL ('ews_sync.py', 'mach_db_sync.py --live', ...), also the name in server.log
     capMin    the cap used when the record gives no limit (limitFor)
     opts      spawn options (cwd, env, windowsHide); keepChars (default 6000) of stdout+stderr kept; onSpawn(ch) (priority etc.);
               keepStderr: false keeps only stdout in `out` (a job that answers JSON on stdout)
   code -1: the program could not be started (out ends with the error); code -2: stopped at the limit (out ends with "stopped after N minutes") */
export function runJob(job, exe, args, { capMin = 60, keepChars = 6000, onSpawn = null, limitMin = null, keepStderr = true, ...spawnOpts } = {}) {
  /* NIGRAAN_JOB_LIMIT_S (seconds) overrides every limit: the hanging-job test, or an operator who must stop jobs sooner */
  const ovr = Number(process.env.NIGRAAN_JOB_LIMIT_S);
  const L = ovr > 0 ? { min: ovr / 60, basis: 'NIGRAAN_JOB_LIMIT_S=' + ovr } : limitMin != null ? { min: limitMin, basis: 'set by the caller' } : limitFor(job, capMin);
  const t0 = Date.now(); const span = L.min >= 1 ? L.min + ' minutes' : Math.round(L.min * 60) + ' seconds';
  return new Promise((resolve) => {
    let out = '', done = false, timedOut = false, killed = false;
    const finish = (code, extra = '') => { if (done) return; done = true; clearTimeout(timer); clearTimeout(grace); resolve({ code, out: out + extra, timedOut, ms: Date.now() - t0, limitMin: L.min, basis: L.basis }); };
    let ch;
    try { ch = spawn(exe, args, { windowsHide: true, ...spawnOpts, ...(process.platform === 'win32' ? {} : { detached: true }) }); }
    catch (e) { return resolve({ code: -1, out: String(e && e.message), timedOut: false, ms: 0, limitMin: L.min, basis: L.basis }); }
    try { if (onSpawn) onSpawn(ch); } catch (_) {}
    const keep = (d) => { out = (out + d).slice(-keepChars); };
    if (ch.stdout) ch.stdout.on('data', keep); if (ch.stderr) { if (keepStderr) ch.stderr.on('data', keep); else ch.stderr.resume(); }
    let grace = null;
    const timer = setTimeout(async () => {
      timedOut = true; const pid = ch.pid;
      killed = await killTree(ch);
      jobLog(killed ? 'job-timeout' : 'job-timeout-kill-failed', job, 'pid', pid, 'after', span, '(limit: ' + L.basis + ')', killed ? '- process tree ended; the run counts as failed and is retried on its next schedule' : '- could not end it');
      /* answer once the process has exited; if it has not within 15 s, answer anyway (logged) */
      grace = setTimeout(() => { jobLog('job-timeout-still-running', job, 'pid', pid, '15 s after the kill'); finish(-2, '\nstopped after ' + span); }, 15000);
    }, L.min * 60e3);
    ch.on('error', (e) => finish(-1, '\n' + (e && e.message)));
    ch.on('close', (c) => { if (timedOut) finish(-2, '\nstopped after ' + span); else finish(c); });
  });
}
