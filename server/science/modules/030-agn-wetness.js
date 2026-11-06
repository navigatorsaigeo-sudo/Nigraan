


(function (G) {
  'use strict';
  var AGN = G.AGN = G.AGN || {};

  var CFG = {
    K: 0.90,
    API_CAP: 120,
    windowDays: 7,
    

    apiWeight: 0.60,
    smWeight: 0.40,
    

    smWilt: 0.10,
    smSat: 0.45,
    version: 'wetness-1.0'
  };
  try { G.AGN_WETNESS_CFG = CFG; } catch (_) {}

  

  function raw(dailyMm) {
    if (!Array.isArray(dailyMm) || !dailyMm.length) return null;
    var acc = 0, n = dailyMm.length, start = Math.max(0, n - CFG.windowDays);
    for (var i = start; i < n; i++) {
      var v = Number(dailyMm[i]);
      acc = CFG.K * acc + (isFinite(v) ? Math.max(0, v) : 0);
    }
    return acc;
  }
  function normalize(rawMm) {
    if (rawMm == null || !isFinite(rawMm)) return null;
    return Math.max(0, Math.min(1, rawMm / CFG.API_CAP));
  }
  function denormalize(api) {
    if (api == null || !isFinite(api)) return null;
    return Math.max(0, api) * CFG.API_CAP;
  }
   
  function advance(rawMm, mmToday) {
    if (rawMm == null) return null;
    return CFG.K * rawMm + Math.max(0, Number(mmToday) || 0);
  }

  

  function smNorm(vol) {
    if (vol == null || !isFinite(vol)) return null;
    return Math.max(0, Math.min(1, (vol - CFG.smWilt) / (CFG.smSat - CFG.smWilt)));
  }

  function rowFor(key) {
    try { return (G.DISTRICT_IN || {})[key] || null; } catch (_) { return null; }
  }

   
  function apiRawForUnit(key, dayIndex) {
    var row = rowFor(key); if (!row) return null;
    var r = (row.apiRaw != null) ? row.apiRaw : denormalize(row.api);
    if (r == null) return null;
    var day = Math.max(0, dayIndex || 0);
    for (var d = 0; d < day; d++) {
      var mm = null;
      try {
        if (typeof G.hzDayWindow === 'function' && row.fc72) {
          var w = G.hzDayWindow(row.fc72, d, 'flood');
          if (w && w.rainTotal != null) mm = w.rainTotal;
        }
      } catch (_) {}
      if (mm == null && Array.isArray(row.days) && row.days[d] && row.days[d].precip != null) {
        mm = row.days[d].precip;
      }
      if (mm == null) return null;          
      r = advance(r, mm);
    }
    return r;
  }
  function apiForUnit(key, dayIndex) { return normalize(apiRawForUnit(key, dayIndex)); }

  

  function currentWetness(key, dayIndex) {
    var row = rowFor(key);
    var api = apiForUnit(key, dayIndex);
    var sm = row ? smNorm(row.soilMoist) : null;
    

    if (dayIndex) sm = null;

    if (api != null && sm != null) {
      return { value: +(CFG.apiWeight * api + CFG.smWeight * sm).toFixed(3),
               basis: 'API + soil moisture 7-28 cm', api: api, sm: sm,
               smVolumetric: row.soilMoist, confidence: 'B',
               note: CFG.apiWeight + ' x API + ' + CFG.smWeight + ' x normalised soil moisture 7-28 cm' };
    }
    if (api != null) {
      return { value: api, basis: 'API only (7-day rainfall memory)', api: api, sm: null,
               confidence: 'C', note: 'no soil moisture (7-28 cm) for this unit' };
    }
    if (sm != null) {
      return { value: sm, basis: 'soil moisture 7-28 cm only', api: null, sm: sm,
               smVolumetric: row.soilMoist, confidence: 'C',
               note: 'no rainfall history — wetness inferred from soil moisture alone' };
    }
    return { value: null, basis: 'unavailable', api: null, sm: null, confidence: 'none',
             note: 'neither rainfall history nor soil moisture available; dynamic NSS ' +
                   'reports no-data rather than reusing the baseline' };
  }

  function label(api) {
    if (api == null) return '—';
    return api >= 0.75 ? 'Very wet' : api >= 0.5 ? 'Wet'
         : api >= 0.25 ? 'Normal' : api >= 0.1 ? 'Dry' : 'Very dry';
  }

  var _nssCovCache = {};
  function dayCoverage(dayIndex) {
    var day=Math.max(0,Number(dayIndex)||0), key='d'+day;
    if(_nssCovCache[key]) return _nssCovCache[key];
    var expected=0, available=0;
    try {
      (G.PK_DISTRICT_CENTROIDS||[]).forEach(function(c){
        if(G.IIOJK && c.province===G.IIOJK) return;
        if(!(G.DISTRICT_IN||{})[c.key]) return;
        expected++;
        var w=currentWetness(c.key,day);
        if(w && w.value!=null && isFinite(w.value)) available++;
      });
    } catch (_) {}
    var coverage=expected?available/expected:0;
    var res={day:day,available:available,expected:expected,coverage:+coverage.toFixed(4),enabled:coverage>=0.95,complete:coverage>=0.95,basis:'dynamic NSS wetness availability'};
    if(available>0) _nssCovCache[key]=res;
    return res;
  }
  function maxForecastDay(){ var best=0; for(var d=1;d<=3;d++){ if(dayCoverage(d).enabled) best=d; else break; } return best; }
  function clearCoverage(){ _nssCovCache={}; }
  try { ['agn:data','agn:national','agn:location'].forEach(function(ev){document.addEventListener(ev,clearCoverage);}); } catch (_) {}

  AGN.wetness = {
    config: CFG, raw: raw, normalize: normalize, denormalize: denormalize,
    advance: advance, smNorm: smNorm,
    apiRawForUnit: apiRawForUnit, apiForUnit: apiForUnit,
    currentWetness: currentWetness, label: label,
    dayCoverage: dayCoverage, maxForecastDay: maxForecastDay, clearCoverage: clearCoverage
  };
  G.nssDayCoverage=dayCoverage; G.nssMaxForecastDay=maxForecastDay;
})(window);
