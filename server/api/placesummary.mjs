/* == v91.17.283.49 · NIGRAAN 1.0.10 · data item 1 · AIR QUALITY IN THE PLACE'S TOP-LEVEL SUMMARY =========================================
   Owner report (Islamabad I-8, report NIGRAAN-SITE-20261102-2438b617, 2 Nov 15:54 PKT): the banner said "no hazard at this site" while the
   same report's air-quality table read Unhealthy on 5 days (PM2.5 daily mean up to 72.4 ug/m3). Root cause: the one hazard list
   (hazardlist.mjs) and the start page count (hazardcount.mjs) leave air quality out by design (PARAMETER_LAYERS: "air quality is not a
   hazard"; hazard count: "air levels are not tested"), and every summary (the banner, the start page panel, the analyst place card, the
   AI's headline) is built from those two only, so a place with unhealthy air read as all-clear.

   DECISION (documented in BUILD_NOTES_113_data.md):
   - Air quality enters the SUMMARY, not the hazard list and not the hazard count. The hazard count stays "hazards at Moderate or above"
     (its scale and the national surface are unchanged); the hazard list stays the weather hazards; neither gains a forecast-skill claim.
   - The air class is the SERVED class (smog.mjs: the US EPA AQI 2024 category of the day's served daily mean PM2.5 / PM10, the value the
     map's air-quality layer and the report table show). No new threshold: it raises the summary at the first category of the published
     scale whose health statement names effects ("Unhealthy for sensitive groups"; US EPA AQI Technical Assistance Document 2024), i.e. any
     category above "Moderate", taken from the scale's own order.
   - Summary state, one function for every surface: 'hazard' (a weather hazard at Moderate or above), else 'attention' (air quality at or
     above the first health category on a served day), else 'clear' (every daily hazard assessed below Moderate and air below it), else
     'incomplete' (something not assessed: no all-clear). The headline names air quality with its class, its days and its peak served
     PM2.5, and says it is a served air-quality forecast (no test claim: the air levels are labelled as the served forecast, not tested).
   Read by served.mjs (the served unit: levels part, reports, Customize), hazardcount.mjs (start page / place panel), ai.mjs (Ask NIGRAAN). */
export const AQI_CATEGORIES = Object.freeze(['Good', 'Moderate', 'Unhealthy for sensitive groups', 'Unhealthy', 'Very unhealthy', 'Hazardous']);   /* US EPA AQI order (smog.mjs aqiCat words) */
export const AQI_SOURCE = 'US EPA AQI (2024 PM2.5 breakpoints, 89 FR 16202): the first category whose health statement names effects is "Unhealthy for sensitive groups"';
export const AIR_RAISES_FROM = AQI_CATEGORIES.indexOf('Unhealthy for sensitive groups');
export const SUMMARY_VERSION = 'place-summary-1 (v91.17.283.49)';
const isN = (x) => typeof x === 'number' && Number.isFinite(x);
const r1 = (x) => (isN(x) ? Math.round(x * 10) / 10 : null);

