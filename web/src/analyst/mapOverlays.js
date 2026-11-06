import { useEffect, useState } from 'react';
import L from 'leaflet';
import { getJson } from '../start/api.js';
import { HEAT_INDEX_COLOURS, HEAT_INDEX_WORDS, LEVEL_COLOURS, LEVEL_WORDS } from './layers.js';

const FILL = LEVEL_COLOURS;
const PMC = ['#35682B', '#b3a51f', '#e08a1e', '#c0392b', '#7b1e5a', '#4a0e0e'];
const DSP = ['#35682B', '#b3a51f', '#e08a1e', '#b3261e'];
const TEMP_PAL = [[49, 54, 149], [69, 117, 180], [116, 173, 209], [171, 217, 233], [254, 224, 144], [253, 174, 97], [244, 109, 67], [215, 48, 39], [165, 0, 38]];
const UHI_RAMP = [[-0.7, '#2A696D'], [-0.4, '#4AADB4'], [-0.22, '#92D1D5'], [0.12, '#fbdcec'], [0.6, '#f7b3d5'], [1.2, '#ef7fb8'], [2, '#e04a9a'], [3, '#c0207a'], [4, '#a3106a'], [5, '#8e0057'], [6, '#5c0038']];
const QN = {
  t: { k: 't', name: 'Temperature', unit: '°C', d: 1 },
  td: { k: 'td', name: 'Dew point', unit: '°C', d: 1 },
  rh: { k: 'rh', name: 'Humidity', unit: '%', d: 0 },
  utci: { k: 'utci', name: 'UTCI in shade', unit: '°C', d: 1 },
};
const HI_STATE = {
  '-1': ['Not available', 'rgba(148,103,201,.45)'],
  '-2': ['Outside the range of the heat index table', '#ddd6ea'],
  '-5': ['Not tested', '#c3ccd3'],
};
const GLOF_COL = { 1: '#c0392b', 2: '#e08e0b', 3: '#7DC8CE' };
const GLOF_WORD = { 1: 'High', 2: 'Moderate', 3: 'Low' };

let chanceClasses = [];
let heatScale = null;
let scalesPromise = null;
let glofCache = null;
let glofPromise = null;
let quakeCache = null;
let quakePromise = null;
const heatIndexCache = new Map();

export function loadScales() {
  if (chanceClasses.length && heatScale) return Promise.resolve({ outlookChance: { classes: chanceClasses }, layers: { heat_index: heatScale } });
  if (scalesPromise) return scalesPromise;
  scalesPromise = getJson('/api/map/layer?id=scales:map').then((body) => {
    if (Array.isArray(body?.outlookChance?.classes)) chanceClasses = body.outlookChance.classes;
    if (body?.layers?.heat_index) heatScale = body.layers.heat_index;
    return body;
  }).catch(() => null).finally(() => { scalesPromise = null; });
  return scalesPromise;
}

function loadGlof() {
  if (glofCache) return Promise.resolve(glofCache);
  if (glofPromise) return glofPromise;
  glofPromise = getJson('/api/glof/map').then((body) => {
    if (body?.ok) glofCache = body;
    return body;
  }).finally(() => { glofPromise = null; });
  return glofPromise;
}

function loadQuakes() {
  if (quakeCache) return Promise.resolve(quakeCache);
  if (quakePromise) return quakePromise;
  quakePromise = Promise.all([getJson('/api/quake/live?geom=1'), getJson('/api/faults')]).then(([body, faults]) => {
    quakeCache = { body, faults, at: Date.now() };
    return quakeCache;
  }).finally(() => { quakePromise = null; });
  return quakePromise;
}

function loadHeatIndex(day) {
  const key = String(day);
  const hit = heatIndexCache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60e3) return Promise.resolve(hit.body);
  return getJson(`/api/levels?layer=heat_index&day=${day}`).then((body) => {
    heatIndexCache.set(key, { body, at: Date.now() });
    return body;
  });
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function divColor(value, range, palette) {
  const t = Math.max(-1, Math.min(1, range ? value / range : 0));
  if (Math.abs(t) < 1 / 6) return '#74c476';
  const warm = palette === 'rain' ? [33, 102, 172] : [178, 24, 43];
  const cool = palette === 'rain' ? [140, 81, 10] : [33, 102, 172];
  const c = t >= 0 ? warm : cool;
  const a = 0.3 + 0.7 * (Math.abs(t) - 1 / 6) / (5 / 6);
  return `rgb(${Math.round(247 + (c[0] - 247) * a)},${Math.round(247 + (c[1] - 247) * a)},${Math.round(247 + (c[2] - 247) * a)})`;
}

function amountSpan(data) {
  let lo = Infinity;
  let hi = -Infinity;
  Object.values(data.values || {}).forEach((value) => {
    if (value == null || !Number.isFinite(+value)) return;
    if (+value < lo) lo = +value;
    if (+value > hi) hi = +value;
  });
  return [lo, hi];
}

