// v91.17.280 SYN280 (c2): the synop running term at a point with its own MACH station (one the live layer serves from) is kept per day-part only where it helped
// there over the previous 10 PKT days. Unit checks of the rule + held-out replay at MACH 105 / 108 / Kanju (GILGIT280 offline numbers).
// Runs standalone (no server): node scripts/tests280/syn280.test.mjs
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createSynop, c2Decide, dayPart, pktDay } from '../../server/api/synop.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..'), FX = join(HERE, 'fixtures', 'syn280');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m); } };
const H = 3600e3, PKT = 5 * H;
const pktMs = (y, mo, d, h) => Date.UTC(y, mo - 1, d, h) - PKT;   // a PKT clock time as UTC ms

// ---- U1-U6 the rule
ok(dayPart(pktMs(2026, 10, 15, 9)) === 'day' && dayPart(pktMs(2026, 10, 15, 16)) === 'day' && dayPart(pktMs(2026, 10, 15, 20)) === 'night' && dayPart(pktMs(2026, 10, 15, 5)) === 'night' && dayPart(pktMs(2026, 10, 15, 17)) === 'between' && dayPart(pktMs(2026, 10, 15, 7)) === 'between', 'U1 day-parts: day 09-16, night 20-05, between otherwise (PKT)');
const today = pktDay(pktMs(2026, 10, 18, 0));
const mk = (d, h, obs, w, wo) => ({ hourMs: pktMs(2026, 10, d, h), obs, withT: w, withoutT: wo });
const rows = [];
for (let d = 8; d <= 17; d++) { rows.push(mk(d, 2, 10, 7, 10.5)); rows.push(mk(d, 12, 20, 20.2, 21)); }   // night: term hurts; day: term helps
const D1 = c2Decide(rows, today);
ok(D1.night.keep === false && D1.night.n === 10 && D1.night.maeWith === 3 && D1.night.maeWithout === 0.5, 'U2 night: MAE with 3.0 > without 0.5 -> dropped (n 10)');
ok(D1.day.keep === true && D1.day.maeWith === 0.2 && D1.day.maeWithout === 1, 'U3 day: MAE with 0.2 <= without 1.0 -> kept');
ok(D1.between.keep === true && D1.between.n === 0 && /fewer than 4/.test(D1.between.why), 'U4 no pairs in a part -> kept (behaviour before the rule)');
const D2 = c2Decide(rows.filter((r) => pktDay(r.hourMs) >= today - 3), today);
ok(D2.night.n === 3 && D2.night.keep === true, 'U5 insufficient n (3 < 4) -> kept even where the term hurt');
const D3 = c2Decide([...rows, mk(18, 2, 10, 10, 0), mk(7, 2, 10, 10, 0), mk(7, 3, 10, 10, 0)], today);
ok(D3.night.n === 10 && D3.night.maeWith === 3, 'U6 window = the 10 PKT days before today (today and day -11 not counted)');
const tie = c2Decide([1, 2, 3, 4].map((d) => mk(10 + d, 12, 20, 21, 19)), today);
ok(tie.day.keep === true, 'U7 equal MAE -> kept (with <= without)');

// ---- a data dir in the server layout: <D>/nig/nigraan-local/data + <D>/nig/station-lake/archive/{fleet,synop}
const D = mkdtempSync(join(tmpdir(), 'syn280-')); const DATA = join(D, 'nig', 'nigraan-local', 'data');
mkdirSync(join(DATA, 'cache'), { recursive: true }); copyFileSync(join(ROOT, 'data', 'synop-stations.json'), join(DATA, 'synop-stations.json'));
writeFileSync(join(DATA, 'cache', 'synop-recent.json'), '{}');
const LF = join(D, 'nig', 'station-lake', 'archive', 'fleet'), LS = join(D, 'nig', 'station-lake', 'archive', 'synop'); mkdirSync(LF, { recursive: true }); mkdirSync(LS, { recursive: true });
for (const f of ['fleet_pairs_2026-09.csv', 'fleet_pairs_2026-10.csv']) copyFileSync(join(FX, f), join(LF, f)); for (const f of ['synop_2026-09.jsonl', 'synop_2026-10.jsonl']) copyFileSync(join(FX, f), join(LS, f));
const REG = [{ key: 'gilgit', no: 105, name: 'Gilgit', lat: 35.901151, lon: 74.369656 }, { key: 'danyore', no: 108, name: 'Jutial, Gilgit', lat: 35.908035, lon: 74.341667 }, { key: 'kanju_avenue', no: 84, name: 'Kanju, Swat', lat: 34.834073, lon: 72.346807 },
  { key: 'mach1', no: 1, name: 'I-8, Islamabad', lat: 33.66467, lon: 73.08307 }];
