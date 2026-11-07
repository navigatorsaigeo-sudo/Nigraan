import { useEffect, useMemo, useState } from 'react';
import { getJson } from '../start/api.js';
import OverviewMap from './OverviewMap.jsx';
import {
  FILLS, HAZARDS, HORIZONS, HORIZON_LAYER, WORDS, fixed, hazardOn, partValue, topToday,
} from './model.js';
import { scrubMachText } from '../lib/hideMach.js';

function rainToday(bundle) {
  const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
  const hours = (bundle?.hours || []).filter((hour) => String(hour.time || '').slice(0, 10) === today && hour.rainMm != null);
  if (!hours.length) return null;
  return hours.reduce((sum, hour) => sum + (+hour.rainMm || 0), 0);
}

const SHORT_HAZARD = {
  heat: 'Heat',
  cold: 'Cold',
  rain_hz: 'Heavy rain',
  wind: 'Wind',
  flood: 'Flood',
  landslide: 'Landslide',
  glof: 'GLOF',
  drought: 'Drought',
};

function spreadText(lo, hi) {
  if (lo == null || hi == null) return '';
  if (Math.abs(lo - hi) < 0.05) return `${fixed(lo)} °C`;
  return `${fixed(lo)} to ${fixed(hi)} °C`;
}

function dayLabel(index) {
  return index === 0 ? 'Today' : `+${index}d`;
}

function isAssessed(row) {
  return !!row && row.assessed !== false && row.level != null && row.level >= 0;
}

function shortWhy(row) {
  const why = String(row?.why || row?.notAssessedWhy || '').replace(/\s+/g, ' ').trim();
  if (!why) return '';
  if (/^cannot happen here/i.test(why)) return 'Cannot happen here';
  if (/^not tested/i.test(why)) return 'Not tested';
  const sentence = why.split(/[.;]/)[0].trim();
  const text = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  return text.length > 72 ? `${text.slice(0, 69).trim()}…` : text;
}

function LevelMark({ level, word }) {
  const label = WORDS[level] || word || '';
  return <span className={`cz-mark L${level}`} title={label}>{label}</span>;
}

