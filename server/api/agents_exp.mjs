/* == v91.17.283.10 . AGENTS 6 AND 7 IN THE SERVER: EXPERIMENTATION (weekly) AND THE WEEKLY PROPOSALS REPORT ============================
   Started by server/api/agents.mjs with the same child-process pattern as agents 1-4 (lowest priority, kill timer, lock, scheduler gate):
     experiments  checked hourly; runs once a PKT week from Sunday 03:00 PKT: node scripts/agents/experiments.mjs, its own budget
                  (NIGRAAN_EXP_BUDGET_MIN, default 180 min) inside a kill timer of budget + 20 min; the long compute slot (v91.17.283.24 J8: no longer the bulk slot, so the
                  LAMHA copy and the MACH sync never wait behind it)
     proposals    checked hourly; once a week from Monday 08:00 PKT: node scripts/agents/proposals.mjs (_admin\proposals_<date>.md)
   NIGRAAN_AGENTS=0 stops them with the others; NIGRAAN_EXPERIMENTS=0 stops the experimentation agent only.
   Operator routes (operator scope; a customer view gets 403 and makes no request):
     GET  /api/ops/experiments                  the week's results, promotion records ready, queue, compute measured, rules, approvals
     GET  /api/ops/experiments?run=exp|proposals start that agent now
     GET  /api/ops/experiments/page             the weekly proposals page (plain server-made HTML, no script; Approve forms)
     POST /api/ops/experiments/approve          {record: <promotion record path under data/agents/experiments/runs>, confirm: <its id>}
     POST /api/ops/experiments/revert           {target, confirm: <target>}
   Approve and revert are LOOPBACK OPERATOR ONLY (a direct loopback request, not relayed, not the customer view; a signed remote
   operator is refused too), need the explicit typed confirmation, and every attempt is logged (approvals.jsonl, _admin\alerts.log). */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { schedule } from './scheduler.mjs';

const PKT = 5 * 3600e3;
const readJson = (f, d = null) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch (_) { return d; } };
const tailLines = (f, n) => { try { return readFileSync(f, 'utf8').split('\n').filter(Boolean).slice(-n).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean); } catch (_) { return []; } };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pktText = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? new Date(t + PKT).toISOString().slice(0, 16).replace('T', ' ') + ' PKT' : '-'; };

