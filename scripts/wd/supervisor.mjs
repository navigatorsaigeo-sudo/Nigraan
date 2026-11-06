/* ══ v91.17.269 · INFRA A6 · THE SUPERVISOR: FRONT PROXY + ONE ACTIVE SERVER + ZERO-DOWNTIME SWAP ════════════════════════════════
   Run by scripts\wd\watchdog_task.cmd (the scheduled task "NIGRAAN Server", S4U, no window) in place of `node server\server.mjs`.
   It keeps:
     - the front proxy, server\proxy.mjs, on 8787 (started once; restarted only if it stops by itself);
     - the active NIGRAAN server, server\server.mjs, on 8791 or 8792 (data\run\active.json names which); a crash is written to
       data\stops.log (with the same plain-words meaning the watchdog used) and the server is started again (15 s after a crash);
   and it carries out the requests that the admin scripts drop into data\run\ (no administrator rights needed: this process runs in the
   task's own logon session, so the processes it starts survive a sign-out and the processes it stops are its own):
     swap             start a new server on the free port, wait until its /health answers (warm), switch the proxy, retire the old
                      server (it hands the data folder over and drains), confirm the new one became the writer. Any failure before the
                      switch leaves the old server serving, untouched.
     proxy-restart    stop and start the proxy (the only step with a gap of about a second: for a change of proxy.mjs itself)
     supervisor-reload  exit with code 0; the watchdog starts the (new) supervisor at once, which adopts the running proxy and server
   Files (data\run\): supervisor.lock (pid, heartbeat), active.json, proxy-status.json (by the proxy), backends.json, request.json (in),
   result-<id>.json (out), supervisor.log (every action). Exit codes: 0 reload asked, 97 another supervisor runs, 98 port 8787 is held by
   a program that is not this proxy (the watchdog then stops, as it did for "another server already answers"). */
import { spawn, execFile } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, rmSync, appendFileSync, statSync, openSync, closeSync, copyFileSync, truncateSync, readdirSync, fsyncSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { join, resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import http from 'node:http';
import { pageEssential } from '../../server/api/pagecheck42.mjs';   /* r42 · 1.0.6: the page check that knows the React index (the server's warm-up uses the same) */

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DATA = process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data');
const RUN = join(DATA, 'run');
const PROXY_PORT = Number(process.env.NIGRAAN_PROXY_PORT || 8787);
const PORTS = String(process.env.NIGRAAN_BACKEND_PORTS || '8791,8792').split(',').map(Number);
const SERVER_JS = resolve(process.env.NIGRAAN_BACKEND_SCRIPT || join(ROOT, 'server', 'server.mjs'));
const PROXY_JS = resolve(process.env.NIGRAAN_PROXY_SCRIPT || join(ROOT, 'server', 'proxy.mjs'));
const TICK = Math.max(100, Number(process.env.NIGRAAN_SUP_TICK_MS) || 1000);
const READY_S = Math.max(5, Number(process.env.NIGRAAN_SWAP_READY_S) || 900);     /* the new server must be warm within 15 min */
const PROMOTE_S = Math.max(5, Number(process.env.NIGRAAN_SWAP_PROMOTE_S) || 180);
const CRASH_WAIT_S = Number(process.env.NIGRAAN_CRASH_WAIT_S ?? 15);
const WIN = process.platform === 'win32';
mkdirSync(RUN, { recursive: true });

const F = { lock: join(RUN, 'supervisor.lock'), active: join(RUN, 'active.json'), proxy: join(RUN, 'proxy-status.json'), backends: join(RUN, 'backends.json'),
  request: join(RUN, 'request.json'), log: join(RUN, 'supervisor.log'), stops: join(DATA, 'stops.log'),
  migrate: join(RUN, 'migrate.req'), migrateReady: join(RUN, 'migrate-ready.json'), migrateResult: join(RUN, 'migrate-result.json') };
const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); };
/* ══ v91.17.279 · OPS-15 · LOGS ARE ROTATED AND OLD CRASH FILES PRUNED ═════════════════════════════════════════════════════════════
   server-console.log and supervisor.log grew without limit. At start and then hourly: a log over NIGRAAN_LOG_ROTATE_MB (default 20 MB)
   is renamed <name>.1 (older ones shift to .2, .3; the oldest of 3 is moved to _admin\archive\logs, never deleted); crash-*.log
   files older than NIGRAAN_CRASH_KEEP_DAYS (default 14) are moved there too. A log held open by a running server (Windows) is
   copied and truncated instead of renamed. */
const ROT_MB = Math.max(1, Number(process.env.NIGRAAN_LOG_ROTATE_MB) || 20), ROT_KEEP = 3, CRASH_DAYS = Math.max(1, Number(process.env.NIGRAAN_CRASH_KEEP_DAYS) || 14);
const ARCH = process.env.NIGRAAN_LOG_ARCHIVE_DIR || join(ROOT, '..', '..', '_admin', 'archive', 'logs');
function archiveFile(f) { try { mkdirSync(ARCH, { recursive: true }); const to = join(ARCH, basename(f) + '.' + Date.now()); try { renameSync(f, to); } catch (_) { copyFileSync(f, to); rmSync(f, { force: true }); } return to; } catch (_) { return null; } }
function rotateLogs() {
  const out = { rotated: [], archived: [] };
  for (const f of [join(DATA, 'server-console.log'), F.log]) {
    try { if (!existsSync(f) || statSync(f).size < ROT_MB * 1e6) continue;
      if (existsSync(f + '.' + ROT_KEEP)) { const a = archiveFile(f + '.' + ROT_KEEP); if (a) out.archived.push(a); }
      for (let i = ROT_KEEP - 1; i >= 1; i--) if (existsSync(f + '.' + i)) renameSync(f + '.' + i, f + '.' + (i + 1));
      try { renameSync(f, f + '.1'); } catch (_) { copyFileSync(f, f + '.1'); truncateSync(f, 0); }
      out.rotated.push(f); } catch (e) { out.error = String(e && e.message); }
  }
  try { const cut = Date.now() - CRASH_DAYS * 86400e3;
    for (const n of readdirSync(DATA).filter((n) => /^crash-.*\.log$/.test(n))) { const p = join(DATA, n); if (statSync(p).mtimeMs < cut) { const a = archiveFile(p); if (a) out.archived.push(a); } } } catch (_) {}
  return out;
}
/* v91.17.283 · WS3 · the log line goes to data\run\supervisor.log; the console only when it is a terminal (or NIGRAAN_SUP_CONSOLE=1).
   Under the scheduled task stdout is the watchdog's cmd redirection: one native write path less at a resume from sleep (see below). */
