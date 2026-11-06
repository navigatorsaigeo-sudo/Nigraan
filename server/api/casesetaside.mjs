/* ══ v91.17.283.44 (NIGRAAN 1.0.7.1) · TEST PROJECTS OFF THE CUSTOMER LIST ═══════════════════════════════════════════════════════════
   The Client Risk list "Client projects on this server" (GET /api/case/project) showed ~37 test projects: "HARNESS DEMO (not a client)"
   (scripts/harness.mjs casebook group 66, run against the live server 24-26 Sep), "DEMONSTRATION - Ravi Textile Mills / Indus Demo
   Industries ... (not a real client)" (the sample client saved to the casebook by browser test runs on the live page, 24-28 Sep), DR39
   (harness group 39), t205 and "D71 test" (scripts/tests71/data.test.mjs). Nothing is deleted here:
     - TEST_NS: a project id starting with "_test-" is the operator test namespace. listProjects() never lists it (casebook.mjs); a test
       that must store a project uses this prefix and sets it aside at its end.
     - setAside(): the rows of the chosen projects (projects, assetFields, interventions, caseSnapshots) are written to
       data/_to_delete/case-projects/set-aside-<UTC stamp>.json (atomic write, read back and counted) and only then removed from the
       store. restore(file) puts back every row whose project is not on the server again.
     - the fixed rule 'test-clutter' (isTestClutter) names only test projects by their exact test names; one demonstration project is kept:
       "Indus Demo Industries (Pvt) Ltd - DEMONSTRATION DATA" with id demo-indus (its second copy, saved again on 25 Sep, is set aside).
   POST /api/ops/case/set-aside?rule=test-clutter[&dryRun=1] or body { ids: ["_test-..."] } (ids outside the namespace are refused);
   POST /api/ops/case/restore?file=set-aside-....json. This computer only (loopback, no relay header, not the customer view). */
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { writeJsonAtomicSync } from './store.mjs';

export const TEST_NS = '_test-';
export const KEEP_DEMO = { projectId: 'demo-indus', clientName: 'Indus Demo Industries (Pvt) Ltd — DEMONSTRATION DATA' };
const CASE_COLS = ['projects', 'assetFields', 'interventions', 'caseSnapshots'];
const EXACT = new Set(['t205\u0000test', 'd71-names-test\u0000D71 test', 'PRJ-DR39\u0000DR39']);

export const isTestNs = (id) => String(id || '').startsWith(TEST_NS);
/* the rule: exact test names only; a real client project never matches */
export function isTestClutter(p, all) {
  const id = String(p.projectId || ''), name = String(p.clientName || '');
  if (isTestNs(id)) return true;
  if (/^harness-[a-z0-9]+$/.test(id) && name === 'HARNESS DEMO (not a client)') return true;
  if (/^DEMONSTRATION [—-] .*\(not a real client\)$/.test(name)) return true;
  if (EXACT.has(id + '\u0000' + name)) return true;
  if (name === KEEP_DEMO.clientName && id !== KEEP_DEMO.projectId && all.some((q) => q.projectId === KEEP_DEMO.projectId && q.clientName === KEEP_DEMO.clientName)) return true;
  if (!name.trim() && !(Number(p.assets) > 0) && /^PRJ-[A-Z0-9]+-[A-Z0-9]+$/.test(id)) return true;   /* an empty page save: no name, no site */
  return false;
}

export function createCaseSetAside(store, dataDir) {
  const dir = join(dataDir, '_to_delete', 'case-projects');
  const all = (n) => store.all(n) || [];
  function plan({ rule, ids }) {
    const P = all('projects');
    if (rule === 'test-clutter') return P.filter((p) => isTestClutter(p, P)).map((p) => p.projectId);
    if (Array.isArray(ids)) { const bad = ids.filter((x) => !isTestNs(x)); if (bad.length) throw Object.assign(new Error('only ids in the test namespace (' + TEST_NS + '...) can be set aside by id: ' + bad.slice(0, 5).join(', ')), { status: 422 });
      const want = new Set(ids.map(String)); return P.filter((p) => want.has(p.projectId)).map((p) => p.projectId); }
    throw Object.assign(new Error('name rule=test-clutter or ids'), { status: 422 });
  }
  async function setAside({ rule, ids, dryRun = false, why = '' } = {}) {
    const pick = new Set(plan({ rule, ids }));
    const rows = Object.fromEntries(CASE_COLS.map((c) => [c, all(c).filter((r) => pick.has(r.projectId))]));
    const out = { at: new Date().toISOString(), rule: rule || null, dryRun: !!dryRun, projects: rows.projects.map((p) => ({ projectId: p.projectId, clientName: p.clientName, assets: p.assets, savedAt: p.savedAt })),
      rows: Object.fromEntries(CASE_COLS.map((c) => [c, rows[c].length])), kept: KEEP_DEMO, file: null };
    if (dryRun || !pick.size) return out;
    mkdirSync(dir, { recursive: true });
    const f = join(dir, 'set-aside-' + out.at.replace(/[:.]/g, '-') + '.json');
    writeJsonAtomicSync(f, { kind: 'nigraan-case-set-aside', version: 1, at: out.at, rule: rule || null, why: String(why || '').slice(0, 300), projectIds: [...pick], collections: rows });
    const back = JSON.parse(readFileSync(f, 'utf8'));   /* read back and counted before anything leaves the store */
    for (const c of CASE_COLS) if (!back.collections || !Array.isArray(back.collections[c]) || back.collections[c].length !== rows[c].length) throw new Error('the set-aside file did not read back complete (' + c + '); nothing was removed');
    out.file = f; out.removed = {};
    for (const c of CASE_COLS) out.removed[c] = rows[c].length ? await store.removeWhere(c, (r) => pick.has(r.projectId)) : 0;
    out.after = { projects: all('projects').length };
    return out;
  }
  async function restore(file) {
    const name = basename(String(file || '')); if (!/^set-aside-[0-9TZ-]+\.json$/.test(name)) throw Object.assign(new Error('name a set-aside file in ' + dir), { status: 422 });
    const f = join(dir, name); if (!existsSync(f)) throw Object.assign(new Error('no ' + name + ' in ' + dir), { status: 404 });
    const J = JSON.parse(readFileSync(f, 'utf8')); const on = new Set(all('projects').map((p) => p.projectId));
    const back = (J.projectIds || []).filter((id) => !on.has(id)); const B = new Set(back); const out = { file: name, restored: back, rows: {} };
    for (const c of CASE_COLS) { const r = ((J.collections || {})[c] || []).filter((x) => B.has(x.projectId)); out.rows[c] = r.length; if (r.length) await store.insertMany(c, r); }
    return out;
  }
  const files = () => { try { return readdirSync(dir).filter((x) => /^set-aside-.*\.json$/.test(x)).sort(); } catch (_) { return []; } };
  return { setAside, restore, files, dir };
}
