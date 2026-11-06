/* v91.17.283.29 · W5 · server fixes: (1) the AJG site CSV reads an empty cell as no value (it was 0); (2) the fleet bias card counts only
   stations whose check passed (the customer station rule), and a zero wind with no humidity is withheld (the outdoor unit not sending).
   usage: node scripts/tests28329/w5.unit.test.mjs */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + String(i).slice(0, 600) : '')); } };
const srv = readFileSync(join(ROOT, 'server', 'server.mjs'), 'utf8');
const a = srv.indexOf('function parseSitesCsv(t) {'), b = srv.indexOf('\nfunction ajgSites', a);
const parseSitesCsv = new Function(srv.slice(a, b) + '\nreturn parseSitesCsv;')();
const S = parseSitesCsv('name,lat,lon,type,value,dc,floor\nA,31.5,74.3,warehouse,,,\nB,31.6,74.4,warehouse,5,1,0\nC,,74.4,warehouse,1,1,1\n');
ok(S.length === 2, 'W5a a row with an empty lat is skipped (not read as 0)', JSON.stringify(S));
ok(S[0].value === null && S[0].dc === null && S[0].floor === null, 'W5a empty value / dc / floor cells are null, never 0', JSON.stringify(S[0]));
ok(S[1].value === 5 && S[1].dc === 1 && S[1].floor === 0, 'W5a a written 0 stays 0', JSON.stringify(S[1]));
const fl = readFileSync(join(ROOT, 'server', 'api', 'fleet.mjs'), 'utf8');
const sn = fl.slice(fl.indexOf('function scoreNow() {'), fl.indexOf('if (state.configured && process.env.NIGRAAN_FLEET'));
ok(/if \(!checkedRow\(r\)\) continue;/.test(sn) && /const checkedRow = \(r\) => \{[^\n]*customerRow\(/.test(fl), 'W5b the bias card (scoreNow) reads only checked stations (the customer rule)', sn.slice(0, 300));
/* the outdoor-unit rule, run on rows the way qcRows runs it */
const m = fl.match(/for \(const r of rows\) \{ if \(r\.rhPct == null && r\.windKmh === 0[\s\S]*?failed\['W:no-outdoor-unit'\] \|\| 0\) \+ 1; \} \}/);
ok(!!m, 'W5c the zero-wind-with-no-humidity rule is in the fleet QC', '');
if (m) { const run = new Function('rows', 'failed', m[0]); const rows = [{ rhPct: null, windKmh: 0, gustKmh: 0 }, { rhPct: 40, windKmh: 0, gustKmh: 0 }, { rhPct: null, windKmh: 7, gustKmh: 12 }], failed = {}; run(rows, failed);
  ok(rows[0].windKmh === null && rows[0].gustKmh === null && rows[0].windWhy && failed['W:no-outdoor-unit'] === 1, 'W5c wind 0 with no humidity is withheld with its reason', JSON.stringify(rows[0]));
  ok(rows[1].windKmh === 0 && rows[2].windKmh === 7, 'W5c a calm with humidity, and a wind with no humidity, are kept', JSON.stringify(rows.slice(1))); }
const rp = readFileSync(join(ROOT, 'server', 'api', 'reports.mjs'), 'utf8');
ok(/rec\.inputs && Array\.isArray\(rec\.inputs\.sites\)/.test(rp), 'W4 a network report record names its places through inputs.sites (issued, not refused as no_place)');
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
