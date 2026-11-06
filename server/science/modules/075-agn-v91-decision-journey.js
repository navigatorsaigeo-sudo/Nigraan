(function(G){
'use strict';
var D=G.document,AGN=G.AGN=G.AGN||{};
var FLOW=[
{v:'overview',n:'01',t:'Overview',q:'What is the situation now?',next:'What is coming?'},
{v:'livedata',n:'02',t:'Forecast & Outlook',q:'What is coming?',next:'Which of my sites are exposed?'},
{v:'assessments',n:'03',t:'Assets & Exposure',q:'Which of my sites are exposed?',next:'What needs doing, and by whom?'},
{v:'operations',n:'04',t:'Operations',q:'What needs doing, and by whom?',next:'What if it gets worse?'},
{v:'hybridlab',n:'05',t:'Scenario & Stress',q:'What if it gets worse?',next:'What does all the evidence mean?'},
{v:'airisk',n:'06',t:'AI Decision Intelligence',q:'What does all the evidence mean?',next:'What do we hand over?'},
{v:'report',n:'07',t:'Reports',q:'What do we hand over?',next:'Why should we trust this?'},
{v:'modelab',n:'08',t:'Evidence & Methods',q:'Why should we trust this?',next:'Journey complete.'}
];
function $(id){return D.getElementById(id)}
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function project(){try{return AGN.project&&AGN.project.state?AGN.project.state():null}catch(_){return null}}
function activeAsset(){try{if(AGN.project&&AGN.project.activeAsset)return AGN.project.activeAsset()}catch(_){}var p=project(),id=p&&p.company&&p.company.active_asset_id;return p&&p.assets?(p.assets.find(function(a){return String(a.asset_id||'')===String(id||'')})||null):null}
function context(){var c={};try{c=AGN.context&&AGN.context.read?AGN.context.read():{}}catch(_){}var p=project(),a=activeAsset(),ts={};try{ts=AGN.timeSelection&&AGN.timeSelection.state?AGN.timeSelection.state():{}}catch(_){}return{client:(p&&p.company&&p.company.client_name)||c.client||'',asset:a,location:(a&&a.location)||c.location||'',hazard:c.hazard||'', hazard_id:(c.hazard_id!=null?c.hazard_id:null),horizon:ts.horizon||c.time||'',leadHours:ts.leadHours,data:c.data||'',section:c.section||''}}
function go(v){var b=D.querySelector('#machNav button[data-goto="'+v+'"]');if(b){b.click();return true} var a=D.getElementById('agnV91HiddenModelRoute');if(a&&a.getAttribute('data-goto')===v){a.click();return true}return false}
function buildStory(){
var nav=$('machNav');if(!nav||$('agnV91FlowBar'))return;
var bar=D.createElement('div');bar.id='agnV91FlowBar';bar.className='agn-v91-flowbar';var tr=D.createElement('div');tr.className='track';
FLOW.forEach(function(s){var b=D.createElement('button');b.type='button';b.className='agn-v91-flowstep';b.dataset.flow=s.v;b.innerHTML='<strong>'+s.n+'</strong>'+esc(s.t);b.onclick=function(){go(s.v)};tr.appendChild(b)});
var tech=D.createElement('button');tech.type='button';tech.className='agn-v91-tech agn-op-only';tech.textContent='Evidence & Methods';tech.onclick=function(){go('modelab')};bar.appendChild(tr);bar.appendChild(tech);


bar.classList.add('agn-v91-flowbar-collapsed');


nav.parentNode.insertBefore(bar,nav.nextSibling);
try{ nav.classList.add('agn-nav-has-tech'); nav.appendChild(tech); bar.classList.add('agn-v91-flowbar-empty'); }catch(_){}
FLOW.forEach(function(s,i){var v=D.querySelector('.view[data-view="'+s.v+'"]');if(!v)return;var h=D.createElement('div');h.className='agn-v91-story-head';

h.innerHTML='<div class="agn-v91-head-line"><span class="n">'+s.n+'</span><b>'+esc(s.t)+'</b><span class="q">'+esc(s.q)+'</span></div>';v.insertBefore(h,v.firstChild)});
}
function paintStory(active){var c=context(),ai=FLOW.findIndex(function(x){return x.v===active});D.querySelectorAll('.agn-v91-flowstep').forEach(function(b){var i=FLOW.findIndex(function(x){return x.v===b.dataset.flow});b.classList.toggle('active',b.dataset.flow===active);b.classList.toggle('done',ai>=0&&i<ai)});
  

  D.querySelectorAll('#machNav [data-goto]').forEach(function(b){
    var i=FLOW.findIndex(function(x){return x.v===b.getAttribute('data-goto')});
    b.classList.remove('agn-step-done','agn-step-now','agn-step-next');
    if(i<0) return;
    if(b.getAttribute('data-goto')===active) b.classList.add('agn-step-now');
    else if(ai>=0 && i<ai) b.classList.add('agn-step-done');
    else b.classList.add('agn-step-next');
  });D.querySelectorAll('[data-v91-context]').forEach(function(el){el.innerHTML='<b>'+esc(c.client||'No client project')+'</b><br>'+esc(c.asset?(c.asset.name||c.asset.asset_id):'No active asset')+' · '+esc(c.hazard||'hazard unresolved')+' · '+esc(c.horizon||'time unresolved')+(c.leadHours!=null?' · +'+esc(c.leadHours)+' h':'')})}
function tabs(){
['meteoParams','aiWorkspaceTabs','asmtTabs','opsxHorizon','cfeHazardTabs'].forEach(function(id){var g=$(id);if(!g)return;var all=[].slice.call(g.querySelectorAll('button')).filter(function(b){return!b.classList.contains('tab-info-btn')});


all.forEach(function(b){ if(b.getAttribute('aria-disabled')==='true'){
  b.setAttribute('role','tab'); b.setAttribute('aria-selected','false'); b.tabIndex=-1; } });
var bs=all.filter(function(b){return b.getAttribute('aria-disabled')!=='true'});if(!bs.length)return;bs.forEach(function(b){b.setAttribute('role','tab');if(!b.hasAttribute('aria-selected'))b.setAttribute('aria-selected',b.classList.contains('active')?'true':'false')});function sync(){var a=bs.find(function(b){return b.classList.contains('active')||b.getAttribute('aria-selected')==='true'||b.getAttribute('aria-pressed')==='true'})||bs[0];bs.forEach(function(b){b.tabIndex=b===a?0:-1})}g.addEventListener('click',function(){setTimeout(sync,0)});g.addEventListener('keydown',function(e){var i=bs.indexOf(D.activeElement),j=null;if(i<0)return;if(e.key==='ArrowRight'||e.key==='ArrowDown')j=(i+1)%bs.length;if(e.key==='ArrowLeft'||e.key==='ArrowUp')j=(i-1+bs.length)%bs.length;if(e.key==='Home')j=0;if(e.key==='End')j=bs.length-1;if(j!=null){e.preventDefault();bs[j].focus();bs[j].click();setTimeout(sync,0)}});sync()});
var at=$('asmtTabs');if(at&&!$('agnV91AsmtHelp')){var map={};[].slice.call(at.querySelectorAll('button[data-asmt]')).forEach(function(t){var x=t.nextElementSibling;if(x&&x.classList.contains('tab-info-btn')&&x.dataset.helpKey)map[t.dataset.asmt]=x.dataset.helpKey});[].slice.call(at.querySelectorAll('.tab-info-btn')).forEach(function(x){x.remove()});var h=D.createElement('button');h.id='agnV91AsmtHelp';h.type='button';h.className='agn-v91-asmt-help';h.textContent='? Help';


h.setAttribute('data-agn-help','asmtTabs');
var _hsync=function(){var a=at.querySelector('button[data-asmt][aria-selected="true"],button[data-asmt].active')||at.querySelector('button[data-asmt]');
  if(!a)return; var nm=(a.textContent||'').trim();
  h.setAttribute('data-help-key', map[a.dataset.asmt]||'');
  h.setAttribute('aria-label','How '+nm+' works'); h.title='How '+nm+' works';};
_hsync(); at.addEventListener('click',function(){_hsync();setTimeout(_hsync,0);});
at.addEventListener('keydown',function(){_hsync();setTimeout(_hsync,0);});
h.onclick=function(){var a=at.querySelector('button[data-asmt].active,button[data-asmt][aria-selected="true"]')||at.querySelector('button[data-asmt]'),k=a&&map[a.dataset.asmt];if(k&&typeof G.openHelp==='function')G.openHelp(k)};at.parentNode.insertBefore(h,at.nextSibling)}
}
function cmip(){
var v=D.querySelector('.view[data-view="livedata"]');if(!v||$('agnV91CmipCard'))return;var c=D.createElement('section');c.id='agnV91CmipCard';c.className='agn-v91-climate-card';c.innerHTML='<div class="agn-v91-kicker">Long-term climate · CMIP6</div><h3>2030s and 2050s climate stress</h3><p class="agn-v91-climate-note">How the climate here shifts by the 2030s and 2050s against 1991–2010, from seven climate models on one high-emission pathway. A projection for planning, not a forecast and not a design value.</p><p class="agn-v91-climate-note agn-op-only">Method: seven CMIP6 HighResMIP models read at the location; the provider downscales them and applies its default linear bias correction to land reanalysis (<code>disable_bias_correction</code> left at default), so the long-term change signal is the models’ own.</p><div class="agn-v91-climate-grid"><div class="agn-v91-climate-controls"><label>Planning horizon<select class="asmt-select" id="agnV91CmipH"><option value="2030">2030s</option><option selected value="2050">2050s</option></select></label><button class="asmt-btn primary" id="agnV91CmipLoad" type="button">Load CMIP6 deltas</button><div class="agn-v91-climate-note" id="agnV91CmipStatus">Not loaded.</div></div><div><table class="agn-v91-table"><thead><tr><th>Variable</th><th>Baseline</th><th>Horizon mean</th><th>Delta</th><th>Model spread</th></tr></thead><tbody id="agnV91CmipRows"><tr><td colspan="5">Not loaded. Seven models are queried on demand — a few seconds.</td></tr></tbody></table></div></div><div class="agn-v91-climate-spread" hidden><div class="agn-v91-kicker">Model spread behind the change <span id="agnCmipSpreadStamp"></span></div><div id="agnCmipSpreadBody"></div></div>';v.appendChild(c);$('agnV91CmipLoad').onclick=function(){var h=$('agnV91CmipH').value,e=$('asmtEngHorizon'),vis=$('agnV91CmipLoad'),st=$('agnV91CmipStatus');if(e){e.value=h;e.dispatchEvent(new Event('change',{bubbles:true}))}try{if(AGN.timeSelection)AGN.timeSelection.set(h==='2030'?'y2030':'y2050',null,'forecast-cmip6')}catch(_){}if(!(AGN.cmip6&&AGN.cmip6.run)){st.textContent='CMIP6 engine is unavailable in this build.';return}if(vis.getAttribute('aria-busy')==='true')return;vis.setAttribute('aria-busy','true');vis.textContent='Loading seven models…';var over=false,end=function(){vis.removeAttribute('aria-busy');vis.textContent='Load CMIP6 deltas'},tm=setTimeout(function(){over=true;AGN.cmip6.cancel();end();st.textContent='CMIP6 request exceeded 90 seconds. The current run is not published; retry after the provider recovers.'},90000);AGN.cmip6.run({status:st,rows:$('agnV91CmipRows'),horizon:h}).then(function(){if(over)return;clearTimeout(tm);end()},function(){if(over)return;clearTimeout(tm);end()})}}
function _caseHas(store){
  try{
    if(!(window.AGN && AGN.decisionCase && AGN.decisionCase.evidence)) return false;
    return AGN.decisionCase.evidence(store,{completeEnvelope:true}).length > 0;
  }catch(e){
    

    try{ if(window.AGN && AGN.diagnostics) console.warn('[AGN diag] readiness.'+store, e&&e.message); }catch(_){}
    return false;
  }
}
function scenarioReady(){ return _caseHas('scenario'); }


function aiReadyDetail(){
  var rec=null;
  try{ rec=(AGN.decisionCase&&AGN.decisionCase.latest)
             ? AGN.decisionCase.latest('ai_decisions',{completeEnvelope:true}) : null; }catch(_){ rec=null; }
  if(!rec){
    try{ rec=(AGN.decisionCase&&AGN.decisionCase.latest)
               ? AGN.decisionCase.latest('ai_decisions') : null; }catch(_){ rec=null; }
    if(rec) return {ready:false, state:'incomplete-envelope', record:rec,
      why:'an AI record exists for this case but its governance envelope is incomplete, so '
         +'it cannot be cited. Re-run it with the client project, asset, hazard and horizon '
         +'selected.'};
    return {ready:false, state:'absent',
      why:'no AI decision record exists for this case yet.'};
  }
  var gaps=[];
  if(rec.error!=null && rec.error!=='') gaps.push('the generation failed: '+String(rec.error).slice(0,140));
  var ans=(rec.structured_conclusion && rec.structured_conclusion.answer!=null)
            ? rec.structured_conclusion.answer
            : (rec.answer!=null?rec.answer:(rec.decision!=null?rec.decision:rec.output));
  if(ans==null || String(ans).trim()==='') gaps.push('the record carries no answer');
  if(rec.generated_at==null) gaps.push('no generation time is recorded');
  if(rec.evidence_id==null) gaps.push('the record has no evidence id, so it cannot be cited');
  if(!Array.isArray(rec.input_evidence_ids) || !rec.input_evidence_ids.length)
    gaps.push('no input evidence ids are recorded, so what the answer was built from cannot be traced');
  if(rec.model_version==null && rec.deterministic!==true)
    gaps.push('no model version is recorded and the record is not marked deterministic');
  if(rec.output_hash==null) gaps.push('no output hash is recorded');
  if(rec.human_review_status!=='reviewed' && rec.human_review_required===true)
    gaps.push('this record requires human review and has not been reviewed');
  if(!gaps.length) return {ready:true, state:'ready', record:rec,
    why:'a complete, successful, traceable AI decision record exists for this case.'};
  return {ready:false,
          state:(rec.error!=null && rec.error!=='') ? 'failed' : 'incomplete',
          record:rec, gaps:gaps,
          why:(rec.error!=null&&rec.error!=='')
                ? ('the AI step FAILED for this case and the failure is recorded: '
                   +gaps.join('; ')+'. The record is kept as audit evidence; it does not '
                   +'satisfy the AI criterion.')
                : ('an AI record exists but is not decision-grade: '+gaps.join('; ')+'.')};
}
function aiReady(){ try{ return aiReadyDetail().ready===true; }catch(_){ return false; } }
try{ AGN.aiReadyDetail = aiReadyDetail; }catch(_){}


function spatialReady(){try{
  var a=activeAsset(); if(!a) return false;
  if(!(AGN.spatialLab&&typeof AGN.spatialLab.evidenceFor==='function')) return false;
  return AGN.spatialLab.evidenceFor(a.asset_id||null).length>0;
}catch(_){return false}}


function horizonId(){try{
  if(AGN.timeSelection&&AGN.timeSelection.state){var s=AGN.timeSelection.state();if(s&&s.horizon)return s.horizon;}
  if(AGN.timeContext&&AGN.timeContext.id)return AGN.timeContext.id();
}catch(_){}return null}
function horizonStatus(){try{
  var h=horizonId(); if(!h) return 'unresolved';
  return (AGN.timeContext&&AGN.timeContext.statusOf)?AGN.timeContext.statusOf(h):'unavailable';
}catch(_){return 'unavailable'}}
function horizonReady(){return horizonStatus()==='operational'}





function hazardId(v){
  try{ if(AGN.hazardRegistry&&AGN.hazardRegistry.resolve) return AGN.hazardRegistry.resolve(v); }
  catch(_){}
  return v==null?null:String(v).trim()||null;
}


var G_LS=(function(){ try{ return window.localStorage; }catch(_){ return null; } })();
function projectId(){
  var p=project(); if(!p) return null;
  p.company = p.company || {};
  if(!p.project_id){
    

    var _keep=null; try{ _keep=G_LS?G_LS.getItem('agn.unsavedProjectId'):null; }catch(_){ _keep=null; }
    p.project_id = (_keep && /^PRJ-[A-Z0-9]+-[A-Z0-9]+$/.test(_keep)) ? _keep
                 : ('PRJ-' + Date.now().toString(36).toUpperCase()
                 + '-' + Math.floor(Math.random()*1679616).toString(36).toUpperCase());
    try{ if(G_LS && !_keep) G_LS.setItem('agn.unsavedProjectId', p.project_id); }catch(_){}
  }
  return p.project_id;
}
function caseSignature(){
  var p=project(),c=context(),a=activeAsset();
  if(!p) return null;
  return { project_id:projectId(),
           client_name:(p.company&&p.company.client_name)||null,
           asset_id:a?(a.asset_id||a.name||null):null,
           

           hazard_id:(c.hazard_id!=null ? hazardId(c.hazard_id) : hazardId(c.hazard)),
           hazard_label:c.hazard||null,
           horizon_id:horizonId(),
           horizon_status:horizonStatus(),
           lead_hours:(c.leadHours==null?null:c.leadHours),
           

           scenario_id:scenarioId(),
           

           engine_methodology_version:(window.AGN_METHODOLOGY_VERSION||'nigraan-method-2026.09'),
           methodology_version:(window.AGN_METHODOLOGY_VERSION||'nigraan-method-2026.09'),
           build_version:(window.AGN_VERSION||null) };
}




try{
  AGN.scenario = Object.assign({}, AGN.scenario, {
    activeId:function(){
      try{ var p=(AGN.project&&AGN.project.state)?AGN.project.state():null;
           return (p && p.active_scenario_id!=null) ? String(p.active_scenario_id) : null; }
      catch(_){ return null; }
    },
    setActive:function(id, why){
      try{
        var p=(AGN.project&&AGN.project.state)?AGN.project.state():null;
        if(!p) return null;
        var prev=p.active_scenario_id==null?null:String(p.active_scenario_id);
        p.active_scenario_id=(id==null?null:String(id));
        p.active_scenario_at=new Date().toISOString();
        p.active_scenario_basis=why||'selected by running a scenario sweep';
        

        try{ document.dispatchEvent(new CustomEvent('agn:scenario-active',
              {detail:{scenario_id:p.active_scenario_id, previous:prev}})); }catch(_){ }
        try{ document.dispatchEvent(new CustomEvent('agn:project',
              {detail:{reason:'scenario-active'}})); }catch(_){ }
        return p.active_scenario_id;
      }catch(_){ return null; }
    },
    clearActive:function(){ try{ return AGN.scenario.setActive(null,'cleared'); }catch(_){ return null; } }
  });
}catch(_){ }



try{
  document.addEventListener('agn:scenario-active', function(e){
    try{
      var id=(e&&e.detail&&e.detail.scenario_id)||null;
      var host=document.getElementById('agnGlobalTime');
      if(!host) return;
      var tag=document.getElementById('agnScenarioTag');
      if(!id){ if(tag) tag.remove(); return; }
      if(!tag){
        tag=document.createElement('span');
        tag.id='agnScenarioTag';
        tag.className='agn-prov-build';
        tag.style.marginLeft='8px';
        host.appendChild(tag);
      }
      tag.textContent=' · scenario '+id;
      tag.title='This decision case rests on scenario '+id+'. Evidence recorded under a '
               +'different scenario belongs to a different case.';
    }catch(_){ }
  });
}catch(_){ }

function scenarioId(){
  try{
    var p=project(); if(!p) return null;
    var rows=Array.isArray(p.scenario)?p.scenario:[];
    

    var sel=null;
    try{ sel=(AGN.scenario&&AGN.scenario.activeId)?AGN.scenario.activeId():null; }catch(_){}
    if(sel==null){ try{ sel=(p.active_scenario_id!=null)?p.active_scenario_id:null; }catch(_){} }
    if(sel==null) return null;
    var hit=rows.filter(function(r){ return r && String(r.scenario_id)===String(sel); });
    return hit.length ? String(sel) : String(sel);
  }catch(_){ return null; }
}
try{ AGN.scenarioActiveId = scenarioId; }catch(_){}

function caseId(){
  var s=caseSignature();
  if(!s) return null;
  return caseIdFrom(s.project_id, s.asset_id, s.hazard_id, s.horizon_id,
                    s.lead_hours, s.scenario_id);
}




var LEAD_REQUIRED_HORIZONS={ short:1, medium:1, subseasonal:1, seasonal:1 };
function caseLeadSegment(leadIn, horizonIdIn){
  var z=horizonIdIn==null?'':String(horizonIdIn).trim();
  if(leadIn==null||leadIn==='') return LEAD_REQUIRED_HORIZONS[z] ? null : 'L-';
  var n=Number(leadIn);
  if(!isFinite(n)) return LEAD_REQUIRED_HORIZONS[z] ? null : 'L-';
  return 'L'+String(Math.round(n));
}
function caseIdFrom(projectIdIn, assetIdIn, hazardIdIn, horizonIdIn, leadHoursIn, scenarioIdIn){
  if(projectIdIn==null||assetIdIn==null||hazardIdIn==null||horizonIdIn==null) return null;
  var pid=String(projectIdIn).trim(), aid=String(assetIdIn).trim(),
      hid=String(hazardIdIn).trim(), zid=String(horizonIdIn).trim();
  if(!pid||!aid||!hid||!zid) return null;
  

  var lseg=caseLeadSegment(leadHoursIn, zid);
  if(lseg==null) return null;
  var sseg=(scenarioIdIn==null||scenarioIdIn==='') ? 'S-' : ('S'+String(scenarioIdIn).trim());
  return ['case',pid,aid,hid,zid,lseg,sseg].join('|');
}


var CASE_SEGMENTS=['project','asset','hazard','horizon','lead','scenario'];
function caseIdParse(idIn){
  var f=String(idIn==null?'':idIn).split('|');
  if(f[0]!=='case'||f.length<5) return null;
  return { project:f[1], asset:f[2], hazard:f[3], horizon:f[4],
           lead:(f.length>5?f[5]:null), scenario:(f.length>6?f[6]:null),
           segments:f.length,
           

           legacy:(f.length<7) };
}
function caseIdDiff(otherId, activeId){
  var a=caseIdParse(activeId), b=caseIdParse(otherId);
  if(!a||!b) return null;
  var out={ legacy:b.legacy, dimensions:[], timeMoved:false };
  CASE_SEGMENTS.forEach(function(nm){
    

    if(b.legacy && (nm==='lead'||nm==='scenario')) return;
    if(String(b[nm])===String(a[nm])) return;
    

    if(nm==='horizon'||nm==='lead'){ out.timeMoved=true; return; }
    out.dimensions.push(nm);
  });
  if(out.timeMoved) out.dimensions.push('decision time');
  out.count=out.dimensions.length;
  

  out.carryable = (out.dimensions.indexOf('project')<0)
               && (out.legacy ? out.count===0 || (out.count===1 && out.dimensions[0]==='decision time')
                              : out.count===1);
  return out;
}
try{ AGN.caseIdDiff = caseIdDiff; AGN.caseIdParse = caseIdParse; }catch(_){}



function caseIdRefusal(sig){
  if(!sig) return 'no client project is open';
  if(sig.project_id==null) return 'no client project is open';
  if(sig.asset_id==null)   return 'no asset is selected';
  if(sig.hazard_id==null)  return 'no hazard is selected';
  if(sig.horizon_id==null) return 'no horizon is selected';
  if(caseLeadSegment(sig.lead_hours, sig.horizon_id)==null){
    return 'the ' + String(sig.horizon_id) + ' horizon covers a range of lead times '
         + '(6-72 h), so a decision inside it needs the lead it was taken at. '
         + 'Choose a forecast day on the map, or set one in the time strip.';
  }
  return null;
}
try{ AGN.caseIdRefusal = caseIdRefusal; }catch(_){}


function caseMismatch(rec){
  var s=caseSignature(); if(!s||!rec) return null;
  var bad=[];
  if(rec.asset_id!=null&&s.asset_id!=null&&String(rec.asset_id)!==String(s.asset_id)) bad.push('asset');
  

  

  var _rh=(rec.hazard_id!=null)?rec.hazard_id:hazardId(rec.hazard), _sh=s.hazard_id;
  if(_rh!=null&&_sh!=null&&String(_rh)!==String(_sh)) bad.push('hazard');
  var _rz=(rec.horizon_id!=null)?rec.horizon_id:rec.horizon;
  if(_rz!=null&&s.horizon_id!=null&&String(_rz)!==String(s.horizon_id)) bad.push('horizon');
  

  if(rec.lead_hours!=null&&s.lead_hours!=null&&Number(rec.lead_hours)!==Number(s.lead_hours))
    bad.push('lead');
  

  if(rec.scenario_id!=null&&String(rec.scenario_id)!==String(s.scenario_id==null?'':s.scenario_id))
    bad.push('scenario');
  if(rec.decision_case_id!=null&&caseId()!=null&&String(rec.decision_case_id)!==String(caseId())) bad.push('case');
  return bad.length?bad:null;
}


var CASE_STORES = [
  

  { store:'hazard_evidence',        label:'screening result' },
  

  { store:'engineering_evidence',   label:'engineering design value' },
  

  { store:'ai_decisions',           label:'AI decision output' },
  { store:'spatial_evidence',       label:'spatial selections' },
  { store:'spatial_inputs',         label:'client points and features' },
  

  { store:'scenario',               label:'scenario sensitivity sweeps' },
  { store:'climate_evidence',       label:'CMIP6 multi-model deltas' }
];







function caseBind(rec, hazardHint){
  rec = rec || {};
  var _sig = null;
  try{ _sig = (AGN.decisionCase && AGN.decisionCase.signature)
                ? AGN.decisionCase.signature() : null; }catch(_){ _sig = null; }

   
  try{ if(rec.asset_id == null) rec.asset_id = _sig ? (_sig.asset_id || null) : null; }
  catch(_){ if(rec.asset_id === undefined) rec.asset_id = null; }

   
  try{
    if(rec.hazard_id == null){
      

      var _h = hazardHint != null ? hazardHint : rec.hazard;
      rec.hazard_id = (AGN.hazardRegistry && AGN.hazardRegistry.resolve && _h != null)
        ? AGN.hazardRegistry.resolve(_h) : null;
      if(rec.hazard_id == null) rec.hazard_id = _sig ? (_sig.hazard_id || null) : null;
    }
  }catch(_){ if(rec.hazard_id === undefined) rec.hazard_id = null; }

   
  

  try{ if(rec.horizon == null) rec.horizon = _sig ? (_sig.horizon_id || null) : null; }
  catch(_){ if(rec.horizon === undefined) rec.horizon = null; }
  try{ if(rec.horizon_id == null) rec.horizon_id = (rec.horizon != null ? rec.horizon : null); }
  catch(_){ if(rec.horizon_id === undefined) rec.horizon_id = null; }

  

  try{ if(rec.lead_hours == null) rec.lead_hours = _sig ? (_sig.lead_hours==null?null:_sig.lead_hours) : null; }
  catch(_){ if(rec.lead_hours === undefined) rec.lead_hours = null; }
  try{ if(rec.scenario_id == null) rec.scenario_id = _sig ? (_sig.scenario_id || null) : null; }
  catch(_){ if(rec.scenario_id === undefined) rec.scenario_id = null; }

   
  try{
    var _pid = _sig ? _sig.project_id : null;
    var _derived = caseIdFrom(_pid, rec.asset_id, rec.hazard_id, rec.horizon_id,
                              rec.lead_hours, rec.scenario_id);
    if(_derived != null){
      if(rec.decision_case_id != null && String(rec.decision_case_id) !== String(_derived)){
        rec.case_id_conflict = { supplied:String(rec.decision_case_id), derived:_derived,
          why:'the id this record arrived with does not describe its own asset, hazard '
             +'and horizon. The derived id governs; the supplied one is kept here so the '
             +'disagreement is visible rather than resolved in silence.' };
      }
      rec.decision_case_id = _derived;
    } else if(rec.decision_case_id === undefined){
      rec.decision_case_id = null;
    }
  }catch(_){ if(rec.decision_case_id === undefined) rec.decision_case_id = null; }

   
  try{ if(rec.created_at == null) rec.created_at = new Date().toISOString(); }
  catch(_){ if(rec.created_at === undefined) rec.created_at = null; }
  

  

  try{ if(rec.source != null && String(rec.source).trim()==='') rec.source = null; }
  catch(_){}
  try{ if(!('source' in rec)) rec.source = null; }catch(_){}
  try{
    

    var _v = (window.AGN_VERSION || (AGN && AGN.version) || null);
    if(rec.build_version == null) rec.build_version = _v;
    if(rec.engine_methodology_version == null)
      rec.engine_methodology_version = (window.AGN_METHODOLOGY_VERSION || 'nigraan-method-2026.09');
    if(rec.methodology_version == null)
      rec.methodology_version = rec.engine_methodology_version;
  }catch(_){}
  return rec;
}
 



function recordScenario(detail){
  try{
    var p=project(); if(!p) return null;
    p.scenario = Array.isArray(p.scenario) ? p.scenario : [];
    var rec = ({
      kind:'scenario_sweep',
      scenario_id:(detail&&detail.scenario_id)||null,
      hazard:(detail&&detail.hazard)||null,
      preset:(detail&&detail.preset)||null,
      samples:(detail&&detail.samples)!=null?detail.samples:null,
      unit:(detail&&detail.unit)||null,
      

      core_score:(detail&&detail.core_score)!=null?detail.core_score:null,
      advanced_parameters:(detail&&detail.advanced_parameters)||null,
      probability_boundary:'uniform sensitivity envelope over the declared scenario '
        +'boundary; percentiles are not event probability',
      

      source:(detail&&detail.source)||'Scenario Lab / sensitivity sweep',
      created_at:new Date().toISOString()
    });
    AGN.decisionCase.write('scenario', rec);
    return rec;
  }catch(_){ return null; }
}
function recordClimate(detail){
  try{
    var p=project(); if(!p) return null;
    p.climate_evidence = Array.isArray(p.climate_evidence) ? p.climate_evidence : [];
    var rec = ({
      

      kind:'cmip6_delta',
      calculation_id:(detail&&detail.calculation_id)||null,
      future_window:(detail&&detail.future_window)||null,
      baseline:(detail&&detail.baseline)||null,
      models_requested:(detail&&detail.models_requested)||null,
      models_temperature:(detail&&detail.models_temperature)||null,
      models_precipitation:(detail&&detail.models_precipitation)||null,
      models_unavailable:(detail&&detail.models_unavailable)||null,
      temperature_delta_c:(detail&&detail.temperature_delta_c)||null,
      precipitation_delta_percent:(detail&&detail.precipitation_delta_percent)||null,
      per_model:(detail&&detail.per_model)||null,
      bias_corrected:(detail&&detail.bias_corrected),
      bias_correction_reference:(detail&&detail.bias_correction_reference)||null,
      bias_correction_method:(detail&&detail.bias_correction_method)||null,
      provenance:'MACH HighResMIP, statistically downscaled and linearly '
        +'bias-corrected to land reanalysis by the provider; one high-emission trajectory',
      probability_boundary:'planning context, never an engineering design value',
      

      source:'CMIP6 panel / MACH HighResMIP delta run',
      created_at:(detail&&detail.created_at)||new Date().toISOString()
    });
    AGN.decisionCase.write('climate_evidence', rec);
    return rec;
  }catch(_){ return null; }
}
try{
  D.addEventListener('agn:scenario-sweep', function(e){ recordScenario(e&&e.detail); });
  D.addEventListener('agn:cmip6', function(e){ recordClimate(e&&e.detail); });
}catch(_){}

function caseIntegrity(){
  var p=project(); if(!p) return {bound:0,unbound:0,mismatched:0,detail:[],ok:false,
                                  why:'no client project is open'};
  var s=caseSignature(), id=caseId();
  var pool=[];
  CASE_STORES.forEach(function(d){
    var k=d.store;
    (Array.isArray(p[k])?p[k]:[]).forEach(function(r){ pool.push({store:k,rec:r}); });
  });
  

  

  var bound=0,foreign=0,contradictory=0,unbound=0,incomplete=0,detail=[],foreignCases={};
  

  var _unboundFields={};
  

  function _caseWhy(x){
    if(x.contradictory){
      return x.contradictory+' record'+(x.contradictory===1?'':'s')
        +' claim'+(x.contradictory===1?'s':'')+' this decision case while their own asset, '
        +'hazard or horizon disagree with it'
        +((x.sig&&x.sig.hazard_label)?' ('+x.sig.hazard_label+')':'');
    }
    if(x.unbound) return _unboundWhy(x.unbound, x.id, x.missing, x.unboundFields);
    if(x.missing.length && x.bound>0){
      return 'this package is missing '+x.missing.join(', ')
        +'. A client document states who it is for, which asset it is about, and the '
        +'hazard and horizon it was produced under.';
    }
    if(x.horizonBlock && x.bound>0) return x.horizonBlock;
    if(!x.reportReady.ok && x.bound>0) return x.reportReady.why;
    if(x.incomplete){
      return x.incomplete+' record'+(x.incomplete===1?'':'s')
        +' carr'+(x.incomplete===1?'ies':'y')+' an incomplete envelope and cannot be '
        +'attributed to this decision case';
    }
    if(x.bound){
      var nOther=Object.keys(x.foreignCases||{}).length;
      return 'every contributing record is bound to the active case'
        +(x.foreign ? ('; '+x.foreign+' record'+(x.foreign===1?'':'s')
            +' belong'+(x.foreign===1?'s':'')+' to '+nOther+' other decision case'
            +(nOther===1?'':'s')+' in this project and are excluded from this package, '
            +'not counted against it') : '');
    }
    if(x.moved) return 'no record is bound to the active case yet - '+x.moved;
    return 'no record is bound to the active case yet';
  }
  function _unboundWhy(n, id, missing, fields){
    var named=Object.keys(fields||{});
    if(named.length && id!=null){
      return n+' record'+(n===1?'':'s')+' cannot be bound to this case: '
        +named.map(function(f){
            return fields[f]+' name'+(fields[f]===1?'s':'')+' a different '+f; }).join(', ')
        +'. Re-run the step for the active selection, or remove the record.';
    }
    if(id==null && missing && missing.length){
      return 'no decision case is established yet: this package is missing '
        +missing.join(', ')+'. '+n+' record'+(n===1?'':'s')+' cannot be bound until it is.';
    }
    return n+' record'+(n===1?'':'s')
      +' predate case binding and cannot be proven to belong to any case';
  }
  pool.forEach(function(x){
    var rec=x.rec||{};
    var rid=(rec.decision_case_id!=null)?String(rec.decision_case_id):null;
    var m=caseMismatch(rec);
    if(rid!=null && id!=null && rid===String(id)){
       
      var bad=(m||[]).filter(function(f){ return f!=='case'; });
      if(bad.length || rec.case_id_conflict){
        contradictory++;
        detail.push({store:x.store, klass:'contradictory',
                     fields:bad.length?bad:['case_id_conflict']});
      } else if(rec.envelope_incomplete && rec.envelope_incomplete.length){
        incomplete++;
        detail.push({store:x.store, klass:'incomplete',
                     fields:rec.envelope_incomplete.slice()});
      } else bound++;
      return;
    }
    if(rid!=null && /^case\|/.test(rid)){
       
      foreign++; foreignCases[rid]=(foreignCases[rid]||0)+1;
      return;
    }
    unbound++;
    detail.push({store:x.store, klass:'unbound', fields:(m||['no case id'])});
    (m||[]).forEach(function(f){ if(f!=='case') _unboundFields[f]=(_unboundFields[f]||0)+1; });
  });
  var mismatched=contradictory;
  

  var _moved=null, _rebindable=0, _legacyCount=0;
  try{
    var _fk=Object.keys(foreignCases);
    if(_fk.length && id!=null){
       
      var _diff={}, _legacyN=0;
      _fk.forEach(function(fid){
        var dd=caseIdDiff(fid, id);
        if(!dd) return;
        if(!dd.carryable) return;
        _rebindable+=foreignCases[fid];
        

        if(dd.legacy){ _legacyN+=foreignCases[fid]; return; }
        _diff[dd.dimensions[0]]=(_diff[dd.dimensions[0]]||0)+foreignCases[fid];
      });
      _legacyCount=_legacyN;
      var _names=Object.keys(_diff);
      if(_names.length===1){
        var _w=_names[0], _n=_diff[_w];
        _moved=_w+' changed: '+_n+' record'+(_n===1?'':'s')+' '+(_n===1?'was':'were')
              +' recorded under a different '+_w+' and '+(_n===1?'still exists':'still exist')
              +' under that decision case. '+(_n===1?'It is':'They are')+' not lost. Carry '
              +(_n===1?'it':'them')+' over with Rebind to this case if this is the same '
              +'decision, or re-run the step for the '+_w+' now selected.';
      } else if(_names.length>1){
        _moved=_names.join(' and ')+' changed: '+_rebindable+' record'
              +(_rebindable===1?'':'s')+' still exist under the previous decision case'
              +(_rebindable===1?'':'s')+'. Carry them over with Rebind to this case, or '
              +'re-run the steps for the dimensions now selected.';
      }
      

      if(_legacyCount){
        var _lm = _legacyCount+' record'+(_legacyCount===1?'':'s')+' in this project '
                + (_legacyCount===1?'was':'were') + ' written before this build, under a '
                + 'decision-case identity that did not record the lead time or the '
                + 'scenario. ' + (_legacyCount===1?'It is':'They are') + ' not lost and '
                + (_legacyCount===1?'it has':'they have') + ' not changed. Carry '
                + (_legacyCount===1?'it':'them') + ' onto this case with Rebind to this '
                + 'case: the lead and scenario now selected are stamped on '
                + (_legacyCount===1?'it':'them') + ', and the id '
                + (_legacyCount===1?'it':'they') + ' arrived with is kept beside '
                + (_legacyCount===1?'it':'them') + ' so the migration is visible.';
        _moved = _moved ? (_moved+' '+_lm) : _lm;
      }
    }
  }catch(e){ agnDiag('decisionCase','integrity:dimension-diff', e); }
  

  

  var _demo = (p.project_mode === 'demonstration')
    || pool.some(function(x){ return !!(x.rec && x.rec.demo === true); });
  var _missing=[];
  

  if(!s||!s.client_name) _missing.push('a client name');
  if(!s||!s.asset_id)  _missing.push('an active asset');
  if(!s||!s.hazard_id) _missing.push('a hazard');
  if(!s||!s.horizon_id) _missing.push('a horizon');
  

  var _populated=0;
  CASE_STORES.forEach(function(d){
    if(Array.isArray(p[d.store]) && p[d.store].length) _populated++;
  });
  
  

  var REQUIRED_FOR_ISSUE=[
    { store:'hazard_evidence',
      pages:'the hazard screening, hazard scope and per-hazard evidence pages, and the flood pathway page',
      why:'the document quotes what was screened and does not screen again at issue time' }
  ];
  

  var _horizonBlock=null;
  try{
    var _hid=(s&&s.horizon_id)||null;
    if(_hid && window.AGN && AGN.timeContext && AGN.timeContext.isOperational
       && !AGN.timeContext.isOperational(_hid)){
      _horizonBlock=(AGN.timeContext.unavailableNotice
                      ? AGN.timeContext.unavailableNotice(_hid)
                      : ('the '+_hid+' horizon is not operational in this build'))
        +' Select an operational horizon to issue a document, or keep this as a draft '
        +'outlook and say so on the face of it.';
    }
  }catch(e){ agnDiag('decisionCase','integrity:horizon-status', e); }
  var _reportReady={ok:true, missing:[]};
  try{
    REQUIRED_FOR_ISSUE.forEach(function(req){
      var rows=(Array.isArray(p[req.store])?p[req.store]:[]).filter(function(r){
        return r && r.decision_case_id!=null && id!=null
               && String(r.decision_case_id)===String(id)
               && !(r.envelope_incomplete && r.envelope_incomplete.length)
               && !r.case_id_conflict; });
      if(!rows.length){
        _reportReady.ok=false;
        _reportReady.missing.push({ store:req.store, pages:req.pages, why:req.why });
      }
    });
  }catch(e){ agnDiag('decisionCase','integrity:report-ready', e); _reportReady={ok:false,missing:[{store:'unknown',pages:'unknown',why:'the page-coverage check failed'}]}; }
  _reportReady.why = _reportReady.ok ? null
    : ('this package holds no '+_reportReady.missing.map(function(m){
         return String(m.store).replace(/_/g,' '); }).join(' or ')
       +' record bound to the active decision case, so '
       +_reportReady.missing.map(function(m){ return m.pages; }).join(' and ')
       +' would print empty. Run the assessment for this asset, hazard and horizon '
       +'- or carry the existing record over if the selection changed after it was produced.');
  

  var _tampered=[], _unsealed=0;
  try{
    pool.forEach(function(x){
      var v=caseVerifyEvidence(x.rec);
      if(v.unsealed){ _unsealed++; return; }
      if(!v.ok) _tampered.push({store:x.store, evidence_id:x.rec.evidence_id||null,
                                why:v.why});
    });
  }catch(e){ agnDiag('decisionCase','integrity:seal', e); }

  

  try{
    if(id==null && s && !_missing.length){
      var _why=(typeof caseIdRefusal==='function') ? caseIdRefusal(s) : null;
      if(_why) _missing=[_why];
    }
  }catch(_){ }

  return { case_id:id, signature:s, total:pool.length, demo:_demo,
           registered:CASE_STORES.length, populated:_populated,
           case_established:(id!=null), case_missing:(_missing.length?_missing:null),
           case_refusal:(id==null && typeof caseIdRefusal==='function')
                          ? caseIdRefusal(s||{}) : null,
           legacy_records:_legacyCount,
           sealed_ok:(pool.length-_tampered.length-_unsealed),
           unsealed:_unsealed,
           tampered:_tampered.length, tampered_detail:_tampered,
           bound:bound, foreign:foreign, contradictory:contradictory,
           incomplete:incomplete,
           dimension_changed:_moved, rebindable:_rebindable,
           report_ready:_reportReady,
           horizon_not_operational:_horizonBlock,
           foreign_cases:Object.keys(foreignCases).length,
           unbound:unbound, mismatched:mismatched, detail:detail,
           

           ok:(contradictory===0),
           

           unbound_because:(id==null && _missing.length)
             ? ('this package has no decision case yet because it is missing '
                + _missing.join(', ') + '. Records written before the case exists '
                + 'cannot be bound to it - set the missing dimension and they can be '
                + 'rebound, or re-run the step.')
             : null,
           

            
           

           issuable:(contradictory===0 && unbound===0 && incomplete===0 && bound>0
                     && _reportReady.ok && !_horizonBlock && !_missing.length),
           mode:'warn',
           

           why:_caseWhy({contradictory:contradictory, unbound:unbound, bound:bound,
                         incomplete:incomplete, foreign:foreign,
                         foreignCases:foreignCases, missing:_missing,
                         horizonBlock:_horizonBlock, reportReady:_reportReady,
                         moved:_moved, unboundFields:_unboundFields,
                         id:id, sig:s}) };
}






var ENVELOPE_FIELDS=['decision_case_id','asset_id','hazard_id','horizon_id',
                     'created_at','source','methodology_version','build_version',
                     'evidence_id'];
var G_CRYPTO=(function(){ try{ return window.crypto||window.msCrypto||null; }catch(_){ return null; } })();



var EVIDENCE_HASH_EXCLUDED=['evidence_hash','evidence_hash_basis','evidence_hash_excludes'];
function caseHashPayload(rec){
  var out={};
  Object.keys(rec||{}).forEach(function(k){
    if(EVIDENCE_HASH_EXCLUDED.indexOf(k)>=0) return;
    out[k]=rec[k];
  });
  return out;
}
function caseRehash(rec){
  if(!rec || typeof rec!=='object') return rec;
  try{
    var canon=(AGN.hash && AGN.hash.canonical)
                ? AGN.hash.canonical(caseHashPayload(rec))
                : JSON.stringify(caseHashPayload(rec));
    rec.evidence_hash=(AGN.hash && AGN.hash.sha256) ? AGN.hash.sha256(canon) : null;
    rec.evidence_hash_basis='SHA-256 over the canonical form of this record, every field '
      + 'except the hash fields themselves. Re-taken whenever the record is rebound, so '
      + 'the seal always describes the record as it now stands.';
    rec.evidence_hash_excludes=EVIDENCE_HASH_EXCLUDED.slice();
  }catch(e){ try{ agnDiag('decisionCase','rehash', e); }catch(_){ } }
  return rec;
}
function caseVerifyEvidence(rec){
  if(!rec || typeof rec!=='object') return {ok:false, why:'no record'};
  if(rec.evidence_hash==null)
    return {ok:false, why:'this record carries no seal, so nothing can be verified',
            unsealed:true};
  var got;
  try{
    var canon=(AGN.hash && AGN.hash.canonical)
                ? AGN.hash.canonical(caseHashPayload(rec))
                : JSON.stringify(caseHashPayload(rec));
    got=(AGN.hash && AGN.hash.sha256) ? AGN.hash.sha256(canon) : null;
  }catch(e){ return {ok:false, why:'the record could not be canonicalised'}; }
  return { ok: got===rec.evidence_hash, stored:rec.evidence_hash, recomputed:got,
           why: got===rec.evidence_hash
                  ? 'the seal matches the record it was taken over'
                  : 'the seal does not match this record: it has been changed since it was '
                  + 'written, outside the governed writer' };
}
try{ AGN.verifyEvidence = caseVerifyEvidence; AGN.rehashEvidence = caseRehash; }catch(_){}




var AGN_DIAG=[];
function agnDiag(module, operation, err){
  try{
    var rec={ module:module, operation:operation,
              message:(err&&err.message)||String(err||'unknown'),
              decision_case_id:null, project_id:null,
              at:new Date().toISOString() };
    try{ rec.decision_case_id=caseId(); }catch(_){}
    try{ rec.project_id=projectId(); }catch(_){}
    AGN_DIAG.push(rec); if(AGN_DIAG.length>50) AGN_DIAG.shift();
    console.warn('[AGN diag]', module+'.'+operation, rec.message);
  }catch(_){}
}
try{ (window.AGN=window.AGN||{}).diagnostics=function(){ return AGN_DIAG.slice(); }; }catch(_){}

function caseWriteRefusal(store, why){
  try{
    var D=document, id='agnWriteRefusal', n=D.getElementById(id);
    if(!n){
      n=D.createElement('div'); n.id=id;
      n.setAttribute('role','status'); n.setAttribute('aria-live','polite');
      

      n.style.cssText='position:fixed;left:50%;bottom:auto;top:76px;transform:translateX(-50%);'
        +'z-index:99999;max-width:min(640px,92vw);background:#7A2E2E;color:#fff;'
        +'border-radius:10px;padding:12px 16px;font:600 0.8125rem/1.45 inherit;'
        +'box-shadow:0 10px 30px rgba(0,0,0,.28);pointer-events:none';
      D.body.appendChild(n);
    }
    n.textContent = why;
    clearTimeout(caseWriteRefusal._t);
    caseWriteRefusal._t = setTimeout(function(){ try{ n.remove(); }catch(_){ } }, 9000);
  }catch(_){ }
  try{ console.warn('[AGN] evidence not stored ·', store, '·', why); }catch(_){ }
}

function caseWrite(store, rec, hazardHint){
  var p=project();
  if(!p){
    caseWriteRefusal(store,
      'Not saved. No client project is open, so this ' + String(store).replace(/_/g,' ')
      + ' result has nowhere to be recorded and has been discarded. Open or create a '
      + 'project first, then run it again — evidence is only auditable inside a project.');
    return null;
  }
  var known=CASE_STORES.some(function(d){ return d.store===store; });
  if(!known){ try{ console.warn('[AGN] unregistered evidence store', store); }catch(_){}
    return null; }
  if(!rec || typeof rec!=='object') return null;

  p[store]=Array.isArray(p[store])?p[store]:[];
  

  try{
    if(p.project_mode==='demonstration' && rec && rec.demo!==true){
      rec.demo=true;
      if(rec.demo_case==null && typeof DEMO_CASE_ID!=='undefined') rec.demo_case=DEMO_CASE_ID;
    }
  }catch(_){}
  var bound=caseBind(rec, hazardHint);

  

  

  try{
    if(bound.evidence_id == null){
      var _rnd=(function(){
        try{ if(G_CRYPTO && G_CRYPTO.getRandomValues){
               var a=new Uint8Array(8); G_CRYPTO.getRandomValues(a);
               return Array.prototype.map.call(a,function(x){ return ('0'+x.toString(16)).slice(-2); }).join('');
             } }catch(_){ }
        return (Math.random().toString(16).slice(2,10)+Math.random().toString(16).slice(2,10)).slice(0,16);
      })();
      bound.evidence_id = 'EV-' + String(store).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,10)
                        + '-' + Date.now().toString(36).toUpperCase() + '-' + _rnd.toUpperCase();
      bound.evidence_id_minted_at = new Date().toISOString();
    }
    

    caseRehash(bound);
  }catch(e){ agnDiag('decisionCase','write:evidence-id', e); }
  

  try{
    if(store==='ai_decisions'){
      if(bound.generated_at==null) bound.generated_at = bound.created_at;
      if(bound.human_review_status==null) bound.human_review_status = 'unreviewed';
      if(bound.input_evidence_ids==null) bound.input_evidence_ids = [];
    }
  }catch(_){}
  var gaps=ENVELOPE_FIELDS.filter(function(f){ return bound[f]===undefined||bound[f]===null; });
  if(gaps.length){
    bound.envelope_incomplete=gaps;
    

    try{ console.warn('[AGN] evidence written with an incomplete envelope',store,gaps); }catch(_){}
    

    var _gapWhy=null, _gapFix='open a client project and select the asset and hazard this result belongs to';
    try{
      if(gaps.indexOf('decision_case_id')>=0 || gaps.indexOf('asset_id')>=0){
        var _s0=caseSignature()||{};
        _gapWhy=caseIdRefusal({ project_id:_s0.project_id, asset_id:bound.asset_id,
          hazard_id:bound.hazard_id, horizon_id:bound.horizon_id, lead_hours:bound.lead_hours });
        if(/no asset/.test(_gapWhy||'')) _gapFix='choose the active asset under Assets & Exposure, or load a sample, which selects one';
        else if(/no hazard/.test(_gapWhy||'')) _gapFix='choose the hazard on the map';
        else if(/horizon|lead/.test(_gapWhy||'')) _gapFix='choose a decision time in the time strip';
        else if(/no client project/.test(_gapWhy||'')) _gapFix='open or create a client project';
      }
    }catch(_){ _gapWhy=null; }
    caseWriteRefusal(store,
      'Saved, but not fully attributable. This ' + String(store).replace(/_/g,' ')
      + ' record is missing ' + gaps.join(', ').replace(/_/g,' ')
      + (_gapWhy ? ' (' + _gapWhy + ')' : '')
      + '. It is kept so the work is not lost, and it is flagged so a reviewer can see '
      + 'the gap — ' + _gapFix + ', then run it again for a record that can carry a decision.');
  }
  p[store].push(bound);
  return bound;
}

try{ AGN.writeRefusal = caseWriteRefusal; }catch(_){}


function caseEvidence(store, opts){
  

  if(!CASE_STORES.some(function(d){ return d.store===store; })){
    

    agnDiag('decisionCase','evidence:unregistered-store', new Error(String(store)));
    return [];
  }
  var p=project(); if(!p) return [];
  var id=caseId(); if(id==null) return [];
  var rows=Array.isArray(p[store])?p[store]:[];
  var out=rows.filter(function(r){
    return r && r.decision_case_id!=null && String(r.decision_case_id)===String(id);
  });
  if(opts && opts.completeEnvelope){
    out=out.filter(function(r){ return !(r.envelope_incomplete && r.envelope_incomplete.length)
                                    && !r.case_id_conflict; });
  }
  

  return out.slice().reverse();
}
function caseLatest(store, opts){ var a=caseEvidence(store,opts); return a.length?a[0]:null; }




function caseRebindTo(opts){
  var p=project();
  if(!p) return {rebound:0, why:'no client project is open'};
  var id=caseId();
  if(id==null) return {rebound:0, why:'there is no active decision case to rebind to'};
  var act=String(id).split('|');
  var maxDiff=(opts && opts.maxDimensions) ? opts.maxDimensions : 1;
  var rebound=0, skipped=0, notes={};
  var now=new Date().toISOString();
  CASE_STORES.forEach(function(d){
    var rows=Array.isArray(p[d.store])?p[d.store]:[];
    rows.forEach(function(rec){
      if(!rec || rec.decision_case_id==null) return;
      if(String(rec.decision_case_id)===String(id)) return;
      

      var dd=caseIdDiff(rec.decision_case_id, id);
      if(!dd){ skipped++; notes['unreadable id']=(notes['unreadable id']||0)+1; return; }
      var diff=dd.dimensions;
      

      if(diff.indexOf('project')>=0){
        skipped++; notes['project']=(notes['project']||0)+1; return;
      }
      

      if(opts && opts.keepAsset && diff.indexOf('asset')>=0){
        skipped++; notes['other asset']=(notes['other asset']||0)+1; return;
      }
      if(!dd.legacy && (!diff.length || diff.length>maxDiff)){
        skipped++; notes[diff.join('+')||'none']=(notes[diff.join('+')||'none']||0)+1;
        return;
      }
      if(dd.legacy && !dd.carryable){
        skipped++; notes['legacy+'+diff.join('+')]=(notes['legacy+'+diff.join('+')]||0)+1;
        return;
      }
      var prev=rec.decision_case_id;
      var sig=caseSignature()||{};
      

      rec.rebound_stated={ asset_id:rec.asset_id, hazard_id:rec.hazard_id,
                           horizon_id:rec.horizon_id,
                           lead_hours:(rec.lead_hours===undefined?null:rec.lead_hours),
                           scenario_id:(rec.scenario_id===undefined?null:rec.scenario_id) };
      rec.rebound_from=prev;
      rec.rebound_at=now;
      

      if(dd.legacy){
        rec.rebound_kind='format-migration';
        rec.rebound_reason='this record was written before the decision-case identity '
          +'recorded a lead time or a scenario. Its own asset, hazard and horizon are '
          +'unchanged and are preserved in rebound_stated; the lead and scenario now '
          +'selected have been stamped on it, and the id it arrived with is kept in '
          +'rebound_from so the migration is visible. If this record was not taken at '
          +'the lead now selected, re-run the step rather than keeping this one.';
        rec.rebound_supplied={ lead_hours:(sig.lead_hours==null?null:sig.lead_hours),
                               scenario_id:sig.scenario_id||null };
      } else {
        rec.rebound_kind='dimension-change';
        rec.rebound_reason='the '+diff.join(' and ')+' selected for this decision changed '
          +'after this record was produced; the record itself is unchanged and states the '
          +diff.join(' and ')+' it was produced under in rebound_stated';
      }
      rec.asset_id=sig.asset_id;
      rec.hazard_id=sig.hazard_id;
      rec.horizon_id=sig.horizon_id;
      rec.lead_hours=(sig.lead_hours==null?null:sig.lead_hours);
      rec.scenario_id=sig.scenario_id||null;
      rec.decision_case_id=caseIdFrom(sig.project_id, sig.asset_id, sig.hazard_id,
                                      sig.horizon_id, sig.lead_hours, sig.scenario_id);
      

      caseRehash(rec);
      rebound++;
    });
  });
  try{ document.dispatchEvent(new CustomEvent('agn:project',
         {detail:{reason:'case-rebind', rebound:rebound}})); }
  catch(e){ agnDiag('decisionCase','rebindTo:dispatch', e); }
  return { rebound:rebound, skipped:skipped, skippedBy:notes, case_id:caseId(),
           why:rebound?(rebound+' record'+(rebound===1?'':'s')+' carried onto this '
                        +'decision case, each stamped with the case it came from')
                      :'no record differed from the active case in exactly one dimension' };
}
function caseRebindUnbound(){
  var p=project(); if(!p) return {rebound:0, stillUnbound:0, why:'no client project is open'};
  var pid=projectId();
  var rebound=0, still=0, reasons={};
  CASE_STORES.forEach(function(d){
    var rows=Array.isArray(p[d.store])?p[d.store]:[];
    rows.forEach(function(r){
      if(!r || r.decision_case_id!=null) return;
      

      var _sigNow=caseSignature()||{};
      var _leadFromCase=false, _scnFromCase=false;
      var _lead=r.lead_hours, _scn=r.scenario_id;
      if(_lead==null && _sigNow.lead_hours!=null
         && String(r.horizon_id!=null?r.horizon_id:r.horizon)===String(_sigNow.horizon_id)){
        _lead=_sigNow.lead_hours; _leadFromCase=true;
      }
      if(_scn==null && _sigNow.scenario_id!=null){ _scn=_sigNow.scenario_id; _scnFromCase=true; }
      var derived=caseIdFrom(pid, r.asset_id, r.hazard_id,
                             (r.horizon_id!=null?r.horizon_id:r.horizon),
                             _lead, _scn);
      if(derived){
        r.decision_case_id=derived;
        r.rebound_at=new Date().toISOString();
        if(_leadFromCase || _scnFromCase){
          if(_leadFromCase) r.lead_hours=_lead;
          if(_scnFromCase)  r.scenario_id=_scn;
          r.rebound_kind='unbound-supplied';
          r.rebound_supplied={ lead_hours:(_leadFromCase?_lead:null),
                               scenario_id:(_scnFromCase?_scn:null) };
          r.rebound_note='bound after the fact from this record\'s own asset, hazard and '
            +'horizon, with the '
            +[( _leadFromCase?'lead time':null),(_scnFromCase?'scenario':null)]
              .filter(Boolean).join(' and ')
            +' supplied by the decision case active when it was bound - the record was '
            +'written before a decision time was selected and could not state one itself. '
            +'It is stamped here so the supplied dimension is visible rather than assumed. '
            +'If this result was not taken at that lead, re-run the step.';
        } else {
          r.rebound_kind='unbound-derived';
          r.rebound_note='bound after the fact from this record\'s own asset, hazard and '
            +'horizon. The id was derived, not assigned: no dimension was supplied here.';
        }
        caseRehash(r);
        rebound++;
      } else {
        still++;
        var miss=[];
        if(r.asset_id==null) miss.push('asset');
        if(r.hazard_id==null) miss.push('hazard');
        if(r.horizon_id==null&&r.horizon==null) miss.push('horizon');
        if(caseLeadSegment(r.lead_hours, (r.horizon_id!=null?r.horizon_id:r.horizon))==null)
          miss.push('lead');
        var k=miss.join('+')||'unknown';
        reasons[k]=(reasons[k]||0)+1;
      }
    });
  });
  return { rebound:rebound, stillUnbound:still, reasons:reasons,
           why:(still? 'records still unbound are missing a dimension the id needs; '
                      +'they cannot be bound without inventing one'
                     : 'every previously unbound record carried all four dimensions '
                      +'and has been bound to the case they describe') };
}


function caseCompleteSubject(opts){
  opts=opts||{};
  var p=project();
  if(!p) return {ok:false, did:[], case_id:null, why:'no client project is open'};
  var did=[];
  p.company=p.company||{};
  try{ projectId(); }catch(_){ }
  var _named=false;
  if(!(p.company.client_name && String(p.company.client_name).trim()) && opts.client_name){
    p.company.client_name=String(opts.client_name); _named=true;
    try{ var _ce=document.getElementById('agnProjClient'); if(_ce) _ce.value=p.company.client_name; }catch(_){ }
    did.push('named the sample client "'+p.company.client_name+'"');
  }
   
  if(_named || opts.sample===true && String(p.company.client_name||'')===String(opts.client_name||'')){
  }
  var list=(p.assets||[]).filter(function(a){ return a && (a.asset_id||a.name); });
  var act=activeAsset();
  if(!act && list.length){
    var pick=null;
    if(opts.asset_id!=null) pick=list.filter(function(a){ return String(a.asset_id)===String(opts.asset_id); })[0]||null;
    var allSample=list.every(function(a){ return a.origin==='sample'||a.origin==='demo'||a.demo===true; });
    if(!pick && (allSample || list.length===1)) pick=list[0];
    if(pick){
      try{ if(AGN.project && AGN.project.setActiveAsset) AGN.project.setActiveAsset(pick.asset_id||pick.name);
           else p.company.active_asset_id=pick.asset_id||pick.name; }catch(_){ p.company.active_asset_id=pick.asset_id||pick.name; }
      p.company.active_asset_basis=opts.basis||'set by a sample loader';
      did.push('made "'+(pick.name||pick.asset_id)+'" the active asset');
    }
  }
  var s=caseSignature();
  if(s && s.hazard_id==null){
    try{ if(AGN.hazard && AGN.hazard.set) AGN.hazard.set(opts.hazard||'flood','sample'); }catch(_){ }
    s=caseSignature();
    if(s && s.hazard_id!=null) did.push('selected the '+s.hazard_id+' hazard');
  }
  if(s && (s.horizon_id==null || caseLeadSegment(s.lead_hours, s.horizon_id)==null)){
    try{ if(AGN.timeSelection && AGN.timeSelection.set)
           AGN.timeSelection.set(opts.horizon||'now', (opts.lead_hours!=null?opts.lead_hours:0), 'sample'); }catch(_){ }
    s=caseSignature();
    if(s && s.horizon_id!=null) did.push('set the decision time to '+s.horizon_id);
  }
  var id=caseId(), a2=activeAsset();
  try{ document.dispatchEvent(new CustomEvent('agn:project',{detail:{reason:'sample-subject'}})); }catch(_){ }
  return { ok:id!=null, case_id:id, did:did,
           asset:a2?(a2.name||a2.asset_id):null, hazard:s?s.hazard_id:null, horizon:s?s.horizon_id:null,
           why:(id!=null?null:caseIdRefusal(caseSignature())) };
}
try{ AGN.decisionCase={ completeSubject:caseCompleteSubject, signature:caseSignature, id:caseId, idFrom:caseIdFrom,
                        projectId:projectId,
                        integrity:caseIntegrity,
                        mismatch:caseMismatch, horizonStatus:horizonStatus,
                        write:caseWrite,
                        bind:caseBind,
                        evidence:caseEvidence,
                        latest:caseLatest,
                        rebindUnbound:caseRebindUnbound, rebindTo:caseRebindTo,
                        stores:function(){ return CASE_STORES.slice(); } }; }catch(_){}









var DEMO_CASE_ID='AGN-DEMO';


function demoMark(rec){ rec=rec||{}; rec.demo=true; rec.demo_case=DEMO_CASE_ID;
  if(rec.source==null) rec.source='DEMONSTRATION case loader / illustrative values, not a client submission';
  return rec; }


function demoAdoptExisting(){
  try{
    var p=project(); if(!p) return 0;
    var res=caseRebindTo({maxDimensions:2, keepAsset:true});
    var n=0, id=caseId();
    CASE_STORES.forEach(function(d){
      (Array.isArray(p[d.store])?p[d.store]:[]).forEach(function(rec){
        if(!rec || String(rec.decision_case_id)!==String(id)) return;
        if(rec.demo!==true){ demoMark(rec); rec.demo_adopted=true; n++; }
      });
    });
    return n;
  }catch(e){ agnDiag('demo','adopt-existing', e); return 0; }
}
function loadDemoCase(){
  try{
    var p=project(); if(!p) return null;

    

    p.company=p.company||{};
    

    p.project_mode='demonstration';
    

    p.company.client_name='DEMONSTRATION \u2014 AJG Supplies (sample sites, invented values)';

    

    p.assets=window.samplePortfolio();
    p.company.active_asset_id='DEMO-A1';
    p.company.active_asset_basis='set by the Complete Demo Case';
    try{ if(AGN.assets&&AGN.assets.load) AGN.assets.load(p.assets,'demo case'); }catch(_){}
    

    try{ caseCompleteSubject({ client_name:p.company.client_name, sample:true }); }catch(_){}

     
    try{ if(AGN.timeSelection) AGN.timeSelection.set('short',24,'demo-case'); }catch(_){}
    try{ if(aiAdapter&&aiAdapter.setSelectedHazard) aiAdapter.setSelectedHazard('Flood'); }catch(_){}

    var a=p.assets[0];
     
    CASE_STORES.forEach(function(d){ p[d.store]=[]; });

    

    try{ var _hp=document.getElementById('mapHazardPick'); if(_hp&&_hp.value!=='flood'){ _hp.value='flood'; _hp.dispatchEvent(new Event('change',{bubbles:true})); } }catch(_){}
    try{ if(AGN.project&&AGN.project.setActiveAsset) AGN.project.setActiveAsset('DEMO-A1'); }catch(_){}
    AGN.decisionCase.write('spatial_inputs', caseBind(demoMark({
      kind:'client_point', name:'Sheikhupura farm house gate',
      latitude:31.7131, longitude:73.9783, feature_type:'site_entrance',
      asset_id:'DEMO-A1', outside_national_grid:false,
      crs:'EPSG:4326', created_at:new Date().toISOString() })));

    AGN.decisionCase.write('spatial_evidence', caseBind(demoMark({
      kind:'spatial_selection', operation:'demo_case', feature_count:1,
      asset_id:'DEMO-A1', asset_name:a.name,
      provenance:'DEMONSTRATION boundary; no score was written back',
      created_at:new Date().toISOString() }),'Flood'));

    AGN.decisionCase.write('scenario', caseBind(demoMark({
      kind:'scenario_sweep', hazard:'flood', preset:'wet-season stress',
      samples:500, unit:'Sheikhupura',
      core:[{id:'rain24',label:'24 h rainfall',p10:41,p50:78,p90:126}],
      advanced:[{id:'soil',label:'Root-zone wetness',p10:0.19,p50:0.28,p90:0.35}],
      probability_boundary:'uniform sensitivity envelope; not event probability',
      created_at:new Date().toISOString() }),'Flood'));

    

    AGN.decisionCase.write('ai_decisions', caseBind(demoMark({
      kind:'ai_decision',
      provider:'DEMONSTRATION - no backend was contacted',
      model:'NIGRAAN demonstration interface response',
      

      model_version:'demonstration-'+String(window.AGN_VERSION||''),
      deterministic:true,
      prompt_contract_version:'nigraan-ai-prompt-1',
      prompt:'What does the recorded evidence support for this asset?',
      structured_conclusion:{ answer:'DEMONSTRATION narrative. The recorded flood '
        +'screening and the scenario sweep are recorded against the same site. No operational conclusion is '
        +'issued from a demonstration package.',
        sources:['demonstration hazard_evidence row','demonstration scenario row'] },
      

      input_evidence_ids:(function(){
        var out=[];
        try{
          ['hazard_evidence','scenario'].forEach(function(st){
            (AGN.decisionCase.evidence(st)||[]).forEach(function(r){
              if(r && r.evidence_id) out.push(r.evidence_id);
            });
          });
        }catch(_){ }
        return out;
      })(),
      citations:['demonstration evidence only'],
      output_hash:(function(){
        try{
          var body='DEMONSTRATION narrative. The recorded flood screening and the '
                 + 'scenario sweep are recorded against the same site.';
          return (AGN.hash && AGN.hash.sha256) ? ('sha256:'+AGN.hash.sha256(body)) : null;
        }catch(_){ return null; }
      })(),
      human_review_required:false,
      limitations:'DEMONSTRATION text in the shape of a governed AI record; it '
        +'carries no analysis and may not be cited. Every governance field is '
        +'populated so the demonstration exercises the same contract a live '
        +'record must satisfy.',
      error:null,
      human_review_status:'unreviewed', reviewer:null, reviewed_at:null,
      generated_at:new Date().toISOString(),
      created_at:new Date().toISOString() })));

    

    AGN.decisionCase.write('engineering_evidence', caseBind(demoMark({
      kind:'design_condition',
      parameter:'design-basis air temperature',
      unit:'degC',
      baseline_value:44.2,
      baseline_statistic:'DEMONSTRATION summer daily-maximum climatology',
      baseline_window_from:'1991', baseline_window_to:'2020',
      baseline_sample_n:30, baseline_source:'DEMONSTRATION - no observation series was read',
      scenario_horizon:'2050', scenario_offset_c:1.7,
      scenario_offset_basis:'fixed national screening offset, uniform across Pakistan; '
        +'a direction screen, not a downscaled projection for this unit',
      design_value:45.9,
      rated_limit_c:45.0,
      unit_name:'DEMONSTRATION - AJG farm house, Sheikhupura',
      uncertainty:'none attached: a single declared planning figure, not a distribution',
      limits:'DEMONSTRATION screening value. A production engineering value needs '
            +'quality-controlled observations, an extreme-value method, an uncertainty '
            +'interval and code review.',
      source:'DEMONSTRATION engineering conditions',
      created_at:new Date().toISOString() })));

    AGN.decisionCase.write('climate_evidence', caseBind(demoMark({
      kind:'cmip6_delta', calculation_id:'AGN-CMIP6-DEMO',
      window:'2050s', baseline:'1991-2010', models:6,
      per_model:{ temperature_delta_c:[{model:'DEMONSTRATION',delta:1.9}],
                  precipitation_delta_percent:[{model:'DEMONSTRATION',delta:11}] },
      provenance:'DEMONSTRATION values in the shape the live CMIP6 record uses',
      probability_boundary:'planning context, never an engineering design value',
      created_at:new Date().toISOString() })));

    try{ D.dispatchEvent(new CustomEvent('agn:project',{detail:{reason:'demo-case'}})); }catch(_){}
    try{ D.dispatchEvent(new CustomEvent('agn:assets',{detail:{reason:'demo-case'}})); }catch(_){}
    

    var _adopted=demoAdoptExisting();
    return { loaded:true, stores:CASE_STORES.length, case_id:caseId(),
             adopted:_adopted };
  }catch(e){ return null; }
}
try{ AGN.demo={ load:loadDemoCase, caseId:DEMO_CASE_ID }; }catch(_){}



try{ AGN.executiveReadiness=function(){
  var _liveCi=null; try{ _liveCi=caseIntegrity(); }catch(e){ agnDiag('readiness','integrity', e); }
  return { scenario:scenarioReady(), ai:aiReady(), spatial:spatialReady(), horizon:horizonReady(),
           issuable:!!(_liveCi&&_liveCi.issuable),
           report_ready:!!(_liveCi&&_liveCi.report_ready&&_liveCi.report_ready.ok),
           horizon_operational:!(_liveCi&&_liveCi.horizon_not_operational),
           why:(_liveCi&&_liveCi.why)||null,
           case_id:(AGN.decisionCase&&AGN.decisionCase.id?AGN.decisionCase.id():null) };
}; }catch(_){}
function wire(){buildStory();tabs();cmip();D.addEventListener('agn:view',function(e){var v=e&&e.detail&&e.detail.view;if(v)paintStory(v)});['agn:project','agn:time-selection','agn:layer','agn:location','agn:spatial-evidence'].forEach(function(ev){D.addEventListener(ev,function(){var b=D.querySelector('#machNav button.active');paintStory(b&&b.dataset.goto||'overview')})});paintStory('overview')}
AGN.journey={flow:FLOW,context:context,go:go};
if(D.readyState==='loading')D.addEventListener('DOMContentLoaded',wire);else wire();
})(window);