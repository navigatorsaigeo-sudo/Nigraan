/* v91.17.200 · AGN offices on the map (Islamabad I-8, Gilgit) and their MACH stations at the exact office positions */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const R = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
test('office pins are built into the page and the two office stations sit at the office coordinates', () => {
  const a = R('artefact/AI_GEO_NIGRAAN_v91_17_MACH.html');
  assert.match(a, /AGN office · Islamabad \(I-8\)/); assert.match(a, /AGN office · Gilgit/); assert.match(a, /35\.901151/); assert.match(a, /33\.66467/);
  const F = JSON.parse(R('data/mach-fleet-stations.json')); const L = Array.isArray(F) ? F : (Array.isArray(F.stations) ? F.stations : Object.values(F.stations || F));
  const g = L.find((x) => x.key === 'gilgit'), m = L.find((x) => x.key === 'mach1');
  assert.equal(g.lat, 35.901151); assert.equal(g.lon, 74.369656); assert.equal(m.lat, 33.66467); assert.equal(m.lon, 73.08307);
});
