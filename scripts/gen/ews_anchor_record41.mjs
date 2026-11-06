#!/usr/bin/env node
/* v91.17.283.41 (NIGRAAN 1.0.5) · item 36 · the promotion record of the EWS live anchor from the monthly retrain's gates (standing delegation:
   a candidate that passed every pre-registered gate is approved and reported afterwards). Reads the retrain run's pass_krige.json and the
   candidate; refuses unless the kept candidate passed G1-G4 and its variogram / radius / fade equal data/ews-live-anchor.json (the served
   coefficients ARE the scored ones). Writes data/agents/verify/ews-anchor-promotion-retrain.json (id ews-anchor@1, target ews-anchor-live,
   fromSha256 = the current file). Nothing is switched here; the switch is:
     node scripts/gen/exp_approve.mjs approve data\agents\verify\ews-anchor-promotion-retrain.json --confirm ews-anchor@1
   usage: node scripts/gen/ews_anchor_record41.mjs --run <retrain run folder> [--data <data folder>]   exit 0 written, 2 refused */
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const A = process.argv.slice(2), opt = (k) => (A.includes('--' + k) ? A[A.indexOf('--' + k) + 1] : null);
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), DATA = opt('data') || join(APP, 'data'), RUN = opt('run');
const sha = (b) => createHash('sha256').update(b).digest('hex'); const no = (why) => { console.error('REFUSED: ' + why + ' (nothing written)'); process.exit(2); };
if (!RUN) no('--run <retrain run folder> is required');
let P, C; try { P = JSON.parse(readFileSync(join(RUN, 'out', 'pass_krige.json'), 'utf8')); C = JSON.parse(readFileSync(join(RUN, 'out', 'candidates', 'ews-live-anchor.json'), 'utf8')); } catch (e) { no('retrain files unreadable: ' + e.message); }
const kept = P.choice && P.choice.kept, g = kept && P[kept]; if (!g) no('no kept candidate in pass_krige.json');
for (const k of ['G1_plus0h_all_lo95>0', 'G2_bands_not_worse', 'G3_plus3h_not_worse', 'G4_locked_not_worse']) if (g[k] !== true) no(kept + ' did not pass ' + k);
if (g.promote !== true) no(kept + ' promote is not true');
const fb = readFileSync(join(DATA, 'ews-live-anchor.json')); const M = JSON.parse(fb.toString('utf8'));
const eq = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-9;
if (!(eq(M.variogram.nugget, C.variogram.nugget) && eq(M.variogram.psill, C.variogram.psill) && eq(M.variogram.range_km, C.variogram.range_km) && eq(M.radius_km, C.radius_km) && eq(M.fade_hours, C.fade_hours) && eq(M.exclude_within_km, C.exclude_within_km)))
  no('the served coefficients (data/ews-live-anchor.json) differ from the scored candidate');
if (M.servingHook !== 'chain:ews-live@283.41') no('this build has no serving hook for the anchor');
if (M.live === true) no('the anchor is already live');
const rec = { id: 'ews-anchor@1', at: new Date().toISOString(), promote: true, version: C.version, rule: 'retrain ' + (C.windows && C.windows.period) + ': ' + kept + ' passed G1-G4 (held-out EWS current-T MAE ' + g.heldOut.mae_current + ' -> ' + g.heldOut.mae_candidate + ' C, lower 95 % bound of the gain ' + g.heldOut.lo95 + ')',
  pointer: { target: 'ews-anchor-live', fromSha256: sha(fb) }, evidence: { passKrigeSha256: sha(readFileSync(join(RUN, 'out', 'pass_krige.json'))), candidateSha256: sha(readFileSync(join(RUN, 'out', 'candidates', 'ews-live-anchor.json'))), heldOut: g.heldOut },
  reasons: [], source: 'scripts/gen/ews_anchor_record41.mjs' };
const out = join(DATA, 'agents', 'verify', 'ews-anchor-promotion-retrain.json'); mkdirSync(dirname(out), { recursive: true });
const t = out + '.tmp'; writeFileSync(t, JSON.stringify(rec, null, 1)); renameSync(t, out);
console.log('written: ' + out + ' (' + rec.rule + ')');
