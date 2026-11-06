/* Operations health: is every scheduled job fresh, and is the data folder backed up.
   - Each job has a maximum age. Past it the job is "stale", an alert is raised once per day,
     and the dashboard shows it on the outlook button and in Checks.
   - v91.17.76 · the permanent training archive (data/archive, server/api/archive.mjs) and the monthly AI temperature correction
     retrain (data/downscale-retrain.json) are listed like the other learning jobs; the archive is NOT part of the nightly copy
     (it is append-only and never pruned; the 14-day rotation below would only duplicate it).
   - Nightly backup (first check after 02:00 Pakistan time, or when the last is over 26 h old):
     the database, the forecast record (ensemble log and scores), outlook, smog, stations and
     climatology are copied to data/nightly/YYYY-MM-DD/. The last 14 are kept.            */
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync, readFileSync, cpSync, statfsSync } from 'node:fs';
import { join } from 'node:path';
import { writeJsonAtomicSync } from './store.mjs';
import { limitH as dataLimitH, RIVER_STALE_H } from './dataage.mjs';   /* v283.36 item 29 */   /* v91.17.283 · WS3 */
import { stationData, label } from './refmode.mjs';   /* v91.17.71 · data use vs naming */

/* ══ v91.17.283 · WS3 · ONE ALERT PER PLACE, HAZARD, LEVEL AND WINDOW ═════════════════════════════════════════════════════════════════
   The same condition raised again in the same window adds to the open alert (count, last_seen_at, the newest message and details)
   instead of opening another: every failed hourly national run used to open its own alert (the details carried the run id), and the
   operator saw 24 alerts for one day's outage. The key is place | hazard | level | window (window = the Pakistan day by default).
   dedupeAlertRows(rows) is the same rule for a list of rows (the engine's customer alert list): one row per key, with the count of
   rows it stands for and the windows it covers. */
const SEV = { info: 0, warning: 1, critical: 2 };
export const pktDay = (ms = Date.now()) => new Date(ms + 5 * 3600e3).toISOString().slice(0, 10);
export const alertKey = (o) => [o.place, o.hazard, o.level, o.window].map((x) => String(x == null || x === '' ? '-' : x)).join('|');
export async function raiseDeduped(app, { type, severity = 'warning', message, place, hazard, level, window = pktDay(), details = {} }) {
  const key = alertKey({ place, hazard, level, window });
  const st = app.store;
  const open = st.find('alerts', (a) => a.status === 'open' && a.details && a.details.dedupeKey === key);
  if (open) {
    open.count = (open.count || 1) + 1; open.last_seen_at = new Date().toISOString(); open.message = message;
    open.details = { ...open.details, last: details }; if ((SEV[severity] || 0) > (SEV[open.severity] || 0)) open.severity = severity;
    await st.save('alerts'); return open;
  }
  return app.raiseAlert(type, severity, message, { ...details, dedupeKey: key, place: place ?? null, hazard: hazard ?? null, level: level ?? null, window });
}
export function dedupeAlertRows(rows, keyOf = null) {
  const K = keyOf || ((r) => alertKey({ place: r.place ?? r.uid ?? r.unitId ?? r.name, hazard: r.hazard, level: r.level ?? r.word ?? r.severity, window: r.window ?? r.date ?? r.day }));
  const by = new Map();
  for (const r of rows || []) { if (!r || typeof r !== 'object') continue; const k = K(r); const e = by.get(k);
    if (!e) by.set(k, { ...r, dedupeKey: k, count: 1 }); else e.count++; }
  return [...by.values()];
}

