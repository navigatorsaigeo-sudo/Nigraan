// v91.17.283.3 · SCI tests · shared helpers. SCI_APP=<tree> runs a suite against another tree (e.g. the base) without copying it.
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
export const APP = process.env.SCI_APP || join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const mod = (p) => import(pathToFileURL(join(APP, p)).href);
let pass = 0, fail = 0;
export const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + d : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + d : '')); } };
export const done = () => { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };
