/* == v91.17.283.7 . AGENT 1: FEED HEALTH (every 10 min, a child process of the server; server/api/agents.mjs) =====================
   For each feed NIGRAAN depends on, from files only (copies, logs, archives; no network, no provider call):
   v91.17.283.28 · INDEPENDENCE FROM LAMHA (owner, 28 Oct 2026): every feed below is NIGRAAN's OWN fetch, read from its own folder nig/own
   (server/api/ownpaths.mjs, LAMHA's relative layout; --own, default <app>/../own). The LAMHA copies and their copy-job checks are retired.
     mach      NIGRAAN's MACH database window (nig/own/data/mach/db, machdb.mjs every 10 min): successful database fetches in sync_log.txt
               (a fetch that brought new readings), the newest reading, the stations reporting
     metar     NIGRAAN's airport reports (nig/own/data/obs_other/metar_live/metar_YYYYMM.csv, metar_sync.py; received_utc = arrival)
     ews_*     NIGRAAN's own EWS fetch (nig/own/data/pmd/ews_live/sync_log.txt, ews_sync.py): runs with new weather / hydrology readings
     radar_*   NIGRAAN's own radar pull (nig/own/data/radar: netcdf file times, pull_log.txt; radar_pull.py)
     isd_lite  NOAA ISD-Lite (station-lake/archive/isd/raw, isd_lite_sync.py daily): the times NOAA changed a file NIGRAAN holds
     official_aws  PMD official AWS: HAND-SUPPLIED, NO LIVE FEED (one-off exports through the drop folder; no portal access) - shown as
               'not assessed' with the last import, never an alert
     imerg     satellite rain day files (data/imerg/*.json, data/imerg/pkt/*.json; file times = arrival)
     river     the river gauge sheets (data/ffd-drive-state.json: each new sheet and when it was taken)
     ecmwf     the ECMWF 0.1 deg fetcher (data/ecmwf010/index.json runs; each run's meta.json time = arrival; ecmwf010-status.json)
     provider  the forecast provider: the per-caller record (data/quota-callers/qbr-*.jsonl, a line every 15 min while calls are made):
               failed share of calls, and today's weighted calls against the day's cap (data/provider-budget.json)
     engine    the hazard levels run (data/engine-latest.json received; stale after validUntil = received + the engine's own STALE_MS)
     disk      free space on the data drive (own samples)
     restarts  unplanned stops in data/stops.log (crash exits, a server found gone), per day
     server feeds (v91.17.283.27 item 8) the sources the server itself polls, which had no health entry: the Punjab EPD air-quality page
               (epdaq.mjs), OpenAQ (openaq.mjs), the synoptic reports (synop.mjs) and the river sheet on Google Drive (drivefetch.mjs).
               The server writes each module's own status() (lastPoll, lastError, its schedule period) to data/agents/feed/server-feeds.json
               before every check. Freshness: the cadence rule below on the successful polls. REFUSED: a source that answers with a
               refusal (HTTP 401 / 403 / 451, or a geo / bot block page) for longer than REFUSAL_PERSIST_MS (owner rule, 28 Oct 2026:
               2 hours) - or one full poll period of the feed when that is longer (its own schedule, else its measured cadence), so a
               refusal is seen on two polls - is DOWN, and the alert names the source and the status.
   STATUS (no typed threshold): each feed's normal cadence is measured from its own update history over the last 30 days: the gaps
   between successive updates. age = time since the last update. ok while age <= the 95th percentile of the gaps; late above it; down
   above the 99th percentile (the largest gap while fewer than 100 gaps are held). Fewer than 20 gaps = not assessed (a 95th percentile
   needs 20 values). A change to late or down writes an alert record (data/agents/feed/alerts.jsonl) and one plain line to
   _admin\alerts.log; a return to ok writes a 'recovered' record and line.
   v91.17.283.9 · a change is written only when two consecutive checks agree on it (hysteresis, both ways; one 'recovered' per incident),
   and the partner-network (LAMHA copy) feeds are measured on the series NIGRAAN receives (copiedStatus: each update at the copy run that
   brought it). The call budget alert stays separate.
   usage (the server does this): node scripts/agents/feed_health.mjs --app <nigraan-local> --data <data dir> --copies <copies dir>
          [--engine-stale-ms <ms>] [--now <ISO>]          exit 0 done, 5 another copy running */
import { readFileSync, readdirSync, statSync, existsSync, statfsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownDir } from '../../server/api/ownpaths.mjs';
import { args, readJson, writeJsonAtomic, appendLine, quantile, median, fin, pktText, pktDay, takeLock, agentLog, adminDir, adminAlert, readCsv, gzMembers, MACH_ALIASES, FORECAST_SRC, utcMs, r1 } from './lib.mjs';

export const WINDOW_DAYS = 30;
export const MIN_GAPS = 20;      /* the smallest sample in which a 95th percentile is an observed value */
export const P99_GAPS = 100;     /* the smallest sample in which a 99th percentile is */
const DAY = 864e5;
/* v91.17.283.27 · item 8 · owner rule (28 Oct 2026, after the Punjab EPD page answered HTTP 403 for 2.5 days with no alert): a source
   refusing for more than 2 hours raises a feed alert. The one number of the rule; each feed's own poll period extends it when longer. */
export const REFUSAL_PERSIST_MS = 2 * 3600e3;
/* a refusal in a module's lastError: an HTTP 401 / 403 / 451 (any wording that carries the code), or a geo / bot block page; null otherwise */
export function refusalOf(text) {
  const t = String(text || ''); if (!t) return null;
  const m = /(?:^|[^\d.])(401|403|451)(?![\d.])/.exec(t); if (m) return { status: 'HTTP ' + m[1], kind: m[1] === '451' ? 'unavailable for legal reasons (geo block)' : m[1] === '401' ? 'not authorised' : 'forbidden', text: t.slice(0, 160) };
  if (/captcha|cloudflare|access denied|forbidden|attention required|are you a robot|bot (?:check|protection|detected)|geo-?block|not available in your (?:country|region)|unavailable for legal reasons/i.test(t)) return { status: 'blocked', kind: 'geo / bot block page', text: t.slice(0, 160) };
  return null;
}
/* one server-polled feed (pure): f = its record in server-feeds.json, prev = the feed's previous state, events = its successful polls (ms) */
export function serverFeedStatus(f, prev, events, now, opts = {}) {
  /* v283.28 S7: the declared-cadence limits apply while no refusal is open; a refusing source follows the owner's refusal rule alone
     (one alert, DOWN after the persistence limit), so it is not first raised LATE by the cadence */
  const cur = refusalOf(f && f.lastError); const pr = prev && prev.refusal;
  const s = cadenceStatus(events, now, { ...opts, declaredMs: !cur && f && fin(f.everyMs) ? f.everyMs : null, declaredWhat: (f && f.everyWhat) || 'its schedule', startedMs: f && f.startedAt ? Date.parse(f.startedAt) : null });
  const refusal = cur ? { ...cur, since: pr && pr.status === cur.status && pr.since ? pr.since : new Date(now).toISOString() }
    : (f && f.lastPoll == null && f.lastError == null && pr ? pr : null);   /* no poll since a restart: nothing new is known, the open refusal stays */
  const periodMs = fin(f && f.everyMs) ? f.everyMs : fin(s.cadenceMin) ? s.cadenceMin * 6e4 : 0;
  const limitMs = Math.max(REFUSAL_PERSIST_MS, periodMs);
  const out = { ...s, label: f && f.label, lastPoll: (f && f.lastPoll) || null, lastError: (f && f.lastError) || null, refusal, refusalLimitMin: r1(limitMs / 6e4),
    detail: (f && f.lastError ? 'last error: ' + String(f.lastError).slice(0, 120) : 'no error') + (f && f.lastPoll ? '; last good poll ' + pktText(Date.parse(f.lastPoll)) : '; no good poll since the server started') };
  /* the refusal is over (a good poll, no error) while the freshness cadence is still unmeasured: the alerted DOWN / LATE is cleared as ok,
     so the incident gets its one "recovered" line */
  if (!refusal && s.status === 'not assessed' && f && f.lastPoll && !f.lastError && prev && (prev.alerted === 'down' || prev.alerted === 'late')) { out.status = 'ok'; out.why = (s.why || '') + '; the refusal is over (a good poll at ' + pktText(Date.parse(f.lastPoll)) + ')'; }
  if (refusal) { const sinceMs = Date.parse(refusal.since), forMs = now - sinceMs;
    out.refusal = { ...refusal, forMin: r1(forMs / 6e4) };
    if (forMs > limitMs) { out.status = 'down'; out.since = new Date(sinceMs + limitMs).toISOString(); out.why = 'refused';
      out.detail = (f.label || 'source') + ' refuses: ' + refusal.status + ' (' + refusal.kind + ') since ' + pktText(sinceMs) + ', for ' + Math.round(forMs / 6e4) + ' min (more than ' + Math.round(limitMs / 6e4) + ' min); last error "' + refusal.text + '"'; } }
  return out;
}
const RANK = { ok: 0, 'not assessed': 0, late: 1, down: 2 };
/* v91.17.283.28 · S7 · the limits from a module's declared period P (its own schedule): LATE after 2 P (the next poll is overdue by a whole
   period: one poll missed), DOWN after P + max(P, REFUSAL_PERSIST_MS) (the owner's 2-hour persistence rule for a refusing source, applied to
   a source that stopped answering; one period when that is longer), never earlier than LATE. No other number. */
