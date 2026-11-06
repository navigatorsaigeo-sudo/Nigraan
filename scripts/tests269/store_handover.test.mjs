/* v91.17.269 · INFRA A6 · the data-folder hand-over between two server processes (server/api/store.mjs), with real processes:
   node scripts/tests269/store_handover.test.mjs
   H1 a second process on another port opens in STANDBY (not read-only for good) and reads the writer's data
   H2 a durable write made in standby WAITS and lands after the hand-over (nothing refused, nothing lost)
   H3 quota counts made in standby are ADDED to the writer's counts at the hand-over (delta from what the standby loaded)
   H4 the writer's last rows (written just before release) are in the new writer's memory and on disk; the run files added by the
      old writer are loaded, the pruned ones dropped
   H5 a standby whose writer is KILLED (no release) takes over when the holder pid is gone
   H6 a corrupt database still opens read-only and never takes over by itself (A22 unchanged)
   H7 the writer's release() writes synchronously and removes the lock; a write after release is refused (the old process is retiring) */
import { fork } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const STORE = new URL('../../server/api/store.mjs', import.meta.url).href;
const SELF = fileURLToPath(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d ? ' :: ' + d : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.env.NIGRAAN_STANDBY_POLL_MS = '50';

/* ---- child: the OLD writer, driven by messages ---- */
if (process.argv[2] === 'child') {
  process.env.PORT = process.argv[4];
  const { createStore } = await import(STORE);
  const s = createStore(process.argv[3]);
  const q = () => { let w = s.all('quotaWindows').find((x) => x.day === '2026-10-16'); if (!w) { w = { providerId: 'om', day: '2026-10-16', calls: 0, browserWeighted: 0 }; s.all('quotaWindows').push(w); } return w; };
  process.on('message', async (m) => {
    try {
      if (m.op === 'insert') await s.insert('audit', { eventId: m.id, at: new Date().toISOString() });
      if (m.op === 'quota') { const w = q(); w.calls += m.n; w.browserWeighted += m.n * 2; s.saveSoon(); }
      if (m.op === 'run') { s.all('records').push(...m.rows); await s.insertMany('records', []); }
      if (m.op === 'runfile') { writeFileSync(join(process.argv[3], 'records', m.id + '.json'), JSON.stringify(m.rows)); }
      if (m.op === 'release') { const r = await s.release(); let refused = false; try { await s.insert('audit', { eventId: 'after-release' }); } catch (e) { refused = e.code === 'STORE_READ_ONLY'; } process.send({ op: 'released', r, refused }); return; }
      if (m.op === 'state') process.send({ op: 'state', standby: s.standby(), readOnly: s.readOnly() });
      process.send({ op: 'done', id: m.op });
    } catch (e) { process.send({ op: 'error', e: String(e && e.message) }); }
  });
  process.send({ op: 'ready', standby: s.standby(), readOnly: s.readOnly() });
  setInterval(() => {}, 1000);
} else {
  const { createStore } = await import(STORE);
  const dir = mkdtempSync(join(tmpdir(), 'nig269-store-'));
  const child = (port) => new Promise((res) => { const c = fork(SELF, ['child', dir, String(port)], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] }); c.once('message', (m) => res({ c, m })); });
  const ask = (c, msg) => new Promise((res) => { const f = (m) => { if (m.op === 'done' || m.op === 'released' || m.op === 'state' || m.op === 'error') { c.off('message', f); res(m); } }; c.on('message', f); c.send(msg); });

  /* the old writer on 8791 with some data */
  const { c: A, m: am } = await child(8791);
  ok(!am.standby && !am.readOnly, 'H0 the first process is the writer', JSON.stringify(am));
  await ask(A, { op: 'insert', id: 'a1' });
  await ask(A, { op: 'quota', n: 10 });
  await ask(A, { op: 'runfile', id: 'run_old1', rows: [{ runId: 'run_old1', v: 1 }] });
  /* the new process on 8792 */
  process.env.PORT = '8792';
  const B = createStore(dir);
  ok(!!B.standby() && /standby/.test(String(B.readOnly())), 'H1 the second process opens in standby', String(B.readOnly()));
  ok(B.all('audit').some((r) => r.eventId === 'a1'), 'H1 the standby reads the writer\'s rows');
  /* standby: quota counts in memory, and a durable write that must wait */
  /* the writer's counters may not be on disk yet (saveSoon defers up to 60 s): the standby opens its own row, as provider.windowFor does */
  let w = B.all('quotaWindows').find((x) => x.day === '2026-10-16'); if (!w) { w = { providerId: 'om', day: '2026-10-16', calls: 0, browserWeighted: 0 }; B.all('quotaWindows').push(w); }
  w.calls += 3; w.browserWeighted += 6; B.saveSoon();
  let insertDone = null; const pIns = B.insert('audit', { eventId: 'b1', at: new Date().toISOString() }).then(() => { insertDone = Date.now(); }, (e) => { insertDone = 'refused ' + e.code; });
  await sleep(300);
  ok(insertDone === null, 'H2 a durable write in standby waits (not refused)', String(insertDone));
  /* the old writer keeps working, adds a run file and prunes another, then releases */
  await ask(A, { op: 'insert', id: 'a2' });
  await ask(A, { op: 'quota', n: 5 });
  await ask(A, { op: 'runfile', id: 'run_new2', rows: [{ runId: 'run_new2', v: 2 }, { runId: 'run_new2', v: 3 }] });
  rmSync(join(dir, 'records', 'run_old1.json'));
  const tRel = Date.now();
  const rel = await ask(A, { op: 'release' });
  ok(rel.r && rel.r.released && !existsSync(join(dir, '.store.lock')), 'H7 release(): last write done, lock removed', JSON.stringify(rel.r));
  ok(rel.refused, 'H7 a write after release is refused by the retiring process');
  await pIns;
  ok(typeof insertDone === 'number', 'H2 the waiting write landed after the hand-over (' + (typeof insertDone === 'number' ? insertDone - tRel : '?') + ' ms after release)', String(insertDone));
  ok(!B.standby() && B.readOnly() === null, 'H2 the new process is the writer');
  ok(B.all('audit').some((r) => r.eventId === 'a2') && B.all('audit').some((r) => r.eventId === 'b1'), 'H4 the old writer\'s last row and the new row are both kept');
  w = B.all('quotaWindows').find((x) => x.day === '2026-10-16');
  ok(w && w.calls === 18 && w.browserWeighted === 36, 'H3 quota: writer 10+5 plus standby 3 = 18 calls (36 weighted)', JSON.stringify(w));
  const recIds = new Set(B.all('records').map((r) => r.runId));
  ok(recIds.has('run_new2') && !recIds.has('run_old1') && B.all('records').length === 2, 'H4 run files: the new run loaded, the pruned run dropped', [...recIds].join(','));
  const lock = JSON.parse(readFileSync(join(dir, '.store.lock'), 'utf8'));
  ok(lock.pid === process.pid && lock.port === 8792, 'H2 the lock names the new writer');
  await B.save(); const disk = JSON.parse(readFileSync(join(dir, 'nigraan-db.json'), 'utf8'));
  ok(disk.collections.audit.some((r) => r.eventId === 'b1') && disk.collections.audit.some((r) => r.eventId === 'a2') && disk.collections.quotaWindows.find((x) => x.day === '2026-10-16').calls === 18, 'H4 the disk has both rows and the merged counter');
  A.kill();

  /* H5: a killed writer */
  const dir2 = mkdtempSync(join(tmpdir(), 'nig269-store-'));
  const C = await new Promise((res) => { const c = fork(SELF, ['child', dir2, '8791'], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] }); c.once('message', () => res(c)); });
  await ask(C, { op: 'insert', id: 'c1' });
  process.env.PORT = '8792';
  const D = createStore(dir2);
  ok(!!D.standby(), 'H5 standby while the writer lives');
  C.kill('SIGKILL'); await new Promise((r) => C.once('exit', r));
  for (let i = 0; i < 60 && D.standby(); i++) await sleep(50);
  ok(!D.standby() && D.readOnly() === null && D.all('audit').some((r) => r.eventId === 'c1'), 'H5 a killed writer: the standby takes over and has its data');

  /* H6: a corrupt database */
  const dir3 = mkdtempSync(join(tmpdir(), 'nig269-store-')); writeFileSync(join(dir3, 'nigraan-db.json'), '{ not json');
  process.env.PORT = '8793';
  const E = createStore(dir3);
  ok(!E.standby() && /could not be read/.test(String(E.readOnly())), 'H6 a corrupt database opens read-only, not standby', String(E.readOnly()));
  await sleep(300);
  ok(/could not be read/.test(String(E.readOnly())), 'H6 and stays read-only');
  for (const d of [dir, dir2, dir3]) rmSync(d, { recursive: true, force: true });
  console.log('');
  console.log((fail ? 'FAIL' : 'PASS') + ' store_handover: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}
