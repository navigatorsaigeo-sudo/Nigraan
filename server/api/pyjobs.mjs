/* ══ v91.17.260 · SCHEDULED DATA JOBS THAT WERE RUN BY HAND (13 Oct 2026) ══════════════════════════════════════════════════════════
   Three archives stopped because their scripts were only ever started by hand:
     ewsAppend   station-lake/scripts/append_lamha_ews.py            PMD-EWS readings LAMHA collects -> archive/obs (all elements)
                 every 6 h; the obs archive ended 6 Oct 20:30 UTC (temperature and humidity were appended by hand once, 12 Oct)
                 v91.17.269 · it reads the validated copy (copies.mjs lamha_ews: nig/copies/lamha, LAMHA's own relative
                 paths) through --lamha; a stale or failing copy skips the run (nothing is lost: the next run appends from the
                 archive's last reading; since 28 Oct 2026 NIGRAAN also has its own failover fetch, ewsSync below)
     satrad      station-lake/scripts/fetch_satrad.py                measured sunshine (satellite radiation archive) at every point
                 daily; stopped 7 Oct
     prevRuns    station-lake/scripts/fetch_multimodel.py --rolling   10 models' forecasts as issued, leads 1-7 d, 240 points
                 daily; stopped at 6 Oct (a fixed end date)
   Each runs as its own process with the real Python (the same search as the ensemble archive), one at a time per job, with a time
   cap; the last result of each is kept for the operations page (GET /api/ops/pyjobs). The two provider scripts read the paid key
   from the key file themselves (never printed) and log their own weighted calls (logs/fetch_multimodel.jsonl); expected use:
   satrad ~800 weighted calls a day, prevRuns up to ~17,000 (2,400 point-models, each refreshing its open 28-day chunk).
   NIGRAAN_PYJOBS=0 stops all three; NIGRAAN_PYJOB_<ID>=0 stops one (e.g. NIGRAAN_PYJOB_PREVRUNS=0).
   EWS own fetch (28 Oct 2026):
     ewsSync     station-lake/scripts/ews_sync.py                    NIGRAAN's own fetch of the EWS readings, the FAILOVER for LAMHA
                 every 30 min (everyH 0.25: each 30-min tick of this scheduler runs it, as the cadence counts from the end of the last
                 successful run). The script decides itself (data/ews-source.json, default failover) and is idle - no portal request -
                 while LAMHA supplies the data; its decision (data/ews-source-state.json) tells the two copy jobs which folder the EWS
                 files come from. Slot 'sync' (a data sync: never waits behind a back-fill or a long compute run). Internal only.
                 NIGRAAN_PYJOB_EWSSYNC=0 stops it (the copies then stay on LAMHA once its last decision is 90 min old).
   AUTOMATIC MONTHLY RETRAIN (28 Oct 2026):
     autoRetrain station-lake/scripts/auto_retrain.py check --app <nigraan-local>
                 every 30 min (everyH 0.5, as ewsSync: the script decides itself). It runs the retrain of the month just ended from the 1st,
                 06:00 PKT (data/auto-retrain.json: the on/off switch, the day, the hour, the waits), once that month's data copies are
                 complete, and resumes an unfinished run (checkpoints). A computer that was off on the 1st runs it at the first check after.
                 Its own lock, disk check, step time limits and run budget; capMin 1440 so this scheduler never stops a run in the middle
                 (the script's limits do). Slot 'long' (with the weekly experiments). It never writes a served file: a passing candidate
                 becomes a proposal the owner approves (scripts/gen/exp_approve.mjs, target ifs-mos-retrain). Its state
                 (data/auto-retrain-state.json) is shown in GET /api/ops/pyjobs (jobs[].state). NIGRAAN_PYJOB_AUTORETRAIN=0 stops it.
   OWN RETRAIN INPUTS (28 Oct 2026):
     retrainInputs station-lake/scripts/retrain_produce.py --app <nigraan-local>
                 every 24 h. NIGRAAN's own inputs of the monthly retrain, so it no longer depends on LAMHA's one-off snapshot:
                 station-lake/retrain/produce/ifs.py (the IFS 0.1 deg runs this server already fetches, at the 580 retrain points: no
                 provider call; a held run is sampled before ecmwf010 prunes it) and truth.py (MACH, EWS, synop and METAR truth from
                 NIGRAAN's own archives with the snapshot's rules). Incremental; writes only station-lake/archive/retrain_own; never a served
                 file. The monthly retrain runs the same producers before it builds its inputs. NIGRAAN_PYJOB_RETRAININPUTS=0 stops it.
   v91.17.283.30 · PUNJAB EPD DAILY DISTRICT AQI:
     epdDaily    station-lake/scripts/epd_daily_import.py --inputs D:\NIGRAAN\inputs\epd_daily   every hour, cheap: imports an owner
                 export dropped in inputs\epd_daily once (by sha256) and adds the daily means of the server's district history
                 (epdaq.mjs) into station-lake/archive/epd/epd_district_daily.csv. AQI index values, never converted to PM2.5; partial
                 ("live") rows flagged, never a full day. Internal only. NIGRAAN_PYJOB_EPDDAILY=0 stops it.
   Every job's Python is given NIGRAAN_NODE_EXE = this server's own node (the retrain's value-level QC runs server/api/obsqc.mjs with it).
   v91.17.283.28 · INDEPENDENCE FROM LAMHA (owner, 28 Oct 2026 11:10 PKT: no live data dependency on LAMHA; NIGRAAN fetches everything):
     ewsSync     mode own only (data/ews-source.json): NIGRAAN fetches the EWS readings itself every 30 min into the own folder
                 (server/api/ownpaths.mjs, nig/own/data/pmd/ews_live); nothing of LAMHA's is read. Slot 'sync'.
     ewsAppend   reads NIGRAAN's own EWS store (ewssource.mjs) instead of the retired LAMHA copy; skipped while the own store holds no
                 raw file yet (nothing lost: the next run appends from the archive's last reading)
     metarSync   station-lake/scripts/metar_sync.py, every 30 min (everyH 0.25: each 30-min tick): the airports' METAR / SPECI of the last
                 3 h from NOAA AWC (IEM when AWC fails) into nig/own/data/obs_other/metar_live (LAMHA's layout). 1-2 requests a run.
                 Slot 'sync'. Exit 75 = offline.
     radarPull   station-lake/scripts/radar_pull.py (port of LAMHA scripts/radar), every 6 h: the Islamabad and Karachi weather-radar frames
                 from the public viewer's JSON endpoints into nig/own/data/radar (png, index, geotiff, netcdf; LAMHA's layout), the days
                 not held yet; converted to rain bands (radar_convert.py). Slot 'bulk'. Internal research copy only.
     isdLite     station-lake/scripts/isd_lite_sync.py, every 24 h: NOAA ISD-Lite yearly files of the Pakistan stations into
                 station-lake/archive/isd (raw/<year>/ kept; a file is downloaded again only when NOAA's copy changed; past years once).
                 Slot 'bulk'.
     NIGRAAN_PYJOB_METARSYNC=0 / NIGRAAN_PYJOB_RADARPULL=0 / NIGRAAN_PYJOB_ISDLITE=0 stop one. */
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { schedule } from './scheduler.mjs';
import { ewsSource } from './ewssource.mjs';
import { runJob, jobKeyOf } from './jobrun.mjs';

