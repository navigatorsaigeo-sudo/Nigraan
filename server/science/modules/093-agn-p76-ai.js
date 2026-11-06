


(function(G){'use strict';
  var D=G.document, AGN=G.AGN=G.AGN||{};
  var $=function(id){ return D.getElementById(id); };
  var esc=function(v){ return String(v==null?'':v).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var W0=['Normal','Low','Moderate','High','Severe'];
  var words=function(){ return (AGN.hz5&&AGN.hz5.words)||W0; };
  var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var fmtT=function(t){ var m=String(t||'').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/); if(!m) return String(t||'');
    var d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3])); return DOW[d.getUTCDay()]+' '+Number(m[3])+' '+MON[+m[2]-1]+' '+m[4]+':'+m[5]; };
  var sgn=function(v){ return (v>0?'+':v<0?'−':'±')+Math.abs(v).toFixed(1); };
  var LABEL={flood:'Flood',flood_pluvial:'Flood (rain)',flood_riverine:'River flood',heat:'Heat stress',cold:'Cold stress (UTCI)',wind:'Wind and gusts',drought:'Drought',glof:'Glacial lake outburst flood (GLOF)',rain_hz:'Heavy rain',landslide:'Landslide',seismic:'Earthquake',cyclone:'Cyclone',telco_wind:'Wind',telco_flood:'Flood',telco_heat:'Heat',telco_lightning:'Thunderstorm',ops:'Operations'};
  var PRED7=[['drought','Drought'],['rain_hz','Heavy rain'],['flood','Flood'],['heat','Heat stress'],['cold','Cold stress (UTCI)'],['wind','Wind and gusts'],['glof','Glacial lake outburst flood (GLOF)']];

   
  var STANDING={
    drought:'Drought is a slow index (rain and soil moisture over 30 to 90 days). It does not change hour to hour, so there is no lead-time forecast: the level holds for the next 72 h.',
    glof:'GLOF is a standing level from the mapped glacial lakes upstream. There is no lead-time forecast: the level holds for the next 72 h unless a lake signal is observed.',
    seismic:'Earthquake is a standing hazard zone. There is no lead-time forecast: it does not change with the weather.',
    cyclone:'Cyclone is a fixed map of the strongest cyclone winds of 1980-2025; no cyclone track feed is connected, so there is no lead-time forecast.'
  };
  AGN.p76=AGN.p76||{};
  AGN.p76.standing=function(hz){ return STANDING[hz]||null; };

  function withDay(d, fn){
    var A=AGN.day; if(!A||typeof A.get!=='function') return fn();
    var g=A.get, b=A.basis; A.get=function(){ return d; }; if(typeof b==='function') A.basis=function(){ return 'peak'; };
    try{ return fn(); } finally{ A.get=g; if(typeof b==='function') A.basis=b; }
  }
  function dayIdx(e, target){
    var a=String(e.time[e.nowIdx]||'').slice(0,10), b=String(e.time[target]||'').slice(0,10);
    var x=Date.parse(a+'T00:00:00Z'), y=Date.parse(b+'T00:00:00Z'); return (isFinite(x)&&isFinite(y))?Math.round((y-x)/864e5):0;
  }
  function sumBack(arr, end, n){ var s=0, k=0, mx=null; for(var i=Math.max(0,end-n+1);i<=end;i++){ var v=arr&&arr[i]; if(v!=null&&isFinite(v)){ s+=Number(v); k++; mx=(mx==null?Number(v):Math.max(mx,Number(v))); } } return k?{sum:Math.round(s*10)/10,max:mx,n:k}:null; }
  function leadInput(s, hazard, lead){
    var e=G.LIVE_HOURLY&&G.LIVE_HOURLY[s.id]; if(!e||!Array.isArray(e.time)||e.nowIdx==null) return null;
    var target=e.nowIdx+Math.round(lead); if(target<0||target>=e.time.length) return null;
    var fc=(typeof G.aiForecastConditionsAt==='function')?G.aiForecastConditionsAt(s.id, lead):null; if(!fc||fc.t==null) return null;
    var name=(typeof G.aiStationDistrict==='function')?G.aiStationDistrict(s):null; if(!name) return null;
    var d=dayIdx(e,target), base=null;
    try{ base=withDay(d,function(){ return (typeof G.__dayInp==='function')?G.__dayInp(name,hazard):null; }); }catch(_){ base=null; }
    if(!base){ try{ base=withDay(0,function(){ return (typeof G.__dayInp==='function')?G.__dayInp(name,hazard):null; }); }catch(_){ base=null; } }
    if(!base){ try{ var DI=G.DISTRICT_IN||{}; if(DI[name]) base=Object.assign({},DI[name]); }catch(_){} }
    var r6=sumBack(e.rain,target,6), r24=sumBack(e.rain,target,24);
     
    var _liq=(Array.isArray(e.rain)&&typeof G.hzLiquidMm==='function')?e.rain.map(function(v,i){ return G.hzLiquidMm(v, Array.isArray(e.snow)?e.snow[i]:null); }):null;
    var r6l=_liq?sumBack(_liq,target,6):null; if(r6l&&r6l.n!==6) r6l=null;
    var row=null; try{ row=(G.DISTRICT_IN||{})[name]||null; }catch(_){ row=null; }
    var inp=Object.assign({}, base||{}, {
      t:fc.t, feels:(fc.feels!=null?fc.feels:fc.t), hum:(fc.hum!=null?fc.hum:(base&&base.hum)), wind:(fc.wind!=null?fc.wind:null), gust:(fc.gust!=null?fc.gust:null),
      rain:(fc.rain!=null?fc.rain:null), snow:(fc.snow!=null?fc.snow:undefined), pressure:(fc.pressure!=null?fc.pressure:undefined),
      soilMoist:(fc.soilMoist!=null?fc.soilMoist:(base?base.soilMoist:undefined)),
       
      heatDryTemp:fc.t, heatApparentMax:(fc.feels!=null?fc.feels:null), heatWetBulbAirTemp:fc.t, heatWetBulbTemp:fc.t, heatMeanRh:(fc.hum!=null?fc.hum:null),
      heatWetBulbBasis:'the forecast hour at +'+lead+' h ('+String(e.time[target]).replace('T',' ')+')',
      rain6hDay:(r6l?r6l.sum:null), rainPeakDay:(r6?r6.max:null), rainTotalDay:(r24?r24.sum:null),
      uv:s.uv, aqi:s.aqi, weatherLive:true, forecastLive:true, fcSource:(base&&base.fcSource)||'station_hourly_live',
      forecastHorizonHours:lead, validFrom:e.time[target], validTo:e.time[target], timeBasis:'forecast hour', dayBasis:'forecast hour +'+lead+' h', dayIndex:d,
      gustBasisNote:'the forecast hour at +'+lead+' h',
       
      api:(base&&base.api!=null)?base.api:((row&&row.api!=null)?row.api:(s.apiIndex!=null?s.apiIndex:undefined)),
      tx90:(base&&base.tx90!=null)?base.tx90:(row?row.tx90:undefined)
    });
    if(d>0){ inp.tm3=undefined; inp.t95=undefined; inp.tm30=undefined; }
    return {inp:inp, name:name, day:d, e:e, target:target, fc:fc, r6:r6};
  }
  /* v91.17.283.24 · W1: in a browser the station's level is the served one (aiStationRisk reads AGN.engineLevels.result); this lead
     scoring runs in the server's engine host only */
  function leadRisk(s, hazard, lead, orig){
    if(STANDING[hazard]||!G.agnEngineHost||!G.agnEngineHost()) return orig(s,hazard,lead);
    var L=null; try{ L=leadInput(s,hazard,lead); }catch(_){ L=null; }
    if(!L) return orig(s,hazard,lead);
    var r=withDay(L.day,function(){ return G.hzScore(L.name, L.inp, hazard, 24, L.name); });
     
    try{ if(r&&Array.isArray(r.metricLabels)&&!r.noData){ var at='at +'+lead+' h';
      if(hazard==='flood'||hazard==='telco_flood'){ if(/^Rain intensity/.test(r.metricLabels[0]||'')) r.metricLabels[0]='Rain '+at; if(/^6h accumulation/.test(r.metricLabels[3]||'')) r.metricLabels[3]='6 h rain to +'+lead+' h'; }
    } }catch(_){}
    if(r){ r.forecastBasis='forecast_hour'; r.validTime=L.e.time[L.target]; r.forecastHorizonHours=lead; r.p76={day:L.day, hour:L.e.time[L.target], t:L.fc.t, rain:L.fc.rain, gust:L.fc.gust, hum:L.fc.hum}; }
    

    try{ var _md=(G.aiState&&G.aiState.mapDay!=null)?Number(G.aiState.mapDay):null, dd=(_md!=null&&isFinite(_md))?_md:L.day;
      var rd=withDay(dd,function(){ var di=(typeof G.hzDayInput==='function')?G.hzDayInput(L.name, hazard):null; return (di&&!di.__unavailable)?G.hzScore(L.name, di, hazard, (G.aiState&&G.aiState.lead)||24, L.name):null; });
      if(rd && !rd.noData && rd.score!=null){ var dt=new Date(Date.parse(String(L.e.time[L.e.nowIdx]).slice(0,10)+'T00:00:00Z')+dd*864e5);
        rd.forecastBasis='forecast_day_peak'; rd.peakDay=dd; rd.peakDate=dt.toISOString().slice(0,10); rd.peakFromMap=(_md!=null);
        rd.validTime=r?r.validTime:null; rd.forecastHorizonHours=lead; rd.p76=r?r.p76:null; rd.hourScore=r?r.score:null; return rd; } }catch(_){}
    return r;
  }
  function peakLabel(r, lead){ try{ var dt=new Date(r.peakDate+'T00:00:00Z'); var s=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getUTCDay()]+' '+dt.getUTCDate()+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getUTCMonth()];
      return 'peak of '+s+(r.peakFromMap?' (the day picked on the map)':' (the day at +'+lead+' h)')+', the Overview\u2019s day-peak rule'; }catch(_){ return 'the day\u2019s peak'; } }
  try{ AGN.p76=AGN.p76||{}; AGN.p76.peakLabel=peakLabel; }catch(_){}
   
  D.addEventListener('agn:time-selection',function(e){ try{ var d=e&&e.detail||{}; if(d.source!=='map-day-strip'||!G.aiState) return;
      var day=(AGN.day&&AGN.day.get)?Number(AGN.day.get())||0:0, want=Math.max(6,Number(d.leadHours)||0), opts=[6,12,24,48,72], best=opts[0];
      opts.forEach(function(o){ if(Math.abs(o-want)<Math.abs(best-want)) best=o; });
      G.aiState.lead=best; G.aiState.mapDay=day;
      D.querySelectorAll('#aiLeadSeg button').forEach(function(b){ b.classList.toggle('on', parseInt(b.dataset.lead,10)===best); });
      if(typeof G.aiRender==='function') G.aiRender(); }catch(_){} });
  D.addEventListener('click',function(e){ var b=e.target&&e.target.closest&&e.target.closest('#aiLeadSeg button'); if(b&&G.aiState) G.aiState.mapDay=null; },true);
  function wrapStationRisk(){
    var f=G.aiStationRisk; if(typeof f!=='function') return false; if(f.__p76) return true;
    var w=function(s,hazard,lead){ try{ return leadRisk(s,hazard,lead,f); }catch(e){ try{ console.warn('[AGN p76] lead',e&&e.message); }catch(_){} return f(s,hazard,lead); } };
    w.__p76=true; try{ G.aiStationRisk=w; }catch(_){ return false; }
    return G.aiStationRisk===w;
  }
  AGN.p76.leadRisk=function(hz,lead){ try{ var st=G.aiState; var s=st&&st.last&&st.last.s; return s?G.aiStationRisk(s,hz,lead):null; }catch(_){ return null; } };

   
  var served=Object.create(null);
  var pkey=function(a,o){ return Number(a).toFixed(3)+','+Number(o).toFixed(3); };
  function aiOf(basis){ return basis&&(basis.aiLocal||(basis.calibration&&basis.calibration.aiLocal))||null; }
   
  function corrAt(ai, isoLocal){
    var terms=(ai&&ai.terms)||[]; var m=String(isoLocal||'').match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/); if(!m) return null;
    var t=null; terms.forEach(function(x){ if(x.date===m[1]) t=x; }); if(!t||t.dayC==null||t.nightC==null) return null;
    var hU=(Number(m[2])+Number(m[3])/60-5+24)%24, w=hU<=9?hU/9:Math.max(0,(24-hU)/15);
    return Math.round((t.nightC+(t.dayC-t.nightC)*w)*10)/10;
  }
  function recordServed(u,j){
    var q=null; try{ q=new URL(u, location.origin).searchParams; }catch(_){ return; }
    var la=String(q.get('latitude')||'').split(','), lo=String(q.get('longitude')||'').split(',');
    (Array.isArray(j)?j:[j]).forEach(function(l,i){ if(!l||!l.agn_temperature_basis||la[i]==null) return;
      served[pkey(la[i],lo[i])]={at:Date.now(), basis:l.agn_temperature_basis, current:l.current||null, off:l.utc_offset_seconds}; });
    setTimeout(cardBadge,60);
  }
  AGN.p76.aiAt=function(lat,lon,isoLocal){ var r=served[pkey(lat,lon)]; var ai=r&&aiOf(r.basis); if(!ai||ai.applied===false) return null; var c=corrAt(ai,isoLocal); return {applied:true, c:c}; };
  function stationOfCard(){
    try{ var nm=(($('ccLoc')||{}).textContent||'').trim(); var S=(typeof STATIONS!=='undefined')?STATIONS:[];
      for(var i=0;i<S.length;i++) if(S[i].name===nm) return S[i];
      var a=G.aiState&&G.aiState.station; if(a&&a.name===nm) return a; }catch(_){}
    return null;
  }
  function cardBadge(){
    try{
      var old=$('ccAiLocal'); if(old) old.remove();
      var el=$('ccTemp'); if(!el) return; var b=$('p76CcAi');
      var s=stationOfCard(); var r=s?served[pkey(s.lat,s.lon)]:null; var ai=r&&aiOf(r.basis);
      if(!ai||ai.applied===false||!r.current||r.current.temperature_2m==null||Date.now()-r.at>40*60e3){ if(b) b.remove(); return; }
      var c=corrAt(ai, r.current.time);
      var tv=Math.round(Number(r.current.temperature_2m));
       
      if(!(G.AGN&&G.AGN.ccOwned&&G.AGN.ccOwned())&&String(el.textContent).trim()!==String(tv)){ el.__p76set=true; el.textContent=tv; }
      if(!b){ b=D.createElement('span'); b.id='p76CcAi'; b.className='p76-aibadge'; var host=el.parentNode; (host&&host.parentNode?host:el).insertAdjacentElement('afterend',b); }
      b.textContent='AI-corrected'+(c!=null&&Math.abs(c)>=0.05?' '+sgn(c)+' °C':'');
      b.title='The AI temperature correction (terrain and land cover) was applied to this forecast'+(c!=null?': '+sgn(c)+' °C at this hour':'')+'. Today: day '+(function(){ var t=null,d=String(r.current.time||'').slice(0,10); (ai.terms||[]).forEach(function(x){ if(x.date===d) t=x; }); return t?(sgn(t.dayC)+' °C, night '+sgn(t.nightC)+' °C'):'n/a'; })()+'.';
    }catch(_){}
  }
  AGN.p76.cardBadge=cardBadge;

   
  function fixCardUrl(u){
    try{
      if(!/api\.open-meteo\.com\/v1\/forecast\?/.test(u)||!/past_hours=12/.test(u)||!/forecast_hours=168/.test(u)) return u;
      var x=new URL(u); var q=x.searchParams; var h=q.get('hourly')||''; if(!/(^|,)temperature_2m(,|$)/.test(h)) return u;
      if(!/(^|,)cloud_cover(,|$)/.test(h)) q.set('hourly', h+',cloud_cover');
      if(q.get('models')==='best_match') q.delete('models');
      return x.toString();
    }catch(_){ return u; }
  }
  AGN.p76.fixCardUrl=fixCardUrl;

   
  var CHIPS=[['explain',/^\s*explain the current top risk and its main drivers\.?\s*$/i],['compare',/^\s*compare the selected location with another high-risk district\.?\s*$/i],['brief',/^\s*prepare a concise executive climate briefing\.?\s*$/i],['evidence',/^\s*what evidence is missing before an operational advisory\??\s*$/i]];
  function levelOf(hz,r){ try{ return (AGN.p75&&AGN.p75.level)?AGN.p75.level(hz,r):null; }catch(_){ return null; } }
  function pack(hz,r,extra){
    var L=levelOf(hz,r)||{nd:true};
    var o={hazard:hz, label:(LABEL[hz]||hz), level:(L.na||L.nd)?null:L.word, i:(L.i!=null?L.i:null), score:(L.score!=null?L.score:null), engine:L.engine||null, na:!!L.na, nd:!!L.nd, why:(L.why||null), standing:!!STANDING[hz]};
    try{ if(r&&Array.isArray(r.metricLabels)&&!L.na&&!L.nd) o.drivers=r.metricLabels.slice(0,4).map(function(lb,k){ return {label:String(lb||''), value:(r.drivers&&r.drivers[k]!=null)?String(r.drivers[k]):null, note:(r.notes&&r.notes[k])?String(r.notes[k]).slice(0,180):null}; }).filter(function(d){ return d.label&&d.label!=='—'&&d.label!=='—'; }); }catch(_){}
    if(extra) Object.assign(o,extra); return o;
  }
  function hazardsNow(){  var sel=$('aiHazardSelect'); var list=PRED7.map(function(x){ return x[0]; });
    try{ if(sel) [].forEach.call(sel.options,function(o){ if(list.indexOf(o.value)<0&&o.value!=='ops') list.push(o.value); }); }catch(_){}
    return list; }
  function predLevels(withTraj){
    var st=G.aiState; if(!st||!st.last||!st.last.s) return [];
    var s=st.last.s, lead=st.lead||24;
    return hazardsNow().map(function(hz){
      var r=null; try{ r=G.aiStationRisk(s,hz,lead); }catch(_){ r=null; }
      var ex={validTo:(r&&r.validTime)?fmtT(r.validTime)+' PKT':null};
      if(withTraj){ ex.trajectory=[6,12,24,48,72].map(function(l){ var q=null; try{ q=(l===lead)?r:G.aiStationRisk(s,hz,l); }catch(_){ q=null; } var L=levelOf(hz,q)||{}; return {lead:l, level:(L.na||L.nd)?null:L.word, score:(L.score!=null?L.score:null)}; }); }
      return pack(hz,r,ex);
    });
  }
  function tehsilLevels(key){
    var out=[]; var lead=(G.aiState&&G.aiState.lead)||24;
    hazardsNow().forEach(function(hz){ var r=null; try{ if(typeof G.aiDistrictRisk==='function') r=G.aiDistrictRisk(null,hz,lead,key); }catch(_){ r=null; } out.push(pack(hz,r)); });   /* W1: the issued level of the tehsil */
    return out;
  }
  function window72(){
    try{ var st=G.aiState, s=st&&st.last&&st.last.s; var e=s&&G.LIVE_HOURLY&&G.LIVE_HOURLY[s.id]; if(!e||e.nowIdx==null) return null;
      var a=e.nowIdx+1, b=Math.min(e.time.length-1,e.nowIdx+72), tx=null, tn=null, rn=0, rk=0, gx=null;
      for(var k=a;k<=b;k++){ var t=e.temp&&e.temp[k]; if(t!=null){ tx=tx==null?t:Math.max(tx,t); tn=tn==null?t:Math.min(tn,t); } var r=e.rain&&e.rain[k]; if(r!=null){ rn+=Number(r); rk++; } var g=e.gust&&e.gust[k]; if(g!=null) gx=gx==null?g:Math.max(gx,g); }
      var ai=AGN.p76.aiAt(s.lat,s.lon,e.time[e.nowIdx]);
      return {tmax:tx==null?null:Math.round(tx*10)/10, tmin:tn==null?null:Math.round(tn*10)/10, rain:rk?Math.round(rn*10)/10:null, gustMax:gx==null?null:Math.round(gx), to:fmtT(e.time[b])+' PKT', aiCorrected:!!ai};
    }catch(_){ return null; }
  }
  function nationalSweep(layers){
    try{ return (AGN.p75&&AGN.p75.national)?AGN.p75.national({layers:layers, lead:(G.aiState&&G.aiState.lead)||24}):null; }catch(_){ return null; }
  }
  function compareTarget(selKey, nat){
    var W=words(), best=null;
    Object.keys((nat&&nat.hazards)||{}).forEach(function(hz){ var h=nat.hazards[hz]; ((h&&h.worst)||[]).forEach(function(w,ix){ if(!w||w.tehsil===selKey) return; var i=W.indexOf(w.level); if(!best||i>best.i||(i===best.i&&ix<best.ix)) best={i:i, ix:ix, hz:hz, w:w}; }); });
    return best;
  }
  function intentContext(kind){
    var st=G.aiState||{}; var s=st.last&&st.last.s; if(!s) return null;
    var key=(typeof G.aiStationDistrict==='function')?G.aiStationDistrict(s):s.name;
    var ic={unit:key, place:s.name, lead:st.lead||24};
    var lv=predLevels(kind==='explain'); ic.levels=lv;
    var top=lv.filter(function(x){ return x.validTo; })[0]; if(top) ic.validTo=top.validTo;
    if(kind==='brief') ic.window72=window72();
    if(kind==='compare'||kind==='brief'){
      var layers=hazardsNow().filter(function(h){ return h!=='ops'; });
      var nat=nationalSweep(layers);
      if(nat&&nat.hazards){
        var W=words();
        ic.nationalTop={rows:Object.keys(nat.hazards).map(function(hz){ var h=nat.hazards[hz]; var hi=-1; W.forEach(function(w,i){ if(h.counts&&h.counts[w]>0) hi=i; }); var w0=(h.worst||[])[0];
          return hi<0?null:{hazard:hz, label:LABEL[hz]||hz, level:W[hi], tehsils:h.counts[W[hi]], worst:(w0&&w0.level===W[hi])?w0.tehsil:null, district:(w0&&w0.level===W[hi])?w0.district:null}; }).filter(Boolean)};
        if(kind==='compare'){
          ic.tehsil=tehsilLevels(key);
          var b=compareTarget(key,nat);
          if(b){ var f=null; try{ f=(G.PK_DISTRICTS&&G.PK_DISTRICTS.features||[]).find(function(x){ return x.properties&&x.properties.key===b.w.tehsil; }); }catch(_){}
            ic.compareWith={unit:b.w.tehsil, district:b.w.district||(f&&f.properties.district)||null, province:(f&&f.properties.province)||null, hazard:b.hz, level:b.w.level, levels:tehsilLevels(b.w.tehsil),
              basis:'Picked from the national sweep of '+Object.keys(nat.hazards).length+' hazards: the tehsil on the highest level, first in the engine’s own order within that level.'}; }
        }
      }
    }
    if(kind==='evidence'){
      var e=G.LIVE_HOURLY&&G.LIVE_HOURLY[s.id]; var conf=($('aiConfidence')||{}).textContent||'';
      var R=null; try{ R=(AGN.executiveReadiness)?AGN.executiveReadiness():null; }catch(_){ R=null; }
      ic.gaps={ensembleLive:/\d/.test(conf), hourlyLoaded:!!(e&&e.nowIdx!=null), aiCorrected:!!AGN.p76.aiAt(s.lat,s.lon,e&&e.time?e.time[e.nowIdx]:null),
        readiness:R?{scenario:!!R.scenario, ai:!!R.ai, spatial:!!R.spatial, horizon:!!R.horizon, issuable:!!R.issuable}:null, readinessWhy:R&&R.why?String(R.why).slice(0,280):null};
      ic.tehsil=tehsilLevels(key);
    }
    return ic;
  }
  AGN.p76.intentContext=intentContext;
  function augmentChat(body){
    try{ var j=JSON.parse(body); if(!j||typeof j.prompt!=='string') return body; var k=null; CHIPS.forEach(function(c){ if(!k&&c[1].test(j.prompt)) k=c[0]; }); if(!k) return body;
      j.intent=k; var ic=intentContext(k); if(ic) j.intentContext=ic; return JSON.stringify(j); }catch(_){ return body; }
  }
  function wrapFetch(){
    var A=AGN.api; if(!A||typeof A.fetch!=='function') return false; if(A.fetch.__p76) return true;
    var F=A.fetch;
    var w=function(input, init){
      var args=[].slice.call(arguments);
      try{
        if(typeof input==='string'){ var u2=fixCardUrl(input); if(u2!==input){ args[0]=u2; input=u2; } }
        var u=String((input&&input.url)||input||'');
        if(/\/api\/ai\/chat(\?|$)/.test(u)&&init&&typeof init.body==='string'&&String(init.method||'').toUpperCase()==='POST'){ args[1]=Object.assign({},init,{body:augmentChat(init.body)}); }
      }catch(_){}
      var p=F.apply(this,args);
      try{ var uu=String((args[0]&&args[0].url)||args[0]||''); if(/\/v1\/forecast\?/.test(uu)&&/[?&]hourly=/.test(uu)&&p&&p.then){ p.then(function(r){ try{ if(r&&r.clone) r.clone().json().then(function(j){ recordServed(uu,j); }).catch(function(){}); }catch(_){} }).catch(function(){}); } }catch(_){}
      return p; };
    w.__p76=true; w.__p75=true; A.fetch=w; return true;
  }

   
  function riverWord(){
    try{ for(var n=1;n<=4;n++){ var lb=$('aiM'+n+'Label'), v=$('aiM'+n), nt=$('aiM'+n+'Note'); if(!lb||!/Riverine pathway/i.test(lb.textContent)) continue;
      var val=Number(String(v.textContent).trim()); var parts=String(nt.textContent||'').split(' · ').map(function(x){ return x.trim(); }).filter(Boolean);
      if(!parts.length||!/^[A-Za-z][A-Za-z -]*$/.test(parts[0])||!isFinite(val)) continue;
      var b=(typeof G.agnBandOf==='function')?G.agnBandOf(val):null; var wd=b&&b.index!=null?words()[b.index]:null;
      var pct=parts.filter(function(p){ return /bankfull/.test(p); })[0]||null, gauge=parts.filter(function(p){ return !/bankfull/.test(p)&&p!==parts[0]; })[0]||null;
      nt.textContent=(pct?'river at '+pct.replace(/% of bankfull/,'% of bankfull'):'river reading')+(gauge?' ('+gauge+')':'')+(wd?' · '+wd+' on the flood scale':''); }
      var td=$('aiTopDriver'); if(td&&/^Riverine · /.test(td.textContent)){ td.textContent='River'; }
    }catch(_){}
  }
  function leadMsg(hz){
    var seg=$('aiLeadSeg'); if(!seg) return; var m=$('p76LeadMsg');
    var txt=STANDING[hz]||'';
    if(!txt){ if(m) m.remove(); return; }
    if(!m){ m=D.createElement('div'); m.id='p76LeadMsg'; m.setAttribute('role','note'); seg.insertAdjacentElement('afterend',m); }
    m.textContent=txt;
  }
  function leadButtons(hz){
    var off=!!STANDING[hz];
    [].forEach.call(D.querySelectorAll('#aiLeadSeg button'),function(b){
      b.disabled=off; b.classList.toggle('p76-off',off); b.setAttribute('aria-disabled',off?'true':'false');
      if(off) b.title='No lead-time forecast for this hazard'; else if(/lead-time forecast|Lead-specific backend/.test(b.title||'')) b.removeAttribute('title'); });
  }
  function tidyTiles(L){
    try{
      var band=$('aiBand'); if(band) band.classList.toggle('p76-plain', !!(L&&(L.na||L.nd)));
      if(L&&L.na){ var rb=$('aiRiskScore'); if(rb){ rb.textContent='n/a'; rb.classList.add('p75-word'); } }
      var any=false;
      [1,2,3,4].forEach(function(n){ var v=$('aiM'+n), lb=$('aiM'+n+'Label'); var card=v&&v.closest('.ai-metric'); if(!card) return;
        var empty=(L&&L.na)||((String(v.textContent).trim()==='—'||String(v.textContent).trim()==='')&&(!lb||String(lb.textContent).trim()==='—'||String(lb.textContent).trim()===''));
        card.classList.toggle('p76-hide',!!empty); if(!empty) any=true; });
      var grid=D.querySelector('#aiPredSection .ai-metrics'); if(grid) grid.classList.toggle('p76-hide',!any);
      var cf=$('aiConfidence'), cq=cf&&cf.closest('.ai-q'); if(cq) cq.classList.toggle('p76-hide', !/\d/.test(cf.textContent||''));
      var td=$('aiTopDriver'), tq=td&&td.closest('.ai-q'); if(tq) tq.classList.toggle('p76-hide', /^\s*(—|—|Not scored.*)?\s*$/.test(td.textContent||'')||!!(L&&L.na));
    }catch(_){}
  }
  function leadLine(hz, r, lead){
    try{
      var note=$('aiBandNote'); if(!note||STANDING[hz]) return;
      var ll=note.querySelector('.p75-lead'); if(!ll){ ll=D.createElement('span'); ll.className='p75-lead'; note.appendChild(ll); }
      var P=r&&r.p76; var s=G.aiState&&G.aiState.last&&G.aiState.last.s; var e=s&&G.LIVE_HOURLY&&G.LIVE_HOURLY[s.id];
      if(!P||!e) return;
      var bits=[]; if(P.t!=null) bits.push(Math.round(P.t*10)/10+' °C'); if(P.rain!=null) bits.push(P.rain>0?(Math.round(P.rain*10)/10+' mm/h rain'):'no rain'); if(P.gust!=null) bits.push('gusts '+Math.round(P.gust)+' km/h');
      var a=e.nowIdx+1, b=Math.min(e.time.length-1,e.nowIdx+lead), tx=null, rn=0, rk=0; for(var k=a;k<=b;k++){ var t=e.temp&&e.temp[k]; if(t!=null) tx=tx==null?t:Math.max(tx,t); var q=e.rain&&e.rain[k]; if(q!=null){ rn+=Number(q); rk++; } }
      var ai=AGN.p76.aiAt(s.lat,s.lon,P.hour);
      ll.textContent='At +'+lead+' h ('+fmtT(P.hour)+' PKT): '+bits.join(', ')+'. Over the next '+lead+' h: '+(tx!=null?'up to '+Math.round(tx*10)/10+' °C':'')+(rk?(tx!=null?', ':'')+(rn>0?Math.round(rn*10)/10+' mm rain':'no rain'):'')+(r&&r.forecastBasis==='forecast_day_peak'?'. The level is the '+peakLabel(r,lead)+'; the readings above are the hour at +'+lead+' h.':'. The score is for the hour at +'+lead+' h.');
      var old=note.querySelector('.p76-aibadge'); if(old) old.remove();
      if(ai){ var bd=D.createElement('span'); bd.className='p76-aibadge'; bd.textContent='AI-corrected'+(ai.c!=null&&Math.abs(ai.c)>=0.05?' '+sgn(ai.c)+' °C':''); bd.title='The temperatures at this place come from the AI-corrected forecast (terrain and land cover).'; ll.appendChild(bd); }
    }catch(_){}
  }
  function post76(){
    var st=G.aiState; if(!st||!st.last) return;
    var hz=st.hazard, r=st.last.r, L=st.lastLevel||levelOf(hz,r);
    leadButtons(hz); leadMsg(hz); riverWord(); tidyTiles(L); leadLine(hz,r,st.lead);
    if(STANDING[hz]){ [].forEach.call(D.querySelectorAll('#aiBandNote .p75-lead'),function(x){ x.remove(); }); }
    if(STANDING[hz]){ var lab=$('aiLeadLabel'); if(lab) lab.textContent='Standing level'; var mo=$('aiMode'); if(mo) mo.textContent='standing level · no lead time'; }
  }
  /* v91.17.283.20 · B7: the v76 predictions are a step of the one aiRender (no wrapper); they follow the p75 step */
  function wrapRender(){ if(!(G.AGN&&G.AGN.aiP75)) return false; if(G.AGN.aiP76) return true; G.AGN.aiP76={ post:post76 }; try{ post76(); }catch(_){} return true; }

   
  var ST=null, ST_FAIL=false;
  function modelsCard(){
    var nav=$('aiWorkspaceTabs'); if(!nav) return false; var card=$('agnAiModelsTop');
    if(!card){ card=D.createElement('section'); card.id='agnAiModelsTop'; card.className='agn-op-only'; card.setAttribute('aria-labelledby','agnAiModelsTopH'); card.innerHTML='<h3 id="agnAiModelsTopH">NIGRAAN AI models</h3><p class="p76-sub">Loading what runs in this dashboard…</p>'; nav.parentNode.insertBefore(card, nav); }
    var old=$('agnAiModels'); if(old) old.remove();
    if(!ST){ if(ST_FAIL){ var sb=card.querySelector('.p76-sub'); if(sb) sb.textContent='What runs in this dashboard is not available right now (the local server did not answer).'; } return true; }
    var M=ST.models||{}, T=M.temperature, A=M.analyst, li=[];
    if(T){
      var H=T.heldOut||{}, pair=function(p){ return p&&p[0]!=null&&p[1]!=null?(p[0].toFixed(2)+' → '+p[1].toFixed(2)+' °C'):null; };
      var ho=[]; var m=H.mountains||{}, pl=H.plains||{}; if(pair(m.tmax)) ho.push('mountains: daily max '+pair(m.tmax)+', min '+pair(m.tmin)); if(pair(pl.tmax)) ho.push('plains: max '+pair(pl.tmax)+', min '+pair(pl.tmin));
      li.push('<li><b>AI temperature correction</b>'+(T.live?'<span class="p76-live">live</span>':'<span class="p76-off">not live</span>')+' — '+esc(T.does||'corrects the forecast temperature for local terrain and land cover')+'. '+esc(T.where?T.where.charAt(0).toUpperCase()+T.where.slice(1):'')+'. '+esc(T.badge?T.badge.charAt(0).toUpperCase()+T.badge.slice(1):'')+'.'
        +(ho.length?'<span class="p76-op agn-op-only">Operator: held-out test on stations the model never saw — '+esc(ho.join('; '))+'.</span>':'')+'</li>');
    }
    if(A){ li.push('<li><b>AI Analyst</b>'+(ST.mode==='llm'?'<span class="p76-live">language model</span>':'<span class="p76-off">data look-up</span>')+' — '+esc(A.runs?A.runs.charAt(0).toUpperCase()+A.runs.slice(1):'')+'.'
        +(ST.mode==='llm'&&A.model?'<span class="p76-op agn-op-only">Operator: model '+esc(A.model)+(A.reachable===false?' (not answering)':'')+'.</span>':'')
        +(ST.mode!=='llm'?'<span class="p76-op agn-op-only">Operator: open questions need a model key in nigraan-local\\ai.key.</span>':'')+'</li>'); }
    li.push('<li><b>Hazard levels</b><span class="p76-live">served</span> — every level an answer names is the one the server issued for the tehsil (its hazard engine on the corrected forecast); a language model, where one runs, writes only the words.</li>');
    card.innerHTML='<h3 id="agnAiModelsTopH">NIGRAAN AI models</h3><p class="p76-sub">What runs in this dashboard, on every AI Decision pane.</p><ul>'+li.join('')+'</ul>';
    return true;
  }
  function loadStatus(n){
    n=n||0;
    var again=function(){ if(n<5) setTimeout(function(){ loadStatus(n+1); },5000); else { ST_FAIL=true; modelsCard(); } };
    fetch(location.origin+'/api/ai/status',{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).then(function(j){ if(j){ ST=j; ST_FAIL=false; modelsCard(); plainStrip(); } else again(); })
      .catch(again);
  }
   
  var SAFE='The assistant does not issue warnings. Every number and level in an answer comes from NIGRAAN’s data and is written by code; a language model, where one runs, writes only the words. Decisions need an authorised person.';
  function plainStrip(){
    try{
      var m=$('agnAiExecMode'); if(m&&!m.classList.contains('agn-op-only')) m.classList.add('agn-op-only');
      var fw=$('agnAiFirewallLine'); if(fw&&!fw.classList.contains('agn-op-only')) fw.classList.add('agn-op-only');
      var st=$('nigraanLlmStatus'); if(st){ var want='<span></span>'+(ST&&ST.mode==='llm'?'Language model + NIGRAAN data':'Answers from NIGRAAN data'); if(st.innerHTML!==want) st.innerHTML=want; }
      var sb=D.querySelector('#nigraanLlmSection .llm-safety-body'); if(sb&&sb.textContent!==SAFE) sb.textContent=SAFE;
      var sm=D.querySelector('#nigraanLlmSection .llm-safety summary'); if(sm&&sm.textContent!=='How the AI Analyst answers') sm.textContent='How the AI Analyst answers';
    }catch(_){}
  }

   
   

  function boot(n){
    var a=wrapStationRisk(), b=wrapRender(), c=wrapFetch(), d=modelsCard(); plainStrip();
    if(n===0){ loadStatus(); try{ if(G.aiState&&G.aiState.last&&typeof G.aiRender==='function') G.aiRender(); }catch(_){} }
    if(!(a&&b&&c&&d)&&n<80) setTimeout(function(){ boot(n+1); },500);
    else if(a&&b){ try{ if(typeof G.aiRender==='function') G.aiRender(); }catch(_){} }
  }
  if(D.readyState==='loading') D.addEventListener('DOMContentLoaded',function(){ boot(0); }); else boot(0);
   
  setTimeout(plainStrip,3500); setTimeout(plainStrip,8000); setTimeout(function(){ modelsCard(); plainStrip(); },12000);
  try{ var mo=new MutationObserver(function(){ var s=$('nigraanLlmStatus'); if(s&&/connector configured|Reasoning model:|retrieval/i.test(s.textContent)) plainStrip(); });
    var s0=$('nigraanLlmStatus'); if(s0) mo.observe(s0,{childList:true,characterData:true,subtree:true}); }catch(_){}
  D.addEventListener('agn:location',function(){ setTimeout(cardBadge,400); });
  try{ var cc=$('ccTemp'); if(cc) new MutationObserver(function(){ if(cc.__p76set){ cc.__p76set=false; return; } setTimeout(cardBadge,30); }).observe(cc,{childList:true,characterData:true,subtree:true}); }catch(_){}
})(window);
