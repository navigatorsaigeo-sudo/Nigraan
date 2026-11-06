import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { STREETS_EARTH, clearStreetsLock, createOsmBasemap } from '../map/streetsBasemap.js';
import { getJson } from '../start/api.js';
import { FILLS } from './model.js';

const PAKISTAN = L.latLngBounds([[23.5, 60.8], [37.1, 77.6]]);

function diverging(value) {
  const n = Math.max(-3, Math.min(3, +value || 0));
  if (n >= 1) return '#e8552d';
  if (n <= -1) return '#4c78a8';
  if (n > 0) return '#f6c28b';
  if (n < 0) return '#b9d4ea';
  return '#f4f1ea';
}

function lookOf(uid, province, paint) {
  const disputed = /Jammu Kashmir|Indian Illegally/i.test(province || '');
  if (disputed) return { fill: '#b9a6d8', opacity: 0.55 };
  const value = paint?.values?.[uid];
  if (paint?.kind === 'level') {
    if (typeof value === 'number' && value >= 0) return { fill: FILLS[value] || '#d9d3c7', opacity: 0.72 };
    return { fill: '#efeae2', opacity: 0.45 };
  }
  if (value == null || !Number.isFinite(+value)) return { fill: '#efeae2', opacity: 0.4 };
  if (paint?.kind === 'diverging') return { fill: diverging(value), opacity: 0.72 };
  const [lo, hi] = paint?.range || [0, 1];
  const f = hi > lo ? Math.max(0, Math.min(1, (+value - lo) / (hi - lo))) : 0.5;
  const tone = Math.round(230 - f * 160);
  return { fill: `rgb(${255}, ${tone}, ${Math.round(180 - f * 140)})`, opacity: 0.72 };
}

export default function OverviewMap({ paint, place, sites, onPick }) {
  const host = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const paintRef = useRef(paint);
  const onPickRef = useRef(onPick);
  const markerRef = useRef(null);
  const sitesRef = useRef(null);
  paintRef.current = paint;
  onPickRef.current = onPick;

  useEffect(() => {
    const map = L.map(host.current, { zoomControl: true, attributionControl: true, minZoom: 5, maxZoom: 16 });
    mapRef.current = map;
    map.fitBounds(PAKISTAN, { padding: [12, 12] });
    map.attributionControl.setPrefix('');
    map.getContainer().style.background = STREETS_EARTH;
    clearStreetsLock(map, 5);
    createOsmBasemap({ maxZoom: 19 }).addTo(map);
    map.on('click', (event) => {
      onPickRef.current?.({ lat: event.latlng.lat, lon: event.latlng.lng, name: '' });
    });
    let gone = false;
    getJson('/n3/tehsils.json').then((geo) => {
      if (gone || !geo?.features) return;
      const layer = L.geoJSON(geo, {
        style: (feature) => {
          const props = feature.properties || {};
          const look = lookOf(props.uid, props.province, paintRef.current);
          return { color: '#ffffff', weight: 0.6, fillColor: look.fill, fillOpacity: look.opacity };
        },
        onEachFeature: (feature, polygon) => {
          polygon.on('click', (event) => {
            L.DomEvent.stopPropagation(event);
            const props = feature.properties || {};
            const center = polygon.getBounds().getCenter();
            onPickRef.current?.({
              lat: center.lat,
              lon: center.lng,
              name: props.tehsil || props.key || '',
            });
          });
        },
      }).addTo(map);
      layerRef.current = layer;
    }).catch(() => {});
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => { try { map.invalidateSize({ animate: false }); } catch { /* gone */ } })
      : null;
    if (observer && host.current) observer.observe(host.current);
    return () => {
      gone = true;
      observer?.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.setStyle((feature) => {
      const props = feature?.properties || {};
      const look = lookOf(props.uid, props.province, paint);
      return { color: '#ffffff', weight: 0.6, fillColor: look.fill, fillOpacity: look.opacity };
    });
  }, [paint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !place) return;
    if (markerRef.current) markerRef.current.remove();
    markerRef.current = L.circleMarker([place.lat, place.lon], {
      radius: 7, color: '#fff', weight: 2, fillColor: '#23272c', fillOpacity: 1,
    }).addTo(map);
  }, [place]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (sitesRef.current) sitesRef.current.remove();
    const group = L.layerGroup();
    (sites || []).forEach((site) => {
      const level = site.worst?.level;
      const fill = typeof level === 'number' && level >= 0 ? FILLS[level] : '#f4f7f8';
      const marker = L.marker([site.lat, site.lon], {
        icon: L.divIcon({
          className: 'cz-diamond',
          html: `<i style="background:${fill}"></i>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        }),
      });
      marker.bindTooltip(site.name, { direction: 'top' });
      marker.on('click', (event) => {
        L.DomEvent.stopPropagation(event);
        onPickRef.current?.({ lat: site.lat, lon: site.lon, name: site.name });
      });
      marker.addTo(group);
    });
    group.addTo(map);
    sitesRef.current = group;
  }, [sites]);

  return <div ref={host} className="cz-maphost" role="region" aria-label="Map of Pakistan" />;
}
