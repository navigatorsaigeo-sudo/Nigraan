#!/usr/bin/env node
/* v91.17.76 · agent D · "NIGRAAN keeps learning from its own data"
   1. the permanent training archive (server/api/archive.mjs -> data/archive): listed on the operations board, reachable at
      /api/ops/archive, idempotent per day, every month file equal to its committed length and readable end to end;
   2. the monthly AI temperature correction retrain (LEARN_ALL job "downscale" -> data/downscale-retrain.json): on the board,
      no held-out skill figure in the board's text (CEO decision 1: internal only);
   3. SCHEDULE_LEARN.bat / UNSCHEDULE_LEARN.bat: plain schtasks -> cmd /c LEARN_ALL.bat, CRLF, ASCII, no script host,
      no hidden window, no PowerShell;
   4. LEARN_ALL.bat carries the job.
   Usage: node scripts/tests76/learning.test.mjs [base]   (default http://127.0.0.1:8787). The POST and file checks run only
   when the base is this machine. */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const BASE = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const NL = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE);
let fails = 0;
const ok = (c, name, info = '') => { console.log((c ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); if (!c) fails++; };
const get = async (p) => { const r = await fetch(BASE + p, { signal: AbortSignal.timeout(60000) }); return { status: r.status, json: await r.json().catch(() => null) }; };

/* ── the operations board ── */
const H = await get('/api/ops/health');
ok(H.status === 200 && H.json && Array.isArray(H.json.jobs), 'ops health answers', 'HTTP ' + H.status);
const jobs = (H.json && H.json.jobs) || [];
const ja = jobs.find(j => j.id === 'archive'), jd = jobs.find(j => j.id === 'downscaleRetrain');
ok(!!ja, 'board lists the training archive', ja ? `${ja.state}: ${ja.label}` : '');
ok(!!ja && !/not wired/.test(ja.label), 'archive module is wired (not the manifest fallback)');
ok(!!jd, 'board lists the AI correction retrain', jd ? `${jd.state}: ${jd.label}` : '');
ok(!!jd && !/\d\.\d+\s*(C|°C)|MAE|->/.test(jd.label), 'retrain label carries no held-out skill figure');
const A = H.json && H.json.archive;
ok(!!A && A.kinds && ['forecast', 'fleet', 'imerg'].every(k => A.kinds[k] && typeof A.kinds[k].days === 'number'), 'health.archive lists days per kind', A ? JSON.stringify(Object.fromEntries(Object.entries(A.kinds).map(([k, v]) => [k, v.days]))) + ` ${A.mb} MB` : '');
ok(!!A && A.retention === 'permanent (never pruned)', 'archive retention is permanent');
const D = H.json && H.json.downscaleRetrain;
ok(D === null || (D && !('judge' in D) && !JSON.stringify(D).match(/"(champion|challenger)MaeC"/)), 'health.downscaleRetrain holds no skill figures', D ? JSON.stringify({ at: D.at, promoted: D.promoted, skipped: D.skipped, summary: D.summary }) : 'not run yet');

/* ── the archive route ── */
const S = await get('/api/ops/archive');
ok(S.status === 200 && S.json && S.json.dir === 'data/archive', 'GET /api/ops/archive', 'HTTP ' + S.status);
ok(!!(S.json && S.json.schema && S.json.schema.forecast && S.json.schema.fleet && S.json.schema.imerg), 'archive status documents its schema');
ok(!!(S.json && S.json.projection && typeof S.json.projection.mbPerYear === 'number'), 'archive status projects its yearly size', S.json && S.json.projection ? S.json.projection.mbPerYear + ' MB/year' : '');

if (LOCAL) {
  const run = async (body) => { const r = await fetch(BASE + '/api/ops/archive/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) }); return { status: r.status, json: await r.json().catch(() => null) }; };
  const r1 = await run({});
  ok(r1.status === 200 && r1.json && r1.json.status, 'POST /api/ops/archive/run (the normal tick)', 'HTTP ' + r1.status + ' ' + JSON.stringify(r1.json && r1.json.forecast));
  const days1 = r1.json && r1.json.status && r1.json.status.kinds.forecast.days;
  const r2 = await run({});
  const f2 = (r2.json && r2.json.forecast) || [];
  ok(r2.status === 200 && r2.json.status.kinds.forecast.days === days1 && f2.every(x => !x.rows), 'second tick writes no forecast day twice', JSON.stringify(f2));
  /* files: committed length, readable end to end, one member per manifest day */
  const dir = join(NL, 'data', 'archive'), mf = join(dir, 'manifest.json');
  if (existsSync(mf)) {
    const M = JSON.parse(readFileSync(mf, 'utf8'));
    for (const [rel, fi] of Object.entries(M.files || {})) {
      const p = join(dir, rel); const size = existsSync(p) ? statSync(p).size : -1;
      ok(size === fi.bytes, 'file at its committed length: ' + rel, `${size} / ${fi.bytes}`);
      let rows = []; try { rows = zlib.gunzipSync(readFileSync(p)).toString('utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (e) { rows = null; }
      ok(Array.isArray(rows), 'readable end to end: ' + rel, rows ? rows.length + ' rows' : 'gunzip / JSON failed');
      if (rows) {
        const kind = rel.split('/')[0]; const want = Object.entries(M.days[kind] || {}).filter(([, v]) => v.file === rel).map(([d]) => d).sort();
        const have = [...new Set(rows.map(r => r.d))].sort();
        ok(JSON.stringify(want) === JSON.stringify(have), 'days in the file match the manifest: ' + rel, have.join(','));
      }
    }
    ok(!existsSync(join(NL, 'data', 'nightly')) || !readdirSync(join(NL, 'data', 'nightly')).some(d => existsSync(join(NL, 'data', 'nightly', d, 'archive'))), 'the archive is not copied into the 14-day nightly rotation');
  } else ok(true, 'no archive written yet on this install (manifest absent)');
}

/* ── the scheduled task and the learning batch files ── */
const cands = [join(NL, '..', 'SCHEDULE_LEARN.bat'), join(NL, '..', 'deploy_root', 'SCHEDULE_LEARN.bat')];
const sp = cands.find(existsSync);
/* 13 Oct 2026 · audit: in the D:\\NIGRAAN layout the weekly task is registered by _admin\\portable\\setup_here.ps1 (SETUP_NIGRAAN_HERE.bat);
   the old SCHEDULE_LEARN.bat pair was not carried over. Either registration path is checked for the same task. */
const setupP = join(NL, '..', '..', '_admin', 'portable', 'setup_here.ps1');
if (!sp && existsSync(setupP)) {
  const st = readFileSync(setupP, 'utf8');
  ok(/Register-ScheduledTask -TaskName 'NIGRAAN Weekly Learning'/.test(st) && /New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At '03:17'/.test(st), 'weekly Sunday 03:17 task registered by setup_here.ps1');
  ok(/cmd\.exe" -Argument "\/c `"`"\$NL\\LEARN_ALL\.bat`" unattended`""/.test(st) && !/RunLevel Highest/i.test(st), 'the task runs LEARN_ALL.bat unattended as the signed-in user, no elevation');
} else ok(!!sp, 'SCHEDULE_LEARN.bat present', sp || cands.join(' | '));
for (const name of (sp ? ['SCHEDULE_LEARN.bat', 'UNSCHEDULE_LEARN.bat'] : [])) {
  const p = sp ? join(dirname(sp), name) : null;
  if (!p || !existsSync(p)) { ok(false, name + ' present'); continue; }
  const b = readFileSync(p); const t = b.toString('latin1');
  ok(![...b].some(x => x > 127), name + ' is ASCII');
  ok(!/[^\r]\n/.test(t) && t.includes('\r\n'), name + ' has CRLF line ends');
  ok(!/wscript|cscript|\.vbs|powershell|WindowStyle|hidden|Invoke-WebRequest|bitsadmin|certutil|curl /i.test(t.replace(/^REM.*$/gim, '')), name + ': no script host, hidden window, PowerShell or download');
  if (name === 'SCHEDULE_LEARN.bat') {
    ok(/schtasks \/Create \/F \/TN "%TASK%" \/SC WEEKLY \/D SUN \/ST 03:17 \/TR "cmd \/c \\"\\"%BAT%\\" unattended\\""/.test(t), 'weekly Sunday 03:17 task: schtasks -> cmd /c LEARN_ALL.bat');
    ok(/nigraan-local\\LEARN_ALL\.bat/.test(t) && !/\/RL HIGHEST|\/RU /i.test(t), 'runs LEARN_ALL.bat as the signed-in user, no elevation');
  } else ok(/schtasks \/Delete \/F \/TN "%TASK%"/.test(t), 'UNSCHEDULE_LEARN.bat deletes the task');
}
const laP = join(NL, 'LEARN_ALL.bat'); ok(existsSync(laP), 'LEARN_ALL.bat present', laP);
const la = existsSync(laP) ? readFileSync(laP) : Buffer.from('');
ok(/call :job downscale "%LAKE%\\scripts\\downscale_retrain\.py"/.test(la.toString('latin1')), 'LEARN_ALL.bat runs the downscale job');
ok(![...la].some(x => x > 127) && !/[^\r]\n/.test(la.toString('latin1')), 'LEARN_ALL.bat stays ASCII / CRLF');
ok(/if not defined UNATT pause/.test(la.toString('latin1')), 'LEARN_ALL.bat unattended never waits for a key');
const lake = join(NL, '..', 'station-lake', 'scripts');
if (existsSync(lake)) {
  ok(existsSync(join(lake, 'downscale_retrain.py')) && existsSync(join(lake, 'archive_read.py')), 'station-lake carries downscale_retrain.py and archive_read.py');
  ok(/LightGBM is not installed/.test(readFileSync(join(lake, 'downscale_retrain.py'), 'utf8')), 'the retrain skips cleanly without LightGBM');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
