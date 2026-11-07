import { useEffect, useRef, useState } from 'react';
import { openChrome, useChromeExclusive } from './HeaderTools.jsx';
import { DAILY_MENU, HEAT_INDEX_COLOURS, HEAT_INDEX_WORDS } from './layers.js';
import { useOperator } from './operator.js';
import { getJson } from '../start/api.js';
import { loadScales, outlookGapRows, outlookRows } from './mapOverlays.js';

const CUSTOMER_DAILY = [
  ['Daily hazards', ['heat', 'cold', 'rain_hz', 'flood', 'flood_riverine', 'landslide', 'drought']],
  ['Forecast values', ['rain_amount', 'wind_gust', 'aqi', 'heat_index']],
  ['Site context', ['seismic', 'cyclone', 'glof', 'nss_baseline']],
];
const DAILY_NAMES = {
  ...Object.fromEntries(DAILY_MENU.flatMap(([, items]) => items.map(([id, name]) => [id, name]))),
  heat_index: 'Comfort (heat index)',
  nss_baseline: 'Ground sponge',
};

export function DailyMenu({ layer, label, onPick, onOpen }) {
  const operator = useOperator();
  const [open, setOpen] = useState(false);
  useChromeExclusive('daily-hazards', setOpen);
  const groups = operator
    ? DAILY_MENU
    : CUSTOMER_DAILY.map(([group, ids]) => [group, ids.map((id) => [id, DAILY_NAMES[id] || id])]);
  return (
    <div className={`hzmenu${open ? ' open' : ''}`}>
      <button type="button" aria-expanded={open} aria-label="Daily hazards" onClick={() => setOpen((value) => {
        const next = !value;
        if (next) {
          openChrome('daily-hazards');
          onOpen?.();
        }
        return next;
      })}>{label}</button>
      {open && (
        <div className="hzmenu-panel" role="listbox">
          {groups.map(([group, items]) => (
            <div key={group} className="hzmenu-group">
              <p className="hzmenu-label">{group}</p>
              {items.map(([id, name, tag]) => (
                <button
                  key={`${group}-${name}`}
                  type="button"
                  role="option"
                  aria-selected={layer === id && label === name}
                  className={layer === id && label === name ? 'on' : ''}
                  onClick={() => { onPick(id, name); setOpen(false); }}
                >
                  {name}{operator && tag ? ` (${tag})` : ''}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const MORE = [
  ['outlook', 'Outlook layers'],
  ['quakes', 'Recent earthquakes & faults'],
  ['urban', 'Urban heat'],
  ['temp', 'Temperature'],
  ['lakes', 'Glacial lakes'],
  ['heatindex', 'Heat index'],
];

/** One current choice, opened as a list. Used where a row of buttons all set the same thing. */
export function ChoiceMenu({ id, label, value, options, onPick }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  useChromeExclusive(id, setOpen);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const current = options.find((row) => row[0] === value);
  return (
    <div className={`pickmenu${open ? ' open' : ''}`} ref={root}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
        onClick={() => setOpen((shown) => {
          const next = !shown;
          if (next) openChrome(id);
          return next;
        })}
      >
        {current ? current[1] : label}
      </button>
      {open && (
        <div role="listbox" aria-label={label}>
          {options.map(([option, name]) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={value === option}
              className={value === option ? 'on' : ''}
              onClick={() => { onPick(option); setOpen(false); }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Several on/off items behind one button. The closed label names whatever is on. */
export function CheckMenu({ id, label, items, className = '' }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  useChromeExclusive(id, setOpen);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const shown = items.filter((item) => item.on).map((item) => item.name);
  return (
    <div className={`pickmenu${open ? ' open' : ''}${className ? ` ${className}` : ''}`} ref={root}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        onClick={() => setOpen((shownMenu) => {
          const next = !shownMenu;
          if (next) openChrome(id);
          return next;
        })}
      >
        {shown.length ? shown.join(', ') : label}
      </button>
      {open && (
        <div role="menu" aria-label={label}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitemcheckbox"
              aria-pressed={!!item.on}
              className={item.on ? 'on' : ''}
              onClick={() => {
                item.onToggle();
                if (item.closeMenu !== false) setOpen(false);
              }}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MoreLayers({ on, onToggle }) {
  const [open, setOpen] = useState(false);
  useChromeExclusive('more-layers', setOpen);
  return (
    <div className={`morelay${open ? ' open' : ''}`}>
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((value) => {
        const next = !value;
        if (next) openChrome('more-layers');
        return next;
      })}>More layers</button>
      {open && (
        <div role="menu">
          {MORE.map(([id, name]) => (
            <button
              key={id}
              type="button"
              role="menuitemcheckbox"
              aria-pressed={!!on?.[id]}
              className={on?.[id] ? 'on' : ''}
              onClick={() => { onToggle(id); setOpen(false); }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const OL_MAIN = ['ev:heatSpell', 'ev:coldSpell', 'amt:pr50', 'amt:pr90', 'ev:heavySnow', 'amt:gu50', 'air:dust', 'air:pm25', 'week:t', 'week:p', 'month:t', 'month:p'];
const OL_PFX = {
  'amt:gu50': 'Wind · ',
  'amt:pr50': 'Rain · ',
  'amt:pr90': 'Rain · ',
  'air:dust': 'Air · ',
  'air:pm25': 'Air · ',
  'week:t': 'Weeks ahead · ',
  'week:p': 'Weeks ahead · ',
  'month:t': 'Season ahead · ',
  'month:p': 'Season ahead · ',
};

function layerItems(cat) {
  const rows = [];
  (cat || []).forEach((group) => (group.items || []).forEach((item) => rows.push({ id: item[0], label: item[1], group: group.group })));
  return rows;
}

function periodIndex(id) {
  /* Day and air layers open on period 0 (today / current). Weeks/season
     keep their prior offsets where the first period can be incomplete. */
  if (/^day:/.test(id) || /^air:/.test(id)) return 0;
  if (/^week:/.test(id)) return 2;
  if (/^month:/.test(id)) return 1;
  return 0;
}

let layersCatalogue = null;
let layersCataloguePromise = null;

function loadLayersCatalogue() {
  if (Array.isArray(layersCatalogue)) return Promise.resolve(layersCatalogue);
  if (layersCataloguePromise) return layersCataloguePromise;
  layersCataloguePromise = getJson('/api/map/layers').then((body) => {
    if (Array.isArray(body)) layersCatalogue = body;
    return body;
  }).finally(() => { layersCataloguePromise = null; });
  return layersCataloguePromise;
}

function fmtPeriod(value) {
  const text = String(value ?? '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = new Date(`${text}T12:00:00Z`);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[date.getUTCDay()]} ${date.getUTCDate()} ${months[date.getUTCMonth()]}`;
  }
  if (/^\d{4}-\d{2}$/.test(text)) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[+text.slice(5, 7) - 1]} ${text.slice(0, 4)}`;
  }
  return text;
}

export function OutlookPanel({ onData, onClose }) {
  const operator = useOperator();
  const [cat, setCat] = useState(null);
  const [err, setErr] = useState('');
  const [id, setId] = useState('');
  const [index, setIndex] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [scaleReady, setScaleReady] = useState(false);

  function loadCat() {
    setErr('');
    loadLayersCatalogue().then((body) => {
      if (Array.isArray(body)) setCat(body);
      else setErr('catalogue');
    }).catch(() => setErr('catalogue'));
  }

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    openChrome('outlook');
    const onChrome = (event) => {
      if (event.detail?.open !== 'outlook') onCloseRef.current();
    };
    window.addEventListener('agn-chrome', onChrome);
    return () => window.removeEventListener('agn-chrome', onChrome);
  }, []);

  useEffect(() => {
    if (Array.isArray(layersCatalogue)) setCat(layersCatalogue);
    loadCat();
    loadScales().then(() => setScaleReady(true));
  }, []);

  useEffect(() => {
    if (!id) { setData(null); onData(null); return undefined; }
    let dead = false;
    setLoading(true);
    setErr('');
    getJson(`/api/map/layer?id=${encodeURIComponent(id)}&i=${index}`).then((body) => {
      if (dead) return;
      setLoading(false);
      setData(body && body.id ? body : null);
      onData(body?.ready ? body : null);
      if (!body) setErr('load');
    }).catch(() => { if (!dead) { setLoading(false); setErr('load'); onData(null); } });
    return () => { dead = true; };
  }, [id, index]);

  function choose(next) {
    setId(next);
    setIndex(next ? periodIndex(next) : 0);
    if (next && !OL_MAIN.includes(next)) setMore(true);
  }

  const items = layerItems(cat);
  const byId = Object.fromEntries(items.map((item) => [item.id, item]));
  const rows = data?.ready && data.id === id ? [...outlookRows(data), ...outlookGapRows(data)] : [];

  return (
    <div className="ov-ol" role="region" aria-label="Outlook layer">
      <h4>Outlook layer <button type="button" className="x" aria-label="Close" onClick={onClose}>×</button></h4>
      <select id="agnOlSel" aria-label="Outlook layer" value={id} onChange={(event) => choose(event.target.value)}>
        <option value="">None (hazard screening map)</option>
        {operator && (cat || []).map((group) => (
          <optgroup key={group.group} label={group.group}>
            {(group.items || []).map((item) => <option key={item[0]} value={item[0]}>{item[1]}</option>)}
          </optgroup>
        ))}
        {!operator && (
          <optgroup label="Main">
            {OL_MAIN.filter((key) => byId[key]).map((key) => <option key={key} value={key}>{(OL_PFX[key] || '') + byId[key].label}</option>)}
          </optgroup>
        )}
      </select>
      {!operator && items.some((item) => !OL_MAIN.includes(item.id)) && (
        <details open={more} onToggle={(event) => setMore(event.currentTarget.open)}>
          <summary>More outlook layers ({items.filter((item) => !OL_MAIN.includes(item.id)).length})</summary>
          <select aria-label="More outlook layers" value={OL_MAIN.includes(id) ? '' : id} onChange={(event) => choose(event.target.value)}>
            <option value="">Choose a layer…</option>
            {(cat || []).map((group) => {
              const extra = (group.items || []).filter((item) => !OL_MAIN.includes(item[0]));
              if (!extra.length) return null;
              return (
                <optgroup key={group.group} label={group.group}>
                  {extra.map((item) => <option key={item[0]} value={item[0]}>{item[1]}</option>)}
                </optgroup>
              );
            })}
          </select>
        </details>
      )}
      {err === 'catalogue' && <p className="meta">The list of outlook layers could not be loaded. <button type="button" onClick={loadCat}>Retry</button></p>}
      {id && loading && <p className="meta">Loading…</p>}
      {id && err === 'load' && <p className="meta">This outlook could not be loaded. The map shows the hazard layer. <button type="button" onClick={() => choose(id)}>Retry</button></p>}
      {id && data && !data.ready && !loading && <p className="meta">This outlook has not run yet on the server, so the map shows the hazard layer.</p>}
      {id && data?.ready && data.id === id && (
        <>
          {data.periods?.length > 0 && (
            <div className="per">
              {data.periods.map((period, i) => (
                <button key={period.id || period.label || i} type="button" className={i === (data.index ?? index) ? 'on' : ''} onClick={() => setIndex(i)}>{fmtPeriod(period.label)}</button>
              ))}
            </div>
          )}
          <p className="meta"><b>{data.title}</b>{data.valid ? ` · ${fmtPeriod(data.valid)}` : ''} · {data.count} of {data.units || data.count} tehsils carry a value</p>
          {data.type === 'chance' && data.uniform && Number(data.uniform.value) === 0 && (
            <p className="meta">Everywhere on this map is <b>0 %</b> for this day — the forecast members do not reach this threshold anywhere in Pakistan.</p>
          )}
          {data.type === 'chance' && !scaleReady && <p className="meta">Loading the level scale…</p>}
          <div className="leg">
            {rows.map(([colour, label], index) => <div key={`${index}-${label}`}><i style={{ background: colour }} />{label}</div>)}
          </div>
          <p className="meta">{data.source}</p>
          <button type="button" onClick={() => choose('')}>Clear layer</button>
        </>
      )}
    </div>
  );
}

export function HeatLine({ uid, day, on }) {
  const operator = useOperator();
  const [row, setRow] = useState(null);
  useEffect(() => {
    if (!on || !uid) { setRow(null); return undefined; }
    let dead = false;
    getJson(`/api/levels/unit?unit=${encodeURIComponent(uid)}`).then((body) => {
      if (dead) return;
      const hit = (body?.days || []).find((item) => item && item.day === day);
      setRow(hit?.layers?.heat_index || null);
    }).catch(() => { if (!dead) setRow(null); });
    return () => { dead = true; };
  }, [on, uid, day]);
  if (!on || !row) return null;
  const when = day === 0 ? 'today' : day === 1 ? 'tomorrow' : `in ${day} days`;
  if (row.state === 'value' && Number.isFinite(+row.facts?.heatIndexMaxC)) {
    const level = +row.level;
    return (
      <p className="ov-hi">
        <span>Heat index {when}</span>
        <b>{(+row.facts.heatIndexMaxC).toFixed(1)} °C</b>
        {row.facts.at ? ` at ${row.facts.at} PKT` : ''}
        <em style={{ background: HEAT_INDEX_COLOURS[level] || '#ccc' }}>{row.word || HEAT_INDEX_WORDS[level] || ''}</em>
      </p>
    );
  }
  if (row.state === 'not_tested' || row.level === -5) {
    return operator ? <p className="ov-hi"><span>Heat index {when}</span> level not tested today (tested 1–3 days ahead)</p> : null;
  }
  if (row.level === -2) return <p className="ov-hi"><span>Heat index {when}</span> outside the range of the heat index table</p>;
  return <p className="ov-hi"><span>Heat index {when}</span> not available</p>;
}
