import { useEffect, useMemo, useRef, useState } from 'react';
import MapView from '../start/MapView.jsx';
import { dayName, getJson, pktClock, whenWords } from '../start/api.js';
import { ensureCurrentPlace, inPakistan } from '../analyst/place.js';
import { getPointBundle } from '../analyst/placeCache.js';
import { go } from '../nav.js';
import { CustomizeLink } from '../GateLock.jsx';
import PlaceDrawer from './PlaceDrawer.jsx';

const WORDS = ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
const BAR = ['#74c476', '#ffe680', '#fdae61', '#e8552d', '#a50026'];
const EXAMPLES = ['G-8, Islamabad', 'Gilgit', '31.52, 74.36', 'Murree'];
const HAZARD_LAYERS = [['heat', 'Heat stress'], ['cold', 'Cold stress'], ['rain_hz', 'Heavy rain'], ['flood', 'Flood'], ['wind', 'Wind and gusts'], ['landslide', 'Landslide'], ['glof', 'GLOF'], ['drought', 'Drought']];
function hashPlace() {
  const match = /[#&]agnplace=(-?[0-9.]+),(-?[0-9.]+)(?:,([^&]*))?/.exec(window.location.hash || '');
  if (!match) return null;
  let name = '';
  try { name = match[3] ? decodeURIComponent(match[3]) : ''; } catch { name = ''; }
  return { lat: +match[1], lon: +match[2], name };
}

function parsePair(text) {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text || '');
  if (!match) return null;
  const lat = +match[1];
  const lon = +match[2];
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function placeLine(bundle) {
  const place = bundle?.place || {};
  const name = place.kind === 'near' && place.near?.name ? place.near.name : (place.name || 'this point');
  const area = [place.tehsil && place.tehsil !== name ? place.tehsil : null, place.district ? String(place.district).replace(/ District$/, '') : null, place.province]
    .filter((part, index, all) => part && all.indexOf(part) === index)
    .join(', ');
  return { name, near: place.kind === 'near' && !!place.near?.name, area };
}

function sortedBars(day) {
  return (day?.bars || [])
    .filter((bar) => String(bar.code) !== '-4')
    .map((bar, index) => ({ bar, index, level: bar.state === 'level' && Number.isFinite(+bar.level) ? +bar.level : null }))
    .sort((a, b) => {
      if (a.level != null && b.level != null) return (b.level - a.level) || (a.index - b.index);
      if (a.level != null) return -1;
      if (b.level != null) return 1;
      return a.index - b.index;
    });
}

/** "Not assessed" / "Not tested" are hidden by default; a View button reveals them. */
function isHeldHazard(level, word) {
  if (level != null) return false;
  return /not assessed|not tested/i.test(String(word || ''));
}

function fin(value) {
  return value != null && value !== '' && Number.isFinite(+value);
}
function r0(value) {
  if (!fin(value)) return '—';
  return String(Math.round(+value));
}
function r1(value) {
  if (!fin(value)) return '—';
  return String(Math.round(+value * 10) / 10);
}
function pktHour(iso) {
  /* /api/point hours are already Asia/Karachi wall times (no Z). Do not add +5. */
  if (!iso) return '';
  const text = String(iso);
  return text.length >= 16 ? text.slice(11, 16) : text;
}
function pktDayLab(iso) {
  if (!iso) return '';
  const text = String(iso);
  const ymd = text.slice(0, 10);
  const parts = ymd.split('-').map(Number);
  if (parts.length !== 3 || !parts.every(Number.isFinite)) return ymd;
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${d.getUTCDate()} ${days[d.getUTCDay()].toUpperCase()}`;
}
function wxKind(code, hour) {
  const n = Number(code);
  const h = +(String(hour || '').slice(11, 13) || 12);
  const night = h < 6 || h >= 19;
  if (!Number.isFinite(n) || n === 0) return night ? 'clear-night' : 'clear';
  if (n <= 3) return 'cloud';
  if (n <= 48) return 'fog';
  if (n <= 67 || (n >= 80 && n <= 82)) return 'rain';
  if (n <= 77 || n >= 85) return 'snow';
  if (n >= 95) return 'storm';
  return 'cloud';
}
function WxIcon({ kind }) {
  const common = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', 'aria-hidden': 'true' };
  if (kind === 'clear') {
    return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
  }
  if (kind === 'clear-night') {
    return <svg {...common}><path d="M20 14.5A7.5 7.5 0 1 1 9.5 4 6 6 0 0 0 20 14.5z" /></svg>;
  }
  if (kind === 'rain') {
    return <svg {...common}><path d="M8 17l-1.5 3M12 17l-1.5 3M16 17l-1.5 3" /><path d="M6.5 14a5 5 0 0 1 .4-9.1A6 6 0 0 1 18 8.5a3.5 3.5 0 0 1-.2 5.5" /></svg>;
  }
  if (kind === 'snow') {
    return <svg {...common}><path d="M12 4v16M6 8l12 8M6 16l12-8" /></svg>;
  }
  if (kind === 'storm') {
    return <svg {...common}><path d="M13 3 6 14h6l-1 7 7-11h-6l1-7z" /></svg>;
  }
  if (kind === 'fog') {
    return <svg {...common}><path d="M4 10h16M5 14h14M7 18h10" /></svg>;
  }
  return <svg {...common}><path d="M7 16a5 5 0 0 1 .5-9.2A6.5 6.5 0 0 1 19.5 10 3.8 3.8 0 0 1 19 16Z" /></svg>;
}
function weatherHours(bundle, dayIndex = 0, step = 1) {
  const hours = bundle?.hours || [];
  const date = bundle?.days?.[dayIndex]?.date || String(bundle?.now?.time || hours[0]?.time || '').slice(0, 10);
  if (!date || !hours.length) return [];
  let rows = hours.filter((row) => String(row.time).slice(0, 10) === String(date));
  if (dayIndex === 0) {
    const from = bundle?.now?.time || '';
    if (from) rows = rows.filter((row) => String(row.time) >= String(from));
  }
  const out = [];
  for (let i = 0; i < rows.length && out.length < 48; i += step) out.push(rows[i]);
  return out;
}

function WxScroll({ children }) {
  const box = useRef(null);
  const [canL, setCanL] = useState(false);
  const [canR, setCanR] = useState(false);
  function sync() {
    const el = box.current;
    if (!el) return;
    setCanL(el.scrollLeft > 2);
    setCanR(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const id = requestAnimationFrame(sync);
    el.addEventListener('scroll', sync, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null;
    ro?.observe(el);
    return () => {
      cancelAnimationFrame(id);
      el.removeEventListener('scroll', sync);
      ro?.disconnect();
    };
  }, [children]);
  function nudge(dir) {
    const el = box.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.7, 220), behavior: 'smooth' });
  }
  return (
    <div className="nv-wx-wrap">
      <button type="button" className="nv-wx-nav prev" aria-label="Earlier hours" disabled={!canL} onClick={() => nudge(-1)}>‹</button>
      <div className="nv-wx-scroll" ref={box}>{children}</div>
      <button type="button" className="nv-wx-nav next" aria-label="Later hours" disabled={!canR} onClick={() => nudge(1)}>›</button>
    </div>
  );
}
function weatherNowLine(bundle, dayIndex = 0) {
  const now = bundle?.now || {};
  const dayRow = bundle?.days?.[dayIndex];
  if (dayIndex === 0) {
    return {
      headline: `${r1(now.tempC)}°`,
      bits: [
        { k: 'Feels', v: `${r0(now.feelsC)}°` },
        { k: 'RH', v: `${r0(now.rh)}%` },
        { k: 'Wind', v: `${r0(now.windKmh)} km/h` },
        { k: 'Gust', v: `${r0(now.gustKmh)} km/h` },
        { k: 'Cloud', v: `${r0(now.cloudPct)}%` },
      ],
    };
  }
  if (!dayRow) return { headline: '—', bits: [] };
  return {
    headline: `${r0(dayRow.tmaxC)}°/${r0(dayRow.tminC)}°`,
    bits: [
      { k: 'Max', v: `${r0(dayRow.tmaxC)}°` },
      { k: 'Min', v: `${r0(dayRow.tminC)}°` },
      { k: 'Rain', v: `${r1(dayRow.rainMm)} mm` },
      { k: 'Wind', v: `${r0(dayRow.windMaxKmh)} km/h` },
      { k: 'Gust', v: `${r0(dayRow.gustMaxKmh)} km/h` },
    ],
  };
}

function summary(hazard, dayIndex) {
  const day = hazard.days?.[dayIndex];
  const ranked = sortedBars(day);
  const top = ranked.find((row) => row.level != null) || null;
  const above = (day?.bars || []).filter((bar) => bar.state === 'level' && Number.isFinite(+bar.level) && +bar.level >= 1).length;
  const withLevel = (day?.bars || []).filter((bar) => bar.state === 'level' && Number.isFinite(+bar.level)).length;
  const topLine = top && top.level === 0
    ? 'Highest level here: Normal'
    : top
      ? `Highest: ${top.bar.name} · ${top.bar.label || WORDS[top.level]}`
      : `No hazard level is issued here ${whenWords(dayIndex)}`;
  const aboveLine = !withLevel
    ? `No hazard is assessed here ${whenWords(dayIndex)}`
    : above
      ? `${above} of ${withLevel} assessed ${withLevel === 1 ? 'hazard' : 'hazards'} above Normal`
      : `All ${withLevel} assessed ${withLevel === 1 ? 'hazard is' : 'hazards are'} Normal`;
  let worst = null;
  (hazard.days || []).forEach((item, index) => {
    const lead = sortedBars(item).find((row) => row.level != null && row.level >= 1);
    if (lead && (!worst || lead.level > worst.level)) worst = { index, level: lead.level, bar: lead.bar };
  });
  const worstLine = worst
    ? `Worst day: ${dayName(worst.index)} · ${worst.bar.name} ${worst.bar.label || WORDS[worst.level]}`
    : `No day above Normal in the next ${(hazard.days || []).length} days`;
  return { topLine, aboveLine, worstLine };
}

export default function StartPage() {
  const [clock, setClock] = useState(() => pktClock());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searchNote, setSearchNote] = useState('');
  const [openSearch, setOpenSearch] = useState(false);
  const [day, setDay] = useState(0);
  const [grid, setGrid] = useState(null);
  const [sel, setSel] = useState(null);
  const [bundle, setBundle] = useState(null);
  const [fly, setFly] = useState(null);
  const [sitesOpen, setSitesOpen] = useState(false);
  const [savedSites, setSavedSites] = useState([]);
  const [sitesNote, setSitesNote] = useState('');
  const sitesLoad = useRef(0);
  const [hazardOpen, setHazardOpen] = useState(false);
  const [hazardKey, setHazardKey] = useState('');
  const [hazardDay, setHazardDay] = useState(0);
  const [panelMode, setPanelMode] = useState('weather');
  const [panelOpen, setPanelOpen] = useState(true);
  const [wxStep, setWxStep] = useState(1);
  const [showHeldHazards, setShowHeldHazards] = useState(false);
  const [detail, setDetail] = useState(() => !!hashPlace());

  useEffect(() => {
    const fromHash = hashPlace();
    if (fromHash) {
      choose(fromHash.lat, fromHash.lon, fromHash.name);
      return undefined;
    }
    let cancel = false;
    ensureCurrentPlace('/').then((place) => {
      if (cancel || !place) return;
      choose(place.lat, place.lon, place.name || 'Your location', true);
    });
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    const body = document.body;
    body.classList.add('v-start');
    if (detail) {
      body.classList.add('v-card');
      body.classList.remove('agn-nat', 'agn-dark', 'nv-has', 'nv-open', 'v-saved', 'nv-wx');
    } else if (sitesOpen) {
      body.classList.add('agn-nat', 'agn-dark', 'v-saved');
      body.classList.remove('v-card', 'nv-wx');
    } else {
      body.classList.add('agn-nat', 'agn-dark');
      body.classList.remove('v-card', 'v-saved');
      if (sel) {
        body.classList.add('nv-has');
        body.classList.toggle('nv-open', panelOpen);
      } else {
        body.classList.remove('nv-has', 'nv-open');
      }
      body.classList.toggle('nv-wx', !!sel && panelMode === 'weather');
    }
    return () => body.classList.remove('v-start', 'agn-nat', 'agn-dark', 'nv-has', 'nv-open', 'v-card', 'v-saved', 'nv-wx');
  }, [sel, detail, sitesOpen, panelMode, panelOpen]);

  useEffect(() => {
    if (sel) setPanelOpen(true);
  }, [sel?.lat, sel?.lon]);

  function sameSpot(a, b) {
    return Math.abs(+a.lat - +b.lat) < 0.0002 && Math.abs(+a.lon - +b.lon) < 0.0002;
  }

  function rememberSites(next) {
    const rows = next.filter((row) => Number.isFinite(+row.lat) && Number.isFinite(+row.lon));
    sitesLoad.current += 1;
    localStorage.setItem('nigraan.sites', JSON.stringify(rows.slice(0, 40)));
    setSavedSites(rows);
    setSitesNote(rows.length ? '' : 'No saved site yet. Search a place or click the map, then press Save site.');
    getJson('/api/case/project?id=my-sites').then((existing) => {
      if (!existing || existing.__status || !existing.document?.manifest) return null;
      const doc = existing.document;
      doc.assets = (Array.isArray(doc.assets) ? doc.assets : []).filter((asset) => rows.some((row) => sameSpot(row, { lat: asset.latitude, lon: asset.longitude })));
      if (!doc.company) doc.company = { client_name: 'My sites' };
      doc.company.active_asset_id = doc.assets[0]?.asset_id || null;
      return fetch('/api/case/project', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(doc) });
    }).catch(() => {});
  }

  useEffect(() => {
    if (!sitesOpen) return undefined;
    const load = ++sitesLoad.current;
    setSitesNote('Loading your sites…');
    getJson('/api/case/project?id=my-sites').then((body) => {
      if (load !== sitesLoad.current) return;
      const assets = body && !body.__status ? (body.document?.assets || []) : [];
      const local = JSON.parse(localStorage.getItem('nigraan.sites') || '[]');
      const rows = assets.map((asset) => ({ lat: +asset.latitude, lon: +asset.longitude, name: asset.name, tehsil: asset.tehsil, district: asset.district }));
      local.forEach((row) => {
        if (!rows.some((item) => Math.abs(item.lat - row.lat) < 0.0002 && Math.abs(item.lon - row.lon) < 0.0002)) rows.push(row);
      });
      const ready = rows.filter((row) => Number.isFinite(+row.lat) && Number.isFinite(+row.lon));
      setSavedSites(ready);
      setSitesNote(ready.length ? '' : 'No saved site yet. Search a place or click the map, then press Save site.');
    }).catch(() => { if (load === sitesLoad.current) setSitesNote('My sites could not be read. Try again.'); });
    return undefined;
  }, [sitesOpen]);

  useEffect(() => {
    const timer = setInterval(() => setClock(pktClock()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2 || parsePair(text)) {
      setResults([]);
      setSearchNote('');
      return undefined;
    }
    let cancel = false;
    const timer = setTimeout(() => {
      getJson(`/api/geo/search?q=${encodeURIComponent(text)}&limit=8`).then((body) => {
        if (cancel) return;
        setResults(body.results || []);
        setSearchNote((body.results || []).length ? '' : 'No place matched that name.');
        setOpenSearch(true);
      }).catch(() => {
        if (!cancel) setSearchNote('Search did not answer.');
      });
    }, 220);
    return () => { cancel = true; clearTimeout(timer); };
  }, [query]);

  useEffect(() => { setShowHeldHazards(false); }, [sel?.lat, sel?.lon, day]);

  function choose(lat, lon, name, zoom) {
    const point = { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5, name: name || '' };
    setSel(point);
    setBundle(null);
    setOpenSearch(false);
    /* Zoom/fly only when opening Full details (place view) — national map stays on Pakistan. */
    if (zoom && detail) setFly({ lat: point.lat, lon: point.lon, at: Date.now() });
    getPointBundle({ lat: point.lat, lon: point.lon, name: point.name || '', parts: 'default,hazardCount' }).then((body) => {
      if (!body || body.ok !== true) {
        setBundle({ error: body?.outside ? 'That point is outside Pakistan.' : body?.atSea ? 'That point is at sea.' : 'This point is not available right now.' });
        return;
      }
      setBundle(body);
    }).catch(() => setBundle({ error: 'This point did not answer.' }));
  }

  function onSubmit(event) {
    event.preventDefault();
    const pair = parsePair(query);
    if (pair) {
      choose(pair.lat, pair.lon, query, true);
      return;
    }
    if (results[0]) choose(results[0].lat, results[0].lon, results[0].name, true);
  }

  const hazard = bundle?.parts?.hazardCount?.v;
  const place = bundle && !bundle.error ? placeLine(bundle) : null;
  const lines = hazard ? summary(hazard, day) : null;
  const bars = hazard ? sortedBars(hazard.days?.[day]) : [];
  const scoredBars = [];
  const heldBars = [];
  for (const row of bars) {
    const word = row.level == null ? (row.bar.word || 'Not assessed') : (row.bar.label || WORDS[row.level]);
    if (isHeldHazard(row.level, word)) heldBars.push(row);
    else scoredBars.push(row);
  }
  const visibleBars = showHeldHazards ? scoredBars.concat(heldBars) : scoredBars;
  const wxRows = bundle && !bundle.error ? weatherHours(bundle, day, wxStep) : [];
  const wxNow = bundle && !bundle.error ? weatherNowLine(bundle, day) : null;
  const placeHash = sel
    ? `#agnplace=${sel.lat.toFixed(5)},${sel.lon.toFixed(5)},${encodeURIComponent(place?.name || sel.name || '')}`
    : '';
  const analystPath = `/analyst${placeHash}`;
  const customizePath = `/customize${placeHash}`;

  const legend = useMemo(() => {
    if (panelMode === 'weather') {
      const title = `Map · peak temperature ${whenWords(day)}`;
      if (!grid || grid.kind !== 'weather') {
        return { kind: 'weather', title, ready: false, why: 'Loading the temperature forecast…' };
      }
      if (!grid.ready) {
        return { kind: 'weather', title, ready: false, why: grid.why || 'Temperature forecast is not available right now.' };
      }
      return {
        kind: 'weather',
        ready: true,
        title,
        min: grid.min,
        max: grid.max,
        dataMin: grid.dataMin,
        dataMax: grid.dataMax,
      };
    }
    if (!grid || grid.kind === 'weather' || !grid.ready) {
      const why = grid?.kind === 'weather'
        ? 'Loading the hazard surface…'
        : (grid?.why ? `${grid.why.charAt(0).toUpperCase()}${grid.why.slice(1)}.` : 'The hazard surface is not available right now.');
      return { kind: 'hazard', title: `Map · hazards ${whenWords(day)} at Moderate or above`, why, ready: false };
    }
    const onMap = (grid.counted || []).join(', ');
    const placeOnly = (grid.notCounted || []).map((row) => (typeof row === 'string' ? row : row.name)).filter(Boolean);
    return {
      kind: 'hazard',
      ready: true,
      title: `Map · hazards ${whenWords(day)} at Moderate or above`,
      max: grid.scale?.max,
      onMap,
      placeOnly: placeOnly.join(', '),
      placeOnlyN: placeOnly.length,
      km: grid.grid?.km,
    };
  }, [grid, day, panelMode]);

  return (
    <>
      <MapView day={day} pin={sel} fly={fly} placeMode={detail} hazardKey={panelMode === 'hazard' ? hazardKey : ''} hazardDay={hazardDay} mode={panelMode} onPick={(lat, lon, name) => choose(lat, lon, name, detail)} onGrid={setGrid} />
      <header id="bar">
        <div id="brand">
          <img id="agnLogo" src="/agn-logo.png" width="120" height="56" alt="AI Geo Navigators" />
          <span className="bdiv" aria-hidden="true" />
          <div className="bname">
            <strong>NIGRAAN</strong>
            <span>National Integrated Geo-Risk, Alert &amp; Atmospheric Network</span>
          </div>
        </div>
        <button id="home" type="button" aria-label="Start again" onClick={() => { setDetail(false); setSel(null); setBundle(null); setQuery(''); }}>‹ New search</button>
        <div id="slotTop" />
        <div id="topRight">
          <span className="pkid">
            <svg className="pkflag" width="27" height="18" viewBox="0 0 30 20" role="img" aria-label="Flag of Pakistan">
              <rect width="30" height="20" fill="#FFFFFF" />
              <rect x="7.5" width="22.5" height="20" fill="#01411C" />
              <path d="M16.919 4.286A6 6 0 1 0 24.21 12.489A5.5 5.5 0 0 1 16.919 4.286Z" fill="#FFFFFF" />
              <polygon points="23.234,6.014 22.5,7.268 23.465,8.354 22.046,8.042 21.311,9.296 21.169,7.85 19.749,7.539 21.081,6.956 20.938,5.51 21.903,6.596" fill="#FFFFFF" />
            </svg>
            <span>Pakistan</span>
          </span>
          <span id="clock" aria-label="Pakistan time">{clock}</span>
          <button className="bbtn" id="btnSaved" type="button" onClick={() => setSitesOpen((open) => !open)}>My sites</button>
          <CustomizeLink className="bbtn" id="btnCustomize" to={customizePath}>Customize</CustomizeLink>
          <button className="bbtn act" id="btnAnalyst" type="button" onClick={() => go(analystPath)}>Analyst view</button>
        </div>
      </header>
      <section id="hero" aria-label="Check a site">
        <h1>Weather risk for any place in Pakistan<span>A city, a village, or the site you have in mind.</span></h1>
        <form className="sform" id="sform" autoComplete="off" role="search" onSubmit={onSubmit}>
          <label className="sbox">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2F6468" strokeWidth="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input id="q" type="search" value={query} placeholder="Place, tehsil, or lat, lon" aria-label="Place, tehsil or coordinates (lat, lon)" onChange={(event) => { setQuery(event.target.value); setOpenSearch(true); }} onFocus={() => setOpenSearch(true)} />
          </label>
          <div className="hero-acts">
            <button className="locb" type="button" id="myLoc" title="Current location" aria-label="Current location" onClick={() => {
              if (!navigator.geolocation) return;
              navigator.geolocation.getCurrentPosition((pos) => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                if (!inPakistan(lat, lon)) return;
                choose(lat, lon, 'Your location', true);
              });
            }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="12" cy="12" r="6" /><path d="M12 1v5M12 18v5M1 12h5M18 12h5" /></svg>
              <span>Current location</span>
            </button>
            <button className="sbtn" type="submit" id="go">Check</button>
          </div>
          <div className="sr" id="sr" hidden={!openSearch || (!results.length && !searchNote)} role="listbox" aria-label="Search results">
            {searchNote ? <div className="msg">{searchNote}</div> : null}
            {results.map((placeRow) => (
              <button type="button" key={placeRow.id || `${placeRow.lat},${placeRow.lon}`} onClick={() => { setQuery(placeRow.name); choose(placeRow.lat, placeRow.lon, placeRow.name, true); }}>
                {placeRow.name}
                <small>{[placeRow.kind, placeRow.district, placeRow.province].filter(Boolean).join(' · ')}</small>
              </button>
            ))}
          </div>
        </form>
        <div className="ex-row">
          <span>Try</span>
          {EXAMPLES.map((example) => (
            <button className="ex" type="button" key={example} onClick={() => {
              setQuery(example);
              const pair = parsePair(example);
              if (pair) { choose(pair.lat, pair.lon, example); return; }
              getJson(`/api/geo/search?q=${encodeURIComponent(example)}&limit=1`).then((body) => {
                const hit = body.results?.[0];
                if (hit) choose(hit.lat, hit.lon, hit.name, true);
              }).catch(() => {});
            }}>{example}</button>
          ))}
        </div>
        <button className="pkfit" type="button" id="pkFit" title="Zoom out to the Pakistan boundary">
          <span>Pakistan</span>
          <small>Whole country</small>
        </button>
      </section>
      {sitesOpen ? (
        <aside id="saved" aria-label="My sites">
          <div className="saved-head">
            <h1>My sites · {savedSites.length}</h1>
            <button type="button" className="clearbtn" disabled={!savedSites.length} onClick={() => rememberSites([])}>Clear</button>
          </div>
          {sitesNote && <p className="note">{sitesNote}</p>}
          {savedSites.map((site) => {
            const where = [site.district, site.tehsil].filter((part, index, list) => part && list.indexOf(part) === index).join(' · ');
            return (
              <div className="srow" key={`${site.lat},${site.lon},${site.name}`}>
                <button type="button" className="sopen" onClick={() => {
                  setSitesOpen(false);
                  choose(+site.lat, +site.lon, site.name);
                  setFly(null);
                  setDetail(true);
                }}>
                  <strong>{site.name || 'Saved site'}</strong>
                  {where ? <div className="why">{where}</div> : null}
                </button>
                <button type="button" className="sclear" aria-label={`Remove ${site.name || 'saved site'}`} onClick={() => rememberSites(savedSites.filter((row) => !sameSpot(row, site)))}>Clear</button>
              </div>
            );
          })}
          <button type="button" className="addbtn" onClick={() => setSitesOpen(false)}>Add sites (search or click the map)</button>
        </aside>
      ) : null}
      {panelMode === 'hazard' ? (
        <div id="hzWrap">
          <div id="hzMenu" hidden={!hazardOpen}>
            <h3>Hazard layers</h3>
            <div className="opts">
              <button type="button" aria-pressed={!hazardKey} onClick={() => setHazardKey('')}>Off</button>
              {HAZARD_LAYERS.map(([key, label]) => (
                <button key={key} type="button" aria-pressed={hazardKey === key} onClick={() => setHazardKey(key)}>{label}</button>
              ))}
            </div>
            <div className="days">
              {[0, 1, 2, 3].map((value) => (
                <button key={value} type="button" aria-pressed={hazardDay === value} onClick={() => { setHazardDay(value); setDay(value); }}>
                  {value === 0 ? 'Today' : dayName(value)}
                </button>
              ))}
            </div>
            <div className="note">{hazardKey ? 'Normal is not coloured. A hatched tehsil was not assessed.' : 'The national surface stays on until you pick a layer.'}</div>
          </div>
          <button className="pill" id="hzBtn" type="button" aria-expanded={hazardOpen} onClick={() => setHazardOpen((open) => !open)}>
            <span id="hzBtnTxt">{hazardKey ? (HAZARD_LAYERS.find((row) => row[0] === hazardKey)?.[1] || 'Hazard layer') : 'Hazard layers · off'}</span>
          </button>
        </div>
      ) : null}
      <div id="nvLegend" role="region" aria-label={legend.kind === 'weather' ? 'Temperature map legend' : 'Hazard surface legend'} className={legend.kind === 'weather' ? 'wx' : 'hz'}>
        <div className="h">{legend.title}</div>
        {legend.ready ? (
          legend.kind === 'weather' ? (
            <>
              <div className="ramp wx" aria-hidden="true" />
              <div className="lab"><span>{Number(legend.min).toFixed(0)} °C</span><span>{Number(legend.max).toFixed(0)} °C</span></div>
              <div className="ct">
                Peak tehsil temp
                {Number.isFinite(+legend.dataMin) && Number.isFinite(+legend.dataMax)
                  ? ` · ${Number(legend.dataMin).toFixed(0)}–${Number(legend.dataMax).toFixed(0)} °C`
                  : ''}
              </div>
            </>
          ) : (
            <>
              <div className="ramp" aria-hidden="true" />
              <div className="lab"><span>0</span><span>{legend.max}</span></div>
              <div className="ct">Colour stacks: {legend.onMap}</div>
              {legend.placeOnly ? (
                <div className="ct">Also on a place ({legend.placeOnlyN}): {legend.placeOnly} — not added to this map colour</div>
              ) : null}
              <div className="ct">Blank: nothing assessed · one value every {legend.km} km</div>
            </>
          )
        ) : <div className="ct">{legend.why}</div>}
      </div>
      <div id="zoom">
        <button className="pill" type="button" id="zin" aria-label="Zoom in">+</button>
        <button className="pill" type="button" id="zout" aria-label="Zoom out">−</button>
      </div>
      {!detail && (
        <div id="nvDay" role="group" aria-label="Day">
          <span>Day</span>
          <div className="dw">
            <div className="days" id="nvDays">
              {[0, 1, 2, 3].map((offset) => (
                <span
                  key={offset}
                  className={offset === day ? 'on' : undefined}
                  onClick={() => { setDay(offset); setHazardDay(offset); }}
                >
                  {dayName(offset)}
                </span>
              ))}
            </div>
            <input
              id="nvDayR"
              type="range"
              min="0"
              max="3"
              step="1"
              value={day}
              aria-label="Day: today to three days ahead"
              onChange={(event) => {
                const next = +event.target.value;
                setDay(next);
                setHazardDay(next);
              }}
            />
          </div>
          <div className="nv-day-acts">
            <button
              type="button"
              id="nvMore"
              disabled={!sel}
              onClick={() => {
                if (!sel) return;
                /* Open drawer at Pakistan zoom; search/click on that page zooms in. */
                setFly(null);
                setDetail(true);
              }}
            >
              Full details
            </button>
          </div>
        </div>
      )}
      <section id="nvPanel" aria-label={panelMode === 'weather' ? 'Weather at this point' : 'Hazards at this point'}>
        <button
          type="button"
          id="nvToggle"
          aria-expanded={panelOpen}
          aria-controls="nvBody"
          aria-label={panelOpen ? 'Close weather panel' : 'Open weather panel'}
          title={panelOpen ? 'Close panel' : 'Open panel'}
          onClick={() => setPanelOpen((open) => !open)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3.5 6.2 8 10.4l4.5-4.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="nv-main">
          <div
            className="nvh"
            id="nvHead"
            onClick={() => { if (!panelOpen) setPanelOpen(true); }}
            onKeyDown={(event) => {
              if (!panelOpen && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                setPanelOpen(true);
              }
            }}
            role={!panelOpen ? 'button' : undefined}
            tabIndex={!panelOpen ? 0 : undefined}
            aria-label={!panelOpen ? 'Open weather panel' : undefined}
          >
            <div className="nv-modes" role="tablist" aria-label="Panel mode">
              <button type="button" role="tab" aria-selected={panelMode === 'weather'} className={panelMode === 'weather' ? 'on' : ''} onClick={(event) => { event.stopPropagation(); setPanelMode('weather'); setHazardOpen(false); setPanelOpen(true); }}>Weather</button>
              <button type="button" role="tab" aria-selected={panelMode === 'hazard'} className={panelMode === 'hazard' ? 'on' : ''} onClick={(event) => { event.stopPropagation(); setPanelMode('hazard'); setPanelOpen(true); }}>Hazard</button>
            </div>
            <h2 id="nvH">
              {place ? (
                <span id="nvTt">
                  <span id="nvKind">{panelMode === 'weather' ? 'Weather' : 'Hazards'}</span>
                  {' '}
                  <span id="nvWhen">{whenWords(day)}</span>
                  {' · '}
                  <span id="nvName">{place.name}</span>
                </span>
              ) : (
                <span id="nvHint2">{bundle?.error || (sel ? 'Reading this point…' : 'Click the map or use Current location')}</span>
              )}
            </h2>
            <span className="sub" id="nvSub">{place ? place.area : ''}</span>
            {panelMode === 'weather' && (
              <div className="nv-wx-step" role="group" aria-label="Hour step">
                <button type="button" className={wxStep === 1 ? 'on' : ''} onClick={() => setWxStep(1)}>1h</button>
                <button type="button" className={wxStep === 3 ? 'on' : ''} onClick={() => setWxStep(3)}>3h</button>
              </div>
            )}
          </div>
          <div id="nvBody" className={panelMode === 'weather' ? 'wx' : 'hz'}>
            {panelMode === 'hazard' ? (
              <div id="nvHz" aria-label="Hazard levels">
                {!sel ? null : !bundle ? <div className="ld">Reading the hazards at this point…</div> : bundle.error ? <div className="ld">{bundle.error}</div> : (
                  <>
                    <div className="nv-hz-sum" id="nvSum">
                      <span id="nvTop">{lines?.topLine}</span>
                      <span id="nvAbove">{lines?.aboveLine}</span>
                      <span id="nvWorst">{lines?.worstLine}</span>
                    </div>
                    <div className="nv-hz-grid" role="list">
                      {visibleBars.map(({ bar, level }) => {
                        const word = level == null ? (bar.word || 'Not assessed') : (bar.label || WORDS[level]);
                        const tone = level == null ? 'na' : `l${level}`;
                        const fill = level == null ? 'transparent' : BAR[level];
                        return (
                          <div className={`nv-hz-card ${tone}`} role="listitem" key={bar.key}>
                            <div className="nv-hz-top">
                              <b>{bar.name}{bar.area ? <i> area</i> : null}</b>
                              <em style={level != null ? { color: fill } : undefined}>{word}</em>
                            </div>
                            <div className="nv-hz-track" aria-hidden="true">
                              {level == null
                                ? <span className="nv-hz-dash" />
                                : <span className="nv-hz-fill" style={{ width: `${Math.max((level + 1) / 5 * 100, 12)}%`, background: fill }} />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {heldBars.length > 0 && (
                      <button
                        type="button"
                        className={`nv-hz-held${showHeldHazards ? ' on' : ''}`}
                        aria-expanded={showHeldHazards}
                        onClick={() => setShowHeldHazards((on) => !on)}
                      >
                        {showHeldHazards
                          ? 'Hide not assessed / not tested'
                          : `View ${heldBars.length} not assessed / not tested`}
                      </button>
                    )}
                  </>
                )}
              </div>
            ) : (
                <div id="nvWx" aria-label="Hourly weather forecast">
                  {!sel ? null : !bundle ? <div className="ld">Reading the weather at this point…</div> : bundle.error ? <div className="ld">{bundle.error}</div> : (
                    <>
                      {wxNow && (
                        <div className="nv-now">
                          <b>{wxNow.headline}</b>
                          {wxNow.bits.map((bit) => (
                            <span key={bit.k}><i>{bit.k}</i>{bit.v}</span>
                          ))}
                        </div>
                      )}
                      {wxRows.length === 0 ? <div className="ld">No hourly forecast for {whenWords(day)}.</div> : (
                        <WxScroll>
                          <table className="nv-wx-grid">
                            <thead>
                              <tr className="day">
                                <th scope="row" />
                                {wxRows.map((row, i) => {
                                  const lab = pktDayLab(row.time);
                                  const prev = i > 0 ? pktDayLab(wxRows[i - 1].time) : '';
                                  return <th key={`d-${row.time}`}>{lab !== prev ? lab : ''}</th>;
                                })}
                              </tr>
                              <tr className="time">
                                <th scope="row">PKT</th>
                                {wxRows.map((row) => <th key={`t-${row.time}`}>{pktHour(row.time)}</th>)}
                              </tr>
                              <tr className="ico">
                                <th scope="row" />
                                {wxRows.map((row) => (
                                  <td key={`i-${row.time}`}><WxIcon kind={wxKind(row.weatherCode, row.time)} /></td>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="temp">
                                <th scope="row">Temp °C</th>
                                {wxRows.map((row) => <td key={`tp-${row.time}`}>{r0(row.tempC)}°</td>)}
                              </tr>
                              <tr className="rain">
                                <th scope="row">Rain mm</th>
                                {wxRows.map((row) => <td key={`rn-${row.time}`}>{r1(row.rainMm)}</td>)}
                              </tr>
                              <tr className="wind">
                                <th scope="row">Wind km/h</th>
                                {wxRows.map((row) => <td key={`wd-${row.time}`}>{r0(row.windKmh)}</td>)}
                              </tr>
                              <tr className="gust">
                                <th scope="row">Gust km/h</th>
                                {wxRows.map((row) => <td key={`gs-${row.time}`}>{r0(row.gustKmh)}</td>)}
                              </tr>
                              <tr className="cloud">
                                <th scope="row">Cloud %</th>
                                {wxRows.map((row) => <td key={`cl-${row.time}`}>{r0(row.cloudPct)}</td>)}
                              </tr>
                              <tr className="solar">
                                <th scope="row">Solar W/m²</th>
                                {wxRows.map((row) => <td key={`sw-${row.time}`}>{r0(row.swRad)}</td>)}
                              </tr>
                            </tbody>
                          </table>
                        </WxScroll>
                      )}
                    </>
                  )}
                </div>
              )}
          </div>
        </div>
      </section>
      {detail && sel && (
        <PlaceDrawer place={sel} day={day} analystPath={analystPath} onClose={() => setDetail(false)} />
      )}
    </>
  );
}
