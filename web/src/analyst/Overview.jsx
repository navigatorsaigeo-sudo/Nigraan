import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AnalystMap from './AnalystMap.jsx';
import Guidance from './Guidance.jsx';
import HourStrip from './HourStrip.jsx';
import { tehsilAt, tehsilRows } from './features.js';
import { AQI_COLOURS, CANNOT, GLOF_EXPOSURE, HEAT_INDEX_COLOURS, HEAT_INDEX_WORDS, LEVEL_COLOURS, LEVEL_WORDS, TABS, UNTESTED } from './layers.js';
import { ensureCurrentPlace, readHashPlace, writePlace } from './place.js';
import { cachedGet, getPointBundle, peekCached, peekPointBundle } from './placeCache.js';
import { CheckMenu, ChoiceMenu, DailyMenu, HeatLine, MoreLayers, OutlookPanel } from './MapMenus.jsx';
import { openChrome } from './HeaderTools.jsx';
import { Reports } from './Reports.jsx';
import { getJson, pktClock } from '../start/api.js';
import { generateReport } from './climate.js';
import { go } from '../nav.js';
import { CustomizeLink } from '../GateLock.jsx';
import { areaLabel, scoreSite } from './siteDraw.js';

/* Same core parts as usePlace — one cache entry shared across Overview / Forecast / Operations. */
const PLACE_PARTS = 'default,context,hazardCount';

function remember(place) {
  if (!place) return;
  writePlace(place, `${window.location.pathname}${window.location.search}`);
}

function samePlace(a, b) {
  if (!a || !b) return !a && !b;
  return Number(a.lat).toFixed(5) === Number(b.lat).toFixed(5)
    && Number(a.lon).toFixed(5) === Number(b.lon).toFixed(5)
    && (a.name || '') === (b.name || '');
}

const levelsCache = new Map();
const PREFETCH_LAYERS = ['heat', 'cold', 'rain_hz', 'flood', 'landslide', 'drought'];

function levelsKey(layer, day) {
  return `${layer}|${day}`;
}

function readLevelsCache(layer, day) {
  return levelsCache.get(levelsKey(layer, day)) || null;
}

function writeLevelsCache(layer, day, levels, meta) {
  levelsCache.set(levelsKey(layer, day), { levels, meta, at: Date.now() });
  if (levelsCache.size > 40) {
    const oldest = [...levelsCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) levelsCache.delete(oldest[0]);
  }
}

function fetchLevels(layer, day) {
  const hit = readLevelsCache(layer, day);
  if (hit && Date.now() - hit.at < 5 * 60e3) return Promise.resolve(hit);
  return getJson(`/api/levels?layer=${encodeURIComponent(layer)}&day=${day}`).then((body) => {
    if (!body || body.__status || body.ready === false || !body.levels) {
      return { levels: {}, meta: { error: true, why: body?.why || 'This layer did not load', counts: [] }, at: Date.now() };
    }
    const next = { levels: body.levels, meta: body, at: Date.now() };
    writeLevelsCache(layer, day, next.levels, next.meta);
    return next;
  });
}

function pktHourKey(date = new Date()) {
  return new Date(date.getTime() + 5 * 3600e3).toISOString().slice(0, 13);
}

function hourLabel(stamp) {
  const hour = Number(String(stamp).slice(11, 13));
  if (!Number.isFinite(hour)) return '';
  return `${String(hour).padStart(2, '0')}:00`;
}

function windowStart(stamp) {
  const text = String(stamp || '');
  const hour = Number(text.slice(11, 13));
  if (!Number.isFinite(hour) || text.length < 13) return '';
  return `${text.slice(0, 11)}${String(hour - (hour % 3)).padStart(2, '0')}:00`;
}

function rainWindowStart(stamp) {
  const text = String(stamp || '');
  const ms = Date.parse(`${text.slice(0, 16)}:00Z`);
  if (!Number.isFinite(ms)) return '';
  return windowStart(new Date(ms - 3600e3).toISOString().slice(0, 16));
}

function rainTotals(hours) {
  const groups = new Map();
  hours.forEach((row) => {
    const key = rainWindowStart(row.time);
    if (!key) return;
    const list = groups.get(key) || [];
    list.push(Number(row.rainMm));
    groups.set(key, list);
  });
  const totals = new Map();
  groups.forEach((values, key) => {
    totals.set(key, values.length === 3 && values.every(Number.isFinite)
      ? Math.round(values.reduce((sum, value) => sum + value, 0) * 10) / 10
      : null);
  });
  return totals;
}

function hourGroups(hours) {
  const totals = rainTotals(hours);
  const key = pktHourKey();
  const start = Math.max(0, hours.findIndex((row) => String(row.time).slice(0, 13) >= key));
  const rows = hours.slice(start, start + 24);
  const groups = [];
  rows.forEach((row) => {
    const win = windowStart(row.time);
    const last = groups[groups.length - 1];
    if (!last || last.key !== win) groups.push({ key: win, rows: [] });
    groups[groups.length - 1].rows.push(row);
  });
  return groups.map((group) => ({ ...group, mm: totals.has(group.key) ? totals.get(group.key) : null }));
}

function rainFoot(mm) {
  if (mm == null) return '–';
  return mm > 0 ? `${mm.toFixed(1)} mm` : '0 mm';
}

function SkyMark({ code, cloud, rad }) {
  const value = Number(code);
  const day = Number(rad) > 0;
  let kind = null;
  if (Number.isFinite(value)) kind = value <= 1 ? 'clear' : value === 2 ? 'part' : 'cloud';
  else if (Number.isFinite(Number(cloud))) {
    const cover = Number(cloud);
    kind = cover < 25 ? 'clear' : cover < 70 ? 'part' : 'cloud';
  }
  if (!kind) return <span className="em">–</span>;
  const label = kind === 'clear' ? (day ? 'Clear, sun' : 'Clear') : kind === 'part' ? 'Partly cloudy' : (value === 45 || value === 48 ? 'Fog' : 'Cloudy');
  const skyClass = kind === 'clear' ? (day ? 'sky-sun' : 'sky-moon') : kind === 'part' ? 'sky-part' : 'sky-cloud';
  const sun = (
    <g className="sky-sun-g">
      <circle className="sky-sun-core" cx="12" cy="12" r="4.2" fill="#F5B942" />
      <g className="sky-sun-rays" stroke="#F5B942" strokeWidth="1.7" strokeLinecap="round">
        {[[1, 0], [0, 1], [-1, 0], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]].map(([x, y]) => (
          <line key={`${x}${y}`} x1={12 + 7 * x} y1={12 + 7 * y} x2={12 + 10 * x} y2={12 + 10 * y} />
        ))}
      </g>
    </g>
  );
  const moon = <path className="sky-moon-g" d="M15 4a7 7 0 1 0 5 12A6 6 0 0 1 15 4z" fill="#8BA3C7" />;
  const cloudShape = <path className="sky-cloud-g" d="M7 18h10a3.2 3.2 0 0 0 0-6.4 4.6 4.6 0 0 0-8.8 1.2A2.8 2.8 0 0 0 7 18z" fill="#9AABB8" />;
  return (
    <span className={`em sky ${skyClass}`} title={label}>
      <svg width="22" height="22" viewBox="0 0 24 24" role="img" aria-label={label}>
        {kind === 'clear' ? (day ? sun : moon) : kind === 'part' ? <><circle className="sky-sun-core" cx="9" cy="9" r="3.4" fill="#F5B942" />{cloudShape}</> : cloudShape}
      </svg>
    </span>
  );
}

const TABLE_PAGE = 20;

function pageMarks(page, count) {
  const keep = new Set([0, count - 1, page - 1, page, page + 1].filter((n) => n >= 0 && n < count));
  const marks = [];
  let previous = -1;
  [...keep].sort((a, b) => a - b).forEach((n) => {
    if (previous >= 0 && n - previous > 1) marks.push('…');
    marks.push(n);
    previous = n;
  });
  return marks;
}

function bandOf(legends, layer, index) {
  const rows = legends?.legends?.[layer];
  return Array.isArray(rows) ? rows[index] || '' : '';
}

const ND_SWATCH = 'rgba(148,103,201,.62)';
const NA_SWATCH = 'repeating-linear-gradient(45deg,#f4f4f1 0 4px,#c9cdc7 4px 5px)';

function legendLabel(word, band, index) {
  if (!band) return word || '';
  if (index === 0 || !word || word === 'Normal') return band;
  if (band.startsWith(`${word} ·`) || band.startsWith(`${word} `)) return band;
  return `${word} · ${band}`;
}

function missingWhy(meta) {
  const whys = meta?.whys;
  if (!whys || typeof whys !== 'object') return '';
  const first = Object.values(whys).find((value) => typeof value === 'string' && value.trim());
  if (!first) return '';
  return String(first).replace(/^not assessed:\s*/i, '').trim();
}

