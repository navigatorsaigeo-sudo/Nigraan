
(function(G){
  'use strict';
  var D=document;
  

   
  D.addEventListener('click',function(e){
    var b=e.target&&e.target.closest?e.target.closest('[data-agn-action="cmip6"]'):null; if(!b) return;
    e.preventDefault(); e.stopPropagation();
    var nav=D.querySelector('[data-goto="livedata"]'); if(nav) nav.click();
    setTimeout(function(){ var hb=D.querySelector('.agn-hzbar87 [data-hz87="clim"]'); if(hb){ hb.click(); return; } var c=D.getElementById('agnV91CmipCard'); if(c&&c.scrollIntoView) c.scrollIntoView({behavior:'smooth',block:'start'}); },400);
  },true);
  function words(){
    

    try{ var un=D.getElementById('ccUrbanNote'); if(un&&/not added to the temperature above\.$/.test(un.textContent)){ var ap=G.AGN.data&&G.AGN.data.activePoint?G.AGN.data.activePoint():null, pv=(ap&&G.AGN.nowAt)?G.AGN.nowAt.peek(ap.lat,ap.lon):null;
        var st=pv&&pv.build&&pv.build.steps?pv.build.steps.filter(function(x){ return /city-heat/i.test(x.step); })[0]:null;
        if(st&&Math.abs(+st.deltaC)>=0.05) un.textContent=un.textContent.replace(/; not added to the temperature above\.$/,'; not added. The temperature above already carries the city warmth measured by the MACH stations ('+(st.deltaC>0?'+':'')+(+st.deltaC).toFixed(1)+' \u00b0C this hour).'); } }catch(_){}
  }
  ['agn:data','agn:location','agn:view'].forEach(function(ev){ D.addEventListener(ev,function(){ setTimeout(words,300); }); });
  setInterval(words,4000); setTimeout(words,1500);
})(window);
