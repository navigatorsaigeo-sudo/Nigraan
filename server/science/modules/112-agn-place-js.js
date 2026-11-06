


(function(){
  'use strict';
  var D=document, G=window;
   
  function activeName(){ try{ var p=G.AGN&&AGN.data&&AGN.data.activePoint?AGN.data.activePoint():null; var n=p&&p.name?String(p.name).trim():''; return n; }catch(_){ return ''; } }
  

  function barName(){ try{ var e=D.querySelector('#agnLive84 .agn-place span'); var t=e?String(e.textContent||'').trim():''; return (t && !/^Pick a place/i.test(t) && !/\u2026$/.test(t)) ? t : ''; }catch(_){ return ''; } }
  function placeName(){ var n=barName()||activeName(); if(n) return n; var l=D.getElementById('cityLabel'); var t=l?String(l.textContent||'').trim():''; return t||'—'; }
  function syncHeader(){ var l=D.getElementById('cityLabel'), n=barName()||activeName(); if(!l||!n||l.dataset.agnPending) return; if(String(l.textContent).trim()!==n){ l.textContent=n; l.title=n; } }
  function openSearch(){
    try{ var btn=D.getElementById('cityBtn'), sel=D.getElementById('citysel');
      if(sel && !sel.classList.contains('open') && btn) btn.click();
      setTimeout(function(){ var i=D.getElementById('hdrPlaceInput'); if(i){ i.focus(); i.select&&i.select(); } try{ window.scrollTo({top:0,behavior:'smooth'}); }catch(_){} }, 60);
    }catch(_){}
  }
  function chip(){ var w=D.createElement('span'); w.className='agn-place-ro'; w.setAttribute('data-agn-place','1');
    w.innerHTML='<span class="k">Place</span><span class="v"></span><button type="button" aria-label="Change the place (opens the place search at the top of the page)">Change</button>';
    w.querySelector('button').addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); openSearch(); });
    return w; }
   
  var SLOTS=[['#agnPtBox .r','before'],['.mach-place-search','before'],['.ml-location-search','before'],['.opsx-location-search','before']];
  function mount(){
    SLOTS.forEach(function(s){ var el=D.querySelector(s[0]); if(!el||!el.parentNode) return;
      var prev=el.previousElementSibling; if(prev && prev.getAttribute && prev.getAttribute('data-agn-place')) return;
      el.parentNode.insertBefore(chip(), el); });
    paint();
  }
  function paint(){ var n=placeName(); D.querySelectorAll('.agn-place-ro .v').forEach(function(v){ if(v.textContent!==n){ v.textContent=n; v.title=n; } }); }
   
  function coordHook(){ var inp=D.getElementById('hdrPlaceInput'); if(inp){ try{ inp.placeholder='Search a place in Pakistan (tehsil, district, town) or type 33.69, 73.05'; }catch(_){} } }
  function start(){ mount(); coordHook();
    var l=D.getElementById('cityLabel'); if(l){ try{ new MutationObserver(paint).observe(l,{childList:true,characterData:true,subtree:true}); }catch(_){} }
     
    (function watchBar(n){ var e=D.querySelector('#agnLive84 .agn-place'); if(!e){ if(n<60) setTimeout(function(){ watchBar(n+1); }, 1000); return; }
      try{ new MutationObserver(function(){ syncHeader(); paint(); }).observe(e,{childList:true,characterData:true,subtree:true}); }catch(_){} syncHeader(); paint(); })(0);
    ['agn:location','agn:view','agn:data'].forEach(function(n){ D.addEventListener(n, function(){ setTimeout(function(){ syncHeader(); mount(); }, 50); }); });
    setTimeout(syncHeader, 1500);
     
    var tries=0, t=setInterval(function(){ mount(); if(++tries>20) clearInterval(t); }, 3000);
  }
  if(D.readyState==='loading') D.addEventListener('DOMContentLoaded', start); else start();
  D.addEventListener('click',function(e){ var b=e.target&&e.target.closest&&e.target.closest('[data-agn-change-place]'); if(!b) return; e.preventDefault(); openSearch(); });
  G.AGN=G.AGN||{}; G.AGN.place={ name:placeName, change:openSearch };
})();
