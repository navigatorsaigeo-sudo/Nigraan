/* SCI item 4: the served urban heat layer (night maximum, calm clear) at each station. usage: node c12_layer_at.mjs <srv> <stations.json> */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const [SRV, F] = process.argv.slice(2);
const { createUrbanHeat } = await import(join(SRV, 'server/api/urbanheat.mjs'));
const U = createUrbanHeat({ dataDir: join(SRV, 'data') }, join(SRV, 'data'));
const out = {};
for (const s of JSON.parse(readFileSync(F, 'utf8'))) { let e = null; try { e = U.estimate(s.lat, s.lon, { windMs: 1, cloudFrac: 0, hoursFromSunset: 2 }); } catch (x) { e = { error: String(x) }; }
  out[s.station] = { urban: !!(e && e.urban), withheld: !!(e && e.withheld), maxC: e && e.heatIsland ? e.heatIsland.maxC : null, deltaC: e && e.heatIsland ? e.heatIsland.deltaC : null }; }
console.log(JSON.stringify(out));
