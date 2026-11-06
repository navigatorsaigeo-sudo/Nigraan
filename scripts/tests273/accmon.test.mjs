import * as __T from '../lib/testenv.mjs';   /* v91.17.283 WS7: machine paths from scripts/lib/testenv.mjs */
// v91.17.273 · ACC · accuracy monitor tests. Module tests run on their own (stub fleet / synop, the real live-layer module and model
// file, synthetic and real copied MACH database days); the server tests run when a server answers at BASE.
// usage: node scripts/tests273/accmon.test.mjs [http://127.0.0.1:PORT] [folder with obs_YYYYMMDD.csv] [folder with fleet_pairs_2026-10.csv]
// Writes only in a temporary folder.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createAccMon, ACC_RULE, loadCities, pct } from '../../server/api/accmon.mjs';
import { createHyperlocal } from '../../server/api/hyperlocal.mjs';
import { createSynop } from '../../server/api/synop.mjs';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), DATA = join(APP, 'data');
const BASE = process.argv[2] || process.env.BASE || null;
const DB = process.argv[3] || __T.uploads('LAMHA/data/mach/db');
const PAIRS = process.argv[4] || __T.uploads('NIGRAAN/nig/station-lake/archive/fleet');
let pass = 0, fail = 0, skip = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' · ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' · ' + d : '')); } };
const H = 3600e3, D = 864e5;
const tmp = mkdtempSync(join(tmpdir(), 'acc273-'));
const CITIES = loadCities(DATA);
const HLDATA = join(tmp, 'hl'); mkdirSync(HLDATA, { recursive: true }); for (const f of ['hyperlocal-model.json', 'mach-sun-correction.json', 'nowcast-model.json']) if (existsSync(join(DATA, f))) writeFileSync(join(HLDATA, f), readFileSync(join(DATA, f)));

/* a stub app: fleet (registry from data/mach-fleet-stations.json, a constant served basis), the real live layer, no synop data */
function stubApp(o = {}) {
  const reg = JSON.parse(readFileSync(join(DATA, 'mach-fleet-stations.json'), 'utf8')).stations.filter((s) => s.lat != null);
  const app = { mos: { zoneOfPoint: (la) => (la > 34.5 ? 'mountain' : 'plains') } };
  app.fleet = { stations: () => o.stations || reg, servedAt: o.servedAt || (() => null), offsetFor: () => null, excluded: (k) => (o.excluded || []).includes(k), elevOf: () => null, liveReadings: o.live || (() => []) };
  app.hyperlocal = createHyperlocal(app, HLDATA);   /* a temporary folder with the model files: the layer's 30-h history is written there, not in data/ */
  app.synop = o.synop || { records: () => ({ stations: {}, records: {} }), termAt: () => null, status: () => ({ on: false }) };
  return app;
}

/* ── 0 · the 95th percentile by selection equals the sorted-array quantile (numpy's default, linear) ── */
{ let worst = 0; for (let k = 0; k < 300; k++) { const n = 1 + Math.floor(Math.random() * 3000); const a = Array.from({ length: n }, () => Math.round(Math.random() * 50) / 10);
    const b = a.slice().sort((x, y) => x - y), i = (n - 1) * 0.95, lo = Math.floor(i), hi = Math.ceil(i), ref = b[lo] + (b[hi] - b[lo]) * (i - lo); worst = Math.max(worst, Math.abs(pct(a, 0.95) - ref)); }
  ok(worst < 1e-9, 'P1 the 95th percentile by selection = by sorting (300 random sets with ties)', 'largest difference ' + worst); }

