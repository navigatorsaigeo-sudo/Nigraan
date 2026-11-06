/* ══ v91.17.182 · THE MACH RECORD, COPIED FROM AGN'S OWN OBSERVATION DATABASE ═════════════════════════════════════════════════
   Every 6 hours (first run 3 minutes after start-up) this starts station-lake/scripts/mach_db_sync.py as its own process with the
   real Python (the same search the ensemble archive uses) and waits for it (60 min cap; one at a time). The script copies every
   database reading newer than the last one held into station-lake/archive/fleet/db/ (append only; the first run takes the whole
   record) and writes data/mach-db-sync.json, which the operations page shows. The live 10-minute poll is in fleet.mjs; this is the
   complete record behind it, kept for the siting screen, the running correction and training. Needs obs.key beside mach.key.
   NIGRAAN_MACH_DB_SYNC=0 stops it. Nothing is ever deleted.
   v91.17.283.28 · INDEPENDENCE FROM LAMHA (owner, 28 Oct 2026 11:10 PKT): the script no longer reads LAMHA's database sync or the data
   lake ("LAMHA FIRST" removed); NIGRAAN polls the database itself with its own key (obs.key). Two runs:
     machDbLive  every 10 min (first 2 min after start): mach_db_sync.py --live, ONE window request for all stations from the last synced
                 reading minus 2 h (LAMHA's method, ported) -> the own folder nig/own/data/mach/db (obs_YYYYMMDD.csv, last_sync.txt,
                 latest_status.json hourly, sync_log.txt) and the readings the record lacks -> archive/fleet/db/mach_db_YYYY-MM.csv.
                 1 request a run (2 when the hourly register /v1/latest is due). Slot 'sync'. 15 min cap.
     machDb      every 6 h as before: the station list (register stations.json), new stations' whole history, and the last 8 days asked
                 again (late readings). NIGRAAN_MACH_DB_LIVE=0 stops the 10-minute run only. Exit 75 = offline (not a failure). */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { schedule } from './scheduler.mjs';
import { runJob } from './jobrun.mjs';

