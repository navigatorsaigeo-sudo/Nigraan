/* v91.17.283 · WS7 · PERMANENT CHECK (d) · SECURITY OF WHAT IS SERVED.
   Runs its own server (permanent/lib.mjs ownServer: throw-away data copy, mock provider, nothing scheduled) and, for S1b, the real front
   proxy (server/proxy.mjs) in front of it.
   S1 the engine-report endpoints (POST /api/engine/report, and the two other loopback-only page records /api/shown/report and
      /api/selfcheck/report) refuse a call that came from outside this computer:
        a  straight to the server, from loopback, but carrying a relay header (X-Forwarded-For, Forwarded, CF-Connecting-IP, X-Real-IP:
           what a tunnel or a reverse proxy adds)
        b  through the front proxy listening on this computer's network address (not loopback), Host header localhost (so the host
           check is not what refuses it): the proxy's peer is loopback, so the server must learn the caller was not
      control: the same POST from loopback with no relay header is still accepted (not refused with 403), so S1 measures the rule
   S2 no served answer (pages, every GET /api/... route found in the server source with sample parameters, operator and customer view)
      carries a secret file name (mach.key, vc.key, weatherkit.key, token-secret, .env, secrets/), key material, the test key, or an
      absolute path of this install (the repo, the data folder, a drive path, /home/..., /tmp/..., /mnt/...), in its body or headers
   S3 every HTML page served (/, /analyst, /classic, /n3, /customize and each artefact/*.html) carries a Content-Security-Policy (header
      or meta) that names script-src or default-src, and no 'unsafe-eval'
   Expected to FAIL on base v91.17.282.1 in S1 (the loopback test cannot see a relayed caller) and probably S2; WS1 makes S1 pass.
   usage: node scripts/tests283/permanent/security.test.mjs   (no server argument; ~2-4 min) */
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { ownServer, req, counter, sleep, T, apiGetRoutes, SAMPLE_QUERY, pool } from './lib.mjs';

