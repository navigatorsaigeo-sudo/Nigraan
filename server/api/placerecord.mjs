/* == v91.17.283.28 · S5 / S6 · THE PLACE RECORD AND THE SITE LEVELS (parts of the place bundle, GET /api/point) =======================
   placeRecord   ONE home for the values several sections of a page (and the report, Customize, the scenario baseline) show for a place:
                 day maximum / minimum / feels-like maximum per day (the point state, S4 completeness), rain and snow day totals (S2 rule),
                 the heat level in level words with the UTCI category beside it, ONE accuracy figure (the verification ledger, accuracy.mjs),
                 the station counts (fleet.counts, one function), the rain return levels (data/rain-return-levels.json), the river status
                 (served.mjs riverStatus, one rule) and the seismic code class (BCP 2021 design category, BCP 2007 zone). Pages compute none
                 of these: they print these fields.
   siteLevels    every hazard scored at the site's OWN coordinate and terrain height, by the code that scores the tehsils on the map:
                   heat       utcilevel.mjs heatCellOf (the area-heat rule) on the day's highest shade UTCI of the point state
                   cold       the engine's hzCold (enginefns.mjs: server/science/modules) on the day's lowest shade UTCI of the point state
                   wind       the engine's hzWind on the day's strongest gust (and wind) of the point state, at the site's height
                   rain       hazard science method d (hazsci.mjs rainAt -> detCell) at the site's coordinate, where it is defined (plains,
                              lead days 1-3); elsewhere not assessed with the reason
                   flood      the river status of the tehsil's gauged reach (served.mjs riverStatus; a reach, not a point: labelled)
                   landslide  not assessed at a point (its likelihood inputs are tehsil values); the tehsil's level beside it, labelled
                   drought    the tehsil value (SPI-3 is an area index), labelled as such
                 per hazard: days [{ date, lead, level, word, score?, basis }] or { notAssessed, why }, and the peak. */
import { heatCellOf, coldCellOf, levelWord, UTCI_CATEGORY_LABEL } from './utcilevel.mjs';
import { levelOfScreeningScore } from './scalecuts.mjs';
import { engineFns } from './enginefns.mjs';
import { placeAccuracy } from './accuracy.mjs';
import { servedUnit, riverStatus, levelLabelOf, tehsilLevelsOf } from './served.mjs';
import { shownRainMm } from './rainamount.mjs';
import { DI_SOURCE, comfortDays, COMFORT_NAME, COMFORT_NOTE } from './comfort.mjs';   /* v283.31 · 2.3; v283.35 one function */
import { checkHours } from './completeness.mjs';
const WIND_LADDER_WITHHELD_WHY = 'not tested: the wind level ladder (gust breakpoints) has no tested basis; the gust is shown in km/h (members p10 / p50 / p90) and against any limit you registered';   /* = hazsci.mjs (v283.36 item 17) */
import { rainClassMm } from './rainprob.mjs';   /* v283.33 · a scenario's assumed rain amount: its rain class */   /* v283.31 · science lane: the mountain rain amount */
export const PLACE_RECORD_VERSION = 'place-record-1 (v91.17.283.28)';
/* v91.17.283.31 · owner 3.3 · ONE CHECKED RECORD: the record's shown values flat (path -> value) and their checksum. A report is issued
   only when what the page shows matches them (reports.mjs: record.shown { path: value } and / or record.recordChecksum); a mismatch (an
   edited number) is refused. Paths: days.<i>.<field> and heat.days.<i>.level. */
const SHOWN_DAY = ['date', 'tmaxC', 'tminC', 'feelsMaxC', 'rainMm', 'snowCm'];
export function recordValues(r) { const v = {}; if (!r) return v;
  (r.days || []).forEach((d, i) => { for (const k of SHOWN_DAY) v['days.' + i + '.' + k] = d[k] ?? null; });
  ((r.heat && r.heat.days) || []).forEach((d, i) => { v['heat.days.' + i + '.level'] = d.assessed ? d.level : null; });
  return v; }
