// C12 · the urban-heat cell map is withheld in all of Pakistan (no skill on held-out stations in the plains either: data/urban-heat-c12.json);
// point, spread, map cells and tehsil roll-up say "not assessed" with the reason; the AI facts carry it. No server, no network.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { imp, src, ok, done, TREE } from './lib.mjs';
const { createUrbanHeat } = await imp('server/api/urbanheat.mjs');
const D = join(TREE, 'data'); let C = null; try { C = JSON.parse(readFileSync(join(D, 'urban-heat-c12.json'), 'utf8')); } catch (_) {}
ok(C && C.applied === true && C.evidence && C.evidence.stations === 11 && C.evidence.maeLayerC > C.evidence.maeNoDifferenceC && C.evidence.maeDifferenceCI[0] > 0, 'the decision file holds the evidence (11 stations, layer error above no-difference)', C && JSON.stringify(C.evidence).slice(0, 160));
const U = createUrbanHeat(null, D);
const lah = U.estimate(31.5204, 74.3587, { hoursFromSunset: 2 }), kar = U.estimate(24.8607, 67.0011, { hoursFromSunset: 2 });
for (const [n, e] of [['Lahore', lah], ['Karachi', kar]]) ok(e && e.ready && e.withheld === true && e.assessed === false && !e.heatIsland && /not assessed: the urban heat cell map showed no skill/.test(e.why || ''), 'C12: ' + n + ' point: not assessed with the reason, no heat-island figure', JSON.stringify(e).slice(0, 160));
const sp = U.spread(31.5204, 74.3587, 12); ok(sp && sp.withheld && sp.cells === 0, 'C12: the 12-km spread is withheld');
const cl = U.cellsIn(74.2, 31.4, 74.5, 31.7); ok(cl && cl.withheld && cl.cells.filter((x, i) => i % 3 === 2).every((v) => v === null), 'C12: map cells withheld (v91.17.283.49: the town cells are served as facts, their heat value null)');
const na = U.national(); ok(na && na.withheld && Object.keys(na.units || {}).length === 0, 'C12: no tehsil roll-up (no city-level figure)', JSON.stringify(na).slice(0, 120));
const ai = src('server/api/ai.mjs'); ok(/withheld: true, heatIsland: 'Not assessed: ' \+ e\.why/.test(ai), 'C12: the AI urban facts say Not assessed with the reason');
const OFF = createUrbanHeat(null, D, { nationalWithheld: false }); const lo = OFF.estimate(31.5204, 74.3587, { hoursFromSunset: 2 });
ok(lo && lo.ready && !lo.withheld, 'with the decision released (applied false) the layer answers again (analysis path)');
done('C12-URBANHEAT');
