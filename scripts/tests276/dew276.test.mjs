/* v91.17.276 · DEW2 · plains place-aware and hills re-gate: NOTHING NEW SERVED (data/dew-final.json v276 record, scripts/dew276).
     0 the gate file carries the v276 verdicts (plains, hills: not served, with the failing lines / reasons) and its served part (zones,
       months, horizon) is the v275 one value for value
     1 plains and hills stay unapplied: dewfix leaves 40 plains / hills answers unchanged byte for byte; served zones = mountain only
     2 the v276 numbers in the file agree with the fit outputs (scripts/dew276/out) when present
   usage: node scripts/tests276/dew276.test.mjs */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDewFix } from '../../server/api/dewfix.mjs';
import { rhFromDew } from '../../server/api/psychro.mjs';
const HERE = dirname(fileURLToPath(import.meta.url)), APP = join(HERE, '..', '..'), DATA = join(APP, 'data');
let P = 0, F = 0; const pass = (m, d) => { P++; console.log('PASS ' + m + (d ? ' · ' + d : '')); }, fail = (m, d) => { F++; console.log('FAIL ' + m + (d ? ' · ' + d : '')); };
const M = JSON.parse(readFileSync(join(DATA, 'dew-final.json'), 'utf8'));
M.version === 'dewfinal-91.17.276' ? pass('0 · version', M.version) : fail('0 · version', M.version);
const V = M.v276 || {};
V.plains && V.plains.verdict === 'not served' && V.plains.why.length >= 3 ? pass('0 · plains verdict recorded', V.plains.why.length + ' reasons') : fail('0 · plains verdict');
V.hills && V.hills.verdict === 'not served' ? pass('0 · hills verdict recorded') : fail('0 · hills verdict');
const rm = V.plains && V.plains.runMeanCandidate; rm && rm.pass === false && rm.lines['W2 >= 0'] === false ? pass('0 · plains run-mean candidate fails W2', JSON.stringify(rm.W2)) : fail('0 · run-mean candidate record');
const hs = V.plains && V.plains.hourlyStateCandidate; hs && hs.anomCorr && hs.anomCorr.metar.fixed < hs.anomCorr.metar.served ? pass('0 · hourly-state candidate: anomaly skill loss recorded', JSON.stringify(hs.anomCorr.metar)) : fail('0 · hourly-state record');
['plains', 'hills', 'coast'].every((z) => M.zones[z].applied === false && M.zones[z].offsetsC == null) && M.zones.mountain.applied === true ? pass('0 · served part: mountain only') : fail('0 · served part');
JSON.stringify(M.months) === '[9,10]' && M.horizonH === 72 ? pass('0 · months / horizon as v275') : fail('0 · months / horizon');
const df = createDewFix({ dataDir: DATA });
JSON.stringify(df.status().servedZones) === '["mountain"]' ? pass('1 · served zones', 'mountain') : fail('1 · served zones', JSON.stringify(df.status().servedZones));
{ const NOW = Date.parse('2026-10-17T00:30:00Z'); let same = 0;
  for (const z of ['plains', 'hills']) for (let k = 0; k < 20; k++) {
    const t0 = Date.parse('2026-10-16T19:00:00Z') + k * 3600e3; const time = [...Array(192)].map((_, i) => new Date(t0 + 5 * 3600e3 + i * 3600e3).toISOString().slice(0, 16));
    const T = time.map((_, i) => 25 + 8 * Math.sin(i / 24 * 2 * Math.PI)), Td = time.map(() => 12 + k * 0.3);
    const L = { utc_offset_seconds: 18000, elevation: z === 'hills' ? 1300 : 200, hourly: { time, temperature_2m: T, dew_point_2m: Td, relative_humidity_2m: T.map((t, i) => rhFromDew(t, Td[i])) } };
    const s0 = JSON.stringify(L); df.apply(L, 28.3 + k * 0.1, 68.4, { zone: z, nowMs: NOW }); if (JSON.stringify(L) === s0) same++; }
  same === 40 ? pass('1 · plains / hills answers unchanged byte for byte', '40/40') : fail('1 · plains / hills changed', same + '/40'); }
const G = join(APP, 'scripts', 'dew276', 'out', 'place_gate_run4_runmean.json');
if (existsSync(G)) { const g = JSON.parse(readFileSync(G, 'utf8')).plains.gate; JSON.stringify(g.W2) === JSON.stringify(rm.W2) ? pass('2 · file = fit output (run-mean W2)') : fail('2 · file vs fit output'); }
else pass('2 · fit outputs not shipped here (skipped)');
console.log(`\n${P} passed, ${F} failed`); process.exit(F ? 1 : 0);
