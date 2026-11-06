import os from 'node:os';   /* v91.17.270 · OPS A13 · idle cores for the national run's overlap */
import { ApiError, newId, nowIso } from './core.mjs';
import { ALLOWED_VARIABLES, PROVIDER_ID, PROVIDER_LABEL, leadsFromHourly, alignBatch } from './provider.mjs';
import { recordsDigest, DIGEST_VERSION } from './quality.mjs';
import { raiseDeduped } from './ops.mjs';   /* v91.17.283 · WS3 · one alert per place, hazard, level and window */   /* v91.17.125 · A02 */
import { INPUT_VARIABLES as AI_INPUTS, aiEnabled } from './downscale.mjs';   /* v91.17.73 (agent A) · the AI local correction's inputs ride the upstream call only */
import { probePointOf } from './places.mjs';   /* v91.17.283.20 · item B7 */

const KEEP_RUNS = Number(process.env.NIGRAAN_KEEP_RUN_RECORDS || 12);
const STALE_MIN = 360;

/* v91.17.37 · B · THE HEIGHT THE SWEEP ASKS FOR. elevM is the anchor point's DEM height; in Gojal
   that is 3,639 m while the people live near 2,500 m, and the provider lapses its grid value to
   whatever height it is asked for (-6.5 C/km, measured right by lapse.py). data/settlement-elevation.json
   (station-lake/scripts/settlement_elevation.py: GHS-POP 100 m on the Copernicus DEM) gives the
   population-weighted median height per tehsil; where it differs from the anchor by more than
   150 m the sweep asks at the settlement height. servedElevM says which was used; both heights
   travel with the unit. NIGRAAN_SETTLE_ELEV=0 restores the anchor height. */
const SETTLE_GAP_M = 150;
   /* v91.17.283.20 · item B7 */
export function buildUnitIndex(tehsils, settle = null) {
  const useSettle = process.env.NIGRAAN_SETTLE_ELEV !== '0' && settle && settle.units;
  const byDistrict = new Map(), byProvince = new Map();
  for (const t of tehsils) {
    const dk = t.province + '|' + t.district;
    if (!byDistrict.has(dk)) byDistrict.set(dk, { unitId: dk, level: 'district', name: t.district, district: t.district, division: t.division, province: t.province, disputed: t.disputed, members: [] });
    byDistrict.get(dk).members.push(t);
    if (!byProvince.has(t.province)) byProvince.set(t.province, { unitId: t.province, level: 'province', name: t.province, province: t.province, disputed: t.disputed, members: [] });
    byProvince.get(t.province).members.push(t);
  }
  const avg = (m, k) => Math.round(10000 * m.reduce((s, x) => s + x[k], 0) / m.length) / 10000;
  const districts = [...byDistrict.values()].map(d => ({ ...d, lat: avg(d.members, 'lat'), lon: avg(d.members, 'lon'), tehsilCount: d.members.length, members: undefined }));
  const provinces = [...byProvince.values()].map(p => ({ ...p, lat: avg(p.members, 'lat'), lon: avg(p.members, 'lon'), tehsilCount: p.members.length, members: undefined }));
  const tehsilUnits = tehsils.map(t => { const sv = useSettle ? settle.units[t.unitId] : null; const gap = sv && sv.settlementElevM != null && t.elevM != null ? sv.settlementElevM - t.elevM : null;
    const servedElevM = gap != null && Math.abs(gap) > SETTLE_GAP_M ? sv.settlementElevM : (t.elevM ?? null);
    return { unitId: t.unitId, key: t.key, elevM: servedElevM, anchorElevM: t.elevM ?? null, settleElevM: sv ? sv.settlementElevM : null, settleGapM: gap, settlePop: sv ? sv.pop : null, elevSource: gap != null && Math.abs(gap) > SETTLE_GAP_M ? 'settlement (population-weighted median)' : 'anchor point', emaxM: t.emaxM ?? null, eminM: t.eminM ?? null, level: 'tehsil', name: t.tehsil, tehsil: t.tehsil, district: t.district, division: t.division, province: t.province, lat: t.lat, lon: t.lon, disputed: t.disputed }; });
  return { tehsil: tehsilUnits, district: districts, province: provinces, all: [...tehsilUnits, ...districts, ...provinces] };
}

function normVars(list) {
  const vars = [...new Set((list || []).map(String))];
  const bad = vars.filter(v => !ALLOWED_VARIABLES.has(v));
  if (bad.length) throw new ApiError(422, 'CONTRACT_INVALID', 'Unsupported variable(s): ' + bad.join(', '), { fieldErrors: bad.map(b => ({ field: 'variables', code: 'enum', message: b + ' is not a supported normalized variable.' })) });
  if (!vars.length) throw new ApiError(422, 'CONTRACT_INVALID', 'At least one variable is required.');
  return vars;
}
function normLeads(list, max = 384) {
  const leads = [...new Set((list || []).map(Number))].sort((a, b) => a - b);
  if (!leads.length || leads.some(x => !Number.isInteger(x) || x < 0 || x > max)) throw new ApiError(422, 'CONTRACT_INVALID', 'lead_hours must be integers between 0 and ' + max + '.');
  return leads;
}
const hourFloor = () => { const d = new Date(); d.setUTCMinutes(0, 0, 0); return d.getTime(); };

