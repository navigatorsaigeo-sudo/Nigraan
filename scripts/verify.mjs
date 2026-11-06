#!/usr/bin/env node
/* Check the artefacts on disk against the manifest. Run it before you serve
   anything you did not download yourself. */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ART = join(resolve(fileURLToPath(new URL('..', import.meta.url))), 'artefact');
const man = JSON.parse(readFileSync(join(ART, 'MANIFEST.json'), 'utf8'));
let bad = 0;
for (const [name, e] of Object.entries(man)) {
  const f = join(ART, name);
  if (!existsSync(f)) { console.log('MISSING  %s', name); bad++; continue; }
  const got = createHash('sha256').update(readFileSync(f)).digest('hex');
  const ok = got === e.sha256;
  if (!ok) bad++;
  console.log('%s  %s\n          expected %s\n          actual   %s', ok ? 'OK     ' : 'MISMATCH', name, e.sha256, got);
}
console.log(bad ? `\n${bad} file(s) do not match the manifest.` : '\nAll artefacts match the manifest.');
process.exit(bad ? 1 : 0);
