// v91.17.283.10 · shared helper of the tests28310e suites (agents 6 experimentation and 7 weekly proposals).
// TREE = the tree under test: this tree, or T28310E_TREE=/path/to/srv to run a suite against another tree (the v91.17.283.8 base, where
// every check must FAIL: no agent 6 or 7 exists there).
import { readFileSync, mkdtempSync, mkdirSync, cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
export const HERE = dirname(fileURLToPath(import.meta.url));
export const TREE = process.env.T28310E_TREE || join(HERE, '..', '..');
export const FIX = join(HERE, 'fixtures');
export async function tryImp(rel) { try { return await import(pathToFileURL(join(TREE, rel)).href); } catch (e) { return { __err: e.message }; } }
export const src = (rel) => { try { return readFileSync(join(TREE, rel), 'utf8'); } catch (_) { return ''; } };
export const fx = (n) => JSON.parse(readFileSync(join(FIX, n), 'utf8'));
let pass = 0, fail = 0;
export const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + String(d).slice(0, 300) : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + String(d).slice(0, 700) : '')); } };
export const done = (name) => { console.log(`\n${name} ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };
export const sha = (b) => createHash('sha256').update(b).digest('hex');
/* a data folder made of the tree's shipped data files that the experiments touch */
export function dataCopy() {
  const d = mkdtempSync(join(tmpdir(), 'exp-')); const D = join(d, 'data'); mkdirSync(join(D, 'flood-extent'), { recursive: true });
  for (const f of ['blend-weights-active.json', 'blend-weights-v3.json']) { try { cpSync(join(TREE, 'data', f), join(D, f)); } catch (_) {} }
  try { cpSync(join(TREE, 'data', 'flood-extent', 'fx-model.json'), join(D, 'flood-extent', 'fx-model.json')); } catch (_) {}
  try { cpSync(join(TREE, 'data', 'evidence', 'flood'), join(D, 'evidence', 'flood'), { recursive: true }); } catch (_) {}
  return { root: d, data: D };
}
/* every file under a folder -> sha256 (to show what an action changed) */
export function snap(dir) { const o = {}; const walk = (p) => { for (const n of readdirSync(p)) { const f = join(p, n); if (statSync(f).isDirectory()) walk(f); else o[relative(dir, f).split('\\').join('/')] = sha(readFileSync(f)); } }; if (existsSync(dir)) walk(dir); return o; }
export function diff(a, b) { const k = new Set([...Object.keys(a), ...Object.keys(b)]); const out = []; for (const x of k) if (a[x] !== b[x]) out.push((a[x] ? (b[x] ? 'changed ' : 'removed ') : 'added ') + x); return out.sort(); }
export const P = (s) => Date.parse(s.replace(' ', 'T') + ':00Z') - 5 * 3600e3;   /* a PKT wall time -> ms */
