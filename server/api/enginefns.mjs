/* == v91.17.283.28 · S5 · THE MAP'S OWN SCORING FUNCTIONS, AT ANY POINT =================================================================
   The tehsil levels of cold and wind on the map are the hazard engine's (server/science/modules/*: hzCold, hzWind, run for every tehsil by
   the engine runner). A site's own level must come from the SAME code, not a copy: this module reads those functions' source from the
   science module files (found by name, so a renumbered module is still found), with the few helpers they call (the UTCI polynomial and
   classes, the AGN UTCI maps, hzClamp, the engine-host guard) and runs them in a small sandbox whose formula register is
   data/formula-registry.json (the file the engine reads through GET /api/registry/formula). Nothing here decides a level. */
import vm from 'node:vm';
import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const MOD = join(dirname(fileURLToPath(import.meta.url)), '..', 'science', 'modules');
const FUNCS = ['agnEngineHost', 'agnPageRefusal', 'hzClamp', 'agnUtciEs', 'agnUtci', 'agnUtciColdScore', 'agnUtciClass', 'agnUtciAgnScore', 'hzWind', 'hzCold'];
const CONSTS = ['AGN_UTCI_CLASSES', 'AGN_UTCI_AGN_MAP', 'AGN_UTCI_COLD_MAP'];
/* the source of `function name(...) {...}` (brace-matched, strings and comments skipped) or of `const NAME = ...;` (one line) */
export function extractFn(src, name) {
  const i = src.search(new RegExp('(^|\\n)function ' + name + '\\s*\\(')); if (i < 0) return null; const s = src.indexOf('function', i);
  let k = src.indexOf('{', s), d = 0, q = null;
  for (let j = k; j < src.length; j++) { const c = src[j];
    if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && src[j + 1] === '/') { j = src.indexOf('\n', j); if (j < 0) break; continue; }
    if (c === '/' && src[j + 1] === '*') { j = src.indexOf('*/', j + 2) + 1; continue; }
    if (c === '{') d++; else if (c === '}') { d--; if (d === 0) return src.slice(s, j + 1); } }
  return null;
}
export const extractConst = (src, name) => { const m = src.match(new RegExp('(^|\\n)const ' + name + ' = [^\\n]*;')); return m ? m[0].trim().replace(/\/\*.*$/, '') : null; };
let cache = null;
/* v91.17.283.28 · the modules the engine runs are the manifest's (server/science/manifest.json, in run order), never every .js in the folder: a
   computer keeps renumbered files of earlier builds beside them (and their .bak copies), and a stale copy sorted first would answer here. The
   engine host runs them in order, so a later definition wins; the same rule is used here (the last module that defines the name). */
const MANIFEST = join(MOD, '..', 'manifest.json');
function modFiles() { try { return JSON.parse(readFileSync(MANIFEST, 'utf8')).modules.map((m) => m.file).filter((f) => typeof f === 'string' && f.endsWith('.js')); } catch (_) { return []; } }
function sig() { try { return modFiles().map((f) => f + ':' + statSync(join(MOD, f)).mtimeMs).join('|') + '#' + statSync(MANIFEST).mtimeMs; } catch (_) { return ''; } }
export function engineFns(dataDir) {
  const s = sig() + '#' + (() => { try { return statSync(join(dataDir, 'formula-registry.json')).mtimeMs; } catch (_) { return 0; } })();
  if (cache && cache.s === s) return cache.v;
  const files = modFiles().map((f) => { try { return readFileSync(join(MOD, f), 'utf8'); } catch (_) { return ''; } }).reverse();   /* last definition first */
  const parts = [], missing = [];
  for (const n of CONSTS) { const c = files.map((x) => extractConst(x, n)).find(Boolean); if (c) parts.push(c.replace(/^const /, 'var ')); else missing.push(n); }
  for (const n of FUNCS) { const c = files.map((x) => extractFn(x, n)).find(Boolean); if (c) parts.push(c); else missing.push(n); }
  let FRJ = {}; try { FRJ = JSON.parse(readFileSync(join(dataDir, 'formula-registry.json'), 'utf8')); } catch (_) { FRJ = {}; }
  const ctx = { navigator: { platform: 'engine' }, location: { search: '?engine=1' }, Math, Number, isFinite, String, Object, Array, JSON, console: { warn() {}, log() {} } };
  ctx.FR = function FR(path) { let node = FRJ; for (const p of String(path).split('.')) { node = node && node[p]; if (node === undefined) throw new Error('FORMULA_REGISTRY: unknown path "' + path + '"'); }
    return node && Object.prototype.hasOwnProperty.call(node, 'value') ? node.value : node; };
  ctx.hzColdLegacyRamp = () => null;   /* a diagnostic of weight 0 in hzCold (its own try); not needed for the level */
  vm.createContext(ctx);
  let ok = !missing.length, why = missing.length ? 'the engine functions ' + missing.join(', ') + ' were not found in server/science/modules' : null;
  try { vm.runInContext(parts.join('\n'), ctx, { timeout: 2000 }); } catch (e) { ok = false; why = 'the engine functions could not be loaded: ' + String(e && e.message || e).slice(0, 160); }
  const v = { ok, why, wind: (inp, terr) => ctx.hzWind(inp, terr || {}), cold: (inp, terr) => ctx.hzCold(inp, terr || {}), source: 'server/science/modules (hzWind, hzCold: the engine’s tehsil scoring), formula register data/formula-registry.json' };
  cache = { s, v }; return v;
}
