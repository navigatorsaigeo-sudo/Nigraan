import { readFileSync } from 'node:fs';
import { join } from 'node:path';
/* Report context: everything the printed site report needs beyond today's hazard screen,
   gathered in one call so the frozen document carries it.
   - next 15 days: ECMWF ensemble (adjusted), multi-day events counted member by member
   - weeks 1-6: ECMWF EC46 weekly anomalies and probabilities (against the model's own
     re-forecast climate, so model bias is removed by construction)
   - next 6 months: ECMWF SEAS5 monthly means and anomalies (against its hindcast climate)
   - forecast skill: this tehsil's verified error, the station check near it, national grade
   - recommended actions: forecast-triggered, dated, each tied to the chance that triggered it */
import { unitAtPoint } from './unitresolve.mjs';   /* v91.17.70 · point → tehsil by polygon */
import { stationData, internalNames, label } from './refmode.mjs';   /* v91.17.71 · data use vs naming */
import { wetBulbC, r1 as r1w } from './psychro.mjs';
import { customerScrub } from './customerscrub.mjs';   /* v91.17.172 · audit E-3/E-14 · supplier names out of the customer context */
import { servedUnit, NOT_ASSESSED, DROUGHT_SCREEN_NOTE } from './served.mjs';   /* v91.17.283 · WS4 · the one served-levels function */
import { evidenceForClient } from './evidence.mjs';
import { clientWhy } from './clientwhy.mjs';   /* v283.28 S9 */   /* v91.17.283 · WS4 · measured skill from the evidence files */
import { GUIDANCE_ON } from './guidance.mjs';
import { heatLevels } from './utcilevel.mjs';   /* v91.17.283.51 g2 · the heat scale's lower edge for the heat-season row */   /* v91.17.283.48 · "What to do here" (GUIDANCE_PANEL=1) */
/* v91.17.283 · WS4 item 6 / INTEG (WS3 request) · which section makes which report kind: the ONE table, read by the context here and by
   POST /api/reports/issue (reports.mjs) */
/* v91.17.283.8 · audit 15 · EVERY report kind has its section rule (not only two), and the kind a page or the start page sends (its label:
   "Site climate screening", "Site report", "Portfolio prioritisation", "Situation report (short edition)", ...) is normalised to one of
   these keys (normaliseKind): a kind that matches none is refused (unknown_kind), and every kind needs its section. The sections are the
   console's views the report buttons sit in (operations, assets, portfolio, reports) and the start page (start). */
export const REPORT_KINDS = {
  site_assessment: { title: 'Site assessment', sections: ['operations', 'assets', 'start'], from: ['Operations', 'Assets', 'the start page'], scope: 'one site: its tehsil levels, forecast, actions and standing measures',
    labels: ['site assessment', 'site report', 'site climate screening'] },
  portfolio_screening: { title: 'Portfolio screening', sections: ['portfolio'], from: ['Portfolio'], scope: 'several sites screened on the same levels and evidence, one row per site',
    labels: ['portfolio screening', 'portfolio prioritisation', 'portfolio report'] },
  situation_report: { title: 'Situation report', sections: ['operations'], from: ['Operations'], scope: 'the national and local situation now and the next days', labels: ['situation report'] },
  readiness_72h: { title: '72-hour operational readiness brief', sections: ['operations'], from: ['Operations'], scope: 'what to prepare in the next 72 hours', labels: ['72-hour operational readiness brief', 'readiness brief'] },
  executive_brief: { title: 'Executive climate risk brief', sections: ['assets', 'operations'], from: ['Assets', 'Operations'], scope: 'the client project in brief', labels: ['executive climate risk brief', 'executive brief'] },
  assurance_pack: { title: 'Methodology and assurance pack', sections: ['reports', 'operations', 'assets', 'portfolio'], from: ['Reports', 'Operations', 'Assets', 'Portfolio'], scope: 'how every figure in a report is made and checked', labels: ['methodology and assurance pack', 'assurance pack'] },
};
/* a kind key or label (any case, spaces, hyphens; an edition suffix such as "(short edition)" ignored) -> its REPORT_KINDS key, or null */
export function normaliseKind(k) {
  const t = String(k || '').toLowerCase().replace(/\s*\((short|full)( edition)?\)\s*$/, '').replace(/[\u2010-\u2015]/g, '-').trim(); if (!t) return null;
  const key = t.replace(/[\s-]+/g, '_'); if (REPORT_KINDS[key]) return key;
  for (const [kk, v] of Object.entries(REPORT_KINDS)) if ((v.labels || []).includes(t) || v.title.toLowerCase() === t) return kk;
  return null;
}
const TTL_MS = 6 * 3600e3;
/* v91.17.70 · data-source decision option 2: PMD / SUPARCO material and the circular reanalysis "verification" are internal
   diagnostics; the customer context carries the source-chain tier and the MACH station check instead. The old content
   comes back with NIGRAAN_INTERNAL_REF=1 (testing only). */
/* v91.17.71 · every gate in this file controls NAMES or station-measured figures (the PMD mountain notes, station-tested
   detection rates, the skill sheet, the reanalysis diagnostic): they stay behind internalNames(). The station-derived DATA
   reaches the report through the served forecast and the climatology; the forecast-basis page says so in generic words. */
const INTERNAL = () => internalNames();
const r1 = (x) => x == null || !isFinite(x) ? null : Math.round(x * 10) / 10;
const DAY = 86400e3;
const fmt = (iso) => { if (!iso) return null; const d = new Date(iso + 'T12:00:00Z'); return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]; };
const minusDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') - n * DAY).toISOString().slice(0, 10);

export const DROUGHT_TITLE = 'Drought screening index (observed rain and soil, updated monthly); a Low level does not rule out drought';
/* v91.17.283.10 · the drought screening section of every report (owner decision 23 Oct 2026) */
export function droughtSectionOf(app, u, levels) {
  const L0 = levels && levels.ready !== false && Array.isArray(levels.days) && levels.days[0] && levels.days[0].layers ? levels.days[0].layers.drought : null;
  let n = null; try { n = app.climatology && app.climatology.droughtNational ? app.climatology.droughtNational() : null; } catch (_) { n = null; }
  const rec = n && n.ready && n.units ? n.units[u.unitId] : null;
  const month = (rec && rec.month && rec.month.label) || (n && n.month && n.month.label) || null;
  const word = L0 ? (L0.word || 'Not assessed') : 'Not assessed';
  /* v91.17.283.23 · self-audit H7 · the report prints the served level only: the climatology class beside it mixed the soil percentile into
     the stated result (soil is a supporting fact of the level, not a second level) */
  const out = { title: DROUGHT_TITLE, note: DROUGHT_SCREEN_NOTE, level: word, month: month || 'not available',
    monthBasis: rec && rec.month ? rec.month.basis : (n && n.month ? 'calendar month' : null), cadence: 'updated monthly (latest complete calendar month of observed rain; soil at the last reanalysis day)',
    productType: (L0 && L0.productType) || 'Screening index', observed: true, raisesAlert: false,
    ...(L0 && L0.notAssessedWhy ? { notAssessedWhy: L0.notAssessedWhy } : (!L0 ? { notAssessedWhy: (n && n.why) || NOT_ASSESSED['-1'] } : {})) };
  return out;
}

import { HZ_WORDS, NO_HAZARD, lowConditionOf, hazardListOf, STANDING_LAYERS, PARAMETER_LAYERS } from './hazardlist.mjs';   /* v283.35 · one home */
export { NO_HAZARD, lowConditionOf, hazardListOf, STANDING_LAYERS, PARAMETER_LAYERS };
/* v91.17.283.51 g2 · the standing measure texts, one home: the report context (standing rows) and the report engine (the measure for a
   hazard issued at Moderate or above that has no forecast or guidance action, repengine.mjs topActions) */
/* v283.51g3 · the fog days of the air forecast reduced to the fog hours still ahead (see actions(): live test 51, Clifton "Ready by Tue 3 Nov"
   in the afternoon for a fog hour of that morning). day.fogAt: the PKT hours of the fog hours (smog.mjs). Today keeps the hours from the
   current hour on; a day without fogAt (a run stored before it existed) keeps its count except today, which is left out: which of its
   hours are past cannot be told. when: the first fog hour ahead (YYYY-MM-DDTHH:00, PKT), or the date where the hours are not known. */
