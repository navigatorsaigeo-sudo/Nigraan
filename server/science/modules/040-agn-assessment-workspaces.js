
(function(){
  "use strict";
  const $ = id => document.getElementById(id);
  const domain = window.AGN&&AGN.dataServices?AGN.dataServices.require('domain'):null;
  const contracts = window.AGN&&AGN.dataServices?AGN.dataServices.require('contracts'):null;
  const assessmentWorkflow=window.AGN&&AGN.workflows?AGN.workflows.require('assessments'):null;
  const esc = s => String(s==null?"":s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  const hazardMeta = [
    {key:"rain_hz",label:"Heavy rain"},
    {key:"flood",label:"Flood"},
    {key:"heat",label:"Heat stress"},
    {key:"wind",label:"Wind and gusts"},
    {key:"drought",label:"Drought"},
    {key:"cold",label:"Cold stress (UTCI)"},
    {key:"glof",label:"Glacial lake outburst flood (GLOF)"},
    {key:"seismic",label:"Seismic"},
    {key:"cyclone",label:"Cyclone"},
    

    {key:"landslide",label:"Landslide"}
  ];
  const assetNames = {
    industrial:"Industrial facility",hospital:"Hospital or critical service",telecom:"Telecom asset",
    energy:"Energy asset",transport:"Transport asset",bank:"Bank branch",agriculture:"Agriculture asset",
    water:"Water facility",commercial:"Commercial property"
  };
  

  const sensitivity = {
    industrial:{rain_hz:55,flood:78,heat:66,wind:62,drought:58,cold:38,glof:54,seismic:74,cyclone:64,landslide:58},
    hospital:{rain_hz:68,flood:88,heat:82,wind:72,drought:70,cold:62,glof:72,seismic:92,cyclone:82,landslide:70},
    telecom:{rain_hz:55,flood:68,heat:80,wind:92,drought:42,cold:72,glof:62,seismic:74,cyclone:88,landslide:78},
    energy:{rain_hz:58,flood:82,heat:84,wind:88,drought:60,cold:68,glof:66,seismic:90,cyclone:86,landslide:84},
    transport:{rain_hz:76,flood:92,heat:48,wind:66,drought:42,cold:82,glof:90,seismic:88,cyclone:78,landslide:94},
    bank:{rain_hz:46,flood:74,heat:58,wind:48,drought:42,cold:36,glof:40,seismic:70,cyclone:60,landslide:44},
    agriculture:{rain_hz:82,flood:86,heat:88,wind:60,drought:96,cold:82,glof:58,seismic:32,cyclone:68,landslide:52},
    water:{rain_hz:68,flood:90,heat:62,wind:54,drought:94,cold:50,glof:78,seismic:82,cyclone:76,landslide:80},
    commercial:{rain_hz:50,flood:76,heat:70,wind:58,drought:46,cold:42,glof:42,seismic:76,cyclone:66,landslide:50}
  };
   
  try{
    window.SENSITIVITY_REGISTRY = {
      basis:'expert screening weights per asset class per hazard, 0-100',
      appliedAs:'priority = hazardScore*0.70 + sensitivity*0.30  /* EXPERT-WEIGHTED SCREENING, not calibrated risk. Review owner UNASSIGNED; never present as validated asset risk. */',
      calibrationStatus:'expert',
      reviewOwner:'UNASSIGNED - assign before this reaches a client report',
      

      issuable:false,
      issuableWhy:'the sensitivity weights have no named review owner, so any figure derived '
                 +'from them is withheld from client-facing surfaces and marked internal. '
                 +'Assign reviewOwner to release it.',
      internalUseOnly:'ordering hazards WITHIN one operational class, where the weight never '
                     +'crosses a scale boundary',
      appliesTo:'Pakistan, all provinces',
      version:'PATCH-D4',
      matrix: sensitivity
    };
     
    window.SENSITIVITY_REGISTRY.priorityIssuable=function(){
      var R=window.SENSITIVITY_REGISTRY||{};
      return R.issuable===true && !!R.reviewOwner && !/UNASSIGNED/i.test(String(R.reviewOwner));
    };
    

    window.AGN_ISSUANCE={
      internalTier:function(){
        try{ return !!(window.AGN_BUILD && window.AGN_BUILD.credential_embedded===true); }
        catch(_){ return false; }
      },
      indexReleased:function(){
        try{ var R=window.SENSITIVITY_REGISTRY;
             return !!(R && R.priorityIssuable && R.priorityIssuable()); }
        catch(_){ return false; }
      },
       
      indexVisible:function(){ return this.indexReleased() || this.internalTier(); },
      

      internalMark:'INTERNAL · UNVALIDATED · NOT ISSUABLE',
      

      why:'The blended priority index weights a hazard signal against an asset '
         +'sensitivity whose weights have no named review owner. It orders hazards '
         +'inside one operational class and crosses no scale boundary, so it is kept '
         +'for internal work and withheld from every client-facing surface.'
    };
    

    var CRITICALITY_RANK={critical:4,high:3,medium:2,low:1};
    window.AGN_ASSET_ORDER={
      terms:['operational class','level','Act count','criticality','usable lead',
             'Watch count','verification urgency','asset id'],
      deferred:{safety_consequence:'v91.17 · asset schema 1.1.0'},
      lanesOf:function(r){
        if(r && r.lanes && r.lanes.length) return r.lanes;
        if(r && r.results && r.results.length) return r.results;
        if(r && r.lead) return [r.lead];
        return [];
      },
      classOf:function(r){
        var l=(r&&r.lead)||null;
        if(!l) return null;
        return l.verdictClass || (window.opClass?opClass(l.score):null);
      },
      countAt:function(r,verdict){
        var n=0, ls=this.lanesOf(r);
        for(var i=0;i<ls.length;i++){
          var v=ls[i]&&(ls[i].verdictClass||ls[i].verdict||
                        (window.opClass?opClass(ls[i].score):null));
          if(v===verdict) n++;
        }
        return n;
      },
      

      criticalityOf:function(r){
        var c=r&&(r.criticality!=null?r.criticality:r.asset_criticality);
        if(c==null||c==='') return null;
        if(isFinite(Number(c))){ var n=Number(c); return (n>=1&&n<=5)?n:null; }
        var k=CRITICALITY_RANK[String(c).trim().toLowerCase()];
        return k==null?null:k;
      },
       
      leadOf:function(r){
        var l=(r&&r.lead)||null; if(!l) return null;
        var v=(l.leadHours!=null)?l.leadHours:(l.leadDays!=null?l.leadDays*24:null);
        return (v==null||!isFinite(v))?null:v;
      },
      urgencyOf:function(r){
        var l=(r&&r.lead)||null; if(!l) return null;
        var u=l.verify_urgency||l.verifyUrgency;
        var RANK={immediate:3,soon:2,routine:1};
        if(u!=null){ var k=RANK[String(u).trim().toLowerCase()]; if(k!=null) return k; }
         
        if(l.confidence!=null && isFinite(l.confidence)) return -Number(l.confidence);
        return null;
      },
      idOf:function(r){ return String((r&&(r.asset_id||r.name))||''); },
      compare:function(a,b){
        var O=window.AGN_ASSET_ORDER, HV=(window.AGN&&AGN.hazardValue)||null;
         
        var ca=O.classOf(a), cb=O.classOf(b);
        var ra=HV?(HV.verdictRank[ca]||0):0, rb=HV?(HV.verdictRank[cb]||0):0;
        if(rb!==ra) return rb-ra;
         
        var LH=window.AGN_HZ_LEAD, va=LH?LH.level(a&&a.lead):null, vb=LH?LH.level(b&&b.lead):null;
        if(va!=null && vb!=null && va!==vb) return vb-va;
         
         
        var aa=O.countAt(a,'Act'), ab=O.countAt(b,'Act');
        if(ab!==aa) return ab-aa;
         
        var ka=O.criticalityOf(a), kb=O.criticalityOf(b);
        if(ka!=null && kb!=null && ka!==kb) return kb-ka;
         
        var la=O.leadOf(a), lb=O.leadOf(b);
        if(la!=null && lb!=null && la!==lb) return la-lb;
         
        var wa=O.countAt(a,'Watch'), wb=O.countAt(b,'Watch');
        if(wb!==wa) return wb-wa;
         
        var ua=O.urgencyOf(a), ub=O.urgencyOf(b);
        if(ua!=null && ub!=null && ua!==ub) return ub-ua;
         
         
        return O.idOf(a).localeCompare(O.idOf(b));
      },
      basis:'Assets are ordered by the operational class of their leading hazard and its level (the hazard engine\u2019s), '
           +'then by how many '
           +'hazards stand at Act, declared criticality, shortest usable preparation lead, Watch count, '
           +'verification urgency and finally asset id so the '
           +'order is stable.'
    };
  }catch(_){}

  const state=(window.AGN&&AGN.sectionState)?AGN.sectionState.state('assessments',{assessment:null,portfolio:[],reportHtml:"",assetType:null,horizon:"present",lastCalculationId:null}):{assessment:null,portfolio:[],reportHtml:"",assetType:null,horizon:"present",lastCalculationId:null};

  function stationList(){ return window.STATIONS || []; }
  function currentStation(){
    const list=stationList();
    let id=null;
    try{id=window.activeStationId&&window.activeStationId();}catch(e){}
    return list.find(s=>s.id===id)||list[0]||null;
  }
  function selectedStation(){
    const el=$("asmtLocation"), list=stationList();
    return list.find(s=>s.id===(el&&el.value))||currentStation();
  }
  function districtFor(s){
    

    if(s && s.__unitKey) return s.__unitKey;
    try{return (typeof aiStationDistrict==="function"&&aiStationDistrict(s))||s.name;}catch(e){return s.name;}
  }
  function inputFor(s){
    const n=v=>(v==null||v===''||!Number.isFinite(Number(v)))?null:Number(v);
    const wind=n(s&&s.wind), gust=n(s&&s.gust);
    return {
      t:n(s&&s.t), feels:n(s&&s.feels)!=null?n(s.feels):n(s&&s.t), hum:n(s&&s.hum),
      wind:wind, gust:gust!=null?gust:(wind!=null?Math.round(wind*((typeof FR==='function')?FR('wind.gustFromWindK'):1.5)):null),
      rain:n(s&&s.rain), uv:n(s&&s.uv), aqi:n(s&&s.aqi),
      soilMoist:n(s&&s.soilMoist),lat:n(s&&s.lat),lon:n(s&&s.lon),
      weatherLive:!!(s&&s.weatherLive),featureLive:!!(s&&s.featureLive)
    };
  }
  

  function opClass(score){
    try{
      var HV=window.AGN&&AGN.hazardValue;
      if(!HV||!HV.verdictOf) return 'class unavailable';
      var v=HV.verdictOf(score);
      return v==null ? 'not scored' : v;
    }catch(_){ return 'class unavailable'; }
  }
  try{ window.opClass=opClass; }catch(_){}
  

  /* v91.17.272 (owner): a row's level is the site's own (AGN.siteScore) where the site was scored; the engine's tehsil level otherwise */
  function hzLevel(r){ return (r&&r.siteLevel!=null)?r.siteLevel:((r&&r.engineLevel!=null)?r.engineLevel:null); }
  function siteOf(s){ var la=s&&(s.lat!=null?s.lat:s.latitude), lo=s&&(s.lon!=null?s.lon:s.longitude); return (la!=null&&lo!=null&&isFinite(la)&&isFinite(lo)&&window.AGN&&AGN.siteScore)?{lat:+la,lon:+lo}:null; }
  var _asmtPt=null;
  function siteJoin(r,s,key){ var p=_asmtPt||siteOf(s); if(!p||!r) return r; var S=AGN.siteScore.peek(p.lat,p.lon);
    if(S===undefined){ AGN.siteScore.get(p.lat,p.lon); return Object.assign(r,{sitePending:true}); }
    if(!S||!S.ok) return Object.assign(r,{siteWhy:(S&&S.why)||'the site was not scored'});
    var x=S.hz.filter(function(h){ return h.key===key; })[0]; if(!x) return r;
    var o={siteHz:x, siteBasis:x.basis, sitePoint:!!S.point, classRank:x.peak?x.peak.i+1:0};
    if(x.peak) Object.assign(o,{siteLevel:x.peak.i, siteScore:x.peak.score, siteDate:x.peak.date, siteDay:x.peak.day, siteDriver:x.peak.driver||null, available:true});
    else o.siteWhy=(x.notApplicable||r.notApplicable)?'does not occur here':x.why;
    /* v91.17.272 integration: heavy rain, drought and landslide are issued by tehsil: with no level of its own the site carries its tehsil's (marked) */
    if(!x.peak&&!x.notApplicable&&{rain_hz:1,drought:1,landslide:1}[key]){ var ds=S.days||[], er=(r.engineRow||[]).filter(function(z){ return z&&z.i!=null&&ds.indexOf(z.date)>=0; });
      if(er.length){ var pk=er.reduce(function(p,q){ return q.i>p.i?q:p; }); Object.assign(o,{siteLevel:pk.i, siteScore:null, siteCarried:true, siteDate:pk.date, siteDay:pk.day, classRank:pk.i+1, available:true, siteWhy:null}); }
      else if(r.notApplicable) o.siteWhy='does not occur here'; }
    return Object.assign(r,o); }
  function hzOrder(a,b){
    var ra=(a&&a.classRank)||0, rb=(b&&b.classRank)||0;
    if(rb!==ra) return rb-ra;
    var la=hzLevel(a), lb=hzLevel(b);
    if(la!=null && lb!=null && la!==lb) return lb-la;
    return String((a&&(a.label||a.key))||'').localeCompare(String((b&&(b.label||b.key))||''));
  }
  function hzLeaders(sorted){
    var lead=(sorted&&sorted[0])||null; if(!lead) return [];
    return sorted.filter(function(x){ return ((x&&x.classRank)||0)===((lead.classRank)||0) && hzLevel(x)===hzLevel(lead); });
  }
   
  function hzLeadSummary(lead, leaders){
    if(!lead) return {level:null, word:'No data', leaders:[], none:true, text:'No level from the hazard engine'};
    var lv=hzLevel(lead), w=(lv!=null&&window.AGN&&AGN.level)?AGN.level.words[lv]:'No data', ld=(leaders&&leaders.length)?leaders:[lead];
    if(lv===0) return {level:0, word:w, leaders:[], none:true, text:'No hazard above Normal'};
    return {level:lv, word:w, leaders:ld, none:false, text:ld.map(function(x){ return x.label||x.key; }).join(' · ')};
  }
   
  try{ window.AGN_HZ_LEAD={order:hzOrder, leaders:hzLeaders, summary:hzLeadSummary, level:hzLevel}; }catch(_){}
   
  function confidence(s,r,key){
    let tier='synthetic';
    try{
      if(typeof districtConfidence==='function'){
        const terr=(typeof hzTerrainFor==='function')?hzTerrainFor(districtFor(s)):null;
        const probe={ weatherLive:!!s.weatherLive, featureLive:!!s.featureLive,
                      districtFetchedAt:(typeof s.fetchedAt==='number'?s.fetchedAt:null),
                      liveMeta:s.liveMeta||null };
        tier=(districtConfidence(probe,terr)||{}).tier||'synthetic';
      }
    }catch(e){
      try{ AGN.diagnostics.capture({module:'assessment-confidence',error:e,context:{key:key}}); }catch(_){}
    }
    
    

    

    

    if(key==="seismic"||key==="cyclone") return null;
    

    confidence.__last={tier:tier, provisional:!!(r&&r.provisional), modelLive:(function(){ try{ const ms=domain.modelState(); return !!(ms&&ms.source==="live"); }catch(e){ return false; } })(), noLakes:!!(key==="glof"&&r&&r.top==="No inventory lakes")};
    return null;
  }
   
  confidence.tierOf=function(s,r,key){
    try{ confidence(s,r,key); var L=confidence.__last||{tier:'synthetic'}; if(key==="seismic"||key==="cyclone") return {tier:'static', text:'static susceptibility (evidence class, no live input)'};
      var f=[]; f.push(s&&s.weatherLive?'live weather':'no live weather'); f.push(s&&s.featureLive?'live features':'static features'); if(L.modelLive) f.push('model run live'); if(L.provisional) f.push('provisional result'); if(L.noLakes) f.push('no inventory lakes');
      return {tier:L.tier, text:L.tier+' · '+f.join(', ')}; }catch(_){ return {tier:'unknown', text:'unknown'}; }
  };
   
  function evidenceClassFor(key){
    if(key==="seismic") return { cls:'B',
      why:'BCP SP-2007 Table 2.2 tehsil zones carried onto today\'s districts (highest zone of the district\'s tehsils); '
        + 'BCP 2021 Ss / S1 from the code maps. No live input and no site-specific hazard study.' };
    if(key==="cyclone") return { cls:'C',
      why:'Expert 37-entry coastal-segment table. No live input, no track model, and never '
        + 'calibrated against a landfall record.' };
    return null;
  }
  try{ window.AGN=window.AGN||{}; AGN.evidenceClassFor=evidenceClassFor; }catch(_){}

  function selectedHazards(){
    return Array.from(document.querySelectorAll("#asmtHazardChecks input:checked")).map(x=>x.value);
  }
  /* v91.17.270 (owner) · the level of a hazard at a place is the engine's (the map's source, GET /api/levels/unit through AGN.engineLevels):
     the highest level of the days the engine has issued for the tehsil that holds the place, with its day. Nothing is scored on this page for it. */
  function engineUnitOf(s){ try{ if(s&&s.__uid) return s.__uid; if(s&&s.lat!=null&&s.lon!=null&&window.AGN&&AGN.engineLevels){ var u=AGN.engineLevels.unitAt(+s.lat,+s.lon); if(u) return u; } }catch(_){} return districtFor(s); }
  function engineResult(s,key,asset,label){
    var EL=AGN.engineLevels, uid=engineUnitOf(s), E=EL.peek(uid), sd=!!(sensitivity[asset]&&sensitivity[asset][key]!=null);
    var base={key:key,label:label,score:null,screeningIndex:null,priority:null,categorical:false,sensitivity:sd?sensitivity[asset][key]:null,confidence:null,provisional:false,engineUnit:uid};
    if(!E){ EL.get(uid); return Object.assign(base,{status:'pending',driver:'Reading the hazard engine levels for this tehsil\u2026'}); }
    if(!E.days) return Object.assign(base,{status:'unavailable',driver:E.why||'the hazard engine did not answer'});
    var x=E.hz.filter(function(h){ return h.key===key; })[0];
    if(!x||!x.peak) return Object.assign(base,{status:'unavailable',notApplicable:!!(x&&x.notApplicable),driver:(x&&x.notApplicable)?'does not occur here':'no level from the hazard engine for this tehsil'});
    var cls=EL.classOf(x.peak.i)||'Low', HV=AGN.hazardValue;
    return Object.assign(base,{status:'available',available:true,engineLevel:x.peak.i,engineDate:x.peak.date,engineDay:x.peak.day,engineRow:x.row,engineAt:E.at,
      verdictClass:cls,classRank:(HV&&HV.verdictRank[cls])||1,driver:'NIGRAAN hazard engine (the map), '+EL.asOf(E)}); }
  function hazardResult(s,key,asset){
    const label=(hazardMeta.find(h=>h.key===key)||{}).label||key;
    if(!s || !sensitivity[asset]) return {key,label,score:null,driver:'Location or asset classification unavailable',provisional:true,sensitivity:null,confidence:null,priority:null,status:'unavailable'};
    if(key!=='seismic'&&key!=='cyclone') return (window.AGN&&AGN.engineLevels)?siteJoin(engineResult(s,key,asset,label),s,key)
      :{key,label,score:null,screeningIndex:null,priority:null,sensitivity:null,confidence:null,provisional:false,status:'pending',driver:'Reading the hazard engine levels for this tehsil\u2026'};
     
    const _urow=(s&&s.__unitKey&&window.DISTRICT_IN)?window.DISTRICT_IN[s.__unitKey]:null;
    

    const name=districtFor(s);
    let _dIn=null; try{ const _uk=(s&&s.__unitKey)||((window.DISTRICT_IN&&name&&window.DISTRICT_IN[name])?name:null); if(_uk&&typeof hzDayInput==='function'){ const _q=hzDayInput(_uk,key); if(_q&&!_q.__unavailable) _dIn=_q; } }catch(_){ _dIn=null; }
    const inp=_dIn?_dIn:(_urow?_urow:inputFor(s));
    let r={score:null,top:"Data not available",provisional:true};
    try{
      

      if(typeof hzScore==="function") r=hzScore(name,inp,key,24,name)||r;
      else r=_canonicalRefusal(key,'the canonical hazard engine is not loaded in this build');
    }catch(e){ console.warn("Assessment hazard failed",key,e);
               r=_canonicalRefusal(key,'the canonical hazard engine threw while scoring this '
                 +'hazard: '+String((e&&e.message)||e).slice(0,120)); }
    

    if(r && r.categorical===true){
      return {key,label,
              score:null, screeningIndex:null, priority:null,
              categorical:true,
              category:(r.category||null),
              categoryLabel:(r.categoryLabel||r.zoneLabel||null),
              evidenceClass:(r.evidenceClass||null),   /* v91.17.252 · W2 · C1-6 · track record (B) or hand table (C) */
              scaleType:(r.scaleType||'ordinal category'),
              driver:(r.top||'AI GEO NIGRAAN hazard engine'),
              provisional:!!r.provisional,
              sensitivity:(sensitivity[asset][key]||50),
              confidence:confidence(s,r,key),
              status:'categorical',
              basis:(r.scaleWhy||'a category, not a continuous screening index — it cannot be '
                    +'ranked against the scored hazards or drawn as a proportional bar')};
    }
    

    /* v91.17.270: every scored hazard is read from the engine above; a hazard that reaches here without a category has no level */
    return {key,label,score:null,screeningIndex:null,categorical:false,driver:(r&&r.top)||'no level for this hazard',provisional:true,sensitivity:(sensitivity[asset][key]||50),confidence:null,priority:null,status:'unavailable'};
  }
  function actionFor(row,asset){
    const a=assetNames[asset]||"asset";
    if(row.key==="flood"||row.key==="rain_hz") return `Check drainage, access, floor elevation and flood pathways for the ${a.toLowerCase()}.`;
    if(row.key==="heat") return `Review equipment derating, cooling, worker exposure and backup power for the ${a.toLowerCase()}.`;
    if(row.key==="wind") return `Verify certified wind design, anchoring and exposed components for the ${a.toLowerCase()}.`;
    if(row.key==="drought") return `Review water dependency, storage, supply redundancy and operating demand for the ${a.toLowerCase()}.`;
    if(row.key==="glof") return `Commission lake, flow-path and downstream corridor assessment before treating the signal as site risk.`;
    if(row.key==="seismic") return `Use code-based seismic hazard and structural vulnerability assessment for the ${a.toLowerCase()}.`;
    if(row.key==="cyclone") return `Review wind, surge, elevation, coastal defence and shutdown procedures for the ${a.toLowerCase()}.`;
    if(row.key==="cold") return `Review minimum temperature, freeze protection, snow or icing exposure and winter access.`;
    return `Commission a detailed assessment for the ${a.toLowerCase()}.`;
  }

  

  function hazardApplicability(key, s, asset){
    var t=null;
    try{ if(s && window.AGN && AGN.terrain) t=AGN.terrain.forStation(s); }catch(_){}
    

    var unitTerr=null, effSlope=null;
    try{
      var _k=(typeof districtFor==='function') ? districtFor(s) : null;
      if(_k && typeof hzTerrainFor==='function') unitTerr=hzTerrainFor(_k);
      if(unitTerr && typeof hzEffSlope==='function'){
        var _e=hzEffSlope(unitTerr);
        if(_e!=null && isFinite(_e)) effSlope=Number(_e);
      }
    }catch(_){}
    var slope=(t && t.slope_deg!=null) ? Number(t.slope_deg) : null;
    var elev =(s && s.elev!=null) ? Number(s.elev) : ((t && t.elev_m!=null) ? Number(t.elev_m) : null);
    var lat  =(s && s.lat!=null) ? Number(s.lat) : null;
    var lon  =(s && s.lon!=null) ? Number(s.lon) : null;
    var ON=function(w){ return {on:true, why:w}; };
    var OFF=function(w){ return {on:false, why:w}; };

    switch(key){
      case 'landslide':
        if(effSlope==null)
          return ON('Unit slope statistics not held, so landslide applicability is not '
                  + 'established. Screened rather than assumed absent.');
        if(effSlope < 12)
          return OFF('Effective slope ' + effSlope.toFixed(1) + '\u00b0 across this unit \u2014 below '
                   + 'the 12\u00b0 gate at which rainfall-triggered shallow failure becomes the '
                   + 'governing process. The method is ineligible here, so the engine produces no numerical score.');
        return ON('Effective slope ' + effSlope.toFixed(1) + '\u00b0 across this unit'
                + (slope!=null ? ' (point slope ' + slope.toFixed(1) + '\u00b0; the unit\u2019s '
                                 + 'surrounding relief governs, not the point)' : '') + '.');

      case 'glof':
        

        if(lat==null && elev==null)
          return ON('Location not resolved, so GLOF applicability is not established.');
        if((lat!=null && lat>=34.5) || (elev!=null && elev>=2000))
          return ON('Within the northern glaciated belt or above 2,000 m.');
        return OFF('Outside the glaciated catchments \u2014 no glacial lake drains to this site.');

      case 'cyclone':
        if(lat==null || lon==null)
          return ON('Location not resolved, so cyclone applicability is not established.');
        

        if(lat<=26.5 && lon>=61 && lon<=69.5)
          return ON('Within reach of an Arabian Sea landfall wind field.');
        return OFF('Inland of any Arabian Sea landfall wind field.');

      case 'seismic':
        return ON('The building code assigns a design-basis zone everywhere in Pakistan.');

      case 'cold':
        if(elev==null && lat==null)
          return ON('Location not resolved, so frost applicability is not established.');
        if((elev!=null && elev<200) && (lat!=null && lat<26))
          return OFF('Coastal lowland \u2014 no frost in the observed record.');
        return ON('Frost is credible at this latitude and elevation.');

      case 'drought':
        if(asset==='telecom' || asset==='bank')
          return OFF('This asset class has no material water dependency in the sensitivity matrix.');
        return ON('Water dependency applies to this asset class.');

      default:
        return ON('Applies to every site.');
    }
  }
  try{ window.hazardApplicability=hazardApplicability; }catch(_){}

  

  function refreshApplicability(){
    var hc=$("asmtHazardChecks"); if(!hc) return;
    

    var s=selectedStation(), asset=$("asmtAsset") ? $("asmtAsset").value : null;
    [].forEach.call(hc.querySelectorAll('input[type=checkbox]'), function(cb){
      var lab=cb.closest('label');
      var d=hazardApplicability(cb.value, s, asset);
      if(lab) lab.title=d.why;
      

      if(cb.dataset.agnUser!=='1') cb.checked=d.on;
      cb.dataset.agnDefault=String(d.on);
    });
  }
  try{ window.refreshApplicability=refreshApplicability; }catch(_){}

  function populate(){
    const loc=$("asmtLocation");
    if(loc) loc.innerHTML=stationList().map(s=>`<option value="${esc(s.id)}">${esc(s.name)} · ${Math.round(s.elev||0)} m</option>`).join("");
    const hc=$("asmtHazardChecks");
    

    if(hc) hc.innerHTML=hazardMeta.map(h=>{
      const d=hazardApplicability(h.key, selectedStation(), $("asmtAsset") ? $("asmtAsset").value : null);
      return `<label class="asmt-hcheck" title="${esc(d.why)}"><input type="checkbox" value="${h.key}" data-agn-default="${d.on}" ${d.on?"checked":""}>${esc(h.label)}</label>`;
    }).join("");
    syncCurrent();
  }
  

  function syncCurrent(force){
    const s=currentStation(), loc=$("asmtLocation");
    if(!loc) return;
    if(s) loc.value=s.id;
  }
   
function assessmentEvidenceId(){return 'AGN-ASMT-'+new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14)+'-'+String(Math.floor(Math.random()*9000)+1000);}
  function buildAssessmentEvidence(s,asset,life,horizon,rows,lead,readiness,subj){
    const inp=inputFor(s),available=rows.filter(r=>r.score!=null).length,B=window.AGN_BUILD||{};
    const validRaw=s.validTime||s.liveValidTime||s.forecastValidTime||s.liveFetchedAt||Date.now();
    const validFor=(typeof validRaw==='number'?new Date(validRaw):new Date(validRaw)).toISOString();
    return {calculation_id:assessmentEvidenceId(),calculated_at:new Date().toISOString(),valid_for:validFor,
      build:{product:B.product||'AI-GEO-NIGRAAN',version:B.version||'unknown',schema:B.dataSchema||null},
      formula_version:'AGN hazard screening engine v78.1',location:{id:s.id||null,name:s.name||null,latitude:s.lat,longitude:s.lon,elevation_m:s.elev||null},
      

      subject:(subj&&subj.ok)?{asset_id:subj.assetId,asset_name:subj.assetName,unit:subj.unit,
                               basis:'active client asset'}
                             :{asset_id:null,asset_name:null,unit:null,
                               basis:'location screen - no client asset is the subject',
                               why:(subj&&subj.why)||null},
      evidence_source:{kind:'weather station',name:s.name||null,id:s.id||null,
                       distance_km:(subj&&subj.km!=null)?subj.km:null,
                       representative:(subj&&subj.proxy!=null)?subj.proxy:null,
                       basis:(subj&&subj.basis)||null,
                       why:(subj&&subj.stationWhy)||null,
                       note:'where the readings came from, not what they are about'},
      asset:{class:asset,label:assetNames[asset]||asset,design_life_years:life,
             note:'fragility class only - this is not an asset identity'},horizon:{selected:horizon,status:horizon==='present'?'computed_present':'reporting_context_only'},
      source:{provider:s.liveSource||'seed_or_fallback',weather_live:!!s.weatherLive,feature_live:!!s.featureLive,retrieved_at:s.liveFetchedAt?new Date(s.liveFetchedAt).toISOString():null},
      inputs:inp,input_coverage:{available_hazards:available,selected_hazards:rows.length,fraction:rows.length?available/rows.length:0},
      evidence_readiness:readiness,leading_hazard:lead?{key:lead.key,label:lead.label,engine_level:(lead.engineLevel==null?null:lead.engineLevel),engine_day:lead.engineDate||null,score:lead.score,priority:lead.priority,evidence_readiness:lead.confidence,driver:lead.driver}:null,
      hazards:rows.map(r=>({key:r.key,label:r.label,status:r.status,not_applicable:!!r.notApplicable,engine_level:(r.engineLevel==null?null:r.engineLevel),engine_day:r.engineDate||null,engine_unit:r.engineUnit||null,score:r.score,priority:r.priority,evidence_readiness:r.confidence,driver:r.driver,provisional:r.provisional}))};
  }
  

  function assessmentSubject(){
    try{
      var d = (window.AGN && AGN.subject && AGN.subject.demand)
                ? AGN.subject.demand('assessments') : null;
      if(d && d.ok && d.subject && d.subject.asset_id){
        return { ok:true, s:d.subject,
                 assetId:d.subject.asset_id, assetName:d.subject.asset_name,
                 unit:d.subject.unit,
                 why:'the active client asset is the subject; the station below is the '
                    +'evidence its readings came from' };
      }
      return { ok:false, s:(d&&d.subject)||null,
               why:(d&&d.why)||'no coherent decision subject, so this is a location screen '
                              +'and names no asset' };
    }catch(_){ return { ok:false, s:null, why:'the decision subject could not be read' }; }
  }

  

  const PROXY_LIMIT_KM = 120;
  function _kmBetween(aLat,aLon,bLat,bLon){
    var R=6371,t=Math.PI/180,dLa=(bLat-aLat)*t,dLo=(bLon-aLon)*t;
    var h=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(aLat*t)*Math.cos(bLat*t)*Math.sin(dLo/2)*Math.sin(dLo/2);
    return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
  }
  function stationForSubject(subj){
    const chosen=selectedStation();
    

    if(!subj || !subj.ok || subj.s==null){
      try{
        var _u0=subj&&subj.s&&subj.s.unit, _r0=_u0?(window.DISTRICT_IN||{})[_u0]:null;
        if(chosen && !chosen.weatherLive && _r0 && (_r0.weatherLive||_r0.nationalLive)){
          return {station:Object.assign({}, chosen, {id:'__unit:'+_u0, name:_u0, __unitKey:_u0, weatherLive:true}), km:null, proxy:null,
                  basis:'tehsil '+_u0+' (the selected station’s live reading had not arrived)'};
        }
      }catch(_){}
      return {station:chosen,km:null,proxy:null,basis:'operator selection'};
    }
    const lat=subj.s.asset_lat, lon=subj.s.asset_lon;
    if(lat==null||lon==null)
      return {station:chosen,km:null,proxy:null,
              basis:'operator selection - the subject asset carries no coordinates'};
    let best=null,bestKm=Infinity;
    (stationList()||[]).forEach(function(st){
      if(!st||st.lat==null||st.lon==null) return;
      

      if(st.id==='__live' || st.__live===true && st.id!==undefined && String(st.id).indexOf('__')===0) return;
      const d=_kmBetween(lat,lon,Number(st.lat),Number(st.lon));
      if(d<bestKm){bestKm=d;best=st;}
    });
    

    

    try{
      var _one = (typeof stationFromRecord === 'function')
                   ? stationFromRecord({ latitude:Number(lat), longitude:Number(lon) }) : null;
      if(_one && _one.__unitKey){
        var _urow1 = (window.DISTRICT_IN || {})[_one.__unitKey] || {};
        var _ap1 = (window.AGN && AGN.assetPoint) ? AGN.assetPoint.peek(lat, lon, subj.s.asset_elev_m) : undefined;
        if(_ap1 === undefined && window.AGN && AGN.assetPoint) AGN.assetPoint.get(lat, lon, subj.s.asset_elev_m);
        var st1 = Object.assign({}, _one, { __guardStation:(best ? best.name : null), __guardKm:(best ? Math.round(bestKm) : null),
          name:(subj.assetName || _one.name),
          t:_urow1.t, feels:_urow1.feels, hum:_urow1.hum, wind:_urow1.wind, gust:_urow1.gust, rain:_urow1.rain, uv:_urow1.uv,
          soilMoist:_urow1.soilMoist, smRoot:_urow1.smRoot, vpd:_urow1.vpd,
          __screenBasis:'tehsil',
          pointNow:_ap1 ? { t:_ap1.t, feels:_ap1.feels, hum:_ap1.hum, wind:_ap1.wind, gust:_ap1.gust, rain:_ap1.rain,
                            elev:(_ap1.realElev!=null?_ap1.realElev:(_ap1.gridElev!=null?_ap1.gridElev:null)) } : null });
        return { station:st1, km:0, proxy:true,
                 basis:'tehsil '+_one.__unitKey+' contains the asset coordinate',
                 guardStation:best, guardKm:(best ? Math.round(bestKm) : null),
                 why:'hazard classes screened on tehsil '+_one.__unitKey+', which contains the asset coordinate ('
                    +Number(lat).toFixed(4)+', '+Number(lon).toFixed(4)+') - the same inputs the portfolio and the map use, '
                    +'so this asset carries one class everywhere. The point forecast at the coordinate drives the '
                    +'operating-limit crossings. '+(best ? 'The nearest station, '+best.name+', is '
                    +Math.round(bestKm)+' km away and is used for verification only.' : '') };
      }
    }catch(_e1){ try{ console.warn('[AGN] per-asset path: '+(_e1&&_e1.message)); }catch(_){} }
    var _ap = (window.AGN && AGN.assetPoint)
                ? AGN.assetPoint.peek(lat, lon, subj.s.asset_elev_m) : undefined;
    if(_ap === undefined && window.AGN && AGN.assetPoint){
      

      AGN.assetPoint.get(lat, lon, subj.s.asset_elev_m).then(function(){
        if(window.__asmtRerun) return; window.__asmtRerun = true;
        try{ if(typeof runAssessment === 'function') runAssessment(); }
        finally{ setTimeout(function(){ window.__asmtRerun = false; }, 0); }
      });
    }
    if(_ap){
      var apS = {
        id:'__assetpoint', name:(subj.assetName || 'the subject asset'),
        lat:Number(lat), lon:Number(lon),
        t:_ap.t, feels:_ap.feels, hum:_ap.hum, wind:_ap.wind, gust:_ap.gust,
        rain:_ap.rain, uv:_ap.uv, cond:_ap.cond, em:_ap.em, sev:_ap.sev,
        soilMoist:_ap.soilMoist, smRoot:_ap.smRoot, et0:_ap.et0, vpd:_ap.vpd,
        elev:(_ap.realElev!=null?_ap.realElev:(_ap.gridElev!=null?_ap.gridElev:null)),
        gridElev:_ap.gridElev, weatherLive:true, __live:true,
        liveSource:_ap.source||'mach', liveFetchedAt:_ap.fetchedAt||Date.now()
      };
      return {station:apS, km:0, proxy:true,
              basis:'point forecast at the asset coordinate',
              guardStation:best, guardKm:Math.round(bestKm),
              why:'screened at the asset\'s own coordinate ('+Number(lat).toFixed(4)+', '
                 +Number(lon).toFixed(4)+')'
                 +(apS.elev!=null?' at '+Math.round(apS.elev)+' m':'')
                 +'. The nearest station, '+best.name+', is '+Math.round(bestKm)+' km away and is '
                 +'carried as a verification guard, not as this asset\'s weather.'};
    }
    if(!best) return {station:chosen,km:null,proxy:null,basis:'no station carries coordinates'};
    return {station:best, km:Math.round(bestKm), proxy:bestKm<=PROXY_LIMIT_KM,
            basis:'nearest station to the subject asset (point forecast not yet retrieved)',
            why:bestKm<=PROXY_LIMIT_KM
                 ? best.name+' is '+Math.round(bestKm)+' km from the subject. The point forecast '
                  +'for the asset itself has not landed yet; this reading is a stand-in and the '
                  +'screening refreshes when it arrives.'
                 : 'the nearest station in this build ('+best.name+') is '+Math.round(bestKm)
                  +' km from the subject. That is beyond the '+PROXY_LIMIT_KM+' km this build '
                  +'will treat as a proxy, so these readings describe '+best.name+', not the '
                  +'subject, and the screening is reported as unrepresentative of the site.'};
  }

  function runAssessment(){
    const subj=assessmentSubject();
    const pick=stationForSubject(subj);
    const s=pick.station; if(!s)return;
    

    try{
      if(subj && subj.ok && window.AGN && AGN.project && AGN.project.activeAsset){
        var _aa=AGN.project.activeAsset();
        var _MAP={industrial:'industrial',manufacturing:'industrial',factory:'industrial',plant:'industrial',cement:'industrial',textiles:'industrial',textile:'industrial',oil_gas:'industrial','oil & gas':'industrial',oil:'industrial',mining:'industrial',chemical:'industrial',steel:'industrial',
                  hospital:'hospital',healthcare:'hospital',health:'hospital',
                  telecom:'telecom',telecommunications:'telecom',telco:'telecom',
                  energy:'energy',power:'energy',substation:'energy',utility:'energy',
                  transport:'transport','transport / logistics':'transport',logistics:'transport',road:'transport',bridge:'transport',port:'transport',
                  bank:'bank',banking:'bank','banking / finance':'bank',finance:'bank',insurance:'bank',
                  agriculture:'agriculture',farm:'agriculture',
                  water:'water','water / wastewater':'water',wastewater:'water',
                  commercial:'commercial','data centre':'commercial',data_centre:'commercial',retail:'commercial',office:'commercial'};
        var _cand=[_aa&&_aa.asset_type,_aa&&_aa.asset_subtype,_aa&&_aa.industry,_aa&&_aa.subtype].filter(Boolean).map(function(x){return String(x).trim().toLowerCase();});
        var _cls=null; for(var _ci=0;_ci<_cand.length&&!_cls;_ci++){ _cls=_MAP[_cand[_ci]]||null; }
        var _sel=$('asmtAsset');
        if(_cls && _sel && Array.prototype.some.call(_sel.options,function(o){return o.value===_cls;})) _sel.value=_cls;
      }
    }catch(_){}
    const asset=$('asmtAsset').value, life=null, horizon='present';
    let keys=selectedHazards(); if(!keys.length)keys=hazardMeta.map(h=>h.key);
    

    

    /* v91.17.272: the point scored is the asset's coordinate, else the searched place (the active point), never the city station */
    _asmtPt=(function(){ try{ if(subj&&subj.ok&&subj.s&&subj.s.asset_lat!=null&&subj.s.asset_lon!=null) return {lat:+subj.s.asset_lat,lon:+subj.s.asset_lon};
        var ap=AGN.data&&AGN.data.activePoint?AGN.data.activePoint():null; if(ap&&ap.lat!=null&&ap.lon!=null&&isFinite(ap.lat)&&isFinite(ap.lon)) return {lat:+ap.lat,lon:+ap.lon}; }catch(_){} return null; })();
    const _sitePt=_asmtPt; const rows=keys.map(k=>hazardResult(s,k,asset)).sort(hzOrder); _asmtPt=null;
    const available=rows.filter(r=>r.available), lead=available[0]||null;
     
    const leaders=hzLeaders(available);
    const confs=available.map(r=>r.confidence).filter(v=>v!=null).sort((a,b)=>a-b);
    const medConf=confs.length?Math.round(confs[Math.floor(confs.length/2)]):null;
    const contextOnly=horizon!=='present',evidence=contracts.evidence(buildAssessmentEvidence(s,asset,life,horizon,rows,lead,medConf,
        Object.assign({},subj,{km:pick.km,proxy:pick.proxy,basis:pick.basis,stationWhy:pick.why||null})),{section:'assessments',boundary:'freeze-evidence'});
    window.AGN_LAST_ASSESSMENT_EVIDENCE=evidence;
    if(assessmentWorkflow)assessmentWorkflow.createEvidence(evidence,{demo:true,source:'assessment-ui'}).catch(function(e){if(window.__MACH_DEBUG)console.debug('[assessment evidence repository]',e&&e.message);});
    state.assessment={sitePt:_sitePt,station:s,asset,life,horizon,contextOnly,rows,lead,
      

      subject:subj.s||null, subjectOk:subj.ok, subjectWhy:subj.why,
      assetId:subj.ok?subj.assetId:null, assetName:subj.ok?subj.assetName:null,
      subjectUnit:subj.ok?subj.unit:null,
      evidenceStation:s.name||null,
      stationKm:pick.km, stationProxy:pick.proxy, stationBasis:pick.basis, stationWhy:pick.why||null,
       
      guardStation:(pick.guardStation&&pick.guardStation.name)||null, guardKm:(pick.guardKm==null?null:pick.guardKm),
      

      leaders, coEqual:leaders.length>1,
      medConf,evidence,createdAt:new Date(),
      waterSnapshot:null, waterSnapshotState:'pending'};
    

    try{
      

      var _caseNow = (window.AGN && AGN.decisionCase && AGN.decisionCase.id)
                       ? AGN.decisionCase.id() : null;
      state.assessment.recordedAsEvidence = (_caseNow != null);
      

      state.assessment.notRecordedWhy = _caseNow ? null
        : ((typeof AGN.caseIdRefusal==='function'
              ? ('this screening result was not recorded as evidence: '
                 + AGN.caseIdRefusal((AGN.decisionCase.signature&&AGN.decisionCase.signature())||{}))
              : 'this screening result was not recorded as evidence: there is no decision '
                + 'case for it to be evidence of.')
           + ' The result on screen is unaffected; it is an exploratory screen until there '
           + 'is a case for it to belong to.');
      if(!_caseNow){
        try{ if(AGN.writeRefusal) AGN.writeRefusal('hazard_evidence',
               state.assessment.notRecordedWhy); }catch(_){ }
      }
      if(_caseNow && window.AGN && AGN.decisionCase && AGN.decisionCase.write){
        

        var _sigNow = (AGN.decisionCase.signature && AGN.decisionCase.signature()) || {};
        var _assetRec = null;
        try{ _assetRec = (AGN.project && AGN.project.activeAsset) ? AGN.project.activeAsset() : null; }catch(_){ }
        if(!_assetRec && asset!=null){
          try{
            var _rows=((AGN.project && AGN.project.state && AGN.project.state().assets)||[]);
            _assetRec=_rows.filter(function(a){
              return a && (String(a.asset_id)===String(asset) || String(a.name)===String(asset)); })[0]||null;
          }catch(_){ }
        }
        AGN.decisionCase.write('hazard_evidence', {
          kind:'screening_result',
          unit:(s&&s.name)||null,
          asset_name:(_assetRec && _assetRec.name) ? _assetRec.name
                     : (typeof asset==='string' && asset ? asset : null),
          lead_hours:(_sigNow.lead_hours==null?null:Number(_sigNow.lead_hours)),
          leading_hazard:(lead && lead.key) ? lead.key : null,
          leading_hazard_priority:(lead && lead.priority!=null) ? lead.priority : null,
          

          horizon:(_sigNow.horizon_id!=null?_sigNow.horizon_id:null),
          horizon_id:(_sigNow.horizon_id!=null?_sigNow.horizon_id:null),
          climate_horizon:horizon||null,
          context_only:!!contextOnly,
          rows:JSON.parse(JSON.stringify(rows||[])),
          median_confidence:(medConf==null?null:medConf),
          source:'NIGRAAN screening engine / assessment workspace',
          screened_at:new Date().toISOString()
        });
      }
    }catch(_){ }
    

    (function(){
      var __gen=state.assessment;
      function deepFreeze(o){
        if(o && typeof o==='object'){ Object.keys(o).forEach(function(kk){ deepFreeze(o[kk]); }); Object.freeze(o); }
        return o;
      }
      try{
        if(window.AGN && AGN.data && typeof AGN.data.water==='function' && s.lat!=null && s.lon!=null){
          AGN.data.water(s.lat, s.lon, {persist:false}).then(function(res){
            if(state.assessment!==__gen) return;
            var snap; try{ snap=JSON.parse(JSON.stringify(res||{})); }catch(_){ snap={}; }
            snap.lat=s.lat; snap.lon=s.lon; snap.unit=s.name||null;
            snap.fetchedAt=new Date().toISOString();
            

            var _wOk=(res && res.weatherAvailable===true);
            var _rOk=(res && res.riverAvailable===true);
            var _anyTerm=(snap.rain!=null||snap.antecedent!=null||snap.soilWet!=null||snap.river!=null);
            if((!_wOk && !_rOk) || !_anyTerm){
              state.assessment.waterSnapshot=null;
              state.assessment.waterSnapshotState='unavailable';
              return;
            }
            snap.availability=(_wOk&&_rOk)?'complete':'partial';
            snap.missingSources=[].concat(_wOk?[]:['rain/soil/antecedent'], _rOk?[]:['river discharge']);
            state.assessment.waterSnapshot=deepFreeze(snap);
            state.assessment.waterSnapshotState=(_wOk&&_rOk)?'ready':'partial';
            

            try{
              var _bf=null;
              try{
                var _fr=(state.assessment.rows||[]).find(function(x){ return x.key==='flood'; });
                _bf=(_fr&&_fr.score!=null)?_fr.score:null;
              }catch(_){}
              var _cr=null;
              try{ if(domain&&domain.compoundFlood&&_bf!=null) _cr=domain.compoundFlood(_bf,snap); }catch(_){}
              var _ce={
                kind:'compound_evidence',
                

                calculation_id:(function(){
                  var _p=(evidence&&(evidence.calculationId||evidence.calculation_id||evidence.id))||null;
                  return _p ? (_p+'-CMP') : ('CMP-'+Date.now());
                })(),
                assessment_calculation_id:(evidence&&(evidence.calculationId||evidence.calculation_id||evidence.id))||null,
                

                calculated_at:new Date().toISOString(),
                valid_for:snap.fetchedAt,
                location:snap.unit||null, lat:snap.lat, lon:snap.lon,
                fetched_at:snap.fetchedAt,
                availability:snap.availability||null,
                missing_sources:snap.missingSources||[],
                inputs:{
                  rain:snap.rain!=null?snap.rain:null,
                  antecedent:snap.antecedent!=null?snap.antecedent:null,
                  soil_wetness:snap.soilWet!=null?snap.soilWet:null,
                  river:snap.river||null
                },
                base_flood_score:_bf,
                compound_result:_cr,
                status:(_cr&&_cr.unavailable)?'unavailable':(_cr?'computed':(_bf==null?'no-base-flood-score':'not-computed'))
              };
              state.assessment.compoundEvidence=deepFreeze(_ce);
              

              if(assessmentWorkflow && typeof assessmentWorkflow.createEvidence==='function'){
                assessmentWorkflow.createEvidence(_ce,{demo:true,source:'assessment-compound'})
                  .catch(function(e){ if(window.__MACH_DEBUG) console.debug('[compound evidence]',e&&e.message); });
              }
            }catch(_){}
          }).catch(function(){
            if(state.assessment!==__gen) return;
            state.assessment.waterSnapshotState='unavailable';
          });
        } else { state.assessment.waterSnapshotState='unavailable'; }
      }catch(_){ state.assessment.waterSnapshotState='unavailable'; }
    })();
    try{
      if(window.AGN&&AGN.work&&typeof AGN.work.publishAssessment==='function'){
        AGN.work.publishAssessment({
          location:s.id||null, locationName:s.name||null,
          asset:asset, assetLabel:(typeof assetNames!=='undefined'?assetNames[asset]:asset),
          designLife:life, horizon:horizon, horizonStatus:contextOnly?'reporting_context_only':'computed_present',
          leadHazard:lead?lead.label:null, leadHazardKey:lead?lead.key:null,
          leadScore:lead?lead.score:null, priority:lead?lead.priority:null,
          confidence:lead?lead.confidence:null, evidenceReadiness:lead?lead.confidence:null, evidenceCompleteness:medConf, calculationId:evidence.calculation_id, validFor:evidence.valid_for, formulaVersion:evidence.formula_version, inputCoverage:evidence.input_coverage, provisional:!!(lead&&lead.provisional),
          hazards:rows.map(r=>({key:r.key,label:r.label,score:r.score,engineLevel:(r.engineLevel==null?null:r.engineLevel),status:r.status,
                                priority:r.priority,confidence:r.confidence,driver:r.driver})),
          evidence:evidence, structured:true, at:Date.now()
        });
      }
    }catch(_){}
    

    renderAssessment(); renderEngineering();
    if(!_reportFrozen()) generateReport(); else { try{ _renderFreezeState(); }catch(_){} }
  }
  function renderAssessment(){
    const a=state.assessment;if(!a)return;
    const horizonText=a.horizon==='present'?'present climate':a.horizon+'s reporting context only';
    /* v91.17.270: the levels are the engine's (the map's source), stated with the run they come from */
    (function(){ var E0=null; try{ var r0=(a.rows||[]).filter(function(r){ return r.engineUnit; })[0]; E0=r0&&AGN.engineLevels?AGN.engineLevels.peek(r0.engineUnit):null; }catch(_){}
      var sr=(a.rows||[]).filter(function(r){ return r.siteHz||r.sitePending; })[0], pt=a.sitePt||siteOf(a.station), SS=pt?AGN.siteScore.peek(pt.lat,pt.lon):null;
      $('asmtSummaryNote').textContent=`${assetNames[a.asset]} · ${a.station.name} · ${horizonText} · `+(SS&&SS.ok?'scored at the site ('+pt.lat.toFixed(4)+', '+pt.lon.toFixed(4)+(SS.point?', its own forecast':', the tehsil forecast: the forecast at the site did not answer')+')':(sr&&sr.sitePending?'scoring the site\u2026':'not scored at the site'))
        +' · area level: '+(E0&&E0.days?'the hazard engine for '+(SS&&SS.tehsil?SS.tehsil+' tehsil':'this tehsil')+' (the map) · '+AGN.engineLevels.asOf(E0):'reading the hazard engine\u2019s levels for this tehsil\u2026'); })();
    

    (function(){
       
      var L=hzLeadSummary(a.lead,a.leaders);
      $('asmtLead').textContent=L.text;
      $('asmtLeadScore').textContent=L.none?'\u2014':(L.leaders.length>1?'co-equal at '+L.word:L.word+((a.lead.siteDate||a.lead.engineDate)?' \u00b7 '+(a.lead.siteDate||a.lead.engineDate):'')+(a.lead.siteLevel!=null?(a.lead.siteCarried?' \u00b7 tehsil level':' \u00b7 at the site'):''));
    })();
    $('asmtConfidence').textContent=a.lead&&a.lead.evidenceTier?a.lead.evidenceTier.text:(a.lead&&a.lead.confidence!=null?a.lead.confidence+'%':'—');    
    $('asmtPriority').textContent=a.lead&&hzLevel(a.lead)!=null?AGN.level.words[hzLevel(a.lead)]:'—';
    $('asmtLeadNote').textContent=a.lead?a.lead.driver:'No hazard engine level for the selected hazards yet.';
    $('asmtStatus').textContent=a.contextOnly?'Present score · future horizon is reporting context':(a.lead&&a.lead.provisional?'Provisional inputs':'Preliminary screening');
    $('asmtStatus').className='asmt-pill '+(a.contextOnly||a.lead&&a.lead.provisional?'mod':'low');
    

    $('asmtResultsRows').innerHTML=a.rows.map(r=>{
      if(r.engineUnit){ const LW=(AGN.level&&AGN.level.words)||[], cl=['low','low','mod','high','high'], na=(r.notApplicable||/does not occur/.test(String(r.driver||'')));
        /* v91.17.272: the site's own level (its forecast, the page scoring code) and the engine's tehsil level beside it */
        const site=r.siteLevel!=null?`<span class="asmt-pill ${cl[r.siteLevel]}">${esc(LW[r.siteLevel])}</span> <span class="asmt-mut">${esc(r.siteDate||'')} · ${r.siteCarried?'tehsil level':'index '+r.siteScore+'/100'}</span>`
          :(r.sitePending?'<span class="asmt-mut">scoring the site…</span>':`<span class="asmt-mut">${esc(r.siteWhy||'not scored at the site')}</span>`);
        const area=r.engineLevel!=null?`<span class="asmt-pill ${cl[r.engineLevel]}">${esc(LW[r.engineLevel])}</span> <span class="asmt-mut">${esc(r.engineDate||'')}</span>`
          :(r.status==='pending'?'<span class="asmt-mut">reading the levels…</span>':(na?'<span class="asmt-pill agn-na84">Does not occur here</span>':'<span class="asmt-mut">no level</span>'));
        return `<tr>
      <td><b>${esc(r.label)}</b></td>
      <td>${site}</td><td>${area}</td>
      <td>${esc(r.siteDriver||r.driver)}${r.siteBasis?`<br><span class="asmt-mut">site: ${esc(r.siteBasis)}</span>`:''}</td><td>${r.sensitivity==null?'—':r.sensitivity+'/100'}</td>
    </tr>`; }
      if(r.categorical){
        const _cat=esc(r.categoryLabel||r.category||'category not resolved');
        return `<tr>
      <td><b>${esc(r.label)}</b></td>
      <td><span class="asmt-pill">${_cat}</span></td>
      <td><span class="asmt-mut">${esc((r.basis&&!/ranks severity WITHIN this hazard/.test(r.basis))?r.basis:'a code class, not a level')}</span></td>
      <td>${(r.driver&&r.driver!==(r.categoryLabel||r.category))?esc(r.driver):'—'}</td><td>${r.sensitivity==null?'—':r.sensitivity+'/100'}</td>
    </tr>`;
      }
      return `<tr>
      <td><b>${esc(r.label)}</b></td>
      <td><span class="asmt-mut">no level</span></td>
      <td>${(r.notApplicable||/too flat|not applicable|cannot occur|does not occur|no glacial lake|outside the cyclone/i.test(String(r.driver||'')+' '+String(r.basis||'')))?'<span class="asmt-mut">not applicable</span>':'<span class="asmt-mut">no reading yet</span>'}</td>
      <td>${esc(r.driver)}</td><td>${r.sensitivity==null?'—':r.sensitivity+'/100'}</td>
    </tr>`;}).join('')+'<tr class="asmt-footnote"><td colspan="5"><span class="asmt-mut">At the site: the hazard scored at this site\u2019s own location (its forecast at the coordinate and terrain height, the same scoring code as the map), the highest of the next days, with its day and 0\u2013100 screening index (the index ranks severity within one hazard and is not comparable across hazards). Area level: the hazard engine\u2019s level for the tehsil that holds the site (the map), for context. Heavy rain is levelled from the calibrated rain chance, which is issued by tehsil. A level is a screening level, not a probability. A category hazard carries a code class, not a level.</span></td></tr>';
    

     
    $('asmtEvidenceText').textContent=`Location inputs use ${a.station.weatherLive?'model weather refreshed in this session':'model weather that has not refreshed in this session (the last values held)'}. A missing input stays empty and is not scored. Evidence tier of the leading hazard: ${a.lead&&a.lead.evidenceTier&&a.lead.evidenceTier.text?String(a.lead.evidenceTier.text):'not stated'}${a.medConf!=null?'; overall evidence completeness '+a.medConf+'%':''}. ${a.contextOnly?'The selected future horizon is reporting context only and does not change the present hazard score.':''}`;
    
  }

  function showPane(name){
    if(name==="report"){ const nb=document.querySelector('#machNav [data-goto="report"]'); if(nb && !nb.classList.contains("active")){ nb.click(); return; } }
    else {
      document.querySelectorAll("#machAssessmentWorkspace .asmt-pane").forEach(p=>p.classList.toggle("active",p.dataset.asmtPane===name));
      document.querySelectorAll("#asmtTabs button").forEach(b=>{const on=b.dataset.asmt===name;b.classList.toggle("active",on);b.setAttribute("aria-selected",on?"true":"false");});
    }
    if(name==="engineering")renderEngineering();
    if(name==="report"){   if(_reportFrozen() && (_agnReportStale85() || _evidenceMoved())){ state.reportHtml=null; state.reportId=null; state.reportDoc=null; state.reportSnapshot=null; state.reportFingerprint=null; state.reportLiveAtFreeze=null; }
      if(!(window.AGN&&AGN.operator&&AGN.operator())) return;
      if(!_reportFrozen()) generateReport(); else { try{ _renderFreezeState(); }catch(_){} } }
  }
  function _agnSubjKey85(){ try{ var a=(window.AGN&&AGN.project&&AGN.project.activeAsset)?AGN.project.activeAsset():null; if(a&&a.asset_id) return 'asset:'+a.asset_id; }catch(_){}
    try{ var s=state.assessment&&state.assessment.station; if(s) return 'place:'+(s.id||s.name); }catch(_){} return null; }
  function _agnReportStale85(){ var k=_agnSubjKey85(); return !!(k && state.reportSubjKey && state.reportSubjKey!==k); }
  try{ window._agnSubjKey85=_agnSubjKey85; }catch(_){}
  

  function _ringHas(x,y,ring){
    var ins=false;
    for(var i=0,j=ring.length-1;i<ring.length;j=i++){
      var xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
      if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi)) ins=!ins;
    }
    return ins;
  }
  function _geomHas(g,x,y){
    if(!g) return false;
    var polys=g.type==='Polygon'?[g.coordinates]:(g.type==='MultiPolygon'?g.coordinates:[]);
    for(var p=0;p<polys.length;p++){
      var poly=polys[p]; if(!poly||!poly[0]) continue;
      if(_ringHas(x,y,poly[0])){
        var hole=false;
        for(var h=1;h<poly.length;h++){ if(_ringHas(x,y,poly[h])){ hole=true; break; } }
        if(!hole) return true;
      }
    }
    return false;
  }
  var _siteUnitCache={};
  function siteUnit(lat,lon){
    lat=Number(lat); lon=Number(lon);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)) return null;
    var ck=lat.toFixed(5)+','+lon.toFixed(5);
    if(Object.prototype.hasOwnProperty.call(_siteUnitCache,ck)) return _siteUnitCache[ck];
    var FC=window.PK_DISTRICTS, DI=window.DISTRICT_IN||{}, F=(FC&&FC.features)||[], out=null;
    for(var i=0;i<F.length;i++){
      var f=F[i], pr=f.properties||{};
      if(_geomHas(f.geometry,lon,lat)){
        var k=pr.key||pr.tehsil;
        out={ key:k, tehsil:pr.tehsil, district:pr.district, province:pr.province, uid:pr.uid,
              scored:!!DI[k],
              why:DI[k]?null:('the unit containing this site ('+(pr.tehsil||k)+') is held for display '
                             +'and is never scored in this build') };
        break;
      }
    }
    if(F.length) _siteUnitCache[ck]=out;
    return out;
  }
  try{ window.AGN=window.AGN||{}; AGN.siteUnit=siteUnit; }catch(_){}
  function distanceKm(a,b,c,d){const R=6371,to=x=>x*Math.PI/180;const p1=to(a),p2=to(c),dp=to(c-a),dl=to(d-b);const q=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.sqrt(q));}
  function stationFromRecord(r){
    const list=stationList();
    if(Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)){
      

      const _su=siteUnit(r.latitude,r.longitude);
      

      const _g=(function(){ var bst=null, bk=Infinity; list.forEach(function(st){
          if(!st || st.lat==null || st.lon==null || st.__live===true || String(st.id||'').indexOf('__')===0) return;
          var d=distanceKm(r.latitude,r.longitude,Number(st.lat),Number(st.lon)); if(d<bk){ bk=d; bst=st; } });
        return bst; })();
      const _gKm=_g?Math.round(distanceKm(r.latitude,r.longitude,Number(_g.lat),Number(_g.lon))*10)/10:null;
      if(_su && _su.scored){
        const _row=(window.DISTRICT_IN||{})[_su.key]||{};
        const _fa=(typeof _row.fcUpdatedAt==='number')?_row.fcUpdatedAt
                  :(_row.fcUpdatedAt?(Date.parse(_row.fcUpdatedAt)||null):null);
        return { id:'__unit:'+_su.key, name:_su.tehsil||_su.key,
                 lat:Number(r.latitude), lon:Number(r.longitude),
                 weatherLive:!!_row.weatherLive, featureLive:!!_row.forecastLive, fetchedAt:_fa,
                 __unitKey:_su.key, __district:_su.district, __province:_su.province, __uid:_su.uid,
                 __guardStation:_g?_g.name:null, __guardKm:_gKm,
                 __matchMethod:'tehsil '+(_su.tehsil||_su.key)+' ('+(_su.district||'')+') contains the site'
                               +(_g?(' · nearest station '+_g.name+' '+_gKm+' km, verification only'):''),
                 __matchDistanceKm:null, __matchConfidence:'high',
                 

                 t95:(function(){ var b=(window.AGN_CLIM_BASELINE||{})[_su.uid]||(window.AGN_CLIM_BASELINE||{})[_su.key]; return b?b.t95:undefined; })(),
                 t95Basis:(function(){ var b=(window.AGN_CLIM_BASELINE||{})[_su.uid]||(window.AGN_CLIM_BASELINE||{})[_su.key]; return b?Object.assign({},b.t95Basis,{unit:b.unit,unitKm:b.km}):undefined; })() };
      }
      

      if(_su && !_su.scored) return null;
      

      

      if(!_g){ try{ r.__locWhy='location: no Pakistan tehsil contains '+r.latitude+', '+r.longitude+' and no station is listed'; }catch(_){} return null; }
      if(_gKm>10){ try{ r.__locWhy='location: no Pakistan tehsil contains '+r.latitude+', '+r.longitude+', and the nearest station ('+_g.name+') is '+_gKm+' km away (a station stands in only within 10 km)'; }catch(_){} return null; }
      return Object.assign({},_g,{__matchMethod:'nearest coordinates (no tehsil holds this coordinate)',
                                  __matchDistanceKm:_gKm,
                                  __matchConfidence:_gKm<=25?'high':_gKm<=75?'moderate':'low'});
    }
    const q=String(r.location||'').trim().toLowerCase(); if(!q)return null;
    

    try{
      if(window.AGN && AGN.geo && AGN.geo.resolve){
        const _gr=AGN.geo.resolve(String(r.location).trim());
        const _DI=window.DISTRICT_IN||{};
        if(_gr && _gr.resolved && _gr.key && _DI[_gr.key]){
          const _row=_DI[_gr.key];
          return { id:'__unit:'+_gr.key, name:_gr.key, lat:null, lon:null,
                   weatherLive:!!_row.weatherLive, featureLive:!!_row.forecastLive,
                   __unitKey:_gr.key, __byNameOnly:true,
                   __matchMethod:'location name resolved to tehsil '+_gr.key
                                 +' (no coordinates supplied, so the site within it is not placed)',
                   __matchDistanceKm:null, __matchConfidence:'moderate' };
        }
      }
    }catch(_){}
    const exact=list.find(s=>s.name.toLowerCase()===q); if(exact)return Object.assign({},exact,{__matchMethod:'exact name',__matchDistanceKm:0,__matchConfidence:'high'});
    const fuzzy=list.filter(s=>s.name.toLowerCase().includes(q)||q.includes(s.name.toLowerCase()));
    if(fuzzy.length===1)return Object.assign({},fuzzy[0],{__matchMethod:'unique text match',__matchDistanceKm:null,__matchConfidence:'moderate'});
    return null;
  }
  function csvRows(text){
    const rows=[];let row=[],field='',quoted=false;
    const x=String(text||'');
    for(let i=0;i<x.length;i++){
      const c=x[i],n=x[i+1];
      if(c==='"'){
        if(quoted&&n==='"'){field+='"';i++;}else quoted=!quoted;
      }else if(c===','&&!quoted){row.push(field);field='';}
      else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&n==='\n')i++;row.push(field);if(row.some(v=>v.trim()!==''))rows.push(row);row=[];field='';}
      else field+=c;
    }
    row.push(field);if(row.some(v=>v.trim()!==''))rows.push(row);return rows;
  }
  

  const PORTFOLIO_FIELDS = [
    ["name",0,"Asset name. Required."],
    ["location",0,"Town or address. Used to place the asset when the coordinates are missing."],
    ["asset_type",["industrial","hospital","telecom","energy","transport","bank","agriculture","water","commercial"],"Asset class. Required. Factory, warehouse, port and similar words are read as their class."],
    ["latitude","n","Decimal degrees, WGS84. Without coordinates the location must match a place."],
    ["longitude","n","Decimal degrees, WGS84."],
    ["asset_id",0,"Your stable asset identifier. Every other template joins on it."],
    ["industry",0,"Sector, e.g. textiles, chemicals, energy."],
    ["subtype",0,"More specific class, e.g. dyeing_finishing, warehouse."],
    ["province",0,"Province or territory."],
    ["district",0,"District."],
    ["elevation_m","n","Ground level, m above sea level."],
    ["floor_elevation_m","n","Ground-floor level above the surrounding ground, m."],
    ["construction_type",0,"Primary structure, e.g. reinforced concrete frame, steel portal frame, masonry."],
    ["year_built","n","Year of construction."],
    ["flood_protection",["none","bund","floodwall","raised_platform","pumped_drainage"],"Flood defences at the site."],
    ["drainage_condition",["good","fair","poor","unknown"],"Condition and capacity of the site drains."],
    ["roof_type",0,"Roof construction and covering."],
    ["cooling_type",0,"How the building or process is cooled."],
    ["backup_power",["none","generator","ups","generator_and_ups","grid_dual_feed"],"Standby power at the site."],
    ["backup_duration_hr","n","Hours the standby power runs on its fuel."],
    ["condition_class",["good","fair","poor"],"Condition from the last inspection."],
    ["last_inspection",0,"Date of the last inspection, YYYY-MM-DD."],
    ["defects_open","n","Number of open defects."],
    ["maintenance_status",0,"Up to date, or what is overdue."],
    ["criticality","n","1 (lowest) to 5 (highest): how far loss of this asset stops the business."],
    ["maximum_tolerable_downtime_hr","n","Hours of stoppage the business can absorb."],
    ["recovery_time_hr","n","Hours to restore after a damaging event."],
    ["operating_hours",0,"Operating pattern, e.g. 24/7 or 08:00-18:00 Mon-Sat."],
    ["parent_company",0,"Legal entity that owns the asset."],
    ["business_unit",0,"Division or business unit."],
    ["geometry_id",0,"Id of the site boundary or route in the spatial templates."],
    ["data_owner",0,"Person or team accountable for the row."],
    ["source",0,"Where the figures come from: register, survey, insurer schedule."],
    ["last_updated",0,"Date the row was last checked, YYYY-MM-DD."]
  ];
  const PORTFOLIO_COLUMNS = PORTFOLIO_FIELDS.map(f=>f[0]);
   
  const PORTFOLIO_ALIAS={asset_name:'name',address:'location',type:'asset_type',asset_subtype:'subtype'};
  const PORTFOLIO_TYPE_ALIAS={factory:'industrial',plant:'industrial',mill:'industrial',warehouse:'commercial',office:'commercial',retail:'commercial',
    port:'transport',airport:'transport',road:'transport',bridge:'transport',rail:'transport',power:'energy',substation:'energy',solar:'energy',hydro:'energy',
    clinic:'hospital',health:'hospital',farm:'agriculture',dam:'water',reservoir:'water',datacentre:'telecom','data centre':'telecom',tower:'telecom',branch:'bank'};
   
  function gridRows(text){
    const x=String(text||''), first=x.split(/\r?\n/,1)[0]||'';
    if(first.indexOf('\t')<0 || first.indexOf(',')>=0) return csvRows(x);
    return x.split(/\r?\n/).map(l=>l.split('\t')).filter(r=>r.some(v=>v.trim()!==''));
  }
  

  function portfolioRecord(src){
    const o={}, notes=[];
    Object.keys(src||{}).forEach(k=>{ const c=String(k).trim().toLowerCase(), key=PORTFOLIO_ALIAS[c]||c, v=src[k];
      if(v!=null && String(v).trim()!=='' && (o[key]==null || o[key]==='')) o[key]=v; });
    const r={};
    PORTFOLIO_FIELDS.forEach(f=>{ const c=f[0], t=(o[c]==null?'':String(o[c]).trim());
      if(t===''){ r[c]=null; return; }
      if(f[1]==='n'){ const n=Number(t); if(Number.isFinite(n)) r[c]=n; else { r[c]=null; if(c!=='latitude'&&c!=='longitude') notes.push(c+' "'+t+'" is not a number (left blank)'); } return; }
      r[c]=t;
      if(Array.isArray(f[1]) && c!=='asset_type' && f[1].indexOf(t.toLowerCase())<0) notes.push(c+' "'+t+'" is not one of '+f[1].join(', ')); });
    r.name=r.name||'Unnamed asset';
    r.asset_type=(function(t){ t=(t||'').toLowerCase(); return PORTFOLIO_TYPE_ALIAS[t]||t; })(r.asset_type);
    if(r.latitude==null) r.latitude=NaN;
    if(r.longitude==null) r.longitude=NaN;
    if(notes.length) r.__intake=notes;
    return r;
  }
  function parseGrid(rows){
    if(!rows || rows.length<2) return [];
    const head=rows[0].map(h=>String(h==null?'':h));
    return rows.slice(1).filter(v=>v && v.some(x=>x!=null && String(x).trim()!==''))
      .map(v=>{ const o={}; head.forEach((h,i)=>{ o[h]=v[i]; }); return portfolioRecord(o); });
  }
  function parseCsv(text){ return parseGrid(gridRows(text)); }
  

  const PORTFOLIO_SAMPLE = [
    {asset_id:"DEMO-A1", name:"AJG farm house · Sheikhupura (AJG Supplies)", location:"Sheikhupura", unit:"Sheikhupura",
     asset_type:"agriculture", industry:"agriculture", subtype:"farm",
     latitude:31.7131, longitude:73.9783, elevation_m:211, province:"Punjab", district:"Sheikhupura", business_unit:"Agri supplies",
     floor_elevation_m:0.6, construction_type:"RCC frame, steel-truss roof over the produce shed", year_built:2004, flood_protection:"none", drainage_condition:"poor",
     cooling_type:"evaporative in the produce shed; split AC in the office", backup_power:"generator", backup_duration_hr:18,
     condition_class:"fair", last_inspection:"2025-11-14", defects_open:3, maintenance_status:"overdue: storm-drain desilting",
     criticality:3, maximum_tolerable_downtime_hr:48, recovery_time_hr:120,
     limits:[{variable:"temperature_2m", dir:"above", limit:42, authority:"site-rule", reference:"Sheikhupura farm-house field and shed shift rule (demonstration value)", actionMin:90, action:"Move field and loading work to the early shift"},
             {variable:"wind_gusts_10m", dir:"above", limit:65, authority:"agn-default", reference:"AGN screening default for light shed roofs (demonstration value)", actionMin:120, action:"Secure the shed roof sheeting and stop work at height"}]},
    {asset_id:"DEMO-A2", name:"AJG goods depot · Muridke (AJG Supplies)", location:"Muridke", unit:"Muridke",
     asset_type:"transport", industry:"transport", subtype:"warehouse",
     latitude:31.8022, longitude:74.2570, elevation_m:214, province:"Punjab", district:"Sheikhupura",
     floor_elevation_m:0.3, construction_type:"pre-engineered steel shed", year_built:2012, flood_protection:"none", drainage_condition:"fair",
     cooling_type:"none (ventilated)", backup_power:"none", backup_duration_hr:0,
     condition_class:"good", last_inspection:"2026-03-02", defects_open:1, maintenance_status:"up to date",
     criticality:3, maximum_tolerable_downtime_hr:72, recovery_time_hr:96,
     limits:[{variable:"precipitation", dir:"above", limit:20, authority:"site-rule", reference:"Muridke loading-bay drainage rule (demonstration value)", actionMin:180, action:"Activate the loading-bay flood procedure"},
             {variable:"wind_gusts_10m", dir:"above", limit:55, authority:"agn-default", reference:"AGN screening default for warehouse yard handling (demonstration value)", actionMin:60, action:"Stop yard lifting and secure stacked loads"}]},
    {asset_id:"DEMO-A3", name:"AJG port warehouse · Mauripur Road (AJG Supplies)", location:"Mauripur Road, Karachi", unit:"Karachi",
     asset_type:"transport", industry:"transport", subtype:"warehouse",
     latitude:24.8608, longitude:67.0104, elevation_m:8, province:"Sindh", district:"Keamari", business_unit:"Port logistics", geometry_id:"GEO-KHI-PLANT-01",
     floor_elevation_m:1.4, construction_type:"reinforced concrete frame", year_built:2011, flood_protection:"bund", drainage_condition:"good",
     roof_type:"insulated metal deck", cooling_type:"ventilated; air-conditioned bay for sensitive stock", backup_power:"generator", backup_duration_hr:48,
     condition_class:"fair", last_inspection:"2026-01-20", defects_open:5, maintenance_status:"overdue: roof-drain and gutter replacement",
     criticality:5, maximum_tolerable_downtime_hr:168,
     recovery_time_hr:168, operating_hours:"24/7, three shifts",
     limits:[{variable:"precipitation", dir:"above", limit:18, authority:"site-rule", reference:"HSE-KHI-07 bund-drain procedure (demonstration value)", actionMin:90, action:"Clear the bund drains and start the pumps"},
             {variable:"temperature_2m", dir:"above", limit:43, authority:"agn-default", reference:"AGN screening default for outdoor yard handling (demonstration value)", actionMin:180, action:"Move yard handling to shaded bays and the early shift"},
             {variable:"wind_speed_10m", dir:"above", limit:65, authority:"agn-default", reference:"AGN screening default for quay-side crane lifts (demonstration value)", actionMin:120, action:"Stop crane lifts and secure the container stacks"}]},
    {asset_id:"DEMO-A4", name:"AJG construction site · Jhimpir (AJG Supplies)", location:"Jhimpir, Thatta", unit:"Thatta",
     asset_type:"commercial", industry:"other", subtype:"other",
     latitude:25.0186, longitude:68.0143, elevation_m:40, province:"Sindh", district:"Thatta",
     floor_elevation_m:0.3, construction_type:"site works: steel frame under erection, site offices in containers", year_built:2026, flood_protection:"none", drainage_condition:"fair",
     cooling_type:"none (site offices air-conditioned)", backup_power:"generator", backup_duration_hr:8,
     condition_class:"good", last_inspection:"2026-05-11", defects_open:2, maintenance_status:"up to date",
     criticality:3, maximum_tolerable_downtime_hr:72, recovery_time_hr:240,
     limits:[{variable:"wind_gusts_10m", dir:"above", limit:50, authority:"manufacturer", reference:"Tower crane in-service gust limit, manufacturer (demonstration value)", actionMin:60, action:"Land the load, slew the crane free and stop lifting"},
             {variable:"temperature_2m", dir:"above", limit:40, authority:"site-rule", reference:"Concrete-pour temperature rule (demonstration value)", actionMin:120, action:"Move concrete pours to the night shift"}]},
    {asset_id:"DEMO-A5", name:"AJG logistics hub · Hattar Industrial Estate (AJG Supplies)", location:"Hattar Industrial Estate, Haripur", unit:"Haripur",
     asset_type:"transport", industry:"transport", subtype:"logistics_hub",
     latitude:33.8596, longitude:72.859, elevation_m:540, province:"Khyber Pakhtunkhwa", district:"Haripur",
     floor_elevation_m:0.4, construction_type:"steel portal frame", year_built:2009, flood_protection:"none", drainage_condition:"good",
     cooling_type:"ventilated", backup_power:"generator", backup_duration_hr:12,
     condition_class:"fair", last_inspection:"2025-09-30", defects_open:2, maintenance_status:"up to date",
     criticality:3, maximum_tolerable_downtime_hr:48, recovery_time_hr:96,
     limits:[{variable:"precipitation", dir:"above", limit:50, authority:"site-rule", reference:"Hattar estate drain-capacity rule (demonstration value)", actionMin:120, action:"Raise the stock in the dispatch bays off the floor"},
             {variable:"wind_gusts_10m", dir:"above", limit:70, authority:"agn-default", reference:"AGN screening default for light industrial roofs (demonstration value)", actionMin:90, action:"Secure roof sheeting and stop forklift work in the open yard"}]},
    {asset_id:"DEMO-A6", name:"AJG warehouse · Quetta Industrial Area (AJG Supplies)", location:"Quetta", unit:"Quetta",
     asset_type:"transport", industry:"transport", subtype:"warehouse",
     latitude:30.1798, longitude:66.975, elevation_m:1680, province:"Balochistan", district:"Quetta",
     floor_elevation_m:0.3, construction_type:"pre-engineered steel shed", year_built:2011, flood_protection:"none", drainage_condition:"fair",
     cooling_type:"none; heated liquid-stock bay", backup_power:"generator", backup_duration_hr:10,
     condition_class:"fair", last_inspection:"2025-12-02", defects_open:1, maintenance_status:"heater service due",
     criticality:3, maximum_tolerable_downtime_hr:72, recovery_time_hr:72,
     limits:[{variable:"temperature_2m", dir:"below", limit:-5, authority:"site-rule", reference:"Quetta warehouse frost rule for liquid stock (demonstration value)", actionMin:240, action:"Move liquid stock into the heated bay"},
             {variable:"wind_gusts_10m", dir:"above", limit:65, authority:"agn-default", reference:"AGN screening default for yard handling (demonstration value)", actionMin:60, action:"Stop yard lifting and secure stacked loads"}]},
    {asset_id:"DEMO-A7", name:"AJG cold store · Gilgit (AJG Supplies)", location:"Gilgit", unit:"Gilgit",
     asset_type:"industrial", industry:"agriculture", subtype:"cold_storage",
     latitude:35.9208, longitude:74.308, elevation_m:1500, province:"Gilgit-Baltistan", district:"Gilgit",
     floor_elevation_m:0.6, construction_type:"insulated panel on RCC base", year_built:2018, flood_protection:"floodwall", drainage_condition:"good",
     cooling_type:"ammonia refrigeration", backup_power:"generator", backup_duration_hr:36,
     condition_class:"good", last_inspection:"2026-04-18", defects_open:0, maintenance_status:"up to date",
     criticality:4, maximum_tolerable_downtime_hr:12, recovery_time_hr:120,
     limits:[{variable:"precipitation", dir:"above", limit:30, authority:"site-rule", reference:"Gilgit access-road closure rule (demonstration value)", actionMin:360, action:"Bring forward dispatch before the Karakoram Highway closes"},
             {variable:"temperature_2m", dir:"above", limit:32, authority:"site-rule", reference:"Cold-store compressor load rule (demonstration value)", actionMin:120, action:"Run the standby compressor"}]},
    {asset_id:"DEMO-A8", name:"AJG goods depot · Muzaffarabad (AJG Supplies)", location:"Muzaffarabad", unit:"Muzaffarabad",
     asset_type:"transport", industry:"transport", subtype:"warehouse",
     latitude:34.37, longitude:73.4711, elevation_m:740, province:"Azad Jammu and Kashmir", district:"Muzaffarabad",
     floor_elevation_m:0.5, construction_type:"RCC frame on a cut slope", year_built:2007, flood_protection:"none", drainage_condition:"poor",
     cooling_type:"none", backup_power:"generator", backup_duration_hr:8,
     condition_class:"poor", last_inspection:"2025-06-10", defects_open:6, maintenance_status:"overdue: retaining-wall drainage holes",
     criticality:3, maximum_tolerable_downtime_hr:96, recovery_time_hr:144,
     limits:[{variable:"precipitation", dir:"above", limit:40, authority:"site-rule", reference:"Neelum-side access and slope rule (demonstration value)", actionMin:240, action:"Suspend deliveries on the hill road and check the retaining wall"}]},
    {asset_id:"DEMO-A9", name:"AJG warehouse · I-9 Industrial Area (AJG Supplies)", location:"I-9, Islamabad", unit:"Islamabad",
     asset_type:"transport", industry:"transport", subtype:"warehouse",
     latitude:33.656, longitude:73.048, elevation_m:520, province:"Islamabad Capital Territory", district:"Islamabad",
     floor_elevation_m:0.3, construction_type:"pre-engineered steel shed on an RCC slab", year_built:2019, flood_protection:"none", drainage_condition:"good",
     cooling_type:"ventilated; air-conditioned bay for pharmaceutical stock", backup_power:"generator_and_ups", backup_duration_hr:24,
     condition_class:"good", last_inspection:"2026-06-01", defects_open:1, maintenance_status:"up to date",
     criticality:4, maximum_tolerable_downtime_hr:48, recovery_time_hr:48,
     limits:[{variable:"temperature_2m", dir:"above", limit:43, authority:"manufacturer", reference:"Pharmaceutical-bay air-conditioning design ambient, manufacturer design basis (demonstration value)", actionMin:120, action:"Start the standby AC units and move temperature-sensitive stock"},
             {variable:"precipitation", dir:"above", limit:45, authority:"site-rule", reference:"Loading-dock drain rule (demonstration value)", actionMin:120, action:"Clear the dock drains and raise stock off the floor"}]},
    {asset_id:"DEMO-A10", name:"AJG cold store · Lahore (AJG Supplies)", location:"Lahore", unit:"Lahore",
     asset_type:"industrial", industry:"agriculture", subtype:"cold_storage",
     latitude:31.558, longitude:74.35071, elevation_m:216, province:"Punjab", district:"Lahore", business_unit:"Cold chain", geometry_id:"GEO-LHR-MILL-01",
     floor_elevation_m:0.6, construction_type:"insulated panel on a steel portal frame", year_built:2008, flood_protection:"none", drainage_condition:"fair",
     roof_type:"insulated metal sheet", cooling_type:"ammonia refrigeration, evaporative condensers", backup_power:"generator_and_ups", backup_duration_hr:24,
     condition_class:"fair", last_inspection:"2026-02-10", defects_open:2, maintenance_status:"up to date",
     criticality:4, maximum_tolerable_downtime_hr:72,
     recovery_time_hr:96, operating_hours:"24/7, three shifts",
     limits:[{variable:"temperature_2m", dir:"above", limit:45, authority:"site-rule", reference:"HSE-LHR-03 heat rule for the dock and condensers (demonstration value)", actionMin:240, action:"Run the standby condenser and move dock loading to the early hours"}]}
  ];
   
  var AGN_DEMO_COMPANY = "AJG Supplies — DEMONSTRATION sites (invented)";
  try{ window.AGN_DEMO_COMPANY = AGN_DEMO_COMPANY; }catch(_){}
   
  function portfolioTemplateGrid(){
    const seen={}, rows=samplePortfolio().filter(o=>{ if(seen[o.asset_type]) return false; seen[o.asset_type]=true; return true; });
    return [PORTFOLIO_COLUMNS.slice()].concat(rows.map(o=>PORTFOLIO_COLUMNS.map(c=>o[c]==null?'':o[c])));
  }
  function portfolioTemplateCsv(){
    const esc=v=>{ const t=String(v==null?'':v); return /[",\n]/.test(t) ? '"'+t.replace(/"/g,'""')+'"' : t; };
    return portfolioTemplateGrid().map(r=>r.map(esc).join(",")).join("\n")+"\n";
  }
  try{ window.PORTFOLIO_COLUMNS=PORTFOLIO_COLUMNS;
       window.PORTFOLIO_SAMPLE=PORTFOLIO_SAMPLE;
       window.samplePortfolio=samplePortfolio; }catch(_){}

  

  function samplePortfolio(){
    return PORTFOLIO_SAMPLE.map(function(o){
      return Object.assign(JSON.parse(JSON.stringify(o)), { parent_company:'AJG Supplies',
        origin:'sample', demo:true, origin_company:AGN_DEMO_COMPANY, source:'DEMONSTRATION register (invented client)' });
    });
  }
  try{ window.AGN=window.AGN||{};
       AGN.portfolio={ intake:portfolioIntake() }; }catch(_){}

   
  function hasNum(v){ return v!=null && String(v).trim()!=='' && Number.isFinite(Number(v)); }
  

  function portfolioIntake(){
    function take(records){
      screenPortfolio(records);
      const p=state.portfolio||[], used={}, issues=[];
      records.forEach(function(r,i){
        const j=p.findIndex(function(x,k){ return !used[k] && (r.asset_id ? String(x.asset_id)===String(r.asset_id) : x.name===r.name); });
        const x=j>=0?p[j]:null; if(j>=0) used[j]=1;
        const notes=((x&&x.gaps)||[]).concat(r.__intake||[]);
        if(notes.length) issues.push({row:i+1, name:r.name, status:x?x.status:'not in the register', notes:notes}); });
      const st=function(k){ return p.filter(function(x){ return x.status===k; }).length; };
      return {rows:records.length, screened:st('screened'), rejected:st('rejected'), unavailable:st('unavailable'), issues:issues};
    }
    return { fields:PORTFOLIO_FIELDS.map(function(f){ return {name:f[0], number:f[1]==='n', allowed:Array.isArray(f[1])?f[1].slice():null, note:f[2]}; }),
             alias:Object.assign({},PORTFOLIO_ALIAS), templateGrid:portfolioTemplateGrid, templateCsv:portfolioTemplateCsv,
             fromText:function(t){ return take(parseCsv(t)); },
             fromGrid:function(g){ return take(parseGrid(g)); },
             fromObjects:function(list){ return take((list||[]).map(portfolioRecord)); } };
  }
  function screenPortfolio(records, opts){
    

    const _seen={};
    if(!(opts && opts.fromProject)) state.dupRows=[];
    if(opts && opts.fromProject && Array.isArray(state.dupRows) && state.dupRows.length){
      const ids={}; records.forEach(function(r){ if(r&&r.asset_id!=null) ids[String(r.asset_id).trim()]=1; });
      records=records.concat(state.dupRows.filter(function(d){ return ids[String(d.asset_id).trim()]; }).map(function(d){ return Object.assign({},d); }));
    }
    state.portfolio=records.map((r,_ix)=>{
      const _aid=(r.asset_id!=null&&String(r.asset_id).trim()!=='')?String(r.asset_id).trim():null;
      if(_aid && _seen[_aid]!=null){ if(!(opts&&opts.fromProject)){ state.dupRows=state.dupRows||[]; state.dupRows.push(Object.assign({},r)); } return {...r,station:null,asset_type:r.asset_type||'unclassified',lead:null,confidence:null,priority:null,
          gaps:['duplicate asset_id '+_aid+' (row '+(_seen[_aid]+1)+' kept, this row '+(_ix+1)+' rejected)'],status:'rejected',duplicateOf:_seen[_aid],matchMethod:null,matchDistanceKm:null,matchConfidence:null}; }
      if(_aid) _seen[_aid]=_ix;
      const st=stationFromRecord(r), knownAsset=!!sensitivity[r.asset_type], gaps=[];
      if(!Number.isFinite(r.latitude)||!Number.isFinite(r.longitude))gaps.push('coordinates');
      if(!r.asset_type||!knownAsset)gaps.push('recognized asset type');
      if(!st)gaps.push(r.__locWhy||'defensible location match');
      if(st&&st.__matchConfidence==='low')gaps.push('location match confidence too low');
      if(!st||st.__matchConfidence==='low'||!knownAsset)return {...r,station:st,asset_type:r.asset_type||'unclassified',lead:null,confidence:null,priority:null,gaps,status:'rejected',matchMethod:st&&st.__matchMethod,matchDistanceKm:st&&st.__matchDistanceKm,matchConfidence:st&&st.__matchConfidence};
      

      const _allHz=hazardMeta.map(h=>hazardResult(st,h.key,r.asset_type)), results=_allHz.filter(x=>x.status==='available').sort(hzOrder);
      const lead=results[0]||null;
       
      const leaders=hzLeaders(results);
      return {...r,asset_type:r.asset_type,station:st,lead,leaders,leadSummary:hzLeadSummary(lead,leaders),pending:_allHz.some(x=>x.status==='pending'||x.sitePending),
        confidence:lead?lead.confidence:null,priority:lead?lead.priority:null,gaps,status:lead?'screened':'unavailable',matchMethod:st.__matchMethod,matchDistanceKm:st.__matchDistanceKm,matchConfidence:st.__matchConfidence};
    });
    

    try{
      if(window.AGN && AGN.project && typeof AGN.project.syncAssets === 'function'){
        AGN.project.syncAssets();
      }
    }catch(e){ try{ console.warn('[AGN] portfolio -> project sync failed: '+(e&&e.message)); }catch(_){} }
    renderPortfolio();
  }
  

  /* v91.17.270: when the engine's levels for a tehsil land, the screening that waited for them is made again */
  function rescreenEngine(){ state.portfolio=state.portfolio.map(function(r){ if(!r||r.status==='rejected'||!r.station) return r;
      var all=hazardMeta.map(h=>hazardResult(r.station,h.key,r.asset_type)), res=all.filter(x=>x.status==='available').sort(hzOrder), lead=res[0]||null, leaders=hzLeaders(res);
      return Object.assign({},r,{lead:lead,leaders:leaders,leadSummary:hzLeadSummary(lead,leaders),confidence:lead?lead.confidence:null,priority:lead?lead.priority:null,status:lead?'screened':'unavailable',pending:all.some(x=>x.status==='pending'||x.sitePending)}); });
    try{ if(window.AGN&&AGN.project&&typeof AGN.project.syncAssets==='function') AGN.project.syncAssets(); }catch(_){}
    renderPortfolio(); }
  var _engT=null; document.addEventListener('agn:engine-levels',function(){ clearTimeout(_engT); _engT=setTimeout(function(){ try{
      if(state.portfolio&&state.portfolio.some(function(r){ return r&&r.pending; })) rescreenEngine();
      if(state.assessment&&state.assessment.rows&&state.assessment.rows.some(function(r){ return r&&r.status==='pending'; })) runAssessment(); }catch(_){} },250); });
  /* v91.17.272: when a site's own score lands, the screening that waited for it is made again */
  var _siteT=null; document.addEventListener('agn:site-score',function(){ clearTimeout(_siteT); _siteT=setTimeout(function(){ try{
      if(state.portfolio&&state.portfolio.some(function(r){ return r&&r.pending; })) rescreenEngine();
      if(state.assessment&&state.assessment.rows&&state.assessment.rows.some(function(r){ return r&&r.sitePending; })) runAssessment(); }catch(_){} },300); });
  function renderPortfolio(){
    const p=state.portfolio, screened=p.filter(x=>x.lead&&x.status!=='rejected');
    $('asmtPortCount').textContent=p.length;
    (function(){ var el=$('asmtPortAsOf'); if(!el) return; var u=null; p.some(function(r){ if(r&&r.lead&&r.lead.engineUnit){ u=r.lead.engineUnit; return true; } return false; });
      var E=u&&AGN.engineLevels?AGN.engineLevels.peek(u):null; el.textContent=E&&E.days?'Hazard engine '+AGN.engineLevels.asOf(E)+'.':(p.some(function(r){ return r&&r.pending; })?'Reading the hazard engine levels\u2026':''); })();
    

     
    

    (function(){
      var by={}, n=0;
      screened.forEach(function(x){ var L=x.leadSummary||hzLeadSummary(x.lead,x.leaders); if(L.none) return; n++; by[L.word]=(by[L.word]||0)+1; });
      $('asmtPortHigh').textContent=n+' of '+screened.length+' screened';
      var order=(window.AGN&&AGN.level&&AGN.level.words)?AGN.level.words.slice().reverse():Object.keys(by);
      var el=$('asmtPortHighBy'); if(el) el.textContent=n?order.filter(function(w){ return by[w]; }).map(function(w){ return by[w]+' '+w; }).join(' \u00b7 '):'every leading hazard at Normal';
    })();
    

    

    const required=p.length*4,present=p.reduce((n,r)=>n+(r.name?1:0)+(sensitivity[r.asset_type]?1:0)
      +((hasNum(r.latitude)&&hasNum(r.longitude))?1:0)+((r.station&&r.status!=='rejected')?1:0),0);
    $('asmtPortComplete').textContent=p.length?Math.round(present/required*100)+'%':'—';
    try{ $('asmtPortComplete').title=present+' of '+required+' fields usable (name, recognised type, coordinates, accepted location match)'; }catch(_){}
    

    (function(){
      var _n=p.filter(function(r){ return String(r.origin||'')==='sample'; }).length;
      var host=document.getElementById('asmtPortfolioBanner');
      if(!host){
        var wrap=$('asmtPortfolioRows'); if(!wrap) return;
        var tbl=wrap.closest('.asmt-tablewrap')||wrap.parentElement;
        host=document.createElement('div'); host.id='asmtPortfolioBanner';
        if(tbl&&tbl.parentElement) tbl.parentElement.insertBefore(host, tbl);
      }
      if(!_n){ host.hidden=true; host.textContent=''; return; }
      host.hidden=false;
      host.setAttribute('role','note');
      host.style.cssText='margin:0 0 10px;padding:9px 12px;border-radius:9px;'
        +'border:1px solid #b8860b;background:#fdf6e3;color:#6b4d05;font-weight:700;'
        +'font-size:0.8125rem;line-height:1.45';
      

      host.textContent='DEMONSTRATION DATA — '+_n+' of '+p.length+' rows below belong to '
        +'the AJG Supplies sample. The sites, their values and their limits are invented for the '
        +'demonstration and are not AJG records. The locations are real places in Pakistan, so the '
        +'screening is real weather at a real place — but no '
        +'figure derived from these rows is fit for a client document or a disclosure.';
    })();
    $('asmtPortfolioRows').innerHTML=p.length?p.map(r=>`<tr${String(r.origin||'')==='sample'?' data-agn-origin="sample"':''}>
      <td><b>${esc(r.name)}</b>${String(r.origin||'')==='sample'?' <span class="asmt-pill" style="background:#fdf6e3;color:#6b4d05;border:1px solid #b8860b" title="AJG Supplies sample — DEMONSTRATION site. The asset record and its value are invented, not AJG records; the location is a real place in Pakistan.">DEMO</span>':''}</td><td>${esc(assetNames[r.asset_type]||r.asset_type||'Unclassified')}</td><td>${esc(r.station?r.station.name:'Rejected')}</td>
      <td>${(r.pending&&!r.lead)?'reading the levels\u2026':(r.leadSummary?esc(r.leadSummary.text):'—')}</td><td>${(r.lead&&(r.lead.siteDate||r.lead.engineDate)&&r.leadSummary&&!r.leadSummary.none)?esc(r.lead.siteDate||r.lead.engineDate):'—'}</td><td>${r.confidence==null?'—':r.confidence+'%'}</td>
      <td>${(r.lead&&hzLevel(r.lead)!=null)?`<span class="asmt-pill ${['low','low','mod','high','high'][hzLevel(r.lead)]}">${esc(AGN.level.words[hzLevel(r.lead)])}</span>${(r.lead.siteLevel!=null&&r.lead.engineLevel!=null)?(r.lead.siteCarried?' <span class="asmt-mut">tehsil level</span>':` <span class="asmt-mut">at the site · area ${esc(AGN.level.words[r.lead.engineLevel])}</span>`):''}`:(r.pending?'<span class="asmt-mut">reading the levels\u2026</span>':'<span class="asmt-pill high">Not screened</span>')}</td>
      <td>${esc([r.matchMethod?r.matchMethod+(r.matchDistanceKm!=null?' · '+r.matchDistanceKm+' km':''):'no match'].concat(r.gaps||[]).join('; '))}</td></tr>`).join(''):`<tr><td colspan="8">No portfolio loaded.</td></tr>`;
    

     
    const raised=screened.filter(function(r){ return !(r.leadSummary||hzLeadSummary(r.lead,r.leaders)).none; });
    const top=raised.slice().sort(AGN_ASSET_ORDER.compare).slice(0,3);
    $('asmtPortActions').innerHTML=top.length?top.map(function(r,i){ var L=r.leadSummary||hzLeadSummary(r.lead,r.leaders);
        return `<div class="asmt-nextitem"><span class="n">${i+1}</span><div><h4>${esc(r.name)} · ${esc(L.text)}</h4><p>${esc(L.word)}. ${L.leaders.map(function(x){ return esc(actionFor(x,r.asset_type)); }).join(' ')}</p></div></div>`; }).join('')
      :(screened.length
        ? `<div class="asmt-nextitem"><span class="n">0</span><div><h4>No hazard above Normal at any screened asset</h4><p>${screened.length} asset${screened.length>1?'s':''} screened on the hazard engine’s issued days; the list fills when a leading hazard rises above Normal.</p></div></div>`
        : (p.some(function(r){ return r&&r.station&&r.status!=='rejected'; })
          ? `<div class="asmt-nextitem"><span class="n">!</span><div><h4>No level from the hazard engine yet</h4><p>The engine has issued no level for the tehsils that hold these assets; the list fills when it does.</p></div></div>`
          : `<div class="asmt-nextitem"><span class="n">!</span><div><h4>No defensible portfolio matches</h4><p>Correct location and asset-type fields before screening.</p></div></div>`));
  }

  

  function engineeringRowsFor(s){
    var rows=engineeringRows(), j=(s&&s.t95Climatology)||null;
    if(!j){ try{ var B=window.AGN_CLIM_BASELINE||{}; j=(s&&(B[s.__uid]||B[s.__unitKey]))||null;
      if(!j&&s&&s.name){ for(var k in B){ if(B[k]&&B[k].name===s.name){ j=B[k]; break; } } } }catch(_){ j=null; } }
    var E=j&&j.engineering&&j.engineering.rows; if(!E) return rows;
    return rows.map(function(r){ var e=E[r[0]]; if(!e) return r;
      return [r[0], e.context?esc(e.context):r[1], r[2], (e.status==='Partial'||e.status==='Blocked')?e.status:r[3], e.gate?esc(e.gate):r[4]]; });
  }
  if(!window.__agnEngListen){ window.__agnEngListen=true;
    document.addEventListener('agn:eng-baseline',function(){ try{ renderEngineering(); }catch(_){} }); }
  function engineeringRows(){
    return [
      ["Extreme rainfall / IDF","Current rate and forecast context","10, 20, 50 and 100-year depth and intensity","Blocked","Quality-controlled sub-daily archive, station bias correction and GEV/POT analysis"],
      ["Extreme temperature","Current air and apparent temperature","Annual extreme maximum, minimum and design percentiles","Blocked","Long historical series, homogenisation, extremes analysis and future adjustment"],
      ["Basic wind speed","Current gust context","Code-compatible return-period wind speed","Blocked","Validated gust archive, exposure correction and engineering-code mapping"],
      ["Flood design level","AI GEO NIGRAAN flood screening signal","Depth, velocity, duration and return period","Blocked","Hydrology, hydraulics, DEM, cross sections, structures and calibration"],
      ["Heat stress design","Wet-bulb and apparent-temperature context","Worker and equipment design thresholds","Partial","Validated hourly heat, humidity and operational exposure criteria"],
      ["Future climate factor","Bounded scenario offset only","Asset-life scenario adjustment with uncertainty","Blocked","Downscaled CMIP6 ensemble, bias correction and scenario governance"]
    ];
  }
  function renderEngineering(){
    const a=state.assessment||null,s=a?a.station:selectedStation();if(!s)return;
    

    const c=typeof stationComfort==="function"?stationComfort(s):{feels:(s.feels!=null?s.feels:s.t),wb:null,wbUnavailable:'the comfort engine did not load for this view'};
    $("asmtEngCurrent").innerHTML=[
      ["Air temperature",Math.round(s.t)+"°C","Current context"],
      ["Apparent temperature",Math.round(c.feels||s.feels||s.t)+"°C","Human and cooling load"],
      ["Wind gust",Math.round(s.gust||s.wind*((typeof FR==='function')?FR('wind.gustFromWindK'):1.5))+" km/h","Current or model context"],
      ["Rain rate",(s.rain!=null?Number(s.rain).toFixed(1)+" mm/h":(typeof NODATA_GLYPH!=="undefined"?NODATA_GLYPH:"\u2014")),"Current intensity context"]
    ].map(x=>`<div class="asmt-readycell"><span>${x[0]}</span><b>${x[1]}</b><em>${x[2]}</em></div>`).join("");
    $("asmtEngRows").innerHTML=engineeringRowsFor(s).map(r=>`<tr><td><b>${r[0]}</b></td><td>${r[1]}</td><td>${r[2]}</td><td><span class="asmt-pill ${r[3]==="Partial"?"mod":"high"}">${r[3]}</span></td><td>${r[4]}</td></tr>`).join("");
    renderEngStress();
  }
  function renderEngStress(){
    const s=state.assessment?state.assessment.station:selectedStation();if(!s)return;
    const h=$("asmtEngHorizon")?$("asmtEngHorizon").value:"2050";
    

    

    

    const OFFSETS={present:{t:0,r:1,w:1},2030:{t:.8,r:1.06,w:1.02},2050:{t:1.7,r:1.12,w:1.04}};
    const OFFSET_BASIS='fixed national screening offsets, uniform across Pakistan; '
      +'a direction screen, not a downscaled projection for this unit '
      +'(horizon status: experimental)';
    const off=OFFSETS[h];
    if(!off){
      $("asmtEngStress").innerHTML='<div class="asmt-kpi"><span>Scenario horizon</span>'
        +'<b>Not supported</b><small>'+esc(String(h))+' is outside the climate source in this '
        +'build, which ends at 2050. No offset is defined for it and none is assumed.</small></div>';
      const _pv0=$("asmtEngProvenance");
      if(_pv0) _pv0.innerHTML='<b>Baseline:</b> <span class="refuse">not applicable.</span> '
        +'The selected horizon has no declared offset in this build.';
      return;
    }
    

    const _climT = (s && s.t95!=null && isFinite(s.t95)) ? Number(s.t95)
                 : (s && s.tm30!=null && isFinite(s.tm30)) ? Number(s.tm30) : null;
    

    const _climBasis = (function(){
      var b = (s && s.t95!=null && isFinite(s.t95)) ? (s.t95Basis||null)
            : (s && s.tm30!=null && isFinite(s.tm30)) ? (s.tm30Basis||null) : null;
      if(b && b.statistic) return b.statistic;
      if(s && s.t95!=null && isFinite(s.t95)) return 'a 95th-percentile value with no recorded basis';
      if(s && s.tm30!=null && isFinite(s.tm30)) return 'a mean value with no recorded basis';
      return null;
    })();
    const _nd = (typeof NODATA_GLYPH!=='undefined'?NODATA_GLYPH:'\u2014');

    

    const _basis = (s && s.t95!=null && isFinite(s.t95)) ? (s.t95Basis||null)
                 : (s && s.tm30!=null && isFinite(s.tm30)) ? (s.tm30Basis||null) : null;
    const _isClim = !!(_basis && _basis.isClimatology === true);
    const _projectable = (_climT!=null && _isClim);

    

    const _ratedRaw = $("asmtEngRatedT") ? String($("asmtEngRatedT").value||'').trim() : '';
    const _rated = (_ratedRaw!=='' && isFinite(Number(_ratedRaw))) ? Number(_ratedRaw) : null;
    const _stressT = _projectable ? (_climT+off.t) : null;
    let _headCell, _headNote, _headCls='';
    if(_rated==null){
      _headCell = _nd+' — no rated limit entered';
      _headNote = 'enter this asset\u2019s design temperature limit from your own records. '
                + 'The platform does not hold design bases and will not assume one.';
    } else if(_stressT==null){
      _headCell = _nd+' — no projectable stressor';
      _headNote = 'the rated limit is '+_rated.toFixed(1)+' \u00b0C, but there is no baseline this '
                + 'scenario can be applied to, so there is nothing to compare it against.';
    } else {
      const _gap = _rated - _stressT;
      _headCls = _gap >= 0 ? 'head' : 'exceed';
      _headCell = (_gap>=0 ? '+' : '') + _gap.toFixed(1) + ' \u00b0C '
                + (_gap>=0 ? 'headroom' : 'exceedance');
      _headNote = 'rated '+_rated.toFixed(1)+' \u00b0C against a scenario stressor of '
                + _stressT.toFixed(1)+' \u00b0C. '
                + (_gap>=0 ? 'The stressor stays inside the rated limit under this scenario.'
                           : 'The stressor exceeds the rated limit under this scenario.');
    }

    

    

    const ENG_VERDICT = {
      possible: 'Screening comparison possible',
      needAsset: 'Engineering input required',
      none: 'Cannot assess',
      

      na: 'Not applicable'
    };
    function engRow(param, climate, climateClass, asset, note, assetCls, notApplicable){
      

      var v = (notApplicable === true) ? ENG_VERDICT.na
            : (climate == null) ? ENG_VERDICT.none
            : (asset == null)   ? ENG_VERDICT.needAsset
                                : ENG_VERDICT.possible;
      var cls = (v === ENG_VERDICT.possible) ? 'eng-v-ok'
              : (v === ENG_VERDICT.needAsset) ? 'eng-v-need'
              : (v === ENG_VERDICT.na) ? 'eng-v-na' : 'eng-v-none';
      return { param:param, climate:climate, climateClass:climateClass,
               asset:asset, assetCls:assetCls||'', verdict:v, cls:cls, note:note,
               notApplicable:(notApplicable === true) };
    }

    

    var _floodNA = false, _floodNAWhy = null;
    try {
      var _fa = (AGN.project && AGN.project.activeAsset) ? AGN.project.activeAsset() : null;
      var _ft = (_fa && typeof hzTerrainFor === 'function')
                  ? hzTerrainFor(_fa.boundary_key || _fa.unit || _fa.name) : null;
      

      var _relief = (_ft && _ft.emed != null && _ft.emin != null) ? (_ft.emed - _ft.emin) : null;
      _floodNA = !!(_ft && _ft.slope_mean != null && _ft.slope_mean >= 20
                    && _relief != null && _relief > 300);
      if (_floodNA) _floodNAWhy = 'unit relief ' + Math.round(_relief)
        + ' m above its lowest ground, mean slope ' + Math.round(_ft.slope_mean) + '\u00b0';
    } catch (_) { _floodNA = false; _floodNAWhy = null; }

    var _engRows = [
      

      engRow('Temperature',
             _projectable
               ? `${_climBasis} ${_climT.toFixed(1)}°C +${off.t.toFixed(1)}°C scenario offset → ${_stressT.toFixed(1)}°C`
               : null,
             _projectable ? 'climatological baseline + declared offset'
                          : (_climT != null
                              ? 'only a short sample is held for this unit, not a climatology'
                              : 'no temperature climatology has landed for this unit'),
             (_rated != null ? _headCell : null),
             (_rated != null
               ? _headNote
               : 'Enter this asset\u2019s rated temperature limit above to compare against it. '
                 + 'The platform does not hold design bases and will not assume one.'),
             (_rated != null ? _headCls : '')),

      (function(){ var _rc=null; try{ var _u=(typeof aiStationDistrict==='function')?aiStationDistrict(s):null; _rc=(_u&&AGN.rainClim&&AGN.rainClim.classify)?AGN.rainClim.classify(_u,0,null):null; }catch(_){ _rc=null; }
        var _ok=!!(_rc&&_rc.known&&_rc.p99!=null&&_rc.max20y!=null);
        return engRow('Rain intensity',
             _ok ? ('wet-day 99th percentile ' + Math.round(_rc.p99) + ' mm/day · wettest day in 20 years ' + Math.round(_rc.max20y) + ' mm') : null,
             _ok ? ('screening depths for this tehsil (global reanalysis 2005-2024, daily totals); a daily depth is not an IDF design intensity')
                 : ('no intensity-duration-frequency curve is held for this location, and a scenario '
                    + 'factor on the current rainfall rate is not a design intensity'),
             null,
             _ok ? ('Screening values for the design discussion: compare them with the site drainage design storm. A sub-daily design '
                    + 'intensity (mm/h) still needs an IDF curve for this location; global reanalysis understates short convective bursts.')
                 : ('Both sides are missing. An IDF curve for this location has to be sourced before a '
                    + 'design rainfall depth means anything here.')); })(),

      engRow('Wind gust',
             null,
             'no validated future design gust is held; a scenario factor on the current gust is '
             + 'not a design wind speed',
             null,
             'Both sides are missing. A design gust is an extreme-value result, not a forecast '
             + 'multiplied by a constant.'),

      engRow('Flood depth',
             null,
             'this build screens flood pathways, and a screening index is not a depth',
             null,
             _floodNA
               ? 'No modelled flood pathway reaches this unit (' + _floodNAWhy + '), so a design '
                 + 'flood level is not a parameter for it. That is a fact about the site, not '
                 + 'a gap in the assessment.'
               : 'A design flood level requires a hydraulic model for the site. NIGRAAN does not '
                 + 'produce one and does not approximate one.',
             '',
             _floodNA)
    ];

    $("asmtEngStress").innerHTML =
      '<div class="asmt-eng-tablewrap">'
      + '<table class="asmt-eng-table" id="asmtEngTable" data-agn-eng-table="1">'
      + '<caption class="asmt-eng-cap">Engineering comparison at the '
      + esc(String(h)) + ' horizon · what can be compared, and what is missing</caption>'
      + '<colgroup><col class="c-param"><col class="c-clim"><col class="c-asset"><col class="c-res"></colgroup>'
      + '<thead><tr>'
      + '<th scope="col">Engineering parameter</th>'
      + '<th scope="col">Climate evidence</th>'
      + '<th scope="col">Asset / design input</th>'
      + '<th scope="col">Result</th>'
      + '</tr></thead><tbody>'
      + _engRows.map(function(r){
          return '<tr>'
            + '<th scope="row">' + esc(r.param) + '</th>'
            + '<td>' + (r.climate != null ? '<b>' + esc(r.climate) + '</b>' : '<span class="eng-none">' + _nd + '</span>')
              + '<small>' + esc(r.climateClass) + '</small></td>'
            + '<td>' + (r.asset != null
                  ? '<b' + (r.assetCls ? ' class="' + r.assetCls + '"' : '') + '>' + esc(r.asset) + '</b>'
                  : '<span class="eng-none">' + _nd + '</span>')
              + '<small>' + esc(r.note) + '</small></td>'
            + '<td><span class="eng-verdict ' + r.cls + '">' + esc(r.verdict) + '</span></td>'
            + '</tr>';
        }).join('')
      + '</tbody></table></div>'
      + '<p class="asmt-eng-foot">This table produces no design value. Where it says a screening '
      + 'comparison is possible, that comparison is a screening result and not a substitute for '
      + 'extreme-value analysis or a hydraulic model.'
      + (h === 'present' ? ''
         : ' Scenario basis: ' + esc(OFFSET_BASIS) + '.')
      + '</p>';

    

    const _pv=$("asmtEngProvenance");
    if(_pv){
      if(!_basis && _climT==null){
        _pv.innerHTML='<b>Baseline:</b> <span class="refuse">none held for this unit.</span> '
          + 'No temperature history has landed here, so this panel has nothing to project from.';
      } else if(!_basis){
        _pv.innerHTML='<b>Baseline:</b> <span class="refuse">a value with no recorded basis.</span> '
          + 'The statistic, its window and its source were not captured, so this panel cannot '
          + 'state what the number below is derived from and will not project from it.';
      } else {
        _pv.innerHTML='<b>Baseline statistic:</b> '+esc(_basis.statistic)
          + ' \u00b7 <b>sample:</b> '+esc(String(_basis.n))+' '+esc(_basis.nUnit||'')
          + (_basis.windowFrom&&_basis.windowTo
               ? (' \u00b7 <b>window:</b> '+esc(_basis.windowFrom)+' to '+esc(_basis.windowTo)) : '')
          + ' \u00b7 <b>source:</b> '+esc(_basis.source||'not recorded')
          + ' \u00b7 <b>value:</b> '+(_climT!=null?_climT.toFixed(1)+' \u00b0C':'\u2014')
          + '<br><b>Scenario offset:</b> +'+off.t.toFixed(1)+' \u00b0C for '+esc(h)
          + ', a declared constant in this build, with no uncertainty range attached to it \u2014 '
          + 'it is a single planning figure, not a distribution.'
          + (_isClim ? ''
             : '<br><span class="refuse"><b>Not projected:</b> '+esc(_basis.why||'this baseline is not a climatology')
               + '. A scenario delta belongs on a multi-decadal statistic, so the temperature '
               + 'stress above is withheld rather than computed from this.</span>');
      }
    }

    

    try{
      

      var _engCase = (window.AGN && AGN.decisionCase && AGN.decisionCase.id)
                       ? AGN.decisionCase.id() : null;
      if(_isClim && _basis && _climT!=null && off && _engCase==null){
        try{ if(AGN.writeRefusal) AGN.writeRefusal('engineering_evidence',
          'this design condition was not recorded as evidence: '
          + ((typeof AGN.caseIdRefusal==='function')
               ? AGN.caseIdRefusal((AGN.decisionCase.signature&&AGN.decisionCase.signature())||{})
               : 'there is no decision case for it to belong to.')
          + ' The value on screen is unaffected.'); }catch(_){ }
      }
      if(_isClim && _basis && _climT!=null && off && window.AGN
         && AGN.decisionCase && AGN.decisionCase.write
         && _engCase!=null){
        AGN.decisionCase.write('engineering_evidence', {
          kind:'design_condition',
          parameter:'design-basis air temperature',
          unit:'degC',
          baseline_value:Number(_climT.toFixed(2)),
          baseline_statistic:_basis.statistic||null,
          baseline_window_from:_basis.windowFrom||null,
          baseline_window_to:_basis.windowTo||null,
          baseline_sample_n:(_basis.n==null?null:_basis.n),
          baseline_source:_basis.source||null,
          scenario_horizon:String(h),
          scenario_offset_c:off.t,
          scenario_offset_basis:OFFSET_BASIS,
          design_value:Number((_climT+off.t).toFixed(2)),
          rated_limit_c:(function(){ var v=$("asmtEngRatedT");
            v=v&&v.value!==''?Number(v.value):null;
            return (v!=null && isFinite(v))?v:null; })(),
          unit_name:(s&&s.name)||null,
          uncertainty:'none attached: the scenario offset is a single declared planning '
                     +'figure, not a distribution, and no extreme-value fit stands behind '
                     +'this number',
          limits:'a screening design condition. A production engineering value needs '
                +'quality-controlled observations or a bias-corrected climate series, a '
                +'suitable extreme-value method, an uncertainty interval and code review.',
          source:'NIGRAAN engineering conditions pane'
        });
      }
    }catch(e){ try{ agnDiag('engineering','write', e); }catch(_){ } }
  }


  


  

  

  try{ window.__agnEvidenceBlock = function(a){ return evidenceBlock(a); }; }catch(_){}
  function evidenceBlock(a){
    try{
      var E=window.AGN&&AGN.evidence; if(!E) return '';
      var unit=(a&&a.station&&a.station.name)||null;
      var mine=E.rows(function(r){ return !unit || r.unit_key===unit; });
      if(!mine.length) mine=E.rows();
      if(!mine.length){
        return '<h3>Evidence trail</h3><p>No values have been recorded through the '
             + 'evidence spine for this assessment, so this report cannot show where its '
             + 'numbers came from. Run a national sweep or an enrichment pass before '
             + 'issuing it to a reader.</p>';
      }
      var h='<h3>Evidence trail</h3><p>Every value below is recorded where it was produced, '
          + 'with its source, the method that turned it into this number, and its spread. '
          + (unit?('Scoped to '+esc(unit)+'. '):'')
          + '</p><table><thead><tr><th>Value</th><th>Number</th><th>Kind</th><th>Source</th>'
          + '<th>Method</th><th>Uncertainty</th><th>Asked at</th></tr></thead><tbody>';
      mine.slice(0,40).forEach(function(r){
        h+='<tr><td>'+esc(r.label)+'</td>'
          +'<td>'+(r.value==null?'<em>not available</em>':esc(String(r.value))+(r.units?(' '+esc(r.units)):''))+'</td>'
          +'<td>'+esc(r.kind)+'</td><td>'+esc(r.source||'not recorded')+'</td>'
          +'<td>'+esc(r.method||'not recorded')+'</td>'
          +'<td>'+esc(r.uncertainty)+'</td>'
          +'<td>'+(r.elevation==null?'—':esc(String(r.elevation))+' m')+'</td></tr>';
      });
      h+='</tbody></table>';
      if(mine.length>40) h+='<p><small>'+(mine.length-40)+' further records held in the '
           +'evidence spine and available in the data-fabric export.</small></p>';

      var refuse={};
      mine.forEach(function(r){ (r.refuses||[]).forEach(function(x){ refuse[x]=1; }); });
      var rl=Object.keys(refuse);
      h+='<h3>What this report does not claim</h3>';
      h+= rl.length
        ? ('<p>Taken from the records above, not written for this document:</p><ul>'
           + rl.map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('') + '</ul>')
        : ('<p>No record in this assessment carries a stated refusal. That is itself a '
           + 'finding: a value with nothing it declines to claim has not been examined '
           + 'closely enough.</p>');

      if(window.AGN&&AGN.fabric){
        var fr=AGN.fabric.rows().rows;
        if(fr.length){
          h+='<h3>Data sources used</h3><table><thead><tr><th>Source</th><th>Kind</th>'
            +'<th>What it is</th><th>Records</th><th>With a stated spread</th><th>Licence</th>'
            +'</tr></thead><tbody>';
          fr.forEach(function(x){
            h+='<tr><td>'+esc(x.source)+'</td><td>'+esc(x.kind)+'</td>'
              +'<td>'+esc(x.what||'not catalogued')+'</td><td>'+x.records+'</td>'
              +'<td>'+x.quantified+'%</td><td>'+esc(x.licence)+'</td></tr>';
          });
          h+='</tbody></table>';
        }
      }
      return h;
    }catch(e){ return '<h3>Evidence trail</h3><p>The evidence trail could not be '
           + 'assembled for this report ('+esc(e&&e.message||'unknown error')
           + '). The figures above should not be issued without it.</p>'; }
  }
  

function reportEvidence(){
  var a=state.assessment, out={};

  

  var _u=null;
  (function(){
    function _res(nm){
      if(!nm) return null;
      var D=window.DISTRICT_IN||{};
      if(D[nm]) return nm;
      try{ var d=window.PK_KEY_TO_DISTRICT&&PK_KEY_TO_DISTRICT[nm]; if(d&&D[d]) return d; }catch(_){}
      return null;
    }
    

    try{ var _S=(window.AGN&&AGN.subject&&AGN.subject.get)?AGN.subject.get():null;
         if(_S && _S.unit) _u=_res(_S.unit); }catch(_){}
    if(!_u){ try{ var _L=(window.AGN&&AGN.flow&&AGN.flow.location)?AGN.flow.location():null;
         _u=_res(_L&&_L.name); }catch(_){} }
    if(!_u){ try{ _u=_res(a&&a.station&&a.station.name); }catch(_){} }
  })();

  

  

  var _refusedEv=[];
  function _ev(store){
    var r=null;
    try{ r=(window.AGN && AGN.decisionCase && AGN.decisionCase.latest)
                  ? AGN.decisionCase.latest(store,{completeEnvelope:true}) : null;
    }catch(_){ return null; }
    if(!r) return null;
    try{
      var _S=(window.AGN&&AGN.subject&&AGN.subject.get)?AGN.subject.get():null;
      var _sa=_S&&_S.asset_id!=null?String(_S.asset_id):null;
      if(_sa && r.asset_id!=null && String(r.asset_id)!==_sa){
        _refusedEv.push({store:store, why:'record is for asset '+r.asset_id+', this document is for '+_sa});
        return null;
      }
      if(store==='hazard_evidence' && _u && r.unit){
        var D=window.DISTRICT_IN||{}, ru=String(r.unit);
        var rk=D[ru]?ru:((window.PK_KEY_TO_DISTRICT&&PK_KEY_TO_DISTRICT[ru]&&D[PK_KEY_TO_DISTRICT[ru]])?PK_KEY_TO_DISTRICT[ru]:null);
        if(rk && rk!==_u){
          _refusedEv.push({store:store, why:'screening record is for '+ru+', this document is for '+_u});
          return null;
        }
      }
    }catch(_){ }
    return r;
  }
  function _clone(r){ try{ return r ? JSON.parse(JSON.stringify(r)) : null; }catch(_){ return null; } }
  var _noCase = null;
  try{ _noCase = (window.AGN && AGN.decisionCase && AGN.decisionCase.id)
                   ? (AGN.decisionCase.id()==null) : true; }catch(_){ _noCase = true; }
  out.evidenceSource = _noCase
    ? 'EXPLORATORY - no decision case is established, so nothing in this document is '
      + 'case-bound evidence and it cannot be issued'
    : 'governed records bound to the active decision case';
  out.exploratory = !!_noCase;
  

  try{
    var _carried=[];
    if(window.AGN && AGN.decisionCase && AGN.decisionCase.stores){
      AGN.decisionCase.stores().forEach(function(d){
        (AGN.decisionCase.evidence(d.store)||[]).forEach(function(r){
          if(r && r.rebound_from) _carried.push({ store:d.store,
            from:r.rebound_from, at:r.rebound_at||null,
            reason:r.rebound_reason||null,
            produced_under:{ horizon:(r.horizon!=null?r.horizon:null),
                             lead_hours:(r.lead_hours==null?null:r.lead_hours) } });
        });
      });
    }
    if(_carried.length){
      out.carriedEvidence=_carried;
      out.carriedNote='This document cites '+_carried.length+' record'
        +(_carried.length===1?'':'s')+' produced under a different selection and carried '
        +'onto this decision case. Each states the hazard, horizon and asset it was '
        +'actually produced under; read them before treating them as evidence for this one.';
    }
  }catch(e){ agnDiag('report','carried-evidence', e); }

  

  var _hz = _ev('hazard_evidence');
  var _hzRows = (_hz && Array.isArray(_hz.rows) && _hz.rows.length) ? _hz.rows : null;
  var _hazSrc = _hzRows ? 'governed hazard_evidence record'
                        : (_noCase ? 'session assessment (exploratory, not evidence)' : null);
  out.hazardsSource = _hazSrc;
  out.hazardsFromRecord = !!_hzRows;
  var _hazRowsIn = _hzRows || ((_noCase && a && a.rows) ? a.rows : null);
  try{
    if(_hazRowsIn) out.hazards=_hazRowsIn.map(function(r){
      var _name=(r.label||r.name||r.hazard||'hazard');
      

      var _row={ name:_name,
               score:(r.score==null?null:Number(r.score)),
               screeningIndex:(r.screeningIndex===undefined
                                 ? (r.score==null?null:Number(r.score))
                                 : (r.screeningIndex==null?null:Number(r.screeningIndex))),
               categorical:!!r.categorical,
               category:(r.category||null),
               categoryLabel:(r.categoryLabel||null),
               

               /* v91.17.272.1: the engine's applicability (it holds no such hazard for the tehsil) is its own class, not a missing input */
               noDataClass:(r.noDataClass||((r.notApplicable||r.not_applicable)?'ineligible':null)),
               noDataClassLabel:(r.noDataClassLabel||((r.notApplicable||r.not_applicable)?'Does not occur here':null)),
               unavailable:!!(r.unavailable||(!r.categorical && r.score==null && r.engineLevel==null && r.engine_level==null)),
               /* v91.17.270: the hazard engine's level for the tehsil (the map's source), the highest issued day, and that day */
               level:(r.engineLevel!=null?r.engineLevel:(r.engine_level!=null?r.engine_level:null)), levelDay:(r.engineDate||r.engine_day||null),
               basis:(r.basis||r.note||r.why||r.siteWhy||r.driver||null) };
      

      try{
        var _hk=(r.hazard||r.key||String(_name).toLowerCase().split(' ')[0]);
        if(_row.level!=null){ _row.prov='retrieved'; _row.provWhy='NIGRAAN hazard engine levels for the tehsil (the map)'; }
        else if(_u && typeof hzProvenance==='function' && (window.HZ_INPUTS||{})[_hk]){
          var _p=hzProvenance((window.DISTRICT_IN||{})[_u], _hk);
          _row.prov=_p.state; _row.provWhy=_p.why; _row.provInputs=_p.inputs;
        } else if(r.provenance && r.provenance.state){
          _row.prov=r.provenance.state; _row.provWhy=r.provenance.why;
        }
      }catch(_){}
      return _row;
    });
  }catch(_){}
  try{
    var ns=(typeof NATIONAL_STATE!=='undefined')?NATIONAL_STATE:null;
     
    if(ns) out.coverage={ live:ns.covered, filled:(ns.estimated==null?null:ns.estimated),
      refusedUnits:Math.max(0,(ns.sweepable||0)-(ns.covered||0)-(ns.estimated||0)),
      error:ns.estimateError||null,
      contextVariables:(ns.estimateRefusedVars?[]:null)||[],
      contextWhy:{} };
    if(ns && window.AGN && AGN.field){
      out.coverage.contextVariables=Object.keys(AGN.field.spec?{}:{});
    }
  }catch(_){}
  try{
    if(window.AGN && AGN.field){
      var cv=Object.keys(FR('field.estimable')).filter(function(v){ return AGN.field.contextOnly(v); });
      if(out.coverage){ out.coverage.contextVariables=cv;
        out.coverage.contextWhy=cv.reduce(function(m,v){
          m[v]={neverScores:AGN.field.neverScores(v), why:(AGN.field.spec(v)||{}).why}; return m; },{}); }
    }
  }catch(_){}
  

  try{
    var _as = a;
    

    var _st=(_as&&_as.station)||{};
    var _atA=!!(_st.__unitKey || _st.id==='__assetpoint');
    var _su=null; try{ _su=_st.__unitKey || ((_atA&&AGN.siteUnit)?((AGN.siteUnit(_st.lat,_st.lon)||{}).key||null):null); }catch(_){}
    if(_as) out.assessment = { evidenceStation:_as.evidenceStation||null,
                               atAssetCoordinate:_atA,
                               siteUnit:_su,
                               siteLat:(_atA&&_st.lat!=null)?Number(_st.lat):null,
                               siteLon:(_atA&&_st.lon!=null)?Number(_st.lon):null,
                               guardStation:_st.__guardStation||_as.guardStation||null,
                               guardKm:(_st.__guardKm!=null?_st.__guardKm:(_as.guardKm==null?null:_as.guardKm)),
                               stationKm:(_as.stationKm==null?null:_as.stationKm),
                               stationProxy:(_as.stationProxy==null?null:_as.stationProxy),
                               stationWhy:_as.stationWhy||null,
                               

                               assessedAssetId:_as.assetId||null,
                               assessedAssetName:_as.assetName||null,
                               subjectOk:!!_as.subjectOk && (function(){
                                 try{ var _a=(AGN.project&&AGN.project.activeAsset)?AGN.project.activeAsset():null;
                                      return !_a || String(_a.asset_id||'')===String(_as.assetId||''); }
                                 catch(_){ return false; } })() };
  }catch(_){}

  

  try{
    var _ic = {}, _order = [];
    ((a && a.rows) || []).forEach(function(r){
      var prov = r && (r.provenance || r.inputs) || null;
      var src  = (prov && prov.inputs) ? prov.inputs : (r && r.inputProvenance) || null;
      if(src && typeof src === 'object'){
        Object.keys(src).forEach(function(k){
          var v = src[k];
          var state = (v && v.state) ? String(v.state)
                    : (v === true ? 'retrieved' : (v == null ? 'absent' : String(v)));
          if(!(k in _ic)){ _ic[k] = state; _order.push(k); }
          else if(_ic[k] !== state) _ic[k] = _ic[k] + ' / ' + state;
        });
      }
    });
    if(_order.length){
      out.unitCoverage = { unit:(a && (a.subjectUnit || (a.station && a.station.name))) || null,
        rows:_order.map(function(k){ return { label:k, state:_ic[k] }; }),
        basis:'the inputs the hazard engine read for this unit on the run this document was '
             +'frozen from, with the state each one arrived in' };
    }
  }catch(_){}

  

  

  try{ if(window.AGN && AGN.evidence){
         var _EVCAP = 120;
         var _evAll = AGN.evidence.rows() || [];
         

         var _docUnit = _u || (a && a.subjectUnit) || (a && a.station && a.station.name) || null;
         var _pt = null;
         try{ if(a && a.station && a.station.lat!=null && a.station.lon!=null)
                _pt = Number(a.station.lat).toFixed(3)+','+Number(a.station.lon).toFixed(3); }catch(_){}
         var _docHaz = {};
         ((a && a.rows) || []).forEach(function(r){ if(r && r.key) _docHaz[String(r.key)] = 1; });
         var _norm = function(x){ return String(x==null?'':x).trim().toLowerCase(); };
         var _mine = function(r){
           if(!r) return false;
            
           

           if(r.hazard && _docHaz[String(r.hazard)] && (r.unit == null || _norm(r.unit) === '' )) return true;
            
           if(_pt && String(r.unit) === _pt) return true;
           if(_docUnit && _norm(r.unit) === _norm(_docUnit)) return true;
           

           if(_norm(r.unit) === 'point') return true;
           

           return false;
         };
         var _kept = _evAll.filter(_mine);
         var _off  = _evAll.length - _kept.length;
         out.evidence = _kept.slice(0, _EVCAP);
         out.evidenceTotal = _kept.length;
         out.evidenceShown = out.evidence.length;
         out.evidenceTruncated = out.evidenceTotal > out.evidenceShown;
         out.evidenceScope = {
           unit:_docUnit, hazards:Object.keys(_docHaz),
           sessionTotal:_evAll.length, offDocument:_off,
           rule:'a record belongs to this document when it is about this unit or about a '
               +'hazard this document screened. '+_off+' further record'+(_off===1?'':'s')
               +' held in this session '+(_off===1?'is':'are')+' about neither and '
               +(_off===1?'is':'are')+' not counted here.' };
       } }catch(_){}
  try{ if(window.AGN && AGN.prov){ out.deviations=AGN.prov.DEVIATIONS;
                                   out.parameters=AGN.prov.parameters(); } }catch(_){}

  

  try{
    if(window.AGN && AGN.api && typeof AGN.api.outcomes === 'function'){
      var _o = AGN.api.outcomes();
      if(_o && _o.length) out.routes = _o;
    }
  }catch(_){}

  

  try{
    if(window.AGN && AGN.skill && typeof AGN.skill.runs === 'function'){
      var _runs = AGN.skill.runs(), _rows = [], _un = [];
      Object.keys(_runs).forEach(function(v){
        var r = _runs[v];
        if(!r || !r.ok) return;
        (r.leads||[]).forEach(function(l){
          var s = r.pooled && r.pooled[l];
          if(!s || !s.usable) return;
          _rows.push({ variable:v, lead:l, n:s.n, mae:s.mae, rmse:s.rmse,
                       spread:(s.best && s.worst)
                         ? (s.best.name+' '+s.best.mae.toFixed(2)+' to '
                            +s.worst.name+' '+s.worst.mae.toFixed(2)) : null });
        });
      });
      if(window.AGN.confidence && AGN.confidence.UNVERIFIABLE){
        Object.keys(AGN.confidence.UNVERIFIABLE).forEach(function(v){
          _un.push({ variable:v, why:AGN.confidence.UNVERIFIABLE[v] });
        });
      }
      if(_rows.length || _un.length){
        var _ref = (AGN.skill.REFERENCE||{});
        out.skill = { rows:_rows, unmeasured:_un,
                      reference:'Scored against '+(_ref.source||'a reference') };
      }
    }
  }catch(_){}

  


  

  


  

  try{
     
    if(_hz){
      out.screening={ unit:_hz.unit||null, horizon:_hz.horizon||null,
                      leadHours:(_hz.lead_hours==null?null:_hz.lead_hours),
                      screenedAt:_hz.screened_at||_hz.created_at||null,
                      recordId:_hz.decision_case_id||null,
                      source:_hz.source||null };
      var _fr=(_hz.rows||[]).filter(function(r){
        return /flood/i.test(String(r.hazard||r.key||r.label||r.name||'')); })[0];
      if(_fr){
        var _fd=_fr.flood||{};
        out.flood={ unit:_hz.unit||null,
          governing:_fd.governingPath||null,
          pluvial:(_fd.pluvial==null?null:Number(_fd.pluvial)),
          riverine:(_fd.riverine==null?null:Number(_fd.riverine)),
          riverineUnavailableWhy:(_fd.riverine!=null)?null
            :(_fd.riverChecked===false ? 'the river sweep had not run when this was screened'
              : (_fd.riverCovered===false ? 'no gauge upstream - river state unknown'
                 : 'no discharge value for this reach')),
          driverBasis:_fd.driverBasis||null,
          runoffBasis:_fd.runoffBasis||null,
          crossLayer:_fd.crossLayer||null,
          score:(_fr.score==null?null:Number(_fr.score)),
          fromRecord:true };
      } else {
        out.flood={ unavailable:true, fromRecord:true,
          why:'the recorded screening for this case carries no flood row' };
      }
    } else if(_noCase && a && a.rows && a.rows.length){
      

      var _er=(a.rows||[]).filter(function(r){
        return /flood/i.test(String(r.hazard||r.key||r.label||r.name||'')); })[0];
      out.flood={ unit:(a.station&&a.station.name)||null,
        score:(_er&&_er.score!=null)?Number(_er.score):null,
        governing:(_er&&_er.flood&&_er.flood.governingPath)||null,
        driverBasis:(_er&&_er.flood&&_er.flood.driverBasis)||null,
        fromRecord:false, exploratory:true, notEvidence:true,
        why:'exploratory screen. No client asset is active, so this result is not bound to a '
           +'decision case and is not evidence: it is what is on screen, shown so the preview '
           +'is not blank. Select the asset in the client project and run the assessment to '
           +'record it, then the document quotes the record rather than the screen.' };
    } else {
      out.flood={ unavailable:true, fromRecord:false,
        why:(_noCase
              ? 'no decision case is established and no assessment has been run, so there is '
               +'nothing to show'
              : 'no screening result is recorded against this decision case. Run the '
               +'assessment for this asset, hazard and horizon - the report issues what was '
               +'screened and does not screen again at issue time.') };
    }
  }catch(_){}

  

  out.mc={ refused:true, fromRecord:false,
    why:(_noCase
          ? 'no decision case is established, so no compound-hazard record could be selected'
          : 'no compound-hazard simulation (joint exceedance of two hazards) is recorded against this decision case.') };

  

  try{
    var _c=_ev('climate_evidence');
    if(_c){
      var _t=_c.temperature_delta_c||null;
      var _pm=(_c.per_model&&_c.per_model.temperature_delta_c)||[];
      out.climate={
        baseline:_c.baseline||'1991-2010',
        window:((_c.future_window&&_c.future_window.start)||'')+' to '
              +((_c.future_window&&_c.future_window.end)||''),
        horizon:_c.horizon||null,
        models:_pm.map(function(x){ return {model:x.model, delta:x.delta}; }),
        unavailable:_c.models_unavailable||[],
        meanDelta:(_t&&_t.mean!=null?Number(_t.mean):null),
        range:(_t&&_t.min!=null&&_t.max!=null
                ?((_t.min>=0?'+':'')+Number(_t.min).toFixed(1)+' to '
                 +(_t.max>=0?'+':'')+Number(_t.max).toFixed(1)+' °C'):null),
        outOfCoverage:!_pm.length,
        why:(!_pm.length
              ? ('no model delta was produced for this horizon; HighResMIP future runs end on '
                 +(_c.coverage_end||'2050-12-31'))
              : null),
        biasCorrected:(_c.bias_corrected===true),
        biasCorrectionReference:_c.bias_correction_reference||null,
        biasCorrectionMethod:_c.bias_correction_method||null,
        appliedToScores:false,
        calculationId:_c.calculation_id||null,
        recordedAt:_c.created_at||null,
        fromRecord:true
      };
    } else {
      out.climate={ outOfCoverage:true, models:[], fromRecord:false,
        why:(_noCase
              ? 'no decision case is established, so no climate record could be selected'
              : 'no CMIP6 run is recorded against this decision case') };
    }
  }catch(_){}

  

  try{ var _sc=_ev('scenario'); if(_sc) out.scenario=_clone(_sc); }catch(_){}
  

  try{
    

    var _pf=(typeof state!=='undefined' && state && Array.isArray(state.portfolio)) ? state.portfolio : [];
    if(_pf.length){
      

      var _ok=_pf.filter(function(r){ return r&&r.status!=='rejected'&&r.lead; }).sort(AGN_ASSET_ORDER.compare);
      var _rowsP=_ok.map(function(r){
        var L=r.leadSummary||hzLeadSummary(r.lead,r.leaders);
        return { name:(r.name||r.asset_name||r.asset_id)||null,
                 location:(r.location||(r.station&&r.station.name))||null,
                 hazard:L.text, level:L.word, aboveNormal:!L.none,
                 day:(L.none||!r.lead)?null:(r.lead.engineDate||null),
                 demo:String(r.origin||'')==='sample', status:r.status||null };
      });
      out.portfolio={ rows:_rowsP, count:_rowsP.length, rejected:_pf.length-_ok.length,
        sampleRows:_pf.filter(function(r){ return r&&String(r.origin||'')==='sample'; }).length,
        basis:AGN_ASSET_ORDER.basis };
    }
  }catch(e){ agnDiag('report','portfolio-evidence', e); }
  try{ var _ai=(window.AGN&&AGN.decisionCase&&AGN.decisionCase.evidence)
                 ? AGN.decisionCase.evidence('ai_decisions',{completeEnvelope:true}) : [];
       if(_ai&&_ai.length) out.aiDecisions=_clone(_ai); }catch(_){}
  if(_refusedEv.length) out.refusedEvidence=_refusedEv;

  return out;
}








function agnSha256Hex(str){
  function rotr(n,x){ return (x>>>n)|(x<<(32-n)); }
  var K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
         0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
         0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
         0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
         0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
         0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
         0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
         0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  var H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
   
  var bytes=[];
  for(var i=0;i<str.length;i++){
    var c=str.charCodeAt(i);
    if(c<0x80) bytes.push(c);
    else if(c<0x800){ bytes.push(0xc0|(c>>6),0x80|(c&63)); }
    else if(c<0xd800||c>=0xe000){ bytes.push(0xe0|(c>>12),0x80|((c>>6)&63),0x80|(c&63)); }
    else { i++; var cp=0x10000+(((c&0x3ff)<<10)|(str.charCodeAt(i)&0x3ff));
           bytes.push(0xf0|(cp>>18),0x80|((cp>>12)&63),0x80|((cp>>6)&63),0x80|(cp&63)); }
  }
  var bitLen=bytes.length*8;
  bytes.push(0x80);
  while(bytes.length%64!==56) bytes.push(0);
  var hi=Math.floor(bitLen/4294967296), lo=bitLen>>>0;
  bytes.push((hi>>>24)&255,(hi>>>16)&255,(hi>>>8)&255,hi&255,
             (lo>>>24)&255,(lo>>>16)&255,(lo>>>8)&255,lo&255);
  var w=new Array(64);
  for(var b=0;b<bytes.length;b+=64){
    for(var t=0;t<16;t++){
      w[t]=(bytes[b+t*4]<<24)|(bytes[b+t*4+1]<<16)|(bytes[b+t*4+2]<<8)|bytes[b+t*4+3];
    }
    for(t=16;t<64;t++){
      var s0=rotr(7,w[t-15])^rotr(18,w[t-15])^(w[t-15]>>>3);
      var s1=rotr(17,w[t-2])^rotr(19,w[t-2])^(w[t-2]>>>10);
      w[t]=(w[t-16]+s0+w[t-7]+s1)|0;
    }
    var a=H[0],bb=H[1],c2=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
    for(t=0;t<64;t++){
      var S1=rotr(6,e)^rotr(11,e)^rotr(25,e);
      var ch=(e&f)^((~e)&g);
      var t1=(h+S1+ch+K[t]+w[t])|0;
      var S0=rotr(2,a)^rotr(13,a)^rotr(22,a);
      var maj=(a&bb)^(a&c2)^(bb&c2);
      var t2=(S0+maj)|0;
      h=g; g=f; f=e; e=(d+t1)|0; d=c2; c2=bb; bb=a; a=(t1+t2)|0;
    }
    H[0]=(H[0]+a)|0; H[1]=(H[1]+bb)|0; H[2]=(H[2]+c2)|0; H[3]=(H[3]+d)|0;
    H[4]=(H[4]+e)|0; H[5]=(H[5]+f)|0; H[6]=(H[6]+g)|0; H[7]=(H[7]+h)|0;
  }
  return H.map(function(x){ return ('00000000'+(x>>>0).toString(16)).slice(-8); }).join('');
}
 
function agnCanonical(v){
  if(v===null||typeof v!=='object') return JSON.stringify(v===undefined?null:v);
  if(Array.isArray(v)) return '['+v.map(agnCanonical).join(',')+']';
  return '{'+Object.keys(v).sort().map(function(k){
    return JSON.stringify(k)+':'+agnCanonical(v[k]); }).join(',')+'}';
}
try{ (window.AGN=window.AGN||{}).hash={ sha256:agnSha256Hex, canonical:agnCanonical }; }catch(_){}

function _evidenceFingerprint(ev){
  try{
    var seed = JSON.stringify(ev, function(k,v){
      

      if(k==='at'||k==='id'||k==='generatedAt'||k==='calculatedAt') return undefined;
      if(k==='reads'||k==='readCount'||k==='renderCount'||k==='refreshCount') return undefined;
      

      if(k==='routes' && Array.isArray(v)){
        return v.map(function(r){
          return (r && typeof r==='object')
            ? { route:r.route, state:r.state, why:r.why } : r; });
      }
      return (typeof v==='number' && isFinite(v)) ? +v.toFixed(4) : v;
    });
    var h=5381;
    for(var i=0;i<seed.length;i++){ h=((h*33) ^ seed.charCodeAt(i)) >>> 0; }
    return h.toString(16).padStart(8,'0') + '-' + seed.length.toString(16);
  }catch(_){ return null; }
}




var _DOC_META=['type','title','purpose','unit','national','id','at','subject','subjectClaimed'];


try{ (window.AGN=window.AGN||{}).docMeta=function(){ return _DOC_META.slice(); }; }catch(_){}
function _frozenProjection(ev){
  var o={}; if(!ev||typeof ev!=='object') return o;
  Object.keys(ev).forEach(function(k){ if(_DOC_META.indexOf(k)<0 && k!=='localContext') o[k]=ev[k]; });
  return o;
}
function _reportFrozen(){
  return !!(state && state.reportHtml && state.reportId);
}
function _evidenceMoved(){
  if(!_reportFrozen() || !state.reportFingerprint) return false;
  try{ return _evidenceFingerprint(_frozenProjection(reportEvidence()))
              !== (state.reportLiveAtFreeze || state.reportFingerprint); }
  catch(_){ return false; }
}
  

  function _exportVerdict(){
    var v=null;
    try{ v=(window.AGN&&AGN.exports&&AGN.exports.issuable)?AGN.exports.issuable():null; }catch(_){}
    if(!v) return {ok:true, why:null, cls:null, marked:false};
    return {ok:!!v.ok, why:v.why||null, cls:(v.cls&&v.cls.label)||null, marked:!v.ok};
  }
  function _exportName(kind, ext){
    var v=_exportVerdict();
    

    var loc=null, d=null;
    try{ d=state&&state.reportDoc; var _s=AGN.subject.get(); loc=(_s&&(_s.asset_name||_s.unit))||null; }catch(_){}
    var k=kind+(d&&d.type?'-'+d.type:'')+(d&&d.id?'-'+d.id:'');
    var sample=false; try{ sample=/demo|sample|design surface/i.test(String((AGN.exports.issuable()||{}).why||'')); }catch(_){}
    return agnName(v.ok ? k : ((sample?'SAMPLE_':'NOT-FOR-ISSUE_')+k), ext, loc);
  }
  function _issueBanner(){
    var v=_exportVerdict();
    if(v.ok) return '';
    return '<div style="margin:0 0 12px 0;padding:10px 12px;border:2px solid #B3261E;'
         + 'border-radius:6px;background:#fdecea;color:#7a1a14;font-weight:800;'
         + 'font-size:0.85rem;line-height:1.45">NOT FOR ISSUE'
         

         + (function(){ var _dc=null; try{ _dc=(state&&state.reportDoc&&state.reportDoc.outputClass&&state.reportDoc.outputClass.label)||null; }catch(_){}
             var _c=_dc||v.cls; return _c ? ' · output class: ' + esc(_c) : ''; })()
         + '<div style="font-weight:600;margin-top:4px">' + esc(v.why || 'this session may not '
         + 'issue a document') + '</div></div>';
  }

function _freezeStamp(){
  if(!_reportFrozen()) return '';
  var moved=_evidenceMoved();
  return '<div class="rpt-note" style="margin:0 0 10px 0;padding:7px 10px;border:1px solid #dcdcdc;'
       + 'border-radius:6px;background:#fafafa">Document <b>' + esc(state.reportId) + '</b>, frozen '
       + esc(state.reportAtText || state.reportAt || 'time not recorded')
       + '. Every export of this document \u2014 preview, HTML, JSON and print \u2014 is this one '
       + 'document; none of them rebuilds it.'
       + (moved ? ' <b>The live evidence has changed since this document was frozen.</b> '
                + 'This artefact is the one that was reviewed; generate a new preview to issue '
                + 'the current evidence.' : '')
       + '</div>';
}
function _renderFreezeState(){
  var el=$("asmtFreezeState"); if(!el) return;
  var fs=AGN.reportFreeze.state();
  if(!fs.frozen){
    el.className='asmt-freeze';
    el.removeAttribute('data-agn-doc');
    el.textContent='No document frozen yet. Generate a preview; every export then issues that same document.';
    return;
  }
  el.className='asmt-freeze'+(fs.moved?' moved':'');
  

  el.setAttribute('data-agn-doc', fs.id||'');
  el.innerHTML='Frozen document <code>'+esc(fs.id)+'</code> \u00b7 '
    + esc(fs.atText||fs.at||'time not recorded')
    + ' \u00b7 evidence fingerprint <code>'+esc(fs.fingerprint||'not computed')+'</code>. '
    + (fs.moved
        ? 'Generate a new preview to issue the current evidence.'
        : 'Copy, HTML, JSON and print all issue this document.');
}


AGN.reportFreeze = {
  state:function(){
    var stored=(state&&state.reportFingerprint)||null;
    var live=null;
    try{ live=_evidenceFingerprint(_frozenProjection(reportEvidence())); }catch(_){}
    return { frozen:_reportFrozen(),
             

             fingerprintBasis:(state&&state.reportFingerprintBasis)||null,
             id:(state&&state.reportId)||null,
             at:(state&&state.reportAt)||null,
             atText:(state&&state.reportAtText)||null,
             fingerprint:stored, liveFingerprint:live, liveAtFreeze:(state&&state.reportLiveAtFreeze)||null,
             moved:!!(stored && live && ((state&&state.reportLiveAtFreeze)||stored)!==live) };
  },
  

  fingerprint:function(ev){ return _evidenceFingerprint(ev); },
  evidence:function(){ try{ return reportEvidence(); }catch(_){ return null; } },

  

  clear:function(reason){
    var had=_reportFrozen(), id=(state&&state.reportId)||null;
    try{
      if(state){
        state.reportHtml=null; state.reportId=null;
        state.reportAt=null;   state.reportAtText=null;
        state.reportFingerprint=null; state.reportFingerprintBasis=null; state.reportLiveAtFreeze=null;
        state.reportDoc=null;  state.reportSnapshot=null;
        state.reportIdentity=null;
      }
    }catch(_){ }
    

    try{ D.dispatchEvent(new CustomEvent('agn:report-cleared',
         { detail:{ had:had, id:id, reason:reason||'project change' } })); }catch(_){ }
    return { cleared:had, id:id };
  }
};



try{
  document.addEventListener('agn:report-cleared', function(e){
    try{
      var host=document.getElementById('asmtReportPreview');
      if(host) host.innerHTML='<div class="rpt-refusal"><b>No frozen document</b><ul><li>'
        + 'the report that was frozen here has been cleared because the project changed'
        + ((e && e.detail && e.detail.reason) ? (' (' + String(e.detail.reason) + ')') : '')
        + '. Generate a new report for the current client, asset, hazard and decision time.'
        + '</li></ul></div>';

    }catch(_){ }
  });
}catch(_){ }

function generateReport(){    
  try{ if(typeof window._agnSubjKey85==='function') state.reportSubjKey=window._agnSubjKey85(); }catch(_){}
  var uiType=($("asmtReportType")||{}).value||'site';
  

  try{
    var _act0=(window.AGN&&AGN.project&&AGN.project.activeAsset)?AGN.project.activeAsset():null;
    var _aid0=_act0?String(_act0.asset_id||''):'';
    var _cur0=(state.assessment&&state.assessment.assetId)?String(state.assessment.assetId):'';
    

    if(_aid0 && _aid0!==_cur0 && !generateReport.__sciRerun && typeof runAssessment==='function'){
      generateReport.__sciRerun=true;
      try{ runAssessment(); } finally{ generateReport.__sciRerun=false; }
    }
    var _cur1=(state.assessment&&state.assessment.assetId)?String(state.assessment.assetId):'';
    if(_aid0 && _aid0!==_cur1){
      state.reportDoc=null; state.reportSnapshot=null; state.reportId=null;
      state.reportHtml='<div class="asmt-warning"><b>Report not generated.</b> The active asset is '
        +String(_act0.name||_aid0).replace(/[<>&"]/g,'')+', and the site assessment available describes '
        +String((state.assessment&&state.assessment.assetName)||'another subject').replace(/[<>&"]/g,'')
        +'. A document is built from one asset’s evidence or not at all. Run the site assessment '
        +'for the active asset and generate again.</div>';
      var _h0=$("asmtReportPreview"); if(_h0) _h0.innerHTML=state.reportHtml;
      return;
    }
  }catch(_){}
  

  try{
    var _rows=(state.assessment&&state.assessment.rows)||[];
    var _dyn=['heat','flood','drought','cold','wind','rain_hz'];
    var _dynRows=_rows.filter(function(r){ return r && _dyn.indexOf(r.key)>=0; });
    var _feedGap=_dynRows.filter(function(r){ return r.score==null && r.noDataClass==='feed'; });
    

    var _drRow=_dynRows.filter(function(r){ return r && r.key==='drought' && r.score==null && r.noDataClass==='feed'; })[0]||null;
    var _dn=window.__agnDroughtNat||null; var _drPending=!!(_drRow && !(_dn && (_dn.joined || _dn.why)));
    

    try{ var _press=!!(arguments[0] && arguments[0].type);
      if(_drPending){ if(!generateReport.__drT0){ generateReport.__drT0=Date.now(); generateReport.__drPress=_press?1:0;
            setTimeout(function(){ try{ var _h=$("asmtReportPreview"); if(_h && _h.querySelector('[data-agn-feed-wait]')) generateReport(); }catch(_){} }, 61000); }
          else if(_press) generateReport.__drPress=(generateReport.__drPress||0)+1;
          if(Date.now()-generateReport.__drT0>=60000 || (generateReport.__drPress||0)>=2){ _drPending=false;
            window.__agnDroughtGap='the national drought table (90-day SPI/SPEI and root-zone stress) had not arrived when this document was built; drought is a gap in it'; } }
      else generateReport.__drT0=0; }catch(_){}
    

    var _su=null; try{ var _s0=AGN.subject.get(); _su=_s0&&(_s0.unit||_s0.unitUnresolvedName); }catch(_){}
    var _ctxState=(window.AGN&&AGN.reportCtx&&AGN.reportCtx.state&&_su)?AGN.reportCtx.state(_su):'ready';
    if(_ctxState==='none'){ try{ AGN.reportCtx.warm(); }catch(_){} _ctxState='loading'; }
    var _ctxPending=(_ctxState==='loading');
    /* v91.17.272.1: the hazard levels (engine, per tehsil) or the site's own score still being read: no document is frozen yet */
    var _lvPending=_rows.some(function(r){ return r && (r.status==='pending' || r.sitePending); });
    if(_lvPending){ state.reportDoc=null; state.reportSnapshot=null; state.reportId=null;
      state.reportHtml='<div class="asmt-warning" data-agn-feed-wait="1" data-agn-level-wait="1"><b>Report not generated yet: the hazard levels for '+String((state.assessment&&(state.assessment.assetName||(state.assessment.station&&state.assessment.station.name)))||'this subject').replace(/[<>&"]/g,'')+' are still being read.</b> '
        +'A document is not frozen before its levels arrive. This preview is made by itself as soon as they land (usually within a few seconds).</div>';
      var _hl=$("asmtReportPreview"); if(_hl) _hl.innerHTML=state.reportHtml;
      if(!generateReport.__lvWired){ generateReport.__lvWired=true;
        ['agn:engine-levels','agn:site-score'].forEach(function(evn){ document.addEventListener(evn, function(){ setTimeout(function(){ try{ var h=$("asmtReportPreview");
          if(h && h.querySelector('[data-agn-level-wait]') && !_reportFrozen()){ var rr=(state.assessment&&state.assessment.rows)||[]; if(!rr.some(function(r){ return r&&(r.status==='pending'||r.sitePending); })) generateReport(); } }catch(_){} }, 900); }); }); }
      return; }
    if(_drPending || _ctxPending || (_dynRows.length>=3 && _feedGap.length===_dynRows.length)){
      var _live=0, _tot=0; try{ var _DI=window.DISTRICT_IN||{}; Object.keys(_DI).forEach(function(k){ _tot++; if(_DI[k]&&(_DI[k].weatherLive||_DI[k].nationalLive)) _live++; }); }catch(_){}
      var _who=String((state.assessment&&(state.assessment.assetName||(state.assessment.station&&state.assessment.station.name)))||'this subject').replace(/[<>&"]/g,'');
      state.reportDoc=null; state.reportSnapshot=null; state.reportId=null;
      state.reportHtml=(_ctxPending && !_drPending && _feedGap.length<_dynRows.length)
        ? '<div class="asmt-warning" data-agn-feed-wait="1"><b>Report not generated yet: the server context for '+_who+' (15-day outlook, weeks 3–6, season, actions, verified error) has not arrived.</b> '
          +'A document is not frozen with those pages empty. It lands within a few seconds of loading; this page regenerates by itself when it does, and if the server does not answer the report is built with the gap stated.</div>'
        : (_drPending && _feedGap.length<_dynRows.length)
        ? '<div class="asmt-warning" data-agn-feed-wait="1"><b>Report not generated yet: the national drought table (90-day SPI/SPEI and root-zone stress) has not arrived for '+_who+'.</b> '
          +'Drought is a condition every report carries and a document is not built with it missing. The table lands within about twenty seconds of loading; '
          +'this page regenerates by itself when it does. If it does not, the server has no drought table (Operations lists the drought job) and Generate again builds the report with the gap stated.</div>'
        : '<div class="asmt-warning" data-agn-feed-wait="1"><b>Report not generated yet: the weather feed for '+_who+' has not arrived.</b> '
        +'Every weather-driven hazard ('+_feedGap.map(function(r){return r.label||r.key;}).join(', ')+') is waiting for its forecast, and a document is not built from missing data. '
        +(_tot?('The national forecast is live for '+_live+' of '+_tot+' units. '):'')
        +'This page regenerates by itself when the feed lands; you can also press Generate again in a minute.</div>';
      var _hw=$("asmtReportPreview"); if(_hw) _hw.innerHTML=state.reportHtml;
      

      if(generateReport.__feedWaitFor!==_who){ generateReport.__feedWait=0; generateReport.__feedWaitFor=_who; }
      if(!generateReport.__feedWired){
        generateReport.__feedWired=true; generateReport.__feedWait=generateReport.__feedWait||0;
        

        var _retry=function(force){ if((generateReport.__feedWait>=8 && !force) || generateReport.__feedPending) return; generateReport.__feedWait++; generateReport.__feedPending=true;    
          setTimeout(function(){
            

            try{ if(typeof runAssessment==='function') runAssessment(); }catch(_){}
            try{ var _h=$("asmtReportPreview"); if(_h && _h.querySelector('[data-agn-feed-wait]')) generateReport(); }catch(_){}
            generateReport.__feedPending=false; }, 1500); };
        ['agn:national','agn:data','agn:location','agn:drought-national','agn:report-context'].forEach(function(evn){ document.addEventListener(evn, function(){ var h=$("asmtReportPreview"); if(h && h.querySelector('[data-agn-feed-wait]')) _retry(evn==='agn:drought-national'||evn==='agn:report-context'); }); });
      }
      return;
    }
  }catch(_){}
  var ev=reportEvidence();
  var body='';
  try{
    if(window.AGN && AGN.report){
      var doc=AGN.report.freeze(Object.assign({
        

        type:(function(){ try{
                var _r=AGN.reportCatalog.reports[uiType];
                if(_r && _r.route) return _r.route;
                 
                if(AGN.report && AGN.report.ROUTES && AGN.report.ROUTES[uiType]) return uiType;
              }catch(_){}
              return 'technical'; })(),
        

        title:(function(){ var el=$("asmtReportTitle");
                 var v=el&&el.value?String(el.value).trim():'';
                 return (v && v!==(el.defaultValue||'').trim()) ? v : null; })(),
        purpose:(function(){ var el=$("asmtReportPurpose");
                 var v=el&&el.value?String(el.value).trim():'';
                 return (v && v!==(el.defaultValue||'').trim()) ? v : null; })(),
        

        unit:(function(){ try{ var _s=AGN.subject.get();
                 return _s.unit || _s.unitUnresolvedName
                        || ((state.assessment&&state.assessment.station&&state.assessment.station.name)||null);
               }catch(_){ return (state.assessment&&state.assessment.station&&state.assessment.station.name)||null; } })(),
        subject:(function(){ try{ return AGN.subject.get(); }catch(_){ return null; } })(),

        

        national:(uiType==='portfolio')
      }, ev));
      

      var _plain = function (o) {
        try { return JSON.parse(JSON.stringify(o)); }
        catch (_) { return { unclonable: true,
                             why: 'the document held a value that is not plain data' }; }
      };
      state.reportDoc=_plain(doc);
      state.reportSnapshot=_plain(AGN.report.snapshot(doc));
      

      state.reportId=doc.id||null;
      state.reportAt=doc.at||null;
      try{ state.reportAtText=doc.at
             ? new Date(doc.at).toLocaleString('en-GB',{timeZone:'Asia/Karachi'})+' PKT'
             : null; }catch(_){ state.reportAtText=null; }
      

      state.reportFingerprint=_evidenceFingerprint(_frozenProjection(doc.evidence||ev));
      state.reportFingerprintBasis='frozen';
      

      try{ state.reportLiveAtFreeze=_evidenceFingerprint(_frozenProjection(reportEvidence())); }catch(_){ state.reportLiveAtFreeze=null; }
      

      try{
        var _ps=AGN.project.state();
        _ps.reports=Array.isArray(_ps.reports)?_ps.reports:[];
        _ps.reports.push({
          document_id:doc.document_id||doc.id||null,
          project_id:doc.project_id||null, decision_case_id:doc.decision_case_id||null,
          asset_id:doc.asset_id||null, hazard_id:doc.hazard_id||null,
          horizon_id:doc.horizon_id||null, scenario_id:doc.scenario_id||null,
          type:doc.type||null, title:doc.title||null, purpose:doc.purpose||null,
          generated_at:doc.generated_at||null,
          engine_methodology_version:doc.engine_methodology_version||null,
          build_version:doc.build_version||null,
          evidence_ids:doc.evidence_ids||[],
          evidence_fingerprint:state.reportFingerprint||null,
          document_hash:doc.document_hash||null,
          document_hash_algorithm:doc.document_hash_algorithm||null,
          status:doc.status||null, prepared_by:doc.prepared_by||null,
          reviewed_by:doc.reviewed_by||null, approved_by:doc.approved_by||null,
          supersedes:doc.supersedes||null,
          identity_incomplete:doc.identity_incomplete||null,
          output_class:(doc.outputClass&&doc.outputClass.label)||null,
           
          issuable:(function(){ try{ var _iv=AGN.exports&&AGN.exports.issuable?AGN.exports.issuable():null; return !!(_iv&&_iv.ok); }catch(_){ return false; } })(),
          carried_evidence:(ev&&ev.carriedEvidence)?ev.carriedEvidence.length:0,
          

          document:(function(){
            try{ return JSON.parse(JSON.stringify(doc)); }
            catch(_){ return null; }
          })()
        });
        

        if(_ps.reports.length>200) _ps.reports=_ps.reports.slice(-200);
        (function(){
          var withDoc=_ps.reports.filter(function(r){ return r && r.document; });
          if(withDoc.length>25){
            var shed=withDoc.slice(0, withDoc.length-25);
            shed.forEach(function(r){
              r.document=null;
              r.document_shed_why='the frozen document was shed to keep the project file '
                +'bounded; its identity, evidence ids and seal are retained above and the '
                +'document can be re-verified from an exported copy';
            });
          }
        })();
      }catch(e){ agnDiag('report','register:push', e); }
      body=AGN.report.render(doc).html;
      

    }
  }catch(e){
    

    try{ console.warn('[AGN report] document assembly failed', (e&&e.message)||e); }catch(_){}
    if(!body){
      body='<section class="rpt-page"><div class="rpt-head"><div class="rpt-num">1</div>'
          +'<h3>Report unavailable</h3></div><div class="rpt-refusal"><b>Withheld</b><ul>'
          +'<li><b>the whole document</b> — assembly failed with: '
          +String((e&&e.message)||e)+'. Nothing is printed rather than a partial document '
          +'that looks complete.</li></ul></div></section>';
    }
  }
  

  if(!body){
    body='<section class="rpt-page"><div class="rpt-head"><div class="rpt-num">1</div>'
        +'<h3>Report withheld</h3></div><div class="rpt-refusal"><b>Withheld</b><ul>'
        +'<li><b>the whole document</b> — the governed report architecture '
        +'(AGN.report) did not produce one, and the legacy narrative is not '
        +'issued in its place: it carries no frozen snapshot, no refusal list '
        +'and no output class, and it is indistinguishable from a governed '
        +'report once printed.</li></ul></div></section>';
  }
  state.reportHtml=body;
  

  try{
    var _bn=(typeof _issueBanner==='function')?_issueBanner():'';
    var _st=_freezeStamp();
    if(_bn||_st) state.reportHtml=_bn+_st+body;
  }catch(_){}
  var host=$("asmtReportPreview"); if(host) host.innerHTML=state.reportHtml;
  try{ _renderFreezeState(); }catch(_){}
}
  function fullReportDocument(){
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc((state.reportDoc&&state.reportDoc.title)||"AI GEO NIGRAAN report")}${state.reportDoc&&state.reportDoc.id?" · "+esc(state.reportDoc.id):""}</title><style>body{font-family:Manrope,Arial,sans-serif;color:#22333d;max-width:900px;margin:40px auto;padding:0 24px;line-height:1.55}h1,h2,h3{color:#0C3851}h2{font-size:1.75rem}h3{margin-top:26px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #dfe5e8;padding:8px;text-align:left;font-size:0.75rem}th{background:#f3f6f7}.stamp{font-size:0.75rem;color:#71808a}p,li{font-size:0.8125rem}@media print{body{margin:0;max-width:none}}
</style></head><body>${(function(){ try{ return _evidenceMoved() ? '<div style="margin:0 0 10px;padding:8px 10px;border:2px solid #b8860b;border-radius:6px;background:#fff6e0;font-weight:700">The live evidence has changed since this document was frozen. This file is the document that was reviewed; generate a new preview to issue the current evidence.</div>' : ''; }catch(_){ return ''; } })()}${(function(h){ try{ return (h && window.AGN && AGN.operator && AGN.operator.customerHtml) ? AGN.operator.customerHtml(h) : h; }catch(_){ return h; } })(state.reportHtml)||'<h1>Report withheld</h1><p>The governed report architecture did not produce a document, and the legacy narrative is not issued in its place.</p>'}</body></html>`;
  }
  

  function agnSlug(s){ return String(s||'Pakistan').normalize('NFKD').replace(/[^\w\s-]/g,'')
      .trim().replace(/\s+/g,'-').replace(/-+/g,'-') || 'Pakistan'; }
  function agnStamp(){ try{ const d=new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Karachi'}));
      const p=n=>String(n).padStart(2,'0');
      return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}PKT`;
    }catch(_){ return 'undated'; } }
  function agnName(kind, ext, loc){ const B=window.AGN_BUILD||{product:'AI-GEO-NIGRAAN',version:'unversioned'};
    return `${B.product}_${kind}_${agnSlug(loc)}_${agnStamp()}_${B.version}.${ext}`; }
  window.agnName=agnName;
  function download(name,text,type){
    const blob=new Blob([text],{type:type||"text/plain;charset=utf-8"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
  }
  function portfolioCsv(){
    const head=["asset_id","name","asset_type","matched_location","match_method","match_distance_km","match_confidence","leading_hazard","exposure_signal","evidence_readiness","priority","status","data_gaps"];
    

    const _pv=(function(){ try{ return !!(window.AGN_ISSUANCE&&AGN_ISSUANCE.indexVisible&&AGN_ISSUANCE.indexVisible()); }catch(_){ return false; } })();
    const rows=state.portfolio.map(r=>[r.asset_id||'',r.name,r.asset_type,
      r.station&&r.station.name,r.matchMethod||'',r.matchDistanceKm,r.matchConfidence||'',(r.leadSummary?r.leadSummary.text:''),((r.leadSummary&&!r.leadSummary.none)?r.leadSummary.leaders.map(function(x){ return x.score; }).join('|'):''),r.confidence,(_pv?r.priority:''),r.status,(r.gaps||[]).join("|")]);
    return [head,...rows].map(row=>row.map(v=>`"${String(v==null?"":v).replace(/"/g,'""')}"`).join(",")).join("\n");
  }

  function bind(){
    $("asmtTabs").addEventListener("click",e=>{const b=e.target.closest("button[data-asmt]");if(b)showPane(b.dataset.asmt);});
    

    var _at=$("asmtAsset");
    if(_at) _at.addEventListener("change",function(){
      try{ if(domain.validSector(_at.value)) domain.setSector(_at.value,'assessments'); }catch(_){}
      

      try{ if(typeof state!=='undefined' && state.assessment) runAssessment(); }catch(_){}
      

      try{ refreshApplicability(); }catch(_){}
    });
    

    var _loc=$("asmtLocation");
    if(_loc) _loc.addEventListener("change",function(){ try{ refreshApplicability(); }catch(_){} });
    

    var _hc=$("asmtHazardChecks");
    if(_hc) _hc.addEventListener("change",function(e){
      var cb=e.target;
      if(cb && cb.type==='checkbox') cb.dataset.agnUser='1';
    });
    document.addEventListener("agn:location",()=>setTimeout(()=>{syncCurrent(true);runAssessment();},260));
    $("asmtRun").addEventListener("click",runAssessment);
    document.addEventListener("agn:view",e=>{ if(e&&e.detail&&e.detail.view==="report") showPane("report"); });
    

    

    var _sciRerunBusy=false, _sciRerunLast=null;
    document.addEventListener('agn:project',function(){
      try{
        var a=(window.AGN&&AGN.project&&AGN.project.state().assets)||[];
        screenPortfolio(a.map(function(x){return Object.assign({},x);}), {fromProject:true});
      }catch(_){}
      

      try{
        var _act=(AGN.project.activeAsset&&AGN.project.activeAsset())||null;
        var _aid=_act?String(_act.asset_id||''):'';
        var _cur=(state.assessment&&state.assessment.assetId)?String(state.assessment.assetId):'';
        if(_aid===_cur){ _sciRerunLast=null; }
        else if(_aid && !_sciRerunBusy && _sciRerunLast!==_aid && typeof runAssessment==='function'){
          _sciRerunBusy=true; _sciRerunLast=_aid;
          try{ runAssessment(); } finally{ _sciRerunBusy=false; }
        }
      }catch(_){ _sciRerunBusy=false; }
    });
    $("asmtPortExport").addEventListener("click",()=>download(agnName('Portfolio-Screening','csv'),portfolioCsv(),"text/csv;charset=utf-8"));
    $("asmtEngSync").addEventListener("click",renderEngineering);
    $("asmtEngHorizon").addEventListener("change",renderEngStress);
     
    var _rt=$("asmtEngRatedT");
    if(_rt){ _rt.addEventListener("input",renderEngStress);
             _rt.addEventListener("change",renderEngStress); }
    $("asmtGenerateReport").addEventListener("click",generateReport);
    

    $("asmtReportType").addEventListener("change",generateReport);
    

    function _issuable(){
      if(_reportFrozen()) return true;
      

      try{ _renderFreezeState(); }catch(_){}
      var st=$("asmtReportStatus")||$("asmtFreezeState");
      if(st) st.textContent='Nothing to issue: no document has been frozen. '
        + 'Press Generate preview \u2014 an export must be the document you reviewed, '
        + 'so this button will not build one for you.';
      return false;
    }
    $("asmtDownloadReport").addEventListener("click",()=>{
      if(!_issuable())return;
      try{ _renderFreezeState(); }catch(_){}
      var _ivd=null; try{ _ivd=(window.AGN&&AGN.exports&&AGN.exports.issuable)?AGN.exports.issuable():null; }catch(_){}
      var _hd=fullReportDocument(); if(_ivd && !_ivd.ok) _hd=_sampleMarked(_hd,_ivd);
      download(_exportName('Climate-Assessment','html'),_hd,"text/html;charset=utf-8");});
    

    

     
     
    function _sampleMarked(html, iv){
      var demo=/demo|demonstration|sample|design surface/i.test(String((iv&&iv.why)||'')+' '+String((iv&&iv.cls&&iv.cls.label)||''));
      var mark=demo?'SAMPLE — DEMONSTRATION DATA':'NOT FOR ISSUE — DRAFT';
      var who='';
      try{ var _pc=AGN.project&&AGN.project.state&&AGN.project.state().company; who=(_pc&&_pc.client_name)||''; }catch(_){}
      var css='<style id="agn-sample-mark">@media print{@page{margin:14mm}} .agn-wm{position:fixed;top:40%;left:-10%;width:120%;text-align:center;transform:rotate(-30deg);font:900 64px/1 system-ui,sans-serif;color:rgba(179,38,30,.13);letter-spacing:.06em;pointer-events:none;z-index:99999;white-space:nowrap} .agn-wm-top{position:fixed;top:0;left:0;right:0;text-align:center;font:800 11px/1.6 system-ui,sans-serif;color:#7a1a14;background:rgba(253,236,234,.92);z-index:99999}</style>';
      var cover='<div style="margin:0 0 14px;padding:14px 16px;border:3px solid #B3261E;border-radius:8px;background:#fdecea;color:#7a1a14;font:600 13px/1.5 system-ui,sans-serif"><div style="font:900 20px system-ui,sans-serif;margin-bottom:4px">'+mark+'</div>'
        +(demo?'This is a sample of the NIGRAAN report, printed from the demonstration case'+(who?' ('+esc(who)+')':'')+'. The company, assets and values are fictional. It shows what a client report contains; it is not an assessment of any real asset and carries no issue stamp.'
              :'This document is not issuable in its current state ('+esc((iv&&iv.why)||'')+'). It is printed for review only.')+'</div>';
      return html.replace(/<\/head>/i, css+'</head>').replace(/<body([^>]*)>/i, '<body$1><div class="agn-wm">'+mark+'</div><div class="agn-wm-top">'+mark+' · not an issued document</div>'+cover);
    }
    function _printSample(iv){
      var html=_sampleMarked(fullReportDocument(), iv);
      var w=window.open('','_blank');
      if(!w){ var st=$("asmtReportStatus")||$("asmtReportPreview"); if(st) st.textContent='The sample print needs a pop-up window; allow pop-ups for this page and press Print again.'; return; }
      w.document.open(); w.document.write(html); w.document.close();
      setTimeout(function(){ try{ w.focus(); w.print(); }catch(_){} }, 600);
    }
    $("asmtPrintReport").addEventListener("click",()=>{
      if(!_issuable())return;
      try{ _renderFreezeState(); }catch(_){}
      var note=document.querySelector('.view[data-view="assessments"] .agn-xnote');
      if(window.AGN && AGN.exports && AGN.exports.print){
        var _iv=null; try{ _iv=AGN.exports.issuable(); }catch(_){}
        if(_iv && !_iv.ok){
          

          _printSample(_iv);
        } else if(!AGN.exports.print(note||null) && !note){
          var st=$("asmtReportStatus")||$("asmtReportPreview");
          var why=(AGN.exports.issuable()||{}).why||'this state may not be issued from';
          if(st) st.textContent='Printing refused. '+why;
        }
      } else { window.print(); }
    });
  }
  function init(){
    if(!$("machAssessmentWorkspace"))return;
    populate();bind();renderEngineering();
    setTimeout(runAssessment,700);
  }
  

  window.AGN=window.AGN||{};
  if(AGN.implementations) AGN.implementations.define('assessments',{
    refresh:function(){ try{ syncCurrent(); if(state && state.assessment) runAssessment(); }catch(_){} },
    run:runAssessment,
    syncCurrent:syncCurrent,
    generateReport:generateReport,
    getState:function(){return {assessment:state.assessment,portfolio:state.portfolio.slice(),reportHtml:state.reportHtml,assetType:state.assetType,horizon:state.horizon,lastCalculationId:state.assessment&&state.assessment.calculation_id||state.lastCalculationId||null};}
  },{source:'modules/assessments/32-agn-assessment-workspaces.js',owner:'assessments',moduleType:'isolated-section-implementation',dependencies:['data:contracts','data:persistence','workflow:assessments','data:domain'],globalDependencies:[],compatibilityGlobals:[]});
  if(document.readyState!=="loading")init();else document.addEventListener("DOMContentLoaded",init);
})();
