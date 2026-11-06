/* ══ v91.17.266 · THE PAST 30 DAYS AT A PLACE (interface 1 of build v266) ══════════════════════════════════════════════════════
   GET /api/report/past30?lat=&lon=[&days=30]  →  what happened at a point over the last complete Pakistan days, from records this
   server already holds; nothing is fetched and nothing is modelled here.

     daily     one row per Pakistan day of the window (yesterday back):
               tmaxC / tminC  the day's highest and lowest screened reading of the nearest CHECKED MACH station within the fleet's own
                              neighbour rule (screen radius_km and dz_m of data/mach-siting.json, the rule fleet.nearest() serves);
                              a station day counts only with readings in at least DAY_MIN_HOURS of its hours (archive.mjs, the same
                              completeness rule as the archived forecast days). Source (v91.17.267): the full MACH observation
                              record the server keeps (station-lake/archive/fleet/db/mach_db_YYYY-MM.csv, every reading the
                              database holds, as fleet.mjs reads it for its backfill: source 'qm' rows and Apple-provider rows left out,
                              each reading through the history screen fleet.histQc, a reading two stations carry identically in the
                              same hour left out); a station day the record does not hold complete falls back to the live fleet
                              archive (data/archive/fleet, the sealed day rows of the 10-minute poll)
               rainMm         the satellite day total over the tehsil holding the point: the Pakistan-day file (data/imerg/pkt, 48
                              half-hour slots) where it exists, else the product day (data/imerg/YYYY-MM-DD.json, data/archive/imerg;
                              a UTC day, 5 h off the Pakistan day, said in the notes)
     summary   extremes and totals of daily; tmeanAnomC = mean of (tmax + tmin) / 2 minus the tehsil's daily mean normal
               (climatology.normals: the reanalysis daily normal of data/anomaly-climate.json, its period read from the file,
               at the served height) over the days that hold both; rainNormalMm = the sum of the
               daily normal rain over the days with a rain value; wetDays = days with >= 1 mm (the wet-day line of the rain checks)
     levels    the hazard levels NIGRAAN issued for the tehsil on each day (day 0): the server engine's archive (data/archive/engine,
               written when the levels change), else the levels the map showed (data/archive/shown); only levels above Normal are
               listed, the highest of the day per hazard; reference layers are left out
     stations  MACH stations within 25 km (the interface's reach), with their approved display names, distance, the window's
               highest day maximum, lowest day minimum and complete days; stations the siting check rejects are left out.
               rainMm stays null: the record's precip_total_mm is the station's running day total, which resets at the device's
               own midnight and on some days mid-day (Jul and Sep 2026 record: 20-30 % of the drops not at 00 h PKT), so it is not
               a true accumulation and no Pakistan-day total is derived from it
   { ok:false, reason } when the point is not valid, or when the server holds no record for it in the window.
   No supplier is named in client text (index.mjs passes the body through customerScrub for the customer view). */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { readFile as readFileP, stat as statP } from 'node:fs/promises';
import { boundedCache } from './boundcache.mjs';
import { join } from 'node:path';
import { gzCache } from './shown.mjs';
import { DAY_MIN_HOURS } from './archive.mjs';
import { pktDay } from './pktday.mjs';
import { unitAtPoint } from './unitresolve.mjs';
import { createPointHeight } from './pointheight.mjs';
import { label } from './refmode.mjs';
import { parseMonths } from './past30parse.mjs';

