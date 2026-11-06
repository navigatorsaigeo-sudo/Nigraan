/* == v91.17.283.28 · S10 · THE SCENARIO RUN: GET /api/scenario ========================================================================
   The hazard scoring of the place record (placerecord.mjs siteLevels: the area-heat rule, the engine's hzCold and hzWind from
   server/science/modules, hazard-science method d for rain) run on scenario-perturbed inputs, for one place or a list of places:
     GET /api/scenario?lat=&lon=[&preset=][&dT=][&rainMm=&rainDay=][&gustKmh=&gustDay=][&wetPct=]   (wetPct: v283.33 flood outcome ground wetness)
     GET /api/scenario?pts=lat,lon;lat,lon;...   (at most 40 places) with the same scenario parameters
   Presets and the slider bounds come from data/formula-registry.json scenario (presets: the IPCC AR6 global warming levels as a uniform
   delta on the hourly temperature; a rain day at the place's own 2- or 10-year 24-hour level from data/rain-return-levels.json; bounds:
   the physical ranges with their sources). A value outside its bound is refused with the bound and its source, never clipped.
   Perturbation (delta method): every hour of days 0-3 of the place record takes T + dT (feels-like too) with its dew point kept, so the
   relative humidity follows (psychro.mjs rhFromDew), and its UTCI is recomputed (pointstate.mjs hourComfort); the day extremes come from
   the same day core as the place record (pointstate.mjs dayCore: S4 completeness). A rain day sets that day's total for method d; a gust
   sets the strongest hour of that day. The answer per place is { baseline, scenario } in the siteLevels format (levels per hazard and
   day, peak per hazard). EXPOSURE ONLY: no downtime, damage or loss estimate is made. */
import { tehsilLevelsOf } from './served.mjs';   /* v283.35 · the map's tehsil values beside the site baseline */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dayCore, hourComfort } from './pointstate.mjs';
import { rhFromDew } from './psychro.mjs';
import { weatherMC } from './scenariomc.mjs';   /* v91.17.283.34 · Lab A members + Monte Carlo */
import { scenarioStore } from './scenariostore.mjs';
import { checksumOf } from './placerecord.mjs';
import { createHash } from 'node:crypto';
const isN = (x) => typeof x === 'number' && Number.isFinite(x);
const r1 = (x) => (isN(x) ? Math.round(x * 10) / 10 : null);
export const SCENARIO_VERSION = 'scenario-2 (v91.17.283.34)';

