


(function(){
  'use strict';
  var G=window, D=document, t0=Date.now(), touched=false;
  ['pointerdown','keydown','wheel','touchstart'].forEach(function(ev){ D.addEventListener(ev,function(){ touched=true; },{capture:true,passive:true}); });
  function startup(){ return !touched && (Date.now()-t0)<60000; }
  (function hook(k){ var m=G.map; if(!m||typeof m.flyTo!=='function'){ if(k<200) setTimeout(function(){ hook(k+1); },50); return; }
    if(m.__agnPkView) return; m.__agnPkView=true;
    var fly=m.flyTo;
    m.flyTo=function(){ if(startup()) return this; return fly.apply(this,arguments); };
    G.AGN=G.AGN||{}; G.AGN.pkView={ startup:startup };
  })(0);
})();
