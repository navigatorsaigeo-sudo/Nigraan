// v91.17.283.6 item 9 · the plains blend weights come from data/blend-weights-active.json (version, file, sha256, sourceRun):
//  B1 the shipped pointer names the gate's weights file with the same sha256: the served weights are the current ones (identity)
//  B2 swapping the pointer to a test weights file (valid checksum) changes the blend
//  B3 a bad checksum falls back to the current weights, the reason is logged and shown in status().weightsPointer.fallbackWhy
//  B4 a pointer naming a path outside the data folder, or a missing file, falls back the same way
//  B5 blend_promote.mjs: refuses a record that does not promote or whose candidate checksum is wrong; installs a good one by flipping
//     the pointer (previous kept) and --revert puts it back; the candidate format written by py/blend_r.py parses as served weights
// usage: node scripts/tests2836/blend_pointer.test.mjs
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), D0 = join(APP, 'data');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + String(d).slice(0, 500) : '')); } };
const { createBlend, blendAt } = await import(pathToFileURL(join(APP, 'server/api/blend.mjs')).href);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const G = JSON.parse(readFileSync(join(D0, 'blend-gate.json'), 'utf8')), P0 = JSON.parse(readFileSync(join(D0, 'blend-weights-active.json'), 'utf8'));
const mk = () => { const d = mkdtempSync(join(tmpdir(), 'bp-')); for (const f of ['blend-gate.json', 'blend-weights-v3.json', 'blend-weights-active.json']) copyFileSync(join(D0, f), join(d, f)); return d; };
const T = { ifs: 30, gfs: 31, icon: 32, gem: 33, jma: 34, ukmo: 35, cma: 36, arp: 37, aifs: 38 }, Td = Object.fromEntries(Object.keys(T).map((k) => [k, 10]));
const at = (W) => blendAt(W, 'plains', 1, 4, false, T, Td);
const ref = (() => { const B = createBlend({ dataDir: D0, env: {} }); B.on(); return { W: B.weights(), st: B.status() }; })();
ok(P0.file === G.weights && P0.sha256 === G.weightsSha256 && P0.version && P0.sourceRun && ref.st.weights.sha256 === G.weightsSha256 && ref.st.weights.source === 'pointer' && ref.st.weightsPointer.used === true, 'B1 shipped pointer = the gate weights (same sha256), used', JSON.stringify(ref.st.weightsPointer));
const noPtr = (() => { const d = mk(); rmSync(join(d, 'blend-weights-active.json')); const B = createBlend({ dataDir: d, env: {} }); B.on(); return B.weights(); })();
ok(Math.abs(at(noPtr).t - at(ref.W).t) < 1e-12 && noPtr.cells.size === ref.W.cells.size, 'B1b without the pointer (v283.5 path) the blend is identical', at(ref.W).t);
/* a test weights file: every cell all on ifs */
const R = JSON.parse(readFileSync(join(D0, 'blend-weights-v3.json'), 'utf8')); for (const v of Object.values(R.window2_weights)) for (const m of Object.keys(v.w)) v.w[m] = m === 'ifs' ? 1 : 0;
const tb = Buffer.from(JSON.stringify(R)); const d2 = mk(); writeFileSync(join(d2, 'blend-weights-test.json'), tb);
writeFileSync(join(d2, 'blend-weights-active.json'), JSON.stringify({ version: 'test-1', file: 'blend-weights-test.json', sha256: sha(tb), sourceRun: 'unit test' }));
{ const B = createBlend({ dataDir: d2, env: {} }); B.on(); const r = at(B.weights());
  ok(Math.abs(r.t - 30) < 1e-9 && Math.abs(at(ref.W).t - 30) > 0.1 && B.status().weightsPointer.used === true && B.status().weights.sha256 === sha(tb), 'B2 the pointer to a test weights file changes the blend', r.t + ' vs ' + at(ref.W).t); }
