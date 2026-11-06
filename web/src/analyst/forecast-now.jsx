function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function clamp(value) {
  return Math.max(0, Math.min(100, value));
}
function wetBulb(temp, rh) {
  if (temp == null || rh == null) return null;
  const t = Math.atan(0.151977 * Math.sqrt(rh + 8.313659));
  return temp * t + Math.atan(temp + rh) - Math.atan(rh - 1.676331) + 0.00391838 * (rh ** 1.5) * Math.atan(0.023101 * rh) - 4.686035;
}
function comfortOf(now) {
  const temp = num(now?.tempC);
  const feels = num(now?.feelsC);
  const rh = num(now?.rh);
  const wind = num(now?.windKmh);
  const utci = num(now?.utciShadeC);
  const heat = temp == null && feels == null ? null : clamp(Math.round(((feels == null ? temp : Math.max(feels, temp)) - 24) * 4.6));
  const score = utci == null ? null : clamp(Math.round(utci > 26 ? (100 * (46 - utci)) / 20 : utci < 9 ? (100 * (utci + 13)) / 22 : 100));
  return {
    temp,
    feels,
    rh,
    wind,
    utci,
    utciClass: now?.utciClass || '',
    utciSun: num(now?.utciSunC),
    heat,
    hum: rh == null ? null : clamp(Math.round(rh)),
    windRelief: wind == null ? null : clamp(Math.round(wind * 3)),
    score,
    wet: wetBulb(temp, rh),
    hi: feels != null && temp != null && temp >= 27 ? feels : null,
  };
}
function heatSeries(hours) {
  return (hours || []).filter((row) => num(row.tempC) != null).slice(0, 36).map((row) => {
    const feels = num(row.feelsC);
    const temp = num(row.tempC);
    return { hour: Number(String(row.time).slice(11, 13)), heat: clamp(Math.round(((feels == null ? temp : Math.max(feels, temp)) - 24) * 4.6)) };
  });
}
function longestRun(series, limit) {
  let best = null;
  let cur = null;
  series.forEach((row, index) => {
    if (row.heat <= limit) {
      cur = cur ? { ...cur, to: index } : { from: index, to: index };
      if (!best || cur.to - cur.from > best.to - best.from) best = { ...cur };
    } else cur = null;
  });
  return best;
}
function hh(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}
function outdoorWindow(c, hours) {
  const series = heatSeries(hours);
  if (series.length) {
    const limit = c.heat >= 80 ? 45 : c.heat >= 60 ? 40 : 35;
    const run = longestRun(series, limit);
    if (run && run.to - run.from >= 1) return [`${hh(series[run.from].hour)} to ${hh(series[run.to].hour)}`, `${run.to - run.from + 1} h below ${limit}/100 heat stress · longest run in the hourly forecast`];
    if (run) return [hh(series[run.from].hour), `Single hour below ${limit}/100 · no usable continuous window in the forecast`];
    return ['No window', `No forecast hour falls below ${limit}/100 heat stress in the next 36 h`];
  }
  if (c.heat >= 80) return ['05:30 to 09:00', 'Avoid midday and afternoon (band default, not forecast-derived)'];
  if (c.heat >= 60) return ['06:00 to 10:00', 'Lower heat load before noon (band default, not forecast-derived)'];
  if (c.heat >= 40) return ['Morning or after 17:00', 'Short exposure manageable (band default, not forecast-derived)'];
  return ['Most of the day', 'No major heat constraint'];
}
export function OpsBrief({ bundle }) {
  const now = bundle?.now || {};
  const c = comfortOf(now);
  const outdoor = outdoorWindow(c, bundle?.hours || []);
  const name = bundle?.place?.name || 'This place';
  const band = c.heat == null ? null : c.heat >= 75 ? 'Severe' : c.heat >= 55 ? 'High' : c.heat >= 35 ? 'Moderate' : c.heat >= 18 ? 'Low' : 'Minimal';
  const event = c.heat >= 75 ? ['Cooling plan required', 'Mist fans, shade and water points recommended'] : c.heat >= 55 ? ['Shade required', 'Tents and water points recommended'] : ['Standard controls', 'Normal event planning controls'];
  return (
    <article className="fc-card fc-ops">
      <div className="fc-outhead">
        <div>
          <div className="fc-kicker">Operations</div>
          <h3>Premium operations brief</h3>
          <p className="fc-note">{name} safety and planning guidance</p>
        </div>
        <span className="fc-pill">AGN Intelligence System</span>
      </div>
      <div className="fc-metrics fc-ops-grid">
        <div className="fc-ops-cell tone-window"><span>Best outdoor window</span><b>{outdoor[0]}</b><em>{outdoor[1]}</em></div>
        <div className="fc-ops-cell tone-stress"><span>Commute stress</span><b>{band ? <><span className={`hz hz-${band === 'Severe' ? 'bad' : band === 'High' ? 'high' : band === 'Moderate' ? 'mid' : 'ok'} hz-chip`}>{band}</span> heat stress</> : 'Not scored'}</b><em>{c.heat == null ? 'No temperature for this place, so commute heat stress is not scored' : `Heat-stress index ${Math.round(c.heat)}/100 · ${c.heat >= 65 ? 'peak commute heat stress likely' : 'hydration advised during peak sun'} · comfort index, not the heat hazard band`}</em></div>
        <div className="fc-ops-cell tone-event"><span>Event operations</span><b className={c.heat >= 75 ? 'hz hz-bad' : c.heat >= 55 ? 'hz hz-high' : ''}>{event[0]}</b><em>{event[1]}</em></div>
        <div className="fc-ops-cell tone-urban"><span>Urban heat signal</span><b>Not held</b><em>No urban-form profile for this place, so no urban heat delta is computed.</em></div>
      </div>
    </article>
  );
}
