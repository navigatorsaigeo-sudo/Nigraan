import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { STREETS_EARTH, clearStreetsLock, createOsmBasemap } from '../map/streetsBasemap.js';
import { getJson } from '../start/api.js';
import { CANNOT, GLOF_EXPOSURE, LEVEL_COLOURS, UNTESTED } from './layers.js';
import { heatStyle, outlookCanPaint, outlookKeyHtml, outlookStyle, useMapOverlays } from './mapOverlays.js';
/* National Overview framing — Pakistan centered at this zoom. */
const PAKISTAN_VIEW = { center: [29.85, 69.35], zoom: 5.5 };
const SATELLITE = '/tiles/v5/imagery/{z}/{x}/{y}';

function fitPakistan(map) {
  /* Dev StrictMode removes the map and a leftover frame can still call this. setView then reads a pane that is gone. */
  if (!map || map._removed || !map._mapPane || !map.getContainer()?.isConnected) return;
  try {
    map.invalidateSize({ animate: false });
    map.setView(PAKISTAN_VIEW.center, PAKISTAN_VIEW.zoom, { animate: false });
  } catch { /* map was removed mid-frame */ }
}

function lookOf(level, exposure, palette) {
  const lake = GLOF_EXPOSURE[exposure];
  if (lake) return { fill: lake.colour, opacity: 0.84, dash: null };
  if (typeof level === 'number' && level >= 0) return { fill: palette[level] || UNTESTED, opacity: 0.78, dash: null };
  if (level === -4) return { fill: CANNOT, opacity: 0.72, dash: '2 3' };
  return { fill: UNTESTED, opacity: 0.38, dash: null };
}

