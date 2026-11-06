// v91.17.283.10 · shared helper of the tests28310 suites (the diagnostic agent). TREE = the tree under test: this tree, or
// T28310_TREE=/path/to/srv to run a suite against another tree (the v91.17.283.8 base, where every check must FAIL).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
export const TREE = process.env.T28310_TREE || join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const imp = (rel) => import(pathToFileURL(join(TREE, rel)).href);
export const src = (rel) => { try { return readFileSync(join(TREE, rel), 'utf8'); } catch (_) { return ''; } };
let pass = 0, fail = 0;
export const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + String(d).slice(0, 300) : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + String(d).slice(0, 600) : '')); } };
export const done = (name) => { console.log(`\n${name} ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };
export async function need(rel, name) { try { return await imp(rel); } catch (e) { ok(false, rel + ' loads', e.message.split('\n')[0]); done(name); } }
/* a seeded normal generator (Box-Muller on mulberry32) for the synthetic cases */
export function gauss(seed = 1) { let a = seed >>> 0; const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u()); }
export const days = (from, n) => Array.from({ length: n }, (_, i) => new Date(Date.parse(from + 'T00:00:00Z') + i * 864e5).toISOString().slice(0, 10));
