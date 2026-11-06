/* v91.17.283 · WS8 · finds the page scripts the science needs: starting from a keep list, tries to drop candidate scripts in groups
   (a group that leaves the identity test exact stays dropped; one that does not is split), against a recorded page dump.
   node min.mjs <artefact> <keep-start.json> <candidates.json> <pageDump.json> <cache.json> <workdir>   (IDENT_ISSUES: one issue) */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const [ART, KEEP0, CANDS, PAGE, CACHE, WORK] = process.argv.slice(2);
const keep = JSON.parse(readFileSync(KEEP0, 'utf8')); const cands = JSON.parse(readFileSync(CANDS, 'utf8'));
const LOG = join(WORK, 'min.log'); let tests = 0;
function test(blocks) {
  tests++; const k = { ...keep, blocks }; writeFileSync(join(WORK, 'keep-try.json'), JSON.stringify(k));
  try {
    execFileSync('node', [join(HERE, 'extract.mjs'), ART, join(WORK, 'keep-try.json')], { stdio: 'ignore' });
    execFileSync('node', ['--max-old-space-size=2500', join(HERE, 'identity.mjs'), 'dump', 'science', CACHE, join(WORK, 'sci.json')], { stdio: 'ignore', timeout: 1800e3 });
    const r = JSON.parse(execFileSync('node', [join(HERE, 'identity.mjs'), 'compare', PAGE, join(WORK, 'sci.json')], { encoding: 'utf8', maxBuffer: 1e8 }));
    return r.diff === 0 && r.fullDiff === 0 && r.cells > 0;
  } catch (e) { return false; }
}
function tryDrop(group) {
  if (!group.length) return;
  const next = keep.blocks.filter(b => !group.includes(b));
  const ok = test(next);
  appendFileSync(LOG, new Date().toISOString() + ' test ' + tests + ' drop [' + group.join(',') + '] -> ' + (ok ? 'EXACT, dropped' : 'differs') + '\n');
  if (ok) { keep.blocks = next; writeFileSync(join(WORK, 'keep-best.json'), JSON.stringify(keep)); return; }
  if (group.length === 1) return;
  const h = Math.ceil(group.length / 2); tryDrop(group.slice(0, h)); tryDrop(group.slice(h));
}
const G = Number(process.env.MIN_GROUP || 32);
for (let i = 0; i < cands.length; i += G) tryDrop(cands.slice(i, i + G).filter(b => keep.blocks.includes(b)));
writeFileSync(join(WORK, 'keep-best.json'), JSON.stringify(keep));
appendFileSync(LOG, 'done after ' + tests + ' tests; kept ' + keep.blocks.length + '\n');
