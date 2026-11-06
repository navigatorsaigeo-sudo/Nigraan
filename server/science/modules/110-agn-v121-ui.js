
(function(){
  'use strict';
  var D=document, KEY='agn.legend.min', ATTR0=null;
   
  function streets(on){ try{ D.documentElement.classList.toggle('agn-streets-on',!!on);
      var el=D.getElementById('agnBasemapAttr'); if(!el) return;
      if(on){ if(ATTR0==null) ATTR0=el.textContent; var st=(window.AGN&&AGN.streets&&AGN.streets.status&&AGN.streets.status())||{}; el.textContent='Streets '+(st.attribution||'© OpenStreetMap contributors (ODbL) · Protomaps'); }
      else if(ATTR0!=null){ el.textContent=ATTR0; ATTR0=null; } }catch(_){} }
  D.addEventListener('agn:streets',function(e){ streets(e&&e.detail&&e.detail.on); });
   
  (function zb(n){ if(!window.map||!map.on){ if(n<120) setTimeout(function(){ zb(n+1); },500); return; }
    var set=function(){ try{ var was=D.documentElement.classList.contains('agn-z-far'), far=map.getZoom()<=8; D.documentElement.classList.toggle('agn-z-far', far);
      if(was!==far&&window.AGN&&AGN.hz5&&AGN.hz5.legExtras) AGN.hz5.legExtras(); }catch(_){} };     map.on('zoomend',set); set(); })(0);
   
  function pref(){ try{ return localStorage.getItem(KEY)==='1'; }catch(_){ return false; } }
  function save(v){ try{ localStorage.setItem(KEY,v?'1':'0'); }catch(_){} }
  function wire(){ var lg=D.getElementById('v3legend'); if(!lg) return;
    var b=lg.querySelector(':scope > .agn-leg-tg');
    if(!b){ b=D.createElement('button'); b.type='button'; b.className='agn-leg-tg';
      b.addEventListener('click',function(e){ e.stopPropagation(); var m=!lg.classList.contains('agn-leg-min'); lg.classList.toggle('agn-leg-min',m); save(m); label(); });
      lg.insertBefore(b,lg.firstChild); try{ if(window.L&&L.DomEvent) L.DomEvent.disableClickPropagation(b); }catch(_){} }
    lg.classList.toggle('agn-leg-min',pref());
    function label(){ var m=lg.classList.contains('agn-leg-min'), lt=m?'Key ▸':'Hide ✕'; if(b.textContent!==lt) b.textContent=lt; b.setAttribute('aria-expanded',m?'false':'true'); b.title=m?'Show the map key':'Hide the map key'; }
    label(); }
  var obs=null;
  (function start(n){ var lg=D.getElementById('v3legend');
    if(lg){ wire(); if(!obs){ obs=new MutationObserver(function(){ if(!lg.querySelector(':scope > .agn-leg-tg')) wire(); }); obs.observe(lg,{childList:true}); }
      try{ if(window.AGN&&AGN.streets&&AGN.streets.on) streets(AGN.streets.on()); }catch(_){} }
    if(n<120) setTimeout(function(){ start(n+1); }, lg?5000:500); })(0);
})();
