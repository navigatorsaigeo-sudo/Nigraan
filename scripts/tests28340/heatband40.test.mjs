/* v91.17.283.40 · heat-index band by day (owner "ok both", 31 Oct 2026). Fixed reference cases + one-value checks + freeze of the record.
   A heatIndexDays: hand-checked NWS values (SR 90-23 / heatIndexRaw), bands on the published onsets, a refused hour (dry bulb 44 C) ->
     outside range (no extrapolation), a missing hour -> incomplete (never filled), lead 0 -> not tested, Extreme Danger -> "Danger or higher"
   B applyHeatIndex on the held engine record: lead days 1-3 only, own words, counts, no other layer touched (freeze)
   C one server value: the engine's unit answer (client and operator) and its national levels read the same cell; client facts carry no
     hours / error (Methods only), operator facts do; the place hazard list does not list it as a hazard (parameter), alerts unchanged
   usage: node heatband40.test.mjs [tree] */
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs'; import { join } from 'node:path'; import { tmpdir } from 'node:os'; import { pathToFileURL } from 'node:url';
const T = (process.argv[2] && !/^https?:/.test(process.argv[2]) ? process.argv[2] : new URL('../..', import.meta.url).pathname.replace(/\/$/, ''));
const HI = await import(pathToFileURL(join(T, 'server/api/heatindex.mjs')).href), AH = await import(pathToFileURL(join(T, 'server/api/areaheat.mjs')).href);
const HL = await import(pathToFileURL(join(T, 'server/api/hazardlist.mjs')).href);
let n = 0, f = 0; const ok = (c, m, i) => { n++; console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : '  :: ' + String(JSON.stringify(i)).slice(0, 300))); if (!c) f++; };
const B = HI.heatBands(join(T, 'data'));
ok(B && B.cutsC.extremeCaution === 32.2 && B.cutsC.danger === 40.6 && B.cutsC.extremeDanger === 54.4 && /SR 90-23/.test(B.source), 'A0 bands = NWS SR 90-23 onsets 90 / 105 / 130 F in C', B && B.cutsC);
/* hand value: T 35 C, RH 60 % -> 95 F; NWS chart (SR 90-23) 95 F / 60 % = 113-114 F = 45.2 C */
const v = HI.heatIndexRaw(35, 60); ok(Math.abs(v - 45.2) < 0.3, 'A1 NWS value 35 C / 60 % = ' + v.toFixed(2) + ' C (chart 113-114 F = 45.0-45.6 C)');
const day = (date, lead, f) => ({ date, lead }); const hrs = (date, fn) => Array.from({ length: 24 }, (_, h) => ({ time: date + 'T' + String(h).padStart(2, '0') + ':00', ...fn(h) }));
const ps = { days: [day('2026-06-01', 0), day('2026-06-02', 1), day('2026-06-03', 2), day('2026-06-04', 3), day('2026-06-05', 4)],
  hours: [...hrs('2026-06-01', () => ({ tempC: 35, rh: 60 })), ...hrs('2026-06-02', (h) => ({ tempC: h === 14 ? 35 : 30, rh: 60 })),
          ...hrs('2026-06-03', (h) => ({ tempC: h === 15 ? 44 : 35, rh: 20 })), ...hrs('2026-06-04', (h) => ({ tempC: 33, rh: h === 3 ? null : 50 })), ...hrs('2026-06-05', () => ({ tempC: 30, rh: 50 }))] };
