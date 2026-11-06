/* v91.17.283 · WS1 · security and the provider call budget, item by item. Each check below FAILS on v91.17.282.1 and passes after WS1.
   Runs its own server (mock provider, scripts/tests267/om_mock.mjs; no network) on a throw-away data folder, and the front proxy
   (server/proxy.mjs) in front of it, exactly as installed (proxy -> server on loopback).
     C01   engine reports are accepted only from an internal caller: never through the proxy (with or without a tunnel's headers, with or
           without the token); the direct loopback runner path and the runtime token still work. The page's shown/self-check record
           refuses a relayed request (forwarding header) and still takes the local page, through the proxy too.
     AI    /api/ai/status: the public answer names no provider, model, firewall or key file; the operator on this computer gets the full one.
     RL    the per-address limit runs before authentication: an unauthenticated flood gets 429 (it was 401 forever, an audit write each),
           and does not spend a signed user's budget; the per-user limit still applies.
     RF    relief tiles: canonical integers only; a tile outside the DEM extent is answered from memory (x-relief: outside) and is never
           rendered or written to the disk cache; inside tiles render as before.
     BUD   the call budget (data/provider-budget.json): /health shows mode, use per class and caller tag, the 30-day projection against
           the plan (10 seeded store days) and the ops alert; monitor refuses nothing (counts what it would refuse); shed refuses
           background only; enforce refuses everything at the cap; the file is re-read when it changes.
     CSP   /customize carries a full Content-Security-Policy (script hashes from the served file) and the page loads with zero violations in
           headless Chromium; an injected inline script is blocked (the policy is live).
   usage: node scripts/tests283/ws1/ws1.test.mjs [--root <nigraan-local folder to test>]   (default: the tree this file is in)
   env:   WS1_PORT (default 9351; the proxy takes +1), WS1_CSP_BASE=<url of a running full server> adds the CSP browser check there too */
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, symlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ai = process.argv.indexOf('--root');
const ROOT = resolve(ai > 0 ? process.argv[ai + 1] : join(HERE, '..', '..', '..'));
const PORT = Number(process.env.WS1_PORT || 9351), PPORT = PORT + 1;
const B = `http://127.0.0.1:${PORT}`, P = `http://127.0.0.1:${PPORT}`;
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (info != null ? ' :: ' + String(info).slice(0, 400) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* throw-away data folder: today's quota window, the budget file of the tree under test (if any), the DEM bands and tehsils (read-only links) */
const DATA = mkdtempSync(join(tmpdir(), 'agn-ws1-'));
const day = new Date().toISOString().slice(0, 10);
writeFileSync(join(DATA, 'nigraan-db.json'), JSON.stringify({ schemaVersion: 1, createdAt: new Date().toISOString(),
  collections: { quotaWindows: [...Array.from({ length: 10 }, (_, i) => ({ providerId: 'mach', day: new Date(Date.now() - (i + 1) * 864e5).toISOString().slice(0, 10), calls: 100, locations: 0, failures: 0, quotaErrors: 0, browserWeighted: 150000, backendWeighted: 50000 })), { providerId: 'mach', day, calls: 0, locations: 0, failures: 0, quotaErrors: 0, lastCallAt: null, lastStatus: null, reset: false, browserWeighted: 0, backendWeighted: 0 }] } }));
const BUDGET_SRC = join(ROOT, 'data', 'provider-budget.json'), BUDGET = join(DATA, 'provider-budget.json');
if (existsSync(BUDGET_SRC)) writeFileSync(BUDGET, readFileSync(BUDGET_SRC));
for (const f of ['feat', 'pk-tehsils.json', 'loc-line.json', 'flood-extent', 'flood-glofascal', 'pk-rivers.json']) { const s = join(ROOT, 'data', f); if (existsSync(s)) symlinkSync(s, join(DATA, f)); }
for (const f of ['engine-latest.json', 'model-gate.resolved.json', 'rule-ledger.json', 'source-labels.json']) { const s = join(ROOT, 'data', f); if (existsSync(s)) writeFileSync(join(DATA, f), readFileSync(s)); }   /* copies: the server may write them */
const TOKEN = randomBytes(16).toString('hex');
const env = { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NIGRAAN_DATA_DIR: DATA, NIGRAAN_WORKER: '0', NIGRAAN_AUTO_SCHEDULE: '0', NIGRAAN_ENGINE: '0',
  NIGRAAN_PYJOBS: '0', NIGRAAN_SWEEP_WARM: '0', NIGRAAN_SYNOP: '0', NIGRAAN_MACH_DB_SYNC: '0', NIGRAAN_FLEET_BACKFILL: '0', NIGRAAN_VCARCHIVE: '0', NIGRAAN_WARM_MAX_S: '20', NIGRAAN_BUDGET_CHECK_S: '2',
  MACH_API_KEY: 'test-key-not-a-real-key', NIGRAAN_RATE_PER_MIN: '5', NIGRAAN_RATE_IP_PER_MIN: '12', NIGRAAN_ALLOW_DEV_TOKEN: '1', NIGRAAN_INTERNAL_TOKEN: TOKEN };
delete env.OPEN_METEO_API_KEY; delete env.NIGRAAN_CALL_BUDGET; delete env.MACH_DAILY_CALL_LIMIT; delete env.NIGRAAN_CALL_BUDGET_MODE;
let log = '';
const srv = spawn(process.execPath, [join(HERE, 'child.mjs'), ROOT], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
srv.stdout.on('data', (d) => { log += d; }); srv.stderr.on('data', (d) => { log += d; });
const prx = spawn(process.execPath, [join(ROOT, 'server', 'proxy.mjs')], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NIGRAAN_DATA_DIR: DATA, NIGRAAN_PROXY_PORT: String(PPORT), NIGRAAN_BACKEND_PORTS: String(PORT), NIGRAAN_PROXY_HOST: '127.0.0.1' } });
let plog = ''; prx.stdout.on('data', (d) => { plog += d; }); prx.stderr.on('data', (d) => { plog += d; });
let stopped = false;
const stop = () => { if (stopped) return; stopped = true; for (const c of [srv, prx]) { try { c.kill('SIGKILL'); } catch (_) {} } try { rmSync(DATA, { recursive: true, force: true }); } catch (_) {} };
process.on('exit', stop); process.on('SIGINT', () => { stop(); process.exit(130); });

