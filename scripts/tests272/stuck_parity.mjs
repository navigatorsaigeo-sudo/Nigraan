// v91.17.272 hotfix · parity: stuckscreen.mjs verdicts equal the Python derivation's (stuck_screen.py) on the same rows
// usage: node stuck_parity.mjs <parity_in.csv with stationKey,ms,temperatureC,dewPointC,humidityPct,pressureHpa,v>
import { readFileSync } from 'node:fs';
import { screenSeries } from '../../server/api/stuckscreen.mjs';
const L = readFileSync(process.argv[2], 'utf8').trim().split('\n'); const H = L[0].split(',');
const ix = (n) => H.indexOf(n); const num = (x) => (x === '' || x == null ? null : +x);
const by = new Map();
for (const l of L.slice(1)) { const c = l.split(','); const k = c[ix('stationKey')]; (by.get(k) || by.set(k, []).get(k)).push({ ms: +c[ix('ms')], T: num(c[ix('temperatureC')]), Td: num(c[ix('dewPointC')]), RH: num(c[ix('humidityPct')]), P: num(c[ix('pressureHpa')]), want: c[ix('v')] }); }
let n = 0, same = 0; const diff = [];
for (const [k, rows] of by) { const v = screenSeries(rows); rows.forEach((r, i) => { n++; if (v[i] === r.want) same++; else if (diff.length < 10) diff.push([k, r.ms, r.T, r.want, v[i]]); }); }
console.log(JSON.stringify({ rows: n, same, differ: n - same, firstDiffs: diff }));
process.exit(n === same ? 0 : 1);
