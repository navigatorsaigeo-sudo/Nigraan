

(function(){
  window.AGN=window.AGN||{};
  var contracts=AGN.dataServices&&AGN.dataServices.get('contracts');
  function median(a){if(!a.length)return null;var x=a.slice().sort(function(p,q){return p-q;}),m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2;}
  function districtProvince(name,rows){
    if(rows&&rows[0]&&rows[0].prov)return rows[0].prov;
    try{var C=window.PK_DISTRICT_CENTROIDS||[];var x=C.find(function(r){return r.district===name;});return x&&x.province||'';}catch(_){return '';}
  }
  function rollupVerdict(district){
    if(!AGN.units||typeof AGN.units.tehsilsOf!=='function'||typeof window.districtVerdict!=='function')return null;
    var members=AGN.units.tehsilsOf(district)||[],rows=[];
    for(var i=0;i<members.length;i++){
      var v=null;try{v=window.districtVerdict(members[i]);}catch(_){v=null;}
      if(v&&v.top&&v.top.score!=null&&isFinite(v.top.score))rows.push(v);
    }
    if(!rows.length)return null;
    

    

    var _evLanes=function(v){ return ((v&&v.lanes)||[]).filter(function(l){ return l && l.event!==false && !l.standing && !l.condition; }); };
    var _margin=function(v){
      try{ var L=_evLanes(v); if(!L.length) return -1;
           var HV=AGN.hazardValue, best=-1;
           L.forEach(function(l){ var cut=HV.cutFor?HV.cutFor(l.verdict):({Act:82,Watch:65,Monitor:45,Clear:0})[l.verdict]||0;
                                  var m=(l.score-cut)/Math.max(1,100-cut); if(m>best) best=m; });
           return best; }catch(_){ return -1; }
    };
    var _lr=function(v){
      var L=_evLanes(v);
      return { act:L.filter(function(l){return l.verdict==='Act';}).length,
               watch:L.filter(function(l){return l.verdict==='Act'||l.verdict==='Watch';}).length,
               urgent:L.some(function(l){return l.verify_urgency==='high';})?1:0,
               margin:_margin(v) };
    };
    rows.sort(function(a,b){
      var ra=_lr(a), rb=_lr(b);
      if(rb.act!==ra.act) return rb.act-ra.act;
      if(rb.watch!==ra.watch) return rb.watch-ra.watch;
      if(rb.urgent!==ra.urgent) return rb.urgent-ra.urgent;
      if(rb.margin!==ra.margin) return rb.margin-ra.margin;
      return String(a.name||'').localeCompare(String(b.name||''));
    });
    var driver=rows[0],scores=rows.map(function(r){return Number(r.top.score);});
    var _driverBasis='the tehsil carrying the most hazards at Act, then at Watch or above, then '
      +'by verification urgency, then by name. The leading index does not order this board and does '
      +'not break its ties: hazard indexes are not on a common scale and picking a driver by one '
      +'is not a comparison this product supports.';
    var coverage=members.length?rows.length/members.length:0;
    var counts={Act:0,Watch:0,Monitor:0,Low:0,'No Data':0};
    rows.forEach(function(r){counts[r.verdict]=(counts[r.verdict]||0)+1;});
    var confs=rows.map(function(r){return r.confidence;}).filter(function(v){return v!=null&&isFinite(v);});
    var primedRows=rows.filter(function(r){return r.primed&&r.primed.api!=null;}).sort(function(a,b){return b.primed.api-a.primed.api;});
    var standingRows=rows.filter(function(r){return r.standing&&r.standing.score!=null;}).sort(AGN.hazardValue.compareStanding);
    var verdict=driver.verdict;
    

    if(coverage<0.5) verdict='No Data';
    else if(coverage<0.8&&verdict==='Act') verdict='Watch';
    var action=verdict==='No Data'?'Load missing tehsil inputs before issuing a district action.':driver.action;
    var why='District driver is '+driver.name+' (leading signal '+Math.round(driver.top.score)+'/100). '
      +rows.length+' of '+members.length+' tehsils scored ('+Math.round(coverage*100)+'% spatial coverage).';
    if(coverage<0.8)why+=' Partial coverage prevents automatic escalation.';
    var result=Object.assign({},driver,{
      name:district,district:district,tehsil:driver.name,drivingTehsil:driver.name,unitLevel:'district',
      prov:districtProvince(district,rows),spatialCoverage:coverage,scoredTehsils:rows.length,totalTehsils:members.length,
      

      meanScore:null,medianScore:null,
      statsWithheldWhy:'a mean or median over tehsils whose leading hazards differ '
        +'averages indexes built on different physical quantities. Read verdictCounts: '
        +'each tehsil earned its verdict from its own hazard, so the census compares '
        +'like with like.',
      tehsilsAtOrAboveWatch:rows.filter(function(r){
        return r.verdict==='Act'||r.verdict==='Watch'; }).length,
      tehsilsAtOrAboveAct:rows.filter(function(r){ return r.verdict==='Act'; }).length,
      tehsilCountBasis:'counted from each tehsil\'s own verdict, not from a threshold '
        +'applied to whichever hazard happened to lead it',
      verdictCounts:counts,confidence:confs.length?Math.round(median(confs)):null,
      primed:primedRows.length?primedRows[0].primed:null,standing:standingRows.length?standingRows[0].standing:null,
      verdict:verdict,action:action,why:why+' '+(driver.why||''),
      aggregation:{method:'most_actionable_tehsil',driver:driver.name,driverBasis:_driverBasis,
                    
                   mean:null,median:null,distribution:counts,coverage:coverage}
    });
    if(contracts)result=contracts.hazardResult(Object.assign({hazard:driver.top&&driver.top.key||driver.top&&driver.top.hazard||'compound',unitKey:district,unitType:'district',score:driver.top&&driver.top.score,status:verdict==='No Data'?'unavailable':'available',coverage:coverage*100,driver:driver.name,formulaVersion:'district-worst-tehsil-v1'},result),{section:'operations',boundary:'district-rollup'});
    return result;
  }
  

  

  var __adv={sig:null,at:0,val:null,epoch:0,hits:0,miss:0}, __advIds=new WeakMap(), __advNext=1;
  try{ ['agn:data','agn:national','agn:day','agn:layer','agn:enriched','agn:clim-anchors','agn:drought-national'].forEach(function(ev){
         document.addEventListener(ev,function(){ __adv.epoch++; }); }); }catch(_){}
  function __advSig(){
    var D=window.__DISTRICT_IN_RAW||window.DISTRICT_IN||{}, h=0, n=0;
    for(var k in D){ var r=D[k]; n++; if(!r||typeof r!=='object') continue;
      for(var f in r){ var v=r[f], x;
        if(v==null) x=1;
        else if(typeof v==='number') x=isFinite(v)?(Math.round(v*1000)|0):7;
        else if(typeof v==='boolean') x=v?3:5;
        else if(typeof v==='string') x=v.length*31+(v.length?v.charCodeAt(v.length-1):0);
        else { x=__advIds.get(v); if(!x){ x=__advNext++; __advIds.set(v,x); } }
        h=(Math.imul(h,31)+x+f.length)|0; } }
    var day=0,basis='',lead=24;
    try{ day=AGN.day.get(); }catch(_){} try{ basis=AGN.day.basis(); }catch(_){}
    try{ lead=(typeof aiState!=='undefined'&&aiState.lead)||24; }catch(_){}
    var pk=''; try{ pk=(typeof hzPkDate==='function')?hzPkDate(day):''; }catch(_){}
    return n+':'+h+':'+day+':'+basis+':'+lead+':'+__adv.epoch+':'+pk;
  }
  function __advCopy(a){ var c=a.slice(); c.orderBasis=a.orderBasis; c.unitLevel=a.unitLevel; c.coverage=a.coverage; return c; }
  function allDistrictVerdicts(){
     
    var eng=null; try{ eng=(window.AGN&&typeof AGN.engineVerdicts==='function')?AGN.engineVerdicts():null; }catch(_){ eng=null; }
    if(eng) return eng;
    var sig=null; try{ sig=__advSig(); }catch(_){ sig=null; }
    var now=Date.now();
    if(sig!==null && __adv.val && __adv.sig===sig && now-__adv.at<300000){     __adv.hits++; return __advCopy(__adv.val); }
    var v=allDistrictVerdictsRaw(); __adv.miss++;
    if(sig!==null && Array.isArray(v)){ __adv.sig=sig; __adv.at=now; __adv.val=v; return __advCopy(v); }
    return v;
  }
  window.__agnBoardCache=function(){ return {hits:__adv.hits, miss:__adv.miss, epoch:__adv.epoch, ageS:__adv.at?Math.round((Date.now()-__adv.at)/1000):null}; };
  function allDistrictVerdictsRaw(){
    if(!AGN.units||typeof AGN.units.districtKeys!=='function')return [];
    var keys=AGN.units.districtKeys(), miss=[];
    

    

    var _evLanes2=function(v){ return ((v&&v.lanes)||[]).filter(function(l){ return l && l.event!==false && !l.standing && !l.condition; }); };
    var _lr2=function(v){
      var L=_evLanes2(v), best=-1;
      try{ L.forEach(function(l){ var cut=((window.AGN&&AGN.hazardValue&&AGN.hazardValue.cutFor)?AGN.hazardValue.cutFor(l.verdict,l.hazard):({Act:82,Watch:65,Monitor:45,Clear:0})[l.verdict])||0; var m=(l.score-cut)/Math.max(1,100-cut); if(m>best) best=m; }); }catch(_){}
      return { act:L.filter(function(l){return l.verdict==='Act';}).length,
               watch:L.filter(function(l){return l.verdict==='Act'||l.verdict==='Watch';}).length,
               urgent:L.some(function(l){return l.verify_urgency==='high';})?1:0, margin:best };
    };
    var out=keys.map(function(k){ var v=rollupVerdict(k); if(!v) miss.push(k); return v; })
                .filter(Boolean)
                .sort(function(a,b){
                  var ra=_lr2(a), rb=_lr2(b);
                  if(rb.act!==ra.act) return rb.act-ra.act;
                  if(rb.watch!==ra.watch) return rb.watch-ra.watch;
                  if(rb.urgent!==ra.urgent) return rb.urgent-ra.urgent;
                  if(rb.margin!==ra.margin) return rb.margin-ra.margin;
                  return String(a.name||'').localeCompare(String(b.name||''));
                });
    out.orderBasis='Ordered by how many EVENT hazards (hours-days) are at Act, then at Watch or above, then by '
      +'measured verification urgency, then by the event lead\'s margin above its own class cut, then by name. '
      +'Accumulated conditions (drought) and standing susceptibilities (GLOF corridor) are shown in their own '
      +'lanes and neither lead nor order this board.';
    out.unitLevel='district';
    out.coverage={ total:keys.length, assessed:out.length, unassessed:miss.length,
                   unassessedSample:miss.slice(0,12), unassessedUnits:function(){return miss.slice();}, unit:'district',
                   why:'no decision hazard resolved a day-indexed input for any tehsil in these districts',
                   warning:'absence from this board is NOT a clear verdict — these districts were not assessed' };
    return out;
  }
  AGN.units.rollupVerdict=rollupVerdict;
  allDistrictVerdicts.__agnCached=true; allDistrictVerdicts.__agnOrig=allDistrictVerdictsRaw;
  window.allDistrictVerdicts=allDistrictVerdicts;
})();
