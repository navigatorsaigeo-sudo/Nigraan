/* v91.17.283.27 . ITEM 5 · THE CATCHMENT MEMBER-SHARE CUTS LIVE IN THE REGISTER; THE OUTPUT IS A SCREENING INDEX, offline:
     K1  data/formula-registry.json catchment.memberShareCuts (Monitor 10 / Watch 30 / likely 60 %) with its basis: no published source or
         test, so the register lists it as screening; catchment.mjs types none of them
     K2  catchment.mjs reads the cuts from the register: a changed register changes the class; a register without them gives "not assessed"
         (never Low); every answer is labelled a screening index (screening, productType, cuts text)
     K3  an older stored record (data/catchment-p99.json, with or without its sampling tag `samp`) is not read: the answer is the same with
         or without it and carries no IFS percentile
     K4  the asset view (limits.mjs) passes the not-assessed reason and the screening label; the analyst page prints the server's words
   usage: node scripts/tests28327/catchmentcuts.unit.test.mjs */
import { mkdtempSync, writeFileSync, readFileSync, rmSync, copyFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
const J = (...p) => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + JSON.stringify(i).slice(0, 500) : '')); } };
const FR = J('data', 'formula-registry.json'); const CUT = FR.catchment && FR.catchment.memberShareCuts;
/* ── K1 ── */
ok(CUT && JSON.stringify(CUT.value) === '{"Monitor":10,"Watch":30,"likely":60}' && /No published source/.test(CUT.basis), 'K1a the cuts and their (missing) source are in the formula registry', CUT);
const row = J('data', 'thresholds-register.json').rows.find((r) => r.id === 'FR.catchment.memberShareCuts');
ok(row && row.status === 'screening', 'K1b the thresholds register lists them as screening', row);
const src = readFileSync(join(API, 'catchment.mjs'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/c >= (10|30|60)\b/.test(src) && !/Monitor 10 %/.test(src) && !/CUT\.(Watch|Monitor|likely)/.test(src), 'K1c catchment.mjs types no cut and gives no class from them (v283.37 A4)');
/* ── K2 / K3 ── */
const M = await import(pathToFileURL(join(API, 'catchment.mjs')).href);
const RL = J('data', 'rain-return-levels.json'); const id = Object.keys(RL.catchments).find((k) => RL.catchments[k].assessed !== false); const L2 = RL.catchments[id]['24h'].areaRl[0];
const sq = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
function dir(cuts) { const T = mkdtempSync(join(tmpdir(), 'k27-'));
  writeFileSync(join(T, 'hybas_pk_lev07.json'), JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { id: Number(id), down: 0, area: 1800, up: 1800 }, geometry: sq(70, 30, 70.4, 30.4) }] }));
  copyFileSync(join(ROOT, 'data', 'rain-return-levels.json'), join(T, 'rain-return-levels.json'));
  const F = JSON.parse(JSON.stringify(FR)); if (cuts === null) delete F.catchment; else if (cuts) F.catchment.memberShareCuts.value = cuts; writeFileSync(join(T, 'formula-registry.json'), JSON.stringify(F)); return T; }
const provider = { call: async (kind, path, q) => { const day = { time: ['2026-11-02'], precipitation_sum: [L2 + 1] }; for (let m = 1; m < 10; m++) day['precipitation_sum_member' + String(m).padStart(2, '0')] = [m < 2 ? L2 + 5 : 0];
  return Array.from({ length: q.latitude.length }, () => ({ daily: day })); } };   /* 2 of 10 members reach the 2-year day: 20 % */
{
  const A = dir(), B = dir({ Monitor: 25, Watch: 50, likely: 70 }), N = dir(null);
  const a = await M.createCatchment({ provider, dataDir: A }).heavyRain(30.2, 70.2), b = await M.createCatchment({ provider, dataDir: B }).heavyRain(30.2, 70.2), n = await M.createCatchment({ provider, dataDir: N }).heavyRain(30.2, 70.2);
  /* v91.17.283.37 · launch item A4: the cuts are untested, so no class from them whatever the register says; the facts and state -5 */
  ok(a.ok && a.peakChance === 20 && a.class === null && b.class === null && b.peakChance === 20 && a.code === -5 && a.state === 'not_tested' && a.word === 'Not tested', 'K2a no class from the untested member-share cuts (20 % of members: facts, state -5 "Not tested")', [a.class, a.code, a.word, b.class]);
  ok(n.ok === true && n.class === null && n.peakChance === 20, 'K2b without the cuts in the register the facts are still given (they never depended on the cuts), no class', [n.ok, n.class]);
  ok(a.screening === true && a.productType === 'Screening index' && a.cuts === undefined && /screening index/.test(a.record.caution) && /not tested/.test(a.testStatus), 'K2c labelled a screening index and not tested; no cuts text', [a.productType, a.testStatus]);
  /* K3: a legacy record store, one record with the sampling tag and one without */
  writeFileSync(join(A, 'catchment-p99.json'), JSON.stringify({ [id]: { at: new Date().toISOString(), points: 9, days: 950, p95: 1, p99: 2, max: 3 }, x: { samp: 'lattice4x4-all-inside-v283', at: new Date().toISOString(), days: 950, p99: 2 } }));
  const a2 = await M.createCatchment({ provider, dataDir: A }).heavyRain(30.2, 70.2);
  ok(JSON.stringify({ ...a2, days: null }) === JSON.stringify({ ...a, days: null }) && !JSON.stringify(a2).includes('p99'), 'K3 a stored IFS record (with or without `samp`) is not read: the same answer, no IFS percentile', a2.record);
  for (const T of [A, B, N]) rmSync(T, { recursive: true, force: true });
}
/* ── K4 ── */
{
  const lim = readFileSync(join(API, 'limits.mjs'), 'utf8');
  ok(/HR\.notAssessed\) \{ physical = physical \|\| \{\}; physical\.catchmentRain = \{ class: null, notAssessed: true/.test(lim) && /screening: HR\.screening === true/.test(lim) && !/p99Mm/.test(lim) && !/class: HR\.class/.test(lim), 'K4a limits.mjs passes the not-assessed reason and the screening label (no p99), never a class (v283.37)');
  const m = readdirSync(join(ROOT, 'server', 'science', 'modules')).find((f) => /agn-crossings-js/.test(f)); const pg = readFileSync(join(ROOT, 'server', 'science', 'modules', m), 'utf8');
  ok(/catchmentRain\.notAssessed/.test(pg) && /catchmentRain\.against/.test(pg) && !/99th-percentile day/.test(pg), 'K4b the analyst page prints the server\'s level words (no "99th-percentile day")');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
