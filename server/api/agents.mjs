/* == v91.17.283.7 . THE IN-PRODUCT AGENTS: SCHEDULED CHILD PROCESSES (outside the request path) ====================================
   NIGRAAN checks itself. Two agents run on this computer as child processes of the server, the pattern of the ECMWF fetcher
   (ecmwf010.mjs + scripts/ecmwf/*): lowest CPU priority (Windows IDLE class), their own time limit inside a kill timer, a lock file
   against a second copy (exit 5), and only on the server that holds the data folder (the scheduler's gate: a deploy's standby or
   draining server starts none).
     feed-health   every 10 min (first 2 min after start), node scripts/agents/feed_health.mjs, 8 min limit
     verification  checked every 10 min (first 4 min after start); runs once a Pakistan day from 06:30 PKT, scoring yesterday; on a
                   computer with no ledger yet it first back-fills the last 30 days from the as-issued archives; 45 min limit
   They READ archives, copies and logs and WRITE only under data/agents/ (state, alerts, ledger, summary, the day log) plus one plain
   line per feed alert to _admin\alerts.log. They never change a served value and make no provider call (no network code at all).
     flood shadow  (v91.17.283.8) checked hourly; once a Pakistan day from 07:00 PKT, node scripts/agents/flood_shadow.mjs, 50 min limit:
                   two flood candidates as daily shadow outputs and the flood-truth drop folder (never served)
     diagnostic    (v91.17.283.10) checked every 10 min; once a Pakistan day from 06:50 PKT (after the verification), node scripts/agents/
                   diagnose.mjs, 30 min limit: what is causing the verification's flags (chain steps, stations, sensors, heat inputs);
                   candidates with evidence and a suggested test, never an action
   NIGRAAN_AGENTS=0 stops them all (NIGRAAN_FLOOD_SHADOW=0 the flood shadow only, NIGRAAN_DIAGNOSE=0 the diagnostic only). Operator reads (operator scope only, never a customer view):
     GET /api/ops/agents                 feed status, recent alerts, verification summary, drift flags, the client-line state, today's log
     GET /api/ops/agents?run=feed|verify|diagnose start that agent now (operator on this computer) */
import { fcArchiveFeed } from './fcarchive.mjs';   /* v91.17.283.33 */
import { existsSync, readFileSync, readdirSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as PATH from 'node:path';
import { schedule } from './scheduler.mjs';
import { STALE_MS } from './engine.mjs';
import { runJob, jobKeyOf } from './jobrun.mjs';
import { createExperimentAgents } from './agents_exp.mjs';   /* v91.17.283.10 · agents 6 and 7 */

const PKT = 5 * 3600e3;
const pktDay = (ms) => new Date(ms + PKT).toISOString().slice(0, 10);
const readJson = (f, d = null) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch (_) { return d; } };
/* the agents' own files (named here so the release packer ships them: scripts/pack-release.mjs collects the paths the server code names) */
export const AGENT_FILES = ['scripts/agents/feed_health.mjs', 'scripts/agents/verify.mjs', 'scripts/agents/lib.mjs', 'scripts/agents/lamha_copy.mjs', 'scripts/agents/lamha_qc.py', 'scripts/agents/radar_points.py',
  'server/api/obsqc.mjs', 'data/obs-qc-params.json', 'data/obs-qc-marks.json', 'scripts/lib/obsqc_truth.py',   /* v91.17.283.14 · the value-level quality control every agent reads through */
  'scripts/agents/flood_shadow.mjs', 'scripts/agents/flood_truth_score.py', 'data/evidence/flood/fx_rp_test.json', 'data/evidence/flood/fx_dated_test_2022dated.json', 'data/evidence/flood/a3_trigger_test_2022.json', 'data/evidence/flood/a3_pooled_2025_2022.json',   /* v91.17.283.8 · agent 4: the flood shadow */
  'scripts/agents/diagnose.mjs', 'scripts/agents/diagnose_replay.py',   /* v91.17.283.10 · agent 5: the diagnostic */
  'scripts/agents/experiments.mjs', 'scripts/agents/exp_registry.mjs', 'scripts/agents/exp_pointer.mjs', 'scripts/agents/exp_run.py', 'scripts/agents/proposals.mjs', 'scripts/agents/exp/rules_source.json',
  'scripts/agents/exp/blend_r.py', 'scripts/agents/exp/cand_temp.py', 'scripts/agents/exp/cand_height.py', 'scripts/agents/exp/fx_dated_test2.py', 'scripts/agents/exp/exp_a3_rerun.py',
  'scripts/gen/exp_approve.mjs', 'server/api/agents_exp.mjs', 'server/api/agents_exp_ui.js', 'data/evidence/flood/a3_trigger_test_2025.json'];   /* v91.17.283.10 · agents 6 (experimentation) and 7 (weekly proposals) */
