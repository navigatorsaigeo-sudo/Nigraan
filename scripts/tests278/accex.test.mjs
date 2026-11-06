import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
// v91.17.278 · FIX278 4 · a station excluded NOW counts in no window, flag or reference of the accuracy monitor.
// usage: node scripts/tests278/accex.test.mjs [server address, ignored] [accmon folder]   Writes only in a temporary folder.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createAccMon, ACC_RULE, loadCities } from '../../server/api/accmon.mjs';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), DATA = join(APP, 'data');
const ARGS = process.argv.slice(2).filter((a) => !/^https?:\/\//.test(a));
const ACCDIR = ARGS[0] || __T.uploads('NIGRAAN/nig/nigraan-local/data/accmon');
let pass = 0, fail = 0, skip = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' · ' + d : '')); } };
const H = 3600e3, D = 864e5; const CITIES = loadCities(DATA); const tmp = mkdtempSync(join(tmpdir(), 'acc278-'));
const REG = JSON.parse(readFileSync(join(DATA, 'mach-fleet-stations.json'), 'utf8')).stations.filter((s) => s.lat != null);
const stub = (ex) => { const app = { mos: { zoneOfPoint: (la) => (la > 34.5 ? 'mountain' : 'plains') } };
  app.fleet = { stations: () => REG, excluded: (k) => ex.includes(k), offsetFor: () => null, elevOf: () => null, liveReadings: () => [], servedAt: () => null }; return app; };
const mk = (t, ex, dir, o = {}) => createAccMon(stub(ex), APP, DATA, { dir, noSchedule: true, noWrite: true, now: () => t, cities: CITIES, ...o });

