/* ══ v91.17.178 · THE ENSEMBLE FORECAST ARCHIVE (ingestion only; nothing it saves is served) ══════════════════════════════════
   Every 15 minutes (v193; first check 5 minutes after start-up, through the scheduler since v270) this starts scripts/ens_archive.py (v272; station-lake's copy only as a fallback) as its own process, with the
   real Python (the same search the drop folder uses), and waits for it (60 min cap; one at a time). The script decides whether a
   new model run is out and saves it complete or not at all; it writes data/ens-archive.json, which the operations page shows.
   The server takes no part in the archiving beyond starting the script and relaying its requests through /px (where the paid key
   stays). NIGRAAN_ENS_ARCHIVE=0 stops it; NIGRAAN_ENS_RUNS (default "0"), NIGRAAN_ENS_CAP_GB (10) and NIGRAAN_ENS_BUDGET (20000
   provider-weighted calls a day) are read by the script. Nothing is ever deleted. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { schedule } from './scheduler.mjs';
import { runJob } from './jobrun.mjs';

export function createEnsArchive(app, root, dataDir) {
  /* v91.17.272 · OPS · NIGRAAN's own copy (nigraan-local/scripts/ens_archive.py: completeness, not wetness, decides; writes nig/archive/ens).
     station-lake's copy only if NIGRAAN's is missing (it then runs as before, from station-lake). */
  const own = join(root, 'scripts', 'ens_archive.py'), old = join(root, '..', 'station-lake', 'scripts', 'ens_archive.py');
  const pick = () => (existsSync(own) ? { script: own, cwd: root, which: 'nigraan' } : { script: old, cwd: join(root, '..', 'station-lake'), which: 'station-lake (fallback)' });
  const statusFile = join(dataDir, 'ens-archive.json');
  let lastScript = null; let busy = false, lastErr = null, lastStart = null, lastCode = null, py = null;
  const on = () => process.env.NIGRAAN_ENS_ARCHIVE !== '0';
  function python() {
    if (py) return py;
    const c = [];
    if (process.env.LOCALAPPDATA) c.push(join(process.env.LOCALAPPDATA, 'Python', 'bin', 'python.exe'));
    if (process.env.NIGRAAN_PYTHON) c.unshift(process.env.NIGRAAN_PYTHON);
    for (const p of c) if (existsSync(p)) return (py = p);
    return (py = process.platform === 'win32' ? 'py' : 'python3');
  }
  async function run() {
    const { script, cwd, which } = pick(); lastScript = which;
    if (!on() || busy || !existsSync(script)) return { started: false, busy, on: on() };
    busy = true; lastStart = new Date().toISOString();
    try {
      const exe = python(); const args = (exe === 'py' ? ['-3'] : []).concat([script, '--app', root]);
      /* v283.51g3 · item 2 · runJob (jobrun.mjs): limit 3 x the normal run, process tree ended on overrun, logged in server.log */
      const r = await runJob('ens_archive.py', exe, args, { capMin: 60, cwd, env: { ...process.env, NIGRAAN_PORT: String(process.env.PORT || 8787) } });
      lastCode = r.code;
      lastErr = r.code === -2 ? 'stopped after ' + r.limitMin + ' minutes' : r.code === -1 ? 'Python not found (' + r.out.trim().split('\n').pop() + '); SETUP_PYTHON.bat installs it' : r.code ? r.out.trim().split('\n').slice(-1)[0].slice(0, 200) : null;
      return { started: true, code: lastCode };
    } finally { busy = false; }
  }
  function status() {
    let s = null; try { s = JSON.parse(readFileSync(statusFile, 'utf8')); } catch { s = null; }
    /* v91.17.261 · newest: each model's newest saved run, its age and limit (the script's 'missed' test); the ops board turns stale on it */
    return { on: on(), script: lastScript || pick().which, busy, lastStart, lastCode, error: lastErr, state: s && s.state, sizeGB: s && s.sizeGB, last: s && s.last, config: s && s.config, days: s && s.days, newest: s && s.newest };
  }
  /* v91.17.193 · every 15 min (NIGRAAN_ENS_EVERY_MIN), not hourly: the provider serves the 00 UTC ECMWF ensemble on its own only
     between its arrival (about 12 UTC) and the 06 UTC run's (about 13-14 UTC); an hourly check missed that window on 6 Oct. A check
     with nothing new costs ~3 provider calls per model (metadata + one point). */
  const everyMin = Math.max(5, Number(process.env.NIGRAAN_ENS_EVERY_MIN) || 15);
  /* v91.17.270 · OPS · the first check (5 min after start) goes through the scheduler too, with firstMs. It was a bare setTimeout
     beside the scheduler: it ignored the standby/draining gate (a deploy's new server could start ens_archive.py before the hand-over,
     beside the old server's own child writing the same data/ens-archive.json) and took no bulk slot (it could run at the same time as
     the MACH record or the drop import). Same first time, same period, same script. */
  schedule(app, 'ensArchive', everyMin * 60 * 1000, () => run().then((r) => { if (r && Number.isInteger(r.code) && r.code !== 0 && r.code !== 5 && r.code !== 75) { lastErr = 'ensemble archive exited ' + r.code; throw new Error(lastErr); } return r; }).catch((e) => { lastErr = e.message; throw e; })   /* v283.23 self-audit J15: a non-zero exit is a failure the schedule shows */, { heavy: 'bulk', label: 'ensemble archive (Python)', firstMs: 5 * 60 * 1000 });
  return { run, status };
}
