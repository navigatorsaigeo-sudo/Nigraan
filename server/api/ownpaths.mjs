/* ══ v91.17.283.28 · NIGRAAN'S OWN FEEDS: ONE FOLDER, LAMHA'S RELATIVE LAYOUT (owner decision 28 Oct 2026 11:10 PKT) ══════════════
   NIGRAAN is fully independent of LAMHA: no live data dependency. Every feed LAMHA used to supply is now fetched by NIGRAAN itself and
   written under ONE folder of its own, the "own folder" D:\NIGRAAN\nig\own (env NIGRAAN_OWN_DIR; default <nigraan-local>\..\own),
   in the same relative layout LAMHA used, so a reader only changes its base folder:
     data/mach/db/obs_YYYYMMDD.csv, last_sync.txt, latest_status.json, sync_log.txt   MACH database (station-lake/scripts/mach_db_sync.py --live)
     data/obs_other/metar_live/metar_YYYYMM.csv, airports.csv                           METAR (station-lake/scripts/metar_sync.py)
     data/pmd/ews_live/...                                                               EWS (station-lake/scripts/ews_sync.py, mode own)
     data/pmd/aegis_gb_station_catalog.csv                                               EWS station catalogue (history copy + own elements)
     data/radar/{png,index,geotiff,netcdf}/..., pull_log.txt                            radar (station-lake/scripts/radar_pull.py)
   The one-time history copy (_admin\independence\COPY_HISTORY_ONCE.ps1) fills this folder from D:\LAMHA once; nothing reads D:\LAMHA
   after it. Partner data (PMD origin): internal only, never named or shown to a customer. */
import { join, resolve } from 'node:path';

/* root: the nigraan-local folder */
export function ownDir(root) { return resolve(process.env.NIGRAAN_OWN_DIR || join(root, '..', 'own')); }
export function ownPath(root, ...rel) { return join(ownDir(root), ...rel); }
export const OWN = {
  machDb: ['data', 'mach', 'db'],
  metar: ['data', 'obs_other', 'metar_live'],
  ews: ['data', 'pmd', 'ews_live'],
  ewsCatalogue: ['data', 'pmd', 'aegis_gb_station_catalog.csv'],
  radar: ['data', 'radar'],
};
