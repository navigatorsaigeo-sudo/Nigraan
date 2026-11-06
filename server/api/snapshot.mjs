/* ══ v91.17.207 · ANALYSIS SNAPSHOT (audit P03, phase B) ═════════════════════════════════════════════════════════════════════════
   The chain identity (provenance.chain: one hash over all server code, every table and, from v207, the content of every feature grid)
   says WHICH CODE AND TABLES made a number. It does not say which forecast they were run on. The snapshot adds the inputs:
     parts = { chain: chain identity, build, inputs: { ensembleRun, levelsReport, nationalRun, liveHour } }
     id    = 'S-' + the first 12 hex of sha256(parts)
   It changes when code or a table changes, when a new ensemble run, levels report or national run arrives, and each hour (the live
   station layer moves the served values hourly). Every /api response carries it (x-agn-snapshot); reports and the AI print it. Each new
   snapshot is appended to data/archive/snapshots/snapshots_YYYY-MM.jsonl, so an id printed on a report resolves later:
   GET /api/snapshot (current) · GET /api/snapshot?id=S-... (every month held, v91.17.283.8) · ?report=<report id>. */
import { readFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { appendLineSync } from './store.mjs';   /* v91.17.283 · WS3 · a torn last line never swallows the next snapshot */
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export function createSnapshot(app, dataDir, opts = {}) {
  const adir = join(dataDir, 'archive', 'snapshots'); try { mkdirSync(adir, { recursive: true }); } catch (_) {}
  const safe = (f) => { try { return f(); } catch (_) { return null; } };
  function inputs() {
    const ens = safe(() => (app.outlook.status().ensemble || {}).at);
    const lv = safe(() => { const L = app.engine.latest(); return L ? (L.at || L.received || null) : null; });
    const nat = safe(() => { const R = app.store.filter('runs', r => r.status === 'complete' && r.unit_level === 'tehsil' && r.operational !== false && !r.development_limited).sort((a, b) => String(b.completed_at || '').localeCompare(String(a.completed_at || '')))[0]; return R ? R.run_id : null; });
    return { ensembleRun: ens || null, levelsReport: lv || null, nationalRun: nat || null, liveHour: new Date(Math.floor(Date.now() / 3600e3) * 3600e3).toISOString().slice(0, 13) + 'Z' };
  }
  let cur = null, at = 0, lastId = null;
  function current() {
    if (cur && Date.now() - at < (cur.pending ? 5e3 : 60e3)) return cur;
    const ch = safe(() => app.provenance.chain()) || {};
    const parts = { chain: ch.id || null, build: ch.app || opts.build || null, inputs: inputs() };
    const id = 'S-' + createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 12);
    cur = { id, at: new Date().toISOString(), parts, pending: !ch.id }; at = Date.now();
    /* archived once the chain identity is known (the first minute after a start it is being computed) */
    if (ch.id && id !== lastId) { lastId = id; try { appendLineSync(join(adir, 'snapshots_' + cur.at.slice(0, 7) + '.jsonl'), JSON.stringify(cur)); } catch (_) {} }
    return cur;
  }
  /* v91.17.283.8 · audit 16 · the lookup covers the FULL retention window: every snapshots_YYYY-MM.jsonl held (reports stay in the library
     365 days and archived reports are kept), through an index id -> month file built once per file and extended as the file grows. A report
     records the snapshot id it was issued under (reports.mjs entry.snapshot), so lookupReport(reportId) resolves it too. */
  const IDX = new Map(), SEEN = new Map();   /* id -> file; file -> bytes indexed */
  function indexFiles() { let names = []; try { names = readdirSync(adir).filter((n) => /^snapshots_\d{4}-\d{2}\.jsonl$/.test(n)).sort(); } catch (_) { return; }
    for (const n of names) { const f = join(adir, n); let size = 0; try { size = statSync(f).size; } catch (_) { continue; } if (SEEN.get(f) === size) continue;
      let t = ''; try { t = readFileSync(f, 'utf8'); } catch (_) { continue; } for (const l of t.split('\n')) { const m = /"id"\s*:\s*"(S-[0-9a-f]{12})"/.exec(l); if (m) IDX.set(m[1], f); } SEEN.set(f, size); } }
  function lookup(id) {
    if (!/^S-[0-9a-f]{12}$/.test(String(id || ''))) return null;
    if (cur && cur.id === id) return cur;
    indexFiles(); const f = IDX.get(id); if (!f || !existsSync(f)) return null;
    const lines = readFileSync(f, 'utf8').split('\n'); for (let i = lines.length - 1; i >= 0; i--) if (lines[i].includes('"' + id + '"')) { try { return JSON.parse(lines[i]); } catch (_) {} }
    return null;
  }
  function lookupReport(reportId) { try { const R = app.reports && app.reports.entry ? app.reports.entry(reportId) : null; if (!R) return { found: false, why: 'no report with this id in the library or its archive' };
      if (!R.snapshot) return { found: false, report: reportId, why: 'this report was issued before v91.17.283.8 and recorded no snapshot id' };
      const s = lookup(R.snapshot); return s ? { found: true, report: reportId, snapshot: s } : { found: false, report: reportId, snapshotId: R.snapshot, why: 'the snapshot archive holds no line for ' + R.snapshot }; } catch (e) { return { found: false, why: e.message }; } }
  return { current, id: () => current().id, lookup, lookupReport };
}
