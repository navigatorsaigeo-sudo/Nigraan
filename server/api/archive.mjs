/* ══ v91.17.76 · THE PERMANENT TRAINING ARCHIVE ═══════════════════════════════════════════════════════════════════════
   NIGRAAN keeps learning from its own data only if it keeps its own data. The store prunes national-run records after
   12 runs, the nightly backup keeps 14 days and the fleet module holds only the last poll; this module appends, once per
   Pakistan day (UTC+5), a compact record to data/archive/ that is NEVER deleted (no retention, no pruning; CLEAN_SPACE.bat
   and the nightly backup do not touch it):

     forecast/fc_YYYY-MM.jsonl.gz     the national tehsil forecast NIGRAAN actually served (after the zone basis, the station
                                      calibration and the AI local correction): one row per tehsil for the run whose first
                                      hour is 00:00 PKT, 97 hourly values (v91.17.283.8; 73 before) = Pakistan days 1-4 of that issue, with the issue
                                      time, the run, the basis (zone / model / served height) and the correction code applied
                                      (L0, L0+SC, L0+AI, L0+SC+AI, L0+L2) plus the AI day terms (dTx, dTn) that were served
     fleet/fleet_YYYY-MM.jsonl.gz     every MACH fleet reading of the day with its quality-screen state (usable or the failed
                                      rules), one row per station-day, columns as arrays; the served and raw point forecast of
                                      the fleet's own pairing (station-lake/archive/fleet/fleet_pairs_*.csv) rides along
     imerg/imerg_YYYY-MM.jsonl.gz     satellite daily rain per tehsil, from the files server/api/imerg.mjs already fetched
     river/river_YYYY-MM.jsonl.gz     v91.17.275 · the riverine ensemble per reach by lead (median, 10/90 %, share over the 2- / 5-year flow,
                                      served class), one row a day from data/flood.json (no new call)
     rain/rain_YYYY-MM.jsonl.gz       v91.17.275 · wettest hour and wettest 6 h per tehsil per day by lead, four issues a day (00/06/12/18
                                      PKT national runs), for the flash-flood re-test
     drought/drought_YYYY-MM.jsonl.gz v91.17.275 · each 15-day drought outlook issue (data/drought-outlook.json)
                                      These three roll monthly: moved (never deleted) to _admin\archive\forecast-archive\ after this and
                                      last month + 45 days (the copies rule); the four kinds above them stay permanent.
     manifest.json                    what each day wrote (rows, bytes, issue, time) and the committed length of every file

   Each day is ONE gzip member appended to the month file (a multi-member gzip is one valid stream: Python gzip / pandas,
   Node zlib.gunzip and 7-Zip read it whole). A day is written once (the manifest is the idempotency key). The manifest holds
   the committed byte length of every file, so a crash between the append and the manifest write is repaired by truncating
   the file back to its committed length before the day is written again. All file IO is async (fs/promises, zlib on the
   thread pool); big row sets are serialised in slices with a yield between them.

   Scale (the reader divides): T tenths of a degree C, P tenths of a mm, RH %, W / G km/h (integer), CL %, TD tenths C,
   PH tenths hPa, RR tenths mm/h. station-lake/scripts/archive_read.py reads every kind into pandas.
   NIGRAAN_ARCHIVE=0 switches the archive off; NIGRAAN_WORKER=0 (scratch servers) leaves the timers off (run() still works). */
