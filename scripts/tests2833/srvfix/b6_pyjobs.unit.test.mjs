// budget cut 6 · the previous-runs learner (and the other Python jobs) keep their 24 h cadence across restarts: the last start is kept on
// disk and a scheduled run starts only when everyH has passed since it. Offline (no Python is started: the scripts are absent).
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imp, ok, done } from './lib.mjs';
const PJ = await imp('server/api/pyjobs.mjs');
const D = mkdtempSync(join(tmpdir(), 'b6-')); const root = join(D, 'nigraan-local'); const data = join(root, 'data'); mkdirSync(data, { recursive: true });
const app = {}; process.env.NIGRAAN_PYJOBS = '1';
const J = PJ.createPyJobs(app, root, data);
ok(typeof J.due === 'function', 'pyjobs exposes due()');
const job = (J._jobs || []).find((j) => j.id === 'prevRuns');
ok(!!job && J.due(job), 'no start on record: due');
mkdirSync(join(data, 'cache'), { recursive: true }); writeFileSync(join(data, 'cache', 'pyjobs-state.json'), JSON.stringify({ prevRuns: { lastStart: new Date(Date.now() - 3 * 3600e3).toISOString() } }));
const J2 = PJ.createPyJobs(app, root, data); const job2 = J2._jobs.find((j) => j.id === 'prevRuns');
ok(!J2.due(job2), 'after a restart, a start 3 h ago is on record: not due (was: run 60 min after every start)');
ok(J2.due(job2, Date.now() + 21 * 3600e3 + 60e3), 'due again 24 h after that start');
const r = await J2.run('prevRuns', 'scheduled'); ok(r && r.started === false, 'a scheduled tick before it is due starts nothing', JSON.stringify(r));
const st = J2.status(); ok(st.keepCadence === true && st.jobs.find((j) => j.id === 'prevRuns').lastStartKept, 'status shows the kept last start');
rmSync(D, { recursive: true, force: true });
done('B6-PYJOBS');
