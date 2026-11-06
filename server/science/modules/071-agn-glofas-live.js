


(function (G) {
  'use strict';
  G.AGN = G.AGN || {};
  var CACHE = Object.create(null);

  function num(v) {
    return (v === null || v === undefined || v === '' || !isFinite(Number(v))) ? null : Number(v);
  }
  function quantile(sorted, q) {
    if (!sorted.length) return null;
    if (sorted.length === 1) return sorted[0];
    var pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }
  function key(lat, lon) { return Number(lat).toFixed(3) + ',' + Number(lon).toFixed(3); }

  

  function nearestBarrage(lat, lon) {
    

    var B = (G.FFD_CAL && G.FFD_CAL.barrages) || G.INDUS_BARRAGES || [];
    var best = null, bestKm = Infinity;
    for (var i = 0; i < B.length; i++) {
      var b = B[i];
      var dLat = (b.lat - lat) * 111, dLon = (b.lon - lon) * 111 * Math.cos(lat * Math.PI / 180);
      var km = Math.sqrt(dLat * dLat + dLon * dLon);
      if (km < bestKm) { bestKm = km; best = b; }
    }
    return best ? { barrage: best, km: bestKm } : null;
  }

  function fetchPoint(lat, lon) {
    var k = key(lat, lon);
    if (CACHE[k]) return CACHE[k];
    /* v91.17.283.15 · the server's river-flow record of the reach (GET /api/pointstate/product name=riverflow) */
    var p = G.AGN.api.product('riverflow', { latitude: lat, longitude: lon, daily: AGN_FLOOD_POLICY.daily.join(','), past_days: AGN_FLOOD_POLICY.operationalDays,
      forecast_days: AGN_FLOOD_POLICY.operationalDays, ensemble: 'true' }).then(function (r) {
      if (!r.ok) throw new Error('flood HTTP ' + r.status);
      return r.json();
    }).then(function (j) { return build(j, lat, lon); })
      .catch(function (e) {
        delete CACHE[k];
        return { ok:false, lat:lat, lon:lon,
                 why:'the global river-flow model endpoint did not answer for this reach: '
                    + String((e && e.message) || e) };
      });
    CACHE[k] = p;
    return p;
  }

  function build(j, lat, lon) {
    var d = (j && j.daily) || {}, t = d.time || [];
    var memberKeys = Object.keys(d).filter(function (x) {
      return /^river_discharge_member\d+$/.test(x); });
    var control = d.river_discharge || [];
    if (!t.length || !control.length) {
      return { ok:false, lat:lat, lon:lon,
               why:'the reach returned no discharge series' };
    }
    var today = new Date().toISOString().slice(0, 10);
    var iNow = 0;
    for (var i = 0; i < t.length; i++) { if (t[i] <= today) iNow = i; else break; }

     
    var past = [];
    for (var p2 = Math.max(0, iNow - 29); p2 <= iNow; p2++) {
      var v = num(control[p2]); if (v !== null) past.push(v);
    }
    var pastSorted = past.slice().sort(function (a, b) { return a - b; });
    var recentMax = pastSorted.length ? pastSorted[pastSorted.length - 1] : null;
    var recentP90 = quantile(pastSorted, 0.90);
    var recentMed = quantile(pastSorted, 0.50);

     
    var days = [];
    for (var f = iNow + 1; f < t.length; f++) {
      var vals = [];
      memberKeys.forEach(function (mk) { var x = num(d[mk][f]); if (x !== null) vals.push(x); });
      var s = vals.slice().sort(function (a, b) { return a - b; });
      var cv = num(control[f]);
      days.push({ date:t[f], lead:f - iNow, control:cv, members:vals.length,
                  p10:quantile(s, 0.10), p50:quantile(s, 0.50), p90:quantile(s, 0.90),
                  aboveRecentMax:(recentMax != null && vals.length)
                    ? vals.filter(function (x) { return x > recentMax; }).length / vals.length
                    : null });
    }

    var now = num(control[iNow]);
    var peak = days.reduce(function (a, x) {
      return (x.p50 != null && (a == null || x.p50 > a.p50)) ? x : a; }, null);

    

    var pctile = null;
    if (now != null && pastSorted.length > 4) {
      var below = pastSorted.filter(function (x) { return x < now; }).length;
      pctile = below / pastSorted.length;
    }

    var nb = nearestBarrage(lat, lon);
    var barrage = (nb && nb.km <= 60) ? {
      name:nb.barrage.name, km:Math.round(nb.km),
      r:nb.barrage.r, ratio:nb.barrage.ratio, designKcs:nb.barrage.design_kcs,
      why:'the nearest calibrated barrage is ' + nb.barrage.name + ', ' + Math.round(nb.km)
         + ' km away. Its global river-flow model cell correlates with the barrage record at r = '
         + nb.barrage.r + ' over the calibration period — carried per barrage because the '
         + 'set runs r = 0.48 to 0.78 and an average would hide the weak end.'
    } : null;

     
    var rp = { available:false,
      why:'no return period is computed here. P(exceed the 20-year level) needs return levels '
        + 'fitted per reach to a multi-decade reanalysis record, which the live endpoint does '
        + 'not serve. Where the fitted payload is loaded, AGN.glofas supplies that claim; '
        + 'without it the exceedance is withheld rather than approximated from 30 days.' };
    try {
      if (G.AGN.glofas && G.AGN.glofas.loaded && G.AGN.glofas.loaded()) {
        rp = { available:true,
               why:'a fitted return-level payload is loaded — see AGN.glofas.describe() for the '
                  + 'exceedance probabilities it supports' };
      }
    } catch (_) {}

    return {
      ok:true, lat:lat, lon:lon, source:'global river-flow model v4',
      issued:new Date().toISOString(), at:t[iNow],
      now:now, unit:'m3/s',
      memberCount:memberKeys.length,
      recent:{ days:past.length, median:recentMed, p90:recentP90, max:recentMax },
      percentileOfRecent:pctile,
      peak:peak ? { date:peak.date, lead:peak.lead, p50:peak.p50, p90:peak.p90,
                    aboveRecentMax:peak.aboveRecentMax } : null,
      days:days,
      barrage:barrage,
      returnPeriod:rp,
      dry:(recentMax != null && recentMax < 0.5),
      refuses:[
        'modelled discharge from a 5 km reanalysis grid, not a gauge reading',
        'a percentile against this reach\'s own last 30 days is not a return period and not a '
        + 'flood probability',
        'no bias correction against gauge records',
        'a small catchment is below the grid resolution — this is reliable for the Indus, '
        + 'Chenab, Jhelum and Kabul, and not for a local nullah'
      ]
    };
  }

  G.AGN.glofasLive = {
    fetch:fetchPoint, build:build, nearestBarrage:nearestBarrage,
    clear:function () { CACHE = Object.create(null); },
    version:'v89.43'
  };
})(window);
