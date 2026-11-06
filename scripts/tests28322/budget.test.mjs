import * as __T from '../lib/testenv.mjs';
/* v91.17.283.22 . THE PROVIDER BUDGET AND THE PROVIDER LIMIT (owner, 26 Oct 2026: from about 10:00 PKT the place's rain chance failed with
   "429" and the strip showed "-" in every window). Runs its own server (mock provider, fault injection through MOCK_CTL) on a throw-away
   data folder beside the tree's data, then a second server on the same folder (the restart check):
     T1  every provider call of a place record is tagged place-record (a user tag of data/provider-budget.json: essential, never shed as
         background); no call of the place record goes out as background 'pool' or 'point-product'
     T2  one fetch per product and point: one operator bundle asks the pool's multi-model forecast once and the ensemble day totals once
         (the hazard feed and the operator part pool share them)
     T3  the national pool members are fetched once per point and run: two request shapes of the same point (7 and 8 forecast days) make
         ONE members call
     T4  no re-buy after a restart: the members held by the first server are written at its stop and read back by the next server, which
         answers the same request with no members call
     T5  a part the provider limit refuses (HTTP 429 on the ensemble) is answered "not available right now (provider limit) - retrying"
         with a retry time; it is computed again on its own (backoff) and fills the same cached bundle; the number of provider calls the
         retries make is bounded (one per try)
     T6  the pages: during the limit the start drawer's strip and Next 12 hours show the message (not a bare "-"); after the retry the
         drawer reads the bundle once at the retry time and shows the chances
     T7  the budget is respected (server/api/point.mjs, unit): while the day's budget is spent no retry calls the provider (held), and a
         limited part is tried at most NIGRAAN_PART_RETRIES times
   usage: node scripts/tests28322/budget.test.mjs   (env T28322_PORT, default 9371) */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, symlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const ROOT = __T.ROOT, PORT = Number(process.env.T28322_PORT || 9371), B = 'http://127.0.0.1:' + PORT;
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 900) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* T7 first: the unit (no server) */
{ process.env.NIGRAAN_PART_RETRY_S = '1'; process.env.NIGRAAN_PART_RETRIES = '3';
  const { createPoint } = await import(__T.fileUrl(join(ROOT, 'server', 'api', 'point.mjs')));
  const mk = (spent) => { let calls = 0; const app = { places: { resolvePoint: () => null }, pointState: { runStamp: () => ({ stamp: 's1' }), state: async () => ({ ok: true, point: { elevM: 500 }, area: {} }), rawBuild: async () => null } };
    const P = createPoint(app, { parts: { x: async () => { calls++; throw new Error('ensemble-api.open-meteo.com 429'); } }, budgetSpent: () => spent });
    return { P, calls: () => calls }; };
  const a = mk(false); const B1 = await a.P.bundle({ lat: 33.7, lon: 73.0 }, { complete: true }); const x = B1.parts.x;
  ok(x && x.limited === true && /provider limit/.test(x.why) && !!x.retryAt, 'T7 a part refused for the provider limit is answered as limited, with a retry time', JSON.stringify(x));
  await sleep(1000 * (1 + 2 + 4) + 1500);
  ok(a.calls() === 4 && a.P.status().stats.retried === 3, 'T7 the limited part is tried at most NIGRAAN_PART_RETRIES (3) more times, one call per try (' + a.calls() + ' calls)', JSON.stringify(a.P.status().stats));
  const b = mk(true); await b.P.bundle({ lat: 33.71, lon: 73.01 }, { complete: true }); await sleep(3500);
  ok(b.calls() === 1 && b.P.status().stats.retryHeld >= 1, 'T7 while the day’s budget is spent no retry calls the provider (held ' + b.P.status().stats.retryHeld + ', calls ' + b.calls() + ')', JSON.stringify(b.P.status().stats));
  delete process.env.NIGRAAN_PART_RETRY_S; delete process.env.NIGRAAN_PART_RETRIES; }
