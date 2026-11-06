/* v91.17.283.10 · budget · the per-caller record (data/quota-callers, QBR) names every billed proxy call: each provider fetch in
   server/server.mjs that is counted with noteProxyCall is also written to the per-caller record (qbrAdd, or the QBR entry of the proxy's
   own path, the superset fetcher and the blend members). Static check of the source (no server).
     Q1  qbrAdd exists and writes into QBR.by under '<tag> · <api> <path>'
     Q2  the sweep refresh, its changed-member splice, the zone members and the national-pool members each call qbrAdd beside noteProxyCall
     Q3  every line with noteProxyCall is either beside a qbrAdd, or in a block that writes QBR.by itself (proxy path, superset, blend)
   usage: node scripts/tests28310/budget/qbr.static.test.mjs */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const S = readFileSync(join(ROOT, 'server', 'server.mjs'), 'utf8'); const L = S.split('\n');
let pass = 0, fail = 0; const ok = (c, n, d) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (d != null ? ' :: ' + String(d).slice(0, 300) : '')); } };
ok(/function qbrAdd\(tag, host, path, w, locs, ok\)[\s\S]{0,400}QBR\.by\[t\]/.test(S), 'Q1 qbrAdd writes into the per-caller record');
for (const t of ['sweep refresh', 'sweep refresh (changed members)', 'zone members', 'national pool members']) ok(S.includes("qbrAdd('" + t + "'"), "Q2 '" + t + "' is written to the per-caller record");
const bad = [];
L.forEach((ln, i) => { if (!/noteProxyCall\(/.test(ln) || /^\s*\/\*/.test(ln) || /function /.test(ln)) return;
  const win = L.slice(Math.max(0, i - 3), i + 4).join('\n');
  if (/qbrAdd\(|QBR\.by\[|_noteAttempt|P\.noteProxyCall\(w1/.test(win)) return; bad.push((i + 1) + ': ' + ln.trim().slice(0, 120)); });
ok(!bad.length, 'Q3 every noteProxyCall site is also written to the per-caller record', bad.join(' | '));
console.log((fail ? 'FAIL' : 'PASS') + ' qbr.static ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
