


(function (G) {
  'use strict';
  G.AGN = G.AGN || {};
  var D = G.document;

  var LAST = null, BUSY = false;
  

  var RUNS = Object.create(null);

  var REFERENCE = {
    source: 'global reanalysis (archive)',
    isObservation: false,
    why: 'global reanalysis is a reanalysis — a model run constrained by observations, not an '
       + 'observation. Agreement with it is agreement with global reanalysis.',
    confounds: [
      'The reference reanalysis comes from the same centre as one of the scored models and shares its model physics, so '
      + 'scoring that centre\'s forecast model against it flatters it. These scores describe how wrong a '
      + 'forecast has been; they cannot be used to argue one provider beats another.',
      'global reanalysis precipitation is a model product and convective rainfall over Pakistan is '
      + 'its weakest regime, so the precipitation scores here are weaker evidence than '
      + 'the temperature scores beside them.'
    ]
  };

  function reg(k, fb) { try { return G.FR('skill.' + k); } catch (_) { return fb; } }
  function num(v) {
    return (v === null || v === undefined || v === '' || !isFinite(Number(v))) ? null : Number(v);
  }
  function iso(d) { return d.toISOString().slice(0, 10); }

  

  function score(pairs, opts) {
    opts = opts || {};
    var minPairs = reg('minPairs', 120), minEvents = reg('minEvents', 20);
    var n = pairs.length;
    var out = { n:n, minPairs:minPairs, reference:REFERENCE.source,
                referenceIsObservation:false };
    if (n < minPairs) {
      out.usable = false;
      out.why = n + ' forecast-reference pair' + (n === 1 ? '' : 's') + ', below the '
              + minPairs + ' this build requires before reporting an error. A score on '
              + n + ' pairs is not a smaller version of a score on ' + minPairs
              + ' — it is a different claim, and it is not made here.';
      return out;
    }
    var d = pairs.map(function (p) { return p.f - p.o; });
    var bias = d.reduce(function (a, x) { return a + x; }, 0) / n;
    var mae = d.reduce(function (a, x) { return a + Math.abs(x); }, 0) / n;
    var rmse = Math.sqrt(d.reduce(function (a, x) { return a + x * x; }, 0) / n);
    out.usable = true; out.bias = bias; out.mae = mae; out.rmse = rmse;
    out.why = n + ' hourly pairs against ' + REFERENCE.source;

    if (opts.threshold != null) {
      var th = opts.threshold, hit = 0, miss = 0, fa = 0, cn = 0;
      pairs.forEach(function (p) {
        var f = p.f >= th, o = p.o >= th;
        if (f && o) hit++; else if (f && !o) fa++; else if (!f && o) miss++; else cn++;
      });
      var events = hit + miss;
      out.events = { threshold:th, hit:hit, miss:miss, falseAlarm:fa, correctNegative:cn,
                     observed:events, minEvents:minEvents };
      if (events < minEvents) {
        

        out.events.usable = false;
        out.events.pod = null; out.events.far = null;
        out.events.why = events + ' observed event hour' + (events === 1 ? '' : 's') + ' at '
                       + th + ' mm/h, below the ' + minEvents + ' needed. '
                       + (events === 0
                           ? 'There were no events to forecast, which is not the same as a '
                             + 'forecast that missed them, and no hit rate is reported.'
                           : 'A hit rate over this few events is noise.');
      } else {
        out.events.usable = true;
        out.events.pod = hit / events;
        out.events.far = (hit + fa) ? fa / (hit + fa) : null;
        out.events.why = 'of ' + events + ' observed event hours at ' + th + ' mm/h, '
                       + hit + ' were forecast; ' + fa + ' forecast hours did not verify';
      }
    }
    return out;
  }

  

  function probeSystem(model, lat, lon, variable) {
    var v = (variable || 'temperature_2m') + '_previous_day3';
    /* v91.17.283.15 · the server's previous-runs record of the place (GET /api/pointstate/product name=prevruns) */
    return G.AGN.api.product('prevruns', { latitude: lat, longitude: lon, hourly: v, past_days: 5, forecast_days: 1, models: model, timezone: 'UTC' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      var h = (j && j.hourly) || {};
      var series = h[v] || [];
      var nn = series.filter(function (x) { return num(x) !== null; }).length;
      return { model:model, fieldReturned: Object.prototype.hasOwnProperty.call(h, v),
               values:series.length, nonNull:nn, retrievable: nn > 0,
               why: nn > 0
                 ? (nn + ' of ' + series.length + ' values returned — lead-resolved history '
                    + 'is retrievable for this system')
                 : ('the endpoint returned the ' + v + ' field with ' + nn + ' of '
                    + series.length + ' values non-null. Accepted is not available: there is '
                    + 'no archived forecast at a known lead to score.') };
    }).catch(function (e) {
      return { model:model, fieldReturned:null, values:0, nonNull:0, retrievable:false,
               why:'the previous-runs endpoint did not answer for this system: '
                  + String((e && e.message) || e) };
    });
  }

   
  function verifyPoint(pt, variable, leads, model) {
    var lag = reg('era5LagDays', 3), win = reg('windowDays', 10);
    var end = new Date(Date.now() - lag * 86400000);
    var start = new Date(end.getTime() - win * 86400000);
    var fields = leads.map(function (l) { return variable + '_previous_day' + l; }).join(',');
    /* v91.17.283.15 · the server's records of the place: past forecasts at fixed leads (prevruns) and the reanalysis truth (archive) */
    var J = function (name, q) {
      return G.AGN.api.product(name, q).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    };
    return Promise.all([J('prevruns', { latitude: pt.lat, longitude: pt.lon, hourly: fields, past_days: win + lag, forecast_days: 1, models: model, timezone: 'UTC' }),
      J('archive', { models: 'era5', latitude: pt.lat, longitude: pt.lon, start_date: iso(start), end_date: iso(end), hourly: variable, timezone: 'UTC' })]).then(function (both) {
      var f = both[0].hourly || {}, o = both[1].hourly || {};
      var truth = Object.create(null);
      (o.time || []).forEach(function (t, i) {
        var v = num((o[variable] || [])[i]);
        if (v !== null) truth[t] = v;
      });
      var byLead = {};
      leads.forEach(function (l) {
        var s = f[variable + '_previous_day' + l] || [], pairs = [];
        (f.time || []).forEach(function (t, i) {
          var fv = num(s[i]), ov = truth[t];
          if (fv === null || ov === undefined) return;
          pairs.push({ t:t, f:fv, o:ov });
        });
        byLead[l] = score(pairs, variable === 'precipitation'
          ? { threshold: reg('rainThresholdMm', 0.1) } : {});
      });
      return { point:pt, variable:variable, model:model, leads:byLead,
               window:{ from:iso(start), to:iso(end) } };
    }).catch(function (e) {
      return { point:pt, variable:variable, model:model, leads:{}, failed:true,
               why:'verification did not run for this point: ' + String((e && e.message) || e) };
    });
  }

   
  function pool(perPoint, leads) {
    var out = {};
    leads.forEach(function (l) {
      var n = 0, sBias = 0, sAbs = 0, sSq = 0, used = 0, spread = [];
      perPoint.forEach(function (p) {
        var s = p.leads && p.leads[l];
        if (!s || !s.usable) return;
        n += s.n; sBias += s.bias * s.n; sAbs += s.mae * s.n; sSq += s.rmse * s.rmse * s.n;
        used++; spread.push({ name:p.point.name, mae:s.mae });
      });
      if (!used) { out[l] = { usable:false, n:0, why:'no point produced a usable score at this lead' }; return; }
      spread.sort(function (a, b) { return a.mae - b.mae; });
      out[l] = { usable:true, n:n, points:used,
                 bias:sBias / n, mae:sAbs / n, rmse:Math.sqrt(sSq / n),
                 best:spread[0], worst:spread[spread.length - 1],
                  
                 why:'pooled over ' + used + ' points and ' + n + ' hourly pairs; per-point MAE '
                    + 'ran ' + spread[0].mae.toFixed(2) + ' at ' + spread[0].name + ' to '
                    + spread[spread.length - 1].mae.toFixed(2) + ' at '
                    + spread[spread.length - 1].name + ', a wider range than the lead effect '
                    + 'itself — read the per-point rows, not this one alone' };
    });
    return out;
  }

   
  function weightingVerdict(probes) {
    var retrievable = probes.filter(function (p) { return p.retrievable; });
    var missing = probes.filter(function (p) { return !p.retrievable; });
    if (missing.length) {
      return {
        settled:false, changeWeighting:false,
        why:'a skill comparison needs both systems measured on the same footing. '
          + missing.map(function (m) { return m.model + ': ' + m.why; }).join(' ')
          + ' The member-count split therefore stands — it is not a claim that the systems '
          + 'are equally skilful, it is the absence of a measurement that could say '
          + 'otherwise.',
        settledBy:'forward verification: both systems are logged live to the session ledger, '
          + 'and once those forecasts pass their valid time global reanalysis can score them like for '
          + 'like. That is the route that settles this, and it needs elapsed time rather '
          + 'than another request.',
        retrievable:retrievable.map(function (p) { return p.model; }),
        unretrievable:missing.map(function (p) { return p.model; })
      };
    }
    return { settled:false, changeWeighting:false,
             why:'both systems are retrievable, but this build does not move a published '
               + 'weighting on a single window of one variable. The comparison is reported '
               + 'and the weighting is left where it is.',
             retrievable:retrievable.map(function (p) { return p.model; }), unretrievable:[] };
  }

  

  var UNRESOLVED = [];
  var DEFAULT_WANT = ['Islamabad', 'Lahore', 'South Karachi', 'Gilgit', 'Quetta', 'Sukkur',
                      'Peshawar', 'Muzaffarabad'];
  

  function defaultPoints(wantIn) {
    var want = (wantIn && wantIn.length) ? wantIn : DEFAULT_WANT;
    var out = []; UNRESOLVED = [];
    try {
      var C = G.PK_DISTRICT_CENTROIDS || [];
      want.forEach(function (w) {
        for (var i = 0; i < C.length; i++) {
          var c = C[i];
          if (!c || c.lat == null) continue;
          if (String(c.tehsil || '').toLowerCase() === w.toLowerCase()
           || String(c.district || '').toLowerCase() === w.toLowerCase()) {
            out.push({ name:w, lat:c.lat, lon:c.lon }); return;
          }
        }
        UNRESOLVED.push(w);
      });
    } catch (_) {}
    if (!out.length) out = [{ name:'Islamabad', lat:33.68, lon:73.05 }];
    return out;
  }

  function run(opts) {
    if (BUSY) return Promise.resolve(LAST);
    opts = opts || {};
    BUSY = true;
    var leads = reg('leads', [1, 2, 3, 5, 7]);
    var pts = opts.points || defaultPoints();
    var variable = opts.variable || 'temperature_2m';
    var systems = ['ecmwf_ifs025', 'google_weathernext2_ensemble'];
    var p0 = pts[0];
    return Promise.all(systems.map(function (m) {
      return probeSystem(m, p0.lat, p0.lon, variable);
    })).then(function (probes) {
      var usable = probes.filter(function (p) { return p.retrievable; });
      if (!usable.length) {
        LAST = { ok:false, probes:probes, reference:REFERENCE,
                 why:'no system returned a lead-resolved history, so no skill can be measured '
                    + 'from archived forecasts at all' };
        return LAST;
      }
      var model = usable[0].model;
      return Promise.all(pts.map(function (pt) {
        return verifyPoint(pt, variable, leads, model);
      })).then(function (perPoint) {
        LAST = { ok:true, model:model, variable:variable, leads:leads,
                 reference:REFERENCE, probes:probes,
                 perPoint:perPoint, pooled:pool(perPoint, leads),
                 unresolvedPoints:UNRESOLVED.slice(),
                 weighting:weightingVerdict(probes),
                 at:new Date().toISOString() };
        RUNS[variable] = LAST;
        try { if (G.AGN.ledger && G.AGN.ledger.fileSkill) G.AGN.ledger.fileSkill(LAST); } catch (_) {}
        try { D.dispatchEvent(new CustomEvent('agn:skill', { detail:LAST })); } catch (_) {}
        return LAST;
      });
    }).catch(function (e) {
      LAST = { ok:false, reference:REFERENCE,
               why:'the verification run failed: ' + String((e && e.message) || e) };
      return LAST;
    }).then(function (v) { BUSY = false; return v; },
            function (e) { BUSY = false; throw e; });
  }

  

  function runAll(opts) {
    var list = [];
    try { list = G.FR('skill.verifiableVariables') || []; } catch (_) { list = ['temperature_2m']; }
    var out = [];
    return list.reduce(function (chain, v) {
      return chain.then(function () {
        return run(Object.assign({}, opts || {}, { variable:v })).then(function (r) {
          out.push({ variable:v, ok:!!(r && r.ok) });
        });
      });
    }, Promise.resolve()).then(function () {
      return { ran:out, runs:Object.keys(RUNS) };
    });
  }

  G.AGN.skill = {
    run:run, runAll:runAll, runs:function () { return RUNS; },
    score:score, pool:pool, probeSystem:probeSystem, verifyPoint:verifyPoint,
    weightingVerdict:weightingVerdict, defaultPoints:defaultPoints,
    REFERENCE:REFERENCE, unresolved:function () { return UNRESOLVED.slice(); },
    DEFAULT_WANT:DEFAULT_WANT,
    last:function () { return LAST; }, version:'v89.41'
  };
})(window);
