// v91.17.283.7 · agent 1, feed health (scripts/agents/feed_health.mjs):
//  F1 the 21-22 Oct 2026 MACH outage is detected by replaying LAMHA's database sync log and reading times (NIGRAAN's copy, fixtures):
//     ok at 09:40 PKT on 21 Oct (last fetch with new readings), LATE from 09:52 PKT (one usual gap later), DOWN by noon, never ok again
//     until the first fetch on 22 Oct 14:53 PKT, ok from then; the stations reporting fall to 0 while down
//  F2 the levels come from the feed's own history: late above the 95th percentile of its update gaps, down above the 99th (largest gap
//     below 100 gaps); fewer than 20 gaps = not assessed
//  F3 a run on a data folder: a change to late / down writes an alert record (data/agents/feed/alerts.jsonl) and one plain line to
//     <admin>\alerts.log; a return to ok writes 'recovered' since the first update after the gap; an unchanged status writes nothing
//  F4 stops.log: crash exits and a server found gone are unplanned; planned restarts, deploy retirements and sleep resumes are not
//  F5 the agent writes only under data/agents (and the admin alerts line)
// usage: node scripts/tests2837/agents_feed.test.mjs     (fails on v91.17.283.6: there is no agent)
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), FX = join(APP, 'scripts', 'tests2837', 'fixtures');
let pass = 0, fail = 0; const ok = (c, n, d = '') => { if (c) { pass++; console.log('PASS ' + n + (d ? ' - ' + String(d).slice(0, 400) : '')); } else { fail++; console.log('FAIL ' + n + (d ? ' - ' + String(d).slice(0, 800) : '')); } };
let FH; try { FH = await import(pathToFileURL(join(APP, 'scripts', 'agents', 'feed_health.mjs')).href); } catch (e) { ok(false, 'F0 scripts/agents/feed_health.mjs loads', e.message); console.log(`\nagents_feed ${pass} passed, ${fail} failed`); process.exit(1); }
const P = (s) => Date.parse(s.replace(' ', 'T') + ':00Z') - 5 * 3600e3;   /* 'YYYY-MM-DD HH:MM' PKT -> ms */
/* F1 · the replay */
const sync = readFileSync(join(FX, 'mach_sync_log_20261022.txt'), 'utf8');
const rows = []; for (const l of gunzipSync(readFileSync(join(FX, 'mach_obs_times_20261018_22.csv.gz'))).toString('utf8').split('\n').slice(1)) { const c = l.split(','); if (c.length < 4 || /^(qm|apple)$/i.test(c[3])) continue; const ms = Date.parse(c[2]); if (Number.isFinite(ms)) rows.push({ key: c[1], ms }); }
const R = FH.replayMach(sync, rows, P('2026-10-21 06:00'), P('2026-10-22 16:00'));
const at = (s) => R.seq.find((x) => x.t === P(s));
const ch = R.changes; const late = ch.find((c) => c.status === 'late' && c.at >= new Date(P('2026-10-21 09:40')).toISOString()), down = ch.find((c) => c.status === 'down' && c.at >= new Date(P('2026-10-21 09:40')).toISOString());
const back = ch.filter((c) => c.status === 'ok' && c.at > new Date(P('2026-10-21 10:00')).toISOString())[0];
ok(at('2026-10-21 09:40').status === 'ok' && late && late.sincePkt === '2026-10-21 09:52 PKT' && late.lastUpdatePkt === '2026-10-21 09:40 PKT', 'F1a ok at 09:40 PKT; LATE since 09:52 PKT (last fetch with new readings 09:40 PKT)', JSON.stringify(late));
ok(down && down.at <= new Date(P('2026-10-21 12:00')).toISOString() && down.stations === 0, 'F1b DOWN by 12:00 PKT, no station reporting in the copy', JSON.stringify(down));
const gapSeq = R.seq.filter((x) => x.t > P('2026-10-21 10:00') && x.t < P('2026-10-22 14:53'));
ok(gapSeq.length > 150 && gapSeq.every((x) => x.status !== 'ok'), 'F1c never ok between 21 Oct 10:00 and 22 Oct 14:53 PKT (' + gapSeq.length + ' checks)', JSON.stringify(gapSeq.filter((x) => x.status === 'ok').slice(0, 2)));
ok(back && back.sincePkt === '2026-10-22 14:53 PKT' && back.atPkt === '2026-10-22 15:00 PKT' && back.stations > 50, 'F1d recovered: ok since 22 Oct 14:53 PKT, seen at the 15:00 check', JSON.stringify(back));
console.log('     replay changes 21 Oct 06:00 - 22 Oct 16:00 PKT: ' + ch.map((c) => c.atPkt + ' ' + c.status + (c.sincePkt ? ' (since ' + c.sincePkt + ')' : '')).join(' | '));
/* F2 · the levels from the feed's own gaps */
const t0 = Date.parse('2026-10-01T00:00:00Z'); const ev = [t0]; for (let i = 1; i <= 200; i++) ev.push(ev[i - 1] + (i % 40 === 0 ? 40 : i % 10 === 0 ? 20 : 10) * 6e4);   /* 175 gaps of 10 min, 20 of 20, 5 of 40 */
const last = ev[ev.length - 1]; const s1 = FH.cadenceStatus(ev, last + 9 * 6e4), s2 = FH.cadenceStatus(ev, last + 30 * 6e4), s3 = FH.cadenceStatus(ev, last + 60 * 6e4), s4 = FH.cadenceStatus(ev.slice(0, 15), ev[14] + 3600e3);
ok(s1.status === 'ok' && s1.cadenceMin === 10 && s1.lateAfterMin === 20 && s1.downAfterMin === 40 && s2.status === 'late' && s3.status === 'down' && (s4.status === 'late' || s4.status === 'down') && s4.limits === 'declared cadence' && /measured update gaps/.test(s4.basis) && FH.cadenceStatus(ev.slice(0, 3), ev[2] + 3600e3).status === 'not assessed', 'F2 ok / late / down from the feed\'s own gaps (cadence 10 min, late above P95 ' + s1.lateAfterMin + ' min, down above P99 ' + s1.downAfterMin + ' min); 14 gaps: its own median gap as the period (v51 g2: an old feed is never "not assessed"); 2 gaps = not assessed', [s1.status, s2.status, s3.status, s4.status].join(','));
/* F3 · a run on a data folder (river sheets as the feed under test; the others not assessed) */
const tmp = mkdtempSync(join(tmpdir(), 'fh-')), data = join(tmp, 'data'), adm = join(tmp, '_admin'), cop = join(tmp, 'copies'); mkdirSync(data, { recursive: true }); mkdirSync(adm); mkdirSync(cop);
const seen = {}; const s0 = Date.parse('2026-09-20T05:00:00Z'); for (let i = 0; i < 30; i++) seen['k' + i] = { at: new Date(s0 + i * 864e5 + (i % 7) * 6e5).toISOString(), name: 'ffd_drive_' + i + '.csv' };
writeFileSync(join(data, 'ffd-drive-state.json'), JSON.stringify({ seen })); writeFileSync(join(data, 'marker.txt'), 'x');
const lastSheet = s0 + 29 * 864e5 + (29 % 7) * 6e5; const before = new Map(readdirSync(data).map((f) => [f, statSync(join(data, f)).mtimeMs]));
const run = (ms) => FH.run({ app: APP, dataDir: data, copiesDir: cop, adminDir: adm, now: ms });
/* v283.23 J13 (test updated in 283.24): only time the computer was awake ages a feed; here it stayed on (checks every 10 min) between the runs */
const stayOn = (to) => { const f = join(data, 'agents', 'feed', 'awake.json'); const A = JSON.parse(readFileSync(f, 'utf8')); A.intervals[A.intervals.length - 1][1] = to; writeFileSync(f, JSON.stringify(A)); };
const a1 = run(lastSheet + 3600e3); stayOn(lastSheet + 26 * 3600e3 - 6e5); const a2 = run(lastSheet + 26 * 3600e3); stayOn(lastSheet + 27 * 3600e3 - 6e5); const a3 = run(lastSheet + 27 * 3600e3);
const late2 = a2.state.feeds.river.status; seen.k30 = { at: new Date(lastSheet + 30 * 3600e3).toISOString(), name: 'ffd_drive_30.csv' }; writeFileSync(join(data, 'ffd-drive-state.json'), JSON.stringify({ seen }));
stayOn(lastSheet + 31 * 3600e3 - 6e5); const a4 = run(lastSheet + 31 * 3600e3); const a5 = run(lastSheet + 31 * 3600e3 + 10 * 6e4);   /* v91.17.283.9 · hysteresis: a change is written at its second consecutive check */
const AL = readFileSync(join(data, 'agents', 'feed', 'alerts.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)); const LOG = readFileSync(join(adm, 'alerts.log'), 'utf8').trim().split(/\r?\n/);
ok(a1.state.feeds.river.status === 'ok' && (late2 === 'late' || late2 === 'down') && a2.alerts.length === 0 && a3.alerts.length === 1 && a4.alerts.length === 0 && a5.state.feeds.river.status === 'ok' && a5.alerts.length === 1 && AL.length === 2 && AL[0].to === late2 && AL[1].to === 'ok' && AL[1].since === seen.k30.at && LOG.length === 2 && /River gauge sheet: (LATE|DOWN) since/.test(LOG[0]) && /recovered/.test(LOG[1]),
  'F3 alert record + admin line on the change to ' + late2 + ' (written at its second check), none while unchanged, recovered (second ok check) since the first new sheet', LOG.join(' | '));
ok(/^[\x20-\x7e]+$/.test(LOG.join('')), 'F3b the admin alerts lines are plain ASCII', LOG[0]);
/* F4 · stops.log */
const stops = ['[2026-10-22 08:26:32] server on 8792 retired by a deploy (planned), exit code 0: clean exit', '[2026-10-21 09:13:58] server on 8792 stopped, exit code 3221225477: 0xC0000005 - access violation',
  '[Wed 10/21/2026  9:13:58.91] supervisor stopped, exit code -1073741819: 0xC0000005 - access violation (the proxy and the server keep running)', '[2026-10-22 09:11:58] supervisor: resume from sleep detected (592 s gap); children re-checked',
  '[2026-10-22 09:12:08] supervisor after resume: server on 8792 pid 40468 was gone; started again', '[2026-10-14 15:37:03] restart_nigraan.ps1 (hp): planned restart: stopping node pid 8968 (listening on 8787)',
  '[Thu 10/15/2026 10:43:02.24] server stopped, exit code -1073741818: planned restart (restart_nigraan.ps1 / AGN_TOOLS \'NIGRAAN - Restart server\')'].join('\n');
const U = FH.unplannedStops(stops).map((t) => new Date(t + 5 * 3600e3).toISOString().slice(0, 16));
ok(U.length === 3 && U[0] === '2026-10-21T09:13' && U[2] === '2026-10-22T09:12', 'F4 unplanned stops: 2 crash lines and a server found gone (planned, deploy and sleep lines left out)', U.join(','));
/* F5 · writes only under data/agents */
const after = readdirSync(data).filter((f) => f !== 'agents'); const changed = after.filter((f) => f !== 'ffd-drive-state.json' && (!before.has(f) || statSync(join(data, f)).mtimeMs !== before.get(f)));
const walk = (d) => readdirSync(d).flatMap((f) => statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [relative(data, join(d, f))]);
ok(changed.length === 0 && walk(join(data, 'agents')).every((f) => f.startsWith('agents')) && readdirSync(adm).join() === 'alerts.log', 'F5 nothing outside data/agents written (plus _admin\\alerts.log)', walk(join(data, 'agents')).join(', '));
console.log(`\nagents_feed ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
