
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const locationAdapter=window.AGN&&AGN.adapters?AGN.adapters.require('locationLegacy'):null;
  const storage=window.AGN&&AGN.dataServices?AGN.dataServices.require('storage'):null;
  const geo=window.AGN&&AGN.dataServices?AGN.dataServices.require('geography'):null;
  const domain=window.AGN&&AGN.dataServices?AGN.dataServices.require('domain'):null;
  const contracts=window.AGN&&AGN.dataServices?AGN.dataServices.require('contracts'):null;
  const actionWorkflow=window.AGN&&AGN.workflows?AGN.workflows.require('actions'):null;
  const outcomeWorkflow=window.AGN&&AGN.workflows?AGN.workflows.require('outcomes'):null;
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
  

  function opsNamespace(){
    try{
      var id=(window.AGN&&AGN.decisionCase&&AGN.decisionCase.projectId)
               ? AGN.decisionCase.projectId() : null;
      return id ? String(id) : 'unassigned';
    }catch(_){ return 'unassigned'; }
  }
  function actionKeyFor(){ return 'agn:operations:'+opsNamespace()+':actions:v2'; }
  function reviewKeyFor(){ return 'agn:operations:'+opsNamespace()+':reviews:v2'; }
  const opsLocal=(window.AGN&&AGN.sectionState)?AGN.sectionState.state('operations',{memoryActions:[],memoryReviews:[],activeHorizon:'now',activePane:'situation',actionFilter:'all'}):{memoryActions:[],memoryReviews:[],activeHorizon:'now',activePane:'situation',actionFilter:'all'};
  const hazardLabels={flood:'Flood',heat:'Heat stress',drought:'Drought',wind:'Wind and gusts',cold:'Cold stress (UTCI)',glof:'Glacial lake outburst flood (GLOF)',seismic:'Seismic',cyclone:'Cyclone'};
  const hazardColors={flood:'#2c7fb8',heat:'#e31a1c',drought:'#b45309',wind:'#0d9488',cold:'#3b82f6',glof:'#0891b2',seismic:'#b91c1c',cyclone:'#0f766e'};

  function load(key,fallback){const x=storage.get(key,fallback);return Array.isArray(x)?x:fallback;}
  function save(key,value){storage.set(key,value);}
  

  var _opsNs=null;
  function _nsGuard(){
    var ns=opsNamespace();
    if(_opsNs!==ns){ _opsNs=ns; opsLocal.memoryActions=[]; opsLocal.memoryReviews=[]; }
  }
  function actions(){_nsGuard();opsLocal.memoryActions=load(actionKeyFor(),opsLocal.memoryActions);return opsLocal.memoryActions;}
  /* v91.17.283.28 · P17 · ONE count of the action register: the Tracked-actions badge and "What changed" both read it */
  function actionCounts(){ const l=actions()||[]; return {total:l.length, active:l.filter(a=>a&&a.status!=='closed').length}; }
  function setActions(v){_nsGuard();opsLocal.memoryActions=v;save(actionKeyFor(),v);}
  function reviews(){_nsGuard();opsLocal.memoryReviews=load(reviewKeyFor(),opsLocal.memoryReviews);return opsLocal.memoryReviews;}
  function setReviews(v){_nsGuard();opsLocal.memoryReviews=v;save(reviewKeyFor(),v);}
  

  try{ (window.AGN=window.AGN||{}).operationsState=function(){
    return { namespace:opsNamespace(),
             actions:actions().length, reviews:reviews().length,
             addAction:function(a){ var l=actions().slice(); l.unshift(a); setActions(l); return l.length; },
             addReview:function(r){ var l=reviews().slice(); l.unshift(r); setReviews(l); return l.length; } };
  }; }catch(_){}
   
  function activeStation(){let s={};try{s=locationAdapter.activeStation()||{};}catch(_){s={};}
    try{const ap=(window.AGN&&AGN.data&&AGN.data.activePoint)?AGN.data.activePoint():null;
      if(ap&&ap.lat!=null&&ap.lon!=null&&isFinite(+ap.lat)&&isFinite(+ap.lon)){const o=Object.assign({},s,{name:ap.name||s.name,lat:+ap.lat,lon:+ap.lon});
        ['t','hum','rain','wind','gust'].forEach(function(k){ if(ap[k]!=null) o[k]=ap[k]; });
        if(ap.fetchedAt){ o.liveFetchedAt=ap.fetchedAt; if(!ap.pending) o.weatherLive=true; } if(ap.source) o.liveSource=ap.source==='selection'?(s.liveSource||null):ap.source; return o;}}catch(_){}
    return s;}
  function context(s){try{return locationAdapter.context(s);}catch(_){return {tehsil:'Point context',district:s&&s.name||'Active location',province:''};}}
  function verdicts(){try{return typeof window.allDistrictVerdicts==='function'?window.allDistrictVerdicts():(typeof allVerdicts==='function'?allVerdicts():[]);}catch(_){return [];}}
  function activeVerdict(){
    const s=activeStation(),c=context(s),vs=verdicts();
    const norm=x=>String(x||'').trim().toLowerCase();
    let v=vs.find(x=>norm(x.name)===norm(c.district))||vs.find(x=>norm(x.district)===norm(c.district));
    if(!v&&c.district)v=geo.rollupVerdict(c.district);
    if(v)return v;
    return {name:c.district||c.tehsil||(s&&s.name)||'Unresolved location',district:c.district||null,tehsil:c.tehsil||null,unitLevel:'unresolved',prov:c.province||'',top:{hazard:null,score:null,band:'No Data',color:'#8b7aa8'},verdict:'No Data',action:'Resolve the active administrative unit before generating an action.',why:'No operational verdict resolved for the selected location.',confidence:null,spatialCoverage:0};
  }
  function hazardLabel(h){if(h==null||h==='null'||h==='')return 'no hazard resolved yet'; try{return (typeof AI_HAZARDS!=='undefined'&&AI_HAZARDS[h]&&AI_HAZARDS[h].label)||hazardLabels[h]||h;}catch(_){return hazardLabels[h]||h;}}
  function horizonLabel(){
     
    try{ const ts=(window.AGN&&AGN.timeSelection&&AGN.timeSelection.state)?AGN.timeSelection.state():null;
      if(ts&&ts.source==='map-day-strip'){ const d=(AGN.day&&AGN.day.get)?Number(AGN.day.get())||0:0; const dt=new Date(Date.now()+5*36e5+d*864e5);
        return (d===0?'Today':'Day +'+d)+' ('+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getUTCDay()]+' '+dt.getUTCDate()+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getUTCMonth()]+') · from the map day strip'; } }catch(_){}
    return {now:'Now','6':'Next 6 hours','24':'Next 24 hours','72':'Next 3 days',seasonal:'Seasonal outlook','2030':'2030 planning','2050':'2050 planning'}[opsLocal.activeHorizon]||'Now';}
  function dataStatus(){const s=activeStation();return s&&s.weatherLive?'Live location data':s&&s.featureLive?'Partially live':'Seed or fallback context';}
  function actionId(){return 'AGN-ACT-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+String(Math.floor(Math.random()*9000)+1000);}
  function reviewId(){return 'AGN-REV-'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'-'+String(Math.floor(Math.random()*9000)+1000);}
  function ownerFor(h){return {flood:'District administration',heat:'Health and labour operations',drought:'Agriculture and water management',wind:'Infrastructure operations',cold:'District emergency services',glof:'GLOF monitoring and district control',seismic:'Emergency management authority',cyclone:'Coastal emergency operations'}[h]||'Operations coordination';}
  

  function recommendedActionFor(v, lane){
    const h=lane&&lane.hazard, name=v.name;
    if(lane && lane.action) return lane.action;    
    const map={flood:`Verify rainfall, drainage and exposed crossings in ${name}. Prepare field monitoring and access continuity measures.`,heat:`Activate heat exposure controls, health surveillance and outdoor work protocols in ${name}.`,drought:`Review water balance, crop stress and supply conditions in ${name}.`,wind:`Inspect exposed infrastructure and activate wind related operating limits in ${name}.`,cold:`Review cold exposure, transport and vulnerable settlement requirements in ${name}.`,glof:`Verify lake and melt trigger context, downstream settlements and communication readiness in ${name}.`,seismic:`Review recent activity, critical facilities and response readiness in ${name}.`,cyclone:`Review coastal exposure, port, drainage and evacuation readiness in ${name}.`};
    return map[h]||(h==null?`Review conditions and field evidence in ${name}.`:`Review ${hazardLabel(h)} conditions and field evidence in ${name}.`);
  }
   
  

  function deadlineForLane(lane, v){
    

    try{ if(window.AGN&&AGN.actionPlan&&AGN.actionPlan.prepareBy&&lane&&lane.hazard){ var _pl=AGN.actionPlan.prepareBy(v&&(v.key||v.tehsil||v.name), lane.hazard, lane.verdict||'Watch', {condition:!!lane.condition}); if(_pl&&_pl.at){ lane.__plan=_pl; return _pl.at; } } }catch(_){}
    const vd=(lane&&lane.verdict)||'Monitor';
    if(lane && lane.condition){
      const days=vd==='Act'?7:vd==='Watch'?14:30;
      return new Date(Date.now()+days*86400000).toISOString();
    }
    const hours=vd==='Act'?6:vd==='Watch'?18:36;
    return new Date(Date.now()+hours*3600000).toISOString();
  }
  

  function actionableLanes(v){
    if(!v) return [];
    

    var lanes=(v.lanes||[]).filter(function(l){
      return l && l.hazard && !l.standing && (l.verdict==='Act'||l.verdict==='Watch'); });
    if(lanes.length) return lanes;
    if(v.top && v.top.hazard && v.top.score!=null && (v.verdict==='Act'||v.verdict==='Watch'))
      return [{hazard:v.top.hazard, verdict:v.verdict, score:v.top.score,
               action:null, verify_urgency:null, _fromTop:true}];
    return [];
  }
   
  function ensureActionForLane(v, lane){
    if(!v||!lane||!lane.hazard) return null;
    const unitLevel=v.unitLevel||'tehsil',tehsil=v.drivingTehsil||v.tehsil||(unitLevel==='tehsil'?v.name:null),district=v.district||(tehsil?geo.districtOf(tehsil):null)||(unitLevel==='district'?v.name:null);
    const unitName=unitLevel==='district'?(district||v.name):(tehsil||v.name),list=actions();
    

    const existing=list.find(a=>a.unit_name===unitName&&a.hazard===lane.hazard&&a.status!=='closed');
    if(existing) return existing;
    const a={id:actionId(),created_at:new Date().toISOString(),unit_id:unitName,unit_name:unitName,
             unit_level:unitLevel,tehsil:tehsil||'',district:district||'',province:v.prov||'',
             hazard:lane.hazard,
             score:(lane.score!=null?lane.score:null),
             verdict:lane.verdict||v.verdict,
             

             status:'open',
             owner:((window.AGN&&AGN.actionPlan&&AGN.actionPlan.owner)?AGN.actionPlan.owner(lane.hazard,null):ownerFor(lane.hazard)),
             deadline:deadlineForLane(lane, v),
             recommendation:(function(){ try{ var t=(window.AGN&&AGN.actionPlan&&AGN.actionPlan.text)?AGN.actionPlan.text(lane.hazard, lane.verdict||v.verdict, null):null; if(t) return t+' ('+(v.name||'')+')'; }catch(_){} return recommendedActionFor(v, lane); })(),
             prepare_basis:(lane.__plan&&lane.__plan.basis)||null, onset:(lane.__plan&&lane.__plan.onset)||null,
             evidence:v.why||'',
             horizon:opsLocal.activeHorizon,
             

             lane_basis:(lane._fromTop
               ? 'no hazard lanes were available on this verdict, so the leading hazard was '
                +'written as a single lane'
               : (lane.lane_basis || 'this hazard\'s own verdict and action, not the unit\'s '
                                    +'leading hazard')),
             verify_urgency:(lane.verify_urgency||null),
             deadline_basis:(lane.condition?'accumulated_condition_weekly_review_not_SOP':'demo_score_band_not_SOP'),
             deadlineLabel:(lane.condition?'Review window for a 90-day condition — not institutional SOP':((lane.__plan&&lane.__plan.onset)?'Prepare before the forecast onset — not institutional SOP':'Demo response target — not institutional SOP')),
             timescale:(lane.timescale||'hours-days'),
             persistence:'browser_local_demo'};
    list.unshift(a); setActions(list);
    if(actionWorkflow)actionWorkflow.create(a,{demo:true,source:'operations-ui'}).catch(function(e){if(window.__MACH_DEBUG)console.debug('[actions repository]',e&&e.message);});
    return a;
  }
  

  function ensureActionsForUnit(v){
    return actionableLanes(v).map(function(l){ return ensureActionForLane(v, l); }).filter(Boolean);
  }
  function statusClass(s){return String(s||'open').toLowerCase();}
  function timeText(ts){try{return new Date(ts).toLocaleString('en-GB',{timeZone:'Asia/Karachi',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+' PKT';}catch(_){return 'Not set';}}

  function renderSituation(){
    const vs=verdicts(),top=vs[0]||activeVerdict(),counts={Act:0,Watch:0,Monitor:0,Low:0};
    

    const evVerdict=v=>{ if(!v) return null; if(v.lanes&&v.lanes.length){ const L=v.lanes.filter(l=>l&&!l.condition&&!l.standing&&(l.verdict==='Act'||l.verdict==='Watch')); return L.length?(L.some(l=>l.verdict==='Act')?'Act':'Watch'):null; }
      return (v.top&&v.top.score!=null&&v.top.score>=65)?(v.verdict==='Act'?'Act':'Watch'):null; };
    vs.forEach(v=>{ const e=evVerdict(v); if(e) counts[e]++; else counts[v.verdict==='Low'?'Low':'Monitor']++; });
    const priority=(counts.Act||0)+(counts.Watch||0),active=actions().filter(a=>a.status!=='closed').length;
    $('opsxNationalStatus').textContent=counts.Act?'Action required':counts.Watch?'Heightened watch':'Routine monitoring';
    $('opsxNationalNote').textContent=counts.Act?`${counts.Act} ${geo.noun('district',counts.Act)} at the immediate response trigger`:counts.Watch?`${counts.Watch} ${geo.noun('district',counts.Watch)} at the 48-hour response trigger`:'No response trigger reached in the current screen';
    $('opsxPriorityCount').textContent=priority; $('opsxPriorityNote').textContent=`${counts.Act||0} immediate · ${counts.Watch||0} within 48 h`;
    $('opsxActiveActions').textContent=active; $('opsxActionNote').textContent=active?'Action register contains active work':'No active actions recorded';
    

    try{ if(!counts.Act&&!counts.Watch){
      var _mo=new Date(Date.now()+5*36e5).getUTCMonth()+1;
      var _sea=(_mo>=10&&_mo<=11)?'post-monsoon: drain and culvert inspection after the rains; smog season opens on the plains (masks, HVAC filters); first frost checks above 2,000 m'
              :(_mo===12||_mo<=2)?'winter: fog and smog on the plains, frost above 1,500 m, snow closures and avalanche season in the north'
              :(_mo<=4)?'pre-monsoon: dust season in the south-west, heat drills before the first spell, cyclone pre-season on the coast from May'
              :(_mo<=6)?'heat season: heat-stop rules, cooling plant and its power checked; GLOF melt season opens; cyclone season on the coast'
              :'monsoon: pumps, drains and access-road triggers; riverine watch on the Indus reaches; GLOF and landslide season in the north';
      var _dr={act:0,watch:0}; try{ Object.keys(window.DISTRICT_SPI||{}).forEach(function(k){ var d=DISTRICT_SPI[k]; if(!d||d.composite==null) return; var v=(AGN.hazardValue&&AGN.hazardValue.verdictOf)?AGN.hazardValue.verdictOf(d.composite,'drought'):(d.composite>=82?'Act':d.composite>=65?'Watch':'Low'); if(v==='Act') _dr.act++; else if(v==='Watch') _dr.watch++; }); }catch(_){}
      $('opsxNationalNote').textContent='No Act or Watch signal in the event lanes'+((_dr.act||_dr.watch)?' · conditions lane: drought '+_dr.act+' Act, '+_dr.watch+' Watch (90-day state, review windows, no response clock)':'');
      $('opsxActionNote').textContent=(active?'Action register contains active work':'No active actions recorded')+' · routine for the season — '+_sea;
    } }catch(_){}
    

    try{
      if(window.AGN && AGN.exposure){
        const ex=AGN.exposure.national(vs,65);
        const el=$('opsxExposedPop'), note=$('opsxExposedNote');
        if(el && ex){
          el.textContent = ex.people>0 ? AGN.exposure.fmt(ex.people) : 'None at Watch';
          if(note) note.textContent = ex.people>0
            ? `Residents of ${ex.units} district${ex.units===1?'':'s'} at Watch or above · population grid 2020`
            : 'No unit currently at Watch or above';
        }
      }
    }catch(e){ if(window.__MACH_DEBUG) console.debug('[mach exposure]', e&&e.message); }
    $('opsxBoardBadge').textContent=dataStatus(); $('opsxHorizonBadge').textContent=horizonLabel();
    

    try{
      var pr=vs.filter(function(x){return x.primed;})
               .sort(function(a,b){return b.primed.api-a.primed.api;});
      var host=document.getElementById('opsxPrimedNote');
      if(!host){
        var tbl=document.getElementById('opsxPriorityRows');
        var box=tbl?tbl.closest('table'):null;
        if(box&&box.parentNode){
          host=document.createElement('div'); host.id='opsxPrimedNote';
          host.style.cssText='margin:10px 2px 0;font-size:0.75rem;line-height:1.5;color:var(--navy)';
          box.parentNode.insertBefore(host,box.nextSibling);
        }
      }
      if(host){
        if(pr.length){
          var names=pr.slice(0,6).map(function(x){
            return esc(x.name)+' ('+x.primed.api.toFixed(2)+')'; }).join(', ');
          host.innerHTML='<span style="display:inline-block;padding:2px 8px;border-radius:8px;'
            +'background:rgba(152,33,34,.09);color:#982122;font-weight:800;font-size:0.75rem;'
            +'letter-spacing:.04em">BASIN PRIMED · '+pr.length+' units</span> '
            +'<span style="opacity:.85">Saturated catchments: '+names
            +(pr.length>6?' +'+(pr.length-6)+' more':'')+'. '
            +'Antecedent index &ge;0.60 — the next rainfall pulse runs off rather than infiltrating. '
            +'Not a current flood signal; a pre-positioning trigger.</span>';
        } else {
          host.innerHTML='<span style="opacity:.7">No catchments currently above the basin-primed threshold (antecedent index &ge;0.60).</span>';
        }
         
        try{
          var gl=verdicts().filter(function(x){ return x.standing && x.standing.score!=null && x.standing.score>=25; })
                           .sort(AGN.hazardValue.compareStanding);
          if(gl.length){
            var gn=gl.slice(0,6).map(function(x){ return esc(x.name)+' ('+Math.round(x.standing.score)+')'; }).join(', ');
            host.innerHTML += '<div style="margin-top:7px">'
              +'<span style="display:inline-block;padding:2px 8px;border-radius:8px;'
              +'background:rgba(91,154,160,.13);color:#3f7076;font-weight:800;font-size:0.75rem;'
              +'letter-spacing:.04em">GLOF CORRIDOR &middot; '+gl.length+' units</span> '
              +'<span style="opacity:.85">Standing susceptibility: '+gn
              +(gl.length>6?' +'+(gl.length-6)+' more':'')+'. '
              +'Corridor screening from the documented lake inventory, not a live signal &mdash; '
              +'it is excluded from the priority ranking on purpose so a permanent 72-90 base '
              +'cannot bury today\'s flood and heat. Shown here so it stays visible on days when '
              +'live hazards lead.</span></div>';
          }
        }catch(_){}
      }
    }catch(e){ if(window.__MACH_DEBUG) console.debug('[primed note]',e&&e.message); }
    

    var BOARD_ROWS = 8;
    try{
      var _cov = vs.coverage || {};
      var _cvHost = document.getElementById('opsxBoardCoverage');
      if(!_cvHost){
        var _tb = document.getElementById('opsxPriorityRows');
        var _tbl = _tb ? _tb.closest('table') : null;
        var _wrap = _tbl ? _tbl.closest('.opsx-tablewrap') : null;
        if(_wrap && _wrap.parentNode){
          _cvHost = document.createElement('div');
          _cvHost.id = 'opsxBoardCoverage';
          _cvHost.style.cssText = 'margin:0 2px 9px;font-size:0.75rem;line-height:1.5;color:var(--navy)';
          _wrap.parentNode.insertBefore(_cvHost, _wrap);
        }
      }
      if(_cvHost){
        var _shown = Math.min(BOARD_ROWS, vs.length);
        var _unit = _cov.unit || vs.unitLevel || 'tehsil';
        var _plural = _unit + 's';
        _cvHost.innerHTML =
          '<b>Showing the top ' + _shown + ' of ' + vs.length + ' assessed ' + _plural + '.</b> '
          + (_cov.unassessed
              ? '<span style="color:#982122;font-weight:700">' + _cov.unassessed + ' of ' + _cov.total
                + ' ' + _plural + ' could not be assessed</span> — ' + _cov.why
                + '. Absence from this board is not a clear verdict.'
              : 'All ' + (_cov.total || vs.length) + ' ' + _plural + ' were assessed.')
          + ' <span style="opacity:.8">Rows are ordered by how many <b>event</b> hazards (hours–days) each unit holds at Act, then at Watch or above, then by measured verification urgency, then by the event lead’s margin above its own class cut. '
          + 'Accumulated conditions (drought, a 90-day index) and standing susceptibilities (GLOF corridor) are shown as flags on the row and neither lead nor order it. '
          + 'Indices rank severity <i>within</i> a hazard and are not a common scale, so the order is a triage shortlist and not a statement that one hazard outranks another.</span>';
      }
    }catch(_e){ if(window.__MACH_DEBUG) console.debug('[board coverage]', _e && _e.message); }

    

    function opsxCoHazards(v){
      try{
        var all=(v&&v.all)||[];
        if(all.length<2) return '';
        

        var _vOf=function(sc){ try{ return AGN.hazardValue.verdictOf(sc); }catch(_){ return null; } };
        var _rk=function(vd){ try{ return AGN.hazardValue.verdictRank[vd]||0; }catch(_){ return 0; } };
        var rest=all.filter(function(x){ return x && x.hazard!==(v.top&&v.top.hazard)
                                                && x.score!=null; })
                    .map(function(x){ var vd=_vOf(x.score);
                          return { hazard:x.hazard, score:x.score, band:x.band,
                                   verdict:vd, verdictRank:_rk(vd) }; })
                    .sort(function(a,b){
                      if(b.verdictRank!==a.verdictRank) return b.verdictRank-a.verdictRank;
                      return String(a.hazard||'').localeCompare(String(b.hazard||''));
                    });
        if(!rest.length) return '';
        return '<div class="opsx-cohz" style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">'
          + rest.map(function(x){
              var col=(typeof hazardColors!=='undefined' && hazardColors[x.hazard]) || '#4A8C93';
              return '<span class="opsx-cohz-chip" style="display:inline-flex;align-items:center;'
                + 'gap:3px;font-size:0.75rem;font-weight:750;padding:2px 6px;border-radius:7px;'
                + 'border:1px solid '+esc(col)+'55;color:#33454F;background:'+esc(col)+'14">'
                + esc(String(hazardLabel(x.hazard)).replace(/\s*[\u2014(-].*$/,''))    
                + (x.verdict ? ' <b>'+esc(x.verdict)+'</b>' : ' <b>unclassed</b>')
                + ' <i style="font-style:normal;opacity:.75">' + Math.round(x.score)
                + (x.band ? ' · '+esc(x.band) : '') + '</i>'
                + '</span>';
            }).join('')
          + '<span class="opsx-cohz-note" style="font-size:0.75rem;color:#6B7A84">also scoring \u00b7 ordered by the '
          + 'operational class each hazard earned from its own index, then by name \u00b7 each '
          + 'index ranks severity within its own hazard and they are not a common scale'
          + '</span></div>';
      }catch(_){ return ''; }
    }
    function opsxRowHtml(v){
      const a=actions().find(x=>(x.unit_name||x.district)===v.name&&x.hazard===v.top.hazard&&x.status!=='closed');
      return `<tr><td><b>${esc(v.name)}</b></td><td>${esc(v.prov||'')}</td><td>${esc(hazardLabel(v.top.hazard))}${v.leadIsCondition?' <i style="font-size:0.72rem;color:#8a5a12">(condition)</i>':''}${opsxCoHazards(v)}${(function(){
      

      var out='';
      
      
      try{ if(v.standing && v.standing.score!=null && v.standing.score>=25){
        out+='<div style="margin-top:3px;font-size:0.75rem;font-weight:700;letter-spacing:.03em;color:#5B9AA0">GLOF CORRIDOR · standing '+Math.round(v.standing.score)+'</div>';
      } }catch(_){}
      try{ if(v.primed){
        out+='<div style="margin-top:2px;font-size:0.75rem;font-weight:700;letter-spacing:.03em;color:#982122">BASIN PRIMED · API '+v.primed.api+'</div>';
      } }catch(_){}
      

      try{ if(v.condition && v.condition.score!=null && (v.condition.verdict==='Act'||v.condition.verdict==='Watch')){
        out+='<div style="margin-top:2px;font-size:0.75rem;font-weight:700;letter-spacing:.03em;color:#8a5a12">'
           +esc(String(v.condition.hazard||'condition').toUpperCase())+' CONDITION · '+esc(v.condition.verdict)+' '+Math.round(v.condition.score)
           +' <span style="font-weight:600;opacity:.75">(90-day index, no clock)</span></div>';
      } }catch(_){}
      try{ if(v.leadIsCondition){
        out+='<div style="margin-top:2px;font-size:0.72rem;color:#6B7A84">no event hazard resolved · lead shown is the accumulated condition</div>';
      } }catch(_){}
      return out;
    })()}</td><td><span class="opsx-score" style="background:${esc(v.top.color||hazardColors[v.top.hazard]||'#0C3851')}">${Math.round(v.top.score)}</span><div style="margin-top:3px;font-size:0.75rem;color:var(--muted);white-space:nowrap">${v.drivingTehsil?esc(v.drivingTehsil)+' · ':''}${v.spatialCoverage!=null?Math.round(v.spatialCoverage*100)+'% coverage':''}</div></td><td>${(function(){try{var p=AGN.exposure.forUnit(v.name,{level:'district'});
       return (p&&p.pop!=null)?'<b>'+AGN.exposure.fmt(p.pop)+'</b>'
         :'<span class="rpt-na" title="'+((p&&p.why)||'no population held').replace(/"/g,'&quot;')+'">—</span>';}catch(_){return '—';}})()}</td><td><span class="opsx-state ${statusClass(v.verdict)}">${esc(v.verdict)}</span></td><td>${esc(v.action||recommendedActionFor(v, actionableLanes(v)[0]||null))}</td><td>${a?`<span class="opsx-state ${statusClass(a.status)}">${esc(a.status)}</span>`:'Not created'}</td></tr>`;
    }
    

    try{ (window.AGN=window.AGN||{}).ops=Object.assign(window.AGN.ops||{},
           { rowHtml:opsxRowHtml, coHazards:opsxCoHazards,
             actions:function(){ return actions().slice(); },
             actionableLanes:actionableLanes,
             ensureActionsForUnit:ensureActionsForUnit,
             clearActions:function(){ setActions([]); },
             contract:'Unit -> Hazard Lane -> Action. One record per hazard at Watch or above on '
                     +'a unit, each carrying that lane\'s verdict, owner, response window and '
                     +'instruction. A unit is never reduced to its leading hazard.' }); }catch(_){}
    $('opsxPriorityRows').innerHTML=(vs.slice(0,BOARD_ROWS).map(opsxRowHtml).join(''))||'<tr><td colspan="8">District verdict data are not available in the current session.</td></tr>';
    const s=activeStation(),c=context(s),av=activeVerdict(),h=av.top.hazard;
    

     
    let current = (av.top && av.top.score!=null && isFinite(av.top.score) && Math.round(av.top.score)===0)
      ? `No screened hazard shows a signal for ${av.name} now: every scored hazard is at 0/100.`
      : (av.top && av.top.score!=null && isFinite(av.top.score))
      ? `${hazardLabel(h)} is the strongest current screening signal for ${av.name} at ${Math.round(av.top.score)}/100.`
      : ((typeof window.agnChainNow85==='function' && window.agnChainNow85(av.name)) || `No hazard resolved for ${av.name} in this session — the strongest signal cannot be stated, and this is not an all-clear.`);
    let forecast=(function(){ try{ const ts=AGN.timeSelection&&AGN.timeSelection.state(); if(ts&&ts.source==='map-day-strip') return 'The map day strip selects '+horizonLabel().replace(/ · from the map day strip$/,'')+': levels are that day\u2019s peak, as on the Overview.'; }catch(_){} return null; })()||(opsLocal.activeHorizon==='now'?'Current conditions and the latest model state are being used.':opsLocal.activeHorizon==='seasonal'||opsLocal.activeHorizon==='2030'||opsLocal.activeHorizon==='2050'?'The selected planning horizon requires backend seasonal or climate scenario products.':`The selected ${horizonLabel().toLowerCase()} view should use the corresponding forecast lead and model agreement.`);
    let susceptibility={flood:'Terrain, drainage, soil wetness and river context shape consequence.',heat:'Urban form, humidity, labour exposure and power reliability shape consequence.',drought:'Water storage, crop stage, irrigation and historical anomaly shape consequence.',wind:'Terrain exposure, structure type and operating thresholds shape consequence.',cold:'Elevation, access, housing and vulnerable population shape consequence.',glof:'Glacial lake inventory, melt conditions, downstream pathways and communication readiness shape consequence.',seismic:'Background seismic susceptibility and critical facility vulnerability shape consequence.',cyclone:'Coastal segment, surge, port, drainage and evacuation capacity shape consequence.'}[h]||'Terrain, drainage, water sources and the site\u2019s own record (Client Risk \u203a Casebook: floor level, flood protection, backup power) set how much a hazard would hurt here.';
    $('opsxDecisionChain').innerHTML=[['Current condition',current],['Forecast change',forecast],['Standing susceptibility',susceptibility],['Decision implication',recommendedActionFor(av,(actionableLanes(av)[0]||{hazard:(av.top&&av.top.hazard)||null,verdict:av.verdict}))],['Responsible owner',ownerFor(h)]].map(x=>`<div class="opsx-chain-row"><span>${esc(x[0])}</span><b>${esc(x[1])}</b></div>`).join('');
    const now=new Date(),modelState=domain.modelState()||{},modelCount=modelState.series?Object.keys(modelState.series).length:0;
    const _ac=actionCounts();
    const events=[
      ['Now',`${dataStatus()} for ${s.name||c.district}`,`Source ${({metno:'second-opinion feed (fallback)','mach':'model forecast',mach:'model forecast'}[String(s.liveSource||'').toLowerCase()]||(s.liveSource?'model forecast':'no live reading'))} · ${s.liveFetchedAt?timeText(s.liveFetchedAt):'time not yet known'}`],
      ['Models',modelCount?`${modelCount} model streams available`:'Model comparison pending',modelCount?`${({temp:'Temperature',rain:'Rain',wind:'Wind',hum:'Humidity'}[modelState.variable]||'Temperature')} · ${modelState.lead||48} h lead`:'Load the model comparison (Methods & Verification) for the active location'],
      ['Priority',`${av.name} · ${hazardLabel(h)} ${agnScoreOutOf100(av.top&&av.top.score)}`,av.why||av.action||'Current district screening result'],
      ['Actions',`${_ac.active} active action${_ac.active===1?'':'s'}`,_ac.active?'Register contains open institutional work':'Generate actions from the priority board'],
      ['Exposure',(function(){ try{ var ex=AGN.exposure.national(vs,65); return ex&&ex.people>0?(AGN.exposure.fmt(ex.people)+' residents of '+ex.units+' '+(ex.units===1?'district':'districts')+' with an event hazard at High or above (index 65+)'):'No district with an event hazard at High or above'; }catch(_){ return 'Population table not loaded'; } })(),'2020 residents of those districts (population grid), not a modelled footprint']
    ];
    $('opsxEventStream').innerHTML=events.map((x,i)=>`<div class="opsx-stream-item${x[0]==='Models'?' agn-op-only':''}"><span class="opsx-stream-time">${esc(x[0])}</span><i class="opsx-stream-dot" style="background:${i===2?(hazardColors[h]||'#14B8A6'):'#14B8A6'}"></i><div class="opsx-stream-copy"><b>${esc(x[1])}</b><p>${esc(x[2])}</p></div></div>`).join('');
    

    const _pop=(function(){ try{ return !!(window.PK_TEHSIL_POP && Object.keys(window.PK_TEHSIL_POP).length); }catch(_){ return false; } })();
    const _assets=(function(){ try{ var p=AGN.project&&AGN.project.state?AGN.project.state():null; return (p&&p.assets)?p.assets.length:0; }catch(_){ return 0; } })();
    const _health=(window.__agnOpsHealth||null);
    const readiness=[['Connected now','Weather (forecast model), ensemble, terrain, glacial-lake register, seismic zone, air quality (modelled), river reaches (modelled)'+(_pop?', population (population grid 2020)':'')+'.'],
      ['Assets',_assets?(_assets+' project asset'+(_assets===1?'':'s')+' loaded in this session'):'No project assets loaded; load a portfolio to screen assets.'],
      ['Operational workflow','Action ownership, response windows, status, evidence and closure controls are active in this browser (local persistence).'],
      ['Server jobs',_health?(_health.ok?'all scheduled jobs current':((_health.stale||[]).length+' job(s) stale: '+(_health.stale||[]).join(', '))):'health board not loaded'],
      ['Not in this build','Users, permissions, notifications, an authority matrix and an institutional evidence store.']];
    $('opsxReadiness').innerHTML=readiness.map(x=>`<div class="opsx-chain-row"><span>${esc(x[0])}</span><b>${esc(x[1])}</b></div>`).join('');
    try{ if(window.AGN&&AGN.level&&AGN.level.ops) AGN.level.ops(vs,av); }catch(_){}    
  }

  function renderActions(){
    const filter=$('opsxActionFilter').value,list=actions(),shown=list.filter(a=>filter==='all'||filter==='active'&&a.status!=='closed'||a.status===filter);
    const _ac=actionCounts(); $('opsxActionCountBadge').textContent=`${_ac.active} active action${_ac.active===1?'':'s'}`; $('opsxActionCountBadge').title=_ac.total+' in the register ('+(_ac.total-_ac.active)+' closed)';
    $('opsxActionList').innerHTML=shown.length?shown.map(a=>`<article class="opsx-action" style="--action-color:${hazardColors[a.hazard]||'#14B8A6'}"><div class="opsx-action-top"><div><h4>${esc(a.id)} · ${esc(a.unit_name||a.district||a.tehsil||'Unresolved unit')}</h4><p>${esc(a.recommendation)}</p></div><span class="opsx-state ${statusClass(a.status)}">${esc(a.status)}</span></div><div class="opsx-action-meta"><span>${esc(hazardLabel(a.hazard))} ${agnScoreOutOf100(a.score)}</span><span>Owner: ${esc(a.owner)}</span><span>${a.onset?'Prepare by':'Demo target (not institutional SOP)'}: ${esc(timeText(a.deadline))}${a.onset?' · onset '+esc(timeText(a.onset)):''}</span><span>Horizon: ${esc(a.horizon||'now')}</span></div><div class="opsx-action-controls"><button data-action-id="${esc(a.id)}" data-action-status="acknowledged">Acknowledge</button><button data-action-id="${esc(a.id)}" data-action-status="escalated">Escalate</button><input type="text" data-outcome-for="${esc(a.id)}" aria-label="Outcome (required to close)" placeholder="Outcome (required to close)" value="${esc(a.outcome||'')}" style="min-width:180px;flex:1;padding:4px 8px;border:1px solid #c9d4dc;border-radius:8px;font:inherit;font-size:.78rem"><button data-action-id="${esc(a.id)}" data-action-status="closed">Close</button></div>${a.outcome?'<div class="opsx-action-meta"><span>Outcome: '+esc(a.outcome)+'</span></div>':''}</article>`).join(''):'<div class="opsx-empty">No action matches the current filter. Generate actions from the national priorities or add the active location.</div>';
    renderSituation();
  }


  function prefillReview(){const v=activeVerdict();$('opsxReviewDistrict').value=v.name||'';$('opsxReviewHazard').value=v.top.hazard in hazardLabels?v.top.hazard:'flood';$('opsxReviewNotes').value=`Predicted ${hazardLabel(v.top.hazard)} screening score ${agnScoreOutOf100(v.top&&v.top.score)}. ${v.why||v.action||''}`;}
  function renderReviews(){
    const list=reviews(),verified=list.filter(r=>r.observed!=='pending').length,timely=list.filter(r=>r.action==='timely').length;
    $('opsxReviewCount').textContent=list.length;$('opsxVerifiedCount').textContent=verified;$('opsxTimelyCount').textContent=timely;$('opsxLearningStatus').textContent=list.length>=5?'Developing':list.length?'Early':'Pending';$('opsxReviewBadge').textContent=`${list.length} record${list.length===1?'':'s'}`;
    $('opsxReviewList').innerHTML=list.length?list.map(r=>`<article class="opsx-review"><time>${esc(timeText(r.created_at))}</time><div><h4>${esc(r.id)} · ${esc(r.district)} · ${esc(hazardLabel(r.hazard))}</h4><p>Observed: ${esc(r.observed)} · Action: ${esc(r.action)}. ${esc(r.notes||'No additional evidence recorded.')}</p></div><strong>${r.observed==='pending'?'Pending':'Reviewed'}</strong></article>`).join(''):'<div class="opsx-empty">No post event review has been saved in this browser. Use current priority to create the first evidence record.</div>';
  }

   
  if(!window.__agnOpsTsWired){ window.__agnOpsTsWired=true; document.addEventListener('agn:time-selection',function(e){ try{ const d=e&&e.detail||{}; if(d.source!=='map-day-strip') return;
      const L=Number(d.leadHours)||0; opsLocal.activeHorizon=L<=0?'now':L<=24?'24':'72';
      document.querySelectorAll('#opsxHorizon button[data-horizon]').forEach(function(b){ const on=b.dataset.horizon===opsLocal.activeHorizon; b.classList.toggle('active',on); b.setAttribute('aria-selected',on?'true':'false'); });
      renderAll(); }catch(_){} }); }
   
  try{ window.AGN=window.AGN||{}; AGN.ops=Object.assign(AGN.ops||{},{activeVerdict:function(){ try{ return activeVerdict(); }catch(_){ return null; } }}); }catch(_){}
  function renderAll(){
    if(!$('opsxPlace'))return;const s=activeStation(),c=context(s);$('opsxPlace').textContent=s.name?`· ${s.name}`:'· Pakistan';$('opsxSystemStatus').textContent=`${dataStatus()} · ${horizonLabel()} · ${c.district}`;
    renderSituation();renderActions();renderReviews();
  }
  function bind(){
    $('opsxTabs').addEventListener('click',e=>{const b=e.target.closest('button[data-opsx]');if(!b)return;document.querySelectorAll('#opsxTabs button').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.opsx-pane').forEach(p=>p.classList.toggle('active',p.dataset.opsxPane===b.dataset.opsx));opsLocal.activePane=b.dataset.opsx;setTimeout(renderAll,20);});
    $('opsxHorizon').addEventListener('click',e=>{const b=e.target.closest('button[data-horizon]');if(!b)return;if(b.getAttribute('aria-disabled')==='true'){if(window.AGNBackend)AGNBackend.open('operations-horizons');return;}opsLocal.activeHorizon=b.dataset.horizon;document.querySelectorAll('#opsxHorizon button').forEach(x=>x.classList.toggle('active',x===b));renderAll();});
    

    $('opsxGenerateActions').addEventListener('click',()=>{
      verdicts().filter(v=>v.verdict==='Act'||v.verdict==='Watch').slice(0,8)
                .forEach(ensureActionsForUnit);
      renderAll();});
    $('opsxAddAction').addEventListener('click',()=>{
      const made=ensureActionsForUnit(activeVerdict());
      if(!made.length&&window.AGNBackend)AGNBackend.open('operations');
      renderAll();});
    $('opsxActionFilter').addEventListener('change',function(){opsLocal.actionFilter=this.value;renderActions();});
    $('opsxClearActions').addEventListener('click',()=>{if(confirm('Clear the browser-local action register? This cannot be undone.')){setActions([]);renderAll();}});
    $('opsxActionList').addEventListener('click',e=>{const b=e.target.closest('button[data-action-id]');if(!b)return;const list=actions(),a=list.find(x=>x.id===b.dataset.actionId);if(!a)return;
       
      if(b.dataset.actionStatus==='closed'){const inp=document.querySelector('input[data-outcome-for="'+CSS.escape(a.id)+'"]');const out=String((inp&&inp.value)||a.outcome||'').trim();if(!out){if(inp){inp.setAttribute('aria-invalid','true');inp.placeholder='Outcome required to close: what happened?';inp.focus();}return;}a.outcome=out;a.closed_at=new Date().toISOString();}
      const previous=a.status;a.status=b.dataset.actionStatus;a.updated_at=new Date().toISOString();setActions(list);if(actionWorkflow)actionWorkflow.transition(a.id,a.status,{demo:true,currentStatus:previous,version:a.version||1,source:'operations-ui'}).catch(function(err){if(window.__MACH_DEBUG)console.debug('[action transition]',err&&err.message);});renderAll();});
    $('opsxPrefillReview').addEventListener('click',prefillReview);
    $('opsxSaveReview').addEventListener('click',()=>{const r={id:reviewId(),outcomeId:null,event_id:'DEMO-EVENT-'+new Date().toISOString().slice(0,10),created_at:new Date().toISOString(),unit_id:$('opsxReviewDistrict').value||activeVerdict().name,district:$('opsxReviewDistrict').value||activeVerdict().name,hazard:$('opsxReviewHazard').value,observed:$('opsxReviewObserved').value,action:$('opsxReviewAction').value,notes:$('opsxReviewNotes').value,observed_impacts:{observed:$('opsxReviewObserved').value,action:$('opsxReviewAction').value,notes:$('opsxReviewNotes').value},verification_sources:[],reviewer_id:'offline-demo-user'};const list=reviews();list.unshift(r);setReviews(list);if(outcomeWorkflow)outcomeWorkflow.record(r,{demo:true,source:'operations-review-ui'}).catch(function(err){if(window.__MACH_DEBUG)console.debug('[outcome repository]',err&&err.message);});$('opsxReviewNotes').value='';renderReviews();});
    $('opsxClearReviews').addEventListener('click',()=>{if(confirm('Clear the browser-local post-event reviews? This cannot be undone.')){setReviews([]);renderReviews();}});
  }
  function init(){if(!$('opsxPlace'))return;bind();prefillReview();renderAll();}
  window.AGN=window.AGN||{};
  if(AGN.implementations) AGN.implementations.define('operations',{
    render:renderAll,
    renderSituation:renderSituation,
    prefillReview:prefillReview,
    getState:function(){return {activeHorizon:opsLocal.activeHorizon,activePane:opsLocal.activePane,actionFilter:opsLocal.actionFilter,actionCount:actions().length,reviewCount:reviews().length};}
  },{source:'modules/operations/35-agn-operations-centre.js',owner:'operations',moduleType:'isolated-section-implementation',dependencies:['data:contracts','data:persistence','workflow:actions','workflow:outcomes','adapter:locationLegacy','data:storage','data:geography','data:domain'],globalDependencies:[],compatibilityGlobals:[]});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
