/* ══ v91.17.283.25 · THE EWS LIVE ANCHOR, SHADOW ONLY ═══════════════════════════════════════════════════════════════════════════════
   What it is: the live temperature readings of the partner high-altitude network (EWS / AWS, internal only, never named to a client) as
   anchors of the served temperature, the way the live MACH layer (hyperlocal.mjs) anchors it with AGN's own stations:
     1  each EWS station's newest 'Air Temperature' reading of the last fade_hours (data/ews-live-anchor.json), from NIGRAAN's copy of
        the partner files (nig/copies/lamha/data/pmd/ews_live/raw, copies.mjs: copied, never fetched); each station's own series judged by
        obsqc.mjs seriesRows (gross range, sentinels, series and internal checks; the per-network settings of data/obs-qc-params.json);
     2  residual = reading - the SERVED basis at the reading's hour: the served national tehsil forecast of the newest complete national
        run holding that hour, for the station's tehsil, moved from the served height to the station height (GLO-30, pointheight.mjs) at
        the file's lapse rate - the matching the verification agent uses for every station score; no provider call is made;
     3  at a place: simple kriging (zero mean, the file's exponential variogram fitted on EWS residual pairs, radius_km, stations within
        exclude_within_km of the place left out, as tested) and the fade of the MACH layer (weight 1 at the newest reading used, 0 at
        fade_hours after it). No reading within fade_hours: no anchor, with the reason.
   SHADOW: this module never writes into a served answer, a run record or a page. Every hour it computes, beside the served value, the
   anchor at every tehsil's served point and at the scoring stations, and appends ONE gzip member to
   data/archive/ewsanchor/ewsa_YYYY-MM.jsonl.gz (permanent, as data/archive). The verification agent (scripts/agents/verify.mjs, section
   EWS-ANCHOR SHADOW) scores served against served + anchor from it every day, each EWS station held out of its own anchor, and applies
   the pre-registered promotion rule (data/ews-live-anchor.json promotion, the gate register entry ews-live-anchor). data/ews-live-anchor.json
   "live" is false and no served code reads it: switching the anchor into a served value is a later package (servingHook).
   The method (coefficients file, fade, kriging) has one home, ewsanchor.mjs, shared with the verification agent.
   NIGRAAN_EWS_SHADOW=0 switches the hourly computation off; NIGRAAN_WORKER=0 (scratch servers) leaves its timer off. */
import { readFileSync, statSync, existsSync, mkdirSync, openSync, writeSync, fsyncSync, closeSync, truncateSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { anchorAt, loadAnchorModel, kmBetween, EWS_ELEMENT, ewsAccept, ewsChannels } from './ewsanchor.mjs';   /* v283.44: ewsAccept (switch NIGRAAN_EWS_THS) */
import { seriesRows, loadParams } from './obsqc.mjs';
import { splitCsvLine, utcMs } from './copies.mjs';
import { ownDir } from './ownpaths.mjs';
import { unitAtPoint } from './unitresolve.mjs';
import { createPointHeight } from './pointheight.mjs';
import { schedule } from './scheduler.mjs';

const H = 3600e3;
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const r2 = (x) => (fin(x) ? Math.round(x * 100) / 100 : null);

/* ── the EWS readings of NIGRAAN's copy between fromMs and toMs: Map station_id -> { name, rows: [{ ms, T }] } ── */
export function readEwsCopy(copiesDir, fromMs, toMs) {
  const out = new Map(); const raw = join(copiesDir, 'data', 'pmd', 'ews_live', 'raw'); const accT = ewsAccept(copiesDir, 'T');   /* v283.44 · off: el === EWS_ELEMENT */
  for (let t = Math.floor(fromMs / 864e5) * 864e5; t <= toMs; t += 864e5) {
    const f = join(raw, 'ews_raw_' + new Date(t).toISOString().slice(0, 10).replace(/-/g, '') + '.csv.gz'); if (!existsSync(f)) continue;
    let txt = ''; try { const b = readFileSync(f); txt = (b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b) : b).toString('utf8'); } catch (_) { continue; }
    const lines = txt.split(/\r?\n/); const head = splitCsvLine((lines.shift() || '').replace(/^﻿/, '')).map((h) => h.trim());
    const ix = (n) => head.indexOf(n); const iv = ix('value'), it = ix('time_utc'), is = ix('station_id'), ie = ix('element'), inm = ix('station');
    if (iv < 0 || it < 0 || is < 0 || ie < 0) continue;
    for (const l of lines) { if (!l) continue; const c = splitCsvLine(l); if (!accT(c[is], c[ie])) continue; const ms = utcMs(c[it]); const v = c[iv] === '' ? NaN : Number(c[iv]);
      if (!fin(ms) || !fin(v) || ms < fromMs || ms > toMs) continue; const id = String(c[is]); const o = out.get(id) || out.set(id, { name: inm >= 0 ? c[inm] : id, rows: [] }).get(id); o.rows.push({ ms, T: v }); }
  }
  for (const o of out.values()) { o.rows.sort((a, b) => a.ms - b.ms); o.rows = o.rows.filter((r, i, a) => i === 0 || r.ms !== a[i - 1].ms); }
  return out;
}

