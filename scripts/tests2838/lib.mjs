// v91.17.283.8 · shared helper of the tests2838 suites. TREE = the tree under test: this tree, or T2838_TREE=/path/to/srv to run a suite
// against another tree (the v91.17.283.7 base, where every audit-fix check must FAIL).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
export const TREE = process.env.T2838_TREE || join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const imp = (rel) => import(pathToFileURL(join(TREE, rel)).href);
export const src = (rel) => { try { return readFileSync(join(TREE, rel), 'utf8'); } catch (_) { return ''; } };
export const json = (rel) => { try { return JSON.parse(readFileSync(join(TREE, rel), 'utf8')); } catch (_) { return null; } };
export const BASE = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : null;
let pass = 0, fail = 0;
export const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + String(d).slice(0, 300) : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + String(d).slice(0, 600) : '')); } };
export const done = (name) => { console.log(`\n${name} ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };
export async function tryImp(rel) { try { return await imp(rel); } catch (e) { return { __err: e.message }; } }
/* lift one top-level-looking function or const out of a page / module text (the srvfix helper) */
export function lift(text, name) {
  const re = new RegExp('(?:^|\\n)[ \\t]*((?:export\\s+)?(?:async\\s+)?function\\s+' + name + '\\s*\\(|(?:export\\s+)?(?:const|var|let)\\s+' + name + '\\s*=)');
  const m = re.exec(text); if (!m) return null; let i = m.index + m[0].indexOf(m[1]); let depth = 0, started = false, j = i, q = null;
  for (; j < text.length; j++) { const c = text[j];
    if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
    if (c === '/' && text[j + 1] === '*') { const e = text.indexOf('*/', j + 2); j = e < 0 ? text.length : e + 1; continue; }
    if (c === '/' && text[j + 1] === '/' && text[j - 1] !== ':') { const e = text.indexOf('\n', j); j = e < 0 ? text.length : e; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{' || c === '(' || c === '[') { depth++; started = true; } else if (c === '}' || c === ')' || c === ']') { depth--; if (started && depth === 0 && c === '}' && /function/.test(m[1])) { j++; break; } }
    else if (c === ';' && depth === 0 && started && !/function/.test(m[1])) { j++; break; } }
  return text.slice(i, j).replace(/^export\s+/, '');
}
export async function get(path, h = {}) { try { const r = await fetch(BASE + path, { headers: h }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (_) {} return { s: r.status, j, t }; } catch (e) { return { s: 0, j: null, t: String(e) }; } }
export const CUST = { 'x-agn-view': 'customer' };
