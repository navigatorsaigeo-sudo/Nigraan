
(function(){
  

  var G=window, CACHE={}, TTL=10*60000;
  function esc(v){ return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function dl(iso){ if(!iso) return '–'; var d=new Date(String(iso).slice(0,10)+'T12:00:00Z'); return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()]+' '+d.getUTCDate()+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]; }
   
  function pktT(iso){ if(iso==null||iso==='') return null; var s=String(iso); if(/T\d\d:\d\d(:\d\d(\.\d+)?)?$/.test(s)) s+='Z'; var t=Date.parse(s); if(!isFinite(t)) return String(iso);
    var d=new Date(t+5*3600e3); return d.getUTCDate()+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]+' '+('0'+d.getUTCHours()).slice(-2)+':'+('0'+d.getUTCMinutes()).slice(-2)+' PKT'; }
  function mn(ym){ return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(String(ym).slice(5,7))-1]+' '+String(ym).slice(0,4); }
  function cap(t){ t=String(t||''); return t.charAt(0).toUpperCase()+t.slice(1); }
  function sg(x,u,d){ if(x==null||!isFinite(x)) return '–'; return (x>0?'+':'')+Number(x).toFixed(d==null?1:d)+(u||''); }

   
  var PRC={};
  function prKey(lat,lon){ return Number(lat).toFixed(4)+','+Number(lon).toFixed(4); }
  

  function subjectPoint(){ try{ var s=AGN.subject.get(); if(!s) return null; if(s.asset_lat!=null&&s.asset_lon!=null) return {lat:+s.asset_lat, lon:+s.asset_lon, basis:'asset'};
      

      try{ var ap=(AGN.data&&AGN.data.activePoint)?AGN.data.activePoint():null, su0=(ap&&ap.lat!=null&&AGN.siteUnit)?AGN.siteUnit(+ap.lat,+ap.lon):null, u0=s.unit||s.unitUnresolvedName;
        if(ap&&ap.lat!=null&&ap.lon!=null&&su0&&su0.key&&u0&&(su0.key===u0||(G.geo&&G.geo.districtOf&&G.geo.districtOf(su0.key)===u0))) return {lat:+ap.lat, lon:+ap.lon, basis:'selected place', name:ap.name||null}; }catch(_){}
      /* v91.17.283.19: a subject named as the selected place, its tehsil or its district (the bundle's place record) is the selected place */
      try{ var ap1=(AGN.data&&AGN.data.activePoint)?AGN.data.activePoint():null, pl1=(ap1&&ap1.lat!=null&&AGN.pointState&&AGN.pointState.placePeek)?AGN.pointState.placePeek(+ap1.lat,+ap1.lon):null, u1=String(s.unit||s.unitUnresolvedName||'').toLowerCase();
        if(pl1&&u1&&[pl1.name,pl1.tehsil,pl1.district].some(function(x){ return x&&String(x).toLowerCase()===u1; })) return {lat:+ap1.lat, lon:+ap1.lon, basis:'selected place', name:pl1.name||ap1.name||null}; }catch(_){}
      var u=s.unit||s.unitUnresolvedName; var c=u?CACHE[String(u).toLowerCase()]:null; var cu=c&&c.v&&c.v.unit; if(cu&&cu.lat!=null&&cu.lon!=null) return {lat:+cu.lat, lon:+cu.lon, basis:'tehsil centroid', elev:(cu.elevM!=null&&isFinite(+cu.elevM))?+cu.elevM:null};     }catch(_){} return null; }
  G.AGN.subjectPoint=subjectPoint;
  function warmPoint(){ try{ var s=subjectPoint(); if(!s) return; var k=prKey(s.lat,s.lon), c=PRC[k];
      if(c && Date.now()-c.at<20*60000) return;
      AGN.pointState.part('pointrun',s.lat,s.lon).then(function(v){ if(v&&typeof v==='object') v=Object.assign({},v,{siteBasis:s.basis}); PRC[k]={at:Date.now(),v:v}; }).catch(function(){}); }catch(_){} }   /* v91.17.283.19: the bundle's pointrun part */
   
  var GLC={};
  function warmGlof(){ try{ var s=subjectPoint(); if(!s) return; var k=Number(s.lat).toFixed(3)+','+Number(s.lon).toFixed(3);
    if(GLC[k]&&Date.now()-GLC[k].at<3600e3) return;
    AGN.pointState.part('glof',s.lat,s.lon).then(function(v){ if(v){ if(typeof v==='object') v=Object.assign({},v,{siteBasis:s.basis}); GLC[k]={at:Date.now(),v:v}; } }).catch(function(){}); }catch(_){} }   /* v91.17.283.19: the bundle's glof part */
  

  var INFLIGHT={};
  

  function withLevels(v){ var id=v&&v.unit&&v.unit.unitId; if(!id) return v;
    /* v91.17.283.12 · the page's one cache of the issued levels (AGN.engineLevels.levels: GET /api/levels/unit once per tehsil) */
    var EL=window.AGN&&AGN.engineLevels; if(!EL||!EL.levels){ v.mapLevels={why:'the issued levels are loading'}; return v; }
    return EL.levels(id).then(function(L){
      if(!L||!L.days){ v.mapLevels={why:(L&&L.why)||'the engine did not answer'}; return v; }
      v.mapLevels={at:L.at, stale:!!L.stale, days:L.days.map(function(d){ var o={}; Object.keys(d.layers||{}).forEach(function(k){ o[k]={name:d.layers[k].name, word:d.layers[k].word}; }); return {day:d.day, date:d.date, layers:o}; })}; return v;
    }).catch(function(){ v.mapLevels={why:'the engine did not answer'}; return v; }); }
  

  function withChance(v){ if(!v) return v; return fetch(location.origin+'/api/map/layer?id=scales:map').then(function(r){ return r.ok?r.json():null; }).then(function(j){
      var o=j&&j.ready&&j.outlookChance; v.chanceScale=o&&o.classes&&o.classes.length?{classes:o.classes, source:'data/map-layer-scales.json outlookChance'}:{why:'the map scale did not answer'}; return v;
    }).catch(function(){ v.chanceScale={why:'the map scale did not answer'}; return v; }); }
   
   
  function chanceShade(C,ps){ var top=-1; (ps||[]).forEach(function(p){ var q=chanceClassOf(C,p), r=q?lvRank(q.level):-1; if(r>top) top=r; });
    var rH=lvRank(lvOfClass('Watch')), rM=lvRank(lvOfClass('Monitor')); return rH>=0&&top>=rH?'rpt-plus-h':rM>=0&&top>=rM?'rpt-plus-m':''; }
  function chanceClassOf(C,p){ var K=C&&C.chanceScale&&C.chanceScale.classes; if(!K||p==null||!isFinite(p)) return null; for(var i=K.length-1;i>=0;i--){ if(p>=K[i].min) return K[i]; } return K[0]; }
   
  function dayLevels(C,date){ var M=C&&C.mapLevels; if(!M||!M.days) return null; var d=M.days.filter(function(x){ return x.date===date; })[0]; return d?d.layers:null; }
  function lvRank(w){ try{ return G.AGN.level.words.indexOf(w); }catch(_){ return -1; } }
  function lvOfClass(c){ try{ return G.AGN.level.ofClass(c); }catch(_){ return null; } }
  function warm(){ try{ warmGlof(); }catch(_){} try{ warmPoint(); }catch(_){} try{ var s=AGN.subject.get(); var u=s&&(s.unit||s.unitUnresolvedName); var k=String(u||'').toLowerCase();
      var c0=CACHE[k]; if(u && !(c0 && Date.now()-c0.at<TTL) && !(INFLIGHT[k] && Date.now()-INFLIGHT[k]<20000)){ INFLIGHT[k]=Date.now();
        (function(){ var sp=subjectPoint(); return (sp&&sp.basis!=='tehsil centroid')?AGN.pointState.part('context',sp.lat,sp.lon).then(function(v){ return v&&!v.unavailable&&!v.error?v:null; })   /* v91.17.283.19: the bundle's context part */
          :fetch(location.origin+'/api/report/context?unit='+encodeURIComponent(u)).then(function(r){return r.ok?r.json():null;}); })().then(withLevels).then(withChance).then(function(v){ delete INFLIGHT[k]; CACHE[k]=v?{at:Date.now(),v:v}:{at:Date.now()-TTL+60000,v:null,failed:true}; try{ warmGlof(); warmPoint(); }catch(_){}     try{ document.dispatchEvent(new CustomEvent('agn:report-context',{detail:{unit:u, ok:!!v}})); }catch(_){} })
          .catch(function(){ delete INFLIGHT[k]; CACHE[k]={at:Date.now()-TTL+60000,v:null,failed:true}; try{ document.dispatchEvent(new CustomEvent('agn:report-context',{detail:{unit:u, ok:false}})); }catch(_){} }); } }catch(_){} }

  

  

  var EVL={heatSpell:'Heat spell (hotter than usual here for 3+ days, and hot enough to matter)',unusualWarmth:'Unusually warm for this place',coastalHeat:'Coastal humid heat (apparent temperature ≥40 °C for 2+ days; an air-temperature screen)',rain3_75:'Heavy rain (3-day total ≥75 mm)',rain3Local:'Extreme 3-day rain for this place',rainOnSnow:'Rain on snow (above 1,500 m)',coldSpell:'Cold spell (colder than usual here for 3+ nights, and cold enough to matter)',heavySnow:'Heavy snow (3-day total ≥30 cm)',frostSpell:'Frost spell below 2,000 m (3+ nights)'};
  var TH={tn0:'frost (below 2,000 m)',sn10:'snow ≥10 cm',pr25:'rain ≥25 mm',pr50:'rain ≥50 mm',gu60:'gusts ≥60 km/h'};
  function hIdx(h){ if(!h||h.categorical) return null; var v=(h.screeningIndex!==undefined)?h.screeningIndex:h.score; return (v==null||!isFinite(Number(v)))?null:Number(v); }
   
  function band(i){ if(i==null) return 'not scored'; try{ return G.AGN.level.word(i); }catch(_){ return 'not scored'; } }
  

   
  function vOf(h){ if(h&&!h.categorical&&h.level!=null){ try{ return G.AGN.level.words[h.level]||null; }catch(_){ return null; } } var i=hIdx(h); if(i==null) return null; try{ return G.AGN.level.word(i); }catch(_){ return null; } }
  var VR={Severe:5,High:4,Moderate:3,Low:2,Normal:1};    
   
  function recWord(r){ return r.level || (r.cls==='Act'?'act now':r.cls==='Watch'?'prepare':(r.cls||'')); }
  

  var FRESH_H={ensemble:18, air:30};
  

  var REF=null;
  function refNow(){ return (REF!=null && isFinite(REF)) ? REF : Date.now(); }
  function ageH(at){ var t=Date.parse(at||''); return isFinite(t)?(refNow()-t)/3600e3:Infinity; }
  function todayISO(){ return new Date(refNow()+5*3600e3).toISOString().slice(0,10); }
  function staleNote(what,at,lim){ return '<p class="rpt-note"><b>Withheld: '+esc(what)+' is '+Math.round(ageH(at))+' h old</b> (run of '+esc(pktT(at)||'unknown')+'), past the '+lim+' h limit for this product. It is not printed as a current forecast. Regenerate once the server has refreshed it.</p>'; }
  function none(doc){ return '<p class="rpt-note">The local server did not return forecast context for this unit when the document was frozen.</p>'; }

  function summaries(C){
    var o={};
    var ev=C.outlook&&C.outlook.events, best=null;
    if(ev) Object.keys(EVL).forEach(function(k){ var x=ev[k]; if(x&&x.p!=null&&(!best||x.p>best.p)) best={k:k,p:x.p,onset:x.onset}; });
    o.ev=best;
    var weeks=(C.subseasonal&&C.subseasonal.weeks)||[];
    var later=weeks.filter(function(w){ return w.start>=new Date(refNow()+5*3600e3+10*864e5).toISOString().slice(0,10); });    
    o.weeks=later;
    var months=((C.seasonal&&C.seasonal.months)||[]).slice(1);
    o.months=months;
    return o;
  }
  function weeksText(ws){
    if(!ws.length) return 'no extended-range forecast returned';
     
    var sig=function(w,k){ return w.signal?!!w.signal[k]:false; };
    var warm=ws.filter(function(w){return sig(w,'warm');}), cool=ws.filter(function(w){return sig(w,'cool');}), wet=ws.filter(function(w){return sig(w,'wet');}), dry=ws.filter(function(w){return sig(w,'dry');});
    var parts=[];
    if(warm.length) parts.push('warmer than normal from the week of '+dl(warm[0].start)+' ('+warm[0].pT1+'% chance of more than +1 °C)');
    if(cool.length) parts.push('cooler than normal in the week of '+dl(cool[0].start));
    if(wet.length) parts.push('wetter than normal in the week of '+dl(wet[0].start)+' ('+sg(wet[0].pAnom,' mm')+')');
    if(dry.length) parts.push('drier than normal in the week of '+dl(dry[0].start));
    return parts.length?parts.join('; '):'close to normal for temperature and rain';
  }
  function seasonText(ms){
    if(!ms.length) return 'no seasonal forecast returned';
    var t=ms.map(function(m){return m.tAnom;}), lo=Math.min.apply(null,t), hi=Math.max.apply(null,t);
    var wet=ms.filter(function(m){ var nrm=m.pMean-m.pAnom; return m.pAnom>=Math.max(10,0.25*nrm); }), dry=ms.filter(function(m){ var nrm=m.pMean-m.pAnom; return m.pAnom<=-Math.max(10,0.25*nrm); });
    var span=mn(ms[0].month).slice(0,3)+'–'+mn(ms[ms.length-1].month).slice(0,3);
    var s=span+': '+(lo>=0.5?'warmer than normal by '+sg(lo,'')+' to '+sg(hi,' °C'):hi<=-0.5?'cooler than normal':'temperature near normal to '+sg(hi,' °C'));
    if(wet.length) s+='; rain above normal in '+wet.map(function(m){return mn(m.month).slice(0,3);}).join(', ');
    if(dry.length) s+='; rain below normal in '+dry.map(function(m){return mn(m.month).slice(0,3);}).join(', ');
    return s;
  }

  var DRAW={
    pSituation:function(doc){
      var C=doc.evidence.localContext; if(!C||C.__noServerContext) return {drawn:true,html:none(doc)};
      var hzAll=(doc.evidence.hazards||[]).filter(function(h){return hIdx(h)!=null||(h&&!h.categorical&&h.level!=null);});
      

      var isCond=function(h){ return /drought|glof/i.test(String(h.name||'')); };
      var hz=hzAll.filter(function(h){ return !isCond(h); });
      var conds=hzAll.filter(isCond);
      var S=summaries(C), U=C.unit||{};
      var topRank=0; hz.forEach(function(h){ var r=VR[vOf(h)]||0; if(r>topRank) topRank=r; });
      var topCls=Object.keys(VR).filter(function(k){return VR[k]===topRank;})[0]||null;
      var tiedH=hz.filter(function(h){return (VR[vOf(h)]||0)===topRank;});
      var tied=tiedH.map(function(h){return h.name.toLowerCase();});
      var top=tiedH[0]||null;
      /* v91.17.283.31 · owner · a hazard is listed only at Moderate or above; a Low is a condition line (mild heat / cold stress), never a hazard */
      var lowH=hz.filter(function(h){ return (VR[vOf(h)]||0)===VR.Low; });
      var lowCond=function(h){ var n=String(h.name||'').toLowerCase(); return /heat/.test(n)?'moderate heat stress':/cold/.test(n)?'moderate cold stress':'minor '+n+' conditions'; };
      var todayTxt = !hz.length ? 'no hazard carried a level'
        : ((topRank<VR.Moderate) ? ((C.hazardList&&C.hazardList.ready&&!C.hazardList.none)?String(C.hazardList.partial||C.hazardList.nothingAssessed||'no hazard list could be made').replace(/^No /,'no '):'no hazard at this site in the period')+(lowH.length?' (conditions only: '+lowH.map(function(h){ return lowCond(h); }).join(', ')+')':'')+(conds.length?' (conditions are on their own line: '+conds.map(function(h){ return h.name.toLowerCase().replace(/\bglof\b/g,'GLOF')+' '+vOf(h); }).join(', ')+')':'')
        : (tied.length>1 ? tied.join(', ')+' are co-equal at '+topCls+' (each on its own index)' : top.name+' is at '+topCls));
      var _ensStale=!!(C.outlook&&C.outlook.ensemble&&ageH(C.outlook.ensemble.at)>FRESH_H.ensemble);
      if(_ensStale) S.ev=null;
      var _evK=S.ev?chanceClassOf(C,S.ev.p):null;    
      var evTxt = _ensStale ? 'the ensemble outlook on the server is from the run of '+pktT(C.outlook.ensemble.at)+' ('+Math.round(ageH(C.outlook.ensemble.at))+' h old, past the '+FRESH_H.ensemble+' h limit), so it is not printed here as a current forecast; the Forecast screen shows it with that run date, from today on' : !S.ev ? 'no ensemble outlook was available' : (!_evK ? 'the highest multi-day event chance is '+EVL[S.ev.k].toLowerCase()+', '+S.ev.p+'% of the 51 ensemble members (the map\u2019s chance classes were not returned, so it is not classed)' : lvRank(_evK.level)>=lvRank(lvOfClass('Monitor')) ? 'the main risk is '+EVL[S.ev.k].toLowerCase()+': '+S.ev.p+'% of the 51 ensemble members show it ('+_evK.label.toLowerCase()+' on the map\u2019s chance classes), typically from '+dl(S.ev.onset) : 'no multi-day heat, rain or cold event reaches the map\u2019s '+esc(lvOfClass('Monitor')||'')+' chance class (highest: '+EVL[S.ev.k].toLowerCase()+', '+S.ev.p+'%, '+_evK.label.toLowerCase()+')');
      var acts=(C.actionRecords&&C.actionRecords.records||[]).filter(function(r){ return r.source!=='planning'&&r.source!=='watch'&&r.source!=='standing'; });
      var _stn=(C.actionRecords&&C.actionRecords.records||[]).filter(function(r){ return r.source==='standing'; }).length, _wtn=(C.actionRecords&&C.actionRecords.records||[]).filter(function(r){ return r.source==='watch'; }).length;
      var h='<p class="rpt-note">Forecast context on this page and the next is for the tehsil ('+esc(U.name||'unit')+(U.lat!=null?', centroid '+U.lat+', '+U.lon:'')+(U.elevM!=null?(U.elevSource&&U.elevSource!=='anchor point'?', at the settlement height '+U.elevM+' m (population-weighted median; anchor point '+U.anchorElevM+' m)':', '+U.elevM+' m'):'')+(U.wetness&&U.wetness.now?'; catchment wetness: root zone '+Math.round(100*U.wetness.now.ws)+'% of its yearly range ('+esc(U.wetness.now.state)+'), '+esc(U.wetness.now.awsMm)+' mm of storage left against '+esc(U.wetness.rain.next72Mm)+' mm forecast in the 72 h from '+esc(pktT(U.wetness.at)||'an unrecorded time')+' (the soil-water run\u2019s own rain at the centroid; the named run\u2019s 72 h total at the asset is on the next page), effective sponge '+(U.wetness.effectiveSponge!=null?Math.round(100*U.wetness.effectiveSponge)+'%':'n/a')+', sensitivity '+esc(U.wetness.sensitivity.level):(U.wetness&&U.wetness.notDefined?'; catchment wetness: not defined here (the model soil barely varies)':''))+(U.hand&&U.hand.bands?'; floodplain: '+Math.round(100*(U.hand.bands.lt2+U.hand.bands.b2_5))+'% of the tehsil within 5 m above the major rivers (HAND: height above nearest drainage, GLO-90), riverine screening \u00d7'+Number(U.hand.factor).toFixed(2):(U.hand&&U.hand.why?'; HAND: '+U.hand.why:''))+(U.hand&&U.hand.where&&U.hand.where.text?'; where rain collects: '+esc(U.hand.where.text):'')+'), not the asset coordinate. The hazard screening is at the asset coordinate.</p><p class="rpt-plus-lead"><b>'+esc(U.name||doc.unit||'This unit')+'</b>'+(U.district?' ('+esc(U.district)+', '+esc(U.province||'')+(U.elevM!=null?', '+U.elevM+' m':'')+')':'')+'. Today '+esc(todayTxt)+'. In the next 15 days '+esc(evTxt)+'. Weeks 3–6: '+esc(weeksText(S.weeks))+'. Season ahead: '+esc(seasonText(S.months))+'.</p>';
      h+='<div class="rpt-plus-kpis">'
        +'<div><div class="k">Today (event hazards)</div><div class="v">'+(top?((topRank<VR.Moderate)?'No hazard':esc(topCls+' · '+tied.join(', '))):'–')+'</div><div class="s">'+(top?hz.length+' event hazards; the hazard engine\u2019s levels for the tehsil (the map), not compared across hazards':'no event hazard carried a screening index')+'</div></div>'
        +'<div><div class="k">Conditions (weeks–months)</div><div class="v">'+(conds.length?esc(conds.map(function(h){ return h.name.toLowerCase().replace(/\bglof\b/g,'GLOF')+' '+vOf(h); }).join(' · ')):'–')+'</div><div class="s">'+(conds.length?'drought: screening index (observed rain and soil, updated monthly); a Low level does not rule out drought (never an alert); GLOF: corridor susceptibility. No response clock':'no accumulated condition scored')+'</div></div>'
        +'<div><div class="k">Next 15 days</div><div class="v">'+(S.ev?esc(S.ev.p+'% · '+EVL[S.ev.k].split(' (')[0]):'–')+'</div><div class="s">'+(S.ev&&S.ev.onset?'typically from '+esc(dl(S.ev.onset)):'no onset in the window')+'</div></div>'
        +'<div><div class="k">Weeks 1–6</div><div class="v">'+esc(S.weeks.length?cap(weeksText(S.weeks).split(' from ')[0].split(' in the week')[0]):'–')+'</div><div class="s">weeks-ahead ensemble, against its own normal</div></div>'
        +'<div><div class="k">Season</div><div class="v">'+esc(S.months.length?cap(seasonText(S.months).split(': ')[1].split(';')[0]):'–')+'</div><div class="s">seasonal ensemble, next '+S.months.length+' months</div></div>'
        +'</div>';
      /* v91.17.283.10 · owner decision 23 Oct 2026: drought stays in every client report as a monthly screening section (server context
         C.drought, report.mjs droughtSectionOf); it is never an alert and carries no response clock */
      var _dr=C.drought; if(_dr&&_dr.title){ h+='<div class="rpt-drought"><p class="rpt-note"><b>'+esc(_dr.title)+'.</b> Level: <b>'+esc(_dr.level||'Not assessed')+'</b>'+(_dr.droughtClass?' (drought class '+esc(_dr.droughtClass)+')':'')+' \u00b7 month of data: '+esc(_dr.month||'not available')+'. '+esc(cap(_dr.note||''))+'.'+(_dr.notAssessedWhy?' Not assessed: '+esc(_dr.notAssessedWhy)+'.':'')+'</p></div>'; }
      h+='<p><b>Decision this report supports.</b> '+esc(doc.purpose||'Screen this site and prioritise it for detailed assessment')+'. '
        +(acts.length?('<b>'+acts.length+' recommended action'+(acts.length===1?' is':'s are')+'</b> listed under Recommended actions, the first ready by '+esc(acts[0].prepare_by_text||'–')+'.'):'No action is triggered for this asset.')+' '+_stn+' standing measure'+(_stn===1?'':'s')+' for this season and ground and '+_wtn+' item'+(_wtn===1?'':'s')+' on the watch list are printed under Recommended actions.</p>';
      h+='<p class="rpt-note">Screening indices rank severity within each hazard (0–100); they are not probabilities. Chances are shares of ensemble members and are not yet calibrated. The national meteorological and disaster-management authorities are the authoritative source for warnings.</p>';
      return {drawn:true,html:h};
    },
    pOutlook15:function(doc){
      var C=doc.evidence.localContext, O=C&&C.outlook; if(!O||!O.ensemble) return {drawn:true,html:none(doc)};
      var E=O.ensemble, ev=O.events, A=O.adjustment;
      if(ageH(E.at)>FRESH_H.ensemble) return {drawn:true,html:staleNote('the 15-day ensemble',E.at,FRESH_H.ensemble)};
      var h='<p class="rpt-note">global forecast model ensemble, '+E.members+' members, issued '+esc(pktT(E.at))+'. Values are the median with the 10–90% range.'+(A&&A.stationGuard?' Temperatures are not shifted here because the nearby airport thermometer shows the reference (global reanalysis) is biased.':(A&&A.tx&&A.tx.applied?' Daily max/min shifted by the tested model-bias adjustment (test-month error '+A.tx.maeRaw+' → '+A.tx.maeAdjusted+' °C for max).':''))+'</p>';
      

      var ML=C.mapLevels, mlOk=!!(ML&&ML.days&&!ML.stale), rH=lvRank(lvOfClass('Watch')), rM=lvRank(lvOfClass('Monitor'));
      h+='<table class="rpt-plus-t"><thead><tr><th>Day</th><th>Heat stress (UTCI, map)</th><th>Max °C (air)</th><th>Min °C (air)</th><th>Rain mm (wet case)</th><th>Gust km/h</th><th>Chances ≥10%</th></tr></thead><tbody>';
      E.days.filter(function(d){ return d.date>=todayISO(); }).slice(0,15).forEach(function(d){
        var ch=Object.keys(TH).filter(function(k){return d.p&&d.p[k]>=10;}).map(function(k){return TH[k]+' '+d.p[k]+'%';});
        var L=mlOk?dayLevels(C,d.date):null, top=-1; if(L) Object.keys(L).forEach(function(k){ var r=lvRank(L[k].word); if(r>top) top=r; });
        var hw=L&&L.heat?L.heat.word:null;
        h+='<tr class="'+(rH>=0&&top>=rH?'rpt-plus-h':rM>=0&&top>=rM?'rpt-plus-m':'')+'"><td>'+dl(d.date)+'</td><td>'+(hw?esc(hw):'–')+'</td><td class="n">'+(d.tx?'<b>'+d.tx[1]+'</b> ('+d.tx[0]+'–'+d.tx[2]+')':'–')+'</td><td class="n">'+(d.tn?d.tn[1]+' ('+d.tn[0]+'–'+d.tn[2]+')':'–')+'</td><td class="n">'+(d.pr?d.pr[1]+' ('+d.pr[2]+')':'–')+'</td><td class="n">'+(d.gu?d.gu[1]:'–')+'</td><td>'+esc(ch.join(', ')||'–')+'</td></tr>';
      });
      h+='</tbody></table><p class="rpt-note">Heat stress is the map\'s heat level (UTCI in shade, Bröde et al. 2012; levels as on the map) for the days the engine derives'+(ML&&ML.at?' (run of '+esc(pktT(ML.at))+')':'')+(ML&&ML.stale?'; that run is stale, so no row is marked from it':'')+(ML&&ML.why?'; not available: '+esc(ML.why):'')+'. A row is shaded at '+esc(lvOfClass('Monitor')||'–')+' (light) and '+esc(lvOfClass('Watch')||'–')+' (dark) on any hazard of the map that day. Max and min are air temperature, supporting detail.</p>';
      if(ev){ h+='<h4 style="margin:10px 0 4px;color:#0C3851">Multi-day events, member by member ('+dl(ev.window[0])+' to '+dl(ev.window[1])+')</h4><table class="rpt-plus-t"><thead><tr><th>Event</th><th>Chance</th><th>Typical start</th><th>Earliest</th></tr></thead><tbody>';
        Object.keys(EVL).forEach(function(k){ var x=ev[k]; if(!x) return; if(x.p==null){ h+='<tr><td>'+esc(EVL[k])+'</td><td class="n">n/a</td><td colspan="2" style="white-space:normal;color:#5b6b76">'+esc(x.why||'not evaluated for this place: no member was screened for this event')+'</td></tr>'; return; }     var q=chanceClassOf(C,x.p); h+='<tr class="'+chanceShade(C,[x.p])+'"><td>'+esc(EVL[k])+'</td><td class="n"><b>'+x.p+'%</b>'+(q?' <span class="rpt-note">'+esc(q.label)+'</span>':'')+'</td>';   h+='<td>'+dl(x.onset)+'</td><td>'+dl(x.earliest)+'</td></tr>'; });
        var KC=(C.chanceScale&&C.chanceScale.classes)||[], kl=function(r0){ return KC.filter(function(q){ return r0>=0&&lvRank(q.level)>=r0; }).map(function(q){ return q.label+' ('+q.min+'–'+q.max+'%)'; }); }, kH=kl(rH), kM=kl(rM).filter(function(x){ return kH.indexOf(x)<0; });
        h+='</tbody></table><p class="rpt-note">'+(KC.length?'A row is shaded by the chance class the map\u2019s chance layers use (data/map-layer-scales.json): light at '+esc(kM.join(', ')||'–')+', dark at '+esc(kH.join(', ')||'–')+'. ':'The map\u2019s chance classes were not returned with this document, so no event row is shaded. ')+'Hottest 3 days, mean max: '+(ev.peak3dTx?ev.peak3dTx[1]+' °C ('+ev.peak3dTx[0]+'–'+ev.peak3dTx[2]+')':'–')+' · wettest 3 days: '+(ev.max3dRain?ev.max3dRain[1]+' mm (wet case '+ev.max3dRain[2]+' mm)':'–')+'. Each member is one possible future; a 40% chance means 20 of 51 members contain the event. Local limits come from 1991–2020 global reanalysis for this tehsil and season. The heat events are air-temperature screens; the heat level is UTCI (the table above).</p>'; }
      var AQ=C.air; if(AQ&&AQ.at&&ageH(AQ.at)>FRESH_H.air){ h+=staleNote('the air-quality forecast',AQ.at,FRESH_H.air); AQ=null; }
      if(AQ&&AQ.days){ AQ={at:AQ.at,classes:AQ.classes,dispersion:AQ.dispersion,notes:AQ.notes,days:AQ.days.filter(function(d){return d.date>=todayISO();})}; }
      if(AQ&&AQ.days&&AQ.days.length){ h+='<h4 style="margin:10px 0 4px;color:#0C3851">Air quality and smog, next 5 days</h4><table class="rpt-plus-t"><thead><tr><th>Day</th><th>PM2.5 daily mean</th><th>Class</th><th>Dispersion</th><th>Morning inversion</th><th>Fog hours</th><th>Dust µg/m³</th></tr></thead><tbody>';
        AQ.days.forEach(function(d){ h+='<tr class="'+(false?'rpt-plus-h':d.pmClass>=2?'rpt-plus-m':'')+'"><td>'+dl(d.date)+'</td><td class="n"><b>'+d.pm25+'</b> µg/m³</td><td>'+esc(AQ.classes[d.pmClass]||'–')+'</td><td>'+esc(AQ.dispersion[d.dispersion]||'–')+'</td><td class="n">'+(d.inversionHours==null?'n/a':d.inversionHours+' h')+'</td><td class="n">'+(d.fogHours!=null?d.fogHours:'–')+' h</td><td>'+(d.dust!=null?Math.round(d.dust):'–')+'</td></tr>'; });
        h+='</tbody></table><p class="rpt-note">'+esc(AQ.notes.join(' '))+' Pakistan NEQS 24-hour PM2.5 limit: 35 µg/m³.</p>'; }
      var sn=O.sunshine&&O.sunshine.today; if(sn&&sn.anomaly!=null) h+='<p class="rpt-note">Satellite check today (to '+esc((O.sunshine.lastHour||'').slice(11))+' local): sunshine at '+Math.round(sn.anomaly*100)+'% of the usual satellite/model ratio — '+esc(sn.verdict)+'.</p>';
      return {drawn:true,html:h};
    },
    pOutlookLong:function(doc){
      var C=doc.evidence.localContext; if(!C) return {drawn:true,html:none(doc)};
      var W=C.subseasonal, M=C.seasonal, h='';
       
      h+='<p class="rpt-note"><b>Not verified locally.</b> Weeks-ahead (weeks-ahead ensemble) and seasonal (seasonal ensemble) figures are the model\u2019s own anomalies against its own re-forecast climate. No Pakistani station verification of either exists in this release (the seasonal ledger has logged runs but scored nothing yet), so these tables support planning attention, not commitments.</p>';
      if(W&&W.weeks&&W.weeks.length){
        h+='<h4 style="margin:4px 0;color:#0C3851">Weeks ahead · '+esc(W.model)+'</h4><table class="rpt-plus-t"><thead><tr><th>Week</th><th>Temperature vs normal</th><th>Chance warmer / &gt;+1 °C / &gt;+2 °C</th><th>Rain vs normal</th><th>Chance wetter / &gt;+10 mm</th><th>Reading</th></tr></thead><tbody>';
        W.weeks.forEach(function(w){ var read=[]; if(w.pT1>=50) read.push('warm'); else if(w.pT0<=30) read.push('cool'); if(w.pP0>=65&&w.pAnom>=3) read.push('wet'); else if(w.pP0<=30&&w.pAnom<=-2) read.push('dry');
           
          h+='<tr class="'+chanceShade(C,[w.pT1,w.pT2,w.pP10])+'"><td>'+dl(w.start)+' – '+dl(w.end)+'</td><td class="n"><b>'+sg(w.tAnom,' °C')+'</b></td><td class="n">'+w.pT0+'% / '+w.pT1+'% / '+w.pT2+'%</td><td class="n"><b>'+sg(w.pAnom,' mm')+'</b></td><td class="n">'+w.pP0+'% / '+w.pP10+'%</td><td>'+esc(read.join(', ')||'near normal')+'</td></tr>'; });
        h+='</tbody></table><p class="rpt-note">'+esc(W.reference)+'. Skill falls quickly after week 3; treat weeks 4–6 as a tilt in the odds, not a forecast of specific days. Not yet verified locally. A week is shaded by the map\u2019s chance class of its highest chance of more than +1 °C, +2 °C or +10 mm (data/map-layer-scales.json, as the event rows).</p>';
      } else h+='<p class="rpt-note">No extended-range (EC46) forecast was returned for this unit.</p>';
      if(M&&M.months&&M.months.length){
        h+='<h4 style="margin:10px 0 4px;color:#0C3851">Season ahead · '+esc(M.model)+'</h4><table class="rpt-plus-t"><thead><tr><th>Month</th><th>Mean temperature</th><th>vs normal</th><th>Rain</th><th>vs normal</th><th>Reading</th></tr></thead><tbody>';
        M.months.forEach(function(m,i){ var nrm=m.pMean-m.pAnom, pct=nrm>0?Math.round(100*m.pAnom/nrm):null; var read=[]; if(m.tAnom>=1) read.push('warm'); else if(m.tAnom<=-1) read.push('cool'); if(pct!=null&&m.pAnom>=10&&pct>=25) read.push('wet'); else if(pct!=null&&m.pAnom<=-10&&pct<=-25) read.push('dry');
          h+='<tr class="'+(read.length?'rpt-plus-m':'')+'"><td>'+mn(m.month)+(i===0?' (in progress)':'')+'</td><td class="n">'+(m.tMean==null?esc(m.tText||'–'):m.tMean+' °C')+'</td><td class="n"><b>'+sg(m.tAnom,' °C')+'</b></td><td class="n">'+(m.pMean==null?esc(m.pText||'–'):Math.round(m.pMean)+' mm')+'</td><td class="n">'+(m.display==='anomaly'?'<b>'+sg(m.pPct,'%',0)+'</b>':'<b>'+sg(m.pAnom,' mm',0)+'</b>'+(pct!=null?' ('+sg(pct,'%',0)+')':''))+'</td><td>'+esc(read.join(', ')||'near normal')+'</td></tr>'; });
        h+='</tbody></table><p class="rpt-note">'+esc(M.reference)+'. Seasonal temperature signals are more reliable than rain signals; rain skill over Pakistan is low outside the winter and monsoon seasons. Grid-cell values (about 36 km), not a point forecast. Not yet verified locally.</p>';
      } else h+='<p class="rpt-note">No seasonal (SEAS5) forecast was returned for this unit.</p>';
      return {drawn:true,html:h};
    },
    pActions:function(doc){
      

      var C=doc.evidence.localContext||{}, R=C.actionRecords;
      if(!R) return {drawn:true,html:'<p class="rpt-note">No action records were frozen with this document.</p>'};
      var h='<p class="rpt-note">Each action names its trigger, the evidence it came from, who owns it by default and by when it has to be ready. Owners and wording are AGN defaults for the asset\'s sector unless the client supplied them; the source column says which. Actions are operational preparations, not warnings; they do not replace official warnings from the national and provincial authorities.</p>';
      var SRC={limit:'Client operating limit (0–48 h)',class:'Hazard class at the asset (now)',event:'Ensemble event (1–15 days)',planning:'Planning note (weeks ahead / season)'};
      var any=false;
      ['limit','class','event'].forEach(function(src){
        var rows=R.records.filter(function(r){return r.source===src;});
        if(!rows.length) return; any=true;
        h+='<h4 style="margin:10px 0 4px;color:#0C3851">'+esc(SRC[src])+'</h4><table class="rpt-plus-t"><thead><tr><th>Ready by</th><th>Hazard</th><th>Trigger</th><th>Chance / confidence</th><th>Action</th><th>Owner</th><th>Check afterwards</th></tr></thead><tbody>';
        rows.forEach(function(r){ h+='<tr class="'+(r.cls==='Act'||r.urgent?'rpt-plus-h':(r.cls==='Watch'?'rpt-plus-m':''))+'"><td><b>'+esc(r.prepare_by_text||'–')+'</b><div class="rpt-note">'+esc(r.action_id)+'</div></td><td>'+esc(r.hazard_label||r.hazard)+(recWord(r)?' · '+esc(recWord(r)):'')+'</td><td>'+esc(r.trigger)+'<div class="rpt-note">evidence: '+esc((r.evidence||[]).join('; ')||'–')+'</div></td><td class="n">'+esc(r.chance!=null?r.chance+'%':(r.confidence||'–'))+'</td><td>'+esc(r.action)+(r.asset_note?'<div class="rpt-note">'+esc(r.asset_note)+'</div>':'')+'</td><td>'+esc(r.owner_role)+'<div class="rpt-note">'+esc(r.owner_source)+'</div></td><td class="rpt-note">'+esc(r.verification)+'</td></tr>'; });
        h+='</tbody></table>';
      });
      var plan=R.records.filter(function(r){return r.source==='planning';});
      if(plan.length){ h+='<h4 style="margin:10px 0 4px;color:#0C3851">'+SRC.planning+'</h4><ul>'+plan.map(function(r){ return '<li><b>'+esc(r.hazard_label||r.hazard)+'</b>: '+esc(r.trigger)+' — '+esc(r.action)+' <span class="rpt-note">('+esc(r.owner_role)+'; a signal against normal, not a dated action)</span></li>'; }).join('')+'</ul>'; }
      if(!any && !plan.length) h+='<p><b>No action is triggered.</b> No client limit is forecast to be crossed, no hazard at the asset has reached its response trigger, and no ensemble event reaches its chance threshold. The standing measures and the watch list below still apply.</p>';
       
      var wl=R.records.filter(function(r){return r.source==='watch';}), stl=R.records.filter(function(r){return r.source==='standing';});
      h+='<h4 style="margin:10px 0 4px;color:#0C3851">Close to the line — below the action thresholds</h4>';    
      if(wl.length){ h+='<table class="rpt-plus-t"><thead><tr><th>What</th><th>Reading</th><th>Source</th><th>If it crosses the line</th></tr></thead><tbody>'+wl.map(function(r){ return '<tr><td><b>'+esc(r.hazard_label)+'</b></td><td>'+esc(r.trigger)+'</td><td class="rpt-note">'+esc(r.confidence)+'</td><td>'+esc(String(r.action).replace(/^No action is triggered; keep it on the daily check and re-read the outlook tomorrow\. ?/,''))+'</td></tr>'; }).join('')+'</tbody></table>'; }
      else h+='<p class="rpt-note">Nothing sits between the action line and the noise floor today: no ensemble event above 10% of members, no drought condition at mild or moderate, catchment not primed, no GLOF trigger loaded upstream, air quality below the sensitive-group class.</p>';
      h+='<h4 style="margin:10px 0 4px;color:#0C3851">Standing measures — this season, this ground</h4>';
      if(stl.length){ h+='<table class="rpt-plus-t"><thead><tr><th>Why here</th><th>Measure</th><th>Owner</th></tr></thead><tbody>'+stl.map(function(r){ return '<tr><td><b>'+esc(r.hazard_label)+'</b><div class="rpt-note">'+esc(r.trigger)+' — '+esc(r.confidence)+'</div></td><td>'+esc(r.action)+(r.asset_note?'<div class="rpt-note">'+esc(r.asset_note)+'</div>':'')+'</td><td>'+esc(r.owner_role)+'</td></tr>'; }).join('')+'</tbody></table>'; }
      else h+='<p class="rpt-note">No standing measure applies: the tehsil\'s climatology shows no heat, wet, cold, smog or dust season in this month or the next, and the ground carries no floodplain, ponding, slope, glacial-lake, seismic or coastal flag.</p>';
      if(R.withheld && R.withheld.length) h+='<p class="rpt-note"><b>Not turned into actions:</b> '+R.withheld.map(function(w){return esc(w);}).join(' · ')+'</p>';
      h+='<p class="rpt-note">Built '+esc(R.built_at_text||'')+' for '+esc(R.asset_name||R.unit||'this subject')+'. Response windows for event-hazard classes are AGN defaults (immediate trigger: ready within 12 h; 48-hour trigger: ready within 48 h), not the client\'s SOP. A drought class is a 90-day condition and carries a review window (7 or 14 days), not a response clock.</p>';
      return {drawn:true,html:h};
    },
    pVerified:function(doc){
      var C=doc.evidence.localContext, K=C&&C.skill; if(!K) return {drawn:true,html:none(doc)};
      

      if(!K.internalDiagnostic){
        /* v91.17.283.29 · W3 · the customer accuracy is the ONE figure of the place record (placeRecord.accuracy: the verification ledger, the
           as-issued forecast against quality-controlled station observations); the station-pair and tier figures are no longer quoted here */
        var AC=(function(){ try{ var I=doc.identity||{}, A=doc.asset||{}, la=I.lat!=null?I.lat:(I.latitude!=null?I.latitude:A.latitude), lo=I.lon!=null?I.lon:(I.longitude!=null?I.longitude:A.longitude);
            if(la==null||lo==null){ var ap=window.AGN&&AGN.data&&AGN.data.activePoint?AGN.data.activePoint():null; if(ap){ la=ap.lat; lo=ap.lon; } }
            var B=la!=null&&window.AGN&&AGN.pointState&&AGN.pointState.peek?AGN.pointState.peek(+la,+lo):null, x=B&&B.parts&&B.parts.placeRecord; return x&&!x.unavailable&&x.v?x.v.accuracy:null; }catch(_){ return null; } })();
        if(AC){ var hd=AC.headline||{}, BL=(AC.byLead&&(AC.byLead[hd.varKey||'T']||AC.byLead.T))||[];
          var ha='<p><b>Forecast accuracy here: '+esc(AC.text||(hd.maeC!=null?hd.maeC+' °C':'not measured'))+'</b></p><p class="rpt-note">'+esc(AC.basis||hd.set||'')+'</p>';
          if(BL.length) ha+='<table class="rpt-plus-t"><thead><tr><th>Forecast day</th><th>Mean absolute error</th><th>Pairs</th></tr></thead><tbody>'+BL.map(function(r){ return '<tr><td>'+(r.lead===0?'same day':'day '+r.lead)+'</td><td class="n">'+(r.maeC!=null?esc(r.maeC)+' °C'+(r.maeCi?' ('+esc(r.maeCi[0])+'\u2013'+esc(r.maeCi[1])+')':''):'<span class="rpt-note">'+esc(r.why||'not measured')+'</span>')+'</td><td class="n">'+(r.n!=null?esc(r.n):'\u2013')+'</td></tr>'; }).join('')+'</tbody></table>';
          return {drawn:true,html:ha}; }
        var M=K.mach, R=K.rule||{};
         
        var _tw={A:'station within reach (tier A)',B:'no station within reach; forecast at the settlement height (tier B)',C:'no station within reach; forecast with terrain proxies (tier C)'}[String(K.tier||'')]||('tier '+(K.tier||'–'));
        var hb='<p><b>Forecast quality here: <span style="letter-spacing:1px">'+esc(K.mark||'')+'</span> '+esc(_tw)+'</b> · '+esc(K.label||'')+'.</p>'
          +'<p class="rpt-note">'+esc(K.basis||'')+'</p>';
        if(M){ hb+='<table class="rpt-plus-t"><thead><tr><th>MACH station</th><th>Distance · height gap</th><th>Hours paired</th><th>Error, same day</th><th>Error, next day</th><th>Error, day 3</th><th>Bias</th></tr></thead><tbody>'
            +'<tr><td><b>'+esc(M.station)+'</b><div class="rpt-note">'+esc(M.first)+' to '+esc(M.last)+'</div></td><td class="n">'+esc(M.km)+' km · '+(M.dzM==null?'–':(M.dzM>=0?'+':'')+esc(M.dzM)+' m')+'</td><td class="n">'+esc(M.hours)+'</td>'
            +'<td class="n"><b>'+esc(M.maeC)+' °C</b></td><td class="n">'+(M.lead1MaeC!=null?esc(M.lead1MaeC)+' °C':'–')+'</td><td class="n">'+(M.lead3MaeC!=null?esc(M.lead3MaeC)+' °C':'–')+'</td><td class="n">'+sg(M.biasC,' °C',2)+'</td></tr></tbody></table>'
            +'<p class="rpt-note">Mean absolute error of the hourly 2 m temperature forecast against the MACH station\u2019s own readings. MACH is AGN\u2019s own network.</p>'; }
        hb+='<p class="rpt-note">Tiers: '+esc((R.reachKm!=null?'A = a MACH station within '+R.reachKm+' km and '+R.maxDzM+' m of the served height; ':'')+'B = forecast at the settlement height from open terrain and population layers; C = forecast with terrain proxies')+'.</p>';
        return {drawn:true,html:hb};
      }
      

      var h='<p class="rpt-note">Past screening forecasts for this tehsil ('+esc(K.verifiedModel||'best_match')+', the screening feed) scored against '+esc(K.reference)+'. A reanalysis is not an observation, and the reference shares a modelling centre with the system being scored, so this is model agreement, not forecast error against instruments.'
        +(K.verifiedModelNote?' '+esc(K.verifiedModelNote)+'.':'')+'</p>';
      if(K.mountain){ var _ms=K.mountain.sheet&&K.mountain.sheet.raw;
        h+='<p><b>Mountain unit ('+esc(K.mountain.elevM)+' m):</b> '+esc(K.mountain.note)+'. Station-measured, reference mountain network'+(K.mountain.sheet&&K.mountain.sheet.sample?' ('+esc(K.mountain.sheet.sample)+')':'')+': '
          +(_ms?('raw bias '+esc(_ms.bias_C)+' °C, mean absolute error '+esc(_ms.mae_C)+' °C, RMSE '+esc(_ms.rmse_C)+' °C'):'see the skill sheet')+'; corrected (daytime MOS) 2.0 to 2.8 °C.'+(K.mountain.sheet&&K.mountain.sheet.note?' '+esc(K.mountain.sheet.note):'')+'</p>'; }
      if(K.rows&&K.rows.length){ h+='<table class="rpt-plus-t"><thead><tr><th>Lead time</th><th>Hours scored</th><th>Temperature error before correction</th><th>As served</th><th>Correction</th></tr></thead><tbody>';
        K.rows.forEach(function(r){ h+='<tr><td>'+r.lead+' h</td><td class="n">'+r.hours+'</td><td class="n">'+r.rmseRaw+' °C (bias '+sg(r.biasRaw,' °C',2)+')</td><td class="n"><b>'+(r.guard?r.guard.raw:r.rmseServed)+' °C</b>'+(r.guard?'<div class="rpt-note">against the airport thermometer</div>':'')+'</td><td>'+(r.guard?('off: the '+esc(r.guard.station)+' airport thermometer ('+r.guard.km+' km) scored the raw forecast at '+r.guard.raw+' °C and the corrected one at '+r.guard.candidate+' °C, so global reanalysis is the biased side here'):(r.corrected?'applied (tested on a separate month)':'not applied (did not help on the test month)'))+'</td></tr>'; });
        h+='</tbody></table><p class="rpt-note">Error is root-mean-square error of hourly temperature.</p>'; }
      if(K.station) h+='<p><b>Nearest thermometer:</b> '+esc(K.station.name)+' ('+K.station.km+' km), '+(K.station.hours||0)+' hours: forecast error '+K.station.rmseRaw24+' °C at 24 h before correction; global reanalysis at the station '+(K.station.era5?K.station.era5.rmse+' °C (bias '+sg(K.station.era5.bias,' °C',2)+')':'–')+'.</p>';
      if(K.national) h+='<p><b>National grade '+esc(K.national.grade)+':</b> '+esc(K.national.basis||'')+'.'+(K.national.domain?' Domain: '+esc(K.national.domain)+'.':'')+(K.national.mountainCaveat?' '+esc(K.national.mountainCaveat)+'.':'')+'</p>';
       
      if(C.metNotes&&C.metNotes.length){ h+='<p><b>Other products, measured at the reference mountain network:</b></p><ul>'+C.metNotes.map(function(m){ return '<li><b>'+esc(m.product)+':</b> '+esc(m.note)+' <span class="rpt-note">[measured · skill sheet '+esc(m.skill)+']</span></li>'; }).join('')+'</ul>'; }
      if(K.correctionServing===false) h+='<p class="rpt-note">"As served" is scored on the value NIGRAAN serves (the zone forecast at the point\'s height and the served corrections). The reanalysis hour-of-day correction is fitted but not served in this build (switched off in v91.17.23 after the airport thermometers scored it worse than raw).</p>';
      if(K.ensembleRecord) h+='<p class="rpt-note">Ensemble record: '+K.ensembleRecord.logs+' daily runs logged since '+esc(K.ensembleRecord.firstIssue||'–')+', '+K.ensembleRecord.pairs+' forecast–observation pairs scored'+(K.ensembleRecord.calibrated?'':'; chances are not yet calibrated'+(K.ensembleRecord.firstScoreExpected&&!K.ensembleRecord.pairs?' (first scores '+esc(K.ensembleRecord.firstScoreExpected)+')':''))+'. Weeks-ahead and seasonal forecasts are not yet verified locally.</p>';
      return {drawn:true,html:h};
    }
  };
  

  function fixFlood(html, doc){
    try{ var fl=doc&&doc.evidence&&doc.evidence.flood, hz=(doc.evidence.hazards||[]).filter(function(h){return /flood/i.test(h.name);})[0];
      if(!fl||fl.pluvial!=null||fl.riverine!=null||!hz||hIdx(hz)==null) return html;
      return html.replace(/(<section class="rpt-page" data-page="pFlood">[\s\S]*?<\/h3><\/div>)[\s\S]*?(<\/section>)/, function(_,a,b){ return a+'<p>The flood index for this unit is <b>'+hIdx(hz)+'/100 ('+band(hIdx(hz))+')</b>, scored from forecast rain, soil moisture and antecedent rain. It is not split into pluvial and riverine pathways in an exploratory screen: that split needs a decision case with a river-discharge check for the reach.</p>'+b; });
    }catch(_){ return html; }
  }
  function lab(k){ var c={OBSERVED:'#1b6e3a',MODELLED:'#0C3851',CALCULATED:'#8a4b00','CLIENT SUPPLIED':'#5b2a86'}[k]||'#555'; return '<span style="display:inline-block;padding:0 5px;border:1px solid '+c+';border-radius:4px;color:'+c+';font:700 11px/1.6 system-ui,sans-serif;letter-spacing:.04em;vertical-align:middle">'+esc(k)+'</span>'; }
  DRAW.pPoint=function(doc){
     
    var R=doc.evidence.pointRun;
    if(!R||!R.ok) return {drawn:true,html:'<p class="rpt-note"><b>Withheld:</b> '+esc((R&&R.why)||'no frozen model run for this subject')+'.</p>'};
    var S=R.summary||{}, g=R.gridCell||{}, st=R.site||{};
    var h='<p class="rpt-note">'+lab('MODELLED')+' '+esc(R.modelLabel)+', run initialised <b>'+esc(pktT(R.run))+'</b> (the run is archived, so it can be fetched again), valid '+esc(pktT(R.validFrom))+' to '+esc(pktT(R.validTo))+', retrieved '+esc(pktT(R.retrievedAt))+'. '+esc(R.correction)+'</p>';
    h+='<table class="rpt-plus-t"><tbody>'
      +'<tr><td>'+(R.siteBasis==='tehsil centroid'?'Tehsil centroid (no asset active)':R.siteBasis==='selected place'?'Selected place (no asset active)':'Asset coordinate')+'</td><td>'+lab(R.siteBasis==='tehsil centroid'||R.siteBasis==='selected place'?'CALCULATED':'CLIENT SUPPLIED')+' '+esc(st.lat)+', '+esc(st.lon)+(st.nearestPlace?' · '+lab('MODELLED')+' '+esc(st.nearestPlace)+' <span class="rpt-note">(local place index)</span>':'')+'</td></tr>'
      +'<tr><td>Site elevation</td><td>'+((R.siteBasis==='tehsil centroid'&&/supplied/i.test(String(st.elevationSource||'')))?lab('CALCULATED')+' '+esc(st.elevation)+' m (the tehsil\u2019s served height, the same figure as page 1; the run was asked at it)':lab(/supplied/i.test(String(st.elevationSource||''))?'CLIENT SUPPLIED':'MODELLED')+' '+esc(st.elevation)+' m ('+esc(st.elevationSource)+')')+'</td></tr>'
      +'<tr><td>Model grid cell used</td><td>'+lab('MODELLED')+' '+esc(g.lat)+', '+esc(g.lon)+' · <b>'+esc(g.distanceKm)+' km</b> from the asset'+(g.nearestPlace?' ('+esc(g.nearestPlace)+')':'')+' · cell terrain '+esc(g.elevation)+' m · elevation gap <b>'+(g.elevationGapM>0?'+':'')+esc(g.elevationGapM)+' m</b> (site minus cell). A 9 km model cell is an area, not the site.</td></tr>'
      +'</tbody></table>';
    var row=function(label,o,u,note){ return '<tr><td>'+label+'</td><td class="n">'+lab('MODELLED')+' <b>'+(o&&o.v!=null?esc(o.v)+' '+u:'–')+'</b></td><td>'+(o&&o.at?esc(pktT(o.at)):'')+'</td><td class="rpt-note">'+(note||'')+'</td></tr>'; };
    h+='<h4 style="margin:10px 0 4px;color:#0C3851">Next 72 hours at the asset</h4><table class="rpt-plus-t"><thead><tr><th>Quantity</th><th>Value</th><th>When</th><th>Note</th></tr></thead><tbody>'
      +row('Maximum temperature',S.tmax,'°C','Raw run of the named model, at the site elevation.')
      +row('Minimum temperature',S.tmin,'°C','')
      +row('Wet-bulb maximum',S.wetBulbMax,'°C','From the run\u2019s temperature and humidity, solved at the site\u2019s air pressure (the method every NIGRAAN screen uses).')
       
      +row('Gust maximum',S.gustMax,'km/h','Model gust at 10 m; above 1,500 m NIGRAAN does not score wind from it.')
      +'<tr><td>Rain, 72 h total</td><td class="n">'+lab('MODELLED')+' <b>'+(S.rainTotal!=null?esc(S.rainTotal)+' mm':'–')+'</b></td><td></td><td class="rpt-note">Point rain from one run; the ensemble chance on the 15-day page is the figure to plan on.</td></tr>'
      +'</tbody></table>';
    h+='<p class="rpt-note">Input hash '+esc(R.inputHash)+'. Anyone can fetch this run again with the request recorded on the reproducibility page and compare it number for number.</p>';
    return {drawn:true,html:h};
  };
  DRAW.pCrossings=function(doc){
     
    var X=doc.evidence.localContext&&doc.evidence.localContext.crossings;
    if(!X) return {drawn:true,html:'<p class="rpt-note">No operating limits are registered for this asset, so no crossing is evaluated. Load the client limit register in Operations and regenerate.</p>'};
    if(X.error) return {drawn:true,html:'<p class="rpt-na">'+esc(X.error)+'</p>'};
    var dw={above:'above',below:'below'};
    var h='<p class="rpt-note">'+lab('CLIENT SUPPLIED')+' limits, authorities, owners and actions come from the client limit register. '
      +lab('MODELLED')+' values: 0–72 h from global forecast model run <b>'+esc(X.run||'–')+'</b>; days 3–14 from the 51-member global ensemble'
      +(X.shift!=null?' moved onto that run at the asset ('+(X.shift>=0?'+':'')+esc(X.shift)+' °C)':'')+'. '
      +lab('CALCULATED')+' margins, chances and prepare-by times. Evaluated '+esc(pktT(X.issued)||'–')+'. Exposure only: no downtime or loss is estimated.</p>';
    var rows=X.rows||[];
    h+='<table class="rpt-plus-t"><thead><tr><th>Limit</th><th>Forecast value</th><th>Margin</th><th>When</th><th>Chance / confidence</th><th>Consequence</th><th>Owner · action · prepare by</th></tr></thead><tbody>';
    if(!rows.length) h+='<tr><td colspan="7">No registered limit is forecast to be crossed to day 15.</td></tr>';
    rows.forEach(function(r){
      h+='<tr><td>'+esc(r.label)+' '+esc(dw[r.dir]||r.dir)+' <b>'+esc(r.limit)+' '+esc(r.unit||'')+'</b>'+(r.requiredHours>1?' for '+esc(r.requiredHours)+' h':'')+'<br><span class="rpt-note">'+esc(r.authority||'')+(r.reference?' · '+esc(r.reference):'')+'</span></td>'
        +'<td class="n">'+(r.value!=null?esc(r.value)+' '+esc(r.unit||''):'–')+(r.valueHigh!=null?'<br><span class="rpt-note">1 in 10 members '+esc(r.valueHigh)+'</span>':'')+'<br><span class="rpt-note">'+esc(r.horizon)+' · '+esc(r.source)+'</span></td>'
        +'<td class="n">'+(r.margin!=null?(r.margin>=0?'+':'')+esc(r.margin)+' '+esc(r.unit||''):'–')+'</td>'
        +'<td>'+esc(r.when)+(r.until?' → '+esc(r.until):'')+(r.window?'<br>'+esc(r.window):'')+(r.hours!=null?'<br>'+esc(r.hours)+' h held':'')+'</td>'
        +'<td>'+(r.chance!=null?'<b>'+esc(r.chance)+' %</b> of members':'deterministic run')+'<br><span class="rpt-note">'+esc(r.confidence||'')+'</span></td>'
        +'<td>'+esc(r.consequence||'–')+'</td>'
        +'<td>'+esc(r.owner||'owner not set')+' · '+esc(r.action||'no action written')+(r.prepareByText?'<br><b>prepare by '+esc(r.prepareByText)+'</b>':'')+'</td></tr>';
    });
    h+='</tbody></table>';
    if((X.clear||[]).length) h+='<p class="rpt-note"><b>Not crossed to day 15:</b> '+X.clear.map(function(c){ return esc(c.label)+' '+esc(dw[c.dir]||c.dir)+' '+esc(c.limit)+' '+esc(c.unit||'')+' ('+esc(c.why)+')'; }).join(' · ')+'</p>';
    if((X.notEvaluated||[]).length) h+='<p class="rpt-note"><b>Not evaluated:</b> '+X.notEvaluated.map(function(c){ return esc(c.label||c.variable)+' '+esc(c.limit)+': '+esc(c.why); }).join(' · ')+'</p>';
    return {drawn:true,html:h};
  };
  DRAW.pGlof=function(doc){
     
    var X=doc.evidence.localContext&&doc.evidence.localContext.glofUpstream;
    if(!X) return {drawn:true,html:'<p class="rpt-note">The glacial-lake check was not gathered when this document was frozen (no asset coordinate, or the local server had not answered). Regenerate.</p>'};
    if(!X.ok) return {drawn:true,html:'<p class="rpt-na">'+esc(X.why||'GLOF register not available')+'</p>'};
    var CT={'growing':'<b>growing</b> in our Sentinel-2 reads (inside its outline, against its own earlier reads)','draining':'<b>draining</b> in our Sentinel-2 reads','measured-within':'open water read this season','measured-not-visible':'little open water on every clear scene (dry, ice or shadow)','not-measured':'no clear scene this season','not-read':'not yet read','within':'within its reference maximum','frozen-or-not-measured':'frozen or not measured','no-bulletin':'no satellite reading this season','not-monitored':'not measured this season'};    
    var INT=!!G.AGN_INTERNAL_REF;    
    var B=X.bulletin;
    var h='<p class="rpt-note">'+(INT?(lab('OBSERVED')+' [internal] lake outlines and attributes from the reference lake inventory; the reference list of potentially dangerous glacial lakes; lake areas from the reference bulletin'
      +(B?' <b>'+esc(B.title)+'</b> (published '+esc(String(B.published||'').slice(0,10))+')':' (none read)')):(lab('OBSERVED')+' glacial-lake outlines from '+(X.credit?esc(X.credit)+' and ':'')+'Hi-MAG (Chen et al. 2021, CC BY 4.0); lake water areas measured by NIGRAAN on Copernicus Sentinel-2 imagery; documented outbursts from HMAGLOFDB (CC BY 4.0)'))+'. '
      +lab('CALCULATED')+' susceptibility and tier, route along HydroBASINS level 12 to '+esc(X.routeKm)+' km, and the level. Satellite areas, not surveyed levels or volumes.</p>';    
    if(X.siteBasis==='tehsil centroid') h+='<p class="rpt-note">No asset is active: the check is run at the tehsil centroid, which stands for the unit, not for a site. Activate an asset and regenerate for a site-specific route.</p>';
    else if(X.siteBasis==='selected place') h+='<p class="rpt-note">No asset is active: the check is run at the place selected on the map. Activate an asset and regenerate for a site-specific route.</p>';
    h+='<table class="rpt-plus-t"><tbody><tr><td>'+(X.siteBasis==='tehsil centroid'?'GLOF level at the tehsil centroid':X.siteBasis==='selected place'?'GLOF level at the selected place':'GLOF level at the asset')+'</td><td><b>'+esc(X['class'])+'</b> · '+esc(X.basis||X.why||'')+'</td></tr>'
      +(X.counts?'<tr><td>Lakes upstream</td><td>'+esc(X.counts.priority)+' High · '+esc(X.counts.elevated!=null?X.counts.elevated:X.counts.watch)+' Moderate susceptibility · '+esc(X.counts.growing!=null?X.counts.growing:X.counts.expanding)+' growing in our Sentinel-2 reads'+(INT?' · '+esc(X.counts.withSensor)+' with a listed sensor (internal reference)':'')+'</td></tr>':'')
       
      +(function(){ var O=X.physical&&X.physical.outlook; if(!O||!O.ok) return '';
          var d=O.trigger.drivers||{}, W=O.windows||[];
          var wtxt=W.filter(function(w){ return w.members; }).map(function(w){ return esc(w.label)+' ('+esc(w.dates?w.dates.join(' to '):'')+'): <b>'+Math.round(100*w.loadedShare)+'%</b> of '+esc(w.members)+' members loaded, '+esc(w.class)+(w.id==='environment'?' (environment only)':''); }).join('<br>');
          return '<tr><td>Trigger outlook, '+esc(O.lake.name)+'</td><td>'+(O.trigger.class==null?'<b>unknown</b> ('+esc(O.trigger.classWhy||'no current weather for this lake')+')':'<b>'+esc(O.trigger.class)+'</b> (T '+esc(O.trigger.T)+', driver '+esc(O.trigger.driver)+')')
            +(d.freezingAboveLakeM!=null?' · freezing level '+esc(d.freezingLevelM)+' m, lake '+esc(d.lakeElevM)+' m, '+(d.freezingAboveLakeM>=0?'+':'')+esc(d.freezingAboveLakeM)+' m: melt environment '+esc(d.meltEnvironment):'')
            +(d.meltAnomaly&&d.meltAnomaly.tAnomC!=null?' · forecast week '+(d.meltAnomaly.tAnomC>=0?'+':'')+esc(d.meltAnomaly.tAnomC)+' \u00b0C against the model\u2019s own re-forecast normal':'')    
            +(d.meltAcceleration&&d.meltAcceleration.aboveNormalC!=null?' ('+(d.meltAcceleration.aboveNormalC>=0?'+':'')+esc(d.meltAcceleration.aboveNormalC)+' \u00b0C a day)':'')
            +(d.rain72Mm!=null?' · rain 72 h '+esc(d.rain72Mm)+' mm'+(d.rain72OfP99!=null?' ('+Math.round(100*d.rain72OfP99)+'% of the local 99th-percentile 3-day total)':''):'')
            +(O.susceptibility&&O.susceptibility.volumeThousandM3!=null?' · volume ~'+esc(O.susceptibility.volumeThousandM3)+' thousand m\u00b3 (empirical scaling, factor of two)':'')
            +(wtxt?'<br>'+wtxt:'<br><span class="rpt-note">ensemble members not yet kept for this unit</span>')
            +'<br><span class="rpt-note">'+esc(O.statement)+'</span></td></tr>'; })()
      +'</tbody></table>';
    var rows=X.lakes||[];
    if(rows.length){
      h+='<table class="rpt-plus-t"><thead><tr><th>Lake</th><th>Tier</th><th>Distance downstream</th><th>Area km²</th><th>Lake type · glacier</th><th>Latest read</th><th>Dams below it</th></tr></thead><tbody>';
      rows.slice(0,15).forEach(function(l){ var c=l.condition||{};
        h+='<tr><td><b>'+esc(l.name)+'</b><br><span class="rpt-note">'+esc(l.tehsil||'')+(INT&&l.suparco?' · reference list: '+esc(l.suparco.status)+(l.suparco.sensor?' · sensor':''):'')+'</span></td>'
          +'<td>'+esc(l.tierLabel)+'</td><td class="n">'+esc(l.kmAlong)+' km</td>'
          +'<td class="n">'+(l.areaKm2!=null?esc(l.areaKm2):'–')+(c.measured&&c.measured.areaKm2!=null?'<br><span class="rpt-note">'+esc(c.measured.areaKm2)+' on '+esc(c.measured.date||'')+'</span>':c.areaKm2!=null?'<br><span class="rpt-note">'+esc(c.areaKm2)+' on '+esc(c.imageryDate||'')+(c.max2025Km2!=null?' · 2025 max '+esc(c.max2025Km2):'')+'</span>':'')+'</td>'
          +'<td>'+esc(l.lakeType||l.dam||'–')+(l.glacierType?' · '+esc(l.glacierType):'')+(l.glacierDistM!=null?' · glacier '+esc(l.glacierDistM)+' m':'')+'</td>'
          +'<td>'+(CT[c.state]||esc(c.state||'–'))+(c.stale?'<br><span class="rpt-note">'+esc(c.stale)+'</span>':'')+'</td>'
          +'<td>'+((l.damsDownstream||[]).slice(0,3).map(function(d){ return esc(d.name)+' ('+esc(d.km)+' km)'; }).join('; ')||'–')+'</td></tr>'; });
      h+='</tbody></table>';
      if(rows.length>15||X.more) h+='<p class="rpt-note">'+esc((rows.length-15>0?rows.length-15:0)+(X.more||0))+' further lake(s) upstream are not printed; the map layer shows them.</p>';
    }
    h+='<p class="rpt-note"><b>Rules:</b> '+Object.keys(X.rules||{}).map(function(k){ return esc(X.rules[k]); }).join(' · ')+'</p>';
    h+='<p class="rpt-note"><b>Cautions:</b> '+(X.cautions||[]).map(esc).join(' ')+'</p>';
    return {drawn:true,html:h};
  };
  DRAW.pRepro=function(doc){
     
    var X=doc.reproducibility||{};
    if(X.error) return {drawn:true,html:'<p class="rpt-na">'+esc(X.error)+'</p>'};
    var F=X.forecast||{}, I=X.input_hashes||{};
    var r=function(k,v,l){ return '<tr><td>'+esc(k)+'</td><td>'+(l?lab(l)+' ':'')+(v==null||v===''?'<span class="rpt-note">not recorded</span>':esc(typeof v==='object'?JSON.stringify(v):v))+'</td></tr>'; };
    var h='<p class="rpt-note">Every field below is frozen with the document and covered by its seal. Labels: '+lab('OBSERVED')+' '+lab('MODELLED')+' '+lab('CLIENT SUPPLIED')+' '+lab('CALCULATED')+'.</p><table class="rpt-plus-t"><tbody>'
      +r('Report ID',X.report_id)+r('Project',X.project_id)+r('Decision case',X.decision_case_id)
      +r('Asset',X.asset_id,'CLIENT SUPPLIED')+r('Asset version (hash of the asset record)',X.asset_version,'CALCULATED')
      +r('Coordinates',X.coordinates?(X.coordinates.lat+', '+X.coordinates.lon+(/centroid/i.test(String(X.coordinates.label||''))?' (tehsil centroid, no asset active)':'')):null,(X.coordinates&&/centroid/i.test(String(X.coordinates.label||'')))?'CALCULATED':'CLIENT SUPPLIED')
      +r('Elevation',X.elevation_m?(X.elevation_m.value+' m, '+X.elevation_m.source):null,'MODELLED')
      +r('Hazard / horizon / lead',[X.hazard_id,X.horizon_id,(X.lead_hours!=null?X.lead_hours+' h':null)].filter(Boolean).join(' · '))
      +r('Forecast provider',F.provider||F.withheld,'MODELLED')+r('Model',F.model_label||F.model)+r('Model initialisation (run)',pktT(F.model_initialization))
      +r('Valid window',F.valid_from?(pktT(F.valid_from)+' to '+pktT(F.valid_to)):null)+r('Lead at first step',F.lead_hours_at_first_step!=null?F.lead_hours_at_first_step+' h':null)
      +r('Retrieved',pktT(F.retrieved_at))+r('Grid cell used',F.grid_cell?(F.grid_cell.lat+', '+F.grid_cell.lon+' · '+F.grid_cell.distanceKm+' km · gap '+F.grid_cell.elevationGapM+' m'):null,'MODELLED')
      +r('Screening inputs',X.screening_inputs)
      +r('Hazard screening feed',X.screening_basis?((X.screening_basis.unit||'')+' · '+(X.screening_basis.feed||'feed not named')+(X.screening_basis.feedUpdatedAt?' · updated '+pktT(X.screening_basis.feedUpdatedAt):'')+(X.screening_basis.live?' · live':' · NOT live')+' · '+X.screening_basis.note):null,'MODELLED')
      +r('Input hash · limit crossings',I.limit_crossings,'CALCULATED')
      +r('Input hash · glacial lakes',I.glacial_lakes,'CALCULATED')
      +r('Input hash · model run',I.point_run,'CALCULATED')+r('Input hash · hazard screening record',I.hazard_screening,'CALCULATED')
      +r('Input hash · forecast context',I.forecast_context,'CALCULATED')+r('Input hash · action records',I.action_records,'CALCULATED')
      +r('Correction version',X.correction_version?(X.correction_version.served_dashboard+' · reference series: '+X.correction_version.reference_series):null)
      +r('Hazard engine version',X.hazard_engine_version)+r('Build',X.build_version)
      +r('Stations used as checks',(X.station_observations_used||[]).join('; '),'OBSERVED')
      +r('Vulnerability version',X.vulnerability_version)
      +r('Scenario',X.scenario_id||'none')+r('Approval state',X.approval_state)+r('Content hash',X.content_hash)
      +'</tbody></table>';
    if(F.request) h+='<p class="rpt-note"><b>Fetch this run again:</b> '+esc(F.request.endpoint)+' with '+esc(JSON.stringify(F.request.params))+' and your own API key.</p>';
    return {drawn:true,html:h};
  };
  var PAGESPLUS={
    pPoint:{title:'Asset forecast · one named model run',needs:[],gives:'the asset\'s 72-hour forecast from one frozen global forecast model run, the grid cell used, its distance and elevation gap'},
    pCrossings:{title:'Operating-limit crossings · now to 15 days',needs:[],gives:'every registered limit on the asset against the served forecast at the place (0-72 h) and the ensemble (days 3-14): value, margin, time, chance, consequence, owner and action'},
    pGlof:{title:'Glacial lakes upstream',needs:[],gives:'the mapped glacial lakes that drain to the asset: tier, distance along the river network, dam type, and the latest Sentinel-2 lake area against its 2025 maximum'},
    pRepro:{title:'Reproducibility record',needs:[],gives:'every identity, input hash, version and assumption frozen with this document'},
    pSituation:{title:'Situation and decision',needs:['localContext'],gives:'the problem this report answers: today, the next 15 days, the weeks ahead, the season, and what has to be decided'},
    pOutlook15:{title:'Next 15 days',needs:['localContext'],gives:'daily ensemble values and multi-day event chances for this unit'},
    pOutlookLong:{title:'Weeks ahead and season ahead',needs:['localContext'],gives:'weeks-ahead ensemble weekly and seasonal ensemble monthly anomalies against model climate'},
    pActions:{title:'Recommended actions',needs:['localContext'],gives:'forecast-triggered actions with a ready-by date, trigger, chance and owner'},
    pVerified:{title:'Forecast basis and the MACH station check',needs:['localContext'],gives:'the source-chain tier for this tehsil and, where a MACH station stands within reach, its measured forecast error'}
  };
  Object.keys(DRAW).forEach(function(k){ var f=DRAW[k]; DRAW[k]=function(doc){ REF=(doc&&doc.at)?Number(doc.at):null; try{ return f(doc); } finally { REF=null; } }; });
  G.AGN=G.AGN||{}; G.AGN.reportExtraDraw=DRAW; G.AGN.reportExtraPages=PAGESPLUS;
   
  

  

  var VT={ v:'', u:'', p:'' };
  var COLMAP={
    pHazard:[[/^Score$/,'CALCULATED','u','screening index: a severity rank inside one hazard, not a probability'],[/^Class$/,'CALCULATED','u','class from the index ladder']],
    pOutlook15:[[/Max °C|Min °C/,'MODELLED','p','global ensemble median on the IFS basis'],[/Rain mm/,'MODELLED','u','ensemble median daily rain'],[/Gust/,'MODELLED','u','ensemble median daily gust'],[/^Chances|^Chance$/,'CALCULATED','u','share of 51 members, not calibrated'],[/Typical start|Earliest/,'CALCULATED','u','']],
    pOutlookLong:[[/vs normal|Mean temperature|^Rain$/,'MODELLED','u','EC46 / SEAS5 against their own hindcast climate'],[/^Chance/,'MODELLED','u','share of model members']],
    pActions:[[/^Ready by$/,'CALCULATED','u','trigger time less the registered or default response time'],[/Chance/,'CALCULATED','u','']],
    pSolutions:[[/Cost class|Lead time/,'CALCULATED','u','AGN guidance, not a quotation']],
    pVerified:[[/error|Error|Bias/,'CALCULATED','v','forecast against the MACH station, over the stated hours'],[/Hours paired/,'OBSERVED','v','MACH station']],
    pCoverage:[[/.+/,'CALCULATED','v','count of inputs that arrived']],
    pCompleteness:[[/.+/,'CALCULATED','v','count of inputs that arrived']],
    pPortfolio:[[/Class|Index|Score/,'CALCULATED','u','']],
    pPoint:[[/^Value$/,'MODELLED','p','one named global forecast model run at the nearest 9 km cell; daily maximum station-corrected where the envelope allows'],[/^When$/,'MODELLED','u','']],
    pSkill:[[/error|Error|bias|Bias|MAE|RMSE/,'CALCULATED','v','over the stated sample'],[/detection|Detection|false alarm/i,'CALCULATED','v','']],
    pGlof:[[/^Area/,'OBSERVED','u','satellite outline area, not surveyed'],[/Distance/,'CALCULATED','u','along HydroBASINS level 12, not a flood-routing model'],[/^Tier$/,'CALCULATED','u','screening rule on mapped attributes']],
    pCrossings:[[/^Limit$/,'CLIENT SUPPLIED','u',''],[/Forecast value/,'MODELLED','p',''],[/Margin|Chance/,'CALCULATED','u',''],[/Consequence/,'CLIENT SUPPLIED','u','']]
  };
  var KEY={
    pSituation:'MODELLED forecast context for the tehsil · CALCULATED classes and chances',
    pSummary:'CALCULATED hazard classes from the screening index',
    pHazard:'CALCULATED screening index and class per hazard; categorical hazards are expert-set zones',
    pFlood:'MODELLED river discharge (global river-flow model, Copernicus EMS) and rainfall · CALCULATED pathway ranks',
    pCompound:'CALCULATED combination of hazards already screened; no new data',
    pSolutions:'CALCULATED AGN guidance by sector and hazard; not site engineering',
    pOutlook15:'MODELLED global ensemble on the IFS basis · CALCULATED member shares',
    pOutlookLong:'MODELLED weeks-ahead ensemble and seasonal ensemble against their own hindcast climate',
    pClimate:'MODELLED climate context; not a forecast',
    pCoverage:'CALCULATED from the inputs that arrived', pCompleteness:'CALCULATED from the inputs that arrived',
    pScope:'what this document covers and does not', pMethod:'method description', pEvidence:'the evidence records, as frozen',
    pGlof:'OBSERVED satellite lake areas (Copernicus Sentinel-2) · CALCULATED tiers, routes and class',
    pPoint:'MODELLED values from one frozen global forecast model run · CALCULATED grid-cell distance and elevation gap',
    pSkill:'CALCULATED error over the stated sample',
    pRepro:'CALCULATED identities and input hashes frozen with the document',
    pLimits:'the limits of this document, as text',
    pCover:'cover',
    pDeviation:'CALCULATED deviations between the frozen record and the live feed',
    pActions:'CALCULATED from triggers · CLIENT SUPPLIED owner and wording where the limit register gives them'
  };
  function badges(html, doc){
    return html.replace(/(<section class="rpt-page" data-page="(p[A-Za-z0-9]+)"[^>]*>)([\s\S]*?)(<\/section>)/g, function(all, open, id, body, close){
      var map=COLMAP[id]||[];
      if(map.length) body=body.replace(/<th([^>]*)>([\s\S]*?)<\/th>/g, function(m, attr, inner){
        var text=inner.replace(/<[^>]+>/g,'').trim();
        for(var i=0;i<map.length;i++){ if(map[i][0].test(text)){
          return '<th'+attr+' data-ev="'+map[i][1]+'">'+inner+' '+lab(map[i][1])+'<span class="rpt-note" style="display:block;font-weight:400;text-transform:none;letter-spacing:0">'+[VT[map[i][2]],map[i][3]?esc(map[i][3]):''].filter(Boolean).join(' · ')+'</span></th>'; } }
        return m; });
      if(KEY[id] && body.indexOf('data-evkey')<0){
        var k=KEY[id].replace(/\b(OBSERVED|MODELLED|CALCULATED|CLIENT SUPPLIED)\b/g, function(w){ return lab(w); });
        body=body.replace(/(<\/h3><\/div>)/, '$1<p class="rpt-note" data-evkey="1">Values on this page: '+k+'.</p>');
      }
      return open+body+close;
    });
  }
  

  G.AGN_SOURCES=G.AGN_SOURCES||null;
  function warmSources(){ try{ fetch(location.origin+'/api/sources',{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).catch(function(){ return null; })
      .then(function(j){ if(!j) return fetch(location.origin+'/api/v1/sources',{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).catch(function(){ return null; }); return j; })
      .then(function(j){ if(j&&j.entries){ G.AGN_SOURCES=j; G.AGN_INTERNAL_REF=!!j.internalRef; try{ document.dispatchEvent(new CustomEvent('agn:sources',{detail:j})); }catch(_){} } }); }catch(_){} }
  G.AGN.sourcesWarm=warmSources;
  function sourcesNote(html, doc){
    if(html.indexOf('data-sources="1"')>=0) return html;
    var E=(doc&&doc.evidence)||{}, L=(E.localContext&&E.localContext.sources&&E.localContext.sources.line)||(E.caseDocument&&E.caseDocument.sources&&E.caseDocument.sources.line)||(G.AGN_SOURCES&&G.AGN_SOURCES.methodsLine)||null;
    if(!L) return html;
    var note='<p class="rpt-note" data-sources="1"><b>Sources and licences.</b> Every dataset used in this document, with its licence and the attribution text that licence requires, is listed under Sources &amp; licences at the foot of every NIGRAAN page (CC BY 4.0 section 3(a)(2) permits attribution by reference to a resource that carries it).</p>';
    var ids=['pMethod','pLimits'];
    for(var i=0;i<ids.length;i++){ var re=new RegExp('(<section class="rpt-page" data-page="'+ids[i]+'"[^>]*>[\\s\\S]*?)(<\\/section>)'); if(re.test(html)) return html.replace(re, function(_,a,b){ return a+note+b; }); }
    var k=html.lastIndexOf('</section>'); return k>=0 ? html.slice(0,k)+note+html.slice(k) : html+note;
  }
  G.AGN.glofCtx={ peek:function(lat,lon){ var c=GLC[Number(lat).toFixed(3)+','+Number(lon).toFixed(3)]; return c?c.v:null; }, warm:function(){ try{ warmGlof(); }catch(_){} } };
  G.AGN.reportCtx={ peek:function(unit){ var c=CACHE[String(unit||'').toLowerCase()]; return c?c.v:null; }, warm:function(){ try{ warm(); }catch(_){} },
    state:function(unit){ var k=String(unit||'').toLowerCase(); var c=CACHE[k]; return c?(c.failed?'failed':'ready'):(INFLIGHT[k]?(Date.now()-INFLIGHT[k]<20000?'loading':'failed'):'none'); },    
    pointRun:function(lat,lon){ var c=PRC[prKey(lat,lon)]; return c?c.v:null; } };
  

  (function install(n){
    if(!G.AGN.report||!G.AGN.report.PAGES) return n<80&&setTimeout(function(){install(n+1);},250);
    var P=G.AGN.report.PAGES; Object.keys(PAGESPLUS).forEach(function(k){ if(P&&!P[k]) P[k]=PAGESPLUS[k]; });
    G.AGN.reportPostRender=function(html, doc){ var h=(doc && doc.evidence && doc.evidence.exploratory===true) ? fixFlood(html, doc) : html; try{ h=badges(h, doc); }catch(_){} try{ h=sourcesNote(h, doc); }catch(_){} return h; };
    warm(); warmSources(); document.addEventListener('agn:location', function(){ setTimeout(warm,1500); }); document.addEventListener('agn:sweep-done', function(){ setTimeout(warm,500); });    
    ['agn:project','agn:active-asset','agn:subject'].forEach(function(ev){ document.addEventListener(ev, function(){ setTimeout(warm,300); }); });
  })(0);
})();
