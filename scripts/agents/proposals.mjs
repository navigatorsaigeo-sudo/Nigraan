/* == v91.17.283.10 . AGENT 7: THE WEEKLY PROPOSALS REPORT (Monday from 08:00 PKT) ===================================================
   One report of the past Pakistan week (Monday 00:00 to Sunday 24:00 PKT), built from what the agents wrote. Numbers come from code; the
   text is a fixed template; no LLM is used. It is written twice:
     data/agents/proposals/<Monday>.json      the operator page (Evidence & Methods > Health and skill > Experiments and proposals,
                                              and GET /api/ops/experiments/page) reads it
     _admin\proposals_<Monday>.md             a plain ASCII file for the owner (CRLF line ends), or NIGRAAN_AGENTS_ADMIN_DIR
   Sections: 1 what the agents found (feed incidents, verification drift, diagnoses, flood shadow); 2 experiments run, with results;
   3 proposals ready for approval, with the exact approve command and the button; 4 items needing the owner (sensor checks, data
   requests, feeds still down, experiments refused or waiting); 5 approvals and reverts this week.
   Reads only data/agents/** and writes only the two files above. No network code.
   usage: node scripts/agents/proposals.mjs --app <nigraan-local> [--data <dir>] [--day YYYY-MM-DD (the Monday)] [--admin <dir>|-] */
import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { args, readJson, writeJsonAtomic, pktDay, pktText, addDays, dayStartMs, takeLock, agentLog, adminDir as adminDirOf } from './lib.mjs';
import { readDiagnoses, weekKey } from './experiments.mjs';
import { approvedFor } from './exp_pointer.mjs';
import { safeId } from './exp_registry.mjs';

export const PROPOSALS_AT_PKT_MIN = 8 * 60;   /* Monday 08:00 PKT */
/* the Monday of the PKT week that holds nowMs (the report day) */
export function reportDay(nowMs) { const d = pktDay(nowMs); const dow = new Date(d + 'T00:00:00Z').getUTCDay(); return addDays(d, -((dow + 6) % 7)); }
/* v91.17.283.23 · self-audit J10 · the report waits for the week's experiment run (up to 12 h after Monday 08:00 PKT); written without it,
   it is written again once, when that run completes (a laptop off on Sunday no longer leaves "no experimentation run this week") */
export const PROPOSALS_WAIT_H = 12;
const expDoneFor = (dataDir, wk) => { const st = readJson(join(dataDir, 'agents', 'experiments', 'state.json'), null); return !!(st && st.week === wk && st.complete); };
export function proposalsDue(dataDir, nowMs = Date.now()) {
  const day = reportDay(nowMs); const start = dayStartMs(day) + PROPOSALS_AT_PKT_MIN * 60e3; const wk = weekKey(dayStartMs(day) + 12 * 3600e3), done = expDoneFor(dataDir, wk);
  const f = join(dataDir, 'agents', 'proposals', day + '.json');
  if (existsSync(f)) { const R = readJson(f, null); if (R && R.expComplete === false && done) return { due: true, day, rebuild: true, why: 'the week\u2019s experiment run has completed: report for ' + day + ' written again' };
    return { due: false, day, why: 'written for ' + day }; }
  if (nowMs < start) return { due: false, day, why: 'waits for Monday 08:00 PKT (' + day + ')' };
  if (!done && nowMs < start + PROPOSALS_WAIT_H * 3600e3) return { due: false, day, why: 'waits for the experiment run of the week of ' + wk + ' (until ' + PROPOSALS_WAIT_H + ' h after Monday 08:00 PKT)' };
  return { due: true, day, why: 'weekly report for ' + day };
}
const lines = (f) => { try { return readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean); } catch (_) { return []; } };
const fmt = (x, d = 3) => x == null || x === '' ? '-' : typeof x === 'number' ? String(Math.round(x * 10 ** d) / 10 ** d) : String(x);
const ci = (c) => Array.isArray(c) && c.length === 2 ? ' [' + fmt(c[0]) + ', ' + fmt(c[1]) + ']' : '';
const durText = (min) => min == null ? 'ongoing' : min < 1 ? 'under one check (10 min)' : min < 90 ? Math.round(min) + ' min' : (Math.round(min / 6) / 10) + ' h';

