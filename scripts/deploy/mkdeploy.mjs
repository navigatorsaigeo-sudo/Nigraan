/* ══ v91.17.283 · WS3 · THE DEPLOY PACKAGE GENERATOR ══════════════════════════════════════════════════════════════════════════════════
   Makes the zero-downtime deploy package of this tree as plain files (no ZIP):
     node scripts/deploy/mkdeploy.mjs --version 283 --base <tree of the live build>=<its version, e.g. 282.1> [--base ...]
                                      --out <package folder> [--summary "one line"] [--date "20 Oct 2026"] [--status-entry <md>]
                                      [--no-tests] [--new <tree>] [--fill-from <live data folder>] [--include <file>]
                                      [--shipped <earlier package folder> ...] [--installed <staged copy of D:\NIGRAAN>] [--trust-base-tree]
   <out>/
     DEPLOY_V<ver>.bat / .ps1, ROLLBACK_V<ver>.bat / .ps1   from scripts/deploy/templates/*.tpl (CRLF, ASCII only)
     README_V<ver>.txt
     new/nigraan-local/...   every runtime file (scripts/pack-release.mjs releaseFiles: derived from the code) that differs from a base,
                             plus changed test files (scripts/tests*) unless --no-tests; never an image unless the code names it
     new/_admin/deploy_swap.ps1 (always; CRLF) and new/_admin/docs/STATUS_V<ver>_ENTRY.md (with --status-entry)
     SHA256SUMS.txt          "<sha256>  new/<path>" for every file under new/ (DEPLOY refuses a package that does not match it)
     EXPECTED_prev_SHA256.txt  one "# set <base>" block per base: that build's sha256 for every file the package replaces (64 dashes =
                             the base has no such file); DEPLOY refuses unless the computer holds one base for every such file.
                             v91.17.283.15 · the hashes are those of the files the computer really holds, never of a tree file no package
                             shipped (v283.15 was refused: v283.13/.14 changed build/gen/gate.slim.json and build/start/start.src.html in
                             their trees but never shipped them, so the laptop kept v283.12's). Sources, in order of authority:
                               --installed <dir>  a staged copy of the computer (<dir>/nig/nigraan-local/..., <dir>/_admin/...): every
                                                  replaced file must be in it (a file the chain says exists but the copy lacks fails)
                               --base <tree> + --shipped <package> ... (oldest first): the base tree is the anchor (the last build known
                                                  installed whole), each package's new/ files overlay it in install order
                             Where both are given the chain is checked against the copy and every disagreement is reported (the copy wins).
                             Neither given: refused unless --trust-base-tree (the old rule: the base tree is taken as installed).
                             _admin scripts are compared in the CRLF form every package delivered (the laptop never had the LF copy
                             the cloud tree holds; v282.1 listed the LF hash and only passed because deploy_swap.ps1 was unchanged)
     bak/DEPLOY_V<ver>_FILES.txt  (empty; the deploy writes its record there)
   Checks that fail the run (exit 1): package.json must say 91.17.<ver>; every .ps1/.bat/.cmd of the package must be ASCII (Windows
   PowerShell 5.1 reads a .ps1 without a byte-order mark as ANSI: one UTF-8 dash breaks a string); no image file; every placeholder of
   the templates filled; the package re-read equals SHA256SUMS.txt. */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const crlf = (b) => Buffer.from(b.toString('latin1').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'), 'latin1');
const SCRIPT = /\.(ps1|bat|cmd)$/i;
const IMAGE = /\.(png|jpe?g|gif|webp|svg|ico|bmp|tiff?)$/i;
function writeFsync(f, data) { mkdirSync(dirname(f), { recursive: true }); const fd = openSync(f, 'w'); try { writeFileSync(fd, data); fsyncSync(fd); } finally { closeSync(fd); } }
function walk(root, rel = '', out = []) { const p = join(root, rel); let st; try { st = statSync(p); } catch (_) { return out; }
  if (st.isDirectory()) { for (const n of readdirSync(p)) walk(root, rel ? rel + '/' + n : n, out); } else if (st.isFile()) out.push(rel); return out; }

/* the ASCII lint: every byte of every .ps1 / .bat / .cmd under dir must be <= 127; returns [{ file, offset, byte }] */
export function asciiLint(dir) {
  const bad = [];
  for (const rel of walk(dir)) { if (!SCRIPT.test(rel)) continue; const b = readFileSync(join(dir, rel)); for (let i = 0; i < b.length; i++) if (b[i] > 127) { bad.push({ file: rel, offset: i, byte: b[i] }); break; } }
  return bad;
}
export const toAscii = (s) => String(s || '').normalize('NFKD').replace(/[\u2010-\u2015]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\u00b7/g, '-').replace(/[^\x00-\x7f]/g, '');

export async function makeDeploy(o) {
  const NEW = resolve(o.newTree || join(HERE, '..', '..'));
  const VD = String(o.version).replace(/^v/, ''), VU = VD.replace(/\./g, '_'), FULL = /^\d+\.\d+\./.test(VD) ? VD : '91.17.' + VD;
  const bases = (o.bases || []).map((b) => { const i = b.lastIndexOf('='); return i > 0 ? { dir: resolve(b.slice(0, i)), label: b.slice(i + 1) } : { dir: resolve(b), label: null }; });
  if (!bases.length) throw new Error('at least one --base <tree>=<version> is needed (the build the computer runs now)');
  for (const B of bases) { if (!existsSync(join(B.dir, 'package.json'))) throw new Error('base ' + B.dir + ' has no package.json'); if (!B.label) B.label = JSON.parse(readFileSync(join(B.dir, 'package.json'), 'utf8')).version.replace(/^91\.17\./, ''); }
  const pv = JSON.parse(readFileSync(join(NEW, 'package.json'), 'utf8')).version;
  if (pv !== FULL) throw new Error('the new tree\'s package.json says ' + pv + '; this package is v' + VD + ' (' + FULL + '): deploy_swap.ps1 would refuse it');
  const OUT = resolve(o.out); if (existsSync(OUT) && readdirSync(OUT).length) throw new Error('the output folder ' + OUT + ' exists and is not empty');
  const { releaseFiles } = await import(pathToFileURL(join(NEW, 'scripts', 'pack-release.mjs')).href);
  const R = releaseFiles(NEW);
  const cand = new Set(R.files.map((f) => f.rel));
  if (o.tests !== false) for (const rel of walk(NEW, 'scripts')) if (/^scripts\/tests[^/]*\//.test(rel) && !IMAGE.test(rel)) cand.add(rel);
  const same = (a, b) => !!a && existsSync(a) && existsSync(b) && sha(readFileSync(a)) === sha(readFileSync(b));
  /* v91.17.283 · INTEG · --fill-from <live data folder> (repeatable): a data file the base TREE lacks but the computer holds (the cloud copy
     of the live tree is incomplete: drought-class.json, the landslide model ...) is judged against the computer's copy: not shipped when
     equal, and listed in EXPECTED_prev with the computer's hash when replaced (so DEPLOY does not refuse a file the base tree never had) */
  const FILL = [].concat(o.fillFrom || []).map((d) => resolve(d));
  const SHIP = [].concat(o.shipped || []).map((d) => resolve(d)), INST = o.installed ? resolve(o.installed) : null;
  for (const d of SHIP) if (!existsSync(join(d, 'new', 'nigraan-local'))) throw new Error('--shipped ' + d + ': no new/nigraan-local folder (not a deploy package)');
  if (INST && !existsSync(join(INST, 'nig', 'nigraan-local'))) throw new Error('--installed ' + INST + ': no nig/nigraan-local folder (stage the computer\'s files as D:\\NIGRAAN\\nig\\nigraan-local\\...)');
  if (!SHIP.length && !INST && !o.trustBaseTree) throw new Error('EXPECTED_prev needs the files the computer holds: give --installed <staged copy> and/or --shipped <each package installed since the base tree>, or --trust-base-tree when the base tree is the installed build file for file');
  /* the anchor: the base tree (and --fill-from for data it lacks); then every shipped package in install order */
  const baseOf = (B, rel) => { for (let i = SHIP.length - 1; i >= 0; i--) { const q = join(SHIP[i], 'new', 'nigraan-local', rel); if (existsSync(q)) return q; }
    const p = join(B.dir, rel); if (existsSync(p)) return p;
    if (rel.startsWith('data/')) for (const d of FILL) { const q = join(d, rel.slice(5)); if (existsSync(q)) return q; } return null; };
  const adminOf = (B, a) => { for (let i = SHIP.length - 1; i >= 0; i--) { const q = join(SHIP[i], 'new', '_admin', a); if (existsSync(q)) return sha(readFileSync(q)); }
    const p = join(B.dir, '_admin', a); return existsSync(p) ? sha(SCRIPT.test(a) ? crlf(readFileSync(p)) : readFileSync(p)) : null; };
  const disagree = [];
  /* v91.17.283.1 · --include <rel> (repeatable): a file shipped even when it equals the base (an earlier package left it out: v283 omitted
     scripts/run-tests.mjs and scripts/lib/testenv.mjs); EXPECTED_prev lists the base's hash, and a computer without the file is accepted */
  const INC = [].concat(o.include || []).map((r) => String(r).split('\\').join('/').replace(/^\/+/, ''));
  for (const r of INC) if (!existsSync(join(NEW, r))) throw new Error('--include ' + r + ': not in the tree');
  const nl = [...new Set([...[...cand].filter((rel) => rel !== 'data/flood.json' && bases.some((B) => !same(baseOf(B, rel), join(NEW, rel)))), ...INC])].sort();
  const imgs = nl.filter((r) => IMAGE.test(r) && !R.images.includes(r)); if (imgs.length) throw new Error('image file(s) in the package: ' + imgs.join(', '));
  /* the package */
  for (const rel of nl) writeFsync(join(OUT, 'new', 'nigraan-local', rel), readFileSync(join(NEW, rel)));
  const ad = ['deploy_swap.ps1'];
  writeFsync(join(OUT, 'new', '_admin', 'deploy_swap.ps1'), crlf(readFileSync(join(NEW, '_admin', 'deploy_swap.ps1'))));
  /* v91.17.283.6 · --admin <name> (repeatable): a laptop tool kept in the tree's _admin folder, shipped to D:\NIGRAAN\_admin\<name> (scripts in
     CRLF and ASCII, as deploy_swap.ps1; listed in SHA256SUMS and EXPECTED_prev like every other file) */
  for (const a of [].concat(o.admin || [])) { const r = String(a).split('\\').join('/').replace(/^\/+/, ''); const src = join(NEW, '_admin', r); if (!existsSync(src)) throw new Error('--admin ' + r + ': not in the tree\'s _admin folder');
    ad.push(r); writeFsync(join(OUT, 'new', '_admin', r), SCRIPT.test(r) ? crlf(readFileSync(src)) : readFileSync(src)); }
  if (o.statusEntry) { ad.push('docs/STATUS_V' + VU + '_ENTRY.md'); writeFsync(join(OUT, 'new', '_admin', 'docs', 'STATUS_V' + VU + '_ENTRY.md'), readFileSync(o.statusEntry)); }
  /* the scripts from the templates */
  const date = o.date || (() => { const d = new Date(Date.now() + 5 * 3600e3); return d.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + ' ' + d.getUTCFullYear(); })();
  const summary = toAscii(o.summary || 'see README_V' + VU + '.txt');
  const MAP = { '@FULL@': FULL, '@VU@': VU, '@VD@': VD, '@BASE@': bases[0].label, '@BASEFULL@': /^\d+\.\d+\./.test(bases[0].label) ? bases[0].label : '91.17.' + bases[0].label,
    '@BASES@': bases.map((B) => 'v' + B.label).join(' or '), '@DATE@': toAscii(date), '@SUMMARY@': summary, '@SUMMARY_BAT@': summary.replace(/[%^&|<>]/g, ' ') };
  /* v91.17.283.1 · the live check's expected gate version is the version of the resolved gate file in the tree being packed (the file the
     server reads for /api/report/gate-status), not a typed constant: v283's DEPLOY failed once on a stale 'gate-91.17.279' */
  let GATE = null; for (const f of ['model-gate.resolved.json', 'model-gate.json']) { try { const v = JSON.parse(readFileSync(join(NEW, 'data', f), 'utf8')).version; if (v) { GATE = String(v); break; } } catch (_) {} }
  if (!GATE || !/^[\w.-]+$/.test(GATE)) throw new Error('the gate version could not be read from data/model-gate.resolved.json of ' + NEW);
  MAP['@GATE@'] = GATE;
  const T = join(HERE, 'templates');
  for (const [tpl, name] of [['DEPLOY.ps1.tpl', 'DEPLOY_V' + VU + '.ps1'], ['DEPLOY.bat.tpl', 'DEPLOY_V' + VU + '.bat'], ['ROLLBACK.ps1.tpl', 'ROLLBACK_V' + VU + '.ps1'], ['ROLLBACK.bat.tpl', 'ROLLBACK_V' + VU + '.bat']]) {
    let t = readFileSync(join(T, tpl), 'utf8'); for (const [k, v] of Object.entries(MAP)) t = t.split(k).join(v);
    const left = t.match(/@[A-Z_]+@/g); if (left) throw new Error(tpl + ': placeholder(s) not filled: ' + [...new Set(left)].join(', '));
    writeFsync(join(OUT, name), crlf(Buffer.from(t, 'latin1')));
  }
  const readme = ['NIGRAAN v' + FULL + ' - zero-downtime deploy package (' + toAscii(date) + ')', '', 'What it brings: ' + summary, '',
    'Install: copy this folder to D:\\NIGRAAN\\_admin\\step2\\v' + VU + ', copy DEPLOY_V' + VU + '.ps1 and ROLLBACK_V' + VU + '.ps1 next to it (D:\\NIGRAAN\\_admin\\step2\\), then run:',
    '  cd /d "D:\\NIGRAAN\\_admin\\step2"', '  DEPLOY_V' + VU + '.bat', '',
    'Before anything is changed it checks every file against SHA256SUMS.txt and that this computer holds ' + MAP['@BASES@'] + ' for every file it replaces (EXPECTED_prev_SHA256.txt).',
    'If it stops in the middle (window closed, restart, power cut), run DEPLOY_V' + VU + '.bat again: it continues, or starts again from the base. At a restart the supervisor puts a half-copied build back before it starts the server.',
    'Undo: cd /d "D:\\NIGRAAN\\_admin\\step2"  then  ROLLBACK_V' + VU + '.bat', '',
    'Files: ' + nl.length + ' under new\\nigraan-local, ' + ad.length + ' under new\\_admin. No images. Plain files, no ZIP.', ''].join('\r\n');
  writeFsync(join(OUT, 'README_V' + VU + '.txt'), Buffer.from(toAscii(readme), 'latin1'));
  writeFsync(join(OUT, 'bak', 'DEPLOY_V' + VU + '_FILES.txt'), '');
  /* SHA256SUMS of new/ and EXPECTED_prev of every base */
  const newFiles = walk(join(OUT, 'new')).sort();
  writeFsync(join(OUT, 'SHA256SUMS.txt'), newFiles.map((r) => sha(readFileSync(join(OUT, 'new', r))) + '  new/' + r).join('\r\n') + '\r\n');
  const exp = [];
  for (const B of bases) {
    exp.push('# set ' + B.label + '  (v' + (/^\d+\.\d+\./.test(B.label) ? B.label : '91.17.' + B.label) + ': that build\'s file for every file this package replaces; 64 dashes = not in that build)');
    const pick = (key, chain, inst) => { if (!INST) return chain;
      if (inst == null && chain != null) throw new Error('--installed: ' + key + ' is not in the staged copy (stage every file the package replaces; the chain says the computer holds it)');
      if (inst !== chain) disagree.push({ file: key, chain: chain || '(none)', installed: inst || '(none)' }); return inst; };
    const rows = nl.map((rel) => { const bp = baseOf(B, rel), key = 'nig\\nigraan-local\\' + rel.split('/').join('\\'), ip = INST ? join(INST, 'nig', 'nigraan-local', rel) : null;
      return [key, pick(key, bp ? sha(readFileSync(bp)) : null, ip && existsSync(ip) ? sha(readFileSync(ip)) : null) || '-'.repeat(64)]; });
    for (const a of ad) { const key = '_admin\\' + a.split('/').join('\\'), ip = INST ? join(INST, '_admin', a) : null;
      rows.push([key, pick(key, adminOf(B, a), ip && existsSync(ip) ? sha(readFileSync(ip)) : null) || '-'.repeat(64)]); }
    for (const [r, h] of rows.sort((x, y) => x[0].localeCompare(y[0]))) exp.push(h + '  ' + r);
  }
  writeFsync(join(OUT, 'EXPECTED_prev_SHA256.txt'), exp.join('\r\n') + '\r\n');
  /* the checks */
  const lint = asciiLint(OUT); if (lint.length) throw new Error('non-ASCII byte in ' + lint.map((x) => x.file + ' at ' + x.offset + ' (0x' + x.byte.toString(16) + ')').join(', '));
  for (const line of readFileSync(join(OUT, 'SHA256SUMS.txt'), 'utf8').split(/\r?\n/).filter(Boolean)) { const [h, p] = line.split(/\s+/); if (sha(readFileSync(join(OUT, p))) !== h) throw new Error('re-read differs from SHA256SUMS.txt: ' + p); }
  return { out: OUT, version: FULL, gate: GATE, fillFrom: FILL, shipped: SHIP, installed: INST, disagree, files: nl, admin: ad, bases: bases.map((B) => B.label), missingInTree: R.missing, imagesTheRuntimeReads: R.images };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), o = { bases: [] };
  for (let i = 0; i < a.length; i++) { const k = a[i], v = a[i + 1];
    if (k === '--version') { o.version = v; i++; } else if (k === '--base') { o.bases.push(v); i++; } else if (k === '--out') { o.out = v; i++; } else if (k === '--summary') { o.summary = v; i++; }
    else if (k === '--date') { o.date = v; i++; } else if (k === '--status-entry') { o.statusEntry = v; i++; } else if (k === '--new') { o.newTree = v; i++; } else if (k === '--no-tests') o.tests = false;
    else if (k === '--fill-from') { (o.fillFrom = o.fillFrom || []).push(v); i++; }
    else if (k === '--include') { (o.include = o.include || []).push(v); i++; }
    else if (k === '--admin') { (o.admin = o.admin || []).push(v); i++; }
    else if (k === '--shipped') { (o.shipped = o.shipped || []).push(v); i++; } else if (k === '--installed') { o.installed = v; i++; } else if (k === '--trust-base-tree') o.trustBaseTree = true;
    else { console.error('unknown argument ' + k); process.exit(2); } }
  if (!o.version || !o.out) { console.error('usage: node scripts/deploy/mkdeploy.mjs --version 283 --base <live tree>=<version> --out <folder> [--summary "..."]'); process.exit(2); }
  makeDeploy(o).then((r) => { console.log('package ' + r.out + ': v' + r.version + ' over ' + r.bases.map((b) => 'v' + b).join(' / ') + '; ' + r.files.length + ' nigraan-local file(s), ' + r.admin.length + ' _admin file(s); ASCII lint passed; SHA256SUMS re-read equal');
    console.log('EXPECTED_prev from: ' + (r.installed ? 'the staged copy ' + r.installed + (r.shipped.length ? ' (checked against the chain)' : '') : r.shipped.length ? 'the base tree + ' + r.shipped.length + ' shipped package(s)' : 'the base tree (--trust-base-tree)'));
    for (const d of r.disagree) console.log('  DIFFERS from the chain: ' + d.file + '  chain ' + d.chain.slice(0, 12) + '  installed ' + d.installed.slice(0, 12));
    for (const f of r.files) console.log('  ' + f); process.exit(0); })
    .catch((e) => { console.error('mkdeploy FAILED: ' + (e && e.message)); process.exit(1); });
}