const CONSOLE = !!(process.stdout && process.stdout.isTTY) || process.env.NIGRAAN_SUP_CONSOLE === '1';
function say(m) { const l = '[' + stamp() + '] supervisor: ' + m; if (CONSOLE) { try { console.log(l); } catch (_) {} } try { appendFileSync(F.log, l + '\n'); } catch (_) {} }
function stopLine(m) { try { appendFileSync(F.stops, '[' + stamp() + '] ' + m + '\n'); } catch (_) {} }
const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch (_) { return null; } };
/* v91.17.283 · WS3 · temp file fsynced before the rename (a power cut leaves the old or the new file, never an empty one) */
function writeJson(f, o) { const t = f + '.' + process.pid + '.tmp'; const fd = openSync(t, 'w'); try { writeFileSync(fd, JSON.stringify(o, null, 1)); fsyncSync(fd); } finally { closeSync(fd); } renameSync(t, f); }
const alive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const portOpen = (port, ms = 1500) => new Promise((res) => { const s = net.connect({ host: '127.0.0.1', port }); const t = setTimeout(() => { s.destroy(); res(false); }, ms);
  s.once('connect', () => { clearTimeout(t); s.destroy(); res(true); }); s.once('error', () => { clearTimeout(t); res(false); }); });
function getJson(port, path, ms = 5000) {
  return new Promise((res) => { const r = http.get({ host: '127.0.0.1', port, path, agent: false, timeout: ms, headers: { 'x-agn-internal': 'supervisor' } }, (x) => {
    const b = []; x.on('data', (c) => b.push(c)); x.on('end', () => { let j = null; try { j = JSON.parse(Buffer.concat(b).toString('utf8')); } catch (_) {} const buf = Buffer.concat(b); res({ status: x.statusCode, json: j, bytes: buf.length, body: buf, location: x.headers.location || null }); });
    x.on('error', () => res({ status: 0 })); }); r.on('timeout', () => { r.destroy(); }); r.on('error', () => res({ status: 0 })); });
}
/* the server is ready for customers: GET /api/health answers 200, it is not "starting", and it is the writer or a standby.
   WARM (PERF A2 adds {warm:true} to /api/health once models, caches and the past-30 files are loaded): when the server reports a warm
   flag, only warm:true counts (false, 0, "no" or {ok:false} wait); a server that has no warm flag at all (a build before A2) is judged
   by the rest, and the swap then also requires the page itself to be served (step 2). /health is asked when /api/health is 404. */
const warmOf = (j) => { if (!j || !('warm' in j)) return null; const w = j.warm; if (w && typeof w === 'object') return w.ok === true || w.ready === true || w.warm === true; return w === true || w === 1 || w === 'true' || w === 'yes'; };
const warmFailedOf = (h) => (h && h.json && h.json.status !== 'starting' && Array.isArray(h.json.warmFailed) && h.json.warmFailed.length) ? h.json.warmFailed : null;   /* v91.17.279 · OPS-06 */
const ready = (h) => h.status === 200 && !!h.json && h.json.status !== 'starting' && h.json.ready !== false && warmOf(h.json) !== false && (!h.json.role || h.json.role === 'standby' || h.json.role === 'active');
async function health(port, ms) { const h = await getJson(port, '/api/health', ms); return h.status === 404 ? getJson(port, '/health', ms) : h; }

/* plain-words meaning of an exit code (the watchdog's :why list) */
function why(code) {
  const m = { '1073807364': '0x40010004 - ended from outside without a signal, the code Windows uses at sign-out, shutdown or restart',
    '-1': 'killed by Stop-Process / .NET Kill - restart_nigraan.ps1 or another script', '4294967295': 'killed by Stop-Process / .NET Kill - restart_nigraan.ps1 or another script',
    '1': 'taskkill /F, or a Node fatal error printed to server-console.log', '0': 'clean exit', '98': 'port already in use by another server',
    '-1073741510': '0xC000013A - Ctrl+C or console closed', '3221225786': '0xC000013A - Ctrl+C or console closed', '-1073740791': '0xC0000409 - fail-fast, V8 fatal error or out of memory', '3221226505': '0xC0000409 - fail-fast, V8 fatal error or out of memory',
    '-1073741819': '0xC0000005 - access violation', '3221225477': '0xC0000005 - access violation', '-1073741571': '0xC00000FD - stack overflow', '-1073741801': '0xC0000017 - out of memory', '-1073741818': '0xC0000006 - in-page I/O error (a page of the program could not be read back from disk, usually on resume from sleep)', '3221225478': '0xC0000006 - in-page I/O error (a page of the program could not be read back from disk, usually on resume from sleep)',   /* v91.17.283.10: 23 Oct 09:28 PKT, server 8792 after the laptop slept */ '134': 'abort(): a Node/V8 fatal error' };
  return m[String(code)] || 'code not in the known list - see the crash file';
}
/* the watchdog's crash snapshot (its #PS-PART, NIG_MODE=snapshot), in the background, Windows only */
function snapshot(code) {
  if (inResumeWindow()) { say('crash snapshot skipped: the computer resumed from sleep ' + Math.round((Date.now() - RS.at) / 1000) + ' s ago (no PowerShell started while it settles)'); return; }   /* v91.17.283 · WS3 */
  const wd = join(ROOT, 'scripts', 'wd', 'watchdog_task.cmd'); if (!WIN || !existsSync(wd)) return;
  try { const ts = new Date().toISOString().replace(/[:.]/g, '-'), crash = join(DATA, 'crash-' + ts + '.log');
    const fd = openSync(crash, 'a'); writeFileSync(fd, 'NIGRAAN server stopped at ' + stamp() + ' - exit code ' + code + '\r\n');
    const ch = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', "$t=[IO.File]::ReadAllText($env:NIG_SELF); iex $t.Substring($t.IndexOf('#'+'PS-PART'))"],
      { env: { ...process.env, NIG_SELF: wd, NIG_MODE: 'snapshot', NIG_CODE: String(code), NIG_DATA: DATA }, stdio: ['ignore', fd, fd], windowsHide: true, detached: true });
    ch.unref(); closeSync(fd); say('crash snapshot: ' + crash); } catch (e) { say('crash snapshot failed: ' + e.message); }
}

/* ---- processes --------------------------------------------------------------------------------------------------------------- */
const P = { proxy: null, backends: new Map() };   /* proxy: {pid, child, adopted}; backends: port -> {pid, child, adopted, retired, startedAt} */
/* the console output of the proxy and the servers goes to data\server-console.log, opened here (Node opens files shared, so the next
   supervisor, the keepalive and a reader can still open it); never the handle this supervisor got from the watchdog's cmd: a cmd
   redirection is not shared for writing, and a server still holding it after a supervisor restart would block the next one */
