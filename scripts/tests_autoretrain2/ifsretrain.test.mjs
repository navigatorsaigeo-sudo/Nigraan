/* The serving hook of the automatic monthly retrain (server/api/ifsretrain.mjs): the ONE reader of data/ifs-mos-retrain-active.json.
   No approved set -> nothing (the location is not touched); an approved set -> its terms on IFS-basis hours of approved zones only;
   approval and rollback through the owner's command code (scripts/agents/exp_pointer.mjs) switch it on and off; a changed file is not served.
   node --test scripts/tests_autoretrain2/ifsretrain.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createIfsRetrain } from '../../server/api/ifsretrain.mjs';
import { approve, revert } from '../agents/exp_pointer.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const RULES = 'a8711aef0abfef4210e5f540abb9d8ced08716a308eb04aedbd98b1faaea44eb';
const T0 = Date.UTC(2026, 9, 27, 0);                       /* run 2026102700 */
const H3 = 3 * 3600e3;
/* a fake ecmwf010: t2m = 20 + 0.1 * h, d2m = 10, wind10 = 4 m/s at every hour h after the run */
function fakeE(run = '2026102700', t0 = T0) {
  return { latest: () => ({ run, t0 }), series: () => ({}), atHour: (S, ms) => { const h = (ms - t0) / 3600e3; return h > 0 && h <= 96 ? { t2m: 20 + 0.1 * h, d2m: 10, wind10: 4 } : null; } };
}
const SEAS = { 9: 'SON', 10: 'SON' };
/* coefficient files: every (zone, season, slot, lead) cell = 1.0 * slot + 0.1 * lead for temperature, -2 for dew; wind a = 1, b = 0.5 */
function files(dir) {
  const cells = (f) => { const c = []; for (const z of ['plains', 'hills', 'mountain', 'coast']) for (const s of ['DJF', 'MAM', 'JJA', 'SON']) for (let k = 0; k < 8; k++) for (let L = 1; L <= 3; L++) c.push({ zone: z, season: s, slot: k, lead: L, offsetC: f(k, L), n: 300 }); return c; };
  const zones = (ok) => Object.fromEntries(['plains', 'hills', 'mountain', 'coast'].map((z) => [z, { applied: ok.includes(z), why: [] }]));
  const out = {
    'ifs-mos-temp-table.json': { name: 'ifs-mos-temp-table', version: 'tt-1', rules: 'RULES (rules.json sha256 ' + RULES + ')', zones: zones(['plains']), models: { 'T 3-hourly': { keys: ['zone', 'season', 'slot', 'lead'], cells: cells((k, L) => k + 0.1 * L) } } },
    'ifs-mos-dew-table.json': { name: 'ifs-mos-dew-table', version: 'td-1', rules: 'RULES (rules.json sha256 ' + RULES + ')', zones: zones(['coast']), models: { 'Td 3-hourly': { keys: ['zone', 'season', 'slot', 'lead'], cells: cells(() => -2) } } },
    'ifs-mos-wind-linear.json': { name: 'ifs-mos-wind-linear', version: 'w-1', rules: 'RULES (rules.json sha256 ' + RULES + ')', zones: zones(['plains']), models: { 'wind 3-hourly': { plains: Object.fromEntries([...Array(8).keys()].map((k) => ['slot' + k, { a: 1, b: 0.5 }])) } } },
    'ifs-mos-temp-ridge.json': { name: 'ifs-mos-temp-ridge', version: 'tr-1', rules: 'RULES (rules.json sha256 ' + RULES + ')', zones: zones(['hills']), models: {} }
  };
  mkdirSync(dir, { recursive: true }); const list = [];
  for (const [n, j] of Object.entries(out)) { const b = Buffer.from(JSON.stringify(j)); writeFileSync(join(dir, n), b); list.push({ name: n, sha256: sha(b), candidate: j.name, family: 'x', zones: [] }); }
  return list;
}
/* one location as the substitution leaves it: hours from 26 Oct 19 UTC (00 PKT) for 4 days, values = the IFS values rounded */
function loc(wf = 3.6, overwrite = null) {
  const time = [], T = [], D = [], W = [];
  for (let ms = Date.UTC(2026, 9, 26, 19); ms < Date.UTC(2026, 9, 31, 19); ms += 3600e3) {
    time.push(new Date(ms + 5 * 3600e3).toISOString().slice(0, 16)); const h = (ms - T0) / 3600e3; const ok = h > 0 && h <= 96;
    T.push(ok ? Math.round((20 + 0.1 * h) * 10) / 10 : 15); D.push(ok ? 10 : 5); W.push(ok ? Math.round(4 * wf * 10) / 10 : 1);
  }
  const L = { latitude: 31.5, longitude: 74.3, elevation: 210, utc_offset_seconds: 18000, hourly: { time, temperature_2m: T, dew_point_2m: D, wind_speed_10m: W }, agn_ecmwf010: { run: '2026102700', variables: ['temperature_2m'] } };
  if (overwrite) overwrite(L); return L;
}
function setup() {
  const T = mkdtempSync(join(tmpdir(), 'ifsr_')); const data = join(T, 'data'); mkdirSync(data, { recursive: true });
  return { T, data };
}
function pointer(data, list, version = 'v1') {
  const dir = 'ifs-mos-retrain/' + version; files(join(data, dir));
  writeFileSync(join(data, 'ifs-mos-retrain-active.json'), JSON.stringify({ version, dir, files: list, servingHook: 'server/api/ifsretrain.mjs', previous: { version: 'none (no retrained set)', dir: null, files: [] } }));
}
const mk = (data, zone = 'plains', run, t0) => createIfsRetrain({ dataDir: data, ecmwf010: () => fakeE(run, t0), zoneOf: () => zone, recheckMs: 0 });
const msOf = (L, i) => Date.parse(L.hourly.time[i] + 'Z') - 18000e3;