const REACH_KM = 25;            /* interface 1: stations listed within 25 km */
const WET_MM = 1;               /* the wet-day line of the rain checks (pool.mjs wet-day share, rain-qm heldOut '1') */
const MAX_DAYS = 60;            /* the longest window asked for; the archives keep more */
const km = (a, b, c, d) => { const p = Math.PI / 180, x = Math.sin((c - a) * p / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin((d - b) * p / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
const r1 = (x) => x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10;
const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
// v91.17.270: one client name per hazard (the names every NIGRAAN surface uses)
const HZ = { rain_hz: 'Heavy rain', heat: 'Heat stress', cold: 'Cold stress (UTCI)', wind: 'Wind and gusts', flood: 'Flood', flood_pluvial: 'Flash and urban flooding', flood_riverine: 'River flooding', landslide: 'Landslide', glof: 'Glacial lake outburst flood (GLOF)', drought: 'Drought' };

/* opts.dbDir: the MACH observation record (index.mjs passes station-lake/archive/fleet/db beside the install); without it only the
   live fleet archive is read */
export function createPast30(app, dataDir, opts = {}) {
  const A = join(dataDir, 'archive'); const dbDir = opts.dbDir || null;
  const monthFiles = (sub, prefix, from, to) => { const d = join(A, sub); let f = []; try { f = readdirSync(d); } catch (_) { return []; }
    const m0 = from.slice(0, 7), m1 = to.slice(0, 7); return f.filter((x) => x.startsWith(prefix) && x.endsWith('.jsonl.gz') && x.slice(prefix.length, prefix.length + 7) >= m0 && x.slice(prefix.length, prefix.length + 7) <= m1).sort().map((x) => join(d, x)); };
  /* the record's UTC month files for a window: from the day before the window (00-05 PKT of the first day is the previous UTC day) to the last day */
  const monthsOf = (from, to) => { const out = []; for (let m = addDays(from, -1).slice(0, 7); m <= to.slice(0, 7); m = addDays(m + '-28', 4).slice(0, 7)) out.push(join(dbDir, 'mach_db_' + m + '.csv')); return out; };
  /* fleet day rows → per station, per day: highest / lowest screened reading and the hours that held one (t in [0, 1440) only) */
  const fleetFile = gzCache(() => new Map(), (st, r) => {
    if (!r || !r.k || !r.d || !Array.isArray(r.T)) return;
    const S = st.get(r.k) || st.set(r.k, { lat: r.lat, lon: r.lon, el: r.el ?? null, days: new Map() }).get(r.k); S.lat = r.lat; S.lon = r.lon; if (r.el != null) S.el = r.el;
    let hi = null, lo = null; const hrs = new Set();
    for (let i = 0; i < r.T.length; i++) { if (!(r.ok && r.ok[i] === 1) || r.T[i] == null || !(r.t[i] >= 0 && r.t[i] < 1440)) continue; const v = r.T[i] / 10; hrs.add(Math.floor(r.t[i] / 60)); if (hi == null || v > hi) hi = v; if (lo == null || v < lo) lo = v; }
    const prev = S.days.get(r.d); if (prev) { for (const h of prev.h) hrs.add(h); if (prev.hi != null && (hi == null || prev.hi > hi)) hi = prev.hi; if (prev.lo != null && (lo == null || prev.lo < lo)) lo = prev.lo; }
    S.days.set(r.d, { hi, lo, h: hrs });
  });
  const imergFile = gzCache(() => new Map(), (st, r) => { if (r && r.d && r.u) st.set(r.d, r.u); });
  /* v91.17.267 · one month of the MACH observation record → per station, per Pakistan day: highest / lowest screened reading and the
     Pakistan hours that held one. Read once per file version (size and modification time; the sync appends every 6 h).
     v91.17.269 · PERF A3 · parsed in a worker thread (past30parse.mjs, the same code), so the server keeps answering while a month is
     read; a version already being parsed is waited for, not parsed twice. warm() parses the default window's months at start. */
  const dbMonths = new Map(), dbPending = new Map();
  const noApple = () => process.env.NIGRAAN_FLEET_APPLE !== '1';
  const stamp = (f) => { try { const s = statSync(f); return { mt: s.mtimeMs, size: s.size }; } catch (_) { return null; } };
  const dbFiles = async (files) => {
    const want = []; for (const f of files) { const s = stamp(f); if (!s) { dbMonths.delete(f); continue; } const c = dbMonths.get(f); if (c && c.mt === s.mt && c.size === s.size) continue; want.push([f, s]); }
    const todo = want.filter(([f, s]) => { const p = dbPending.get(f); return !(p && p.mt === s.mt && p.size === s.size); });
    if (todo.length) { let pos = null; try { pos = {}; for (const s of (app.fleet && app.fleet.stations ? app.fleet.stations() : []) || []) if (Number.isFinite(s.lat) && Number.isFinite(s.lon)) pos[s.key] = [s.lat, s.lon]; } catch (_) { pos = null; }
      const job = parseMonths(todo.map(([f]) => f), noApple(), pos);
      for (const [f, s] of todo) { const p = job.then((out) => { const M = out.get(f); if (M) dbMonths.set(f, { mt: s.mt, size: s.size, M }); else dbMonths.delete(f); })
        .finally(() => { if (dbPending.get(f) === e) dbPending.delete(f); }); const e = { mt: s.mt, size: s.size, p }; dbPending.set(f, e); } }
    for (const [f] of want) { const p = dbPending.get(f); if (p) await p.p; }
  };
  const dbFile = (f) => { const c = dbMonths.get(f); return c ? c.M : null; };
  /* the record's station list (lat, lng), used where the live fleet list does not place a station */
  let dbList = null, dbListAt = 0;
  const dbPos = () => { if (!dbDir) return new Map(); const f = join(dbDir, 'stations.json'); let mt = 0; try { mt = statSync(f).mtimeMs; } catch (_) { return new Map(); }
    if (!dbList || dbListAt !== mt) { const j = readJson(f); dbList = new Map(((j && j.stations) || []).filter((x) => x && x.station_key != null && Number.isFinite(+x.lat) && Number.isFinite(+(x.lng ?? x.lon))).map((x) => [String(x.station_key), { lat: +x.lat, lon: +(x.lng ?? x.lon) }])); dbListAt = mt; }
    return dbList; };
  /* issued levels: per day, per layer, per unit, the highest level (>= 1) of day 0 */
  const foldLevels = (st, date, layers) => { if (!date || !layers) return; const D = st.days.get(date) || st.days.set(date, new Map()).get(date);
    for (const [k, L] of Object.entries(layers)) { if (!HZ[k] || !L || typeof L !== 'object') continue; const M = D.get(k) || D.set(k, new Map()).get(k);
      for (const [u, v] of Object.entries(L)) if (Number.isFinite(v) && v >= 1 && !(M.get(u) >= v)) M.set(u, v); } };
  const engineFile = gzCache(() => ({ days: new Map(), seen: new Set() }), (st, r) => { for (const d of (r && r.days) || []) if (d.day === 0 && d.date) { st.seen.add(d.date); foldLevels(st, d.date, d.layers); } });
  const shownFile = gzCache(() => ({ days: new Map(), seen: new Set() }), (st, r) => { if (r && r.day === 0 && r.d && r.layers) { st.seen.add(r.d); foldLevels(st, r.d, Object.fromEntries(Object.entries(r.layers).filter(([, v]) => v && v.st !== 'reference').map(([k, v]) => [k, v.L]))); } });
  const readJson = (f) => { try { return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; } catch (_) { return null; } };
  const levelWords = () => { const S = readJson(join(dataDir, 'hazard-scale.json')); return S && Array.isArray(S.levels) ? S.levels : null; };
  let PH = null; const ph = () => { if (PH === null) { try { PH = createPointHeight(dataDir); } catch (_) { PH = false; } } return PH || null; };

  /* v91.17.268 · ONE READ PER PLACE AND DAY: a page load and a report built from it used to ask for the same point within seconds,
     and the first read of a month of the MACH observation record after a start or a 6-hourly append blocks while the file is parsed
     (the September and October 2026 record, 188 000 rows, 18 MB: 1.4 to 1.6 s in process, 2.3 to 4.3 s for the first HTTP answer;
     measured in CHANGES.md). With opts.cacheMs (index.mjs sets it) an answer already being computed for the same point, window and Pakistan day
     is shared by every caller (in flight), and an ok:true answer is kept for cacheMs. A failed or ok:false answer is never kept, so a
     retry always reads again. Without opts.cacheMs (the unit tests) every call reads afresh. */
  const cacheMs = Math.max(0, Number(opts.cacheMs) || 0); const flight = new Map();
  /* v283.51g3 · the kept answers are bounded by bytes and age (boundcache.mjs), not only by count: NIGRAAN_PAST30_CACHE_MB (default 8 MB),
     each answer kept cacheMs at most */
  const kept = boundedCache({ ttlMs: cacheMs || 1, maxBytes: Math.max(1, Number(process.env.NIGRAAN_PAST30_CACHE_MB) || 8) * 1048576, maxItems: 200 });
  /* v91.17.278.1 · FIX2781 · an answer built while the fleet's station status was not ready (first poll after a start not finished, or a
     registered station not yet in a finished poll; fleet.mjs statusReady) is served but never kept: the next ask reads again and carries the status once the poll has finished */
  const unready = new WeakSet();
  /* v283.51g3 · ITEM 1 · THE WINDOW'S STATION RECORD, ONCE PER FLEET POLL. Every new place used to rebuild the whole fleet's station-day
     table (fleet archive months + the MACH observation record, ~150 stations x 30-60 days) on the main thread, and read up to 60
     satellite-rain day files synchronously: a run of new places held the event loop (code audit, 3 Nov). The table depends only on the
     window (from, to), the fleet's last poll (fleet.pollAt(): the live archive's sealed rows and the station list change with a poll),
     the record's month files (size and modification time) and the fleet archive's month files; it is kept under that key (at most 3
     windows, at most RECORD_MS old) and an in-flight build is shared. Without opts.cacheMs (the unit tests) it is built afresh every call,
     as before. The per-place part (stations within 25 km, the checked candidates, the days) is computed from it unchanged. */
  const RECORD_MS = 15 * 60e3; const records = new Map(), recordFlight = new Map();
  const fileKey = (fs) => fs.map((f) => { const s = stamp(f); return s ? s.mt + ':' + s.size : '-'; }).join(',');
  /* the build gives the event loop back every ~20 ms of work (it is the same arithmetic, in slices) */
  let sliceAt = 0; const slice = async () => { const t = performance.now(); if (!sliceAt) { sliceAt = t; return; } if (t - sliceAt > 20) { await new Promise((r) => setImmediate(r)); sliceAt = performance.now(); } };
  async function buildRecord(from, to, fl) {
    const st = new Map(); sliceAt = 0;
    for (const f of monthFiles('fleet', 'fleet_', from, to)) { const M = await fleetFile(f); for (const [k, S] of M) { await slice(); const o = st.get(k) || st.set(k, { lat: S.lat, lon: S.lon, el: S.el, days: new Map() }).get(k); o.lat = S.lat; o.lon = S.lon; if (S.el != null) o.el = S.el; for (const [d, v] of S.days) if (d >= from && d <= to) o.days.set(d, v); } }
    /* v91.17.267 · the MACH observation record first, day by day: its UTC months from the day before the window (00-05 PKT of the first
       day is the previous UTC day) to the last day; a station day it does not hold complete keeps the fleet archive's day */
    if (dbDir) {
      const rec = new Map(); const mf = monthsOf(from, to);
      await dbFiles(mf);
      for (const f of mf) { const M = dbFile(f); if (!M) continue;
        for (const [k, S] of M) { await slice(); const o = rec.get(k) || rec.set(k, new Map()).get(k);
          for (const [d, v] of S) { if (d < from || d > to) continue; const p = o.get(d); if (!p) { o.set(d, { hi: v.hi, lo: v.lo, h: new Set(v.h) }); continue; }
            for (const x of v.h) p.h.add(x); if (v.hi != null && (p.hi == null || v.hi > p.hi)) p.hi = v.hi; if (v.lo != null && (p.lo == null || v.lo < p.lo)) p.lo = v.lo; } } }
      const live = new Map(fl.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lon)).map((s) => [s.key, s])); const pos = dbPos();
      for (const [k, days] of rec) { await slice();
        const at = live.get(k) || pos.get(k) || st.get(k); if (!at || !Number.isFinite(at.lat) || !Number.isFinite(at.lon)) continue;
        const o = st.get(k) || st.set(k, { lat: at.lat, lon: at.lon, el: null, days: new Map() }).get(k);
        for (const [d, v] of days) { const a = o.days.get(d); if (v.h.size >= DAY_MIN_HOURS || !a || v.h.size > a.h.size) o.days.set(d, { ...v, db: true }); }
      }
    }
    return { st };
  }
  async function stationRecord(from, to, fl) {
    if (!cacheMs) return buildRecord(from, to, fl);
    let poll = ''; try { poll = String((app.fleet && app.fleet.pollAt && app.fleet.pollAt()) || ''); } catch (_) { poll = ''; }
    const key = [from, to, poll, fl.length, fileKey(monthFiles('fleet', 'fleet_', from, to)), dbDir ? fileKey(monthsOf(from, to)) : ''].join('|');
    const c = records.get(key); if (c && Date.now() - c.at < RECORD_MS) return c.v;
    const f = recordFlight.get(key); if (f) return f;
    const p = buildRecord(from, to, fl).then((v) => { for (const [k, r] of records) if (k.startsWith(from + '|' + to + '|') || Date.now() - r.at >= RECORD_MS) records.delete(k);
      records.set(key, { at: Date.now(), v }); while (records.size > 3) records.delete(records.keys().next().value); return v; }).finally(() => recordFlight.delete(key));
    recordFlight.set(key, p); return p;
  }
  /* v283.51g3 · the satellite rain day files (data/imerg/pkt/DATE.json, data/imerg/DATE.json), read with fs/promises and kept per day
     (units only). A day is looked at again at most every RAIN_RECHECK_MS (a past day's file is written once; a file that did not yet
     exist appears within that time); days older than the longest window are dropped. */
  const RAIN_RECHECK_MS = 10 * 60e3; const rainCache = new Map(), rainFlight = new Map();
  const readUnits = async (f) => { let s; try { s = await statP(f); } catch (_) { return { units: null, v: '-' }; }
    try { const j = JSON.parse(await readFileP(f, 'utf8')); return { units: j && j.units && typeof j.units === 'object' ? j.units : null, v: s.mtimeMs + ':' + s.size }; } catch (_) { return { units: null, v: 'x' }; } };
  async function rainDay1(d) {
    const c = rainCache.get(d); if (c && cacheMs && Date.now() - c.at < RAIN_RECHECK_MS) return c;
    const f = rainFlight.get(d); if (f) return f;
    const p = (async () => { const [pk, ut] = await Promise.all([readUnits(join(dataDir, 'imerg', 'pkt', d + '.json')), readUnits(join(dataDir, 'imerg', d + '.json'))]);
      const v = { at: Date.now(), pkt: pk.units, utc: ut.units }; rainCache.set(d, v); return v; })().finally(() => rainFlight.delete(d));
    rainFlight.set(d, p); return p;
  }
  async function rainDays(dates) {
    const oldest = addDays(pktDay(Date.now()), -(MAX_DAYS + 2)); for (const d of rainCache.keys()) if (d < oldest) rainCache.delete(d);
    const out = new Map(); for (let i = 0; i < dates.length; i += 8) { const part = await Promise.all(dates.slice(i, i + 8).map(rainDay1)); part.forEach((v, j) => out.set(dates[i + j], v)); }
    return out;
  }

  async function at(q) {
    const lat = Number(q.lat), lon = Number(q.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 23 || lat > 38 || lon < 60 || lon > 78) return { ok: false, reason: 'The place is not a valid point inside Pakistan.' };
    const n = Math.max(1, Math.min(MAX_DAYS, Math.round(Number(q.days) || 30)));
    if (!cacheMs) return read(lat, lon, n);
    const key = lat + ',' + lon + ',' + n + ',' + pktDay(Date.now()); const now = Date.now();
    const k = kept.get(key, now); if (k) return k;
    const f = flight.get(key); if (f) return f;
    const p = read(lat, lon, n).then((v) => { if (v && v.ok === true && !unready.has(v)) kept.set(key, v); return v; })
      .finally(() => { flight.delete(key); });
    flight.set(key, p); return p;
  }
  async function read(lat, lon, n) {
    const to = addDays(pktDay(Date.now()), -1), from = addDays(to, -(n - 1));
    const dates = Array.from({ length: n }, (_, i) => addDays(from, i));
    const notes = [], sources = new Set();
    const hit = unitAtPoint(app, lat, lon); const unit = hit && hit.unit ? hit.unit : null; const uid = unit ? unit.unitId : null;
    if (!unit) notes.push('No tehsil holds this point, so the satellite rain, the normals and the issued levels are not available.');

    /* ── rain: the tehsil's satellite day total ── */
    const rain = new Map(), rainDay = new Map();
    if (uid) {
      /* v283.51g3 · the day files are read asynchronously once and kept (rainDays), not read synchronously per place */
      const RD = await rainDays(dates);
      for (const d of dates) { const P = RD.get(d).pkt; if (P && P[uid] != null) { rain.set(d, P[uid]); rainDay.set(d, 'pkt'); } }
      for (const d of dates) { if (rain.has(d)) continue; const P = RD.get(d).utc; if (P && P[uid] != null) { rain.set(d, P[uid]); rainDay.set(d, 'utc'); } }
      for (const f of monthFiles('imerg', 'imerg_', from, to)) { const M = await imergFile(f); for (const d of dates) { if (rain.has(d)) continue; const u = M.get(d); if (u && u[uid] != null) { rain.set(d, u[uid] / 10); rainDay.set(d, 'utc'); } } }
      if (rain.size) sources.add(label('satelliteRain'));
      const utc = [...rainDay.values()].filter((x) => x === 'utc').length;
      if (utc) notes.push(utc + ' of the ' + rain.size + ' rain days are the satellite product’s calendar day (05:00 to 05:00 PKT), not the Pakistan day.');
      if (rain.size < n) notes.push('Satellite rain is held for ' + rain.size + ' of the ' + n + ' days.');
    }

    /* ── temperature: MACH station days ── */
    const F = app.fleet; const R = F && F.screenRule ? F.screenRule() : null;
    const fl = (F && F.stations && F.stations()) || []; const names = new Map(fl.map((s) => [s.key, s.name]));
    /* v283.51g3 · the fleet's station-day record of the window is built once per fleet poll and shared by every place (stationRecord) */
    const REC = await stationRecord(from, to, fl); const st = REC.st; let dbDays = 0, fleetDays = 0;
    let zP = null; try { const h = ph() && ph().heightAt(lat, lon); zP = h && h.ok ? (h.elevM ?? h.cellElevM ?? null) : null; } catch (_) { zP = null; }
    const checkOf = (k) => { try { return F && F.screen ? F.screen(k) : null; } catch (_) { return null; } };
    const elevOf = (k, S) => { try { const e = F && F.elevOf ? F.elevOf(k) : null; return e != null ? e : S.el ?? null; } catch (_) { return S.el ?? null; } };
    /* v91.17.278 · FIX278 2a · only the AGN MACH fleet's registered stations are listed (data/mach-fleet-stations.json, the names and the
       station check the interface shows). Since 15 Oct 2026 the MACH observation database also carries airport reports (source asos, keys
       OPLA, OPIS, OPKC ...); placed by the record's station list they became a row named only "MACH station" with no status in the Lahore
       situation report (live walk-through, 17 Oct). A key the registry does not hold is not a MACH station: it is counted, never listed.
       2b · a station whose record stops before the last day of the window shows no day highs and lows: they would describe an older period
       than the rest of the table (the live walk-through: "Old City, Lahore", silent since 2 Oct, printed 33.2 / 23.4 °C). Its status
       (silent since ...) comes with the row from the fleet check (statusAll, by key), not by a display-name match in the browser. */
    const statusBy = new Map(); try { for (const x of (F && F.statusAll ? F.statusAll() : [])) statusBy.set(String(x.key), x); } catch (_) {}
    let statusWait = false; try { statusWait = !!(F && F.statusReady && !F.statusReady()); } catch (_) { statusWait = true; }
    const stations = [], cand = []; let unlisted = 0;
    for (const [k, S] of st) {
      if (!Number.isFinite(S.lat) || !Number.isFinite(S.lon)) continue; const d = km(lat, lon, S.lat, S.lon); if (d > REACH_KM) continue;
      if (!names.get(k)) { unlisted++; continue; }
      const sc = checkOf(k); if (sc && (sc.verdict === 'bad siting' || sc.verdict === 'excluded')) continue;
      const full = [...S.days.entries()].filter(([, v]) => v.h.size >= DAY_MIN_HOURS && v.hi != null && v.lo != null);
      const ez = elevOf(k, S);
      const last = [...S.days.entries()].filter(([, v]) => v.h.size > 0).map(([dd]) => dd).sort().pop() || null, current = last === to;
      const ss = statusBy.get(String(k)) || null;
      stations.push({ name: names.get(k), km: r1(d), tmaxC: current && full.length ? r1(Math.max(...full.map(([, v]) => v.hi))) : null, tminC: current && full.length ? r1(Math.min(...full.map(([, v]) => v.lo))) : null, rainMm: null, days: full.length, lastDay: last, current, checked: !!(sc && sc.trusted),
        ...(ss && ss.status ? { status: ss.status, statusNote: ss.statusNote || '', silentSince: ss.silentSince || null } : {}) });
      if (R && sc && sc.trusted && d <= R.radius_km && (zP == null || ez == null || Math.abs(ez - zP) <= R.dz_m)) cand.push({ k, d, S, name: names.get(k) });
    }
    if (stations.some((x) => !x.current)) notes.push('A station whose readings stop before the last day of the window shows no highest or lowest value: they would describe an older period than the rest of the table.');
    stations.sort((a, b) => a.km - b.km); cand.sort((a, b) => a.d - b.d);
    if (stations.length) { sources.add(label('ownStations')); notes.push('Station rain is not shown: the stations report a running rain total that resets at different times of day, so it cannot be turned into reliable Pakistan-day totals.'); }
    if (!cand.length) notes.push(R ? 'No checked MACH station within ' + R.radius_km + ' km and ' + R.dz_m + ' m of this place’s height: day highs and lows are not available here.' : 'The station check rule is not on this server: day highs and lows are not available.');
    else { const used = new Set(); for (const d of dates) { const c = cand.find((x) => { const v = x.S.days.get(d); return v && v.h.size >= DAY_MIN_HOURS; }); if (c) used.add(c.name); }
      if (used.size) notes.push('Day highs and lows: ' + [...used].join('; ') + ' (the nearest checked MACH station with a complete day; a day needs readings in ' + DAY_MIN_HOURS + ' of its 24 hours).');
      else notes.push('The checked MACH stations near this place have no complete day in this window (a day needs readings in ' + DAY_MIN_HOURS + ' of its 24 hours): day highs and lows are not available.'); }

    /* ── normals ── */
    const C = app.climatology; const nrm = (d) => { try { return uid && C && C.normals ? C.normals(uid, d) : null; } catch (_) { return null; } };

    const daily = dates.map((d) => { let tmaxC = null, tminC = null, src = [];
      const c = cand.find((x) => { const v = x.S.days.get(d); return v && v.h.size >= DAY_MIN_HOURS; });
      if (c) { const v = c.S.days.get(d); tmaxC = r1(v.hi); tminC = r1(v.lo); src.push('MACH ' + c.name + ' (' + r1(c.d) + ' km)'); if (v.db) dbDays++; else fleetDays++; }
      const rainMm = rain.has(d) ? r1(rain.get(d)) : null; if (rainMm != null) src.push(label('satelliteRain') + ' (tehsil average)');
      return { date: d, tmaxC, tminC, rainMm, src: src.join('; ') || null }; });

    if (dbDays || fleetDays) notes.push('Day highs and lows: ' + dbDays + ' of the ' + (dbDays + fleetDays) + ' days from the MACH observation record' + (fleetDays ? ', ' + fleetDays + ' from the live station feed where the record has no complete day.' : '.'));

    /* ── levels ── */
    const W = levelWords(); const levels = []; let levelDays = 0, levelSrc = null;
    if (uid && W) {
      const E = { days: new Map(), seen: new Set() }, S0 = { days: new Map(), seen: new Set() };
      const merge = (dst, src) => { for (const d of src.seen) dst.seen.add(d); for (const [d, Lm] of src.days) { const D = dst.days.get(d) || dst.days.set(d, new Map()).get(d); for (const [k, M] of Lm) { const T = D.get(k) || D.set(k, new Map()).get(k); for (const [u, v] of M) if (!(T.get(u) >= v)) T.set(u, v); } } };
      for (const f of monthFiles('engine', 'engine_', from, to)) merge(E, await engineFile(f));
      for (const f of monthFiles('shown', 'shown_', from, to)) merge(S0, await shownFile(f));
      for (const d of dates) { const src = E.seen.has(d) ? E : S0.seen.has(d) ? S0 : null; if (!src) continue; levelDays++; levelSrc = levelSrc || (src === E ? 'engine' : 'map');
        const D = src.days.get(d); if (!D) continue;
        for (const [k, M] of D) { const v = M.get(uid); if (v != null && W[v]) levels.push({ date: d, hazard: HZ[k], level: W[v] }); } }
      notes.push(levelDays ? 'Issued levels are archived for ' + levelDays + ' of the ' + n + ' days; ' + (levels.length ? levels.length + ' day-hazard levels above ' + W[0] + ' are listed.' : 'none was above ' + W[0] + '.') : 'No issued levels are archived for this window.');
    }

    /* ── summary ── */
    const T = daily.filter((x) => x.tmaxC != null && x.tminC != null), Rn = daily.filter((x) => x.rainMm != null);
    const top = T.length ? T.reduce((a, b) => b.tmaxC > a.tmaxC ? b : a) : null, bot = T.length ? T.reduce((a, b) => b.tminC < a.tminC ? b : a) : null;
    let anom = null; { const v = T.map((x) => { const N = nrm(x.date); return N && N.tm != null ? (x.tmaxC + x.tminC) / 2 - N.tm : null; }).filter((x) => x != null); if (v.length && v.length === T.length) anom = r1(v.reduce((a, b) => a + b, 0) / v.length); }
    let rainNormal = null; { const v = Rn.map((x) => { const N = nrm(x.date); return N && N.pr != null ? N.pr : null; }); if (Rn.length && v.every((x) => x != null)) rainNormal = r1(v.reduce((a, b) => a + b, 0)); }
    if ((T.length && anom == null) || (Rn.length && rainNormal == null)) notes.push('The daily normals for this tehsil are not on this server, so the departure from normal is not available.');
    else if (anom != null || rainNormal != null) { if (rainNormal != null) notes.push('The rain normal is the reanalysis normal for the same days; the rain itself is the satellite record, so the two are close but not the same measure.'); const per = C && C.anomalyPeriod ? C.anomalyPeriod() : null; sources.add(label('reanalysis') + ' daily normals' + (per ? ' ' + per : '')); }
    const wet = Rn.filter((x) => x.rainMm >= WET_MM), wettest = Rn.length ? Rn.reduce((a, b) => b.rainMm > a.rainMm ? b : a) : null;
    const summary = { tmaxC: top ? top.tmaxC : null, tmaxDate: top ? top.date : null, tminC: bot ? bot.tminC : null, tminDate: bot ? bot.date : null, tmeanAnomC: anom,
      rainMm: Rn.length ? r1(Rn.reduce((a, b) => a + b.rainMm, 0)) : null, rainNormalMm: rainNormal, wetDays: Rn.length ? wet.length : null, wettestDate: wettest && wettest.rainMm > 0 ? wettest.date : null, wettestMm: wettest && wettest.rainMm > 0 ? wettest.rainMm : (Rn.length ? 0 : null),
      tempDays: T.length, rainDays: Rn.length };
    if (!T.length && !Rn.length && !levelDays && !stations.length) return { ok: false, reason: 'This server holds no observed record for this place in the last ' + n + ' days yet.' };
    const out = { ok: true, from, to, days: n, place: { lat, lon, tehsil: unit ? unit.name : null, district: unit ? unit.district || null : null, elevM: zP != null ? Math.round(zP) : null }, daily, summary, levels, stations, stationsNotInRegister: unlisted, sources: [...sources], notes };
    if (statusWait) unready.add(out);
    return out;
  }
  /* v91.17.269 · PERF A2 · the record's months of the default window, parsed before the server takes customers (server.mjs warm-up) */
  function warm(days = 30) { if (!dbDir) return Promise.resolve(0); const to = addDays(pktDay(Date.now()), -1), from = addDays(to, -(days - 1)); const mf = monthsOf(from, to);
    return dbFiles(mf).then(() => mf.filter((f) => dbMonths.has(f)).length); }
  return { at, warm };
}