export const FLOOD_AT_PKT_MIN = 7 * 60;   /* 07:00 PKT: after the morning issue is archived and the river forecast refreshed */
export const DIAG_AT_PKT_MIN = 6 * 60 + 50;   /* v91.17.283.10 · 06:50 PKT: after the verification has scored yesterday */
export const VERIFY_AT_PKT_MIN = 6 * 60 + 30;   /* 06:30 PKT: the night's observations are in and the morning issue is out */

export function createAgents(app, root, dataDir, opts = {}) {
  const on = () => process.env.NIGRAAN_AGENTS !== '0';
  const dir = join(dataDir, 'agents');
  const copiesDir = () => { try { if (app.copies && app.copies.copiesDir) return app.copies.copiesDir; } catch (_) {} return join(root, '..', 'copies'); };
  const lake = opts.lake || join(root, '..', 'station-lake');
  /* v91.17.283.7 · the partner-network (LAMHA) copies: D:\NIGRAAN\nig\data\from_lamha, copied from D:\LAMHA (read only) by agent 3 */
  /* v91.17.283.28 · retired (NIGRAAN independent of LAMHA): the two folders below are only named in the path scrub of the agents' text
     (scrubPaths); no agent reads them. The feed and verification agents read NIGRAAN's own folder nig/own (server/api/ownpaths.mjs). */
  const fromLamha = () => process.env.NIGRAAN_FROM_LAMHA_DIR || join(root, '..', 'data', 'from_lamha');
  const lamhaDir = () => process.env.NIGRAAN_LAMHA_DIR || join(root, '..', '..', '..', 'LAMHA');
  const st = { feed: { busy: false, lastStart: null, lastEnd: null, lastCode: null, tail: null, runs: 0 }, verify: { busy: false, lastStart: null, lastEnd: null, lastCode: null, tail: null, runs: 0, mode: null }, lamha: { busy: false, lastStart: null, lastEnd: null, lastCode: null, tail: null, runs: 0 }, flood: { busy: false, lastStart: null, lastEnd: null, lastCode: null, tail: null, runs: 0 }, diag: { busy: false, lastStart: null, lastEnd: null, lastCode: null, tail: null, runs: 0 } };

  async function child(name, script, args, capMin, heapMb) {
    const OS = await import('node:os');
    const a = (heapMb ? ['--max-old-space-size=' + heapMb] : []).concat([join(root, 'scripts', 'agents', script), ...args]);
    /* v283.51g3 · item 2 · runJob (jobrun.mjs): limit 3 x the agent's normal run, process tree ended on overrun, logged in server.log */
    const r = await runJob(jobKeyOf(script, args), process.execPath, a, { capMin, keepChars: 4000, cwd: root, env: { ...process.env, NODE_OPTIONS: '' },
      onSpawn: (ch) => { try { if (ch.pid) OS.setPriority(ch.pid, OS.constants.priority.PRIORITY_LOW); st[name].lowPriority = true; } catch (e) { st[name].lowPriority = 'not set: ' + e.message; } } });
    st[name].limitMin = r.limitMin; return { code: r.code, out: r.out };
  }
  /* v91.17.283.27 · item 8 · THE SERVER-POLLED FEEDS for the feed-health agent (it reads files only): each module's own status()
     (lastPoll = the last good poll, lastError = the last poll's error) and its own period (the scheduler's job, when it has one) */
  function serverFeeds(now = Date.now()) {
    const jobs = new Map(); try { for (const j of (app.scheduler && app.scheduler.list ? app.scheduler.list().jobs : [])) jobs.set(j.id, j); } catch (_) {}
    const per = (id) => { const j = jobs.get(id); return j && Number.isFinite(j.everyMin) ? Math.round(j.everyMin * 6e4) : null; };
    const F = {}; const safe = (f) => { try { return f(); } catch (e) { return { lastError: 'status failed: ' + e.message }; } };
    if (app.epd && app.epd.status) { const x = safe(() => app.epd.status()); F.epd = { label: 'Punjab EPD air quality page', configured: x.on !== false, lastPoll: x.lastPoll || null, lastError: x.lastError || null, everyMs: per('epdaq') };
      /* v91.17.283.30 · the daily district-history read (gap fill), judged on its own period */
      const hh = x.history || {}; F.epdhist = { label: 'Punjab EPD district history (7-day gap fill)', configured: x.on !== false, lastPoll: hh.lastOk || null, lastError: hh.lastError || null, everyMs: 24 * 3600e3 }; }
    if (app.dos && app.dos.status) { const x = safe(() => app.dos.status()); F.dos = { label: 'US Department of State air-quality monitors', configured: x.on !== false, lastPoll: x.lastOk || null, lastError: x.lastError || null, everyMs: per('dosaq') }; }   /* v91.17.283.52 E */
    if (app.openaq && app.openaq.status) { const x = safe(() => app.openaq.status()); F.openaq = { label: 'OpenAQ sensors', configured: x.on !== false && x.keyPresent !== false, why: x.keyPresent === false ? 'no OpenAQ key on this server' : undefined, lastPoll: x.lastPoll || null, lastError: x.lastError || null, everyMs: per('openaq') }; }
    if (app.synop && app.synop.status) { const x = safe(() => app.synop.status()); F.synop = { label: 'Synoptic reports (ogimet / IEM)', configured: x.on !== false, lastPoll: x.lastPoll || null, lastError: x.lastError || null, everyMs: per('synop') }; }
    if (app.driveFetch && app.driveFetch.status) { const x = safe(() => app.driveFetch.status()); const L = x.last || null;
      F.drive = { label: 'River gauge sheet (Google Drive link)', configured: !!x.configured, why: x.configured ? undefined : 'no Google Drive link set', lastPoll: L && !L.error && L.at ? L.at : null, lastError: L ? L.error || null : null, everyMs: per('driveFetch') }; }
    /* v91.17.283.28 · S7 · the server-polled feeds that had no entry: each module's own last good poll, last error and DECLARED cadence (the
       period of its own refresh rule; everyWhat says which), so a short history still gives LATE / DOWN on the declared cadence */
    const iso = (x) => (x ? new Date(x).toISOString() : null), ok = (at, err) => (at && !err ? at : null);
    if (app.quake && app.quake.status) { const x = safe(() => app.quake.status()); F.quake = { label: 'Earthquake feed', configured: true, lastPoll: x.lastPollOk || null, lastError: x.lastError || null, everyMs: Number.isFinite(x.feedSeconds) ? x.feedSeconds * 1000 : per('quake-feed'), everyWhat: 'the earthquake rule\u2019s feed poll period (data/seismic-felt-rule.json poll.feedSeconds)' }; }
    /* v91.17.283.31 · owner request · the second earthquake source, its own entry with the same declared period */
    /* v283.31: the river gauge sheet (measured flows, daily; internal) */
    if (app.riverSheet) F.irsa = safe(() => irsaFeed(app));
    F.fcArchive = safe(() => fcArchiveFeed(root));   /* v91.17.283.33 · the daily forecast archive (pyjob fcArchive) */
    if (app.quake && app.quake.status) { const x = safe(() => app.quake.status()); const E = x && x.emsc; if (E && E.on) F.quake_emsc = { label: 'Earthquake feed (EMSC)', configured: true, lastPoll: E.lastPollOk || null, lastError: E.lastError || null, everyMs: Number.isFinite(E.periodSeconds) ? E.periodSeconds * 1000 : per('quake-emsc'), everyWhat: 'the same poll period as the USGS feed (data/seismic-felt-rule.json poll.feedSeconds)' }; }
    if (app.smap && app.smap.status) { const x = safe(() => app.smap.status()); const tk = x.token && x.token.present;
      F.smapfeed = { label: 'Satellite soil moisture', configured: x.on !== false && tk !== false, why: tk === false ? 'no Earthdata token on this server' : undefined, lastPoll: ok(x.lastCheck, x.lastError), lastError: x.lastError || null, everyMs: 12 * 3600e3, everyWhat: 'its refresh rule: a new read when the held one is 12 h old (smapfeed.mjs)' }; }
    if (app.floodobs && app.floodobs.status) { const x = safe(() => app.floodobs.status()); const tk = x.token && x.token.present;
      F.floodobs = { label: 'Observed flood extent (satellite)', configured: x.on !== false && tk !== false, why: tk === false ? 'no Earthdata token on this server' : undefined, lastPoll: ok(x.lastCheck, x.lastError), lastError: x.lastError || null, everyMs: per('floodobs'), everyWhat: 'its schedule (every 6 h, floodobs.mjs)' }; }
    if (app.glof && app.glof.status) { const x = safe(() => app.glof.status()); F.glof = { label: 'Glacial lakes refresh', configured: x.register !== 'off', lastPoll: x.checkedAt || null, lastError: x.lastError || null, everyMs: per('glof'), everyWhat: 'its schedule (every 12 h, glof.mjs)' }; }
    if (app.imerg && app.imerg.status) { const x = safe(() => app.imerg.status()); const tk = x.token && x.token.present;
      F.imerg = { label: 'Satellite rain fetcher', configured: tk !== false, why: tk === false ? 'no Earthdata token on this server' : undefined, lastPoll: ok(x.lastRunAt, x.lastError), lastError: x.lastError || null, everyMs: per('imerg'), everyWhat: 'its schedule (every 6 h, imerg.mjs)' }; }
    if (app.ecmwf010 && app.ecmwf010.status) { const x = safe(() => app.ecmwf010.status()); const good = x.lastEnd && (x.lastCode === 0 || x.lastCode === 3);
      F.ecmwf010 = { label: '9 km model fetcher', configured: x.on !== false, lastPoll: good ? iso(Date.parse(x.lastEnd)) : null, lastError: x.lastEnd && !good && x.lastCode !== 5 ? 'the fetcher ended with code ' + x.lastCode : null,   /* 5 = another fetcher held the lock: neither */ everyMs: Number.isFinite(x.everyMin) ? x.everyMin * 6e4 : per('ecmwf010'), everyWhat: 'the fetcher\u2019s check period (ecmwf010.mjs everyMin)' }; }
    /* v91.17.283.47 · NIGRAAN 1.0.8 item 3 · THE PROVIDER'S MODEL RUNS AS FEEDS: each domain the forecasts are built from (modelruns.mjs, the
       provider's own meta.json): the arrival of its newest run is the "good poll", its own update interval (update_interval_seconds) the
       declared cadence, so the agent's declared-cadence rule (LATE after two intervals, DOWN after one more) judges it. Found 2 Nov: the
       provider's ICON-EPS domain (dwd_icon_eps, a probability member of best_match) last ran 2026-10-06 00 UTC and nothing raised it. */
    try { const MS = app.modelRuns && app.modelRuns.status ? app.modelRuns.status() : null;
      for (const [k, e] of Object.entries((MS && MS.domains) || {})) { if (!e || !e.intervalH) continue; const id = 'run_' + k.replace(/[^a-z0-9]+/gi, '_');
        F[id] = { label: 'Provider model run ' + k.split('|')[1] + ' (' + k.split('|')[0] + ')', configured: true, lastPoll: e.available || e.run || null, lastError: e.error || null, everyMs: e.intervalH * 3600e3,
          everyWhat: 'the provider\u2019s own update interval for this model (' + e.intervalH + ' h, meta.json update_interval_seconds)', run: e.run, kind: 'model-run' }; } } catch (_) {}
    const startedAt = new Date(now - process.uptime() * 1000).toISOString();
    for (const k of Object.keys(F)) { F[k].startedAt = startedAt; if (!F[k].everyWhat && F[k].everyMs) F[k].everyWhat = 'its schedule (the server\u2019s scheduler period)'; }
    return { at: new Date(now).toISOString(), what: 'the server-polled feeds for the feed-health agent (scripts/agents/feed_health.mjs); written before each check', feeds: F, layerInputs: layerInputs() };
  }
  /* v91.17.283.47 · item 3 · THE LAYERS WHOSE INPUTS ARE NOT CURRENT: per layer of the held issue (day 0), the tehsils in the state "input
     not current" (-6: an input older than its own cadence or not covering the day; the layer's own rule), the most common reason and the
     date of the last complete result. Read by the feed-health agent (a layer with such tehsils is LATE, with none current DOWN). */
  function layerInputs() { try { const L = app.engine && app.engine.latest ? app.engine.latest() : null; const d0 = L && Array.isArray(L.days) ? (L.days.find((d) => d.day === 0) || L.days[0]) : null; if (!d0 || !d0.layers) return null;
      const out = {}; for (const [k, X] of Object.entries(d0.layers)) { if (!X || !X.L) continue; let n = 0, cur = 0, tot = 0; const why = {};
        for (const [u, c] of Object.entries(X.L)) { tot++; if (c === -6) { n++; const w = String((X.why && X.why[u]) || 'input not current'); why[w] = (why[w] || 0) + 1; } else if (c >= 0 || c === -5) cur++; }
        out[k] = { total: tot, notCurrent: n, current: cur, why: n ? Object.entries(why).sort((a, b) => b[1] - a[1])[0][0] : null }; }
      return { at: L.received || null, day: d0.date || null, layers: out }; } catch (_) { return null; } }
  function writeServerFeeds() { try { const d = join(dir, 'feed'); mkdirSync(d, { recursive: true }); const f = join(d, 'server-feeds.json');
    writeFileSync(f + '.tmp', JSON.stringify(serverFeeds(), null, 1)); renameSync(f + '.tmp', f); return true; } catch (_) { return false; } }
  async function runFeed() {
    if (!on() || st.feed.busy) return { started: false, busy: st.feed.busy };
    writeServerFeeds();
    st.feed.busy = true; st.feed.lastStart = new Date().toISOString(); st.feed.runs++;
    try { const r = await child('feed', 'feed_health.mjs', ['--app', root, '--data', dataDir, '--copies', copiesDir(), '--engine-stale-ms', String(STALE_MS)], 8, 512);
      st.feed.lastCode = r.code; st.feed.tail = r.out.trim().split('\n').slice(-3).map((x) => x.slice(0, 400)); return { started: true, code: r.code };
    } finally { st.feed.busy = false; st.feed.lastEnd = new Date().toISOString(); }
  }
  /* due: no ledger yet (back-fill 30 days); or, from 06:30 PKT, any day of the last 30 up to yesterday that the ledger lacks or holds as
     incomplete (scored before its observations arrived, retried for 7 days). v91.17.283.23 · self-audit J1: before, only yesterday was
     asked, so the days the laptop was off were never scored */
  function verifyDue(now = Date.now()) {
    const L = join(dir, 'verify', 'ledger.jsonl'); const have = new Map(); let n = 0;
    try { for (const l of readFileSync(L, 'utf8').split('\n')) { if (!l.trim()) continue; n++; const m = /"day"\s*:\s*"(\d{4}-\d{2}-\d{2})"/.exec(l); if (m) have.set(m[1], /"incomplete"\s*:/.test(l)); } } catch (_) {}
    const today = pktDay(now), yday = pktDay(now - 864e5); const minOfDay = Math.floor(((now + PKT) % 864e5) / 6e4);
    if (!n) return { due: true, mode: 'backfill', span: 30, why: 'no ledger yet: back-fill the last 30 days' };
    const miss = []; for (let i = 30; i >= 1; i--) { const d = pktDay(now - i * 864e5); if (i === 1 && minOfDay < VERIFY_AT_PKT_MIN) continue;
      const inc = have.get(d); if (!have.has(d) || (inc && i <= 7)) miss.push(d); }
    if (miss.length) { const span = Math.round((Date.parse(today) - Date.parse(miss[0])) / 864e5);
      return { due: true, mode: miss.length === 1 && miss[0] === yday ? 'day' : 'gaps', day: miss.length === 1 ? miss[0] : null, span, days: miss, why: (miss.length === 1 ? 'run for ' + miss[0] : miss.length + ' days to score (' + miss[0] + ' to ' + miss[miss.length - 1] + ')') }; }
    return { due: false, next: minOfDay >= VERIFY_AT_PKT_MIN ? pktDay(now + 864e5) + ' 06:30 PKT' : today + ' 06:30 PKT' };
  }
  async function runVerify(force = false) {
    if (!on() || st.verify.busy) return { started: false, busy: st.verify.busy };
    const d = verifyDue(); if (!d.due && !force) return { started: false, ...d };
    st.verify.busy = true; st.verify.lastStart = new Date().toISOString(); st.verify.runs++; st.verify.mode = d.due ? d.mode : 'day';
    try { const args = ['--app', root, '--data', dataDir, '--copies', copiesDir(), '--lake', lake].concat(d.mode === 'backfill' || d.mode === 'gaps' ? ['--backfill', String(d.span || 30)] : ['--day', d.day || pktDay(Date.now() - 864e5)]).concat(force ? ['--force'] : []);
      const r = await child('verify', 'verify.mjs', args, 45, 1536); st.verify.lastCode = r.code; st.verify.tail = r.out.trim().split('\n').slice(-3).map((x) => x.slice(0, 400));
      if (r.code && r.code !== 5) throw new Error('verify.mjs exited ' + r.code + ': ' + (st.verify.tail.slice(-1)[0] || ''));
      return { started: true, code: r.code };
    } finally { st.verify.busy = false; st.verify.lastEnd = new Date().toISOString(); }
  }

  async function runLamha() {
    if (!on() || process.env.NIGRAAN_LAMHA_COPY === '0' || st.lamha.busy) return { started: false, busy: st.lamha.busy };
    st.lamha.busy = true; st.lamha.lastStart = new Date().toISOString(); st.lamha.runs++;
    try { const r = await child('lamha', 'lamha_copy.mjs', ['--app', root, '--data', dataDir], 25, 512);   /* v91.17.283.28 · retired copy: only the hydrology QC of NIGRAAN's own EWS store; nothing under D:\\LAMHA is opened */
      st.lamha.lastCode = r.code; st.lamha.tail = r.out.trim().split('\n').slice(-3).map((x) => x.slice(0, 400)); return { started: true, code: r.code };
    } finally { st.lamha.busy = false; st.lamha.lastEnd = new Date().toISOString(); }
  }
  /* v91.17.283.8 · agent 4 · the flood shadow: once a Pakistan day from 07:00 PKT (and the truth drop folder is registered on every run) */
  function floodDue(now = Date.now()) { const day = pktDay(now), minOfDay = Math.floor(((now + PKT) % 864e5) / 6e4);
    const f = join(dir, 'flood', 'shadow', day + '.json'), has = existsSync(f);
    /* v91.17.283.23 · self-audit J6 · a day written with a candidate not assessed or partial (its inputs were not in yet) is done again, at most
       every 2 hours, the same day */
    let redo = false; if (has) { const S = readJson(f, null); const bad = S && S.candidates && Object.values(S.candidates).some((c) => c && (c.status === 'not assessed' || c.status === 'partial'));
      redo = !!bad && !(Date.now() - Date.parse(S.at || 0) < 2 * 3600e3); }
    return { due: minOfDay >= FLOOD_AT_PKT_MIN && (!has || redo), day, why: has ? (redo ? 'redo ' + day + ': a candidate was not assessed or partial' : 'done for ' + day) : minOfDay < FLOOD_AT_PKT_MIN ? 'waits for 07:00 PKT' : 'daily shadow for ' + day }; }
  async function runFlood(force = false) {
    if (!on() || process.env.NIGRAAN_FLOOD_SHADOW === '0' || st.flood.busy) return { started: false, busy: st.flood.busy };
    const d = floodDue(); st.flood.busy = true; st.flood.lastStart = new Date().toISOString(); st.flood.runs++;
    /* v91.17.283.24 · the hourly tick that is not due (before 07:00 PKT, or the day done) only registers the truth drop folder and scores
       it (--truth-only): before, a missing day file made the child compute the day's shadow at any hour, e.g. 00:09 PKT, from the
       previous morning's inputs, and that day then counted as done */
    try { const r = await child('flood', 'flood_shadow.mjs', ['--app', root, '--data', dataDir, '--day', d.day].concat(force || d.due ? ['--force'] : ['--truth-only']), 50, 1024);
      st.flood.lastCode = r.code; st.flood.tail = r.out.trim().split('\n').slice(-3).map((x) => x.slice(0, 400)); return { started: true, code: r.code };
    } finally { st.flood.busy = false; st.flood.lastEnd = new Date().toISOString(); }
  }
  /* v91.17.283.10 · agent 5 · the diagnostic: once a Pakistan day from 06:50 PKT, for yesterday, when the verification is not running */
  /* v91.17.283.23 · self-audit J14 · the diagnosis also waits until yesterday is verified (in the ledger and complete), up to 12:00 PKT */
  const verifiedDay = (day) => { try { for (const l of readFileSync(join(dir, 'verify', 'ledger.jsonl'), 'utf8').split('\n')) if (l.indexOf('"day":"' + day + '"') >= 0 || l.indexOf('"day": "' + day + '"') >= 0) return !/"incomplete"\s*:/.test(l); } catch (_) {} return false; };
  function diagDue(now = Date.now()) { const day = pktDay(now - 864e5), minOfDay = Math.floor(((now + PKT) % 864e5) / 6e4);
    const has = existsSync(join(dir, 'diagnose', day + '.json')); if (!has && minOfDay >= DIAG_AT_PKT_MIN && minOfDay < 12 * 60 && !st.verify.busy && !verifiedDay(day)) return { due: false, day, why: 'waits for the verification of ' + day + ' (until 12:00 PKT)' };
    return { due: minOfDay >= DIAG_AT_PKT_MIN && !has && !st.verify.busy, day, why: has ? 'done for ' + day : minOfDay < DIAG_AT_PKT_MIN ? 'waits for 06:50 PKT' : st.verify.busy ? 'waits for the verification' : 'daily diagnosis for ' + day }; }
  async function runDiag(force = false) {
    if (!on() || process.env.NIGRAAN_DIAGNOSE === '0' || st.diag.busy) return { started: false, busy: st.diag.busy };
    const d = diagDue(); if (!d.due && !force) return { started: false, ...d };
    st.diag.busy = true; st.diag.lastStart = new Date().toISOString(); st.diag.runs++;
    try { const r = await child('diag', 'diagnose.mjs', ['--app', root, '--data', dataDir, '--copies', copiesDir(), '--lake', lake, '--day', d.day].concat(force ? ['--force'] : []), 30, 1536);
      st.diag.lastCode = r.code; st.diag.tail = r.out.trim().split('\n').slice(-3).map((x) => x.slice(0, 400)); return { started: true, code: r.code };
    } finally { st.diag.busy = false; st.diag.lastEnd = new Date().toISOString(); }
  }
  function diagReport() { const L = readJson(join(dir, 'diagnose', 'latest.json'), null); if (!L) return { due: diagDue(), last: null };
    return { due: diagDue(), last: { day: L.day, built: L.built, window: L.window, summary: L.summary, method: L.method, rule: L.rule, count: (L.items || []).length,
      byKind: (L.items || []).reduce((a, x) => { a[x.kind] = (a[x.kind] || 0) + 1; return a; }, {}),
      items: (L.items || []).slice(0, 40).map((x) => ({ id: x.id, rank: x.rank, kind: x.kind, title: x.title, responsible: x.responsible, size: x.size, evidence: x.evidence, nextTest: x.nextTest, suggestedTest: x.suggestedTest || null, where: x.where })),
      flags: (L.flags || []).map((f) => ({ from: f.from, text: f.text, verdict: f.verdict, causes: f.causes })), steps: (L.sources && L.sources.steps) || [], replays: (L.sources && L.sources.replays) || [], heatInputs: L.tables && L.tables.heatInputs, networkHumidity: L.tables && L.tables.networkHumidity } }; }
  function floodReport() { const days = (() => { try { return readdirSync(join(dir, 'flood', 'shadow')).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort(); } catch (_) { return []; } })();
    const last = days.length ? readJson(join(dir, 'flood', 'shadow', days[days.length - 1]), null) : null;
    const slim = last ? { day: last.day, at: last.at, candidates: Object.fromEntries(Object.entries(last.candidates || {}).map(([k, c]) => [k, { id: c.id, what: c.what, status: c.status, why: c.why || null, served: false,
      ...(c.reaches ? { reaches: Object.fromEntries(Object.entries(c.reaches).map(([r, x]) => [r, x.why ? { why: x.why } : { peakM3s: x.peakM3s, rp: x.rp, mapRp: x.mapRp, floodedKm2: x.floodedKm2 }])) } : {}),
      ...(c.missingTiles && c.missingTiles.length ? { missingTiles: c.missingTiles.length } : {}), ...(c.tehsils != null ? { tehsils: c.tehsils, withSignal: c.withSignal } : {}) }])) } : null;
    return { rule: 'shadow only, never served; fx-model stays served:false until the RULES.md R2 decision passes', days: days.length, last: slim, state: readJson(join(dir, 'flood', 'state.json'), null),
      truth: (() => { const R = readJson(join(dataDir, 'flood-truth', 'registry.json'), null); return R ? R.entries.map((e) => ({ id: e.id, window: e.window, status: e.status, bytes: e.bytes })) : []; })(),
      scores: tailLines(join(dir, 'flood', 'scores.jsonl'), 10).reverse(), due: floodDue() }; }
  function tailLines(f, n) { try { const a = readFileSync(f, 'utf8').split('\n').filter(Boolean); return a.slice(-n).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean); } catch (_) { return []; } }
  function report() {
    const feed = readJson(join(dir, 'feed', 'state.json'), null); const sum = readJson(join(dir, 'verify', 'summary.json'), null);
    const today = pktDay(Date.now()); const log = tailLines(join(dir, 'log', today + '.jsonl'), 200);
    let jobs = null; try { jobs = app.scheduler ? app.scheduler.list().jobs.filter((j) => /^agent/.test(j.id)) : null; } catch (_) {}
    /* v91.17.283.25 · the EWS live anchor, shadow only: the server's hourly state and the verification agent's running comparison (operator line) */
    let ewsShadow = null; try { ewsShadow = app.ewsAnchor ? app.ewsAnchor.status() : null; } catch (_) { ewsShadow = null; }
    const ewsAnchor = { line: sum && sum.ewsAnchor && sum.ewsAnchor.line ? sum.ewsAnchor.line : 'EWS anchor (shadow, not served): no scored day yet', shadow: ewsShadow, scored: (sum && sum.ewsAnchor) || null,
      promotion: readJson(join(dir, 'verify', 'ews-anchor-promotion.json'), null), served: false };
    return { on: on(), at: new Date().toISOString(), feed, alerts: tailLines(join(dir, 'feed', 'alerts.jsonl'), 30).reverse(), verify: sum, client: readJson(join(dir, 'verify', 'client-lines.json'), null), ewsAnchor,
      log: { day: today, lines: log }, due: verifyDue(), children: { feed: st.feed, verify: st.verify, lamha: st.lamha, flood: st.flood, diag: st.diag }, jobs, flood: floodReport(), diagnose: diagReport(),
      partner: { copy: readJson(join(dir, 'lamha', 'state.json'), null), hydroQc: (() => { const q = readJson(join(dir, 'lamha', 'ews_hydro_qc.json'), null); return q ? { built: q.built, newestHour: q.newestHour, totals: q.totals, cautions: q.cautions, scored: false, stations: (q.stations || []).filter((x) => x.waterLevelFaultHours || x.missingCodeHours || x.waterTempBelow0Hours) } : null; })() },
      rules: { lamha: 'retired v91.17.283.28 (NIGRAAN independent of LAMHA): nothing is copied; every 30 min the hydrology QC summary of NIGRAAN\'s own EWS store (nig\\own\\data\\pmd\\ews_live; partner network: internal only)', feed: 'every 10 min; ok / late / down from each feed\'s own update gaps over 30 days (late above the 95th percentile, down above the 99th)', verify: 'daily from 06:30 PKT; 400-day ledger; 95 % day-block bootstrap intervals; drift against the 30 days before with false-discovery control', paidCalls: 'none: the agents open no network connection', diagnose: 'daily from 06:50 PKT: where the verification\'s flags come from (chain steps, stations, sensors, heat inputs); candidates with evidence and a suggested test; it never acts and never changes a served value' } };
  }
  /* no install path in a served answer (permanent S2): the folders are named, not given */
  function scrubPaths(o) { let t = JSON.stringify(o); const { resolve } = PATH;
    const pairs = [[resolve(fromLamha()), 'nig/data/from_lamha'], [resolve(lamhaDir()), 'LAMHA'], [resolve(root, '..', '..'), 'NIGRAAN'], [resolve(root), 'nigraan-local'], [resolve(root, '..'), 'nig']];
    for (const [a, b] of pairs) { for (const v of [a, a.split('\\').join('/')]) { const j = JSON.stringify(v).slice(1, -1); if (j.length > 3) t = t.split(j).join(b); } }
    return JSON.parse(t); }
  function route(p, url, ctx = {}) {
    if (p !== '/api/ops/agents') return null;
    if (!ctx.operator) return { status: 403, body: { error: 'operator_scope_required' } };
    const run = url.searchParams.get('run'); let started = null;
    if (run === 'feed') { runFeed().catch(() => {}); started = 'feed'; } else if (run === 'lamha') { runLamha().catch(() => {}); started = 'lamha'; } else if (run === 'verify') { runVerify(url.searchParams.get('force') === '1').catch(() => {}); started = 'verify'; } else if (run === 'flood') { runFlood(true).catch(() => {}); started = 'flood'; } else if (run === 'diagnose') { runDiag(true).catch(() => {}); started = 'diagnose'; }
    return { status: 200, body: scrubPaths({ ok: true, started, ...report() }) };
  }
  /* v91.17.283.10 · agents 6 (experimentation, weekly) and 7 (weekly proposals report): server/api/agents_exp.mjs */
  const X = createExperimentAgents(app, root, dataDir, { child, on, st, schedule: opts.schedule, adminDir: () => { const e = process.env.NIGRAAN_AGENTS_ADMIN_DIR; if (e === '-') return null; return e || join(root, '..', '..', '_admin'); } });
  if (opts.schedule !== false && on()) {
    schedule(app, 'agentFeed', 10 * 60e3, () => runFeed().then((r) => { if (r && r.code && r.code !== 5) throw new Error('feed_health.mjs exited ' + r.code + ': ' + ((st.feed.tail || []).slice(-1)[0] || '')); }), { firstMs: 2 * 60e3, label: 'Agent: feed health (child process)' });
    /* v91.17.283.24 · J8: the data-sync slot (scheduler.mjs 'sync'): the copy never waits behind a back-fill or a long compute run */
    schedule(app, 'agentLamhaCopy', 30 * 60e3, () => runLamha().then((r) => { if (r && r.code && r.code !== 5) throw new Error('lamha_copy.mjs exited ' + r.code + ': ' + ((st.lamha.tail || []).slice(-1)[0] || '')); }), { firstMs: 3 * 60e3, heavy: 'sync', label: 'Agent: EWS hydrology QC of NIGRAAN\'s own store (child process; the LAMHA copy is retired)' });
    schedule(app, 'agentVerify', 10 * 60e3, () => runVerify(), { firstMs: 4 * 60e3, heavy: true, label: 'Agent: verification (child process, daily 06:30 PKT)' });
    /* v91.17.283.24 · J8: the long compute slot (never in front of the LAMHA copy or the MACH sync); R3: flood_shadow.mjs has no exit 3 (the
       accept of 3 removed) */
    schedule(app, 'agentFloodShadow', 60 * 60e3, () => runFlood().then((r) => { if (r && r.code && r.code !== 5) throw new Error('flood_shadow.mjs exited ' + r.code + ': ' + ((st.flood.tail || []).slice(-1)[0] || '')); }), { firstMs: 9 * 60e3, heavy: 'long', label: 'Agent: flood shadow (child process, daily 07:00 PKT; never served)' });
    schedule(app, 'agentDiagnose', 10 * 60e3, () => runDiag().then((r) => { if (r && r.code && r.code !== 5) throw new Error('diagnose.mjs exited ' + r.code + ': ' + ((st.diag.tail || []).slice(-1)[0] || '')); }), { firstMs: 6 * 60e3, heavy: true, label: 'Agent: diagnostic (child process, daily 06:50 PKT; candidates only, never acts)' });   /* v91.17.283.10 */
  }
  return { serverFeeds, writeServerFeeds, runFeed, runVerify, runLamha, runFlood, runDiag, verifyDue, floodDue, diagDue, report, route, exp: X, scrubPaths, status: () => ({ on: on(), feed: st.feed, verify: st.verify, lamha: st.lamha, flood: st.flood, diag: st.diag, due: verifyDue() }) };
}

/* v283.31 · the river gauge sheet feed-health entry: archive/irsa/sync_status.json (irsa_sync.py) + the newest sheet date */
function irsaFeed(app) {
  const S = app.riverSheet.stations(); const st = app.riverSheet.syncStatus();
  return { label: 'River gauge sheet (measured)', configured: true, lastPoll: st && st.ok ? st.at : null, lastError: st && !st.ok ? st.why : (S.ready ? null : S.why),
    everyMs: 24 * 3600e3, everyWhat: 'daily (pyjob irsaDaily)', newestData: S.ready ? S.newest : null, stations: S.ready ? S.n : 0 };
}