export function createExperimentAgents(app, root, dataDir, h) {
  const { child, on, st } = h; const E = join(dataDir, 'agents', 'experiments');
  st.exp = { busy: false, lastStart: null, lastEnd: null, lastCode: null, tail: null, runs: 0 }; st.proposals = { busy: false, lastStart: null, lastEnd: null, lastCode: null, tail: null, runs: 0 };
  const budget = () => Math.max(10, Number(process.env.NIGRAAN_EXP_BUDGET_MIN) || 180);
  let M = null; const mods = async () => M || (M = { X: await import(new URL('../../scripts/agents/experiments.mjs', import.meta.url).href), P: await import(new URL('../../scripts/agents/proposals.mjs', import.meta.url).href), Ptr: await import(new URL('../../scripts/agents/exp_pointer.mjs', import.meta.url).href), B: await import('./blend.mjs') });
  { const t = setTimeout(() => { mods().catch(() => {}); }, 30e3); if (t.unref) t.unref(); }   /* load the agent modules once, off the first operator request */
  async function runExp(force = false) {
    if (!on() || process.env.NIGRAAN_EXPERIMENTS === '0' || st.exp.busy) return { started: false, busy: st.exp.busy };
    const d = (await mods()).X.expDue(dataDir); if (!d.due && !force) return { started: false, ...d };
    st.exp.busy = true; st.exp.lastStart = new Date().toISOString(); st.exp.runs++;
    try { const r = await child('exp', 'experiments.mjs', ['--app', root, '--data', dataDir, '--budget-min', String(budget())].concat(force ? ['--force'] : []), budget() + 20, 1024);
      st.exp.lastCode = r.code; st.exp.tail = r.out.trim().split('\n').slice(-3).map((x) => x.slice(0, 400)); return { started: true, code: r.code };
    } finally { st.exp.busy = false; st.exp.lastEnd = new Date().toISOString(); }
  }
  async function runProposals(force = false) {
    if (!on() || st.proposals.busy) return { started: false, busy: st.proposals.busy };
    const d = (await mods()).P.proposalsDue(dataDir); if (!d.due && !force) return { started: false, ...d };
    st.proposals.busy = true; st.proposals.lastStart = new Date().toISOString(); st.proposals.runs++;
    try { const r = await child('proposals', 'proposals.mjs', ['--app', root, '--data', dataDir, '--day', d.day], 15, 512);
      st.proposals.lastCode = r.code; st.proposals.tail = r.out.trim().split('\n').slice(-3).map((x) => x.slice(0, 400)); return { started: true, code: r.code };
    } finally { st.proposals.busy = false; st.proposals.lastEnd = new Date().toISOString(); }
  }
  /* every promotion record on this computer (newest week first) */
  function records() { const out = []; try { for (const wk of readdirSync(join(E, 'runs')).sort().reverse()) for (const id of readdirSync(join(E, 'runs', wk))) { const f = join(E, 'runs', wk, id, 'promotion.json'); const P = readJson(f, null); if (P) out.push({ rel: relative(dataDir, f).split(sep).join('/'), P }); } } catch (_) {} return out; }
  async function report() {
    const { X, P, Ptr } = await mods(); const S = readJson(join(E, 'state.json'), null); const days = (() => { try { return readdirSync(join(dataDir, 'agents', 'proposals')).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort(); } catch (_) { return []; } })();
    const R = records(); const apprAll = Ptr.readApprovals(dataDir), appr = apprAll.slice(-200);
    const ready = R.filter((r) => r.P.promote === true && !Ptr.approvedFor(apprAll, r.rel, r.P.at))   /* v91.17.283.24 J21: the one rule of exp_pointer.mjs (that record, at or after it was written) */
      .map((r) => ({ record: r.rel, id: r.P.id, title: r.P.title, week: r.P.week, variant: r.P.variant, headline: (r.P.evidence || {}).headline || [], pointer: r.P.pointer, approve: r.P.approve }));
    const rules = (() => { try { return readdirSync(join(E, 'rules')).filter((f) => /\.json$/.test(f)).map((f) => { const j = readJson(join(E, 'rules', f), {}); return { id: j.id, written: j.written, source: j.sourceRule && (j.sourceRule.file + ' ' + j.sourceRule.key) }; }); } catch (_) { return []; } })();
    return { rule: 'never promotes, never changes a served value: the owner approves a promotion record (loopback operator, typed confirmation, logged); the approval flips one data pointer and keeps the previous one',
      week: S, queue: readJson(join(E, 'queue.json'), null), costs: readJson(join(E, 'costs.json'), null), ready, rules, approvals: appr.slice(-20).reverse(),
      targets: Object.fromEntries(Ptr.TARGETS.map((t) => [t, Ptr.targetState(dataDir, t)])), due: { experiments: X.expDue(dataDir), proposals: P.proposalsDue(dataDir) }, budgetMin: budget(),
      proposals: days.length ? { day: days[days.length - 1].slice(0, 10), report: readJson(join(dataDir, 'agents', 'proposals', days[days.length - 1]), null) } : null, children: { exp: st.exp, proposals: st.proposals } };
  }
  /* approve / revert (the server's index.mjs passes who may act) */
  async function act(kind, body, ctx) {
    const { Ptr, B } = await mods(); const adm = h.adminDir ? h.adminDir() : null; const by = 'operator ' + (ctx.who || 'local'); const via = 'operator page (' + (ctx.remote || '?') + ')';
    if (!ctx.loopbackOperator) { Ptr.logRefusal(dataDir, adm, { action: kind, id: body && body.confirm || null, record: body && body.record || null, target: body && body.target || null, by: 'request from ' + (ctx.remote || '?') + (ctx.customer ? ' (customer view)' : ''), via: 'http', why: 'approve and revert are for the operator on this computer only (direct loopback request)' }); return { status: 403, body: { ok: false, error: 'loopback_operator_only' } }; }
    if (kind === 'approve') { const rel = String(body && body.record || ''); const f = resolve(dataDir, rel);
      if (!rel || !f.startsWith(resolve(E, 'runs') + sep) || !/promotion\.json$/.test(f) || !existsSync(f)) { Ptr.logRefusal(dataDir, adm, { action: 'approve', record: rel.slice(0, 200), by, via, why: 'not a promotion record of this computer' }); return { status: 422, body: { ok: false, error: 'not a promotion record' } }; }
      const r = Ptr.approve(f, { dataDir, adminDir: adm, by, via, confirm: body.confirm == null ? null : String(body.confirm), validate: { 'blend-weights': (j) => B.parseWeights(j) } });
      return { status: r.ok ? 200 : 409, body: r }; }
    const r = Ptr.revert(String(body && body.target || ''), { dataDir, adminDir: adm, by, via, confirm: body && body.confirm != null ? String(body.confirm) : null });
    return { status: r.ok ? 200 : 409, body: r };
  }
  /* the weekly proposals page: plain HTML from the server, no script (Approve is a form with a typed confirmation) */
  async function page() {
    const r = await report(); const W = r.week; const L = [];
    L.push('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NIGRAAN weekly proposals</title><style>body{font:14px/1.45 system-ui,Segoe UI,Arial,sans-serif;margin:0;background:#f6f7f9;color:#14202b}main{max-width:1100px;margin:0 auto;padding:16px}h1{font-size:22px}h2{font-size:17px;margin-top:26px;border-bottom:1px solid #d5dbe1;padding-bottom:4px}table{border-collapse:collapse;width:100%;background:#fff;margin:6px 0}td,th{border:1px solid #d5dbe1;padding:5px 7px;text-align:left;vertical-align:top}th{background:#eef1f4}.no{color:#8a1c1c;font-weight:600}.yes{color:#0b6b2e;font-weight:600}.m{color:#5b6773}code,pre{background:#eef1f4;padding:2px 4px;white-space:pre-wrap;word-break:break-word}form{background:#fff8e6;border:1px solid #e0c46c;padding:8px;margin:6px 0}input[type=text]{width:260px}@media (max-width:700px){td,th{font-size:12px}}</style></head><body><main>');
    L.push('<h1>Weekly proposals</h1><p class="m">' + esc(r.rule) + '. Numbers from the agents\' own files; no LLM.</p>');
    const PR = r.proposals && r.proposals.report;
    if (PR) { L.push('<h2>What the agents found · week ' + esc(PR.window.from) + ' to ' + esc(PR.window.to) + '</h2>');
      L.push(PR.found.incidents.length ? '<table><tr><th>Feed</th><th>Worst</th><th>From</th><th>To</th><th>Alerts</th></tr>' + PR.found.incidents.map((x) => '<tr><td>' + esc(x.label) + '</td><td>' + esc(x.worst) + '</td><td>' + esc(x.startPkt) + '</td><td>' + esc(x.endPkt || 'still open') + '</td><td>' + esc(x.alerts) + '</td></tr>').join('') + '</table>' : '<p>No feed went late or down.</p>');
      L.push('<p>Drift flags: ' + (PR.found.drift ? PR.found.drift.flags.length : 0) + '. Diagnosis items: ' + PR.found.diagnoses.length + '. Flood shadow days: ' + PR.found.flood.shadowDays + '.</p>');
      if (PR.owner.length) L.push('<h2>Items needing the owner</h2><ul>' + PR.owner.map((o) => '<li><b>' + esc(o.kind) + '</b> · ' + esc(o.text) + '</li>').join('') + '</ul>'); }
    else L.push('<p class="m">No weekly report written yet (Monday 08:00 PKT).</p>');
    L.push('<h2>Experiments' + (W ? ' · week of ' + esc(W.week) + ' · ' + esc(W.usedMin) + ' of ' + esc(W.budgetMin) + ' min used' : '') + '</h2>');
    if (!W) L.push('<p class="m">No run yet (Sunday 03:00 PKT).</p>');
    else L.push('<table><tr><th>Experiment</th><th>Status</th><th>Result</th><th>Compute</th></tr>' + W.results.map((x) => '<tr><td><b>' + esc(x.id) + '</b><br><span class="m">' + esc(x.title) + '</span></td><td>' + esc(x.status) + (x.mode === 'recorded' ? '<br><span class="m">rule applied to the recorded output ' + esc(x.recordedFrom) + '</span>' : '') + '</td><td>' + (x.status === 'done' ? (x.promote ? '<span class="yes">PROMOTE</span>' : '<span class="no">not promoted</span>') + '<br>' + (x.headline || []).slice(0, 5).map((hh) => esc(hh.label) + ': ' + esc(hh.value) + (hh.ci ? ' [' + esc(hh.ci[0]) + ', ' + esc(hh.ci[1]) + ']' : '')).join('<br>') + (x.reasons && x.reasons.length ? '<br><span class="m">' + esc(x.reasons.join(' | ')) + '</span>' : '') : esc(x.why || '')) + '</td><td>' + (x.cost && x.cost.lastWallMin != null ? esc(x.cost.lastWallMin) + ' min, ' + esc(x.cost.lastPeakMb) + ' MB' : x.cost && x.cost.estimateMin ? '~' + esc(x.cost.estimateMin) + ' min expected' : '-') + '</td></tr>').join('') + '</table>');
    L.push('<h2>Ready for approval</h2>');
    if (!r.ready.length) L.push('<p>None. Nothing served changes.</p>');
    for (const p of r.ready) L.push('<form method="post" action="/api/ops/experiments/approve"><b>' + esc(p.id) + '</b> · ' + esc(p.title) + '<br>Changes ' + esc(p.pointer.file) + ' (' + esc(p.pointer.what) + ') from ' + esc(p.pointer.fromVersion) + '.<br>Command on this computer' + (p.approve && p.approve.platform ? ' (' + esc(p.approve.platform === 'windows' ? 'Windows' : 'Linux') + ')' : '') + ':<pre>' + esc(((p.approve && p.approve.command) || []).join('\n')) + '</pre><input type="hidden" name="record" value="' + esc(p.record) + '"><label>Type <b>' + esc(p.id) + '</b> to approve: <input type="text" name="confirm" autocomplete="off" required></label> <button type="submit">Approve</button></form>');
    L.push('<h2>Data pointers now</h2><table><tr><th>Target</th><th>Holds</th><th>Previous</th><th>Revert</th></tr>' + Object.entries(r.targets).map(([t, s]) => '<tr><td>' + esc(t) + '</td><td>' + esc(s && (s.version || s.file)) + '</td><td>' + esc(s && s.previous ? s.previous.version || s.previous.file : '-') + '</td><td>' + (s && s.previous ? '<form method="post" action="/api/ops/experiments/revert"><input type="hidden" name="target" value="' + esc(t) + '"><label>Type <b>' + esc(t) + '</b>: <input type="text" name="confirm" autocomplete="off" required></label> <button type="submit">Revert</button></form>' : '-') + '</td></tr>').join('') + '</table>');
    L.push('<h2>Approvals log</h2>' + (r.approvals.length ? '<ul>' + r.approvals.map((a) => '<li>' + esc(pktText(a.at)) + ' · ' + esc(a.action) + ' ' + esc(a.id || a.target || '') + ': <b>' + esc(a.result) + '</b>' + (a.why ? ' (' + esc(a.why) + ')' : '') + ' · ' + esc(a.by) + '</li>').join('') + '</ul>' : '<p>None.</p>'));
    L.push('</main></body></html>'); return L.join('\n');
  }
  if (h.schedule !== false && on()) {
    schedule(app, 'agentExperiments', 60 * 60e3, () => runExp().then((r) => { if (r && r.code && r.code !== 5) throw new Error('experiments.mjs exited ' + r.code + ': ' + ((st.exp.tail || []).slice(-1)[0] || '')); }), { firstMs: 11 * 60e3, heavy: 'long', label: 'Agent: experimentation (child process, weekly Sunday 03:00 PKT, ' + budget() + ' min budget; never promotes)' });
    schedule(app, 'agentProposals', 60 * 60e3, () => runProposals().then((r) => { if (r && r.code && r.code !== 5) throw new Error('proposals.mjs exited ' + r.code + ': ' + ((st.proposals.tail || []).slice(-1)[0] || '')); }), { firstMs: 13 * 60e3, label: 'Agent: weekly proposals report (child process, Monday 08:00 PKT)' });
  }
  return { runExp, runProposals, report, act, page };
}
