/* v91.17.237 · THE REBUILT CONSOLE (/next) — updated v91.17.276 (CLEAN) to the current design.
   The rebuilt console (NIGRAAN_4.html at /next: engine-level map fills, 2.5 MB page limit, timer and watcher limits, nine sections on
   one map) was removed in v91.17.256 (owner 10/12 Oct: one main page, the classic console). Its checks drove a page that no longer
   exists (base v274: "page size 7339 KB" measured the classic page after the /next redirect, then a 120 s timeout waiting for
   window.NIGRAAN). What remains true and is checked here: /next and /NIGRAAN_4.html send the browser to /, the rebuilt page file is not
   shipped, and the one main page carries no reference to it.
   The map-fill-equals-engine check has no counterpart on the classic page yet (listed in LAUNCH_DEFECTS.md as a test gap).
   usage: node scripts/tests237/next_page.test.mjs http://127.0.0.1:8799 */
import { existsSync } from 'node:fs'; import { join, dirname } from 'node:path'; import { fileURLToPath } from 'node:url';
const BASE = process.argv[2] || 'http://127.0.0.1:8799';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i ? ' :: ' + String(i).slice(0, 400) : '')); } };
for (const p of ['/next', '/next/', '/NIGRAAN_4.html']) { const r = await fetch(BASE + p, { redirect: 'manual' }); ok(r.status === 302 && r.headers.get('location') === '/', p + ' goes to the one main page', r.status + ' ' + r.headers.get('location')); }
ok(!existsSync(join(ROOT, 'artefact', 'NIGRAAN_4.html')), 'the rebuilt page file is not shipped (artefact/NIGRAAN_4.html absent)');
const html = await (await fetch(BASE + '/analyst')).text();
ok(!/href="\/next"|NIGRAAN_4\.html|New layout/.test(html), 'the main page links to no rebuilt page');
console.log(`\n${fail ? 'FAIL' : 'PASS'} next_page: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
