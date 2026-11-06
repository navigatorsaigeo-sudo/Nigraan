// budget cut 2 · no cold starts: the model metadata state, the backend answer cache and the superset rows survive a restart, run-keyed,
// day-keyed, with a max age; a run that changed while the server was down is fetched again. Offline (no server).
import { mkdtempSync, writeFileSync, readFileSync, rmSync, utimesSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imp, ok, done, TREE } from './lib.mjs';
const MRm = await imp('server/api/modelruns.mjs');
let RSm = null; try { RSm = await imp('server/api/runstate.mjs'); } catch (e) { ok(false, 'R0 server/api/runstate.mjs loads', e.message); done('B2-RUNSTATE'); }
const D = mkdtempSync(join(tmpdir(), 'b2-')); writeFileSync(join(D, 'provider-models.json'), readFileSync(join(TREE, 'data', 'provider-models.json')));
let T = Date.parse('2026-10-21T07:00:00Z'); const now = () => T; const META = {}; let metaCalls = 0;
const mk = () => MRm.createModelRuns({ dataDir: D, now, metaFetch: async (k, d) => { metaCalls++; const m = META[d]; return { last_run_initialisation_time: m.init, last_run_availability_time: m.avail, update_interval_seconds: m.interval }; } });
const g = (o) => (k) => o[k];
const s0 = Math.floor(T / 1000);
for (const d of ['dwd_icon', 'ecmwf_ifs', 'ncep_gfs013', 'ncep_gfs025']) META[d] = { init: s0 - 6 * 3600, avail: s0 - 3600, interval: 6 * 3600 };
/* server 1: one national-like call, cached */
let up = 0; const prov = () => ({ call: async () => { up++; return { hourly: { temperature_2m: [1, 2, 3] }, n: up }; } });
const P1 = prov(); const A = mk(); A.cacheProvider(P1);
const Q = { latitude: [30, 31], longitude: [70, 71], hourly: ['temperature_2m'], forecast_days: 5, past_days: 3, timezone: 'GMT', models: 'best_match' };
await P1.call('forecast', '/v1/forecast', Q); await P1.call('forecast', '/v1/forecast', Q);
ok(up === 1, 'server 1: the second identical call is answered from the run-keyed cache', up);
const RS1 = RSm.createRunState({ dir: join(D, 'rs'), now }); RS1.register('modelruns', { dump: () => A.snapshot(), load: (o) => A.restore(o) });
ok(RS1.saveAll(true) === 1 && existsSync(join(D, 'rs', 'modelruns.json.gz')), 'the state is written (gzipped)');
/* server 2: restart 20 min later, same runs: no provider call, no metadata call needed for the key */
T += 20 * 60e3; const mc0 = metaCalls; const B = mk(); const P2 = prov(); B.cacheProvider(P2);
const RS2 = RSm.createRunState({ dir: join(D, 'rs'), now }); RS2.register('modelruns', { dump: () => B.snapshot(), load: (o) => B.restore(o) }); const r = RS2.loadAll();
ok(r.modelruns && r.modelruns.answers >= 1 && r.modelruns.meta === 4, 'server 2 restores the metadata (4 domains) and the answers', JSON.stringify(r));
ok(B.key(B.specFor('forecast', g(Q))) != null, 'the run key is known at once after the restart (no cold start)');
const before = up; const ans = await P2.call('forecast', '/v1/forecast', Q);
ok(up === before && ans.n === 1 && metaCalls === mc0, 'restart: the same request costs no provider call (and no metadata call: no run due)', 'up ' + (up - before) + ', meta ' + (metaCalls - mc0));
/* server 3: restarted after a newer run became available: the old answer is not used */
T += 6 * 3600e3; for (const d of Object.keys(META)) META[d] = { init: s0 + 3600, avail: Math.floor(T / 1000) - 60, interval: 6 * 3600 };
const RS2b = RSm.createRunState({ dir: join(D, 'rs'), now, maxAgeMs: 24 * 3600e3 }); RS2b.register('modelruns', { dump: () => B.snapshot(), load: () => 0 }); RS2b.saveAll(true);
const C = mk(); const P3 = prov(); C.cacheProvider(P3); const RS3 = RSm.createRunState({ dir: join(D, 'rs'), now, maxAgeMs: 24 * 3600e3 }); RS3.register('modelruns', { dump: () => C.snapshot(), load: (o) => C.restore(o) }); RS3.loadAll();
const u3 = up; await P3.call('forecast', '/v1/forecast', Q);
ok(up === u3 + 1, 'a run that changed while the server was down: fetched again (the restored answer is keyed on the old run)');
/* max age: a file older than the limit is not read */
const f = join(D, 'rs', 'modelruns.json.gz'); utimesSync(f, (T - 7 * 3600e3) / 1000, (T - 7 * 3600e3) / 1000);
const RS4 = RSm.createRunState({ dir: join(D, 'rs'), now }); let loaded = false; RS4.register('modelruns', { dump: () => null, load: () => { loaded = true; } }); RS4.loadAll();
ok(!loaded && /min old/.test(RS4.status().skipped.modelruns || ''), 'a state file older than 6 h is not read (cold start)', JSON.stringify(RS4.status().skipped));
/* a corrupt file is skipped */
writeFileSync(f, 'garbage'); const RS5 = RSm.createRunState({ dir: join(D, 'rs'), now }); RS5.register('modelruns', { dump: () => null, load: () => { loaded = true; } }); RS5.loadAll();
ok(!loaded && RS5.status().errors.modelruns, 'a corrupt file is skipped and named');
/* next day: answers of another day are not restored */
const E = mk(); const Ssnap = A.snapshot(T); T += 24 * 3600e3; const rr = E.restore(Ssnap, T);
ok(rr.answers === 0, 'answers of another day are not restored', JSON.stringify(rr));
/* superset rows: only today's rows, with their run */
const BR = await imp('server/api/bmrows.mjs');
let t2 = Date.parse('2026-10-21T07:00:00Z'); const runs = { specFor: () => ({ kind: 'forecast', regs: ['x'] }), key: () => 'x@1', poll: async () => 'x@1' };
const b1 = BR.createBmRows({ runs, now: () => t2 }); b1._rows.set('main|auto|30|70|200', { run: 'x@1', at: t2, day: '2026-10-21', row: { hourly: { time: [] } }, usedAt: 0 }); b1._rows.set('main|auto|31|70|200', { run: 'x@1', at: t2, day: '2026-10-19', row: { hourly: { time: [] } }, usedAt: 0 });
b1._rows.set('main|auto|32|70|200', { run: 'x@1', at: t2, day: '2026-10-20', row: { hourly: { time: [] } }, usedAt: 0 });
const snap = JSON.parse(JSON.stringify(b1.snapshot())); const b2 = BR.createBmRows({ runs, now: () => t2 });
/* v91.17.283.26 · a row of the previous Pakistan day is kept too (used for the same run after midnight, cut to the new day); older days dropped */
ok(b2.restore(snap) === 2 && b2._rows.has('main|auto|30|70|200') && b2._rows.has('main|auto|32|70|200') && !b2._rows.has('main|auto|31|70|200'), 'superset rows: today\'s and yesterday\'s rows restored with their run, older days dropped');
rmSync(D, { recursive: true, force: true });
done('B2-RUNSTATE');
