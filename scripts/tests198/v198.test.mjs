/* v91.17.198 · rain earlier today: the Rainfall map, the next-24-h strip, the place card and the bar split today's rain at the present hour */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const R = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
test('one split for today (hours past / hours to come), used by the map, the card and the strip', () => {
  const b = R('build/base/AI_GEO_NIGRAAN_v91_17_BASE80.html'), m = R('build/map_ui.html'), u = R('build/v84_ui.html');
  assert.match(b, /function agnRainSplit\(name\)/); assert.match(b, /rainDayP:_rdp, rainSplit:_rsp,/); assert.match(b, /Rain earlier today: '\+_sp\.pastMm\+' mm forecast before/);
  assert.match(b, /class="hcell agn-early198"/);
  assert.match(m, /function rainEarly\(hz,r,meta\)/); assert.match(m, /if\(rainEarly\(hz,r,meta\)\) return RAIN_EARLY;/); assert.match(m, /Normal, rained earlier today, little more to come/);
  assert.match(u, /hourly=precipitation&daily=precipitation_sum/); assert.match(u, /data-k="rest">still to come <b>/);
});
