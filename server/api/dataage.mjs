/* == v91.17.283.36 (NIGRAAN 1.0) · launch list item 29 · ONE DATA-AGE TABLE ===========================================================
   Every input that can go out of date has ONE row here: the provider's run cycle and the delivery delay (from the run's base time to the
   moment our job has it in hand). An input is "out of date" once it is older than cycle + delay measured from its base time: by then the
   next run should already be in hand. Every module that withholds on age reads this table (before: the same ensemble run was current for
   24 h on the heavy-rain level, 18 h on site risk and 15 h on the operator board; the river forecast had two separate 30 h constants; the
   downscale and closed-window caches kept values 36 h whatever the runs did).
   When only the time we received the data is held (no base time), the base time is taken as received - delay, so the limit counted from
   receipt is the cycle itself.
   Sources: ECMWF dissemination schedule (ENS day-15 step at base + 7 h 40 min); our own delivery measured on the laptop copy of 30 Oct 2026
   (ENS 12 UTC run of 23 Oct in hand 12.96 h after base; GloFAS reaches fetched once per Pakistan day, the 28 Oct fetch completed 25 min after
   PKT midnight); ERA5 via the provider: daily, 5-day publication delay (Open-Meteo historical weather API) - the 24 Oct table held ERA5 to
   17 Oct (6 days after the end of that day); CAMS global 00/12 UTC; the river sheet is a daily bulletin read the same day. */
export const DATA_AGE = {
  ens:    { label: 'ECMWF ENS 15-day ensemble (00 and 12 UTC runs)', cycleH: 12, delayH: 13, from: 'run base time (issueInit); else received - delay', basis: 'ECMWF ENS twice daily; ENS day 15 disseminated at base + 7 h 40 min (ECMWF dissemination schedule); measured in hand at base + 12.96 h (23 Oct 12 UTC run)' },
  river:  { label: 'GloFAS river forecast (reaches)', cycleH: 24, delayH: 0.5, from: 'received', basis: 'GloFAS daily run; our river job fetches once per Pakistan day at PKT midnight (flood.mjs refreshIfOld); measured 25 min to complete (28 Oct)' },
  gauge:  { label: 'Official river gauge sheet', cycleH: 24, delayH: 24, from: 'reading day (PKT)', basis: 'daily flood bulletin; a reading day is complete at its end, the next sheet is due within the following day' },
  era5:   { label: 'ERA5 daily rain at the tehsil point (ground wetness)', cycleH: 24, delayH: 120, rebuildH: 6, from: 'end of the last day held', basis: 'ERA5 via the provider: daily, 5-day publication delay; our table is rebuilt every 6 h (climatology.mjs buildDroughtNational)' },
  air:    { label: 'CAMS global air-quality forecast', cycleH: 12, delayH: 0, from: 'received', basis: 'CAMS global runs 00 and 12 UTC; our job re-fetches every 3 h, so the data in hand is never more than one cycle behind' },
  national: { label: 'National hourly forecast run', cycleH: 1, delayH: 2, from: 'completed', basis: 'our national run is hourly; a run takes up to 2 h to complete in the 60-place sweep (engine.mjs)' }
};
/* the limit in hours for one input (cycle + delay, plus our own rebuild step where the table is rebuilt on a timer) */
export function limitH(k) { const r = DATA_AGE[k]; if (!r) return NaN; return r.cycleH + r.delayH + (r.rebuildH || 0); }
/* the age in hours of an input: from its base time when held, else from receipt minus the delivery delay */
export function ageH(k, { baseMs = null, receivedMs = null, now = Date.now() } = {}) {
  const r = DATA_AGE[k]; if (!r) return NaN;
  if (Number.isFinite(baseMs)) return (now - baseMs) / 3600e3;
  if (Number.isFinite(receivedMs)) return (now - receivedMs) / 3600e3 + (r.from === 'received' ? 0 : r.delayH);
  return NaN;
}
/* receipt-based limit (for inputs that only carry their receipt time): the limit counted from receipt */
export function limitFromReceiptH(k) { const r = DATA_AGE[k]; if (!r) return NaN; return r.from === 'received' ? r.cycleH + r.delayH : r.cycleH; }
/* the ensemble run: is it current? (base = issueInit seconds when held) */
export function ensAge(ens, now = Date.now()) {
  if (!ens) return { ageH: NaN, stale: true };
  const base = Number.isFinite(Number(ens.issueInit)) && Number(ens.issueInit) > 0 ? Number(ens.issueInit) * 1000 : null;
  const a = base != null ? (now - base) / 3600e3 : (ens.at ? (now - Date.parse(ens.at)) / 3600e3 + DATA_AGE.ens.delayH : NaN);
  return { ageH: a, stale: !(a <= limitH('ens')), fromBase: base != null };
}
/* the ERA5 wetness: is it current? asOf = the last day held (YYYY-MM-DD, UTC day) */
export function era5Age(asOf, now = Date.now()) {
  const end = asOf ? Date.parse(String(asOf).slice(0, 10) + 'T00:00:00Z') + 864e5 : NaN;
  const a = (now - end) / 3600e3; return { ageH: a, stale: !(a <= limitH('era5')) };
}
export const RAIN_ENS_STALE_H = limitH('ens');
export const RIVER_STALE_H = limitFromReceiptH('river');
export const DATA_AGE_TEXT = Object.entries(DATA_AGE).map(([k, r]) => r.label + ': out of date after ' + limitH(k) + ' h (' + r.cycleH + ' h cycle + ' + r.delayH + ' h delivery' + (r.rebuildH ? ' + ' + r.rebuildH + ' h rebuild' : '') + '; counted from ' + r.from + ')');
