// v91.17.283.10 · agents 6 and 7 in the server, and the weekly proposals report (offline; with a server address also live)
//  R1 due rules: experiments once a PKT week from Sunday 03:00 PKT; the report once a week from Monday 08:00 PKT; not twice
//  R2 the server schedules both as child processes (hourly checks, the experimentation run in the long compute slot (v283.24 J8; was the bulk slot), kill timer = budget + 20 min)
//  R3 a second copy of the experimentation agent while the first holds the lock exits 5
//  R4 no network code: the import graph of the new agent modules has no http / https / net / tls / dgram / undici import and no fetch();
//     the Python scripts import no urllib / requests / socket / http
//  R5 packaging: the new agent files are named in server code (shipped); data/agents never ships
//  R6 the weekly report: built from the agents' files (feed incidents with their lengths, drift flags, diagnoses, experiments with compute
//     and results, proposals ready with the exact approve command, owner items: sensor check and data request); the _admin file is ASCII
//     with CRLF line ends; numbers come from code
//  R7 the operator Health card: served from this origin (/agn-ops-exp.js), added to the page by the server, requests only in operator mode;
//     GET /api/ops/experiments needs operator scope
//  R8 (live, node exp_server_report.test.mjs <base>): customer view 403 on GET; operator 200; POST approve from the customer view 403
import { writeFileSync, readFileSync, mkdirSync, mkdtempSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { TREE, tryImp, src, ok, done, P } from './lib.mjs';
const BASE = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : null;

const X = await tryImp('scripts/agents/experiments.mjs'); const PR = await tryImp('scripts/agents/proposals.mjs');
if (X.__err || PR.__err) { ok(false, 'R0 experiments.mjs and proposals.mjs load', X.__err || PR.__err); done('exp_server_report'); }
/* R1 */
const tmp = mkdtempSync(join(tmpdir(), 'expr-')), data = join(tmp, 'data'); mkdirSync(join(data, 'agents', 'experiments'), { recursive: true });
const e1 = X.expDue(data, P('2026-10-25 02:59')), e2 = X.expDue(data, P('2026-10-25 03:01')), e3 = X.expDue(data, P('2026-10-28 12:00'));
writeFileSync(join(data, 'agents', 'experiments', 'state.json'), JSON.stringify({ week: '2026-10-25', complete: true })); const e4 = X.expDue(data, P('2026-10-26 10:00')), e5 = X.expDue(data, P('2026-11-01 03:30'));
const p1 = PR.proposalsDue(data, P('2026-10-26 07:59')), p2 = PR.proposalsDue(data, P('2026-10-26 08:01')); mkdirSync(join(data, 'agents', 'proposals'), { recursive: true }); writeFileSync(join(data, 'agents', 'proposals', '2026-10-26.json'), '{}'); const p3 = PR.proposalsDue(data, P('2026-10-27 09:00'));
ok(!e1.due && e2.due && e2.week === '2026-10-25' && e3.due && !e4.due && e5.due && e5.week === '2026-11-01' && !p1.due && p2.due && p2.day === '2026-10-26' && !p3.due, 'R1 due: experiments from Sunday 03:00 PKT once a week (a missed Sunday runs later that week); report from Monday 08:00 PKT once', JSON.stringify([e1.due, e2.due, e3.due, e4.due, e5.week, p1.due, p2.day, p3.due]));
/* R2 */
const SCH = await tryImp('server/api/scheduler.mjs'); const AG = await tryImp('server/api/agents.mjs'); const app = { scheduler: SCH.createScheduler ? SCH.createScheduler() : null };
let jobs = []; try { const A = AG.createAgents(app, TREE, data, {}); jobs = app.scheduler.list().jobs; if (app.scheduler.stop) app.scheduler.stop(); } catch (e) { jobs = []; }
const je = jobs.find((j) => j.id === 'agentExperiments'), jp = jobs.find((j) => j.id === 'agentProposals'); const AXS = src('server/api/agents_exp.mjs');
ok(!!je && !!jp && /"heavy":"long"/.test(JSON.stringify(je)) && /child\('exp', 'experiments\.mjs'/.test(AXS) && /budget\(\) \+ 20/.test(AXS) && /PRIORITY_LOW/.test(src('server/api/agents.mjs')) && /PRIORITY_LOW/.test(src('scripts/agents/experiments.mjs')), 'R2 the server schedules agentExperiments (long compute slot) and agentProposals as low-priority child processes with kill timers', jobs.map((j) => j.id).filter((x) => /^agent/.test(x)).join(', '));
/* R3 */
const holder = spawn(process.execPath, ['-e', 'setTimeout(()=>{},5000)']); writeFileSync(join(data, 'agents', 'experiments.lock'), JSON.stringify({ pid: holder.pid, at: new Date().toISOString() }));
const r3 = spawnSync(process.execPath, [join(TREE, 'scripts', 'agents', 'experiments.mjs'), '--app', TREE, '--data', data, '--lake', join(tmp, 'none'), '--only', 'none'], { encoding: 'utf8' }); holder.kill();
ok(r3.status === 5 && /another experimentation run/.test(r3.stdout), 'R3 a live lock holder makes a second copy exit 5', r3.status + ' ' + r3.stdout.trim());
/* R4 */
const seen = new Set(), bad = []; const NET = /^(node:)?(http|https|http2|net|tls|dgram|dns)$|^undici$/;
const visit = (f) => { if (seen.has(f) || !existsSync(f)) return; seen.add(f); const t = readFileSync(f, 'utf8');
  if (/\bfetch\s*\(/.test(t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''))) bad.push(f + ': fetch(');
  for (const m of t.matchAll(/(?:import\s[^'"]*?from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)) { const s = m[1]; if (NET.test(s)) bad.push(f + ': ' + s); else if (s.startsWith('.')) visit(join(dirname(f), s)); } };
for (const f of ['experiments.mjs', 'proposals.mjs', 'exp_registry.mjs', 'exp_pointer.mjs']) visit(join(TREE, 'scripts', 'agents', f));
const pyBad = ['exp_run.py', 'exp/exp_a3_rerun.py', 'exp/blend_r.py', 'exp/cand_temp.py', 'exp/cand_height.py'].filter((f) => /^\s*(import|from)\s+(urllib|requests|socket|http|aiohttp|httpx)\b/m.test(src('scripts/agents/' + f)));
ok(seen.size >= 5 && bad.length === 0 && pyBad.length === 0, 'R4 no network module and no fetch() in agents 6 and 7 (' + seen.size + ' modules); no network import in their Python scripts', bad.concat(pyBad).join('; '));
/* R5 */
const AF = AG.AGENT_FILES || []; const need = ['scripts/agents/experiments.mjs', 'scripts/agents/exp_registry.mjs', 'scripts/agents/exp_pointer.mjs', 'scripts/agents/exp_run.py', 'scripts/agents/proposals.mjs', 'scripts/agents/exp/rules_source.json', 'scripts/agents/exp/blend_r.py', 'scripts/agents/exp/cand_temp.py', 'scripts/agents/exp/cand_height.py', 'scripts/agents/exp/exp_a3_rerun.py', 'scripts/gen/exp_approve.mjs', 'server/api/agents_exp.mjs', 'server/api/agents_exp_ui.js', 'data/evidence/flood/a3_trigger_test_2025.json'];
const PK = await tryImp('scripts/pack-release.mjs');
ok(need.every((f) => AF.includes(f) && existsSync(join(TREE, f))) && PK.STATE && PK.STATE.test('data/agents/experiments/runs/2026-10-25/blendr_1/promotion.json') && PK.STATE.test('data/agents/proposals/2026-10-26.json'), 'R5 the new files are named in server code and exist; data/agents (runs, records, reports) never ships', need.filter((f) => !AF.includes(f)).join(', '));
/* R6 the report */
const d2 = join(tmp, 'd2'), A = join(d2, 'agents'); for (const s of ['feed', 'verify', 'diagnose', 'experiments/weeks', 'experiments/runs/2026-10-25/excl-ab_1', 'flood/shadow']) mkdirSync(join(A, s), { recursive: true });
const iso = (s) => new Date(P(s)).toISOString();
writeFileSync(join(A, 'feed', 'alerts.jsonl'), [{ at: iso('2026-10-21 09:52'), feed: 'mach', label: 'MACH weather stations', from: 'ok', to: 'late', since: iso('2026-10-21 09:40') }, { at: iso('2026-10-21 11:56'), feed: 'mach', label: 'MACH weather stations', from: 'late', to: 'down', since: iso('2026-10-21 09:40') },
  { at: iso('2026-10-22 14:53'), feed: 'mach', label: 'MACH weather stations', from: 'down', to: 'ok', since: iso('2026-10-22 14:53') }, { at: iso('2026-10-24 23:00'), feed: 'imerg', label: 'Satellite rain', from: 'ok', to: 'late', since: iso('2026-10-24 20:00') }].map((x) => JSON.stringify(x)).join('\n') + '\n');
writeFileSync(join(A, 'feed', 'state.json'), JSON.stringify({ at: iso('2026-10-26 07:50'), feeds: { imerg: { status: 'down', since: iso('2026-10-24 20:00'), why: 'no new day file' } } }));
writeFileSync(join(A, 'verify', 'summary.json'), JSON.stringify({ ready: true, drift: [{ worse: true, text: 'Coast temperature (hourly) error up to 1.5 °C on average at rural stations for 6 days' }], driftFamily: { tests: 82, flagged: 1, rule: 'Benjamini-Hochberg at 5 %' }, driftAssessed: true }));
writeFileSync(join(A, 'verify', 'ledger.jsonl'), ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-24'].map((d) => JSON.stringify({ day: d })).join('\n') + '\n');
writeFileSync(join(A, 'diagnose', '2026-10-23.json'), JSON.stringify({ schema: 'agn.diagnose.v1', day: '2026-10-23', items: [{ id: 'D1', flag: 'plains night minimum +0.7 °C warm', responsible: { kind: 'step', step: 'live-mach' }, size: { value: 0.7, unit: 'C', ci95: [0.4, 1.0] }, suggestedTest: { kind: 'station_exclusion', stations: ['mach:Mach9'], text: 'refit without Mach9' } }, { id: 'D2', flag: 'Mach17 humidity stuck', responsible: { kind: 'station', station: 'mach:Mach17' }, suggestedTest: { kind: 'sensor_check', text: 'check the humidity sensor' } }, { id: 'D3', flag: 'no truth above 4,669 m', suggestedTest: { kind: 'data_request', text: 'a station on a glacier or pass' } }] }));
const prom = { schema: 'agn.promotion.v1', id: 'excl-ab@1', title: 'Exclude mach:Mach9', week: '2026-10-25', at: iso('2026-10-25 04:00'), promote: true, variant: 'exclude', evidence: { headline: [{ label: 'overall held-out MAE gain', value: 0.031, ci: [0.012, 0.05] }] },
  pointer: { target: 'nonrep-stations', file: 'data/nonrepresentative-stations-active.json', what: 'the list', fromVersion: 'nonrep-20261022', wouldBecome: { version: 'nonrep-20261025-ab' } },
  approve: { command: ['cd /d "D:\\NIGRAAN\\nig\\nigraan-local"', 'node scripts\\gen\\exp_approve.mjs approve "data\\agents\\experiments\\runs\\2026-10-25\\excl-ab_1\\promotion.json" --confirm excl-ab@1'], button: 'Operator page: Approve', revert: ['cd /d "D:\\NIGRAAN\\nig\\nigraan-local"', 'node scripts\\gen\\exp_approve.mjs revert nonrep-stations --confirm nonrep-stations'] } };
writeFileSync(join(A, 'experiments', 'runs', '2026-10-25', 'excl-ab_1', 'promotion.json'), JSON.stringify(prom));
writeFileSync(join(A, 'experiments', 'weeks', '2026-10-25.json'), JSON.stringify({ week: '2026-10-25', at: iso('2026-10-25 04:10'), budgetMin: 180, usedMin: 52.4, results: [{ id: 'excl-ab@1', title: 'Exclude mach:Mach9', status: 'done', mode: 'run', promote: true, rulePassed: true, headline: prom.evidence.headline, strata: [{ name: 'plains', lo: -0.01, ok: true }], cost: { lastWallMin: 41.2, lastPeakMb: 2234 } }, { id: 'blendr@1', title: 'BLEND-R', status: 'done', mode: 'recorded', recordedFrom: 'work/blend_r.json', promote: false, rulePassed: false, reasons: ['the pre-registered rule is not met: V1: overall p1.25 -0.003 is not above 0'], headline: [] }], queue: [{ id: 'flood-fx-c3@1', why: 'inputs', owner: 'data request: put the UNOSAT products on this computer' }] }));
writeFileSync(join(A, 'experiments', 'queue.json'), JSON.stringify({ week: '2026-10-25', items: [{ id: 'flood-fx-c3@1', why: 'inputs', owner: 'data request: put the UNOSAT products on this computer' }] }));
const adm = join(tmp, '_admin'); mkdirSync(adm);
const W = PR.writeReport({ dataDir: d2, day: '2026-10-26', adminDir: adm }); const md = readFileSync(join(adm, 'proposals_2026-10-26.md'), 'utf8'); const R = W.report;
const mach = R.found.incidents.find((x) => x.feed === 'mach'); const im = R.found.incidents.find((x) => x.feed === 'imerg');
ok(R.window.from === '2026-10-19' && R.window.to === '2026-10-25' && mach && mach.worst === 'down' && Math.round(mach.minutes) === 1753 && im && im.endPkt === null && R.found.verifiedDays === 4 && R.found.drift.flags.length === 1 && R.found.diagnoses.length === 3,
  'R6a found: MACH incident 21 Oct 09:40 to 22 Oct 14:53 PKT (down, 29.2 h), satellite rain still open, 4 verified days, 1 drift flag, 3 diagnosis items', JSON.stringify(mach));
ok(R.experiments.usedMin === 52.4 && R.ready.length === 1 && R.ready[0].id === 'excl-ab@1' && /exp_approve\.mjs approve .* --confirm excl-ab@1/.test(md) && /cd \/d "D:\\NIGRAAN\\nig\\nigraan-local"/.test(md) && /Why not promoted: the pre-registered rule is not met: V1/.test(md),
  'R6b experiments with compute and results; the ready proposal with its exact approve command (cd /d line included) and undo');
const kinds = R.owner.map((o) => o.kind); ok(kinds.includes('sensor check') && kinds.includes('data request') && kinds.includes('feed down') && R.owner.length === 4, 'R6c owner items: the sensor check, the data requests (diagnosis, experiment queue), the feed still down', kinds.join(', '));
ok(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(md) && md.includes('\r\n') && !/[^\r]\n/.test(md) && /## 1\. What the agents found[\s\S]*## 2\. Experiments run[\s\S]*## 3\. Proposals ready for approval[\s\S]*## 4\. Items needing the owner[\s\S]*## 5\. Approvals and reverts/.test(md) && /1\.5 C/.test(md) && existsSync(join(d2, 'agents', 'proposals', '2026-10-26.json')),
  'R6d _admin\\proposals_<date>.md: ASCII only, CRLF, the five sections in order (degree sign written as " C"); the JSON copy for the page');
/* R7 */
const SV = src('server/server.mjs'), UI = src('server/api/agents_exp_ui.js'), IDX = src('server/api/index.mjs');
ok(/p === '\/agn-ops-exp\.js'/.test(SV) && (SV.match(/<script src="\/agn-ops-exp\.js" defer><\/script>/g) || []).length === 2 && /function load\(\) \{ if \(!op\(\)/.test(UI) && /'x-agn-view': 'operator'/.test(UI) && /if \(!localOrSigned\(req\)\) return send\(res, 403, \{ error: 'operator_scope_required' \}\)/.test(IDX.slice(IDX.indexOf("'/api/ops/experiments'"))),
  'R7 the Health card script is served from this origin and added by the server (page file unchanged); it requests only in operator mode; GET needs operator scope');
/* R8 live */
if (BASE) { const g = async (p, h = {}, m = 'GET', b) => { try { const r = await fetch(BASE + p, { method: m, headers: h, body: b }); return { s: r.status, t: await r.text() }; } catch (e) { return { s: 0, t: String(e) }; } };
  const c = await g('/api/ops/experiments', { 'x-agn-view': 'customer' }); const o = await g('/api/ops/experiments'); const pc = await g('/api/ops/experiments/approve', { 'x-agn-view': 'customer', 'content-type': 'application/json' }, 'POST', JSON.stringify({ record: 'x', confirm: 'x' }));
  const xo = await g('/api/ops/experiments/approve', { origin: 'http://evil.example', 'content-type': 'application/json' }, 'POST', JSON.stringify({ record: 'x', confirm: 'x' })); const fw = await g('/api/ops/experiments/revert', { 'x-forwarded-for': '203.0.113.9', 'content-type': 'application/json' }, 'POST', JSON.stringify({ target: 'blend-weights', confirm: 'blend-weights' })); const js = await g('/agn-ops-exp.js'); const pg = await g('/api/ops/experiments/page');
  ok(c.s === 403 && o.s === 200 && /"budgetMin"/.test(o.t) && pc.s === 403 && xo.s === 403 && fw.s === 403 && js.s === 200 && /agnHsExp/.test(js.t) && pg.s === 200 && /Weekly proposals/.test(pg.t), 'R8 live: customer view GET 403; operator 200; POST approve / revert refused (403) from the customer view, another origin and a relayed (x-forwarded-for) request; card script and page served', JSON.stringify([c.s, o.s, pc.s, xo.s, fw.s, js.s, pg.s]) + (c.s === 0 ? ' ' + String(c.t).slice(0, 200) : '')); }
else console.log('     (R8 skipped: no server address given)');
done('exp_server_report');
