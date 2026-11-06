/* == v91.17.283.31 · items 3.2, 3.6, 3.7 · THE ONE COMPLETENESS LAYER =====================================================================
   Every day value the server makes from hours passes through checkHours(): a day is COMPLETE only when it holds all 24 DIFFERENT hours of
   its Pakistan day, each with a value. Otherwise the value is null with the reason (never a figure from the hours that happen to be there):
     missing     an hour of the day is absent or carries no value          "held for 11 of the 24 hours"
     duplicate   the same hour appears twice (a doubled provider row)       "duplicate hour 14:00": incomplete, whatever the values
     wrongDate   an hour stamped outside the day is never counted in it
   Used by: dayext.mjs extremeOfDay (daily highs and lows of temperature, feels-like, UTCI, wind, gust: owner 3.2, all 24 hours, no longer
   the daytime / night part), pktday.mjs hourEndingTotals (rain and snow day totals: owner 3.6, 24 different hour-ending stamps), the place
   record (placerecord.mjs: a failed model check makes the record incomplete, owner 3.1) and the bad-input test set
   (scripts/tests28331/badinput.unit.test.mjs, owner 3.8). */
export const HOURS_NEEDED = 24;
export const COMPLETENESS_RULE = 'a day value needs all 24 different hours of its Pakistan day, each with a value; a missing or duplicated hour leaves it not assessed with the reason';
const isN = (x) => typeof x === 'number' && Number.isFinite(x);
const hh = (h) => String(h).padStart(2, '0') + ':00';
/* entries: [{ hour: 0-23 (the slot the value belongs to), date: 'YYYY-MM-DD' (the day the slot belongs to), v }] -> the verdict for `date` */
export function checkSlots(entries, date, o = {}) {
  const need = o.need || HOURS_NEEDED, label = o.label || 'value';
  const seen = new Map(), dup = new Set(); let wrongDate = 0;
  for (const e of entries || []) { if (!e) continue; if (date && e.date !== date) { wrongDate++; continue; }
    const k = Number(e.hour); if (!(k >= 0 && k < need)) { wrongDate++; continue; }
    if (seen.has(k)) dup.add(k); else seen.set(k, e); }
  const held = [...seen.values()].filter((e) => isN(e.v)).length;
  const missing = []; for (let k = 0; k < need; k++) { const e = seen.get(k); if (!e || !isN(e.v)) missing.push(k); }
  const complete = !dup.size && !missing.length;
  const why = complete ? null : dup.size ? 'not assessed: duplicate hour ' + [...dup].sort((a, b) => a - b).map(hh).join(', ') + ' in the ' + label + ' of ' + date + ' (the provider sent the same hour twice)'
    : 'not assessed: ' + label + ' held for ' + held + ' of the ' + need + ' hours of ' + date + (missing.length <= 4 ? ' (missing ' + missing.map(hh).join(', ') + ')' : '');
  return { complete, held, need, duplicates: [...dup].sort((a, b) => a - b), missing, wrongDate, why, values: complete ? [...seen.values()] : null };
}
/* hour objects { time: 'YYYY-MM-DDTHH:MM' PKT, [key]: number } -> the verdict for `date` */
export function checkHours(hours, key, date, o = {}) {
  return checkSlots((hours || []).map((h) => ({ hour: Number(String(h.time).slice(11, 13)), date: String(h.time).slice(0, 10), v: h[key], h })), date, o);
}
