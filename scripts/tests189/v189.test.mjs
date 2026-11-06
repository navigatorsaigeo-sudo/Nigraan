/* v91.17.189 · weather MOS season gate (wxmos.mjs seasonOf / inSeason, weather-mos.json season) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWxMos, seasonOf, inSeason } from '../../server/api/wxmos.mjs';
import { createFeatGrid } from '../../server/api/featgrid.mjs';
import { createNational } from '../../server/api/natmodel.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'); const DATA = join(ROOT, 'data');
const M = JSON.parse(readFileSync(join(DATA, 'weather-mos.json'), 'utf8'));

test('the shipped season is 25 Mar - 5 Oct, with the out-of-fold evidence that set it', () => {
  const S = seasonOf(M); assert.equal(S.from, 325); assert.equal(S.to, 1005); assert.equal(S.label, '25 Mar - 5 Oct');
  assert.ok(M.season.evidence.outsideSeason_2024_2026_changeC.plains > 0.02);
  for (const z of ['mountain', 'hills', 'plains']) { const [a, b] = M.season.evidence.inSeason_2026_sameMethod_foldsSharedWithNational[z]; assert.ok(a - b >= 0.02, z); }
  for (const z of ['mountain', 'hills', 'coast']) assert.ok(M.season.evidence.outsideSeason_2024_2026_changeC[z] > -0.02, z);
});

test('inSeason uses the PKT calendar day: 5 Oct 18:00 UTC is 5 Oct PKT, 19:00 UTC is 6 Oct PKT', () => {
  const S = seasonOf(M);
  assert.equal(inSeason(Date.UTC(2026, 9, 5, 18, 0), S), true); assert.equal(inSeason(Date.UTC(2026, 9, 5, 19, 0), S), false);
  assert.equal(inSeason(Date.UTC(2026, 2, 24, 18, 59), S), false); assert.equal(inSeason(Date.UTC(2026, 2, 24, 19, 0), S), true);
  assert.equal(inSeason(Date.UTC(2027, 0, 15, 6), S), false);
  const W = seasonOf({ season: { from: '11-01', to: '02-28' } }); assert.equal(inSeason(Date.UTC(2027, 0, 15), W), true); assert.equal(inSeason(Date.UTC(2027, 5, 15), W), false);
  assert.equal(seasonOf({ training: { window: ['2025-01-01', '2025-12-31'] } }), null);
});

function mountainLoc(t0) {
  const time = [], n = 48; for (let i = 0; i < n; i++) time.push(new Date(t0 + i * 3600e3).toISOString().slice(0, 16));
  const T0 = Array.from({ length: n }, (_, i) => 15 + 6 * Math.sin((i % 24 - 4) / 24 * 2 * Math.PI)); const served = T0.map(v => v + 6.8);
  const loc = { latitude: 35.905, longitude: 74.352, elevation: 1500, utc_offset_seconds: 0, hourly: { time, temperature_2m: served.slice(), relative_humidity_2m: time.map(() => 60), dew_point_2m: time.map(() => 10),
    cloud_cover: time.map(() => 90), wind_speed_10m: time.map(() => 5), wind_direction_10m: time.map(() => 180), shortwave_radiation: time.map((_, i) => (i % 24 >= 4 && i % 24 <= 12) ? 120 : 0), precipitation: time.map(() => 0.4) } };
  return { loc, T0, served };
}
function app() { const fg = createFeatGrid(DATA); return { national: createNational({ dataDir: DATA, featGrid: fg }), mos: { zoneOfPoint: (la, lo, e) => (e >= 1000 ? 'mountain' : 'plains') } }; }

test('a December forecast in the mountains is left as served, with the reason; a July one is corrected', () => {
  const W = createWxMos(app(), DATA);
  const a = mountainLoc(Date.UTC(2026, 11, 10, 0)); W.stash(a.loc); Object.defineProperty(a.loc, '__T0', { value: a.T0, enumerable: false });
  assert.equal(W.apply(a.loc, 35.905, 74.352), false); assert.deepEqual(a.loc.hourly.temperature_2m, a.served); assert.match(a.loc.agn_wxmos.why, /outside the season/);
  const b = mountainLoc(Date.UTC(2026, 6, 10, 0)); W.stash(b.loc); Object.defineProperty(b.loc, '__T0', { value: b.T0, enumerable: false });
  if (M.zones.mountain && M.zones.mountain.applied) { assert.equal(W.apply(b.loc, 35.905, 74.352), true); assert.equal(b.loc.agn_wxmos.hoursOutsideSeason, 0); }
});

test('a forecast that crosses the season end is corrected only on the days inside it', () => {
  const W = createWxMos(app(), DATA); const c = mountainLoc(Date.UTC(2026, 9, 4, 19, 0));   /* 5 Oct 00 PKT .. 6 Oct 23 PKT */
  W.stash(c.loc); Object.defineProperty(c.loc, '__T0', { value: c.T0, enumerable: false });
  if (M.zones.mountain && M.zones.mountain.applied) {
    W.apply(c.loc, 35.905, 74.352); const d = c.loc.hourly.temperature_2m.map((v, i) => v - c.served[i]);
    assert.ok(d.slice(24).every(x => x === 0), 'no change on 6 Oct'); assert.equal(c.loc.agn_wxmos.hoursOutsideSeason, 24);
  }
});
