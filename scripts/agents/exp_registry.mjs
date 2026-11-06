/* == v91.17.283.10 . AGENT 6 (EXPERIMENTATION): THE FIXED REGISTRY OF CANDIDATE EXPERIMENTS ===================================
   Every candidate the experimentation agent may run is named here, with
     - its pre-registered rule: the verbatim text of the rule written BEFORE any result (scripts/agents/exp/rules_source.json:
       RULES_20261101.json of 22 Oct 02:30 PKT and its dated additions; sci2 RULES.md of 22 Oct 15:48 PKT), plus the machine form of the
       decision the agent applies (decide(), below). At the first sight of a candidate the agent writes this as
       data/agents/experiments/rules/<id>.json (exclusive create) BEFORE the candidate's first run; it is never edited after a run;
     - the script that runs it (scripts/agents/exp/*.py; the retrain candidates are byte copies of the 1 Nov retrain scripts) and the
       inputs it needs on this computer;
     - the recorded output of an earlier real run of the same script (for a candidate whose inputs this computer does not hold): the
       agent then applies the rule to that recorded output and says so, never as a fresh run;
     - the data pointer a promotion would change (null: no serving switch exists in this build, a pass needs a code hook);
     - whether the full served chain applies (the audit's lesson, item 14): a candidate scored on one step only cannot be promoted while
       the served chain after that step is untested.
   v91.17.283.14 (owner decision 24 Oct 2026): station exclusions are no longer candidates - values are judged one by one by
   server/api/obsqc.mjs (the 'excl-*' candidates of 18-19 Oct were never promoted; their records stay as history). decide() functions read the script's output and re-derive the decision independently of the script's own flag; a
   disagreement is reported and blocks promotion.
   v91.17.283.24 · self-audit J9 · each candidate names the diagnoses it is the pre-registered test of (answers(item), on the diagnostic
   agent's item: kind, where, responsible). The diagnostic agent writes that id into the item's suggestedTest.candidate (candidateFor below),
   and the experimentation agent runs a candidate some diagnosis asks for before the re-runs (experiments.mjs order). Before, the diagnosis
   carried its next test as text only, so no diagnosis ever reached an experiment.
   v91.17.283.24 · J26 · temp-zone-abcs@1 -> @2: cand_temp.py took the season from the UTC month (00-05 PKT on the first day of a season
   month fell in the season before); the fixed script is a new id (a changed script is never run under an old rule).
   No network code; pure functions (the agent and the tests import this module). */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
export const EXP_DIR = join(HERE, 'exp');
const SRC = (() => { try { return JSON.parse(readFileSync(join(EXP_DIR, 'rules_source.json'), 'utf8')); } catch (_) { return { RULES_20261101: { rules: {} }, SCI2: {} }; } })();
export const sha256 = (b) => createHash('sha256').update(b).digest('hex');
export const fileSha = (f) => { try { return sha256(readFileSync(f)); } catch (_) { return null; } };
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const margin = (mae) => Math.max(0.05, 0.03 * mae);
const R = SRC.RULES_20261101.rules || {};
const exists = (p) => { try { return existsSync(p); } catch (_) { return false; } };
const dirCount = (p) => { try { return readdirSync(p).length; } catch (_) { return 0; } };

/* -- the decisions (machine form of each pre-registered rule) -------------------------------------------------------------------
   each returns { rulePassed, variant, strata: [{name, gain, lo, floor, ok}], headline: [{label, value, ci, unit, n}], reasons: [..],
                  scriptSays, agree } ; strata are the rule's own strata (zones, the locked set, years) used for "no zone gets worse" */
