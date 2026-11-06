/* v91.17.283.29 · P10 (updated by W5) · the Customize page's CLEAN rewrite table is deleted: the server applies the same rules
   (data/source-labels.json clientRules_v28328, customerscrub.mjs clientText) to every customer /api answer.
   usage: node scripts/tests28328p/p10.unit.test.mjs */
import { T, src, N3 } from './lib.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';
const { ok, done } = T(); const S = src(N3);
ok(!/var CLEAN=\[/.test(S) && /function clean\(s\)\{ return String\(s==null\?'':s\); \}/.test(S), 'P10 the page-side CLEAN table is gone; clean() only makes a string');
const L = JSON.parse(readFileSync(join(ROOT, 'data', 'source-labels.json'), 'utf8'));
ok(L.clientRules_v28328 && Array.isArray(L.clientRules_v28328.rules) && L.clientRules_v28328.rules.length >= 10, 'P10 the server holds the rules (clientRules_v28328)');
done();
