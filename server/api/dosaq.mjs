/* == v91.17.283.52 set E · US DEPARTMENT OF STATE AIR-QUALITY MONITORS, LIVE (owner 3/4 Nov 2026) ========================================
   The four US Department of State monitors in Pakistan (Islamabad embassy; Lahore, Karachi, Peshawar consulates) report hourly PM2.5.
   NIGRAAN used only their history (AirNow, Aug 2022 - Feb 2026; D:\NIGRAAN\inputs\air_quality\airnow_hist.py) to fit
   data/pm25-correction.json. This module reads them live, every 30 minutes, like epdaq.mjs reads the Punjab stations:
     1. the AirNow data API, the same request airnow_hist.py made for the history (aq/data, PM25, the Pakistan box, dataType C, raw
        concentrations), for the last 4 hours, when the AirNow key is held (env NIGRAAN_AIRNOW_KEY, or the key file the history script used:
        <NIGRAAN>\inputs\air_quality\.airnow). The hourly value is RawConcentration (Value is the NowCast concentration, not used).
        Hours are AirNow's hour BEGINNING, UTC.
     2. for any of the four cities the API did not answer, the Department of State's public feed (no key): the per-city RSS
        https://dosairnowdata.org/dos/RSS/<City>/<City>-PM2.5.xml (items: Param, ReadingDateTime in local time, Conc, AQI; the older
        "date; PM2.5; conc; AQI; class" description line is read too). Hour beginning, Pakistan time.
   Missing (-999, empty) is dropped; the QC of a reading for display is aqnow.mjs (zero / negative / out of range / stuck / age). 48 hours are
   kept in data/cache/dos-recent.json; every new reading is appended to station-lake/archive/dos/dos_YYYY-MM.jsonl.
   SCORING: once a Pakistan day is over, each monitor's daily mean PM2.5 (QC-passed hours; complete = at least 18 of 24 hours, US EPA 40 CFR 50
   App. N, the smog.mjs AQ_DAY_MIN_HOURS rule) is appended to station-lake/archive/aq/dos_daily_YYYY-MM.jsonl, beside the issued-forecast
   block (issued_YYYY-MM.jsonl), so scripts/aq_issued_score.py can score the served forecast against them.
   Customers never see the monitor or the agency (aqnow.mjs). The key is never logged or returned. NIGRAAN_DOS=0 switches it off. */
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { schedule } from './scheduler.mjs';
import { readingFault } from './aqnow.mjs';

export const DOS_SITES = [
  { id: '586PK1010001', name: 'Islamabad', city: 'Islamabad', lat: 33.725614, lon: 73.11602 },
  { id: '586PK3010003', name: 'Lahore', city: 'Lahore', lat: 31.560078, lon: 74.33589 },
  { id: '586PK2010001', name: 'Karachi', city: 'Karachi', lat: 24.8415, lon: 67.0091 },
  { id: '586PK4010001', name: 'Peshawar', city: 'Peshawar', lat: 34.005852, lon: 71.53775 },
];   /* positions and AQS codes: the AirNow history files (inputs/air_quality/airnow) */
const KEEP_H = 48, DAY_MIN_HOURS = 18, PKT = 5 * 3600e3;
const num = (v) => { const x = v == null || v === '' ? NaN : Number(v); return Number.isFinite(x) && x > -999 ? x : null; };
const hourIso = (ms) => new Date(Math.floor(ms / 3600e3) * 3600e3).toISOString().slice(0, 13) + ':00:00Z';
const noKey = (s) => String(s || '').replace(/API_KEY=[^&\s]*/gi, 'API_KEY=***').replace(/https?:\/\/\S+/g, (u) => u.replace(/[?].*$/, '?…')).slice(0, 200);

