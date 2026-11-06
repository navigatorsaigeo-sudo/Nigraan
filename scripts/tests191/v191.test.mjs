/* v91.17.191 · daytime sun tables off in the live layer (hyperlocal.siteCorrect, data/hyperlocal-model.json sun_tables) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, copyFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHyperlocal } from '../../server/api/hyperlocal.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'); const DATA = join(ROOT, 'data');
const M = JSON.parse(readFileSync(join(DATA, 'hyperlocal-model.json'), 'utf8'));

test('the shipped rule: sun tables off, with the independent-judge evidence that set it', () => {
  assert.equal(M.sun_tables, false);
  const e = M.sun_tables_v191.mae_daytime_C; assert.ok(e.tables_in_use_to_v190 - e.no_tables >= 0.02); assert.ok(e.tables_refitted_right_sensors > e.no_tables);
});

function hl(model) {
  const dir = mkdtempSync(join(tmpdir(), 'hl191-')); writeFileSync(join(dir, 'hyperlocal-model.json'), JSON.stringify(model));
  copyFileSync(join(DATA, 'mach-sun-correction.json'), join(dir, 'mach-sun-correction.json'));
  return createHyperlocal({ fleet: { liveReadings: () => [], latest: () => ({ at: 1, rows: [] }) } }, dir);
}
const SUN = JSON.parse(readFileSync(join(DATA, 'mach-sun-correction.json'), 'utf8')).stations;
const st = SUN.find(s => s.key === 'Mach13');   /* sits at G-15; its autumn table reaches 3.8 C */

test('a reading at a table station at midday (October) is used as read; with the old rule the table moved it', () => {
  const ms = Date.UTC(2026, 9, 6, 7, 0);   /* 12:00 PKT */
  const off = hl(M).siteCorrect(st.lat, st.lon, 30, ms); assert.equal(off.t, 30); assert.equal(off.table, false);
  const on = hl({ ...M, sun_tables: true }).siteCorrect(st.lat, st.lon, 30, ms); assert.equal(on.table, true); assert.ok(Math.abs(on.t - 30) >= 0.5, 'old rule moved it by ' + (on.t - 30));
});
