import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getJson } from '../start/api.js';
import { getPointBundle } from './placeCache.js';
import { cmipRows, generateReport, spread } from './climate.js';
import { CITIES } from './layers.js';
import { usePlace } from './place.js';
import { OpsBrief } from './forecast-now.jsx';
import { BothSystems } from './forecast-tools.jsx';
import OutlookDialog from './outlook-dialog.jsx';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TABS = [
  ['utci', 'Comfort'],
  ['temp', 'Temp'],
  ['feels', 'Feels'],
  ['rh', 'Humidity'],
  ['wind', 'Wind'],
  ['rain', 'Rain'],
  ['aqi', 'AQI'],
];
const JUMPS = [
  ['h72', '72 h', 'fc72'],
  ['d15', '15 days', 'fc15'],
  ['w26', 'Weeks 1–6', 'fc15'],
  ['season', 'Season', 'fc15'],
  ['clim', '2050s', 'fccm'],
];
const EV_ORDER = ['heatSpell', 'unusualWarmth', 'coastalHeat', 'rain3_75', 'rain3Local', 'rainOnSnow', 'heavySnow', 'frostSpell', 'coldSpell'];
const HEAT_SUB = {
  localDay: 'hot days: 3+ days hotter than usual for the date and past the heat floor (this is the event)',
  warmNight: 'warm nights: 3+ nights warmer than usual for the date and above 20 °C (information)',
  dayAndNight: 'hot days AND warm nights together — no overnight relief',
  absolute40: '≥ 40 °C for 3+ days inland, usual for the date or not (information)',
};
const BANDS = ['#8fbf7a', '#e6c84a', '#e8a05a', '#d9784a', '#b83d32'];

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
function f1(value) {
  const n = num(value);
  return n == null ? '—' : (Math.round(n * 10) / 10).toFixed(1);
}
function dayName(time) {
  const d = new Date(`${String(time).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(time || '');
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
}
function hh(time) {
  return String(time).slice(11, 16);
}
function when(time) {
  return `${dayName(time)} ${hh(time)}`;
}
function titleCase(text) {
  return String(text || '').replace(/\b\w/g, (c) => c.toUpperCase());
}
function sunUp(lat, lon, pktIso) {
  const t = Date.parse(`${String(pktIso).slice(0, 16)}:00+05:00`);
  if (!Number.isFinite(t)) return null;
  const D = Math.PI / 180;
  const el = (ms) => {
    const d = ms / 864e5 + 2440587.5 - 2451545.0;
    const g = (357.529 + 0.98560028 * d) * D;
    const q = 280.459 + 0.98564736 * d;
    const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * D;
    const e = (23.439 - 0.00000036 * d) * D;
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
    const dec = Math.asin(Math.sin(e) * Math.sin(L));
    const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
    const ha = ((gmst * 15 + lon) * D) - ra;
    return Math.asin(Math.sin(lat * D) * Math.sin(dec) + Math.cos(lat * D) * Math.cos(dec) * Math.cos(ha)) / D;
  };
  return el(t) > -0.833 && el(t + 3600e3) > -0.833;
}
function noStress(hour) {
  return /no thermal stress/i.test(String(hour?.utciClass || ''));
}
function windowOf(hours, nowTime) {
  const nowT = String(nowTime || '');
  let i0 = hours.findIndex((h) => String(h.time) >= nowT);
  if (i0 < 0) i0 = 0;
  const a = Math.max(0, i0 - 6);
  const b = Math.min(hours.length, i0 + 67);
  return { hours: hours.slice(a, b), now: i0 - a };
}
function next72(record, days) {
  const D3 = (record?.days || []).filter((d) => d.lead >= 0 && d.lead <= 2);
  if (!D3.length) return null;
  let high = null;
  let low = null;
  let gust = null;
  let rain = 0;
  let rainN = 0;
  const why = [];
  D3.forEach((d) => {
    if (d.tmaxC != null) { if (!high || d.tmaxC > high.c) high = { c: d.tmaxC, date: d.date }; }
    else if (d.tmaxWhy) why.push(`${d.date} high: ${d.tmaxWhy}`);
    if (d.tminC != null) { if (!low || d.tminC < low.c) low = { c: d.tminC, date: d.date }; }
    else if (d.tminWhy) why.push(`${d.date} low: ${d.tminWhy}`);
    if (d.rainMm != null) { rain += d.rainMm; rainN += 1; }
    else if (d.rainWhy) why.push(`${d.date} rain: ${d.rainWhy}`);
  });
  (days || []).filter((d) => d.lead >= 0 && d.lead <= 2).forEach((d) => {
    if (d.gustMaxKmh != null && (!gust || d.gustMaxKmh > gust.kmh)) gust = { kmh: d.gustMaxKmh, date: d.date };
  });
  const dates = high ? D3.filter((d) => d.tmaxC != null && Math.round(d.tmaxC * 10) === Math.round(high.c * 10)).map((d) => d.date) : [];
  return {
    high: high ? { ...high, dates } : null,
    low,
    rain: { mm: rainN === D3.length ? Math.round(rain * 10) / 10 : null, days: D3.map((d) => ({ date: d.date, mm: d.rainMm })) },
    gust,
    why,
  };
}
function modelShort(name) {
  const s = String(name || '');
  const known = ['NICAM16', 'NICAM', 'FGOALS', 'HiRAM', 'CMCC', 'MPI', 'MRI', 'EC-Earth', 'EC'];
  const hit = known.find((k) => s.toUpperCase().includes(k.toUpperCase()));
  if (hit) return hit === 'EC-Earth' ? 'EC' : hit;
  return s.replace(/_/g, ' ').slice(0, 18);
}

function HourChart({ hours, nowTime, tab, bands }) {
  const w = windowOf(hours, nowTime);
  const H = w.hours;
  if (tab === 'aqi') return <div className="fc-wait">No hourly air-quality series is fetched for this place. The daily air class is in Air &amp; sun, under Now, and in the Air &amp; smog outlook.</div>;
  if (H.length < 6) return <div className="fc-wait">The hourly forecast is too short to draw.</div>;
  const spec = {
    temp: { k: 'tempC', u: '°C', lo: 'lo90', hi: 'hi90', col: '#0e6b66' },
    feels: { k: 'feelsC', u: '°C', col: '#c45a1a' },
    utci: { k: 'utciShadeC', u: '°C', col: '#b45309' },
    rain: { k: 'rainMm', u: ' mm', bar: true, col: '#1a9aa3' },
    wind: { k: 'windKmh', u: ' km/h', k2: 'gustKmh', col: '#154a4e' },
    rh: { k: 'rh', u: ' %', col: '#0e7c86', fixed: [0, 100] },
  }[tab];
  const vals = H.map((h) => num(h[spec.k]));
  const lo = spec.lo ? H.map((h) => num(h[spec.lo])) : null;
  const hi = spec.hi ? H.map((h) => num(h[spec.hi])) : null;
  const v2 = spec.k2 ? H.map((h) => num(h[spec.k2])) : null;
  const chance = tab === 'rain' ? H.map((h) => num(h.rainProb)) : null;
  const all = [...vals, ...(lo || []), ...(hi || []), ...(v2 || [])].filter((x) => x != null);
  if (!all.length) return <div className="fc-wait">No {spec.k} values in this window.</div>;
  const Wd = 880;
  const Ht = 250;
  const L = 38;
  const R = spec.bar ? 40 : 12;
  const T = 14;
  const B = 34;
  let mn = spec.fixed ? spec.fixed[0] : Math.min(...all);
  let mx = spec.fixed ? spec.fixed[1] : Math.max(...all);
  if (spec.bar) { mn = 0; mx = Math.max(1, mx); }
  if (tab === 'utci') { mn = Math.min(mn, 20); mx = Math.max(mx, 30); }
  let stp = spec.fixed ? 25 : 1;
  if (!spec.fixed) {
    const raw = (mx - mn) / 4 || 1;
    const mag = 10 ** Math.floor(Math.log10(raw));
    stp = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) || raw;
    mn = (tab === 'wind' || spec.bar) ? 0 : Math.floor(mn / stp) * stp;
    mx = Math.ceil(mx / stp) * stp;
    if (mx <= mn) mx = mn + stp;
  }
  const n = H.length;
  const X = (i) => L + (i * (Wd - L - R)) / (n - 1);
  const Y = (v) => T + (1 - (v - mn) / (mx - mn)) * (Ht - T - B);
  const nodes = [];
  H.forEach((h, i) => {
    const hr = +String(h.time).slice(11, 13);
    const slot = (Wd - L - R) / (n - 1);
    if (hr >= 19 || hr < 6) nodes.push(<rect key={`n${i}`} x={X(i) - slot / 2} y={T} width={slot} height={Ht - T - B} fill="#f1f5f8" />);
  });
  if (tab === 'utci') {
    bands.forEach((b, i) => {
      const y1 = Y(Math.min(mx, b[1]));
      const y0 = Y(Math.max(mn, b[0]));
      if (b[0] < mx && y0 > y1) nodes.push(<rect key={`b${i}`} x={L} y={y1} width={Wd - L - R} height={y0 - y1} fill={BANDS[b[2]] || '#e8a05a'} opacity="0.42" />);
    });
  }
  const dec = stp < 1 ? (stp < 0.5 ? 2 : 1) : (stp % 1 ? 1 : 0);
  const grid = [];
  for (let gv = mn; gv <= mx + stp * 1e-6; gv += stp) {
    grid.push(<g key={gv}><line x1={L} x2={Wd - R} y1={Y(gv)} y2={Y(gv)} stroke="#e6edf1" /><text x={L - 6} y={Y(gv) + 4} fontSize="11" fill="#7a8d99" textAnchor="end">{gv.toFixed(dec)}</text></g>);
  }
  let shade = null;
  if (lo && hi) {
    const up = [];
    const dn = [];
    for (let i = 0; i < n; i += 1) {
      if (lo[i] != null && hi[i] != null) { up.push(`${X(i)},${Y(hi[i])}`); dn.unshift(`${X(i)},${Y(lo[i])}`); }
    }
    if (up.length > 2) shade = <polygon points={up.concat(dn).join(' ')} fill={spec.col} opacity="0.16" />;
  }
  const labels = [];
  H.forEach((h, i) => {
    const hr = +String(h.time).slice(11, 13);
    if (hr === 0 || i === 0) labels.push(<g key={`d${i}`}><line x1={X(i)} x2={X(i)} y1={T} y2={Ht - B} stroke="#d6e0e7" /><text x={X(i) + 4} y={Ht - B + 14} fontSize="12" fontWeight="700" fill="#4a6270">{dayName(h.time)}</text></g>);
    else if (hr % 6 === 0) labels.push(<text key={`h${i}`} x={X(i)} y={Ht - B + 26} fontSize="11" fill="#7a8d99" textAnchor="middle">{hh(h.time)}</text>);
  });
  let series = null;
  if (spec.bar) {
    const bw = Math.max(2, ((Wd - L - R) / n) * 0.7);
    series = vals.map((v, i) => (v != null && v > 0 ? <rect key={i} x={X(i) - bw / 2} y={Y(v)} width={bw} height={Y(0) - Y(v)} fill={spec.col} opacity="0.75" /> : null));
  } else {
    const d1 = [];
    const d2 = [];
    const future = [];
    vals.forEach((v, i) => {
      if (v == null) return;
      const seg = `${X(i)} ${Y(v)}`;
      if (i <= w.now) d1.push(`${d1.length ? 'L' : 'M'}${seg}`);
      if (i >= w.now) {
        d2.push(`${d2.length ? 'L' : 'M'}${seg}`);
        future.push([X(i), Y(v)]);
      }
    });
    const area = future.length > 1
      ? `M${future[0][0]} ${future[0][1]} ${future.slice(1).map((p) => `L${p[0]} ${p[1]}`).join(' ')} L${future.at(-1)[0]} ${Ht - B} L${future[0][0]} ${Ht - B} Z`
      : '';
    let gust = '';
    if (v2) v2.forEach((v, i) => { if (v == null) return; gust += `${gust ? 'L' : 'M'}${X(i)} ${Y(v)}`; });
    let mi = -1;
    vals.forEach((v, i) => { if (i >= w.now && v != null && (mi < 0 || v > vals[mi])) mi = i; });
    series = (
      <>
        {area && <path d={area} fill={spec.col} opacity="0.16" />}
        <path d={d1.join('')} fill="none" stroke="#5b6b75" strokeWidth="2.2" />
        <path d={d2.join('')} fill="none" stroke={spec.col} strokeWidth="2.6" />
        {gust && <path d={gust} fill="none" stroke={spec.col} strokeWidth="1.4" strokeDasharray="4 3" opacity="0.7" />}
        {mi >= 0 && (
          <>
            <circle cx={X(mi)} cy={Y(vals[mi])} r="4" fill="#d97706" stroke="#fff" strokeWidth="1.5" />
            <text x={Math.min(Wd - R - 70, X(mi) + 6)} y={Math.max(T + 10, Y(vals[mi]) - 7)} fontSize="12" fontWeight="800" fill="#b45309">highest {tab === 'rh' ? Math.round(vals[mi]) : f1(vals[mi])}{spec.u}</text>
          </>
        )}
      </>
    );
  }
  let chancePath = null;
  if (spec.bar && chance && chance.some((x) => x != null)) {
    let d = '';
    chance.forEach((v, i) => { if (v == null) return; d += `${d ? ' L' : 'M'}${X(i)} ${T + (1 - v / 100) * (Ht - T - B)}`; });
    chancePath = (
      <>
        <path d={d} fill="none" stroke="#7c3aed" strokeWidth="1.6" strokeDasharray="4 3" />
        {[0, 50, 100].map((q) => <text key={q} x={Wd - R + 4} y={T + (1 - q / 100) * (Ht - T - B) + 4} fontSize="10" fill="#7c3aed">{q} %</text>)}
      </>
    );
  }
  const nowV = vals[w.now];
  const nowT = nowV != null ? ` ${tab === 'rh' ? Math.round(nowV) : f1(nowV)}${spec.u}` : '';
  return (
    <svg className="fc-chart" viewBox={`0 0 ${Wd} ${Ht}`} role="img" aria-label="72-hour chart">
      {nodes}{shade}{grid}
      <text x="4" y={T - 3} fontSize="11" fill="#7a8d99">{spec.u.trim()}</text>
      {series}{chancePath}{labels}
      <line x1={X(w.now)} x2={X(w.now)} y1={T} y2={Ht - B} stroke="#c0392b" strokeWidth="1.6" />
      <text x={X(w.now) + 3} y={T + 12} fontSize="11" fontWeight="800" fill="#c0392b">now{nowT}</text>
    </svg>
  );
}

function FanChart({ days }) {
  const box = useRef(null);
  const [width, setWidth] = useState(980);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const measure = () => {
      const next = Math.round(el.getBoundingClientRect().width);
      if (next > 0) setWidth(Math.max(560, Math.min(1600, next)));
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const rows = (days || []).filter((d) => Array.isArray(d.tx) && Array.isArray(d.tn));
  if (rows.length < 2) return <div className="fc-wait">The ensemble outlook has not arrived for this place.</div>;
  const W = width;
  const H = 230;
  const L = 40;
  const R = 26;
  const T = 16;
  const B = 28;
  const n = rows.length;
  const vals = rows.flatMap((d) => [d.tx[0], d.tx[2], d.tn[0], d.tn[2]]).filter((v) => v != null);
  const mn = Math.min(...vals, 5) - 1;
  const mx = Math.max(...vals, 32) + 1;
  const X = (i) => L + ((W - L - R) * (n < 2 ? 0.5 : i / (n - 1)));
  const Y = (v) => T + (1 - (v - mn) / (mx - mn)) * (H - T - B);
  const band = (key, color) => {
    const up = rows.map((d, i) => `${i ? 'L' : 'M'}${X(i)} ${Y(d[key][2])}`).join(' ');
    const dn = [...rows].reverse().map((d, i) => `L${X(n - 1 - i)} ${Y(d[key][0])}`).join(' ');
    const mid = rows.map((d, i) => `${i ? 'L' : 'M'}${X(i)} ${Y(d[key][1])}`).join(' ');
    return <g key={key}><path d={`${up} ${dn} Z`} fill={color} opacity="0.28" /><path d={mid} fill="none" stroke={color} strokeWidth="2.2" /></g>;
  };
  const cut = rows.findIndex((d) => (d.leadDays ?? d.lead) >= 3);
  const pmax = rows.reduce((m, d) => Math.max(m, Array.isArray(d.pr) ? num(d.pr[2]) || 0 : 0), 0);
  const rainTop = Math.max(5, Math.ceil(pmax / 5) * 5);
  const RH = 70;
  const rainH = RH + 8;
  const bw = ((W - L - R) / n) * 0.5;
  return (
    <div className="fc-fan-wrap" ref={box}>
      <svg className="fc-fan" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="15-day temperature outlook">
        {[0, 10, 20, 30, 40].filter((g) => g >= mn && g <= mx).map((g) => (
          <g key={g}><line x1={L} x2={W - R} y1={Y(g)} y2={Y(g)} stroke="#e6edf1" /><text x={L - 6} y={Y(g) + 3} fontSize="10" fill="#7a8d99" textAnchor="end">{g}°</text></g>
        ))}
        {mx >= 40 && <line x1={L} x2={W - R} y1={Y(40)} y2={Y(40)} stroke="#e11d48" strokeDasharray="4 3" />}
        {mx >= 45 && <line x1={L} x2={W - R} y1={Y(45)} y2={Y(45)} stroke="#e11d48" strokeDasharray="4 3" />}
        {band('tn', '#1a9aa3')}
        {band('tx', '#c45a1a')}
        {cut > 0 && (
          <g>
            <line x1={X(cut)} x2={X(cut)} y1={T} y2={H - B} stroke="#7a919c" strokeDasharray="3 3" />
            <text x={X(cut) + 4} y={T + 13} fontSize="11" fontWeight="700" fill="#5d7684">beyond the verified 72 h forecast</text>
          </g>
        )}
        {rows.map((d, i) => <text key={d.date} x={X(i)} y={H - 8} fontSize="11" fill="#4a6270" textAnchor="middle">{dayName(d.date)}</text>)}
      </svg>
      <div className="fc-legend"><span><i className="lg-max" />daily max</span><span><i className="lg-min" />daily min</span><span>dashed = 40 and 45 °C</span></div>
      {pmax > 0.2 ? (
        <>
          <svg className="fc-fan-rain" viewBox={`0 0 ${W} ${rainH}`} role="img" aria-label="Daily rain">
            <text x={L + 4} y="12" fontSize="11" fill="#5a6f7c">{rainTop} mm</text>
            <line x1={L} x2={W - R} y1={RH + 4} y2={RH + 4} stroke="#c9d5de" />
            {rows.map((d, i) => {
              if (!Array.isArray(d.pr)) return null;
              const h50 = RH * (num(d.pr[1]) || 0) / rainTop;
              const h90 = RH * (num(d.pr[2]) || 0) / rainTop;
              const cx = X(i);
              return (
                <g key={`r-${d.date}`}>
                  <rect x={cx - bw / 2} y={RH - h50 + 4} width={Math.max(2, bw)} height={Math.max(0, h50)} fill="#4AB1B8" />
                  <line x1={cx} x2={cx} y1={RH - h90 + 4} y2={RH - h50 + 4} stroke="#4AB1B8" strokeWidth="1.5" />
                  <line x1={cx - 5} x2={cx + 5} y1={RH - h90 + 4} y2={RH - h90 + 4} stroke="#4AB1B8" strokeWidth="1.5" />
                </g>
              );
            })}
          </svg>
          <p className="fc-note">Rain: bar = median, whisker = 90th percentile (wet case).</p>
        </>
      ) : (
        <p className="fc-note">Rain: all members dry or under 0.2 mm on every day.</p>
      )}
    </div>
  );
}

function HBars({ rows, field, tone, title }) {
  const vals = rows.map((r) => num(r[field])).filter((v) => v != null);
  if (!vals.length) return null;
  const max = Math.max(...vals.map((v) => Math.abs(v)), 0.2);
  const hasNeg = vals.some((v) => v < 0);
  const unit = field.startsWith('dp') ? '%' : '°C';
  const digits = field.startsWith('dp') ? 0 : 1;
  return (
    <div className={`fc-bars-panel tone-${tone || 'hot'}`}>
      {title ? <h5>{title}</h5> : null}
      <div className="fc-bars">
        {rows.map((r) => {
          const v = num(r[field]);
          const w = v == null ? 0 : (Math.abs(v) / max) * (hasNeg ? 50 : 100);
          const style = !hasNeg || v == null || v >= 0
            ? { left: hasNeg ? '50%' : 0, width: `${w}%` }
            : { right: '50%', width: `${w}%` };
          return (
            <div className="fc-bar" key={r.model}>
              <span>{modelShort(r.model)}</span>
              <div className={`track${hasNeg ? ' signed' : ''}`}>
                <div className={`fill ${tone}${v != null && v < 0 ? ' neg' : ''}`} style={style} />
              </div>
              <b className={v != null && v < 0 ? 'neg' : ''}>{v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(digits)}${unit}`}</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ForecastView() {
  const { place, bundle } = usePlace('default');
  const [tab, setTab] = useState('utci');
  const [mmOpen, setMmOpen] = useState(false);
  const [shadow, setShadow] = useState('ec');
  const [outlook, setOutlook] = useState('d15');
  const [showEvents, setShowEvents] = useState(false);
  const [banner, setBanner] = useState(true);
  const [clean, setClean] = useState(true);
  const [jump, setJump] = useState('h72');
  const [levels, setLevels] = useState(null);
  const [inputs, setInputs] = useState(null);
  const [fleet, setFleet] = useState(null);
  const [latest, setLatest] = useState(null);
  const [pairs, setPairs] = useState(null);
  const [score, setScore] = useState(null);
  const [wn, setWn] = useState(null);
  const [ecStatus, setEcStatus] = useState(null);
  const [ecPoint, setEcPoint] = useState(null);
  const [cmip, setCmip] = useState(null);
  const [horizon, setHorizon] = useState('2050');
  const [climVar, setClimVar] = useState('tmax');
  const [report, setReport] = useState(null);
  const [copied, setCopied] = useState(false);
  const [compare, setCompare] = useState(false);
  const [cmpA, setCmpA] = useState('');
  const [cmpB, setCmpB] = useState('');
  const [cmpCards, setCmpCards] = useState({});
  const [cmpInfo, setCmpInfo] = useState(false);
  const cmpBusy = useRef({});
  const [sortKey, setSortKey] = useState('place');
  const [sortDir, setSortDir] = useState(1);
  const [showAllStations, setShowAllStations] = useState(false);
  const [health, setHealth] = useState(null);
  const [outlookOpen, setOutlookOpen] = useState(false);

  const hours = bundle?.hours || [];
  const days = bundle?.days || [];
  const record = bundle?.parts?.placeRecord?.v;
  const outlookV = bundle?.parts?.outlook?.v;
  const ensemble = outlookV?.ensemble;
  const events = outlookV?.events;
  const seasonal = bundle?.parts?.seasonal?.v;
  const smog = bundle?.parts?.smog?.v;
  const rainDays = bundle?.parts?.rainChance?.v?.days || [];
  const placeLabel = bundle?.place?.label || bundle?.place?.name || place?.name || 'this place';
  const placeName = place?.name || bundle?.place?.name || 'this place';
  const summary = useMemo(() => next72(record, days), [record, days]);
  const rows = useMemo(() => cmipRows(cmip), [cmip]);

  useEffect(() => { getJson('/api/registry/levels').then(setLevels).catch(() => setLevels(null)); getJson('/health').then(setHealth).catch(() => setHealth(null)); }, []);
  useEffect(() => {
    let live = true;
    const op = (url) => getJson(url, { view: 'operator' }).catch(() => null);
    const soft = (url) => getJson(url).catch(() => null);
    const loadFleet = () => {
      Promise.all([
        soft('/api/fleet/status'),
        op('/api/fleet/latest'),
        soft('/api/fleet/pairs'),
        op('/api/ops/scorecard'),
        op('/api/ops/wn3shadow'),
        soft('/api/ecmwf010/status'),
      ]).then(([st, lt, pr, sc, w, ec]) => {
        if (!live) return;
        setFleet(st); setLatest(lt); setPairs(pr); setScore(sc); setWn(w); setEcStatus(ec);
      });
    };
    loadFleet();
    const timer = setInterval(loadFleet, 60_000);
    return () => { live = false; clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (!place) return undefined;
    let live = true;
    setInputs(null);
    setEcPoint(null);
    setCmip(null);
    const q = `${place.lat.toFixed(5)},${place.lon.toFixed(5)}`;
    getJson(`/api/point/batch?with=inputs&pts=${q}`).then((body) => { if (live) setInputs(body?.states?.[0]?.inputs || { error: true }); }).catch(() => { if (live) setInputs({ error: true }); });
    getJson(`/api/ecmwf010/point?lat=${place.lat.toFixed(5)}&lon=${place.lon.toFixed(5)}&hourly=1&maxLead=120`).then((body) => { if (live) setEcPoint(body); }).catch(() => { if (live) setEcPoint({ ok: false }); });
    getPointBundle({ lat: place.lat, lon: place.lon, parts: 'cmip6' }).then((body) => { if (live) setCmip(body?.parts?.cmip6 || { error: true }); }).catch(() => { if (live) setCmip({ error: true }); });
    return () => { live = false; };
  }, [place?.lat, place?.lon]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('sec') !== 'fccm') return undefined;
    setJump('clim');
    let tries = 0;
    let timer = 0;
    const tick = () => {
      const node = document.getElementById('fccm');
      if (!node) {
        if (tries < 24) timer = setTimeout(() => { tries += 1; tick(); }, 200);
        return;
      }
      const scroller = scrollParent(node);
      const top = Math.max(0, node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 124);
      scroller.scrollTo({ top, behavior: 'smooth' });
    };
    timer = setTimeout(tick, 120);
    return () => clearTimeout(timer);
  }, [place?.lat, place?.lon, bundle?.ok]);
  const cmpOptions = useMemo(() => {
    const list = CITIES.map(([name, lat, lon]) => ({ key: `${lat.toFixed(4)},${lon.toFixed(4)}`, name, lat, lon }));
    if (place && !list.some((c) => Math.abs(c.lat - place.lat) < 0.05 && Math.abs(c.lon - place.lon) < 0.05)) {
      list.unshift({ key: `p:${place.lat.toFixed(5)},${place.lon.toFixed(5)}`, name: place.name || 'This place', lat: place.lat, lon: place.lon });
    }
    return list;
  }, [place]);
  useEffect(() => {
    if (!cmpOptions.length) return;
    setCmpA((cur) => (cmpOptions.some((o) => o.key === cur) ? cur : cmpOptions[0].key));
    setCmpB((cur) => (cmpOptions.some((o) => o.key === cur) ? cur : (cmpOptions.find((o) => o.name === 'Islamabad') || cmpOptions[1] || cmpOptions[0]).key));
  }, [cmpOptions]);
  useEffect(() => {
    if (!compare) return undefined;
    cmpOptions.filter((opt) => opt.key === cmpA || opt.key === cmpB).forEach((opt) => {
      const here = place && Math.abs(opt.lat - place.lat) < 0.02 && Math.abs(opt.lon - place.lon) < 0.02;
      if (here && bundle?.ok) {
        cmpBusy.current[opt.key] = true;
        setCmpCards((prev) => (prev[opt.key]?.bundle === bundle ? prev : { ...prev, [opt.key]: { bundle } }));
        return;
      }
      if (cmpBusy.current[opt.key]) return;
      cmpBusy.current[opt.key] = true;
      setCmpCards((prev) => (prev[opt.key]?.bundle ? prev : { ...prev, [opt.key]: { busy: true } }));
      const key = opt.key;
      getPointBundle({ lat: opt.lat, lon: opt.lon, name: opt.name, parts: 'default' }).then((body) => {
        if (!body?.ok) cmpBusy.current[key] = false;
        setCmpCards((cur) => ({ ...cur, [key]: body?.ok ? { bundle: body } : { error: true } }));
      }).catch(() => {
        cmpBusy.current[key] = false;
        setCmpCards((cur) => ({ ...cur, [key]: { error: true } }));
      });
    });
    return undefined;
  }, [compare, cmpA, cmpB, cmpOptions, bundle, place]);

  const heatBands = useMemo(() => {
    const heat = levels?.levels?.heat || {};
    const words = levels?.words || [];
    return Object.keys(heat).map((word) => {
      const range = heat[word]?.range;
      const i = words.indexOf(word);
      if (!Array.isArray(range) || range[0] == null || i < 1) return null;
      return [range[0], range[1] == null ? 99 : range[1], i];
    }).filter(Boolean);
  }, [levels]);

  function go(id, view) {
    setJump(id);
    if (view) setOutlook(view);
    const targetId = (id === 'w26' || id === 'season' || id === 'd15') ? 'fc15' : (JUMPS.find((j) => j[0] === id)?.[2] || 'fc72');
    window.requestAnimationFrame(() => {
      const node = document.getElementById(targetId);
      if (!node) return;
      const scroller = scrollParent(node);
      const offset = 124;
      const top = Math.max(0, node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - offset);
      scroller.scrollTo({ top, behavior: 'smooth' });
    });
  }
  function refreshInputs() {
    if (!place) return;
    setInputs(null);
    getJson(`/api/point/batch?with=inputs&pts=${place.lat.toFixed(5)},${place.lon.toFixed(5)}`, { force: true }).then((body) => setInputs(body?.states?.[0]?.inputs || { error: true })).catch(() => setInputs({ error: true }));
  }
  async function copyBrief() {
    const now = bundle?.shown?.now || {};
    const text = [
      `NIGRAAN comfort brief · ${placeLabel}`,
      `Now ${now.text || '—'} · feels like ${now.feels || '—'}°C · humidity ${now.rh || '—'}% · wind ${now.wind || '—'} km/h.`,
      now.reason || '',
      `Heat today: ${bundle?.shown?.heatToday?.word || bundle?.shown?.heatToday || '—'}.`,
      summary?.high ? `High, next 3 days: ${f1(summary.high.c)}°C on ${dayName(summary.high.date)}.` : '',
      summary?.low ? `Low, next 3 days: ${f1(summary.low.c)}°C on ${dayName(summary.low.date)}.` : '',
      summary?.rain?.mm != null ? `Rain, next 3 days: ${f1(summary.rain.mm)} mm.` : '',
    ].filter(Boolean).join('\n');
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
    }
    setCopied(ok ? 'ok' : 'fail');
    setTimeout(() => setCopied(false), 1800);
  }
  function situation() {
    if (!place) return;
    setReport({ busy: true });
    generateReport({ lat: place.lat, lon: place.lon, kind: 'situation_report', section: 'operations', edition: 'main', name: place.name }).then(setReport).catch(() => setReport({ ok: false }));
  }

  const nowHour = String(bundle?.now?.time || '').slice(0, 13);
  const inputHourly = inputs?.hourly || {};
  const inputIndex = Array.isArray(inputHourly.time) ? inputHourly.time.findIndex((t) => String(t).slice(0, 13) === nowHour) : -1;
  const atInput = (key) => (inputIndex >= 0 && Array.isArray(inputHourly[key]) ? num(inputHourly[key][inputIndex]) : null);
  const soil = atInput('soil_moisture_9_to_27cm');
  const vpd = atInput('vapour_pressure_deficit');
  const et0 = atInput('et0_fao_evapotranspiration');
  const t850 = atInput('temperature_850hPa');
  const w850 = atInput('wind_speed_850hPa');
  const msl = atInput('pressure_msl');
  const sw = atInput('shortwave_radiation') ?? num(bundle?.now?.swRad);
  const surfaceP = num(bundle?.now?.pressureHpa);

  const plan = useMemo(() => {
    if (!hours.length) return [];
    const w = windowOf(hours, bundle?.now?.time);
    const F = w.hours.slice(w.now);
    const out = [];
    const n24 = F.slice(0, 24);
    const pk = n24.reduce((best, h) => (num(h.utciShadeC) != null && (!best || h.utciShadeC > best.utciShadeC) ? h : best), null);
    if (pk) {
      const klass = titleCase(pk.utciClass || '—');
      out.push(['#9fb3bf', 'Outdoor work · next 24 h', `Hottest hour ${when(pk.time)}: UTCI ${f1(pk.utciShadeC)} °C in shade, ${klass.toLowerCase()}. The class is from the UTCI assessment scale.`]);
    }
    const n36 = F.slice(0, 36);
    let best = null;
    let cur = null;
    n36.forEach((h) => {
      const up = place ? sunUp(place.lat, place.lon, h.time) : null;
      const hr = +String(h.time).slice(11, 13);
      const day = up != null ? up : (hr >= 6 && hr < 19);
      if (day && noStress(h)) {
        if (!cur) cur = { a: h, b: h, n: 0 };
        cur.b = h; cur.n += 1;
        if (!best || cur.n > best.n) best = { ...cur };
      } else cur = null;
    });
    if (best) out.push(['#2e9e5b', 'Best daytime window', `${dayName(best.a.time)}, ${hh(best.a.time)}–${String((+hh(best.b.time).slice(0, 2) + 1) % 24).padStart(2, '0')}:00: ${best.n} daylight hour${best.n > 1 ? 's' : ''} with no heat stress`]);
    else {
      const least = n36.filter((h) => { const hr = +String(h.time).slice(11, 13); const up = place ? sunUp(place.lat, place.lon, h.time) : null; return (up != null ? up : (hr >= 6 && hr < 19)) && num(h.utciShadeC) != null; }).sort((a, b) => a.utciShadeC - b.utciShadeC)[0];
      if (least) out.push(['#d97706', 'Best daytime window', `No daylight hour in the next 36 h is free of heat stress; the least stressful is ${when(least.time)} (UTCI ${f1(least.utciShadeC)} °C).`]);
    }
    const chances = rainDays.slice(0, 2).map((d, i) => (d?.p?.['1'] != null ? `${i ? 'tomorrow' : 'today'} ${d.p['1']} %` : null)).filter(Boolean);
    const mm = summary?.rain?.mm;
    out.push([mm == null ? '#c7d6e0' : mm >= 10 ? '#52B6BE' : mm >= 1 ? '#8FD0D5' : '#c7d6e0', 'Rain', `${chances.length ? `Chance of 1 mm or more in the area: ${chances.join(', ')}. ` : ''}${mm == null ? 'The rain of the next 3 days is not complete.' : mm >= 0.1 ? `${f1(mm)} mm forecast in the next 3 days at this place (${summary.rain.days.map((d) => `${dayName(d.date)} ${f1(d.mm)}`).join(', ')}).` : 'No rain forecast in the next 3 days at this place.'}`]);
    const aqi = smog?.days?.[0];
    const uv = bundle?.now?.uv;
    if (aqi || uv != null) out.push([Number(aqi?.aqi) >= 150 ? '#d6604d' : Number(aqi?.aqi) >= 100 ? '#f4a582' : '#cfe8c9', 'Air and sun', `${aqi ? `Air quality today (AQI, daily mean) ${Math.round(aqi.aqi)} · ${aqi.aqiCategory || ''}. ` : ''}${uv != null ? `UV ${uv}.` : ''}`]);
    return out;
  }, [hours, bundle, place, rainDays, summary, smog]);

  const scoreLines = useMemo(() => {
    const list = Array.isArray(score?.rows) ? score.rows : [];
    let ec = 0; let wn3 = 0; let tie = 0; let n = 0; let sw = 0; let ss = 0;
    list.forEach((r) => {
      const d = String(r.p1?.decision || '');
      if (d && !/not computable|not judged/i.test(d)) {
        n += 1;
        if (/^(E25|ECMWF)\b.*better/i.test(d)) ec += 1;
        else if (/^WN3 better/i.test(d)) wn3 += 1;
        else tie += 1;
      }
      const d3 = String(r.p3?.decision || '');
      if (/^WN3 better/i.test(d3)) sw += 1;
      else if (/^(SRV|served) better/i.test(d3)) ss += 1;
    });
    const whenBuilt = score?.built ? String(score.built).slice(0, 10) : '';
    const cells = wn?.summary?.cells || [];
    const judged = cells.filter((c) => c?.decision && !/^not judged/.test(c.decision)).length;
    const daysN = wn?.summary?.window?.days;
    return {
      ec: score?.ok ? `Score (stations, forecast days 1–3, 2024–2026, scorecard of ${whenBuilt}): ECMWF 9 km better than WeatherNext 3 in ${ec} of ${n} comparisons, WeatherNext 3 better in ${wn3}, no clear difference in ${tie}. ECMWF 9 km is not compared directly with the served forecast.` : 'Scorecard: not available on this server.',
      wn: score?.ok ? `Score: WeatherNext 3 better than the served forecast in ${sw} and the served forecast better in ${ss} of the station comparisons (WeatherNext 3 had an information advantage there, so its wins are provisional). Live shadow: ${wn?.on ? `${daysN || 0} days scored, ${judged} of ${cells.length} cells judged` : 'off'}.` : '',
    };
  }, [score, wn]);

  const tiers = record?.outlookTiers;
  const t47 = (tiers?.tiers || []).find((t) => t.id === 'days4to7');
  const t814 = (tiers?.tiers || []).find((t) => t.id === 'days8to14');
  const fleetCounts = record?.stations?.fleet || {};
  const machLive = fleet?.mach || null;
  const stationRows = useMemo(() => {
    const list = (latest?.rows || []).map((r) => {
      const parts = String(r.name || '').replace(/[\s,;]+$/, '').split(',');
      const city = (parts.length > 1 ? parts[parts.length - 1] : parts[0] || '').trim();
      const order = ['Islamabad', 'Rawalpindi', 'Karachi', 'Lahore'];
      const i = order.indexOf(city);
      return { ...r, place: `${i < 0 ? `9 ${city}` : `${i} ${city}`} ${String(r.no ?? 999).padStart(3, '0')}` };
    });
    const shown = showAllStations ? list : list.filter((r) => r.usable);
    const measured = ['tempC', 'rhPct', 'dewC', 'windKmh', 'precipRateMm'];
    shown.sort((a, b) => {
      const x = measured.includes(sortKey) && !a.usable ? null : a[sortKey];
      const y = measured.includes(sortKey) && !b.usable ? null : b[sortKey];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * sortDir;
      return String(x).localeCompare(String(y)) * sortDir;
    });
    return { all: list.length, shown };
  }, [latest, showAllStations, sortKey, sortDir]);

  const dtKey = horizon === '2030' ? 'dt30' : 'dt50';
  const dpKey = horizon === '2030' ? 'dp30' : 'dp50';
  const tKey = horizon === '2030' ? 't30' : 't50';
  const pKey = horizon === '2030' ? 'p30' : 'p50';
  const baseT = spread(rows, 't0');
  const farT = spread(rows, tKey);
  const dT = spread(rows, dtKey);
  const baseP = spread(rows, 'p0');
  const farP = spread(rows, pKey);
  const dP = spread(rows, dpKey);
  const adj = outlookV?.adjustment;
  const subs = {
    temp: 'The corrected hourly forecast at this place, the same curve as the Overview. Shaded: its tested 90 % range, when the hour carries one. Grey: the hours already past.',
    feels: 'Feels-like temperature each hour at this place.',
    utci: 'UTCI in shade, hour by hour. Bands: the heat levels from the level register.',
    rain: 'Forecast rain each hour at this place (bars, left axis, mm) and the chance of rain in the hour (dashed, right axis, %).',
    wind: 'Wind at 10 m (solid) and gusts (dashed).',
    rh: 'Relative humidity at 2 m.',
    aqi: 'No hourly air-quality series is fetched for this place.',
  };

  if (!place) return <section className="fc-page"><p className="fc-note">Choose a place on Overview, or pick a city in the bar above.</p></section>;

  return (
    <section className={`fc-page${clean ? ' fc-clean' : ''}`}>
      <div className="fc-head">
        <div className="fc-mark" aria-hidden="true">☁</div>
        <h2>Forecast &amp; Outlook</h2>
        <span className="fc-sp" />
        <button type="button" className="fc-btn" onClick={() => setCompare(true)}>Compare</button>
        <button type="button" className="fc-btn" onClick={copyBrief}>{copied === 'ok' ? 'Copied' : copied === 'fail' ? 'Copy failed' : 'Copy comfort brief'}</button>
      </div>
      <nav className="fc-jump" aria-label="Forecast horizons">
        <span className="l">Jump to</span>
        {JUMPS.map(([id, label], i) => (
          <span key={id}>
            {i > 0 && <span className="ar"> › </span>}
            <button type="button" className={`fc-chip${jump === id ? ' on' : ''}`} onClick={() => go(id, id === 'w26' ? 'weeks' : id === 'season' ? 'season' : id === 'd15' ? 'd15' : null)}>{label}</button>
          </span>
        ))}
        <span className="fc-sp" />
        <button type="button" className="fc-btn" disabled={report?.busy} onClick={situation}>{report?.busy ? 'Making the report…' : 'Situation report'}</button>
        {report?.ok && <a href={report.html} target="_blank" rel="noreferrer">Open {report.id}</a>}
        {report && !report.ok && !report.busy && <span className="fc-note">{report.why || report.error || 'The report could not be made.'}</span>}
      </nav>

      {!bundle && <p className="fc-wait">Reading {place.name}…</p>}
      {bundle?.error && <p className="fc-wait">The forecast for {place.name} did not arrive. <button type="button" className="fc-btn" onClick={() => window.location.reload()}>Try again</button></p>}
      {bundle?.ok && (
        <>
          {banner && (
            <div className="fc-banner">
              <span><b>Live city weather · on-demand district context.</b> City conditions and hourly forecasts are the model forecast at each place, corrected by live observations where one is in reach. District AQI and weather context load only when requested; national screening scores remain uncalibrated decision support, not warnings.</span>
              <button type="button" className="fc-btn" onClick={() => setBanner(false)}>Dismiss</button>
            </div>
          )}
          <div className="fc-sec" id="fc72"><b>NEXT 72 HOURS</b><span>hour by hour, model agreement and what to do</span></div>
          <article className="fc-card">
            <div className="fc-72-head">
              <div>
                <h3>Next 72 hours · {placeName}</h3>
                <p className="fc-sub">{subs[tab]}</p>
              </div>
              <button type="button" className="fc-how" aria-expanded={mmOpen} onClick={() => setMmOpen((on) => {
                const next = !on;
                if (next) window.setTimeout(() => {
                  const node = document.getElementById('fcmm');
                  if (!node) return;
                  const scroller = scrollParent(node);
                  const top = Math.max(0, node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 124);
                  scroller.scrollTo({ top, behavior: 'smooth' });
                }, 40);
                return next;
              })}>
                {mmOpen ? 'Hide model comparison' : 'Compare the models'}
              </button>
            </div>
            <div className="fc-tabs" role="tablist">
              {TABS.map(([id, label]) => <button key={id} type="button" role="tab" className={`fc-chip${tab === id ? ' on' : ''}`} aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
            </div>
            <div className="fc-hero">
              <div className="fc-chart-stage">
                <HourChart hours={hours} nowTime={bundle.now?.time} tab={tab} bands={heatBands} />
              </div>
              <aside className="fc-plan">
                <h4>What to plan for</h4>
                {plan.map(([color, title, text]) => (
                  <div className="fc-row" key={title}><i style={{ background: color }} /><div><b>{title}</b><p>{text}</p></div></div>
                ))}
              </aside>
            </div>
            <div className="fc-kpis">
              <Kpi label="High, next 3 days" value={summary?.high ? `${f1(summary.high.c)} °C` : '—'} note={summary?.high ? `${(summary.high.dates?.length > 1 ? summary.high.dates.map(dayName).join(' and ') : dayName(summary.high.date))} · day maximum` : 'not complete'} />
              <Kpi label="Low, next 3 days" value={summary?.low ? `${f1(summary.low.c)} °C` : '—'} note={summary?.low ? `${dayName(summary.low.date)} · night minimum` : 'not complete'} />
              <Kpi label="Rain, next 3 days" value={summary?.rain?.mm != null ? `${f1(summary.rain.mm)} mm` : '—'} note={summary?.rain?.mm != null ? summary.rain.days.map((d) => `${dayName(d.date)} ${f1(d.mm)}`).join(' · ') : 'a day total is not complete'} />
              <Kpi label="Peak gust" value={summary?.gust ? `${Math.round(summary.gust.kmh)} km/h` : '—'} note={summary?.gust ? dayName(summary.gust.date) : ''} />
            </div>
            <details className="fc-shadow">
              <summary>Shadow model test · ECMWF 9 km and WeatherNext 3 · operator only</summary>
              <div className="fc-tabs" role="tablist" aria-label="Models under shadow test">
                <button type="button" className={`fc-chip${shadow === 'ec' ? ' on' : ''}`} onClick={() => setShadow('ec')}>ECMWF 9 km</button>
                <button type="button" className={`fc-chip${shadow === 'wn' ? ' on' : ''}`} onClick={() => setShadow('wn')}>WeatherNext 3</button>
              </div>
              {shadow === 'ec' ? (
                <>
                  <p className="fc-score">{scoreLines.ec}</p>
                  <p className="fc-note">{ecmwfStatus(ecStatus)}</p>
                  <EcmwfChart served={hours} ecmwf={ecPoint} nowTime={bundle.now?.time} />
                </>
              ) : (
                <>
                  <p className="fc-score">{scoreLines.wn}</p>
                  <p className="fc-note">WeatherNext 3 has no point values for this place: the shadow is run and scored only at weather-station points in the plains and on the coast, and no per-place WeatherNext 3 hours are held on this server, so no line can be drawn beside the 72-hour forecast.</p>
                </>
              )}
            </details>
            <details>
              <summary>Show the hourly table</summary>
              <div className="fc-wrap">
                <table className="fc-table">
                  <thead><tr><th>Hour (PKT)</th><th>°C</th><th>UTCI</th><th>RH %</th><th>Wind</th><th>Gust</th><th>Rain mm</th><th>Rain %</th></tr></thead>
                  <tbody>
                    {windowOf(hours, bundle.now?.time).hours.slice(windowOf(hours, bundle.now?.time).now).map((h) => (
                      <tr key={h.time}><td>{when(h.time)}</td><td className={num(h.tempC) >= 35 ? 'hz hz-high' : ''}>{f1(h.tempC)}</td><td className={utciTone(h.utciShadeC) ? `hz hz-${utciTone(h.utciShadeC)}` : ''}>{f1(h.utciShadeC)}</td><td>{h.rh == null ? '—' : Math.round(h.rh)}</td><td>{h.windKmh == null ? '—' : Math.round(h.windKmh)}</td><td className={num(h.gustKmh) >= 40 ? 'hz hz-high' : ''}>{h.gustKmh ?? '—'}</td><td className={rainTone(h.rainMm) ? `hz hz-${rainTone(h.rainMm)}` : ''}>{f1(h.rainMm)}</td><td className={chanceTone(h.rainProb) ? `hz hz-${chanceTone(h.rainProb)}` : ''}>{h.rainProb ?? '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
            <div className="fc-tiers">
                <h4>Further ahead</h4>
                {!tiers && <p className="fc-note">The ensemble outlook tiers are not in this place record.</p>}
                {tiers && !tiers.ready && <p className="fc-note">Not available: {tiers.why || 'no ensemble outlook for this place'}.</p>}
                {tiers?.ready && (
                  <>
                    <div className="fc-ahead">
                      <div>
                        <p className="fc-note"><b>Days 4–7 · ranges</b> (10–90 % of the ensemble members) · accuracy: {t47?.accuracy || 'not measured'}</p>
                        <table className="fc-table">
                          <thead><tr><th>Day</th><th>High</th><th>Low</th><th>Rain</th></tr></thead>
                          <tbody>
                            {(t47?.days4to7 || []).map((d) => (
                              <tr key={d.date}><td>{dayName(d.date)}</td><td className={num(d.tmaxC?.p50) >= 35 ? 'hz hz-high' : ''}>{rangeOf(d.tmaxC, '°C')}</td><td className={num(d.tminC?.p50) <= 5 ? 'hz hz-cool' : ''}>{rangeOf(d.tminC, '°C')}</td><td className={rainTone(d.rainMm?.p50) ? `hz hz-${rainTone(d.rainMm?.p50)}` : ''}>{rangeOf(d.rainMm, 'mm')}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div>
                        <p className="fc-note"><b>Days 8–{t814?.days8to14?.days ? 7 + t814.days8to14.days : 14} · chances</b> {t814?.days8to14?.from ? `(${dayName(t814.days8to14.from)} to ${dayName(t814.days8to14.to)})` : ''} · accuracy: {t814?.accuracy || 'not measured'}</p>
                        {t814?.days8to14?.ready ? (
                          <ul>
                            <li>Hotter than normal {t814.days8to14.temp?.hotterPct} % · colder {t814.days8to14.temp?.colderPct} %</li>
                            <li>Wetter than the average week {t814.days8to14.rain?.wetterPct} % · drier {t814.days8to14.rain?.drierPct} %</li>
                            {t814.days8to14.rain?.heavyDayPct != null && <li>At least one day of 15.6 mm or more: {t814.days8to14.rain.heavyDayPct} %</li>}
                          </ul>
                        ) : <p className="fc-note">Not available: {t814?.days8to14?.why || ''}.</p>}
                        {t814?.days8to14?.shortNote && <p className="fc-note">Shown for {t814.days8to14.shortNote}.</p>}
                      </div>
                    </div>
                    <p className="fc-note fc-fine">{tiers.note}.</p>
                  </>
                )}
              </div>
          </article>
          <OpsBrief bundle={bundle} />
          {mmOpen && <MultiModel place={place} />}
          <div className="fc-sec" id="fc15"><b>NEXT 15 DAYS · WEEKS 1–6</b><span>ensemble range, multi-day events and the weeks ahead</span></div>
          <article className="fc-card fc-outlook">
            <div className="fc-outhead">
              <div>
                <div className="fc-kicker">{placeName}</div>
                <h3>Next 15 days, weeks and season</h3>
              </div>
              <div className="fc-tabs fc-outlook-tabs">
                {[['d15', '15 days'], ['weeks', 'Weeks 1–6'], ['season', 'Season'], ['air', 'Air & smog']].map(([id, label]) => (
                  <button key={id} type="button" className={`fc-chip${outlook === id ? ' on' : ''}`} onClick={() => { setOutlook(id); setJump(id === 'weeks' ? 'w26' : id === 'season' ? 'season' : 'd15'); }}>{label}</button>
                ))}
                <button type="button" className="fc-chip fc-chip-alt" onClick={() => setOutlookOpen(true)}>National view</button>
              </div>
            </div>
            {outlook === 'd15' && (
              <>
                <p className="fc-note">Global forecast model ensemble, {ensemble?.members || '—'} members. Band = 10th to 90th percentile, line = median. {ensemble?.verificationNote || ''}</p>
                <FanChart days={ensemble?.days || []} />
                <details>
                  <summary>Show the daily table</summary>
                  <div className="fc-wrap">
                    <table className="fc-table">
                      <thead><tr><th>Day</th><th>Max °C</th><th>Min °C</th><th>Rain mm</th><th>Gust km/h</th></tr></thead>
                      <tbody>
                        {(ensemble?.days || []).map((d) => (
                          <tr key={d.date}><td>{dayName(d.date)}</td><td className={num(d.tx?.[1]) >= 35 ? 'hz hz-high' : ''}>{d.tx ? `${f1(d.tx[1])} (${f1(d.tx[0])}–${f1(d.tx[2])})` : '—'}</td><td className={num(d.tn?.[1]) <= 5 ? 'hz hz-cool' : ''}>{d.tn ? `${f1(d.tn[1])} (${f1(d.tn[0])}–${f1(d.tn[2])})` : '—'}</td><td className={rainTone(d.pr?.[1]) ? `hz hz-${rainTone(d.pr?.[1])}` : ''}>{d.pr ? `${f1(d.pr[1])}` : '—'}</td><td className={num(d.gu?.[1]) >= 40 ? 'hz hz-high' : ''}>{d.gu ? f1(d.gu[1]) : '—'}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            )}
            {outlook === 'weeks' && <WeekTable weeks={seasonal?.subseasonal?.weeks || []} note={seasonal?.subseasonal?.model} />}
            {outlook === 'season' && <SeasonTable months={seasonal?.seasonal?.months || []} note={seasonal?.seasonal?.model} />}
            {outlook === 'air' && <AirTable days={smog?.days || []} note={smog?.stale ? smog.staleWhy : ''} />}
            {events && (
              <div className="fc-events-block">
                <div className="fc-events-head">
                  <div>
                    <div className="fc-kicker">Ensemble events</div>
                    <h3>Multi-day events · {events.window ? `${dayName(events.window[0])} to ${dayName(events.window[1])}` : 'window'}</h3>
                    <p className="fc-note">Each of the {events.members} members is one possible future. A chance of 40% means 20 of them contain the event. “Local” limits come from 1991–2020 global reanalysis for this tehsil and time of year.</p>
                  </div>
                  <div className="fc-events-kpis">
                    <div className="fc-events-kpi tone-hot"><span>Hottest 3 days</span><b>{events.peak3dTx ? `${events.peak3dTx[1]} °C` : '—'}</b><em>{events.peak3dTx ? `${events.peak3dTx[0]}–${events.peak3dTx[2]} °C` : 'mean max'}</em></div>
                    <div className="fc-events-kpi tone-wet"><span>Wettest 3 days</span><b>{events.max3dRain ? `${events.max3dRain[1]} mm` : '—'}</b><em>{events.max3dRain ? `wet case ${events.max3dRain[2]} mm` : 'ensemble median'}</em></div>
                  </div>
                </div>
                <div className="fc-events-wrap">
                  {(() => {
                    const rows = EV_ORDER.map((id) => events[id]).filter(Boolean);
                    const assessed = rows.filter((row) => row.p != null).length;
                    const why = rows.find((row) => row.why)?.why;
                    if (assessed > 0 || !why) return null;
                    return (
                      <div className="fc-events-banner" role="status">
                        <b>Chance and timing are not scored on this run</b>
                        <span>{why}</span>
                        <em>Usual chance still comes from 1991–2020 climate. Hottest / wettest 3-day KPIs above are separate member statistics.</em>
                      </div>
                    );
                  })()}
                  <div className="fc-events-list">
                    {EV_ORDER.map((id) => {
                      const row = events[id];
                      if (!row) return null;
                      const def = (events.definitions || []).find((d) => d.id === id);
                      const quiet = row.p == null || Number(row.p) === 0;
                      return (
                        <FragmentRows key={id} quiet={quiet} show={showEvents} kind={id} label={def?.label || id} rule={def?.rule} why={row.p == null ? row.why : ''} row={row}>
                          {id === 'heatSpell' && events.heatSpellClasses && Object.keys(HEAT_SUB).map((c) => {
                            const sc = events.heatSpellClasses[c];
                            if (!sc) return null;
                            const q = sc.p == null || Number(sc.p) === 0;
                            if (q && !showEvents) return null;
                            return (
                              <div key={c} className={`fc-ev-card fc-ev-subcard${q ? ' fc-z' : ''}`}>
                                <div className="fc-ev-main">
                                  <div className="fc-ev-copy">
                                    <b className="fc-ev-label">{HEAT_SUB[c].split(':')[0]}</b>
                                    {HEAT_SUB[c].includes(':') ? <span className="fc-meta">{HEAT_SUB[c].slice(HEAT_SUB[c].indexOf(':') + 1).trim()}</span> : null}
                                    {sc.p == null && sc.why ? <span className="fc-meta">{sc.why}</span> : null}
                                  </div>
                                </div>
                                <div className="fc-ev-metrics">
                                  <div className="fc-ev-metric">
                                    <span className="fc-ev-metric-k">Chance</span>
                                    {chanceCell(sc.p)}
                                  </div>
                                  <div className="fc-ev-metric">
                                    <span className="fc-ev-metric-k">Usual</span>
                                    <span className="fc-ev-empty">—</span>
                                  </div>
                                  <div className="fc-ev-metric fc-ev-metric-when">
                                    <span className="fc-ev-metric-k">Timing</span>
                                    <div className="fc-ev-timing">
                                      <span><i>Typical</i>{whenCell(sc.onset)}</span>
                                      <span><i>Earliest</i>{whenCell(sc.earliest)}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </FragmentRows>
                      );
                    })}
                  </div>
                </div>
                <div className="fc-events-foot">
                  {!showEvents && <p className="fc-note">Only events with a chance above 0% are shown. Timing stays blank when chance is 0% — there is no onset to name.</p>}
                  <button type="button" className="fc-btn" onClick={() => setShowEvents((v) => !v)}>{showEvents ? 'Hide events that are not expected' : 'Show all events, including the ones not expected'}</button>
                  {adj && <p className="fc-note fc-fine">{shiftNote(adj)} Chances are shares of members, not calibrated.</p>}
                </div>
              </div>
            )}
          </article>
          <BothSystems place={place} hours={hours} />

          <div className="fc-sec" id="fccm"><b>2030s AND 2050s</b><span>climate-change shift at this place</span></div>
          <article className="fc-card fc-climate-card">
            <div className="fc-climate-head">
              <div>
                <div className="fc-kicker">Long-term climate · climate models</div>
                <h3>2030s and 2050s climate stress</h3>
                <p className="fc-note">How the climate here shifts by the 2030s and 2050s against 1991–2010, from the climate models on one high-emission pathway. A projection for planning, not a forecast and not a design value.</p>
              </div>
              <div className="fc-tabs fc-climate-tools">
                <label>Planning horizon <select className="fc-select" value={horizon} onChange={(e) => setHorizon(e.target.value)}><option value="2030">2030s</option><option value="2050">2050s</option></select></label>
                <label>Variable <select className="fc-select" value={climVar} onChange={(e) => setClimVar(e.target.value)}><option value="tmax">Daily max temperature</option><option value="rain">Annual precipitation</option></select></label>
                <button type="button" className="fc-btn" onClick={() => { setCmip(null); getPointBundle({ lat: place.lat, lon: place.lon, parts: 'cmip6' }).then((body) => setCmip(body?.parts?.cmip6 || { error: true })).catch(() => setCmip({ error: true })); }}>Load CMIP6 deltas</button>
              </div>
            </div>
            {!cmip && <p className="fc-wait">Loading the climate models for this place…</p>}
            {cmip?.error && <p className="fc-note">The climate models did not answer for this place.</p>}
            {!!rows.length && (
              <div className="fc-climate">
                <div className="fc-climate-summary" aria-label="Climate summary">
                  {climVar === 'tmax' ? (
                    <>
                      <div className="fc-climate-stat"><span>Baseline</span><b>{baseT ? `${baseT.m.toFixed(1)} °C` : '—'}</b><em>1991–2010</em></div>
                      <div className="fc-climate-stat"><span>Horizon mean</span><b>{farT ? `${farT.m.toFixed(1)} °C` : '—'}</b><em>{horizon === '2030' ? '2030s' : '2050s'}</em></div>
                      <div className="fc-climate-stat accent"><span>Delta</span><b>{dT ? `${dT.m >= 0 ? '+' : ''}${dT.m.toFixed(1)} °C` : '—'}</b><em>model mean</em></div>
                      <div className="fc-climate-stat"><span>Model spread</span><b>{dT ? `${dT.lo.toFixed(1)} to ${dT.hi.toFixed(1)}` : '—'}</b><em>°C across {rows.length} models</em></div>
                    </>
                  ) : (
                    <>
                      <div className="fc-climate-stat"><span>Baseline</span><b>{baseP ? `${Math.round(baseP.m)} mm` : '—'}</b><em>1991–2010</em></div>
                      <div className="fc-climate-stat"><span>Horizon mean</span><b>{farP ? `${Math.round(farP.m)} mm` : '—'}</b><em>{horizon === '2030' ? '2030s' : '2050s'}</em></div>
                      <div className="fc-climate-stat accent"><span>Delta</span><b>{dP ? `${dP.m >= 0 ? '+' : ''}${dP.m.toFixed(0)} %` : '—'}</b><em>model mean</em></div>
                      <div className="fc-climate-stat"><span>Model spread</span><b>{dP ? `${dP.lo.toFixed(0)} to ${dP.hi.toFixed(0)}%` : '—'}</b><em>across {rows.length} models</em></div>
                    </>
                  )}
                </div>
                <p className="fc-note">The delta is a mean over models that disagree. Temperature {dT ? `${dT.m >= 0 ? '+' : ''}${dT.m.toFixed(1)} °C` : '—'}, spread {dT ? `${dT.lo.toFixed(1)} to ${dT.hi.toFixed(1)} °C` : '—'} across {rows.length} models. One high-emission pathway, not applied to any hazard or engineering score.</p>
                <h4>Model spread behind the change</h4>
                <div className="fc-climate-bars">
                  <HBars rows={rows} field={dtKey} tone="hot" title="Temperature change" />
                  <HBars rows={rows} field={dpKey} tone="wet" title="Precipitation change" />
                </div>
              </div>
            )}
            {cmip && !cmip.error && !rows.length && !cmip.pending && <p className="fc-note">{cmip.v?.basis || cmip.why || 'No model windows were returned for this place.'}</p>}
          </article>

          <article className="fc-card" id="fcin">
            <div className="fc-outhead">
              <div>
                <div className="fc-kicker">Forecast inputs at this place</div>
                <h3>Atmospheric and land-surface inputs · {placeName}</h3>
                <p className="fc-note">{inputs?.source || 'Model forecast'} · modelled input at this place · valid {bundle.now?.time || ''}</p>
              </div>
              <button type="button" className="fc-btn" onClick={refreshInputs}>Refresh inputs</button>
            </div>
            {!inputs && <p className="fc-wait">Loading the modelled inputs…</p>}
            <div className="fc-tiles">
              <Tile k="Pressure at mean sea level" v={msl == null ? '—' : `${Math.round(msl)} hPa`} s={surfaceP == null ? 'mean sea level · not an anomaly' : `surface ${Math.round(surfaceP)} hPa · not an anomaly`} />
              <Tile k="850 hPa temperature" v={t850 == null ? '—' : `${f1(t850)} °C`} s={w850 == null ? 'warm-air mass context · not an anomaly' : `850 hPa wind ${Math.round(w850)} km/h · not an anomaly`} />
              <Tile k="9–27 cm soil moisture" v={soil == null ? '—' : `${Math.round(soil * 100)}% v/v`} s="9–27 cm modelled layer · not a field measurement" />
              <Tile k="VPD and ET₀" v={vpd == null ? '—' : `${vpd.toFixed(2)} kPa`} s={et0 == null ? 'plant-atmosphere demand' : `ET₀ ${et0.toFixed(2)} mm/h`} />
              <Tile k="Shortwave radiation" v={sw == null ? '—' : `${Math.round(sw)} W/m²`} s={bundle.now?.cloudPct == null ? 'surface heat context' : `cloud cover ${Math.round(bundle.now.cloudPct)}%`} />
            </div>
            <p className="fc-note"><b>Interpretation:</b> these are live modelled inputs, not ground measurements. They support context. CMIP6 below remains usable as a direction screen; weather-forecast panels do not become 2050s forecasts.</p>
          </article>

          <article className="fc-card" id="fcobs">
            <div className="fc-outhead">
              <div>
                <h3>Observations · live network</h3>
                <p className="fc-note">Live observation database · Wunderground, WU API, Ecowitt, airport ASOS and Apple QM. A station counts as online when it has a reading in the last 24 hours. Only checked non‑Apple readings correct the served forecast.</p>
              </div>
              <span className="fc-note">{(machLive?.updatedAt || fleet?.lastAt) ? `Updated ${String(machLive?.updatedAt || fleet.lastAt).slice(0, 16).replace('T', ' ')} UTC` : ''}</span>
            </div>
            <div className="fc-obs-kpis">
              <Obs n={machLive?.live24 ?? fleetCounts.reportingNow ?? fleet?.reportingNow} l="Online" s="reading in the last 24 h on the network" />
              <Obs n={machLive?.offline24 ?? fleetCounts.offline} l="Offline" s="no reading in the last 24 h" />
              <Obs n={machLive?.total ?? fleet?.db?.stations ?? fleetCounts.total ?? fleet?.stations} l="Stations" s={`in the observation database · ${machLive?.appleLive ?? '—'} Apple QM live`} />
              <Obs n={fleet?.reportingNow ?? fleetCounts.reportingNow} l="Checked" s="passed NIGRAAN checks · used for the forecast" />
              <Obs n={machLive ? machLive.byProvider?.wunderground?.live24 ?? 0 : '—'} l="Wunderground" s={machLive ? `${machLive.byProvider?.wunderground?.total ?? 0} registered` : 'live network'} />
              <Obs n={machLive ? (machLive.byProvider?.wu_api?.live24 ?? 0) + (machLive.byProvider?.ecowitt?.live24 ?? 0) : '—'} l="WU API + Ecowitt" s={machLive ? `${(machLive.byProvider?.wu_api?.total ?? 0) + (machLive.byProvider?.ecowitt?.total ?? 0)} registered` : 'live network'} />
              <Obs n={machLive ? machLive.byProvider?.airport_asos?.live24 ?? 0 : '—'} l="Airports" s={machLive ? `${machLive.byProvider?.airport_asos?.total ?? 0} ASOS` : 'live network'} />
              <Obs n={pairs?.pairs} l="Pairs in the lake" s="station-hours this session" />
            </div>
            <section className="fc-fleet-now">
              <h4>Fleet against the forecast, now</h4>
              <p className="fc-note">Forecast minus fleet reading at the reading hour, usable stations only. A negative bias on a sunny afternoon is partly the unshielded sensor, not the model.</p>
              {pairs?.now ? (
                <>
                  <div className="fc-pair">
                    <div><b>{pairs.now.n}</b><span>stations paired</span></div>
                    <div><b>{signed(pairs.now.biasRaw)}</b><span>raw bias °C</span></div>
                    <div><b>{signed(pairs.now.biasServed)}</b><span>served bias °C</span></div>
                    <div><b>{f1(pairs.now.maeRaw)}</b><span>raw MAE °C</span></div>
                    <div><b>{f1(pairs.now.maeServed)}</b><span>served MAE °C</span></div>
                  </div>
                  <div className="fc-cities">{Object.keys(pairs.now.byCity || {}).sort().map((city) => <span key={city}>{city} · {signed(pairs.now.byCity[city].biasServed)} ({pairs.now.byCity[city].n})</span>)}</div>
                </>
              ) : <p className="fc-note">No pairs yet.</p>}
            </section>
            <section className="fc-stations">
              <div className="fc-outhead">
                <h4>Stations</h4>
                <button type="button" className="fc-btn" onClick={() => setShowAllStations((v) => !v)}>{showAllStations ? `Show usable stations only (${(latest?.rows || []).filter((r) => r.usable).length})` : `Show all ${stationRows.all || machLive?.total || 108} polled stations`}</button>
              </div>
              <div className="fc-wrap">
                <table className="fc-table">
                  <thead>
                    <tr>{[['no', 'No.'], ['place', 'Station'], ['ageMin', 'Last reading'], ['tempC', 'T °C'], ['rhPct', 'RH %'], ['dewC', 'Dew point °C'], ['windKmh', 'Wind km/h'], ['precipRateMm', 'Rain mm/h'], ['status', 'Status']].map(([k, label]) => (
                      <th key={k}><button type="button" className={`fc-sort${sortKey === k ? ' on' : ''}`} aria-pressed={sortKey === k} onClick={() => { if (sortKey === k) setSortDir((d) => -d); else { setSortKey(k); setSortDir(k === 'place' || k === 'status' ? 1 : -1); } }}>{label}{sortKey === k ? (sortDir < 0 ? ' ↓' : ' ↑') : ''}</button></th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {stationRows.shown.map((r) => (
                      <tr key={r.key || r.no}>
                        <td>{r.no}</td>
                        <td>{String(r.name || '').replace(/[\s,;]+$/, '')}</td>
                        <td>{r.ageMin == null ? '—' : `${r.ageMin < 60 ? `${Math.round(r.ageMin)} min` : `${Math.round(r.ageMin / 60)} h`} ago`}</td>
                        <td>{r.usable ? f1(r.tempC) : '—'}</td>
                        <td>{r.usable && r.rhPct != null ? Math.round(r.rhPct) : '—'}</td>
                        <td>{r.usable ? f1(r.dewC) : '—'}</td>
                        <td>{r.usable && r.windKmh != null ? Math.round(r.windKmh) : '—'}</td>
                        <td>{r.usable ? f1(r.precipRateMm) : '—'}</td>
                        <td className={`fc-flag ${r.status === 'checked' && r.usable ? 'ok' : r.status === 'not-yet-checked' ? 'warn' : 'dead'}`}>{stationWord(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h4>What the served temperature stands on</h4>
              <p className="fc-note"><b>Height</b> · each tehsil’s temperature is served at its population-weighted settlement height, not at the model grid height.</p>
              <p className="fc-note"><b>This fleet</b> · the live check: {pairs?.now ? `${pairs.now.n} weather stations paired with the forecast at the reading hour; served error ${f1(pairs.now.maeServed)} °C (raw ${f1(pairs.now.maeRaw)} °C).` : 'Observation pairs appear after the next poll.'}</p>
            </section>
          </article>
          <div className="fc-foot">
            <span>NIGRAAN {health?.serviceVersion || ''}{health?.service ? ` · ${health.service}` : ''}</span>
            <span className="fc-foot-actions">
              {clean && <span className="fc-note">Method notes are hidden.</span>}
              <button type="button" className={`fc-btn${clean ? ' on' : ''}`} aria-pressed={clean} onClick={() => setClean((v) => !v)}>{clean ? 'Full detail' : 'Clean view'}</button>
            </span>
          </div>
        </>
      )}

      {compare && (
        <div className="fc-modal" onClick={() => setCompare(false)}>
          <div className="cmp" role="dialog" aria-label="City comfort comparison" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="cmp-x" aria-label="Close" onClick={() => setCompare(false)}>×</button>
            <h3>City comfort comparison <button type="button" className="cmp-i" aria-expanded={cmpInfo} title="How to read this comparison" onClick={() => setCmpInfo((v) => !v)}>i</button></h3>
            <p className="cmp-sub">Side-by-side human-comfort and air-quality readout · live model series when the backend answers</p>
            {cmpInfo && <p className="cmp-sub">Each column is the served forecast at that place: feels-like and UTCI for the current hour, today’s heat level from the issued run, and the modelled air-quality index. It is not a station observation.</p>}
            <div className="cmp-pick">
              <select aria-label="First place" value={cmpA} onChange={(e) => setCmpA(e.target.value)}>{cmpOptions.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}</select>
              <select aria-label="Second place" value={cmpB} onChange={(e) => setCmpB(e.target.value)}>{cmpOptions.map((o) => <option key={`b${o.key}`} value={o.key}>{o.name}</option>)}</select>
            </div>
            <div className="cmp-grid">
              <ComfortCard opt={cmpOptions.find((o) => o.key === cmpA)} card={cmpCards[cmpA]} />
              <ComfortCard opt={cmpOptions.find((o) => o.key === cmpB)} card={cmpCards[cmpB]} />
            </div>
          </div>
        </div>
      )}
      {outlookOpen && <OutlookDialog place={place} onClose={() => setOutlookOpen(false)} />}
    </section>
  );
}

function Kpi({ label, value, note }) {
  return <div className="fc-kpi"><span>{label}</span><b>{value}</b><em>{note}</em></div>;
}
function Tile({ k, v, s }) {
  return <div className="fc-tile"><span>{k}</span><b>{v}</b><em>{s}</em></div>;
}
function Obs({ n, l, s }) {
  return <div className="fc-obs-kpi"><b>{n ?? '—'}</b><span>{l} · {s}</span></div>;
}
function rangeOf(r, unit) {
  if (!r || r.p10 == null || r.p90 == null) return '—';
  return `${f1(r.p10)}–${f1(r.p90)} ${unit}`;
}
function signed(v) {
  const n = num(v);
  if (n == null) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}`;
}
function stationWord(r) {
  if (r.status === 'site-problem') return 'Site problem, not used';
  if (r.status === 'silent') return 'Silent';
  if (r.status === 'not-yet-checked') return 'Not yet checked';
  if (r.status === 'checked' && r.usable) return 'Checked';
  if (r.status === 'checked') return 'Checked · not used';
  return r.status || '—';
}
function shiftNote(A) {
  const bits = [];
  [['tx', 'daily max'], ['tn', 'daily min']].forEach(([k, name]) => {
    const x = A[k];
    if (!x) return;
    const sh = x.appliedShift != null ? x.appliedShift : x.bias;
    bits.push(x.applied ? `${name} shifted ${sh > 0 ? '−' : '+'}${Math.abs(sh).toFixed(1)} °C (test-month error ${x.maeRaw} → ${x.maeAdjusted} °C)` : `${name} not shifted`);
  });
  return bits.length ? `Temperatures here: ${bits.join(', ')}.` : '';
}
function ecmwfStatus(s) {
  if (!s) return 'ECMWF 9 km status: not available from this server.';
  const runs = Array.isArray(s.runs) ? s.runs : [];
  const L = runs.find((r) => r && r.run === s.latest);
  if (!L) return 'No ECMWF 9 km run fetched yet.';
  return `ECMWF 9 km: last run ${L.run} · reaches +${L.maxStep || 0} h · serving ${s.serve?.on ? 'ON' : 'off (test only)'}.`;
}
function EcmwfChart({ served, ecmwf, nowTime }) {
  if (!ecmwf) return <p className="fc-note">Reading the ECMWF 9 km hours at this place…</p>;
  if (!ecmwf.ok) return <p className="fc-note">{ecmwf.error || 'The ECMWF 9 km point did not answer.'}</p>;
  const by = {};
  (ecmwf.time || []).forEach((t, i) => {
    const key = new Date(Date.parse(t.endsWith('Z') ? t : `${t}Z`) + 5 * 3600e3).toISOString().slice(0, 13);
    by[key] = { t: ecmwf.t2m?.[i], lead: ecmwf.lead?.[i] };
  });
  const rows = (served || []).filter((h) => String(h.time) >= String(nowTime || '').slice(0, 13)).slice(0, 72).map((h) => ({ k: String(h.time).slice(0, 13), s: num(h.tempC), e: num(by[String(h.time).slice(0, 13)]?.t) }));
  const both = rows.filter((r) => r.e != null && r.s != null);
  if (!both.length) return <p className="fc-note">The latest ECMWF 9 km run does not reach the next 72 hours of this forecast.</p>;
  const W = 880; const H = 130; const L = 28;
  const vals = both.flatMap((r) => [r.s, r.e]);
  const mn = Math.min(...vals) - 1; const mx = Math.max(...vals) + 1;
  const X = (i) => L + ((W - L - 8) * i) / Math.max(1, both.length - 1);
  const Y = (v) => 10 + (1 - (v - mn) / (mx - mn)) * (H - 24);
  const path = (k) => both.map((r, i) => `${i ? 'L' : 'M'}${X(i)} ${Y(r[k])}`).join(' ');
  const mae = both.reduce((s, r) => s + Math.abs(r.s - r.e), 0) / both.length;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Served forecast and ECMWF 9 km">
        <path d={path('s')} fill="none" stroke="#154A4E" strokeWidth="2" />
        <path d={path('e')} fill="none" stroke="#d97706" strokeWidth="2" />
      </svg>
      <p className="fc-note">Navy is the served forecast, amber is ECMWF 9 km. Hours compared: {both.length}. Mean difference {mae.toFixed(1)} °C. Test only: these values are not served. {ecmwf.credit || ''}</p>
    </>
  );
}
function scrollParent(node) {
  let el = node.parentElement;
  while (el) {
    const style = getComputedStyle(el);
    if (/(auto|scroll|overlay)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 8) return el;
    el = el.parentElement;
  }
  const root = document.scrollingElement || document.documentElement;
  if (document.body && document.body.scrollHeight > document.body.clientHeight + 8) return document.body;
  return root;
}
function WeekTable({ weeks, note }) {
  if (!weeks.length) return <p className="fc-note">No weeks were served for this place.</p>;
  return (
    <div className="fc-compact-data">
      <p className="fc-note">{note || 'Weeks ahead, departure from the normal for this time of year.'}</p>
      <div className="fc-compact-scroll">
        <table className="fc-table fc-table-compact"><thead><tr><th>Week</th><th>Temperature vs normal</th><th>Rain vs normal</th><th>Signal</th></tr></thead><tbody>
          {weeks.map((w) => {
            const warm = num(w.tAnom);
            const wet = num(w.pAnom);
            const wetTone = wet == null ? '' : wet >= 10 ? 'high' : wet >= 0.1 ? 'rain' : wet <= -5 ? 'mid' : '';
            const signals = Object.entries(w.signal || {}).filter(([, on]) => on).map(([k]) => k);
            return <tr key={w.start}><td>Week of {w.start}</td><td className={warm != null && Math.abs(warm) >= 1.5 ? `hz hz-${warm > 0 ? 'high' : 'cool'}` : ''}>{signed(w.tAnom)} °C</td><td className={wetTone ? `hz hz-${wetTone}` : ''}>{signed(w.pAnom)} mm</td><td>{signals.length ? signals.map((name) => { const tone = signalTone(name); return tone ? <span key={name} className={`hz hz-${tone} hz-chip`}>{name}</span> : <span key={name}>{name}</span>; }) : <span className="hz hz-ok hz-chip">near normal</span>}</td></tr>;
          })}
        </tbody></table>
      </div>
    </div>
  );
}
function SeasonTable({ months, note }) {
  if (!months.length) return <p className="fc-note">No seasonal months were served.</p>;
  return (
    <div className="fc-compact-data">
      <p className="fc-note">{note || 'The next months against the normal for this place.'}</p>
      <div className="fc-compact-scroll">
        <table className="fc-table fc-table-compact"><thead><tr><th>Month</th><th>Mean °C</th><th>Vs normal</th><th>Rain mm</th><th>Rain vs normal</th></tr></thead><tbody>
          {months.map((m) => {
            const warm = num(m.tAnom);
            const wet = num(m.pAnom);
            return <tr key={m.month}><td>{m.month}</td><td>{f1(m.tMean)}</td><td className={warm != null && Math.abs(warm) >= 1 ? `hz hz-${warm > 0 ? 'high' : 'cool'}` : ''}>{signed(m.tAnom)} °C</td><td className={rainTone(m.pMean) ? `hz hz-${rainTone(m.pMean)}` : ''}>{f1(m.pMean)}</td><td className={wet != null && Math.abs(wet) >= 10 ? `hz hz-${wet > 0 ? 'rain' : 'mid'}` : ''}>{signed(m.pAnom)} mm</td></tr>;
          })}
        </tbody></table>
      </div>
    </div>
  );
}
function AirTable({ days, note }) {
  if (!days.length) return <p className="fc-note">No air-quality days were served for this tehsil.</p>;
  return (
    <div className="fc-compact-data">
      <p className="fc-note">{note}</p>
      <div className="fc-compact-scroll">
        <table className="fc-table fc-table-compact"><thead><tr><th>Day</th><th>AQI</th><th>Class</th><th>PM2.5</th></tr></thead><tbody>
          {days.map((d) => {
            const tone = airTone(d.aqiCategory);
            return <tr key={d.date}><td>{dayName(d.date)}</td><td className={tone ? `hz hz-${tone}` : ''}>{d.aqi == null ? '—' : Math.round(d.aqi)}</td><td>{tone ? <span className={`hz hz-${tone} hz-chip`}>{d.aqiCategory}</span> : (d.aqiCategory || '—')}</td><td className={num(d.pm25) >= 35 ? 'hz hz-high' : ''}>{d.pm25 == null ? '—' : f1(d.pm25)}</td></tr>;
          })}
        </tbody></table>
      </div>
    </div>
  );
}
function eventTone(kind, label) {
  return /heat|warm|coastal/i.test(kind || label) ? 'hot'
    : /rain|wet|snow/i.test(kind || label) ? 'wet'
      : /cold|frost/i.test(kind || label) ? 'cold' : 'neutral';
}
function toneLabel(tone) {
  return ({ hot: 'Heat', wet: 'Wet', cold: 'Cold', neutral: 'Event' })[tone] || 'Event';
}
function chanceCell(p, ordinary, naLabel) {
  if (p == null) {
    if (naLabel) return <span className="fc-ev-status is-na">{naLabel}</span>;
    return <span className={`fc-ev-status ${ordinary ? 'is-ok' : 'is-quiet'}`}>{ordinary ? 'ordinary' : 'not screened'}</span>;
  }
  const n = Number(p);
  const level = n >= 60 ? 'hi' : n >= 25 ? 'mid' : n > 0 ? 'lo' : 'zero';
  return (
    <div className={`fc-ev-chance-wrap lv-${level}`}>
      <b className="fc-ev-chance-num">{n}<span>%</span></b>
      <span className="fc-ev-chance-bar" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, n))}%` }} /></span>
      {n === 0 ? <span className="fc-ev-chance-note">not expected</span> : null}
    </div>
  );
}
function climCell(climP) {
  if (climP == null) return <span className="fc-ev-empty">—</span>;
  return <span className="fc-ev-clim"><b>{climP}</b><span>%</span></span>;
}
function whenCell(time, { noneLabel } = {}) {
  if (!time) return <span className="fc-ev-empty">{noneLabel || '—'}</span>;
  return <span className="fc-ev-when">{dayName(time)}</span>;
}
function eventNaReason(kind, row) {
  if (row?.p != null || row?.why) return null;
  if (kind === 'rainOnSnow') return 'only above 1,500 m';
  if (kind === 'coastalHeat') return 'coastal places only';
  if (kind === 'frostSpell') return 'only below 2,000 m';
  return null;
}
function FragmentRows({ quiet, show, kind, label, rule, why, row, children }) {
  const na = eventNaReason(kind, row);
  const isQuiet = quiet || !!na;
  if (isQuiet && !show) return null;
  const tone = eventTone(kind, label);
  const zero = row?.p != null && Number(row.p) === 0;
  return (
    <>
      <article className={`fc-ev-card tone-${tone}${isQuiet ? ' fc-z' : ''}`}>
        <div className="fc-ev-main">
          <span className={`fc-ev-dot tone-${tone}`} aria-hidden="true" />
          <div className="fc-ev-copy">
            <div className="fc-ev-titleline">
              <em className={`fc-ev-kind tone-${tone}`}>{toneLabel(tone)}</em>
              <b className="fc-ev-label">{label}</b>
            </div>
            {rule ? <span className="fc-meta">{rule}</span> : null}
            {why ? <span className="fc-meta">{why}</span> : null}
          </div>
        </div>
        <div className="fc-ev-metrics">
          <div className="fc-ev-metric">
            <span className="fc-ev-metric-k">Chance</span>
            {chanceCell(row.p, row.ordinary, na)}
          </div>
          <div className="fc-ev-metric">
            <span className="fc-ev-metric-k">Usual</span>
            {climCell(row.climP)}
          </div>
          <div className="fc-ev-metric fc-ev-metric-when">
            <span className="fc-ev-metric-k">Timing</span>
            <div className="fc-ev-timing">
              <span><i>Typical</i>{whenCell(row.onset, { noneLabel: zero || na ? 'none' : '—' })}</span>
              <span><i>Earliest</i>{whenCell(row.earliest, { noneLabel: zero || na ? 'none' : '—' })}</span>
            </div>
          </div>
        </div>
      </article>
      {children}
    </>
  );
}
function wetBulb(temp, rh) {
  if (temp == null || rh == null) return null;
  const tw = temp * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) + Math.atan(temp + rh) - Math.atan(rh - 1.676331) + 0.00391838 * (rh ** 1.5) * Math.atan(0.023101 * rh) - 4.686035;
  return Number.isFinite(tw) ? tw : null;
}
function aqiBand(aqi) {
  if (aqi == null) return { label: 'not retrieved', color: '#B9BEC4' };
  if (aqi <= 50) return { label: 'Good', color: '#059669' };
  if (aqi <= 100) return { label: 'Moderate', color: '#E6B655' };
  if (aqi <= 150) return { label: 'Unhealthy for sensitive', color: '#F08A24' };
  if (aqi <= 200) return { label: 'Unhealthy', color: '#982122' };
  if (aqi <= 300) return { label: 'Very unhealthy', color: '#7c3aed' };
  return { label: 'Hazardous', color: '#7e0023' };
}
function uvWord(uv) {
  if (uv == null) return 'not retrieved';
  if (uv <= 2) return 'Low';
  if (uv <= 5) return 'Moderate';
  if (uv <= 7) return 'High';
  if (uv <= 10) return 'Very high';
  return 'Extreme';
}
function heatInk(word) {
  return { Normal: '#1a7f4b', Low: '#3d8f4a', Moderate: '#a16207', High: '#c2410c', Severe: '#982122' }[word] || '#154a4e';
}
function pktClock(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Date(t + 5 * 3600e3).toISOString().slice(11, 16);
}
function bestWindow(hours, nowTime) {
  const list = (hours || []).filter((h) => String(h.time) >= String(nowTime || '')).slice(0, 36);
  const ok = (h) => (h.utciClass ? /no thermal stress/i.test(h.utciClass) : (num(h.utciShadeC) != null && h.utciShadeC >= 9 && h.utciShadeC < 26));
  let best = null;
  let cur = null;
  list.forEach((h, i) => {
    if (!ok(h)) { cur = null; return; }
    cur = cur ? { a: cur.a, b: i } : { a: i, b: i };
    if (!best || cur.b - cur.a > best.b - best.a) best = { ...cur };
  });
  if (!best) return 'No window';
  const start = String(list[best.a].time).slice(11, 16);
  const end = String(list[best.b].time).slice(11, 16);
  return start === end ? start : `${start} to ${end}`;
}
function comfortFrom(bundle) {
  const now = bundle?.now || {};
  const feels = num(now.feelsC);
  const utci = num(now.utciShadeC);
  const rh = num(now.rh);
  const temp = num(now.tempC);
  const day = bundle?.parts?.smog?.v?.days?.[0] || {};
  const aqi = num(day.aqi);
  const band = aqiBand(aqi);
  const score = utci == null ? null : Math.max(0, Math.min(100, Math.round(utci > 26 ? (100 * (46 - utci)) / 20 : utci < 9 ? (100 * (utci + 13)) / 22 : 100)));
  const heat = bundle?.shown?.heatToday;
  const heatWord = typeof heat === 'string' ? heat : (heat?.word || heat?.label || '');
  return {
    feels,
    utci,
    klass: now.utciClass ? now.utciClass.charAt(0).toUpperCase() + now.utciClass.slice(1) : '',
    hour: String(now.time || '').slice(11, 16),
    dew: num(now.dewC),
    wb: wetBulb(temp, rh),
    rh,
    heatWord,
    tehsil: bundle?.place?.tehsil || '',
    aqi,
    band,
    uv: num(now.uv),
    comfort: score == null ? '—' : (aqi != null && aqi > 100 ? `Limited by air quality (AQI ${Math.round(aqi)}, ${band.label}) · thermal ${score}/100` : `${score}/100 thermal${aqi != null ? ` · air ${band.label}` : ''}`),
    clock: pktClock(bundle?.issuedAt),
    window: bestWindow(bundle?.hours, now.time),
  };
}
const MM_DIAG = [
  ['ecmwf_aifs025_single', 'AI weather model'],
  ['ukmo_seamless', 'UKMO'],
  ['ecmwf_ifs025', 'global forecast model'],
  ['knmi_seamless', 'HARMONIE'],
  ['jma_seamless', 'JMA'],
  ['icon_seamless', 'ICON'],
  ['gem_seamless', 'GEM'],
  ['ncep_aigfs025', 'AIGFS'],
  ['gfs_seamless', 'GFS'],
  ['meteofrance_seamless', 'ARPEGE'],
];
function n1(value) {
  const n = num(value);
  return n == null ? '—' : n.toFixed(1);
}
function pctShare(value) {
  const n = num(value);
  return n == null ? '—' : `${Math.round(n <= 1 ? n * 100 : n)}%`;
}
function systemMedian(systems, pattern) {
  const hit = Object.entries(systems || {}).find(([key, row]) => pattern.test(key) && row);
  return hit ? num(hit[1].p50) : null;
}
const MODEL_KEYS = ['ecmwf_ifs025', 'ecmwf_aifs025_single', 'gfs_seamless', 'ncep_aigfs025', 'icon_seamless', 'meteofrance_seamless', 'ukmo_seamless', 'jma_seamless', 'gem_seamless', 'knmi_seamless'];
const BAND_INK = {
  temp: ['#0e6b66', '#0e6b66'],
  feels: ['#c45a1a', '#c45a1a'],
  wind: ['#5b6f86', '#5b6f86'],
  precip: ['#1a6f96', '#1a6f96'],
};
function quantile(sorted, p) {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
function modelBand(body, field) {
  const hourly = body?.hourly;
  if (!hourly || !Array.isArray(hourly.time) || body.error || body.__status >= 400) return null;
  const cols = Object.keys(hourly).filter((key) => key === field || key.startsWith(`${field}_`));
  if (!cols.length) return null;
  const now = Date.now();
  let start = 0;
  let best = Infinity;
  hourly.time.forEach((stamp, index) => {
    const ms = Date.parse(stamp);
    if (!Number.isFinite(ms)) return;
    const diff = Math.abs(ms - now);
    if (ms <= now + 1800000 && diff < best) { best = diff; start = index; }
  });
  const rows = [];
  for (let i = start; i < hourly.time.length && rows.length < 72; i += 1) {
    const vals = cols.map((key) => num(hourly[key]?.[i])).filter((value) => value != null).sort((a, b) => a - b);
    if (vals.length < 2) continue;
    rows.push({ p10: quantile(vals, 0.1), p50: quantile(vals, 0.5), p90: quantile(vals, 0.9) });
  }
  return rows.length >= 2 ? rows : null;
}
function hazardTone(word) {
  const text = String(word || '').toLowerCase();
  if (!text || text === '—' || text === '-') return '';
  if (/severe|extreme|danger|hazardous|very unhealthy/.test(text)) return 'bad';
  if (/high|strong|unhealthy|poor|hot/.test(text)) return 'high';
  if (/moderate|caution|watch|sensitive/.test(text)) return 'mid';
  if (/normal|low|minimal|no thermal|none|good|fair|checked/.test(text)) return 'ok';
  return '';
}
function utciTone(value) {
  const n = num(value);
  if (n == null || (n >= 9 && n < 26)) return '';
  if (n >= 38 || n <= -13) return 'bad';
  if (n >= 32 || n < 0) return 'high';
  return 'mid';
}
function rainTone(value) {
  const n = num(value);
  if (n == null || n < 0.1) return '';
  return n >= 10 ? 'high' : 'rain';
}
function airTone(word) {
  const text = String(word || '').toLowerCase();
  if (/hazard|very unhealthy|severe/.test(text)) return 'bad';
  if (/unhealthy|poor/.test(text)) return 'high';
  if (/moderate|sensitive/.test(text)) return 'mid';
  if (/good|satisfactory/.test(text)) return 'ok';
  return '';
}
function chanceTone(value) {
  let n = num(value);
  if (n == null || n <= 0) return '';
  if (n <= 1) n *= 100;
  if (n >= 50) return 'bad';
  if (n >= 20) return 'high';
  return 'mid';
}
function signalTone(name) {
  const text = String(name || '').toLowerCase();
  if (/warm|hot/.test(text)) return 'high';
  if (/cool|cold/.test(text)) return 'cool';
  if (/wet|rain/.test(text)) return 'rain';
  if (/dry/.test(text)) return 'mid';
  return '';
}
function MultiModel({ place }) {
  const [pool, setPool] = useState(null);
  const [variable, setVariable] = useState('temp');
  const [lead, setLead] = useState(48);
  const [extra, setExtra] = useState(null);
  const [diag, setDiag] = useState(null);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!place || (variable !== 'feels' && variable !== 'precip')) return undefined;
    let live = true;
    setExtra(null);
    const field = variable === 'feels' ? 'apparent_temperature' : 'precipitation';
    const elev = place.elevM != null ? `&elevation=${Math.round(place.elevM)}` : '';
    getJson(`/api/pointstate/product?name=models&latitude=${place.lat.toFixed(3)}&longitude=${place.lon.toFixed(3)}&hourly=${field}&models=${MODEL_KEYS.join(',')}&forecast_hours=96&timezone=auto${elev}`).then((body) => {
      if (!live) return;
      const rows = modelBand(body, field);
      setExtra(rows ? { rows } : { error: body?.error || body?.message || true, rows: [] });
    }).catch(() => { if (live) setExtra({ error: true, rows: [] }); });
    return () => { live = false; };
  }, [place, variable]);
  useEffect(() => {
    if (!place) return undefined;
    let live = true;
    setPool(null);
    const elev = place.elevM != null ? `&elev=${place.elevM}` : '';
    getJson(`/api/pool/point?lat=${place.lat.toFixed(5)}&lon=${place.lon.toFixed(5)}${elev}&days=5`).then((body) => {
      if (!live) return;
      if (!body || body.error || body.__status >= 400 || !body.now) setPool({ error: body?.message || body?.error || true });
      else setPool(body);
    }).catch(() => { if (live) setPool({ error: true }); });
    return () => { live = false; };
  }, [place]);
  const fromFeed = variable === 'feels' || variable === 'precip';
  const field = variable === 'wind' ? 'wind' : variable === 'temp' ? 'temperature' : null;
  const hours = (pool?.hourly || []).filter((row) => row.leadH >= 0 && row.leadH < lead && row[field]);
  const poolSeries = field ? hours.map((row) => row[field]).filter((row) => num(row?.p50) != null) : [];
  const series = fromFeed ? (extra?.rows || []).slice(0, lead) : poolSeries;
  const feedWait = fromFeed && !extra;
  const nowT = pool?.now?.temperature || {};
  const nowW = pool?.now?.wind || {};
  const h36 = (pool?.hourly || []).find((row) => row.leadH >= 36)?.temperature || {};
  const rain = (pool?.ensembleRain || [])[1] || null;
  const det = (pool?.deterministicRain || [])[1] || null;
  const exceed = rain?.exceed || {};
  const city = place?.name || 'this place';
  async function runDiagnostic() {
    if (!place || running) return;
    setRunning(true);
    setDiag(null);
    const end = new Date(Date.now() - 7 * 864e5);
    const start = new Date(end.getTime() - 14 * 864e5);
    const ymd = (date) => new Date(date.getTime() + 5 * 3600e3).toISOString().slice(0, 10);
    const from = ymd(start);
    const to = ymd(end);
    const base = `latitude=${place.lat.toFixed(4)}&longitude=${place.lon.toFixed(4)}&start_date=${from}&end_date=${to}&hourly=temperature_2m&timezone=auto`;
    try {
      const [archive, history] = await Promise.all([
        getJson(`/api/pointstate/product?name=archive&${base}&models=era5`),
        getJson(`/api/pointstate/product?name=histfc&${base}&models=${MM_DIAG.map((row) => row[0]).join(',')}`),
      ]);
      if (archive?.__status >= 400 || history?.__status >= 400 || archive?.error || history?.error) {
        setDiag({ rows: [], error: archive?.error || history?.error || 'The archive diagnostic did not answer.' });
        return;
      }
      const truth = archive?.hourly?.temperature_2m || [];
      const rows = MM_DIAG.map(([key, name]) => {
        const pred = history?.hourly?.[`temperature_2m_${key}`];
        if (!Array.isArray(pred)) return null;
        let se = 0; let ae = 0; let bias = 0; let n = 0;
        const count = Math.min(truth.length, pred.length);
        for (let i = 0; i < count; i += 1) {
          if (truth[i] == null || pred[i] == null) continue;
          const err = pred[i] - truth[i];
          se += err * err; ae += Math.abs(err); bias += err; n += 1;
        }
        if (n < 24) return null;
        return { key, name, mae: ae / n, rmse: Math.sqrt(se / n), bias: bias / n, n };
      }).filter(Boolean).sort((a, b) => a.rmse - b.rmse);
      setDiag({ rows, from, to, place: city, n: rows[0]?.n || 0, error: rows.length ? '' : 'No overlapping archive hours were returned for this place.' });
    } catch {
      setDiag({ rows: [], error: 'The archive diagnostic did not answer.' });
    } finally {
      setRunning(false);
    }
  }
  function exportDiag() {
    if (!diag?.rows?.length) return;
    const blob = new Blob([JSON.stringify({ kind: 'archive_vs_reanalysis', ...diag }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nigraan-archive-diagnostic-${city}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }
  function openSkill() {
    const next = `${window.location.pathname}?tab=modelab${window.location.hash || ''}`;
    window.history.pushState({}, '', next);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
  const unavailable = !feedWait && (fromFeed ? !!extra?.error || !series.length : (!pool?.error && pool && !series.length));
  return (
    <article className="mm-card" id="fcmm">
      <div className="mm-head">
        <div>
          <div className="mm-kicker">Model comparison</div>
          <h3>Multi-model comparison · {city}</h3>
          <div className="mm-sub">Global models, side by side · ranked agreement and inter-model spread</div>
        </div>
        <div className="mm-tools">
          <div className="mm-seg" role="group" aria-label="Variable">
            {[['temp', 'Temp'], ['feels', 'Feels-like'], ['wind', 'Wind'], ['precip', 'Precip']].map(([id, label]) => (
              <button key={id} type="button" className={variable === id ? 'on' : ''} onClick={() => setVariable(id)}>{label}</button>
            ))}
          </div>
          <div className="mm-seg" role="group" aria-label="Lead time">
            {[24, 48, 72].map((value) => (
              <button key={value} type="button" className={lead === value ? 'on' : ''} onClick={() => setLead(value)}>{value}h</button>
            ))}
          </div>
          <span className="mm-status"><i className={series.length ? 'live' : ''} />{feedWait ? `loading ${variable === 'feels' ? 'feels-like' : 'precipitation'} from the models…` : !pool && !fromFeed ? 'loading the model pool…' : (fromFeed ? extra?.error : pool?.error) ? 'unavailable — the model feed did not answer. No values are shown in place of it.' : series.length ? (fromFeed ? 'live · models side by side' : 'live · multi-model pool') : 'unavailable — no model series for this variable. No values are shown in place of it.'}</span>
        </div>
      </div>
      {unavailable && <div className="mm-empty">Not available right now<span>{fromFeed ? 'The models did not return an hour-by-hour series for this variable, so none is drawn.' : 'No model series was returned, so none is drawn.'}</span></div>}
      {!!series.length && <PoolBand rows={series} wind={variable === 'wind'} ink={BAND_INK[variable]} floor={variable === 'precip' ? 0 : null} />}
      <div className="mm-products">
        <h4>NIGRAAN products · {city}</h4>
        <p className="mm-sub">Four figures on top of the model list: the forecast and the confidence are kept apart; disagreement never moves the number.</p>
        {!pool && <p className="mm-fine">Loading the pool…</p>}
        {pool?.error && <p className="mm-fine">The pool did not answer for this place.</p>}
        {pool && !pool.error && (
          <div className="mm-grid">
            <div className="mm-cell">
              <span>Raw model median · now (before place correction)</span>
              <b>{n1(nowT.p50)} °C</b>
              <em>P10 {n1(nowT.p10)} · P90 {n1(nowT.p90)} · mean {n1(nowT.mean)} (diagnostic)</em>
              <div className="mm-line"><em>+36 h</em><i>{n1(h36.p50)} °C · {n1(h36.p10)}–{n1(h36.p90)}</i></div>
              <div className="mm-line"><em>wind now</em><i>{nowW.p50 == null ? '—' : `${n1(nowW.p50 * 3.6)} km/h`}</i></div>
              <em>{nowT.families ?? '—'} families, {nowT.n ?? '—'} models · family-weighted median</em>
            </div>
            <div className="mm-cell">
              <span>Rain tomorrow (ensemble median; shares are member counts)</span>
              <b>{rain ? `${n1(rain.p50)} mm` : '—'}</b>
              <em>{rain ? `P10 ${n1(rain.p10)} · P90 ${n1(rain.p90)} mm` : 'ensembles unavailable'}</em>
              {rain && (
                <>
                  <div className="mm-line"><em>P &gt; 10 mm</em><i className={chanceTone(exceed[10] ?? exceed['10']) ? `hz hz-${chanceTone(exceed[10] ?? exceed['10'])}` : ''}>{pctShare(exceed[10] ?? exceed['10'])}</i></div>
                  <div className="mm-line"><em>P &gt; 25 mm</em><i className={chanceTone(exceed[25] ?? exceed['25']) ? `hz hz-${chanceTone(exceed[25] ?? exceed['25'])}` : ''}>{pctShare(exceed[25] ?? exceed['25'])}</i></div>
                  <div className="mm-line"><em>P &gt; 50 mm</em><i className={chanceTone(exceed[50] ?? exceed['50']) ? `hz hz-${chanceTone(exceed[50] ?? exceed['50'])}` : ''}>{pctShare(exceed[50] ?? exceed['50'])}</i></div>
                  <em>global ensemble median {n1(systemMedian(rain.systems, /ENS$/i))} · AI ensemble median {n1(systemMedian(rain.systems, /WeatherN/i))} mm · equal system weight</em>
                </>
              )}
              {det && <em>deterministic family median {n1(det.p50)} mm</em>}
            </div>
            <div className="mm-cell">
              <span>Model agreement</span>
              <b className={`mm-agree ${String(nowT.agreement || '').toLowerCase()}`}>{nowT.agreement ? <span className="hz-chip">{nowT.agreement}</span> : '—'}</b>
              <em>dispersion {n1(nowT.dispersion)} °C (P90 − P10) now · {n1(h36.dispersion)} °C at +36 h</em>
              <p>{num(nowT.dispersion) != null && nowT.dispersion < 1.5 ? `The models agree within ${n1(nowT.dispersion)} °C; the single number is usable.` : `Most models sit within a ${n1(nowT.dispersion)} °C band.${h36.p10 != null ? ` Plan on ${Math.round(h36.p10)}–${Math.round(h36.p90)} °C at +36 h, not the single number.` : ''}`}</p>
              <div className="mm-line"><em>physical NWP</em><i>{nowT.physicalAgreement || '—'}</i></div>
              <div className="mm-line"><em>AI models</em><i>{nowT.aiAgreement || '—'}</i></div>
              {rain && <div className="mm-line"><em>ensemble systems</em><i>{rain.systemAgreement || '—'}</i></div>}
            </div>
            <div className="mm-cell">
              <span>NIGRAAN confidence</span>
              <b>{pool.now?.regime?.name || '—'}</b>
              <em>{pool.now?.regime?.use || 'short range (0–72 h)'}</em>
              <div className="mm-line"><em>corrected</em><i>{pool.correctedTemperature ? 'yes' : 'model layer, raw'}</i></div>
              <div className="mm-line"><em>weights</em><i>equal per family</i></div>
              <em>day 4–7: ensemble distributions · day 8–15: probabilities and ranges only</em>
            </div>
          </div>
        )}
        <p className="mm-foot">Pool rule: weighted median, one vote per forecast family{pool && !pool.error ? `; ${Object.keys(pool.rule?.notPooled || {}).length} feeds are not pooled (two regional models without a Pakistan domain and one second-opinion feed driven by a model already in the pool)` : ''}. Two ensembles carry equal weight. Ensemble shares are member counts (not calibrated); the pooling rule is empirical.</p>
      </div>
      <div className="mm-diag">
        <div className="mm-diag-head">
          <div>
            <h4>Archive agreement diagnostic</h4>
            <p className="mm-sub">2 m temperature · archived forecast fields versus global reanalysis · initialization and lead not controlled</p>
          </div>
          <div className="mm-actions">
            <button type="button" className="fc-btn mm-run" disabled={!place || running} onClick={runDiagnostic}>{running ? 'Running…' : 'Run diagnostic'}</button>
            <button type="button" className="fc-btn" disabled={!diag?.rows?.length} onClick={exportDiag}>Export JSON</button>
            <button type="button" className="fc-btn mm-skill" onClick={openSkill}>Verified skill service</button>
          </div>
        </div>
        {running && <p className="mm-fine">Fetching archived forecasts and global reanalysis…</p>}
        {diag?.error && <p className="mm-fine">{diag.error}</p>}
        {!!diag?.rows?.length && (
          <>
            <table className="fc-table">
              <thead><tr><th>Model</th><th>MAE °C</th><th>RMSE °C</th><th>Bias °C</th></tr></thead>
              <tbody>
                {diag.rows.map((row, index) => (
                  <tr key={row.key}>
                    <td>{index === 0 ? '★ ' : ''}{row.name}</td>
                    <td>{row.mae.toFixed(2)}</td>
                    <td>{row.rmse.toFixed(2)}</td>
                    <td className={Math.abs(row.bias) > 1.5 ? 'mm-bias' : ''}>{row.bias >= 0 ? '+' : ''}{row.bias.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mm-fine">{diag.n} hourly pairs · {diag.place} · {diag.from} to {diag.to} · lowest RMSE in this test: {diag.rows[0].name} · archive diagnostic only · forecast cycle and lead not controlled · never applied to the live comparison</p>
          </>
        )}
        <p className="mm-fine">Archive comparison against global reanalysis, not station gauges. Forecast initialization and lead are uncontrolled, so the table is a consistency diagnostic, not verified forecast skill. It never changes live model values or ranking.</p>
      </div>
    </article>
  );
}
function PoolBand({ rows, wind, ink, floor }) {
  const scale = (value) => (wind ? value * 3.6 : value);
  const stroke = ink?.[0] || '#154A4E';
  const lo = rows.map((row) => scale(num(row.p10))).filter((value) => value != null);
  const hi = rows.map((row) => scale(num(row.p90))).filter((value) => value != null);
  const mid = rows.map((row) => scale(num(row.p50))).filter((value) => value != null);
  if (mid.length < 2) return null;
  let min = Math.min(...lo, ...mid);
  let max = Math.max(...hi, ...mid);
  if (floor != null) {
    min = Math.min(min, floor);
    if (max - min < 1) max = min + 1;
  }
  const span = max - min || 1;
  const w = 1200;
  const h = 200;
  const x = (index) => 28 + (index / (rows.length - 1)) * (w - 36);
  const y = (value) => 12 + (1 - (value - min) / span) * (h - 28);
  const line = rows.map((row, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)} ${y(scale(row.p50)).toFixed(1)}`).join(' ');
  const area = `${rows.map((row, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)} ${y(scale(num(row.p90) ?? row.p50)).toFixed(1)}`).join(' ')} ${[...rows].reverse().map((row, index) => `L${x(rows.length - 1 - index).toFixed(1)} ${y(scale(num(row.p10) ?? row.p50)).toFixed(1)}`).join(' ')} Z`;
  return <svg className="mm-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Inter-model range"><path d={area} fill={stroke} opacity="0.16" /><path d={line} fill="none" stroke={stroke} strokeWidth="2.2" /></svg>;
}
function ComfortCard({ opt, card }) {
  const row = card?.bundle ? comfortFrom(card.bundle) : null;
  const stressColor = row && /no thermal/i.test(row.klass) ? '#1a7f4b' : row && /heat/i.test(row.klass) ? '#c2410c' : '#154a4e';
  return (
    <div className="cmp-col">
      <h4>{opt?.name || '—'}</h4>
      {!card && <p className="cmp-wait">Choose a place.</p>}
      {card?.busy && <p className="cmp-wait">Reading the forecast…</p>}
      {card?.error && <p className="cmp-wait">This place did not answer.</p>}
      {row && (
        <>
          <div className="cmp-row"><span className="k">Feels like · now</span><span className="v">{row.feels == null ? '—' : `${f1(row.feels)}°C`}</span></div>
          <div className="cmp-row"><span className="k">Thermal stress (UTCI) · now{row.hour ? ` (${row.hour} PKT)` : ''}</span><span className="v">{row.utci == null ? '—' : <>{Math.round(row.utci)}°C shade{row.klass ? <> · <b style={{ color: stressColor }}>{row.klass}</b></> : null}</>}</span></div>
          <div className="cmp-row"><span className="k">Heat level today</span><span className="v" style={{ color: heatInk(row.heatWord) }}>{row.heatWord ? `${row.heatWord}${row.tehsil ? ` · issued run, ${row.tehsil} tehsil` : ''}` : '—'}</span></div>
          <div className="cmp-row"><span className="k">Dew point</span><span className="v">{row.dew == null ? '—' : `${Math.round(row.dew)}°C`}</span></div>
          <div className="cmp-row"><span className="k">Est. wet-bulb (proxy)</span><span className="v">{row.wb == null ? '—' : `${Math.round(row.wb)}°C`}</span></div>
          <div className="cmp-row"><span className="k">Humidity · now</span><span className="v">{row.rh == null ? '—' : `${Math.round(row.rh)}%`}</span></div>
          <div className="cmp-row"><span className="k">Air quality (modelled)</span><span className="v">{row.aqi == null ? 'not retrieved' : <><i className="cmp-dot" style={{ background: row.band.color }} />{Math.round(row.aqi)} {row.band.label}</>}</span></div>
          <div className="cmp-note">Retrieved{row.clock ? ` ${row.clock} PKT` : ''} · forecast model, not a station observation</div>
          <div className="cmp-row"><span className="k">UV index</span><span className="v">{row.uv == null ? '—' : `${Math.round(row.uv)} ${uvWord(row.uv)}`}</span></div>
          <div className="cmp-row"><span className="k">Comfort</span><span className="v cmp-comfort">{row.comfort}</span></div>
          <div className="cmp-row"><span className="k">Best window</span><span className="cmp-win">{row.window}</span></div>
        </>
      )}
    </div>
  );
}