export function declaredLimits(P) { if (!fin(P) || !(P > 0)) return null; const late = 2 * P; return { late, down: Math.max(late, P + Math.max(P, REFUSAL_PERSIST_MS)) }; }

/* v91.17.283.23 · self-audit J13 · THE TIME THIS COMPUTER WAS AWAKE. The checks run every 10 minutes while the server runs; their times make
   the awake intervals (a break over 25 minutes = asleep or off). A gap between two updates counts toward the late / down limits only
   when the computer was awake for at least 90 % of it, and a feed's age is counted in awake time: the laptop being off is not a feed
   outage, and waking up does not raise LATE on every feed. */
let AWAKE = null;
export function awakeMs(iv, a, b) { if (!iv || !iv.length || !(b > a)) return b - a; let s = Math.max(0, Math.min(b, iv[0][0]) - a);   /* before the record began: counted as awake (unknown) */ for (const [x, y] of iv) { const lo = Math.max(a, x), hi = Math.min(b, y); if (hi > lo) s += hi - lo; } return s; }
export function noteAwake(iv, now, keepDays = WINDOW_DAYS + 1) { const out = (iv || []).filter(([, y]) => y >= now - keepDays * DAY).map((x) => x.slice());
  const L = out[out.length - 1]; if (L && now - L[1] <= 25 * 6e4) L[1] = now; else out.push([now, now]); return out; }
/* the status of one update series at time asOf: events = update times (ms) */
export function cadenceStatus(events, asOf, opts = {}) {
  const lo = asOf - (opts.windowDays || WINDOW_DAYS) * DAY; const iv = opts.awake !== undefined ? opts.awake : AWAKE;
  const ev = [...new Set(events.filter((t) => fin(t) && t <= asOf && t >= lo))].sort((a, b) => a - b);
  const last = [...events].filter((t) => fin(t) && t <= asOf).sort((a, b) => b - a)[0];
  const gaps = []; for (let i = 1; i < ev.length; i++) { const g = ev[i] - ev[i - 1]; if (!iv || awakeMs(iv, ev[i - 1], ev[i]) >= 0.9 * g) gaps.push(g); }
  const age = fin(last) ? (iv ? awakeMs(iv, last, asOf) : asOf - last) : null;
  const out = { lastUpdate: fin(last) ? new Date(last).toISOString() : null, ageMin: age == null ? null : r1(age / 6e4), gaps: gaps.length,
    cadenceMin: gaps.length ? r1(median(gaps) / 6e4) : null, lateAfterMin: null, downAfterMin: null, status: 'not assessed', why: null, since: null };
  if (gaps.length < MIN_GAPS) { out.why = gaps.length + ' gaps in the last ' + (opts.windowDays || WINDOW_DAYS) + ' days (a 95th percentile needs ' + MIN_GAPS + ')'; if (!fin(last)) out.why = 'no update seen';
    /* v91.17.283.28 · S7 · the measured history is short: the module's DECLARED cadence (its own schedule) sets the limits, so a feed long
       past its own period is LATE / DOWN instead of 'not assessed' (declaredLimits; the basis names the declared cadence and its source) */
    /* v91.17.283.51 g2 · live test 51: radar Islamabad 4.4 days old (cadence about 6.5 h) showed 'not assessed': with no declared cadence and
       a short history, the feed's own measured cadence (median of the gaps it has, at least 3) is its period under the same rule */
    if (!fin(opts.declaredMs) && gaps.length >= 3) { opts = { ...opts, declaredMs: median(gaps), declaredWhat: 'the median of its own ' + gaps.length + ' measured update gaps' }; }
    const D = declaredLimits(opts.declaredMs); const ref = fin(last) ? last : fin(opts.startedMs) ? opts.startedMs : null;
    if (D && fin(ref)) { const ag = iv ? awakeMs(iv, ref, asOf) : asOf - ref; out.ageMin = r1(ag / 6e4); out.lateAfterMin = r1(D.late / 6e4); out.downAfterMin = r1(D.down / 6e4); out.limits = 'declared cadence';
      out.basis = 'declared cadence of the module (' + r1(opts.declaredMs / 6e4) + ' min, ' + (opts.declaredWhat || 'its schedule') + ') while the measured history is short (' + gaps.length + ' gaps): late after two periods (' + out.lateAfterMin + ' min: a poll missed), down after one period plus the owner\u2019s persistence rule (' + out.downAfterMin + ' min)' + (fin(last) ? '' : '; no good poll since the server started');
      if (ag > D.down) { out.status = 'down'; out.since = new Date(ref + D.down).toISOString(); out.why = null; } else if (ag > D.late) { out.status = 'late'; out.since = new Date(ref + D.late).toISOString(); out.why = null; } else if (fin(last)) { out.status = 'ok'; out.why = null; } }
    return out; }
  const late = quantile(gaps, 0.95), down = gaps.length >= P99_GAPS ? quantile(gaps, 0.99) : Math.max(...gaps);
  out.lateAfterMin = r1(late / 6e4); out.downAfterMin = r1(down / 6e4);
  out.basis = 'late after the 95th percentile of ' + gaps.length + ' update gaps (' + out.lateAfterMin + ' min), down after the ' + (gaps.length >= P99_GAPS ? '99th percentile' : 'largest gap') + ' (' + out.downAfterMin + ' min), last 30 days';
  if (age > down) { out.status = 'down'; out.since = new Date(last + down).toISOString(); }
  else if (age > late) { out.status = 'late'; out.since = new Date(last + late).toISOString(); }
  else out.status = 'ok';
  return out;
}
const worse = (a, b) => (RANK[b.status] > RANK[a.status] ? b : a);

/* v91.17.283.9 · coordinator (live alerts of 22 Oct: "EWS hydrology LATE ... 46.7 min ago" / "recovered" every 30 min all evening) ·
   THE SERIES NIGRAAN ACTUALLY SEES. A partner-network update reaches NIGRAAN only with the LAMHA copy run that brings it (every 30 min,
   scripts/agents/lamha_copy.mjs): its observed age is the source cadence plus the copy lag. Each source update is placed at the first copy
   run at or after it (its delivery); the late / down limits are then measured on the delivered series (the gaps between deliveries) and
   the age is the time since the last delivery. While fewer than 20 delivered gaps are held (a 95th percentile needs 20), the source
   series is used with its limits widened by the copy job's own cadence (its 95th percentile gap for late, its 99th percentile / largest
   gap for down). No typed threshold. */
