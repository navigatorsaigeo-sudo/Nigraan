


(function(){
  var liveAdapter=window.AGN&&AGN.adapters?AGN.adapters.require('liveLegacy'):null;
  var mapAdapter=window.AGN&&AGN.adapters?AGN.adapters.require('mapLegacy'):null;
  var geo=window.AGN&&AGN.dataServices?AGN.dataServices.require('geography'):null;
  var domain=window.AGN&&AGN.dataServices?AGN.dataServices.require('domain'):null;
  var contracts=window.AGN&&AGN.dataServices?AGN.dataServices.require('contracts'):null;
  var liveLocal=(window.AGN&&AGN.sectionState)?AGN.sectionState.state('livedata',{comparisonUnit:null,forecastDay:0,cmipCache:{},cmipRequests:0}):{comparisonUnit:null,forecastDay:0,cmipCache:{},cmipRequests:0};
  var DAY=Number(liveLocal.forecastDay)||0;
  

  var BCOL=["#3d6b26","#3d6b26","#8a6410","#a8501a","#7d1c1c"];   
  var BCOL_NODATA="#8b969e";
  function bCol(v){ var i=bIdx(v); return (i==null)?BCOL_NODATA:(BCOL[i]||BCOL_NODATA); }
  

  var HZ=[["flood","Flood"],["heat","Heat stress"],["rain_hz","Heavy rain"],["wind","Wind and gusts"],
          ["drought","Drought"],["glof","Glacial lake outburst flood (GLOF)"],["landslide","Landslide"],
          ["cold","Cold stress (UTCI)"],["seismic","Seismic (static)"],
          ["cyclone","Cyclone (static)"]];
  var cmip=liveLocal.cmipCache||{}; liveLocal.cmipCache=cmip;
  function bIdx(v){
    var b=(window.AGN&&AGN.hazards&&AGN.hazards.band)?AGN.hazards.band(v):null;
    return b?b.index:null;
  }
  function bLab(v){
    var b=(window.AGN&&AGN.hazards&&AGN.hazards.band)?AGN.hazards.band(v):null;
    return b?b.label:"No data";
  }
  function nn(v,dp){ return (v==null||v===""||isNaN(v))?"&mdash;":(dp?Number(v).toFixed(dp):Math.round(v)); }
  function di(t,rh){ return (t==null||rh==null)?null:t-0.55*(1-0.01*rh)*(t-14.5); }
  function diB(v){ if(v==null) return {t:"No data",c:"#7b8c96",bg:"rgba(12,56,81,.05)"};
    if(v<21) return {t:"Comfortable",c:"#3d6b26",bg:"rgba(127,176,105,.16)"};
    if(v<24) return {t:"Slight discomfort",c:"#5a6f28",bg:"rgba(160,180,90,.18)"};
    if(v<27) return {t:"Discomfort",c:"#8a6410",bg:"rgba(230,182,85,.22)"};
    if(v<29) return {t:"High discomfort",c:"#a05a12",bg:"rgba(240,150,60,.22)"};
    if(v<32) return {t:"Severe discomfort",c:"#8f2f14",bg:"rgba(216,90,48,.20)"};
    return {t:"Heat danger",c:"#7d1c1c",bg:"rgba(152,33,34,.16)"}; }
  

  function wb(t,rh,unitName){ if(t==null||rh==null) return null;
    if(typeof window.agnWetBulbFor!=='function') return null;
    return window.agnWetBulbFor(t,rh,unitName); }
  function cell(k,v,u){ return '<div class="mp-c"><div class="k">'+k+'</div><div class="v">'+v
    +' <span class="u">'+u+'</span></div></div>'; }

  

  

  function unitDataState(name){
    var row=null;
    try{ row=(window.DISTRICT_IN||{})[name]||null; }catch(_){}
    if(!row){
      try{
        var mem=(geo&&geo.memberTehsils)?geo.memberTehsils(name):[];
        for(var i=0;i<mem.length;i++){ var r=(window.DISTRICT_IN||{})[mem[i]];
          if(r){ row=r; break; } }
      }catch(_){}
    }
    if(!row) return {key:'none', label:'no unit row', cls:'mut',
                     why:'this unit has no input row at all, so nothing has been fetched for it'};
    if(row.fetchFailed===true || row.lastFetchError)
      return {key:'failed', label:'fetch failed', cls:'warn',
              why:'a retrieval was attempted for this unit and did not return'
                  + (row.lastFetchError ? (': '+String(row.lastFetchError).slice(0,90)) : '')};
    if(row.estimated===true || row.fcSource==='agn_field_estimate')
      return {key:'estimated', label:'estimated', cls:'fc',
              why:'interpolated from live neighbours \u2014 not a retrieval for this unit'
                  + (row.estimateErrorC!=null ? (', declared error \u00b1'+row.estimateErrorC+' \u00b0C') : '')};
    var live=(row.fcSource==='tehsil_centroid_open_meteo') || row.nationalLive===true
             || row.weatherLive===true || row.forecastLive===true;
    if(live){
      

      var age=null;
      try{ if(row.fcUpdatedAt) age=(Date.now()-row.fcUpdatedAt)/3600000; }catch(_){}
      if(age!=null && age>3)
        return {key:'stale', label:'stale \u00b7 '+Math.round(age)+' h', cls:'warn',
                why:'the last retrieval for this unit landed '+Math.round(age)
                    +' hours ago and has not refreshed'};
      

      return {key:'retrieved', label:'model \u00b7 retrieved', cls:'live',
              why:'a live forecast-model retrieval has landed on this unit (no station observation feeds this row)'
                  + (age!=null ? (', '+(age<1?'within the hour':(Math.round(age)+' h ago'))) : '')};
    }
    return {key:'seed', label:'seed baseline', cls:'fc',
            why:'the shipped baseline \u2014 no retrieval has reached this unit, so these '
               +'numbers are a starting point, not an observation'};
  }
  try{ window.unitDataState=unitDataState; }catch(_){}

  function unitDays(name){
    try{
      var direct=geo.input(name);
      if(direct&&direct.days){contracts.forecast({unitKey:name,unitType:'tehsil',provider:direct.provider||direct.source||'MACH',validTime:direct.validTime,days:direct.days},{section:'livedata',boundary:'unitDays'});return {days:direct.days,scope:"tehsil"};}
      var tks=geo.memberTehsils(name);
      var rows=[]; tks.forEach(function(k){ var input=geo.input(k); if(input&&input.days) rows.push(input.days); });
      if(!rows.length) return null;
      var out=[];
      for(var d=0;d<4;d++){
        var recs=rows.map(function(r){return r[d];}).filter(Boolean);
        if(!recs.length) break;
        function mean(f){ var v=recs.map(function(r){return r[f];}).filter(function(x){return x!=null;});
          return v.length?v.reduce(function(a,b){return a+b;},0)/v.length:null; }
        function max(f){ var v=recs.map(function(r){return r[f];}).filter(function(x){return x!=null;});
          return v.length?Math.max.apply(null,v):null; }
        out.push({date:recs[0].date, tmax:max("tmax"), tmin:mean("tmin"), tmean:mean("tmean"),
          appMax:max("appMax"), rh:mean("rh"), dew:mean("dew"), precip:max("precip"),
          prHours:max("prHours"), prProb:max("prProb"), wind:mean("wind"), gust:max("gust"),
          uv:max("uv"), rad:mean("rad"), et0:mean("et0"), api:max("api")});
      }
      return out.length?{days:out,scope:"district ("+rows.length+" tehsils)"}:null;
    }catch(_){ return null; }
  }

  

  function sides(on){
    var L=document.getElementById("mpLeft"), R=document.getElementById("mpRight");
    if(!L||!R) return;
    if(on){ L.classList.add("open"); R.classList.add("open"); }
    else { L.classList.remove("open"); R.classList.remove("open"); }
    setTimeout(function(){ try{ if(mapAdapter) mapAdapter.invalidate(); }catch(_){} },190);
  }
  function closePanel(){ liveLocal.comparisonUnit=null; sides(false); }

  var ANCH={};   /* v91.17.283.18: unit name -> its main settlement (AGN.resolvePlace: the first row of the place search) */
  function render(name){
    liveLocal.comparisonUnit=name||null;
    sides(true);
    var Lin=document.getElementById("mpLeftIn"), Rin=document.getElementById("mpRightIn");
    if(!Lin||!Rin||!name) return;
    var disp=false; try{ disp=(typeof isScoreableDistrict==="function")&&!isScoreableDistrict(name); }catch(_){}
    var ud=unitDays(name), rec=(ud&&ud.days[DAY])||null;
    

    try{ if(rec&&typeof hzDayInput==='function'){ var _dh=hzDayInput(name,'heat'); if(_dh&&!_dh.__unavailable&&_dh.dayIndex===DAY&&_dh.tmaxDay!=null){ rec=Object.assign({},rec,{tmax:_dh.tmaxDay,tmin:_dh.tminDay,tmean:(_dh.tmean!=null?_dh.tmean:rec.tmean),__dayBasis:'served hourly curve'}); } } }catch(_){}
     
    

    /* v91.17.283.12 · ONE CALCULATION POINT: the weather cells are the point state of the place (AGN.pointState): the selected point
       when it lies in this unit, else the unit's main settlement (GET /api/geo/resolve, the one place rule of every page) */
    var PSx=null, PSpt=null, _e=function(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
    try{ var _a0=domain&&domain.activePoint?domain.activePoint():null, _s0=(_a0&&_a0.lat!=null&&AGN.siteUnit)?AGN.siteUnit(+_a0.lat,+_a0.lon):null;
      if(_s0&&_s0.key&&(_s0.key===name||(geo&&geo.districtOf&&geo.districtOf(_s0.key)===name))) PSpt={lat:+_a0.lat,lon:+_a0.lon,name:_a0.name||null};
      else { var _ac=ANCH[name]; if(_ac===undefined){ ANCH[name]=null; var _isD=!!(geo&&geo.memberTehsils&&(geo.memberTehsils(name)||[]).length);
          AGN.resolvePlace(String(name).replace(/ District$/,'')+(_isD?' district':' tehsil')).then(function(r){ if(!r) return; ANCH[name]={lat:r.lat,lon:r.lon,name:r.label||r.name}; if(liveLocal.comparisonUnit===name) render(name); }); }
        else if(_ac) PSpt=_ac; }
      PSx=PSpt?AGN.pointState.peek(PSpt.lat,PSpt.lon):null;
      if(PSpt&&!PSx) AGN.pointState.get(PSpt.lat,PSpt.lon).then(function(v){ if(v&&liveLocal.comparisonUnit===name) render(name); }); }catch(_){ PSx=null; }
    var PD=PSx&&PSx.days?(PSx.days[DAY]||null):null;
    var dayChip=DAY>0?'<span class="mp-chip fc">forecast +'+DAY+'d</span>':'';

    var _pl=(PSpt&&AGN.pointState&&AGN.pointState.placePeek)?AGN.pointState.placePeek(PSpt.lat,PSpt.lon):null, _lab=(_pl&&_pl.name&&_pl.name!==name)?_pl.name:null;
    var h='<div class="mp-h"><div><h4 data-unit="'+_e(name)+'">'+(_lab?_e(_lab):name)+'</h4><div class="sb">'+(_lab?_e(name)+' tehsil &middot; ':'')+'meteorology'
      +(ud&&!_lab?" &middot; "+ud.scope:"")+'</div></div>'
      +'<button class="mp-x" data-agn-action="livedata:close" aria-label="close">&times;</button></div>'
      +dayChip;
    if(disp){
      h+='<div class="mp-disp"><b>Disputed territory.</b> No meteorological product is published for this area.</div>';
    } else if(!rec){
      h+='<div class="mp-sec mp-mut">Daily parameters not loaded for this unit yet - the national sweep fills these within ~25 s of load.</div>';
    } else {
      var d1=di(rec.tmean,rec.rh), b1=diB(d1), w1=wb(rec.tmean,rec.rh,name);
      

      var _hl=PD&&PD.heat?AGN.pointState.heatWord(PD.heat.level):null, _hI=_hl!=null?({Normal:0,Low:1,Moderate:2,High:3,Severe:4})[_hl]:null, _sw=(AGN.hz5&&AGN.hz5.swatch&&_hI!=null)?AGN.hz5.swatch[_hI]:'#eef2f4';
      var _hsT=PD&&PD.heat?('Heat stress at '+(PSpt&&PSpt.name||'this place')+' '+(DAY?'on day +'+DAY:'today')+': the hottest hour ('+(PD.heat.at||'')+' PKT), UTCI in shade '+(PD.heat.utciMaxC!=null?PD.heat.utciMaxC+' \u00b0C':'not assessed')+(PD.heat.cls?' ('+PD.heat.cls+')':'')+'. A heat level starts at strong heat stress (UTCI 32 \u00b0C): Moderate 32-38, High 38-46, Severe 46+ (Blazejczyk et al. 2013). The tehsil level on the map is the highest over the tehsil\u2019s points.'):'Heat stress at this place is loading.';
      var _hsTile='<div class="mp-c mp-hs" data-agn-ps="'+(PSx?_e(PSx.key):'')+'" data-utci="'+(PD&&PD.heat&&PD.heat.utciMaxC!=null?(+PD.heat.utciMaxC).toFixed(2):'')+'" data-utci-src="run" style="background:'+_sw+'" title="'+_e(_hsT)+'"><div class="k">Heat stress</div>'
        +'<div class="v">'+(_hl||'\u2026')+'</div><div class="u">'+(PD&&PD.heat&&PD.heat.utciMaxC!=null?'UTCI '+nn(PD.heat.utciMaxC,1)+' \u00b0C \u00b7 '+_e(PD.heat.at||'peak'):(PD?'UTCI not assessed':'loading'))+'</div></div>';
      

      var dc=null; try{ var _su=AGN.subject&&AGN.subject.get(), _ap=domain&&domain.activePoint();
        var _apU=null; try{ var _sx=(_ap&&_ap.lat!=null&&AGN.siteUnit)?AGN.siteUnit(+_ap.lat,+_ap.lon):null; _apU=(_sx&&_sx.scored)?_sx.key:null; }catch(_){}
        var _here=_apU||(_su&&_su.unit);    
        if(_here&&_ap&&_ap.lat!=null&&(_here===name||geo.districtOf(_here)===name)&&window.AGN&&AGN.prob){ AGN.prob.prime(_ap.lat,_ap.lon,_ap.elev); dc=AGN.prob.dayChance(_ap.lat,_ap.lon,DAY); } }catch(_){}
      

      var _pn=PSpt&&PSpt.name?PSpt.name:name, pv=function(v,dp){ return PD?nn(v,dp):'\u2026'; };
      h+='<div class="mp-cap">'+(DAY>0?'Day +'+DAY+' at ':'Today at ')+_e(_pn)+'</div>';
      h+='<div class="mp-g">'
        +cell("Temp max",pv(PD&&PD.tmaxC,1),"&deg;C")+cell("Temp min",pv(PD&&PD.tminC,1),"&deg;C")+_hsTile
        +cell("Feels like",pv(PD&&PD.feelsMaxC,1),"&deg;C max")+cell("Humidity",pv(PD&&PD.rhMean),"% daily mean")
        +cell("Dew point",pv(PD&&PD.dewMeanC,1),"&deg;C mean")+cell("Rainfall",pv(PD&&PD.rainMm,1),"mm")
        +cell("Chance of rain",dc?nn(dc.pct):"–","%")+cell("Wind max",pv(PD&&PD.windMaxKmh,1),"km/h")
        +cell("Gust max",pv(PD&&PD.gustMaxKmh),"km/h")+cell("UV index",pv(PD&&PD.uvMax,1),"max")
        +'</div>';
      h+='<div class="mp-cap">Across '+name+(ud&&ud.scope?' '+ud.scope:'')+' (area inputs of the tehsil)</div><div class="mp-g">'
        +(rec.precipCor!=null?cell("Station-corrected rain",nn(rec.precipCor,1),"mm · for totals, not warnings"):"")+cell("Rain hours",nn(rec.prHours,1),"h")
        +cell("Solar",nn(rec.rad,1),"MJ/m2")+cell("ET0",nn(rec.et0,2),"mm")
        +(rec.aqi!=null?cell("US AQI",nn(rec.aqi),"index"):"")+(rec.pm25!=null?cell("PM2.5",nn(rec.pm25),"ug/m3"):"")
        +'</div>';
      h+='<div class="mp-sec mp-mut">Weather at the place: the point state, the served forecast at that point and height ('+(PSx?_e(AGN.pointState.sourceWord(PSx).toLowerCase()):'loading')+'). Area inputs: the tehsil\u2019s model forecast.</div>';
      h+='<div class="mp-sec mp-mut">'+(dc?('Chance of rain: share of ensemble members whose day total (00–24 PKT) reaches '+dc.tauMm+' mm on the grid, the amount matched to how often the satellite rainfall record shows rain around places like this ('+String(dc.group||'').split(' (')[0]+'). It is the chance of rain in the area around the place.'):'Chance of rain is shown for the selected place: pick a place on the map to see it.')+'</div>';
    }
    Lin.innerHTML=h;

    var g='<div class="mp-h"><div><h4 data-unit="'+_e(name)+'">'+(_lab?_e(_lab):name)+'</h4><div class="sb">'+(_lab?_e(name)+' tehsil &middot; ':'');
    

    try{ var px=AGN.exposure.forUnit(name); g+=px?("resident population "+AGN.exposure.fmt(px.pop)+" (population grid 2020"+(px.level?", "+px.level:"")+"; not a hazard-gated exposure)"):"hazards"; }catch(_){ g+="hazards"; }
    g+='</div></div><button class="mp-x" data-agn-action="livedata:close" aria-label="close">&times;</button></div>'
      +'<span class="mp-kind haz agn-op-only">screening band</span> '
       
      +(function(){ var st=unitDataState(name);
         return '<span class="mp-chip agn-op-only '+st.cls+'" title="'
              +String(st.why).replace(/"/g,'&quot;')+'">'+st.label+'</span>'; })();
    if(disp){
      g+='<div class="mp-disp"><b>Disputed territory.</b> Excluded from all AGN scoring surfaces. '
        +'No hazard score is published here - an absence of scoring is not an absence of risk.</div>';
    } else {
      var inp=geo.input(name)||null, keys=[name];
      if(!inp){ keys=geo.memberTehsils(name).filter(function(k){return !!geo.input(k);}); }
      var rows=[];
      var unscored=[];
      var _dayInputUsed=false;    
      

      var cats=[];
      HZ.forEach(function(pr){
        var best=null, why=null, bestR=null, bestKey=null;
        keys.forEach(function(kk){
          try{
            

            var _dIn=null; try{ if(typeof hzDayInput==='function'){ var _q=hzDayInput(kk, pr[0]);     if(_q && !_q.__unavailable) _dIn=_q; } }catch(_){ _dIn=null; }
            if(_dIn) _dayInputUsed=true;
            var ev=(window.AGN&&AGN.hazards&&AGN.hazards.evaluate)
                     ? AGN.hazards.evaluate(kk, _dIn||geo.input(kk)||inp||{}, pr[0], 24, kk) : null;
            if(!ev||!ev.available) return;
            if(ev.categorical){
              if(!bestR){ bestR=ev; bestKey=kk; }
              return;
            }
            var idx=ev.screening&&ev.screening.index;
            if(idx!=null && (best==null||idx>best)){ best=idx; bestR=ev; bestKey=kk; }
            if(idx==null && !why) why=ev.unavailableWhy||null;
          }catch(_){}
        });
        if(bestR && bestR.categorical){
          cats.push({key:pr[0], lab:pr[1],
                     cls:(bestR.categoryLabel||bestR.category||'class not resolved'),
                     why:(bestR.screening&&bestR.screening.scaleWhy)
                         ||'a code class, not a continuous screening index'});
          return;
        }
        if(best!=null){
          var ph=(bestR&&bestR.physical)||{};
          var prov=null;
          try{ if(typeof hzProvenance==='function' && (window.HZ_INPUTS||{})[pr[0]])
                 prov=hzProvenance(geo.input(bestKey)||inp||{}, pr[0]); }catch(_){}
          rows.push({ key:pr[0], lab:pr[1], v:best,
                      phys:(ph.value!=null ? (ph.value+' '+(ph.unit||'')) : null),
                      measurand:(ph.measurand||null),
                      physWhy:(ph.value==null ? (ph.why||null) : null),
                      prov:(prov?prov.state:null), provWhy:(prov?prov.why:null), provIn:(prov?prov.inputs:null), nd:!!(prov&&prov.state==='absent') });
        }
        

        else {
          var uw=why, ucls=null, ulab=null;
          

          try{
            var _r0=hzScore(keys[0], geo.input(keys[0])||inp||{}, pr[0], 24, keys[0]);
            if(_r0 && _r0.noData){ ucls=_r0.noDataClass||null; ulab=_r0.noDataClassLabel||null;
                                   if(!uw) uw=_r0.noDataWhy||null; }
          }catch(_){}
          if(!uw){ try{ if(typeof hzProvenance==='function' && (window.HZ_INPUTS||{})[pr[0]])
                          uw=hzProvenance(geo.input(keys[0])||inp||{}, pr[0]).why; }catch(_){} }
          unscored.push({lab:pr[1], cls:ucls, clsLabel:ulab,
                         why:uw||'the governing input for this hazard is not held for this unit'});
        }
      });
      

      

      

      var _VR={Severe:5,High:4,Moderate:3,Low:2,Normal:1};
      function _vcls(v){ try{ return (window.AGN&&AGN.level&&AGN.level.word)?AGN.level.word(v):bLab(v); }catch(_){ return null; } }
      function _cls(v){ var c=_vcls(v); return c?(_VR[c]||0):-1; }
      var _condKeys={drought:1};
      try{ (AGN.hazardRegistry&&AGN.hazardRegistry.of?AGN.hazardRegistry.of('accumulated'):[]).forEach(function(k){ _condKeys[k]=1; });
           (AGN.hazardRegistry&&AGN.hazardRegistry.of?AGN.hazardRegistry.of('standing'):[]).forEach(function(k){ _condKeys[k]=1; }); }catch(_){}
      var condRows=rows.filter(function(r){ return _condKeys[r.key]; });
      rows=rows.filter(function(r){ return !_condKeys[r.key]; });
      rows.sort(function(a,b){
        var ca=_cls(a.v), cb=_cls(b.v);
        if(cb!==ca) return cb-ca;
        return String(a.lab||'').localeCompare(String(b.lab||''));
      });
      if(!rows.length){ g+='<div class="mp-sec mp-mut">No event hazard scored for this unit.</div>'; }
      else{
        var _top=_cls(rows[0].v);
        var _at=rows.filter(function(r){ return _cls(r.v)===_top; });
        var _names=_at.map(function(r){ return r.lab.toLowerCase(); });
        var _lead=_names.length===1
          ? (_names[0]+' holds it')
          : (_names.slice(0,-1).join(', ')+' and '+_names[_names.length-1]+' hold it equally');
        g+='<div class="mp-sec"><span style="font-size:0.9375rem;font-weight:800;color:'+bCol(rows[0].v)+'">'+(_vcls(rows[0].v)||bLab(rows[0].v))
          +'</span> <span class="mp-mut">&middot; '+(_top<=1?'no event hazard is above Normal':_lead)+'</span></div>';
        g+='<div class="mp-sec mp-mut" style="font-size:0.75rem;margin-top:-4px">Event hazards, ordered by level (the scale the map uses), then by name. '
          +'The indexes below are not on a common scale and are not comparable between hazards.</div>';
        var PROV_CHIP={ retrieved:['model','#35682B'], design:['seed','#B78A1E'],
                        absent:['no input','#8b969e'] };
        rows.forEach(function(x){ var _c=bCol(x.v);
          var pc=PROV_CHIP[x.prov]||null;
          g+='<div class="mp-r"><span class="n">'+x.lab+'</span><span class="mp-bar"><i style="width:'+x.v
            +'%;background:'+_c+'"></i></span><span class="bw" style="color:'+(x.nd?'#6b7681':_c)+'">'+(x.nd?'No data':bLab(x.v))
            +'</span><span class="sn">'+x.v+'</span></div>';
          

          g+='<div class="mp-ev" style="display:flex;gap:6px;align-items:baseline;flex-wrap:wrap;'
            +'margin:-2px 0 5px 0;font-size:0.75rem;line-height:1.35;color:#5d6b76">'
            +'<span>'+(x.phys
                ? ((x.measurand?x.measurand+' ':'')+x.phys)
                : ('<i>'+((window.AGN&&AGN.level&&AGN.level.readout)?AGN.level.readout(x):(x.physWhy||'no physical quantity published for this layer'))+'</i>'))+'</span>'
            +(pc?('<span title="'+String(x.provWhy||'').replace(/"/g,'&quot;')+'" '
                 +'style="font-weight:700;color:'+pc[1]+'">'+pc[0]+'</span>'):'')
            +'<span style="opacity:.75">index '+x.v+'/100</span>'
            +'</div>'; });
        if(DAY>0) g+=(_dayInputUsed
          ? '<div class="mp-sec mp-mut">Scored on the +'+DAY+'d forecast day (same input as the map fill).</div>'
          : '<div class="mp-sec mp-mut">No +'+DAY+'d input for this unit yet; bands are day 0.</div>');
      }
      if(condRows.length){
        g+='<div class="mp-sec"><div class="mp-mut" style="margin-bottom:3px">Conditions (weeks\u2013months; own lane, no response clock)</div>';
        condRows.forEach(function(x){ var _c=bCol(x.v);
          g+='<div class="mp-r"><span class="n">'+x.lab+'</span><span class="mp-bar"><i style="width:'+x.v+'%;background:'+_c+'"></i></span>'
            +'<span class="bw" style="color:'+_c+'">'+(_vcls(x.v)||bLab(x.v))+'</span><span class="sn">'+x.v+'</span></div>'
            +'<div class="mp-ev" style="margin:-2px 0 5px 0;font-size:0.75rem;color:#5d6b76;line-height:1.35">'
            +(x.key==='drought'?'90-day SPEI/SPI and root-zone stress from the national global reanalysis table; not a forecast':'standing susceptibility')+'</div>';
        });
        g+='</div>';
      }
      if(cats.length){
        g+='<div class="mp-sec"><div class="mp-mut" style="margin-bottom:3px">Screened on a class scale ('
          +cats.length+')</div>';
        cats.forEach(function(u){
          g+='<div class="mp-r"><span class="n">'+u.lab+'</span>'
            +'<span style="flex:1;font-size:0.75rem;font-weight:700;color:#0C3851">'+u.cls+'</span></div>'
            +'<div class="mp-ev" style="margin:-2px 0 5px 0;font-size:0.75rem;color:#5d6b76;line-height:1.35">'
            +u.why+'</div>';
        });
        g+='</div>';
      }
      if(unscored.length){
        g+='<div class="mp-sec"><div class="mp-mut" style="margin-bottom:3px">Screened, not scored ('
          +unscored.length+')</div>';
        var RC_INK={ineligible:'#35682B', feed:'#DA750F', method:'#6b7681'};
        unscored.forEach(function(u){
          g+='<div class="mp-r"><span class="n">'+u.lab+'</span>'
            +'<span class="mp-mut" style="flex:1;font-size:0.75rem">'
            +(u.clsLabel?('<b style="color:'+(RC_INK[u.cls]||'#6b7681')+'">'+u.clsLabel+'</b> \u00b7 '):'')
            +u.why+'</span></div>';
        });
        g+='</div>';
      }
      

      if(rec&&(rec.aqi!=null||rec.pm25!=null||rec.pm10!=null)){
        var aq=rec.aqi, aBand = aq==null?null : [aqiBand(aq).label, aqiBand(aq).color];    
        g+='<div class="mp-sec"><div class="mp-mut" style="margin-bottom:3px">Air quality'
          +(rec.aqiLive?' (live)':' (seed context)')+'</div>';
        if(aq!=null){
          g+='<div class="mp-r"><span class="n">US AQI</span><span class="mp-bar"><i style="width:'
            +Math.max(0,Math.min(100,Math.round(aq/3)))+'%;background:'+aBand[1]+'"></i></span>'
            +'<span class="bw" style="color:'+aBand[1]+'">'+aBand[0]+'</span><span class="sn">'+aq+'</span></div>';
        }
        if(rec.pm25!=null) g+='<div class="mp-r"><span class="n">PM2.5</span>'
          +'<span class="mp-mut" style="flex:1;font-size:0.75rem">µg/m³</span>'
          +'<span class="sn">'+rec.pm25+'</span></div>';
        if(rec.pm10!=null) g+='<div class="mp-r"><span class="n">PM10</span>'
          +'<span class="mp-mut" style="flex:1;font-size:0.75rem">µg/m³</span>'
          +'<span class="sn">'+rec.pm10+'</span></div>';
        g+='<div class="mp-mut" style="font-size:0.75rem">Air quality is a measured parameter '
          +'and is never ranked as a hazard here.</div></div>';
      }
      if(rec&&rec.api!=null){
        var wetLab=rec.api>=0.6?"Saturated":rec.api>=0.35?"Damp":"Dry";
        var wetCol=rec.api>=0.6?"#7d1c1c":rec.api>=0.35?"#8a6410":"#3d6b26";
        g+='<div class="mp-sec"><div class="mp-mut" style="margin-bottom:3px">Antecedent wetness (carried across days)</div>'
          +'<div class="mp-r"><span class="n">Wetness</span><span class="mp-bar"><i style="width:'+Math.round(rec.api*100)
          +'%;background:'+wetCol+'"></i></span><span class="bw" style="color:'+wetCol+'">'+wetLab
          +'</span><span class="sn">'+rec.api.toFixed(2)+'</span></div></div>';
      }
      g+='<button class="mp-btn" data-agn-action="cmip6" data-agn-arg="'+String(name).replace(/'/g,"").replace(/"/g,"&quot;")+'" title="CMIP6 change for the 2030s and 2050s, with the model spread, on the Forecast page">Long-term climate (Forecast › 2050s)</button>';
    }
    Rin.innerHTML=g;
  }

   
  function hook(){
    if(liveLocal.hooked) return;
    var release=mapAdapter.wrapSelectDistrict(function(d){
      var nm=(d&&(d.key||d.name))||null; if(!nm) return;
      liveLocal.comparisonUnit=nm; render(nm);
    });
    if(!release) return setTimeout(hook,400);
    liveLocal.hooked=true; liveLocal.releaseSelectHook=release;
    document.addEventListener("agn:data",function(){ if(liveLocal.comparisonUnit) render(liveLocal.comparisonUnit); });
    

    document.addEventListener("agn:district-forecast-status",function(e){ var st=e&&e.detail; if(st&&!st.running&&st.updated>0&&liveLocal.comparisonUnit) render(liveLocal.comparisonUnit); });
    

    (function(){
      

      function follow(){ var nm=null; try{ var ap=domain&&domain.activePoint(); if(ap&&ap.lat!=null&&AGN.siteUnit){ var su=AGN.siteUnit(+ap.lat,+ap.lon); if(su&&su.scored) nm=su.key; } }catch(_){}
        if(!nm){ try{ var s=AGN.subject&&AGN.subject.get(); nm=s&&s.unit; }catch(_){} }
        if(!nm) return;
        try{ if(!geo.hasInput(nm)){ var par=geo.districtOf(nm); if(par&&geo.memberTehsils(par).length) nm=par; else return; } }catch(_){ return; }
        if(nm!==liveLocal.comparisonUnit) render(nm); }
      document.addEventListener("agn:location",function(){ setTimeout(follow,250); setTimeout(follow,1500); });
      document.addEventListener("agn:prob",function(){ if(liveLocal.comparisonUnit) render(liveLocal.comparisonUnit); });
      document.addEventListener("agn:sweep-done",function(){ if(liveLocal.comparisonUnit) render(liveLocal.comparisonUnit); });
      document.addEventListener("agn:livedata-rerender",function(){ if(liveLocal.comparisonUnit) render(liveLocal.comparisonUnit); });            
    })();
     
    document.addEventListener("agn:day",function(e){
      DAY=(e&&e.detail&&e.detail.day!=null)?(+e.detail.day||0):0; liveLocal.forecastDay=DAY;
      if(liveLocal.comparisonUnit) render(liveLocal.comparisonUnit);
    });
    try{ if(window.AGN&&AGN.day) DAY=AGN.day.get(); }catch(_){ DAY=0; }
    if(liveLocal.comparisonUnit) render(liveLocal.comparisonUnit);
     
    (function seed(){
      if(liveLocal.comparisonUnit) return;
      var nm=null;
      try{
        var ap=domain.activePoint();
        /* v91.17.283.19 · the tehsil the selected place lies in (by its point; its bundle's tehsil), never the first unit of the list */
        if(ap&&ap.lat!=null&&AGN.siteUnit){ var su=AGN.siteUnit(+ap.lat,+ap.lon); if(su&&su.key) nm=su.key; }
        if(!nm&&ap&&ap.lat!=null&&AGN.pointState){ var pl=AGN.pointState.placePeek(+ap.lat,+ap.lon); if(pl&&pl.tehsil) nm=pl.tehsil; }
        if(nm&&!geo.hasInput(nm)){ var parent=geo.districtOf(nm); if(parent) nm=parent; }
        if(nm&&!geo.hasInput(nm)&&!geo.memberTehsils(nm).length) nm=null;
      }catch(_){}
      if(!nm) return setTimeout(seed,700);
      liveLocal.comparisonUnit=nm; render(nm);
    })();
  }
  window.AGN=window.AGN||{};
  if(AGN.implementations) AGN.implementations.define('livedata',{
    refresh:function(){
      try{liveAdapter.refreshPins();}catch(_){}
      var selected=liveLocal.comparisonUnit||null;
      if(selected) try{render(selected);}catch(_){}
      try{var station=liveAdapter.stationById(liveAdapter.activeStationId());if(station)liveAdapter.recomputeStation(station);}catch(_){}
    },
    render:render,
    close:closePanel,
    getState:function(){return {comparisonUnit:liveLocal.comparisonUnit,forecastDay:liveLocal.forecastDay,cmipRequests:liveLocal.cmipRequests,cmipCacheKeys:Object.keys(cmip)};}
  },{source:'modules/live/45-agn-panels.js',owner:'livedata',moduleType:'isolated-section-implementation',dependencies:['data:contracts','adapter:liveLegacy','adapter:mapLegacy','data:geography','data:domain'],globalDependencies:[],compatibilityGlobals:[]});
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",function(){setTimeout(hook,2000);});
  else setTimeout(hook,2000);
})();
