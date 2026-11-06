/* v91.17.236 · the table scan's date search, read in pieces, finds the date the whole-file search found: every JSON file in data/
   larger than 1 MB, plus made-up files with the date field across a piece boundary, at the end, absent. usage: node scripts/tests236/headdate.test.mjs */
import { readdirSync, statSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path'; import { tmpdir } from 'node:os'; import { fileURLToPath } from 'node:url';
import { createTables } from '../../server/api/tables.mjs';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), DATA = join(APP, 'data');
const HEAD_RE = new RegExp('"(' + ['built', 'builtAt', 'built_utc', 'updated', 'updatedAt', 'generated', 'generatedAt', 'at', 'asOf', 'date', 'fetchedAt', 'checkedAt', 'finishedAt', 'issued', 'created'].join('|') + ')"\\s*:\\s*"(\\d{4}-\\d{2}-\\d{2}[^"]*)"');
const whole = (f) => { try { const m = readFileSync(f, 'utf8').match(HEAD_RE); return m ? m[2] : null; } catch (_) { return null; } };
const T = createTables({}, DATA); const hd = T.__headDate;
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) pass++; else { fail++; console.log('FAIL ' + n + (i ? ' :: ' + i : '')); } };
for (const f of readdirSync(DATA).filter((f) => f.endsWith('.json'))) { const p = join(DATA, f); if (statSync(p).size <= 1e6) continue; const a = whole(p), b = hd(p); ok(a === b, f, a + ' vs ' + b); }
const D = mkdtempSync(join(tmpdir(), 'agn-hd-')); const pad = (k) => 'x'.repeat(k);
const cases = { boundary: '{"a":"' + pad((1 << 20) - 12) + '","date":"2026-10-10T07:00:00Z"}', end: '{"a":"' + pad(3 << 20) + '","built":"2025-01-02"}', none: '{"a":"' + pad(2 << 20) + '"}',
  unicode: '{"a":"' + pad((1 << 20) - 5) + 'é","at":"2026-01-01 é ü"}', escaped: '{"n":"\\"at\\": \\"2020-01-01\\"","b":"' + pad(1 << 20) + '","updated":"2024-05-05"}' };
for (const [k, v] of Object.entries(cases)) { const p = join(D, k + '.json'); writeFileSync(p, v); ok(whole(p) === hd(p), 'made-up ' + k, whole(p) + ' vs ' + hd(p)); }
rmSync(D, { recursive: true, force: true });
console.log(`${fail ? 'FAIL' : 'PASS'} headdate: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
