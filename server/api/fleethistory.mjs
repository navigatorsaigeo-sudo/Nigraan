/* ══════════════════════════════════════════════════════════════════════════
   MACH FLEET HISTORY · v91.17.63

   The fleet's Weather Underground record (36 stations, 2023-01 .. 2026-04)
   and the six live sheets (2026-04 ..) paired with the MAch point forecast
   at each station, once its coordinates arrived (24 Sep 2026). Built offline
   by station-lake/scripts/mach_history_pair.py into data/fleet-history-skill.json.

   Tier B. Consumer-grade sensors AGN owns, unshielded, no formal QC beyond
   the physics screen and a 15 C spike screen. It is DIAGNOSTIC: it feeds no
   registry weight (Tier A only) and no grade gate. What it does give is
   (a) the first multi-year check of the served point forecast inside the
   cities, (b) 30 rain gauges the lake did not have in the plains, and
   (c) fleet-minus-airport offsets by season and local hour at 26 urban
   points — the independent check of the urban heat model, which until now
   was calibrated on two station pairs and verified on none.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';

export function createFleetHistory(app, dataDir) {
  let J = null, loadError = null;
  function load() {
    try { J = JSON.parse(fs.readFileSync(path.join(dataDir, 'fleet-history-skill.json'), 'utf8')); loadError = null; }
    catch (e) { J = null; loadError = e.message; }
  }
  load();
  const ready = () => !!J;

  function summary() {
    if (!ready()) return { ready: false, why: loadError || 'data/fleet-history-skill.json missing (station-lake/scripts/mach_history_pair.py)' };
    return { ready: true, built: J.built, tier: J.tier, role: J.role, window: J.window, leads: J.leads, rule: J.rule, cohort: J.cohort,
      city: Object.fromEntries(Object.entries(J.city).map(([k, c]) => [k, { stations: c.stations.length, nightOffsetC: c.nightOffsetC, dayOffsetC: c.dayOffsetC }])),
      stations: J.stations.map(s => ({ key: s.key, wuId: s.wu_id, name: s.name, region: s.region, lat: s.lat, lon: s.lon, elevM: s.elev_m, hours: s.hours, first: s.first, last: s.last,
        temperature: s.temperature.lead0, rain: { days: s.rain.days, ratio: s.rain.ratio ?? null, pod10: s.rain.pod10 ?? null, far10: s.rain.far10 ?? null }, uhi: s.uhi ? { airport: s.uhi.airport, nightOffsetC: s.uhi.nightOffsetC, dayOffsetC: s.uhi.dayOffsetC } : null, trust: s.trust })) };
  }
  function station(key) {
    if (!ready()) return summary();
    const s = J.stations.find(x => x.key === key || x.wu_id === key);
    return s ? { ready: true, station: s } : { ready: true, station: null, why: 'no fleet station ' + key };
  }
  function city(ap) {
    if (!ready()) return summary();
    return J.city[ap] ? { ready: true, airport: ap, ...J.city[ap] } : { ready: true, airport: ap, why: 'no city table for ' + ap, cities: Object.keys(J.city) };
  }

  /* The urban heat model (urbanheat.mjs) predicts a nocturnal maximum dT per
     cell from GHSL geometry, calibrated on two station pairs. The fleet gives
     the observed fleet-minus-airport night offset at every trusted station
     near an airport. The airport is the reference the model itself uses at
     Islamabad (OPIS, open country west of the city) — so the Islamabad
     comparison is like for like. At Karachi the airport sits inside the
     city, so the offsets there are urban-minus-urban and are reported but
     not scored. */
  function uhiCheck(fleetTerm = false) {   /* v91.17.283.5: fleetTerm = the internal read of the fleet urban term (not withheld by C12); the served check (/api/fleet/uhi-check, skill, AI) keeps C12 */
    if (!ready()) return summary();
    if (!app.urbanHeat) return { ready: false, why: 'urban heat model not loaded' };
    const rows = [];
    for (const s of J.stations) {
      if (!s.uhi || !s.trust.temperature) continue;
      const u = app.urbanHeat.estimate(s.lat, s.lon, { hoursFromSunset: 2, fleetTerm });
      const seasons = s.uhi.bySeasonHour || {};
      // observed night maximum: the largest season × hour mean offset over 20..04 local
      let obsMax = null, obsMaxAt = null;
      for (const [se, t] of Object.entries(seasons)) for (const h of [20, 21, 22, 23, 0, 1, 2, 3, 4]) { const v = t.offset[h]; if (v != null && (obsMax == null || v > obsMax)) { obsMax = v; obsMaxAt = se + ' ' + String(h).padStart(2, '0') + 'h'; } }
      rows.push({ key: s.key, name: s.name, airport: s.uhi.airport, airportKm: s.uhi.airportKm, hours: s.uhi.hours, referenceIsRural: s.uhi.airport === 'OPIS',
        observed: { nightOffsetC: s.uhi.nightOffsetC, dayOffsetC: s.uhi.dayOffsetC, nightMaxC: obsMax, nightMaxAt: obsMaxAt },
        model: u && u.urban ? { deltaTmaxC: u.heatIsland ? u.heatIsland.maxC : null, lcz: u.lcz ? u.lcz.class : null, builtFraction: u.cell ? u.cell.builtFraction ?? null : null } : { deltaTmaxC: null, why: u ? (u.why || 'not an urban cell') : 'no estimate' } });
    }
    const scored = rows.filter(r => r.referenceIsRural && r.model.deltaTmaxC != null && r.observed.nightMaxC != null);
    let verdict = null;
    if (scored.length >= 5) {
      const rank = a => { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = new Array(a.length); idx.forEach(([, i], k) => { r[i] = k + 1; }); return r; };
      const ro = rank(scored.map(r => r.observed.nightMaxC)), rm = rank(scored.map(r => r.model.deltaTmaxC)); const n = scored.length;
      const rho = 1 - 6 * ro.reduce((a, v, i) => a + (v - rm[i]) ** 2, 0) / (n * (n * n - 1));
      const resid = scored.map(r => r.model.deltaTmaxC - r.observed.nightMaxC); const mean = resid.reduce((a, v) => a + v, 0) / n;
      const obsMean = scored.reduce((a, r) => a + r.observed.nightMaxC, 0) / n, modMean = scored.reduce((a, r) => a + r.model.deltaTmaxC, 0) / n;
      verdict = { stations: n, spearman: +rho.toFixed(2), meanResidualC: +mean.toFixed(2), observedMeanMaxC: +obsMean.toFixed(2), modelMeanMaxC: +modMean.toFixed(2),
        passed: rho >= 0.3 && Math.abs(mean) <= 1.0,
        reading: rho >= 0.3 ? 'the model ranks the fleet points in the observed order (rho ' + rho.toFixed(2) + ')' : 'the model does not rank the fleet points in the observed order (rho ' + rho.toFixed(2) + '); the two-pair calibration does not carry to the cell scale',
        magnitude: Math.abs(mean) <= 1.0 ? 'magnitude within 1 C of the fleet' : (mean > 0 ? 'the model runs ' + mean.toFixed(1) + ' C warmer than the fleet night maximum' : 'the model runs ' + (-mean).toFixed(1) + ' C cooler than the fleet night maximum') };
    }
    return { ready: true, tier: 'B', rule: 'observed = fleet minus airport METAR, season × local-hour mean, its night maximum (20-04 local); model = urbanheat.mjs nocturnal maximum at the fleet cell; scored only where the airport is the rural reference the model was calibrated against (OPIS); Karachi reported, unscored (airport inside the city)', verdict, stations: rows };
  }


  /* ══ v91.17.64 · THE URBAN TERM ═════════════════════════════════════════════
     What the fleet measured, served. Two tables per city, both season × local hour:
       residual  = forecast − fleet (whole record, median over trusted stations)
       offset    = fleet − airport at airport height (METAR overlap)
     At an urban cell (built surface ≥ 5 %) within reach of a city with ≥ 5 trusted
     stations the served temperature gets
       term = −residual              where no airport correction is on the point
       term = +offset                where the synop/airport correction already is
     (the airport correction removes forecast − airport; what remains at a built-up
     point is airport − fleet = −offset, so adding the offset closes it). The term is
     scaled by the cell's own heat-island potential relative to the fleet cohort's
     median cell (urbanheat.mjs), clamped to [0.5, 1.2]: the fleet fixes the size,
     the morphology only shifts it within that band. Leave-one-station-out on the
     residual table: Islamabad MAE 1.75 → 1.57 °C at a held-out station, 85 % improved;
     Karachi 1.22 → 0.93, 100 %. Cities with fewer than 5 stations serve nothing.
     ═════════════════════════════════════════════════════════════════════════ */
  const SEASON = ['DJF', 'DJF', 'MAM', 'MAM', 'MAM', 'JJA', 'JJA', 'JJA', 'SON', 'SON', 'SON', 'DJF'];
  const MIN_CITY_STATIONS = 5, REACH_KM = 45, SCALE_LO = 0.5, SCALE_HI = 1.2, LOCAL_OFFSET_H = 5, AIRPORT_EXCLUDE_KM = 3;
  const km = (a, b, c, d) => { const p = Math.PI / 180, x = 0.5 - Math.cos((c - a) * p) / 2 + Math.cos(a * p) * Math.cos(c * p) * (1 - Math.cos((d - b) * p)) / 2; return 12742 * Math.asin(Math.sqrt(x)); };
  const cohortMedian = {};   /* airport -> median model maxC over the city's trusted stations */
  function cityMedianMax(ap) {
    if (cohortMedian[ap] !== undefined) return cohortMedian[ap];
    if (!app.urbanHeat) return (cohortMedian[ap] = null);
    const v = [];
    for (const k of J.city[ap].stations) { const s = J.stations.find(x => x.key === k); if (!s) continue; const u = app.urbanHeat.estimate(s.lat, s.lon, { hoursFromSunset: 2, fleetTerm: true }); if (u && u.urban && u.heatIsland && u.heatIsland.maxC > 0) v.push(u.heatIsland.maxC); }
    v.sort((a, b) => a - b); return (cohortMedian[ap] = v.length ? v[Math.floor(v.length / 2)] : null);
  }
  function cityFor(lat, lon) {
    if (!ready() || !J.airports) return null;
    let best = null;
    for (const [ap, c] of Object.entries(J.city)) {
      if (!c.stations || c.stations.length < MIN_CITY_STATIONS || !c.residual || !J.airports[ap]) continue;
      const d = km(lat, lon, J.airports[ap].lat, J.airports[ap].lon); if (d <= REACH_KM && (!best || d < best.km)) best = { airport: ap, km: +d.toFixed(1), c };
    }
    return best;
  }
  const cellCache = new Map();
  let _uv = null, _uvAt = 0;
  function uhiVerdictCached() { if (Date.now() - _uvAt > 3600e3) { _uvAt = Date.now(); try { const c = uhiCheck(true); _uv = c && c.verdict ? c.verdict : null; } catch (_) { _uv = null; } } return _uv; }
  function cellScale(lat, lon, ap) {
    const key = lat.toFixed(3) + ',' + lon.toFixed(3); if (cellCache.has(key)) return cellCache.get(key);
    let out = { urban: false, scale: null, maxC: null, lcz: null };
    if (app.urbanHeat) {
      const u = app.urbanHeat.estimate(lat, lon, { hoursFromSunset: 2, fleetTerm: true });
      /* v91.17.101 · registry urban-heat: the morphology only reshapes the fleet term if the model ranks the fleet points (rho >= 0.3); otherwise every built cell gets the fleet city term as measured */
      const _v = uhiVerdictCached(); const _ranked = !!(_v && _v.spearman >= 0.3);
      if (u && u.urban) { const med = cityMedianMax(ap); const mx = u.heatIsland ? u.heatIsland.maxC : null; const sc = (_ranked && med && mx != null) ? Math.min(SCALE_HI, Math.max(SCALE_LO, mx / med)) : 1; out = { urban: true, scale: +sc.toFixed(2), morphologyScaling: _ranked ? 'on (fleet rank check passed)' : 'off: the heat-island model does not rank the fleet points (rho ' + (_v ? _v.spearman : 'n/a') + ' < 0.3), so the fleet city term is served unscaled', maxC: mx, lcz: u.lcz ? u.lcz.class : null, cohortMedianMaxC: med }; }
    }
    if (cellCache.size > 5000) cellCache.clear(); cellCache.set(key, out); return out;
  }
  /* the term to ADD to the served temperature at (lat, lon) for the UTC instant tMs */
  function urbanTerm(lat, lon, tMs, mosApplied) {
    const c = cityFor(lat, lon); if (!c) return { applied: false, why: 'no fleet city table within ' + REACH_KM + ' km (Islamabad-Rawalpindi and Karachi only)' };
    /* the airport thermometer is the reference of the airport correction and of the grade gate: within 3 km of one the
       served value stays the airport's, so the gate measures what is served there */
    for (const a of Object.values(J.airports)) if (km(lat, lon, a.lat, a.lon) <= AIRPORT_EXCLUDE_KM) return { applied: false, why: 'within ' + AIRPORT_EXCLUDE_KM + ' km of the ' + a.name + ' airport reference: the airport correction stands alone here', city: c.airport };
    const cell = cellScale(lat, lon, c.airport); if (!cell.urban) return { applied: false, why: 'not a built cell (under 5 % built surface): the fleet term is an urban residual', city: c.airport };
    const d = new Date(tMs + LOCAL_OFFSET_H * 3600e3); const season = SEASON[d.getUTCMonth()], lh = d.getUTCHours();
    /* v91.17.160 · audit: served only in the season x part-of-day blocks that passed the leave-one-station-out test, bias included
       (the whole-day pass warmed held-out Karachi nights from 0.0 to +1.1 C); data/fleet-history-skill.json city.<ICAO>.servedBlocks */
    const blk = (lh >= 22 || lh <= 4) ? 'night' : lh <= 9 ? 'morning' : lh <= 16 ? 'day' : 'evening';
    const SB = c.c.servedBlocks; if (SB && !(SB[season] || []).includes(blk)) return { applied: false, why: 'the urban term did not pass the held-out test for ' + season + ' ' + blk + ' hours here', city: c.airport };
    let base = null, source = null;
    if (mosApplied) { const t = c.c.bySeasonHour && c.c.bySeasonHour[season]; base = t ? t.offset[lh] : null; source = 'offset (fleet minus airport)'; }
    else { const t = c.c.residual && c.c.residual[season]; base = t && t.bias[lh] != null ? -t.bias[lh] : null; source = 'residual (fleet minus forecast)'; }
    if (base == null) return { applied: false, why: 'no table value for ' + season + ' ' + lh + 'h', city: c.airport };
    const term = +(base * cell.scale).toFixed(2);
    return { applied: true, termC: term, baseC: +base.toFixed(2), scale: cell.scale, morphologyScaling: cell.morphologyScaling, source, city: c.airport, cityName: J.airports[c.airport].name, airportKm: c.km, stations: c.c.stations.length, season, localHour: lh, lcz: cell.lcz, cellMaxC: cell.maxC, cohortMedianMaxC: cell.cohortMedianMaxC, holdout: c.c.holdout ? { maeRaw: c.c.holdout.maeRaw, maeCorrected: c.c.holdout.maeCorrected, improvedShare: c.c.holdout.improvedShare, passed: c.c.holdout.passed } : null, tier: 'B' };
  }
  function urbanStatus() {
    if (!ready()) return summary();
    return { ready: true, cities: Object.fromEntries(Object.entries(J.city).filter(([, c]) => c.stations.length >= MIN_CITY_STATIONS && c.residual).map(([ap, c]) => [ap, { name: J.airports[ap].name, stations: c.stations.length, nightOffsetC: c.nightOffsetC, dayOffsetC: c.dayOffsetC, holdout: c.holdout ? { maeRaw: c.holdout.maeRaw, maeCorrected: c.holdout.maeCorrected, improvedShare: c.holdout.improvedShare, nightBiasRaw: c.holdout.nightBiasRaw, nightBiasCorrected: c.holdout.nightBiasCorrected, passed: c.holdout.passed } : null, cohortMedianMaxC: cityMedianMax(ap) }])), rule: { minStations: MIN_CITY_STATIONS, reachKm: REACH_KM, airportExcludeKm: AIRPORT_EXCLUDE_KM, scale: [SCALE_LO, SCALE_HI], where: 'built cells only; term = -residual without an airport correction, +offset with one' } };
  }

  return { ready, reload: () => { load(); for (const k in cohortMedian) delete cohortMedian[k]; cellCache.clear(); }, summary, station, city, uhiCheck, urbanTerm, urbanStatus, proxyElevM: (lat, lon) => { const c = cityFor(lat, lon); return c ? J.airports[c.airport].elevM : null; } };
}