export function createMachDbSync(app, root, dataDir) {
  const script = join(root, '..', 'station-lake', 'scripts', 'mach_db_sync.py');
  const statusFile = join(dataDir, 'mach-db-sync.json');
  let busy = false, lastErr = null, lastStart = null, lastCode = null, py = null, lastScreen = 0, screenCode = null, screenOut = null;
  const L = { busy: false, lastStart: null, lastCode: null, error: null, runs: 0 };   /* the 10-minute live run */
  const on = () => process.env.NIGRAAN_MACH_DB_SYNC !== '0' && existsSync(join(root, 'obs.key'));
  function python() {
    if (py) return py;
    const c = [];
    if (process.env.LOCALAPPDATA) c.push(join(process.env.LOCALAPPDATA, 'Python', 'bin', 'python.exe'));
    if (process.env.NIGRAAN_PYTHON) c.unshift(process.env.NIGRAAN_PYTHON);
    for (const p of c) if (existsSync(p)) return (py = p);
    return (py = process.platform === 'win32' ? 'py' : 'python3');
  }
  async function run() {
    if (!on() || busy || !existsSync(script)) return { started: false, busy, on: on() };
    busy = true; lastStart = new Date().toISOString();
    try {
      const exe = python(); const args = (exe === 'py' ? ['-3'] : []).concat([script, '--app', root]);
      /* v283.51g3 · item 2 · runJob (jobrun.mjs): limit 3 x the normal run, process tree ended on overrun, logged in server.log */
      { const r = await runJob('mach_db_sync.py', exe, args, { capMin: 60, cwd: join(root, '..', 'station-lake') }); lastCode = r.code;
        lastErr = r.code === -2 ? 'stopped after ' + r.limitMin + ' minutes' : r.code === -1 ? 'Python not found (' + r.out.trim().split('\n').pop() + '); SETUP_PYTHON.bat installs it' : r.code ? r.out.trim().split('\n').slice(-1)[0].slice(0, 200) : null; }
      /* once a day after a good copy: the siting screen re-run on the whole record (scripts/mach_db_screen.py rewrites
         data/mach-siting.json; fleet.mjs reads it again at its daily database backfill) */
      if (lastCode === 0 && Date.now() - lastScreen > 20 * 3600e3 && process.env.NIGRAAN_MACH_DB_SCREEN !== '0') {
        lastScreen = Date.now();
        { const r = await runJob('mach_db_screen.py', exe, (exe === 'py' ? ['-3'] : []).concat([join(root, 'scripts', 'mach_db_screen.py')]), { capMin: 30, cwd: root });
          screenCode = r.code; if (r.code !== -1) screenOut = r.out.trim().split('\n').slice(-2).join(' | ').slice(0, 400); }
      }
      return { started: true, code: lastCode };
    } finally { busy = false; }
  }
  /* v91.17.283.28 · the 10-minute live window (mach_db_sync.py --live); one at a time, never beside the 6-hourly run's own process */
  async function runLive() {
    if (!on() || process.env.NIGRAAN_MACH_DB_LIVE === '0' || L.busy || !existsSync(script)) return { started: false, busy: L.busy, on: on() };
    L.busy = true; L.lastStart = new Date().toISOString(); L.runs++;
    try {
      const exe = python(); const args = (exe === 'py' ? ['-3'] : []).concat([script, '--app', root, '--live']);
      /* v283.51g3 · item 2 · runJob (jobrun.mjs): limit 3 x the normal run, process tree ended on overrun, logged in server.log */
      { const r = await runJob('mach_db_sync.py --live', exe, args, { capMin: 15, keepChars: 4000, cwd: join(root, '..', 'station-lake') }); const c = r.code; L.lastCode = c; L.limitMin = r.limitMin;
        L.error = c === -2 ? 'stopped after ' + r.limitMin + ' minutes' : c === -1 ? 'Python not found (' + r.out.trim().split('\n').pop() + '); SETUP_PYTHON.bat installs it' : c && c !== 75 ? r.out.trim().split('\n').slice(-1)[0].slice(0, 200) : (c === 75 ? 'offline (next run retries)' : null); }
      return { started: true, code: L.lastCode };
    } finally { L.busy = false; }
  }
  function status() {
    let s = null; try { s = JSON.parse(readFileSync(statusFile, 'utf8')); } catch { s = null; }
    return { on: on(), busy, lastStart, lastCode, error: lastErr, live: { on: on() && process.env.NIGRAAN_MACH_DB_LIVE !== '0', ...L, ...((s && s.live) || {}) }, screen: lastScreen ? { at: new Date(lastScreen).toISOString(), code: screenCode, result: screenOut } : null, ...(s ? (({ live: _l, ...r }) => r)(s) : {}) };
  }
  schedule(app, 'machDb', 6 * 60 * 60 * 1000, () => run().then((r) => { if (r && Number.isInteger(r.code) && r.code !== 0 && r.code !== 5 && r.code !== 75) { lastErr = 'MACH database sync exited ' + r.code; throw new Error(lastErr); } return r; }).catch((e) => { lastErr = e.message; throw e; })   /* v283.23 self-audit J15: a non-zero exit is a failure the schedule shows */, { firstMs: 3 * 60 * 1000, heavy: 'sync', label: 'MACH database sync (Python)' }   /* v283.24 J8: its own sync slot pool (scheduler.mjs), no longer behind the Sunday bulk jobs */);
  schedule(app, 'machDbLive', 10 * 60 * 1000, () => runLive().then((r) => { if (r && Number.isInteger(r.code) && r.code !== 0 && r.code !== 75) throw new Error('MACH live window exited ' + r.code + ': ' + (L.error || '')); return r; }), { firstMs: 2 * 60 * 1000, heavy: 'sync', label: 'MACH database live window, NIGRAAN own key (Python)' });
  return { run, runLive, status };
}
