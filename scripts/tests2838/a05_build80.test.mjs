// audit 5 · build/build80.sh needed the removed data/cbam-annex1.json and would rebuild the console from the v80 base: it is retired with a
// note, changes nothing and exits 0 (it must not fail). The current build script names no financial table.
import { mkdtempSync, cpSync, readFileSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { TREE, src, ok, done } from './lib.mjs';
const B = src('build/build80.sh');
ok(B && /RETIRED/.test(B) && !/cbam-annex1/.test(B.replace(/^#.*$/gm, '')), 'build80.sh is the retired note and no command reads data/cbam-annex1.json');
if (B) { const T = mkdtempSync(join(tmpdir(), 'b80-')); cpSync(join(TREE, 'build', 'build80.sh'), join(T, 'build80.sh')); const before = readdirSync(T).join();
  const r = spawnSync('bash', [join(T, 'build80.sh')], { cwd: T, encoding: 'utf8' });
  ok(r.status === 0 && /retired/.test(r.stdout) && readdirSync(T).join() === before, 'running it exits 0 and writes nothing', (r.status) + ' ' + (r.stdout || r.stderr).trim().slice(0, 200)); rmSync(T, { recursive: true, force: true }); }
else ok(false, 'running it exits 0 and writes nothing', 'build/build80.sh not in this tree (the laptop copy requires data/cbam-annex1.json)');
ok(!/cbam/i.test(src('build/v2838/build_all.sh') || 'cbam'), 'the current build (build/v2838/build_all.sh) needs no financial table');
done('A05-BUILD80');