function decideTemp(o) {
  const out = { rulePassed: false, variant: null, strata: [], headline: [], reasons: [], variants: {} };
  const tgt = { p_A: ['plains night 20-05 PKT', 'hills all hours'], p_B: ['plains night 20-05 PKT', 'hills all hours'], p_S: ['coast all hours'] };
  for (const v of ['p_A', 'p_B', 'p_S']) {
    const S = Object.fromEntries((o[v] || []).filter((x) => x && x.ci95).map((x) => [x.stratum, x]));
    const T = tgt[v].map((t) => S[t]).filter(Boolean); const tOk = T.length === tgt[v].length && T.every((x) => x.ci95[0] > 0);
    const Z = ['plains', 'hills', 'mountain', 'coast'].map((z) => S[z + ' all hours']).filter(Boolean).map((x) => ({ name: x.stratum, gain: x.gain, lo: x.ci95[0], floor: -margin(x.mae_current), ok: x.ci95[0] > -margin(x.mae_current) }));
    const L = S['LOCKED test points, all zones']; if (L) Z.push({ name: 'locked test points', gain: L.gain, lo: L.ci95[0], floor: -margin(L.mae_current), ok: L.ci95[0] > -margin(L.mae_current) });
    const pass = tOk && Z.length >= 4 && Z.every((z) => z.ok);
    out.variants[v.slice(2)] = { passed: pass, targets: T.map((x) => ({ label: x.stratum, value: x.gain, ci: x.ci95, n: x.n, mae: [x.mae_current, x.mae_candidate] })), strata: Z };
  }
  const C = o.C || {}; const big = (C.cells || []).filter((x) => x.n >= 300);
  const cPass = big.length > 0 && big.every((x) => x.cover_candidate >= 0.87 && x.cover_candidate <= 0.93) && !big.every((x) => x.cover_current >= 0.87 && x.cover_current <= 0.93) && fin(C.ci95 && C.ci95[0]) && C.ci95[0] > -0.03 * C.interval_score_current;
  out.variants.C = { passed: cPass, targets: [{ label: 'interval score gain', value: C.gain, ci: C.ci95 }, { label: 'cells with >= 300 h inside [0.87, 0.93]', value: (C.cells_in_band_candidate ?? null) + ' of ' + big.length + ' (current ' + (C.cells_in_band_current ?? null) + ')' }], strata: [] };
  const passing = ['A', 'B', 'S', 'C'].filter((k) => out.variants[k].passed);
  out.rulePassed = passing.length > 0; out.variant = passing[0] || null;
  const show = out.variant && out.variant !== 'C' ? out.variant : 'A'; out.strata = out.variants[show].strata;
  for (const k of ['A', 'B', 'S']) for (const t of out.variants[k].targets) out.headline.push({ label: k + ': ' + t.label, value: t.value, ci: t.ci, unit: 'C MAE gain', n: t.n });
  out.headline.push({ label: 'C: ' + out.variants.C.targets[0].label, value: C.gain, ci: C.ci95, unit: 'interval score gain' }, { label: 'C: ' + out.variants.C.targets[1].label, value: out.variants.C.targets[1].value });
  for (const k of ['A', 'B', 'S', 'C']) if (!out.variants[k].passed) out.reasons.push(k + ' fails its rule' + (k !== 'C' ? ' (target lower bounds ' + out.variants[k].targets.map((t) => t.label + ' ' + (t.ci ? t.ci[0] : '?')).join(', ') + '; ' + out.variants[k].strata.filter((z) => !z.ok).map((z) => z.name + ' worse than the margin').join(', ') + ')' : ' (coverage cells or interval score)'));
  out.scriptSays = ['p_A_promotable', 'p_B_promotable', 'p_S_promotable', 'C_promotable'].some((k) => o[k] === true);
  out.agree = ['A', 'B', 'S', 'C'].every((k) => (o[(k === 'C' ? 'C' : 'p_' + k) + '_promotable'] === true) === out.variants[k].passed);
  return out;
}
function decideHeight(o) {
  const cuts = o.cuts || {}; const K = Object.keys(cuts).sort();
  const H = K.length >= 2 && K.every((c) => cuts[c].ci95 && cuts[c].ci95[0] > 0), H2 = K.length >= 2 && K.every((c) => cuts[c].ci95_h2 && cuts[c].ci95_h2[0] > 0);
  const out = { rulePassed: H || H2, variant: H2 ? 'H2' : H ? 'H' : null, strata: [], headline: [], reasons: [] };
  for (const c of K) { const x = cuts[c];
    out.headline.push({ label: 'H fade to 0, fit ceiling ' + c + ' m (' + x.test_stations + ' stations above)', value: x.gain_envelope_vs_full, ci: x.ci95, unit: 'C MAE gain', n: x.test_hours },
      { label: 'H2 fade to top band, fit ceiling ' + c + ' m', value: x.gain_h2_vs_full, ci: x.ci95_h2, unit: 'C MAE gain', n: x.test_hours },
      { label: 'bias above the ceiling ' + c + ' m: full / H / H2', value: [x.bias_full, x.bias_envelope, x.bias_h2].join(' / '), unit: 'C' }); }
  if (!H) out.reasons.push('H: the lower bound is not above 0 at both cuts (' + K.map((c) => c + ' m ' + (cuts[c].ci95 || [])[0]).join(', ') + ')');
  if (!H2) out.reasons.push('H2: the lower bound is not above 0 at both cuts (' + K.map((c) => c + ' m ' + (cuts[c].ci95_h2 || [])[0]).join(', ') + ')');
  out.reasons.push('no per-zone result: the test strata are the stations above each fit ceiling');
  out.scriptSays = o.promotable === true || o.h2_promotable === true; out.agree = (o.promotable === true) === H && (o.h2_promotable === true) === H2;
  return out;
}
function decideBlendr(o) {
  const out = { rulePassed: false, variant: null, strata: [], headline: [], reasons: [], variants: {} };
  for (const v of ['V1', 'V2']) { const X = (o.variants || {})[v]; if (!X) continue;
    const Z = Object.entries(X.zones || {}).map(([z, x]) => ({ name: z, gain: x.gain, lo: x.p1_25, floor: -x.margin, ok: x.p1_25 > -x.margin }));
    if (X.urban_mach) Z.push({ name: 'urban MACH', gain: X.urban_mach.gain, lo: X.urban_mach.p1_25, floor: -X.urban_mach.margin, ok: X.urban_mach.p1_25 > -X.urban_mach.margin });
    const pass = !!X.all && X.all.p1_25 > 0 && Z.every((z) => z.ok);
    out.variants[v] = { passed: pass, all: X.all, strata: Z };
    out.headline.push({ label: v + ' overall (' + (v === 'V1' ? 'MACH rows weighted to half' : 'MACH rows dropped') + '), 1.25th percentile', value: X.all && X.all.gain, ci: X.all && [X.all.p1_25, X.all.ci95[1]], unit: 'C MAE gain', n: X.all && X.all.n });
    if (!pass) out.reasons.push(v + ': overall p1.25 ' + (X.all && X.all.p1_25) + (X.all && X.all.p1_25 > 0 ? '' : ' is not above 0') + (Z.some((z) => !z.ok) ? '; ' + Z.filter((z) => !z.ok).map((z) => z.name).join(', ') + ' below the margin' : '')); }
  const passing = Object.keys(out.variants).filter((v) => out.variants[v].passed).sort((a, b) => out.variants[b].all.p1_25 - out.variants[a].all.p1_25);
  out.rulePassed = passing.length > 0; out.variant = passing[0] || null; out.strata = (out.variants[out.variant || 'V1'] || {}).strata || [];
  out.scriptSays = !!o.promote; out.agree = (o.promote || null) === out.variant;
  return out;
}
function decideFx(o) {
  const P = o.pooled || {}; const Y = P.yearGain || {};
  const strata = Object.entries(Y).map(([y, g]) => ({ name: 'year ' + y, gain: g, lo: (P.yearCi95 || {})[y] ? P.yearCi95[y][0] : null, floor: 0, ok: g >= 0, rule: 'point estimate >= 0 (R2)' }));
  const pass = !!P.ci95 && P.ci95[0] > 0 && strata.length === 3 && strata.every((s) => s.ok);
  const out = { rulePassed: pass, variant: pass ? 'C3' : null, strata, headline: [{ label: 'pooled CSI gain G (C3 minus the JRC 1-in-10 map), mean of 3 year gains', value: P.G, ci: P.ci95, unit: 'CSI' }].concat(Object.entries(Y).map(([y, g]) => ({ label: 'year ' + y + ' gain (' + ((P.windowsPerYear || {})[y] || '?') + ' windows, ' + ((P.reachesPerYear || {})[y] || '?') + ' reach zones)', value: g, ci: (P.yearCi95 || {})[y], unit: 'CSI' }))), reasons: [] };
  if (!(P.ci95 && P.ci95[0] > 0)) out.reasons.push('the pooled gain\'s lower bound ' + (P.ci95 ? P.ci95[0] : '?') + ' is not above 0');
  for (const s of strata) if (!s.ok) out.reasons.push(s.name + ' gain below 0');
  out.scriptSays = o.promote === true; out.agree = (o.promote === true) === pass; return out;
}
function decideA3(o) {
  const Ys = Object.keys(o.years || {}).sort(); const out = { rulePassed: false, variant: null, strata: [], headline: [], reasons: [] };
  const pass = (k) => Ys.length >= 2 && Ys.every((y) => (o.years[y].metrics[k].auc_ci[0] > 0.5) && (o.years[y].paired[k + '-P_hour'].auc_diff_ci[0] > 0));
  const P = ['P_d25', 'P_day'].filter(pass); out.rulePassed = P.length > 0; out.variant = P[0] || null;
  for (const y of Ys) { const Y = o.years[y];
    out.headline.push({ label: y + ' D25 (days >= 25 mm) AUC (' + Y.tehsils + ' tehsils, ' + Y.events + ' flooded)', value: Y.metrics.P_d25.auc, ci: Y.metrics.P_d25.auc_ci, unit: 'AUC' },
      { label: y + ' D25 minus the hourly driver P_hour, paired', value: null, ci: Y.paired['P_d25-P_hour'].auc_diff_ci, unit: 'AUC difference' },
      { label: y + ' P_day minus P_hour, paired', value: null, ci: Y.paired['P_day-P_hour'].auc_diff_ci, unit: 'AUC difference' });
    out.strata.push({ name: 'year ' + y, gain: null, lo: Y.paired['P_d25-P_hour'].auc_diff_ci[0], floor: 0, ok: Y.passes.includes('P_d25'), rule: 'AUC CI > 0.5 and paired difference CI > 0 (R1)' });
    if (!Y.passes.length) out.reasons.push(y + ': no replacement passes (D25 paired difference ' + JSON.stringify(Y.paired['P_d25-P_hour'].auc_diff_ci) + ')');
    if (Y.reproduces_recorded === false) out.reasons.push(y + ': the re-run does not reproduce the recorded intervals'); }
  out.scriptSays = (o.promote || []).length > 0; out.agree = JSON.stringify((o.promote || []).slice().sort()) === JSON.stringify(P.slice().sort()); return out;
}