export function buildReport(o) {
  const { dataDir, day } = o; const A = join(dataDir, 'agents'); const from = addDays(day, -7), to = addDays(day, -1);
  const t0 = dayStartMs(from), t1 = dayStartMs(day); const inW = (iso) => { const t = Date.parse(iso || ''); return t >= t0 && t < t1; };
  /* 1a feed incidents */
  const AL = lines(join(A, 'feed', 'alerts.jsonl')); const byFeed = {};
  for (const a of AL.sort((x, y) => Date.parse(x.at) - Date.parse(y.at))) { if (a.feed === 'provider_budget') continue; const F = byFeed[a.feed] || (byFeed[a.feed] = { feed: a.feed, label: a.label, open: null, incidents: [] });
    const t = Date.parse(a.at); if (t >= t1) continue;
    if ((a.to === 'late' || a.to === 'down') && !F.open) F.open = { start: a.since || a.at, worst: a.to, alerts: 1 };
    else if ((a.to === 'late' || a.to === 'down') && F.open) { F.open.alerts++; if (a.to === 'down') F.open.worst = 'down'; }
    else if (a.to === 'ok' && F.open) { F.incidents.push({ ...F.open, end: a.since || a.at }); F.open = null; } }
  const incidents = [];
  for (const F of Object.values(byFeed)) { for (const x of F.incidents.concat(F.open ? [{ ...F.open, end: null }] : [])) { const s = Date.parse(x.start), e = x.end ? Date.parse(x.end) : null;
      if ((e == null || e >= t0) && s < t1) incidents.push({ feed: F.feed, label: F.label, worst: x.worst, startPkt: pktText(s), endPkt: e ? pktText(Math.max(s, e)) : null, minutes: e ? Math.max(0, (e - s) / 6e4) : null, alerts: x.alerts }); } }   /* the first update after the gap can predate the late mark by less than one check: length 0 */
  incidents.sort((a, b) => (b.minutes ?? 1e12) - (a.minutes ?? 1e12));
  const budget = AL.filter((a) => a.feed === 'provider_budget' && inW(a.at)).map((a) => ({ atPkt: pktText(Date.parse(a.at)), status: a.to, text: a.detail }));
  const feedNow = readJson(join(A, 'feed', 'state.json'), null); const downNow = feedNow ? Object.entries(feedNow.feeds || {}).filter(([, f]) => f.status === 'down' || f.status === 'late').map(([k, f]) => ({ feed: k, status: f.status, since: f.since ? pktText(Date.parse(f.since)) : null, why: f.why || f.detail || null })) : [];
  /* 1b verification drift */
  const V = readJson(join(A, 'verify', 'summary.json'), null); const ledgerDays = lines(join(A, 'verify', 'ledger.jsonl')).map((r) => r.day).filter((d) => d >= from && d <= to);
  const drift = V && V.ready ? { window: V.window || null, flags: (V.drift || []).map((f) => ({ worse: !!f.worse, text: f.text })), family: V.driftFamily || null, assessed: !!V.driftAssessed } : null;
  /* 1c diagnoses. v91.17.283.24 · self-audit J11 · one entry per item identity (the diagnostic agent's id: kind, where and responsible),
     the newest day's text, with the days it was found: the daily diagnoses repeat a standing item, which before was listed (and given
     to the owner) up to 7 times a week */
  const diagAll = readDiagnoses(dataDir, from, to); const byId = new Map();
  for (const d of diagAll.slice().sort((a, b) => b.day.localeCompare(a.day))) { const e = byId.get(d.id); if (e) { e.days.push(d.day); continue; } byId.set(d.id, { ...d, days: [d.day] }); }
  const diag = [...byId.values()].map((d) => ({ ...d, days: d.days.sort() }));
  /* 1d flood shadow */
  const shadowDays = (() => { try { return readdirSync(join(A, 'flood', 'shadow')).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).filter((d) => d >= from && d <= to); } catch (_) { return []; } })();
  const floodScores = lines(join(A, 'flood', 'scores.jsonl')).filter((s) => inW(s.at));
  /* 2 experiments */
  const E = join(A, 'experiments'); const weeks = (() => { try { return readdirSync(join(E, 'weeks')).filter((f) => /\.json$/.test(f)).map((f) => readJson(join(E, 'weeks', f), null)).filter(Boolean); } catch (_) { return []; } })();
  const runs = weeks.filter((w) => inW(w.at) || (w.week >= from && w.week <= to)).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const lastRun = runs.length ? runs[runs.length - 1] : null;
  /* 3 proposals ready: newest promotion record per experiment with promote true, not approved */
  const appr = lines(join(E, 'approvals.jsonl'));
  const recs = []; try { for (const wk of readdirSync(join(E, 'runs')).sort()) for (const id of readdirSync(join(E, 'runs', wk))) { const P = readJson(join(E, 'runs', wk, id, 'promotion.json'), null); if (P) recs.push(P); } } catch (_) {}
  const newest = {}; for (const P of recs) if (!newest[P.id] || P.week >= newest[P.id].week) newest[P.id] = P;
  const ready = Object.values(newest).filter((P) => P.promote === true && !approvedFor(appr, P.week + '/' + safeId(P.id) + '/promotion.json', P.at));   /* J21: the one rule (exp_pointer.mjs) */
  /* 4 owner items: one per identity (J11: kind + the diagnosis item id, the experiment id, the feed); the diagnosis items say on which days */
  const owner = []; const seenO = new Set(); const addO = (key, o) => { if (seenO.has(key)) return; seenO.add(key); owner.push(o); };
  const onDays = (d) => d.days.length > 1 ? ' (found on ' + d.days.length + ' days, ' + d.days[0] + ' to ' + d.days[d.days.length - 1] + ')' : '';
  for (const d of diag) { const k = d.test.kind.toLowerCase(); const from = 'agents/diagnose/' + d.days[d.days.length - 1] + '.json ' + d.id;
    if (/sensor|site|visit|check/.test(k)) addO('diag|' + d.id, { kind: 'sensor check', text: (d.responsible && d.responsible.station ? d.responsible.station + ': ' : '') + (d.test.text || d.flag) + onDays(d), from });
    else if (/data|request/.test(k)) addO('diag|' + d.id, { kind: 'data request', text: (d.test.text || d.flag) + onDays(d), from });
    else if (/unregistered/.test(k)) addO('diag|' + d.id, { kind: 'new experiment to register', text: d.flag + (d.test.text ? ' - ' + d.test.text : '') + onDays(d), from }); }
  const Q = readJson(join(E, 'queue.json'), { items: [] }) || { items: [] };
  for (const q of Q.items || []) if (q.owner) addO('exp|' + q.id, { kind: 'data request', text: q.id + ': ' + q.owner, from: 'experiments queue ' + (Q.week || '') });
  for (const r of (lastRun && lastRun.results) || []) if (r.status === 'refused') addO('refused|' + r.id, { kind: 'experiment refused', text: r.id + ': ' + r.why, from: 'experiments ' + lastRun.week });
  for (const f of downNow) if (f.status === 'down') addO('feed|' + f.feed, { kind: 'feed down', text: f.feed + ' down since ' + (f.since || '?') + (f.why ? ' (' + f.why + ')' : ''), from: 'feed state ' + (feedNow ? pktText(Date.parse(feedNow.at)) : '') });
  /* 5 approvals */
  const approvals = appr.filter((x) => inW(x.at)).map((x) => ({ atPkt: pktText(Date.parse(x.at)), action: x.action, result: x.result, id: x.id || null, target: x.target || null, by: x.by, via: x.via, why: x.why || null, to: x.to || null }));
  return { schema: 'agn.proposals.v1', day, window: { from, to }, built: new Date().toISOString(), method: 'numbers from the agents\' own files; fixed template text; no LLM',
    found: { incidents, budget, feedsNotOk: downNow, drift, verifiedDays: ledgerDays.length, diagnoses: diag, flood: { shadowDays: shadowDays.length, scores: floodScores } },
    experiments: lastRun ? { week: lastRun.week, at: lastRun.at, budgetMin: lastRun.budgetMin, usedMin: lastRun.usedMin, results: lastRun.results, queue: lastRun.queue } : null,
    ready: ready.map((P) => ({ id: P.id, title: P.title, week: P.week, variant: P.variant, headline: (P.evidence || {}).headline || [], pointer: P.pointer, approve: P.approve })), owner, approvals };
}

