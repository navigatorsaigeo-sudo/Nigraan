/* == v91.17.283.37 · NIGRAAN 1.0.1 · THE HAZARD COUNT OF A POINT (start page national view, owner-approved design 30 Oct 2026) ==========
   ONE function turns the place record's site levels (placerecord.mjs siteLevels: every hazard scored at the point's own coordinate and
   height, the server's point science) into, for each day (lead 0-3):
     bars    one entry per hazard: its level word for that day, or "Not tested" / "Not assessed" (never Normal for a hazard without a level)
     count   the number of COUNTED hazards at Moderate or above at that point that day; null when no counted hazard was assessed there
             (the map leaves such a point uncoloured: never 0)
   The national hazard surface (hazardgrid.mjs) and the place bundle (GET /api/point part hazardCount: the bottom panel and the place
   panel) both call countOf on the same site levels, so a grid point's count is the place record's count at that exact point.

   WHICH HAZARDS ARE COUNTED (no new threshold: only the existing tested levels are read):
     heat, cold   counted when the model gate holds their layer as operational (UTCI assessment scale, a published standard, at the point);
                  the gate unreadable -> not counted (fail closed)
     heavy rain   counted on a day where the point's tested method gives a level (hazsci rainAt: the tested cells only; a cell that is not
                  tested answers not tested and is not counted)
   Not counted, and listed as not counted:
     river flood  a river reach value (the tehsil's gauged reach), not a point level
     drought      an area index (SPI-3 of the tehsil), not a point level
     landslide    no point method (its inputs are tehsil values)
     wind         the gust ladder is not tested
     air quality  the air levels are not tested */
export const HAZARD_COUNT_VERSION = 'hazard-count-1 (v91.17.283.37)';
import { STATE_WORD, codeOfState, STATE_CODES } from './states.mjs';
import { AIR_RAISES_FROM, AQI_SOURCE } from './placesummary.mjs';   /* v283.49 · 1.0.10 item 1 */
const isN = (x) => typeof x === 'number' && Number.isFinite(x);
const MODERATE = 2;   /* the scale's own index of "Moderate" (Normal 0, Low 1, Moderate 2, High 3, Severe 4) */
export const HAZARDS = [
  { key: 'heat', name: 'Heat', src: 'heat', gateLayer: 'heat' },
  { key: 'cold', name: 'Cold', src: 'cold', gateLayer: 'cold' },
  { key: 'rain', name: 'Heavy rain', src: 'rain', tested: 'perDay' },
  { key: 'flood', name: 'River flood', src: 'flood', notCounted: 'a river reach value, not a point level' },
  { key: 'landslide', name: 'Landslide', src: 'landslide', notCounted: 'not assessed at a point' },
  { key: 'wind', name: 'Wind', src: 'wind', notCounted: 'not tested' },
  { key: 'drought', name: 'Drought', src: 'drought', notCounted: 'an area value, not a point level' },
  { key: 'glof', name: 'Glacial lake flood', src: 'glof', notCounted: 'an area value, not a point level' },
  { key: 'air', name: 'Air quality', src: null, notCounted: 'a served air-quality class, not a tested hazard level: it raises the place summary, never the count' }];
const WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];

/* the counting rule of this server now (the gate decides heat and cold) */
export function countRule(gate) {
  const ok = (layer) => { try { const t = gate && gate.tagOf ? gate.tagOf(layer) : null; return !!(t && t.status === 'operational'); } catch (_) { return false; } };
  const counted = [], notCounted = [];
  for (const h of HAZARDS) {
    if (h.notCounted) { notCounted.push({ key: h.key, name: h.name, why: h.notCounted }); continue; }
    if (h.gateLayer && !ok(h.gateLayer)) { notCounted.push({ key: h.key, name: h.name, why: 'not tested' }); continue; }
    counted.push({ key: h.key, name: h.name, ...(h.tested === 'perDay' ? { where: 'where its tested method gives a level' } : {}) });
  }
  /* the scale of the count: 0 to the number of counted hazards (all of them at Moderate or above = the top of the colour ramp) */
  return { version: HAZARD_COUNT_VERSION, counted, notCounted, threshold: 'Moderate or above', scaleMax: counted.length };
}

