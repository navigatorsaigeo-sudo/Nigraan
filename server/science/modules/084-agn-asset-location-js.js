
(function(){
  

  var last=null, busy=false;
  function drive(){
    try{
      if(busy || !window.AGN || !AGN.project || !AGN.project.activeAsset) return;
      var a=AGN.project.activeAsset(); if(!a) { last=null; return; }
      var id=String(a.asset_id||a.name||''), lat=Number(a.latitude), lon=Number(a.longitude);
      if(!id || id===last || !isFinite(lat) || !isFinite(lon)) return;
      if(typeof window.driveFromPoint!=='function') return;
      busy=true; last=id;
      var name=String(a.name||a.asset_name||id);
      Promise.resolve(window.driveFromPoint(lat, lon, name, false))
        .then(function(rec){ if(!rec || rec.ok===false) last=null; })
        .catch(function(){ last=null; })
        .then(function(){ busy=false; });
    }catch(_){ busy=false; }
  }
  ['agn:active-asset','agn:project'].forEach(function(ev){ document.addEventListener(ev, function(){ setTimeout(drive, 400); }); });
  window.AGN=window.AGN||{}; AGN.assetLocation={ drive:drive, lastDriven:function(){ return last; } };
})();
