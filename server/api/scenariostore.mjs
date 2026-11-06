/* == v91.17.283.34 · SCENARIO LAB · THE RESULT STORE ====================================================================================
   Every Scenario Lab answer (weather scenario, site change) is kept by its id: the side-by-side compare and the report export read the
   SAME server result the screen showed, never a copy the page sends back. Kept in memory (last 400) and in data/scenario-results/<id>.json
   (written once, atomically; the folder holds answers only, no request data beyond the scenario inputs). Ids: 'wx' (weather) or 'sc'
   (site change) + 24 hex of a sha256 over the inputs and the served values. */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
export const ID_RE = /^(wx|sc)[0-9a-f]{24}$/;
const STORES = new Map();
export function scenarioStore(dataDir) {
  if (STORES.has(dataDir)) return STORES.get(dataDir);
  const M = new Map(), MAX = 400, dir = join(dataDir, 'scenario-results');
  function keep(res) { if (!res || !ID_RE.test(String(res.id || ''))) return; M.set(res.id, res); if (M.size > MAX) M.delete(M.keys().next().value);
    try { mkdirSync(dir, { recursive: true }); const f = join(dir, res.id + '.json'); if (!existsSync(f)) { writeFileSync(f + '.part', JSON.stringify(res)); renameSync(f + '.part', f); } } catch (_) {} }
  function get(id) { if (!ID_RE.test(String(id || ''))) return null; if (M.has(id)) return M.get(id);
    try { const r = JSON.parse(readFileSync(join(dir, id + '.json'), 'utf8')); M.set(id, r); return r; } catch (_) { return null; } }
  const api = { keep, get, size: () => M.size }; STORES.set(dataDir, api); return api;
}
