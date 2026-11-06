/* v91.17.283.47 · scan: the served-curve check (server/api/servedqc.mjs curveCheck) over every tehsil record of a national run file
   (data/records/run_*.json). Lists each tehsil with a withheld hour, by test. usage: node scripts/tests283461/scan_jumps47.mjs <run json> [data dir] */
import { readFileSync } from 'node:fs'; import { join, dirname } from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'); const D = process.argv[3] || join(ROOT, 'data');
const Q = await import(pathToFileURL(join(ROOT, 'server', 'api', 'servedqc.mjs')).href);
const R = JSON.parse(readFileSync(process.argv[2], 'utf8')); const pkt = (t) => new Date(Date.parse(String(t).replace(/Z?$/, 'Z')) + 5 * 3600e3).toISOString().slice(0, 16);
let n = 0, hrs = 0; const by = { 'above-record': 0, 'below-record': 0, 'bend': 0 }, list = [];
for (const x of R) { const H = x.hourly || {}; const hours = (H.time || []).map((t, i) => ({ time: pkt(t), T: (H.temperature_2m || [])[i] })); hrs += hours.length;
  const z = (x.temperatureBasis && x.temperatureBasis.zone) || null, e = x.temperatureBasis && x.temperatureBasis.elevM != null ? x.temperatureBasis.elevM : x.resolvedElevationM;
  const out = Q.curveCheck(D, hours, z, e); if (!out.size) continue; n++; for (const v of out.values()) by[v.test]++;
  const f = [...out.entries()][0]; list.push(x.unitKey + ' [' + z + ' ' + e + ' m] ' + out.size + ' h: ' + f[0].slice(11) + ' ' + f[1].why.replace(/^withheld: /, '').slice(0, 140)); }
console.log(process.argv[2].split('/').pop() + ': ' + R.length + ' tehsils, ' + hrs + ' hours; tehsils with a withheld hour: ' + n + ' ' + JSON.stringify(by));
for (const l of list) console.log('  ' + l);
