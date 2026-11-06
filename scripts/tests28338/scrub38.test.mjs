/* v91.17.283.38 item 1 · the customer scrub keeps its output byte for byte: customerScrub, agencyBody (customer and licence) of the
   v283.37 module (the deployed one, its copy in scrub38/customerscrub37.mjs) and of this build give identical results on the
   operator answers saved in scrub38/ (place bundles, levels, outlook, report context, sources, ops health, applicability), each
   run twice (the second run reads the kept results); and the time of the second pass is reported.
   usage: node scripts/tests28338/scrub38.test.mjs */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const H = dirname(fileURLToPath(import.meta.url)), ROOT = join(H, '..', '..');
process.env.NIGRAAN_DATA_DIR = process.env.NIGRAAN_DATA_DIR || join(ROOT, 'data');
const OLD = await import(pathToFileURL(join(H, 'scrub38', 'customerscrub37.mjs')).href), NEW = await import(pathToFileURL(join(ROOT, 'server', 'api', 'customerscrub.mjs')).href);
let pass = 0, fail = 0; const ok = (c, n, i) => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + (i ? ' :: ' + String(i).slice(0, 300) : '')); } };
const files = readdirSync(join(H, 'scrub38')).filter((f) => f.endsWith('.json'));
let tOld = 0, tNew = 0;
for (const f of files) {
  const text = readFileSync(join(H, 'scrub38', f), 'utf8'); let j; try { j = JSON.parse(text); } catch (_) { continue; }
  for (let pass2 = 0; pass2 < 2; pass2++) {
    let t = performance.now(); const a = JSON.stringify(OLD.customerScrub(j)); tOld += performance.now() - t;
    t = performance.now(); const b = JSON.stringify(NEW.customerScrub(j)); tNew += performance.now() - t;
    ok(a === b, f + ' customerScrub identical (run ' + (pass2 + 1) + ')');
    for (const lic of [false, true]) {
      t = performance.now(); const x = OLD.agencyBody(Buffer.from(text), 'application/json', { licence: lic }); tOld += performance.now() - t;
      t = performance.now(); const y = NEW.agencyBody(Buffer.from(text), 'application/json', { licence: lic }); tNew += performance.now() - t;
      ok((x === null && y === null) || (x && y && Buffer.compare(x, y) === 0), f + ' agencyBody' + (lic ? ' (licence)' : '') + ' identical (run ' + (pass2 + 1) + ')', (x ? x.length : 'null') + ' vs ' + (y ? y.length : 'null'));
    }
    const sc = JSON.stringify(NEW.customerScrub(j));
    const x2 = OLD.agencyBody(Buffer.from(sc), 'application/json'), y2 = NEW.agencyBody(Buffer.from(sc), 'application/json');
    ok((x2 === null && y2 === null) || (x2 && y2 && Buffer.compare(x2, y2) === 0), f + ' scrub then agencyBody identical (run ' + (pass2 + 1) + ')');
  }
}
console.log('time: v283.37 ' + Math.round(tOld) + ' ms, this build ' + Math.round(tNew) + ' ms');
ok(tNew < tOld, 'the scrub is faster than v283.37 (' + Math.round(tNew) + ' < ' + Math.round(tOld) + ' ms)');
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
