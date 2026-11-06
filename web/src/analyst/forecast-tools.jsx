import { useEffect, useState } from 'react';
import { getJson } from '../start/api.js';
import { getPointBundle } from './placeCache.js';

const MODELS = ['ecmwf_ifs025', 'gfs_seamless', 'icon_seamless', 'gem_seamless', 'ukmo_seamless', 'meteofrance_seamless', 'jma_seamless'];
const VARS = [
  ['temperature', 'Temp', '°C'],
  ['apparent_temperature', 'Feels-like', '°C'],
  ['wind', 'Wind', 'm/s'],
  ['precipitation', 'Precip', 'mm'],
];

export function ForecastTools({ place, bundle }) {
  return (
    <>
      <Comfort bundle={bundle} />
      <Inputs place={place} />
      <ModelPool place={place} />
      <BothSystems place={place} hours={bundle?.hours || []} />
    </>
  );
}

function Comfort({ bundle }) {
  const now = bundle?.now || {};
  const shade = num(now.utciShadeC);
  const sun = num(now.utciSunC);
  const stress = shade ?? num(now.feelsC);
  const rh = num(now.rh);
  const wind = num(now.windKmh);
  const score = stress == null ? null : clamp(Math.round(stress > 26 ? (100 * (46 - stress)) / 20 : stress < 9 ? (100 * (stress + 13)) / 22 : 100));
  return (
    <article className="an-card">
      <h3>Comfort at this place</h3>
      <p className="an-note">Shade UTCI from the served place, scored on the page’s comfort curve. Sun UTCI uses the served radiant temperature.</p>
      <div className="an-metrics">
        <div><b>{score == null ? '—' : score}</b><span>comfort / 100</span></div>
        <div><b>{shade == null ? '—' : `${shade.toFixed(1)}°C`}</b><span>shade UTCI · {now.utciClass || '—'}</span></div>
        <div><b>{sun == null ? '—' : `${sun.toFixed(1)}°C`}</b><span>sun UTCI · {now.utciSunClass || '—'}</span></div>
        <div><b>{rh == null ? '—' : Math.round(rh)}</b><span>humidity load</span></div>
        <div><b>{wind == null ? '—' : Math.round(Math.min(100, (wind / 20) * 100))}</b><span>wind relief</span></div>
      </div>
    </article>
  );
}

function Inputs({ place }) {
  const [land, setLand] = useState(null);
  useEffect(() => {
    if (!place) return undefined;
    let live = true;
    getPointBundle({ lat: place.lat, lon: place.lon, name: place.name || '', parts: 'land' }).then((body) => { if (live) setLand(body); }).catch(() => { if (live) setLand({ error: true }); });
    return () => { live = false; };
  }, [place]);
  const current = land?.parts?.land?.v?.current || {};
  const soil = num(current.soil_moisture_0_to_1cm);
  const vpd = num(current.vapour_pressure_deficit);
  const et0 = num(current.et0_fao_evapotranspiration);
  return (
    <article className="an-card">
      <h3>Land-surface inputs</h3>
      <p className="an-note">{land?.parts?.land?.v?.source || 'Soil moisture, vapour-pressure deficit, and reference evapotranspiration at the point.'}</p>
      {!place && <p className="an-note">Choose a place to read the inputs.</p>}
      {place && (
        <div className="an-metrics">
          <div><b>{soil == null ? '—' : soil.toFixed(2)}</b><span>soil moisture 0–1 cm</span></div>
          <div><b>{vpd == null ? '—' : vpd.toFixed(2)}</b><span>vapour pressure deficit</span></div>
          <div><b>{et0 == null ? '—' : et0.toFixed(2)}</b><span>ET0 mm</span></div>
          <div><b>{land?.parts?.land?.v?.gridElevM == null ? '—' : Math.round(land.parts.land.v.gridElevM)}</b><span>model grid height m</span></div>
        </div>
      )}
    </article>
  );
}

