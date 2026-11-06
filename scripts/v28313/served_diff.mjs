#!/usr/bin/env node
/* v91.17.283.13 · SERVED-VALUES DIFF on all tehsils: the engine record as issued (before) against the same record after hazsci.mjs
   (after), layer by layer, with the reason of every changed cell. Inputs: a data folder (engine-latest.json and the data files the layers
   read). Rain: when the held ensemble run predates the class shares (prc), the after-level is simulated from the run's member median of
   the day total (the 50 % rule is the same as "the median reaches the class"; total precipitation, not liquid rain) and marked simulated.
   Usage: node scripts/v28313/served_diff.mjs <dataDir> <out.json> [out.tsv] */
import { readFileSync, writeFileSync } from 'node:fs';
import { makeApp } from '../tests28313/harness.mjs';
import { RAIN_CLASSES } from '../../server/api/hazsci.mjs';
const [dataDir, outJ, outT] = process.argv.slice(2);
const before = JSON.parse(readFileSync(dataDir + '/engine-latest.json', 'utf8'));
const after = JSON.parse(JSON.stringify(before));
const app = makeApp(dataDir); const O = app.outlook.dayRows();
let simulated = false;
if (O && O.units && !Object.values(O.units).some((rows) => rows.some((r) => r && r.prc))) { simulated = true;
  for (const rows of Object.values(O.units)) for (const r of rows) if (r && r.pr) r.prc = { n: r.n, of: O.members, basis: 'simulated from the member median (total precipitation)', p: Object.fromEntries(RAIN_CLASSES.map((t) => [String(t), r.pr[1] >= t ? 50 : 0])) }; }
const res = app.hazSci.apply(after);
const SPW = ['Sealed', 'Like bare ground', 'Like cropland', 'Like grassland', 'Like woodland'];
const W = (k, v) => v == null ? 'none' : v >= 0 ? (/^nss_/.test(k) ? SPW : ['Normal', 'Low', 'Moderate', 'High', 'Severe'])[v] : v === -2 ? 'not applicable' : v === -3 ? 'no river level' : 'not assessed';
const LAY = ['flood_riverine', 'rain_hz', 'landslide', 'drought', 'nss_baseline', 'nss_dynamic', 'glof'];
const summary = {}, cells = [];
for (const k of LAY) { const b0 = before.days[0].layers[k], a0 = after.days[0].layers[k]; if (!b0 || !a0) continue;
  const t = {}; let changed = 0;
  for (const uid of Object.keys(a0.L)) { const b = b0.L[uid], a = a0.L[uid]; const key = W(k, b) + ' -> ' + W(k, a); t[key] = (t[key] || 0) + 1; if (b !== a) { changed++; cells.push({ layer: k, unit: uid, before: W(k, b), after: W(k, a), why: (a0.why && a0.why[uid]) || null, facts: (a0.facts && a0.facts[uid]) || null }); } }
  const cnt = (L) => { const c = {}; for (const v of Object.values(L.L)) c[W(k, v)] = (c[W(k, v)] || 0) + 1; return c; };
  summary[k] = { changed, of: Object.keys(a0.L).length, before: cnt(b0), after: cnt(a0), transitions: t }; }
const out = { engineRun: before.at, build: before.build, rainSimulated: simulated, hazSci: res, summary, cells };
writeFileSync(outJ, JSON.stringify(out, null, 1));
if (outT) writeFileSync(outT, ['layer\tunit\tbefore\tafter\twhy'].concat(cells.map((c) => [c.layer, c.unit, c.before, c.after, c.why || ''].join('\t'))).join('\r\n') + '\r\n');
for (const [k, s] of Object.entries(summary)) console.log(k.padEnd(15), 'changed', String(s.changed).padStart(4), 'of', s.of, '| before', JSON.stringify(s.before), '| after', JSON.stringify(s.after));
console.log('rain simulated from the member median:', simulated);