test('no approved set: plan is null and the location is untouched (byte-identical)', () => {
  const { T, data } = setup();
  try {
    const R = mk(data); const L = loc(); const before = JSON.stringify(L);
    assert.equal(R.plan(L, 31.5, 74.3), null); assert.equal(L.__ifsr, undefined); assert.equal(JSON.stringify(L), before);
    assert.equal(R.applyWind(L), false); R.note(L); assert.equal(JSON.stringify(L), before);
    writeFileSync(join(data, 'ifs-mos-retrain-active.json'), JSON.stringify({ version: 'none (no retrained set)', dir: null, files: [] }));
    assert.equal(R.plan(L, 31.5, 74.3), null); assert.equal(JSON.stringify(L), before); assert.equal(R.status().active, false);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('approved set: the table offset on IFS-basis hours, interpolated between samples, leads 1-3 only, approved zones only', () => {
  const { T, data } = setup();
  try {
    const list = files(join(data, 'x')); pointer(data, list);
    const R = mk(data); const L = loc(); const P = R.plan(L, 31.5, 74.3);
    assert.ok(P); assert.equal(P.zone, 'plains'); assert.equal(P.files.temp, 'tt-1'); assert.equal(P.files.dew, null);
    let n = 0;
    L.hourly.time.forEach((t, i) => { const ms = msOf(L, i), o = P.tAt(ms); const lead = Math.floor((ms + 18000e3) / 864e5) - Math.floor((T0 + 18000e3) / 864e5);
      if (lead < 1 || lead > 3) { assert.equal(o, null, 'lead ' + lead + ' at ' + t); return; }
      if (ms % H3 === 0) { const pk = new Date(ms + 18000e3).getUTCHours(); const slot = Math.floor(((pk - 2 + 24) % 24) / 3); assert.ok(Math.abs(o - (slot + 0.1 * lead)) < 1e-9, t); n++; }
      else if (o != null) { const s0 = Math.floor(ms / H3) * H3; const a = P.tAt(s0), b = P.tAt(s0 + H3); if (a != null && b != null) assert.ok(Math.abs(o - (a + (b - a) * (ms - s0) / H3)) < 1e-9); } });
    assert.ok(n >= 20, 'sample hours checked ' + n);
    /* wind W0 in km/h: max(0, 1 + 0.5 * 4) m/s = 3 m/s = 10.8 km/h on IFS hours of leads 1-3 */
    assert.ok(P.wind.size > 0); for (const v of P.wind.values()) assert.equal(v, 10.8);
    R.applyWind(L); R.note(L); assert.equal(L.agn_ifs_retrain.version, 'v1'); assert.ok(L.agn_ifs_retrain.hours.wind > 0);
    /* another zone: nothing for temperature / wind; the coast gets the dew table */
    const C = mk(data, 'coast').plan(loc(), 31.5, 74.3); assert.ok(C); assert.equal(C.files.temp, null); assert.equal(C.files.dew, 'td-1');
    const Lc = loc(); mk(data, 'coast').plan(Lc, 31.5, 74.3); const i = Lc.hourly.time.indexOf('2026-10-28T14:00'); assert.equal(Lc.__ifsr.tdAt(i), -2);
    assert.equal(mk(data, 'hills').plan(loc(), 31.5, 74.3), null, 'the ridge file of the hills is approved but not served');
    assert.match(R.status().files['ifs-mos-temp-ridge'], /not served/);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('only IFS values: an hour the zone merge replaced, a 12 UTC run or another run is left alone', () => {
  const { T, data } = setup();
  try {
    pointer(data, files(join(data, 'x')));
    const L = loc(3.6, (x) => { const i = x.hourly.time.indexOf('2026-10-28T14:00'); x.hourly.temperature_2m[i] += 0.3; });
    const P = mk(data).plan(L, 31.5, 74.3); const i = L.hourly.time.indexOf('2026-10-28T14:00');
    assert.equal(P.tAt(msOf(L, i)), null); assert.notEqual(P.tAt(msOf(L, i + 3)), null);
    assert.equal(mk(data, 'plains', '2026102712', T0 + 12 * 3600e3).plan(loc(), 31.5, 74.3), null, '12 UTC run');
    const L2 = loc(); L2.agn_ecmwf010.run = '2026102600'; assert.equal(mk(data).plan(L2, 31.5, 74.3), null, 'other run');
    const L3 = loc(); delete L3.agn_ecmwf010; assert.equal(mk(data).plan(L3, 31.5, 74.3), null, 'not substituted');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('a file whose sha256 differs from the pointer is not served (fail closed)', () => {
  const { T, data } = setup();
  try {
    const list = files(join(data, 'x')); pointer(data, list);
    appendFileSync(join(data, 'ifs-mos-retrain', 'v1', 'ifs-mos-temp-table.json'), ' ');
    const R = mk(data); const P = R.plan(loc(), 31.5, 74.3);
    assert.equal(P.files.temp, null); assert.match(R.status().files['ifs-mos-temp-table'], /sha256/); assert.equal(P.files.wind, 'w-1');
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('the owner approves and rolls back with exp_pointer: the hook follows the pointer', () => {
  const { T, data } = setup();
  try {
    const run = join(T, 'rec'); const list = files(run);
    const B = Buffer.from(JSON.stringify({ version: 'ifs-mos-retrain-2026-11', files: list, rules_sha256: RULES, period: '2026-11' })); writeFileSync(join(run, 'bundle.json'), B);
    const rec = { id: 'ifs-mos-retrain@2026-11', promote: true, version: 'ifs-mos-retrain-2026-11', at: new Date().toISOString(), sourceRun: 'test',
      pointer: { target: 'ifs-mos-retrain', fromSha256: null }, artefact: { file: 'bundle.json', sha256: sha(B) } };
    writeFileSync(join(run, 'promotion.json'), JSON.stringify(rec));
    const R = mk(data); const L0 = loc(); assert.equal(R.plan(L0, 31.5, 74.3), null);
    const a = approve(join(run, 'promotion.json'), { dataDir: data, confirm: rec.id }); assert.equal(a.ok, true, a.why);
    const ptr = JSON.parse(readFileSync(join(data, 'ifs-mos-retrain-active.json'), 'utf8')); assert.equal(ptr.servingHook, 'server/api/ifsretrain.mjs');
    const P = R.plan(loc(), 31.5, 74.3); assert.ok(P); assert.equal(P.version, 'ifs-mos-retrain-2026-11');
    const r = revert('ifs-mos-retrain', { dataDir: data, confirm: 'ifs-mos-retrain' }); assert.equal(r.ok, true, r.why);
    const L1 = loc(); const before = JSON.stringify(L1); assert.equal(R.plan(L1, 31.5, 74.3), null); assert.equal(JSON.stringify(L1), before);
  } finally { rmSync(T, { recursive: true, force: true }); }
});

test('mark before the zone merge / plains mix: an hour those steps replace is not IFS basis any more', () => {
  const { T, data } = setup();
  try {
    pointer(data, files(join(data, 'x')));
    const R = mk(data); const L = loc(); const before = JSON.stringify(L);
    R.mark(L); assert.equal(JSON.stringify(L), before, 'mark changes nothing served');
    const i = L.hourly.time.indexOf('2026-10-28T14:00'), j = L.hourly.time.indexOf('2026-10-28T17:00');
    L.hourly.temperature_2m[i] = 33.3;                                   /* the mix replaced this hour */
    const P = R.plan(L, 31.5, 74.3);
    assert.equal(P.tAt(msOf(L, i)), null); assert.notEqual(P.tAt(msOf(L, j)), null);
    const L2 = loc(); for (let k = 0; k < L2.hourly.time.length; k++) L2.hourly.temperature_2m[k] = 1;
    const R2 = mk(data); R2.mark(L2); for (let k = 0; k < L2.hourly.time.length; k++) L2.hourly.temperature_2m[k] = loc().hourly.temperature_2m[k];
    const P2 = R2.plan(L2, 31.5, 74.3); assert.equal(P2.tAt(msOf(L2, i)), null, 'a value that was not the IFS value before the merge does not count, even if it equals it after');
  } finally { rmSync(T, { recursive: true, force: true }); }
});
