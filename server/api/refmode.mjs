/* ══ v91.17.71 · DATA USE vs NAMING: two separate switches ═══════════════════════════════════════════════════════════
   CEO decision, 25 Sep 2026 (replaces the v91.17.70 "option 2" gate): the station, lake-inventory and river-limit data
   AGN receives under its data-sharing arrangements is USED in customer outputs again; the suppliers are NOT NAMED in
   the product. They are credited generically with the wording in data/source-labels.json.

   stationData()   default ON.  Station-fitted corrections, station-anchored normals, the full lake inventory, bulletins
                   and river limits feed customer values. NIGRAAN_STATION_DATA=0 turns them off (open-data-only path,
                   kept for testing and for any deployment whose arrangement does not cover commercial use).
   internalNames() default OFF. Supplier names, raw station readings and station-measured skill figures are shown only
                   with NIGRAAN_INTERNAL_REF=1 (internal QA), never to customers.
   label(key)      the generic credit line for a source family, read from data/source-labels.json (no hardcoded text).

   Honesty rule kept in code: a value derived from these networks is tier B (station-calibrated), never "MACH-verified";
   the MACH badge stays reserved for AGN's own stations. */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LABELS_FILE = join(process.env.NIGRAAN_DATA_DIR || join(HERE, '..', '..', 'data'), 'source-labels.json');

export const stationData = () => process.env.NIGRAAN_STATION_DATA !== '0';
export const internalNames = () => process.env.NIGRAAN_INTERNAL_REF === '1';

let L = null, Lstamp = 0;
function labels() {
  const now = Date.now();
  if (L && now - Lstamp < 60000) return L;
  try { L = existsSync(LABELS_FILE) ? JSON.parse(readFileSync(LABELS_FILE, 'utf8')) : {}; } catch { L = L || {}; }
  Lstamp = now; return L;
}
export function label(key) {
  const t = (labels().labels || {})[key];
  return t || (labels().labels || {}).network || 'partner observation networks';
}
export function mode() {
  return { stationData: stationData(), internalNames: internalNames(), labels: labels().version || null };
}

/* v91.17.94 · CEO 30 Sep: SUPARCO's published Space4Climate bulletins are credited by name (data/source-labels.json namedPublic) */
export function namedPublic(who) { return internalNames() || ((labels().namedPublic || []).includes(who)); }
