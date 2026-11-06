/* v91.17.283.31 · owner 3.1-3.8 · THE BAD-INPUT TEST SET, run on every day value of the place record through the one completeness layer
   (server/api/completeness.mjs): missing hours, duplicated hours, hours on the wrong date, a failed model check, a provider down, an
   edited report number, scenario dates outside the forecast, the gust control as the day's peak, accuracy only for scored leads with
   enough days. Bad input never comes out "complete".   node scripts/tests28331/badinput.unit.test.mjs */
import { join, dirname } from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url'; import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'; import { tmpdir } from 'node:os';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
let n = 0, f = 0; const ok = (c, m, i) => { n++; console.log((c ? 'PASS ' : 'FAIL ') + m + (c || i === undefined ? '' : '  :: ' + JSON.stringify(i).slice(0, 400))); if (!c) f++; };
const imp = (x) => import(pathToFileURL(join(API, x)).href);
const C = await imp('completeness.mjs'), PS = await imp('pointstate.mjs'), PK = await imp('pktday.mjs'), PR = await imp('placerecord.mjs'), AC = await imp('accuracy.mjs'), SC = await imp('scenario.mjs');
const TD = mkdtempSync(join(tmpdir(), 'bad31_'));
try {
  /* -- the layer itself -- */
  const H = (d, hrs, v = 1) => hrs.map((h) => ({ time: d + 'T' + String(h).padStart(2, '0') + ':00', x: v }));
  const all = Array.from({ length: 24 }, (_, i) => i);
  ok(C.checkHours(H('2026-10-29', all), 'x', '2026-10-29').complete, 'all 24 different hours: complete');
  const c11 = C.checkHours(H('2026-10-29', all.slice(0, 11)), 'x', '2026-10-29');
  ok(!c11.complete && /held for 11 of the 24 hours/.test(c11.why), '11 hours given: incomplete, "held for 11 of the 24 hours"', c11.why);
  const cd = C.checkHours(H('2026-10-29', all.concat([14])), 'x', '2026-10-29');
  ok(!cd.complete && /duplicate hour 14:00/.test(cd.why), 'a duplicated hour: incomplete, named', cd.why);
  const cd2 = C.checkHours(H('2026-10-29', all.filter((h) => h !== 3).concat([14])), 'x', '2026-10-29');
  ok(!cd2.complete, '23 hours + a duplicate (24 rows): never complete', cd2);
  const cw = C.checkHours(H('2026-10-29', all.slice(0, 23)).concat(H('2026-10-30', [23])), 'x', '2026-10-29');
  ok(!cw.complete && cw.wrongDate === 1, 'an hour stamped on the next day is not counted in this day', cw);
  ok(!C.checkHours(H('2026-10-29', all, null), 'x', '2026-10-29').complete, 'hours without values: incomplete');
  /* -- rain needs 24 different hours (3.6) -- */
  const times = [], vals = []; for (let i = 1; i <= 24; i++) { times.push(new Date(Date.parse('2026-10-29T00:00:00+05:00') + i * 3600e3 + 5 * 3600e3).toISOString().slice(0, 16)); vals.push(1); }
  const T1 = PK.hourEndingTotals(times, vals); ok(PK.complete24(T1.get('2026-10-29')) && T1.get('2026-10-29').sum === 24, 'rain: 24 different hour-ending stamps: complete (24 mm)', T1.get('2026-10-29'));
  const T2 = PK.hourEndingTotals(times.slice(0, 23).concat([times[10]]), vals); const e2 = T2.get('2026-10-29');
  ok(!PK.complete24(e2) && e2.dup === 1 && e2.n === 23, 'rain: a duplicated hour (24 rows, 23 hours): incomplete', e2);
  /* -- the point state (place record days) on bad provider answers -- */
  const T0 = Date.parse('2026-10-28T19:00:00Z');   /* 00:00 PKT 29 Oct */
  const mk = (q, bad) => { const nn = Number(new URLSearchParams(q).get('forecast_days')) * 24; const Hh = { time: [], temperature_2m: [], relative_humidity_2m: [], wind_speed_10m: [], wind_gusts_10m: [], apparent_temperature: [], precipitation: [], dew_point_2m: [] };
    for (let i = 0; i < nn; i++) { const t = new Date(T0 + 5 * 3600e3 + i * 3600e3).toISOString().slice(0, 16), h = i % 24, day = Math.floor(i / 24);
      if (bad === 'dup' && day === 1 && h === 14) { for (const k of Object.keys(Hh)) Hh[k].push(k === 'time' ? t : (Hh[k][Hh[k].length - 1] ?? 10)); }
      Hh.time.push(t); const T = 15 + 10 * Math.sin((h - 8) / 24 * 2 * Math.PI); const miss = bad === 'gap' && day === 1 && h >= 13 && h <= 16;
      Hh.temperature_2m.push(miss ? null : T); Hh.relative_humidity_2m.push(40); Hh.wind_speed_10m.push(miss ? null : 10); Hh.wind_gusts_10m.push(miss ? null : 20 + h); Hh.apparent_temperature.push(miss ? null : T); Hh.precipitation.push(miss ? null : 0.5); Hh.dew_point_2m.push(2); }
    return { hourly: Hh }; };
  const app = { places: { pointRow: () => ({ administered: true, elevM: 500 }) } };
  const now = () => T0 + 6 * 3600e3;
  const st = async (bad) => PS.createPointState(app, { now, dataDir: join(ROOT, 'data'), fetchPx: async (q) => { if (bad === 'down') throw new Error('the forecast did not arrive (503)'); return [mk(q, bad)]; } }).state(33.68, 73.05, { noBuild: true });
  const good = await st(null), gap = await st('gap'), dup = await st('dup'), down = await st('down');
  const D = (r, k) => (r.days || []).find((d) => d.lead === k);
  ok(good.ok && D(good, 1).tmaxC != null && D(good, 1).rainMm === 12, 'a clean provider answer: day 1 complete (high, low, 12 mm rain)', D(good, 1));
  const g1 = D(gap, 1);
  ok(g1 && (g1.tmaxC === null && g1.tminC === null && g1.gustMaxKmh === null && g1.rainMm === null && g1.heat.assessed === false && g1.cold.assessed === false), 'missing hours (20 held): no high, low, gust, rain or UTCI level for the day, each with its reason', g1);
  ok(g1 && /held for 20 of the 24 hours/.test(g1.tmaxWhy || '') && /not assessed/.test(g1.rainWhy || ''), 'missing hours: the reason is served (held for 20 of the 24 hours)', g1 && [g1.tmaxWhy, g1.rainWhy]);
  const d1 = D(dup, 1);
  ok(d1 && d1.tmaxC === null && /duplicate hour/.test(d1.tmaxWhy) && d1.rainMm === null && /duplicate hour/.test(d1.rainWhy), 'a duplicated provider hour: the day is incomplete (high and rain), "duplicate hour"', d1 && { w: d1.tmaxWhy, r: d1.rainWhy });
  ok(down && down.ok === false && /did not arrive/.test(down.why || ''), 'provider down: no point state (never a complete record)', down);
  /* -- a failed model check: the record is incomplete (3.1) -- */
  const appR = { engine: { unit: () => ({ ready: true, days: [{ day: 0, layers: { heat: { name: 'heat', level: 1 } } }], alerts: [] }) }, gate: null };
  const P = PR.createPlaceRecord(appR, { dataDir: join(ROOT, 'data') });
  const rec = P.record({ lat: 33.68, lon: 73.05, uid: 'U1', view: 'customer', ps: good });
  ok(rec.ok && rec.complete === false && /model check failed/.test(rec.incompleteWhy) && rec.modelCheck && rec.modelCheck.passed === false, 'gate switched off: the record is incomplete (no level, no report)', rec.incompleteWhy);
  const appOk = { engine: { unit: () => ({ ready: true, days: [], alerts: [] }) }, gate: { full: () => ({ ready: true, client_rules: { hidden_layers: {}, substitute: {} } }) } };
  const rec2 = PR.createPlaceRecord(appOk, { dataDir: join(ROOT, 'data') }).record({ lat: 33.68, lon: 73.05, uid: 'U1', view: 'customer', ps: good });
  ok(rec2.complete === true && /^pr1-/.test(rec2.checksum) && rec2.values['days.1.tmaxC'] === D(good, 1).tmaxC, 'a passed check: complete, with its shown values and checksum', { c: rec2.complete, s: rec2.checksum });
  /* -- one checked record (3.3) -- */
  const same = PR.compareShown(rec2, { 'days.1.tmaxC': rec2.values['days.1.tmaxC'], 'days.1.rainMm': rec2.values['days.1.rainMm'] }, rec2.checksum);
  const edited = PR.compareShown(rec2, { 'days.1.tmaxC': rec2.values['days.1.tmaxC'] + 3 }, null), wrongSum = PR.compareShown(rec2, null, 'pr1-deadbeef');
  ok(same.match && !edited.match && edited.mismatches[0].path === 'days.1.tmaxC' && !wrongSum.match, 'report check: the same numbers pass; an edited number or another checksum is refused', { same, edited: edited.mismatches[0] });
  /* reports.mjs issue path refuses the mismatch (static check of the wiring) */
  const RS = (await import('node:fs')).readFileSync(join(API, 'reports.mjs'), 'utf8'); ok(/record_mismatch/.test(RS) && /compareShown\(P\.record/.test(RS) && /place_record_incomplete/.test(RS), 'the report issue refuses an incomplete record and a mismatch');
  /* -- accuracy only for scored leads with enough days (3.5) -- */
  const dd = join(TD, 'data'); mkdirSync(join(dd, 'agents', 'verify'), { recursive: true });
  writeFileSync(join(dd, 'agents', 'verify', 'summary.json'), JSON.stringify({ ready: true, built: 'x', window: { from: 'a', to: 'b', days: 30, ledgerDays: 30 }, table: [
    { var: 'T', zone: 'plains', lead: 1, n: 900, days: 25, mae: 1.4, maeCi: [1.2, 1.6] }, { var: 'T', zone: 'plains', lead: 2, n: 50, days: 2, mae: 1.1 } ] }));
  const a1 = AC.accuracyCell(dd, { variable: 'T', zone: 'plains', lead: 1 }), a2 = AC.accuracyCell(dd, { variable: 'T', zone: 'plains', lead: 2 }), a6 = AC.accuracyCell(dd, { variable: 'T', zone: 'plains', lead: 6 });
  ok(a1.maeC === 1.4 && a1.scoredDays === 25, 'a scored lead with 25 days: the figure with its count', a1);
  ok(a2.maeC === null && a2.notEnoughDays && /not enough days: 2 scored days/.test(a2.why), '2 scored days: "not enough days", no figure', a2.why);
  ok(a6.maeC === null && a6.notMeasured && /not measured: lead day 6/.test(a6.why), 'day 6: "not measured" (no longer lead 3’s figure)', a6.why);
  /* -- the scenario (3.4) -- */
  const recs = []; const appS = { pointState: { state: async () => good }, placeRecord: { siteLevels: (c) => { recs.push(c); return { ok: true }; } }, hazSci: null };
  writeFileSync(join(dd, 'formula-registry.json'), JSON.stringify({ scenario: { presets: { value: {} }, bounds: { value: { gustKmh: [0, 300], rainMmDay: [0, 1000], tempC: [-60, 60] }, source: 's' } } }));
  const S = SC.createScenario(appS, { dataDir: dd });
  const d1d = D(good, 1).date, outD = '2026-11-20';
  const r1 = await S.run({ lat: '33.68', lon: '73.05', gustKmh: '30', gustDay: d1d });
  const sc = recs[recs.length - 1].ps.days.find((x) => x.date === d1d);
  ok(r1.status === 200 && r1.body.places[0].ok && sc.gustMaxKmh === 30, 'gust control 30 km/h (below the day’s own peak 43): the day’s peak IS 30', sc && sc.gustMaxKmh);
  const r2 = await S.run({ lat: '33.68', lon: '73.05', gustKmh: '90', gustDay: d1d }); const sc2 = recs[recs.length - 1].ps.days.find((x) => x.date === d1d);
  ok(sc2.gustMaxKmh === 90, 'gust control 90 km/h: the day’s peak is 90', sc2.gustMaxKmh);
  const r3 = await S.run({ lat: '33.68', lon: '73.05', rainMm: '50', rainDay: outD });
  ok(r3.body.places[0].ok === false && r3.body.places[0].refused && /outside the forecast days/.test(r3.body.places[0].why), 'a rain day outside the forecast days is refused', r3.body.places[0].why);
  const r4 = await S.run({ lat: '33.68', lon: '73.05', gustKmh: '50', gustDay: 'tomorrow' });
  ok(r4.status === 400, 'a scenario day that is not a date is refused (400)', r4.body);
} catch (e) { ok(false, 'crashed: ' + (e && e.stack || e)); }
finally { try { rmSync(TD, { recursive: true, force: true }); } catch (_) {} }
console.log(`\n${n - f} pass, ${f} fail`); process.exit(f ? 1 : 0);
