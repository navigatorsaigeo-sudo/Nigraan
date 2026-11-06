
(function(G){
'use strict';
var D=G.document,AGN=G.AGN=G.AGN||{},SEL={leadHours:null,source:'init'};

var CLIMATE_CONTEXT={
  y2030:{label:'2030s climate direction screen',why:'Seven-model HighResMIP deltas are available as context, statistically downscaled and linearly bias-corrected to land reanalysis by the provider. What is NOT available is a validated multi-scenario planning projection: this is one high-emission trajectory, unvalidated for Pakistan.'},
  y2050:{label:'2050s climate direction screen',why:'Seven-model HighResMIP deltas are available as context, statistically downscaled and linearly bias-corrected to land reanalysis by the provider. What is NOT available is a validated multi-scenario planning projection: this is one high-emission trajectory, unvalidated for Pakistan.'}
};
var CONTEXT_VIEWS={
  livedata:true,assessments:true,hybridlab:true,report:true,airisk:true,modelab:true
};
var ALWAYS_CONTEXT={modelab:true};



var VIEW_BLOCK_REASON={
  operations:function(h){ return 'Operations assigns actions with owners and due dates. '
    +'A '+h.label+' horizon cannot drive tasking: there is no shift to brief and no '
    +'asset state to act on. Press Return to Now below, or choose Now, 6 hours, '
    +'24 hours or 3 days on the horizon strip once this view is usable again \u2014 '
    +'that strip is hidden while this refusal is showing.'; },
  overview:function(h){ return 'The national board colours 576 tehsils from current and '
    +'short-range hazard scores. A '+h.label+' horizon produces no such score, and a map '
    +'drawn from nothing is indistinguishable from a map drawn from calm weather. '
    +'Use Now or a short-range day.'; },
  _default:function(h){ return 'This workspace has no product at a '+h.label+' horizon.'; }
};
function modeFor(view,h){
  if(h.available) return 'full';
  if(CLIMATE_CONTEXT[h.id] && CONTEXT_VIEWS[view]) return 'context';
  if(ALWAYS_CONTEXT[view]) return 'context';
  return 'blocked';
}
function set(id,lead,source){
  if(!AGN.timeContext)return;
  SEL.leadHours=lead==null?null:Number(lead);SEL.source=source||'ui';
  var r=AGN.timeContext.set(id);
  try{D.dispatchEvent(new CustomEvent('agn:time-selection',{detail:{horizon:id,leadHours:SEL.leadHours,source:SEL.source}}));}catch(_){}
  paint();return r;
}
function paint(){
  if(!AGN.timeContext)return;
  var h=AGN.timeContext.get(),cl=CLIMATE_CONTEXT[h.id],txt=h.label+(SEL.leadHours!=null?' · +'+SEL.leadHours+' h':'');
  var b=D.getElementById('agnGlobalTime');
  if(!b){b=D.createElement('div');b.id='agnGlobalTime';b.className='agn-global-time';var nav=D.getElementById('machNav');if(nav&&nav.parentNode)nav.parentNode.insertBefore(b,nav.nextSibling);}
  if(h.available){
    b.textContent=txt+' · '+h.product;b.classList.remove('bad','context');
  }else if(cl){
    b.textContent=txt+' · CONTEXT ONLY · '+cl.label+' · validated planning projection unavailable';
    b.classList.remove('bad');b.classList.add('context');
  }else{
    b.textContent=txt+' · UNAVAILABLE: '+(h.why||'unsupported horizon');
    b.classList.add('bad');b.classList.remove('context');
  }

  

  try{ D.documentElement.setAttribute('data-agn-horizon', String(h.id||'')); }catch(_){}
   
  try{ D.documentElement.classList.toggle('agn-internal-tier',
         !!(window.AGN_BUILD && window.AGN_BUILD.credential_embedded===true)); }catch(_){}
  D.querySelectorAll('.view[data-view]').forEach(function(v){
    var name=v.dataset.view,m=modeFor(name,h);
    var refusal=v.querySelector(':scope > .agn-horizon-refusal');
    if(!refusal){refusal=D.createElement('div');refusal.className='agn-horizon-refusal';v.insertBefore(refusal,v.firstChild);}
    var context=v.querySelector(':scope > .agn-horizon-context');
    if(!context){context=D.createElement('div');context.className='agn-horizon-context';v.insertBefore(context,refusal.nextSibling);}

    v.classList.remove('agn-horizon-unavailable','agn-horizon-blocked','agn-horizon-contextual');
    if(m==='blocked'){
      

      refusal.textContent='';
      var why=D.createElement('b'); why.className='agn-horizon-why';
      why.textContent=(VIEW_BLOCK_REASON[name]||VIEW_BLOCK_REASON._default)(h);
      refusal.appendChild(why);
      var note=D.createElement('span');
      note.textContent=AGN.timeContext.unavailableNotice(h.id);
      refusal.appendChild(note);
      var back=D.createElement('button');
      back.type='button'; back.className='agn-horizon-back';
      back.textContent='Return to Now';
      back.addEventListener('click',function(){ set('now',null,'horizon-refusal'); });
      refusal.appendChild(back);
      v.classList.add('agn-horizon-blocked');
      context.textContent='';
    }else if(m==='context'){
      refusal.textContent='';
      v.classList.add('agn-horizon-contextual');
      if(cl){
        if(name==='livedata') context.textContent=cl.why+' CMIP6/HighResMIP below remains usable as a direction screen; weather-forecast panels above do not become '+h.label+' forecasts.';
        else if(name==='hybridlab') context.textContent=cl.why+' Scenario & Stress may use this horizon as declared context, but must not present it as a calibrated asset projection.';
        else if(name==='report') context.textContent=cl.why+' A report issued now carries this limitation.';
        else context.textContent=cl.why;
      }else{
        context.textContent='This workspace can remain available for evidence or governance at the selected horizon, but it does not create the missing scientific product.';
      }
    }else{
      refusal.textContent='';context.textContent='';
    }
  });
}
function wire(){
  var ops=D.getElementById('opsxHorizon');
  if(ops){
    ops.querySelectorAll('button[data-horizon="6"],button[data-horizon="24"],button[data-horizon="72"]').forEach(function(b){b.removeAttribute('aria-disabled');b.removeAttribute('data-backend-key');b.setAttribute('role','tab');});
    ops.querySelectorAll('button[data-horizon]').forEach(function(b){b.setAttribute('role','tab');});
    ops.addEventListener('click',function(e){var b=e.target.closest('button[data-horizon]');if(!b||b.getAttribute('aria-disabled')==='true')return;var x=b.dataset.horizon;if(x==='now')set('now',null,'operations');else if(['6','24','72'].indexOf(x)>=0)set('short',Number(x),'operations');else if(x==='seasonal')set('seasonal',null,'operations');else if(x==='2030')set('y2030',null,'operations');else if(x==='2050')set('y2050',null,'operations');});
  }
  

  var days=D.getElementById('v3days');
  if(days)days.addEventListener('click',function(e){
    var b=e.target.closest('button');if(!b)return;
    if(AGN.day && typeof AGN.day.publishHorizon==='function'){
      

      setTimeout(function(){ try{ AGN.day.publishHorizon(); }catch(_){ } }, 0);
      return;
    }
    if(b.dataset.basis==='current'||b.dataset.basis==='peak')set('now',null,'overview');
    else if(b.dataset.d!=null)set('short',(Number(b.dataset.d)||0)*24,'overview');
  });
  var ai=D.getElementById('aiLeadSeg');if(ai)ai.addEventListener('click',function(e){var b=e.target.closest('button[data-lead]');if(b&&b.getAttribute('aria-disabled')!=='true')set('short',Number(b.dataset.lead),'ai');});
  D.addEventListener('agn:horizon',paint);paint();
}
AGN.timeSelection={
  state:function(){var h=AGN.timeContext?AGN.timeContext.get():null;return{horizon:h?h.id:null,leadHours:SEL.leadHours,source:SEL.source,scientific_available:!!(h&&h.available),context_only:!!(h&&CLIMATE_CONTEXT[h.id])};},
  set:set,modeFor:function(view){return AGN.timeContext?modeFor(view,AGN.timeContext.get()):'blocked';}
};
if(D.readyState==='loading')D.addEventListener('DOMContentLoaded',wire);else wire();
})(window);