export function createPyJobs(app, root, dataDir) {
  const lake = join(root, '..', 'station-lake'); let py = null;
  function python() {
    if (py) return py;
    const c = [];
    if (process.env.LOCALAPPDATA) c.push(join(process.env.LOCALAPPDATA, 'Python', 'bin', 'python.exe'));
    if (process.env.NIGRAAN_PYTHON) c.unshift(process.env.NIGRAAN_PYTHON);
    for (const p of c) if (existsSync(p)) return (py = p);
    return (py = process.platform === 'win32' ? 'py' : 'python3');
  }
  const JOBS = [
    { id: 'ewsAppend', script: 'append_lamha_ews.py', args: [], pre: () => { let E = null; try { E = ewsSource(root, dataDir); } catch (e) { return { ok: false, why: 'EWS store unknown: ' + e.message }; }
        return existsSync(join(E.live, 'raw')) ? { ok: true, args: ['--lamha', E.root] } : { ok: false, why: 'no own EWS readings yet (' + join(E.live, 'raw') + ')' }; }, everyH: 6, firstMin: 15, capMin: 30, heavy: true, label: 'PMD-EWS from NIGRAAN\'s own EWS fetch into the station archive (Python)' },
    { id: 'satrad', script: 'fetch_satrad.py', args: [], everyH: 24, firstMin: 40, capMin: 90, heavy: null, label: 'measured sunshine archive, daily (Python)' },
    { id: 'ewsSync', script: 'ews_sync.py', args: [], everyH: 0.25, firstMin: 5, capMin: 25, heavy: 'sync', label: 'EWS own fetch, NIGRAAN fetches itself (Python, internal)' },
    /* v91.17.283.44 · measured past-24 h rain at the mountain gauges (data/ews-rain24.json, read by ewsrain.mjs); only with NIGRAAN_EWS_RAIN24=1 */
    ...(process.env.NIGRAAN_EWS_RAIN24 !== '0' ? [{ id: 'ewsRain24', script: 'ews_rain24.py', args: ['--app', root], everyH: 0.5, firstMin: 8, capMin: 10, heavy: null, label: 'measured 24 h rain at the mountain gauges (Python, internal)' }] : []),
    /* v91.17.283.47 (NIGRAAN 1.0.9) · WeatherNext 3 live runs (inputs\weathernext3\live, copied by WN3_LIVE.bat fetch) into data/archive/wn3 for the
       WN3 SHADOW that the verification agent scores (scripts/agents/verify.mjs); internal, nothing served reads it. NIGRAAN_WN3_SHADOW=0: no job.
       NIGRAAN_WN3_LIVE_DIR overrides the folder. */
    ...(process.env.NIGRAAN_WN3_SHADOW !== '0' ? [{ id: 'wn3Import', script: 'wn3_live_import.py', args: ['--app', root, '--data', dataDir, '--live', process.env.NIGRAAN_WN3_LIVE_DIR || join(root, '..', '..', 'inputs', 'weathernext3', 'live')], everyH: 3, firstMin: 26, capMin: 10, heavy: null, label: 'WeatherNext 3 live runs into the shadow archive (Python, internal; never served)' }] : []),
    /* v91.17.283.48 (NIGRAAN 1.0.9) · item 6 · the Pakistan model scorecard (data/model-scorecard.json), every 30 days: re-runs the locked WN3 scorers
       (_admin\\weathernext\\scoring, into dated folders; out\\ and out_height\\ are never written) when their inputs changed, then rebuilds the
       scorecard. Internal; nothing served reads it. NIGRAAN_PYJOB_MODELSCORECARD=0 stops it. */
    { id: 'modelScorecard', script: 'model_scorecard.py', args: ['--data', dataDir], everyH: 720, firstMin: 55, capMin: 90, heavy: 'bulk', label: 'Pakistan model scorecard, monthly: re-runs the locked WeatherNext 3 scorers on new inputs and rebuilds the scorecard (Python, internal; never served)' },
    { id: 'metarSync', script: 'metar_sync.py', args: ['--app', root], everyH: 0.25, firstMin: 4, capMin: 10, heavy: 'sync', label: 'airport METAR, own fetch (AWC / IEM; Python)' },
    { id: 'radarPull', script: 'radar_pull.py', args: ['--app', root], everyH: 6, firstMin: 25, capMin: 120, heavy: 'bulk', label: 'weather-radar frames, own fetch (Python, internal)' },
    { id: 'epdDaily', script: 'epd_daily_import.py', args: ['--inputs', join(root, '..', '..', 'inputs', 'epd_daily')], everyH: 1, firstMin: 12, capMin: 10, heavy: null, label: 'Punjab EPD daily district AQI: owner exports in inputs\\epd_daily + daily means of the district history (Python, internal; v283.30)' },
    { id: 'irsaDaily', script: 'irsa_sync.py', args: ['--app', root, '--seed', join(root, '..', '..', 'inputs', 'irsa_daily', 'irsa_daily_clean.csv')], everyH: 24, firstMin: 18, capMin: 10, heavy: 'sync', label: 'river gauge sheet, daily: measured flows and status at 33 stations (Python, internal; v283.31)' },
    /* v91.17.283.33 · forecast archive: previous runs of the global models + the 00 UTC ensembles (WeatherNext 2, ECMWF IFS / AIFS) at the truth
       stations, resumable, stops for the day on HTTP 429; internal, nothing served changes (status: GET /api/ops/fcarchive) */
    { id: 'fcArchive', script: 'fc_archive_harvest.py', args: ['--app', root, '--daily'], everyH: 24, firstMin: 35, capMin: 240, heavy: 'bulk', label: 'forecast archive: previous runs and 00 UTC ensembles at the truth stations, daily (Python, internal)' },
    { id: 'isdLite', script: 'isd_lite_sync.py', args: [], everyH: 24, firstMin: 70, capMin: 60, heavy: 'bulk', label: 'NOAA ISD-Lite Pakistan stations, incremental (Python)' },
    { id: 'autoRetrain', script: 'auto_retrain.py', args: ['check', '--app', root, '--data', dataDir], everyH: 0.5, firstMin: 20, capMin: 1440, heavy: 'long', stateFile: 'auto-retrain-state.json', label: 'automatic monthly retrain: runs when due, proposes, never serves (Python, internal)' },
    { id: 'retrainInputs', script: 'retrain_produce.py', args: ['--app', root, '--data', dataDir], everyH: 24, firstMin: 50, capMin: 120, heavy: 'bulk', label: 'retrain inputs from NIGRAAN\'s own archives: IFS at the retrain points, truth tables (Python, internal)' },
    { id: 'prevRuns', script: 'fetch_multimodel.py', args: ['--rolling', '--all-stages', '--budget', String(Number(process.env.NIGRAAN_PREVRUNS_BUDGET) || 40000), '--sleep', '0.2'], everyH: 24, firstMin: 60, capMin: 240, heavy: null, label: 'forecasts as issued (previous runs), daily (Python)' },
  ];
  const st = {}; for (const j of JOBS) st[j.id] = { runs: 0, running: false, lastStart: null, lastEnd: null, lastCode: null, tail: null };
  /* ══ v91.17.283.3 · budget cut 6 · THE DAILY JOBS KEEP THEIR CADENCE ACROSS RESTARTS ═══════════════════════════════════════════════════
     Each job ran firstMin after every start and then every everyH from that start, so each restart started the previous-runs learner again
     (up to ~17-40 k weighted a run; 6 starts on 21 Oct). The last start of each job is kept on disk (data/cache/pyjobs-state.json); the
     scheduler now asks every 30 min (and firstMin after a start) and a scheduled run starts only when everyH has passed since the last
     start, whatever restarts happened in between. A manual run (/api/ops) is not held back. NIGRAAN_PYJOBS_KEEP_CADENCE=0: the old timing. */
  const SF = join(dataDir, 'cache', 'pyjobs-state.json');
  const keep = () => process.env.NIGRAAN_PYJOBS_KEEP_CADENCE !== '0';
  const PS = (() => { try { return JSON.parse(readFileSync(SF, 'utf8')) || {}; } catch (_) { return {}; } })();
  const psSave = () => { try { mkdirSync(join(dataDir, 'cache'), { recursive: true }); writeFileSync(SF + '.tmp', JSON.stringify(PS)); renameSync(SF + '.tmp', SF); } catch (_) {} };
  const lastStartMs = (id) => { const t = Date.parse((PS[id] && PS[id].lastStart) || st[id].lastStart || ''); return Number.isFinite(t) ? t : null; };
  /* due: no start on record, or everyH since the last start (a start in the future, a clock change, counts as not on record) */
  /* v91.17.283.23 · self-audit J12 · the cadence counts from the last SUCCESSFUL run; a failed, offline or killed run is tried again after an
     hour (before, the start time was saved first, so a failure counted as done for the whole cadence) */
  const lastOkMs = (id) => { const t = Date.parse((PS[id] && PS[id].lastOk) || ''); return Number.isFinite(t) ? t : null; };
  const due = (j, t = Date.now()) => { const l = lastStartMs(j.id), ok = (PS[j.id] && 'lastOk' in PS[j.id]) ? lastOkMs(j.id) : l;
    /* v283.51g3 · a failed (or timed-out) run is tried again once the job's own period has passed since that start, at most 1 h (a 15-minute job: on its next schedule) */
    if (l != null && l > t) return true; const okDue = ok == null || ok > t || t - ok >= j.everyH * 3600e3; const retryOk = l == null || (ok != null && l <= ok) || t - l >= Math.min(3600e3, j.everyH * 3600e3);
    return okDue && retryOk; };
  const on = (j) => process.env.NIGRAAN_PYJOBS !== '0' && process.env['NIGRAAN_PYJOB_' + j.id.toUpperCase()] !== '0';
  async function run(id, why = 'manual') {
    const j = JOBS.find((x) => x.id === id); if (!j) return { ok: false, why: 'no such job' };
    const s = st[id]; const script = join(lake, 'scripts', j.script);
    if (!on(j) || s.running || !existsSync(script)) return { started: false, running: s.running, on: on(j), script: existsSync(script) };
    if (why === 'scheduled' && keep() && !due(j)) return { started: false, notDue: true, lastStart: new Date(lastStartMs(j.id)).toISOString() };   /* cut 6 */
    const pre = j.pre ? j.pre() : { ok: true, args: [] }; s.skipped = pre.ok ? null : { at: new Date().toISOString(), why: pre.why };
    if (!pre.ok) return { started: false, skipped: pre.why };
    s.running = true; s.lastStart = new Date().toISOString(); s.runs++; PS[id] = { ...(PS[id] || {}), lastStart: s.lastStart }; psSave();
    try {
      const exe = python(); const args = (exe === 'py' ? ['-3'] : []).concat([script, ...j.args, ...(pre.args || [])]);
      /* v283.51g3 · item 2 · runJob: the limit from the job's own runs (jobrun.mjs limitFor), the process tree ended on overrun, logged */
      const r = await runJob(jobKeyOf(j.script, j.args), exe, args, { capMin: j.capMin, cwd: lake, env: { ...process.env, PYTHONIOENCODING: 'utf-8', NIGRAAN_NODE_EXE: process.execPath } });
      s.limitMin = r.limitMin; s.timedOut = r.timedOut || false;
      s.lastCode = r.code; s.tail = (r.out + (r.code === -1 ? ' (Python not found)' : '')).trim().split('\n').slice(-8).map((x) => x.slice(0, 240));
      if (s.lastCode === 0) { PS[id] = { ...(PS[id] || {}), lastOk: new Date().toISOString() }; psSave(); } else { PS[id] = { ...(PS[id] || {}), lastOk: (PS[id] && PS[id].lastOk) || null }; psSave(); }
      return { started: true, code: s.lastCode };
    } finally { s.running = false; s.lastEnd = new Date().toISOString(); }
  }
  for (const j of JOBS) if (on(j)) schedule(app, j.id, keep() ? 30 * 60e3 : j.everyH * 3600e3, () => run(j.id, 'scheduled').then((r) => { if (r && r.code && r.code !== 0) throw new Error(j.script + ' exited ' + r.code + ': ' + ((st[j.id].tail || []).slice(-1)[0] || '')); }), { firstMs: j.firstMin * 60e3, heavy: j.heavy || undefined, label: j.label });
  /* a job that keeps its own state file (autoRetrain): what it does now, its last result and the next month, for the operations page */
  const jobState = (j) => { if (!j.stateFile) return undefined; try { const s = JSON.parse(readFileSync(join(dataDir, j.stateFile), 'utf8'));
    return { on: s.on, now: s.now || null, last: s.last || null, next: s.next || null, updated: s.updated || null }; } catch (_) { return null; } };
  function status() { return { on: process.env.NIGRAAN_PYJOBS !== '0', keepCadence: keep(), jobs: JOBS.map((j) => ({ id: j.id, script: j.script, args: j.args, everyH: j.everyH, on: on(j), ...st[j.id], lastStartKept: (PS[j.id] && PS[j.id].lastStart) || null, due: due(j), state: jobState(j) })) }; }
  return { run, status, due, _jobs: JOBS };
}
