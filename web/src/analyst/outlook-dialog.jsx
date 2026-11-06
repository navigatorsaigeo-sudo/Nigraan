import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getJson } from '../start/api.js';

const TABS = [
  ['unit', 'Tehsil'],
  ['nat', 'National'],
  ['sea', 'Weeks & season'],
  ['air', 'Air & smog'],
  ['chk', 'Checks'],
  ['river', 'Rivers'],
  ['skill', 'Skill sheet'],
];
const TH = { tx40: 'Max ≥40 °C', tx45: 'Max ≥45 °C', tn30: 'Night ≥30 °C', tn0: 'Frost ≤0 °C (below 2,000 m)', sn10: 'Snow ≥10 cm', pr10: 'Rain ≥10 mm', pr25: 'Rain ≥25 mm', pr50: 'Rain ≥50 mm', pr100: 'Rain ≥100 mm', gu60: 'Gusts ≥60 km/h' };
const TH_ORDER = ['tx40', 'tx45', 'tn30', 'pr10', 'pr25', 'pr50', 'pr100', 'gu60', 'sn10', 'tn0'];
const EVS = {
  heatSpell: 'Heat spell: hotter than usual for this place and time of year, and hot enough to matter',
  unusualWarmth: 'Unusually warm for this place and time of year, at any temperature',
  coastalHeat: 'Coastal humid heat (within 60 km of the sea): apparent temperature ≥40 °C for 2+ days',
  rain3_75: 'Heavy rain: 3-day total ≥75 mm',
  rain3Local: 'Extreme rain for this place: 3-day total ≥ local 1-in-100-days',
  coldSpell: 'Cold spell: colder than usual for this place and time of year, and cold enough to matter',
  heavySnow: 'Heavy snow: 3-day total ≥30 cm',
  frostSpell: 'Frost spell below 2,000 m: 3+ nights ≤0 °C',
  rainOnSnow: 'Rain on snow above 1,500 m: ≥5 mm rain on snow from the past 5 days, max above 2 °C',
};
const EV_ORDER = ['heatSpell', 'unusualWarmth', 'coastalHeat', 'rain3_75', 'rain3Local', 'rainOnSnow', 'heavySnow', 'frostSpell', 'coldSpell'];
const HEAT_SUB = {
  localDay: 'hot days: 3+ days hotter than usual for the date and past the heat floor (this is the event)',
  warmNight: 'warm nights: 3+ nights warmer than usual for the date and above 20 °C (information)',
  dayAndNight: 'hot days AND warm nights together — no overnight relief',
  absolute40: '≥ 40 °C for 3+ days inland, usual for the date or not (information)',
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PM_COLOR = ['#35682B', '#8a7a12', '#c26a0a', '#b3261e', '#7b1e5a', '#5a1010'];
const DS_COLOR = ['#35682B', '#8a7a12', '#c26a0a', '#b3261e'];

function todayPk() {
  return new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
}
function dlab(date) {
  const t = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(t.getTime())) return String(date || '');
  return `${DOW[t.getUTCDay()]} ${t.getUTCDate()}`;
}
function dWords(date) {
  const t = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(t.getTime())) return String(date || '');
  return `${WEEKDAYS[t.getUTCDay()]} ${t.getUTCDate()} ${MONTHS_LONG[t.getUTCMonth()]} ${t.getUTCFullYear()}`;
}
function mname(ym) {
  const n = Number(String(ym).slice(5, 7)) - 1;
  return `${MONTHS[n] || ym} ${String(ym).slice(0, 4)}`;
}
function ago(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return 'never';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}
function pkt(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return 'not available';
  const d = new Date(t + 5 * 3600e3);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} PKT`;
}
function sgn(value, unit, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return '–';
  const n = Number(value);
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}${unit || ''}`;
}
function getOp(url) {
  return getJson(url, { view: 'operator' }).catch(() => ({ error: true }));
}

export default function OutlookDialog({ place, onClose }) {
  const [tab, setTab] = useState('nat');
  const [unitKey, setUnitKey] = useState(null);
  const [unit, setUnit] = useState(null);
  const [nat, setNat] = useState(null);
  const [natDay, setNatDay] = useState(1);
  const [seaNat, setSeaNat] = useState(null);
  const [week, setWeek] = useState(2);
  const [month, setMonth] = useState(1);
  const [air, setAir] = useState(null);
  const [airNat, setAirNat] = useState(null);
  const [airDay, setAirDay] = useState(1);
  const [chk, setChk] = useState(null);
  const [skill, setSkill] = useState(null);
  const [river, setRiver] = useState(null);
  const [riverDay, setRiverDay] = useState(0);
  const [gauges, setGauges] = useState(null);
  const [snow, setSnow] = useState(null);
  const [showEvents, setShowEvents] = useState(false);
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => {
    if (!place) return undefined;
    let live = true;
    const url = unitKey
      ? `/api/outlook/unit?unit=${encodeURIComponent(unitKey)}`
      : `/api/outlook/unit?lat=${place.lat.toFixed(4)}&lon=${place.lon.toFixed(4)}`;
    setUnit(null);
    getJson(url).then((body) => { if (live) setUnit(body?.unit ? body : { error: body?.error || true }); }).catch(() => { if (live) setUnit({ error: true }); });
    return () => { live = false; };
  }, [place, unitKey]);
  useEffect(() => {
    let live = true;
    setNat(null);
    getJson(`/api/outlook/national?day=${natDay}`).then((body) => { if (live) setNat(body || { error: true }); }).catch(() => { if (live) setNat({ error: true }); });
    return () => { live = false; };
  }, [natDay]);
  useEffect(() => {
    let live = true;
    setSeaNat(null);
    getJson(`/api/outlook/seasonal/national?week=${week}&month=${month}`).then((body) => { if (live) setSeaNat(body || { error: true }); }).catch(() => { if (live) setSeaNat({ error: true }); });
    return () => { live = false; };
  }, [week, month]);
  const unitId = unit?.unit?.unitId;
  useEffect(() => {
    if (!unitId) return undefined;
    let live = true;
    setAir(null);
    getJson(`/api/smog/unit?unit=${encodeURIComponent(unitId)}`).then((body) => { if (live) setAir(body?.days ? body : { error: true }); }).catch(() => { if (live) setAir({ error: true }); });
    return () => { live = false; };
  }, [unitId]);
  useEffect(() => {
    let live = true;
    setAirNat(null);
    getJson(`/api/smog/national?day=${airDay}`).then((body) => { if (live) setAirNat(body || { error: true }); }).catch(() => { if (live) setAirNat({ error: true }); });
    return () => { live = false; };
  }, [airDay]);
  useEffect(() => {
    if (tab !== 'chk' || chk) return undefined;
    let live = true;
    getJson('/api/checks').then((body) => { if (live) setChk(body || { error: true }); }).catch(() => { if (live) setChk({ error: true }); });
    return () => { live = false; };
  }, [tab, chk]);
  useEffect(() => {
    if (tab !== 'skill' || skill) return undefined;
    let live = true;
    getJson('/api/skill').then((body) => { if (live) setSkill(body || { error: true }); }).catch(() => { if (live) setSkill({ error: true }); });
    return () => { live = false; };
  }, [tab, skill]);
  useEffect(() => {
    if (tab !== 'river') return undefined;
    let live = true;
    setRiver(null);
    getJson(`/api/flood/national?day=${riverDay}`).then((body) => { if (live) setRiver(body || { error: true }); }).catch(() => { if (live) setRiver({ error: true }); });
    return () => { live = false; };
  }, [tab, riverDay]);
  useEffect(() => {
    if (tab !== 'river' || gauges) return undefined;
    let live = true;
    getOp('/api/flood/gauges').then((body) => { if (live) setGauges(body || { error: true }); });
    return () => { live = false; };
  }, [tab, gauges]);
  useEffect(() => {
    if (tab !== 'river' || snow) return undefined;
    let live = true;
    getJson('/api/flood/snow').then((body) => { if (live) setSnow(body || { error: true }); }).catch(() => { if (live) setSnow({ error: true }); });
    return () => { live = false; };
  }, [tab, snow]);
  function pick(id) {
    setUnitKey(id);
    setTab(tab === 'air' || tab === 'sea' ? tab : 'unit');
  }
  const names = (nat?.rows || []).map((row) => `${row.name} — ${row.district}`);
  return (
    <div className="ol-back" onClick={onClose}>
      <div className="ol-card" role="dialog" aria-label="Forecast outlook" onClick={(event) => event.stopPropagation()}>
        <div className="ol-head">
          <h2>Forecast outlook</h2>
          <div className="ol-tabs">
            {TABS.map(([id, label]) => <button key={id} type="button" className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}
          </div>
          <button type="button" className="ol-x" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="ol-body">
          {tab === 'nat' && <NationalPane nat={nat} onDay={setNatDay} onPick={pick} />}
          {tab === 'unit' && <TehsilPane unit={unit} names={names} showEvents={showEvents} onToggle={() => setShowEvents((v) => !v)} onSearch={setUnitKey} onHere={() => setUnitKey(null)} onWeeks={() => setTab('sea')} />}
          {tab === 'sea' && <SeasonPane nat={seaNat} names={names} onSearch={setUnitKey} onWeek={setWeek} onMonth={setMonth} onPick={pick} />}
          {tab === 'air' && <AirPane air={air} nat={airNat} names={names} onSearch={setUnitKey} onDay={setAirDay} onPick={pick} />}
          {tab === 'chk' && <ChecksPane chk={chk} />}
          {tab === 'river' && <RiverPane river={river} gauges={gauges} snow={snow} onDay={setRiverDay} />}
          {tab === 'skill' && <SkillPane skill={skill} />}
        </div>
      </div>
    </div>
  );
}