import { promises as fsp, existsSync, mkdirSync, readFileSync, readdirSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { downscaleFor } from './downscale.mjs';
import { schedule } from './scheduler.mjs';
import { pktDay, hourEndingDay } from './pktday.mjs';

const gzip = promisify(zlib.gzip);
const PKT = 5 * 3600e3;
const pktHour = (ms) => new Date(ms + PKT).getUTCHours();
const dayStartMs = (day) => Date.parse(day + 'T00:00:00Z') - PKT;   /* 00:00 PKT of a Pakistan day, as epoch ms */
const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const yieldNow = () => new Promise(r => setImmediate(r));
const q = (v, s) => (v == null || !Number.isFinite(Number(v))) ? null : Math.round(Number(v) * s);
/* the served hourly fields kept, with their integer scale */
export const FC_FIELDS = { T: ['temperature_2m', 10], RH: ['relative_humidity_2m', 1], P: ['precipitation', 10], W: ['wind_speed_10m', 1], G: ['wind_gusts_10m', 1], CL: ['cloud_cover', 1] };
const KINDS = ['forecast', 'fleet', 'imerg', 'issued', 'river', 'rain', 'drought'];
/* v91.17.275 · ARCH · the three test archives (river, rain, drought) roll monthly: a month file stays in data/archive while its month is
   one of the two its consumers read (this month and the last, as the copies rule's month files) plus 45 days, then it MOVES (never
   deleted) to <D:\NIGRAAN>\_admin\archive\forecast-archive\<kind>\ (MOVED.txt logs it). forecast / fleet / imerg / issued stay permanent. */
export const ROLL_KINDS = ['river', 'rain', 'drought'];
export const ROLL_KEEP_DAYS = 45;
/* the rain archive keeps four issues a Pakistan day: the national run whose first hour falls in each 6-hour slot (00, 06, 12, 18 PKT) */
export const RAIN_SLOTS = [0, 6, 12, 18];
/* a Pakistan day counts as complete with values in at least this many of its hours (the forecast rows' D; past30.mjs uses the same rule for a station's day) */
export const DAY_MIN_HOURS = 20;
const SCHEMA = {
  forecast: 'one row per tehsil per issue day: d (Pakistan day of the first hour), iss (run completed, UTC), base (first hour, UTC), run, u (tehsil uid), lat, lon, el (resolved height m), sel (served height m), z (zone), m (temperature model), c (correction code), v (correction version), bc (1 = corrected), ai {day: [dTx, dTn] served, C}, t0 (first hour), n (hours), T/RH/P/W/G/CL hourly arrays (T, P tenths; RH, CL %; W, G km/h), D [[day, Tmax tenths, Tmin tenths, rain tenths mm, max gust, hours]] per Pakistan day with at least 20 hours',
  fleet: 'one row per MACH station per Pakistan day: d, k (station key), lat, lon, el (the forecast\'s height at the station, m, from the pairing), n (readings), t (minutes after 00:00 PKT of the day; negative for a stale record a silent station still reports), T, TD (tenths C), RH (%), W, G (km/h), PH (tenths hPa), RR (tenths mm/h), ok (1 = passed the five-rule screen), q (failed rules joined by +, "" when usable), mir (mirror-of key where screened as a mirror); fc {h (hour after 00:00 PKT), raw, srv (tenths C, the point forecast before and after correction), lead (h)} from the fleet pairing',
  imerg: 'one row per day: d (UTC day of the product), product, file, n, u {tehsil uid: rain tenths mm}',
  river: 'v91.17.275 · one row per Pakistan day (the riverine ensemble run of data/flood.json, no new call): d, at (run time UTC), members, days (dates, lead 0 = first), n, r {reach id: {q50 [lead], q10 [lead], q90 [lead] (m3/s, model), p2 [lead], p5 [lead] (% of members at or above the model 2- / 5-year flow), c [lead] (the served class word index: 0 Low .. 3 Act, null unclassed), carried (run time when the reach was carried from an older run)}}',
  rain: 'v91.17.275 · one row per issue slot (00, 06, 12, 18 PKT; the national tehsil run whose first hour falls in the slot, as the hazard engine read it): d (Pakistan day of the slot), slot, iss, base (first hour UTC), run, days (Pakistan dates in the run), u {tehsil uid: [[p1, h1, p6, h6, tot, n] per day]}: p1 wettest hour (tenths mm) and its PKT hour, p6 wettest 6 hours (tenths mm, rolling, inside the day) and the PKT hour that window ends, tot day total (tenths mm), n hours held; lead of an hour = its time - base',
  drought: 'v91.17.275 · one row per 15-day drought outlook issue (data/drought-outlook.json, written by station-lake/scripts/drought_outlook.py): d (Pakistan day archived), issued, validTo, built, version, issuePentad, lastObservedPentad, passed, monthGate, n, u {tehsil uid: [spi90Now, spi90Outlook, bandNow, bandOutlook, rainNext15Mm, normalNext15Mm] (spi x100, rain tenths mm)}',
  issued: 'v91.17.101 · what NIGRAAN issued that day, per product (one row each): outlook (id, i, valid, type, unit, v {uid: value}), drought (asOf, source, u {uid: [class, spi30, spi90, spei30, spei90, provisional 0/1]}), glof (u {uid: [class, index]}), river (days[0], r {reach id: [class, share>2yr, share>5yr]}) · scored later against the fleet, IMERG and CHIRPS',
};

export function createArchive(app, root, dataDir, opts = {}) {
  const dir = join(dataDir, 'archive'), stageDir = join(dir, '_stage'), manFile = join(dir, 'manifest.json');
  for (const d of [dir, stageDir, ...KINDS.map(k => join(dir, k))]) mkdirSync(d, { recursive: true });
  const lakeFleet = opts.lakeFleet || join(root, '..', 'station-lake', 'archive', 'fleet');
  const ISSUE_HOUR_PKT = 0;          /* the run whose first hour is 00:00 PKT covers Pakistan days 1-3 whole (73 hours) */
  const FALLBACK_AFTER_PKT = 3;      /* by 03:00 PKT the midnight run is done; if it is missing, the earliest run of the day stands in */
  let M = null;
  try { M = existsSync(manFile) ? JSON.parse(readFileSync(manFile, 'utf8')) : null; } catch (e) { M = null; }
  if (!M || M.version !== 1) M = { version: 1, created: new Date().toISOString(), files: {}, days: { forecast: {}, fleet: {}, imerg: {}, issued: {} }, repairs: [], errors: [] };
  const rollDir = opts.rollDir || join(root, '..', '..', '_admin', 'archive', 'forecast-archive');   /* D:\NIGRAAN\_admin\archive\forecast-archive */
  for (const k of KINDS) M.days[k] = M.days[k] || {};
  const st = { running: false, lastTickAt: null, lastError: null, lastFleetPoll: null, samples: 0, staged: 0 };
  let chain = Promise.resolve();
  const serial = (fn) => { const p = chain.then(() => fn()); chain = p.catch(() => {}); return p; };
  const err = (where, e) => { const m = where + ': ' + (e && e.message || e); st.lastError = m; M.errors.push({ at: new Date().toISOString(), error: m }); M.errors = M.errors.slice(-20); console.error('  archive    ' + m); };

  async function saveManifest() {
    M.updated = new Date().toISOString();
    const t = manFile + '.tmp-' + process.pid;
    await fsp.writeFile(t, JSON.stringify(M, null, 1)); await fsp.rename(t, manFile);
  }
  /* append one gzip member; repair the file to its committed length first */
  async function appendMember(rel, lines) {
    const f = join(dir, rel);
    let text = ''; const parts = [];
    for (let i = 0; i < lines.length; i++) { parts.push(lines[i]); if (parts.length >= 100) { text += parts.join('\n') + '\n'; parts.length = 0; await yieldNow(); } }
    if (parts.length) text += parts.join('\n') + '\n';
    const buf = await gzip(Buffer.from(text, 'utf8'), { level: 9 });
    const fi = M.files[rel] || (M.files[rel] = { bytes: 0, members: 0 });
    let size = 0; try { size = (await fsp.stat(f)).size; } catch (_) { size = 0; }
    if (size > fi.bytes) { await fsp.truncate(f, fi.bytes); M.repairs.push({ at: new Date().toISOString(), file: rel, truncatedFrom: size, to: fi.bytes }); M.repairs = M.repairs.slice(-20); }
    else if (size < fi.bytes) { err('append', rel + ' is ' + size + ' bytes, the manifest says ' + fi.bytes + ' (continuing from the file)'); fi.bytes = size; }
    const fh = await fsp.open(f, 'a');
    try { await fh.write(buf); await fh.sync(); } finally { await fh.close(); }
    fi.bytes += buf.length; fi.members++; fi.updated = new Date().toISOString();
    return { bytes: buf.length, raw: text.length };
  }

  /* ── (a) the served national forecast ── */
  function candidates(day) {
    const s0 = dayStartMs(day), s1 = s0 + 864e5;
    return app.store.all('runs').filter(r => r.unit_level === 'tehsil' && r.status === 'complete' && !r.records_pruned && !r.development_limited && r.base_valid_time
      && Date.parse(r.base_valid_time) >= s0 && Date.parse(r.base_valid_time) < s1)
      .sort((a, b) => Date.parse(a.base_valid_time) - Date.parse(b.base_valid_time) || Date.parse(a.completed_at) - Date.parse(b.completed_at));
  }
  function pickRun(day, nowMs) {
    const c = candidates(day); if (!c.length) return null;
    const best = c[0], h = pktHour(Date.parse(best.base_valid_time));
    if (h === ISSUE_HOUR_PKT) return { run: best, rule: 'the national run whose first hour is 00:00 PKT' };
    const today = pktDay(nowMs);
    if (day < today || pktHour(nowMs) >= FALLBACK_AFTER_PKT) return { run: best, rule: 'no 00:00 PKT run held; the earliest run of the day (first hour ' + String(h).padStart(2, '0') + ':00 PKT)' };
    return null;
  }
  /* v91.17.283.8 · planned C · the record's served hours 0-72 plus its archExt (the served hours to 96 h, national.mjs), so day 3 of an issue
     is archived as served and can be verified; a record without archExt archives its 73 hours as before */
  const withExt = (r) => { const H = r.hourly || {}, X = r.archExt; if (!X || !Array.isArray(X.time) || !X.time.length || !Array.isArray(H.time)) return H;
    const last = Date.parse(String(H.time[H.time.length - 1]).replace(/Z?$/, 'Z')), o = { ...H, time: H.time.slice() };
    const keep = X.time.map((t) => Date.parse(String(t).replace(/Z?$/, 'Z')) > last);
    for (const k of Object.keys(H)) if (k !== 'time' && Array.isArray(H[k])) o[k] = H[k].concat(Array.isArray(X[k]) ? X[k].filter((_, i) => keep[i]) : X.time.filter((_, i) => keep[i]).map(() => null));
    o.time = o.time.concat(X.time.filter((_, i) => keep[i])); return o; };
  function fcRow(r, meta) {
    const H = withExt(r), time = H.time || [], b = r.temperatureBasis || {};
    const row = { d: meta.day, iss: meta.issue, base: meta.base, run: meta.runId, u: r.unitKey, lat: r.lat, lon: r.lon, el: r.resolvedElevationM ?? null, sel: b.elevM ?? null,
      z: b.zone || null, m: b.model || null, c: b.correction || (r.biasCorrected ? 'corrected' : 'L0'), v: b.version || null, bc: r.biasCorrected ? 1 : 0, t0: time[0] || null, n: time.length };
    for (const [k, [src, s]] of Object.entries(FC_FIELDS)) if (Array.isArray(H[src]) && H[src].length) row[k] = H[src].map(v => q(v, s));
    /* per Pakistan day with >= 20 hours: max / min temperature, rain total, max gust */
    const byDay = new Map();
    time.forEach((t, i) => { const d = pktDay(Date.parse(t)); (byDay.get(d) || byDay.set(d, []).get(d)).push(i); });
    row.D = [];
    for (const [d, ix] of byDay) {
      const T = ix.map(i => H.temperature_2m && H.temperature_2m[i]).filter(v => v != null); if (T.length < DAY_MIN_HOURS) continue;
      const P = ix.map(i => H.precipitation && H.precipitation[i]).filter(v => v != null), G = ix.map(i => H.wind_gusts_10m && H.wind_gusts_10m[i]).filter(v => v != null);
      row.D.push([d, q(Math.max(...T), 10), q(Math.min(...T), 10), P.length ? q(P.reduce((a, x) => a + x, 0), 10) : null, G.length ? q(Math.max(...G), 1) : null, T.length]);
    }
    /* the AI local correction terms this point took, by Pakistan day */
    if (/AI/.test(row.c)) {
      try { const D = downscaleFor(app); if (D && D.servedTerm) { const ai = {}; for (const [d] of byDay) { const v = D.servedTerm(r.lat, r.lon, d); if (v) ai[d] = [v.dTx, v.dTn]; } if (Object.keys(ai).length) row.ai = ai; } } catch (_) {}
    }
    return row;
  }
  async function archiveForecast({ day = null, issueAt = null, runId = null, force = false, nowMs = Date.now() } = {}) {
    const out = [];
    const days = day ? [day] : [addDays(pktDay(nowMs), -1), pktDay(nowMs)];
    for (const d of days) {
      if (M.days.forecast[d] && !force) { out.push({ day: d, skipped: 'already archived' }); continue; }
      let pick = null;
      if (runId) { const r = app.store.find('runs', x => x.run_id === runId); if (r && !r.records_pruned) pick = { run: r, rule: 'run named by the operator' + (issueAt ? ' (simulated issue ' + issueAt + ')' : '') }; }
      else pick = pickRun(d, nowMs);
      if (!pick) { out.push({ day: d, waiting: 'no complete national tehsil run for this Pakistan day yet' }); continue; }
      const recs = app.store.filter('records', x => x.runId === pick.run.run_id);
      if (!recs.length) { out.push({ day: d, waiting: 'the run\'s records are pruned' }); continue; }
      const meta = { day: d, issue: issueAt || pick.run.completed_at, base: issueAt ? new Date(dayStartMs(d)).toISOString() : pick.run.base_valid_time, runId: pick.run.run_id };
      const lines = [];
      for (let i = 0; i < recs.length; i++) { lines.push(JSON.stringify(fcRow(recs[i], meta))); if (i % 50 === 49) await yieldNow(); }
      const rel = 'forecast/fc_' + d.slice(0, 7) + '.jsonl.gz';
      const w = await appendMember(rel, lines);
      const codes = {}; for (const r of recs) { const c = (r.temperatureBasis && r.temperatureBasis.correction) || 'L0'; codes[c] = (codes[c] || 0) + 1; }
      M.days.forecast[d] = { file: rel, rows: lines.length, bytes: w.bytes, rawBytes: w.raw, issue: meta.issue, base: meta.base, run: meta.runId, rule: pick.rule, corrections: codes, cloud: recs.some(r => r.hourly && Array.isArray(r.hourly.cloud_cover) && r.hourly.cloud_cover.length) ? 'kept' : 'not in the run records', at: new Date().toISOString(), simulated: !!issueAt || undefined };
      await saveManifest();
      out.push({ day: d, rows: lines.length, bytes: w.bytes });
    }
    return out;
  }

  /* ── (b) MACH fleet readings with their screen state: staged per poll, sealed per Pakistan day ── */
  async function sampleFleet(latest = null) {
    const L = latest || (app.fleet && app.fleet.latest ? app.fleet.latest() : null);
    if (!L || !L.at || !Array.isArray(L.rows) || !L.rows.length) return 0;
    if (L.at === st.lastFleetPoll) return 0;
    st.lastFleetPoll = L.at;
    const at = Date.parse(L.at); const byDay = new Map();
    for (const r of L.rows) {
      if (!r || !r.key) continue;
      const obs = r.ageMin == null ? null : Math.round((at - r.ageMin * 60e3) / 60e3) * 60e3;
      const d = pktDay(at);   /* the poll's Pakistan day: a silent station's stale record is filed on the day it was seen, once */
      const line = JSON.stringify([r.key, obs == null ? null : new Date(obs).toISOString().slice(0, 16), L.at.slice(0, 16), r.lat ?? null, r.lon ?? null, r.tempC ?? null, r.rhPct ?? null, r.dewC ?? null, r.windKmh ?? null, r.gustKmh ?? null, r.pressureHpa ?? null, r.precipRateMm ?? null, r.usable ? 1 : 0, (r.qc || []).join('+'), r.mirrorOf || null]);
      (byDay.get(d) || byDay.set(d, []).get(d)).push(line);
    }
    let n = 0;
    for (const [d, lines] of byDay) { if (M.days.fleet[d]) continue; await fsp.appendFile(join(stageDir, 'fleet_' + d + '.jsonl'), lines.join('\n') + '\n'); n += lines.length; }
    st.samples++; st.staged += n; st.lastSampleAt = new Date().toISOString();
    return n;
  }
  async function pairsFor(day) {
    /* the fleet's own point pairs (served and raw forecast at the reading hour); files are named by the month they were written */
    const out = new Map(); const s0 = dayStartMs(day), s1 = s0 + 864e5;
    const months = [...new Set([day.slice(0, 7), addDays(day, 1).slice(0, 7), addDays(day, -1).slice(0, 7)])];
    for (const mo of months) {
      const f = join(lakeFleet, 'fleet_pairs_' + mo + '.csv'); if (!existsSync(f)) continue;
      const rl = createInterface({ input: createReadStream(f), crlfDelay: Infinity }); let head = null;
      for await (const line of rl) {
        if (!head) { head = line.split(','); continue; }
        const c = line.split(','); const o = Object.fromEntries(head.map((h, i) => [h, c[i]]));
        const hm = Date.parse(o.hour_utc); if (!(hm >= s0 && hm < s1)) continue;
        const a = out.get(o.key) || out.set(o.key, new Map()).get(o.key);
        if (o.model_elev_m !== '' && o.model_elev_m != null && Number.isFinite(Number(o.model_elev_m))) a.el = Number(o.model_elev_m);
        const hIdx = Math.round((hm - s0) / 3600e3), lead = Number(o.lead_h);
        const prev = a.get(hIdx); if (prev && prev[2] <= lead) continue;   /* keep the shortest lead for the hour */
        a.set(hIdx, [q(o.fc_raw_c === '' ? null : o.fc_raw_c, 10), q(o.fc_served_c === '' ? null : o.fc_served_c, 10), lead]);
      }
    }
    return out;
  }
  async function sealFleet({ day = null, nowMs = Date.now() } = {}) {
    const today = pktDay(nowMs); const out = [];
    let files = []; try { files = (await fsp.readdir(stageDir)).filter(f => /^fleet_\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort(); } catch (_) { files = []; }
    for (const f of files) {
      const d = f.slice(6, 16);
      if (day ? d !== day : d >= today) continue;
      if (M.days.fleet[d]) { await fsp.rm(join(stageDir, f), { force: true }); out.push({ day: d, skipped: 'already archived; stage removed' }); continue; }
      const text = await fsp.readFile(join(stageDir, f), 'utf8');
      const rows = []; for (const ln of text.split('\n')) { if (!ln) continue; try { rows.push(JSON.parse(ln)); } catch (_) {} }
      const s0 = dayStartMs(d); const byKey = new Map();
      for (const r of rows) (byKey.get(r[0]) || byKey.set(r[0], []).get(r[0])).push(r);
      const P = await pairsFor(d); const lines = []; let readings = 0;
      for (const [k, rs] of [...byKey.entries()].sort()) {
        rs.sort((a, b) => String(a[1] || a[2]).localeCompare(String(b[1] || b[2])));
        const keep = [];
        for (const r of rs) {   /* a silent station repeats its last record every poll: one reading per record */
          const p = keep[keep.length - 1];
          if (p && p[1] && r[1] && Math.abs(Date.parse(r[1] + 'Z') - Date.parse(p[1] + 'Z')) <= 90e3 && JSON.stringify(p.slice(5, 12)) === JSON.stringify(r.slice(5, 12))) continue;
          keep.push(r);
        }
        const last = keep[keep.length - 1];
        const row = { d, k, lat: last[3], lon: last[4], n: keep.length, t: keep.map(r => Math.round((Date.parse((r[1] || r[2]) + 'Z') - s0) / 60e3)),
          T: keep.map(r => q(r[5], 10)), RH: keep.map(r => q(r[6], 1)), TD: keep.map(r => q(r[7], 10)), W: keep.map(r => q(r[8], 1)), G: keep.map(r => q(r[9], 1)),
          PH: keep.map(r => q(r[10], 10)), RR: keep.map(r => q(r[11], 10)), ok: keep.map(r => r[12]), q: keep.map(r => r[13] || '') };
        if (keep.some(r => r[14])) row.mir = keep.map(r => r[14] || null);
        const pk = P.get(k); if (pk && pk.size) { const hs = [...pk.keys()].sort((a, b) => a - b); row.fc = { h: hs, raw: hs.map(h => pk.get(h)[0]), srv: hs.map(h => pk.get(h)[1]), lead: hs.map(h => pk.get(h)[2]) }; if (pk.el != null) row.el = pk.el; }
        readings += keep.length; lines.push(JSON.stringify(row));
      }
      if (!lines.length) { await fsp.rm(join(stageDir, f), { force: true }); continue; }
      const rel = 'fleet/fleet_' + d.slice(0, 7) + '.jsonl.gz';
      const w = await appendMember(rel, lines);
      M.days.fleet[d] = { file: rel, rows: lines.length, readings, usable: rows.filter(r => r[12]).length, staged: rows.length, pairedStations: [...P.keys()].length, bytes: w.bytes, rawBytes: w.raw, at: new Date().toISOString() };
      await saveManifest();
      await fsp.rm(join(stageDir, f), { force: true });
      out.push({ day: d, rows: lines.length, readings, bytes: w.bytes });
    }
    return out;
  }

  /* ── (c) satellite daily rain per tehsil (already fetched by imerg.mjs into data/imerg/) ── */
  async function archiveImerg({ day = null } = {}) {
    const src = join(dataDir, 'imerg'); const out = [];
    let files = []; try { files = (await fsp.readdir(src)).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort(); } catch (_) { return out; }
    for (const f of files) {
      const d = f.slice(0, 10); if (day && d !== day) continue; if (M.days.imerg[d]) continue;
      let J; try { J = JSON.parse(await fsp.readFile(join(src, f), 'utf8')); } catch (e) { err('imerg ' + d, e); continue; }
      const u = {}; for (const [k, v] of Object.entries(J.units || {})) u[k] = q(v, 10);
      const rel = 'imerg/imerg_' + d.slice(0, 7) + '.jsonl.gz';
      const w = await appendMember(rel, [JSON.stringify({ d, product: J.product || null, file: J.file || null, n: Object.keys(u).length, u })]);
      M.days.imerg[d] = { file: rel, rows: 1, tehsils: Object.keys(u).length, bytes: w.bytes, rawBytes: w.raw, at: new Date().toISOString() };
      await saveManifest();
      out.push({ day: d, tehsils: Object.keys(u).length, bytes: w.bytes });
    }
    return out;
  }

  /* ── (d) v91.17.101 · the issued products of the Pakistan day: the outlook chances, the drought classes, the GLOF levels and the
        river classes, exactly as served, once per day after 06:00 PKT (the morning runs are in). Without this record no issued
        chance can ever be verified. */
  const OUTLOOK_IDS = [['rc:1', [0, 1, 2]], ['rc:10', [0, 1, 2]], ['rc:25', [0, 1, 2]], ['ev:heatSpell', [0]], ['ev:coldSpell', [0]], ['ev:rain3_75', [0]], ['ev:rain3Local', [0]], ['ev:heavySnow', [0]], ['ev:rainOnSnow', [0]],
    ['ev:frostSpell', [0]], ['day:tx40', [0, 1, 2]], ['day:pr10', [0, 1, 2]], ['day:pr25', [0, 1, 2]], ['day:pr50', [0, 1, 2]], ['day:sn10', [0, 1, 2]],
    ['day:tn0', [0, 1, 2]], ['day:gu60', [0, 1, 2]], ['air:pm25', [0, 1]], ['air:dust', [0, 1]], ['week:t', [0, 1]], ['week:p', [0, 1]], ['month:t', [0]], ['month:p', [0]]];
  async function archiveIssued({ nowMs = Date.now(), force = false } = {}) {
    const d = pktDay(nowMs), hour = new Date(nowMs + 5 * 3600e3).getUTCHours();
    if (!force && (M.days.issued[d] || hour < 6)) return { skipped: M.days.issued[d] ? 'done' : 'before 06:00 PKT', day: d };
    const lines = [], got = {};
    const gateV = (app.gate && app.gate.version && app.gate.version()) || null;   /* v91.17.103 · each issued row carries the gate in force (rule ledger: history is never rewritten) */
    const push = (o) => { lines.push(JSON.stringify({ d, gate: gateV, ...o })); got[o.kind] = (got[o.kind] || 0) + 1; };
    if (app.mapLayers && app.mapLayers.layer) for (const [id, idx] of OUTLOOK_IDS) for (const i of idx) {
      try { const L = app.mapLayers.layer(id, i); if (!L || !L.ready || !L.values) continue;
        const v = {}; for (const [k, x] of Object.entries(L.values)) if (x != null && Number.isFinite(Number(x))) v[k] = Math.round(Number(x) * 10) / 10;
        push({ kind: 'outlook', id, i, valid: L.valid || null, type: L.type || null, unit: L.unit || null, n: Object.keys(v).length, v }); } catch (e) { err('issued ' + id, e); }
      await yieldNow(); }
    try { const D = app.climatology && app.climatology.droughtNational && app.climatology.droughtNational();
      if (D && D.ready && D.spi) { const u = {}; const f = (x) => x && x.value != null ? x.value : null;
        for (const [k, r] of Object.entries(D.spi)) u[k] = [r.drought ? r.drought.class || null : null, f(r.spi30), f(r.spi90), f(r.spei30), f(r.spei90), r.drought && r.drought.provisional ? 1 : 0];
        push({ kind: 'drought', asOf: D.asOf || null, source: D.rainSource ? D.rainSource.name : null, u }); } } catch (e) { err('issued drought', e); }
    try { const G = app.glof && app.glof.national && app.glof.national(false);
      if (G && G.ok && G.units) { const u = {}; for (const [k, r] of Object.entries(G.units)) if (r && r.applicable) u[k] = [r.class || null, r.index != null ? r.index : null];
        push({ kind: 'glof', builtAt: G.builtAt || null, u }); } } catch (e) { err('issued glof', e); }
    try { const R = app.flood && app.flood.national && app.flood.national(0);
      if (R && R.ready && Array.isArray(R.rows)) { const r = {}; for (const x of R.rows) r[x.id] = [x.class || null, x.shareAbove2yr != null ? x.shareAbove2yr : null, x.shareAbove5yr != null ? x.shareAbove5yr : null];
        push({ kind: 'river', date: R.date || null, at: R.at || null, r }); } } catch (e) { err('issued river', e); }
    if (!lines.length) return { skipped: 'nothing ready', day: d };
    const rel = 'issued/issued_' + d.slice(0, 7) + '.jsonl.gz';
    const w = await appendMember(rel, lines);
    M.days.issued[d] = { file: rel, rows: lines.length, products: got, bytes: w.bytes, rawBytes: w.raw, at: new Date().toISOString() };
    await saveManifest();
    return { day: d, rows: lines.length, products: got, bytes: w.bytes };
  }

  const seenMt = { river: null, drought: null };   /* the two source files are parsed only when they change (light tick) */
  /* ── (e) v91.17.275 · ARCH · river reach ensemble by lead, from data/flood.json (the riverine job's own file; no new call) ── */
  async function archiveRiver({ nowMs = Date.now() } = {}) {
    const f = join(dataDir, 'flood.json'); if (!existsSync(f)) return { skipped: 'no data/flood.json yet' };
    const mt = (await fsp.stat(f)).mtimeMs; if (seenMt.river === mt) return { skipped: 'data/flood.json unchanged since the last look' }; seenMt.river = mt;
    let S; try { S = JSON.parse(await fsp.readFile(f, 'utf8')); } catch (e) { err('river read', e); return { error: e.message }; }
    const F = S && S.forecast; if (!F || !F.at || !F.points || !Array.isArray(F.days) || !F.days.length) return { skipped: 'no riverine forecast in data/flood.json' };
    const d = pktDay(Date.parse(F.at));
    if (M.days.river[d]) return { skipped: M.days.river[d].run === F.at ? 'already archived' : 'one run a day: ' + d + ' holds the run of ' + M.days.river[d].run, day: d };
    const LV = { Low: 0, Monitor: 1, Watch: 2, Act: 3 }; const r = {};
    for (const [id, P] of Object.entries(F.points).sort()) {
      const byDate = new Map((P.days || []).map((x) => [x.date, x]));
      const col = (fn) => F.days.map((date) => { const x = byDate.get(date); return x ? fn(x) : null; });
      let cls = null;
      try { const V = app.flood && app.flood.point ? app.flood.point(id) : null; if (V && Array.isArray(V.days)) { const m = new Map(V.days.map((x) => [x.date, x])); cls = F.days.map((date) => { const x = m.get(date); return x && x.class != null && LV[x.class] != null ? LV[x.class] : null; }); } } catch (_) { cls = null; }
      r[id] = { q50: col((x) => x.q ? x.q[1] : null), q10: col((x) => x.q ? x.q[0] : null), q90: col((x) => x.q ? x.q[2] : null),
        p2: col((x) => x.p && x.p.rp2 != null ? x.p.rp2 : null), p5: col((x) => x.p && x.p.rp5 != null ? x.p.rp5 : null), c: cls, ...(P.carriedFrom ? { carried: P.carriedFrom } : {}) };
    }
    const rel = 'river/river_' + d.slice(0, 7) + '.jsonl.gz';
    const w = await appendMember(rel, [JSON.stringify({ d, at: F.at, members: F.members || null, days: F.days, n: Object.keys(r).length, r })]);
    M.days.river[d] = { file: rel, rows: 1, reaches: Object.keys(r).length, leads: F.days.length, run: F.at, bytes: w.bytes, rawBytes: w.raw, at: new Date(nowMs).toISOString() };
    await saveManifest();
    return { day: d, reaches: Object.keys(r).length, leads: F.days.length, bytes: w.bytes };
  }

  /* ── (f) v91.17.275 · ARCH · hourly peak and 6-hour rain per tehsil by lead, four issues a day (the flash-flood re-test needs leads) ── */
  function rainSummary(rec) {
    const H = rec.hourly || {}, time = H.time || [], P = H.precipitation || [];
    const byDay = new Map();
    /* v91.17.283.28 · S2 · an hour-ending amount belongs to the PKT day of its interval (pktday.mjs hourEndingDay: hours ending 01-24); its
       hour is the interval's END hour 1..24 of that day */
    /* the first stamp is the run start: its value is the hour BEFORE the issue (not forecast by it), so it is left out; otherwise it would open
       a one-hour day 0 and shift every lead day of the issue */
    time.forEach((t, i) => { if (i === 0) return; const ms = Date.parse(t.length <= 16 ? t + 'Z' : t); const d = hourEndingDay(ms); (byDay.get(d) || byDay.set(d, []).get(d)).push([pktHour(ms - 3600e3) + 1, P[i]]); });
    const days = [...byDay.keys()].sort(), out = [];
    for (const d of days) {
      const hs = byDay.get(d).filter((x) => x[1] != null && Number.isFinite(Number(x[1])));
      if (!hs.length) { out.push(null); continue; }
      let p1 = -1, h1 = null, p6 = -1, h6 = null, tot = 0; const byH = new Map(hs.map((x) => [x[0], Number(x[1])]));
      for (const [h, v] of hs) { tot += v; if (v > p1) { p1 = v; h1 = h; } }
      for (const [h] of hs) { let s6 = 0, k = 0; for (let j = h - 5; j <= h; j++) if (byH.has(j)) { s6 += byH.get(j); k++; } if (k && s6 > p6) { p6 = s6; h6 = h; } }
      out.push([q(p1, 10), h1, q(p6, 10), h6, q(tot, 10), hs.length]);
    }
    return { days, out };
  }
  async function archiveRain({ nowMs = Date.now() } = {}) {
    const res = []; const today = pktDay(nowMs);
    for (const d of [addDays(today, -1), today]) {
      const rec = M.days.rain[d] || null;
      for (const sh of RAIN_SLOTS) {
        const slot = String(sh).padStart(2, '0');
        if (rec && rec.slots && rec.slots[slot]) continue;
        const s0 = dayStartMs(d) + sh * 3600e3, s1 = s0 + 6 * 3600e3;
        if (nowMs < s0) continue;
        const c = app.store.all('runs').filter((r) => r.unit_level === 'tehsil' && r.status === 'complete' && !r.records_pruned && !r.development_limited && r.base_valid_time
          && Date.parse(r.base_valid_time) >= s0 && Date.parse(r.base_valid_time) < s1)
          .sort((a, b) => Date.parse(a.base_valid_time) - Date.parse(b.base_valid_time) || Date.parse(a.completed_at) - Date.parse(b.completed_at));
        if (!c.length) continue;
        const run = c[0]; const recs = app.store.filter('records', (x) => x.runId === run.run_id); if (!recs.length) continue;
        const u = {}; let days = null;
        for (let i = 0; i < recs.length; i++) { const s = rainSummary(recs[i]); if (!days || s.days.length > days.length) days = s.days; u[recs[i].unitKey] = s.out; if (i % 50 === 49) await yieldNow(); }
        /* align every tehsil to the run's day list */
        for (const k of Object.keys(u)) if (u[k].length !== days.length) u[k] = days.map((dd, j) => u[k][j] === undefined ? null : u[k][j]);
        const rel = 'rain/rain_' + d.slice(0, 7) + '.jsonl.gz';
        const w = await appendMember(rel, [JSON.stringify({ d, slot, iss: run.completed_at || null, base: run.base_valid_time, run: run.run_id, days, n: Object.keys(u).length, u })]);
        const R = M.days.rain[d] || (M.days.rain[d] = { file: rel, rows: 0, bytes: 0, rawBytes: 0, slots: {} });
        R.rows++; R.bytes += w.bytes; R.rawBytes += w.raw; R.slots[slot] = { run: run.run_id, base: run.base_valid_time, tehsils: Object.keys(u).length, bytes: w.bytes, at: new Date(nowMs).toISOString() }; R.at = new Date(nowMs).toISOString();
        await saveManifest();
        res.push({ day: d, slot, tehsils: Object.keys(u).length, bytes: w.bytes });
      }
    }
    return res;
  }

  /* ── (g) v91.17.275 · ARCH · each 15-day drought outlook issue (data/drought-outlook.json), whether or not it passed its test ── */
  async function archiveDrought({ nowMs = Date.now() } = {}) {
    const f = join(dataDir, 'drought-outlook.json'); if (!existsSync(f)) return { skipped: 'no data/drought-outlook.json' };
    const mt = (await fsp.stat(f)).mtimeMs; if (seenMt.drought === mt) return { skipped: 'data/drought-outlook.json unchanged since the last look' }; seenMt.drought = mt;
    let O; try { O = JSON.parse(await fsp.readFile(f, 'utf8')); } catch (e) { err('drought read', e); return { error: e.message }; }
    if (!O || !O.units || !O.issued) return { skipped: 'outlook file without units or issue date' };
    const key = O.issued + '|' + (O.built || '');
    const seen = Object.values(M.days.drought).some((x) => (x.keys || [x.key]).includes(key));
    if (seen) return { skipped: 'issue ' + O.issued + ' already archived' };
    const sc = (v, s) => v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * s);
    const u = {}; for (const [k, x] of Object.entries(O.units)) u[k] = [sc(x.spi90Now, 100), sc(x.spi90Outlook, 100), x.bandNow ?? null, x.bandOutlook ?? null, sc(x.rainNext15Mm, 10), sc(x.normalNext15Mm, 10)];
    const d = pktDay(nowMs);
    const rel = 'drought/drought_' + d.slice(0, 7) + '.jsonl.gz';
    const w = await appendMember(rel, [JSON.stringify({ d, issued: O.issued, validTo: O.validTo || null, built: O.built || null, version: O.version || null, issuePentad: O.issuePentad || null,
      lastObservedPentad: O.lastObservedPentad || null, passed: !!O.passed, monthGate: O.monthGate || null, n: Object.keys(u).length, u })]);
    const R = M.days.drought[d] || (M.days.drought[d] = { file: rel, rows: 0, bytes: 0, rawBytes: 0, keys: [] });
    R.rows++; R.bytes += w.bytes; R.rawBytes += w.raw; R.keys.push(key); R.issued = O.issued; R.at = new Date(nowMs).toISOString();
    await saveManifest();
    return { day: d, issued: O.issued, tehsils: Object.keys(u).length, bytes: w.bytes };
  }

  /* ── (h) v91.17.275 · ARCH · monthly roll of the three test archives (move, never delete) ── */
  async function rollOld({ nowMs = Date.now() } = {}) {
    const mo = pktDay(nowMs).slice(0, 7);
    if (M.roll && M.roll.lastMonth === mo) return { skipped: 'rolled this month' };
    /* a month file is due when its month is older than last month and its month ended more than ROLL_KEEP_DAYS ago */
    const prevMo = addDays(mo + '-01', -1).slice(0, 7); const moved = [];
    for (const k of ROLL_KINDS) {
      let files = []; try { files = (await fsp.readdir(join(dir, k))).filter((x) => new RegExp('^' + k + '_\\d{4}-\\d{2}\\.jsonl\\.gz$').test(x)).sort(); } catch (_) { files = []; }
      for (const fn of files) {
        const fm = fn.slice(k.length + 1, k.length + 8); if (fm >= prevMo) continue;
        const end = Date.parse(addDays(fm + '-01', 32).slice(0, 7) + '-01T00:00:00Z');
        if (nowMs - end < ROLL_KEEP_DAYS * 864e5) continue;
        const src = join(dir, k, fn), dstDir = join(rollDir, k), dst = join(dstDir, fn);
        await fsp.mkdir(dstDir, { recursive: true });
        if (existsSync(dst)) { err('roll', dst + ' exists; ' + src + ' kept'); continue; }
        try { await fsp.rename(src, dst); }
        catch (_) { await fsp.copyFile(src, dst); const a = (await fsp.stat(src)).size, b = (await fsp.stat(dst)).size; if (a !== b) { err('roll', 'copy of ' + fn + ' incomplete; kept'); continue; } await fsp.unlink(src); }
        const rel = k + '/' + fn; if (M.files[rel]) { M.files[rel].movedTo = dst; M.files[rel].movedAt = new Date(nowMs).toISOString(); }
        await fsp.appendFile(join(rollDir, 'MOVED.txt'), new Date(nowMs).toISOString() + '\t' + rel + '\t-> ' + dst + '\t(moved, nothing deleted)\n');
        moved.push(rel);
      }
    }
    M.roll = { lastMonth: mo, at: new Date(nowMs).toISOString(), moved, to: rollDir, rule: 'month files kept while their month is this or last month, plus ' + ROLL_KEEP_DAYS + ' days; then moved (never deleted)' };
    await saveManifest();
    return M.roll;
  }

  function tick(o = {}) {
    return serial(async () => {
      st.running = true; const res = {};
      try {
        try { res.forecast = await archiveForecast(o.forecast || {}); } catch (e) { err('forecast', e); res.forecast = { error: e.message }; }
        try { res.fleet = await sealFleet(o.fleet || {}); } catch (e) { err('fleet', e); res.fleet = { error: e.message }; }
        try { res.imerg = await archiveImerg(o.imerg || {}); } catch (e) { err('imerg', e); res.imerg = { error: e.message }; }
        try { res.issued = await archiveIssued(o.issued || {}); } catch (e) { err('issued', e); res.issued = { error: e.message }; }
        try { res.river = await archiveRiver(o.river || {}); } catch (e) { err('river', e); res.river = { error: e.message }; }
        try { res.rain = await archiveRain(o.rain || {}); } catch (e) { err('rain', e); res.rain = { error: e.message }; }
        try { res.drought = await archiveDrought(o.drought || {}); } catch (e) { err('drought', e); res.drought = { error: e.message }; }
        try { res.roll = await rollOld(o.roll || {}); } catch (e) { err('roll', e); res.roll = { error: e.message }; }
        st.lastTickAt = new Date().toISOString();
      } finally { st.running = false; }
      return res;
    });
  }
  /* operator / test entry: { day, issueAt, runId, force } archives that forecast day; { fleetRows: fleet.latest()-shaped } stages
     a poll; { seal: day } seals that fleet day; with nothing, the normal tick */
  async function run(body = {}) {
    const res = {};
    if (body.fleetRows) res.staged = await serial(() => sampleFleet(body.fleetRows));
    if (body.day || body.runId) res.forecast = await serial(() => archiveForecast({ day: body.day, issueAt: body.issueAt || null, runId: body.runId || null, force: !!body.force }));
    if (body.seal) res.fleet = await serial(() => sealFleet({ day: body.seal }));
    if (body.imerg) res.imerg = await serial(() => archiveImerg({}));
    if (body.issued) res.issued = await serial(() => archiveIssued({ force: !!body.force }));
    if (body.river) res.river = await serial(() => archiveRiver({}));
    if (body.rain) res.rain = await serial(() => archiveRain({ nowMs: body.nowMs || Date.now() }));
    if (body.drought) res.drought = await serial(() => archiveDrought({}));
    if (body.roll) res.roll = await serial(() => rollOld({ nowMs: body.nowMs || Date.now() }));
    if (!Object.keys(res).length) Object.assign(res, await tick());
    return { ...res, status: status() };
  }

  function status() {
    const kinds = {}; let bytes = 0, last = null;
    for (const k of KINDS) {
      const D = M.days[k] || {}, days = Object.keys(D).sort();
      const b = days.reduce((a, d) => a + (D[d].bytes || 0), 0); bytes += b;
      const recent = days.slice(-14).map(d => D[d].bytes || 0).sort((x, y) => x - y);
      const perDay = recent.length ? recent[Math.floor(recent.length / 2)] : null;
      const lw = days.map(d => D[d].at).filter(Boolean).sort().pop() || null; if (lw && (!last || lw > last)) last = lw;
      kinds[k] = { days: days.length, first: days[0] || null, last: days[days.length - 1] || null, bytes: b, medianBytesPerDay: perDay, lastWrite: lw,
        ...(k === 'forecast' && days.length ? { lastIssue: D[days[days.length - 1]].issue, lastCorrections: D[days[days.length - 1]].corrections, cloud: D[days[days.length - 1]].cloud } : {}),
        ...(k === 'fleet' && days.length ? { lastReadings: D[days[days.length - 1]].readings, lastStations: D[days[days.length - 1]].rows } : {}) };
    }
    const perDayAll = KINDS.reduce((a, k) => a + (kinds[k].medianBytesPerDay || 0), 0);
    let stagedFiles = 0; try { stagedFiles = readdirSync(stageDir).length; } catch (_) { stagedFiles = 0; }
    return { dir: 'data/archive', retention: 'permanent (never pruned)', rollRetention: { kinds: ROLL_KINDS, keepDays: ROLL_KEEP_DAYS, rule: 'v91.17.275: ' + ROLL_KINDS.join(', ') + ' month files move (never deleted) to _admin/archive/forecast-archive after this and last month + ' + ROLL_KEEP_DAYS + ' days; forecast, fleet, imerg, issued stay permanent', last: M.roll || null }, kinds, bytes, mb: Math.round(bytes / 1e5) / 10, lastWrite: last,
      projection: { bytesPerDay: perDayAll, mbPerYear: Math.round(perDayAll * 365 / 1e5) / 10, basis: 'median of the last 14 days written per kind x 365' },
      running: st.running, lastTickAt: st.lastTickAt, lastError: st.lastError, fleetSamples: st.samples, lastFleetPoll: st.lastFleetPoll, stagedFiles,
      repairs: (M.repairs || []).slice(-5), errors: (M.errors || []).slice(-5), schema: SCHEMA, reader: 'station-lake/scripts/archive_read.py',
      timers: timersOn };
  }

  const timersOn = opts.timers !== false && process.env.NIGRAAN_WORKER !== '0' && process.env.NIGRAAN_ARCHIVE !== '0';
  if (timersOn) {
    /* the fleet polls every 10 min: sampling at 5 min sees every poll once (the poll time is the de-duplication key) */
    schedule(app, 'archive-fleet', 5 * 60e3, () => serial(() => sampleFleet()).catch(e => err('fleet sample', e)), { label: 'archive: fleet sample' });
    schedule(app, 'archive', 10 * 60e3, () => tick().catch(e => err('tick', e)), { firstMs: 180e3, label: 'archive: daily files' });
  }
  return { tick, run, status, archiveRiver: (o) => serial(() => archiveRiver(o)), archiveRain: (o) => serial(() => archiveRain(o)), archiveDrought: (o) => serial(() => archiveDrought(o)), rollOld: (o) => serial(() => rollOld(o)), sampleFleet: (L) => serial(() => sampleFleet(L)), sealFleet: (o) => serial(() => sealFleet(o)), archiveForecast: (o) => serial(() => archiveForecast(o)), archiveImerg: (o) => serial(() => archiveImerg(o)), archiveIssued: (o) => serial(() => archiveIssued(o)), dir };
}
