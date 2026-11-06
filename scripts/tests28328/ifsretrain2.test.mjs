/* v91.17.283.28 · per-zone winners in the serving hook of the monthly retrain (server/api/ifsretrain.mjs).
   The retrain keeps one winner per variable and zone; a bundle can hold two wind files for different zones (W0 linear for the plains,
   W1 ridge for the hills). Both must serve, each in its own zone; a malformed bundle with two files claiming one zone serves neither
   there (fail closed) and leaves the other zones alone; approval and rollback move between such sets.
   node --test scripts/tests28328/ifsretrain2.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createIfsRetrain } from '../../server/api/ifsretrain.mjs';
import { approve, revert, targetState } from '../agents/exp_pointer.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const RULES = '9af7779387fdc32c5c9821b7d71f4fb9aea848a8c73c74940ea38aa51326049c';
const T0 = Date.UTC(2026, 9, 27, 0);                                  /* run 2026102700 */
const ZONES = ['plains', 'hills', 'mountain', 'coast'];
const fakeE = () => ({ latest: () => ({ run: '2026102700', t0: T0 }), series: () => ({}),
  atHour: (S, ms) => { const h = (ms - T0) / 3600e3; return h > 0 && h <= 96 ? { t2m: 20 + 0.1 * h, d2m: 10, wind10: 4 } : null; } });
const zonesDoc = (ok) => Object.fromEntries(ZONES.map((z) => [z, { applied: ok.includes(z), why: [] }]));
/* W0 for the given zones: a = 1, b = 0.5 -> 1 + 0.5 * 4 = 3 m/s = 10.8 km/h */
const w0 = (zs) => ({ name: 'ifs-mos-wind-linear', version: 'w0-' + zs.join('+'), rules: 'R (sha256 ' + RULES + ')', zones: zonesDoc(zs),
  models: { 'wind 3-hourly': Object.fromEntries(zs.map((z) => [z, Object.fromEntries([...Array(8).keys()].map((k) => ['slot' + k, { a: 1, b: 0.5 }]))])) } });
/* W1 ridge for the given zones: offset = 0.5 + 0.25 * f (SON) -> 4 + 1.5 = 5.5 m/s = 19.8 km/h */
const w1 = (zs) => ({ name: 'ifs-mos-wind-ridge', version: 'w1-' + zs.join('+'), rules: 'R (sha256 ' + RULES + ')', zones: zonesDoc(zs),
  models: { 'wind 3-hourly': Object.fromEntries(zs.map((z) => [z, { intercepts: Object.fromEntries([...Array(8).keys()].map((k) => ['int_SON_slot' + k, 0.5])),
    continuous: [{ name: 'f_x_SON', coef: 0.25, mean: 0, sd: 1 }] }])) } });
const tt = (zs, off) => ({ name: 'ifs-mos-temp-table', version: 'tt-' + off, rules: 'R (sha256 ' + RULES + ')', zones: zonesDoc(zs), models: { 'T 3-hourly': { cells:
  ZONES.flatMap((z) => ['DJF', 'MAM', 'JJA', 'SON'].flatMap((s) => [...Array(8).keys()].flatMap((k) => [1, 2, 3].map((L) => ({ zone: z, season: s, slot: k, lead: L, offsetC: off })))))  } } });

