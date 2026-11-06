// v91.17.276 T2R · the re-run's data switch: no zone and no city served unless its gate passed (evidence _admin/docs/v276/t2r).
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const T = JSON.parse(fs.readFileSync(path.join(APP, 'data', 't2final-b2v2.json'), 'utf8'));
const G = JSON.parse(fs.readFileSync(path.join(APP, '_admin', 'docs', 'v276', 't2r', 'b2v2_gate.json'), 'utf8'));
const C = JSON.parse(fs.readFileSync(path.join(APP, '_admin', 'docs', 'v276', 't2r', 'city_heat.json'), 'utf8'));
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
ok(T.version === 't2final-b2v2-276', 'table is the v276 re-run · ' + T.version);
const passed = Object.entries(G.sets[T.trainingSet].zones).filter(([, v]) => v.verdict === 'PASS').map(([z]) => z);
ok(JSON.stringify(T.servedZones) === JSON.stringify(passed), 'servedZones = zones whose gate passed · ' + JSON.stringify(passed));
ok(Object.keys(T.cells).length > 0 && Object.values(T.cells).every((c) => Number.isFinite(c.c0)), 'coefficient cells finite · ' + Object.keys(T.cells).length);
ok(T.cityHeat && Array.isArray(T.cityHeat.servedCities) && T.cityHeat.servedCities.every((c) => C.cities[c] && C.cities[c].verdict === 'PASS'), 'city heat served only where the gate passed · ' + JSON.stringify(T.cityHeat.servedCities));
ok(C.cities.Islamabad.verdict === 'FAIL' && T.cityHeat.servedCities.length === 0, 'Islamabad failed, nothing served; Lahore transfer not served (see decision)');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
