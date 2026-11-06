/* v91.17.185 · the cached-sweep correction accepts a value or a promise (air-quality sweeps failed with "then is not a function" from
   v91.17.182 to v91.17.184); the sponge note no longer covers the layer picker.  usage: node scripts/tests185/v185.test.mjs */
import { readFileSync } from 'node:fs'; import { join, dirname } from 'node:path'; import { fileURLToPath } from 'node:url';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..'); let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('  FAIL', m); } };
const S = readFileSync(join(APP, 'server', 'server.mjs'), 'utf8');
ok(/Promise\.resolve\(correctIfForecast\(body0\)\)\.then/.test(S) && !/[^(]correctIfForecast\(body0\)\.then/.test(S), 'the correction is wrapped so a plain value (air quality) works');
const B = readFileSync(join(APP, 'artefact', 'AI_GEO_NIGRAAN_v91_17_MACH.html'), 'utf8');
ok(/#agnSpongeNote\{position:absolute;z-index:650;left:12px;bottom:96px/.test(B), 'sponge note sits bottom-left, clear of the layer picker');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
