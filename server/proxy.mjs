/* ══ v91.17.269 · INFRA A6 · THE FRONT PROXY (port 8787) ═════════════════════════════════════════════════════════════════════════
   The one process the browser, the tunnel and the scripts talk to. It forwards every request, unchanged, to the NIGRAAN server that is
   active now (8791 or 8792) and streams the answer back. A deploy starts the new server on the free port and, once it is warm, writes
   data/run/active.json; from the next request on, this proxy sends traffic there. The proxy itself is never restarted by a deploy.

   Deliberately small, and with no NIGRAAN logic:
     - no key, no secret, no provider host: it reads data/run/active.json and nothing else (NIGRAAN_DATA_DIR or ../data)
     - headers pass through untouched, including Host, and no X-Forwarded-*, Via or Forwarded header is added (v91.17.283: only the
       private mark x-agn-via-proxy: 1 is set, see reqHeaders): the server decides
       operator / customer exactly as before (a loopback peer, no proxy header), because the proxy's own peer is loopback as well
     - bodies are streamed both ways (no buffering), keep-alive on both sides
     - a request with no body (GET, HEAD, OPTIONS, DELETE without a body) whose connection to the server fails before any answer
       (refused, reset) is sent again, to the server active at that moment, for up to NIGRAAN_PROXY_RETRY_MS (default 15 s): a swap
       race, or a server being restarted by the supervisor, costs the browser a short wait, not an error
     - a request with a body is never sent twice; it goes over a new connection (no reuse race) and fails with 502 if the server is gone
     - an answer that breaks off half-way is cut off for the browser too (the socket is destroyed), never passed on as complete
   Status for the supervisor: data/run/proxy-status.json (pid, port, target, the active.json seq it applied). */
