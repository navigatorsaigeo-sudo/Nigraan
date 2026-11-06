/* == EWS OWN FETCH (28 Oct 2026) . WHERE THE EWS FILES ARE ==========================================================================
   v91.17.283.28 · INDEPENDENCE FROM LAMHA (owner, 28 Oct 2026 11:10 PKT): NIGRAAN always fetches the EWS readings itself
   (station-lake/scripts/ews_sync.py, mode own, every 30 min; data/ews-source.json). The modes lamha and failover are retired (read as
   own), the two copy jobs that took the EWS files from LAMHA (copies.mjs lamha_ews, scripts/agents/lamha_copy.mjs) are retired, and
   the readers read NIGRAAN's own store directly:
     root    the own folder (server/api/ownpaths.mjs: D:\NIGRAAN\nig\own, env NIGRAAN_OWN_DIR; NIGRAAN_EWS_OWN_DIR overrides) whose
             data/pmd/ews_live holds raw/ews_raw_YYYYMMDD.csv.gz, raw_hydro/, ews_live_hourly.parquet, ews_hydro_hourly.parquet,
             aegis_elements.csv, sync_status.json, sync_log.txt (LAMHA's layout, so a reader only changes its base folder)
   The fetch job's decision (data/ews-source-state.json) is still shown (decidedAt, why). Nothing under D:\LAMHA is read or written.
   Partner data: internal only. */
import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ownDir } from './ownpaths.mjs';

const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch (_) { return null; } };
const RETIRED = new Set(['lamha', 'failover']);

/* root: nigraan-local; dataDir: its data folder; opts.now (ms) for tests */
export function ewsSource(root, dataDir, opts = {}) {
  const now = opts.now != null ? opts.now : Date.now();
  const cfg = readJson(join(dataDir, 'ews-source.json')) || {};
  const ownRoot = resolve(process.env.NIGRAAN_EWS_OWN_DIR || ownDir(root));
  const asked = cfg.mode || 'own';
  const st = readJson(join(dataDir, 'ews-source-state.json'));
  const live = join(ownRoot, 'data', 'pmd', 'ews_live');
  const sync = readJson(join(live, 'sync_status.json'));
  let syncAgeMin = null; try { syncAgeMin = Math.round((now - statSync(join(live, 'sync_status.json')).mtimeMs) / 60e3); } catch (_) {}
  return { mode: 'own', active: 'own', root: ownRoot, ownRoot, live,
    why: RETIRED.has(asked) ? 'mode ' + asked + ' is retired (v91.17.283.28, NIGRAAN independent of LAMHA): own' : 'mode own: NIGRAAN fetches the EWS readings itself',
    decidedAt: st ? st.decidedAt || null : null, since: st ? st.since || null : null,
    lastSync: sync ? { syncPkt: sync.sync_pkt || null, portalRequests: sync.portal_requests ?? null, requests: sync.requests ?? null, newReadings: sync.new_readings ?? null, ageMin: syncAgeMin } : null };
}
