/* v91.17.283.28 . S3 · AREA HEAT: A FAILED OR ABSENT POINT STATE IS NOT ASSESSED, offline:
     A1  a unit with two points, one failed: the unit-day is not assessed with the reason (it was the answering point's level)
     A2  the same, but the answering point is already the top level (Severe): the level is served (a lower bound that is already the top)
     A3  a point state that does not hold the date: not assessed for that date
     A4  every point of a unit failed: each day of the run is not assessed (the unit is in the answer, never left to a silent fallback)
     A5  both points answer: the highest level, as before
   usage: node scripts/tests28328/areaheat.unit.test.mjs */
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + JSON.stringify(i).slice(0, 500) : '')); } };
const A0 = await import(pathToFileURL(join(API, 'areaheat.mjs')).href);
/* v283.36 item 16: aggregate has no 0.25 fallback; the tests pass the rule file's share (data/tehsil-popcells.json rule.share = 0.25) */
const A = { ...A0, aggregate: (P, s, o) => A0.aggregate(P, s, { share: 0.25, ...(o || {}) }) };
ok(JSON.stringify(A0.aggregate([{ uid: 'a', kind: 'main settlement', lat: 1, lon: 1 }], [{ ok: true, days: [{ lead: 0, date: 'd', heat: { utciMaxC: 40 } }] }])) === '{}', 'A0 (v283.36 item 16) no population rule given: no area level (no 0.25 fallback)');
const day = (date, u, lead = 0) => ({ date, lead, heat: { utciMaxC: u, at: '14:00', cls: 'x' } });
const st = (...days) => ({ ok: true, days });
const P = [{ uid: 'a', kind: 'main settlement', lat: 1, lon: 1 }, { uid: 'a', kind: 'centre', lat: 2, lon: 2 }, { uid: 'b', kind: 'main settlement', lat: 3, lon: 3 }, { uid: 'b', kind: 'centre', lat: 4, lon: 4 }];
{ const U = A.aggregate(P, [st(day('2026-10-28', 36), day('2026-10-29', 36, 1)), { ok: false, why: 'the forecast did not arrive' }, st(day('2026-10-28', 40), day('2026-10-29', 41, 1)), st(day('2026-10-28', 37))]);
  const a = U.a.days['2026-10-28'];
  ok(a.level != null && a.notAssessed && /failed/.test(a.notAssessed[0].why), 'A1 (v283.31 owner 2.2) a failed CENTRE point is reported, not weighted: the level stands on the populated point', a);
  { const U2 = A.aggregate([{ uid: 'c', kind: 'main settlement', lat: 1, lon: 1 }, { uid: 'c', kind: 'town', lat: 5, lon: 5, pop: 1 }], [st(day('2026-10-28', 36)), { ok: false, why: 'the forecast did not arrive' }]); const c = U2.c.days['2026-10-28'];
    ok(c.level === null && /failed/.test(c.why), 'A1 a failed POPULATED point that could change the level: not assessed with the reason', c); }
  const b = U.b.days['2026-10-29'];
  ok(b.level != null && /does not hold this day/.test(b.notAssessed[0].why), 'A3 (v283.31) a centre without the date: reported, the populated point decides', b);
  const b0 = U.b.days['2026-10-28'];
  ok(b0.level != null && b0.level >= 2 && b0.utciMaxC === 40, 'A5 both answer: the highest', b0); }
{ const U = A.aggregate(P.slice(0, 2), [st(day('2026-10-28', 50)), null]); const a = U.a.days['2026-10-28'];
  ok(a.level === 4 && a.notAssessed && a.notAssessed.length === 1, 'A2 a lower bound already Severe is served', a); }
{ const U = A.aggregate(P, [null, { ok: false }, st(day('2026-10-28', 30)), st(day('2026-10-28', 30))]);
  ok(U.a && U.a.days['2026-10-28'] && U.a.days['2026-10-28'].level === null, 'A4 every point failed: the unit-day is not assessed', U.a); }
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