export function deliveredSeries(src, runs, maxLagMs = 3 * 3600e3) {
  const R = [...new Set((runs || []).filter(fin))].sort((a, b) => a - b); if (!R.length) return [];
  const out = new Set();
  for (const e of src || []) { if (!fin(e) || e < R[0]) continue; let lo = 0, hi = R.length; while (lo < hi) { const m = (lo + hi) >> 1; if (R[m] >= e) hi = m; else lo = m + 1; }
    if (lo < R.length && R[lo] - e <= maxLagMs) out.add(R[lo]); }
  return [...out].sort((a, b) => a - b);
}
export function copiedStatus(src, runs, now, opts = {}) {
  const res = copiedStatus0(src, runs, now, opts);
  const lo = now - (opts.windowDays || WINDOW_DAYS) * DAY, R = [...new Set((runs || []).filter((t) => fin(t) && t >= lo && t <= now))].sort((a, b) => a - b);
  const cg = []; for (let i = 1; i < R.length; i++) cg.push(R[i] - R[i - 1]);
  return { ...res, copyCadenceMin: cg.length ? r1(median(cg) / 6e4) : null };   /* v91.17.283.10 · item 13: the delivery cycle of the persistence rule */
}
function copiedStatus0(src, runs, now, opts = {}) {
  const del = deliveredSeries(src, runs);
  const sd = cadenceStatus(del, now, opts);
  const srcLast = [...(src || [])].filter((t) => fin(t) && t <= now).sort((a, b) => b - a)[0];
  if (sd.status !== 'not assessed') return { ...sd, series: 'delivered', sourceLastUpdate: fin(srcLast) ? new Date(srcLast).toISOString() : null, deliveredGaps: sd.gaps,
    basis: sd.basis + '; measured on the updates as NIGRAAN receives them (each at the LAMHA copy run that brought it)' };
  const s = cadenceStatus(src, now, opts); if (s.status === 'not assessed') return { ...s, series: 'source' };
  const lo = now - (opts.windowDays || WINDOW_DAYS) * DAY, R = [...new Set((runs || []).filter((t) => fin(t) && t >= lo && t <= now))].sort((a, b) => a - b);
  const cg = []; for (let i = 1; i < R.length; i++) cg.push(R[i] - R[i - 1]);
  if (cg.length < MIN_GAPS) return { ...s, series: 'source', basis: s.basis + '; the copy lag is not yet measured (' + cg.length + ' copy gaps)' };
  const late = s.lateAfterMin * 6e4 + quantile(cg, 0.95), down = s.downAfterMin * 6e4 + (cg.length >= P99_GAPS ? quantile(cg, 0.99) : Math.max(...cg));
  const last = Date.parse(s.lastUpdate), age = now - last;
  return { ...s, series: 'source + copy cadence', lateAfterMin: r1(late / 6e4), downAfterMin: r1(down / 6e4),
    status: age > down ? 'down' : age > late ? 'late' : 'ok', since: age > down ? new Date(last + down).toISOString() : age > late ? new Date(last + late).toISOString() : null,
    basis: s.basis + '; widened by the LAMHA copy cadence (95th percentile ' + r1(quantile(cg, 0.95) / 6e4) + ' min, ' + cg.length + ' copy gaps): late after ' + r1(late / 6e4) + ' min, down after ' + r1(down / 6e4) + ' min' };
}

/* -- the MACH database copy -- */
export function parseSyncLog(text) {
  const ok = [], err = [];
  for (const l of String(text || '').split('\n')) { const m = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})Z\s+(.*)$/.exec(l.trim()); if (!m) continue; const t = Date.parse(m[1].replace(' ', 'T') + 'Z');
    const f = /fetched (\d+) readings, (\d+) new/.exec(m[2]); if (f) { if (Number(f[2]) > 0) ok.push(t); } else err.push({ t, why: m[2].slice(0, 120) }); }
  return { ok, err };
}
/* the MACH observation rows (not the forecast rows stored beside them) of the db files of these Pakistan days: [{key, ms}] */
export function machRows(dbDir, days) {
  const out = [];
  for (const d of days) { const rows = readCsv(join(dbDir, 'obs_' + d.replace(/-/g, '') + '.csv'), { key: MACH_ALIASES.key, time: MACH_ALIASES.time, source: MACH_ALIASES.source }); if (!rows) continue;
    for (const r of rows) { if (FORECAST_SRC.has(String(r.source || '').toLowerCase())) continue; const ms = utcMs(r.time); if (fin(ms) && r.key) out.push({ key: r.key, ms }); } }
  return out;
}
/* the MACH source at time t, from the sync log and the readings: readings reach the database only by a successful fetch, so what the
   copy held at t is every reading up to the last successful fetch at or before t */
export function machAt(sync, rows, t, freshMin) {
  const st = cadenceStatus(sync.ok, t);
  const lastOk = sync.ok.filter((x) => x <= t).reduce((a, b) => Math.max(a, b), -Infinity);
  let newest = -Infinity; const keys = new Set();
  for (const r of rows) { if (r.ms > lastOk || r.ms > t + 10 * 60e3) continue; if (r.ms > newest) newest = r.ms; if (r.ms >= t - freshMin * 6e4) keys.add(r.key); }
  const lastErr = sync.err.filter((e) => e.t <= t && e.t > lastOk).slice(-1)[0];
  return { ...st, newestReading: fin(newest) ? new Date(newest).toISOString() : null, stationsReporting: keys.size, freshMin, lastError: lastErr ? lastErr.why : null };
}
/* replay over [from, to] every stepMs: the status sequence and its changes (scripts/tests2837 and CHANGES use it on the 21-22 Oct record) */
export function replayMach(syncText, rows, from, to, stepMs = 10 * 6e4, freshMin = 60) {
  const sync = parseSyncLog(syncText); const seq = [], changes = []; let prev = null;
  for (let t = from; t <= to; t += stepMs) { const s = machAt(sync, rows, t, freshMin); seq.push({ t, status: s.status, ageMin: s.ageMin, stations: s.stationsReporting });
    if (prev !== s.status) { if (s.status === 'ok' && changes.length) { const pl = Date.parse(changes[changes.length - 1].lastUpdate || ''); const f = sync.ok.filter((x) => x > pl && x <= t)[0]; if (fin(f)) s.since = new Date(f).toISOString(); }
      changes.push({ at: new Date(t).toISOString(), atPkt: pktText(t), status: s.status, since: s.since, lastUpdate: s.lastUpdate, sincePkt: s.since ? pktText(Date.parse(s.since)) : null, ageMin: s.ageMin, lateAfterMin: s.lateAfterMin, downAfterMin: s.downAfterMin, lastUpdatePkt: s.lastUpdate ? pktText(Date.parse(s.lastUpdate)) : null, stations: s.stationsReporting, lastError: s.lastError }); prev = s.status; } }
  return { seq, changes };
}