/* one hazard's bar on one day: a level, or a state code (-1 to -6, states.mjs) and its one client word */
const noLevel = (h, code, extra = {}) => ({ key: h.key, name: h.name, state: STATE_CODES[String(code)], code, word: STATE_WORD[String(code)], level: null, counted: false, ...extra });
function barOf(h, H, lead, counted) {
  if (!h.src && !(H && H.__air)) return noLevel(h, -5);   /* no air answer handed in (the national surface): as before, not tested */
  if (!h.src) { const a = H.__air.find((x) => x.lead === lead);   /* v283.49 item 1: the served air-quality class of the day (a value, never counted) */
    if (a && isN(a.i)) return { key: h.key, name: h.name, state: 'value', code: null, word: a.category, level: null, counted: false, aqiIndex: a.i, raisesSummary: a.i >= AIR_RAISES_FROM, ...(a.pm25 != null ? { pm25: a.pm25 } : {}), basis: 'served air-quality forecast (US EPA AQI class)' };
    return noLevel(h, -1, { why: a && a.why ? a.why : 'no served air-quality value for this day' }); }
  const x = H && H[h.src]; const d = x && Array.isArray(x.days) ? x.days.find((y) => y.lead === lead) : null;
  if (!d) return noLevel(h, -1);
  if (d.assessed && isN(d.level) && d.level >= 0 && d.level <= 4) {
    const area = !!(x.scope);   /* a reach or area value (river flood, drought) */
    return { key: h.key, name: h.name, state: 'level', level: d.level, word: WORDS[d.level], ...(d.label || d.levelLabel ? { label: d.levelLabel } : {}), counted: !!counted && !area, ...(area ? { area: true } : {}) };
  }
  /* no point method (landslide): the area's own value or state, labelled as the area's */
  const tv = d.tehsilValue && typeof d.tehsilValue === 'object' ? d.tehsilValue : null;
  if (tv) { if (isN(tv.level) && tv.level >= 0 && tv.level <= 4) return { key: h.key, name: h.name, state: 'level', level: tv.level, word: WORDS[tv.level], counted: false, area: true };
    return noLevel(h, isN(tv.code) ? tv.code : codeOfState(tv.state, tv.why), { area: true }); }
  return noLevel(h, h.key === 'wind' ? -5 : codeOfState(d.state, d.why));
}
/* the count of one point: site levels (siteLevels(c).hazards) -> days 0-3 */
/* v91.17.283.39 · extra.glof: the tehsil's served GLOF layer days [{ day, level, word, state, why }] (served.mjs tehsilLevelsOf), carried as the
   area value of a site-level entry (like landslide): never counted; without it the GLOF bar is "Not assessed" */
function glofEntry(days) {
  return { scope: 'tehsil', days: [0, 1, 2, 3].map((L) => { const d = (days || []).find((x) => x.day === L);
    return { lead: L, date: d ? d.date : null, assessed: false, tehsilValue: d ? (isN(d.level) ? { level: d.level, word: d.word } : { level: null, code: codeOfState(d.state, d.why), state: d.state }) : null }; }) };
}
export function countOf(siteLevels, gate, rule = null, extra = null) {
  const R = rule || countRule(gate);
  if (!siteLevels || siteLevels.ok === false || !siteLevels.hazards) return { ok: false, version: HAZARD_COUNT_VERSION, why: (siteLevels && siteLevels.why) || 'the site levels are not available', rule: R };
  const H = extra && extra.glof ? { ...siteLevels.hazards, glof: glofEntry(extra.glof) } : { ...siteLevels.hazards }, C = new Set(R.counted.map((c) => c.key));
  /* v91.17.283.49 · 1.0.10 item 1 · extra.air: the served air-quality days of the point's tehsil (placesummary.airDays); each day's bar shows the
     class and the day's summary is raised at "Unhealthy for sensitive groups" or worse (placesummary.mjs). The count is unchanged. */
  Object.defineProperty(H, '__air', { value: Array.isArray(extra && extra.air) ? extra.air : null, enumerable: false });
  const days = [0, 1, 2, 3].map((lead) => {
    const anyDay = Object.values(H).map((x) => (x.days || []).find((y) => y.lead === lead)).find((y) => y && y.date);
    const bars = HAZARDS.map((h) => barOf(h, H, lead, C.has(h.key)));
    const cb = bars.filter((b) => C.has(b.key) && b.state === 'level');
    const count = cb.length ? cb.filter((b) => b.level >= MODERATE).length : null;
    const ab = bars.find((b) => b.key === 'air'), airRaised = !!(ab && ab.raisesSummary), allAssessed = bars.filter((b) => C.has(b.key)).every((b) => b.state === 'level' || b.state === 'not_applicable');
    const summary = { state: count ? 'hazard' : airRaised ? 'attention' : count === 0 && allAssessed && ab && ab.state === 'value' ? 'clear' : 'incomplete', raised: !!count || airRaised,
      ...(airRaised ? { air: { category: ab.word, pm25: ab.pm25 ?? null, line: 'Air quality ' + ab.word + (ab.pm25 != null ? ' (PM2.5 daily mean ' + ab.pm25 + ' µg/m³, forecast)' : ' (forecast)') } } : {}) };
    return { lead, date: anyDay ? anyDay.date : null, count, at: cb.filter((b) => b.level >= MODERATE).map((b) => b.key), assessed: cb.map((b) => b.key), bars, summary };
  });
  return { ok: true, version: HAZARD_COUNT_VERSION, threshold: 'Moderate or above', scaleMax: R.scaleMax, stateWords: STATE_WORD, days, counted: R.counted, notCounted: R.notCounted,
    summaryRule: 'the day summary is raised by a counted hazard at Moderate or above, or by served air quality at "Unhealthy for sensitive groups" or worse (' + AQI_SOURCE + '); air quality is never counted' };
}
