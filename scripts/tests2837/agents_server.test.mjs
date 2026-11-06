// v91.17.283.7 · the agents in the server (server/api/agents.mjs):
//  A1 the agents run as child processes of node (the ECMWF fetcher's pattern): lowest priority, a time limit, a lock (a second copy exits 5)
//  A2 the verification is due once a Pakistan day from 06:30 PKT (yesterday not in the ledger), or at once when there is no ledger (back-fill)
//  A3 no network code: the agents' import graph (scripts/agents/*, and the server modules they load) has no http / https / net / tls /
//     dgram / undici import and no fetch() call, so an agent cannot spend a provider call
//  A4 data/agents never ships in a package (scripts/pack-release.mjs STATE), and the agents' files do (named in server code)
//  A5 the skill sheet carries the live verification as an INTERNAL entry (never on the customer sheet)
//  A6 (with a server: node agents_server.test.mjs <base>) GET /api/ops/agents: a customer view is refused (403); the operator gets the
//     feed state and the verification summary; after a forced feed check the feed state exists
// usage: node scripts/tests2837/agents_server.test.mjs [http://127.0.0.1:port]
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), BASE = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : null;
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + String(d).slice(0, 400) : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + String(d).slice(0, 800) : '')); } };
if (!existsSync(join(APP, 'server', 'api', 'agents.mjs'))) { ok(false, 'A0 server/api/agents.mjs exists'); console.log(`\nagents_server ${pass} passed, ${fail} failed`); process.exit(1); }
const SRC = readFileSync(join(APP, 'server', 'api', 'agents.mjs'), 'utf8');
/* v283.51g3 · the agents run through jobrun.mjs runJob (its own limit and a process-tree kill on overrun) */
const JR = existsSync(join(APP, 'server', 'api', 'jobrun.mjs')) ? readFileSync(join(APP, 'server', 'api', 'jobrun.mjs'), 'utf8') : '';
ok(/runJob\(jobKeyOf\(script, args\), process\.execPath/.test(SRC) && /PRIORITY_LOW/.test(SRC) && /const timer = setTimeout\(async \(\) => \{/.test(JR) && /killTree\(ch\)/.test(JR) && /'agentFeed', 10 \* 60e3/.test(SRC), 'A1a child processes of node: lowest priority, kill timer, scheduled every 10 min');
/* A1b the lock: a second copy while the first holds it exits 5 */
const tmp = mkdtempSync(join(tmpdir(), 'ag-')), data = join(tmp, 'data'); mkdirSync(join(data, 'agents'), { recursive: true });
const holder = spawn(process.execPath, ['-e', 'setTimeout(()=>{},4000)']); writeFileSync(join(data, 'agents', 'feed-health.lock'), JSON.stringify({ pid: holder.pid, at: new Date().toISOString() }));
const r2 = spawnSync(process.execPath, [join(APP, 'scripts', 'agents', 'feed_health.mjs'), '--app', APP, '--data', data, '--copies', join(tmp, 'copies'), '--admin', '-'], { encoding: 'utf8' }); holder.kill(); await new Promise((r) => holder.exitCode !== null || holder.signalCode ? r() : holder.on('exit', r));
const r3 = spawnSync(process.execPath, [join(APP, 'scripts', 'agents', 'feed_health.mjs'), '--app', APP, '--data', data, '--copies', join(tmp, 'copies'), '--admin', '-'], { encoding: 'utf8' });
ok(r2.status === 5 && r3.status === 0 && existsSync(join(data, 'agents', 'feed', 'state.json')) && !existsSync(join(data, 'agents', 'feed-health.lock')), 'A1b a live lock holder makes a second copy exit 5; a stale lock is taken over and released', r2.status + '/' + r3.status + ' ' + (r3.stdout + r3.stderr).trim().slice(0, 200));
/* A2 due rule */
const { createAgents } = await import(pathToFileURL(join(APP, 'server', 'api', 'agents.mjs')).href);
const A = createAgents({}, APP, data, { schedule: false }); const P = (s) => Date.parse(s.replace(' ', 'T') + ':00Z') - 5 * 3600e3;
const d0 = A.verifyDue(P('2026-10-22 05:00'));
mkdirSync(join(data, 'agents', 'verify'), { recursive: true }); /* v283.23 J1 (test updated in 283.24): every missing day of the last 30 is due, so the ledger holds the 30 days before yesterday */
const led = (last) => { let t = ''; for (let i = 0; i < 31; i++) { const d = new Date(Date.parse(last + 'T00:00:00Z') - i * 864e5).toISOString().slice(0, 10); t += JSON.stringify({ day: d }) + '\n'; } return t; };
writeFileSync(join(data, 'agents', 'verify', 'ledger.jsonl'), led('2026-10-20'));
const d1 = A.verifyDue(P('2026-10-22 06:29')), d2 = A.verifyDue(P('2026-10-22 06:31')); writeFileSync(join(data, 'agents', 'verify', 'ledger.jsonl'), led('2026-10-21')); const d3 = A.verifyDue(P('2026-10-22 18:00'));
ok(d0.due && d0.mode === 'backfill' && !d1.due && d2.due && d2.mode === 'day' && d2.day === '2026-10-21' && !d3.due, 'A2 verification due: back-fill with no ledger; daily from 06:30 PKT for yesterday; not twice', JSON.stringify([d0.mode, d1.due, d2.day, d3.due]));
/* A3 no network code in the agents' import graph */
const seen = new Set(), bad = []; const NET = /^(node:)?(http|https|http2|net|tls|dgram|dns)$|^undici$/;
const visit = (f) => { if (seen.has(f)) return; seen.add(f); const t = readFileSync(f, 'utf8');
  if (/\bfetch\s*\(/.test(t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''))) bad.push(f + ': fetch(');
  for (const m of t.matchAll(/(?:import\s[^'"]*?from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)) { const s = m[1]; if (NET.test(s)) bad.push(f + ': ' + s); else if (s.startsWith('.')) visit(join(dirname(f), s)); }
  for (const m of t.matchAll(/join\(API, '([\w.]+\.mjs)'\)/g)) visit(join(APP, 'server', 'api', m[1])); };
for (const f of ['feed_health.mjs', 'verify.mjs', 'lib.mjs', 'lamha_copy.mjs']) visit(join(APP, 'scripts', 'agents', f));
ok(bad.length === 0 && seen.size >= 6, 'A3 no network module and no fetch() in the agents\' import graph (' + seen.size + ' files: ' + [...seen].map((f) => f.split(/[\\/]/).pop()).join(', ') + ')', bad.join('; '));
/* A4 packaging */
const PR = await import(pathToFileURL(join(APP, 'scripts', 'pack-release.mjs')).href);
if (!PR.STATE || !PR.releaseFiles) console.log('     (A4 not checked here: this tree\'s scripts/pack-release.mjs is the older ZIP packer; packages are made from the cloud tree)');
else { const R = PR.releaseFiles(APP); const rel = new Set(R.files.map((f) => f.rel));
ok(PR.STATE.test('data/agents/verify/ledger.jsonl') && PR.STATE.test('data/agents/feed/state.json') && ['scripts/agents/feed_health.mjs', 'scripts/agents/verify.mjs', 'scripts/agents/lib.mjs', 'scripts/agents/lamha_copy.mjs', 'scripts/agents/lamha_qc.py', 'scripts/agents/radar_points.py', 'server/api/agents.mjs', 'data/nonrepresentative-stations.json'].every((f) => rel.has(f)) && ![...rel].some((f) => f.startsWith('data/agents/')),
  'A4 data/agents never ships; the agent scripts, the server module and the exclusion list do'); }
/* A5 internal skill entry */
const { createSkill } = await import(pathToFileURL(join(APP, 'server', 'api', 'skill.mjs')).href); const SK = createSkill(join(APP, 'data'), {});
ok(SK.parameter('live_verification') && !SK.customerSheet().parameters.some((p) => p.id === 'live_verification'), 'A5 /api/skill: live_verification on the internal sheet only', JSON.stringify(SK.parameter('live_verification')).slice(0, 160));
/* A6 live */
if (BASE) {
  const get = async (p, h = {}) => { try { const r = await fetch(BASE + p, { headers: h }); return { s: r.status, j: await r.json().catch(() => null) }; } catch (e) { return { s: 0, j: null, e: String(e) }; } };
  const c = await get('/api/ops/agents', { 'x-agn-view': 'customer' }); const o = await get('/api/ops/agents?run=feed');
  let st = null; for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 1500)); const x = await get('/api/ops/agents'); if (x.j && x.j.feed && x.j.feed.feeds) { st = x.j; break; } }
  ok(c.s === 403 && o.s === 200 && o.j && o.j.started === 'feed' && st && Object.keys(st.feed.feeds).filter((k) => !/^(srv_|inputs_)/.test(k)).length === 19 /* v283.47: the layer-input entries (inputs_*) are not file feeds */ && !('lamha_copy' in st.feed.feeds) && 'isd_lite' in st.feed.feeds && 'official_aws' in st.feed.feeds && Array.isArray(st.log.lines), 'A6 /api/ops/agents: customer view 403; operator: a forced feed check writes the state of the 19 file feeds (v283.28: the LAMHA copy job gone, ISD-Lite and the hand-supplied official AWS added; v283.27 item 8: plus the server-polled feeds srv_*)', JSON.stringify({ c: c.s, o: o.s, feeds: st && Object.keys(st.feed.feeds) }));
} else console.log('     (A6 skipped: no server address given)');
console.log(`\nagents_server ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