export function outlookColor(data, value) {
  if (value == null || !data) return null;
  if (data.type === 'chance') {
    if (!chanceClasses.length || !Number.isFinite(+value)) return null;
    let picked = chanceClasses[0];
    chanceClasses.forEach((row) => { if (+value >= row.min) picked = row; });
    const index = LEVEL_WORDS.indexOf(picked?.level);
    return index >= 0 ? FILL[index] : null;
  }
  if (data.type === 'amount') {
    const [lo, hi] = amountSpan(data);
    const f = hi > lo ? (+value - lo) / (hi - lo) : 0;
    return `rgb(${Math.round(239 - f * 190)},${Math.round(243 - f * 130)},${Math.round(255 - f * 80)})`;
  }
  if (data.type === 'pm25' && data.classes) {
    let k = 0;
    for (; k < data.classes.length - 1; k += 1) if (data.classes[k].max != null && value <= data.classes[k].max) break;
    return PMC[k];
  }
  if (data.type === 'binary') return value ? '#8f1d3a' : '#eef2f4';
  if (data.type === 'hours') return value <= 0 ? '#f7fbff' : value < 3 ? '#d9d9d9' : value < 6 ? '#9e9e9e' : '#5f5f5f';
  if (data.type === 'classes4') return DSP[value] || null;
  if (data.type === 'diverging') return divColor(+value, data.range, data.palette);
  return null;
}

const LEVEL_OPACITY = [0.5, 0.9, 0.92, 0.92, 0.94];
const NO_DATA = '#9467c9';

function chanceIndex(value) {
  if (!chanceClasses.length || value == null || !Number.isFinite(+value)) return -1;
  let picked = 0;
  chanceClasses.forEach((row, index) => { if (+value >= row.min) picked = index; });
  return picked;
}

export function outlookCanPaint(data) {
  if (!data?.ready || !data.values) return false;
  if (data.type === 'chance' && !chanceClasses.length) return false;
  return true;
}

export function outlookOpacity(data, value) {
  if (data?.type === 'chance') {
    const index = chanceIndex(value);
    if (index >= 0) {
      const level = LEVEL_WORDS.indexOf(chanceClasses[index]?.level);
      if (level >= 0) return LEVEL_OPACITY[level];
    }
  }
  return 0.85;
}

export function outlookStyle(data, uid) {
  const value = data?.values?.[uid];
  const why = data?.whys?.[uid] || '';
  const colour = outlookColor(data, value);
  if (colour) return { stroke: false, fill: true, fillColor: colour, fillOpacity: outlookOpacity(data, value) };
  if (data?.mask?.reason && why === data.mask.reason) return { stroke: false, fill: true, fillColor: '#fdf3f7', fillOpacity: 0.75 };
  if (/too small for a percent|climatological mean is/.test(why)) return { stroke: false, fill: true, fillColor: '#c9b6ea', fillOpacity: 0.6 };
  return { stroke: false, fill: true, fillColor: NO_DATA, fillOpacity: 0.62 };
}

export function outlookGapRows(data) {
  if (!data) return [];
  const byWhy = {};
  Object.entries(data.whys || {}).forEach(([uid, why]) => {
    if (data.values?.[uid] != null) return;
    byWhy[why] = (byWhy[why] || 0) + 1;
  });
  const rows = [];
  const mask = data.mask?.reason;
  let other = 0;
  const otherWhys = [];
  Object.entries(byWhy).forEach(([why, count]) => {
    if (mask && why === mask) rows.push(['#fdf3f7', `Does not occur here: ${why} · ${count}`]);
    else { other += count; otherWhys.push(why); }
  });
  if (other) {
    const dry = otherWhys.every((why) => /too small for a percent|climatological mean is/.test(why));
    const label = dry
      ? 'Normally dry this month (a % change means nothing)'
      : (otherWhys.length === 1 ? otherWhys[0] : 'No usable reading');
    rows.push([dry ? '#c9b6ea' : NO_DATA, `${label} · ${other}`]);
  }
  const valued = Object.values(data.values || {}).filter((value) => value != null).length;
  const explained = Object.values(byWhy).reduce((sum, count) => sum + count, 0);
  const missing = Math.max(0, (data.units || 0) - valued - explained);
  if (missing) rows.push([NO_DATA, `Data missing · the source gave no value for these tehsils · ${missing}`]);
  return rows;
}

export function outlookValueText(data, uid) {
  if (!data?.ready || !uid) return '';
  const value = data.values?.[uid];
  if (value == null) return `${data.title}: ${data.whys?.[uid] || 'No data'}`;
  if (data.type === 'chance') {
    const index = chanceIndex(value);
    const label = index >= 0 ? (chanceClasses[index].label || chanceClasses[index].level) : '';
    return `${data.title}: ${value}%${label ? ` · ${label}` : ''}`;
  }
  if (data.type === 'binary') return `${data.title}: ${value ? 'smog day' : 'no'}`;
  const sign = data.type === 'diverging' && +value > 0 ? '+' : '';
  return `${data.title}: ${sign}${value}${data.unit ? ` ${data.unit}` : ''}`;
}

export function outlookKeyHtml(data) {
  const rows = [...outlookRows(data), ...outlookGapRows(data)];
  const when = data.valid ? `<div class="v">${esc(data.valid)}</div>` : '';
  const body = rows.map(([colour, label]) => `<div><i style="background:${esc(colour)}"></i><span>${esc(label)}</span></div>`).join('');
  const note = data.count === 0 ? '<div class="meta">No tehsil has a value for this period, so the map uses the no-data colour.</div>' : '';
  return `<div class="t">${esc(data.title || 'Outlook')}</div>${when}<div class="leg">${body}</div>${note}`;
}

