/* v91.17.187 · weather MOS (wxmos.mjs + data/weather-mos.json) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWxMos } from '../../server/api/wxmos.mjs';
import { createFeatGrid } from '../../server/api/featgrid.mjs';
import { createNational } from '../../server/api/natmodel.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'); const DATA = join(ROOT, 'data');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const M = JSON.parse(read('data/weather-mos.json'));

test('the shipped model: trees, features = national nopool set + served-minus-raw, every applied zone passed both held-out tests by >= 0.02 C', () => {
  assert.ok(Array.isArray(M.mean.trees) && M.mean.trees.length > 50);
  const nat = JSON.parse(read('data/national-model.json')).variants.nopool.features;
  assert.deepEqual(M.features, [...nat, 'srv_d']);
  for (const [z, Z] of Object.entries(M.zones)) if (Z.applied) {
    assert.ok(Z.w > 0 && Z.w <= 1, z); assert.ok(Z.spatial.served - Z.spatial.mos >= 0.02, z + ' spatial');
    if (Z.time.served != null) assert.ok(Z.time.served - Z.time.mos >= 0.02, z + ' time'); assert.ok(Z.worstWeatherGroupChangeC <= 0.02, z + ' weather group');
  }
  assert.ok(M.evaluation['time_after_2026-08-15_as_served'].mos_mae < M.evaluation['time_after_2026-08-15_as_served'].served_mae);
});

function locAt(lat, lon, elev, hours, T0, served, extra = {}) {
  const t0 = Date.UTC(2026, 6, 7, 0); const time = [], H = {};   /* v189: inside the fitted season (25 Mar - 5 Oct) */
  for (let i = 0; i < hours; i++) time.push(new Date(t0 + i * 3600e3).toISOString().slice(0, 16));
  const loc = { latitude: lat, longitude: lon, elevation: elev, utc_offset_seconds: 0, hourly: { time, temperature_2m: served.slice(), relative_humidity_2m: time.map(() => 60), dew_point_2m: time.map(() => 10),
    cloud_cover: time.map((_, i) => extra.cloud ?? 90), wind_speed_10m: time.map(() => 5), wind_direction_10m: time.map(() => 180), shortwave_radiation: time.map((_, i) => (i % 24 >= 4 && i % 24 <= 12) ? (extra.sw ?? 120) : 0), precipitation: time.map(() => extra.rain ?? 0.4) } };
  return loc;
}
function app() { const fg = createFeatGrid(DATA); const national = createNational({ dataDir: DATA, featGrid: fg });
  return { national, mos: { zoneOfPoint: (la, lo, e) => (e >= 1000 ? 'mountain' : 'plains') } }; }

test('applied in the mountain zone: the served curve moves, humidity follows at the same dew point, the change is reported', () => {
  const A = app(); const W = createWxMos(A, DATA);
  const T0 = Array.from({ length: 48 }, (_, i) => 15 + 6 * Math.sin((i % 24 - 4) / 24 * 2 * Math.PI));
  const served = T0.map(v => v + 6.8);   /* Gilgit, 6 Oct: the chain added about +6.8 C to the raw forecast */
  const loc = locAt(35.905, 74.352, 1500, 48, T0, served);
  W.stash(loc); Object.defineProperty(loc, '__T0', { value: T0, enumerable: false });
  const ok = W.apply(loc, 35.905, 74.352);
  assert.equal(loc.agn_wxmos.zone, 'mountain');
  if (M.zones.mountain && M.zones.mountain.applied) {
    assert.equal(ok, true); assert.ok(loc.agn_wxmos.hours > 0);
    const d = loc.hourly.temperature_2m.map((v, i) => v - served[i]); assert.ok(d.some(x => Math.abs(x) >= 0.1));
    const k = d.findIndex(x => Math.abs(x) >= 0.1); if (d[k] < 0) assert.ok(loc.hourly.relative_humidity_2m[k] >= 60); else assert.ok(loc.hourly.relative_humidity_2m[k] <= 60);
  }
});

test('not applied without the raw series, nor where the zone did not pass, nor when switched off', () => {
  const A = app(); const W = createWxMos(A, DATA);
  const T0 = Array.from({ length: 24 }, () => 20); const loc = locAt(31.5, 74.3, 210, 24, T0, T0.map(v => v + 1));
  assert.equal(W.apply(loc, 31.5, 74.3), false); assert.match(loc.agn_wxmos.why, /raw forecast/);
  process.env.NIGRAAN_WXMOS = '0'; Object.defineProperty(loc, '__T0', { value: T0, enumerable: false, configurable: true });
  assert.equal(W.apply(loc, 31.5, 74.3), false); delete process.env.NIGRAAN_WXMOS;
});

test('wiring: stash first in correctLocation, raw series kept, MOS after the static chain and before the live terms, replay flag', () => {
  const v = read('server/api/verification.mjs');
  assert.match(v, /app\.wxmos\.stash\(loc\)/); assert.match(v, /Object\.defineProperty\(loc, '__T0'/);
  /* v91.17.276 · the chain runs from one stage list since v91.17.270 (CHAIN_STAGES), not from the order of the calls in the source */
  const st = JSON.parse((v.match(/const CHAIN_STAGES = (\[[^\]]*\])/) || [])[1].replace(/'/g, '"')), at = (k) => st.indexOf(k);
  assert.ok(at('airport') < 0 && at('wxmos') >= 0 && at('wxmos') < at('synop') && at('synop') < at('live'), 'order wxmos < synop < live (airport stage retired v91.17.277): ' + st.join(','));
  const s = read('server/server.mjs'); assert.match(s, /qs\.delete\('__nowx'\)/);
  assert.match(read('server/api/index.mjs'), /createWxMos\(app, dataDir\)/);
});
