/* v91.17.279 · SAFE279 · a stand-in for server/server.mjs under the supervisor (NIGRAAN_BACKEND_SCRIPT) for the OPS-02/OPS-06 rehearsals.
   Mode files in <data>/run read at start: fake-cold (never warm), fake-warmfailed (warm:false + warmFailed), fake-noprom (a standby that
   never becomes the writer: the "fails after the switch" case). Lock and stop-<port>.req as the real server: a draining server releases
   the lock and exits. */
import http from 'node:http';
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const DATA = process.env.NIGRAAN_DATA_DIR, RUN = join(DATA, 'run'); mkdirSync(RUN, { recursive: true });
const PORT = Number(process.env.PORT), LOCK = join(DATA, '.store.lock'), STOP = join(RUN, 'stop-' + PORT + '.req');
try { rmSync(STOP, { force: true }); } catch (_) {}
const mode = (m) => existsSync(join(RUN, 'fake-' + m));
const COLD = mode('cold'), WFAIL = mode('warmfailed'), NOPROM = mode('noprom');
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const holder = () => { try { const o = JSON.parse(readFileSync(LOCK, 'utf8')); return o.pid !== process.pid && alive(o.pid) ? o : null; } catch (_) { return null; } };
let role = holder() ? 'standby' : 'active'; const take = () => writeFileSync(LOCK, JSON.stringify({ pid: process.pid, port: PORT, at: new Date().toISOString() }));
if (role === 'active') take();
setInterval(() => {
  if (role === 'standby' && !NOPROM && !holder()) { role = 'active'; take(); }
  if (existsSync(STOP) && role !== 'draining') { const was = role; role = 'draining'; try { const o = JSON.parse(readFileSync(LOCK, 'utf8')); if (o.pid === process.pid) rmSync(LOCK, { force: true }); } catch (_) {} setTimeout(() => process.exit(0), 300); }
}, 100);
const send = (res, code, obj) => { const b = Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)); res.writeHead(code, { 'content-type': typeof obj === 'string' ? 'text/html' : 'application/json', 'content-length': b.length }); res.end(b); };
http.createServer((req, res) => {
  const p = String(req.url).split('?')[0];
  if (p === '/health' || p === '/api/health') return send(res, 200, { status: WFAIL ? 'degraded' : 'ok', role, port: PORT, pid: process.pid, warm: !(COLD || WFAIL), warmFailed: WFAIL ? ['provider: no forecast provider key is configured'] : null });
  if (p === '/') return send(res, 200, '<html>' + 'x'.repeat(3000) + '</html>');
  send(res, 404, { error: 'not_found' });
}).listen(PORT, '127.0.0.1');
