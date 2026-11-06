import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getPointBundle, peekPointBundle, cachedGet } from '../analyst/placeCache.js';
import { getJson } from '../start/api.js';
import { go } from '../nav.js';

const TABS = [
  ['now', 'Now', 'var(--c-now)', '#2F6468'],
  ['fc', 'Forecast', 'var(--c-fc)', '#4A7D82'],
  ['hz', 'Hazards', 'var(--c-hz)', '#AF601C'],
  ['place', 'This place', 'var(--c-place)', '#128282'],
  ['p30', 'Past 30 days', 'var(--c-p30)', '#2F6E84'],
  ['rep', 'Report', 'var(--c-rep)', '#2C8453'],
];
const COL = ['#BFD6B4', '#E8D48A', '#E6B655', '#E39A3B', '#C8553D'];
const WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
const ORDER = ['heat', 'cold', 'rain_hz', 'flood', 'wind', 'landslide', 'glof', 'drought'];
const SHORT = { heat: 'Heat stress', cold: 'Cold stress', rain_hz: 'Heavy rain', flood: 'Flood', wind: 'Wind and gusts', landslide: 'Landslide', glof: 'GLOF', drought: 'Drought' };
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fin(value) {
  return value != null && value !== '' && Number.isFinite(+value);
}
function r0(value) {
  if (!fin(value)) return null;
  const n = Math.round(+value);
  return n === 0 ? '0' : String(n);
}
function r1(value) {
  if (!fin(value)) return null;
  return (Math.round(+value * 10) / 10).toFixed(1).replace(/^-0\.0$/, '0.0');
}
function dayLab(iso) {
  if (!iso) return '';
  const date = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  return `${DAY[date.getUTCDay()]} ${date.getUTCDate()} ${MON[date.getUTCMonth()]}`;
}
function dayLong(iso) {
  if (!iso) return '';
  const date = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  return `${DAY[date.getUTCDay()]} ${date.getUTCDate()} ${MON[date.getUTCMonth()]}`;
}
function pktText(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t + 5 * 3600e3);
  return `${DAY[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]} · ${d.toISOString().slice(11, 16)} PKT`;
}
function loadStrip() {
  if (window.AGNHourStrip) return Promise.resolve(window.AGNHourStrip);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/agn-hour-strip.js';
    script.onload = () => resolve(window.AGNHourStrip);
    script.onerror = () => reject(new Error('hour strip'));
    document.head.appendChild(script);
  });
}

