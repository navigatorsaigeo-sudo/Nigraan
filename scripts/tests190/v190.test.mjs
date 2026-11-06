/* v91.17.190 · live-layer nowcast (hyperlocal.mjs nowcastFn, data/nowcast-model.json) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHyperlocal } from '../../server/api/hyperlocal.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'); const DATA = join(ROOT, 'data');
const NC = JSON.parse(readFileSync(join(DATA, 'nowcast-model.json'), 'utf8'));

test('the shipped nowcast: 12 h, the live-layer inputs only, and it beat the straight fade as served by >= 0.02 C with no region worse by > 0.02', () => {
  assert.deepEqual(NC.features, ['e0', 'e1', 'e3', 'eY', 'cc0', 'ccH', 'dcc', 'swH', 'sw0', 'prH', 'hs', 'hc', 'ds', 'dc', 'h', 'lin']);
  assert.equal(NC.horizon_h, 12); assert.ok(NC.residual.trees.length >= 100);
  const E = NC.evaluation; assert.ok(E.as_served_trusted.linear_now - E.as_served_trusted.nowcast >= 0.02);
  assert.ok(E.as_served_trusted_1_12.linear_now - E.as_served_trusted_1_12.nowcast >= 0.02);
  for (const [r, v] of Object.entries(E.as_served_by_region)) assert.ok(v.nowcast - v.linear_now <= 0.02, r);
  assert.ok(E.as_served_by_h['1'].nowcast - E.as_served_by_h['1'].linear_now <= 0.005, 'no loss at +1 h');
});

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'nc190-'));
  for (const f of ['hyperlocal-model.json', 'mach-sun-correction.json', 'nowcast-model.json']) copyFileSync(join(DATA, f), join(dir, f));
  const hl = createHyperlocal({ fleet: { liveReadings: () => [], latest: () => ({ at: 1, rows: [] }) } }, dir);
  return { hl, dir };
}
function locFrom(t0, n = 24) {
  const time = []; for (let i = -2; i < n; i++) time.push(new Date(t0 + i * 3600e3).toISOString().slice(0, 16));
  return { utc_offset_seconds: 0, hourly: { time, temperature_2m: time.map(() => 20), cloud_cover: time.map((_, i) => i < 8 ? 10 : 90), shortwave_radiation: time.map(() => 300), precipitation: time.map(() => 0) } };
}
const ROWS = (res) => [{ key: 'a', lat: 33.70, lon: 73.05, tempC: 20 + res, served: 20 }, { key: 'b', lat: 33.72, lon: 73.08, tempC: 20 + res, served: 20 }, { key: 'c', lat: 33.66, lon: 73.02, tempC: 20 + res, served: 20 }];

test('with the nowcast, hours after +6 h carry a correction and the response names it; switched off, the straight fade ends at +6 h', () => {
  const t0 = Math.floor(Date.now() / 3600e3) * 3600e3;
  for (const off of [false, true]) {
    if (off) process.env.NIGRAAN_NOWCAST = '0'; else delete process.env.NIGRAAN_NOWCAST;
    const { hl } = setup(); hl.inject(ROWS(2).map(r => ({ ...r, obsMs: t0 })));
    for (const k of [1, 3, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12]) hl.seedHistory(t0 - k * 3600e3, ROWS(2).map(r => ({ ...r, res: 2 })));
    const loc = locFrom(t0); assert.equal(hl.apply(loc, 33.70, 73.05), true);
    const d = loc.hourly.temperature_2m.map(v => +(v - 20).toFixed(1)); const i8 = 2 + 8;   /* index of t0 + 8 h */
    if (off) { assert.equal(d[i8], 0); assert.equal(loc.agn_hyperlocal.nowcastHours, 0); }
    else { assert.ok(loc.agn_hyperlocal.nowcastHours >= 10, 'hours ' + loc.agn_hyperlocal.nowcastHours); assert.equal(loc.agn_hyperlocal.nowcast, NC.version); assert.ok(Math.abs(d[i8]) > 0, '+8 h ' + d[i8]); }
    assert.ok(Math.abs(d[2] - loc.agn_hyperlocal.dTC) <= 0.1, 'the reading hour keeps the full residual');
  }
  delete process.env.NIGRAAN_NOWCAST;
});

test('missing earlier hours are passed as missing (the model was fitted with gaps), not as zero', () => {
  const t0 = Math.floor(Date.now() / 3600e3) * 3600e3; const { hl } = setup(); hl.inject(ROWS(-3).map(r => ({ ...r, obsMs: t0 })));
  const loc = locFrom(t0); hl.apply(loc, 33.70, 73.05); assert.ok(loc.agn_hyperlocal.nowcastHours > 0);
  const d = loc.hourly.temperature_2m.map(v => v - 20); assert.ok(d.slice(3, 9).every(x => Number.isFinite(x)));
});

test('the history is written to the data folder and read back by a new instance', async () => {
  const { dir } = setup(); const rows = ROWS(1).map(r => ({ ...r, obsMs: Date.now(), usable: true, offset: null }));
  const hl = createHyperlocal({ fleet: { liveReadings: () => rows, latest: () => ({ at: 1, rows: [] }) } }, dir); hl.refresh(true);
  assert.ok(existsSync(join(dir, 'hyperlocal-history.json')));
  const hl2 = createHyperlocal({ fleet: { liveReadings: () => [], latest: () => ({ at: 1, rows: [] }) } }, dir); assert.ok(hl2.status().nowcast.historyHours >= 1);
});

test('the server evaluates the exported trees as the trainer did (40 rows with gaps, booster predictions)', async () => {
  const { lgbEval } = await import('../../server/api/natmodel.mjs');
  assert.ok(Array.isArray(NC.selfcheck) && NC.selfcheck.length >= 20);
  for (const s of NC.selfcheck) assert.ok(Math.abs(lgbEval(NC.residual, s.x) - s.p) < 1e-3, JSON.stringify(s));
});
