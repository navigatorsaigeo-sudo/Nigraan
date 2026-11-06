

(function(){
  const S = {
    phase: 'seed',          
    liveCount: 0,           
    total: 0,
    lastLiveTs: null,       
    STALE_MS: 40*60*1000,   
  };

  function countLive(){
    const D = window.DISTRICT_IN; if(!D) return {live:0,total:0};
    
    
    
    
    const cen = window.PK_DISTRICT_CENTROIDS;
    const isIIOJK = s => /Indian Illegally Occupied|Jammu Kashmir/i.test(s||'');
    if(Array.isArray(cen) && cen.length){
      const liveByDist={}, allDist={};
      for(const c of cen){
        const dist=c.district; if(dist==null||isIIOJK(dist)||isIIOJK(c.province)) continue;
        allDist[dist]=true;
        const rec=D[c.key];
        if(rec && rec.weatherLive) liveByDist[dist]=true;
      }
      return {live:Object.keys(liveByDist).length, total:Object.keys(allDist).length};
    }
    
    let live=0,total=0;
    for(const k in D){ total++; if(D[k] && D[k].weatherLive) live++; }
    return {live,total};
  }
  function fmtAgo(ts){
    if(!ts) return '';
    const m=Math.round((Date.now()-ts)/60000);
    if(m<1) return 'just now';
    if(m===1) return '1 min ago';
    if(m<60) return m+' min ago';
    const h=Math.round(m/60); return h+(h===1?' hr ago':' hrs ago');
  }

  S.recompute = function(){
    const {live,total}=countLive();
    S.liveCount=live; S.total=total;
    
    
    if(window.__machRateLimited && live===0){ S.phase='ratelimited'; return S.phase; }
    if(live===0){ S.phase = (S.phase==='failed') ? 'failed' : 'seed'; }
    else {
      if(S.lastLiveTs && (Date.now()-S.lastLiveTs)>S.STALE_MS) S.phase='stale';
      else S.phase='live';
    }
    return S.phase;
  };

  
  S.markLive = function(updatedCount){
    if(updatedCount>0){ S.lastLiveTs=Date.now(); S.phase='live'; }
    S.recompute();
  };
  
  S.markFailed = function(){
    const {live}=countLive();
    S.phase = live>0 ? 'stale' : 'failed';
  };

  S.footerLine = function(){
    S.recompute();
    const n=S.liveCount, t=S.total||163;
    switch(S.phase){
      case 'live':   return `live MACH inputs (${n}/${t} districts · updated ${fmtAgo(S.lastLiveTs)})`;
      case 'stale':  return `inputs STALE — last live ${fmtAgo(S.lastLiveTs)}; showing last-known values`;
      case 'failed': return `live feed unavailable — showing SEED reference values, not live`;
      case 'ratelimited': return `live feed rate-limited (HTTP 429) — MACH quota reached; no live values are shown; retry later or add an API key`;
      default:       return `seed reference values · fetching live MACH inputs…`;
    }
  };
  
  S.badge = function(){
    S.recompute();
    const map={
      live:  ['LIVE',  '#14B8A6'],
      stale: ['STALE', '#d9a441'],
      failed:['SEED',  '#e8833a'],
      ratelimited:['RATE-LIMITED','#e8833a'],
      seed:  ['SEED·LOADING','#7b8a97'],
    };
    const [txt,col]=map[S.phase]||map.seed;
    return ` <span style="display:inline-block;margin-left:8px;padding:1px 7px;border-radius:8px;font-size:0.75rem;font-weight:700;letter-spacing:.4px;background:${col}22;color:${col};border:1px solid ${col}66;vertical-align:middle">${txt}</span>`;
  };


  window.machDataState = S;

  
  setTimeout(()=>{ S.recompute(); }, 1200);
  setInterval(()=>{ S.recompute(); }, 60*1000);
})();
