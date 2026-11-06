


(function (G) {
  'use strict';
  G.AGN = G.AGN || {};

  

  var UNVERIFIABLE = {
    wind_gusts_10m: 'the lead-resolved forecast history returns the field with 0 of 144 '
                  + 'values non-null, so there is no archived gust forecast at a known lead '
                  + 'to score. Sustained wind is verifiable and is NOT substituted here: a '
                  + 'gust is not a sustained wind and its error is not the sustained wind\'s.',
    cape:           'neither side of the comparison exists — the forecast history returns 0 '
                  + 'of 144 values and the global reanalysis archive serves no CAPE series at all.',
    soil_moisture_0_to_7cm: 'the lead-resolved forecast history returns 0 of 144 values.'
  };

  function reg(k, fb) { try { return G.FR('skill.' + k); } catch (_) { return fb; } }
  function verifiable(v) {
    var list = reg('verifiableVariables', []);
    return Array.isArray(list) ? list.indexOf(v) >= 0 : false;
  }

  

  function nearestLead(leadMin, leads) {
    var days = (leadMin == null) ? 0 : leadMin / 1440;
    var ls = (leads || []).slice().sort(function (a, b) { return a - b; });
    if (!ls.length) return null;
    if (days <= ls[0]) {
      return { lead: ls[0], exact: false, upperBound: true,
               why: 'the crossing is ' + Math.round(leadMin) + ' minutes out, a shorter lead '
                  + 'than the shortest measured (day ' + ls[0] + '), so the day ' + ls[0]
                  + ' error is used as an upper bound' };
    }
    var best = ls[0];
    for (var i = 0; i < ls.length; i++) {
      if (Math.abs(ls[i] - days) < Math.abs(best - days)) best = ls[i];
    }
    return { lead: best, exact: Math.abs(best - days) < 0.5, upperBound: false,
             why: 'matched to the measured day ' + best + ' error' };
  }

  

  function haversineKm(a, b) {
    var R = 6371, toR = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
    var s1 = Math.sin(dLat / 2), s2 = Math.sin(dLon / 2);
    var h = s1 * s1 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * s2 * s2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  

  function nearestPoint(run, place) {
    var pts = (run && run.perPoint) || [];
    if (!place || place.lat == null) return null;
    var best = null, bestKm = Infinity;
    pts.forEach(function (p) {
      if (!p.point || p.point.lat == null) return;
      var km = haversineKm(place, p.point);
      if (km < bestKm) { bestKm = km; best = p; }
    });
    return best ? { point:best, km:bestKm } : null;
  }

  function errorFor(runs, variable, place, leadMin) {
    if (!verifiable(variable)) {
      return { available:false, variable:variable,
               why: UNVERIFIABLE[variable]
                 || (variable + ' is not in the measured-verifiable set for this build'),
               borrowed:false };
    }
    var run = runs && runs[variable];
    if (!run || !run.ok) {
      return { available:false, variable:variable, borrowed:false,
               why:'no verification run has been completed for ' + variable + ' in this '
                  + 'session, so no error has been measured to attach' };
    }
    var nl = nearestLead(leadMin, run.leads);
    if (!nl) {
      return { available:false, variable:variable, borrowed:false,
               why:'the verification run reported no leads' };
    }
    var label = (place && place.name) || 'this point';
    var radius = reg('errorRadiusKm', 150);
    var near = nearestPoint(run, place);
    var far = near && near.km > radius;
    var s = (near && !far) ? (near.point.leads && near.point.leads[nl.lead]) : null;
    if (s && s.usable) {
      return { available:true, variable:variable, borrowed:false, scope:'point',
               point:near.point.point.name, km:Math.round(near.km), lead:nl.lead,
               upperBound:nl.upperBound, mae:s.mae, rmse:s.rmse, n:s.n,
               why:'measured at ' + near.point.point.name + ', ' + Math.round(near.km)
                  + ' km from ' + label + ', ' + nl.why + ', on ' + s.n + ' pairs' };
    }
    var pooled = run.pooled && run.pooled[nl.lead];
    if (pooled && pooled.usable) {
      return { available:true, variable:variable, borrowed:false, scope:'national',
               point:label, km:(near ? Math.round(near.km) : null), lead:nl.lead,
               upperBound:nl.upperBound, mae:pooled.mae, rmse:pooled.rmse, n:pooled.n,
               why:(far
                     ? ('the nearest verified point is ' + near.point.point.name + ', '
                        + Math.round(near.km) + ' km away — beyond the ' + radius
                        + ' km at which this build will call a score local')
                     : ('no usable score at the nearest verified point'))
                  + ', so the pooled national figure for day ' + nl.lead + ' is used. '
                  + (pooled.why || '') };
    }
    return { available:false, variable:variable, borrowed:false,
             why:'the verification run produced no usable score for ' + variable
                + ' at day ' + nl.lead };
  }

  

  function assess(err, limit, dir, peak, ratePerHour) {
    var out = { error:err };
    if (!err || !err.available) {
      out.assessed = false;
      out.why = err ? err.why : 'no error information';
      return out;
    }
    var scale = (reg('marginScale', 'rmse') === 'mae') ? err.mae : err.rmse;
    out.scale = scale; out.scaleName = reg('marginScale', 'rmse');
    if (peak == null || !isFinite(peak)) {
      out.assessed = false;
      out.why = 'no forecast peak was available to compare against the limit';
      return out;
    }
    

    var margin = (dir === 'below') ? (limit - peak) : (peak - limit);
    var S = scale.toFixed(2), U = out.scaleName.toUpperCase();
    out.peak = peak; out.margin = margin;
    out.exceedance = (margin >= 0) ? margin : null;
    out.clearance = (margin < 0) ? -margin : null;
    out.passesLimit = margin >= 0;
    out.insideError = Math.abs(margin) < scale;
    if (margin >= 0) {
      out.verdict = out.insideError ? 'crossing-inside-error' : 'crossing-beyond-error';
      out.why = out.insideError
        ? ('the forecast passes the limit by ' + margin.toFixed(2) + ', less than the measured '
           + U + ' of ' + S + ' for this variable at this place and lead — the crossing is '
           + 'inside the forecast\'s own error and the time beside it is not separable from '
           + 'noise')
        : ('the forecast passes the limit by ' + margin.toFixed(2) + ' against a measured '
           + U + ' of ' + S + ' — the exceedance is larger than the error');
    } else {
      out.verdict = out.insideError ? 'clear-inside-error' : 'clear-beyond-error';
      out.why = out.insideError
        ? ('the forecast stays ' + (-margin).toFixed(2) + ' short of the limit, less than the '
           + 'measured ' + U + ' of ' + S + ' — this is not safely clear, it is clear by less '
           + 'than the forecast\'s own error')
        : ('the forecast stays ' + (-margin).toFixed(2) + ' short of the limit, more than the '
           + 'measured ' + U + ' of ' + S + ' — clear by more than the error');
    }
    out.assessed = true;

    

    if (ratePerHour != null && isFinite(ratePerHour) && Math.abs(ratePerHour) > 1e-6) {
      out.timingUncertaintyMin = Math.round(Math.abs(scale / ratePerHour) * 60);
      out.timingWhy = 'at the forecast rate of ' + ratePerHour.toFixed(2) + ' per hour, an '
                    + out.scaleName.toUpperCase() + ' of ' + scale.toFixed(2) + ' is about '
                    + out.timingUncertaintyMin + ' minutes of timing uncertainty';
    } else {
      out.timingUncertaintyMin = null;
      out.timingWhy = 'no rate of change was available, so the value error is not converted '
                    + 'into a timing window';
    }
    return out;
  }

  G.AGN.confidence = {
    errorFor:errorFor, assess:assess, nearestLead:nearestLead, verifiable:verifiable,
    UNVERIFIABLE:UNVERIFIABLE, version:'v89.41'
  };
})(window);
