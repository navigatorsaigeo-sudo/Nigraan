// audit 8 · the evidence cache is keyed on the underlying evidence files too: a changed CSV under an unchanged skill-evidence.json is
// re-hashed on the next read and the sentences are withheld (stale) with the reason; putting it back makes them ready again.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, appendFileSync, utimesSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { imp, ok, done } from './lib.mjs';
const { skillEvidence } = await imp('server/api/evidence.mjs');
const D = mkdtempSync(join(tmpdir(), 'ev-')); mkdirSync(join(D, 'evidence', 't'), { recursive: true });
const csv = join(D, 'evidence', 't', 'a.csv'); writeFileSync(csv, 'x,y\n1,2\n'); const h = createHash('sha256').update(readFileSync(csv)).digest('hex');
writeFileSync(join(D, 'skill-evidence.json'), JSON.stringify({ schema: 'agn.skill-evidence.v1', evidence: { 'data/evidence/t/a.csv': h }, lines: { heat: ['x'] }, temperature: { daily: {} }, heat: {} }));
const a = skillEvidence(D);
appendFileSync(csv, '3,4\n'); const t = new Date(Date.now() + 5000); utimesSync(csv, t, t);
const b = skillEvidence(D);
writeFileSync(csv, 'x,y\n1,2\n'); const t2 = new Date(Date.now() + 9000); utimesSync(csv, t2, t2);
const c = skillEvidence(D);
ok(a.ready === true, 'first read: ready (hash matches)');
ok(b.ready === false && /changed/.test(b.why || ''), 'the evidence CSV changed, the wrapper file did not: the next read re-hashes and withholds (stale)', JSON.stringify(b).slice(0, 200));
ok(c.ready === true, 'the CSV restored: ready again');
rmSync(D, { recursive: true, force: true });
done('A08-EVIDENCE-CACHE');