/* -- one check: every feed -- */
export function check(o) {
  const { app, dataDir, copiesDir, now } = o; const F = {}; const PREV = o.prevFeeds || {};
  const OWN = o.ownDir || ownDir(app || join(dataDir, '..'));   /* v91.17.283.28 · NIGRAAN's own feeds (no LAMHA copy) */
  { const af = join(dataDir, 'agents', 'feed', 'awake.json'); const A = noteAwake((readJson(af, {}) || {}).intervals || [], now); AWAKE = A;
    try { writeJsonAtomic(af, { built: new Date(now).toISOString(), rule: 'checks every 10 min; a break over 25 min is asleep or off', intervals: A }); } catch (_) {} }
  const EV = readJson(join(dataDir, 'agents', 'feed', 'events.json'), {}) || {};
  const keep = (id, list) => { const lo = now - (WINDOW_DAYS + 1) * DAY; const s = new Set([...(EV[id] || []), ...list].filter((t) => fin(t) && t >= lo && t <= now + 6e4)); EV[id] = [...s].sort((a, b) => a - b); return EV[id]; };
  const cs = readJson(join(copiesDir, '_state.json'), {}) || {}; const CFG = readJson(join(dataDir, 'copy-sources.json'), {}) || {};
  const copyPart = (ds) => { const d = (cs.datasets || {})[ds] || {}; const lr = Date.parse(d.lastRun || ''); const hist = ((cs.hist || {})[ds] || []).map((x) => x[0]);
    const s = cadenceStatus(keep('copy:' + ds, [...hist, ...(fin(lr) ? [lr] : [])]), now); return { ...s, lastRun: d.lastRun || null, lastCopyOk: d.lastCopyOk || null, why: s.why || d.why || null }; };

  /* MACH */
  try { const db = join(OWN, 'data', 'mach', 'db'); const freshMin = (((CFG.datasets || {}).lamha_mach) || {}).freshMin || 60;
    let txt = ''; try { txt = readFileSync(join(db, 'sync_log.txt'), 'utf8'); } catch (_) {}
    if (!txt) F.mach = { status: 'not assessed', why: 'no MACH database window log yet (nig/own/data/mach/db/sync_log.txt)' };
    else { const sync = parseSyncLog(txt); sync.ok = keep('mach', sync.ok);
      /* v283.44 hotfix: the retired LAMHA copy job's lastRun (frozen 28 Oct, v283.28) pinned this check to 28 Oct; NIGRAAN's own window is judged now */
      const asOf = now;
      const rows = machRows(db, [pktDay(asOf - DAY), pktDay(asOf)]); const src = machAt(sync, rows, asOf, freshMin); const cp = copyPart('lamha_mach');
      const counts = (((cs.hist || {}).lamha_mach) || []).map((x) => x[1]).filter(fin); let fewer = null;
      if (counts.length >= MIN_GAPS) { const p5 = quantile(counts, 0.05); if (src.stationsReporting < p5) fewer = { status: 'late', why: src.stationsReporting + ' stations reporting in ' + freshMin + ' min, below the 5th percentile of the copy checks (' + r1(p5) + ', ' + counts.length + ' checks)' }; }
      let s = src; /* v283.44: the retired copy job (cp) is reported, no longer judged */ if (fewer && RANK[fewer.status] > RANK[s.status]) s = { ...s, status: fewer.status };
      F.mach = { ...src, status: s.status, since: s === src ? src.since : (cp.status === s.status ? cp.since : new Date(now).toISOString()), source: src, copy: cp, fewerStations: fewer,
        detail: (src.stationsReporting) + ' stations in the last ' + freshMin + ' min; newest reading ' + (src.newestReading ? pktText(Date.parse(src.newestReading)) : 'none') + (src.lastError ? '; database fetch failing: ' + src.lastError : '') }; }
  } catch (e) { F.mach = { status: 'not assessed', why: 'check failed: ' + e.message }; }

  /* METAR (airport reports) */
  try { const dir = join(OWN, 'data', 'obs_other', 'metar_live'); const ym = (ms) => new Date(ms).toISOString().slice(0, 7).replace('-', '');
    const files = [...new Set([ym(now - 31 * DAY), ym(now)])].map((m) => join(dir, 'metar_' + m + '.csv'));
    const arr = [], obsT = []; const ap = new Set(); const freshMin = (((CFG.datasets || {}).lamha_metar) || {}).freshMin || 90;
    for (const f of files) { const rows = readCsv(f, { st: ['station'], t: ['time_utc'], rx: ['received_utc'] }) || []; for (const r of rows) { const a = utcMs(r.rx), t = utcMs(r.t); if (fin(a)) arr.push(a); if (fin(t)) { obsT.push(t); if (t >= now - freshMin * 6e4 && t <= now) ap.add(r.st); } } }
    if (!arr.length && !obsT.length) F.metar = { status: 'not assessed', why: 'no airport report in NIGRAAN\'s METAR record yet' };
    else { /* v91.17.283.51 g2 · live test 51: 'Airport reports DOWN' beside 'last update 0 min ago, 8 airports': the status was the worse of the source and
       the retired LAMHA copy job (as MACH before v283.44); the source decides now, the copy is reported, not judged; age at this check */
      const s = cadenceStatus(keep('metar', arr.length ? arr : obsT), now); const cp = copyPart('lamha_metar'); const w = s; void worse;
      F.metar = { ...s, status: w.status, since: w.since, copy: cp, airportsReporting: ap.size, arrival: arr.length ? 'received_utc' : 'report time (no arrival column)', detail: ap.size + ' airports reported in the last ' + freshMin + ' min' }; }
  } catch (e) { F.metar = { status: 'not assessed', why: 'check failed: ' + e.message }; }

  /* IMERG day files */
  try { const dir = join(dataDir, 'imerg'); const ev = []; let newestDay = null;
    for (const d of [dir, join(dir, 'pkt')]) { let names = []; try { names = readdirSync(d).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)); } catch (_) {}
      for (const n of names) { try { ev.push(statSync(join(d, n)).mtimeMs); } catch (_) {} if (!newestDay || n.slice(0, 10) > newestDay) newestDay = n.slice(0, 10); } }
    F.imerg = ev.length ? { ...cadenceStatus(keep('imerg', ev), now), newestDay, detail: 'newest satellite rain day ' + newestDay } : { status: 'not assessed', why: 'no satellite rain day file held (data/imerg)' };
  } catch (e) { F.imerg = { status: 'not assessed', why: 'check failed: ' + e.message }; }

  /* river gauge sheets */
  try { const S = readJson(join(dataDir, 'ffd-drive-state.json'), null); const seen = S && S.seen ? Object.values(S.seen) : [];
    const ev = seen.map((x) => Date.parse(x.at)).filter(fin); const last = seen.slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
    F.river = ev.length ? { ...cadenceStatus(keep('river', ev), now), detail: 'newest sheet ' + (last ? String(last.name || '').replace(/^ffd_drive_/i, 'sheet_') : '-') } : { status: 'not assessed', why: 'no river gauge sheet seen (data/ffd-drive-state.json)' };
  } catch (e) { F.river = { status: 'not assessed', why: 'check failed: ' + e.message }; }

  /* ECMWF 0.1 deg fetcher */
  try { const dir = join(dataDir, 'ecmwf010'); const idx = readJson(join(dir, 'index.json'), null); const st = readJson(join(dataDir, 'ecmwf010-status.json'), null); const ev = [];
    for (const r of (idx && idx.runs) || []) { const id = typeof r === 'string' ? r : (r && (r.run || r.id)); if (!id) continue; try { ev.push(statSync(join(dir, id, 'meta.json')).mtimeMs); } catch (_) {} }
    const errs = st && Array.isArray(st.errors) ? st.errors.length : 0;
    F.ecmwf = ev.length ? { ...cadenceStatus(keep('ecmwf', ev), now), latestRun: idx.latest || null, fetcher: st ? { state: st.state || null, started: st.started || null, errors: errs } : null, detail: 'latest run ' + (idx.latest || '-') + (errs ? '; last fetch had ' + errs + ' error(s)' : '') }
      : { status: 'not assessed', why: 'no ECMWF 0.1 deg run held yet (data/ecmwf010/index.json)' + (st && st.state ? '; fetcher ' + st.state : '') };
  } catch (e) { F.ecmwf = { status: 'not assessed', why: 'check failed: ' + e.message }; }

  /* provider */
  try { const dir = join(dataDir, 'quota-callers'); let files = []; try { files = readdirSync(dir).filter((f) => /^qbr-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort().slice(-(WINDOW_DAYS + 1)); } catch (_) {}
    const lines = []; for (const f of files) { let t = ''; try { t = readFileSync(join(dir, f), 'utf8'); } catch (_) {} for (const l of t.split('\n')) { if (!l.trim()) continue; try { const o = JSON.parse(l); const at = Date.parse(o.at); if (!fin(at)) continue; let c = 0, w = 0, fl = 0; for (const x of Object.values(o.by || {})) { c += x[0] || 0; w += x[1] || 0; fl += x[3] || 0; } lines.push({ at, c, w, fl, day: f.slice(4, 14) }); } catch (_) {} } }
    if (!lines.length) F.provider = { status: 'not assessed', why: 'no per-caller call record (data/quota-callers)' };
    else { const live = cadenceStatus(keep('provider', lines.map((x) => x.at)), now);
      /* failed share of the last 2 hours against the 2-hour windows of the last 30 days: an abnormal failure share is one seen in fewer
         than 1 % of windows (late); every call failing, or more than ever in the 30 days, is down */
      const W2 = 2 * 3600e3, H = new Map(); for (const x of lines) { const h = Math.floor(x.at / W2); const e = H.get(h) || { c: 0, fl: 0 }; e.c += x.c; e.fl += x.fl; H.set(h, e); }
      const cur = lines.filter((x) => x.at > now - W2 && x.at <= now).reduce((a, x) => ({ c: a.c + x.c, fl: a.fl + x.fl }), { c: 0, fl: 0 });
      const hist = [...H.entries()].filter(([h, e]) => (h + 1) * W2 <= now - W2 && e.c > 0).map(([, e]) => e.fl / e.c);
      let fail = { status: 'not assessed', share: cur.c ? r1(100 * cur.fl / cur.c) : null, calls: cur.c, failed: cur.fl };
      if (hist.length >= P99_GAPS && cur.c > 0) { const p99 = quantile(hist, 0.99), mx = Math.max(...hist); const sh = cur.fl / cur.c;
        fail = { ...fail, p99: r1(100 * p99), max: r1(100 * mx), windows: hist.length, status: (sh >= 1 || sh > mx) ? 'down' : sh > p99 ? 'late' : 'ok' }; }
      else if (cur.c > 0 && cur.fl === cur.c) fail = { ...fail, status: 'down' };
      /* today's weighted calls (UTC day, the provider's quota day) against the day's cap */
      const B = readJson(join(dataDir, 'provider-budget.json'), {}) || {}; const today = new Date(now).toISOString().slice(0, 10); const used = lines.filter((x) => x.day === today).reduce((a, x) => a + x.w, 0);
      const dm = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() + 1, 0)).getUTCDate();
      const cap = B.dailyFromPlan && fin(B.monthlyPlanWeighted) ? B.monthlyPlanWeighted / dm : (fin(B.dailyWeightedCap) ? B.dailyWeightedCap : null);
      /* the day's use projected with this computer's own daily profile: today so far plus the median use of the earlier days after
         this time of day (UTC day, the provider's quota day) */
      const tod = now % 864e5; const rest = [...new Set(lines.map((x) => x.day))].filter((d) => d < today).map((d) => lines.filter((x) => x.day === d && (x.at % 864e5) > tod).reduce((a, x) => a + x.w, 0));
      const proj = rest.length ? used + median(rest) : null;
      /* v91.17.283.8 · coordinator (first live alert of v283.7) · the CALL BUDGET is not data freshness: the feed's own status (ok / late / down)
         is its update cadence and its failed calls only; the budget is a separate status, "over budget" (today so far plus the usual rest of
         the day would pass the cap) or "at cap" (the cap is reached), with the projection in the words */
      const nf = (x) => x == null ? '-' : Math.round(x).toLocaleString('en-US');
      const bst = cap == null ? 'not assessed' : used >= cap ? 'at cap' : (proj != null && proj > cap) ? 'over budget' : 'ok';
      const quota = { usedWeighted: Math.round(used), capWeighted: cap == null ? null : Math.round(cap), share: cap ? r1(100 * used / cap) : null, projectedWeighted: proj == null ? null : Math.round(proj),
        status: bst, basis: 'at cap when today\'s weighted calls reach the day\'s cap; over budget when today so far plus the usual rest of the day (median of the earlier days after this hour) would pass it; not a freshness state', projectedFrom: rest.length + ' earlier day(s)',
        text: bst === 'not assessed' ? 'budget not assessed (no daily cap in data/provider-budget.json)' : bst === 'at cap' ? 'AT CAP: ' + nf(used) + ' of the ' + nf(cap) + ' weighted calls of the day used' : bst === 'over budget' ? 'OVER BUDGET: projected ' + nf(proj) + ' of the ' + nf(cap) + ' weighted calls of the day (' + nf(used) + ' used so far)' : 'within budget: ' + nf(used) + ' of ' + nf(cap) + ' weighted calls used' + (proj != null ? ', projected ' + nf(proj) : '') };
      /* v91.17.283.28 · S7 · the call budget is a PROBLEM of this feed (owner): over budget is LATE, at cap is DOWN, in the feed's own status
         and its one alert line (the separate budget alert is gone); the budget words stay in quota / budget */
      /* v91.17.283.31 · owner 29 Oct 2026: the provider bills overage, so the budget is INFORMATION only: it never makes the feed late or down
         and raises no alert. The month to date against the monthly plan is shown with it. */
      const mo = new Date(now).toISOString().slice(0, 7), usedM = lines.filter((x) => String(x.day || '').startsWith(mo)).reduce((a, x) => a + x.w, 0);
      const plan = fin(B.monthlyPlanWeighted) ? B.monthlyPlanWeighted : null, elapsed = (Date.parse(new Date(now).toISOString().slice(0, 10) + 'T00:00:00Z') - Date.parse(mo + '-01T00:00:00Z')) / 864e5 + Math.max(1 / 24, (now % 864e5) / 864e5);
      const projM = Math.round(usedM / elapsed * dm);
      quota.month = { month: mo, usedWeighted: Math.round(usedM), planWeighted: plan, overByWeighted: plan ? Math.max(0, Math.round(usedM - plan)) : null, sharePct: plan ? r1(100 * usedM / plan) : null, projectedWeighted: projM, projectedOverByWeighted: plan ? Math.max(0, projM - plan) : null,
        basis: 'weighted calls in this computer\'s per-caller records for the UTC month so far (days missing from the records count 0); projection = pace so far x days in the month' };
      quota.text += '; month ' + nf(usedM) + (plan ? ' of the ' + nf(plan) + ' plan (' + r1(100 * usedM / plan) + ' %' + (usedM > plan ? ', ' + nf(usedM - plan) + ' over: billed as overage' : '') + ')' : '') + ' · information only, overage allowed';
      const bs = { status: 'ok' };
      const pb = PREV.provider && PREV.provider.budget; const bSince = bs.status !== 'ok' ? (pb && pb.problem && pb.since ? pb.since : new Date(now).toISOString()) : null;   /* the problem's own start, kept across checks */
      const w = [live, { status: fail.status }, bs].reduce(worse);
      F.provider = { ...live, status: w.status, since: w === live ? live.since : w === bs ? bSince : new Date(now).toISOString(), failures: fail, quota, budget: { status: bst, problem: false, info: true, since: bSince, text: quota.text, month: quota.month }, ...(w === bs ? { why: 'call budget: ' + quota.text } : {}),
        detail: 'data: ' + (live.status === 'ok' ? 'fresh' : live.status) + '; calls failed in the last 2 h: ' + (fail.share == null ? '-' : fail.share + ' %') + (fail.p99 != null ? ' (1 % of 2-hour windows above ' + fail.p99 + ' %)' : '') }; }   /* v91.17.283.31 · the budget words stay in budget / quota (information only), not in the status line or an alert */
  } catch (e) { F.provider = { status: 'not assessed', why: 'check failed: ' + e.message }; }

  /* hazard levels engine run */
  try { let head = ''; try { const b = readFileSync(join(dataDir, 'engine-latest.json')); head = b.subarray(0, 4096).toString('utf8'); } catch (_) {}
    const rec = Date.parse((/"received"\s*:\s*"([^"]+)"/.exec(head) || [])[1] || ''); const staleMs = Number(o.engineStaleMs) || null;
    if (!fin(rec)) F.engine = { status: 'not assessed', why: 'no engine run held (data/engine-latest.json)' };
    else { let ev = EV.engine || []; if (ev.length < MIN_GAPS + 1) ev = ev.concat(engineArchiveTimes(dataDir, now));
      const s = cadenceStatus(keep('engine', [...ev, rec]), now); const vu = staleMs ? rec + staleMs : null; let st = s;
      if (vu && now > vu) st = { ...s, status: 'down', since: new Date(vu).toISOString(), why: 'past validUntil (received + ' + Math.round(staleMs / 6e4) + ' min, the engine’s own stale rule)' };
      F.engine = { ...st, validUntil: vu ? new Date(vu).toISOString() : null, detail: 'last run received ' + pktText(rec) + (vu ? '; valid until ' + pktText(vu) : '') }; }
  } catch (e) { F.engine = { status: 'not assessed', why: 'check failed: ' + e.message }; }

  /* the partner-network (LAMHA) copies in nig/data/from_lamha (scripts/agents/lamha_copy.mjs): EWS weather and hydrology from LAMHA's
     run log (each run with new readings), radar per site and product from the copied files' source times (clustered within 10 min: one
     pull) and LAMHA's radar pull log; the MACH database sync of NIGRAAN (data/mach-db-sync.json) and the copy job itself */
  /* v91.17.283.28 · NIGRAAN's own EWS fetch and radar pull write their files directly (no copy lag): the source series is measured as is */
  try { const EWSD = join(OWN, 'data', 'pmd', 'ews_live'), RAD = join(OWN, 'data', 'radar');
    let ews = ''; try { ews = readFileSync(join(EWSD, 'sync_log.txt'), 'utf8'); } catch (_) {}
    const E = parseEwsLog(ews);
    const qc = readJson(join(dataDir, 'agents', 'lamha', 'ews_hydro_qc.json'), null);
    F.ews_weather = ews ? { ...cadenceStatus(keep('ews_weather', E.weather), now), detail: E.lastWeather ? 'last run with new readings ' + pktText(E.lastWeather.t) + ' (' + E.lastWeather.n + ' readings' + (E.lastWeather.st != null ? ', ' + E.lastWeather.st + ' stations with temperature in 2 h' : '') + ')' : 'no run with new readings' }
      : { status: 'not assessed', why: 'no run log of the own EWS fetch yet (nig/own/data/pmd/ews_live/sync_log.txt)' };
    F.ews_hydro = ews ? { ...cadenceStatus(keep('ews_hydro', E.hydro), now), qc: qc ? { stations: qc.totals && qc.totals.stations, withWaterLevelFault: qc.totals && qc.totals.withWaterLevelFault, waterLevelFaultHours: qc.totals && qc.totals.waterLevelFaultHours, withMissingCode: qc.totals && qc.totals.withMissingCode, newestHour: qc.newestHour } : null,
      detail: (E.lastHydro ? 'last run with new hydrology readings ' + pktText(E.lastHydro.t) + ' (' + E.lastHydro.n + ')' : 'no run with hydrology readings') + (qc && qc.totals ? '; QC: ' + qc.totals.withWaterLevelFault + ' of ' + qc.totals.stations + ' stations with -10 m fault hours (' + qc.totals.waterLevelFaultHours + ' h); not scored' : '') }
      : { status: 'not assessed', why: 'no run log of the own EWS fetch yet' };
    let pull = ''; try { pull = readFileSync(join(RAD, 'pull_log.txt'), 'utf8'); } catch (_) {}
    const pulls = parsePullLog(pull);
    for (const site of ['islamabad', 'karachi']) for (const prod of ['sri', 'cappi01', 'rain12']) { if (site === 'karachi' && prod === 'rain12') continue;
      const id = 'radar_' + site + '_' + prod; const d = join(RAD, 'netcdf', site, prod); let files = []; try { files = readdirSync(d).filter((f) => f.endsWith('.nc')); } catch (_) {}
      if (!files.length) { F[id] = { status: 'not assessed', why: 'no file of the own radar pull yet (nig/own/data/radar/netcdf/' + site + '/' + prod + ')' }; continue; }
      const mt = files.map((f) => { try { return statSync(join(d, f)).mtimeMs; } catch (_) { return null; } }).filter(fin);
      const cl = cluster(mt, 10 * 6e4); const newest = files.sort().slice(-1)[0];
      F[id] = { ...cadenceStatus(keep(id, cl), now), pulls: pulls.length, detail: 'newest file ' + newest.replace(/\.nc$/, '') + '; ' + pulls.length + ' radar pull(s) logged' + (pulls.length ? ', last ' + pktText(pulls[pulls.length - 1]) : '') }; }
    const md = readJson(join(dataDir, 'mach-db-sync.json'), null); const mdt = md ? Date.parse(md.finishedAt || md.startedAt || '') : NaN;
    F.mach_db_sync = md ? { ...cadenceStatus(keep('mach_db_sync', fin(mdt) ? [mdt] : []), now), detail: 'last sync ' + (fin(mdt) ? pktText(mdt) : '-') + ' (' + (md.state || '?') + ', ' + (md.newRows ?? '-') + ' new rows, ' + (md.stations ?? '-') + ' stations)' } : { status: 'not assessed', why: 'no data/mach-db-sync.json' };
    /* v91.17.283.28 · the LAMHA copy job is retired (no lamha_copy feed). ISD-Lite and the official AWS (hand-supplied) */
    { const ir = join(app || join(dataDir, '..'), '..', 'station-lake', 'archive', 'isd', 'raw'); const mt = [];
      try { for (const y of readdirSync(ir)) { let fs = []; try { fs = readdirSync(join(ir, y)); } catch (_) { continue; } for (const f of fs) if (f.endsWith('.gz')) { try { mt.push(statSync(join(ir, y, f)).mtimeMs); } catch (_) {} } } } catch (_) {}
      F.isd_lite = mt.length ? { ...cadenceStatus(keep('isd_lite', cluster(mt, 6 * 3600e3)), now), detail: mt.length + ' station-year files; newest NOAA change ' + pktText(Math.max(...mt)) + ' (NOAA\'s Pakistan ISD feed may lag months; METAR and the synop relay are the live records)' } : { status: 'not assessed', why: 'no ISD-Lite file fetched yet (station-lake/archive/isd/raw)' }; }
    { const af = join(app || join(dataDir, '..'), '..', 'station-lake', 'archive', 'pmd_aws', 'pmd_aws_temp_hourly.parquet'); let at = null; try { at = statSync(af).mtimeMs; } catch (_) {}
      F.official_aws = { status: 'not assessed', handSupplied: true, why: 'hand-supplied, no live feed: PMD official AWS arrive only as one-off exports through the drop folder (no portal access, no login)', lastImport: at ? new Date(at).toISOString() : null, detail: at ? 'last export imported ' + pktText(at) : 'no export imported yet' }; }
  } catch (e) { F.ews_weather = F.ews_weather || { status: 'not assessed', why: 'check failed: ' + e.message }; }

  /* v91.17.283.27 · item 8 · the server-polled feeds (server-feeds.json, written by the server before each check) */
  try { const SF = readJson(join(dataDir, 'agents', 'feed', 'server-feeds.json'), null); const at = SF ? Date.parse(SF.at) : NaN;
    for (const [id, f] of Object.entries((SF && SF.feeds) || {})) { const k = 'srv_' + id;
      if (f && f.configured === false) { F[k] = { status: 'not assessed', label: f.label, why: f.why || 'not configured on this server' }; continue; }
      if (!fin(at) || now - at > DAY) { F[k] = { status: 'not assessed', label: f && f.label, why: 'the server has not written its feed status for more than a day (data/agents/feed/server-feeds.json)' }; continue; }
      const lp = Date.parse((f && f.lastPoll) || ''); F[k] = serverFeedStatus(f, PREV[k], keep(k, fin(lp) ? [lp] : []), now); }
    if (!SF) F.srv_feeds = { status: 'not assessed', why: 'no data/agents/feed/server-feeds.json (written by the server before each check)' };
    /* v91.17.283.47 · NIGRAAN 1.0.8 item 3 · a served layer whose inputs are not current (the server's per-layer count of tehsils in the
       state "input not current", -6, which each layer sets by its own input cadence): LATE while some tehsils are, DOWN while none of the
       layer's tehsils is current. No typed number. Names the layer, the count, the reason and the last complete result. */
    const LI = SF && SF.layerInputs; if (LI && LI.layers && fin(at) && now - at <= DAY) for (const [k, x] of Object.entries(LI.layers)) { if (!x) continue; const id = 'inputs_' + k;
      if (!(x.notCurrent > 0)) { F[id] = { status: 'ok', label: 'Inputs of the layer ' + k, detail: 'every tehsil current (issue ' + (LI.at ? pktText(Date.parse(LI.at)) : 'unknown') + ')' }; continue; }
      const p = PREV[id], since = p && (p.status === 'late' || p.status === 'down') && p.since ? p.since : new Date(now).toISOString();
      F[id] = { status: x.current > 0 ? 'late' : 'down', since, label: 'Inputs of the layer ' + k, notCurrent: x.notCurrent, total: x.total,
        detail: x.notCurrent + ' of ' + x.total + ' tehsils input not current (issue ' + (LI.at ? pktText(Date.parse(LI.at)) : 'unknown') + ', day ' + (LI.day || '?') + '): ' + String(x.why || '').slice(0, 200) }; }
  } catch (e) { F.srv_feeds = { status: 'not assessed', why: 'check failed: ' + e.message }; }

  /* disk */
  try { const s = statfsSync(dataDir); const free = s.bavail * s.bsize, total = s.blocks * s.bsize; const D = keepSamples(EV, 'disk', now, free);
    const byDay = new Map(); for (const [t, f] of D) { const d = pktDay(t); const e = byDay.get(d) || { first: f, last: f }; e.last = f; byDay.set(d, e); }
    const drops = [...byDay.values()].map((e) => e.first - e.last).filter((x) => x > 0); const out = { freeGb: Math.round(free / 1e8) / 10, totalGb: Math.round(total / 1e8) / 10, days: byDay.size };
    if (drops.length < 2) F.disk = { ...out, status: 'not assessed', why: drops.length + ' day(s) of measured use (2 needed)', detail: out.freeGb + ' GB free' };
    else { const mx = Math.max(...drops), md = median(drops); const st = free < mx ? 'down' : free < WINDOW_DAYS * md ? 'late' : 'ok';
      F.disk = { ...out, status: st, since: st === 'ok' ? null : new Date(now).toISOString(), medianDailyUseGb: Math.round(md / 1e8) / 10, maxDailyUseGb: Math.round(mx / 1e8) / 10,
        basis: 'down when free space is below the largest day of use measured (' + Math.round(mx / 1e8) / 10 + ' GB); late when it is below 30 days of the median day (' + Math.round(WINDOW_DAYS * md / 1e8) / 10 + ' GB)', detail: out.freeGb + ' GB free; usual day ' + Math.round(md / 1e8) / 10 + ' GB' }; }
  } catch (e) { F.disk = { status: 'not assessed', why: 'check failed: ' + e.message }; }

  /* supervisor restarts */
  try { let txt = ''; try { txt = readFileSync(join(dataDir, 'stops.log'), 'utf8'); } catch (_) {}
    const ev = unplannedStops(txt); const byDay = new Map(); for (const t of ev) byDay.set(pktDay(t), (byDay.get(pktDay(t)) || 0) + 1);
    /* the days the log covers (from its first dated line), at most the last 30, today left out */
    const first = logStart(txt); const days = []; for (let i = 1; i <= WINDOW_DAYS; i++) { const d = pktDay(now - i * DAY); if (first && d < first) break; days.push(byDay.get(d) || 0); }
    const last24 = ev.filter((t) => t > now - DAY && t <= now).length; const p95 = days.length ? quantile(days, 0.95) : null;
    const st = !txt ? 'not assessed' : days.length < MIN_GAPS ? 'not assessed' : last24 > p95 && last24 > 0 ? (last24 > Math.max(...days) ? 'down' : 'late') : 'ok';
    F.restarts = { status: st, since: st === 'ok' || st === 'not assessed' ? null : new Date(now).toISOString(), last24h: last24, p95PerDay: r1(p95), maxPerDay: days.length ? Math.max(...days) : null, recordDays: days.length, lastUnplanned: ev.length ? new Date(ev[ev.length - 1]).toISOString() : null,
      why: !txt ? 'no stops.log' : days.length < MIN_GAPS ? days.length + ' day(s) of stop record (a 95th percentile of daily counts needs ' + MIN_GAPS + ')' : null, basis: 'late when the unplanned stops of the last 24 h exceed the 95th percentile of the daily counts of the last 30 days; down above the highest day',
      detail: last24 + ' unplanned stop(s) in 24 h' + (p95 != null ? ' (usual up to ' + r1(p95) + ' a day over ' + days.length + ' days)' : '') + (ev.length ? '; last ' + pktText(ev[ev.length - 1]) : '') };
  } catch (e) { F.restarts = { status: 'not assessed', why: 'check failed: ' + e.message }; }
  return { feeds: F, events: EV };
}
function keepSamples(EV, id, now, v) { const lo = now - (WINDOW_DAYS + 1) * DAY; const S = (EV[id + ':samples'] || []).filter((x) => x[0] >= lo); S.push([now, v]); EV[id + ':samples'] = S.slice(-6000); return S; }
/* the times of the archived engine results (the archive keeps each changed result; once, while the agent's own record is short) */
function engineArchiveTimes(dataDir, now) {
  const out = []; const dir = join(dataDir, 'archive', 'engine'); let files = []; try { files = readdirSync(dir).filter((f) => /^engine_\d{4}-\d{2}\.jsonl\.gz$/.test(f)).sort().slice(-2); } catch (_) { return out; }
  for (const f of files) { const M = gzMembers(join(dir, f)); if (!M) continue;
    for (const l of M.texts.join('\n').split('\n')) { const m = /"at"\s*:\s*"([^"]+)"/.exec(l.slice(0, 200)); if (m) { const x = Date.parse(m[1]); if (fin(x) && x <= now) out.push(x); } } }
  return out;
}
/* stops.log: the unplanned stops (a crash exit, a server found gone) with their PKT times; planned restarts, deploy retirements and
   sleep resumes are not failures */
