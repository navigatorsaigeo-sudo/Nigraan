#!/usr/bin/env node
/* v91.17.46 · THE ANALYST'S BENCHMARK ═══════════════════════════════════════════════════════════
   About 150 questions built from the unit list and a settlement list, each with what the evidence
   pack must contain (grounding) and, when an LLM is configured, what the answer must and must not
   do (answering). Two modes:

     grounding   GET /api/ai/evidence for every question: the place resolved as intended, the fact
                 groups the question needs present, the compact pack under the size budget. No model
                 needed; runs on any install in about a minute.
     answering   POST /api/ai/chat for a sample of the questions (--answer N, default 20): the reply
                 arrives, carries a "Based on:" line, names no vendor, invents no hazard class or
                 number (firewall removals are counted, not hidden), says "not available" for an
                 unresolvable place and rolls up to the tehsil for a settlement.

   The score is per property, not one number: a build that grounds 100% and answers 70% is described
   as that. Results go to data/ai-bench.json and are printed.

   Usage: node scripts/ai-bench.mjs [--base http://127.0.0.1:8787] [--answer 20] [--seed 7]
                                    [--model <name>] [--qa <token>|auto] [--out <file>] [--health-wait 90]

   v91.17.71 · A/B OF TWO MODELS ON ONE QUESTION SET. The question set and the answered sample depend only on --seed, so two
   runs with the same seed ask the same questions. --model <name> is sent as body.model on every POST /api/ai/chat; the
   server honours it ONLY for internal QA on the same machine: loopback AND --qa <token> sent as x-agn-qa (the machine's
   own data/token-secret; "--qa auto" reads it). Without both the server answers with its configured model, and this
   script says so. --out <file> (default data/ai-bench.json) keeps the two runs apart, e.g.
     node scripts/ai-bench.mjs --seed 7 --answer 40 --qa auto --model qwen3:1.7b --out data/ai-bench-qwen.json
     node scripts/ai-bench.mjs --seed 7 --answer 40 --qa auto --model gemma3:12b --out data/ai-bench-gemma.json
   Every answer records its latency; the summary gives the median and p90 in seconds, and each answer is checked for
   supplier names (data/source-labels.json forbiddenInCustomerOutput). */
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:8787'); const ANSWER = Number(arg('--answer', '20')); const SEED = Number(arg('--seed', '7'));
const MODEL = arg('--model', null);
const QA = (() => { const v = arg('--qa', null); if (v !== 'auto') return v; try { return readFileSync(join(ROOT, 'data', 'token-secret'), 'utf8').trim(); } catch { return null; } })();
const OUT = arg('--out', join(ROOT, 'data', 'ai-bench.json'));
const FORBID = (() => { try { const L = JSON.parse(readFileSync(join(ROOT, 'data', 'source-labels.json'), 'utf8')).forbiddenInCustomerOutput || []; return L.length ? new RegExp('(?<![\\p{L}\\p{N}_])(' + L.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\p{L}\\p{N}_])', 'iu') : null; } catch { return null; } })();
const quantile = (a, q) => { const v = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); if (!v.length) return null; const p = (v.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return v[lo] + (v[hi] - v[lo]) * (p - lo); };
let s = SEED; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

const units = JSON.parse(readFileSync(join(ROOT, 'server', 'contract', 'units.json'), 'utf8'));
const live = units.filter(u => !u.disputed); const disputed = units.filter(u => u.disputed);
const mountain = live.filter(u => (u.elevM || 0) >= 1500); const plains = live.filter(u => (u.elevM || 0) < 300);
const SETTLEMENTS = ['Kalam', 'Naran', 'Hunza', 'Gilgit', 'Skardu', 'Chitral', 'Murree', 'Gwadar', 'Sukkur', 'Bahawalpur', 'Nowshera', 'Sialkot', 'Hyderabad', 'Faisalabad', 'Quetta', 'Mardan', 'Jhelum', 'Thatta', 'Khaplu', 'Ghizer'];
const HAZ = ['heat', 'flood', 'drought', 'wind', 'landslide', 'GLOF', 'cold', 'smog'];

const Q = [];
const add = (kind, prompt, want) => Q.push({ id: 'q' + String(Q.length + 1).padStart(3, '0'), kind, prompt, want });
/* 1 · a tehsil by name, one hazard (40) */
for (let i = 0; i < 40; i++) { const u = pick(live), h = pick(HAZ); add('unit-hazard', `${h} risk in ${u.tehsil} this week`, { unit: u.tehsil, keys: ['askedUnits'], hazard: h }); }
/* 2 · a settlement (gazetteer point) (20) */
for (const p of SETTLEMENTS) add('settlement', `what is the weather like in ${p} tomorrow`, { place: p, keysAny: ['askedPlace', 'askedUnits'] });
/* 3 · what to do (20): the suggestion library */
for (let i = 0; i < 20; i++) { const u = pick(live); add('what-to-do', `what should we prepare for at our site in ${u.tehsil}`, { unit: u.tehsil, keys: ['askedUnits'], suggestions: true }); }
/* 4 · comparisons (15) */
for (let i = 0; i < 15; i++) { const a = pick(live), b = pick(live); if (a.unitId === b.unitId) continue; add('compare', `compare ${pick(HAZ)} in ${a.tehsil} and ${b.tehsil}`, { units: [a.tehsil, b.tehsil], keys: ['askedUnits'], multi: true }); }
/* 5 · mountain products (15): wind, rain days, freezing level, GLOF */
for (let i = 0; i < 15; i++) { const u = pick(mountain); add('mountain', pick([`will gusts exceed 50 km/h in ${u.tehsil}`, `how reliable is the rain forecast for ${u.tehsil}`, `freezing level over ${u.tehsil} this week`, `glacial lake outburst risk for ${u.tehsil}`]), { unit: u.tehsil, keys: ['askedUnits'], stationLakeNotes: true }); }
/* 6 · drought and wetness on the plains (10) */
for (let i = 0; i < 10; i++) { const u = pick(plains); add('plains', pick([`drought status in ${u.tehsil}`, `how wet is the catchment at ${u.tehsil}`, `is the ground saturated in ${u.tehsil}`]), { unit: u.tehsil, keys: ['askedUnits'], drought: true }); }
/* 7 · unresolvable and disputed (10) */
for (const p of ['Xyzzytown', 'Springfield', 'Atlantis', 'Nowhere Kalan', 'Qwertyabad']) add('unresolvable', `flood risk in ${p} tomorrow`, { keys: ['askedPlaceUnresolved'] });
for (let i = 0; i < 5 && disputed.length; i++) { const u = pick(disputed); add('disputed', `heat in ${u.tehsil}`, { disputedOrUnresolved: true }); }
/* 8 · numbers that must not be invented (10): questions that invite a figure the facts do not hold */
for (let i = 0; i < 10; i++) { const u = pick(live); add('no-invention', pick([`what is the probability of a flood in ${u.tehsil} this year`, `what is the return period of last week's rain in ${u.tehsil}`, `how much money would a flood cost a factory in ${u.tehsil}`, `give me a damage ratio for a warehouse in ${u.tehsil}`]), { unit: u.tehsil, keys: ['askedUnits'], forbid: /\b(1 in \d+|return period of \d+|\d+\s*%\s*(probability|chance of a flood)|PKR\s*\d|Rs\.?\s*\d|USD\s*\d|\$\s*\d)/i }); }
/* 9 · vendor secrecy (5) */
for (let i = 0; i < 5; i++) { const u = pick(live); add('vendor', pick([`which weather model do you use for ${u.tehsil}`, `where does the forecast for ${u.tehsil} come from`, `who provides your data for ${u.tehsil}`]), { unit: u.tehsil, keys: ['askedUnits'], forbid: /open-?meteo/i }); }

const get = async (p) => { const r = await fetch(BASE + p); const t = await r.text(); try { return { status: r.status, json: JSON.parse(t) }; } catch { return { status: r.status, json: null, text: t }; } };
const post = async (p, body) => { const r = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(QA ? { 'x-agn-qa': QA } : {}) }, body: JSON.stringify(MODEL ? { ...body, model: MODEL } : body) }); const t = await r.text(); try { return { status: r.status, json: JSON.parse(t) }; } catch { return { status: r.status, json: null, text: t }; } };
const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function grounding(q) {
  const e = (await get('/api/ai/evidence?prompt=' + encodeURIComponent(q.prompt) + '&compact=1')).json;
  if (!e || !e.facts) return { ok: false, why: 'no evidence' };
  const f = e.facts, keys = Object.keys(f); const miss = (q.want.keys || []).filter(k => keys.indexOf(k) < 0);
  const out = { ok: true, keys, bytes: e.bytes, compactBytes: e.compactBytes, checks: {} };
  out.checks.keys = miss.length === 0 && (!q.want.keysAny || q.want.keysAny.some(k => keys.indexOf(k) >= 0)); if (!out.checks.keys) out.why = 'missing ' + (miss.length ? miss.join(',') : 'one of ' + q.want.keysAny.join('/'));
  const first = (f.askedUnits && f.askedUnits[0]) || f.askedPlace || null;
  if (q.want.unit) { out.checks.place = !!(first && (norm(first.name) === norm(q.want.unit) || norm(first.tehsil) === norm(q.want.unit) || (f.askedUnits || []).some(u => norm(u.name) === norm(q.want.unit)))); if (!out.checks.place) out.why = 'resolved to ' + (first ? first.name : 'nothing'); }
  if (q.want.place) { out.checks.place = !!(f.askedPlace && norm(f.askedPlace.name).indexOf(norm(q.want.place).split(' ')[0]) >= 0) || !!(f.askedUnits && f.askedUnits.length); }
  if (q.want.multi) out.checks.multi = (f.askedUnits || []).length >= 2 || !!(f.askedPlacesAlsoNamed && f.askedPlacesAlsoNamed.length);
  if (q.want.suggestions) out.checks.suggestions = !!(first && first.suggestions && Array.isArray(first.suggestions.standing));
  /* v91.17.70/71 · the mountain-network notes are internal: a customer pack must NOT carry them (as harness check 46) */
  if (q.want.stationLakeNotes) out.checks.noStationLakeNotes = !(first && first.stationLakeNotes);
  if (FORBID) out.checks.noSupplierName = !FORBID.test(JSON.stringify(f));
  if (q.want.drought) out.checks.drought = !!(first && (first.drought || first.catchmentWetness));
  if (q.want.disputedOrUnresolved) out.checks.disputed = !!(f.askedPlaceUnresolved || (first && first.disputed) || (f.askedUnits && f.askedUnits.some(u => u.disputed)));
  out.checks.compactBudget = e.compactBytes <= 10000;   /* three same-named tehsils (Khanpur) with their suggestions reach 8.1 kB */
  out.ok = Object.values(out.checks).every(Boolean);
  return out;
}

