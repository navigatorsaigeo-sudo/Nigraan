/* v91.17.283.13 · the server modules this package changes, instantiated on a data folder without starting the server (no network:
   provider stub not configured). Used by the served-values diff and the unit tests. */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUnitIndex } from '../../server/api/national.mjs';
import { createHand } from '../../server/api/hand.mjs';
import { createLandslideOdds } from '../../server/api/landslideodds.mjs';
import { createHazSci } from '../../server/api/hazsci.mjs';
import { createFlood } from '../../server/api/flood.mjs';
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export function makeApp(dataDir, { withOutlook = true, withGlof = true } = {}) {
  let settle = null; try { settle = JSON.parse(readFileSync(join(dataDir, 'settlement-elevation.json'), 'utf8')); } catch (_) {}
  const units = buildUnitIndex(JSON.parse(readFileSync(join(ROOT, 'server', 'contract', 'units.json'), 'utf8')), settle);
  const app = { dataDir, units, provider: { configured: () => false, call: async () => { throw new Error('offline'); } }, store: { filter: () => [] } };
  app.contractDir = join(ROOT, 'server', 'contract');
  process.env.MACH_OFFLINE = '1'; app.flood = createFlood(app, dataDir);   /* no schedule: MACH_OFFLINE */
  app.hand = createHand(dataDir, units);
  app.landslideOdds = createLandslideOdds(app, dataDir);
  if (withOutlook) { const O = (() => { try { return JSON.parse(readFileSync(join(dataDir, 'outlook.json'), 'utf8')).ensemble; } catch (_) { return null; } })();
    app.outlook = { dayRows: () => O && O.units ? { at: O.at, model: O.model, members: O.members, days: O.days, units: O.units } : null }; }
  app.hazSci = createHazSci(app, { dataDir });
  return app;
}
