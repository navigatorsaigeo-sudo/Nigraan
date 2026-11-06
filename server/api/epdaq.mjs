/* ══ v91.17.147 · PUNJAB EPD AIR-QUALITY STATIONS (aqi.punjab.gov.pk, public page) ═══════════════════════════════════════
   The Environment Protection Department's public dashboard carries, in the page itself, the latest hourly reading of each of its
   monitoring stations (about 50: PM2.5, PM10, NO2, O3, CO, SO2, and temperature, humidity and wind at the station) with the
   station's position and the reading time. Every 30 minutes this module reads the public page (as one browser visit would), keeps
   14 days in data/cache/epd-recent.json and appends new readings to station-lake/archive/epd/epd_YYYY-MM.jsonl.
   Use: INTERNAL calibration and verification of the air-quality forecast (the page states "All Rights Reserved"; the readings are
   not shown to customers without EPD's permission). The page's own API key is not used. NIGRAAN_EPD=0 switches it off. */
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { schedule } from './scheduler.mjs';

function grabArray(s, name) {
  for (let i = s.indexOf(name); i >= 0; i = s.indexOf(name, i + 1)) { const a = grabAt(s, i); if (Array.isArray(a) && a.length) return a; }
  return null;
}
function grabAt(s, i) {
  const j = s.indexOf('[', i); if (j < 0 || j - i > 40 || !/^\s*=\s*$/.test(s.slice(i, j).replace(/^[\w.]+/, ''))) return null;
  let depth = 0, inStr = false, esc = false;
  for (let k = j; k < s.length; k++) { const c = s[k];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '[') depth++; else if (c === ']') { depth--; if (depth === 0) { try { return JSON.parse(s.slice(j, k + 1)); } catch (_) { return null; } } } }
  return null;
}
const num = (v) => { const x = v == null || v === '' ? NaN : Number(v); return Number.isFinite(x) ? x : null; };

