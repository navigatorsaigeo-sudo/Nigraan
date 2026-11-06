// v91.17.283.10 · agent 6, the experimentation agent (offline: no server)
//  E1 the fixed registry: BLEND-R, zone/time calibration, height envelope, flood C3, flood D25, each with its verbatim pre-registered rule,
//     a data pointer or the reason there is none, and the full-chain flag; the retrain scripts are byte copies of the 1 Nov ones
//  E2 the decisions re-derived in code on the REAL recorded outputs: BLEND-R (laptop run 22 Oct, 70 min) does not pass; the flood extent C3
//     does not pass the pooled rule (lower bound -0.0111); A/B/S/C and H/H2 (22 Oct) do not pass; the script's own flag agrees
//  E3 a synthetic BLEND-R pass is recognised, a zone below the floor blocks it, and an untested served chain blocks promotion
//  E4 the weekly run: the rule file is written before the first run and never rewritten; the run is measured (wall, CPU, peak memory);
//     an unchanged candidate is not re-run; candidates without inputs are decided on their recorded output (said so) or wait for inputs
//  E5 a rule file edited after a run, or a script changed after its rule, refuses the run
//  E6 the budget: a candidate whose expected minutes exceed what is left is queued, not run
//  E7 diagnosis items proposing a station exclusion (agn.diagnose.v1 and agent 5's own item kind 'station') become pre-registered candidates
//     excl-<hex>@1, ordered after the never-run registry backlog, in the diagnostic agent's rank order
//  E8 no served file changes: a weekly run writes only under data/agents/experiments (and the day log)
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { TREE, FIX, tryImp, src, fx, ok, done, sha, dataCopy, snap, diff, P } from './lib.mjs';

const REG = await tryImp('scripts/agents/exp_registry.mjs'); const X = await tryImp('scripts/agents/experiments.mjs');
if (REG.__err || X.__err) { ok(false, 'E0 scripts/agents/exp_registry.mjs and experiments.mjs load', REG.__err || X.__err); done('exp_agent'); }
/* E1 */
const ids = REG.REGISTRY.map((c) => c.id);
ok(['blendr@1', 'temp-zone-abcs@2', 'height-envelope@1', 'flood-fx-c3@1', 'flood-d25@1'].every((i) => ids.includes(i)) && REG.REGISTRY.every((c) => c.sourceRule && c.sourceRule.text && c.sourceRule.text.length > 80 && (c.pointer || c.noPointerWhy) && c.chain),
  'E1a registry: 5 candidates, each with its verbatim pre-registered rule, a data pointer or the reason there is none, and the chain flag', ids.join(', '));
ok(/two-way cluster bootstrap/.test(REG.REGISTRY[0].sourceRule.text) && /Promote iff pooled G CI lower bound > 0/.test(REG.REGISTRY.find((c) => c.id === 'flood-fx-c3@1').sourceRule.text), 'E1b rule texts are the 22 Oct ones (BLEND-R; R2 addendum)');
const want = { 'blend_r.py': '64641c96225153d00f5512ea398a3a293f620b7632c9e594e268b4cb3b628938', 'cand_temp.py': '25146296175f4eef9bc4da07898a5a57c79b906bd05b1d76fa1d6daada3be2e7', 'cand_height.py': '22a0ca9c4327cd18ab16e63e8f4693a417b06959c41fab0d223ec711e6ded631' };
/* v91.17.283.24 · J26: cand_temp.py differs from the 1 Nov copy by the season line only (PKT month; registered as temp-zone-abcs@2): with that
   change undone it hashes to the 1 Nov file */
