/* == v91.17.283.35 · audit 30 Oct (B2, L4, L5, D1, item 6) · THE MAP STATES, ONE HOME =============================================
   Every served cell that carries no level has ONE of these states, and every reader (GET /api/levels, /api/levels/unit, the served unit,
   the report, the AI, the page key and colours) takes the code, the state name, the label and the generic reason from here.
     -1 missing             "Data missing"                the input or the method failed for this place and day
     -2 outside_range       "Outside the method's range"  the method is not defined here (e.g. the drought index in an arid climate,
                                                          no mapped glacial lake within the routed corridor)
     -3 no_reach            "No gauged river reach"       no gauged river reach links to this tehsil (river flooding only)
     -4 not_applicable      "Cannot happen here"          PHYSICAL impossibility only. v283.36: only a glacial-lake flood where no
                                                          mapped lake lies in the tehsil or anywhere upstream in its drainage (the landslide
                                                          steep-ground mask and the river off-floodplain mask both FAILED their held-out tests)
     -5 not_tested          "Not tested here"             the method has not passed its test here (e.g. wind above 1,500 m, heavy rain
                                                          on the coast and in the hills)
     -6 input_not_current   "Input not current"           an input does not cover the day or is too old (its age is in the reason)
   Until v283.34 -2, -3 and -4 were all drawn as "cannot occur here" (state not_applicable): an undefined index, a river without a gauge
   and a missing feed were shown as physical impossibility. The state name not_applicable is kept for code -4 only. */
export const STATE_CODES = Object.freeze({
  '-1': 'missing', '-2': 'outside_range', '-3': 'no_reach', '-4': 'not_applicable', '-5': 'not_tested', '-6': 'input_not_current' });
export const STATE_LABEL = Object.freeze({
  value: 'Level', missing: 'Data missing', outside_range: 'Outside the method’s range', no_reach: 'No gauged river reach',
  not_applicable: 'Cannot happen here', not_tested: 'Not tested here', input_not_current: 'Input not current' });
/* the generic reason of each code (a cell's own reason, when it has one, is served in its place) */
export const STATE_TEXT = Object.freeze({
  '-1': 'data missing: no value from the hazard engine for this place and day',
  '-2': 'outside the method’s range: the method is not defined for this terrain or climate',
  '-3': 'no gauged river reach: no river gauge reach links to this tehsil, so river flooding is not scored here',
  '-4': 'cannot happen here: physically impossible at this place',
  '-5': 'not tested here: the method has not passed its test here, so no level is issued',
  '-6': 'input not current: an input does not cover this day or is too old' });
/* v91.17.283.37 · the SHORT client word of each code (bars, tiles and lists of the start page; one home, the page's copy is checked against it by
   scripts/tests28337/states37.test.mjs). "Not assessed" is used for -1 (data missing) only. */
export const STATE_WORD = Object.freeze({ '-1': 'Not assessed', '-2': 'Outside method range', '-3': 'No gauged river reach', '-4': 'Cannot happen here', '-5': 'Not tested', '-6': 'Input not current' });
/* the code of a cell that carries a state name and / or a reason text but no code (the place record's site levels) */
export function codeOfState(state, why) {
  const byName = Object.entries(STATE_CODES).find(([, n]) => n === state); if (byName) return Number(byName[0]);
  const w = String(why || '').toLowerCase();
  if (/^not tested|not tested here|has not passed its test/.test(w)) return -5;
  if (/input not current|not current|too old|out of date|does not cover/.test(w)) return -6;
  if (/cannot happen/.test(w)) return -4;
  if (/no gauged river reach|no river gauge reach/.test(w)) return -3;
  if (/outside the method|outside range|not defined (for|here)/.test(w)) return -2;
  return -1; }
export const stateOfCode = (v) => (typeof v === 'number' && v >= 0 ? 'value' : STATE_CODES[String(v)] || 'missing');
export const emptyStates = () => ({ value: 0, missing: 0, outside_range: 0, no_reach: 0, not_applicable: 0, not_tested: 0, input_not_current: 0 });
export function stateCounts(levels) { const o = emptyStates(); for (const v of Object.values(levels || {})) o[stateOfCode(v)]++; return o; }
/* the code dictionary every level answer carries (D1: -4, -5, -6 had no text in /api/levels) */
export const codeDict = (extra = {}) => ({ ...Object.fromEntries(Object.entries(STATE_TEXT).map(([k, v]) => [k, 'not assessed: ' + v])), '0-4': 'level index into words', ...extra });
