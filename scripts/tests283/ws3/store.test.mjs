// v91.17.283 · WS3 items 1-3 · the durable store: large-collection change detection (open -> approved reaches the disk), the final
// write at stop (flushNow during a background write, process exit, SIGTERM, timeout), recovery order (newest good snapshot), replace().
// usage: node scripts/tests283/ws3/store.test.mjs [tree]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { TREE, mod, ok, tmp, step, done, sleep } from './_lib.mjs';

const { createStore } = await mod('server/api/store.mjs');
const disk = (st) => JSON.parse(readFileSync(st.file, 'utf8'));
const pad = 'x'.repeat(1100);
async function bigActions(st, n = 1100) {   /* > 1 MB: the "large collection" path that reuses kept bytes */
  const rows = []; for (let i = 0; i < n; i++) rows.push({ actionId: 'act_' + i, status: 'open', version: 1, pad, history: [] });
  await st.insertMany('actions', rows); await st.save();
}

await step('1a find() + change + save() reaches the disk (large collection)', async () => {
  const st = createStore(tmp('s1a')); await bigActions(st);
  await st.save();   /* a second build: the kept bytes are now reused for an unwritten collection */
  const a = st.find('actions', (x) => x.actionId === 'act_7'); a.status = 'approved'; a.version = 2;
  await st.save();
  const r = disk(st).collections.actions.find((x) => x.actionId === 'act_7');
  ok(r && r.status === 'approved' && r.version === 2, '1a open -> approved in memory is approved on disk after save()', 'disk: ' + (r && r.status + ' v' + r.version));
});

await step('1b operations.actions.update (work.mjs) persists the approval', async () => {
  const st = createStore(tmp('s1b')); await bigActions(st); await st.save();
  const { createWork } = await mod('server/api/work.mjs');
  const app = { store: st, audit: { record: async () => ({}) }, units: { all: [] }, dataDir: join(TREE, 'data') };
  const W = createWork(app);
  const ctx = { identity: { actorId: 'u2', scopes: ['*'], roles: ['admin'] } };
  st.find('actions', (x) => x.actionId === 'act_3').created_by = 'u1';
  await W.handlers['operations.actions.update'](null, { path: { action_id: 'act_3' }, body: { version: 1, status: 'in_progress' } }, ctx);
  const r = disk(st).collections.actions.find((x) => x.actionId === 'act_3');
  ok(r && r.status === 'in_progress' && r.version === 2, '1b the handler answer equals the disk', 'disk: ' + (r && r.status + ' v' + r.version));
});

await step('1c filter() rows and all() replacement are detected; an untouched large collection is not rebuilt', async () => {
  const st = createStore(tmp('s1c')); await bigActions(st); await st.save(); await st.save();
  const rows = st.filter('actions', (x) => x.actionId === 'act_9' || x.actionId === 'act_10');
  rows[0].status = 'cancelled';
  await st.save();
  ok(disk(st).collections.actions.find((x) => x.actionId === rows[0].actionId).status === 'cancelled', '1c filter() row change on disk');
  const all = st.all('actions'); all[5] = { ...all[5], status: 'closed' };
  await st.save();
  ok(disk(st).collections.actions[5].status === 'closed', '1c all() row replacement on disk');
  if (typeof st.writeStats().rebuild.detected === 'number') {
    const before = st.writeStats().rebuild.byCollection.actions || 0;
    await st.insert('jobs', { job_id: 'j1' }); await st.save('jobs');
    const after = st.writeStats().rebuild.byCollection.actions || 0;
    ok(after === before, '1c saving another collection does not rebuild the untouched large one', before + ' -> ' + after);
  } else ok(false, '1c writeStats().rebuild.detected exists');
});

await step('2a (regression) flushNow() during a background write writes the newest state', async () => {
  const st = createStore(tmp('s2a')); await bigActions(st, 200);
  await st.insert('quotaWindows', { providerId: 'p', day: 'd', calls: 1 });
  const w = st.find('quotaWindows', (x) => x.providerId === 'p');
  const pend = st.save();   /* a background write starts */
  await sleep(30);
  w.calls = 99; st.saveSoon();   /* a deferred counter after the write was serialised */
  const r = st.flushNow();
  try { await pend; } catch (_) {}
  await sleep(100);
  const c = disk(st).collections.quotaWindows[0].calls;
  ok(c === 99, '2a the counter changed during the write is on disk after flushNow()', 'disk calls ' + c + '; flushNow -> ' + JSON.stringify(r));
});

