/* v91.17.236 · THE PAKISTAN DAY OF A TIME, ONE HELPER. 'YYYY-MM-DD' of the time in Pakistan (UTC+5, no daylight saving), exactly
   new Date(ms + 5 h).toISOString().slice(0, 10), which six modules each wrote out. The laptop profile (10 Oct) had 4-5 s of 180 s in
   these calls (one per hour of every place's series); the string of each day is now made once and looked up. A value that is not a
   finite number goes through the original expression (same result, same error). */
const memo = new Map();
export function pktDay(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return new Date(ms + 5 * 3600e3).toISOString().slice(0, 10);
  const k = Math.floor((ms + 5 * 3600e3) / 864e5); let s = memo.get(k);
  if (s === undefined) { s = new Date(ms + 5 * 3600e3).toISOString().slice(0, 10); if (memo.size > 20000) memo.clear(); memo.set(k, s); }
  return s;
}

/* == v91.17.283.28 · S2 · ONE RULE: AN HOUR-ENDING INTERVAL -> ITS PKT DAY ============================================================
   A provider's hourly precipitation (and snowfall) stamped hh is the sum over the PRECEDING hour (hh-1 to hh). The PKT day D therefore holds
   the values stamped D 01:00 ... D 23:00 and D+1 00:00 (= D 24:00): the eight 3-hour windows 00-03 ... 21-24 PKT of D add up to D's total
   exactly. Every daily rain or snow total the server makes (place record, rain chance, verification sums, archive, report) and every 3-hour
   window reads these functions; nothing else groups hour-ending values by the stamp's own date. Temperatures and other instant values keep
   pktDay of their own time. */
export const HOUR_ENDING_RULE = 'PKT day of an hour-ending amount: the day holds the hours ending 01:00 to 24:00 PKT (each value is the preceding hour)';
const HR = 3600e3;
/* the instant a stamp names: a number (ms), an ISO time with a zone, or a 'YYYY-MM-DDTHH:MM' label read as PKT (o.utc: as UTC) */
export function stampMs(t, o = {}) {
  if (typeof t === 'number') return t;
  const s = String(t == null ? '' : t); if (/(Z|[+-]\d\d:?\d\d)$/.test(s)) return Date.parse(s);
  const ms = Date.parse(s.slice(0, 16) + 'Z'); return o.utc ? ms : ms - 5 * HR;
}
/* the PKT day an hour-ending value belongs to (the day of the interval's start) */
export const hourEndingDay = (t, o = {}) => { const ms = stampMs(t, o); return Number.isFinite(ms) ? pktDay(ms - HR) : null; };
/* the 3-hour PKT window ('YYYY-MM-DDTHH:00', HH = 00, 03, ... 21) an hour-ending value belongs to */
export function hourEndingWindow(t, o = {}) { const ms = stampMs(t, o); if (!Number.isFinite(ms)) return null;
  const d = new Date(ms - HR + 5 * HR), h = d.getUTCHours(); return d.toISOString().slice(0, 11) + String(h - (h % 3)).padStart(2, '0') + ':00'; }
/* day totals of an hour-ending series: day -> { sum, n (finite values), hours (stamps) }; a day is complete only with 24 finite values */
/* v91.17.283.31 · owner 3.6 · 24 DIFFERENT hours: a stamp seen twice is counted once and marks the day (dup, dupStamps): its total is
   then incomplete (callers test e.n === 24 && !e.dup, or complete24(e)) */
export function hourEndingTotals(times, vals, o = {}) {
  const by = new Map(); (times || []).forEach((t, i) => { const d = hourEndingDay(t, o); if (!d) return; const e = by.get(d) || by.set(d, { sum: 0, n: 0, hours: 0, idx: [], dup: 0, dupStamps: [], seen: new Set() }).get(d);
    const ms = stampMs(t, o); if (e.seen.has(ms)) { e.dup++; e.dupStamps.push(String(t)); return; } e.seen.add(ms);
    e.hours++; e.idx.push(i); const v = vals ? vals[i] : null; if (typeof v === 'number' && Number.isFinite(v)) { e.sum += v; e.n++; } });
  for (const e of by.values()) delete e.seen;
  return by;
}
export const complete24 = (e) => !!(e && e.n === 24 && e.hours === 24 && !e.dup);
/* the same rule on a label in its own clock (a response asked in another time zone): the day of (label - 1 h) */
export const labelDayEnding = (label) => { const ms = Date.parse(String(label).slice(0, 16) + 'Z'); return Number.isFinite(ms) ? new Date(ms - HR).toISOString().slice(0, 10) : null; };
