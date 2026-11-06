/* v91.17.203 · the cold self-check allows for the UTCI stored to 0.1 C (a value within 0.05 C of a class bound matches either band) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('S5 tolerance at a class bound', () => {
  const s = readFileSync(new URL('../../artefact/AI_GEO_NIGRAAN_v91_17_MACH.html', import.meta.url), 'utf8');   /* v276: build/selfcheck_ui.html is a build source, not shipped; the same code is in the shipped page */
  assert.match(s, /Math\.abs\(cu-c\[0\]\)<=0\.05/); assert.match(s, /want!==u\.lv&&alt!==u\.lv/);
});
