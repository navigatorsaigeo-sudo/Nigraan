/* == v91.17.283.10 . AGENT 6: EXPERIMENTATION (weekly, Sunday from 03:00 PKT; low priority, time budget, lock, outside the request path) ==
   Runs the candidate experiments of the fixed registry (scripts/agents/exp_registry.mjs) (v91.17.283.14: no station exclusion candidates; the diagnostic agent
   proposes, each under its pre-registered rule, on this computer's archives, and writes for each a run record and a PROMOTION RECORD
   (promote yes/no, the evidence, the exact data pointer that would change). It NEVER promotes and never changes a served value: only the
   owner approves (scripts/agents/exp_pointer.mjs; scripts/gen/exp_approve.mjs or the operator page).
   For each candidate, in order:
     1 rule      data/agents/experiments/rules/<id>.json is written (exclusive create) at the first sight of the candidate, BEFORE its first
                 run, and never edited: a rule file whose sha256 differs from the one its earlier runs recorded, or a script whose sha256
                 differs from the one the rule froze, refuses the run ("register a new id")
     2 inputs    the candidate's inputs on this computer; missing inputs: the rule is applied to the RECORDED output of an earlier real run
                 of the same script when the registry names one (said so in every record), else "waiting for inputs" (an owner item)
     3 unchanged a candidate whose rule, script and inputs (size and time of each input) are the same as at its last completed run is not
                 re-run; its last result stands
     4 budget    the week's budget (NIGRAAN_EXP_BUDGET_MIN, default 180 min). A candidate runs only if its expected minutes (its last
                 measured run, else the registry estimate) fit in what is left; the rest is queued (queue.json) for the next week. Each run
                 is killed at min(left, max(2 x expected, expected + 10)) minutes. Candidates never run on this computer go first, then
                 those a diagnosis asks for (the item's suggestedTest.candidate, v91.17.283.24 J9), then re-runs.
                 v91.17.283.24 · self-audit J20 · the minutes used are kept on disk per week (budget.json, written before and after each
                 candidate): a run stopped part-way (the laptop off, the server's kill timer) and started again the same week continues
                 with what is left, counting a candidate that was running when it stopped at its time limit (or the time since its start,
                 if shorter). Before, every start of the same week had the whole budget again.
     5 run       python scripts/agents/exp_run.py (wall time, CPU time and peak memory measured) at the lowest priority; the script's output,
                 log and meter go to data/agents/experiments/runs/<week>/<id>/
     6 decide    the rule is applied in code (exp_registry.mjs DECIDE) independently of the script's own flag; promote = rule passed AND
                 no stratum of the rule worse than its floor AND the full served chain tested where it applies AND a data pointer exists
                 AND the script's own decision agrees
   Writes only under data/agents/experiments/ (and the day log). No network code; no paid provider call: it reads the archives.
   usage: node scripts/agents/experiments.mjs --app <nigraan-local> [--data <dir>] [--lake <station-lake>] [--retrain <_admin/retrain>]
               [--budget-min N] [--week YYYY-MM-DD] [--only id,id] [--force] [--now ISO] */
