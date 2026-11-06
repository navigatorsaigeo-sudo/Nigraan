

(function(){
  'use strict';
  var G = (typeof window !== 'undefined') ? window : this;
  G.AGN = G.AGN || {};

  var LOG_MAX = 60;
  var faults = [];
  function record(kind, detail){
    faults.push({ kind:kind, detail:String(detail).slice(0,300), at:Date.now() });
    if (faults.length > LOG_MAX) faults.shift();
  }
  G.addEventListener('unhandledrejection', function(e){
    var r = e && e.reason;
    var msg = (r && (r.message || r)) || 'unknown';
    

    if (/Failed to fetch|NetworkError|aborted|AbortError/i.test(msg)) {
      record('network', msg);
      e.preventDefault();
      return;
    }
    record('rejection', msg);
  });
  G.addEventListener('error', function(e){
    if (e && e.message) record('error', e.message);
  }, true);

  

  var SLA_MIN = 90;       
  var DEAD_MIN = 180;     

  function el(id){ return document.getElementById(id); }

  function readState(){
    var out = { source:null, asOf:null, grade:null, synthetic:false };
    try {
      

      var st = (G.AGN && (G.AGN.state || G.AGN.store)) || null;
      var s  = st && (st.active || st.station || st.current) || null;

      if (s && s.liveSource) out.source = s.liveSource;
      else if (st && st.liveSource) out.source = st.liveSource;

      if (!out.source) {
         
        var D = G.DISTRICT_IN || {}, keys = Object.keys(D), n = 0, newest = 0, src = null;
        for (var i = 0; i < keys.length; i++) {
          var row = D[keys[i]];
          if (!row) continue;
          if (row.nationalLive || row.weatherLive || row.forecastLive) {
            n++;
            var t = row.nationalAt || row.districtFetchedAt || row.fcUpdatedAt || 0;
            if (t > newest) newest = t;
            if (!src) src = row.fcSource || 'mach';
          }
        }
        if (n > 0) {
          

          out.source = (src === 'tehsil_centroid_open_meteo' ? 'best-match model blend (model per field not disclosed)' : src)
            + ' · ' + n + ' of ' + keys.length + ' tehsils';
          out.asOf = newest || Date.now();
          out.coverage = n / Math.max(1, keys.length);
        }
      }

      var t = (s && (s.asOf || s.fetchedAt || s.updatedAt)) ||
              (st && (st.asOf || st.fetchedAt || st.updatedAt)) || null;
      if (t) out.asOf = (typeof t === 'number') ? t : Date.parse(t);
      if (isNaN(out.asOf)) out.asOf = null;

      if (typeof G.confidenceFor === 'function' && s) {
        var c = G.confidenceFor(s);
        if (c && c.tier) {
          out.synthetic = (c.tier === 'synthetic');
          out.grade = ({ high:'A', med:'B', low:'C', synthetic:'D' })[c.tier] || null;
        }
      }
      

      if (!out.grade && out.coverage != null) {
        var ageMin = out.asOf ? (Date.now() - out.asOf) / 60000 : 1e9;
        out.grade = (out.coverage >= 0.90 && ageMin <= 90) ? 'B'
                  : (out.coverage >= 0.50 && ageMin <= 180) ? 'C' : 'D';
        

        out.gradeBasis = 'B: coverage ' + Math.round(out.coverage * 100) + '%, age '
          + Math.round(ageMin) + ' min. A requires the national verification to pass '
          + '(80% of tehsils within 2.0 °C RMSE vs global reanalysis, no failed batch, check under 30 days old).';
      }
      

      try { var V = G.__agnVerif && G.__agnVerif.summary;
        if (out.grade === 'B' && V && V.eligible) { out.grade = 'A'; out.gradeBasis = 'A (reanalysis-verified): ' + V.passed + ' of ' + V.unitsTotal + ' tehsils have 24 h temperature RMSE <= 2.0 \u00b0C vs global reanalysis on an independent test month (' + (V.testWindow||V.window).start_date + ' to ' + (V.testWindow||V.window).end_date + '), median ' + V.medianRmse24 + ' \u00b0C; coverage and freshness meet B.'; }
        else if (out.grade === 'B' && V) { out.gradeBasis = (out.gradeBasis || '') + ' Verification: ' + V.passed + ' of ' + V.unitsTotal + ' tehsils pass (needs ' + Math.round(V.rule.nationalPassShare * 100) + '%' + (V.fresh ? '' : ', and a check under 30 days old') + ').'; }
        var _g = document.getElementById('agnProvGrade'); if (_g && out.gradeBasis) _g.title = out.gradeBasis;
      } catch (_) {}
      if (!out.source) out.synthetic = true;
    } catch (_) {   }
    return out;
  }

  function fmtAge(ms){
    if (ms == null) return 'age unknown';
    var m = Math.floor(ms / 60000);
    if (m < 1)  return 'age <1 min';
    if (m < 60) return 'age ' + m + ' min';
    var h = Math.floor(m / 60);
    if (h < 48) return 'age ' + h + ' h ' + (m % 60) + ' min';
    return 'age ' + Math.floor(h / 24) + ' d';
  }

  function paint(){
    var dot = el('agnProvDot'), src = el('agnProvSrc');
    var age = el('agnProvAge'), grd = el('agnProvGrade');
    if (!dot || !src || !age || !grd) return;

    var st  = readState();
    var ms  = st.asOf ? (Date.now() - st.asOf) : null;
    var state = st.synthetic ? 'synthetic'
              : (ms == null || ms > DEAD_MIN * 60000) ? 'dead'
              : (ms > SLA_MIN * 60000) ? 'stale' : 'live';

    dot.setAttribute('data-state', state);
    age.setAttribute('data-state', state === 'live' ? 'ok' : state);

    AGN_putRaw(src, 'textContent', st.synthetic
      ? 'Synthetic scenario data — not a live feed'
      : ('Source: ' + st.source));    

    AGN_putT(age, st.synthetic ? 'no live fetch' : fmtAge(ms));

    AGN_putT(grd, st.grade ? ('grade ' + st.grade) : 'grade —');
    if (st.grade) grd.setAttribute('data-grade', st.grade);
    else grd.removeAttribute('data-grade');
  }

  

  function start(){
    paint();
     
    ['agn:data','agn:day'].forEach(function(evt){
      document.addEventListener(evt, paint);
    });
    setInterval(paint, 30000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  

  G.AGN.health = function(){
    var byKind = {};
    faults.forEach(function(f){ byKind[f.kind] = (byKind[f.kind] || 0) + 1; });
    return {
      build: 'AI GEO NIGRAAN v82.0',
      baseline: 'v80.1 md5 ceda552b4d163d5dd5e2b6d6c05f1e61',
      provenance: readState(),
      faults: byKind,
      recent: faults.slice(-8)
    };
  };
  G.AGN.faults = function(){ return faults.slice(); };
})();
