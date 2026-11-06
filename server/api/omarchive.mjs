/* ══ v91.17.283.24 · ONE-TIME JOB: THE OPEN-METEO PAST-FORECAST ARCHIVE FOR THE RETRAIN ═════════════════════════════════════════════
   What    every point of data/retrain/om_points.csv (580: pid, lat, lon), every 00 UTC run from the job file's firstRun to the last run
           before the job first started, leads 0..leadHours hourly, the job file's variables, one source per model of the served chain
           (data/retrain/om_archive.job.json sources), raw at the model grid (elevation=nan) with the grid elevation as a column.
   How     the Single Runs archive (provider kind singleRuns, as report.mjs pointRun): one named run (run=YYYY-MM-DDT00:00) answers its own
           leads. Calls go through the server's provider (provider.mjs: the paid key is added there and is never printed, logged or
           written by this job; the state and the files hold no URL) and so through the call budget (callbudget.mjs gateProvider): each
           call is weighted (weightOf) and counted as background with the job's tag (learn-om-archive -> tier P6, the lowest), so a
           person's request is never refused for it.
   Pace    the job spends at most dailyShareOfCap x the day's cap (callbudget limits) per UTC day, spread over the day (by the elapsed
           share of the day), in shed / enforce mode never past the background allowance of the day (monitor mode: its own share only,
           v283.26), and it stops for the day at the first budget refusal.
           With no daily cap configured it does not run (nothing to stay under).
   Resume  one file per source and run, data/retrain/om_archive/<src>/<YYYY-MM-DD>.csv.gz, written to a .tmp and renamed: a file that exists
           is done and never fetched again. data/retrain/om_archive/state.json keeps the fixed last run (set at the first start), today's
           spend, the runs a source does not hold (empty or refused by the provider, with the reason) and, once every source and run is done,
           complete: true, after which the job does nothing.
   Status  GET /api/ops/pyjobs (omArchive): progress, today's spend, the estimate of the total weighted calls and the days it needs.
   Off     NIGRAAN_OM_ARCHIVE=0. */
import { readFileSync, writeFileSync, renameSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { weightOf, alignBatch } from './provider.mjs';

const isN = (x) => typeof x === 'number' && Number.isFinite(x);
const DAY = 864e5;
export const COLUMNS_FIXED = ['pid', 'src', 'init_utc', 'valid_utc', 'lead_h'];

export function readJob(dataDir) {
  const f = join(dataDir, 'retrain', 'om_archive.job.json');
  const j = JSON.parse(readFileSync(f, 'utf8'));
  const need = ['firstRun', 'runHourUtc', 'leadHours', 'hourly', 'sources', 'dailyShareOfCap', 'pointsPerCall', 'tickMinutes', 'tag'];
  for (const k of need) if (j[k] == null) throw new Error('om_archive.job.json: ' + k + ' is missing');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(j.firstRun)) throw new Error('om_archive.job.json: firstRun must be YYYY-MM-DD');
  if (!(j.dailyShareOfCap > 0 && j.dailyShareOfCap <= 1)) throw new Error('om_archive.job.json: dailyShareOfCap must be in (0, 1]');
  if (!(Number.isInteger(j.pointsPerCall) && j.pointsPerCall >= 1)) throw new Error('om_archive.job.json: pointsPerCall must be a positive integer');
  return j;
}
export function readPoints(dataDir) {
  const t = readFileSync(join(dataDir, 'retrain', 'om_points.csv'), 'utf8').trim().split(/\r?\n/); const h = t[0].split(',');
  const ip = h.indexOf('pid'), ia = h.indexOf('lat'), io = h.indexOf('lon'); if (ip < 0 || ia < 0 || io < 0) throw new Error('om_points.csv needs pid, lat, lon');
  return t.slice(1).map((l) => l.split(',')).map((c) => ({ pid: c[ip], lat: Number(c[ia]), lon: Number(c[io]) })).filter((p) => p.pid !== '' && isN(p.lat) && isN(p.lon));
}
/* the runs from firstRun to lastRun (UTC days, inclusive) */
export function runDays(firstRun, lastRun, every = 1) { const out = []; const st = Math.max(1, Math.floor(every) || 1); for (let t = Date.parse(firstRun + 'T00:00:00Z'), e = Date.parse(lastRun + 'T00:00:00Z'); t <= e; t += st * DAY) out.push(new Date(t).toISOString().slice(0, 10)); return out; }
/* the weight of one source and run for every point, as the provider bills it (calls of pointsPerCall locations) */
export function weightPerRun(job, nPoints) {
  const q = { hourly: job.hourly, models: 'x', forecast_hours: String(job.leadHours + 1) }; let w = 0;
  for (let i = 0; i < nPoints; i += job.pointsPerCall) w += weightOf((k) => q[k], Math.min(job.pointsPerCall, nPoints - i));
  return w;
}