export function fogHoursAhead(days, nowMs = Date.now()) {
  const nP = new Date(nowMs + 5 * 3600e3), tP = nP.toISOString().slice(0, 10), hP = nP.getUTCHours(), p2 = (n) => String(n).padStart(2, '0');
  return (days || []).filter((d) => d && d.fogHours > 0 && d.date >= tP).map((d) => { const at = Array.isArray(d.fogAt) ? d.fogAt.filter((h) => Number.isFinite(h)) : null;
    if (d.date === tP) { if (!at) return null; const left = at.filter((h) => h >= hP); return left.length ? { date: d.date, n: left.length, first: left[0] } : null; }
    return { date: d.date, n: at && at.length ? at.length : d.fogHours, first: at && at.length ? at[0] : null }; }).filter(Boolean)
    .map((x) => ({ ...x, when: x.first != null ? x.date + 'T' + p2(x.first) + ':00' : x.date }));
}
export const STANDING_MEASURES = {
    heat: { measure: 'Heat season: keep the heat-stop rules, shaded rest and water at each work face in force; check cooling plant and its power before the first hot spell, not during it.', owner: 'Operations / HSE' },
    monsoon: { measure: 'Wet season: keep drains, culverts and the site discharge point clear; test pumps monthly; agree the access-road closure trigger; keep critical stock off the floor.', owner: 'Facilities' },
    cold: { measure: 'Cold season: lag exposed pipes and tanks; check heaters and antifreeze; issue cold-weather PPE; plan for icy access on the early shift.', owner: 'Facilities / maintenance' },
    smog: { measure: 'Smog season (October to February in the plains): keep N95/FFP2 masks in stock for outdoor staff; check HVAC filters; brief staff with asthma or heart conditions; expect morning fog closures on the motorways.', owner: 'HSE' },
    dust: { measure: 'Dust season: keep filters and seals on air intakes checked; cover stockpiles; plan for reduced visibility on site roads.', owner: 'Facilities / HSE' },
    riverine: { measure: 'A share of this tehsil lies within 5 m of a major river: know the reach the provincial flood cell reports, record the asset\'s flood-protection level, and keep the evacuation route to higher ground agreed.', owner: 'Site management' },
    /* v91.17.70 · no design storm is issued (the "50 mm/h storm" had no duration, return period or source, E-W2): the client registers the
       site's drainage capacity as an hourly-rain limit and the forecast is checked against it (data/engineering-references.json drainage_capacity) */
    ponding: { measure: 'This ground collects water (low local relief): register the site\'s drainage capacity (pump duty or sump pump-down, in mm/h of rain) as an hourly-rain limit on the limit register so every forecast is checked against it; keep a pumping plan, and do not store on the lowest ground.', owner: 'Facilities / plant engineering' },
    slope: { measure: 'Steep ground: inspect slopes and drainage above the site and the access roads after every heavy rain; keep an alternative access.', owner: 'Logistics / site security' },
    glof: { measure: 'A glacial-lake corridor reaches this tehsil: keep the downstream warning chain and the route to high ground rehearsed; know the lake the class comes from.', owner: 'Site management / emergency' },
    seismic: { measure: 'Seismic zone: keep the non-structural fixings (racks, tanks, cable trays) checked and the shutdown-and-muster drill current.', owner: 'Facilities / HSE' },
    coastal: { measure: 'Coastal exposure: keep the cyclone-season checklist (June and October to November) and the storm-surge muster plan current; corrosion inspections on exposed steel.', owner: 'Facilities / HSE' },
    drought: { measure: 'Water-stressed season: know the site\'s water storage in days, review water-intensive processes and supply contracts before the dry months.', owner: 'Utilities / water manager' },
};
export function createReport(app) {
  const { provider, units } = app;
  const cache = new Map();

  /* ══ v91.17.24 · P3-5 · A NAMED MODEL RUN FOR AN ISSUED REPORT ═════════════════
     best_match names no model and no run, so a report built on it can never be
     reproduced: the provider may pick a different model tomorrow and the run it used is
     gone. For an issued document the asset's point forecast is taken from ONE explicit
     model (ECMWF IFS at its native ~9 km) and ONE initialisation, read from the Single
     Runs API, which keeps that run. The model's own latest-run time comes from its
     metadata. The series is hashed so the document can prove which numbers it printed,
     and the request is recorded (without the key) so anyone can fetch the same run again.
     The grid cell the model actually used, its distance from the asset and its terrain
     height against the site height are reported, because a 9 km model cell is not the site. */
  const RUN_MODEL = 'ecmwf_ifs';
  const runCache = new Map();
  const _km = (a, b, c, d) => { const R = 6371, r = Math.PI / 180, dl = (c - a) * r, dn = (d - b) * r;
    const h = Math.sin(dl / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const _canon = (v) => Array.isArray(v) ? '[' + v.map(_canon).join(',') + ']'
    : (v && typeof v === 'object') ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + _canon(v[k])).join(',') + '}' : JSON.stringify(v);
  async function pointRun(q) {
    const lat = Number(q.lat), lon = Number(q.lon), elev = (q.elev == null || q.elev === '' || !isFinite(Number(q.elev))) ? null : Number(q.elev);
    if (!isFinite(lat) || !isFinite(lon) || lat < 23 || lat > 38 || lon < 60 || lon > 78) return { ok: false, why: 'coordinate outside Pakistan or not numeric' };
    const key = lat.toFixed(4) + ',' + lon.toFixed(4) + ',' + (elev == null ? '-' : Math.round(elev));
    const c = runCache.get(key); if (c && Date.now() - c.at < 30 * 60e3) return c.v;
    const meta = await provider.call('forecast', '/data/' + RUN_MODEL + '/static/meta.json', {}, { locations: 0 });
    const latestSec = meta && meta.last_run_initialisation_time;
    if (!latestSec) return { ok: false, why: 'the model metadata did not name a latest run' };
    const vars = ['temperature_2m', 'relative_humidity_2m', 'wet_bulb_temperature_2m', 'apparent_temperature', 'wind_gusts_10m', 'wind_speed_10m', 'precipitation'];
    /* v91.17.27 · the metadata can name a run the Single Runs archive has not filled yet: measured
       on 21 Sep, the 06Z run answered with an empty series for an hour after the metadata named it.
       An empty series steps back one run (6 h) at a time, up to 18 h, and says which run it used. */
    let runSec = latestSec, runIso = null, hours = 0, common = null, site = null, steppedBack = 0;
    for (let k = 0; k < 4; k++) {
      runSec = latestSec - k * 6 * 3600;
      runIso = new Date(runSec * 1000).toISOString().slice(0, 16);
      hours = Math.min(168, Math.ceil((Date.now() - runSec * 1000) / 3600e3) + 74);
      common = { latitude: lat, longitude: lon, models: RUN_MODEL, run: runIso, timezone: 'GMT' };
      site = await provider.call('singleRuns', '/v1/forecast', { ...common, forecast_hours: hours, hourly: vars, elevation: elev == null ? undefined : elev });
      const T = (site && site.hourly && site.hourly.temperature_2m) || [];
      if (T.filter(v => v != null).length >= 48) { steppedBack = k; break; }
      site = null;
    }
    if (!site) return { ok: false, why: 'the four most recent ' + RUN_MODEL + ' runs returned no series from the Single Runs archive' };
    const grid = await provider.call('singleRuns', '/v1/forecast', { ...common, forecast_hours: 1, hourly: ['temperature_2m'], elevation: 'nan' });
    const H = site.hourly || {}, t = H.time || [], nowMs = Date.now() - 3600e3;
    const idx = t.map((x, i) => i).filter(i => Date.parse(t[i] + 'Z') >= nowMs).slice(0, 72);
    const series = { time: idx.map(i => t[i]) };
    vars.forEach(v => { series[v] = idx.map(i => (H[v] && H[v][i] != null) ? H[v][i] : null); });
    const mx = (a) => { let b = null, bi = -1; a.forEach((v, i) => { if (v != null && (b == null || v > b)) { b = v; bi = i; } }); return { v: b, at: bi >= 0 ? series.time[bi] : null }; };
    const mn = (a) => { let b = null, bi = -1; a.forEach((v, i) => { if (v != null && (b == null || v < b)) { b = v; bi = i; } }); return { v: b, at: bi >= 0 ? series.time[bi] : null }; };
    const sum = (a) => { const f = a.filter(v => v != null); return f.length ? Math.round(f.reduce((x, y) => x + y, 0) * 10) / 10 : null; };
    const request = { endpoint: 'forecast provider single-runs endpoint /v1/forecast' /* v91.17.41 · the host is the provider's and is not published; the parameters are */, params: { ...common, forecast_hours: hours, hourly: vars.join(','), elevation: elev == null ? '(provider 90 m DEM)' : elev }, key: 'withheld' };
    const payload = { model: RUN_MODEL, run: runIso, lat, lon, elev, series };
    const { createHash } = await import('node:crypto');
    const v = {
      ok: true, provider: 'global forecast model (raw reference run)', model: RUN_MODEL, modelLabel: 'ECMWF IFS, native ~9 km (O1280)',
      run: runIso + 'Z', runEpoch: runSec, retrievedAt: new Date().toISOString(), latestRunNamed: new Date(latestSec * 1000).toISOString().slice(0, 16) + 'Z', steppedBackRuns: steppedBack,
      validFrom: series.time[0] ? series.time[0] + 'Z' : null, validTo: series.time.length ? series.time[series.time.length - 1] + 'Z' : null,
      leadHoursAtFirstStep: series.time[0] ? Math.round((Date.parse(series.time[0] + 'Z') - runSec * 1000) / 3600e3) : null,
      site: { lat, lon, elevation: site.elevation, elevationSource: elev == null ? 'provider 90 m DEM at the coordinate' : 'supplied with the request',
              nearestPlace: (() => { try { const r = app.places.resolvePoint(lat, lon); return r && r.label ? r.label : null; } catch { return null; } })() },   /* v91.17.47 */
      gridCell: { lat: grid.latitude, lon: grid.longitude, elevation: grid.elevation, distanceKm: Math.round(_km(lat, lon, grid.latitude, grid.longitude) * 10) / 10,
                  elevationGapM: (grid.elevation != null && site.elevation != null) ? Math.round(site.elevation - grid.elevation) : null,
                  nearestPlace: (() => { try { const r = app.places.resolvePoint(grid.latitude, grid.longitude); return r && r.label ? r.label : null; } catch { return null; } })() },
      correction: 'Raw output of the named run, no NIGRAAN correction applied. The provider adjusts temperature to the site elevation statistically; no NIGRAAN bias correction is applied to this reference series, so it can be fetched again and compared number for number.',
      summary: { tmax: mx(series.temperature_2m), tmin: mn(series.temperature_2m), wetBulbMax: (() => { const T = series.temperature_2m || [], R = series.relative_humidity_2m || []; if (!T.length || !R.length) return mx(series.wet_bulb_temperature_2m); return mx(T.map((t, i) => (t == null || R[i] == null) ? null : r1w(wetBulbC(t, R[i], Number.isFinite(site.elevation) ? { elevationM: site.elevation } : null)))); })(),   /* v91.17.129 · A-03 · the one psychrometric wet bulb at the site height */ apparentMax: mx(series.apparent_temperature),
                 gustMax: mx(series.wind_gusts_10m), rainTotal: sum(series.precipitation) },
      series, request,
      inputHash: 'sha256:' + createHash('sha256').update(_canon(payload)).digest('hex'),
    };
    /* v91.17.127 · A-03 · ONE DAY MAX / MIN: beside the raw reference run (kept as a declared, re-fetchable reference), the report
       carries the served day high / low at the same point, the corrected hourly curve every screen shows (point engine) */
    /* v91.17.283.12 · the served values beside it are the point state (pointstate.mjs), the record every page shows for this point and run */
    try { if (app.pointState) { const ps = await app.pointState.state(lat, lon);
      if (ps && ps.ok) v.served = { basis: 'the point state: day high and low of the served forecast at this point (the value every page, report and the AI analyst show)', days: ps.days, now: ps.now, elevM: ps.point && ps.point.elevM, pointState: ps.key }; } } catch (_) {}
    if (runCache.size > 300) runCache.delete(runCache.keys().next().value);   /* v91.17.34 · AUDIT A7 · bounded */
    runCache.set(key, { at: Date.now(), v });
    return v;
  }


  function nearestUnit(lat, lon) {
    /* v91.17.70 · the tehsil the point lies in (unitresolve.mjs, point in polygon); nearest centroid only if no polygon file */
    try { const r = unitAtPoint(app, lat, lon); if (r) return r.unit; } catch (_) {}
    let best = null, bd = Infinity;
    for (const u of units.tehsil) { if (u.lat == null) continue; const d = (u.lat - lat) ** 2 + ((u.lon - lon) * Math.cos(lat * Math.PI / 180)) ** 2; if (d < bd) { bd = d; best = u; } }
    return best;
  }
  async function seasonal(u) {
    try { const st = app.outlook.seasonalUnit(u.unitId); if (st && Date.now() - Date.parse(st.at) < 24 * 3600e3) return { subseasonal: st.subseasonal, seasonal: st.seasonal, errors: [] }; } catch {}
    const key = u.unitId, c = cache.get(key);
    if (c && Date.now() - c.at < TTL_MS) return c.v;
    const v = { subseasonal: null, seasonal: null, errors: [] };
    const base = { latitude: u.lat, longitude: u.lon };
    try {
      const j = await provider.call('seasonal', '/v1/seasonal', { ...base, models: 'ecmwf_ec46', weekly: ['temperature_2m_anomaly', 'precipitation_anomaly', 'temperature_2m_anomaly_gt0', 'temperature_2m_anomaly_gt1', 'temperature_2m_anomaly_gt2', 'precipitation_anomaly_gt0', 'precipitation_anomaly_gt10', 'precipitation_anomaly_gt20'] });
      const w = j.weekly, today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);   /* v91.17.68 · the Pakistan date (C23) */
      v.subseasonal = { model: 'ECMWF EC46 (51 members, extended range)', reference: 'anomalies against the model’s own re-forecast climate for the same week', weeks: w.time.map((t, i) => ({
        start: t, end: minusDays(t, -6), tAnom: w.temperature_2m_anomaly[i], pAnom: w.precipitation_anomaly[i], pT0: w.temperature_2m_anomaly_gt0[i], pT1: w.temperature_2m_anomaly_gt1[i], pT2: w.temperature_2m_anomaly_gt2[i],
        pP0: w.precipitation_anomaly_gt0[i], pP10: w.precipitation_anomaly_gt10[i], pP20: w.precipitation_anomaly_gt20[i] })).filter(x => x.tAnom != null && minusDays(x.start, -6) >= today) };
    } catch (e) { v.errors.push('EC46: ' + e.message); }
    try {
      const j = await provider.call('seasonal', '/v1/seasonal', { ...base, models: 'ecmwf_seas5', monthly: ['temperature_2m_mean', 'temperature_2m_anomaly', 'precipitation_mean', 'precipitation_anomaly'] });
      const m = j.monthly;
      v.seasonal = { model: 'ECMWF SEAS5 (51 members, seasonal)', reference: 'anomalies against the SEAS5 hindcast climate for the same month', months: m.time.map((t, i) => ({ month: t.slice(0, 7), tMean: r1(m.temperature_2m_mean[i]), tAnom: r1(m.temperature_2m_anomaly[i]), pMean: r1(m.precipitation_mean[i]), pAnom: r1(m.precipitation_anomaly[i]) })).filter(x => x.tAnom != null)
        .map(x => { const pPct = x.pMean != null && x.pAnom != null && (x.pMean - x.pAnom) > 0 ? Math.round(100 * x.pAnom / (x.pMean - x.pAnom)) : null; return app.outlook && app.outlook.localMonth ? app.outlook.localMonth(u.unitId, { ...x, pPct }) : { ...x, pPct, tMean: null, pMean: null }; }) };   /* v91.17.69 · tehsil-height mean, grid values named (as the outlook) */
    } catch (e) { v.errors.push('SEAS5: ' + e.message); }
    /* v91.17.283 · WS2 R1 · the fallback blocks carry the same use block as outlook.mjs */
    const USE = { outlookOnly: true, canAlert: false, verifiedSkill: false, why: 'no verified skill yet' };
    if (v.subseasonal && !v.subseasonal.use) v.subseasonal.use = USE; if (v.seasonal && !v.seasonal.use) v.seasonal.use = USE;
    if (v.subseasonal || v.seasonal) cache.set(key, { at: Date.now(), v });
    return v;
  }

  /* ══ v91.17.70 · THE FORECAST-BASIS PAGE: SOURCE-CHAIN TIER AND THE MACH CHECK ═════════════════════════════════
     The page used to print the model's agreement with its own reanalysis as "how accurate this forecast has been"
     (circular: chair_crossexam S15), the PMD mountain AWS error, an airport thermometer and a national "grade A". Under
     option 2 none of that may reach a customer. It now prints one tier per unit from data/quality-tier.json (built by
     scripts/quality_tier_rule.py from the MACH fleet record) and, where a trusted MACH station stands within reach, that
     station's own measured error against the served forecast (data/fleet-history-skill.json, lead 0, 1 and 3). */
  let QT = null, QTat = 0;
  function tierRule() {
    if (QT && Date.now() - QTat < 600e3) return QT;
    try { const d = app.store && app.store.dataDir; QT = d ? JSON.parse(readFileSync(join(d, 'quality-tier.json'), 'utf8')) : null; } catch (_) { QT = null; }
    QTat = Date.now(); return QT;
  }
  function customerSkill(u) {
    const R = tierRule() || { reachKm: 15, maxDzM: 150, minHours: 720, marks: { A: '\u25cf\u25cf\u25cf', B: '\u25cf\u25cf\u25cb', C: '\u25cf\u25cb\u25cb' }, labels: {} , why: 'data/quality-tier.json missing: scripts/quality_tier_rule.py' };
    const served = u.elevM ?? u.anchorElevM ?? null;
    let mach = null;
    try {
      const H = app.fleetHistory && app.fleetHistory.summary && app.fleetHistory.summary();
      for (const s of (H && H.ready && H.stations) || []) {
        if (!s.trust || !(s.trust === true || s.trust.temperature)) continue;
        const km = _km(u.lat, u.lon, s.lat, s.lon); if (km > R.reachKm) continue;
        const dz = (served != null && s.elevM != null) ? Math.round(s.elevM - served) : null; if (dz != null && Math.abs(dz) > R.maxDzM) continue;
        const t = s.temperature || {}; if (!(t.n >= R.minHours)) continue;
        if (!mach || km < mach.km) mach = { station: s.name, km: Math.round(km * 10) / 10, dzM: dz, hours: t.n, first: s.first, last: s.last, maeC: t.mae, biasC: t.bias, rmseC: t.rmse };
      }
      /* v91.17.283.28 · S6 / S9 · ONE accuracy figure: the place record's (the verification ledger); the station's own MAE / RMSE are not
         printed beside it any more (mach keeps the station, distance, height step, hours and period that set the tier) */
      if (mach) { delete mach.maeC; delete mach.biasC; delete mach.rmseC; mach.accuracy = 'the place record\u2019s accuracy (verification ledger) is the one figure printed'; }
    } catch (_) {}
    /* v91.17.71 · station calibration (tier B, never MACH): true when the latest served national record for this unit
       carries it; the networks are credited generically (label('network')), never named */
    let calibrated = false;
    try { if (stationData() && app.store) { const runs = app.store.all('runs').filter(r => r.unit_level === 'tehsil' && ['complete', 'partial'].includes(r.status)).sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at)).slice(0, 3);
      for (const run of runs) { const rec = app.store.find('records', x => x.runId === run.run_id && x.unitKey === u.unitId); if (rec) { calibrated = !!rec.biasCorrected; break; } } } } catch (_) { calibrated = false; }
    const tier = mach ? 'A' : ((u.elevSource && u.elevSource !== 'anchor point') || calibrated) ? 'B' : 'C';
    const calLine = calibrated ? ' The served temperature carries ' + label('calibration') + ' from ' + label('network') + ' (tier B; not a MACH measurement).' : '';
    return { schema: 'agn.forecast-basis.v1', tier, mark: (R.marks || {})[tier] || null, label: (R.labels || {})[tier] || null,
      basis: tier === 'A' ? ('MACH station ' + mach.station + ', ' + mach.km + ' km from the unit point' + (mach.dzM != null ? ', ' + (mach.dzM >= 0 ? '+' : '') + mach.dzM + ' m from the served height' : '') + ': the MAch point forecast against the station\u2019s own readings, ' + mach.first + ' to ' + mach.last)
        : tier === 'B' ? 'The model forecast served at this tehsil\u2019s population-weighted settlement height (' + served + ' m; Copernicus DEM GLO-90 and GHS-POP). No MACH station stands within ' + R.reachKm + ' km and ' + R.maxDzM + ' m of it yet.' + calLine
        : 'The model forecast at the unit point with terrain from the Copernicus DEM. No MACH station stands within ' + R.reachKm + ' km and ' + R.maxDzM + ' m of it yet.',
      mach, stationCalibrated: calibrated, rule: { reachKm: R.reachKm, maxDzM: R.maxDzM, minHours: R.minHours, source: 'data/quality-tier.json' },
      servedHeightM: served };
  }
  function skill(u) {
    if (!INTERNAL()) return customerSkill(u);
    const g = app.verification.grades(); const S = g.summary;
    const rows = app.store.filter('unitSkill', r => r.unitId === u.unitId).sort((a, b) => a.lead_hours - b.lead_hours).map(r => {
      const gd = app.verification.guarded(u.unitId, r.lead_hours);
      return { lead: r.lead_hours, hours: r.n, rmseRaw: r.rmse_raw, rmseServed: gd ? r.rmse_raw : r.rmse_served, biasRaw: r.bias_raw, corrected: r.correction_applied && !gd, guard: gd };
    });
    let station = null;
    try {
      const sv = app.stations.summary();
      for (const st of sv.stations || []) { const km = Math.hypot(st.lat - u.lat, (st.lon - u.lon) * Math.cos(u.lat * Math.PI / 180)) * 111; if (km <= 60 && (!station || km < station.km)) station = { ...st, km: Math.round(km) }; }
      if (station) station = { name: station.name, km: station.km, window: sv.window, hours: station.leads[24] && station.leads[24].n, rmseRaw24: station.leads[24] && station.leads[24].rmse_raw, rmseCorrected24: station.leads[24] && station.leads[24].rmse_served, era5: station.era5 };
    } catch {}
    /* v91.17.36 · AUDIT R-02/R-05/V-03 · the reference is named as requested (ECMWF IFS analysis for
       recent windows), the verified model is named (best_match, the screening feed), and a mountain
       unit carries the station-measured error from the skill sheet beside the reanalysis figure. */
    let mountain = null;
    try {
      const el = u.elevM, sh = app.skill.sheet();
      if (el != null && el >= 1000) { const tm = (sh.parameters || []).find(x => x.id === 'temperature_mountain'); mountain = { elevM: el, sheet: tm ? { raw: tm.raw, note: tm.note || tm.caveat || null, sample: tm.sample || null } : null,
        note: 'this unit sits at ' + el + ' m: the station-measured mountain error (PMD mountain AWS) is the figure to read; the reanalysis agreement below is not an observed error and the reanalysis itself is biased cold in the mountains' }; }
    } catch {}
    return { reference: ((S && S.referenceModel === 'ecmwf_ifs') ? 'ECMWF IFS analysis (models=ecmwf_ifs, 9 km), independent test month' : 'ERA5 reanalysis, independent test month') + (S && S.testWindow ? ' ' + S.testWindow.start_date + ' to ' + S.testWindow.end_date : ''),
      referenceIsObservation: false, verifiedModel: (S && S.verifiedModel) || 'best_match', verifiedModelNote: (S && S.verifiedModelNote) || 'the screening feed is what is verified; no error is measured for the ensemble or the named run',
      correctionServing: !!(S && S.correctionServing), mountain, rows, station,
      national: S ? { grade: S.eligible ? 'A' : 'B or lower', passed: S.passed, of: S.unitsTotal, basis: S.eligibleBasis, domain: S.gradeDomain || null, mountainCaveat: S.mountainCaveat || null, medianRaw: S.medianRmse24Raw, medianServed: S.medianRmse24Served } : null,
      ensembleRecord: (() => { try { const e = app.ensVerify.summary(); return { logs: e.logs, firstIssue: e.firstIssue, pairs: e.verifiedPairs, calibrated: e.calibrationReady, firstScoreExpected: e.firstScoreExpected }; } catch { return null; } })(),
      internalDiagnostic: true, customer: customerSkill(u) };
  }

  /* v91.17.279 · CLAIMS279 P3 · the air-quality days a report may act on: none when the air-quality run is stale (smog.mjs fresh()), and
     never a day before today (PKT). The note says why when a stale run is held back. */
  function airDays(ctx) {
    const all = (ctx.air && ctx.air.days) || [], today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
    if (ctx.air && ctx.air.stale) { if (all.length && !ctx.airNote) ctx.airNote = 'air-quality forecast not current' + (ctx.air.ageH != null ? ' (age ' + Math.round(ctx.air.ageH) + ' h)' : '') + ': no air-quality or fog action is raised from it'; return []; }
    return all.filter((d) => d && d.date >= today);
  }
  function actions(ctx) {
    const out = [], ev = ctx.outlook && ctx.outlook.events, days = ctx.outlook && ctx.outlook.ensemble && ctx.outlook.ensemble.days || [];
    const push = (a) => out.push(a); ctx._screenWatch = [];   /* C9: rebuilt with the actions */
    if (ev) {
      /* v91.17.3 · 2.15 · one heat spell, read with its sub-classes. The report
         used to raise a Heat action and a separate Heat (nights) action off two
         events that correlate at 0.92, so a single warm spell produced two rows
         with two owners. One row now, and the sub-class decides what it says. */
      const hs = ev.heatSpell, hc = ev.heatSpellClasses || {};
      if (hs && hs.p >= 30) {
        const both = hc.dayAndNight && hc.dayAndNight.p >= 30;
        const abs = hc.absolute40 && hc.absolute40.p >= 30;
        const night = hc.warmNight && hc.warmNight.p >= 30;
        const parts = [];
        if (abs) parts.push('maximum at or above 40 °C for 3+ days (inland)' + (INTERNAL() ? ' [internal: station-tested detection 0.92 at Multan, 0.79 at Lahore]' : ''));
        if (hc.localDay && hc.localDay.p >= 30) parts.push('maximum in the local top 10% for 3+ days');
        if (night) parts.push('night minimum at or above 25 °C and in the local top 10% for 3+ nights');
        push({ hazard: 'Heat spell', when: hs.onset, prepareBy: minusDays(hs.onset, 1), chance: hs.p, horizon: '15 days',
          /* v91.17.36 · AUDIT R-13 · the skill line follows the sub-class that fired: the 40 °C
             rule's measured detection is not the skill of a percentile spell at 34 °C */
          skillId: abs ? 'tx40' : null, skillNote: abs ? null : 'the spell is a local-percentile class (top 10 % for the place)',
          trigger: (parts.length ? parts.join('; ') : 'unusual heat for 3+ days')
            + ', typically from ' + fmt(hs.onset)
            + (hs.earliest && hs.earliest !== hs.onset ? ' (earliest ' + fmt(hs.earliest) + ')' : '')
            + (both ? '. NO OVERNIGHT RELIEF: the hot days and the warm nights fall in the same window ('
                    + hc.dayAndNight.p + '% of members), which is the combination that causes heat illness — '
                    + 'the body does not recover at night.' : ''),
          action: (both
            ? 'Treat this as a no-relief spell. Move heavy outdoor work before 11:00 and after 16:00; shaded rest and water at each work face; measure WBGT at the work face and brief supervisors on stop limits; AND provide ventilated or cooled rest areas for night shifts and site housing, check the staff most at risk, and hold generator fuel for the cooling load.'
            : night
              ? 'Ventilated or cooled rest areas for night shifts and site housing; check staff most at risk; keep generator fuel for cooling loads.'
              : 'Move heavy outdoor work before 11:00 and after 16:00; set shaded rest and water points at each work face; measure WBGT at the work face and brief supervisors on stop limits.'),
          owner: both ? 'Operations / HSE / Facilities' : night ? 'Facilities / HSE' : 'Operations / HSE' });
      }
      /* v91.17.25 · unusual warmth above 2,500 m is a melt signal: glacier-fed channels and
         glacial lakes, not heat stress */
      /* v91.17.36 · AUDIT R-14 · the melt reading is by TERRAIN: a unit whose ground
         reaches the glacier floor (3,500 m) or whose settlement sits above 2,500 m.
         Ali Abad (2,434 m, emax well above 3,500 m) used to miss it and get a
         "Heat" action with a cooling instruction for an October warm week. */
      const uw = ev.unusualWarmth, elev = ctx.unit && ctx.unit.elevM, emax = ctx.unit && ctx.unit.emaxM;
      const glacial = (emax != null && emax >= 3500) || (elev != null && elev >= 2500);
      if (uw && uw.p >= 50 && glacial) push({ hazard: 'Unusual warmth (melt)', when: uw.onset, prepareBy: minusDays(uw.onset, 1), chance: uw.p, horizon: '15 days',
        trigger: '3+ days with the maximum in the local top 10% at ' + elev + ' m, typically from ' + fmt(uw.onset) + ' — faster snow and glacier melt',
        action: 'Watch glacier-fed channels and known glacial lakes: check the downstream warning chain, keep people and equipment off channel beds and low terraces during the warm afternoons, and check intakes for rising sediment.',
        owner: 'Site management / emergency coordinator' });
      /* v91.17.3 · 2.14 · the coast reads its own rule */
      if (ev.coastalHeat && ev.coastalHeat.p >= 30) push({ hazard: 'Coastal humid heat', when: ev.coastalHeat.onset, prepareBy: minusDays(ev.coastalHeat.onset, 1), chance: ev.coastalHeat.p, horizon: '15 days',
        trigger: 'apparent temperature at or above 40 °C for 2+ days, typically from ' + fmt(ev.coastalHeat.onset),
        why: INTERNAL() ? 'Within 60 km of the sea the dry-bulb 40 °C rule does not work: tested against the PMD Karachi record it detects 0.48 of hot days with a 0.46 false-alarm rate. The danger on a humid coast arrives at a lower air temperature with a higher vapour pressure, so this rule is built on apparent temperature, which carries humidity and wind.' : 'On a humid coast the danger arrives at a lower air temperature with a higher vapour pressure, so this rule is built on apparent temperature, which carries humidity and wind.',
        action: 'Shift outdoor work out of the afternoon entirely rather than shortening it; humid heat does not clear with shade. Measure WBGT, not air temperature, at the work face. Cooled rest areas and electrolyte replacement, not water alone.', owner: 'Operations / HSE' });
      const wet = [ev.rain3_75, ev.rain3Local].filter(Boolean).sort((a, b) => (b.p || 0) - (a.p || 0))[0];
      if (wet && wet.p >= 20) push({ hazard: 'Heavy rain', when: wet.onset, prepareBy: minusDays(wet.onset, 2), chance: wet.p, horizon: '15 days',
        trigger: 'Extreme 3-day rain for this place, typically from ' + fmt(wet.onset) + (ev.max3dRain ? ' (wettest 3 days median ' + ev.max3dRain[1] + ' mm, wet case ' + ev.max3dRain[2] + ' mm)' : ''),
        action: 'Clear drains, culverts and the site discharge point; lift stock and equipment off ground level; test pumps; agree the access-road closure trigger with transport.', owner: 'Facilities / Operations' });
      /* v91.17.283.3 · audit C9 · rain on snow sums the 5-day snowfall with no snowpack or melt model (5 cm of snow, four 15 C days, then
         6 mm of rain read 100 %), so it raises no action: it goes to the watch list as a screening class until a degree-day melt of the pack
         (published DDF) is in place */
      if (ev.rainOnSnow && ev.rainOnSnow.p >= 20) (ctx._screenWatch = ctx._screenWatch || []).push({ hazard: 'Rain on snow', productType: 'Ensemble share',
        what: 'rain of 5 mm or more on snow laid down in the previous five days, with the day above 2 °C, typically from ' + fmt(ev.rainOnSnow.onset) + ' — watch only: a screening class from ensemble members (recent snowfall, no snowpack or melt model), no action is raised from it; compare with the nearest river gauge',
        value: ev.rainOnSnow.p, source: 'global ensemble forecast, raw member share', horizon: 'watch' });
      /* v91.17.283 · WS4 · audit S3 · a screening class (share of members, detection not established) asks the reader to check and prepare, not to act */
      if (ev.heavySnow && ev.heavySnow.p >= 20) push({ hazard: 'Snow', productType: 'Ensemble share', evidence: 'share of the ensemble members (not a calibrated chance; snowfall detection is not established here)', when: ev.heavySnow.onset, prepareBy: minusDays(ev.heavySnow.onset, 2), chance: ev.heavySnow.p, horizon: '15 days', trigger: '3-day snowfall ≥30 cm, typically from ' + fmt(ev.heavySnow.onset),
        action: 'Check the snow forecast again closer to the date and against the road and local reports; prepare to stock fuel, food and medicines and to pre-position snow clearance and chains; check roof loads on light structures.', owner: 'Operations / Facilities' });
      if (ev.frostSpell && ev.frostSpell.p >= 30) push({ hazard: 'Frost', when: ev.frostSpell.onset, prepareBy: minusDays(ev.frostSpell.onset, 1), chance: ev.frostSpell.p, horizon: '15 days', trigger: 'Night minimum ≤0 °C for 3+ nights (settled land below 2,000 m)',
        action: 'Cover or irrigate frost-sensitive crops the evening before; drain or lag exposed water lines; delay concrete pours or use frost protection.', owner: 'Facilities / Agriculture' });
      if (ev.coldSpell && ev.coldSpell.p >= 30) push({ hazard: 'Cold', when: ev.coldSpell.onset, prepareBy: minusDays(ev.coldSpell.onset, 1), chance: ev.coldSpell.p, horizon: '15 days',
        trigger: 'Night minimum in the local bottom 10% for 3+ nights', action: 'Lag exposed pipes and water tanks; issue cold-weather PPE; protect frost-sensitive stock and crops.', owner: 'Facilities / HSE' });
    }
    const windy = days.slice(1, 11).filter(d => d.p && d.p.gu60 >= 20);
    if (windy.length) { const top = windy.sort((a, b) => b.p.gu60 - a.p.gu60)[0];
      push({ hazard: 'Wind', when: top.date, prepareBy: minusDays(top.date, 1), chance: top.p.gu60, horizon: '10 days', trigger: 'Gusts ≥60 km/h on ' + windy.map(d => fmt(d.date)).join(', '),
        action: 'Secure loose materials and temporary structures; check those days against the crane and work-at-height gust limits registered for the site (the OEM limit, on the limit register), and use the site anemometer where one is fitted.', owner: 'Operations / Engineering' }); }   /* v91.17.70 · no stand-down speed is implied: the limit is the client\'s (E-W2) */
    const air = airDays(ctx);
    const smogDays = [], badAir = air.filter(d => d.pmClass >= 3), fogDays = air.filter(d => d.fogHours > 0);   /* v283.36 item 19: no smog-day binary, no fog-day count (fog hours by the WMO visibility definition) */
    if (smogDays.length || badAir.length) { const first = (smogDays[0] || badAir[0]);
      push({ hazard: 'Air quality', productType: 'Indicative', evidence: 'air-quality forecast for the tehsil (indicative: not checked against air-quality monitors)', when: first.date, prepareBy: first.date, chance: null, horizon: '5 days', trigger: (() => { /* v91.17.283.52 D · N28: the category the tiles print (US EPA class of the day: 3 Unhealthy, 4 Very unhealthy, 5 Hazardous), not always "Unhealthy" */
          const CW = ['Good', 'Moderate', 'Unhealthy for sensitive groups', 'Unhealthy', 'Very unhealthy', 'Hazardous'], L = smogDays.length ? smogDays : badAir, top = L.reduce((m, d) => Math.max(m, d.pmClass || 0), 0), w = d => (d.category ? String(d.category) : CW[Math.min(5, d.pmClass || 0)] || 'Unhealthy');
          const one = new Set(L.map(w)).size === 1; return (smogDays.length ? 'Smog-trapping weather with ' : '') + (one ? w(L[0]) + ' air on ' + L.map(d => fmt(d.date)).join(', ') : 'Unhealthy or worse air on ' + L.map(d => fmt(d.date) + ' (' + w(d).toLowerCase() + ')').join(', ')) + (top >= 4 && one ? '' : ''); })() + ' (forecast peak ' + Math.max(...air.map(d => d.pm25 || 0)) + ' µg/m³ daily mean). PM2.5 here is the composition forecast read with the dispersion of the weather forecast.',
        action: 'Check the air quality on a local monitor where one is near; prepare N95/FFP2 masks for outdoor staff and plan to cut strenuous outdoor work if it is confirmed; brief staff with asthma or heart conditions.', owner: 'HSE / Facilities' }); }
    /* v283.51g3 · the fog action counts only fog hours still ahead (live test 51: Clifton "Ready by Tue 3 Nov" in the afternoon for a fog hour
       of that morning). smog.mjs serves the fog hours' PKT hours (fogAt); today keeps the hours from the current hour on; a run stored before
       fogAt existed gives today no fog action (which of its hours are past cannot be told). The action time is the first fog hour ahead. */
    const fogAhead = fogHoursAhead(fogDays);
    if (fogAhead.length) push({ hazard: 'Fog', productType: 'Indicative', evidence: 'air-quality and weather forecast for the tehsil (indicative)', when: fogAhead[0].when, prepareBy: fogAhead[0].when, chance: null, horizon: '5 days', trigger: 'Fog hours ahead (forecast visibility under 1 km, WMO definition): ' + fogAhead.map(d => d.n + ' h on ' + fmt(d.date) + (d.first != null ? ' from ' + String(d.first).padStart(2, '0') + ':00' : '')).join(', '),
      action: 'Move early-morning vehicle movements after 10:00; check fog lights and convoy rules; allow for motorway closures in delivery schedules.', owner: 'Transport / Operations' });
    /* v91.17.283 · WS4 · audit C10 (P1) · the weeks-ahead and season-ahead rows raise an ACTION only when our own verification shows skill in
       Pakistan (seasverify: a Brier score below 0.25, the score of always saying 50 %, on at least 300 scored pairs); until then each row goes
       to the watch list marked "outlook only: no verified skill yet". The rows are built exactly as before. */
    const s2s = s2sSkill();
    /* v91.17.283 · WS2 request R1 · the outlook blocks carry their own `use` (outlook.mjs seasonalUnit, and seasonal() below): an outlook row
       is never an action (use.canAlert false; even a verified outlook stays outlook only); its words come from use.why, else the record */
    const outlookRow = (kind) => (a) => { const U = (kind === 'ec46' ? ctx.subseasonal : ctx.seasonal) || {}; const use = U.use || null;
      const why = use ? (use.verifiedSkill ? 'skill measured, still an outlook only' : (use.why || 'no verified skill yet')) : 'no verified skill yet in Pakistan (' + s2s.why[kind] + ')';
      (ctx._outlookWatch = ctx._outlookWatch || []).push({ hazard: a.hazard, what: a.trigger + ' — outlook only, ' + why + '; no action is raised from it', value: a.chance, source: kind === 'ec46' ? 'weeks 1–6 outlook (51 forecast runs)' : 'season outlook (51 forecast runs)', horizon: 'watch', productType: 'Ensemble share' }); };
    const sub = ctx.subseasonal && ctx.subseasonal.weeks || [];
    const later = sub.filter(w => w.start > minusDays(new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10), -10));
    const warmWk = later.filter(w => w.pT1 >= 60)[0], wetWk = later.filter(w => w.pP10 >= 40 && w.pAnom > 5)[0], dryWk = later.filter(w => w.pP0 != null && w.pP0 <= 20 && w.pAnom < -3)[0];
    if (warmWk) outlookRow('ec46')({ hazard: ((ctx.unit && ((ctx.unit.emaxM != null && ctx.unit.emaxM >= 3500) || (ctx.unit.elevM != null && ctx.unit.elevM >= 2500))) ? 'Warm anomaly (melt-relevant)' : 'Warm anomaly'), when: warmWk.start, prepareBy: minusDays(warmWk.start, 7), chance: warmWk.pT1, horizon: 'weeks 3-6', trigger: 'Week of ' + fmt(warmWk.start) + ' more than 1 °C warmer than normal (' + warmWk.pT1 + '% of members)', action: 'Plan cooling and water demand for that week; avoid scheduling heat-sensitive work (concrete pours, long outdoor shifts) into it.', owner: 'Planning' });
    if (wetWk) outlookRow('ec46')({ hazard: 'Rain', when: wetWk.start, prepareBy: minusDays(wetWk.start, 7), chance: wetWk.pP10, horizon: 'weeks 3-6', trigger: 'Week of ' + fmt(wetWk.start) + ' wetter than normal by ' + wetWk.pAnom + ' mm (' + wetWk.pP10 + '% of members above +10 mm)', action: 'Schedule earthworks and exposed works outside that week; complete drainage maintenance before it.', owner: 'Planning / Facilities' });
    if (dryWk) outlookRow('ec46')({ hazard: 'Dry spell', when: dryWk.start, prepareBy: minusDays(dryWk.start, 7), chance: 100 - dryWk.pP0, horizon: 'weeks 3-6', trigger: 'Week of ' + fmt(dryWk.start) + ' drier than normal (' + (100 - dryWk.pP0) + '% of members below normal)', action: 'Check water storage and irrigation schedules; plan dust control on unpaved areas.', owner: 'Facilities' });
    const mon = ctx.seasonal && ctx.seasonal.months || [];
    const wetM = mon.slice(1).filter(m => m.pMean && m.pAnom >= Math.max(10, 0.25 * (m.pMean - m.pAnom)));
    const dryM = mon.slice(1).filter(m => m.pMean != null && m.pAnom <= -Math.max(10, 0.25 * (m.pMean - m.pAnom)));
    const warmM = mon.slice(1).filter(m => m.tAnom >= 1);
    if (wetM.length) outlookRow('seas5')({ hazard: 'Rain (season)', when: wetM[0].month + '-01', prepareBy: minusDays(wetM[0].month + '-01', 14), chance: null, horizon: 'season', trigger: 'SEAS5: ' + wetM.map(m => monthName(m.month) + ' +' + m.pAnom + ' mm').join(', ') + ' against normal', action: 'Bring drainage, roof and slope maintenance forward to before ' + monthName(wetM[0].month) + '; review flood protection and stock positions.', owner: 'Facilities' });
    if (dryM.length) outlookRow('seas5')({ hazard: 'Drought (season)', when: dryM[0].month + '-01', prepareBy: minusDays(dryM[0].month + '-01', 14), chance: null, horizon: 'season', trigger: 'SEAS5: ' + dryM.map(m => monthName(m.month) + ' ' + m.pAnom + ' mm').join(', ') + ' against normal', action: 'Secure water supply contracts and storage; plan irrigation and dust control.', owner: 'Facilities / Procurement' });
    if (warmM.length) outlookRow('seas5')({ hazard: 'Warmth (season)', when: warmM[0].month + '-01', prepareBy: minusDays(warmM[0].month + '-01', 14), chance: null, horizon: 'season', trigger: 'SEAS5: ' + warmM.map(m => monthName(m.month) + ' +' + m.tAnom + ' °C').join(', ') + ' against normal', action: 'Budget for higher cooling and water demand in the warm months; expect fewer frost days in the winter months.', owner: 'Planning' });
    /* ══ v91.17.3 · 5.2 · EVERY ACTION CARRIES THE SKILL OF WHAT RAISED IT ═══
       An action row told a reader what to do and gave them no way to judge how
       much to trust it. The hazard's measured detection rate, false-alarm rate
       and domain now travel on the row, from the one skill sheet at
       /api/skill, so a sceptical engineer can weigh the instruction without
       leaving the document. Where a hazard is unverified the row says that in
       those words, which is a different statement from a weak number. */
    /* v91.17.70 · the station-measured detection lines are internal diagnostics (PMD records); the customer row carries its basis */
    const SK = INTERNAL() ? (() => { try { return app.skill.sheet(); } catch { return null; } })() : null;
    if (!SK) for (const a of out) if (!a.skill) a.skill = { basis: a.horizon === 'season' || /week/.test(String(a.horizon || '')) ? 'ECMWF SEAS5 / EC46 against their own hindcast climate' : a.chance != null ? 'share of the 51 ECMWF ensemble members' : 'the forecast for the tehsil', sheet: '/api/sources' };
    if (SK) {
      const pick = {
        'Heat spell': 'tx40', 'Coastal humid heat': 'coastalHeat', 'Rain on snow': 'rainOnSnow',
        'Frost': 'tn0', 'Cold': 'tn-5', 'Wind': 'gu60',
      };
      const param = { 'Heavy rain': 'rainfall', 'Rain': 'rainfall', 'Dry spell': 'rainfall',
                      'Air quality': 'air_quality', 'Snow': 'snowfall' };   /* v91.17.36 · AUDIT R-17 · Fog has no sheet entry; it does not borrow the particulate line */
      for (const a of out) {
        const pickId = (a.skillId !== undefined) ? a.skillId : (pick[a.hazard] || null);
        const th = pickId ? SK.thresholds.find(t => t.id === pickId) : null;
        const pm = (!th && param[a.hazard]) ? SK.parameters.find(x => x.id === param[a.hazard]) : null;
        const src = th || pm;
        if (!src) { a.skill = { verified: null, line: (a.skillNote || 'no skill entry is published for this hazard yet; treat it as unverified') }; continue; }
        a.skill = {
          verified: src.verified === true,
          id: src.id,
          line: src.verified === true
            ? ('Measured: ' + (th
                ? ((th.results || []).map(r => { const det = (r.detection != null ? r.detection : (r.corrected && r.corrected.detection)), fa = (r.falseAlarms != null ? r.falseAlarms : (r.corrected && r.corrected.falseAlarms));
                      return (det == null && fa == null) ? (r.site + ': ' + (r.note || r.result || 'no detection figures published')) : (r.site + ' detection ' + (det != null ? det : 'n/a') + ', false alarms ' + (fa != null ? fa : 'n/a')); }).join('; ') || (th.note || 'measured; see the sheet'))
                : (function(raw){ try { return Object.entries(raw || {}).map(([k, v]) => k.replace(/([A-Z])/g, ' $1').toLowerCase() + ' ' + (typeof v === 'object' ? JSON.stringify(v) : v)).join(', ') || 'see the sheet'; } catch { return 'see the sheet'; } })(pm.raw)) + '. ' + src.action)
            : ('NOT VERIFIED. ' + src.action),
          sheet: '/api/skill',
        };
      }
    }
    /* v91.17.36 · AUDIT R-17 · a ready-by date in the past is 'now' */
    const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
    for (const a of out) if (a.prepareBy && a.prepareBy < today) { a.prepareByOriginal = a.prepareBy; a.prepareBy = today; a.prepareByNote = 'the computed lead date has passed; prepare now'; }
    return out.sort((a, b) => String(a.prepareBy).localeCompare(String(b.prepareBy)));
  }
  function s2sSkill() {
    const why = { ec46: 'no scored weeks yet', seas5: 'no Brier score is kept for the season outlook yet' }, ok = { ec46: false, seas5: false };
    try { const V = app.seasVerify && app.seasVerify.summary();
      for (const kind of ['ec46', 'seas5']) { const X = (V && V[kind]) || {}; const best = Object.entries(X).map(([k, a]) => ({ k, a })).filter((r) => r.a && r.a.brierWarmer != null && r.a.pairs >= 300);
        if (best.length) { const good = best.filter((r) => r.a.brierWarmer < 0.25 && (r.a.brierWetter == null || r.a.brierWetter < 0.25));
          ok[kind] = good.length > 0; why[kind] = good.length ? 'measured Brier ' + good.map((r) => r.k + ' ' + r.a.brierWarmer).join(', ') + ' (below 0.25, the score of always saying 50 %)' : 'measured Brier ' + best.map((r) => r.k + ' ' + r.a.brierWarmer).join(', ') + ' (not below 0.25, the score of always saying 50 %)'; }
        else if (V) why[kind] = (kind === 'ec46' ? (V.logs && V.logs.ec46) : (V.logs && V.logs.seas5)) + ' issue(s) logged, fewer than 300 scored pairs'; } } catch (_) {}
    return { ...ok, why };
  }
  function monthName(ym) { return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4); }

  /* v91.17.77 · U2 · A-49 · the subject can be a DISTRICT name (the map's district fill and siteUnit() resolve to one, e.g.
     "East Karachi", "Tharparkar"), and findUnit() knows tehsils only, so every such selection answered 404. A district name
     now resolves to the tehsil whose centroid is nearest the district's centre (mean of its tehsil centroids), and the
     context says so. Word order is ignored ("Karachi East" = "East Karachi"). A name that is neither still answers 404. */
  function districtUnit(name) {
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
    const k = norm(name); if (!k) return null;
    const T = (units.tehsil || []).filter(t => t.district && norm(t.district) === k && t.lat != null && t.lon != null);
    if (!T.length) return null;
    const lat = T.reduce((s, t) => s + t.lat, 0) / T.length, lon = T.reduce((s, t) => s + t.lon, 0) / T.length;
    let best = null, bd = Infinity;
    for (const t of T) { const d = (t.lat - lat) ** 2 + ((t.lon - lon) * Math.cos(lat * Math.PI / 180)) ** 2; if (d < bd) { bd = d; best = t; } }
    return best ? { unit: best, from: { asked: String(name), district: best.district, tehsils: T.length, basis: 'district name: the tehsil nearest the district centre (' + best.name + ') stands in for it' } } : null;
  }
  /* ══ v91.17.283 · WS4 · item 6 · A REPORT IS MADE IN THE SECTION IT BELONGS TO ═══════════════════════════════════════════════════
     The site assessment is generated from Operations / Assets (one site), the portfolio screening from Portfolio (several sites); the
     Reports tab is the library of issued reports (/api/reports). The context says which kind it serves and the one structure every
     report keeps (key findings, contents, descriptive / diagnostic / predictive / prescriptive, suggestions). English only: no Urdu edition. */
  /* REPORT_KINDS: module level, exported (v283 INTEG) so reports.mjs issues against the same table */
  const REPORT_STRUCTURE = ['Key findings', 'Contents', 'Descriptive: what is forecast and observed', 'Diagnostic: why, with the drivers and the evidence', 'Predictive: the next days, weeks and season (outlooks marked as such)', 'Prescriptive: actions with their trigger and owner', 'Suggestions: standing measures and the watch list', 'Limitations and measured accuracy', 'Sources'];
  function reportKind(q) {
    const sec = String((q && q.section) || '').toLowerCase().trim();
    /* v91.17.283.8 · audit 15 · the kind asked for (kind=), when it may be issued from this section; else the section's first kind */
    const want = normaliseKind(q && q.kind); const kind = want && REPORT_KINDS[want].sections.includes(sec) ? [want, REPORT_KINDS[want]] : Object.entries(REPORT_KINDS).find(([, v]) => v.sections.includes(sec));
    return { kind: kind ? kind[0] : null, section: sec || null, ...(kind ? { title: kind[1].title, scope: kind[1].scope } : { why: 'no section named: a report is generated from Operations / Assets (site assessment) or Portfolio (portfolio screening)' }),
      kinds: Object.fromEntries(Object.entries(REPORT_KINDS).map(([k, v]) => [k, { title: v.title, from: v.sections }])), structure: REPORT_STRUCTURE, language: 'en', library: '/api/reports' };
  }
  /* == v91.17.283.28 · S9 · ONE REPORT BUILDER: THE PLACE RECORD =====================================================================
     Every report reads the place's values from the place record the screen reads (placerecord.mjs: the same function the place bundle's
     parts placeRecord and siteLevels call, on the same point state), so a report and the screen show the same values. placeFor() is the
     one entry: the report context (GET /api/report/context) carries it, and an issue (POST /api/reports/issue, reports.mjs) is accepted
     only when it is complete (the point state and the tehsil's issued levels loaded); otherwise the issue is refused with the reason,
     never frozen from partial data. The point: lat/lon when given (its tehsil by polygon, the bundle's rule), else the tehsil point. */
  async function placeFor(q, opts = {}) {
    const view = opts.customer === false ? 'operator' : 'customer';
    let lat = q && q.lat != null && q.lat !== '' ? Number(q.lat) : NaN, lon = q && q.lon != null && q.lon !== '' ? Number(q.lon) : NaN, uid = null;
    if (!(isFinite(lat) && isFinite(lon))) { const u = q && q.unit ? app.outlook.findUnit(q.unit) : null; if (!u) return { complete: false, why: 'the report names no place (no point and no tehsil)' }; lat = u.lat; lon = u.lon; uid = u.unitId; }
    if (!app.pointState || !app.placeRecord) return { complete: false, why: 'the place record is not running on this server' };
    let ps = null; try { ps = await app.pointState.state(lat, lon, { noBuild: true }); } catch (e) { ps = { ok: false, why: String(e && e.message || e).slice(0, 160) }; }
    if (!ps || !ps.ok) return { complete: false, lat, lon, why: 'the forecast of this place is not available: ' + clientWhy((ps && ps.why) || 'no point state') };
    uid = (ps.area && ps.area.unitId) || uid;
    const c = { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5, uid, elevM: ps.point && ps.point.elevM, view, ps };
    const record = app.placeRecord.record(c), siteLevels = app.placeRecord.siteLevels(c);
    const complete = !!(record && record.ok && record.complete && siteLevels && siteLevels.ok);
    return { complete, lat: c.lat, lon: c.lon, unitId: uid, record, siteLevels, ...(complete ? {} : { why: (record && (record.incompleteWhy || record.why)) || (siteLevels && siteLevels.why) || 'the place record is incomplete' }) };
  }
  async function context(q, opts = {}) {
    /* v91.17.172 · audit E-3/E-14 · the customer view (opts.customer, set by index.mjs from x-agn-view and the caller) gets the
       context with supplier names replaced by role words (customerscrub.mjs), scrubbed BEFORE the provenance digest is taken */
    const cust = (o) => opts && opts.customer ? customerScrub(o) : o;
    /* v283.28 S9: the place record first; a point's tehsil is its polygon's (the bundle's rule), not the nearest centroid */
    const P = await placeFor(q, opts);
    let u = P.unitId ? app.outlook.findUnit(P.unitId) : (q.unit ? app.outlook.findUnit(q.unit) : null), resolvedFrom = null;
    if (!u && q.lat != null && q.lon != null && isFinite(Number(q.lat))) u = nearestUnit(Number(q.lat), Number(q.lon));
    if (!u && q.unit) { const r = districtUnit(q.unit); if (r) { u = r.unit; resolvedFrom = r.from; } }
    if (!u) return null;
    const o = app.outlook.unit(u.unitId) || {};
    const ctx = { schema: 'agn.report.context.v1', generatedAt: new Date().toISOString(), unit: { ...o.unit, lat: u.lat, lon: u.lon },
      outlook: { ensemble: o.ensemble ? { at: o.ensemble.at, model: o.ensemble.model, members: o.ensemble.members, days: o.ensemble.days } : null, events: o.events, adjustment: o.adjustment, sunshine: o.sunshine } };
    if (resolvedFrom) ctx.unitResolvedFrom = resolvedFrom;
    ctx.place = { complete: P.complete, lat: P.lat ?? null, lon: P.lon ?? null, unitId: P.unitId ?? null, record: P.record || null, siteLevels: P.siteLevels || null, ...(P.why ? { why: P.why } : {}),
      rule: 'the same place record the screen reads (GET /api/point parts placeRecord and siteLevels); a report is issued only when it is complete' };
    if (u.disputed) { ctx.note = 'Disputed territory: no meteorological product is published.'; return cust(ctx); }
    try { const sm = app.smog.unit(u.unitId); if (sm) ctx.air = { at: sm.at, ageH: sm.ageH, stale: sm.stale, staleWhy: sm.staleWhy, days: sm.days, classes: sm.classes, dispersion: sm.dispersion, notes: sm.notes }; } catch {}
    const s = await seasonal(u); ctx.subseasonal = s.subseasonal; ctx.seasonal = s.seasonal; ctx.errors = s.errors;
    /* v91.17.266 · client-safe labels for the three horizons the report prints (the model ids stay for the operator); a horizon that could
       not be read is "not available" for the customer, the provider's reason for the operator */
    if (ctx.outlook && ctx.outlook.ensemble) ctx.outlook.ensemble.label = '15-day outlook: ' + (ctx.outlook.ensemble.members || 51) + ' forecast runs';
    if (ctx.subseasonal) ctx.subseasonal = { ...ctx.subseasonal, label: 'Weeks 1\u20136 outlook: 51 forecast runs, against their own normal for the same week' };
    if (ctx.seasonal) ctx.seasonal = { ...ctx.seasonal, label: 'Season outlook: 51 forecast runs, against their own normal for the same month' };
    if (opts && opts.customer && ctx.errors && ctx.errors.length) ctx.errors = ctx.errors.map((e) => /^EC46/.test(e) ? 'Weeks 1\u20136 outlook not available' : /^SEAS5/.test(e) ? 'Season outlook not available' : 'not available');
    ctx.skill = skill(u);
    /* v91.17.283 · WS4 · item 1 · the measured out-of-sample figures every report prints, generated from the evidence files (never typed) */
    try { ctx.measuredSkill = evidenceForClient(app.dataDir || (app.store && app.store.dataDir)); } catch (_) { ctx.measuredSkill = { ready: false, why: 'the measured-skill evidence could not be read' }; }
    /* v91.17.283 · WS4 · item 8 · the hazard levels a report prints are the served levels (served.mjs, the console's and start page's), with
       product types and "Not assessed" reasons; nothing is re-derived for the document */
    let LU = null; try { const L = servedUnit(app, u.unitId, false); LU = L; ctx.levels = L && L.ready ? { at: L.at, stale: L.stale, servedBy: L.servedBy, hidden: L.hidden, days: L.days.map((d) => ({ day: d.day, date: d.date,
        layers: Object.fromEntries(Object.entries(d.layers).map(([k, v]) => [k, { name: v.name, word: v.assessed === false ? 'Not assessed' : v.word, level: v.assessed === false ? null : v.level, ...(v.state ? { state: v.state } : {}), ...(v.levelLabel ? { levelLabel: v.levelLabel } : {}), productType: v.productType || null, ...(v.assessed === false ? { notAssessedWhy: v.notAssessedWhy } : {}), ...(v.canAlert === false && v.level >= 2 ? { raisesNoAlert: true } : {}), ...(v.basis ? { basis: v.basis } : {}), ...(v.held ? { held: true, heldNote: v.heldNote || null } : {}), ...(v.outsideTestedDomain ? { outsideTestedDomain: true, productTypeWhy: v.productTypeWhy } : {}) }])) })),   /* v91.17.283.8 · audit 7: the time basis (held from the issue) travels with the level */
        ...(L.alertsWithheld ? { alertsWithheld: L.alertsWithheld } : {}), ...(L.gateUnavailable ? { gateUnavailable: true, why: L.why } : {}) } : { ready: false, notAssessedWhy: (L && L.why) || NOT_ASSESSED['-1'] }; } catch (_) { ctx.levels = { ready: false, notAssessedWhy: NOT_ASSESSED['-1'] }; }
    /* v91.17.283.31 · owner (29 Oct) · THE REPORT'S HAZARDS: a hazard is listed only at Moderate or above (its peak over the served days);
       a Low is a condition line ("moderate heat stress on 30 Oct"), never a hazard and never an alert; with nothing at Moderate the report says
       "No hazard at this site in the period" (every report builder reads this, so the console, the report add-on and both pages agree) */
    /* v283.36 item 23/42: the report prints the served unit's own hazard list (Low with its UTCI value), never a second derivation */
    try { ctx.hazardList = LU && LU.ready && LU.hazardList ? LU.hazardList : hazardListOf(ctx.levels); } catch (_) { ctx.hazardList = { ready: false, hazards: [], conditions: [], none: null }; }
    /* v91.17.283.10 · OWNER DECISION 23 Oct 2026 02:37 PKT · DROUGHT STAYS IN THE CLIENT REPORT as a monthly screening section (never an
       alert: the gate's drought entry may not alert and served.mjs withholds any drought alert from a client). The level is the served
       level (the map's), the class and the month of data come from the national drought table (latest complete calendar month). */
    try { ctx.drought = droughtSectionOf(app, u, ctx.levels); } catch (e) { ctx.drought = { title: DROUGHT_TITLE, note: DROUGHT_SCREEN_NOTE, level: 'Not assessed', notAssessedWhy: 'the drought table could not be read', raisesAlert: false }; }
    ctx.report = reportKind(q);
    if (INTERNAL()) try { ctx.metNotes = metNotes(u); } catch {}   /* v91.17.45 · v91.17.70: PMD mountain network, internal only */
    /* v91.17.3 · 1.12 · the measured skill sheet travels with the context, so a
       report is never assembled from a copy of it that has drifted. */
    if (INTERNAL()) try { const sh = app.skill.sheet(); ctx.skillSheet = { version: sh.version, measuredOn: sh.measuredOn, reference: sh.reference, refit: sh.refit, at: '/api/skill', withheld: sh.withheld }; } catch {}
    /* v91.17.70 · the methods line every report prints, from the data files' licence headers (/api/sources) */
    try { ctx.sources = { line: app.sources.methodsLine(), at: '/api/sources' }; } catch {}
    ctx.actions = actions(ctx);
    /* v91.17.43 · S1 · a report always carries suggestions: standing measures for the season and the ground, and a watch
       list of what sits below the action thresholds. Nothing here is dated or clocked; every row says why it is there. */
    try { ctx.standing = standing(ctx, u); } catch (e) { ctx.standing = []; ctx.standingError = e.message; }
    try { ctx.watch = watchList(ctx, u); } catch (e) { ctx.watch = []; ctx.watchError = e.message; }
    /* v91.17.126 · stage 7 · the report carries the identity of every model, rule and run behind it, and a digest of its own content */
    /* == BEGIN v91.17.283.48 · GUIDANCE (GUIDANCE_PANEL=1 only): the site report's "What to do" section reads the same selection as
       GET /api/guidance (server/api/guidance.mjs); the library version and item ids ride the provenance block == */
    if (GUIDANCE_ON() && app.guidance) { try { ctx.guidance = await app.guidance.forPlace({ lat: P.lat ?? u.lat, lon: P.lon ?? u.lon, audience: q.audience || 'business', lang: q.lang }, { view: opts && opts.customer ? 'customer' : 'operator' }); } catch (_) { ctx.guidance = { ok: false, why: 'the guidance could not be read' }; } }
    /* == END v91.17.283.48 · GUIDANCE == */
    const out = cust(ctx);
    try { if (app.provenance) Object.assign(out, app.provenance.stamp(out));   /* the provenance block names files and versions, no supplier (checked); the digest covers the scrubbed body */ } catch (_) {}
    if (GUIDANCE_ON() && out.guidance && out.guidance.provenance && out.provenance && typeof out.provenance === 'object') out.provenance = { ...out.provenance, guidance: { library: 'nigraan-guidance', libraryVersion: out.guidance.provenance.libraryVersion, itemIds: out.guidance.provenance.itemIds } };   /* v91.17.283.48 · the digest covers the same ids in out.guidance.provenance */
    return out;
  }

  /* ── standing measures: the hazards this place carries in this season and on this ground ─────────── */
  const STANDING = STANDING_MEASURES;   /* v91.17.283.51 g2 · moved to module scope (the report engine reads the same texts) */
  function standing(ctx, u) {
    const out = []; const now = new Date(Date.now() + 5 * 3600e3); const m = now.getUTCMonth() + 1; const nm = (m % 12) + 1; const yr = now.getUTCFullYear();
    const C = app.climatology; const th = (mm) => { try { return C && C.ready() ? C.thresholds(u.unitId, `${yr}-${String(mm).padStart(2, '0')}-15`) : null; } catch { return null; } };
    const t0 = th(m), t1 = th(nm); const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const push = (id, why, evidence) => { const r = STANDING[id]; if (!r) return; out.push({ id, hazard: id, measure: r.measure, owner: r.owner, why, evidence, horizon: 'standing' }); };
    /* v283.36 · launch items 22 / 23 · no standing switch on an untested cut (tx90 >= 38, tn10 <= 2, p99 3-day >= 40 or < 15 mm, >= 10 % within
       5 m, >= 30 % within 2 m, relief >= 800 m): the measured value is printed as a fact for every place, with no measure attached */
    /* v91.17.283.49 · 1.0.10 report engine · the template bug: a fact row carried its fact as BOTH the measure and the why, so the Action
       column repeated the Trigger text (6 of 7 rows in the owner's I-8 report). A fact row now carries its own action: what to do with the
       measured value (plan for it, check the site against it), with no switch on an untested cut; the fact stays the why. */
    const fact = (id, text, evidence, action) => out.push({ id, hazard: id, measure: action || (STANDING[id] && STANDING[id].measure) || text, owner: (STANDING[id] && STANDING[id].owner) || null, why: text, evidence, horizon: 'standing', fact: true });
    const elev = u.elevM ?? (u.anchorElevM ?? null);   /* v91.17.68 · unknown height is unknown, not 9999 (C22) */
    /* v91.17.283.51 g2 · live test 51: "Check that the heat plan holds on a 25.9 °C day (1 in 10)" while every forecast day of the same report
       was warmer. Root cause: the statistic was the calendar-day percentile of the 15th of this month and of next month (15 Nov and 15 Dec for
       a report of 3 Nov): in a cooling season the values of 12 and 42 days ahead, below the days the report forecasts; and the heat row was
       printed in every month, also where the season brings no heat stress. Now: the climatology's own calendar-day percentiles (15-day window)
       of EVERY day from today to 30 days ahead and their extreme (tx90 max, tn10 min, pr3_99 max); the heat-season row only where the same
       window's 1-in-10 shade UTCI daily maximum (u90) reaches the lower edge of the issued heat scale (thresholds register utci.heatLevels:
       Low = moderate heat stress, Blazejczyk et al. 2013). Each row carries its number and window (stat), so the report engine compares it
       with the forecast days on the same served basis and says when the forecast is above it. */
    const WIN = []; for (let k = 0; k <= 30; k++) { const d = new Date(now.getTime() + k * 864e5).toISOString().slice(0, 10); let t = null; try { t = C && C.ready() ? C.thresholds(u.unitId, d) : null; } catch { t = null; } if (t) WIN.push({ d, t }); }
    const winExt = (k, f) => { const v = WIN.map((w) => w.t[k]).filter((x) => x != null && isFinite(x)); return v.length >= 20 ? f(...v) : null; };
    const dTxt = (d) => +d.slice(8, 10) + ' ' + MN[+d.slice(5, 7) - 1];
    const winTxt = WIN.length ? dTxt(WIN[0].d) + ' to ' + dTxt(WIN[WIN.length - 1].d) : '';
    const stat = (k, v, extra) => ({ stat: k, value: v, from: WIN.length ? WIN[0].d : null, to: WIN.length ? WIN[WIN.length - 1].d : null, ...(extra || {}) });
    const factS = (id, text, evidence, action, s) => { fact(id, text, evidence, action); out[out.length - 1].stat = s; };
    void t0; void t1;
    { const tx = winExt('tx90', Math.max), u9 = winExt('u90', Math.max); let lowC = null; try { const HL = heatLevels(); lowC = HL && HL.bands && HL.bands[0] ? HL.bands[0][0] : null; } catch { lowC = null; }
      if (tx != null && (u9 == null || lowC == null || u9 >= lowC)) factS('heat', `1 day in 10 reaches ${tx} °C or more here from ${winTxt} (the local 90th-percentile daily maximum, hottest day of that window)` + (u9 != null && lowC != null ? `; the 1-in-10 shade heat stress (UTCI) of that window reaches ${u9} °C, inside the heat scale (from ${lowC} °C)` : ''), 'reanalysis calendar-day percentiles at the served height',
        `Check that the heat plan holds on a ${tx} °C day (1 day in 10 is this hot or hotter here in the next 30 days): water, shade and work-rest timing at each work face, and cooling plant and its power sized for that day.`, stat('tx90', tx, { utci90C: u9, heatScaleLowC: lowC })); }
    { const v = winExt('pr3_99', Math.max); if (v != null) factS('monsoon', `1 three-day rain total in 100 reaches ${v} mm or more here from ${winTxt} (the local 99th-percentile 3-day rain, wettest day of that window)`, 'reanalysis calendar-day percentiles',
      `Check that the site drains, culverts and discharge point carry a ${v} mm three-day rain (1 three-day total in 100 is this wet or wetter here in the next 30 days), and clear them before a wet spell.`, stat('pr3_99', v)); }
    { const lo = winExt('tn10', Math.min); if (lo != null) factS('cold', `1 night in 10 falls to ${lo} °C or lower here from ${winTxt} (the local 10th-percentile night minimum, coldest night of that window)`, 'reanalysis calendar-day percentiles',
      lo <= 0 ? `Plan for nights of ${lo} °C (1 night in 10 is this cold or colder here in the next 30 days): water freezes, so lag exposed pipes and tanks, check heaters and antifreeze, and issue cold-weather PPE for the early shift.`
        : `Plan for nights of ${lo} °C (1 night in 10 is this cold or colder here in the next 30 days): check heaters and cold-weather clothing for the night and early shifts.`, stat('tn10', lo)); }
    if (elev != null && elev < 700 && u.lat >= 29 && (m >= 10 || m <= 2)) push('smog', 'plains unit in the October-February smog season', 'seasonal climatology of Punjab and the KP plains (the composition forecast under-reads winter smog)');
    if ((u.province === 'Balochistan' || u.province === 'Sindh') && m >= 3 && m <= 6 && elev != null && elev < 1500) push('dust', 'pre-monsoon dust season in the south-west', 'seasonal climatology');
    /* v283.36: the dry-season switch (p99 3-day < 15 mm) is gone: the 3-day value above is the fact */
    /* the ground */
    try { const h = app.hand && app.hand.of(u.unitId); if (h && h.bands && h.bands.lt2 != null) fact('riverine', `${Math.round(100 * (h.bands.lt2 + h.bands.b2_5))}% of the tehsil lies less than 5 m above the major rivers`, 'river-height map of the tehsil (terrain model at about 180 m)',
        'Record the site\'s height above the nearest major river and its flood-protection level; if the site lies in that low share, know the river reach the provincial flood cell reports and keep the route to higher ground agreed.');   /* v91.17.266 · plain words */
      if (h && h.local && h.local.lt2 != null) fact('ponding', `${Math.round(100 * h.local.lt2)}% of the tehsil lies less than 2 m above its local drains`, 'river-height map of the tehsil (terrain model at about 180 m)'); } catch {}
    if (u.emaxM != null && u.eminM != null) fact('slope', `relief of ${Math.round(u.emaxM - u.eminM)} m inside the tehsil`, 'tehsil terrain model (30 m elevation)',
      'Find out whether the site or its access roads sit below steep ground; where they do, inspect the slopes and drains above them after heavy rain and keep an alternative access route.');
    /* v91.17.283.24 · self-audit H15 · the standing GLOF row reads the SERVED national record of this tehsil (glof.national(): the class the
       issued map level is made from, hazsci.mjs applyGlof), not a second routing from the tehsil centre (upstream()); a row only when that
       class has a level above Normal in the one GLOF table */
    try { const G = app.glof && app.glof.national ? app.glof.national(false) : null, g = G && G.ok !== false && G.units ? G.units[u.unitId] : null; if (g && g.applicable && g.class && g.word && g.word !== 'Normal') { /* v91.17.163 · O15 · the report read "level Monitor" (the old ladder word) and raw 4-5 decimal sums; the customer ladder words and 2 significant figures */
        /* v91.17.275 HAZ2 · the word comes from glof.mjs (g.word: one rule with the map and the AI); this table printed Monitor as Moderate */
        const b = String(g.basis || '').replace(/\d+\.\d{3,}/g, (x) => String(Number(Number(x).toPrecision(2))));
        push('glof', `glacial lakes upstream put this tehsil at ${g.word} for a lake outburst (lake-routed screening of the tehsil): ${b}`.slice(0, 260), '/api/point (part glof)'); } } catch {}
    /* v91.17.283 · WS4 · D13 / audit S6 · coastal exposure from the measured distance to the sea edge (data/hazard-applicability.json, the coastal
       mask: the tehsil anchor within coastKm of the Arabian Sea edge of the national outline), not a latitude box with an unknown height read as 0 m */
    { const cz = coastOf(u); if (cz && cz.inside) push('coastal', 'the tehsil lies within ' + cz.coastKm + ' km of the Arabian Sea coast', 'distance to the sea edge (coastal mask, ' + cz.source + ')'); }
    return out;
  }
  let APL = null, APLat = 0;
  function coastOf(u) {
    try { if (!APL || Date.now() - APLat > 600e3) { const d = app.dataDir || (app.store && app.store.dataDir); APL = JSON.parse(readFileSync(join(d, 'hazard-applicability.json'), 'utf8')); APLat = Date.now(); } } catch (_) { APL = null; }
    const C = APL && APL.layers && APL.layers.coastal; if (!C || !C.units) return null;
    const p = C.params && C.params.coastKm ? C.params.coastKm.value : null; if (p == null) return null;
    /* the mask lists the tehsils OUTSIDE it; a tehsil absent from the list is inside only when the unit ids are the file's keys (the count of
       absent tehsils equals the mask's own count n), so an id mismatch can never put an inland tehsil on the coast */
    const T = (units.tehsil || []).filter((t) => !t.disputed); const absent = T.filter((t) => !C.units[t.unitId]).length;
    if (C.n != null && absent !== C.n) return null;
    const out = C.units[u.unitId];
    return out ? { inside: false, km: out.coastKm } : { inside: true, coastKm: p, source: 'data/hazard-applicability.json' };
  }
  /* ── the watch list: what sits below the action thresholds, with its number ─────────────────────── */
  function watchList(ctx, u) {
    const out = []; const ev = ctx.outlook && ctx.outlook.events; const raised = new Set((ctx.actions || []).map(a => a.hazard));
    const push = (hazard, what, value, source) => out.push({ hazard, what, value, source, horizon: 'watch' });
    if (ev) {
      /* v91.17.68 · one map of action lines, the same ones actions() raises on (heat 30, coastal 30, unusual warmth 50 and only on
         glacial terrain, frost/cold 30, the rest 20); a 25 % heat spell used to fall between the actions and the watch list (audit C3) */
      const ACTION_LINE = { heatSpell: 30, coastalHeat: 30, unusualWarmth: 50, frostSpell: 30, coldSpell: 30 };
      const lineOf = (k) => ACTION_LINE[k] || 20;
      const LBL = { heatSpell: 'Heat spell', unusualWarmth: 'Unusual warmth', coastalHeat: 'Coastal humid heat', rain3_75: 'Heavy rain (≥ 75 mm / 3 d)', rain3Local: 'Extreme rain for this place', coldSpell: 'Cold spell', frostSpell: 'Frost spell', heavySnow: 'Heavy snow', rainOnSnow: 'Rain on snow' };
      for (const [k, lbl] of Object.entries(LBL)) { const e = ev[k]; if (!e || e.p == null) continue; if (k === 'rainOnSnow' && (ctx._screenWatch || []).some((w) => w.hazard === 'Rain on snow')) continue;   /* C9: its own watch row below */ if (e.p >= 10 && (e.p < lineOf(k) || !raised.has(lbl)) && !raised.has(lbl)) push(lbl, `${e.p}% of ensemble members${e.onset ? ', typically from ' + e.onset : ''} — ${e.p < lineOf(k) ? 'below the ' + lineOf(k) + '% action line' : 'at the action line but not raised as an action here (' + (k === 'unusualWarmth' ? 'no glacial terrain in this unit' : 'see the actions rule') + ')'}`, e.p, 'global ensemble forecast, raw member share'); }
    }
    try { const n = app.climatology && app.climatology.droughtNational(); const t = n && n.spi && n.spi[u.unitId]; const c = t && t.spei90 && t.spei90.class; if (c && /(mild|moderate) (dry|drought)/.test(c)) push('Drought (90-day condition)', `observed (computed from the observed index): SPEI-90 ${t.spei90.value} (${c}), SPI-90 ${t.spi90 && t.spi90.value != null ? t.spi90.value : 'not assessed'}`, t.spei90.value, 'global reanalysis to ' + n.asOf); } catch {}
    /* v91.17.172 · audit E-4 · only a soil-water run of at most 9 h is read as now; an older one is withheld and named */
    try { const sn = app.wetness && app.wetness.staleNote ? app.wetness.staleNote() : null; if (sn) ctx.catchmentWetness = sn; } catch {}
    try { const w = app.wetness && (app.wetness.current ? app.wetness.current(u.unitId) : null); /* v91.17.283.52 D · #112: plain words (no "primed"), and only when rain is forecast (wet ground matters for run-off; with 0 mm in 72 h the
       line read as a contradiction next to "dry") */
      const WW = { primed: 'wetter than usual: rain runs off sooner', saturated: 'very wet: little rain soaks in' };
      if (w && w.now && w.rain && Number(w.rain.next72Mm) > 0 && (w.now.state === 'primed' || w.now.state === 'saturated' || /high/.test(w.sensitivity.level))) push('Catchment wetness', `the ground is ${WW[w.now.state] || 'drying'} (root zone at ${Math.round(100 * w.now.ws)}% of its yearly range, room for about ${w.now.awsMm} mm more), with ${w.rain.next72Mm} mm forecast in 72 h — run-off sensitivity ${w.sensitivity.level}`, w.now.ws, '/api/flood/wetness'); } catch {}
    try { const g = app.glof && app.glof.upstream(u.lat, u.lon, { limit: 1 }); const o = g && g.physical && g.physical.outlook; const w = o && (o.windows || []).find(x => x.id === 'short'); if (w && w.members && w.loadedShare >= 0.25) push('GLOF trigger (' + o.lake.name + ')', `${Math.round(100 * w.loadedShare)}% of members loaded in days 1-3 (${w.class}); trigger outlook, not a failure forecast`, w.loadedShare, '/api/glof/outlook'); } catch {}
    const air = airDays(ctx); const mod = air.filter(d => d.pmClass === 2); if (mod.length && !raised.has('Air quality')) push('Air quality', `PM2.5 unhealthy for sensitive groups on ${mod.length} of the next ${air.length} days`, mod.length, 'air-quality forecast (under-reads winter smog in Punjab)');
    for (const w of ctx._outlookWatch || []) out.push(w);   /* v91.17.283 · C10 · outlook rows without verified skill */
    for (const w of ctx._screenWatch || []) out.push(w);   /* v91.17.283.3 · C9 · screening rows that raise no action */
    return out;
  }
  /* v91.17.45 · what the station lake measured about the model at this kind of place (met_corrections.py), printed beside the
     products it concerns. Mountain units only: the lake has no plains gust or rain-day check. */
  function metNotes(u) {
    const M = app.metCorrections ? app.metCorrections() : null; if (!M) return null;
    const elev = u.elevM ?? u.anchorElevM; if (elev == null || elev < 1500) return null;
    const out = [];
    if (M.gust && M.gust.measured) out.push({ product: 'wind', note: `wind gusts are unresolved at the PMD mountain masts: the model over-reads by ${M.gust.ratioObsModel ? Math.round(100 / M.gust.ratioObsModel) / 100 : '?'}× and a 50 km/h day verifies ${Math.round(100 * M.gust.day50.raw.pod)}% of the time (${M.gust.stations} masts); the count of windy days is right, the days are not`, skill: 'gust_mountain_masts' });
    const warmThr = (() => { try { const v = ['MAM', 'JJA', 'SON'].map(k => M.rainday.bySeason[k] && M.rainday.bySeason[k].matchedModelThreshold1mm).filter(x => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : M.rainday.all.matchedModelThreshold1mm; } catch { return null; } })();
    if (M.rainday && M.rainday.measured) out.push({ product: 'rain', note: `a model rain day here is ${warmThr} mm, not 1 mm (warm seasons; winter ${M.rainday.bySeason && M.rainday.bySeason.DJF ? M.rainday.bySeason.DJF.matchedModelThreshold1mm : '?'} mm, partly the gauge under snow): at 1 mm the model gives ${M.rainday.all.rain1.freqBias}× the gauge's rain days (POD ${M.rainday.all.rain1.pod}, FAR ${M.rainday.all.rain1.far}, ${M.rainday.stations} trusted gauges)`, skill: 'rain_day_reliability' });
    if (M.dewpoint && M.dewpoint.measured) out.push({ product: 'humidity', note: `the model dew point is ${Math.abs(M.dewpoint.biasC)} °C too dry at the mountain stations (MAE ${M.dewpoint.maeRawC} °C); wet-bulb and fog terms inherit it`, skill: 'dew_point_mountain' });
    if (M.freezing && M.freezing.measured) out.push({ product: 'freezing level', note: `the freezing level verifies to about ${M.freezing.bySeason && M.freezing.bySeason.MAM ? M.freezing.bySeason.MAM.maeM : M.freezing.maeM} m against the network 0 °C height in the melt season`, skill: 'freezing_level_network' });
    return out.length ? out : null;
  }
  /* v91.17.44 · S7 · the same suggestion library for the AI analyst: a light context (no seasonal fetch) so the
     answer can carry the standing measures and the watch list of the asked unit, each with its why. */
  function suggestions(u) {
    if (!u || u.disputed) return null;
    const o = app.outlook.unit(u.unitId) || {};
    const ctx = { unit: { ...o.unit, lat: u.lat, lon: u.lon }, outlook: { events: o.events }, actions: [] };
    try { const sm = app.smog.unit(u.unitId); if (sm) ctx.air = { days: sm.days, stale: sm.stale, ageH: sm.ageH }; } catch {}
    let standingRows = [], watchRows = [];
    try { standingRows = standing(ctx, u); } catch {}
    try { watchRows = watchList(ctx, u); } catch {}
    return { standing: standingRows, watch: watchRows, note: 'standing = the season and the ground here, not a forecast; watch = below the action thresholds, with the number; the same library the report prints' };
  }
  return { context, placeFor, pointRun, suggestions, metNotes, forecastBasis: customerSkill };
}