function keyRows(layer, scale, meta, legends) {
  const counts = meta?.counts || [];
  const rows = scale.words.map((word, index) => {
    const full = legendLabel(word, bandOf(legends, layer, index), index);
    const detail = full.startsWith(`${word} · `) ? full.slice(word.length + 3) : (full && full !== word ? full : '');
    return {
      key: `lv-${index}`,
      colour: scale.colours[index] || LEVEL_COLOURS[index] || UNTESTED,
      word,
      detail,
      count: counts[index] ?? 0,
      kind: 'level',
    };
  });
  const states = meta?.states || {};
  const missing = Number(states.missing ?? meta?.nd ?? 0) || 0;
  const cannot = Number(states.not_applicable ?? meta?.na ?? 0) || 0;
  if (missing > 0) {
    const detail = missingWhy(meta);
    rows.push({
      key: 'missing',
      colour: ND_SWATCH,
      word: 'Data missing',
      detail: detail || 'No value from the source',
      count: missing,
      kind: 'missing',
    });
  }
  if (cannot > 0) {
    rows.push({
      key: 'cannot',
      colour: NA_SWATCH,
      word: 'Cannot happen here',
      detail: '',
      count: cannot,
      kind: 'cannot',
    });
  }
  return rows;
}

function formatValue(value, layer) {
  if (value == null || value === '') return '';
  if (typeof value === 'number') {
    if (layer === 'aqi') return String(Math.round(value));
    if (layer === 'heat' || layer === 'cold' || layer === 'heat_index' || layer === 'comfort') return `${Math.round(value * 10) / 10} °C`;
    return String(value);
  }
  if (typeof value !== 'object') return '';
  if (value.mm != null) return `${value.mm} mm`;
  if (value.kmh != null) return `${value.kmh} km/h`;
  return '';
}

function scaleFor(layer, meta) {
  if (layer === 'glof') {
    return {
      words: [GLOF_EXPOSURE.none.word, GLOF_EXPOSURE.watch.word, GLOF_EXPOSURE.priority.word],
      colours: [GLOF_EXPOSURE.none.colour, GLOF_EXPOSURE.watch.colour, GLOF_EXPOSURE.priority.colour],
    };
  }
  if (layer === 'heat_index') return { words: HEAT_INDEX_WORDS, colours: HEAT_INDEX_COLOURS };
  const own = meta?.ownScale && Array.isArray(meta.words) && meta.words.length ? meta.words : null;
  if (own) return { words: own, colours: own.length > LEVEL_COLOURS.length ? AQI_COLOURS : LEVEL_COLOURS };
  return { words: LEVEL_WORDS, colours: LEVEL_COLOURS };
}

function cellOf(uid, levels, meta, layer) {
  const scale = scaleFor(layer, meta);
  if (layer === 'glof') {
    const exposure = meta?.exposure?.[uid];
    const lake = GLOF_EXPOSURE[exposure];
    if (lake) {
      return { rank: lake.rank, colour: lake.colour, word: meta?.contextWords?.[exposure] || lake.word, value: '' };
    }
  }
  const level = levels?.[uid];
  if (typeof level === 'number' && level >= 0) {
    return {
      rank: level,
      colour: scale.colours[level] || UNTESTED,
      word: meta?.labels?.[uid] || scale.words[level] || LEVEL_WORDS[level] || '',
      value: formatValue(meta?.values?.[uid], layer),
    };
  }
  const stateKey = meta?.stateOf?.[String(level)];
  return {
    rank: -1,
    colour: level === -4 ? CANNOT : UNTESTED,
    word: (stateKey && meta?.stateLabel?.[stateKey]) || 'Not assessed',
    value: formatValue(meta?.values?.[uid], layer),
  };
}

function nearColour(temp, lo, hi) {
  const span = hi > lo ? (temp - lo) / (hi - lo) : 0.5;
  return `hsl(${205 - span * 185},70%,${92 - span * 8}%)`;
}

const AREA_HAZARDS = [
  ['heat', 'Heat stress'],
  ['cold', 'Cold stress (UTCI)'],
  ['rain_hz', 'Heavy rain'],
  ['flood', 'River flood'],
  ['flood_pluvial', 'Local-rain flooding (indicative)'],
  ['wind', 'Wind and gusts'],
  ['landslide', 'Landslide'],
  ['glof', 'GLOF'],
  ['drought', 'Drought'],
];
const AREA_INK = ['#1f6b45', '#7a5c0e', '#b45309', '#b91c1c', '#9f1239'];
const AREA_SOFT = [
  'color-mix(in srgb, #2f7a52 12%, #fff)',
  'color-mix(in srgb, #c9a227 28%, #fff)',
  'color-mix(in srgb, #d97706 16%, #fff)',
  'color-mix(in srgb, #b91c1c 14%, #fff)',
  'color-mix(in srgb, #9f1239 16%, #fff)',
];

/** Clear weather / hazard glyphs (stroke icons, 24 viewBox). */
function OvIcon({ name, className = 'ov-ico' }) {
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const glyphs = {
    tmax: (
      <>
        <path {...s} d="M10 14.5V6a2 2 0 1 1 4 0v8.5" />
        <circle {...s} cx="12" cy="17" r="3.2" />
        <path {...s} d="M12 15.2v1.8" />
        <path {...s} d="M17.5 5.5l1.2-1.2M19.5 8H21M17.5 10.5l1.2 1.2" />
      </>
    ),
    tmin: (
      <>
        <path {...s} d="M10 14.5V6a2 2 0 1 1 4 0v8.5" />
        <circle {...s} cx="12" cy="17" r="3.2" />
        <path {...s} d="M12 15.2v1.8" />
        <path {...s} d="M17 6.5h4M19 4.5v4" />
      </>
    ),
    feels: (
      <>
        <path {...s} d="M10 14.5V7a2 2 0 1 1 4 0v7.5" />
        <circle {...s} cx="12" cy="17" r="3.2" />
        <path {...s} d="M9 9.5h2M9 12h2" />
      </>
    ),
    rain: (
      <>
        <path {...s} d="M8 14a4 4 0 0 1 .4-7.2A5 5 0 0 1 17.5 9 3.5 3.5 0 0 1 18 16H8.2" />
        <path {...s} d="M9.5 18.5l-1 2.2M12.5 18.2l-1 2.5M15.5 18.5l-1 2.2" />
      </>
    ),
    wind: (
      <>
        <path {...s} d="M4 9h10a2.5 2.5 0 1 0-2.5-2.5" />
        <path {...s} d="M4 13h13a2.5 2.5 0 1 1-2.5 2.5" />
        <path {...s} d="M4 17h7a2 2 0 1 1-2 2" />
      </>
    ),
    heat: (
      <>
        <circle {...s} cx="12" cy="12" r="3.4" />
        <path {...s} d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M6.1 17.9l1.6-1.6M16.3 7.7l1.6-1.6" />
      </>
    ),
    dew: (
      <>
        <path {...s} d="M12 3.5c-3.2 3.4-5 6.2-5 9a5 5 0 0 0 10 0c0-2.8-1.8-5.6-5-9z" />
      </>
    ),
    cloud: (
      <>
        <path {...s} d="M8 17h9a3.5 3.5 0 0 0 .2-7 5 5 0 0 0-9.6 1.4A3.2 3.2 0 0 0 8 17z" />
      </>
    ),
    uv: (
      <>
        <circle {...s} cx="12" cy="12" r="3.2" />
        <path {...s} d="M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4" />
      </>
    ),
    press: (
      <>
        <path {...s} d="M5 17a7 7 0 0 1 14 0" />
        <path {...s} d="M12 17V9" />
        <path {...s} d="M12 9l3 2.5" />
        <circle {...s} cx="12" cy="17" r="1.2" fill="currentColor" stroke="none" />
      </>
    ),
    gust: (
      <>
        <path {...s} d="M3 9h12a3 3 0 1 0-3-3" />
        <path {...s} d="M3 14h14a2.5 2.5 0 1 1-2.5 2.5" />
        <path {...s} d="M3 19h8" />
      </>
    ),
    cold: (
      <>
        <path {...s} d="M12 3v18M8.2 5.5 12 8l3.8-2.5M8.2 18.5 12 16l3.8 2.5M4.5 12H19.5M6.5 8l3.2 4-3.2 4M17.5 8l-3.2 4 3.2 4" />
      </>
    ),
    rain_hz: (
      <>
        <path {...s} d="M8 13a4 4 0 0 1 .5-7.1A5 5 0 0 1 17.6 8 3.4 3.4 0 0 1 18 15H8.1" />
        <path {...s} d="M9 17.5 7.5 21M12.2 17.2 10.7 21M15.4 17.5 13.9 21" />
      </>
    ),
    flood: (
      <>
        <path {...s} d="M4 16c1.4 0 1.4-2 2.8-2s1.4 2 2.8 2 1.4-2 2.8-2 1.4 2 2.8 2 1.4-2 2.8-2 1.4 2 2.8 2" />
        <path {...s} d="M5 11.5 8.5 6l3 3.5L15 5.5 19 11.5" />
      </>
    ),
    flood_pluvial: (
      <>
        <path {...s} d="M12 3.8c-2.4 2.5-3.7 4.6-3.7 6.8a3.7 3.7 0 0 0 7.4 0c0-2.2-1.3-4.3-3.7-6.8z" />
        <path {...s} d="M4 18c1.3 0 1.3-1.8 2.6-1.8S7.9 18 9.2 18s1.3-1.8 2.6-1.8 1.3 1.8 2.6 1.8 1.3-1.8 2.6-1.8S18.3 18 19.6 18" />
      </>
    ),
    landslide: (
      <>
        <path {...s} d="M3.5 19 9 8.5l3.5 5 3-4.5L20.5 19z" />
        <path {...s} d="M7 8.5 9.2 5l2 2.2" />
      </>
    ),
    glof: (
      <>
        <path {...s} d="M4 18h16" />
        <path {...s} d="M6 18 9.5 9.5l3 4L16 7.5 20 18" />
        <circle {...s} cx="12" cy="5.5" r="1.6" />
      </>
    ),
    drought: (
      <>
        <path {...s} d="M12 4c-2.8 2.8-4.2 5.2-4.2 7.6a4.2 4.2 0 0 0 8.4 0C16.2 9.2 14.8 6.8 12 4z" />
        <path {...s} d="M8 18.5h8M9.2 21h5.6" />
      </>
    ),
    doc: (
      <>
        <path {...s} d="M8 3.5h6l4 4V20.5H8z" />
        <path {...s} d="M14 3.5v4h4M10 11h6M10 14.5h6M10 18h4" />
      </>
    ),
    chart: (
      <>
        <path {...s} d="M4.5 19.5V5.5" />
        <path {...s} d="M4.5 19.5H20" />
        <path {...s} d="M8 16V11M12.5 16V8M17 16v-5.5" />
      </>
    ),
    pin: (
      <>
        <path {...s} d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" />
        <circle {...s} cx="12" cy="11" r="2.2" />
      </>
    ),
  };
  return (
    <span className={className} data-ico={name} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="16" height="16" focusable="false">
        {glyphs[name] || glyphs.heat}
      </svg>
    </span>
  );
}

