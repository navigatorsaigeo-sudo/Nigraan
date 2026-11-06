#!/usr/bin/env node
/* v91.17.283.6 · item 9 · PROMOTE (OR REVERT) REFITTED PLAINS BLEND WEIGHTS BY FLIPPING THE POINTER, NO CODE CHANGE.
   The 1 Nov BLEND-R step (py/blend_r.py) writes a candidate weights file (served format: sets, window2_weights, regime) and a promotion
   record (<out>.promotion.json: promote true/false, the rule result, the candidate's sha256, the pointer to install). This script:
     node scripts/gen/blend_promote.mjs <promotion record> [--data <data folder>]   install: copy the candidate into the data folder under
          its own name and rewrite data/blend-weights-active.json (atomic: tmp + rename), the old pointer kept as "previous";
          refused (exit 2, nothing changed) unless the record says promote, the candidate matches its sha256 and parses as served weights;
     node scripts/gen/blend_promote.mjs --revert [--data <data folder>]   the pointer goes back to its "previous" entry.
   The running server reads the pointer within a minute (server/api/blend.mjs load); no restart, no new code. */
import { readFileSync, writeFileSync, renameSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const HERE = dirname(fileURLToPath(import.meta.url)), A = process.argv.slice(2);
const DATA = A.includes('--data') ? A[A.indexOf('--data') + 1] : join(HERE, '..', '..', 'data');
const PF = join(DATA, 'blend-weights-active.json');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const write = (o) => { writeFileSync(PF + '.tmp', JSON.stringify(o, null, 1)); renameSync(PF + '.tmp', PF); };
const refuse = (m) => { console.error('REFUSED: ' + m + ' (nothing changed)'); process.exit(2); };
const cur = existsSync(PF) ? JSON.parse(readFileSync(PF, 'utf8')) : null;
if (A[0] === '--revert') {
  if (!cur || !cur.previous) refuse('the pointer has no previous entry');
  const p = cur.previous; if (!existsSync(join(DATA, p.file)) || sha(readFileSync(join(DATA, p.file))) !== p.sha256) refuse('the previous weights file ' + p.file + ' is missing or changed');
  write({ ...p, about: cur.about, revertedAt: new Date().toISOString(), previous: { ...cur, previous: undefined } }); console.log('pointer reverted to ' + p.version + ' (' + p.file + ')'); process.exit(0);
}
const recF = A[0]; if (!recF || !existsSync(recF)) refuse('usage: blend_promote.mjs <promotion record> | --revert');
const R = JSON.parse(readFileSync(recF, 'utf8'));
if (R.promote !== true) refuse('the promotion record says promote = ' + R.promote + (R.why ? ' (' + R.why + ')' : ''));
const cf = join(dirname(recF), basename(String(R.candidateFile || ''))); if (!R.candidateFile || !existsSync(cf)) refuse('candidate weights file not found next to the record');
const buf = readFileSync(cf); if (sha(buf) !== R.candidateSha256) refuse('candidate checksum ' + sha(buf).slice(0, 12) + ' does not match the record ' + String(R.candidateSha256).slice(0, 12));
const { parseWeights } = await import(pathToFileURL(join(HERE, '..', '..', 'server', 'api', 'blend.mjs')).href);
try { parseWeights(JSON.parse(buf.toString('utf8'))); } catch (e) { refuse('candidate does not parse as served weights: ' + e.message); }
const name = basename(cf); if (!/^[\w.-]+\.json$/.test(name)) refuse('candidate file name must be a plain .json name');
if (existsSync(join(DATA, name)) && sha(readFileSync(join(DATA, name))) !== R.candidateSha256) refuse(name + ' already exists in the data folder with other content');
copyFileSync(cf, join(DATA, name));
write({ about: cur && cur.about, version: R.version, file: name, sha256: R.candidateSha256, sourceRun: R.sourceRun, promotedAt: new Date().toISOString(), rule: R.rule || null, previous: cur ? { ...cur, previous: undefined, about: undefined } : null });
console.log('pointer -> ' + R.version + ' (' + name + ', ' + R.candidateSha256.slice(0, 12) + '); previous ' + (cur ? cur.version : 'none') + '. The server picks it up within a minute.');
