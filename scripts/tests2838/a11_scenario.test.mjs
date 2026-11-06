// audit 11 / 12 · the scenario (artefact/NIGRAAN_3.html):
//  11a attribution does not depend on the order the events are processed in (each day stopped is shared equally among the events
//      stopping on it: the Shapley value of the union of the stops)
//  11b events are placed on the 15-day calendar: overlapping stops count once; a site never stops more than 15 days
//  12  the wording claims preserved dependence only for the events carrying run-by-run detail; the others are "sampled independently"
//  and no "fortnight" is left in the words a reader sees
import vm from 'node:vm';
import { src, lift, ok, done } from './lib.mjs';
const H = src('artefact/NIGRAAN_3.html');
const need = ['rng', 'tri', 'hitDays', 'dayUnion', 'summ', 'simulate', 'labModeLine'];
const code = need.map((n) => lift(H, n)).filter(Boolean).join('\n');
const ctx = { LAB: { asm: { a: [10, 10, 10], b: [10, 10, 10], c: [3, 3, 3] } }, Float64Array, Math, Object, evName: (k) => ({ a: 'Heat spell', b: 'Heavy or extreme rain', c: 'Cold spell' })[k] || k };
vm.createContext(ctx); let err = null; try { vm.runInContext(code, ctx); } catch (e) { err = e.message; }
ok(!err && typeof ctx.dayUnion === 'function', 'the calendar union and share (dayUnion) exist', err || '');
if (typeof ctx.dayUnion === 'function') {
  const con1 = {}, con2 = {}; const st1 = { iv: [[0, 10, 'a'], [5, 15, 'b']] }, st2 = { iv: [[5, 15, 'b'], [0, 10, 'a']] };
  const t1 = ctx.dayUnion(st1, con1), t2 = ctx.dayUnion(st2, con2);
  ok(t1 === 15 && t2 === 15 && con1.a === 7.5 && con1.b === 7.5 && con2.a === con1.a && con2.b === con1.b, '[0,10] and [5,15]: 15 days stopped (the 5 overlapping days once), 7.5 days each, whatever the order', JSON.stringify([t1, con1, t2, con2]));
  const W = { ev: { a: { p: 1 }, b: { p: 1 } }, mode: 'clim', idx: null }, Wr = { ev: { b: { p: 1 }, a: { p: 1 } }, mode: 'clim', idx: null };
  const r1 = ctx.simulate(W, 4000, ctx.rng(7)), r2 = ctx.simulate(Wr, 4000, ctx.rng(7));
  const share = (r) => r.con.a / (r.con.a + r.con.b);
  ok(Math.abs(share(r1) - 0.5) < 0.03 && Math.abs(share(r2) - 0.5) < 0.03, 'two certain 10-day events: each about half the days, in either processing order (v283.7: 10 vs 5)', [share(r1).toFixed(3), share(r2).toFixed(3)].join(' / '));
  ok(r1.s[r1.n - 1] <= 15 + 1e-9 && r1.mean > 10 && r1.mean < 15, 'never more than 15 days; two 10-day stops overlap on the calendar (mean between 10 and 15)', r1.mean.toFixed(2));
  const tot = Object.values(r1.con).reduce((x, y) => x + y, 0); ok(Math.abs(tot - r1.mean * r1.n) < 1e-6 * r1.n, 'the shares add up to the days stopped');
}
if (typeof ctx.labModeLine === 'function') {
  const Wd = { idx: [1, 2, 3], now: { mode: 'members', ev: { a: { p: 0.5, m: '010' }, b: { p: 0.4, m: null } } } };
  const t = ctx.labModeLine(Wd);
  ok(/Heat spell/.test(t) && /Heavy or extreme rain[^.]*sampled independently/.test(t) && !/^Each trial of this forecast takes one of the 3 forecast runs whole, so events that come together/.test(t), 'mode line: whole runs for the events with run-by-run detail; the others are "sampled independently"', t.slice(0, 300));
} else ok(false, 'labModeLine lifted');
ok(!/fortnight/i.test(H), 'no "fortnight" in Customize NIGRAAN (a 15-day window)', (H.match(/.{30}fortnight.{30}/i) || [''])[0]);
ok(!/coming fortnight/i.test(src('artefact/AI_GEO_NIGRAAN_v91_17_MACH.html')), 'the console says "the coming 15 days"');
done('A11-SCENARIO');
