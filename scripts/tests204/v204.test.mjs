/* v91.17.204 · the MACH siting screen is kept per station for 30 minutes: latest() was screening all 107 stations on every call
   and hyperlocal.at calls it once per location (laptop 8 Oct: event loop blocked 2-98 s, every live call pending) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('screenOne is cached and cleared after a backfill', () => {
  const s = readFileSync(new URL('../../server/api/fleet.mjs', import.meta.url), 'utf8');
  assert.match(s, /function screenOne\(key\) \{ const c = SCR\.get\(key\); if \(c && Date\.now\(\) - c\.at < SCR_TTL\) return c\.v;/);
  assert.match(s, /function screenOneRaw\(key\)/);
  assert.match(s, /rbCache\.at = 0; SCR\.clear\(\);/);
  assert.equal((s.match(/screenOneRaw\(/g) || []).length, 2);   // defined once, called only by the cache
});