/* the served air-quality days of a tehsil (smog.unit), from `fromDate` on: [{ date, category, i, pm25, aqi }] */
export function airDays(smogUnit, fromDate = null) {
  const D = smogUnit && Array.isArray(smogUnit.days) ? smogUnit.days : [];
  return D.filter((d) => d && d.date && (!fromDate || d.date >= fromDate)).map((d) => { const i = AQI_CATEGORIES.indexOf(d.aqiCategory);
    return { date: d.date, category: i >= 0 ? d.aqiCategory : null, i: i >= 0 ? i : null, pm25: r1(d.pm25), aqi: isN(d.aqi) ? d.aqi : null, ...(d.aqNotAssessed ? { why: d.aqNotAssessed } : {}) }; });
}
/* the air part of a summary: the worst served class, the days at or above the first health category, the peak PM2.5 of those days */
export function airPart(days, at = null) {
  const held = (days || []).filter((d) => isN(d.i));
  if (!held.length) return { assessed: false, why: 'no served air-quality value for these days', raises: false };
  const worst = held.reduce((a, b) => (b.i > a.i ? b : a));
  const hit = held.filter((d) => d.i >= AIR_RAISES_FROM);
  const peak = hit.length ? hit.reduce((a, b) => ((b.pm25 ?? -1) > (a.pm25 ?? -1) ? b : a)) : null;
  return { assessed: true, raises: hit.length > 0, worst: worst.category, worstIndex: worst.i, days: hit.map((d) => ({ date: d.date, category: d.category, pm25: d.pm25, aqi: d.aqi ?? null })),
    dayCount: hit.length, of: held.length, peakPm25: peak ? peak.pm25 : null, peakDate: peak ? peak.date : null, at: at || null,
    basis: 'served air-quality forecast (daily mean PM2.5 / PM10 on the US EPA AQI classes); a forecast value, not a tested hazard level', scale: AQI_SOURCE };
}
const dl = (iso) => { const d = new Date(iso + 'T00:00:00Z'); return isNaN(d) ? iso : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]; };
export function airLine(A) {
  if (!A || !A.raises) return null;
  const cls = [...new Set(A.days.map((d) => d.category))];
  return 'Air quality ' + (cls.length === 1 ? cls[0] : A.worst + ' at worst') + ' on ' + A.dayCount + ' of ' + A.of + ' day' + (A.of === 1 ? '' : 's')
    + (A.dayCount <= 2 ? ' (' + A.days.map((d) => dl(d.date)).join(', ') + ')' : ' (' + dl(A.days[0].date) + ' to ' + dl(A.days[A.days.length - 1].date) + ')')
    + (A.peakPm25 != null ? ', PM2.5 daily mean up to ' + A.peakPm25 + ' µg/m³' : '') + ' (air-quality forecast)';   /* v91.17.283.52 merge: the plain words the analyst page's customer text cleaner (set A) already shows, now the same on Customize, reports and Ask */
}
/* the ONE summary of a place: hazardList (hazardlist.mjs shape) + the air part */
export function summaryOf(hazardList, air) {
  const HL = hazardList || {}; const A = air || { assessed: false, raises: false };
  const hz = Array.isArray(HL.hazards) ? HL.hazards : [];
  const aL = airLine(A);
  let state, headline;
  if (hz.length) { state = 'hazard'; headline = hz.map((h) => h.name + ' ' + h.level).join(', ') + (aL ? '; ' + aL : ''); }
  else if (A.raises) { state = 'attention'; headline = aL + (HL.none ? '; no weather hazard reached Moderate' : HL.partial ? '; no assessed weather hazard reached Moderate (' + (HL.notAssessed || []).length + ' not assessed)' : ''); }
  else if (HL.none) { state = A.assessed ? 'clear' : 'incomplete'; headline = A.assessed ? HL.none + '; air quality ' + A.worst + ' at worst' : HL.none + '; air quality not assessed (' + (A.why || 'no served value') + ')'; }
  else { state = 'incomplete'; headline = HL.partial || HL.nothingAssessed || 'the hazard levels of this place are not complete'; }
  return { version: SUMMARY_VERSION, state, raised: state === 'hazard' || state === 'attention', headline, air: A, hazards: hz.length,
    rule: 'hazard: a weather hazard at Moderate or above; attention: served air quality at "Unhealthy for sensitive groups" or worse (US EPA AQI); clear: every daily hazard assessed below Moderate and air below that category; incomplete: anything not assessed (no all-clear)' };
}
/* the air part for a tehsil from the app (served smog answer), over the served hazard days (or today on) */
export function airOfUnit(app, uid, fromDate = null) {
  if (!uid || !app || !app.smog || !app.smog.unit) return { assessed: false, raises: false, why: 'the air-quality service is not loaded' };
  let u = null; try { u = app.smog.unit(uid); } catch (_) { u = null; }
  if (!u || !Array.isArray(u.days)) return { assessed: false, raises: false, why: 'no served air-quality answer for this tehsil' };
  const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
  return airPart(airDays(u, fromDate || today), u.at || null);
}
