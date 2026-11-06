import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { STREETS_EARTH, clearStreetsLock, createOsmBasemap } from '../map/streetsBasemap.js';
import bounds from './bounds.json';
import provlines from './provlines.json';
import prov from './prov.json';
import { decodeParts, decodeRing } from './geo.js';
import { drawHazardSurface } from './surface.js';
import { getJson } from './api.js';

const Q = bounds.q || 10000;
const NATIONAL = decodeParts(bounds.national, Q);
const IIOJK = decodeParts(bounds.iiojk, Q);
const LOC = (bounds.loc || []).map((ring) => decodeRing(ring, Q));
const PROVINCE_LINES = (provlines.lines || []).map((line) => decodeRing(line, provlines.q || Q));

const HAZARD_COLOURS = ['#BFD6B4', '#E8D48A', '#E6B655', '#E39A3B', '#C8553D'];
const TEMP_PAL = [[49, 54, 149], [69, 117, 180], [116, 173, 209], [171, 217, 233], [254, 224, 144], [253, 174, 97], [244, 109, 67], [215, 48, 39], [165, 0, 38]];
const TEMP_LO = 0;
const TEMP_HI = 45;
/** Fixed national frame — same zoom with or without the bottom panel open. */
const PK_FIT_ZOOM = 5.5;
let tehsilCache = null;

function pakistanBounds() {
  const box = L.latLngBounds([]);
  NATIONAL.forEach((ring) => box.extend(L.latLngBounds(ring)));
  return box;
}