function Search({ names, placeholder, onSearch }) {
  function commit(event) {
    const value = event.target.value.split(' — ')[0].trim();
    if (value) onSearch(value);
  }
  return (
    <div className="ol-row">
      <input type="text" list="ol-names" placeholder={placeholder} aria-label={placeholder} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') commit(event); }} onChange={(event) => { const raw = event.target.value; if (names.includes(raw) || raw.includes(' — ')) commit(event); }} />
      <datalist id="ol-names">{names.map((name) => <option key={name} value={name} />)}</datalist>
    </div>
  );
}
function Days({ days, index, onPick, label = dlab }) {
  return (
    <div className="ol-row ol-days">
      {(days || []).map((date, i) => <button key={date} type="button" className={i === index ? 'on' : ''} onClick={() => onPick(i)}>{label(date)}</button>)}
    </div>
  );
}
function LinkName({ id, name, district, onPick }) {
  return <button type="button" className="ol-link" onClick={() => onPick(id)}>{name} <span>{district}</span></button>;
}

function NationalPane({ nat, onDay, onPick }) {
  if (!nat) return <p className="ol-meta">Loading the national outlook…</p>;
  if (!nat.ready) return <div className="ol-note ol-warn">{nat.why || 'The ensemble run has not completed yet.'}</div>;
  const events = nat.events || {};
  const hasEvents = EV_ORDER.filter((key) => {
    const count = events.counts?.[key];
    return count && (count.any > 0 || (events.top?.[key] || []).length);
  });
  const thAll = TH_ORDER.filter((key) => nat.counts?.[key]);
  const thHas = thAll.filter((key) => nat.counts[key].any > 0 || (nat.top?.[key] || []).length);
  const thNone = thAll.filter((key) => !thHas.includes(key));
  return (
    <>
      <div className="ol-place">
        <b className="ol-title">National outlook</b>
        <span className="ol-meta">{nat.tehsils} tehsils · updated {ago(nat.at)} · {dWords(nat.date)}</span>
      </div>
      {!hasEvents.length ? (
        <div className="ol-box ol-events">
          <h3>Multi-day events</h3>
          <p className="ol-plain">No multi-day event is expected in any tehsil from {dlab(events.window?.[0])} to {dlab(events.window?.[1])}.</p>
        </div>
      ) : (
        <>
          <h3>Multi-day events, {dlab(events.window?.[0])} to {dlab(events.window?.[1])} (member by member)</h3>
          <div className="ol-grid">
            {hasEvents.map((key) => (
              <div className="ol-box" key={key}>
                <h3>{EVS[key]}</h3>
                <div><b className="ol-big">{events.counts[key].likely}</b> likely · {events.counts[key].any} possible</div>
                <TopTable rows={events.top?.[key]} onPick={onPick} value={(row) => row.prob == null ? '–' : `${row.prob}%`} />
              </div>
            ))}
          </div>
        </>
      )}
      <h3>Single-day thresholds</h3>
      <Days days={nat.days} index={nat.dayIndex} onPick={onDay} />
      <p className="ol-meta">“Likely” = at least half of the members; “possible” = at least 10%. Click a tehsil for its detail.</p>
      {!thHas.length && (
        <div className="ol-box">
          <h3>{dWords(nat.date)}</h3>
          <p className="ol-plain">No tehsil reaches these thresholds today: {thAll.map((key) => TH[key]).join(', ') || 'none listed'}.</p>
        </div>
      )}
      {!!thHas.length && (
        <>
          {!!thNone.length && <p className="ol-plain">Not reached in any tehsil on {dWords(nat.date)}: {thNone.map((key) => TH[key]).join(', ')}.</p>}
          <div className="ol-grid">
            {thHas.map((key) => (
              <div className="ol-box" key={key}>
                <h3>{TH[key]}</h3>
                <div><b className="ol-big">{nat.counts[key].likely}</b> likely · {nat.counts[key].any} possible</div>
                <TopTable rows={nat.top?.[key]} onPick={onPick} value={(row) => row.median} extra={(row) => (row.prob == null ? '–' : `${row.prob}%`)} />
              </div>
            ))}
          </div>
        </>
      )}
      <div className="ol-note">Raw ensemble shares, not calibrated probabilities and not warnings. Operational action needs an authorised decision.</div>
      <p className="ol-meta">Source: NIGRAAN, from the global ensemble forecast (a chance is the share of its members).</p>
    </>
  );
}
function TopTable({ rows, onPick, value, extra, limit = 6, quiet = false }) {
  const list = (rows || []).slice(0, limit);
  if (!list.length) return quiet ? null : <p className="ol-meta">No tehsil above 0%.</p>;
  return (
    <table className="fc-table"><tbody>
      {list.map((row) => (
        <tr key={row.unitId}><td><LinkName id={row.unitId} name={row.name} district={row.district} onPick={onPick} /></td><td>{value(row)}</td>{extra ? <td>{extra(row)}</td> : null}</tr>
      ))}
    </tbody></table>
  );
}

