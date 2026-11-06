


(function (G) {
  'use strict';
  G.AGN = G.AGN || {};
  var D = G.document;

  

  var AUTHORITIES = ['client', 'manufacturer', 'standard', 'site-rule', 'regulator', 'insurer', 'agn-default'];    
  var DB_NAME = 'agn-nigraan-assets', DB_VER = 1, STORE = 'assets';
  var REGISTER = [];        
  var REJECTED = [];        
  var LOADED_AT = null, SOURCE = null;
  var dbp = null;

  function num(v) {
    return (v === null || v === undefined || v === '' || !isFinite(Number(v))) ? null : Number(v);
  }
  function str(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }

  

  

  function validateAsset(raw, i, dry) {
    var errs = [];
    var id = str(raw && raw.id) || str(raw && raw.name);
    if (!id) errs.push('id or name — an asset with no identifier cannot be tracked between runs');
    var name = str(raw && raw.name) || id;

    var lat = num(raw && raw.lat), lon = num(raw && raw.lon);
    var located = 'supplied';
    

    if (lat === null || lon === null) {
      try{
        var _pa=((G.AGN.project&&G.AGN.project.state&&G.AGN.project.state().assets)||[]).filter(function(a){
          return a && (String(a.asset_id)===id || String(a.name)===id || String(a.asset_name||'')===id); })[0];
        if(_pa && num(_pa.latitude)!==null && num(_pa.longitude)!==null){
          lat=num(_pa.latitude); lon=num(_pa.longitude); located='from the project asset register ('+(_pa.asset_id||_pa.name)+')';
          if(!name || name===id) name=_pa.name||_pa.asset_name||id;
        }
      }catch(_){}
    }
    if (lat === null || lon === null) {
      var unit = str(raw && (raw.unit || raw.tehsil || raw.location));
      var c = unit ? resolveUnit(unit) : null;
      if (c && !c.ambiguous) {
        lat = c.lat; lon = c.lon;
        located = 'resolved from the ' + (c.matched || unit) + ' centroid, not supplied';
      } else if (c && c.ambiguous) {
        errs.push('lat/lon — "' + unit + '" matches more than one unit ('
                + c.candidates.join('; ') + '). Give coordinates or the exact unit name; this '
                + 'build will not pick one for you.');
      } else {
        errs.push('lat/lon — no coordinates, and "' + (unit || '') + '" did not match a tehsil '
                + 'or district in the 576-unit table');
      }
    }
    if (lat !== null && (lat < 23 || lat > 38 || lon < 60 || lon > 78)) {
      errs.push('lat/lon — ' + lat + ',' + lon + ' is outside Pakistan');
    }

    var rawLimits = (raw && raw.limits) || [];
    if (!rawLimits.length) errs.push('limits — an asset with no operating limit has nothing to evaluate');
    var limits = [], lerrs = [], NC = (G.AGN.nowcast && G.AGN.nowcast.VARS) || [];
    

    var known = NC.map(function (v) { return v.key; }).concat(['temperature_2m','wet_bulb_temperature_2m','apparent_temperature',
      'temperature_2m_max','temperature_2m_min','precipitation','precipitation_24h','wind_gusts_10m','wind_speed_10m','river_discharge','flood_depth'])
      .filter(function (k, i, a) { return a.indexOf(k) === i; });
    rawLimits.forEach(function (L, k) {
      var where = 'limits[' + k + ']';
      var v = str(L && L.variable);
      var _VA={temperature:'temperature_2m',air_temperature:'temperature_2m',t2m:'temperature_2m',
               wind_gust:'wind_gusts_10m',gust:'wind_gusts_10m',wind_gusts:'wind_gusts_10m',
               wind_speed:'wind_speed_10m',wind:'wind_speed_10m',rain:'precipitation',rainfall:'precipitation',
               wet_bulb:'wet_bulb_temperature_2m',wetbulb:'wet_bulb_temperature_2m',wbt:'wet_bulb_temperature_2m',tw:'wet_bulb_temperature_2m',
               apparent:'apparent_temperature',feels_like:'apparent_temperature',heat_index:'apparent_temperature',
               tmax:'temperature_2m_max',max_temperature:'temperature_2m_max',daily_max:'temperature_2m_max',
               tmin:'temperature_2m_min',min_temperature:'temperature_2m_min',daily_min:'temperature_2m_min',
               rain_24h:'precipitation_24h',rainfall_24h:'precipitation_24h',precip_24h:'precipitation_24h',
               discharge:'river_discharge',river_flow:'river_discharge',streamflow:'river_discharge',
               water_depth:'flood_depth',inundation_depth:'flood_depth',river_level:'flood_depth',water_level:'flood_depth'};
      if (_VA[v.toLowerCase()]) v = _VA[v.toLowerCase()];
      if (!v) { lerrs.push(where + '.variable — required'); return; }
      if (known.length && known.indexOf(v) < 0) {
        lerrs.push(where + '.variable — "' + v + '" is not a variable this build retrieves ('
                  + known.join(', ') + ')');
        return;
      }
      var lim = num(L && L.limit);
      if (lim === null) { lerrs.push(where + '.limit — required, numeric'); return; }
      var _op = str(L && (L.dir || L.operator)).toLowerCase();
      var dir = (_op === '>' || _op === '>=' || _op === 'gt' || _op === 'gte' || _op === 'above' || _op === '') ? 'above'
              : (_op === '<' || _op === '<=' || _op === 'lt' || _op === 'lte' || _op === 'below') ? 'below' : _op;
       
      var _u = str(L && L.unit).toLowerCase();
      if (lim !== null && /^wind_/.test(v) && (_u === 'm/s' || _u === 'ms-1' || _u === 'm s-1')) lim = Math.round(lim * 3.6 * 10) / 10;
      if (dir !== 'above' && dir !== 'below') {
        lerrs.push(where + '.dir — must be "above" or "below", got "' + dir + '"'); return;
      }
      var auth = str(L && L.authority).toLowerCase();
      var _AA={'client-supplied':'client','owner':'client','operator':'client','company':'client','site':'site-rule','oem':'manufacturer',
                
               'internal_engineering':'client','internal':'client','engineering':'client','permit':'client','insurance':'insurer','underwriter':'insurer'};
      if (_AA[auth]) auth = _AA[auth];
      if (!auth) {
        lerrs.push(where + '.authority — required. A limit with no authority is a guess, and this '
                + 'build will not put a guess into an operating envelope. One of: '
                + AUTHORITIES.join(', '));
        return;
      }
      if (AUTHORITIES.indexOf(auth) < 0) {
        lerrs.push(where + '.authority — "' + auth + '" is not one of ' + AUTHORITIES.join(', '));
        return;
      }
      var am = num(L && L.actionMin);
      limits.push({ variable:v, limit:lim, dir:dir, authority:auth,
                    reference: str(L && L.reference) || null,
                    actionMin: (am === null ? null : Math.max(0, am)),
                    action: str(L && L.action) || null,
                    owner: str(L && L.owner) || null,
                    durationMin: num(L && L.durationMin),
                    consequence: str(L && L.consequence) || null,
                    reach: str(L && L.reach) || null,
                    

                    actionMinMissing: (am === null) });
    });

    

    if (!errs.length && !limits.length && lerrs.length) errs.push('limits — none of this asset\'s limits could be evaluated');
    if (errs.length) {
      if (dry === true) return { dry:true, rejected:true, errors:errs.concat(lerrs) };
      REJECTED.push({ row:i, id:id || ('row ' + (i + 1)), name:name, errors:errs.concat(lerrs), level:'asset' });
      return null;
    }
    if (lerrs.length) {
      if (dry === true) return { dry:true, rejected:true, errors:lerrs };
      REJECTED.push({ row:i, id:id, name:name, errors:lerrs, level:'limit', kept:limits.length });
    }
    return { id:id, name:name, type:str(raw && raw.type) || null,
             lat:lat, lon:lon, located:located, limits:limits };
  }

  

  function resolveUnit(nameIn) {
    var want = String(nameIn).trim().toLowerCase();
    var hits = [];
    try {
      var C = G.PK_DISTRICT_CENTROIDS || [];
      for (var i = 0; i < C.length; i++) {
        var c = C[i];
        if (!c || c.lat == null) continue;
        var t = String(c.tehsil || '').toLowerCase(), d = String(c.district || '').toLowerCase();
        if (t === want || d === want) return { lat:c.lat, lon:c.lon, matched:(t === want ? c.tehsil : c.district) };
        

        if (want.length >= 3 && (t.indexOf(want) >= 0 || d.indexOf(want) >= 0)) {
          var label = (c.district || '') + (c.tehsil && c.tehsil !== c.district ? ' / ' + c.tehsil : '');
          if (hits.indexOf(label) < 0 && hits.length < 12) hits.push(label);
        }
      }
    } catch (_) {}
    return hits.length ? { ambiguous:true, candidates:hits } : null;
  }

   
  function load(rows, source) {
    REJECTED = [];
    var list = Array.isArray(rows) ? rows : [];
    REGISTER = list.map(validateAsset).filter(Boolean);
    

    var seen = Object.create(null), dupes = [];
    REGISTER = REGISTER.filter(function (a) {
      if (seen[a.id]) { dupes.push(a.id); return false; }
      seen[a.id] = 1; return true;
    });
    dupes.forEach(function (id) {
      REJECTED.push({ row:null, id:id, name:id,
                      errors:['id — duplicate of an asset already in the register; the later '
                            + 'row was dropped rather than overwriting the earlier one'] });
    });
    LOADED_AT = Date.now(); SOURCE = source || 'inline';
    try { D.dispatchEvent(new CustomEvent('agn:assets', { detail:summary() })); } catch (_) {}
    return summary();
  }

  function parseCsv(text) {
    

    var lines = String(text || '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (lines.length < 2) return [];
     
    var _split = function (line) { var out = [], cur = '', q = false; for (var i = 0; i < line.length; i++) { var ch = line[i];
      if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
    var head = _split(lines[0]).map(function (s) { return s.trim().toLowerCase().replace(/^\ufeff/, ''); });
    var ix = function (k) { return head.indexOf(k); };
    var by = Object.create(null), order = [];
    lines.slice(1).forEach(function (line) {
      var cells = _split(line).map(function (s) { return s.trim(); });
      var get = function () { for (var q = 0; q < arguments.length; q++) { var j = ix(arguments[q]); if (j >= 0 && cells[j] !== undefined && cells[j] !== '') return cells[j]; } return ''; };
      var id = get('id', 'asset_id', 'name', 'asset_name');
      if (!by[id]) {
        by[id] = { id:id, name:get('name', 'asset_name') || id, type:get('type', 'asset_type'),
                   lat:get('lat', 'latitude'), lon:get('lon', 'longitude'), unit:get('location', 'tehsil'),
                   limits:[] };
        order.push(id);
      }
      if (get('variable')) {
        by[id].limits.push({ variable:get('variable'), limit:get('limit', 'threshold'),
                             dir:get('dir', 'operator'), unit:get('unit'),
                             authority:get('authority', 'authority_type'),
                             reference:get('reference', 'authority_reference'),
                             actionMin:get('actionmin', 'action_lead_minutes'),
                             action:get('action', 'required_action'),
                             owner:get('owner', 'owner_role'),
                             durationMin:get('duration_minutes', 'durationmin'),
                             consequence:get('consequence'), reach:get('reach', 'river_reach') });
      }
    });
    return order.map(function (k) { return by[k]; });
  }

   
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (!G.indexedDB) return rej(new Error('IndexedDB unavailable'));
      var q = G.indexedDB.open(DB_NAME, DB_VER);
      q.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath:'id' });
      };
      q.onsuccess = function (e) { res(e.target.result); };
      q.onerror = function () { rej(q.error); };
    });
    return dbp;
  }
  function forget() {
    REGISTER = []; REJECTED = []; LOADED_AT = null; SOURCE = 'cleared';
    if (!G.indexedDB) { try { D.dispatchEvent(new CustomEvent('agn:assets', { detail:summary() })); } catch (_) {} return Promise.resolve(0); }
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var tx = d.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = function () { try { D.dispatchEvent(new CustomEvent('agn:assets', { detail:summary() })); } catch (_) {} res(0); };
        tx.onerror = function () { rej(tx.error); };
      });
    }).catch(function () { return 0; });
  }

  

  function evaluateOne(asset, nc) {
    

    if (nc && nc.pointKey && G.AGN.nowcast && G.AGN.nowcast.pointKey) {
      var want = G.AGN.nowcast.pointKey(asset.lat, asset.lon);
      if (nc.pointKey !== want) {
        return { asset:asset, rows:asset.limits.map(function (L) {
          return { assetId:asset.id, asset:asset.name, variable:L.variable, limit:L.limit,
                   dir:L.dir, authority:L.authority, actionMin:L.actionMin,
                   state:'not-evaluated', leadMin:null, leadToAction:null,
                   why:'the nowcast handed back was for ' + nc.pointKey + ', not this asset\'s '
                      + want + ' — refused rather than evaluated against another point',
                   scope:'exposure only — not a downtime estimate and not a loss estimate.' };
        }) };
      }
    }
    var byKey = Object.create(null);
    (nc && nc.variables || []).forEach(function (v) { byKey[v.key] = v; });

    var rows = asset.limits.map(function (L) {
      var v = byKey[L.variable];
      var base = { assetId:asset.id, asset:asset.name, variable:L.variable,
                   limit:L.limit, dir:L.dir, authority:L.authority,
                   reference:L.reference, action:L.action, actionMin:L.actionMin,
                   owner:L.owner || null,
                    
                   scope:'exposure only — whether the forecast crosses a limit written for '
                       + 'this asset. Not a downtime estimate and not a loss estimate.' };
      if (!v) {
        

        var _XV = ['wet_bulb_temperature_2m','apparent_temperature','temperature_2m_max','temperature_2m_min','precipitation_24h','river_discharge','flood_depth'];
        if (_XV.indexOf(L.variable) >= 0)
          return Object.assign(base, { state:'not-evaluated', elsewhere:true, leadMin:null, leadToAction:null,
            why:L.variable + ' is evaluated on the Limit crossings board below (named model run to 72 h, ensemble to 15 days), not on the 15-minute nowcast' });
        return Object.assign(base, { state:'not-evaluated', leadMin:null, leadToAction:null,
          why:L.variable + ' was not returned by the nowcast for this point' });
      }
      

      if (/^wind_/.test(L.variable) && nc && nc.elevation != null && nc.elevation >= 1500) {
        return Object.assign(base, { state:'not-evaluated', leadMin:null, leadToAction:null,
          why:'wind limits are not evaluated above 1,500 m (this point: ' + Math.round(nc.elevation)
             + ' m): the model wind in complex terrain has no validated error here, and mountain gust '
             + 'alerts were 19 in 20 false. Use a site anemometer for this limit.' });
      }
      if (v.state !== 'sub-hourly') {
        return Object.assign(base, { state:'not-evaluated', leadMin:null, leadToAction:null,
          resolution:v.state,
          why:'the nowcast measured ' + L.variable + ' at this point as ' + v.state
             + ' — ' + (v.why || '') + '. A crossing time read off it would be the hour it '
             + 'was interpolated from, printed beside an asset name.' });
      }
      

      var c = (G.AGN.nowcast && G.AGN.nowcast.crossingFor)
        ? G.AGN.nowcast.crossingFor(nc, L.variable, L.limit, L.dir)
        : null;
      if (!c) {
        return Object.assign(base, { state:'not-evaluated', leadMin:null, leadToAction:null,
          why:'the nowcast did not expose a series for ' + L.variable + ' at this point' });
      }
      

      var peak = peakBeyond(nc, L.variable, L.dir);
      var rate = v.rate;
      var conf = null;
      try {
        if (G.AGN.confidence && G.AGN.skill && G.AGN.skill.runs) {
          var err = G.AGN.confidence.errorFor(G.AGN.skill.runs(), L.variable,
                                              { name:asset.name, lat:asset.lat, lon:asset.lon },
                                              c.crosses ? c.leadMin : 0);
          conf = G.AGN.confidence.assess(err, L.limit, L.dir, peak, rate);
        }
      } catch (_) { conf = null; }

      if (c.alreadyOver) {
        return Object.assign(base, { state:'over', leadMin:null, leadToAction:null,
          value:c.value, clearsInMin:c.clearsInMin, clearsAt:c.clearsAt, confidence:conf,
          why:'already ' + (L.dir === 'below' ? 'below ' : 'above ') + L.limit + ' at '
             + c.value + (c.clearsInMin == null
                 ? ' — no return within the horizon'
                 : ' — releases in ' + c.clearsInMin + ' minutes') });
      }
      if (!c.crosses) {
        return Object.assign(base, { state:'clear', leadMin:null, leadToAction:null,
          confidence:conf,
          why:'no crossing of ' + L.limit + ' within the nowcast horizon' });
      }
      

      var lead = c.leadMin;
      if (L.actionMin === null) {
        return Object.assign(base, { state:'approaching', leadMin:lead, leadToAction:null,
          at:c.at, value:c.value, confidence:conf,
          why:'crosses in ' + lead + ' minutes. No action time is registered for this limit, '
             + 'so how much of that is usable is not known here.' });
      }
      var slack = lead - L.actionMin;
      return Object.assign(base, {
        state: (slack <= 0) ? 'window-closed' : 'approaching',
        leadMin:lead, leadToAction:slack, at:c.at, value:c.value, confidence:conf,
        why: (slack <= 0)
          ? ('the crossing is ' + lead + ' minutes away and the registered response takes '
             + L.actionMin + ' — the response window has closed')
          : ('crosses in ' + lead + ' minutes; the registered response takes ' + L.actionMin
             + ', leaving ' + slack + ' minutes in hand') });
    });
    return { asset:asset, rows:rows };
  }

  

  function peakBeyond(nc, variable, dir) {
    try {
      var raw = nc && nc.raw, series = raw && raw.series && raw.series[variable];
      if (!series || !series.length) return null;
      var from = Math.max(0, (raw.at || 0));
      var best = null;
      for (var i = from; i < series.length; i++) {
        var x = series[i];
        if (x === null || x === undefined || !isFinite(Number(x))) continue;
        x = Number(x);
        if (best === null) { best = x; continue; }
        best = (dir === 'below') ? Math.min(best, x) : Math.max(best, x);
      }
      return best;
    } catch (_) { return null; }
  }

  var ORDER = { 'window-closed':0, 'over':1, 'approaching':2, 'clear':3, 'not-evaluated':4 };

  function evaluate(nowcastFor) {
     
    if (!REGISTER.length) {
      return Promise.resolve({ ok:false, assets:0, rows:[],
        why:'no asset register is loaded, so there is nothing to evaluate. The operating '
          + 'limits shown elsewhere in this build are AGN defaults, not this client\'s.' });
    }
    return Promise.all(REGISTER.map(function (a) {
      return Promise.resolve(nowcastFor(a.lat, a.lon)).then(function (nc) {
        return evaluateOne(a, nc);
      }).catch(function (e) {
        return { asset:a, rows:a.limits.map(function (L) {
          return { assetId:a.id, asset:a.name, variable:L.variable, limit:L.limit,
                   dir:L.dir, authority:L.authority, actionMin:L.actionMin,
                   state:'not-evaluated', leadMin:null, leadToAction:null,
                   why:'the nowcast did not answer for this point: '
                      + String((e && e.message) || e),
                   scope:'exposure only — not a downtime estimate and not a loss estimate.' };
        }) };
      });
    })).then(function (per) {
      var rows = [];
      per.forEach(function (p) { p.rows.forEach(function (r) { rows.push(r); }); });
      rows.sort(function (x, y) {
        var d = ORDER[x.state] - ORDER[y.state];
        if (d) return d;
        if (x.state === 'approaching') return (x.leadToAction == null ? x.leadMin : x.leadToAction)
                                            - (y.leadToAction == null ? y.leadMin : y.leadToAction);
        return 0;
      });
      var out = { ok:true, assets:REGISTER.length, rows:rows, rejected:REJECTED.slice(),
                  source:SOURCE, loadedAt:LOADED_AT,
                  counts:rows.reduce(function (m, r) { m[r.state] = (m[r.state] || 0) + 1; return m; }, {}),
                  states:'exposure only. This layer does not estimate downtime and produces '
                       + 'no monetary figure.' };
      try { if (G.AGN.ledger && G.AGN.ledger.fileAssets) G.AGN.ledger.fileAssets(out); } catch (_) {}
      try { D.dispatchEvent(new CustomEvent('agn:assetsEvaluated', { detail:out })); } catch (_) {}
      return out;
    });
  }

  function summary() {
    return { assets:REGISTER.length, rejected:REJECTED.length, source:SOURCE,
             loadedAt:LOADED_AT,
             limits:REGISTER.reduce(function (n, a) { return n + a.limits.length; }, 0),
             withoutActionTime:REGISTER.reduce(function (n, a) {
               return n + a.limits.filter(function (L) { return L.actionMinMissing; }).length; }, 0) };
  }

  G.AGN.assets = {
    load:load, parseCsv:parseCsv, validateAsset:validateAsset, resolveUnit:resolveUnit,
    evaluate:evaluate, evaluateOne:evaluateOne, summary:summary,
    forget:forget,
    register:function () { return REGISTER.slice(); },
    rejected:function () { return REJECTED.slice(); },
    AUTHORITIES:AUTHORITIES, ORDER:ORDER, version:'v89.39'
  };
})(window);
