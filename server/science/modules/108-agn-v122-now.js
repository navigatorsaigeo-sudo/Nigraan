


(function(G){
  'use strict';
  var D=document;
  /* v91.17.283.19 · ONE SERVER CALL DRIVES THE PAGE (owner's rule: one server, one calculation point, every section reads it).
     THE ONE IN-PAGE STORE. A place is asked ONCE: GET /api/point (server/api/point.mjs), the place bundle of the place and run: the place
     table's record (its name is the one label of every section), the corrected now / hours / days (the served chain, MOS included), the
     one nearest station, and the parts every section reads (levels, outlook, seasonal, smog, site screening and risk, river link, lakes
     upstream, climatology baseline, past 30 days, report context, the frozen model run, facts, places nearby, land-surface inputs).
     v91.17.283.20 · B8: the first answer of a new place carries the place, now / hours / days and the station at once; its parts that
     were not ready are pending (B.pending) and the store makes ONE completion read of the same bundle (&complete=1, the server answers
     when every pending part has settled); part() of a pending part waits for that read. The operator parts (state, mos) are served only
     in the operator view: switching it on reads the selected place once more.
     Any other point the page shows (a city label, a station, a district point) is a corrected record without parts: the points asked in
     the same moment go in ONE GET /api/point/batch. Nothing is re-read on a timer or on a tab switch: the bundle stamp (bundleStamp of
     GET /api/pointstate/run: model run + live-station read + issued levels) is checked every 5 minutes; when it changes the whole store
     is dropped at once, the selected place is read again once, and every section is told together (agn:pointstate / agn:now,
     detail.run). Section notices are coalesced (one per 300 ms).
       get(lat,lon) / peek(lat,lon)   the record (a place: its bundle);  many(points)   records of many points, one batch
       bundle(lat,lon)                the place bundle;  part(name,lat,lon)   one part of it (the value its retired route answered)
       station(lat,lon)               the one nearest station (its reading is an observation);  hint(lat,lon,{id,name})   a place's id
       asNow(ps) / pf(lat,lon) / provider(lat,lon,query)   the record in the shapes the older sections read (no provider request)
       fmt(t)                         the one print rule for "now": 0.1 C, a trailing .0 dropped */
  var C={}, HINT={}, STAMP=null, RUN=null, EV=0, QB=null;
  function fin(x){ return x!=null&&x!==''&&isFinite(+x); }
  function key(lat,lon){ return (+lat).toFixed(5)+','+(+lon).toFixed(5); }   /* v283.23: the point as asked (about 1 m), the server's key and the start page's request: one place, one record */
  /* the bundle handed over by the start page (AGN_BOOT.handoff v2, same place) is kept at once; the first stamp check below keeps it when
     its stamp is the one the server serves, else drops it and reads the place once */
  var HO=null; try{ var _b=G.AGN_BOOT; if(_b&&_b.handoff&&_b.handoff.ps&&_b.handoff.ps.place){ HO=_b.handoff; var _p=HO.ps.place; C[key(_p.lat,_p.lon)]={v:HO.ps,p:null,full:true,ho:true}; HINT[key(_p.lat,_p.lon)]={id:_p.id||HO.id||null,name:_p.name||null}; RUN=HO.ps.run; } }catch(_){ HO=null; }
  var HOK=null;   /* the first stamp check (a promise) */
  function fmt(t){ if(!fin(t)) return '—'; var v=Math.round(+t*10)/10; return String(v===0?0:v); }
  function raw(u){ return fetch(u,{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }); }
  var PD={};
  function emit(det){ for(var x in (det||{})) PD[x]=det[x]; if(EV) return; EV=setTimeout(function(){ EV=0; var dd=PD; PD={}; try{ D.dispatchEvent(new CustomEvent('agn:pointstate',{detail:dd})); D.dispatchEvent(new CustomEvent('agn:now',{detail:dd})); }catch(_){} },300); }
  function pend(v){ return v&&v.pending&&v.pending.length?v.pending.length:0; }
  /* v91.17.283.22 · item 1: a part held by the provider limit ("not available right now (provider limit) - retrying") is computed again by
     the server on its own; the store reads the same bundle once at the earliest retryAt (one read per retry, never a loop) */
  function limitRead(k,v){ var c=C[k], P=v&&v.parts; if(!c||!P||c.lr) return; var t=Object.keys(P).map(function(n){ return P[n]&&P[n].limited&&P[n].retryAt?Date.parse(P[n].retryAt):NaN; }).filter(isFinite); if(!t.length) return;
    c.lr=setTimeout(function(){ var x=C[k]; if(x) x.lr=null; if(!x||!x.v) return; raw((x.v.self||pointUrl(k))+'&complete=1').then(function(j){ if(j&&j.ok) put(k,j,true); },function(){}); }, Math.max(1000,Math.min.apply(null,t)-Date.now()+3000)); }
  function put(k,v,full){ var old=C[k]&&C[k].v, cp=C[k]&&C[k].cp, op=C[k]&&C[k].op, lr=C[k]&&C[k].lr, odb=C[k]&&C[k].odb;
    /* v91.17.283.38 · item 2: a part read on demand (left out of the first answer) is kept when the same bundle is read again */
    if(old&&old.parts&&v&&v.parts&&v.omitted&&old.stamp===v.stamp){ v.omitted.slice().forEach(function(n){ var x=old.parts[n]; if(x&&!x.pending&&!v.parts[n]) v.parts[n]=x; }); v.omitted=v.omitted.filter(function(n){ return !v.parts[n]; }); }
    C[k]={v:v,p:null,full:!!full,cp:cp||null,op:op||null,lr:lr||null,odb:odb||null}; if(v&&v.run){ if(RUN&&v.run!==RUN) checkRun(); else RUN=v.run; }
    var chg=function(a,b){ var A0=a&&a.parts||{}, B0=b&&b.parts||{}; return Object.keys(B0).some(function(n){ return !A0[n]||!!A0[n].limited!==!!B0[n].limited||!!A0[n].ok!==!!B0[n].ok; }); };
    if(v&&(!old||old.issuedAt!==v.issuedAt||old.view!==v.view||(full&&!old.parts)||(pend(old)&&!pend(v))||chg(old,v))) emit({key:k, complete:!pend(v)}); if(full) limitRead(k,v); return v; }
  /* v91.17.283.20 · B8: the ONE completion read of a bundle whose parts were pending (the same bundle, &complete=1); kept on the entry so
     a second caller waits on it; a failed read leaves the first answer (its pending parts say why) */
  function complete(k){ var c=C[k]; if(!c||!c.v||!c.full||!pend(c.v)) return Promise.resolve(c&&c.v||null); if(c.cp) return c.cp;
    c.cp=raw((c.v.self||pointUrl(k))+'&complete=1').then(function(j){ if(j&&j.ok){ return put(k,j,true); } return (C[k]&&C[k].v)||null; },function(){ return (C[k]&&C[k].v)||null; }); return c.cp; }
  function activePt(){ try{ var a=G.AGN&&G.AGN.data&&G.AGN.data.activePoint?G.AGN.data.activePoint():null; return a&&fin(a.lat)&&fin(a.lon)?a:null; }catch(_){ return null; } }
  function isPlace(k){ if(HINT[k]) return true; var a=activePt(); return !!(a&&key(a.lat,a.lon)===k); }
  /* a place the page is about to show (a search row, the handoff): its id and name, so its bundle is asked by the place table's id */
  function hint(lat,lon,o){ if(!fin(lat)||!fin(lon)) return; o=o||{}; HINT[key(lat,lon)]={id:o.id||null,name:o.name||null}; }
  function pointUrl(k){ var h=HINT[k]||{}, kk=k.split(','); return '/api/point?'+(h.id?'id='+encodeURIComponent(h.id):'lat='+kk[0]+'&lon='+kk[1]+(h.name?'&name='+encodeURIComponent(h.name):'')); }
  /* the place bundle: held, in flight, or ONE request */
  function bundle(lat,lon){ if(!fin(lat)||!fin(lon)) return Promise.resolve(null); var k=key(lat,lon), c=C[k];
    if(!HINT[k]) HINT[k]={id:null,name:null};
    if(c&&c.v&&c.full) return Promise.resolve(c.v); if(c&&c.bp) return c.bp; if(c&&c.bfail&&Date.now()-c.at<30e3) return Promise.resolve(null);   /* a failed read is retried after 30 s, never in a loop */
    var e=C[k]||(C[k]={v:null,p:null}), fl=function(){ var x=C[k]||(C[k]={v:null}); x.bp=null; x.bfail=true; x.at=Date.now(); return null; };
    e.bp=raw(pointUrl(k)).then(function(j){ if(j&&j.ok){
        /* v283.38 item 3: a read kept across a stamp change that was answered under the older stamp is read once more (never twice) */
        if(STAMP&&j.stamp&&j.stamp!==STAMP&&!e.re){ var e2=C[k]||(C[k]={v:null,p:null}); e2.re=true; e2.bp=null; return bundle(lat,lon); }
        var o=put(k,j,true); if(pend(o)) complete(k); return o; } return fl(); },fl); return e.bp; }
  function psPeek(lat,lon){ if(!fin(lat)||!fin(lon)) return null; var c=C[key(lat,lon)]; return (c&&c.v)?c.v:null; }
  /* v91.17.283.28 · the place's bundle read failed (the screen shows "not available"): the report gate opens on it so the report says the same */
  function psFailed(lat,lon){ if(!fin(lat)||!fin(lon)) return false; var c=C[key(lat,lon)]; return !!(c&&!c.v&&!c.bp&&(c.bfail||c.fail)); }
  function psGet(lat,lon){ if(!fin(lat)||!fin(lon)) return Promise.resolve(null); var k=key(lat,lon), c=C[k];
    if(c&&c.v) return Promise.resolve(c.v); if(c&&c.bp) return c.bp; if(c&&c.p) return c.p; if(c&&c.fail&&Date.now()-c.at<30e3) return Promise.resolve(null);
    if(isPlace(k)) return bundle(lat,lon);
    return many([{lat:+lat,lon:+lon}]).then(function(a){ return a[0]; }); }
  /* one part of a place's bundle: the value the part's retired route answered; a part the server could not compute is
     {ready:false, unavailable:true, why} (the section shows its own "not available" line; nothing is asked again) */
  function partOf(B,name){ if(!B) return {ready:false, unavailable:true, why:'the place could not be read'}; var x=B.parts&&B.parts[name];
    if(!x) return {ready:false, unavailable:true, why:'not part of this place’s record'}; if(x.pending) return {ready:false, unavailable:true, pending:true, why:x.why||'being computed'}; if(x.unavailable) return {ready:false, unavailable:true, why:x.why||'not available'}; return x.v; }
  /* a part that is pending in the held bundle is read from the completion read (one per bundle) */
  /* v91.17.283.38 · item 2: the large parts no section shows at first paint (CMIP6, report context, ensemble shares, ...) are left out of the
     first answer (B.omitted); the first part() of one of them reads them from the SAME bundle once (?parts=<names>&complete=1), every part
     asked within 30 ms in that one request */
  function od(k,name){ var c=C[k]; if(!c||!c.v) return Promise.resolve(c&&c.v||null); var b=c.odb;
    if(!b||b.sent){ b=c.odb={names:[],sent:false}; b.p=new Promise(function(res){ setTimeout(function(){ b.sent=true; var v=C[k]&&C[k].v; if(!v){ res(null); return; }
      var u=String(v.self||pointUrl(k)).replace(/([?&])parts=[^&]*(&|$)/,'$1').replace(/[?&]$/,'');
      raw(u+(u.indexOf('?')<0?'?':'&')+'parts='+b.names.map(encodeURIComponent).join(',')+'&complete=1').then(function(j){ var c2=C[k];
        if(j&&j.ok&&c2&&c2.v&&c2.v.stamp===j.stamp){ var P=c2.v.parts||(c2.v.parts={}); b.names.forEach(function(n){ if(j.parts&&j.parts[n]) P[n]=j.parts[n]; }); if(c2.v.omitted) c2.v.omitted=c2.v.omitted.filter(function(n){ return !P[n]; }); }   /* no section notice: the caller of part() has its value; nothing else read it */
        res(C[k]&&C[k].v||null); },function(){ res(C[k]&&C[k].v||null); }); },30); }); }
    if(b.names.indexOf(name)<0) b.names.push(name); return b.p; }
  function part(name,lat,lon){ var a=(fin(lat)&&fin(lon))?{lat:lat,lon:lon}:activePt(); if(!a) return Promise.resolve(null); var k=key(a.lat,a.lon);
    return bundle(a.lat,a.lon).then(function(B){ if(B&&B.omitted&&B.omitted.indexOf(name)>=0&&!(B.parts&&B.parts[name])) return od(k,name).then(function(B2){ return partOf(B2||B,name); });
      var x=B&&B.parts&&B.parts[name]; if(x&&x.pending) return complete(k).then(function(B2){ return partOf(B2||B,name); }); return partOf(B,name); }); }
  function partResp(name,lat,lon){ return part(name,lat,lon).then(function(v){ var bad=!v||v.unavailable; return new Response(JSON.stringify(v||{ready:false,why:'not available'}),{status:bad?503:200,headers:{'content-type':'application/json'}}); }); }
  /* the ONE nearest station of a place, in the shape the station lines read (name, km, tempC, rhPct, windKmh, ageMin, lastUpdated);
     null when there is none (why: the bundle's reason) */
  function stationOf(B){ var s=B&&B.station; if(!s||!s.ok) return null; var r=s.reading||{};
    return {name:s.name, key:s.id||null, no:s.no!=null?s.no:null, km:s.km, ageMin:s.ageMin, status:s.status||null, stationElevM:s.stationElevM, pointElevM:s.pointElevM, tempC:r.tempC, rhPct:r.rh, windKmh:r.windKmh, lastUpdated:r.observedAt||null, kind:'station', rule:s.rule}; }
  function station(lat,lon){ var a=(fin(lat)&&fin(lon))?{lat:lat,lon:lon}:activePt(); if(!a) return Promise.resolve(null); return bundle(a.lat,a.lon).then(stationOf); }
  function stationWhy(B){ return B&&B.station&&!B.station.ok?(B.station.why||null):null; }
  function place(lat,lon){ var a=(fin(lat)&&fin(lon))?{lat:lat,lon:lon}:activePt(); if(!a) return Promise.resolve(null); return bundle(a.lat,a.lon).then(function(B){ return B&&B.place||null; }); }
  function placePeek(lat,lon){ var B=psPeek(lat,lon); return B&&B.place||null; }
  /* the issued levels of a tehsil when it is the tehsil of a place the store holds (or is reading): that bundle's levels part; null when
     no held place lies in it (a map click on another tehsil reads that tehsil) */
  function levelsFor(uid){ uid=String(uid||''); if(!uid) return null; for(var k in C){ var c=C[k]; if(c&&c.v&&c.full&&c.v.place&&c.v.place.unitId===uid) return Promise.resolve(partOf(c.v,'levels')); }
    var a=activePt(), ca=a?C[key(a.lat,a.lon)]:null; if(ca&&ca.bp) return ca.bp.then(function(B){ return B&&B.place&&B.place.unitId===uid?partOf(B,'levels'):null; });
    return null; }
  /* the places around a place ("Temperature now, place by place"): the bundle's near part */
  function near(lat,lon){ return part('near',lat,lon).then(function(v){ return v&&!v.unavailable?v:null; }); }
  /* v91.17.283.15 · item 3 · the provider products of a place that a section asks with its own options (ensemble shares, models side by
     side for a list of points, previous runs, CMIP6, river flow of the gauges) are held by the server (GET /api/pointstate/product,
     server/api/pointprod.mjs) and read here once per product, options and run; the land-surface inputs of a place are its bundle's land part */
  var PR={};
  function prodResp(x){ return new Response(JSON.stringify(x.j), {status:x.status>=200&&x.status<600?x.status:502, headers:{'content-type':'application/json'}}); }
  function product(name,q){ q=q||{}; var qs='name='+encodeURIComponent(name)+Object.keys(q).sort().map(function(k){ return '&'+encodeURIComponent(k)+'='+encodeURIComponent(q[k]); }).join('');
    var c=PR[qs], t=Date.now(); if(c&&!(c.until&&t>=c.until)) return c.p.then(prodResp);
    var e={at:t}, drop=function(){ if(PR[qs]===e) delete PR[qs]; };
    e.p=fetch('/api/pointstate/product?'+qs,{cache:'no-store'}).then(function(r){ var vu=Date.parse(r.headers.get('x-agn-valid-until')||''); if(isFinite(vu)) e.until=vu;
        return r.json().then(function(j){ if(!r.ok) drop(); return {status:r.status,j:j}; }); }).catch(function(){ drop(); return {status:502,j:{ok:false,error:'the server did not answer'}}; });
    PR[qs]=e; return e.p.then(prodResp); }
  var CHK=null, LRUN=null;
  /* v91.17.283.15 · the issued levels follow their run stamp too (j.levels): when it changes every levels cache on the page is told once
     (agn:levels-run) and reads again; no section re-reads the levels on a timer */
  function levelsRun(lv){ if(!lv) return; var first=LRUN==null; if(!first&&lv===LRUN) return; LRUN=lv;
    try{ D.dispatchEvent(new CustomEvent('agn:levels-run',{detail:{levels:lv, first:first}})); }catch(_){} }
  /* v91.17.283.38 · item 3 (live 30 Oct: one /analyst open read the same place 4 times): a stamp change found while a place is being read keeps
     that read (it is answered under the new stamp) and any bundle already of the new stamp; only older bundles are dropped */
  function dropAll(j){ var K={}; for(var k0 in C){ var c0=C[k0]; if(c0&&((c0.v&&c0.v.stamp===j.bundleStamp)||(!c0.v&&c0.bp))) K[k0]=c0; } C=K; PR={}; DR=null; RUN=j.run; STAMP=j.bundleStamp; var a=activePt(); (a?psGet(a.lat,a.lon):Promise.resolve(null)).then(function(){ emit({run:j.run}); }); }
  /* v91.17.283.15 · item 8: a check asked while one is in flight runs again after it */
  function checkRun(){ if(CHK) return CHK.then(function(){ return checkRun(); }); CHK=raw('/api/pointstate/run').then(function(j){ CHK=null; if(!j||!j.bundleStamp) return;
      if(HO){ var ho=HO; HO=null; if(j.bundleStamp!==ho.ps.stamp){ levelsRun(j.levels); dropAll(j); return; } }
      levelsRun(j.levels);
      if(STAMP&&j.bundleStamp!==STAMP){ dropAll(j); return; }
      STAMP=j.bundleStamp; RUN=j.run; },function(){ CHK=null; }); return CHK; }
  HOK=checkRun(); setInterval(function(){ try{ if(D.visibilityState==='hidden') return; }catch(_){} checkRun(); },5*60e3);
  /* v91.17.283.20 · A3: the operator parts (state, mos; v91.17.283.21: pool) are served only to the operator view; switching it on reads
     the selected place once more (one request, on that switch only). v91.17.283.21: a page that opens in the operator view with the start
     page's handed-over bundle (a customer bundle) reads the place once in the operator view (that read replaces the hand-off's
     completion read) */
  function opView(){ try{ return D.documentElement.classList.contains('agn-operator'); }catch(_){ return false; } }
  /* v91.17.283.22 · item 2: a customer bundle held for a place (the start page's hand-off) stays on the page while the ONE completion read
     of the same place is made in the operator view (&complete=1: the operator parts state, mos, pool, every part settled); the sections keep
     showing the held bundle until it lands. No place request, no blank card. */
  function opComplete(k){ var c=C[k]; if(!(c&&c.v&&c.full&&c.v.view!=='operator')) return false; if(c.op) return true;
    c.op=c.cp=raw((c.v.self||pointUrl(k))+'&complete=1').then(function(j){ if(j&&j.ok) return put(k,j,true); return (C[k]&&C[k].v)||null; },function(){ return (C[k]&&C[k].v)||null; });
    c.op.then(function(){ emit({key:k, view:'operator'}); }); return true; }
  /* v91.17.283.20 · B8: a handed-over bundle with pending parts is completed by the one completion read once its stamp is confirmed */
  HOK.then(function(){ for(var k in C){ var c=C[k]; if(!(c&&c.ho&&c.v)) continue; if(opView()&&opComplete(k)) continue; if(pend(c.v)) complete(k); } });
  D.addEventListener('agn:operator',function(e){ if(!(e&&e.detail&&e.detail.operator)) return; var a=activePt(); if(!a) return; opComplete(key(a.lat,a.lon)); });
  /* the records of many points: held ones at once, the rest of every caller of the same moment in ONE GET /api/point/batch (600 at most
     per request); a point asked while it is in flight joins that request */
  function flush(){ var q=QB; QB=null; if(!q) return; var ks=Object.keys(q.want);
    for(var i=0;i<ks.length;i+=600){ (function(part){ raw('/api/point/batch?pts='+part.join(';')).then(function(j){ var S0=(j&&j.states)||[]; part.forEach(function(k,n){ var st=S0[n], r=q.want[k]; if(st&&st.ok){ var c=C[k]; if(c&&c.v) r(c.v); else r(put(k,st,false)); } else { C[k]={at:Date.now(),v:null,p:null,fail:true}; r(null); } }); },
        function(){ part.forEach(function(k){ C[k]={at:Date.now(),v:null,p:null,fail:true}; q.want[k](null); }); }); })(ks.slice(i,i+600)); } }
  function many(pts){ var waits=[];
    (pts||[]).forEach(function(p){ if(!p||!fin(p.lat)||!fin(p.lon)) return; var k=key(p.lat,p.lon), c=C[k];
      if(c&&c.v) return; if(c&&(c.p||c.bp)){ waits.push(c.p||c.bp); return; } if(c&&c.fail&&Date.now()-c.at<30e3) return;
      if(!QB){ QB={want:{}}; setTimeout(flush,30); } var res; var pr=new Promise(function(r){ res=r; }); QB.want[k]=res; C[k]={v:null,p:pr}; waits.push(pr); });
    return Promise.all(waits).then(function(){ return (pts||[]).map(function(p){ return p&&fin(p.lat)?psPeek(p.lat,p.lon):null; }); }); }
  /* the page's district points (the map's district inputs DISTRICT_IN, the national lists): their corrected records in ONE batch, read
     once per run, written into the district rows (now, the days and the 72-hour series). This is the browser's only district reading;
     the server's hazard engine (the same page in engine mode, ?engine=1) keeps its own provider reading, the inputs of the issued levels */
  var DR=null;
  function rnd(x){ return fin(x)?Math.round(+x):null; }
  function fillDistrict(row,ps){ var n=ps.now||{}, H=ps.hours||[], ni=Math.max(0,H.findIndex(function(h){ return h.time===n.time; })), col=function(k){ return H.map(function(h){ return h[k]!=null?h[k]:null; }); };
    row.t=rnd(n.tempC); row.hum=rnd(n.rh); row.wind=rnd(n.windKmh); row.gust=rnd(n.gustKmh); row.rain=fin(n.rainMm)?+(+n.rainMm).toFixed(1):null; row.uv=rnd(n.uv); row.cloud=rnd(n.cloudPct); row.surfacePressure=fin(n.pressureHpa)?+n.pressureHpa:null;
    /* v91.17.283.20 · A5: the model inputs the record does not hold (ps.inputs: soil moisture 9-27 cm, MSL and surface pressure, 850 hPa
       temperature and wind, ET0, VPD, short-wave), aligned to the record's hours; an 850 hPa value at or below the hour's surface pressure
       is under the ground and masked (the v283.16 rule); the day's ET0 and solar total are the sums of its hours */
    var I=ps.inputs&&ps.inputs.hourly, at={}; if(I&&Array.isArray(I.time)) I.time.forEach(function(t,i){ at[String(t).slice(0,13)]=i; });
    var inp=function(f){ return H.map(function(h){ var i=at[String(h.time).slice(0,13)]; var v=(I&&i!=null&&Array.isArray(I[f]))?I[f][i]:null; return fin(v)?+v:null; }); };
    var sp=inp('surface_pressure'), under=function(a){ return a.map(function(v,i){ var p=sp[i]!=null?sp[i]:(H[i]?H[i].pressureHpa:null); return (p!=null&&p<=850)?null:v; }); };
    var soil=inp('soil_moisture_9_to_27cm'), msl=inp('pressure_msl'), t850=under(inp('temperature_850hPa')), w850=under(inp('wind_speed_850hPa')), et0=inp('et0_fao_evapotranspiration'), vpd=inp('vapour_pressure_deficit'), sw=inp('shortwave_radiation');
    var daySum=function(a,date,f){ var s=0, n=0; H.forEach(function(h,i){ if(String(h.time).slice(0,10)===date&&a[i]!=null){ s+=a[i]; n++; } }); return n?f(s):null; };
    row.days=(ps.days||[]).slice(0,4).map(function(d){ return {date:d.date, tmax:d.tmaxC, tmin:d.tminC, tmean:null, appMax:d.feelsMaxC, rh:d.rhMean, dew:d.dewMeanC, precip:d.rainMm, prHours:null, prProb:d.rainProbMax, wind:d.windMaxKmh, gust:d.gustMaxKmh, uv:d.uvMax,
      rad:daySum(sw,d.date,function(s){ return Math.round(s*3600/1e6*100)/100; }), et0:daySum(et0,d.date,function(s){ return Math.round(s*100)/100; }), snow:d.snowCm, api:null}; });
    row.fc72={time:H.map(function(h){ return h.time; }), nowIdx:ni, temp:col('tempC'), feels:col('feelsC'), hum:col('rh'), wind:col('windKmh'), gust:col('gustKmh'), rain:col('rainMm'), rainProb:col('rainProb'), snow:col('snowCm'), soil:soil, surfacePressure:col('pressureHpa'), pressure:msl, cloud:col('cloudPct'), t850:t850, wind850:w850};
    if(I){ var spN=sp[ni]!=null?sp[ni]:(fin(n.pressureHpa)?+n.pressureHpa:null);
      row.soilMoist=soil[ni]; row.vpd=vpd[ni]; row.et0=et0[ni]; row.shortwave=sw[ni]; row.pressureMsl=msl[ni]; row.t850=t850[ni]; row.wind850=w850[ni];
      row.t850Masked=(spN!=null&&spN<=850)?('850 hPa is below the ground here (surface pressure '+Math.round(spN)+' hPa)'):null;
      if(soil[ni]!=null){ row.soilMoist9to27=soil[ni]; row.soilMoist9to27Basis='forecast model 9-27 cm at the present hour'; }
      row.upperAirSource='the forecast provider\u2019s pressure levels at the district point (model inputs, GET /api/point/batch with=inputs)'; }
    row.weatherLive=true; row.nationalLive=true; row.nationalAt=Date.now(); row.fcUpdatedAt=Date.now(); row.fcSource='point record'; row.fcLabel='corrected forecast at the district point'; row.pointState=ps.key; }
  /* v91.17.283.38 · item 4 (live 30 Oct: every analyst open asked the district batch, 24 s and 1.9 MB, for rows the Overview does not show):
     the boot calls wait until a view that shows district rows is opened (any main tab other than Overview: the national tables, the
     district layers and lists live there) or a section asks with {now:true}; the server keeps that answer ready per bundle stamp */
  var DWAIT=null, DGO=false;
  function dGo(){ if(DGO) return; DGO=true; if(DWAIT){ var w=DWAIT; DWAIT=null; w.res(); } }
  try{ D.addEventListener('agn:view',function(e){ var v=e&&e.detail&&e.detail.view; if(v&&v!=='overview') dGo(); }); }catch(_){}
  function districts(o){ if(DR) return DR; if(o&&o.now) dGo();
    if(!DGO&&!(G.AGN&&G.AGN.engineMode)){ if(!DWAIT){ var w={}; w.p=new Promise(function(r){ w.res=r; }); DWAIT=w; } return DWAIT.p.then(function(){ return districts(); }); }
    return districtsNow(); }
  function districtsNow(){ if(DR) return DR; var P=G.PK_DISTRICT_CENTROIDS||[], IN=G.DISTRICT_IN||{}, IIO=G.IIOJK;
    var pts=P.filter(function(c){ return c&&c.key&&IN[c.key]&&fin(c.lat)&&fin(c.lon)&&c.province!==IIO&&!/Indian Illegally Occupied|Jammu Kashmir/i.test(String(c.province||'')+' '+String(c.district||'')); });
    if(!pts.length) return Promise.resolve(0);
    /* v91.17.283.20 · A5: ONE batch request (600 points at most per request) for the district points' records and their model inputs */
    var ask=function(){ var out=[], jobs=[]; for(var i=0;i<pts.length;i+=600){ (function(part,off){ jobs.push(raw('/api/point/batch?with=inputs&pts='+part.map(function(c){ return (+c.lat).toFixed(5)+','+(+c.lon).toFixed(5); }).join(';')).then(function(j){
          var S0=(j&&j.states)||[]; part.forEach(function(c,n){ var st=S0[n]; out[off+n]=st&&st.ok?st:null; if(st&&st.ok){ var k=key(c.lat,c.lon); if(!(C[k]&&C[k].v)) C[k]={v:st,p:null,full:false}; } }); },function(){})); })(pts.slice(i,i+600),i); }
      return Promise.all(jobs).then(function(){ return out; }); };
    var job=DR=ask().then(function(S){ var n=0; pts.forEach(function(c,i){ var ps=S[i], row=IN[c.key]; if(ps&&ps.ok&&ps.now&&row){ fillDistrict(row,ps); n++; } });
        try{ if(typeof G.refreshDistrictHazard==='function') G.refreshDistrictHazard(); }catch(_){} if(!n&&DR===job) DR=null; return n; }, function(){ if(DR===job) DR=null; return 0; });
    return job; }
  function machOn(ps){ return !!(ps&&ps.source&&ps.source.mach&&ps.source.mach.applied); }
  function srcWord(ps){ return machOn(ps)?'MACH forecast':'Model forecast'; }
  function heatWord(lv){ return (!lv||lv==='None')?'Normal':lv; }
  function build(ps){ var B=ps&&ps.build; if(!B||!fin(B.rawC)) return null;
    return { time:B.time, rawC:B.rawC, servedC:B.servedC, steps:(Math.abs(B.totalDeltaC||0)>=0.05?[{step:'NIGRAAN corrections ('+(B.steps||[]).join(', ')+')',deltaC:B.totalDeltaC}]:[]), liveApplied:!!B.liveApplied, liveWhy:B.liveWhy||null, note:B.note }; }
  function support(ps){ var m=ps.source&&ps.source.mach&&ps.source.mach.nearest; return m&&m.station?{station:m.station,km:m.km,ageMin:m.ageMin,usable:m.usable}:null; }
  function chainOf(ps){ var C0=(ps.source&&ps.source.chain)||[], c=[{step:'forecast at this point',basis:C0[0]||''}]; C0.slice(1).forEach(function(x){ c.push({step:/^live MACH stations/.test(x)?'live MACH stations':x,basis:x}); }); return c; }
  function asNow(ps){ if(!ps||!ps.ok||!ps.now) return null; return Object.assign({},ps.now,{ lo90:null, hi90:null, chain:chainOf(ps).map(function(x){ return x.step; }), support:support(ps), build:build(ps), days:ps.days, hours:ps.hours, point:ps.point, pointState:ps }); }
  function asPf(ps){ if(!ps||!ps.ok) return {ok:false, why:(ps&&ps.why)||'the point state is not available'}; var a=ps.area||{};
    return { ok:true, issuedAt:ps.issuedAt, pointState:ps.key, run:ps.run, point:{lat:ps.point.lat,lon:ps.point.lon,tehsil:a.tehsil,district:a.district,province:a.province,elevM:ps.point.elevM,heightBasis:ps.point.heightBasis},
      now:Object.assign({},ps.now,{lo90:null,hi90:null}), days:ps.days, hours:ps.hours, chain:chainOf(ps), build:build(ps), support:support(ps), engineOnly:!machOn(ps),
      skill:ps.confidence&&ps.confidence.now?ps.confidence.now.text:null, source:ps.source, confidence:ps.confidence, note:'the point state: '+(ps.source&&ps.source.label||'') }; }
  var PMAP={temperature_2m:'tempC',relative_humidity_2m:'rh',dew_point_2m:'dewC',apparent_temperature:'feelsC',wind_speed_10m:'windKmh',wind_gusts_10m:'gustKmh',precipitation:'rainMm',rain:'rainMm',cloud_cover:'cloudPct',weather_code:'weatherCode',precipitation_probability:'rainProb',snowfall:'snowCm',surface_pressure:'pressureHpa',shortwave_radiation:'swRad',uv_index:'uv'};
  var PDAY={temperature_2m_max:'tmaxC',temperature_2m_min:'tminC',precipitation_sum:'rainMm',wind_speed_10m_max:'windMaxKmh',wind_gusts_10m_max:'gustMaxKmh',apparent_temperature_max:'feelsMaxC',relative_humidity_2m_mean:'rhMean',dew_point_2m_mean:'dewMeanC',precipitation_probability_max:'rainProbMax',uv_index_max:'uvMax',snowfall_sum:'snowCm'};
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
  G.AGN.pointState={ key:key, get:psGet, peek:psPeek, failed:psFailed, many:many, batch:many, fmt:fmt, asNow:asNow, pf:function(lat,lon){ return psGet(lat,lon).then(asPf); }, asPf:asPf,
    provider:provider, providerMany:providerMany, shape:provShape, heatWord:heatWord, sourceWord:srcWord, machOn:machOn, near:near,
    bundle:bundle, part:part, partResp:partResp, partOf:partOf, station:station, stationOf:stationOf, stationWhy:stationWhy, place:place, placePeek:placePeek, hint:hint, levelsFor:levelsFor, districts:districts,
    run:function(){ return {run:RUN, stamp:STAMP, levels:LRUN}; }, levelsRun:function(){ return LRUN; }, checkRun:checkRun, product:product,
    complete:function(lat,lon){ return fin(lat)&&fin(lon)?complete(key(lat,lon)):Promise.resolve(null); },
    firstCheck:function(){ return HOK||Promise.resolve(); }, version:'v91.17.283.20' };
  /* the one place resolution: the first row of the server's place search (AGN.places.first), the record every page picks for the query */
  G.AGN.resolvePlace=function(q){ return G.AGN.places.first(q).catch(function(){ return null; }); };
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