function OvMetric({ k, label, value }) {
  return (
    <div data-k={k}>
      <OvIcon name={k} />
      <div className="ov-metric-text">
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    </div>
  );
}

function pktHm(iso) {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '';
  return `${new Date(when.getTime() + 5 * 3600e3).toISOString().slice(11, 16)} PKT`;
}

function peopleLine(count) {
  const value = Number(count);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value >= 1e6) return `about ${(value / 1e6).toFixed(1)} million people live here`;
  if (value >= 1e3) return `about ${Math.round(value / 1000).toLocaleString('en')} thousand people live here`;
  return `about ${Math.round(value).toLocaleString('en')} people live here`;
}

function areaSplit(run, day) {
  const dayRow = (run?.days || []).find((row) => row.day === day) || run?.days?.[day];
  const layers = dayRow?.layers || {};
  const assessed = [];
  const missing = [];
  AREA_HAZARDS.forEach(([key, name]) => {
    const cell = layers[key];
    const level = cell?.level;
    if (typeof level === 'number' && level >= 0) {
      assessed.push({ key, name, level, word: cell.word || LEVEL_WORDS[level] || 'Normal' });
      return;
    }
    missing.push({ key, name, word: 'Not assessed' });
  });
  const raised = assessed.filter((row) => row.level > 0).sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  const quiet = assessed.filter((row) => row.level <= 0);
  return { rows: raised.concat(quiet), missing, total: AREA_HAZARDS.length };
}