export function unplannedStops(text) {
  const out = [];
  for (const l of String(text || '').split('\n')) { const s = l.replace(/^﻿/, '').trim(); let t = null;
    let m = /^\[(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})\]/.exec(s); if (m) t = Date.parse(m[1] + 'T' + m[2] + ':' + m[3] + ':' + m[4] + 'Z') - 5 * 3600e3;
    else { m = /^\[\w{3} (\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/.exec(s); if (m) t = Date.parse(m[3] + '-' + m[1] + '-' + m[2] + 'T' + m[4].padStart(2, '0') + ':' + m[5] + ':' + m[6] + 'Z') - 5 * 3600e3; }
    if (!fin(t)) continue;
    const planned = /planned|clean exit|resume from sleep detected|watchdog start/i.test(s);
    const unplanned = !planned && (/stopped, exit code/i.test(s) || /was gone; started again/i.test(s));
    if (unplanned) out.push(t); }
  return out.sort((a, b) => a - b);
}

function logStart(text) { for (const l of String(text || '').split('\n')) { const s = l.replace(/^\uFEFF/, '').trim(); let m = /^\[(\d{4}-\d{2}-\d{2}) /.exec(s); if (m) return m[1]; m = /^\[\w{3} (\d{2})\/(\d{2})\/(\d{4})/.exec(s); if (m) return m[3] + '-' + m[1] + '-' + m[2]; } return null; }
/* LAMHA's EWS run log (PKT times): runs that brought new weather readings / new hydrology readings */
export function parseEwsLog(text) { const weather = [], hydro = []; let lastWeather = null, lastHydro = null;
  for (const l of String(text || '').split('\n')) { const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}) PKT\s+(.*)$/.exec(l.trim()); if (!m) continue; const t = Date.parse(m[1] + 'T' + m[2] + ':' + m[3] + ':00Z') - 5 * 3600e3;
    const w = /(\d+) new readings/.exec(m[4]), h = /(\d+) new hydro readings/.exec(m[4]), st = /(\d+) stations with temperature/.exec(m[4]);
    if (w && Number(w[1]) > 0) { weather.push(t); lastWeather = { t, n: Number(w[1]), st: st ? Number(st[1]) : null }; } if (h && Number(h[1]) > 0) { hydro.push(t); lastHydro = { t, n: Number(h[1]) }; } }
  return { weather, hydro, lastWeather, lastHydro }; }
/* LAMHA's radar pull log: pulls that downloaded frames (local time PKT) */
export function parsePullLog(text) { const out = []; for (const l of String(text || '').split('\n')) { const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) archive_from \S+: (\d+) new frames listed, (\d+) downloaded/.exec(l.trim()); if (m && Number(m[4]) > 0) out.push(Date.parse(m[1] + 'T' + m[2] + 'Z') - 5 * 3600e3); } return out; }
/* times within gapMs of the previous one belong to one update (a pull writes many files) */
export function cluster(times, gapMs) { const t = [...new Set(times.filter(fin))].sort((a, b) => a - b); const out = []; for (const x of t) { if (!out.length || x - out[out.length - 1].last > gapMs) out.push({ first: x, last: x }); else out[out.length - 1].last = x; } return out.map((c) => c.last); }
export const LABEL = { isd_lite: 'NOAA ISD-Lite (Pakistan stations)', official_aws: 'PMD official AWS (hand-supplied)', ews_weather: 'EWS weather (partner network)', ews_hydro: 'EWS hydrology (partner network)', radar_islamabad_sri: 'Radar Islamabad rain rate', radar_islamabad_cappi01: 'Radar Islamabad CAPPI 1 km', radar_islamabad_rain12: 'Radar Islamabad rain 12 h', radar_karachi_sri: 'Radar Karachi rain rate', radar_karachi_cappi01: 'Radar Karachi CAPPI 1 km', mach_db_sync: 'MACH database sync', lamha_copy: 'Partner-network copy job', mach: 'MACH stations', metar: 'Airport reports', imerg: 'Satellite rain', river: 'River gauge sheet', ecmwf: 'ECMWF 9 km fetcher', provider: 'Forecast provider', engine: 'Hazard levels run', disk: 'Disk', restarts: 'Supervisor restarts' };
/* v91.17.283.27 · item 8 · the server-polled feeds: the label is the server's (server-feeds.json); these are the fall-backs */
/* v91.17.283.47: the layer-input and model-run entries carry their own label (the agent keeps the server's) */
Object.assign(LABEL, { srv_epdhist: 'Punjab EPD district history (7-day gap fill)', srv_epd: 'Punjab EPD air quality page', srv_openaq: 'OpenAQ sensors', srv_synop: 'Synoptic reports (ogimet / IEM)', srv_drive: 'River gauge sheet (Google Drive link)',
  srv_quake: 'Earthquake feed', srv_quake_emsc: 'Earthquake feed (EMSC)', srv_irsa: 'River gauge sheet (measured)', srv_smapfeed: 'Satellite soil moisture', srv_floodobs: 'Observed flood extent (satellite)', srv_glof: 'Glacial lakes refresh', srv_imerg: 'Satellite rain fetcher', srv_ecmwf010: '9 km model fetcher' });   /* v283.28 S7 */