/* raw request (fetch() would drop a custom Host header) */
function req(base, path, { method = 'GET', headers = {}, body = null } = {}) {
  const u = new URL(base);
  return new Promise((res) => { const rq = http.request({ host: u.hostname, port: u.port, path, method, headers: { host: 'localhost:' + u.port, ...headers, ...(body != null ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {}) }, agent: false },
    (r) => { const ch = []; r.on('data', (d) => ch.push(d)); r.on('end', () => { const buf = Buffer.concat(ch), t = buf.toString('utf8'); let j = null; try { j = JSON.parse(t); } catch (_) {} res({ status: r.statusCode, h: r.headers, t, j, buf }); }); });
    rq.on('error', (e) => res({ status: 0, h: {}, t: String(e), j: null, buf: Buffer.alloc(0) })); rq.setTimeout(120000, () => rq.destroy(new Error('timeout'))); if (body != null) rq.write(body); rq.end(); });
}
const health = async () => (await req(B, '/health')).j || {};
const px = (lat, tag) => req(B, `/px/v1/forecast?__omhost=api.open-meteo.com&latitude=${lat}&longitude=73.05&hourly=temperature_2m&forecast_days=2`, { headers: tag ? { 'x-agn-internal': tag } : {} });

try {
  let up = false; for (let i = 0; i < 240 && !up; i++) { try { const h = await health(); up = h.warm === true; } catch (_) {} if (!up) await sleep(500); }
  ok(up, 'test server warm (mock provider, throw-away data folder)', log.slice(-400));
  let pup = false; for (let i = 0; i < 40 && !pup; i++) { pup = (await req(P, '/health')).status === 200; if (!pup) await sleep(250); }
  ok(pup, 'front proxy up in front of it', plog.slice(-300));

  /* ── C01 ── */
  const TUN = { 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '203.0.113.9' };
  const e1 = await req(P, '/api/engine/report', { method: 'POST', body: '{}' });
  ok(e1.status === 403, 'C01a engine report through the proxy (Host localhost, no relay header: a tunnel that rewrites Host) is refused', e1.status + ' ' + e1.t.slice(0, 120));
  const e2 = await req(P, '/api/engine/report', { method: 'POST', body: '{}', headers: TUN });
  ok(e2.status === 403, 'C01b engine report through the proxy with a tunnel\'s client headers is refused', e2.status);
  const e3 = await req(P, '/api/engine/report', { method: 'POST', body: '{}', headers: { 'x-agn-internal-token': TOKEN } });
  ok(e3.status === 403, 'C01c the proxy never forwards the internal token: refused through the proxy even with it', e3.status);
  const e4 = await req(P, '/api/engine/report', { method: 'POST', body: '{}', headers: { 'x-agn-via-proxy': '0' } });
  ok(e4.status === 403, 'C01d a client cannot remove the proxy mark by sending its own copy', e4.status);
  const e5 = await req(B, '/api/engine/report', { method: 'POST', body: '{}' });
  ok(e5.status === 200 && e5.j && e5.j.ok === false, 'C01e the engine runner path (direct loopback to the server port) still reaches the engine (a malformed report is refused by the engine, 200 ok:false)', e5.status + ' ' + e5.t.slice(0, 120));
  const e6 = await req(B, '/api/engine/report', { method: 'POST', body: '{}', headers: TUN });
  ok(e6.status === 403, 'C01f direct but relayed (forwarding headers) is refused', e6.status);
  const e7 = await req(B, '/api/engine/report', { method: 'POST', body: '{}', headers: { ...TUN, 'x-agn-internal-token': TOKEN } });
  ok(e7.status === 200, 'C01g a caller holding the runtime token is accepted', e7.status);
  const e8 = await req(B, '/api/engine/report', { method: 'POST', body: '{}', headers: { 'x-agn-internal-token': 'x'.repeat(TOKEN.length), ...TUN } });
  ok(e8.status === 403, 'C01h a wrong token is refused', e8.status);
  const s1 = await req(P, '/api/shown/report', { method: 'POST', body: '{}', headers: TUN });
  ok(s1.status === 403, 'C01i the page\'s shown record refuses a request relayed by a tunnel', s1.status + ' ' + s1.t.slice(0, 120));
  const s2 = await req(P, '/api/shown/report', { method: 'POST', body: '{}', headers: { 'x-agn-view': 'customer' } });
  ok(s2.status === 200, 'C01j the local page (customer view, through the proxy, no relay header) still records what it showed', s2.status + ' ' + s2.t.slice(0, 120));

  /* ── AI status ── */
  const LEAK = ['firewall', 'localStart', 'storeAdopt', 'storeImport', 'asked', 'modelNote', 'cloudRefused', 'why', 'localByDefault', 'cloudOptIn'];
  const leaks = (j) => { const out = []; if (!j) return ['no json']; for (const k of LEAK) if (j[k] !== undefined) out.push(k); if (j.model) out.push('model=' + j.model);
    if (j.provider && !/^(retrieval|local language model|cloud language model)$/.test(j.provider)) out.push('provider=' + j.provider);
    const T = j.models && j.models.temperature, A = j.models && j.models.analyst; if (T && (T.heldOut || T.version || T.label)) out.push('temperature internals'); if (A && (A.model || A.reachable !== undefined)) out.push('analyst model'); return out; };
  const a1 = await req(P, '/api/ai/status', { headers: TUN });
  ok(a1.status === 200 && leaks(a1.j).length === 0 && a1.j.configured === true && a1.j.mode, 'AI1 /api/ai/status through a tunnel: minimal public status (mode, local, model descriptions), no wiring detail', leaks(a1.j).join(', ') + ' ' + a1.t.slice(0, 200));
  const a2 = await req(B, '/api/ai/status', { headers: { 'x-agn-view': 'customer' } });
  ok(a2.status === 200 && leaks(a2.j).length === 0, 'AI2 the customer view on this computer gets the public status too', leaks(a2.j).join(', '));
  const a3 = await req(B, '/api/ai/status', { headers: { 'x-agn-view': 'operator' } });   /* v283.23 self-audit P10: operator detail needs the operator view */
  ok(a3.status === 200 && a3.j && a3.j.firewall && a3.j.scope !== 'public', 'AI3 the operator (operator view) on this computer still gets the full status', a3.t.slice(0, 160));
  const a4 = await req(B, '/api/ai/status');
  ok(a4.status === 200 && leaks(a4.j).length === 0, 'AI4 a loopback request without the operator view is the client view (v283.23)', leaks(a4.j).join(', '));

  /* ── RL ── */
  const v1 = (ip, auth) => req(B, '/api/v1/system/providers', { headers: { 'x-forwarded-for': ip, ...(auth ? { authorization: 'Bearer agn-dev-token' } : {}) } });
  const st = []; for (let i = 0; i < 14; i++) st.push((await v1('198.51.100.7', false)).status);
  ok(st.slice(0, 12).every((s) => s === 401) && st.slice(12).every((s) => s === 429), 'RL1 an unauthenticated flood from one address: 401 x12 (the address limit), then 429 before any token work', st.join(','));
  const su = []; for (let i = 0; i < 6; i++) su.push((await v1('198.51.100.8', true)).status);
  ok(su.slice(0, 5).every((s) => s === 200) && su[5] === 429, 'RL2 a signed user from another address keeps the whole per-user budget (5 x 200), then the per-user limit (429)', su.join(','));
  const s3 = (await v1('198.51.100.9', true)).status;
  ok(s3 === 429, 'RL3 the per-user limit follows the user to another address', s3);

  /* ── RF ── */
  const rel = await req(B, '/tiles/relief/status');
  if (!(rel.j && rel.j.ready)) ok(false, 'RF relief data (data/feat/t_elev) present in the tree under test', rel.t.slice(0, 200));
  else {
    const o1 = await req(B, '/tiles/relief/12/0/0.png');
    const files = (() => { const out = []; const walk = (d) => { if (!existsSync(d)) return; for (const f of readdirSync(d, { withFileTypes: true })) { const p = join(d, f.name); if (f.isDirectory()) walk(p); else out.push(p); } }; walk(join(DATA, 'cache', 'relief')); return out; })();
    ok(o1.status === 200 && o1.h['x-relief'] === 'outside' && o1.buf.slice(1, 4).toString() === 'PNG', 'RF1 a tile outside the DEM extent is answered from memory (x-relief: outside)', o1.status + ' ' + o1.h['x-relief']);
    ok(!files.some((f) => /[\\/]12[\\/]0[\\/]0\.png$/.test(f)), 'RF2 ... and is never written to the disk cache', files.filter((f) => /\.png$/.test(f)).join(' ').slice(0, 300));
    const o2 = await req(B, '/tiles/relief/muted/9/0/511.png'), o3 = await req(B, '/tiles/relief/shade/4/15/0.png');
    ok(o2.h['x-relief'] === 'outside' && o3.h['x-relief'] === 'outside' && o2.buf.equals(o1.buf) && o3.buf.equals(o1.buf), 'RF3 every style outside the extent gets the same flat tile', o2.h['x-relief'] + ' ' + o3.h['x-relief']);
    const bad = ['/tiles/relief/06/44/26.png', '/tiles/relief/6/044/26.png', '/tiles/relief/6/44/-1.png', '/tiles/relief/6/44.5/26.png', '/tiles/relief/6/1e1/26.png', '/tiles/relief/6/44/26.png%00', '/tiles/relief/..%2f..%2fnigraan-db.json', '/tiles/relief/13/0/0.png', '/tiles/relief/3/0/0.png', '/tiles/relief/6/64/0.png'];
    const badR = []; for (const u of bad) { const r = await req(B, u); if (r.status !== 404 || /collections/.test(r.t)) badR.push(u + ' ' + r.status); }
    ok(badR.length === 0, 'RF4 non-canonical numbers, signs, fractions, traversal and out-of-range z/x/y are 404', badR.join(' | '));
    const i1 = await req(B, '/tiles/relief/6/44/26.png');
    ok(i1.status === 200 && (i1.h['x-relief'] === 'miss' || i1.h['x-relief'] === 'hit') && i1.buf.length > 1000, 'RF5 a tile over Pakistan still renders (x-relief miss/hit)', i1.status + ' ' + i1.h['x-relief'] + ' ' + i1.buf.length);
  }

  /* ── BUD ── */
  const h0 = await health();
  const cfg0 = existsSync(BUDGET) ? JSON.parse(readFileSync(BUDGET, 'utf8')) : null;
  const PB = h0.providerBudget || {};
  ok(PB.configured && cfg0 && (cfg0.dailyFromPlan ? Math.abs(PB.dailyWeightedCap - cfg0.monthlyPlanWeighted / new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0)).getUTCDate()) < 1 : PB.dailyWeightedCap === cfg0.dailyWeightedCap) && PB.mode === (cfg0.mode || 'monitor') && PB.mode === 'monitor', 'BUD1 /health shows the budget from data/provider-budget.json, in monitor mode (owner 27 Oct 2026; was shed since WS1 delta 3) (the v283 default since WS1 delta 3)', JSON.stringify(PB).slice(0, 300));
  ok(!/key|secret|token/i.test(JSON.stringify(PB)), 'BUD2 ... with no secret in it');
  const PJ = PB.projection || {};
  ok(PJ.monthlyPlanWeighted === cfg0.monthlyPlanWeighted && PJ.completedDays === 10 && PJ.meanDailyWeighted === 200000 && PJ.projected30DayWeighted === 6000000 && PJ.exceedsPlan === true, 'BUD3 the 30-day projection from the store: 10 seeded days of 200,000 -> 6,000,000 against the 5,000,000 plan', JSON.stringify(PJ));
  /* v91.17.283.31 · owner 29 Oct 2026: overage is billed and allowed: a projection over the plan is information only (no alert); the month to date is shown */
  await sleep(1500); const hb = (await health()).providerBudget || {};
  ok(!hb.planAlert && hb.monthToDate && hb.monthToDate.monthlyPlanWeighted === cfg0.monthlyPlanWeighted && /^allowed/.test(hb.monthToDate.overage || ''), 'BUD4 overage allowed: no alert when the projection exceeds the plan; the month to date against the plan is reported', JSON.stringify({ pa: hb.planAlert, m: hb.monthToDate }).slice(0, 300));
  /* v283 INTEG: PATCH3 ships shed mode with a plan-derived cap and priority tiers; these checks test the single-level rules, so the
     file they write fixes the cap (dailyFromPlan false) and has no tiers (the tier rules are tiers.unit / cache.test's) */
  const setB = async (o) => { const { tiers, tierRules, ...base } = cfg0 || {}; writeFileSync(BUDGET, JSON.stringify({ ...base, dailyFromPlan: false, testMode: false, ...o })); await sleep(30); };
  /* monitor: nothing refused even far over the cap; what shed / enforce would refuse is counted */
  await setB({ mode: 'monitor', dailyWeightedCap: 1, shedBackgroundAtShare: 1e-9 });
  const m1 = await px(33.70, 'sweep-warm'), m2 = await px(33.701);
  const hm = (await health()).providerBudget || {};
  ok(m1.status === 200 && m2.status === 200 && hm.wouldRefuse.background >= 1 && hm.wouldRefuse.user >= 1 && hm.refused.user === 0 && hm.refused.background === 0, 'BUD5 monitor: over the cap, background and a person\'s request are both served; the would-be refusals are counted', m1.status + ' ' + m2.status + ' ' + JSON.stringify({ r: hm.refused, w: hm.wouldRefuse }));
  ok(hm.byClass.user > 0 && hm.byClass.background > 0 && Array.isArray(hm.topTagsToday) && hm.topTagsToday.some((t) => t.tag === 'sweep-warm' && t.cls === 'background') && hm.topTagsToday.some((t) => /^page /.test(t.tag) && t.cls === 'user'), 'BUD6 use is reported per class and per caller tag', JSON.stringify(hm.topTagsToday).slice(0, 300));
  /* shed: background refused, a person never (even over the cap) */
  await setB({ mode: 'shed', dailyWeightedCap: 1, shedBackgroundAtShare: 1e-9 });
  const sh1 = await px(33.71, 'sweep-warm'), sh2 = await px(33.72), sh3 = await px(33.73, 'ai-point');
  ok(sh1.status === 200, 'BUD7 overage allowed: a file asking for shed refuses nothing; a background caller over the shed level is served', sh1.status + ' ' + sh1.t.slice(0, 160));
  ok(sh2.status === 200 && sh3.status === 200, 'BUD8 a person\'s request (and an internal call made for one, userTags) is served over the cap', sh2.status + ' ' + sh3.status);
  /* enforce: every call at the cap */
  await setB({ mode: 'enforce', dailyWeightedCap: 1, shedBackgroundAtShare: 1 });
  const en2 = await px(33.74);
  ok(en2.status === 200, 'BUD9 overage allowed: a file asking for enforce refuses nothing; a person\'s request at the cap is served', en2.status + ' ' + en2.t.slice(0, 160));
  const h2 = (await health()).providerBudget || {};
  ok(h2.mode === 'monitor' && h2.requestedMode === 'enforce' && h2.refused.background === 0 && h2.refused.user === 0 && h2.wouldRefuse.user >= 1 && /overage allowed/.test(h2.state || ''), 'BUD10 /health: nothing refused, what a cap would have refused is counted, and the state says overage is allowed', JSON.stringify(h2).slice(0, 300));
  if (cfg0) writeFileSync(BUDGET, JSON.stringify(cfg0)); await sleep(30);
  const u3 = await px(33.75);
  ok(u3.status === 200 && ((await health()).providerBudget || {}).mode === ((cfg0 && cfg0.mode) || 'monitor'), 'BUD11 the file is re-read: the shipped mode again (monitor), requests served', u3.status);

  /* ── WS9 routes (wired here): operator only ── */
  if (existsSync(join(ROOT, 'server', 'api', 'floodextent.mjs'))) {
    const W9 = ['/api/flood/extent?day=0', '/api/flood/extent/point?lat=27.7&lon=68.86&day=0', '/api/flood/extent/tile/0/8/180/109.png', '/api/flood/glofascal'];
    const pub = []; for (const u of W9) { for (const [base, h] of [[P, TUN], [B, { 'x-agn-view': 'customer' }], [P, {}]].slice(0, 2)) { const r = await req(base, u, { headers: h }); if (r.status !== 401) pub.push(u + ' ' + r.status); } }
    ok(pub.length === 0, 'W9a flood extent and calibrated river flow refuse a relayed or customer-view caller (401)', pub.join(' | '));
    const op = []; for (const u of W9) { const r = await req(B, u); if (r.status === 401 || r.status === 404 || (r.status >= 500 && !(r.status === 503 && r.j && r.j.ready === false && r.j.why))) op.push(u + ' ' + r.status + ' ' + r.t.slice(0, 80)); }
    ok(op.length === 0, 'W9b the operator on this computer reaches all four routes (the extent answers its own "not available" with the reason while fx-model.json is not served)', op.join(' | '));
    const fs = (await req(P, '/api/flood/status', { headers: TUN })).j || {};
    ok(fs.floodExtent === undefined && fs.glofasCal === undefined, 'W9c the public flood status carries no extent / calibration status');
  }

  /* ── SV (WS4 request): the client levels, alerts and frozen run as served (served.mjs) ── */
  {
    const G = (() => { try { return JSON.parse(readFileSync(join(DATA, 'model-gate.resolved.json'), 'utf8')); } catch (_) { return null; } })();
    const CR = G && G.client_rules;
    if (!CR || !CR.hidden_layers || !Object.keys(CR.hidden_layers).length) ok(false, 'SV0 the gate under test carries client_rules (owner decision B; WS4 data/model-gate.resolved.json)', 'no client_rules');
    else {
      const hid = Object.keys(CR.hidden_layers)[0], [subK, subV] = Object.entries(CR.substitute || {})[0] || [];
      const E = JSON.parse(readFileSync(join(DATA, 'engine-latest.json'), 'utf8')); const uid = Object.keys(E.days[0].layers.heat.L).find((k) => /Islamabad/.test(k)) || Object.keys(E.days[0].layers.heat.L)[0];
      const cu = (await req(P, '/api/levels/unit?unit=' + encodeURIComponent(uid), { headers: { ...TUN, 'x-agn-view': 'customer' } })).j || {};
      const days = cu.days || [];
      const bad = []; for (const d of days) { if (hid in (d.layers || {})) bad.push(d.day + ':' + hid + ' served');
        for (const [k, v] of Object.entries(d.layers || {})) { if (!('productType' in v)) bad.push(d.day + ':' + k + ' no productType'); if (v.level < 0 && !v.notAssessedWhy) bad.push(d.day + ':' + k + ' no reason'); if (/not applicable|does not occur/i.test(v.word || '')) bad.push(d.day + ':' + k + ' ' + v.word); } }
      ok(cu.ready && days.length && bad.length === 0, 'SV1 client /api/levels/unit: ' + hid + ' hidden, every level with its product type, every missing level with its reason', (cu.why || '') + ' ' + bad.slice(0, 6).join(' | '));
      ok(!subK || days.every((d) => !d.layers[subK] || d.layers[subK].from === subV.from), 'SV2 client ' + subK + ' is served from ' + (subV && subV.from), JSON.stringify(days[0] && days[0].layers[subK] || null).slice(0, 200));
      const ou = (await req(B, '/api/levels/unit?unit=' + encodeURIComponent(uid), { headers: { 'x-agn-view': 'operator' } })).j || {};   /* v91.17.283.12: the operator view is asked for explicitly */
      ok(ou.ready && ou.days && ou.days.some((d) => hid in d.layers), 'SV3 the operator view keeps ' + hid);
      const ln = (await req(P, '/api/levels?layer=' + hid + '&day=0', { headers: TUN })).j || {}, lo = (await req(B, '/api/levels?layer=' + hid + '&day=0', { headers: { 'x-agn-view': 'operator' } })).j || {};
      ok(ln.ready === false && ln.hidden === true && lo.ready === true, 'SV4 client /api/levels?layer=' + hid + ' is not served (hidden, with why); the operator gets it', JSON.stringify(ln).slice(0, 160));
      const ls = (await req(P, '/api/levels?layer=' + subK + '&day=0', { headers: TUN })).j || {};
      ok(ls.ready === true && ls.from === subV.from && ls.productType !== undefined && !/not applicable/.test(JSON.stringify(ls.code || {})), 'SV5 client /api/levels?layer=' + subK + ' comes from ' + subV.from + ', names its product type, -2 is "not assessed"', JSON.stringify({ from: ls.from, pt: ls.productType, code: ls.code }).slice(0, 200));
      const la = (await req(P, '/api/levels?day=0', { headers: TUN })).j || {};
      ok(la.ready === true && la.layers && !(hid in la.layers), 'SV6 the client layer summary leaves ' + hid + ' out', Object.keys(la.layers || {}).join(','));
    }
    /* v283.19: the report run is the part pointrun of the place bundle (/api/report/pointrun is retired) */
    const pr0 = await req(P, '/api/point?lat=33.6844&lon=73.0479', { headers: { ...TUN, 'x-agn-view': 'customer' } }); const prv = pr0.j && pr0.j.parts && pr0.j.parts.pointrun ? pr0.j.parts.pointrun.v : null; const pr = { status: pr0.status, j: prv, t: JSON.stringify(prv || {}) };
    ok(pr.status === 200 && pr.j && pr.j.ok && !/ECMWF|ecmwf|IFS\b/.test(pr.t), 'SV7 client report run (the bundle part pointrun) names no supplier model (ecmwf_ifs / ECMWF IFS)', pr.status + ' ' + (pr.t.match(/.{0,40}(ECMWF|ecmwf|IFS).{0,40}/) || [pr.t.slice(0, 120)])[0]);
    const po0 = await req(B, '/api/point?lat=33.6844&lon=73.0479', { headers: { 'x-agn-view': 'operator' } }); const po = { status: po0.status, t: JSON.stringify(po0.j && po0.j.parts && po0.j.parts.pointrun ? po0.j.parts.pointrun.v : {}) };
    ok(po.status === 200 && /ecmwf_ifs/.test(po.t), 'SV8 the operator\'s frozen run still names its model');
  }

  /* ── CSP ── */
  const c0 = await req(B, '/customize');
  const csp = String(c0.h['content-security-policy'] || '');
  ok(c0.status === 200 && /script-src 'self'( 'sha256-[A-Za-z0-9+/=]+')+/.test(csp) && /object-src 'none'/.test(csp) && /frame-ancestors 'self'/.test(csp) && !/script-src[^;]*'unsafe-inline'/.test(csp), 'CSP1 /customize sends a full policy: scripts by hash, no unsafe-inline scripts, no plugins, framing self only', csp.slice(0, 200));
  const n3 = await req(B, '/NIGRAAN_3.html');
  ok(String(n3.h['content-security-policy'] || '') === csp, 'CSP2 the same page under its file name carries the same policy');
  /* v283 INTEG (WS7 request): Playwright and Chromium from scripts/lib/testenv.mjs (SKIP with the reason when absent) */
  const T = await import('../../lib/testenv.mjs'); const chromium = (await T.playwright()).chromium;
  const browser = await T.launch(chromium, { ...(process.env.WS1_CHROMIUM ? { executablePath: process.env.WS1_CHROMIUM } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  async function cspRun(base, label) {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } }); const page = await ctx.newPage(); const errs = [];
    page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text())) errs.push(m.text().slice(0, 200)); });
    await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => { window.__csp.push(e.violatedDirective + ' ' + e.blockedURI + ' ' + (e.sourceFile || '') + ':' + (e.lineNumber || '')); }); });
    await page.goto(base + '/customize', { waitUntil: 'load', timeout: 180000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await sleep(4000);
    const r = await page.evaluate(() => ({ csp: window.__csp.slice(), leaflet: !!window.L, tiles: document.querySelectorAll('.leaflet-tile').length, panes: document.querySelectorAll('.leaflet-pane').length }));
    ok(r.csp.length === 0 && errs.length === 0, 'CSP3 ' + label + ': /customize loads with zero CSP violations', r.csp.concat(errs).join(' | '));
    ok(r.leaflet && r.panes > 0, 'CSP4 ' + label + ': the page\'s own scripts ran (map built)', JSON.stringify(r));
    const inj = await page.evaluate(async () => { const n = window.__csp.length; const s = document.createElement('script'); s.textContent = 'window.__injected = 1'; document.head.appendChild(s); await new Promise((r) => setTimeout(r, 300)); return { ran: window.__injected === 1, violations: window.__csp.length - n }; });
    ok(!inj.ran && inj.violations >= 1, 'CSP5 ' + label + ': an injected inline script is blocked (the policy is live)', JSON.stringify(inj));
    await ctx.close();
  }
  try { await cspRun(B, 'test server'); if (process.env.WS1_CSP_BASE) await cspRun(process.env.WS1_CSP_BASE.replace(/\/$/, ''), 'full server ' + process.env.WS1_CSP_BASE); }
  finally { await browser.close(); }
} catch (e) { ok(false, 'test run', e && e.stack || e); }
finally { stop(); }
console.log(`\nWS1: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