function TehsilPane({ unit, names, showEvents, onToggle, onSearch, onHere, onWeeks }) {
  if (!unit) return <p className="ol-meta">Loading the tehsil outlook…</p>;
  if (unit.error) return <p className="ol-meta">No tehsil outlook was returned for that name.</p>;
  const place = unit.unit;
  const ensemble = unit.ensemble;
  const days = (ensemble?.days || []).filter((day) => day.date >= todayPk());
  const keys = TH_ORDER.filter((key) => days.some((day) => day.p?.[key] != null));
  return (
    <>
      <div className="ol-row">
        <Search names={names} placeholder="Tehsil name, for example Jacobabad" onSearch={onSearch} />
        <button type="button" className="ol-ghost" onClick={onHere}>Use map selection</button>
      </div>
      <div className="ol-place">
        <b className="ol-title">{place.name}</b>
        <span className="ol-meta">{place.district}, {place.province}{place.elevM != null ? ` · ${place.elevM} m` : ''}</span>
      </div>
      {unit.heightBasis?.label && <div className="ol-note">{unit.heightBasis.label}</div>}
      {!ensemble && <div className="ol-note ol-warn">{place.disputed ? 'Disputed territory: no meteorological product is published.' : 'The ensemble run has not completed yet.'}</div>}
      {ensemble && (
        <>
          <p className="ol-meta">Global forecast model ensemble, {ensemble.members} members, updated {ago(ensemble.at)}. Band = 10th to 90th percentile, line = median.</p>
          <OutlookChart days={days} />
          <EventsBlock events={unit.events} members={ensemble.members} show={showEvents} onToggle={onToggle} />
          <h3>Daily ensemble table</h3>
          <div className="ol-wrap">
            <table className="fc-table">
              <thead><tr><th>Day</th><th>Max °C</th><th>Min °C</th><th>Rain mm</th><th>Gust</th>{keys.map((key) => <th key={key}>{TH[key]}</th>)}</tr></thead>
              <tbody>
                {days.map((day) => (
                  <tr key={day.date}>
                    <td>{dlab(day.date)}</td>
                    <td>{range(day.tx)}</td>
                    <td>{range(day.tn)}</td>
                    <td>{day.pr ? <><b>{day.pr[1]}</b> <span className="ol-meta">wet {day.pr[2]}</span></> : '–'}</td>
                    <td>{day.gu ? day.gu[1] : '–'}</td>
                    {keys.map((key) => <td key={key} className={day.p?.[key] ? 'ol-hot' : ''}>{day.p?.[key] == null ? '–' : `${day.p[key]}%`}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ol-note">Chances are the share of the {ensemble.members} members crossing each threshold. They are raw, not yet calibrated against observations. {adjustNote(unit.adjustment)}</div>
        </>
      )}
      <p className="ol-meta">Weeks 1–6 and the next 6 months for this tehsil: <button type="button" className="ol-link" onClick={onWeeks}>Weeks & season tab</button>.</p>
      <Sunshine sun={unit.sunshine} />
    </>
  );
}
function range(pair) {
  if (!pair) return '–';
  return <><b>{pair[1]}</b> <span className="ol-meta">{pair[0]}–{pair[2]}</span></>;
}
function adjustNote(adjustment) {
  if (!adjustment) return '';
  if (adjustment.stationGuard) return `Temperatures here are not shifted: the ${adjustment.stationGuard.station} airport thermometer shows global reanalysis is itself biased at this location.`;
  return '';
}
function EventsBlock({ events, members, show, onToggle }) {
  if (!events) return null;
  return (
    <div className="ol-box ol-events">
      <h3>Multi-day events, counted member by member ({dlab(events.window?.[0])} to {dlab(events.window?.[1])})</h3>
      <p className="ol-meta">Each of the {members || events.members} members is one possible future. A chance of 40% means 20 of them contain the event. {events.climatology ? '“Local” limits come from 1991–2020 global reanalysis for this tehsil and time of year.' : 'Local limits are pending.'}</p>
      <div className="ol-kpis">
        <div className="ol-kpi"><span>Hottest 3 days</span><b>{events.peak3dTx ? `${events.peak3dTx[1]} °C` : '–'}</b></div>
        <div className="ol-kpi"><span>Wettest 3 days</span><b>{events.max3dRain ? `${events.max3dRain[1]} mm` : '–'}</b></div>
      </div>
      <div className="ol-wrap">
        <table className="fc-table">
          <thead><tr><th>Event</th><th>Chance</th><th>Usual chance</th><th>Typical start</th><th>Earliest</th></tr></thead>
          <tbody>
            {EV_ORDER.map((key) => {
              const row = events[key];
              if (!row) return null;
              const quiet = row.p == null || Number(row.p) === 0;
              if (quiet && !show) return null;
              const def = (events.definitions || []).find((item) => item.id === key);
              return (
                <EventRows key={key} label={def?.label || EVS[key]} rule={def?.rule} row={row}>
                  {key === 'heatSpell' && events.heatSpellClasses && Object.keys(HEAT_SUB).map((sub) => {
                    const sc = events.heatSpellClasses[sub];
                    if (!sc) return null;
                    const q = sc.p == null || Number(sc.p) === 0;
                    if (q && !show) return null;
                    return <tr key={sub} className="ol-sub"><td>└ {HEAT_SUB[sub]}{sc.why && sc.p == null ? <span className="ol-meta"> — {sc.why}</span> : null}</td><td>{sc.p == null ? 'not screened' : `${sc.p}%`}</td><td /><td>{sc.onset ? dlab(sc.onset) : '–'}</td><td>{sc.earliest ? dlab(sc.earliest) : '–'}</td></tr>;
                  })}
                </EventRows>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" className="ol-ghost" onClick={onToggle}>{show ? 'Hide events that are not expected' : 'Show all events, including the ones not expected'}</button>
    </div>
  );
}
function EventRows({ label, rule, row, children }) {
  return (
    <>
      <tr>
        <td>{label}{rule ? <div className="ol-meta">{rule}</div> : null}{row.why && row.p == null ? <div className="ol-meta">{row.why}</div> : null}</td>
        <td>{row.p == null ? (row.ordinary ? 'ordinary' : 'not screened') : `${row.p}%`}</td>
        <td>{row.climP == null ? '–' : `${row.climP}%`}</td>
        <td>{row.onset ? dlab(row.onset) : '–'}</td>
        <td>{row.earliest ? dlab(row.earliest) : '–'}</td>
      </tr>
      {children}
    </>
  );
}
function OutlookChart({ days }) {
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
  if (days.length < 2) return null;
  let lo = 1e9; let hi = -1e9;
  days.forEach((day) => {
    if (day.tx) { hi = Math.max(hi, day.tx[2]); lo = Math.min(lo, day.tx[0]); }
    if (day.tn) { hi = Math.max(hi, day.tn[2]); lo = Math.min(lo, day.tn[0]); }
  });
  if (lo > hi) return null;
  lo = Math.floor(lo / 5) * 5 - 1;
  hi = Math.ceil(hi / 5) * 5 + 1;
  const W = width; const H = 210; const L = 40; const R = 26; const T = 12; const B = 26;
  const n = days.length;
  const x = (i) => L + ((W - L - R) * (n < 2 ? 0.5 : i / (n - 1)));
  const y = (v) => T + ((H - T - B) * (1 - (v - lo) / (hi - lo)));
  const band = (key) => {
    const up = []; const dn = []; const md = [];
    days.forEach((day, i) => {
      if (!day[key]) return;
      up.push(`${x(i).toFixed(1)},${y(day[key][2]).toFixed(1)}`);
      dn.unshift(`${x(i).toFixed(1)},${y(day[key][0]).toFixed(1)}`);
      md.push(`${x(i).toFixed(1)},${y(day[key][1]).toFixed(1)}`);
    });
    return { area: up.concat(dn).join(' '), line: md.join(' ') };
  };
  const max = band('tx'); const min = band('tn');
  const grid = [];
  for (let v = Math.ceil(lo / 5) * 5; v <= hi; v += 5) grid.push(v);
  const pmax = days.reduce((m, day) => Math.max(m, day.pr ? day.pr[2] : 0), 0);
  const rainTop = Math.max(5, Math.ceil(pmax / 5) * 5);
  return (
    <div className="ol-charts" ref={box}>
      <svg className="ol-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily max and min temperature">
        {grid.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#edf1f4" /><text x={L - 6} y={y(v) + 4} fontSize="11" textAnchor="end" fill="#5a6f7c">{v}°</text></g>)}
        {[40, 45].filter((t) => t > lo && t < hi).map((t) => <line key={t} x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#c0392b" strokeDasharray="4 4" />)}
        {days[3] && days[4] && (
          <g>
            <line x1={(x(3) + x(4)) / 2} x2={(x(3) + x(4)) / 2} y1={T} y2={H - B} stroke="#9fb1bd" strokeDasharray="2 3" />
            <text x={(x(3) + x(4)) / 2 + 4} y={H - B - 6} fontSize="10" fill="#5a6f7c">beyond the verified 72 h forecast</text>
          </g>
        )}
        <polygon points={max.area} fill="rgba(214,96,77,.22)" /><polyline points={max.line} fill="none" stroke="#c0392b" strokeWidth="2.2" />
        <polygon points={min.area} fill="rgba(75,179,187,.22)" /><polyline points={min.line} fill="none" stroke="#388E95" strokeWidth="2.2" />
        {days.map((day, i) => <text key={day.date} x={x(i)} y={H - 8} fontSize="11" textAnchor="middle" fill="#5a6f7c">{dlab(day.date)}</text>)}
      </svg>
      <div className="ol-legend"><span><i className="ol-swatch hot" />daily max</span><span><i className="ol-swatch cool" />daily min</span><span>dashed red = 40 and 45 °C</span></div>
      {pmax > 0.2 && <RainBars days={days} top={rainTop} width={W} left={L} right={R} />}
      {pmax <= 0.2 && <p className="ol-meta">Rain: all members dry or under 0.2 mm on every day.</p>}
    </div>
  );
}
function RainBars({ days, top, width, left = 40, right = 26 }) {
  const n = Math.max(1, days.length);
  const W = width || 980;
  const RH = 70;
  const H = RH + 8;
  const x = (i) => left + ((W - left - right) * (n < 2 ? 0.5 : i / (n - 1)));
  const bw = ((W - left - right) / n) * 0.5;
  return (
    <>
      <svg className="ol-chart ol-chart-rain" viewBox={`0 0 ${W} ${H}`} aria-label="Daily rain">
        <text x={left + 4} y="12" fontSize="11" fill="#5a6f7c">{top} mm</text>
        <line x1={left} x2={W - right} y1={RH + 4} y2={RH + 4} stroke="#c9d5de" />
        {days.map((day, i) => {
          if (!day.pr) return null;
          const h50 = RH * day.pr[1] / top;
          const h90 = RH * day.pr[2] / top;
          const cx = x(i);
          return (
            <g key={day.date}>
              <rect x={cx - bw / 2} y={RH - h50 + 4} width={Math.max(2, bw)} height={Math.max(0, h50)} fill="#4AB1B8" />
              <line x1={cx} x2={cx} y1={RH - h90 + 4} y2={RH - h50 + 4} stroke="#4AB1B8" strokeWidth="1.5" />
              <line x1={cx - 5} x2={cx + 5} y1={RH - h90 + 4} y2={RH - h90 + 4} stroke="#4AB1B8" strokeWidth="1.5" />
            </g>
          );
        })}
      </svg>
      <p className="ol-meta">Rain: bar = median, whisker = 90th percentile (wet case).</p>
    </>
  );
}
function Sunshine({ sun }) {
  if (!sun) return <div className="ol-box"><h3>Sunshine check (satellite vs model)</h3><p className="ol-meta">Not run yet. It refreshes every hour.</p></div>;
  const today = sun.today;
  return (
    <div className="ol-box">
      <h3>Sunshine check: satellite vs forecast model</h3>
      {today && <p><b className="ol-big">{today.anomaly == null ? '–' : `${Math.round(today.anomaly * 100)}%`}</b> of the usual satellite/model ratio today ({today.sat_mj} vs {today.model_mj} MJ/m², {today.hours} h matched). <b>{today.verdict || ''}</b></p>}
      {!!sun.past?.length && <p className="ol-meta">Previous days: {sun.past.map((day) => `${dlab(day.date)} ${day.anomaly == null ? '–' : `${Math.round(day.anomaly * 100)}%`}`).join(' · ')}</p>}
      <p className="ol-meta">Satellite shortwave divided by the model’s shortwave for the same hours, compared with this tehsil’s median over the last 15 days ({sun.typicalRatio ?? 'n/a'}). Below 85% means cloud the model missed.</p>
    </div>
  );
}

function SeasonPane({ nat: seaNat, names, onSearch, onWeek, onMonth, onPick }) {
  return (
    <>
      <Search names={names} placeholder="Tehsil name" onSearch={onSearch} />
      {seaNat?.ready && (
        <>
          <h3>National · weeks ahead</h3>
          <Days days={seaNat.weeks} index={seaNat.weekIndex} onPick={onWeek} />
          <div className="ol-grid3">
            {[['warm', 'Warmer than normal', seaNat.rules?.weekWarm, 'tAnom', ' °C'], ['wet', 'Wetter than normal', seaNat.rules?.weekWet, 'pAnom', ' mm'], ['dry', 'Drier than normal', seaNat.rules?.weekDry, 'pAnom', ' mm']].map(([key, title, rule, field, unit]) => (
              <div className="ol-box" key={key}>
                <h3>{title}</h3>
                <div><b className="ol-big">{seaNat.weekCounts?.[key] ?? 0}</b> of {seaNat.tehsils} tehsils</div>
                <p className="ol-meta">{rule}</p>
                <TopTable quiet rows={(seaNat.weekTop?.[key] || []).map((row) => ({ ...row, show: sgn(row.w?.[field], unit) }))} onPick={onPick} value={(row) => row.show} />
              </div>
            ))}
          </div>
          <h3>National · season ahead</h3>
          <Days days={seaNat.months} index={seaNat.monthIndex} onPick={onMonth} label={mname} />
          <div className="ol-grid3">
            {[['warm', 'Warm month', seaNat.rules?.monthWarm], ['wet', 'Wet month', seaNat.rules?.monthWet], ['dry', 'Dry month', seaNat.rules?.monthDry]].map(([key, title, rule]) => (
              <div className="ol-box" key={key}>
                <h3>{title}</h3>
                <div><b className="ol-big">{seaNat.monthCounts?.[key] ?? 0}</b> of {seaNat.tehsils} tehsils</div>
                <p className="ol-meta">{rule}</p>
                <TopTable quiet rows={seaNat.monthTop?.[key]} onPick={onPick} value={(row) => (key === 'warm' ? sgn(row.m?.tAnom, ' °C') : `${sgn(row.m?.pAnom, ' mm', 0)} (${sgn(row.m?.pPct, '%', 0)})`)} />
              </div>
            ))}
          </div>
          <div className="ol-wrap">
          <table className="fc-table">
            <thead><tr><th>Province</th><th>Tehsils</th><th>Week {dlab(seaNat.week)}<small>temp / rain vs normal</small></th><th>{mname(seaNat.month)}<small>temp / rain vs normal (median %)</small></th></tr></thead>
            <tbody>
              {(seaNat.provinces || []).map((row) => (
                <tr key={row.name}><td>{row.name}</td><td>{row.tehsils}</td><td>{sgn(row.weekTAnom, ' °C')} / {sgn(row.weekPAnom, ' mm')}</td><td>{sgn(row.monthTAnom, ' °C')} / {sgn(row.monthPAnom, ' mm')} ({sgn(row.monthPPctMedian, '%', 0)})</td></tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}
    </>
  );
}

function AirPane({ air, nat, names, onSearch, onDay, onPick }) {
  return (
    <>
      <Search names={names} placeholder="Tehsil name" onSearch={onSearch} />
      {!air && <p className="ol-meta">Loading the air and smog outlook…</p>}
      {air?.error && <div className="ol-note ol-warn">The air and smog outlook is still running (about 2 minutes after the server starts; refreshed every 3 hours).</div>}
      {air?.days && (
        <>
          <div className="ol-row"><b className="ol-title">{air.unit?.name}</b><span className="ol-meta">{air.unit?.district}, {air.unit?.province} · air and smog forecast of {pkt(air.at)}</span></div>
          <div className="ol-wrap">
            <table className="fc-table ol-air">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>PM2.5 daily mean<small>µg/m³ · class</small></th>
                  <th>Air quality index<small>US EPA AQI (2024 breakpoints), daily, from the PM2.5 shown and the forecast PM10</small></th>
                  <th>Dispersion<small>afternoon ventilation m²/s</small></th>
                  <th>Morning inversion<small>hours</small></th>
                  <th>Fog hours<small>visibility under 1 km</small></th>
                  <th>Dust<small>µg/m³</small></th>
                </tr>
              </thead>
              <tbody>
                {air.days.map((day) => (
                  <tr key={day.date}>
                    <td>{dlab(day.date)}</td>
                    <td>{day.pmClass == null ? '–' : <span className="ol-air-fig" style={{ color: PM_COLOR[day.pmClass] }}><b>{day.pm25}</b><span>{(air.classes || [])[day.pmClass]}</span></span>}</td>
                    <td>{day.aqi == null ? '–' : <span className="ol-air-fig"><b>{day.aqi}</b><span>{day.aqiCategory}{day.aqiPollutant ? ` (${day.aqiPollutant})` : ''}</span></span>}</td>
                    <td style={{ color: day.dispersion != null ? DS_COLOR[day.dispersion] : undefined }}><span className="ol-air-fig"><b>{day.dispersion != null ? (air.dispersion || [])[day.dispersion] : '–'}</b><span className="ol-meta">{day.afternoonVentilation ?? ''}</span></span></td>
                    <td>{day.inversionHours == null ? <span className="ol-meta">n/a above 500 m</span> : day.inversionHours}</td>
                    <td>{day.fogHours == null ? <span className="ol-meta">n/a above 500 m</span> : day.fogHours}</td>
                    <td>{day.dust == null ? '–' : Math.round(day.dust)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ol-note">{(air.notes || []).join(' ')} Modelled, not measured. Every PM2.5 figure on this panel comes from the CAMS global atmospheric composition model. Treat the classes as a dispersion and composition screen, not as an air quality reading.</div>
        </>
      )}
      {nat?.ready && (
        <>
          <h3>National</h3>
          <Days days={nat.days} index={nat.dayIndex} onPick={onDay} />
          <div className="ol-grid3">
            <div className="ol-box"><h3>Highest PM2.5</h3><p className="ol-meta">CAMS daily mean</p><TopTable rows={nat.top?.pm25} onPick={onPick} value={(row) => `${row.pm25} µg/m³`} /></div>
            <div className="ol-box"><h3>Fog hours</h3><p className="ol-meta">visibility under 1 km</p><TopTable rows={(nat.top?.fog || []).filter((row) => row.fogHours)} onPick={onPick} value={(row) => `${row.fogHours} h`} /></div>
            <div className="ol-box">
              <h3>PM2.5 classes</h3>
              <table className="fc-table"><tbody>{(nat.byClass || []).map((row, i) => <tr key={row.label}><td style={{ color: PM_COLOR[i] }}>{row.label}</td><td>{row.tehsils}</td></tr>)}</tbody></table>
              <h3>Dispersion</h3>
              <table className="fc-table"><tbody>{(nat.byDispersion || []).map((row, i) => <tr key={row.label}><td style={{ color: DS_COLOR[i] }}>{row.label}</td><td>{row.tehsils}</td></tr>)}</tbody></table>
            </div>
          </div>
          <table className="fc-table">
            <thead><tr><th>Province</th><th>Tehsils</th><th>Median PM2.5</th><th>Poor dispersion</th></tr></thead>
            <tbody>{(nat.provinces || []).map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.tehsils}</td><td>{row.pm25Median} µg/m³</td><td>{row.poorDispersion}</td></tr>)}</tbody>
          </table>
        </>
      )}
    </>
  );
}

function ChecksPane({ chk }) {
  if (!chk) return <p className="ol-meta">Loading the checks…</p>;
  const health = chk.health;
  const stations = chk.stations || {};
  const ensemble = chk.ensemble || {};
  const seasonal = chk.seasonalRecord;
  const leads = Object.keys(ensemble.leads || {});
  return (
    <>
      {health && (
        <div className="ol-box">
          <h3>System health</h3>
          <p>{health.ok ? <b className="ol-ok">All scheduled jobs are on time.</b> : <b className="ol-bad">{health.stale?.length || 0} job(s) late{health.never?.length ? ` · ${health.never.length} not run yet` : ''}</b>}</p>
          <table className="fc-table">
            <thead><tr><th>Job</th><th>Last completed</th><th>Limit</th><th>State</th></tr></thead>
            <tbody>
              {(health.jobs || []).map((job) => (
                <tr key={job.id || job.label}>
                  <td>{job.label}</td>
                  <td>{job.ageH == null ? 'never' : `${job.ageH} h ago`}</td>
                  <td>{job.maxH > 24 * 300 ? 'once' : job.maxH >= 48 ? `${Math.round(job.maxH / 24)} d` : `${job.maxH} h`}</td>
                  <td className={job.state === 'ok' || job.state === 'running' ? 'ol-ok' : job.state === 'not configured' ? 'ol-wait' : 'ol-bad'}>{job.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="ol-meta">Nightly backups (last 14 kept): {(health.backups || []).slice(0, 3).join(', ') || 'none yet'}. A late job raises an alert once a day.</p>
        </div>
      )}
      <div className="ol-box">
        <h3>Forecast vs airport thermometers</h3>
        <p className="ol-meta">Window {stations.window ? `${stations.window.start_date} to ${stations.window.end_date}` : '–'}, updated {ago(stations.at)}.</p>
        {stations.stations?.length ? (
          <table className="fc-table">
            <thead><tr><th>Station</th><th>Nearest tehsil</th><th>Hours</th><th>24 h raw</th><th>With correction</th><th>Served</th><th>Reanalysis RMSE / bias</th></tr></thead>
            <tbody>
              {stations.stations.map((row) => {
                const lead = row.leads?.['24'] || {};
                const guard = lead.guarded === true;
                const served = guard ? lead.rmse_raw : (lead.correction_applied ? lead.rmse_served : lead.rmse_raw);
                return (
                  <tr key={row.id || row.name}>
                    <td>{row.name}</td>
                    <td>{row.nearestTehsil || '–'} <span className="ol-meta">{row.nearestKm != null ? `${row.nearestKm} km` : ''}</span></td>
                    <td>{lead.n || 0}</td>
                    <td>{lead.rmse_raw ?? '–'}</td>
                    <td>{lead.correction_applied ? lead.rmse_served : 'none'}</td>
                    <td><b>{served ?? '–'}</b>{guard ? ' correction off' : ''}</td>
                    <td>{row.era5 ? `${row.era5.rmse} / ${row.era5.bias > 0 ? '+' : ''}${row.era5.bias}` : '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <div className="ol-note ol-warn">{stations.running ? 'Running…' : `No station results yet${stations.lastError ? `: ${stations.lastError}` : ''}.`}</div>}
      </div>
      {seasonal && (
        <div className="ol-box">
          <h3>Weeks-ahead and seasonal record</h3>
          <p>Logged: <b>{seasonal.logs?.ec46}</b> weeks-ahead ensemble issues, <b>{seasonal.logs?.seas5}</b> seasonal ensemble issues. Anomaly climate (global reanalysis 1993–2016): {seasonal.anomalyClimate ? 'ready' : 'building'}.</p>
          <SeasonScores seasonal={seasonal} />
          <p className="ol-meta">{seasonal.reading}</p>
        </div>
      )}
      <div className="ol-box">
        <h3>Ensemble record and calibration</h3>
        <p>Runs logged: <b>{ensemble.logs || 0}</b>{ensemble.firstIssue ? ` since ${ensemble.firstIssue}` : ''} · verified forecast-observation pairs: <b>{ensemble.verifiedPairs || 0}</b>{ensemble.firstScoreExpected && !ensemble.verifiedPairs ? ` · first scores expected ${ensemble.firstScoreExpected}` : ''}</p>
        {!!leads.length && (
          <div className="ol-wrap">
            <table className="fc-table">
              <thead>
                <tr>
                  <th>Lead</th><th>Pairs</th><th>Max inside 10–90%</th><th>Median max error</th>
                  {TH_ORDER.map((key) => <th key={key}>{TH[key]}</th>)}
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => {
                  const row = ensemble.leads[lead];
                  return (
                    <tr key={lead}>
                      <td>day {lead}</td>
                      <td>{row.pairs}</td>
                      <td>{row.coverage10to90?.tx != null ? `${row.coverage10to90.tx}%` : '–'}</td>
                      <td>{row.maeMedian?.tx ?? '–'}</td>
                      {TH_ORDER.map((key) => {
                        const score = row.thresholds?.[key];
                        return <td key={key}>{score?.events ? <>{score.brierSkill ?? '–'} <span className="ol-meta">{score.events} ev</span></> : <span className="ol-meta">no events</span>}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="ol-meta">{ensemble.rule} No archive of past ensemble members exists, so the record starts with the first logged run.</p>
      </div>
    </>
  );
}

function SeasonScores({ seasonal }) {
  const rows = [
    ...Object.entries(seasonal.ec46 || {}).map(([key, row]) => [`weeks-ahead ensemble, week ${key.replace('week', '')}`, row]),
    ...Object.entries(seasonal.seas5 || {}).map(([key, row]) => [`SEAS5 month +${key.replace('month', '')}`, row]),
  ];
  if (!rows.length) return <p className="ol-meta">First weekly scores arrive 6 days after the first logged week ends; monthly scores after the first full month.</p>;
  return (
    <div className="ol-wrap">
      <table className="fc-table">
        <thead><tr><th>Lead</th><th>Pairs</th><th>Temp sign hit</th><th>Rain sign hit</th><th>Brier warmer / wetter</th><th>Temp anomaly correlation</th></tr></thead>
        <tbody>
          {rows.map(([label, row]) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{row.pairs}</td>
              <td>{row.tempSignHit ?? '–'}</td>
              <td>{row.rainSignHit ?? '–'}</td>
              <td>{row.brierWarmer != null ? `${row.brierWarmer} / ${row.brierWetter}` : '–'}</td>
              <td>{row.tempAnomalyCorrelation ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function RiverPane({ river, gauges, snow, onDay }) {
  return (
    <>
      <GaugeTable gauges={gauges} />
      <SnowTable snow={snow} />
      {!river && <p className="ol-meta">Loading the river reaches…</p>}
      {river && !river.ready && <div className="ol-note ol-warn">{river.why || 'The riverine job has not run.'}</div>}
      {river?.ready && (
        <>
          <div className="ol-note"><b>Riverine flood, {river.points} main-stem points.</b> {river.disclaimer}</div>
          {river.tributaries && <div className="ol-note ol-warn"><b>Not published for mountain tributaries.</b> {river.tributaries}</div>}
          <Days days={river.days} index={river.dayIndex} onPick={onDay} />
          <p className="ol-meta">{river.members} ensemble members{river.at ? ` · issued ${String(river.at).replace('T', ' ').slice(0, 16)} UTC` : ''}{river.stale ? ` · ${river.staleWhy || 'stale'}` : ''}</p>
          <div className="ol-wrap">
            <table className="fc-table">
              <thead><tr><th>Point</th><th>River</th><th>Level<small>how rare the forecast flow is for this reach</small></th><th>Members above the 2-year flow</th><th>Members above the 5-year flow</th></tr></thead>
              <tbody>
                {(river.rows || []).map((row) => (
                  <tr key={row.id}>
                    <td><b>{row.name}</b><div className="ol-meta">{row.kind} · {row.province}</div></td>
                    <td>{row.river}</td>
                    <td className={`ol-lv ol-lv-${String(row.level || '').toLowerCase()}`}><b>{row.level || 'No data'}</b><div className="ol-meta">{row.level ? (row.band || row.word) : (row.classWhy || 'no level for this reach')}</div></td>
                    <td>{row.shareAbove2yr == null ? '–' : `${row.shareAbove2yr}%`}</td>
                    <td>{row.shareAbove5yr == null ? '–' : `${row.shareAbove5yr}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ol-note"><b>How to read the level.</b> Each reach is compared only with the same model’s own daily record at that reach. Normal is below the reach’s 5-year flow, Moderate is a 5-year flow or rarer, High is a 20-year flow, and Severe is 1.5 times the 20-year flow. The level is the ensemble median on the chosen day.</div>
        </>
      )}
    </>
  );
}
function GaugeTable({ gauges }) {
  if (!gauges) return <p className="ol-meta">Loading the gauge outlook…</p>;
  if (!gauges.ready) return <div className="ol-note ol-warn"><b>Big-river outlook from the gauges.</b> {gauges.why || 'Not issued yet.'}</div>;
  const head = gauges.gauges?.[0]?.days || [];
  return (
    <>
      <div className="ol-note"><b>Big-river outlook from the gauges, next 3 days.</b> Flow in thousand cusecs at the barrage and dam gauges, measured on {gauges.basedOn}, and AGN’s gauge model for the next three days. It never goes below the last measured flow, so it is a warning floor rather than a flow forecast. Class is the national flood limit for that gauge.{gauges.stale ? ` No new daily river sheet for ${gauges.ageDays} days.` : ''}</div>
      <div className="ol-wrap">
        <table className="fc-table">
          <thead><tr><th>Gauge</th><th>Measured<small>{gauges.basedOn}</small></th>{head.map((day) => <th key={day.date}>{dlab(day.date)}</th>)}</tr></thead>
          <tbody>
            {(gauges.gauges || []).map((row) => (
              <tr key={row.id}>
                <td><b>{row.name}</b>{row.method && row.method !== 'model' ? <div className="ol-meta">{row.method}</div> : null}</td>
                <td>{row.kcusecs == null ? '–' : Math.round(row.kcusecs).toLocaleString()}{row.clsName ? <div className="ol-meta">{row.clsName}</div> : null}</td>
                {row.days?.length ? row.days.map((day) => <td key={day.date}>{day.kcusecs == null ? '–' : Math.round(day.kcusecs).toLocaleString()}{day.clsName ? <div className="ol-meta">{day.clsName}</div> : null}</td>) : <td colSpan={Math.max(1, head.length || 1)} className="ol-meta ol-span">No outlook: no reading since {row.lastReading}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {gauges.heldOut && <p className="ol-meta">Internal: held out over three monsoons, Medium or above caught {Math.round(gauges.heldOut['1'].pod * 100)}% / {Math.round(gauges.heldOut['2'].pod * 100)}% / {Math.round(gauges.heldOut['3'].pod * 100)}% at 1 / 2 / 3 days (false alarms {Math.round(gauges.heldOut['1'].far * 100)}% / {Math.round(gauges.heldOut['2'].far * 100)}% / {Math.round(gauges.heldOut['3'].far * 100)}%); “tomorrow = today” catches {Math.round(gauges.heldOut['1'].pers_pod * 100)}% / {Math.round(gauges.heldOut['2'].pers_pod * 100)}% / {Math.round(gauges.heldOut['3'].pers_pod * 100)}%.</p>}
    </>
  );
}
function SnowTable({ snow }) {
  if (!snow) return null;
  if (!snow.ready) return <div className="ol-note ol-warn"><b>Snow in the northern valleys.</b> {snow.why || 'Not issued yet.'}</div>;
  return (
    <>
      <div className="ol-note"><b>Snow on the ground in the northern valleys.</b> From the valley weather stations’ snow-depth sensors, as of {snow.asOf || '–'}. Seasonal snow only (each sensor’s late-summer ground level is taken off). Screening words, not verified against melt-flow records.{snow.stale ? <b className="ol-bad"> No new snow reading for {snow.ageDays} days.</b> : null}</div>
      <table className="fc-table">
        <thead><tr><th>Area</th><th>Snowpack</th><th>Last 7 days</th><th>Against last year</th><th>Feeds</th></tr></thead>
        <tbody>
          {(snow.areas || []).map((area) => (
            <tr key={area.id || area.name}>
              <td><b>{area.name}</b><div className="ol-meta">{area.stations ? `${area.stations} station${area.stations > 1 ? 's' : ''} reporting` : 'no station reporting'}</div></td>
              <td>{area.snowpack || 'No data'}</td>
              <td>{area.trend || '–'}</td>
              <td>{area.vsLastYear || '–'}</td>
              <td className="ol-meta">{area.feeds}{area.meltToRivers ? ' · melt water is reaching this river' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!!snow.stations?.length && (
        <details className="ol-meta"><summary>Internal: {snow.stations.filter((row) => row.reporting).length} of {snow.stations.length} snow sensors reporting (station figures, cm)</summary>
          <table className="fc-table">
            <thead><tr><th>Station</th><th>Area</th><th>Height m</th><th>Depth</th><th>7-day change</th><th>Last year</th><th>Last day</th></tr></thead>
            <tbody>{snow.stations.map((row) => <tr key={row.station}><td>{row.station}</td><td>{row.area || '–'}</td><td>{row.elevM ?? '–'}</td><td>{row.depthCm ?? '–'}</td><td>{row.change7dCm ?? '–'}</td><td>{row.lastYearCm ?? '–'}</td><td>{row.lastDay || ''}{row.reporting ? '' : ' (silent)'}</td></tr>)}</tbody>
          </table>
        </details>
      )}
    </>
  );
}

function SkillPane({ skill }) {
  if (!skill) return <p className="ol-meta">Loading the skill sheet…</p>;
  if (skill.error || (!skill.reference && !skill.parameters && !skill.statement)) return <div className="ol-note ol-warn">The skill sheet is not available.</div>;
  if (!skill.reference) {
    const measured = skill.measured?.lines || {};
    return (
      <>
        <div className="ol-note"><b>{skill.title || 'Methods'}.</b> {skill.statement}</div>
        <div className="ol-wrap">
          <table className="fc-table ol-wrap-cells">
            <thead><tr><th>Value</th><th>What it measures</th></tr></thead>
            <tbody>
              {(skill.parameters || []).map((row) => (
                <tr key={row.id}><td><b>{row.label || row.id}</b></td><td>{row.measurand}{row.domain ? <div className="ol-meta">{row.domain}</div> : null}{row.method ? <div className="ol-meta">{row.method}</div> : null}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {!!skill.thresholds?.length && (
          <>
            <h3>Thresholds used</h3>
            <ul className="ol-list">{skill.thresholds.map((row) => <li key={row.id || row.label}>{row.label || row.id}</li>)}</ul>
          </>
        )}
        {!!Object.keys(measured).length && (
          <>
            <h3>Measured accuracy</h3>
            {Object.entries(measured).map(([key, lines]) => (
              <div className="ol-box" key={key}>
                <h3>{key}</h3>
                {(lines || []).map((line) => <p key={line} className="ol-meta">{line}</p>)}
              </div>
            ))}
            {skill.measured?.note && <p className="ol-meta">{skill.measured.note}</p>}
          </>
        )}
      </>
    );
  }
  const ranking = (skill.parameters || []).find((row) => row.id === 'model_ranking');
  return (
    <>
      <div className="ol-note"><b>What every number here is worth.</b> Measured {skill.measuredOn} · sheet version {skill.version}. {skill.reference.caveat}{skill.refit ? ` Refit: ${skill.refit}` : ''}</div>
      <div className="ol-note"><b>Reference.</b> {skill.reference.network} · {skill.reference.rows ? `${(skill.reference.rows.screened / 1e6).toFixed(1)}M rows screened, ${(skill.reference.rows.usable / 1e6).toFixed(1)}M usable` : ''} · trusted for temperature: {skill.reference.trustCohorts?.temperature}, for rainfall: {skill.reference.trustCohorts?.rainfall}. Model: {skill.reference.model}</div>
      <h3>Parameters</h3>
      <div className="ol-wrap">
        <table className="fc-table ol-wrap-cells">
          <thead><tr><th>Parameter</th><th>Measurand and domain</th><th>Measured</th><th>What the platform does</th></tr></thead>
          <tbody>
            {(skill.parameters || []).filter((row) => row.id !== 'model_ranking').map((row) => (
              <tr key={row.id}>
                <td><b>{row.label}</b><div className={row.verified ? 'ol-ok' : 'ol-bad'}>{row.verified ? 'verified' : 'NOT VERIFIED'}</div></td>
                <td>{row.measurand || '–'}<div className="ol-meta">{row.domain}</div>{row.sample ? <div className="ol-meta">{row.sample}</div> : null}</td>
                <td>{measuredBits(row)}{row.note ? <div className="ol-meta">{row.note}</div> : null}</td>
                <td>{row.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ranking && (
        <>
          <h3>Which model, measured against the reference stations</h3>
          {!ranking.result && <div className="ol-note">{ranking.sample || 'not run'}. {ranking.action}</div>}
          {ranking.result && <RankingTable ranking={ranking} />}
        </>
      )}
      <h3>Fitted and deliberately not deployed</h3>
      <table className="fc-table ol-wrap-cells">
        <thead><tr><th>What</th><th>Why it is withheld</th></tr></thead>
        <tbody>{(skill.withheld || []).map((row) => <tr key={row.what}><td><b>{row.what}</b></td><td>{row.why}</td></tr>)}</tbody>
      </table>
    </>
  );
}
function measuredBits(row) {
  const bits = [];
  if (row.raw) bits.push(`raw ${JSON.stringify(row.raw).replace(/[{}"]/g, '').replace(/,/g, ', ')}`);
  if (row.corrected && typeof row.corrected === 'object' && row.corrected.mae_C != null) bits.push(`corrected MAE ${row.corrected.mae_C} °C`);
  else if (row.corrected && row.corrected.bias_C != null) bits.push(`corrected bias ${row.corrected.bias_C} °C`);
  return bits.length ? bits.join(' · ') : <span className="ol-meta">no paired measurement</span>;
}
function RankingTable({ ranking }) {
  const unit = { temperature_2m: ' °C', precipitation: ' mm/d', wind_gusts_10m: ' km/h' };
  const rows = [];
  Object.entries(ranking.result || {}).forEach(([region, fields]) => {
    Object.entries(fields || {}).forEach(([key, row]) => rows.push({ region, key, row }));
  });
  return (
    <>
      <div className="ol-note">{ranking.sample}. <b>Serving:</b> {ranking.deployed}</div>
      <div className="ol-wrap">
        <table className="fc-table">
          <thead><tr><th>Region</th><th>Field</th><th>Lead</th><th>Closest (MAE)</th><th>global forecast model</th><th>Spread best–worst</th><th>Catches rain days</th></tr></thead>
          <tbody>
            {rows.map(({ region, key, row }) => {
              const parts = key.split('|');
              const suffix = unit[parts[0]] || '';
              return (
                <tr key={`${region}${key}`}>
                  <td>{region}</td>
                  <td>{`${(parts[0] || '').replace('_2m', '').replace('_10m', '').replaceAll('_', ' ')} · ${(parts[1] || '').replaceAll('_', ' ')}`}</td>
                  <td>{parts[2]}</td>
                  <td><b>{row.best}</b> {row.mae}{suffix} (bias {row.bias > 0 ? '+' : ''}{row.bias}{suffix}, {row.stations} st.)</td>
                  <td>{row.ecmwf_ifs025_mae != null ? `${row.ecmwf_ifs025_mae}${suffix}` : '–'}</td>
                  <td>{row.spread != null ? row.spread : '–'}</td>
                  <td>{row.rainHit != null ? row.rainHit : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
