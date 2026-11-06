#!/usr/bin/env node
/* v91.17.283 · WS7 · ONE COMMAND FOR EVERY SUITE (npm test).
   Runs every suite under scripts/tests* folders (*.test.mjs, test_*.py, *_test.py) plus scripts/test-backend.mjs, one after the other, each with
   its own time limit, and prints PASS / FAIL / SKIP per suite and the totals. Exit code 1 when any suite FAILs, else 0.

   By default it starts its own server on a COPY of this folder (os.tmpdir(), or --run-dir) on a free port, with the in-tree mock
   provider (scripts/tests283/lib/mockprovider.mjs: no network, no key; every outside call fails at once), worker, engine and Python jobs
   off; secret files (mach.key, *.key, .env, secrets/, data/token-secret) are never copied, the copy is deleted at the end and the server
   is stopped. The live folder and its data are never written.

     node scripts/run-tests.mjs                      every suite, own server
     node scripts/run-tests.mjs --only tests283,tests282start     suites whose path contains any of these
     node scripts/run-tests.mjs --skip main2         leave suites out
     node scripts/run-tests.mjs --base http://127.0.0.1:8787   use a running server instead (tests then run in this folder)
     node scripts/run-tests.mjs --list               list the suites and stop
     node scripts/run-tests.mjs --release            also the long release checks (ws8 identity, ws3 release_serve and deploy_e2e), else SKIP
     node scripts/run-tests.mjs --serve              only start the test server copy (prints its address), Ctrl+C stops it
     options: --timeout <s> (default 420 per suite) · --out <dir> (logs; default a temp folder) · --run-dir <dir> · --keep (keep the copy)
              --no-python · --station-lake <dir> (copied next to the run copy; default ../station-lake when present, or NIGRAAN_STATION_LAKE)

   A suite is SKIP when it exits with 77 (scripts/lib/testenv.mjs skip(): no Playwright, no Chromium, an outside input not on this
   machine) and printed no FAIL, or when Python or a Python package it needs is not installed. A FAIL printed before the skip still FAILs.
   Only one NIGRAAN server runs at a time: before a suite that starts its own server the shared one is stopped, and started again for
   the next suite that needs it. If the shared server dies under a suite (out of memory), it is restarted and that suite runs once more.
   Works the same on Windows: paths are built with path.join, no shell is used. */
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, mkdtempSync, createWriteStream } from 'node:fs';
import { join, relative, sep, dirname, basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import { ROOT, freePort, playwrightEntry, chromiumPath, PYTHON, IS_WIN, SKIP_EXIT, fileUrl } from './lib/testenv.mjs';

const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf('--' + k); return i >= 0 && A[i + 1] && !A[i + 1].startsWith('--') ? A[i + 1] : d; };
const flag = (k) => A.includes('--' + k);
const ONLY = (opt('only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const SKIPS = (opt('skip', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const TIMEOUT_S = Number(opt('timeout', '420'));
const EXT_BASE = opt('base', '');
const NO_PY = flag('no-python');
const OUT = flag('list') ? null : resolve(opt('out', '') || mkdtempSync(join(tmpdir(), 'nigraan-test-logs-')));
if (OUT) mkdirSync(OUT, { recursive: true });

/* per-suite settings learnt from the suites themselves */
const TIMEOUTS = { 'tests28320/pages.test.mjs': 2400, 'tests76/scenario_mobile.test.mjs': 1200, 'tests28329/pages_consistency.test.mjs': 1500, 'tests28322/pages.test.mjs': 1800, 'tests28322/budget.test.mjs': 1200, 'tests28321/pages.test.mjs': 1500, 'tests266/main2.test.mjs': 2700, 'tests270/reports270.test.mjs': 1200, 'tests281/': 1500, 'test-backend.mjs': 600, 'tests76/ai.test.mjs': 1200 };
const BASE_FLAG = new Set(['test-backend.mjs', 'tests270/ops.test.mjs', 'tests274/drought274.test.mjs']);   /* take --base <url> */
const FIRST = ['tests283/facts.test.mjs'];   /* reads cold timings: run right after the server starts */
const LAST = ['tests266/main2.test.mjs'];
/* suites that take no server argument: every workstream suite under tests283/wsN (their argv[2] is a tree or a flag, or nothing) */
const noArgs = (rel) => /^tests283\/ws\d+\//.test(rel);
/* suites that start their own server through a helper the source scan below cannot see; each gets a free port in its env variable
   (WS1 and WS4 use the port and the next one) */
const OWN_SERVER = { 'tests283/ws4/ws4.test.mjs': 'WS4_PORT', 'tests283/ws1/ws1.test.mjs': 'WS1_PORT', 'tests28322/budget.test.mjs': 'T28322_PORT' };   /* v91.17.283.22 · the budget suite runs its own server */
/* LONG suites: steps, run only with --release (else listed as SKIP with the reason). judge(outputs) -> {status, why, p, f}. */
const plainJudge = (out) => { const p = (out.match(/^\s*(PASS\b|ok \d+)/gm) || []).length, f = (out.match(/^\s*(FAIL\b|not ok \d+)/gm) || []).length; return { status: f ? 'FAIL' : 'PASS', p, f, why: f ? f + ' check(s) failed' : '' }; };
const LONG = {
  /* WS8 identity: record the page's network answers from the test server, dump the page path and the science path on those frozen
     inputs, compare (any difference FAILs). About 7 min per issue per path. */
  'tests283/ws8/identity.mjs': { timeout: 4 * 3600, steps: (file, base, tmp) => [
    [file, 'record', join(tmp, 'cache.json'), base], [file, 'dump', 'page', join(tmp, 'cache.json'), join(tmp, 'page.json')],
    [file, 'dump', 'science', join(tmp, 'cache.json'), join(tmp, 'science.json')], [file, 'compare', join(tmp, 'page.json'), join(tmp, 'science.json')]],
    judge: (out) => { let r = null; for (const l of out.split('\n').reverse()) { try { const j = JSON.parse(l); if (j && 'cells' in j && 'diff' in j) { r = j; break; } } catch (_) {} }
      if (!r) return { status: 'FAIL', why: 'no comparison result' };
      const bad = r.diff + (r.fullDiff || 0); return { status: !bad && r.cells > 0 ? 'PASS' : 'FAIL', p: bad ? 0 : 1, f: bad ? 1 : 0, why: r.cells + ' cells, ' + r.diff + ' differences, ' + (r.fullDiff || 0) + ' in the 60 places' }; } },
  /* WS3: the packaged release starts and serves (about 3 min, 1.5 GB of disk) */
  'tests283/ws3/release_serve.test.mjs': { timeout: 1800, ownServer: true, steps: (file) => [[file]], judge: plainJudge },
  /* WS3: deploy / rollback end to end with the real supervisor and PowerShell 7 (about 45 min; needs bash and pwsh) */
  'tests283/ws3/deploy_e2e.sh': { timeout: 3 * 3600, ownServer: true, cmd: 'bash', needs: ['bash', 'pwsh'], steps: (file) => [[file]], judge: plainJudge },
};
const RELEASE = flag('release');
/* a suite that starts its own NIGRAAN server: the shared test server is stopped first (two servers at once run a small machine out of
   memory) and started again for the next suite that needs it */
/* these spawn a server only when no address is given (tests268) or need the shared server beside their own (srv279: a standby) */
const USES_SHARED = new Set(['tests268/reports.test.mjs', 'tests279safe/srv279.test.mjs', 'tests28310e/exp_server_report.test.mjs']);   /* v91.17.283.10: it spawns a lock holder, not a server */
const ownsServer = (rel) => { if (USES_SHARED.has(rel)) return false; if (OWN_SERVER[rel] || (LONG[rel] && LONG[rel].ownServer)) return true; try { const t = readFileSync(join(ROOT, 'scripts', ...rel.split('/')), 'utf8'); return /ownServer\(/.test(t) || (/\bspawn(Sync)?\(/.test(t) && /server(\.mjs'|', 'server\.mjs'|\/server\.mjs)/.test(t)); } catch (_) { return false; } };

/* ── discover ── */
const posix = (p) => p.split(sep).join('/');
function discover(root) {
  const S = join(root, 'scripts'), out = [];
  const walk = (d) => { for (const n of readdirSync(d).sort()) { const p = join(d, n); const st = statSync(p);
    if (st.isDirectory()) { if (n !== 'lib' && n !== 'fixtures' && n !== 'node_modules') walk(p); }
    else if (/\.test\.mjs$/.test(n) || (!NO_PY && (/^test_.*\.py$/.test(n) || /_test\.py$/.test(n)))) out.push(posix(relative(S, p))); } };
  for (const n of readdirSync(S).sort()) if (/^tests/.test(n) && statSync(join(S, n)).isDirectory()) walk(join(S, n));
  if (existsSync(join(S, 'test-backend.mjs'))) out.unshift('test-backend.mjs');
  for (let i = out.length - 1; i >= 0; i--) if (LONG[out[i]]) out.splice(i, 1);
  for (const l of Object.keys(LONG)) if (existsSync(join(S, ...l.split('/')))) out.push(l);
  const rank = (s) => FIRST.includes(s) ? 0 : LAST.includes(s) ? 2 : 1;
  return out.filter((s) => (!ONLY.length || ONLY.some((o) => s.includes(o))) && !SKIPS.some((o) => s.includes(o)))
    .sort((a, b) => rank(a) - rank(b));
}
const suites = discover(ROOT);
if (flag('list')) { for (const s of suites) console.log(s); console.log(suites.length + ' suites'); process.exit(0); }

/* ── environment for every suite ── */
const PW = playwrightEntry(), CH = chromiumPath();
console.log('NIGRAAN test runner · ' + suites.length + ' suites · node ' + process.version + ' ' + process.platform);
console.log('  Playwright: ' + (PW || 'not found (browser suites will SKIP)') + ' · Chromium: ' + (CH || 'not found (browser suites will SKIP)'));
console.log('  logs: ' + OUT);

/* ── the run copy and its server ── */
const SECRET = /(^|[\\/])(mach\.key|[^\\/]*\.key|\.env|secrets|token-secret|[^\\/]*\.pem)$/i;
const NOT_COPIED = (rel) => /^(node_modules|\.git)([\\/]|$)/.test(rel) || /^data[\\/](run|server\.log|nigraan-db\.json\.prev|\.store\.lock)$/.test(rel) || /^data[\\/]crash-.*\.log$/.test(rel) || SECRET.test(rel);
let RUN = null, APP = ROOT, BASE = EXT_BASE.replace(/\/$/, ''), srv = null, srvLog = null, PORT = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isDead = (c) => !c || c.exitCode !== null || c.signalCode !== null;   /* a process killed by a signal (e.g. the OOM killer) keeps exitCode null */
let current = null;   /* the suite running now (stopped on Ctrl+C) */
const health = () => new Promise((res) => { const r = http.get({ host: '127.0.0.1', port: PORT, path: '/health', agent: false, timeout: 3000 }, (x) => { let b = ''; x.on('data', (c) => { b += c; }); x.on('end', () => { try { res(JSON.parse(b)); } catch (_) { res(null); } }); }); r.on('error', () => res(null)); r.on('timeout', () => { r.destroy(); res(null); }); });
async function startServer() {
  const env = { ...process.env, PORT: String(PORT), MACH_API_KEY: 'MOCK-NOT-A-KEY', NIGRAAN_PYJOBS: '0', NIGRAAN_ENGINE: '0', NIGRAAN_WORKER: '0', NIGRAAN_CALL_BUDGET: process.env.NIGRAAN_CALL_BUDGET || 'off' };
  delete env.OPEN_METEO_API_KEY; delete env.NIGRAAN_DATA_DIR; delete env.HOST;
  srvLog = createWriteStream(join(OUT, 'server.log'), { flags: 'a' });
  srv = spawn(process.execPath, ['--import', fileUrl(join(APP, 'scripts', 'tests283', 'lib', 'mockprovider.mjs')), join(APP, 'server', 'server.mjs')], { cwd: APP, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  srv.stdout.pipe(srvLog, { end: false }); srv.stderr.pipe(srvLog, { end: false });
  for (let i = 0; i < 240 && !isDead(srv); i++) { const h = await health(); if (h && h.warm === true) return true; await sleep(1000); }
  return false;
}
function stopTree(ch) {
  if (isDead(ch)) return;
  if (IS_WIN) spawnSync('taskkill', ['/PID', String(ch.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else { try { process.kill(-ch.pid, 'SIGKILL'); } catch (_) { try { ch.kill('SIGKILL'); } catch (__) {} } }
}
async function stopServer() {
  if (isDead(srv)) return;
  try { srv.kill('SIGINT'); } catch (_) {}
  for (let i = 0; i < 20 && !isDead(srv); i++) await sleep(250);
  if (!isDead(srv)) { if (IS_WIN) spawnSync('taskkill', ['/PID', String(srv.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); else try { srv.kill('SIGKILL'); } catch (_) {} }
}
let cleaned = false;
async function cleanup() {
  if (cleaned) return; cleaned = true;
  stopTree(current);
  await stopServer();
  if (RUN && !flag('keep')) { for (let i = 0; i < 5; i++) { try { rmSync(RUN, { recursive: true, force: true }); break; } catch (_) { await sleep(1000); } } }
}
process.on('SIGINT', async () => { await cleanup(); process.exit(130); });
process.on('exit', () => { stopTree(current); if (!isDead(srv)) { try { srv.kill('SIGKILL'); } catch (_) {} } });   /* never leave a server behind */

if (!BASE) {
  const parent = opt('run-dir', '') || tmpdir(); mkdirSync(parent, { recursive: true });
  RUN = mkdtempSync(join(parent, 'nigraan-run-')); APP = join(RUN, 'nigraan-local');
  console.log('  copying ' + ROOT + ' -> ' + APP + ' (secrets and runtime files left out) ...');
  cpSync(ROOT, APP, { recursive: true, filter: (src) => { const rel = relative(ROOT, src); return !rel || !NOT_COPIED(rel); } });
  const lake = opt('station-lake', '') || process.env.NIGRAAN_STATION_LAKE || join(ROOT, '..', 'station-lake');
  if (existsSync(lake)) { cpSync(lake, join(RUN, 'station-lake'), { recursive: true, filter: (src) => !SECRET.test(src) }); console.log('  station-lake copied from ' + lake); }
  PORT = await freePort(); BASE = 'http://127.0.0.1:' + PORT;
  process.stdout.write('  starting the test server on ' + BASE + ' (mock provider) ... ');
  const up = await startServer();
  console.log(up ? 'warm' : 'NOT UP (see ' + join(OUT, 'server.log') + ')');
  if (!up) { await cleanup(); process.exit(1); }
}

/* --serve: only start the test server copy and keep it until Ctrl+C (for running one suite by hand against it) */
if (flag('serve')) {
  if (EXT_BASE) { console.log('--serve starts its own server; leave out --base'); process.exit(2); }
  console.log('SERVING ' + BASE + '  (run copy ' + APP + '; Ctrl+C stops the server and deletes the copy)');
  process.on('SIGTERM', async () => { await cleanup(); process.exit(0); });
  await new Promise(() => {});
}

/* ── run ── */
let OWNP = 0;
const runOne = async (rel) => { if (OWN_SERVER[rel]) { do { OWNP = await freePort(); } while (OWNP >= 65535); } return runOne0(rel); };
const runOne0 = (rel) => new Promise((res) => {
  const file = join(APP, 'scripts', ...rel.split('/')); const py = /\.py$/.test(rel);
  const to = (Object.entries(TIMEOUTS).find(([k]) => rel.includes(k)) || [0, TIMEOUT_S])[1] * 1000;
  const args = py ? [file] : [file, ...(noArgs(rel) ? [] : BASE_FLAG.has(rel) ? ['--base', BASE] : [BASE])];
  const env = { ...process.env, NIGRAAN_BASE: BASE, BASE, NIGRAAN_URL: BASE, NIGRAAN_RUNNER: '1', NIGRAAN_CALL_BUDGET: process.env.NIGRAAN_CALL_BUDGET || 'off',
    MOCK_PROVIDER: process.env.MOCK_PROVIDER || join(APP, 'scripts', 'tests283', 'lib', 'mockprovider.mjs') };   /* the daily call budget is off for mock runs (a suite that tests the budget sets its own) */
  if (PW) env.NIGRAAN_PLAYWRIGHT = PW; if (CH) env.NIGRAAN_CHROMIUM = CH;
  delete env.PORT;
  if (OWN_SERVER[rel]) env[OWN_SERVER[rel]] = String(OWNP);
  const t0 = Date.now(); let out = ''; let timedOut = false;
  let ch;
  try { ch = current = spawn(py ? PYTHON : process.execPath, args, { cwd: APP, env, stdio: ['ignore', 'pipe', 'pipe'], detached: !IS_WIN, windowsHide: true }); }
  catch (e) { return res({ rel, status: 'SKIP', why: 'could not start ' + (py ? PYTHON : 'node') + ': ' + e.message, p: 0, f: 0, s: 0, out: '' }); }
  ch.stdout.on('data', (c) => { out += c; }); ch.stderr.on('data', (c) => { out += c; });
  const timer = setTimeout(() => { timedOut = true; stopTree(ch); }, to);
  ch.on('error', (e) => { clearTimeout(timer); res({ rel, status: 'SKIP', why: (py ? 'Python' : 'node') + ' not available (' + e.code + '); set NIGRAAN_PYTHON', p: 0, f: 0, s: (Date.now() - t0) / 1000, out }); });
  ch.on('close', (code) => {
    clearTimeout(timer);
    const body = out.replace(/^(PASS|FAIL) [\w.\-() ]+: \d+ passed, \d+ failed.*$/gm, '');   /* a suite's own summary line is not a check */
    const p = (body.match(/^\s*(PASS\b|ok \d+)/gm) || []).length, f = (body.match(/^\s*(FAIL\b|not ok \d+)/gm) || []).length;
    const s = Math.round((Date.now() - t0) / 100) / 10;
    let status, why = '';
    const skipLine = (out.match(/^SKIP \(whole file\) (.*)$/m) || [])[1];
    const pyMissing = py && (out.match(/ModuleNotFoundError: No module named '([^']+)'/) || [])[1];
    if (timedOut) { status = 'FAIL'; why = 'timed out after ' + to / 1000 + ' s'; }
    else if (code === SKIP_EXIT && !f) { status = 'SKIP'; why = skipLine || 'exit 77'; }
    else if (pyMissing && !f) { status = 'SKIP'; why = 'Python package ' + pyMissing + ' not installed'; }
    else if (f || code !== 0) { status = 'FAIL'; why = f ? f + ' check(s) failed' : 'exit ' + code + ' (' + (out.trim().split('\n').pop() || '').slice(0, 160) + ')'; }
    else status = 'PASS';
    res({ rel, status, why, p, f, s, code, out });
  });
});

async function runLong(rel) {
  const L = LONG[rel]; const t0 = Date.now();
  if (!RELEASE) return { rel, status: 'SKIP', why: 'long suite (release check): run with --release', p: 0, f: 0, s: 0, out: '' };
  const tmp = mkdtempSync(join(tmpdir(), 'nigraan-long-')); let out = '';
  try {
    for (const n of L.needs || []) { const v = spawnSync(n, ['--version'], { stdio: 'ignore', windowsHide: true }); if (v.error) return { rel, status: 'SKIP', why: n + ' is not installed', p: 0, f: 0, s: 0, out: '' }; }
    for (const st of L.steps(join(APP, 'scripts', ...rel.split('/')), BASE, tmp)) {
      const r = spawnSync(L.cmd || process.execPath, st, { cwd: APP, encoding: 'utf8', timeout: L.timeout * 1000, maxBuffer: 1 << 28, windowsHide: true, env: { ...process.env, NIGRAAN_BASE: BASE, NIGRAAN_CALL_BUDGET: process.env.NIGRAAN_CALL_BUDGET || 'off', MOCK_PROVIDER: process.env.MOCK_PROVIDER || join(APP, 'scripts', 'tests283', 'lib', 'mockprovider.mjs') } });
      out += '$ ' + (L.cmd || 'node') + ' ' + st.map((x) => relative(APP, x) || x).join(' ') + '\n' + (r.stdout || '') + (r.stderr || '');
      if (r.status !== 0) return { rel, status: 'FAIL', why: 'step "' + (st[1] || basename(st[0])) + '" ' + (r.error ? r.error.message : 'exit ' + r.status), p: 0, f: 1, s: Math.round((Date.now() - t0) / 1000), out };
    }
    return { rel, ...L.judge(out), s: Math.round((Date.now() - t0) / 1000), out };
  } finally { try { rmSync(tmp, { recursive: true, force: true }); } catch (_) {} }
}

const results = [];
try {
  const restart = async (why) => { console.log('  (' + why + '; restarting the test server)'); PORT = await freePort(); BASE = 'http://127.0.0.1:' + PORT; return startServer(); };
  for (const rel of suites) {
    const own = !EXT_BASE && ownsServer(rel);
    if (own && !isDead(srv)) { await stopServer(); srv = null; }   /* one NIGRAAN server at a time */
    if (!EXT_BASE && !own && isDead(srv) && !(LONG[rel] && !RELEASE)) await restart(srv ? 'the server had stopped (' + (srv.signalCode || 'exit ' + srv.exitCode) + ') before ' + rel : 'starting it again after a suite with its own server');
    if (LONG[rel]) { const r = await runLong(rel); results.push(r); writeFileSync(join(OUT, rel.replace(/[\\/]/g, '_') + '.log'), r.out || '');
      console.log(r.status.padEnd(4) + '  ' + rel.padEnd(46) + ' ' + String(r.p || 0).padStart(4) + ' pass ' + String(r.f || 0).padStart(3) + ' fail  ' + String(r.s).padStart(6) + ' s' + (r.why ? '  · ' + r.why : '')); continue; }
    let r = await runOne(rel);
    /* the server died under this suite (out of memory, a crash): restart it and run the suite once more, and say so */
    if (!EXT_BASE && !own && isDead(srv)) { const sig = srv.signalCode || 'exit ' + srv.exitCode; if (await restart('the server stopped (' + sig + ') during ' + rel)) { r = await runOne(rel); r.why = (r.why ? r.why + '; ' : '') + 'run again after the server stopped (' + sig + ')'; } }
    results.push(r);
    writeFileSync(join(OUT, rel.replace(/[\\/]/g, '_') + '.log'), r.out);
    console.log(r.status.padEnd(4) + '  ' + rel.padEnd(46) + ' ' + String(r.p).padStart(4) + ' pass ' + String(r.f).padStart(3) + ' fail  ' + String(r.s).padStart(6) + ' s' + (r.why ? '  · ' + r.why : ''));
  }
} finally { await cleanup(); }

const n = (st) => results.filter((r) => r.status === st).length;
const P = n('PASS'), F = n('FAIL'), S = n('SKIP');
writeFileSync(join(OUT, 'summary.tsv'), results.map((r) => [r.status, r.rel, r.p, r.f, r.s, r.why].join('\t')).join('\n') + '\n');
writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ at: new Date().toISOString(), base: EXT_BASE || 'own server (mock provider)', pass: P, fail: F, skip: S,
  checks: { pass: results.reduce((a, r) => a + r.p, 0), fail: results.reduce((a, r) => a + r.f, 0) }, suites: results.map(({ out, ...r }) => r) }, null, 1));
console.log('\nSUMMARY  ' + results.length + ' suites:  PASS ' + P + '  FAIL ' + F + '  SKIP ' + S + '   (checks: ' + results.reduce((a, r) => a + r.p, 0) + ' pass, ' + results.reduce((a, r) => a + r.f, 0) + ' fail)');
if (F) { console.log('FAILED suites:'); for (const r of results.filter((x) => x.status === 'FAIL')) console.log('  ' + r.rel + '  · ' + r.why); }
if (S) { console.log('SKIPPED suites:'); for (const r of results.filter((x) => x.status === 'SKIP')) console.log('  ' + r.rel + '  · ' + r.why); }
console.log('logs: ' + OUT);
process.exitCode = F ? 1 : 0;
