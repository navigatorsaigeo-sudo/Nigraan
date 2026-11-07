import { capped } from './capcount.mjs';
import { createPointHeight } from './pointheight.mjs';   /* v91.17.101 */
/* ══ v91.17.57 · THE MACH FLEET, READ INTO NIGRAAN ══════════════════════════════════════════════════════
   AGN's own personal-weather-station network (mach.aigeo360.com, 104 stations) is the calibration source the
   platform owns outright: no third-party portal, no terms, 10-minute readings. This module polls the fleet's
   latest-reading route, applies the quality screen MEASURED on the 23 Sep 2026 snapshot, keeps the good readings
   as observation rows in the station lake, and serves them to the dashboard.

   MEASURED on that snapshot (104 stations): 28 silent since late July but still listed online; 25 stations whose
   "latest" was another station's record with a fresh timestamp (the sheet-to-station fallback), 11 stations in
   °F / inHg / mph passed through unconverted, 27 readings failing physics (RH 1 %, dew point above air temperature,
   dew point 689 °C). 25 of 104 were usable. Every one of those failures is screened here, so nothing downstream
   learns Islamabad's weather for Nokundi.

   Credentials: fleet.key beside mach.key —
       base=https://mach.aigeo360.com
       token=<dashboard api token>
   The token is sent as a bearer header to the fleet's own host only; it is never logged, never served, never
   placed in a URL. The latest-reading route answered without a token on 23 Sep 2026; the token is carried for
   the routes that need it. NIGRAAN_FLEET=0 switches the poll off. */
import { readFileSync, existsSync, mkdirSync, appendFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createFeatGrid } from './featgrid.mjs';   /* v91.17.79 · station height for the pressure check */
import { dewPointC } from './psychro.mjs';
import { computeOffsets } from './sitingoffsets.mjs';   /* v91.17.186 · live-layer siting offsets */
import { schedule } from './scheduler.mjs';
import { ownPath, OWN } from './ownpaths.mjs';   /* v283.44 hotfix: the series screen starts from NIGRAAN's own MACH record */
import { pktDay } from './pktday.mjs';
import { arraySilent } from './stuckscreen.mjs';
import * as QC from './obsqc.mjs';   /* v91.17.283.14 · value-level quality control: the one place every observation value is judged */
import { judgeShield } from './shieldscreen.mjs';   /* v91.17.283 · WS2 item 8 */   /* v91.17.272 · hotfix: stuck / replayed readings */
import { machRainHolds } from './rainholds.mjs';   /* v283.31 · owner 9.5 */

const POLL_MS = 10 * 60 * 1000;
const FRESH_MIN = 60;
const magnus = (T, rh) => (T == null || rh == null || rh <= 0) ? null : dewPointC(T, rh);   /* v91.17.128 · the one psychrometric module (a dew point above the air temperature is clamped to it) */
/* the history screen of one database reading (v91.17.267 the past-30-days record, past30parse.mjs): null when the temperature fails;
   a failing humidity, dew point or pressure is null, the temperature kept. v91.17.283.14: the checks are obsqc.mjs's (readingQc). */
export function histQc(m) { return QC.readingQc(m); }

/* v91.17.283.26 · the one rule for a reading a customer may see: it passed the value checks (usable, with a temperature), its station's check
   passed (status 'checked'), and it was compared with the served forecast at its hour (bgChecked) */
/* == v91.17.283.49 · 1.0.10 data item 4 · A POLL IN WHICH NO STATION RETURNED A READING IS A FAILED POLL ===============================
   Laptop 2 Nov 2026 (server-console.log, 15:12-15:55 PKT): the MACH database call failed on alternate polls; the per-station fallback (the
   retired API path) then returned no reading for any of the 108 stations ("0/108 usable (0 from sheet tabs, 108 from the API) · dead 108,
   noReading 108") and that empty poll REPLACED the last good poll, so the place record of 15:54 read "0 reporting now within 25 km · 0 of
   108" while the stations were reporting (the next database poll had 52-55 usable). Rule: a poll is a station answer only when at least one
   station returned a reading; a poll with none keeps the previous good poll and records the failure. When the last good poll is older than
   the live window (FRESH_MIN, the poll's own 'dead' rule) every surface says "station data unavailable since HH:MM" instead of counting
   stations as offline, and no reading is counted as reporting now. */
