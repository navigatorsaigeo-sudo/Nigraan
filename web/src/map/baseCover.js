import L from 'leaflet';

/* Port of sealed AGNBaseCover (v91.17.283.2): pk-streets.pmtiles is a box extract;
   coarser z4/z2 copies fill display tiles the fine layer cannot draw, and maxBounds
   keeps the view inside the zoom-2 cover so no blank ground shows. */

const LEVEL_DIFF = 1;

function lon2x(lon, z) {
  return Math.floor(((lon + 180) / 360) * (2 ** z));
}

function lat2y(lat, z) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * (2 ** z));
}

function x2lon(x, z) {
  return (x / (2 ** z)) * 360 - 180;
}

function y2lat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / (2 ** z);
  return ((180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
}

export function covers(box, maxData, c) {
  const dz = Math.max(0, Math.min(c.z - LEVEL_DIFF, maxData));
  const sh = 2 ** Math.max(0, c.z - dz);
  const dx = Math.floor(c.x / sh);
  const dy = Math.floor(c.y / sh);
  return dx >= lon2x(box[0], dz) && dx <= lon2x(box[2], dz)
    && dy >= lat2y(box[3], dz) && dy <= lat2y(box[1], dz);
}

function emptyTile(done) {
  const el = L.DomUtil.create('canvas', 'leaflet-tile');
  /* Leaflet tileSize is 256 — leave the bitmap transparent so a world underlay shows through. */
  el.width = 256;
  el.height = 256;
  setTimeout(() => { done(undefined, el); }, 0);
  return el;
}

export function coverBounds(box, z) {
  const x0 = lon2x(box[0], z);
  const x1 = lon2x(box[2], z);
  const y0 = lat2y(box[3], z);
  const y1 = lat2y(box[1], z);
  return L.latLngBounds([y2lat(y1 + 1, z), x2lon(x0, z)], [y2lat(y0, z), x2lon(x1 + 1, z)]);
}

/**
 * @param {L.Map} map
 * @param {L.GridLayer} main main protomaps layer
 * @param {{ bounds?: number[], maxDataZoom?: number }} st /tiles/streets/status
 * @param {(maxDataZoom: number, zIndex: number) => L.GridLayer} make
 * @param {{ levels?: number[] }} [opts]
 */
export function attachBaseCover(map, main, st, make, opts = {}) {
  const box = st && Array.isArray(st.bounds) && st.bounds.length === 4 && st.bounds.every(Number.isFinite)
    ? st.bounds.map(Number)
    : null;
  const mainMax = +(st && st.maxDataZoom) || 15;
  if (!map || !main || !box || box[0] >= box[2] || box[1] >= box[3]) return null;

  const zs = (opts.levels || [4, 2]).filter((z) => z < mainMax);
  if (!zs.length) return null;

  const mo = main.createTile.bind(main);
  main.createTile = function createMainTile(c, done) {
    if (!covers(box, mainMax, c)) return emptyTile(done);
    return mo(c, done);
  };

  const finer = [mainMax];
  const under = [];
  zs.forEach((z, i) => {
    const lay = make(z, Math.max(0, (main.options.zIndex || 1) - 1 - i));
    if (!lay) return;
    const higher = finer.slice();
    const lo = lay.createTile.bind(lay);
    lay.createTile = function createCoverTile(c, done) {
      if (higher.some((m) => covers(box, m, c))) return emptyTile(done);
      if (!covers(box, z, c)) return emptyTile(done);
      return lo(c, done);
    };
    lay.__agnCover = z;
    under.push(lay);
    finer.push(z);
  });

  /* Tile-snapped z2 box spans ~0–90°E — fine for cover painting, useless for maxBounds.
     Lock the camera to the real extract so national zoom cannot show blank ground. */
  const tileBound = coverBounds(box, zs[zs.length - 1]);
  const geoBound = L.latLngBounds([box[1], box[0]], [box[3], box[2]]);
  const lockBound = geoBound;
  const lockView = opts.lockView === true;
  const keep = {
    minZoom: map.getMinZoom(),
    maxBounds: map.options.maxBounds || null,
    visc: map.options.maxBoundsViscosity,
  };

  function minz() {
    if (!map.hasLayer(main)) return;
    const snap = map.options.zoomSnap || 1;
    let z = map.getBoundsZoom(lockBound, true);
    z = Math.ceil(z / snap - 1e-6) * snap;
    const want = Math.max(keep.minZoom, z);
    if (Math.abs(map.getMinZoom() - want) > 1e-6) map.setMinZoom(want);
  }

  const ma = main.onAdd.bind(main);
  const mr = main.onRemove.bind(main);
  main.onAdd = function onAddCover(m) {
    const r = ma(m);
    under.forEach((u) => { if (!m.hasLayer(u)) u.addTo(m); });
    if (lockView) {
      m.options.maxBoundsViscosity = 1;
      m.setMaxBounds(lockBound);
      minz();
    }
    return r;
  };
  main.onRemove = function onRemoveCover(m) {
    under.forEach((u) => { if (m.hasLayer(u)) m.removeLayer(u); });
    m.setMaxBounds(keep.maxBounds);
    m.options.maxBoundsViscosity = keep.visc;
    m.setMinZoom(keep.minZoom);
    return mr(m);
  };

  if (lockView) map.on('resize', minz);
  if (map.hasLayer(main)) {
    under.forEach((u) => { u.addTo(map); });
    if (lockView) {
      map.options.maxBoundsViscosity = 1;
      map.setMaxBounds(lockBound);
      minz();
    }
  }

  const api = {
    bounds: lockView ? lockBound : tileBound,
    layers: under,
    box,
    mainMax,
    covers: (z, c) => covers(box, z, c),
    minz,
    sync() {
      under.forEach((u) => {
        u.paintRules = main.paintRules;
        u.labelRules = main.labelRules;
        try {
          if (u.clearLayout) u.clearLayout();
          if (u.rerenderTiles) u.rerenderTiles();
        } catch { /* ignore */ }
      });
    },
  };
  main.__agnCover = api;
  return api;
}
