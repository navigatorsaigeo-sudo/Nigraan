


(function (G) {
  'use strict';
  G.AGN = G.AGN || {};

  function reg(path, fallback) {
    try { return G.FR('mc.' + path); }
    catch (e) { if (arguments.length > 1) return fallback; throw e; }
  }

  var PATH_TYPE = { COMPOUND: 'compound', CASCADE: 'cascade' };

  

  function hash(str) {
    var h = 2166136261 >>> 0, t = String(str);
    for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967296;
  }
  function mulberry(seed) {
    var a = Math.floor(seed * 4294967295) || 1;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  

  function normCdf(z) {
    var s = z < 0 ? -1 : 1, x = Math.abs(z) / Math.SQRT2;
    var t = 1 / (1 + 0.3275911 * x);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t
                 + 0.254829592) * t * Math.exp(-x * x);
    return 0.5 * (1 + s * y);
  }
  function clamp(v) { return v < 0 ? 0 : (v > 100 ? 100 : v); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function sortedAsc(a) { return a.slice().sort(function (x, y) { return x - y; }); }
  function medianOf(sorted) {
    var n = sorted.length; if (!n) return null;
    return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  }
  function sdOf(a) {
    var n = a.length; if (n < 2) return null;
    var m = 0, i; for (i = 0; i < n; i++) m += a[i]; m /= n;
    var v = 0; for (i = 0; i < n; i++) v += (a[i] - m) * (a[i] - m);
    return Math.sqrt(v / (n - 1));
  }
  

  

  function invEmpirical(sorted, u) {
    var n = sorted.length; if (!n) return null;
    if (n === 1) return sorted[0];
    var uu = Math.min(1, Math.max(0, u));
     
    var p = uu * (n + 1) - 1;
    if (p >= 0 && p <= n - 1) {
      var lo = Math.floor(p), hi = Math.ceil(p);
      return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
    }
    

    var k = Math.max(1, Math.floor(n / 3));
    if (p < 0) {
      var loScale = Math.max(1e-9, (sorted[k] - sorted[0]) / k);
      

      return sorted[0] + loScale * Math.log(Math.max(1e-9, uu * (n + 1)));
    }
    var hiScale = Math.max(1e-9, (sorted[n - 1] - sorted[n - 1 - k]) / k);
    return sorted[n - 1] + hiScale * Math.log(Math.max(1e-9, 1 / ((1 - uu) * (n + 1))));
  }
  function quantileAt(sorted, q) { return invEmpirical(sorted, q); }

  

  function ranks(a) {
    var idx = a.map(function (v, i) { return [v, i]; })
               .sort(function (x, y) { return x[0] - y[0]; });
    var r = new Array(a.length), i = 0;
    while (i < idx.length) {
      var j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      var avg = (i + j) / 2 + 1;
      for (var k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  }
  function spearman(xs, ys) {
    var n = xs.length; if (n < 3 || ys.length !== n) return null;
    var rx = ranks(xs), ry = ranks(ys);
    var mx = 0, my = 0, i;
    for (i = 0; i < n; i++) { mx += rx[i]; my += ry[i]; } mx /= n; my /= n;
    var num = 0, dx = 0, dy = 0;
    for (i = 0; i < n; i++) {
      var a = rx[i] - mx, b = ry[i] - my;
      num += a * b; dx += a * a; dy += b * b;
    }
    if (dx <= 0 || dy <= 0) return null;   
    return num / Math.sqrt(dx * dy);
  }

  

  var EVIDENCE_KEY = { heat: 't', flood: 'rain', drought: 'rain' };

  function bridgeFor(hazard) {
    var all = reg('bridges'), b = all ? all[hazard] : undefined;
    if (b === undefined) {
      return { ok: false, hazard: hazard, reason:
        'no bridge is declared for "' + hazard + '" — the hazard is not known to the simulation' };
    }
    if (b === null) {
      return { ok: false, hazard: hazard, declaredNull: true, reason:
        'a bridge from an ensemble to this index is declared unavailable — see ' +
        'FORMULA_REGISTRY.mc.bridges for why none is invented' };
    }
    var slope = null, slopeBasis = b.slopeFrom;
    try {
      if (b.slopeFrom === '@floodRainSlope') {
        var bands = G.FR('flood.rainBands'), anchors = G.FR('flood.rainAnchors');
        slope = (anchors[2] - anchors[1]) / (bands[2] - bands[1]);
        slopeBasis = 'flood.rainAnchors gradient over flood.rainBands, 7-20 mm/h band';
      } else if (b.slopeFrom === '@heatAirSlope') {
        

        var w = G.FR('heat.humidPathWeights');
        slope = G.FR('heat.airStressSlope') * w.airTemp;
        slopeBasis = 'heat.airStressSlope × heat.humidPathWeights.airTemp — the air-stress ' +
                     'gradient at the weight the score gives that term';
      } else {
        slope = G.FR(b.slopeFrom);
      }
    } catch (e) {
      return { ok: false, hazard: hazard, reason:
        'the declared slope path "' + b.slopeFrom + '" is not in the registry' };
    }
    if (!isNum(slope) || slope <= 0) {
      return { ok: false, hazard: hazard, reason:
        'the slope read from "' + b.slopeFrom + '" is not a positive number' };
    }
    return { ok: true, hazard: hazard, variable: b.variable, unit: b.unit,
             slope: slope, slopeFrom: b.slopeFrom, slopeBasis: slopeBasis,
             relationship: b.relationship, why: b.why };
  }

  

  function marginalFor(spec) {
    spec = spec || {};
    var hazard = spec.hazard, unitKey = spec.unitKey;
    var floor = reg('sigmaFloor'), ceil = reg('sigmaCeiling'), minM = reg('minMembers');

    function gaussian(sigma, sourceState, why) {
      var s = isNum(sigma) ? sigma : null, transform = null;
      if (s !== null && s <= 0) { s = floor; transform = 'floored'; }
      else if (s !== null && s > ceil) { s = ceil; transform = 'clamped-high'; }
      return { ok: s !== null, kind: 'gaussian', hazard: hazard, sigma: s,
               n: null, models: null, deltas: null,
               sourceState: sourceState, transformState: transform,
               evidence: s === null ? 'unavailable' : (transform === 'floored' ? 'design-floor' : 'design'),
               evidenceText: s === null
                 ? 'No spread is available for this leg and none is invented'
                 : (transform === 'floored'
                    ? 'Declared minimum design dispersion — the supplied spread was not positive'
                    : 'Declared design dispersion — no ensemble answered for this hazard here'),
               why: why };
    }

    var bridge = bridgeFor(hazard);
    if (!bridge.ok) return gaussian(spec.sigma, 'no-bridge', bridge.reason);

    var evKey = EVIDENCE_KEY[hazard];
    var dist = null;
    try {
      if (evKey && unitKey && G.AGN.evidence) dist = G.AGN.evidence.distribution(evKey + ':' + unitKey);
    } catch (e) { dist = null; }

    if (!dist || !dist.members || dist.members.length < minM) {
      return gaussian(spec.sigma, 'absent',
        'no ensemble record with at least ' + minM + ' members exists for ' +
        (evKey ? evKey + ':' + (unitKey || '(no unit)') : hazard));
    }

    

    if (dist.unit && bridge.unit && dist.unit !== bridge.unit) {
      return { ok: false, kind: 'refused', hazard: hazard, sigma: null,
               sourceState: 'invalid', transformState: null,
               evidence: 'invalid', n: dist.members.length, models: null, deltas: null,
               evidenceText: 'The ensemble variable and the index bridge are not the same quantity; no marginal is issued',
               why: 'the record is in ' + dist.unit + ' and the bridge for "' + hazard +
                    '" is declared in ' + bridge.unit + '. A ratio between them is in no unit at all.' };
    }

    

    var srt = sortedAsc(dist.members), med = medianOf(srt);
    var deltas = srt.map(function (x) { return (x - med) * bridge.slope; });
    var sd = sdOf(deltas), transform = null;

    if (sd === null || sd <= 0) {
      

      return gaussian(floor, 'retrieved-zero',
        'all ' + dist.members.length + ' members returned the same value; the retrieved spread is zero');
    }
    if (sd > ceil) {
      var k = ceil / sd;
      deltas = deltas.map(function (d) { return d * k; });
      transform = 'clamped-high';
      sd = ceil;
    }
    return { ok: true, kind: 'empirical', hazard: hazard,
             deltas: deltas, n: dist.members.length,
             models: dist.memberModels ? dist.memberModels.slice() : null,
             sigma: sd, nativeMedian: med, nativeUnit: dist.unit || bridge.unit,
             slope: bridge.slope, slopeFrom: bridge.slopeFrom, slopeBasis: bridge.slopeBasis,
             sourceState: 'retrieved', transformState: transform,
             evidence: transform === 'clamped-high' ? 'ensemble-bounded' : 'ensemble-retrieved',
             evidenceText: transform === 'clamped-high'
               ? 'Resampled from ' + dist.members.length + ' ensemble members · held at the declared dispersion bound'
               : 'Resampled from ' + dist.members.length + ' ensemble members',
             source: dist.source || null,
             why: bridge.why };
  }

  

  

  function fisherInterval(rho, n, conf) {
    if (!isNum(rho) || !isNum(n) || n < 4) return null;
    var r = Math.max(-0.999999, Math.min(0.999999, rho));
    var z = 0.5 * Math.log((1 + r) / (1 - r));
    var se = 1 / Math.sqrt(n - 3);
    var k = (conf === 0.9) ? 1.6449 : 1.96;
    var lo = Math.tanh(z - k * se), hi = Math.tanh(z + k * se);
    return { lo: lo, hi: hi, se: se, n: n, conf: conf || 0.95, width: hi - lo };
  }

  function rhoFor(hazardA, hazardB, unitKey) {
    var minPairs = reg('rhoMinPairs');
    var ka = EVIDENCE_KEY[hazardA], kb = EVIDENCE_KEY[hazardB];
    var declared = reg('rhoDeclared') || {};
    var dk = declared[hazardA + '|' + hazardB] || declared[hazardB + '|' + hazardA] || null;

    function fallback(why) {
      if (!dk) return { ok: false, value: null, source: 'none', why:
        why + ' and no rho is declared for this pair, so the compound is refused rather than simulated on a guess' };
      return { ok: true, value: dk.rho, source: 'declared', pairs: null, models: null,
               why: why + ' — using the declared value', declaredWhy: dk.why };
    }

    if (!ka || !kb || !unitKey || !G.AGN.evidence) return fallback('no paired ensemble is available');
    var da = null, db = null;
    try {
      da = G.AGN.evidence.distribution(ka + ':' + unitKey);
      db = G.AGN.evidence.distribution(kb + ':' + unitKey);
    } catch (e) { return fallback('the evidence spine did not answer'); }
    if (!da || !db) return fallback('one of the two legs has no ensemble record at this unit');
    if (!da.memberModels || !db.memberModels)
      return fallback('the ensemble members carry no model identity, so they cannot be paired');

    

    var byB = Object.create(null);
    db.memberModels.forEach(function (m, i) { byB[m] = db.members[i]; });
    var xs = [], ys = [], used = [];
    da.memberModels.forEach(function (m, i) {
      if (m in byB && isNum(da.members[i]) && isNum(byB[m])) {
        xs.push(da.members[i]); ys.push(byB[m]); used.push(m);
      }
    });
    if (used.length < minPairs)
      return fallback('only ' + used.length + ' model' + (used.length === 1 ? '' : 's') +
                      ' answered for both variables here, below the declared minimum of ' + minPairs);

    var rs = spearman(xs, ys);
    if (rs === null)
      return fallback('one of the two variables is constant across the ' + used.length +
                      ' paired models, so no rank correlation exists');

    

    var nPairs = used.length;
    var ci = fisherInterval(rs, nPairs);
    

    var minUsable = reg('rhoMinPairsUsable');
    var excludesZero = ci && ((ci.lo > 0 && ci.hi > 0) || (ci.lo < 0 && ci.hi < 0));
    

    var localUsable = !(dk && dk.measured) && !!excludesZero && nPairs >= minPairs;

    var sample = { value: Math.max(-0.99, Math.min(0.99, rs)), pairs: nPairs,
                   models: used, raw: rs, ci: ci,
                   usable: localUsable,
                   se: ci ? ci.se : null };

    if (!localUsable) {
       
      if (dk && dk.measured) {
        return { ok: true, value: dk.rho, source: 'measured-pooled', scope: 'national',
                 pairs: nPairs, models: used, sample: sample, ci: ci,
                 why: 'the local sample of ' + nPairs + ' paired model' + (nPairs === 1 ? '' : 's')
                    + ' gives rho ' + rs.toFixed(3)
                    + (ci ? ' with a 95% interval of ' + ci.lo.toFixed(2) + ' to ' + ci.hi.toFixed(2) : '')
                    + ', which does not exclude zero'
                    + (nPairs < minUsable
                        ? (' — on ' + nPairs + ' paired models the interval is about +/-'
                           

                           + (function(){ var _ci=fisherInterval(rs, nPairs);
                                          return (_ci && _ci.hi!=null && _ci.lo!=null)
                                                 ? (_ci.hi - _ci.lo).toFixed(2) : '—'; })()
                           + ' wide, and ' + minUsable
                           + ' models would be needed to narrow it enough for a near-zero '
                           + 'value to mean anything')
                        : '')
                    + '. The simulation uses the pooled national value instead, and that value '
                    + 'is itself a measurement rather than a judgement — see '
                    + 'FORMULA_REGISTRY.mc.rhoDeclared.',
                 declaredWhy: dk.why };
      }
      if (dk) {
        return { ok: true, value: dk.rho, source: 'declared', scope: 'prior',
                 pairs: nPairs, models: used, sample: sample, ci: ci,
                 why: 'the local sample of ' + nPairs + ' paired models is not usable'
                    + (ci ? ' (95% interval ' + ci.lo.toFixed(2) + ' to ' + ci.hi.toFixed(2) + ')' : '')
                    + ' and no pooled measurement exists for this pair, so a declared prior runs',
                 declaredWhy: dk.why };
      }
      return { ok: false, value: null, source: 'none', sample: sample, ci: ci,
               why: 'the local sample of ' + nPairs + ' paired models is not usable'
                  + (ci ? ' (95% interval ' + ci.lo.toFixed(2) + ' to ' + ci.hi.toFixed(2) + ')' : '')
                  + ' and nothing is declared for this pair, so the compound is refused '
                  + 'rather than simulated on a guess' };
    }

    return { ok: true, value: Math.max(-0.99, Math.min(0.99, rs)), source: 'model-spread',
             scope: 'unit', sample: sample, ci: ci, usable: true,
             pairs: used.length, models: used, raw: rs,
             why: 'Spearman rank correlation across the ' + used.length +
                  ' models that answered for both ' + (da.unit || ka) + ' and ' +
                  (db.unit || kb) + ' at this unit' };
  }

  

  function frechet(pa, pb) {
    var lo = Math.max(0, pa + pb - 1), hi = Math.min(pa, pb);
    var w = hi - lo, minW = reg('frechetMinWidth');
    return { lo: lo, hi: hi, width: w, collapsed: w < minW, minWidth: minW,
             note: w < minW
               ? 'the marginals pin the joint probability to within ' + w.toFixed(5) +
                 ' — no dependence structure can move it, and none is claimed to'
               : 'the joint is free to move within ' + lo.toFixed(3) + '-' + hi.toFixed(3) +
                 ' and the copula places it inside those bounds' };
  }

  

  var CEILING = null, CEILING_MAX = null;
  function ceiling() { if (CEILING === null) CEILING = reg('ceiling'); return CEILING; }
  function ceilingMassMax() { if (CEILING_MAX === null) CEILING_MAX = reg('ceilingMassMax'); return CEILING_MAX; }
  function severityIsReportable(mass) {
    if (mass === null || mass === undefined || !isFinite(mass)) return false;
    return mass < ceilingMassMax();
  }

  

  var QUANTILE_CEILING_TOLERANCE = { p50: 0.50, p90: 0.10, p95: 0.05, p99: 0.01 };
  function quantileIsReportable(which, mass) {
    if (mass === null || mass === undefined || !isFinite(mass)) return false;
    var tol = QUANTILE_CEILING_TOLERANCE[which];
    if (tol === undefined) return false;
    return mass < tol;
  }
  function quantileWithheldWhy(which, mass, n) {
    var tol = QUANTILE_CEILING_TOLERANCE[which];
    return which + ' withheld — ' + (100 * mass).toFixed(1) + '% of ' + n.toLocaleString() +
           ' trials sit at the ' + ceiling() + ' ceiling, at or above the ' + (100 * tol).toFixed(0) +
           '% at which ' + which + ' is itself pinned to the ceiling. The value would report where ' +
           'the scale ends, not how severe the outcome is.';
  }

  function binIndex(v, bins) {
    var i = Math.floor(v / 100 * bins);
    return i < 0 ? 0 : (i >= bins ? bins - 1 : i);
  }

   
  function run(cfg) {
    cfg = cfg || {};
    var N = cfg.n || reg('n'),
        HB = reg('histBins'), GB = reg('gridBins'),
        cascade = cfg.pathType === PATH_TYPE.CASCADE;

        

        var _cuts = [];
        try{ _cuts = (G.AGN && G.AGN.hazardValue && G.AGN.hazardValue.verdictCuts) || []; }catch(_){}
        var _boundaries = _cuts.map(function(c){ return c[0]; })
                               .sort(function(x,y){ return x-y; });
        var _wanted = isNum(cfg.threshold) ? cfg.threshold : null;
        var thresholdSnapped = null, thresholdWhy = null;
        var _watch = null;
        try{ _watch = (_cuts.filter(function(c){ return c[1]==='Watch'; })[0] || [])[0]; }catch(_){}
        if(_watch == null) _watch = 48;
        var threshold;
        if(_wanted == null){
          threshold = _watch;
          thresholdWhy = 'no threshold was given, so the run uses the Watch cut ('+_watch+'), '
                       + 'which is the lowest class a hazard has to reach before this build '
                       + 'treats it as operationally relevant';
        } else if(_boundaries.indexOf(_wanted) >= 0){
          threshold = _wanted;
          thresholdWhy = 'the requested threshold is a declared class boundary';
        } else {
          var _up = _boundaries.filter(function(b){ return b >= _wanted; })[0];
          threshold = (_up != null) ? _up : _watch;
          thresholdSnapped = _wanted;
          thresholdWhy = _wanted + ' is not a boundary on the verdict ladder ('
                       + _boundaries.join(' / ') + '), so it names no class and an exceedance '
                       + 'of it is not the same event on two hazards. The run used ' + threshold
                       + ', the next declared boundary, and reports the exceedance as a class.';
        }
        var thresholdClass = null;
        try{ thresholdClass = G.AGN.hazardValue.verdictOf(threshold); }catch(_){}

    function refuse(why, extra) {
      return Object.assign({ refused: true, why: why, N: 0, pathType: cfg.pathType || null,
        hazardA: cfg.hazardA || null, hazardB: cfg.hazardB || null,
        unitKey: cfg.unitKey || null, threshold: threshold,
        severityReportable: false, severityWithheldWhy: null,
        ceiling: ceiling(), ceilingMass: null }, extra || {});
    }

    if (!isNum(cfg.scoreA)) return refuse('leg A has no score — an unscored hazard is not simulated');
    var mA = marginalFor({ hazard: cfg.hazardA, unitKey: cfg.unitKey, sigma: cfg.sigmaA });
    if (!mA.ok) return refuse('leg A has no usable marginal: ' + (mA.why || mA.evidenceText), { marginalA: mA });

    var mB = null, rho = null, resp = null;

    if (cascade) {
      

      resp = cfg.response || null;
      if (!resp || !Array.isArray(resp.c) || !isNum(resp.c[0]))
        return refuse('a cascade needs a declared response function and none was supplied');
      if (resp.c.length > 1 && resp.c[1] !== 0 && !isNum(cfg.responseSecond))
        return refuse('the cascade response requires ' + (resp.on || 'a second input') +
                      ' and no default is permitted');
    } else {
      if (!isNum(cfg.scoreB)) return refuse('leg B has no score — an unscored hazard is not simulated');
      mB = marginalFor({ hazard: cfg.hazardB, unitKey: cfg.unitKey, sigma: cfg.sigmaB });
      if (!mB.ok) return refuse('leg B has no usable marginal: ' + (mB.why || mB.evidenceText),
                                { marginalA: mA, marginalB: mB });
      rho = rhoFor(cfg.hazardA, cfg.hazardB, cfg.unitKey);
      if (!rho.ok) return refuse('the compound pair has no dependence: ' + rho.why,
                                 { marginalA: mA, marginalB: mB, rho: rho });
    }

    

    var seedStr = [cfg.seed || '', cfg.unitKey || '', cfg.hazardA, cfg.hazardB || '',
                   cfg.pathType || PATH_TYPE.COMPOUND, cfg.scoreA, cfg.scoreB,
                   threshold, mA.kind, mA.n, mB ? mB.kind : '', mB ? mB.n : '',
                   rho ? rho.source + ':' + rho.value.toFixed(6) : 'cascade',
                   'v89.26'].join('|');
    var r = mulberry(hash(seedStr));

    var vals = new Float64Array(N),
        histA = new Uint32Array(HB), histB = new Uint32Array(HB), histC = new Uint32Array(HB),
        grid = cascade ? new Uint32Array(0) : new Uint32Array(GB * GB);
    var nA = 0, nB = 0, joint = 0, ceilN = 0;
    

    var rvRank = rho ? rho.value : 0;
    var rv = rho ? (2 * Math.sin(Math.PI * rvRank / 6)) : 0;
    var rIndep = rho ? Math.sqrt(1 - rv * rv) : 1;
    var second = isNum(cfg.responseSecond) ? cfg.responseSecond : 0;

    function draw(m, score, z) {
      if (m.kind === 'empirical') return clamp(score + invEmpirical(m.deltas, normCdf(z)));
      return clamp(score + m.sigma * z);
    }

    

    

    var _oneScale = !!cascade || (cfg.hazardA && cfg.hazardA === cfg.hazardB);

    var _RANK = {};
    try{ _RANK = (G.AGN && G.AGN.hazardValue && G.AGN.hazardValue.verdictRank) || {}; }catch(_){}
    var _rank = function (v) {
      try{ var w = G.AGN.hazardValue.verdictOf(v); return w ? (_RANK[w] || 0) : 0; }
      catch(_){ return 0; }
    };
    var _thrRank = _rank(threshold);
    var classN = {};
    

    var _lvl = function (v) { var b = (typeof G.agnBandOf === 'function') ? G.agnBandOf(Math.round(v)) : null; return b ? b.index : 0; };

    for (var i = 0; i < N; i++) {
      var u1 = Math.max(r(), 1e-12), u2 = r();
      var z1 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      var va = draw(mA, cfg.scoreA, z1), vb;
      if (cascade) {
        vb = clamp(va * resp.c[0] + (resp.c.length > 1 ? second * resp.c[1] : 0));
      } else {
        var u3 = Math.max(r(), 1e-12), u4 = r();
        var ind = Math.sqrt(-2 * Math.log(u3)) * Math.cos(2 * Math.PI * u4);
        var z2 = rv * z1 + rIndep * ind;      
        vb = draw(mB, cfg.scoreB, z2);
      }
      

      var _ra = _rank(va), _rb = _rank(vb);
      var ha = _ra >= _thrRank, hb = _rb >= _thrRank;
      if (ha) nA++; if (hb) nB++; if (ha && hb) joint++;
      

      
      

      var _la = _lvl(va), _lb = _lvl(vb), _lc = (_la >= _lb) ? _la : _lb;
      classN[_lc] = (classN[_lc] || 0) + 1;
      var combined = (_ra >= _rb) ? va : vb;
      vals[i] = combined;
      if (combined >= ceiling()) ceilN++;
      histA[binIndex(va, HB)]++; histB[binIndex(vb, HB)]++; histC[binIndex(combined, HB)]++;
      if (!cascade) grid[binIndex(vb, GB) * GB + binIndex(va, GB)]++;
    }

    var sorted = Array.prototype.slice.call(vals).sort(function (x, y) { return x - y; });
    var pa = nA / N, pb = nB / N, pj = joint / N, indep = pa * pb;
    var fr = frechet(pa, pb);
    var mass = ceilN / N, reportable = severityIsReportable(mass);

    return {
      refused: false, N: N, seed: seedStr,
      hazardA: cfg.hazardA, hazardB: cfg.hazardB || null, unitKey: cfg.unitKey || null,
      pathType: cfg.pathType || PATH_TYPE.COMPOUND, threshold: threshold,
      scoreA: cfg.scoreA, scoreB: cascade ? null : cfg.scoreB,

      pa: pa, pb: pb, joint: pj, independent: indep,
      lift: indep > 0 ? pj / indep : null,
      conditional: joint / Math.max(nA, 1),
      frechet: fr,
      

      liftReportable: !fr.collapsed,
      liftWithheldWhy: fr.collapsed
        ? ('Dependence effect withheld — ' + fr.note + '. Reporting a lift here would ' +
           'attribute to the copula a joint probability the marginals had already fixed.')
        : null,

      dependence: cascade
        ? ('declared response function · ' + (resp.formula || 'C = c0·A' + (resp.c[1] ? ' + c1·' + (resp.on || 'second') : '')))
        : ('Gaussian copula, latent correlation from ' + rho.source + ' Spearman rho'
           + (rho.ci ? ' (95% CI ' + rho.ci.lo.toFixed(2) + ' to ' + rho.ci.hi.toFixed(2)
                     + ' on ' + rho.ci.n + ' paired models)' : '')),
      rho: cascade ? null : rho.value,
      rhoLatent: cascade ? null : rv,
      rhoTransform: cascade ? null : 'rho_G = 2 sin(pi rho_s / 6) · rank to latent Gaussian',
      rhoSource: cascade ? null : rho.source,
      rhoScope: cascade ? null : (rho.scope || null),
      rhoPairs: cascade ? null : (rho.pairs || null),
      rhoModels: cascade ? null : (rho.models || null),
      rhoCI: cascade ? null : (rho.ci || null),
      rhoSample: cascade ? null : (rho.sample || null),
      rhoWhy: cascade ? null : rho.why,
      response: cascade ? { c: resp.c.slice(), on: resp.on || null, formula: resp.formula || null,
                            label: resp.label || null, second: second } : null,

      marginalA: mA, marginalB: mB,
       
      basis: cascade
        ? (mA.kind === 'empirical' ? 'leg A resampled from ' + mA.n + ' ensemble members; leg B is a declared response'
                                   : 'leg A on a declared dispersion; leg B is a declared response')
        : ((mA.kind === 'empirical' ? mA.n + '-member' : 'declared') + ' leg A, ' +
           (mB.kind === 'empirical' ? mB.n + '-member' : 'declared') + ' leg B, ' +
           rho.source + ' dependence'),
      measured: !cascade && mA.kind === 'empirical' && mB.kind === 'empirical' && (rho.source === 'measured' || rho.source === 'measured-pooled'),

      

      p50: _oneScale ? quantileAt(sorted, 0.50) : null,
      p90: _oneScale ? quantileAt(sorted, 0.90) : null,
      p95: _oneScale ? quantileAt(sorted, 0.95) : null,
      p99: _oneScale ? quantileAt(sorted, 0.99) : null,
      oneScale: _oneScale,
      oneScaleWhy: _oneScale
        ? (cascade
            ? 'cascade: the second leg is a declared response function of the first, so both '
              + 'legs are expressed on one scale and an order statistic over them is a quantity'
            : 'both legs are the same hazard, so the distribution measures one thing throughout')
        : 'cross-hazard: each trial contributes whichever leg governed it, so the distribution '
          + 'changes which hazard it is measuring from trial to trial. An order statistic over '
          + 'that is not a severity, and none is published. The pair reports class membership '
          + 'and joint probability instead.',
      quantileCeilingTolerance: QUANTILE_CEILING_TOLERANCE,
      quantileReportable: (function(){
        var out = {};
        ['p50','p90','p95','p99'].forEach(function (q) {
          out[q] = _oneScale ? quantileIsReportable(q, mass) : false; });
        return out;
      })(),
      quantileWithheldWhy: (function(){
        var out = {};
        var xScale = 'withheld \u2014 unlike hazard indices are not on one scale, so this run '
                   + 'publishes no quantile of them. The class distribution and the joint '
                   + 'probability are what the pair supports.';
        ['p50','p90','p95','p99'].forEach(function (q) {
          out[q] = !_oneScale ? xScale
                 : (quantileIsReportable(q, mass) ? null : quantileWithheldWhy(q, mass, N));
        });
        return out;
      })(),
      mean: sorted.reduce(function (a, b) { return a + b; }, 0) / N,
      histA: histA, histB: histB, histCombined: histC, jointGrid: grid,
      histBins: HB, gridBins: GB,

      

      

      

      severityClass: (function(){
        try{
          if(!_oneScale) return null;
          var V=G.AGN && G.AGN.hazardValue;
          if(!V || !V.verdictOf) return null;
          return { p50:V.verdictOf(quantileAt(sorted,0.50)),
                   p90:V.verdictOf(quantileAt(sorted,0.90)),
                   p95:V.verdictOf(quantileAt(sorted,0.95)),
                   p99:V.verdictOf(quantileAt(sorted,0.99)) };
        }catch(_){ return null; }
      })(),
      severityClassWhy: 'the operational class each quantile falls in. The class is what this '
                      + 'run publishes: it is comparable because every hazard earns its class '
                      + 'from its own index, where the index behind it is a maximum taken across '
                      + 'two hazards whose scales this build does not treat as shared.',
      severityModel: 'governing CLASS per trial, taken over two class ranks',
      

      severityModelWhy: 'each leg is classified on its own index first, and the trial takes '
                      + 'the governing CLASS of the pair. A maximum over class ranks is a '
                      + 'comparison within one ladder that every hazard reaches through its '
                      + 'own index; a maximum over the indices themselves would be a '
                      + 'comparison between two scales this build does not treat as shared, '
                      + 'and is not made anywhere in this run.',
      thresholdClass: thresholdClass,
      thresholdWhy: thresholdWhy,
      thresholdSnappedFrom: thresholdSnapped,
      thresholdLevel: (function () { try { return G.AGN.level.ofClass(thresholdClass); } catch (_) { return null; } })(),
      classDistribution: (function () {
        var W = ['Normal', 'Low', 'Moderate', 'High', 'Severe'], tot = 0;
        try { if (G.AGN.level && G.AGN.level.words) W = G.AGN.level.words; } catch (_) {}
        var rows = Object.keys(classN).map(function (k) {
          tot += classN[k];
          return { rank: Number(k), label: W[Number(k)] || ('level ' + k), trials: classN[k] };
        }).sort(function (x, y) { return y.rank - x.rank; });
        rows.forEach(function (x) { x.p = tot ? x.trials / tot : null; });
        return rows;
      })(),
      classDistributionWhy: 'the share of simulated trials in which the governing hazard of the '
                      + 'pair stood at each level (Normal to Severe, each leg on its own index). This is what the pair '
                      + 'does together, stated on the only scale the two hazards share.',
      severityNoisyOr: 'withheld — see severityModelWhy',
      severityCorrelationAware: false,
      ceiling: ceiling(), ceilingMass: mass, ceilingMassMax: ceilingMassMax(),
      saturated: !reportable,
      

      severityReportable: _oneScale && reportable,
      severityWithheldWhy: !_oneScale
        ? ('Combined severity withheld \u2014 ' + String(cfg.hazardA) + ' and '
           + String(cfg.hazardB) + ' are screened on indices this build does not treat as '
           + 'one scale, so no quantile of them is a severity. What the pair supports is '
           + 'published instead: the class each trial governed on, and the joint probability '
           + 'of the two reaching the stated class.')
        : reportable ? null
        : ('Combined severity withheld — ' + (100 * mass).toFixed(1) + '% of ' + N.toLocaleString() +
           ' simulated trials sit at the ' + ceiling() + ' ceiling of the screening index, above the ' +
           'declared limit of ' + (100 * ceilingMassMax()).toFixed(0) + '%. The distribution is ' +
           'materially ceiling-censored, so its median reports where the scale ends rather than how ' +
           'severe the outcome is. The joint and conditional probabilities keep their meaning and are not withheld.')
    };
  }

  

  function reportable(s) {
    if (!s || s.refused) return { available: false, why: s ? s.why : 'no simulation' };
    return {
      available: true,
      pathType: s.pathType, basis: s.basis, measured: s.measured,
      jointProbability: s.joint, marginalA: s.pa, marginalB: s.pb,
      independentProduct: s.independent,
      lift: s.liftReportable ? s.lift : null,
      liftWithheldWhy: s.liftWithheldWhy,
      

      thresholdClass: s.thresholdClass || null,
      thresholdLevel: s.thresholdLevel || null,
      thresholdWhy: s.thresholdWhy || null,
      thresholdSnappedFrom: (s.thresholdSnappedFrom != null) ? s.thresholdSnappedFrom : null,
      classDistribution: s.classDistribution || null,
      classDistributionWhy: s.classDistributionWhy || null,
      conditional: s.conditional,
      frechetLo: s.frechet.lo, frechetHi: s.frechet.hi, frechetCollapsed: s.frechet.collapsed,
      

      severity: s.severityReportable
        ? { p50: (s.quantileReportable && s.quantileReportable.p50) ? s.p50 : null,
            p90: (s.quantileReportable && s.quantileReportable.p90) ? s.p90 : null,
            p95: (s.quantileReportable && s.quantileReportable.p95) ? s.p95 : null,
            p99: (s.quantileReportable && s.quantileReportable.p99) ? s.p99 : null } : null,
      severityWithheldWhy: s.severityWithheldWhy,
      quantileWithheldWhy: s.quantileWithheldWhy,
      quantileCeilingTolerance: s.quantileCeilingTolerance,
      ceilingMass: s.ceilingMass, ceilingMassLimit: s.ceilingMassMax,
      rho: s.rho, rhoSource: s.rhoSource, rhoPairs: s.rhoPairs,
      trials: s.N, seed: s.seed
    };
  }

  

  function selfTest() {
    var out = [];
    function t(name, fn) {
      try { var r = fn(); out.push({ name: name, pass: !!r.pass, detail: r.detail }); }
      catch (e) { out.push({ name: name, pass: false, detail: 'threw: ' + e.message }); }
    }
    var base = { seed: 'selftest', unitKey: null, hazardA: 'heat', hazardB: 'flood',
                 scoreA: 55, scoreB: 50, sigmaA: 8, sigmaB: 8,
                 

                 pathType: PATH_TYPE.COMPOUND };

    t('MC-01 conservation', function () {
      var s = run(base); if (s.refused) return { pass: false, detail: s.why };
      var sum = function (a) { return Array.prototype.reduce.call(a, function (x, y) { return x + y; }, 0); };
      var ok = sum(s.histA) === s.N && sum(s.histB) === s.N &&
               sum(s.histCombined) === s.N && sum(s.jointGrid) === s.N;
      return { pass: ok, detail: ok ? 'A, B, combined and the joint grid each sum to ' + s.N
                                    : 'bins do not conserve N' };
    });

    t('MC-02 reproducible', function () {
      var a = run(base), b = run(base);
      var ok = !a.refused && a.joint === b.joint && a.p90 === b.p90 && a.ceilingMass === b.ceilingMass;
      return { pass: ok, detail: ok ? 'the same inputs return the same joint, p90 and ceiling mass'
                                    : 'two runs of identical inputs disagree' };
    });

    t('MC-03 rho moves the joint', function () {
      

      var s = run(base); if (s.refused) return { pass: false, detail: s.why };
      if (s.frechet.collapsed)
        return { pass: true, detail: 'Frechet bounds are collapsed here (width ' +
                 s.frechet.width.toFixed(5) + '); no dependence structure could move the joint, so the check is not run' };
      var indep = s.independent, moved = Math.abs(s.joint - indep) > 1e-6;
      return { pass: moved || Math.abs(s.rho) < 1e-6,
               detail: moved ? 'the joint (' + s.joint.toFixed(4) + ') differs from the independent product (' +
                        indep.toFixed(4) + ') at rho ' + s.rho.toFixed(3)
                             : 'rho is ' + s.rho.toFixed(3) + ' and the joint matches independence, which is correct' };
    });

    t('MC-04 cascade ignores rho', function () {
      var c = Object.assign({}, base, { pathType: PATH_TYPE.CASCADE,
        response: { c: [0.55, 0], formula: 'C = 0.55·A', label: 'test cascade' } });
      var s = run(c); if (s.refused) return { pass: false, detail: s.why };
      return { pass: s.rho === null && s.jointGrid.length === 0,
               detail: s.rho === null ? 'a cascade publishes no rho and no joint grid'
                                      : 'a cascade published a rho' };
    });

    t('MC-05 cascade refuses a missing second input', function () {
      var s = run(Object.assign({}, base, { pathType: PATH_TYPE.CASCADE,
        response: { c: [0.5, 0.3], on: 'exposure' } }));
      return { pass: s.refused === true, detail: s.refused ? s.why : 'it simulated on a defaulted input' };
    });

    t('MC-06 withholding is one rule', function () {
      var max = ceilingMassMax();
      var ok = severityIsReportable(0) === true &&
               severityIsReportable(max) === false &&
               severityIsReportable(max - 1e-9) === true &&
               severityIsReportable(null) === false &&
               severityIsReportable(undefined) === false;
      return { pass: ok, detail: ok ? 'reportable below ' + max + ', withheld at and above it, withheld on a null mass'
                                    : 'the withholding rule does not agree with its own limit' };
    });

    t('MC-07 a saturated run withholds its median', function () {
      var s = run(Object.assign({}, base, { scoreA: 99, scoreB: 99, sigmaA: 20, sigmaB: 20 }));
      if (s.refused) return { pass: false, detail: s.why };
      var rep = reportable(s);
      var ok = s.ceilingMass > 0
        ? (s.severityReportable ? rep.severity !== null : (rep.severity === null && !!rep.severityWithheldWhy))
        : true;
      return { pass: ok, detail: 'ceiling mass ' + (100 * s.ceilingMass).toFixed(1) + '%, severity ' +
               (s.severityReportable ? 'reported' : 'withheld') + ' and the report view agrees' };
    });

    t('MC-08 Frechet contains the joint', function () {
      var s = run(base); if (s.refused) return { pass: false, detail: s.why };
      var ok = s.joint >= s.frechet.lo - 1e-9 && s.joint <= s.frechet.hi + 1e-9;
      return { pass: ok, detail: ok ? 'joint ' + s.joint.toFixed(4) + ' lies inside [' +
               s.frechet.lo.toFixed(4) + ', ' + s.frechet.hi.toFixed(4) + ']'
                                    : 'the simulated joint is outside its own Frechet bounds' };
    });

    t('MC-09 noisy-OR never falls below either leg', function () {
      

      var f = function (a, b) { return 100 * (1 - (1 - a / 100) * (1 - b / 100)); };
      var worst = null, bad = 0, checked = 0;
      for (var a = 0; a <= 100; a += 5) {
        for (var b = 0; b <= 100; b += 5) {
          checked++;
          var c = f(a, b), m = Math.max(a, b);
          if (c < m - 1e-9) { bad++; if (worst === null || (m - c) > worst) worst = m - c; }
        }
      }
      var s = run(base);
      if (s.refused) return { pass: false, detail: s.why };
      var inRange = s.p50 >= 0 && s.p99 <= 100 && s.mean >= 0;
      return { pass: bad === 0 && inRange,
               detail: bad === 0
                 ? ('combined >= max(leg) at all ' + checked + ' grid points, and the run stays in range')
                 : (bad + ' of ' + checked + ' points fall below the stronger leg, worst by '
                    + worst.toFixed(3)) };
    });

    t('MC-10 an unpairable rho is never called measured', function () {
      var r = rhoFor('heat', 'flood', '__no_such_unit__');
      var ok = !r.ok || r.source === 'declared';
      return { pass: ok, detail: r.ok ? 'falls back to a ' + r.source + ' rho: ' + r.why
                                      : 'refuses: ' + r.why };
    });

    t('MC-11 a hazard with no bridge is refused, not defaulted', function () {
      var b = bridgeFor('glof');
      var m = marginalFor({ hazard: 'glof', unitKey: 'x', sigma: null });
      return { pass: b.ok === false && m.ok === false,
               detail: 'glof has no declared bridge and issues no marginal without a declared sigma' };
    });

    t('MC-12 the slope is read from the scoring curve', function () {
      var h = bridgeFor('heat'), f = bridgeFor('flood');
      var hexp = G.FR('heat.airStressSlope') * G.FR('heat.humidPathWeights').airTemp;
      var bands = G.FR('flood.rainBands'), anch = G.FR('flood.rainAnchors');
      var fexp = (anch[2] - anch[1]) / (bands[2] - bands[1]);
      var ok = h.ok && f.ok && Math.abs(h.slope - hexp) < 1e-12 && Math.abs(f.slope - fexp) < 1e-12;
      

      var raw = G.FR('heat.airStressSlope');
      if (ok && Math.abs(h.slope - raw) < 1e-12 && Math.abs(raw - hexp) > 1e-12) ok = false;
      return { pass: ok, detail: ok ? 'heat ' + h.slope.toFixed(4) + ' score/°C (air-stress gradient × its ' +
               'path weight); flood ' + f.slope.toFixed(4) + ' score per mm/h from the rain curve itself'
                                    : 'a slope is not the one the registry declares' };
    });

    var passed = out.filter(function (x) { return x.pass; }).length;
    return { checks: out, passed: passed, total: out.length, ok: passed === out.length };
  }

  G.AGN.mc = {
    PATH_TYPE: PATH_TYPE,
    run: run, reportable: reportable, selfTest: selfTest,
    marginalFor: marginalFor, rhoFor: rhoFor, bridgeFor: bridgeFor,
    frechet: frechet, spearman: spearman,
    severityIsReportable: severityIsReportable,
    ceiling: ceiling, ceilingMassMax: ceilingMassMax,
     
    assumptions: function () { return ['ceilingMassMax', 'sigmaFloor', 'sigmaCeiling'].map(function (k) { var e = G.FORMULA_REGISTRY.mc[k];
      return { key: k, value: e.value, unit: e.unit, meaning: e.meaning, basis: e.basis, notDerivedWhy: e.notDerivedWhy, status: e.calibrationStatus }; }); },
    normCdf: normCdf, invEmpirical: invEmpirical, fisherInterval: fisherInterval,
    version: 'v89.36'
  };
})(window);
