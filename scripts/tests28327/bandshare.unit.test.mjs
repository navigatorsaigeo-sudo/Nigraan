/* v91.17.283.27 . ITEM 6 · THE 2- TO 5-YEAR RUNG'S SHARE AT LOW IS A STRUCTURED FIELD, offline:
     B1  data/river-level-scale.json bandShareAtLow.rungs holds the bulletin shares per rung (the same figures as its "why" text), with
         unit and source
     B2  flood.mjs riverBandShare reads the field (no regular expression on the free text): 40 for 2yr-5yr; a scale without the field gives
         null (the note then carries no share, never a guessed one); a changed field changes the note
     B3  the served words are unchanged: the 2- to 5-year flow still says "about 4 in 10 such days reached the official Low flood limit
         (40 % in the 2024-25 bulletins)"
   usage: node scripts/tests28327/bandshare.unit.test.mjs */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + JSON.stringify(i).slice(0, 500) : '')); } };
const S = JSON.parse(readFileSync(join(ROOT, 'data', 'river-level-scale.json'), 'utf8'));
const B = S.bandShareAtLow;
ok(B && B.rungs && B.rungs['2yr-5yr'] === 40 && B.unit && B.source, 'B1a the structured field holds the shares with unit and source', B);
ok(Object.entries(B.rungs).every(([k, v]) => S.why.includes((k === 'below-p90' ? 'below p90' : k === '5yr+' ? '5-year or more' : k) + ' ' + v + ' %')), 'B1b the figures are the ones of the evidence text', B.rungs);
const FL = await import(pathToFileURL(join(API, 'flood.mjs')).href);
ok(FL.riverBandShare(S, '2yr-5yr') === 40 && FL.riverBandShare({ why: S.why }, '2yr-5yr') === null && FL.riverBandShare({ ...S, bandShareAtLow: { rungs: { '2yr-5yr': 35 } } }, '2yr-5yr') === 35, 'B2a the share is read from the field only (the free text alone gives null; a changed field is read)');
const src = readFileSync(join(API, 'flood.mjs'), 'utf8');
ok(!/new RegExp\(rung/.test(src), 'B2b no regular expression on the free text');
/* B3: a reach at a flow between its 2- and 5-year levels */
const R = { levels: { rp2: 1000, rp5: 2000, rp10: 2500, rp20: 3000 }, seasonal: Array.from({ length: 24 }, () => [100, 200, 300, 400]) };
const v = FL.riverLevel(R, 1500, '2026-08-10');
ok(v && v.watch === true && /about 4 in 10 such days reached the official Low flood limit \(40 % in the 2024-25 bulletins\)/.test(v.levelNote), 'B3 the served note is unchanged', v);
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