const childScript = (dir, mode) => `
import { createStore } from ${JSON.stringify(pathToFileURL(join(TREE, 'server/api/store.mjs')).href)};
const st = createStore(${JSON.stringify(dir)});
await st.insert('quotaWindows', { providerId: 'p', day: 'd', calls: 1 });
st.find('quotaWindows', (x) => x.providerId === 'p').calls = 42; st.saveSoon();   /* deferred: up to 60 s */
${mode === 'exit' ? 'process.exit(0);' : mode === 'sigterm' ? "process.stdout.write('ready\\n'); setInterval(() => {}, 1000);" : ''}
`;
await step('2b process.exit() right after a deferred change: the change is on disk', async () => {
  const d = tmp('s2b'); const f = join(d, 'c.mjs'); writeFileSync(f, childScript(d, 'exit'));
  const r = spawnSync(process.execPath, [f], { encoding: 'utf8', timeout: 30000 });
  let c = null; try { c = JSON.parse(readFileSync(join(d, 'nigraan-db.json'), 'utf8')).collections.quotaWindows[0].calls; } catch (_) {}
  ok(c === 42, '2b exit: deferred counter written by the exit hook', 'disk calls ' + c + ' (exit ' + r.status + ')');
});
await step('2c SIGTERM to a process that opened a store: final write, then it ends', async () => {
  const d = tmp('s2c'); const f = join(d, 'c.mjs'); writeFileSync(f, childScript(d, 'sigterm'));
  const ch = spawn(process.execPath, [f], { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((res) => { ch.stdout.on('data', (b) => { if (String(b).includes('ready')) res(); }); setTimeout(res, 15000); });
  ch.kill('SIGTERM');
  const code = await new Promise((res) => { const t = setTimeout(() => { ch.kill('SIGKILL'); res('killed'); }, 15000); ch.on('exit', (c, s) => { clearTimeout(t); res(c == null ? s : c); }); });
  let c = null; try { c = JSON.parse(readFileSync(join(d, 'nigraan-db.json'), 'utf8')).collections.quotaWindows[0].calls; } catch (_) {}
  ok(c === 42 && code !== 'killed', '2c SIGTERM: deferred counter on disk and the process ended', 'disk calls ' + c + ', exit ' + code);
});
await step('2d a final write that cannot land returns ok:false within the timeout', async () => {
  const d = tmp('s2d'); const st = createStore(d); await st.insert('jobs', { job_id: 'a' });
  /* the synchronous write's temp file becomes a folder: every attempt fails */
  const { rmSync } = await import('node:fs'); mkdirSync(join(st.file + '.tmp', 'x'), { recursive: true });
  st.find('jobs', () => true).status = 'b'; st.saveSoon();
  const t0 = Date.now(); const r = st.flushNow({ timeoutMs: 400 }); const ms = Date.now() - t0;
  ok(r && r.ok === false && ms < 3000, '2d flushNow({timeoutMs}) gives up with a reason', JSON.stringify(r) + ' in ' + ms + ' ms');
  rmSync(st.file + '.tmp', { recursive: true, force: true });
});

await step('3a recovery loads the newest complete copy (a temp file fsynced before the rename)', async () => {
  const d = tmp('s3a'); const base = { schemaVersion: 1, collections: { jobs: [{ job_id: 'old' }] }, saveSeq: 5 };
  writeFileSync(join(d, 'nigraan-db.json'), JSON.stringify(base));
  writeFileSync(join(d, 'nigraan-db.json.tmp'), JSON.stringify({ ...base, collections: { jobs: [{ job_id: 'new' }] }, saveSeq: 6 }));
  writeFileSync(join(d, 'nigraan-db.json.tmpa'), '{"schemaVersion":1,"collections":{"jobs":[{"job_');   /* torn: ignored */
  const st = createStore(d);
  ok(st.all('jobs')[0].job_id === 'new', '3a the saveSeq 6 temp copy wins over the saveSeq 5 database', 'loaded ' + st.all('jobs')[0].job_id);
});
await step('3b recovery: a legacy temp leftover never beats the database or .prev; missing database -> .prev', async () => {
  const d = tmp('s3b');
  writeFileSync(join(d, 'nigraan-db.json.prev'), JSON.stringify({ schemaVersion: 1, collections: { jobs: [{ job_id: 'prev' }] } }));
  writeFileSync(join(d, 'nigraan-db.json.tmp'), JSON.stringify({ schemaVersion: 1, collections: { jobs: [{ job_id: 'leftover' }] } }));
  const st = createStore(d);
  ok(st.all('jobs')[0].job_id === 'prev', '3b database missing: .prev, not the legacy temp file', 'loaded ' + st.all('jobs')[0].job_id);
});
await step('3c every write stamps a higher saveSeq', async () => {
  const st = createStore(tmp('s3c')); await st.insert('jobs', { job_id: 'a' }); const s1 = disk(st).saveSeq; await st.insert('jobs', { job_id: 'b' }); const s2 = disk(st).saveSeq;
  ok(Number.isFinite(s1) && s2 > s1, '3c saveSeq increases', s1 + ' -> ' + s2);
});

await step('4a replace() swaps a row in one durable write', async () => {
  const st = createStore(tmp('s4a'));
  ok(typeof st.replace === 'function', '4a store.replace exists');
  if (typeof st.replace !== 'function') return;
  await st.insert('projects', { projectId: 'p1', v: 1 }); await st.insert('projects', { projectId: 'p2', v: 1 });
  const w0 = st.writeStats().writes;
  const r = await st.replace('projects', (p) => p.projectId === 'p1', { projectId: 'p1', v: 2 });
  const P = disk(st).collections.projects;
  ok(r.replaced === 1 && P.length === 2 && P[0].v === 2 && st.writeStats().writes - w0 === 1, '4a one row, same place, one write', JSON.stringify(P) + ' writes +' + (st.writeStats().writes - w0));
});
done();
