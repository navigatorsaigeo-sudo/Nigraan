


(function(){
  var pending=false;
  window.agnInvalidateMap=function(){
    if(pending) return; pending=true;
    requestAnimationFrame(function(){
      pending=false;
      try{ if(window.map&&window.map.invalidateSize) window.map.invalidateSize({animate:false}); }catch(_){}
    });
  };
  document.addEventListener('DOMContentLoaded',function(){
    if(!window.map||!window.map.invalidateSize) return;
    var real=window.map.invalidateSize.bind(window.map);
    window.map.invalidateSize=function(o){
      if(pending) return window.map; pending=true;
      requestAnimationFrame(function(){ pending=false;
        /* v91.17.283.40 · not on screen (its view hidden): keep the size it had; the request is made again when it is shown */
        try{ var c=window.map.getContainer&&window.map.getContainer(); if(c&&(!c.offsetWidth||!c.offsetHeight)){ window.map.__agnSizeWait=o||{}; return; } }catch(_){}
        try{ real(o); }catch(_){} });
      return window.map;
    };
    /* v91.17.283.40 · a request kept while hidden is made when the map is on screen again (Leaflet compares the size and redraws only on a change) */
    try{ new ResizeObserver(function(){ var o=window.map.__agnSizeWait, c=window.map.getContainer&&window.map.getContainer(); if(o&&c&&c.offsetWidth&&c.offsetHeight){ window.map.__agnSizeWait=null; window.map.invalidateSize(o); } }).observe(window.map.getContainer()); }catch(_){}
  });
})();
