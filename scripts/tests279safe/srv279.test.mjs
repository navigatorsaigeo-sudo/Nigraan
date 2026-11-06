import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
// v91.17.279 · SAFE279 · against a running server (the suites runner's): OPS-12 /health disk + store-write flags, OPS-06 warm only when
// the essentials pass (a second server on this install WITHOUT a provider key must not report warm:true), OPS-09 the IPv6 host [::1].
// usage: node scripts/tests279safe/srv279.test.mjs http://127.0.0.1:<port>   (run from the install's nigraan-local folder)
import http from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
const BASE = process.argv[2] || process.env.NIGRAAN_BASE || 'http://127.0.0.1:8995';
const U = new URL(BASE), PORT = Number(U.port);
let pass = 0, fail = 0; const ok = (c, n, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (d && !c ? ' · ' + d : '')); c ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (port, path, headers = {}) => new Promise((res) => { const r = http.get({ host: '127.0.0.1', port, path, headers, agent: false, timeout: 20000 }, (x) => { const b = []; x.on('data', (c) => b.push(c)); x.on('end', () => { let j = null; try { j = JSON.parse(Buffer.concat(b).toString()); } catch (_) {} res({ status: x.statusCode, json: j }); }); }); r.on('timeout', () => r.destroy()); r.on('error', () => res({ status: 0 })); });
const h = (await get(PORT, '/health')).json || {};
ok(h.disk && typeof h.disk.freeGB === 'number' && ['ok', 'warn', 'critical'].includes(h.disk.level), 'H1 OPS-12 /health shows the free disk space and its level', JSON.stringify(h.disk));
ok(h.storeWrites && h.storeWrites.failing === false, 'H2 OPS-12 /health shows whether durable writes are failing', JSON.stringify(h.storeWrites));
ok(h.warm === true && 'warmFailed' in h && h.warmFailed === null, 'H3 OPS-06 the configured server is warm and names no failed essential', JSON.stringify({ warm: h.warm, warmFailed: h.warmFailed }));
const v6 = await get(PORT, '/health', { host: '[::1]:' + PORT });
ok(v6.status === 200, 'I1 OPS-09 a request with Host [::1]:port is answered (was 421)', 'HTTP ' + v6.status);
const v6b = await get(PORT, '/health', { host: '[::1]' }); ok(v6b.status === 200, 'I2 OPS-09 Host [::1] without a port is answered', 'HTTP ' + v6b.status);
const ev = await get(PORT, '/health', { host: 'evil.example:' + PORT }); ok(ev.status === 421, 'I3 OPS-09 another host name is still refused (421)', 'HTTP ' + ev.status);
/* OPS-06: no provider key -> not warm */
const P2 = Number(process.env.SAFE279_NOKEY_PORT || await __T.freePort());
const MOCK = process.env.MOCKOM || __T.MOCK_PROVIDER;   /* v283 WS7: the in-tree mock (was a cloud scratchpad path) */
const env = { ...process.env, PORT: String(P2), NIGRAAN_PYJOBS: '0', NIGRAAN_ENGINE: '0', NIGRAAN_WORKER: '0' }; delete env.MACH_API_KEY; delete env.OPEN_METEO_API_KEY;
const ch = spawn(process.execPath, (existsSync(MOCK) ? ['--import', __T.fileUrl(MOCK)] : []).concat(['server/server.mjs']), { env, stdio: 'ignore' });
let hn = null; const t0 = Date.now();
while (Date.now() - t0 < 240e3) { await sleep(2000); const r = await get(P2, '/health'); if (r.json && r.json.status !== 'starting' && (r.json.warm === true || (r.json.warmFailed && r.json.warmFailed.length))) { hn = r.json; break; } }
ok(!!hn && hn.warm === false && (hn.warmFailed || []).some((x) => /^provider/.test(x)), 'N1 OPS-06 a server without the provider key is not warm and names the failed essential (provider)', JSON.stringify(hn && { warm: hn.warm, warmFailed: hn.warmFailed, status: hn.status }));
try { ch.kill('SIGINT'); } catch (_) {} await sleep(2000); try { ch.kill('SIGKILL'); } catch (_) {}
/* OPS-06: a deploy's new server is a STANDBY while the old one writes; with the key its essentials (point forecast, levels, page) must
   still pass there, or every swap would fail */
{ const P3 = Number(process.env.SAFE279_STANDBY_PORT || await __T.freePort()); const env3 = { ...process.env, PORT: String(P3), NIGRAAN_PYJOBS: '0', NIGRAAN_ENGINE: '0', NIGRAAN_WORKER: '0', MACH_API_KEY: process.env.MACH_API_KEY || 'MOCK-NOT-A-KEY' }; delete env3.OPEN_METEO_API_KEY;
  const c3 = spawn(process.execPath, (existsSync(MOCK) ? ['--import', __T.fileUrl(MOCK)] : []).concat(['server/server.mjs']), { env: env3, stdio: 'ignore' });
  let h3 = null; const t3 = Date.now();
  while (Date.now() - t3 < 240e3) { await sleep(2000); const r = await get(P3, '/health'); if (r.json && r.json.status !== 'starting' && (r.json.warm === true || (r.json.warmFailed && r.json.warmFailed.length))) { h3 = r.json; break; } }
  ok(!!h3 && h3.warm === true && h3.role === 'standby' && !h3.warmFailed, 'N2 OPS-06 a standby server with the key passes its essentials and reports warm:true (a swap can promote it)', JSON.stringify(h3 && { warm: h3.warm, role: h3.role, warmFailed: h3.warmFailed, ms: Date.now() - t3 }));
  try { c3.kill('SIGINT'); } catch (_) {} await sleep(2000); try { c3.kill('SIGKILL'); } catch (_) {} }
console.log(`\n${fail ? 'FAIL' : 'PASS'} srv279: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
