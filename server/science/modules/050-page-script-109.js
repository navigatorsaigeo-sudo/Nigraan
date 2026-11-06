

(function () {
  'use strict';
  var G = (typeof window !== 'undefined') ? window : this;
  G.AGN = G.AGN || {};

  var META = null, TEH = null, GRID = null, GRIDMETA = null;

  function payload() {
    if (META) return META;
    var el = document.getElementById('agn-lcz');
    if (!el) throw new Error('AGN.lcz: #agn-lcz payload missing');
    META = JSON.parse(el.textContent);
    TEH = META.tehsils;
    GRIDMETA = META.grid;
    return META;
  }

  

  function grid() {
    if (GRID) return GRID;
    payload();
    var bin = atob(GRIDMETA.data);
    var m = new Map();
    var i = 0, idx = 0, n = bin.length;
    while (i < n) {
      var shift = 0, delta = 0, b;
      do {
        b = bin.charCodeAt(i++);
        delta |= (b & 0x7F) << shift;
        shift += 7;
      } while (b & 0x80);
      idx += delta;
      var cls = bin.charCodeAt(i++);
      var pct = bin.charCodeAt(i++);
      m.set(idx, (cls << 8) | pct);
    }
    GRID = m;
    return GRID;
  }

  var UCP = {
    1:  {svf:0.35, ar:2.50, bsf:0.50, isf:0.45, h:37.5, z0:2.00, dT:3.0},
    2:  {svf:0.45, ar:1.25, bsf:0.50, isf:0.40, h:17.5, z0:0.75, dT:2.5},
    3:  {svf:0.45, ar:1.00, bsf:0.50, isf:0.35, h: 6.5, z0:0.50, dT:2.5},
    4:  {svf:0.65, ar:0.90, bsf:0.30, isf:0.40, h:37.5, z0:2.00, dT:2.0},
    5:  {svf:0.65, ar:0.45, bsf:0.30, isf:0.35, h:17.5, z0:0.50, dT:2.0},
    6:  {svf:0.70, ar:0.45, bsf:0.30, isf:0.25, h: 6.5, z0:0.50, dT:2.0},
    7:  {svf:0.65, ar:1.25, bsf:0.75, isf:0.15, h: 3.0, z0:0.20, dT:2.0},
    8:  {svf:0.90, ar:0.20, bsf:0.45, isf:0.50, h: 6.5, z0:0.30, dT:1.5},
    9:  {svf:0.85, ar:0.15, bsf:0.15, isf:0.15, h: 6.5, z0:0.50, dT:1.0},
    10: {svf:0.75, ar:0.30, bsf:0.25, isf:0.55, h:10.0, z0:1.00, dT:1.5}
  };

  var LCZ_NAME = {
    1:'Compact highrise', 2:'Compact midrise', 3:'Compact lowrise',
    4:'Open highrise', 5:'Open midrise', 6:'Open lowrise',
    7:'Lightweight lowrise', 8:'Large lowrise', 9:'Sparsely built',
    10:'Heavy industry'
  };

  

  var UNAVAILABLE = ['ndvi', 'lst_anomaly_c', 'road_fraction', 'anthropogenic_heat_index'];

  function pointCell(lat, lon) {
    payload();
    var gm = GRIDMETA;
    var row = Math.floor((gm.lat0 - lat) / gm.step);
    var col = Math.floor((lon - gm.lon0) / gm.step);
    if (row < 0 || col < 0) return null;
    var packed = grid().get(row * gm.colStride + col);
    if (packed === undefined) return null;
    return { lcz: packed >> 8, builtPct: packed & 0xFF };
  }

  var lcz = {

    tehsil: function (name, district, province) {
      payload();
      if (!name) return null;
      if (district) {
        var want = (province ? province + '|' : '') + district + '|' + name;
        var hit = null;
        Object.keys(TEH).forEach(function (uid) {
          if (uid === want || uid.slice(-(want.length + 1)) === '|' + want) hit = uid;
        });
        return hit ? Object.assign({ uid: hit }, TEH[hit]) : null;
      }
       
      var matches = Object.keys(TEH).filter(function (uid) {
        return uid.split('|')[2] === name;
      });
      if (matches.length === 1) return Object.assign({ uid: matches[0] }, TEH[matches[0]]);
      if (matches.length === 0) return null;
      return {
        ambiguous: true, name: name,
        candidates: matches.map(function (u) {
          var q = u.split('|');
          return { uid: u, province: q[0], district: q[1] };
        }),
        note: 'Pass the district: AGN.lcz.tehsil(name, district)'
      };
    },

    byUid: function (uid) {
      payload();
      return TEH[uid] ? Object.assign({ uid: uid }, TEH[uid]) : null;
    },

    disputed: function () { payload(); return META.disputed || null; },

    

    point: function (lat, lon) {
      var c = pointCell(lat, lon);
      if (!c) return null;
      var u = UCP[c.lcz];
      if (!u) return null;
      return {
        lcz: c.lcz, name: LCZ_NAME[c.lcz], builtFraction: c.builtPct / 100,
        svf: u.svf, ar: u.ar, bsf: u.bsf, isf: u.isf, h: u.h, z0: u.z0, dT: u.dT
      };
    },

    

    featuresFor: function (lat, lon, tehsilName, district) {
      payload();
      var out = {}, prov = {};
      function put(key, val, tier) {
        if (val === null || val === undefined) return;
        out[key] = val; prov[key] = tier;
      }

      var t = tehsilName ? lcz.tehsil(tehsilName, district) : null;
      if (t && t.ambiguous) t = null;    
      if (t && t.status !== 'ok') t = null;   
      if (t) {
        put('sky_view_factor', t.svf, 'lcz-tehsil');
        put('building_fraction', t.bsf, 'lcz-tehsil');
        put('impervious_fraction', t.isf, 'lcz-tehsil');
        put('mean_building_height_m', t.h, 'lcz-tehsil');
        put('tree_canopy_fraction', t.tree, 'lcz-tehsil');
        put('ventilation_factor', t.vent, 'lcz-tehsil');
        put('distance_to_hills_km', t.hills, 'terrain-tehsil');
      }

      

      var p = (isFinite(lat) && isFinite(lon)) ? lcz.point(lat, lon) : null;
      if (p) {
        put('sky_view_factor', p.svf, 'lcz-point');
        put('building_fraction', p.bsf, 'lcz-point');
        put('impervious_fraction', p.isf, 'lcz-point');
        put('mean_building_height_m', p.h, 'lcz-point');
      }

      return {
        features: out,
        provenance: prov,
        unavailable: UNAVAILABLE.slice(),
        lczPoint: p, lczTehsil: t,
        tier: p ? 'lcz-point' : (t ? 'lcz-tehsil' : 'default'),
        coverage: Object.keys(out).length + ' of 10 features observed'
      };
    },

    

    

    band: function (dT, opts) {
      opts = opts || {};
      if (opts.builtFraction != null && isFinite(opts.builtFraction) && opts.builtFraction < 0.01) {
        return { band: 'negligible built area', grade: 'C', label: 'Under 1 % built surface — no urban heat susceptibility to rank (built-cell class only)' };
      }
      if (dT === null || dT === undefined || !isFinite(dT)) {
        return { band: 'unknown', grade: 'D', label: 'Insufficient morphology data' };
      }
      if (dT >= 2.20) return { band: 'very high', grade: 'B', label: 'Built-cell morphology: very high (S&O class midpoints; the measured urban field is the published number)' };
      if (dT >= 1.80) return { band: 'high',      grade: 'B', label: 'Built-cell morphology: high (S&O class midpoints; the measured urban field is the published number)' };
      if (dT >= 1.30) return { band: 'moderate',  grade: 'C', label: 'Built-cell morphology: moderate (S&O class midpoints; the measured urban field is the published number)' };
      return              { band: 'low',       grade: 'C', label: 'Built-cell morphology: low (S&O class midpoints; the measured urban field is the published number)' };
    },

     
    describe: function (lat, lon, tehsilName, district) {
      var f = lcz.featuresFor(lat, lon, tehsilName, district);
      var raw = tehsilName ? lcz.tehsil(tehsilName, district) : null;
      var dT = f.lczPoint ? f.lczPoint.dT : (f.lczTehsil ? f.lczTehsil.dT : null);
      var _bfr = (raw && !raw.ambiguous && raw.bf != null) ? raw.bf : (f.lczTehsil && f.lczTehsil.bf != null ? f.lczTehsil.bf : null);
      var b = lcz.band(dT, { builtFraction: _bfr });
      return {
        tier: f.tier,
        dataStatus: (raw && !raw.ambiguous) ? raw.status : null,
        ambiguous: !!(raw && raw.ambiguous),
        lcz: f.lczPoint ? f.lczPoint.lcz : (f.lczTehsil ? f.lczTehsil.lcz : null),
        lczName: f.lczPoint ? f.lczPoint.name : (f.lczTehsil ? LCZ_NAME[f.lczTehsil.lcz] : null),
        band: b.band, label: b.label, evidenceGrade: b.grade,
        skyViewFactor: f.features.sky_view_factor,
        builtFraction: f.lczPoint ? f.lczPoint.builtFraction : (f.lczTehsil ? f.lczTehsil.bf : null),
        distanceToHillsKm: f.features.distance_to_hills_km,
        observedFeatures: Object.keys(f.features).length,
        defaultedFeatures: f.unavailable,
        source: 'WUDAPT LCZ v1 100 m + Stewart & Oke (2012) UCPs',
        note: 'Morphology only. Not validated against station observations.'
      };
    },

    stats: function () {
      payload();
      var n = Object.keys(TEH).length;
      return {
        tehsils: n,
        counts: META.counts,
        gridCells: GRIDMETA.n,
        gridDecoded: GRID ? GRID.size : 0,
        lczSource: META.lcz_source,
        unavailable: UNAVAILABLE.slice(),
        caveat: META.caveat
      };
    }
  };

  G.AGN.lcz = lcz;

  function bridge() {
    var uh = G.AGN.urbanHeat;
    if (!uh || uh.__lczBridged) return setTimeout(bridge, 500);
    uh.__lczBridged = true;

    var origMatch = uh.matchProfile;
    uh.matchProfile = function (input) {
      var r = origMatch ? origMatch(input) : { profile: null, distanceKm: null };
      if (r && r.profile) { r.tier = 'expert-profile'; return r; }

      var lat = input && +input.latitude, lon = input && +input.longitude;
      var name = input && (input.tehsil || input.name);
      var dist = input && (input.district || null);
      var f = lcz.featuresFor(lat, lon, name, dist);
      if (f.tier === 'default') { r.tier = 'default'; return r; }

      var pt = f.lczPoint, th = f.lczTehsil;
      return {
        profile: {
          id: 'lcz-' + (pt ? 'point' : 'tehsil'),
          name: name || 'LCZ derived',
          latitude: lat, longitude: lon,
          matchRadiusKm: pt ? 0.5 : null,
          lczCandidate: 'LCZ ' + (pt ? pt.lcz : th.lcz),
          lczLabel: pt ? pt.name : LCZ_NAME[th.lcz],
          profileStatus: pt ? 'lcz_point_100m' : 'lcz_tehsil_mean',
          features: f.features,
          provenance: f.provenance,
          unavailable: f.unavailable
        },
        distanceKm: 0,
        tier: f.tier
      };
    };

    uh.lcz = lcz;
    if (G.console) console.info('[AGN] v83 LCZ layer bridged into urbanHeat.matchProfile');
    refreshSignal();
  }

  

  function ensureCell() {
    var cell = document.getElementById('agnLczCell');
    if (cell) return cell;
    var sig = document.getElementById('uhiSignal');
    var host = sig && sig.closest ? sig.closest('.ops-cell') : null;
    if (!host || !host.parentNode) return null;
    cell = document.createElement('div');
    cell.className = 'ops-cell agn-lcz-cell';
    cell.id = 'agnLczCell';
    cell.innerHTML = '<span>Urban form (LCZ)</span>' +
                     '<b id="agnLczBand">—</b>' +
                     '<em id="agnLczNote">Awaiting a located unit</em>';
    host.parentNode.insertBefore(cell, host.nextSibling);
    return cell;
  }

  

  function activeUnit() {
    try {
      var st = G.AGN.store && G.AGN.store.getState ? G.AGN.store.getState() : null;
      if (!st) return null;
      var loc = st.location || {};
      var out = { tehsil: loc.tehsil || null, district: loc.district || null, lat: null, lon: null };
      var d = st.data || {};
      var sid = loc.stationId;
      var rec = (d.stations && sid && d.stations[sid]) || d.active || d.station || null;
      if (rec) {
        out.lat = +(rec.lat != null ? rec.lat : rec.latitude);
        out.lon = +(rec.lon != null ? rec.lon : rec.longitude);
        if (!out.tehsil) out.tehsil = rec.tehsil || rec.name || null;
        if (!out.district) out.district = rec.district || null;
      }
      if (loc.preview && loc.preview.lat != null) {
        out.lat = +loc.preview.lat; out.lon = +loc.preview.lon;
      }
      return out;
    } catch (_) { return null; }
  }

  function refreshSignal() {
    if (!ensureCell()) return;
    var b = document.getElementById('agnLczBand');
    var n = document.getElementById('agnLczNote');
    if (!b || !n) return;
    var u = activeUnit();
    var hasCoord = u && isFinite(u.lat) && isFinite(u.lon);
    if (!u || (!hasCoord && !u.tehsil)) {
      b.textContent = '—';
      b.setAttribute('data-grade', 'D');
      n.textContent = 'No unit selected';
      return;
    }
    var d = lcz.describe(hasCoord ? u.lat : NaN, hasCoord ? u.lon : NaN, u.tehsil, u.district);
    b.textContent = d.label.replace(' urban heat susceptibility', '');
    b.setAttribute('data-grade', d.evidenceGrade);
    if (d.ambiguous) {
      n.textContent = 'Tehsil name is not unique — district required';
      return;
    }
    if (d.dataStatus && d.dataStatus !== 'ok') {
      n.textContent = (d.dataStatus === 'no_lcz_coverage')
        ? 'No LCZ raster coverage for this tehsil'
        : 'No built-up area detected in this tehsil';
      return;
    }
    

    if (d.tier === 'default' && (d.observedFeatures === 0 || d.observedFeatures == null)) {
      

      var _key = (u && (u.tehsil || u.district)) || null;
      if (!_key) {
        try { var _s = AGN.subject ? AGN.subject.get() : null;
              _key = _s ? (_s.unit || _s.unitUnresolvedName || null) : null; } catch (_) {}
      }
      var _res = null;
      try { _res = (window.AGN && AGN.geo) ? AGN.geo.resolve(_key,
                     { lat:u.lat, lon:u.lon }) : null; } catch (_) {}
       
      if (_res && _res.resolved && _res.key) {
        try {
          

          var _dist = null; try { var _g = AGN.dataServices && AGN.dataServices.require('geography'); _dist = (_g && _g.districtOf(_res.key)) || null; } catch (_) {}
          var _rec = (AGN.lcz && AGN.lcz.tehsil) ? AGN.lcz.tehsil(_res.key, _dist || undefined) : null;
          if (_rec && _rec.status === 'ok') {
            b.textContent = 'LCZ ' + _rec.lcz;
            b.setAttribute('data-grade', 'B');
            n.textContent = 'built fraction ' + (_rec.bf != null ? _rec.bf.toFixed(3) : '\u2014')
              + ' \u00b7 SVF ' + (_rec.svf != null ? _rec.svf.toFixed(2) : '\u2014')
              + ' \u00b7 resolved from the decision subject, not from this card\'s caller'
              + ' \u00b7 built-cell class morphology \u0394T ' + (_rec.dT != null ? _rec.dT.toFixed(2) : '\u2014')
              + ' \u00b0C (Stewart & Oke class midpoints of the built cells only'
              + ((_rec.bf != null && _rec.bf < 0.01) ? '; under 1 % built surface, so no susceptibility is ranked' : '')
              + '); the measured urban field on the urban heat card is the published number';
            return;
          }
        } catch (_) {}
      }
      b.textContent = 'Unit not resolved';
      b.setAttribute('data-grade', 'D');
      n.textContent = _res
        ? (AGN.geo.unresolvedLabel(_res) + ' — morphology is bundled for 553 of 576 tehsils, '
           + 'so this is a lookup failure, not missing data')
        : 'the unit could not be identified — this is a lookup failure, not missing data';
      return;
    }
    n.textContent = (d.lczName || 'no built LCZ') +
      ' · SVF ' + (d.skyViewFactor != null ? d.skyViewFactor.toFixed(2) : '—') +
      ' · ' + d.tier + ' · ' + d.observedFeatures + '/10 observed';
    n.title = 'Susceptibility from surface morphology only, not a temperature and not a forecast. ' +
              d.note + ' Running on defaults: ' + d.defaultedFeatures.join(', ') + '.';
  }

   
    ['agn:data', 'agn:location'].forEach(function (e) {
    document.addEventListener(e, function () { setTimeout(refreshSignal, 200); });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bridge);
  } else { bridge(); }

  (G.AGN.healthParts = G.AGN.healthParts || {}).lcz = function (base) {   /* v91.17.283.20 · B7: a part of the one AGN.health */
    try { base.lcz = lcz.stats(); } catch (e) { base.lcz = 'payload not loaded'; }
  };
})();