/* ── 1 · the flag: own record, national fallback, minimum n ── */
{
  const t = Date.parse('2026-11-20T12:00:00Z');
  const acc = createAccMon(stubApp(), APP, DATA, { dir: join(tmp, 'f1'), noSchedule: true, noLoad: true, noWrite: true, now: () => t, cities: CITIES });
  const S = acc._snap; for (let k = 1; k <= 20 * 24; k++) { const hk = Math.floor(t / H) * H - k * H; S.set(hk, { Lahore: [0.8 + 0.2 * Math.sin(k / 7), 0.1 * Math.cos(k / 5), 40], Quetta: [2.5, -1.5, 30] }); }
  const ref = acc.reference('Lahore', t); ok(ref.basis === 'own' && ref.maeP95 > 0.9 && ref.maeP95 < 1.01, 'F1 a city with 20 days of its own record is judged on it', JSON.stringify(ref));
  const f = acc.flagsAt(t, { city: { Lahore: { mae: 1.6, bias: 0.05, n: 30 }, Quetta: { mae: 2.4, bias: -1.4, n: 30 } } });
  ok(f.length === 1 && f[0].city === 'Lahore' && /MAE/.test(f[0].why), 'F2 24-h MAE above its own 95th percentile is flagged; a city inside its own range is not', JSON.stringify(f.map((x) => x.city)));
  const f2 = acc.flagsAt(t, { city: { Lahore: { mae: 0.9, bias: 0.6, n: 30 } } });
  ok(f2.length === 1 && /bias/.test(f2[0].why), 'F3 |bias| beyond its own 95th percentile is flagged', f2[0] && f2[0].why);
  ok(acc.flagsAt(t, { city: { Lahore: { mae: 5, bias: 5, n: ACC_RULE.minN - 1 } } }).length === 0, 'F4 fewer than ' + ACC_RULE.minN + ' pairs in 24 h: not judged');
  const S2 = new Map(); for (let k = 25; k <= 25 + 5 * 24; k++) { const hk = Math.floor(t / H) * H - k * H; S2.set(hk, { Lahore: [0.8, 0.1, 40], Quetta: [3.0, -2, 30] }); }
  const r2 = acc.reference('Lahore', t, S2); ok(r2.basis === 'zone' && r2.zone === 'plains' && /plains zone record/.test(r2.why), 'F5 fewer than 14 days of its own record: its zone\'s record (all plains cities), and it says so', r2.why);
  const S5 = new Map(); for (let k = 25; k <= 25 + 5 * 24; k++) S5.set(Math.floor(t / H) * H - k * H, { Lahore: [0.8, 0.1, 40] }); const r5 = acc.reference('Gilgit', t, S5);
  ok(r5.basis === 'national' && /mountain zone holds 0/.test(r5.why), 'F8 national only when the zone holds fewer than ' + ACC_RULE.minRef + ' values', r5.why);
  /* a ~1 C plains fault, 5 days of record: plains cities 0.7-0.9 C, mountain cities 3-5 C */
  const S6 = new Map(); for (let k = 25; k <= 25 + 5 * 24; k++) { const w = Math.sin(k / 6); S6.set(Math.floor(t / H) * H - k * H, { Lahore: [0.8 + 0.1 * w, 0.1 * w, 40], Multan: [0.75 + 0.1 * w, -0.1 * w, 30], Faisalabad: [0.85 + 0.05 * w, 0.2 * w, 20], Gilgit: [3.5 + w, -2.5 + w, 20], Skardu: [4.5 + w, -3 + w, 10] }); }
  const fault = { city: { Lahore: { mae: 1.75, bias: 1.0, n: 40 } } };
  const fz = acc.flagsAt(t, fault, S6), IXn = acc.reference('Lahore', t, S6);
  const natOnly = (() => { const a = [], b = []; for (const c of S6.values()) for (const v of Object.values(c)) { a.push(v[0]); b.push(Math.abs(v[1])); } return { mae: pct(a, 0.95), ab: pct(b, 0.95) }; })();
  ok(fz.length === 1 && /plains zone record/.test(fz[0].reference) && fault.city.Lahore.mae < natOnly.mae && fault.city.Lahore.bias < natOnly.ab, 'F9 a ~1 C plains fault (24-h MAE 1.75, bias +1.0) is flagged under the zone fallback; the national pool would not flag it', 'zone P95 MAE ' + IXn.maeP95 + ' |bias| ' + IXn.absBiasP95 + '; national P95 MAE ' + natOnly.mae.toFixed(2) + ' |bias| ' + natOnly.ab.toFixed(2));
  const S3 = new Map(); S3.set(Math.floor(t / H) * H - 30 * H, { Lahore: [0.8, 0.1, 40] });
  ok(acc.reference('Lahore', t, S3).basis === 'none', 'F6 too few reference values: no flag, the reason given');
  const S4 = new Map(); for (let k = 1; k <= 23; k++) S4.set(Math.floor(t / H) * H - k * H, { Lahore: [9, 9, 40] }); for (let k = 24; k <= 24 + 20 * 24; k++) S4.set(Math.floor(t / H) * H - k * H, { Lahore: [0.8, 0.1, 40] });
  ok(acc.reference('Lahore', t, S4).maeP95 < 1, 'F7 the last 24 h are not part of their own reference');
}