export function ModelPool({ place }) {
  const [pool, setPool] = useState(null);
  const [variable, setVariable] = useState('temperature');
  const [lead, setLead] = useState(48);
  useEffect(() => {
    if (!place) return undefined;
    let live = true;
    setPool(null);
    getJson(`/api/pool/point?lat=${place.lat}&lon=${place.lon}`).then((body) => { if (live) setPool(body); }).catch(() => { if (live) setPool({ error: true }); });
    return () => { live = false; };
  }, [place]);
  const spec = VARS.find((row) => row[0] === variable);
  const hours = (Array.isArray(pool?.hourly) ? pool.hourly : []).filter((row) => row.leadH >= 0 && row.leadH < lead);
  const series = hours.map((row) => row[variable]).filter((row) => num(row?.p50) != null);
  const peak = series.reduce((best, row) => (best == null || row.p50 > best.p50 ? row : best), null);
  const latest = series[0];
  const models = pool?.rule?.models || MODELS;
  return (
    <article className="fc-card">
      <div className="fc-kicker">Forecast intelligence</div>
      <h3>Multi-model comparison · {place?.name || 'this place'}</h3>
      <p className="fc-note">Global models, side by side. The middle line is the pooled P50; the band is P10 to P90. Disagreement does not move the P50.</p>
      <div className="fc-tabs" role="group" aria-label="Variable and lead time">
        {VARS.map(([id, label]) => <button key={id} type="button" className={`fc-chip${variable === id ? ' on' : ''}`} onClick={() => setVariable(id)}>{label}</button>)}
        {[24, 48, 72].map((value) => <button key={value} type="button" className={`fc-chip${lead === value ? ' on' : ''}`} onClick={() => setLead(value)}>{value}h</button>)}
      </div>
      {!place && <p className="fc-note">Choose a place to load the pool.</p>}
      {place && !pool && <p className="fc-note">Loading the model pool…</p>}
      {pool?.error && <p className="fc-note">The model pool did not answer for this place.</p>}
      {!!series.length && (
        <>
          <Band rows={series} unit={spec[2]} />
          <div className="fc-metrics">
            <div><span>Inter-model spread</span><b>{latest?.agreement || '—'}</b></div>
            <div><span>Active models</span><b>{latest?.n ?? '—'}</b></div>
            <div><span>Peak signal</span><b>{peak ? `${Number(peak.p50).toFixed(1)} ${spec[2]}` : '—'}</b></div>
            <div><span>Families named</span><b>{models.length}</b></div>
          </div>
          <p className="fc-note">{models.join(', ')}. Live multi-model range. Agreement is the spread between models, not a verified forecast-skill score.</p>
        </>
      )}
      {pool && !pool.error && !series.length && <p className="fc-note">The pool answered without hours for this variable.</p>}
    </article>
  );
}

