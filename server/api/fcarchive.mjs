/* == v91.17.283.33 · FORECAST ARCHIVE (fcArchive): the daily harvest of the global models' previous runs and the 00 UTC ensembles at the
   truth stations (station-lake/scripts/fc_archive_harvest.py, pyjob fcArchive, daily). Nothing served changes: this module only reads the
   harvester's own status file for the feed-health entry and the operator status endpoint GET /api/ops/fcarchive. Internal, never shown to
   customers; the key is never read here. */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
export function fcArchiveDir(root) { return join(process.env.NIGRAAN_STATION_LAKE_DIR || process.env.NIGRAAN_STATION_LAKE || join(root, '..', 'station-lake'), 'archive', 'fc_archive'); }
export function fcArchiveStatus(root) {
  const dir = fcArchiveDir(root), f = join(dir, 'status.json');
  if (!existsSync(f)) return { ok: true, ready: false, why: 'no harvest has run yet (pyjob fcArchive, daily)', dir };
  let s = null; try { s = JSON.parse(readFileSync(f, 'utf8')); } catch (e) { return { ok: false, ready: false, why: 'status file unreadable: ' + String(e.message).slice(0, 120), dir }; }
  const M = s.models || {}, models = Object.entries(M).map(([id, m]) => ({ id, kind: m.kind || null, rows: m.rows ?? null, from: m.from || m.first || null, to: m.to || m.last || null, archiveStart: m.archiveStart || null, runs: m.runs ?? null }));
  return { ok: true, ready: true, dir, updated: s.updated || null, calls: s.calls ?? null, callsNote: 'information only (counted, never a limit)', points: s.points || null,
    stoppedOn429: s.stoppedOn429 || null, rejected: s.rejected || {}, models, nModels: models.length };
}
/* the feed-health entry (agents.mjs serverFeeds): a daily job; a 429 stop is the last error until the next good run */
export function fcArchiveFeed(root) {
  const S = fcArchiveStatus(root);
  return { label: 'Forecast archive (previous runs and ensembles)', configured: true, lastPoll: S.ready && !S.stoppedOn429 ? S.updated : null,
    lastError: !S.ok ? S.why : S.stoppedOn429 ? 'stopped on HTTP 429 at ' + S.stoppedOn429.at + ' (resumes on the next run)' : null,
    everyMs: 24 * 3600e3, everyWhat: 'daily (pyjob fcArchive)', models: S.nModels || 0, internal: true };
}