/* ── 1b · 6-h blocks: an evening-only fault, judged against the city's own record of the same block ── */
{
  const t = Date.parse('2026-11-20T19:10:00Z');   /* 00:10 PKT: the 18-24 PKT block of 20 Nov has just ended */
  const acc = createAccMon(stubApp(), APP, DATA, { dir: join(tmp, 'b1'), noSchedule: true, noLoad: true, noWrite: true, now: () => t, cities: CITIES });
  const lastB = acc.blockOf(t) - 6 * H; const B = acc._bsnap;
  for (let d = 1; d <= 20; d++) for (let k = 0; k < 4; k++) { const w = Math.sin(d + k); B.set(lastB - d * D - k * 6 * H, { Lahore: [0.8 + 0.1 * w, 0.15 * w, 40], Multan: [0.8, 0.1, 30] }); }
  B.set(lastB, { Lahore: [1.9, 1.5, 40], Multan: [0.8, 0.1, 30] });
  const ref = acc.blockRef('Lahore', lastB); const f = acc.blockFlags(lastB);
  ok(ref.basis === 'own' && ref.n === 20, 'B1 a block is judged against the same block of the city\'s own past 30 days (20 values)', JSON.stringify(ref));
  ok(f.length === 1 && f[0].city === 'Lahore' && /18-24 PKT block/.test(f[0].why), 'B2 an evening-only fault is flagged and the flag names the block', f[0] && f[0].why);
  /* the same day's 24-h figure would dilute it: 3 normal blocks + the faulty one */
  const day24 = (0.8 * 3 + 1.9) / 4; ok(day24 < 1.1, 'B3 the same fault in the 24-h figure is ' + day24.toFixed(2) + ' °C, inside a 24-h limit near 1 °C');
  const B2 = acc._bsnap; B2.clear(); for (let d = 1; d <= 12; d++) B2.set(lastB - d * D, { Lahore: [0.8, 0.1, 40], Multan: [0.8, 0.1, 30], Faisalabad: [0.9, 0.1, 30], Sargodha: [0.7, 0.1, 30], Okara: [0.8, 0.1, 30], Kasur: [0.8, 0.1, 30], Sahiwal: [0.8, 0.1, 30], Jhang: [0.8, 0.1, 30], Chiniot: [0.8, 0.1, 30], Vehari: [0.8, 0.1, 30] });
  const rz = acc.blockRef('Lahore', lastB); ok(rz.basis === 'zone' && /plains zone 18-24 PKT record/.test(rz.why), 'B4 under 14 days of its own: the zone\'s same block', rz.why);
}

/* ── 2 · leave-one-out live layer ── */
{
  const app = stubApp(); const HL = app.hyperlocal;
  const rows = [['a', 33.70, 73.05, 2.0], ['b', 33.68, 73.07, 0.3], ['c', 33.66, 73.03, 0.2], ['d', 33.72, 73.01, 0.1]].map(([key, lat, lon, res]) => ({ key, name: key, lat, lon, obsMs: Date.now(), res }));
  const all = HL.looAt(33.70, 73.05, null, rows), loo = HL.looAt(33.70, 73.05, 'a', rows);
  ok(all.dT > loo.dT + 0.5 && loo.stations === 3, 'L1 the scored station is left out of the layer at its own point', 'with ' + all.dT + ', without ' + loo.dT);
  const far = HL.looAt(30.0, 70.0, null, rows); ok(far.dT === 0 && !far.applied, 'L2 no station within the radius: no live term');
  const CAP = JSON.parse(readFileSync(join(DATA, 'hyperlocal-model.json'), 'utf8')).cap_c; const big = HL.looAt(33.69, 73.05, null, rows.map((r) => ({ ...r, res: 9 })));
  ok(CAP == null ? big.dT > 3 : big.dT <= CAP + 1e-9, 'L3 the served cap rule is the model file\'s (cap_c ' + CAP + '): ' + big.dT);
}

