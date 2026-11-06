/* Clear handover records created by scripts/test-backend.mjs.
 *
 * WHY THIS EXISTS. test-backend.mjs asserts that
 * GET /api/v1/handover/release-decision/latest returns 404 on a store with no
 * decision, and then creates one two lines later. Every run therefore leaves a
 * record behind, and every run after the first reports that assertion as the
 * suite's one failure. The failure is real but it is about the STORE, not the
 * code, and a handover package should not ship with a store full of a test's
 * own dossiers and hold decisions.
 *
 * This removes only the records the test creates:
 *   - attestations, dossiers and release decisions (the handover store);
 *   - schedules named "test schedule", which test-backend.mjs creates one of per
 *     run and never deletes, so a deployment accumulates one an hour forever;
 *   - ingest runs left in status "running", which block every later ingest,
 *     because runNationalIngest refuses while one is in flight and a run killed
 *     mid-flight is never marked finished.
 * It does not touch assessments, evidence, the default schedule, completed runs
 * or any client data. It prints what it would remove and refuses without --yes.
 *
 *   node scripts/reset-test-state.mjs          (dry run: says what it would do)
 *   node scripts/reset-test-state.mjs --yes    (does it, after writing a backup)
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB = join(ROOT, 'data', 'nigraan-db.json');
const GO = process.argv.includes('--yes');
const TARGETS = ['attestations', 'dossiers', 'releaseDecisions'];
/* collections cleaned selectively rather than emptied */
const PRUNE = [
  { name: 'schedules', keep: (r) => String(r.name || '') !== 'test schedule', what: 'schedules named "test schedule"' },
  { name: 'runs', keep: (r) => r.status !== 'running', what: 'ingest runs stuck in "running"' },
];

if (!existsSync(DB)) { console.error('no database at ' + DB); process.exit(1); }
const db = JSON.parse(readFileSync(DB, 'utf8'));
const c = db.collections || {};
let total = 0;
for (const k of TARGETS) {
  const n = Array.isArray(c[k]) ? c[k].length : 0;
  total += n;
  console.log('  ' + String(n).padStart(5) + '  ' + k);
}
for (const p of PRUNE) {
  const arr = Array.isArray(c[p.name]) ? c[p.name] : [];
  const n = arr.length - arr.filter(p.keep).length;
  total += n;
  console.log('  ' + String(n).padStart(5) + '  ' + p.what);
}
if (!total) { console.log('\nNothing to clear.'); process.exit(0); }
if (!GO) {
  console.log('\n' + total + ' record(s) would be removed. Re-run with --yes to do it.');
  console.log('A timestamped backup of the database is written first.');
  process.exit(0);
}
const bak = DB + '.' + new Date().toISOString().replace(/[:.]/g, '-') + '.bak';
copyFileSync(DB, bak);
for (const k of TARGETS) if (Array.isArray(c[k])) c[k] = [];
for (const p of PRUNE) if (Array.isArray(c[p.name])) c[p.name] = c[p.name].filter(p.keep);
writeFileSync(DB, JSON.stringify(db));
console.log('\nCleared ' + total + ' record(s). Backup: ' + bak);
console.log('Restart the server so it reloads the store, then re-run scripts/test-backend.mjs.');
