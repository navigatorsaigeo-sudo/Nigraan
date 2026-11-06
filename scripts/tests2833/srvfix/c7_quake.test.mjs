// C7 · quake: the Allen 2012 equation guard is on hypocentral distance (Rhypo <= 300 km); the Fa >= 1.2 floor only for the DEFAULT site
// class D, not for a class D given from a site investigation. Uses the laptop rule (scripts/tests280/fixtures; the cloud data file is a stub).
import { mkdtempSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imp, ok, done, TREE } from './lib.mjs';
const Q = await imp('server/api/quake.mjs'), SM = await imp('server/api/seismic.mjs');
const dir = mkdtempSync(join(tmpdir(), 'c7-'));
copyFileSync(join(TREE, 'scripts', 'tests280', 'fixtures', 'seismic-felt-rule.json'), join(dir, 'seismic-felt-rule.json'));
/* one 0.1-degree square tehsil at 30N 70E */
const sq = [[70, 30], [70.1, 30], [70.1, 30.1], [70, 30.1], [70, 30]];
writeFileSync(join(dir, 'pk-tehsils.json'), JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { uid: 't1', tehsil: 'T', district: 'D', province: 'Punjab' }, geometry: { type: 'Polygon', coordinates: [sq] } }] }));
const q = Q.createQuake({ dataDir: dir }, dir, { timers: false });
const R = q.rule(); const lim = R.ipe.validity.distanceKmMax;
/* epicentre 250 km east of the square's east edge along the parallel */
const kmPerDeg = 111.195 * Math.cos(30.05 * Math.PI / 180), lonE = 70.1 + 250 / kmPerDeg;
const deep = q.flagsFor({ lon: lonE, lat: 30.05, depthKm: 200, mag: 7.0 }, null);
const shallow = q.flagsFor({ lon: lonE, lat: 30.05, depthKm: 10, mag: 7.0 }, null);
const rh = Math.sqrt(250 * 250 + 200 * 200);
ok(rh > lim, 'set-up: Rhypo ' + Math.round(rh) + ' km is beyond the equation range ' + lim + ' km while the epicentral distance (250 km) is inside');
ok(deep.length === 0, 'C7: deep event, Rhypo > 300 km: no equation flag', JSON.stringify(deep));
ok(shallow.length === 0 || shallow.every((f) => f.source === 'equation'), 'C7: shallow event inside the range is still assessed by the equation (if felt)', JSON.stringify(shallow));
const near = q.flagsFor({ lon: 70.05, lat: 30.05, depthKm: 10, mag: 6.5 }, null);
ok(near.length === 1 && near[0].source === 'equation', 'C7: an event inside the range flags as before');
const dDef = SM.designValues(1.6, 0.6, null), dD = SM.designValues(1.6, 0.6, 'D');
ok(dDef.fa === 1.2 && dDef.notes.some((n) => /Default Site Class D: Fa not less than 1.2/.test(n)), 'C7: no site class -> default D with the Fa 1.2 floor', JSON.stringify(dDef.fa));
ok(dD.fa != null && dD.fa < 1.2 && !dD.notes.some((n) => /Default Site Class D/.test(n)), 'C7: explicit class D -> the table Fa (' + dD.fa + '), no default note');
rmSync(dir, { recursive: true, force: true });
done('C7-QUAKE');
