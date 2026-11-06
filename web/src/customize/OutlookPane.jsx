import { useMemo } from 'react';
import {
  band, cmipShift, fixed, hoursAhead, partValue, partWhy, shortDate,
} from './model.js';

function clockHour(time) {
  return String(time || '').slice(11, 13);
}

function LineChart({ hours }) {
  const rows = (hours || []).filter((hour) => Number.isFinite(+hour.tempC));
  if (!rows.length) return <p className="cz-muted">The hourly forecast is not available for this place right now.</p>;
  const width = 1180;
  const rains = rows.map((hour) => Math.max(0, +hour.rainMm || 0));
  const rHi = Math.max(0, ...rains);
  const hasRain = rHi > 0;
  const height = hasRain ? 196 : 164;
  const padL = 40;
  const padR = hasRain ? 52 : 16;
  const padT = 14;
  const padB = 18;
  const rainH = hasRain ? 32 : 0;
  const rainTop = height - padB - rainH;
  const plotBottom = rainTop - (hasRain ? 8 : 0);
  const temps = rows.map((hour) => +hour.tempC);
  let tLo = Math.floor(Math.min(...temps) - 1);
  let tHi = Math.ceil(Math.max(...temps) + 1);
  if (tHi <= tLo) tHi = tLo + 2;
  const x = (index) => padL + (index / Math.max(1, rows.length - 1)) * (width - padL - padR);
  const yT = (value) => padT + (1 - (value - tLo) / (tHi - tLo)) * (plotBottom - padT);
  const span = tHi - tLo;
  const step = span > 14 ? 4 : span > 8 ? 2 : 1;
  const ticks = [];
  for (let tick = Math.ceil(tLo / step) * step; tick <= tHi; tick += step) ticks.push(tick);
  const line = rows.map((hour, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${yT(+hour.tempC).toFixed(1)}`).join(' ');
  const area = `${line} L${x(rows.length - 1).toFixed(1)},${plotBottom} L${x(0).toFixed(1)},${plotBottom} Z`;
  let maxI = 0;
  let minI = 0;
  rows.forEach((hour, index) => {
    if (+hour.tempC > +rows[maxI].tempC) maxI = index;
    if (+hour.tempC < +rows[minI].tempC) minI = index;
  });
  const labelX = (index) => Math.min(width - padR - 18, Math.max(padL + 14, x(index)));
  const maxY = yT(+rows[maxI].tempC);
  const minY = yT(+rows[minI].tempC);
  const barW = Math.max(2.5, Math.min(6, ((width - padL - padR) / rows.length) * 0.62));
  const rainDigits = rHi < 1 ? 1 : 0;
  const firstMidnight = rows.findIndex((hour) => clockHour(hour.time) === '00');
  const showStart = clockHour(rows[0].time) !== '00' && (firstMidnight < 0 || x(firstMidnight) - padL > 78);
  return (
    <svg className="cz-chart cz-chart-72" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Next 72 hours, temperature and rain">
      <rect x={padL} y={padT} width={width - padL - padR} height={plotBottom - padT} rx="8" fill="#f7faf8" />
      <path d={area} fill="#f6b26b" opacity="0.28" />
      {hasRain && (
        <g>
          <rect x={padL} y={rainTop} width={width - padL - padR} height={rainH} rx="8" fill="#f3faf8" />
          <line x1={padL} x2={width - padR} y1={height - padB} y2={height - padB} stroke="#d5e6e1" />
          {rows.map((hour, index) => rains[index] > 0 && (
            <rect
              key={hour.time}
              x={x(index) - barW / 2}
              y={height - padB - (rains[index] / rHi) * (rainH - 6)}
              width={barW}
              height={(rains[index] / rHi) * (rainH - 6)}
              rx="1.5"
              fill="#14b8a6"
            />
          ))}
          <text x={width - 8} y={rainTop + 14} className="cz-axis rain" textAnchor="end">{fixed(rHi, rainDigits)} mm</text>
        </g>
      )}
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={padL} x2={width - padR} y1={yT(tick)} y2={yT(tick)} stroke="#e6eeea" />
          <text x="6" y={yT(tick) + 4} className="cz-axis">{tick}°</text>
        </g>
      ))}
      {rows.map((hour, index) => clockHour(hour.time) === '00' && (
        <g key={`day-${hour.time}`}>
          <line x1={x(index)} x2={x(index)} y1={padT} y2={hasRain ? height - padB : plotBottom} stroke="#d5e0da" strokeDasharray="3 3" />
          <text x={Math.min(width - padR - 4, x(index) + 4)} y={height - 6} className="cz-axis" fontWeight="700">{shortDate(hour.time)}</text>
        </g>
      ))}
      {showStart && <text x={padL} y={height - 6} className="cz-axis">{clockHour(rows[0].time)}:00</text>}
      <path d={line} fill="none" stroke="#c4843a" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(maxI)} cy={maxY} r="4.5" fill="#e8552d" stroke="#fff" strokeWidth="2" />
      <text x={labelX(maxI)} y={Math.max(12, maxY - 10)} className="cz-axis hot" textAnchor="middle">{fixed(rows[maxI].tempC)}°</text>
      {minI !== maxI && (
        <>
          <circle cx={x(minI)} cy={minY} r="4.5" fill="#8e5bc4" stroke="#fff" strokeWidth="2" />
          <text x={x(minI) + (x(minI) < padL + 80 ? 8 : -8)} y={minY - 3} className="cz-axis cold" textAnchor={x(minI) < padL + 80 ? 'start' : 'end'}>{fixed(rows[minI].tempC)}°</text>
        </>
      )}
    </svg>
  );
}

function FanChart({ days }) {
  const rows = (days || []).filter((day) => band(day.tx)).slice(0, 15);
  if (!rows.length) return <p className="cz-muted">The 15-day spread is not available for this place right now.</p>;
  const width = 520;
  const height = 200;
  const temps = rows.flatMap((day) => [band(day.tx).lo, band(day.tx).hi, band(day.tn)?.lo, band(day.tn)?.hi].filter((n) => n != null));
  const lo = Math.min(...temps) - 1;
  const hi = Math.max(...temps) + 1;
  const x = (index) => 28 + (index / Math.max(1, rows.length - 1)) * (width - 40);
  const y = (value) => 12 + (1 - (value - lo) / (hi - lo)) * (height - 32);
  const bandPath = (key) => {
    const top = rows.map((day, index) => `${index ? 'L' : 'M'}${x(index)},${y(band(day[key]).hi)}`);
    const bottom = rows.map((day, index) => `L${x(rows.length - 1 - index)},${y(band(rows[rows.length - 1 - index][key]).lo)}`);
    return [...top, ...bottom, 'Z'].join(' ');
  };
  const mid = (key) => rows.map((day, index) => `${index ? 'L' : 'M'}${x(index)},${y(band(day[key]).mid)}`).join(' ');
  return (
    <svg className="cz-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Next 15 days">
      <path d={bandPath('tx')} fill="#f6c28b" opacity="0.7" />
      <path d={bandPath('tn')} fill="#b9d4ea" opacity="0.75" />
      <path d={mid('tx')} fill="none" stroke="#c45c26" strokeWidth="2" />
      <path d={mid('tn')} fill="none" stroke="#2f6690" strokeWidth="2" />
    </svg>
  );
}

export default function OutlookPane({ bundle, loading }) {
  const hours = hoursAhead(bundle, 72);
  const outlook = partValue(bundle, 'outlook');
  const seasonal = partValue(bundle, 'seasonal');
  const cmip = partValue(bundle, 'cmip6');
  const days = outlook?.ensemble?.days || [];
  const events = outlook?.events;
  const eventRows = (events?.definitions || []).map((item) => {
    const row = events[item.id];
    return row ? { label: item.label, p: row.p, clim: row.climP, why: row.why } : null;
  }).filter(Boolean);
  const weeks = seasonal?.subseasonal?.weeks || [];
  const shifts = useMemo(() => cmipShift(cmip), [cmip]);
  const name = bundle?.place?.name || '';

  return (
    <section className="cz-step">
      <div className="cz-hero tone-outlook">
        <h1>Outlook</h1>
        <span>What is coming at this place, from the next hours to the 2050s?</span>
        <p>{loading ? 'Loading…' : (name || partWhy(bundle, 'outlook') || 'The forecast for this place')}</p>
      </div>
      <div className="cz-card">
        <h3>Next 72 hours</h3>
        <p>Temperature at this place. {hours.some((hour) => +hour.rainMm > 0) ? 'The teal bars underneath are rain each hour, on their own scale.' : 'No rain is forecast in these 72 hours.'} Times in PKT.</p>
        <LineChart hours={hours} />
      </div>
      <div className="cz-grid">
        <div className="cz-card">
          <h3>Next 15 days</h3>
          <p>Middle of the 51 forecast runs, with the spread around it. Orange is the day maximum, blue the night minimum.</p>
          <FanChart days={days} />
          <table className="cz-table">
            <thead><tr><th>Day</th><th>Max °C</th><th>Min °C</th><th>Rain mm</th><th>Gust km/h</th></tr></thead>
            <tbody>
              {days.filter((day) => band(day.tx)).slice(0, 15).map((day) => (
                <tr key={day.date}>
                  <td>{shortDate(day.date)}</td>
                  <td>{fixed(band(day.tx)?.mid)}</td>
                  <td>{fixed(band(day.tn)?.mid)}</td>
                  <td>{fixed(band(day.pr)?.mid, 0)}</td>
                  <td>{fixed(band(day.gu)?.mid, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <div className="cz-card">
            <h3>Chance of a multi-day event</h3>
            {!eventRows.length && <p className="cz-muted">{partWhy(bundle, 'outlook') || 'Not available for this place right now.'}</p>}
            {eventRows.map((row) => (
              <div key={row.label} className="cz-event">
                <div><b>{row.label}</b>{row.why && row.p == null && <span>{row.why}</span>}</div>
                <em>{row.p == null ? '—' : `${Math.round(row.p * 100)}%`}</em>
                <div className="cz-bar"><i style={{ width: `${Math.max(0, Math.min(100, (row.p || 0) * 100))}%` }} /></div>
                {row.clim != null && <small>Usual for this time of year: {Math.round(row.clim * 100)}%</small>}
              </div>
            ))}
          </div>
          <div className="cz-card">
            <h3>Weeks and season ahead</h3>
            <p>Departure from this place’s normal for the same week.</p>
            <table className="cz-table">
              <thead><tr><th>Week</th><th>Temperature</th><th>Rain</th></tr></thead>
              <tbody>
                {weeks.slice(0, 6).map((week) => (
                  <tr key={week.start}>
                    <td>Week of {shortDate(week.start)}</td>
                    <td>{week.tAnom == null ? '—' : `${week.tAnom > 0 ? '+' : ''}${fixed(week.tAnom)} °C`}</td>
                    <td>{week.pAnom == null ? '—' : `${week.pAnom > 0 ? '+' : ''}${fixed(week.pAnom, 0)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="cz-card">
        <h3>Long term · 2030s and 2041–2050 (CMIP6)</h3>
        <p>Mean daily maximum in each window, minus the baseline window. Planning context, not a forecast. {cmip?.models?.length || 0} models.</p>
        {!shifts.length && <p className="cz-muted">{partWhy(bundle, 'cmip6') || (loading ? 'Loading…' : 'The climate models did not return a window for this place.')}</p>}
        {!!shifts.length && (
          <table className="cz-table">
            <thead><tr><th>Model</th><th>2030s vs baseline</th><th>2050s vs baseline</th></tr></thead>
            <tbody>
              {shifts.map((row) => (
                <tr key={row.model}>
                  <td>{row.model.replace(/_/g, ' ')}</td>
                  <td>{row['2030d'] == null ? '—' : `${row['2030d'] > 0 ? '+' : ''}${fixed(row['2030d'])} °C`}</td>
                  <td>{row['2050d'] == null ? '—' : `${row['2050d'] > 0 ? '+' : ''}${fixed(row['2050d'])} °C`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
