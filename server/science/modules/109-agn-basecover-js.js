
/* v91.17.283.2 · S2 · the street map covers every part of the map that can be shown.
   The local street archive (data/basemap/pk-streets.pmtiles) is a box extract (its header bounds, lon 60.5-78, lat 23.4-37.2): it holds every
   tile that touches the box at each zoom, so the area it can draw grows as the tiles get bigger (zoom 5 data: lon 56.25-78.75, lat 21.9-41;
   zoom 2 data: lon 0-90, lat 0-66.5). The street layer drew nothing outside its own tiles, so the sea stopped at a straight line and the ground
   went blank. Here, two coarser copies of the same archive (its own zoom-4 and zoom-2 tiles, the same paint and label rules) draw only the
   display tiles that the finer layer cannot draw, and the map is held inside the zoom-2 tile (maxBounds, and a minimum zoom at which the
   view fits inside it), so no blank area can be shown at any size or zoom. Same projection and tile grid as the street layer (Leaflet
   EPSG:3857, 256 px display tiles, protomaps-leaflet levelDiff 1): nothing is shifted.
   AGNBaseCover.attach(map, mainLayer, status, make) · make(maxDataZoom, zIndex) returns a protomaps layer with the main layer's rules. */
(function (W) {
  'use strict';
  var LEVEL_DIFF = 1;   /* protomaps-leaflet's default: a display tile at zoom z reads the data tile at z - 1 */
  function lon2x(lon, z) { return Math.floor((lon + 180) / 360 * Math.pow(2, z)); }
  function lat2y(lat, z) { var r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z)); }
  function x2lon(x, z) { return x / Math.pow(2, z) * 360 - 180; }
  function y2lat(y, z) { var n = Math.PI - 2 * Math.PI * y / Math.pow(2, z); return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); }
  /* does a layer whose data stops at maxData have a data tile for display tile c? (the archive holds every tile touching the box) */
  function covers(box, maxData, c) {
    var dz = Math.max(0, Math.min(c.z - LEVEL_DIFF, maxData)), sh = Math.pow(2, Math.max(0, c.z - dz));
    var dx = Math.floor(c.x / sh), dy = Math.floor(c.y / sh);
    return dx >= lon2x(box[0], dz) && dx <= lon2x(box[2], dz) && dy >= lat2y(box[3], dz) && dy <= lat2y(box[1], dz);
  }
  function emptyTile(L, done) { var e = L.DomUtil.create('canvas', 'leaflet-tile'); setTimeout(function () { done(undefined, e); }, 0); return e; }
  /* the area the coarsest layer covers: its data tiles at its own zoom, as a LatLngBounds */
  function coverBounds(L, box, z) {
    var x0 = lon2x(box[0], z), x1 = lon2x(box[2], z), y0 = lat2y(box[3], z), y1 = lat2y(box[1], z);
    return L.latLngBounds([y2lat(y1 + 1, z), x2lon(x0, z)], [y2lat(y0, z), x2lon(x1 + 1, z)]);
  }
  function attach(map, main, st, make, opts) {
    var L = W.L; opts = opts || {};
    var box = st && Array.isArray(st.bounds) && st.bounds.length === 4 && st.bounds.every(isFinite) ? st.bounds.map(Number) : null;
    var mainMax = +(st && st.maxDataZoom) || 15;
    if (!L || !map || !main || !box || box[0] >= box[2] || box[1] >= box[3]) return null;
    var zs = (opts.levels || [4, 2]).filter(function (z) { return z < mainMax; });
    if (!zs.length) return null;
    /* the main layer: a tile it has no data for is left empty (no background fill over the coarser layers) */
    var mo = main.createTile;
    main.createTile = function (c, done) { if (!covers(box, mainMax, c)) return emptyTile(L, done); return mo.call(this, c, done); };
    var finer = [mainMax], under = [];
    zs.forEach(function (z, i) {
      var lay = make(z, Math.max(0, (main.options.zIndex || 1) - 1 - i)); if (!lay) return;
      var higher = finer.slice(), lo = lay.createTile;
      lay.createTile = function (c, done) {
        if (higher.some(function (m) { return covers(box, m, c); })) return emptyTile(L, done);   /* a finer layer draws this tile */
        if (!covers(box, z, c)) return emptyTile(L, done);
        return lo.call(this, c, done); };
      lay.__agnCover = z; under.push(lay); finer.push(z); });
    var B = coverBounds(L, box, zs[zs.length - 1]);
    var keep = { minZoom: map.getMinZoom(), maxBounds: map.options.maxBounds || null, visc: map.options.maxBoundsViscosity };
    function minz() {
      if (!map.hasLayer(main)) return;
      var snap = map.options.zoomSnap || 1, z = map.getBoundsZoom(B, true);
      z = Math.ceil(z / snap - 1e-6) * snap;
      var want = Math.max(keep.minZoom, z); if (Math.abs(map.getMinZoom() - want) > 1e-6) map.setMinZoom(want);
    }
    var ma = main.onAdd, mr = main.onRemove;
    main.onAdd = function (m) { var r = ma.apply(this, arguments);
      under.forEach(function (u) { if (!m.hasLayer(u)) u.addTo(m); });
      m.options.maxBoundsViscosity = 1; m.setMaxBounds(B); minz(); return r; };
    main.onRemove = function (m) { under.forEach(function (u) { if (m.hasLayer(u)) m.removeLayer(u); });
      m.setMaxBounds(keep.maxBounds); m.options.maxBoundsViscosity = keep.visc; m.setMinZoom(keep.minZoom); return mr.apply(this, arguments); };
    map.on('resize', minz);
    if (map.hasLayer(main)) { under.forEach(function (u) { u.addTo(map); }); map.options.maxBoundsViscosity = 1; map.setMaxBounds(B); minz(); }
    var api = { bounds: B, layers: under, box: box, mainMax: mainMax, covers: function (z, c) { return covers(box, z, c); }, minz: minz,
      /* same rules as the main layer after a restyle */
      sync: function () { under.forEach(function (u) { u.paintRules = main.paintRules; u.labelRules = main.labelRules;
        try { if (u.clearLayout) u.clearLayout(); if (u.rerenderTiles) u.rerenderTiles(); } catch (_) {} }); } };
    main.__agnCover = api; return api;
  }
  W.AGNBaseCover = { attach: attach, covers: covers, coverBounds: coverBounds };
})(window);
