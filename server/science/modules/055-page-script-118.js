


(function (G) {
  'use strict';
  G.AGN = G.AGN || {};

  var REC = Object.create(null);
  var ORDER = [];
  var LIMIT = 4000;

  var KIND = {
    OBSERVED:   'observed',      
    REANALYSIS: 'reanalysis',    
    FORECAST:   'forecast',      
    PROJECTION: 'projection',    
    STATIC:     'static',        
    DERIVED:    'derived',       
    EXPERT:     'expert'         
  };

  function num(v){ return (v===null||v===undefined||v==='')?null:(isFinite(Number(v))?Number(v):null); }

  

  function record(id, r) {
    if (!id) return null;
    r = r || {};
    var rec = {
      id: String(id),
      label: r.label || String(id),
      kind: r.kind || KIND.DERIVED,
      value: num(r.value),
      unit: r.unit || null,
      source: r.source || null,          
      method: r.method || null,          
      tier: r.tier || null,              
      models: r.models || null,
      n: r.n == null ? null : r.n,
      median: num(r.median), iqr: num(r.iqr), spread: num(r.spread),
      p10: num(r.p10), p90: num(r.p90),
      

      members: Array.isArray(r.members) ? r.members.slice(0, 200) : null,
      

      memberModels: Array.isArray(r.memberModels) ? r.memberModels.slice(0, 200) : null,
      elevation: num(r.elevation),
      lead: r.lead == null ? null : r.lead,
      issued: r.issued || null,
      unit_key: r.unitKey || null,       
      hazard: r.hazard || null,
      

      extra: (r.extra && typeof r.extra === 'object') ? r.extra : null,
      

      refuses: Array.isArray(r.refuses) ? r.refuses.slice() : (r.refuses ? [r.refuses] : []),
      licence: r.licence || null,
      at: Date.now()
    };
    if (!(rec.id in REC)) {
      ORDER.push(rec.id);
      if (ORDER.length > LIMIT) { var drop = ORDER.shift(); delete REC[drop]; }
    }
    REC[rec.id] = rec;
    return rec;
  }

  function get(id){ return REC[id] || null; }
  function all(){ return ORDER.map(function(k){ return REC[k]; }).filter(Boolean); }
  function byKind(k){ return all().filter(function(r){ return r.kind===k; }); }
  function byHazard(h){ return all().filter(function(r){ return r.hazard===h; }); }

  

  function inventory() {
    var bySrc = Object.create(null);
    all().forEach(function (r) {
      var k = (r.source || 'unattributed') + ' | ' + r.kind;
      var e = bySrc[k] || (bySrc[k] = {
        source: r.source || 'unattributed', kind: r.kind, licence: r.licence,
        records: 0, units: Object.create(null), hazards: Object.create(null),
        methods: Object.create(null), unavailable: 0, withSpread: 0, refusals: Object.create(null)
      });
      e.records++;
      if (r.unit_key) e.units[r.unit_key] = 1;
      if (r.hazard) e.hazards[r.hazard] = 1;
      if (r.method) e.methods[r.method] = 1;
      if (r.tier === 'unavailable' || r.value === null) e.unavailable++;
      if (r.iqr != null || r.spread != null) e.withSpread++;
      (r.refuses || []).forEach(function (x) { e.refusals[x] = 1; });
    });
    return Object.keys(bySrc).map(function (k) {
      var e = bySrc[k];
      return {
        source: e.source, kind: e.kind, licence: e.licence,
        records: e.records, units: Object.keys(e.units).length,
        hazards: Object.keys(e.hazards), methods: Object.keys(e.methods),
        unavailable: e.unavailable, withSpread: e.withSpread,
        refusals: Object.keys(e.refusals)
      };
    }).sort(function (a, b) { return b.records - a.records; });
  }

  

  function distribution(id) {
    var r = REC[id];
    if (!r) return null;
    if (r.members && r.members.length >= 3) {
      return { members: r.members.slice(), n: r.members.length,
               memberModels: r.memberModels ? r.memberModels.slice() : null,
               unit: r.unit, hazard: r.hazard, median: r.median,
               source: r.source, kind: r.kind, empirical: true };
    }
    return null;
  }

  

  function rows(filter) {
    return all().filter(filter || function () { return true; }).map(function (r) {
      var unc = (r.iqr != null) ? ('IQR ' + r.iqr.toFixed(2) + (r.unit ? ' ' + r.unit : ''))
              : (r.spread != null) ? ('range ' + r.spread.toFixed(2) + (r.unit ? ' ' + r.unit : ''))
              : (r.tier === 'unavailable') ? 'not available'
              : 'not quantified';
      return {
        label: r.label, unit: r.unit_key, hazard: r.hazard,
        value: r.value == null ? null : r.value,
        units: r.unit, kind: r.kind, source: r.source, method: r.method,
        uncertainty: unc, n: r.n, lead: r.lead,
        elevation: r.elevation, refuses: r.refuses.slice()
      };
    });
  }

  function clear(){ REC = Object.create(null); ORDER = []; }

  G.AGN.evidence = {
    KIND: KIND, record: record, get: get, all: all,
    byKind: byKind, byHazard: byHazard,
    inventory: inventory, distribution: distribution, rows: rows,
    clear: clear,
    count: function(){ return ORDER.length; },
     
    summary: function () {
      var a = all(), un = a.filter(function(r){return r.value===null;}).length;
      var sp = a.filter(function(r){return r.iqr!=null||r.spread!=null;}).length;
      return { records: a.length, sources: inventory().length,
               unavailable: un, withUncertainty: sp,
               quantifiedPct: a.length ? Math.round(sp / a.length * 100) : 0 };
    }
  };
})(window);
