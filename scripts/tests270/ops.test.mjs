/* v91.17.270 · OPS · tests (no provider key, no network).
   node scripts/tests270/ops.test.mjs                       unit part only (no server): ensArchive first run through the scheduler
   node scripts/tests270/ops.test.mjs --base http://127.0.0.1:8787 [--phase 1|2]   + the running server (a test copy, mock provider):
     phase 1: version label, stale reasons on /health, per-caller record counted and readable, held climatology rebuild (when the
              table is missing and the worker has run its first checks tick)
     phase 2 (after the same server was stopped with SIGINT and started again): the day's per-caller record survived the restart */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const a = process.argv.slice(2); const arg = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const BASE = arg('base', null), PHASE = arg('phase', '1');
let P = 0, F = 0; const ok = (c, n, d = '') => { if (c) { P++; console.log('PASS ' + n); } else { F++; console.log('FAIL ' + n + ' :: ' + String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 500)); } };
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

/* ── unit: the ensemble archive's first check goes through the scheduler (gated on a standby server, a bulk slot) ── */
{
  const T = mkdtempSync(join(tmpdir(), 'ops270-ens-')); const app0 = join(T, 'nigraan-local'), data = join(app0, 'data'), sl = join(T, 'station-lake', 'scripts');
  mkdirSync(data, { recursive: true }); mkdirSync(sl, { recursive: true });
  const marker = join(T, 'ran.txt');
  writeFileSync(join(sl, 'ens_archive.py'), 'import sys\nopen(' + JSON.stringify(marker) + ', "a").write("x")\n');
  const timers = []; const realST = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...r) => { const t = realST(() => {}, 0); timers.push({ fn, ms }); return t; };   /* capture, do not wait 5 minutes */
  const { createScheduler } = await import(join(ROOT, 'server/api/scheduler.mjs'));
  const { createEnsArchive } = await import(join(ROOT, 'server/api/ensarchive.mjs'));
  process.env.NIGRAAN_PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  const app = { scheduler: createScheduler() }; let gateOpen = false; app.scheduler.setGate(() => gateOpen);
  createEnsArchive(app, app0, data);
  globalThis.setTimeout = realST;
  const first = timers.filter((t) => t.ms === 5 * 60 * 1000);
  ok(first.length === 1, 'E1 one first check, 5 minutes after start (no second, bare timer beside the scheduler)', timers.map((t) => t.ms));
  const job = () => app.scheduler.list().jobs.find((j) => j.id === 'ensArchive');
  ok(job() && job().heavy === 'bulk' && job().everyMin === 15, 'E2 the job is on the scheduler: every 15 min, bulk slot', job());
  first[0].fn(); await new Promise((r) => realST(r, 300));
  ok(job().runs === 0 && job().skipped === 1 && !existsSync(marker), 'E3 on a standby (gate closed) the first check starts no script', job());
  gateOpen = true; first[0].fn();
  for (let i = 0; i < 50 && !existsSync(marker); i++) await new Promise((r) => realST(r, 100));
  ok(job().runs === 1 && existsSync(marker), 'E4 on the writer the first check runs the script once', job());
  rmSync(T, { recursive: true, force: true });
}
/* static: no bare first-run timer left in ensarchive.mjs; the national run marks its places background; the queue has the rule */
{
  const ens = readFileSync(join(ROOT, 'server/api/ensarchive.mjs'), 'utf8'), nat = readFileSync(join(ROOT, 'server/api/national.mjs'), 'utf8'), ver = readFileSync(join(ROOT, 'server/api/verification.mjs'), 'utf8');
  ok(!/setTimeout\(\(\) => \{ run\(\)/.test(ens) && /firstMs: 5 \* 60 \* 1000/.test(ens), 'E5 ensarchive.mjs: the first check only through schedule(firstMs)');
  ok(/servedChainAsync\(L0, batch\[k\]\.lat, batch\[k\]\.lon, optsOf\(k\), \{ background: true \}\)/.test(nat) && /function nextJob\(\)/.test(ver) && /const FG_TURNS = 4, BG_SLICE_MS = 10;/.test(ver) && /setBackground\(job.bg\)/.test(ver) && /export function setBackground/.test(readFileSync(join(ROOT, "server/api/lgbpool.mjs"), "utf8")), 'N1 national places queued as background: customer jobs first (at most 4 in a row while one waits), 10 ms background slices, background tree batches only to an idle worker');
}
ok(/^91\.17\.(27\d|2[89]\d|[3-9]\d\d)(\.\d+)?$/.test(pkg.version), 'V1 package.json names this release (91.17.270 or later; v91.17.271: no longer pinned to 270; v91.17.273.1: a fix release 91.17.N.M too)', pkg.version);

if (BASE) {
  const j = async (p, o) => { const r = await fetch(BASE + p, o); return { s: r.status, j: await r.json().catch(() => null) }; };
  if (PHASE === '1') {
    const h = (await j('/health')).j;
    ok(h && h.serviceVersion === pkg.version + '-local', 'V2 /health serviceVersion is the package version', h && h.serviceVersion);
    ok(h && h.chain && h.chain.app === pkg.version, 'V3 /health chain.app is the package version', h && h.chain);
    ok(h && h.jobs && h.jobs.staleWhy && typeof h.jobs.staleWhy === 'object' && (h.jobs.stale || []).every((id) => typeof h.jobs.staleWhy[id] === 'string' && h.jobs.staleWhy[id].length > 5), 'H1 /health names why each stale job is stale', h && h.jobs);
    const ea = h && h.jobs && h.jobs.staleWhy && h.jobs.staleWhy.ensArchive;
    if (arg('expect-ens-missed', null)) ok(ea && /run missed: ecmwf_ifs025_ensemble_mean/.test(ea), 'H2 the ensemble archive is stale because the ensemble-mean run was not saved (the 16 Oct case), and /health says so', h.jobs);
    for (let i = 0; i < 3; i++) await fetch(BASE + '/px/v1/forecast?__omhost=api.open-meteo.com&latitude=' + (31.5 + i / 100) + '&longitude=74.35&hourly=temperature_2m&forecast_days=2&timezone=UTC', { headers: { referer: BASE + '/analyst' } }).then((r) => r.arrayBuffer());
    const b = (await j('/api/quota/breakdown')).j;
    const page = b && b.rows.find((r) => r.caller === 'page / · forecast /v1/forecast');
    ok(page && page.calls >= 3 && b.record && /quota-callers\/qbr-\d{4}-\d{2}-\d{2}\.jsonl$/.test(b.record.file) && b.totalWeighted >= page.weighted, 'Q1 /api/quota/breakdown: the page calls counted, the day file named', b);
    writeFileSync(join(tmpdir(), 'ops270-qbr-before.json'), JSON.stringify(b));
    if (arg('expect-backend', null)) ok(b && b.rows.some((r) => /^backend [\w-]+ · \w+ \/v1\//.test(r.caller)), 'Q2 the backend\'s own provider calls are in the record with their module', b && b.rows.map((r) => r.caller));
    if (arg('expect-held', null)) {
      const c = (await j('/api/checks')).j; const hd = c && c.rebuildHeld && c.rebuildHeld.climatology;
      ok(hd && /climatology\.json is missing or not ready/.test(hd.why) && hd.estimatedWeightedCalls > 200000 && /api\/checks\/run\?what=climatology/.test(hd.operatorAction), 'C1 climatology.json missing: no rebuild started, the state and the operator command on /api/checks', hd);
      ok(c && c.climatology && c.climatology.building === false && !c.climatology.ready, 'C2 nothing is building', c && c.climatology);
      const { execFileSync } = await import('node:child_process');   /* an operator token, made as test-backend.mjs does (never printed) */
      const tok = execFileSync(process.execPath, [join(ROOT, 'scripts/issue-token.mjs'), '--sub', 'operator1', '--roles', 'operator'], { encoding: 'utf8', cwd: ROOT }).trim();
      const al = (await j('/api/v1/ingestion/observability/alerts', { headers: { authorization: 'Bearer ' + tok, accept: 'application/vnd.agn+json', 'x-agn-api-version': '1.0' } })).j;
      const list = al && (Array.isArray(al.data) ? al.data : (al.data && (al.data.items || al.data.alerts)) || al.alerts || []); const hit = Array.isArray(list) && list.find((x) => x.type === 'rebuild_held' && x.status === 'open');
      ok(!!hit && /api\/checks\/run\?what=climatology/.test(hit.message), 'C3 an operator alert is open (rebuild_held) with the command', al);
      const ops = (await j('/api/ops/health')).j; const row = ops && (ops.jobs || []).find((x) => x.id === 'climatology');
      ok(row && /operator: curl -X POST/.test(row.label), 'C4 the ops board row says the rebuild waits for the operator', row);
    }
  } else {
    const before = JSON.parse(readFileSync(join(tmpdir(), 'ops270-qbr-before.json'), 'utf8'));
    const b = (await j('/api/quota/breakdown')).j;
    const p0 = before.rows.find((r) => r.caller === 'page / · forecast /v1/forecast'), p1 = b && b.rows.find((r) => r.caller === 'page / · forecast /v1/forecast');
    try { rmSync(join(tmpdir(), 'ops270-qbr-before.json'), { force: true }); } catch (_) {}
    ok(p0 && p1 && p1.calls >= p0.calls && b.record.lines >= 1, 'Q3 after a restart the day\'s per-caller record still holds the earlier calls', { before: p0, after: p1, record: b && b.record });
  }
}
console.log('\n' + (F ? 'FAIL' : 'PASS') + ' ops270 (node): ' + P + ' passed, ' + F + ' failed'); process.exit(F ? 1 : 0);
