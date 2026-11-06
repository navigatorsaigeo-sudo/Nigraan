// v91.17.283.10 · the owner's approve / revert of an experiment's promotion record (offline)
//  P1 approve flips ONLY the pointer: blend-weights-active.json is rewritten (the previous pointer kept inside it), the candidate weights
//     file is added under its own name; the served weights file, every other data file and the server code are unchanged; it is logged
//  P2 the server's own pointer loader (server/api/blend.mjs) then serves the candidate; revert restores the previous pointer and the
//     loader serves the original weights again (same version, file, sha256)
//  P3 refusals, each logged and changing nothing: no typed confirmation, a wrong confirmation, promote = false, a candidate whose sha256
//     differs from the record, a target changed since the evaluation (stale record), the same record approved twice
//  P4 the non-representative list pointer: approve -> the verification agent's active list is the new one; revert -> the shipped list
//  P5 the flood extent switch: approve sets "served": true and keeps the file before; revert restores it byte for byte
//  P6 the server route: a request that is not a direct loopback operator request (remote address, relayed, customer view, other origin)
//     is refused with 403 and logged; index.mjs gates approve and revert on loopbackDirect && localOrSigned && !customer && same origin
//  P7 the command line (scripts/gen/exp_approve.mjs): refused without --confirm (exit 2), done with it (exit 0)
import { writeFileSync, readFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { TREE, tryImp, src, ok, done, sha, dataCopy, snap, diff } from './lib.mjs';

const Ptr = await tryImp('scripts/agents/exp_pointer.mjs'); const BL = await tryImp('server/api/blend.mjs');
if (Ptr.__err) { ok(false, 'P0 scripts/agents/exp_pointer.mjs loads', Ptr.__err); done('exp_approve'); }
const W = dataCopy(); const D = W.data; const runDir = join(D, 'agents', 'experiments', 'runs', '2026-10-25', 'blendr_1'); mkdirSync(runDir, { recursive: true });
/* a candidate weights file in the served format (a copy of the served weights with one weight moved), and a passing record */
const served = JSON.parse(readFileSync(join(D, 'blend-weights-v3.json'), 'utf8')); const cand = JSON.parse(JSON.stringify(served)); cand.source = 'test candidate'; const k0 = Object.keys(cand.window2_weights)[0]; cand.window2_weights[k0].n = (cand.window2_weights[k0].n || 0) + 1;
const cb = Buffer.from(JSON.stringify(cand, null, 1)); writeFileSync(join(runDir, 'blend-weights-blendr-V1-20261025.json'), cb);
const T0 = Ptr.targetState(D, 'blend-weights');
const rec = (o = {}) => ({ schema: 'agn.promotion.v1', id: 'blendr@1', week: '2026-10-25', at: new Date().toISOString(), promote: true, rulePassed: true, variant: 'V1', reasons: [], evidence: { mode: 'run', headline: [] },
  pointer: { target: 'blend-weights', file: 'data/blend-weights-active.json', fromVersion: T0.version, fromSha256: T0.sha256 }, artefact: { file: 'blend-weights-blendr-V1-20261025.json', sha256: sha(cb) }, version: 'blendr-V1-20261025', sourceRun: 'test', rule: 'test', ...o });
const RF = join(runDir, 'promotion.json'); writeFileSync(RF, JSON.stringify(rec()));
const V = { 'blend-weights': (j) => BL.parseWeights(j) }; const logF = join(D, 'agents', 'experiments', 'approvals.jsonl'); const nlog = () => existsSync(logF) ? readFileSync(logF, 'utf8').split('\n').filter(Boolean).length : 0;
/* P3 refusals first (nothing may change) */
const s0 = snap(D); const L0 = nlog();
const a1 = Ptr.approve(RF, { dataDir: D, by: 'test', via: 'test', validate: V });
const a2 = Ptr.approve(RF, { dataDir: D, by: 'test', via: 'test', confirm: 'blendr@2', validate: V });
writeFileSync(RF, JSON.stringify(rec({ promote: false, reasons: ['rule not met'] }))); const a3 = Ptr.approve(RF, { dataDir: D, by: 'test', via: 'test', confirm: 'blendr@1', validate: V });
writeFileSync(RF, JSON.stringify(rec({ artefact: { file: 'blend-weights-blendr-V1-20261025.json', sha256: 'f'.repeat(64) } }))); const a4 = Ptr.approve(RF, { dataDir: D, by: 'test', via: 'test', confirm: 'blendr@1', validate: V });
writeFileSync(RF, JSON.stringify(rec({ pointer: { target: 'blend-weights', file: 'data/blend-weights-active.json', fromSha256: 'a'.repeat(64) } }))); const a5 = Ptr.approve(RF, { dataDir: D, by: 'test', via: 'test', confirm: 'blendr@1', validate: V });
const s1 = snap(D); const ch0 = diff(s0, s1).filter((x) => !/approvals\.jsonl|promotion\.json/.test(x));
ok(!a1.ok && /confirmation missing/.test(a1.why) && !a2.ok && !a3.ok && /promote = false/.test(a3.why) && !a4.ok && /checksum/.test(a4.why) && !a5.ok && /changed since the evaluation/.test(a5.why) && ch0.length === 0 && nlog() - L0 === 5,
  'P3 refused: no confirmation, wrong confirmation, promote false, checksum mismatch, stale target; nothing changed; 5 refusals logged', [a1.why, a2.why, a3.why, a4.why, a5.why].join(' | '));
/* P1 */
writeFileSync(RF, JSON.stringify(rec())); const sA = snap(D); const pre = readFileSync(join(D, 'blend-weights-active.json'), 'utf8');
const ap = Ptr.approve(RF, { dataDir: D, by: 'test owner', via: 'test', confirm: 'blendr@1', validate: V }); const sB = snap(D);
const ch = diff(sA, sB); const ptr = JSON.parse(readFileSync(join(D, 'blend-weights-active.json'), 'utf8'));
ok(ap.ok && JSON.stringify(ch) === JSON.stringify(['added blend-weights-blendr-V1-20261025.json', 'changed agents/experiments/approvals.jsonl', 'changed blend-weights-active.json']) && ptr.file === 'blend-weights-blendr-V1-20261025.json' && ptr.previous.version === JSON.parse(pre).version && ptr.previous.sha256 === JSON.parse(pre).sha256 && sA['blend-weights-v3.json'] === sB['blend-weights-v3.json'],
  'P1 approve flips only the pointer (previous kept inside it), adds the candidate file, logs; the served weights file is unchanged', ch.join('; '));
const last = JSON.parse(readFileSync(logF, 'utf8').trim().split('\n').pop()); ok(last.action === 'approve' && last.result === 'done' && last.by === 'test owner' && last.from.version === 'blend-v3-267' && last.to.version === 'blendr-V1-20261025', 'P1b the approval is logged with who, from and to');
const a6 = Ptr.approve(RF, { dataDir: D, by: 'test', via: 'test', confirm: 'blendr@1', validate: V }); ok(!a6.ok && /already approved|changed since/.test(a6.why), 'P3b the same record cannot be approved twice', a6.why);
/* P2 the server's loader */
let served1 = null, served2 = null;
const loadPtr = () => { const P = JSON.parse(readFileSync(join(D, 'blend-weights-active.json'), 'utf8')); return { file: P.file, ok: sha(readFileSync(join(D, P.file))) === P.sha256 }; };
served1 = loadPtr(); const rv0 = Ptr.revert('blend-weights', { dataDir: D, by: 'test', via: 'test' }); const rv = Ptr.revert('blend-weights', { dataDir: D, by: 'test', via: 'test', confirm: 'blend-weights' }); served2 = loadPtr(); const back = JSON.parse(readFileSync(join(D, 'blend-weights-active.json'), 'utf8'));
ok(served1.file === 'blend-weights-blendr-V1-20261025.json' && served1.ok && !rv0.ok && rv.ok && served2.file === 'blend-weights-v3.json' && served2.ok && back.version === JSON.parse(pre).version && back.sha256 === JSON.parse(pre).sha256 && back.previous.file === 'blend-weights-blendr-V1-20261025.json',
  'P2 the pointer names the candidate (checksum good); revert (typed confirmation needed) restores blend-v3-267 with its sha256; the approved one becomes "previous"');
/* P4 v91.17.283.14: no station-list pointer exists any more (values are judged by obsqc.mjs); a record naming it is refused */
const nd = join(D, 'agents', 'experiments', 'runs', '2026-10-25', 'excl-x_1'); mkdirSync(nd, { recursive: true });
writeFileSync(join(nd, 'promotion.json'), JSON.stringify({ id: 'excl-x@1', week: '2026-10-25', at: new Date().toISOString(), promote: true, pointer: { target: 'nonrep-stations', fromSha256: null }, version: 'nonrep-test' }));
const np = Ptr.approve(join(nd, 'promotion.json'), { dataDir: D, by: 'test', via: 'test', confirm: 'excl-x@1' }); const nr = Ptr.revert('nonrep-stations', { dataDir: D, by: 'test', via: 'test', confirm: 'nonrep-stations' });
ok(!Ptr.TARGETS.includes('nonrep-stations') && !np.ok && /no data pointer/.test(np.why) && !nr.ok && Ptr.activeNonrepFile === undefined && !/activeNonrepFile|nonrepresentative/.test(src('scripts/agents/verify.mjs').replace(/\/\*[\s\S]*?\*\//g, '')),
  'P4 no station-list target: approve and revert of "nonrep-stations" are refused; the verification agent reads no list');
/* P5 fx */
const fxF = join(D, 'flood-extent', 'fx-model.json'); const fx0 = readFileSync(fxF); const fd = join(D, 'agents', 'experiments', 'runs', '2026-10-25', 'flood-fx-c3_1'); mkdirSync(fd, { recursive: true });
writeFileSync(join(fd, 'promotion.json'), JSON.stringify({ id: 'flood-fx-c3@1', week: '2026-10-25', at: new Date().toISOString(), promote: true, pointer: { target: 'fx-model-served', fromSha256: sha(fx0) }, version: 'served=true' }));
const fa = Ptr.approve(join(fd, 'promotion.json'), { dataDir: D, by: 'test', via: 'test', confirm: 'flood-fx-c3@1' }); const fx1 = JSON.parse(readFileSync(fxF, 'utf8'));
const fr = Ptr.revert('fx-model-served', { dataDir: D, by: 'test', via: 'test', confirm: 'fx-model-served' });
ok(JSON.parse(fx0.toString()).served === false && fa.ok && fx1.served === true && existsSync(join(D, 'flood-extent', fx1.servedBy.previousFile)) && fr.ok && sha(readFileSync(fxF)) === sha(fx0), 'P5 flood extent: approve sets served true (file before kept); revert restores it byte for byte');
/* P6 the server route */
const AX = await tryImp('server/api/agents_exp.mjs'); const IDX = src('server/api/index.mjs');
if (AX.__err) ok(false, 'P6 server/api/agents_exp.mjs loads', AX.__err);
else { const st = {}; const X = AX.createExperimentAgents({}, TREE, D, { child: async () => ({ code: 0, out: '' }), on: () => true, st, schedule: false, adminDir: () => null });
  const n0 = nlog(); const r1 = await X.act('approve', { record: 'agents/experiments/runs/2026-10-25/blendr_1/promotion.json', confirm: 'blendr@1' }, { loopbackOperator: false, remote: '10.0.0.7' });
  const r2 = await X.act('revert', { target: 'blend-weights', confirm: 'blend-weights' }, { loopbackOperator: false, remote: '::1', customer: true });
  const r3 = await X.act('approve', { record: '../../etc/x/promotion.json', confirm: 'x' }, { loopbackOperator: true, remote: '127.0.0.1' });
  const lg = readFileSync(logF, 'utf8').trim().split('\n').slice(-3).map((l) => JSON.parse(l));
  ok(r1.status === 403 && r2.status === 403 && r3.status === 422 && nlog() - n0 === 3 && lg[0].result === 'refused' && /10\.0\.0\.7/.test(lg[0].by) && /customer view/.test(lg[1].by), 'P6a not a loopback operator (remote address; customer view): 403 and logged; a path outside the runs folder: refused and logged');
  ok(/p === '\/api\/ops\/experiments\/approve' \|\| p === '\/api\/ops\/experiments\/revert'/.test(IDX) && /loopbackOperator: loopbackDirect\(req\) && localOrSigned\(req\) && !customer && sameOrigin/.test(IDX), 'P6b index.mjs: approve / revert only for a direct loopback operator request, not the customer view, same origin');
  const pg = await X.page(); ok(/<form method="post" action="\/api\/ops\/experiments\/revert">/.test(pg) && !/<script/i.test(pg) && /Approvals log/.test(pg), 'P6c the weekly proposals page is plain HTML with Revert forms and the approvals log, no script'); }
/* P7 the command */
writeFileSync(join(D, 'blend-weights-active.json'), pre); const T1 = Ptr.targetState(D, 'blend-weights'); const rd2 = join(D, 'agents', 'experiments', 'runs', '2026-11-01', 'blendr_1'); mkdirSync(rd2, { recursive: true }); copyFileSync(join(runDir, 'blend-weights-blendr-V1-20261025.json'), join(rd2, 'blend-weights-blendr-V1-20261025.json'));
writeFileSync(join(rd2, 'promotion.json'), JSON.stringify(rec({ week: '2026-11-01', pointer: { target: 'blend-weights', file: 'data/blend-weights-active.json', fromSha256: T1.sha256 } })));
const env = { ...process.env, NIGRAAN_AGENTS_ADMIN_DIR: '-' };
const c1 = spawnSync(process.execPath, [join(TREE, 'scripts', 'gen', 'exp_approve.mjs'), 'approve', join(rd2, 'promotion.json'), '--data', D], { encoding: 'utf8', env });
const c2 = spawnSync(process.execPath, [join(TREE, 'scripts', 'gen', 'exp_approve.mjs'), 'approve', join(rd2, 'promotion.json'), '--data', D, '--confirm', 'blendr@1'], { encoding: 'utf8', env });
const c3 = spawnSync(process.execPath, [join(TREE, 'scripts', 'gen', 'exp_approve.mjs'), 'revert', 'blend-weights', '--data', D, '--confirm', 'blend-weights'], { encoding: 'utf8', env });
ok(c1.status === 2 && /REFUSED: explicit confirmation/.test(c1.stderr) && c2.status === 0 && /approved: blend-weights blend-v3-267 -> blendr-V1-20261025/.test(c2.stdout) && c3.status === 0 && /reverted/.test(c3.stdout), 'P7 exp_approve.mjs: refused without --confirm (exit 2); approve and revert done with it', (c1.stderr + c2.stdout + c2.stderr + c3.stdout).slice(0, 400));
done('exp_approve');
