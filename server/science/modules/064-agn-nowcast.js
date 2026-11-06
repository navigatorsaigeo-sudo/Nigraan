


(function (G) {
  'use strict';
  G.AGN = G.AGN || {};
  var D = G.document;

  var STEP_MIN = 15;

  

  var VARS = [
    { key:'wind_gusts_10m', label:'Wind gust',      unit:'km/h', dp:0 },
    { key:'wind_speed_10m', label:'Sustained wind', unit:'km/h', dp:0 },
    { key:'temperature_2m', label:'Temperature',    unit:'°C',   dp:1 },
    { key:'cape',           label:'CAPE',           unit:'J/kg', dp:0 },
    

    { key:'precipitation',  label:'Precipitation',  unit:'mm',   dp:2,
      accumulation:true, nativeSubHourly:false,
      contractWhy:'MACH serves Pakistan precipitation from hourly model support; the '
                + '15-minute steps are that hour redistributed, not an independent observation. '
                + 'The steps are displayed; no rate of change or threshold-crossing time is '
                + 'derived from them.' }
  ];

  var LAST = null, TIMER = null;
  

  var INFLIGHT = Object.create(null);
  function pointKey(lat, lon) {
    return Number(lat).toFixed(3) + ',' + Number(lon).toFixed(3);
  }

  function reg(name, fallback) {
    try { return G.FR('nowcast.' + name); }
    catch (_) { return fallback; }
  }
  function num(v) {
    return (v === null || v === undefined || v === '' || !isFinite(Number(v))) ? null : Number(v);
  }
  function parseT(s) {
     
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(s));
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : NaN;
  }

  

  function linearity(m15, hourly, key) {
    

    var _spec = VARS.filter(function (x) { return x.key === key; })[0] || {};
    var isAccum = !!_spec.accumulation;
    var mt = (m15 && m15.time) || [], ht = (hourly && hourly.time) || [];
    var mv = (m15 && m15[key]) || [], hv = (hourly && hourly[key]) || [];
    var hi = Object.create(null);
    for (var i = 0; i < ht.length; i++) hi[ht[i]] = i;
    var lin = 0, tot = 0;
    for (var j = 0; j + 4 < mt.length; j++) {
      if (String(mt[j]).slice(-3) !== ':00') continue;
      var a = hi[mt[j]], b = hi[mt[j + 4]];
      if (a === undefined || b === undefined) continue;
      var v0 = num(hv[a]), v1 = num(hv[b]);
      if (v0 === null || v1 === null) continue;
      

      if (isAccum && v0 === 0 && v1 === 0) continue;    
      for (var k = 1; k <= 3; k++) {
        var v = num(mv[j + k]);
        if (v === null) continue;
        tot++;
        var predicted = isAccum ? (v1 / 4)                      
                                : (v0 + (v1 - v0) * k / 4);     
        if (Math.abs(v - predicted) < 1e-6) lin++;
      }
    }
    var minSteps = reg('linearityMinSteps', 24);
    if (tot < minSteps) {
      return { fraction:null, steps:tot, state:'unknown',
               why:'only ' + tot + ' step' + (tot === 1 ? '' : 's') + ' could be tested against '
                 + 'the hourly series, below the ' + minSteps + ' needed for the fraction to '
                 + 'mean anything — the resolution of this variable is not established here' };
    }
    var f = lin / tot;
    var thr = reg('linearityThreshold', 0.75);
    return (f >= thr)
      ? { fraction:f, steps:tot, state:'hourly-derived',
          why:Math.round(f * 100) + '% of ' + tot + ' sub-hourly steps are exactly the linear '
            + 'interpolation of the bracketing hours — this series is the hourly model spread '
            + 'evenly, and any slope read off it is the hourly slope' }
      : { fraction:f, steps:tot, state:'sub-hourly',
          why:'only ' + Math.round(f * 100) + '% of ' + tot + ' sub-hourly steps are linear '
            + 'between the bracketing hours, so the series carries structure the hourly '
            + 'forecast does not' };
  }

  

  function rateOf(series, at, stepsBack) {
    var a = at - stepsBack, b = at;
    if (a < 0 || b >= series.length) return null;
    var v0 = num(series[a]), v1 = num(series[b]);
    if (v0 === null || v1 === null) return null;
    var hours = (b - a) * STEP_MIN / 60;
    return hours > 0 ? (v1 - v0) / hours : null;
  }

  

  function crossing(times, series, at, limit, dir, nowMs) {
    var over = function (v) { return (dir === 'below') ? (v <= limit) : (v >= limit); };
    var cur = (at >= 0) ? num(series[at]) : null;

    if (cur !== null && over(cur)) {
      for (var i = at + 1; i < series.length; i++) {
        var v = num(series[i]);
        if (v === null || over(v)) continue;
        var tc = parseT(times[i]);
        return { alreadyOver:true, crosses:false, at:null, value:cur, leadMin:null,
                 clearsAt:times[i],
                 clearsInMin: isFinite(tc) ? Math.max(0, Math.round((tc - nowMs) / 60000)) : null };
      }
      return { alreadyOver:true, crosses:false, at:null, value:cur, leadMin:null,
               clearsAt:null, clearsInMin:null };
    }

    for (var j = at + 1; j < series.length; j++) {
      var t = parseT(times[j]);
      if (!isFinite(t) || t <= nowMs) continue;
      var w = num(series[j]);
      if (w === null || !over(w)) continue;
      return { alreadyOver:false, crosses:true, at:times[j], value:w,
               leadMin: Math.round((t - nowMs) / 60000) };
    }
    return { alreadyOver:false, crosses:false, at:null, value:null, leadMin:null };
  }

   
  function run(lat, lon, opts) {
    var pk = pointKey(lat, lon);
    if (INFLIGHT[pk]) return INFLIGHT[pk];
    opts = opts || {};
    var past = reg('pastSteps', 96), fwd = reg('horizonSteps', 192);
    var keys = VARS.map(function (v) { return v.key; }).join(',');
    /* v91.17.283.15 · the server's nowcast record of the place (GET /api/pointstate/product, through the page store) */
    var p = G.AGN.api.product('nowcast', { latitude: lat, longitude: lon, minutely_15: keys, hourly: keys, past_minutely_15: past, forecast_minutely_15: fwd, timezone: 'UTC' }).then(function (r) {
      if (!r.ok) throw new Error('nowcast HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      var out = build(j, lat, lon, opts.nowMs);
      LAST = out;
      try { if (G.AGN.ledger && G.AGN.ledger.fileNowcast) G.AGN.ledger.fileNowcast(out); } catch (_) {}
      try { D.dispatchEvent(new CustomEvent('agn:nowcast', { detail:out })); } catch (_) {}
      return out;
    }).catch(function (e) {
      

      if (LAST) { LAST = Object.assign({}, LAST, {
        refreshFailed:true, refreshFailedAt:Date.now(),
        refreshFailedWhy:String((e && e.message) || e) }); }
      else {
        LAST = { ok:false, unavailable:true, lat:lat, lon:lon,
                 why:'the nowcast feed did not answer: ' + String((e && e.message) || e),
                 variables:[], provenance:{ state:'absent',
                   why:'no 15-minute feed was retrieved for this point' } };
      }
      try { D.dispatchEvent(new CustomEvent('agn:nowcast', { detail:LAST })); } catch (_) {}
      return LAST;
    }).then(function (v) { delete INFLIGHT[pk]; return v; },
            function (e) { delete INFLIGHT[pk]; throw e; });
    INFLIGHT[pk] = p;
    return p;
  }

  function build(j, lat, lon, nowMsIn) {
    var m = j.minutely_15 || {}, h = j.hourly || {};
    var times = m.time || [];
    var nowMs = nowMsIn || Date.now();
    var maxAge = reg('maxAgeMin', 90), trend = reg('trendSteps', 4);
    var limits = reg('limits', {}) || {};

     
    var at = -1;
    for (var i = 0; i < times.length; i++) {
      var t = parseT(times[i]);
      if (isFinite(t) && t <= nowMs) at = i; else break;
    }
    var ageMin = (at >= 0) ? Math.round((nowMs - parseT(times[at])) / 60000) : null;
    var stale = (ageMin === null) || (ageMin > maxAge);
    var staleWhy = (ageMin === null)
      ? 'no 15-minute step in this response falls at or before now, so nothing here is an '
        + 'observation of the present'
      : (stale ? ('the newest step is ' + ageMin + ' minutes old, past the ' + maxAge
                  + '-minute limit at which a reading stops being current')
               : null);

    var vars = VARS.map(function (spec) {
      var series = m[spec.key] || [];
      var res = linearity(m, h, spec.key);
      var present = series.some(function (v) { return num(v) !== null; });
      var current = (at >= 0) ? num(series[at]) : null;

      var row = { key:spec.key, label:spec.label, unit:spec.unit, dp:spec.dp,
                  resolution:res.state, linearFraction:res.fraction,
                  linearSteps:res.steps, resolutionWhy:res.why,
                  current:current, at:(at >= 0 ? times[at] : null),
                  ageMin:ageMin, stale:stale };

      if (!present) {
        row.state = 'absent';
        row.why = spec.label + ' is accepted by the endpoint and returns no values at this '
                + 'point — accepted is not available';
        row.rate = null; row.rateForward = null; row.threshold = null;
        row.provenance = { state:'absent', why:row.why };
        return row;
      }
      if (stale) {
        row.state = 'stale';
        row.why = staleWhy;
        row.rate = null; row.rateForward = null; row.threshold = null;
        row.provenance = { state:'absent', why:staleWhy };
        return row;
      }
      

      if (spec.nativeSubHourly === false) {
        row.state = 'hourly-derived';
        row.why = spec.contractWhy || (spec.label + ' is not served natively at 15 minutes here.');
        row.resolution = 'hourly-derived';
        row.resolutionWhy = row.why
          + (res.fraction != null
             ? ' (the linearity test measured ' + Math.round(res.fraction * 100) + '% of '
               + res.steps + ' steps as the provider\'s own interpolation; it is reported for '
               + 'transparency and is not what decides this.)'
             : '');
        row.rate = null; row.rateForward = null;
        row.rateRefusedWhy = 'no rate of change is computed for ' + spec.label
                           + ' — ' + (spec.contractWhy || 'the series is hourly-derived');
        row.threshold = { refused:true, why:'a threshold-crossing time read off a redistributed '
                          + 'hourly series would state a minute the model never produced' };
        

        row.provenance = { state:'design', why:row.why };
        return row;
      }
      if (res.state !== 'sub-hourly') {
        

        row.state = res.state;
        row.why = res.why;
        row.rate = null; row.rateForward = null;
        row.rateRefusedWhy = 'rate of change is not computed on an ' + res.state
                           + ' series — ' + res.why;
        row.threshold = { refused:true, why:'a threshold crossing time read off an '
                        + res.state + ' series would be the hour it was interpolated from, '
                        + 'reported to the quarter hour' };
        row.provenance = { state:(res.state === 'unknown' ? 'absent' : 'design'), why:res.why };
        return row;
      }

      row.state = 'sub-hourly';
      row.why = res.why;
      row.rate = rateOf(series, at, trend);
      row.rateForward = rateOf(series, at + trend, trend);

      var lim = limits[spec.key];
      if (!lim) {
        row.threshold = { refused:true,
                          why:'no operating limit is registered for ' + spec.label + ': register the site\'s own limit (the crane OEM limit, the HSE heat regime) on the limit register' };
      } else {
        var c = crossing(times, series, at, lim.limit, lim.dir, nowMs);
        row.threshold = { refused:false, limit:lim.limit, dir:lim.dir,
                          unit:lim.unit, basis:lim.basis,
                          alreadyOver:!!c.alreadyOver,
                          crosses:c.crosses, at:c.at, value:c.value, leadMin:c.leadMin,
                          clearsAt:(c.clearsAt || null), clearsInMin:(c.clearsInMin == null ? null : c.clearsInMin),
                          why:c.alreadyOver
                            ? ('already ' + (lim.dir === 'below' ? 'below ' : 'above ') + lim.limit
                               + ' ' + lim.unit + ' at ' + c.value + ' — '
                               + (c.clearsInMin == null
                                   ? 'no return within the horizon'
                                   : 'releases in ' + c.clearsInMin + ' minutes'))
                            : (c.crosses
                              ? ('crosses ' + lim.limit + ' ' + lim.unit + ' in ' + c.leadMin
                                 + ' minutes')
                              : ('no crossing of ' + lim.limit + ' ' + lim.unit
                                 + ' within the ' + Math.round(fwdHours(times, at)) + '-hour horizon')),
                          isDefault:true };
      }
      row.provenance = { state:'retrieved', why:res.why };
      return row;
    });

    var anySub = vars.some(function (v) { return v.state === 'sub-hourly'; });
    

    var raw = { times:times, at:at, nowMs:nowMs, series:Object.create(null) };
    VARS.forEach(function (sp) { raw.series[sp.key] = m[sp.key] || []; });
    return {
      ok:true, lat:lat, lon:lon, pointKey:pointKey(lat, lon),
       
      elevation:(j && j.elevation != null && isFinite(Number(j.elevation))) ? Number(j.elevation) : null,
      issued:new Date(nowMs).toISOString(), raw:raw,
      steps:times.length, at:(at >= 0 ? times[at] : null), ageMin:ageMin,
      stale:stale, staleWhy:staleWhy,
      firstStep:times[0] || null, lastStep:times[times.length - 1] || null,
      variables:vars,
      limitsAreDefaults:true,
      provenance: anySub && !stale
        ? { state:'retrieved',
            why:'at least one variable carries measured sub-hourly structure at this point' }
        : { state:(stale ? 'absent' : 'design'),
            why:stale ? staleWhy
                      : 'every variable in this response is the hourly series presented at '
                        + '15 minutes; nothing here is a sub-hourly observation' }
    };
  }

  function fwdHours(times, at) {
    if (at < 0 || !times.length) return 0;
    var a = parseT(times[at]), b = parseT(times[times.length - 1]);
    return (isFinite(a) && isFinite(b)) ? (b - a) / 3600000 : 0;
  }

  

  function crossingFor(res, key, limit, dir) {
    if (!res || !res.raw || !res.raw.series) return null;
    if (res.stale) return null;
    var v = (res.variables || []).filter(function (x) { return x.key === key; })[0];
    if (!v || v.state !== 'sub-hourly') return null;
    var series = res.raw.series[key];
    if (!series || !series.length) return null;
    return crossing(res.raw.times, series, res.raw.at, Number(limit),
                    (dir === 'below' ? 'below' : 'above'), res.raw.nowMs);
  }

  G.AGN.nowcast = {
    run:run, build:build, linearity:linearity, crossing:crossing, crossingFor:crossingFor,
    rateOf:rateOf, pointKey:pointKey,
    inflight:function () { return Object.keys(INFLIGHT); },
    VARS:VARS, last:function () { return LAST; },
    stop:function () { if (TIMER) { clearInterval(TIMER); TIMER = null; } },
    version:'v89.38'
  };
})(window);