writeFileSync(join(d2, 'blend-weights-active.json'), JSON.stringify({ version: 'test-1', file: 'blend-weights-test.json', sha256: '0'.repeat(64), sourceRun: 'unit test' }));
{ const logs = []; const B = createBlend({ dataDir: d2, env: {}, log: (m) => logs.push(m) }); B.on(); const st = B.status();
  ok(Math.abs(at(B.weights()).t - at(ref.W).t) < 1e-12 && st.weights.sha256 === G.weightsSha256 && st.weightsPointer.used === false && /checksum mismatch/.test(st.weightsPointer.fallbackWhy) && logs.some((l) => /pointer not used \(checksum mismatch/.test(l)), 'B3 bad checksum: current weights served, reason logged and shown', JSON.stringify({ why: st.weightsPointer.fallbackWhy, log: logs[0] })); }
for (const [nm, file] of [['outside the data folder', '../blend-weights-v3.json'], ['missing file', 'blend-weights-nope.json']]) {
  writeFileSync(join(d2, 'blend-weights-active.json'), JSON.stringify({ version: 'x', file, sha256: G.weightsSha256, sourceRun: 'unit test' }));
  const logs = []; const B = createBlend({ dataDir: d2, env: {}, log: (m) => logs.push(m) }); B.on(); const st = B.status();
  ok(st.weights.sha256 === G.weightsSha256 && st.weightsPointer.used === false && st.weightsPointer.fallbackWhy && logs.length === 1, 'B4 ' + nm + ': falls back to the current weights with a reason', st.weightsPointer.fallbackWhy); }
/* B5 · promotion flips the pointer only */
const d3 = mk(), rd = mkdtempSync(join(tmpdir(), 'bpr-')); writeFileSync(join(rd, 'blend-weights-blendr-V1-20261101.json'), tb);
const rec = { rule: 'BLENDR_blend_weights_rebalanced', promote: true, variant: 'V1', version: 'blendr-V1-20261101', candidateFile: 'blend-weights-blendr-V1-20261101.json', candidateSha256: sha(tb), sourceRun: 'unit test' };
const run = (r, extra = []) => { if (r) writeFileSync(join(rd, 'rec.json'), JSON.stringify(r)); return spawnSync(process.execPath, [join(APP, 'scripts/gen/blend_promote.mjs'), ...(r ? [join(rd, 'rec.json')] : []), ...extra, '--data', d3], { encoding: 'utf8' }); };
const before = readFileSync(join(d3, 'blend-weights-active.json'), 'utf8');
const r1 = run({ ...rec, promote: false, why: 'gain p1.25 not above 0' }), r2 = run({ ...rec, candidateSha256: '1'.repeat(64) });
ok(r1.status === 2 && r2.status === 2 && readFileSync(join(d3, 'blend-weights-active.json'), 'utf8') === before, 'B5a refused: record does not promote / candidate checksum wrong; pointer unchanged', (r1.stderr + r2.stderr).trim());
const r3 = run(rec); const P3 = JSON.parse(readFileSync(join(d3, 'blend-weights-active.json'), 'utf8'));
{ const B = createBlend({ dataDir: d3, env: {} }); B.on();
  ok(r3.status === 0 && P3.file === rec.candidateFile && P3.sha256 === sha(tb) && P3.previous && P3.previous.file === 'blend-weights-v3.json' && Math.abs(at(B.weights()).t - 30) < 1e-9, 'B5b promotion flips the pointer (previous kept) and the server serves the candidate', r3.stdout.trim()); }
const r4 = run(null, ['--revert']); { const B = createBlend({ dataDir: d3, env: {} }); B.on();
  ok(r4.status === 0 && JSON.parse(readFileSync(join(d3, 'blend-weights-active.json'), 'utf8')).file === 'blend-weights-v3.json' && Math.abs(at(B.weights()).t - at(ref.W).t) < 1e-12, 'B5c --revert puts the previous weights back', r4.stdout.trim()); }
console.log(`\nblend_pointer ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
