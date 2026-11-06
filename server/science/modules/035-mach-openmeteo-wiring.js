


(function(){
  'use strict';
  function activeStationId(){
    try{ return (typeof selectedId !== 'undefined' && selectedId) ? selectedId : null; }
    catch(_){ return null; }
  }
  window.activeStationId=activeStationId;   
  function pakistanDate(offset=0){
    const d=new Date(); d.setDate(d.getDate()+offset);
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
    const v=t=>parts.find(x=>x.type===t)?.value;
    return `${v('year')}-${v('month')}-${v('day')}`;
  }
  function pakistanHour(){
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Karachi',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
    return Number(parts.find(x=>x.type==='hour')?.value||0);
  }
  window.MACH_TIME=Object.freeze({day:pakistanDate,hour:pakistanHour,timezone:'Asia/Karachi'});
  const OM={
    forecast:'https://api.open-meteo.com/v1/forecast',
    archive:'https://archive-api.open-meteo.com/v1/archive',
    air:'https://air-quality-api.open-meteo.com/v1/air-quality',
    timeoutMs:18000,
    districtCacheKey:'mach:om:district-features:v3',
    stationCacheKey:'mach:om:station-history:v3',
    cacheMinutes:20
  };
  window.MACH_OPEN_METEO=Object.freeze({
    forecastEndpoint:OM.forecast, archiveEndpoint:OM.archive, airQualityEndpoint:OM.air,
    commercialNote:'Do not add an API key to this browser file. Use an AGN backend proxy for commercial production.'
  });

  function n(v){return (v!==null&&v!==undefined&&Number.isFinite(Number(v)))?Number(v):null;}
  function fmt(v,d=0,unit=''){return n(v)===null?'—':Number(v).toFixed(d)+unit;}
  function localDay(offset){return pakistanDate(offset);}
  function hourlyValue(resp,field){
    const h=resp&&resp.hourly, c=resp&&resp.current; if(!h||!Array.isArray(h[field]))return null;
    const times=Array.isArray(h.time)?h.time:[]; let i=(c&&c.time)?times.indexOf(c.time):-1;
    if(i<0&&c&&c.time&&times.length){i=times.findIndex(t=>t>=c.time);}
    if(i<0)i=h[field].findIndex(v=>v!=null);
    return i>=0?n(h[field][i]):null;
  }
  async function fetchJSON(url){
    const ctl=typeof AbortController==='undefined'?null:new AbortController();
    const timer=ctl?setTimeout(()=>ctl.abort(),OM.timeoutMs):null;
    try{const r=await AGN.api.fetch(url,{cache:'no-store',signal:ctl&&ctl.signal});if(!r.ok)throw new Error('HTTP '+r.status);return await r.json();}
    finally{if(timer)clearTimeout(timer);}
  }
  function getCache(key,minutes){try{const v=JSON.parse(localStorage.getItem(key)||'null');return v&&v.at&&Date.now()-v.at<minutes*60000?v:null;}catch(_){return null;}}
  function setCache(key,payload){try{localStorage.setItem(key,JSON.stringify({at:Date.now(),payload}));}catch(_){}}
  function featureObject(resp){
    const c=resp&&resp.current||{};
    return {
      time:c.time||null,
      pressureMsl:n(c.pressure_msl)||hourlyValue(resp,'pressure_msl'),
      surfacePressure:n(c.surface_pressure)||hourlyValue(resp,'surface_pressure'),
      cloudCover:(n(c.cloud_cover)!=null?n(c.cloud_cover):hourlyValue(resp,'cloud_cover')),
      soilMoist:n(hourlyValue(resp,'soil_moisture_9_to_27cm')),
      vpd:n(hourlyValue(resp,'vapour_pressure_deficit')),
      et0:n(hourlyValue(resp,'et0_fao_evapotranspiration')),
      shortwave:n(hourlyValue(resp,'shortwave_radiation')),
      /* v91.17.283.10: the provider's best_match takes pressure levels from ICON global (ECMWF IFS 9 km has none); a level at or below
         the surface pressure is under the ground at this place (northern valleys: 850 hPa is about 1,500 m) and is not shown */
      t850:(function(){ var sp=n(c.surface_pressure)!=null?n(c.surface_pressure):hourlyValue(resp,'surface_pressure'); return (sp!=null&&sp<=850)?null:n(hourlyValue(resp,'temperature_850hPa')); })(),
      wind850:(function(){ var sp=n(c.surface_pressure)!=null?n(c.surface_pressure):hourlyValue(resp,'surface_pressure'); return (sp!=null&&sp<=850)?null:n(hourlyValue(resp,'wind_speed_850hPa')); })(),
      t850Masked:(function(){ var sp=n(c.surface_pressure)!=null?n(c.surface_pressure):hourlyValue(resp,'surface_pressure'); return (sp!=null&&sp<=850)?('850 hPa is below the ground here (surface pressure '+Math.round(sp)+' hPa)'):null; })(),
      upperAirSource:'ICON global 13 km (the forecast provider fills pressure levels from ICON; ECMWF IFS 9 km has none)',
      source:'Model forecast',
      modelled:true
    };
  }
  

  const HOURLY_TOPUP = 'soil_moisture_9_to_27cm,vapour_pressure_deficit,'
                     + 'et0_fao_evapotranspiration,shortwave_radiation,'
                     + 'temperature_850hPa,wind_speed_850hPa';
  const _topupTried = Object.create(null);
  async function topUpStationHourly(st){
    if(!st || !st.omFeatures) return false;
    const f = st.omFeatures;
    const need = ['soilMoist','vpd','et0','shortwave','t850'].some(k => f[k] == null && !(k === 't850' && f.t850Masked));
    if(!need) return false;
    

    const key = st.id || (st.lat + ',' + st.lon);
    st.__agnTopAttempts = (st.__agnTopAttempts || 0) + 1;
    const _settled = !!st.__agnTopped || st.__agnTopAttempts > 3;
    if(_topupTried[key] && Date.now() - _topupTried[key] < (_settled ? 5*60000 : 15000)) return false;
    _topupTried[key] = Date.now();
    /* v91.17.283.19 · a station's features are read from its place bundle when it is the selected place (GET /api/point, once): the land part
       (soil, VPD, ET0) and the record's hour (pressure, cloud, sunshine); another station asks nothing */
    try{
      const P = await agnPS(); const ap = window.AGN && AGN.data && AGN.data.activePoint ? AGN.data.activePoint() : null;
      if(!P || !ap || P.key(ap.lat, ap.lon) !== P.key(st.lat, st.lon)) return false;
      const B = await P.bundle(st.lat, st.lon); if(!B || !B.ok) return false;
      const LP = P.partOf(B, 'land') || {}, Hh = LP.hourly || {}, nowH = String((B.now && B.now.time) || '').slice(0, 13), k0 = (Hh.time || []).findIndex(function(t){ return String(t).slice(0, 13) === nowH; });
      const hv = function(n){ var a = Hh[n]; return (k0 >= 0 && a && a[k0] != null) ? a[k0] : null; }, nw = B.now || {};
      const add = { time: nw.time || null, pressureMsl: null, surfacePressure: nw.pressureHpa != null ? nw.pressureHpa : null, cloudCover: nw.cloudPct != null ? nw.cloudPct : null, soilMoist: hv('soil_moisture_9_to_27cm'), vpd: hv('vapour_pressure_deficit'), et0: hv('et0_fao_evapotranspiration'), shortwave: nw.swRad != null ? nw.swRad : null, t850: null, wind850: null, source: 'Model forecast', modelled: true };
       
      ['pressureMsl','soilMoist','vpd','et0','shortwave','t850','wind850'].forEach(function(k){
        if(f[k] == null && add[k] != null) f[k] = add[k];
      });
      if(add.t850Masked && f.t850 == null) f.t850Masked = add.t850Masked;
      if(f.time == null && add.time != null) f.time = add.time;
      if(f.soilMoist != null || f.vpd != null || f.t850 != null) st.__agnTopped = true;
      if(st.soilMoist == null && f.soilMoist != null) st.soilMoist = f.soilMoist;
      if(st.shortwave == null && f.shortwave != null) st.shortwave = f.shortwave;
      try{ if(typeof window.recomputeStation === 'function') window.recomputeStation(st); }catch(_){}
      return true;
    }catch(e){
      

      try{ console.warn('[AGN] hourly top-up failed for ' + (st.name||key) + ': ' + (e && e.message)); }catch(_){}
      return false;
    }
  }
  try{ window.agnTopUpStationHourly = topUpStationHourly; }catch(_){}

  function renderFeaturePanel(){
    const st=(window.STATIONS||[]).find(s=>s.id===activeStationId())||window.STATIONS&&window.STATIONS[0];
    const f=st&&st.omFeatures;
    const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    if(!st)return;
    set('omFeatureCity',st.name);
    if(!f){
      
      set('omFeatureMeta','Loading the modelled inputs for this place…');
      if(!renderFeaturePanel.__healing && typeof window.fetchLiveStations==='function'){
        renderFeaturePanel.__healing=true;
        Promise.resolve(window.fetchLiveStations()).then(()=>{
          renderFeaturePanel.__healing=false;
          const st2=(window.STATIONS||[]).find(s=>s.id===activeStationId())||(window.STATIONS&&window.STATIONS[0]);
          if(st2&&st2.omFeatures) renderFeaturePanel();
          else { set('omFeatureMeta','Live feature feed unavailable. Existing display values are retained and no synthetic feature is substituted.');
                 ['omPressure','omT850','omSoil','omVpd','omSolar'].forEach(id=>set(id,'—')); }
        }).catch(()=>{ renderFeaturePanel.__healing=false;
          set('omFeatureMeta','Live feature feed unavailable. Existing display values are retained and no synthetic feature is substituted.');
          ['omPressure','omT850','omSoil','omVpd','omSolar'].forEach(id=>set(id,'—')); });
      }
      return;
    }
    

    if(!renderFeaturePanel.__topping){
      const _needs=['soilMoist','vpd','et0','shortwave','t850'].some(k=>f[k]==null);
      if(_needs){
        renderFeaturePanel.__topping=true;
        Promise.resolve(topUpStationHourly(st)).then(function(changed){
          renderFeaturePanel.__topping=false;
          if(changed){ renderFeaturePanel(); return; }
          

          if(!st.__agnTopped && (st.__agnTopAttempts||0) <= 3){
            setTimeout(function(){
              try{ Promise.resolve(topUpStationHourly(st)).then(function(c){ if(c) renderFeaturePanel(); }).catch(function(){}); }catch(_){}
            }, 16000);
          }
        }).catch(function(){ renderFeaturePanel.__topping=false; });
      }
    }
    set('omFeatureMeta',`${f.source||'Model forecast'} · modelled input at this place · valid ${f.time||'current hour'}`);
    set('omPressure',fmt(f.pressureMsl,0,' hPa'));
    set('omPressureSub',f.surfacePressure!=null?`surface ${fmt(f.surfacePressure,0,' hPa')} · not an anomaly`:'mean sea level pressure · not an anomaly');
    set('omT850',f.t850Masked?'below ground':fmt(f.t850,1,'°C'));
    set('omT850Sub',f.t850Masked?f.t850Masked:(f.wind850!=null?`850 hPa wind ${fmt(f.wind850,0,' km/h')} · ICON 13 km`:'warm-air mass context · ICON 13 km · not an anomaly'));
    

    var _du=null;
    try{
      var _dn=(window.STATION_DISTRICT&&STATION_DISTRICT[st.id]&&STATION_DISTRICT[st.id].district)||st.name;
      var _DI=window.DISTRICT_IN||{};
      _du=_DI[_dn]||null;
      if(!_du && window.PK_KEY_TO_DISTRICT){
        for(var _k in _DI){ if(PK_KEY_TO_DISTRICT[_k]===_dn){ _du=_DI[_k]; break; } }
      }
    }catch(_){}
    var _pick=function(a,b){ return (a!=null&&isFinite(a))?{v:a,own:true}:((b!=null&&isFinite(b))?{v:b,own:false}:null); };
    var _dv=(_du&&_du.derived)||{};
    var _soil=_pick(f.soilMoist, _du&&(_du.soilMoist!=null?_du.soilMoist:_dv.soilMoist)),
        _vpd =_pick(f.vpd,       _du&&(_du.vpd!=null?_du.vpd:_dv.vpd)),
        _et0 =_pick(f.et0,       _du&&(_du.et0!=null?_du.et0:_dv.et0));
    set('omSoil', _soil==null?'—':`${Math.round(_soil.v*100)}% v/v`);
    set('omSoilSub', _soil==null ? '9–27 cm modelled layer · no value from either source'
        : (_soil.own ? '9–27 cm modelled layer · not field measurement'
                     : 'modelled layer · unit value, not this point'));
    set('omVpd', _vpd==null?'—':`${fmt(_vpd.v,2,' kPa')}`);
    set('omVpdSub', _et0==null ? 'VPD crop-atmosphere demand'
        : (`ET₀ ${fmt(_et0.v,2,' mm/h')}` + ((_vpd&&!_vpd.own)||!_et0.own ? ' · unit value' : '')));
    set('omSolar',fmt(f.shortwave,0,' W/m²'));
    set('omSolarSub',f.cloudCover==null?'surface heat context':`cloud cover ${fmt(f.cloudCover,0,'%')}`);
  }

  
  /* v91.17.283.12: the second fetchLiveStations (a provider request over the first one) is retired; the page has one, reading the point state */

  
  async function fetchStationAQI(){
    /* v91.17.283.12 · the server AQI of each city (agnSmogMany: /api/smog/units, one request); no composition-forecast request */
    const stations=window.STATIONS||[]; if(!stations.length)return false; let updated=0;
    let V=[]; try{ V=await window.agnSmogMany(stations); }catch(_){ V=[]; }
    await Promise.all(stations.map(async (s,n)=>{ const v=V[n]||null;
      s.aqi=v?v.aqi:null; s.pm25=v?v.pm25:null; s.pm10=v?v.pm10:null; s.aqiBasis=v?v.basis:'not assessed'; s.airSource='NIGRAAN air quality (US EPA 2024, NowCast)'; if(v&&v.aqi!=null){ s.aqiLive=true; updated++; } }));
    if(updated&&typeof window.selectCity==='function'){const prior=window.__userAction;window.__userAction=false;window.selectCity(activeStationId()||stations[0].id,false);window.__userAction=prior;}
    return updated>0;
  }

  
  const history={data:{},loading:{}};
  function histKey(st){return st.id||`${st.lat.toFixed(3)},${st.lon.toFixed(3)}`;}
  function historyMap(st){return history.data[histKey(st)]||null;}
  async function loadHistory(st){
    const key=histKey(st); if(history.data[key])return history.data[key]; if(history.loading[key])return history.loading[key];
    history.loading[key]=(async()=>{
      const end=localDay(-1),start=localDay(-31);
      const hourly='temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,wind_gusts_10m,precipitation,weather_code,pressure_msl,surface_pressure,cloud_cover,vapour_pressure_deficit,et0_fao_evapotranspiration,soil_moisture_7_to_28cm';
      const url=`${OM.archive}?latitude=${st.lat}&longitude=${st.lon}&start_date=${start}&end_date=${end}&hourly=${hourly}&timezone=auto`;
      const j=await fetchJSON(url),h=j&&j.hourly;if(!h||!Array.isArray(h.time))throw new Error('Historical response missing hourly values');
      const byDay={};const targetHour=pakistanHour();
      for(let i=0;i<h.time.length;i++){
        const stamp=h.time[i],day=stamp.slice(0,10),hour=Number(stamp.slice(11,13));
        const t=n(h.temperature_2m&&h.temperature_2m[i]);if(t===null)continue;
        const code=n(h.weather_code&&h.weather_code[i]);const wx=(code!==null&&typeof window.conditionFromCode==='function')?window.conditionFromCode(code,(h.precipitation_probability&&h.precipitation_probability[i]),(h.precipitation&&h.precipitation[i])):[st.cond,st.em];
        const row={h:hour,t,hum:n(h.relative_humidity_2m&&h.relative_humidity_2m[i]),feels:n(h.apparent_temperature&&h.apparent_temperature[i]),wind:n(h.wind_speed_10m&&h.wind_speed_10m[i]),gust:n(h.wind_gusts_10m&&h.wind_gusts_10m[i]),rain:n(h.precipitation&&h.precipitation[i]),em:wx[1],cond:wx[0],pp:n(h.precipitation&&h.precipitation[i])||0,pressureMsl:n(h.pressure_msl&&h.pressure_msl[i]),surfacePressure:n(h.surface_pressure&&h.surface_pressure[i]),cloud:n(h.cloud_cover&&h.cloud_cover[i]),vpd:n(h.vapour_pressure_deficit&&h.vapour_pressure_deficit[i]),et0:n(h.et0_fao_evapotranspiration&&h.et0_fao_evapotranspiration[i]),soilMoist:n(h.soil_moisture_7_to_28cm&&h.soil_moisture_7_to_28cm[i])};
        (byDay[day]||(byDay[day]=[])).push(row);
      }
      Object.values(byDay).forEach(rows=>rows.sort((a,b)=>a.h-b.h));
      history.data[key]=byDay;return byDay;
    })().finally(()=>{delete history.loading[key];});
    return history.loading[key];
  }
  window.MACH_HISTORY={
    load:loadHistory,
    getSnapshot(st,offset){const rows=historyMap(st)&&historyMap(st)[localDay(offset)];if(!rows||!rows.length)return null;const th=pakistanHour();const row=rows.reduce((best,r)=>Math.abs(r.h-th)<Math.abs(best.h-th)?r:best,rows[0]);return {t:Math.round(row.t),hum:Math.round(row.hum??st.hum),wind:Math.round(row.wind??st.wind),gust:Math.round(row.gust??st.gust),feels:Math.round(row.feels??row.t),rain:row.rain??0,cond:row.cond||st.cond,em:row.em||st.em,sev:typeof window.sevFromTemp==='function'?window.sevFromTemp(row.t):st.sev,omFeatures:{pressureMsl:row.pressureMsl,surfacePressure:row.surfacePressure,cloudCover:row.cloud,soilMoist:row.soilMoist,vpd:row.vpd,et0:row.et0,time:localDay(offset)+'T'+String(row.h).padStart(2,'0')+':00',source:'gridded global reanalysis',modelled:true}};},
    getHourly(st,offset){return (historyMap(st)&&historyMap(st)[localDay(offset)])||null;}
  };
  function setHistoricalUI(offset,state){
    const label=document.getElementById('timeDateLabel'),tag=document.getElementById('timeDayTag'),note=document.querySelector('.timenote'),head=document.querySelector('.trendhead h3');
    if(offset===0){if(label)label.textContent='Today · live';if(tag)tag.textContent='latest run';if(note)note.textContent='Live conditions use the model forecast and air-quality endpoints. Historical replay uses gridded reanalysis only when a past day is selected.';if(head)head.textContent='48-hour temp trend';return;}
    if(label)label.textContent=`${localDay(offset)} · ${Math.abs(offset)}d ago`;
    if(tag)tag.textContent=state==='loading'?'loading reanalysis':state==='ready'?'archived reanalysis':'archive unavailable';
    if(note)note.textContent=state==='ready'?'Global reanalysis, gridded historical context. It is not a ground station observation and is not a past operational forecast.':'Historical data are requested on demand. No synthetic historical values are used.';
    if(head)head.textContent='Archived hourly temperature';
  }
  const slider=document.getElementById('timeSlider');
  if(slider){slider.oninput=async()=>{DAY_OFFSET=parseInt(slider.value,10);const offset=DAY_OFFSET||0;if(offset===0){setHistoricalUI(0,'ready');if(typeof window.selectCity==='function')window.selectCity(activeStationId()||'isb',false);if(typeof window.refreshPins==='function')window.refreshPins();return;}const st=(window.STATIONS||[]).find(s=>s.id===activeStationId())||(window.STATIONS||[])[0];if(!st)return;setHistoricalUI(offset,'loading');try{await loadHistory(st);setHistoricalUI(offset,'ready');}catch(e){console.warn('Historical replay unavailable',e.message);setHistoricalUI(offset,'error');}if(typeof window.selectCity==='function')window.selectCity(activeStationId()||st.id,false);if(typeof window.refreshPins==='function')window.refreshPins();};}

  
  /* v91.17.283.12: the air-quality override of AGNConditions.getConditions is removed; the air quality is read at the source */

  
  function correctModelLanguage(){
    const t=document.querySelector('#mmSection h3');if(t)t.childNodes[0].nodeValue='Multi-model comparison \u00b7 ';
    const chart=document.getElementById('mmChartTitle');if(chart)chart.textContent=chart.textContent.replace(/Ensemble/gi,'Inter-model');
    const note=document.getElementById('mmChartNote');if(note)note.textContent='Shaded band = inter-model range · navy line = multi-model mean';
    const foot=document.getElementById('mmFoot');if(foot)foot.textContent='Live deterministic multi-model data from the forecast provider. The shaded band is inter-model spread, not a formal ensemble probability or verified forecast-skill score. When a source is unreachable, the panel is marked as deterministic fallback.';
    
    
    const aiMode=document.getElementById('aiMode');
    if(aiMode) aiMode.textContent='rule-based · live inputs';
    document.querySelectorAll('.ai-sub').forEach(el=>{
      if(el.textContent.indexOf('rule based preview model')>=0)
        el.textContent=el.textContent.replace('rule based preview model','rule-based model on live inputs');
    });
  }

  const refresh=document.getElementById('omRefresh');
  if(refresh)refresh.addEventListener('click',async()=>{refresh.disabled=true;const old=refresh.textContent;refresh.textContent='Refreshing…';try{await window.fetchLiveStations();await fetchStationAQI();
       
      try{ Object.keys(_topupTried).forEach(function(k){ delete _topupTried[k]; }); }catch(_){}
      renderFeaturePanel();}finally{refresh.disabled=false;refresh.textContent=old;}});
  const baseSelect=window.selectCity;
  if(typeof baseSelect==='function'&&!baseSelect.__omFeatureWrapped){const wrapped=function(){const r=baseSelect.apply(this,arguments);setTimeout(function(){renderFeaturePanel();if(typeof correctModelLanguage==='function')correctModelLanguage();},0);return r;};wrapped.__omFeatureWrapped=true;window.selectCity=wrapped;}
  
  setTimeout(async()=>{
    try{
      await window.fetchLiveStations();
      await fetchStationAQI();
       
      if(typeof window.setMACHFreshness==='function'){ var _nLive=0; try{ (window.STATIONS||[]).forEach(function(x){ if(x&&(x.weatherLive||x.aqiLive)) _nLive++; }); }catch(_){}
        window.setMACHFreshness(Date.now(), _nLive); }
      renderFeaturePanel();
      correctModelLanguage();
      if(typeof window.refreshPins==='function')window.refreshPins();
      if(typeof window.selectCity==='function')window.selectCity(activeStationId()||'isb',false);
    }catch(e){console.warn('Enhanced MACH city boot failed',e.message);renderFeaturePanel();}
  },20);
  

  (function(){
    var WX_MS=10*60e3, AQ_MS=30*60e3, wxAt=Date.now(), aqAt=Date.now(), busy=false;
    async function cycle(force){
      if(busy||document.hidden) return; var now=Date.now(), doWx=force||now-wxAt>=WX_MS, doAq=force||now-aqAt>=AQ_MS; if(!doWx&&!doAq) return;
      busy=true;
      try{
        if(doWx){ wxAt=now; await window.fetchLiveStations(); }
        if(doAq){ aqAt=now; await fetchStationAQI(); }
        if(typeof window.setMACHFreshness==='function'){ var _n=0; try{ (window.STATIONS||[]).forEach(function(x){ if(x&&(x.weatherLive||x.aqiLive)) _n++; }); }catch(_){} if(_n) window.setMACHFreshness(Date.now(), _n); }
        renderFeaturePanel();
        if(typeof window.refreshPins==='function') window.refreshPins();
        var _ua=window.__userAction; window.__userAction=false;
        try{ if(typeof window.selectCity==='function') window.selectCity(activeStationId()||'isb',false); } finally{ window.__userAction=_ua; }
      }catch(e){ if(window.__MACH_DEBUG) console.debug('[mach periodic refresh]', e&&e.message); }
      finally{ busy=false; }
    }
    setInterval(function(){ cycle(false); }, 60e3);
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) cycle(false); });
    window.__agnLiveRefresh={ every:{weatherMin:10, airQualityMin:30}, last:function(){ return { weather:new Date(wxAt).toISOString(), airQuality:new Date(aqAt).toISOString() }; }, now:function(){ return cycle(true); } };
  })();
  
  setTimeout(function(){
    try{ if(typeof correctModelLanguage==='function') correctModelLanguage(); }catch(e){ if(window.__MACH_DEBUG) console.debug("[mach swallowed]", e&&e.message); }
    try{ if(typeof renderFeaturePanel==='function') renderFeaturePanel(); }catch(e){ if(window.__MACH_DEBUG) console.debug("[mach swallowed]", e&&e.message); }
  },1200);
})();