async function answering(q) {
  const t0 = Date.now(); const r = await post('/api/ai/chat', { prompt: q.prompt, context: {} });
  const j = r.json || {}; const text = String(j.answer || ''); const out = { status: r.status, ms: Date.now() - t0, serverMs: j.ms != null ? j.ms : null, model: j.model || null, abModel: !!j.abModel, chars: text.length, removed: (j.firewall && j.firewall.removed) || 0, replacedByGrounded: !!(j.firewall && j.firewall.replacedByGrounded), checks: {} };
  if (r.status !== 200 || !text) { out.ok = false; out.why = (j.error || 'no answer') + (j.why ? ': ' + j.why : ''); return out; }
  out.checks.basedOn = /based on:/i.test(text);
  out.checks.noVendor = !/open-?meteo/i.test(text);
  if (FORBID) out.checks.noSupplierName = !FORBID.test(text);
  out.checks.noRemoval = out.removed === 0;
  if (q.want.forbid) out.checks.noInvention = !q.want.forbid.test(text);
  if (q.kind === 'unresolvable') out.checks.saysNotFound = /(could not find|not (found|available|in the dashboard)|no place|unable to find|not resolve)/i.test(text);
  if (q.kind === 'settlement') out.checks.namesPlace = norm(text).indexOf(norm(q.want.place).split(' ')[0]) >= 0;
  if (q.kind === 'what-to-do') out.checks.usesSuggestions = /(standing|watch|season|drain|pump|heat|rehears|checklist|inspect)/i.test(text);
  out.ok = Object.values(out.checks).every(Boolean); if (!out.ok) out.why = Object.entries(out.checks).filter(([, v]) => !v).map(([k]) => k).join(',');
  return out;
}

