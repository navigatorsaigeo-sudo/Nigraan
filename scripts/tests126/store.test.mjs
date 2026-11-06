/* v91.17.126 · the store (external audit A22, system audit S-08/S-09): fail closed, keep the last good copy, one writer per data folder,
   run records in their own files. Runs on temporary folders; touches nothing of the live install. node scripts/tests126/store.test.mjs */
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path'; import { tmpdir } from 'node:os';
const { createStore } = await import(new URL('../../server/api/store.mjs', import.meta.url).href);
let fails = 0, passes = 0;
const ok = (c, n, x) => { if (c) { passes++; console.log('PASS ' + n); } else { fails++; console.log('FAIL ' + n + (x ? ' :: ' + x : '')); } };
const d = mkdtempSync(join(tmpdir(), 'agnst'));
const s = createStore(d);
await s.insertMany('records', [{ runId: 'run_a', unitKey: 'u1' }, { runId: 'run_a', unitKey: 'u2' }, { runId: 'run_b', unitKey: 'u1' }]);
await s.insert('runs', { run_id: 'run_a' });
ok(existsSync(join(d, 'records', 'run_a.json')) && existsSync(join(d, 'records', 'run_b.json')), 'records are written one file per run');
ok(!JSON.parse(readFileSync(join(d, 'nigraan-db.json'), 'utf8')).collections.records.length, 'the main database carries no records');
ok(existsSync(join(d, 'nigraan-db.json.prev')), 'the previous good copy is kept');
const s2 = createStore(d); ok(s2.all('records').length === 3, 'records load back from their run files');
await s2.removeWhere('records', r => r.runId === 'run_b'); ok(!existsSync(join(d, 'records', 'run_b.json')), 'a pruned run loses its file');
writeFileSync(join(d, 'nigraan-db.json'), '{broken');
const s3 = createStore(d); ok(s3.recoveredFrom() && !s3.readOnly() && s3.all('runs').length >= 0, 'an unreadable database is recovered from the previous good copy', s3.recoveredFrom());
const e = mkdtempSync(join(tmpdir(), 'agnst')); writeFileSync(join(e, 'nigraan-db.json'), '{broken');
const s4 = createStore(e); let refused = false; try { await s4.insert('runs', { x: 1 }); } catch (er) { refused = er.code === 'STORE_READ_ONLY'; }
ok(s4.readOnly() && refused && readFileSync(join(e, 'nigraan-db.json'), 'utf8') === '{broken', 'with no readable copy the store is read-only and overwrites nothing');
const f = mkdtempSync(join(tmpdir(), 'agnst')); writeFileSync(join(f, '.store.lock'), JSON.stringify({ pid: process.ppid || 1, port: 9, at: new Date().toISOString() }));
const s5 = createStore(f); ok(!!s5.readOnly(), 'a live process on another port holding the folder makes this one read-only', s5.readOnly());
const g = mkdtempSync(join(tmpdir(), 'agnst')); writeFileSync(join(g, '.store.lock'), JSON.stringify({ pid: process.ppid || 1, port: Number(process.env.PORT || 8787), at: new Date().toISOString() }));
const s6 = createStore(g); ok(!s6.readOnly(), 'a lock left on our own port is a restart: taken over');
console.log((fails ? 'FAIL' : 'PASS') + ' store: ' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
