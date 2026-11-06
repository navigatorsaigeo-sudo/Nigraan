/* v91.17.188 · flat-sensor screen in the live layer's siting offsets (sitingoffsets.mjs flatScreen) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeOffsets, flatScreen, persistenceScreen } from '../../server/api/sitingoffsets.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCREEN = { radius_km: 15, dz_m: 150, min_neighbours: 2, min_days: 10, abs_c: 2.5, iqr_c: 3.0 };
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const START = Date.parse('2026-09-20T19:00:00Z');   /* 00 PKT */
/* hours[iso] = [reading, reading - forecast]; the forecast has a daily cycle of `amp` C peaking at 14 PKT */
function station(lat, lon, elevM, readingOf, days = 16, amp = 12) {
  const hours = {};
  for (let i = 0; i < days * 24; i++) { const iso = new Date(START + i * 3600e3).toISOString().slice(0, 13); const lh = i % 24;
    const fc = 15 + amp / 2 * Math.cos((lh - 14) / 24 * 2 * Math.PI); const o = readingOf(fc, i); if (o != null) hours[iso] = [o, o - fc]; }
  return { lat, lon, elevM, hours };
}
const sound = (k) => (fc, i) => fc + 0.8 * Math.sin(i * 0.37 + k) + (k % 3) * 0.5;

test('a sensor that loses the daily cycle (Khaplu, 5-6 Oct: 16.5-17.4 C against a 12 C forecast cycle) is held out as flat', () => {
  const st = {}; for (let k = 0; k < 12; k++) st['s' + k] = station(24 + k, 62 + k, 100 + k * 200, sound(k));
  st.khaplu = station(35.15, 76.33, 2550, (fc, i) => i >= 15 * 24 ? 16.6 + (i % 3) * 0.1 : fc + 0.3, 16);
  const F = flatScreen(st); assert.ok(F.fence > 0 && F.fence < 1, 'fence ' + F.fence);
  assert.deepEqual([...F.flat], ['khaplu']);
  const O = computeOffsets(st, [], SCREEN, 40).stations;
  assert.equal(O.khaplu.flag, true); assert.match(O.khaplu.why, /daily cycle/);
  assert.equal(Object.entries(O).filter(([k, r]) => k !== 'khaplu' && r.flag).length, 0);
});

test('a flat station is no neighbour reference: its neighbour is measured against the others only', () => {
  const st = {}; for (let k = 0; k < 10; k++) st['s' + k] = station(24 + k, 62 + k, 100, sound(k));
  st.a = station(33.70, 73.05, 520, (fc, i) => fc + 1 + 0.2 * Math.sin(i));
  st.b = station(33.72, 73.06, 530, (fc, i) => fc + 0.2 * Math.sin(i + 1));
  st.c = station(33.69, 73.08, 510, (fc, i) => fc + 0.2 * Math.sin(i + 2));
  st.d = station(33.71, 73.07, 515, () => 25);   /* indoor: no cycle */
  const O = computeOffsets(st, [], SCREEN, 40).stations;
  assert.equal(O.d.flag, true); assert.equal(O.a.ref, 'MACH neighbours'); assert.match(O.a.refName, /^2 within/);
  assert.ok(Math.abs(O.a.off.day - 1) < 0.3, 'offset ' + O.a.off.day);
});

test('a day with fewer than 20 of 24 hours is not judged; a constant forecast gives no ratio', () => {
  const st = {}; for (let k = 0; k < 12; k++) st['s' + k] = station(24 + k, 62 + k, 100, sound(k));
  st.gappy = station(30, 70, 100, (fc, i) => i >= 15 * 24 && i % 2 ? null : (i >= 15 * 24 ? 20 : fc));
  const F = flatScreen(st); assert.equal(F.last.gappy, undefined); assert.equal(F.flat.has('gappy'), false);
  const c = flatScreen({ x: station(30, 70, 100, () => 20, 16, 0) }); assert.equal(c.last.x, undefined);
});

test('the WMO persistence screen exists for the harness but the server does not pass it (it lost in the hindcast)', () => {
  const p = persistenceScreen({}); assert.equal(p.fence, null);
  const f = read('server/api/fleet.mjs'); assert.match(f, /computeOffsets\(ST2, synops, R\.screen, refKm\)/);   /* v91.17.269 · ST2 = RB.stations without the registry-excluded keys (F2); still no persistence argument */
  const s = read('server/api/sitingoffsets.mjs'); assert.match(s, /tested, not used/); assert.match(s, /0\.900 -> 0\.907/);
});