/* v91.17.75 · A SERVER RESTART NO LONGER ENDS THE RUN. MEASURED on the operator's machine (26 Sep 2026, 15:51:55): the
   server was stopped from outside a few seconds into the grounding phase; this script died on the first ECONNRESET
   ("fetch failed") with nothing written, and the second model's run died on ECONNREFUSED before the watchdog had the
   server back. Now a lost connection (reset, refused, socket closed) waits for /api/health (up to 90 s, every 2 s),
   records the gap (when, which question, the error, how long the server was away) and carries on with the NEXT
   question; the question that was in flight is recorded as lost, not scored as a model failure. If the server does not
   come back in 90 s the run stops cleanly with what it has. The --out file is rewritten after every answer (and after
   the grounding phase and every gap), marked partial until the run completes, so a run that is cut short still leaves
   its results. */
const GAPS = []; const HEALTH_WAIT_MS = Number(arg('--health-wait', '90')) * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errCode = (e) => String((e && e.cause && (e.cause.code || e.cause.name)) || (e && (e.code || e.name)) || (e && e.message) || e);
const lostConnection = (e) => /ECONNRESET|ECONNREFUSED|EPIPE|ECONNABORTED|UND_ERR_SOCKET|UND_ERR_CLOSED|UND_ERR_HEADERS_TIMEOUT|EHOSTUNREACH|ENETUNREACH/.test(errCode(e)) || /fetch failed|other side closed|socket hang up/i.test(String(e && e.message));
class StopRun extends Error {}
async function waitHealth(maxMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try { const r = await fetch(BASE + '/api/health', { signal: AbortSignal.timeout(3000) }); await r.arrayBuffer(); if (r.ok) return Date.now() - t0; } catch {}
    await sleep(2000);
  }
  return null;
}
async function guarded(phase, q, fn) {
  try { return await fn(); }
  catch (e) {
    if (!lostConnection(e)) throw e;
    const gap = { at: new Date().toISOString(), phase, id: q ? q.id : null, error: errCode(e) };
    console.log(`  server connection lost (${gap.error}) during ${phase}${q ? ' ' + q.id : ''}; waiting for /api/health (up to ${HEALTH_WAIT_MS / 1000} s)`);
    const back = await waitHealth(HEALTH_WAIT_MS);
    gap.backAfterS = back == null ? null : Math.round(back / 100) / 10; gap.back = back != null; GAPS.push(gap);
    if (back == null) { console.log(`  the server did not answer /api/health within ${HEALTH_WAIT_MS / 1000} s; stopping with partial results`); throw new StopRun('server did not come back'); }
    console.log(`  server back after ${gap.backAfterS} s; continuing with the next question`);
    return { lost: true, ok: false, why: 'server connection lost (' + gap.error + '); back after ' + gap.backAfterS + ' s', gap: GAPS.length - 1 };
  }
}

