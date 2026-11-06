/* v91.17.197 · an epicentre is a seismic target symbol (rings around a point, burnt brown, above the labels), not a dark dot like a city */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const q = readFileSync(new URL('../../build/quake_ui.html', import.meta.url), 'utf8');
test('epicentre symbol differs from a city dot', () => {
  assert.match(q, /className:'agn-quake-ep'/); assert.match(q, /stroke="#7a2e0e"/); assert.match(q, /pe\.style\.zIndex=655/);
  assert.doesNotMatch(q, /fillColor:'#0C3851',fillOpacity:\.82/);
});