export function outlookRows(data) {
  if (!data) return [];
  if (data.type === 'diverging') {
    const rain = data.palette === 'rain';
    const near = Math.round((data.range / 6) * 10) / 10;
    return [
      [divColor(-data.range, data.range, data.palette), `${rain ? 'Much drier' : 'Much colder'} · −${data.range} ${data.unit || ''}`],
      [divColor(-0.5 * data.range, data.range, data.palette), `${rain ? 'Drier' : 'Colder'} · −${data.range / 2} ${data.unit || ''}`],
      ['#74c476', `Near normal · within ±${near} ${data.unit || ''}`],
      [divColor(0.5 * data.range, data.range, data.palette), `${rain ? 'Wetter' : 'Warmer'} · +${data.range / 2} ${data.unit || ''}`],
      [divColor(data.range, data.range, data.palette), `${rain ? 'Much wetter' : 'Much warmer'} · +${data.range} ${data.unit || ''}`],
    ];
  }
  if (data.type === 'chance' && chanceClasses.length) {
    return chanceClasses.map((row) => [FILL[LEVEL_WORDS.indexOf(row.level)] || '#ccc', `${row.min}–${row.max}% · ${row.label || row.level}`]);
  }
  if (data.type === 'amount') return [['rgb(239,243,255)', 'Lower in this period'], ['rgb(49,113,175)', 'Higher in this period']];
  if (data.type === 'binary') return [['#8f1d3a', 'Smog day'], ['#eef2f4', 'No']];
  if (data.type === 'pm25' && data.classes) return data.classes.map((row, index) => [PMC[index], row.label]);
  if (data.type === 'hours') return [['#f7fbff', '0 h'], ['#d9d9d9', '1–2 h'], ['#9e9e9e', '3–5 h'], ['#5f5f5f', '6+ h']];
  if (data.type === 'classes4' && data.labels) return data.labels.map((label, index) => [DSP[index], label]);
  return [];
}

function stack(map) {
  const box = map.getContainer();
  let host = box.querySelector('.ov-legstack');
  if (!host) {
    host = document.createElement('div');
    host.className = 'ov-legstack';
    box.appendChild(host);
    L.DomEvent.disableClickPropagation(host);
    L.DomEvent.disableScrollPropagation(host);
  }
  return host;
}

function slot(map, id) {
  const host = stack(map);
  let el = host.querySelector(`#${id}`);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.className = 'ov-leg';
    host.appendChild(el);
  }
  return el;
}

function drop(map, id) {
  map?.getContainer()?.querySelector(`#${id}`)?.remove();
}

function pane(map, name, z, quiet) {
  if (!map.getPane(name)) {
    const node = map.createPane(name);
    node.style.zIndex = String(z);
    if (quiet) node.style.pointerEvents = 'none';
  }
  return name;
}

function uhiColour(value) {
  if (value == null || !Number.isFinite(+value)) return '#e5ebf0';
  let colour = UHI_RAMP[0][1];
  UHI_RAMP.forEach(([cut, ink]) => { if (+value >= cut) colour = ink; });
  return colour;
}

function tempInk(fraction) {
  const f = Math.max(0, Math.min(1, fraction));
  const x = f * (TEMP_PAL.length - 1);
  const i = Math.min(TEMP_PAL.length - 2, Math.floor(x));
  const t = x - i;
  const a = TEMP_PAL[i];
  const b = TEMP_PAL[i + 1];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function hoursFromSunset() {
  const d = new Date();
  const n = Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000);
  const dec = 23.44 * Math.PI / 180 * Math.sin(2 * Math.PI * (284 + n) / 365);
  const lat = 33.6 * Math.PI / 180;
  const x = Math.max(-1, Math.min(1, -Math.tan(lat) * Math.tan(dec)));
  const H = Math.acos(x) * 180 / Math.PI / 15;
  const noon = 12 + (75 - 73.1) / 15;
  let t = ((d.getUTCHours() + d.getUTCMinutes() / 60 + 5) % 24) - (noon + H);
  while (t < -12) t += 24;
  while (t > 12) t -= 24;
  return t;
}

export function heatStyle(uid, heat) {
  const value = heat?.levels?.[uid];
  if (Number.isFinite(+value) && +value >= 0 && heat.palette[+value]) {
    return { fillColor: heat.palette[+value], fillOpacity: 0.82, color: 'rgba(255,255,255,.9)', weight: 0.5, dashArray: null };
  }
  const state = HI_STATE[String(value)];
  if (state) return { fillColor: state[1], fillOpacity: 0.5, color: '#9aa7b0', weight: 0.5, dashArray: '3 3' };
  return { fillOpacity: 0, color: 'rgba(21,74,78,.30)', weight: 0.6, fillColor: '#c3ccd3' };
}

function paintHeatLegend(map, day, body, words, palette) {
  const el = slot(map, 'ovHiLeg');
  const name = day === 0 ? 'today' : day === 1 ? 'tomorrow' : `in ${day} days`;
  let html = `<b>Heat index, ${esc(name)}</b>`;
  if (!body) html += '<div>Loading the heat index…</div>';
  else if (!body.levels) html += '<div>Not available for this day.</div>';
  else {
    const counts = [0, 0, 0];
    const states = {};
    let n = 0;
    Object.values(body.levels).forEach((value) => {
      n += 1;
      if (Number.isFinite(+value) && +value >= 0 && +value < 3) counts[+value] += 1;
      else states[String(value)] = (states[String(value)] || 0) + 1;
    });
    if (states['-5'] === n) html += '<div>Not tested for this day: the heat index bands were tested for 1 to 3 days ahead only.</div>';
    else {
      for (let i = words.length - 1; i >= 0; i -= 1) html += `<div class="row"><i style="background:${esc(palette[i])}"></i><span>${esc(words[i])}</span><em>${counts[i] || 0}</em></div>`;
      Object.keys(states).forEach((key) => {
        const state = HI_STATE[key] || HI_STATE['-1'];
        html += `<div class="row"><i style="background:${state[1]}"></i><span>${esc(state[0])}</span><em>${states[key]}</em></div>`;
      });
    }
    html += '<div class="n">The day’s highest hourly heat index at the main town of each tehsil. A condition, not a hazard: it raises no alert.</div>';
  }
  el.innerHTML = html;
}

