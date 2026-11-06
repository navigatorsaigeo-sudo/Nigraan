/* Station check: the grade A rule scores forecasts against a model reference (ECMWF IFS analysis for windows from REANALYSIS_IFS_FROM, ERA5
   reanalysis before; v91.17.157 names it in summary.referenceLabel; the era5 field names are kept for old readers). This module
   scores the same forecasts against real thermometers, and ERA5 itself against them, so you can
   see how far the reference can be trusted.
   Sources
   - METAR airport reports from the Iowa Environmental Mesonet archive (free, public). Eight
     Pakistan airports report there today: Islamabad, Lahore, Karachi, Faisalabad, Multan,
     Peshawar, Sialkot, New Gwadar. Temperatures are whole degrees (adds ~0.3 °C RMS noise).
   - Any CSV you drop in data/stations/import/ with the header
       station_id,name,lat,lon,elev_m,time_utc,temp_c
     (for example PMD synoptic data under a data agreement). It is scored the same way.
   Window: the test month of the latest national verification, so the bias correction being
   judged was learned on different days.                                                  */
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { reanalysisModel, alignBatch } from './provider.mjs';

export const METAR_STATIONS = [
  { id: 'OPIS', name: 'Islamabad International Airport', lat: 33.5491, lon: 72.8256, elevM: 541 },
  { id: 'OPLA', name: 'Lahore Allama Iqbal Airport', lat: 31.5216, lon: 74.4036, elevM: 217 },
  { id: 'OPKC', name: 'Karachi Jinnah Airport', lat: 24.8456, lon: 67.1614, elevM: 18 },
  { id: 'OPFA', name: 'Faisalabad Airport', lat: 31.365, lon: 72.9948, elevM: 185 },
  { id: 'OPMT', name: 'Multan Airport', lat: 30.2032, lon: 71.4191, elevM: 123 },
  { id: 'OPPS', name: 'Peshawar Bacha Khan Airport', lat: 34.0167, lon: 71.5833, elevM: 360 },
  { id: 'OPST', name: 'Sialkot Airport', lat: 32.5, lon: 74.5333, elevM: 247 },
  { id: 'OPGW', name: 'New Gwadar Airport', lat: 25.298, lon: 62.5, elevM: 18 },
];
const LEADS = [24, 48, 72];
const r2 = (x) => x == null || !isFinite(x) ? null : Math.round(x * 100) / 100;

