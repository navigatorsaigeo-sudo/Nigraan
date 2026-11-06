
(function(){
  

  var D=document, BASE=location.origin, cache={}, pending={}, rerun={};
  window.AGN_CLIM_BASELINE=window.AGN_CLIM_BASELINE||{};
  function sel(){ try{ return (window.STATIONS||[]).find(function(x){ return x.id===(window.selectedId||''); })||(window.STATIONS||[])[0]; }catch(_){ return null; } }
  function subjectPt(){ try{ var s=window.AGN&&AGN.subject&&AGN.subject.get&&AGN.subject.get(); if(s&&s.asset_lat!=null&&s.asset_lon!=null) return {lat:Number(s.asset_lat),lon:Number(s.asset_lon),asset:true}; }catch(_){} return null; }
  function setStation(s,j){ s.t95=j.t95; s.t95Basis=Object.assign({}, j.t95Basis, { unit: j.unit, unitKm: j.km }); s.t95Climatology=j; }
  function rerender(){ try{ var h=D.getElementById('asmtEngHorizon'); if(h) h.dispatchEvent(new Event('change',{bubbles:true})); }catch(_){} }
  function store(j){ window.AGN_CLIM_BASELINE[j.unit]=j; var k=String(j.unit).split('|').pop(); if(k) window.AGN_CLIM_BASELINE[k]=window.AGN_CLIM_BASELINE[k]||j;
    try{ setTimeout(function(){ D.dispatchEvent(new Event('agn:eng-baseline')); },0); }catch(_){} }    
  function fetchFor(lat,lon){ var k=lat.toFixed(3)+','+lon.toFixed(3); if(cache[k]) return Promise.resolve(cache[k]); if(pending[k]) return pending[k];
    pending[k]=fetch(BASE+'/api/climatology/baseline?lat='+lat+'&lon='+lon,{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).then(function(j){ pending[k]=null; if(!j||!j.ready) return null; cache[k]=j; store(j); return j; }).catch(function(){ pending[k]=null; return null; }); return pending[k]; }
  function apply(){
    var s=sel(); if(s&&s.lat!=null) fetchFor(s.lat,s.lon).then(function(j){ if(j&&!(s.t95Basis&&s.t95Basis.isClimatology===true)){ setStation(s,j); rerender(); } });
    var p=subjectPt(); if(p) fetchFor(p.lat,p.lon).then(function(j){ if(!j) return; var el=D.getElementById('asmtEngStress'); var txt=el?el.textContent:'';
      if(el&&/only a short sample|no temperature climatology/.test(txt)&&!rerun[j.unit]){ rerun[j.unit]=true; try{ var b=D.getElementById('asmtRun'); if(b) b.click(); }catch(_){} } });
  }
  D.addEventListener('agn:data',function(){ setTimeout(apply,1500); });
  D.addEventListener('click',function(e){ if(e.target&&e.target.closest&&e.target.closest('[data-goto="assessments"]')) setTimeout(apply,900); },true);
  setTimeout(apply,7000);
  setInterval(function(){ var v=D.querySelector('.view[data-view="assessments"]'); if(v&&v.classList.contains('active')) apply(); },5000);
})();
