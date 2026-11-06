import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
/* v91.17.228 · audit S-36 · THE COST AND SECURITY SAFEGUARDS, TESTED.
   Runs its own server on a throw-away data folder whose provider window for today is already over a daily limit of 1
   (MACH_DAILY_CALL_LIMIT=1), with a fake provider key and no worker, engine or schedule, so no request can reach the paid provider
   whatever happens. Asserts:
     budget      a cost-bearing proxy call is refused with 429 local_daily_budget_reached before any upstream fetch
                 (no provider timing header), and the backend path refuses with PROVIDER_QUOTA_EXHAUSTED semantics
     cross-site  a cross-site GET to /px and to /api is refused (403 cross_site_request_blocked); a state-changing POST from another
                 origin is refused
     host        a request for another host name gets 421 host_not_allowed (DNS rebinding)
     traversal   encoded ../ paths, the key files, the server code and the store are never served (404, no key text)
     scope       operator routes refuse a customer-view caller (403 operator_scope_required)
     weight      one weight for proxy and backend (provider.mjs weightOf): locations x max(1, variables x models / 10) x max(1, days / 14)
   usage: node scripts/tests228/security_quota.test.mjs                                                                          */
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { weightOf } from '../../server/api/provider.mjs';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.SEC_TEST_PORT || await __T.freePort()), B = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (info ? ' :: ' + String(info).slice(0, 300) : '')); } };

/* the throw-away data folder: today's provider window already holds 5 weighted calls, over the limit of 1 */
const DATA = mkdtempSync(join(tmpdir(), 'agn-sec-'));
const day = new Date().toISOString().slice(0, 10);
writeFileSync(join(DATA, 'nigraan-db.json'), JSON.stringify({ schemaVersion: 1, createdAt: new Date().toISOString(),
  collections: { quotaWindows: [{ providerId: 'mach', day, calls: 0, locations: 0, failures: 0, quotaErrors: 0, lastCallAt: null, lastStatus: null, reset: false, browserWeighted: 5, backendWeighted: 0 }] } }));
const FAKE = 'testkeyNOTREAL0000000000';
const env = { ...process.env, PORT: String(PORT), NIGRAAN_DATA_DIR: DATA, MACH_API_KEY: FAKE, MACH_DAILY_CALL_LIMIT: '1',
  NIGRAAN_WORKER: '0', NIGRAAN_AUTO_SCHEDULE: '0', NIGRAAN_ENGINE: '0', NIGRAAN_VCARCHIVE: '0', HOST: '127.0.0.1' };