export default function AnalystMap({ levels, exposure, palette, selectedUid, place, onPick, basemap, terrain, focus, focusKey, popOpen, onEngage, card, onForecast, drawing, corners, siteSamples, fitSiteKey, onCorner, onFinishDraw, overlays, outlook, day }) {
  const host = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const levelsRef = useRef(levels || {});
  const exposureRef = useRef(exposure || {});
  const paletteRef = useRef(palette || LEVEL_COLOURS);
  const viewRef = useRef({});
  const [mapReady, setMapReady] = useState(0);
  const tilesRef = useRef(null);
  const shadeRef = useRef(null);
  const onPickRef = useRef(onPick);
  const popOpenRef = useRef(popOpen);
  const onEngageRef = useRef(onEngage);
  const onForecastRef = useRef(onForecast);
  const onCornerRef = useRef(onCorner);
  const onFinishDrawRef = useRef(onFinishDraw);
  const drawingRef = useRef(drawing);
  const clickTimer = useRef(0);
  const fittedRef = useRef('');
  onPickRef.current = onPick;
  popOpenRef.current = popOpen;
  onEngageRef.current = onEngage;
  onForecastRef.current = onForecast;
  onCornerRef.current = onCorner;
  onFinishDrawRef.current = onFinishDraw;
  drawingRef.current = drawing;
  levelsRef.current = levels || {};
  exposureRef.current = exposure || {};
  paletteRef.current = palette?.length ? palette : LEVEL_COLOURS;
  viewRef.current = { focus, selectedUid, place };

  useEffect(() => {
    const map = L.map(host.current, { zoomControl: true, attributionControl: true, minZoom: 4, maxZoom: 14, zoomSnap: 0.5, zoomDelta: 0.5 });
    mapRef.current = map;
    map.getContainer().style.background = '#d5e3ea';
    fitPakistan(map);
    map.getContainer().addEventListener('click', (event) => {
      if (!event.target.closest('[data-forecast]')) return;
      event.preventDefault();
      event.stopPropagation();
      onForecastRef.current?.();
    }, true);
    map.attributionControl.setPrefix('');
    map.attributionControl.addAttribution('Boundaries: AI Geo Navigators · model data · AGN 2026');
    const bumpSize = () => {
      try { map.invalidateSize({ animate: false }); } catch { /* map may be gone */ }
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(bumpSize) : null;
    if (ro && host.current) {
      ro.observe(host.current);
      if (host.current.parentElement) ro.observe(host.current.parentElement);
    }
    map._agnRo = ro;
    const frame = requestAnimationFrame(() => {
      if (map._removed || mapRef.current !== map) return;
      bumpSize();
      if (viewRef.current?.focus === 'pk' || !viewRef.current?.place) fitPakistan(map);
    });
    /* Layout settles after sidebars/fonts — size only, never change zoom here. */
    const sizeTimers = [50, 200, 500].map((ms) => setTimeout(bumpSize, ms));
    map._agnSizeTimers = sizeTimers;
    map._agnFrame = frame;
    map.on('click', (event) => {
      if (!drawingRef.current) return;
      L.DomEvent.stopPropagation(event);
      clearTimeout(clickTimer.current);
      const point = { lat: event.latlng.lat, lon: event.latlng.lng };
      clickTimer.current = setTimeout(() => onCornerRef.current?.(point), 220);
    });
    map.on('dblclick', (event) => {
      if (!drawingRef.current) return;
      L.DomEvent.stopPropagation(event);
      L.DomEvent.preventDefault(event);
      clearTimeout(clickTimer.current);
      onCornerRef.current?.({ lat: event.latlng.lat, lon: event.latlng.lng });
      onFinishDrawRef.current?.();
    });

    let cancel = false;
    getJson('/n3/tehsils.json').then((geo) => {
      if (cancel || !mapRef.current) return;
      const group = L.geoJSON(geo, {
        style: (feature) => styleOf(feature.properties?.uid, levelsRef.current, exposureRef.current, paletteRef.current),
        onEachFeature: (feature, polygon) => {
          polygon.on('click', (event) => {
            if (drawingRef.current) return;
            L.DomEvent.stopPropagation(event);
            const props = feature.properties || {};
            onPickRef.current({
              lat: event.latlng.lat,
              lon: event.latlng.lng,
              name: props.tehsil || props.name || 'Tehsil',
              area: [props.district, props.province].filter(Boolean).join(', '),
              uid: props.uid,
            });
          });
        },
      }).addTo(map);
      layerRef.current = group;
      paint(group, levelsRef.current, exposureRef.current, paletteRef.current);
      showSelection(map, group, viewRef.current);
      setMapReady(1);
    }).catch(() => {});

    return () => {
      cancel = true;
      try { map._agnRo?.disconnect(); } catch { /* ignore */ }
      try { (map._agnSizeTimers || []).forEach(clearTimeout); } catch { /* ignore */ }
      try { cancelAnimationFrame(map._agnFrame); } catch { /* ignore */ }
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      tilesRef.current = null;
      shadeRef.current = null;
    };
  }, []);

  const overlayState = useMapOverlays(mapRef, layerRef, mapReady, overlays || {}, outlook, day || 0);
  const heat = overlayState.heat;

  useEffect(() => {
    const group = layerRef.current;
    if (!group) return;
    const quiet = (polygon) => {
      const look = styleOf(polygon.feature?.properties?.uid, levels || {}, exposure || {}, paletteRef.current);
      polygon.setStyle({ ...look, color: 'rgba(21,74,78,.30)', weight: 0.5, fillOpacity: 0 });
    };
    if (outlookCanPaint(outlook)) {
      group.eachLayer((polygon) => {
        polygon.setStyle({ color: 'rgba(22,48,51,.45)', weight: 0.55, fillOpacity: 0, fillColor: 'transparent' });
      });
      return;
    }
    if (overlays?.temp) {
      group.eachLayer(quiet);
      return;
    }
    if (overlays?.heatindex && heat?.levels) {
      group.eachLayer((polygon) => {
        const next = heatStyle(polygon.feature?.properties?.uid, heat);
        polygon.setStyle({ ...next, color: next.color, weight: next.weight, fillColor: next.fillColor, fillOpacity: next.fillOpacity, dashArray: next.dashArray });
      });
      return;
    }
    paint(group, levels || {}, exposure || {}, paletteRef.current);
  }, [levels, exposure, palette, outlook, overlays?.temp, overlays?.heatindex, heat, mapReady, overlayState.scalesTick]);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return undefined;
    const clear = () => {
      if (map._outlook) { map.removeLayer(map._outlook); map._outlook = null; }
      map.getContainer().querySelector('#agnOlKey84')?.remove();
    };
    if (!outlookCanPaint(outlook)) {
      clear();
      return undefined;
    }
    if (!map.getPane('agnOutlook')) {
      const node = map.createPane('agnOutlook');
      node.style.zIndex = '395';
      node.style.pointerEvents = 'none';
    }
    const features = [];
    group.eachLayer((layer) => { if (layer.feature) features.push(layer.feature); });
    clear();
    map._outlook = L.geoJSON({ type: 'FeatureCollection', features }, {
      pane: 'agnOutlook',
      interactive: false,
      filter: (feature) => !/Indian Illegally Occupied|Jammu Kashmir/i.test(feature?.properties?.province || ''),
      style: (feature) => outlookStyle(outlook, feature?.properties?.uid),
    }).addTo(map);
    const key = document.createElement('div');
    key.id = 'agnOlKey84';
    key.setAttribute('role', 'region');
    key.setAttribute('aria-label', 'Outlook layer key');
    key.innerHTML = outlookKeyHtml(outlook);
    map.getContainer().appendChild(key);
    L.DomEvent.disableClickPropagation(key);
    L.DomEvent.disableScrollPropagation(key);
    return clear;
  }, [outlook, mapReady, overlayState.scalesTick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const clearTiles = () => {
      if (tilesRef.current) {
        try { map.removeLayer(tilesRef.current); } catch { /* already gone */ }
        tilesRef.current = null;
      }
    };
    clearTiles();
    clearStreetsLock(map, 4);
    if (basemap === 'satellite') {
      tilesRef.current = L.tileLayer(SATELLITE, { maxZoom: 14 }).addTo(map);
      tilesRef.current.bringToBack();
      if (layerRef.current) layerRef.current.bringToFront();
      return undefined;
    }
    /* World OSM (same-origin light tiles) — pk-streets extract left blank sides and lockView blocked zoom-out. */
    map.getContainer().style.background = STREETS_EARTH;
    const layer = createOsmBasemap({ maxZoom: 19 });
    layer.addTo(map);
    tilesRef.current = layer;
    try { layer.bringToBack(); } catch { /* optional */ }
    if (layerRef.current) layerRef.current.bringToFront();
    try { map.invalidateSize({ animate: false }); } catch { /* ignore */ }
    if (viewRef.current?.focus === 'pk' || !viewRef.current?.place) fitPakistan(map);
    return undefined;
  }, [basemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (shadeRef.current) {
      map.removeLayer(shadeRef.current);
      shadeRef.current = null;
    }
    if (!terrain) return;
    shadeRef.current = L.tileLayer('/tiles/hillshade/{z}/{x}/{y}.png', { maxZoom: 12, opacity: 0.45 }).addTo(map);
    if (layerRef.current) layerRef.current.bringToFront();
  }, [terrain]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    showSelection(map, layerRef.current, { focus, selectedUid, place });
  }, [focus, focusKey, selectedUid, place, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!place) {
      if (map._pin) { map.removeLayer(map._pin); map._pin = null; }
      map._pinKey = '';
      return;
    }
    const key = `${Number(place.lat).toFixed(5)},${Number(place.lon).toFixed(5)}`;
    const moved = map._pinKey !== key;
    if (moved) {
      if (map._pin) map.removeLayer(map._pin);
      const marker = L.marker([place.lat, place.lon], {
        zIndexOffset: 1200,
        icon: L.divIcon({
          className: 'ov-pin',
          html: `<span class="dot"></span><span class="lab">${place.name || ''}</span>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        }),
      });
      marker.on('click', (event) => {
        L.DomEvent.stopPropagation(event);
        if (popOpenRef.current) marker.openPopup();
        else onEngageRef.current?.();
      });
      marker.addTo(map);
      map._pin = marker;
      map._pinKey = key;
      map._pinOpened = false;
    } else if (map._pin) {
      const el = map._pin.getElement()?.querySelector('.lab');
      if (el && place.name) el.textContent = place.name;
    }
    const marker = map._pin;
    if (!marker) return;
    if (card && popOpen) {
      const html = popupHtml(card);
      const opts = {
        maxWidth: 280,
        minWidth: 248,
        className: 'ov-pop',
        autoPan: true,
        autoPanPadding: [28, 28],
        keepInView: true,
      };
      if (marker.getPopup()) marker.setPopupContent(html);
      else marker.bindPopup(html, opts);
      // Open once after a search or a click. The automatic current location stays a marker only.
      if (!map._pinOpened) {
        marker.openPopup();
        map._pinOpened = true;
      }
    } else if (!popOpen && marker.isPopupOpen()) {
      marker.closePopup();
    }
  }, [place, card, outlook, popOpen]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map._ring) { map.removeLayer(map._ring); map._ring = null; }
    if (map._ringMarks) { map.removeLayer(map._ringMarks); map._ringMarks = null; }
    if (!corners?.length) {
      fittedRef.current = '';
      return;
    }
    const latlngs = corners.map((point) => [point.lat, point.lon]);
    if (corners.length >= 3 && !drawing) {
      map._ring = L.featureGroup([
        L.polygon(latlngs, { color: '#ffffff', weight: 7, opacity: 0.95, fill: false, interactive: false }),
        L.polygon(latlngs, { color: '#154A4E', weight: 3.2, dashArray: '8 5', fillColor: '#154A4E', fillOpacity: 0.1, interactive: false }),
      ]).addTo(map);
      const samples = Array.isArray(siteSamples) ? siteSamples : [];
      if (samples.length) {
        map._ringMarks = L.layerGroup(samples.map((point) => L.circleMarker([point.lat, point.lon], {
          radius: 4, color: '#ffffff', weight: 1.5, fillColor: '#154A4E', fillOpacity: 1, interactive: false,
        }))).addTo(map);
      }
      if (fitSiteKey && fittedRef.current !== fitSiteKey) {
        fittedRef.current = fitSiteKey;
        try {
          const padRight = Math.min(440, map.getSize().x * 0.45);
          map.fitBounds(L.latLngBounds(latlngs), {
            paddingTopLeft: [60, 60],
            paddingBottomRight: [padRight, 90],
            maxZoom: 16,
            animate: false,
          });
        } catch { /* bounds may be empty */ }
      }
    } else {
      fittedRef.current = '';
      map._ringMarks = L.layerGroup(latlngs.map((ll) => L.circleMarker(ll, {
        radius: 4, color: '#154A4E', weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false,
      }))).addTo(map);
      map._ring = L.polyline(latlngs, { color: '#154A4E', weight: 2.4, dashArray: '5 4', interactive: false }).addTo(map);
    }
  }, [corners, drawing, siteSamples, fitSiteKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const el = map.getContainer();
    if (drawing) {
      el.classList.add('ov-drawing');
      try { map.doubleClickZoom.disable(); } catch { /* map may not be ready */ }
    } else {
      el.classList.remove('ov-drawing');
      try { map.doubleClickZoom.enable(); } catch { /* map may not be ready */ }
    }
    return () => {
      el.classList.remove('ov-drawing');
      try { map.doubleClickZoom.enable(); } catch { /* ignore */ }
    };
  }, [drawing, mapReady]);

  return <div className="ov-map" ref={host} />;
}

function styleOf(uid, levels, exposure, palette) {
  const look = lookOf(levels?.[uid], exposure?.[uid], palette);
  return { color: 'rgba(22,48,51,.45)', weight: 0.6, fillColor: look.fill, fillOpacity: look.opacity, dashArray: look.dash };
}

function paint(group, levels, exposure, palette) {
  group.eachLayer((polygon) => {
    polygon.setStyle(styleOf(polygon.feature?.properties?.uid, levels, exposure, palette));
  });
}

function showSelection(map, group, view) {
  if (map._sel) {
    map.removeLayer(map._sel);
    map._sel = null;
  }
  const featureLayer = view.selectedUid && group
    ? group.getLayers().find((layer) => layer.feature?.properties?.uid === view.selectedUid)
    : null;
  if (featureLayer?.feature) {
    if (!map.getPane('agnSel')) {
      const pane = map.createPane('agnSel');
      pane.style.zIndex = '450';
      pane.style.pointerEvents = 'none';
    }
    const feature = { type: 'Feature', properties: {}, geometry: featureLayer.feature.geometry };
    const line = { pane: 'agnSel', interactive: false, style: { fill: false, lineJoin: 'round', lineCap: 'round' } };
    map._sel = L.featureGroup([
      L.geoJSON(feature, { ...line, style: { ...line.style, color: '#ffffff', weight: 7, opacity: 0.95 } }),
      L.geoJSON(feature, { ...line, style: { ...line.style, color: '#0C3851', weight: 3.5, opacity: 1 } }),
    ]).addTo(map);
  }
  if (view.focus === 'pk' || (!featureLayer && !view.place)) {
    fitPakistan(map);
    return;
  }
  if (view.focus === 'prov' && featureLayer && group) {
    const province = featureLayer.feature?.properties?.province;
    const bounds = L.latLngBounds([]);
    group.eachLayer((layer) => {
      if (layer.feature?.properties?.province === province && layer.getBounds) bounds.extend(layer.getBounds());
    });
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [28, 28], animate: false });
      return;
    }
  }
  if ((view.focus === 'teh' || view.focus === 'place') && featureLayer?.getBounds) {
    map.fitBounds(featureLayer.getBounds(), { padding: [36, 36], maxZoom: 11, animate: false });
    return;
  }
  if (view.place) map.flyTo([view.place.lat, view.place.lon], view.focus === 'prov' ? 7 : 10, { duration: 0.35 });
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function popupHtml(card) {
  const cell = (label, value) => `<div><em>${label}</em><b>${esc(value)}</b></div>`;
  const body = card.loading
    ? '<p class="wait">Reading current weather…</p>'
    : card.temp == null
      ? '<p class="wait">Current weather is not available here.</p>'
      : `<div class="hero"><b>${esc(card.temp)}°</b><span><i>${esc(card.sky)}</i>${card.feels == null ? '' : `Feels ${esc(card.feels)}°`}</span></div><div class="wx">${cell('Humidity', card.rh == null ? '—' : `${card.rh}%`)}${cell('Wind', card.wind == null ? '—' : `${card.wind} km/h`)}${cell('Rain', card.rain == null ? '—' : `${card.rain} mm`)}${cell('Cloud', card.cloud == null ? '—' : `${card.cloud}%`)}</div>`;
  return `<div class="ov-pop-in"><p class="where">${esc(card.title)}</p>${card.where ? `<p class="sub">${esc(card.where)}</p>` : ''}${body}<button type="button" data-forecast="1">Detailed forecast</button></div>`;
}
