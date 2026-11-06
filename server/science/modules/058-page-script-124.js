


(function (G) {
  'use strict';
  G.AGN = G.AGN || {};

  

  

  function vizOf() {
    try { return (G.AGN && G.AGN.viz) ? G.AGN.viz : null; } catch (_) { return null; }
  }

  var PAGES = {
    pCover:    { title: 'Assessment cover', needs: [],
                 gives: 'what this document is, for which place, at what time, and under which output class' },
    

    pPortfolio:{ title: 'Portfolio', needs: ['portfolio'],
                 gives: 'every screened asset in the client estate and the operational class it '
                      + 'holds \u2014 the set this document is about' },
    pCoverage: { title: 'Data coverage', needs: ['coverage'],
                 gives: 'how many units answered, how many were estimated and at what measured error, how many have neither' },
    pHazard:   { title: 'Hazard screening', needs: ['hazards'],
                 gives: 'the scored hazards for this unit, each carrying its own state' },
    

    pScope:    { title: 'Hazard scope', needs: ['hazards'],
                 gives: 'every hazard the platform screens, which of them this document covers, '
                      + 'and for each one it does not, whether the mechanism cannot occur here, '
                      + 'an input did not arrive, or this build holds no method for it' },
    pFlood:    { title: 'Flood pathways', needs: ['flood'],
                 gives: 'the pluvial and riverine pathways separately, with the governing one named' },
    pCompound: { title: 'Compound pathway', needs: ['mc'],
                 gives: 'joint and conditional exceedance, the dependence and where it cannot move' },
    pClimate:  { title: 'Climate outlook', needs: ['climate'],
                 gives: 'CMIP6 deltas against the 1991-2010 baseline, inside the coverage the dataset has' },
    pEvidence: { title: 'Evidence annex', needs: ['evidence'],
                 gives: 'every value this document rests on, its source, and what it refuses to claim' },
    pDeviation:{ title: 'Recorded deviations', needs: ['deviations'],
                 gives: 'every place the build differs from its own declared specification' },
    pMethod:   { title: 'Method and parameters', needs: ['parameters'],
                 gives: 'the constants the shown figures actually consumed, with their calibration status' },
    pLimits:   { title: 'What this document does not claim', needs: [],
                 gives: 'the refusals, gathered in one place, so they are not only footnotes' },
    

    pSummary:  { title: 'Decision summary', needs: ['hazards'],
                 gives: 'the hazards at a glance with their evidence state, the leading one, '
                      + 'and the routes that failed while this document was built' },
    pCompleteness: { title: 'Evidence behind every hazard', needs: ['hazards'],
                 gives: 'per hazard, how many of its governing inputs were retrieved, how many '
                      + 'have no live value and how many are absent — the data programme, priced '
                      + 'by what is missing' },
    pSolutions:{ title: 'Measures', needs: ['hazards'],
                 gives: 'what to do about each admitted hazard, in cost class rather than '
                      + 'money, with the owner and the measurement each one needs first' },
    

    pSkill:    { title: 'How wrong the forecast has been', needs: [],
                 gives: 'the measured error by lead and by place, and which variables carry '
                      + 'no measured error at all' }
  };
  var PAGE_IDS = Object.keys(PAGES);

  

  var TYPES = {
    brief:      { docTitle: 'AI GEO NIGRAAN Operational Brief', docPurpose: 'Decide what to do in the next operating period for this unit', label: 'Operational brief',
                  desc: 'The decision summary, the hazard screening for this unit, the measures, '
                      + 'and what the document does not claim.' },
    operations: { docTitle: 'AI GEO NIGRAAN Operations Report', docPurpose: 'Plan operations for this unit against the hazards now screened', label: 'Operations report',
                  desc: 'The decision summary, data coverage, the hazard screening, the flood '
                      + 'pathways, the measures, how wrong the forecast has been, and what the '
                      + 'document does not claim.' },
    

    technical:  { docTitle: 'AI GEO NIGRAAN Site Climate & Hazard Screening', docPurpose: 'Screen this site and prioritise it for detailed assessment', label: 'Technical report',
                  desc: 'The decision summary, data coverage, the hazard screening, the evidence '
                      + 'behind every hazard, the flood pathways, the compound pathway, '
                      + 'the climate outlook, the measures, how wrong the forecast has been, '
                      + 'the method and parameters, the evidence annex, '
                      + 'and what the document does not claim.' },
    engineering:{ docTitle: 'AI GEO NIGRAAN Engineering Data-Readiness Note', docPurpose: 'Establish whether the data behind these numbers is fit to design on', label: 'Engineering data-readiness note',
                  desc: 'Whether the data behind these numbers is fit to design on: the decision '
                      + 'summary, data coverage, completeness, the flood pathways, how wrong the '
                      + 'forecast has been, the method and parameters, the evidence annex, and '
                      + 'what the document does not claim. It carries no measures table \u2014 '
                      + 'that is an operations product, not an engineering one.' },
    portfolio:  { docTitle: 'AI GEO NIGRAAN Portfolio Prioritisation', docPurpose: 'Rank a client estate so the next assessment budget goes to the right assets', label: 'Portfolio prioritisation',
                  desc: 'The client estate: every screened asset with the operational class it '
                      + 'holds, the measures, and what the document does '
                      + 'not claim. Its subject is a set of assets rather than one unit.' },
    readiness72:{ docTitle: 'AI GEO NIGRAAN 72-Hour Operational Readiness Brief', docPurpose: 'Prepare the next 72 hours of operations for this unit', label: '72-hour operational readiness brief',
                  desc: 'The decision summary, data coverage, the hazard screening, the measures, '
                      + 'how wrong the forecast has been, and what the document does not claim.' },
    weatherImpact:{ docTitle: 'AI GEO NIGRAAN Operational Weather Impact Brief', docPurpose: 'State what the current weather does to operations at this unit', label: 'Operational weather impact brief',
                  desc: 'The decision summary, the hazard screening, the flood pathways, the '
                      + 'measures, how wrong the forecast has been, and what the document does '
                      + 'not claim.' },
    dataGap:    { docTitle: 'AI GEO NIGRAAN Data Gap Brief', docPurpose: 'State what did not arrive and what closing each gap would buy', label: 'Data gap brief',
                  desc: 'What did not arrive and what that costs: data coverage, completeness and '
                      + 'the evidence annex. It carries no verdict, because a document about '
                      + 'missing data must not also publish a decision drawn from it.' },
    assurance:  { docTitle: 'AI GEO NIGRAAN Methodology & Evidence Pack', docPurpose: 'Let a reviewer check how every number in the companion report was produced', label: 'Assurance pack',
                  desc: 'The decision summary, the evidence behind every hazard, the evidence '
                      + 'annex, the recorded deviations, the method and parameters, how wrong '
                      + 'the forecast has been, and what the document does not claim.' }
  };
  

  

  

  var ROUTES = {
    brief:       ['pCover', 'pSituation', 'pSummary', 'pHazard', 'pPoint', 'pActions', 'pCrossings', 'pSolutions',
                  'pOutlook15', 'pScope', 'pVerified', 'pRepro', 'pLimits'],
    operations:  ['pCover', 'pSituation', 'pSummary', 'pHazard', 'pPoint', 'pFlood', 'pActions', 'pCrossings', 'pSolutions',
                  'pOutlook15', 'pOutlookLong', 'pCoverage', 'pScope', 'pVerified', 'pRepro', 'pLimits'],
    technical:   ['pCover', 'pSituation', 'pSummary', 'pHazard', 'pPoint', 'pFlood', 'pCompound', 'pActions', 'pCrossings', 'pSolutions',
                  'pOutlook15', 'pOutlookLong', 'pClimate',
                  'pCoverage', 'pScope', 'pCompleteness', 'pVerified', 'pMethod', 'pEvidence', 'pRepro', 'pLimits'],
    assurance:   ['pCover', 'pSummary', 'pCompleteness', 'pEvidence', 'pDeviation', 'pMethod',
                  'pVerified', 'pRepro', 'pLimits'],
    

    engineering: ['pCover', 'pSummary', 'pPoint', 'pCrossings', 'pFlood', 'pCoverage', 'pCompleteness', 'pScope',
                  'pVerified', 'pMethod', 'pEvidence', 'pRepro', 'pLimits'],
     
    portfolio:   ['pCover', 'pPortfolio', 'pSummary', 'pScope', 'pSolutions', 'pRepro', 'pLimits'],
    readiness72: ['pCover', 'pSituation', 'pSummary', 'pHazard', 'pPoint', 'pActions', 'pCrossings', 'pSolutions',
                  'pOutlook15', 'pCoverage', 'pScope', 'pVerified', 'pRepro', 'pLimits'],
    weatherImpact:['pCover', 'pSituation', 'pSummary', 'pHazard', 'pPoint', 'pFlood', 'pActions', 'pCrossings', 'pSolutions',
                  'pOutlook15', 'pScope', 'pVerified', 'pRepro', 'pLimits'],
    

    dataGap:     ['pCover', 'pCoverage', 'pCompleteness', 'pEvidence', 'pRepro', 'pLimits']
  };
   
  Object.keys(ROUTES).forEach(function (k) { var r = ROUTES[k], i = r.indexOf('pCrossings'); if (i >= 0 && r.indexOf('pGlof') < 0) r.splice(i + 1, 0, 'pGlof'); });
   
  var PAGE_SECTION = { pSituation:'cover', pGlof:'ops', pSummary:'ops', pHazard:'ops', pPoint:'ops', pFlood:'ops', pCompound:'ops',
    pActions:'ops', pCrossings:'ops', pSolutions:'ops', pPortfolio:'ops', pOutlook15:'outlook', pOutlookLong:'plan', pClimate:'plan',
    pCoverage:'evidence', pScope:'evidence', pCompleteness:'evidence', pVerified:'evidence', pSkill:'evidence',
    pMethod:'evidence', pEvidence:'evidence', pDeviation:'evidence', pRepro:'evidence', pLimits:'evidence' };
  var SECTION_TITLE = { ops:'Operations · now to 72 hours', outlook:'Outlook · 1 to 15 days',
    plan:'Planning · weeks ahead, season and climate',
    evidence:'Evidence and assurance' };

  var SEQ = 0;
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  

  function freeze(ctx) {
    ctx = ctx || {};
    

    try {
      if (!ctx.national) {
        var _sj0 = null; try { _sj0 = G.AGN.subject.get(); } catch (_) {}
        var _u0 = ctx.unit || (_sj0 && (_sj0.unit || _sj0.unitUnresolvedName));
        if (!ctx.localContext && G.AGN.reportCtx && G.AGN.reportCtx.peek) { var _c0 = G.AGN.reportCtx.peek(_u0); if (_c0) ctx.localContext = _c0; }
        var _lc0 = ctx.localContext ? Object.assign({}, ctx.localContext) : { __noServerContext: true };
        if (G.AGN.actions && G.AGN.actions.build) { try { _lc0.actionRecords = G.AGN.actions.build({ context: ctx.localContext || null }); } catch (_) {} }
         
        if (G.AGN.crossings && G.AGN.crossings.forAsset && _sj0 && _sj0.asset_id) { try { var _xc0 = G.AGN.crossings.forAsset(_sj0.asset_id, _sj0.asset_name); if (_xc0) _lc0.crossings = _xc0; } catch (_) {} }
         
        

        var _pt0 = null; try { _pt0 = (_sj0 && _sj0.asset_lat != null) ? { lat: _sj0.asset_lat, lon: _sj0.asset_lon, basis: 'asset' } : (G.AGN.subjectPoint ? G.AGN.subjectPoint() : null); } catch (_) {}
        if (G.AGN.glofCtx && G.AGN.glofCtx.peek && _pt0) { try { var _gl0 = G.AGN.glofCtx.peek(_pt0.lat, _pt0.lon); if (_gl0) _lc0.glofUpstream = _gl0; } catch (_) {} }
        ctx.localContext = _lc0;
        if (!ctx.pointRun && _pt0 && G.AGN.reportCtx && G.AGN.reportCtx.pointRun) {
          var _pr0 = G.AGN.reportCtx.pointRun(_pt0.lat, _pt0.lon);
          ctx.pointRun = _pr0 || { ok: false, why: 'the frozen model run for this ' + (_pt0.basis === 'asset' ? 'asset' : _pt0.basis === 'selected place' ? 'selected place' : 'tehsil centroid') + ' had not been retrieved when the document was frozen; generate again in a few seconds' };
        }
      }
    } catch (_) {}
    

    try { if (!ctx.caseDocument && G.AGN.casebook && G.AGN.casebook.frozen) { var _cf0 = G.AGN.casebook.frozen(); if (_cf0) { if (_cf0.document) ctx.caseDocument = _cf0.document; if (_cf0.portfolio) ctx.casePortfolio = _cf0.portfolio; if (_cf0.families) ctx.caseFamilies = _cf0.families; } } } catch (_) {}
    var type = ROUTES[ctx.type] ? ctx.type : 'technical';
    

    SEQ += 1;
    var doc = {
      id: 'NIG-' + Date.now().toString(36).toUpperCase() + '-' + SEQ.toString(36).toUpperCase(),
      at: Date.now(),
      type: type,
      typeLabel: TYPES[type].label,
      typeDesc: TYPES[type].desc,
      pages: ROUTES[type].slice(),
      

      unit: ctx.unit || (function(){ try{ var _s=AGN.subject.get();
              return _s.unit || _s.unitUnresolvedName || null; }catch(_){ return null; } })(),
      

      subject: (function(){ try{ return AGN.subject.get(); }catch(_){ return ctx.subject || null; } })(),
      subjectClaimed: (ctx.subject && ctx.subject.unit) || null,
      

      title: ctx.title || (TYPES[ctx.type] && TYPES[ctx.type].docTitle)
             || 'NIGRAAN climate assessment',
      purpose: ctx.purpose || (TYPES[ctx.type] && TYPES[ctx.type].docPurpose)
             || 'Preliminary screening',
      evidence: {},
      refusals: [],
      outputClass: null,
      provenance: null
    };

    

    try {
      var _sig = null, _int = null;
      try { _sig = (G.AGN.decisionCase && G.AGN.decisionCase.signature)
                     ? G.AGN.decisionCase.signature() : null; } catch (_) {}
      try { _int = (G.AGN.decisionCase && G.AGN.decisionCase.integrity)
                     ? G.AGN.decisionCase.integrity() : null; } catch (_) {}
      doc.document_id = doc.id;
      doc.project_id = _sig ? (_sig.project_id || null) : null;
      doc.decision_case_id = (_int && _int.case_id) || null;
      doc.asset_id = _sig ? (_sig.asset_id || null) : null;
      doc.hazard_id = _sig ? (_sig.hazard_id || null) : null;
      doc.horizon_id = _sig ? (_sig.horizon_id || null) : null;
      doc.horizon_status = _sig ? (_sig.horizon_status || null) : null;
      doc.lead_hours = _sig ? (_sig.lead_hours == null ? null : _sig.lead_hours) : null;
      doc.client_name = _sig ? (_sig.client_name || null) : null;
      doc.engine_methodology_version = _sig ? (_sig.engine_methodology_version || null) : null;
      doc.methodology_version = doc.engine_methodology_version;
      doc.build_version = (G.AGN_BUILD && G.AGN_BUILD.patch) || G.AGN_VERSION || null;    
      doc.generated_at = new Date(doc.at).toISOString();
       
      try {
        var _sc = (G.AGN.decisionCase && G.AGN.decisionCase.latest)
                    ? G.AGN.decisionCase.latest('scenario', {completeEnvelope:true}) : null;
        doc.scenario_id = _sc ? (_sc.scenario_id || _sc.calculation_id || null) : null;
      } catch (_) { doc.scenario_id = null; }
       
      doc.evidence_ids = [];
      try {
        (G.AGN.decisionCase.stores() || []).forEach(function (d2) {
          (G.AGN.decisionCase.evidence(d2.store, {completeEnvelope:true}) || [])
            .forEach(function (rec) {
              doc.evidence_ids.push({
                store: d2.store,
                evidence_id: rec.evidence_id || null,
                kind: rec.kind || null,
                created_at: rec.created_at || null,
                source: rec.source || null,
                rebound_from: rec.rebound_from || null });
            });
        });
      } catch (_) {}
      

      doc.status = 'draft';
      doc.prepared_by = 'NIGRAAN ' + (G.AGN_VERSION || '') + ' (operator session, unauthenticated)';
      doc.reviewed_by = null;
      doc.reviewed_at = null;
      doc.approved_by = null;
      doc.approved_at = null;
      doc.approval_note = 'This build has no authenticated user identity, so preparer is '
        + 'recorded as the session and reviewer and approver are left null rather than '
        + 'asserted. A reviewed or approved document must be countersigned outside this file.';
      doc.supersedes = null;
      try {
        var _pst = (G.AGN.project && G.AGN.project.state) ? G.AGN.project.state() : null;
        

        var _prev = null;
        if (_pst && Array.isArray(_pst.reports)) {
          for (var _pi = _pst.reports.length - 1; _pi >= 0; _pi--) {
            var _pr = _pst.reports[_pi];
            if (_pr && _pr.decision_case_id === doc.decision_case_id && (_pr.type || null) === (doc.type || null)) { _prev = _pr; break; }
          }
        }
        if (_prev) {
          doc.supersedes = _prev.document_id || _prev.id || null;
        }
      } catch (_) {}
      var _need = ['project_id','decision_case_id','asset_id','hazard_id','horizon_id',
                   'engine_methodology_version','build_version','generated_at'];
      var _gaps = _need.filter(function (k) { return doc[k] == null; });
      if (!doc.evidence_ids.length) _gaps.push('evidence_ids');
      

      var _nullEv = doc.evidence_ids.filter(function (r) { return !r || r.evidence_id == null; });
      if (_nullEv.length) {
        _gaps.push(_nullEv.length + ' of ' + doc.evidence_ids.length
                   + ' cited records have no evidence_id');
      }
      doc.identity_incomplete = _gaps.length ? _gaps : null;
      

    } catch (e) {
      doc.identity_incomplete = ['the identity envelope could not be assembled'];
    }

     
    

    

    

    var DOC_META = (function(){ try{ return G.AGN.docMeta(); }catch(_){
      return ['type','title','purpose','unit','national','id','at','subject','subjectClaimed']; } })();
    Object.keys(ctx).forEach(function (k) {
      if (DOC_META.indexOf(k) >= 0) return;
      if (ctx[k] === undefined) return;
      doc.evidence[k] = ctx[k];
    });
     
    

    try { var _prm = doc.evidence.parameters; if (_prm && Array.isArray(_prm.rows)) _prm.rows.forEach(function (r) { if (r && typeof r === 'object') delete r.reads; }); } catch (_) {}
    

    try {
      var _hash = function (v) { try { return 'sha256:' + G.AGN.hash.sha256(G.AGN.hash.canonical(v)); } catch (_) { return null; } };
      var _A = null; try { _A = G.AGN.project && G.AGN.project.activeAsset ? JSON.parse(JSON.stringify(G.AGN.project.activeAsset())) : null; } catch (_) {}
      var _PR = doc.evidence.pointRun || null, _as = doc.evidence.assessment || {};
      var _hzRec = null; try { _hzRec = G.AGN.decisionCase.latest('hazard_evidence', { completeEnvelope: true }); } catch (_) {}
      var _vr = null; try { _vr = G.AGN.vulnerabilityRegistry || null; } catch (_) {}
      var _corr = (_PR && _PR.ok) ? _PR.correction : null;
      doc.reproducibility = {
        record_version: 'v91.17.24',
        report_id: doc.id, project_id: doc.project_id || null, decision_case_id: doc.decision_case_id || null,
        analysis_snapshot: (G.AGN.snapshot && G.AGN.snapshot.id) || null,    
        asset_id: doc.asset_id || (_A && _A.asset_id) || null,
        asset_version: _A ? _hash(_A) : null,
        asset_snapshot: _A ? { name: _A.name || null, type: _A.asset_type || null, industry: _A.industry || null, latitude: _A.latitude, longitude: _A.longitude,
                               criticality: _A.criticality || null,
                               maximum_tolerable_downtime_hr: _A.maximum_tolerable_downtime_hr == null ? null : _A.maximum_tolerable_downtime_hr,
                               backup_power: _A.backup_power == null ? null : _A.backup_power, flood_protection: _A.flood_protection == null ? null : _A.flood_protection } : null,
        coordinates: _as.atAssetCoordinate ? { lat: _as.siteLat, lon: _as.siteLon, label: 'CLIENT SUPPLIED' } : (_A ? { lat: _A.latitude, lon: _A.longitude, label: 'CLIENT SUPPLIED' } : ((_PR && _PR.ok && _PR.site && _PR.site.lat != null) ? { lat: _PR.site.lat, lon: _PR.site.lon, label: _PR.siteBasis === 'tehsil centroid' ? 'CALCULATED (tehsil centroid)' : _PR.siteBasis === 'selected place' ? 'CALCULATED (selected place)' : 'MODELLED' } : null)),    
        elevation_m: (_PR && _PR.ok && _PR.site) ? { value: _PR.site.elevation, source: (_PR.siteBasis === 'tehsil centroid' && /supplied/i.test(String(_PR.site.elevationSource || ''))) ? 'the tehsil\u2019s served height (the same figure as page 1)' : _PR.site.elevationSource, label: 'MODELLED (DEM)' } : null,
        hazard_id: doc.hazard_id || null, horizon_id: doc.horizon_id || null, lead_hours: doc.lead_hours == null ? null : doc.lead_hours,
        screening_inputs: 'the forecast NIGRAAN served at retrieval time (live dashboard path: the zone model at the point\u2019s height with the served corrections); the named run below is the reproducible reference forecast for this asset',
        forecast: (_PR && _PR.ok) ? { provider: _PR.provider, model: _PR.model, model_label: _PR.modelLabel, model_initialization: _PR.run,
                                      valid_from: _PR.validFrom, valid_to: _PR.validTo, lead_hours_at_first_step: _PR.leadHoursAtFirstStep,
                                      retrieved_at: _PR.retrievedAt, grid_cell: _PR.gridCell, request: _PR.request, input_hash: _PR.inputHash }
                                    : { withheld: (_PR && _PR.why) || 'no frozen model run for this subject' },
        input_hashes: { point_run: (_PR && _PR.inputHash) || null, hazard_screening: _hzRec ? _hash(_hzRec) : null,
                        forecast_context: (ctx.localContext && !ctx.localContext.__noServerContext) ? _hash(ctx.localContext.outlook || null) : null,
                        action_records: (ctx.localContext && ctx.localContext.actionRecords) ? _hash(ctx.localContext.actionRecords.records) : null,
                        limit_crossings: (ctx.localContext && ctx.localContext.crossings) ? _hash(ctx.localContext.crossings) : null,
                        glacial_lakes: (ctx.localContext && ctx.localContext.glofUpstream) ? _hash(ctx.localContext.glofUpstream) : null },
         
        screening_basis: (function () { try { var _as = (G.AGN.sectionState && G.AGN.sectionState.for) ? G.AGN.sectionState.for('assessments').getState().assessment : null; var _st = _as && _as.station; var _k = _st && _st.__unitKey; var _r = _k ? (G.DISTRICT_IN || {})[_k] : null;
          return { unit: _k || (_st && _st.name) || null, feed: (_r && (_r.fcLabel || _r.fcSource)) || (_st && _st.liveSource) || null, feedUpdatedAt: (_r && _r.fcUpdatedAt) ? new Date(typeof _r.fcUpdatedAt === 'number' ? _r.fcUpdatedAt : Date.parse(_r.fcUpdatedAt)).toISOString() : null, live: !!(_r ? (_r.weatherLive || _r.nationalLive) : (_st && _st.weatherLive)), note: 'hazard classes come from the tehsil national sweep; the asset forecast comes from the named run above; the limit crossings and the physical check (0-72 h) come from the served forecast at the place' }; } catch (_) { return null; } })(),
        correction_version: { reference_series: _corr || 'no reference series', served_dashboard: 'MACH ' + ((G.AGN_BUILD && G.AGN_BUILD.patch) || G.AGN_VERSION) + ' server: ' + (function () { try { var _p = G.AGN.data && G.AGN.data.activePoint ? G.AGN.data.activePoint() : null; var _v = (_p && _p.lat != null && G.AGN.nowAt) ? G.AGN.nowAt.peek(_p.lat, _p.lon) : null; return (_v && _v.chain && _v.chain.length) ? 'temperature chain served at ' + (_p.name || (+_p.lat).toFixed(3) + ', ' + (+_p.lon).toFixed(3)) + ': ' + _v.chain.join(' -> ') + (_v.build && _v.build.totalDeltaC != null ? ' (net ' + (_v.build.totalDeltaC > 0 ? '+' : '') + _v.build.totalDeltaC + ' °C on the global forecast)' : '') : 'temperature chain as listed by /api/point/forecast (chain) for the place; not read when this record was built'; } catch (_) { return 'temperature chain not read'; } })() },
        hazard_engine_version: doc.engine_methodology_version || null, build_version: doc.build_version || null,
        station_observations_used: [_as.guardStation ? (_as.guardStation + (_as.guardKm != null ? ' (' + _as.guardKm + ' km, verification only)' : '')) : null,
                                    (ctx.localContext && ctx.localContext.skill && ctx.localContext.skill.station) ? (ctx.localContext.skill.station.name + ' (' + ctx.localContext.skill.station.km + ' km, forecast-error check)') : null].filter(Boolean),
        vulnerability_version: (_vr && Array.isArray(_vr.records) && _vr.records.length) ? (_vr.version || 'registry') : 'none approved — the vulnerability registry is empty, so no damage is computed from a hazard',
        scenario_id: doc.scenario_id || null,
        limitations: 'listed on the "What this document does not claim" page and in refusals',
        approval_state: doc.status || 'draft',
        content_hash: 'the content hash printed with this document (SHA-256), taken over the whole document including this record'
      };
    } catch (e) { doc.reproducibility = { error: 'the reproducibility record could not be assembled: ' + ((e && e.message) || e) }; }

    

    try {
      if (G.AGN.prov) {
        var P = G.AGN.prov, ST = P.STATE;
        var claims = [];

        

        function state(has, ok, label) {
          claims.push({ state: (has && ok) ? ST.RETRIEVED : ST.ABSENT,
                        why: label + ((has && ok) ? '' : ' (withheld)'), unknown: false, withheld: !(has && ok) });
        }

        

        if (doc.pages.indexOf('pHazard') >= 0) {
          var hz = ctx.hazards || [];
          

          var categorical = hz.filter(function (h) { return h && h.categorical === true; });
          var scorable = hz.length - categorical.length;
          var scored = hz.filter(function (h) {
            return h && !h.unavailable && (hazIndex(h) !== null || hazLevel(h) !== null); });
          

          var withProv = scored.filter(function (h) { return !!h.prov; });
          var anyRetrieved = withProv.some(function (h) { return h.prov === 'retrieved'; });
          var allRetrieved = withProv.length > 0 && withProv.every(function (h) {
            return h.prov === 'retrieved'; });
          claims.push({
            state: !hz.length ? ST.ABSENT
                 : !scored.length ? ST.ABSENT
                 : (withProv.length === 0 ? ST.DESIGN
                    : (allRetrieved ? ST.RETRIEVED : ST.DESIGN)),
            why: scored.length + ' of ' + scorable + ' scorable hazards scored'
               + (categorical.length ? '; ' + categorical.length + ' more carry a code class' : '')
               + (withProv.length
                   ? (', ' + withProv.filter(function (h) { return h.prov === 'retrieved'; }).length
                      + ' of them on retrieved inputs')
                   : ', none carrying input provenance'),
            unknown: false
          });
          doc.hazardProvenance = { scored: scored.length, total: hz.length,
                                   scorable: scorable, categorical: categorical.length,
                                   withProvenance: withProv.length,
                                   retrieved: withProv.filter(function (h) {
                                     return h.prov === 'retrieved'; }).length,
                                   anyRetrieved: anyRetrieved };
        }
        if (doc.pages.indexOf('pCoverage') >= 0) {
          var cv = ctx.coverage || null;
          state(!!cv, !!(cv && cv.live > 0), 'national coverage ' + ((cv && cv.live) || 0) + ' units');
        }
        if (doc.pages.indexOf('pFlood') >= 0) {
          var fl = ctx.flood || null;
          state(!!fl, !!(fl && (fl.pluvial !== null || fl.riverine !== null)),
                'flood pathways');
        }
        if (doc.pages.indexOf('pCompound') >= 0) {
          var mc = ctx.mc || null;
          state(!!mc, !!(mc && mc.refused === false), 'compound simulation');
        }
        if (doc.pages.indexOf('pClimate') >= 0) {
          var cl = ctx.climate || null;
          state(!!cl, !!(cl && cl.models && cl.models.length), 'climate delta');
        }
        if (doc.pages.indexOf('pEvidence') >= 0) {
          var ev = ctx.evidence || [];
          var evTotal = (ctx.evidenceTotal != null) ? Number(ctx.evidenceTotal) : ev.length;
          state(evTotal > 0, evTotal > 0,
                evTotal + ' evidence records'
                + (evTotal > ev.length ? ' (' + ev.length + ' printed)' : ''));
        }

        var _made = claims.filter(function (c) { return !c.withheld; });
        var derived = _made.length ? P.derive(_made, 'this document')
                                    : P.of(ctx.provState || 'absent');
        

        if (ctx.provState && P.STATE) {
          derived = P.derive([derived, { state: ctx.provState, why: 'caller-declared', unknown: false }],
                             'this document');
        }
        doc.provenance = derived;
        doc.provenanceClaims = claims;
        

        var _scenarioState = false;
        try {
          var _sl = (G.AGN.sectionState && G.AGN.sectionState.state)
                      ? G.AGN.sectionState.state('hybridlab', {}) : null;
          var _preset = _sl ? (_sl.preset || null) : null;
          _scenarioState = !!(_preset && _preset !== 'baseline');
        } catch (_) {}
        doc.scenarioState = _scenarioState;
        doc.scenarioStateBasis = 'the Scenario Lab preset, read from its own section state. '
          + 'The presence of a scenario EVIDENCE record in doc.evidence.scenario is not '
          + 'this flag and never was.';
        doc.outputClass = P.outputClass({
          scenario: _scenarioState || ctx.scenario === true,
          national: !!ctx.national,
          prov: derived.state
        });
      }
    } catch (_) {}

    


    

    var _routeDropped = 0;
    var _push = function (entry) {
      if (entry && entry.page && doc.pages && doc.pages.indexOf(entry.page) < 0) {
        _routeDropped += 1; return;
      }
      doc.refusals.push(entry);
    };

    if (doc.evidence.mc && doc.evidence.mc.refused)
      _push({ page: 'pCompound', what: 'the compound pathway',
                          why: doc.evidence.mc.why });
    if (doc.evidence.mc && doc.evidence.mc.refused === false
        && doc.evidence.mc.severityReportable === false)
      _push({ page: 'pCompound', what: 'the combined severity quantiles',
                          why: doc.evidence.mc.severityWithheldWhy });
    if (doc.evidence.mc && doc.evidence.mc.refused === false
        && doc.evidence.mc.liftReportable === false)
      _push({ page: 'pCompound', what: 'the dependence effect',
                          why: doc.evidence.mc.liftWithheldWhy });
    if (doc.evidence.coverage && doc.evidence.coverage.contextVariables)
      doc.evidence.coverage.contextVariables.forEach(function (v) {
        var w = (doc.evidence.coverage.contextWhy || {})[v] || {};
        _push({ page: 'pCoverage', what: v + ' as a scoring input',
                            why: (w.why || 'estimated for context only')
                               + (w.neverScores && w.neverScores.length
                                  ? ' Barred from: ' + w.neverScores.join(', ') + '.' : '') });
      });
    (doc.evidence.hazards || []).forEach(function (h) {
      

      if (h && h.categorical === true) return;
      if (h && (h.unavailable || (hazIndex(h) === null && hazLevel(h) === null)))
        _push({ page: 'pHazard', what: (h.name || 'a hazard') + ' score',
                            why: h.basis || h.why
                                 || 'no reason was recorded for this refusal' });
    });
    if (doc.evidence.climate && doc.evidence.climate.outOfCoverage)
      _push({ page: 'pClimate', what: 'the climate delta',
                          why: doc.evidence.climate.why });

    doc.refusalScope = { route: doc.type || null,
                         pages: (doc.pages || []).slice(),
                         droppedOffRoute: _routeDropped,
                         rule:'a withholding is listed here only when this route carries the '
                             +'page it is about. Analyses this route does not run are named on '
                             +'the hazard scope page instead, so the two are never confused.' };

    sealDocument(doc);
    return doc;
  }

  

  var HASH_EXCLUDED = ['document_hash', 'document_hash_algorithm', 'document_hash_excludes'];
  function hashPayload(doc) {
    var out = {};
    Object.keys(doc).forEach(function (k) {
      if (HASH_EXCLUDED.indexOf(k) >= 0) return;
      out[k] = doc[k];
    });
    return out;
  }
  function sealDocument(doc) {
    try {
      doc.document_hash_algorithm = 'SHA-256 over the canonical JSON of the COMPLETE frozen '
        + 'document - identity, evidence, refusals, provenance and output class - keys '
        + 'sorted at every depth, taken after the document is finished';
      doc.document_hash_excludes = HASH_EXCLUDED.slice();
      doc.document_hash = 'sha256:' + G.AGN.hash.sha256(G.AGN.hash.canonical(hashPayload(doc)));
    } catch (e) {
      doc.document_hash = null;
      doc.document_hash_algorithm = null;
      doc.identity_incomplete = (doc.identity_incomplete || []).concat(['document_hash']);
    }
    return doc;
  }
  function verifyDocument(doc) {
    if (!doc || typeof doc !== 'object')
      return { ok:false, why:'no document was supplied' };
    if (doc.document_hash == null)
      return { ok:false, why:'this document carries no hash, so nothing can be verified' };
    var got;
    try { got = 'sha256:' + G.AGN.hash.sha256(G.AGN.hash.canonical(hashPayload(doc))); }
    catch (e) { return { ok:false, why:'the document could not be canonicalised: ' + (e && e.message) }; }
    return { ok: got === doc.document_hash, stored: doc.document_hash, recomputed: got,
             why: got === doc.document_hash
                    ? 'the seal matches the document it was taken over'
                    : 'the seal does not match this document: it was either taken over '
                    + 'different content or the document has changed since it was frozen' };
  }

  

  function hasPage(doc, id) { return !!(doc && doc.pages && doc.pages.indexOf(id) >= 0); }
  function refusalsFor(doc, id) {
    return (doc.refusals || []).filter(function (x) { return x.page === id; });
  }

  

  /* v91.17.270: the engine level (0-4) a hazard row carries; the page no longer scores the rows the reports read */
  function hazLevel(x){ return (x && x.categorical !== true && x.level != null && isFinite(Number(x.level))) ? Number(x.level) : null; }
  function hazIndex(x){
    if(!x) return null;
    if(x.categorical === true) return null;
    var v = (x.screeningIndex !== undefined) ? x.screeningIndex : x.score;
    return (v === null || v === undefined || !isFinite(Number(v))) ? null : Number(v);
  }

  function refusalBlock(list) {
    if (!list.length) return '';
    return '<div class="rpt-refusal"><b>Withheld</b><ul>'
      + list.map(function (x) {
          return '<li><b>' + esc(x.what) + '</b> — ' + esc(x.why || 'no reason recorded') + '</li>';
        }).join('')
      + '</ul></div>';
  }

  

  var DRAW = {
    

    

    pSummary: function (doc) {
      var hz = doc.evidence.hazards || [];
      

      var categorical = hz.filter(function (x) { return x.categorical === true; });
      var scored = hz.filter(function (x) {
        return !x.unavailable && hazIndex(x) !== null; });
      

      var _lvd = function (x) { try { return G.AGN.hazardValue.verdictOf(hazIndex(x)); } catch (_) { return null; } };
      var _lrk = function (v) { try { return G.AGN.hazardValue.verdictRank[v] || 0; } catch (_) { return 0; } };
      var _classed = scored.map(function (x) { var v = _lvd(x); return { x:x, v:v, r:_lrk(v) }; });
      var _topRank = _classed.reduce(function (m, c) { return c.r > m ? c.r : m; }, 0);
      var _leaders = _classed.filter(function (c) { return c.r === _topRank && c.r > 0; })
                             .sort(function (a, b) {
                               return String(a.x.name || '').localeCompare(String(b.x.name || '')); });
      var lead = _leaders.length ? _leaders[0].x : (scored[0] || null);
      var leadVerdict = _leaders.length ? _leaders[0].v : null;
      var leadCoEqual = _leaders.length > 1;
      var leadHolders = _leaders.map(function (c) { return c.x.name; });
      

      var BAND_INK = { severe:'#8A1B16', high:'#B3261E', moderate:'#DA750F',
                       low:'#B78A1E', minimal:'#35682B' };
      var band = function (s) {
        var b = null;
        try { b = (window.AGN && AGN.hazards && AGN.hazards.band)
                    ? AGN.hazards.band(s) : null; } catch (_) { b = null; }
        if (!b) return ['#6b7280', null];
        return [BAND_INK[b.key] || '#6b7280', b.label];
      };
      

      

      var _part = (window.AGN && AGN.hazards && typeof AGN.hazards.partition === 'function')
                    ? AGN.hazards.partition(hz)
                    : null;
      var _degraded = false, _degradedWhy = null;
      if (!_part) {
        

        _degraded = true;
        _degradedWhy = 'The canonical hazard classifier (AGN.hazards.partition) '
          + 'was not available when this document was built. Hazards below were '
          + 'classified by the local fallback, which asks the same three questions '
          + 'in the same order but is not the same code, so a classification may '
          + 'differ from the screen.';
        try { console.warn('[AGN] report: AGN.hazards.partition unavailable, ' +
                           'falling back to hazIndex - classification may differ ' +
                           'from the screen'); } catch (_) {}
        _part = { scored:[], categorical:[], unavailable:[] };
        hz.forEach(function (x) {
          if (x.categorical === true) _part.categorical.push(x);
          else if (x.unavailable || hazIndex(x) === null) _part.unavailable.push(x);
          else _part.scored.push(x);
        });
      }
      

      try {
        window.AGN = window.AGN || {};
        AGN.reportIntegrity = { degraded:_degraded, why:_degradedWhy,
                                issuable:!_degraded,
                                at:new Date().toISOString() };
        document.documentElement.setAttribute('data-agn-report-degraded', _degraded ? '1' : '0');
      } catch (_) {}
      var degradedBanner = _degraded
        ? '<div class="rpt-degraded" role="alert" style="border:2px solid #8a2626;'
          + 'background:#fbeaea;color:#5e1d1d;padding:10px 12px;margin:0 0 14px;'
          + 'border-radius:8px;font-weight:800;letter-spacing:.02em">'
          + 'CLASSIFICATION FALLBACK ACTIVE \u2014 DRAFT ONLY, NOT ISSUABLE'
          + '<div style="font-weight:500;margin-top:6px;letter-spacing:0">'
          + _degradedWhy + '</div></div>'
        : '';
      var _scoredHz = _part.scored, _catHz = _part.categorical, _absentHz = _part.unavailable;

      var designBlock = function () {
        if (!_catHz.length) return '';
        return '<h4 style="margin:16px 0 6px;font-size:0.95rem;color:#0C3851">Design-basis context</h4>'
          + '<p class="rpt-note" style="margin:0 0 8px">These are standing classifications, not '
          + 'screening scores. They do not change from day to day and they are not comparable '
          + 'with the 0–100 weather and hydrological screening below.</p>'
          + '<table style="width:100%;border-collapse:collapse">' + _catHz.map(function (x) {
              return '<tr>'
                + '<td style="width:26%;padding:7px 9px;border:1px solid #dcdcdc;font-weight:700;'
                + 'color:#0C3851">' + esc(x.name) + '</td>'
                + '<td style="width:26%;padding:7px 9px;border:1px solid #dcdcdc;font-size:1.05rem;'
                + 'font-weight:700;color:#0C3851">' + esc(x.categoryLabel || x.category || 'category') + '</td>'
                + '<td style="padding:7px 9px;border:1px solid #dcdcdc" class="rpt-note">'
                + esc((x.basis && !/ranks severity WITHIN this hazard/.test(x.basis)) ? x.basis : 'a standing class, not a screening index') + '</td></tr>';
            }).join('') + '</table>';
      };

      var absentBlock = function () {
        if (!_absentHz.length) return '';
        return '<h4 style="margin:16px 0 6px;font-size:0.95rem;color:#0C3851">Evidence not available</h4>'
          + '<p class="rpt-note" style="margin:0 0 8px">These hazards were screened and produced no '
          + 'number. That is a statement about the evidence, not a finding of low risk, and none of '
          + 'them has been given a score, a band or a position in the ranking.</p>'
          + '<table style="width:100%;border-collapse:collapse">' + _absentHz.map(function (x) {
              return '<tr>'
                + '<td style="width:26%;padding:7px 9px;border:1px solid #dcdcdc;font-weight:700;'
                + 'color:#0C3851;vertical-align:top">' + esc(x.name) + '</td>'
                + '<td style="width:22%;padding:7px 9px;border:1px solid #dcdcdc;vertical-align:top;'
                + 'font-weight:700;color:#8a5a10">'
                + esc(x.noDataClassLabel || 'Not scored') + '</td>'
                + '<td style="padding:7px 9px;border:1px solid #dcdcdc;vertical-align:top" class="rpt-note">'
                + esc(x.basis || 'no reason was recorded for this refusal, which is itself a defect '
                     + '— the hazard was screened and produced nothing, and the engine did not '
                     + 'say why') + '</td></tr>';
            }).join('') + '</table>';
      };

      var strip = _scoredHz.map(function (x) {
        if (x.categorical === true) {
          return '<td style="width:16.6%;vertical-align:top;border-top:3px solid #6b7280">'
               + '<div class="rpt-note" style="font-weight:600;color:#0C3851">' + esc(x.name)
               + '</div><div style="font-size:1.05rem;font-weight:700;color:#0C3851">'
               + esc(x.categoryLabel || x.category || 'category') + '</div>'
               + '<div class="rpt-note">a code class, not a screening index \u2014 '
               + 'not ranked against the scored hazards</div></td>';
        }
        var has = !x.unavailable && hazIndex(x) !== null;
        if (!has) {
          return '<td style="width:16.6%;vertical-align:top;border-top:3px solid #cfcfcf">'
               + '<div class="rpt-note" style="font-weight:600;color:#0C3851">' + esc(x.name)
               + '</div><div style="font-size:1.1rem;color:#8b7aa8">—</div>'
               

               + '<div class="rpt-note">not scored — ' + esc(x.basis
                   || 'no reason was recorded for this refusal, which is itself a defect — '
                    + 'the hazard was screened and produced nothing, and the engine did not say why')
               + '</div></td>';
        }
        var b = band(hazIndex(x));
        return '<td style="width:16.6%;vertical-align:top;border-top:3px solid ' + b[0] + '">'
             + '<div class="rpt-note" style="font-weight:600;color:#0C3851">' + esc(x.name)
             + '</div><div style="font-size:1.4rem;font-weight:700;color:' + b[0] + '">'
             + hazIndex(x) + '</div><div class="rpt-note">'
             + esc(b[1] || 'no band — the ladder returned nothing for this score')
             + ' · ' + esc(x.prov || 'state not reported') + '</div></td>';
      }).join('');

      

      var total = hz.length, n = scored.length;
      var scorable = total - categorical.length;
      var retrieved = scored.filter(function (x) { return x.prov === 'retrieved'; }).length;

      

      var routes = doc.evidence.routes || null;
      var bad = routes ? routes.filter(function (r) {
        return r.state && r.state !== 'ok'; }) : [];

      var kpi = function (label, value, sub) {
        return '<td style="vertical-align:top;padding:8px 10px;border:1px solid #dcdcdc">'
             + '<div class="rpt-note" style="text-transform:uppercase;letter-spacing:.04em">'
             + esc(label) + '</div><div style="font-size:1.15rem;font-weight:700;color:#0C3851">'
             + esc(value) + '</div><div class="rpt-note">' + esc(sub) + '</div></td>';
      };
      var oc = doc.outputClass || {}, pv = doc.provenance || {};
      return { drawn: true, degraded:_degraded, html:
        degradedBanner
        + '<p class="rpt-note">The hazards that carry a screening number, on one 0–100 ladder. '
        + 'Standing design classifications and hazards with no evidence follow in their own '
        + 'sections — nothing here is given a position, a length or a colour that its '
        + 'evidence does not support.</p>'
        + (_scoredHz.length
            ? '<table style="table-layout:fixed;width:100%"><tbody><tr>' + strip + '</tr></tbody></table>'
            : '<p class="rpt-note">No hazard on this screen produced a screening number.</p>')
        + designBlock()
        + absentBlock()
        + (function () {
            var v = vizOf();
            if (!v) return '';
            

            

            return v.bars(hz.filter(function (x) { return x.categorical !== true; })
              .map(function (x) {
                return { label:x.name, value:(x.unavailable ? null : hazIndex(x)),
                         why:(x.basis || 'no reason was recorded for this refusal') };
              }), { title:'Hazard screening at this unit, 0-100 \u2014 scored hazards only' });
          })()
        + '<table style="width:100%;margin-top:12px"><tbody><tr>'
        

         
        + ((lead && (leadVerdict === 'Clear' || leadVerdict === 'Low')) ? (function () {  
            

            var _lvI = function (x) { try { var b = (typeof G.agnBandOf === 'function') ? G.agnBandOf(hazIndex(x)) : null; return b ? b.index : -1; } catch (_) { return -1; } };
            var _mxI = _scoredHz.reduce(function (m, x) { var i = _lvI(x); return i > m ? i : m; }, -1);
            var _LW = (G.AGN && G.AGN.hz5 && G.AGN.hz5.words) || ['Normal', 'Low', 'Moderate', 'High', 'Severe'];
            return kpi('Level', (_mxI <= 0) ? ('All ' + _scoredHz.length + ' scored hazards Normal') : ('All ' + _scoredHz.length + ' scored hazards ' + _LW[_mxI] + ' or below'), 'each hazard is placed on the five-level scale from its own index; none needs action today, and no index comparison is made between hazards'); })()
        : kpi(leadCoEqual ? 'Leading hazards (co-equal)' : 'Leading hazard',
              lead ? (leadCoEqual ? leadHolders.join(' + ') : lead.name)
                     + (leadVerdict ? ' · operational class ' + leadVerdict : '')    
                   : 'none scored',
              lead ? ((leadCoEqual
                        

                        ? ((leadHolders && leadHolders.length > 2)
                             ? ('all ' + leadHolders.length + ' hold this operational class; no '
                                + 'index comparison separates them · ')
                             : 'both hold this operational class; no index comparison separates them · ')
                        : '')
                      + (band(hazIndex(lead))[1] || 'no band') + ' · index ' + hazIndex(lead) + ' · '
                      + (lead.prov || 'state not reported'))
                   : 'no hazard carried a level at this unit'))
        

        + kpi('Screened', n + ' of ' + scorable,
              retrieved + ' of those on retrieved inputs'
              + (categorical.length
                   ? ' \u00b7 ' + categorical.length + ' more carry a code class, not a score'
                   : ''))
        + kpi('Document status', (oc.key || 'unclassified'),
              (pv.state || 'unknown') + ' — weakest link over the pages printed')
        + kpi('Feeds that failed', routes ? String(bad.length) : 'not recorded',
              routes ? (bad.length ? 'listed below' : 'every route this document used answered')
                     : 'no route manifest was captured for this document')
        + '</tr></tbody></table>'
        + (bad.length
            

            ? (function () {
                var _clock = function (ts) {
                  if (!ts) return null;
                  try { return new Date(ts).toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
                  catch (_) { return null; }
                };
                var _dead = bad.filter(function (rr) { return rr.state === 'error'; }).length;
                return '<div class="rpt-refusal" style="margin-top:10px"><b>' + bad.length
                  + ' route' + (bad.length === 1 ? '' : 's') + ' failed at least once during '
                  + 'this session.</b> '
                  + (_dead
                       ? (_dead + ' of them never answered at all.')
                       : 'Every one of them also answered successfully, so the failures below are '
                         + 'individual requests, not a feed that was down.')
                  + '<ul>'
                  + bad.slice(0, 12).map(function (rr) {
                      var t = _clock(rr.lastErrorAt);
                       
                      var _rl = String(rr.route || ''); _rl = /127\.0\.0\.1|localhost/.test(_rl) ? 'the local NIGRAAN server' : (/open-?meteo|customer-/i.test(_rl) ? 'the model forecast feed' : _rl);
                      return '<li>' + esc(_rl) + ' — ' + esc(rr.state)
                           + (rr.failedCount != null && rr.okCount != null
                                ? ' · ' + rr.failedCount + ' of '
                                  + (rr.failedCount + rr.okCount) + ' requests failed'
                                : '')
                           + (t ? ' · last at ' + esc(t) : '')
                           + (rr.why ? ': ' + esc(rr.why) : '') + '</li>'; }).join('')
                  + '</ul>'
                  + (n < scorable
                       ? 'Some of the hazards above carry no number. These failures are a '
                         + 'candidate reason; this page does not assert that they are the cause.'
                       : 'Every scorable hazard on this page still carried a number.')
                  + '</div>';
              })()
            : '')
        + refusalBlock(refusalsFor(doc, 'pSummary')) };
    },

    

    pCompleteness: function (doc) {
      var hz = doc.evidence.hazards || [];
      var rows = hz.map(function (x) {
        var inp = x.provInputs || [];
        if (!inp.length) {
          return '<tr><td><b>' + esc(x.name) + '</b></td><td colspan="5">'
               + '<span class="rpt-note">no input provenance was recorded for this hazard</span>'
               + '</td></tr>';
        }
        var c = { retrieved:0, design:0, absent:0 };
        inp.forEach(function (i) { if (c[i.state] !== undefined) c[i.state]++; });
        var tot = inp.length;
        var w = function (k) { return tot ? Math.round(c[k] / tot * 100) : 0; };
        var bar = '<div style="display:flex;height:12px;border:1px solid #dcdcdc">'
          + (c.retrieved ? '<div style="width:' + w('retrieved') + '%;background:#0C3851"></div>' : '')
          + (c.design ? '<div style="width:' + w('design') + '%;background:#4A8C93"></div>' : '')
          + (c.absent ? '<div style="width:' + w('absent') + '%;background:#e6e6e6"></div>' : '')
          + '</div>';
        return '<tr><td><b>' + esc(x.name) + '</b></td>'
          + '<td class="num">' + c.retrieved + '</td><td class="num">' + c.design + '</td>'
          + '<td class="num">' + c.absent + '</td><td class="num">' + tot + '</td>'
          + '<td style="width:34%">' + bar + '<span class="rpt-note">'
          + w('retrieved') + '% retrieved · '
          + esc(inp.map(function (i) { return i.field + ':' + i.state; }).join(', '))
          + '</span></td></tr>';
      }).join('');
      return { drawn: true, html:
        '<p class="rpt-note">One row per hazard, counting the inputs the engine actually reads '
        + 'for it. Dark is retrieved for this unit, teal is a seed or estimated value, grey is '
        + 'an input that is not held at all. The grey is the data programme: it is what '
        + 'connecting a feed would buy, hazard by hazard.</p>'
        + '<table><thead><tr><th>Hazard</th><th class="num">Retrieved</th>'
        + '<th class="num">Seed or estimated</th><th class="num">Absent</th>'
        + '<th class="num">Inputs</th><th>Composition</th></tr></thead><tbody>'
        + (rows || '<tr><td colspan="6">No hazards were recorded.</td></tr>')
        + '</tbody></table>'
        + refusalBlock(refusalsFor(doc, 'pCompleteness')) };
    },

    

    pSolutions: function (doc) {
      var CATALOGUE = {
        'Heat stress': [
          { m:'Work-rest cycling against a measured wet-bulb globe temperature', c:'A',
            t:'immediate', o:'HSE',
            w:'Heat casualties track exertion in humid heat, not air temperature alone',
            f:'An on-site WBGT reading or a station within the same exposure' },
          { m:'Shaded rest points and scheduled rehydration at the work face', c:'B',
            t:'1-3 months', o:'Operations',
            w:'Recovery time is what prevents cumulative strain across a shift',
            f:'The shift pattern and headcount actually on the face' },
          { m:'Reschedule heavy work outside the afternoon window', c:'A', t:'immediate',
            o:'Operations',
            w:'The exposure is concentrated in a few hours and moving work is free',
            f:'The measured diurnal profile at this unit' }
        ],
        Flood: [
          { m:'Clear and inspect the drainage that serves the site', c:'A', t:'immediate',
            o:'Facilities',
            w:'Pluvial flooding at this screen is drainage capacity meeting rainfall intensity',
            f:'A drainage survey and the discharge point' },
          { m:'Raise or bund the equipment that cannot get wet', c:'C', t:'3-9 months',
            o:'Engineering',
            w:'Moves the loss from every event to none, rather than reducing frequency',
            f:'A floor-level survey against a local datum' },
          { m:'Site-level rainfall gauge tied to the operating procedure', c:'B',
            t:'1-3 months', o:'Operations',
            w:'A national screen cannot see a cell over one yard; a gauge can',
            f:'A gauge location agreed with operations' }
        ],
        'Wind and gusts': [
          { m:'Gust-triggered stand-down for lifting and work at height', c:'A',
            t:'immediate', o:'Operations',
            w:'The limit already exists in the equipment manual; the trigger is what is missing',
            f:'The manufacturer in-service gust limit for each machine' },
          { m:'Anemometer at working height on the critical machine', c:'B', t:'1-3 months',
            o:'Engineering',
            w:'A 10 m model wind is not the wind at the jib, and this build cannot measure gust error',
            f:'Machine selection and a mounting point' }
        ],
        Drought: [
          { m:'Metered water balance for the site', c:'B', t:'1-3 months', o:'Facilities',
            w:'Restriction risk is a function of drawdown, which is not screened here',
            f:'Meter installation on the supply' }
        ],
        'Heavy rain': [
          { m:'Intensity-triggered suspension of outdoor work', c:'A', t:'immediate',
            o:'Operations',
            w:'The hazard is short and sharp; a daily total will not catch it',
            f:'A sub-hourly rainfall series at this point' }
        ],
        'Cold stress (UTCI)': [
          { m:'Cold-weather working procedure and PPE issue', c:'A', t:'immediate', o:'HSE',
            w:'Frost injury and reduced dexterity arrive well above freezing in wind',
            f:'The exposure of the work position' }
        ],
        Landslide: [
          { m:'Slope inspection after the rainfall trigger is crossed', c:'A', t:'immediate',
            o:'Engineering',
            w:'The screening trigger is an intensity-duration threshold, not a stability analysis',
            f:'An inspection route and a competent inspector' },
          { m:'Geotechnical assessment of the governing slope', c:'C', t:'3-9 months',
            o:'Engineering',
            w:'A screening trigger cannot size a stabilisation; only a ground model can',
            f:'Borehole or trial pit access' }
        ]
      };
      var hz = doc.evidence.hazards || [];
      

      

      var _mvd = function (x) { try { var l = hazLevel(x); if (l !== null) return G.AGN.engineLevels.classOf(l); return G.AGN.hazardValue.verdictOf(hazIndex(x)); } catch (_) { return null; } };
      var _mrk = function (v) { try { return G.AGN.hazardValue.verdictRank[v] || 0; } catch (_) { return 0; } };
      var admitted = hz.filter(function (x) {
        return !x.unavailable && (hazIndex(x) !== null || hazLevel(x) !== null); })
        .sort(function (a, b) {
          var ra = _mrk(_mvd(a)), rb = _mrk(_mvd(b));
          if (rb !== ra) return rb - ra;
          return String(a.name || '').localeCompare(String(b.name || ''));
        })
        .concat(hz.filter(function (x) { return x.categorical === true; }));

      var out = [], counts = { A:0, B:0, C:0, D:0 }, missing = [];
      admitted.forEach(function (x) {
        var set = CATALOGUE[x.name];
        if (!set) { missing.push(x.name); return; }
        set.forEach(function (m) {
          counts[m.c] = (counts[m.c] || 0) + 1;
          out.push('<tr><td><b>' + esc(m.m) + '</b></td><td>' + esc(x.name) + '</td>'
            + '<td>' + esc(m.c) + '</td><td>' + esc(m.t) + '</td><td>' + esc(m.o) + '</td>'
            + '<td>' + esc(m.w) + '</td><td><b>' + esc(m.f) + '</b></td></tr>');
        });
      });
      var cls = function (k, label, sub) {
        return '<td style="vertical-align:top;padding:8px 10px;border:1px solid #dcdcdc">'
             + '<div class="rpt-note">' + esc(k) + ' · ' + esc(label) + '</div>'
             + '<div style="font-size:1.2rem;font-weight:700;color:#0C3851">' + (counts[k] || 0)
             + '</div><div class="rpt-note">' + esc(sub) + '</div></td>';
      };
      if (!admitted.length) {
        return { drawn: true, html:
          '<div class="rpt-refusal"><b>No measures are listed.</b> No hazard at this unit '
          + 'carried a score, so there is nothing to act on and nothing to recommend. Measures '
          + 'follow admitted hazards; recommending against a refusal would be advice with no '
          + 'finding underneath it.</div>' };
      }
      return { drawn: true, html:
        

        '<p class="rpt-note">Measures for the hazards this document admitted, grouped by '
        + 'hazard and ordered by name. '
        + 'Read the last column first: most class A and B measures exist to produce the '
        + 'measurement that makes a class C or D decision defensible, and buying the expensive '
        + 'thing before the cheap measurement is how a resilience budget is spent on the wrong '
        + 'hazard.</p>'
        + '<table style="width:100%;margin-bottom:10px"><tbody><tr>'
        + cls('A', 'Operational', 'procedure, scheduling, training · no capital')
        + cls('B', 'Low capital', 'instrumentation, minor works, service contracts')
        + cls('C', 'Project', 'engineered works within an existing asset')
        + cls('D', 'Major capital', 'design-basis change, new plant or relocation')
        + '</tr></tbody></table>'
        + '<table><thead><tr><th>Measure</th><th>Hazard</th><th>Cost class</th><th>Lead time</th>'
        + '<th>Owner</th><th>Why it works</th><th>What it needs first</th></tr></thead><tbody>'
        + out.join('') + '</tbody></table>'
        + (missing.length
            ? ('<div class="rpt-refusal"><b>No measure set is held for ' + esc(missing.join(', '))
               + '.</b> These hazards were screened and are listed on the hazard page; this '
               + 'build carries no measure catalogue for them, and inventing one would be '
               + 'advice with nothing behind it.</div>')
            : '')
        + '<div class="rpt-note" style="margin-top:8px"><b>Cost class, not cost.</b> This build '
        + 'holds no quantities, no site conditions and no Pakistani contractor rates, so a '
        + 'money figure here would be invented. The classes are order-of-magnitude bands a '
        + 'planner can sort on. No monetary figure appears in this document.</div>'
        + refusalBlock(refusalsFor(doc, 'pSolutions')) };
    },

    

    pSkill: function (doc) {
      var sk = doc.evidence.skill || null;
      if (!sk || !sk.rows || !sk.rows.length) {
        return { drawn: true, html:
          '<div class="rpt-refusal"><b>No forecast error has been measured for this '
          + 'document.</b> Verification was not run in the session this snapshot was frozen '
          + 'from, so no error is claimed. An unmeasured error is not a small one.</div>' };
      }
      var rows = sk.rows.map(function (r) {
        return '<tr><td><b>' + esc(r.variable) + '</b></td><td class="num">' + esc(r.lead)
          + '</td><td class="num">' + esc(r.n) + '</td>'
          + '<td class="num">' + (r.mae == null ? '—' : Number(r.mae).toFixed(2)) + '</td>'
          + '<td class="num">' + (r.rmse == null ? '—' : Number(r.rmse).toFixed(2)) + '</td>'
          + '<td><span class="rpt-note">' + esc(r.spread || '') + '</span></td></tr>';
      }).join('');
      var un = (sk.unmeasured || []).map(function (u) {
        return '<li><b>' + esc(u.variable) + '</b> — ' + esc(u.why) + '</li>'; }).join('');
      return { drawn: true, html:
        '<p class="rpt-note">' + esc(sk.reference || 'reference not named')
        + '. A reanalysis is not an observation, and the reference shares a modelling centre '
        + 'with the system being scored, so these figures say how wrong a forecast has been — '
        + 'not which provider is better.</p>'
        + (function () {
            var v = vizOf();
            if (!v) return '';
            var byVar = {};
            sk.rows.forEach(function (r) { (byVar[r.variable] = byVar[r.variable] || []).push(r); });
            return Object.keys(byVar).map(function (name) {
              return v.series(byVar[name].sort(function (a, b) { return a.lead - b.lead; })
                .map(function (r) {
                  return { label:'Day ' + r.lead, value:(r.mae == null ? null : r.mae),
                           note:(r.spread || ''), why:'no usable score at this lead' };
                }), { title:'Measured error by lead — ' + name + ' (MAE)',
                      colour:'#DA750F', decimals:2 });
            }).join('');
          })()
        + '<table><thead><tr><th>Variable</th><th class="num">Lead (days)</th>'
        + '<th class="num">Pairs</th><th class="num">MAE</th><th class="num">RMSE</th>'
        + '<th>Spread behind the number</th></tr></thead><tbody>' + rows + '</tbody></table>'
        + (un ? ('<div class="rpt-refusal" style="margin-top:10px"><b>Variables with no measured '
                 + 'error</b><ul>' + un + '</ul>No related variable’s error is substituted '
                 + 'for these.</div>') : '')
        + refusalBlock(refusalsFor(doc, 'pSkill')) };
    },

    pCover: function (doc) {
      var oc = doc.outputClass || {};
      var _subjectRows = function (d) {
        var sj = d.subject || null, ev = (d.evidence && d.evidence.assessment) || null;
        var rows = '';
        if (sj && sj.asset_id) {
          rows += '<tr><td>Subject</td><td><b>' + esc(sj.asset_name || sj.asset_id) + '</b>'
                + (sj.unit ? ' \u00b7 ' + esc(sj.unit) : '')
                + '<br><span class="rpt-note">the client asset this decision is about</span>'
                + '</td></tr>';
        } else {
          rows += '<tr><td>Subject</td><td><b>Location screen \u2014 '
                + esc(d.unit || 'unit not resolved') + '</b>'
                + '<br><span class="rpt-note">no client asset is the subject of this document, '
                + 'so it names none. The screening below is a result for this place; it becomes '
                + 'a case about an asset when one is made active.</span></td></tr>';
        }
        rows += '<tr><td>Unit</td><td>' + esc(d.unit || 'not specified') + '</td></tr>';
        if (ev && ev.atAssetCoordinate)
          rows += '<tr><td>Weather evidence</td><td>hazard classes screened on the tehsil that contains the asset coordinate'
                + (ev.siteLat != null ? ' (' + esc(Number(ev.siteLat).toFixed(4)) + ', ' + esc(Number(ev.siteLon).toFixed(4)) + ')' : '')
                + (ev.siteUnit ? ', in tehsil ' + esc(ev.siteUnit) : '')
                + (ev.guardStation ? '<br><span class="rpt-note">nearest station ' + esc(ev.guardStation)
                   + (ev.guardKm != null ? ' (' + esc(ev.guardKm) + ' km)' : '') + ' is used for verification only, not as the site weather</span>' : '')
                + '</td></tr>';
        else if (ev && ev.evidenceStation)
          rows += '<tr><td>Weather evidence</td><td>forecast model at the ' + esc(ev.evidenceStation) + ' city point (model weather, not a station reading)'
                + (ev.stationKm != null ? ' \u00b7 ' + esc(ev.stationKm) + ' km from the subject' : '')
                + (ev.stationProxy === false
                    ? '<br><span class="rpt-note">' + esc(ev.stationWhy || '') + '</span>' : '')
                + '</td></tr>';
        return rows;
      };
      

      var _when = function (t) {
        try {
          var d = new Date(t);
          var pk = new Date(d.getTime() + (5 * 3600 - d.getTimezoneOffset() * -60) * 0);
          var iso = d.toISOString();
          var fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi',
                      day: '2-digit', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
          return esc(fmt) + ' PKT';    
        } catch (_) { return esc(String(t)); }
      };
      return { drawn: true, html:
        '<h2>' + esc(doc.title) + '</h2>'
        + '<p class="rpt-sub">' + esc(doc.typeLabel) + ' · ' + esc(doc.typeDesc) + '</p>'
        + '<table><tbody>'
        + '<tr><td>Document</td><td>' + esc(doc.id) + '</td></tr>'
        + '<tr><td>Prepared</td><td>' + _when(doc.at) + '</td></tr>'
        

        + _subjectRows(doc)
        + '<tr><td>Purpose</td><td>' + esc(doc.purpose) + '</td></tr>'
        + '<tr><td>Output class</td><td><b>' + esc(oc.label || 'not classified') + '</b><br>'
        + '<span class="rpt-note">' + esc(oc.sub || '') + '</span></td></tr>'
         
        + '<tr><td>Provenance</td><td>' + (function () { var pv = doc.provenance || {}, st = pv.state || 'unknown', why = String(pv.why || '');
            var PLAIN = { absent: 'no evidence record is attached to this document, so its values carry no recorded provenance',
                          retrieved: 'values retrieved from the recorded sources', design: 'values set by design or expert judgement',
                          computed: 'values computed by the platform from recorded inputs', unknown: 'provenance not established' };
            if (/vocabulary word/.test(why) || !why) why = PLAIN[st] || ('stated as ' + st);
            return esc(st) + ' — ' + esc(why); })() + '</td></tr>'
        + '</tbody></table>' };
    },
    pPortfolio: function (doc) {
      var p = doc.evidence.portfolio || {};
      var rows = p.rows || [];
      if (!rows.length) {
        return { drawn: true, html:
          '<div class="rpt-refusal"><b>No screened asset in this portfolio</b><ul><li>'
          + 'this document is about a set of assets and the set is empty. Load or upload a '
          + 'portfolio and screen it before issuing a prioritisation.</li></ul></div>' };
      }
       
      var ordered = rows;
      var body = ordered.map(function (x) {
        var lv = x.level || x.verdict;    
        return '<tr><td><b>' + esc(x.name || 'unnamed asset') + '</b>' + (x.demo ? ' <span class="rpt-na">DEMONSTRATION</span>' : '') + '</td>'
          + '<td>' + esc(x.location || '\u2014') + '</td>'
          + '<td>' + esc(x.hazard || '\u2014') + '</td>'
          + '<td>' + (lv ? '<b>' + esc(lv) + '</b>' : '<span class="rpt-na">not screened</span>') + '</td>'
          + '<td>' + (x.day ? esc(x.day) : '<span class="rpt-na">\u2014</span>') + '</td></tr>';
      }).join('');
      var above = ordered.filter(function (x) { return x.aboveNormal; }).length;
      return { drawn: true, html:
        '<table><thead><tr><th>Asset</th><th>Location</th><th>Leading hazard</th>'
        + '<th>Level</th><th>When (highest day)</th></tr></thead><tbody>'
        + body + '</tbody></table>'
        + '<p class="rpt-note">' + ordered.length + ' screened asset'
        + (ordered.length === 1 ? '' : 's') + ' \u00b7 ' + above
        + ' with a leading hazard above Normal'
        + (p.rejected ? ' \u00b7 ' + p.rejected + ' rejected row' + (p.rejected === 1 ? '' : 's') + ' not shown' : '')
        + (p.sampleRows ? ' (' + p.sampleRows + ' demonstration row' + (p.sampleRows === 1 ? '' : 's') + ' included)' : '')
        + '. ' + esc(p.basis || '') + ' Each level is the hazard engine\u2019s for the tehsil that holds the asset (the map), the highest of the issued days.</p>'
        + refusalBlock(refusalsFor(doc, 'pPortfolio')) };
    },
    pCoverage: function (doc) {
      var c = doc.evidence.coverage;
      var err = c.error && c.error.temperature_2m && c.error.temperature_2m.ok
              ? c.error.temperature_2m : null;
      

      var own = doc.evidence.unitCoverage || null;
      var ownHtml = own && own.rows && own.rows.length
        ? '<h4>This unit</h4><table><thead><tr><th>Input</th><th>State</th></tr></thead><tbody>'
          + own.rows.map(function (x) {
              return '<tr><td>' + esc(x.label) + '</td><td>' + esc(x.state) + '</td></tr>'; }).join('')
          + '</tbody></table>'
        : '<p class="rpt-note">No per-input coverage was recorded for this unit on the run this '
          + 'document was frozen from, so this page cannot state which inputs it received. The '
          + 'national figures below are not a substitute for that.</p>';
      return { drawn: true, html:
        ownHtml
        + '<h4>National provider coverage on this run</h4>'
        + '<p class="rpt-note">These are country-wide figures for the sweep this document was '
        + 'frozen from, across ' + esc((c.live || 0) + (c.filled || 0) + (c.refusedUnits || 0))
        + ' tehsils. They describe the data service, not this unit, and a unit is not covered '
        + 'because the country was.</p>'
        + '<table><tbody>'
        + '<tr><td>Units answered</td><td>' + esc(c.live != null ? c.live : '—') + '</td></tr>'
        + '<tr><td>Units estimated</td><td>' + esc(c.filled != null ? c.filled : '—')
        + (err ? ' <span class="rpt-note">temperature RMSE ' + err.rmse.toFixed(2)
                 + ' °C, measured on this run over ' + err.n + ' hold-outs</span>' : '')
        + '</td></tr>'
        + '<tr><td>Units with neither</td><td>' + esc(c.refusedUnits != null ? c.refusedUnits : '—')
        + '</td></tr>'
        + '</tbody></table>'
        + refusalBlock(refusalsFor(doc, 'pCoverage')) };
    },
    

    pScope: function (doc) {
      var hz = doc.evidence.hazards || [];
      var byName = {};
      

      var _nn = function (x) { return String(x || '').toLowerCase().replace(/\b(and|or|the)\b|[\/&,()\-]/g, ' ').replace(/\s+/g, ' ').trim(); };
      hz.forEach(function (h) { if (h && h.name) { byName[String(h.name).toLowerCase()] = h; byName[_nn(h.name)] = h; } if (h && h.key) byName[String(h.key).toLowerCase()] = h; });

      var CATALOGUE = (function () {
        var out = [];
        try {
          var meta = G.AI_HAZARDS || {};
          

          var VIEW_ONLY = { flood_pluvial:1, flood_riverine:1, ops:1 };
          Object.keys(meta).forEach(function (k) {
            var m = meta[k] || {};
            if (m.eventHazard === false) return;          
            if (k.indexOf('telco_') === 0) return;        
            if (VIEW_ONLY[k]) return;                     
            var label = String(m.label || k)
              .replace(/\s*\u2014\s*governing pathway\s*/i, '')
              .replace(/\s*\([^)]*screening[^)]*\)\s*$/i, '')
              .trim();
            out.push({ key: k, label: label });
          });
        } catch (_) {}
        return out;
      })();

      if (!CATALOGUE.length) {
        return { drawn: false, refused: true,
                 html: '<div class="rpt-refusal"><b>Withheld</b><ul><li><b>the hazard scope '
                     + 'table</b> — the engine\u2019s hazard catalogue could not be read, so this '
                     + 'page will not list a scope it cannot verify.</li></ul></div>' };
      }

      var CLASS_WORD = {
        ineligible: ['Does not occur here', 'the hazard engine holds no such hazard for this tehsil: the mechanism cannot occur here'],
        feed:       ['Input missing', 'the method applies and the data did not arrive'],
        method:     ['Not instrumented here', 'this build holds no method or reference for this unit'],
         
        undefined:  ['Index not defined here', 'the standardised index has no distribution to stand on in this climate']
      };

      

      var _used = Object.create(null);
      var LEGEND = {
        'Not in this document':'this report route does not carry this hazard, so its absence '
                              +'here says nothing about the hazard at this unit',
        'Does not occur here':'no data would change it \u2014 the mechanism cannot occur at this site',
        'Input missing':'the method applies here and the data it needs did not arrive, so it is '
                       +'recoverable',
        'Not instrumented here':'the method exists and this unit is outside it',
        'Index not defined here':'the index has no distribution to stand on in this climate (an arid window with a few millimetres of climatological rain); not a data gap and not an absence of the mechanism'
      };
      var covered = 0, rows = CATALOGUE.map(function (c) {
        var h = byName[c.label.toLowerCase()] || byName[_nn(c.label)] || byName[c.key.toLowerCase()] || null;
        var state, detail;
        if (!h) {
          state = 'Not in this document'; _used[state] = 1;
          detail = 'this report route does not carry this hazard';
        } else if (h.categorical === true) {
          covered++;
          state = 'Class: ' + esc(h.categoryLabel || h.category || 'not resolved');
          detail = 'screened on an ordinal scale, not a 0-100 index';
        } else if (hazLevel(h) !== null) {
          covered++;
          state = esc(G.AGN.level.words[hazLevel(h)]) + ' (hazard engine' + (h.levelDay ? ', ' + esc(h.levelDay) : '') + ')';
          detail = esc(h.prov || 'state not reported');
        } else if (hazIndex(h) !== null) {
          covered++;
          state = String(hazIndex(h)) + '/100';
          detail = esc(h.prov || 'state not reported');
        } else {
          

          var cw = CLASS_WORD[h.noDataClass || 'feed'] || CLASS_WORD.feed;
          state = cw[0]; _used[state] = 1;
          detail = esc(h.basis || cw[1]);
        }
        return '<tr><td>' + esc(c.label) + '</td><td>' + state + '</td><td>' + detail + '</td></tr>';
      }).join('');

      return { drawn: true, html:
        '<p class="rpt-note">Every hazard this platform screens, and this document\u2019s '
        + 'position on each. A hazard missing from a report is not a hazard that is absent \u2014 '
        + 'it is a hazard the report did not cover, and this table is where that distinction is '
        + 'made rather than left to the reader.</p>'
        + '<table><thead><tr><th>Hazard</th><th>This document</th><th>Basis</th></tr></thead>'
        + '<tbody>' + rows + '</tbody></table>'
        + '<p class="rpt-note">' + covered + ' of ' + CATALOGUE.length
        + ' hazard' + (CATALOGUE.length === 1 ? '' : 's') + ' in the platform\u2019s '
        + 'catalogue carr' + (covered === 1 ? 'ies' : 'y') + ' an answer in this document.'
        + (Object.keys(_used).length
            ? ' ' + Object.keys(_used).map(function (k) {
                return '\u201c' + esc(k) + '\u201d ' + (LEGEND[k] || 'is defined by the engine');
              }).join('; ') + '.'
            : '')
        + '</p>' };
    },

    pHazard: function (doc) {
      /* v91.17.283.12 · the hazard page prints the level word of each hazard (the one scale, AGN.level.word), not the 0-100 index */
      var _lw = function (x) { try { return (G.AGN && G.AGN.level && G.AGN.level.word) ? G.AGN.level.word(x) : null; } catch (_) { return null; } };
      var _chart = '';
      var hz = doc.evidence.hazards || [];
      var cats = hz.filter(function (h) { return h && h.categorical === true; });
      var scored = hz.filter(function (h) {
        return h && !h.unavailable && hazIndex(h) !== null; });
      return { drawn: true, html: _chart +
        (scored.length
          ? '<table><thead><tr><th>Hazard</th><th>Level</th><th>Basis</th></tr></thead><tbody>'
            + scored.map(function (h) {
                var _b = [];
                if (h.driver) _b.push(String(h.driver));
                if (h.prov) _b.push(String(h.prov));
                return '<tr><td>' + esc(h.name) + '</td><td>' + esc(_lw(hazIndex(h)) || 'not levelled')
                     + '</td><td>' + esc(_b.length ? _b.join(' \u00b7 ')
                                                   : 'no driver or provenance was recorded')
                     + '</td></tr>'; }).join('')
            + '</tbody></table>'
          : '<p class="rpt-note">No hazard scored on the available inputs.</p>')
        + (cats.length
            ? '<p class="rpt-note" style="margin-top:12px">Screened on an ordinal scale. '
              + 'These carry a class rather than a level, so they are not ranked '
              + 'against the hazards above and are not drawn as bars.</p>'
              + '<table><thead><tr><th>Hazard</th><th>Class</th><th>Scale</th></tr></thead><tbody>'
              + cats.map(function (h) {
                  return '<tr><td>' + esc(h.name) + '</td><td>'
                       + esc(h.categoryLabel || h.category || 'not resolved') + '</td><td>'
                       + esc(h.scaleType || 'ordinal category') + '</td></tr>'; }).join('')
              + '</tbody></table>'
            : '')
        + refusalBlock(refusalsFor(doc, 'pHazard')) };
    },
    pFlood: function (doc) {
      var f = doc.evidence.flood || {};
      var row = function (k, v) { return '<tr><td>' + k + '</td><td>' + v + '</td></tr>'; };
      

      if (f.unavailable) {
        return { drawn: true, refused: true,
                 html: '<p class="rpt-na">' + esc(f.why
                        || 'no flood screening is recorded for this document') + '</p>'
                     + refusalBlock(refusalsFor(doc, 'pFlood')) };
      }
      return { drawn: true, html:
        '<table><tbody>'
        + row('Governing pathway', esc((!(window.AGN&&typeof AGN.operator==='function'&&AGN.operator()) && /pluvial/i.test(String(f.governing||''))) ? 'not shown: flooding from local rain is not shown to clients until it has been tested against recorded flood events' : (f.governing || 'none')))   /* v91.17.283.10: no local-rain pathway in a client document */
        + (!(window.AGN&&typeof AGN.operator==='function'&&AGN.operator()) ? '' : row('Pluvial', f.pluvial == null   /* v91.17.283.10: the local-rain score row is operator-only */
              ? '<span class="rpt-na">not scored — no rainfall input</span>' : esc(Math.round(f.pluvial))))
        + row('Riverine', f.riverine == null
              ? '<span class="rpt-na">not scored — ' + esc(f.riverineUnavailableWhy || 'no discharge')
                + '</span>' : esc(Math.round(f.riverine)))
        + '</tbody></table>' + refusalBlock(refusalsFor(doc, 'pFlood')) };
    },
    pCompound: function (doc) {
      var s = doc.evidence.mc;
      if (!s || s.refused) {
        return { drawn: true, refused: true,
                 html: refusalBlock(refusalsFor(doc, 'pCompound'))
                     || '<p class="rpt-na">The compound pathway was not simulated.</p>' };
      }
      var pct = function (v) { return (100 * v).toFixed(1) + '%'; };
      

      var _qr = s.quantileReportable || {};
      var _qv = function (k, v) {
        return (_qr[k] === false) ? (k.toUpperCase() + ' withheld')
             : (v == null ? k.toUpperCase() + ' \u2014' : k.toUpperCase() + ' ' + v.toFixed(1));
      };
      

      var _sc = s.severityClass || null;
      var sev = s.severityReportable
        ? ('<tr><td>Combined severity</td><td>'
           + (_sc
               ? ('<b>' + esc(_sc.p90 || _sc.p50 || 'unclassed') + '</b> at p90'
                  + (_sc.p50 ? ' \u00b7 ' + esc(_sc.p50) + ' at p50' : '')
                  + '<div class="rpt-note">')
               : '<div class="rpt-note">')
           + [_qv('p50', s.p50), _qv('p90', s.p90), _qv('p95', s.p95)].join(' \u00b7 ')
           + ' \u2014 the governing leg differs from trial to trial, so these are '
           + 'percentiles of whichever hazard was worse in each trial and not of any '
           + 'one hazard\'s index'
           + '</div></td></tr>')
        : '';
      var lift = s.liftReportable && s.lift != null
        ? ('<tr><td>Dependence effect</td><td>' + s.lift.toFixed(2) + '×</td></tr>')
        : '';
      

      var _rowsOut = [];
      var _row = function (label, html) {
        _rowsOut.push('<tr><td>' + esc(label) + '</td><td>' + html + '</td></tr>'); };
      var _absent = function (what) {
        return '<span class="rpt-na" title="' + esc(what)
             + '">\u2014 <span class="rpt-note">not carried by this run</span></span>'; };

      _row('Basis', s.basis ? esc(s.basis) : _absent('the run did not state its basis'));
      _row('Dependence', (s.dependence ? esc(s.dependence) : _absent('no dependence model recorded'))
           + (s.rho != null ? ' · ρ ' + s.rho.toFixed(3) + ' (' + esc(s.rhoSource || 'source unstated') + ')' : ''));
      _row('Marginal exceedance',
           (s.pa != null && s.pb != null) ? (pct(s.pa) + ' and ' + pct(s.pb))
                                         : _absent('the marginal exceedance probabilities are not on this record'));
       
      var _fr = (s.frechet && s.frechet.lo != null && s.frechet.hi != null) ? s.frechet : null;
      _row('Joint exceedance',
           (s.joint != null
             ? (pct(s.joint)
                + ' <span class="rpt-note">'
                + (s.independent != null ? 'independence would give ' + pct(s.independent) : 'independence not computed')
                + '; ' + (_fr ? ('Fréchet bounds ' + pct(_fr.lo) + '–' + pct(_fr.hi))
                              : 'Fréchet bounds not carried by this run, so the joint value is '
                                + 'reported without the interval that would bound it')
                + '</span>')
             : _absent('no joint exceedance on this record')));
      _row('Conditional', s.conditional != null ? pct(s.conditional)
                                                : _absent('no conditional probability on this record'));
      if (sev) _rowsOut.push(sev);
      if (lift) _rowsOut.push(lift);
      _row('Ceiling mass',
           (s.ceilingMass != null && s.N != null)
             ? ((100 * s.ceilingMass).toFixed(1) + '% of ' + Number(s.N).toLocaleString() + ' trials')
             : _absent('the trial count or the ceiling mass is not on this record'));

      return { drawn: true, html:
        '<table><tbody>' + _rowsOut.join('')
        + '</tbody></table>' + refusalBlock(refusalsFor(doc, 'pCompound')) };
    },
    

    pClimate: function (doc) {
      var c = doc.evidence.climate || {};
      if (c.outOfCoverage || !c.models || !c.models.length) {
        return { drawn: true, refused: true,
                 html: refusalBlock(refusalsFor(doc, 'pClimate'))
                     || '<p class="rpt-na">No climate delta was loaded.</p>' };
      }
      return { drawn: true, html:
        '<p class="rpt-note">Change against the ' + esc(c.baseline || '1991-2010') + ' baseline · '
        + esc(c.window || '') + ' \u00b7 ' + c.models.length + ' models \u00b7 downscaled and linearly bias-corrected to land reanalysis (provider default; the long-term change signal is not altered by the linear correction) \u00b7 '
        + 'context only, not applied to hazard or engineering scores.</p>'
        + '<table><tbody><tr><td>Mean delta</td><td>' + esc(c.meanDelta != null ? c.meanDelta.toFixed(2) + ' °C' : '—')
        + '</td></tr><tr><td>Model range</td><td>' + esc(c.range || '—') + '</td></tr></tbody></table>' };
    },
    pEvidence: function (doc) {
      var rows = doc.evidence.evidence || [];
      var evTotal = (doc.evidence.evidenceTotal != null)
                    ? Number(doc.evidence.evidenceTotal) : rows.length;
      

      

      var sc = doc.evidence.evidenceScope || null;
      var head = (evTotal > rows.length)
        ? '<p class="rpt-note">' + evTotal + ' evidence record'
          + (evTotal === 1 ? '' : 's') + ' belong to this document. The first '
          + rows.length + ' are printed here; the remainder are in the session ledger '
          + 'and the data fabric export.</p>'
        : '<p class="rpt-note">' + evTotal + ' evidence record'
          + (evTotal === 1 ? '' : 's') + ' held when this document was frozen.</p>';
      if (sc && sc.offDocument > 0)
        head += '<p class="rpt-note">' + esc(sc.rule) + '</p>';
      var _val = function (e) {
        if (e.value == null) return '<em>no value recorded</em>';
        return esc(e.value) + (e.units ? ' ' + esc(e.units) : '');
      };
      var _ctx = function (e) {
        var bits = [];
        if (e.n != null) bits.push('n ' + esc(e.n));
        if (e.lead != null) bits.push('lead ' + esc(e.lead));
        if (e.elevation != null) bits.push(esc(e.elevation) + ' m');
        return bits.length ? bits.join(' \u00b7 ') : '—';
      };
      return { drawn: true, html: head +
        '<table><thead><tr><th>Quantity</th><th>Value</th><th>Kind</th><th>Source</th>'
        + '<th>Method</th><th>Uncertainty</th><th>Asked at</th><th>Does not claim</th>'
        + '</tr></thead><tbody>'
        + (rows.length ? rows.map(function (e) {
            return '<tr><td>' + esc(e.label) + '</td><td>' + _val(e) + '</td><td>'
                 + esc(e.kind || '—') + '</td><td>' + esc(e.source || '—') + '</td><td>'
                 + esc(e.method || '—') + '</td><td>'
                 + esc(e.uncertainty || '—') + '</td><td>' + _ctx(e) + '</td><td>'
                 + esc((e.refuses || []).join('; ') || '—')
                 + '</td></tr>'; }).join('')
          : '<tr><td colspan="8">No evidence record belonging to this document was held '
            + 'when it was frozen.</td></tr>')
        + '</tbody></table>' };
    },
    pDeviation: function (doc) {
      var d = doc.evidence.deviations || [];
      return { drawn: true, html:
        (d.length ? d.map(function (x) {
            return '<div class="rpt-dev"><b>' + esc(x.id) + ' · ' + esc(x.subject) + '</b>'
                 + '<p><i>Specification:</i> ' + esc(x.spec) + '</p>'
                 + '<p><i>Built:</i> ' + esc(x.built) + '</p>'
                 + '<p><i>Why:</i> ' + esc(x.why) + '</p>'
                 + '<p><i>Effect:</i> ' + esc(typeof x.effect === 'function' ? x.effect() : x.effect) + '</p>'
                 + '<p class="rpt-note">Test: ' + esc(x.test) + '</p></div>'; }).join('')
          : '<p class="rpt-note">No deviations are recorded.</p>') };
    },
    pMethod: function (doc) {
      var p = doc.evidence.parameters || {};
      var rows = (p.rows || []).filter(function (e) { return e.reads > 0; });
      return { drawn: true, html:
        

        (function () {
          var CAP = (doc.type === 'engineering' || doc.type === 'assurance') ? 60 : 0, VLIM = 72;
          var shown = rows.slice(0, CAP);
          var tally = {};
          rows.forEach(function (e) {
            var k = String(e.calibrationStatus || 'unstated');
            tally[k] = (tally[k] || 0) + 1; });
          var order = Object.keys(tally).sort(function (a, b) { return tally[b] - tally[a]; });
          var _cut = function (v) {
            var raw = JSON.stringify(v);
            if (raw == null) return '—';
            return raw.length > VLIM
                 ? esc(raw.slice(0, VLIM)) + '<span class="rpt-note">\u2026 truncated</span>'
                 : esc(raw);
          };
          return '<p class="rpt-note">' + esc(p.consumed || rows.length) + ' of '
            + esc(p.total || rows.length) + ' declared constants were read by a running code '
            + 'path while this document was prepared.</p>'
            + '<p class="rpt-note">Calibration of the constants that ran: '
            + order.map(function (k) { return esc(tally[k]) + ' ' + esc(k); }).join(' \u00b7 ')
            + '. A heuristic is a value chosen to make a curve behave, not one measured '
            + 'against observations; it is disclosed rather than presented as calibration.</p>'
            + (CAP === 0 ? '<p class="rpt-note">The parameter table is printed in the engineering and assurance reports and is carried in full in this document\'s JSON export.</p>' : '')
            + (CAP > 0 && rows.length > CAP
                ? '<p class="rpt-note">' + esc(rows.length) + ' constants were consumed. The '
                  + 'first ' + CAP + ' are printed here; the remaining '
                  + esc(rows.length - CAP) + ' are in the companion parameter export. Long '
                  + 'values are truncated and marked.</p>'
                : '')
            + (CAP === 0 ? '' : '<table><thead><tr><th>Parameter</th><th>Value</th><th>Calibration</th></tr>'
            + '</thead><tbody>'
            + shown.map(function (e) {
                return '<tr><td>' + esc(e.path) + '</td><td>' + _cut(e.value)
                     + '</td><td>' + esc(e.calibrationStatus) + '</td></tr>'; }).join('')
            + '</tbody></table>');
        })() };
    },
    pLimits: function (doc) {
      var all = (doc.refusals || []).slice();
       
      try { var _fm = doc.evidence && doc.evidence.caseFamilies, _f = _fm && _fm[doc.type];
            var _gated = (_f && _f.gated) || (doc.pages || []).indexOf('pCaseGate') >= 0;
            if (_gated) all.push({ page: 'pCaseGate', what: ((_f && _f.title) || doc.typeLabel || 'this report family') + ' — every metric of the family',
              why: ((_f && _f.why) || 'the family is gated in this build') + ((_f && _f.needs && _f.needs.length) ? '. Unlocks with: ' + _f.needs.join('; ') : '') }); } catch (_) {}
      return { drawn: true, html:
        '<p>This document withholds the following. Each is a measured limit, not an omission.</p>'
        + (all.length
            ? '<ul>' + all.map(function (x) {
                return '<li><b>' + esc(x.what) + '</b> (' + esc(PAGES[x.page] ? PAGES[x.page].title : (((G.AGN.reportExtraPages || {})[x.page] || {}).title || (x.page === 'pCaseGate' ? 'Why this family is gated' : x.page)))
                     + ') — ' + esc(x.why || '') + '</li>'; }).join('') + '</ul>'
            : '<p class="rpt-note">Nothing was withheld from this document.</p>')
        + '<p class="rpt-note">A screening score is not a calibrated probability and not an official '
        + 'warning. The national meteorological and disaster-management authorities are the authoritative source for warnings.</p>' };
    }
  };

  

  function render(doc) {
    if (!doc) return { html: '', rendered: [], missing: [], routed: [] };
    var out = [], rendered = [], missing = [], n = 0, _sec = null;
    doc.pages.forEach(function (id) {
       
      var _s = PAGE_SECTION[id]; if (_s && _s !== 'cover' && _s !== _sec && SECTION_TITLE[_s]) { _sec = _s;
        out.push('<div class="rpt-section" style="margin:18px 0 6px;padding:6px 10px;border-left:5px solid #0C3851;background:#eef3f7;font:800 13px/1.3 system-ui,sans-serif;color:#0C3851;letter-spacing:.02em">' + esc(SECTION_TITLE[_s]) + '</div>'); }
      var spec = PAGES[id] || (G.AGN.reportExtraPages || {})[id];
      if (!spec) { missing.push({ id: id, why: 'no such page in the catalogue' }); return; }
      var lack = (spec.needs || []).filter(function (k) { return doc.evidence[k] === undefined; });
      n++;
      var head = '<div class="rpt-head"><div class="rpt-num">Page ' + n + '</div><h3>'
               + esc(spec.title) + '</h3></div>';
      if (lack.length) {
        

        missing.push({ id: id, why: 'the document holds no ' + lack.join(', ') });
        out.push('<section class="rpt-page rpt-page-empty" data-page="' + id + '">' + head
          + '<p class="rpt-na">Not available in this document — it holds no '
          + esc(lack.map(function (x) { return ({ caseDocument: 'case record for the place', casePortfolio: 'case record for the portfolio', localContext: 'local context for the place' })[x] || 'record of this kind'; }).join(', ')) + '. This page is printed empty rather than dropped, so its '
          + 'absence is visible.</p></section>');
        return;
      }
      var r;
      try { r = (DRAW[id] || (G.AGN.reportExtraDraw || {})[id])(doc); }
      catch (e) { missing.push({ id: id, why: 'page threw: ' + e.message });
                  out.push('<section class="rpt-page" data-page="' + id + '">' + head
                    + '<p class="rpt-na">This page could not be produced.</p></section>');
                  return; }
      rendered.push(id);
      out.push('<section class="rpt-page" data-page="' + id + '">' + head + r.html + '</section>');
    });
    

    try {
      var UNLOCK = { pPoint: 'activate an asset with its coordinate (Client Risk → make active) and regenerate', pCompound: 'open a client project and make an asset active: the compound pathway is selected under a decision case',
                     pClimate: 'open a client project and make an asset active; load the climate deltas on Forecast › 2050s', pLimits: 'upload the operating limits with the sites (Client Risk › Add sites)',
                     pGlof: 'regenerate once the local server has answered (a coordinate is needed: the asset\'s, or the tehsil centroid for a location screen)', pCoverage: 'a national run with per-input coverage (LEARN / RUN on the local server)',
                     pEvidence: 'evidence records held under the decision case',
                     pFlood: 'a decision case with a river-discharge check for the reach: activate an asset and regenerate (the flood index itself is scored above)', pCrossings: 'upload the operating limits with the sites (Client Risk › Add sites)' };
      

      var _hasAsset = false; try { var _sj = G.AGN.subject.get(); _hasAsset = !!(_sj && _sj.asset_id); } catch (_) {}
      if (_hasAsset) {
        UNLOCK.pPoint = 'the point run for the active asset had not answered when the document was frozen: regenerate once the local server has answered';
        UNLOCK.pCompound = 'a decision case for the active asset (Client Risk, decision case) selects the compound pathway';
        UNLOCK.pClimate = 'load the climate deltas for the active asset on Forecast › 2050s (CMIP6 at the asset)';
        UNLOCK.pFlood = 'a river-discharge check for the reach under a decision case for the active asset (the flood index itself is scored above)';
      }
      UNLOCK.pRiskCards = UNLOCK.pCaseChain = UNLOCK.pTracker = 'sync the client project to the local server (operator: Client Risk, Casebook, Sync project to server) and regenerate';
      var gaps = [];
      out.forEach(function (sec) {
        var m = sec.match(/data-page="(p[A-Za-z0-9]+)"/); if (!m) return; var id = m[1];
        var body = sec.replace(/<div class="rpt-head">[\s\S]*?<\/div><\/div>/, '').replace(/<p class="rpt-note" data-evkey="1">[\s\S]*?<\/p>/, '');
        var text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        var empty = /class="rpt-na"|<b>Withheld<\/b>|<b>Withheld:<\/b>|Withheld\b/.test(body) && text.length < 700;
        var noneReg = /No operating limits are registered|was not gathered when this document was frozen|No evidence record belonging to this document/.test(body);
        if (empty || noneReg) { var t = ((PAGES[id] || (G.AGN.reportExtraPages || {})[id]) || {}).title || id; gaps.push({ id: id, title: t, unlock: UNLOCK[id] || 'the input this page names' }); }
      });
      if (gaps.length && out.length) {
        var box = '<div class="rpt-refusal" style="margin:10px 0 0;border-left-color:#0C3851"><b>How to complete this document.</b> ' + gaps.length + ' of ' + n + ' pages could not be filled from what was held; each is printed where it belongs and says why. What fills them:<ul>'
          + gaps.map(function (g) { return '<li><b>' + esc(g.title) + '</b> — ' + esc(g.unlock) + '</li>'; }).join('') + '</ul></div>';
        out[0] = out[0].replace(/<\/section>\s*$/, box + '</section>');
      }
    } catch (_) {}
    var _html = out.join('');
     
    try { if (typeof G.AGN.reportPostRender === 'function') _html = G.AGN.reportPostRender(_html, doc) || _html; } catch (_) {}
    return { html: _html, rendered: rendered, missing: missing, routed: doc.pages.slice() };
  }

  

  

  var ARRAY_MAX = 256, DEPTH_MAX = 8;
  function snapshot(doc) {
    var truncated = [];
    function safe(v, d, path) {
      d = d || 0; path = path || '$';
      if (d > DEPTH_MAX) { truncated.push(path + ' (depth)'); return null; }
      if (v == null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
      if (typeof v === 'function') return null;
      if (Array.isArray(v)) {
        if (v.length > ARRAY_MAX) truncated.push(path + ' [' + v.length + ' → ' + ARRAY_MAX + ']');
        return v.slice(0, ARRAY_MAX).map(function (x, i) { return safe(x, d + 1, path + '[' + i + ']'); });
      }
      if (typeof v === 'object') {
        

        var o = {};
        Object.keys(v).forEach(function (k) {
          if (typeof v[k] === 'function') return;
          o[k] = safe(v[k], d + 1, path + '.' + k);
        });
        return o;
      }
      return null;
    }
    var body = safe({
      id: doc.id, at: doc.at, type: doc.type, unit: doc.unit,
      pages: doc.pages, outputClass: doc.outputClass, provenance: doc.provenance,
      refusals: doc.refusals, evidence: doc.evidence
    }, 0, '$');
    body.truncated = truncated;
    body.complete = truncated.length === 0;
    body.note = truncated.length
      ? 'This block is NOT complete: ' + truncated.length + ' structure(s) were bounded, listed above.'
      : 'Every figure in this document can be reconstructed from this block.';
    return body;
  }

   
  function integrity(doc) {
    var checks = [];
    function add(n, ok, d) { checks.push({ name: n, pass: !!ok, detail: d }); }

    var badRoute = Object.keys(ROUTES).filter(function (t) {
      return ROUTES[t].some(function (id) { return !PAGES[id]; }); });
    add('Every routed page exists in the catalogue', badRoute.length === 0, badRoute.join(', ') || 'all routes resolve');

    

    var promises = { pEvidence: 'evidence annex', pDeviation: 'recorded deviations',
                     pMethod: 'method and parameters', pFlood: 'flood pathways',
                     pCompound: 'compound pathway', pClimate: 'climate outlook',
                     pCoverage: 'data coverage', pHazard: 'hazard screening' };
    var mismatched = [];
    Object.keys(TYPES).forEach(function (t) {
      var d = TYPES[t].desc.toLowerCase();
      Object.keys(promises).forEach(function (id) {
        var said = d.indexOf(promises[id]) >= 0, routed = ROUTES[t].indexOf(id) >= 0;
        if (said !== routed) mismatched.push(t + ': description ' + (said ? 'promises' : 'omits')
          + ' "' + promises[id] + '" and the route ' + (routed ? 'carries' : 'omits') + ' it');
      });
    });
    add('Every description matches its own routing', mismatched.length === 0,
        mismatched.slice(0, 3).join(' · ') || Object.keys(TYPES).length + ' types agree');

    add('Every report carries the limits page',
        Object.keys(ROUTES).every(function (t) { return ROUTES[t].indexOf('pLimits') >= 0; }),
        'no report may omit what it does not claim');
    add('Every report carries a cover',
        Object.keys(ROUTES).every(function (t) { return ROUTES[t].indexOf('pCover') >= 0; }));

    if (doc) {
      var r = render(doc);
      add('The document renders the pages it routed',
          r.routed.length === r.rendered.length + r.missing.length,
          r.rendered.length + ' drawn, ' + r.missing.length + ' unavailable, ' + r.routed.length + ' routed');
      var withheld = (doc.refusals || []).map(function (x) { return x.what; });
      add('Every withheld figure appears on the limits page',
          withheld.every(function (w) { return r.html.indexOf(w) >= 0; }),
          withheld.length + ' withheld');
      var snap = snapshot(doc);
      add('The snapshot declares its own bounds', snap.complete === (snap.truncated.length === 0),
          snap.complete ? 'complete' : snap.truncated.length + ' bounded structure(s), named');
    }
    return { checks: checks, pass: checks.every(function (c) { return c.pass; }),
             passed: checks.filter(function (c) { return c.pass; }).length, total: checks.length };
  }

  function selfTest() {
    var out = [];
    function t(n, f) { try { var r = f(); out.push({ name: n, pass: !!r.pass, detail: r.detail }); }
                       catch (e) { out.push({ name: n, pass: false, detail: 'threw: ' + e.message }); } }

    var withheldMc = { refused: false, severityReportable: false,
      severityWithheldWhy: 'Combined severity withheld — 62.7% of trials at the ceiling.',
      liftReportable: false, liftWithheldWhy: 'Dependence effect withheld — the bounds collapse.',
      pa: 0.9, pb: 0.9, joint: 0.85, independent: 0.81, conditional: 0.94, lift: 1.05,
      frechet: { lo: 0.8, hi: 0.9 }, ceilingMass: 0.627, N: 10000,
      p50: 100, p90: 100, p95: 100, basis: 'test', dependence: 'test', rho: 0.2, rhoSource: 'declared' };

    t('RP-01 a withheld severity is never printed', function () {
      var d = freeze({ type: 'technical', unit: 'U', mc: withheldMc, hazards: [], coverage: {},
                       flood: {}, climate: {}, evidence: [], parameters: {}, deviations: [] });
      var h = render(d).html;
      return { pass: h.indexOf('P50 100.0') < 0 && h.indexOf('Combined severity</td>') < 0,
               detail: 'the withheld quantiles do not appear in the document' };
    });
    t('RP-02 and its reason does', function () {
      var d = freeze({ type: 'technical', mc: withheldMc, hazards: [], coverage: {}, flood: {},
                       climate: {}, evidence: [], parameters: {}, deviations: [] });
      var h = render(d).html;
      return { pass: h.indexOf('ceiling') >= 0, detail: 'the withholding reason is printed' };
    });
    t('RP-03 a withheld lift is never printed', function () {
      var d = freeze({ type: 'technical', mc: withheldMc, hazards: [], coverage: {}, flood: {},
                       climate: {}, evidence: [], parameters: {}, deviations: [] });
      var h = render(d).html;
      return { pass: h.indexOf('Dependence effect</td><td>1.05') < 0,
               detail: 'the lift the Fréchet bounds had fixed is not reported' };
    });
    t('RP-04 a reportable severity IS printed', function () {
      var ok = Object.assign({}, withheldMc, { severityReportable: true, liftReportable: true,
        p50: 41.2, p90: 63.5, p95: 71.0 });
      var d = freeze({ type: 'technical', mc: ok, hazards: [], coverage: {}, flood: {},
                       climate: {}, evidence: [], parameters: {}, deviations: [] });
      var h = render(d).html;
      return { pass: h.indexOf('41.2') >= 0, detail: 'the rule withholds, it does not delete' };
    });
    t('RP-05 an unscored hazard is refused, not zeroed', function () {
      var d = freeze({ type: 'brief', hazards: [
        { name: 'Wind', score: null, unavailable: true, basis: 'no wind input — not scored' },
        { name: 'Heat', score: 62, basis: 'scored' }] });
      var h = render(d).html;
      return { pass: h.indexOf('no wind input') >= 0 && h.indexOf('<td>Wind</td><td>0</td>') < 0,
               detail: 'the absent hazard states its reason and prints no number' };
    });
    t('RP-06 a document answers about itself', function () {
      var d = freeze({ type: 'brief', hazards: [{ name: 'Heat', score: 1 }] });
      var before = hasPage(d, 'pEvidence');
      var d2 = freeze({ type: 'assurance', evidence: [] });
      return { pass: before === false && hasPage(d2, 'pEvidence') === true && hasPage(d, 'pEvidence') === false,
               detail: 'freezing a second document does not change the first' };
    });
    t('RP-07 a routed page with no evidence is printed empty, not dropped', function () {
      var d = freeze({ type: 'operations', hazards: [{ name: 'Heat', score: 1 }] });
      var r = render(d);
      return { pass: r.html.indexOf('data-page="pCoverage"') >= 0 && r.missing.length > 0,
               detail: r.missing.length + ' page(s) unavailable and visible as such' };
    });
    t('RP-08 the snapshot keeps every key', function () {
      var big = {}; for (var i = 0; i < 300; i++) big['k' + i] = i;
      var d = freeze({ type: 'brief', hazards: [{ name: 'H', score: 1 }] });
      d.evidence.big = big;
      var s = snapshot(d);
      return { pass: Object.keys(s.evidence.big).length === 300,
               detail: 'objects are not capped — a key cap is how a snapshot loses fields silently' };
    });
    t('RP-09 an unbounded array is bounded AND declared', function () {
      var d = freeze({ type: 'brief', hazards: [{ name: 'H', score: 1 }] });
      d.evidence.vals = new Array(10000).fill(1);
      var s = snapshot(d);
      return { pass: s.evidence.vals.length === ARRAY_MAX && s.truncated.length > 0
                  && s.complete === false && /NOT complete/.test(s.note),
               detail: s.truncated[0] };
    });
    t('RP-10 an untruncated snapshot says it is complete', function () {
      var d = freeze({ type: 'brief', hazards: [{ name: 'H', score: 1 }] });
      var s = snapshot(d);
      return { pass: s.complete === true && s.truncated.length === 0,
               detail: s.note };
    });
    t('RP-11 a scenario document is never a forecast', function () {
      var d = freeze({ type: 'brief', scenario: true, provState: 'retrieved',
                       hazards: [{ name: 'H', score: 1 }] });
      return { pass: d.outputClass && d.outputClass.key === 'scenario',
               detail: (d.outputClass || {}).label };
    });
    t('RP-12 every withheld figure reaches the limits page', function () {
      var d = freeze({ type: 'technical', mc: withheldMc, hazards: [
        { name: 'Wind', score: null, unavailable: true, basis: 'no wind input' }],
        coverage: {}, flood: {}, climate: {}, evidence: [], parameters: {}, deviations: [] });
      var h = render(d).html;
      var limits = h.slice(h.indexOf('data-page="pLimits"'));
      return { pass: limits.indexOf('Wind score') >= 0 && limits.indexOf('combined severity') >= 0,
               detail: d.refusals.length + ' refusals, all on the limits page' };
    });
    t('RP-13 architecture integrity', function () {
      var i = integrity(null);
      return { pass: i.pass, detail: i.passed + '/' + i.total + ' · '
                   + i.checks.filter(function (c) { return !c.pass; }).map(function (c) { return c.name; }).join('; ') };
    });

    var passed = out.filter(function (x) { return x.pass; }).length;
    return { checks: out, passed: passed, total: out.length, ok: passed === out.length };
  }

  G.AGN.report = {
    PAGES: PAGES, PAGE_IDS: PAGE_IDS, TYPES: TYPES, ROUTES: ROUTES,
    freeze: freeze, render: render, snapshot: snapshot, hasPage: hasPage,
    refusalsFor: refusalsFor, integrity: integrity, selfTest: selfTest,
    

    seal: sealDocument, verify: verifyDocument, hashPayload: hashPayload,
    ARRAY_MAX: ARRAY_MAX, version: 'v91.12'
  };
})(window);
