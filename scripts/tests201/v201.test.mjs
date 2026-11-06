/* v91.17.201 · with the MACH database API down, each station is read from both the platform's latest route and its sheet tab, and the newer reading is kept */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('fleet fallback reads both routes and keeps the newer reading', () => {
  const s = readFileSync(new URL('../../server/api/fleet.mjs', import.meta.url), 'utf8');
  assert.match(s, /const pApi = fetchApi\(st\)\.catch/); assert.match(s, /if \(apiOk && sh\) return tOf\(api\) >= tOf\(sh\) \? api : sh;/);
  assert.match(s, /api\.returnedKey === st\.key/); assert.match(s, /NIGRAAN_FLEET_SHEETS === '1'/);   /* v202: sheets off by default */
});
