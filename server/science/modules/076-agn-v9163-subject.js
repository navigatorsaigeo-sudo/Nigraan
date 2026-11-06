
(function(G){
'use strict';
var AGN = G.AGN = G.AGN || {};




var UNIT_ORDER = [
  { key:'active_asset',       why:'the active client asset is the subject of the decision case' },
  { key:'explored_location',  why:'no client asset is active, so the subject is the location the operator selected' },
  { key:'assessment_station', why:'no client asset and no explored location, so the subject is the last screened station' }
];

function _project(){
  try{ return (AGN.project && AGN.project.state) ? AGN.project.state() : null; }catch(_){ return null; }
}
function _activeAsset(){
  try{
    var p=_project(); if(!p || !p.company || !p.company.active_asset_id) return null;
    var id=String(p.company.active_asset_id);
    return (p.assets||[]).filter(function(a){ return String(a.asset_id||'')===id; })[0] || null;
  }catch(_){ return null; }
}
function _explored(){
  try{ return (AGN.flow && AGN.flow.location) ? AGN.flow.location() : null; }catch(_){ return null; }
}
function _assessmentStation(){
  try{
    var st = (AGN.sectionState && AGN.sectionState.state)
               ? (AGN.sectionState.state('assessments',{})||{}) : {};
    var a = st.assessment || (G.state && G.state.assessment) || null;
    return (a && a.station) ? a.station : null;
  }catch(_){ return null; }
}
 
function _resolveUnit(name, lat, lon){
  try{
    if(!name) return null;
    if(AGN.geo && AGN.geo.resolve){
      var r = AGN.geo.resolve(name, (lat!=null&&lon!=null)?{lat:lat,lon:lon}:undefined);
      if(r && r.resolved && r.key) return r.key;
      return null;
    }
    return name;
  }catch(_){ return null; }
}

function resolve(){
  var asset=_activeAsset(), exp=_explored(), stn=_assessmentStation();
  var cands=[
    { key:'active_asset',
      

      siteUnit:(function(){ try{
        if(!asset || asset.latitude==null || asset.longitude==null || !AGN.siteUnit) return null;
        var su=AGN.siteUnit(asset.latitude, asset.longitude);
        return (su && su.scored) ? su.key : null; }catch(_){ return null; } })(),
      name:(asset && (asset.location||asset.name))||null,
      lat:(asset&&asset.latitude!=null)?asset.latitude:null,
      lon:(asset&&asset.longitude!=null)?asset.longitude:null },
    { key:'explored_location',  name:(exp&&exp.name)||null, lat:(exp&&exp.lat), lon:(exp&&exp.lon) },
    { key:'assessment_station', name:(stn&&stn.name)||null, lat:(stn&&stn.lat), lon:(stn&&stn.lon) }
  ];
  

  var unit=null, basis=null, why=null, declaredName=null, ownerKey=null, ownerFailed=false;
  for(var i=0;i<cands.length;i++){
    var c=cands[i];
    if(!c.name) continue;
     
    ownerKey = c.key; declaredName = c.name;
    var u=c.siteUnit ? c.siteUnit : _resolveUnit(c.name,c.lat,c.lon);
    if(u){ unit=u; basis=c.key;
           why=UNIT_ORDER.filter(function(x){return x.key===c.key;})[0].why; }
    else { ownerFailed = true; basis=null; }
    break;
  }
  

  if(ownerFailed){
    var _label={ active_asset:'the active client asset',
                 explored_location:'the location the operator selected',
                 assessment_station:'the last screened station' }[ownerKey] || 'the subject';
    why = 'the subject is '+_label+', and the build holds no unit for the name it '
        + 'carries ('+String(declaredName)+') - the next candidate\u2019s unit is NOT '
        + 'substituted, because a document naming one place and scored at another '
        + 'is the defect this order exists to prevent';
  }
  var unresolvedName = (!unit && declaredName) ? declaredName : null;

  var sig=null;
  try{ sig=(AGN.decisionCase && AGN.decisionCase.signature) ? AGN.decisionCase.signature() : null; }catch(_){}
  var caseId=null;
  try{ caseId=(AGN.decisionCase && AGN.decisionCase.id) ? AGN.decisionCase.id() : null; }catch(_){}
  var h=null;
  try{ h=(AGN.timeContext && AGN.timeContext.get) ? AGN.timeContext.get() : null; }catch(_){}

  var missing=[];
  if(!sig || !sig.project_id) missing.push('project');
  if(!asset) missing.push('active asset');
  if(!unit) missing.push('resolved unit');
  

  if(asset && unit && basis !== 'active_asset')
    missing.push('a unit that belongs to the active asset (the unit shown came '
               + 'from ' + String(basis) + ')');
  if(asset && !unit)
    missing.push('a unit for the active asset\u2019s location');
  if(!sig || !sig.hazard_id) missing.push('hazard');
  if(!h || !h.id) missing.push('horizon');
  if(!caseId) missing.push('decision case id');

  return Object.freeze({
    project_id:(sig&&sig.project_id)||null,
    client_name:(sig&&sig.client_name)||null,
    asset_id:(asset&&asset.asset_id)||null,
    asset_name:(asset&&asset.name)||null,
    

    asset_lat:(asset&&asset.latitude!=null)?Number(asset.latitude):null,
    asset_lon:(asset&&asset.longitude!=null)?Number(asset.longitude):null,
    asset_location:(asset&&(asset.location||asset.name))||null,
    unit:unit,
    unitBasis:basis,
    unitWhy:why,
    unitUnresolvedName:unresolvedName,
    unitOrder:UNIT_ORDER.map(function(x){return x.key;}),
    hazard_id:(sig&&sig.hazard_id)||null,
    hazard_label:(sig&&sig.hazard_label)||null,
    horizon_id:(h&&h.id)||((sig&&sig.horizon_id)||null),
    horizon_label:(h&&h.label)||null,
    lead_hours:(sig&&sig.lead_hours!=null)?sig.lead_hours:null,
    scenario_id:(sig&&sig.scenario_id)||null,
    case_id:caseId,
    complete:missing.length===0,
    missing:missing,
    basis:'derived from the project active asset, the explored location and the '
         +'assessment station in that order; never assigned by a section',
    contract:'every section either FOLLOWS this subject, COMPARES against it, or '
            +'is NATIONAL context. AGN.subject.modeOf(view) says which.'
  });
}



var MODE = {
  overview:     'national',
  livedata:     'compares',
  operations:   'national',
  assessments:  'follows',
  hybridlab:    'follows',
  report:       'follows',
  airisk:       'compares',
  modelab:      'compares'
};
var MODE_WHY = {
  national:'this workspace is about Pakistan as a whole and does not take the '
          +'decision subject as its unit',
  follows: 'this workspace evaluates the decision subject and must not read a '
          +'different asset, unit or horizon',
  compares:'this workspace reads a location or model independently and states '
          +'its relationship to the decision subject rather than replacing it'
};



var _CONSUMED = Object.create(null);
function _note(view){
  var v = String(view || (function(){
    try{ var a=document.querySelector('.view.active[data-view]'); return a?a.dataset.view:''; }
    catch(_){ return ''; } })() || 'unknown');
  _CONSUMED[v] = (_CONSUMED[v] || 0) + 1;
  return v;
}
function require_(view){
  var v = _note(view);
  var s = resolve();
  if(!s || !s.complete){
    var miss = (s && s.missing && s.missing.length) ? s.missing.join(', ') : 'a decision subject';
    var err = new Error('this workspace follows the decision subject and it is not complete: '
                        + miss);
    err.agnSubjectRefusal = true; err.view = v; err.subject = s || null; err.missing = miss;
    throw err;
  }
  return s;
}



function demand(view){
  var v = _note(view);
  var s = null;
  try{ s = resolve(); }catch(_){}
  if(!s) return { ok:false, subject:null, view:v, missing:['a decision subject'],
                  why:'the decision subject could not be resolved' };
  if(!s.complete) return { ok:false, subject:s, view:v, missing:s.missing.slice(),
                           why:'this workspace follows the decision subject and it is not '
                              +'complete: ' + s.missing.join(', ') };
  return { ok:true, subject:s, view:v, missing:[], why:null };
}

AGN.subject = {
  get: resolve,
  require: require_,
  demand: demand,
  consumption: function(){ var o={}; Object.keys(_CONSUMED).forEach(function(k){o[k]=_CONSUMED[k];}); return o; },
  consumedBy: function(view){ return _CONSUMED[String(view||'')] || 0; },
  

  viewOf: function(id){
    var v = String(id||'').replace(/^agn-(?:panel|tab)-/, '');
    return MODE[v] ? v : null;
  },
  modeOf: function(view){
    var v = String(view||'');
    if (MODE[v]) return MODE[v];
    var stripped = v.replace(/^agn-(?:panel|tab)-/, '');
    return MODE[stripped] || 'undeclared';
  },
  

  audit: function(){
    var rows = Object.keys(MODE).map(function(v){
      var n = _CONSUMED[v] || 0, m = MODE[v];
      return { view:v, mode:m, consumed:n,
               bound: (m !== 'follows') ? null : (n > 0),
               verdict: (m !== 'follows') ? ('declares ' + m + ', so it is not required to read the subject')
                      : (n > 0 ? 'follows the subject and has read it ' + n + ' time' + (n===1?'':'s')
                               : 'declares that it follows the subject and has never read it') };
    });
    var follows = rows.filter(function(r){ return r.mode === 'follows'; });
    var unbound = follows.filter(function(r){ return !r.bound; });
    return { rows:rows, follows:follows.length, unbound:unbound.map(function(r){ return r.view; }),
             kept: unbound.length === 0,
             note:'A view that has never been opened has had no occasion to read the '
                 +'subject, so a zero here is only a defect once that workspace has been '
                 +'used. The harness opens every panel before it reads this.' };
  },
  modeWhy: function(view){ return MODE_WHY[this.modeOf(view)] || 'this workspace has not declared its relationship to the decision subject'; },
  modes: function(){ var o={}; Object.keys(MODE).forEach(function(k){o[k]=MODE[k];}); return o; },
  unitOrder: UNIT_ORDER.map(function(x){ return { key:x.key, why:x.why }; }),
  version:'v91.16.4'
};
try{ Object.freeze(AGN.subject); }catch(_){}
})(window);
