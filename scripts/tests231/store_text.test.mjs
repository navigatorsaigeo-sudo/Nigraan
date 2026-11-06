/* v91.17.231 · THE STORE WRITES THE SAME FILE WHILE SERIALISING ONLY WHAT CHANGED. A store on a throw-away folder: inserts, updates
   through the API, a change through a row handed out by find(), removals; after each save the file on disk must equal
   JSON.stringify of the database (records apart, as before), and an untouched collection must keep its text.
   usage: node scripts/tests231/store_text.test.mjs */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../../server/api/store.mjs';

let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) { pass++; console.log('PASS ' + name); } else { fail++; console.log('FAIL ' + name + (info ? ' :: ' + String(info).slice(0, 300) : '')); } };
const DIR = mkdtempSync(join(tmpdir(), 'agn-store-'));
process.env.PORT = '8899';
const S = createStore(DIR);
const want = () => JSON.stringify({ ...S.meta, collections: { ...S.meta.collections, records: [] } });
const disk = () => readFileSync(join(DIR, 'nigraan-db.json'), 'utf8');
const settle = () => new Promise((r) => setTimeout(r, 400));
try {
  await S.insert('audit', { id: 1, eventType: 'x' }); await S.insertMany('forecastLog', [{ a: 1 }, { a: 2 }]); await settle();
  ok(disk() === want(), 'after inserts the file is the full serialisation');
  await S.update('forecastLog', (r) => r.a === 2, { observed: 3.5 }); await settle();
  ok(disk() === want(), 'after an update through the API');
  const w = await S.insert('quotaWindows', { day: 'd', calls: 0 }); await settle();
  w.calls = 7; await S.save(); await settle();
  ok(disk() === want(), "a change through a held row, then the caller's own save(), reaches the file");
  const w2 = S.find('quotaWindows', () => true); w2.calls = 8; S.saveSoon(); await new Promise((r) => setTimeout(r, 21500));   /* saveSoon waits for a 20 s quiet period */
  ok(disk() === want(), 'a counter changed right after find() and saveSoon() reaches the file');
  await S.removeWhere('forecastLog', (r) => r.a === 1); await settle();
  ok(disk() === want(), 'after a removal');
  /* v91.17.233 · a large collection (over 256 KB) keeps its bytes between saves and is rebuilt when written or saved */
  const big = Array.from({ length: 3000 }, (_, i) => ({ id: 'e' + i, eventType: 'bulk', pad: 'x'.repeat(100) }));
  await S.insertMany('audit', big); await settle();
  ok(disk() === want(), 'a large collection written through insertMany reaches the file');
  const e7 = S.find('audit', (r) => r.id === 'e7'); e7.eventType = 'changed'; S.allForWrite('audit'); await S.save(); await settle();
  ok(disk() === want(), "a large collection's row changed in place, marked with allForWrite() and saved, reaches the file");
  /* v91.17.235 · a plain save() with nothing large marked does not rebuild the large collection (the saving the laptop needed) */
  const st0 = S.writeStats().rebuild.byCollection.audit || 0; await S.insert('jobs', { id: 'j1' }); await settle();
  ok((S.writeStats().rebuild.byCollection.audit || 0) === st0 && disk() === want(), 'a save that changes only a small collection leaves the large one\'s bytes as they were');
  S.flushNow(); ok(disk() === want(), 'the shutdown write is the full serialisation');
} catch (e) { ok(false, 'store run', e && e.stack); }
finally { try { rmSync(DIR, { recursive: true, force: true }); } catch (_) {} }
console.log(`\n${fail ? 'FAIL' : 'PASS'} store_text: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
