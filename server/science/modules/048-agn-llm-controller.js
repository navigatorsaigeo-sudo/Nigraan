
(function(){
  'use strict';
  var cfg=window.NIGRAAN_LLM_CONFIG=window.NIGRAAN_LLM_CONFIG||{endpoint:'',model:'',timeoutMs:45000};

  

  var AGNX = window.AGN = window.AGN || {};
  AGNX.aiExecutionMode = function(){
    var ep = '';
    try{ ep = String((window.NIGRAAN_LLM_CONFIG||{}).endpoint || ''); }catch(_){ ep = ''; }
    var configured = !!ep;
    return {
      configured: configured,
      mode: configured ? 'backend' : 'local-deterministic',
      label: configured ? 'AI BACKEND CONFIGURED'
                        : 'LOCAL DETERMINISTIC / RULE-BASED ONLY',
      why: configured
        ? 'A reasoning backend is configured. Responses may use it, subject to its own '
          + 'evidence contract, and nothing here relaxes the rules the rest of this build '
          + 'applies to a number.'
        : 'No reasoning backend is configured. Every explanation in this section is '
          + 'deterministic product logic over the engine\u2019s own outputs. It must not be '
          + 'presented, quoted or exported as model reasoning.',
      model: configured ? (String((window.NIGRAAN_LLM_CONFIG||{}).model||'') || null) : null
    };
  };

  

  AGNX.aiNumberFirewall = Object.freeze({
    version: '91.17',
    rule: 'a language model in this product explains numbers this build issued. It does '
        + 'not produce them, and it does not stand in for a stage nobody has calibrated. '
        + 'A model can write a plausible damage ratio in a fluent sentence, and a fluent '
        + 'sentence is the form in which an uncalibrated number is most readily believed.',
    governed: Object.freeze(['hazard_score', 'damage_ratio', 'functionality_loss',
                             'service_disruption', 'downtime',
                             'exceedance_probability', 'return_period']),
    permitted: Object.freeze(['explanation', 'comparison_of_issued_numbers',
                              'ranking_of_named_drivers', 'question', 'summary',
                              'restatement_of_refusal']),
    defaultVerdict: 'deny',
    why: 'the governed list is what this build computes under its own contract; the '
       + 'permitted list is what a model may do with the result. Anything in neither list '
       + 'is denied, because the failure this prevents is a kind of number nobody '
       + 'anticipated arriving in prose.'
  });
  AGNX.aiMayEmit = function(kind){
    var k = String(kind == null ? '' : kind).trim().toLowerCase();
    if (!k) return false;
    var F = AGNX.aiNumberFirewall, i;
    for (i = 0; i < F.governed.length; i++) if (F.governed[i] === k) return false;
    for (i = 0; i < F.permitted.length; i++) if (F.permitted[i] === k) return true;
    return false;
  };

  function mountAiMode(){
    var sec=document.getElementById('nigraanLlmSection');
    if(!sec || document.getElementById('agnAiExecMode')) return;
    var m=AGNX.aiExecutionMode();
    var el=document.createElement('div');
    el.id='agnAiExecMode';
    el.className='agn-intake-strip';
    el.setAttribute('data-ai-exec-mode', m.mode);
    var fw=AGNX.aiNumberFirewall;
    el.setAttribute('data-ai-firewall', String(fw.governed.length));
    el.innerHTML='<span class="agn-intake-eyebrow">AI execution mode</span>'
      + '<b>'+esc(m.label)+'</b>'
      + '<span class="agn-intake-status">'+esc(m.why)+'</span>'
      + '<span class="agn-intake-status" id="agnAiFirewallLine">Governed numbers this '
      + 'section may not produce ('+fw.governed.length+'): '
      + esc(fw.governed.join(', ').replace(/_/g,' '))
      + '. Anything not named as permitted is denied.</span>';
    sec.insertBefore(el, sec.firstChild);
  }
  if(document.readyState==='loading')
    document.addEventListener('DOMContentLoaded', mountAiMode);
  else mountAiMode();
  try{ document.addEventListener('agn:project', mountAiMode); }catch(_){}
  var $=function(id){return document.getElementById(id);};
  function text(id,fallback){var e=$(id);return e&&e.textContent.trim()?e.textContent.trim():fallback;}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function context(){
    

    var loc=text('ccLoc',text('aiCity','Selected location'));
    var aiLoc=text('aiCity','');
    var _agree = (!aiLoc || !loc || aiLoc==='—' || loc==='—')
                 ? true
                 : (String(aiLoc).trim().toLowerCase()===String(loc).trim().toLowerCase());
    if(!_agree){
      return {
        location:loc,
        temperature:text('ccTemp','—')+'°C',
        condition:text('ccCond','Current condition unavailable'),
        feels:text('ccFeels','—'), humidity:text('ccHum','—'), wind:text('ccWind','—'), rain:text('ccRain','—'),
        riskScore:'—', riskBand:'not available for this location', driver:'—',
        mismatch:true,
        mismatchWhy:'the screening panel currently holds '+aiLoc+' while the conditions panel '
                   +'holds '+loc+'. No score is reported until they agree.',
        forecast:text('hourSub',loc+' · next 24 hours'),
        freshness:(document.querySelector('.freshness')||{}).textContent||'Data timestamp unavailable'
      };
    }
    return {
      location:loc, mismatch:false,
      temperature:text('ccTemp','—')+'°C',
      condition:text('ccCond','Current condition unavailable'),
      feels:text('ccFeels','—'), humidity:text('ccHum','—'), wind:text('ccWind','—'), rain:text('ccRain','—'),
       
      riskScore:((window.AGN&&AGN.p75&&AGN.p75.ctx)?'\u2014':text('aiRiskScore','\u2014')), riskBand:((window.AGN&&AGN.p75&&AGN.p75.ctx)?AGN.p75.ctx().text:text('aiBand','\u2014')), hazardIndex:((window.AGN&&AGN.p75&&AGN.p75.ctx)?AGN.p75.ctx().index:null), driver:text('aiTopDriver','—'),
      forecast:text('hourSub',loc+' · next 24 hours'), freshness:(document.querySelector('.freshness')||{}).textContent||'Data timestamp unavailable',
      

      asset:(function(){ try{ var a=AGN.project&&AGN.project.activeAsset&&AGN.project.activeAsset(); return a?{ id:a.asset_id, name:a.name, type:a.asset_type||null, industry:a.industry||null, lat:a.latitude, lon:a.longitude }:null; }catch(_){ return null; } })(),
      actions:(function(){ try{ return (AGN.actions&&AGN.actions.list)?AGN.actions.list().slice(0,12).map(function(r){ return { id:r.action_id, source:r.source, hazard:r.hazard, class:r.cls||null, trigger:r.trigger, chance:r.chance, prepareBy:r.prepare_by, action:r.action, owner:r.owner_role }; }):[]; }catch(_){ return []; } })()
    };
  }
  function sync(){
    var c=context();
    

    AGN_putRaw($('llmContextLocation'),'textContent',c.location);
    AGN_putRaw($('llmContextWeather'),'textContent',c.temperature+' · '+c.condition);
    AGN_putRaw($('llmContextRisk'),'textContent',(c.riskScore==='—'?c.riskBand:c.riskScore+' · '+c.riskBand));
    var status=$('nigraanLlmStatus');
    if(status&&cfg.endpoint){status.classList.add('connected');AGN_putRaw(status,'innerHTML','<span></span>Backend connector configured');}
  }
  function add(role,title,body,sources,opSources){
    var thread=$('nigraanLlmThread'); if(!thread)return;
    var article=document.createElement('article'); article.className='llm-message '+role;
    article.innerHTML=(role==='assistant'?'<div class="llm-avatar">AI</div>':'')+
      '<div class="llm-bubble"><b>'+esc(title)+'</b><p>'+esc(body)+'</p>'+
      (sources&&sources.length?'<div class="llm-source-row'+(opSources?' agn-op-only':'')+'">'+(opSources?'<span class="llm-op-tag">Operator · sources</span>':'')+sources.map(function(s){return '<span>'+esc(s)+'</span>';}).join('')+'</div>':'')+'</div>';
    thread.appendChild(article);thread.scrollTop=thread.scrollHeight;
  }
  function localAnswer(prompt,c){
    var q=prompt.toLowerCase();
    var prefix='Backend LLM is not connected. This is a deterministic interface response using the values currently loaded in the design.\n\n';
    if(q.indexOf('24')>-1||q.indexOf('forecast')>-1){
      return prefix+c.location+': '+c.temperature+', '+c.condition+'. Feels like '+c.feels+', humidity '+c.humidity+', wind '+c.wind+' and current rain '+c.rain+'. Review the 24-hour strip for hourly timing. A production LLM response will cite each forecast timestamp and provider run.';
    }
    if(q.indexOf('top risk')>-1||q.indexOf('driver')>-1||q.indexOf('why')>-1){
      return prefix+'Current AI screening context for '+c.location+' is '+c.riskScore+' ('+c.riskBand+'). The displayed leading driver is '+c.driver+'. This is a screening signal, not a probability or warning. A production response must retrieve the hazard formula, input timestamps, model version and evidence grade.';
    }
    if(q.indexOf('executive')>-1||q.indexOf('brief')>-1){
      return prefix+'Executive brief — '+c.location+': '+c.temperature+', '+c.condition+'. Current AI screening: '+c.riskScore+' ('+c.riskBand+'), leading driver '+c.driver+'. Immediate decision: review the next 24-hour timing and confirm evidence before operational escalation. Official actions require authorised human approval.';
    }
    if(q.indexOf('missing')>-1||q.indexOf('evidence')>-1||q.indexOf('gap')>-1){
      return prefix+'Before an operational advisory, verify local observations, provider run time, spatial coverage, model agreement, hazard-specific validation, exposed population or assets, responsible authority and expiry time. Any synthetic or proxy input must remain explicitly labelled.';
    }
    return prefix+'I can explain the selected location, the next 24 hours, AI risk drivers, model confidence, evidence gaps and executive briefing content. The production connector should use retrieval from NIGRAAN services rather than general model memory.';
  }
  

  function agnHazardVerdicts(need){
    var out=[];
    if(!need||!need.units||!need.layers) return out;
    var lead=(typeof aiState!=='undefined'&&aiState.lead)||24;
    for(var i=0;i<need.units.length;i++){
      var key=need.units[i].key;
      if(!key) continue;
      for(var j=0;j<need.layers.length;j++){
        var lay=need.layers[j];
        try{
          var inp=(typeof hzDayInput==='function')?hzDayInput(key,lay):null;
          if(!inp){ out.push({unit:key,hazard:lay,score:null,notApplicable:false,
            why:'this unit name is not in the hazard input table, so the engine was not run for it'}); continue; }
          if(inp.__unavailable){ out.push({unit:key,hazard:lay,score:null,
            why:'no forecast window for the selected day at this unit, so the engine reports it unavailable rather than scoring it'}); continue; }
          var r=(typeof aiDistrictRisk==='function')?aiDistrictRisk(inp,lay,lead,key):null;
          if(!r){ out.push({unit:key,hazard:lay,score:null,why:'the engine returned no result for this unit and layer'}); continue; }
          out.push({unit:key, hazard:lay,
            score:(r.screeningIndex!=null?r.screeningIndex:r.score),
            publishedScore:r.score,
            categorical:(r.categorical===true),
            band:(r.screeningBand||r.band||null),
             
            verdictClass:(function(){ try{ var sc=(r.screeningIndex!=null?r.screeningIndex:r.score); return (sc!=null && !r.categorical && window.AGN && AGN.hazardValue && AGN.hazardValue.verdictOf) ? AGN.hazardValue.verdictOf(sc, lay) : (r.categorical ? (r.category||null) : null); }catch(_){ return null; } })(),
            notApplicable:(r.noDataClass==='ineligible' || r.noDataClass==='undefined'),
            notDefined:(r.noDataClass==='undefined'),
            why:(r.noDataWhy||r.mapValueWhy||r.scaleWhy||null),
            basis:(r.kind?(r.kind+(r.scaleType?' · '+r.scaleType:'')):(r.scaleType||null)),
            day:(r.leadStatement||null)});
        }catch(e){ out.push({unit:key,hazard:lay,score:null,why:'the engine threw on this unit: '+(e&&e.message)}); }
      }
    }
    return out;
  }
  

  try{ if(window.AGN) AGN.hazardVerdicts=agnHazardVerdicts; }catch(_){}
  /* v91.17.266 · the dashboard place the server answers for when the question names none (interface 3) */
  function dashPlace(){ try{ var _p=AGN.data.activePoint(); if(!_p||_p.lat==null||!isFinite(+_p.lat)||!isFinite(+_p.lon)) return null;
      var nm=(AGN.place&&AGN.place.name&&AGN.place.name())||_p.name||null; return {name:nm?String(nm):null,lat:+_p.lat,lon:+_p.lon}; }catch(_){ return null; } }
  async function ask(prompt){
    var c=context();
    if(!cfg.endpoint)return {text:localAnswer(prompt,c),sources:['Loaded NIGRAAN interface data','Design-mode response','Human approval required']};
    

    var _askMs=cfg.timeoutMs||20000, ctrl, timer;
    var arm=function(){ clearTimeout(timer); ctrl=new AbortController();
      timer=setTimeout(function(){ ctrl.abort(new Error('the assistant did not answer within '+Math.round(_askMs/1000)+' s')); }, _askMs); };
    arm();
    try{
      var send=function(hc){ return AGN.api.fetch(cfg.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:cfg.model||undefined,prompt:prompt,context:Object.assign({},c,{point:(function(){ try{ var _p=AGN.data.activePoint(); return (_p&&_p.lat!=null)?{lat:+_p.lat,lon:+_p.lon}:null; }catch(_){ return null; } })(),place:dashPlace()}),hazardContext:hc||undefined,requirements:{grounded:true,citations:true,noWarningAuthority:true}}),signal:ctrl.signal}); };
      var res=await send(null);
      if(!res.ok){ var _why='', _retry=false; try{ var _ej=await res.json(); _why=_ej&&(_ej.why||_ej.error)?(' \u2014 '+(_ej.why||_ej.error)+(_ej.provider?' ('+_ej.provider+')':'')):''; _retry=!!(_ej&&_ej.retry); }catch(_){}
         
        if(_retry && !ask._retried){ ask._retried=true; try{ await new Promise(function(r){ setTimeout(r,3000); }); return await ask(prompt); } finally{ ask._retried=false; } }
        var _e=new Error('HTTP '+res.status+_why); _e.status=res.status; throw _e; }    
      var data=await res.json();
      

      if(data && data.needHazard){
        var hc=agnHazardVerdicts(data.needHazard);
        if(hc.length){
          arm();    
          var res2=await send(hc);
          if(res2.ok){ var d2=await res2.json(); if(d2 && (d2.answer||d2.text)) data=d2; }
        }
      }
      

      if(data && data.needNational && window.AGN && AGN.p75 && AGN.p75.national){
        var nc=null; try{ nc=AGN.p75.national(data.needNational); }catch(_){ nc=null; }
        if(nc && nc.hazards && Object.keys(nc.hazards).length){
          arm();
          var res3=await AGN.api.fetch(cfg.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:cfg.model||undefined,prompt:prompt,context:Object.assign({},c,{point:(function(){ try{ var _p=AGN.data.activePoint(); return (_p&&_p.lat!=null)?{lat:+_p.lat,lon:+_p.lon}:null; }catch(_){ return null; } })(),place:dashPlace()}),nationalContext:nc,requirements:{grounded:true,citations:true,noWarningAuthority:true}}),signal:ctrl.signal});
          if(res3.ok){ var d3=await res3.json(); if(d3 && (d3.answer||d3.text)) data=d3; }
        }
      }
      

      var _kind=(data&&data.kind)||'explanation';
      if(!AGNX.aiMayEmit(_kind)) return {text:'[Withheld: an answer of the kind "'+String(_kind).replace(/[<>&]/g,'')+'" is not one the assistant may produce.]',sources:['Client number firewall (aiMayEmit)']};
      if(data && data.provider && data.provider!=='retrieval' && !(data.firewall && data.firewall.slots)) return {text:'[Withheld: this answer came from a language model without the server number firewall (slot rendering). Restart the local server on the current build.]',sources:['Client number firewall']};
      /* interface 3: everything the server lists in operatorOnly (sources, notes, source chips, provenance) is shown in operator view only */
      var _op=Array.isArray(data.operatorOnly)?data.operatorOnly:[], _src=Array.isArray(data.sources)?data.sources.slice():['NIGRAAN backend'];
      (Array.isArray(data.sourceChips)?data.sourceChips:[]).forEach(function(ch){ var t=ch&&(ch.text||ch.label); if(t&&_src.indexOf(t)<0) _src.push(String(t)); });
      if(Array.isArray(data.notes)) data.notes.forEach(function(n){ if(n&&_src.indexOf(n)<0) _src.push(String(n)); });
      var _hide=_op.indexOf('sources')>=0||_op.indexOf('sourceChips')>=0||(Array.isArray(data.sourceChips)&&data.sourceChips.some(function(ch){ return ch&&ch.operatorOnly; }));
      return {text:data.answer||data.text||'No answer returned.',sources:_src,opSources:_hide};
    }finally{clearTimeout(timer);}
  }
  

  function recordAiDecision(prompt, out, mode, err){
    try{
      if(!(window.AGN && AGN.decisionCase && AGN.decisionCase.write)) return null;
      

      if(!(AGN.decisionCase.id && AGN.decisionCase.id())){
        try{ if(AGN.writeRefusal) AGN.writeRefusal('ai_decisions',
          'this AI answer was not recorded as evidence: '
          + ((typeof AGN.caseIdRefusal==='function')
               ? AGN.caseIdRefusal((AGN.decisionCase.signature&&AGN.decisionCase.signature())||{})
               : 'there is no decision case for it to belong to.')
          + ' The answer on screen is unaffected, and it may not be cited until it is '
          + 'recorded.'); }catch(_){ }
        return null;
      }
      var text = (out && out.text) || '';
      

      var hash = (function(t){
        try{ if(window.AGN && AGN.hash && AGN.hash.sha256) return 'sha256:'+AGN.hash.sha256(t); }
        catch(_){}
        return null;
      })(text);
      var ids = [];
      try{
        AGN.decisionCase.stores().forEach(function(d){
          if(d.store==='ai_decisions') return;
          (AGN.decisionCase.evidence(d.store)||[]).forEach(function(r){
            if(r && r.evidence_id) ids.push(r.evidence_id);
            else if(r && r.created_at) ids.push(d.store+'@'+r.created_at);
          });
        });
      }catch(_){ }
      return AGN.decisionCase.write('ai_decisions', {
        kind:'ai_decision',
        provider:(mode==='backend' ? (cfg.endpoint||'configured backend') : 'deterministic-local'),
        model:(mode==='backend' ? (cfg.model||'unnamed backend model') : 'NIGRAAN deterministic interface response'),
        model_version:(mode==='backend' ? (cfg.modelVersion||null) : String(window.AGN_VERSION||'')),
        prompt_contract_version:'nigraan-ai-prompt-1',
        prompt:String(prompt||''),
        structured_conclusion:{ answer:text, sources:(out&&out.sources)||[] },
        input_evidence_ids:ids,
        citations:(out&&out.sources)||[],
        output_hash:hash,
        limitations:(mode==='backend'
          ? 'a backend answer is not verified against the evidence it cites until a reviewer '
           +'checks it; this record is the answer, not an endorsement of it'
          : 'no model ran. This is a deterministic interface response assembled from values '
           +'already on screen, recorded so the decision case shows what step 09 actually '
           +'produced rather than implying a generative analysis that did not happen'),
        error:(err && err.message) || null,
        human_review_status:'unreviewed',
        reviewer:null, reviewed_at:null,
        source:(mode==='backend' ? 'NIGRAAN AI connector / configured backend'
                                 : 'NIGRAAN AI panel / deterministic interface response')
      });
    }catch(_){ return null; }
  }

  async function submit(prompt){
    prompt=String(prompt||'').trim();if(!prompt)return;
    add('user','You',prompt,[]);
    var input=$('nigraanLlmInput'),send=$('nigraanLlmSend');if(input)input.value='';if(send)send.disabled=true;
    try{
      var out=await ask(prompt);
      add('assistant','NIGRAAN Climate Analyst',out.text,out.sources,!!out.opSources);
      recordAiDecision(prompt, out, (cfg && cfg.endpoint) ? 'backend' : 'deterministic', null);
    }catch(err){
       
      var _st=(err&&err.status)||0, _title=_st===503?'Local model not running':(_st===504?'Model took too long':'Connector unavailable');
      add('assistant',_title,(_st===503?'Nothing answered at the local model address. ':(_st===504?'The model did not answer within the time allowed. ':'The configured LLM backend could not be reached. '))+(err&&err.message?err.message:'Unknown error')+'. No operational conclusion was generated.',[_st===503?'Provider not running':(_st===504?'Timeout':'Connection failure'),'No decision issued']);
      recordAiDecision(prompt, {text:'', sources:['connector unavailable']}, 'failed', err);
    }
    finally{if(send)send.disabled=false;sync();}
  }
  try{ (window.AGN=window.AGN||{}).aiRecord=recordAiDecision; }catch(_){}
  document.addEventListener('DOMContentLoaded',function(){
    sync();
    var form=$('nigraanLlmForm');if(form)form.addEventListener('submit',function(e){e.preventDefault();submit(($('nigraanLlmInput')||{}).value);});
    document.querySelectorAll('[data-llm-prompt]').forEach(function(btn){btn.addEventListener('click',function(){submit(btn.getAttribute('data-llm-prompt'));});});
    document.addEventListener('agn:location',sync);document.addEventListener('agn:data',sync);document.addEventListener('agn:hazard',sync);
    setInterval(sync,15000);
  });
})();