export function createStations(app, dataDir) {
  const { provider, store } = app;
  const file = join(dataDir, 'station-verification.json');
  const importDir = join(dataDir, 'stations', 'import'); mkdirSync(importDir, { recursive: true });
  let running = false, lastError = null;
  const read = () => { try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null; } catch { return null; } };

  function hourKey(valid) { // 'YYYY-MM-DD HH:MM' UTC -> nearest top of hour within 10 min
    const ms = Date.parse(valid.replace(' ', 'T') + ':00Z'); if (!isFinite(ms)) return null;
    const m = new Date(ms).getUTCMinutes(); if (m > 10 && m < 50) return null;
    return new Date(Math.round(ms / 3600e3) * 3600e3).toISOString().slice(0, 13);
  }
  async function metar(start, end) {
    const qs = new URLSearchParams(); METAR_STATIONS.forEach(s => qs.append('station', s.id));
    const [y1, m1, d1] = start.split('-').map(Number), e = new Date(Date.parse(end) + 86400e3), [y2, m2, d2] = [e.getUTCFullYear(), e.getUTCMonth() + 1, e.getUTCDate()];
    Object.entries({ data: 'tmpc', year1: y1, month1: m1, day1: d1, year2: y2, month2: m2, day2: d2, tz: 'Etc/UTC', format: 'onlycomma', latlon: 'no', missing: 'M' }).forEach(([k, v]) => qs.set(k, v));
    qs.append('report_type', '3'); qs.append('report_type', '4');
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 120000);
    try {
      const r = await fetch('https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?' + qs, { signal: ctl.signal, headers: { 'user-agent': 'nigraan-local/91.17 (station verification)' } });
      if (!r.ok) throw new Error('IEM HTTP ' + r.status);
      const out = new Map();
      for (const line of (await r.text()).split('\n').slice(1)) {
        const [sid, valid, tmpc] = line.split(','); if (!sid || !tmpc || tmpc === 'M') continue;
        const k = hourKey(valid), v = Number(tmpc); if (!k || !isFinite(v)) continue;
        let m = out.get(sid); if (!m) out.set(sid, m = new Map()); if (!m.has(k)) m.set(k, v);
      }
      return out;
    } finally { clearTimeout(t); }
  }
  function imported(start, end) {
    const meta = new Map(), obs = new Map();
    for (const f of readdirSync(importDir).filter(x => x.toLowerCase().endsWith('.csv'))) {
      const lines = readFileSync(join(importDir, f), 'utf8').split(/\r?\n/); const head = (lines.shift() || '').toLowerCase().split(',').map(s => s.trim());
      const ix = (n) => head.indexOf(n); if (['station_id', 'lat', 'lon', 'time_utc', 'temp_c'].some(n => ix(n) < 0)) continue;
      for (const l of lines) {
        const c = l.split(','); if (c.length < head.length) continue;
        const id = 'IMP:' + c[ix('station_id')].trim(), t = c[ix('time_utc')].trim().replace(' ', 'T'), v = Number(c[ix('temp_c')]);
        if (!isFinite(v) || t.slice(0, 10) < start || t.slice(0, 10) > end) continue;
        const ms = Date.parse(t.length <= 16 ? t + ':00Z' : t.endsWith('Z') ? t : t + 'Z'); if (!isFinite(ms) || new Date(ms).getUTCMinutes() % 60 > 10 && new Date(ms).getUTCMinutes() < 50) continue;
        if (!meta.has(id)) meta.set(id, { id, name: (ix('name') >= 0 && c[ix('name')].trim()) || id.slice(4), lat: Number(c[ix('lat')]), lon: Number(c[ix('lon')]), elevM: ix('elev_m') >= 0 ? Number(c[ix('elev_m')]) : null, source: 'import: ' + f });
        let m = obs.get(id); if (!m) obs.set(id, m = new Map()); m.set(new Date(Math.round(ms / 3600e3) * 3600e3).toISOString().slice(0, 13), v);
      }
    }
    return { meta: [...meta.values()], obs };
  }
  function nearestCorrection(lat, lon) {
    let best = null, bd = Infinity;
    const byUnit = new Map(); for (const c of store.all('biasCorrections')) { let u = byUnit.get(c.unitId); if (!u) byUnit.set(c.unitId, u = { unitId: c.unitId, key: c.key, lat: c.lat, lon: c.lon, leads: {} }); u.leads[c.lead_hours] = c; }
    for (const u of byUnit.values()) { const d = (u.lat - lat) ** 2 + ((u.lon - lon) * Math.cos(lat * Math.PI / 180)) ** 2; if (d < bd) { bd = d; best = u; } }
    return best ? { ...best, km: Math.round(Math.sqrt(bd) * 111) } : null;
  }

  async function run() {
    if (running) return { started: false, why: 'already running' };
    if (!provider.configured()) return { started: false, why: 'no paid provider key' };
    running = true; const t0 = Date.now();
    try {
      const V = app.verification.grades().summary;
      const win = V && V.testWindow ? V.testWindow : { start_date: new Date(Date.now() - 36 * 864e5).toISOString().slice(0, 10), end_date: new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10) };
      let M = new Map(); try { M = await metar(win.start_date, win.end_date); } catch (e) { lastError = 'METAR: ' + e.message; }
      const imp = imported(win.start_date, win.end_date);
      const list = [...METAR_STATIONS.map(s => ({ ...s, source: 'METAR (Iowa Environmental Mesonet)' })), ...imp.meta];
      const obsFor = (s) => s.id.startsWith('IMP:') ? imp.obs.get(s.id) : M.get(s.id);
      const rows = [];
      for (let i = 0; i < list.length; i += 50) {
        const b = list.slice(i, i + 50).filter(s => obsFor(s) && obsFor(s).size);
        if (!b.length) continue;
        const common = { latitude: b.map(s => s.lat), longitude: b.map(s => s.lon), elevation: b.map(s => s.elevM ?? 'nan'), start_date: win.start_date, end_date: win.end_date, timezone: 'GMT' };
        let fc, er;
        try {
          fc = await provider.call('previousRuns', '/v1/forecast', { ...common, hourly: ['temperature_2m_previous_day1', 'temperature_2m_previous_day2', 'temperature_2m_previous_day3', 'relative_humidity_2m_previous_day1', 'wind_speed_10m_previous_day1', 'relative_humidity_2m_previous_day2', 'wind_speed_10m_previous_day2', 'relative_humidity_2m_previous_day3', 'wind_speed_10m_previous_day3'] }, { locations: b.length });
          /* v91.17.3 · 1.11 · recent window, so the IFS 9 km reference */
          er = await provider.call('archive', '/v1/archive', { ...common, hourly: 'temperature_2m', models: reanalysisModel(common.start_date) }, { locations: b.length });
        } catch (e) { lastError = e.message; continue; }
        fc = alignBatch(fc, b); er = alignBatch(er, b);   /* v91.17.157 · audit: matched by coordinate, not index */
        b.forEach((s, k) => {
          const F = fc[k] && fc[k].hourly, E = er[k] && er[k].hourly, O = obsFor(s); if (!F || !E) return;
          const corr = nearestCorrection(s.lat, s.lon);
          const skill = corr ? app.store.filter('unitSkill', r => r.unitId === corr.unitId) : [];
          const row = { id: s.id, name: s.name, source: s.source, lat: s.lat, lon: s.lon, elevM: s.elevM, nearestTehsil: corr ? corr.key : null, nearestKm: corr ? corr.km : null, leads: {}, era5: null };
          let eN = 0, eSe = 0, eB = 0;
          F.time.forEach((t, h) => { const o = O.get(t.slice(0, 13)); const e = E.temperature_2m[h]; if (o != null && e != null) { eN++; eSe += (e - o) ** 2; eB += e - o; } });
          row.era5 = { n: eN, rmse: eN ? r2(Math.sqrt(eSe / eN)) : null, bias: eN ? r2(eB / eN) : null };
          LEADS.forEach((L, li) => {
            const f = F['temperature_2m_previous_day' + (li + 1)] || []; const c = corr && corr.leads[L];
            let n = 0, seR = 0, seS = 0, bR = 0, bS = 0;
            /* v91.17.36 · AUDIT V-02 · "served" applies the correction only when the server serves it.
               v91.17.47 · declared here, not inside the hour loop: it was read after the loop as well, which threw
               ReferenceError on every checks tick since v91.17.36 ("checks error _serving is not defined"). */
            const _serving = (c && c.serving !== undefined) ? c.serving : (process.env.NIGRAAN_ERA5_BIAS === '1');
            /* ══ v91.17.60 · THE STATION CHECK NOW SCORES WHAT THE WIRE SERVES ════════════════════════════════════════
               Until now "served" applied only the ERA5 unit correction (off by default), never the station MOS, so the
               airports scored raw == served while /px corrected Karachi and Sialkot since v59 - and the grade-A gate,
               which needs 6 of 8 airports within 2.0 °C, was judging a forecast nobody receives. The same
               mosApi.adjust the wire uses (synop entries, learned model, all hours) is applied here per hour. */
            const mosApi = app.mos;
            /* v91.17.60 · the learned model takes the hour's humidity and wind (the wire passes them from the forecast it
               corrects); scoring it without them sends every tree down its default branch and is not what is served */
            const RH = F['relative_humidity_2m_previous_day' + (li + 1)] || [], W = F['wind_speed_10m_previous_day' + (li + 1)] || [], modelElevM = fc[k] && fc[k].elevation;
            const feat = (h) => ({ rh: RH[h], windKmh: W[h], modelElevM });
            F.time.forEach((t, h) => { const o = O.get(t.slice(0, 13)); if (o == null || f[h] == null) return;
              const raw = f[h] - o; let served = raw - (c && c.applied && _serving ? c.hourBias[Number(t.slice(11, 13))] : 0);
              try { if (mosApi && s.elevM != null) { const a = mosApi.adjust(s.lat, s.lon, s.elevM, Date.parse(t + 'Z'), f[h], feat(h)); if (a && a.applied) served += a.adj; } } catch {}
              n++; seR += raw * raw; seS += served * served; bR += raw; bS += served; });
            const sk = skill.find(x => x.lead_hours === L);
            row.leads[L] = { n, rmse_raw: n ? r2(Math.sqrt(seR / n)) : null, rmse_served: n ? r2(Math.sqrt(seS / n)) : null, bias_raw: n ? r2(bR / n) : null, bias_served: n ? r2(bS / n) : null,
              correction_applied: !!((c && c.applied && _serving) || (app.mos && s.elevM != null && app.mos.adjust(s.lat, s.lon, s.elevM, Date.now(), 25).applied)), correction_fitted: !!(c && c.applied), tehsil_rmse_vs_era5: sk ? sk.rmse_served : null, improved: n ? Math.sqrt(seS / n) < Math.sqrt(seR / n) : null,
              /* v91.17.34 · the guard as the server applies it (verification.mjs: only with 400 h or more), so the page does not re-derive it */
              guarded: !!(c && c.applied && _serving) && n >= 400 && Math.sqrt(seS / n) > Math.sqrt(seR / n) + 0.1 };   /* the same rule verification.mjs applies (STATION_MIN_HOURS 400, +0.1 °C) */
          });
          rows.push(row);
        });
      }
      const g = rows.map(r => r.leads[24]).filter(x => x && x.n >= 200);
      const out = { at: new Date().toISOString(), window: win, stations: rows,
        summary: { stations: g.length, improvedByCorrection: g.filter(x => x.correction_applied && x.improved).length, correctedStations: g.filter(x => x.correction_applied).length,
          medianRmse24Raw: med(g.map(x => x.rmse_raw)), medianRmse24Served: med(g.map(x => x.rmse_served)), medianEra5Rmse: med(rows.map(r => r.era5 && r.era5.n >= 200 ? r.era5.rmse : null)) , referenceModel: reanalysisModel(win.start_date), referenceLabel: reanalysisModel(win.start_date) === 'era5' ? 'ERA5 reanalysis' : 'ECMWF IFS operational analysis (archive), not ERA5' },   /* v91.17.157 · audit: the field names say era5 for old readers; the reference is named */
        notes: ['METAR temperatures are whole degrees; about 0.3 °C of each RMSE is rounding.', 'An airport is one point; a tehsil value is an area average at population-weighted elevation, so part of the difference is representativeness, not forecast error.'] };
      const tmp = file + '.tmp'; writeFileSync(tmp, JSON.stringify(out)); try { renameSync(tmp, file); } catch { writeFileSync(file, JSON.stringify(out)); }
      lastError = rows.length ? null : (lastError || 'no station observations returned');
      try { app.verification.setStationResults(out); } catch (e) { console.error('  station guard error', e.message); }
      console.log(`  stations: ${rows.length} scored in ${Math.round((Date.now() - t0) / 1000)}s`);
      return { started: true, stations: rows.length };
    } finally { running = false; }
  }
  function med(a) { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; }
  const due = () => { const r = read(); return !r || Date.now() - Date.parse(r.at) > 24 * 3600e3; };
  const summary = () => { const r = read(); return { ...(r || { at: null, stations: [] }), running, lastError, importFolder: 'nigraan-local/data/stations/import (CSV: station_id,name,lat,lon,elev_m,time_utc,temp_c)' }; };
  try { app.verification.setStationResults(read()); } catch {}
  return { run, due, summary };
}
