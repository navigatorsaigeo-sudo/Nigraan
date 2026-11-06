


(function(G){
  'use strict';
  var D=document;
  /* v91.17.283.12 · THE ONE CALCULATION POINT, CLIENT SIDE (owner's standing rule: one server, one calculation point, every section
     reads from it). AGN.nowAt and AGN.pointState read the server's point state (GET /api/pointstate, /batch: server/api/pointstate.mjs),
     one record per place (0.01 deg) and model run; every page section that shows a weather value at a point calls these, at its source.
       get(lat,lon) / peek(lat,lon)   the record;  many(points)   many records, 40 per request
       asNow(ps)                      the record in the shape AGN.nowAt has always handed out (now + chain + support + build + days + hours)
       pf(lat,lon)                    the record in the shape of the retired /api/point/forecast answer
       provider(lat,lon,query)        the record in the provider's JSON shape for the query's hourly / current / daily fields (the sections
                                      that parsed a provider answer read the same fields from the point state; no provider request)
       fmt(t)                         the one print rule for "now": 0.1 C, a trailing .0 dropped */
  /* THE ONE IN-PAGE STORE (owner's design, 24 Oct): this store is the only code on the page that asks for /api/pointstate (and /batch,
     /near). A record is kept, per place, for the model run it belongs to: no section fetches on its own, a tab switch asks nothing, and a
     record is never re-read on a timer. The run stamp (GET /api/pointstate/run: model run + live-station read) is checked every 5 minutes;
     when it changes the whole store is dropped at once, the selected place is read again once, and every section is told together
     (agn:pointstate / agn:now, detail.run), so no section shows a value of another run. Section notices are coalesced (one per 300 ms). */
  var C={}, N={}, STAMP=null, RUN=null, EV=0;
  function fin(x){ return x!=null&&x!==''&&isFinite(+x); }
  function key(lat,lon){ return (Math.round(+lat*100)/100).toFixed(2)+','+(Math.round(+lon*100)/100).toFixed(2); }
  function fmt(t){ if(!fin(t)) return '\u2014'; var v=Math.round(+t*10)/10; return String(v===0?0:v); }
  function raw(u){ return fetch(u,{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }); }
  var PD={};
  function emit(det){ for(var x in (det||{})) PD[x]=det[x]; if(EV) return; EV=setTimeout(function(){ EV=0; var dd=PD; PD={}; try{ D.dispatchEvent(new CustomEvent('agn:pointstate',{detail:dd})); D.dispatchEvent(new CustomEvent('agn:now',{detail:dd})); }catch(_){} },300); }
  function put(k,v){ var old=C[k]&&C[k].v; C[k]={v:v,p:null}; if(v&&v.run){ if(RUN&&v.run!==RUN) checkRun(); else RUN=v.run; } if(v&&(!old||old.issuedAt!==v.issuedAt)) emit({key:k}); return v; }
  function psPeek(lat,lon){ if(!fin(lat)||!fin(lon)) return null; var c=C[key(lat,lon)]; return (c&&c.v)?c.v:null; }
  function psGet(lat,lon){ if(!fin(lat)||!fin(lon)) return Promise.resolve(null); var k=key(lat,lon), c=C[k];
    if(c&&c.v) return Promise.resolve(c.v); if(c&&c.p) return c.p; if(c&&c.fail&&Date.now()-c.at<30e3) return Promise.resolve(null);   /* a failed read is retried after 30 s, never in a loop */
    var kk=k.split(','), fl=function(){ C[k]={at:Date.now(),v:null,p:null,fail:true}; return null; }, p=raw('/api/pointstate?lat='+kk[0]+'&lon='+kk[1]).then(function(j){ return (j&&j.ok)?put(k,j):fl(); },fl);
    C[k]={v:null,p:p}; return p; }
  /* the places around a point ("Temperature now, place by place"): one record per point and radius, held like the others */
  /* v91.17.283.15 · a failed nearby read is kept for 30 s like a failed record (it was dropped at once, so the next caller asked again: the
     second /near of a selection was this retry, or the re-read after a run change) */
  function near(lat,lon,rad){ if(!fin(lat)||!fin(lon)) return Promise.resolve(null); var k=key(lat,lon)+'|'+(+rad||12), c=N[k]; if(c&&(!c.fail||Date.now()-c.at<30e3)) return c.p;
    var e={p:null,at:Date.now()}, fl=function(){ e.fail=true; e.at=Date.now(); return null; };
    e.p=raw('/api/pointstate/near?lat='+(+lat).toFixed(4)+'&lon='+(+lon).toFixed(4)+'&radius='+(+rad||12)).then(function(j){ return j||fl(); },fl);
    N[k]=e; return e.p; }
  /* v91.17.283.15 · item 3 · the provider products of a place (ensemble, models side by side, nowcast, skill archive, river flow, CMIP6,
     land inputs) are held by the server (GET /api/pointstate/product, server/api/pointprod.mjs: host, keys and rounding fixed there, one
     record per product, place and run) and read here once: a record is kept until the run stamp changes or its x-agn-valid-until passes;
     a failed read is not kept (the section's own retry rule asks again). The answer is handed out as a Response, so a section parses it
     as it parsed the provider's. */
  var PR={};
  function prodResp(x){ return new Response(JSON.stringify(x.j), {status:x.status>=200&&x.status<600?x.status:502, headers:{'content-type':'application/json'}}); }
  function product(name,q){ q=q||{}; var qs='name='+encodeURIComponent(name)+Object.keys(q).sort().map(function(k){ return '&'+encodeURIComponent(k)+'='+encodeURIComponent(q[k]); }).join('');
    var c=PR[qs], t=Date.now(); if(c&&!(c.until&&t>=c.until)) return c.p.then(prodResp);
    var e={at:t}, drop=function(){ if(PR[qs]===e) delete PR[qs]; };
    e.p=fetch('/api/pointstate/product?'+qs,{cache:'no-store'}).then(function(r){ var vu=Date.parse(r.headers.get('x-agn-valid-until')||''); if(isFinite(vu)) e.until=vu;
        return r.json().then(function(j){ if(!r.ok) drop(); return {status:r.status,j:j}; }); }).catch(function(){ drop(); return {status:502,j:{ok:false,error:'the server did not answer'}}; });
    PR[qs]=e; return e.p.then(prodResp); }
  /* the run watch: one small request every 5 minutes (only while the page is shown) */
  function activePt(){ try{ var a=G.AGN&&G.AGN.data&&G.AGN.data.activePoint?G.AGN.data.activePoint():null; return a&&fin(a.lat)&&fin(a.lon)?a:null; }catch(_){ return null; } }
  var CHK=null, LRUN=null;
  /* v91.17.283.15 · the issued levels follow their run stamp too (j.levels: the issued run the server serves): when it changes every
     levels cache on the page is told once (agn:levels-run) and reads again; no section re-reads the levels on a timer */
  function levelsRun(lv){ if(!lv) return; var first=LRUN==null; if(!first&&lv===LRUN) return; LRUN=lv;
    try{ D.dispatchEvent(new CustomEvent('agn:levels-run',{detail:{levels:lv, first:first}})); }catch(_){} }
  /* v91.17.283.15 · item 8: a check asked while one is in flight runs again after it (it returned the older request's promise, so a stamp
     that changed in between was seen only at the next 5-minute check) */
  function checkRun(){ if(CHK) return CHK.then(function(){ return checkRun(); }); CHK=raw('/api/pointstate/run').then(function(j){ CHK=null; if(!j||!j.stamp) return; levelsRun(j.levels);
      if(STAMP&&j.stamp!==STAMP){ C={}; N={}; PR={}; RUN=j.run; STAMP=j.stamp; var a=activePt(); (a?psGet(a.lat,a.lon):Promise.resolve(null)).then(function(){ emit({run:j.run}); }); return; }
      STAMP=j.stamp; RUN=j.run; },function(){ CHK=null; }); return CHK; }
  checkRun(); setInterval(function(){ try{ if(D.visibilityState==='hidden') return; }catch(_){} checkRun(); },5*60e3);
  /* v91.17.283.15 · item 8: the points of a batch are registered in the store BEFORE the batch is sent, so a section that asks for one of
     them meanwhile (a city pin while the 12-city sweep is in flight) joins the batch instead of sending its own /api/pointstate request */
  function many(pts){ var want=[],seen={},waits=[]; (pts||[]).forEach(function(p){ if(!p||!fin(p.lat)||!fin(p.lon)) return; var k=key(p.lat,p.lon); if(seen[k]) return; seen[k]=1; var c=C[k];
      if(c&&c.v) return; if(c&&c.p){ waits.push(c.p); return; } if(c&&c.fail&&Date.now()-c.at<30e3) return; want.push(k); });
    var jobs=[]; for(var i=0;i<want.length;i+=40){ (function(part){ var res={}; part.forEach(function(k){ C[k]={v:null,p:new Promise(function(r){ res[k]=r; })}; });
        jobs.push(raw('/api/pointstate/batch?pts='+part.join(';')).then(function(j){ var S0=(j&&j.states)||[]; part.forEach(function(k,n){ var st=S0[n]; if(st&&st.ok) res[k](put(k,st)); else { C[k]={at:Date.now(),v:null,p:null,fail:true}; res[k](null); } }); },
          function(){ part.forEach(function(k){ C[k]={at:Date.now(),v:null,p:null,fail:true}; res[k](null); }); })); })(want.slice(i,i+40)); }
    return Promise.all(jobs.concat(waits)).then(function(){ return (pts||[]).map(function(p){ return p&&fin(p.lat)?psPeek(p.lat,p.lon):null; }); }); }
  function machOn(ps){ return !!(ps&&ps.source&&ps.source.mach&&ps.source.mach.applied); }
  function srcWord(ps){ return machOn(ps)?'MACH forecast':'Model forecast'; }
  function heatWord(lv){ return (!lv||lv==='None')?'Normal':lv; }
  function build(ps){ var B=ps&&ps.build; if(!B||!fin(B.rawC)) return null;
    return { time:B.time, rawC:B.rawC, servedC:B.servedC, steps:(Math.abs(B.totalDeltaC||0)>=0.05?[{step:'NIGRAAN corrections ('+(B.steps||[]).join(', ')+')',deltaC:B.totalDeltaC}]:[]), liveApplied:!!B.liveApplied, liveWhy:B.liveWhy||null, note:B.note }; }
  function support(ps){ var m=ps.source&&ps.source.mach&&ps.source.mach.nearest; return m?{station:m.station,km:m.km,ageMin:m.ageMin,usable:m.usable}:null; }
  function chainOf(ps){ var C0=(ps.source&&ps.source.chain)||[], c=[{step:'forecast at this point',basis:C0[0]||''}]; C0.slice(1).forEach(function(x){ c.push({step:/^live MACH stations/.test(x)?'live MACH stations':x,basis:x}); }); return c; }
  function asNow(ps){ if(!ps||!ps.ok||!ps.now) return null; return Object.assign({},ps.now,{ lo90:null, hi90:null, chain:chainOf(ps).map(function(x){ return x.step; }), support:support(ps), build:build(ps), days:ps.days, hours:ps.hours, point:ps.point, pointState:ps }); }
  function asPf(ps){ if(!ps||!ps.ok) return {ok:false, why:(ps&&ps.why)||'the point state is not available'}; var a=ps.area||{};
    return { ok:true, issuedAt:ps.issuedAt, pointState:ps.key, run:ps.run, point:{lat:ps.point.lat,lon:ps.point.lon,tehsil:a.tehsil,district:a.district,province:a.province,elevM:ps.point.elevM,heightBasis:ps.point.heightBasis},
      now:Object.assign({},ps.now,{lo90:null,hi90:null}), days:ps.days, hours:ps.hours, chain:chainOf(ps), build:build(ps), support:support(ps), engineOnly:!machOn(ps),
      skill:ps.confidence&&ps.confidence.now?ps.confidence.now.text:null, source:ps.source, confidence:ps.confidence, note:'the point state: '+(ps.source&&ps.source.label||'') }; }
  var PMAP={temperature_2m:'tempC',relative_humidity_2m:'rh',dew_point_2m:'dewC',apparent_temperature:'feelsC',wind_speed_10m:'windKmh',wind_gusts_10m:'gustKmh',precipitation:'rainMm',rain:'rainMm',cloud_cover:'cloudPct',weather_code:'weatherCode',precipitation_probability:'rainProb',snowfall:'snowCm',surface_pressure:'pressureHpa',shortwave_radiation:'swRad'};
  var PDAY={temperature_2m_max:'tmaxC',temperature_2m_min:'tminC',precipitation_sum:'rainMm',wind_speed_10m_max:'windMaxKmh',wind_gusts_10m_max:'gustMaxKmh'};
  function lst(v){ return String(v||'').split(',').map(function(x){ return x.trim(); }).filter(Boolean); }
  /* the provider's JSON shape (one location) from a record; q: {hourly, current, daily, timezone, forecast_hours, past_hours}; fields the
     record does not hold are null (the section says "not available") */
  function provShape(ps,q){ q=q||{}; var utc=/^(GMT|UTC)$/i.test(String(q.timezone||'Asia/Karachi')), tOf=function(t){ return utc?new Date(Date.parse(t+':00+05:00')).toISOString().slice(0,16):t; };
    var o={latitude:ps.point.lat, longitude:ps.point.lon, elevation:ps.point.elevM, utc_offset_seconds:utc?0:18000, timezone:utc?'GMT':'Asia/Karachi', agn_pointstate:ps.key, agn_source:srcWord(ps)};
    var H=ps.hours||[], nowT=ps.now&&ps.now.time, ni=H.findIndex(function(h){ return h.time===nowT; }), fh=fin(q.forecast_hours)?+q.forecast_hours:null, ph=fin(q.past_hours)?+q.past_hours:null;
    var d0=H.length?String(H[0].time).slice(0,10):'', fd=fin(q.forecast_days)?+q.forecast_days:null, dayIx=function(t){ return Math.round((Date.parse(String(t).slice(0,10))-Date.parse(d0))/864e5); };
    var sel=H.filter(function(h,i){ return (fd==null||dayIx(h.time)<fd)&&(ni<0||((fh==null||i<ni+fh)&&(ph==null||i>=ni-ph))); });
    var hv=lst(q.hourly); if(hv.length){ o.hourly={time:sel.map(function(h){ return tOf(h.time); })}; hv.forEach(function(k){ var f=PMAP[k]; o.hourly[k]=sel.map(function(h){ return f&&h[f]!=null?h[f]:null; }); }); }
    var cv=lst(q.current); if(cv.length&&ps.now){ var h0=H[ni]||ps.now; o.current={time:tOf(ps.now.time),interval:3600}; cv.forEach(function(k){ var f=PMAP[k]; o.current[k]=f&&h0[f]!=null?h0[f]:null; }); }
    var dv=lst(q.daily); if(dv.length){ var Dd=(ps.days||[]).filter(function(d){ return fd==null||d.lead<fd; }); o.daily={time:Dd.map(function(d){ return d.date; })}; dv.forEach(function(k){ var f=PDAY[k]; o.daily[k]=Dd.map(function(d){ return f?d[f]:null; }); }); }
    return o; }
  function provider(lat,lon,q){ return psGet(lat,lon).then(function(ps){ return ps&&ps.ok?provShape(ps,q):null; }); }
  function providerMany(pts,q){ return many(pts).then(function(S){ return S.map(function(ps){ return ps&&ps.ok?provShape(ps,q):null; }); }); }
  /* new records repaint the city pins and chips once (their values are read from the record at their source, popHtml / pinMeasure) */
  D.addEventListener('agn:pointstate',function(){ try{ if(typeof G.refreshPins==='function') G.refreshPins(); }catch(_){} });
  G.AGN=G.AGN||{};
  G.AGN.pointState={ key:key, get:psGet, peek:psPeek, many:many, batch:many, fmt:fmt, asNow:asNow, pf:function(lat,lon){ return psGet(lat,lon).then(asPf); }, asPf:asPf,
    provider:provider, providerMany:providerMany, shape:provShape, heatWord:heatWord, sourceWord:srcWord, machOn:machOn, near:near,
    run:function(){ return {run:RUN, stamp:STAMP, levels:LRUN}; }, levelsRun:function(){ return LRUN; }, checkRun:checkRun, product:product, version:'v91.17.283.15' };
  /* the one place resolution (GET /api/geo/resolve) */
  G.AGN.resolvePlace=function(q){ return raw('/api/geo/resolve?q='+encodeURIComponent(String(q||''))).then(function(j){ return j&&j.ok?j:null; },function(){ return null; }); };
  function peek(lat,lon){ return asNow(psPeek(lat,lon)); }
  function get(lat,lon){ return psGet(lat,lon).then(asNow); }
  G.AGN.nowAt={peek:peek,get:get};
   
  G.AGN.ccOwned=function(){ try{ var off=(typeof DAY_OFFSET!=='undefined')?DAY_OFFSET:0; if(off!==0) return false; var p=G.AGN.data&&G.AGN.data.activePoint?G.AGN.data.activePoint():null; return !!(p&&p.lat!=null&&peek(p.lat,p.lon)); }catch(_){ return false; } };
  function r1(x){ return (Math.round(+x*10)/10).toFixed(1).replace(/\.0$/,''); }
   
  function cc(){ try{
      var off=(typeof DAY_OFFSET!=='undefined')?DAY_OFFSET:0; if(off!==0) return;
      var p=G.AGN.data&&G.AGN.data.activePoint?G.AGN.data.activePoint():null; if(!p||p.lat==null) return;
      var v=peek(p.lat,p.lon); if(!v){ get(p.lat,p.lon); return; }
      var el=D.getElementById('ccTemp'); if(el&&el.textContent!==r1(v.tempC)) el.textContent=r1(v.tempC);
      

      var fh=D.getElementById('ccHum'), fw=D.getElementById('ccWind'), ff=D.getElementById('ccFeels');
      if(fh&&v.rh!=null) AGN_putH(fh,Math.round(v.rh)+'<small>%</small>');
      if(fw&&v.windKmh!=null) AGN_putH(fw,Math.round(v.windKmh)+' <small>km/h</small>');    
      if(ff){ var tf=v.feelsC!=null?Math.round(v.feelsC)+'\u00b0':'\u2014'; if(ff.textContent!==tf) ff.textContent=tf; }
       
      try{ var cn=D.getElementById('comfortNarrative'); if(cn&&v.feelsC!=null){ var t0=cn.textContent, t1=t0.replace(/a (heat index|wind chill|heat-and-wind comfort temperature|feels-like temperature) of -?[\d.]+\u00B0C/,'a feels-like temperature of '+Math.round(v.feelsC)+'\u00B0C');
        if(t1!==t0) cn.textContent=t1; } }catch(_){}
      

      var cf=D.getElementById('ccConf'), chipEl=cf&&cf.querySelector('.conf-chip');
      if(chipEl){ var live=v.chain&&v.chain.indexOf('live MACH stations')>=0, sp=v.support;
        var lab=live?'Station-supported this hour':'Model estimate (no live station correction this hour)', col=live?'#14B8A6':'#94a3b8';
        var tt=live?('A live MACH station within reach corrected this hour'+(sp&&sp.km!=null?' (nearest '+sp.km+' km)':'')+'. Accuracy: see the methods document; independent forward testing starts October 2026.')
                   :('No live station correction applies here this hour'+(sp&&sp.km!=null?' (nearest station '+sp.km+' km)':'')+': this is the national model at this point\u2019s height.');
        if(chipEl.getAttribute('data-agn-support')!==lab){ chipEl.setAttribute('data-agn-support',lab); chipEl.setAttribute('data-tier',live?'station':'model'); chipEl.title=tt;
          chipEl.innerHTML='<span class="conf-swatch" style="background:'+col+'"></span>'+lab; } }
      var n=D.getElementById('agnCcNow122'); if(!n&&el){ var host=el.closest('.card')||el.parentNode; n=D.createElement('div'); n.id='agnCcNow122'; n.style.cssText='font-size:12px;opacity:.92;margin:4px 0 2px';
        var a=host.querySelector('.asof'); if(a&&a.parentNode) a.parentNode.insertBefore(n,a.nextSibling); else { var b=el.closest('div'); (b&&b.parentNode?b.parentNode:host).appendChild(n); } }
      if(n){ var t='Corrected for this place this hour'+(v.lo90!=null?' (90 % range '+r1(v.lo90)+'–'+r1(v.hi90)+' °C)':'')+(v.chain&&v.chain.indexOf('live MACH stations')>=0?', including the live MACH stations nearby':'')+'; the Overview bar, the map and the AI show this same value.'+(v.utciShadeC!=null?' Now in shade: UTCI '+r1(v.utciShadeC)+' °C, '+String(v.utciClass||'').toLowerCase()+' (humidity, wind and feels-like are this same hour).':'');
        if(n.textContent!==t) n.textContent=t; }
    }catch(_){} }
  D.addEventListener('agn:now',function(){ setTimeout(cc,30); });
   
  (function watch(n){ var el=D.getElementById('ccTemp'); if(!el){ if(n<200) setTimeout(function(){ watch(n+1); },1000); return; }
    var busy=false; new MutationObserver(function(){ if(busy) return; busy=true; try{ cc(); }finally{ setTimeout(function(){ busy=false; },0); } }).observe(el,{childList:true,characterData:true,subtree:true});
    ['ccHum','ccWind','ccFeels'].forEach(function(id){ var e2=D.getElementById(id); if(e2) new MutationObserver(function(){ if(busy) return; busy=true; try{ cc(); }finally{ setTimeout(function(){ busy=false; },0); } }).observe(e2,{childList:true,characterData:true,subtree:true}); }); })(0);
  ['agn:location','agn:data','agn:enriched','agn:view'].forEach(function(e){ D.addEventListener(e,function(){ setTimeout(cc,400); }); });
  setInterval(cc,5000);
   
  function lsNote(){ try{ var n=D.getElementById('v3legend'); if(!n) return; var k=null; try{ var o=G.AGN.olState&&G.AGN.olState(); k=(o&&o.id)||((typeof G.currentMapLayer==='function')?G.currentMapLayer():null); }catch(_){}
      var on=(k==='landslide'||k==='ls:odds'), el=n.querySelector('.agn-ls-note');
      if(on&&!el){ el=D.createElement('div'); el.className='agn-leg-row agn-ls-note'; el.style.cssText='font-size:11px;line-height:1.35;color:#5a3b00;margin-top:4px';
        el.textContent='Rain-triggered slides only: slides and debris flows set off by snow or ice melt, thaw, a lake outburst or an earthquake are not in this layer.'; n.appendChild(el); }
      else if(!on&&el) el.remove(); }catch(_){} }
  setInterval(lsNote,10000); D.addEventListener('agn:dom',lsNote);
})(window);
