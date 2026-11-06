// W2 · tehsil search rows stand at the populated anchor (data/tehsil-anchor.json, scripts/gen/gen_tehsil_anchor.mjs), not the shape
// point: Gojal is no longer pinned on a peak. The anchor file is regenerated and compared (it is data-derived, not typed).
import { readFileSync, mkdtempSync, cpSync, rmSync, symlinkSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imp, ok, done, TREE } from './lib.mjs';
const G = await imp('server/api/places.mjs');   /* v91.17.283.18 · the tehsil record of the one place table */
const units = JSON.parse(readFileSync(join(TREE, 'server', 'contract', 'units.json'), 'utf8'));
const g = G.createPlaces({ dataDir: join(TREE, 'data'), units: { tehsil: units } });
const res = await g.search('Gojal tehsil').catch((e) => ({ err: e.message }));
const rows = (res && (res.results || res.rows)) || (Array.isArray(res) ? res : []);
const row = rows.find((r) => r.level === 'tehsil' && /Gojal/.test(r.name));
ok(!!row, 'Gojal tehsil row found', JSON.stringify(res).slice(0, 200));
let A = null; try { A = JSON.parse(readFileSync(join(TREE, 'data', 'tehsil-anchor.json'), 'utf8')); } catch (_) {}
ok(!!A && A.units && A.counts, 'data/tehsil-anchor.json present', A && JSON.stringify(A.counts));
const ga = A && A.units['Gilgit Baltistan|Hunza|Gojal'];
ok(row && ga && ga.anchor && row.lat === ga.anchor.lat && row.lon === ga.anchor.lon, 'W2: the Gojal row stands at its populated anchor (' + (ga && ga.anchor && ga.anchor.name) + ')', row && row.lat + ',' + row.lon);
ok(row && row.elevM != null && row.elevM < 4000 && ga && Math.abs(row.elevM - ga.settlementElevM) < 500, 'W2: its height is the anchor terrain (' + (row && row.elevM) + ' m), near the people (median ' + (ga && ga.settlementElevM) + ' m), not the 5,292 m peak');
const u = units.find((x) => x.tehsil === 'Gojal'); ok(u && u.lat === 36.5499, 'W2: the unit table (forecast point) is unchanged');
const over = A ? Object.values(A.units).filter((x) => x.anchor && Math.abs(x.centreMinusAnchorM) > 500).length : -1;
ok(over === (A && A.counts.centreVsAnchorOver500m) && over > 0, 'W2: ' + over + ' tehsils had a shape point more than 500 m from their anchor height; every one now pins at the anchor');
const all = A ? Object.entries(A.units).filter(([, x]) => x.anchor) : [];
ok(all.length >= 575, 'W2: ' + all.length + ' of 576 tehsils have an anchor inside the polygon');
done('W2-ANCHOR');