const RUN_LOCK = { busy: false };
export async function runNationalIngest(app, body, ctx, { jobId = null } = {}) {
  const { store, provider, units, audit } = app;
  const level = body.unit_level || 'tehsil';
  const variables = normVars(body.variables);
  const leadHours = normLeads(body.lead_hours);
  /* v91.17.68 · a run older than 15 minutes is recovered (marked failed) before a new one starts, instead of letting two sweeps
     write records at once (audit B23); the in-process flag stops the same server starting two */
  const running = store.find('runs', r => r.status === 'running');
  if (running && !body.force) {
    if (Date.now() - Date.parse(running.started_at) < 15 * 60e3) throw new ApiError(409, 'INGESTION_CONFLICT', 'Run ' + running.run_id + ' is still running. Use force: true to start another.');
    running.status = 'failed'; running.error = 'lease expired: the run did not finish within 15 minutes'; running.finished_at = new Date().toISOString(); await store.save('runs');
  }
  if (RUN_LOCK.busy && !body.force) throw new ApiError(409, 'INGESTION_CONFLICT', 'a national sweep is running in this process');
  RUN_LOCK.busy = true;
  let list = units[level];
  const limited = body.max_units != null;
  if (limited) list = list.slice(0, Math.max(1, Number(body.max_units)));
  const run = {
    run_id: newId('run'), status: 'running', unit_level: level, variables, lead_hours: leadHours,
    requested_units: list.length, returned_units: 0, coverage: 0, provider: PROVIDER_LABEL, provider_id: PROVIDER_ID,
    started_at: nowIso(), completed_at: null, job_id: jobId, development_limited: limited, actor_id: ctx.identity && ctx.identity.actorId,
    errors: [], batches: 0, records_sha256: null, base_valid_time: new Date(hourFloor()).toISOString(), operational: false,
  };
  try { await store.insert('runs', run); } catch (e) { RUN_LOCK.busy = false; throw e; }
  const baseMs = hourFloor();
  const days = Math.min(16, Math.ceil((Math.max(...leadHours) + 1) / 24) + 1);
  const records = []; const BATCH = 50;
  /* v91.17.283.6 · item 4 · W1 DAY 3 FOR RUNS ISSUED 00:00-04:59 PKT. The GMT window (forecast_days from UTC midnight) of a run based 19-23 UTC
     ends before PKT day 4 ends, so the rain chance had no complete next day for engine day 3. For those base hours only, one more UTC day is
     asked: the provider's weight is unchanged (past 3 + forecast 6 = 9 days, under its 14-day unit; provider.mjs weightOf), the tehsil superset
     (bmrows.mjs, Karachi days to +5) still covers the window, and every hour also in the shorter window is the same value (the provider
     answers each hour of a run once). Proven on the 60-place capture with the clock frozen at 20:00 UTC (CHANGES.md v283.6 item 4).
     NIGRAAN_W1_DAY3=0 turns this alone off; NIGRAAN_RAIN_EXT=0 turns it off with the rest of W1. */
  const fetchDays = (() => { try { if (process.env.NIGRAAN_RAIN_EXT === '0' || process.env.NIGRAAN_W1_DAY3 === '0' || days >= 16) return days;
    const d0 = Date.parse(new Date(baseMs + 5 * 3600e3).toISOString().slice(0, 10) + 'T00:00:00Z') - 5 * 3600e3, utc0 = Math.floor(baseMs / 864e5) * 864e5;
    return utc0 + days * 864e5 < d0 + 5 * 864e5 ? days + 1 : days; } catch (_) { return days; } })();
  /* v91.17.70 · THE TEMPERATURE BASIS PER ZONE (data/model-zone.json via mos.mjs): units whose zone serves another
     temperature model are fetched together with the zone request (best_match + the zone models) and folded by
     verification.mergeZone into one plain series before any correction; every other unit is fetched as before. */
  const zoneReq = (app.mos && app.mos.requestModels) ? app.mos.requestModels() : null;
  /* v91.17.149 · the national model's own inputs (cloud, wind, rain history) and 3 past days, as the proxy adds them for a page request */
  const natNeed = () => { try { return app.national && app.national.enabled && app.national.enabled() && app.national.needVars ? app.national.needVars() : []; } catch (_) { return []; } };
  const needsZone = (u) => { try { if (!zoneReq) return false; const z = app.mos.zoneModel(app.mos.zoneOfPoint(u.lat, u.lon, u.elevM ?? null)); return !(z.members || [z.temperature]).includes('best_match'); } catch { return false; } };
  const zoneSet = new Set(list.filter(needsZone).map(u => u.unitId));
  const batches = [];
  for (const grp of [list.filter(u => zoneSet.has(u.unitId)), list.filter(u => !zoneSet.has(u.unitId))]) for (let i = 0; i < grp.length; i += BATCH) batches.push(grp.slice(i, i + BATCH));
  try {
    for (const batch of batches) {
      const zoneBatch = zoneSet.has(batch[0].unitId);
      let body1;
      try {
        const P1 = {
          latitude: batch.map(u => u.lat), longitude: batch.map(u => u.lon), elevation: batch.map(u => u.elevM ?? 'nan'), hourly: [...new Set([...variables, ...(aiEnabled() ? AI_INPUTS : []), ...natNeed()])],
          forecast_days: fetchDays, past_days: 3, timezone: 'GMT', models: zoneBatch ? zoneReq : 'best_match',
        };
        body1 = zoneBatch ? await provider.call('forecast', '/v1/forecast', P1, { locations: batch.length }) : await bmCall(app, provider, P1, batch.length);
      } catch (e) {
        run.errors.push({ batch: run.batches, units: batch.length, code: e.code, message: e.message });
        if (e.code === 'PROVIDER_QUOTA_EXHAUSTED' || e.details?.faultInjected || e.code === 'PROVIDER_UNAVAILABLE' && !e.retryable) break;
        continue;
      } finally { run.batches++; }
      const arr = alignBatch(body1, batch);   /* v91.17.157 · audit: rows matched by coordinate (and echoed height), not array index */
      /* v91.17.267 · the plains start from the multi-model mix (blend.mjs) for the units whose zone the gate allows: one members call per
         batch (temperature and dew point, nine models, the units' own heights; 1.8 weighted calls per unit, counted by provider.call and on
         the blend's own daily budget), rows shared with the pages through the per-place cache (90 min). Off with the gate's nationalSweep
         false. A failed call or a spent budget: those units stay on best_match. */
      let blendRows = null;
      try { const BL = app.blend; if (BL && BL.sweepOn() && !zoneBatch) {
        const want = batch.map((u) => { try { return BL.wantsZone(app.mos.zoneOfPoint(u.lat, u.lon, u.elevM ?? null)); } catch (_) { return false; } });
        const places = batch.filter((_, k) => want[k]).map((u) => ({ lat: u.lat, lon: u.lon, elev: u.elevM ?? null }));
        if (places.length) { const rows = await BL.rowsFor(places, { pastDays: 3 }, (q) => provider.call('forecast', '/v1/forecast', q, { locations: places.length }));
          let r = 0; blendRows = batch.map((_, k) => (want[k] ? rows[r++] : null)); } } } catch (_) { blendRows = null; }
      /* v91.17.270 · OPS A13 · SEVERAL PLACES IN FLIGHT. v269 sent one place at a time through the queued chain and waited for it, so the
         run was the sum of every place's own steps PLUS every hand-over to the tree workers and back (measured: national run wall
         +10 %, 33.5 -> 36.7 s; here 20.5 s all-at-once vs 22.9 s queued, without the mock provider's time). Now up to NIGRAAN_NAT_INFLIGHT
         places of the batch are queued at once (marked background: customer corrections go first, verification.mjs nextJob), so one
         place's trees evaluate in a worker while the next place's steps run here. Each place is its own generator on its own body;
         the records are still built in the batch's order from each place's own result, so the record and its digest are unchanged.
         NIGRAAN_NAT_INFLIGHT (default 4, 1 = the v269 behaviour). While a person is using the server (a customer request in the last 3 s,
         server.mjs customerActive) only one place is in flight, as in v269, so the run never competes harder with a customer than before;
         the run is fast when nobody is waiting (most hours of the night), and its tree batches use a worker only when one is idle
         (lgbpool.mjs setBackground). Measured in CHANGES.md (OPS A13). */
      const Vq = app.verification, QA = !!(Vq && Vq.servedChainAsync), NIN = Math.max(1, Math.min(16, Number(process.env.NIGRAAN_NAT_INFLIGHT) || 4));
      const optsOf = (k) => ({ zoneModels: zoneBatch ? zoneReq : null, blend: blendRows ? blendRows[k] : null, ewsLive: false });   /* v91.17.283.46 · the national tehsil run is the EWS live anchor's own basis (ewsshadow.mjs runs/servedAt): applying the anchor here fed each run's anchor into the next run's basis (2 Nov 2026: Skardu 47 C). The run stays anchor-free, as the anchor was tested */
      const pend = new Array(batch.length); let launched = 0;
      const launch = (upTo) => { while (QA && launched < batch.length && launched < upTo) { const k = launched++; const L0 = arr[k];
        if (L0 && L0.hourly) { const pr = Vq.servedChainAsync(L0, batch[k].lat, batch[k].lon, optsOf(k), { background: true }); pr.catch(() => {}); pend[k] = pr; } } };   /* .catch: a place that fails is awaited (and throws) in its turn below, never left unhandled */
      const busy = () => { try { return !!(app.customerActive && app.customerActive()); } catch (_) { return false; } };
      /* the overlap needs a free core for the worker beside this thread: with fewer than 1.5 cores idle (1-min load average; Windows
         reports 0 and counts as idle) the batch keeps one place in flight. Measured on the 2-core container saturated by other jobs
         (load 2.7-4): 4 in flight was 2-8 % slower than one; with a core free it was 23 % faster (CHANGES.md OPS A13). */
      const free = (() => { try { return (os.availableParallelism ? os.availableParallelism() : os.cpus().length) - os.loadavg()[0]; } catch (_) { return 2; } })();
      const NB = free >= 1.5 ? NIN : 1;
      for (let k = 0; k < batch.length; k++) { const u = batch[k];
        launch(k + (busy() ? 1 : NB));   /* someone is using the server: one place at a time, as in v269 (customer answers first) */
        const loc = arr[k]; if (!loc || !loc.hourly) continue;
        /* v91.17.207 · the one served chain (verification.servedChain): the same steps in the same order as a page request, the weather
           MOS included (it was missing here), so the run record and the ledger hold what the pages served for the same hour.
           v91.17.269 · PERF · through the queued form (servedChainAsync, the proxy's own path): the trees are evaluated by the worker pool
           and other requests are answered between places. Measured on v268: the all-at-once form held the event loop for about 2 s per
           batch of 50 tehsils (the laptop log's stalls at :22 past every hour, when the hourly run starts). Same steps, same values. */
        const V = app.verification;
        const ch = QA ? await pend[k] : V && V.servedChain ? V.servedChain(loc, u.lat, u.lon, optsOf(k)) : { n: 0, steps: [] };
        const corrected = ch.n > 0;
        const basis = loc.agn_temperature_basis || (app.verification && app.verification.basisOf ? app.verification.basisOf(loc, u.lat, u.lon, 'L0') : null);
        const L = leadsFromHourly(loc.hourly, variables, leadHours, baseMs);
        /* v91.17.103 · the hours of the current PKT day before the run's base hour (from past_days, already fetched): without them a
           run issued at 11:00 PKT holds 13 hours of today and the calibrated rain chance (a day-total model) cannot score today */
        let pastToday = null; try { const H = loc.hourly, tt = H.time || [], pr = H.precipitation || [], d0 = Date.parse(new Date(baseMs + 5 * 3600e3).toISOString().slice(0, 10) + 'T00:00:00Z') - 5 * 3600e3;
          /* v91.17.186 · and the whole previous PKT day: the calibrated rain chance needs the day before as a predictor; a run issued at
             05:00 held only 19 hours of it, so today's chance was withheld ("the previous day's forecast total is not held"): Gilgit,
             6 Oct, 11.1 mm forecast, shown as dry. The hours are the same past_days=3 response, nothing more is requested. */
          const dPrev = d0 - 864e5;
          const ti = [], pi = []; for (let i = 0; i < tt.length; i++) { const ms = Date.parse(tt[i] + 'Z'); if (ms > dPrev && ms <= baseMs) {   /* v91.17.157 · audit: hourly rain is the hour ENDING at the stamp, so today's hours are (midnight, now] */ ti.push(tt[i] + ':00Z'); pi.push(pr[i] == null ? null : pr[i]); } }
          if (ti.length) pastToday = { time: ti, precipitation: pi }; } catch (_) { pastToday = null; }
        if (loc.hourly && Array.isArray(loc.hourly.cloud_cover)) L.hourly.cloud_cover = leadsFromHourly(loc.hourly, ['cloud_cover'], leadHours, baseMs).hourly.cloud_cover;   /* v91.17.76 · the training archive keeps cloud */
        /* v91.17.283.3 · W1 · THE RAIN OF PKT DAYS 3 AND 4 FROM THE HOURS ALREADY FETCHED. The record keeps lead hours 0-72, so the
           calibrated rain chance (a day-total model that needs the day after as a predictor) had no complete day 3 or day 4 and withheld
           heavy rain on engine days 2-3 in every tehsil. The provider answer already holds those hours (forecast_days 5 GMT = up to day+4
           23:00 UTC), so the precipitation after the last lead up to the end of PKT day 4 is kept beside the record, for the rain chance
           only: no extra provider call, no change to the request, to leads/hourly or to any other reader. */
        let rainExt = null; try { const H = loc.hourly, tt = H.time || [], pr = H.precipitation || [], d0 = Date.parse(new Date(baseMs + 5 * 3600e3).toISOString().slice(0, 10) + 'T00:00:00Z') - 5 * 3600e3;
          const from = baseMs + Math.max(0, ...leadHours.map(Number)) * 3600e3, to = d0 + 5 * 864e5; const ti = [], pi = [];
          for (let i = 0; i < tt.length; i++) { const ms = Date.parse(tt[i] + 'Z'); if (ms > from && ms <= to) { ti.push(tt[i] + ':00Z'); pi.push(typeof pr[i] === 'number' && Number.isFinite(pr[i]) ? pr[i] : null); } }
          if (ti.length && process.env.NIGRAAN_RAIN_EXT !== '0') rainExt = { time: ti, precipitation: pi, note: 'precipitation after the last lead hour to the end of PKT day 4, from the same answer; read by the rain chance only' }; } catch (_) { rainExt = null; }
        /* v91.17.283.8 · planned C · THE AS-ISSUED ARCHIVE TO 96 HOURS. The record keeps lead hours 0-72, so the permanent forecast archive
           (archive.mjs fcRow) held 73 hours and day 3 of an issue could never be verified. The served answer (loc.hourly, after the one served
           chain above) already holds the hours to 96 h, so they are kept beside the record for the archive ONLY (archExt): no extra provider
           call, no change to the request, to the record's leads or hourly, or to any other reader. NIGRAAN_ARCH96=0 turns it off. */
        let archExt = null; try { if (process.env.NIGRAAN_ARCH96 !== '0') { const H = loc.hourly, tt = H.time || []; const from = baseMs + Math.max(0, ...leadHours.map(Number)) * 3600e3, to = baseMs + 96 * 3600e3;
            const vars = [...variables, ...(Array.isArray(H.cloud_cover) ? ['cloud_cover'] : [])]; const ext = { time: [] }; for (const v of vars) ext[v] = [];
            const at = new Map(); for (let i = 0; i < tt.length; i++) { const ms = Date.parse(String(tt[i]).replace(/Z?$/, 'Z')); if (Number.isFinite(ms)) at.set(ms, i); }
            for (let ms = from + 3600e3; ms <= to; ms += 3600e3) { const i = at.get(ms); ext.time.push(new Date(ms).toISOString().slice(0, 16) + ':00Z'); for (const v of vars) { const x = i != null && Array.isArray(H[v]) ? H[v][i] : null; ext[v].push(typeof x === 'number' && Number.isFinite(x) ? x : null); } }
            if (ext.time.length && ext.time.some((_, k) => typeof ext[variables[0]][k] === 'number')) archExt = { ...ext, note: 'served hours after the last lead to 96 h, from the same corrected answer; read by the permanent forecast archive only' }; } } catch (_) { archExt = null; }
        records.push({
          recordId: run.run_id + ':' + u.unitId, runId: run.run_id, unitKey: u.unitId, unitType: level, name: u.name,
          district: u.district || null, province: u.province, disputed: !!u.disputed, lat: u.lat, lon: u.lon,
          resolvedLat: loc.latitude, resolvedLon: loc.longitude, resolvedElevationM: loc.elevation ?? null,
          provider: PROVIDER_LABEL, providerRun: null, providerRunNote: 'the provider does not publish the model initialisation time for best_match; lead-specific verification uses the previous-runs API',
          retrievedAt: nowIso(), biasCorrected: corrected, chain: { version: 'chain@207', steps: ch.steps }, temperatureBasis: basis ? { zone: basis.zone, model: basis.model, fallback: basis.fallback || null, elevM: basis.elevM, correction: basis.correction || 'L0', version: basis.version, ...(basis.start ? { start: basis.start.source } : {}) } : null, validTime: L.validTime, leads: L.leads, hourly: L.hourly, days: [], coverage: L.coverage,
          pastToday, ...(rainExt ? { rainExt } : {}), ...(archExt ? { archExt } : {}), contractVersion: 'forecast@1.0.0',
        });
      }
    }
    run.returned_units = records.length;
    const cov = records.length ? records.reduce((s, r) => s + r.coverage, 0) / list.length : 0;
    run.coverage = Math.round(10 * cov) / 10;
    run.status = !records.length ? 'failed' : (run.returned_units === run.requested_units && run.coverage >= 95 ? 'complete' : 'partial');
    run.operational = run.status === 'complete' && !limited && level === 'tehsil';
    run.records_sha256 = recordsDigest(records); run.digest_version = DIGEST_VERSION;   /* v91.17.125 · A02 · the whole record */
    run.completed_at = nowIso();
    await store.insertMany('records', records);
    await pruneRecords(store);
    await store.save('runs');
    try { if (app.verification) await app.verification.logServed(run); } catch {}
    await audit.record('national.ingest', run.status, ctx, { runId: run.run_id, requested: run.requested_units, returned: run.returned_units, coverage: run.coverage, errors: run.errors.length });
    /* v91.17.283 · WS3 · one open alert per run level, status and Pakistan day (raiseDeduped): each hourly run of an outage used to open its
       own alert; and a run that is not complete counts toward the repeated-failure alert, a complete one resets it */
    if (run.status !== 'complete') { await raiseDeduped(app, { type: 'ingestion.coverage', severity: run.status === 'failed' ? 'critical' : 'warning', message: 'Run ' + run.run_id + ' finished ' + run.status + ' with coverage ' + run.coverage + '%.', place: 'national ' + level + ' run', hazard: 'ingestion.coverage', level: run.status, details: { runId: run.run_id, coverage: run.coverage } });
      try { if (app.ops && app.ops.fail) await app.ops.fail('national-run', 'run ' + run.run_id + ' ' + run.status + ', coverage ' + run.coverage + '%'); } catch (_) {} }
    else { try { if (app.ops && app.ops.success) app.ops.success('national-run'); } catch (_) {} }
    return run;
  } catch (e) {
    run.status = 'failed'; run.completed_at = nowIso(); run.errors.push({ code: e.code || 'INTERNAL_ERROR', message: e.message }); await store.save('runs');
    try { if (app.ops && app.ops.fail) await app.ops.fail('national-run', 'run ' + run.run_id + ' failed: ' + e.message); } catch (_) {}   /* v91.17.283 · WS3 */
    throw e;
  } finally { RUN_LOCK.busy = false; }
}
async function pruneRecords(store) {
  const runs = store.all('runs').filter(r => r.records_sha256).sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
  const keep = new Set(runs.slice(0, KEEP_RUNS).map(r => r.run_id));
  const promoted = new Set(store.filter('promotions', p => p.status !== 'revoked').map(p => p.run_id));
  const removed = await store.removeWhere('records', r => !keep.has(r.runId) && !promoted.has(r.runId));
  if (removed) for (const r of store.all('runs')) if (!keep.has(r.run_id) && !promoted.has(r.run_id)) r.records_pruned = true;
  /* v91.17.68 · bookkeeping retention (audit C17): idempotency keys 7 days, worker events 30 days, terminal jobs 30 days. The audit
     chain, the forecast log (verification input), runs and skill rows are kept. Measured before: 54 MB rewritten on every durable write. */
  try {
    const d7 = Date.now() - 7 * 86400e3, d30 = Date.now() - 30 * 86400e3;
    await store.removeWhere('idempotency', r => Date.parse(r.at || r.createdAt || r.created_at || 0) < d7);
    await store.removeWhere('workerEvents', r => Date.parse(r.at || r.created_at || 0) < d30);
    await store.removeWhere('jobs', r => ['succeeded', 'dead_letter', 'cancelled'].includes(r.status) && Date.parse(r.finished_at || r.updated_at || r.created_at || 0) < d30);
  } catch (_) {}
}