/* ── 3 · synthetic replay: a frozen record alternating with real readings warms the as-served layer; the screen removes it ── */
{
  const dir = join(tmp, 'db3'); mkdirSync(dir, { recursive: true });
  const st = [['s1', 33.70, 73.05], ['s2', 33.68, 73.07], ['s3', 33.66, 73.03], ['s4', 33.72, 73.01], ['s5', 33.69, 73.10]];
  const t0 = Date.parse('2026-10-16T10:00:00Z'); const lines = ['stationKey,time,source,temperatureC,dewPointC,humidityPct,pressureHpa'];
  for (let m = 0; m <= 8 * 60; m += 10) { const ms = t0 + m * 60e3; const real = 26 - m / 60;   /* cooling 1 C/h into the evening */
    st.forEach(([k], i) => { const frozen = i >= 2 && m > 120 && (m / 10) % 2 === 0;   /* three stations replay a 12:00 UTC record every other reading */
      const r = frozen ? { T: 26.0 - 2 + 0.01 * i, Td: 15.5, RH: 52 + i, P: 955.12 + i } : { T: real + 0.1 * i, Td: 14 + 0.01 * m, RH: 55 + (m % 7), P: 955 + i + 0.001 * m };
      if (frozen && m === 130) { /* the record the station sent at 12:00 UTC is what comes back */ }
      lines.push([k, new Date(ms).toISOString().replace('.000Z', 'Z'), 'wu', r.T.toFixed(2), r.Td.toFixed(2), r.RH.toFixed(1), r.P.toFixed(2)].join(',')); }); }
  /* the frozen copy: make the replayed record identical to the one each station sent at m = 120 */
  const L = lines.slice(1).map((l) => l.split(',')); const at120 = new Map(L.filter((c) => Date.parse(c[1]) === t0 + 120 * 60e3).map((c) => [c[0], c]));
  for (const c of L) { const m = (Date.parse(c[1]) - t0) / 60e3; const i = st.findIndex((x) => x[0] === c[0]); if (i >= 2 && m > 120 && (m / 10) % 2 === 0) { const a = at120.get(c[0]); c[3] = a[3]; c[4] = a[4]; c[5] = a[5]; c[6] = a[6]; } }
  writeFileSync(join(dir, 'obs_20261016.csv'), [lines[0], ...L.map((c) => c.join(','))].join('\n') + '\n');
  const stations = st.map(([key, lat, lon]) => ({ key, name: key, lat, lon }));
  const servedAt = (key, h) => { const ms = Date.parse(h + ':00:00Z'); return 26 - (ms - t0) / H; };   /* a served basis that is right */
  const acc = createAccMon(stubApp({ stations, servedAt }), APP, DATA, { inline: true, dir: join(tmp, 'f3'), dbDir: dir, pairsDir: join(tmp, 'none'), synopDir: join(tmp, 'none'), noSchedule: true, noLoad: true, now: () => t0 + 8 * H, cities: CITIES });
  const r = await acc.replay({ basis: 'cache', synop: false });
  let preE = [], postE = []; for (const [T, M] of r.pairs) { if (T < t0 + 4 * H) continue; for (const [, v] of M) { preE.push(v.pre - v.o); postE.push(v.post - v.o); } }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  ok(r.ok && r.screened.rejected > 0, 'R1 the replay reads the database day and the stuck screen rejects the replayed records', JSON.stringify(r.screened));
  ok(mean(preE) > 0.3 && Math.abs(mean(postE)) < 0.2, 'R2 as served before the hotfix the clean stations are served warm; with the screen not', 'pre bias ' + mean(preE).toFixed(2) + ', post ' + mean(postE).toFixed(2));
  await acc.selftest({ replayed: r });   /* a self-test before the backfill must not keep the stations out of the file */
  const bf = await acc.backfill({ basis: 'cache', synop: false, hotfixAt: new Date(t0 + 6 * H).toISOString() });
  ok(bf.done && bf.pairs > 0, 'R3 the backfill writes the as-served record (pre before the hotfix time, post after)', bf.pairs + ' pairs');
  const f = readdirSync(join(tmp, 'f3')).filter((x) => x.endsWith('.jsonl')); const txt = f.length ? readFileSync(join(tmp, 'f3', f[0]), 'utf8') : '';
  ok(/"ty":"h"/.test(txt) && /"ty":"m"/.test(txt) && /"ty":"s"/.test(txt) && /"src":"backfill"/.test(txt), 'R4 data/accmon/YYYY-MM.jsonl holds pairs, stations and hourly snapshots', (txt.length / 1024).toFixed(1) + ' kB');
  const acc2 = createAccMon(stubApp({ stations, servedAt }), APP, DATA, { dir: join(tmp, 'f3'), noSchedule: true, now: () => t0 + 8 * H, cities: CITIES });
  ok(acc2.status().pairsHeld === acc.status().pairsHeld && acc2.status().pairsHeld > 0, 'R5 a restart reads the record back', acc2.status().pairsHeld + ' pairs');
  const again = await acc2.backfill({ basis: 'cache', synop: false }); ok(again.done === false, 'R6 the backfill runs once (the monitor already holds pairs)');
}

