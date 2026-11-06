/* v91.17.283.47 (NIGRAAN 1.0.8.2) · the single-hour artefacts of 2 Nov 11:00 PKT (served chain of 05:54 UTC).
   (1) the curve check (servedqc.mjs curveCheck, data/served-qc-climate.json from held hourly observations) withholds the Skardu spike
       (12:00 16.5 -> 13:00 24.3 -> 14:00 19.7) and the Mulkhow step (08:00 0.8 -> 09:00 11.7), and passes a steep smooth sunrise;
   (2) the EWS live anchor adds its residual to the served curve with a continuous weight (no national basis, no per-hour gate, no step);
   (3) optional: zero false withholds over a held month of clean national tehsil forecasts (data/archive/forecast fc_2026-10, converted).
   usage: node scripts/tests283461/servedcurve47.test.mjs [records json for (3)] */
import { readFileSync, existsSync } from 'node:fs'; import { join, dirname } from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'); const D = join(ROOT, 'data');
const Q = await import(pathToFileURL(join(ROOT, 'server', 'api', 'servedqc.mjs')).href);
let fails = 0; const ok = (c, m, i) => { console.log((c ? 'PASS ' : 'FAIL ') + m + (!c && i != null ? ' :: ' + String(i).slice(0, 300) : '')); if (!c) fails++; };
const C = JSON.parse(readFileSync(join(D, 'served-qc-climate.json'), 'utf8'));
ok(C.curvPooled && C.curvPooled.mountain && C.curvPooled.mountain.triples > 10000 && C.stations.length > 50, 'data/served-qc-climate.json: observed bends per zone (mountain from ' + (C.curvPooled.mountain || {}).triples + ' observed triples), ' + C.stations.length + ' stations');
const H = (d, a) => a.map((T, i) => ({ time: d + 'T' + String(i).padStart(2, '0') + ':00', T }));
const sk = H('2026-11-02', [2.1, 1.8, 1.5, 1.2, 1.0, 0.9, 1.2, 2.5, 4.6, 7.0, 9.6, 12.4, 16.5, 24.3, 19.7, 18.0, 15.2, 12.0, 9.5, 7.6, 6.0, 4.9, 4.0, 3.2]);
const o1 = Q.curveCheck(D, sk, 'mountain', 2224); ok(o1.has('2026-11-02T13:00') && o1.get('2026-11-02T13:00').test === 'bend' && o1.size <= 2, 'Skardu: the 13:00 spike (24.3 C between 16.5 and 19.7) is withheld (' + [...o1.keys()].map((k) => k.slice(11)).join(', ') + ')', JSON.stringify([...o1]));
const mu = H('2026-11-02', [-3.0, -3.4, -3.8, -4.1, -4.3, -4.5, -4.2, -2.0, 0.8, 11.7, 12.6, 13.4, 13.8, 13.6, 12.9, 11.5, 9.0, 6.5, 4.7, 3.2, 2.0, 1.0, 0.1, -0.7]);
const o2 = Q.curveCheck(D, mu, 'mountain', 2288); ok(o2.has('2026-11-02T09:00') || o2.has('2026-11-02T08:00'), 'Mulkhow: the 08:00 -> 09:00 step (0.8 -> 11.7 C) is withheld (' + [...o2.keys()].map((k) => k.slice(11)).join(', ') + ')', JSON.stringify([...o2]));
const sm = H('2026-10-24', [5.0, 4.6, 4.2, 3.9, 3.6, 3.4, 3.4, 4.6, 7.6, 10.6, 13.3, 15.4, 16.8, 17.5, 17.6, 17.0, 15.6, 13.4, 11.2, 9.6, 8.4, 7.4, 6.6, 5.8]);
ok(Q.curveCheck(D, sm, 'mountain', 2045).size === 0, 'a steep smooth mountain sunrise (+3 C an hour) passes');
const pl = H('2026-06-02', [33, 32, 31, 30.5, 30, 30, 31, 33.5, 36.5, 39.5, 42, 44, 45.6, 46.8, 47.4, 47.5, 47, 46, 44, 41, 38.5, 36.5, 35, 34]);
ok(Q.curveCheck(D, pl, 'plains', 50).size === 0, 'a June 47.5 C plains day passes (no real heat is withheld)');
process.env.NIGRAAN_SERVED_QC = '0'; ok(Q.curveCheck(D, sk, 'mountain', 2224).size === 0, 'NIGRAAN_SERVED_QC=0 switches the check off'); delete process.env.NIGRAAN_SERVED_QC;
const ews = readFileSync(join(ROOT, 'server', 'api', 'ewsshadow.mjs'), 'utf8'); const body = ews.slice(ews.indexOf('function serve(loc, lat, lon'), ews.indexOf('return n > 0; }'));
ok(/T1 = r1\(T0 \+ w \* a\.raw\)/.test(body) && /T1 = r1\(T0 \+ a\.weight \* a\.raw\)/.test(body) && !/servedAt\(/.test(body), 'the anchor adds its residual to the served curve (no national basis read at serve time)');
ok(/if \(!inResidualRange\(a\.raw\)\) return false;/.test(body) && !/held\+\+/.test(body), 'the anchor is applied whole or not at all (no per-hour gate)');
/* the weight, as written in serve(): continuous from fade_hours before the window to fade_hours after the newest reading */
const m = /const wAt = (\(ms\) => \{[^\n]*\});/.exec(body); const F = 6 * 3600e3, Hh = 3600e3; const wAt = new Function('a', 'F', 'H', 'return ' + m[1])({ newestMs: 0 }, F, Hh);
const ws = []; for (let t = -9; t <= 9; t++) ws.push(wAt(t * Hh) || 0); const jump = Math.max(...ws.slice(1).map((w, i) => Math.abs(w - ws[i])));
ok(jump <= 1 / 6 + 1e-9 && ws[8] === 1 && ws[9] === 1 && ws[0] === 0 && ws[18] === 0, 'the anchor weight changes by at most 1/fade_hours from one hour to the next (no step): ' + ws.map((w) => w.toFixed(2)).join(' '));
const F3 = process.argv[2]; if (F3 && existsSync(F3)) { const R = JSON.parse(readFileSync(F3, 'utf8')); let n = 0, w = 0;
  for (const x of R) { const hh = (x.hourly.time || []).map((t, i) => ({ time: new Date(Date.parse(String(t).replace(/Z?$/, 'Z')) + 5 * 3600e3).toISOString().slice(0, 16), T: x.hourly.temperature_2m[i] })); n += hh.length; w += Q.curveCheck(D, hh, x.temperatureBasis.zone, x.temperatureBasis.elevM).size; }
  ok(w / n < 1e-5, 'held clean forecasts: ' + w + ' of ' + n + ' hours withheld'); }
console.log(fails ? 'FAILED ' + fails : 'ALL PASS'); process.exit(fails ? 1 : 0);
