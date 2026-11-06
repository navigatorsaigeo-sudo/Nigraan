/* v91.17.255 · B-2 (12 Oct 2026, approved by the CEO in chat) · scripts/test-backend.mjs exercises all 89 contract endpoints against
   the running server, so every run left its own rows in the live store: ~112 runs since 17 Sep filled the acceptance, handover,
   action, outcome, verification and ingest collections with test rows, reset the local provider-quota counter each time and wrote
   a 30-50 MB backup file. A second server with its own store is not workable on this install (many modules read data\ directly and
   its background jobs would write the same files), so the test cleans up after itself instead. This removes ONLY rows made by the
   test identities (the old dev token and the issue-token.mjs test actors), the rows that hang off them (records, skill, quality
   evaluations and forecast-log lines of their runs) and the test schedule/worker; it puts back the quota counts a test reset took
   away and moves the test's backup files to D:\NIGRAAN\_admin\test_trash (moved, never deleted). The audit chain is never touched
   (append-only and hash-linked). With backup: true the database file is copied first. */
import { existsSync, mkdirSync, renameSync, copyFileSync } from 'node:fs';
import { join, basename } from 'node:path';

export const TEST_ACTORS = new Set(['dev-admin', 'test-admin', 'operator1', 'sci-reviewer', 'viewer1', 'ops-approver', 'supervisor1', 'claude-test']);
const ACTOR_FIELDS = ['actor_id', 'created_by', 'recorded_by', 'actorId', 'requested_by', 'createdBy'];
const isTest = (r) => ACTOR_FIELDS.some((f) => r && r[f] != null && TEST_ACTORS.has(String(r[f])));
const BY_ACTOR = ['actions', 'outcomes', 'verificationRuns', 'experiments', 'accessDecisions', 'migrationPlans', 'acceptanceRuns', 'backups',
  'restoreTests', 'failoverTests', 'signoffs', 'goNoGo', 'attestations', 'dossiers', 'releaseDecisions', 'idempotency'];

export async function cleanTestRecords(store, { root, dryRun = false, backup = false } = {}) {
  const all = (n) => store.all(n) || [];
  const out = { at: new Date().toISOString(), dryRun, removed: {}, quotaRestored: [], backupFilesMoved: [], dbCopy: null, untouched: ['audit (append-only, hash-linked)'] };
  const runIds = new Set(all('runs').filter(isTest).map((r) => r.run_id));
  const jobIds = new Set(all('jobs').filter((j) => isTest(j) || runIds.has(j.run_id)).map((j) => j.job_id));
  const verIds = new Set(all('verificationRuns').filter(isTest).map((v) => v.runId));
  const calcIds = new Set(all('assessments').filter((a) => (a.inputs && a.inputs.asset && a.inputs.asset.name === 'Test warehouse') || TEST_ACTORS.has(String(a.computedBy || ''))).map((a) => a.calculationId));
  const plan = [
    ['runs', (r) => runIds.has(r.run_id)],
    ['jobs', (j) => jobIds.has(j.job_id)],
    ['records', (r) => runIds.has(r.runId)],
    ['forecastLog', (r) => runIds.has(r.runId)],
    ['workerEvents', (e) => isTest(e) || runIds.has(e.run_id) || jobIds.has(e.job_id)],
    ['evaluations', (e) => runIds.has(e.run_id)],
    ['alerts', (a) => !!(a.details && jobIds.has(a.details.job_id))],
    ['schedules', (s) => isTest(s) || s.name === 'test schedule'],
    ['workers', (w) => w.worker_id === 'test-worker'],
    ['assessments', (a) => calcIds.has(a.calculationId)],
    ['explanations', (x) => (x.sourceReferences || []).some((s) => s && s.type === 'evidence' && calcIds.has(s.id))],
    ['skill', (s) => verIds.has(s.runId)],
    ...BY_ACTOR.map((n) => [n, isTest]),
    ['quotaResets', isTest],
  ];
  for (const [name, pred] of plan) { const n = all(name).filter(pred).length; if (n) out.removed[name] = n; }
  out.total = Object.values(out.removed).reduce((a, b) => a + b, 0);
  const resets = all('quotaResets').filter(isTest);
  for (const q of resets) {
    const w = all('quotaWindows').find((x) => x.providerId === q.provider_id && x.day === q.window);
    if (w && q.before) out.quotaRestored.push({ provider: q.provider_id, day: q.window, added: q.before });
  }
  const tests = all('backups').filter(isTest).map((b) => (b.file ? join(root, b.file) : null)).filter((f) => f && existsSync(f));
  out.backupFilesMoved = tests.map((f) => basename(f));
  if (dryRun || !out.total) return out;
  if (backup) { const f = store.file + '.' + new Date().toISOString().replace(/[:.]/g, '-') + '.pre-testclean.bak'; store.flushNow && store.flushNow(); copyFileSync(store.file, f); out.dbCopy = f; }
  if (resets.length) {
    const W = store.allForWrite('quotaWindows');
    for (const q of resets) { const w = W.find((x) => x.providerId === q.provider_id && x.day === q.window); if (!w || !q.before) continue;
      for (const [k, v] of Object.entries(q.before)) if (Number.isFinite(Number(v))) w[k] = (Number(w[k]) || 0) + Number(v); }
  }
  const trash = join(root, '..', '..', '_admin', 'test_trash', 'backups');
  for (const f of tests) { try { mkdirSync(trash, { recursive: true }); renameSync(f, join(trash, basename(f))); } catch (e) { out.backupFilesMoved.push('NOT MOVED ' + basename(f) + ': ' + e.message); } }
  for (const [name, pred] of plan) if (out.removed[name]) await store.removeWhere(name, pred);
  await store.save();
  out.after = Object.fromEntries(Object.keys(out.removed).map((n) => [n, all(n).length]));
  return out;
}