/* ── 3b · the backfill reads the fleet pairs file on days the copies do not hold (the laptop's file runs from 23 Sep) ── */
{
  const pd = join(tmp, 'pairs3b'); mkdirSync(pd, { recursive: true });
  const st = [['p1', 31.52, 74.35], ['p2', 31.50, 74.30], ['p3', 31.55, 74.40]]; const t0 = Date.parse('2026-09-23T00:00:00Z'); const L = ['paired_utc,key,lat,lon,model_elev_m,obs_utc,hour_utc,lead_h,temp_c,rh_pct,dew_c,wind_kmh,fc_raw_c,fc_served_c,fc_rh_pct,fc_served_rh_pct,fc_wind_kmh,corrected'];
  for (let h = 0; h < 20 * 24; h++) { const ms = t0 + h * H; for (const [k, la, lo] of st) L.push([new Date(ms).toISOString(), k, la, lo, 210, new Date(ms - 5 * 60e3).toISOString(), new Date(ms).toISOString().slice(0, 13) + ':00Z', 0, (25 + Math.sin(h / 4) + 0.3).toFixed(1), 50, 12 + (h % 3) * 0.1, 3, 25, (25 + Math.sin(h / 4)).toFixed(1), 50, 50, 3, 1].join(',')); }
  writeFileSync(join(pd, 'fleet_pairs_2026-09.csv'), L.slice(0, 1 + 8 * 24 * 3).join('\n') + '\n'); writeFileSync(join(pd, 'fleet_pairs_2026-10.csv'), [L[0], ...L.slice(1 + 8 * 24 * 3)].join('\n') + '\n');
  const stations = st.map(([key, lat, lon]) => ({ key, name: key, lat, lon })); const tNow = t0 + 20 * D;
  const acc = createAccMon(stubApp({ stations }), APP, DATA, { dir: join(tmp, 'f3b'), dbDir: join(tmp, 'nodb'), pairsDir: pd, synopDir: join(tmp, 'none'), noSchedule: true, noLoad: true, now: () => tNow, cities: CITIES });
  const bf = await acc.backfill({ synop: false, fromMs: t0 });
  ok(bf.done && bf.pairsDays >= 19 && bf.pairs > 1000, 'R7 with no database day held, the backfill fills 20 days from the fleet pairs file', JSON.stringify({ pairsDays: bf.pairsDays, pairs: bf.pairs, hours: bf.hours }));
  const ref = acc.reference('Lahore', tNow); ok(ref.basis === 'own', 'R8 after that backfill the city is judged on its own record from the first run', ref.why + ', n ' + ref.n);
}

