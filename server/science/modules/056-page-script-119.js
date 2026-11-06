


(function (G) {
  'use strict';
  G.AGN = G.AGN || {};
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  

  var CATALOGUE = {
    'multi-model forecast': {
      what: 'Eleven independent global NWP models, two of them machine-learning (AI weather model, international climate centre AIGFS)',
      

      resolution: (function(){ try{ var e=window.mmEffectiveResolutionKm&&window.mmEffectiveResolutionKm();
                     return e ? (e.finestKm+'-'+e.coarsestKm+' km native across '+e.n+' models (coarsest: '+e.coarsestModel
                              +'); a multi-model median carries the coarsest member\'s support. Queried at the population-weighted elevation.')
                              : '9-25 km native, queried at the population-weighted elevation'; }
                   catch(_){ return '9-25 km native, queried at the population-weighted elevation'; } })(),
      cadence: 'four runs a day',
      why: 'Model disagreement is the uncertainty. At Skardu the eleven spanned 21.7 °C for one hour and one point.',
      licence: 'model forecast (forecast provider, commercial licence)'
    },
    'global river-flow model': {
      what: 'Fifty-member ensemble river discharge (global river-flow model, model reaches), against return levels fitted on 29 years of reanalysis at each reach',
      resolution: 'snapped model reaches, not gauges (25 in this build; the count is on /api/flood/national), 30-day horizon',
      cadence: 'daily',
      why: 'The Indus at Sukkur carries rain that fell in the Karakoram a week earlier. Local rain cannot describe it.',
      licence: 'Copernicus, via the forecast provider (commercial plan)'
    },
    'Copernicus GLO-30 x WorldPop': {
      what: '30 m DEM crossed with 100 m constrained population, per tehsil',
      resolution: '572 of 576 scoreable tehsils',
      cadence: 'static, rebuilt on demand',
      why: 'The polygon mean describes uninhabited ridge. 174 tehsils carried more than 1 °C of error, worst 13.6 °C.',
      licence: 'Copernicus free and open; WorldPop CC BY 4.0'
    },
    'ICIMOD/NDMA': {
      what: 'Upper Indus glacial-lake inventory, 3,044 lakes across ten basins',
      resolution: 'basin and district',
      cadence: 'periodic',
      why: 'GLOF susceptibility is anchored on documented outburst history, with the inventory as bounded evidence only.',
      licence: 'CC BY 4.0'
    },
    'global reanalysis / land reanalysis': {
      what: 'Reanalysis back to 1940',
      resolution: '0.25° atmospheric, 0.1° land',
      cadence: 'archive',
      why: 'Return periods and thresholds computed from the record instead of assumed.',
      licence: 'Copernicus free and open'
    },
    'CMIP6 HighResMIP': {
      what: 'Seven downscaled climate models, deltas against a 1991–2010 baseline',
      resolution: '~10 km, elevation-aware',
      cadence: 'static scenario',
      why: 'A projection, never a forecast. The six spanned 16.5 °C for July 2050 at Lahore.',
      licence: 'CMIP6 terms of use'
    }
  };

  function fabric() {
    var E = G.AGN.evidence;
    if (!E) return { rows: [], summary: null, catalogue: CATALOGUE };
    var inv = E.inventory();
    var rows = inv.map(function (r) {
      var meta = CATALOGUE[r.source] || null;
      return {
        source: r.source, kind: r.kind, records: r.records, units: r.units,
        hazards: r.hazards, methods: r.methods,
        coverage: r.records ? Math.round((r.records - r.unavailable) / r.records * 100) : 0,
        quantified: r.records ? Math.round(r.withSpread / r.records * 100) : 0,
        refusals: r.refusals,
        licence: r.licence || (meta && meta.licence) || 'not recorded',
        what: meta && meta.what, resolution: meta && meta.resolution,
        cadence: meta && meta.cadence, why: meta && meta.why,
        described: !!meta
      };
    });
    return { rows: rows, summary: E.summary(), catalogue: CATALOGUE };
  }

  function fabricHTML() {
    var f = fabric();
    if (!f.rows.length) {
      return '<p class="agn-fabric-empty">No evidence has been recorded yet. '
           + 'Run a national sweep or an enrichment pass and this page fills itself.</p>';
    }
    var s = f.summary || {};
    var h = '<p class="agn-fabric-summary">' + s.records + ' records from ' + s.sources
          + ' source' + (s.sources === 1 ? '' : 's') + ' · ' + s.quantifiedPct
          + '% carry a stated uncertainty · ' + s.unavailable + ' recorded as unavailable. '
          + 'This page is generated from what ran, not from a maintained list.</p>';
    h += '<table class="agn-fabric-table"><thead><tr>'
       + '<th>Source</th><th>Kind</th><th>What it is</th><th>Records</th><th>Units</th>'
       + '<th>Available</th><th>With spread</th><th>Refuses to claim</th><th>Licence</th>'
       + '</tr></thead><tbody>';
    f.rows.forEach(function (r) {
      h += '<tr><td>' + esc(r.source) + '</td><td>' + esc(r.kind) + '</td>'
         + '<td>' + esc(r.what || 'not catalogued') + (r.resolution ? '<br><small>' + esc(r.resolution) + '</small>' : '') + '</td>'
         + '<td>' + r.records + '</td><td>' + r.units + '</td>'
         + '<td>' + r.coverage + '%</td><td>' + r.quantified + '%</td>'
         + '<td>' + (r.refusals.length ? esc(r.refusals.join('; ')) : '<em>nothing recorded</em>') + '</td>'
         + '<td>' + esc(r.licence) + '</td></tr>';
    });
    h += '</tbody></table>';
    var undesc = f.rows.filter(function (r) { return !r.described; });
    if (undesc.length) {
      h += '<p class="agn-fabric-gap">' + undesc.length + ' source'
         + (undesc.length === 1 ? ' is' : 's are') + ' in use but not catalogued: '
         + esc(undesc.map(function (r) { return r.source; }).join(', '))
         + '. A source the platform uses and cannot describe is a gap, not a detail.</p>';
    }
    return h;
  }

  

   

  G.AGN.fabric = { rows: fabric, html: fabricHTML, catalogue: CATALOGUE };
})(window);