/* the partner catalogue (NIGRAAN's copy): station_id -> { name, lat, lon, altitude } */
/* v91.17.283.31 · data lane · the EWS register (data/ews-register.json, internal): posts the catalogue holds without a location get the
   register's coordinates (19 water-level / discharge posts, from the portal station register); a held or down post is marked */
export function ewsRegister(dataDir) { try { return dataDir ? JSON.parse(readFileSync(join(dataDir, 'ews-register.json'), 'utf8')) : null; } catch (_) { return null; } }
export function readEwsCatalogue(copiesDir, dataDir = null) {
  const out = readEwsCatalogue0(copiesDir); const R = ewsRegister(dataDir); if (!R) return out;
  const M = out || new Map(); const byName = new Map([...M.values()].map((v) => [String(v.name), v]));
  for (const p of R.posts || []) { const id = String(p.stationId ?? p.station); if (M.has(id) || byName.has(p.station)) continue; if (!fin(p.lat) || !fin(p.lon)) continue;
    M.set(id, { id, name: p.station, lat: p.lat, lon: p.lon, altitude: null, coordSource: 'ews register' }); }
  const live = (a) => (a || []).filter((e) => !e.cleared); const held = new Set(live(R.holds).map((h) => h.station)), down = new Set(live(R.down).map((d) => d.station));
  for (const v of M.values()) { if (held.has(v.name)) v.held = true; if (down.has(v.name)) v.down = true; }
  return M;
}
function readEwsCatalogue0(copiesDir) {
  const f = join(copiesDir, 'data', 'pmd', 'aegis_gb_station_catalog.csv'); let txt = ''; try { txt = readFileSync(f, 'utf8'); } catch (_) { return null; }
  const lines = txt.split(/\r?\n/); const head = splitCsvLine((lines.shift() || '').replace(/^﻿/, '')).map((h) => h.trim()); const ix = (n) => head.indexOf(n);
  const I = { id: ix('stationId'), name: ix('stationName'), lat: ix('latitude'), lon: ix('longitude'), alt: ix('altitude') }; if (I.id < 0 || I.lat < 0 || I.lon < 0) return null;
  const out = new Map(); for (const l of lines) { if (!l.trim()) continue; const c = splitCsvLine(l); const lat = Number(c[I.lat]), lon = Number(c[I.lon]); if (!fin(lat) || !fin(lon)) continue;
    const alt = I.alt >= 0 && c[I.alt] !== '' ? Number(c[I.alt]) : NaN; out.set(String(c[I.id]), { id: String(c[I.id]), name: I.name >= 0 ? c[I.name] : String(c[I.id]), lat, lon, altitude: fin(alt) ? alt : null }); }
  return out;
}