function trimRecord(r, vars, leads) {
  const out = { ...r, leads: {}, hourly: { time: r.hourly.time } }; delete out.rainExt;   /* W1: the rain-chance hours are not part of the record API */
  for (const L of leads) { const src = r.leads[String(L)]; if (!src) continue; const row = { validTime: src.validTime }; for (const v of vars) row[v] = src[v] ?? null; out.leads[String(L)] = row; }
  for (const v of vars) out.hourly[v] = r.hourly[v] || [];
  return out;
}
export function latestSnapshot(app, { unit_level, variables, lead_hours, allow_expired }) {
  const vars = normVars(variables), leads = normLeads(lead_hours);
  const runs = app.store.all('runs').filter(r => r.unit_level === unit_level && ['complete', 'partial'].includes(r.status) && !r.records_pruned
    && vars.every(v => r.variables.includes(v)) && leads.every(l => r.lead_hours.includes(l)))
    .sort((a, b) => Date.parse(b.completed_at) - Date.parse(a.completed_at));
  const run = runs[0];
  if (!run) throw new ApiError(404, 'SNAPSHOT_NOT_AVAILABLE', 'No stored run covers ' + unit_level + ' / ' + vars.join(',') + ' / leads ' + leads.join(',') + '. Start one with POST /api/v1/national/ingest.');
  const ageMin = (Date.now() - Date.parse(run.completed_at)) / 60e3;
  const expired = ageMin > STALE_MIN;
  if (expired && !(allow_expired === true || allow_expired === 'true')) throw new ApiError(404, 'SNAPSHOT_NOT_AVAILABLE', 'The latest matching run is ' + Math.round(ageMin) + ' minutes old (stale after ' + STALE_MIN + '). Pass allow_expired=true or ingest again.', { details: { runId: run.run_id, ageMinutes: Math.round(ageMin) } });
  const records = app.store.filter('records', x => x.runId === run.run_id).map(r => trimRecord(r, vars, leads));
  return { run, records, expired, ageMinutes: Math.round(ageMin) };
}

