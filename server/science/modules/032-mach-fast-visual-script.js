
(function(){
   

  

   

  


  

  const cacheKey='mach:district-aqi:v1', maxAge=15*60*1000;
  function applyCache(){
    try{
      const c=JSON.parse(localStorage.getItem(cacheKey)||'null');
      if(!c||Date.now()-c.at>maxAge||!c.rows) return false;
      Object.entries(c.rows).forEach(([name,v])=>{ if(DISTRICT_IN[name]&&v&&v.aqiLive===true) Object.assign(DISTRICT_IN[name],v); });
      return true;
    }catch(_){ return false; }
  }
  function saveCache(){
    try{
      const rows={}; Object.entries(DISTRICT_IN).forEach(([name,v])=>{ if(v&&v.aqiLive===true&&v.aqi!=null) rows[name]={aqi:v.aqi,pm25:v.pm25,pm10:v.pm10,aqiLive:true}; });   /* v283.35 · A4: only live (server) values are cached, never a seed */
      localStorage.setItem(cacheKey,JSON.stringify({at:Date.now(),rows}));
    }catch(_){}
  }
  let districtLoad=null;
  async function ensureDistrictAQI(){
    
    
    
    
    const hydrated=applyCache();
    if(hydrated){ refreshDistrictHazard&&refreshDistrictHazard(); }
    
    let weatherFresh=false;
    try{
      const ds=window.machDataState;
      if(ds && ds.total){
        const cov=(ds.liveCount||0)/ds.total;
        const age=ds.lastLiveTs?(Date.now()-ds.lastLiveTs):Infinity;
        weatherFresh = (cov>=0.95) && (age < 15*60*1000);   
      }
    }catch(e){}
    if(hydrated && weatherFresh) return true;        
    if(districtLoad) return districtLoad;
    districtLoad=(async()=>{
      
      
      
      let wxOk=false;
       
      const aqiP=Promise.resolve().then(function(){ return fetchDistrictAQI(); }).catch(function(){ return false; });
      try{ wxOk=await window.fetchDistrictWeatherSoil(); }
      catch(e){ console.warn('district weather/soil load failed', e.message); }
      if(wxOk){ try{ saveCache(); refreshDistrictHazard&&refreshDistrictHazard(); }catch(_){} }
      const aqiOk=await aqiP;
      if(wxOk||aqiOk){saveCache();refreshDistrictHazard&&refreshDistrictHazard();}
      return wxOk||aqiOk;
    })().finally(()=>{districtLoad=null;});
    return districtLoad;
  }
  window.MACH_FAST={ensureDistrictAQI};
  document.querySelectorAll('#geoLevelTab button').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.geo==='district')ensureDistrictAQI();}));
  const pick=document.getElementById('mapHazardPick'); if(pick) pick.addEventListener('change',()=>{if(pick.value)ensureDistrictAQI();});

  setTimeout(()=>{ try{ ensureDistrictAQI(); }catch(e){ if(window.__MACH_DEBUG) console.debug('[mach] district kickoff', e&&e.message); } }, 2500);

   
  function activateModels(){
    if(window.__machModelsRequested) return;
    window.__machModelsRequested=true;
    if(typeof window.mmOnCity==='function' && window.mmState && window.mmState.station) window.mmOnCity(mmState.station);
  }
  const mm=document.getElementById('mmSection');
  if(mm && 'IntersectionObserver' in window){
    const io=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){activateModels();io.disconnect();}},{rootMargin:'220px'});io.observe(mm);
  }
  document.querySelectorAll('#mmVarSeg button,#mmLeadSeg button').forEach(b=>b.addEventListener('click',activateModels,{once:true}));
  

  function _mmVisible(){
    try{ var e=document.getElementById('mmSection');
         return !!(e && e.getClientRects && e.getClientRects().length); }catch(_){ return false; }
  }
  try{
    document.addEventListener('agn:view', function(){
      setTimeout(function(){ if(_mmVisible()) activateModels(); }, 60);
    });
  }catch(_){}
  try{
    var _mmTries=0;
    var _mmPoll=setInterval(function(){
      if(window.__machModelsRequested || ++_mmTries>40){ clearInterval(_mmPoll); return; }
      if(_mmVisible()){ clearInterval(_mmPoll); activateModels(); }
    }, 1500);
  }catch(_){}
})();
