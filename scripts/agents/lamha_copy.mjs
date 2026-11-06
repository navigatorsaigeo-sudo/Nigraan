/* == v91.17.283.7 . AGENT 3: THE LAMHA COPY JOB  ->  v91.17.283.28 . RETIRED: NIGRAAN IS INDEPENDENT OF LAMHA ======================
   Owner decision 28 Oct 2026 11:10 PKT: NIGRAAN must be fully independent of LAMHA, with no live data dependency. This job copied
   LAMHA's EWS hourly tables and radar NetCDF files into nig/data/from_lamha every 30 min; it copies NOTHING now:
     EWS     NIGRAAN fetches the readings itself (station-lake/scripts/ews_sync.py, mode own) into the own folder
             D:\NIGRAAN\nig\own\data\pmd\ews_live (server/api/ownpaths.mjs), with the same hourly tables
     radar   NIGRAAN pulls the frames itself (station-lake/scripts/radar_pull.py, every 6 h) into nig/own/data/radar
     history the one-time copy _admin\independence\COPY_HISTORY_ONCE.ps1 (D:\NIGRAAN\archive_hist\lamha); nig/data/from_lamha keeps
             what was copied before (nothing reads, moves or deletes it)
   What still runs under this name (the agents' schedule, server/api/agents.mjs, starts it every 30 min until its own update): the
   EWS hydrology QC summary (lamha_qc.py) on NIGRAAN's OWN hydrology table, so the Health page keeps its hydrology view; the state file
   (data/agents/lamha/state.json) says copied 0 and names the own store. --lamha and --dest are accepted and ignored (nothing under
   D:\LAMHA is opened). The retired copy code (allow-list, copyOnce) is in the deploy's REMOVED list (v91.17.283.28).
   pythonExe() / pyRun() stay exported: scripts/agents/verify.mjs runs its radar-point helper with them.
   usage (the server does this): node scripts/agents/lamha_copy.mjs --app <nigraan-local> --data <data dir> [--no-qc]   exit 0 done */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { args, readJson, writeJsonAtomic, takeLock, agentLog } from './lib.mjs';
import { ownDir } from '../../server/api/ownpaths.mjs';

export const RETIRED = 'retired v91.17.283.28: NIGRAAN fetches EWS and radar itself; nothing is copied from LAMHA';
/* the own EWS store's parent: lamha_qc.py reads <dest>/ews_live/ews_hydro_hourly.parquet */
export const ownPmd = (app) => join(ownDir(app), 'data', 'pmd');

export async function run(o) {
  const now = o.now || Date.now(); const dir = join(o.dataDir, 'agents', 'lamha'); const st = readJson(join(dir, 'state.json'), {}) || {};
  const dest = o.ownPmd || ownPmd(o.app); let qc = null;
  if (!o.noQc && existsSync(join(dest, 'ews_live', 'ews_hydro_hourly.parquet'))) qc = await pyRun(o, 'lamha_qc.py', ['--dest', resolve(dest), '--out', join(dir, 'ews_hydro_qc.json')], 10);
  const state = { at: new Date(now).toISOString(), retired: RETIRED, lamha: 'not read (independent)', ewsFrom: 'NIGRAAN own fetch, ' + join(dest, 'ews_live'), dest: null, copied: 0, bytes: 0, unchanged: 0, settling: [], changedWhileCopied: [], missing: [], errors: [], refused: [],
    seen: st.seen || {}, qc: qc ? { code: qc.code, tail: qc.out.trim().split('\n').slice(-2) } : (st.qc || null), runs: (st.runs || 0) + 1 };
  writeJsonAtomic(join(dir, 'state.json'), state);
  agentLog(o.dataDir, 'lamha-copy', 'retired: nothing copied from LAMHA (NIGRAAN fetches EWS and radar itself)' + (qc ? '; hydrology QC of the own store ' + (qc.code === 0 ? 'written' : 'not written (' + qc.code + ')') : ''), {}, now);
  return { copied: [], same: 0, missing: [], errors: [], refused: [], settling: [], unstable: [], state };
}
/* a Python helper of the agents (the ECMWF fetcher's interpreter search), lowest priority, its own time limit */
export function pythonExe() { const c = []; if (process.env.NIGRAAN_PYTHON) c.push(process.env.NIGRAAN_PYTHON); if (process.env.LOCALAPPDATA) c.push(join(process.env.LOCALAPPDATA, 'Python', 'bin', 'python.exe'));
  for (const p of c) if (existsSync(p)) return p; return process.platform === 'win32' ? 'py' : 'python3'; }
export async function pyRun(o, script, a, capMin) {
  const { spawn } = await import('node:child_process'); const OS = await import('node:os'); const exe = pythonExe(); const here = fileURLToPath(new URL('.', import.meta.url));
  const argv = (exe === 'py' ? ['-3'] : []).concat(['-I', join(here, script), ...a]);
  return await new Promise((res) => { let out = ''; let ch; try { ch = spawn(exe, argv, { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1' } }); } catch (e) { return res({ code: -1, out: e.message }); }
    try { if (ch.pid) OS.setPriority(ch.pid, OS.constants.priority.PRIORITY_LOW); } catch (_) {}
    const t = setTimeout(() => { try { ch.kill(); } catch (_) {} res({ code: -2, out: out + '\nstopped after ' + capMin + ' min' }); }, capMin * 60e3);
    const keep = (d) => { out = (out + d).slice(-20000); }; ch.stdout.on('data', keep); ch.stderr.on('data', keep);
    ch.on('error', (e) => { clearTimeout(t); res({ code: -1, out: out + '\nPython not found (' + e.message + ')' }); }); ch.on('close', (c) => { clearTimeout(t); res({ code: c, out }); }); });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const A = args(); const app = resolve(A.app || join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')); const dataDir = A.data || join(app, 'data');
  const rel = takeLock(join(dataDir, 'agents', 'lamha-copy.lock'), 25 * 60e3); if (!rel) { console.log('another run is going'); process.exit(5); }
  try { const r = await run({ app, dataDir, noQc: !!A['no-qc'] }); console.log('lamha-copy: ' + RETIRED + (r.state.qc ? '; hydrology QC code ' + r.state.qc.code : '')); }
  finally { rel(); }
}
