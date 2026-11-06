import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
// v91.17.278 · FIX278 5 · the outdoor-array screen (stuckscreen.mjs ARRAY_RULE) on every MACH series held.
// usage: node scripts/tests278/array.test.mjs [server address, ignored] [folder with obs_YYYYMMDD.csv]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screenRows, screenSeries, arraySilent, sunElev, ARRAY_RULE } from '../../server/api/stuckscreen.mjs';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ARGS = process.argv.slice(2).filter((a) => !/^https?:\/\//.test(a)); const DB = ARGS[0] || __T.uploads('LAMHA/data/mach/db');
let pass = 0, fail = 0, skip = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' · ' + d : '')); } };
const REG = JSON.parse(readFileSync(join(APP, 'data', 'mach-fleet-stations.json'), 'utf8')).stations; const POS = new Map(REG.filter((s) => s.lat != null).map((s) => [s.key, s]));
/* 0 · the sun: solar noon at Islamabad on 21 Jun is about 80 degrees, midnight below the horizon */
{ const e1 = sunElev(33.68, 73.05, Date.parse('2026-06-21T07:08:00Z')), e2 = sunElev(33.68, 73.05, Date.parse('2026-06-21T19:00:00Z'));
  ok(Math.abs(e1 - 79.8) < 0.7 && e2 < -20, 'A0 the sun elevation formula (Islamabad, 21 Jun: noon ' + e1.toFixed(1) + ' degrees, midnight ' + e2.toFixed(1) + ')'); }
/* 1 · synthetic: two daylight silent readings mark the array, the night keeps it, a speaking array clears it; one silent reading alone does not */
{ const at = (h) => Date.parse('2026-10-17T00:00:00Z') + h * 3600e3; const p = { lat: 35.171, lon: 76.324 };
  const R = [[3, 0], [3.1, 0], [12, 0], [13, 0.2], [14, 0], [27, 0], [27.5, 120]].map(([h, S]) => ({ ms: at(h), S, W: 0, G: 0, ...p }));
  const v = arraySilent(R); ok(JSON.stringify(v) === JSON.stringify([true, true, true, false, false, false, false]), 'A1 daylight silence marks the array (from the second reading, the run back to its first), the night keeps it, solar 0.2 clears it, a single daylight silent reading does not', JSON.stringify(v));
  ok(arraySilent([{ ms: at(3), S: null, W: 0, G: 0, ...p }, { ms: at(3.2), S: null, W: 0, G: 0, ...p }]).every((x) => !x), 'A2 a station without a solar reading is never judged by it');
  ok(screenSeries([{ ms: at(3), T: 12.7, Td: 11.4, RH: 92, P: 1013, S: 0, W: 0, G: 0, ...p }, { ms: at(3.1), T: 12.6, Td: 11.3, RH: 92, P: 1013, S: 0, W: 0, G: 0, ...p }])[1] === 'array-silent', 'A3 screenSeries returns the verdict array-silent'); }
