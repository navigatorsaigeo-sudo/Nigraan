/* r42 (NIGRAAN 1.0.6) · the blend's sweep pools (mmblend42.mjs): the hazard-grid and area-pass requests (internal token + tag) draw on their
   own pools sized points x 4 runs x weight x 1.25; place reads keep the tehsil / other pools; a spent pool shows in poolSpent.
   usage: node scripts/tests28342/pools42.test.mjs */
import { createMMBlend42 } from '../../server/api/mmblend42.mjs';
import { fileURLToPath } from 'node:url'; import { join, dirname } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' ' + JSON.stringify(d))); };
const grid = Array.from({ length: 100 }, (_, i) => ({ lat: 30 + i * 0.01, lon: 70 }));
const area = Array.from({ length: 50 }, (_, i) => ({ lat: 31 + i * 0.01, lon: 72 }));
const tehsil = [{ lat: 25, lon: 67 }];
const M = createMMBlend42(ROOT, { zoneOf: () => 'plains', weightOf: (g) => String(g('latitude')).split(',').length, note: () => {}, tehsilPoints: () => tehsil,
  sweeps: { 'hazard-grid': () => grid, 'pointstate-area': () => area }, elevOf: () => 200 });
ok(M.on(), 'blend on (weights and gate present)', M.status().why);
const fx = async (q) => { const n = String(q.latitude).split(',').length; return Array.from({ length: n }, () => ({ hourly: { time: ['2026-11-01T00:00'] } })); };
const t0 = Date.parse('2026-11-01T01:00:00Z');
await M.prepare(grid.map((p) => p.lat), grid.map((p) => p.lon), null, fx, t0, { tag: 'hazard-grid', internal: true });
let s = M.status();
ok(s.pools && s.pools.other === 3300 && s.pools.grid === Math.round(1.25 * 4 * 100), 'grid pool 500; place pool at its 3,300 floor', s.pools);
ok(s.spent.wG === 100 && s.spent.wO === 0, 'the grid sweep spent the grid pool only', s.spent);
await M.prepare(area.map((p) => p.lat), area.map((p) => p.lon), null, fx, t0, { tag: 'pointstate-area', internal: true });
s = M.status(); ok(s.pools.area === 250 && s.spent.wA === 50 && s.spent.wO === 0, 'area pool 250; the area pass spent it only', { pools: s.pools, spent: s.spent });
await M.prepare([33.1], [73.1], null, fx, t0, { tag: 'hazard-grid', internal: false });
s = M.status(); ok(s.spent.wO === 1 && s.spent.wG === 100, 'without the internal token a request is a place read (other pool)', s.spent);
await M.prepare([25], [67], null, fx, t0, { tag: 'hazard-grid', internal: true });
s = M.status(); ok(s.spent.wT === 1, 'a tehsil point stays on the tehsil reserve', s.spent);
for (let c = 1; c < 6; c++) await M.prepare(grid.map((p) => p.lat), grid.map((p) => p.lon), null, fx, t0 + c * 6 * 3600e3 * 0 + c * 1000, { tag: 'hazard-grid', internal: true });
s = M.status(); ok(s.spent.wG === 100, 'the same cycle reuses the members (no second fetch)', s.spent);
const t1 = Date.parse('2026-11-01T00:30:00Z'); let refusedBefore = 0;
for (const h of [6, 12, 18]) await M.prepare(grid.map((p) => p.lat), grid.map((p) => p.lon), null, fx, t1 + h * 3600e3, { tag: 'hazard-grid', internal: true });
s = M.status(); ok(s.spent.wG === 400 && s.poolSpent.grid.refusedBatches === refusedBefore, '4 cycles of a full grid in a day: 400 of 500, 0 refused', { spent: s.spent, ps: s.poolSpent });
const big = Array.from({ length: 200 }, (_, i) => ({ lat: 34 + i * 0.001, lon: 74 }));
await M.prepare(big.map((p) => p.lat), big.map((p) => p.lon), null, fx, t1 + 19 * 3600e3, { tag: 'hazard-grid', internal: true });
s = M.status(); ok(s.poolSpent.grid.spent === true && s.poolSpent.grid.refusedBatches === 1 && s.poolSpent.other.spent === false, 'over the grid pool: refused there, counted in poolSpent, the other pool untouched', s.poolSpent);
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
