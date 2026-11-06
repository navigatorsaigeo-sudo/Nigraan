/* v91.17.283.35 · audit A3 / L8 · THE ONE HAZARD LIST of a place (report, console report, report add-on, Customize site report, /api/levels/unit):
   moved here from report.mjs so the served unit (served.mjs) carries it too; every page prints this list, none derives its own. */
export const HZ_WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
/* v283.36 · launch item 23 · no "no hazard" wording: when every daily hazard was assessed and none reached Moderate, the report says so
   in those words (Low stays a condition line with its value) */
export const NO_HAZARD = 'Every daily hazard was assessed; none reached Moderate in the period';
const LOW_WORDS = { heat: 'Low heat stress', cold: 'Low cold stress' };   /* v283.36 item 23: the level as calculated, with the UTCI value */
export const lowConditionOf = (key, name) => LOW_WORDS[key] || ('Low ' + String(name || key).toLowerCase());
/* v91.17.283.35 · audit A3 / L8 · STANDING RISK IS NOT A DAY'S HAZARD. GLOF susceptibility, the observed drought screening, the earthquake
   zone and the cyclone reference record do not change by day: they are listed in their own "standing risk" section with their own basis,
   never dated as today's hazard. Parameters (comfort, air quality, rain amount) are not hazards. */
export const STANDING_LAYERS = Object.freeze(['glof', 'drought', 'drought_rain', 'drought_soil', 'drought_crops', 'drought_water', 'seismic', 'cyclone', 'nss_baseline']);
export const PARAMETER_LAYERS = Object.freeze(['comfort', 'heat_index', 'aqi', 'rain_amount', 'nss_dynamic', 'nss_runoff', 'nss_retention']);
const STANDING_BASIS = { glof: 'glacial-lake outburst susceptibility (a standing condition, not a forecast for a day)', drought: 'drought screening of the last complete month (observed, monthly)', seismic: 'building-code earthquake zone (fixed)', cyclone: 'cyclone wind record 1980-2025 (fixed)', nss_baseline: 'ground retention at usual wetness (fixed)' };
/* the hazards a report lists (Moderate or above, highest first), the Low condition lines, the layers not assessed (with reasons) and the
   standing risks, from the served levels of the report context. "No hazard at this site in the period" is said ONLY when every listed daily
   hazard was assessed below Moderate on every day (A3: before, a layer "Not assessed" on every day was skipped, so an all-clear was given
   with no assessment behind it). */
export function hazardListOf(levels) {
  if (!levels || levels.ready === false || !Array.isArray(levels.days)) return { ready: false, hazards: [], conditions: [], notAssessed: [], standing: [], none: null };
  const peak = {}, na = {}, seen = {}, standing = {}, cannot = {};
  levels.days.forEach((d) => Object.entries(d.layers || {}).forEach(([k, v]) => {
    if (PARAMETER_LAYERS.includes(k)) return;
    if (k === 'flood_riverine' && d.layers.flood) return;   /* the client Flood is the river-flooding level (one row, not two) */
    const i = HZ_WORDS.indexOf(v && v.word);
    const na0 = !v || v.assessed === false || v.word === 'Not assessed';
    if (STANDING_LAYERS.includes(k)) { if (!standing[k] && d === levels.days[0]) standing[k] = { key: k, name: (v && v.name) || k, word: na0 ? 'Not assessed' : v.word, ...(na0 && v && v.state ? { state: v.state } : {}), ...(!na0 && i >= 0 ? { i } : {}), ...(na0 ? { why: (v && v.notAssessedWhy) || null } : {}), basis: STANDING_BASIS[k.replace(/^drought_.*/, 'drought')] || 'a standing condition, not a forecast for a day', standing: true }; return; }
    seen[k] = seen[k] || { key: k, name: (v && v.name) || k };
    /* cannot happen here (physical impossibility) is a finding, not a gap: it does not block "no hazard" */
    if (i < 0 && v && v.state === 'not_applicable') { cannot[k] = cannot[k] || { key: k, name: v.name || k, why: v.notAssessedWhy || 'cannot happen here' }; return; }
    if (i < 0) { const r = (v && v.notAssessedWhy) || 'not assessed'; const o = na[k] || (na[k] = { key: k, name: (v && v.name) || k, days: [], reasons: [] }); o.days.push(d.date); if (!o.reasons.includes(r)) o.reasons.push(r); return; }
    const val = v && (Number.isFinite(v.value) ? v.value : Number.isFinite(v.V) ? v.V : v.facts && Number.isFinite(v.facts.utciC) ? v.facts.utciC : null);
    if (!peak[k] || i > peak[k].i) peak[k] = { key: k, name: v.name || k, i, word: HZ_WORDS[i], date: d.date, day: d.day, value: val, unit: v.unit || null }; }));
  const P = Object.values(peak), hazards = P.filter((x) => x.i >= 2).sort((a, b) => b.i - a.i || a.day - b.day).map((x) => ({ key: x.key, name: x.name, level: x.word, date: x.date }));
  const conditions = P.filter((x) => x.i === 1).map((x) => ({ key: x.key, name: x.name, text: lowConditionOf(x.key, x.name) + (x.value != null ? ' (' + ((x.key === 'heat' || x.key === 'cold') ? 'UTCI ' : '') + (Math.round(x.value * 10) / 10) + (x.unit ? (x.unit === '°C' ? ' °C' : ' ' + x.unit) : (x.key === 'heat' || x.key === 'cold') ? ' °C' : '') + ')' : '') + ' on ' + x.date, raisesAlert: false }));
  const notAssessed = Object.values(na).map((x) => ({ key: x.key, name: x.name, days: x.days, why: x.reasons.slice(0, 3).join('; ') }));
  const cannotHappen = Object.values(cannot).filter((x) => !peak[x.key] && !na[x.key]);
  /* v283.36 · launch item 41 · a withheld standing hazard (GLOF facts only, not tested) is a gap too: no all-assessed line while one is open */
  const standingGap = Object.values(standing).filter((x) => x.word === 'Not assessed' && x.state !== 'not_applicable' && (x.key === 'glof' || x.state === 'not_tested'));
  const anyAssessed = P.length > 0, allAssessed = anyAssessed && !notAssessed.length && !standingGap.length;
  const none = hazards.length ? null : allAssessed ? NO_HAZARD : null;
  const partial = !hazards.length && anyAssessed && notAssessed.length ? 'No hazard reached Moderate among the assessed hazards; not assessed: ' + notAssessed.map((x) => x.name + ' (' + x.why + ')').join('; ') : null;
  return { ready: true, hazards, conditions, notAssessed, cannotHappen, standing: Object.values(standing), none, ...(partial ? { partial } : {}), ...(!anyAssessed && !hazards.length ? { nothingAssessed: 'No daily hazard could be assessed for this place in the period' } : {}),
    rule: 'a hazard is listed only at Moderate or above (owner rule); Low is a condition line with its value, never a hazard or an alert (unless the client registered a limit); the all-assessed line only when every daily hazard was assessed below Moderate on every day; standing risks are listed apart and never dated as a day\'s hazard' };
}
