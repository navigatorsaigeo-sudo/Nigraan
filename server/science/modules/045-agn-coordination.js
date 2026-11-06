

(function(){
  if(typeof window.AGN==='undefined') window.AGN={};
  if(AGN.flow) return;

  function emit(name, detail){
    try{ document.dispatchEvent(new CustomEvent(name,{detail:detail})); }catch(_){}
  }

  

  var LOC={ name:null, lat:null, lon:null, src:null, at:0 };

  function setActiveLocation(s, label, opts){
    if(!s) return;
    opts=opts||{};
    LOC={ name:s.name||label||null, lat:s.lat, lon:s.lon, src:opts.src||'unknown', at:Date.now() };
    if(!opts.baseAlreadyApplied){
      try{ if(window.aiState) aiState.station=s; }catch(_){}
      try{ if(window.AGN&&AGN.data&&s.lat!=null) AGN.data.setActive(s); }catch(_){}
}
    emit('agn:location', {station:s, label:label||s.name, src:LOC.src});
  }
  AGN.flow={ location:function(){ return LOC; }, setActiveLocation:setActiveLocation };

  

  ['selectCity','applyActiveStation'].forEach(function(fn){
    var base=window[fn];
    if(typeof base!=='function' || base.__v72) return;
    var w=function(){
      var r=base.apply(this,arguments);
      try{
        var s=null, label=null;
        if(fn==='applyActiveStation'){ s=arguments[0]; label=arguments[1]; }
        else {
          var id=arguments[0];
          if(window.STATIONS) s=STATIONS.find(function(x){return x.id===id;});
          if(s&&typeof effStation==='function') s=effStation(s);
        }
        if(s) setActiveLocation(s, label, {src:fn, baseAlreadyApplied:(fn==='selectCity')});
      }catch(_){}
      return r;
    };
    w.__v72=true; window[fn]=w;
  });

  

  function syncAssessments(){
    try{
      var sel=document.getElementById('asmtLocation');
      var id=(window.activeStationId&&window.activeStationId())||window.selectedId;
      if(sel&&id&&sel.value!==id){
        var has=[].slice.call(sel.options).some(function(o){return o.value===id;});
        if(has){ sel.value=id; sel.dispatchEvent(new Event('change',{bubbles:true})); }
      }
       
      

    }catch(_){}
  }
  document.addEventListener('agn:location', function(){ setTimeout(syncAssessments, 260); });

  

  var WORK={ assessment:null, modellab:null };
  AGN.work={
    get:function(){ return WORK; },
    publishAssessment:function(a){ if(!a) return; WORK.assessment=a; emit('agn:assessment', a); },
    publishModelLab:function(m){ if(!m) return; WORK.modellab=m; emit('agn:modellab', m); }
  };

  


  

  document.addEventListener('agn:assessment', function(e){
    var a=e.detail, host=document.getElementById('opsxDecisionChain');
    if(!a||!host) return;
    var id='opsxAsmtContext', el=document.getElementById(id);
    if(!el){ el=document.createElement('div'); el.id=id; el.className='opsx-chain';
             el.style.cssText='margin-bottom:10px;border-left:3px solid #5B9AA0;padding-left:10px';
             host.parentNode.insertBefore(el, host); }
    el.innerHTML='<div style="font-size:0.75rem;font-weight:800;letter-spacing:.06em;'
      +'text-transform:uppercase;color:#5d7684;margin-bottom:3px">Operating against assessment</div>'
      +'<div style="font-size:0.75rem;color:#222"><b>'+(a.locationName||a.location||'—')+'</b> &middot; '
      +(a.asset||'—')+' &middot; lead hazard <b>'+(a.leadHazard||'—')+'</b> '+(a.leadScore||'')
      +' &middot; priority '+(a.priority||'—')+' &middot; confidence '+(a.confidence||'—')
      +(a.horizon?' &middot; '+a.horizon:'')+'</div>';
  });

   
  

  document.addEventListener('agn:modellab', function(e){
    

    var m=e.detail,
        host=document.querySelector('.cfe-baseline-strip');
    if(!m||!host) return;
    var id='cfeMlInherit', el=document.getElementById(id);
    if(!el){ el=document.createElement('div'); el.id=id;
             el.style.cssText='grid-column:1/-1;border-left:3px solid #5B9AA0;padding:6px 0 6px 10px;margin-bottom:6px';
             host.insertBefore(el, host.firstChild); }
    

    try{ var _ap=AGN.dataServices&&AGN.dataServices.require('domain').activePoint(), _ml=m.location||{};
      var _same = (_ml.lat!=null&&_ap&&_ap.lat!=null) ? (Math.abs(_ml.lat-_ap.lat)<0.05&&Math.abs(_ml.lon-_ap.lon)<0.05)
                : !(_ap&&_ap.name&&_ml.name) || String(_ap.name).toLowerCase()===String(_ml.name).toLowerCase();
      if(!_same){ el.innerHTML='<div style="font-size:0.75rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#5d7684">Model comparison baseline (read-only)</div>'
        +'<div style="font-size:0.75rem;color:#222">not shown: the last model comparison is for '+String(_ml.name||'another place').replace(/[<>&]/g,'')+', not for '+String(_ap.name||'the selected place').replace(/[<>&]/g,'')+'. Open Evidence &amp; Methods to compute it here.</div>'; return; } }catch(_){}
    el.innerHTML='<div style="font-size:0.75rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;'
      +'color:#5d7684">Model comparison baseline (read-only)</div>'
      +'<div style="font-size:0.75rem;color:#222">'+((m.location&&m.location.name)||'—')+' &middot; '+(m.variableLabel||m.variable||'')
      +' raw <b>'+(m.raw==null?'—':(+m.raw).toFixed(1)+(m.unit||''))+'</b> &rarr; fused <b>'
      +(m.fused==null?'—':(+m.fused).toFixed(1)+(m.unit||''))+'</b>'
      +' &middot; diagnostics available &middot; '+(m.region||'')
      +'<span style="color:#7b8c96"> &middot; scenarios here cannot write back into operational scores</span></div>';
  });

  

  document.addEventListener('agn:hazard', function(){
    setTimeout(function(){
      try{
        var k=(window.AGN&&AGN.hazard)?AGN.hazard.get():null; if(!k) return;
        if(typeof updateLayerMeta==='function' && typeof fillMetaKey==='function')
          updateLayerMeta(fillMetaKey(k));
      }catch(_){}
    }, 60);
  });

  

  function timeBadge(){
    var off=(typeof window.DAY_OFFSET==='number')?window.DAY_OFFSET:0;
    var host=document.getElementById('timeDateLabel'); if(!host) return;
    var id='agnTimeNote', el=document.getElementById(id);
    if(!el){ el=document.createElement('span'); el.id=id;
      el.style.cssText='margin-left:8px;font-size:0.75rem;font-weight:800;letter-spacing:.04em;'
        +'text-transform:uppercase;padding:2px 7px;border-radius:5px;background:#fdf0d5;color:#8a6410';
      host.parentNode.insertBefore(el, host.nextSibling); }
    if(off===0){ el.style.display='none'; }
    else { el.style.display='inline-block';
           el.textContent='Conditions only \u00b7 hazard scores remain present-day';
           el.title='The historical slider replays observed conditions. Hazard scores are not '
             +'recomputed for a past date because the scoring engine has no day argument yet, '
             +'so every 0-100 score on screen is still today\u2019s.'; }
  }
  var _sl=document.getElementById('timeSlider');
  if(_sl){ _sl.addEventListener('input', function(){ setTimeout(timeBadge,80); });
           _sl.addEventListener('change', function(){ setTimeout(timeBadge,80); }); }
  setTimeout(timeBadge, 2500);

  


  

  ['agn:river','agn:flood'].forEach(function(ev){
    document.addEventListener(ev, function(){
      try{ var ov=AGN.services&&AGN.services.get('overview'); if(ov) ov.refresh({reason:ev}); }catch(_){}
    });
  });
  document.addEventListener('agn:sector', function(){
    try{ var ai=AGN.services&&AGN.services.get('airisk'); if(ai) ai.refresh({reason:'agn:sector'}); }catch(_){}
    setTimeout(function(){try{var as=AGN.services&&AGN.services.get('assessments');if(as)as.refresh({reason:'agn:sector'});else syncAssessments();}catch(_){syncAssessments();}},200);
  });

  

  document.addEventListener('agn:hazard', function(){
    setTimeout(function(){

      try{ var ov=AGN.services&&AGN.services.get('overview'); if(ov) ov.refresh({reason:'agn:hazard'}); }catch(_){}
    }, 500);
  });

  if(window.console&&console.info) console.info('[AI GEO NIGRAAN v74] correlation layer active \u00b7 AGN.flow, AGN.work, AGN.net');
})();