function writeFiles(dir, docs) {
  mkdirSync(dir, { recursive: true }); const list = [];
  for (const j of docs) { const b = Buffer.from(JSON.stringify(j)); writeFileSync(join(dir, j.name + '.json'), b); list.push({ name: j.name + '.json', sha256: sha(b), candidate: j.name, family: 'x', zones: [] }); }
  return list;
}
function loc() {
  const time = [], T = [], D = [], W = [];
  for (let ms = Date.UTC(2026, 9, 26, 19); ms < Date.UTC(2026, 9, 31, 19); ms += 3600e3) {
    time.push(new Date(ms + 5 * 3600e3).toISOString().slice(0, 16)); const h = (ms - T0) / 3600e3; const ok = h > 0 && h <= 96;
    T.push(ok ? Math.round((20 + 0.1 * h) * 10) / 10 : 15); D.push(ok ? 10 : 5); W.push(ok ? 14.4 : 1);
  }
  return { latitude: 31.5, longitude: 74.3, elevation: 210, utc_offset_seconds: 18000, hourly: { time, temperature_2m: T, dew_point_2m: D, wind_speed_10m: W }, agn_ecmwf010: { run: '2026102700' } };
}
const mk = (data, zone) => createIfsRetrain({ dataDir: data, ecmwf010: fakeE, zoneOf: () => zone, featGrid: () => ({ value: () => 1 }), recheckMs: 0 });
const windsOf = (data, zone) => { const P = mk(data, zone).plan(loc(), 31.5, 74.3); return P ? [...new Set(P.wind.values())] : null; };
/* a promotion record + bundle as the monthly run writes them (station-lake/retrain/auto/proposal.py) */
function record(T, id, docs, data = null) {
  const run = join(T, 'rec_' + id.replace(/\W/g, '_')); const list = writeFiles(run, docs);
  const version = 'ifs-mos-r' + id; const B = Buffer.from(JSON.stringify({ version, files: list, rules_sha256: RULES, period: id }));
  writeFileSync(join(run, 'bundle.json'), B);
  const rec = { id: 'ifs-mos-retrain@' + id, promote: true, version, at: new Date().toISOString(), sourceRun: 'test',
    pointer: { target: 'ifs-mos-retrain', fromSha256: data ? targetState(data, 'ifs-mos-retrain').sha256 : null }, artefact: { file: 'bundle.json', sha256: sha(B) } };
  writeFileSync(join(run, 'promotion.json'), JSON.stringify(rec)); return { f: join(run, 'promotion.json'), rec };
}