/* -- the plain ASCII file -- */
const ASCII = [[/\s?°\s?C/g, ' C'], [/°/g, ' deg'], [/[–—−]/g, '-'], [/×/g, 'x'], [/≥/g, '>='], [/≤/g, '<='], [/[‘’]/g, "'"], [/[“”]/g, '"'], [/…/g, '...'], [/·/g, '-'], [/²/g, '2'], [/³/g, '3'], [/μ|µ/g, 'u'], [/→/g, '->']];
export const toAscii = (s) => { let t = String(s); for (const [a, b] of ASCII) t = t.replace(a, b); return t.replace(/[^\x09\x0a\x0d\x20-\x7e]/g, '?'); };
export function renderMd(R) {
  const L = []; const p = (s = '') => L.push(s);
  p('# NIGRAAN weekly proposals - ' + R.day); p();
  p('Week: ' + R.window.from + ' to ' + R.window.to + ' (PKT). Built ' + pktText(Date.parse(R.built)) + '. ' + R.method + '.'); p();
  p('## 1. What the agents found'); p();
  p('### Feed incidents (late or down, from each feed\'s own update gaps)'); p();
  if (!R.found.incidents.length) p('No feed went late or down this week.');
  else { p('| Feed | Worst | From | To | Length | Alerts |'); p('|---|---|---|---|---|---|'); for (const x of R.found.incidents) p('| ' + x.label + ' | ' + x.worst + ' | ' + x.startPkt + ' | ' + (x.endPkt || 'still open') + ' | ' + durText(x.minutes) + ' | ' + x.alerts + ' |'); }
  if (R.found.budget.length) { p(); p('Forecast provider call budget: ' + R.found.budget.map((b) => b.atPkt + ' ' + b.status + (b.text ? ' (' + b.text + ')' : '')).join('; ') + '.'); }
  p(); p('### Verification drift'); p();
  p('Days scored this week: ' + R.found.verifiedDays + '.');
  if (!R.found.drift) p('No verification summary yet.');
  else if (!R.found.drift.flags.length) p('No drift flag' + (R.found.drift.family ? ' (' + R.found.drift.family.tests + ' cells tested; ' + R.found.drift.family.rule + ').' : '.'));
  else { p((R.found.drift.family ? R.found.drift.family.flagged + ' of ' + R.found.drift.family.tests + ' cells flagged (' + R.found.drift.family.rule + '):' : 'Flags:')); for (const f of R.found.drift.flags) p('- ' + (f.worse ? 'Worse' : 'Better') + ': ' + f.text); }
  p(); p('### Diagnoses'); p();
  if (!R.found.diagnoses.length) p('No diagnosis file this week (data/agents/diagnose/).');
  else { const DG = R.found.diagnoses.slice().sort((a, b) => b.day.localeCompare(a.day) || (a.rank || 1e9) - (b.rank || 1e9)); const cut = (t, n = 220) => String(t || '').length > n ? String(t).slice(0, n - 3) + '...' : String(t || '');
    if (DG.length > 25) p(DG.length + ' items; the 25 strongest (the diagnostic agent\'s rank) are listed, all are in data/agents/diagnose/.');
    for (const d of DG.slice(0, 25)) p('- ' + d.day + (d.days && d.days.length > 1 ? ' (on ' + d.days.length + ' days)' : '') + ' #' + (d.rank || '-') + ' ' + d.id + ': ' + cut(d.flag) + (d.responsible && (d.responsible.station || d.responsible.step) ? ' Responsible: ' + [d.responsible.step, d.responsible.station].filter(Boolean).join(', ') + '.' : '') + (d.size && d.size.value != null ? ' Size ' + fmt(d.size.value) + ' ' + (d.size.unit || '') + ci(d.size.ci95) + '.' : '') + (d.test && (d.test.text || d.test.kind) ? ' Next test: ' + cut(d.test.text || d.test.kind, 200) + (d.test.candidate ? ' (experiment ' + d.test.candidate + ')' : '') + '.' : '')); }
  p(); p('### Flood shadow'); p(); p('Shadow days written: ' + R.found.flood.shadowDays + ' of 7. Flood truth scores this week: ' + R.found.flood.scores.length + '. Nothing from the flood shadow is served.');
  p(); p('## 2. Experiments run'); p();
  const X = R.experiments;
  if (!X) p('No experimentation run this week.');
  else { p('Run of the week of ' + X.week + ' (' + pktText(Date.parse(X.at)) + '): ' + X.usedMin + ' of ' + X.budgetMin + ' min of compute used.'); p();
    for (const r of X.results) { p('**' + r.id + '** - ' + (r.title || '')); p();
      p('- Status: ' + r.status + (r.mode === 'recorded' ? ' (rule applied to the recorded output ' + r.recordedFrom + '; not re-run here)' : '') + (r.status === 'done' ? '. Rule ' + (r.rulePassed ? 'PASSED' + (r.variant ? ' (' + r.variant + ')' : '') : 'not met') + '. Promote: ' + (r.promote ? 'YES' : 'no') + '.' : r.why ? '. ' + r.why : ''));
      if (r.cost && (r.cost.lastWallMin != null)) p('- Compute: ' + r.cost.lastWallMin + ' min wall, peak memory ' + (r.cost.lastPeakMb != null ? r.cost.lastPeakMb + ' MB' : 'not measured') + (r.cost.host ? ' on ' + r.cost.host : '') + '.');
      else if (r.cost && r.cost.estimateMin) p('- Compute: about ' + r.cost.estimateMin + ' min expected' + (r.cost.note ? ' (' + r.cost.note + ')' : '') + '.');
      for (const h of (r.headline || []).slice(0, 8)) p('- ' + h.label + ': ' + fmt(h.value) + ci(h.ci) + (h.unit ? ' ' + h.unit : '') + (h.n ? ' (n ' + h.n + ')' : ''));
      if (r.strata && r.strata.length) p('- Strata (floor): ' + r.strata.map((s) => s.name + ' ' + fmt(s.lo) + (s.ok ? ' ok' : ' WORSE')).join('; '));
      if (r.reasons && r.reasons.length) p('- Why not promoted: ' + r.reasons.join(' | '));
      p(); }
    if (X.queue && X.queue.length) { p('Queued for next week: ' + X.queue.map((q) => q.id + ' (' + q.why + ')').join('; ') + '.'); p(); } }
  p('## 3. Proposals ready for approval'); p();
  if (!R.ready.length) p('None. Nothing passed its pre-registered rule with every condition (no stratum worse, full served chain tested, a data pointer). Nothing served changes.');
  else for (const P of R.ready) { p('**' + P.id + '** (' + P.week + ', ' + (P.variant || '') + '): ' + P.title); p();
    for (const h of P.headline.slice(0, 4)) p('- ' + h.label + ': ' + fmt(h.value) + ci(h.ci));
    p('- Changes: ' + P.pointer.file + ' (' + P.pointer.what + ') from ' + (P.pointer.fromVersion || '-') + ' to ' + ((P.pointer.wouldBecome && (P.pointer.wouldBecome.version || P.pointer.wouldBecome.file)) || '-') + '.');
    /* C-1 (v91.17.283.24): both forms with their own cd line; a record written before carries the Windows form as command */
    const cmdW = P.approve.commandWin || (P.approve.platform !== 'linux' ? P.approve.command : null), revW = P.approve.revertWin || (P.approve.platform !== 'linux' ? P.approve.revert : null);
    if (cmdW) { p('- Approve (Windows, the laptop):'); p(); p('```'); for (const c of cmdW) p(c); p('```'); p(); }
    if (P.approve.commandLinux) { p('- Approve (Linux, the DGX):'); p(); p('```'); for (const c of P.approve.commandLinux) p(c); p('```'); p(); }
    p('- Or: ' + P.approve.button + '.');
    if (revW) { p('- Undo (Windows):'); p(); p('```'); for (const c of revW) p(c); p('```'); p(); }
    if (P.approve.revertLinux) { p('- Undo (Linux):'); p(); p('```'); for (const c of P.approve.revertLinux) p(c); p('```'); p(); } }
  p(); p('## 4. Items needing the owner'); p();
  if (!R.owner.length) p('None.'); else for (const o of R.owner) p('- [' + o.kind + '] ' + (String(o.text).length > 240 ? String(o.text).slice(0, 237) + '...' : o.text) + ' (' + o.from + ')');
  p(); p('## 5. Approvals and reverts this week'); p();
  if (!R.approvals.length) p('None.'); else for (const a of R.approvals) p('- ' + a.atPkt + ' ' + a.action + ' ' + (a.id || a.target || '') + ': ' + a.result + (a.why ? ' (' + a.why + ')' : '') + ' by ' + a.by + ' via ' + a.via);
  p();
  return toAscii(L.join('\r\n'));
}

