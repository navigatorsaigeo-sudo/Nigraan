// v91.17.283.3 srvfix · shared test helper. TREE = the tree under test (default: this tree; set SRVFIX_TREE=/path/to/srv to run a
// test against another tree, e.g. the v283.2 base, where every srvfix test must FAIL).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
export const TREE = process.env.SRVFIX_TREE || join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const imp = (rel) => import(pathToFileURL(join(TREE, rel)).href);
export const src = (rel) => readFileSync(join(TREE, rel), 'utf8');
let pass = 0, fail = 0;
export const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + d : '')); } };
export const done = (name) => { console.log(`\n${name} ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };
/* lift one top-level function or const out of a module's text unchanged (as the audit's repro/lib.mjs does) */
export function lift(text, name) {
  const re = new RegExp('(?:^|\\n)[ \\t]*((?:export\\s+)?(?:async\\s+)?function\\s+' + name + '\\s*\\(|(?:export\\s+)?const\\s+' + name + '\\s*=)');
  const m = re.exec(text); if (!m) return null; let i = m.index + m[0].indexOf(m[1]); let depth = 0, started = false, j = i, q = null;
  for (; j < text.length; j++) { const c = text[j];
    if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
    if (c === '/' && text[j + 1] === '*') { const e = text.indexOf('*/', j + 2); j = e < 0 ? text.length : e + 1; continue; }
    if (c === '/' && text[j + 1] === '/') { const e = text.indexOf('\n', j); j = e < 0 ? text.length : e; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{' || c === '(' || c === '[') { depth++; started = true; } else if (c === '}' || c === ')' || c === ']') { depth--; if (started && depth === 0 && (c === '}' ) && /function/.test(m[1])) { j++; break; } }
    else if (c === ';' && depth === 0 && started && !/function/.test(m[1])) { j++; break; } }
  return text.slice(i, j).replace(/^export\s+/, '');
}