function launch(script, env, what) {
  let fd = 'ignore'; try { fd = openSync(join(DATA, 'server-console.log'), 'a'); } catch (_) {}
  let ch; try { ch = spawn(process.execPath, [script], { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', fd, fd], windowsHide: true }); }
  finally { if (typeof fd === 'number') { try { closeSync(fd); } catch (_) {} } }
  say('started ' + what + ' (pid ' + ch.pid + ')');
  return ch;
}
function saveBackends() { const o = {}; for (const [p, b] of P.backends) o[p] = { pid: b.pid, startedAt: b.startedAt, retired: !!b.retired }; try { writeJson(F.backends, o); } catch (_) {} }
function killTree(pid) {
  return new Promise((res) => { if (!alive(pid)) return res(true);
    if (WIN) execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => res(!alive(pid)));
    else { try { process.kill(pid, 'SIGKILL'); } catch (_) {} setTimeout(() => res(!alive(pid)), 200); } });
}
async function waitGone(pid, ms) { const t0 = Date.now(); while (alive(pid) && Date.now() - t0 < ms) await sleep(200); return !alive(pid); }
let activePort = null, busy = false, proxyBusy = false, crashUntil = new Map(), quitting = false;

/* ══ v91.17.283 · WS3 · RESUME FROM SLEEP ══════════════════════════════════════════════════════════════════════════════════════════════
   Live laptop, stops.log 17-20 Oct: the supervisor ended with 0xC0000005 (access violation, a native crash) once or twice a day, each
   time the laptop came back from modern standby; the proxy and the server survived and the next supervisor adopted them, but on 20 Oct
   07:38 the server on 8792 crashed too. JavaScript cannot catch a native crash, so the supervisor now (1) notices the resume, (2) does
   less native work while the computer settles, and (3) checks its children itself instead of trusting events that may have been lost:
     - detect: a 1 s timer compares the wall clock with its last tick; a gap over NIGRAAN_RESUME_GAP_S (default 30 s) is a resume (or a
       stall as long; the same check is harmless then). Logged to supervisor.log and stops.log; data\run\supervisor-resume.json keeps
       the count and the last one;
     - settle: for NIGRAAN_RESUME_SETTLE_MS (default 3000) the main loop does nothing (no sockets, no process starts); no crash-snapshot
       PowerShell is started within the resume window (NIGRAAN_RESUME_GRACE_S, default 90 s); console writes are off under the task
       (say above), and the timers' file writes are all in try/catch;
     - re-check: every child is checked by its process id (an exit event lost in the sleep is not waited for): a dead proxy or server is
       forgotten so the loop starts it again at once on a free port (its stale lock and stop request are handled by the new process);
       a server whose process lives but whose /api/health does not answer within the grace window is stopped (taskkill /T /F) and
       started again; the proxy is re-checked the same way on its port. Nothing is touched while a deploy swap is in hand (busy). */
const RESUME_GAP_MS = Math.max(2000, Number(process.env.NIGRAAN_RESUME_GAP_S || 30) * 1000);
const RESUME_SETTLE_MS = Math.max(0, Number(process.env.NIGRAAN_RESUME_SETTLE_MS ?? 3000));
const RESUME_GRACE_MS = Math.max(2000, Number(process.env.NIGRAAN_RESUME_GRACE_S || 90) * 1000);
const RS = { at: 0, count: 0, last: null, rechecking: false };
const inResumeWindow = () => RS.at > 0 && Date.now() - RS.at < RESUME_GRACE_MS;
/* a detector over a clock: each call returns the gap (ms) when it is over gapMs, else null */
export function resumeDetector(gapMs = RESUME_GAP_MS, now = Date.now) { let last = now(); return () => { const t = now(), g = t - last; last = t; return g > gapMs ? g : null; }; }
function onResume(gapMs) {
  RS.at = Date.now(); RS.count++; RS.last = { at: new Date().toISOString(), gapS: Math.round(gapMs / 1000) };
  say('resume detected: the clock jumped ' + RS.last.gapS + ' s (sleep or a stall); settling ' + RESUME_SETTLE_MS + ' ms, then every child is checked');
  stopLine('supervisor: resume from sleep detected (' + RS.last.gapS + ' s gap); children re-checked');
  try { writeJson(join(RUN, 'supervisor-resume.json'), { count: RS.count, last: RS.last }); } catch (_) {}
  RS.pending = true;
}
/* after a resume: which children are gone, which hang (process alive, no answer within the grace window); dead ones are forgotten
   (the loop starts them again), hung ones are stopped and forgotten */
export async function recheckAfterResume(o = {}) {
  const graceMs = o.graceMs ?? RESUME_GRACE_MS, out = { dead: [], hung: [], ok: [] };
  const check = o.health || ((port) => health(port, 5000));
  if (P.proxy && P.proxy.pid && !alive(P.proxy.pid)) { out.dead.push('proxy pid ' + P.proxy.pid); P.proxy = null; }
  else if (P.proxy && P.proxy.pid) {
    const t0 = Date.now(); let up = false; while (!up && Date.now() - t0 < graceMs) { up = await portOpen(PROXY_PORT, 2000); if (!up) await sleep(1000); }
    if (!up && !busy && !proxyBusy) { out.hung.push('proxy pid ' + P.proxy.pid); P.proxy.stopping = true; const pid = P.proxy.pid; await killTree(pid); if (P.proxy && P.proxy.pid === pid) P.proxy = null; } else if (up) out.ok.push('proxy');
  }
  for (const [port, b] of [...P.backends]) {
    if (b.retired) continue;
    if (!alive(b.pid)) { out.dead.push('server on ' + port + ' pid ' + b.pid); if (P.backends.get(port) === b) { P.backends.delete(port); saveBackends(); } crashUntil.set(port, 0); continue; }
    const t0 = Date.now(); let h = null;
    while (Date.now() - t0 < graceMs) { h = await check(port); if (h && h.status === 200) break; if (!alive(b.pid)) break; await sleep(1000); }
    if (h && h.status === 200) { out.ok.push('server on ' + port); continue; }
    if (busy) { out.ok.push('server on ' + port + ' (not judged: a swap is in hand)'); continue; }
    if (!alive(b.pid)) { out.dead.push('server on ' + port + ' pid ' + b.pid); if (P.backends.get(port) === b) { P.backends.delete(port); saveBackends(); } crashUntil.set(port, 0); continue; }
    out.hung.push('server on ' + port + ' pid ' + b.pid); b.hungAfterResume = true;
    await killTree(b.pid);
    if (P.backends.get(port) === b) { P.backends.delete(port); saveBackends(); }
    crashUntil.set(port, 0);
  }
  return out;
}
{ const det = resumeDetector(); const t = setInterval(() => { try { const g = det(); if (g) onResume(g); } catch (_) {} }, 1000); if (t.unref) t.unref(); }
function activeFromFile() { const a = readJson(F.active); return a && PORTS.includes(Number(a.port)) ? a : null; }
function setActive(port, by) { const prev = readJson(F.active); const seq = (prev && Number(prev.seq) || 0) + 1; writeJson(F.active, { port, seq, at: new Date().toISOString(), by }); activePort = port; return seq; }

/* waitBindMs > 0: the new proxy loads now and binds the moment the port is free (proxy.mjs NIGRAAN_PROXY_WAIT_BIND_MS) */
function startProxy(waitBindMs = 0) {
  const ch = launch(PROXY_JS, { NIGRAAN_PROXY_PORT: String(PROXY_PORT), NIGRAAN_BACKEND_PORTS: PORTS.join(','), NIGRAAN_DATA_DIR: DATA, NIGRAAN_PROXY_WAIT_BIND_MS: String(waitBindMs || 0) }, 'front proxy on ' + PROXY_PORT + (waitBindMs ? ' (binds when the port is free)' : ''));
  const rec = { pid: ch.pid, child: ch, adopted: false, startedAt: new Date().toISOString(), exited: null };
  ch.on('exit', (code) => { rec.exited = { code }; if (P.proxy === rec) { P.proxy = null; if (!rec.stopping) { stopLine('front proxy stopped, exit code ' + code + ': ' + why(code)); say('front proxy exited (code ' + code + ')'); } } });
  P.proxy = rec;
  return rec;
}
const proxyBound = (rec) => { const ps = readJson(F.proxy); return !!(ps && rec && Number(ps.pid) === rec.pid); };
function startBackend(port, why2) {
  const ch = launch(SERVER_JS, { PORT: String(port), HOST: '127.0.0.1', NIGRAAN_WATCHDOG: '1', NIGRAAN_SUPERVISED: '1' }, 'NIGRAAN server on ' + port + ' (' + why2 + ')');
  const rec = { pid: ch.pid, child: ch, adopted: false, startedAt: new Date().toISOString(), retired: false, exited: null };
  ch.on('exit', (code, sig) => { rec.exited = { code: code == null ? sig : code, at: Date.now() }; onBackendExit(port, rec); });
  P.backends.set(port, rec); saveBackends();
  return rec;
}
function onBackendExit(port, rec) {
  if (P.backends.get(port) !== rec) return;
  P.backends.delete(port); saveBackends();
  const code = rec.exited ? rec.exited.code : 'unknown';
  if (rec.hungAfterResume) { stopLine('server on ' + port + ' stopped after the resume (it did not answer), exit code ' + (rec.exited ? rec.exited.code : '?')); say('server on ' + port + ' (hung after the resume) exited'); return; }
  if (rec.retired) { stopLine('server on ' + port + ' retired by a deploy (planned), exit code ' + code + ': ' + why(code)); say('retired server on ' + port + ' exited (code ' + code + ')'); return; }
  const planned = existsSync(join(DATA, 'planned-restart.flag'));
  stopLine('server on ' + port + ' stopped, exit code ' + code + ': ' + (planned ? 'planned restart' : why(code)));
  say('server on ' + port + ' exited (code ' + code + ')' + (port === activePort ? '' : ' - it was not the active one'));
  if (planned) { try { rmSync(join(DATA, 'planned-restart.flag'), { force: true }); } catch (_) {} }
  else if (String(code) !== '98' && port === activePort) snapshot(code);
  if (port === activePort) crashUntil.set(port, Date.now() + (planned ? 0 : (String(code) === '98' ? 60e3 : CRASH_WAIT_S * 1000)));
}
/* adopt what runs already (a supervisor restart or reload must not stop the proxy or the server) */
async function adopt() {
  const ps = readJson(F.proxy);
  if (await portOpen(PROXY_PORT)) {
    if (ps && alive(ps.pid) && Number(ps.port) === PROXY_PORT) { P.proxy = { pid: ps.pid, adopted: true }; say('adopted the running front proxy (pid ' + ps.pid + ')'); }
    else if (existsSync(F.migrate)) { say('port ' + PROXY_PORT + ' is held by the old-layout server and data\\run\\migrate.req is present: one-time migration'); return 'migrate'; }
    else { say('port ' + PROXY_PORT + ' is held by a program that is not the NIGRAAN proxy (an old-style server.mjs on ' + PROXY_PORT + '?) - exiting 98'); stopLine('supervisor: port ' + PROXY_PORT + ' is held by another program; nothing started'); return false; }
  }
  const bj = readJson(F.backends) || {};
  for (const p of PORTS) { const b = bj[p]; if (b && alive(b.pid) && await portOpen(p)) { P.backends.set(p, { pid: b.pid, adopted: true, startedAt: b.startedAt, retired: !!b.retired }); say('adopted the server on ' + p + ' (pid ' + b.pid + ')'); } }
  const a = activeFromFile(); activePort = a ? Number(a.port) : null;
  if (!activePort) { const up = [...P.backends.keys()].filter((p) => !P.backends.get(p).retired); activePort = up.length ? up[0] : PORTS[0]; setActive(activePort, 'supervisor start'); }
  /* a live server on the other port that is not draining: a swap that never switched (supervisor stopped mid-way). Retire it. */
  for (const [p, b] of P.backends) if (p !== activePort && !b.retired) { b.retired = true; try { writeFileSync(join(RUN, 'stop-' + p + '.req'), 'supervisor start: not the active server'); } catch (_) {} say('server on ' + p + ' is not the active one: asked it to stop'); }
  saveBackends();
  /* a request taken by a supervisor that stopped before answering it */
  for (const f of ['request.taken.json']) { const r = readJson(join(RUN, f)); if (r && r.id && !existsSync(join(RUN, 'result-' + r.id + '.json'))) result(r, false, 'aborted: the supervisor restarted while doing it; nothing was switched unless active.json says so', {}); try { rmSync(join(RUN, f), { force: true }); } catch (_) {} }
  return true;
}

/* ---- requests ---------------------------------------------------------------------------------------------------------------- */
function result(req, ok, msg, extra) {
  const r = { id: req.id, kind: req.kind, ok, message: msg, finishedAt: new Date().toISOString(), activePort, ...extra };
  try { writeJson(join(RUN, 'result-' + req.id + '.json'), r); } catch (_) {}
  say((ok ? 'DONE ' : 'FAILED ') + req.kind + ' ' + req.id + ': ' + msg);
}
const CUR = { id: null, phase: null };   /* v91.17.279 · OPS-02 · the request in hand, in supervisor.lock (beat) for the deploy script */
function progress(req, phase) { CUR.id = req.id; CUR.phase = phase; try { writeJson(join(RUN, 'progress-' + req.id + '.json'), { id: req.id, phase, at: new Date().toISOString() }); } catch (_) {} say(req.kind + ' ' + req.id + ': ' + phase); }

async function swap(req) {
  const t0 = Date.now(), T = {};
  const old = activePort, nu = PORTS.find((p) => p !== old);
  const oldRec = P.backends.get(old);
  progress(req, 'start: active server on ' + old + ', new server on ' + nu);
  /* the free port may still hold the server retired by the previous swap, draining */
  const prev = P.backends.get(nu);
  if (prev) { progress(req, 'waiting for the previous server on ' + nu + ' to finish draining'); await waitGone(prev.pid, 180e3); if (alive(prev.pid)) { await killTree(prev.pid); } if (P.backends.get(nu) === prev) { P.backends.delete(nu); saveBackends(); } }
  if (await portOpen(nu)) return result(req, false, 'port ' + nu + ' is held by another program; nothing was changed', {});
  const rec = startBackend(nu, 'deploy ' + req.id);
  /* 1 · warm */
  let h = { status: 0 };
  const abortF = join(RUN, 'abort-' + req.id + '.req');   /* v91.17.279 · OPS-02 · the deploy script can abort a swap that has not switched */
  const aborted = () => existsSync(abortF);
  while (Date.now() - t0 < READY_S * 1000) {
    if (rec.exited || aborted()) break;
    h = await health(nu, 10000); if (ready(h)) break;
    if (warmFailedOf(h)) break;   /* v91.17.279 · OPS-06 · the new server says its essentials failed: it will not become warm */
    await sleep(500);
  }
  T.readyMs = Date.now() - t0; T.warmFlag = h.json ? warmOf(h.json) : null;   /* true: the server said warm; null: it has no warm flag */
  const back = async (msg) => { rec.retired = true; try { writeFileSync(join(RUN, 'stop-' + nu + '.req'), 'deploy failed'); } catch (_) {} if (!(await waitGone(rec.pid, 30e3))) await killTree(rec.pid);
    return result(req, false, msg + '; the server on ' + old + ' kept serving, nothing was switched', { timings: T, switched: false, servingPort: old }); };
  if (aborted()) { try { rmSync(abortF, { force: true }); } catch (_) {} return back('aborted by the deploy script (' + abortF + ') before the switch'); }
  if (warmFailedOf(h)) return back('the new server is not ready: its essentials failed (' + warmFailedOf(h).join('; ').slice(0, 400) + ')');
  if (rec.exited) return back('the new server exited during start-up (code ' + rec.exited.code + ': ' + why(rec.exited.code) + '); see data\\server-console.log');
  if (!ready(h)) return back('the new server was not ready within ' + READY_S + ' s (last /api/health: ' + (h.status || 'no answer') + (h.json ? ', ' + (h.json.status || '') + ' ' + (h.json.role || '') + (warmOf(h.json) === false ? ' warm:false' : '') : '') + ')');
  /* 2 · the page itself */
  /* r42 · 1.0.6: classic pages > 1,000 bytes as before; the React index (about 900 bytes) passes only with its module script and files */
  const pg = await pageEssential((p, ms) => getJson(nu, p, ms), 60000);
  if (!pg.ok) return back('the new server did not serve the page (' + pg.why + ')');
  T.pageOkMs = Date.now() - t0;
  if (aborted()) { try { rmSync(abortF, { force: true }); } catch (_) {} return back('aborted by the deploy script (' + abortF + ') before the switch'); }
  /* 3 · switch */
  const seq = setActive(nu, 'deploy ' + req.id);
  let ps = null; for (let i = 0; i < 100; i++) { ps = readJson(F.proxy); if (ps && Number(ps.target) === nu && Number(ps.seq) === seq) break; await sleep(50); }
  if (!(ps && Number(ps.target) === nu)) { setActive(old, 'deploy ' + req.id + ' rolled back'); return back('the proxy did not confirm the switch within 5 s; switched back'); }
  T.switchedMs = Date.now() - t0;
  const via = await health(PROXY_PORT, 15000);
  if (!(via.status === 200 && via.json && Number(via.json.port || nu) === nu)) { setActive(old, 'deploy ' + req.id + ' rolled back'); await sleep(300); return back('/health through the proxy did not reach the new server (HTTP ' + via.status + '); switched back'); }
  /* 4 · retire the old server: it hands the data folder over, then drains */
  if (oldRec) { oldRec.retired = true; saveBackends(); try { writeFileSync(join(RUN, 'stop-' + old + '.req'), 'deploy ' + req.id); } catch (_) {} }
  progress(req, 'switched to ' + nu + '; the server on ' + old + ' hands over and drains');
  /* 5 · the new server becomes the writer */
  let role = null; while (Date.now() - t0 < (READY_S + PROMOTE_S) * 1000) { const x = await health(nu, 10000); role = x.json && x.json.role; if (role === 'active' || !role) break; if (rec.exited) break; await sleep(250); }
  T.writerMs = Date.now() - t0;
  const drainCap = (Number(process.env.NIGRAAN_DRAIN_S ?? 120) + 60) * 1000;
  if (oldRec) { const gone = await waitGone(oldRec.pid, drainCap); if (!gone) { say('the old server on ' + old + ' did not exit after draining; stopping it'); await killTree(oldRec.pid); } }
  T.oldGoneMs = Date.now() - t0;
  /* v91.17.279 · OPS-02 · a failure AFTER the switch has its own result: switched:true, servingPort = the new server. The new release is
     serving (the old server was retired), so the deploy script must not put the old files back under it; it reports exit 3. */
  if (role && role !== 'active') return result(req, false, 'switched to ' + nu + ', but it did not become the writer within ' + PROMOTE_S + ' s (role ' + role + '); it serves reads; see data\\server-console.log', { timings: T, newPort: nu, oldPort: old, switched: true, servingPort: nu, oldAlive: oldRec ? alive(oldRec.pid) : false });
  return result(req, true, 'NIGRAAN now runs on ' + nu + ' (pid ' + rec.pid + '); the server on ' + old + ' was retired; no request was refused by the swap', { timings: T, newPort: nu, newPid: rec.pid, oldPort: old, switched: true, servingPort: nu });
}
async function proxyRestart(req) {
  proxyBusy = true; try { return await proxyRestart2(req); } finally { proxyBusy = false; }
}
async function proxyRestart2(req) {
  const p = P.proxy, t0 = Date.now();
  /* the new proxy first: loaded and waiting to bind while the old one still listens; then the old one closes its port (it finishes
     what it carries) and the new one binds within ~5 ms. The gap is that moment, not a Node start. */
  const nu = startProxy(65e3), wf = join(RUN, 'proxy-waiting-' + nu.pid + '.json');
  for (let i = 0; i < 1000 && !existsSync(wf) && !nu.exited && !proxyBound(nu); i++) await sleep(10);
  const tStop = Date.now();
  if (p) { p.stopping = true; try { writeFileSync(join(RUN, 'stop-proxy-' + p.pid + '.req'), 'proxy-restart ' + req.id); } catch (_) {} }
  for (let i = 0; i < 1000 && !proxyBound(nu) && !nu.exited; i++) await sleep(5);
  if (!proxyBound(nu) && p && !nu.exited) { say('the old proxy did not close its port within 5 s; stopping it'); await killTree(p.pid); for (let i = 0; i < 400 && !proxyBound(nu) && !nu.exited; i++) await sleep(5); }
  const up = proxyBound(nu), switchMs = Date.now() - tStop;
  if (p) { waitGone(p.pid, 65e3).then((g) => { if (!g) killTree(p.pid); }); }
  return result(req, up, up ? 'front proxy restarted (pid ' + nu.pid + '): the new one bound the port ' + switchMs + ' ms after the old one was asked to close it' : 'the new front proxy did not bind (see data\\server-console.log); the supervisor starts one again', { gapMs: switchMs, totalMs: Date.now() - t0 });
}
async function takeRequest() {
  if (busy || !existsSync(F.request)) return;
  const taken = join(RUN, 'request.taken.json');
  try { renameSync(F.request, taken); } catch (_) { return; }
  const req = readJson(taken) || {}; if (!req.id) req.id = 'r' + Date.now(); req.kind = req.kind || 'swap';
  busy = true;
  try {
    say('request ' + req.id + ': ' + req.kind + (req.reason ? ' (' + req.reason + ')' : ''));
    if (req.kind === 'swap') await swap(req);
    else if (req.kind === 'proxy-restart') await proxyRestart(req);
    else if (req.kind === 'supervisor-reload') { result(req, true, 'the supervisor exits; the watchdog starts it again and it adopts the running proxy and server', {}); quitting = true; }
    else result(req, false, 'unknown request kind ' + req.kind, {});
  } catch (e) { result(req, false, 'error: ' + (e && e.stack || e), {}); }
  finally { busy = false; CUR.id = null; CUR.phase = null; try { rmSync(taken, { force: true }); } catch (_) {} if (quitting) { release(); process.exit(0); } }
}

/* ---- the one-time switch from the old layout (server.mjs itself on 8787), run by _admin\v269\MIGRATE_V269.ps1 -------------------
   The old server keeps serving on 8787 while the new server starts on 8791 (in standby: the old one holds the data folder). Once the new
   one is warm and serves the page, data\run\migrate-ready.json is written; MIGRATE_V269 then stops the old server, the new one takes
   the data folder over (holder gone) and this supervisor binds the proxy on 8787 the moment the port is free. The only gap is the time
   between the old process ending and the proxy listening: the proxy is already loaded and retries every 5 ms (test: Z0). If the new server never gets ready, it is
   stopped, migrate-result.json says why and the old server, never touched, keeps serving. */
async function migrateTakeover() {
  const t0 = Date.now(), port = PORTS[0], T = {};
  const done = (ok, msg) => { try { writeJson(F.migrateResult, { ok, message: msg, at: new Date().toISOString(), port, timings: T }); } catch (_) {} if (ok) { try { rmSync(F.migrate, { force: true }); } catch (_) {} } say((ok ? 'MIGRATED: ' : 'MIGRATION FAILED: ') + msg); return ok; };
  try { rmSync(F.migrateReady, { force: true }); rmSync(F.migrateResult, { force: true }); } catch (_) {}
  if (await portOpen(port)) return done(false, 'port ' + port + ' is held by another program; nothing was started');
  setActive(port, 'migration');
  const rec = startBackend(port, 'migration');
  let h = { status: 0 };
  while (Date.now() - t0 < READY_S * 1000) { if (rec.exited) break; h = await health(port, 10000); if (ready(h)) break; await sleep(500); }
  T.readyMs = Date.now() - t0; T.warmFlag = h.json ? warmOf(h.json) : null;
  const giveUp = async (msg) => { rec.retired = true; try { writeFileSync(join(RUN, 'stop-' + port + '.req'), 'migration failed'); } catch (_) {} if (!(await waitGone(rec.pid, 30e3))) await killTree(rec.pid); return done(false, msg + '; the old server on ' + PROXY_PORT + ' was not touched'); };
  if (rec.exited) return giveUp('the new server exited during start-up (code ' + rec.exited.code + ': ' + why(rec.exited.code) + ')');
  if (!ready(h)) return giveUp('the new server was not ready within ' + READY_S + ' s');
  const pg = await pageEssential((p, ms) => getJson(port, p, ms), 60000);   /* r42 · 1.0.6 */
  if (!pg.ok) return giveUp('the new server did not serve the page (' + pg.why + ')');
  T.pageOkMs = Date.now() - t0;
  writeJson(F.migrateReady, { port, pid: rec.pid, at: new Date().toISOString() });
  say('migration: the new server on ' + port + ' is warm (pid ' + rec.pid + '); waiting for the old server to leave port ' + PROXY_PORT);
  /* the proxy loads now and binds the moment MIGRATE_V269 has stopped the old server (retry every 5 ms) */
  const MIG_WAIT = Math.max(10, Number(process.env.NIGRAAN_MIGRATE_WAIT_S) || 600) * 1000;
  const px = startProxy(MIG_WAIT), tw = Date.now();
  while (!proxyBound(px)) {
    if (px.exited || Date.now() - tw > MIG_WAIT + 5000) { px.stopping = true; await killTree(px.pid); P.proxy = null; return giveUp(px.exited ? 'the front proxy exited (code ' + px.exited.code + ') before it could take port ' + PROXY_PORT : 'the old server still held port ' + PROXY_PORT + ' after ' + (MIG_WAIT / 1000) + ' s'); }
    if (rec.exited) { px.stopping = true; await killTree(px.pid); P.proxy = null; return giveUp('the new server exited while waiting'); }
    await sleep(20);
  }
  T.boundMs = Date.now() - t0;
  T.totalMs = Date.now() - t0;
  return done(true, 'the front proxy took port ' + PROXY_PORT + ' (pid ' + px.pid + ', ' + (T.boundMs - T.pageOkMs) + ' ms after the new server was ready) and forwards to the server on ' + port + ' (pid ' + rec.pid + ')');
}

/* ══ v91.17.283 · WS3 · A RESTART IN THE MIDDLE OF A DEPLOY: THE SERVER STARTS ON A COMPLETE BUILD ══════════════════════════════════
   deploy_swap.ps1 writes data\run\deploy-journal.json before its first copy (state copying, then copied, swapping, swapped) and the
   package's DEPLOY script marks it active after its live checks. A journal in any other state means a deploy did not finish. When the
   computer restarts (or every NIGRAAN process stopped) in the middle, the install may hold part of the new files. recoverDeploy() runs
   before the supervisor starts a server:
     - nothing running (a boot, or every server gone) and the deploy script not alive: every file of the journal is put back to its
       previous version (from its .b<ver>.bak copy, checked by sha256, written through a temp file and renamed); a file the deploy added
       is renamed <name>.v<ver>-rolled-back (never deleted). Each restored file is checked again. The journal becomes
       restored-by-supervisor with what was done, and the line goes to data\stops.log and supervisor.log;
     - a server still running: only a deploy that had not switched yet (copying, copied, swapping; active.json still names the port the
       journal started from) is put back, as deploy_swap.ps1 would have done; a deploy that switched is left for its ROLLBACK;
     - a deploy whose script is still running (its process alive, journal written since this computer started) is never touched.
   A file whose previous copy is missing or does not match is reported (state restore-incomplete) and the server is started anyway
   (serving with a reported problem is better than not serving); data\run\build-state.json says which build is on disk. Re-running the
   package's DEPLOY afterwards starts it again from the beginning (it is resumable). */
const sha256File = (f) => { try { return createHash('sha256').update(readFileSync(f)).digest('hex'); } catch (_) { return null; } };
export function recoverDeploy({ run = RUN, running = false, activePortNow = null, log = say, stop = stopLine, bootMs = Date.now() - os.uptime() * 1000 } = {}) {
  const jf = join(run, 'deploy-journal.json'); const j = readJson(jf);
  const write = (o) => { try { writeJson(jf, o); } catch (e) { log('deploy journal not updated: ' + e.message); } };
  const buildState = (o) => { try { writeJson(join(run, 'build-state.json'), { at: new Date().toISOString(), ...o }); } catch (_) {} };
  if (!j || !Array.isArray(j.files)) return { action: 'none', why: 'no deploy journal' };
  const st = String(j.state || '');
  if (!['planned', 'copying', 'copied', 'swapping', 'swapped'].includes(st)) { buildState({ version: j.full || j.version, state: st, complete: st === 'active' || st === 'rolledback' || st === 'restored-by-supervisor' }); return { action: 'none', why: 'journal state ' + st }; }
  const upd = Date.parse(j.updatedAt || j.startedAt || 0);
  const ownerAlive = [j.deployPid, j.swapPid].some((p) => Number(p) > 0 && Number(p) !== process.pid && alive(Number(p)));
  if (ownerAlive && Number.isFinite(upd) && upd > bootMs) { log('deploy v' + j.version + ' is still running (journal ' + st + ', process alive): nothing restored'); return { action: 'left', why: 'deploy still running' }; }
  if (running) {
    const switched = st === 'swapped' || (Number(j.port0) > 0 && activePortNow != null && Number(activePortNow) !== Number(j.port0));
    if (switched) { log('deploy v' + j.version + ' stopped after the switch (journal ' + st + '): the new release serves; files left for its ROLLBACK'); buildState({ version: j.full || j.version, state: 'switched-unverified', complete: true }); return { action: 'left', why: 'switched' }; }
  }
  const out = { restored: [], setAside: [], already: [], problems: [] };
  /* a swap request the interrupted deploy left waiting would swap again on files that are being put back: it is set aside */
  try { const rq = readJson(join(run, 'request.json')); if (rq && String(rq.id || '').startsWith('d' + j.version + '-')) { renameSync(join(run, 'request.json'), join(run, 'request.' + rq.id + '.abandoned.json')); out.requestSetAside = rq.id; } } catch (_) {}
  for (const x of j.files) {
    const dst = x.dst; if (!dst) continue;
    try {
      const cur = existsSync(dst) ? sha256File(dst) : null;
      if (!x.shaOld) {   /* a file the deploy added */
        if (cur == null) { out.already.push(x.rel); continue; }
        if (cur !== x.shaNew) { out.problems.push(x.rel + ': a file the deploy added was changed since; left in place'); continue; }
        let to = dst + '.v' + j.version + '-rolled-back'; if (existsSync(to)) to += '.' + Date.now();
        renameSync(dst, to); out.setAside.push(x.rel); continue;
      }
      if (cur === x.shaOld) { out.already.push(x.rel); continue; }
      if (!x.bak || !existsSync(x.bak)) { out.problems.push(x.rel + ': the previous copy ' + (x.bak || '(none)') + ' is missing'); continue; }
      if (sha256File(x.bak) !== x.shaOld) { out.problems.push(x.rel + ': the previous copy does not match its recorded sha256'); continue; }
      const t = join(dirname(dst), '.' + basename(dst) + '.' + process.pid + '.restore.tmp');
      copyFileSync(x.bak, t); { const fd = openSync(t, 'r+'); try { fsyncSync(fd); } finally { closeSync(fd); } } renameSync(t, dst);
      if (sha256File(dst) !== x.shaOld) out.problems.push(x.rel + ': restored, but the sha256 does not match'); else out.restored.push(x.rel);
    } catch (e) { out.problems.push(x.rel + ': ' + (e && e.message)); }
  }
  const state = out.problems.length ? 'restore-incomplete' : 'restored-by-supervisor';
  const msg = 'deploy v' + j.version + ' had not finished (journal ' + st + ', last written ' + (j.updatedAt || j.startedAt) + '): ' + out.restored.length + ' file(s) put back, ' + out.setAside.length + ' new file(s) set aside, ' + out.already.length + ' already the previous version' + (out.problems.length ? '; PROBLEMS: ' + out.problems.join('; ') : '') + '. Run the package DEPLOY again.';
  write({ ...j, state, updatedAt: new Date().toISOString(), restore: { at: new Date().toISOString(), from: st, running, ...out } });
  buildState({ version: j.port0 != null ? 'the build before ' + (j.full || j.version) : null, state, complete: !out.problems.length, problems: out.problems });
  log(msg); stop('supervisor: ' + msg);
  return { action: 'restored', state, ...out };
}

/* ---- main ---------------------------------------------------------------------------------------------------------------------- */
function release() { try { const o = readJson(F.lock); if (o && o.pid === process.pid) rmSync(F.lock, { force: true }); } catch (_) {} }
async function main() {
  const o = readJson(F.lock);
  if (o && o.pid !== process.pid && alive(o.pid) && Date.now() - Date.parse(o.at || 0) < 20e3) { console.log('[' + stamp() + '] supervisor: another supervisor runs (pid ' + o.pid + '); exiting 97'); process.exit(97); }
  const beat = () => { try { writeJson(F.lock, { pid: process.pid, at: new Date().toISOString(), activePort, busy, request: CUR.id, phase: CUR.phase }); } catch (_) {} };
  beat(); setInterval(beat, 5000);
  process.on('exit', release);
  { const r = rotateLogs(); if (r.rotated.length || r.archived.length) say('logs: rotated ' + r.rotated.length + ', archived ' + r.archived.length); }
  setInterval(() => { const r = rotateLogs(); if (r.rotated.length || r.archived.length) say('logs: rotated ' + r.rotated.length + ', archived ' + r.archived.length); }, 3600e3).unref();
  say('start (pid ' + process.pid + ', node ' + process.version + '): proxy ' + PROXY_PORT + ', servers ' + PORTS.join('/') + ', root ' + ROOT);
  const ad = await adopt();
  if (!ad) { release(); process.exit(98); }
  /* v91.17.283 · WS3 · a deploy that did not finish is put back before any server starts (see recoverDeploy) */
  try { const running = [...P.backends.values()].some((b) => !b.retired); const r = recoverDeploy({ running, activePortNow: activePort }); if (r.action !== 'none') say('deploy journal: ' + r.action + (r.why ? ' (' + r.why + ')' : '') + (r.state ? ', ' + r.state : '')); } catch (e) { say('deploy journal check failed: ' + (e && e.message)); }
  if (ad === 'migrate' && !(await migrateTakeover())) { release(); process.exit(98); }
  if (!P.proxy) startProxy();
  for (;;) {
    if (quitting) return;
    /* v91.17.283 · WS3 · resume from sleep: settle, then re-check every child once (in the background; the loop keeps running) */
    if (RS.at && Date.now() - RS.at < RESUME_SETTLE_MS) { await sleep(Math.min(TICK, RESUME_SETTLE_MS)); continue; }
    if (RS.pending && !RS.rechecking) { RS.pending = false; RS.rechecking = true;
      recheckAfterResume().then((r) => { say('after the resume: ' + (r.ok.length ? r.ok.join(', ') + ' answer' : 'nothing answered') + (r.dead.length ? '; gone (started again): ' + r.dead.join(', ') : '') + (r.hung.length ? '; not answering within ' + Math.round(RESUME_GRACE_MS / 1000) + ' s (stopped and started again): ' + r.hung.join(', ') : ''));
        if (r.dead.length || r.hung.length) stopLine('supervisor after resume: ' + [...r.dead.map((x) => x + ' was gone'), ...r.hung.map((x) => x + ' hung')].join('; ') + '; started again'); })
        .catch((e) => say('re-check after resume failed: ' + (e && e.message))).finally(() => { RS.rechecking = false; }); }
    /* the proxy */
    if (P.proxy && P.proxy.adopted && !alive(P.proxy.pid)) { stopLine('front proxy (adopted, pid ' + P.proxy.pid + ') is gone'); say('adopted proxy is gone'); P.proxy = null; }
    if (!P.proxy && !proxyBusy) { if (await portOpen(PROXY_PORT, 500)) { say('port ' + PROXY_PORT + ' taken by another program; retrying in 60 s'); await sleep(60e3); } else startProxy(); }
    /* the active server (also during a swap: until the switch the old one is the active one and is restarted if it stops) */
    if (activePort) {
      const b = P.backends.get(activePort);
      if (b && b.adopted && !alive(b.pid)) { P.backends.delete(activePort); saveBackends(); stopLine('server on ' + activePort + ' (adopted, pid ' + b.pid + ') is gone'); crashUntil.set(activePort, Date.now() + CRASH_WAIT_S * 1000); }
      if (!P.backends.get(activePort) && Date.now() >= (crashUntil.get(activePort) || 0)) {
        if (await portOpen(activePort, 500)) { say('port ' + activePort + ' is held by another program; retrying in 60 s'); crashUntil.set(activePort, Date.now() + 60e3); }
        else startBackend(activePort, 'start');
      }
    }
    /* retired servers that were adopted: forget them once gone */
    for (const [p, b] of P.backends) if (b.adopted && b.retired && !alive(b.pid)) { P.backends.delete(p); saveBackends(); stopLine('server on ' + p + ' retired (adopted, pid ' + b.pid + ') has exited'); }
    takeRequest();
    await sleep(TICK);
  }
}
/* ══ v91.17.283 · WS3 · A STOP OF THE SUPERVISOR STOPS ITS SERVERS CLEANLY, WAITED FOR, WITH A TIME LIMIT ═════════════════════════════
   On SIGINT / SIGTERM / SIGBREAK the supervisor used to exit at once: the servers it had started kept running unsupervised (or were
   killed with it, without their last write). Now it asks every server it runs to stop (data\run\stop-<port>.req: the server writes its
   database one last time, hands the lock back and exits) and the proxy to close, waits up to NIGRAAN_SUP_STOP_S (default 45 s), stops
   what is still running after that, then exits. A second signal exits at once. supervisor-reload (a deploy) is unchanged: it leaves
   the proxy and the servers running for the next supervisor to adopt. */
let stopping = false;
async function stopAll(sig) {
  if (stopping) { release(); process.exit(0); } stopping = true; quitting = true;
  const capMs = Math.max(1, Number(process.env.NIGRAAN_SUP_STOP_S) || 45) * 1000, t0 = Date.now();
  say(sig + ': stopping the servers (each writes its data and exits; at most ' + Math.round(capMs / 1000) + ' s)');
  const procs = [];
  for (const [p, b] of P.backends) { try { writeFileSync(join(RUN, 'stop-' + p + '.req'), 'supervisor stopping (' + sig + ')'); } catch (_) {} b.retired = true; procs.push({ what: 'server on ' + p, pid: b.pid }); }
  if (P.proxy && P.proxy.pid) { P.proxy.stopping = true; try { writeFileSync(join(RUN, 'stop-proxy-' + P.proxy.pid + '.req'), 'supervisor stopping (' + sig + ')'); } catch (_) {} procs.push({ what: 'front proxy', pid: P.proxy.pid, late: true }); }
  for (const x of procs.filter((x) => !x.late)) { const gone = await waitGone(x.pid, Math.max(0, capMs - (Date.now() - t0))); if (!gone) { say(x.what + ' (pid ' + x.pid + ') did not stop in time; stopping it'); await killTree(x.pid); } else say(x.what + ' stopped'); }
  for (const x of procs.filter((x) => x.late)) { const gone = await waitGone(x.pid, Math.min(5000, Math.max(0, capMs - (Date.now() - t0)))); if (!gone) await killTree(x.pid); }
  stopLine('supervisor stopped by ' + sig + ' after ' + Math.round((Date.now() - t0) / 1000) + ' s; servers asked to stop first');
  release(); process.exit(0);
}
process.on('uncaughtException', (e) => { try { say('fatal (uncaught): ' + (e && e.stack || e)); } catch (_) {} release(); process.exit(1); });   /* v91.17.283 · WS3 · the reason reaches supervisor.log */
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) { try { process.on(sig, () => { stopAll(sig).catch(() => { release(); process.exit(0); }); }); } catch (_) {} }
if (process.env.NIGRAAN_SUP_NO_MAIN !== '1') main().catch((e) => { say('fatal: ' + (e && e.stack || e)); release(); process.exit(1); });   /* NIGRAAN_SUP_NO_MAIN=1: imported by a test */
