import L from 'leaflet';
import { labelRules, leafletLayer, paintRules } from 'protomaps-leaflet';
import { attachBaseCover } from './baseCover.js';

/* Classic OSM-carto-ish Protomaps flavour (beige land, green parks, peach major roads).
   Same local pk-streets MVT — only paint changes. Matches the look users expect from “OSM vector”. */
const EARTH = '#f2efe9';
const OSM = {
  background: EARTH,
  earth: EARTH,
  park_a: '#d9f2cf',
  park_b: '#c8facc',
  wood_a: '#cfe3c4',
  wood_b: '#add19e',
  scrub_a: '#d9e4c3',
  scrub_b: '#c8d7ab',
  zoo: '#d8ebd2',
  glacier: '#ddecec',
  sand: '#f5e9c6',
  beach: '#fff1ba',
  water: '#aad3df',
  ocean_label: '#5a9bb0',
  buildings: '#d9d0c9',
  pedestrian: '#ededed',
  aerodrome: '#e9e7e2',
  runway: '#d6d4cf',
  hospital: '#f4e8e8',
  school: '#f0eee0',
  industrial: '#ebdbe8',
  military: '#f2e4e0',
  pier: '#e0e0e0',
  /* Major / highway: peach–orange like OSM / ArcGIS OSM vector */
  highway: '#f5a15a',
  highway_casing_early: '#c97830',
  highway_casing_late: '#c97830',
  major: '#fdd6a4',
  major_casing_early: '#d4a36a',
  major_casing_late: '#d4a36a',
  link: '#fdd6a4',
  link_casing: '#d4a36a',
  minor_a: '#ffffff',
  minor_b: '#ffffff',
  minor_casing: '#cfcfcf',
  minor_service: '#ffffff',
  minor_service_casing: '#d8d8d8',
  other: '#ffffff',
  railway: '#a7b1b3',
  boundaries: '#adadad',
  tunnel_other_casing: '#e0e0e0',
  tunnel_minor_casing: '#e0e0e0',
  tunnel_link_casing: '#e8c089',
  tunnel_major_casing: '#e8c089',
  tunnel_highway_casing: '#d4894a',
  tunnel_other: '#d5d5d5',
  tunnel_minor: '#d5d5d5',
  tunnel_link: '#f5d4a8',
  tunnel_major: '#f5d4a8',
  tunnel_highway: '#f0b57a',
  bridges_other_casing: '#cfcfcf',
  bridges_minor_casing: '#cfcfcf',
  bridges_link_casing: '#d4a36a',
  bridges_major_casing: '#d4a36a',
  bridges_highway_casing: '#c97830',
  bridges_other: '#ffffff',
  bridges_minor: '#ffffff',
  bridges_link: '#fdd6a4',
  bridges_major: '#fdd6a4',
  bridges_highway: '#f5a15a',
  roads_label_minor: '#6b6568',
  roads_label_minor_halo: '#ffffff',
  roads_label_major: '#5c5558',
  roads_label_major_halo: '#fff8ef',
  subplace_label: '#5c5c5c',
  subplace_label_halo: '#f2efe9',
  city_label: '#3d3d3d',
  city_label_halo: '#f2efe9',
  state_label: '#8a8a8a',
  state_label_halo: '#f2efe9',
  country_label: '#8a8a8a',
  address_label: '#6b6568',
  address_label_halo: '#ffffff',
  pois: {
    blue: '#3B959C', green: '#20834D', lapis: '#47B2B9', pink: '#EF56BA',
    red: '#F2567A', slategray: '#6A5B8F', tangerine: '#CB6704', turquoise: '#00C3D4',
  },
  landcover: {
    grassland: 'rgba(210, 239, 207, 1)',
    barren: 'rgba(255, 243, 215, 1)',
    urban_area: 'rgba(230, 226, 221, 1)',
    farmland: 'rgba(238, 240, 213, 1)',
    glacier: 'rgba(221, 236, 236, 1)',
    scrub: 'rgba(217, 228, 195, 1)',
    forest: 'rgba(200, 220, 185, 1)',
  },
};