/* ── 1 · synthetic: two Lahore stations, one excluded after its pairs were written ── */
{ const dir = join(tmp, 's1'); mkdirSync(dir, { recursive: true }); const t = Date.parse('2026-10-17T12:00:00Z'), hk = Math.floor(t / H) * H;
  const a = REG.find((s) => s.key === 'Cantt'), b = REG.find((s) => s.key === 'alaudin_road'); const lines = [];
  lines.push({ ty: 'm', id: 'm:Cantt', name: a.name, lat: a.lat, lon: a.lon, kind: 'mach', zone: 'plains' }, { ty: 'm', id: 'm:alaudin_road', name: b.name, lat: b.lat, lon: b.lon, kind: 'mach', zone: 'plains' });
  /* 20 days of hourly pairs: Cantt good (error ~0.5), alaudin_road bad (+3 C) */
  const W = createAccMon(stub([]), APP, DATA, { dir: join(tmp, 'w'), noSchedule: true, noLoad: true, noWrite: true, now: () => t, cities: CITIES });
  for (let k = 20 * 24; k >= 0; k--) { const h = hk - k * H; const e1 = 0.5 * Math.sin(k / 3), e2 = 3 + 0.4 * Math.cos(k / 5);
    lines.push({ ty: 'h', t: new Date(h).toISOString(), src: 'live', p: [['m:Cantt', 250, Math.round((25 + e1) * 10)], ['m:alaudin_road', 250, Math.round((25 + e2) * 10)]] });
    W._pairs.set(h, new Map([['m:Cantt', [25, Math.round((25 + e1) * 10) / 10]], ['m:alaudin_road', [25, Math.round((25 + e2) * 10) / 10]]])); }
  W._meta.set('m:Cantt', { name: a.name, lat: a.lat, lon: a.lon, kind: 'mach', zone: 'plains', cities: [] }); W._meta.set('m:alaudin_road', { name: b.name, lat: b.lat, lon: b.lon, kind: 'mach', zone: 'plains', cities: [] });
  /* the snapshots an old version wrote (both stations in), from the full pair set */
  const Wf = createAccMon(stub([]), APP, DATA, { dir: join(tmp, 'w2'), noSchedule: true, noLoad: true, noWrite: true, now: () => t, cities: CITIES });
  for (const [h, M] of W._pairs) Wf._pairs.set(h, M); for (const l of lines) if (l.ty === 'm') Wf._meta.set(l.id, { ...l, cities: CITIES.filter((c) => Math.hypot((c.lat - l.lat) * 111, (c.lon - l.lon) * 95) <= 40).map((c) => c.name) });
  const W2 = mk(t, [], join(tmp, 'nofile')); for (const l of lines) if (l.ty === 'm') W2._meta.set(l.id, { name: l.name, lat: l.lat, lon: l.lon, kind: 'mach', zone: 'plains', cities: (Wf._meta.get(l.id) || {}).cities });
  for (let k = 20 * 24; k >= 1; k--) { const h = hk - k * H; const P = new Map([...W._pairs].filter(([x]) => x <= h)); W2._pairs.clear(); for (const [x, M] of P) W2._pairs.set(x, M);
    const s = W2.windowStats(h, 24); const c = {}; for (const [kk, v] of Object.entries(s.city)) if (v.n >= ACC_RULE.minN) c[kk] = v.sdAbs != null ? [v.mae, v.bias, v.n, v.sdAbs, v.sdE] : [v.mae, v.bias, v.n]; lines.push({ ty: 's', t: new Date(h).toISOString(), c }); }
  writeFileSync(join(dir, '2026-10.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  writeFileSync(join(dir, '2026-09.jsonl'), '');
  const before = mk(t, [], dir), after = mk(t, ['alaudin_road'], dir);
  const cityB = Object.keys(before.windowStats(t, 24).city).find((c) => /Lahore/.test(c)) || 'Lahore';
  const sB = before.windowStats(t, 24).city[cityB], sA = after.windowStats(t, 24).city[cityB];
  ok(sB && sA && sB.n === 2 * sA.n && Math.abs(sA.bias) < 0.6 && sB.bias > 1.2, 'X1 the excluded station\'s held pairs are left out of the 24-h window (' + cityB + ')', 'n ' + (sB && sB.n) + ' -> ' + (sA && sA.n) + ', bias ' + (sB && sB.bias) + ' -> ' + (sA && sA.bias));
  ok(![...after._pairs.values()].some((M) => M.has('m:alaudin_road')) && after._exp.size > 0, 'X2 its pairs are not held as pairs; they are kept aside only to take them out of the snapshots', 'aside hours ' + after._exp.size);
  const s7 = after.windowStats(t, 168).city[cityB]; ok(s7 && Math.abs(s7.bias) < 0.6, 'X3 and out of the 7-day window', 'bias ' + (s7 && s7.bias));
  /* the stored snapshots, cleaned, equal snapshots recomputed from the good station alone */
  let worst = 0, cmpN = 0, sdOut = 0; const W3 = mk(t, ['alaudin_road'], join(tmp, 'nofile2')); W3._meta.set('m:Cantt', W2._meta.get('m:Cantt')); W3._meta.set('m:alaudin_road', W2._meta.get('m:alaudin_road'));
  for (const [h, M] of W._pairs) W3._pairs.set(h, new Map([...M].filter(([id]) => id === 'm:Cantt')));
  for (const [h, c] of after._snap) { if (h > hk - 12 * D) continue; const x = c[cityB], cl = after._cleanSnap('s', h, c); const want = W3.windowStats(h, 24).city[cityB]; if (!cl[cityB] || !want) continue; cmpN++;
    worst = Math.max(worst, Math.abs(cl[cityB][0] - want.mae), Math.abs(cl[cityB][1] - want.bias), Math.abs(cl[cityB][2] - want.n) * 10);
    /* the standard deviations come back through the stored cell's 0.01 rounding: dQ = 2 sd (n-1) 0.005 + 2 n |bias| 0.005 + 0.005^2 n, then sd' = sqrt(Q'/(n'-1) ...) */
    const n = x[2], n2 = want.n, dQ = 2 * x[4] * (n - 1) * 0.005 + 2 * n * Math.abs(x[1]) * 0.005 + 2 * n2 * 0.005 * (Math.abs(want.bias) + 0.01), v = want.sdE * want.sdE, bound = Math.sqrt(v + dQ / (n2 - 1)) - want.sdE + 0.011;
    if (Math.abs(cl[cityB][4] - want.sdE) > bound) sdOut++; }
  ok(cmpN > 100 && worst <= 0.011 && !sdOut, 'X4 every stored snapshot, cleaned, equals the snapshot recomputed without the excluded station: MAE, bias and n to the 0.01 rounding of the stored cells; the pair spread within that rounding carried through', cmpN + ' snapshots, largest MAE/bias difference ' + worst.toFixed(3) + ', spread outside its rounding bound ' + sdOut);
  const rB = before.reference(cityB, t), rA = after.reference(cityB, t);
  ok(rA.basis === 'own' && rA.maeP95 < rB.maeP95 && rA.absBiasP95 < 1.0, 'X5 the reference percentiles no longer hold the excluded station', 'MAE P95 ' + rB.maeP95 + ' -> ' + rA.maeP95 + ', |bias| P95 ' + rB.absBiasP95 + ' -> ' + rA.absBiasP95);
  /* a snapshot written by this version records the stations it left out, so it is not cleaned twice */
  const sn = after.windowStats(t, 24); const W4 = mk(t, ['alaudin_road'], join(tmp, 'nofile3'), { noLoad: true }); for (const [h, M] of after._exp) W4._exp.set(h, M); W4._meta.set('m:alaudin_road', W2._meta.get('m:alaudin_road')); W4._meta.set('m:Cantt', W2._meta.get('m:Cantt'));
  const line = W4.windowStats ? null : null; const c0 = {}; for (const [kk, v] of Object.entries(sn.city)) if (v.n >= ACC_RULE.minN) c0[kk] = [v.mae, v.bias, v.n, v.sdAbs, v.sdE];
  const dir5 = join(tmp, 's5'); mkdirSync(dir5, { recursive: true }); const L5 = lines.filter((l) => l.ty !== 's'); L5.push({ ty: 's', t: new Date(hk).toISOString(), c: c0, ex: ['m:alaudin_road'] });
  writeFileSync(join(dir5, '2026-10.jsonl'), L5.map((l) => JSON.stringify(l)).join('\n') + '\n'); const A5 = mk(t + H, ['alaudin_road'], dir5);
  const cl5 = A5._cleanSnap('s', hk, A5._snap.get(hk)); ok(cl5[cityB] && cl5[cityB][2] === c0[cityB][2], 'X6 a snapshot that records the excluded station as already left out is not cleaned again', 'n ' + (cl5[cityB] && cl5[cityB][2]));
  ok(!mk(t, [], dir)._exp.size, 'X7 with no station excluded nothing is set aside (the monitor reads as before)');
}

/* ── 2 · the laptop record: Khaplu excluded in the registry ── */
if (existsSync(join(ACCDIR, '2026-10.jsonl'))) {
  const txt = readFileSync(join(ACCDIR, '2026-10.jsonl'), 'utf8'); const hs = [...txt.matchAll(/"ty":"h","t":"([^"]+)"/g)].map((m) => Date.parse(m[1])); const t = Math.max(...hs) + 30 * 60e3;
  const dir = join(tmp, 'real'); mkdirSync(dir, { recursive: true }); for (const f of ['2026-09.jsonl', '2026-10.jsonl']) if (existsSync(join(ACCDIR, f))) copyFileSync(join(ACCDIR, f), join(dir, f));
  const regEx = REG.filter((s) => s.exclude && s.exclude.why).map((s) => s.key);
  const A0 = mk(t, regEx.filter((k) => k !== 'khaplu'), dir), A1 = mk(t, [...regEx.filter((k) => k !== 'khaplu'), 'khaplu'], dir);   /* the mechanism, with Khaplu excluded as it was in v91.17.277 */
  const held0 = [...A0._pairs.values()].filter((M) => M.has('m:khaplu')).length, held1 = [...A1._pairs.values()].filter((M) => M.has('m:khaplu')).length;
  ok(held0 > 0 && held1 === 0, 'R1 laptop record: Khaplu\'s held pairs (' + held0 + ' hours) are not held once Khaplu is excluded');
  const kc = (A0._meta.get('m:khaplu') || {}).cities || []; const f0 = A0.flagsAt(t, A0.windowStats(t, 24)).map((f) => f.city), f1 = A1.flagsAt(t, A1.windowStats(t, 24)).map((f) => f.city);
  const w1 = Object.values(A1.windowStats(t, 168).city).some((v) => v.worst && v.worst.id === 'm:khaplu');
  ok(!f1.some((c) => kc.includes(c)) && !w1, 'R2 laptop record at ' + new Date(t).toISOString().slice(0, 16) + 'Z: no city of Khaplu (' + kc.join(', ') + ') is flagged and Khaplu is no worst station once excluded', 'flags with Khaplu counted: ' + (f0.join(', ') || 'none') + ' · excluded: ' + (f1.join(', ') || 'none'));
  const lastB = A1.blockOf(t) - 6 * H, b1 = []; for (let bs = lastB - 3 * 6 * H; bs <= lastB; bs += 6 * H) b1.push(...A1.blockFlags(bs).map((f) => f.city));
  ok(!b1.some((c) => kc.includes(c)), 'R3 laptop record: no 6-h block flag of Khaplu\'s cities once excluded', b1.join(', ') || 'none');
} else { skip++; console.log('SKIP R1-R3 no laptop accmon record at ' + ACCDIR); }
console.log(`\n${fail ? 'FAIL' : 'PASS'} accex278: ${pass} passed, ${fail} failed, ${skip} skipped`); process.exit(fail ? 1 : 0);
