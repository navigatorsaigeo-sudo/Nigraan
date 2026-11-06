


(function (G) {
  'use strict';
  G.AGN = G.AGN || {};

  var FREE = {
    id: 'free',
    label: 'No plan configured (paid key absent; the server refuses provider calls)',
    

    chunk: 36, lanes: 2, paceMs: 900, interChunkMs: 1100,
    retryDelays: [90000, 180000, 300000, 600000],
    sessionWeight: 2500,
    skipIfDoneWithinMs: 60000,
    cacheMinutes: 20,
    stationVars: 12,           
    forecastDays: 4,
    models: 1,                 
    basis: 'calibrated against the free allowance and a measured 429 burst'
  };

  var PAID = {
    id: 'paid',
    label: 'Professional plan',
    

    chunk: 120, lanes: 4, paceMs: 0, interChunkMs: 0,
    

    retryDelays: [3000, 10000, 30000],
    

    sessionWeight: 200000,
    

    skipIfDoneWithinMs: 0,
    cacheMinutes: 5,
    stationVars: 0,            
    forecastDays: 7,
    models: 11,
    basis: 'measured 7 Sep 2026: 576 tehsils, 6 vars, 4 days in 0.5 s, zero 429'
  };

  

  var PAYLOAD_CEILING_KB = 600;
  

  var BYTES_PER_UNIT_VAR_DAY = 10.0;

  function current() {
    try {
      var c = G.AGN.api && G.AGN.api.connector;
      return (c && c.configured) ? PAID : FREE;
    } catch (_) { return FREE; }
  }

  

  function chunkFor(nVars, days) {
    var p = current();
    var v = Math.max(1, Number(nVars) || 6), d = Math.max(1, Number(days) || 4);
     
    var perUnitBytes = BYTES_PER_UNIT_VAR_DAY * v * d;
    var fits = Math.floor((PAYLOAD_CEILING_KB * 1024) / Math.max(1, perUnitBytes));
    return Math.max(8, Math.min(p.chunk, fits));
  }

  G.AGN.tier = {
    FREE: FREE, PAID: PAID, PAYLOAD_CEILING_KB: PAYLOAD_CEILING_KB,
    BYTES_PER_UNIT_VAR_DAY: BYTES_PER_UNIT_VAR_DAY,
    current: current, chunkFor: chunkFor,
    get: function (k, fallback) {
      var p = current();
      return (p && p[k] !== undefined) ? p[k] : fallback;
    },
    isPaid: function () { return current().id === 'paid'; },
    

    describe: function () {
      var p = current();
      return p.label + ' · chunk ' + p.chunk + ', ' + p.lanes + ' lane'
           + (p.lanes === 1 ? '' : 's')
           + (p.paceMs ? ', ' + p.paceMs + ' ms pace' : ', no pacing')
           + ' · ' + p.basis;
    }
  };
})(window);
