import { useEffect, useRef, useState } from 'react';
import { CITIES } from './layers.js';
import OperatorConsoles, { CONSOLE_TARGETS } from './OperatorConsoles.jsx';
import { operatorOn, setOperator, useOperator } from './operator.js';
import { LockIcon, TokenDialog } from '../GateLock.jsx';
import { useGate } from '../gate.js';
import { writePlace } from './place.js';
import { getPointBundle } from './placeCache.js';
import { getJson } from '../start/api.js';

/** Announce which topbar overlay is opening so the others close. */
export function openChrome(id) {
  window.dispatchEvent(new CustomEvent('agn-chrome', { detail: { open: id } }));
}

export function useChromeExclusive(id, setOpen) {
  useEffect(() => {
    const onChrome = (event) => {
      if (event.detail?.open !== id) setOpen(false);
    };
    window.addEventListener('agn-chrome', onChrome);
    return () => window.removeEventListener('agn-chrome', onChrome);
  }, [id, setOpen]);
}

function sky(code) {
  const value = Number(code);
  if (!Number.isFinite(value)) return '';
  if (value === 0) return '☀';
  if (value <= 3) return '⛅';
  if (value <= 48) return '☁';
  if (value <= 67) return '🌧';
  if (value <= 77) return '🌨';
  if (value <= 82) return '🌧';
  return '⛈';
}

