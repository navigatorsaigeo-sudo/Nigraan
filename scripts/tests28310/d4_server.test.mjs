// v91.17.283.10 · the diagnostic agent in the server and on the operator Health page
//  A1 a child process like the others: scheduled (checked every 10 min), lowest priority, kill timer (30 min), a lock (a second copy exits 5)
//  A2 due once a Pakistan day from 06:50 PKT for yesterday (after the verification), not twice; NIGRAAN_DIAGNOSE=0 stops it
//  A3 no network code in its import graph (and none in the Python replay reader); no provider call possible
//  A4 it writes only under data/agents (never packaged); its files ship
//  A5 GET /api/ops/agents carries the diagnosis (operator scope; a customer view is refused) and ?run=diagnose starts it; no install path
//  A6 the Health page draws the card "What is causing it" inside the operator-only section, and the page's CSP covers the changed script
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ok, done, imp, src, TREE } from './lib.mjs';
const AG = src('server/api/agents.mjs');
ok(/'agentDiagnose', 10 \* 60e3/.test(AG) && /child\('diag', 'diagnose\.mjs'[^;]*, 30, 1536\)/.test(AG) && /DIAG_AT_PKT_MIN = 6 \* 60 \+ 50/.test(AG), 'A1 scheduled every 10 min as a child process (30 min limit, 1.5 GB heap), daily from 06:50 PKT');
const tmp = mkdtempSync(join(tmpdir(), 'dx4-')), data = join(tmp, 'data'); mkdirSync(join(data, 'agents'), { recursive: true });
const holder = spawn(process.execPath, ['-e', 'setTimeout(()=>{},6000)']); writeFileSync(join(data, 'agents', 'diagnose.lock'), JSON.stringify({ pid: holder.pid, at: new Date().toISOString() }));
const run = () => spawnSync(process.execPath, [join(TREE, 'scripts', 'agents', 'diagnose.mjs'), '--app', TREE, '--data', data, '--copies', join(tmp, 'copies'), '--lake', join(tmp, 'lake'), '--day', '2026-10-21'], { encoding: 'utf8' });
const r1 = run(); holder.kill(); await new Promise((r) => setTimeout(r, 300)); const r2 = run();
ok(r1.status === 5 && r2.status === 0 && existsSync(join(data, 'agents', 'diagnose', '2026-10-21.json')) && !existsSync(join(data, 'agents', 'diagnose.lock')), 'A1 a live lock holder makes a second copy exit 5; then it runs, writes the day\'s diagnosis and releases the lock', [r1.status, r2.status, (r2.stdout || r2.stderr).trim().split('\n').pop()].join(' | '));
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
const written = walk(tmp).map((f) => f.slice(tmp.length + 1).replace(/\\/g, '/'));
ok(written.length && written.every((f) => /^data\/agents\//.test(f)), 'A4 it writes only under data/agents', written.join(', '));
const M = await imp('server/api/agents.mjs'); const A = M.createAgents({}, TREE, data, { schedule: false }); const P = (s) => Date.parse(s.replace(' ', 'T') + ':00Z') - 5 * 3600e3;
/* v283.23 J14 (test updated in 283.24): the diagnosis also waits until yesterday is verified (in the ledger, complete), up to 12:00 PKT */
const dw = A.diagDue && A.diagDue(P('2026-10-23 06:51'));
mkdirSync(join(data, 'agents', 'verify'), { recursive: true }); writeFileSync(join(data, 'agents', 'verify', 'ledger.jsonl'), JSON.stringify({ day: '2026-10-22', S: {} }) + '\n');
const d0 = A.diagDue && A.diagDue(P('2026-10-23 06:49')), d1 = A.diagDue && A.diagDue(P('2026-10-23 06:51')), d2 = A.diagDue && A.diagDue(P('2026-10-22 07:30'));
ok(dw && !dw.due && /waits for the verification of 2026-10-22/.test(dw.why) && d0 && !d0.due && d1.due && d1.day === '2026-10-22' && !d2.due && /done for 2026-10-21/.test(d2.why), 'A2 due from 06:50 PKT for yesterday once it is verified; not again once written', JSON.stringify([dw, d0, d1, d2]));
process.env.NIGRAAN_DIAGNOSE = '0'; const off = A.runDiag ? await A.runDiag(true) : null; delete process.env.NIGRAAN_DIAGNOSE;
ok(off && off.started === false, 'A2 NIGRAAN_DIAGNOSE=0 stops it');
/* A3 */
const seen = new Set(), bad = []; const NET = /^(node:)?(http|https|http2|net|tls|dgram|dns)$|^undici$/;
const visit = (f) => { if (seen.has(f) || !existsSync(f)) return; seen.add(f); const t = readFileSync(f, 'utf8');
  if (/\bfetch\s*\(/.test(t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''))) bad.push(f + ': fetch(');
  for (const m of t.matchAll(/(?:import\s[^'"]*?from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)) { const s = m[1]; if (NET.test(s)) bad.push(f + ': ' + s); else if (s.startsWith('.')) visit(join(dirname(f), s)); }
  for (const m of t.matchAll(/join\(API, '([\w.]+\.mjs)'\)/g)) visit(join(TREE, 'server', 'api', m[1])); };
visit(join(TREE, 'scripts', 'agents', 'diagnose.mjs')); const py = src('scripts/agents/diagnose_replay.py');
ok(seen.size >= 5 && bad.length === 0 && py && !/\bimport\s+(urllib|requests|socket|http)|from\s+(urllib|requests|socket|http)/.test(py), 'A3 no network module and no fetch() in the import graph (' + seen.size + ' files), none in the replay reader', bad.join('; '));
/* A4 packaging */
const PR = await imp('scripts/pack-release.mjs').catch(() => ({}));
ok(PR.STATE && PR.STATE.test('data/agents/diagnose/2026-10-21.json') && PR.STATE.test('data/agents/diagnose/sources.json') && M.AGENT_FILES && M.AGENT_FILES.includes('scripts/agents/diagnose.mjs') && M.AGENT_FILES.includes('scripts/agents/diagnose_replay.py'), 'A4 data/agents/diagnose never ships; the agent\'s two files are named for the packer');
/* A5 the ops route */
const c = A.route('/api/ops/agents', new URL('http://x/api/ops/agents'), { operator: false }); const o = A.route('/api/ops/agents', new URL('http://x/api/ops/agents'), { operator: true });
const L = o && o.body && o.body.diagnose && o.body.diagnose.last;
ok(c.status === 403 && o.status === 200 && L && L.day === '2026-10-21' && Array.isArray(L.items) && Array.isArray(L.flags) && typeof L.summary === 'string', 'A5 customer view 403; the operator gets the diagnosis (summary, items, flags)', JSON.stringify(L && { day: L.day, count: L.count }));
ok(o && !JSON.stringify(o.body).includes(TREE), 'A5 no install path in the operator answer');
ok(/run === 'diagnose'\) \{ runDiag\(true\)/.test(AG), 'A5 ?run=diagnose starts it (operator)');
/* A6 the page */
const PG = src('artefact/AI_GEO_NIGRAAN_v91_17_MACH.html'); const sec = PG.slice(PG.indexOf('<section id="agnHealthSkill" class="agn-hs agn-op-only"'), PG.indexOf('</section>', PG.indexOf('<section id="agnHealthSkill"')));
ok(/id="agnHsDiag"/.test(sec) && /What is causing it/.test(sec) && /data-hs-run="diagnose"/.test(sec), 'A6 the card sits inside the operator-only Health section');
const js = (PG.match(/<script id="agn-hs-js">([\s\S]*?)<\/script>/) || [])[1] || ''; const hash = "'sha256-" + createHash('sha256').update(js, 'utf8').digest('base64') + "'";
const csp = (PG.match(/<meta content="([^"]*)" http-equiv="Content-Security-Policy"\/>/) || [])[1] || '';
ok(/function diag\(d\)/.test(js) && /_dx\.innerHTML=diag\(d\)/.test(js) && csp.includes(hash), 'A6 the renderer is in agn-hs-js, and the page CSP carries that script\'s hash (resealed)');
let parsed = true; try { new Function(js); } catch (e) { parsed = e.message; } ok(parsed === true, 'A6 the Health script parses', parsed);
done('D4-SERVER');