/* ── 3c · v91.17.273.1 · the backfill never holds customers: worker thread, resume after a restart, start only when quiet ── */
{
  const pd = join(tmp, 'pairs3b');   /* the 20-day pairs file of 3b */
  const reg = [['p1', 31.52, 74.35], ['p2', 31.50, 74.30], ['p3', 31.55, 74.40]].map(([key, lat, lon]) => ({ key, name: key, lat, lon }));
  const t0 = Date.parse('2026-09-23T00:00:00Z'), tNow = t0 + 20 * D;
  /* a restart in the middle: a progress line up to day 10 -> the next backfill starts after it */
  const dir = join(tmp, 'f3c'); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '2026-10.jsonl'), JSON.stringify({ ty: 'bf', at: new Date(t0 + 10 * D).toISOString(), from: new Date(t0).toISOString().slice(0, 16) + 'Z', to: new Date(tNow).toISOString().slice(0, 16) + 'Z', upto: new Date(t0 + 10 * D).toISOString().slice(0, 16) + 'Z', done: false, pairs: 700 }) + '\n');
  const accR = createAccMon(stubApp({ stations: reg }), APP, DATA, { dir, dbDir: join(tmp, 'nodb'), pairsDir: pd, synopDir: join(tmp, 'none'), noSchedule: true, now: () => tNow, cities: CITIES });
  const r = await accR.backfill({ synop: false });
  ok(r.done && r.resumedFrom && Date.parse(r.resumedFrom) === t0 + 10 * D + H && r.hours > 200 && r.hours < 260, 'R9 after a restart the backfill resumes after the last day written', JSON.stringify({ resumedFrom: r.resumedFrom, hours: r.hours }));
  ok(r.eventLoopDelayMaxMs != null && r.eventLoopDelayMaxMs < 100, 'R10 the backfill (worker thread) holds the event loop < 100 ms', 'max ' + r.eventLoopDelayMaxMs + ' ms, p99 ' + r.eventLoopDelayP99Ms + ' ms');
  /* the first start waits for warm + 5 quiet minutes */
  const app = stubApp({ stations: reg }); const nowR = Date.now(); app.warm = { ready: true, at: new Date(nowR - 60e3).toISOString() };
  const accQ = createAccMon(app, APP, DATA, { dir: join(tmp, 'f3q'), dbDir: join(tmp, 'nodb'), pairsDir: pd, synopDir: join(tmp, 'none'), noSchedule: true, cities: CITIES });
  await accQ._job(); ok(!accQ.status().backfill && /waits/.test(accQ.status().waiting || ''), 'Q1 1 min after warm: no backfill, it waits', accQ.status().waiting);
  app.warm.at = new Date(nowR - 6 * 60e3).toISOString(); app.lastCustomerAt = nowR - 30e3; await accQ._job(); ok(!accQ.status().backfill, 'Q2 a customer request 30 s ago: still waiting');
  app.lastCustomerAt = nowR - 6 * 60e3; await accQ._job(); ok(accQ.status().backfill && accQ.status().backfill.done !== undefined && accQ.status().runs === 1, 'Q3 warm + 5 quiet minutes: the backfill and the hourly run start', JSON.stringify({ backfill: accQ.status().backfill && (accQ.status().backfill.done ? 'done' : accQ.status().backfill.why), runs: accQ.status().runs }));
}

