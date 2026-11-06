


(function (G) {
  'use strict';
  var D = G.document, AGN = G.AGN = G.AGN || {};
  if (!AGN.intake) return;
  function P() { try { return AGN.project && AGN.project.state ? AGN.project.state() : null; } catch (_) { return null; } }

  

  function num(v) { return AGN.parse.numberOrNull(v); }
  function nowIso() { return new Date().toISOString(); }

  

  function ensureSampleAssets(wantId) {
    var p = P(); if (!p) return null;
    var did = null;
    if (!(Array.isArray(p.assets) && p.assets.length)) {
      if (!(AGN.demo && AGN.demo.load)) return { did: 'No assets in this project and the sample loader '
                              + 'is not present, so nothing could be set up first.' };
      try { AGN.demo.load(); } catch (_) { return null; }
      var n = ((P() || {}).assets || []).length;
      if (!n) return null;
      did = 'Loaded the sample client first (' + n + ' assets), then';
    }
    

    p = P();
    if (p && !p.company.active_asset_id && (p.assets || []).length) {
      var pick = wantId
        ? (p.assets.filter(function (a) { return String(a.asset_id || '') === String(wantId); })[0] || null)
        : null;
      if (pick && AGN.project && AGN.project.setActiveAsset) {
        AGN.project.setActiveAsset(pick.asset_id);
        did = did ? (did + ' made "' + (pick.name || pick.asset_id) + '" the active asset, then')
                  : ('Made "' + (pick.name || pick.asset_id) + '" the active asset, then');
      }
    }
    return did ? { did: did } : null;
  }
  

  try { AGN.intake.ensureSampleAssets = ensureSampleAssets; } catch (_) {}

   
  AGN.intake.register({
    key: 'spatial',
    label: 'Site coordinates',
    columns: [
      { name: 'name',         required: true },
      { name: 'latitude',     required: true },
      { name: 'longitude',    required: true },
      { name: 'feature_type', required: false },
      { name: 'asset_id',     required: false }
    ],
    sample: [
       
      { name: 'Karachi port warehouse boundary marker', latitude: '24.8570', longitude: '67.0060',
        feature_type: 'site', asset_id: 'DEMO-A3' },
      { name: 'Fire-water tank intake',  latitude: '24.8640', longitude: '67.0140',
        feature_type: 'intake',  asset_id: 'DEMO-A3' },
      { name: 'Yard drain outfall', latitude: '24.8580', longitude: '67.0150',
        feature_type: 'outfall', asset_id: 'DEMO-A3' }
    ],
    prepare: function () { return ensureSampleAssets('DEMO-A3'); },
    validate: function (o) {
      if (!P()) return 'no client project is open';
      var lat = num(o.latitude), lon = num(o.longitude);
      if (lat === null) return 'latitude must be a number';
      if (lon === null) return 'longitude must be a number';
      if (lat < -90 || lat > 90) return 'latitude ' + lat + ' is outside -90..90';
      if (lon < -180 || lon > 180) return 'longitude ' + lon + ' is outside -180..180';
      

      var id = String(o.asset_id || '').trim();
      if (id) {
        var hit = ((P().assets) || []).filter(function (a) {
          return String(a.asset_id || '') === id; })[0];
        if (!hit) return 'no asset with id "' + id + '" in this project';
      }
      return null;
    },
    add: function (o) {
      var p = P();
      var lat = num(o.latitude), lon = num(o.longitude);
      var outside = (lat < PK_BOX.latMin || lat > PK_BOX.latMax ||
                     lon < PK_BOX.lonMin || lon > PK_BOX.lonMax);
      p.spatial_inputs = Array.isArray(p.spatial_inputs) ? p.spatial_inputs : [];
      AGN.decisionCase.write('spatial_inputs', {
        kind: 'client_point',
        source: 'client point intake / operator-entered coordinate',
        decision_case_id: (AGN.decisionCase && AGN.decisionCase.id
                            ? AGN.decisionCase.id() : null),
        name: String(o.name).trim(),
        latitude: lat, longitude: lon,
        feature_type: String(o.feature_type || '').trim() || null,
        asset_id: String(o.asset_id || '').trim() || null,
        outside_national_grid: outside,
        coverage_note: outside
          ? 'outside the Pakistan national grid this build screens; held as a location, not scored'
          : null,
        crs: 'EPSG:4326',
        source: 'csv intake',
        created_at: nowIso()
      });
    }
  });

   
})(window);
