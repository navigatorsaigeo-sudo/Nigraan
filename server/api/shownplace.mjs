/* == v91.17.283.49 · NIGRAAN 1.0.10 · data item 6 · THE SHOWN PLACE ANSWER: ONE SET OF DISPLAY STRINGS FOR EVERY PAGE =========================
   Owner (2 Nov 2026): one server, yet the pages disagree for the same place and time. They all read the same place bundle (GET /api/point,
   pointstate.mjs since v283.11), but each page FORMATTED it itself: the start page rounds the day high / low to whole degrees (r0) and the
   "now" value with Math.round(x*10)/10 ("21" for 21.0), the analyst card with toFixed(1) ("21.0"), Customize with its own g(); and a "now"
   value carried no word saying whether it was a station measurement or the forecast of the hour. So the same served 21.04 / 26.8 / 8.6 C
   appeared as 21 / 27 / 9 on one page and 21.0 / 26.8 / 8.6 on another.
   Here the bundle carries `shown`: the display strings of the values every page shows in its place header, made once by ONE rule, with the
   kind of each now-value. Pages print these strings (data-shown="<key>" on the element) and never re-round them; the report prints the same
   strings. RULE: temperatures (air, feels-like, day high / low, station reading) to one decimal, toFixed(1), -0.0 shown as 0.0; relative
   humidity, wind and gust to whole numbers; "now" = the served forecast of the current PKT hour, labelled "forecast for HH:00 PKT"; a station
   reading = "measured now (<station>, <km> km, <minutes> min ago)", only from the bundle's one station rule (pointstate: nearest reporting
   AGN station passing the display screens, within 25 km and the height rule); when the fleet feed is unavailable, "station data
   unavailable since HH:MM PKT" (fleet.mjs feedOf); the place summary = placesummary.mjs (weather hazards + served air quality). */