export function PlaceMenu({ place, tab }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [temps, setTemps] = useState(null);
  const [gps, setGps] = useState('');
  useChromeExclusive('place', setOpen);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setHits([]);
      return undefined;
    }
    const timer = setTimeout(() => {
      getJson(`/api/geo/search?q=${encodeURIComponent(text)}&limit=8`).then((body) => {
        setHits((body?.results || []).slice(0, 8));
      }).catch(() => setHits([]));
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open || temps) return undefined;
    let cancel = false;
    Promise.all(CITIES.map(([name, lat, lon]) => getPointBundle({ lat, lon, name, parts: 'default' }).then((body) => [name, body?.now || null]).catch(() => [name, null]))).then((rows) => {
      if (!cancel) setTemps(Object.fromEntries(rows));
    });
    return () => { cancel = true; };
  }, [open, temps]);

  useEffect(() => {
    const openMenu = () => {
      openChrome('place');
      setOpen(true);
      requestAnimationFrame(() => {
        document.querySelector('.citysel .citymenu input')?.focus();
      });
    };
    window.addEventListener('agn-change-place', openMenu);
    return () => window.removeEventListener('agn-change-place', openMenu);
  }, []);

  function choose(next) {
    writePlace(next, `/analyst?tab=${tab}`);
    setOpen(false);
    setQuery('');
    setHits([]);
  }

  function locate() {
    setGps('');
    if (!navigator.geolocation) {
      setGps('Location is not available in this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      getPointBundle({ lat, lon, parts: 'context' }).then((body) => {
        const found = body?.place?.name || body?.place?.tehsil;
        choose({ lat, lon, name: found || 'My location' });
      }).catch(() => choose({ lat, lon, name: 'My location' }));
    }, () => setGps('Location was not shared.'));
  }

  return (
    <div className={`citysel${open ? ' open' : ''}`}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => {
        const next = !value;
        if (next) openChrome('place');
        return next;
      })}>
        <span>{place?.name || 'Choose a place'}</span>
        <svg className="chev" fill="none" height="14" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" width="14"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="citymenu" role="listbox">
          <input value={query} placeholder="Search a place in Pakistan (tehsil, district, town)" aria-label="Search a place in Pakistan" onChange={(event) => setQuery(event.target.value)} />
          <button type="button" className="gps" onClick={locate}>Use my location <span>GPS</span></button>
          {gps && <p className="citynote">{gps}</p>}
          {hits.map((hit) => (
            <button key={hit.id || `${hit.lat},${hit.lon}`} type="button" className={place?.name === hit.name ? 'on' : ''} onClick={() => choose({ lat: hit.lat, lon: hit.lon, name: hit.name || 'Place' })}>
              <span>{hit.name}<small>{[hit.tehsil, hit.district, hit.province].filter(Boolean).join(' · ')}</small></span>
            </button>
          ))}
          {!hits.length && CITIES.map(([name, lat, lon]) => {
            const now = temps?.[name];
            const temp = Number.isFinite(+now?.tempC) ? `${Number(now.tempC).toFixed(1)}°` : '';
            return (
              <button key={name} type="button" className={place?.name === name ? 'on' : ''} onClick={() => choose({ lat, lon, name })}>
                <span>{name}</span>
                <em>{temp} {sky(now?.weatherCode)}</em>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const CONSOLES = Object.entries(CONSOLE_TARGETS).map(([id, item]) => [id, item.label]);

export function Consoles() {
  const operator = useOperator();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null);
  const closeConsole = useRef(() => {});
  closeConsole.current = () => setActive(null);
  useChromeExclusive('consoles', setOpen);
  useEffect(() => {
    const onChrome = (event) => {
      if (event.detail?.open !== 'consoles') setActive(null);
    };
    window.addEventListener('agn-chrome', onChrome);
    return () => window.removeEventListener('agn-chrome', onChrome);
  }, []);
  if (!operator) return null;
  return (
    <>
      <div className={`consoles${open ? ' open' : ''}`}>
        <button type="button" aria-expanded={open} onClick={() => setOpen((value) => {
          const next = !value;
          if (next) openChrome('consoles');
          return next;
        })}>Consoles <span>({CONSOLES.length})</span></button>
        {open && (
          <div role="menu">
            {CONSOLES.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setActive(id);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {active && <OperatorConsoles consoleKey={active} onClose={() => closeConsole.current()} />}
    </>
  );
}

export function Account() {
  const on = useOperator();
  const gate = useGate();
  const [open, setOpen] = useState(false);
  const [eligible, setEligible] = useState(null);
  const [ask, setAsk] = useState(false);
  useChromeExclusive('account', setOpen);

  useEffect(() => {
    if (!gate.ready) return undefined;
    if (!gate.open) {
      setEligible(false);
      setOperator(false);
      return undefined;
    }
    let live = true;
    getJson('/api/operator/status').then((body) => {
      if (!live) return;
      const allowed = body?.operator === true;
      setEligible(allowed);
      if (!allowed) setOperator(false);
      else if (operatorOn()) setOperator(true);
    }).catch(() => { if (live) { setEligible(false); setOperator(false); } });
    return () => { live = false; };
  }, [gate.ready, gate.open]);

  const locked = !gate.open;

  return (
    <div className={`acct${open ? ' open' : ''}`}>
      <button type="button" className="avatar" aria-expanded={open} aria-label="Account" onClick={() => setOpen((value) => {
        const next = !value;
        if (next) openChrome('account');
        return next;
      })}>AJ</button>
      {open && (
        <div role="menu">
          <b>AJ</b>
          <span>NIGRAAN workspace · {on ? 'operator view' : 'your view'}</span>
          {locked && (
            <button type="button" className="is-locked" onClick={() => { setOpen(false); setAsk(true); }}>
              <LockIcon /> Operator mode <em className="is-lock">Locked</em>
            </button>
          )}
          {!locked && eligible && (
            <button type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => setOperator(!on)}>
              Operator mode <em>{on ? 'On' : 'Off'}</em>
            </button>
          )}
          <p>{on ? 'Engineering consoles, QA output and version tags are shown.' : locked ? 'Locked until a dashboard token is entered.' : 'Shown only on this computer. Lock again from the dashboard.'}</p>
        </div>
      )}
      {ask && <TokenDialog title="Operator mode is locked" onClose={() => setAsk(false)} />}
    </div>
  );
}