let trusted = new Set(['gilgit', 'danyore', 'kanju_avenue']);
const app = { fleet: { stations: () => REG, excluded: () => false, runningStatus: () => ({ rule: { t_reach_km: 1.0, dz_m: 150 } }), offsetFor: (k) => (trusted.has(k) ? { off: { day: 0, night: 2.65, between: 0 } } : { heldOut: true, why: 'unsteady' }), screen: () => ({ trusted: false, verdict: 'unscreened' }) } };
const S = createSynop(app, DATA);

// ---- R held-out replay, 12-19 Oct 2026 PKT: each day decided from the 10 PKT days before it (as offline GILGIT280 replay_test_c2.csv)
const OFF = 'danyore|14|night:1,danyore|15|between:1,danyore|15|day:1,danyore|15|night:1,danyore|16|between:1,danyore|16|day:1,danyore|16|night:1,danyore|17|between:1,danyore|17|day:1,danyore|17|night:1,danyore|18|between:1,danyore|18|day:1,danyore|18|night:1,danyore|19|between:1,danyore|19|night:1,gilgit|12|between:0,gilgit|12|day:1,gilgit|12|night:1,gilgit|13|between:0,gilgit|13|day:1,gilgit|13|night:0,gilgit|14|between:0,gilgit|14|day:1,gilgit|14|night:0,gilgit|15|between:0,gilgit|15|day:1,gilgit|15|night:0,gilgit|16|between:0,gilgit|16|day:1,gilgit|16|night:0,gilgit|17|between:0,gilgit|17|day:1,gilgit|17|night:0,gilgit|18|between:0,gilgit|18|day:1,gilgit|18|night:0,gilgit|19|between:0,gilgit|19|night:0,kanju_avenue|14|between:1,kanju_avenue|14|night:1,kanju_avenue|15|between:1,kanju_avenue|15|day:1,kanju_avenue|15|night:1,kanju_avenue|16|between:1,kanju_avenue|16|day:1,kanju_avenue|16|night:1,kanju_avenue|17|between:1,kanju_avenue|17|day:1,kanju_avenue|17|night:1,kanju_avenue|18|between:1,kanju_avenue|18|day:1,kanju_avenue|18|night:1,kanju_avenue|19|night:0';
const offDec = new Map(OFF.split(',').map((x) => { const [k, v] = x.split(':'); return [k, v === '1']; }));
// near-ties: two MACH 105 decisions rest on training MAEs a few hundredths apart, and which of two pairs of the same hour at the same lead
// is kept (the hour paired again by a later poll; 190 such hours at the three stations) tips them: offline pandas' unstable sort kept an
// arbitrary one; the server keeps the reading nearest the hour (Gilgit 12 Oct night 2.823 vs 2.776 with the first-in-file pair; 13 Oct day
// printed below). For these two the replay is also scored with the offline decision, so the rest of the chain is compared like for like.
const NEAR_TIE = new Set(['gilgit|12|night', 'gilgit|13|day']);
const want = { gilgit: [2.37, 1.63, 144], danyore: [1.24, 1.24, 70], kanju_avenue: [1.68, 1.67, 88] };
const acc = {}; for (const k of Object.keys(want)) acc[k] = [0, 0, 0, 0]; const mism = [];
for (let d = 12; d <= 19; d++) {
  const C = await S.c2Refresh(pktMs(2026, 10, d, 0));
  for (const k of Object.keys(want)) { const st = C.stations[k]; if (!st) continue;
    for (const r of C.rows[k] || []) { if (pktDay(r.hourMs) !== pktDay(pktMs(2026, 10, d, 0))) continue;
      const part = dayPart(r.hourMs), id = k + '|' + d + '|' + part, keep = st.parts[part].keep;
      if (offDec.has(id) && offDec.get(id) !== keep && !mism.includes(id)) { mism.push(id); console.log(`  ${id}: server ${keep ? 'kept' : 'dropped'} (training MAE with ${st.parts[part].maeWith} / without ${st.parts[part].maeWithout}, n ${st.parts[part].n}); offline ${offDec.get(id) ? 'kept' : 'dropped'}`); }
      const a = acc[k]; a[0]++; a[1] += Math.abs(r.obs - r.withT); a[2] += Math.abs(r.obs - (keep ? r.withT : r.withoutT));
      const ko = NEAR_TIE.has(id) ? offDec.get(id) : keep; a[3] += Math.abs(r.obs - (ko ? r.withT : r.withoutT)); } }
}
console.log('  decisions different from offline:', mism.join(' ') || 'none');
ok(mism.every((x) => NEAR_TIE.has(x)), 'R0 every day-part decision 12-19 Oct equals the offline one (except the two documented near-ties at MACH 105)');
for (const [k, [m0, m1, n]] of Object.entries(want)) { const a = acc[k]; const b = a[1] / a[0], c = a[2] / a[0], c2 = a[3] / a[0];
  console.log(`  ${k}: n ${a[0]} (offline ${n}) MAE as served ${b.toFixed(3)} -> rule ${c.toFixed(3)}; with the offline near-tie decision ${c2.toFixed(3)} (offline ${m0} -> ${m1})`);
  ok(a[0] === n && Math.abs(b - m0) <= 0.05 && Math.abs(c2 - m1) <= 0.05 && c <= b, `R ${k}: n ${a[0]}, MAE ${b.toFixed(2)} -> ${c.toFixed(2)} (offline-decision replay ${c2.toFixed(2)} within 0.05 of ${m0} -> ${m1})`); }

