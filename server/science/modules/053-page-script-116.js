


(function (G) {
  'use strict';
  G.AGN = G.AGN || {};

  

  

  var MODELS = [
    'ecmwf_ifs025', 'ecmwf_aifs025_single', 'ncep_aigfs025', 'gfs_seamless',
    'icon_seamless', 'gem_seamless', 'ukmo_seamless', 'meteofrance_seamless',
    'jma_seamless'
  ];
  
  var FAMILY = { ecmwf_ifs025: 'ecmwf', ecmwf_aifs025_single: 'ecmwf', ncep_aigfs025: 'noaa', gfs_seamless: 'noaa', icon_seamless: 'dwd', gem_seamless: 'eccc', ukmo_seamless: 'ukmo', meteofrance_seamless: 'meteofrance', jma_seamless: 'jma' };
  var ML = { ecmwf_aifs025_single: 1, ncep_aigfs025: 1 };
  

  var SKILL = { cells: null, tried: false };
  function loadSkill() {
    if (SKILL.tried) return; SKILL.tried = true;
    try { if (!/^https?:$/.test(location.protocol)) return; } catch (_) { return; }
    try { fetch('/api/pool/skill', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.cells) SKILL.cells = j.cells; }).catch(function () {}); } catch (_) {}
  }
  function skillCell(elev, timeISO, hourIndex, variable) {
    if (!SKILL.cells) return null;
    var zone = (isFinite(num(elev)) && num(elev) >= 1000) ? 'mountain' : 'plains';
    var mo = timeISO ? Number(String(timeISO).slice(5, 7)) : (new Date().getMonth() + 1);
    var season = (mo === 12 || mo <= 2) ? 'DJF' : mo <= 5 ? 'MAM' : mo <= 8 ? 'JJA' : 'SON';
    var lead = Math.min(3, Math.max(1, Math.floor((hourIndex || 0) / 24) + 1));
    var key = zone + '|' + season + '|' + lead + '|' + variable, c = SKILL.cells[key];
    return (c && c.weights) ? { key: key, weights: c.weights, stations: c.stations } : null;
  }
  try { loadSkill(); } catch (_) {}

   
  var TIER = {
    MULTI:   'multi-model',    
    SINGLE:  'single-model',   
    CLIMATE: 'climatology',    
    ABSENT:  'unavailable'     
  };

  function num(v) {
    if (v === null || v === undefined || v === '') return NaN;
    if (typeof v === 'string' && !v.trim()) return NaN;
    return Number(v);
  }

  

  function quantile(sorted, q) {
    if (!sorted.length) return null;
    if (sorted.length === 1) return sorted[0];
    var pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  

  function stat(values, models, skill) {
    var raw = (values || []).map(num);
    var pts = [];
    for (var i = 0; i < raw.length; i++) if (isFinite(raw[i])) pts.push({ x: raw[i], m: (models && models[i]) || null });
    if (!pts.length) return { n: 0, median: null, iqr: null, min: null, max: null, range: null, families: 0 };
     
    var fam = {}, nf = 0;
    pts.forEach(function (p) { var f = (p.m && FAMILY[p.m]) || p.m || ('m' + Math.random()); p.f = f; if (!fam[f]) { fam[f] = 0; nf++; } fam[f]++; });
    pts.forEach(function (p) { p.w = (1 / nf) / fam[p.f]; });
     
    var skilled = false;
    if (skill && skill.weights) {
      var sw = 0, sn = 0; pts.forEach(function (p) { var w = num(skill.weights[p.m]); if (isFinite(w) && w > 0) { sn++; sw += w; } });
      if (sn >= 3 && sw > 0) { skilled = true; pts.forEach(function (p) { var w = num(skill.weights[p.m]); p.w = (isFinite(w) && w > 0) ? w / sw : 0; }); }
    }
    pts.sort(function (a, b) { return a.x - b.x; });
    var wq = function (q) { var acc = 0; for (var k = 0; k < pts.length; k++) { acc += pts[k].w; if (acc >= q - 1e-12) return pts[k].x; } return pts[pts.length - 1].x; };
    var v = pts.map(function (p) { return p.x; });
    var uniform = !skilled && (nf === pts.length);    
    var q1 = uniform ? quantile(v, 0.25) : wq(0.25), q3 = uniform ? quantile(v, 0.75) : wq(0.75);
    return {
      n: v.length, families: nf,
      median: uniform ? quantile(v, 0.5) : wq(0.5),
      iqr: (q1 === null || q3 === null) ? null : q3 - q1,
      min: v[0], max: v[v.length - 1], range: v[v.length - 1] - v[0],
      weighting: skilled ? 'skill registry' : (uniform ? 'one model per family' : 'family-weighted (international forecast centre and international climate centre pairs share one vote each)'),
      skillCell: skilled ? skill.key : null, skillStations: skilled ? (skill.stations || null) : null
    };
  }

  

  function value(v, prov) {
    prov = prov || {};
    var n = num(v);
    var tier = prov.tier || (isFinite(n) ? TIER.SINGLE : TIER.ABSENT);
    if (!isFinite(n)) tier = TIER.ABSENT;
    return {
      value: isFinite(n) ? n : null,
      unit: prov.unit || null,
      tier: tier,
      unavailable: tier === TIER.ABSENT,
      live: tier === TIER.MULTI || tier === TIER.SINGLE,   
      models: prov.models || null,
      n: prov.n || null,
      median: prov.median === undefined ? null : prov.median,
      iqr: prov.iqr === undefined ? null : prov.iqr,
      spread: prov.range === undefined ? null : prov.range,
      dissent: (prov.iqr != null && prov.range != null && prov.iqr > 0)
               ? (prov.range / prov.iqr >= 3) : null,
      elevation: prov.elevation == null ? null : prov.elevation,
      issued: prov.issued || null,
      lead: prov.lead == null ? null : prov.lead,
      source: prov.source || null,
      basis: prov.basis || null
    };
  }

  

  var MIN_MODELS = 3;
  function fromEnvelope(env, prov) {
    prov = prov || {};
    if (!env || !env.n) return value(null, { tier: TIER.ABSENT, basis: 'no model returned data', unit: prov.unit });
    var multi = env.n >= MIN_MODELS;
    return value(env.median, {
      tier: multi ? TIER.MULTI : TIER.SINGLE,
      unit: prov.unit, models: prov.models || MODELS.slice(), n: env.n,
      median: env.median, iqr: env.iqr, range: env.range,
      elevation: prov.elevation, issued: prov.issued, lead: prov.lead,
      source: multi ? (env.n + '-model median, MACH') : 'single model, MACH',
      basis: multi ? 'IQR across models is the error bar; full range flags a dissenting model'
                   : 'fewer than ' + MIN_MODELS + ' models returned data — no spread available'
    });
  }

  function climatology(v, prov) {
    prov = prov || {};
    prov.tier = TIER.CLIMATE;
    var out = value(v, prov);
    out.live = false;                        
    out.source = prov.source || 'climatology';
    return out;
  }

  

  function envelopeQuery(points, vars, hours) {
    loadSkill();    
    var lat = [], lon = [], elev = [], anyElev = false;
    (points || []).forEach(function (p) {
      lat.push(p.lat); lon.push(p.lon);
      var e = num(p.elev);
      if (isFinite(e)) { elev.push(e); anyElev = true; } else { elev.push('nan'); }
    });
    /* v91.17.283.15 · the server's multi-model record of the points (GET /api/pointstate/product name=models) */
    var q = { latitude: lat.join(','), longitude: lon.join(','), hourly: (vars || ['temperature_2m', 'precipitation']).join(','), forecast_hours: hours || 24, models: MODELS.join(','), timezone: 'auto' };
    if (anyElev) q.elevation = elev.join(',');
    return q;
  }

  

  function parseEnvelope(resp, vars, hourIndex) {
    var h = resp && resp.hourly; if (!h) return null;
    var out = {}, hi = hourIndex || 0;
    (vars || []).forEach(function (v) {
      var vals = [], used = [];
      MODELS.forEach(function (m) {
        var k = v + '_' + m, arr = h[k];
        if (Array.isArray(arr) && arr.length > hi) {
          var x = num(arr[hi]);
          if (isFinite(x)) { vals.push(x); used.push(m); }
        }
      });
      
      if (!vals.length && Array.isArray(h[v]) && h[v].length > hi) {
        var y = num(h[v][hi]); if (isFinite(y)) { vals.push(y); used.push('single'); }
      }
      var s = stat(vals, used, skillCell(resp && resp.elevation, h.time && h.time[hi], hi, v)); s.models = used; out[v] = s;
      

      

      if (v === 'temperature_2m') { out.__members_t = vals.slice(); out.__models_t = used.slice(); }
      if (v === 'precipitation')  { out.__members_p = vals.slice(); out.__models_p = used.slice(); }
    });
    out.__elevation = resp.elevation == null ? null : resp.elevation;
    out.__time = (h.time && h.time[hi]) || null;
    return out;
  }

  async function envelope(points, vars, opts) {
    opts = opts || {};
    vars = vars || ['temperature_2m', 'precipitation'];
    if (!points || !points.length) return [];
    if (!(G.AGN.api && G.AGN.api.product)) return points.map(function () { return null; });
    var query = envelopeQuery(points, vars, opts.hours || 24);
    try {
      var r = await G.AGN.api.product('models', query);
      if (!r || !r.ok) throw new Error('HTTP ' + (r && r.status));
      var data = await r.json();
      if (!Array.isArray(data)) data = [data];
      return data.map(function (d) { return parseEnvelope(d, vars, opts.hourIndex || 0); });
    } catch (e) {
      if (G.console && console.warn) console.warn('[AGN.uncertainty] envelope unavailable:', e && e.message);
      return points.map(function () { return null; });
    }
  }

  

  async function enrichNational(opts) {
    opts = opts || {};
    if (!(G.AGN && G.AGN.engineMode)) return { ran: false, reason: 'the district envelope is read by the server\u2019s hazard engine only (v91.17.283.19)' };
    var G2 = G;
    if (!(G2.DISTRICT_IN && G2.AGN && G2.AGN.elevation)) {
      return { ran: false, reason: 'DISTRICT_IN or AGN.elevation unavailable' };
    }
    var pts = G2.AGN.elevation.points().filter(function (p) {
      return G2.DISTRICT_IN[p.key] && p.lat != null && p.lon != null;
    });
    if (opts.limit) pts = pts.slice(0, opts.limit);
    var vars = ['temperature_2m', 'precipitation'];
    

    var BATCH = opts.batch;
    if (!BATCH) {
      try {
        BATCH = (G.AGN && G.AGN.tier && G.AGN.tier.chunkFor)
          ? G.AGN.tier.chunkFor(vars.length * MODELS.length, 1) : 60;
      } catch (_) { BATCH = 60; }
    }
    var applied = 0, single = 0, absent = 0, failed = 0, maxIqr = 0, dissent = 0;

    for (var i = 0; i < pts.length; i += BATCH) {
      var slice = pts.slice(i, i + BATCH);
      var envs;
      try {
        envs = await envelope(slice, vars, { hours: opts.hours || 6, hourIndex: opts.hourIndex || 0 });
      } catch (e) { envs = null; }
      if (!envs) { failed += slice.length; continue; }
      for (var k = 0; k < slice.length; k++) {
        var row = G2.DISTRICT_IN[slice[k].key], env = envs[k];
        if (!row) continue;
        if (!env) { failed++; continue; }
        var tv = fromEnvelope(env.temperature_2m, {
          unit: '°C', elevation: slice[k].elev, issued: env.__time
        });
        var pv = fromEnvelope(env.precipitation, {
          unit: 'mm', elevation: slice[k].elev, issued: env.__time
        });
        row.__unc = { t: tv, rain: pv, at: Date.now() };
        

        try{
          var _EV = G2.AGN && G2.AGN.evidence;
          if(_EV){
            _EV.record('t:'+slice[k].key, {
              label:'Air temperature', kind:_EV.KIND.FORECAST,
              value:tv.value, unit:'°C', source:'multi-model forecast',
              method:(tv.n||0)+'-model median at the population-weighted elevation',
              tier:tv.tier, models:tv.models, n:tv.n, median:tv.median,
              iqr:tv.iqr, spread:tv.spread, members:env.__members_t||null,
              memberModels:env.__models_t||null,
              elevation:slice[k].elev, issued:env.__time, unitKey:slice[k].key,
              hazard:'heat', licence:'model forecast (forecast provider, commercial licence)',
              refuses:(slice[k].refuseSingleValue
                ? ['no single point value — relief above 2000 m in this unit'] : [])
                .concat(tv.tier==='multi-model'
                ? [] : ['no spread — fewer than three models returned'])
            });
            _EV.record('rain:'+slice[k].key, {
              label:'Precipitation', kind:_EV.KIND.FORECAST,
              value:pv.value, unit:'mm', source:'multi-model forecast',
              method:(pv.n||0)+'-model median', tier:pv.tier, n:pv.n,
              median:pv.median, iqr:pv.iqr, spread:pv.spread,
              members:env.__members_p||null, memberModels:env.__models_p||null,
              models:env.__models_p||null,
              elevation:slice[k].elev, unitKey:slice[k].key, hazard:'flood',
              licence:'model forecast (forecast provider, commercial licence)',
              refuses:['a modelled quantity, not a gauge reading']
            });
          }
        }catch(_){}
        if (tv.tier === TIER.MULTI) {
           
          if (row.tSingle === undefined) row.tSingle = row.t;
          row.t = Math.round(tv.value);
          row.tIqr = tv.iqr;
          row.tModels = tv.n;
          row.tBasis = tv.source;
          row.tDissent = !!tv.dissent;
          applied++;
          if (tv.iqr > maxIqr) maxIqr = tv.iqr;
          if (tv.dissent) dissent++;
        } else if (tv.tier === TIER.SINGLE) { single++; }
        else { absent++; }
      }
    }
    var out = { ran: true, units: pts.length, applied: applied, single: single,
                absent: absent, failed: failed, maxIqr: maxIqr, dissent: dissent,
                at: Date.now() };
    G2.AGN.uncertainty.lastRun = out;
    return out;
  }

  G.AGN.uncertainty = {
    MODELS: MODELS.slice(), ML: ML, TIER: TIER, MIN_MODELS: MIN_MODELS,
    enrichNational: enrichNational, lastRun: null,
    stat: stat, quantile: quantile, value: value, fromEnvelope: fromEnvelope,
    climatology: climatology, envelope: envelope,
    envelopeQuery: envelopeQuery, parseEnvelope: parseEnvelope,
     
    badge: function (v) {
      if (!v || v.unavailable) return { text: 'Not available', live: false };
      if (v.tier === TIER.CLIMATE) return { text: 'Climatology', live: false };
      if (v.tier === TIER.MULTI)
        return { text: v.n + '-model median', live: true,
                 detail: (v.iqr == null ? '' : '±' + (v.iqr / 2).toFixed(1) + ' IQR')
                       + (v.dissent ? ' · one model dissents' : '') };
      return { text: 'Single model', live: true, detail: 'no spread available' };
    }
  };
})(window);