/* == v91.17.283.10 · item 13 · PERSISTENCE BEFORE A LATE ALERT (data/evidence/feed28310/RULES.json, written before the replay) ==========
   v283.9 still flipped "EWS hydrology LATE / recovered" every 30 min on the laptop: the source updates every 30 min, the LAMHA copy every
   30 min and the check every 10 min, so the age at a check reaches 43-57 min in the normal cycle, above the late limit (the 95th percentile
   of the source gaps, 43.2 min, while the copy lag is not yet measured); two checks then agree on LATE, and two on ok after the next copy.
   A LATE status is now alerted only once the incident (now - since) has lasted one full delivery cycle: the feed's measured cadence
   (median update gap) plus its measured copy cadence (median gap of the copy runs that deliver it; 0 when the feed is read directly).
   DOWN is unchanged. No typed threshold: both terms are measured medians. */
export function persistMin(f) { if (!f) return 0; const c = fin(f.cadenceMin) ? f.cadenceMin : 0;
  const cc = fin(f.copyCadenceMin) ? f.copyCadenceMin : (f.copy && fin(f.copy.cadenceMin) ? f.copy.cadenceMin : 0); return r1(c + cc); }
/* one feed's alert decision (pure): p = the feed's previous state, f = this check; returns { f, alert: null | {back, bad} }.
   Two consecutive checks must agree (v91.17.283.9 hysteresis); a young LATE (shorter than persistMin) counts as the written status. */
