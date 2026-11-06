
(function(){
  var norm=function(s){ return String(s||'').replace(/\s+/g,' ').trim().toLowerCase(); };
  function sweep(){ var b=[].slice.call(document.querySelectorAll('.agn-v91-story-head .agn-v91-head-line b')).filter(function(x){ return x.getBoundingClientRect().height>0; })[0]; if(!b) return;     var t=norm(b.textContent); if(!t) return;
    document.querySelectorAll('.agn-hero h1,.agn-hero h2,.asmt-hero h1,.asmt-hero h2,.opsx-hero h1,.opsx-hero h2,.hybrid-hero h1,.hybrid-hero h2,.ml-hero h1,.ml-hero h2,.agn-v91-exec-hero h1,.agn-v91-exec-hero h2,.ai-clean-hero h1,.ai-clean-hero h2').forEach(function(h){
      var same=norm(h.textContent)===t; h.classList.toggle('agn-hero-dup',same);
      var p=h.previousElementSibling; if(p&&/eyebrow/i.test(p.className)) p.classList.toggle('agn-hero-dup',same); }); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ setTimeout(sweep,500); }); else setTimeout(sweep,500);
  document.addEventListener('click',function(e){ if(e.target&&e.target.closest&&e.target.closest('[data-goto]')) { setTimeout(sweep,400); setTimeout(sweep,1500); } },true);
  

  (function fleet(){ var el=null, last=null;
    

    function pt(){ try{ var d=window.AGN&&AGN.dataServices?AGN.dataServices.require('domain'):null; var ap=d&&d.activePoint(); if(ap&&ap.lat!=null&&ap.lon!=null&&Number.isFinite(+ap.lat)&&Number.isFinite(+ap.lon)) return {lat:+ap.lat,lon:+ap.lon}; }catch(_){} return null; }
    function esc(v){ return String(v==null?'':v).replace(/[&<>]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; }); }
    function draw(s){ el=el||document.getElementById('agnFleetNearby'); if(!el) return; if(!s){ el.hidden=true; return; }
      el.hidden=false; el.innerHTML='<b>Observed nearby</b> · MACH '+esc(s.no!=null?s.no:'')+' '+esc(s.name)+((window.AGN&&AGN.stationStatus&&AGN.stationStatus.html(s))?' '+AGN.stationStatus.html(s):'')+' · '+esc(s.km)+' km · '+(s.tempC!=null?esc(Math.round(s.tempC*10)/10)+' °C':'—')+(s.rhPct!=null?' · '+esc(Math.round(s.rhPct))+' % RH':'')+(s.windKmh!=null?' · '+esc(Math.round(s.windKmh))+' km/h':'')+' · '+esc(s.ageMin)+' min ago <i>our own station, consumer-grade, roof-sited; shown beside the model number, not scored</i>'; }
    function keyOf(p){ return p?p.lat.toFixed(3)+','+p.lon.toFixed(3):null; }
    /* v91.17.283.19 · the place's ONE nearest station, from the page store (GET /api/point, read once per place) */
    function tick(){ var p=pt(); if(!p){ el=el||document.getElementById('agnFleetNearby'); if(el) el.hidden=true; return; } var k=keyOf(p); AGN.pointState.station(p.lat,p.lon).then(function(s){ if(keyOf(pt())!==k) return; last=k; draw(s); }).catch(function(){}); }
    setTimeout(tick,6000); document.addEventListener('agn:now',function(){ setTimeout(tick,300); }); document.addEventListener('agn:data',function(){ setTimeout(tick,1500); }); document.addEventListener('agn:location',function(){ el=el||document.getElementById('agnFleetNearby'); if(el) el.hidden=true; setTimeout(tick,800); }); })();
})();
