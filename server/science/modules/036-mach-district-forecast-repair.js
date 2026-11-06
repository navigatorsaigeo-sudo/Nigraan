
(function(){
  'use strict';
  
  const FIELD_LIST='temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,precipitation,precipitation_probability,snowfall,soil_moisture_9_to_27cm,surface_pressure,pressure_msl,cloud_cover,temperature_850hPa,wind_speed_850hPa';
  const oldRisk=(typeof window.aiDistrictRisk==='function')?window.aiDistrictRisk:null;

   
  function num(v){ return AGN.parse.numberOrNull(v); }
  function at(a,i){ return Array.isArray(a) && a[i]!=null ? num(a[i]) : null; }
  function nearestIndex(times,currentTime){
    if(!Array.isArray(times)||!times.length) return 0;
    const exact=times.indexOf(currentTime); if(exact>=0) return exact;
    
    const key=String(currentTime||'').slice(0,13);
    const byHour=times.findIndex(t=>String(t).slice(0,13)===key);
    return byHour>=0?byHour:0;
  }
  function recordForecast(resp){
    const h=resp&&resp.hourly||{}, cur=resp&&resp.current||{};
    const nowIdx=nearestIndex(h.time,cur.time);
    return {time:h.time||[],nowIdx,
      temp:h.temperature_2m||[], feels:h.apparent_temperature||[], hum:h.relative_humidity_2m||[],
      wind:h.wind_speed_10m||[], gust:h.wind_gusts_10m||[], rain:h.precipitation||[],
      rainProb:h.precipitation_probability||[], snow:h.snowfall||[], soil:h.soil_moisture_9_to_27cm||[],
      surfacePressure:h.surface_pressure||[], pressure:h.pressure_msl||[], cloud:h.cloud_cover||[],
      /* v91.17.283.10: a pressure level at or below the hour's surface pressure is under the ground: masked */
      t850:(h.temperature_850hPa||[]).map(function(v,i){ var sp=(h.surface_pressure||[])[i]; return (sp!=null&&sp<=850)?null:v; }),
      wind850:(h.wind_speed_850hPa||[]).map(function(v,i){ var sp=(h.surface_pressure||[])[i]; return (sp!=null&&sp<=850)?null:v; })};
  }
  function forecastAt(inp, lead){
    const f=inp&&inp.fc72; if(!f||!Array.isArray(f.time)) return null;
    const i=f.nowIdx+Math.round(Number(lead)||0);
    if(i<0||i>=f.time.length||at(f.temp,i)==null) return null;
    return {t:at(f.temp,i), feels:at(f.feels,i), hum:at(f.hum,i), wind:at(f.wind,i), gust:at(f.gust,i),
      rain:at(f.rain,i), rainProb:at(f.rainProb,i), snow:at(f.snow,i), soilMoist:at(f.soil,i),
      surfacePressure:at(f.surfacePressure,i), pressure:at(f.pressure,i), cloud:at(f.cloud,i),
      t850:at(f.t850,i), wind850:at(f.wind850,i), validTime:f.time[i], forecastHour:lead};
  }
  window.districtForecastAt=forecastAt;

  const districtSweep=async function(){
    const pts=(window.PK_DISTRICT_CENTROIDS||[]).filter(d=>{
      
      
      
      const p=(d.province||''); const dn=(d.district||'');
      const isIIOJK = p==='IIOJK' || /Indian Illegally Occupied|Jammu Kashmir/i.test(p) || /Indian Illegally Occupied|Jammu Kashmir/i.test(dn);
      return !isIIOJK;
    });
    const store=window.DISTRICT_IN||{};
    if(!pts.length||!Object.keys(store).length) return false;
    const CHUNK=(function(){try{return (window.AGN&&AGN.tier)?AGN.tier.chunkFor(12,4):36;}catch(_){return 36;}})(); let updated=0, failed=0;
    const startedAt=Date.now();

    const __announce=function(){ try{ document.dispatchEvent(new CustomEvent(
      'agn:district-forecast-status',{detail:window.__districtForecastStatus||null})); }catch(_){} };
    window.__districtForecastStatus={running:true,updated:0,failed:0,startedAt};
    
    
    
    const chunks=[];
    for(let start=0;start<pts.length;start+=CHUNK){ chunks.push(pts.slice(start,start+CHUNK)); }
    const applyChunk=(batch,rows)=>{
      if(!Array.isArray(rows)) rows=[rows];
      rows.forEach((resp,i)=>{
        try{
          const d=batch[i], inp=d&&store[d.key]; if(!inp||!resp) return;
          const cur=resp.current||{}, fc=recordForecast(resp);
          const n=fc.nowIdx;
          inp.fc72=fc; inp.fcSource='tehsil_centroid_open_meteo'; inp.fcLabel='tehsil-centroid 72h forecast';
          inp.fcUpdatedAt=Date.now(); inp.weatherLive=true; inp.forecastLive=true;
          inp.t=Math.round(num(cur.temperature_2m)??at(fc.temp,n)??inp.t);
          
          
          const _f=at(fc.feels,n); if(_f!=null) inp.feels=Math.round(_f);
          inp.hum=Math.round(num(cur.relative_humidity_2m)??at(fc.hum,n)??inp.hum);
          inp.wind=Math.round(num(cur.wind_speed_10m)??at(fc.wind,n)??inp.wind);
          inp.gust=Math.round(num(cur.wind_gusts_10m)??at(fc.gust,n)??inp.gust);
           
          { var _r=(num(cur.precipitation)!=null?agnRainRate(num(cur.precipitation),cur):null)??at(fc.rain,n)??inp.rain; inp.rain=(_r==null||!isFinite(+_r))?null:+(+_r).toFixed(1); }
          

          if(at(fc.soil,n)!=null){ inp.soilMoist9to27=at(fc.soil,n); inp.soilMoist9to27Basis='forecast model 9-27 cm at the present hour'; }
          updated++;
        }catch(rowErr){ if(window.__MACH_DEBUG) console.warn('[MACH] apply row failed',rowErr.message); }
      });
    };
    
    const fetchOneChunk=async(batch)=>{
      const lats=batch.map(x=>x.lat).join(','), lons=batch.map(x=>x.lon).join(',');
      const _elevP=(function(){try{return (window.AGN&&AGN.elevation)?AGN.elevation.paramForPoints(batch):'';}catch(_){return '';}})();
      const url='https://api.open-meteo.com/v1/forecast?latitude='+encodeURIComponent(lats)+'&longitude='+encodeURIComponent(lons)+_elevP
        +'&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,precipitation'

        +'&hourly='+encodeURIComponent(FIELD_LIST)+'&forecast_days=4&models=best_match&timezone=auto';
      try{
        const ctrl=(typeof AbortController!=='undefined')?new AbortController():null;
        

        const timer=ctrl?setTimeout(()=>ctrl.abort(),100000):null;
        const r=await AGN.api.fetch(url,{cache:'no-store',signal:ctrl?ctrl.signal:undefined});
        if(timer) clearTimeout(timer);
        if(r.status===429) throw new Error('HTTP 429 rate-limited');
        if(!r.ok) throw new Error('HTTP '+r.status);
        const rows=await r.json();
        applyChunk(batch, rows);
        return true;
      }catch(err){
        if(/429/.test(err.message)) window.__machRateLimited=true;
        if(window.__MACH_DEBUG) console.warn('[MACH] district 72h chunk failed',err.message);
        return batch;   
      }
    };
    
    
    const runPool=async(items,limit,worker)=>{
      const out=[]; let idx=0;
      
      
      
      
      

      const _paceMs=(function(k,d){try{return (window.AGN&&AGN.tier)?AGN.tier.get(k,d):d;}catch(_){return d;}})('paceMs',900), _laneCap=(function(k,d){try{return (window.AGN&&AGN.tier)?AGN.tier.get(k,d):d;}catch(_){return d;}})('lanes',2);
      const lane=async()=>{ while(idx<items.length){ const my=idx++; out[my]=await worker(items[my]); if(idx<items.length) await new Promise(r=>setTimeout(r,_paceMs)); } };
      await Promise.all(Array.from({length:Math.min(_laneCap,Math.min(limit,items.length))},lane));
      return out;
    };
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    
    
    
    
    
    let pending=(Array.isArray(window.__machRetryChunks)&&window.__machRetryChunks.length)
      ? window.__machRetryChunks.slice() : chunks.slice();
    window.__machRetryChunks=null;
    for(let round=0; round<=2 && pending.length; round++){
      if(round>0){ await sleep(800*round); }   
      const results=await runPool(pending, 5, fetchOneChunk);
      pending=results.filter(r=>Array.isArray(r));   
      window.__districtForecastStatus={running:true,updated,failed:pending.reduce((a,b)=>a+b.length,0),startedAt};
    }
    failed=pending.reduce((a,b)=>a+b.length,0);   
    window.__districtForecastStatus={running:false,updated,failed,finishedAt:Date.now()};
    __announce();
    
    
    
    
    if(failed>0){
      window.__machRetryChunks=pending.slice();
      const n=(window.__machRerun=(window.__machRerun||0)+1);
      

        const delays=(function(k,d){try{return (window.AGN&&AGN.tier)?AGN.tier.get(k,d):d;}catch(_){return d;}})('retryDelays',[90000,180000,300000,600000]);
      if(n<=delays.length){
        const delay=delays[n-1];
        window.__machNextRunAt=Date.now()+delay;
        setTimeout(()=>{ window.__machNextRunAt=null; try{ window.fetchDistrictWeatherSoil().catch(()=>{}); }catch(e){} }, delay);
      } else { window.__machNextRunAt=null; }
    } else { window.__machRerun=0; window.__machRetryChunks=null; window.__machNextRunAt=null; }
    
    
    
    try{
      if(window.machDataState){
        if(updated>0 && typeof window.machDataState.markLive==='function'){ window.machDataState.markLive(updated); }
        else if(typeof window.machDataState.recompute==='function'){ window.machDataState.recompute(); }
      }
    }catch(e){ if(window.__MACH_DEBUG) console.warn('[MACH] state sync after batch failed', e&&e.message); }
    try{ if(typeof window.refreshDistrictHazard==='function') window.refreshDistrictHazard(); }catch(e){}
    return updated>0;
  };

  if(oldRisk){
    window.aiDistrictRisk=function(inp,hazard,lead,name){
      
      if(hazard==='drought') return oldRisk.call(this,inp,hazard,lead,name);

      if(inp && inp.dayIndex != null) return oldRisk.call(this,inp,hazard,24,name);
      const fc=forecastAt(inp,lead);
      if(!fc) return oldRisk.call(this,inp,hazard,lead,name);
      

      const future=Object.assign({},inp,{t:fc.t,feels:fc.feels??fc.t,hum:fc.hum??null,wind:fc.wind??null,
         
        gust:fc.gust??null,rain:fc.rain??null,soilMoist:fc.soilMoist??null,
        snow:fc.snow??null,pressure:fc.pressure??null,t850:fc.t850??null,wind850:fc.wind850??null,mixedValidTime:false});
      
      const r=oldRisk.call(this,future,hazard,24,name);
      if(r){ r.forecastBasis='district_forecast_hour'; r.validTime=fc.validTime; r.forecastHour=lead; }
      return r;
    };
  }

  
  
  
  
  
  setTimeout(()=>{ window.fetchDistrictWeatherSoil().catch(e=>console.warn('[MACH] district refresh skipped/failed',e.message)); },1800);

  
  
  
  
  
  (function(){
    /* v91.17.283.19 · THE one fetchDistrictWeatherSoil: in the browser the district rows are the district points' corrected records (the page
       store, one GET /api/point/batch per run); in engine mode (the server's hazard engine) the provider sweep below, once at a time */
    const inner=districtSweep;
    window.fetchDistrictWeatherSoil=async function(){
      if(!(window.AGN&&AGN.engineMode)) return agnPS().then(function(P){ return P?P.districts():0; }).then(function(n){ if(n){ window.__machWxDoneAt=Date.now(); try{ if(window.machDataState&&typeof window.machDataState.markLive==='function') window.machDataState.markLive(n); }catch(_){} } return n>0; });
      if(window.__machWxInflight) return window.__machWxInflight;
      

      var _covOk=false;
      try{ if(typeof hzDayCoverage==='function'){ var _c=hzDayCoverage(1);
        _covOk=!!(_c && _c.coverage!=null && _c.coverage>=0.95); } }catch(_){}
      if(_covOk && window.__machWxDoneAt && (Date.now()-window.__machWxDoneAt)<60000) return true;
      const args=arguments, self=this;
      window.__machWxInflight=(async()=>{ try{
          const r=await inner.apply(self,args);
          var _done=false;
          try{ if(typeof hzDayCoverage==='function'){ var _c2=hzDayCoverage(1);
            _done=!!(_c2 && _c2.coverage!=null && _c2.coverage>=0.95); } }catch(_){}
          if(r && _done) window.__machWxDoneAt=Date.now();
          return r;
        } finally { window.__machWxInflight=null; } })();
      return window.__machWxInflight;
    };
  })();
})();