function streetRules() {
  const paint = paintRules(OSM).filter((rule) => rule.dataLayer !== 'boundaries');
  const labels = labelRules(OSM, 'en').map((rule) => {
    if (rule.dataLayer !== 'places') return rule;
    const prior = rule.filter;
    return {
      ...rule,
      filter(z, ft) {
        const kind = ft?.props?.kind;
        if (kind === 'country' || kind === 'region') return false;
        return prior ? prior(z, ft) : true;
      },
    };
  });
  return { paint, labels };
}

function ensureLeafletGlobal() {
  if (typeof window !== 'undefined') window.L = L;
}
ensureLeafletGlobal();

function makeLayer(url, rules, maxDataZoom, extra = {}) {
  return leafletLayer({
    url,
    paintRules: rules.paint,
    labelRules: rules.labels,
    maxDataZoom,
    maxZoom: 19,
    ...extra,
  });
}

/**
 * Build the sealed HTML streets basemap (pk-streets + AGNBaseCover).
 * Pass the Leaflet map so cover layers and maxBounds match NIGRAAN_3.
 * Does not addTo — caller adds after abort checks.
 */
export async function createStreetsBasemap(map, opts = {}) {
  ensureLeafletGlobal();
  let status = null;
  try {
    const res = await fetch('/tiles/streets/status', { cache: 'no-store' });
    status = res.ok ? await res.json() : null;
  } catch {
    status = null;
  }
  if (!(status?.ready && status.template)) return { kind: 'none', layer: null };

  const rules = streetRules();
  const fallback = /Protomaps/.test(status.attribution || '')
    ? status.attribution
    : `${status.attribution || '© OpenStreetMap contributors'} · Protomaps`;
  const attr = opts.attribution != null ? opts.attribution : fallback;
  const url = `${window.location.origin}${status.template}`;
  const layer = makeLayer(url, rules, status.maxDataZoom, { attribution: attr });

  if (map) {
    try {
      /* lockView off by default — hard maxBounds + viscosity 1 freezes pan at national zoom.
         Pass lockView: true only where blank tiles outside the cover must be unreachable. */
      attachBaseCover(map, layer, status, (z, zi) => makeLayer(url, rules, z, { zIndex: zi, attribution: '' }), { lockView: opts.lockView === true });
    } catch { /* cover optional */ }
  }

  return { kind: 'streets', layer, status };
}

/** Create + add streets; no-ops if map was torn down mid-flight. */
export async function addStreetsBasemap(map) {
  if (!map) return { kind: 'none', layer: null };
  map.getContainer().style.background = EARTH;
  const result = await createStreetsBasemap(map);
  if (!result.layer) return result;
  if (!map.getContainer()?.parentNode) return { kind: 'none', layer: null };
  result.layer.addTo(map);
  return result;
}

/**
 * Full-coverage OSM basemap (same-origin /tiles/v5/light — Esri/OSM chain).
 * Use this instead of pk-streets wherever the view can pan past the Pakistan extract.
 */
export const OSM_LIGHT_URL = '/tiles/v5/light/{z}/{x}/{y}';
export const OSM_ATTR = '© OpenStreetMap contributors';

export function createOsmBasemap(opts = {}) {
  return L.tileLayer(OSM_LIGHT_URL, {
    maxZoom: opts.maxZoom ?? 19,
    attribution: opts.attribution != null ? opts.attribution : OSM_ATTR,
    className: opts.className || 'agn-osm-light',
  });
}

/** Drop pk-streets lock (maxBounds / raised minZoom) if a prior session left them on. */
export function clearStreetsLock(map, minZoom = 4) {
  if (!map) return;
  try {
    map.setMaxBounds(null);
    map.options.maxBoundsViscosity = 0;
    map.setMinZoom(minZoom);
  } catch { /* map mid-teardown */ }
}

export const STREETS_EARTH = EARTH;