import { readFileSync, existsSync, mkdirSync, readdirSync, statSync, openSync, writeSync, closeSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import * as OS from 'node:os';
import { args, readJson, writeJsonAtomic, appendLine, pktDay, takeLock, agentLog, addDays, PKT_MS } from './lib.mjs';
import { REGISTRY, DECIDE, EXP_DIR, ruleDoc, fileSha, sha256, safeId } from './exp_registry.mjs';
import { targetState } from './exp_pointer.mjs';

export const EXP_AT_PKT_MIN = 3 * 60;   /* Sunday 03:00 PKT */
/* the PKT week key: the date of the Sunday on or before the PKT day of nowMs */
export function weekKey(nowMs) { const d = pktDay(nowMs); const dow = new Date(d + 'T00:00:00Z').getUTCDay(); return addDays(d, -dow); }
export function expDue(dataDir, nowMs = Date.now()) {
  const wk = weekKey(nowMs); const start = Date.parse(wk + 'T00:00:00Z') - PKT_MS + EXP_AT_PKT_MIN * 60e3;
  const st = readJson(join(dataDir, 'agents', 'experiments', 'state.json'), null);
  if (st && st.week === wk && st.complete) return { due: false, week: wk, why: 'done for the week of ' + wk };
  if (nowMs < start) return { due: false, week: wk, why: 'waits for Sunday 03:00 PKT (' + wk + ')' };
  return { due: true, week: wk, why: 'weekly run for the week of ' + wk };
}

/* the diagnostic agent's item kinds -> the test the hypothesis asks for. From diagnose@283.24 the item carries it (suggestedTest { kind,
   candidate, text }, J9); this mapping reads diagnoses written before (diagnose@283.10, text only):
   station / qc / sensor / timestamp / station-drives-cell -> a check on site (owner; v91.17.283.14: no station exclusion experiment -
   values are judged one by one by server/api/obsqc.mjs, the owner decision of 24 Oct 2026);
   step / heat-input / network-drives-cell -> a new experiment that must first be registered with its rule (owner) */
const KIND_TEST = (it) => { const k = String(it.kind || ''); if (k === 'station' || k === 'qc') return 'site_check';
  if (k === 'sensor' || k === 'timestamp' || k === 'station-drives-cell') return 'sensor_check'; if (k === 'step' || k === 'heat-input' || k === 'network-drives-cell') return 'unregistered_experiment'; return 'text'; };
/* -- diagnoses (agent 5): data/agents/diagnose/<YYYY-MM-DD>.json, schema agn.diagnose.v1 (documented in CHANGES; tolerant reader) -- */
export function readDiagnoses(dataDir, fromDay, toDay) {
  const dir = join(dataDir, 'agents', 'diagnose'); let files = []; try { files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort(); } catch (_) { return []; }
  const out = [];
  for (const f of files) { const day = f.slice(0, 10); if (day < fromDay || day > toDay) continue; const D = readJson(join(dir, f), null); if (!D) continue;
    const items = Array.isArray(D) ? D : (D.items || D.diagnoses || D.flags || []);
    items.forEach((it, i) => { if (!it || typeof it !== 'object') return;
      const st = it.suggestedTest || it.suggested_test || it.nextTest || it.next_test || null; const s = typeof st === 'string' ? { kind: KIND_TEST(it), text: st } : (st || {});
      const where = it.where || {}; const resp = typeof it.responsible === 'string' ? (/^(step|network):/.test(it.responsible) || it.kind === 'step' ? { kind: 'step', step: it.responsible } : { kind: 'station', station: where.station || it.responsible }) : (it.responsible || {});
      const size = it.size ? { ...it.size, ci95: it.size.ci95 || it.size.ci || null } : null;
      out.push({ day, file: 'agents/diagnose/' + f, id: String(it.id || day + '#' + i), kind: it.kind || null, flag: String(it.flag || it.title || it.text || it.what || ''), variable: it.variable || where.var || null, zone: it.zone || where.zone || null,
        responsible: resp, size, evidence: it.evidence || null, rank: it.rank || i + 1,
        test: { kind: String(s.kind || s.type || 'text'), candidate: s.candidate || null, text: s.text || s.why || s.description || null } }); }); }
  return out;
}

function python() {
  const c = []; if (process.env.NIGRAAN_PYTHON) c.push(process.env.NIGRAAN_PYTHON); if (process.env.LOCALAPPDATA) c.push(join(process.env.LOCALAPPDATA, 'Python', 'bin', 'python.exe'));
  for (const p of c) if (existsSync(p)) return { cmd: p, pre: [] };
  return process.platform === 'win32' ? { cmd: 'py', pre: ['-3'] } : { cmd: 'python3', pre: [] };
}
function runChild(outDir, scriptArgs, limitMin) {
  const P = python(); const meter = join(outDir, 'meter.json'); const logF = join(outDir, 'log.txt'); const fd = openSync(logF, 'w');
  return new Promise((res) => {
    const ch = spawn(P.cmd, [...P.pre, join(dirname(fileURLToPath(import.meta.url)), 'exp_run.py'), meter, ...scriptArgs], { cwd: outDir, windowsHide: true, stdio: ['ignore', fd, fd], env: { ...process.env, PYTHONUNBUFFERED: '1' } });
    try { if (ch.pid) OS.setPriority(ch.pid, OS.constants.priority.PRIORITY_LOW); } catch (_) {}
    const t0 = Date.now(); let killed = false;
    const t = setTimeout(() => { killed = true; try { ch.kill(); } catch (_) {} }, limitMin * 60e3);
    ch.on('error', (e) => { clearTimeout(t); closeSync(fd); res({ code: -1, killed, wallS: (Date.now() - t0) / 1e3, error: e.message, meter: null }); });
    ch.on('close', (code) => { clearTimeout(t); try { closeSync(fd); } catch (_) {} res({ code, killed, wallS: (Date.now() - t0) / 1e3, meter: readJson(meter, null) }); });
  });
}
const tail = (f, n = 6) => { try { return readFileSync(f, 'utf8').trim().split('\n').slice(-n).map((x) => x.slice(0, 300)); } catch (_) { return []; } };
function fingerprint(inputs, extra) { const parts = inputs.map((i) => { try { const s = statSync(i.path); return i.path + '|' + s.size + '|' + Math.floor(s.mtimeMs) + '|' + (s.isDirectory() ? (readdirSync(i.path).length) : ''); } catch (_) { return i.path + '|missing'; } }); return sha256(JSON.stringify([parts, extra])).slice(0, 16); }

/* the promotion record */
function promotion(C, ctx, run, D, outDir) {
  const ruleSha = run.ruleSha256; const strataOk = D.strata.length > 0 && D.strata.every((s) => s.ok);
  const chainOk = !C.chain || !C.chain.applicable || C.chain.tested === true;
  const reasons = [];
  if (!D.rulePassed) reasons.push('the pre-registered rule is not met: ' + (D.reasons.join('; ') || 'see the evidence'));
  if (D.rulePassed && !strataOk) reasons.push(D.strata.length ? 'a stratum is worse than its floor: ' + D.strata.filter((s) => !s.ok).map((s) => s.name).join(', ') : 'the output has no per-zone result, so "no zone gets worse" cannot be shown');
  if (!chainOk) reasons.push('full served chain not tested: ' + C.chain.why);
  if (!C.pointer) reasons.push('no data pointer: ' + (C.noPointerWhy || 'no serving switch exists'));
  if (D.agree === false) reasons.push('the script\'s own decision (' + D.scriptSays + ') disagrees with the rule applied here: checked by hand before anything moves');
  if (run.mode === 'recorded') reasons.push('decided on the recorded output of an earlier real run (' + run.recordedFrom + '), not re-run on this computer: ' + run.why);
  let artefact = null, version = null;
  if (D.rulePassed && strataOk && C.pointer) {
    if (C.pointer.target === 'blend-weights') { const f = C.artefact && C.artefact(outDir); if (f) { artefact = { file: basename(f), sha256: fileSha(f) }; version = basename(f).replace(/^blend-weights-|\.json$/g, ''); } else reasons.push('the run wrote no candidate weights file'); }
    if (C.pointer.target === 'fx-model-served') version = 'served=true';
  }
  const promote = D.rulePassed && strataOk && chainOk && !!C.pointer && D.agree !== false && run.mode === 'run' && (C.pointer.target === 'fx-model-served' || !!artefact);
  const T = C.pointer ? targetState(ctx.dataDir, C.pointer.target) : null;
  const recRel = 'data/agents/experiments/runs/' + run.week + '/' + safeId(C.id) + '/promotion.json';
  return { schema: 'agn.promotion.v1', id: C.id, title: C.title, week: run.week, at: new Date().toISOString(), promote, rulePassed: D.rulePassed, variant: D.variant, reasons: promote ? [] : reasons,
    evidence: { mode: run.mode, recordedFrom: run.recordedFrom || null, headline: D.headline, strata: D.strata, output: run.output, scriptSays: D.scriptSays, agree: D.agree },
    rule: 'data/agents/experiments/rules/' + safeId(C.id) + '.json', ruleSha256: ruleSha, scriptSha256: run.scriptSha256, sourceRule: C.sourceRule.file + ' ' + C.sourceRule.key,
    fullChain: C.chain || null,
    pointer: C.pointer ? { target: C.pointer.target, file: 'data/' + C.pointer.file, what: C.pointer.what, fromVersion: T && T.version, fromFile: T && T.file, fromSha256: T && T.sha256, wouldBecome: promote ? (artefact ? { file: artefact.file, sha256: artefact.sha256, version } : { version }) : null } : null,
    noPointerWhy: C.pointer ? null : (C.noPointerWhy || null), artefact, version, sourceRun: 'experiments.mjs ' + C.id + ' week ' + run.week + ' (' + run.mode + ')',
    /* v91.17.283.15 · DGX C-1: the commands in both forms, Windows (the laptop) and Linux (the DGX), from the same arguments.
       v91.17.283.24 · C-1 completed: command / revert are the form of the computer that wrote the record (the operator page and the
       report show them); commandWin / revertWin and commandLinux / revertLinux are both forms, each with its own cd line */
    approve: promote ? (() => { const W = { command: ['cd /d "' + ctx.appWin + '"', 'node scripts\\gen\\exp_approve.mjs approve "' + recRel.split('/').join('\\') + '" --confirm ' + C.id], revert: ['cd /d "' + ctx.appWin + '"', 'node scripts\\gen\\exp_approve.mjs revert ' + C.pointer.target + ' --confirm ' + C.pointer.target] };
      const commandLinux = ['cd "' + ctx.appLinux + '"', 'node scripts/gen/exp_approve.mjs approve "' + recRel + '" --confirm ' + C.id], revertLinux = ['cd "' + ctx.appLinux + '"', 'node scripts/gen/exp_approve.mjs revert ' + C.pointer.target + ' --confirm ' + C.pointer.target];
      const here = ctx.platform === 'win32' ? W : { command: commandLinux, revert: revertLinux };
      return { platform: ctx.platform === 'win32' ? 'windows' : 'linux', command: here.command, revert: here.revert, button: 'Operator page (Evidence & Methods > Health and skill > Experiments): Approve, then type ' + C.id,
        commandWin: W.command, revertWin: W.revert, commandLinux, revertLinux }; })() : null };
}

export async function runWeek(o) {
  const { app, dataDir, nowMs = Date.now(), budgetMin = Number(process.env.NIGRAAN_EXP_BUDGET_MIN) || 180, only = null, force = false } = o;
  const week = o.week || weekKey(nowMs); const E = join(dataDir, 'agents', 'experiments'); mkdirSync(join(E, 'rules'), { recursive: true });
  const lake = o.lake || join(app, '..', 'station-lake');
  const ctx = { app, dataDir, lake, nat: join(lake, 'archive', 'national'), retrainDir: o.retrain || join(app, '..', '..', '_admin', 'retrain'), 
    appWin: process.env.NIGRAAN_EXP_APP_WIN || (process.platform === 'win32' ? resolve(app) : 'D:\\NIGRAAN\\nig\\nigraan-local'),
    appLinux: process.env.NIGRAAN_EXP_APP_LINUX || (process.platform !== 'win32' ? resolve(app) : '/srv/nigraan/nig/nigraan-local'), platform: o.platform || process.platform };   /* v283.15 · DGX C-1 */
  /* candidates: the registry (v91.17.283.14: station exclusions are no longer candidates; diagnoses only reorder the registry) */
  const diag = readDiagnoses(dataDir, addDays(pktDay(nowMs), -14), pktDay(nowMs));
  const dyn = readJson(join(E, 'candidates.json'), { candidates: [] }) || { candidates: [] }; const priority = new Set();
  for (const d of diag) { if (d.test.candidate) priority.add(String(d.test.candidate)); }
  if (dyn.candidates.length) writeJsonAtomic(join(E, 'candidates.json'), { ...dyn, retired: '24 Oct 2026 (v91.17.283.14): station exclusion candidates are no longer run (values are judged by obsqc.mjs); kept as history', candidates: [], history: dyn.candidates });
  const costs = readJson(join(E, 'costs.json'), {}) || {}; const prevRuns = readJson(join(E, 'last.json'), {}) || {};
  let cands = (o.registry || REGISTRY).slice();   /* o.registry / o.runChild: tests only (scripts/tests28324/jobs.unit.test.mjs) */
  if (only) cands = cands.filter((c) => only.includes(c.id));
  /* order: registry candidates never run on this computer (the pre-registered backlog), then the diagnosis suggestions in the diagnostic
     agent's rank order (newest diagnosis first), then everything else (re-runs when inputs changed) */
  const rank = new Map(); diag.slice().sort((a, b) => b.day.localeCompare(a.day) || (a.rank || 1e9) - (b.rank || 1e9)).forEach((d) => { if (d.test.candidate && !rank.has(String(d.test.candidate))) rank.set(String(d.test.candidate), rank.size); });
  const grp = (c) => !prevRuns[c.id] ? 0 : rank.has(c.id) ? 1 : 2;
  cands.sort((a, b) => grp(a) - grp(b) || (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
  /* J20 · the week's minutes on disk */
  /* clock: the wall time of this run (o.clock, tests: a fixed clock); the pending mark and its count use the same clock */
  const clock = typeof o.clock === 'function' ? o.clock : () => Date.now();
  const BF = join(E, 'budget.json'); const B0 = readJson(BF, null); const BW = B0 && B0.week === week ? B0 : { week, usedMin: 0, runs: [] };
  if (BW.pending) { const p = BW.pending; const was = Math.min(Number(p.limitMin) || 0, Math.max(0, (clock() - Date.parse(p.at)) / 6e4)); BW.usedMin += was; BW.runs.push({ id: p.id, min: Math.round(was * 10) / 10, at: p.at, stopped: 'the run of the week was stopped while this candidate ran (counted to its time limit)' }); delete BW.pending; }
  const saveB = () => writeJsonAtomic(BF, BW); saveB();   /* the count of a stopped run is on disk at once */
  let left = Math.max(0, budgetMin - BW.usedMin); const results = [], queue = [];
  for (const C of cands) {
    const sid = safeId(C.id), outDir = join(E, 'runs', week, sid), ruleF = join(E, 'rules', sid + '.json');
    /* 1 pre-registration (exclusive create; never rewritten) */
    if (!existsSync(ruleF)) { const fd = openSync(ruleF, 'wx'); writeSync(fd, JSON.stringify(ruleDoc(C, new Date().toISOString()), null, 1)); closeSync(fd); }
    const ruleSha = fileSha(ruleF), rule = readJson(ruleF, {}), scriptSha = fileSha(join(EXP_DIR, C.script)); const last = prevRuns[C.id] || null;
    const base = { id: C.id, title: C.title, week, ruleSha256: ruleSha, scriptSha256: scriptSha, priority: priority.has(C.id) };
    if (rule.script && rule.script.sha256 !== scriptSha) { results.push({ ...base, status: 'refused', why: 'the script changed after the rule was written (rule ' + String(rule.script.sha256).slice(0, 12) + ', now ' + String(scriptSha).slice(0, 12) + '): register a new id' }); continue; }
    if (last && last.ruleSha256 && last.ruleSha256 !== ruleSha) { results.push({ ...base, status: 'refused', why: 'the rule file was edited after a run (' + last.ruleSha256.slice(0, 12) + ' at ' + last.week + ', now ' + ruleSha.slice(0, 12) + '): register a new id' }); continue; }
    /* 2 inputs */
    const inputs = C.inputs(ctx); const missing = inputs.filter((i) => !i.ok);
    const fp = missing.length ? null : fingerprint(inputs, [ruleSha, scriptSha]);
    if (!missing.length && !force && last && last.status === 'done' && last.mode === 'run' && last.fingerprint === fp) { results.push({ ...base, status: 'unchanged', why: 'same rule, script and inputs as the run of ' + last.week + ': its result stands', lastWeek: last.week, promote: last.promote, record: last.record }); continue; }
    mkdirSync(outDir, { recursive: true });
    let run = { ...base, inputs: inputs.map((i) => ({ what: i.what, ok: i.ok, path: i.path ? relative(dataDir, i.path).split('\\').join('/') : null })), at: new Date().toISOString() }, outF = join(outDir, 'out.json');
    if (missing.length) {
      const rec = C.recorded ? C.recorded(ctx) : null;
      const why = 'inputs not on this computer: ' + missing.map((i) => i.what).join('; ');
      if (!rec) { queue.push({ id: C.id, why, owner: C.ownerWhenMissing || 'data request: ' + missing.map((i) => i.what).join('; ') }); results.push({ ...run, status: 'waiting for inputs', why, owner: C.ownerWhenMissing || null }); continue; }
      writeFileSync(outF, readFileSync(rec)); run = { ...run, mode: 'recorded', recordedFrom: basename(dirname(rec)) + '/' + basename(rec) + ' (' + new Date(statSync(rec).mtimeMs).toISOString().slice(0, 10) + ', sha256 ' + fileSha(rec).slice(0, 12) + ')', why, fingerprint: 'rec:' + fileSha(rec).slice(0, 16), queuedForRealRun: true,
        cost: costs[C.id] || { estimateMin: C.estimateMin, note: C.estimateNote || null } };
      queue.push({ id: C.id, why: 'decided on its recorded output; the real run waits for its inputs (' + why + ')', owner: C.ownerWhenMissing || null });
    } else {
      /* 4 budget */
      const est = (costs[C.id] && costs[C.id].lastWallMin) || (C.expectedMin && C.expectedMin(ctx)) || (costs['script:' + C.script] && costs['script:' + C.script].lastWallMin) || C.estimateMin; const limit = Math.min(left, Math.max(2 * est, est + 10));
      if (est > left) { queue.push({ id: C.id, why: 'budget: needs about ' + Math.round(est) + ' min, ' + Math.round(left) + ' min left this week', expectedMin: est }); results.push({ ...run, status: 'queued', why: 'over this week\'s budget (needs ~' + Math.round(est) + ' min, ' + Math.round(left) + ' left)' }); continue; }
      /* 5 run */
      BW.pending = { id: C.id, limitMin: limit, at: new Date(clock()).toISOString() }; saveB();
      const r = await (o.runChild || runChild)(outDir, [join(EXP_DIR, C.script), ...C.args(ctx, outF)], limit);
      const wallMin = (r.meter && r.meter.wallS != null ? r.meter.wallS : r.wallS) / 60; left -= wallMin;
      delete BW.pending; BW.usedMin += wallMin; BW.runs.push({ id: C.id, min: Math.round(wallMin * 10) / 10, at: new Date(clock()).toISOString() }); saveB();
      if (!(C.expectedMin && C.expectedMin(ctx))) costs['script:' + C.script] = { lastWallMin: Math.round(wallMin * 10) / 10, from: C.id, measuredAt: new Date().toISOString() };
      costs[C.id] = { lastWallMin: Math.round(wallMin * 10) / 10, lastPeakMb: r.meter ? r.meter.peakRssMb : null, lastCpuS: r.meter ? r.meter.cpuS : null, measuredAt: new Date().toISOString(), host: OS.hostname(), stoppedAtLimit: r.killed || false, estimateMin: C.estimateMin };
      run = { ...run, mode: 'run', fingerprint: fp, limitMin: Math.round(limit), cost: costs[C.id], exit: r.code, log: tail(join(outDir, 'log.txt')) };
      if (r.killed || r.code !== 0 || !existsSync(outF)) { results.push({ ...run, status: r.killed ? 'stopped at the time limit' : 'failed', why: r.killed ? 'stopped after ' + Math.round(limit) + ' min (queued for next week)' : 'exit ' + r.code + ': ' + (run.log.slice(-1)[0] || '') }); if (r.killed) queue.push({ id: C.id, why: 'stopped at its time limit (' + Math.round(limit) + ' min)', expectedMin: wallMin }); continue; }
    }
    /* 6 decide */
    const O = readJson(outF, null); if (!O) { results.push({ ...run, status: 'failed', why: 'the output is not readable JSON' }); continue; }
    const D = DECIDE[C.decide](O); run.output = relative(dataDir, outF).split('\\').join('/');
    const P = promotion(C, ctx, run, D, outDir); writeJsonAtomic(join(outDir, 'promotion.json'), P);
    const done = { ...run, status: 'done', promote: P.promote, rulePassed: P.rulePassed, variant: P.variant, reasons: P.reasons, headline: D.headline, strata: D.strata, record: relative(dataDir, join(outDir, 'promotion.json')).split('\\').join('/') };
    writeJsonAtomic(join(outDir, 'run.json'), done); results.push(done);
    if (run.mode === 'run') prevRuns[C.id] = { week, status: 'done', mode: 'run', fingerprint: fp, ruleSha256: ruleSha, promote: P.promote, record: done.record };
    else if (!prevRuns[C.id]) prevRuns[C.id] = { week, status: 'recorded', mode: 'recorded', ruleSha256: ruleSha, promote: P.promote, record: done.record };
    else prevRuns[C.id].ruleSha256 = prevRuns[C.id].ruleSha256 || ruleSha;
    writeJsonAtomic(join(E, 'costs.json'), costs); writeJsonAtomic(join(E, 'last.json'), prevRuns);   /* kept after every candidate: a run stopped mid-way loses nothing done */
  }
  writeJsonAtomic(join(E, 'costs.json'), costs); writeJsonAtomic(join(E, 'last.json'), prevRuns);
  writeJsonAtomic(join(E, 'queue.json'), { week, at: new Date().toISOString(), items: queue });
  const sum = { week, at: new Date().toISOString(), complete: true, budgetMin, usedMin: Math.round(Math.min(budgetMin, BW.usedMin) * 10) / 10, usedRuns: BW.runs, diagnosesRead: diag.length, results: results.map((r) => ({ id: r.id, title: r.title, status: r.status, mode: r.mode || null, promote: r.promote ?? null, rulePassed: r.rulePassed ?? null, variant: r.variant ?? null, why: r.why || null, reasons: r.reasons || null, headline: r.headline || null, strata: r.strata || null, cost: r.cost || null, record: r.record || null, recordedFrom: r.recordedFrom || null, priority: r.priority, owner: r.owner || null })), queue };
  writeJsonAtomic(join(E, 'weeks', week + '.json'), sum); writeJsonAtomic(join(E, 'state.json'), sum);
  return sum;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const A = args(); const app = A.app || join(dirname(fileURLToPath(import.meta.url)), '..', '..'); const dataDir = A.data || join(app, 'data');
  const budget = Number(A['budget-min']) || Number(process.env.NIGRAAN_EXP_BUDGET_MIN) || 180;
  const rel = takeLock(join(dataDir, 'agents', 'experiments.lock'), (budget + 30) * 60e3); if (!rel) { console.log('another experimentation run is going'); process.exit(5); }
  try {
    const nowMs = A.now ? Date.parse(A.now) : Date.now();
    const S = await runWeek({ app, dataDir, nowMs, budgetMin: budget, lake: A.lake, retrain: A.retrain, week: A.week, only: A.only ? String(A.only).split(',') : null, force: !!A.force });
    const line = 'week ' + S.week + ': ' + S.results.map((r) => r.id + ' ' + r.status + (r.status === 'done' ? (r.promote ? ' PROMOTE' : ' not promoted') + (r.mode === 'recorded' ? ' (recorded output)' : '') : '')).join('; ') + '; used ' + S.usedMin + ' of ' + S.budgetMin + ' min';
    agentLog(dataDir, 'experiments', line, {}, Date.now()); console.log(line);
  } finally { rel(); }
}
