// W6 · river flooding "Not assessed" in a tehsil with no modelled river reach says so (not "no data from the hazard engine").
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imp, ok, done } from './lib.mjs';
const { createEngine } = await imp('server/api/engine.mjs'); const S = await imp('server/api/served.mjs');
const mkRec = (Lr) => ({ at: new Date().toISOString(), words: ['Normal', 'Low', 'Moderate', 'High', 'Severe'], unitKeys: { a: 'P|A', b: 'P|B', c: 'P|C' },
  days: [{ day: 0, date: '2026-10-22', basis: 'peak', layers: { heat: { L: { a: 0, b: 0, c: 0 }, S: {}, counts: [3, 0, 0, 0, 0], na: 0, nd: 0 },
    flood_riverine: { L: Lr, S: {}, counts: [0, 1, 2, 3, 4].map((i) => Object.values(Lr).filter((x) => x === i).length), na: 0, nd: Object.values(Lr).filter((x) => x === -1).length } } }], alerts: [] });
const run = (Lr) => { const dir = mkdtempSync(join(tmpdir(), 'w6-')); const E = createEngine({}, dir, { port: 1 }); const r = E.report(mkRec(Lr)); E.latest() && (E.latest().received = new Date().toISOString());
  const app = { engine: E, gate: { full: () => ({ ready: true, client_rules: {} }), entryOf: () => null } };   /* v91.17.283.8 (audit 2): gate null now fails closed */ const u = S.servedUnit(app, 'b'); rmSync(dir, { recursive: true, force: true }); return { r, u }; };
const A = run({ a: 2, b: -1, c: 0 });
const fr = A.u && A.u.ready && A.u.days[0].layers.flood_riverine, fl = A.u && A.u.ready && A.u.days[0].layers.flood;
ok(A.r && A.r.ok, 'report accepted', JSON.stringify(A.r).slice(0, 200));
ok(fr && fr.assessed === false && /no modelled river reach scored here/.test(fr.notAssessedWhy || '') && !/no data from the hazard engine/.test(fr.notAssessedWhy), 'W6: -1 river level where other tehsils scored -> "no modelled river reach scored here"', fr && fr.notAssessedWhy);
ok(!fl || /no modelled river reach/.test(fl.notAssessedWhy || ''), 'W6: the client "flood" substitute (from flood_riverine) carries the same reason', fl && fl.notAssessedWhy);
const B = run({ a: -1, b: -1, c: -1 }); const fb = B.u.days[0].layers.flood_riverine;
ok(fb && /no data from the hazard engine/.test(fb.notAssessedWhy || ''), 'W6: when no tehsil scored (feed failed) it stays "no data"', fb && fb.notAssessedWhy);
const C = run({ a: 2, b: -3, c: 0 }); const fc = C.u.days[0].layers.flood_riverine;
ok(fc && fc.assessed === false && /^no modelled river reach for this place/.test(fc.notAssessedWhy || ''), 'W6: page code -3 -> "no modelled river reach for this place"', fc && fc.notAssessedWhy);
done('W6-NOREACH');