export function createEpdAq(app, dataDir) {
  const on = () => process.env.NIGRAAN_EPD !== '0';
  const recFile = join(dataDir, 'cache', 'epd-recent.json'); const lake = join(dataDir, '..', '..', 'station-lake', 'archive', 'epd');
  let REC = { stations: {}, obs: {} }; try { REC = JSON.parse(readFileSync(recFile, 'utf8')); } catch (_) {}
  const state = { lastPoll: null, lastError: null, stations: 0, newReadings: 0 };
  async function poll() {
    if (!on()) return;
    try {
      const r = await fetch('https://aqi.punjab.gov.pk/', { headers: { 'User-Agent': 'AGN-NIGRAAN/91.17 (hourly read of the public page)' }, signal: AbortSignal.timeout(90000) });
      if (!r.ok) { state.lastError = 'http ' + r.status; return; }
      const s = await r.text(); const rows = grabArray(s, 'realtimeStations') || [];
      const all = grabArray(s, 'allStationsData') || []; const seen = new Set(); const list = [];
      for (const x of rows.concat(all)) { if (!x || x.station_name == null) continue; const k = String(x.station_id ?? x.station_name); if (seen.has(k)) continue; seen.add(k); list.push(x); }
      let fresh = 0; const arch = [];
      for (const x of list) {
        const id = String(x.station_id ?? x.station_name), lat = num(x.latitude), lon = num(x.longitude), t = x.timestamp ? new Date(x.timestamp).toISOString().slice(0, 16) + ':00Z' : null;
        if (lat == null || lon == null || !t) continue;
        REC.stations[id] = { name: x.station_name, district: x.district || null, city: x.city || null, lat, lon };
        const v = { pm25: num(x.pm25), pm10: num(x.pm10), no2: num(x.no2), o3: num(x.o3), co: num(x.co), so2: num(x.so2), t_c: num(x.temperature), rh: num(x.humidity), ws: num(x.wind_speed), wd: num(x.wind_direction), flags: x.pollutant_flags || null };
        /* plausibility: PM2.5 0..1500 ug/m3 and not above PM10 by more than 10 %; a flagged reading (maintenance, calibration...) is kept flagged */
        if (v.pm25 != null && (v.pm25 < 0 || v.pm25 > 1500 || (v.pm10 != null && v.pm25 > v.pm10 * 1.1))) v.pm25bad = true;
        const O = REC.obs[id] || (REC.obs[id] = {}); if (!O[t]) { fresh++; arch.push(JSON.stringify({ id, t, lat, lon, ...v })); } O[t] = v;
      }
      const cut = Date.now() - 14 * 864e5; for (const O of Object.values(REC.obs)) for (const t of Object.keys(O)) if (Date.parse(t) < cut) delete O[t];
      mkdirSync(join(dataDir, 'cache'), { recursive: true }); writeFileSync(recFile + '.tmp', JSON.stringify(REC)); renameSync(recFile + '.tmp', recFile);
      if (arch.length) { mkdirSync(lake, { recursive: true }); appendFileSync(join(lake, 'epd_' + new Date().toISOString().slice(0, 7) + '.jsonl'), arch.join('\n') + '\n'); }
      state.lastPoll = new Date().toISOString(); state.stations = list.length; state.newReadings = fresh; state.lastError = null;
    } catch (e) { state.lastError = e.message; }
  }
  /* v91.17.283.30 · DISTRICT HISTORY (gap fill). The public page keeps only the latest hour of each station, so hours missed while this
     computer was off are lost at station level. The page's own "Trends" panel reads the last 7 days of HOURLY DISTRICT MEANS
     (POST /api/historical-aqi-data {district_name}, with the page's CSRF token and session cookie, exactly as the page does). Once a day
     (and at start when the last good run is older than 20 h) every district listed in the page's own dropdown is read in turn, politely
     (one at a time, a pause between), and new rows are appended, de-duplicated, to station-lake/archive/epd/epd_district_YYYY-MM.jsonl,
     labelled kind "district_mean" with the station count and names. Never merged into the station file; internal use only (calibration
     and verification of the air-quality forecast), never shown to customers. Same switch NIGRAAN_EPD=0. A 7-day gap is filled at district
     level; older hours and station-level hours are not recoverable. (/api/station-yesterday-aqi gives one daily AQI number per station,
     not hourly values, so it is not used.) */
  const histState = join(dataDir, 'cache', 'epd-history-state.json');
  const H = { lastRun: null, lastOk: null, lastError: null, districts: 0, rowsNew: 0, rowsSeen: 0, failed: [], window: null };
  try { Object.assign(H, JSON.parse(readFileSync(histState, 'utf8'))); } catch (_) {}
  const BASE = process.env.NIGRAAN_EPD_BASE || 'https://aqi.punjab.gov.pk';
  const PAUSE = Math.max(0, Number(process.env.NIGRAAN_EPD_HIST_PAUSE_MS ?? 2000));
  function cookieJar(res, jar) { const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
    for (const c of list) { const kv = String(c).split(';')[0]; const i = kv.indexOf('='); if (i > 0) jar[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); } return jar; }
  const cookieStr = (jar) => Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ');
  function districtsOf(html) { const i = html.indexOf('id="historical-district-dropdown"'); if (i < 0) return [];
    const j = html.indexOf('</select>', i); const out = []; const re = /<option[^>]*value="([^"]*)"/g; let m; const seg = html.slice(i, j > i ? j : i + 20000);
    while ((m = re.exec(seg))) { const v = m[1].replace(/&amp;/g, '&').trim(); if (v && !out.includes(v)) out.push(v); } return out; }
  function existingKeys(months) { const keys = new Set();
    for (const mo of months) { let t = ''; try { t = readFileSync(join(lake, 'epd_district_' + mo + '.jsonl'), 'utf8'); } catch (_) { continue; }
      for (const line of t.split('\n')) { if (!line) continue; try { const r = JSON.parse(line); keys.add(r.district + '|' + r.t); } catch (_) {} } }
    return keys; }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function pollHistory({ force = false } = {}) {
    if (!on()) return H;
    if (!force && H.lastOk && Date.now() - Date.parse(H.lastOk) < 20 * 3600e3) return H;
    H.lastRun = new Date().toISOString(); H.failed = []; H.rowsNew = 0; H.rowsSeen = 0; H.lastError = null;
    try {
      const jar = {}; const UA = 'AGN-NIGRAAN/91.17 (daily read of the public trends panel)';
      const r0 = await fetch(BASE + '/', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(90000) });
      if (!r0.ok) throw new Error('page http ' + r0.status);
      cookieJar(r0, jar); const html = await r0.text();
      const tok = (html.match(/<meta name="csrf-token" content="([^"]+)"/) || [])[1];
      if (!tok) throw new Error('no csrf token on the page');
      const D = districtsOf(html); H.districts = D.length; if (!D.length) throw new Error('no district list on the page');
      const now = new Date(); const months = [0, -1].map((k) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + k, 1)).toISOString().slice(0, 7));
      const keys = existingKeys(months); const add = {}; let lo = null, hi = null;
      for (const d of D) {
        try {
          const r = await fetch(BASE + '/api/historical-aqi-data', { method: 'POST', signal: AbortSignal.timeout(60000),
            headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-TOKEN': tok, 'X-Requested-With': 'XMLHttpRequest', Referer: BASE + '/', Origin: BASE, Cookie: cookieStr(jar) },
            body: JSON.stringify({ district_name: d }) });
          cookieJar(r, jar);
          if (!r.ok) { H.failed.push(d + ': http ' + r.status); continue; }
          const j = await r.json(); const o = (j && (j.data || j)) || {}; const days = Array.isArray(o.organized_data) ? o.organized_data : Object.values(o.organized_data || {});
          for (const row of days.flat()) {
            if (!row || !row.datetime) continue; const ms = Date.parse(row.datetime); if (!Number.isFinite(ms)) continue;
            const t = new Date(ms).toISOString().slice(0, 13) + ':00:00Z'; H.rowsSeen++;
            const k = d + '|' + t; if (keys.has(k)) continue; keys.add(k);
            const rec = { kind: 'district_mean', source: 'history', district: d, t, aqi: num(row.aqi), pm25: num(row.pm25), pm10: num(row.pm10), no2: num(row.no2), so2: num(row.so2), co: num(row.co), o3: num(row.o3),
              t_c: num(row.temperature), rh: num(row.humidity), ws: num(row.wind_speed), wd: num(row.wind_direction), station_count: num(row.station_count), station_names: Array.isArray(row.station_names) ? row.station_names : null };
            const mo = t.slice(0, 7); (add[mo] || (add[mo] = [])).push(JSON.stringify(rec)); H.rowsNew++;
            if (!lo || t < lo) lo = t; if (!hi || t > hi) hi = t;
          }
        } catch (e) { H.failed.push(d + ': ' + String(e.message || e).slice(0, 80)); }
        if (PAUSE) await sleep(PAUSE);
      }
      mkdirSync(lake, { recursive: true });
      for (const [mo, lines] of Object.entries(add)) appendFileSync(join(lake, 'epd_district_' + mo + '.jsonl'), lines.join('\n') + '\n');
      H.window = lo ? { from: lo, to: hi } : H.window;
      if (H.failed.length < D.length) H.lastOk = new Date().toISOString(); else H.lastError = 'every district failed';
    } catch (e) { H.lastError = String(e.message || e).slice(0, 200); }
    try { mkdirSync(join(dataDir, 'cache'), { recursive: true }); writeFileSync(histState + '.tmp', JSON.stringify(H)); renameSync(histState + '.tmp', histState); } catch (_) {}
    return H;
  }
  /* v91.17.283.30 · the daily district AQI record (station-lake/archive/epd/epd_district_daily.csv, written by the epdDaily pyjob:
     owner exports + daily means of the district history). AQI index values (not PM2.5); partial rows flagged. Operator only. */
  function daily({ district = null, from = null, to = null, full = true } = {}) {
    let t = ''; try { t = readFileSync(join(lake, 'epd_district_daily.csv'), 'utf8'); } catch (_) { return { ok: false, why: 'no daily record yet', rows: [] }; }
    const L = t.split(/\r?\n/).filter(Boolean); const head = (L.shift() || '').split(','); const rows = [];
    for (const line of L) { const v = []; let cur = '', q = false;
      for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { v.push(cur); cur = ''; } else cur += c; }
      v.push(cur); const r = {}; head.forEach((h, i) => { r[h] = v[i] ?? ''; });
      if (district && r.district !== district) continue; if (from && r.date < from) continue; if (to && r.date > to) continue; if (full && r.partial === '1') continue;
      rows.push({ ...r, aqi: num(r.aqi), station_count: num(r.station_count), hours: num(r.hours), partial: r.partial === '1' }); }
    return { ok: true, what: 'EPD daily district AQI index (not PM2.5); internal verification only', rows };
  }
  function latest() { const out = []; for (const [id, st] of Object.entries(REC.stations)) { const O = REC.obs[id] || {}; const ts = Object.keys(O).sort(); const t = ts[ts.length - 1]; if (t) { const ageH = (Date.now() - Date.parse(t)) / 3600e3; out.push({ id, ...st, t, ...O[t], ageH: Number.isFinite(ageH) ? Math.round(ageH * 10) / 10 : null, stale: !(ageH <= 3) }); } } return out; }   /* v91.17.157 · audit: each station's age and a stale flag (> 3 h) */
  function status() { return { on: on(), ...state, held: Object.keys(REC.stations).length, use: 'internal calibration and verification only',
    history: { what: 'district hourly means, last 7 days, once a day (gap fill)', lastRun: H.lastRun, lastOk: H.lastOk, lastError: H.lastError, districts: H.districts, rowsNew: H.rowsNew, failed: H.failed.length, window: H.window } }; }
  function start() { if (!on()) return; schedule(app, 'epdaq', 1800e3, () => poll(), { firstMs: 60000, label: 'Punjab EPD air quality page' });
    schedule(app, 'epdhist', 3600e3, () => pollHistory(), { firstMs: 5 * 60e3, label: 'Punjab EPD district history (7 days, gap fill; runs when the last good read is older than 20 h)' });   /* v91.17.155 · every 30 min: the page holds only the latest hour, so an hourly read that slipped (restart, slow page) lost that hour (4 Oct: 3 hours missing) */ }
  return { poll, pollHistory, daily, latest, status, start, recent: () => REC };
}
