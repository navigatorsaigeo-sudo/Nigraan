// v91.17.283.10 · PROOF on the real archive: the diagnostic agent, run unattended, reproduces the two findings made by hand on 22 Oct 2026.
//  P1 the plains rural night-minimum warm step at the blend start (+0.9 C; bias trace /tmp/claude-0/biastrace, t4.py): from the chain
//     replay's step outputs (raw best_match run and blend-start run: modes raw / nonatwx / nowx / full) against the PMD bulletin Tmin
//  P2 Warisabad ARG_1 (Kandia, hills) as a candidate non-representative station: from the as-issued tehsil archive and the partner-network
//     readings, against its neighbours and its zone; labelled as already on the list (the owner's 22 Oct decision), never acted on
//  P3 the MACH humidity finding (hygrometers more humid than synoptic and airport stations) and its heat consequence (observed UTCI lifted)
//  P4 the coast humidity bias of the verification is linked to its cause (the MACH stations), not left unexplained
// The data: the laptop's staged archives (a surrogate data folder; DIAG_LAP, default /tmp/claude-0/v28310/work/lap4) and the replay
// source file fixtures/sources_biastrace.json (DIAG_SOURCES). Missing data: SKIP with the reason (the checks need the real archive).
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ok, done, need } from './lib.mjs';
const D = await need('scripts/agents/diagnose.mjs', 'D5-PROOF');
const LAP = process.env.DIAG_LAP || '/tmp/claude-0/v28310/work/lap4'; const SRC = process.env.DIAG_SOURCES || join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'sources_biastrace.json');
if (!existsSync(join(LAP, 'data', 'archive', 'forecast')) || !existsSync('/tmp/claude-0/biastrace/out/rb_blend.jsonl')) { console.log('SKIP the real archive or the bias-trace replay is not on this computer (' + LAP + ')'); done('D5-PROOF'); }
const d = await D.diagnose({ dataDir: join(LAP, 'data'), copiesDir: join(LAP, 'copies'), lake: join(LAP, 'lake'), day: '2026-10-21', sources: SRC, now: Date.parse('2026-10-22T02:00:00Z') });
const step = d.items.find((x) => x.kind === 'step' && x.where.var === 'TN' && x.where.zone === 'plains' && x.where.urb === 'rural' && x.responsible === 'start');
ok(step && step.size.value >= 0.75 && step.size.value <= 1.05 && step.size.ci[0] > 0, 'P1 plains rural night minimum: the blend start is the responsible step, about +0.9 C with its interval', step && JSON.stringify(step.size));
ok(step && /error before the step .*: \+0\.\d+ °C .*after it: \+1\.\d+/.test(step.evidence.join(' ')) && /hypothesis/i.test(step.nextTest) && /Nothing is switched/.test(step.nextTest), 'P1 its evidence (before / after) and a next test stated as a hypothesis', step && step.evidence.slice(1, 3).join(' | '));
const other = d.items.filter((x) => x.kind === 'step' && x.where.var === 'TN' && x.where.zone === 'plains' && x.where.urb === 'rural' && x.responsible !== 'start');
ok(other.every((x) => Math.abs(x.size.value) < Math.abs(step ? step.size.value : 0) / 2), 'P1 no other plains rural night-minimum step comes near it', other.map((x) => x.responsible + ' ' + x.size.value).join(', '));
const w = d.items.find((x) => x.kind === 'station' && x.responsible === 'aws:Kandia_Warisabad Thooty Bar_ARG_1');
ok(w && w.size.value < -2 && w.size.ci[1] < 0 && w.where.zone === 'hills', 'P2 Warisabad ARG_1 is a candidate non-representative station (reads warm against its neighbours, interval below 0)', w && JSON.stringify(w.size));
ok(w && !('alreadyListed' in w) && /owner's decision/.test(w.nextTest) && /changes nothing/.test(w.action), 'P2 (v283.24: no station list since 283.14, no already-listed label) the next step is the owner\'s; nothing is acted on', w && w.action);
const mh = d.items.find((x) => x.kind === 'sensor' && x.where.network === 'mach'), hi = d.items.find((x) => x.kind === 'heat-input' && x.where.network === 'mach');
ok(mh && mh.size.value < -5 && hi && hi.size.value > 1, 'P3 MACH hygrometers read more humid than standard stations; their humidity lifts the observed UTCI', JSON.stringify({ rh: mh && mh.size, utci: hi && hi.size }));
const f = d.flags.find((x) => x.var === 'RH' && x.zone === 'coast' && x.urb === 'all');
ok(f && f.causes.some((c) => /MACH/.test(c.text)), 'P4 the coast humidity bias is linked to the MACH stations (leave-one-network-out)', f && f.verdict);
done('D5-PROOF');