let st = {}; const G = []; let A = []; let stage = 'start';
function save(done) {
  const okSec = A.filter(a => a.status === 200).map(a => a.ms / 1000);
  const gok = G.filter(g => g.ok).length; const byKind = {}; for (const g of G) { byKind[g.kind] = byKind[g.kind] || { n: 0, ok: 0 }; byKind[g.kind].n++; if (g.ok) byKind[g.kind].ok++; }
  const summary = { seed: SEED, modelAsked: MODEL, modelsUsed: [...new Set(A.map(a => a.model).filter(Boolean))], abHonoured: A.some(a => a.abModel), answered: A.length, ok: A.filter(a => a.ok).length,
    lost: A.filter(a => a.lost).length, groundingLost: G.filter(g => g.lost).length, serverGaps: GAPS.length,
    latencyS: { median: quantile(okSec, 0.5), p90: quantile(okSec, 0.9), max: okSec.length ? Math.max(...okSec) : null, n: okSec.length },
    firewallRemovals: A.reduce((s, a) => s + (a.removed || 0), 0), replacedByGrounded: A.filter(a => a.replacedByGrounded).length,
    byCheck: (() => { const o = {}; for (const a of A) for (const [k, v] of Object.entries(a.checks || {})) { o[k] = o[k] || { pass: 0, n: 0 }; o[k].n++; if (v) o[k].pass++; } return o; })() };
  const out = { at: new Date().toISOString(), base: BASE, partial: !done, stage, status: st, questions: Q.length, summary, gaps: GAPS, grounding: { ok: gok, of: G.length, byKind, results: G }, answering: { ok: A.filter(a => a.ok).length, of: A.length, results: A } };
  try { writeFileSync(OUT + '.tmp', JSON.stringify(out, null, 1)); renameSync(OUT + '.tmp', OUT); if (done) console.log('wrote ' + OUT); } catch (e) { console.log('not written:', e.message); }
}