function useRivers(mapRef, ready, enabled) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !enabled) return undefined;
    let dead = false;
    let data = null;
    let pts = null;
    let offset = 0;
    let raf = 0;
    let zoom = null;
    let origin = null;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    pane(map, 'v283River', 405, true);
    const canvas = document.createElement('canvas');
    canvas.className = 'agn-rivers283';
    canvas.style.pointerEvents = 'none';
    map.getPane('v283River').appendChild(canvas);
    const g = canvas.getContext('2d');
    let topLeft = null;
    const project = () => {
      if (!data?.rivers?.length) return;
      const nextZoom = map.getZoom();
      const nextOrigin = map.getPixelOrigin();
      if (zoom === nextZoom && origin && nextOrigin.equals(origin) && pts?.length) return;
      zoom = nextZoom;
      origin = nextOrigin;
      pts = data.rivers.map((river) => (river.coords || []).map((coord) => map.latLngToLayerPoint([coord[1], coord[0]])));
    };
    const widthOf = (river) => {
      const z = map.getZoom();
      const base = z < 6 ? 1.6 : z < 7 ? 2.2 : z < 8 ? 2.8 : z < 9 ? 3.4 : z < 10 ? 4.2 : z < 12 ? 5.2 : 6.5;
      const n = (river.points || []).length;
      return base * (n >= 8 ? 1.55 : n >= 3 ? 1.2 : 1);
    };
    const draw = () => {
      if (!g || !pts?.length || !data || !topLeft) return;
      const size = map.getSize();
      const ratio = window.devicePixelRatio || 1;
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      g.clearRect(0, 0, size.x, size.y);
      if (map.getZoom() > 13) return;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      const bounds = map.getBounds().pad(0.1);
      data.rivers.forEach((river, index) => {
        const line = pts[index];
        if (!line?.length) return;
        if (!river._b) {
          const box = L.latLngBounds([]);
          river.coords.forEach((coord) => box.extend([coord[1], coord[0]]));
          river._b = box;
        }
        if (!bounds.intersects(river._b)) return;
        const width = widthOf(river);
        const path = (dx, dy) => {
          g.beginPath();
          for (let i = 0; i < line.length; i += 1) {
            const x = line[i].x - topLeft.x + dx;
            const y = line[i].y - topLeft.y + dy;
            if (i) g.lineTo(x, y);
            else g.moveTo(x, y);
          }
        };
        path(0, 1.6);
        g.setLineDash([]);
        g.strokeStyle = 'rgba(35,89,93,.22)';
        g.lineWidth = width + 4.5;
        g.stroke();
        path(0, 0);
        g.strokeStyle = '#4AB3BB';
        g.lineWidth = width;
        g.stroke();
        path(-0.35, -0.5);
        g.strokeStyle = 'rgba(219,240,241,.75)';
        g.lineWidth = Math.max(0.8, width * 0.32);
        g.stroke();
        if (!reduced && width >= 1.6) {
          path(0, 0);
          g.setLineDash([width * 1.4, width * 5]);
          g.lineDashOffset = -offset;
          g.strokeStyle = 'rgba(255,255,255,.92)';
          g.lineWidth = Math.max(0.9, width * 0.42);
          g.stroke();
          g.setLineDash([]);
        }
      });
    };
    const reset = () => {
      const size = map.getSize();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(size.x * ratio);
      canvas.height = Math.round(size.y * ratio);
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
      topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(canvas, topLeft);
      canvas.style.visibility = '';
      project();
      draw();
    };
    const hide = () => { canvas.style.visibility = 'hidden'; };
    map.on('moveend zoomend resize viewreset', reset);
    map.on('zoomstart', hide);
    getJson('/n3/rivers.json').then((body) => {
      if (dead || !Array.isArray(body?.rivers)) return;
      data = body;
      if (body.attribution) map.attributionControl?.addAttribution(body.attribution);
      reset();
      if (reduced) return;
      const started = performance.now();
      let last = 0;
      const frame = (now) => {
        if (dead) return;
        if (!document.hidden && now - last >= 33 && canvas.style.visibility !== 'hidden') {
          last = now;
          offset = ((now - started) / 1000) * 14 % 1e6;
          draw();
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }).catch(() => {});
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      map.off('moveend zoomend resize viewreset', reset);
      map.off('zoomstart', hide);
      canvas.remove();
    };
  }, [ready, mapRef, enabled]);
}