export function createEwsAnchor(app, dataDir, opts = {}) {
  const on = () => process.env.NIGRAAN_EWS_SHADOW !== '0';
  const now = () => (opts.now ? opts.now() : Date.now());
  /* v91.17.283.28 · independence from LAMHA: the EWS readings, the station catalogue and the airport list come from NIGRAAN's own folder
     (server/api/ownpaths.mjs, nig/own, LAMHA's relative layout; ews_sync.py and metar_sync.py fill it), no longer from nig/copies/lamha.
     opts.copiesDir (tests) names that folder. */
  const copiesDir = () => opts.copiesDir || ownDir(join(dataDir, '..'));
  const arcDir = opts.archiveDir || join(dataDir, 'archive', 'ewsanchor'); const stFile = join(arcDir, 'state.json');
  let ST = { version: 1, lastHour: null, committed: {} }; try { ST = { ...ST, ...JSON.parse(readFileSync(stFile, 'utf8')) }; } catch (_) {}
  const S = { ticks: 0, lastAt: null, lastHour: null, lastError: null, last: null };
  let PH = null; const ph = () => { if (!PH) { try { PH = createPointHeight(dataDir); } catch (_) { PH = null; } } return PH; };
  /* opts.place(lat, lon) -> { uid, elevM }: the unit tests' stand-in for the tehsil polygons and the 30 m heights */
  const heightOf = (lat, lon, hint = null) => { if (opts.place) { const p = opts.place(lat, lon); return p && fin(p.elevM) ? p.elevM : (fin(hint) ? hint : null); } try { const r = ph() && ph().heightAt(lat, lon); if (r && fin(r.elevM)) return r.elevM; if (r && fin(r.cellElevM)) return r.cellElevM; } catch (_) {} return fin(hint) ? hint : null; };
  const uidOf = (lat, lon) => { if (opts.place) { const p = opts.place(lat, lon); return p ? p.uid : null; } try { const u = unitAtPoint(app, lat, lon); return u && u.unit ? u.unit.unitId : null; } catch (_) { return null; } };

  /* the stations, placed once per catalogue change: tehsil and height */
  let CAT = null, catKey = null;
  function ewsStations() {
    const f = join(copiesDir(), 'data', 'pmd', 'aegis_gb_station_catalog.csv'); let k = null; try { const s = statSync(f); k = s.mtimeMs + ':' + s.size; } catch (_) { return null; }
    if (CAT && k === catKey) return CAT; const C = readEwsCatalogue(copiesDir(), dataDir); if (!C) return null;
    for (const s of C.values()) { s.uid = uidOf(s.lat, s.lon); s.elevM = heightOf(s.lat, s.lon, s.altitude); }
    CAT = C; catKey = k; return CAT;
  }
  /* the other stations scored against the anchor (verify.mjs pids): MACH registry, METAR airports, synoptic stations */
  let OTH = null, othAt = 0;
  function otherStations() {
    if (OTH && now() - othAt < 6 * H) return OTH; const out = [];
    try { for (const s of JSON.parse(readFileSync(join(dataDir, 'mach-fleet-stations.json'), 'utf8')).stations || []) if (fin(s.lat) && fin(s.lon)) out.push({ pid: 'mach:' + s.key, lat: s.lat, lon: s.lon }); } catch (_) {}
    try { const t = readFileSync(join(copiesDir(), 'data', 'obs_other', 'metar_live', 'airports.csv'), 'utf8').split(/\r?\n/); const h = splitCsvLine(t.shift() || '').map((x) => x.trim());
      const ic = h.indexOf('icao'), la = h.indexOf('lat'), lo = h.indexOf('lon'); if (ic >= 0 && la >= 0 && lo >= 0) for (const l of t) { if (!l.trim()) continue; const c = splitCsvLine(l); const lat = Number(c[la]), lon = Number(c[lo]); if (fin(lat) && fin(lon)) out.push({ pid: 'metar:' + c[ic], lat, lon }); } } catch (_) {}
    try { const syn = JSON.parse(readFileSync(join(dataDir, 'synop-stations.json'), 'utf8')).stations || {}; for (const [sid, m] of Object.entries(syn)) if (/^\d+$/.test(sid) && m && fin(m.lat) && fin(m.lon)) out.push({ pid: 'synop:' + sid, lat: m.lat, lon: m.lon }); } catch (_) {}
    for (const s of out) { s.uid = uidOf(s.lat, s.lon); s.elevM = heightOf(s.lat, s.lon); }
    OTH = out; othAt = now(); return OTH;
  }
  /* the served basis: complete national tehsil runs, newest first, each as uid -> { lat, lon, sel, t0, T[] } (read only; never changed) */
  const RC = new Map();
  function runs() {
    let list = []; try { list = (app.store ? app.store.all('runs') : []).filter((r) => r.unit_level === 'tehsil' && r.status === 'complete' && !r.records_pruned && r.base_valid_time)
      .sort((a, b) => Date.parse(b.base_valid_time) - Date.parse(a.base_valid_time) || Date.parse(b.completed_at || 0) - Date.parse(a.completed_at || 0)).slice(0, 12); } catch (_) { list = []; }
    const keep = new Set(list.map((r) => r.run_id)); for (const k of [...RC.keys()]) if (!keep.has(k)) RC.delete(k);
    return list.map((r) => { if (!RC.has(r.run_id)) { const by = new Map();
        for (const x of app.store.filter('records', (y) => y.runId === r.run_id)) { const Hh = x.hourly || {}; const tt = Hh.time || []; if (!tt.length || !Array.isArray(Hh.temperature_2m)) continue;
          const sel = x.temperatureBasis && fin(x.temperatureBasis.elevM) ? x.temperatureBasis.elevM : (fin(x.resolvedElevationM) ? x.resolvedElevationM : null);
          by.set(x.unitKey, { lat: x.lat, lon: x.lon, sel, t0: Date.parse(String(tt[0]).replace(/Z?$/, 'Z')), T: Hh.temperature_2m, RH: Array.isArray(Hh.relative_humidity_2m) ? Hh.relative_humidity_2m : null }); }   /* v283.45: RH kept for the dew-point shadow (read only) */
        RC.set(r.run_id, by); }
      return { id: r.run_id, by: RC.get(r.run_id) }; });
  }
  /* the served tehsil temperature at an hour: the newest run that holds the hour; at a station height when elevM is given */
  function servedAt(R, uid, hourMs, elevM = null, M = null) {
    if (!uid) return null;
    for (const run of R) { const f = run.by.get(uid); if (!f) continue; const i = Math.round((hourMs - f.t0) / H); if (i < 0 || i >= f.T.length || !fin(f.T[i])) continue;
      const lapse = M && fin(M.lapse_k_per_m) ? M.lapse_k_per_m : null; const adj = fin(elevM) && fin(f.sel) && lapse != null ? -lapse * (elevM - f.sel) : 0;
      return { T: f.T[i] + adj, run: run.id }; }
    return null;
  }

  /* the residual set at nowMs: each EWS station's newest reading passing the quality control within fade_hours */
  function residualSet(nowMs, M, R) {
    const cat = ewsStations(); if (!cat) return { rows: [], why: 'no copy of the partner station catalogue' };
    const from = nowMs - M.fade_hours * H - 24 * H;   /* a day of series before the window for the series checks */
    const E = readEwsCopy(copiesDir(), from, nowMs); if (!E.size) return { rows: [], why: 'no EWS reading in NIGRAAN\'s own EWS store for the last ' + M.fade_hours + ' h' };
    const all = []; for (const [id, o] of E) for (const r of o.rows) all.push({ id, ms: r.ms, T: r.T });
    let bad = new Map(); try { bad = seriesRows(all, (r) => r.id, (r) => ({ ms: r.ms, T: r.T }), (k) => { const s = cat.get(k); return s ? { lat: s.lat, lon: s.lon, elev: s.elevM, net: 'aws', pid: 'aws:' + s.name } : null; }, loadParams(dataDir)); } catch (_) { bad = new Map(); }
    const newest = new Map(); for (const r of all) { if (bad.has(r) || r.ms > nowMs || nowMs - r.ms > M.fade_hours * H) continue; const c = newest.get(r.id); if (!c || r.ms > c.ms) newest.set(r.id, r); }
    const rows = []; let noPlace = 0, noBasis = 0;
    for (const [id, r] of newest) { const s = cat.get(id); if (!s) { noPlace++; continue; }
      const b = servedAt(R, s.uid, Math.round(r.ms / H) * H, s.elevM, M); if (!b) { noBasis++; continue; }
      rows.push({ id, name: s.name, lat: s.lat, lon: s.lon, elevM: s.elevM, uid: s.uid, obsMs: r.ms, obs: r.T, served: b.T, res: r.T - b.T, run: b.run }); }
    return { rows, readings: newest.size, failedQc: [...bad.keys()].filter((r) => nowMs - r.ms <= M.fade_hours * H).length, noPlace, noBasis,
      why: rows.length ? null : newest.size ? 'no served basis for the stations reporting (no national run holds their hour, or no tehsil)' : 'no EWS reading in the last ' + M.fade_hours + ' h passed the quality control' };
  }

  /* one hour: the residual set, the anchor at every tehsil's served point and at the scoring stations, beside the served value */
  function compute(nowMs = now()) {
    const M = loadAnchorModel(dataDir); const hourMs = Math.floor(nowMs / H) * H;
    if (!M) return { hourMs, rows: [], u: {}, o: [], why: 'no model file (data/ews-live-anchor.json)' };
    const R = runs(); const set = residualSet(nowMs, M, R);
    const u = {}, o = []; let nU = 0;
    if (set.rows.length) {
      for (const run of R.slice(0, 1)) for (const [uid, f] of run.by) { const sv = servedAt(R, uid, hourMs, null, M); if (!sv) continue;
        const a = anchorAt(M, set.rows, f.lat, f.lon, hourMs); if (!a.applied) continue; u[uid] = [r2(sv.T), r2(a.dT), a.n]; nU++; }
      const reach = (s) => set.rows.some((r) => kmBetween(s.lat, s.lon, r.lat, r.lon) <= M.radius_km);
      for (const s of otherStations()) { if (!reach(s)) continue; const sv = servedAt(R, s.uid, hourMs, s.elevM, M); if (!sv) continue;
        const a = anchorAt(M, set.rows, s.lat, s.lon, hourMs); o.push([s.pid, s.lat, s.lon, r2(s.elevM), r2(sv.T), a.applied ? r2(a.dT) : null, a.n || 0]); }
    }
    /* each EWS station's served value at the scored hour (its own reading is held out by the verification agent, never here) */
    const rows = set.rows.map((r) => { const sh = servedAt(R, r.uid, hourMs, r.elevM, M); return { ...r, servedH: sh ? sh.T : null }; });
    return { hourMs, model: M.version, rows, u, o, tehsils: nU, why: set.why, readings: set.readings || 0, failedQc: set.failedQc || 0, noBasis: set.noBasis || 0 };
  }
  /* the archive line of one hour (temperatures to 0.01 C; times as minutes before the hour's tick) */
  function line(c, atMs) {
    return JSON.stringify({ h: new Date(c.hourMs).toISOString().slice(0, 13), at: new Date(atMs).toISOString(), v: c.model || null, why: c.why || null,
      r: c.rows.map((x) => [x.name, x.id, x.lat, x.lon, r2(x.elevM), x.uid, r2(x.obs), Math.round((atMs - x.obsMs) / 6e4), r2(x.served), r2(x.servedH)]),
      o: c.o, u: c.u, n: { readings: c.readings, failedQc: c.failedQc, noBasis: c.noBasis, tehsils: c.tehsils } });
  }
  /* append one gzip member; the committed length of each file is kept so a torn append is cut back before the next one (archive.mjs rule) */
  function append(rel, text) {
    mkdirSync(arcDir, { recursive: true }); const f = join(arcDir, rel); const buf = gzipSync(Buffer.from(text + '\n', 'utf8'), { level: 9 });
    const want = ST.committed[rel] || 0; let size = 0; try { size = statSync(f).size; } catch (_) { size = 0; }
    if (size > want) truncateSync(f, want);
    const fd = openSync(f, 'a'); try { writeSync(fd, buf); fsyncSync(fd); } finally { closeSync(fd); }
    ST.committed[rel] = Math.min(size, want) + buf.length; return buf.length;
  }
  function saveState() { try { mkdirSync(arcDir, { recursive: true }); const t = stFile + '.tmp'; writeFileSync(t, JSON.stringify(ST)); renameSync(t, stFile); } catch (_) {} }
  async function tick(reason = 'timer') {
    if (!on()) return { ok: false, why: 'switched off (NIGRAAN_EWS_SHADOW=0)' };
    const at = now(); const hk = new Date(Math.floor(at / H) * H).toISOString().slice(0, 13);
    if (ST.lastHour === hk && reason !== 'force') return { ok: true, skipped: 'hour ' + hk + ' already recorded' };
    try { const c = compute(at); const bytes = append('ewsa_' + hk.slice(0, 7) + '.jsonl.gz', line(c, at)); ST.lastHour = hk; saveState();
      S.ticks++; S.lastAt = new Date(at).toISOString(); S.lastHour = hk; S.lastError = null;
      S.last = { hour: hk, stations: c.rows.length, readings: c.readings, failedQc: c.failedQc, noBasis: c.noBasis, tehsils: c.tehsils, others: c.o.length, why: c.why, bytes };
      try { tickTd(at); } catch (e) { TD.lastError = String(e && e.message || e); }   /* v283.45: the dew-point shadow, after (and independent of) the E1 line */
      return { ok: true, ...S.last }; }
    catch (e) { S.lastError = String(e && e.message || e); return { ok: false, why: S.lastError }; }
  }
  /* the shadow anchor at a point now (operator checks and tests); never part of a served answer */
  function at(lat, lon) { const M = loadAnchorModel(dataDir); if (!M) return { applied: false, why: 'no model file' }; const nowMs = now(); const set = residualSet(nowMs, M, runs());
    const a = anchorAt(M, set.rows, lat, lon, nowMs); return { ...a, shadow: true, served: false, why: a.why || set.why || null }; }
  /* ══ v91.17.283.41 (NIGRAAN 1.0.5) · item 36 · THE SERVING HOOK (servingHook 'chain:ews-live@283.41'), OFF until the live pointer is flipped ══
     Serves the anchor on exactly the basis it was scored on (retrain 31 Oct 2026, candidate E1, data/ews-live-anchor.json heldOut): the served
     national tehsil forecast of the place's tehsil (newest complete national run holding the hour) moved from its served height to the place
     height at the file's lapse rate, plus the simple-kriged EWS residual (the file's variogram, radius_km, the stations within
     exclude_within_km of the place left out as in the test), faded linearly over fade_hours after the newest reading used:
         anchored(h) = basis(h) + raw            at the newest reading (weight 1): the scored value
         served(h)   = chain(h) + w(h) x (anchored(h) - chain(h))     w(h) = the fade weight of the hour (1 -> 0 over fade_hours)
     so the value returns to the served chain where the anchor fades out. Temperature only: the current value and the hours from the newest
     reading to fade_hours after it; relative humidity at constant water vapour, dew point capped at the temperature, apparent temperature
     moved by the same change (the MACH live layer's rule, hyperlocal.mjs follow); today's daily max / min / mean follow the hourly curve
     (one value per place). Where the MACH live layer already corrected the place (loc.agn_hyperlocal.applied) the anchor is not added (one
     live correction per place). Station readings are never changed. Off (live !== true, servingHook not this one, NIGRAAN_EWS_SERVE=0):
     returns false before touching the answer, so the answer is byte-identical to 1.0.4. */
  const SERVE_HOOK = 'chain:ews-live@283.41';
  let RS = null; const rsOf = (nowMs, M) => { if (RS && RS.v === M.version && nowMs - RS.at < 10 * 60e3) return RS; const R = runs(); RS = { at: nowMs, v: M.version, R, set: residualSet(nowMs, M, R) }; return RS; };
  const esat = (t) => 6.112 * Math.exp(17.62 * t / (243.12 + t));
  const r1 = (v) => Math.round(v * 10) / 10;
  function follow41(o, i, T0, T1) { const get = (k) => (i == null ? o[k] : (Array.isArray(o[k]) ? o[k][i] : undefined)), set = (k, v) => { if (i == null) o[k] = v; else o[k][i] = v; };
    const rh = get('relative_humidity_2m'); if (fin(rh)) set('relative_humidity_2m', Math.round(Math.max(1, Math.min(100, rh * esat(T0) / esat(T1))) * 10) / 10);
    const td = get('dew_point_2m'); if (fin(td) && td > T1) set('dew_point_2m', T1);
    const ap = get('apparent_temperature'); if (fin(ap)) set('apparent_temperature', r1(ap + (T1 - T0))); }
  function serveOn(M) { return process.env.NIGRAAN_EWS_SERVE !== '0' && !!M && M.live === true && M.servingHook === SERVE_HOOK; }
  /* v91.17.283.46 · the anchor never moves a served hour by more than the live readings ever departed from the served forecast (the
     existing screen's residual range, data/fleet-range-screen.json residual [min, max], data-derived); a larger move is not applied */
  let RR = null, rrAt = 0;
  function inResidualRange(d) { if (!RR || now() - rrAt > 600e3) { rrAt = now(); try { RR = JSON.parse(readFileSync(join(dataDir, 'fleet-range-screen.json'), 'utf8')).residual || null; } catch (_) { RR = null; } }
    return !(RR && fin(RR.min) && fin(RR.max)) || (d >= RR.min && d <= RR.max); }
  function serve(loc, lat, lon, nowMs = now()) {
    const M = loadAnchorModel(dataDir); if (!serveOn(M) || !loc || !fin(lat) || !fin(lon)) return false;
    if (loc.agn_hyperlocal && loc.agn_hyperlocal.applied) return false;
    const S0 = rsOf(nowMs, M); if (!S0.set.rows.length) return false;
    const a = anchorAt(M, S0.set.rows, lat, lon, nowMs); if (!a.applied || !fin(a.raw)) return false;
    const uid = uidOf(lat, lon); const elev = heightOf(lat, lon, fin(loc.elevation) ? loc.elevation : null); if (!uid) return false;
    /* v91.17.283.47 (NIGRAAN 1.0.8.2) · 2 Nov 2026 11:00 PKT: Skardu 12:00 16.5 -> 13:00 24.3 -> 14:00 19.7, Mulkhow 08:00 0.8 -> 09:00 11.7.
       Cause: the hour was REPLACED by (national basis + residual) at that hour, so the served curve took the shape of a different series (the
       national tehsil run, which for the run of 10:22 PKT still carried the 1.0.8 feedback values), and the 1.0.8.1 per-hour range gate then
       applied some hours and skipped others; the window also began with a full-weight step one hour before the newest reading.
       Now: the kriged residual is ADDED to the served curve (T1 = T0 + w x residual, the MACH live layer's form), the whole anchor is applied
       or not applied at this point (residual inside the residual range of data/fleet-range-screen.json, else none), and the weight is
       continuous: 1 from one hour before the newest reading to the reading, falling linearly to 0 over fade_hours after it (as tested) and
       over fade_hours before it (so no step joins the past hours). The national run is never anchored (v283.46). */
    if (!inResidualRange(a.raw)) return false;
    const off = (loc.utc_offset_seconds || 0) * 1000, F = M.fade_hours * H; let n = 0;
    const wAt = (ms) => { const dt = ms - a.newestMs; if (dt > F) return null; if (dt > 0) return 1 - dt / F; if (dt >= -H) return 1; const back = -H - dt; return back >= F ? null : 1 - back / F; };
    const Hh = loc.hourly;
    if (Hh && Array.isArray(Hh.time) && Array.isArray(Hh.temperature_2m)) Hh.time.forEach((t, i) => {
      const ms = Date.parse(String(t).length <= 16 ? t + 'Z' : t) - off; const w = wAt(ms); if (w == null || !fin(Hh.temperature_2m[i])) return;
      const T0 = Hh.temperature_2m[i], T1 = r1(T0 + w * a.raw); if (T1 === T0) return; Hh.temperature_2m[i] = T1; follow41(Hh, i, T0, T1); n++; });
    const Cu = loc.current; if (Cu && fin(Cu.temperature_2m)) { const T0 = Cu.temperature_2m, T1 = r1(T0 + a.weight * a.raw); if (T1 !== T0) { Cu.temperature_2m = T1; follow41(Cu, null, T0, T1); n++; } }
    if (n) { try { const Dd = loc.daily; if (Hh && Dd && Array.isArray(Dd.time)) { const by = new Map(); Hh.time.forEach((t, i) => { const d = String(t).slice(0, 10); (by.get(d) || by.set(d, []).get(d)).push(Hh.temperature_2m[i]); });
        Dd.time.forEach((d, i) => { const v = by.get(String(d).slice(0, 10)); if (!v || v.length < 24 || v.some((x) => !fin(x))) return;
          if (Array.isArray(Dd.temperature_2m_max) && fin(Dd.temperature_2m_max[i])) Dd.temperature_2m_max[i] = r1(Math.max(...v));
          if (Array.isArray(Dd.temperature_2m_min) && fin(Dd.temperature_2m_min[i])) Dd.temperature_2m_min[i] = r1(Math.min(...v));
          if (Array.isArray(Dd.temperature_2m_mean) && fin(Dd.temperature_2m_mean[i])) Dd.temperature_2m_mean[i] = r1(v.reduce((x, y) => x + y, 0) / v.length); }); } } catch (_) {}
      try { Object.defineProperty(loc, 'agn_ewslive', { value: { applied: true, hours: n, rawC: r2(a.raw), weight: r2(a.weight), stations: a.n, nearestKm: a.nearestKm, model: M.version, hook: SERVE_HOOK }, enumerable: false, configurable: true, writable: true }); } catch (_) {} }
    return n > 0; }
  /* ══ v91.17.283.45 (NIGRAAN 1.0.8) · DEW-POINT ANCHOR, SHADOW ONLY (ews-anchor-td@1; RULES_EWSFULL_RETRAIN section B: PASS) ══════════
     Every hour, after the E1 temperature line: each EWS station's hourly mean of the previous complete hour (QC'd 10-minute readings of its
     temperature channel and humidity channel, ewsanchor.mjs ewsChannels: 'Air Temperature' else 'Air Temperature THS', 'Relative Humidity'
     else 'Relative Humidity THS'; the Hukseflux radiometer channel never), dew point by Magnus 17.67 / 243.5 (RH clipped to 1-100, as
     tested), the served basis Td from the served national tehsil run's temperature and humidity at that hour (unadjusted; the station and
     served heights are logged), residual = obs - served; the simple-kriged residual (data/ews-live-anchor-td.json variogram: exponential,
     covariance psill exp(-d / a_km), nugget on the diagonal, radius_km, maxNeighbours, exclude_within_km, fade_hours; the tested form) at
     every tehsil's served point. One gzip member per hour in data/archive/ewsanchor-td/ewstd_YYYY-MM.jsonl.gz. NEVER served: no answer,
     level, alert or report reads it. The served-basis score and the promotion rule (file "promotion") are the verification agent's, later.
     NIGRAAN_EWS_TD_SHADOW=0 switches it off. */
  const tdOn = () => process.env.NIGRAAN_EWS_TD_SHADOW !== '0';
  const TD = { ticks: 0, lastHour: null, lastError: null, last: null };
  const tdDir = opts.tdArchiveDir || join(dataDir, 'archive', 'ewsanchor-td'); const tdState = join(tdDir, 'state.json');
  let TST = { version: 1, lastHour: null, committed: {} }; try { TST = { ...TST, ...JSON.parse(readFileSync(tdState, 'utf8')) }; } catch (_) {}
  const tdOf = (t, rh) => { if (!fin(t) || !fin(rh)) return null; const g = Math.log(Math.min(100, Math.max(1, rh)) / 100) + 17.67 * t / (t + 243.5); return 243.5 * g / (17.67 - g); };
  function loadTdModel() {
    let m = null; try { m = JSON.parse(readFileSync(join(dataDir, 'ews-live-anchor-td.json'), 'utf8')); } catch (_) { return null; }
    const V = m && m.variogram; if (!V || !fin(V.nugget) || !fin(V.psill) || !fin(V.a_km) || !fin(m.radius_km) || !fin(m.fade_hours)) return null;
    /* anchorAt's covariance is psill exp(-3 d / range_km): the tested psill exp(-d / a_km) is range_km = 3 a_km; min_stations 1 (the test
       kriged with any neighbour) */
    return { version: m.version, variogram: { nugget: V.nugget, psill: V.psill, range_km: 3 * V.a_km }, radius_km: m.radius_km, maxNeighbours: m.maxNeighbours, exclude_within_km: m.exclude_within_km, fade_hours: m.fade_hours, min_stations: 1 };
  }
  function readTRH(cd, fromMs, toMs) {
    const ch = ewsChannels(cd); const accT = (id, el) => (ch.T.size ? (ch.T.get(String(id)) ? el === ch.T.get(String(id)) : el === EWS_ELEMENT) : el === EWS_ELEMENT);
    const accR = (id, el) => (ch.RH.size ? (ch.RH.get(String(id)) ? el === ch.RH.get(String(id)) : el === 'Relative Humidity') : el === 'Relative Humidity');
    const out = []; const raw = join(cd, 'data', 'pmd', 'ews_live', 'raw');
    for (let t = Math.floor(fromMs / 864e5) * 864e5; t <= toMs; t += 864e5) {
      const f = join(raw, 'ews_raw_' + new Date(t).toISOString().slice(0, 10).replace(/-/g, '') + '.csv.gz'); if (!existsSync(f)) continue;
      let txt = ''; try { const b = readFileSync(f); txt = (b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b) : b).toString('utf8'); } catch (_) { continue; }
      const lines = txt.split(/\r?\n/); const head = splitCsvLine((lines.shift() || '').replace(/^﻿/, '')).map((h) => h.trim());
      const ix = (n) => head.indexOf(n); const iv = ix('value'), it = ix('time_utc'), is = ix('station_id'), ie = ix('element'); if (iv < 0 || it < 0 || is < 0 || ie < 0) continue;
      const by = new Map();
      for (const l of lines) { if (!l) continue; const c = splitCsvLine(l); const isT = accT(c[is], c[ie]), isR = !isT && accR(c[is], c[ie]); if (!isT && !isR) continue;
        const ms = utcMs(c[it]); const v = c[iv] === '' ? NaN : Number(c[iv]); if (!fin(ms) || !fin(v) || ms < fromMs || ms > toMs) continue;
        const k = c[is] + '|' + ms; const o = by.get(k) || by.set(k, { id: String(c[is]), ms }).get(k); if (isT) o.T = v; else o.RH = v; }
      for (const o of by.values()) out.push(o); }
    return out;
  }
  function computeTd(nowMs = now()) {
    const M = loadTdModel(); const hEnd = Math.floor(nowMs / H) * H, h0 = hEnd - H;
    if (!M) return { hourMs: h0, rows: [], u: {}, why: 'no dew-point model file (data/ews-live-anchor-td.json)' };
    const cat = ewsStations(); if (!cat) return { hourMs: h0, rows: [], u: {}, why: 'no copy of the partner station catalogue' };
    const all = readTRH(copiesDir(), h0 - 24 * H, hEnd - 1);
    let bad = new Map(); try { bad = seriesRows(all, (r) => r.id, (r) => ({ ms: r.ms, T: r.T, RH: r.RH }), (k) => { const s = cat.get(k); return s ? { lat: s.lat, lon: s.lon, elev: s.elevM, net: 'aws', pid: 'aws:' + s.name } : null; }, loadParams(dataDir)); } catch (_) { bad = new Map(); }
    const acc = new Map();
    for (const r of all) { if (r.ms < h0 || r.ms >= hEnd) continue; const f = (bad.all && bad.all.get(r)) || null; const tOk = fin(r.T) && !(f && f.T), rOk = fin(r.RH) && !(f && f.RH);
      const a = acc.get(r.id) || acc.set(r.id, { t: [], rh: [] }).get(r.id); if (tOk) a.t.push(r.T); if (rOk) a.rh.push(r.RH); }
    const R = runs(); const rows = []; let noBasis = 0;
    for (const [id, a] of acc) { const s = cat.get(id); if (!s || !a.t.length || !a.rh.length) continue;
      const T = a.t.reduce((x, y) => x + y, 0) / a.t.length, RH = a.rh.reduce((x, y) => x + y, 0) / a.rh.length; const obs = tdOf(T, RH);
      let sv = null, sel = null, run = null; for (const rr of R) { const f = rr.by.get(s.uid); if (!f || !f.RH) continue; const i = Math.round((h0 - f.t0) / H); if (i < 0 || i >= f.T.length) continue; const v = tdOf(f.T[i], f.RH[i]); if (v == null) continue; sv = v; sel = f.sel; run = rr.id; break; }
      if (sv == null || obs == null) { noBasis++; continue; }
      rows.push({ id, name: s.name, lat: s.lat, lon: s.lon, elevM: s.elevM, uid: s.uid, obsMs: hEnd, obs, served: sv, sel, res: obs - sv, run, nT: a.t.length, nRH: a.rh.length }); }
    const u = {}; let nU = 0;
    if (rows.length) for (const rr of R.slice(0, 1)) for (const [uid, f] of rr.by) { const a = anchorAt(M, rows, f.lat, f.lon, hEnd); if (!a.applied) continue; u[uid] = [r2(a.dT), a.n]; nU++; }
    return { hourMs: h0, model: M.version, rows, u, tehsils: nU, noBasis, stationsWithReadings: acc.size, why: rows.length ? null : acc.size ? 'no served dew-point basis for the stations reporting' : 'no EWS temperature and humidity reading in the last complete hour' };
  }
  function tickTd(at) {
    if (!tdOn()) return { ok: false, why: 'switched off (NIGRAAN_EWS_TD_SHADOW=0)' };
    const c = computeTd(at); const hk = new Date(c.hourMs).toISOString().slice(0, 13); if (TST.lastHour === hk) return { ok: true, skipped: hk };
    const text = JSON.stringify({ h: hk, at: new Date(at).toISOString(), v: c.model || null, why: c.why || null, shadow: true, served: false,
      r: c.rows.map((x) => [x.name, x.id, x.lat, x.lon, r2(x.elevM), x.uid, r2(x.obs), r2(x.served), r2(x.sel), x.nT, x.nRH]), u: c.u, n: { stations: c.stationsWithReadings || 0, noBasis: c.noBasis || 0, tehsils: c.tehsils || 0 } });
    mkdirSync(tdDir, { recursive: true }); const rel = 'ewstd_' + hk.slice(0, 7) + '.jsonl.gz'; const f = join(tdDir, rel); const buf = gzipSync(Buffer.from(text + '\n', 'utf8'), { level: 9 });
    const want = TST.committed[rel] || 0; let size = 0; try { size = statSync(f).size; } catch (_) { size = 0; } if (size > want) truncateSync(f, want);
    const fd = openSync(f, 'a'); try { writeSync(fd, buf); fsyncSync(fd); } finally { closeSync(fd); }
    TST.committed[rel] = Math.min(size, want) + buf.length; TST.lastHour = hk; try { const t = tdState + '.tmp'; writeFileSync(t, JSON.stringify(TST)); renameSync(t, tdState); } catch (_) {}
    TD.ticks++; TD.lastHour = hk; TD.lastError = null; TD.last = { hour: hk, stations: c.rows.length, tehsils: c.tehsils || 0, why: c.why || null }; return { ok: true, ...TD.last };
  }
  function status() { const M = loadAnchorModel(dataDir);
    return { tdShadow: { on: tdOn(), ...TD, rule: 'SHADOW: dew-point anchor (ews-anchor-td@1) computed every hour and archived in data/archive/ewsanchor-td; never served, never changes a level, alert or report' }, on: on(), mode: M ? M.mode : null, live: M ? M.live === true : null, servingHook: M ? M.servingHook || null : null, serving: serveOn(M), version: M ? M.version : null, ...S,
      rule: 'shadow only: computed every hour beside the served value and archived (data/archive/ewsanchor); never added to a served value; scored daily by the verification agent' }; }
  if (opts.timers !== false && process.env.NIGRAAN_WORKER !== '0' && on()) schedule(app, 'ews-shadow', H, (r) => tick(r), { firstMs: 5 * 60e3, label: 'EWS live anchor, shadow (hourly; archived, never served)' });
  return { tick, tickTd, computeTd, compute, at, status, serve, serveOn: () => serveOn(loadAnchorModel(dataDir)), SERVE_HOOK, residualSet: (ms) => { const M = loadAnchorModel(dataDir); return M ? residualSet(ms ?? now(), M, runs()) : { rows: [], why: 'no model file' }; } };
}