export function writeReport(o) {
  const R = buildReport(o); R.expComplete = expDoneFor(o.dataDir, weekKey(dayStartMs(o.day) + 12 * 3600e3)); const md = renderMd(R);
  writeJsonAtomic(join(o.dataDir, 'agents', 'proposals', o.day + '.json'), R);
  writeFileSync(join(o.dataDir, 'agents', 'proposals', o.day + '.md'), md);
  let adminFile = null; if (o.adminDir) { try { if (existsSync(o.adminDir)) { adminFile = join(o.adminDir, 'proposals_' + o.day + '.md'); writeFileSync(adminFile, md); } } catch (_) { adminFile = null; } }
  return { report: R, md, adminFile };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const A = args(); const app = A.app || join(dirname(fileURLToPath(import.meta.url)), '..', '..'); const dataDir = A.data || join(app, 'data');
  const adm = A.admin === '-' || A.admin === true ? null : (A.admin || adminDirOf(app));
  const rel = takeLock(join(dataDir, 'agents', 'proposals.lock'), 20 * 60e3); if (!rel) { console.log('another proposals run is going'); process.exit(5); }
  try { const day = A.day || reportDay(Date.now()); const r = writeReport({ dataDir, day, adminDir: adm });
    const line = 'weekly proposals ' + day + ': ' + r.report.found.incidents.length + ' feed incident(s), ' + (r.report.found.drift ? r.report.found.drift.flags.length : 0) + ' drift flag(s), ' + r.report.found.diagnoses.length + ' diagnosis item(s), ' + (r.report.experiments ? r.report.experiments.results.length : 0) + ' experiment(s), ' + r.report.ready.length + ' ready for approval, ' + r.report.owner.length + ' owner item(s)' + (r.adminFile ? '; ' + 'proposals_' + day + '.md written to _admin' : '');
    agentLog(dataDir, 'proposals', line, {}, Date.now()); console.log(line);
  } finally { rel(); }
}
