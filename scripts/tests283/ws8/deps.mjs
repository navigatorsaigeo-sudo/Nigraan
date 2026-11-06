/* v91.17.283 · WS8 · static guard for the module set: the identity test proves the kept scripts are enough on the frozen inputs; this
   proves no code path the inputs did not reach can fall through to a dropped script. For each kept script it lists the global names it
   reads (free identifiers, window.X / G.X reads, AGN.X reads) and the JSON data ids it names; any of those defined only by a dropped
   page script (or a dropped data block) is reported, and with --close the scripts that define them are added (to a fixed point).
   node deps.mjs <artefact> <keep.json> [--close <out.json>] */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pageBlocks } from '../../../server/science/loader.mjs';
const require = createRequire(import.meta.url);
const acorn = require('/opt/node-tools/node_modules/acorn');
const walk = require('/opt/node-tools/node_modules/acorn-walk');
const [ART, KEEP, FLAG, OUT] = process.argv.slice(2);
const { blocks, json } = pageBlocks(ART);
const GL = new Set(['window', 'G', 'global', 'globalThis', 'self', 'W']);
const BUILTIN = new Set(Object.getOwnPropertyNames(globalThis).concat(['window', 'document', 'G', 'global', 'self', 'W', 'arguments', 'undefined', 'location', 'navigator', 'localStorage', 'sessionStorage', 'performance', 'fetch', 'L', 'console', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'requestAnimationFrame', 'getComputedStyle', 'matchMedia', 'history', 'screen', 'alert', 'confirm', 'prompt', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'Image', 'HTMLElement', 'Element', 'Node', 'NodeFilter', 'DOMParser', 'XMLSerializer', 'requestIdleCallback', 'CustomEvent', 'Event', 'devicePixelRatio', 'innerWidth', 'innerHeight', 'crypto', 'AbortController']));
const info = blocks.map((b, i) => {
  const defs = new Set(), reads = new Set(), local = new Set(), ids = new Set(); let ast;
  ast = acorn.parse(b.code, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true });
  for (const n of ast.body) {
    if ((n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') && n.id) defs.add(n.id.name);
    if (n.type === 'VariableDeclaration') for (const d of n.declarations) if (d.id.type === 'Identifier') defs.add(d.id.name);
  }
  const memName = (m) => { if (m.type !== 'MemberExpression' || m.computed || m.property.type !== 'Identifier') return null; const o = m.object;
    if (o.type === 'Identifier' && GL.has(o.name)) return m.property.name;
    if ((o.type === 'Identifier' && o.name === 'AGN') || (o.type === 'MemberExpression' && !o.computed && o.property.name === 'AGN')) return 'AGN.' + m.property.name;
    return null; };
  const assigned = new Set();
  walk.full(ast, (n) => {
    if (n.type === 'AssignmentExpression') { const x = memName(n.left); if (x) { defs.add(x); assigned.add(n.left); } }
    if (n.type === 'VariableDeclarator') walk.full(n.id, (m) => { if (m.type === 'Identifier') local.add(m.name); });
    if ((n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression')) { if (n.id) local.add(n.id.name); for (const p of n.params) walk.full(p, (m) => { if (m.type === 'Identifier') local.add(m.name); }); }
    if (n.type === 'CatchClause' && n.param) walk.full(n.param, (m) => { if (m.type === 'Identifier') local.add(m.name); });
    if (n.type === 'ClassDeclaration' && n.id) local.add(n.id.name);
    if (n.type === 'Literal' && typeof n.value === 'string' && json.has(n.value)) ids.add(n.value);
  });
  /* identifiers in reference position: walk with ancestors and skip property keys / non-computed member properties */
  walk.fullAncestor(ast, (n, _s, anc) => {
    if (n.type === 'MemberExpression' && !assigned.has(n)) { const x = memName(n); if (x) reads.add(x); }
    if (n.type !== 'Identifier') return; const p = anc[anc.length - 2];
    if (p && p.type === 'MemberExpression' && p.property === n && !p.computed) return;
    if (p && (p.type === 'Property' || p.type === 'PropertyDefinition' || p.type === 'MethodDefinition') && p.key === n && !p.computed) return;
    if (p && (p.type === 'LabeledStatement' || p.type === 'BreakStatement' || p.type === 'ContinueStatement')) return;
    if (!local.has(n.name) && !BUILTIN.has(n.name)) reads.add(n.name);
  });
  return { i, id: (b.attrs.match(/id="([^"]+)"/) || [])[1] || null, defs, reads, ids };
});
const keep = JSON.parse(readFileSync(KEEP, 'utf8'));
/* v91.17.283.20 · keep.json v2 names scripts by { id } or { anchor } (a unique line of code); positions only in the older lists */
const sel = (s) => (typeof s === 'number' ? s : info.findIndex((b) => (s.id ? b.id === s.id : blocks[b.i].code.includes(s.anchor))));
const K = new Set(keep.blocks.map(sel)); const D = new Set(keep.data);
const report = []; let grew = true;
while (grew) { grew = false;
  const defKept = new Set(); for (const k of K) for (const d of info[k].defs) defKept.add(d);
  for (const k of [...K]) for (const r of info[k].reads) { if (defKept.has(r)) continue;
    const by = info.filter(b => !K.has(b.i) && b.defs.has(r)).map(b => b.i); if (!by.length) continue;
    report.push({ from: k, name: r, definedOnlyBy: by });
    if (FLAG === '--close') { for (const b of by) K.add(b); grew = true; } }
  for (const k of K) for (const id of info[k].ids) if (!D.has(id)) { report.push({ from: k, data: id }); D.add(id); if (FLAG === '--close') grew = true; }
  if (FLAG !== '--close') break; }
const uniq = [...new Map(report.map(r => [JSON.stringify(r), r])).values()];
console.log(JSON.stringify({ kept: K.size, data: [...D], missing: uniq }, null, 1));
if (FLAG === '--close') writeFileSync(OUT, JSON.stringify({ ...keep, blocks: [...K].sort((a, b) => a - b), data: [...D] }, null, 1));