export function createOmArchive({ dataDir, provider, budget, env = process.env, now = () => Date.now(), log = () => {}, schedule = null }) {
  const dir = join(dataDir, 'retrain', 'om_archive'), SF = join(dir, 'state.json');
  const on = () => env.NIGRAAN_OM_ARCHIVE !== '0';
  let job = null, pts = null, loadErr = null;
  try { job = readJob(dataDir); pts = readPoints(dataDir); } catch (e) { loadErr = String(e.message || e); }
  let S = (() => { try { return JSON.parse(readFileSync(SF, 'utf8')) || {}; } catch (_) { return {}; } })();
  const save = () => { try { mkdirSync(dir, { recursive: true }); writeFileSync(SF + '.tmp', JSON.stringify(S, null, 1)); renameSync(SF + '.tmp', SF); } catch (_) {} };
  const mem = { running: false, lastTick: null, lastStop: null, lastError: null };
  const fileOf = (src, day) => join(dir, src, day + '.csv.gz');
  const skipKey = (src, day) => src + '|' + day;
  function lastRunDay() {
    if (!S.lastRun) { const t = now() - (Number(job.lastRunLagHours) || 0) * 3600e3; const d = new Date(t); const day = d.toISOString().slice(0, 10);
      const ok = d.getUTCHours() >= job.runHourUtc; S.lastRun = ok ? day : new Date(Date.parse(day + 'T00:00:00Z') - DAY).toISOString().slice(0, 10); S.firstStart = new Date(now()).toISOString(); save(); }
    return S.lastRun;
  }
  /* the (source, run) pairs still to fetch, in order: best_match first (the served base everywhere), then the blend models; runs oldest first */
  function todo(limit = Infinity) {
    const days = runDays(job.firstRun, lastRunDay(), job.runEveryDays), out = []; const skip = S.skip || {};
    for (const src of job.sources) { let have = null; try { have = new Set(readdirSync(join(dir, src)).filter((f) => f.endsWith('.csv.gz')).map((f) => f.slice(0, 10))); } catch (_) { have = new Set(); }
      for (const d of days) { if (have.has(d) || skip[skipKey(src, d)]) continue; out.push({ src, day: d }); if (out.length >= limit) return out; } }
    return out;
  }
  function counts() {
    const days = runDays(job.firstRun, S.lastRun || lastRunDay(), job.runEveryDays); let done = 0, skipped = Object.keys(S.skip || {}).length;
    for (const src of job.sources) { try { done += readdirSync(join(dir, src)).filter((f) => f.endsWith('.csv.gz')).length; } catch (_) {} }
    return { total: days.length * job.sources.length, done, skipped, runs: days.length, sources: job.sources.length };
  }
  const today = () => new Date(now()).toISOString().slice(0, 10);
  const spentToday = () => (S.day === today() ? S.spent || 0 : 0);
  const spend = (w) => { if (S.day !== today()) { S.day = today(); S.spent = 0; } S.spent = Math.round((S.spent + w) * 100) / 100; S.spentTotal = Math.round(((S.spentTotal || 0) + w) * 100) / 100; };
  /* may a call of weight w go now? the job's share of the day's cap, spread over the day; never past the day's background allowance */
  function room(w) {
    const L = budget && budget.limits ? budget.limits(now()) : null; if (!L || !(L.cap > 0)) return { ok: false, why: 'no daily cap is configured (data/provider-budget.json): the job does not run without one' };
    const share = job.dailyShareOfCap * L.cap, frac = Math.min(1, ((now() % DAY) + job.tickMinutes * 60e3) / DAY);
    if (spentToday() + w > share * frac) return { ok: false, why: spentToday() + w > share ? 'the day\'s share is spent (' + Math.round(share) + ' weighted)' : 'paced: ' + Math.round(share * frac) + ' of the day\'s ' + Math.round(share) + ' allowed so far' };
    let used = null; try { const st = budget.status(); used = st && isN(st.usedWeighted) ? st.usedWeighted : null; } catch (_) { used = null; }
    /* v91.17.283.26 · owner 27 Oct 23:16 PKT: in monitor mode nothing is refused, so the job is held only by its own daily share above;
       in shed and enforce modes it also stops at the day's background allowance (people's requests first) */
    if (L.mode !== 'monitor' && used != null && used + w > L.shedAt) return { ok: false, why: 'the day\'s provider use is at the background allowance: people\'s requests first' };
    return { ok: true };
  }
  const call = (params, n) => (budget && budget.runAs ? budget.runAs('background', () => provider.call('singleRuns', '/v1/forecast', params, { locations: n, timeoutMs: 120000 }), job.tag) : provider.call('singleRuns', '/v1/forecast', params, { locations: n, timeoutMs: 120000 }));
  const fmt = (v) => (isN(v) ? String(Math.round(v * 100) / 100) : '');
  /* one source and run for every point -> { rows } | { empty } | { refused } | { stop } */
  async function fetchRun(src, day) {
    const run = day + 'T' + String(job.runHourUtc).padStart(2, '0') + ':00', init = Date.parse(run + ':00Z'), lines = [];
    let anyValue = false;
    for (let i = 0; i < pts.length;) {
      const n = i === 0 ? 1 : Math.min(job.pointsPerCall, pts.length - i);   /* the first point alone: a run the source does not hold costs 1, not 580 */
      const B = pts.slice(i, i + n);
      const q = { latitude: B.map((p) => p.lat.toFixed(4)).join(','), longitude: B.map((p) => p.lon.toFixed(4)).join(','), elevation: B.map(() => 'nan').join(','),
        hourly: job.hourly, models: src, run, forecast_hours: String(job.leadHours + 1), timezone: 'GMT', ...(job.windSpeedUnit ? { wind_speed_unit: job.windSpeedUnit } : {}) };
      const w = weightOf((k) => q[k], n);
      let body;
      try { body = await call(q, n); }
      catch (e) { const st = e && e.status, code = e && e.code;
        if (code === 'PROVIDER_QUOTA_EXHAUSTED' || st === 429) return { stop: 'the call budget refused the call (' + (e.message || code) + ')' };
        if (code === 'CONTRACT_INVALID' || (st >= 400 && st < 500)) return { refused: String(e.message || code).replace(/apikey=[^&\s]*/gi, 'apikey=***').slice(0, 200) };
        return { stop: 'the provider did not answer: ' + String(e.message || code || e).replace(/apikey=[^&\s]*/gi, 'apikey=***').slice(0, 160) }; }
      spend(w);
      const rows = alignBatch(body, B.map((p) => ({ lat: Number(p.lat.toFixed(4)), lon: Number(p.lon.toFixed(4)) })));
      B.forEach((p, k) => { const x = rows[k], H = x && x.hourly, T = (H && H.time) || [], el = x && isN(x.elevation) ? x.elevation : null;
        for (let t = 0; t < T.length; t++) { const vm = Date.parse(String(T[t]).slice(0, 16) + ':00Z'); if (!isN(vm)) continue; const lead = Math.round((vm - init) / 3600e3); if (lead < 0 || lead > job.leadHours) continue;
          const vals = job.hourly.map((v) => (H[v] ? H[v][t] : null)); if (vals.some(isN)) anyValue = true;
          lines.push([p.pid, src, run + 'Z', new Date(vm).toISOString().slice(0, 16) + 'Z', lead, ...vals.map(fmt), fmt(el)].join(',')); } });
      if (i === 0 && !anyValue) return { empty: 'the source holds no value for this run at the first point' };
      i += n;
    }
    return anyValue ? { rows: lines } : { empty: 'the source holds no value for this run' };
  }
  async function tick(why = 'scheduled') {
    if (!on()) return { ran: false, why: 'off (NIGRAAN_OM_ARCHIVE=0)' };
    if (loadErr) return { ran: false, why: loadErr };
    if (S.complete) return { ran: false, complete: true };
    if (mem.running) return { ran: false, why: 'running' };
    if (provider && provider.configured && !provider.configured()) return { ran: false, why: 'the provider key is not configured on this server' };
    mem.running = true; mem.lastTick = new Date(now()).toISOString(); let n = 0, stop = null;
    try {
      for (;;) { const T = todo(1); if (!T.length) { S.complete = true; S.completedAt = new Date(now()).toISOString(); save(); log('om archive: complete'); break; }
        const { src, day } = T[0]; const rm = room(weightPerRun(job, pts.length)); if (!rm.ok) { stop = rm.why; break; }   /* a whole source run fits before it starts (no run is left half-fetched) */
        const r = await fetchRun(src, day);
        if (r.stop) { stop = r.stop; break; }
        if (r.refused || r.empty) { S.skip = S.skip || {}; S.skip[skipKey(src, day)] = r.refused ? 'refused: ' + r.refused : 'empty: ' + r.empty; save(); continue; }
        const f = fileOf(src, day); mkdirSync(join(dir, src), { recursive: true });
        const head = [...COLUMNS_FIXED, ...job.hourly, 'grid_elevation_m'].join(',');
        writeFileSync(f + '.tmp', gzipSync(head + '\n' + r.rows.join('\n') + '\n')); renameSync(f + '.tmp', f); n++; save(); }
    } catch (e) { mem.lastError = String(e && e.message || e).replace(/apikey=[^&\s]*/gi, 'apikey=***').slice(0, 200); }
    finally { mem.running = false; mem.lastStop = stop; save(); }
    return { ran: true, written: n, stop, why };
  }
  function estimate() {
    if (!job || !pts) return null; const L = budget && budget.limits ? budget.limits(now()) : null, C = counts();
    const perRun = weightPerRun(job, pts.length), total = perRun * C.total, left = perRun * Math.max(0, C.total - C.done - C.skipped);
    const perDay = L && L.cap > 0 ? job.dailyShareOfCap * L.cap : null;
    return { weightedPerSourceRun: perRun, totalWeighted: Math.round(total), remainingWeighted: Math.round(left), dailyCap: L ? Math.round(L.cap) : null, jobDailyShare: job.dailyShareOfCap,
      jobDailyWeighted: perDay ? Math.round(perDay) : null, daysTotal: perDay ? Math.ceil(total / perDay) : null, daysLeft: perDay ? Math.ceil(left / perDay) : null,
      basis: 'one call of ' + job.pointsPerCall + ' points (the first point alone) per source and run; ' + job.hourly.length + ' variables, ' + (job.leadHours + 1) + ' hours: the provider weight is 1 per location (weightOf)' };
  }
  function status() {
    if (loadErr) return { on: on(), ready: false, why: loadErr };
    const C = counts(), rem = Object.entries(S.skip || {});
    return { on: on(), ready: true, complete: !!S.complete, completedAt: S.completedAt || null, firstStart: S.firstStart || null, runs: job.firstRun + ' .. ' + (S.lastRun || '(set at the first start)') + ' ' + String(job.runHourUtc).padStart(2, '0') + ' UTC',
      points: pts.length, sources: job.sources, leads: '0-' + job.leadHours + ' h hourly', variables: job.hourly, files: 'data/retrain/om_archive/<src>/<YYYY-MM-DD>.csv.gz',
      done: C.done, skipped: C.skipped, total: C.total, share: C.total ? Math.round(1000 * (C.done + C.skipped) / C.total) / 10 : null,
      spentToday: spentToday(), spentTotal: S.spentTotal || 0, running: mem.running, lastTick: mem.lastTick, lastStop: mem.lastStop, lastError: mem.lastError,
      skippedSample: rem.slice(0, 5).map(([k, v]) => ({ run: k, why: v })), estimate: estimate(), tier: budget && budget.tierOf ? ((budget.tierOf({ tag: job.tag, kind: 'singleRuns' }) || {}).id || null) : null };
  }
  if (schedule && job && on()) schedule('omArchive', job.tickMinutes * 60e3, () => tick('scheduled').then((r) => { if (r && r.stop) log('om archive: paused (' + r.stop + ')'); }), { firstMs: (Number(job.firstTickMinutes) || job.tickMinutes) * 60e3, label: 'Open-Meteo past-forecast archive for the retrain (one-time, background tier)' });
  return { tick, status, estimate, todo, _state: () => S };
}