export function useMapOverlays(mapRef, layerRef, ready, overlays, outlook, day) {
  const [heat, setHeat] = useState(null);
  const [scalesTick, setScalesTick] = useState(0);

  useEffect(() => { loadScales().then(() => setScalesTick((n) => n + 1)); }, []);
  useRivers(mapRef, ready, overlays.rivers !== false);

  useEffect(() => {
    if (outlook?.type === 'chance' && !chanceClasses.length) loadScales().then(() => setScalesTick((n) => n + 1));
  }, [outlook]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !overlays.quakes) {
      if (map?._quakes) { map.removeLayer(map._quakes); map._quakes = null; }
      if (map) drop(map, 'ovQuakeLeg');
      return undefined;
    }
    let dead = false;
    const leg = slot(map, 'ovQuakeLeg');
    if (!quakeCache) leg.innerHTML = '<b>Recent earthquakes</b><div class="n">Loading…</div>';
    loadQuakes().then(({ body, faults }) => {
      if (dead || !mapRef.current) return;
      if (!body?.ok) {
        leg.innerHTML = `<b>Recent earthquakes</b><div class="n">${esc(body?.why || 'The earthquake feed did not answer.')}</div>`;
        return;
      }
      pane(map, 'agnQuake', 585, false);
      pane(map, 'agnQuakeEp', 655, false);
      const group = L.layerGroup();
      if (faults?.ok && faults.features) {
        L.geoJSON(faults, {
          pane: 'agnQuake',
          style: (feature) => {
            const boundary = feature?.properties?.kind !== 'mapped active fault';
            return { color: '#b4442a', weight: boundary ? 1.4 : 1.8, opacity: 0.85, dashArray: boundary ? '6 4' : null };
          },
          onEachFeature: (feature, layer) => {
            const props = feature.properties || {};
            layer.bindPopup(`<b>${esc(props.name || 'Active fault')}</b><br>${esc(props.kind || '')}<br><span class="n">${esc(faults.credit || 'GEM Global Active Faults')}</span>`);
          },
        }).addTo(group);
      }
      (body.flagged || []).forEach((row) => {
        if (!row.geometry) return;
        const colour = FILL[row.levelIndex] || '#999';
        const shape = L.geoJSON({ type: 'Feature', geometry: row.geometry }, {
          pane: 'agnQuake',
          style: { color: colour, weight: 2.6, opacity: 1, fillColor: colour, fillOpacity: 0.14 },
        });
        shape.bindPopup(`<b>${esc(row.tehsil)}</b>${row.district ? `, ${esc(row.district)}` : ''}<br><b>${esc(row.level)}</b><br>Magnitude ${esc(row.mag)} · ${esc(row.timePkt)}<br>${esc(body.credit || '')}`);
        shape.addTo(group);
      });
      const events = (body.events || []).filter((event) => event.inPakistan !== false || (event.flaggedCount || 0) > 0);
      events.sort((a, b) => a.mag - b.mag).forEach((event) => {
        const radius = Math.max(7, (body.markerRadiusPx?.base || 4) + (body.markerRadiusPx?.perMagnitude || 3) * (event.mag - (body.magMin || 4)));
        const size = 2 * radius + 6;
        const c = size / 2;
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${c}" cy="${c}" r="${radius}" fill="#fff" fill-opacity=".9" stroke="#7a2e0e" stroke-width="2.2"/><circle cx="${c}" cy="${c}" r="${(radius * 0.58).toFixed(1)}" fill="none" stroke="#7a2e0e" stroke-width="1.6"/><circle cx="${c}" cy="${c}" r="${Math.max(1.8, radius * 0.2).toFixed(1)}" fill="#7a2e0e"/></svg>`;
        L.marker([event.lat, event.lon], {
          pane: 'agnQuakeEp',
          title: `Earthquake M${event.mag}`,
          icon: L.divIcon({ className: 'ov-quake-ep', html: svg, iconSize: [size, size], iconAnchor: [c, c] }),
        }).bindPopup(`<b>Magnitude ${esc(event.mag)}</b> · depth ${esc(Math.round(event.depthKm))} km<br>${esc(event.timePkt)}<br>${esc(event.place || '')}`).addTo(group);
      });
      group.addTo(map);
      map._quakes = group;
      const words = ['', 'Low', 'Moderate', 'High', 'Severe'];
      (body.levels || []).forEach((level) => { if (level.levelIndex) words[level.levelIndex] = level.shaking ? `${level.level} · ${String(level.shaking).toLowerCase()} shaking` : level.level; });
      leg.innerHTML = `<b>Recent earthquakes</b> <span class="n">(last ${esc(body.retainDays)} days, M${esc(body.magMin)}+)</span>`
        + `<div>${events.length} event${events.length === 1 ? '' : 's'} in Pakistan or felt here</div>`
        + `${faults?.ok ? `<div>Active fault${faults.features ? '' : ''} · ${esc(faults.credit || 'GEM')}</div>` : ''}`
        + [4, 3, 2, 1].map((i) => `<div class="row"><i style="border-color:${FILL[i]}"></i><span>${esc(words[i] || '')}</span></div>`).join('')
        + `<div class="n">${(body.flagged || []).length} tehsil${(body.flagged || []).length === 1 ? '' : 's'} outlined. ${esc(body.credit || '')}</div>`;
    }).catch(() => {
      if (!dead) leg.innerHTML = '<b>Recent earthquakes</b><div class="n">The earthquake feed did not answer.</div>';
    });
    return () => {
      dead = true;
      if (map._quakes) { map.removeLayer(map._quakes); map._quakes = null; }
      drop(map, 'ovQuakeLeg');
    };
  }, [ready, overlays.quakes, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !overlays.urban) {
      if (map?._uhi) { map.removeLayer(map._uhi); map._uhi = null; }
      if (map) drop(map, 'ovUhiLeg');
      return undefined;
    }
    let dead = false;
    let busy = false;
    let lastKey = '';
    let mode = 'max';
    const paintLegend = (body) => {
      const el = slot(map, 'ovUhiLeg');
      if (body?.withheld || !body?.ready) {
        const why = String(body?.why || 'not assessed').replace(/^not assessed:\s*/i, '');
        el.innerHTML = `<b>Urban heat island</b><div><b>Not assessed.</b> ${esc(why.charAt(0).toUpperCase() + why.slice(1))}</div>`;
        return;
      }
      const swatch = UHI_RAMP.map((row, index) => {
        const hi = UHI_RAMP[index + 1]?.[0];
        return `<div class="row"><i style="background:${row[1]}"></i><span>${hi == null ? `≥ ${row[0]}` : `${row[0]} – ${hi}`} °C</span></div>`;
      }).join('');
      el.innerHTML = `<b>Urban heat island</b> <span class="n">°C added</span>${swatch}<div class="n">${body.n || 0} cells</div><button type="button" id="ovUhiMode">${mode === 'max' ? 'showing tonight’s maximum · switch to now' : 'showing now · switch to tonight’s maximum'}</button>`;
      el.querySelector('#ovUhiMode')?.addEventListener('click', (event) => {
        event.stopPropagation();
        mode = mode === 'max' ? 'now' : 'max';
        lastKey = '';
        refresh();
      });
    };
    const draw = (body) => {
      if (map._uhi) { map.removeLayer(map._uhi); map._uhi = null; }
      const cells = body?.withheld ? [] : (body?.cells || []);
      if (!cells.length) return;
      pane(map, 'agnUhi', 460, true);
      const group = L.layerGroup();
      const step = body.stepDeg || 0.0025;
      const half = step / 2;
      const renderer = L.canvas({ pane: 'agnUhi', padding: 0.3 });
      for (let i = 0; i < cells.length; i += 3) {
        const lat = cells[i];
        const lon = cells[i + 1];
        const value = cells[i + 2];
        if (value == null || !Number.isFinite(+value) || Math.abs(+value) < 0.12) continue;
        group.addLayer(L.rectangle([[lat - half, lon - half], [lat + half, lon + half]], {
          renderer, pane: 'agnUhi', stroke: false, fill: true, fillColor: uhiColour(value), fillOpacity: 0.85, interactive: false,
        }));
      }
      group.addTo(map);
      map._uhi = group;
    };
    let listening = false;
    const refresh = () => {
      if (dead || busy) return;
      const bounds = map.getBounds();
      const key = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].map((n) => n.toFixed(2)).join(',') + `|${mode}`;
      if (key === lastKey) return;
      busy = true;
      const hs = mode === 'now' ? hoursFromSunset() : null;
      const url = `/api/urban/cells?w=${bounds.getWest()}&s=${bounds.getSouth()}&e=${bounds.getEast()}&n=${bounds.getNorth()}&max=18000&zoom=${map.getZoom()}${hs == null ? '' : `&hoursFromSunset=${hs.toFixed(2)}`}`;
      getJson(url).then((body) => {
        busy = false;
        if (dead) return;
        lastKey = key;
        draw(body);
        paintLegend(body);
        if (body?.withheld || !body?.ready) {
          if (listening) {
            map.off('moveend zoomend', refresh);
            listening = false;
          }
        } else if (!listening) {
          map.on('moveend zoomend', refresh);
          listening = true;
        }
      }).catch(() => { busy = false; });
    };
    refresh();
    return () => {
      dead = true;
      if (listening) map.off('moveend zoomend', refresh);
      if (map._uhi) { map.removeLayer(map._uhi); map._uhi = null; }
      drop(map, 'ovUhiLeg');
    };
  }, [ready, overlays.urban, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !overlays.temp) {
      if (map?._temp) { map.removeLayer(map._temp); map._temp = null; }
      if (map) drop(map, 'ovTempLeg');
      return undefined;
    }
    let dead = false;
    let busy = false;
    let data = null;
    let qn = 't';
    let lastKey = '';
    let timer = 0;
    const valuesOf = () => (data && data[QN[qn].k]) || [];
    const has = (key) => (data?.[key] || []).some((value) => value != null);
    const range = () => {
      let lo = 1e9;
      let hi = -1e9;
      valuesOf().forEach((value) => {
        if (value == null) return;
        if (value < lo) lo = value;
        if (value > hi) hi = value;
      });
      return lo > hi ? null : [lo, hi];
    };
    const legend = (msg) => {
      const el = slot(map, 'ovTempLeg');
      if (msg) { el.innerHTML = `<b>Temperature detail</b><div>${esc(msg)}</div>`; return; }
      if (!data) return;
      const hour = new Date(Date.parse(data.hourUtc) + 5 * 3600e3).toISOString().slice(11, 13);
      const span = range() || [data.min, data.max];
      const opts = ['t', 'td', 'rh', 'utci'].filter((key) => key === 't' || has(QN[key].k));
      el.innerHTML = `<b>${QN[qn].name} now (${hour}:00 PKT)</b>`
        + `<div class="ov-q">${opts.map((key) => `<button type="button" data-q="${key}" class="${key === qn ? 'on' : ''}">${QN[key].name}</button>`).join('')}</div>`
        + `<div class="bar"></div><div class="ends"><span>${span[0].toFixed(QN[qn].d)} ${QN[qn].unit}</span><span>${span[1].toFixed(QN[qn].d)} ${QN[qn].unit}</span></div>`
        + '<div id="ovTempCur">Point at the map for the value</div>'
        + '<div class="n">Colours stretch over this view. A cell is a model estimate; the place forecast is the tested product.</div>';
      el.querySelectorAll('button').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          qn = button.getAttribute('data-q');
          if (qn !== 't' && !has(QN[qn].k)) { lastKey = ''; load(); }
          else draw();
        });
      });
    };
    const draw = () => {
      if (!data || dead) return;
      if (qn !== 't' && !has(QN[qn].k)) qn = 't';
      const nx = data.nx;
      const ny = data.ny;
      const canvas = document.createElement('canvas');
      canvas.width = nx;
      canvas.height = ny;
      const ctx = canvas.getContext('2d');
      const image = ctx.createImageData(nx, ny);
      const values = valuesOf();
      const span = range() || [data.min, data.max];
      const width = Math.max(qn === 'rh' ? 2 : 0.5, span[1] - span[0]);
      for (let q = 0; q < nx * ny; q += 1) {
        const value = values[q];
        const o = q * 4;
        if (value == null) { image.data[o + 3] = 0; continue; }
        const ink = tempInk((value - span[0]) / width);
        image.data[o] = ink[0];
        image.data[o + 1] = ink[1];
        image.data[o + 2] = ink[2];
        image.data[o + 3] = 170;
      }
      ctx.putImageData(image, 0, 0);
      const box = data.bbox;
      if (map._temp) map.removeLayer(map._temp);
      pane(map, 'agnTmap91', 450, true);
      map._temp = L.imageOverlay(canvas.toDataURL('image/png'), [[box[0], box[1]], [box[2], box[3]]], {
        opacity: 0.85, interactive: false, className: 'agn-tmap91', pane: 'agnTmap91',
      }).addTo(map);
      legend();
    };
    const load = () => {
      if (dead || busy) return;
      const bounds = map.getBounds();
      const south = Math.max(23.4, bounds.getSouth());
      const north = Math.min(37.3, bounds.getNorth());
      const west = Math.max(60.7, bounds.getWest());
      const east = Math.min(77.9, bounds.getEast());
      if (north <= south || east <= west) { legend('Move the map over Pakistan.'); return; }
      const size = map.getSize();
      const nx = Math.max(18, Math.min(48, Math.round(size.x / 16)));
      const ny = Math.max(18, Math.min(48, Math.round(size.y / 16)));
      const moist = qn !== 't' ? '&q=moist' : '';
      const key = [south, west, north, east].map((n) => n.toFixed(2)).join(',') + `|${nx}x${ny}|${moist}`;
      if (key === lastKey && data) return;
      busy = true;
      if (!data) legend('Working out the temperature over this view…');
      getJson(`/api/hyperlocal/grid?s=${south.toFixed(4)}&w=${west.toFixed(4)}&n=${north.toFixed(4)}&e=${east.toFixed(4)}&nx=${nx}&ny=${ny}${moist}`).then((body) => {
        busy = false;
        if (dead) return;
        if (body?.preparing) { legend(body.why || 'Preparing…'); timer = setTimeout(load, 30000); return; }
        if (!body?.ok) { legend('Not available right now.'); return; }
        data = body;
        lastKey = key;
        draw();
      }).catch(() => { busy = false; if (!dead) legend('Not available right now.'); });
    };
    const onMove = () => { clearTimeout(timer); timer = setTimeout(load, 1100); };
    const onMouse = (event) => {
      const el = map.getContainer().querySelector('#ovTempCur');
      if (!el || !data?.bbox) return;
      const box = data.bbox;
      const lat = event.latlng.lat;
      const lon = event.latlng.lng;
      if (lat < box[0] || lat > box[2] || lon < box[1] || lon > box[3]) { el.textContent = 'Point at the map for the value'; return; }
      const row = Math.floor(((box[2] - lat) / (box[2] - box[0])) * data.ny);
      const col = Math.floor(((lon - box[1]) / (box[3] - box[1])) * data.nx);
      const value = valuesOf()[row * data.nx + col];
      el.textContent = value == null ? 'No value here' : `Here: ${value.toFixed(QN[qn].d)} ${QN[qn].unit}`;
    };
    map.on('moveend', onMove);
    map.on('mousemove', onMouse);
    load();
    const slow = setInterval(() => { lastKey = ''; load(); }, 30 * 60e3);
    return () => {
      dead = true;
      clearTimeout(timer);
      clearInterval(slow);
      map.off('moveend', onMove);
      map.off('mousemove', onMouse);
      if (map._temp) { map.removeLayer(map._temp); map._temp = null; }
      drop(map, 'ovTempLeg');
    };
  }, [ready, overlays.temp, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !overlays.lakes) {
      if (map?._glof) { map.removeLayer(map._glof); map._glof = null; }
      if (map) drop(map, 'ovGlofLeg');
      return undefined;
    }
    let dead = false;
    let data = null;
    let band = -1;
    let canvas = null;
    let spots = [];
    const legend = () => {
      const el = slot(map, 'ovGlofLeg');
      const zoom = map.getZoom();
      const inventory = data?.inventory;
      el.innerHTML = '<b>Glacial lakes (susceptibility)</b>'
        + `<div class="row"><i style="background:${GLOF_COL[1]}"></i><span>High${inventory ? ' · SUPARCO dangerous-lake list' : ''}</span></div>`
        + `<div class="row"><i style="background:${GLOF_COL[2]}"></i><span>Moderate${zoom < 7 ? ' (zoom in to see)' : ''}</span></div>`
        + `<div class="row"><i style="background:${GLOF_COL[3]}"></i><span>Low${inventory?.count ? ` · ${inventory.count} lakes` : ''}${zoom < 9 ? ' (zoom in to see)' : ''}</span></div>`
        + '<div class="n">Circle size follows the map zoom. A lake marker, not the daily hazard colour.</div>';
    };
    const draw = () => {
      if (!data?.ok || dead) return;
      const next = map.getZoom() < 7 ? 0 : map.getZoom() < 9 ? 1 : 2;
      band = next;
      pane(map, 'agnGlof', 590, true);
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.className = 'agn-glof-cv';
        canvas.style.pointerEvents = 'none';
        map.getPane('agnGlof').appendChild(canvas);
      }
      const size = map.getSize();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(size.x * ratio);
      canvas.height = Math.round(size.y * ratio);
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(canvas, topLeft);
      const g = canvas.getContext('2d');
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      g.clearRect(0, 0, size.x, size.y);
      const rad = { 1: [3.5, 4.5, 6][band], 2: [0, 3.5, 4.5][band], 3: [0, 0, 3][band] };
      const admin = (data.fields || []).indexOf('admin');
      const view = map.getBounds().pad(0.15);
      spots = [];
      (data.lakes || []).forEach((row) => {
        const radius = rad[row[2]];
        if (!radius) return;
        if (admin >= 0 && row[admin] && row[admin] !== 'pk') return;
        if (row[0] < view.getSouth() || row[0] > view.getNorth() || row[1] < view.getWest() || row[1] > view.getEast()) return;
        const point = map.latLngToLayerPoint([row[0], row[1]]);
        const x = point.x - topLeft.x;
        const y = point.y - topLeft.y;
        const changing = row[8] === 'growing' || row[8] === 'draining';
        g.beginPath();
        g.arc(x, y, radius, 0, Math.PI * 2);
        g.fillStyle = GLOF_COL[row[2]];
        g.globalAlpha = 0.85;
        g.fill();
        g.globalAlpha = 1;
        g.lineWidth = changing ? 1.8 : (row[6] ? 1 : 0.6);
        g.strokeStyle = changing ? '#111' : (row[6] ? '#154A4E' : '#ffffff');
        g.stroke();
        spots.push({ x, y, radius, row });
      });
      legend();
    };
    const onClick = (event) => {
      if (!spots.length) return;
      const topLeft = map.containerPointToLayerPoint([0, 0]);
      const point = map.latLngToLayerPoint(event.latlng);
      const x = point.x - topLeft.x;
      const y = point.y - topLeft.y;
      let best = null;
      let bestD = 14;
      spots.forEach((spot) => {
        const d = Math.hypot(spot.x - x, spot.y - y);
        if (d < bestD) { best = spot; bestD = d; }
      });
      if (!best) return;
      const row = best.row;
      L.popup().setLatLng(event.latlng).setContent(`<b>${esc(row[3])}</b><br>${esc(row[16] || GLOF_WORD[row[2]])} susceptibility · ${esc(row[10] || '')}<br>${row[4] != null ? `Area ${esc(row[4])} km²` : ''}<br><span class="n">${esc(row[9] || '')}</span>`).openOn(map);
    };
    if (glofCache) {
      data = glofCache;
      draw();
    } else {
      slot(map, 'ovGlofLeg').innerHTML = '<b>Glacial lakes</b><div class="n">Loading the lake inventory…</div>';
    }
    loadGlof().then((body) => { data = body; if (!dead) draw(); }).catch(() => {
      if (!dead) slot(map, 'ovGlofLeg').innerHTML = '<b>Glacial lakes</b><div class="n">The lake inventory did not answer.</div>';
    });
    map.on('zoomend moveend', draw);
    map.on('click', onClick);
    return () => {
      dead = true;
      map.off('zoomend moveend', draw);
      map.off('click', onClick);
      canvas?.remove();
      drop(map, 'ovGlofLeg');
    };
  }, [ready, overlays.lakes, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !overlays.heatindex) {
      setHeat(null);
      if (map) drop(map, 'ovHiLeg');
      return undefined;
    }
    let dead = false;
    const cached = heatIndexCache.get(String(day));
    if (!cached) slot(map, 'ovHiLeg').innerHTML = '<b>Heat index</b><div>Loading the heat index…</div>';
    Promise.all([
      loadHeatIndex(day),
      heatScale ? Promise.resolve(null) : loadScales(),
    ]).then(([body]) => {
      if (dead) return;
      const words = heatScale?.words || HEAT_INDEX_WORDS;
      const palette = heatScale?.palette || HEAT_INDEX_COLOURS;
      setHeat(body?.levels ? { levels: body.levels, words, palette } : null);
      paintHeatLegend(map, day, body, words, palette);
    }).catch(() => {
      if (!dead) slot(map, 'ovHiLeg').innerHTML = '<b>Heat index</b><div>Not available for this day.</div>';
    });
    return () => { dead = true; };
  }, [ready, overlays.heatindex, day, mapRef]);

  return { heat, scalesTick };
}
