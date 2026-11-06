
(function(){
  'use strict';
  const TTL=15*60*1000, CACHE_PREFIX='mach:selected-district:v1:';
  const n=v=>v==null||v===''?null:Number(v);
  const pickHour=(resp)=>{
    const h=resp&&resp.hourly||{}, cur=resp&&resp.current||{}, times=h.time||[];
    const k=String(cur.time||'').slice(0,13); let i=times.findIndex(t=>String(t).slice(0,13)===k);
    if(i<0 && k){for(let x=0;x<times.length;x++) if(String(times[x]).slice(0,13)<=k) i=x;}
    return Math.max(0,i);
  };
  const readCache=name=>{try{const raw=localStorage.getItem(CACHE_PREFIX+name);const o=raw&&JSON.parse(raw);return o&&Date.now()-o.at<TTL?o.row:null;}catch(_){return null;}};
  const writeCache=(name,row)=>{try{localStorage.setItem(CACHE_PREFIX+name,JSON.stringify({at:Date.now(),row}));}catch(_){}};
  function finalLabels(){
    

     
  }
  finalLabels();setTimeout(finalLabels,600);setTimeout(finalLabels,2200);
  window.MACH_FAST_AUDIT={cacheMinutes:15};
})();
