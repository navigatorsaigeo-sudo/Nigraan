/* v91.17.192 · feed mix-up screen (sitingoffsets.mjs mixupScreen) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeOffsets, mixupScreen } from '../../server/api/sitingoffsets.mjs';

const SCREEN = { radius_km: 15, dz_m: 150, min_neighbours: 2, min_days: 10, abs_c: 2.5, iqr_c: 3.0 };
const START = Date.parse('2026-09-20T19:00:00Z');
function station(lat, lon, f, days = 16) { const hours = {}; for (let i = 0; i < days * 24; i++) { const iso = new Date(START + i * 3600e3).toISOString().slice(0, 13); const fc = 20 + 6 * Math.cos(((i % 24) - 9) / 24 * 2 * Math.PI); const o = f(fc, i); hours[iso] = [o, o - fc]; } return { lat, lon, elevM: 300, hours }; }

test('two stations 137 km apart carrying one feed are both held out; real distant stations are not', () => {
  const st = {};
  for (let k = 0; k < 14; k++) st['s' + k] = station(24 + k * 0.9, 62 + k * 0.9, (fc, i) => fc + 2.5 * Math.sin(i * 0.11 + k * 1.7) + (k % 4) * 0.8);
  st.mach2 = station(34.0, 71.5, (fc, i) => fc + 1.5 * Math.sin(i * 0.07));
  st.mach8 = station(33.6, 73.0, (fc, i) => st.mach2.hours[new Date(START + i * 3600e3).toISOString().slice(0, 13)][0] + ((i % 5) - 2) * 0.05);
  const X = mixupScreen(st, 40); assert.ok(X.fence > 0.2 && X.fence < 2, 'fence ' + X.fence);
  assert.deepEqual([...X.mixed.keys()].sort(), ['mach2', 'mach8']);
  const O = computeOffsets(st, [], SCREEN, 40).stations;
  assert.equal(O.mach2.flag, true); assert.match(O.mach8.why, /one feed carries/); assert.equal(Object.entries(O).filter(([k, r]) => r.flag && !k.startsWith('mach')).length, 0);
});

test('switched off by option (the hindcast baseline), and needs 72 shared hours', () => {
  const st = { a: station(30, 70, (fc) => fc), b: station(33, 73, (fc) => fc, 2) };
  assert.equal(mixupScreen(st, 40).mixed.size, 0);
  const O = computeOffsets(st, [], SCREEN, 40, null, { mixup: false, flat: false }).stations; assert.equal(O.a.flag, false);
});