/* -- the fixed registry -------------------------------------------------------------------------------------------------------- */
/* which diagnoses a candidate tests (J9): T, TN, TX items only; MACH network rows and the blend start for BLEND-R (its hypothesis: the MACH
   rows pull the plains blend); a responsible step of the served temperature chain by zone x block for the zone / time offsets (A, B) */
const TEMP_VARS = ['T', 'TN', 'TX'];
const varOf = (it) => (it && it.where && (it.where.var || it.where.vars && it.where.vars[0])) || null;
const plainsOrAll = (it) => !it.where || !it.where.zone || it.where.zone === 'plains' || it.where.zone === 'all';
const CHAIN_TEMP = { applicable: true, tested: false, why: 'the candidate acts on the national model output; the served temperature then passes the station calibration, the live MACH layer and the hyperlocal step, which this test does not include' };
export const REGISTRY = [
  { id: 'blendr@1', title: 'BLEND-R: plains blend weights refitted with MACH rows weighted to half (V1) or dropped (V2)',
    sourceRule: { file: 'RULES_20261101.json', key: 'BLENDR_blend_weights_rebalanced', text: R.BLENDR_blend_weights_rebalanced },
    script: 'blend_r.py', decide: 'blendr', estimateMin: 75, estimateNote: 'measured on the laptop 22 Oct 2026: 4,227 s (70.5 min), 5.77 M rows, 223 stations',
    inputs: (c) => [{ what: 'nine-model forecast archive (station-lake/archive/model/mm)', path: join(c.lake, 'archive', 'model', 'mm'), ok: dirCount(join(c.lake, 'archive', 'model', 'mm')) >= 9 && dirCount(join(c.lake, 'archive', 'model', 'mm', 'gfs_global')) >= 1000 },
      { what: 'national points and table', path: join(c.lake, 'archive', 'national', 'table.parquet'), ok: exists(join(c.lake, 'archive', 'national', 'table.parquet')) && exists(join(c.lake, 'archive', 'national', 'points.csv')) },
      { what: 'Step-2 blend scripts (mm_table.py, step2_blend.py)', path: join(c.lake, 'scripts', 'step2_blend.py'), ok: exists(join(c.lake, 'scripts', 'step2_blend.py')) && exists(join(c.lake, 'scripts', 'mm_table.py')) }],
    args: (c, out) => [c.lake, exists(join(c.lake, 'archive', 'obs_hourly', 'pmd_aws', 'pmd_aws_temp_hourly.parquet')) ? join(c.lake, 'archive', 'obs_hourly', 'pmd_aws', 'pmd_aws_temp_hourly.parquet') : '-', out, '--app', c.app],
    recorded: (c) => { const d = join(c.retrainDir || '', 'work', 'blend_r.json'); const runs = (() => { try { return readdirSync(c.retrainDir).filter((x) => /^run_/.test(x)).sort().reverse().map((x) => join(c.retrainDir, x, 'blend_r.json')); } catch (_) { return []; } })();
      return runs.concat([d]).find((f) => c.retrainDir && exists(f)) || null; },
    pointer: { target: 'blend-weights', file: 'blend-weights-active.json', what: 'the plains blend weights the server serves (server/api/blend.mjs reads the pointer within a minute)' },
    answers: (it) => TEMP_VARS.includes(varOf(it)) && plainsOrAll(it) && ((it.kind === 'network-drives-cell' && it.where && it.where.network === 'mach') || (it.kind === 'step' && it.responsible === 'start')),
    artefact: (outDir) => { try { const f = readdirSync(outDir).find((x) => /^blend-weights-blendr-.*\.json$/.test(x)); return f ? join(outDir, f) : null; } catch (_) { return null; } },
    chain: { applicable: true, tested: false, why: 'BLEND-R scores the blend START only (its rule: "scored on the blend START (no chain)"); the served temperature then passes the national residual model, the station calibration and the live MACH layer, which this test does not include' } },
  { id: 'temp-zone-abcs@2', title: 'Zone / time range calibration: A zone x 3-h block x season offset, B + forecast-temperature quintile, S coast onshore split, C Mondrian 90 % range',
    sourceRule: { file: 'RULES_20261101.json', key: 'A, B, C, S', text: ['A_zone_daypart_season_offset', 'B_offset_by_forecast_temperature_bin', 'C_range90_mondrian', 'S_coast_seabreeze'].map((k) => k + ': ' + R[k]).join(' | ') },
    script: 'cand_temp.py', decide: 'temp', estimateMin: 2,
    inputs: (c) => ['pred_oof.parquet', 'table.parquet', 'test_locked.json'].map((f) => ({ what: 'national ' + f, path: join(c.nat, f), ok: exists(join(c.nat, f)) })),
    args: (c, out) => [c.nat, out, '1000'], recorded: () => null, pointer: null, noPointerWhy: 'the build has no data pointer for A / B / S / C: a pass is written as "needs server hook" (PREP.md section 4)',
    answers: (it) => it.kind === 'step' && TEMP_VARS.includes(varOf(it)) && it.responsible !== 'start' && !!(it.where && it.where.zone),
    chain: CHAIN_TEMP },
  { id: 'height-envelope@1', title: 'Height envelope of the learned temperature residual above the training ceiling (H fade to 0; H2 fade to the top-band residual)',
    sourceRule: { file: 'RULES_20261101.json', key: 'H_height_envelope, H2_height_fade_to_top_band', text: 'H: ' + R.H_height_envelope + ' | H2: ' + R.H2_height_fade_to_top_band },
    script: 'cand_height.py', decide: 'height', estimateMin: 20,
    inputs: (c) => ['table.parquet', 'test_locked.json'].map((f) => ({ what: 'national ' + f, path: join(c.nat, f), ok: exists(join(c.nat, f)) })),
    args: (c, out) => [c.nat, out, '500'], recorded: () => null, pointer: null, noPointerWhy: 'no serving switch: the H code is a patch (v2832val/PATCH.diff), a pass needs a code deploy',
    chain: CHAIN_TEMP },
  { id: 'flood-fx-c3@1', title: 'Flood shadow C3: JRC depth at the forecast event return period and height above the river, per reach zone',
    sourceRule: { file: 'sci2 RULES.md', key: 'R2 + addendum', text: (SRC.SCI2.R2 || '') + '\n' + (SRC.SCI2.R2_addendum || '') },
    script: 'fx_dated_test2.py', decide: 'fx', estimateMin: 90, estimateNote: 'not measured on the laptop (the 22 Oct test ran in the cloud)',
    inputs: (c) => [['FXC_PATH', 'fx_calibrate.py'], ['WS9_WORK', 'the fx_grid work folder'], ['FX_JRC_DIR', 'the JRC depth tiles'], ['NIGRAAN_EXP_FX_UNOSAT', 'the UNOSAT products 3971 / 4197 / 3342 / 4163 (source.zip each)'], ['NIGRAAN_EXP_FX_TUWIEN', 'TU Wien FLOOD-HM-MASKED.zip']]
      .map(([k, w]) => ({ what: w + ' (' + k + ')', path: process.env[k] || null, ok: !!process.env[k] && exists(process.env[k]) })),
    args: (c, out) => [process.env.NIGRAAN_EXP_FX_UNOSAT, join(c.dataDir, 'evidence', 'flood', 'fx_rp_test.json'), out, process.env.NIGRAAN_EXP_FX_TUWIEN],
    recorded: (c) => { const f = join(c.dataDir, 'evidence', 'flood', 'fx_dated_test_2022dated.json'); return exists(f) ? f : null; },
    pointer: { target: 'fx-model-served', file: 'flood-extent/fx-model.json', what: 'the river flood extent model\'s "served" switch (false -> true)' },
    chain: { applicable: true, tested: false, why: 'R2 scores C3 with GloFAS REANALYSIS flows; the served chain would use the river FORECAST flows (the flood shadow computes them daily and waits for dated truth)' },
    ownerWhenMissing: 'data request: put the UNOSAT 3971 / 4197 / 3342 / 4163 products and the TU Wien 2022 zip on this computer and name them in NIGRAAN_EXP_FX_UNOSAT / NIGRAAN_EXP_FX_TUWIEN (with FXC_PATH, WS9_WORK, FX_JRC_DIR) to re-run R2 here' },
  { id: 'flood-d25@1', title: 'Flood shadow D25: days with 25 mm or more as the local-rain flood trigger (and P_day), against the hourly ladder',
    sourceRule: { file: 'sci2 RULES.md', key: 'R1', text: SRC.SCI2.R1 || '' },
    script: 'exp_a3_rerun.py', decide: 'a3', estimateMin: 1,
    inputs: (c) => ['2025', '2022'].map((y) => ({ what: 'per-tehsil rows of the ' + y + ' test (IMERG predictors, flooded share)', path: join(c.dataDir, 'evidence', 'flood', 'a3_trigger_test_' + y + '.json'), ok: exists(join(c.dataDir, 'evidence', 'flood', 'a3_trigger_test_' + y + '.json')) })),
    args: (c, out) => [out, join(c.dataDir, 'evidence', 'flood', 'a3_trigger_test_2025.json'), join(c.dataDir, 'evidence', 'flood', 'a3_trigger_test_2022.json')],
    recorded: () => null, pointer: null, noPointerWhy: 'the served local-rain flood trigger is the hourly ladder in code; a D25 trigger needs a code hook',
    chain: { applicable: true, tested: false, why: 'R1 scores season IMERG rain; the served chain would use the forecast rain of the morning issue (the flood shadow writes it daily)' } },
];
/* the registered candidate a diagnosis item asks for (J9): the first in registry order whose answers() accepts it, else null */
export function candidateFor(it) { for (const C of REGISTRY) { try { if (C.answers && C.answers(it)) return C.id; } catch (_) {} } return null; }
export const DECIDE = { temp: decideTemp, height: decideHeight, blendr: decideBlendr, fx: decideFx, a3: decideA3 };

/* -- the rule document written before the first run -------------------------------------------------------------------------------- */
export function ruleDoc(C, nowIso) {
  const scriptFile = join(EXP_DIR, C.script);
  return { schema: 'agn.experiment-rule.v1', id: C.id, title: C.title, written: nowIso,
    preRegistration: 'written by the experimentation agent at the first sight of this candidate, before its first run; never edited after a run (a changed rule needs a new id)',
    sourceRule: C.sourceRule, decision: C.decide, script: { file: 'scripts/agents/exp/' + C.script, sha256: fileSha(scriptFile) },
    design: 'fit on training data only; locked test stations never fitted; held-out stations and periods; paired bootstrap intervals (the rule\'s own design)',
    noZoneWorse: 'every stratum the rule names (zones, the locked set, urban MACH, years) must stay above its non-inferiority floor; a candidate whose output has no such strata cannot be promoted',
    fullChain: C.chain, pointer: C.pointer || null, noPointerWhy: C.noPointerWhy || null, stations: C.stations || undefined, proposedBy: C.from || undefined };
}
export const safeId = (id) => String(id).replace(/[^\w.-]/g, '_');
