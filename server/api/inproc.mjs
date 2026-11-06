/* ══ v91.17.283.51 · NIGRAAN 1.0.10.2 · IN-PROCESS REQUESTS (speed B2) ══════════════════════════════════════════════════════════════
   The place answer (placeanswer.mjs) used to read its seven parts through this server's own port (seven HTTP round trips on the same
   event loop, each one a socket, a parse and a re-serialisation under load). inject(path, headers) hands the SAME request to the SAME
   request listener the HTTP server uses, with a loopback peer and the given headers, and collects the answer the listener writes: every
   route rule, view rule and customer scrub runs exactly as for a socket request (the answer bytes are the same; test
   scripts/tests28351bug/inproc.test.mjs compares them with the HTTP answer for 50 places). Nothing is sent over the network.
   Only GET without a body is supported (what the place answer asks). */
import http from 'node:http';
import { EventEmitter } from 'node:events';

export function makeInject(listener, { port = 8787 } = {}) {
  if (typeof listener !== 'function') return null;
  return function inject(path, headers = {}, { ms = 60000 } = {}) {
    return new Promise((resolve) => {
      const sock = new EventEmitter();
      Object.assign(sock, { remoteAddress: '127.0.0.1', remotePort: 0, localAddress: '127.0.0.1', localPort: port, remoteFamily: 'IPv4', encrypted: false,
        readable: true, writable: true, destroyed: false, setTimeout() { return sock; }, setNoDelay() { return sock; }, setKeepAlive() { return sock; },
        ref() { return sock; }, unref() { return sock; }, destroy() { sock.destroyed = true; return sock; }, end() { return sock; }, write() { return true; }, cork() {}, uncork() {},
        address() { return { address: '127.0.0.1', family: 'IPv4', port }; } });
      const req = new http.IncomingMessage(sock);
      req.method = 'GET'; req.url = path; req.httpVersion = '1.1'; req.httpVersionMajor = 1; req.httpVersionMinor = 1;
      const hd = { host: 'localhost:' + port, 'accept-encoding': 'identity', ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)])) };
      req.headers = hd; req.rawHeaders = Object.entries(hd).flat();
      req.push(null); req.complete = true;
      const res = new http.ServerResponse(req);
      const chunks = []; let status = 200, head = null, done = false, finished = false;
      const finish = () => { if (done) return; done = true; clearTimeout(to);
        const body = Buffer.concat(chunks); let json = null; try { json = JSON.parse(body.toString('utf8')); } catch (_) { json = null; }
        resolve({ status, json, body, headers: head || res.getHeaders() }); };
      res.writeHead = function (code, a, b) { status = code; const h = (typeof a === 'string' ? b : a) || {};
        if (Array.isArray(h)) { for (let i = 0; i + 1 < h.length; i += 2) res.setHeader(h[i], h[i + 1]); } else for (const [k, v] of Object.entries(h)) if (v !== undefined) res.setHeader(k, v);
        head = res.getHeaders(); res.statusCode = code; res._header = 'inproc'; return res; };
      res.write = function (c, enc, cb) { if (!res._header) res.writeHead(res.statusCode || 200); if (c != null && typeof c !== 'function') chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c, typeof enc === 'string' ? enc : 'utf8')); if (typeof cb === 'function') cb(); else if (typeof enc === 'function') enc(); return true; };
      res.end = function (c, enc, cb) { if (finished) return res; if (!res._header) res.writeHead(res.statusCode || 200); if (c != null && typeof c !== 'function') chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c, typeof enc === 'string' ? enc : 'utf8'));
        finished = true; const f = [c, enc, cb].find((x) => typeof x === 'function'); setImmediate(() => { try { res.emit('prefinish'); res.emit('finish'); res.emit('close'); req.emit('close'); } catch (_) {} if (f) try { f(); } catch (_) {} finish(); }); return res; };
      Object.defineProperty(res, 'writableFinished', { get: () => finished, configurable: true });
      Object.defineProperty(res, 'writableEnded', { get: () => finished, configurable: true });
      Object.defineProperty(res, 'headersSent', { get: () => !!res._header, configurable: true });
      res.flushHeaders = () => {}; res.setTimeout = () => res;
      const to = setTimeout(() => { if (!done) { done = true; resolve({ status: 0, json: null, timeout: true }); } }, ms); to.unref?.();
      try { const r = listener(req, res); if (r && typeof r.catch === 'function') r.catch(() => { if (!finished) { status = 500; finish(); } }); } catch (_) { if (!finished) { status = 500; finish(); } }
    });
  };
}