export function createOps(app, dataDir) {
  const nightly = join(dataDir, 'nightly'); mkdirSync(nightly, { recursive: true });
  /* v91.17.283 · WS3 · the once-a-day alert keys survive a restart (data/run/ops-alerted.json, written atomically): a restart used to
     raise every stale-job and disk alert of the day again */
  const RUNF = join(dataDir, 'run', 'ops-alerted.json');
  const alerted = new Map((() => { try { const o = JSON.parse(readFileSync(RUNF, 'utf8')); const today = pktDay(); return Object.entries(o.keys || {}).filter(([, d]) => d === today); } catch (_) { return []; } })());
  const keepAlerted = () => { try { mkdirSync(join(dataDir, 'run'), { recursive: true }); writeJsonAtomicSync(RUNF, { at: new Date().toISOString(), keys: Object.fromEntries(alerted) }); } catch (_) {} };
  /* ══ v91.17.283 · WS3 · OPERATIONS ALERT ON REPEATED FAILURES ═════════════════════════════════════════════════════════════════════
     fail(kind, why) counts consecutive failures of one kind (a store write that keeps failing, the nightly backup, a national run, an
     ingestion job); the NIGRAAN_OPS_FAIL_REPEAT-th one in a row (default 3) raises ONE alert (ops.repeated_failure, deduplicated per kind
     and Pakistan day; critical from twice that count); success(kind) resets the count. The counts are on /api/ops/health (failures). */
  const REPEAT = Math.max(2, Number(process.env.NIGRAAN_OPS_FAIL_REPEAT) || 3);
  const FAILS = new Map();
  async function fail(kind, why) {
    const f = FAILS.get(kind) || { n: 0, since: new Date().toISOString() }; f.n++; f.last = String(why || '').slice(0, 300); f.lastAt = new Date().toISOString(); FAILS.set(kind, f);
    if (f.n >= REPEAT) { try { await raiseDeduped(app, { type: 'ops.repeated_failure', severity: f.n >= 2 * REPEAT ? 'critical' : 'warning', message: kind + ' failed ' + f.n + ' times in a row since ' + f.since + ': ' + f.last, place: 'this server', hazard: 'ops:' + kind, level: 'repeated', details: { kind, count: f.n, since: f.since, last: f.last } }); } catch (_) {} }
    return f;
  }
  function success(kind) { FAILS.delete(kind); }
  const hours = (iso) => { if (!iso) return null; const t = Date.parse(iso); return Number.isNaN(t) ? null : (Date.now() - t) / 3600e3; };   /* v91.17.68 · an unparseable timestamp is 'never', not 'ok' (audit C13) */

  function jobs() {
    /* v91.17.68 · one throwing status must not 500 the ops board or stop tick() (C14) */
    const safe = (f, d) => { try { return f() || d; } catch (_) { return d; } };
    const s = safe(() => app.outlook.status(), { running: {} }), sm = safe(() => app.smog.status(), {}), st = safe(() => app.stations.summary(), {}), cl = safe(() => app.climatology.status(), {}), v = safe(() => app.verification.grades().summary, {});
    const runs = app.store.all('runs').filter(r => r.status === 'complete').sort((a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at));
    const list = [
      { id: 'national', label: 'National hourly forecast run', at: runs[0] && runs[0].completed_at, maxH: 3 },
      { id: 'ensemble', label: '15-day ensemble outlook', at: s.ensemble && s.ensemble.at, maxH: dataLimitH('ens') - 13,   /* v283.36 item 29: the table's limit counted from receipt (25 h from base - 13 h delivery) */   /* v91.17.283 · INTEG (WS1 D1): twice daily, run + ~9 h availability */ running: s.running.ensemble },
      { id: 'flood', label: 'Riverine forecast (GloFAS reaches)', at: (() => { try { const f = app.flood.status().forecast; return f && f.at; } catch (_) { return null; } })(), maxH: RIVER_STALE_H },
      { id: 'seasonal', label: 'Weeks-ahead and seasonal outlook', at: s.seasonal && s.seasonal.at, maxH: 27 },   /* v91.17.283 · INTEG (WS1): fetched once per daily issue */
      { id: 'sunshine', label: 'Satellite sunshine check', at: s.radiation && s.radiation.at, maxH: 8, running: s.running.radiation },   /* v91.17.39 · the job refreshes at 6 h (outlook.mjs); a 4 h board limit called it stale for two hours of every six */
      { id: 'smog', label: 'Air and smog outlook', at: sm.at, maxH: 6, running: sm.running },
      { id: 'verification', label: 'National verification' + (v ? (v.eligible ? ' (grade A earned)' : ' (grade A not earned: ' + ((v.errors || []).length ? (v.errors.length + ' provider batch(es) failed; retried hourly' ) : (Math.round((v.passShare || 0) * 100) + '% of tehsils pass, 80% needed')) + ')') : ''), at: v && v.at, maxH: 30 },
      { id: 'stations', label: 'Station check', at: st.at, maxH: 30, running: st.running },
      { id: 'climatology', label: ((cl && cl.periods && cl.periods.tx90) || (cl && cl.period) || '1991-2020') + ' climatology' + (() => { try { const h = app.rebuildHeld && app.rebuildHeld().climatology; return h ? ' — ' + h.why + '; operator: ' + h.operatorAction : ''; } catch (_) { return ''; } })(), at: cl.built, maxH: 24 * 400 },   /* v91.17.270 · OPS A8 · a held rebuild says so */
      /* v91.17.36 · AUDIT OPS-01 · the jobs that run and can go stale but were absent from the board */
      { id: 'ensbias', label: 'Ensemble bias refit (mountain local-percentile events)', at: (() => { try { const a = app.outlook.status().adjustment; return a && a.at; } catch (_) { return null; } })(), maxH: 30 },
      { id: 'drought', label: 'National drought table (SPEI/SPI-90, root zone)', at: (() => { try { return app.climatology.droughtStatus().built; } catch (_) { return null; } })(), maxH: 12 },
      { id: 'glof', label: stationData() ? 'Glacial-lake bulletin feed (' + label('lakeInventory') + ')' : 'Glacial-lake bulletin feed (off: station data not used on this install)',   /* v91.17.71 · the bulletins feed customer values again, credited generically */ at: (() => { try { return app.glof.status().checkedAt; } catch (_) { return null; } })(), maxH: 30 },
      { id: 'imerg', label: (() => { try { const st = app.imerg.status(); return 'IMERG satellite rain' + (st.token && st.token.present ? '' : ' (not configured: no Earthdata token)'); } catch (_) { return 'IMERG satellite rain'; } })(),
        at: (() => { try { return app.imerg.status().lastRunAt; } catch (_) { return null; } })(), maxH: 12,
        notConfigured: (() => { try { const st = app.imerg.status(); return !(st.token && st.token.present); } catch (_) { return true; } })() },
      /* v91.17.36 · learning jobs. Both run outside this process (station-lake, Python) and leave a
         file behind; the operations page shows when they last ran and what they decided. */
      { id: 'mosRetrain', label: (() => { const r = readData('mos-retrain.json'); return 'Mountain correction retrain (champion vs challenger)' + (r ? (r.promoted ? ': promoted' : ': kept serving table') + (r.why ? ' — ' + r.why : '') : ' (not configured: station-lake/scripts/retrain.py has not run)'); })(),
        at: (() => { const r = readData('mos-retrain.json'); return r && r.at; })(), maxH: 24 * 45, notConfigured: !readData('mos-retrain.json') },
      /* v91.17.76 · the AI temperature correction retrain (station-lake/scripts/downscale_retrain.py, LEARN_ALL job "downscale"):
         champion vs challenger on held-out stations; a skip (LightGBM or the training inputs missing) is shown as not configured */
      { id: 'downscaleRetrain', label: (() => { const r = readData('downscale-retrain.json'); return 'AI temperature correction retrain (champion vs challenger, monthly)' + (!r ? ' (not configured: LEARN_ALL.bat downscale has not run)' : r.skipped ? ' (skipped: ' + (r.why || '') + ')' : r.ok === false ? ': failed (see logs/learn_downscale.log)' : (r.promoted ? ': promoted' + (r.newVersion ? ' ' + r.newVersion : '') : ': kept serving model') + (r.summary ? ' — ' + r.summary : '')); })(),
        at: (() => { const r = readData('downscale-retrain.json'); return r && !r.skipped ? r.at : null; })(), maxH: 24 * 45, notConfigured: (() => { const r = readData('downscale-retrain.json'); return !r || !!r.skipped; })(),
        promoted: (() => { const r = readData('downscale-retrain.json'); return r ? !!r.promoted : null; })() },
      /* v91.17.91 · the national temperature model: monthly retrain (station-lake/scripts/national_retrain.py, LEARN_ALL job
         "national", champion vs challenger on held-out stations) and the daily check against the MACH fleet (natscore.mjs) */
      { id: 'nationalRetrain', label: (() => { const r = readData('national-retrain.json'); return 'National temperature model retrain (champion vs challenger, monthly)' + (!r ? ' (not configured: LEARN_ALL.bat national has not run)' : r.skipped ? ' (skipped: ' + (r.why || '') + ')' : r.ok === false ? ': failed (see logs/learn_national.log)' : (r.promoted ? ': promoted ' + (r.newVersion || '') : ': kept serving model') + (r.summary ? ' — ' + r.summary : '')); })(),
        at: (() => { const r = readData('national-retrain.json'); return r && !r.skipped ? r.at : null; })(), maxH: 24 * 45, notConfigured: (() => { const r = readData('national-retrain.json'); return !r || !!r.skipped; })(),
        promoted: (() => { const r = readData('national-retrain.json'); return r ? !!r.promoted : null; })() },
      /* v91.17.92 · the drop folder (server/api/dropimport.mjs + station-lake/scripts/drop_import.py) */
      { id: 'dropImport', label: (() => { try { const s = app.dropImport && app.dropImport.status(); if (!s) return 'Drop folder import (not running)'; const l = s.last;
          return 'Drop folder DROP_DATA_HERE' + (s.waiting ? ': ' + s.waiting + ' file(s) waiting' : '') + (l ? ' — last run ' + l.at.slice(0, 16).replace('T', ' ') + ' UTC: ' + l.files.map((f) => f.file + (f.ok ? ' loaded' + (f.new != null ? ' (' + f.new + ' new)' : '') : ' NOT loaded: ' + f.why)).join('; ') : ' (nothing dropped yet)') + (s.error ? ' — error: ' + s.error : ''); } catch (_) { return 'Drop folder import (error)'; } })(),
        at: (() => { try { const s = app.dropImport && app.dropImport.status(); return s && s.last ? s.last.at : null; } catch (_) { return null; } })(), maxH: 24 * 3650, notConfigured: !app.dropImport },
      /* v91.17.178 · the ensemble forecast archive (ingestion only): checked hourly, saves each 00 UTC run complete or not at all */
      { id: 'ensArchive', label: (() => { try { const s = app.ensArchive && app.ensArchive.status(); if (!s) return 'Ensemble forecast archive (not running)'; if (!s.on) return 'Ensemble forecast archive (switched off: NIGRAAN_ENS_ARCHIVE=0)';
          const pkt = (iso) => { const d = new Date(Date.parse(String(iso).replace('Z', ':00Z').replace(/:00:00Z$/, ':00Z')) + 5 * 3600e3); return isNaN(d) ? String(iso) : d.toISOString().slice(0, 16).replace('T', ' ') + ' PKT'; };
          const l = s.last; return 'Ensemble forecast archive (rain members for the future rain model)' + (s.sizeGB != null ? ' — ' + s.sizeGB.toFixed(2) + ' GB of ' + ((s.config && s.config.capGB) || 10) + ' GB' : '') + (l ? ' — last check ' + pkt(l.at) + ': ' + l.results.map((r) => r.model + ' ' + r.result).join('; ') : ' (no check yet)') + (s.state && s.state !== 'ok' ? ' — ' + s.state : '') + (s.error ? ' — error: ' + s.error : ''); } catch (_) { return 'Ensemble forecast archive (error)'; } })(),
        at: (() => { try { const s = app.ensArchive && app.ensArchive.status(); return s && s.last ? s.last.at : null; } catch (_) { return null; } })(), maxH: 3, notConfigured: !app.ensArchive,
        /* v91.17.261 · the checks ran every 15 min and the board said 'ok' while no ECMWF run was saved 11-13 Oct: the job is now also
           stale when a model's newest saved run is older than its cadence + the provider's measured delay (the script's 'newest') */
        missed: (() => { try { const s = app.ensArchive && app.ensArchive.status(); if (!s || !s.on || !s.newest) return null;
          const m = Object.entries(s.newest).filter(([, v]) => v && v.missed).map(([k, v]) => k + (v.init ? ' newest saved run ' + v.init + ' is ' + Math.round(v.ageH) + ' h old (limit ' + Math.round(v.limitH) + ' h)' : ' has no saved run'));
          return m.length ? 'run missed: ' + m.join('; ') : null; } catch (_) { return null; } })() },
      /* v91.17.182 · the MACH record copied from AGN's observation database */
      { id: 'machDb', label: (() => { try { const s = app.machDb && app.machDb.status(); if (!s) return 'MACH database record (not running)'; if (!s.on) return 'MACH database record (off: no obs.key, or NIGRAAN_MACH_DB_SYNC=0)';
          const pkt = (iso) => { const d = new Date(Date.parse(iso) + 5 * 3600e3); return isNaN(d) ? String(iso) : d.toISOString().slice(0, 16).replace('T', ' ') + ' PKT'; };
          const f = app.fleet && app.fleet.status ? app.fleet.status().db : null;
          return 'MACH stations from the AGN observation database' + (f && f.ok ? ' — live poll ' + f.from + ' stations, database updated ' + pkt(f.updatedAt) : f && f.ok === false ? ' — live poll FAILED (' + f.error + '), per-station reads used' : '') + (s.finishedAt ? ' — record copied ' + pkt(s.finishedAt) + ': ' + s.newRows + ' new readings, ' + s.stationsCopied + '/' + s.stations + ' stations, ' + s.sizeMB + ' MB' : ' (first copy pending)') + (s.state && s.state !== 'ok' ? ' — ' + s.state : '') + (s.error ? ' — error: ' + s.error : ''); } catch (_) { return 'MACH database record (error)'; } })(),
        at: (() => { try { const s = app.machDb && app.machDb.status(); return s && s.finishedAt ? s.finishedAt : null; } catch (_) { return null; } })(), maxH: 13, notConfigured: !(app.machDb && app.machDb.status().on) },
      { id: 'driveFetch', label: (() => { try { const s = app.driveFetch && app.driveFetch.status(); if (!s) return 'Daily river sheet from Google Drive (not running)'; if (!s.configured) return 'Daily river sheet from Google Drive: no link set yet'; const l = s.last;
          return 'Daily river sheet from Google Drive (' + s.kind + ', every 3 h)' + (l ? ' — last check ' + l.at.slice(0, 16).replace('T', ' ') + ' UTC: ' + (l.taken.length ? l.taken.length + ' new file(s) loaded' : 'nothing new') + (l.error ? ' — ' + l.error : '') : ''); } catch (_) { return 'Daily river sheet from Google Drive (error)'; } })(),
        at: (() => { try { const s = app.driveFetch && app.driveFetch.status(); return s && s.last ? s.last.at : null; } catch (_) { return null; } })(), maxH: 26, notConfigured: !(app.driveFetch && app.driveFetch.status().configured) },
      { id: 'nationalScore', label: (() => { try { const s = app.natScore && app.natScore.status(); if (!s || !s.ok) return 'Daily temperature check against the MACH fleet (no scored day yet)'; const a = s.last.all;
          return 'Daily temperature check ' + s.last.date + ': served ' + a.maeServed + ' °C vs raw ' + a.maeRaw + ' °C at ' + a.stations + ' MACH stations' + (s.week ? '; last ' + s.week.days + ' days ' + s.week.maeServed + ' vs ' + s.week.maeRaw : '') + (s.alert ? ' — ' + s.alert : ''); } catch (_) { return 'Daily temperature check (error)'; } })(),
        at: (() => { try { const s = app.natScore && app.natScore.status(); return s && s.ok ? s.last.date + 'T23:59:00Z' : null; } catch (_) { return null; } })(), maxH: 60, notConfigured: !app.natScore },
      /* v91.17.76 · the permanent training archive (server/api/archive.mjs): one write per Pakistan day, never pruned */
      { id: 'archive', label: (() => { const a = archiveStatus(); if (!a) return 'Training archive (not configured: server/api/archive.mjs is not wired)'; const k = a.kinds || {}; return 'Training archive (served forecast ' + ((k.forecast || {}).days || 0) + ' d, MACH readings ' + ((k.fleet || {}).days || 0) + ' d, satellite rain ' + ((k.imerg || {}).days || 0) + ' d; ' + (a.mb || 0) + ' MB; ~' + ((a.projection || {}).mbPerYear || 0) + ' MB/year)'; })(),
        at: (() => { const a = archiveStatus(); return a && a.lastWrite; })(), maxH: 30, notConfigured: !archiveStatus() },
      { id: 'modelRanking', label: (() => { const r = readData('model-ranking.json'); return 'Model ranking against the reference stations (internal diagnostic)' + (r ? ` (${r.stationCount} stations, ${(r.models || []).length} models)` : ' (not configured: station-lake/scripts/rank_models.py has not run)'); })(),
        at: (() => { const r = readData('model-ranking.json'); return r && r.built; })(), maxH: 24 * 120, notConfigured: !readData('model-ranking.json') },
      /* v91.17.71 · the monitor the GLOF module serves (its status().measured block), so this row and the lake page read one file */
      { id: 'lakeMonitor', label: (() => { let r = null; try { r = app.glof.status().measured; } catch (_) { r = null; } return 'Glacial-lake area monitor (Sentinel-2)' + (r ? ` (${r.measured} of ${r.total} lakes measured, ${(r.changeCounts || {}).growing || 0} growing, ${(r.changeCounts || {}).draining || 0} draining)` : ' (not configured: station-lake/scripts/lake_monitor.py has not run)'); })(),
        at: (() => { try { const r = app.glof.status().measured; return r && r.built; } catch (_) { return null; } })(), maxH: 24 * 40, notConfigured: (() => { try { return !app.glof.status().measured; } catch (_) { return true; } })() },
      { id: 'hand', label: (() => { const r = readData('hand-tehsil.json'); return 'HAND floodplain bands per tehsil (GLO-90)' + (r ? ` (${Object.keys(r.units || {}).length} tehsils; a one-off, rebuilt only with a new DEM)` : ' (not configured: LEARN_NIGRAAN.bat hand has not run)'); })(),
        at: (() => { const r = readData('hand-tehsil.json'); return r && r.built; })(), maxH: 24 * 3650, notConfigured: !readData('hand-tehsil.json') },
      { id: 'lithology', label: (() => { const r = readData('lithology-tehsil.json'); return 'Lithology material class per tehsil (250 m map)' + (r ? ` (${Object.keys(r.units || {}).length} tehsils; a one-off)` : ' (not configured: LEARN_NIGRAAN.bat lithology has not run)'); })(),
        at: (() => { const r = readData('lithology-tehsil.json'); return r && r.built; })(), maxH: 24 * 3650, notConfigured: !readData('lithology-tehsil.json') },
      { id: 'landcover', label: (() => { const r = readData('landcover-tehsil.json'); return 'Land-cover class shares per tehsil (ESA WorldCover 2021)' + (r ? ` (${Object.keys(r.units || {}).length} tehsils; a one-off)` : ' (not configured: LEARN_NIGRAAN.bat landcover has not run)'); })(),
        at: (() => { const r = readData('landcover-tehsil.json'); return r && r.built; })(), maxH: 24 * 3650, notConfigured: !readData('landcover-tehsil.json') },
      { id: 'metCorrections', label: (() => { const r = readData('met-corrections.json'); return 'Station-lake meteorological checks (gusts, dew point, rain days, freezing level; internal diagnostic)' + (r ? ` (window ${(r.window || []).join(' to ')})` : ' (not configured: LEARN_NIGRAAN.bat met has not run)'); })(),
        at: (() => { const r = readData('met-corrections.json'); return r && r.built; })(), maxH: 24 * 3650, notConfigured: !readData('met-corrections.json') },
      { id: 'levelAnomaly', label: (() => { const r = readData('level-anomaly.json'); return 'Level-anomaly prototype on the reference river gauges (internal)' + (r ? ` (${r.usableGauges} usable gauges, ${r.surges} surges; unarmed)` : ' (not configured: LEARN_NIGRAAN.bat levels has not run)'); })(),
        at: (() => { const r = readData('level-anomaly.json'); return r && r.built; })(), maxH: 24 * 3650, notConfigured: !readData('level-anomaly.json') },
      { id: 'landslideBacktest', label: (() => { const r = readData('landslide-calibration.json'); return 'Landslide threshold back-test (NASA catalogue on ERA5)' + (r ? ` (${(r.counts || {}).scored} events; ID-ratio AUC ${(r.auc || {}).idRatio})` : ' (not configured: LEARN_NIGRAAN.bat landslide has not run)'); })(),
        at: (() => { const r = readData('landslide-calibration.json'); return r && r.built; })(), maxH: 24 * 3650, notConfigured: !readData('landslide-calibration.json') },
      { id: 'wetness', label: (() => { const w = app.wetness && app.wetness.status(); return 'Catchment wetness (root-zone state, 6-hourly)' + (w && w.ready ? ` (${w.units} tehsils)` : ' (not yet run)'); })(), at: (() => { const w = app.wetness && app.wetness.status(); return w && w.at; })(), maxH: 9, running: !!(app.wetness && app.wetness.status().running) },
      { id: 'backup', label: 'Nightly backup', at: lastBackup(), maxH: 30 },
    ];
    return list.map(j => { const a = hours(j.at); return { ...j, ageH: a == null ? null : Math.round(a * 10) / 10, state: j.running ? 'running' : j.notConfigured ? 'not configured' : a == null ? 'never' : (a > j.maxH || j.missed) ? 'stale' : 'ok' }; });   /* v91.17.261 · j.missed: the job ran but its product is missing */
  }
  /* the archive's own status when it is wired; else its manifest on disk (so the board still shows what is stored) */
  function archiveStatus() {
    try { if (app.archive && app.archive.status) return app.archive.status(); } catch (_) {}
    try { const p = join(dataDir, 'archive', 'manifest.json'); if (!existsSync(p)) return null; const M = JSON.parse(readFileSync(p, 'utf8')); const kinds = {}; let bytes = 0, last = null;
      for (const [k, D] of Object.entries(M.days || {})) { const ds = Object.keys(D).sort(); const b = ds.reduce((a, d) => a + (D[d].bytes || 0), 0); bytes += b; const lw = ds.map(d => D[d].at).filter(Boolean).sort().pop() || null; if (lw && (!last || lw > last)) last = lw; kinds[k] = { days: ds.length, first: ds[0] || null, last: ds[ds.length - 1] || null, bytes: b, lastWrite: lw }; }
      return { dir: 'data/archive', retention: 'permanent (never pruned)', kinds, bytes, mb: Math.round(bytes / 1e5) / 10, lastWrite: last, projection: null, source: 'manifest (module not wired)' }; } catch (_) { return null; }
  }
  /* v91.17.234 · each status file is read at most every 30 s (the ops board read the same files a dozen times per call: 2.4 s in a 150 s laptop profile) */
  const RD = new Map();
  function readData(name) { const c = RD.get(name); if (c && Date.now() - c.at < 30e3) return c.v; let v = null; try { const p = join(dataDir, name); v = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; } catch { v = null; } RD.set(name, { at: Date.now(), v }); return v; }
  function lastBackup() { try { const d = readdirSync(nightly).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort().pop(); if (!d) return null; const m = JSON.parse(readFileSync(join(nightly, d, 'manifest.json'), 'utf8')); return m.at; } catch { return null; } }
  function backup() {
    const day = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10), dir = join(nightly, day);
    mkdirSync(dir, { recursive: true });
    /* v91.17.36 · AUDIT OPS-02 · the list names files that exist; seasonal scores were missing and a
       file that does not exist yet is recorded as skipped, not silently dropped */
    const files = ['nigraan-db.json', 'outlook.json', 'smog.json', 'station-verification.json', 'ensemble-scores.json', 'seasonal-scores.json', 'climatology.json', 'drought-national.json', 'glof-bulletins.json', 'imerg-verification.json', 'mos-table.json', 'mos-retrain.json', 'model-ranking.json', 'hand-tehsil.json', 'wetness.json', 'sponge-tehsil.json', 'lithology-tehsil.json', 'landslide-calibration.json', 'model-blend.json', 'glof-lakes-live.json'], copied = [], skipped = [];
    for (const f of files) { const p = join(dataDir, f); if (existsSync(p)) { copyFileSync(p, join(dir, f)); copied.push({ file: f, bytes: statSync(p).size }); } else skipped.push(f); }
    const log = join(dataDir, 'ensemble-log'); if (existsSync(log)) { cpSync(log, join(dir, 'ensemble-log'), { recursive: true }); copied.push({ file: 'ensemble-log/', files: readdirSync(log).length }); }
    const sl = join(dataDir, 'seasonal-log'); if (existsSync(sl)) { cpSync(sl, join(dir, 'seasonal-log'), { recursive: true }); copied.push({ file: 'seasonal-log/', files: readdirSync(sl).length }); }
    /* v91.17.279 · OPS-01 · the forecast records: since v91.17.126 the run records live in data/records/run_*.json and the database
       copied above holds "records":[]; a restore from a nightly copy had no records. The run files are copied with it. */
    const rd = join(dataDir, 'records'); if (existsSync(rd)) { const rf = readdirSync(rd).filter(n => /^run_[A-Za-z0-9_-]+\.json$/.test(n)); mkdirSync(join(dir, 'records'), { recursive: true });
      for (const n of rf) copyFileSync(join(rd, n), join(dir, 'records', n)); copied.push({ file: 'records/', files: rf.length }); } else skipped.push('records/');
    writeJsonAtomicSync(join(dir, 'manifest.json'), { at: new Date().toISOString(), copied, skipped }, 1);   /* v91.17.283 · WS3 · last: a day folder without a whole manifest is not a backup */
    const all = readdirSync(nightly).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
    for (const old of all.slice(0, Math.max(0, all.length - 14))) rmSync(join(nightly, old), { recursive: true, force: true });
    console.log('  backup: ' + dir + ' (' + copied.length + ' items)');
    return { dir: 'data/nightly/' + day, copied };
  }
  /* v91.17.279 · OPS-12 · free space on the disk that holds the data folder (warn under NIGRAAN_DISK_WARN_GB, default 10 GB; critical
     under NIGRAAN_DISK_CRIT_GB, default 3 GB). A full disk makes every write fail; it is shown on /health and raises an alert. */
  let DK = null;
  function disk() {
    if (DK && Date.now() - DK.t < 30e3) return DK.v;
    let v; try { const f = statfsSync(dataDir); const free = Number(f.bavail) * Number(f.bsize), total = Number(f.blocks) * Number(f.bsize);
      const warnGB = Number(process.env.NIGRAAN_DISK_WARN_GB) || 10, critGB = Number(process.env.NIGRAAN_DISK_CRIT_GB) || 3, gb = free / 1e9;
      v = { freeGB: Math.round(gb * 100) / 100, totalGB: Math.round(total / 1e7) / 100, level: gb < critGB ? 'critical' : gb < warnGB ? 'warn' : 'ok', warnGB, critGB }; }
    catch (e) { v = { freeGB: null, level: 'unknown', error: String(e && (e.code || e.message)) }; }
    DK = { t: Date.now(), v }; return v;
  }
  async function tick() {
    if (alerted.size > 200) alerted.clear();
    /* v91.17.283 · WS3 · durable writes that keep failing (store.writeHealth) count as a repeated failure */
    try { const w = app.store.writeHealth ? app.store.writeHealth() : null; if (w && w.failing) await fail('store-write', 'durable writes failing since ' + w.failingSince + ' (' + w.lastError + ')'); else if (w) success('store-write'); } catch (_) {}
    try { const d = disk(); if (d.level === 'critical' || d.level === 'warn') { const key = 'disk-' + d.level + ':' + pktDay();
      if (!alerted.has(key)) { alerted.set(key, pktDay()); const m = 'Disk space ' + d.level + ': ' + d.freeGB + ' GB free on the data disk (warn under ' + d.warnGB + ' GB, critical under ' + d.critGB + ' GB).';
        console.error('  ALERT ' + m); keepAlerted(); try { await raiseDeduped(app, { type: 'disk_space', severity: d.level === 'critical' ? 'critical' : 'warning', message: m, place: 'data disk', hazard: 'disk_space', level: d.level, details: { freeGB: d.freeGB } }); } catch {} } } } catch (_) {}
    try {
      const hourPk = new Date(Date.now() + 5 * 3600e3).getUTCHours(), lb = hours(lastBackup());
      if (lb == null || lb > 26 || (hourPk >= 2 && lb > 20)) { backup(); success('backup'); }
    } catch (e) { console.error('  backup error', e.message); await fail('backup', e.message); }
    for (const j of jobs()) {
      if (j.state !== 'stale' || !app.provider.configured()) continue;
      const key = j.id + ':' + pktDay(); if (alerted.has(key)) continue; alerted.set(key, pktDay()); keepAlerted();
      const why = j.missed && !(j.ageH > j.maxH) ? j.missed : 'has not completed for ' + j.ageH + ' h (limit ' + j.maxH + ' h)';   /* v91.17.261 */
      try { await raiseDeduped(app, { type: 'job_stale', severity: 'warning', message: j.label + ' ' + why + '.', place: 'this server', hazard: 'job:' + j.id, level: 'stale', details: { job: j.id } }); } catch {}
      console.error('  ALERT ' + j.label + ' stale: ' + why);
    }
  }
  function health() {
    const js = jobs();
    return { at: new Date().toISOString(), ok: js.every(j => j.state === 'ok' || j.state === 'running' || j.state === 'not configured'), notConfigured: js.filter(j => j.state === 'not configured').map(j => j.id), stale: js.filter(j => j.state === 'stale').map(j => j.id), never: js.filter(j => j.state === 'never').map(j => j.id), jobs: js,
      /* v91.17.3 · 3.8 · how often the store is actually written, and how much
         the adaptive debounce is coalescing. A ratio nobody can see is a claim. */
      store: (() => { try { return { ...app.store.writeStats(), note: 'durable writes (records) flush in ~25 ms; provider quota counters are coalesced — see saveSoon in store.mjs' }; } catch { return null; } })(),
      /* v91.17.76 · the permanent training archive (days stored, size, last write) and the AI correction retrain decision */
      archive: (() => { const a = archiveStatus(); return a ? { dir: a.dir, retention: a.retention, kinds: a.kinds, bytes: a.bytes, mb: a.mb, lastWrite: a.lastWrite, projection: a.projection, lastError: a.lastError || null } : null; })(),
      downscaleRetrain: (() => { const r = readData('downscale-retrain.json'); return r ? { at: r.at, ok: r.ok, skipped: !!r.skipped, promoted: !!r.promoted, summary: r.summary || (r.skipped ? r.why : null) || (r.ok === false ? 'failed: see logs/learn_downscale.log' : null), champion: r.champion ? r.champion.version : null, newVersion: r.newVersion || null, previousKeptAs: r.previous_kept_as || null, history: (r.history || []).slice(0, 6).map(h => ({ at: h.at, ok: h.ok, promoted: h.promoted, skipped: h.skipped })), details: 'data/downscale-retrain.json (INTERNAL: held-out skill figures)' } : null; })(),
      disk: disk(), storeWrites: (() => { try { return app.store.writeHealth ? app.store.writeHealth() : null; } catch { return null; } })(),   /* v91.17.279 · OPS-12 */
      tables: (() => { try { return app.tables ? app.tables.status() : null; } catch { return null; } })(),   /* v91.17.221 · audit S-21 · undated or over-age served tables */
      backups: (() => { try { return readdirSync(nightly).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort().reverse(); } catch { return []; } })(),
      failures: Object.fromEntries(FAILS), failRepeat: REPEAT,   /* v91.17.283 · WS3 */
      callBudget: (() => { try { return app.callBudget && typeof app.callBudget.status === 'function' ? app.callBudget.status() : null; } catch (_) { return null; } })() };   /* v91.17.283 · INTEG (WS1 request) */
  }
  return { tick, health, backup, disk, fail, success };
}