export function checksumOf(values) { let h = 2166136261 >>> 0; const s = JSON.stringify(Object.keys(values).sort().map((k) => [k, values[k]]));
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return 'pr1-' + h.toString(16).padStart(8, '0'); }
export function compareShown(record, shown, sum) {
  const V = record && record.values ? record.values : recordValues(record), bad = [];
  if (sum != null && String(sum) !== (record.checksum || checksumOf(V))) bad.push({ path: 'recordChecksum', shown: String(sum).slice(0, 40), record: record.checksum || checksumOf(V) });
  if (shown && typeof shown === 'object') for (const [k, x] of Object.entries(shown)) { if (!(k in V)) { bad.push({ path: k.slice(0, 80), shown: x, record: 'no such value in the record' }); continue; }
    const y = V[k]; const same = (x == null && y == null) || (typeof y === 'number' ? Number(x) === y || (Number.isFinite(Number(x)) && Math.abs(Number(x) - y) < 0.051) : String(x) === String(y));
    if (!same) bad.push({ path: k, shown: x, record: y }); }
  return { match: !bad.length, mismatches: bad.slice(0, 20), checked: (shown ? Object.keys(shown).length : 0) + (sum != null ? 1 : 0) };
}
const isN = (x) => typeof x === 'number' && Number.isFinite(x);
const LEADS = [0, 1, 2, 3];

