/* v91.17.195 · Overview bar: one owner, fixed slots; map: one fitter, cards reserved; point popup: opens once, details fold; search Enter */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const R = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
test('the bar is built once and only its values change; the server no longer rewrites it', () => {
  const u = R('build/v84_ui.html'), s = R('server/server.mjs');
  assert.match(u, /function build\(box\)/); assert.match(u, /function cardIsFor\(p,k\)/); assert.match(u, /#agnLive84 \.sk\{/);
  assert.match(u, /@container agnbar \(max-width:1100px\)/); assert.match(u, /flex-wrap:nowrap!important;min-height:52px/);
  assert.doesNotMatch(s, /function placeTick\(\)/); assert.doesNotMatch(s, /function tidy\(\)/); assert.doesNotMatch(s, /^#agnLive84/m);
  assert.match(s, /startup:!!v\.geo/);
});
test('one map fitter; the side cards hold their place from the start', () => {
  assert.match(R('build/desktop_ui.html'), /var fitDone=true;/); assert.doesNotMatch(R('build/v84_ui.html'), /paddingBottomRight:\[lw\+28,70\]/);
  assert.match(R('build/v195_ui.html'), /L\.classList\.add\('open'\); R\.classList\.add\('open'\)/); assert.match(R('build/build80.sh'), /"v195_ui"/);
});
test('point popup: opened once, a closed popup stays closed, technical lines in Details; Enter before the list waits for it', () => {
  const m = R('build/map_ui.html');
  assert.match(m, /PT\.closedSeq!==PT\.seq/); assert.match(m, /details class="more"/); assert.match(m, /overflow-x:hidden!important/);
  assert.match(m, /PT\.enterFor=q/); assert.match(m, /showPop\(!!opts\.startup\)/);
  /* v242: the "Forecast model · tehsil values" tag is removed (CEO 10 Oct); the tiles carry the caption "Today across <unit>" */
  assert.doesNotMatch(R('build/base/AI_GEO_NIGRAAN_v91_17_BASE80.html'), /mp-kind met">Forecast model/); assert.match(R('build/base/AI_GEO_NIGRAAN_v91_17_BASE80.html'), /mp-cap">Today across/);
});
