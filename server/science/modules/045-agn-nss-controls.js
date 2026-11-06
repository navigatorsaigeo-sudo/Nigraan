


(function(G){
  'use strict';
  G.nssStormDepth = 100;
  var RETENTION='nss_retention';
  function isNss(k){ return !!(G.NSS_LAYERS && G.NSS_LAYERS[k]); }
  

  function current(){
    try{ if(typeof G.currentMapLayer==='function') return G.currentMapLayer(); }catch(_){}
    try{ var el=document.getElementById('mapHazardPick'); if(el) return el.value; }catch(_){}
    return null;
  }
  function syncVisibility(){
    var el=document.getElementById('nssStormPick'); if(!el) return;
    el.style.display = (current()===RETENTION) ? '' : 'none';
  }
  function repaint(){
     
    try{ if(typeof G.applyDistrictFill==='function' && current()){ G.applyDistrictFill(current()); return; } }catch(_){}
    try{ if(typeof G.refreshDistrictHazard==='function') G.refreshDistrictHazard(); }catch(_){}
    try{ if(typeof G.drawLegend==='function') G.drawLegend(); }catch(_){}
  }
  function boot(){
    var pick=document.getElementById('nssStormPick');
    if(pick && !pick.__wired){
      pick.__wired=true;
      pick.addEventListener('change',function(){
        var v=parseFloat(pick.value);
        if(isFinite(v)&&v>0){ G.nssStormDepth=v; repaint(); }
      });
    }
    var haz=document.getElementById('mapHazardPick');
    if(haz && !haz.__nssWired){
      haz.__nssWired=true;
      haz.addEventListener('change',syncVisibility);
    }
    syncVisibility();
  }
  

  try{
    if(G.AGN && AGN.events && typeof AGN.events.on==='function'){
      AGN.events.on('agn:data', function(){ if(isNss(current())) repaint(); });
    } else {
      G.addEventListener('agn:data', function(){ if(isNss(current())) repaint(); });
    }
  }catch(_){}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else setTimeout(boot,0);
  setTimeout(boot,2500);
  G.AGN=G.AGN||{};
  G.AGN.nssControls={ stormDepth:function(){return G.nssStormDepth;},
    setStormDepth:function(v){ v=parseFloat(v); if(isFinite(v)&&v>0){G.nssStormDepth=v; repaint();} return G.nssStormDepth; },
    syncVisibility:syncVisibility };
})(window);
