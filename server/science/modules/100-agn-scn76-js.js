


(function(){
  'use strict';
  var D=document, W=window;
  var HZ=[['flood','Flood'],['rain_hz','Heavy rain'],['landslide','Landslide'],['glof','Glacial lake outburst flood (GLOF)'],['heat','Heat stress'],['cold','Cold stress (UTCI)'],['wind','Wind and gusts'],['drought','Drought']];
  var WORDS=['Normal','Low','Moderate','High','Severe'];
  var st={place:null,preset:'now',rainMm:0,dT:0,dGust:0,wet:null,shape:null,t95:{},rl:{},built:false};    
  function num(v){ return (v==null||v===''||!isFinite(Number(v)))?null:Number(v); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  

  function sites(){ try{ var p=W.AGN&&AGN.project&&AGN.project.state?AGN.project.state():null; return ((p&&p.assets)||[]).filter(function(a){ return a&&a.asset_id&&num(a.latitude)!=null&&num(a.longitude)!=null; })
      .map(function(a){ return {id:'asset:'+a.asset_id, name:String(a.name||a.asset_name||a.asset_id).replace(/\s*\((AJG Supplies)\)\s*$/,''), lat:num(a.latitude), lon:num(a.longitude), site:true}; }); }catch(_){ return []; } }
  /* v91.17.273 · the place chosen at the top of the page (search or station pick: AGN.flow.location) is the Scenario place. Before, the
     tab read the legacy station selection (activeStationId) first, which a searched place never changes, so Lahore, Karachi or Gilgit
     searched at the top still showed "Scenario & stress test · Islamabad" / "Change levels for Islamabad". */
  function flowPlace(){ try{ var L=W.AGN&&AGN.flow&&AGN.flow.location?AGN.flow.location():null, la=num(L&&L.lat), lo=num(L&&L.lon); if(!L||!L.name||la==null||lo==null) return null;
      var nm=null; try{ nm=AGN.place&&AGN.place.name?AGN.place.name():null; }catch(_){}
      return {id:'place:'+la.toFixed(4)+','+lo.toFixed(4), name:String(nm||L.name), lat:la, lon:lo}; }catch(_){ return null; } }
  function stations(){ var a=[]; try{ a=(W.STATIONS||[]).filter(function(s){return s&&s.id;}); }catch(_){ a=[]; } var f=flowPlace(); return sites().concat(f?[f]:[],a); }
  function subjectPlace(){ try{ var p=AGN.project.state(), id=p&&p.company&&p.company.active_asset_id; if(id&&stationById('asset:'+id)) return 'asset:'+id; }catch(_){} return null; }
  function unitOf(s){ try{ if(typeof W.aiStationDistrict==='function'){ var k=W.aiStationDistrict(s); if(k&&W.DISTRICT_IN&&W.DISTRICT_IN[k]) return k; } }catch(_){} return (s&&W.DISTRICT_IN&&W.DISTRICT_IN[s.name])?s.name:null; }
  function stationById(id){ var a=stations(); for(var i=0;i<a.length;i++) if(a[i].id===id) return a[i]; return null; }
  function globalPlace(){ var f=placeFromFlow(); if(f) return f; try{ var id=W.activeStationId&&W.activeStationId(); if(id&&stationById(id)) return id; }catch(_){} return null; }
  function defaultPlace(){
    var a=stations(); if(!a.length) return null;
    var sp=subjectPlace(); if(sp) return sp;
    var gp=globalPlace(); if(gp) return gp;
    try{ var c=W.AGN&&AGN.context&&AGN.context.read?AGN.context.read():null, loc=String(c&&c.location||'');
         for(var i=0;i<a.length;i++) if(loc && loc.indexOf(a[i].name)===0) return a[i].id; }catch(_){}
    return a[0].id; }
  function lead(){ try{ return (typeof W.aiState!=='undefined'&&W.aiState&&W.aiState.lead)||24; }catch(_){ return 24; } }
  function deep(o){ return JSON.parse(JSON.stringify(o)); }
  function levelFrom(h,r){
    if(!r) return {nd:true};
    if(r.notApplicable) return {na:true};
    var draw=(r.categorical===true&&r.mapValue!=null)?r.mapValue:r.score;
    var meta={noData:!!r.noData, notApplicable:!!r.notApplicable, category:(r.screeningBand!=null&&r.categorical===true)?r.screeningBand:null};
    try{ if(W.AGN&&AGN.hz5&&AGN.hz5.levelOf){ var L=AGN.hz5.levelOf(h,draw,meta); L.score=draw; return L; } }catch(_){}
    if(draw==null||r.noData) return {nd:true};
    var b=(typeof W.agnBandOf==='function')?W.agnBandOf(draw):null; return b?{i:b.index,score:draw}:{nd:true}; }
  function engineInput(unit,h){
    var inp=null;
    try{ if(typeof W.hzDayInput==='function') inp=W.hzDayInput(unit,h); }catch(_){ inp=null; }
    if(inp&&inp.__unavailable) return {unavailable:true};
    if(!inp){ try{ inp=AGN.units.inputFor(unit, W.DISTRICT_IN); }catch(_){ inp=null; } }
    return inp; }
  function score(unit,h,inp){
    try{ var mw=(typeof W.__agnHzMaskWhy==='function')?W.__agnHzMaskWhy(unit,h):null; if(mw) return {notApplicable:true,notApplicableWhy:mw}; }catch(_){}
    if(!inp||inp.unavailable) return null;
    

    var r=null; try{ r=(typeof W.aiDistrictRisk==='function')?W.aiDistrictRisk(inp,h,0,unit):W.hzScore(unit,inp,h,0,unit); }catch(e){ r=null; }
    

    if(h==='landslide'&&r&&r.score!=null&&!r.notApplicable&&inp.scenarioDayMm>0){ var lr=null; try{ lr=(typeof W.hzLandslide==='function')?W.hzLandslide(unit,inp):null; }catch(_){ lr=null; }
      if(lr&&lr.calibrated) return lsScen(unit,r,inp.scenarioDayMm); }
    return r; }
  var LSC={}, lsPend=0;
  function lsScen(unit,r,mm){
    var d=0; try{ d=(W.AGN&&AGN.day&&AGN.day.get)?(+AGN.day.get()||0):0; }catch(_){ d=0; }
    var date=new Date(Date.now()+5*3600e3+d*864e5).toISOString().slice(0,10), k=unit+'|'+date+'|'+Math.round(mm*10)/10, c=LSC[k];
    if(c===undefined){ LSC[k]=null; lsPend++;
      fetch('/api/landslide/odds/scenario?key='+encodeURIComponent(unit)+'&date='+date+'&mm='+(Math.round(mm*10)/10),{cache:'no-store'}).then(function(x){ return x.ok?x.json():null; })
        .then(function(j){ LSC[k]=(j&&j.ready&&isFinite(+j.ratio))?j:{ready:false,why:(j&&j.why)||'the scenario likelihood did not arrive'}; })
        .catch(function(){ LSC[k]={ready:false,why:'the scenario likelihood did not arrive'}; })
        .then(function(){ lsPend--; if(st.built) render(); }); }
    if(!c) return Object.assign({},r,{scenarioPending:true});
    if(!c.ready) return Object.assign({},r,{scenarioWhy:c.why});
    var sc=(typeof W.lsOddsScore==='function')?W.lsOddsScore(+c.ratio):null; if(sc==null) return r;
    return Object.assign({},r,{score:sc,mapValue:(r.categorical===true?sc:r.mapValue),oddsRatio:+c.ratio,scenarioRainDayMm:c.rainDayMm,basis:'scenario day of '+c.rainDayMm+' mm on the ranked landslide likelihood (model class '+(c.modelBand||'?')+'; observed about '+(c.observedRatio!=null?c.observedRatio:'?')+' times an ordinary day for that class)'}); }
   
  function loadShape(){
    if(st.shape) return;
    fetch('/api/landslide/calibration',{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).then(function(j){
      var R=j&&j.rainIntensityScale&&j.rainIntensityScale.durations; if(!R) { st.shape={ok:false}; render(); return; }
      var g=function(d){ return num(R[d]&&R[d].obs&&R[d].obs.p99); };
      var i1=g('1'), i6=g('6'), i24=g('24');
      if(i1==null||i6==null||i24==null||!(i24>0)) { st.shape={ok:false}; render(); return; }
      var day=i24*24;
      st.shape={ok:true,f1:Math.min(1,i1/day),f6:Math.min(1,i6*6/day),n:j.rainIntensityScale.stations,window:j.rainIntensityScale.window,built:j.rainIntensityScale.built};
      render();
    }).catch(function(){ st.shape={ok:false}; render(); }); }
  

  /* v91.17.266 · a failed source is asked once more after 5 s; after that it is FAILED (the preset says not available and is hidden) */
  var FAILED={failed:true}, rtry={};
  function retryOr(store,s,again){ var k=store+'|'+s.id; rtry[k]=(rtry[k]||0)+1; if(rtry[k]<2){ setTimeout(function(){ st[store][s.id]=undefined; again(s); },5000); } else { st[store][s.id]=FAILED; if(st.place===s.id) render(); } }
  function loadRL(s){
    if(!s||st.rl[s.id]!==undefined||s.lat==null) return;
    st.rl[s.id]=null;
    fetch('/api/site/screening?lat='+encodeURIComponent(s.lat)+'&lon='+encodeURIComponent(s.lon),{cache:'no-store'})
      .then(function(r){return r.ok?r.json():null;}).then(function(j){ if(!j){ retryOr('rl',s,loadRL); return; } var row=((j&&j.rows)||[]).filter(function(x){ return x&&x.parameter==='Extreme daily rain'; })[0], L={};
        String(row&&row.values||'').replace(/(\d+)-year ([\d.]+) mm/g,function(_,T,v){ L[T]=num(v); return _; });
        st.rl[s.id]={rain:L,method:(j&&j.returnLevels)?(j.returnLevels.method+', '+j.returnLevels.years):null}; if(st.place===s.id) render(); })
      .catch(function(){ retryOr('rl',s,loadRL); }); }
  function loadT95(s){
    loadRL(s);
    if(!s||st.t95[s.id]!==undefined||s.lat==null) return;
    st.t95[s.id]=null;
    fetch('/api/climatology/baseline?lat='+encodeURIComponent(s.lat)+'&lon='+encodeURIComponent(s.lon),{cache:'no-store'})
      .then(function(r){return r.ok?r.json():null;}).then(function(j){ if(!j){ retryOr('t95',s,loadT95); return; } var v=num(j.t95); st.t95[s.id]=(v==null?FAILED:v); if(st.place===s.id) render(); })
      .catch(function(){ retryOr('t95',s,loadT95); }); }
  function magnitudes(unit,s){
    var row=(W.DISTRICT_IN&&W.DISTRICT_IN[unit])||{}, rc=null;
    try{ rc=AGN.rainClim&&AGN.rainClim.forUnit?AGN.rainClim.forUnit(unit):null; }catch(_){ rc=null; }
    var heatIn=engineInput(unit,'heat')||{}, coldIn=engineInput(unit,'cold')||{};
    

    var d0=(heatIn.days&&heatIn.days[heatIn.dayIndex||0])||null, c0=(coldIn.days&&coldIn.days[coldIn.dayIndex||0])||null;
    var tmax=(d0&&num(d0.tmax)!=null)?num(d0.tmax):num(heatIn.heatDryTemp)!=null?num(heatIn.heatDryTemp):num(heatIn.t);
    var tmin=(c0&&num(c0.tmin)!=null)?num(c0.tmin):num(coldIn.tminDay)!=null?num(coldIn.tminDay):num(coldIn.t);
    if(!st.t0||st.t0.id!==(s&&s.id)) st.t0={id:s&&s.id,at:Date.now()};
    var RL=(s&&st.rl[s.id]&&!st.rl[s.id].failed)?st.rl[s.id]:null, MO=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return { p99:rc&&rc.known?num(rc.p99):null, max20y:rc&&rc.known?num(rc.max20y):null, rcBasis:rc&&rc.basis,
             rcMon:(rc&&rc.known&&rc.reference==='month'&&rc.date)?MO[+String(rc.date).slice(5,7)-1]:null,
             rl2:RL&&RL.rain?num(RL.rain['2']):null, rl10:RL&&RL.rain?num(RL.rain['10']):null, rlBasis:RL&&RL.method,
             tx90:num(row.tx90), tn10:num(row.tn10), t95:(typeof st.t95[s.id]==='number')?st.t95[s.id]:null, tmax:tmax, tmin:tmin,
             wait:{ rl:!!(s&&(st.rl[s.id]===undefined||st.rl[s.id]===null)), t95:!!(s&&(st.t95[s.id]===undefined||st.t95[s.id]===null)), shape:!st.shape,
                    clim:(Date.now()-st.t0.at)<20000 } }; }
  /* v91.17.266 · each preset is ready, waiting (bounded: its source is in flight, or 20 s for the day's climate thresholds) or
     not available for this place (state 'na': hidden, named once under the buttons) */
  function presets(m){
    var shapeOk=st.shape&&st.shape.ok, mm=function(v){ return Math.round(v)+' mm in a day'; }, dg=function(v){ return Math.round(v*10)/10+' °C'; }, w=m.wait||{};
    var P=function(id,label,okVal,sub,waiting,set){ return {id:id,label:label,sub:okVal?sub:(waiting?'loading…':'not available for this place'),ok:!!okVal,na:!okVal&&!waiting,set:set}; };
    return [
      {id:'now', label:'Current conditions', sub:'no change', ok:true, set:{rainMm:0,dT:0,dGust:0}},
      P('rain99','Heavy rain day',shapeOk&&m.p99!=null,m.p99!=null?mm(m.p99)+' · 1 in 100 wet days'+(m.rcMon?' in '+m.rcMon:' of the year'):'',w.shape,{rainMm:m.p99||0,dT:0,dGust:0}),
      P('soaked','Soaked ground + heavy rain',shapeOk&&m.p99!=null,m.p99!=null?'wet soil · '+mm(m.p99):'',w.shape,{rainMm:m.p99||0,dT:0,dGust:0,wet:100}),
      P('rainmax','10-year wettest day',shapeOk&&m.rl10!=null,m.rl10!=null?mm(m.rl10)+' · the report\u2019s return level'+(m.rl2!=null?' (2-year '+Math.round(m.rl2)+' mm)':''):'',w.shape||w.rl,{rainMm:m.rl10||0,dT:0,dGust:0}),
      P('hot','Hot day for the season',m.tx90!=null&&m.tmax!=null,m.tx90!=null?'day\'s high '+dg(m.tx90):'',w.clim,{rainMm:0,dT:(m.tx90!=null&&m.tmax!=null)?Math.max(0,m.tx90-m.tmax):0,dGust:0}),
      P('summer','Peak-summer heat',m.t95!=null&&m.tmax!=null,m.t95!=null?'day\'s high '+dg(m.t95)+' · 90th pct of the hottest fortnight':'',w.t95||(m.t95!=null&&w.clim),{rainMm:0,dT:(m.t95!=null&&m.tmax!=null)?Math.max(0,m.t95-m.tmax):0,dGust:0}),
      P('cold','Cold night for the season',m.tn10!=null&&m.tmin!=null,m.tn10!=null?'night low '+dg(m.tn10):'',w.clim,{rainMm:0,dT:(m.tn10!=null&&m.tmin!=null)?Math.min(0,m.tn10-m.tmin):0,dGust:0})
    ]; }
  

  function perturb(inp){
    if(!inp||inp.unavailable) return inp;
    var x=deep(inp), sh=st.shape;
    if(st.rainMm>0 && sh && sh.ok){
      var D0=st.rainMm, r1=D0*sh.f1, r6=D0*sh.f6;
      x.rain=Math.max(num(x.rain)||0,r1); x.rainPeakDay=Math.max(num(x.rainPeakDay)||0,r1);
      x.rain6hDay=Math.max(num(x.rain6hDay)||0,r6); x.rainTotalDay=Math.max(num(x.rainTotalDay)||0,D0);
      x.rain24=Math.max(num(x.rain24)||0,D0); x.scenarioDayMm=D0;    
      if(x.dayIndex==null) x.dayIndex=0; }
    if(st.dT){
      

      var dd=(x.days&&x.days[x.dayIndex||0])||null, warm=st.dT>0;
      var baseT=warm?((dd&&num(dd.tmax)!=null)?num(dd.tmax):num(x.t)):((dd&&num(dd.tmin)!=null)?num(dd.tmin):num(x.t));
      var T0=num(x.t), RH0=num(x.hum)!=null?num(x.hum):num(x.heatMeanRh);
      function tdOf(T,RH){ if(T==null||RH==null||!(RH>0)) return null; var g=Math.log(RH/100)+17.67*T/(243.5+T); return 243.5*g/(17.67-g); }    
      function rhAt(Td,T){ return Math.max(3,Math.min(100,100*Math.exp(17.67*Td/(243.5+Td)-17.67*T/(243.5+T)))); }
      var Tn=(baseT!=null?baseT:T0)+st.dT, dTx=Tn-(T0!=null?T0:Tn);
      

      var Te=num(x.heatWetBulbAirTemp)!=null?num(x.heatWetBulbAirTemp):num(x.heatWetBulbTemp)!=null?num(x.heatWetBulbTemp):(baseT!=null?baseT:T0);
      var RHe=num(x.heatMeanRh)!=null?num(x.heatMeanRh):RH0, Td=tdOf(Te,RHe), Tdc=tdOf(T0,RH0);
      ['t','feels'].forEach(function(k){ if(num(x[k])!=null) x[k]=num(x[k])+dTx; });    
      ['heatDryTemp','heatApparentMax','heatWetBulbAirTemp','heatWetBulbTemp','tmean','tmaxDay','tminDay'].forEach(function(k){ if(num(x[k])!=null) x[k]=num(x[k])+st.dT; });
      if(warm&&num(x.heatDryTemp)!=null) x.heatDryTemp=Tn;
      if(Tdc!=null&&num(x.hum)!=null) x.hum=rhAt(Tdc,num(x.t));
      

      var TeN=warm?Math.max(Te+st.dT,Tn):Te+st.dT;
      ['heatWetBulbAirTemp','heatWetBulbTemp'].forEach(function(k){ if(num(x[k])!=null) x[k]=TeN; });
      if(Td!=null&&num(x.heatMeanRh)!=null) x.heatMeanRh=rhAt(Td,TeN);
      

      var Tu=num(x.heatUtciT), Ru=num(x.heatUtciRh);
      if(Tu!=null&&Ru!=null&&typeof W.agnUtci==='function'){ var Tdu=tdOf(Tu,Ru), Tun=Tu+st.dT, Run=(Tdu!=null)?rhAt(Tdu,Tun):Ru, Wk=num(x.heatUtciWind);
        var Un=W.agnUtci(Tun,Tun,(Wk!=null?Wk/3.6:0.5),Run); x.heatUtciT=Tun; x.heatUtciRh=Run; x.heatUtciShade=(Un!=null&&isFinite(Un))?Un:null; }
      else if(num(x.heatUtciShade)!=null){ x.heatUtciShade=null; }    
      x.scenarioDewPoint=Td; x.scenarioT=Tn; }
     
    if(st.dGust){ if(num(x.gust)!=null) x.gust=num(x.gust)+st.dGust; else x.scenarioGustNote='no gust in the forecast for this place: the gust test is not applied'; }
     
    if(st.wet!=null){ x.api=Math.max(0,Math.min(1,st.wet/100)); x.scenarioWetPct=st.wet; }
    return x; }
  function chip(L){
    if(!L||L.nd) return '<span class="lv nd">No data</span>';
    if(L.na) return '<span class="lv na">Cannot occur here</span>';
    var sw=(W.AGN&&AGN.hz5&&AGN.hz5.swatch)?AGN.hz5.swatch[L.i]:null;
    return '<span class="lv l'+L.i+'" style="background:'+esc(sw||'#eef1f4')+'">'+WORDS[L.i]+'</span>'; }
  function delta(a,b){
    if(!a||!b||a.nd||b.nd||a.na||b.na||a.i==null||b.i==null) return {txt:'—',cls:'same',n:null};
    var d=b.i-a.i; if(!d) return {txt:'No change',cls:'same',n:0};
    return {txt:(d>0?'▲ ':'▼ ')+Math.abs(d)+' level'+(Math.abs(d)>1?'s':''),cls:d>0?'up':'down',n:d}; }
  function compute(unit){
    var rows=[];
    HZ.forEach(function(p){ var h=p[0], inp=engineInput(unit,h);
      var b=levelFrom(h,score(unit,h,inp)), s=levelFrom(h,score(unit,h,perturb(inp)));
      rows.push({h:h,label:p[1],base:b,scen:s,d:delta(b,s)}); });
    return rows; }
  W.AGN=W.AGN||{};
   
  AGN.scenario76={ compute:function(unit,o){ var save={rainMm:st.rainMm,dT:st.dT,dGust:st.dGust,wet:st.wet}; if(o){ st.rainMm=o.rainMm||0; st.dT=o.dT||0; st.dGust=o.dGust||0; st.wet=(o.wet!=null)?o.wet:null; } try{ return compute(unit); } finally { st.rainMm=save.rainMm; st.dT=save.dT; st.dGust=save.dGust; st.wet=save.wet; } },
    presets:function(id){ var s=stationById(id||st.place); loadShape(); loadT95(s); var u=unitOf(s); return u?presets(magnitudes(u,s)):null; },
    pending:function(){ return lsPend; },
    state:function(){ return {place:st.place,preset:st.preset,rainMm:st.rainMm,dT:st.dT,dGust:st.dGust,wet:st.wet,shape:st.shape}; },
    unit:function(){ var s0=stationById(st.place), u=unitOf(s0); return u?{unit:u,name:s0&&s0.name,m:magnitudes(u,s0)}:null; },
    select:function(id){ st.place=id; st.preset='now'; st.rainMm=0; st.dT=0; st.dGust=0; build(); render(); } };
  function host(){ return D.getElementById('agnScn'); }
  ['agn:active-asset','agn:project'].forEach(function(ev){ D.addEventListener(ev,function(){ var sp=subjectPlace(); if(sp&&sp!==st.place){ st.place=sp; st.preset='now'; st.rainMm=0; st.dT=0; st.dGust=0; st.wet=null; if(st.built) render(); } }); });
  

  function placeFromFlow(){ try{ var L=W.AGN&&AGN.flow&&AGN.flow.location?AGN.flow.location():null, nm=String(L&&L.name||'').trim().toLowerCase(); if(!nm) return null;
      var a=(W.STATIONS||[]).filter(function(s){ return s&&s.id&&s.name; }), i;
      for(i=0;i<a.length;i++) if(String(a[i].name).toLowerCase()===nm) return a[i].id;
      var f=flowPlace(); if(f) return f.id;
    }catch(_){} return null; }
  D.addEventListener('agn:location',function(){ if(subjectPlace()) return; var id=globalPlace(); if(id&&id!==st.place){ st.place=id; st.preset='now'; st.rainMm=0; st.dT=0; st.dGust=0; st.wet=null; if(st.built) render(); } });
  function build(){
    var panel=D.getElementById('agn-panel-hybridlab'); if(!panel) return false;
    var cfe=D.getElementById('cfeSection');
    

    var more=D.getElementById('agnScnMore');
    if(!more && cfe && cfe.parentNode){ more=D.createElement('details'); more.id='agnScnMore'; more.className='agn-scn-more';
      more.className+=' agn-op-only'; more.innerHTML='<summary><b>Operator · sensitivity sweep</b><span>the advanced scenario engine on a copy of the inputs</span></summary>';
      cfe.parentNode.insertBefore(more,cfe); }
    

    if(cfe){ cfe.classList.add('agn-op-only'); if(more && cfe.parentNode!==more) more.appendChild(cfe); }
    try{ if(more && !more.__opSet){ more.__opSet=1; if(W.AGN&&AGN.operator&&AGN.operator()) more.open=true; } }catch(_){}
    var h=host();
    if(!h){ h=D.createElement('section'); h.id='agnScn'; h.className='agn-scn'; h.setAttribute('aria-label','Scenario and stress test');
      var hero=panel.querySelector('.hybrid-hero'); if(hero&&hero.parentNode===panel) panel.insertBefore(h,hero.nextSibling); else if(cfe&&cfe.parentNode) cfe.parentNode.insertBefore(h,cfe); else panel.appendChild(h);
      h.addEventListener('change',onInput); h.addEventListener('input',onInput); h.addEventListener('click',onClick); }
    (function(e){ if(e&&h&&h.parentNode){ e.classList.remove('agn-op-only'); if(h.nextSibling!==e) h.parentNode.insertBefore(e,h.nextSibling); } })(D.getElementById('agnV91ScenarioMonteHost'));
    if(!st.place) st.place=defaultPlace();
    st.built=true; return true; }
  function onInput(e){ var t=e.target; if(!t) return;
    if(t.dataset&&t.dataset.k){ st[t.dataset.k]=Number(t.value)||0; if(t.dataset.k==='wet'&&Number(t.value)<0) st.wet=null; st.preset='custom'; render(true); } }
  function onClick(e){ var b=e.target&&e.target.closest?e.target.closest('button[data-preset]'):null; if(!b||b.disabled) return;
    var s=stationById(st.place), u=unitOf(s); if(!u) return;
    var P=presets(magnitudes(u,s)); for(var i=0;i<P.length;i++) if(P[i].id===b.dataset.preset){ st.preset=P[i].id; st.rainMm=Math.round(P[i].set.rainMm*10)/10; st.dT=Math.round(P[i].set.dT*10)/10; st.dGust=P[i].set.dGust; st.wet=(P[i].set.wet!=null)?P[i].set.wet:null; }
    render(); }
  var _rt=null, _wait={key:null,t0:0};
  /* v91.17.277 · L2 · how far the national run is: tehsils whose day inputs have arrived (the same test as "ready" below) */
  function sweepIn(){ var D0=W.DISTRICT_IN||{}, n=0, t=0; for(var k in D0){ if(/^IIOJK\b|Indian Illegally Occupied/i.test(k)) continue; t++; var r=D0[k]; if(r&&(r.weatherLive||r.nationalLive||r.fcSource)) n++; } return {n:n,total:t}; }
  function render(fromSlider){
    if(!build()) return; var h=host(); if(!h) return;
    var s=stationById(st.place), u=unitOf(s);
    var ready=!!(u && W.DISTRICT_IN && W.DISTRICT_IN[u] && (W.DISTRICT_IN[u].weatherLive||W.DISTRICT_IN[u].nationalLive||W.DISTRICT_IN[u].fcSource));
    loadShape(); loadT95(s);
    var rows=ready?compute(u):null;
    if(ready && !rows.some(function(r){ return r.h!=='drought' && r.base && r.base.i!=null; })) ready=false;    
     
    if(!ready){ var key=(s&&s.id)||'-', pr=sweepIn(); if(_wait.key!==key){ _wait={key:key,t0:Date.now(),n0:pr.n,t1:Date.now(),n1:pr.n}; }
      if(pr.n>_wait.n1){ _wait.t1=Date.now(); _wait.n1=pr.n; }
      var ph=W.machDataState&&W.machDataState.phase, el=(Date.now()-_wait.t0)/1000, rate=(el>=4&&pr.n>_wait.n0)?(pr.n-_wait.n0)/el:0;
      if(ph==='failed'||ph==='ratelimited'||Date.now()-_wait.t1>20000){ h.innerHTML='<h3>Scenario &amp; stress test</h3><div class="scn-wait">Today\'s levels are not available for '+esc(s?s.name:'this place')+' yet. Scenarios need the day\'s hazard inputs. <button type="button" class="scn-retry" id="agnScnRetry">Retry</button></div>';
        var rb=h.querySelector('#agnScnRetry'); if(rb) rb.onclick=function(){ _wait={key:null,t0:0}; render(); }; clearTimeout(_rt); _rt=setTimeout(function(){render();},15000); return; }
      var eta=rate?(pr.total-pr.n)/rate:null, etaT=eta==null?'':(eta<90?Math.max(5,Math.round(eta/5)*5)+' s':Math.round(eta/60)+' min');
      h.innerHTML='<h3>Scenario &amp; stress test</h3><div class="scn-wait">Today\'s levels for '+esc(s?s.name:'this place')+' arrive with the national forecast run'
        +(pr.total?': '+pr.n+' of '+pr.total+' tehsils are in so far'+(etaT?'; the whole run ends in about '+etaT+' at the current pace':'')+'. The stress test opens as soon as this place is in.':'. The stress test opens as soon as this place is in.')+'</div>';
      clearTimeout(_rt); _rt=setTimeout(function(){render();},2000); return; }
    _wait={key:null,t0:0};
    var m=magnitudes(u,s), P=presets(m), row=W.DISTRICT_IN[u]; st.sig=JSON.stringify(rows)+JSON.stringify(P);
    var tNow=num(row.t);
    var day=''; try{ var di=engineInput(u,'flood'); day=(di&&di.dayIndex>0&&di.dayDate)?('forecast day '+di.dayDate):'today'; }catch(_){ day='today'; }
    if(fromSlider && h.querySelector('#agnScnRows')){ paintRows(h,rows); paintPresets(h,P); return; }
    var gName=s.site?s.name:((AGN.place&&AGN.place.name&&AGN.place.name())||s.name);
    h.innerHTML=
      '<div class="scn-top"><div><h3>Scenario &amp; stress test · <span id="agnScnName">'+esc(s.name)+'</span></h3>'
      +'<p class="scn-sub">What would '+esc(day)+'\'s levels be under a heavier storm, a hotter day or a colder night? Pick a stress test or adjust the sliders.</p></div>'
      +'<div class="scn-place"><span class="agn-place-ro"'+(s.site?'':' data-agn-place="1"')+'><span class="k">'+(s.site?'Site':'Place')+'</span><span class="'+(s.site?'n':'v')+'">'+esc(gName)+'</span><button type="button" data-agn-change-place="1" aria-label="Change the place (opens the place search at the top of the page)">Change</button></span>'+(!s.site&&gName!==s.name?' <small>levels for '+esc(s.name)+'</small>':'')+'</div></div>'
      +'<p class="scn-now" id="agnScnNow">Temperature now <b>'+(tNow!=null?tNow.toFixed(1)+' °C':'—')+'</b></p>'
      +'<div class="scn-presets" id="agnScnPresets" role="group" aria-label="Stress tests"></div>'
      +'<div class="scn-sliders">'
      +'<label>Rain in one day <output id="agnScnORain"></output><input type="range" min="0" max="'+Math.max(100,Math.ceil(((Math.max(m.max20y||0,m.rl10||0))*1.5)/10)*10)+'" step="1" data-k="rainMm" value="'+st.rainMm+'" aria-label="Rain in one day, millimetres"'+(st.shape&&st.shape.ok?'':' disabled')+'></label>'
      +'<label>Temperature change <small style="font-weight:600;color:#56656e">(on the day\'s high; on the night\'s low if colder)</small> <output id="agnScnOT"></output><input type="range" min="-10" max="10" step="0.5" data-k="dT" value="'+st.dT+'" aria-label="Temperature change, degrees"></label>'
      +'<label>Stronger gusts <output id="agnScnOG"></output><input type="range" min="0" max="100" step="5" data-k="dGust" value="'+st.dGust+'" aria-label="Extra gust, km per hour"></label>'
      +'<label>Ground wetness before the rain <output id="agnScnOW"></output><input type="range" min="-5" max="100" step="5" data-k="wet" value="'+(st.wet==null?-5:st.wet)+'" aria-label="Ground wetness before the rain, percent (far left = as now)"></label>'
      +'</div>'
      +'<table><caption class="agn-scn-sr">Hazard levels now and under the scenario</caption><thead><tr><th scope="col">Hazard</th><th scope="col">Now</th><th scope="col">Scenario</th><th scope="col">Change</th><th scope="col" class="agn-op-only">Index</th></tr></thead><tbody id="agnScnRows"></tbody></table>'
      +'<p class="scn-foot">Levels come from the same NIGRAAN engine as the map, re-run on a copy of '+esc(day)+'\'s inputs for this place. The live forecast and alerts are not changed. This is a stress test, not a forecast.</p>'
      +'<div class="scn-op agn-op-only" id="agnScnOp"></div>';
    paintRows(h,rows); paintPresets(h,P);
    var op=h.querySelector('#agnScnOp'); if(op) op.innerHTML='<b>Operator · scenario inputs.</b> unit '+esc(u)+' · lead '+lead()+' h · day input via hzDayInput (map day selection) · levels AGN.hz5.levelOf.<br>'
      +'rain shape: '+(st.shape&&st.shape.ok?('wettest 1 h = '+(st.shape.f1*100).toFixed(0)+' %, wettest 6 h = '+(st.shape.f6*100).toFixed(0)+' % of the wettest 24 h (gauge p99, '+esc(st.shape.n)+' gauges, '+esc((st.shape.window||[]).join('..'))+'; data/rain-intensity-scale.json via /api/landslide/calibration)'):'unavailable, rain tests disabled')+'<br>'
      +'rain depths: p99 '+esc(m.p99)+' mm, 20-y max '+esc(m.max20y)+' mm ('+esc(m.rcBasis||'rain climatology unavailable')+') · return levels 2-year '+esc(m.rl2)+' mm, 10-year '+esc(m.rl10)+' mm ('+esc(m.rlBasis||'not loaded')+'; /api/site/screening)<br>'
      +'heat: tx90 today '+esc(m.tx90)+' °C, hottest-fortnight p90 of the day max (field t95) '+esc(m.t95)+' °C, day max now '+esc(m.tmax)+' °C · cold: tn10 today '+esc(m.tn10)+' °C, day min '+esc(m.tmin)+' °C (/api/climatology/thresholds, /api/climatology/baseline; data/climatology.json 1991-2020)'; }
  function paintPresets(h,P){
    var box=h.querySelector('#agnScnPresets'); if(!box) return;
    var na=P.filter(function(p){ return p.na; });
    box.innerHTML=P.filter(function(p){ return !p.na; }).map(function(p){ var ok=p.ok!==false; return '<button type="button" data-preset="'+p.id+'" class="'+(st.preset===p.id?'on':'')+'" aria-pressed="'+(st.preset===p.id)+'"'+(ok?'':' disabled')+'>'+esc(p.label)+'<small>'+esc(p.sub)+'</small></button>'; }).join('')
      +(na.length?'<p class="scn-na">Not available for this place: '+esc(na.map(function(p){ return p.label.toLowerCase().replace(/\bglof\b/g,'GLOF'); }).join(', '))+'.</p>':'');
    var o=function(id,v){ var e=h.querySelector('#'+id); if(e) e.textContent=v; };
    o('agnScnORain', st.rainMm>0?Math.round(st.rainMm)+' mm':'as forecast');
    o('agnScnOT', st.dT?((st.dT>0?'+':'')+st.dT.toFixed(1)+' °C'):'as forecast');
    o('agnScnOG', st.dGust?('+'+st.dGust+' km/h'):'as forecast');
    var nowWet=null; try{ var fi=engineInput(unitOf(stationById(st.place)),'flood'); nowWet=(fi&&num(fi.api)!=null)?Math.round(num(fi.api)*100):null; }catch(_){}
    o('agnScnOW', st.wet==null?('as now'+(nowWet!=null?' ('+nowWet+' %)':'')):(st.wet+' %'+(st.wet>=90?' · soaked':st.wet<=15?' · dry':'')));
    h.querySelectorAll('input[data-k]').forEach(function(i){ if(D.activeElement!==i) i.value=(i.dataset.k==='wet'&&st.wet==null)?-5:st[i.dataset.k]; }); }
  function paintRows(h,rows){
    var tb=h.querySelector('#agnScnRows'); if(!tb) return;
    tb.innerHTML=rows.map(function(r){ var bs=r.base&&r.base.score!=null?Math.round(r.base.score):'—', ss=r.scen&&r.scen.score!=null?Math.round(r.scen.score):'—';
      return '<tr data-hz="'+r.h+'"><th scope="row" style="font-size:.9375rem;text-transform:none;letter-spacing:0;color:#0c2a3a;border:0">'+esc(r.label)+'</th><td>'+chip(r.base)+'</td><td>'+chip(r.scen)+'</td><td class="dl '+r.d.cls+'">'+r.d.txt+'</td><td class="agn-op-only">'+bs+' → '+ss+'</td></tr>'; }).join(''); }
  function active(){ var p=D.getElementById('agn-panel-hybridlab'); return !!(p&&p.classList.contains('active')); }
  function kick(){ if(active()) render(); }
  D.addEventListener('click',function(e){ var t=e.target&&e.target.closest?e.target.closest('#agn-tab-hybridlab'):null; if(t) setTimeout(kick,50); },true);
  ['agn:data','agn:clim-anchors','agn:day'].forEach(function(ev){ D.addEventListener(ev,function(){ if(active()) render(); }); });
  var tries=0; (function boot(){ if(build()){ if(active()) render(); return; } if(++tries<120) setTimeout(boot,1000); })();
   
  (function(f){ setInterval(f,10000); document.addEventListener('agn:dom',f); })(function(){ if(!active()||!host()) return; if(!host().querySelector('#agnScnRows')){ render(); return; }
    var s=stationById(st.place), u=unitOf(s); if(!u) return; var rows=compute(u), P=presets(magnitudes(u,s)), sig=JSON.stringify(rows)+JSON.stringify(P);
    if(sig!==st.sig){ st.sig=sig; paintRows(host(),rows); paintPresets(host(),P); } });
})();