/* the throw-away data folder: every entry of the tree's data folder linked, except the operator's state the server writes */
const DATA = mkdtempSync(join(tmpdir(), 'agn-t28322-')), CTL = join(DATA, '..', 'agn-t28322-ctl-' + process.pid + '.json'), MLOG = join(DATA, '..', 'agn-t28322-mock-' + process.pid + '.jsonl');
const SKIPD = /^(nigraan-db\.json.*|\.store\.lock.*|run|cache|archive|quota-callers|server\.log|crash-.*|copies|nightly|backups|records|outlook\.json|engine-latest\.json|engine-latest-run\.json|engine-.*\.pid|engine-profile)$/;
for (const f of readdirSync(join(ROOT, 'data'))) { if (SKIPD.test(f)) continue; try { symlinkSync(join(ROOT, 'data', f), join(DATA, f)); } catch (_) {} }
for (const f of ['outlook.json', 'engine-latest.json']) { const s = join(ROOT, 'data', f); if (existsSync(s)) writeFileSync(join(DATA, f), readFileSync(s)); }
const ctl = (o) => writeFileSync(CTL, JSON.stringify(o)); ctl({ mode: 'ok' }); writeFileSync(MLOG, '');
const mlog = () => readFileSync(MLOG, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
let srv = null, slog = '';
const start = async () => { slog = ''; const env = { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', NIGRAAN_DATA_DIR: DATA, MACH_API_KEY: 'MOCK-NOT-A-KEY', MOCK_CTL: CTL, MOCK_LOG: MLOG,
    NIGRAAN_COPY: '0', NIGRAAN_PYJOBS: '0', NIGRAAN_ENGINE: '0', NIGRAAN_WORKER: '0', NIGRAAN_SWEEP_WARM: '0', NIGRAAN_CALL_BUDGET: 'off', NIGRAAN_PART_RETRY_S: '6', NIGRAAN_PART_RETRIES: '4', NIGRAAN_HANDOVER_S: '1', NIGRAAN_DRAIN_S: '2' };
  delete env.OPEN_METEO_API_KEY;
  srv = spawn(process.execPath, ['--import', __T.MOCK_PROVIDER_URL, join(ROOT, 'server', 'server.mjs')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stdout.on('data', (d) => { slog += d; }); srv.stderr.on('data', (d) => { slog += d; });
  for (let i = 0; i < 240; i++) { try { const r = await fetch(B + '/health', { signal: AbortSignal.timeout(3000) }); const j = await r.json(); if (j && j.warm === true) return true; } catch (_) {} await sleep(1000); }
  return false; };
const stop = async () => { if (!srv || srv.exitCode !== null) return; try { srv.kill('SIGINT'); } catch (_) {} for (let i = 0; i < 80 && srv.exitCode === null && srv.signalCode === null; i++) await sleep(250); if (srv.exitCode === null) try { srv.kill('SIGKILL'); } catch (_) {} };
const cleanup = () => { try { if (srv && srv.exitCode === null) srv.kill('SIGKILL'); } catch (_) {} for (const p of [DATA, CTL, MLOG]) try { rmSync(p, { recursive: true, force: true }); } catch (_) {} };
process.on('exit', cleanup); process.on('SIGINT', () => { cleanup(); process.exit(130); });
const J = async (u, h = {}) => { const r = await fetch(B + u, { headers: h, signal: AbortSignal.timeout(240000) }); return r.json(); };
const OP = { 'x-agn-view': 'operator' };
if (!(await start())) { ok(false, 'the test server started', slog.slice(-1500)); console.log('PASS budget: ' + pass + ' passed, ' + fail + ' failed'); process.exit(1); }
try {
  /* T1 / T2 · one operator bundle */
  writeFileSync(MLOG, '');
  const P1 = { lat: 33.6938, lon: 73.019 };
  const B1 = await J('/api/point?lat=' + P1.lat + '&lon=' + P1.lon + '&complete=1', OP);
  ok(B1 && B1.ok && B1.parts && B1.parts.poolHazard && B1.parts.poolHazard.ok && B1.parts.pool && B1.parts.pool.ok, 'T2 the operator bundle holds poolHazard and pool', JSON.stringify(B1 && B1.parts && [B1.parts.poolHazard, B1.parts.pool].map((x) => x && (x.ok || x.why))));
  const L1 = mlog().filter((x) => x.path && !/meta\.json$/.test(x.path));
  const poolFc = L1.filter((x) => x.path === '/v1/forecast' && /^ecmwf_ifs025,gfs_seamless,/.test(x.models || ''));
  /* v91.17.283.28 S2: the member day totals are built from hourly rain (hour-ending PKT day), so both ensemble asks are hourly: one for the
     member day totals, one for the 3-hour windows (as before: one daily + one hourly) */
  const ensAll = L1.filter((x) => x.path === '/v1/ensemble' && x.models === 'ecmwf_ifs025'), ensDay = ensAll.length <= 2 && ensAll.length >= 1 ? [ensAll[0]] : ensAll;
  ok(poolFc.length === 1 && poolFc[0].fd === '5', 'T2 the pool’s multi-model forecast is asked once for the place (' + poolFc.map((x) => 'fd ' + x.fd).join(', ') + ')');
  ok(ensDay.length === 1, 'T2 the ensemble is asked at most twice for the place (day totals + 3-hour windows) (' + ensDay.map((x) => 'fd ' + x.fd).join(', ') + ')');
  const Q = await J('/api/quota/breakdown');
  const rows = (Q.rows || []).map((r) => r.caller);
  ok(rows.some((c) => /^place-record · /.test(c)) && !rows.some((c) => /^(pool|point-product) · /.test(c)), 'T1 the place record’s provider calls are tagged place-record, none as pool / point-product', rows.filter((c) => /^(pool|point-product|place-record) /.test(c)).join(' | '));
  const BG = JSON.parse(readFileSync(join(ROOT, 'data', 'provider-budget.json'), 'utf8'));
  ok((BG.userTags || []).includes('place-record'), 'T1 place-record is a user tag of data/provider-budget.json (the place record is essential: never shed as background)');
  /* T3 · the national pool members: two shapes of one point */
  writeFileSync(MLOG, '');
  const P3 = { lat: 31.5204, lon: 74.3587 };
  for (const fd of [7, 8]) { const r = await fetch(B + '/px/v1/forecast?__omhost=api.open-meteo.com&latitude=' + P3.lat + '&longitude=' + P3.lon + '&hourly=temperature_2m,relative_humidity_2m&forecast_days=' + fd + '&timezone=Asia%2FKarachi', { headers: { 'Sec-Fetch-Site': 'same-origin' } }); await r.arrayBuffer(); }
  const nat = mlog().filter((x) => x.path === '/v1/forecast' && x.models === 'icon_seamless,gfs_seamless,meteofrance_seamless' && x.hourly === 1);
  ok(nat.length === 1 && nat[0].fd === '8' && nat[0].pd === '3', 'T3 two request shapes of one point make ONE national members call (' + nat.map((x) => 'fd ' + x.fd + ' pd ' + x.pd).join(', ') + ')');
  /* T5 · the provider limit on the ensemble for a new place */
  ctl({ mode: '429', paths: ['/v1/ensemble'] }); writeFileSync(MLOG, '');
  const P5 = { lat: 34.0151, lon: 71.5249 };
  const B5 = await J('/api/point?lat=' + P5.lat + '&lon=' + P5.lon + '&complete=1');
  const ph = B5.parts && B5.parts.poolHazard;
  ok(ph && ph.limited === true && ph.why === 'not available right now (provider limit) - retrying' && !!ph.retryAt, 'T5 the refused part says "not available right now (provider limit) - retrying" with a retry time', JSON.stringify(ph));
  ctl({ mode: 'ok' });
  const wait = Math.max(0, Date.parse(ph && ph.retryAt || '') - Date.now()) + 6000; await sleep(Math.min(60000, wait));
  const B5b = await J('/api/point?lat=' + P5.lat + '&lon=' + P5.lon + '&complete=1');
  const ph2 = B5b.parts && B5b.parts.poolHazard;
  ok(ph2 && ph2.ok && ph2.v && ph2.v.windows3h && ph2.v.windows3h.ok && ph2.v.windows3h.windows.some((w) => w.basis === 'members'), 'T5 the part was computed again on its own and fills the same cached bundle (member windows)', JSON.stringify(ph2 && (ph2.why || ph2.ok)));
  const ens = mlog().filter((x) => (x.path === '/v1/ensemble' && x.models === 'ecmwf_ifs025') || (x.fault && x.path === '/v1/ensemble'));
  ok(ens.length <= 8, 'T5 the retry is bounded: ' + ens.length + ' ensemble requests for the place over the limit and its retry');
  /* T6 · the pages during the limit */
  const PW = __T.playwrightSync();
  if (PW.__missing) console.log('SKIP T6: ' + PW.__missing);
  else { ctl({ mode: '429', paths: ['/v1/ensemble'] });
    const br = await __T.launch(PW.chromium, { executablePath: __T.chromiumPath(), args: ['--no-sandbox'] }); const pg = await (await br.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
    const reqs = []; pg.on('request', (r) => { const u = r.url(); if (/\/api\/point\?/.test(u)) reqs.push({ u, t: Date.now() }); });
    await pg.goto(B + '/', { waitUntil: 'load', timeout: 180000 }); await pg.waitForTimeout(6000);
    await pg.click('#q'); await pg.keyboard.type('30.1984, 71.4687', { delay: 20 }); await pg.keyboard.press('Enter');
    await pg.waitForFunction(() => { const e = document.getElementById('nowT'); return e && /\d/.test(e.textContent); }, null, { timeout: 90000 }).catch(() => {});
    await pg.waitForTimeout(4000); await pg.click('#dTabs [data-t="fc"]').catch(() => {}); await pg.waitForTimeout(1500);
    const M = await pg.evaluate(() => ({ strip: (document.querySelector('#hsChance[data-limited]') || {}).textContent || '', h12: [...document.querySelectorAll('#h12Table td.agnw3c[data-limited]')].map((c) => c.textContent).join(' | '),
      dash: [...document.querySelectorAll('#hsChance [data-win]')].length, at: (() => { const x = window.AGNSTART && AGNSTART.data && AGNSTART.data.B && AGNSTART.data.B.parts && AGNSTART.data.B.parts.poolHazard; return x && x.retryAt; })() }));
    ok(/not available right now \(provider limit\) - retrying/.test(M.strip) && /provider limit/.test(M.h12) && M.dash === 0, 'T6 during the limit the strip and Next 12 hours say "not available right now (provider limit) - retrying", no bare "-" cells', JSON.stringify(M));
    ctl({ mode: 'ok' }); const n0 = reqs.length;
    for (let i = 0; i < 40; i++) { await pg.waitForTimeout(2000); const done = await pg.evaluate(() => { const x = window.AGNSTART && AGNSTART.data && AGNSTART.data.B && AGNSTART.data.B.parts && AGNSTART.data.B.parts.poolHazard; return !!(x && x.ok); }); if (done) break; } await pg.click('#dTabs [data-t="fc"]').catch(() => {}); await pg.waitForTimeout(1500);
    const M2 = await pg.evaluate(() => ({ cells: [...document.querySelectorAll('#hsChance [data-win]')].filter((c) => c.getAttribute('data-p') !== '').length, lim: !!document.querySelector('#hsChance[data-limited]') }));
    const re = reqs.slice(n0).filter((x) => /complete=1/.test(x.u)).length, other = reqs.slice(n0).filter((x) => !/complete=1/.test(x.u)).length;
    ok(M2.cells > 8 && !M2.lim && re >= 1 && re <= 2 && other === 0, 'T6 after the retry the drawer read the bundle once per server retry (' + re + ' completion read(s), ' + other + ' other place requests) and shows the chances (' + M2.cells + ' windows)', JSON.stringify(M2));
    await br.close(); }
  /* T4 · restart: the members are written at the stop and read back */
  await stop(); writeFileSync(MLOG, '');
  if (!(await start())) ok(false, 'T4 the second server started', slog.slice(-1500));
  else { const rs = /runstate\s+restored (\{.*\})/.exec(slog); let R = null; try { R = rs ? JSON.parse(rs[1]) : null; } catch (_) {}
    const r = await fetch(B + '/px/v1/forecast?__omhost=api.open-meteo.com&latitude=' + P3.lat + '&longitude=' + P3.lon + '&hourly=temperature_2m,relative_humidity_2m&forecast_days=7&timezone=Asia%2FKarachi', { headers: { 'Sec-Fetch-Site': 'same-origin' } }); await r.arrayBuffer();
    const nat2 = mlog().filter((x) => x.path === '/v1/forecast' && x.models === 'icon_seamless,gfs_seamless,meteofrance_seamless' && x.hourly === 1 && x.nLoc === 1);
    ok(R && R.pxmembers > 0 && nat2.length === 0, 'T4 after a restart the members of the point are read back (' + (R ? R.pxmembers : '?') + ' entries) and not bought again (' + nat2.length + ' calls)', rs ? rs[1] : slog.slice(-800)); }
} finally { await stop(); cleanup(); }
console.log((fail ? 'FAIL' : 'PASS') + ' budget: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
