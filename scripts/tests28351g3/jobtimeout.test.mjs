/* v283.51g3 · ITEM 2 · a background job that hangs is stopped at its limit: the whole process tree ended, a job-timeout line in
   server.log, the run marked failed (code -2, "stopped after"), the success clock not advanced, and the job due again on its next schedule.
   A fake Python (a shell script that starts a grandchild and then hangs) stands in for the job; NIGRAAN_JOB_LIMIT_S=2 shortens the limit.
   Also prints the limit table (jobrun.mjs limitFor) for every job in the log record. Linux/macOS (process groups). */
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (d != null ? ' · ' + String(d).slice(0, 400) : '')); };
const T = '/dev/shm/g3jobt'; rmSync(T, { recursive: true, force: true });
const app0 = join(T, 'nig', 'app'), lake = join(T, 'nig', 'station-lake'), data = join(app0, 'data');
for (const d of [join(lake, 'scripts'), join(data, 'cache'), join(app0, 'scripts')]) mkdirSync(d, { recursive: true });
writeFileSync(join(lake, 'scripts', 'metar_sync.py'), '# placeholder: the fake interpreter below never reads it\n');
const fake = join(T, 'fakepy.sh');
writeFileSync(fake, '#!/bin/sh\n(sleep 600) &\necho $! > ' + join(T, 'grandchild.pid') + '\necho $$ > ' + join(T, 'child.pid') + '\necho "fake job started"\nsleep 600\n'); chmodSync(fake, 0o755);
process.env.NIGRAAN_PYTHON = fake; process.env.NIGRAAN_DATA_DIR = data; process.env.NIGRAAN_JOB_LIMIT_S = '2';
/* a process counts as running unless it is gone or a zombie (exited, waiting for its parent to collect it: the container's init does not) */
const alive = (pid) => { try { process.kill(pid, 0); } catch (_) { return false; } try { return !/^State:\s+Z/m.test(readFileSync('/proc/' + pid + '/status', 'utf8')); } catch (_) { return true; } };
const J = await import(pathToFileURL(join(ROOT, 'server/api/jobrun.mjs')));
/* A · runJob alone */
{ const t0 = Date.now(); const r = await J.runJob('metar_sync.py', fake, [], { capMin: 10 });
  const gc = +readFileSync(join(T, 'grandchild.pid'), 'utf8'), c = +readFileSync(join(T, 'child.pid'), 'utf8');
  await new Promise((res) => setTimeout(res, 300));
  ok(r.code === -2 && r.timedOut === true && /stopped after/.test(r.out), 'A runJob: a hanging job answers code -2, timedOut, "stopped after"', JSON.stringify({ code: r.code, ms: r.ms }));
  ok(Date.now() - t0 < 10000, 'A it answers within the limit + the kill grace', (Date.now() - t0) + ' ms');
  ok(!alive(c) && !alive(gc), 'A the job and the process it started are both ended (process tree)', 'child ' + c + ' alive ' + alive(c) + ', grandchild ' + gc + ' alive ' + alive(gc));
  const log = readFileSync(join(data, 'server.log'), 'utf8'); ok(/job-timeout metar_sync\.py pid \d+ after 2 seconds \(limit: NIGRAAN_JOB_LIMIT_S=2\) - process tree ended/.test(log), 'A server.log: job-timeout line', log.trim().split('\n').pop()); }
/* B · through pyjobs.mjs (the scheduler path): failed, not counted as success, due again on its next schedule */
{ const { createPyJobs } = await import(pathToFileURL(join(ROOT, 'server/api/pyjobs.mjs')));
  const P = createPyJobs({}, app0, data);
  const r = await P.run('metarSync', 'scheduled');
  const s = P.status().jobs.find((j) => j.id === 'metarSync');
  ok(r.started === true && r.code === -2 && s.lastCode === -2 && s.timedOut === true && !s.running, 'B pyjobs: the scheduled run is marked failed (code -2), not running', JSON.stringify({ r, lastCode: s.lastCode, timedOut: s.timedOut, running: s.running, tail: s.tail }));
  const st = JSON.parse(readFileSync(join(data, 'cache', 'pyjobs-state.json'), 'utf8')).metarSync;
  ok(st && st.lastStart && !st.lastOk, 'B the success clock is not advanced (no lastOk)', JSON.stringify(st));
  const j = P._jobs.find((x) => x.id === 'metarSync'), t = Date.parse(st.lastStart);
  ok(P.due(j, t + 60e3) === false && P.due(j, t + j.everyH * 3600e3 + 1000) === true, 'B due again once its own period (' + j.everyH * 60 + ' min) has passed since the failed start: retried on its next schedule');
  const again = await P.run('metarSync', 'manual'); ok(again.started === true && again.code === -2, 'B a later run starts (the job is not stuck as running)', JSON.stringify(again));
  const log = readFileSync(join(data, 'server.log'), 'utf8').trim().split('\n').filter((l) => /job-timeout/.test(l)); ok(log.length >= 3, 'B every overrun logged (' + log.length + ' job-timeout lines)'); }
/* C · the limit table */
delete process.env.NIGRAAN_JOB_LIMIT_S;
{ const rows = Object.entries(J.JOB_NORMAL).map(([k, N]) => [k, N.n, N.maxS, J.limitFor(k, 'cap').min, J.limitFor(k, 'cap').basis]);
  for (const r of rows) console.log('  limit  ' + r[0].padEnd(30) + ' runs ' + String(r[1]).padStart(3) + '  longest ' + String(r[2]).padStart(7) + ' s  -> ' + (r[3] === 'cap' ? 'cap kept' : r[3] + ' min') + '  (' + r[4] + ')');
  ok(J.limitFor('ews_sync.py', 25).min === 22 && J.limitFor('mach_db_sync.py --live', 15).min === 19 && J.limitFor('metar_sync.py', 10).min === 5 && J.limitFor('fetch_multimodel.py', 240).min === 240 && J.limitFor('auto_retrain.py check', 1440).min === 1440,
    'C limits: 3 x the longest successful run, at least 5 min; caps kept below 3 runs or for a rare long mode');
  ok(J.jobKeyOf('/x/mach_db_sync.py', ['--app', 'r', '--live']) === 'mach_db_sync.py --live' && J.jobKeyOf('verify.mjs', ['--backfill', '30']) === 'verify.mjs --backfill' && J.jobKeyOf('auto_retrain.py', ['check']) === 'auto_retrain.py check', 'C job keys by mode'); }
rmSync(T, { recursive: true, force: true });
console.log(`\n${fail ? 'FAIL' : 'PASS'} jobtimeout: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
