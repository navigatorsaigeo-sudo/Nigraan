/* v91.17.186 · live layer (siting offsets, every QC-passed station, one station enough, no cap), rain chance and labels, first load */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { computeOffsets, partOf } from '../../server/api/sitingoffsets.mjs';
import { createHyperlocal } from '../../server/api/hyperlocal.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCREEN = { radius_km: 15, dz_m: 150, min_neighbours: 2, min_days: 10, abs_c: 2.5, iqr_c: 3.0 };
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* 14 days of hourly residuals; fn(hourIso) -> residual */
function series(fn, days = 14, start = Date.parse('2026-09-20T00:00:00Z')) { const h = {}; for (let i = 0; i < days * 24; i++) { const iso = new Date(start + i * 3600e3).toISOString().slice(0, 13); const r = fn(iso, i); if (r != null) h[iso] = [20 + r, r]; } return h; }
const noise = (i, k) => Math.sin(i * 1.7 + k) * 0.3;

test('partOf follows PKT: 04 UTC is 09 PKT (day), 16 UTC is 21 PKT (night), 01 UTC is 06 PKT (between)', () => {
  assert.equal(partOf('2026-10-06T04'), 'day'); assert.equal(partOf('2026-10-06T16'), 'night'); assert.equal(partOf('2026-10-06T01'), 'between');
});

test('a station 2 C warm by day against two MACH neighbours gets a day offset near +2 and a night offset near 0', () => {
  const st = {
    a: { lat: 33.70, lon: 73.05, elevM: 520, hours: series((iso, i) => (partOf(iso) === 'day' ? 2 : 0) + 0.5 + noise(i, 1)) },
    b: { lat: 33.72, lon: 73.06, elevM: 530, hours: series((iso, i) => 0.5 + noise(i, 2)) },
    c: { lat: 33.69, lon: 73.08, elevM: 510, hours: series((iso, i) => 0.5 + noise(i, 3)) },
  };
  const o = computeOffsets(st, [], SCREEN, 40).stations.a;
  assert.equal(o.ref, 'MACH neighbours');
  assert.ok(Math.abs(o.off.day - 2) < 0.4, 'day ' + o.off.day); assert.ok(Math.abs(o.off.night) < 0.4, 'night ' + o.off.night);
  assert.equal(o.flag, false);
});

test('a lone station is measured against the nearest PMD synop within the radius', () => {
  const st = { g: { lat: 35.90, lon: 74.37, elevM: 1490, hours: series((iso, i) => 3 + noise(i, 4)) } };
  const syn = [{ sid: '41516', name: 'Gilgit', lat: 35.919, lon: 74.334, elevM: 1457, hours: Object.fromEntries(Object.keys(st.g.hours).filter((h, i) => i % 3 === 0).map((h, i) => [h, 0.5 + noise(i, 5)])) }];
  const o = computeOffsets(st, syn, SCREEN, 40).stations.g;
  assert.equal(o.ref, 'synop'); assert.equal(o.refName, 'Gilgit'); assert.ok(Math.abs(o.off.day - 2.5) < 0.5);
});

test('a station whose difference from its reference swings widely is held out as unsteady', () => {
  const st = {
    a: { lat: 33.70, lon: 73.05, elevM: 520, hours: series((iso, i) => (i % 2 ? 4 : -4)) },
    b: { lat: 33.72, lon: 73.06, elevM: 530, hours: series((iso, i) => noise(i, 2)) },
    c: { lat: 33.69, lon: 73.08, elevM: 510, hours: series((iso, i) => noise(i, 3)) },
  };
  const o = computeOffsets(st, [], SCREEN, 40).stations.a;
  assert.equal(o.flag, true); assert.match(o.why, /unsteadily/);
});

test('a lone station reading about 11 C low with no reference is held out as faulty; lone stations within the spread are not', () => {
  const st = {};
  for (let k = 0; k < 10; k++) st['s' + k] = { lat: 24 + k * 1.3, lon: 62 + k * 1.3, elevM: 100, hours: series((iso, i) => (k - 5) * 0.4 + noise(i, k)) };
  st.bad = { lat: 31.40, lon: 74.10, elevM: 200, hours: series((iso, i) => 10.5 + noise(i, 9)) };
  const O = computeOffsets(st, [], SCREEN, 40).stations;
  assert.equal(O.bad.flag, true); assert.match(O.bad.why, /far-out fences/);
  assert.equal(Object.entries(O).filter(([k, r]) => k !== 'bad' && r.flag).length, 0);
});

function layer(rows, model = {}) {
  const dir = mkdtempSync(join(tmpdir(), 't186-'));
  const base = JSON.parse(read('data/hyperlocal-model.json'));
  writeFileSync(join(dir, 'hyperlocal-model.json'), JSON.stringify({ ...base, ...model, max_age_min: 1e9 }));
  copyFileSync(join(ROOT, 'data', 'mach-sun-correction.json'), join(dir, 'mach-sun-correction.json'));
  const hl = createHyperlocal({ fleet: { liveReadings: () => rows, latest: () => ({ at: 1, rows: rows.map(r => ({ lat: r.lat, lon: r.lon, usable: true, ageMin: 0 })) }) } }, dir); hl.refresh(true); return hl;
}
const T = Date.parse('2026-10-06T09:00:00Z');

