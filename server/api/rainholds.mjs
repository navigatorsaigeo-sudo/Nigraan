/* == v91.17.283.31 · owner 9.5 · THE MACH RAIN-CHANNEL HOLDS (data/mach-rain-holds.json): the rain values of the listed stations are not
   used anywhere; the station's other variables are. One reader for the server (obsqc marks, fleet readings) and the verification agent. */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const OWN_DATA = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
let C = null;
export function machRainHolds(dataDir = OWN_DATA) {
  let f = join(dataDir, 'mach-rain-holds.json'); if (!existsSync(f)) f = join(OWN_DATA, 'mach-rain-holds.json');
  try { const m = statSync(f).mtimeMs; if (C && C.f === f && C.m === m) return C.v;
    const J = JSON.parse(readFileSync(f, 'utf8')); const held = new Map();
    for (const h of J.holds || []) if (h && h.key && !h.cleared) held.set(String(h.key), h.why || 'rain gauge held (owner)');
    const v = { held, vars: Array.isArray(J.vars) && J.vars.length ? J.vars : ['PR', 'PT', 'RR'], version: J.version || null }; C = { f, m, v }; return v; }
  catch (_) { return { held: new Map(), vars: ['PR', 'PT', 'RR'], version: null }; }
}
export const rainHeldWhy = (key, dataDir) => { const H = machRainHolds(dataDir); return H.held.get(String(key).replace(/^mach:/, '')) || null; };