function Band({ rows, unit }) {
  const lo = rows.map((row) => num(row.p10)).filter((value) => value != null);
  const hi = rows.map((row) => num(row.p90)).filter((value) => value != null);
  const mid = rows.map((row) => num(row.p50)).filter((value) => value != null);
  if (mid.length < 2) return null;
  const min = Math.min(...lo, ...mid);
  const max = Math.max(...hi, ...mid);
  const span = max - min || 1;
  const w = 640;
  const h = 160;
  const x = (index) => (index / (rows.length - 1)) * w;
  const y = (value) => h - ((value - min) / span) * (h - 16) - 8;
  const line = rows.map((row, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(row.p50).toFixed(1)}`).join(' ');
  const area = `${rows.map((row, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(num(row.p90) ?? row.p50).toFixed(1)}`).join(' ')} ${[...rows].reverse().map((row, index) => `L${x(rows.length - 1 - index).toFixed(1)},${y(num(row.p10) ?? row.p50).toFixed(1)}`).join(' ')} Z`;
  return (
    <svg className="an-fan" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Model range, ${unit}`}>
      <path d={area} fill="#42A6AD" opacity="0.25" />
      <path d={line} fill="none" stroke="#205154" strokeWidth="2" />
    </svg>
  );
}

export function BothSystems({ place, hours }) {
  const [body, setBody] = useState(null);
  const [busy, setBusy] = useState(false);
  function run() {
    if (!place) return;
    setBusy(true);
    getPointBundle({ lat: place.lat, lon: place.lon, parts: 'ensemble' }).then((answer) => setBody(answer)).catch(() => setBody({ error: true })).finally(() => setBusy(false));
  }
  const series = body?.parts?.ensemble?.v?.body?.hourly?.temperature_2m || [];
  const served = hours.map((row) => num(row.tempC)).filter((value) => value != null);
  const other = series.map(num).filter((value) => value != null);
  return (
    <article className="fc-card">
      <div className="fc-kicker">Multi-system ensemble · pooled interval</div>
      <h3>Forecast interval from two independent systems</h3>
      <p className="fc-note">{place?.name || 'No location selected'}. The served forecast beside the ensemble. The button asks the ensemble; it does not change the served value.</p>
      <div className="fc-tabs">
        <button type="button" className="fc-btn" disabled={!place || busy} onClick={run}>{busy ? 'Running…' : 'Run both systems'}</button>
        <span className="fc-note">{body ? (body.error ? 'The ensemble did not answer.' : 'Answered') : 'Not run'}</span>
      </div>
      {!!other.length && (
        <div className="fc-metrics">
          <div><span>Served first hour</span><b>{served.length ? `${served[0].toFixed(1)}°C` : '—'}</b></div>
          <div><span>Ensemble control</span><b>{`${other[0].toFixed(1)}°C`}</b></div>
          <div><span>Ensemble hours</span><b>{other.length}</b></div>
          <div><span>Ensemble range</span><b>{`${Math.min(...other).toFixed(1)}–${Math.max(...other).toFixed(1)} °C`}</b></div>
        </div>
      )}
    </article>
  );
}

export function Replay({ place }) {
  const [offset, setOffset] = useState(0);
  const [day, setDay] = useState(null);
  useEffect(() => {
    if (!place || offset === 0) { setDay(null); return undefined; }
    let live = true;
    const date = karachiDay(offset);
    const q = `name=archive&latitude=${place.lat}&longitude=${place.lon}&start_date=${date}&end_date=${date}&hourly=temperature_2m,precipitation&models=era5&timezone=Asia/Karachi`;
    getJson(`/api/pointstate/product?${q}`).then((body) => { if (live) setDay(body); }).catch(() => { if (live) setDay({ error: true }); });
    return () => { live = false; };
  }, [place, offset]);
  const hours = day?.hourly?.time || [];
  const temps = day?.hourly?.temperature_2m || [];
  const rain = (day?.hourly?.precipitation || []).reduce((sum, value) => sum + (num(value) || 0), 0);
  const warm = temps.map(num).filter((value) => value != null);
  return (
    <article className="fc-card" id="fcreplay">
      <h3>Historical replay</h3>
      <p className="fc-note">Historical replay loads a gridded global reanalysis on demand. It is historical weather context, not a station observation or a past operational forecast.</p>
      <div className="fc-replay">
        <b>{offset === 0 ? 'Today · live' : `${karachiDay(offset)} · ${Math.abs(offset)} days ago`}</b>
        <input type="range" min={-30} max={0} value={offset} onChange={(event) => setOffset(Number(event.target.value))} aria-label="Days before today" />
        <div><span>30 days ago</span><span>14 days</span><span>7 days</span><span>Today</span></div>
      </div>
      {!place && <p className="fc-note">Choose a place to replay a day.</p>}
      {place && offset !== 0 && !day && <p className="fc-note">Loading the reanalysis…</p>}
      {day?.error && <p className="fc-note">The reanalysis did not answer for that day.</p>}
      {!!hours.length && (
        <div className="fc-metrics">
          <div><span>Hours returned</span><b>{hours.length}</b></div>
          <div><span>Highest hour</span><b>{warm.length ? `${Math.max(...warm).toFixed(1)}°C` : '—'}</b></div>
          <div><span>Lowest hour</span><b>{warm.length ? `${Math.min(...warm).toFixed(1)}°C` : '—'}</b></div>
          <div><span>Rain that day</span><b>{rain.toFixed(1)} mm</b></div>
        </div>
      )}
    </article>
  );
}

function karachiDay(offset) {
  return new Date(Date.now() + 5 * 3600 * 1000 + offset * 86400000).toISOString().slice(0, 10);
}

function num(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value) {
  return Math.max(0, Math.min(100, value));
}