const C = counter('security');
const srv = await ownServer({ mode: 'ok' });
let proxy = null;
try {
  C.ok(srv.up, 'own server up (data copy, mock provider, nothing scheduled)', srv.up ? srv.base : srv.log().slice(-600));
  if (!srv.up) { C.done(); process.exit(); }
  const EPS = ['/api/engine/report', '/api/shown/report', '/api/selfcheck/report'];
  const PROBE = { probe: 'ws7-security', days: [] };   /* no days: refused as a bad body if it ever got through, never stored */
  /* control */
  for (const ep of EPS) { const r = await req(srv.base, ep, { method: 'POST', body: PROBE });
    C.ok(r.status !== 403 && r.status > 0, 'S1 control ' + ep + ': a loopback POST with no relay header is not refused (' + r.status + ')', r.text.slice(0, 160)); }
  /* a · relay headers */
  const RELAY = [['x-forwarded-for', '203.0.113.9'], ['forwarded', 'for=203.0.113.9;proto=https'], ['cf-connecting-ip', '203.0.113.9'], ['x-real-ip', '203.0.113.9']];
  for (const ep of EPS) for (const [h, v] of RELAY) { const r = await req(srv.base, ep, { method: 'POST', body: PROBE, headers: { [h]: v } });
    C.ok(r.status === 403, 'S1a ' + ep + ' with ' + h + ': refused (403)', r.status + ' ' + r.text.slice(0, 160)); }
  /* b · through the front proxy on the network address */
  const ip = Object.values(networkInterfaces()).flat().find((a) => a && a.family === 'IPv4' && !a.internal);
  if (!ip) C.note('S1b no non-loopback IPv4 address on this computer; the proxy path is not checked here');
  else {
    const pport = await T.freePort();
    proxy = spawn(process.execPath, [join(srv.app, 'server', 'proxy.mjs')], { cwd: srv.app, env: { ...process.env, NIGRAAN_DATA_DIR: srv.data, NIGRAAN_PROXY_PORT: String(pport), NIGRAAN_PROXY_HOST: ip.address, NIGRAAN_BACKEND_PORTS: String(srv.port) }, stdio: 'ignore', windowsHide: true });
    const pbase = 'http://' + ip.address + ':' + pport; let up = false;
    for (let i = 0; i < 40 && !up; i++) { const r = await req(pbase, '/health', { timeoutMs: 3000, headers: { host: 'localhost:' + pport } }); up = r.status === 200; if (!up) await sleep(250); }
    if (C.ok(up, 'S1b front proxy up on ' + ip.address + ':' + pport + ' -> server ' + srv.port)) {
      for (const ep of EPS) { const r = await req(pbase, ep, { method: 'POST', body: PROBE, headers: { host: 'localhost:' + pport } });
        C.ok(r.status === 403, 'S1b ' + ep + ' from ' + ip.address + ' through the front proxy: refused (403)', r.status + ' ' + r.text.slice(0, 160)); }
    }
  }

  /* S2 · secrets and paths in served answers */
  const list = ['/', '/analyst', '/classic', '/n3', '/customize', '/health', '/api/manifest', ...apiGetRoutes().map((r) => r + '?' + SAMPLE_QUERY)];
  const roots = [T.ROOT, srv.app, srv.data, srv.tmp].map((p) => p.replace(/[\\/]+$/, '')).filter((p) => p.length > 3);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const FORBID = new RegExp(['mach\\.key', 'vc\\.key', 'weatherkit\\.key', 'token-secret', '(?<![\\w.])\\.env\\b', 'secrets[\\\\/]', 'BEGIN [A-Z ]*PRIVATE KEY', 'MOCK-NOT-A-KEY',
    '/home/[a-z]', '/tmp/', '/mnt/user-data', '\\b[A-Z]:\\\\(?:NIGRAAN|Users|LAMHA)', ...roots.flatMap((p) => [esc(p), esc(p.replace(/\\/g, '/')), esc(p.replace(/\\/g, '\\\\'))])].join('|'), 'i');
  const hits = []; let n = 0;
  const one = async (path, cust) => { const r = await req(srv.base, path, { headers: cust ? { 'x-agn-view': 'customer' } : {}, timeoutMs: 60000 }); n++;
    const blob = JSON.stringify(r.headers) + '\n' + (r.text || ''); const m = blob.match(FORBID);
    if (m) { const i = blob.indexOf(m[0]); hits.push((cust ? '[customer] ' : '[operator] ') + path.split('?')[0] + ' ' + r.status + ': "' + blob.slice(Math.max(0, i - 60), i + 60).replace(/\s+/g, ' ') + '"'); } };
  const queue = list.flatMap((p) => [[p, false], [p, true]]);
  await pool(queue, 4, ([p, c]) => one(p, c));
  C.ok(!hits.length, 'S2 no secret file name, key or install path in ' + n + ' served answers (' + list.length + ' paths x 2 views)', hits.slice(0, 15).join(' | '));

  /* S3 · CSP on every page */
  const pages = ['/', '/analyst', '/classic', '/n3', '/customize', ...readdirSync(T.repoPath('artefact')).filter((f) => /\.html?$/i.test(f)).map((f) => '/' + encodeURIComponent(f))];
  for (const p0 of pages) { let p = p0, r = await req(srv.base, p, { timeoutMs: 60000 });
    for (let k = 0; k < 3 && r.status >= 300 && r.status < 400 && r.headers.location; k++) { p = new URL(r.headers.location, srv.base).pathname + new URL(r.headers.location, srv.base).search; r = await req(srv.base, p, { timeoutMs: 60000 }); }
    if (r.status !== 200 || !/text\/html/.test(r.headers['content-type'] || '')) { C.note('S3 ' + p0 + ' is not an HTML page here (' + r.status + ')'); continue; }
    const hdr = r.headers['content-security-policy'] || ''; const meta = (r.text.match(/<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/i) || [])[0] || '';
    const pol = hdr + ' ' + ((meta.match(/content="([^"]*)"/i) || [])[1] || '');
    C.ok(/(script-src|default-src)/.test(pol) && !/unsafe-eval/.test(pol), 'S3 ' + p0 + (p !== p0 ? ' (-> ' + p + ')' : '') + ': Content-Security-Policy present (' + (hdr ? 'header' : meta ? 'meta' : 'none') + '), script-src/default-src set, no unsafe-eval', pol.slice(0, 200)); }
} finally {
  if (proxy) { try { proxy.kill(); } catch (_) {} }
  await srv.stop();
}
C.done();