export const SHOWN_VERSION = 'shown-place-3 (v91.17.283.52)';
const isN = (x) => typeof x === 'number' && Number.isFinite(x);
export const t1 = (x) => (isN(x) ? (Math.round(x * 10) / 10).toFixed(1).replace(/^-0\.0$/, '0.0') : null);
export const i0 = (x) => (isN(x) ? String(Math.round(x) === 0 ? 0 : Math.round(x)) : null);
export function shownOf(B, o = {}) {
  if (!B || !B.ok) return null;
  const n = B.now || {}, d0 = (B.days || []).find((d) => d.lead === 0) || (B.days || [])[0] || {};
  /* v91.17.283.51 · 1.0.10.2 C3 · the forecast "now" is the served hourly curve at the minute the value is made (linear between the
     current hour's value and the next hour's), labelled with that minute ("forecast for 09:47 PKT"); before, 09:47 showed the 09:00 value
     as "forecast for 09:00 PKT". madeAt = when the value was made (the "Updated" time the pages print). */
  const nowMs = isN(o.nowMs) ? o.nowMs : Date.now(), PKT = 5 * 3600e3, pk = new Date(nowMs + PKT), p2 = (x) => String(x).padStart(2, '0');
  const madeHHMM = p2(pk.getUTCHours()) + ':' + p2(pk.getUTCMinutes());
  const hourMs = n.time ? Date.parse(String(n.time).slice(0, 16) + ':00Z') - PKT : NaN;
  const nx = n.time && Array.isArray(B.hours) ? B.hours[B.hours.findIndex((h) => h && h.time === n.time) + 1] || null : null;
  const fr = isN(hourMs) && nowMs >= hourMs && nowMs < hourMs + 3600e3 && nx && nx.time && Date.parse(String(nx.time).slice(0, 16) + ':00Z') - PKT === hourMs + 3600e3 ? (nowMs - hourMs) / 3600e3 : null;
  const at = (k) => (isN(n[k]) ? (fr != null && isN(nx[k]) ? n[k] + (nx[k] - n[k]) * fr : n[k]) : null);
  const hh = fr != null ? madeHHMM : n.time ? String(n.time).slice(11, 16) : null;
  /* v91.17.283.52 D · N6: "(corrected with live station readings)" only where this place has a live reading (stMeasured below); next to
     "No live measurement near ..." it contradicted itself (the live layer corrects from stations up to 40 km away) */
  const S0 = B.station || {}, liveHere = !!(S0.ok && S0.reading && isN(S0.reading.tempC));
  const fc = isN(n.tempC) ? { kind: 'forecast', value: t1(at('tempC')), text: t1(at('tempC')) + ' °C', time: n.time, hourValue: t1(n.tempC), label: 'forecast for ' + hh + ' PKT' + (n.live && liveHere ? ' (corrected with live station readings)' : ''),
    feels: t1(at('feelsC')), rh: i0(at('rh')), wind: i0(at('windKmh')), gust: i0(at('gustKmh')), dew: t1(at('dewC')) } : { kind: 'forecast', value: null, text: null, label: 'no forecast value for this hour' };
  const S = B.station || {}, r = S.reading || {};
  const feed = o.feed || null;
  /* v91.17.283.51 fix · OWNER DECISION 3 Nov 18:54 PKT: no station names, distances or minutes anywhere for customers or in reports; one fixed
     sentence by location (the deploy of 18:31 was rolled back: the held-back station reasons ran off report page 1). Station detail stays in
     the operator consoles only. */
  const latin = (x) => { const t = String(x || '').replace(/^near\s+/i, '').replace(/\s*\([^)]*km\)\s*$/i, '').trim(); return t && /^[\x20-\x7E\u00C0-\u024F]+$/.test(t) && !/\d\s*km\b/i.test(t) ? t : null; };
  const pn = latin(B.place && B.place.name) || latin(B.place && B.place.tehsil) || latin(B.place && B.place.district) || 'this place';   /* a name every page and the report font can draw */
  const LIVE = 'Temperature measured now near ' + pn, NOLIVE = 'No live temperature measurement near ' + pn + ' right now; the value shown is the forecast.';
  const obsMs = r.observedAt ? Date.parse(r.observedAt) : (isN(S.ageMin) ? nowMs - S.ageMin * 60e3 : NaN);
  const obsHHMM = isN(obsMs) ? (() => { const d = new Date(obsMs + PKT); return p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()); })() : null;
  const stMeasured = S.ok && isN(r.tempC) ? { kind: 'measured', value: t1(r.tempC), text: t1(r.tempC) + ' °C', station: S.name || null, km: isN(S.km) ? Math.round(S.km * 10) / 10 : null, minutesAgo: isN(S.ageMin) ? Math.round(S.ageMin) : null, observedAt: isN(obsMs) ? new Date(obsMs).toISOString() : null,
      label: LIVE } : null;
  if (stMeasured) { stMeasured.station = null; stMeasured.km = null; stMeasured.minutesAgo = null; }
  /* v91.17.283.51 · 1.0.10.2 C2 · ONE "now" on every page and the report: a quality-checked reading of the bundle's one station rule (nearest
     reporting AGN station passing the display screens, within 25 km and the height rule) taken after the forecast hour began is fresher than
     the forecast, so it IS the now value (with its label); the forecast of the minute is then the second line. Otherwise the now value is the
     forecast, with one short reason why no reading is used. (3 Nov: the start page showed 19.5 °C beside "21.8 °C measured now, 12 min ago".) */
  const fresher = !!(stMeasured && fc.value != null && isN(obsMs) && isN(hourMs) && obsMs >= hourMs);
  let now, measured;
  if (fresher) { now = { ...stMeasured, time: n.time, made: madeHHMM, feels: fc.feels, rh: r.rh != null ? i0(r.rh) : fc.rh, wind: r.windKmh != null ? i0(r.windKmh) : fc.wind, gust: fc.gust, dew: fc.dew, forecastValue: fc.value };
    measured = { kind: 'forecast', value: null, text: null, forecastValue: fc.value, label: 'forecast for ' + hh + ' PKT: ' + fc.value + ' °C' }; }
  else if (stMeasured) {
    /* v91.17.283.52 D · N4 (live test 52: operator "MACH Lahore Cantt 0.8 km, 7 min ago" while the customer card and report said "No live
       measurement near Lahore Cantt"): the bundle's one station rule HAS a reading, taken before this forecast hour began (20:57 for the
       21:00 hour), so it is not the "now" value; it is still a live measurement and is shown as such, with its time, in every view. ONE
       decision (the station rule of the record) for the customer card, the operator card and the report. */
    const lab = 'Temperature measured near ' + pn + (obsHHMM ? ' at ' + obsHHMM + ' PKT' : '');
    now = { ...fc, reason: fc.value != null ? 'The latest temperature reading near ' + pn + (obsHHMM ? ' (' + obsHHMM + ' PKT)' : '') + ' was taken before this hour began; the value shown is the forecast for now.' : null };
    measured = { ...stMeasured, label: lab }; }
  else { const why = NOLIVE;
    now = { ...fc, reason: fc.value != null ? why : null };
    measured = { kind: 'measured', value: null, text: null, label: why }; }
  /* v91.17.283.52 E · AIR QUALITY MEASURED NOW (aqnow.mjs, o.air): one sentence by location, no monitor, agency, distance or age; the day's
     AQI tile stays the forecast daily mean (one definition, g1 S9); without a qualifying reading there is no measured line */
  const A = o.air; const airNow = A && A.ok && isN(A.aqi) && isN(A.pm25) ? { kind: 'measured', aqi: A.aqi, category: A.category, pm25: (Math.floor(A.pm25 * 10 + 1e-9) / 10).toFixed(1), observedAt: A.observedAt || null,
      label: 'Air quality measured now near ' + pn + ': AQI ' + A.aqi + ' \u00b7 ' + A.category + ' (PM2.5 ' + (Math.floor(A.pm25 * 10 + 1e-9) / 10).toFixed(1) + ' \u00b5g/m\u00b3, hourly)' } : { kind: 'none', label: null };
  const today = { date: d0.date || null, high: t1(d0.tmaxC), low: t1(d0.tminC), highText: isN(d0.tmaxC) ? t1(d0.tmaxC) + ' °C' : null, lowText: isN(d0.tminC) ? t1(d0.tminC) + ' °C' : null, label: 'forecast' };
  const sm = o.summary || null;
  return { version: SHOWN_VERSION, at: B.issuedAt || null, madeAt: new Date(nowMs).toISOString(), made: madeHHMM + ' PKT', run: B.run || null, now, measured, today, airNow,
    heatToday: n.heatLevel || null,
    summary: sm ? { state: sm.state, raised: sm.raised, headline: sm.headline } : null,
    rule: 'temperatures to 1 decimal (toFixed(1)); humidity, wind, gust whole numbers; now = a quality-checked station reading taken after the forecast hour began (the bundle\'s one station rule), else the served forecast at the minute it is made (linear between the hour and the next); summary = placesummary.mjs' };
}

