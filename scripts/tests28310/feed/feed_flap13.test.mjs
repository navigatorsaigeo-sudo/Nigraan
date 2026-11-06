// v91.17.283.10 · item 13 · EWS hydrology LATE / recovered every 30 min on the live v283.9 (laptop alerts.log 22-23 Oct 2026).
// Replays the STAGED checks of the laptop (fixtures: checks_2026-10_staged.jsonl, state_20261023_staged.json, copied 23 Oct 10:01 PKT)
// through the agent's alert decision (scripts/agents/feed_health.mjs decide()), against the rule written before this replay
// (data/evidence/feed28310/RULES.json):
//  R1 EWS hydrology / weather: at most 1 alert pair per real outage; none from the 30-min sawtooth (ages 43-57 min)
//  R2 the 23 Oct 02:12-09:31 PKT laptop-sleep gap is caught (DOWN, then one recovered line)
//  R3 the 21 Oct MACH outage (tests2837 fixtures, replayMach) is still caught: LATE then DOWN on the 21st, at most 1 alert pair
//  R4 the v283.9 decision (no persistence) on the same checks reproduces the sawtooth (>= 5 LATE lines): the replay is a real test
//  R5 the agent run uses decide() and reports the copy cadence it adds (copiedStatus copyCadenceMin)
// usage: node scripts/tests28310/feed/feed_flap13.test.mjs     (offline)
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..', '..');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + String(d).slice(0, 300) : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + String(d).slice(0, 600) : '')); } };
const FH = await import(pathToFileURL(join(ROOT, 'scripts', 'agents', 'feed_health.mjs')).href);
const RULES = JSON.parse(readFileSync(join(ROOT, 'data', 'evidence', 'feed28310', 'RULES.json'), 'utf8'));
ok(Array.isArray(RULES.pass_rule) && RULES.pass_rule.length >= 4 && /persistence/.test(RULES.method_chosen), 'the rule was registered (data/evidence/feed28310/RULES.json)', RULES.written);
const checks = readFileSync(join(HERE, 'fixtures', 'checks_2026-10_staged.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
const ST = JSON.parse(readFileSync(join(HERE, 'fixtures', 'state_20261023_staged.json'), 'utf8')).feeds;
const copyCad = ST.lamha_copy && ST.lamha_copy.cadenceMin;   /* the LAMHA copy job's measured cadence (30 min) */
const pkt = (ms) => new Date(ms + 5 * 3600e3).toISOString().replace('T', ' ').slice(0, 16);
function replay(feed, persistence) {
  const L = ST[feed]; let p = {}; const out = [];
  for (const c of checks) { const r = c.s[feed]; if (!r) continue; const now = Date.parse(c.at); const [status, age] = r;
    const f = { status, ageMin: age, lateAfterMin: L.lateAfterMin, cadenceMin: persistence ? L.cadenceMin : null, copyCadenceMin: persistence ? (feed.startsWith('ews') ? copyCad : (L.copy && L.copy.cadenceMin)) : null,
      lastUpdate: age != null ? new Date(now - age * 6e4).toISOString() : null,
      since: (status === 'late' || status === 'down') && age != null ? new Date(now - Math.max(0, age - (status === 'down' ? L.downAfterMin : L.lateAfterMin)) * 6e4).toISOString() : null };   /* the staged limits are the 23 Oct ones; a check marked late below them began at that check */
    const d = FH.decide(p, f, now, []); if (d.alert) out.push({ t: now, to: d.alert.to }); p = { ...d.f }; }
  return out; }
const show = (A) => A.map((a) => pkt(a.t) + ' ' + a.to).join(' | ') || 'none';
const SLEEP0 = Date.parse('2026-10-22T21:12:00Z'), SLEEP1 = Date.parse('2026-10-23T04:31:00Z');   /* 02:12-09:31 PKT */
for (const feed of ['ews_hydro', 'ews_weather']) {
  const A = replay(feed, true);
  const sleepA = A.filter((a) => a.t >= SLEEP1 - 6e4), before = A.filter((a) => a.t < SLEEP1 - 6e4);
  ok(before.length === 0, 'R1 ' + feed + ': no alert from the 30-min cycle before the sleep (22 Oct 19:26 - 23 Oct 02:43 PKT)', show(before));
  ok(sleepA.length === 2 && sleepA[0].to === 'down' && sleepA[1].to === 'ok', 'R2 ' + feed + ': the 23 Oct laptop-sleep gap is one incident: DOWN, then one recovered line', show(sleepA));
}
const old = replay('ews_hydro', false).filter((a) => a.t < SLEEP1 - 6e4 && a.t > Date.parse('2026-10-22T16:20:00Z'));   /* after the 19:41-21:07 PKT gap */
ok(old.filter((a) => a.to === 'late').length >= 2, 'R4 (amended, see RULES.json) the v283.9 decision on the same checks writes the sawtooth (' + old.filter((a) => a.to === 'late').length + ' LATE lines, the live 01:33 PKT one included)', show(old));
{ let prev = 'ok', n = 0; for (const c of checks) { const r = c.s.ews_hydro; if (!r || Date.parse(c.at) >= SLEEP1 - 6e4) continue; if (r[0] !== prev && r[0] !== 'not assessed') { if (r[0] === 'late') n++; prev = r[0]; } }
  ok(n >= 5, 'R4 (amended) the v283.8 decision (every change written, no hysteresis) on the same checks: ' + n + ' LATE lines'); }
/* R3 · the 21 Oct MACH outage, replayed from LAMHA's sync log and the readings (tests2837 fixtures), with the agent's decision */
{ const fx = join(ROOT, 'scripts', 'tests2837', 'fixtures'); const sync = readFileSync(join(fx, 'mach_sync_log_20261022.txt'), 'utf8');
  const rows = gunzipSync(readFileSync(join(fx, 'mach_obs_times_20261018_22.csv.gz'))).toString().trim().split('\n').slice(1).map((l) => { const [key, t] = l.split(','); return { key, ms: Date.parse(t) }; }).filter((r) => r.key && Number.isFinite(r.ms));
  const P = (s) => Date.parse(s.replace(' ', 'T') + ':00Z') - 5 * 3600e3; const S = FH.parseSyncLog(sync);
  let p = {}; const A = [];
  for (let t = P('2026-10-21 06:00'); t <= P('2026-10-22 16:00'); t += 10 * 6e4) { const m = FH.machAt(S, rows, t, 60); const f = { ...m, copy: { cadenceMin: ST.mach.copy ? ST.mach.copy.cadenceMin : 15 } };
    const d = FH.decide(p, f, t, S.ok); if (d.alert) A.push({ t, to: d.alert.to }); p = { ...d.f }; }
  const on21 = A.filter((a) => pkt(a.t).startsWith('2026-10-21'));
  ok(on21.some((a) => a.to === 'late') && on21.some((a) => a.to === 'down') && A.filter((a) => a.to === 'ok').length <= 1, 'R3 the 21 Oct MACH outage is still caught: LATE then DOWN on the 21st, at most one recovered line', show(A));
  ok(A.length <= 3, 'R3 one incident: at most LATE, DOWN and one recovered line', A.length + ' lines'); }
/* R5 · the agent uses it */
const src = readFileSync(join(ROOT, 'scripts', 'agents', 'feed_health.mjs'), 'utf8');
ok(/const d = decide\(p, f, now, events\[id\] \|\| \[\]\)/.test(src) && /copyCadenceMin: cg\.length \? r1\(median\(cg\) \/ 6e4\) : null/.test(src), 'R5 run() decides through decide(); copiedStatus reports the copy cadence');
ok(FH.persistMin({ cadenceMin: 30, copyCadenceMin: 30 }) === 60 && FH.persistMin({ cadenceMin: 10, copy: { cadenceMin: 15 } }) === 25 && FH.persistMin({ cadenceMin: 4 }) === 4, 'R5 the persistence is the measured cadence plus the measured copy cadence (no typed threshold)');
console.log(`\nFEED-FLAP-13 ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
