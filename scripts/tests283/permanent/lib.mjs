/* v91.17.283 · WS7 · shared helpers of the permanent checks (scripts/tests283/permanent/*.test.mjs).
   ownServer(): a NIGRAAN server of its own on a throw-away copy of data/ (os.tmpdir()), a free port, the in-tree mock provider
   (no network, no key; MOCK_CTL switches provider faults at run time), worker / engine / Python jobs / copies off. The copy never carries
   a secret file and is deleted by stop() (also on exit). Nothing here writes into the repo or beside it. */
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, rmSync, writeFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import http from 'node:http';
import * as T from '../../lib/testenv.mjs';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function counter(title) {
  let pass = 0, fail = 0, skip = 0;
  const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + String(d).slice(0, 300) : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' · ' + String(d).slice(0, 1500) : '')); } return !!c; };
  const note = (n, d = '') => { skip++; console.log('SKIP ' + n + (d ? ' · ' + String(d).slice(0, 300) : '')); };
  const done = () => { console.log('\n' + title + ': ' + pass + ' pass, ' + fail + ' fail' + (skip ? ', ' + skip + ' not checked' : '')); process.exitCode = fail ? 1 : 0; };
  return { ok, note, done, get fails() { return fail; } };
}

/** GET/POST with a time limit; never throws (status 0 + error on a network failure) */
export function req(base, path, { method = 'GET', headers = {}, body = null, timeoutMs = 120000, host = null } = {}) {
  const u = new URL(base + path);
  return new Promise((res) => {
    const t0 = Date.now();
    const r = http.request({ host: host || u.hostname, port: u.port, path: u.pathname + u.search, method, agent: false, timeout: timeoutMs,
      headers: { 'sec-fetch-site': 'same-origin', 'accept-encoding': 'identity', ...(body ? { 'content-type': 'application/json' } : {}), ...headers } }, (x) => {
      const b = []; x.on('data', (c) => b.push(c)); x.on('end', () => { const text = Buffer.concat(b).toString('utf8'); let json = null; try { json = JSON.parse(text); } catch (_) {}
        res({ status: x.statusCode, headers: x.headers, text, json, ms: Date.now() - t0 }); }); });
    r.on('error', (e) => res({ status: 0, error: e.message, text: '', json: null, headers: {}, ms: Date.now() - t0 }));
    r.on('timeout', () => { r.destroy(new Error('client timeout ' + timeoutMs + ' ms')); });
    if (body) r.end(typeof body === 'string' ? body : JSON.stringify(body)); else r.end();
  });
}

const SECRET = /(^|[\\/])(mach\.key|[^\\/]*\.key|\.env|secrets|token-secret|[^\\/]*\.pem)$/i;
/** a server of its own, on a throw-away COPY of this install (code and data: the server also writes beside its own folder, e.g.
    ../DROP_DATA_HERE, so it never runs from the live folder); opts.mode = initial mock provider mode; opts.env = extra env;
    opts.keepProviderCache = keep data/cache/provider */
