


(function (G) {
  'use strict';
  G.AGN = G.AGN || {};
  var DATA = null;
  try {
    var el = document.getElementById('agn-elev-correction');
    if (el) DATA = JSON.parse(el.textContent);
  } catch (e) { DATA = null; }

  function norm(s) {
    return String(s == null ? '' : s).replace(/-/g, ' ').split(/\s+/).filter(Boolean).join(' ').trim();
  }

  

  function lookup(province, district, tehsil) {
    if (!DATA || !DATA.idx) return null;
    var p = norm(province), d = norm(district), t = norm(tehsil);
    var i = DATA.idx[p + '|' + d + '|' + t];
    if (i === undefined) i = DATA.idx[p + '||' + t];
    if (i === undefined) return null;
    var r = DATA.rows[i];
    if (!r) return null;
    return {
      queryElevation: r[0],
      polygonMean: r[1],
      bands: r[2].slice(),
      nBands: r[2].length,
      refuseSingleValue: !!r[3],
      deltaM: r[1] - r[0],
      impliedBiasC: Math.round((r[1] - r[0]) * 6.5 / 1000 * 100) / 100,
      basis: 'GLO-30 x WorldPop 2020 100 m constrained, population-weighted'
    };
  }

  

  function forCentroid(c) {
    if (!c) return null;
    return lookup(c.province, c.district, c.tehsil || c.key);
  }

  function forKey(key) {
    var C = G.PK_DISTRICT_CENTROIDS || [];
    for (var i = 0; i < C.length; i++) if (C[i] && C[i].key === key) return forCentroid(C[i]);
    return null;
  }

  

  function queryElevation(c) {
    var r = forCentroid(c);
    return r ? r.queryElevation : null;
  }

  

  function resolve(x) {
    if (!x) return null;
    if (typeof x === 'string') return forKey(x);
    if (x.province && (x.tehsil || x.key)) return forCentroid(x);
    if (x.key) return forKey(x.key);
    if (x.name) return forKey(x.name);
    return null;
  }
  function paramFor(x) {
    var r = resolve(x);
    return (r && r.queryElevation != null) ? ('&elevation=' + r.queryElevation) : '';
  }
  function paramForPoints(points) {
    if (!points || !points.length) return '';
    var vals = [], any = false;
    for (var i = 0; i < points.length; i++) {
      var r = resolve(points[i]);
      if (r && r.queryElevation != null) { vals.push(r.queryElevation); any = true; }
      else vals.push('nan');
    }
    return any ? ('&elevation=' + vals.join(',')) : '';
  }

  G.AGN.elevation = {
    resolve: resolve, paramFor: paramFor, paramForPoints: paramForPoints,
    available: !!(DATA && DATA.rows && DATA.rows.length),
    count: DATA ? DATA.n : 0,
    built: DATA ? DATA.built : null,
    source: DATA ? DATA.src : null,
    lookup: lookup, forCentroid: forCentroid, forKey: forKey,
    queryElevation: queryElevation,
    

    points: function (opts) {
      opts = opts || {};
      var C = G.PK_DISTRICT_CENTROIDS || [], out = [];
      for (var i = 0; i < C.length; i++) {
        var c = C[i];
        if (!c || c.lat == null || c.lon == null) continue;
        if (G.IIOJK && c.province === G.IIOJK) continue;
        if (/Illegally/.test(String(c.province || ''))) continue;
        var r = forCentroid(c);
        if (opts.correctedOnly && !r) continue;
        out.push({ key: c.key, lat: c.lat, lon: c.lon,
                   elev: r ? r.queryElevation : null,
                   corrected: !!r,
                   bands: r ? r.bands : null,
                   refuseSingleValue: r ? r.refuseSingleValue : false });
      }
      return out;
    },
    coverage: function () {
      var pts = this.points(), n = pts.length, ok = 0;
      for (var i = 0; i < n; i++) if (pts[i].corrected) ok++;
      return { units: n, corrected: ok, uncorrected: n - ok };
    }
  };
})(window);
