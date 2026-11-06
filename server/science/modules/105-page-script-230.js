


(function(){
  'use strict';
  var G=window; G.AGN=G.AGN||{};
   
  var ON=false; try{ var nv=(performance.getEntriesByType&&performance.getEntriesByType('navigation')[0])||null; ON=/[?&]engine=1\b/.test(((nv&&nv.name)||'')+' '+(location.search||'')); }catch(_){ ON=/[?&]engine=1\b/.test(location.search||''); }
  G.AGN.engineMode=ON;
  var MAXDAY=3, last={sig:'',at:0}, busy=false;
  

  function wxCover(){ try{ var n=0,m=0; for(var k in DISTRICT_IN){ n++; var r=DISTRICT_IN[k], f=r&&r.fc72; if(f&&f.time&&f.time.length>=22) m++; } return n?m/n:0; }catch(_){ return 0; } }    
  var lastFill=0;
  function fill(){ try{ if(wxCover()<0.95 && Date.now()-lastFill>5*60e3 && G.MACH_FAST && MACH_FAST.ensureDistrictAQI){ lastFill=Date.now(); MACH_FAST.ensureDistrictAQI(); return true; } }catch(_){} return false; }
  function ready(){ try{ var sw=AGN.hz5&&AGN.hz5.sweep&&AGN.hz5.sweep(); return !!(sw&&sw.done&&G.DISTRICT_IN&&G.hzDayInput&&AGN.selfcheck&&AGN.selfcheck.unitOn&&AGN.day) && (wxCover()>=0.95 || Date.now()-T0>30*60e3); }catch(_){ return false; } }
  function dayCapable(hz){ try{ return typeof G.hzDayCapable==='function' ? !!G.hzDayCapable(hz) : false; }catch(_){ return false; } }
  function pktDate(d){ return new Date(Date.now()+5*3600e3+d*864e5).toISOString().slice(0,10); }
  

  var fcContent=function(){ var h=0, n=0; try{ var K=Object.keys(G.DISTRICT_IN||{}).sort(); for(var i=0;i<K.length;i++){ var r=DISTRICT_IN[K[i]], f=r&&r.fc72; if(!f||!f.time) continue; n++;
      var s=K[i]+'|'+f.time[0]+'|'+f.time.length; for(var c=0;c<s.length;c++) h=(Math.imul(h,31)+s.charCodeAt(c))|0;
      ['temp','rain','gust','hum'].forEach(function(v){ var a=f[v]; if(!a) return; for(var j=0;j<a.length;j++){ var x=a[j]; h=(Math.imul(h,31)+(x==null?7:Math.round(x*10)))|0; } }); } }catch(_){} return n+':'+(h>>>0).toString(36); };
  function fcSig(){ var n=0,s=0; try{ for(var k in DISTRICT_IN){ var r=DISTRICT_IN[k]; if(r&&r.fcUpdatedAt){ n++; s=Math.max(s,r.fcUpdatedAt); } } }catch(_){} return n+':'+Math.floor(s/600e3); }
  function derive(){
    var t0=Date.now(), U=AGN.selfcheck.units(), LY=AGN.selfcheck.layers(), D0=AGN.day, realGet=D0.get, realBasis=D0.basis, days=[];
    try{
      for(var d=0; d<=MAXDAY; d++){
        D0.get=function(){ return d; }; D0.basis=function(){ return 'peak'; };
        var day={day:d, date:pktDate(d), basis:'peak', layers:{}};
        LY.forEach(function(hz){
          if(d>0 && !dayCapable(hz)) return;
          var L={}, S={}, c=[0,0,0,0,0], na=0, nd=0;
          U.forEach(function(p){ var u=AGN.selfcheck.unitOn(hz,p); L[u.uid]=u.lv; if(u.lv===-2) na++; else if(u.lv===-1||u.lv===-3) nd++; else c[u.lv]++;
            if(u.lv>=0 && u.r){ var sc=(u.r.score!=null?u.r.score:u.r.mapValue); if(sc!=null&&isFinite(+sc)) S[u.uid]=Math.round(+sc*10)/10; } });
          var placed=c.reduce(function(a,b){ return a+b; },0);
          day.layers[hz]={L:L, S:S, counts:c, na:na, nd:nd, coverage:U.length?Math.round(1000*(placed+na)/U.length)/1000:0};
        });
        days.push(day);
      }
    } finally { D0.get=realGet; D0.basis=realBasis; }
    

    var alertsFull=[], alertsCtx=null;
    try{ alertsCtx={ day:(AGN.day&&AGN.day.get)?AGN.day.get():0, basis:(AGN.day&&AGN.day.basis)?AGN.day.basis():null, lead:(G.aiState&&aiState.lead)||24 }; }catch(_){}
    try{ (G.activeAlerts?G.activeAlerts():[]).forEach(function(a){ try{ alertsFull.push(JSON.parse(JSON.stringify(a))); }catch(_){} }); }catch(_){}
     
    var verdictsFull=null;
    try{ var V=(typeof G.allDistrictVerdicts==='function')?G.allDistrictVerdicts():null;
      if(Array.isArray(V)){ var cv=V.coverage||{}, rows=JSON.parse(JSON.stringify(V)), js=JSON.stringify(rows).length;
        if(js<2.5e6) verdictsFull={ rows:rows, orderBasis:V.orderBasis||null, unitLevel:V.unitLevel||null,
          coverage:(function(){ var c={}; Object.keys(cv).forEach(function(k){ if(typeof cv[k]!=='function') c[k]=cv[k]; });
                                 c.units=(typeof cv.unassessedUnits==='function')?cv.unassessedUnits():[]; return c; })() }; } }catch(_){ verdictsFull=null; }
    var alerts=[]; try{ (G.activeAlerts?G.activeAlerts():[]).forEach(function(a){ alerts.push({name:a.name||null, district:a.district||null, hazard:a.hazard||null, alert:a.alert||null, sev:a.sev!=null?a.sev:null, band:a.band!=null?a.band:null, hazards:(a.holders||[]).map(function(h){ return h.hazard; })}); }); }catch(_){}
    return {at:new Date().toISOString(), build:((G.AGN_BUILD&&AGN_BUILD.patch)||null), gate:(G.AGN_MODEL_GATE&&AGN_MODEL_GATE.version)||null,
            words:(AGN.hz5&&AGN.hz5.words)||null, units:U.length, unitKeys:Object.fromEntries(U.map(function(p){ return [p.uid||p.key,p.key]; })),
            days:days, alerts:alerts, alertsFull:alertsFull, alertsCtx:alertsCtx, verdictsFull:verdictsFull, fcc:fcContent(), ms:Date.now()-t0, fc:fcSig(), wxCover:Math.round(1000*wxCover())/1000};
  }
  

  function lvSig(r){ var h=0, s=JSON.stringify(r.days.map(function(d){ return [d.date, Object.keys(d.layers).map(function(k){ return [k, d.layers[k].L]; })]; }))+JSON.stringify(r.alerts)+'|'+(r.fcc||'');    
    for(var i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; } return String(h); }
  

  var T0=Date.now();
  function fcAgeMin(){ var s=0; try{ for(var k in DISTRICT_IN){ var r=DISTRICT_IN[k]; if(r&&r.fcUpdatedAt&&r.fcUpdatedAt>s) s=r.fcUpdatedAt; } }catch(_){} return s?(Date.now()-s)/60e3:null; }
  var lastFresh=0;
  function freshen(){ try{ var a=fcAgeMin(); if(a!=null && a>55 && Date.now()-lastFresh>20*60e3 && G.MACH_FAST && MACH_FAST.ensureDistrictAQI){ lastFresh=Date.now(); MACH_FAST.ensureDistrictAQI(); return true; } }catch(_){} return false; }
  

  var lastRiver=0;
  function riverRetry(){ try{ if(typeof G.riverSweep!=='function'||typeof RIVER_STATE==='undefined') return false;
      if(RIVER_STATE.loaded||RIVER_STATE.loading||Date.now()-lastRiver<9*60e3) return false; lastRiver=Date.now();
      G.riverSweep(true).then(function(st){ if(st&&st.loaded){ try{ if(G.AGN&&AGN.data&&AGN.data.rivers) AGN.data.rivers(); }catch(_){} try{ if(typeof G.refresh==='function') G.refresh(); }catch(_){} } }).catch(function(){});
      return true; }catch(_){ return false; } }
  G.AGN_ENGINE_RIVER_RETRY=riverRetry;
  function tick(force){
    if(!ON||busy||!ready()) return;
    if(!force && (freshen() || fill() || riverRetry())) return;    
    busy=true;
    try{ var r=derive(), sig=lvSig(r); G.AGN.engine.lastRun={at:r.at, ms:r.ms, days:r.days.length, changed:sig!==last.sig};
      if(force || sig!==last.sig || Date.now()-last.at>=3600e3){ last={sig:sig,at:Date.now()};
        fetch('/api/engine/report',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(r)}).catch(function(){}); } }
    catch(e){ try{ console.warn('[engine] derive failed', e&&e.message); }catch(_){} }
    finally{ busy=false; }
    if(Date.now()-T0>3*3600e3) setTimeout(function(){ try{ location.reload(); }catch(_){} },20e3);
  }
  G.AGN.engine={derive:derive, tick:function(){ tick(true); }, on:ON, lastRun:null, fcAgeMin:fcAgeMin, wxCover:wxCover};
  

  function settle(prev,tries){ if(!ready()){ fill(); setTimeout(function(){ settle(null,tries); },15e3); return; }
    riverRetry();
    var sig=null; try{ sig=lvSig(derive()); }catch(_){}
    if(prev!=null && sig===prev || tries>=15){ tick(true); return; }
    setTimeout(function(){ settle(sig,tries+1); },60e3); }
  if(ON){ setInterval(function(){ tick(false); },600e3); setTimeout(function(){ settle(null,0); },60e3); }
   
})();
