/* v91.17.283.40 item 30: river31 status words. (1) every office spelling of the six classes reaches its level; (2) on the held sheet archive
   (data/evidence/ffdlimits40/river_sheet_archive_2026-10-30.csv) the new parser gives the same status and level on every row as v283.38
   (no served value changes). usage: node status40.test.mjs <tree> [<base tree v28338>] */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const tree = (process.argv[2] && !/^https?:/.test(process.argv[2]) ? process.argv[2] : new URL('../..', import.meta.url).pathname.replace(/\/$/, '')), base = process.argv[3] || '/tmp/claude-0/v28338';
const N = await import(pathToFileURL(join(tree, 'server/api/river31.mjs')).href);
const O = await import(pathToFileURL(join(base, 'server/api/river31.mjs')).href);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const cases = { NORMAL: 0, Nill: 0, 'NILL ': 0, Low: 1, 'LOW FLOOD': 1, Medium: 2, HIGH: 3, 'Very High': 4, VERY_HIGH: 4, 'very-high': 4, VH: 4,
  'Exceptionally High': 4, 'EXCEPTIONALLY HIGH FLOOD': 4, EX_HIGH: 4, EH: 4, Exceptional: 4 };
for (const [w, lv] of Object.entries(cases)) { const s = N.normStatus(w); ok(N.STATUS_LEVEL[s] === lv, w + ' -> ' + s + ' level ' + N.STATUS_LEVEL[s] + ' expected ' + lv); }
ok(N.normStatus('') === null && N.normStatus(null) === null, 'blank -> null');
const txt = readFileSync(join(tree, 'data/evidence/ffdlimits40/river_sheet_archive_2026-10-30.csv'), 'utf8');
const a = N.parseSheet(txt), b = O.parseSheet(txt); ok(a.length === b.length && a.length > 5000, 'rows ' + a.length + ' vs ' + b.length);
let diff = 0; for (let i = 0; i < a.length; i++) if (a[i].status !== b[i].status || (N.STATUS_LEVEL[a[i].status] ?? null) !== (O.STATUS_LEVEL[b[i].status] ?? null)) diff++;
ok(diff === 0, 'archive rows whose status or level changed: ' + diff);
console.log(`status40: ${pass} pass, ${fail} fail (archive rows ${a.length}, changed ${diff})`); process.exit(fail ? 1 : 0);