export const anyReading = (rows) => Array.isArray(rows) && rows.some((r) => r && r.lastUpdated && Number.isFinite(Date.parse(r.lastUpdated)) && (r.tempC != null || r.rhPct != null || r.windKmh != null));
export function feedOf(feed, nowMs = Date.now()) {
  const good = feed && feed.lastGoodAt ? Date.parse(feed.lastGoodAt) : NaN;
  const fresh = Number.isFinite(good) && nowMs - good <= FRESH_MIN * 60e3;
  const hm = Number.isFinite(good) ? new Date(good + 5 * 3600e3).toISOString().slice(11, 16) : null;
  const unavailable = !fresh && !!(feed && (feed.lastFailAt || feed.lastGoodAt == null));
  return { ok: fresh, lastGoodAt: feed && feed.lastGoodAt || null, lastFailAt: feed && feed.lastFailAt || null, failWhy: feed && feed.failWhy || null,
    ...(unavailable ? { unavailableSince: feed && feed.lastGoodAt || null, text: hm ? 'station data unavailable since ' + hm + ' PKT' : 'station data unavailable (no station reading received since the server started)' } : {}),
    rule: 'a poll with no station reading keeps the last good poll; older than ' + FRESH_MIN + ' min the station data is unavailable (no station counts as reporting now)' };
}
export const customerRow = (x) => !!x && x.usable === true && x.usableTemperature === true && x.status === 'checked' && x.bgChecked === true && Number.isFinite(x.tempC);
export function createFleet(app, root, dataDir) {
  const state = { configured: false, base: null, stations: [], last: null, lastAt: null, polls: 0, errors: 0, lastError: null, usable: 0, screened: {}, lakeFile: null };
  let token = null;
  try {
    const f = join(root, 'fleet.key');
    if (existsSync(f)) {
      for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*(\w+)\s*=\s*(.+?)\s*$/); if (!m) continue;
        if (m[1] === 'base') state.base = m[2].replace(/\/$/, '');
        if (m[1] === 'token') token = m[2];
      }
      state.configured = !!state.base;
    }
  } catch (e) { state.lastError = 'fleet.key: ' + e.message; }
  /* v91.17.182 · AGN's own MACH observation database (mach-obs-api, PostgreSQL + TimescaleDB, refreshed every 10 minutes). One call
     returns every station's latest reading in metric units with the station's own key, so the per-station sheet / API reads become
     the fallback. Credentials: obs.key beside mach.key (base=..., key=...); the key is sent only as the X-API-Key header to that
     host, never logged, served or put in a URL. NIGRAAN_FLEET_DB=0 goes back to the per-station reads. */
  let obs = null;
  try {
    const f = join(root, 'obs.key');
    if (existsSync(f)) { const o = {}; for (const line of readFileSync(f, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) { const m = line.match(/^\s*(\w+)\s*=\s*(.+?)\s*$/); if (m) o[m[1]] = m[2]; }
      if (o.base && o.key) { obs = { base: o.base.replace(/\/$/, ''), key: o.key }; state.configured = true; } }
  } catch (e) { state.lastError = 'obs.key: ' + e.message; }
  state.db = { configured: !!obs, ok: null, at: null, updatedAt: null, stations: null, error: null };
  state.mach = null;   /* live MACH /v1/latest summary for the Observations cards (all DB stations, including Apple QM and airports) */
  const LIVE_DAY_MIN = 1440;   /* a station counts as live on the MACH cards when its newest reading is within the last 24 h */
  const machFamily = (provider) => {
    const p = String(provider || '').toLowerCase();
    if (p.startsWith('apple')) return 'apple_qm';
    if (p === 'wu' || p === 'wunderground') return 'wunderground';
    if (p === 'wu_api') return 'wu_api';
    if (p === 'ecowitt') return 'ecowitt';
    if (p === 'asos' || p === 'metar') return 'airport_asos';
    return p || 'other';
  };
  const machSummary = (list, updatedAt = null, nowMs = Date.now()) => {
    const by = {};
    let live24 = 0, online = 0, appleLive = 0;
    for (const s of (list || [])) {
      const fam = machFamily(s.provider);
      const age = s.ageMinutes != null && Number.isFinite(+s.ageMinutes)
        ? +s.ageMinutes
        : (s.time ? (nowMs - Date.parse(s.time)) / 60000 : null);
      const isLive = age != null && Number.isFinite(age) && age <= LIVE_DAY_MIN;
      const isOn = s.online === true;
      if (!by[fam]) by[fam] = { total: 0, live24: 0, online: 0 };
      by[fam].total += 1;
      if (isLive) { by[fam].live24 += 1; live24 += 1; if (fam === 'apple_qm') appleLive += 1; }
      if (isOn) { by[fam].online += 1; online += 1; }
    }
    const total = (list || []).length;
    return {
      total, live24, online, offline24: Math.max(0, total - live24), appleLive, appleTotal: by.apple_qm?.total || 0,
      byProvider: by, windowMin: LIVE_DAY_MIN, updatedAt: updatedAt || null,
      label: 'Weather stations with a reading in the last 24 h (live database)',
      note: 'Counts every station the MACH database returns: Wunderground, WU API, Ecowitt, airport ASOS and Apple QM. Apple QM is a forecast product and is not used to correct the served forecast.',
    };
  };
  /* ══ v91.17.283.14 · NO STATION IS DROPPED HERE (owner decision 24 Oct 2026 08:29 PKT) ═══════════════════════════════════════════
     Until v91.17.283.13 a station the registry excluded (duplicate / mixup / site / indoor) or data/station-holds.json held was never a
     checked station, a neighbour, a live-layer reading or the "observed nearby" station. Now every value is judged by obsqc.mjs and
     only a failing value is dropped. The registry's identity record (a feed carrying another station's device: "identity": { kind,
     of }) is read only to say which of two identical values is the copy (obsqc copyCheck). data/station-holds.json is history. */
  const COPYOF = new Map();
  try {
    const reg = JSON.parse(readFileSync(join(dataDir, 'mach-fleet-stations.json'), 'utf8'));
    state.stations = (reg.stations || []).filter(s => s.key && s.lat != null && s.lon != null);
    /* v91.17.128 · U-12 · the fleet is every registered station; a station without a recorded position cannot be placed or paired,
       so it is counted, not hidden (2 Karachi stations in Oct 2026) */
    state.registered = (reg.stations || []).filter(s => s.key).length;
    for (const s of (reg.stations || [])) { const x = s.identity; if (s.key && x && x.of && (x.kind === 'duplicate' || x.kind === 'mixup')) COPYOF.set(String(s.key), String(x.of)); }
  } catch (e) { state.lastError = 'mach-fleet-stations.json: ' + e.message; }
  let QCP = null; try { QCP = QC.loadParams(dataDir); } catch (e) { state.lastError = 'obs-qc-params.json: ' + e.message; }
  state.qc = { at: null, counts: null, params: QCP ? QCP.version : null }; state.rangeRejectedTotal = 0;
  /* v91.17.283 · WS2 item 8 · the shielded / stuck outdoor-sensor rule (shieldscreen.mjs, scripts/tests283/ws2/derive_shield.py) */
  let SHIELD_RULE = null; try { SHIELD_RULE = JSON.parse(readFileSync(join(dataDir, 'station-shield-rule.json'), 'utf8')).rule || null; } catch (_) { SHIELD_RULE = null; }
  const SHIELDED = new Map();   /* key -> { since, why } while a station's outdoor array reads shielded; cleared by its next clean daylight window */

  const num = (s) => { if (s == null) return null; const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };

  /* the quality screen. Kept here: what says a row is not a reading of this station now (dead > 60 min, no reading, a forecast product,
     another station's key answered, a time in the future) and the unit conversion of the sheet / API path. v91.17.283.14: every
     VALUE is then judged by obsqc.mjs (gross and climatological range, the station's own series, internal consistency, the copy check
     and the buddy / background check over this poll); a failing value is set to null on the row (its raw value in r.raw) and the
     row's other values stay. usable = the row is a current reading of this station and its temperature passes. */
  let _fg = null; const FG = () => _fg || (_fg = (app && app.featGrid) || createFeatGrid(dataDir, { maxBlocks: 16 }));
  const ZC = new Map();   /* key -> zone (the station's forecast zone; stable, cached) */
  const zoneAt = (r, z) => { const k = r.key + '|' + r.lat + '|' + r.lon; if (ZC.has(k)) return ZC.get(k); let v = null; try { v = app.mos && app.mos.zoneOfPoint ? app.mos.zoneOfPoint(r.lat, r.lon, z) : null; } catch (_) { v = null; } ZC.set(k, v); return v; };
  const elevAt = (r) => { const z = stElev(r); if (z != null) return z; try { return FG().value('t_elev', r.lat, r.lon); } catch (_) { return null; } };
  const VMAP = [['T', 'tempC'], ['Td', 'dewC'], ['RH', 'rhPct'], ['P', 'pressureHpa'], ['W', 'windKmh'], ['G', 'gustKmh'], ['S', 'solarWm2'], ['PR', 'precipRateMm']];
  function screen(rows) {
    const now = Date.now(); const counts = { dead: 0, imperial: 0, forecastNotStation: 0, noReading: 0 };
    const items = [];
    const RHOLD = (typeof machRainHolds === 'function' && typeof dataDir !== 'undefined') ? machRainHolds(dataDir).held : new Map();   /* v283.31 · owner 9.5: the rain channel of these stations is not used (other variables are) */
    for (const r of rows) {
      r.qc = []; r.bgChecked = false;
      if (RHOLD.has(r.key)) { r.rainHeld = 'rain channel held: ' + RHOLD.get(r.key); r.precipRateMm = null; r.precipTotalMm = null; }
      const t = r.lastUpdated ? Date.parse(r.lastUpdated) : NaN; r.ageMin = isNaN(t) ? null : Math.round((now - t) / 60000);
      if (r.ageMin == null || r.ageMin > FRESH_MIN) { r.qc.push('dead'); counts.dead++; }
      if (r.tempC == null) { r.qc.push('no-reading'); counts.noReading++; }
      if (r.source === 'apple') { r.qc.push('forecast-not-station'); counts.forecastNotStation++; }
      if (r.returnedKey && r.returnedKey !== r.key) { r.qc.push('wrong-station'); counts.wrongStation = (counts.wrongStation || 0) + 1; }
      /* v91.17.68 · a Fahrenheit station with no pressure and a reading in 32-60 was passing as Celsius (audit C12). The forecast the
         pairing already holds for the station is the tell: when the reading is more than 12 °C from the served forecast hour and its
         Fahrenheit-to-Celsius conversion is within 4 °C of it, the station reports Fahrenheit. No forecast held → no conversion, and
         the station is flagged units-unverified rather than passed. */
      const f = fc.get(r.key); const obsMs = Number.isFinite(t) ? t : NaN; const h = (f && Number.isFinite(obsMs)) ? f.hours.get(new Date(Math.round(obsMs / 3600e3) * 3600e3).toISOString().slice(0, 13)) : null;
      let fTell = false, fUnverified = false;
      if (r.pressureHpa == null && r.tempC != null && r.tempC >= 32 && r.tempC <= 60) {
        const ref = h && (h.served ?? h.raw); if (ref == null) fUnverified = true;
        else { const asC = (r.tempC - 32) * 5 / 9; fTell = Math.abs(r.tempC - ref) > 12 && Math.abs(asC - ref) <= 4; }
      }
      if (fUnverified && (r.source === 'sheet' || r.fromDb)) fUnverified = false;   /* v91.17.80 · a sheet cell carries its unit (°C / F); it was converted as read */
      if (fUnverified) { r.qc.push('units-unverified'); counts.unitsUnverified = (counts.unitsUnverified || 0) + 1; }
      const imperial = !r.fromDb && ((r.pressureHpa != null && r.pressureHpa < 40) || (r.tempC != null && r.tempC > 60) || fTell);
      if (imperial) {
        if (r.tempC != null) r.tempC = (r.tempC - 32) * 5 / 9; if (r.dewC != null) r.dewC = (r.dewC - 32) * 5 / 9;
        if (r.pressureHpa != null) r.pressureHpa *= 33.8639; if (r.windKmh != null) r.windKmh *= 1.609344; if (r.gustKmh != null) r.gustKmh *= 1.609344;
        /* v91.17.147 · audit M7 · rain in inches too (in/h and in) */
        if (r.source !== 'sheet') { if (r.precipRateMm != null) r.precipRateMm *= 25.4; if (r.precipTotalMm != null) r.precipTotalMm *= 25.4; }
        r.qc.push('imperial-converted'); counts.imperial++;
      }
      if (r.ageMin != null && r.ageMin < -FRESH_MIN) { r.qc.push('future-time'); counts.futureTime = (counts.futureTime || 0) + 1; state.rangeRejectedTotal++; }
      if (!QCP || r.tempC == null || r.qc.some((q) => q !== 'imperial-converted')) continue;
      /* the values of a current reading of this station, judged by obsqc.mjs */
      const q = { ms: obsMs }; for (const [v, k] of VMAP) q[v] = Number.isFinite(r[k]) ? r[k] : null;
      if (r.seriesF) q.f = { ...r.seriesF }; else if (r.stuck) QC.applySeriesVerdict(q, r.stuck);   /* the station's own series (stuckLive / the copy path) */
      if (SHIELDED.has(r.key)) { QC.applySeriesVerdict(q, 'shielded-array'); r.shieldWhy = SHIELDED.get(r.key).why; }
      const elev = elevAt(r);
      QC.markCheck('mach:' + r.key, q, QCP); QC.grossCheck(q, QCP, { bgT: h ? (h.served ?? h.raw) : null }); QC.internalCheck(q, QCP, elev);
      r.bgChecked = !!(h && Number.isFinite(h.served ?? h.raw));   /* v91.17.283.26 · the reading was compared with the served forecast at its hour (the residual screen ran) */
      items.push({ pid: 'mach:' + r.key, key: r.key, lat: r.lat, lon: r.lon, elev, zone: zoneAt(r, elev), r: q, bg: h ? { T: h.raw, RH: h.rh, W: h.wind } : null, row: r, fineT: true });
    }
    const copyOf = new Map([...COPYOF].map(([k, o]) => ['mach:' + k, 'mach:' + o]));
    /* v91.17.68 · a duplicate record group is resolved by the FRESHEST timestamp (audit C11); v91.17.80 · the sheet tab is the original */
    const prefer = (a, b) => { const sa = a.row.source === 'sheet', sb = b.row.source === 'sheet'; if (sa !== sb) return sa ? a : b; return a.r.ms > b.r.ms ? a : b.r.ms > a.r.ms ? b : a; };
    try { if (QCP) QC.qcCross(items, QCP, { copyOf, prefer }); } catch (e) { state.lastError = 'quality control: ' + e.message; }
    const failed = {};
    for (const it of items) { const r = it.row, F = it.r.f || {}; r.qcv = F; r.raw = {};
      for (const [v, k] of VMAP) if (F[v]) { r.raw[k] = r[k]; r[k] = null; const tk = v + ':' + F[v].test; failed[tk] = (failed[tk] || 0) + 1; if (F[v].test === 'gross-range' || F[v].test === 'climate-range') state.rangeRejectedTotal++; }
      if (F.T) { r.qc.push('value-failed'); r.tempWhy = F.T; }
      if (F.T && F.T.test === 'copy') r.mirrorOf = F.T.of || null; }
    /* v91.17.283.29 · W5 · a zero wind with no humidity is the outdoor sensor suite not transmitting (the hygrometer and the anemometer
       are one outdoor unit on these stations), so the zero is a fill, not a calm: the wind and gust are withheld, never served as 0 */
    for (const r of rows) { if (r.rhPct == null && r.windKmh === 0 && (r.gustKmh == null || r.gustKmh === 0)) { r.raw = r.raw || {}; r.raw.windKmh = r.windKmh; r.windKmh = null; if (r.gustKmh === 0) { r.raw.gustKmh = 0; r.gustKmh = null; }
      r.windWhy = { test: 'no-outdoor-unit', why: 'wind 0 with no humidity: the outdoor unit is not sending, so the zero is not a measured calm' }; failed['W:no-outdoor-unit'] = (failed['W:no-outdoor-unit'] || 0) + 1; } }
    counts.values = failed;
    for (const r of rows) r.usable = r.qc.filter(q => q !== 'imperial-converted').length === 0 && r.tempC != null;
    state.qc = { at: new Date(now).toISOString(), counts: failed, params: QCP ? QCP.version : null };
    return counts;
  }

  /* ══ v91.17.80 · READ EACH STATION FROM ITS OWN SHEET TAB ══════════════════════════════════════════════════════════════
     28 Sep: the platform API served 23 stations another station's record; every one of the 23 held its own, different reading in
     its Google Sheet tab. The copying is in the API layer. data/mach-sheets.json maps station key -> (sheet, tab); the newest
     non-empty row of the tab is read through the sheet's public query endpoint (a few hundred bytes per station). The API is the
     fallback for keys with no tab, and for any tab that does not answer. Units are converted from the unit written in the cell. */
  let SHEETS = new Map();
  try { const sj = JSON.parse(readFileSync(join(dataDir, 'mach-sheets.json'), 'utf8')); for (const x of (sj.stations || [])) SHEETS.set(x.key, x); } catch (_) { SHEETS = new Map(); }
  state.sheetsMapped = SHEETS.size;
  function csvRows(t) { const out = []; let row = [], cur = '', q = false;
    for (let i = 0; i < t.length; i++) { const c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur); out.push(row); row = []; cur = ''; } else if (c !== '\r') cur += c; }
    if (cur !== '' || row.length) { row.push(cur); out.push(row); } return out; }
  const tempC = (v) => { const x = num(v); if (x == null) return null; return /\bF\b|°F/.test(String(v)) ? (x - 32) * 5 / 9 : x; };
  const presH = (v) => { const x = num(v); if (x == null) return null; return /\bin\b|inHg/i.test(String(v)) ? x * 33.8639 : x; };
  const speedK = (v) => { const x = num(v); if (x == null) return null; return /mph/i.test(String(v)) ? x * 1.609 : x; };
  const rainM = (v) => { const x = num(v); if (x == null) return null; return /\bin\b/i.test(String(v)) ? x * 25.4 : x; };
  async function fetchSheet(st, m) {
    const tq = encodeURIComponent('select * order by A desc limit 40');
    const url = 'https://docs.google.com/spreadsheets/d/' + m.book + '/gviz/tq?tqx=out:csv&headers=1&sheet=' + encodeURIComponent(m.tab) + '&tq=' + tq;
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error('sheet HTTP ' + r.status);
    const rows = csvRows(await r.text()); if (rows.length < 2) throw new Error('sheet empty');
    const h = rows[0].map(x => x.trim()); const ix = (n) => h.indexOf(n);
    /* v91.17.80 · the sheet writer stamps the hour after midnight as T24:mm on the same date (measured 28 Sep: I-8 "2026-09-28T24:52:30+05:00"
       at 24.7 °C / 79 %, a night reading). Read as T00:mm; rows are ordered by parsed time, not by the text, so these rows no longer
       sort above the afternoon's readings. */
    const fixTs = (t) => String(t || '').replace(/T24:/, 'T00:');
    const iT = ix('timestamp_iso'), iTemp = ix('temperature');
    const cand = rows.slice(1).filter(x => x[iTemp] && num(x[iTemp]) != null).map(x => ({ x, ms: Date.parse(fixTs(x[iT])) })).filter(o => Number.isFinite(o.ms) && o.ms <= Date.now() + 10 * 60e3).sort((a, b) => b.ms - a.ms);
    if (!cand.length) throw new Error('sheet has no reading with a temperature');
    const rec = cand[0].x; rec[iT] = new Date(cand[0].ms).toISOString();
    const g = (n) => (ix(n) >= 0 ? rec[ix(n)] : null);
    return { key: st.key, name: st.name, no: st.no, lat: st.lat, lon: st.lon, lastUpdated: g('timestamp_iso') || null, source: 'sheet',
      tempC: tempC(g('temperature')), rhPct: num(g('humidity')), dewC: tempC(g('dew_point')), windKmh: speedK(g('speed')), windDir: g('wind') || null, gustKmh: speedK(g('gust')),
      pressureHpa: presH(g('pressure')), precipRateMm: rainM(g('precip_rate')), precipTotalMm: rainM(g('precip_total')), uv: num(g('uv')), solarWm2: num(g('solar')),
      returnedKey: st.key, sheetTab: m.tab };
  }
  /* v91.17.200 → 201 · FALLBACK ORDER. Since the database migration (Oct 2026) the stations' Google Sheet tabs are no longer
     written, so with the database API down the sheet-first fallback returned 9-12 usable stations of 107 (8 Oct, 12:30 PKT) while
     the platform's own latest route still answered fresh readings for 29. Both are read now and the NEWER reading of the two is
     kept (the same station key; the platform route's wrong-key answer is still caught by returnedKey in the screen). */
  /* v91.17.202 · MACH moved from Google Sheets to its SQL database (Oct 2026): the sheet tabs are no longer written, so they are no
     longer read (NIGRAAN_FLEET_SHEETS=1 reads them again). Order: the database API, then the platform's latest route per station. */
  const tOf = (r) => { const t = r && r.lastUpdated ? Date.parse(r.lastUpdated) : NaN; return Number.isFinite(t) ? t : -Infinity; };
  async function fetchOne(st) {
    const m = SHEETS.get(st.key);
    const pApi = fetchApi(st).catch((e) => ({ error: e.message }));
    let sh = null;
    if (m && process.env.NIGRAAN_FLEET_SHEETS === '1') { try { sh = await fetchSheet(st, m).catch(() => fetchSheet(st, m)); } catch (e) { state.sheetErrors = (state.sheetErrors || 0) + 1; state.lastSheetError = st.key + ': ' + e.message; } }
    const api = await pApi;
    const apiOk = api && !api.error && api.returnedKey === st.key;
    if (apiOk && sh) return tOf(api) >= tOf(sh) ? api : sh;
    if (apiOk) return api;
    if (sh) return sh;
    if (api && !api.error) return api;   /* wrong key: returned so the screen records why it is dropped */
    throw new Error(api && api.error ? api.error : 'no reading');
  }
  async function fetchApi(st) {
    const url = state.base + '/api/weather/latest?location=' + encodeURIComponent(st.key) + '&timezone=Asia%2FKarachi';
    const headers = { accept: 'application/json' }; if (token) headers.authorization = 'Bearer ' + token;
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return { key: st.key, name: st.name, no: st.no, lat: st.lat, lon: st.lon, lastUpdated: j.lastUpdated || null, source: j.dataSource || null,
      tempC: num(j.temperature), rhPct: num(j.humidity), dewC: num(j.dewPoint), windKmh: num(j.speed), windDir: j.wind || null, gustKmh: num(j.gust),
      pressureHpa: num(j.pressure), precipRateMm: num(j.precipRate), precipTotalMm: num(j.precipTotal), uv: num(j.uv), solarWm2: num(j.solar),
      /* v91.17.79 · the platform answers an unknown key with I-8's reading and HTTP 200 (measured 28 Sep: location=zzz_not_a_station
         → stationKey mach1). The key it answered for is kept and checked. */
      returnedKey: j.stationKey || null, sheetSyncedAt: j.sheetSyncedAt || null };
  }

  /* v91.17.182 · every registered station from the database in one call. The database's metric values are taken as stated
     (unitsKnown: the °F / inHg / mph test does not apply). Provider "apple_qm" rows are marked source 'apple' so the existing rule
     holds: an Apple reading is a forecast product, not a station (6 Oct 2026: those 15 rows read 600-716 W/m2 sunshine with rain
     falling, four Rawalpindi sites the identical 696.0 W/m2, beside station neighbours at 130-350 W/m2). NIGRAAN_FLEET_APPLE=1 keeps them. */
  async function fetchDb() {
    const r = await fetch(obs.base + '/v1/latest', { headers: { accept: 'application/json', 'x-api-key': obs.key }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error('database HTTP ' + r.status);
    const j = await r.json(); const list = j.stations || []; const by = new Map(list.map(s => [String(s.key), s]));
    state.db.updatedAt = j.updatedAt || null; state.db.stations = list.length;
    state.mach = machSummary(list, j.updatedAt || null);
    if (!by.size) throw new Error('database returned no stations');
    return state.stations.map(st => {
      const s = by.get(st.key); if (!s) return { key: st.key, name: st.name, no: st.no, lat: st.lat, lon: st.lon, lastUpdated: null, tempC: null, fromDb: true, source: 'db', returnedKey: st.key, why: 'not in the database' };
      const m = s.metrics || {}; const v = (x) => (x == null || !Number.isFinite(+x)) ? null : +x;
      const apple = /^apple/i.test(String(s.provider || '')) && process.env.NIGRAAN_FLEET_APPLE !== '1';
      return { key: st.key, name: st.name, no: st.no, lat: st.lat, lon: st.lon, lastUpdated: s.time || null, source: apple ? 'apple' : 'db', provider: s.provider || null, fromDb: true,
        tempC: v(m.temperatureC), rhPct: v(m.humidityPct), dewC: v(m.dewPointC), windKmh: v(m.windSpeedKmh), windDir: m.windDirectionText || null, gustKmh: v(m.windGustKmh),
        pressureHpa: v(m.pressureHpa), precipRateMm: v(m.precipRateMmHr), precipTotalMm: v(m.precipTotalMm), uv: v(m.uvIndex), solarWm2: v(m.solarWm2), returnedKey: String(s.key) };
    });
  }

  /* v91.17.283.28 · INDEPENDENCE FROM LAMHA (owner, 28 Oct 2026 11:10 PKT): the poll no longer reads LAMHA's MACH database copy
     (v91.17.260-269 "copy, not fetch", copies.mjs lamha_mach; retired with the copies). Every 10 minutes it asks the MACH database
     itself with NIGRAAN's own key (obs.key, fetchDb above: one /v1/latest request); the series screens run on the readings this
     process keeps (stuckLive). The complete record behind it is NIGRAAN's own (machdb.mjs: the 10-minute window into nig/own and
     station-lake/archive/fleet/db, the 6-hourly record run). state.copy stays null, copyPolls 0 (the operations route still lists them). */

  /* v91.17.272 · hotfix · the database API path returns only each station's newest reading: the poll keeps each station's readings of
     the last hours here and puts them through obsqc.mjs's series checks (v91.17.283.14: the record screen of stuckscreen.mjs and the
     humidity / dew point / pressure step and persistence tests, whose longest limit is about 3 h, hence 4 h kept); the newest reading's
     failures ride on the row (r.seriesF) into screen() */
  const LIVEH = new Map(), ARRST = new Map();
  const arrayF = (r) => { const q = { T: r.tempC, Td: r.dewC, RH: r.rhPct, W: r.windKmh, G: r.gustKmh, S: r.solarWm2 }; QC.applySeriesVerdict(q, 'array-silent'); return q.f || {}; };
  /* ══ v283.44 HOTFIX · THE SERIES SCREEN SURVIVES A RESTART (live defect 1 Nov 2026 21:10 PKT) ═══════════════════════════════════
     LIVEH lived only in this process, so every deploy swap or restart started each station's series empty: for the next FROZEN_MIN
     (120 min) a frozen 'wu' record (the evening fault of 16 Oct, back every day since 29 Oct from about 14:30 to 00:00 PKT) was a
     single fresh reading and passed. At the 20:55 PKT swap of 1 Nov, 38 frozen afternoon records (+7..+13 C residuals) entered the
     live layer and I-8 jumped 22.5 -> 29.1 C. The series is now seeded once, before the first poll, from the record the 10-minute
     MACH window already writes (nig/own/data/mach/db/obs_YYYYMMDD.csv, the same database readings): the last 4 h, as kept here.
     Second hole, same fault: fineOf() calls a series whose values all sit on x.0 / x.5 a coarse report and skips the record screen,
     so a station frozen on 28.0 or 28.5 (Avenue, kuri_road, 1 Nov 18-21 PKT) was never judged. A fleet station that reported a
     temperature off the half-degree in the last 24 h is a fine-resolution sensor; FINE keeps that, and seriesCheck is told so.
     NIGRAAN_FLEET_SEED=0 skips the seed (the fineness memory still builds from the live polls). */
  const FINE = new Map();   /* key -> last ms a temperature off the half-degree came in */
  const isFine = (T) => Number.isFinite(T) && Math.abs(T * 2 - Math.round(T * 2)) > 1e-6;
  let seeded = false; state.seriesSeed = null;
  function seedSeries(now = Date.now()) {
    if (seeded) return; seeded = true;
    if (process.env.NIGRAAN_FLEET_SEED === '0') { state.seriesSeed = { off: true }; return; }
    const dir = ownPath(root, ...OWN.machDb), keys = new Set(state.stations.map((s) => String(s.key))); let n = 0, files = 0;
    const days = [now - 864e5, now].map((t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, ''));   /* the files are UTC days */
    const by = new Map();
    for (const d of [...new Set(days)]) { const f = join(dir, 'obs_' + d + '.csv'); if (!existsSync(f)) continue; files++;
      let L; try { L = readFileSync(f, 'utf8').split(/\r?\n/); } catch (_) { continue; }
      const h = L[0].split(','), ix = (c) => h.indexOf(c), I = { k: ix('stationKey'), t: ix('time'), T: ix('temperatureC'), Td: ix('dewPointC'), RH: ix('humidityPct'), P: ix('pressureHpa'), S: ix('solarWm2'), W: ix('windSpeedKmh'), G: ix('windGustKmh') };
      if (I.k < 0 || I.t < 0 || I.T < 0) continue;
      const v = (c, i) => { if (i < 0 || c[i] === '' || c[i] == null) return null; const x = +c[i]; return Number.isFinite(x) ? x : null; };
      for (let j = 1; j < L.length; j++) { const c = L[j].split(','); const k = c[I.k]; if (!keys.has(k)) continue; const ms = Date.parse(c[I.t]); const T = v(c, I.T);
        if (!Number.isFinite(ms) || T == null || ms > now || ms < now - 864e5) continue;
        if (isFine(T)) FINE.set(k, Math.max(FINE.get(k) || 0, ms));
        if (ms < now - 4 * 3600e3) continue;
        (by.get(k) || by.set(k, []).get(k)).push({ ms, T, Td: v(c, I.Td), RH: v(c, I.RH), P: v(c, I.P), S: v(c, I.S), W: v(c, I.W), G: v(c, I.G) }); } }
    for (const [k, a] of by) { a.sort((x, y) => x.ms - y.ms); const h = []; for (const x of a) if (!h.length || h[h.length - 1].ms < x.ms) h.push(x); if (!LIVEH.has(k)) { LIVEH.set(k, h); n++; } }
    state.seriesSeed = { at: new Date(now).toISOString(), files, stations: n };
  }
  function stuckLive(rows, now = Date.now()) {
    try { seedSeries(now); } catch (e) { state.seriesSeed = { error: e.message }; }
    const cut = now - 4 * 3600e3;
    for (const r of rows) { const ms = r.lastUpdated ? Date.parse(r.lastUpdated) : NaN; if (!Number.isFinite(ms) || r.tempC == null) continue;
      if (isFine(r.tempC)) FINE.set(r.key, Math.max(FINE.get(r.key) || 0, ms));
      const h = (LIVEH.get(r.key) || LIVEH.set(r.key, []).get(r.key)); const x0 = { ms, T: r.tempC, Td: r.dewC, RH: r.rhPct, P: r.pressureHpa, S: r.solarWm2, W: r.windKmh, G: r.gustKmh };
      if (!h.length || h[h.length - 1].ms < ms) h.push(x0); else if (!h.some((x) => x.ms === ms)) { h.push(x0); h.sort((a, b) => a.ms - b.ms); }   /* v283.44: the seed may already hold a later reading */
      while (h.length && h[0].ms < cut) h.shift();
      /* v91.17.283.28 · a station whose newest reading is older than the 4 h kept has no series here (the reading is already silent): the
         poll must not stop on it (now the database is the only live path, a stale station would have failed every poll) */
      if (QCP && h.length) { const q = h.map((x) => ({ ...x })); QC.seriesCheck(q, QCP, { lat: r.lat, lon: r.lon, fineT: (FINE.get(r.key) || 0) >= ms - 864e5 }); const last = q.find((x) => x.ms === ms); if (last && last.f) r.seriesF = last.f; }   /* v283.44: this reading's verdict, wherever it sits */
      /* v91.17.278 · FIX278 5 · the outdoor-array screen, fed one new reading at a time with the station's state kept between polls (a
         daylight silence marks the array silent until it speaks again, through the night) */
      if (Number.isFinite(r.solarWm2)) { const A = ARRST.get(r.key) || ARRST.set(r.key, { at: -Infinity }).get(r.key);
        if (ms > A.at) { A.at = ms; const sv = arraySilent([{ ms, S: r.solarWm2, W: r.windKmh, G: r.gustKmh, lat: r.lat, lon: r.lon }], undefined, A); if (sv[0]) r.seriesF = { ...(r.seriesF || {}), ...arrayF(r) }; }
        else if (A.lost) r.seriesF = { ...(r.seriesF || {}), ...arrayF(r) }; } }
    return rows;
  }
  /* ══ v91.17.283 · WS2 item 8 · SHIELDED / STUCK OUTDOOR SENSOR, AGAINST THE NEIGHBOURS ════════════════════════════════════════════
     The array-silent rule needs solar exactly 0 and wind exactly 0; Khaplu on 20 Oct 2026 read solar 0.5-1.1 W/m2 (so the array
     "spoke") with a flat 10.8-11.2 C and wind 0 from 07 to 14 PKT while its neighbours read 186-303 W/m2. Each poll keeps every
     station's last readings (temperature, solar, wind, gust) and judges its latest complete daylight window against its K nearest
     solar-reporting stations (shieldscreen.mjs, rule data/station-shield-rule.json: flat AND dark AND calm). A marked station is
     marked until a later daylight window is clean; while marked, its outdoor values fail (obsqc 'shielded-array'). */
  const SHH = new Map();
  function shieldLive(rows) {
    if (!SHIELD_RULE) return;
    const keepMs = 3 * SHIELD_RULE.WINDOW_MIN * 60e3, now = Date.now();
    for (const r of rows) { const ms = r.lastUpdated ? Date.parse(r.lastUpdated) : NaN; if (!Number.isFinite(ms) || r.tempC == null || !Number.isFinite(r.lat)) continue;
      const h = (SHH.get(r.key) || SHH.set(r.key, { lat: r.lat, lon: r.lon, rows: [] }).get(r.key)); h.lat = r.lat; h.lon = r.lon;
      if (!h.rows.length || h.rows[h.rows.length - 1].ms < ms) h.rows.push({ ms, T: r.tempC, S: Number.isFinite(r.solarWm2) ? r.solarWm2 : null, W: Number.isFinite(r.windKmh) ? r.windKmh : null, G: Number.isFinite(r.gustKmh) ? r.gustKmh : null });
      while (h.rows.length && h.rows[0].ms < now - keepMs) h.rows.shift(); }
    const res = judgeShield(SHH, SHIELD_RULE, now, (k) => !SHIELDED.has(k));
    for (const [k, v] of res) { if (v.marked) { if (!SHIELDED.has(k)) SHIELDED.set(k, { since: new Date(now).toISOString(), why: v.why }); } else if (v.clean) SHIELDED.delete(k); }
  }
  async function poll() {
    if (!state.configured || process.env.NIGRAAN_FLEET === '0' || !state.stations.length) return;
    const rows = []; state.polls++;
    const viaCopy = null;   /* v91.17.283.28 · no copy path: the database with NIGRAAN's own key */
    if (obs && process.env.NIGRAAN_FLEET_DB !== '0') {
      try { rows.push(...stuckLive(await fetchDb())); state.db.ok = true; state.db.at = new Date().toISOString(); state.db.error = null; }
      catch (e) { state.db.ok = false; state.db.error = e.message; rows.length = 0; }
    }
    const perStation = !rows.length && !!state.base;
    for (let i = 0; perStation && i < state.stations.length; i += 6) {
      const batch = state.stations.slice(i, i + 6);
      const got = await Promise.all(batch.map(s => fetchOne(s).catch(e => ({ key: s.key, name: s.name, lat: s.lat, lon: s.lon, error: e.message }))));
      for (const g of got) { if (g.error) { state.errors++; state.lastError = g.key + ': ' + g.error; } rows.push(g); }
    }
    try { shieldLive(rows); } catch (_) {}
    state.screened = screen(rows); state.usable = rows.filter(r => r.usable).length;
    state.fromSheet = rows.filter(r => r.source === 'sheet').length; state.fromDb = rows.filter(r => r.fromDb).length; state.fromApi = rows.length - state.fromSheet - state.fromDb;
    /* v91.17.283.49 · item 4: an empty poll never replaces a good one */
    const nowIso = new Date().toISOString(); state.feed = state.feed || { lastGoodAt: null, lastFailAt: null, failWhy: null };
    if (!anyReading(rows)) { state.feed.lastFailAt = nowIso; state.feed.failWhy = (state.db && state.db.error ? 'MACH database: ' + state.db.error + '; ' : '') + 'no station returned a reading (' + rows.length + ' rows' + (perStation ? ', per-station fallback' : '') + ')';
      try { console.log('  fleet      poll failed: ' + state.feed.failWhy + (state.feed.lastGoodAt ? '; keeping the poll of ' + state.feed.lastGoodAt : '')); } catch (_) {}
      if (anyReading(state.last)) return; }
    else { state.feed.lastGoodAt = nowIso; }
    state.last = rows; state.lastAt = nowIso;
    /* the observation rows go to the station lake: one CSV per month, the usable rows only, one line per station per poll */
    try {
      const lake = join(root, '..', 'station-lake', 'archive', 'fleet'); mkdirSync(lake, { recursive: true });
      const f = join(lake, 'fleet_obs_' + state.lastAt.slice(0, 7) + '.csv'); state.lakeFile = f;
      if (!existsSync(f)) appendFileSync(f, 'polled_utc,key,lat,lon,obs_utc,temp_c,rh_pct,dew_c,wind_kmh,gust_kmh,pressure_hpa,precip_rate_mm,solar_wm2\n');
      /* v91.17.283.14 · every current reading obsqc judged, its failing values blank (the passing ones are kept even when the temperature fails) */
      const judged = rows.filter(r => r.qcv);
      const lines = judged.map(r => [state.lastAt, r.key, r.lat, r.lon, r.lastUpdated, r.tempC, r.rhPct, r.dewC, r.windKmh, r.gustKmh, r.pressureHpa, r.precipRateMm, r.solarWm2].map(v => v == null ? '' : v).join(','));
      if (lines.length) appendFileSync(f, lines.join('\n') + '\n');
      /* v91.17.157 · audit: rain total, wind direction and UV were fetched and dropped; kept in a side file (the main CSV's columns are unchanged) */
      const fx = join(lake, 'fleet_obs_ext_' + state.lastAt.slice(0, 7) + '.csv');
      if (!existsSync(fx)) appendFileSync(fx, 'polled_utc,key,obs_utc,precip_total_mm,wind_dir,uv_index\n');
      const lx = judged.map(r => [state.lastAt, r.key, r.lastUpdated, r.precipTotalMm, r.windDir, r.uv].map(v => v == null ? '' : String(v).replace(/,/g, ' ')).join(','));
      if (lx.length) appendFileSync(fx, lx.join('\n') + '\n');
    } catch (e) { state.lastError = 'lake write: ' + e.message; }
    try { console.log('  fleet      ' + state.usable + '/' + rows.length + ' usable (' + (state.fromDb ? state.fromDb + (viaCopy ? ' from the copied MACH database record (' + (state.copy && state.copy.via) + ')' : ' from the MACH database') : state.fromSheet + ' from sheet tabs, ' + state.fromApi + ' from the API') + ') · screened ' + JSON.stringify(state.screened)); } catch {}
  }

  /* ══ v91.17.59 · FLEET PAIRS: every usable reading beside the forecast for its hour, raw and as served ═══════════════
     The plains correction is fitted on the PMD synop record; the fleet is the fresh check on it, and after some weeks
     the siting-bias table (roof / afternoon-sun warm bias per station) comes from these pairs. One provider call per
     usable station every 6 h (forecast_days=2, three hourly variables, weight 1) through the server's own /px route so
     the paid key never leaves server.mjs; the served value is the same correctLocation the dashboard gets, applied
     in-process on a copy. Pairs go to station-lake/archive/fleet/fleet_pairs_YYYY-MM.csv, one row per station-hour. */
  const PAIR_REFRESH_MS = 6 * 3600e3;
  const fc = new Map();   /* key -> { at, elev, hours: Map(isoHour -> { raw, served, rh, wind }) } */
  async function forecastFor(st, opt = {}) {
    const PD = String(opt.pastDays || 3);   /* v91.17.182 · the database backfill reads the basis for the last 16 days */
    const port = Number(process.env.PORT || 8787);
    /* v91.17.70 · the pair is taken against the SERVED BASIS (L0): the zone temperature model at the point, folded by the
       same mergeZone the dashboard's responses go through, so the running bias learns the error of what is served */
    let zm = app.mos && app.mos.requestModels ? app.mos.requestModels() : null;
    /* the zone request only where the point may be in a zone that serves another model: inside the zone file's client
       boxes (the same pre-filter the dashboard uses); elsewhere best_match is the basis and one model is fetched */
    try { const Z = app.mos.zones(); const B = (Z && Z.clientBoxes) || []; if (zm && !B.some(z => st.lat >= z[0] && st.lat <= z[2] && st.lon >= z[1] && st.lon <= z[3])) zm = null; } catch (_) {}
    const q = new URLSearchParams({ __omhost: 'api.open-meteo.com', latitude: st.lat.toFixed(4), longitude: st.lon.toFixed(4), hourly: 'temperature_2m,relative_humidity_2m,dew_point_2m,wind_speed_10m,cloud_cover,wind_direction_10m,shortwave_radiation,precipitation', forecast_days: '2', past_days: PD, timezone: 'UTC', wind_speed_unit: 'kmh', __raw: '1' });
    if (zm) q.set('models', zm);
    /* v91.17.88 · __raw=1: the proxy corrects every /v1/forecast response it serves (L0 + L2 + ...). Without the flag this
       "raw" was already the served value, so the running correction (rbNote) was measured against a forecast that carried
       the running correction itself, and "served" below was corrected twice. The basis is now the provider's (zone-merged)
       number, as the header of this function says. */
    q.set('__raw', '1');
    const r = await fetch(`http://127.0.0.1:${port}/px/v1/forecast?` + q.toString(), { headers: { 'Sec-Fetch-Site': 'same-origin', 'x-agn-internal': 'fleet-pairs' } });
    if (!r.ok) throw new Error('px ' + r.status);
    const raw = await r.json();
    /* v91.17.283.8 · audit 14 · THE ECMWF SHADOW OF THE FULL SERVED CHAIN: serving substitutes the 9 km values into the provider's best_match
       answer BEFORE the correction chain (server.mjs _e010 -> verification.correctSteps: zone merge, multi-model mix, MOS, national model, ...).
       A copy of this answer gets the same substitution (ecmwf010.substituteLoc, every candidate variable) and then the same steps below, so the
       shadow scores the value that would be served, not the raw 9 km value. No provider call is added (the same answer and members row). A
       zone request (models other than best_match) is not substituted by serving, so its candidate equals the served value. */
    const E10 = app.ecmwf010; let rawE = null;
    try { if (!opt.basisOnly && E10 && E10.latest && E10.latest() && E10.substituteLoc && !zm) { rawE = JSON.parse(JSON.stringify(raw)); if (!E10.substituteLoc(rawE, ['temperature_2m', 'dew_point_2m', 'wind_speed_10m', 'precipitation'], 3.6, Date.now())) rawE = null; } } catch (_) { rawE = null; }
    try { if (zm && app.verification && app.verification.mergeZone) app.verification.mergeZone(raw, st.lat, st.lon, zm); } catch {}
    /* v91.17.89 · a plain request carries no pool members: fetch them (temperature only) so the national model uses the same
       variant here as on the page, and the live residuals are measured against the number the page shows */
    try {
      if (app.national && app.national.enabled() && raw.hourly && Array.isArray(raw.hourly.time) && !raw.hourly.__natT) {
        const mq = new URLSearchParams({ __omhost: 'api.open-meteo.com', latitude: st.lat.toFixed(4), longitude: st.lon.toFixed(4), hourly: 'temperature_2m', models: 'icon_seamless,gfs_seamless,meteofrance_seamless', forecast_days: '2', past_days: PD, timezone: 'UTC', __raw: '1' });
        const mr = await fetch(`http://127.0.0.1:${port}/px/v1/forecast?` + mq.toString(), { headers: { 'Sec-Fetch-Site': 'same-origin', 'x-agn-internal': 'fleet-pairs' } });
        if (mr.ok) { const mj = await mr.json(); const MH = mj.hourly || {}; const ix = new Map((MH.time || []).map((t, k) => [t, k])); const stash = { best_match: raw.hourly.temperature_2m.slice() };
          for (const m of ['icon_seamless', 'gfs_seamless', 'meteofrance_seamless']) { const a = MH['temperature_2m_' + m]; stash[m] = Array.isArray(a) ? raw.hourly.time.map(t => { const k = ix.get(t); return k == null ? null : a[k]; }) : null; }
          if (['icon_seamless', 'gfs_seamless', 'meteofrance_seamless'].every(m => Array.isArray(stash[m]))) { Object.defineProperty(raw.hourly, '__natT', { value: stash, enumerable: false, configurable: true });
            if (rawE && rawE.hourly) { const sE = { ...stash, best_match: rawE.hourly.temperature_2m.slice() }; Object.defineProperty(rawE.hourly, '__natT', { value: sE, enumerable: false, configurable: true }); } } }
      }
    } catch (_) {}
    /* v91.17.267 · THE PLAINS START FROM THE MULTI-MODEL MIX (blend.mjs). The pairs are measured against the SERVED START: where the gate
       mixes the start at this station's zone, the basis ('raw' here, fc_raw_c in the pairs file) is the mix, so the running correction (L2)
       and the live layer (L3) learn the error of what the page starts from. One members call per station and refresh (temperature and
       dew point, nine models, 1.8 weighted calls; the backfill's 16 past days 3.1), shared with the pages through the per-place cache.
       No members: the basis stays best_match. The start and best_match per hour go to fleet_pairs_basis_YYYY-MM.csv. */
    try { const BL = app.blend; const zb = app.mos && app.mos.zoneOfPoint ? app.mos.zoneOfPoint(st.lat, st.lon, raw.elevation != null ? raw.elevation : null) : null;
      if (BL && BL.wantsZone(zb) && raw.hourly && Array.isArray(raw.hourly.temperature_2m)) {
        const [row] = await BL.rowsFor([{ lat: Number(st.lat.toFixed(4)), lon: Number(st.lon.toFixed(4)), elev: null }], { pastDays: Number(PD) }, async (q) => {
          const r = await fetch(`http://127.0.0.1:${port}/px/v1/forecast?` + new URLSearchParams({ __omhost: 'api.open-meteo.com', ...q, __raw: '1' }).toString(), { headers: { 'Sec-Fetch-Site': 'same-origin', 'x-agn-internal': 'fleet-pairs' } });
          if (!r.ok) throw new Error('px ' + r.status); return r.json(); });
        if (row) { const b = BL.applyTo(raw, row, { zone: zb }); try { if (rawE) BL.applyTo(rawE, row, { zone: zb }); } catch (_) {}
          if (b.applied) { const bs = app.verification && app.verification.basisOf ? app.verification.basisOf(raw, st.lat, st.lon) : null; if (bs) bs.start = b.provenance; } } } } catch (_) {}
    const BB = raw.hourly && raw.hourly.__blendBase;   /* v91.17.267 · best_match before the start was mixed (null: not mixed) */
    const startOf = (i) => (BB && BB.starts && BB.starts[i] ? 'multi-model mix' : 'best_match');
    if (opt.basisOnly) { const H = raw.hourly || {}, hours = new Map(); (H.time || []).forEach((t, i) => hours.set(t.slice(0, 13), { raw: H.temperature_2m[i], dew: H.dew_point_2m ? H.dew_point_2m[i] : null, bm: BB ? BB.t[i] : H.temperature_2m[i], start: startOf(i) })); return { at: Date.now(), elev: raw.elevation, hours, basis: raw.agn_temperature_basis || null }; }
    const served = JSON.parse(JSON.stringify(raw));
    /* v91.17.89 · the copy loses the zone merge's non-enumerable T0 stash; the national model needs it (and the request's model list) */
    try { if (raw.hourly && raw.hourly.__natT) Object.defineProperty(served.hourly, '__natT', { value: raw.hourly.__natT, enumerable: false, configurable: true });
      Object.defineProperty(served, '__req', { value: zm || 'best_match', enumerable: false, configurable: true }); } catch (_) {}
    /* v91.17.207 · the one served chain up to (not including) the live MACH layer, which these pairs are measured for. It now includes
       the weather MOS: the live layer's residual is measured against the same number it is added to (before, without the weather MOS
       here and with it on the page, the weather-MOS term was counted twice near a station). Day cards are not needed here. */
    /* v91.17.283.10 · the step log for the diagnostic agent: the temperature after each stage of this same chain (copies; nothing changes) */
    const stepLog = process.env.NIGRAAN_STEPLOG === '0' ? null : [];
    try { const V = app.verification; if (V && V.servedChainAsync) await V.servedChainAsync(served, st.lat, st.lon, { upTo: 'synop', daily: false, ...(stepLog ? { stepLog } : {}) }); else if (V && V.servedChain) V.servedChain(served, st.lat, st.lon, { upTo: 'synop', daily: false, ...(stepLog ? { stepLog } : {}) }); } catch {}   /* v91.17.231 · queued: the pool evaluates the trees */
    const stepAt = (i) => { if (!stepLog || !stepLog.length) return null; const o = {}; for (const [id, T] of stepLog) if (T[i] != null) o[id] = T[i]; return o; };
    let SE = null; if (rawE) { try { const sv = JSON.parse(JSON.stringify(rawE)); if (rawE.hourly && rawE.hourly.__natT) Object.defineProperty(sv.hourly, '__natT', { value: rawE.hourly.__natT, enumerable: false, configurable: true });
        Object.defineProperty(sv, '__req', { value: 'best_match', enumerable: false, configurable: true });
        const V = app.verification; if (V && V.servedChainAsync) await V.servedChainAsync(sv, st.lat, st.lon, { upTo: 'synop', daily: false }); else if (V && V.servedChain) V.servedChain(sv, st.lat, st.lon, { upTo: 'synop', daily: false });
        SE = { H: sv.hourly || {}, sub: rawE.hourly || {} }; } catch (_) { SE = null; } }
    const H = raw.hourly || {}, S = served.hourly || {}, hours = new Map();
    (H.time || []).forEach((t, i) => hours.set(t.slice(0, 13), { raw: H.temperature_2m[i], served: S.temperature_2m ? S.temperature_2m[i] : H.temperature_2m[i], rh: H.relative_humidity_2m ? H.relative_humidity_2m[i] : null, dew: H.dew_point_2m ? H.dew_point_2m[i] : null, wind: H.wind_speed_10m ? H.wind_speed_10m[i] : null, srh: S.relative_humidity_2m ? S.relative_humidity_2m[i] : null, bm: BB ? BB.t[i] : H.temperature_2m[i], start: startOf(i), pr: H.precipitation ? H.precipitation[i] : null,
      sdew: S.dew_point_2m ? S.dew_point_2m[i] : null, swind: S.wind_speed_10m ? S.wind_speed_10m[i] : null, steps: stepAt(i),
      ...(SE ? { servedE: SE.H.temperature_2m ? SE.H.temperature_2m[i] : null, sdewE: SE.H.dew_point_2m ? SE.H.dew_point_2m[i] : null, swindE: SE.H.wind_speed_10m ? SE.H.wind_speed_10m[i] : null, eSub: Date.parse(t.replace(/Z?$/, 'Z')) >= Date.now() - 3600e3 } : {}) }));   /* v91.17.283.8 · audit 14 */   /* v91.17.283.2 - pr: the hourly rain of the same answer (already requested), for the ECMWF 0.1 deg shadow */
    return { at: Date.now(), elev: raw.elevation, hours, corrected: !!(served.agn_bias_correction && served.agn_bias_correction.applied), basis: raw.agn_temperature_basis || null };
  }
  const pairState = { pairs: 0, calls: 0, lastAt: null, lastError: null, file: null, seen: new Set() };
  async function pairLatest() {
    if (!state.last) return;
    const usable = state.last.filter(r => r.usable && r.lastUpdated);
    const need = usable.filter(r => { const f = fc.get(r.key); return !f || Date.now() - f.at > PAIR_REFRESH_MS; });
    for (let i = 0; i < need.length; i += 4) {
      await Promise.all(need.slice(i, i + 4).map(async st => { try { fc.set(st.key, await forecastFor(st)); pairState.calls++; } catch (e) { pairState.lastError = st.key + ': ' + e.message; } }));
    }
    const lake = join(root, '..', 'station-lake', 'archive', 'fleet'); mkdirSync(lake, { recursive: true });
    const lines = [], blines = [], slines = [];
    for (const r of usable) {
      const f = fc.get(r.key); if (!f) continue;
      const obsMs = Date.parse(r.lastUpdated); if (!Number.isFinite(obsMs)) continue;
      const hourIso = new Date(Math.round(obsMs / 3600e3) * 3600e3).toISOString().slice(0, 13);
      const h = f.hours.get(hourIso); if (!h || h.raw == null) continue;
      const id = r.key + '|' + hourIso; if (pairState.seen.has(id)) continue; pairState.seen.add(id);
      const leadH = Math.round((Date.parse(hourIso + ':00:00Z') - f.at) / 3600e3);
      try { rbNote(r, f, h, hourIso); } catch (_) {}
      lines.push([new Date().toISOString(), r.key, r.lat, r.lon, f.elev, r.lastUpdated, hourIso + ':00Z', leadH, r.tempC, r.rhPct, r.dewC, r.windKmh, h.raw, h.served, h.rh, h.srh, h.wind, f.corrected ? 1 : 0].map(v => v == null ? '' : v).join(','));
      blines.push([new Date().toISOString(), r.key, hourIso + ':00Z', h.start || 'best_match', h.bm, h.raw].map(v => v == null ? '' : v).join(','));   /* v91.17.267 */
      if (h.steps) { const P = h.steps, q = (v) => (v == null || !Number.isFinite(v)) ? '' : Math.round(v * 100) / 100; slines.push([new Date().toISOString(), r.key, hourIso + ':00Z', leadH, r.tempC, q(h.raw), q(P.calibration), q(P.national), q(P.static), q(P.wxmos), q(P.tdown), q(P.synop), q(h.served)].map(v => v == null ? '' : v).join(',')); }   /* v91.17.283.10 */
    }
    if (lines.length) {
      const file = join(lake, 'fleet_pairs_' + new Date().toISOString().slice(0, 7) + '.csv'); pairState.file = file;
      if (!existsSync(file)) appendFileSync(file, 'paired_utc,key,lat,lon,model_elev_m,obs_utc,hour_utc,lead_h,temp_c,rh_pct,dew_c,wind_kmh,fc_raw_c,fc_served_c,fc_rh_pct,fc_served_rh_pct,fc_wind_kmh,corrected\n');
      appendFileSync(file, lines.join('\n') + '\n'); pairState.pairs += lines.length; pairState.lastAt = new Date().toISOString();
      /* v91.17.267 · which start each pair was measured against (fc_raw_c above is the start): the main file's columns are unchanged */
      try { const bf = join(lake, 'fleet_pairs_basis_' + new Date().toISOString().slice(0, 7) + '.csv');
        if (!existsSync(bf)) appendFileSync(bf, 'paired_utc,key,hour_utc,basis_start,fc_best_match_c,fc_start_c\n');
        appendFileSync(bf, blines.join('\n') + '\n'); } catch (_) {}
      /* v91.17.283.10 · the step log of each pair (the diagnostic agent, scripts/agents/diagnose.mjs): the start, the temperature after the
         static calibration, the national residual model, the whole static chain, the weather MOS, the downscaling and the synoptic term
         (empty where a stage did not run), and the served value; the paired_utc, key and hour_utc of fleet_pairs_* */
      if (slines.length) try { const sf = join(lake, 'fleet_pairs_steps_' + new Date().toISOString().slice(0, 7) + '.csv');
        if (!existsSync(sf)) appendFileSync(sf, 'paired_utc,key,hour_utc,lead_h,temp_c,fc_start_c,fc_calibration_c,fc_national_c,fc_static_c,fc_wxmos_c,fc_tdown_c,fc_synop_c,fc_served_c\n');
        appendFileSync(sf, slines.join('\n') + '\n'); } catch (_) {}
    }
    if (pairState.seen.size > 20000) pairState.seen = new Set([...pairState.seen].slice(-5000));
  }
  /* ══ v91.17.182 · THE RUNNING CORRECTION AND THE SITING SCREEN FILLED FROM THE MACH DATABASE ═══════════════════════════════
     Until now the running correction (L2) and the live siting screen held only what the 10-minute poll had caught: on 6 Oct the
     old per-station reads found 81 of 105 stations stale, so most stations had a day or two of pairs. The database holds every
     reading. Once after start-up (after the first poll) and then daily, each station's readings for the last keep_days (16) are read
     from the database, screened reading by reading with the same rules as the live poll, the reading nearest each hour (within
     30 min) is paired with the served basis for that hour (one basis request per station, past 16 days) and enters the same state
     the live pairs build (rbNote). Kept out: Apple rows (a forecast product, not a station). v91.17.283.14: every other station is read
     and each hourly VALUE is judged by obsqc.mjs (an identical record under two keys fails as a copy, value by value); a failing hour's
     pair is removed. NIGRAAN_FLEET_BACKFILL=0 stops it. */
  const bfState = { at: null, running: false, stations: 0, hours: 0, removed: [], skipped: {}, error: null };
  /* ══ v91.17.186 · SITING OFFSETS (server/api/sitingoffsets.mjs) ═════════════════════════════════════════════════════════════════
     After each database backfill: every station's offset against its MACH neighbours, or, with none, against the nearest PMD synop
     station within the live layer's radius (its reading minus the forecast basis at the synop point, one basis request per synop
     station that some station needs). The live layer (hyperlocal.mjs) removes the offset and leaves out stations held out as unsteady
     or faulty. Written to data/mach-offsets.json (read back at start, shown on the operations page). */
  const offFile = join(dataDir, 'mach-offsets.json');
  let OFF = { at: null, stations: {} }; try { if (existsSync(offFile)) OFF = JSON.parse(readFileSync(offFile, 'utf8')); } catch (_) {}
  const offState = { at: OFF.at || null, error: null, synopBasis: 0 };
  async function refreshOffsets() {
    const R = rule(); let refKm = 40; try { refKm = (app.hyperlocal && app.hyperlocal.radiusKm && app.hyperlocal.radiusKm()) || 40; } catch (_) {}
    if (!R.screen) { offState.error = 'no siting rule on this server (data/mach-siting.json)'; return offState; }   /* v91.17.266 · the rule is read, not typed */
    /* v91.17.283.14 · every station's pairs (they hold only values obsqc.mjs passed; a copied record never enters them) */
    const ST2 = RB.stations;
    const first = computeOffsets(ST2, [], R.screen, refKm);
    const need = Object.entries(first.stations).filter(([, r]) => !r.ref).map(([k]) => ST2[k]).filter(Boolean);
    const synops = [];
    try {
      const SY = app.synop && app.synop.records ? app.synop.records() : null;
      if (SY && need.length) {
        const kmTo = (a, b) => kmBetween(a.lat, a.lon, b.lat, b.lon);
        for (const [sid, y] of Object.entries(SY.stations || {})) {
          if (!Number.isFinite(y.lat) || !Number.isFinite(y.lon)) continue;
          if (!need.some(st => kmTo(st, y) <= refKm && (st.elevM == null || y.elevM == null || Math.abs(st.elevM - y.elevM) <= R.screen.dz_m))) continue;
          let f; try { f = await forecastFor({ key: 'synop:' + sid, name: y.name, lat: y.lat, lon: y.lon }, { pastDays: R.keep_days, basisOnly: true }); offState.synopBasis++; } catch (_) { continue; }
          const hours = {}; for (const [t, v] of Object.entries((SY.records || {})[sid] || {})) { const iso = String(t).slice(0, 13); const h = f.hours.get(iso); if (v && Number.isFinite(v.o) && h && Number.isFinite(h.raw)) hours[iso] = Math.round((v.o - h.raw) * 100) / 100; }
          synops.push({ sid, name: y.name, lat: y.lat, lon: y.lon, elevM: y.elevM, hours });
        }
      }
    } catch (_) {}
    const res = computeOffsets(ST2, synops, R.screen, refKm);
    OFF = { version: 'off-91.17.192', at: new Date().toISOString(), method: 'server/api/sitingoffsets.mjs', refKm, rule: R.screen, fences: res.fences, stations: res.stations };
    offState.at = OFF.at; offState.error = null;
    try { const t = offFile + '.tmp'; writeFileSync(t, JSON.stringify(OFF)); renameSync(t, offFile); } catch (_) {}
    try { const held = Object.entries(OFF.stations).filter(([, r]) => r.flag).map(([k]) => k); console.log('  fleet      siting offsets: ' + Object.keys(OFF.stations).length + ' stations, ' + Object.values(OFF.stations).filter(r => r.ref).length + ' with a reference, flagged (offset not removed) ' + JSON.stringify(held)); } catch {}
    return offState;
  }
  const offsetFor = (key) => (OFF && OFF.stations && OFF.stations[key]) || null;
  async function backfill() {
    if (!obs || process.env.NIGRAAN_FLEET_BACKFILL === '0' || bfState.running) return bfState;
    bfState.running = true; bfState.error = null;
    try {
      try { const f = join(dataDir, 'mach-siting.json'); if (existsSync(f)) SEED = JSON.parse(readFileSync(f, 'utf8')); } catch (_) {}   /* the history verdicts, re-made daily from the database record (machdb.mjs) */
      const H = { accept: 'application/json', 'x-api-key': obs.key };
      const meta = new Map();   /* filled below: from the local record's station list when the record is fresh, else from the database */
      const why = (k) => { const x = meta.get(k); if (!x) return 'not in the database'; if (/^apple/i.test(String(x.provider || '')) && process.env.NIGRAAN_FLEET_APPLE !== '1') return 'apple';
        return null; };   /* v91.17.283.14 · two keys sharing one source id are no longer skipped: obsqc's copy check judges their values */
      const skipped = {}; const removed = [];
      const R = rule(); const from = new Date(Date.now() - R.keep_days * 864e5).toISOString().slice(0, 19) + 'Z';
      /* v91.17.260 · the station record is already on disk (station-lake/archive/fleet/db/mach_db_YYYY-MM.csv). When its newest reading
         is under 8 h old the readings come from there and the database is asked only for its station list; otherwise the per-station
         database reads below, unchanged.
         v91.17.283.28 · the record is NIGRAAN's own (machdb.mjs polls the database every 10 min with obs.key; LAMHA's copy is no longer
         read anywhere): the "LAMHA FIRST" gate (NIGRAAN_LAMHA) is gone; NIGRAAN_FLEET_LOCAL=0 forces the database reads. Solar, wind and
         gust are now read from the record too (before, only T, Td, RH and P were, so the outdoor-array screen saw nulls on this path). */
      let local = null;
      try { if (process.env.NIGRAAN_FLEET_LOCAL !== '0') {
        const dbDir = join(root, '..', 'station-lake', 'archive', 'fleet', 'db'); const fromMs = Date.parse(from); const mm = new Set();
        for (let t = fromMs; t <= Date.now() + 864e5; t += 20 * 864e5) mm.add(new Date(t).toISOString().slice(0, 7)); mm.add(new Date().toISOString().slice(0, 7));
        const L = new Map(); let newest = 0;
        for (const m of [...mm].sort()) { const f = join(dbDir, 'mach_db_' + m + '.csv'); if (!existsSync(f)) continue;
          const lines = readFileSync(f, 'utf8').split(/\r?\n/); const h = (lines[0] || '').split(','); const ix = (n) => h.indexOf(n);
          const iT = ix('time'), iK = ix('station_key'), iS = ix('source'), iTe = ix('temperature_c'), iD = ix('dew_point_c'), iH = ix('humidity_pct'), iP = ix('pressure_hpa'), iSo = ix('solar_wm2'), iW = ix('wind_speed_kmh'), iG = ix('wind_gust_kmh');
          if (iT < 0 || iK < 0 || iTe < 0) continue;
          for (let i = 1; i < lines.length; i++) { const c = lines[i].split(','); if (c.length !== h.length) continue;   /* a row two writers merged (10 Oct, one line) is skipped, not misread */ const ms = Date.parse(c[iT]); if (!Number.isFinite(ms) || ms < fromMs) continue;
            const v = (j) => (j < 0 || c[j] === '' || c[j] == null) ? null : (Number.isFinite(+c[j]) ? +c[j] : null);
            const o = { ms, time: c[iT], source: iS >= 0 ? c[iS] : '', metrics: { temperatureC: v(iTe), dewPointC: v(iD), humidityPct: v(iH), pressureHpa: v(iP), solarWm2: v(iSo), windSpeedKmh: v(iW), windGustKmh: v(iG) } };
            (L.get(c[iK]) || L.set(c[iK], []).get(c[iK])).push(o); if (ms > newest) newest = ms; } }
        /* one reading per station and time (a reading reached by two paths is held once; the record is append only) */
        for (const [k, a] of L) { a.sort((x, y) => x.ms - y.ms); L.set(k, a.filter((x, i) => i === 0 || x.ms !== a[i - 1].ms)); }
        if (L.size && Date.now() - newest < 8 * 3600e3) { local = L; bfState.source = 'local record (NIGRAAN\'s own copy of the MACH database)'; }
        else bfState.source = 'MACH database API (local record ' + (L.size ? Math.round((Date.now() - newest) / 3600e3) + ' h old' : 'empty') + ')';
      } } catch (e) { local = null; bfState.source = 'MACH database API (local record unreadable: ' + e.message + ')'; }
      { let sl = null;
        if (local) { try { sl = JSON.parse(readFileSync(join(root, '..', 'station-lake', 'archive', 'fleet', 'db', 'stations.json'), 'utf8')); } catch (_) { sl = null; } }
        if (!sl || !(sl.stations || []).length) { sl = await (await fetch(obs.base + '/v1/stations', { headers: H, signal: AbortSignal.timeout(30000) })).json(); }
        for (const x of (sl.stations || [])) meta.set(String(x.station_key), x); }
      for (const k of Object.keys(RB.stations)) { if (why(k) === 'apple') { delete RB.stations[k]; removed.push(k); } }
      /* v91.17.283.14 · every station's readings (Apple rows are a forecast product, not a reading), then the served basis for its
         hours, then obsqc.mjs over all stations at once (the hourly value nearest each hour within 30 min, its series, the copy check -
         a station sharing another's source id carries its record - and the buddy / background check per hour). A passing temperature
         (and its dew point where that passes) enters the running correction; a failing hour's earlier pair is removed. */
      const per = new Map();   /* key -> readings [{ ms, T, Td, RH, P, S, W, G }] */
      for (const st of state.stations) {
        const w = why(st.key); if (w === 'not in the database' || w === 'apple') { skipped[w] = (skipped[w] || 0) + 1; continue; }
        try {
          let rows = [], f = from;
          if (local) rows = local.get(st.key) || [];
          else for (let page = 0; page < 6; page++) {
            const u = obs.base + '/v1/stations/' + encodeURIComponent(st.key) + '/observations?' + new URLSearchParams({ from: f, limit: '5000', order: 'asc' });
            const j = await (await fetch(u, { headers: H, signal: AbortSignal.timeout(60000) })).json();
            const o = j.observations || []; rows = rows.concat(o); if (!j.truncated || !o.length) break; f = new Date(Date.parse(o[o.length - 1].time) + 1000).toISOString().slice(0, 19) + 'Z';
          }
          const q = []; for (const o of rows) { if (String(o.source || '') === 'qm') continue; const ms = Date.parse(o.time); if (!Number.isFinite(ms)) continue; const m = o.metrics || {};
            const n = (x) => (x == null || !Number.isFinite(+x)) ? null : +x; q.push({ ms, T: n(m.temperatureC), Td: n(m.dewPointC), RH: n(m.humidityPct), P: n(m.pressureHpa), S: n(m.solarWm2), W: n(m.windSpeedKmh), G: n(m.windGustKmh) }); }
          if (q.length) per.set(st.key, q); else skipped['no readings'] = (skipped['no readings'] || 0) + 1;
        } catch (e) { skipped['database error'] = (skipped['database error'] || 0) + 1; bfState.error = st.key + ': ' + e.message; }
      }
      const list = state.stations.filter((st) => per.has(st.key)); const F = new Map();
      for (let i = 0; i < list.length; i += 3) {
        await Promise.all(list.slice(i, i + 3).map(async (st) => {
          try { F.set(st.key, await forecastFor(st, { pastDays: R.keep_days, basisOnly: true })); pairState.calls++; } catch (e) { skipped['basis error'] = (skipped['basis error'] || 0) + 1; bfState.error = st.key + ': ' + e.message; } }));
      }
      const fromMs = Date.parse(from); let hours = 0, nst = 0, dropped = 0;
      if (QCP) {
        const qs = list.map((st) => { const elev = elevAt(st); return { pid: 'mach:' + st.key, lat: st.lat, lon: st.lon, elev, zone: zoneAt(st, elev) }; });
        const res = QC.qcBatch(qs, new Map(list.map((st) => ['mach:' + st.key, per.get(st.key)])), QCP, { nearestMin: 30, from: fromMs,
          copyOf: new Map([...COPYOF].map(([k, o]) => ['mach:' + k, 'mach:' + o])),
          bgAt: (pid, hMs) => { const f = F.get(pid.slice(5)); const x = f && f.hours.get(new Date(hMs).toISOString().slice(0, 13)); return x && x.raw != null ? { T: x.raw } : null; } });
        bfState.qc = res.counts;
        for (const st of list) { const f = F.get(st.key); const H = res.hourly.get('mach:' + st.key); if (!f || !H) continue; let n = 0;
          for (const [hMs, r] of H) { const iso = new Date(hMs).toISOString().slice(0, 13);
            if (!QC.passes(r, 'T')) { const S = RB.stations[st.key]; if (S && S.hours && S.hours[iso]) delete S.hours[iso]; dropped++; continue; }
            const h = f.hours.get(iso); if (!h || h.raw == null) continue;
            rbNote({ key: st.key, name: st.name, lat: st.lat, lon: st.lon, tempC: r.T, rhPct: QC.passes(r, 'RH') ? r.RH : null, dewC: QC.passes(r, 'Td') ? r.Td : null, lastUpdated: new Date(r.ms).toISOString() }, f, h, iso, true); n++; }
          if (n) { nst++; hours += n; } }
      }
      try { const t = rbFile + '.tmp'; RB.built = new Date().toISOString(); writeFileSync(t, JSON.stringify(RB)); renameSync(t, rbFile); rbSavedAt = Date.now(); } catch (_) {}
      rbCache.at = 0; SCR.clear(); NBC.clear(); REF.at = 0;
      Object.assign(bfState, { at: new Date().toISOString(), stations: nst, hours, removed, skipped: { ...skipped, valueFailedHours: dropped } });
      try { await refreshOffsets(); } catch (e) { offState.error = e.message; }   /* v91.17.186 */
      try { console.log('  fleet      database backfill: ' + nst + ' stations, ' + hours + ' station-hours paired; left out ' + JSON.stringify(bfState.skipped) + (removed.length ? '; earlier pairs removed for ' + removed.length : '')); } catch {}
    } catch (e) { bfState.error = e.message; }
    finally { bfState.running = false; }
    return bfState;
  }

  /* v91.17.283.29 · W5 · the one station rule of the bias card: the customer rule (usable, checked station, background-checked) */
  const checkedRow = (r) => { let sc = null; try { sc = screenOne(r.key); } catch (_) { sc = null; } const st = stationStatus(r, sc); return customerRow({ ...r, usableTemperature: !!r.usable && r.tempC != null, bgChecked: r.bgChecked === true, status: st && st.status }); };
  /* the fleet against the forecast right now, by city, from the latest poll: the freshness check on the plains fit */
  function scoreNow() {
    if (!state.last) return null;
    const byCity = {}; let n = 0, sr = 0, ss = 0, ar = 0, as = 0;
    for (const r of state.last) {
      if (!r.usable || !r.lastUpdated) continue; if (!checkedRow(r)) continue; const f = fc.get(r.key); if (!f) continue;   /* v91.17.283.29 · W5 · only stations whose check passed (the customer rule), not every usable row */
      const hourIso = new Date(Math.round(Date.parse(r.lastUpdated) / 3600e3) * 3600e3).toISOString().slice(0, 13); const h = f.hours.get(hourIso); if (!h || h.raw == null) continue;
      const _np = String(r.name || '').split(','); const city = (_np.length > 1 ? _np[_np.length - 1] : _np[0]).trim() || 'other';   /* v91.17.196 · names are 'area, city': the city is the last part */ const c = byCity[city] || (byCity[city] = { n: 0, dRaw: 0, dServed: 0 });
      c.n++; c.dRaw += h.raw - r.tempC; c.dServed += h.served - r.tempC; n++; sr += h.raw - r.tempC; ss += h.served - r.tempC; ar += Math.abs(h.raw - r.tempC); as += Math.abs(h.served - r.tempC);
    }
    for (const c of Object.values(byCity)) { c.biasRaw = Math.round(c.dRaw / c.n * 10) / 10; c.biasServed = Math.round(c.dServed / c.n * 10) / 10; delete c.dRaw; delete c.dServed; }
    return n ? { n, biasRaw: Math.round(sr / n * 100) / 100, biasServed: Math.round(ss / n * 100) / 100, maeRaw: Math.round(ar / n * 100) / 100, maeServed: Math.round(as / n * 100) / 100, byCity, rule: 'checked stations only (the customer station rule)', note: 'forecast minus fleet reading at the reading hour; unshielded roof sensors read warm in afternoon sun, so a negative bias here is partly the sensor' } : null;
  }

  if (state.configured && process.env.NIGRAAN_FLEET !== '0') {
    schedule(app, 'fleet', POLL_MS, () => poll().then(() => pairLatest()).catch(e => { state.lastError = e.message; throw e; }), { firstMs: 20000, label: 'MACH fleet poll and pairing' });
    schedule(app, 'fleetBackfill', 24 * 3600e3, () => backfill(), { firstMs: 90000, heavy: 'bulk', label: 'MACH fleet backfill' });   /* v91.17.182 · after the first poll and pairing */
  }

  /* the nearest usable station to a point, for the dashboard's "observed nearby" line */
  /* v91.17.101 · a station is only the reading of a place at about its height: the fleet's own neighbour rule (screen.dz_m, 150 m,
     the same as the siting screen and the running correction) now applies to the headline too. Pir Sohawa (1,228 m) showed MACH
     University Road (about 540 m) 4.9 km away as its measured temperature; it now gets the model at its own height and says why. */
  let PH = null; const ph = () => { if (PH === null) { try { PH = createPointHeight(dataDir); } catch (_) { PH = false; } } return PH || null; };
  const stElev = (r) => { const s = RB.stations && RB.stations[r.key]; return s && s.elevM != null ? s.elevM : (r.elevM ?? r.elev ?? null); };
  /* v91.17.283 · FACTS283 · opts.skip(row) -> true leaves a row out (the place facts skip stations the siting offsets hold out or the screen does not use); no caller before passes it */
  /* v91.17.283.24 · self-audit P9 · why no station was named goes to THIS call's opts.out (was a shared nearest.lastWhy, which kept the
     reason of an earlier place when this call returned early or found a station) */
  function nearest(lat, lon, maxKm = 15, prefer = null, pointElevM = null, opts = {}) {
    if (opts && opts.out) opts.out.why = null;
    if (!state.last) return null;
    let zP = pointElevM; if (zP == null) { try { const h = ph() && ph().heightAt(lat, lon); zP = h && h.ok ? (h.elevM ?? h.cellElevM ?? null) : null; } catch (_) { zP = null; } }
    const dzMax = (rule().screen || {}).dz_m ?? RB_DEF.dz_m; const skipped = [];
    const okDz = (r) => { const z = stElev(r); if (zP == null || z == null) return true; if (Math.abs(z - zP) <= dzMax) return true; skipped.push({ key: r.key, name: r.name, dzM: Math.round(z - zP) }); return false; };
    const tag = (b) => { if (b) { let sc = null; try { sc = screenOne(b.key); } catch (_) { sc = null; } return { ...b, pointElevM: zP, stationElevM: stElev(b), dzRule: dzMax, ...stationStatus(b, sc) }; } if (opts && opts.out) opts.out.why = skipped.length ? { why: 'the nearest weather station' + (skipped.length > 1 ? 's are' : ' is') + ' more than ' + dzMax + ' m above or below this place (' + skipped.slice(0, 2).map(x => x.name + ' ' + (x.dzM > 0 ? '+' : '') + x.dzM + ' m').join(', ') + '): the forecast model is read at the place\'s own height', pointElevM: zP, skipped: skipped.slice(0, 3) } : heldWhy(); return null; };
    /* v91.17.283.51 g1 · S7 (Gilgit: "no AGN station reading within 25 km" beside MACH 105 / 108): stations inside the radius that are held
       back by the display rule are named with the reason, so the line is true; nothing about the rule changes */
    const held = [];
    const holdReason = (r) => { let sc = null; try { sc = screenOne(r.key); } catch (_) { sc = null; } const st = stationStatus(r, sc) || {};
      /* v91.17.283.51 fix (deploy 3 Nov 18:31 rolled back: the long reason list ran off report page 1): plain short words */
      /* the MACH database's own latest time decides: "no reading received", never a claim that the station itself is down (3 Nov: MACH 1
         I-8 worked on site; the MACH database had no reading of it since 30 Oct 06:02 UTC, its /v1/latest said online:false) */
      if (st.status === 'silent') return 'no reading received from the MACH database' + (r.lastUpdated ? ' since ' + shortPkt(r.lastUpdated) : '');
      if ((r.identity && r.identity.kind === 'mixup') || COPYOF.has(String(r.key || '').replace(/^mach:/, ''))) return 'station identity under review (its device reports another site)';
      if (!r.usable) return 'reading failed a quality check';
      if (st.status === 'site-problem') return 'siting check: reads off, not used';
      if (st.status === 'not-yet-checked') return 'reading still being checked';
      if (r.bgChecked !== true) return 'reading still being checked';
      return 'reading not shown (display checks)'; };
    /* v91.17.283.51 fix: ONE short line (page 1, place card); the per-station reasons are data (report appendix, place-card detail) */
    const heldWhy = () => { if (!held.length) return null; const H = held.sort((a, b) => a.km - b.km).slice(0, 6);
      const lab = (x) => (/^MACH/i.test(String(x.name)) ? '' : 'MACH ' + (x.no != null ? x.no + ' ' : '')) + x.name;
      return { why: 'no usable station reading within ' + maxKm + ' km right now (' + held.length + ' station' + (held.length > 1 ? 's' : '') + ' nearby; details in the station list)',
        held: H.map((x) => ({ station: lab(x), km: x.km, reason: x.reason })) }; };
    let best = null;
    /* v91.17.95 · CEO 30 Sep "start with I-8": a preferred station (the flagship I-8 for the Islamabad default view) is used when it
       is usable and within range, even if another station is a little closer */
    /* v91.17.281 · INTEG281 rule C · ONE station display rule for /api/fleet/nearest and /api/place/facts (start card, facts, console):
       the nearest REPORTING station whose readings pass the fleet quality screens: usable (not frozen / stuck, no blocking QC flag), not
       (v91.17.283.14: its temperature value passes obsqc.mjs), and its station status neither 'site-problem' (the screen does not use it) nor 'silent' (not reporting).
       A station held out of the forecast correction by the siting offsets (e.g. MACH 105 Gilgit, MACH 108 Jutial) IS shown: its raw
       reading is a real observation; the displayed reading is the station's own value, never corrected. */
    /* v91.17.283.26 · and only a CHECKED reading (owner, 27 Oct): station status 'checked' and the reading compared with the served
       forecast at its hour (customerRow, the rule /api/fleet/latest applies for customers); a station not yet checked is not shown */
    const shown = (r) => { let sc = null; try { sc = screenOne(r.key); } catch (_) { sc = null; } const st = stationStatus(r, sc); return customerRow({ ...r, usableTemperature: !!r.usable && r.tempC != null, bgChecked: r.bgChecked === true, status: st && st.status }); };
    if (prefer) { const r = state.last.find((x) => x.key === prefer && x.usable && okDz(x) && shown(x)); if (r) { const d = 6371 * Math.acos(Math.min(1, Math.sin(lat * Math.PI / 180) * Math.sin(r.lat * Math.PI / 180) + Math.cos(lat * Math.PI / 180) * Math.cos(r.lat * Math.PI / 180) * Math.cos((lon - r.lon) * Math.PI / 180))); if (d <= maxKm) return tag({ ...r, km: Math.round(d * 10) / 10 }); } }
    for (const r of state.last) {
      if (!r.usable || (opts && opts.skip && opts.skip(r)) || !shown(r)) {
        if (!(opts && opts.skip && opts.skip(r)) && Number.isFinite(r.lat) && Number.isFinite(r.lon)) { const dh = 6371 * Math.acos(Math.min(1, Math.sin(lat * Math.PI / 180) * Math.sin(r.lat * Math.PI / 180) + Math.cos(lat * Math.PI / 180) * Math.cos(r.lat * Math.PI / 180) * Math.cos((lon - r.lon) * Math.PI / 180)));
          if (dh <= maxKm) held.push({ key: r.key, no: r.no != null ? r.no : null, name: r.name, km: Math.round(dh * 10) / 10, reason: holdReason(r) }); }
        continue; }
      const d0 = 6371 * Math.acos(Math.min(1, Math.sin(lat * Math.PI / 180) * Math.sin(r.lat * Math.PI / 180) + Math.cos(lat * Math.PI / 180) * Math.cos(r.lat * Math.PI / 180) * Math.cos((lon - r.lon) * Math.PI / 180)));
      if (d0 > maxKm || !okDz(r)) continue;
      const d = 6371 * Math.acos(Math.min(1, Math.sin(lat * Math.PI / 180) * Math.sin(r.lat * Math.PI / 180) + Math.cos(lat * Math.PI / 180) * Math.cos(r.lat * Math.PI / 180) * Math.cos((lon - r.lon) * Math.PI / 180)));
      if (d <= maxKm && (!best || d < best.km)) best = { ...r, km: Math.round(d * 10) / 10 };
    }
    return tag(best);
  }


  /* ══ v91.17.70 · THE MACH RUNNING CORRECTION (L2): a daily-updated bias of the served basis, from AGN's own stations ════
     Every usable reading is paired with the served basis (L0, forecastFor) at its hour and kept as a residual for 16 days
     (data/mach-running-bias.json). Once a Pakistan day is complete it enters the bias the next day serves:
       · per 3-hour block of the Pakistan day, a decaying average (weight 0.85 per day back) over the last 14 days,
         a block with too few days falling back to the all-hours value; blocks smoothed 1-2-1 and interpolated by hour
       · needs 5 complete days; RESET when the last 3 days differ from the 11 before by more than 2 C (a regime or sensor
         change): only the last 3 days then count; OFF when the newest complete day is more than 2 days old
       · capped at 3 C (temperature) and 5 C (dew point)
     Served only at a point within 5 km and 150 m of a TRUSTED station. Trust is a model-independent siting screen:
     the station against the median of its MACH neighbours (within 15 km and 150 m) by day and by night; a sensor in
     the sun reads warm by day and not at night, a bad site is offset at all hours, a failing sensor scatters. Until a
     station has 10 days of live neighbour pairs, the verdict from its multi-year history screen (data/mach-siting.json)
     stands; a station with neither is not trusted. Dew point is corrected the same way where the humidity sensor is
     trusted. The rule constants are the ones measured in nigraan-local/scripts/temp_zone_rank.py (l2Rule) and are
     read from data/model-zone.json when present. [measured: CHANGES_temperature.md] */
  const RB_DEF = { window_days: 14, decay: 0.85, min_days: 5, reset_days: 3, reset_jump_c: 2.0, cap_c: 3.0, cap_dew_c: 5.0, stale_days: 2, blocks: 8, min_block_hours: 2, radius_km: 5, dz_m: 150, keep_days: 16,
                  city_km: 15, min_city: 2, zones_t: ['plains'], zones_td: ['plains', 'coast'], t_reach_km: 1.0 };
  const rbFile = join(dataDir, 'mach-running-bias.json');
  let RB = { version: 'l2-91.17.70', method: 'MACH running correction state: per station, hourly (reading, reading minus served basis, dew point, dew point minus served basis) for the last keep_days days; the bias served is computed from it (fleet.mjs runningBias)', source: 'AGN MACH fleet live readings (mach.aigeo360.com) paired with the served forecast basis', licence: 'AGN own data', stations: {} }; let rbSavedAt = 0, rbCache = { day: null, at: 0, bias: new Map(), trust: new Map() };
  try { if (existsSync(rbFile)) { const f = JSON.parse(readFileSync(rbFile, 'utf8')); RB.stations = f.stations || {}; } } catch (_) {}
  let SEED = null; try { const f = join(dataDir, 'mach-siting.json'); SEED = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; } catch (_) { SEED = null; }
  /* v91.17.266 · the siting screen's thresholds are the rule in data/mach-siting.json (temp_zone_rank.py wrote them; the history screen
     scripts/mach_db_screen.py reads the same block), so the live and the history screen apply one rule. data/model-zone.json l2Rule.screen
     (the same values) stands in only when that file has no rule; no screen constant is typed in this file. */
  const screenRule = (Z) => { const S = SEED && SEED.rule; if (S && Number.isFinite(S.radius_km) && Number.isFinite(S.dz_m)) return { ...S }; return Z && Z.l2Rule && Z.l2Rule.screen ? { ...Z.l2Rule.screen } : null; };
  const rule = () => { let Z = null; try { Z = app.mos && app.mos.zones && app.mos.zones(); } catch { Z = null; } return { ...RB_DEF, ...((Z && Z.l2Rule) || {}), screen: screenRule(Z) }; };
  const kmBetween = (a, b, c, d) => { const p = Math.PI / 180, x = 0.5 - Math.cos((c - a) * p) / 2 + Math.cos(a * p) * Math.cos(c * p) * (1 - Math.cos((d - b) * p)) / 2; return 12742 * Math.asin(Math.sqrt(x)); };
  /* v91.17.88 · the reading corrected for the station's siting (sun on the sensor, roof, wall) against PMD before it trains
     anything: data/mach-sun-correction.json through hyperlocal.mjs. A station without a table is used as read. */
  const sited = (r, obsMs) => { try { const c = app.hyperlocal && app.hyperlocal.siteCorrect ? app.hyperlocal.siteCorrect(r.lat, r.lon, r.tempC, obsMs) : null; return c && Number.isFinite(c.t) ? c.t : r.tempC; } catch (_) { return r.tempC; } };
  function rbNote(r0, f, h, hourIso, noSave) {
    if (r0.tempC == null || h.raw == null) return;
    const r = { ...r0, tempC: sited(r0, Date.parse(r0.lastUpdated)) };
    const s = RB.stations[r.key] || (RB.stations[r.key] = { lat: r.lat, lon: r.lon, elevM: f.elev ?? null, hours: {} });
    /* v91.17.265 · a station whose registered position moved (MACH 108 corrected 14 Oct 2026, 8.8 km) keeps no pairs made at the old
       position: they compare its readings with the forecast for another place and height */
    if (s.lat != null && s.lon != null && kmBetween(s.lat, s.lon, r.lat, r.lon) > 0.5) { s.hours = {}; s.elevM = f.elev ?? null; }
    s.lat = r.lat; s.lon = r.lon; if (f.elev != null) s.elevM = f.elev; s.basis = f.basis ? { zone: f.basis.zone, model: f.basis.model, ...(f.basis.start ? { start: f.basis.start.source } : {}) } : s.basis || null;   /* v91.17.267 · start: 'multi-model mix' where the plains start is mixed */
    s.hours[hourIso] = [Math.round(r.tempC * 10) / 10, Math.round((r.tempC - h.raw) * 100) / 100, r.dewC == null ? null : Math.round(r.dewC * 10) / 10, (r.dewC == null || h.dew == null) ? null : Math.round((r.dewC - h.dew) * 100) / 100];
    const cut = new Date(Date.now() - rule().keep_days * 864e5).toISOString().slice(0, 13);
    for (const k of Object.keys(s.hours)) if (k < cut) delete s.hours[k];
    rbCache.at = 0;
    if (!noSave && Date.now() - rbSavedAt > 30 * 60e3) { rbSavedAt = Date.now(); try { const t = rbFile + '.tmp'; RB.built = new Date().toISOString(); writeFileSync(t, JSON.stringify(RB)); renameSync(t, rbFile); } catch (_) {} }
  }
  const median = (a) => { const q = a.filter(x => x != null && Number.isFinite(x)).sort((x, y) => x - y); if (!q.length) return null; const m = Math.floor(q.length / 2); return q.length % 2 ? q[m] : (q[m - 1] + q[m]) / 2; };
  /* the siting screen, from the live pairs; the history verdict until 10 days exist */
  /* v91.17.204 · SPEED (8 Oct, laptop: every live call pending, event loop blocked 2-98 s). latest() screened all 107 stations on
     every call and hyperlocal.at calls latest() once per location, so one 120-tehsil forecast batch ran about 13 000 neighbour
     screens (profiled: 39 % of the server's CPU, 188 s of 446 s). The verdict rests on 10+ days of hourly pairs, so it is kept
     per station for 30 minutes and dropped after a backfill. */
  /* ══ v91.17.266 · THE SINGLE-STATION CHECK (CEO build v266) ═════════════════════════════════════════════════════════════════════
     The neighbour screen needs min_neighbours stations within radius_km and dz_m; 37 of 103 stations had none and stayed unchecked.
     (a) REFERENCE NEIGHBOURS: the synoptic and airport stations of the server's synop feed (synop.mjs records(): their 3-hourly
         readings, 12 days) count as neighbours under the same radius / height rule and the same per-hour median of at least two
         values; a verdict a reference reading entered is checkedBy 'reference', else 'neighbours'.
     (b) FORECAST RESIDUAL: a station the neighbour screen cannot judge (too few neighbours, or too few days with two of them
         reporting) and no history verdict: its residual (reading minus the served basis at the hour, the running-correction pairs)
         minus the median residual of the stations already checked by neighbours or reference in the same zone at the same hour
         (at least two). The zone-wide forecast error of the hour cancels; what is left is the station's own offset and scatter,
         judged by the same day / night / IQR / dew rules and min_days of the same rule. checkedBy 'forecast'. A station judged
         this way is not a peer for another forecast check (no circularity).
     Every threshold is the rule in data/mach-siting.json (screenRule). A checked station, on any basis, is trusted for the running
     correction (refreshCache), as before for the neighbour verdict. scripts/mach_db_screen.py applies the same two steps to the
     history record. Reference station names are internal: the client text says "a national reference station". */
  const SCR = new Map(), NBC = new Map(); const SCR_TTL = 30 * 60e3;
  function screenOne(key) { const c = SCR.get(key); if (c && Date.now() - c.at < SCR_TTL) return c.v; const v = screenOneRaw(key); SCR.set(key, { at: Date.now(), v }); return v; }
  function screenNb(key) { const c = NBC.get(key); if (c && Date.now() - c.at < SCR_TTL) return c.v; const v = screenNbRaw(key); NBC.set(key, { at: Date.now(), v }); return v; }
  /* the reference stations of the synop feed, as hour -> [temperature, dew point] (the RB hour key, UTC 'YYYY-MM-DDTHH') */
  let REF = { at: 0, list: [] };
  function refStations() {
    if (Date.now() - REF.at < SCR_TTL) return REF.list;
    const list = [];
    try { const SY = app.synop && app.synop.records ? app.synop.records() : null;
      for (const [sid, y] of Object.entries((SY && SY.stations) || {})) { if (!Number.isFinite(y.lat) || !Number.isFinite(y.lon)) continue;
        const hours = {}; for (const [t, v] of Object.entries(((SY.records || {})[sid]) || {})) if (v && Number.isFinite(v.o)) hours[String(t).slice(0, 13)] = [v.o, Number.isFinite(v.td) ? v.td : null];
        list.push({ sid, lat: y.lat, lon: y.lon, elevM: Number.isFinite(y.elevM) ? y.elevM : null, hours }); } } catch (_) {}
    REF = { at: Date.now(), list }; return list;
  }
  /* the day / night / scatter / dew rules of the screen over a list of anomalies {a, lh} and dew anomalies */
  function judge(R, an, dn) {
    const DH = R.day_hours || [], NH = R.night_hours || [];
    const day = median(an.filter(x => DH.includes(x.lh)).map(x => x.a)), night = median(an.filter(x => NH.includes(x.lh)).map(x => x.a));
    const sorted = an.map(x => x.a).sort((x, y) => x - y); const iqr = sorted.length ? sorted[Math.floor(sorted.length * 0.75)] - sorted[Math.floor(sorted.length * 0.25)] : null;
    const why = [];
    if (day != null && night != null && day > R.sun_excess_c && day - night > R.day_night_c) why.push('warm by day, not at night: sun on the sensor');
    if ((day != null && Math.abs(day) > R.abs_c) || (night != null && Math.abs(night) > R.abs_c)) why.push('site offset');
    if (iqr != null && iqr > R.iqr_c) why.push('scatter');
    const dm = dn.length >= 240 ? median(dn) : null;
    return { why, day, night, iqr, dm };
  }
  const r2 = (x) => x == null ? null : Math.round(x * 100) / 100;
  const lhOf = (h) => (Number(h.slice(11, 13)) + 5) % 24;
  function screenNbRaw(key) {
    const R = rule().screen, s = RB.stations[key]; const seed0 = SEED && SEED.stations && SEED.stations[key];
    const seed = seed0 && seed0.verdict === 'excluded' ? null : seed0;   /* v91.17.283.14 · a history file written before it may still say 'excluded': no station verdict drops a station */
    if (!R) return { verdict: 'unscreened', trusted: false, humidityTrusted: false, why: 'no siting rule on this server (data/mach-siting.json)', checkedBy: null, source: 'live' };
    if (!s) { if (seed && seed.verdict !== 'unscreened') return { verdict: seed.verdict, trusted: seed.verdict === 'trusted', humidityTrusted: !!seed.humidityTrusted, why: seed.why || null, checkedBy: seed.checkedBy || 'neighbours', dayAnomC: seed.dayAnomC ?? null, nightAnomC: seed.nightAnomC ?? null, source: 'history screen (data/mach-siting.json)' };
      return { verdict: 'unknown', trusted: false, humidityTrusted: false, why: 'no live pairs', checkedBy: null }; }
    const near = (o) => kmBetween(s.lat, s.lon, o.lat, o.lon) <= R.radius_km && (s.elevM == null || o.elevM == null || Math.abs(s.elevM - o.elevM) <= R.dz_m);
    const nb = Object.entries(RB.stations).filter(([k, o]) => k !== key && near(o));
    const refs = refStations().filter(near);
    const nN = nb.length + refs.length;
    const an = [], dn = []; const days = new Set(); let refUsed = false;
    if (nN >= R.min_neighbours) for (const [h, v] of Object.entries(s.hours)) {
      const tv = [], dv = []; let ref = false;
      for (const [, o] of nb) { const x = o.hours[h]; if (x && x[0] != null) tv.push(x[0]); if (x && x[2] != null) dv.push(x[2]); }
      for (const o of refs) { const x = o.hours[h]; if (x && x[0] != null) { tv.push(x[0]); ref = true; } if (x && x[1] != null) dv.push(x[1]); }
      if (tv.length < 2) continue;
      if (ref) refUsed = true;
      an.push({ a: v[0] - median(tv), lh: lhOf(h) }); days.add(h.slice(0, 10));
      if (v[2] != null && dv.length >= 2) dn.push(v[2] - median(dv));
    }
    if (days.size < R.min_days) {
      if (seed && seed.verdict !== 'unscreened') return { verdict: seed.verdict, trusted: seed.verdict === 'trusted', humidityTrusted: !!seed.humidityTrusted, why: seed.why || null, checkedBy: seed.checkedBy || 'neighbours', dayAnomC: seed.dayAnomC ?? null, nightAnomC: seed.nightAnomC ?? null, source: 'history screen (data/mach-siting.json)', neighbours: nb.length, references: refs.length };
      return { verdict: 'unscreened', trusted: false, humidityTrusted: false, checkedBy: null, why: nN < R.min_neighbours ? 'fewer than ' + R.min_neighbours + ' stations within ' + R.radius_km + ' km and ' + R.dz_m + ' m' : 'fewer than ' + R.min_days + ' days with two neighbours reporting', neighbours: nb.length, references: refs.length, days: days.size, source: 'live' };
    }
    const J = judge(R, an, dn);
    return { verdict: J.why.length ? 'bad siting' : 'trusted', trusted: !J.why.length, humidityTrusted: !J.why.length && J.dm != null ? Math.abs(J.dm) <= R.dew_abs_c : (!J.why.length && !!(seed && seed.humidityTrusted)), why: J.why.length ? J.why.map(w => w === 'site offset' || w === 'scatter' ? w + ' against its neighbours' : w).join('; ') : null, checkedBy: refUsed ? 'reference' : 'neighbours', dayAnomC: r2(J.day), nightAnomC: r2(J.night), iqrC: r2(J.iqr), neighbours: nb.length, references: refs.length, days: days.size, source: 'live' };
  }
  const zoneOf = (s) => { if (s && s.basis && s.basis.zone) return s.basis.zone; try { return app.mos && app.mos.zoneOfPoint ? app.mos.zoneOfPoint(s.lat, s.lon, s.elevM ?? null) : null; } catch (_) { return null; } };
  /* (b) the forecast-residual check of one station against the neighbour- or reference-checked stations of its zone, hour by hour */
  function screenFc(key) {
    const R = rule().screen, s = RB.stations[key]; if (!R || !s) return null;
    const z = zoneOf(s); if (!z) return { verdict: 'unscreened', trusted: false, humidityTrusted: false, checkedBy: null, why: 'no forecast zone for this station', source: 'live' };
    const peers = Object.entries(RB.stations).filter(([k, o]) => k !== key && zoneOf(o) === z && (() => { const v = screenNb(k); return v.trusted && v.checkedBy !== 'forecast'; })());
    const an = [], dn = []; const days = new Set();
    for (const [h, v] of Object.entries(s.hours)) {
      if (v[1] == null) continue;
      const rv = [], dv = []; for (const [, o] of peers) { const x = o.hours[h]; if (x && x[1] != null) rv.push(x[1]); if (x && x[3] != null) dv.push(x[3]); }
      if (rv.length < 2) continue;
      an.push({ a: v[1] - median(rv), lh: lhOf(h) }); days.add(h.slice(0, 10));
      if (v[3] != null && dv.length >= 2) dn.push(v[3] - median(dv));
    }
    if (days.size < R.min_days) return { verdict: 'unscreened', trusted: false, humidityTrusted: false, checkedBy: null, why: 'fewer than ' + R.min_days + ' days of forecast pairs beside checked stations in the ' + z + ' zone', peers: peers.length, days: days.size, zone: z, source: 'live' };
    const J = judge(R, an, dn);
    return { verdict: J.why.length ? 'bad siting' : 'trusted', trusted: !J.why.length, humidityTrusted: !J.why.length && J.dm != null && Math.abs(J.dm) <= R.dew_abs_c, why: J.why.length ? J.why.map(w => w === 'site offset' || w === 'scatter' ? w + ' against the forecast, relative to checked stations in the ' + z + ' zone' : w).join('; ') : null, checkedBy: 'forecast', dayAnomC: r2(J.day), nightAnomC: r2(J.night), iqrC: r2(J.iqr), peers: peers.length, days: days.size, zone: z, source: 'live' };
  }
  function screenOneRaw(key) {
    const a = screenNb(key); if (a.verdict !== 'unscreened' && a.verdict !== 'unknown') return a;
    const b = screenFc(key); if (b && b.verdict !== 'unscreened') return { ...b, neighbours: a.neighbours, references: a.references };
    if (b && a.verdict === 'unscreened') return { ...a, why: a.why + '; ' + b.why };
    return a;
  }
  /* ── v91.17.266 · interface 2: the station status every fleet row carries ─────────────────────────────────────────────────
     status   'checked' | 'not-yet-checked' | 'site-problem' | 'silent'; statusNote a plain sentence (no supplier name);
     checkedBy 'neighbours' | 'reference' | 'forecast' | null. silent = no reading within FRESH_MIN (the poll's 'dead' rule);
     silentSince (ISO) is the last reading's time. */
  const shortPkt = (iso) => { const ms = Date.parse(iso); if (!Number.isFinite(ms)) return null; const d = new Date(ms + 5 * 3600e3);
    return d.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + ', ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };
  const pktText = (iso) => { const ms = Date.parse(iso); if (!Number.isFinite(ms)) return null; const d = new Date(ms + 5 * 3600e3);
    return d.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ', ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ' PKT'; };
  const f1 = (x) => (x > 0 ? '+' : '') + (Math.round(x * 10) / 10).toFixed(1);
  function stationStatus(r, sc) {
    const R = rule().screen || {};
    const qc = (r && r.qc) || [];
    if (r && (qc.includes('dead') || r.ageMin == null)) { const t = r.lastUpdated ? pktText(r.lastUpdated) : null;
      return { status: 'silent', statusNote: t ? 'No reading since ' + t + '.' : 'No reading received from this station yet.', checkedBy: sc && sc.trusted ? sc.checkedBy || null : null, silentSince: t ? new Date(Date.parse(r.lastUpdated)).toISOString() : null }; }
    if (qc.includes('forecast-not-station')) return { status: 'site-problem', statusNote: 'This record is a forecast product, not a station reading; it is not used.', checkedBy: null };
    if (!sc) return { status: 'not-yet-checked', statusNote: 'The station check could not be read.', checkedBy: null };
    if (sc.verdict === 'bad siting') {
      const base = sc.checkedBy === 'forecast' ? 'against the forecast, compared with checked stations nearby in the same zone' : sc.checkedBy === 'reference' ? 'against nearby stations and a national reference station' : 'against nearby stations';
      const sun = /sun on the sensor/.test(sc.why || ''), scat = /scatter/.test(sc.why || '');
      const fig = Number.isFinite(sc.dayAnomC) && Number.isFinite(sc.nightAnomC) ? ' (' + f1(sc.dayAnomC) + ' °C by day, ' + f1(sc.nightAnomC) + ' °C at night)' : '';
      return { status: 'site-problem', statusNote: (sun ? 'Reads warm in the sun ' : scat ? 'Readings scatter ' : 'Reads off ') + base + fig + '; not used.', checkedBy: sc.checkedBy || null };
    }
    if (sc.trusted) return { status: 'checked', statusNote: sc.checkedBy === 'forecast' ? 'No station close enough to compare with; checked against the forecast beside checked stations in the same zone.' : sc.checkedBy === 'reference' ? 'Checked against nearby stations, including a national reference station.' : 'Checked against nearby stations.', checkedBy: sc.checkedBy || 'neighbours' };
    return { status: 'not-yet-checked', statusNote: (sc.neighbours != null || sc.references != null) && ((sc.neighbours || 0) + (sc.references || 0)) < (R.min_neighbours || 0)
      ? 'Too few stations within ' + R.radius_km + ' km and ' + R.dz_m + ' m of its height to compare with, and fewer than ' + R.min_days + ' days to compare with the forecast yet.'
      : 'Fewer than ' + (R.min_days || '') + ' days of readings to compare yet.', checkedBy: null };
  }
  /* the per-block bias one station serves today, from complete Pakistan days before today */
  function blockBias(key, idx, cap) {
    const R = rule(), s = RB.stations[key]; if (!s) return null;
    const today = pktDay(Date.now()); const byDay = new Map();
    for (const [h, v] of Object.entries(s.hours)) {
      if (v[idx] == null) continue; const ms = Date.parse(h + ':00:00Z'); const d = pktDay(ms); if (d >= today) continue;
      const b = Math.floor(((new Date(ms).getUTCHours() + 5) % 24) / 3);
      const e = byDay.get(d) || byDay.set(d, { all: [], blocks: Array.from({ length: 8 }, () => []) }).get(d); e.all.push(v[idx]); e.blocks[b].push(v[idx]);
    }
    const lo = new Date(Date.parse(today + 'T00:00:00Z') - R.window_days * 864e5).toISOString().slice(0, 10);
    let days = [...byDay.keys()].filter(d => d >= lo && byDay.get(d).all.length >= 12).sort();
    if (!days.length) return null;
    const ageD = (d) => Math.round((Date.parse(today) - Date.parse(d)) / 864e5);
    if (ageD(days[days.length - 1]) > R.stale_days + 1) return null;
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    let reset = false;
    if (days.length >= R.reset_days + 3) { const rec = days.slice(-R.reset_days).map(d => mean(byDay.get(d).all)), old = days.slice(0, -R.reset_days).map(d => mean(byDay.get(d).all)); if (Math.abs(mean(rec) - mean(old)) > R.reset_jump_c) { days = days.slice(-R.reset_days); reset = true; } }
    if (days.length < (reset ? R.reset_days : R.min_days)) return null;
    const w = days.map(d => Math.pow(R.decay, ageD(d) - 1));
    const allh = days.reduce((a, d, i) => a + w[i] * mean(byDay.get(d).all), 0) / w.reduce((a, x) => a + x, 0);
    const out = [];
    for (let b = 0; b < 8; b++) {
      const v = days.map((d, i) => { const x = byDay.get(d).blocks[b]; return x.length >= R.min_block_hours ? [w[i], mean(x)] : null; }).filter(Boolean);
      out.push(v.length >= Math.max(3, Math.floor(days.length / 2)) ? v.reduce((a, [wi, x]) => a + wi * x, 0) / v.reduce((a, [wi]) => a + wi, 0) : allh);
    }
    const sm = out.map((_, b) => (out[(b + 7) % 8] + 2 * out[b] + out[(b + 1) % 8]) / 4).map(x => capped('mach.L2', Math.round(x * 100) / 100, cap));
    return { blocks: sm, days: days.length, reset, newestDay: days[days.length - 1] };
  }
  function refreshCache() {
    const today = pktDay(Date.now());
    if (rbCache.day === today && Date.now() - rbCache.at < 3600e3) return rbCache;
    const R = rule(); const trust = new Map(), bias = new Map();
    /* v91.17.283.14 · no station gate: the pairs hold only values obsqc.mjs passed (a value off its buddies fails there, hour by
       hour), so every station with enough passing days serves; the siting verdict is kept for the status page only */
    for (const key of Object.keys(RB.stations)) {
      const sc = screenOne(key); trust.set(key, sc);
      const t = blockBias(key, 1, R.cap_c); if (!t) continue;
      const d = blockBias(key, 3, R.cap_dew_c);
      bias.set(key, { t, d });
    }
    rbCache = { day: today, at: Date.now(), bias, trust }; return rbCache;
  }
  const atHour = (blocks, tMs) => { const lh = ((new Date(tMs).getUTCHours() + new Date(tMs).getUTCMinutes() / 60) + 5) % 24; const x = (lh - 1.5) / 3; const b0 = ((Math.floor(x) % 8) + 8) % 8, fr = x - Math.floor(x); return (1 - fr) * blocks[b0] + fr * blocks[(b0 + 1) % 8]; };
  /* the correction to ADD at (lat, lon, elevM) for the UTC instant tMs: { applied, t, td, stations }.
     TEMPERATURE: only at a station's own site (within t_reach_km, the nearest station's bias): there it lowered the error;
     carried 2-8 km to another MACH station, alone or as a city median, it did not (temp_zone_rank.py).
     DEW POINT: at a point within radius_km / dz_m of a station, the median of the dew-point biases of the stations within
     city_km (at least min_city): the model's plains dryness is a city-scale error. v91.17.283.14: the biases are built only from
     values obsqc.mjs passed; no station verdict gates them.
     Zones from data/model-zone.json l2Rule (temperature: plains; dew point: plains and coast). */
  function runningBias(lat, lon, elevM, tMs = Date.now()) {
    if (process.env.NIGRAAN_MACH_L2 === '0') return { applied: false, why: 'switched off (NIGRAAN_MACH_L2=0)' };
    const R = rule(), C = refreshCache();
    let zone = null; try { zone = app.mos && app.mos.zoneOfPoint ? app.mos.zoneOfPoint(lat, lon, elevM) : null; } catch (_) {}
    const okT = !zone || (R.zones_t || []).includes(zone), okD = !zone || (R.zones_td || []).includes(zone);
    if (!okT && !okD) return { applied: false, why: 'no running correction in the ' + zone + ' zone (data/model-zone.json l2Rule)' };
    const within = (km) => { const out = []; for (const [key, b] of C.bias) { const s = RB.stations[key]; const d = kmBetween(lat, lon, s.lat, s.lon); if (d <= km && (elevM == null || s.elevM == null || Math.abs(elevM - s.elevM) <= R.dz_m)) out.push({ key, km: d, b }); } return out.sort((a, b) => a.km - b.km); };
    if (!within(R.radius_km).length) return { applied: false, why: 'no weather station within ' + R.radius_km + ' km and ' + R.dz_m + ' m with a current running bias' };
    const own = okT ? within(R.t_reach_km ?? 1)[0] || null : null;
    const t = own ? atHour(own.b.t.blocks, tMs) : null;
    const med = (a) => { const q = a.slice().sort((x, y) => x - y); const m = Math.floor(q.length / 2); return q.length % 2 ? q[m] : (q[m - 1] + q[m]) / 2; };
    const cd = within(R.city_km).filter(n => n.b.d); const td = okD && cd.length >= R.min_city ? med(cd.map(n => atHour(n.b.d.blocks, tMs))) : null;
    if (t == null && td == null) return { applied: false, why: 'no weather station at this site with a current running bias for temperature, and fewer than ' + R.min_city + ' stations with a dew-point bias within ' + R.city_km + ' km for dew point' };
    return { applied: true, t: t == null ? 0 : Math.round(t * 100) / 100, td: td == null ? null : Math.round(td * 100) / 100, temperature: t != null, zone,
             stations: own ? [{ key: own.key, km: Math.round(own.km * 10) / 10, days: own.b.t.days, reset: own.b.t.reset, role: 'temperature' }] : [], dewStations: td != null ? cd.map(n => ({ key: n.key, km: Math.round(n.km * 10) / 10 })) : [], version: RB.version };
  }
  function runningStatus() {
    const C = refreshCache(); const tr = [...C.trust.entries()];
    return { version: RB.version, rule: rule(), stationsHeld: Object.keys(RB.stations).length, trusted: tr.filter(([, v]) => v.trusted).length, serving: C.bias.size,
             verdicts: Object.fromEntries(tr.map(([k, v]) => [k, { verdict: v.verdict, source: v.source || null, humidityTrusted: v.humidityTrusted, serving: C.bias.has(k), days: C.bias.has(k) ? C.bias.get(k).t.days : null, reset: C.bias.has(k) ? C.bias.get(k).t.reset : null }])) };
  }

  /* v91.17.283.26 · the rows of the last poll with their station status (one place for latest() and status()) */
  function latestRows() { return (state.last || []).map(r => { let sc = null; try { sc = screenOne(r.key); } catch (_) { sc = null; } return { key: r.key, no: r.no != null ? r.no : null, name: r.name, lat: r.lat, lon: r.lon, lastUpdated: r.lastUpdated || null, provider: r.provider || null, why: r.why || null, ageMin: r.ageMin, usable: r.usable, usableTemperature: !!r.usable && r.tempC != null, bgChecked: r.bgChecked === true, trusted: sc ? sc.trusted === true : null, siting: sc ? sc.verdict || null : null, ...stationStatus(r, sc), qc: r.qc, mirrorOf: r.mirrorOf || null, tempC: r.tempC, rhPct: r.rhPct, dewC: r.dewC, windKmh: r.windKmh, gustKmh: r.gustKmh, pressureHpa: r.pressureHpa, precipRateMm: r.precipRateMm }; }); }

  const api = {
    /* v91.17.283.52 D · N7 / N27 (live test 52: the start chip read 0/108 then 20/108, the feeds table 79, a console 26 usable, Customize 108):
       ONE station count everywhere, labelled: reportingNow = the stations whose latest reading is in the live window AND passed the checks
       (counts(), the class every page and the place record read); received = stations with any reading in the live window (before the checks);
       while the feed is down the count is not given and the reason is (unavailable) */
    status: () => ({ ...(() => { try { const C = api.counts({}); const un = C.unavailable || (!state.last ? 'station data not received yet (no poll has finished since the server started)' : null);
        return { reportingNow: un ? null : C.fleet.reportingNow, registeredTotal: C.fleet.total, unavailable: un,
        countLabel: 'Stations reporting now (a reading in the last ' + FRESH_MIN + ' min that passed the station checks)', countRule: C.rule }; } catch (_) { return {}; } })(),
      usableChecked: (() => { try { return latestRows().filter(customerRow).length; } catch (_) { return null; } })(),   /* v91.17.283.26 · the stations a customer sees (checked readings) */ configured: state.configured, copy: state.copy || null, copyPolls: state.copyPolls || 0, polls: state.polls, base: state.base, tokenPresent: !!token, db: { ...state.db, from: state.fromDb || 0, backfill: { ...bfState } },
      mach: state.mach || (() => { try { const f = join(ownPath(root, ...OWN.machDb), 'latest_status.json'); if (!existsSync(f)) return null; const j = JSON.parse(readFileSync(f, 'utf8')); return machSummary(j.stations || [], j.updatedAt || null); } catch (_) { return null; } })(),
      stations: state.stations.length, registered: state.registered || state.stations.length, unlocated: Math.max(0, (state.registered || 0) - state.stations.length), polls: state.polls, lastAt: state.lastAt, usable: state.usable, screened: state.screened, errors: state.errors, lastError: state.lastError, lakeFile: state.lakeFile, seriesSeed: state.seriesSeed || null /* v283.44: the frozen-check seed at start */, pollMinutes: POLL_MS / 60000,
      runningCorrection: (() => { try { const r = runningStatus(); return { version: r.version, stationsHeld: r.stationsHeld, trusted: r.trusted, serving: r.serving }; } catch { return null; } })(),
      note: 'Observation network; readings pass the five-rule screen before they are kept (dead > 60 min, mirrored record, imperial units, physics, forecast-not-station). NIGRAAN_FLEET=0 switches the poll off.' }),
    /* v91.17.172 · audit O-10 · each row carries the siting screen's verdict against its MACH neighbours (screenOne), so a reading that
       passes QC but sits badly against its neighbours is not shown as normal; null when the screen cannot be read */
    /* v91.17.266 · interface 2: status, statusNote, checkedBy (and silentSince) on every row (stationStatus) */
    /* v91.17.283.26 · CUSTOMERS SEE ONLY CHECKED READINGS (owner, 27 Oct 2026: Kot Radha Kishan showed 11.0 °C from a reading not yet checked).
       latest({ customer: true }) (every request that is not the operator's view) lists only a reading that passed the value checks
       (usable), of a station whose check passed (status 'checked': neighbours, a reference station or the forecast), and that was
       compared with the served forecast at its hour (bgChecked: the residual screen of data/fleet-range-screen.json ran); a reading
       not yet checked, unusable, or of a station with a site problem or silent is never sent to a customer. The operator's view
       keeps every row with its status. customerRow is the one rule; status().usableChecked counts the same rows. */
    latest: ({ customer = false } = {}) => { const feed = feedOf(state.feed || (state.lastAt ? { lastGoodAt: state.lastAt } : null)); const down = !!feed.text && !feed.ok;
      const rows = latestRows(); const out = customer ? (down ? [] : rows.filter(customerRow)) : rows;   /* v283.49 item 4: no stale reading is shown as now */
      return { at: state.lastAt, feed, ...(down ? { unavailable: feed.text } : {}), usable: customer ? out.length : state.usable, ...(customer ? { view: 'customer: checked readings only' } : {}), rows: out }; },
    stations: () => state.stations,
    pairs: () => ({ ...pairState, seen: undefined, cached: fc.size, refreshHours: PAIR_REFRESH_MS / 3600e3, now: scoreNow() }),
    /* v91.17.273 · ACC · read only, for the accuracy monitor: the served chain up to the live layer at a station and UTC hour ('YYYY-MM-DDTHH',
       the pairs' own cache, past 3 days + 2 ahead), and the registry exclusion */
    /* v91.17.273.1 · the same cache as plain data (key|YYYY-MM-DDTHH -> served), for the accuracy monitor's backfill worker */
    servedCache: () => { const o = {}; for (const [k, f] of fc) for (const [h, v] of f.hours) if (v && Number.isFinite(v.served)) o[k + '|' + h] = v.served; return o; },
    servedAt: (key, hourIso) => { const f = fc.get(key); const h = f && f.hours.get(String(hourIso).slice(0, 13)); return h && Number.isFinite(h.served) ? h.served : null; },
    /* v91.17.283.14 · the value-level verdicts: the last poll's (key -> { variable: { test, size } }) and the counts */
    qcLatest: () => ({ ...state.qc, rows: Object.fromEntries((state.last || []).filter((r) => r.qcv && Object.keys(r.qcv).length).map((r) => [r.key, r.qcv])) }),
    /* v91.17.283.2 - read only, for the ECMWF 0.1 deg shadow (ecmwf010.mjs): one station's cached answer (fetch time, point height, hours) */
    fcHours: (key) => { const f = fc.get(key); return f ? { at: f.at, elev: f.elev, hours: [...f.hours.entries()] } : null; },
    shielded: () => Object.fromEntries(SHIELDED), rangeRejectedTotal: () => state.rangeRejectedTotal,   /* v91.17.283 · WS2 items 4, 8 */
    nearest, poll, pairLatest, backfill, backfillStatus: () => ({ ...bfState }), offsetFor, refreshOffsets, offsets: () => ({ ...offState, version: OFF.version || null, refKm: OFF.refKm || null, fences: OFF.fences || null, stations: OFF.stations || {} }), runningBias, runningStatus, screen: screenOne, stationStatus, blockBias, elevOf: (key) => stElev({ key }), screenRule: () => rule().screen,
    /* v91.17.266 · every registered station with its status, polled or not (the stations table and the tests read it) */
    /* v91.17.278.1 · FIX2781 · a station the server holds no poll row for (the first poll after a start has not finished, or the station
       was not in the poll that did) has no known state: it is marked pending, with no status and no note, never "silent, no reading
       received" (live 17 Oct 19:36-19:42 PKT: every Lahore station in the past-30-days answer said "No reading received" for 5 min after
       the v278 deploy while the stations were reporting). statusReady(): the fleet's first poll has finished and holds a row for every registered
       station, or the poll is off (then no status will ever arrive and there is nothing to wait for); past30.mjs keeps no answer built before that. */
    statusAll: () => { const last = new Map((state.last || []).map(r => [r.key, r])); return state.stations.map(st => { const r = last.get(st.key); let sc = null; try { sc = screenOne(st.key); } catch (_) { sc = null; } const head = { key: st.key, no: st.no ?? null, name: st.name, verdict: sc ? sc.verdict : null };
      return r ? { ...head, ...stationStatus(r, sc) } : { ...head, status: null, statusNote: null, checkedBy: null, pending: true }; }); },
    /* v91.17.283.28 · S6 · THE ONE STATION COUNT (every page and the place record read it; nothing else counts statuses). Every registered
       station falls in exactly one class, from its status (stationStatus, the fleet's own rules):
         reportingNow   status 'checked': a reading within the poll's live window that passed the station check
         recent         status 'silent' but its last reading is from today (Pakistan day): it reported earlier today, not now
         offline        status 'silent' and no reading today (or none ever received)
         notUsed        status 'site-problem' (a siting or record problem: its readings are not used)
         notYetChecked  status 'not-yet-checked', or no poll row yet (pending)
       With lat/lon (and km, default the nearest-station radius 25 km) the same classes are counted within that distance as well. */
    counts: ({ lat = null, lon = null, km = 25, nowMs = Date.now() } = {}) => { const last = new Map((state.last || []).map((r) => [r.key, r])); const today = pktDay(nowMs);
      const feed = feedOf(state.feed || (state.lastAt ? { lastGoodAt: state.lastAt } : null), nowMs), down = !!feed.unavailableSince || (!feed.ok && !!feed.text);
      const cls = (st) => { const r = last.get(st.key); if (!r) return 'notYetChecked'; let sc = null; try { sc = screenOne(st.key); } catch (_) { sc = null; } const x = stationStatus(r, sc);
        if (x.status === 'checked' && !down) return 'reportingNow'; if (x.status === 'checked') return r.lastUpdated && pktDay(Date.parse(r.lastUpdated)) === today ? 'recent' : 'offline'; if (x.status === 'site-problem') return 'notUsed'; if (x.status === 'not-yet-checked') return 'notYetChecked';
        return r.lastUpdated && pktDay(Date.parse(r.lastUpdated)) === today ? 'recent' : 'offline'; };
      const zero = () => ({ reportingNow: 0, recent: 0, offline: 0, notUsed: 0, notYetChecked: 0, total: 0 });
      const all = zero(), near = lat != null && lon != null ? zero() : null;
      for (const st of state.stations) { const c = cls(st); all[c]++; all.total++; if (near && kmBetween(lat, lon, st.lat, st.lon) <= km) { near[c]++; near.total++; } }
      return { ok: true, at: state.lastAt || null, ready: !!state.last && !down, fleet: all, feed, ...(down ? { unavailable: feed.text } : {}), ...(near ? { near: { ...near, km } } : {}), source: 'observation network',
        rule: 'every registered station in one class by its status: reporting now (checked reading in the live window), recent (reported earlier today), offline (no reading today), not used (site or record problem), not yet checked' }; },
    /* v283.51g3 · the time of the last finished poll (past30.mjs keys its window record on it) */
    pollAt: () => state.lastAt,
    statusReady: () => { if (!state.configured || process.env.NIGRAAN_FLEET === '0' || !state.stations.length) return true; if (state.last == null) return false;
      const have = new Set(state.last.map(r => r.key)); return state.stations.every(st => have.has(st.key)); },
    /* v91.17.88 · every usable reading of the last poll beside the SERVED value for its hour (the L3 live layer's input) */
    liveReadings: () => {
      const out = [];
      for (const r of (state.last || [])) {
        if (!r.usable || r.tempC == null || !r.lastUpdated) continue;
        const obsMs = Date.parse(r.lastUpdated); if (!Number.isFinite(obsMs)) continue;
        const f = fc.get(r.key); if (!f) continue;
        const hourIso = new Date(Math.round(obsMs / 3600e3) * 3600e3).toISOString().slice(0, 13); const h = f.hours.get(hourIso);
        if (!h || h.served == null) continue;
        let trusted = null; try { trusted = screenOne(r.key).trusted; } catch (_) {}
        out.push({ key: r.key, name: r.name, lat: r.lat, lon: r.lon, obsMs, tempC: r.tempC, served: h.served, hourIso, trusted, offset: offsetFor(r.key) });
      }
      return out;
    },
  };
  return api;
}