export const handlers = {
  'shared.units.search': async (app, { query }) => {
    const q = String(query.q || '').trim().toLowerCase(); const level = query.level || 'all';
    const pool = level === 'all' ? app.units.all : app.units[level];
    const hit = pool.filter(u => [u.name, u.tehsil, u.district, u.province, u.unitId].some(x => x && String(x).toLowerCase().includes(q)))
      .sort((a, b) => (a.name.toLowerCase() === q ? -1 : 0) - (b.name.toLowerCase() === q ? -1 : 0));
    return { data: hit, collection: true, meta: { registry: 'PK administrative units (577 tehsils) from the sealed artefact geometry', disputedNote: 'IIOJK is carried as disputed territory.' } };
  },

  'system.providers': async (app, { query }) => {
    const w = app.provider.windowFor();
    let probe = null;
    if (query.probe === true || query.probe === 'true') {
      const t0 = Date.now();
      try { await app.provider.call('forecast', '/v1/forecast', { ...probePointOf(app), hourly: 'temperature_2m', forecast_days: 1 }); probe = { ok: true, latencyMs: Date.now() - t0 }; }
      catch (e) { probe = { ok: false, code: e.code, message: e.message, latencyMs: Date.now() - t0 }; }
    }
    return { data: {
      schema: 'agn.providers.v1', status: app.provider.configured() ? (probe && !probe.ok ? 'degraded' : 'operational') : 'unconfigured',
      selection: { primary: PROVIDER_ID, label: PROVIDER_LABEL, tier: app.provider.configured() ? 'commercial' : 'none', fallback: 'none — fail closed' },
      adapters: [{ id: PROVIDER_ID, label: PROVIDER_LABEL, tier: 'commercial', configured: app.provider.configured(), capabilities: ['point-forecast', 'national-forecast', 'previous-runs', 'reanalysis-archive'],
        serverSideOnly: true, quotaWindow: { day: w.day, calls: w.calls, locations: w.locations, failures: w.failures, quotaErrors: w.quotaErrors, lastStatus: w.lastStatus }, probe,
        faultInjection: app.provider.fault.enabled && Date.now() < app.provider.fault.until ? app.provider.fault.mode : null }],
      productionBoundary: { browserHoldsKey: false, freeTierFallback: false, silentSubstitution: false, note: 'All provider traffic passes through this server; a missing key refuses rather than downgrades.' },
    } };
  },

  'live.pointForecast': async (app, { query }) => {
    const vars = normVars(query.variables); const leads = normLeads(query.lead_hours && query.lead_hours.length ? query.lead_hours : [0, 24, 48, 72]);
    const models = (query.models && query.models.length ? query.models : ['best_match']).join(',');
    if (query.initialization_time) throw new ApiError(422, 'CONTRACT_INVALID', 'initialization_time selection is served by model-verification runs (previous-runs API), not by the live point forecast.');
    const days = Math.min(16, Math.ceil((Math.max(...leads) + 1) / 24) + 1);
    const body = await app.provider.call('forecast', '/v1/forecast', { latitude: query.latitude, longitude: query.longitude, hourly: vars, models, forecast_days: days, past_days: 1, timezone: 'GMT' });
    const hourly = {}; const src = body.hourly || {}; hourly.time = src.time || [];
    // multi-model responses suffix variables with _<model>; best_match does not
    for (const k of Object.keys(src)) if (k !== 'time') hourly[k] = src[k];
    const baseVars = Object.keys(hourly).filter(k => k !== 'time');
    const L = leadsFromHourly(hourly, baseVars, leads, hourFloor());
    return { data: {
      unitKey: 'point:' + Number(query.latitude).toFixed(4) + ',' + Number(query.longitude).toFixed(4), unitType: 'point',
      provider: PROVIDER_LABEL, providerRun: null, retrievedAt: nowIso(), validTime: L.validTime, models: models.split(','),
      resolved: { latitude: body.latitude, longitude: body.longitude, elevationM: body.elevation ?? null },
      leads: L.leads, hourly: L.hourly, days: [], coverage: L.coverage, units: body.hourly_units || {}, contractVersion: 'forecast@1.0.0',
    }, meta: { staleAfterMinutes: 360 } };
  },

  'live.nationalForecast': async (app, { query }) => {
    const s = latestSnapshot(app, { unit_level: query.unit_level, variables: query.variables, lead_hours: query.lead_hours, allow_expired: query.allow_expired });
    if (query.model_run && query.model_run !== s.run.run_id) throw new ApiError(404, 'SNAPSHOT_NOT_AVAILABLE', 'model_run ' + query.model_run + ' is not the latest matching run.');
    return { data: s.records, collection: true, meta: { runId: s.run.run_id, runStatus: s.run.status, coverage: s.run.coverage, stale: s.expired, ageMinutes: s.ageMinutes } };
  },

  'live.nationalIngest': async (app, { body }, ctx) => ({ data: await runNationalIngest(app, body, ctx), status: 201 }),

  'live.nationalRuns': async (app) => ({ data: app.store.all('runs').slice().sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at)), collection: true }),
  'live.nationalRun': async (app, { path }) => {
    const r = app.store.find('runs', x => x.run_id === path.run_id);
    if (!r) throw new ApiError(404, 'NOT_FOUND', 'Run ' + path.run_id + ' not found.');
    return { data: r };
  },
  'live.nationalRunRecords': async (app, { path }) => {
    const r = app.store.find('runs', x => x.run_id === path.run_id);
    if (!r) throw new ApiError(404, 'NOT_FOUND', 'Run ' + path.run_id + ' not found.');
    if (r.records_pruned) throw new ApiError(404, 'SNAPSHOT_NOT_AVAILABLE', 'Records for this run were pruned (retention keeps the last ' + KEEP_RUNS + ' runs and every promoted run). The run summary and its records_sha256 remain.');
    return { data: app.store.filter('records', x => x.runId === r.run_id), collection: true };
  },
  'live.nationalCache': async (app) => {
    const runs = app.store.all('runs'); const latest = runs.slice().sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))[0] || null;
    const recs = app.store.all('records');
    const byRun = {}; for (const r of recs) byRun[r.runId] = (byRun[r.runId] || 0) + 1;
    return { data: {
      schema: 'agn.national-cache.v1', unitRegistry: { tehsil: app.units.tehsil.length, district: app.units.district.length, province: app.units.province.length, disputed: app.units.tehsil.filter(u => u.disputed).length },
      runCount: runs.length, recordCount: recs.length, cacheEntries: Object.entries(byRun).map(([runId, n]) => ({ runId, records: n })),
      latestRun: latest && { run_id: latest.run_id, status: latest.status, coverage: latest.coverage, completed_at: latest.completed_at, stale: latest.completed_at ? (Date.now() - Date.parse(latest.completed_at)) / 60e3 > STALE_MIN : null },
      retention: { keepRunRecords: KEEP_RUNS, promotedRunsKept: true }, staleAfterMinutes: STALE_MIN,
    } };
  },
  'live.nationalSnapshot': async (app, { query }) => {
    const s = latestSnapshot(app, query);
    return { data: { runId: s.run.run_id, run: s.run, records: s.records, coverage: s.run.coverage, stale: s.expired, ageMinutes: s.ageMinutes } };
  },

  /* The canonical hazard engine (formula registry, calibration ladder) lives inside the
     sealed artefact and is not re-implemented here: a second implementation that
     disagrees with the first is the failure the product is built to prevent. The
     endpoint therefore answers with explicit per-unit refusals, never a score. */
  'overview.nationalHazards': async (app, { path, query }) => {
    const level = query.level; const units = app.units[level];
    let snap = null; try { snap = latestSnapshot(app, { unit_level: level === 'province' ? 'district' : level, variables: ['temperature_2m'], lead_hours: [0], allow_expired: true }); } catch {}
    const rows = units.map(u => ({
      hazard: path.hazard, unitKey: u.unitId, unitType: level, name: u.name, score: null, status: 'unavailable', coverage: null,
      validTime: new Date(Date.parse(query.valid_date) + Number(query.lead_hours) * 3600e3).toISOString(), formulaVersion: null,
      disputed: !!u.disputed, reason: 'SERVER_ENGINE_NOT_DEPLOYED', contractVersion: 'hazardResult@1.0.0',
    }));
    return { data: rows, collection: true, meta: { engine: 'not deployed server-side', why: 'Hazard scores are computed by the canonical engine inside the sealed artefact. This backend stores provider inputs and governance evidence; it does not publish a second, unverified score.', inputsRunId: snap ? snap.run.run_id : null } };
  },

  'operations.state': async (app, { query }) => {
    const u = app.units.all.find(x => x.unitId === query.unit_id || x.name.toLowerCase() === String(query.unit_id).toLowerCase());
    if (!u) throw new ApiError(404, 'NOT_FOUND', 'Unit ' + query.unit_id + ' is not in the registry. Use /api/v1/units/search.');
    const horizonH = { now: 0, '6h': 6, '24h': 24, '72h': 72 }[query.horizon];
    const hazards = query.hazards && query.hazards.length ? query.hazards : ['heat', 'flood', 'rain_hz', 'wind'];
    const validTime = new Date(hourFloor() + (horizonH || 0) * 3600e3).toISOString();
    const openActions = app.store.filter('actions', a => a.unit_id === u.unitId && !['closed', 'cancelled'].includes(a.status));
    return { data: {
      unit: u, horizon: query.horizon, validTime, expiresAt: new Date(Date.parse(validTime) + 3600e3).toISOString(),
      verdicts: hazards.map(h => ({ hazard: h, status: horizonH == null ? 'out-of-scope' : 'unavailable', class: null, reason: horizonH == null ? 'Climate horizons (seasonal/2030/2050) are not served by this backend.' : 'SERVER_ENGINE_NOT_DEPLOYED' })),
      openActions: openActions.map(a => ({ actionId: a.actionId, hazard: a.hazard, status: a.status, version: a.version })),
    } };
  },
};

/* v91.17.283.2 · D4 · a best_match GMT batch takes the locations the tehsil superset holds for this model run (api/bmrows.mjs composeGmt: the
   same hours relabelled in UTC, exact) and asks the provider only for the others, with the same request cut to those locations (the provider
   answers each location on its own). Nothing held: the batch is asked as before. */
async function bmCall(app, provider, P, n) {
  let part = null; try { part = app.bmRows ? await app.bmRows.composeGmt(P) : null; } catch (_) { part = null; }
  if (!part || !part.some(Boolean)) return provider.call('forecast', '/v1/forecast', P, { locations: n });
  const rest = []; part.forEach((x, i) => { if (!x) rest.push(i); });
  const out = part.slice();
  if (rest.length) { const pick = (a) => rest.map((i) => a[i]);
    const b = await provider.call('forecast', '/v1/forecast', { ...P, latitude: pick(P.latitude), longitude: pick(P.longitude), elevation: pick(P.elevation) }, { locations: rest.length });
    const got = Array.isArray(b) ? b : [b]; if (got.length !== rest.length) throw new Error('provider answered ' + got.length + ' locations for ' + rest.length);
    rest.forEach((i, k) => { out[i] = got[k]; }); }
  return out.length === 1 ? out[0] : out;
}
