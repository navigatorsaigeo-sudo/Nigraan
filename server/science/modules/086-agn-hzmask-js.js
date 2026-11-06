


(function(){
  var M=null, tries=0;
  window.__agnHzMaskWhy=function(key, hazard){ try{ if(!M||!M.layers||key==null) return null; var L=M.layers[hazard]; return (L&&L.byKey&&L.byKey[key])||null; }catch(_){ return null; } };
  function done(j){ M=j; window.AGN=window.AGN||{}; AGN.hzMask=j;
    try{ if(typeof window.hzTallyReset==='function') window.hzTallyReset(); }catch(_){}
    try{ if(typeof refreshDistrictHazard==='function') refreshDistrictHazard(); }catch(_){}
    try{ document.dispatchEvent(new CustomEvent('agn:data')); }catch(_){} }
  function load(){ fetch('/api/map/layer?id=mask:all',{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; })
    .then(function(j){ if(j&&j.ready) done(j); else if(++tries<6) setTimeout(load,4000*tries); })
    .catch(function(){ if(++tries<6) setTimeout(load,4000*tries); }); }
  load();
})();
