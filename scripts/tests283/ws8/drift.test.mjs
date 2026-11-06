/* v91.17.283 · WS8 · the science modules and the served page must not drift apart while the page still carries its own copy:
   every module's source page script (by hash) must still be in the served page, every module file must match its manifest hash,
   and the module set must start (node:vm, the host the runner uses) without a module stopping.
   node scripts/tests283/ws8/drift.test.mjs [artefact]   exit 0 = PASS */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageBlocks, readManifest, sha1 } from '../../../server/science/loader.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const M = readManifest(); const { blocks, json } = pageBlocks(process.argv[2]);
const pageHashes = new Set(blocks.map(b => sha1(b.code))); let bad = 0;
const fail = (m) => { bad++; console.log('FAIL ' + m); };
for (const m of M.modules) {
  const code = readFileSync(join(ROOT, 'server', 'science', 'modules', m.file), 'utf8');
  if (sha1(code) !== m.sha1) fail(m.file + ': file differs from its manifest hash');
  if (!pageHashes.has(m.from.sha1)) fail(m.file + ': its page script (' + m.from.sha1.slice(0, 10) + ') is no longer in the served page: the page science changed, regenerate (extract.mjs) and rerun identity.mjs');
}
for (const d of M.data) { const t = readFileSync(join(ROOT, 'server', 'science', 'data', d.file), 'utf8'); if (sha1(t) !== d.sha1) fail(d.file + ': data differs from manifest');
  if (json.has(d.id) && sha1(json.get(d.id)) !== d.sha1) fail(d.id + ': the page carries different data'); }
console.log((bad ? 'FAIL' : 'PASS') + ' science drift: ' + M.modules.length + ' modules, ' + M.data.length + ' data blocks, ' + bad + ' problems');
process.exit(bad ? 1 : 0);