export function createPlaceRecord(app, { dataDir }) {
  const unitOf = (uid, view) => { if (!uid) return null; try { const S = servedUnit(app, uid, view === 'operator'); return S && S.ready ? S : null; } catch (_) { return null; } };
  const tehsilLayer = (S, layer, day) => { const d = S && (S.days || []).find((x) => x.day === day); return d && d.layers ? d.layers[layer] || null : null; };

  function seismicOf(lat, lon) {
    let r = null; try { r = app.seismic ? app.seismic.point(lat, lon, null, null) : null; } catch (_) { r = null; }
    if (!r || !r.ok) return { assessed: false, why: 'not assessed: ' + ((r && r.why) || 'the seismic code maps are not loaded') };
    const b21 = r.bcp2021, b07 = r.bcp2007;
    return { assessed: !!(b21 || b07), kind: 'building-code class (a code look-up, not a forecast level)',
      bcp2021: b21 ? { label: 'BCP 2021 seismic design category', codeClass: b21.seismic_design_category || null, ssBand: b21.ssBand || null, s1Band: b21.s1Band || null, ssG: b21.ss_g ?? null, s1G: b21.s1_g ?? null,
        siteClass: b21.siteClass || null, siteClassAssumed: !!b21.siteClassAssumed, riskCategory: b21.riskCategory || null, riskCategoryAssumed: !!b21.riskCategoryAssumed, source: b21.source } : { why: 'not assessed: data/seismic-bcp2021.json is not loaded' },
      bcp2007: b07 ? { label: 'BCP 2007 seismic zone (legacy)', codeClass: b07.zone, pga: b07.pga ?? null, source: b07.source } : { why: 'not assessed: the BCP 2007 zone table (data/seismic-bcp2007.json) is not in this install' },
      screening: r.screening };
  }
  function daysOf(ps) {
    const zone = ps.point && ps.point.zone || null;
    /* v283.31 · the mountain mapping is applied once, in the point state's day (pointstate.mjs): carried here, never applied twice */
    return (ps.days || []).map((d) => { const R = isN(d.rainMm) ? (d.rainMapping ? { mm: d.rainMm, rawMm: d.rainMmRaw, mapping: d.rainMapping, mappingWhy: d.rainMappingWhy } : shownRainMm(dataDir, d.rainMm, { zone, lead: d.lead, month: Number(String(d.date).slice(5, 7)) })) : null;
      return { date: d.date, lead: d.lead, tmaxC: d.tmaxC ?? null, tminC: d.tminC ?? null, feelsMaxC: d.feelsMaxC ?? null,
      ...(d.tmaxWhy ? { tmaxWhy: d.tmaxWhy } : {}), ...(d.tminWhy ? { tminWhy: d.tminWhy } : {}), ...(d.feelsMaxWhy ? { feelsMaxWhy: d.feelsMaxWhy } : {}),
      rainMm: R ? R.mm : (d.rainMm ?? null), ...(R && R.rawMm != null ? { rainMmRaw: R.rawMm } : {}), ...(R ? { rainMapping: R.mapping, rainMappingWhy: R.mappingWhy } : {}), ...(d.rainWhy ? { rainWhy: d.rainWhy } : {}), snowCm: d.snowCm ?? null, ...(d.snowWhy ? { snowWhy: d.snowWhy } : {}),
      sunrise: d.sun ? d.sun.sunrise : null, sunset: d.sun ? d.sun.sunset : null }; });
  }
  /* v91.17.283.31 · owner 2.3 · the day's highest Thom discomfort index (comfort.mjs) from its 24 hours (completeness.mjs), Giles classes */
  /* v91.17.283.35 · item 5 · the comfort of the site from the one function (comfort.mjs comfortDays); the tehsil value rides beside it (tehsilLevels) */
  function comfortOf(ps) { return { name: COMFORT_NAME, note: COMFORT_NOTE, index: DI_SOURCE, unit: 'deg C (discomfort index)', days: comfortDays(ps, 3) }; }
  function heatOf(ps) {
    const now = ps.now && isN(ps.now.utciShadeC) ? (() => { const h = heatCellOf(ps.now.utciShadeC); return { assessed: true, level: h.word, utciC: ps.now.utciShadeC, utciCategory: { name: h.utciCategory, label: UTCI_CATEGORY_LABEL } }; })()
      : { assessed: false, why: (ps.now && ps.now.utciWhy) || 'not assessed: no UTCI for this hour' };
    const days = (ps.days || []).map((d) => d.heat && d.heat.assessed ? (() => { const h = heatCellOf(d.heat.utciMaxC); return { date: d.date, lead: d.lead, assessed: true, level: h.word, utciMaxC: d.heat.utciMaxC, utciCategory: { name: h.utciCategory, label: UTCI_CATEGORY_LABEL } }; })()
      : { date: d.date, lead: d.lead, assessed: false, why: (d.heat && d.heat.why) || 'not assessed' });
    return { scale: 'level words: Normal / Low / Moderate / High / Severe (the one customer scale); the UTCI category is served beside it, labelled', now, days };
  }
  function record(c) {
    const ps = c.ps; if (!ps || !ps.ok) return { ok: false, why: 'the point state is not available' };
    const zone = ps.point && ps.point.zone || null;
    let stations = null; try { stations = app.fleet && app.fleet.counts ? app.fleet.counts({ lat: c.lat, lon: c.lon }) : null; } catch (_) { stations = null; }
    let rainReturn = null; try { rainReturn = app.hazSci && app.hazSci.rainLevels ? (c.uid ? app.hazSci.rainLevels(c.uid) : { ready: false, why: 'the point lies in no tehsil' }) : { ready: false, why: 'the hazard science is not running' }; } catch (_) { rainReturn = { ready: false, why: 'the rain return levels could not be read' }; }
    const S = unitOf(c.uid, c.view);
    const out = { ok: true, version: PLACE_RECORD_VERSION, at: ps.issuedAt || null, run: ps.run || null, point: { lat: c.lat, lon: c.lon, elevM: ps.point ? ps.point.elevM : null, zone, unitId: c.uid || null },
      days: daysOf(ps), heat: heatOf(ps), accuracy: placeAccuracy(dataDir, zone),
      stations: stations || { ok: false, why: 'the station network is not running on this server' },
      rainReturn: rainReturn && rainReturn.ready ? { ready: true, unit: rainReturn.unit, zone: rainReturn.zone, returnPeriods: rainReturn.returnPeriods, durations: rainReturn.durations, source: rainReturn.source, file: 'data/rain-return-levels.json' } : { ready: false, why: 'not assessed: ' + ((rainReturn && rainReturn.why) || 'no rain return levels') },
      river: riverStatus(app, c.uid), seismic: seismicOf(c.lat, c.lon), comfort: comfortOf(ps),
      tehsilLevels: tehsilLevelsOf(app, c.uid),   /* v91.17.283.35 · the map's tehsil values, beside the site's own */
      outlookTiers: (() => { try { return app.outlook && app.outlook.tiers ? (c.uid ? app.outlook.tiers(c.uid) : { ready: false, why: 'the point lies in no tehsil' }) : { ready: false, why: 'the outlook is not running' }; } catch (_) { return { ready: false, why: 'the outlook tiers could not be read' }; } })(),   /* v91.17.283.33 · Part 2 */
      levelsLoaded: !!S, ...(S ? {} : { levelsWhy: 'the issued levels of this tehsil are not loaded' }) };
    /* v91.17.283.31 · owner 3.1 · a failed model check (the model gate could not be read: every level fail-closed) makes the record
       incomplete: no level is served and no report is issued from it */
    const gateFailed = !!(S && S.gateUnavailable);
    out.complete = !!(out.levelsLoaded && out.days.length && !gateFailed);
    if (gateFailed) { out.modelCheck = { passed: false, why: S.why || 'the model gate could not be read' }; }
    if (!out.complete) out.incompleteWhy = gateFailed ? 'a model check failed: ' + (S.why || 'the model gate could not be read') + '; no level is served' : !out.levelsLoaded ? out.levelsWhy : 'the point state holds no day';
    out.values = recordValues(out); out.checksum = checksumOf(out.values);
    return out;
  }
  /* ---- the site levels ---- */
  function peakOf(days) { let p = null; for (const d of days) if (d.assessed && isN(d.level) && (!p || d.level > p.level)) p = { date: d.date, lead: d.lead, level: d.level, word: d.word, ...(d.levelLabel ? { levelLabel: d.levelLabel } : {}) }; return p; }
  /* o.rainMm: { date: mm } a scenario's day totals for the rain hazard (scenario.mjs); c.ps may be a scenario's perturbed copy */
  function siteLevels(c, o = {}) {
    const ps = c.ps; if (!ps || !ps.ok) return { ok: false, why: 'the point state is not available' };
    const E = engineFns(dataDir), S = unitOf(c.uid, c.view), byLead = new Map((ps.days || []).map((d) => [d.lead, d]));
    const elevM = ps.point ? ps.point.elevM : null;
    const each = (fn) => LEADS.map((L) => { const d = byLead.get(L); if (!d) return { lead: L, date: null, assessed: false, why: 'not assessed: the point state holds no day ' + L };
      try { return { date: d.date, lead: L, ...fn(d, L) }; } catch (e) { return { date: d.date, lead: L, assessed: false, why: 'not assessed: ' + String(e && e.message || e).slice(0, 120) }; } });
    const lv = (score) => { const L = levelOfScreeningScore(score); return isN(L) ? { assessed: true, level: L, word: levelWord(L), score } : { assessed: false, why: 'not assessed: the score is outside the scale' }; };
    const H = {};
    H.heat = { method: 'the UTCI heat stress levels (Low 26 to 32 moderate heat stress, Moderate 32 to 38, High 38 to 46, Severe 46 °C or more) on the day’s highest shade UTCI at the site', days: each((d) => {
      if (!d.heat || !d.heat.assessed) return { assessed: false, why: (d.heat && d.heat.why) || 'not assessed' };
      const h = heatCellOf(d.heat.utciMaxC); return { ...(isN(h.level) ? { assessed: true, level: h.level, word: h.word, score: h.score, ...(h.condition ? { condition: h.condition } : {}) } : { assessed: false, why: 'not assessed: heat could not be scored' }), basis: 'highest shade UTCI ' + d.heat.utciMaxC + ' °C at ' + d.heat.at + ' (' + UTCI_CATEGORY_LABEL + ': ' + h.utciCategory + ')' }; }) };
    /* v91.17.283.31 · owner 2.1 · the cold level from the register's UTCI cold levels (utcilevel.mjs coldCellOf, no gap) */
    H.cold = { method: 'the UTCI cold levels of the thresholds register (utci.coldLevels: Low 0 to -13, Moderate -13 to -27, High -27 to -40, Severe below -40 C) on the day’s lowest shade UTCI at the site', days: each((d) => {
      if (!d.cold || !d.cold.assessed) return { assessed: false, why: (d.cold && d.cold.why) || 'not assessed' };
      const c = coldCellOf(d.cold.utciMinC); return isN(c.level) ? { assessed: true, level: c.level, word: c.word, ...(c.condition ? { condition: c.condition } : {}), basis: 'lowest shade UTCI ' + d.cold.utciMinC + ' °C at ' + d.cold.at + ' (' + UTCI_CATEGORY_LABEL + ': ' + (c.utciCategory || '') + ')' } : { assessed: false, why: 'not assessed: cold could not be scored' }; }) };
    /* v283.36 · launch item 17 · no wind level: the strongest gust in km/h is the value; no gust from the sustained wind ("gust not forecast") */
    H.wind = { method: 'no wind level in this release (the gust ladder is untested): the day’s strongest gust at the site, km/h', days: each((d) => {
      if (d.gustMaxKmh == null) return { assessed: false, state: 'not_tested', why: 'gust not forecast' + (d.windMaxKmh != null ? ' (sustained wind ' + d.windMaxKmh + ' km/h)' : ''), valueKmh: null };
      return { assessed: false, state: 'not_tested', why: WIND_LADDER_WITHHELD_WHY, valueKmh: d.gustMaxKmh, basis: 'strongest gust ' + d.gustMaxKmh + ' km/h' };
      /* eslint-disable-next-line no-unreachable */
      const r = E.wind({ gust: d.gustMaxKmh, wind: d.gustMaxKmh == null ? d.windMaxKmh : null, elev: elevM }, {});
      return r && isN(r.score) ? { ...lv(r.score), basis: 'strongest gust ' + (d.gustMaxKmh ?? '-') + ' km/h' + (r.gustBasis === 'sustained-wind-fallback' ? ' (from the sustained wind: no gust held)' : '') } : { assessed: false, why: 'not assessed: ' + ((r && r.reason) || (r && r.gustBasis) || 'wind could not be scored') }; }) };
    H.rain = { method: 'hazard science method d (the tested chance of the station day total from the IFS 00 UTC day total) at the site’s coordinate', days: each((d, L) => {
      if (!app.hazSci || !app.hazSci.rainAt) return { assessed: false, why: 'not assessed: the hazard science is not running' };
      const mm = o.rainMm && isN(o.rainMm[d.date]) ? o.rainMm[d.date] : null;
      /* v91.17.283.33 · a hypothetical rain amount is certain by assumption: its level is the rain class of the amount (data/hazard-scale.json
         rainClasses24h, the 24-hour classes' one home), not the tested chance of method d (a probability model of a forecast) */
      if (mm != null) { const C = rainClassMm(); if (!C || !C.length) return { assessed: false, why: 'not assessed: the 24-hour rain classes are not loaded' };
        let L = 0; C.forEach((m, i) => { if (mm >= m) L = i + 1; });
        const names = ['light or none', 'moderate', 'heavy', 'very heavy', 'extremely heavy'];
        return { assessed: true, level: L, word: levelWord(L), assumed: true, levelLabel: 'rain class of the assumed amount', basis: 'rain class of the assumed amount: ' + mm + ' mm in the day is ' + (names[L] || '') + ' rain (24-hour rain classes ' + C.join(' / ') + ' mm)' }; }
      const r = app.hazSci.rainAt(c.lat, c.lon, elevM, d.date, L, mm != null ? { mm } : {}); if (!r || !r.cell) return { assessed: false, ...(r && r.notTested ? { state: 'not_tested' } : {}), why: (r && r.notTested ? '' : 'not assessed: ') + ((r && r.why) || 'no method at this point') };
      const lb = levelLabelOf('rain_hz', r.cell.L, r.cell.facts); return { assessed: true, level: r.cell.L, word: levelWord(r.cell.L), ...(lb ? { levelLabel: lb } : {}), basis: r.cell.facts.text, ...(r.cell.facts.lowSkill ? { lowSkill: true, skill: r.cell.facts.skill64 || r.cell.facts.skill } : r.cell.facts.skill ? { skill: r.cell.facts.skill } : {}), ...(r.cell.facts.fromPreviousRun ? { fromPreviousRun: true } : {}) }; }) };
    const RS = riverStatus(app, c.uid);
    H.flood = { method: 'river status of the tehsil’s gauged reach: a reach value, not a point value', scope: 'tehsil gauged reach',
      days: LEADS.map((L) => { const d = byLead.get(L), x = RS.days ? RS.days.find((y) => y.day === L) : null; const date = d ? d.date : x ? x.date : null;
        if (!RS.assessed && !x) return { date, lead: L, assessed: false, why: RS.why };
        return x && x.assessed ? { date, lead: L, assessed: true, level: x.level, word: x.word, basis: x.rarity || 'river-flooding level of the tehsil' } : { date, lead: L, assessed: false, why: (x && x.why) || RS.why || 'not assessed' }; }) };
    const tehsil = (layer, L) => { const v = tehsilLayer(S, layer, L); return v ? (v.assessed ? { level: v.level, word: v.word } : { level: null, word: 'Not assessed', why: v.notAssessedWhy || null }) : null; };
    H.landslide = { method: 'not scored at a point: the landslide likelihood is computed from tehsil inputs (its rain, slope mask and antecedent wetness are tehsil values)', scope: 'tehsil',
      days: LEADS.map((L) => { const d = byLead.get(L); return { date: d ? d.date : null, lead: L, assessed: false, why: 'not assessed at the site: no point method (its inputs are tehsil values)', tehsilValue: tehsil('landslide', L) }; }) };
    const dr = tehsil('drought', 0);
    H.drought = { method: 'the tehsil value (SPI-3 is an area index of the last complete month), labelled as such', scope: 'tehsil value',
      days: LEADS.map((L) => { const d = byLead.get(L); return dr && isN(dr.level) ? { date: d ? d.date : null, lead: L, assessed: true, level: dr.level, word: dr.word, basis: 'tehsil value (SPI-3)', tehsilValue: true } : { date: d ? d.date : null, lead: L, assessed: false, why: (dr && dr.why) || 'not assessed: the tehsil’s drought index is not loaded', tehsilValue: true }; }) };
    for (const k of Object.keys(H)) H[k].peak = peakOf(H[k].days);
    return { ok: true, version: PLACE_RECORD_VERSION, at: ps.issuedAt || null, point: { lat: c.lat, lon: c.lon, elevM, zone: ps.point ? ps.point.zone : null },
      scale: ['Normal', 'Low', 'Moderate', 'High', 'Severe'], hazards: H, engine: E.ok ? E.source : { why: E.why } };
  }
  return { record, siteLevels };
}
