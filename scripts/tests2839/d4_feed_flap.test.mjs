// v91.17.283.9 · coordinator · the feed-health alerts flapped on the laptop on 22 Oct (v283.8): "EWS hydrology: LATE ... 46.7 min ago"
// and "recovered" every 30 min all evening; "Airport reports: DOWN ... 32 min ago" then "recovered". Causes: (a) the partner-network data
// reaches NIGRAAN through the 30-min LAMHA copy job, so its age is the source cadence plus the copy lag, while the limits were measured
// on the source series alone; (b) no hysteresis. This replay rebuilds the evening's pattern and runs the agent every 10 min on it.
//  The pattern (PKT): EWS runs every 30 min at :11 / :41 (30 days of history), copied by the LAMHA copy job at :25 / :55; the evening of
//  22 Oct has the one real gap of the log (no run between 19:41 and 21:07). Airport reports arrive in half-hourly bursts (8 airports,
//  a few minutes apart), copied every 30 min. Checks every 10 min at :04, :14, ... for two days up to 23 Oct 00:00 PKT.
//  P1 EWS hydrology: no alert while the runs come every 30 min (the evening's 7 flaps gone); the real 86-min gap gives one LATE/DOWN line
//     and one "recovered" line
//  P2 airport reports: no alert from the bursts (the 32-min gap between two bursts is their normal cadence, and no single check decides)
//  P3 every written change held for at least 2 consecutive checks (no incident shorter than 10 min); one "recovered" per incident
//  P4 the EWS limits are measured on the delivered series (the copy runs that brought each update)
//  On the v91.17.283.8 agent (T2839_TREE=<283.8 srv>) P1-P3 FAIL: it flaps.
//  v91.17.283.28 (independence from LAMHA): the LAMHA copy is retired; NIGRAAN's own EWS fetch and METAR record write their files at
//  each run straight into the own folder (--own), so the replay writes them there at their own times and P4 checks the limits on
//  the own run series (no copy lag).
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imp, ok, done } from './lib.mjs';
const FH = await imp('scripts/agents/feed_health.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'flap-')), app = join(tmp, 'app'), data = join(app, 'data'), cop = join(tmp, 'copies'), OWN = join(tmp, 'own'), adm = join(tmp, '_admin');
for (const d of [data, cop, join(OWN, 'data', 'pmd', 'ews_live'), adm, join(OWN, 'data', 'obs_other', 'metar_live')]) mkdirSync(d, { recursive: true });
const PKT = (s) => Date.parse(s + ':00Z') - 5 * 3600e3, M = 6e4;
const fmtPkt = (ms) => new Date(ms + 5 * 3600e3).toISOString().replace('T', ' ').slice(0, 16) + ' PKT';
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const END = PKT('2026-10-23T00:00'), START_CHECKS = PKT('2026-10-21T00:00'), HIST0 = PKT('2026-09-22T00:00');
const GAP0 = PKT('2026-10-22T19:41'), GAP1 = PKT('2026-10-22T21:07');
/* EWS source runs */
const runs = []; for (let t = HIST0 + 11 * M; t <= END; t += 30 * M) { const x = t + Math.round(rnd() * 3) * M; if (x > GAP0 && x < GAP1) continue; runs.push(x); } runs.push(GAP1); runs.sort((a, b) => a - b);
const ewsLine = (t) => fmtPkt(t) + '  ' + (600 + Math.round(rnd() * 300)) + ' new readings, 60 stations with temperature in 2 h; ' + (700 + Math.round(rnd() * 200)) + ' new hydro readings';
const ewsLines = runs.map((t) => [t, ewsLine(t)]);
/* airport report arrivals: a burst at :00-:12 and :30-:42 (8 airports), half-hourly */
const metar = []; for (let t = PKT('2026-09-22T00:00'); t <= END; t += 30 * M) for (let k = 0; k < 8; k++) metar.push(t + (2 + k * 1.4 + rnd()) * M);
const metarCsv = (upTo) => { const by = new Map(); for (const a of metar) { if (a > upTo) continue; const ym = new Date(a).toISOString().slice(0, 7).replace('-', ''); if (!by.has(ym)) by.set(ym, ['station,time_utc,received_utc']); by.get(ym).push('OP' + String(Math.round(a / M) % 8) + ',' + iso(a - 2 * M) + ',' + iso(a)); }
  for (const [ym, l] of by) writeFileSync(join(OWN, 'data', 'obs_other', 'metar_live', 'metar_' + ym + '.csv'), l.join('\n') + '\n'); };
/* the own fetches write their files at their own run times: at each check the EWS log and the airport file hold what existed then */
const all = [];
for (let t = START_CHECKS + 4 * M; t <= END; t += 10 * M) {
  writeFileSync(join(OWN, 'data', 'pmd', 'ews_live', 'sync_log.txt'), ewsLines.filter(([x]) => x <= t).map(([, l]) => l).join('\n') + '\n'); metarCsv(t);
  const r = FH.run({ app, dataDir: data, copiesDir: cop, adminDir: adm, ownDir: OWN, now: t }); for (const a of r.alerts) all.push({ ...a, t }); }
const evening = all.filter((a) => a.t >= PKT('2026-10-22T17:00'));
const hy = evening.filter((a) => a.feed === 'ews_hydro'), me = all.filter((a) => a.feed === 'metar'), ewsAll = all.filter((a) => a.feed === 'ews_hydro' || a.feed === 'ews_weather');
const say = (L) => L.map((a) => fmtPkt(a.t) + ' ' + a.label + ' ' + a.to).join(' | ');
/* v91.17.283.28: no copy lag any more, so the incident starts from the last run before the gap (not from the copy that would have brought it) */
const lastBefore = Math.max(...runs.filter((x) => x < GAP0));
const outside = ewsAll.filter((a) => a.t < lastBefore + 30 * M || a.t > GAP1 + 70 * M);
ok(outside.length === 0, 'P1 EWS: no alert while the runs come every 30 min (2 days of checks)', say(outside) || 'none');
ok(hy.length === 2 && /late|down/.test(hy[0].to) && hy[1].to === 'ok' && hy[0].t > lastBefore && hy[1].t > GAP1, 'P1 EWS hydrology: the real 19:41-21:07 gap is one incident: one LATE/DOWN line, one recovered line', say(hy));
ok(me.length === 0, 'P2 airport reports: no alert from the half-hourly bursts', say(me) || 'none');
let short = 0, recPer = true; const open = new Map();
for (const a of all) { if (/late|down/.test(a.to)) { if (!open.has(a.feed)) open.set(a.feed, a.t); } else if (a.to === 'ok') { if (!open.has(a.feed)) recPer = false; else { if (a.t - open.get(a.feed) < 10 * M) short++; open.delete(a.feed); } } }
ok(short === 0 && recPer, 'P3 every incident lasts at least 2 checks and has exactly one "recovered" line', short + ' short');
const st = JSON.parse(readFileSync(join(data, 'agents', 'feed', 'state.json'), 'utf8')).feeds.ews_hydro || {};
ok(st.gaps >= 20 && st.lateAfterMin > 30, 'P4 EWS limits on the own run series (' + st.gaps + ' gaps; late after ' + st.lateAfterMin + ' min, down after ' + st.downAfterMin + ' min)', st.basis);
const log = existsSync(join(adm, 'alerts.log')) ? readFileSync(join(adm, 'alerts.log'), 'utf8').trim() : ''; console.log('     admin lines: ' + (log ? log.split(/\r?\n/).length : 0)); if (log) console.log(log.split(/\r?\n/).slice(0, 8).map((l) => '     ' + l.slice(0, 200)).join('\n'));
rmSync(tmp, { recursive: true, force: true });
done('D4-FEED-FLAP-2839');