import http from 'node:http';
import net from 'node:net';
import { readFileSync, writeFileSync, renameSync, mkdirSync, watchFile, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const RUN = join(process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data'), 'run');
const PORT = Number(process.env.NIGRAAN_PROXY_PORT || 8787);
const BACKENDS = String(process.env.NIGRAAN_BACKEND_PORTS || '8791,8792').split(',').map(Number).filter((p) => p > 0 && p < 65536);
const RETRY_MS = Math.max(0, Number(process.env.NIGRAAN_PROXY_RETRY_MS ?? 15000));
const ACTIVE = join(RUN, 'active.json'), STATUS = join(RUN, 'proxy-status.json');
const HWM = 1 << 20;
mkdirSync(RUN, { recursive: true });

const say = (...a) => console.log('[' + new Date().toISOString() + '] proxy:', ...a);
let target = BACKENDS[0], seq = 0, switchedAt = null, bound = false;
function readActive() {
  try { const j = JSON.parse(readFileSync(ACTIVE, 'utf8')); const p = Number(j.port);
    if (BACKENDS.includes(p)) return { port: p, seq: Number(j.seq) || 0 };
    say('active.json names port ' + j.port + ', which is not one of ' + BACKENDS.join('/') + ': ignored'); } catch (_) {}
  return null;
}
function writeStatus() {
  if (!bound) return;   /* a proxy still waiting to bind must not overwrite the status of the one it replaces */
  const t = STATUS + '.' + process.pid + '.tmp';
  try { writeFileSync(t, JSON.stringify({ pid: process.pid, port: PORT, target, seq, switchedAt, startedAt: STARTED, backends: BACKENDS })); renameSync(t, STATUS); } catch (_) {}
}
function apply() {
  const a = readActive(); if (!a) return;
  if (a.port !== target || a.seq !== seq) { const was = target; target = a.port; seq = a.seq; switchedAt = new Date().toISOString(); if (was !== target) say('switched ' + was + ' -> ' + target + ' (seq ' + seq + ')'); }
  writeStatus();
}
const STARTED = new Date().toISOString();
apply();
watchFile(ACTIVE, { interval: 100 }, apply);   /* stat polling: works the same on every Windows file system */

/* keep-alive to the servers. A kept socket is dropped after 4 s idle, before the server's own 5 s keep-alive limit, so a request is
   not put on a socket the server is closing at that moment. */
const agents = new Map();
const agentFor = (p) => agents.get(p) || agents.set(p, new http.Agent({ keepAlive: true, maxSockets: Infinity, maxFreeSockets: 64, timeout: 4000 })).get(p);
const HOP = new Set(['connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'te', 'trailer', 'upgrade']);
/* v91.17.283 · WS1 · C-01 · every relayed request is marked x-agn-via-proxy: 1 (a client's own copy of the header is dropped first, and so is
   x-agn-internal-token, the server's internal-caller token, which no caller of this proxy needs). The server accepts engine reports only
   from an internal caller (server/api/index.mjs internalCaller), never through this proxy. The mark is not a forwarding header: the
   operator / customer decision on this machine is unchanged. */
const DROP = new Set(['x-agn-via-proxy', 'x-agn-internal-token', 'x-agn-proxy-client']);
/* v91.17.283 · INTEG (permanent S1b) · the proxy also says which address the request came from (x-agn-proxy-client; a client's own copy is
   dropped): a caller on the network that writes "Host: localhost" is then still not this computer */
const reqHeaders = (h, client) => { const o = {}; for (const k of Object.keys(h)) if (!HOP.has(k) && !DROP.has(k)) o[k] = h[k]; o['x-agn-via-proxy'] = '1'; o['x-agn-proxy-client'] = String(client || ''); return o; };
function resHeaders(raw) { const out = []; for (let i = 0; i < raw.length; i += 2) if (!HOP.has(String(raw[i]).toLowerCase())) out.push(raw[i], raw[i + 1]); return out; }
const hasBody = (req) => (req.headers['transfer-encoding'] != null) || (Number(req.headers['content-length'] || 0) > 0);

function forward(req, res, t0) {
  const port = target, body = hasBody(req);
  const up = http.request({ host: '127.0.0.1', port, method: req.method, path: req.url, headers: reqHeaders(req.headers, req.socket && req.socket.remoteAddress), agent: body ? false : agentFor(port), highWaterMark: HWM });
  let answered = false;
  up.on('response', (ur) => {
    answered = true;
    res.writeHead(ur.statusCode, ur.statusMessage, resHeaders(ur.rawHeaders));
    ur.pipe(res);
    ur.on('aborted', () => res.destroy());
    ur.on('error', () => res.destroy());
  });
  up.on('error', (e) => {
    if (answered || res.headersSent) { res.destroy(); return; }
    if (!body && !res.destroyed && Date.now() - t0 < RETRY_MS) { setTimeout(() => forward(req, res, t0), 100); return; }
    const b = Buffer.from(JSON.stringify({ error: 'server_unavailable', why: 'the NIGRAAN server did not answer (' + (e.code || e.message) + '); try again in a few seconds' }));
    try { res.writeHead(body ? 502 : 503, { 'content-type': 'application/json; charset=utf-8', 'content-length': b.length, 'retry-after': '5', 'cache-control': 'no-store' }); res.end(b); } catch (_) { res.destroy(); }
  });
  res.on('close', () => { if (!res.writableFinished) up.destroy(); });
  if (body) req.pipe(up); else up.end();
}

/* 1 MB stream buffers instead of 16 kB: the 2 MB page then passes in a few large writes, not ~130 pause/resume rounds
   (measured: +7.0 ms -> +4.2 ms for the gzip page; a small API answer gains ~0.25 ms either way) */
let stopping = false;
/* a proxy being replaced answers what still arrives on its open connections with "Connection: close", so each client opens its next
   connection to the new proxy instead of finding this one gone (no reset on a kept-alive connection) */
const handler = (req, res) => { if (stopping) res.shouldKeepAlive = false; forward(req, res, Date.now()); };
const servers = [];
const onClose = () => { if (bound && servers.every((s) => !s.listening)) { say('stopped'); process.exit(0); } };
function mk() { const s = http.createServer({ highWaterMark: HWM }, handler); s.keepAliveTimeout = 5000;   /* the same as the NIGRAAN server's (Node default) */
  s.on('clientError', (e, sock) => { try { sock.destroy(); } catch (_) {} }); return s; }
/* WAIT TO BIND (NIGRAAN_PROXY_WAIT_BIND_MS, set by the supervisor for a proxy restart and for the one-time switch): this process is
   started, loaded and ready while the port is still held by the program it replaces, and binds within ~5 ms of the port becoming free
   (retry every 5 ms), so the gap is not the ~0.3 s a Node start takes. data/run/proxy-waiting-<pid>.json says it waits. */
const WAIT_BIND_MS = Math.max(0, Number(process.env.NIGRAAN_PROXY_WAIT_BIND_MS) || 0), T_START = Date.now();
const WAITF = join(RUN, 'proxy-waiting-' + process.pid + '.json');
function bind(host, done) {   /* a fresh server object per attempt: a failed listen leaves no listener behind */
  let tries = 0;
  const go = () => { tries++; const s = mk();
    s.once('error', (e) => { if (e.code === 'EADDRINUSE' && Date.now() - T_START < WAIT_BIND_MS) { if (tries === 1) { say('port ' + PORT + ' (' + host + ') is still held: waiting to bind');
      try { writeFileSync(WAITF, JSON.stringify({ pid: process.pid, since: new Date().toISOString() })); } catch (_) {} } setTimeout(go, 5); } else done(e); });
    s.once('listening', () => { s.removeAllListeners('error'); s.on('error', (e) => say('listener ' + host + ': ' + (e.code || e.message))); s.on('close', onClose); servers.push(s); done(null, tries); });
    s.listen(PORT, host); };
  go();
}
const HOST4 = process.env.NIGRAAN_PROXY_HOST || '127.0.0.1';
bind(HOST4, (e, tries) => {
  if (e) { say('cannot listen on ' + PORT + ': ' + (e.code || e.message)); process.exit(e.code === 'EADDRINUSE' ? 98 : 1); }
  bound = true; try { rmSync(WAITF, { force: true }); } catch (_) {}
  say('listening on ' + HOST4 + ':' + PORT + ', forwarding to ' + target + ' (pid ' + process.pid + (tries > 1 ? ', bound after waiting ' + (Date.now() - T_START) + ' ms' : '') + ')'); writeStatus();
});
/* the same address the server answered on before (localhost can resolve to ::1 on Windows) */
if (!process.env.NIGRAAN_PROXY_HOST) bind('::1', (e) => { if (e) say('no ::1 listener (' + (e.code || e.message) + ')'); });
/* a new proxy (only when server/proxy.mjs itself changes): data/run/stop-proxy.req from the supervisor. This one stops listening at once,
   lets the answers in flight finish (at most 60 s), then exits; the supervisor binds the new proxy as soon as the port is free */
const STOPF = join(RUN, 'stop-proxy-' + process.pid + '.req');
const stopWatch = setInterval(() => { if (!bound || !existsSync(STOPF)) return; clearInterval(stopWatch); try { rmSync(STOPF, { force: true }); } catch (_) {}
  stopping = true;
  say('stopping: no new connections; the open ones get their answers with "Connection: close"');
  /* net.Server close: the port is released at once for the new proxy, but (unlike http.Server.close) idle kept-alive connections are not
     cut: a request a client is sending on one at this moment is answered, then that connection closes */
  for (const s of servers) { try { net.Server.prototype.close.call(s); } catch (_) {} }
  const t0 = Date.now(); const done = setInterval(() => { let open = 0; for (const s of servers) { try { s.getConnections((e, n) => { if (!e) open += n; }); } catch (_) {} }
    setTimeout(() => { if (open === 0 || Date.now() - t0 > 60000) { clearInterval(done); say('stopped (' + (open ? open + ' connections cut after 60 s' : 'every connection closed') + ')'); process.exit(0); }
      if (Date.now() - t0 > 6000) for (const s of servers) { try { s.closeIdleConnections(); } catch (_) {} } }, 50); }, 250);   /* after the clients' 5 s keep-alive, idle ones go */
}, 20);   /* 20 ms: the new proxy is already waiting to bind */
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) { try { process.on(sig, () => process.exit(0)); } catch (_) {} }
