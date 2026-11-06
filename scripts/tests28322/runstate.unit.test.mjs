/* v91.17.283.22 . THE SAVED RUN-KEYED CACHES (server/api/runstate.mjs, data/runstate-config.json), offline (no server):
     R1  only the current and the previous run of each kind are kept (keepRecentRuns)
     R2  the timed save is asynchronous: the event loop keeps running while a large snapshot is serialised, compressed and written
     R3  atomic: written to .tmp, flushed and renamed; no .tmp is left; the file reads back
     R4  at most once per model run per cache, after the run settled; the drain save (saveAll(true)) always writes
     R5  a part over the cap is not written (named in status, the old file stays); a file over the cap is not read
     R6  a corrupt, truncated, unknown or failing file is set aside (.bad) and never stops the start; a stray .tmp is removed
     R7  the cap, the runs kept, the settle time and the period come from the config file (defaults when it is missing)
   Prints the measured sizes and times of the large snapshot.
   usage: node scripts/tests28322/runstate.unit.test.mjs */
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RSm = await import(pathToFileURL(join(ROOT, 'server', 'api', 'runstate.mjs')).href);
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 500) : '')); } };
const D = mkdtempSync(join(tmpdir(), 'rs22-'));
try {
  /* R1 */
  const E = [['a', 100, 'r1', 1], ['b', 200, 'r2', 1], ['c', 300, 'r3', 1], ['zone|x', 50, 'z1', 1], ['zone|y', 60, 'z2', 1], ['zone|w', 70, 'z3', 1], ['n1', 990, null, 1], ['n2', 10, null, 1]];
  const K = RSm.keepRecentRuns(E, { keepRuns: 2, ttlMs: 100, now: 1000, kindOf: (k) => (k.startsWith('zone|') ? 'z' : 'n') }).map((x) => x[0]).sort().join(',');
  ok(K === 'b,c,n1,zone|w,zone|y', 'R1 the current and the previous run of each kind are kept, older runs dropped; an entry without a run only within its time', K);
  /* R7 */
  const C0 = RSm.loadRunStateConfig(join(D, 'missing.json'));
  ok(C0.capMB === 40 && C0.keepRuns === 2 && C0.settleMin === 10 && C0.saveEveryMin === 5 && C0.source === 'defaults', 'R7 a missing config file gives the defaults (40 MB, 2 runs, 10 min, every 5 min)', JSON.stringify(C0));
  const shipped = JSON.parse(readFileSync(join(ROOT, 'data', 'runstate-config.json'), 'utf8'));
  ok(shipped.capMB === 40 && shipped.keepRuns === 2 && Number.isFinite(shipped.settleMin) && Number.isFinite(shipped.saveEveryMin), 'R7 data/runstate-config.json holds the cap, runs kept, settle time and period', JSON.stringify({ capMB: shipped.capMB, keepRuns: shipped.keepRuns, settleMin: shipped.settleMin, saveEveryMin: shipped.saveEveryMin }));
  const cf = join(D, 'rc.json'); writeFileSync(cf, JSON.stringify({ capMB: 40, keepRuns: 2, settleMin: 10, saveEveryMin: 5, parts: { tiny: { capMB: 0.001 } } }));
  /* R4 once per run */
  let T = Date.parse('2026-10-26T06:00:00Z'), RUN = 'A', data = [[1, 2]], dumps = 0; const now = () => T;
  const dir1 = join(D, 'rs1');
  const A = RSm.createRunState({ dir: dir1, now, config: cf, runKey: () => RUN }); A.register('m', { dump: () => { dumps++; return data; }, load: (x) => x.length, sig: () => JSON.stringify(data) });
  ok(RSm.createRunState({ dir: dir1, config: cf }).status().config.source === 'rc.json' && A.status().config.parts.tiny.capMB === 0.001, 'R7 the config file is read (per-part cap override)');
  await A.saveAllAsync(); ok(!existsSync(join(dir1, 'm.json.gz')) && A.status().held.m === 'model run settling', 'R4 a new model run is not written before it settled (settleMin)', JSON.stringify(A.status().held));
  T += 11 * 60e3; await A.saveAllAsync(); ok(existsSync(join(dir1, 'm.json.gz')), 'R4 written once the run settled');
  data = [[1, 2], [3, 4]]; T += 5 * 60e3; const d0 = dumps; await A.saveAllAsync();
  ok(dumps === d0 && /^written for this model run/.test(A.status().held.m || ''), 'R4 changed content of the same model run is not written again within sameRunRewriteMin (no dump either; v283.24 P12: after it, it is)', JSON.stringify(A.status().held));
  RUN = 'B'; await A.saveAllAsync(); T += 11 * 60e3; await A.saveAllAsync();
  const B1 = RSm.createRunState({ dir: dir1, now, config: cf }); let got = null; B1.register('m', { dump: () => null, load: (x) => { got = x; return x.length; } }); B1.loadAll();
  ok(got && got.length === 2, 'R4 the next model run is written once (after it settled) and reads back', JSON.stringify(got));
  data = [[9]]; ok(A.saveAll(true) === 1, 'R4 the drain save writes at once, whatever the run');
  /* R3 atomic */
  ok(!readdirSync(dir1).some((f) => f.endsWith('.tmp')), 'R3 no .tmp file is left after the writes', readdirSync(dir1).join(','));
  /* R5 cap */
  const T1 = RSm.createRunState({ dir: dir1, now, config: cf }); T1.register('tiny', { dump: () => [['x'.repeat(4000)]], load: () => 1 });
  ok(T1.saveAll(true) === 0 && !existsSync(join(dir1, 'tiny.json.gz')) && T1.status().capped.tiny && T1.status().capped.tiny.cap === 1049, 'R5 a part over its cap is not written (sync), named in status', JSON.stringify(T1.status().capped));
  writeFileSync(join(dir1, 'tiny.json.gz'), Buffer.alloc(2000, 7)); const n0 = await T1.saveAllAsync({ force: true });
  ok(n0 === 0 && readFileSync(join(dir1, 'tiny.json.gz')).length === 2000, 'R5 a part over its cap is not written (async); the old file stays');
  T1.loadAll(); ok(existsSync(join(dir1, 'tiny.json.gz.bad')) && !existsSync(join(dir1, 'tiny.json.gz')) && /over the cap/.test(T1.status().errors.tiny || ''), 'R5 a file over the cap is not read (set aside)', JSON.stringify(T1.status().errors));
  /* R6 defensive load */
  const dir2 = join(D, 'rs2'); const W = RSm.createRunState({ dir: dir2, now }); W.register('good', { dump: () => [[1]], load: () => 1 }); W.saveAll(true);
  const good = readFileSync(join(dir2, 'good.json.gz'));
  writeFileSync(join(dir2, 'garbage.json.gz'), 'not gzip at all'); writeFileSync(join(dir2, 'half.json.gz'), good.subarray(0, Math.floor(good.length / 2)));
  const { gzipSync } = await import('node:zlib'); writeFileSync(join(dir2, 'fmt.json.gz'), gzipSync(Buffer.from('{"v":7}'))); writeFileSync(join(dir2, 'boom.json.gz'), good);
  writeFileSync(join(dir2, 'good.json.gz.tmp'), 'torn');
  const L = RSm.createRunState({ dir: dir2, now }); let threw = false; let goodN = null;
  for (const n of ['garbage', 'half', 'fmt']) L.register(n, { dump: () => null, load: () => 1 });
  L.register('boom', { dump: () => null, load: () => { throw new Error('bad shape'); } }); L.register('good', { dump: () => null, load: (x) => (goodN = x.length) });
  let r; try { r = L.loadAll(); } catch (_) { threw = true; }
  const S = L.status();
  ok(!threw && goodN === 1, 'R6 the start goes on: the good part is read beside the bad ones', JSON.stringify(r));
  ok(['garbage', 'half', 'fmt', 'boom'].every((n) => existsSync(join(dir2, n + '.json.gz.bad')) && !existsSync(join(dir2, n + '.json.gz')) && S.movedAside[n]), 'R6 corrupt, truncated, unknown-format and failing files are set aside as .bad', JSON.stringify(S.movedAside));
  ok(!existsSync(join(dir2, 'good.json.gz.tmp')), 'R6 a stray .tmp of a torn write is removed at start');
  /* R2 a large snapshot: the event loop runs during the timed save; sizes and times measured */
  const dir3 = join(D, 'rs3'); const row = (i) => ['nat1|api|' + (24 + i / 1e4).toFixed(4) + '|' + (67 + i / 1e4).toFixed(4) + '|500|Asia/Karachi|c|3|16', 1761450000000 + i, 'run' + (i % 2), { hourly: { time: Array.from({ length: 64 }, (_, h) => '2026-10-26T' + String(h % 24).padStart(2, '0') + ':00'), temperature_2m_member01: Array.from({ length: 64 }, (_, h) => Math.round((20 + Math.sin(i + h) * 8) * 10) / 10), precipitation_member01: Array.from({ length: 64 }, (_, h) => ((i * 7 + h) % 13) / 10) } }];
  const BIG = Array.from({ length: 22000 }, (_, i) => row(i));
  const R2 = RSm.createRunState({ dir: dir3, now, runKey: () => 'X', config: { capMB: 40, settleMin: 0 } }); R2.register('big', { dump: () => BIG, load: (x) => x.length });
  let ticks = 0, maxGap = 0, last = Date.now(); const iv = setInterval(() => { const t = Date.now(); maxGap = Math.max(maxGap, t - last); last = t; ticks++; }, 5);
  const t0 = Date.now(); const nB = await R2.saveAllAsync(); const wall = Date.now() - t0; clearInterval(iv);
  const sv = R2.status().saved.big || {};
  console.log('INFO R2 large snapshot: ' + BIG.length + ' entries, raw ' + (sv.rawBytes / 1048576).toFixed(1) + ' MB, gzipped ' + (sv.bytes / 1048576).toFixed(1) + ' MB; serialise ' + sv.serialiseMs + ' ms in slices (longest ' + sv.longestSliceMs + ' ms), serialise+gzip wall ' + sv.serialiseGzipWallMs + ' ms (gzip in the thread pool), write+fsync ' + sv.writeMs + ' ms; wall ' + wall + ' ms; a 5 ms timer ran ' + ticks + ' times, longest gap ' + maxGap + ' ms');
  ok(nB === 1 && sv.rawBytes > 20 * 1048576 && sv.rawBytes < 40 * 1048576, 'R2 a 20-40 MB snapshot is written by the timed save', JSON.stringify(sv));
  ok(ticks > 10 && sv.longestSliceMs < 250, 'R2 the event loop keeps running during the save (timer ticks ' + ticks + ', longest serialise slice ' + sv.longestSliceMs + ' ms)');
  const t1 = Date.now(); const R3 = RSm.createRunState({ dir: dir3, now }); let nL = 0; R3.register('big', { dump: () => null, load: (x) => (nL = x.length) }); R3.loadAll();
  console.log('INFO R2 the same file read back at start in ' + (Date.now() - t1) + ' ms');
  ok(nL === BIG.length, 'R3 the large file reads back whole', nL);
  const C3 = RSm.createRunState({ dir: dir3, now, runKey: () => 'X', config: { capMB: 10, settleMin: 0 } }); C3.register('big', { dump: () => BIG, load: () => 1 }); const before = readFileSync(join(dir3, 'big.json.gz')).length;
  const t2 = Date.now(); await C3.saveAllAsync(); const cw = Date.now() - t2;
  ok(C3.status().capped.big && readFileSync(join(dir3, 'big.json.gz')).length === before, 'R5 the same snapshot over a 10 MB cap: not written (stopped at ' + (C3.status().capped.big || {}).chars + ' chars, ' + cw + ' ms), the old file stays');
} finally { rmSync(D, { recursive: true, force: true }); }
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
