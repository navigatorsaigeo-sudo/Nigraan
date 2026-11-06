// v91.17.283.3 · SCI item 1 · audit A14 · daily Tmax / Tmin 90 % range, per zone, served only where the held-out test passed.
// usage: node scripts/tests2833/sci/a14_daily_range.test.mjs     (no server, no network)
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { APP, mod, ok, done } from './lib.mjs';
const F = join(APP, 'data', 'range90-daily.json');
ok(existsSync(F), 'data/range90-daily.json present');
const R = existsSync(F) ? JSON.parse(readFileSync(F, 'utf8')) : { zones: {} };
const P = R.zones.plains || {}, C = R.zones.coast || {};
ok(P.Tmax && P.Tmax.serve === true && P.Tmin && P.Tmin.serve === true, 'plains Tmax and Tmin passed and are served');
ok(C.Tmax && C.Tmax.serve === false && C.Tmin && C.Tmin.serve === false, 'coast (1 station) failed the rule: withheld');
ok(!R.zones.hills && !R.zones.mountain, 'hills / mountain: no daily truth, nothing served');
for (const v of ['Tmax', 'Tmin']) { const h = P[v] && P[v].heldOut; if (!h) { ok(false, v + ' evidence'); continue; }
  ok(['D1', 'D2'].every(d => h[d].recalCi[0] <= 0.9 && 0.9 <= h[d].recalCi[1] && !(h[d].uncalibratedCi[0] <= 0.9 && 0.9 <= h[d].uncalibratedCi[1])),
    'plains ' + v + ': the decision rule holds on the recorded held-out evidence (D1, D2)', JSON.stringify(['D1', 'D2'].map(d => [h[d].recal, h[d].recalCi])));
  ok(h.D3.recalCi[0] <= 0.9 && 0.9 <= h.D3.recalCi[1] && P[v].months.length === 12, 'plains ' + v + ': season transfer (D3) holds -> all months'); }
const M = await mod('server/api/pointengine.mjs');
ok(typeof M.dailyRange90 === 'function', 'pointengine exports dailyRange90');
if (typeof M.dailyRange90 === 'function') {
  const h = { tempC: 40, lo90: 37, hi90: 42, live: false };
  const r = M.dailyRange90(h, P.Tmax, 1, 10);
  ok(r && r[0] === +(40 - P.Tmax.kLo * 3).toFixed(1) && r[1] === +(40 + P.Tmax.kHi * 2).toFixed(1), 'plains Tmax lead 1: lo = T - kLo (T - lo90), hi = T + kHi (hi90 - T)', JSON.stringify(r));
  ok(M.dailyRange90(h, P.Tmax, 0, 10) === null && M.dailyRange90(h, P.Tmax, 4, 10) === null, 'lead day 0 (partial day) and beyond lead 3: withheld');
  ok(M.dailyRange90(h, C.Tmax, 1, 10) === null, 'coast: withheld');
  ok(M.dailyRange90({ tempC: 43, lo90: 37, hi90: 42 }, P.Tmax, 1, 10) === null && M.dailyRange90({ tempC: 40, lo90: null, hi90: 42 }, P.Tmax, 1, 10) === null, 'range missing or not holding T: withheld');
  ok(M.dailyRange90(null, P.Tmax, 1, 10) === null && M.dailyRange90(h, null, 1, 10) === null, 'no hour / no zone cell: withheld');
}
/* end to end: the point engine with a frozen forecast (plains zone and coast zone) */
const mk = (zone) => { const t0 = Date.parse(new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10) + 'T00:00:00Z'); const time = [], T = [], lo = [], hi = [];
  for (let i = 0; i < 96; i++) { const d = new Date(t0 + i * 3600e3).toISOString().slice(0, 16); time.push(d); const h = i % 24; const v = 25 + 8 * Math.sin((h - 9) / 24 * 2 * Math.PI); T.push(+v.toFixed(1)); lo.push(+(v - 3).toFixed(1)); hi.push(+(v + 2.5).toFixed(1)); }
  return { hourly: { time, temperature_2m: T, relative_humidity_2m: T.map(() => 40), wind_speed_10m: T.map(() => 5) }, agn_national: { range90: { lo, hi } }, agn_temperature_basis: { zone } }; };
const { createPointEngine } = M;
for (const [zone, want] of [['plains', true], ['coast', false]]) {
  globalThis.fetch = async () => new Response(JSON.stringify(mk(zone)), { status: 200, headers: { 'content-type': 'application/json' } });
  const app = { dataDir: join(APP, 'data'), gazetteer: { pointRow: () => ({ administered: true, forecastElevM: 200, unitId: 'x', tehsil: 'x' }) }, fleet: { nearest: () => null } };
  const E = createPointEngine(app, 1); const out = await E.forecast(zone === 'plains' ? 31.5 : 24.9, zone === 'plains' ? 74.3 : 67.1);
  const d1 = out && out.days && out.days[1], d0 = out && out.days && out.days[0];
  if (want) ok(d1 && Array.isArray(d1.tmaxRange90) && Array.isArray(d1.tminRange90) && d1.tmaxRange90[0] <= d1.tmaxC && d1.tmaxC <= d1.tmaxRange90[1] && d0 && d0.tmaxRange90 === null,
    'point engine, plains: day 1 carries calibrated Tmax / Tmin ranges around the served values; day 0 withheld', JSON.stringify(d1 && [d1.tmaxC, d1.tmaxRange90, d1.tminC, d1.tminRange90]));
  else ok(d1 && d1.tmaxRange90 === null && d1.tminRange90 === null && /not yet calibrated/.test(d1.rangeNote), 'point engine, coast: still withheld with the note');
}
done();