/* ── 4 · live collection, run cost, freshness ── */
{
  const t = Date.parse('2026-10-20T10:05:00Z'); const reg = JSON.parse(readFileSync(join(DATA, 'mach-fleet-stations.json'), 'utf8')).stations.filter((s) => s.lat != null);
  const live = () => reg.slice(0, 90).map((s, i) => ({ key: s.key, name: s.name, lat: s.lat, lon: s.lon, obsMs: t - 5 * 60e3, tempC: 25 + (i % 7) * 0.3, served: 25.2, offset: null }));
  const tk = new Date(t - 2 * H).toISOString().slice(0, 13) + ':00:00Z';
  const SY = { stations: { '41571': { name: 'Islamabad', lat: 33.62, lon: 73.1, elevM: 508, kind: 'synop' }, '41710': { name: 'Dalbandin', lat: 28.88, lon: 64.4, elevM: 848, kind: 'synop' } }, records: { '41571': { [tk]: { o: 24, s: 25 } }, '41710': { [tk]: { o: 30, s: 29 } } } };
  const app = stubApp({ live, excluded: [reg[0].key], synop: { records: () => SY, termAt: () => 0.4, status: () => ({ on: true, lastPoll: new Date(t - 30 * 60e3).toISOString() }) } });
  app.copiesRetention = { status: () => ({ on: true, lastRun: null, ok: null }) };
  const acc = createAccMon(app, join(tmp, 'app4'), DATA, { dir: join(tmp, 'f4'), noSchedule: true, noLoad: true, now: () => t, cities: CITIES });
  /* 7 days x 100 stations of history, then one run */
  const id = (k) => 'm:' + reg[k % reg.length].key; for (let h = 1; h <= 168; h++) for (let k = 0; k < 100; k++) acc._add(Math.floor(t / H) * H - h * H, id(k) + (k >= reg.length ? '_' + k : ''), 20 + (k % 5), 20.5, new Map());
  for (const s of reg) acc._meta.set('m:' + s.key, { name: s.name, lat: s.lat, lon: s.lon, kind: 'mach', zone: 'plains', cities: CITIES.filter((c) => Math.hypot(c.lat - s.lat, c.lon - s.lon) < 0.36).map((c) => c.name) });
  const r = await acc.run(); const first = acc.status().cpuMs; const again = await acc.run(); const s = acc.status();
  ok(r.added.mach === 90, 'C1 every station of the poll is paired once an hour (v91.17.283.14: no station is excluded; the live readings carry only values that passed obsqc.mjs)', JSON.stringify(r.added));
  ok(again.added.mach === 0, 'C2 the same station-hour is never paired twice');
  ok(r.added.synop === 1, 'C3 a synoptic report is paired (own served value + running term + live term); one inside the MACH radius whose live-layer hour is not held is left out', JSON.stringify(r.added));
  ok(s.cpuMs != null && s.cpuMs < 50, 'C4 one hourly run with 7 days x 100 stations held costs < 50 ms CPU', 'first run ' + first + ' ms (90 new stations), next ' + s.cpuMs + ' ms (parts ' + JSON.stringify(s.partsMs) + ')');
  ok(r.h24.national && r.h24.national.n > 0 && r.d7.national.n > r.h24.national.n && Object.keys(r.h24.zone).length >= 1, 'C5 24 h and 7 d statistics, national and by zone', '24 h n ' + r.h24.national.n + ', 7 d n ' + r.d7.national.n);
  const isb = r.h24.city.Islamabad; ok(isb && isb.worst && isb.worst.name && isb.n >= ACC_RULE.minN, 'C6 a city cluster carries MAE, bias, n and its worst station', isb ? JSON.stringify({ mae: isb.mae, bias: isb.bias, n: isb.n, worst: isb.worst.name }) : 'none');
  const fj = r.freshness.flags.join(' | '); ok(/ensemble archive/.test(fj) && /copies retention: never run/.test(fj) && !/synoptic poll/.test(fj), 'C7 job freshness: no ensemble save today and a never-run retention are flagged; a fresh synoptic poll is not', fj);
  const hh = acc.health(); ok(hh.on && hh.pairs24h > 0 && Array.isArray(hh.jobFlags), 'C8 /health summary: pairs, flagged cities, job flags');
  app.ensArchive = { status: () => ({ newest: { ecmwf_ifs025: { init: new Date(t - 20 * H).toISOString(), limitH: 38.4 }, ncep_gefs025: { init: new Date(t - 10 * H).toISOString(), limitH: 32.3 } } }) };
  const e1 = acc.freshness(); app.ensArchive = { status: () => ({ newest: { ecmwf_ifs025: { init: new Date(t - 45 * H).toISOString(), limitH: 38.4 } } }) }; const e2 = acc.freshness();
  ok(!e1.flags.some((x) => /ensemble/.test(x)) && e2.flags.some((x) => /ensemble archive: ecmwf_ifs025 newest .* 45 h old \(limit 38 h\)/.test(x)), 'C9 ensemble archive: no save yet today is normal while every model\'s newest run is inside its own limit; a model past it is flagged', e2.flags.join(' | '));
  /* v91.17.276 · /health jobFlags follow the retention job's current state, not the copy taken at the last accuracy run (live v274: "copies
     retention: last run failed" on accMon while copiesRetention said ok:true after the fixed run) */
  app.copiesRetention = { status: () => ({ on: true, lastRun: new Date(t - 2 * H).toISOString(), ok: false, error: 'test' }) }; await acc.run();
  const h1 = acc.health().jobFlags.join(' | '); app.copiesRetention = { status: () => ({ on: true, lastRun: new Date(t - 1 * H).toISOString(), ok: true, error: null }) };
  const h2 = acc.health().jobFlags.join(' | '), s2 = (acc.status().freshness.flags || []).join(' | ');
  ok(/copies retention: last run failed/.test(h1) && !/copies retention/.test(h2) && !/copies retention/.test(s2), 'C10 a fixed retention run clears its job flag on /health at once (no stale "last run failed")', h1 + ' -> ' + (h2 || '(none)'));
}

