/* Automatic monthly retrain (28 Oct 2026): the server's Python job scheduler (server/api/pyjobs.mjs) knows the job autoRetrain, runs
   station-lake/scripts/auto_retrain.py check with --app/--data, never cuts it short (capMin 1440), uses the 'long' slot, and shows the
   script's own state in its status (GET /api/ops/pyjobs jobs[].state). Off switch: the job runs, the script sends nothing.
   node --test scripts/tests_autoretrain/pyjobs_autoretrain.test.mjs        (needs this package's station-lake beside nigraan-local) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createPyJobs } from '../../server/api/pyjobs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), APP = join(HERE, '..', '..'), LAKE = join(APP, '..', 'station-lake');
const pyOk = (() => { try { const p = process.env.NIGRAAN_PYTHON || (process.platform === 'win32' ? 'py' : 'python3'); execFileSync(p, ['-c', 'import sys'], { stdio: 'ignore' }); return true; } catch (_) { return false; } })();

function install(on) {
  const T = mkdtempSync(join(tmpdir(), 'pyjobs_ar_')); const app = join(T, 'nig', 'nigraan-local'), lake = join(T, 'nig', 'station-lake'), data = join(app, 'data');
  mkdirSync(data, { recursive: true }); mkdirSync(join(lake, 'scripts'), { recursive: true }); mkdirSync(join(T, '_admin'), { recursive: true }); writeFileSync(join(T, '_admin', 'alerts.log'), '');
  cpSync(join(LAKE, 'scripts', 'auto_retrain.py'), join(lake, 'scripts', 'auto_retrain.py'));
  cpSync(join(LAKE, 'retrain', 'auto'), join(lake, 'retrain', 'auto'), { recursive: true, filter: (s) => !/tests|__pycache__/.test(s) });
  const S = JSON.parse(readFileSync(join(APP, 'data', 'auto-retrain.json'), 'utf8')); S.on = on; writeFileSync(join(data, 'auto-retrain.json'), JSON.stringify(S));
  return { T, app, lake, data };
}

test('pyjobs: autoRetrain is registered as a long, never-cut job with --app and --data', () => {
  const I = install(false);
  try {
    const J = createPyJobs({}, I.app, I.data); const j = J._jobs.find((x) => x.id === 'autoRetrain');
    assert.ok(j); assert.equal(j.script, 'auto_retrain.py'); assert.equal(j.heavy, 'long'); assert.equal(j.capMin, 1440); assert.equal(j.everyH, 0.5);
    assert.deepEqual(j.args, ['check', '--app', I.app, '--data', I.data]);
    const s = J.status().jobs.find((x) => x.id === 'autoRetrain'); assert.equal(s.state, null);   /* no state file yet */
  } finally { rmSync(I.T, { recursive: true, force: true }); }
});

test('pyjobs: the off switch - the job runs, the script copies, runs and proposes nothing; the status shows "off"', { skip: !pyOk && 'no python' }, async () => {
  const I = install(false);
  try {
    const J = createPyJobs({}, I.app, I.data); const r = await J.run('autoRetrain', 'manual');
    assert.equal(r.started, true); assert.equal(r.code, 0);
    const s = J.status().jobs.find((x) => x.id === 'autoRetrain');
    assert.equal(s.state.now.phase, 'off'); assert.equal(s.state.on, false);
    assert.ok(!existsSync(join(I.lake, 'retrain_runs'))); assert.ok(!existsSync(join(I.T, 'nig', 'copies'))); assert.ok(!existsSync(join(I.data, 'agents')));
    assert.equal(readFileSync(join(I.T, '_admin', 'alerts.log'), 'utf8'), '');
  } finally { rmSync(I.T, { recursive: true, force: true }); }
});

test('pyjobs: switched on, not yet due - the job ends at once (exit 0) and the status names the next month', { skip: !pyOk && 'no python' }, async () => {
  const I = install(true);
  try {
    const J = createPyJobs({}, I.app, I.data);
    const r = await J.run('autoRetrain', 'manual'); assert.equal(r.code, 0);
    const s = J.status().jobs.find((x) => x.id === 'autoRetrain');
    assert.equal(s.state.on, true); assert.ok(s.state.next && /^\d{4}-\d{2}$/.test(s.state.next.period)); assert.ok(s.state.now.phase === 'idle' || s.state.now.phase === 'running' || /waiting/.test(s.state.now.phase));
  } finally { rmSync(I.T, { recursive: true, force: true }); }
});

test('pyjobs: NIGRAAN_PYJOB_AUTORETRAIN=0 stops the job', async () => {
  const I = install(true); process.env.NIGRAAN_PYJOB_AUTORETRAIN = '0';
  try { const J = createPyJobs({}, I.app, I.data); const r = await J.run('autoRetrain', 'manual'); assert.equal(r.started, false); assert.equal(r.on, false); }
  finally { delete process.env.NIGRAAN_PYJOB_AUTORETRAIN; rmSync(I.T, { recursive: true, force: true }); }
});
