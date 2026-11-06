#!/usr/bin/env node
/* v91.17.283.15 · mkdeploy EXPECTED_prev comes from the files the computer holds (no server, no network).
   v283.15's first DEPLOY was refused: v283.13 and v283.14 changed build/gen/gate.slim.json and build/start/start.src.html in their
   trees but never shipped them, and EXPECTED_prev took the hashes from the v283.14 tree. These checks build small trees in a temp folder:
     anchor tree (v1 of every file) -> package P1 ships server/a.mjs v2 -> a later tree changes build/b.txt to v2 without shipping it
   and package the new tree (a v3, b v3). EXPECTED_prev must name a v2 (shipped) and b v1 (never shipped), never b v2.
   Usage: node scripts/tests28315/mkdeploy.test.mjs   Prints PASS / FAIL per check; exit 1 on any FAIL. */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..');
const { makeDeploy } = await import(pathToFileURL(join(ROOT, 'scripts', 'deploy', 'mkdeploy.mjs')).href);
const sha = (s) => createHash('sha256').update(s).digest('hex');
let fails = 0, passes = 0;
const check = (name, ok, detail = '') => { if (ok) passes++; else fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' :: ' + detail : '')); };
const T = mkdtempSync(join(tmpdir(), 'mkdeploy-test-'));
const put = (f, s) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, s); };
function tree(dir, ver, a, b) {
  put(join(dir, 'package.json'), JSON.stringify({ name: 'nigraan-local', version: '91.17.' + ver }));
  mkdirSync(join(dir, 'scripts'), { recursive: true }); copyFileSync(join(ROOT, 'scripts', 'pack-release.mjs'), join(dir, 'scripts', 'pack-release.mjs'));
  put(join(dir, '_admin', 'deploy_swap.ps1'), 'Write-Host swap\n');
  put(join(dir, 'data', 'model-gate.resolved.json'), JSON.stringify({ version: 'gate-test' }));
  put(join(dir, 'server', 'a.mjs'), "export const A = '" + a + "'; export const B = 'build/b.txt';\n");
  put(join(dir, 'build', 'b.txt'), b);
}
const expOf = (out) => { const m = {}; for (const l of readFileSync(join(out, 'EXPECTED_prev_SHA256.txt'), 'utf8').split(/\r?\n/)) { if (!l || l.startsWith('#')) continue; const [h, f] = l.split(/\s+/); m[f] = h; } return m; };
try {
  tree(join(T, 'anchor'), '1.1', 'a1', 'b1');
  tree(join(T, 'later'), '1.2', 'a2', 'b2');           /* the tree of the last package: b changed but never shipped */
  put(join(T, 'P1', 'new', 'nigraan-local', 'server', 'a.mjs'), readFileSync(join(T, 'later', 'server', 'a.mjs')));
  tree(join(T, 'new'), '1.3', 'a3', 'b3');
  const A2 = sha(readFileSync(join(T, 'later', 'server', 'a.mjs'))), B1 = sha('b1'), B2 = sha('b2');
  const KA = 'nig\\nigraan-local\\server\\a.mjs', KB = 'nig\\nigraan-local\\build\\b.txt';
  const base = { version: '1.3', newTree: join(T, 'new'), tests: false, date: '1 Jan 2026', summary: 'test' };

  // 1 the old rule is refused without an explicit --trust-base-tree
  let e1 = null; try { await makeDeploy({ ...base, bases: [join(T, 'later') + '=1.2'], out: join(T, 'o1') }); } catch (e) { e1 = e.message; }
  check('1 a base tree alone is refused (EXPECTED_prev needs --installed or --shipped)', !!e1 && /--installed|--shipped/.test(e1), e1 || 'built');

  // 2 the bug: --trust-base-tree on the later tree lists b2, a hash the computer never held
  await makeDeploy({ ...base, bases: [join(T, 'later') + '=1.2'], out: join(T, 'o2'), trustBaseTree: true });
  check('2 (the v283.15 refusal reproduced) the later tree names the unshipped b2', expOf(join(T, 'o2'))[KB] === B2);

  // 3 the chain: anchor tree + the shipped package -> a2 (shipped), b1 (never shipped)
  const r3 = await makeDeploy({ ...base, bases: [join(T, 'anchor') + '=1.2'], shipped: [join(T, 'P1')], out: join(T, 'o3') });
  const x3 = expOf(join(T, 'o3'));
  check('3 anchor + shipped package: a takes the shipped hash, b the anchor\'s (not the unshipped tree file)', x3[KA] === A2 && x3[KB] === B1, JSON.stringify({ a: (x3[KA] || '').slice(0, 8), b: (x3[KB] || '').slice(0, 8) }));
  check('3b both files are in the package', r3.files.includes('server/a.mjs') && r3.files.includes('build/b.txt'), r3.files.join(','));

  // 4 a staged copy of the computer wins, and a disagreement with the chain is reported
  const I = join(T, 'inst'); put(join(I, 'nig', 'nigraan-local', 'server', 'a.mjs'), readFileSync(join(T, 'later', 'server', 'a.mjs'))); put(join(I, 'nig', 'nigraan-local', 'build', 'b.txt'), 'b0');
  put(join(I, '_admin', 'deploy_swap.ps1'), 'Write-Host swap\r\n');
  copyFileSync(join(T, 'anchor', 'package.json'), join(I, 'nig', 'nigraan-local', 'package.json'));
  const r4 = await makeDeploy({ ...base, bases: [join(T, 'anchor') + '=1.2'], shipped: [join(T, 'P1')], installed: I, out: join(T, 'o4') });
  const x4 = expOf(join(T, 'o4'));
  check('4 --installed: the computer\'s hash is listed and the chain disagreement reported', x4[KB] === sha('b0') && x4[KA] === A2 && r4.disagree.length === 1 && r4.disagree[0].file === KB, JSON.stringify(r4.disagree.map((d) => d.file)));

  // 5 a replaced file missing from the staged copy fails (not silently "not on the computer")
  rmSync(join(I, 'nig', 'nigraan-local', 'build', 'b.txt'));
  let e5 = null; try { await makeDeploy({ ...base, bases: [join(T, 'anchor') + '=1.2'], shipped: [join(T, 'P1')], installed: I, out: join(T, 'o5') }); } catch (e) { e5 = e.message; }
  check('5 a replaced file not in the staged copy fails the build', !!e5 && /not in the staged copy/.test(e5), e5 || 'built');
} finally { rmSync(T, { recursive: true, force: true }); }
console.log('\n' + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
