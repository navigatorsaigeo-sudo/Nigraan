// v91.17.280 SYN280-B: the console's earthquake alert row reads "<Level> shaking expected · intensity <class>, <time>" from the served
// words (no nested parentheses, no repetition, no damage phrase). The alert list, the rail and the site report all show this row.
// Runs standalone: node scripts/tests280/quakerow280.test.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m); } };
const page = readFileSync(join(ROOT, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html'), 'utf8');
const q = readFileSync(join(ROOT, 'server', 'api', 'quake.mjs'), 'utf8');
// the served words: quake.mjs shakingWords on the laptop rule file's levels (as /api/quake/live levels[].plain)
const sw = new Function('return ' + q.match(/function shakingWords\(l, top\) \{[\s\S]*?\n  return [^\n]*\}/)[0])();
const RL = JSON.parse(readFileSync(join(ROOT, 'scripts', 'tests280', 'fixtures', 'seismic-felt-rule.json'), 'utf8')).levels;
const levels = RL.map((l, i, A) => ({ level: l.level, levelIndex: i + 1, plain: sw(l, i === A.length - 1) }));
const m = page.match(/function alertRows\(\)\{ return flagged\(\)\.map\(function\(f\)\{[\s\S]*?basis:([^\n]*?) \}; \}\); \}/);
ok(!!m, 'B1 the console alert row builder found (agn quake module alertRows)');
const basisOf = new Function('f', 'plain', 'return ' + m[1] + ';');
const plain = (i) => (levels.find((l) => l.levelIndex === i) || {}).plain || '';
const rows = levels.slice(1).map((l) => basisOf({ level: l.level, levelIndex: l.levelIndex, timePkt: '16 Oct 2026 14:05 PKT' }, plain));
rows.forEach((r) => console.log('  ' + r));
ok(rows[rows.length - 1] === 'Severe shaking expected · intensity VII+, 16 Oct 2026 14:05 PKT', 'B2 Severe row reads "Severe shaking expected · intensity VII+, <time>"');
ok(rows[1] === 'High shaking expected · intensity VI, 16 Oct 2026 14:05 PKT', 'B3 High row reads "High shaking expected · intensity VI, <time>"');
ok(rows.every((r) => !/\(/.test(r) && !/damage/i.test(r) && (r.match(/shaking/g) || []).length === 1), 'B4 no parentheses, no damage phrase, "shaking" once');
ok(!/basis:'expected '\+f\.level\.toLowerCase\(\)\+' shaking \('/.test(page), 'B5 the v279/FIX280 wording "expected severe shaking (very strong shaking or stronger ...)" is gone');
console.log(`\n${pass} PASS, ${fail} FAIL`); process.exit(fail ? 1 : 0);
