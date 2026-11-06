


(function(G){'use strict';var AGN=G.AGN=G.AGN||{};
  function pstate(){try{return AGN.project&&AGN.project.state?AGN.project.state():null}catch(_){return null}}
  function ctx(){try{return AGN.context&&AGN.context.read?AGN.context.read():{}}catch(_){return {}}}
  function evidenceId(){return 'ev-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)}
  function recordEvidence(f){
    var p=pstate(); if(!p) return null;
    var a=null; try{ a=AGN.project.activeAsset&&AGN.project.activeAsset(); }catch(_){}
    if(!a) return null;
    var c=ctx(), dc=AGN.decisionCase||{}, t=null; try{ t=AGN.timeSelection&&AGN.timeSelection.state?AGN.timeSelection.state():null; }catch(_){}
    var rec={ evidence_id:evidenceId(), decision_case_id:dc.id?dc.id():null, project_id:dc.projectId?dc.projectId():null,
      client_name:(p.company&&p.company.client_name)||null, asset_id:a.asset_id||null, asset_name:a.name||null,
      hazard:c.hazard||null, hazard_id:(AGN.hazardRegistry&&AGN.hazardRegistry.resolve)?AGN.hazardRegistry.resolve(c.hazard):null,
      horizon:dc.signature?(dc.signature()||{}).horizon_id:null, horizon_label:c.time||null, lead_hours:t&&t.leadHours!=null?t.leadHours:null,
      operation:'client_geometry_import', feature_count:f.length, features:f,
      provenance:'client geometry imported for the active asset; no score was written back', source:'Assets / client geometry import',
      created_at:new Date().toISOString() };
    p.spatial_evidence=Array.isArray(p.spatial_evidence)?p.spatial_evidence:[];
    AGN.decisionCase.write('spatial_evidence', rec);
    return rec;
  }
  function evidenceFor(assetId){ var p=pstate(); if(!p||!Array.isArray(p.spatial_evidence)) return [];
    return p.spatial_evidence.filter(function(e){ return !assetId||String(e.asset_id||'')===String(assetId); }); }
  AGN.spatialLab={ recordEvidence:recordEvidence, evidenceFor:evidenceFor };
})(window);