const j26undo = (f, b) => f !== 'cand_temp.py' ? b : Buffer.from(b.toString().replace(/# v91\.17\.283\.24 \(self-audit J26\)[^\n]*\n# [^\n]*\n/, '').replace("P['sea'] = pkt.dt.month.map(SEAS)", "P['sea'] = P.t.dt.month.map(SEAS)"));
ok(Object.entries(want).every(([f, h]) => sha(j26undo(f, readFileSync(join(TREE, 'scripts', 'agents', 'exp', f)))) === h), 'E1c blend_r.py, cand_temp.py, cand_height.py are byte copies of the 1 Nov retrain scripts (nigraan_retrain_20261101/py; v91.17.283.14: value-level quality control instead of the station list)');
/* E2 */
const B = REG.DECIDE.blendr(fx('blend_r_laptop_20261022.json'));
ok(B.rulePassed === false && B.agree === true && B.variants.V1.all.p1_25 === -0.003 && B.variants.V2.all.p1_25 === -0.011, 'E2a BLEND-R (laptop 22 Oct, 5.77 M rows, 223 stations): neither V1 nor V2 passes; the script agrees', JSON.stringify(B.reasons));
const F = REG.DECIDE.fx(JSON.parse(readFileSync(join(TREE, 'data', 'evidence', 'flood', 'fx_dated_test_2022dated.json'), 'utf8')));
ok(F.rulePassed === false && F.agree === true && F.headline[0].ci[0] === -0.0111 && /lower bound -0.0111 is not above 0/.test(F.reasons[0]), 'E2b flood extent C3: the pooled rule fails (G +0.0275, 95 % [-0.0111, +0.0589]); the script agrees', F.reasons.join('; '));
const T = REG.DECIDE.temp(fx('cand_temp_20261022.json')); const H = REG.DECIDE.height(fx('cand_height_20261022.json'));
ok(T.rulePassed === false && T.agree === true && !T.variants.A.passed && !T.variants.C.passed && H.rulePassed === false && H.agree === true, 'E2c zone/time calibration A, B, S, C and height envelope H, H2 (22 Oct): none passes; the scripts agree');
/* E3 */
const syn = JSON.parse(JSON.stringify(fx('blend_r_laptop_20261022.json'))); syn.variants.V1.all.p1_25 = 0.004; syn.promote = 'V1';
const S1 = REG.DECIDE.blendr(syn); syn.variants.V1.zones.plains.p1_25 = -0.09; const S2 = REG.DECIDE.blendr(syn);
ok(S1.rulePassed && S1.variant === 'V1' && S1.agree && !S2.rulePassed && S2.strata.some((s) => s.name === 'plains' && !s.ok), 'E3a a synthetic V1 pass is recognised; plains below its floor (-0.09 < -0.05) blocks it');
const C = REG.REGISTRY.find((c) => c.id === 'blendr@1'); ok(C.chain.applicable && !C.chain.tested && /blend START/.test(C.chain.why), 'E3b BLEND-R scores the blend start only: full served chain untested, so even a pass is not promoted (the audit lesson)');
/* E4 - E8: a weekly run on a temporary data folder (D25 runs for real from the per-tehsil rows; C3 and BLEND-R on recorded outputs) */
const W = dataCopy(); const retrain = join(W.root, 'retrain'); mkdirSync(join(retrain, 'work'), { recursive: true }); cpSync(join(FIX, 'blend_r_laptop_20261022.json'), join(retrain, 'work', 'blend_r.json'));
const before = snap(W.data); const now = P('2026-10-25 03:05');
const r1 = await X.runWeek({ app: TREE, dataDir: W.data, nowMs: now, lake: join(W.root, 'no-lake'), retrain, budgetMin: 30 });
const E = join(W.data, 'agents', 'experiments'); const by = Object.fromEntries(r1.results.map((r) => [r.id, r]));
const rule = JSON.parse(readFileSync(join(E, 'rules', 'flood-d25_1.json'), 'utf8')); const run = JSON.parse(readFileSync(join(E, 'runs', '2026-10-25', 'flood-d25_1', 'run.json'), 'utf8'));
ok(r1.week === '2026-10-25' && Date.parse(rule.written) <= Date.parse(run.at) && rule.script.sha256 === REG.fileSha(join(TREE, 'scripts', 'agents', 'exp', 'exp_a3_rerun.py')) && run.ruleSha256 === sha(readFileSync(join(E, 'rules', 'flood-d25_1.json'))),
  'E4a rule written before the first run (with the script sha256); the run records the rule sha256', rule.written + ' <= ' + run.at);
const d25 = by['flood-d25@1'];
ok(d25.status === 'done' && d25.mode === 'run' && d25.promote === false && d25.rulePassed === false && d25.cost.lastWallMin > 0 && d25.cost.lastPeakMb > 0 && /2025/.test(d25.reasons[0]), 'E4b D25 re-run from the per-tehsil rows: fails R1 (2025 does not pass); wall time and peak memory measured', JSON.stringify(d25.cost));
const out = JSON.parse(readFileSync(join(E, 'runs', '2026-10-25', 'flood-d25_1', 'out.json'), 'utf8'));
ok(out.years['2025'].reproduces_recorded && out.years['2022'].reproduces_recorded, 'E4c the re-run reproduces both years\' recorded AUC and paired intervals exactly');
ok(by['blendr@1'].mode === 'recorded' && by['blendr@1'].promote === false && /recorded output/.test(by['blendr@1'].reasons.join(' ')) && by['flood-fx-c3@1'].mode === 'recorded' && by['flood-fx-c3@1'].promote === false && r1.queue.some((q) => q.id === 'blendr@1'),
  'E4d BLEND-R and C3 without their inputs here: the rule is applied to the recorded real output, said so, not promoted; the real run stays queued');
ok(by['temp-zone-abcs@2'].status === 'waiting for inputs' && by['height-envelope@1'].status === 'waiting for inputs', 'E4e candidates with no inputs and no recorded output wait for inputs');
const rec = JSON.parse(readFileSync(join(E, 'runs', '2026-10-25', 'blendr_1', 'promotion.json'), 'utf8'));
ok(rec.promote === false && rec.pointer.target === 'blend-weights' && rec.pointer.file === 'data/blend-weights-active.json' && rec.pointer.fromVersion === 'blend-v3-267' && rec.pointer.wouldBecome === null && rec.approve === null && rec.evidence.headline.length >= 2,
  'E4f promotion record: promote no, the evidence, the exact pointer it would change (data/blend-weights-active.json, now blend-v3-267), no approve command');
const r2 = await X.runWeek({ app: TREE, dataDir: W.data, nowMs: now + 3600e3, lake: join(W.root, 'no-lake'), retrain, budgetMin: 30 });
ok(r2.results.find((r) => r.id === 'flood-d25@1').status === 'unchanged' && sha(readFileSync(join(E, 'rules', 'flood-d25_1.json'))) === run.ruleSha256, 'E4g second run: the unchanged candidate is not re-run; its rule file is not rewritten');
/* E5 */
const rf = join(E, 'rules', 'flood-d25_1.json'); const keep = readFileSync(rf); writeFileSync(rf, keep.toString().replace('"preRegistration"', '"edited": true, "preRegistration"'));
const r3 = await X.runWeek({ app: TREE, dataDir: W.data, nowMs: now + 7200e3, lake: join(W.root, 'no-lake'), retrain, budgetMin: 30, force: true });
ok(r3.results.find((r) => r.id === 'flood-d25@1').status === 'refused' && /edited after a run/.test(r3.results.find((r) => r.id === 'flood-d25@1').why), 'E5a a rule file edited after a run refuses the run');
writeFileSync(rf, keep); const hf = join(E, 'rules', 'height-envelope_1.json'); const hj = JSON.parse(readFileSync(hf, 'utf8')); hj.script.sha256 = '0'.repeat(64); writeFileSync(hf, JSON.stringify(hj));
const r4 = await X.runWeek({ app: TREE, dataDir: W.data, nowMs: now + 9000e3, lake: join(W.root, 'no-lake'), retrain, budgetMin: 30 });
ok(/script changed after the rule was written/.test(r4.results.find((r) => r.id === 'height-envelope@1').why || ''), 'E5b a script changed after its rule was written refuses the run (register a new id)');
/* E6 */
const W2 = dataCopy(); mkdirSync(join(W2.data, 'agents', 'experiments'), { recursive: true }); writeFileSync(join(W2.data, 'agents', 'experiments', 'costs.json'), JSON.stringify({ 'flood-d25@1': { lastWallMin: 50 } }));
const r5 = await X.runWeek({ app: TREE, dataDir: W2.data, nowMs: now, lake: join(W2.root, 'no-lake'), retrain: join(W2.root, 'none'), budgetMin: 20, only: ['flood-d25@1'] });
ok(r5.results[0].status === 'queued' && r5.queue.some((q) => q.id === 'flood-d25@1' && /budget/.test(q.why)) && !existsSync(join(W2.data, 'agents', 'experiments', 'runs', '2026-10-25', 'flood-d25_1', 'out.json')), 'E6 over the week\'s budget (50 min expected, 20 left): queued, not run', r5.queue.map((q) => q.why).join('; '));
/* E7 */
mkdirSync(join(W2.data, 'agents', 'diagnose'), { recursive: true });
writeFileSync(join(W2.data, 'agents', 'diagnose', '2026-10-24.json'), JSON.stringify({ schema: 'agn.diagnose.v1', day: '2026-10-24', items: [{ id: 'D1', flag: 'station reads 2.6 C cold against its neighbours at night', responsible: { kind: 'station', station: 'aws:Kandia_Warisabad Thooty Bar_ARG_1' }, size: { value: -2.6, unit: 'C', ci95: [-3.1, -2.1] }, evidence: ['national OOF'], suggestedTest: { kind: 'station_exclusion', stations: ['aws:Kandia_Warisabad Thooty Bar_ARG_1'], text: 'refit without the station' } }, { id: 'D2', flag: 'MACH 17 humidity stuck at 99 %', responsible: { kind: 'station', station: 'mach:Mach17' }, suggestedTest: { kind: 'sensor_check', text: 'visit Mach17: humidity sensor' } },
  { id: 'native1', kind: 'station', rank: 9, title: 'Chitral (synoptic (PMD), Mountains): temperature (hourly) reads 9.8 C warmer than its neighbours', where: { var: 'T', zone: 'mountain', station: 'synop:41506' }, responsible: 'synop:41506', size: { value: -9.8, ci: [-10.73, -8.86], unit: 'C' }, nextTest: 'Hypothesis (for the owner): Chitral does not represent its tehsil.' }] }));
const r6 = await X.runWeek({ app: TREE, dataDir: W2.data, nowMs: now, lake: join(W2.root, 'no-lake'), retrain: join(W2.root, 'none'), budgetMin: 20, week: '2026-10-25b' });
const exs = r6.results.filter((r) => /^excl-/.test(r.id)); const ex = exs[0]; const firstExcl = r6.results.findIndex((r) => /^excl-/.test(r.id)); const regBefore = r6.results.slice(0, firstExcl).every((r) => !/^excl-/.test(r.id) && REG.REGISTRY.some((c) => c.id === r.id));
ok(exs.length === 0 && !existsSync(join(W2.data, 'agents', 'experiments', 'rules', 'excl-')) && r6.results.every((r) => REG.REGISTRY.some((c) => c.id === r.id)), 'E7 v91.17.283.14: diagnosis items about a station propose no station exclusion experiment any more (values are judged by obsqc.mjs); only registry candidates run', JSON.stringify(r6.results.map((r) => r.id)));
/* E8 */
const after = snap(W.data); const ch = diff(before, after).filter((x) => !/ agents\/experiments\//.test(x) && !/ agents\/log\//.test(x));
ok(ch.length === 0, 'E8 the weekly runs changed no file outside data/agents/experiments and the day log (served pointers, weights, lists untouched)', ch.join('; '));
done('exp_agent');