// ---- A1-A4 the served chain at a point (frozen clock 16 Oct 2026 03:00 PKT; table of that day)
const T0 = pktMs(2026, 10, 16, 3); const realNow = Date.now; Date.now = () => T0;
try {
  const RX = {}; for (const l of ['09', '10'].map((m) => (readFileSync(join(FX, 'synop_2026-' + m + '.jsonl'), 'utf8'))).join('').split('\n')) { if (!l) continue; const j = JSON.parse(l); if (Date.parse(j.t) > T0) continue; (RX[j.sid] || (RX[j.sid] = {}))[j.t] = { o: j.t_c, s: j.served_c }; }
  Object.assign(S.records().records, RX);
  await S.c2Refresh(T0); const C = S.c2Table();
  const loc = (lat, lon, el) => { const t = []; for (let i = -6; i < 30; i++) t.push(new Date(Math.floor(T0 / H) * H + i * H).toISOString().slice(0, 16)); return { latitude: lat, longitude: lon, elevation: el, utc_offset_seconds: 0, hourly: { time: t, temperature_2m: t.map(() => 10) }, current: { time: new Date(Math.floor(T0 / H) * H).toISOString().slice(0, 16), temperature_2m: 10 } }; };
  const g = C.stations.gilgit; console.log('  table 16 Oct, MACH 105:', JSON.stringify(g && g.parts));
  const A = loc(35.901151, 74.369656, 1496); S.apply(A, 35.901151, 74.369656);
  const T = A.agn_synop && A.agn_synop.stationTest;
  ok(!!T && T.station === 'Gilgit' && ['day', 'night', 'between'].every((p) => T.parts[p] && ['kept', 'dropped'].includes(T.parts[p].decision) && Number.isFinite(T.parts[p].n)), 'A1 point at MACH 105: decision, both MAEs and n logged per day-part (agn_synop.stationTest)');
  const nightDropped = g.parts.night.keep === false;
  const nightIdx = A.hourly.time.map((t, i) => [t, i]).filter(([t]) => dayPart(Date.parse(t + 'Z')) === 'night').map(([, i]) => i);
  ok(nightDropped && nightIdx.every((i) => A.hourly.temperature_2m[i] === 10), 'A2 MACH 105 night: term dropped by the rule, night hours unchanged (no synop term)');
  const B = loc(35.919, 74.334, 1457); S.apply(B, 35.919, 74.334);
  ok(B.agn_synop && B.agn_synop.applied && !B.agn_synop.stationTest && nightIdx.some((i) => B.hourly.temperature_2m[i] !== 10), 'A3 the Gilgit synop site itself (no own MACH station within reach): term applied as before, no station test');
  trusted = new Set(); const E = loc(35.901151, 74.369656, 1496); S.apply(E, 35.901151, 74.369656);
  /* v91.17.283.14 · no station is held out of the live layer any more (a siting-offsets flag only drops the offset): the station's own test applies as at A1-A2 */
  ok(E.agn_synop && E.agn_synop.stationTest && nightIdx.every((i) => E.hourly.temperature_2m[i] === 10), 'A4 same point, station flagged by its siting offsets: still the point\'s own station (no station is held out), its test applies (night term dropped)', JSON.stringify(E.agn_synop && { applied: E.agn_synop.applied, test: !!E.agn_synop.stationTest }));
  trusted = new Set(['gilgit', 'danyore', 'kanju_avenue']);
  process.env.NIGRAAN_SYNOP_C2 = '0'; const F = loc(35.901151, 74.369656, 1496); S.apply(F, 35.901151, 74.369656); delete process.env.NIGRAAN_SYNOP_C2;
  ok(F.agn_synop && F.agn_synop.applied && !F.agn_synop.stationTest, 'A5 NIGRAAN_SYNOP_C2=0: the rule is off, term as before');
} finally { Date.now = realNow; rmSync(D, { recursive: true, force: true }); }
console.log(`\n${pass} PASS, ${fail} FAIL`); process.exit(fail ? 1 : 0);