export async function ownServer(opts = {}) {
  const tmp = T.tmpDir('nig-perm-'); const APP = join(tmp, 'nigraan-local'), DATA = join(APP, 'data'), CTL = join(tmp, 'mock-ctl.json'), LOG = join(tmp, 'mock-calls.jsonl');
  cpSync(T.ROOT, APP, { recursive: true, filter: (src) => { const rel = relative(T.ROOT, src); if (!rel) return true;
    if (SECRET.test(rel) || /^(node_modules|\.git|_admin|_ds2)([\\/]|$)/.test(rel)) return false;
    if (/^data[\\/](run|server\.log|nigraan-db\.json\.prev|\.store\.lock)$/.test(rel) || /^data[\\/]crash-.*\.log$/.test(rel)) return false;
    if (!opts.keepProviderCache && /^data[\\/]cache[\\/]provider([\\/]|$)/.test(rel)) return false; return true; } });
  mkdirSync(join(DATA, 'cache', 'provider'), { recursive: true });
  const setMode = (mode, paths) => writeFileSync(CTL, JSON.stringify({ mode: mode || 'ok', ...(paths ? { paths } : {}) }));
  setMode(opts.mode || 'ok', opts.paths);
  const port = await T.freePort(), base = 'http://127.0.0.1:' + port;
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', MACH_API_KEY: 'MOCK-NOT-A-KEY', MOCK_CTL: CTL, MOCK_LOG: LOG, NIGRAAN_COPY: '0', NIGRAAN_COPIES_DIR: join(tmp, 'copies'),
    NIGRAAN_PYJOBS: '0', NIGRAAN_ENGINE: '0', NIGRAAN_WORKER: '0', NIGRAAN_SWEEP_WARM: '0', NIGRAAN_CALL_BUDGET: 'off', ...(opts.env || {}) };
  delete env.OPEN_METEO_API_KEY; delete env.NIGRAAN_DATA_DIR;
  let log = '';
  const ch = spawn(process.execPath, ['--import', T.fileUrl(join(APP, 'scripts', 'tests283', 'lib', 'mockprovider.mjs')), join(APP, 'server', 'server.mjs')], { cwd: APP, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  ch.stdout.on('data', (c) => { log += c; if (log.length > 2e6) log = log.slice(-1e6); }); ch.stderr.on('data', (c) => { log += c; if (log.length > 2e6) log = log.slice(-1e6); });
  let stopped = false;
  const stop = async () => {
    if (stopped) return; stopped = true;
    const live = () => ch.exitCode === null && ch.signalCode === null;
    if (live()) { try { ch.kill('SIGINT'); } catch (_) {} for (let i = 0; i < 20 && live(); i++) await sleep(250);
      if (live()) { if (T.IS_WIN) spawnSync('taskkill', ['/PID', String(ch.pid), '/T', '/F'], { stdio: 'ignore' }); else try { ch.kill('SIGKILL'); } catch (_) {} } }
    for (let i = 0; i < 5; i++) { try { rmSync(tmp, { recursive: true, force: true }); break; } catch (_) { await sleep(500); } }
  };
  process.on('exit', () => { if (!stopped) { try { ch.kill('SIGKILL'); } catch (_) {} try { rmSync(tmp, { recursive: true, force: true }); } catch (_) {} } });
  let up = false;
  for (let i = 0; i < 300 && ch.exitCode === null && ch.signalCode === null; i++) { const h = await req(base, '/health', { timeoutMs: 3000 }); if (h.json && h.json.warm === true) { up = true; break; } await sleep(1000); }
  return { base, port, app: APP, data: DATA, tmp, setMode, stop, up, log: () => log, child: ch };
}

/** the provider-shaped hosts a response may never name */
export const PKT_TODAY = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
export const plusDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
export { T };

/** every GET /api/... route named in the server source (server.mjs + server/api/*.mjs), minus the ones that start work */
export function apiGetRoutes() {
  const files = ['server.mjs', ...readdirSync(T.repoPath('server', 'api')).filter((f) => f.endsWith('.mjs')).map((f) => join('api', f))];
  const SRC = files.map((f) => readFileSync(T.repoPath('server', f), 'utf8')).join('\n');
  const routes = new Set();
  for (const m of SRC.matchAll(/p === '(\/api\/[A-Za-z0-9/_-]+)'(?:\s*&&\s*req\.method === '([A-Z]+)')?/g)) if (!m[2] || m[2] === 'GET') routes.add(m[1]);
  const SIDE = /\/(run|poll|refresh|inject|backfill|drop|test-cleanup|issue|archive\/run|note)$/;
  return [...routes].filter((r) => !SIDE.test(r) && !r.endsWith('/')).sort();
}
export const SAMPLE_QUERY = 'lat=31.5204&lon=74.3587&unit=' + encodeURIComponent('Punjab|Lahore|Lahore City') + '&q=Lahore&layer=heat&day=0&location=Lahore&prompt=' + encodeURIComponent('Is it hot in Lahore today?');
/** run fn over items with a few in flight */
export async function pool(items, n, fn) { const q = items.slice(); await Promise.all(Array.from({ length: n }, async () => { while (q.length) await fn(q.shift()); })); }
