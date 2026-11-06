// v91.17.283.10 · the diagnostic agent (scripts/agents/diagnose.mjs), part 1: which step of the served chain makes the error.
//  S1 a step that adds a warm offset at night (synthetic +0.9 C at the start, as the bias trace found) is named responsible, with its size
//     and a 95 % interval that holds the true offset
//  S2 no step is named when no step adds an error (control), when the step corrects the error, or when its change is below the stations'
//     0.1 C resolution
//  S3 the statistics are reproducible (fixed seed) and the false-discovery control is Benjamini-Hochberg
import { ok, done, need, gauss, days } from './lib.mjs';
const D = await need('scripts/agents/diagnose.mjs', 'D1-STEPS');
const DAYS = days('2026-09-25', 20);
function recs(shift, seed, { base = 0.1, after = -0.02 } = {}) { const g = gauss(seed); const out = [];
  for (const pid of ['pmd:A', 'pmd:B', 'pmd:C']) for (const day of DAYS) for (const block of [0, 1, 7]) { const obs = 15 + 1.5 * g(); const raw = obs + base + g();
    const start = raw + shift + 0.2 * g(); const served = start + after + 0.1 * g();
    out.push({ source: 'syn', pid, zone: 'plains', urb: 'rural', day, var: 'T', block, night: true, lead: 24, obs, steps: { raw, start, served } }); }
  return out; }
const R1 = D.stepTests(recs(0.9, 11), [['zone', 'urb', 'night']]);
const t1 = R1.tests.find((t) => t.from === 'raw' && t.to === 'start'), t2 = R1.tests.find((t) => t.from === 'start' && t.to === 'served');
ok(t1 && t1.responsible && Math.abs(t1.delta.v - 0.9) < 0.1 && t1.delta.ci[0] < 0.9 && t1.delta.ci[1] > 0.9 && t1.delta.ci[0] > 0, 'S1 the warm start step is responsible: size and 95 % interval', t1 && JSON.stringify({ v: t1.delta.v, ci: t1.delta.ci, mae: t1.maeChange.v }));
ok(t1 && t1.sameSign === 3 && t1.stations === 3 && t1.delta.days === 20, 'S1 its evidence: 3 of 3 stations move the same way, 20 days', t1 && [t1.sameSign, t1.stations, t1.delta.days].join(' '));
ok(t2 && !t2.responsible, 'S1 the later step is not named', t2 && JSON.stringify({ v: t2.delta.v, sig: t2.significant }));
const R0 = D.stepTests(recs(0, 12), [['zone', 'urb', 'night']]);
ok(R0.tests.every((t) => !t.responsible), 'S2 control: no step adds an error, none is named', JSON.stringify(R0.tests.map((t) => [t.from, t.to, t.delta && +t.delta.v.toFixed(3)])));
const Rc = D.stepTests(recs(-0.9, 13, { base: 1.0 }), [['zone', 'urb', 'night']]);
ok(Rc.tests.every((t) => !t.responsible), 'S2 a step that corrects a warm error (+1.0 -> +0.1) is not named', JSON.stringify(Rc.tests.map((t) => [t.from, t.to, t.delta && +t.delta.v.toFixed(2), t.significant])));
const Rs = D.stepTests(recs(0.05, 14, { base: 0.6 }), [['zone', 'urb', 'night']]);
const ts = Rs.tests.find((t) => t.to === 'start');
ok(ts && !ts.responsible && !ts.resolved, 'S2 a change below the 0.1 C resolution is not named (even if statistically detectable)', ts && JSON.stringify({ v: ts.delta.v, sig: ts.significant }));
const a = D.bootMean([{ day: 'a', num: 1, den: 2 }, { day: 'b', num: 3, den: 2 }, { day: 'c', num: 2, den: 2 }], 5), b = D.bootMean([{ day: 'a', num: 1, den: 2 }, { day: 'b', num: 3, den: 2 }, { day: 'c', num: 2, den: 2 }], 5);
ok(a.v === 1 && JSON.stringify(a.ci) === JSON.stringify(b.ci) && a.days === 3, 'S3 the day-block bootstrap is exact in its mean and reproducible', JSON.stringify(a));
ok(D.bhCut([0.001, 0.02, 0.03, 0.5]) === 0.03 && D.bhCut([0.2, 0.5]) === null, 'S3 Benjamini-Hochberg at 5 %: [0.001, 0.02, 0.03, 0.5] passes up to 0.03; [0.2, 0.5] none');
done('D1-STEPS');