test('the shipped model: one station is enough, no cap, no clamp, and the v186 hindcast beats the v185 rule', () => {
  const m = JSON.parse(read('data/hyperlocal-model.json'));
  assert.equal(m.min_stations, 1); assert.equal(m.cap_c, null); assert.equal(m.clamp_c, null);
  const v = m.validation_v186.mae_trusted_C; assert.ok(v.v186 < v.v185 && v.v185 < v.served, JSON.stringify(v));
  const o = m.validation_v186.mae_trusted_day_by_sky_C['dull/overcast']; assert.ok(o.v186 < o.v185);
});

test('one station 2 km away anchors the point within the buddy floor; beyond it the lone reading falls back to the model chain (v91.17.283 WS2 F1b)', () => {
  /* v91.17.283.14 · this case predates WS2 F1b (v91.17.283): a lone station is applied only within buddy.min_c of data/hyperlocal-model.json */
  const lim = JSON.parse(read('data/hyperlocal-model.json')).buddy.min_c;
  const near = layer([{ key: 'lone', name: 'lone', lat: 35.90, lon: 74.37, obsMs: T, tempC: 29.5 - (lim - 0.5), served: 29.5, offset: null }]);
  const a = near.at(35.905, 74.352);
  assert.equal(a.applied, true); assert.ok(a.dT < 0 && a.dT >= -(lim - 0.5) - 1e-9, 'dT ' + a.dT);
  const far = layer([{ key: 'lone', name: 'lone', lat: 35.90, lon: 74.37, obsMs: T, tempC: 20.7, served: 29.5, offset: null }]);
  const b = far.at(35.905, 74.352);
  assert.equal(b.applied, false); assert.equal(b.lone, true); assert.match(b.why, /model chain is served/);
});

test('v91.17.283.14: a station its offsets record flags is NOT left out (its value passed obsqc.mjs); only its offset is not removed', () => {
  const flagged = layer([{ key: 'h', name: 'h', lat: 31.4, lon: 74.1, obsMs: T, tempC: 28.5, served: 30, offset: { ref: null, flag: true, why: 'faulty', off: { day: 2, night: 2, between: 2 } } }]);
  const a = flagged.at(31.41, 74.11); assert.equal(a.applied, true); assert.ok(a.dT < 0, 'dT ' + a.dT);
  assert.deepEqual(flagged.status().heldOut, []);
  const kept = layer([{ key: 'k', name: 'k', lat: 31.4, lon: 74.1, obsMs: T, tempC: 32, served: 30, offset: { ref: 'MACH neighbours', refName: '3 within 15 km', flag: false, off: { day: 2, night: 0, between: 1 } } }]);
  const b = kept.at(31.4, 74.1); assert.equal(b.applied, true); assert.ok(Math.abs(b.dT) < 0.05 + 1e-9 || Math.abs(b.dT) < 0.1, 'dT ' + b.dT);
  assert.equal(b.top[0].siteOffsetRemovedC, 2);
});

test('at() can leave a station out (the hindcast harness scores each station hidden)', () => {
  const hl = layer([{ key: 'x', name: 'x', lat: 31.4, lon: 74.1, obsMs: T, tempC: 25, served: 30, offset: null }]);
  assert.equal(hl.at(31.4, 74.1, { exclude: 'x' }).applied, false);
});

test('fleet: duplicate sensors kept once in the live readings (v91.17.283.14: obsqc.mjs copy check in the poll), offsets refreshed after the backfill, offsets route', () => {
  const f = read('server/api/fleet.mjs');
  assert.match(f, /QC\.qcCross\(items, QCP, \{ copyOf, prefer \}\)/); assert.match(f, /await refreshOffsets\(\)/); assert.match(f, /offset: offsetFor\(r\.key\)/);
  assert.match(read('server/api/index.mjs'), /'\/api\/fleet\/offsets'/);
  assert.match(read('server/api/synop.mjs'), /records = \(\) => \(\{ stations: ST, records: REC \}\)/);
});

test('rain: the national run keeps the previous PKT day so the calibrated chance is not withheld', () => {
  const n = read('server/api/national.mjs'); assert.match(n, /const dPrev = d0 - 864e5/); assert.match(n, /ms > dPrev && ms <= baseMs/);
});

test('rain: a withheld chance on a forecast rain day does not read "dry"; the header names forecast and measured rain', () => {
  /* v91.17.276 · build/base and build/v84_ui.html are build sources, not shipped; the same code is in the shipped page */
  const b = read('artefact/AI_GEO_NIGRAAN_v91_17_MACH.html'); assert.match(b, /Rain forecast, '\+_rcRow\.fcMm\+' mm in the day \(its chance is not available\)/);
  const u = b; assert.match(u, /Rain forecast today <b>/); assert.match(u, /Measured so far <b>/); assert.doesNotMatch(u, />Rain today <b>/);
});

test('first load: the corrected sweep copy is written to disk and read back at start', () => {
  const s = read('server/server.mjs'); assert.match(s, /function corrPrevSave\(sk\)/); assert.match(s, /corrPrevSave\(sk\); return c;/); assert.match(s, /endsWith\('\.corr\.meta'\)/);
});
