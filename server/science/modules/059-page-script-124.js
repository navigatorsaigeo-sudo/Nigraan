


(function (G) {
  'use strict';
  G.AGN = G.AGN || {};

  function reg(p) { return G.FR('field.' + p); }
  function num(v) { return (v === null || v === undefined || v === '') ? null
                         : (isFinite(Number(v)) ? Number(v) : null); }

  var R_EARTH_KM = 6371.0088;   
  function haversineKm(aLat, aLon, bLat, bLon) {
    var p1 = aLat * Math.PI / 180, p2 = bLat * Math.PI / 180;
    var dp = p2 - p1, dl = (bLon - aLon) * Math.PI / 180;
    var h = Math.sin(dp / 2) * Math.sin(dp / 2)
          + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function spec(varName) {
    var t = reg('estimable');
    return (t && t[varName]) || null;
  }
  function estimable(varName) {
    var s = spec(varName);
    return !!(s && s.estimate === true);
  }
  

  function contextOnly(varName) {
    var s = spec(varName);
    return !!(s && s.contextOnly === true);
  }
  function neverScores(varName) {
    var s = spec(varName);
    return (s && Array.isArray(s.neverScores)) ? s.neverScores.slice() : [];
  }
  function refusalFor(varName) {
    var s = spec(varName);
    if (!s) return 'no verdict is recorded for "' + varName + '", so it is not estimated';
    if (s.estimate === true) return null;
    return s.why;
  }

  

  function estimateAt(target, live, varName) {
    var s = spec(varName);
    if (!s || s.estimate !== true) {
      return { ok: false, value: null, variable: varName, refused: true,
               why: refusalFor(varName) };
    }
    var k = reg('kNeighbours'), bw = reg('bandwidthKm'),
        minN = reg('minNeighbours'), maxKm = reg('maxNeighbourKm'),
        lapse = reg('lapseRateCPerKm') / 1000;      

    var tLat = num(target.lat), tLon = num(target.lon);
    if (tLat === null || tLon === null)
      return { ok: false, value: null, variable: varName, refused: true,
               why: 'the target unit has no coordinates' };

    var tElev = num(target.elev);
    var reduce = s.elevationReduced === true;
    if (reduce && tElev === null)
      return { ok: false, value: null, variable: varName, refused: true,
               why: 'this variable is reduced along the lapse rate and the target unit has no '
                  + 'population-weighted elevation, so there is nothing to reduce it to' };

    var cand = [];
    for (var i = 0; i < live.length; i++) {
      var n = live[i];
      if (n === target) continue;
      var v = num(n[varName]);
      if (v === null) continue;
      var nLat = num(n.lat), nLon = num(n.lon);
      if (nLat === null || nLon === null) continue;
      var nElev = num(n.elev);
      if (reduce && nElev === null) continue;       
      var d = haversineKm(tLat, tLon, nLat, nLon);
      if (d > maxKm) continue;
      cand.push({ d: d, v: v, elev: nElev, key: n.key || null });
    }
    if (cand.length < minN) {
      return { ok: false, value: null, variable: varName, refused: true,
               neighbours: cand.length,
               why: 'only ' + cand.length + ' live unit' + (cand.length === 1 ? '' : 's')
                  + ' within ' + maxKm + ' km, below the declared minimum of ' + minN
                  + ' — an estimate here would be a statement about one or two units' };
    }
    cand.sort(function (a, b) { return a.d - b.d; });
    var use = cand.slice(0, k);

    var sw = 0, acc = 0, i2;
    for (i2 = 0; i2 < use.length; i2++) {
      var w = Math.exp(-Math.pow(use[i2].d / bw, 2));
      

      var val = reduce ? (use[i2].v - lapse * (use[i2].elev - tElev)) : use[i2].v;
      sw += w; acc += w * val;
    }
    if (!(sw > 0)) return { ok: false, value: null, variable: varName, refused: true,
                            why: 'every neighbour weight underflowed to zero' };
    var est = acc / sw;
    

    if (varName === 'relative_humidity_2m') est = Math.max(0, Math.min(100, est));
    if (varName === 'wind_speed_10m') est = Math.max(0, est);

    return {
      ok: true, value: est, variable: varName, refused: false,
      neighbours: use.length, nearestKm: use[0].d,
      meanKm: use.reduce(function (a, x) { return a + x.d; }, 0) / use.length,
      elevationReduced: reduce,
      lapseRateCPerKm: reduce ? reg('lapseRateCPerKm') : null,
      targetElevM: tElev,
      declaredRmse: s.rmse == null ? null : s.rmse, unit: s.unit || null,
      basis: reduce
        ? ('weighted mean of ' + use.length + ' live units, each moved to '
           + (tElev === null ? 'this unit' : Math.round(tElev) + ' m')
           + ' along ' + reg('lapseRateCPerKm') + ' °C/km')
        : ('weighted mean of ' + use.length + ' live units within '
           + Math.round(use[use.length - 1].d) + ' km'),
      

      contextOnly: s.contextOnly === true,
      neverScores: Array.isArray(s.neverScores) ? s.neverScores.slice() : [],
      tailWarning: (s.tailRatio60 != null)
        ? ('underestimates peaks — recovers ' + Math.round(s.tailRatio60 * 100)
           + '% of the observed mean above 60 mm and found ' + (s.podAt50 === 0 ? 'none' : 'few')
           + ' of the units above 50 mm on a flood day')
        : null,
       
      caveat: (s.contextOnly === true)
        ? 'estimated from neighbouring units — context only, and not used to score '
          + (Array.isArray(s.neverScores) ? s.neverScores.join(' or ') : 'any hazard')
        : 'estimated from neighbouring units — not a forecast for this tehsil'
    };
  }

  

  function crossValidate(live, varName, opts) {
    opts = opts || {};
    if (!estimable(varName))
      return { ok: false, variable: varName, why: refusalFor(varName) };
    var pool = live.filter(function (n) { return num(n[varName]) !== null; });
    if (pool.length < reg('minNeighbours') + 1)
      return { ok: false, variable: varName, n: pool.length,
               why: 'not enough live units to measure an error against' };

    var cap = opts.sampleMax || reg('loocvSampleMax');
    var sample = pool;
    if (pool.length > cap) {
      

      var stride = pool.length / cap, out = [];
      for (var q = 0; q < cap; q++) out.push(pool[Math.floor(q * stride)]);
      sample = out;
    }
    var errs = [], refused = 0;
    for (var i = 0; i < sample.length; i++) {
      var t = sample[i];
      var e = estimateAt(t, pool, varName);
      if (!e.ok) { refused++; continue; }
      errs.push(e.value - num(t[varName]));
    }
    var n = errs.length;
    if (!n) return { ok: false, variable: varName, why: 'every hold-out was refused', refused: refused };
    var sum = 0, sq = 0, i3;
    for (i3 = 0; i3 < n; i3++) { sum += errs[i3]; sq += errs[i3] * errs[i3]; }
    var abs = errs.map(Math.abs).sort(function (a, b) { return a - b; });
    var s = spec(varName);
    return {
      ok: true, variable: varName, n: n, refusedHoldouts: refused,
      livePool: pool.length, sampled: sample.length,
      bias: sum / n, rmse: Math.sqrt(sq / n),
      mae: abs.reduce(function (a, b) { return a + b; }, 0) / n,
      p90: abs[Math.floor(0.9 * (n - 1))], max: abs[n - 1],
      unit: s.unit || null, declaredRmse: s.rmse == null ? null : s.rmse,
      basis: 'leave-one-out over ' + n + ' of the ' + pool.length
           + ' units that answered, at the coverage in force now'
    };
  }

  

  function fill(live, targets, vars) {
    vars = vars || Object.keys(reg('estimable')).filter(estimable);
    var cv = {};
    vars.forEach(function (v) { cv[v] = crossValidate(live, v); });

    var rows = [], filled = 0, refusedUnits = 0;
    (targets || []).forEach(function (t) {
      var row = { key: t.key || null, values: {}, refusals: {} };
      var any = false;
      vars.forEach(function (v) {
        var e = estimateAt(t, live, v);
        if (e.ok) { row.values[v] = e; any = true; }
        else row.refusals[v] = e.why;
      });
      if (any) filled++; else refusedUnits++;
      rows.push(row);
    });

    var refusedVars = Object.keys(reg('estimable')).filter(function (v) { return !estimable(v); });
    return {
      live: live.length, targets: (targets || []).length,
      filled: filled, refusedUnits: refusedUnits,
      variables: vars, refusedVariables: refusedVars,
      contextVariables: vars.filter(contextOnly),
      contextWhy: vars.filter(contextOnly).reduce(function (a, v) {
        a[v] = { neverScores: neverScores(v), why: (spec(v) || {}).why }; return a; }, {}),
      refusedWhy: refusedVars.reduce(function (a, v) { a[v] = refusalFor(v); return a; }, {}),
      error: cv, rows: rows,
       
      statement: (function () {
        var t = cv.temperature_2m;
        var acc = (t && t.ok) ? (' ±' + t.rmse.toFixed(1) + ' °C measured now') : '';
        return filled + ' unit' + (filled === 1 ? '' : 's') + ' estimated from '
             + live.length + ' live neighbours' + acc
             + (refusedVars.length ? ' · ' + refusedVars.join(', ') + ' not estimated' : '');
      })()
    };
  }

  

  function provenanceOf(est) {
    if (!est || !est.ok) return { state: 'absent', source: 'field',
      why: (est && est.why) || 'no estimate' };
    return { state: 'design', source: 'field',
             why: 'estimated from ' + est.neighbours + ' live neighbours, nearest '
                + est.nearestKm.toFixed(0) + ' km — a reduction of retrieved values, '
                + 'not a forecast for this unit' };
  }

  function selfTest() {
    var out = [];
    function t(n, f) { try { var r = f(); out.push({ name: n, pass: !!r.pass, detail: r.detail }); }
                       catch (e) { out.push({ name: n, pass: false, detail: 'threw: ' + e.message }); } }
     
    var L = reg('lapseRateCPerKm') / 1000, T0 = 30;
    var live = [];
    for (var i = 0; i < 12; i++) {
      var lat = 33 + (i % 4) * 0.25, lon = 73 + Math.floor(i / 4) * 0.25, z = 200 + i * 150;
      live.push({ key: 'L' + i, lat: lat, lon: lon, elev: z,
                  temperature_2m: T0 + L * (z - 0), relative_humidity_2m: 50,
                  wind_speed_10m: 10, precipitation: 0 });
    }
    var target = { key: 'T', lat: 33.3, lon: 73.2, elev: 2500 };

    t('FD-01 an exact lapse field is recovered', function () {
      var e = estimateAt(target, live, 'temperature_2m');
      var want = T0 + L * 2500;
      return { pass: e.ok && Math.abs(e.value - want) < 1e-6,
               detail: e.ok ? ('estimated ' + e.value.toFixed(4) + ' against the exact '
                               + want.toFixed(4)) : e.why };
    });
    t('FD-02 the elevation reduction is what does it', function () {
      

      var flat = live.map(function (n) { return Object.assign({}, n, { elev: 2500 }); });
      var a = estimateAt(target, live, 'temperature_2m');
      var b = estimateAt(target, flat, 'temperature_2m');
      return { pass: a.ok && b.ok && Math.abs(a.value - b.value) > 1,
               detail: 'reduced ' + a.value.toFixed(2) + ' vs unreduced ' + b.value.toFixed(2) };
    });
    t('FD-03 precipitation is context, never a score', function () {
      

      var e = estimateAt(target, live, 'precipitation');
      var ok = e.ok === true && e.contextOnly === true
            && (e.neverScores || []).indexOf('flood') >= 0
            && /context only/i.test(e.caveat || '');
      return { pass: ok, detail: ok ? ('estimated, barred from ' + (e.neverScores || []).join(' and '))
                                    : ('contextOnly=' + e.contextOnly + ' caveat=' + (e.caveat || '')) };
    });
    t('FD-04 gusts are refused', function () {
      var e = estimateAt(target, live, 'wind_gusts_10m');
      return { pass: e.refused === true, detail: (e.why || '').slice(0, 90) };
    });
    t('FD-05 an unknown variable is refused, not guessed', function () {
      var e = estimateAt(target, live, 'sea_surface_temperature');
      return { pass: e.refused === true && e.value === null, detail: e.why };
    });
    t('FD-06 too few neighbours refuses', function () {
      var e = estimateAt(target, live.slice(0, 2), 'temperature_2m');
      return { pass: e.refused === true, detail: e.why };
    });
    t('FD-07 distance refuses before it extrapolates', function () {
      var far = live.map(function (n) { return Object.assign({}, n, { lat: n.lat + 20 }); });
      var e = estimateAt(target, far, 'temperature_2m');
      return { pass: e.refused === true && /km/.test(e.why || ''), detail: e.why };
    });
    t('FD-08 a target with no elevation refuses a reduced variable', function () {
      var e = estimateAt({ key: 'X', lat: 33.3, lon: 73.2 }, live, 'temperature_2m');
      return { pass: e.refused === true, detail: e.why };
    });
    t('FD-09 an estimate is design, never retrieved', function () {
      var e = estimateAt(target, live, 'temperature_2m');
      var p = provenanceOf(e);
      var q = null;
      try { q = G.AGN.prov ? G.AGN.prov.of(p.state) : null; } catch (_) {}
      return { pass: p.state === 'design' && (!q || q.state === 'design'),
               detail: p.state + ' · ' + p.why.slice(0, 70) };
    });
    t('FD-10 the error is measured, not declared', function () {
      var cv = crossValidate(live, 'temperature_2m');
      return { pass: cv.ok && cv.rmse < 1e-6,
               detail: cv.ok ? ('an exact field cross-validates to RMSE ' + cv.rmse.toExponential(1)
                                + ' over ' + cv.n + ' hold-outs') : cv.why };
    });
    t('FD-11 a noisy field reports a real error', function () {
      var noisy = live.map(function (n, i) {
        return Object.assign({}, n, { temperature_2m: n.temperature_2m + ((i % 3) - 1) * 2 }); });
      var cv = crossValidate(noisy, 'temperature_2m');
      return { pass: cv.ok && cv.rmse > 0.5,
               detail: cv.ok ? ('RMSE ' + cv.rmse.toFixed(2) + ' °C over ' + cv.n + ' hold-outs')
                             : cv.why };
    });
    t('FD-12 fill separates refused from context-only', function () {
      var f = fill(live, [target]);
      var ok = f.refusedVariables.indexOf('wind_gusts_10m') >= 0
            && !!f.refusedWhy.wind_gusts_10m
            && f.contextVariables.indexOf('precipitation') >= 0
            && f.refusedVariables.indexOf('precipitation') < 0;
      return { pass: ok, detail: 'refused ' + f.refusedVariables.join(', ')
                               + ' · context ' + f.contextVariables.join(', ') };
    });
    t('FD-13 the declared rate is the registry’s', function () {
      var e = estimateAt(target, live, 'temperature_2m');
      return { pass: e.ok && e.lapseRateCPerKm === G.FR('field.lapseRateCPerKm'),
               detail: 'uses ' + (e.ok ? e.lapseRateCPerKm : '?') + ' °C/km' };
    });

    var passed = out.filter(function (x) { return x.pass; }).length;
    return { checks: out, passed: passed, total: out.length, ok: passed === out.length };
  }

  G.AGN.field = {
    estimateAt: estimateAt, crossValidate: crossValidate, fill: fill,
    estimable: estimable, refusalFor: refusalFor, spec: spec,
    contextOnly: contextOnly, neverScores: neverScores,
    provenanceOf: provenanceOf, haversineKm: haversineKm,
    selfTest: selfTest, version: 'v89.28'
  };
})(window);
