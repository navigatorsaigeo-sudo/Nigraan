/* v91.17.283.37 (NIGRAAN 1.0.1) · THE DEPLOY SCRIPT'S OWN LIVE CHECKS, RUN BEFORE PACKAGING
   Lesson of v283.36: DEPLOY_V283_36.ps1 checked the console for 'Decision Integrity', a string the build had renamed, so the deploy's live
   check failed on the laptop although the build was right. This test reads a DEPLOY_V<ver>.ps1 (argument, or the template filled for this
   tree), extracts EVERY page-string check ($x.body.Contains('...')) and every endpoint it asks (Get-Url '<path>'), and runs them against the
   built tree's server:
     - every Contains marker of a check that can fail the deploy ($fail) must be found in the body of the URL that variable was read from
     - every endpoint must answer (no 404, no connection failure); the place bundle and the hazard surface must answer ok
   usage: node scripts/tests28337/deploymarkers37.test.mjs [base] [DEPLOY_V283_37.ps1] */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { T, BASE, ROOT } from '../tests28328p/lib.mjs';
const { ok, done } = T();
const ver = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;   /* 91.17.283.37 */
const VD = ver.replace(/^91\.17\./, '');
const arg = process.argv.slice(2).find((a) => /\.ps1$/i.test(a));
let src = arg && existsSync(arg) ? readFileSync(arg, 'utf8') : readFileSync(join(ROOT, 'scripts', 'deploy', 'templates', 'DEPLOY.ps1.tpl'), 'utf8');
src = src.replace(/@FULL@/g, ver).replace(/@VD@/g, VD).replace(/@VER@/g, VD);
ok(true, 'deploy script read: ' + (arg || 'scripts/deploy/templates/DEPLOY.ps1.tpl (filled for ' + ver + ')'));
const lines = src.split(/\r?\n/);
/* variable -> the path it was read from (the latest static Get-Url assignment above the check) */
const assign = []; lines.forEach((l, i) => { const re = /\$(\w+)\s*=\s*Get-Url\s+'([^']+)'/g; let m; while ((m = re.exec(l))) assign.push({ v: m[1], p: m[2], i }); });
const pathOf = (v, i) => { let p = null; for (const a of assign) if (a.v === v && a.i <= i) p = a.p; return p; };
const checks = []; lines.forEach((l, i) => { const re = /\$(\w+)\.body\.Contains\('((?:[^']|'')*)'\)/g; let m; while ((m = re.exec(l))) checks.push({ v: m[1], s: m[2].replace(/''/g, "'"), i, fail: /\$fail\s*\+=/.test(l), path: pathOf(m[1], i) }); });
ok(checks.length >= 10, 'page-string checks found in the deploy script: ' + checks.length, checks.length);
const cache = new Map(); const body = async (p) => { if (!cache.has(p)) { let r = null; try { const x = await fetch(BASE + p); r = { status: x.status, text: await x.text() }; } catch (e) { r = { status: 0, text: '', e: String(e) }; } cache.set(p, r); } return cache.get(p); };
let miss = 0; const M = [];
for (const c of checks) { if (!c.path) { M.push('line ' + (c.i + 1) + ': $' + c.v + ' has no static Get-Url'); miss++; continue; }
  const b = await body(c.path); const found = b.text.indexOf(c.s) >= 0;
  if (c.fail) { ok(found, 'deploy check line ' + (c.i + 1) + ': ' + c.path + ' contains ' + JSON.stringify(c.s).slice(0, 90), b.status + ' ' + b.text.length + ' chars'); if (!found) miss++; }
  else ok(true, 'deploy note line ' + (c.i + 1) + ' (informational, cannot fail the deploy): ' + c.path + ' ' + JSON.stringify(c.s).slice(0, 60) + ' -> ' + found); }
ok(miss === 0, 'every page-string check of the deploy script holds on this build (' + checks.filter((c) => c.fail).length + ' checks)', M.join(' | '));
ok(!checks.some((c) => c.s === 'Decision Integrity'), 'the v283.36 marker "Decision Integrity" (renamed by that build) is no longer checked');
/* every endpoint the script asks */
const paths = [...new Set(assign.map((a) => a.p))];
let dead = 0; const X = [];
for (const p of paths) { const b = await body(p); const good = b.status !== 0 && b.status !== 404; if (!good) { dead++; X.push(p + ' -> ' + b.status); } ok(good, 'deploy endpoint answers: ' + p + ' (' + b.status + ')', b.e || b.text.slice(0, 160)); }
ok(dead === 0, 'every endpoint of the deploy script answers on this build (' + paths.length + ')', X.join(' | '));
for (const need of ['/api/hazardgrid?day=0', '/api/point?lat=31.5204&lon=74.3587']) ok(paths.includes(need), 'the deploy script checks ' + need, paths.filter((p) => /hazardgrid|api\/point/.test(p)).join(' '));
const hg = await body('/api/hazardgrid?day=0'); let j = null; try { j = JSON.parse(hg.text); } catch (_) {}
ok(hg.status === 200 && j && j.ok === true, 'GET /api/hazardgrid?day=0 answers ok (ready or being computed, with its reason)', hg.text.slice(0, 200));
done();
