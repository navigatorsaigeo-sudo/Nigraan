// budget cut 3 · closed-period answers (archive, satellite, historical forecast, previous runs; start_date+end_date over before the
// request's day) are kept on disk, keyed on the exact request, only when complete; a window closed over 7 days ago for good, a more recent
// one for 36 h; an open window or an incomplete answer is asked again. Offline.
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imp, ok, done, TREE } from './lib.mjs';
const MRm = await imp('server/api/modelruns.mjs');
const D = mkdtempSync(join(tmpdir(), 'b3-')); writeFileSync(join(D, 'provider-models.json'), readFileSync(join(TREE, 'data', 'provider-models.json')));
let T = Date.parse('2026-10-21T07:00:00Z'); const now = () => T;
const mk = () => MRm.createModelRuns({ dataDir: D, now, metaFetch: async () => ({ last_run_initialisation_time: 1, last_run_availability_time: 1, update_interval_seconds: 3600 }) });
let up = 0, holes = false; const prov = () => ({ call: async (kind, path, p) => { up++; return [{ latitude: 30, longitude: 70, daily: { time: ['a', 'b'], temperature_2m_max: [30, holes ? null : 31] } }]; } });
const P = prov(); const M1 = mk(); M1.cacheProvider(P);   /* v91.17.283.5: closed writes are asynchronous; a restart is simulated after they land (closedFlush) */
const old = { latitude: [30], longitude: [70], daily: ['temperature_2m_max'], start_date: '1940-01-01', end_date: '2025-12-31' };
await P.call('archive', '/v1/archive', old); await P.call('archive', '/v1/archive', old);
ok(up === 1, 'a closed 1940-2025 window: asked once (the second answer from the closed cache)', up);
await M1.closedFlush(); const P2 = prov(); mk().cacheProvider(P2); const u0 = up; const a2 = await P2.call('archive', '/v1/archive', old);
ok(up === u0 && a2[0].daily.temperature_2m_max[1] === 31, 'kept on disk: a restarted server does not ask it again, same answer', up - u0);
const recent = { ...old, start_date: '2026-10-15', end_date: '2026-10-19', timezone: 'Asia/Karachi' };
await P.call('archive', '/v1/archive', recent); const u1 = up; await P.call('archive', '/v1/archive', recent);
ok(up === u1, 'a recent closed window: cached');
T += 37 * 3600e3; await P.call('archive', '/v1/archive', recent);
ok(up === u1 + 1, 'a recent closed window is asked again after 36 h (preliminary reanalysis days may be revised)');
const open = { ...old, start_date: '2026-10-20', end_date: '2026-10-22' }; const u2 = up; await P.call('archive', '/v1/archive', open); await P.call('archive', '/v1/archive', open);
ok(up === u2 + 2, 'an open window (end date today or later) is never cached', up - u2);
holes = true; const inc = { ...old, start_date: '2026-09-01', end_date: '2026-09-30' }; const u3 = up; await P.call('archive', '/v1/archive', inc); await P.call('archive', '/v1/archive', inc);
ok(up === u3 + 2, 'an incomplete answer (a missing value) is not kept', up - u3);
holes = false; const pr = { latitude: [30], longitude: [70], hourly: ['temperature_2m_previous_day1'], start_date: '2026-09-01', end_date: '2026-09-02' }; const u4 = up;
await P.call('previousRuns', '/v1/forecast', pr); await P.call('previousRuns', '/v1/forecast', pr);
ok(up === u4 + 1, 'previous runs: a closed window is cached too');
const fc = { latitude: [30], longitude: [70], hourly: ['temperature_2m'], start_date: '2026-09-01', end_date: '2026-09-02' }; const u5 = up;
await P.call('forecast', '/v1/forecast', fc); await P.call('forecast', '/v1/forecast', fc);
ok(up === u5 + 2, 'the live forecast endpoint is not touched by this cache', up - u5);
rmSync(D, { recursive: true, force: true });
done('B3-CLOSED');
