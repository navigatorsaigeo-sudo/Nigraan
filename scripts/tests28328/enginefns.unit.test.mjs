/* v91.17.283.28 . S5 · THE SITE LEVELS USE THE MAP'S OWN SCORING CODE, offline:
     G1  enginefns.mjs runs hzWind and hzCold taken from server/science/modules (the exact source text of the module, no copy in the server)
     G2  wind: the formula register ladder (62 km/h -> 30, 89 -> 55), withheld at or above the register's mountain height, a missing
         gust and wind is not scored
     G3  cold: the engine's UTCI cold map on the customer scale (UTCI -20 C: Moderate; -45: Severe; 5: Normal)
     G4  the server holds no second copy of hzWind / hzCold
     G5  only the manifest's modules are read: a stale renumbered copy left beside them on a computer (sorted first) is never used
   usage: node scripts/tests28328/enginefns.unit.test.mjs */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), API = join(ROOT, 'server', 'api');
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i != null ? ' :: ' + JSON.stringify(i).slice(0, 500) : '')); } };
const EF = await import(pathToFileURL(join(API, 'enginefns.mjs')).href), SC = await import(pathToFileURL(join(API, 'scalecuts.mjs')).href);
const E = EF.engineFns(join(ROOT, 'data'));
const MOD = join(ROOT, 'server', 'science', 'modules'), src = readdirSync(MOD).map((f) => readFileSync(join(MOD, f), 'utf8')).join('\n');
const fw = EF.extractFn(src, 'hzWind'), fc = EF.extractFn(src, 'hzCold');
ok(E.ok && fw && fc && src.includes(fw) && src.includes(fc) && /^function hzWind\(inp, terr\)\{/.test(fw) && fw.trim().endsWith('}'), 'G1 the functions are the modules’ own source', E.why);
const w = (g, el = 200) => E.wind({ gust: g, elev: el }, {});
ok(w(62).score === 30 && w(89).score === 55 && w(40).score === 0, 'G2a the register wind ladder', [w(62).score, w(89).score]);
ok(w(95, 1500).mountainWithheld === true && w(95, 1499).score > 0 && E.wind({ elev: 100 }, {}).score === null, 'G2b withheld at the register height; no wind input is not scored');
const lv = (u) => SC.levelOfScreeningScore(E.cold({ coldUtciShade: u, coldUtciBasis: 't' }, {}).score);
ok(lv(-20) === 2 && lv(-45) === 4 && lv(5) === 0, 'G3 the cold map on the customer scale', [lv(-20), lv(-45), lv(5)]);
const serverSrc = readdirSync(API).filter((f) => f.endsWith('.mjs')).map((f) => readFileSync(join(API, f), 'utf8')).join('\n');
ok(!/function hzWind\s*\(|function hzCold\s*\(/.test(serverSrc), 'G4 no second copy of the scoring in server/api');
{ const { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } = await import('node:fs'); const { tmpdir } = await import('node:os');
  const T = mkdtempSync(join(tmpdir(), 'ef5-')); try {
    mkdirSync(join(T, 'server', 'api'), { recursive: true }); mkdirSync(join(T, 'server', 'science', 'modules'), { recursive: true });
    copyFileSync(join(API, 'enginefns.mjs'), join(T, 'server', 'api', 'enginefns.mjs'));
    copyFileSync(join(ROOT, 'server', 'science', 'manifest.json'), join(T, 'server', 'science', 'manifest.json'));
    for (const f of readdirSync(MOD)) copyFileSync(join(MOD, f), join(T, 'server', 'science', 'modules', f));
    writeFileSync(join(T, 'server', 'science', 'modules', '000-aaa-stale.js'), 'function hzCold(inp, terr){ return { score: 99 }; }\nfunction hzWind(inp, terr){ return { score: 99 }; }\n');
    const EF2 = await import(pathToFileURL(join(T, 'server', 'api', 'enginefns.mjs')).href + '?t=' + Date.now()), E2 = EF2.engineFns(join(ROOT, 'data'));
    ok(E2.ok && E2.wind({ gust: 62, elev: 200 }, {}).score === 30 && E2.cold({ coldUtciShade: 5, coldUtciBasis: 't' }, {}).score !== 99, 'G5 a stale module outside the manifest is not used', E2.why);
  } finally { rmSync(T, { recursive: true, force: true }); } }
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