/* AirNow data API rows -> readings { id, t, pm25, nowcastConc, aqi } */
export function parseAirNow(rows) {
  const out = []; if (!Array.isArray(rows)) return out;
  for (const r of rows) { if (!r || String(r.Parameter || '').replace(/\W/g, '').toUpperCase() !== 'PM25') continue;
    const code = String(r.IntlAQSCode || r.FullAQSCode || ''), ag = String(r.AgencyName || '');
    let s = DOS_SITES.find((x) => x.id === code || x.id.endsWith(code) || code.endsWith(x.id.slice(3)));
    if (!s && /Department of State Pakistan/i.test(ag)) s = DOS_SITES.find((x) => Math.abs(x.lat - Number(r.Latitude)) < 0.05 && Math.abs(x.lon - Number(r.Longitude)) < 0.05);
    if (!s) continue; const ms = Date.parse(String(r.UTC || '').slice(0, 16) + ':00Z'); if (!Number.isFinite(ms)) continue;
    out.push({ id: s.id, t: hourIso(ms), pm25: num(r.RawConcentration), nowcastConc: num(r.Value), aqi: num(r.AQI), via: 'airnow' }); }
  return out;
}
/* "11/03/2026 10:00:00 PM" or "11-03-2026 22:00" (Pakistan time) -> UTC ms */
function pkLocal(s) {
  const m = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i.exec(String(s || '')); if (!m) return NaN;
  let h = +m[4]; if (m[6]) { const pm = /pm/i.test(m[6]); if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
  return Date.UTC(+m[3], +m[1] - 1, +m[2], h, +m[5]) - PKT;
}
/* the Department of State RSS of one city -> readings */
export function parseDosRss(xml, site) {
  const out = []; const tag = (s, n) => { const m = new RegExp('<' + n + '[^>]*>([\\s\\S]*?)</' + n + '>', 'i').exec(s); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : null; };
  for (const m of String(xml || '').matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) { const it = m[1];
    let par = tag(it, 'Param'), when = tag(it, 'ReadingDateTime'), conc = tag(it, 'Conc'), aqi = tag(it, 'AQI');
    if (when == null || conc == null) { const d = tag(it, 'description') || ''; const p = d.split(';').map((x) => x.trim());
      if (p.length >= 3) { when = when ?? p[0]; par = par ?? p[1]; conc = conc ?? p[2]; aqi = aqi ?? p[3]; } }
    if (par && String(par).replace(/\W/g, '').toUpperCase() !== 'PM25') continue;
    const ms = pkLocal(when); if (!Number.isFinite(ms)) continue;
    out.push({ id: site.id, t: hourIso(ms), pm25: num(conc), aqi: num(aqi), via: 'dos-rss' }); }
  return out;
}

export function createDosAq(app, dataDir, o = {}) {
  const on = () => process.env.NIGRAAN_DOS !== '0';
  const recFile = join(dataDir, 'cache', 'dos-recent.json'), stFile = join(dataDir, 'cache', 'dos-state.json');
  const lake = join(dataDir, '..', '..', 'station-lake', 'archive', 'dos'), aqLake = join(dataDir, '..', '..', 'station-lake', 'archive', 'aq');
  const keyFile = process.env.NIGRAAN_AIRNOW_KEY_FILE || join(dataDir, '..', '..', '..', 'inputs', 'air_quality', '.airnow');
  const API = process.env.NIGRAAN_AIRNOW_BASE || 'https://www.airnowapi.org', RSS = process.env.NIGRAAN_DOS_BASE || 'https://dosairnowdata.org';
  const fetchFn = o.fetch || ((...a) => fetch(...a));
  let REC = { stations: {}, obs: {} }; try { REC = JSON.parse(readFileSync(recFile, 'utf8')); } catch (_) {}
  for (const s of DOS_SITES) REC.stations[s.id] = { name: s.name, city: s.city, lat: s.lat, lon: s.lon };
  const ST = { lastPoll: null, lastOk: null, lastError: null, readings: 0, newReadings: 0, via: {}, perSite: {}, daysArchived: [] };
  try { Object.assign(ST, JSON.parse(readFileSync(stFile, 'utf8'))); } catch (_) {}
  const key = () => { const e = process.env.NIGRAAN_AIRNOW_KEY; if (e && e.trim()) return e.trim(); try { return existsSync(keyFile) ? readFileSync(keyFile, 'utf8').trim() || null : null; } catch (_) { return null; } };
  const UA = { 'User-Agent': 'AGN-NIGRAAN/91.17 (30-min read of the public air-quality feed)' };
  async function viaApi(nowMs) {
    const K = key(); if (!K) return { rows: [], why: 'no AirNow key held' };
    const f = (ms) => new Date(ms).toISOString().slice(0, 13);
    const u = API + '/aq/data/?startDate=' + f(nowMs - 4 * 3600e3) + '&endDate=' + f(nowMs) + '&parameters=PM25&BBOX=60.5,23.5,77.5,37.5&dataType=C&format=application/json&verbose=1&monitorType=2&includerawconcentrations=1&API_KEY=' + encodeURIComponent(K);
    try { const r = await fetchFn(u, { headers: UA, signal: AbortSignal.timeout(60000) }); if (!r.ok) return { rows: [], why: 'AirNow http ' + r.status }; return { rows: parseAirNow(await r.json()) }; }
    catch (e) { return { rows: [], why: 'AirNow: ' + noKey(e && e.message) }; }
  }
  async function viaRss(site) {
    try { const r = await fetchFn(RSS + '/dos/RSS/' + site.city + '/' + site.city + '-PM2.5.xml', { headers: UA, signal: AbortSignal.timeout(60000) });
      if (!r.ok) return { rows: [], why: site.city + ' feed http ' + r.status }; return { rows: parseDosRss(await r.text(), site) }; }
    catch (e) { return { rows: [], why: site.city + ' feed: ' + noKey(e && e.message) }; }
  }
  function archiveDays(nowMs) {
    const todayPk = new Date(nowMs + PKT).toISOString().slice(0, 10), lines = [], done = new Set(ST.daysArchived || []);
    for (const s of DOS_SITES) { const O = REC.obs[s.id] || {}; const byDay = new Map();
      for (const [t, r] of Object.entries(O)) { const d = new Date(Date.parse(t) + PKT).toISOString().slice(0, 10); if (d >= todayPk) continue; if (!byDay.has(d)) byDay.set(d, []); if (!readingFault(r)) byDay.get(d).push(r.pm25); }
      for (const [d, v] of byDay) { const k = s.id + '|' + d; if (done.has(k)) continue;
        /* a day is written once, when it is over and its first hour is still inside the 48 h kept (so all its hours are held) */
        if (Date.parse(d + 'T00:00:00Z') - PKT < nowMs - KEEP_H * 3600e3) { done.add(k); continue; }
        const mean = v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null;
        lines.push(JSON.stringify({ kind: 'dos_daily', source: 'US Department of State monitor (live)', site: s.city, aqs: s.id, lat: s.lat, lon: s.lon, date: d, pm25Mean: mean, hours: v.length, complete: v.length >= DAY_MIN_HOURS, written: new Date(nowMs).toISOString() }));
        done.add(k); } }
    ST.daysArchived = [...done].slice(-200);
    if (lines.length) { mkdirSync(aqLake, { recursive: true }); appendFileSync(join(aqLake, 'dos_daily_' + new Date(nowMs + PKT).toISOString().slice(0, 7) + '.jsonl'), lines.join('\n') + '\n'); }
    return lines.length;
  }
  async function poll(nowMs = Date.now()) {
    if (!on()) return ST;
    ST.lastPoll = new Date(nowMs).toISOString(); const why = []; const got = [];
    const A = await viaApi(nowMs); if (A.why) why.push(A.why); got.push(...A.rows);
    for (const s of DOS_SITES) if (!got.some((x) => x.id === s.id && x.pm25 != null)) { const R = await viaRss(s); if (R.why) why.push(R.why); got.push(...R.rows); }
    let fresh = 0; const arch = []; ST.via = {};
    for (const x of got) { if (x.pm25 == null) continue; const O = REC.obs[x.id] || (REC.obs[x.id] = {});
      const prev = O[x.t]; O[x.t] = { pm25: x.pm25, aqi: x.aqi ?? null, via: x.via }; ST.via[x.via] = (ST.via[x.via] || 0) + 1;
      if (!prev || prev.pm25 !== x.pm25) { fresh++; arch.push(JSON.stringify({ id: x.id, site: (REC.stations[x.id] || {}).city || null, t: x.t, pm25: x.pm25, aqi: x.aqi ?? null, via: x.via })); } }
    const cut = nowMs - KEEP_H * 3600e3; for (const O of Object.values(REC.obs)) for (const t of Object.keys(O)) if (Date.parse(t) < cut) delete O[t];
    ST.perSite = Object.fromEntries(DOS_SITES.map((s) => { const ts = Object.keys(REC.obs[s.id] || {}).sort(); return [s.city, ts.length ? ts[ts.length - 1] : null]; }));
    ST.readings = got.length; ST.newReadings = fresh; ST.lastError = got.some((x) => x.pm25 != null) ? (why.length ? 'partly: ' + why.join('; ') : null) : (why.join('; ') || 'no reading in the answer');
    if (got.some((x) => x.pm25 != null)) ST.lastOk = ST.lastPoll;
    try { mkdirSync(join(dataDir, 'cache'), { recursive: true }); writeFileSync(recFile + '.tmp', JSON.stringify(REC)); renameSync(recFile + '.tmp', recFile);
      if (arch.length) { mkdirSync(lake, { recursive: true }); appendFileSync(join(lake, 'dos_' + new Date(nowMs).toISOString().slice(0, 7) + '.jsonl'), arch.join('\n') + '\n'); }
      ST.dailyWritten = archiveDays(nowMs); writeFileSync(stFile + '.tmp', JSON.stringify(ST)); renameSync(stFile + '.tmp', stFile); } catch (e) { ST.lastError = 'write: ' + String(e.message || e).slice(0, 120); }
    return ST;
  }
  function latest(nowMs = Date.now()) { return DOS_SITES.map((s) => { const O = REC.obs[s.id] || {}; const ts = Object.keys(O).sort(); const t = ts[ts.length - 1];
    return { id: s.id, name: 'US Dept of State monitor, ' + s.city, lat: s.lat, lon: s.lon, t: t || null, ...(t ? O[t] : {}), ageH: t ? Math.round((nowMs - Date.parse(t) - 3600e3) / 360e3) / 10 : null, hours48: ts.length }; }); }
  function status() { return { on: on(), keyHeld: !!key(), lastPoll: ST.lastPoll, lastOk: ST.lastOk, lastError: ST.lastError, readings: ST.readings, newReadings: ST.newReadings, via: ST.via, perSite: ST.perSite,
    use: 'live hourly PM2.5 of the four US Department of State monitors: the "measured now" air-quality line (no monitor named to customers) and the daily means for scoring' }; }
  function start() { if (!on()) return; schedule(app, 'dosaq', 1800e3, () => poll(), { firstMs: 75000, label: 'US Department of State air-quality monitors (4 cities)' }); }
  return { poll, latest, status, start, recent: () => REC, archiveDays };
}