/* ── 5 · the real copied database (6-16 Oct 2026) with the recorded served basis: the evening fault and its removal ── */
if (existsSync(join(DB, 'obs_20261012.csv')) && existsSync(join(PAIRS, 'fleet_pairs_2026-10.csv'))) {
  const app = stubApp();
  const acc = createAccMon(app, APP, DATA, { dir: join(tmp, 'f5'), dbDir: DB, pairsDir: PAIRS, synopDir: join(tmp, 'none'), noSchedule: true, noLoad: true, noWrite: true, now: () => Date.parse('2026-10-16T16:30:00Z'), cities: CITIES });
  const st = await acc.selftest({ basis: 'pairs', synop: false, detailCity: 'Islamabad' });
  const row = (c, d, p) => st.table.find((x) => x.city === c && x.day === d && x.part === p);
  const e12 = row('Islamabad', '2026-10-12', 'evening 17-23'), d12 = row('Islamabad', '2026-10-12', 'day 09-16');
  ok(e12 && e12.maePre - e12.maePost > 0.8 && e12.biasPre > 1, 'S1 Islamabad 12 Oct 17-23 PKT: as served (every reading) vs screened', e12 && JSON.stringify(e12));
  ok(d12 && Math.abs(d12.maePre - d12.maePost) <= 0.1, 'S2 Islamabad 12 Oct 09-16 PKT unchanged within 0.1 °C', d12 && JSON.stringify(d12));
  const ev = st.table.filter((x) => x.part === 'evening 17-23' && x.n >= 20 && x.day >= '2026-10-06')   /* the database days (10-min readings, what the screen is defined on) */, worse = ev.filter((x) => x.maePost > x.maePre + 0.25);
  ok(worse.length <= Math.max(1, Math.round(ev.length * 0.05)), 'S3 database days: no city evening (n >= 20) worse by more than 0.25 °C with the screen beyond 5 % of them', worse.length + ' of ' + ev.length + (worse.length ? ': ' + worse.map((x) => x.city + ' ' + x.day).join(', ') : ''));
  const f12 = st.flags.find((f) => f.at.startsWith('2026-10-12 23'));
  ok(f12 && f12.preVsCleanOwnAnyLength.some((x) => /^Islamabad/.test(x)) && !f12.postVsCleanOwnAnyLength.includes('Islamabad'), 'S4 the as-served 24 h at 12 Oct 23:00 PKT is flagged against Islamabad\'s clean record; the screened one is not', f12 && JSON.stringify(f12.city && { pre: f12.city.pre && [f12.city.pre.mae, f12.city.pre.bias], post: f12.city.post && [f12.city.post.mae, f12.city.post.bias], refOwn: [f12.city.refOwn.maeP95, f12.city.refOwn.absBiasP95] }));
  const st2 = await acc.selftest({ basis: 'pairs', synop: false, detailCity: 'Islamabad', fromMs: Date.parse('2026-09-23T00:00:00Z') });
  const f9 = st2.flags.find((f) => f.at.startsWith('2026-10-09 23')), b12 = st2.blockTable.find((b) => b.day === '2026-10-12' && b.block === '18-24 PKT'), b11 = st2.blockTable.find((b) => b.day === '2026-10-11' && b.block === '18-24 PKT');
  ok(f9 && f9.city.refRule.basis === 'own', 'S5 backfill from 23 Sep (the pairs file copy) + the database days: Islamabad is judged on its own record by 9 Oct', f9 && f9.city.refRule.why + ' (' + st2.pairsDays + ' pairs-file days, ' + st2.dbDays + ' database days)');
  ok(b11 && b12 && b11.flagPre && b12.flagPre && !b11.flagPost && !b12.flagPost, 'S6 the as-served 18-24 PKT blocks of 11 and 12 Oct are flagged against Islamabad\'s own same-block record; the screened ones are not', b12 && (b11.flagPre + ' | ' + b12.flagPre));
} else { skip++; console.log('SKIP S1-S4 (no copied database days / pairs file at ' + DB + ', ' + PAIRS + ')'); }

/* ── 6 · the server ── */
if (BASE) {
  const get = async (p, h = {}) => { try { const r = await fetch(BASE + p, { headers: h, signal: AbortSignal.timeout(300000) }); return { s: r.status, j: await r.json().catch(() => null) }; } catch (e) { return { s: 0, e: e.message }; } };
  const h = await get('/health'); ok(h.s === 200 && h.j && h.j.accMon && 'citiesFlagged' in h.j.accMon && 'jobFlags' in h.j.accMon, 'E1 /health carries accMon', h.j && JSON.stringify(h.j.accMon));
  const c = await get('/api/accuracy', { 'x-agn-view': 'customer' }); ok(c.s === 403, 'E2 the customer view gets no accuracy figures (403)', String(c.s));
  const o = await get('/api/accuracy?run=1'); ok(o.s === 200 && o.j && o.j.ok && o.j.rule && o.j.rule.refPct === 0.95, 'E3 the operator gets the monitor', o.j && ('runs ' + o.j.runs + ', pairs ' + o.j.pairsHeld + ', cpu ' + o.j.cpuMs + ' ms'));
  const v1 = await get('/api/v1/accuracy'); ok(v1.s !== 200 || !(v1.j && v1.j.h24), 'E4 no other path serves it');
} else { skip++; console.log('SKIP E1-E4 (no server: pass its URL as the first argument)'); }

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} PASS, ${fail} FAIL, ${skip} skipped`); process.exit(fail ? 1 : 0);