const D = HI.heatIndexDays(ps, B, 3); const by = Object.fromEntries(D.map((x) => [x.date, x]));
ok(D.length === 4 && !by['2026-06-05'], 'A2 days 0-3 only (day 4 not served)', D.map((x) => x.date));
ok(by['2026-06-01'].notTested && by['2026-06-01'].assessed === false, 'A3 lead 0: not tested', by['2026-06-01']);
const d1 = by['2026-06-02']; const v30 = HI.heatIndexRaw(30, 60);
ok(d1.assessed && d1.level === 2 && d1.word === 'Danger or higher' && Math.abs(d1.hiMaxC - Math.round(v * 10) / 10) < 0.05 && d1.at === '14:00', 'A4 lead 1: highest hour 14:00 (35 C/60 % = ' + v.toFixed(1) + ' C) -> Danger or higher', d1);
ok(d1.hoursAtOrAbove.danger === 1 && d1.hoursAtOrAbove.extremeCaution === (v30 >= 32.2 ? 24 : 1), 'A5 hours at or above: Danger 1, Extreme Caution ' + (v30 >= 32.2 ? 24 : 1) + ' (30 C/60 % = ' + v30.toFixed(1) + ' C)', d1.hoursAtOrAbove);
ok(by['2026-06-03'].assessed === false && /^outside range/.test(by['2026-06-03'].why) && /15:00/.test(by['2026-06-03'].why), 'A6 an hour at 44 C dry bulb (above the 43.3 C table): outside range, not extrapolated', by['2026-06-03'].why);
ok(by['2026-06-04'].assessed === false && /^incomplete day/.test(by['2026-06-04'].why), 'A7 a missing humidity hour: incomplete day (never filled)', by['2026-06-04'].why);
const hot = HI.heatIndexDays({ days: [day('2026-06-02', 1)], hours: hrs('2026-06-02', () => ({ tempC: 40, rh: 70 })) }, B, 3)[0];
ok(hot.assessed === false || (hot.level === 2 && hot.extremeDangerNotTested), 'A8 index at or above 54.4 C: "Danger or higher" flagged Extreme Danger not tested (or outside the table ceiling 58.3 C)', hot);
ok(HI.heatBandOf(32.19, B).level === 0 && HI.heatBandOf(32.2, B).level === 1 && HI.heatBandOf(40.59, B).level === 1 && HI.heatBandOf(40.6, B).level === 2, 'A9 band edges inclusive at the onset');
/* B: the held record */
const rec0 = JSON.parse(readFileSync(join(T, 'data/engine-latest.json'), 'utf8')); const rec = JSON.parse(JSON.stringify(rec0));
const uids = Object.keys(rec.days[0].layers.heat.L).slice(0, 3); const U = {};
uids.forEach((u, i) => { U[u] = { heatIndex: {} }; for (const d of rec.days) U[u].heatIndex[d.date] = { date: d.date, lead: d.day, assessed: true, hiMaxC: 30 + 6 * i, at: '14:00', level: HI.heatBandOf(30 + 6 * i, B).level, word: HI.heatBandOf(30 + 6 * i, B).word, hoursAtOrAbove: { extremeCaution: 3 * i, danger: i === 2 ? 2 : 0 }, hoursErrorMAE: { extremeCaution: 3.1, danger: 5.1 }, point: { kind: 'main settlement', name: 'X' } }; });
AH.applyHeatIndex(rec, U, B);
ok(rec.days.every((d) => d.layers.heat_index && d.layers.heat_index.ownScale), 'B1 heat_index layer on every held day, own scale');
ok(Object.values(rec.days[0].layers.heat_index.L).every((x) => x === -5), 'B2 day 0: every tehsil not tested');
const L1 = rec.days[1].layers.heat_index; ok(L1.L[uids[0]] === 0 && L1.L[uids[1]] === 1 && L1.L[uids[2]] === 2 && L1.S[uids[2]] === 42, 'B3 day 1 levels 0/1/2 from 30/36/42 C', uids.map((u) => L1.L[u]));
ok(L1.L[Object.keys(L1.L)[5]] === -1, 'B4 a tehsil without a point state: data missing (-1)');
const keys = (r) => r.days.map((d) => Object.keys(d.layers).filter((k) => k !== 'heat_index').map((k) => k + JSON.stringify(d.layers[k])).join('|')).join('#');
ok(keys(rec) === keys(rec0) && JSON.stringify(rec.alerts) === JSON.stringify(rec0.alerts), 'B5 freeze: every other layer and the alerts byte-identical (only heat_index added)');
/* C: one server value through the engine */
const TD = mkdtempSync(join(tmpdir(), 'hb40_'));
try { writeFileSync(join(TD, 'engine-latest.json'), JSON.stringify(rec)); copyFileSync(join(T, 'data/map-layer-scales.json'), join(TD, 'map-layer-scales.json'));
  process.env.NIGRAAN_ENGINE = '0';
  const EN = await import(pathToFileURL(join(T, 'server/api/engine.mjs')).href); const E = EN.createEngine({}, TD, { port: 1 });
  const uc = E.unit(uids[2], false), uo = E.unit(uids[2], true), nat = E.levels('heat_index', 1, false);
  const cl = uc.days.find((d) => d.day === 1).layers.heat_index, op = uo.days.find((d) => d.day === 1).layers.heat_index;
  ok(cl && cl.level === 2 && cl.word === 'Danger or higher', 'C1 client unit: Danger or higher (own words)', cl);
  ok(cl && cl.facts && cl.facts.heatIndexMaxC === 42 && !('hoursAtOrAbove' in cl.facts) && !('hoursErrorMAE' in cl.facts), 'C2 client facts: value, no hours / error (Methods only)', cl && cl.facts);
  ok(op && op.facts && op.facts.hoursAtOrAbove && op.facts.hoursErrorMAE.danger === 5.1, 'C3 operator facts carry the hours and the measured error', op && op.facts);
  const row = nat && nat.ready && (nat.rows || []).find((r) => r.unit === uids[2] || r.uid === uids[2]);
  const nv = nat && nat.ready ? (row ? (row.level ?? row.L) : (nat.levels ? nat.levels[uids[2]] : nat.L ? nat.L[uids[2]] : undefined)) : undefined;
  ok(nat && nat.ready && nv === cl.level, 'C4 national levels = unit level (one value)', { ready: nat && nat.ready, nv, keys: nat && Object.keys(nat) });
  const hl = HL.hazardListOf({ ready: true, days: uc.days });
  ok(!JSON.stringify(hl.hazards).includes('heat_index') && !JSON.stringify(hl.conditions).includes('heat_index'), 'C5 the place hazard list does not list the heat-index band (a parameter)', hl);
  ok(JSON.stringify(uc.alerts) === JSON.stringify(E.unit(uids[2], false).alerts) && !(uc.alerts || []).some((a) => a.hazard === 'heat_index'), 'C6 no alert from the heat-index band');
} finally { rmSync(TD, { recursive: true, force: true }); }
console.log('\nheatband40: ' + (n - f) + '/' + n + ' passed'); process.exit(f ? 1 : 0);