test('two wind files approved for different zones: each zone is served by its own file', () => {
  const T = mkdtempSync(join(tmpdir(), 'ifsr2_')); const data = join(T, 'data'); mkdirSync(data);
  try {
    const { f, rec } = record(T, '2026-10', [w0(['plains']), w1(['hills']), tt(['plains'], 1.0)]);
    const a = approve(f, { dataDir: data, confirm: rec.id }); assert.equal(a.ok, true, a.why);
    assert.deepEqual(windsOf(data, 'plains'), [10.8], 'plains: W0');
    assert.deepEqual(windsOf(data, 'hills'), [19.8], 'hills: W1 (the second wind file is served, not refused)');
    assert.equal(windsOf(data, 'mountain'), null); assert.equal(windsOf(data, 'coast'), null);
    const R = mk(data, 'hills'); const L = loc(); const P = R.plan(L, 31.5, 74.3);
    assert.equal(P.files.wind, 'w1-hills'); assert.equal(P.files.temp, null, 'the plains temperature table does not leak into the hills');
    R.applyWind(L); R.note(L); assert.equal(L.agn_ifs_retrain.files.wind, 'ifs-mos-wind-ridge');
    const st = R.status();
    assert.deepEqual(st.servedByZone.wind, { plains: 'ifs-mos-wind-linear', hills: 'ifs-mos-wind-ridge' });
    assert.deepEqual(st.servedByZone.temp, { plains: 'ifs-mos-temp-table' });
    assert.equal(st.files['ifs-mos-wind-linear'], 'served in plains'); assert.equal(st.files['ifs-mos-wind-ridge'], 'served in hills'); assert.equal(st.conflicts, null);
    const Pp = mk(data, 'plains').plan(loc(), 31.5, 74.3); assert.equal(Pp.files.wind, 'w0-plains'); assert.equal(Pp.files.temp, 'tt-1');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('a W1 zone without the terrain values at the point serves nothing there (fail closed), the W0 zone is unaffected', () => {
  const T = mkdtempSync(join(tmpdir(), 'ifsr2_')); const data = join(T, 'data'); mkdirSync(data);
  try {
    const { f, rec } = record(T, '2026-10', [w0(['plains']), w1(['hills'])]); assert.equal(approve(f, { dataDir: data, confirm: rec.id }).ok, true);
    const noTerr = (zone) => createIfsRetrain({ dataDir: data, ecmwf010: fakeE, zoneOf: () => zone, featGrid: () => ({ value: () => NaN }), recheckMs: 0 });
    assert.equal(noTerr('hills').plan(loc(), 31.5, 74.3), null);
    assert.deepEqual([...new Set(noTerr('plains').plan(loc(), 31.5, 74.3).wind.values())], [10.8]);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('two files claiming the same zone for one variable: that zone serves neither, the other zones keep their winner', () => {
  const T = mkdtempSync(join(tmpdir(), 'ifsr2_')); const data = join(T, 'data'); mkdirSync(data);
  try {
    const { f, rec } = record(T, '2026-10', [w0(['plains', 'coast']), w1(['hills', 'coast'])]); assert.equal(approve(f, { dataDir: data, confirm: rec.id }).ok, true);
    assert.equal(windsOf(data, 'coast'), null);
    assert.deepEqual(windsOf(data, 'plains'), [10.8]); assert.deepEqual(windsOf(data, 'hills'), [19.8]);
    const st = mk(data, 'coast').status();
    assert.deepEqual(st.conflicts, { 'wind|coast': ['ifs-mos-wind-linear', 'ifs-mos-wind-ridge'] });
    assert.match(st.files['ifs-mos-wind-linear'], /^served in plains; NOT in coast/); assert.match(st.files['ifs-mos-wind-ridge'], /^served in hills; NOT in coast/);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('approve a second month, roll back to the first, roll back to none: the per-zone winners follow the pointer', () => {
  const T = mkdtempSync(join(tmpdir(), 'ifsr2_')); const data = join(T, 'data'); mkdirSync(data);
  try {
    const R = mk(data, 'hills'); assert.equal(R.plan(loc(), 31.5, 74.3), null);
    const m1 = record(T, '2026-10', [w0(['plains']), w1(['hills'])]); assert.equal(approve(m1.f, { dataDir: data, confirm: m1.rec.id }).ok, true);
    assert.deepEqual(windsOf(data, 'hills'), [19.8]);
    /* November: W0 now wins the hills too, W1 nowhere */
    const m2 = record(T, '2026-11', [w0(['plains', 'hills'])], data);   /* written after October was approved */ assert.equal(approve(m2.f, { dataDir: data, confirm: m2.rec.id }).ok, true);
    assert.deepEqual(windsOf(data, 'hills'), [10.8]); assert.deepEqual(windsOf(data, 'plains'), [10.8]);
    assert.equal(JSON.parse(readFileSync(join(data, 'ifs-mos-retrain-active.json'), 'utf8')).version, 'ifs-mos-r2026-11');
    /* rollback: October's per-zone set again (W1 in the hills) */
    let r = revert('ifs-mos-retrain', { dataDir: data, confirm: 'ifs-mos-retrain' }); assert.equal(r.ok, true, r.why);
    assert.deepEqual(windsOf(data, 'hills'), [19.8]); assert.deepEqual(windsOf(data, 'plains'), [10.8]);
    assert.deepEqual(mk(data, 'plains').status().servedByZone.wind, { plains: 'ifs-mos-wind-linear', hills: 'ifs-mos-wind-ridge' });
    /* a rollback is itself revertible (back to November); the first approval rolls back to none */
    r = revert('ifs-mos-retrain', { dataDir: data, confirm: 'ifs-mos-retrain' }); assert.equal(r.ok, true, r.why);
    assert.deepEqual(windsOf(data, 'hills'), [10.8]);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('rollback of the only approval leaves no correction anywhere (location byte-identical)', () => {
  const T = mkdtempSync(join(tmpdir(), 'ifsr2_')); const data = join(T, 'data'); mkdirSync(data);
  try {
    const m1 = record(T, '2026-10', [w0(['plains']), w1(['hills'])]); assert.equal(approve(m1.f, { dataDir: data, confirm: m1.rec.id }).ok, true);
    assert.equal(revert('ifs-mos-retrain', { dataDir: data, confirm: 'ifs-mos-retrain' }).ok, true);
    for (const z of ZONES) { const L = loc(); const b = JSON.stringify(L); const R = mk(data, z); assert.equal(R.plan(L, 31.5, 74.3), null); R.applyWind(L); R.note(L); assert.equal(JSON.stringify(L), b, z); }
    assert.equal(mk(data, 'plains').status().active, false);
  } finally { rmSync(T, { recursive: true, force: true }); }
});