function LevelTable({ levels }) {
  const days = (levels?.days || []).slice(0, 4);
  if (!days.length) return <p className="cz-muted">Loading the hazard levels…</p>;
  const rows = HAZARDS.map(([key, name]) => {
    const cells = days.map((day, index) => {
      const row = hazardOn(day, key);
      return { index, row, ok: isAssessed(row) };
    });
    const gap = cells.find((cell) => !cell.ok);
    return {
      key,
      name,
      short: SHORT_HAZARD[key] || name,
      cells,
      why: shortWhy(gap?.row),
      full: cells.every((cell) => cell.ok),
    };
  });
  const shown = rows.filter((row) => row.cells.some((cell) => cell.ok));
  const aside = rows.filter((row) => !row.full);
  return (
    <>
      {shown.length ? (
        <div className="cz-hz" role="table" aria-label="Hazards today and the next 3 days">
          <div className="cz-hz-h" role="row">
            <span />
            {days.map((day, index) => <span key={day.date || index}>{dayLabel(index)}</span>)}
          </div>
          {shown.map((row) => (
            <div className="cz-hz-r" role="row" key={row.key}>
              <span title={row.name}>{row.short}</span>
              {row.cells.map((cell) => (cell.ok
                ? <LevelMark key={cell.index} level={cell.row.level} word={cell.row.word} />
                : <span key={cell.index} />))}
            </div>
          ))}
        </div>
      ) : <p className="cz-muted">No hazard has a level for these four days.</p>}
      {!!aside.length && (
        <div className="cz-miss">
          <b>Not assessed</b>
          <ul>
            {aside.map((row) => {
              const all = row.cells.every((cell) => !cell.ok);
              const when = all ? '' : row.cells.filter((cell) => !cell.ok).map((cell) => dayLabel(cell.index)).join(', ');
              const brief = row.why && row.why.length <= 36 ? row.why : '';
              const line = [when, brief].filter(Boolean).join(' · ') || 'These four days';
              const full = row.cells.find((cell) => !cell.ok)?.row?.why || row.why;
              return (
                <li key={row.key} title={full || undefined}>
                  <span>{row.short}</span>
                  <em>{line}</em>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

export default function OverviewPane({ place, bundle, loadingPlace, ranked, onPick }) {
  const [hazard, setHazard] = useState('heat');
  const [day, setDay] = useState(0);
  const [horizon, setHorizon] = useState('d15');
  const [agg, setAgg] = useState('tehsil');
  const [levels, setLevels] = useState(null);
  const [layer, setLayer] = useState(null);
  const [catalogue, setCatalogue] = useState([]);
  const [extra, setExtra] = useState('');
  const [nearAll, setNearAll] = useState(false);

  useEffect(() => {
    getJson('/api/map/layers').then((body) => {
      const groups = Array.isArray(body) ? body : [];
      setCatalogue(groups.flatMap((group) => (group.items || []).map(([id, label]) => ({ id, label, group: group.group }))));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (horizon !== 'd15' || extra) return undefined;
    let live = true;
    setLevels(null);
    getJson(`/api/levels?layer=${encodeURIComponent(hazard)}&day=${day}`).then((body) => {
      if (live) setLevels(body?.levels ? body : { levels: {} });
    }).catch(() => { if (live) setLevels({ levels: {} }); });
    return () => { live = false; };
  }, [hazard, day, horizon, extra]);

  useEffect(() => {
    const id = extra || HORIZON_LAYER[horizon];
    if (!id) { setLayer(null); return undefined; }
    let live = true;
    getJson(`/api/map/layer?id=${encodeURIComponent(id)}&i=0`).then((body) => {
      if (live) setLayer(body || null);
    }).catch(() => { if (live) setLayer(null); });
    return () => { live = false; };
  }, [extra, horizon]);

  const paint = useMemo(() => {
    const active = extra || HORIZON_LAYER[horizon];
    if (active && layer?.values) {
      const nums = Object.values(layer.values).map(Number).filter(Number.isFinite);
      return {
        kind: layer.type === 'diverging' ? 'diverging' : 'value',
        values: layer.values,
        range: nums.length ? [Math.min(...nums), Math.max(...nums)] : [0, 1],
      };
    }
    const values = { ...(levels?.levels || {}) };
    if (agg === 'province' && levels?.levels) {
      const rolled = {};
      Object.entries(levels.levels).forEach(([uid, value]) => {
        const province = uid.split('|')[0];
        if (value == null || value < 0) return;
        rolled[province] = rolled[province] == null ? value : Math.max(rolled[province], value);
      });
      Object.keys(values).forEach((uid) => {
        const province = uid.split('|')[0];
        if (rolled[province] != null) values[uid] = rolled[province];
      });
    }
    return { kind: 'level', values };
  }, [agg, extra, horizon, layer, levels]);

  const highCount = useMemo(() => {
    const values = paint.kind === 'level' ? paint.values : null;
    if (!values) return null;
    return Object.entries(values).filter(([uid, value]) => value >= 3 && !/Jammu Kashmir/i.test(uid)).length;
  }, [paint]);

  const now = bundle?.now;
  const shown = bundle?.shown?.now;
  const day0 = bundle?.days?.[0];
  const levelsHere = partValue(bundle, 'levels');
  const near = partValue(bundle, 'near');
  const top = topToday(levelsHere);
  const places = (near?.places || []).filter((row) => Number.isFinite(+row.tempC));
  const here = now && Number.isFinite(+now.tempC)
    ? [{ name: 'This spot', km: 0, tempC: +now.tempC, here: true }, ...places.filter((row) => !(row.km != null && row.km < 0.3))]
    : places;
  const temps = here.map((row) => +row.tempC);
  const lo = temps.length ? Math.min(...temps) : null;
  const hi = temps.length ? Math.max(...temps) : null;
  const shownNear = nearAll ? here : here.slice(0, 9);
  const placeName = bundle?.place?.name || place?.name || (place ? `${place.lat}, ${place.lon}` : 'Choose a place');

  return (
    <section className="cz-step">
      <div className="cz-hero tone-overview">
        <h1>Overview</h1>
        <span>What is the situation now?</span>
        <strong>{loadingPlace ? '…' : (shown?.value || fixed(now?.tempC))}<small>°C</small></strong>
        {top && <em>{top.word} today · set by {top.by}</em>}
        <p>{loadingPlace ? 'Loading the forecast for this place…' : `${placeName}${bundle?.place?.tehsil ? ` · ${bundle.place.tehsil}` : ''}${bundle?.source?.kind ? ` · ${scrubMachText(String(bundle.source.kind)).toLowerCase()}` : ''}`}</p>
      </div>
      <div className="cz-mapcard">
        <div className="cz-mapbar">
          <div className="cz-seg">
            {HORIZONS.map(([id, label]) => (
              <button key={id} type="button" aria-pressed={horizon === id && !extra} onClick={() => { setHorizon(id); setExtra(''); }}>{label}</button>
            ))}
          </div>
          <select aria-label="More layers" value={extra} onChange={(event) => setExtra(event.target.value)}>
            <option value="">More layers · hazard levels</option>
            {catalogue.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
        <div className="cz-mapbar">
          <select aria-label="Hazard on the map" value={hazard} onChange={(event) => { setHazard(event.target.value); setExtra(''); setHorizon('d15'); }}>
            {HAZARDS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <span className="cz-count"><b>{highCount == null ? '…' : highCount}</b> places at High or Severe</span>
          <div className="cz-seg">
            <button type="button" aria-pressed={agg === 'province'} onClick={() => setAgg('province')}>Province</button>
            <button type="button" aria-pressed={agg === 'tehsil'} onClick={() => setAgg('tehsil')}>Tehsil</button>
          </div>
          <div className="cz-seg">
            {[0, 1, 2, 3].map((offset) => (
              <button key={offset} type="button" aria-pressed={day === offset} onClick={() => { setDay(offset); setExtra(''); setHorizon('d15'); }}>{offset === 0 ? "Today's peak" : `+${offset}d`}</button>
            ))}
          </div>
        </div>
        <div className="cz-mprow">
          <aside className="cz-side">
            <div className="cz-side-hd">
              <h3>{placeName}</h3>
              <p>Weather{bundle?.place?.tehsil ? ` · ${bundle.place.tehsil}` : ''}</p>
            </div>
            <div className="cz-side-bd">
              <div className="cz-heat">
                <div className="k">Heat stress</div>
                <div className="w">{now?.utciClass || (loadingPlace ? '…' : '—')}</div>
                <div className="v">{fixed(now?.utciShadeC)}<small> °C</small></div>
              </div>
              <div className="cz-tiles">
                <div className="tx"><span className="k">Temp max</span><span className="v">{fixed(day0?.tmaxC)}<small> °C</small></span></div>
                <div className="tn"><span className="k">Temp min</span><span className="v">{fixed(day0?.tminC)}<small> °C</small></span></div>
                <div className="fl"><span className="k">Feels like</span><span className="v">{fixed(now?.feelsC)}<small> °C</small></span></div>
                <div className="hu"><span className="k">Humidity</span><span className="v">{now?.rh == null ? '—' : fixed(now.rh, 0)}<small> %</small></span></div>
                <div className="rn"><span className="k">Rain today</span><span className="v">{fixed(rainToday(bundle), 0)}<small> mm</small></span></div>
                <div className="wd"><span className="k">Wind</span><span className="v">{fixed(now?.windKmh, 0)}<small> km/h</small></span></div>
              </div>
              <div className="cz-near">
                <b>Temperature now nearby</b>
                {!shownNear.length && <p>{loadingPlace ? 'Loading…' : 'No named place found around this point.'}</p>}
                {lo != null && <p>{here.length} {here.length === 1 ? 'place' : 'places'} within {near?.radiusKm || 12} km · {spreadText(lo, hi)}</p>}
                {shownNear.map((row) => {
                  const spot = lo != null && hi != null && hi > lo ? Math.round(((+row.tempC - lo) / (hi - lo)) * 100) : 50;
                  return (
                    <button key={`${row.name}-${row.lat}`} type="button" onClick={() => onPick({ lat: row.lat ?? place.lat, lon: row.lon ?? place.lon, name: row.here ? placeName : row.name })}>
                      <span className="n">{row.here ? 'This spot' : row.name}</span>
                      <span className="bar"><i style={{ left: `${spot}%` }} /></span>
                      <strong>{fixed(row.tempC)}°</strong>
                    </button>
                  );
                })}
                {here.length > 9 && <button type="button" className="cz-more" onClick={() => setNearAll((value) => !value)}>{nearAll ? 'Show less' : 'Show all'}</button>}
              </div>
            </div>
          </aside>
          <OverviewMap paint={paint} place={place} sites={ranked} onPick={onPick} />
          <aside className="cz-side">
            <div className="cz-side-hd">
              <h3>{placeName}</h3>
              <p>Hazards · today and 3 days</p>
            </div>
            <div className="cz-side-bd">
              <LevelTable levels={levelsHere} />
              <p className="cz-note">Click the map or a site diamond.</p>
            </div>
          </aside>
        </div>
        <div className="cz-legend">
          {WORDS.map((word, index) => <span key={word}><i style={{ background: FILLS[index] }} />{word}</span>)}
          <span><i style={{ background: '#b9a6d8' }} />IIOJK (disputed)</span>
          {layer?.title && <span>{layer.title}{layer.unit ? ` · ${layer.unit}` : ''}</span>}
        </div>
      </div>
      <div className="cz-card">
        <h3>AJG Supplies network</h3>
        {!ranked.length && <p className="cz-muted">No AJG site list on this server. Upload one on Sites & operations.</p>}
        {!!ranked.length && (
          <table className="cz-table">
            <thead><tr><th>Site · worst first</th><th>Worst in 4 days</th><th>When</th></tr></thead>
            <tbody>
              {ranked.slice(0, 8).map((site) => (
                <tr key={`${site.lat},${site.lon}`} onClick={() => onPick(site)}>
                  <td><b>{site.name}</b><div className="cz-muted">{site.type} · {site.city}</div></td>
                  <td>{site.worst ? <span className={site.worst.level >= 0 ? `cz-pill L${site.worst.level}` : 'cz-pill na'}>{site.worst.level >= 0 ? `${site.worst.word} ${site.worst.hazard}` : 'no data'}</span> : '…'}</td>
                  <td>{site.worst?.date ? site.worst.date.slice(5) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