export default function PlaceDrawer({ place, day = 0, onClose, analystPath }) {
  const [tab, setTab] = useState('now');
  const [point, setPoint] = useState(null);
  const [past, setPast] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [strip, setStrip] = useState(null);

  useEffect(() => {
    let cancel = false;
    setPast(null);
    setError('');
    setTab('now');
    const parts = 'default,context,hazardCount';
    const cached = peekPointBundle(place.lat, place.lon, parts);
    if (cached?.ok) setPoint(cached);
    else setPoint(null);
    getPointBundle({
      lat: place.lat,
      lon: place.lon,
      name: place.name || '',
      parts,
    }).then((body) => {
      if (cancel) return;
      if (!body || body.ok !== true) {
        setError(body?.why || 'This place did not return a forecast.');
        return;
      }
      setPoint(body);
    }).catch(() => { if (!cancel) setError('This place did not answer.'); });
    const pastUrl = `/api/report/past30?lat=${place.lat.toFixed(5)}&lon=${place.lon.toFixed(5)}${place.name ? `&name=${encodeURIComponent(place.name)}` : ''}`;
    cachedGet(pastUrl).then((body) => {
      if (!cancel) setPast(body?.ok ? body : null);
    }).catch(() => {});
    loadStrip().then((api) => { if (!cancel) setStrip(api); }).catch(() => {});
    return () => { cancel = true; };
  }, [place?.lat, place?.lon, place?.name]);

  const shown = point?.shown || {};
  const now = point?.now || {};
  const info = point?.place || {};
  const title = place.name || info.name || 'Selected place';
  const area = [info.district, info.province].filter(Boolean).join(' · ');
  const heat = heatToday(point);
  const chip = heat && heat.i != null ? { background: COL[heat.i], color: heat.i === 4 ? '#fff' : '#1F2A2B' } : null;
  const temp = shown.now?.value ?? r1(now.tempC);
  const index = TABS.findIndex((row) => row[0] === tab);
  const rainWin = strip && point ? rainNow(strip, point) : null;

  function share() {
    const url = `${window.location.origin}/#agnplace=${place.lat.toFixed(5)},${place.lon.toFixed(5)},${encodeURIComponent(title)}`;
    navigator.clipboard?.writeText(url).then(() => setNote('Link copied.')).catch(() => setNote(url));
  }

  function save() {
    const row = { lat: place.lat, lon: place.lon, name: title, tehsil: info.tehsil, district: info.district, province: info.province, elevM: info.elevM, at: Date.now() };
    const saved = JSON.parse(localStorage.getItem('nigraan.sites') || '[]');
    saved.unshift(row);
    localStorage.setItem('nigraan.sites', JSON.stringify(saved.slice(0, 40)));
    const assetId = `site-${place.lat.toFixed(4)}-${place.lon.toFixed(4)}`;
    getJson('/api/case/project?id=my-sites').then((existing) => {
      const doc = existing && !existing.__status && existing.document?.manifest ? existing.document : {
        manifest: { project_schema_version: 3, project_id: 'my-sites', client_name: 'My sites', created_at: new Date().toISOString() },
        company: { client_name: 'My sites', active_asset_id: null },
        assets: [],
      };
      doc.assets = Array.isArray(doc.assets) ? doc.assets : [];
      if (doc.assets.some((asset) => asset.asset_id === assetId)) {
        setNote(`Already in My sites (${doc.assets.length}).`);
        return null;
      }
      doc.assets.push({
        asset_id: assetId, name: title, location: info.tehsil || '', tehsil: info.tehsil || '', district: info.district || '', province: info.province || '',
        latitude: +place.lat.toFixed(5), longitude: +place.lon.toFixed(5), elevation_m: Number.isFinite(+info.elevM) ? Math.round(info.elevM) : null,
        asset_type: 'site', record_source: 'saved from the NIGRAAN start page', saved_at: new Date().toISOString(),
      });
      if (!doc.company) doc.company = { client_name: 'My sites' };
      doc.company.active_asset_id = assetId;
      return fetch('/api/case/project', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(doc) });
    }).then((response) => {
      if (!response) return null;
      return response.json().then((body) => ({ ok: response.ok, body }));
    }).then((result) => {
      if (!result) return;
      setNote(result.ok ? `Saved to My sites (${result.body.assets || ''}).` : 'Saved on this computer. The site list on the server was not updated.');
    }).catch(() => setNote('Saved on this computer.'));
  }

  return (
    <aside id="card" className="open" aria-label="Site drawer" data-tab={tab}>
      <div className="d-head">
        <div className="nm">
          <h1 id="cName">{title}</h1>
          <div className="c-sub" id="cSub">{area}{fin(info.elevM) ? ` · ${Math.round(info.elevM)} m` : ''}</div>
        </div>
        <span className="tchip" style={chip || undefined} title={heat ? `Heat stress today: ${heat.word}` : 'Heat level not available'}>
          {temp != null ? <>{temp}<small>°C</small></> : <small>…</small>}
        </span>
        <button type="button" className="c-x" id="cClose" aria-label="Close" onClick={onClose}>×</button>
      </div>
      <nav id="dTabs" role="tablist" aria-label="Site sections">
        {TABS.map(([id, label, color, solid]) => (
          <button key={id} type="button" className="dtab" role="tab" aria-selected={tab === id} style={{ '--tc': color, '--ts': solid }} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>
      <div id="dDots" aria-hidden="true">
        {TABS.map(([id, , color]) => <i key={id} className={tab === id ? 'on' : undefined} style={{ '--tc': color }} />)}
      </div>
      <div id="dView">
        <div id="dTrack" style={{ transform: `translateX(${(-index * 100) / 6}%)` }}>
          <section className="pane" style={{ '--tc': 'var(--c-now)' }} aria-hidden={tab !== 'now'}>
            {error && <p className="note">{error}</p>}
            {!point && !error && <p className="note">Reading this place…</p>}
            {point && (
              <div className="now-pane">
                <div className="now" id="nowBox">
                  <div
                    className="t"
                    style={chip ? { '--tc2': chip.background, '--tt2': chip.color } : undefined}
                  >
                    {temp != null ? <>{temp}<small>°C</small></> : <small>No temperature</small>}
                  </div>
                  <div className="d">
                    <ul className="now-kvs">
                      {shown.now?.feels != null && <li><span>Feels like</span><b>{shown.now.feels}°</b></li>}
                      <li><span>Humidity</span><b>{shown.now?.rh ?? r0(now.rh) ?? '—'}%</b></li>
                      <li><span>Wind</span><b>{shown.now?.wind ?? r0(now.windKmh) ?? '—'} km/h</b></li>
                      {shown.today?.low != null && (
                        <li><span>Today</span><b>{shown.today.low}–{shown.today.high}°</b></li>
                      )}
                    </ul>
                    {(shown.measured?.label || shown.now?.label) && (
                      <p className="now-src">{shown.measured?.label || shown.now.label}</p>
                    )}
                  </div>
                  {shown.airNow?.label && (
                    <p className="now-aqi" title={shown.airNow.label}>{shortAir(shown.airNow.label)}</p>
                  )}
                </div>

                <NowStats point={point} rainWin={rainWin} />

                {heat && (
                  <div className="now-heat">
                    <span
                      className="npill"
                      id="nowPill"
                      style={{
                        background: heat.i == null ? '#E6E9E8' : COL[heat.i],
                        color: heat.i === 4 ? '#fff' : '#1F2A2B',
                      }}
                    >
                      Heat stress today: {heat.word}
                    </span>
                    <span className="supp">at this point</span>
                  </div>
                )}

                <div className="sec now-actions" id="repBar">
                  <button type="button" className="pri now-primary" onClick={() => setTab('rep')}>Build the site report</button>
                  <div className="btns now-secondary">
                    <button type="button" onClick={share}>Share link</button>
                    <button type="button" onClick={save}>Save site</button>
                  </div>
                  <div className="btns2">
                    <button type="button" className="lnk" onClick={() => go(analystPath)}>Full forecast in the Analyst view</button>
                  </div>
                  <div className="status" role="status">{note}</div>
                </div>
              </div>
            )}
          </section>
          <section className="pane" style={{ '--tc': 'var(--c-fc)' }} aria-hidden={tab !== 'fc'}>
            {point && <Forecast point={point} strip={strip} />}
          </section>
          <section className="pane" style={{ '--tc': 'var(--c-hz)' }} aria-hidden={tab !== 'hz'}>
            {point && <Hazards point={point} />}
          </section>
          <section className="pane" style={{ '--tc': 'var(--c-place)' }} aria-hidden={tab !== 'place'}>
            <Facts fields={point?.parts?.facts?.v?.fields} />
          </section>
          <section className="pane" style={{ '--tc': 'var(--c-p30)' }} aria-hidden={tab !== 'p30'}>
            <Past record={past} />
          </section>
          <section className="pane" style={{ '--tc': 'var(--c-rep)' }} aria-hidden={tab !== 'rep'}>
            <ReportPane place={place} title={title} />
          </section>
        </div>
      </div>
    </aside>
  );
}

function heatToday(point) {
  const day = point?.parts?.hazardCount?.v?.days?.[0];
  const bar = (day?.bars || []).find((row) => row.key === 'heat');
  if (!bar) return null;
  return bar.state === 'level' && fin(bar.level) ? { i: +bar.level, word: bar.label || WORDS[+bar.level] } : { i: null, word: bar.word || 'Not assessed' };
}

function rain72(point) {
  const from = point?.now?.time || '';
  const rows = (point?.hours || []).filter((row) => String(row.time) >= String(from)).slice(0, 72);
  if (!rows.length || rows.some((row) => !fin(row.rainMm))) return null;
  return rows.reduce((sum, row) => sum + Number(row.rainMm), 0);
}

function airDay(point) {
  const days = point?.parts?.smog?.v?.days;
  return Array.isArray(days) ? days[0] : null;
}

function rainNow(strip, point) {
  const now = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 13) + ':00';
  const start = strip.win(now);
  const keys = [...new Set((point.hours || []).map((row) => strip.win(row.time)).filter((key) => key && key >= start))].slice(0, 3);
  const cells = strip.cells(point, keys, {});
  const hit = cells.find((cell) => cell && cell.p != null);
  if (!hit) return null;
  return { p: String(hit.p), win: `${hit.key.slice(11, 16)}–${strip.winEnd(hit.key)}` };
}

function shortAir(label) {
  const text = String(label || '');
  const aqi = text.match(/AQI\s+(\d+)/i);
  const cat = text.match(/·\s*([^·(]+?)(?:\s*\(|$)/);
  if (aqi && cat) return `AQI ${aqi[1]} · ${cat[1].trim()}`;
  if (aqi) return `AQI ${aqi[1]}`;
  return text.length > 72 ? `${text.slice(0, 70)}…` : text;
}

function NowStats({ point, rainWin }) {
  const now = point.now || {};
  const air = airDay(point);
  const aqi = air && fin(air.aqi) ? String(Math.round(+air.aqi)) : null;
  const hour = air?.aqiNow && fin(air.aqiNow.aqi) ? Math.round(+air.aqiNow.aqi) : null;
  const airNote = [
    air?.aqiCategory || null,
    hour != null && String(hour) !== aqi ? `this hour ${hour}` : null,
  ].filter(Boolean).join(' · ');
  return (
    <div className="stat4" id="nowStats">
      <Stat value={r1(now.dewC)} unit="°C" missing="Not in this forecast" label="Dew point" />
      <Stat value={r0(now.gustKmh)} unit="km/h" missing="Not in this forecast" label="Gusts now" />
      <Stat value={r1(rain72(point))} unit="mm" missing="Not issued" label="Rain next 72 h" />
      <Stat value={r0(now.uv)} missing="Not in this forecast" label="UV index" />
      <Stat
        value={rainWin ? rainWin.p : null}
        unit="%"
        missing="Not issued"
        label="Chance of rain"
        note={rainWin ? `${rainWin.win} PKT` : null}
      />
      <Stat value={aqi} missing="No air forecast here" label="Air quality" note={airNote || null} />
    </div>
  );
}

function Stat({ value, unit, missing, label, note }) {
  const blank = value == null;
  return (
    <div className={blank ? 'is-miss' : undefined}>
      <b>{blank ? missing : <>{value}{unit ? <small> {unit}</small> : null}</>}</b>
      <span>{label}{note ? ` · ${note}` : ''}</span>
    </div>
  );
}

function Forecast({ point, strip }) {
  const days = point.days || [];
  const chance = point.parts?.rainChance?.v?.days || [];
  return (
    <div className="fc-pane">
      <section className="fc-block" id="n3Sec">
        <header className="fc-head">
          <h2>Next 3 days</h2>
          <p>Day highs and lows at this point · rain chance for the surrounding area</p>
        </header>
        <div className="days3">
          {days.slice(1, 4).map((row) => {
            const found = chance.find((item) => item.date === row.date);
            const pct = found?.p?.['1'];
            return (
              <article key={row.date} data-date={row.date} className="fc-day">
                <div className="dl">{dayLab(row.date)}</div>
                <div className="tt">{r0(row.tmaxC) || '–'}° <span>{r0(row.tminC) || '–'}°</span></div>
                <div className="dr">{fin(pct) ? <><b>{r0(pct)}%</b> chance of a rain day</> : 'Chance of rain not issued'}</div>
                <div className="dr mm">{fin(row.rainMm) ? <>Forecast <b>{r1(row.rainMm)} mm</b></> : 'Amount not issued'}</div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="fc-block fc-chart">
        <header className="fc-head">
          <h2>Temperature</h2>
          <p>Next 72 hours at this site (PKT)</p>
        </header>
        <TempChart point={point} />
      </section>

      <section className="fc-block fc-strip">
        <HourStrip point={point} strip={strip} />
      </section>

      <section className="fc-block">
        <header className="fc-head">
          <h2>Next 12 hours</h2>
          <p>Point forecast · rain in 3-hour PKT windows</p>
        </header>
        <Hours point={point} strip={strip} />
      </section>

      <section className="fc-block">
        <header className="fc-head">
          <h2>Today and the next 3 days</h2>
          <p>Daily totals at this point · hazard levels for the surrounding area</p>
        </header>
        <DayTable point={point} />
      </section>
    </div>
  );
}

function TempChart({ point }) {
  const from = point.now?.time || '';
  const hours = (point.hours || []).filter((row) => String(row.time) >= String(from) && fin(row.tempC)).slice(0, 73);
  if (hours.length < 6) return <div className="note">The hourly forecast is too short to draw.</div>;
  const width = 376;
  const height = 150;
  const left = 30;
  const right = 6;
  const top = 8;
  const bottom = 20;
  let lo = Math.min(...hours.map((row) => +row.tempC));
  let hi = Math.max(...hours.map((row) => +row.tempC));
  const step = Math.max(2, Math.ceil((hi - lo) / 4 / 2) * 2);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  if (hi === lo) hi = lo + step;
  const x = (i) => left + ((width - left - right) * i) / (hours.length - 1);
  const y = (v) => top + ((height - top - bottom) * (hi - v)) / (hi - lo);
  const pts = hours.map((row, i) => `${x(i).toFixed(1)} ${y(+row.tempC).toFixed(1)}`);
  const line = pts.join('L');
  const area = `${pts.join('L')}L${x(hours.length - 1).toFixed(1)} ${(height - bottom).toFixed(1)}L${x(0).toFixed(1)} ${(height - bottom).toFixed(1)}Z`;
  const grid = [];
  for (let v = lo; v <= hi + 1e-9; v += step) {
    grid.push(<line key={v} x1={left} x2={width - right} y1={y(v)} y2={y(v)} stroke="#E6ECEA" />);
    grid.push(<text key={`t${v}`} x={left - 5} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="#6B7775">{r0(v)}°</text>);
  }
  return (
    <>
      <svg className="n3c" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Hourly temperature at this site for the next 72 hours">
        <defs>
          <linearGradient id="fcTempFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5B9AA0" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#5B9AA0" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {grid}
        <path d={`M${area}`} fill="url(#fcTempFill)" stroke="none" />
        <path d={`M${line}`} fill="none" stroke="#2F6468" strokeWidth="2.25" strokeLinejoin="round" />
        <circle cx={x(0)} cy={y(+hours[0].tempC)} r="4" fill="#2F6468" stroke="#fff" strokeWidth="1.5" />
      </svg>
      <div className="n3leg"><span><i style={{ background: '#2F6468', height: 3 }} />Temperature at this site, °C (PKT)</span></div>
    </>
  );
}

function HourStrip({ point, strip }) {
  const host = useRef(null);
  const opts = useRef({ mode: '3', client: true, productType: 'Forecast' });
  useEffect(() => {
    if (!strip || !host.current) return undefined;
    host.current.innerHTML = strip.box(point, opts.current);
    strip.wire(host.current, () => point, opts.current);
    return undefined;
  }, [point, strip]);
  if (!strip) return <div className="note">The hour-by-hour strip is loading.</div>;
  return <div ref={host} />;
}

function Hours({ point, strip }) {
  const from = point.now?.time || '';
  const rows = (point.hours || []).filter((row) => String(row.time) >= String(from)).slice(0, 12);
  const cells = strip ? strip.cells(point, rows.map((row) => row.time), {}) : rows.map(() => null);
  const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
  return (
    <>
      <div className="twrap fc-table">
        <table className="t" id="h12Table">
          <thead>
            <tr>
              <th>PKT</th>
              <th className="n">Temp</th>
              <th className="n">Feels</th>
              <th className="n">Hum.</th>
              <th className="n">Wind</th>
              <th className="n">Gust</th>
              <th className="n">Rain 3 h</th>
              <th className="n">Chance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const cell = cells[i];
              const stamp = String(row.time).slice(0, 10) === today ? String(row.time).slice(11, 16) : `${dayLab(row.time)} ${String(row.time).slice(11, 16)}`;
              return (
                <tr key={row.time}>
                  <td className="fc-time">{stamp}</td>
                  <td className="n fc-temp">{r1(row.tempC) || '–'}<small>°</small></td>
                  <td className="n">{r0(row.feelsC) || '–'}</td>
                  <td className="n">{r0(row.rh) || '–'}{fin(row.rh) ? <small>%</small> : null}</td>
                  <td className="n">{r0(row.windKmh) || '–'}</td>
                  <td className="n">{r0(row.gustKmh) || '–'}</td>
                  {cell?.first ? <td className="n fc-rain" rowSpan={cell.span} dangerouslySetInnerHTML={{ __html: cell.rainHtml }} /> : !cell ? <td className="n">–</td> : null}
                  {cell?.first ? <td className="n fc-chance" rowSpan={cell.span} dangerouslySetInnerHTML={{ __html: cell.chanceHtml }} /> : !cell ? <td className="n">–</td> : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="fc-footnote">Rain and its chance are for 3-hour windows (PKT), not single hours.</p>
    </>
  );
}

function DayTable({ point }) {
  const days = (point.days || []).slice(0, 4);
  const chance = point.parts?.rainChance?.v?.days || [];
  const levels = point.parts?.levels?.v;
  return (
    <>
      <div className="twrap fc-table">
        <table className="t fc-days">
          <thead>
            <tr>
              <th>Day</th>
              <th className="n">Max</th>
              <th className="n">Min</th>
              <th>Rain chance</th>
              <th className="n">Rain mm</th>
              <th className="n">Gust</th>
              <th>Hazard</th>
            </tr>
          </thead>
          <tbody>
            {days.map((row, i) => {
              const found = chance.find((item) => item.date === row.date);
              const pct = found?.p?.['1'];
              const hours = (point.hours || []).filter((hour) => String(hour.time).slice(0, 10) === row.date);
              const gust = hours.reduce((max, hour) => (fin(hour.gustKmh) ? Math.max(max, +hour.gustKmh) : max), null);
              const hazards = hazardChips(levels, i);
              return (
                <tr key={row.date} className={i === 0 ? 'fc-today' : undefined}>
                  <td className="fc-dayname">{i === 0 ? 'Today' : dayLong(row.date)}</td>
                  <td className="n fc-temp">{r0(row.tmaxC) || '–'}<small>°</small></td>
                  <td className="n">{r0(row.tminC) || '–'}<small>°</small></td>
                  <td>{fin(pct) ? <span className="fc-pct"><b>{r0(pct)}%</b> rain day</span> : <span className="fc-muted">Not issued</span>}</td>
                  <td className="n">{r1(row.rainMm) || '–'}</td>
                  <td className="n">{gust == null ? '–' : r0(gust)}</td>
                  <td className="fc-hz">{hazards}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="fc-footnote">Temperatures, rain and wind are the forecast at this point and height. Levels are for the surrounding area.</p>
    </>
  );
}

const HZ_SHORT = {
  heat: 'Heat', cold: 'Cold', rain_hz: 'Rain', flood: 'Flood', wind: 'Wind',
  landslide: 'Slide', glof: 'GLOF', drought: 'Drought',
};

function hazardChips(levels, index) {
  const day = levels?.days?.[index];
  if (!day) return <span className="fc-muted">—</span>;
  const raised = ORDER.map((key) => {
    const layer = day.layers?.[key];
    if (!layer || !fin(layer.level) || layer.level <= 0) return null;
    return (
      <span key={key} className={`fc-hzchip L${layer.level}`}>
        {HZ_SHORT[key] || SHORT[key]} · {layer.word || WORDS[layer.level]}
      </span>
    );
  }).filter(Boolean);
  if (!raised.length) return <span className="fc-hzchip L0">all Normal</span>;
  return raised.slice(0, 2);
}

function Hazards({ point }) {
  const levels = point.parts?.levels?.v;
  const today = levels?.days?.[0];
  const actions = actionsOf(point);
  return (
    <>
      <div className="sec" id="hzSec">
        <div className="h">Hazards today{levels?.days?.[3] ? ` to ${dayLab(levels.days[3].date)}` : ''} · surrounding area{levels?.at ? <span className="r">as of {pktText(levels.at)}</span> : null}</div>
        <div className="supp">{[point.place?.tehsil, point.place?.district].filter(Boolean).join(', ')}</div>
        {!raised(today).length && <div className="note">No hazard above Normal for the surrounding area from today to {levels?.days?.[3] ? dayLab(levels.days[3].date) : 'the days ahead'}.</div>}
        <div className="hzt-grid">
          {ORDER.map((key) => {
            const layer = today?.layers?.[key];
            const level = layer && fin(layer.level) ? +layer.level : null;
            return (
              <div className="hzt" key={key} style={{ '--hc': level != null ? COL[level] : '#D3DCD9' }}>
                <span className="hn">{SHORT[key]}</span>
                {level != null ? <span className={`lvl L${level}`}>{layer.word || WORDS[level]}</span> : <span className="lvl LX">{layer?.word || 'Not assessed'}</span>}
                <span className="ht">{layer?.productType || 'Product type not recorded'}</span>
              </div>
            );
          })}
        </div>
      </div>
      {levels?.days && (
        <>
          <h2>All hazards · today and next 3 days</h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="t hz4">
              <thead>
                <tr>
                  <th>Hazard</th>
                  {levels.days.slice(0, 4).map((row, i) => <th key={row.date}>{i === 0 ? 'Today' : dayLab(row.date)}</th>)}
                </tr>
              </thead>
              <tbody>
                {ORDER.map((key) => (
                  <tr key={key}>
                    <td><strong>{SHORT[key]}</strong></td>
                    {levels.days.slice(0, 4).map((row) => {
                      const layer = row.layers?.[key];
                      const level = layer && fin(layer.level) ? +layer.level : null;
                      return <td className="mini" key={row.date}>{level != null ? <span className={`lvl L${level}`}>{layer.word || WORDS[level]}</span> : <span className="lvl LX">{layer?.word || 'Not issued'}</span>}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hz-foot">Levels are for the surrounding area{levels.at ? ` · as of ${pktText(levels.at)}` : ''}. Indicative and screening layers are shown for context and do not raise alerts.</p>
        </>
      )}
      <div className="sec hz-do" id="todoSec">
        <div className="hz-do-head">
          <div className="h">What to do</div>
          <span>{actions.length ? `${Math.min(actions.length, 3)} step${actions.length === 1 ? '' : 's'}` : 'None raised'}</span>
        </div>
        {actions.length ? (
          <ol className="hz-do-list">
            {actions.slice(0, 3).map((item, index) => (
              <li key={item.text} className={item.kind === 'standing' ? 'is-stand' : 'is-now'}>
                <span className="n" aria-hidden="true">{index + 1}</span>
                <div>
                  <p>{item.text}</p>
                  <div className="meta">
                    {item.who ? <span className="own">{item.who}</span> : null}
                    <span className="kind">{item.kind === 'standing' ? 'Standing measure' : 'For this forecast'}</span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : <div className="hz-do-empty">No action is raised for this place by the current forecast.</div>}
      </div>
    </>
  );
}

function raised(day) {
  if (!day?.layers) return [];
  return ORDER.map((key) => ({ key, ...day.layers[key] })).filter((layer) => fin(layer.level) && layer.level > 0);
}

function actionsOf(point) {
  const context = point?.parts?.context?.v || {};
  const out = [];
  (context.actions || []).forEach((item) => {
    const text = item.action || (Array.isArray(item.actions) ? item.actions[0] : null);
    if (text) out.push({ text, who: item.owner || null, kind: 'forecast' });
  });
  (context.standing || []).forEach((item) => {
    if (item.measure) out.push({ text: item.measure, who: item.owner || null, kind: 'standing' });
  });
  return out;
}

function Facts({ fields }) {
  if (!fields) {
    return (
      <div className="pl-pane">
        <section className="pl-block">
          <header className="pl-head"><h2>This place</h2><p>Site facts for this point</p></header>
          <p className="pl-empty">The facts for this place are loading.</p>
        </section>
      </div>
    );
  }
  const rows = [];
  const add = (label, value, source, kind = 'fact') => { if (value) rows.push({ label, value, source, kind }); };
  const elev = fields.elevation;
  if (elev && fin(elev.value)) add('Height', `${r0(elev.value)} m above sea level${fields.terrainPosition?.value ? ` · ${fields.terrainPosition.value}` : ''}`, elev.source, 'terrain');
  const water = fields.nearestWater;
  if (water && fin(water.value)) add('Nearest water', `${water.atLeast ? 'at least ' : ''}${r1(water.value)} km`, water.what || water.source, 'water');
  const river = fields.riverPoint;
  if (river && fin(river.value)) add('River point', `${river.name}, ${r1(river.value)} km`, river.source, 'water');
  const above = fields.heightAboveRiver;
  if (above && fin(above.value)) add('Above the river', `${r1(above.value)} m above the nearest drainage`, above.source, 'terrain');
  if (fields.floodMap?.summary) add('River flood map', factsCap(fields.floodMap.summary), fields.floodMap.source, 'flood');
  if (fields.flashCorridor?.summary) add('Hill torrents', fields.flashCorridor.summary, fields.flashCorridor.source, 'flood');
  const fault = fields.fault;
  if (fault && fin(fault.value)) add('Active fault', `${r1(fault.value)} km${fault.name ? ` (${fault.name})` : ''}${fault.slipType ? ` · ${String(fault.slipType).toLowerCase()} fault` : ''}`, fault.source, 'quake');
  if (fields.glof?.value) add('Glacial lakes upstream', fields.glof.value, fields.glof.source, 'water');
  if (fields.sun?.value?.sunrise) add('Sunrise · sunset', `${fields.sun.value.sunrise} · ${fields.sun.value.sunset} PKT`, fields.sun.what || fields.sun.source, 'sky');
  const normal = fields.normals;
  if (normal?.value && fin(normal.value.meanTempC)) add(`Normal for ${normal.month || 'this month'}`, `mean ${r1(normal.value.meanTempC)} °C${fin(normal.value.rainMm) ? ` · rain ${r0(normal.value.rainMm)} mm in the month` : ''}`, normal.source, 'climate');
  const cover = fields.landCover?.value;
  if (cover) {
    const names = { built: 'built', tree: 'trees', crop: 'crops', bare: 'bare ground', other: 'other' };
    const line = Object.keys(names).filter((key) => fin(cover[key]) && cover[key] > 0).sort((a, b) => cover[b] - cover[a]).map((key) => `${names[key]} ${cover[key]} %`).join(' · ');
    if (line) add('Land cover', line, fields.landCover.source, 'land');
  }
  return (
    <div className="pl-pane">
      <section className="pl-block">
        <header className="pl-head">
          <h2>This place</h2>
          <p>Terrain, water and site context at this point</p>
        </header>
        {!rows.length ? (
          <p className="pl-empty">No facts are held for this place.</p>
        ) : (
          <div id="factsBox" className="pl-facts">
            {rows.map((row) => (
              <article className={`pl-fact k-${row.kind}`} key={row.label}>
                <div className="pl-label">{row.label}</div>
                <div className="pl-value">{row.value}</div>
                {row.source ? <div className="pl-src">{row.source}</div> : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function factsCap(text) {
  const value = String(text || '');
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

function Past({ record }) {
  if (!record?.daily) {
    return (
      <div className="p30-pane">
        <section className="p30-block">
          <header className="p30-head"><h2>Past 30 days</h2><p>Observed weather at this place</p></header>
          <p className="p30-empty">The record of the past 30 days is not available for this place.</p>
        </section>
      </div>
    );
  }
  const summary = record.summary || {};
  const rainPct = fin(summary.rainMm) && fin(summary.rainNormalMm) && +summary.rainNormalMm > 0
    ? r0(100 * summary.rainMm / summary.rainNormalMm)
    : null;
  const days = [...record.daily].reverse();
  const measuredBy = commonStation(days);
  return (
    <div className="p30-pane">
      <section className="p30-block">
        <header className="p30-head">
          <h2>Past 30 days</h2>
          <p>{dayLong(record.from)} to {dayLong(record.to)}</p>
        </header>
        <div className="p30-kpis">
          <div className="p30-kpi">
            <span>Rain total</span>
            <b>{fin(summary.rainMm) ? `${r0(summary.rainMm)} mm` : '—'}</b>
            <em>{rainPct != null ? `${rainPct}% of normal` : (fin(summary.wetDays) ? `${summary.wetDays} wet day${+summary.wetDays === 1 ? '' : 's'}` : 'vs local normal')}</em>
          </div>
          <div className="p30-kpi">
            <span>Hottest</span>
            <b>{fin(summary.tmaxC) ? `${r1(summary.tmaxC)}°` : '—'}</b>
            <em>{summary.tmaxDate ? dayLong(summary.tmaxDate) : 'day maximum'}</em>
          </div>
          <div className="p30-kpi">
            <span>Wettest day</span>
            <b>{fin(summary.wettestMm) && +summary.wettestMm > 0 ? `${r1(summary.wettestMm)} mm` : '—'}</b>
            <em>{summary.wettestDate && +summary.wettestMm > 0 ? dayLong(summary.wettestDate) : 'no wet day held'}</em>
          </div>
        </div>
      </section>

      <section className="p30-block p30-chart">
        <header className="p30-head">
          <h2>Daily rain</h2>
          <p>Millimetres each day at this place</p>
        </header>
        <RainChart days={record.daily} />
        <div className="p30-leg"><span><i style={{ background: '#4E9BB5' }} />Daily rain, mm</span><span><i style={{ background: '#D3DCD9' }} />No record</span></div>
      </section>

      <section className="p30-block">
        <header className="p30-head">
          <h2>Day by day</h2>
          <p>Max · min · rain · newest first</p>
        </header>
        {measuredBy ? <p className="p30-src">Measured by {measuredBy}</p> : null}
        <div className="p30-list" role="table" aria-label="Day by day observations">
          <div className="p30-list-head" role="row">
            <span role="columnheader">Day</span>
            <span role="columnheader">Max</span>
            <span role="columnheader">Min</span>
            <span role="columnheader">Rain</span>
          </div>
          {days.map((row) => {
            const empty = !fin(row.tmaxC) && !fin(row.tminC) && !fin(row.rainMm);
            const wet = fin(row.rainMm) && +row.rainMm >= 1;
            if (empty) {
              return (
                <div key={row.date} className="p30-row is-empty" role="row" title={row.src || undefined}>
                  <time dateTime={row.date}>{dayLong(row.date)}</time>
                  <span className="p30-miss" role="cell">No measurement held</span>
                </div>
              );
            }
            return (
              <div
                key={row.date}
                className={`p30-row${wet ? ' is-wet' : ''}`}
                role="row"
                title={row.src || undefined}
              >
                <time dateTime={row.date} role="cell">{dayLong(row.date)}</time>
                <span className="n hi" role="cell">{fin(row.tmaxC) ? <>{r1(row.tmaxC)}°</> : '—'}</span>
                <span className="n lo" role="cell">{fin(row.tminC) ? <>{r1(row.tminC)}°</> : '—'}</span>
                <span className={`n rn${wet ? ' wet' : ''}`} role="cell">
                  {fin(row.rainMm) ? <>{r1(row.rainMm)}<small> mm</small></> : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function stationLabel(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  return raw.split(';')[0].trim();
}

function commonStation(rows) {
  const counts = new Map();
  for (const row of rows || []) {
    const label = stationLabel(row.src);
    if (!label) continue;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  let best = '';
  let n = 0;
  for (const [label, count] of counts) {
    if (count > n) { best = label; n = count; }
  }
  return best;
}

function RainChart({ days }) {
  const width = 376;
  const height = 86;
  const left = 26;
  const right = 4;
  const top = 6;
  const bottom = 16;
  const max = Math.max(1, ...days.map((row) => (fin(row.rainMm) ? +row.rainMm : 0)));
  const topValue = Math.max(5, Math.ceil(max / 5) * 5);
  const bar = (width - left - right) / days.length;
  const y = (value) => top + (height - top - bottom) * (1 - value / topValue);
  return (
    <svg className="p30c" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Daily rain at this place over the past 30 days, mm">
      <line x1={left} x2={width - right} y1={height - bottom} y2={height - bottom} stroke="#C9D4D1" />
      <text x={left - 4} y={top + 8} textAnchor="end" fontSize="9.5" fill="#6B7775">{topValue}</text>
      <text x={left - 4} y={height - bottom} textAnchor="end" fontSize="9.5" fill="#6B7775">0</text>
      {days.map((row, i) => {
        const value = fin(row.rainMm) ? +row.rainMm : null;
        const x = left + i * bar + 1;
        if (value == null) return <rect key={row.date} x={x} y={height - bottom - 2} width={Math.max(1, bar - 2)} height={2} fill="#D3DCD9" />;
        if (value <= 0) return null;
        return <rect key={row.date} x={x} y={y(value)} width={Math.max(1, bar - 2)} height={height - bottom - y(value)} fill="#4E9BB5" />;
      })}
    </svg>
  );
}

function whyText(body) {
  const why = String(body?.why || '').trim();
  if (!why) return 'The report could not be made right now. Please try again in a minute.';
  if (/^[A-Z]/.test(why)) return /[.!?]$/.test(why) ? why : `${why}.`;
  return `The report could not be made: ${why.replace(/\.\s*$/, '')}.`;
}

function ReportPane({ place, title }) {
  const [phase, setPhase] = useState('ready');
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('The site report for this place is made on the server when you press Make report (usually 5 to 20 seconds).');
  const [open, setOpen] = useState(false);

  function make() {
    setOpen(true);
    setPhase('making');
    setResult(null);
    setStatus('Making the report on the server…');
    fetch('/api/report/generate', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'content-type': 'application/json', 'x-agn-view': 'customer' },
      body: JSON.stringify({
        lat: +place.lat,
        lon: +place.lon,
        kind: 'site_assessment',
        section: 'start',
        edition: 'main',
        name: title ? String(title).slice(0, 60) : undefined,
      }),
    }).then((response) => response.json().catch(() => ({ ok: false }))).then((body) => {
      if (!body?.ok) {
        setPhase('fail');
        setStatus(whyText(body));
        return;
      }
      setResult(body);
      setPhase('ok');
      setStatus(`Report ${body.id} · ${body.pages} pages · kept in the reports library.`);
    }).catch(() => {
      setPhase('fail');
      setStatus('The report could not be made right now. Please try again in a minute.');
    });
  }

  return (
    <div id="rep50" className="sec">
      <div className="rep50-acts">
        {phase === 'ok' && !open && (
          <button type="button" id="rep50Open" onClick={() => setOpen(true)}>Show report</button>
        )}
        <button type="button" id="rep50Make" disabled={phase === 'making'} onClick={make}>
          {phase === 'making' ? 'Making the report…' : 'Make report'}
        </button>
      </div>
      <div className="status" id="rep50St" role="status">{status}</div>
      {open && (
        <ReportPopup
          title={title}
          phase={phase}
          result={result}
          status={status}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function ReportPopup({ title, phase, result, status, onClose }) {
  const ref = useRef(null);
  const frame = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    try { if (!el.open) el.showModal(); } catch { /* already open */ }
    const closed = () => onCloseRef.current();
    el.addEventListener('close', closed);
    return () => el.removeEventListener('close', closed);
  }, []);

  function printReport() {
    try {
      frame.current?.contentWindow?.focus();
      frame.current?.contentWindow?.print();
    } catch { /* the report frame did not open a print dialog */ }
  }

  const pages = result?.pages ? `${result.pages} page${result.pages === 1 ? '' : 's'}` : '';

  return createPortal(
    <dialog ref={ref} className="rep-pop" aria-label={title ? `Site report for ${title}` : 'Site report'}>
      <div className="bar">
        <div className="who">
          <b>{title || 'Site report'}</b>
          <span>{phase === 'ok' ? [result?.id, pages].filter(Boolean).join(' · ') : 'Site report'}</span>
        </div>
        <div className="acts" id="rep50Btns">
          <button type="button" id="rep50Print" disabled={phase !== 'ok'} onClick={printReport}>Print</button>
          {result?.pdf && (
            <a className="pri" id="rep50Pdf" href={`${result.pdf}?download=1`} download={`${result.id}.pdf`}>Download PDF</a>
          )}
          <button type="button" onClick={() => ref.current?.close()}>Close</button>
        </div>
      </div>
      <div className="sheet">
        {phase === 'making' && <p className="wait">Making the report on the server. This usually takes 5 to 20 seconds.</p>}
        {phase === 'fail' && <p className="fail">{status}</p>}
        {phase === 'ok' && result?.html && (
          <iframe ref={frame} id="rep50Frame" title="The site report" src={result.html} />
        )}
      </div>
    </dialog>,
    document.body,
  );
}