let exitCode = 0;
try {
  stage = 'status';
  for (let i = 0; i < 2; i++) { const r = await guarded('status', null, () => get('/api/ai/status')); if (!r.lost) { st = r.json || {}; break; } }
  console.log(`ai-bench · ${Q.length} questions · base ${BASE} · mode ${st.mode || '?'} ${st.provider || ''} ${st.model || ''}`);
  stage = 'grounding';
  for (const q of Q) {
    const r = await guarded('grounding', q, () => grounding(q));
    G.push({ id: q.id, kind: q.kind, prompt: q.prompt, ...r });
    if (!r.ok) console.log('  ground ' + (r.lost ? 'LOST' : 'FAIL'), q.id, q.kind, '·', q.prompt, '·', r.why || JSON.stringify(r.checks));
    if (r.lost) save(false);
  }
  const gok = G.filter(g => g.ok).length; const cb = G.filter(g => g.compactBytes).map(g => g.compactBytes);
  console.log(`grounding: ${gok}/${G.length} · compact pack median ${cb.length ? cb.sort((a, b) => a - b)[Math.floor(cb.length / 2)] : '?'} bytes, max ${cb.length ? Math.max(...cb) : '?'}${G.some(g => g.lost) ? ' · lost to server restarts ' + G.filter(g => g.lost).length : ''}`);
  const byKind = {}; for (const g of G) { byKind[g.kind] = byKind[g.kind] || { n: 0, ok: 0 }; byKind[g.kind].n++; if (g.ok) byKind[g.kind].ok++; }
  for (const [k, v] of Object.entries(byKind)) console.log(`  ${k.padEnd(14)} ${v.ok}/${v.n}`);
  stage = 'answering'; save(false);
  if (st.mode === 'llm' && ANSWER > 0) {
    const sample = []; const kinds = [...new Set(Q.map(q => q.kind))];
    while (sample.length < Math.min(ANSWER, Q.length)) { const k = kinds[sample.length % kinds.length]; const c = Q.filter(q => q.kind === k && sample.indexOf(q) < 0); if (c.length) sample.push(pick(c)); else if (sample.length >= Q.length) break; }
    for (const q of sample) {
      const t0 = Date.now(); const r = await guarded('answering', q, () => answering(q)); if (r.lost) r.ms = Date.now() - t0;
      A.push({ id: q.id, kind: q.kind, prompt: q.prompt, ...r });
      console.log(`  answer ${r.ok ? 'ok  ' : r.lost ? 'LOST' : 'FAIL'} ${q.id} ${q.kind.padEnd(13)} ${String(r.ms).padStart(6)} ms ${String(r.chars == null ? '-' : r.chars).padStart(5)} ch removed ${r.removed == null ? '-' : r.removed}${r.ok ? '' : ' · ' + r.why}`);
      save(false);
    }
    const aok = A.filter(a => a.ok).length; const sec = A.filter(a => a.status === 200).map(a => a.ms / 1000);
    const med = quantile(sec, 0.5), p90 = quantile(sec, 0.9);
    const used = [...new Set(A.map(a => a.model).filter(Boolean))];
    console.log(`answering: ${aok}/${A.length}${A.some(a => a.lost) ? ' (' + A.filter(a => a.lost).length + ' lost to server restarts)' : ''} · latency median ${med == null ? '?' : med.toFixed(1)} s, p90 ${p90 == null ? '?' : p90.toFixed(1)} s · firewall removals ${A.reduce((s, a) => s + (a.removed || 0), 0)} · replaced by the grounded reading ${A.filter(a => a.replacedByGrounded).length} · model ${used.join(', ') || '?'}`);
    if (MODEL && !A.some(a => a.abModel)) console.log(`  note: --model ${MODEL} was NOT honoured by the server (it needs loopback and a valid --qa token); the configured model answered`);
  } else console.log('answering: skipped (' + (st.mode === 'llm' ? '--answer 0' : 'no LLM configured: ai.key absent') + ')');
  stage = 'done';
} catch (e) {
  exitCode = 2; stage = stage + ' (stopped: ' + (e instanceof StopRun ? e.message : errCode(e)) + ')';
  if (!(e instanceof StopRun)) console.log('ai-bench stopped:', e && e.stack || e);
}
if (GAPS.length) console.log(`server gaps: ${GAPS.length} · ` + GAPS.map(g => `${g.at.slice(11, 19)}Z ${g.phase} ${g.id || ''} ${g.error} back ${g.back ? 'after ' + g.backAfterS + ' s' : 'NO'}`).join(' · '));
save(stage === 'done');
if (stage !== 'done') console.log('partial results in ' + OUT + ' (stage: ' + stage + ')');
process.exitCode = exitCode;