/** Frame Pakistan at a fixed zoom, centred in the map (no left-padding bias). */
function framePakistan(map, { animate = false } = {}) {
  map.setView(pakistanBounds().getCenter(), PK_FIT_ZOOM, { animate });
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

function tempCss(value) {
  if (value == null || !Number.isFinite(+value)) return null;
  const ink = tempInk((+value - TEMP_LO) / (TEMP_HI - TEMP_LO));
  return `rgb(${Math.round(ink[0])},${Math.round(ink[1])},${Math.round(ink[2])})`;
}

/** Seal adjacent tehsils: stroke matches fill so black map bg never shows as cracks. */
function choroplethStyle(fill, empty = '#2A3036') {
  if (!fill) {
    return {
      stroke: true,
      color: empty,
      weight: 1,
      opacity: 1,
      fillColor: empty,
      fillOpacity: 1,
      dashArray: null,
    };
  }
  return {
    stroke: true,
    color: fill,
    weight: 1.1,
    opacity: 1,
    fillColor: fill,
    fillOpacity: 1,
    dashArray: null,
  };
}

export default function MapView({ day, pin, fly, onPick, onGrid, placeMode, hazardKey, hazardDay = 0, mode = 'hazard' }) {
  const host = useRef(null);
  const mapRef = useRef(null);
  const surfaceRef = useRef(null);
  const tempRef = useRef(null);
  const hazardRef = useRef(null);
  const pinRef = useRef(null);
  const onPickRef = useRef(onPick);
  const onGridRef = useRef(onGrid);
  onPickRef.current = onPick;
  onGridRef.current = onGrid;

  useEffect(() => {
    const map = L.map(host.current, {
      zoomControl: false,
      attributionControl: true,
      minZoom: 2,
      maxZoom: 12,
      zoomSnap: 0.5,
      zoomDelta: 1,
    });
    mapRef.current = map;
    /* Dedicated SVG renderer on the tehsil pane — avoids canvas/pane glitches that drop polygons. */
    map._agnTempRenderer = L.svg({ padding: 0.5, pane: 'agnTemp' });
    map.getContainer().style.background = '#1b1c1f';
    map.createPane('agnMask');
    map.createPane('agnUnder'); /* solid land fill — below hazard surface */
    map.createPane('agnSurf'); /* hazard image overlay only */
    map.createPane('agnTemp');
    map.createPane('agnProv');
    map.createPane('agnFrontier');
    map.createPane('agnLab');
    map.getPane('agnMask').style.zIndex = 350;
    map.getPane('agnUnder').style.zIndex = 335;
    map.getPane('agnSurf').style.zIndex = 340;
    map.getPane('agnTemp').style.zIndex = 355; /* above province hairlines so choropleth reads solid */
    map.getPane('agnProv').style.zIndex = 348;
    map.getPane('agnFrontier').style.zIndex = 360;
    map.getPane('agnLab').style.zIndex = 365;
    ['agnMask', 'agnUnder', 'agnSurf', 'agnTemp', 'agnProv', 'agnFrontier', 'agnLab'].forEach((name) => {
      map.getPane(name).style.pointerEvents = 'none';
    });

    const world = [[-85, -180], [-85, 180], [85, 180], [85, -180]];
    L.polygon([world, ...NATIONAL], {
      pane: 'agnMask', stroke: false, fillColor: '#000000', fillOpacity: 0.5, interactive: false,
    }).addTo(map);
    /* One fill per land ring (NATIONAL is multi-polygon — do not pass rings as holes). */
    NATIONAL.forEach((ring) => {
      L.polygon(ring, {
        pane: 'agnUnder', stroke: false, fillColor: '#1E2428', fillOpacity: 1, interactive: false,
      }).addTo(map);
      L.polygon(ring, {
        pane: 'agnFrontier', color: '#B4BAC0', weight: 1.4, opacity: 0.9, fill: false, interactive: false,
      }).addTo(map);
    });
    if (IIOJK.length) {
      L.polygon(IIOJK, {
        pane: 'agnFrontier', color: '#8E9196', weight: 1.2, dashArray: '4', fillColor: '#3A3B3E', fillOpacity: 0.85, interactive: false,
      }).addTo(map);
    }
    if (LOC.length) {
      L.polyline(LOC, {
        pane: 'agnFrontier', color: '#D5D9DD', weight: 1.2, dashArray: '6 4', opacity: 0.9, interactive: false,
      }).addTo(map);
    }
    if (PROVINCE_LINES.length) {
      L.polyline(PROVINCE_LINES, {
        pane: 'agnProv', color: '#A8AEB4', weight: 0.7, opacity: 0.45, interactive: false,
      }).addTo(map);
    }
    (prov.labels || []).forEach((label) => {
      L.marker([label.lat, label.lon], {
        pane: 'agnLab',
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: `pk-prov r${label.rank}`,
          html: `<span>${label.name}</span>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
      }).addTo(map);
    });
    L.marker([33.55, 75.35], {
      pane: 'agnFrontier',
      interactive: false,
      keyboard: false,
      icon: L.divIcon({ className: 'pk-lab', html: 'IIOJK (disputed)', iconSize: null, iconAnchor: [44, 7] }),
    }).addTo(map);

    framePakistan(map, { animate: false });
    map.attributionControl.setPrefix('');
    map.attributionControl.addAttribution('Boundaries: AI Geo Navigators (2026)');
    const credit = map.attributionControl.getContainer();
    credit.classList.add('agn-cr113');
    const syncCredit = () => {
      const text = credit.textContent.replace(/\s+/g, ' ').trim();
      if (credit.title !== text) credit.title = text;
    };
    syncCredit();
    const creditObs = new MutationObserver(syncCredit);
    creditObs.observe(credit, { childList: true, subtree: true, characterData: true });

    let sizeTimer = 0;
    const fitNational = (animate = false) => {
      framePakistan(map, { animate });
    };
    const bumpSize = () => {
      window.clearTimeout(sizeTimer);
      sizeTimer = window.setTimeout(() => {
        if (mapRef.current !== map || !map._mapPane || map._animatingZoom) return;
        try { map.invalidateSize({ animate: false }); } catch { /* ignore */ }
        /* Re-frame Pakistan only when no place is selected (panel chrome resized the map). */
        if (
          document.body.classList.contains('agn-nat')
          && !document.body.classList.contains('v-card')
          && !document.body.classList.contains('nv-has')
        ) {
          try { fitNational(false); } catch { /* ignore */ }
        }
      }, 120);
    };
    const sizeObs = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(bumpSize)
      : null;
    sizeObs?.observe(map.getContainer());
    const classObs = new MutationObserver(bumpSize);
    classObs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    const fitLabels = () => {
      const zoom = map.getZoom();
      map.getPane('agnLab').querySelectorAll('.pk-prov').forEach((el) => {
        const small = el.classList.contains('r2') || el.classList.contains('r3');
        el.style.visibility = small && zoom < 7 ? 'hidden' : '';
      });
    };
    map.on('zoomend', fitLabels);
    fitLabels();
    map.on('click', (event) => {
      onPickRef.current(event.latlng.lat, event.latlng.lng);
    });

    getJson('/n3/rivers.json').then((rivers) => {
      if (!mapRef.current || !rivers || !Array.isArray(rivers.rivers)) return;
      const group = L.layerGroup().addTo(map);
      rivers.rivers.forEach((river) => {
        const line = (river.coords || []).map(([lon, lat]) => [lat, lon]);
        if (line.length < 2) return;
        L.polyline(line, { color: '#1a6e78', weight: 5, opacity: 0.35, interactive: false }).addTo(group);
        L.polyline(line, { color: '#5ee7ef', weight: 1.6, opacity: 0.95, interactive: false }).addTo(group);
      });
      if (rivers.attribution) map.attributionControl.addAttribution(rivers.attribution);
    }).catch(() => {});

    return () => {
      window.clearTimeout(sizeTimer);
      sizeObs?.disconnect();
      classObs.disconnect();
      creditObs.disconnect();
      map.remove();
      mapRef.current = null;
      surfaceRef.current = null;
      tempRef.current = null;
      hazardRef.current = null;
      pinRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    if (mode !== 'hazard' || !hazardKey) {
      if (hazardRef.current) {
        map.removeLayer(hazardRef.current);
        hazardRef.current = null;
      }
      return undefined;
    }
    if (surfaceRef.current) surfaceRef.current.setOpacity(0.2);
    let cancel = false;
    const geo = tehsilCache ? Promise.resolve(tehsilCache) : getJson('/n3/tehsils.json').then((body) => { tehsilCache = body; return body; });
    Promise.all([geo, getJson(`/api/levels?layer=${encodeURIComponent(hazardKey)}&day=${hazardDay}`)]).then(([features, levels]) => {
      if (cancel || !mapRef.current) return;
      if (hazardRef.current) map.removeLayer(hazardRef.current);
      const values = levels?.levels || {};
      hazardRef.current = L.geoJSON(features, {
        pane: 'agnTemp',
        renderer: map._agnTempRenderer,
        style: (feature) => {
          const level = values[feature.properties?.uid];
          if (level == null || level <= 0) return choroplethStyle(null, level == null ? '#252A2E' : '#3A4240');
          return choroplethStyle(HAZARD_COLOURS[level] || HAZARD_COLOURS[1]);
        },
        onEachFeature: (feature, polygon) => {
          polygon.on('click', (event) => {
            L.DomEvent.stopPropagation(event);
            const props = feature.properties || {};
            onPickRef.current(event.latlng.lat, event.latlng.lng, props.tehsil || props.name);
          });
        },
      }).addTo(map);
    }).catch(() => {});
    return () => { cancel = true; };
  }, [hazardKey, hazardDay, mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    if (mode !== 'hazard' || placeMode) {
      if (surfaceRef.current) {
        map.removeLayer(surfaceRef.current);
        surfaceRef.current = null;
      }
      return undefined;
    }
    let cancel = false;
    onGridRef.current({ kind: 'hazard', ready: false, why: 'loading the hazard surface' });
    getJson(`/api/hazardgrid?day=${day}`).then((grid) => {
      if (cancel || !mapRef.current) return;
      onGridRef.current(grid ? { ...grid, kind: 'hazard' } : { kind: 'hazard', ready: false, why: 'the hazard surface is not available right now' });
      if (!grid || !grid.ready) {
        if (surfaceRef.current) {
          map.removeLayer(surfaceRef.current);
          surfaceRef.current = null;
        }
        return;
      }
      const drawn = drawHazardSurface(grid, NATIONAL, IIOJK);
      if (!drawn) return;
      if (surfaceRef.current) {
        surfaceRef.current.setUrl(drawn.url);
        surfaceRef.current.setBounds(drawn.bounds);
        surfaceRef.current.setOpacity(hazardKey ? 0.2 : 0.95);
      } else {
        surfaceRef.current = L.imageOverlay(drawn.url, drawn.bounds, {
          pane: 'agnSurf', interactive: false, opacity: hazardKey ? 0.2 : 0.95,
        }).addTo(map);
      }
    }).catch(() => {
      if (!cancel) onGridRef.current({ kind: 'hazard', ready: false, why: 'the hazard surface is not available right now' });
    });
    return () => { cancel = true; };
  }, [day, mode, placeMode, hazardKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const dropWeather = () => {
      if (!tempRef.current) return;
      try {
        if (map.hasLayer(tempRef.current)) map.removeLayer(tempRef.current);
      } catch { /* layer already gone */ }
      tempRef.current = null;
    };
    if (mode !== 'weather' || placeMode) {
      dropWeather();
      return undefined;
    }
    return () => { dropWeather(); };
  }, [mode, placeMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || mode !== 'weather' || placeMode) return undefined;
    let cancel = false;
    if (!tempRef.current) {
      onGridRef.current({ kind: 'weather', ready: false, why: 'Loading the temperature forecast…' });
    }
    const geo = tehsilCache ? Promise.resolve(tehsilCache) : getJson('/n3/tehsils.json').then((body) => { tehsilCache = body; return body; });
    Promise.all([geo, getJson(`/api/levels?layer=heat&day=${day}`)]).then(([features, levels]) => {
      if (cancel || !mapRef.current) return;
      if (!tempRef.current) {
        tempRef.current = L.geoJSON(features, {
          pane: 'agnTemp',
          renderer: map._agnTempRenderer,
          style: () => choroplethStyle(null),
          onEachFeature: (feature, polygon) => {
            polygon.on('click', (event) => {
              L.DomEvent.stopPropagation(event);
              const props = feature.properties || {};
              onPickRef.current(event.latlng.lat, event.latlng.lng, props.tehsil || props.name);
            });
          },
        }).addTo(map);
      }
      const values = levels?.values || {};
      const nums = Object.values(values).map(Number).filter(Number.isFinite);
      if (!nums.length) {
        onGridRef.current({ kind: 'weather', ready: false, why: 'Temperature forecast is not available for this day.' });
        return;
      }
      try {
        tempRef.current.eachLayer((polygon) => {
          const uid = polygon.feature?.properties?.uid;
          polygon.setStyle(choroplethStyle(tempCss(values[uid])));
        });
      } catch {
        if (!cancel) onGridRef.current({ kind: 'weather', ready: false, why: 'Temperature forecast is not available right now.' });
        return;
      }
      onGridRef.current({
        kind: 'weather',
        ready: true,
        min: TEMP_LO,
        max: TEMP_HI,
        dataMin: Math.min(...nums),
        dataMax: Math.max(...nums),
        date: levels?.date || null,
        day,
        metric: 'peak',
        unit: levels?.valueUnit || '°C',
      });
    }).catch(() => {
      if (!cancel) onGridRef.current({ kind: 'weather', ready: false, why: 'Temperature forecast is not available right now.' });
    });
    return () => { cancel = true; };
  }, [mode, placeMode, day]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (pinRef.current) {
      map.removeLayer(pinRef.current);
      pinRef.current = null;
    }
    if (!pin) return;
    const fill = placeMode ? '#2F6468' : '#E24B4A';
    const html = `<svg width="36" height="46" viewBox="0 0 36 46" aria-hidden="true"><path d="M18 1a14 14 0 0 0-14 14c0 10 14 30 14 30s14-20 14-30A14 14 0 0 0 18 1z" fill="${fill}" stroke="#fff" stroke-width="2"/><circle cx="18" cy="15" r="5" fill="#fff"/></svg>`;
    pinRef.current = L.marker([pin.lat, pin.lon], {
      icon: L.divIcon({ className: 'nv-pin', html, iconSize: [36, 46], iconAnchor: [18, 44] }),
      interactive: false,
      keyboard: false,
      zIndexOffset: 20000,
    }).addTo(map);
  }, [pin, placeMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fly) return;
    /* National Pakistan view stays framed — only Full details (placeMode) flies in. */
    if (!placeMode) return;
    map.flyTo([fly.lat, fly.lon], 11, { duration: 0.7 });
  }, [fly, placeMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getContainer().style.background = placeMode ? STREETS_EARTH : '#1b1c1f';
    map.getContainer().classList.toggle('place', !!placeMode);
    ['agnMask', 'agnUnder', 'agnSurf', 'agnTemp'].forEach((name) => {
      const pane = map.getPane(name);
      if (pane) pane.style.display = placeMode ? 'none' : '';
    });
    ['agnProv', 'agnFrontier', 'agnLab'].forEach((name) => {
      const pane = map.getPane(name);
      if (pane) pane.style.display = '';
    });
    clearStreetsLock(map, placeMode ? 5 : 2);
    let cancel = false;
    if (placeMode) {
      if (!map._light) {
        /* Full-coverage OSM light tiles — pk-streets left a blank strip past the Pakistan extract. */
        const layer = createOsmBasemap({ maxZoom: 19, attribution: '© OpenStreetMap' });
        if (!cancel && mapRef.current === map && map.getContainer()?.parentNode) {
          layer.addTo(map);
          map._light = layer;
          try { layer.bringToBack(); } catch { /* optional */ }
        }
      } else {
        try { map._light.bringToBack?.(); } catch { /* optional */ }
      }
      try { map.invalidateSize({ animate: false }); } catch { /* ignore */ }
      /* Full details opens on the whole-country frame; search/click then flies in. */
      try { framePakistan(map, { animate: false }); } catch { /* ignore */ }
    } else if (map._light) {
      map.removeLayer(map._light);
      map._light = null;
    }
    return () => { cancel = true; };
  }, [placeMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const zoom = (dir) => () => map[dir]();
    const fitPakistan = () => {
      map.setMinZoom(2);
      try { map.invalidateSize({ animate: false }); } catch { /* ignore */ }
      framePakistan(map, { animate: true });
    };
    const zin = document.getElementById('zin');
    const zout = document.getElementById('zout');
    const pkFit = document.getElementById('pkFit');
    zin?.addEventListener('click', zoom('zoomIn'));
    zout?.addEventListener('click', zoom('zoomOut'));
    pkFit?.addEventListener('click', fitPakistan);
    return () => {
      zin?.removeEventListener('click', zoom('zoomIn'));
      zout?.removeEventListener('click', zoom('zoomOut'));
      pkFit?.removeEventListener('click', fitPakistan);
    };
  }, []);

  return <div id="map" ref={host} role="application" aria-label="Map of Pakistan. Click a point to check it, or a river to see its forecast point." />;
}
