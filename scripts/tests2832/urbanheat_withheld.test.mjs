// v91.17.283.2 - urban heat layer at Gilgit (WS5: wrong sign at MACH 105/108). Checks: (1) the cause is not an inverted difference or a
// unit error: the layer's own value at both stations is reproduced from its inputs, as documented; (2) the layer is withheld in the
// Gilgit-Baltistan / Chitral mountain zone with the stated reason (point, map cells, spread, tehsil roll-up); (3) nothing changes in
// the plains (Rawalpindi and Lahore calibration cells, Islamabad map cells); (4) the reason and evidence are in the data files.
// usage: node scripts/tests2832/urbanheat_withheld.test.mjs     (no server, no network)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + d : '')); } };
const { createUrbanHeat } = await import(pathToFileURL(join(APP, 'server', 'api', 'urbanheat.mjs')).href);
const D = join(APP, 'data');
const M = JSON.parse(readFileSync(join(D, 'urban-heat-model.json'), 'utf8'));
const EV = JSON.parse(readFileSync(join(D, 'urban-gilgit-pair-test.json'), 'utf8'));
const S105 = [35.901151, 74.369656], S108 = [35.908035, 74.341667];

/* (1) the layer's values at the two stations, computed with the withholding switched off (the model as it was) */
const OFF = createUrbanHeat(null, D, { withheld: { applied: false }, nationalWithheld: false });   /* v91.17.283.3: C12 national withholding off for this analysis */
const a = OFF.estimate(...S105, { hoursFromSunset: 2 }), b = OFF.estimate(...S108, { hoursFromSunset: 2 });
ok(a.urban && b.urban && a.heatIsland.maxC === EV.layer.m105_maxC && b.heatIsland.maxC === EV.layer.m108_maxC,
  'cause: the layer value at 105 / 108 is reproduced (' + (a.heatIsland && a.heatIsland.maxC) + ' / ' + (b.heatIsland && b.heatIsland.maxC) + ' C)');
const pred = +(a.heatIsland.maxC - b.heatIsland.maxC).toFixed(2);
ok(pred === EV.layer.predicted_105_minus_108_at_max && EV.observed.after_sunset_19_21_all.mean_105_minus_108 > 0 && EV.observed.after_sunset_19_21_all.ci95[0] > 0 && pred < 0,
  'finding confirmed: observed 105 - 108 after sunset ' + EV.observed.after_sunset_19_21_all.mean_105_minus_108 + ' C (CI excludes 0), layer ' + pred + ' C: wrong sign');
const recompute = (e) => { const hw = e.geometry.aspectRatio; const raw = Math.max(0, M.canyon.a + M.canyon.b * Math.log(hw)); return +(raw * e.heatIsland.vegetation.factor * (e.heatIsland.town ? e.heatIsland.town.factor : 1) * M.calibration.value).toFixed(2); };
ok(Math.abs(recompute(a) - a.heatIsland.maxC) <= 0.02 && Math.abs(recompute(b) - b.heatIsland.maxC) <= 0.02,
  'no inverted difference / unit error: maxC = Oke(H/W) x vegetation x town x calibration, in K, as documented, at both cells');
ok(a.geometry.classScale === M.classScale.clamp.value[0] && b.geometry.classScale === M.classScale.clamp.value[1],
  'the GHSL geometry hits the class-scale clamp at both cells (' + a.geometry.classScale + ', ' + b.geometry.classScale + '): inputs and local climate zone disagree');

/* (2) withheld in the mountain zone */
const U = createUrbanHeat(null, D, { nationalWithheld: false });   /* v91.17.283.3: this test checks the v283.2 mountain rule alone; C12 (all of Pakistan) is tests2833/srvfix/c12_urbanheat */
const w5 = U.estimate(...S105, { hoursFromSunset: 2 }), w8 = U.estimate(...S108, { hoursFromSunset: 2 });
ok(w5.withheld === true && w8.withheld === true && w5.urban === false && w5.why === M.withheld.reason, 'Gilgit 105 and 108: withheld, with the stated reason');
const sk = U.estimate(35.30, 75.63, { hoursFromSunset: 2 }), ch = U.estimate(35.85, 71.79, { hoursFromSunset: 2 });
ok(sk.withheld === true && (ch.withheld === true || ch.urban === false), 'Skardu and Chitral town: withheld (mountain zone)', JSON.stringify([sk.unit && sk.unit.tehsil, ch.unit && ch.unit.tehsil, ch.withheld]));
{ const v = U.estimate(35.35, 74.86, { hoursFromSunset: 2 }), v0 = OFF.estimate(35.35, 74.86, { hoursFromSunset: 2 });
  ok(JSON.stringify(v) === JSON.stringify(v0) && v.smallSettlement === true && !v.withheld, 'a GB valley village (Astore) keeps its small-settlement answer, as before (only town cells are withheld)'); }
ok(U.cellsIn(74.2, 35.8, 74.5, 36.0, 20000, {}).n === 0 && OFF.cellsIn(74.2, 35.8, 74.5, 36.0, 20000, {}).n > 0, 'Gilgit map cells: none drawn (were ' + OFF.cellsIn(74.2, 35.8, 74.5, 36.0, 20000, {}).n + ')');
ok(U.spread(35.9, 74.36, 12).cells === 0, 'Gilgit spread: no cells');
const N = U.national(), N0 = OFF.national();
const mt = (o) => Object.keys(o.units).filter((k) => /^Gilgit Baltistan\||\|Chitral (Lower|Upper)\|/.test(k)).length;
ok(mt(N) === 0 && mt(N0) > 0, 'tehsil roll-up: no Gilgit-Baltistan / Chitral unit (were ' + mt(N0) + ')');
ok(N.mask && N.mask.withheld && N.mask.withheld.reason === M.withheld.reason, 'the map legend / mask carries the withheld reason');

/* (3) the plains are unchanged */
for (const [n, la, lo] of [['Rawalpindi OPRN', 33.6166, 73.0992], ['Lahore OPLH', 31.55, 74.333], ['Karachi', 24.86, 67.01]]) {
  const x = U.estimate(la, lo, { hoursFromSunset: 2 }), y = OFF.estimate(la, lo, { hoursFromSunset: 2 });
  ok(JSON.stringify(x) === JSON.stringify(y) && !x.withheld, n + ': answer identical to the model without the withholding');
}
ok(U.cellsIn(73.0, 33.6, 73.1, 33.7, 20000, {}).n === OFF.cellsIn(73.0, 33.6, 73.1, 33.7, 20000, {}).n, 'Islamabad map cells unchanged');
const other = Object.keys(N0.units).filter((k) => !/^Gilgit Baltistan\||\|Chitral (Lower|Upper)\|/.test(k));
ok(other.every((k) => JSON.stringify(N.units[k]) === JSON.stringify(N0.units[k])), 'every other tehsil roll-up unchanged (' + other.length + ')');

/* (4) the data files */
ok(M.withheld.applied === true && /wrong sign/.test(M.withheld.reason) && M.withheld.evidence.file === 'data/urban-gilgit-pair-test.json', 'data/urban-heat-model.json withheld: reason and evidence file named');
console.log(`\nURBAN-WITHHELD ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
