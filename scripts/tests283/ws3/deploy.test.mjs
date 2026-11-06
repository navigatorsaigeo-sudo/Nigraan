// v91.17.283 · WS3 items 5-7 (unit level) · the supervisor puts back a half-done deploy before it starts a server (recoverDeploy), the
// deploy templates and generator (hash guard files, ASCII-only scripts, resumable DEPLOY), the packager (list derived from the code,
// plain folder + SHA256SUMS, no images, no state, no secrets, exit codes).
// usage: node scripts/tests283/ws3/deploy.test.mjs [tree]      (the end-to-end runs are deploy_e2e.sh and release_serve.test.mjs)
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { TREE, ok, tmp, step, done } from './_lib.mjs';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const put = (f, t) => { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, t); };
const has = (rel, re) => { try { return re.test(readFileSync(join(TREE, rel), 'utf8')); } catch (_) { return false; } };

/* ---- 5 · recoverDeploy ------------------------------------------------------------------------------------------------------------ */
let recoverDeploy = null;
if (has('scripts/wd/supervisor.mjs', /export function recoverDeploy/)) {
  process.env.NIGRAAN_SUP_NO_MAIN = '1'; process.env.NIGRAAN_DATA_DIR = tmp('supdata');
  ({ recoverDeploy } = await import(pathToFileURL(join(TREE, 'scripts/wd/supervisor.mjs')).href));
}
function install(state, o = {}) {
  const d = tmp('inst'), run = join(d, 'data', 'run'); mkdirSync(run, { recursive: true });
  const A = join(d, 'server', 'a.mjs'), B = join(d, 'server', 'b.mjs'), N = join(d, 'server', 'new.mjs');
  put(A, 'new A'); put(A + '.b283.bak', 'old A'); put(B, 'old B'); put(B + '.b283.bak', 'old B'); put(N, 'new N');
  if (o.noBak) put(A + '.b283.bak', 'tampered');
  const files = [{ rel: 'a', dst: A, bak: A + '.b283.bak', shaNew: sha('new A'), shaOld: sha('old A') }, { rel: 'b', dst: B, bak: B + '.b283.bak', shaNew: sha('new B'), shaOld: sha('old B') }, { rel: 'n', dst: N, bak: null, shaNew: sha('new N'), shaOld: null }];
  const j = { schema: 'agn.deploy-journal.v1', version: '283', full: '91.17.283', state, startedAt: new Date(Date.now() - 60e3).toISOString(), updatedAt: o.updatedAt || new Date(Date.now() - 30e3).toISOString(), deployPid: o.pid || 999999, swapPid: o.pid || 999998, port0: 8791, files };
  writeFileSync(join(run, 'deploy-journal.json'), JSON.stringify(j));
  if (o.request) writeFileSync(join(run, 'request.json'), JSON.stringify({ id: 'd283-20261020-swap', kind: 'swap' }));
  return { d, run, A, B, N };
}
const quiet = { log: () => {}, stop: () => {} };
await step('5a a restart in the middle of a copy: the previous files are back before a server starts', async () => {
  ok(!!recoverDeploy, '5a supervisor.mjs exports recoverDeploy (the boot check)'); if (!recoverDeploy) return;
  const I = install('copying', { request: true });
  const r = recoverDeploy({ run: I.run, running: false, ...quiet, bootMs: Date.now() });
  const j = JSON.parse(readFileSync(join(I.run, 'deploy-journal.json'), 'utf8'));
  ok(r.action === 'restored' && readFileSync(I.A, 'utf8') === 'old A' && !existsSync(I.N) && existsSync(I.N + '.v283-rolled-back') && j.state === 'restored-by-supervisor',
    '5a replaced file restored, added file set aside (not deleted), journal restored-by-supervisor', JSON.stringify({ action: r.action, restored: r.restored, setAside: r.setAside, already: r.already, state: j.state }));
  ok(!existsSync(join(I.run, 'request.json')) && r.requestSetAside === 'd283-20261020-swap', '5a the waiting swap request of the dead deploy is set aside');
  ok(JSON.parse(readFileSync(join(I.run, 'build-state.json'), 'utf8')).complete === true, '5a build-state.json: a complete build is on disk');
});
await step('5b a deploy still running is never touched; a switched one is left for its ROLLBACK; active is started as is', async () => {
  if (!recoverDeploy) return ok(false, '5b recoverDeploy exists');
  const I1 = install('copying', { pid: process.ppid, updatedAt: new Date().toISOString() });   /* this process stands in for the deploy */
  const r1 = recoverDeploy({ run: I1.run, running: false, ...quiet, bootMs: Date.now() - 3600e3 });
  ok(r1.action === 'left' && readFileSync(I1.A, 'utf8') === 'new A', '5b1 deploy process alive and journal written since boot: left', JSON.stringify(r1));
  const I2 = install('swapped');
  const r2 = recoverDeploy({ run: I2.run, running: true, activePortNow: 8792, ...quiet });
  ok(r2.action === 'left' && readFileSync(I2.A, 'utf8') === 'new A', '5b2 servers running and the deploy switched: left (no mixing under the new server)', JSON.stringify(r2));
  const I3 = install('copied');
  const r3 = recoverDeploy({ run: I3.run, running: true, activePortNow: 8791, ...quiet });
  ok(r3.action === 'restored' && readFileSync(I3.A, 'utf8') === 'old A', '5b3 servers running, not switched, deploy gone: put back (as deploy_swap would)', JSON.stringify({ a: r3.action, s: r3.state }));
  const I4 = install('active');
  const r4 = recoverDeploy({ run: I4.run, running: false, ...quiet });
  ok(r4.action === 'none' && readFileSync(I4.A, 'utf8') === 'new A', '5b4 an active (complete) build starts as it is');
  const I5 = install('swapping', { noBak: true });
  const r5 = recoverDeploy({ run: I5.run, running: false, ...quiet });
  ok(r5.state === 'restore-incomplete' && r5.problems.length === 1, '5b5 a previous copy that does not match its sha256 is reported, not used', JSON.stringify(r5.problems));
});
await step('5c deploy_swap.ps1 writes the journal; the supervisor stops its servers on a signal', async () => {
  ok(has('_admin/deploy_swap.ps1', /Journal 'copying'/) && has('_admin/deploy_swap.ps1', /Journal 'swapped'/) && has('_admin/deploy_swap.ps1', /\$fs\.Flush\(\$true\)/), '5c1 deploy_swap.ps1: journal before the first copy and after the swap, flushed to disk');
  ok(has('scripts/wd/supervisor.mjs', /recoverDeploy\(\{ running/), '5c2 the supervisor runs the check before it starts a server');
  ok(has('scripts/wd/supervisor.mjs', /async function stopAll\(sig\)/), '5c3 SIGINT/SIGTERM: the supervisor asks its servers to stop (final write) and waits, with a limit');
});

/* ---- 6 · templates, generator, ASCII lint ------------------------------------------------------------------------------------------ */
let mk = null; if (existsSync(join(TREE, 'scripts/deploy/mkdeploy.mjs'))) mk = await import(pathToFileURL(join(TREE, 'scripts/deploy/mkdeploy.mjs')).href);
await step('6a ASCII lint: every .ps1/.bat/.cmd of the tree, the templates and the generated package', async () => {
  ok(!!(mk && mk.asciiLint), '6a1 scripts/deploy/mkdeploy.mjs exports asciiLint'); if (!mk) return;
  const neg = tmp('lint'); put(join(neg, 'x.ps1'), 'Say "a — b"'); put(join(neg, 'y.bat'), '@echo ok');
  const L = mk.asciiLint(neg); ok(L.length === 1 && L[0].file === 'x.ps1', '6a2 a UTF-8 dash in a .ps1 is caught', JSON.stringify(L));
  const tree = [...mk.asciiLint(join(TREE, '_admin')), ...mk.asciiLint(join(TREE, 'scripts'))];
  ok(!tree.length, '6a3 _admin and scripts/ (wd, deploy, operator tools such as scripts/landslide_basis/*.bat) hold no byte > 127 in a .ps1/.bat/.cmd', JSON.stringify(tree));
  const ws5 = '/tmp/claude-0/v283/WS5/srv/scripts/landslide_basis'; if (existsSync(ws5)) { const L5 = mk.asciiLint(ws5); ok(!L5.length && readdirSync(ws5).filter((n) => /\.bat$/i.test(n)).length === 2, '6a5 WS5 FETCH_ and RETRAIN_LANDSLIDE_BASIS.bat are ASCII', JSON.stringify(L5)); }
  const T = join(TREE, 'scripts', 'deploy', 'templates'); const bad = []; for (const n of readdirSync(T)) { const b = readFileSync(join(T, n)); for (let i = 0; i < b.length; i++) if (b[i] > 127) { bad.push(n + '@' + i); break; } }
  ok(!bad.length, '6a4 the templates are ASCII', bad.join(', '));
});
await step('6b the generator: SHA256SUMS of new/, EXPECTED_prev of the base, CRLF scripts, the resumable DEPLOY', async () => {
  if (!mk) return ok(false, '6b mkdeploy exists');
  /* a two-file "new" tree over a base tree */
  const base = tmp('base'), nw = tmp('new'), out = join(tmp('pkg'), 'pkg');
  for (const t of [base, nw]) { put(join(t, 'server', 'server.mjs'), "const P = 'hazard-scale.json';"); put(join(t, 'data', 'hazard-scale.json'), '{"v":1}'); put(join(t, '_admin', 'deploy_swap.ps1'), readFileSync(join(TREE, '_admin', 'deploy_swap.ps1'))); mkdirSync(join(t, 'scripts'), { recursive: true }); copyFileSync(join(TREE, 'scripts', 'pack-release.mjs'), join(t, 'scripts', 'pack-release.mjs')); }
  put(join(base, 'package.json'), '{"version":"91.17.282.1"}'); put(join(nw, 'package.json'), '{"version":"91.17.283"}');
  /* v91.17.283.2 · test fix: since v283.1 mkdeploy reads the live check's gate version from data/model-gate.resolved.json of the tree it
     packs; the temporary trees carry the same small gate file (unchanged between base and new, so it is not packed) */
  const GATE_T = 'gate-test-0'; for (const t of [base, nw]) put(join(t, 'data', 'model-gate.resolved.json'), JSON.stringify({ version: GATE_T }));
  put(join(nw, 'data', 'hazard-scale.json'), '{"v":2}'); put(join(nw, 'data', 'logo.png'), 'PNG'); put(join(nw, 'server', 'new.mjs'), "export const x = 1;");
  const r = await mk.makeDeploy({ version: '283', bases: [base + '=282.1'], out, newTree: nw, summary: 'test · package', tests: false });
  const sums = readFileSync(join(out, 'SHA256SUMS.txt'), 'utf8'), exp = readFileSync(join(out, 'EXPECTED_prev_SHA256.txt'), 'utf8');
  ok(r.files.includes('data/hazard-scale.json') && r.files.includes('server/new.mjs') && !r.files.some((f) => f.endsWith('.png')) && !r.files.includes('server/server.mjs'), '6b1 the package holds what changed, no image', JSON.stringify(r.files));
  ok(/new\/nigraan-local\/data\/hazard-scale\.json/.test(sums) && sums.includes('\r\n'), '6b2 SHA256SUMS.txt lists new/ (CRLF)');
  ok(exp.includes(sha('{"v":1}') + '  nig\\nigraan-local\\data\\hazard-scale.json') && exp.includes('-'.repeat(64) + '  nig\\nigraan-local\\server\\new.mjs'), '6b3 EXPECTED_prev names the base file (or 64 dashes for a new file)');
  const crlfSwap = sha(Buffer.from(readFileSync(join(base, '_admin', 'deploy_swap.ps1'), 'latin1').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'), 'latin1'));
  ok(exp.includes(crlfSwap + '  _admin\\deploy_swap.ps1'), '6b4 _admin scripts are expected in their CRLF form (what the laptop holds)');
  const D = readFileSync(join(out, 'DEPLOY_V283.ps1'), 'latin1');
  ok(!/@[A-Z_]+@/.test(D) && D.includes('\r\n') && /RESUME: an earlier run/.test(D) && /ALREADY DEPLOYED/.test(D) && /Set-JournalState 'active'/.test(D) && /package verified: \{0\} files match SHA256SUMS.txt/.test(D) && /does not hold v282\.1 for the files this package replaces/.test(D),
    '6b5 DEPLOY_V283.ps1: placeholders filled, CRLF, hash guards, resumable, marks the journal active');
  ok(D.includes("-ne '" + GATE_T + "'") && !r.files.includes('data/model-gate.resolved.json'), '6b9 the live check expects the gate version of the packed tree (read from its file, not typed)');
  ok(!mk.asciiLint(out).length && /test - package/.test(D), '6b6 the package scripts are ASCII (a non-ASCII summary is transliterated)');
  const pwsh = process.env.PWSH || '/tmp/claude-0/x/pwsh/pwsh';
  if (existsSync(pwsh)) { const res = spawnSync(pwsh, ['-NoProfile', '-Command', "$e=$null; foreach ($f in @('" + ['DEPLOY_V283.ps1', 'ROLLBACK_V283.ps1', 'new/_admin/deploy_swap.ps1'].map((f) => join(out, f)).join("','") + "')) { [void][System.Management.Automation.Language.Parser]::ParseFile($f,[ref]$null,[ref]$e); if ($e) { $e | % { $f + ': ' + $_.Message } } }; 'parsed'"], { encoding: 'utf8', timeout: 60000 });
    ok(/parsed\s*$/.test(res.stdout) && !/: /.test(res.stdout.replace(/parsed\s*$/, '')), '6b8 the generated .ps1 files parse (PowerShell parser)', res.stdout.trim().slice(0, 300)); }
});

/* ---- 7 · packager ------------------------------------------------------------------------------------------------------------------ */
await step('7 pack-release: list from the code, plain folder + SHA256SUMS, no state, no secret, no image; failures exit 1', async () => {
  const src = readFileSync(join(TREE, 'scripts', 'pack-release.mjs'), 'utf8');
  ok(/export function releaseFiles/.test(src) && !/execFileSync\('zip'/.test(src), '7a pack-release exports releaseFiles and makes no ZIP');
  if (!/export function releaseFiles/.test(src)) return;
  const P = await import(pathToFileURL(join(TREE, 'scripts', 'pack-release.mjs')).href);
  const L = P.releaseFiles(TREE).files.map((f) => f.rel);
  const want = ['artefact/NIGRAAN_START.html', 'artefact/NIGRAAN_3.html', 'data/hazard-scale.json', 'data/national-model.json', 'data/model-gate.json', 'data/model-gate.resolved.json', 'data/pk-rivers.json'];
  ok(want.every((w) => L.includes(w)), '7b the files the old hand-typed list missed are in the derived list', want.filter((w) => !L.includes(w)).join(', ') || 'all present');
  ok(!L.some((r) => /token-secret|nigraan-db\.json|^data\/run\/|\.key$|users\.csv|KEYS\.txt|creds\.json|\.env$/.test(r)), '7c no state, no credential in the list');
  ok(!L.some((r) => /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(r)), '7d no image in the list');
  /* a mini tree: literal paths, a folder read whole, an image, state and secrets (the secrets are never opened: they are not readable here) */
  const t = tmp('mini'), out = join(tmp('rel'), 'out');
  put(join(t, 'package.json'), '{"version":"91.17.283"}'); mkdirSync(join(t, 'scripts'), { recursive: true }); copyFileSync(join(TREE, 'scripts', 'pack-release.mjs'), join(t, 'scripts', 'pack-release.mjs'));
  put(join(t, 'server', 'server.mjs'), "const A = 'NIGRAAN_START.html'; const B = join(DATA, 'place-areas', 'pk-place-areas.json.gz'); const C = 'data/pk-rivers.json'; const D = 'logo.png';");
  put(join(t, 'artefact', 'NIGRAAN_START.html'), '<html>'); put(join(t, 'artefact', 'unused.html'), 'x'); put(join(t, 'data', 'place-areas', 'pk-place-areas.json.gz'), 'gz'); put(join(t, 'data', 'place-areas', 'other.json'), '{}');
  put(join(t, 'data', 'pk-rivers.json'), '{}'); put(join(t, 'artefact', 'logo.png'), 'PNG'); put(join(t, 'artefact', 'photo.jpg'), 'JPG');
  put(join(t, 'data', 'run', 'active.json'), '{}'); put(join(t, 'data', 'nigraan-db.json'), '{}');
  mkdirSync(join(t, 'data', 'token-secret'), { recursive: true }); mkdirSync(join(t, 'secrets', 'users.csv'), { recursive: true });   /* folders: a read would fail */
  const res = spawnSync(process.execPath, [join(t, 'scripts', 'pack-release.mjs'), out], { encoding: 'utf8', timeout: 60000 });
  const files = existsSync(join(out, 'new')) ? (function w(d, r = '') { return readdirSync(join(d, r), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? w(d, r ? r + '/' + e.name : e.name) : [r ? r + '/' + e.name : e.name]); })(join(out, 'new', 'nigraan-local')) : [];
  ok(res.status === 0 && files.includes('artefact/NIGRAAN_START.html') && files.includes('data/place-areas/pk-place-areas.json.gz') && files.includes('data/pk-rivers.json') && files.includes('artefact/logo.png') && !files.includes('artefact/photo.jpg') && !files.includes('artefact/unused.html') && !files.some((f) => /run\/|nigraan-db|token-secret|users\.csv/.test(f)),
    '7e mini tree: named files and the named image ship; an unnamed image, state and secrets do not', 'exit ' + res.status + ' ' + JSON.stringify(files) + ' ' + (res.stderr || '').slice(0, 200));
  const M = existsSync(join(out, 'RELEASE_MANIFEST.json')) ? JSON.parse(readFileSync(join(out, 'RELEASE_MANIFEST.json'), 'utf8')) : {};
  ok((M.imagesTheRuntimeReads || []).join() === 'artefact/logo.png', '7f the manifest lists the image the runtime reads', JSON.stringify(M.imagesTheRuntimeReads));
  const sums = existsSync(join(out, 'SHA256SUMS.txt')) ? readFileSync(join(out, 'SHA256SUMS.txt'), 'utf8').split(/\r?\n/).filter(Boolean) : [];
  ok(sums.length === files.length && sums.every((l) => { const [h, p] = l.split(/\s+/); return sha(readFileSync(join(out, p))) === h; }), '7g SHA256SUMS.txt covers every file and re-reads equal', sums.length + ' sums / ' + files.length + ' files');
  const again = spawnSync(process.execPath, [join(t, 'scripts', 'pack-release.mjs'), out], { encoding: 'utf8', timeout: 60000 });
  /* coordinator: a file the runtime needs that only the laptop holds (drought-class.json) is taken from --fill-from; the laptop's
     RELEASE_EXCLUDE.txt ("data/") never drops a file the code names; data/archive and data/cache never ship */
  const t2 = tmp('mini2'), out2 = join(tmp('rel2'), 'out'), lap = tmp('laptopdata');
  put(join(t2, 'package.json'), '{"version":"91.17.283"}'); mkdirSync(join(t2, 'scripts'), { recursive: true }); copyFileSync(join(TREE, 'scripts', 'pack-release.mjs'), join(t2, 'scripts', 'pack-release.mjs'));
  put(join(t2, 'RELEASE_EXCLUDE.txt'), 'data/\nbuild/\n'); put(join(t2, 'server', 'x.mjs'), "const a = 'drought-class.json', b = 'range90-zone.json', c = join(DATA, 'flood-extent'), d = 'state.json', e = 'seen.json';");
  put(join(t2, 'data', 'range90-zone.json'), '{}'); put(join(t2, 'data', 'flood-extent', 'fx-model.json'), '{}'); put(join(t2, 'data', 'cache', 'quake', 'state.json'), '{}'); put(join(t2, 'data', 'archive', 'seen.json'), '{}');
  put(join(lap, 'drought-class.json'), '{"laptop":1}');
  const r2 = spawnSync(process.execPath, [join(t2, 'scripts', 'pack-release.mjs'), out2, '--fill-from', lap], { encoding: 'utf8', timeout: 60000 });
  const has2 = (r) => existsSync(join(out2, 'new', 'nigraan-local', r));
  ok(r2.status === 0 && has2('data/drought-class.json') && has2('data/range90-zone.json') && has2('data/flood-extent/fx-model.json') && !has2('data/cache/quake/state.json') && !has2('data/archive/seen.json'),
    '7i --fill-from takes drought-class.json from the laptop data; RELEASE_EXCLUDE data/ does not drop named files; archive and cache never ship', 'exit ' + r2.status + ' ' + (r2.stdout + r2.stderr).slice(0, 300));
  /* WS5: an operator tool folder ships with what its .bat calls (same relative paths) and the modules those import; its data folder never */
  const t3 = tmp('mini3'), out3 = join(tmp('rel3'), 'out');
  put(join(t3, 'package.json'), '{"version":"91.17.283"}'); mkdirSync(join(t3, 'scripts'), { recursive: true }); copyFileSync(join(TREE, 'scripts', 'pack-release.mjs'), join(t3, 'scripts', 'pack-release.mjs'));
  put(join(t3, 'server', 'x.mjs'), 'export const a = 1;');
  put(join(t3, 'scripts', 'landslide_basis', 'FETCH_LANDSLIDE_BASIS.bat'), '@echo off\r\npython scripts\\landslide_basis\\fetch_landslide_basis.py --pause 1.5\r\n');
  put(join(t3, 'scripts', 'landslide_basis', 'RETRAIN_LANDSLIDE_BASIS.bat'), '@echo off\r\npython scripts\\gen\\ws5\\landslide_basis_fit.py data\\landslide-basis x\r\n');
  put(join(t3, 'scripts', 'landslide_basis', 'fetch_landslide_basis.py'), 'import os\n'); put(join(t3, 'scripts', 'gen', 'ws5', 'landslide_basis_fit.py'), 'import sys\nfrom common import load\n');
  put(join(t3, 'scripts', 'gen', 'ws5', 'common.py'), 'def load(): pass\n'); put(join(t3, 'scripts', 'gen', 'ws5', 'unrelated.py'), 'x = 1\n'); put(join(t3, 'data', 'landslide-basis', 'cache', 'a.json'), '{}');
  const r3 = spawnSync(process.execPath, [join(t3, 'scripts', 'pack-release.mjs'), out3], { encoding: 'utf8', timeout: 60000 });
  const has3 = (r) => existsSync(join(out3, 'new', 'nigraan-local', r));
  ok(r3.status === 0 && ['scripts/landslide_basis/FETCH_LANDSLIDE_BASIS.bat', 'scripts/landslide_basis/RETRAIN_LANDSLIDE_BASIS.bat', 'scripts/landslide_basis/fetch_landslide_basis.py', 'scripts/gen/ws5/landslide_basis_fit.py', 'scripts/gen/ws5/common.py'].every(has3) && !has3('scripts/gen/ws5/unrelated.py') && !has3('data/landslide-basis/cache/a.json'),
    '7j operator tools: the .bat folder, the scripts it calls and their imports ship at the same paths; data/landslide-basis never', 'exit ' + r3.status + ' ' + (r3.stderr || '').slice(0, 200));
  ok(again.status === 1 && /FAILED/.test(again.stderr), '7h a failure (output folder not empty) exits 1 with the reason', 'exit ' + again.status + ' ' + (again.stderr || '').split('\n')[0]);
});
done();
