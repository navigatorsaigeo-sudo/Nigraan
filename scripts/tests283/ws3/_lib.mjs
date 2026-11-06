// v91.17.283 · WS3 · the small harness every ws3 test uses. TREE = the NIGRAAN tree under test: argv[2], else WS3_TREE, else the tree
// this file sits in. Running a test with the v282.1 tree as TREE shows the defect (the test fails there first); with the v283 tree it passes.
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
export const TREE = resolve(process.argv[2] || process.env.WS3_TREE || join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'));
export const mod = (rel) => import(pathToFileURL(join(TREE, rel)).href);
let pass = 0, fail = 0; const dirs = [];
export function ok(c, name, detail = '') { const d = String(detail).replace(/\n/g, ' | ').slice(0, 600); if (c) { pass++; console.log('PASS ' + name + (d ? ' · ' + d : '')); } else { fail++; console.log('FAIL ' + name + (d ? ' · ' + d : '')); } }
export function tmp(tag) { const d = mkdtempSync(join(tmpdir(), 'ws3-' + tag + '-')); dirs.push(d); return d; }
export async function step(name, f) { try { await f(); } catch (e) { ok(false, name + ' (threw)', e && (e.stack || e.message || e)); } }
export function done() { for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch (_) {} } console.log('---- ' + pass + ' passed, ' + fail + ' failed (tree ' + TREE + ')'); process.exit(fail ? 1 : 0); }
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