export function decide(p, f, now, events = []) {
  p = p || {}; const was = p.alerted !== undefined ? p.alerted : (p.status || null);
  f.alerted = was; f.pending = null;
  const P = persistMin(f); let s = f.status;
  if (s === 'late' && fin(Date.parse(f.since || '')) && now - Date.parse(f.since) < P * 6e4 && was !== 'late' && was !== 'down') { s = was === null ? 'ok' : was; f.lateHeld = { persistMin: P, lateForMin: r1((now - Date.parse(f.since)) / 6e4), why: 'late for less than one delivery cycle (cadence ' + (f.cadenceMin ?? '?') + ' + copy ' + (f.copyCadenceMin ?? (f.copy && f.copy.cadenceMin) ?? 0) + ' min): not alerted yet' }; }
  if (was === s) { if (s === 'ok' && p.since && f.status === 'ok') f.since = p.since; return { f, alert: null }; }
  if (!(p.pending && p.pending.status === s)) { f.pending = { status: s, firstSeen: new Date(now).toISOString(), since: f.since || null, lastUpdate: f.lastUpdate || null, prevLastUpdate: p.lastUpdate || null }; return { f, alert: null }; }
  if (p.pending.since && (s === 'late' || s === 'down')) f.since = p.pending.since;
  f.alerted = s;
  if (s === 'ok') { const pl = Date.parse(p.pending.prevLastUpdate || p.lastUpdate || ''); const first = fin(pl) ? (events || []).filter((x) => x > pl && x <= now)[0] : null; f.since = new Date(fin(first) ? first : now).toISOString(); }
  const bad = s === 'late' || s === 'down', back = s === 'ok' && (was === 'late' || was === 'down');
  return { f, alert: bad || back ? { bad, back, was, to: s } : null };
}