/* v91.17.283.52 D · ONE served decision for both views: the shown now / measured / today of a point state (key + issuedAt) is made once, by
   the first bundle that reads it (either view), and reused by the other view's bundle while that point state lives (PS_TTL_MS); the place
   summary stays per view. Live test 52: the customer and operator bundles of Lahore Cantt, built minutes apart, printed different dew points
   and station lines. */
const SHOWN_MEMO = new Map(); const MEMO_MS = 15 * 60e3;
export function shownShared(B, o = {}) {
  const k = B && B.key ? B.key + '|' + (B.issuedAt || '') : null, nowMs = isN(o.nowMs) ? o.nowMs : Date.now(); let c = k ? SHOWN_MEMO.get(k) : null;
  if (!c || nowMs - c.ms >= MEMO_MS) { c = { ms: nowMs, sh: shownOf(B, { ...o, summary: null }) }; if (k) { SHOWN_MEMO.set(k, c); if (SHOWN_MEMO.size > 4000) SHOWN_MEMO.delete(SHOWN_MEMO.keys().next().value); } }
  const sm = o.summary || null; if (!c.sh) return null;
  /* v91.17.283.52 E · a measured air reading kept in the shared decision is dropped (both views alike) once it is 90 minutes old */
  const an = c.sh.airNow, airNow = an && an.observedAt && nowMs - Date.parse(an.observedAt) > 90 * 60e3 ? { kind: 'none', label: null } : an;
  return { ...c.sh, airNow, summary: sm ? { state: sm.state, raised: sm.raised, headline: sm.headline } : null };
}
/* v91.17.283.52 D · N20: one spelling: a place-table word that is the tehsil or district name spelled differently (Shekhupura) is printed in
   the official spelling (Sheikhupura) in the place's name, label and nearby name (edit distance 1-2, same first letter, words of 5+ letters) */
const lev = (a, b) => { a = a.toLowerCase(); b = b.toLowerCase(); if (Math.abs(a.length - b.length) > 2) return 9; const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { let p = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; } } return d[b.length]; };
export function spellLike(name, P) { return String(name).replace(/[A-Za-z][A-Za-z'-]{4,}/g, (w) => { for (const o of [P.tehsil, P.district]) { const ow = String(o || '').split(/\s+/).find((x) => x.length >= 5 && x[0].toLowerCase() === w[0].toLowerCase() && lev(x, w) > 0 && lev(x, w) <= 2); if (ow) return ow; } return w; }); }
export function placeSpelling(place) { try { if (!place) return place; for (const k of ['name', 'label']) if (place[k]) place[k] = spellLike(place[k], place); if (place.near && place.near.name) place.near = { ...place.near, name: spellLike(place.near.name, place) }; } catch (_) {} return place; }