function AreaHazards({ run, day, tehsil, nearLabel, people, onDismissNear, onClimate }) {
  if (!tehsil) return <p className="ov-area-empty">Choose a place to read the hazards here.</p>;
  if (!run) return <p className="ov-area-empty">Reading the issued levels for {tehsil}…</p>;
  if (run.error || run.ready === false) return <p className="ov-area-empty">{run.why || 'The hazard levels for this place did not answer.'}</p>;
  const { rows, missing, total } = areaSplit(run, day);
  const top = rows.find((row) => row.level > 0);
  const same = top ? rows.filter((row) => row.level === top.level) : [];
  const names = same.map((row) => row.name.toLowerCase());
  let headline = 'Not assessed';
  let aside = 'the issued run holds no level for this place';
  let ink = '#56656e';
  if (top) {
    headline = top.word;
    aside = names.length === 1 ? `set by ${names[0]}` : `set equally by ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    ink = AREA_INK[top.level] || AREA_INK[0];
  } else if (rows.length) {
    headline = missing.length ? 'Normal where assessed' : 'Normal';
    aside = missing.length ? `${missing.length} not assessed` : 'no hazard is above Normal';
    ink = AREA_INK[0];
  }
  const clock = pktHm(run.at);
  const lived = peopleLine(people);
  return (
    <div className="ov-area">
      <header className="ov-areahead">
        <p className="ov-eyebrow">Area screening</p>
        <h2>Area hazards</h2>
        <p className="count"><em>{rows.length}</em> of {total} assessed</p>
      </header>
      {(nearLabel || tehsil) && (
        <div className="ov-areaplace">
          {nearLabel && (
            <div className="ov-near-chip">
              <b>{nearLabel}</b>
              <button type="button" aria-label="Dismiss nearby place" onClick={onDismissNear}>×</button>
            </div>
          )}
          <p className="who">{tehsil} tehsil{lived ? ` · ${lived}` : ''}</p>
        </div>
      )}
      <div className="ov-areasum" style={{ '--ov-ink': ink, '--ov-soft': AREA_SOFT[top?.level ?? 0] || AREA_SOFT[0] }}>
        <p className="sum"><span className="ov-level-pill">{headline}</span><span className="aside">{aside}</span></p>
        <p className="src">{clock ? `Issued ${clock}` : 'Issued run'} · {tehsil} · {day > 0 ? `+${day}d` : 'today'}</p>
      </div>
      <div className="ov-hzlist" role="list" aria-label="Level per hazard">
        {rows.map((row) => (
          <div
            key={row.key}
            role="listitem"
            className="ov-hzitem"
            data-level={row.level}
            style={{
              '--hz-ink': AREA_INK[row.level] || AREA_INK[0],
              '--hz-soft': AREA_SOFT[row.level] || AREA_SOFT[0],
              '--hz-dot': LEVEL_COLOURS[row.level] || UNTESTED,
            }}
          >
            <div className="ov-hzrow">
              <span className="ov-hzico">
                <OvIcon name={row.key} />
              </span>
              <span className="ov-hzname">{row.name}</span>
              <b className="ov-hzlevel">{row.word}</b>
            </div>
            {row.key === 'drought' && <span className="ov-obs" title="Computed from the observed drought index, not a forecast">Observed, not a forecast</span>}
          </div>
        ))}
        {missing.length > 0 && (
          <details className="ov-na-fold">
            <summary>View {missing.length} not assessed</summary>
            <p className="ov-na" role="listitem"><b>Not assessed</b> {missing.map((row) => row.name).join(' · ')}</p>
          </details>
        )}
      </div>
      <button type="button" className="ov-climate" onClick={onClimate}>
        <OvIcon name="chart" className="ov-ico ov-cta-ico" />
        Long-term climate
      </button>
    </div>
  );
}

function NearList({ near, place, open, onToggle, onChoose }) {
  const rows = (near?.places || [])
    .filter((row) => Number.isFinite(+row.tempC) && !(row.km != null && row.km < 0.5))
    .slice()
    .sort((a, b) => (a.km == null ? 1e9 : a.km) - (b.km == null ? 1e9 : b.km));
  const temps = rows.map((row) => +row.tempC);
  const lo = temps.length ? Math.min(...temps) : null;
  const hi = temps.length ? Math.max(...temps) : null;
  const spread = lo == null ? '' : `${lo.toFixed(1)}–${hi.toFixed(1)} °C`;
  return (
    <section className={`ov-near${open ? ' all' : ''}`} aria-label="Temperature now nearby">
      <h3>Temperature now nearby</h3>
      {rows.length > 0 && <span className="sub">{rows.length} places within {near.radiusKm || 12} km · spread {spread}</span>}
      {!rows.length && <p className="empty">{near?.why || (place ? 'No named place found around this point.' : 'Choose a place.')}</p>}
      {rows.map((row, index) => {
        const temp = +row.tempC;
        const pos = hi > lo ? Math.round(((temp - lo) / (hi - lo)) * 100) : 50;
        return (
          <button key={`${row.uid || row.name}-${row.lat}`} type="button" className={index >= 9 ? 'row more' : 'row'} title={[row.name, row.kind, row.elevM != null ? `${Math.round(row.elevM)} m` : ''].filter(Boolean).join(' · ')} onClick={() => onChoose({ lat: row.lat, lon: row.lon, name: row.name })}>
            <span className="n">{row.name}</span>
            <span className="km">{row.km == null ? '' : `${Number(row.km).toFixed(1)} km`}</span>
            <span className="bar"><i style={{ left: `calc(${pos}% - 5px)`, background: nearColour(temp, lo, hi) }} /></span>
            <span className="t">{temp.toFixed(1)}°</span>
          </button>
        );
      })}
      {rows.length > 9 && <button type="button" className="allbtn" onClick={onToggle}>{open ? 'Show fewer' : `Show all ${rows.length} places`}</button>}
    </section>
  );
}

function SideScroll({ children }) {
  const scroller = useRef(null);
  const rail = useRef(null);
  const knob = useRef(null);

  useEffect(() => {
    const el = scroller.current;
    const railEl = rail.current;
    const knobEl = knob.current;
    if (!el || !railEl || !knobEl) return undefined;
    const place = () => {
      const track = el.clientHeight - 20;
      const range = el.scrollHeight - el.clientHeight;
      const show = range > 2 && track > 48;
      railEl.hidden = !show;
      if (!show) return;
      const height = Math.max(48, Math.round((el.clientHeight / el.scrollHeight) * track));
      const travel = Math.max(1, track - height);
      knobEl.style.height = `${height}px`;
      knobEl.style.transform = `translateY(${Math.round((el.scrollTop / range) * travel)}px)`;
    };
    place();
    el.addEventListener('scroll', place, { passive: true });
    const ro = new ResizeObserver(place);
    ro.observe(el);
    const mo = new MutationObserver(place);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      el.removeEventListener('scroll', place);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  const dragKnob = (event) => {
    const el = scroller.current;
    if (!el || event.button !== 0) return;
    event.preventDefault();
    const startY = event.clientY;
    const startTop = el.scrollTop;
    const track = el.clientHeight - 20;
    const height = Math.max(48, (el.clientHeight / el.scrollHeight) * track);
    const travel = Math.max(1, track - height);
    const range = el.scrollHeight - el.clientHeight;
    const move = (ev) => {
      el.scrollTop = startTop + ((ev.clientY - startY) / travel) * range;
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  return (
    <div className="ov-side-scroll">
      <div className="ov-side-body" ref={scroller}>{children}</div>
      <div className="ov-scroll" ref={rail} hidden aria-hidden="true">
        <i ref={knob} onPointerDown={dragKnob} />
      </div>
    </div>
  );
}

export default function Overview({ embedded = false }) {
  const [place, setPlace] = useState(readHashPlace);
  const [bundle, setBundle] = useState(() => {
    const current = readHashPlace();
    return current ? peekPointBundle(current.lat, current.lon, PLACE_PARTS) : null;
  });
  const [bundleKey, setBundleKey] = useState(() => {
    const current = readHashPlace();
    return current ? `${Number(current.lat).toFixed(5)},${Number(current.lon).toFixed(5)}` : '';
  });
  const [layer, setLayer] = useState('heat');
  const [layerLabel, setLayerLabel] = useState('Heat stress');
  const [day, setDay] = useState(0);
  const [levels, setLevels] = useState({});
  const [levelMeta, setLevelMeta] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [basemap, setBasemap] = useState('streets');
  const [terrain, setTerrain] = useState(false);
  const [focus, setFocus] = useState('pk');
  const [reveal, setReveal] = useState(false);
  const [focusKey, setFocusKey] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const reportFrame = useRef(null);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [clock, setClock] = useState(pktClock);
  const [more, setMore] = useState(false);
  const [made, setMade] = useState(null);
  const [note, setNote] = useState('');
  const [areaRun, setAreaRun] = useState(null);
  const [people, setPeople] = useState(null);
  const [nearHidden, setNearHidden] = useState(false);
  const [basis, setBasis] = useState('current');
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyInfo, setKeyInfo] = useState(false);
  const [tableOn, setTableOn] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [tablePage, setTablePage] = useState(0);
  const [legends, setLegends] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [corners, setCorners] = useState([]);
  const [drawWarn, setDrawWarn] = useState(false);
  const [siteDone, setSiteDone] = useState(false);
  const [sitePanel, setSitePanel] = useState(false);
  const [siteScore, setSiteScore] = useState(null);
  const [siteBusy, setSiteBusy] = useState(false);
  const [near, setNear] = useState(null);
  const [nearAll, setNearAll] = useState(false);
  const [overlays, setOverlays] = useState({ outlook: false, quakes: false, urban: false, temp: false, lakes: false, heatindex: false, rivers: true });
  const [outlook, setOutlook] = useState(null);
  const [units, setUnits] = useState([]);
  const featuresRef = useRef([]);
  const cornersRef = useRef([]);
  const siteSeq = useRef(0);
  const drawingRef = useRef(false);
  cornersRef.current = corners;
  drawingRef.current = drawing;

  useEffect(() => {
    const timer = setInterval(() => setClock(pktClock()), 30000);
    const onChrome = (event) => {
      const id = event.detail?.open;
      if (id !== 'site') {
        if (drawingRef.current) {
          siteSeq.current += 1;
          cornersRef.current = [];
          setDrawing(false);
          setCorners([]);
          setDrawWarn(false);
          setSiteDone(false);
          setSitePanel(false);
          setSiteScore(null);
          setSiteBusy(false);
        } else {
          setSitePanel(false);
        }
      }
      if (!embedded && id !== 'reports') setReportsOpen(false);
    };
    window.addEventListener('agn-chrome', onChrome);
    if (embedded) {
      return () => {
        clearInterval(timer);
        window.removeEventListener('agn-chrome', onChrome);
      };
    }
    const open = () => {
      openChrome('reports');
      setReportsOpen(true);
    };
    window.addEventListener('agn-reports', open);
    return () => {
      clearInterval(timer);
      window.removeEventListener('agn-reports', open);
      window.removeEventListener('agn-chrome', onChrome);
    };
  }, [embedded]);

  useEffect(() => {
    const sync = (event) => {
      const next = readHashPlace();
      setPlace((prev) => (samePlace(prev, next) ? prev : next));
      if (event?.detail?.reveal && next) {
        setReveal(true);
        setFocus('teh');
        setFocusKey((n) => n + 1);
      }
    };
    window.addEventListener('agn-place', sync);
    window.addEventListener('hashchange', sync);
    if (!readHashPlace()) {
      ensureCurrentPlace(`${window.location.pathname}${window.location.search}`);
    }
    return () => {
      window.removeEventListener('agn-place', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  useEffect(() => {
    if (!keyOpen) return undefined;
    const close = (event) => {
      if (event.target.closest('.ov-v3leg, .ov-details')) return;
      setKeyOpen(false);
      setKeyInfo(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [keyOpen]);

  useEffect(() => {
    let cancel = false;
    getJson('/n3/tehsils.json').then((geo) => {
      if (cancel) return;
      featuresRef.current = geo?.features || [];
      setUnits(tehsilRows(featuresRef.current));
    }).catch(() => { if (!cancel) setUnits([]); });
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    if (!place) {
      setBundle(null);
      setBundleKey('');
      return undefined;
    }
    const key = `${Number(place.lat).toFixed(5)},${Number(place.lon).toFixed(5)}`;
    const cached = peekPointBundle(place.lat, place.lon, PLACE_PARTS);
    setBundleKey(key);
    if (cached) setBundle(cached);
    else setBundle(null);
    let cancel = false;
    getPointBundle({
      lat: place.lat,
      lon: place.lon,
      name: place.name || '',
      parts: PLACE_PARTS,
    }).then((body) => {
      if (!cancel) {
        setBundleKey(key);
        setBundle(body?.error || body?.__status ? { error: true, why: body?.why } : body);
      }
    }).catch(() => { if (!cancel) { setBundleKey(key); setBundle({ error: true }); } });
    return () => { cancel = true; };
  }, [place?.lat, place?.lon, place?.name]);

  useEffect(() => {
    if (!place) { setNear(null); return undefined; }
    const url = `/api/pointstate/sweep-near?lat=${Number(place.lat).toFixed(5)}&lon=${Number(place.lon).toFixed(5)}&km=12&limit=36`;
    const cached = peekCached(url);
    if (cached) setNear(cached && !cached.__status ? cached : { places: [], why: 'no tehsil-sweep temperature within 12 km' });
    else setNearAll(false);
    let cancel = false;
    cachedGet(url).then((body) => {
      if (!cancel) setNear(body && !body.__status ? body : { places: [], why: 'no tehsil-sweep temperature within 12 km' });
    }).catch(() => { if (!cancel) setNear({ places: [], why: 'no tehsil-sweep temperature within 12 km' }); });
    return () => { cancel = true; };
  }, [place?.lat, place?.lon]);

  useEffect(() => {
    let cancel = false;
    const cached = readLevelsCache(layer, day);
    if (cached) {
      setLevels(cached.levels);
      setLevelMeta(cached.meta);
    } else {
      setLevelMeta((prev) => (prev && !prev.error ? { ...prev, loading: true } : { loading: true, counts: [] }));
    }
    fetchLevels(layer, day).then((next) => {
      if (cancel) return;
      setLevels(next.levels);
      setLevelMeta(next.meta);
    }).catch(() => {
      if (!cancel) {
        setLevels({});
        setLevelMeta({ error: true, counts: [], why: 'This layer did not load' });
      }
    });
    const idle = typeof requestIdleCallback === 'function'
      ? requestIdleCallback(() => {
        PREFETCH_LAYERS.forEach((id) => { if (id !== layer) fetchLevels(id, day).catch(() => {}); });
        [day - 1, day + 1].filter((value) => value >= 0 && value <= 3).forEach((value) => {
          fetchLevels(layer, value).catch(() => {});
        });
      }, { timeout: 2500 })
      : setTimeout(() => {
        PREFETCH_LAYERS.forEach((id) => { if (id !== layer) fetchLevels(id, day).catch(() => {}); });
      }, 800);
    return () => {
      cancel = true;
      if (typeof cancelIdleCallback === 'function' && typeof idle === 'number') cancelIdleCallback(idle);
      else clearTimeout(idle);
    };
  }, [layer, day]);

  useEffect(() => {
    getJson('/api/alerts').then((body) => setAlerts(Array.isArray(body?.rows) ? body.rows : [])).catch(() => setAlerts([]));
    getJson('/api/registry/levels').then((body) => { if (body?.ok) setLegends(body); }).catch(() => {});
  }, []);

  const layerName = layerLabel;
  const counts = levelMeta?.counts || [];
  const scale = useMemo(() => scaleFor(layer, levelMeta), [layer, levelMeta]);
  const legendRows = useMemo(
    () => keyRows(layer, scale, levelMeta, legends),
    [layer, scale, levelMeta, legends],
  );

  function startDraw() {
    siteSeq.current += 1;
    cornersRef.current = [];
    openChrome('site');
    setDrawing(true);
    setCorners([]);
    setDrawWarn(false);
    setSiteDone(false);
    setSitePanel(true);
    setSiteScore(null);
    setSiteBusy(false);
  }

  function cancelDraw() {
    siteSeq.current += 1;
    cornersRef.current = [];
    setDrawing(false);
    setCorners([]);
    setDrawWarn(false);
    setSiteDone(false);
    setSitePanel(false);
    setSiteScore(null);
    setSiteBusy(false);
  }

  function hideSitePanel() {
    if (drawingRef.current) cancelDraw();
    else setSitePanel(false);
  }

  function showSitePanel() {
    openChrome('site');
    setSitePanel(true);
  }

  function undoCorner() {
    const next = cornersRef.current.slice(0, -1);
    cornersRef.current = next;
    setCorners(next);
    setDrawWarn(false);
  }

  function addCorner(point) {
    const next = [...cornersRef.current, point].slice(0, 24);
    cornersRef.current = next;
    setCorners(next);
    setDrawWarn(false);
  }

  function runSiteScore(ring) {
    const seq = siteSeq.current + 1;
    siteSeq.current = seq;
    setSiteBusy(true);
    setSiteScore(null);
    scoreSite(ring, (partial) => {
      if (siteSeq.current !== seq) return;
      setSiteScore(partial);
    }).then((result) => {
      if (siteSeq.current !== seq) return;
      setSiteScore(result);
      setSiteBusy(false);
    }).catch(() => {
      if (siteSeq.current !== seq) return;
      setSiteScore({ ok: false, why: 'the site could not be scored', samples: [], rows: [] });
      setSiteBusy(false);
    });
  }

  function finishDraw() {
    if (cornersRef.current.length < 3) {
      setDrawWarn(true);
      return;
    }
    const ring = cornersRef.current.slice();
    openChrome('site');
    setDrawing(false);
    setDrawWarn(false);
    setSiteDone(true);
    setSitePanel(true);
    runSiteScore(ring);
  }
  const selected = useMemo(() => {
    if (!place) return null;
    const hit = tehsilAt(featuresRef.current, place.lat, place.lon);
    if (place.uid) {
      const unit = units.find((row) => row.uid === place.uid);
      if (unit) return { ...unit, lat: place.lat, lon: place.lon };
    }
    return hit;
  }, [place, units]);
  const here = selected ? cellOf(selected.uid, levels, levelMeta, layer) : null;

  const now = bundle?.now;
  const info = bundle?.place;
  const coordLine = (() => {
    const lat = Number(place?.lat);
    const lon = Number(place?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
    return `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(5)}° ${lon >= 0 ? 'E' : 'W'}`;
  })();
  const nearLabel = useMemo(() => {
    const near = info?.near;
    if (near?.name) return `Near ${near.name}${near.km != null ? ` (${Number(near.km).toFixed(1)} km)` : ''}`;
    const name = place?.name || '';
    return /^near /i.test(name) ? name : '';
  }, [info?.near, place?.name]);
  useEffect(() => {
    setNearHidden(false);
  }, [place?.lat, place?.lon]);
  useEffect(() => {
    const uid = selected?.uid;
    if (!uid) { setAreaRun(null); return undefined; }
    const url = `/api/levels/unit?unit=${encodeURIComponent(uid)}`;
    const cached = peekCached(url);
    if (cached) setAreaRun(cached && cached.days ? cached : { error: true, why: cached?.why });
    else setAreaRun(null);
    let live = true;
    cachedGet(url)
      .then((body) => { if (live) setAreaRun(body && body.days ? body : { error: true, why: body?.why }); })
      .catch(() => { if (live) setAreaRun({ error: true }); });
    return () => { live = false; };
  }, [selected?.uid]);
  useEffect(() => {
    const name = info?.tehsil || info?.near?.name;
    if (!name) { setPeople(null); return undefined; }
    const url = `/api/geo/search?q=${encodeURIComponent(name)}&limit=4`;
    let live = true;
    cachedGet(url).then((body) => {
      if (!live) return;
      const rows = body?.results || [];
      const hit = rows.find((row) => row.population && (!info?.unitId || row.unitId === info.unitId))
        || rows.find((row) => row.population);
      setPeople(hit?.population || null);
    }).catch(() => { if (live) setPeople(null); });
    return () => { live = false; };
  }, [info?.tehsil, info?.near?.name, info?.unitId]);
  const groups = useMemo(() => hourGroups(bundle?.hours || []), [bundle]);
  const bars = bundle?.parts?.hazardCount?.v?.days?.[0]?.bars || [];
  const rainDays = bundle?.parts?.rainChance?.v?.days || [];
  const day0 = bundle?.days?.[0];
  const skyWord = (code) => {
    const value = Number(code);
    if (!Number.isFinite(value)) return 'Current';
    if (value === 0) return 'Clear';
    if (value === 1) return 'Mainly clear';
    if (value === 2) return 'Partly cloudy';
    if (value === 3) return 'Cloudy';
    if (value <= 48) return 'Fog';
    if (value <= 57) return 'Drizzle';
    if (value <= 67) return 'Rain';
    if (value <= 77) return 'Snow';
    if (value <= 82) return 'Showers';
    return 'Thunderstorm';
  };
  const card = useMemo(() => {
    if (!place) return null;
    const placeKey = `${Number(place.lat).toFixed(5)},${Number(place.lon).toFixed(5)}`;
    const matched = bundleKey === placeKey;
    const named = (matched && info?.tehsil) || (!/^near\b/i.test(String(place.name || '')) ? place.name : '') || (matched && info?.district) || 'Selected place';
    const where = matched ? [info?.district, info?.province].filter((part) => part && part !== named).join(' · ') : '';
    if (!matched || !bundle || !now || bundle.error) {
      return { title: named, where, loading: !matched || !bundle || (!bundle.error && !now), temp: null };
    }
    return {
      title: named,
      where,
      loading: false,
      temp: Math.round(now.tempC),
      feels: Number.isFinite(+now.feelsC) ? Math.round(now.feelsC) : null,
      rh: Number.isFinite(+now.rh) ? Math.round(now.rh) : null,
      wind: Number.isFinite(+now.windKmh) ? Math.round(now.windKmh) : null,
      rain: Number.isFinite(+now.rainMm) ? now.rainMm : null,
      cloud: Number.isFinite(+now.cloudPct) ? Math.round(now.cloudPct) : null,
      sky: skyWord(now.weatherCode),
    };
  }, [place?.lat, place?.lon, place?.name, bundle, bundleKey, now?.tempC, now?.feelsC, now?.rh, now?.windKmh, now?.rainMm, now?.cloudPct, now?.weatherCode, info?.name, info?.tehsil, info?.district, info?.province]);

  function choose(next) {
    setPlace(next);
    setReportOpen(false);
    remember(next);
  }

  function openTab(id) {
    if (id === 'overview') return;
    go(`/analyst?tab=${id}${window.location.hash || ''}`);
  }

  function share() {
    const hash = place ? `#agnplace=${place.lat.toFixed(5)},${place.lon.toFixed(5)},${encodeURIComponent(place.name || '')}` : '';
    const link = `${window.location.origin}${window.location.pathname}${window.location.search}${hash}`;
    navigator.clipboard?.writeText(link).then(() => setNote('Link copied')).catch(() => setNote(link));
  }

  function copyBrief() {
    if (!now) return;
    const text = `${info?.name || place.name}: ${now.tempC}°C, feels like ${now.feelsC}°C, humidity ${now.rh}%, wind ${now.windKmh} km/h, rain ${now.rainMm} mm. Heat ${now.heatLevel || '—'}, shade UTCI ${now.utciShadeC ?? '—'}°C.`;
    navigator.clipboard?.writeText(text).then(() => setNote('Comfort brief copied')).catch(() => setNote(text));
  }

  function fullReport() {
    if (!place) return;
    setMade({ busy: true });
    setReportOpen(true);
    generateReport({ lat: place.lat, lon: place.lon, kind: 'site_assessment', section: 'start', edition: 'main', name: place.name }).then(setMade).catch(() => setMade({ ok: false }));
  }

  function toggleOverlay(id) {
    setOverlays((cur) => {
      const turningOn = !cur[id];
      if (turningOn && id === 'outlook') openChrome('outlook');
      const next = { ...cur, [id]: turningOn };
      if (turningOn && id === 'temp') next.heatindex = false;
      if (turningOn && id === 'heatindex') next.temp = false;
      return next;
    });
  }

  useEffect(() => { if (!overlays.outlook) setOutlook(null); }, [overlays.outlook]);

  function pickLayer(id, name) {
    setLayer(id);
    setLayerLabel(name);
    setOverlays((cur) => ({ ...cur, heatindex: false }));
  }

  const whenLabel = basis === 'current' ? 'current hour' : day === 0 ? "today's peak" : `day +${day}`;
  useEffect(() => { setTablePage(0); }, [layer, basis, day]);
  const tableRows = useMemo(() => {
    const base = units.length ? units : Object.keys(levels).map((uid) => {
      const [province, district, tehsil] = uid.split('|');
      return { uid, tehsil: tehsil || uid, district: district || '', province: province || '' };
    });
    const rows = base.map((unit) => {
      const cell = cellOf(unit.uid, levels, levelMeta, layer);
      const band = cell.rank >= 0 ? bandOf(legends, layer, cell.rank) : '';
      const level = band && cell.word && !String(cell.word).includes(band) ? `${cell.word} · ${band}` : cell.word;
      return { ...unit, ...cell, level };
    });
    rows.sort((a, b) => b.rank - a.rank || String(a.tehsil).localeCompare(String(b.tehsil)));
    return rows;
  }, [units, levels, legends, layer, levelMeta]);
  const tableHead = useMemo(() => {
    const chips = scale.words.map((word, index) => {
      const count = layer === 'glof'
        ? tableRows.filter((row) => row.rank === index + 1).length
        : (counts[index] || tableRows.filter((row) => row.rank === index).length);
      return { word, count, colour: scale.colours[index] };
    }).reverse();
    return {
      title: layerName,
      sub: `${whenLabel} · ${tableRows.length} tehsils, the same features as the map`,
      chips,
    };
  }, [counts, layer, layerName, scale.colours, scale.words, tableRows, whenLabel]);
  const tablePages = Math.max(1, Math.ceil(tableRows.length / TABLE_PAGE));
  const tableIndex = Math.min(tablePage, tablePages - 1);
  const tableFrom = tableRows.length ? tableIndex * TABLE_PAGE + 1 : 0;
  const tableTo = Math.min(tableRows.length, (tableIndex + 1) * TABLE_PAGE);
  const tablePageRows = tableRows.slice(tableIndex * TABLE_PAGE, tableTo);
  const tableMarks = pageMarks(tableIndex, tablePages);

  return (
    <div className="ov">
      {!embedded && <header className="ov-bar">
        <img src="/agn-logo.png" alt="AI Geo Navigators" width="86" height="40" />
        <div className="ov-brand">
          <strong>NIGRAAN 1.0</strong>
          <span>National Integrated Geo-Risk, Alert &amp; Atmospheric Network</span>
        </div>
        <nav className="ov-switch" aria-label="Switch page">
          <button type="button" onClick={() => go('/')}>Start</button>
          <button type="button" className="on">Analyst view</button>
          <CustomizeLink to={`/customize${window.location.hash || ''}`}>Customize</CustomizeLink>
        </nav>
        <span className="ov-fresh"><i />Updated {clock}</span>
        <button type="button" className="ov-reports" onClick={() => { openChrome('reports'); setReportsOpen(true); }}>My reports</button>
        <span className="ov-avatar" aria-hidden="true">AJ</span>
      </header>}

      {!embedded && <nav className="ov-tabs" aria-label="NIGRAAN client decision journey">
        {TABS.map(([id, label], index) => (
          <button key={id} type="button" className={id === 'overview' ? 'on' : ''} onClick={() => openTab(id)}>
            <b>{String(index + 1).padStart(2, '0')}</b> {label}
          </button>
        ))}
      </nav>}

      <div className="ov-story">
        {now && (
          <div className="ov-story-cond" aria-label="Current conditions">
            <span className="t"><OvIcon name="heat" className="ov-ico ov-story-ico" />{Math.round(now.tempC)}<small>°C</small></span>
            <span className="ov-chip" data-k="rh"><OvIcon name="dew" className="ov-ico ov-chip-ico" />Humidity <b>{Math.round(now.rh)}%</b></span>
            <span className="ov-chip" data-k="wind"><OvIcon name="wind" className="ov-ico ov-chip-ico" />Wind <b>{Math.round(now.windKmh)} km/h</b></span>
            <span className={`hz${here?.word ? ` hz-${String(here.word).toLowerCase().replace(/[^a-z]/g, '')}` : ''}`}><OvIcon name="pin" className="ov-ico ov-chip-ico ov-chip-ico-light" />{selected?.tehsil || info?.tehsil || info?.name || place?.name}: {here?.word || '—'}{here?.value ? ` · ${here.value}` : ''}</span>
          </div>
        )}
        <div className="ov-story-tools">
          <ChoiceMenu
            id="map-basemap"
            label="Map background"
            value={basemap}
            options={[['streets', 'Streets'], ['satellite', 'Satellite']]}
            onPick={setBasemap}
          />
          <button
            type="button"
            className={`ov-rivers-btn${overlays.rivers ? ' on' : ''}`}
            aria-pressed={!!overlays.rivers}
            title={overlays.rivers ? 'Hide river animation' : 'Show river animation'}
            onClick={() => toggleOverlay('rivers')}
          >
            Rivers
          </button>
          <MoreLayers on={overlays} onToggle={toggleOverlay} />
          <ChoiceMenu
            id="map-view"
            label="Map view"
            value={focus === 'teh' ? 'teh' : 'pk'}
            options={[['pk', 'Pakistan'], ['teh', 'Tehsil']]}
            onPick={(id) => { setFocus(id); setFocusKey((n) => n + 1); }}
          />
          <div className="ov-alerts">
            <button type="button" className={alerts.length ? 'has' : ''} onClick={() => setAlertsOpen((open) => !open)}>
              <i />Alerts{alerts.length ? <em>{alerts.length}</em> : null}
            </button>
            {alertsOpen && (
              <div className="ov-alertlist">
                {alerts.length === 0 && <p>No alerts in this run.</p>}
                {alerts.map((row) => <p key={`${row.name}-${row.alert}`}><b>{row.name}</b> {row.alert}</p>)}
              </div>
            )}
          </div>
        </div>
        {note && <em className="ov-story-note">{note}</em>}
      </div>

      <div className="ov-stage">
        <aside className={`ov-side left${leftOpen ? '' : ' shut'}`}>
          <button type="button" className="ov-side-tab" aria-expanded={leftOpen} aria-label={leftOpen ? 'Hide the place panel' : 'Show the place panel'} onClick={() => setLeftOpen((open) => !open)}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d={leftOpen ? 'M9 2.5 4.5 7 9 11.5' : 'M5 2.5 9.5 7 5 11.5'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <SideScroll>
            {!place && <p className="ov-empty">Choose a place. Search, use your location, or click the map.</p>}
            {place && !bundle && <p className="ov-empty">Reading {place.name}…</p>}
            {bundle?.error && <p className="ov-empty">This place did not return a forecast.</p>}
            {now && (
              <div className="ov-card">
                <header className="ov-placehead">
                  <p className="ov-eyebrow">Place reading</p>
                  <h2><OvIcon name="pin" className="ov-ico ov-place-ico" />{info?.name || place.name}</h2>
                  {coordLine && <p className="ov-placecoord">{coordLine}</p>}
                  <p className="ov-placearea">{[info?.tehsil ? `${info.tehsil} tehsil` : null, 'meteorology'].filter(Boolean).join(' · ')}</p>
                </header>
                <h3>Today at {info?.name || place.name}</h3>
                <dl className="ov-today">
                  <OvMetric k="tmax" label="Temp max" value={day0?.tmaxC == null ? '—' : `${Math.round(day0.tmaxC)} °C`} />
                  <OvMetric k="tmin" label="Temp min" value={day0?.tminC == null ? '—' : `${Math.round(day0.tminC)} °C`} />
                  <OvMetric k="feels" label="Feels like" value={day0?.feelsMaxC == null ? (Number.isFinite(+now.feelsC) ? `${now.feelsC} °C` : '—') : `${Math.round(day0.feelsMaxC)} °C`} />
                  <OvMetric k="rain" label="Rain today" value={day0?.rainMm == null ? '—' : `${day0.rainMm} mm`} />
                  <OvMetric k="wind" label="Wind max" value={day0?.windMaxKmh == null ? '—' : `${Math.round(day0.windMaxKmh)} km/h`} />
                  <OvMetric k="heat" label="Heat stress" value={now.heatLevel || '—'} />
                </dl>
                <HeatLine uid={selected?.uid} day={day} on={overlays.heatindex} />
                <button type="button" className="ov-more" onClick={() => setMore((open) => !open)}>{more ? 'Fewer readings' : 'More readings'}</button>
                {more && (
                  <dl className="ov-today ov-moregrid">
                    <OvMetric k="dew" label="Dew point" value={now.dewC == null ? '—' : `${now.dewC}°C`} />
                    <OvMetric k="cloud" label="Cloud" value={now.cloudPct == null ? '—' : `${now.cloudPct}%`} />
                    <OvMetric k="uv" label="UV" value={now.uv ?? '—'} />
                    <OvMetric k="press" label="Pressure" value={now.pressureHpa == null ? '—' : `${now.pressureHpa} hPa`} />
                    <OvMetric k="gust" label="Gust" value={now.gustKmh == null ? '—' : `${now.gustKmh} km/h`} />
                    <OvMetric k="heat" label="Heat" value={now.heatLevel || '—'} />
                  </dl>
                )}
                {rainDays.length > 0 && (
                  <div className="ov-rainbox">
                    <h3><OvIcon name="rain" className="ov-ico ov-sec-ico" />Rain chance</h3>
                    <ul className="ov-bars">
                      {rainDays.slice(0, 4).map((row) => (
                        <li key={row.date}>
                          <span>{row.lead === 0 ? 'Today' : row.date}</span>
                          <b>{row.p?.['1'] == null ? '—' : `${row.p['1']}%`}</b>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <NearList near={near} place={place} open={nearAll} onToggle={() => setNearAll((value) => !value)} onChoose={choose} />
          </SideScroll>
          {now && (
            <div className="ov-side-foot">
              <button type="button" className="ov-report" onClick={fullReport}>
                <OvIcon name="doc" className="ov-ico ov-cta-ico" />
                Full report
              </button>
            </div>
          )}
        </aside>

        <div className={`ov-mapcol${outlook?.ready ? ' agn-ol-active' : ''}`}>
          <div className="ov-maptools">
            <button type="button" className={terrain ? 'on' : ''} onClick={() => setTerrain((on) => !on)}>Terrain</button>
            <button
              type="button"
              className={drawing || (siteDone && sitePanel) ? 'on' : ''}
              aria-pressed={drawing || (siteDone && sitePanel)}
              title="Draw your site on the map"
              onClick={() => {
                if (drawing) cancelDraw();
                else if (siteDone && !sitePanel) showSitePanel();
                else if (siteDone && sitePanel) hideSitePanel();
                else startDraw();
              }}
            >
              Draw your site
            </button>
          </div>
          <AnalystMap
            levels={levels}
            exposure={layer === 'glof' ? levelMeta?.exposure : null}
            palette={scale.colours}
            selectedUid={selected?.uid}
            place={place}
            basemap={basemap}
            terrain={terrain}
            focus={focus}
            focusKey={focusKey}
            popOpen={reveal}
            onEngage={() => {
              setReveal(true);
              setFocus('teh');
              setFocusKey((n) => n + 1);
            }}
            card={card}
            drawing={drawing}
            corners={corners}
            siteSamples={!drawing && siteDone ? (siteScore?.samples || null) : null}
            fitSiteKey={!drawing && siteDone ? corners.map((point) => `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`).join('|') : ''}
            onCorner={addCorner}
            onFinishDraw={finishDraw}
            onForecast={() => go(`/analyst?tab=livedata${window.location.hash || ''}`)}
            onPick={(next) => choose(next)}
            overlays={overlays}
            outlook={outlook}
            day={day}
          />
          {overlays.outlook && <OutlookPanel onData={setOutlook} onClose={() => toggleOverlay('outlook')} />}
          {(drawing || (sitePanel && siteDone && corners.length >= 3)) && (
            <div className={`ov-site${keyOpen ? ' with-key' : ''}`} role="region" aria-label="Your drawn site">
              {drawing ? (
                <>
                  <div className="hd">
                    <b>Draw your site</b>
                    <span>{corners.length} corner{corners.length === 1 ? '' : 's'}</span>
                    <button type="button" className="ov-site-x" aria-label="Close" onClick={cancelDraw}>×</button>
                  </div>
                  <p className="small">
                    Click each corner, then Finish (3+). Wheel still zooms.
                    {drawWarn && <b className="warn"> Need at least 3 corners.</b>}
                  </p>
                  <p className="act">
                    <button type="button" className="pri" onClick={finishDraw}>Finish</button>
                    <button type="button" onClick={undoCorner}>Undo</button>
                    <button type="button" onClick={cancelDraw}>Cancel</button>
                  </p>
                </>
              ) : (
                <>
                  <div className="hd">
                    <b>Your site</b>
                    <span>
                      {[areaLabel(siteScore?.ha), siteBusy
                        ? `scoring ${siteScore?.scored || 0}/${siteScore?.total || '…'}`
                        : (siteScore?.ok ? `${siteScore.scored}/${siteScore.total} pts` : `${corners.length} corners`)].filter(Boolean).join(' · ')}
                    </span>
                    <button type="button" className="ov-site-x" aria-label="Close" onClick={hideSitePanel}>×</button>
                  </div>
                  {siteBusy && !siteScore?.ok && <p className="small">Scoring site points…</p>}
                  {!siteBusy && siteScore && !siteScore.ok && (
                    <p className="small">Could not score: {siteScore.why || 'no answer'}.</p>
                  )}
                  {siteScore?.ok && (
                    <>
                      <p className="small">
                        Peak in next {siteScore.days || 4} days
                        {siteScore.tehsils?.length ? ` · ${siteScore.tehsils.slice(0, 4).join(', ')}${siteScore.tehsils.length > 4 ? '…' : ''}` : ''}
                        {siteBusy ? ' · updating…' : ''}
                      </p>
                      <ul className="ov-site-list">
                        {(siteScore.rows || []).filter((row) => !row.missing).map((row) => (
                          <li key={row.key}>
                            <span className="nm">{row.name}</span>
                            <span className="lv" style={{ background: row.colour }}>{row.word}</span>
                            <span className="meta">{[row.when, row.spread, row.carried ? 'tehsil' : ''].filter(Boolean).join(' · ')}</span>
                          </li>
                        ))}
                      </ul>
                      {(siteScore.rows || []).some((row) => row.missing) && (
                        <p className="muted">
                          Not scored: {(siteScore.rows || []).filter((row) => row.missing).map((row) => row.name).join(', ')}
                        </p>
                      )}
                    </>
                  )}
                  <p className="act">
                    <button type="button" onClick={startDraw}>Redraw</button>
                    <button type="button" onClick={cancelDraw}>Remove</button>
                    <button type="button" onClick={hideSitePanel}>Close</button>
                  </p>
                </>
              )}
            </div>
          )}
          {keyOpen && (
            <div className="ov-v3leg" role="dialog" aria-label={`${layerName} legend`}>
              <header className="ov-leg-head">
                <div>
                  <p>Map legend</p>
                  <h3>{layerName}</h3>
                </div>
                <div className="ov-leg-tools">
                  <button
                    type="button"
                    className="ov-leg-i"
                    aria-label="About this legend"
                    aria-expanded={keyInfo}
                    onClick={() => setKeyInfo((on) => !on)}
                  >
                    i
                  </button>
                  <button type="button" className="ov-leg-tg" title="Hide the legend" onClick={() => { setKeyOpen(false); setKeyInfo(false); }}>Hide</button>
                </div>
              </header>
              {levelMeta?.loading && <p className="ov-leg-wait">Loading the tehsils…</p>}
              {!levelMeta?.loading && (
                <ul className="ov-leg-list">
                  {legendRows.map((row) => (
                    <li key={row.key} className={row.kind === 'missing' ? 'nd' : row.kind === 'cannot' ? 'na' : ''}>
                      <i style={{ background: row.colour }} aria-hidden="true" />
                      <div>
                        <b>{row.word}</b>
                        {row.detail ? <small>{row.detail}</small> : null}
                      </div>
                      <span>{row.count}</span>
                    </li>
                  ))}
                </ul>
              )}
              {keyInfo && (
                <div className="ov-leg-meaning">
                  <i style={{ background: scale.colours[0] || LEVEL_COLOURS[0] }} />Green: checked, normal ·{' '}
                  <i style={{ background: ND_SWATCH }} />Purple: data missing ·{' '}
                  <i style={{ background: UNTESTED }} />Grey dashed: not tested ·{' '}
                  <i style={{ background: NA_SWATCH }} />Light grey hatch: cannot happen here
                </div>
              )}
            </div>
          )}
          <div className="ov-foot">
            <div className="ov-layerpick">
              <DailyMenu layer={layer} label={layerLabel} onPick={pickLayer} />
            </div>
            <ChoiceMenu
              id="map-when"
              label="Forecast day"
              value={basis === 'current' && day === 0 ? 'current' : day === 0 ? 'peak' : `d${day}`}
              options={[['current', 'Current'], ['peak', 'Today’s peak'], ['d1', '+1d'], ['d2', '+2d'], ['d3', '+3d']]}
              onPick={(id) => {
                if (id === 'current') { setBasis('current'); setDay(0); return; }
                setBasis('peak');
                setDay(id === 'peak' ? 0 : Number(id.slice(1)));
              }}
            />
            <CheckMenu
              id="map-details"
              className="ov-details"
              label="Legend"
              items={[
                {
                  id: 'key',
                  name: 'Legend',
                  on: keyOpen,
                  onToggle: () => {
                    setKeyOpen((open) => !open);
                    if (keyOpen) setKeyInfo(false);
                  },
                },
                { id: 'table', name: 'Table', on: tableOn, closeMenu: false, onToggle: () => setTableOn((on) => !on) },
              ]}
            />
          </div>
        </div>

        <aside className={`ov-side right${rightOpen ? '' : ' shut'}`} aria-label="Area hazards">
          <button type="button" className="ov-side-tab" aria-expanded={rightOpen} aria-label={rightOpen ? 'Hide the area panel' : 'Show the area panel'} onClick={() => setRightOpen((open) => !open)}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d={rightOpen ? 'M5 2.5 9.5 7 5 11.5' : 'M9 2.5 4.5 7 9 11.5'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <div className="ov-side-body">
            <AreaHazards
              run={areaRun}
              day={day}
              tehsil={selected?.tehsil || info?.tehsil}
              nearLabel={nearHidden ? '' : nearLabel}
              people={people}
              onDismissNear={() => setNearHidden(true)}
              onClimate={() => go(`/analyst?tab=livedata&sec=fccm${window.location.hash || ''}`)}
            />
          </div>
        </aside>
      </div>

      {tableOn && (
        <section className="ov-table" aria-label="Map data table">
          <header>
            <div>
              <h3>{tableHead.title}</h3>
              <p>{tableHead.sub}</p>
            </div>
            <ul className="ov-tally">
              {tableHead.chips.map((chip) => (
                <li key={chip.word}>
                  <i style={{ background: chip.colour }} />
                  <span>{chip.word}</span>
                  <b>{chip.count}</b>
                </li>
              ))}
            </ul>
          </header>
          <div className="ov-tscroll">
            <table>
              <thead><tr><th>Tehsil</th><th>District</th><th>Province</th><th>Level</th><th className="num">Value</th></tr></thead>
              <tbody>
                {tablePageRows.map((row) => (
                  <tr key={row.uid} className={row.uid === selected?.uid ? 'on' : ''} onClick={() => { if (row.lat != null && row.lon != null) choose({ lat: row.lat, lon: row.lon, name: row.tehsil }); }}>
                    <td className="name">{row.tehsil}</td>
                    <td>{row.district}</td>
                    <td>{row.province}</td>
                    <td>{row.level ? <span className="lv">{row.colour && <i style={{ background: row.colour }} />}{row.level}</span> : '—'}</td>
                    <td className="num">{row.value || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="ov-pager">
            <span>{tableRows.length ? `${tableFrom}–${tableTo} of ${tableRows.length}` : '0 tehsils'}</span>
            <div className="btns">
              <button type="button" className="step" disabled={tableIndex === 0} onClick={() => setTablePage(tableIndex - 1)}>Previous</button>
              {tableMarks.map((mark, index) => (
                mark === '…'
                  ? <span className="gap" key={`gap-${index}`}>…</span>
                  : <button type="button" key={mark} className={mark === tableIndex ? 'on' : ''} aria-current={mark === tableIndex ? 'page' : undefined} onClick={() => setTablePage(mark)}>{mark + 1}</button>
              ))}
              <button type="button" className="step" disabled={tableIndex >= tablePages - 1} onClick={() => setTablePage(tableIndex + 1)}>Next</button>
            </div>
          </footer>
        </section>
      )}

      <HourStrip place={place} bundle={bundle} registry={legends} />

      <section className="hourly" aria-label="Next 24 hours">
        <div className="hh">
          <h3>Next 24 hours</h3>
          <span className="sub">{place ? place.name : 'Choose a place'} · next 24 hours · PKT</span>
        </div>
        <div className="hscroll">
          {groups.map((group, groupIndex) => (
            <div className="agnw3" key={group.key || groupIndex} style={{ '--i': groupIndex }} title={`Rain ${hourLabel(group.key)}–${hourLabel(group.key.replace(/T(\d\d)/, (_, hour) => `T${String((Number(hour) + 3) % 24).padStart(2, '0')}`))} PKT`}>
              <div className="agnw3h">
                {group.rows.map((row, index) => {
                  const nowCell = groupIndex === 0 && index === 0;
                  return (
                    <div key={row.time || index} className={nowCell ? 'hcell isnow' : 'hcell'} style={{ '--j': index }}>
                      {nowCell ? <span className="nowtag">NOW</span> : <div className="hr">{hourLabel(row.time)}</div>}
                      <SkyMark code={row.weatherCode} cloud={row.cloudPct} rad={row.swRad} />
                      <div className="t">{Number.isFinite(+row.tempC) ? `${Math.round(row.tempC)}°` : '—'}</div>
                    </div>
                  );
                })}
              </div>
              <div className="agnw3f">{rainFoot(group.mm)}</div>
            </div>
          ))}
          {place && groups.length === 0 && bundle && <p>No hourly rows in this answer.</p>}
        </div>
        <p className="note">Rain under each group is the 3-hour total (PKT).</p>
      </section>

      <Guidance place={place} />

      {reportOpen && now && createPortal(
        <div className="ov-modal" role="dialog" aria-modal="true" aria-label="Full report" onClick={(event) => { if (event.target === event.currentTarget) setReportOpen(false); }}>
          <div className="ov-repview">
            <header>
              <div className="who">
                <p className="eyebrow">Site report</p>
                <h2>{info?.name || place.name}</h2>
                <p className="meta">{made?.ok && made.id ? `${made.id}${made.pages ? ` · ${made.pages} pages` : ''}` : 'The checked forecast for this point'}</p>
              </div>
              <div className="acts">
                <button type="button" disabled={!made?.html} onClick={() => reportFrame.current?.contentWindow?.print()}>Print</button>
                {made?.pdf ? <a className="pri" href={`${made.pdf}?download=1`} download={`${made.id || 'report'}.pdf`}>Download PDF</a> : null}
                <button type="button" className="ov-x" onClick={() => setReportOpen(false)}>Close</button>
              </div>
            </header>
            <div className="sheet">
              {made?.busy && <p className="wait">Making the site report…</p>}
              {made?.ok && made.html && <iframe ref={reportFrame} title="Site report" src={made.html} />}
              {made && !made.busy && !made.ok && <p className="fail">{made.why || 'The report could not be made.'}</p>}
            </div>
          </div>
        </div>,
        document.body,
      )}
      {!embedded && <Reports open={reportsOpen} onClose={() => setReportsOpen(false)} place={place} />}
    </div>
  );
}
