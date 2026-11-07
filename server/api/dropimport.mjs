/* ══ v91.17.92 · THE DROP FOLDER ════════════════════════════════════════════════════════════════════════════════════════════
   Files saved into  deploy\DROP_DATA_HERE  (beside RUN_NIGRAAN.bat) are loaded without anyone running a script:
     a PMD-EWS table export (.csv), a PMD-EWS stations export, or the daily river sheet (IRSA_Daily layout, .csv/.xlsx).
     v91.17.283.28 (independence from LAMHA): also a PMD official AWS portal export (AWS_Table_Export*.xlsx / .csv; Datetime, TA1, TA2,
     one sheet per station). drop_import.py converts it with LAMHA's aws_extend.py rules, ported (station-lake/scripts/aws_import.py:
     two sensors within 1.0 C, -10..55 C, >= 3 of 6 readings an hour, Hampel 25 h / 5 MAD, the register's exclusions; the archive
     wins on overlap) into station-lake/archive/pmd_aws, so a hand export lands in NIGRAAN with no LAMHA step. Internal only.
   Every 30 minutes (and 2 minutes after start-up) this looks at the folder; when it holds a file it starts
   station-lake/scripts/drop_import.py with the real Python (the same search LEARN_ALL.bat does) and waits for it
   (15 min cap). The script moves each file to _imported/<day>/ or _not_imported/ (with a .WHY.txt) and writes
   data/drop-import.json, which the operations page shows. Nothing is deleted. The folder is created if missing.
   When the river sheet brings a new day, the river outlook (app.riverOutlook, riveroutlook.mjs) re-reads it. */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { schedule } from './scheduler.mjs';
import { runJob } from './jobrun.mjs';

export function createDropImport(app, root, dataDir) {
  const folder = join(root, '..', 'DROP_DATA_HERE');
  const script = join(root, '..', 'station-lake', 'scripts', 'drop_import.py');
  const logFile = join(dataDir, 'drop-import.json');
  let busy = false, lastErr = null, lastRun = null, py = null;
  try { mkdirSync(folder, { recursive: true }); } catch (_) { /* read-only disk: status says so */ }

  function python() {
    if (py) return py;
    const c = [];
    if (process.env.LOCALAPPDATA) c.push(join(process.env.LOCALAPPDATA, 'Python', 'bin', 'python.exe'));
    if (process.env.NIGRAAN_PYTHON) c.unshift(process.env.NIGRAAN_PYTHON);
    for (const p of c) if (existsSync(p)) return (py = p);
    return (py = process.platform === 'win32' ? 'py' : 'python3');
  }
  const waiting = () => { try { return readdirSync(folder).filter((f) => { const p = join(folder, f); return !f.startsWith('.') && !f.startsWith('~$') && !/\.(txt|ini)$/i.test(f) && statSync(p).isFile(); }); } catch { return []; } };

  async function run() {
    if (busy) return { busy: true };
    const files = waiting(); lastRun = new Date().toISOString();
    if (!files.length || !existsSync(script)) return { files: 0 };
    busy = true;
    try {
      const exe = python(); const args = (exe === 'py' ? ['-3'] : []).concat([script, '--app', root, '--drop', folder]);
      /* v283.51g3 · item 2 · runJob (jobrun.mjs): limit 3 x the normal run, process tree ended on overrun, logged in server.log */
      const r = await runJob('drop_import.py', exe, args, { capMin: 15, cwd: join(root, '..', 'station-lake') }); const code = r.code;
      if (code === -1) lastErr = 'Python not found (' + r.out.trim().split('\n').pop() + '); SETUP_PYTHON.bat installs it';
      else if (code === -2) lastErr = 'stopped after ' + r.limitMin + ' minutes'; else if (code) lastErr = r.out.trim().split('\n').slice(-1)[0].slice(0, 200);
      if (code === 0) { lastErr = null; try { app.riverOutlook && app.riverOutlook.reload(); } catch (_) {} }
      return { files: files.length, code };
    } finally { busy = false; }
  }

  function status() {
    let log = null; try { log = JSON.parse(readFileSync(logFile, 'utf8')); } catch { log = null; }
    const last = log && log.runs && log.runs[0];
    return { folder, waiting: waiting().length, busy, lastCheck: lastRun, error: lastErr, last,
      imported: last ? last.files.filter((f) => f.ok).length : 0, rejected: last ? last.files.filter((f) => !f.ok).length : 0 };
  }

  schedule(app, 'dropImport', 30 * 60 * 1000, () => run().then((r) => { if (r && Number.isInteger(r.code) && r.code !== 0 && r.code !== 5 && r.code !== 75) { const why = lastErr && !/^drop folder import exited /.test(lastErr) ? lastErr : ('drop folder import exited ' + r.code); lastErr = why; throw new Error(why); } return r; }).catch((e) => { lastErr = e.message; throw e; })   /* v283.23 self-audit J15: a non-zero exit is a failure the schedule shows */, { firstMs: 2 * 60 * 1000, heavy: true, label: 'drop folder import (Python)' });
  return { run, status, folder };
}