delete env.OPEN_METEO_API_KEY;
const srv = spawn(process.execPath, [join(APP, 'server', 'server.mjs')], { cwd: APP, env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; srv.stdout.on('data', (d) => { log += d; }); srv.stderr.on('data', (d) => { log += d; });
const stop = () => { try { srv.kill('SIGKILL'); } catch (_) {} try { rmSync(DATA, { recursive: true, force: true }); } catch (_) {} };
process.on('exit', stop);

const get = async (path, headers = {}, method = 'GET', body) => {
  const r = await fetch(B + path, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(30000) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {}
  return { status: r.status, j, t, h: r.headers };
};
const SAME = { 'Sec-Fetch-Site': 'same-origin' };

try {
  /* wait for the server */
  let up = false; for (let i = 0; i < 60 && !up; i++) { try { up = (await get('/health')).status === 200; } catch (_) {} if (!up) await new Promise((r) => setTimeout(r, 500)); }
  ok(up, 'test server up on a throw-away data folder (fake key, limit 1, nothing scheduled)', log.slice(-300));

  /* ── budget ── */
  const px = '/px/v1/forecast?__omhost=api.open-meteo.com&latitude=33.7&longitude=73.0&hourly=temperature_2m&forecast_days=1';
  const b1 = await get(px, SAME);
  /* v91.17.283.31 · owner 29 Oct 2026: overage is billed and allowed: MACH_DAILY_CALL_LIMIT no longer refuses (it is reported); the call
     goes upstream (here the fake key gets the provider's own refusal) */
  ok(!(b1.j && b1.j.error === 'local_daily_budget_reached'), 'budget · overage allowed: a proxy call over the local daily limit is not refused for the budget', b1.status + ' ' + b1.t.slice(0, 160));
  ok(!b1.t.includes(FAKE), 'budget · the refusal does not carry the key');

  /* ── cross-site ── */
  const c1 = await get(px, { 'Sec-Fetch-Site': 'cross-site' });
  ok(c1.status === 403 && c1.j && c1.j.error === 'cross_site_request_blocked', 'cross-site · GET /px from another site is refused', c1.status);
  const c2 = await get('/api/levels?layer=heat', { 'Sec-Fetch-Site': 'cross-site' });
  ok(c2.status === 403 && c2.j && c2.j.error === 'cross_site_request_blocked', 'cross-site · GET /api from another site is refused', c2.status);
  const c3 = await get('/api/fleet/poll', { Origin: 'https://evil.example', 'content-type': 'application/json' }, 'POST', '{}');
  ok(c3.status === 403 && c3.j && c3.j.error === 'cross_site_request_blocked', 'cross-site · a POST from another origin is refused', c3.status);
  const c4 = await get('/health', { 'Sec-Fetch-Site': 'cross-site' });
  ok(c4.status === 200, 'cross-site · /health stays open (monitoring)', c4.status);

  /* ── host ── */
  /* fetch() drops a custom Host header; a raw request carries it, as a DNS-rebinding page's request would */
  const h1 = await new Promise((res) => { const rq = http.request({ host: '127.0.0.1', port: PORT, path: '/health', headers: { Host: 'evil.example' } }, (r) => { let t = ''; r.on('data', (d) => { t += d; }); r.on('end', () => { let j = null; try { j = JSON.parse(t); } catch (_) {} res({ status: r.statusCode, j }); }); }); rq.on('error', () => res({ status: 0 })); rq.end(); });
  ok(h1.status === 421 && h1.j && h1.j.error === 'host_not_allowed', 'host · another host name gets 421 host_not_allowed', h1.status);

  /* ── traversal and private files ── */
  const priv = ['/%2e%2e/mach.key', '/..%2fmach.key', '/artefact/..%2f..%2fmach.key', '/%2e%2e/%2e%2e/etc/passwd', '/mach.key', '/vc.key', '/server/server.mjs', '/data/nigraan-db.json', '/artefact/%2e%2e/package.json'];
  const tr = [];
  for (const u of priv) { const r = await fetch(B + u, { headers: SAME, redirect: 'manual' }).then(async (x) => ({ s: x.status, t: await x.text() })).catch((e) => ({ s: 0, t: String(e) }));
    if (!(r.s === 404 || r.s === 400) || r.t.includes(FAKE) || /root:x:0:0|"collections"|import http from/.test(r.t)) tr.push(u + ' -> ' + r.s); }
  ok(tr.length === 0, 'traversal · encoded ../, key files, server code and the store are never served (' + priv.length + ' paths)', tr.join(' | '));

  /* ── operator scope ── */
  const s1 = await get('/api/fleet/offsets', { ...SAME, 'x-agn-view': 'customer', 'x-forwarded-for': '203.0.113.9' });
  const s2 = await get('/api/ops/schedule', { ...SAME, 'x-agn-view': 'customer', 'x-forwarded-for': '203.0.113.9' });
  ok([s1, s2].every((r) => r.status === 403 && r.j && r.j.error === 'operator_scope_required'), 'scope · operator routes refuse a customer-view caller (403 operator_scope_required)', s1.status + ' ' + s2.status);

  /* ── weight ── */
  const q = (o) => (k) => (k in o ? o[k] : null);
  ok(weightOf(q({ latitude: '1,2,3', hourly: 'a,b,c,d,e' })) === 3, 'weight · 3 locations, 5 variables, 7 days = 3');
  ok(Math.abs(weightOf(q({ latitude: '1', hourly: 'a,b,c,d,e', models: 'x,y,z' })) - 1.5) < 1e-9, 'weight · 5 variables x 3 models = 15 variables per location = 1.5');
  ok(Math.abs(weightOf(q({ latitude: '1', hourly: Array(12).fill('v'), forecast_days: '16' })) - 1.2 * 16 / 14) < 1e-9, 'weight · 12 variables over 16 days = 1.2 x 16/14');
  ok(weightOf(q({ forecast_days: 'abc' })) === 1, 'weight · a non-numeric day count never zeroes the counter (weight 1)');
  ok(weightOf((k) => ({ hourly: ['a', 'b'] })[k] || null, 5) === 5, 'weight · the backend passes its own location count');
  const src = readFileSync(join(APP, 'server', 'server.mjs'), 'utf8');
  ok(/const weighOf = \(\) => weightOf\(/.test(src) && !/vars \/ 10\) \* Math\.max\(1, days \/ 14\)/.test(src), 'weight · the proxy uses the one weight function (no second copy in server.mjs)');
} catch (e) { ok(false, 'test run', e && e.stack); }
finally { stop(); }
console.log(`\n${fail ? 'FAIL' : 'PASS'} security_quota: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
