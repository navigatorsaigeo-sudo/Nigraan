// Rain day product score: ensemble median of day total >= class threshold (equivalent to P(>=T) >= 50 %) vs IMERG daily tehsil total.
import { readFileSync, readdirSync } from 'node:fs';
const D = process.argv[2];
const T = { Low: 15.6, Moderate: 64.5, High: 115.6, Severe: 204.5 };
const I = {}; for (const f of readdirSync(D + '/imerg')) if (/^\d{4}-\d\d-\d\d\.json$/.test(f)) { const j = JSON.parse(readFileSync(D + '/imerg/' + f)); I[j.date] = j.units; }
const res = {}; const add = (k, lead, h) => { const r = res[k + '|' + lead] || (res[k + '|' + lead] = { a: 0, b: 0, c: 0, d: 0 }); r[h]++; };
let n = 0;
for (const f of readdirSync(D + '/ensemble-log')) { const L = JSON.parse(readFileSync(D + '/ensemble-log/' + f));
  for (const [u, byLead] of Object.entries(L.units)) for (const lead of ['1', '2', '3']) { const r = byLead[lead]; if (!r || !r.pr) continue; const obs = I[r.date] && I[r.date][u]; if (obs == null) continue; n++;
    const med = r.pr[1];
    for (const [k, t] of Object.entries(T)) { const f1 = med >= t, o1 = obs >= t; add(k, lead, f1 && o1 ? 'a' : f1 ? 'b' : o1 ? 'c' : 'd'); } } }
const out = {}; for (const [key, r] of Object.entries(res)) { const pod = r.a + r.c ? r.a / (r.a + r.c) : null, far = r.a + r.b ? r.b / (r.a + r.b) : null; out[key] = { hits: r.a, falseAlarms: r.b, misses: r.c, correctNegatives: r.d, events: r.a + r.c, pod: pod == null ? null : +pod.toFixed(2), far: far == null ? null : +far.toFixed(2) }; }
console.log(JSON.stringify({ pairs: n, out }, null, 1));