/* 2 · the copies */
const files = existsSync(DB) ? readdirSync(DB).filter((f) => /^obs_202610\d\d\.csv$/.test(f)).sort() : [];
if (!files.length) { skip++; console.log('SKIP the MACH copies are not at ' + DB); }
else {
  const rows = []; for (const f of files) { const L = readFileSync(join(DB, f), 'utf8').split(/\r?\n/); const h = L[0].split(','); const ix = (n) => h.indexOf(n); const I = { k: ix('stationKey'), t: ix('time'), s: ix('source'), T: ix('temperatureC'), Td: ix('dewPointC'), RH: ix('humidityPct'), P: ix('pressureHpa'), S: ix('solarWm2'), W: ix('windSpeedKmh'), G: ix('windGustKmh'), R: ix('precipRateMmHr') };
    for (let i = 1; i < L.length; i++) { const c = L[i].split(','); if (c.length !== h.length || c[I.s] === 'qm' || !POS.has(c[I.k])) continue; const n = (j) => (c[j] === '' ? null : Number(c[j])); rows.push({ k: c[I.k], ms: Date.parse(c[I.t]), T: n(I.T), Td: n(I.Td), RH: n(I.RH), P: n(I.P), S: n(I.S), W: n(I.W), G: n(I.G), R: n(I.R) }); } }
  const seen = new Set(); const U = rows.filter((r) => { const k = r.k + '|' + r.ms; if (seen.has(k)) return false; seen.add(k); return true; });
  const bad = screenRows(U, (r) => r.k, (r) => ({ ms: r.ms, T: r.T, Td: r.Td, RH: r.RH, P: r.P, S: r.S, W: r.W, G: r.G }), undefined, (k) => POS.get(k));
  const isA = (r) => bad.get(r) === 'array-silent';
  const K = U.filter((r) => r.k === 'khaplu').sort((a, b) => a.ms - b.ms); const win = (a, b) => K.filter((r) => r.ms >= Date.parse(a) && r.ms <= Date.parse(b));
  const f17 = win('2026-10-17T02:14:00Z', '2026-10-17T07:00:00Z'), o16 = win('2026-10-16T19:34:00Z', '2026-10-16T20:45:00Z'), b17 = win('2026-10-17T07:04:00Z', '2026-10-17T10:40:00Z'), c17 = win('2026-10-17T10:49:00Z', '2026-10-17T11:15:00Z');
  ok(f17.length > 40 && f17.every(isA), 'K1 Khaplu 17 Oct 07:14-12:00 PKT (the frozen console after the power cut, owner evidence): every reading rejected', f17.filter(isA).length + ' of ' + f17.length);
  ok(o16.length > 8 && o16.every((r) => !bad.has(r)), 'K2 Khaplu 17 Oct 00:34-01:45 PKT (real outdoor readings, 5 C, solar 0.2): every reading kept', o16.filter((r) => !bad.has(r)).length + ' of ' + o16.length);
  ok(b17.length > 20 && !b17.some(isA), 'K3 Khaplu 17 Oct 12:04-15:40 PKT (array back, solar 156 W/m2): no reading rejected by the array screen', b17.filter(isA).length + ' of ' + b17.length + ' array-silent; other rules: ' + [...new Set(b17.filter((r) => bad.has(r)).map((r) => bad.get(r)))].join(', '));
  ok(c17.length >= 5 && c17.every(isA), 'K5 Khaplu 17 Oct 15:49-16:14 PKT: the console state again (12.4 C held, RH 80 % against 59-64 % either side, solar 0 with the sun up): rejected', c17.filter(isA).length + ' of ' + c17.length);
  const k616 = K.filter((r) => r.ms < Date.parse('2026-10-17T00:00:00Z')); const day616 = k616.filter((r) => sunElev(35.171, 76.324, r.ms) >= ARRAY_RULE.ELEV_DEG);
  const kept616 = k616.filter((r) => !bad.has(r));
  console.log('   Khaplu 6-16 Oct: ' + k616.length + ' readings, ' + k616.filter(isA).length + ' array-silent (' + (100 * k616.filter(isA).length / k616.length).toFixed(1) + ' %), daylight ' + day616.filter(isA).length + ' of ' + day616.length + '; kept ' + kept616.length + ', kept temperatures ' + (kept616.length ? Math.min(...kept616.map((r) => r.T)) + '..' + Math.max(...kept616.map((r) => r.T)) + ' C' : '-'));
  ok(day616.filter(isA).length >= 0.9 * day616.length, 'K4 Khaplu 6-16 Oct: the daylight console state is rejected (the damped pattern behind the v91.17.277 indoor exclusion)', day616.filter(isA).length + ' of ' + day616.length);
  /* false rejects: every other registered station that is not excluded */
  const others = U.filter((r) => r.k !== 'khaplu' && !(POS.get(r.k).exclude)); const by = new Map(); for (const r of others) { const a = by.get(r.k) || by.set(r.k, [0, 0]).get(r.k); a[0]++; if (isA(r)) a[1]++; }
  const tot = others.length, rej = others.filter(isA).length; const hit = [...by].filter(([, a]) => a[1]).map(([k, a]) => k + ' ' + a[1] + '/' + a[0]);
  const wetDays = new Set(others.filter((r) => r.R > 0).map((r) => r.k + '|' + new Date(r.ms + 5 * 3600e3).toISOString().slice(0, 10)));
  const wet = others.filter((r) => wetDays.has(r.k + '|' + new Date(r.ms + 5 * 3600e3).toISOString().slice(0, 10))), wetRej = wet.filter(isA).length;
  /* overcast: a daylight reading with solar under the station's own 10th percentile of daylight solar */
  console.log('   other stations: ' + by.size + ', readings ' + tot + ', array-silent ' + rej + ' (' + (100 * rej / tot).toFixed(3) + ' %); stations with any: ' + (hit.join(', ') || 'none') + '; rainy station-days ' + wetDays.size + ': ' + wetRej + ' of ' + wet.length + ' readings');
  ok(rej / tot < 0.01 && wetRej === 0, 'F1 false rejects on the other ' + by.size + ' stations: ' + (100 * rej / tot).toFixed(3) + ' % of readings (only at ' + (hit.length || 0) + ' stations whose own array goes silent in daylight), none on the ' + wetDays.size + ' rainy station-days', hit.join(', '));
  /* overcast days: daylight readings with solar > 0 but below 100 W/m2 at a sun above 30 degrees (thick cloud) are never array-silent by definition; the readings around them */
  const dim = others.filter((r) => r.S > 0 && r.S < 100 && sunElev(POS.get(r.k).lat, POS.get(r.k).lon, r.ms) > 30); const dimDays = new Set(dim.map((r) => r.k + '|' + new Date(r.ms + 5 * 3600e3).toISOString().slice(0, 10)));
  const dimR = others.filter((r) => dimDays.has(r.k + '|' + new Date(r.ms + 5 * 3600e3).toISOString().slice(0, 10))); ok(dimR.filter(isA).length === 0 || dimR.filter(isA).every((r) => hit.some((h) => h.startsWith(r.k + ' '))), 'F2 overcast station-days (solar under 100 W/m2 with the sun above 30 degrees, ' + dimDays.size + ' days): no reading rejected except at the stations of F1', dimR.filter(isA).length + ' of ' + dimR.length);
}
console.log(`\n${fail ? 'FAIL' : 'PASS'} array278: ${pass} passed, ${fail} failed, ${skip} skipped`); process.exit(fail ? 1 : 0);
