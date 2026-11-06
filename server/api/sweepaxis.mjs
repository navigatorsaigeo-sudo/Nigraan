/* ══ v91.17.283.10 · budget · A CHANGED-MEMBER SPLICE THAT CANNOT FIT IS NOT ASKED ════════════════════════════════════════════════════
   The sweep cache refreshes a multi-model body (the console's 9-model set) after a member's newer run by asking only that member and
   putting its columns in place (server.mjs spliceRefresh). The splice is used only when the member's answer has the same time axis as
   the held body; otherwise it is thrown away and the whole body is fetched again (refreshNow). The console's 9-model set asks
   `forecast_hours=6`: its axis starts at the hour it was fetched, so a member run that lands in a later clock hour can never fit, and
   every such run change paid the member call (576 weighted calls for the five bodies) before the full fetch it was always going to make.

   hourAxisMoved() says, before the call, whether that splice is certain to fail on the time axis: the request is hour-relative
   (forecast_hours / past_hours, no dated window) and for some location the provider's hourly axis now starts at another hour than the
   held body's (the provider aligns such a window to the current hour of the location's own UTC offset: open-meteo ForecastapiQuery.swift
   forecastTimeRange2, `start = (now + utcOffset) / 3600 * 3600`). Time only moves forward, so an axis that differs now still differs when
   the member answer would come back: skipping the member call and going straight to the full fetch gives the same stored body as the
   failed splice followed by the full fetch did, one call earlier. Anything it cannot read returns false (the splice is tried as before). */
const pad = (n) => String(n).padStart(2, '0');
const isoLocal = (sec) => { const d = new Date(sec * 1000); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); };
export function hourAxisMoved(get, body, nowMs = Date.now()) {
  try {
    if (process.env.NIGRAAN_SPLICE_AXIS_CHECK === '0') return false;
    const has = (k) => get(k) != null && get(k) !== '';
    if (!(has('forecast_hours') || has('past_hours'))) return false;
    if (has('start_date') || has('end_date') || has('start_hour') || has('end_hour') || has('initial_hours')) return false;
    const ph = has('past_hours') ? Number(get('past_hours')) : 0; if (!Number.isInteger(ph) || ph < 0) return false;
    const j = JSON.parse(Buffer.isBuffer(body) ? body.toString('utf8') : String(body)); const L = Array.isArray(j) ? j : [j];
    if (!L.length) return false;
    const now = Math.floor(nowMs / 1000);
    for (const loc of L) {
      const T = loc && loc.hourly && loc.hourly.time; const off = loc && loc.utc_offset_seconds;
      if (!Array.isArray(T) || !T.length || typeof T[0] !== 'string' || !Number.isInteger(off)) return false;
      const want = isoLocal(Math.floor((now + off) / 3600) * 3600 - ph * 3600);
      if (T[0] !== want) return true;
    }
    return false;
  } catch (_) { return false; }
}