/* -- the agent run: check, compare with the last state, alert on a change, write -- */
export function run(o) {
  const now = o.now || Date.now(); const dir = join(o.dataDir, 'agents', 'feed');
  const prev = readJson(join(dir, 'state.json'), {}) || {}; const P = prev.feeds || {};
  const { feeds, events } = check({ ...o, now, prevFeeds: P });
  const alerts = [];
  /* v91.17.283.9 · coordinator · HYSTERESIS: a status change is written (alert record, admin line) only when two consecutive checks agree
     on it, to late / down and back to ok alike; the state keeps the written status (f.alerted) and the one waiting for its second check
     (f.pending). One incident = from its first LATE / DOWN line to its one "recovered" line (late -> down inside it is one more line). */
  for (const [id, f] of Object.entries(feeds)) { const p = P[id] || {};
    const d = decide(p, f, now, events[id] || []); if (!d.alert) continue; const { back, was } = d.alert;   /* v91.17.283.10 · item 13 */
    const a = { at: new Date(now).toISOString(), feed: id, label: LABEL[id] || f.label || id, from: was, to: f.status, since: f.since || null, ageMin: f.ageMin ?? null, cadenceMin: f.cadenceMin ?? null, lateAfterMin: f.lateAfterMin ?? null, downAfterMin: f.downAfterMin ?? null, detail: f.detail || f.why || null };
    a.text = (LABEL[id] || f.label || id) + ': ' + (back ? 'recovered (ok)' : f.status.toUpperCase()) + (f.since ? ' since ' + pktText(Date.parse(f.since)) : '') + (f.ageMin != null && !back ? '; last update ' + f.ageMin + ' min ago' : '') + (f.cadenceMin != null ? ' (normal cadence ' + f.cadenceMin + ' min)' : '') + (a.detail ? '; ' + a.detail : '');
    alerts.push(a); appendLine(join(dir, 'alerts.jsonl'), JSON.stringify(a));
    adminAlert(o.adminDir, '[' + pktText(now) + '] NIGRAAN feed-health: ' + a.text);
  }
  const st = { at: new Date(now).toISOString(), feeds };
  writeJsonAtomic(join(dir, 'state.json'), st); writeJsonAtomic(join(dir, 'events.json'), events);
  appendLine(join(dir, 'checks_' + new Date(now + 5 * 3600e3).toISOString().slice(0, 7) + '.jsonl'), JSON.stringify({ at: st.at, s: Object.fromEntries(Object.entries(feeds).map(([k, f]) => [k, [f.status, f.ageMin ?? null]])) }));
  /* v91.17.283.28 · S7 · the provider's call budget is part of the provider feed's status (over budget LATE, at cap DOWN): no second alert */
  const counts = {}; for (const f of Object.values(feeds)) counts[f.status] = (counts[f.status] || 0) + 1;
  agentLog(o.dataDir, 'feed-health', 'checked ' + Object.keys(feeds).length + ' feeds: ' + Object.entries(counts).map(([k, v]) => v + ' ' + k).join(', ') + (alerts.length ? '; ' + alerts.length + ' alert(s): ' + alerts.map((a) => a.label + ' ' + a.to).join(', ') : ''), { alerts: alerts.length }, now);
  return { state: st, alerts };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const A = args(); const app = A.app || join(fileURLToPath(new URL('.', import.meta.url)), '..', '..'); const dataDir = A.data || join(app, 'data');
  const rel = takeLock(join(dataDir, 'agents', 'feed-health.lock'), 9 * 60e3); if (!rel) { console.log('another feed-health check is running'); process.exit(5); }
  try { const r = run({ app, dataDir, copiesDir: A.copies || join(app, '..', 'copies'), adminDir: A.admin ? (A.admin === '-' ? null : A.admin) : adminDir(app), engineStaleMs: A['engine-stale-ms'], ownDir: A.own || undefined, now: A.now ? Date.parse(A.now) : undefined });
    console.log('feed-health: ' + Object.entries(r.state.feeds).map(([k, f]) => k + ' ' + f.status).join(', ') + (r.alerts.length ? ' | alerts: ' + r.alerts.map((a) => a.text).join(' | ') : ''));
  } finally { rel(); }
}