export function createScenario(app, { dataDir }) {
  const reg = () => { try { return JSON.parse(readFileSync(join(dataDir, 'formula-registry.json'), 'utf8')).scenario || null; } catch (_) { return null; } };
  const store = scenarioStore(dataDir);
  const val = (x) => (x && typeof x === 'object' && 'value' in x ? x.value : x);
  /* the perturbed copy of a point state: days 0-3 rebuilt from the perturbed hours by the place record's own day core */
  function perturb(ps, lat, lon, sp) {
    /* v91.17.283.34 · Lab A members: sp.dTByDay { date: dT } shifts each day by its own amount (a member's departure + the scenario's dT);
       sp.gustScaleByDay { date: ratio } scales the day's gusts (a member's departure); both absent: unchanged behaviour */
    const dTof = (h) => (sp.dTByDay ? (isN(sp.dTByDay[String(h.time).slice(0, 10)]) ? sp.dTByDay[String(h.time).slice(0, 10)] : null) : sp.dT);
    const hours = (ps.hours || []).map((h) => { let x = { ...h }; const dTh = dTof(h);
      if (sp.gustScaleByDay && isN(h.gustKmh) && isN(sp.gustScaleByDay[String(h.time).slice(0, 10)])) x.gustKmh = r1(h.gustKmh * sp.gustScaleByDay[String(h.time).slice(0, 10)]);
      if (isN(dTh) && isN(h.tempC)) { const T = h.tempC + dTh; const rh = isN(h.dewC) ? Math.round(rhFromDew(T, h.dewC)) : h.rh;
        x = { ...x, tempC: r1(T), feelsC: isN(h.feelsC) ? r1(h.feelsC + dTh) : h.feelsC, rh, ...hourComfort(T, rh, h.windKmh) };
        if (!isN(x.utciShadeC)) { delete x.calmWind; } }
      return x; });
    /* v91.17.283.31 · owner 3.4 · the gust control means "the day's peak gust is X": the strongest hour is set to X and no other hour of the
       day stays above X (until v283.30 only the strongest hour was set, so a lower X left the second-strongest hour as the peak) */
    if (isN(sp.gustKmh) && sp.gustDay) { const day = hours.filter((h) => h.time.slice(0, 10) === sp.gustDay); const top = day.reduce((m, h) => (isN(h.gustKmh) && (!m || h.gustKmh > m.gustKmh) ? h : m), null);
      for (const h of day) if (isN(h.gustKmh) && h.gustKmh > sp.gustKmh) h.gustKmh = sp.gustKmh;
      if (top) top.gustKmh = sp.gustKmh; }
    const byDay = new Map(); for (const h of hours) { const d = h.time.slice(0, 10); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(h); }
    const days = (ps.days || []).filter((d) => d.lead >= 0 && d.lead <= 3).map((d) => { const a = byDay.get(d.date); if (!a) return d; const core = dayCore(a, d.date, lat, lon);
      return { ...d, tmaxC: core.tmaxC, tminC: core.tminC, feelsMaxC: core.feelsMaxC, windMaxKmh: core.windMaxKmh, gustMaxKmh: core.gustMaxKmh, heat: core.heat, cold: core.cold, ...core.whys }; });
    return { ...ps, hours, days };
  }
  async function one(lat, lon, sp, view) {
    let ps = null; try { ps = await app.pointState.state(lat, lon, { noBuild: true }); } catch (e) { ps = { ok: false, why: String(e && e.message || e).slice(0, 120) }; }
    if (!ps || !ps.ok) return { ok: false, lat, lon, why: 'the forecast of this place is not available: ' + ((ps && ps.why) || 'no point state') };
    const uid = ps.area && ps.area.unitId || null, c = { lat, lon, uid, elevM: ps.point && ps.point.elevM, view, ps };
    const baseline = app.placeRecord.siteLevels(c);
    let rainMm = null, rainBasis = null;
    if (sp.rainReturnYears) { let RL = null; try { RL = uid && app.hazSci && app.hazSci.rainLevels ? app.hazSci.rainLevels(uid) : null; } catch (_) { RL = null; }
      const E = RL && RL.ready && RL.durations && RL.durations['24h'], T = RL && RL.returnPeriods, lv = E ? (E.pointRl || E.areaRl) : null, k = Array.isArray(T) ? T.indexOf(sp.rainReturnYears) : -1;
      if (!lv || k < 0 || !isN(lv[k])) return { ok: false, lat, lon, unitId: uid, why: 'not assessed: no ' + sp.rainReturnYears + '-year 24-hour rain level for this place (' + ((RL && RL.why) || 'data/rain-return-levels.json') + ')', baseline };
      rainMm = lv[k]; rainBasis = sp.rainReturnYears + '-year 24-hour level of the tehsil (' + (E.pointRl ? 'point' : 'area') + ' level of the rain return-level table): ' + rainMm + ' mm'; }
    else if (isN(sp.rainMm)) { rainMm = sp.rainMm; rainBasis = 'user rain day: ' + rainMm + ' mm'; }
    const days = (ps.days || []).filter((d) => d.lead >= 0 && d.lead <= 3);
    /* v91.17.283.31 · owner 3.4 · a scenario day outside the forecast days 0-3 is refused (never moved to another day) */
    for (const [k, v] of [['rainDay', sp.rainDay], ['gustDay', sp.gustDay]]) if (v && !days.some((d) => d.date === v))
      return { ok: false, lat, lon, unitId: uid, refused: true, why: 'refused: ' + k + ' ' + String(v).slice(0, 20) + ' is outside the forecast days of this place (' + (days.length ? days[0].date + ' to ' + days[days.length - 1].date : 'none held') + ')', baseline };
    if (isN(sp.gustKmh) && sp.gustDay) { const dd = days.find((d) => d.date === sp.gustDay); if (dd && dd.gustMaxKmh == null) return { ok: false, lat, lon, unitId: uid, refused: true, why: 'refused: the gust of ' + sp.gustDay + ' is not complete (' + (dd.gustMaxWhy || 'not assessed') + '), so its peak cannot be set', baseline }; }
    const rainDay = rainMm != null ? (sp.rainDay || (days.find((d) => d.lead === 0) || {}).date || null) : null;   /* v283.33 · the selected date; today when none is given */
    const gustDay = isN(sp.gustKmh) ? (sp.gustDay || (days.find((d) => d.lead === 0) || {}).date || null) : null;
    /* the temperature bound is checked on the perturbed hours: every hour must stay inside it */
    if (isN(sp.dT)) { const B = sp.bounds && sp.bounds.tempC; const T = (ps.hours || []).map((h) => h.tempC).filter(isN); if (B && T.length && (Math.min(...T) + sp.dT < B[0] || Math.max(...T) + sp.dT > B[1]))
      return { ok: false, lat, lon, unitId: uid, refused: true, why: 'refused: +' + sp.dT + ' °C takes this place’s hours outside ' + B[0] + ' to ' + B[1] + ' °C (' + sp.boundsSource + ')', baseline }; }
    const P = perturb(ps, lat, lon, { ...sp, gustDay });
    const scenario = app.placeRecord.siteLevels({ ...c, ps: P }, rainDay ? { rainMm: { [rainDay]: rainMm } } : {});
    /* v91.17.283.33 · Scenario Lab only: the district chance of local-rain flooding on the scenario day, baseline (the forecast day total) vs
       scenario (the assumed day total); display only, never an alert, never in the live forecast or the map */
    let floodOutcome = null; if (app.floodOutcome) { const fd = rainDay || (days.find((d) => d.lead === 0) || {}).date || null, dd = days.find((d) => d.date === fd) || {};
      try { floodOutcome = app.floodOutcome.answer({ uid, day: fd, baseMm: isN(dd.rainMm) ? dd.rainMm : null, scenMm: rainDay ? rainMm : (isN(dd.rainMm) ? dd.rainMm : null), wetPct: sp.wetPct }); } catch (_) { floodOutcome = null; } }
    /* v91.17.283.34 · Lab A · the members and the Monte Carlo (reproducible: seeded from the inputs) */
    let outcomes = null; if (sp.mc) try { const fd = rainDay || (days.find((d) => d.lead === 0) || {}).date || null, dd = days.find((d) => d.date === fd) || {};
      outcomes = weatherMC({ app, dataDir, districtMc: app.floodOutcome && app.floodOutcome.mc ? app.floodOutcome.mc : null, uid, lat, lon, ps, sp, perturb, rainDay, rainMm, gustDay, floodDay: fd, baseDayMm: isN(dd.rainMm) ? dd.rainMm : null,
        seedObj: { lat, lon, dT: sp.dT, rainMm, rainDay, gustKmh: sp.gustKmh, gustDay, wetPct: sp.wetPct, run: ps.run || ps.issuedAt || null } }); } catch (e) { outcomes = { error: 'the member outcomes could not be computed' }; }
    return { ok: true, lat, lon, unitId: uid, baseline, baselineTehsil: tehsilLevelsOf(app, uid), scenario, outcomes, ...(floodOutcome ? { floodOutcome } : {}), applied: { ...(isN(sp.dT) ? { dT: sp.dT } : {}), ...(rainDay ? { rainDay, rainMm, rainBasis } : {}), ...(gustDay ? { gustDay, gustKmh: sp.gustKmh } : {}), ...(isN(sp.wetPct) ? { wetPct: sp.wetPct } : {}) } };
  }
  async function run(q, view = 'customer') {
    const R = reg(); if (!R) return { status: 503, body: { ok: false, why: 'the scenario register (data/formula-registry.json scenario) is not in this install' } };
    const presets = val(R.presets) || {}, bounds = val(R.bounds) || {}, bsrc = (R.bounds && R.bounds.source) || '';
    const preset = q.preset ? String(q.preset) : null; if (preset && !presets[preset]) return { status: 400, body: { ok: false, why: 'unknown preset ' + preset + ': one of ' + Object.keys(presets).join(', ') } };
    const P = preset ? presets[preset] : {};
    const num = (k) => (q[k] == null || q[k] === '' ? null : Number(q[k]));
    const sp = { dT: isN(P.dT) ? P.dT : num('dT'), rainReturnYears: P.rainReturnYears || null, rainMm: num('rainMm'), rainDay: q.rainDay || null, gustKmh: num('gustKmh'), gustDay: q.gustDay || null, wetPct: num('wetPct'), bounds, boundsSource: bsrc };
    if (sp.wetPct != null && (!isN(sp.wetPct) || sp.wetPct < 0 || sp.wetPct > 100)) return { status: 400, body: { ok: false, why: 'wetPct (the ground wetness percentile) must be 0 to 100' } };
    for (const k of ['rainDay', 'gustDay']) if (sp[k] != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(sp[k]))) return { status: 400, body: { ok: false, why: k + ' must be a date YYYY-MM-DD inside the forecast days 0-3' } };
    for (const [k, b] of [['rainMm', 'rainMmDay'], ['gustKmh', 'gustKmh']]) { const v = sp[k]; if (v == null) continue; const B = bounds[b];
      if (!isN(v) || (B && (v < B[0] || v > B[1]))) return { status: 400, body: { ok: false, why: k + ' ' + q[k] + ' is outside its physical range ' + (B ? B[0] + ' to ' + B[1] : '') + ' (' + bsrc + ')' } }; }
    if (sp.dT != null && !isN(sp.dT)) return { status: 400, body: { ok: false, why: 'dT must be a number (degrees C)' } };
    let pts = []; if (q.pts) pts = String(q.pts).split(';').map((x) => x.split(',').map(Number)).filter((a) => a.length === 2 && a.every(isN)).map(([la, lo]) => ({ lat: la, lon: lo }));
    else if (q.lat != null && q.lon != null) pts = [{ lat: Number(q.lat), lon: Number(q.lon) }];
    if (!pts.length || pts.some((p) => !isN(p.lat) || !isN(p.lon))) return { status: 400, body: { ok: false, why: 'lat and lon, or pts=lat,lon;lat,lon, required' } };
    if (pts.length > 40) return { status: 400, body: { ok: false, why: 'at most 40 places in one scenario run' } };
    sp.mc = pts.length === 1;   /* v91.17.283.34 · the members and the Monte Carlo for one place at a time (a list of sites: levels only) */
    const places = []; for (const p of pts) places.push(await one(Math.round(p.lat * 1e5) / 1e5, Math.round(p.lon * 1e5) / 1e5, sp, view));
    const body = { ok: true, version: SCENARIO_VERSION, lab: 'weather', at: new Date().toISOString(), preset: preset || null, presetLabel: P.label || null,
      scenario: { dT: sp.dT, rainReturnYears: sp.rainReturnYears, rainMm: sp.rainMm, rainDay: sp.rainDay, gustKmh: sp.gustKmh, gustDay: sp.gustDay, wetPct: sp.wetPct },
      presets: Object.fromEntries(Object.entries(presets).map(([k, v]) => [k, v.label || k])), bounds, boundsSource: bsrc, presetSource: (R.presets && R.presets.source) || null,
      exposureOnly: 'levels per hazard only: no downtime, damage or loss estimate', places };
    /* v91.17.283.34 · the answer is kept by its id: the compare and the report read this same result (scenariostore.mjs) */
    body.values = weatherValues(body); body.checksum = checksumOf(body.values);
    body.id = 'wx' + createHash('sha256').update(JSON.stringify({ q: body.scenario, preset: body.preset, pts: pts, v: body.values })).digest('hex').slice(0, 24);
    if (view === 'customer' || view === 'operator') store.keep(body);
    return { status: 200, body };
  }
  return { run, get: (id) => store.get(id) };
}
/* the values a screen shows and a report prints, by path (the checksum binding: placerecord.mjs checksumOf / compareShown) */
export function weatherValues(b) { const v = {};
  (b.places || []).forEach((P, i) => { if (!P || !P.ok) return;
    for (const hz of ['heat', 'cold', 'wind', 'rain']) { const S = P.scenario && P.scenario.hazards && P.scenario.hazards[hz]; if (!S) continue;
      (S.days || []).forEach((d) => { v['p' + i + '.' + hz + '.' + d.lead + '.level'] = d.assessed ? d.level : null; }); }
    const O = P.outcomes; if (O && O.days) O.days.forEach((d) => { for (const hz of ['heat', 'cold', 'wind']) { const x = d[hz]; if (x && x.assessed) { v['p' + i + '.mc.' + hz + '.' + d.lead + '.level'] = x.level; if (Array.isArray(x.range)) v['p' + i + '.mc.' + hz + '.' + d.lead + '.range'] = x.range.join('-'); } } });   /* v91.17.283.54 · an assessed member outcome can carry no range (one member): .join on null answered 500 for the whole scenario */
    if (O && O.flood && O.flood.modelled) { v['p' + i + '.mc.flood.p'] = O.flood.p; if (Array.isArray(O.flood.range90)) v['p' + i + '.mc.flood.range90'] = O.flood.range90.join('-'); } });
  return v; }
