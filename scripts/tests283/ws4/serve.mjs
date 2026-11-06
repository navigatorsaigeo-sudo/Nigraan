/* v91.17.283 · WS4 · test helper: starts <root>/server/server.mjs on a throw-away data folder with the forecast provider replaced by
   scripts/tests267/om_mock.mjs (no network; every other outbound host fails at once). The data folder holds copies of the tree's small
   data files and folders and a read-only link to the feature grid (data/feat), so the tree's own data is never written.
   Engine runner, schedulers, pollers and the AI provider are off: the server serves what data/ holds (engine-latest.json etc.).
   usage (module):  const S = await startServer(root, port); ... S.base ... ; S.stop()
   usage (cli):     node serve.mjs <root> <port>   (prints the base url, stops on SIGINT/SIGTERM) */
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, statSync, copyFileSync, symlinkSync, rmSync, writeFileSync, existsSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const COPY_MAX = 25 * 1024 * 1024;
const LINK_DIRS = new Set(['feat']);   /* read-only feature bands (142 MB): linked, never written by the server */   /* files above this are linked, never copied (read-only use) */

export async function startServer(root, port, extraEnv = {}, files = {}) {
  root = resolve(root);
  const DATA = mkdtempSync(join(tmpdir(), 'agn-ws4-'));
  for (const n of readdirSync(join(root, 'data'))) {
    if (/^crash-|\.log$|^engine-profile$|^backups$/.test(n)) continue;
    const s = join(root, 'data', n); let st; try { st = statSync(s); } catch (_) { continue; }
    /* only the large read-only feature grid is linked; every other folder (cache, archive, records ...) is copied, so a run never writes the tree */
    if (st.isDirectory()) { if (LINK_DIRS.has(n)) symlinkSync(s, join(DATA, n)); else cpSync(s, join(DATA, n), { recursive: true }); }
    else if (st.size > COPY_MAX) symlinkSync(s, join(DATA, n)); else copyFileSync(s, join(DATA, n));
  }
  for (const [n, body] of Object.entries(files || {})) { try { rmSync(join(DATA, n), { force: true }); } catch (_) {} writeFileSync(join(DATA, n), typeof body === 'string' ? body : JSON.stringify(body)); }
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', NIGRAAN_DATA_DIR: DATA, NIGRAAN_WORKER: '0', NIGRAAN_AUTO_SCHEDULE: '0', NIGRAAN_ENGINE: '0',
    NIGRAAN_PYJOBS: '0', NIGRAAN_SWEEP_WARM: '0', NIGRAAN_SYNOP: '0', NIGRAAN_MACH_DB_SYNC: '0', NIGRAAN_FLEET_BACKFILL: '0', NIGRAAN_VCARCHIVE: '0', NIGRAAN_WARM_MAX_S: '5',
    MACH_API_KEY: 'test-key-not-a-real-key', NIGRAAN_ALLOW_DEV_TOKEN: '1', NIGRAAN_RATE_PER_MIN: '100000', NIGRAAN_RATE_IP_PER_MIN: '100000', ...extraEnv };
  delete env.OPEN_METEO_API_KEY; delete env.NIGRAAN_INTERNAL_REF;
  let log = '';
  const child = spawn(process.execPath, [join(HERE, 'child.mjs'), root], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (d) => { log += d; if (log.length > 2e6) log = log.slice(-1e6); }); child.stderr.on('data', (d) => { log += d; });
  let stopped = false;
  const stop = () => { if (stopped) return; stopped = true; try { child.kill('SIGKILL'); } catch (_) {} try { rmSync(DATA, { recursive: true, force: true }); } catch (_) {} };
  process.on('exit', stop);
  const base = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 240; i++) {
    if (child.exitCode != null) { stop(); throw new Error('server exited: ' + log.slice(-3000)); }
    try { const r = await fetch(base + '/api/health'); if (r.status < 500) break; } catch (_) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return { base, stop, log: () => log, data: DATA };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const S = await startServer(process.argv[2] || join(HERE, '..', '..', '..'), Number(process.argv[3] || 9461));
  console.log(S.base);
  const end = () => { S.stop(); process.exit(0); }; process.on('SIGINT', end); process.on('SIGTERM', end);
  if (existsSync('/dev/null')) writeFileSync(join(S.data, '.ws4-test-run'), String(process.pid));
}
