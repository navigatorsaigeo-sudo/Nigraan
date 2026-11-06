#!/usr/bin/env node
/* v91.17.283.10 · agent 6 · THE OWNER'S APPROVE / REVERT COMMAND for an experiment's promotion record (the only way, with the operator page's
   button, that an experiment changes anything). It flips one data pointer, keeps the previous one, and logs (scripts/agents/exp_pointer.mjs).
     node scripts/gen/exp_approve.mjs approve <promotion record> --confirm <experiment id> [--data <data folder>] [--by <name>]
     node scripts/gen/exp_approve.mjs revert <target> --confirm <target> [--data <data folder>]      (blend-weights | fx-model-served | ews-anchor-live | ifs-mos-retrain)
     node scripts/gen/exp_approve.mjs status [--data <data folder>]
   ifs-mos-retrain (28 Oct 2026): the automatic monthly retrain's proposals (station-lake/retrain/auto); the owner's short form is
   _admin/retrain/auto/RETRAIN.bat approve | rollback (retrain.sh on the DGX), which calls this command.
   Exit 0 done, 2 refused (nothing changed; the refusal is logged). Blend weights are checked with the server's own parser (blend.mjs). */
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { approve, revert, targetState, TARGETS } from '../agents/exp_pointer.mjs';
import { adminDir } from '../agents/lib.mjs';
const HERE = dirname(fileURLToPath(import.meta.url)), APP = join(HERE, '..', '..'), A = process.argv.slice(2);
const opt = (k) => (A.includes('--' + k) ? A[A.indexOf('--' + k) + 1] : null);
const DATA = opt('data') || join(APP, 'data'); const ADM = process.env.NIGRAAN_AGENTS_ADMIN_DIR === '-' ? null : adminDir(APP);
const by = opt('by') || ('owner on ' + (process.env.COMPUTERNAME || process.env.HOSTNAME || 'this computer')); const confirm = opt('confirm');
const { parseWeights } = await import(pathToFileURL(join(APP, 'server', 'api', 'blend.mjs')).href);
const validate = { 'blend-weights': (j) => parseWeights(j) };
let r;
if (A[0] === 'approve') { const f = A[1] && (isAbsolute(A[1]) ? A[1] : resolve(process.cwd(), A[1])); r = approve(f, { dataDir: DATA, adminDir: ADM, by, via: 'command', confirm, validate }); }
else if (A[0] === 'revert') r = revert(A[1], { dataDir: DATA, adminDir: ADM, by, via: 'command', confirm });
else if (A[0] === 'status') { for (const t of TARGETS) console.log(t + ': ' + JSON.stringify(targetState(DATA, t))); process.exit(0); }
else { console.error('usage: exp_approve.mjs approve <promotion record> --confirm <id> | revert <target> --confirm <target> | status'); process.exit(2); }
if (!r.ok) { console.error('REFUSED: ' + r.why + ' (nothing changed; logged)'); process.exit(2); }
console.log((A[0] === 'approve' ? 'approved: ' : 'reverted: ') + r.target + ' ' + (r.from.version || r.from.file || '-') + ' -> ' + (r.to.version || r.to.file) + ' (logged in data/agents/experiments/approvals.jsonl)');
