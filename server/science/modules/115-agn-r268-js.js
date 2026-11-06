
(function(G){
  'use strict';
  /* v91.17.268 · NIGRAAN reports on the report kit (AGNRK). A report is made from a button inside the section it belongs to, with that
     section's place, asset or portfolio already chosen, and opens in the kit reader over the section. Printing or downloading an issuable
     report stores it in the reports library (POST /api/reports/issue, edition "main"); the Reports tab lists, re-opens, downloads,
     archives and packs them. Every value printed comes from data the page holds or the server answers; a missing value prints
     "Not available"; every sentence is built by a fixed rule from the figures. Confidence is the model-gate status of the layer
     (GET /api/report/gate-status).
     v91.17.270 · G1 portfolio report rebuilt from the screened sites (no sites: "Add sites first" and the one action); G2 HISAAB strengths:
     evidence-based confidence (data, model gate, agreement), "How to use these figures", town and city names on the maps, the CMIP6
     outlook chart (the page's own climate-model settings), the event history of the place (NIGRAAN's archives), triggers (the level ->
     action ladder NIGRAAN already holds), the AGN logo, the operator appendix on every report; G3 a 2-page short edition of every report
     type and one name per hazard; G5 one source per number (hazard levels: the engine's levels by tehsil, the map's source; the next
     72 hours: the Forecast tab's hourly forecast through AGN.fc251.next72; the 15 days: /api/outlook/unit, the Forecast tab's outlook);
     G6 every finding's "what to do" from the action plan's tables (AGN.actionPlan: action, owner, ready by), never empty. */
  var D=G.document, AGN=G.AGN=G.AGN||{};
  function RK(){ return G.AGNRK; }
  function esc(v){ return RK().esc(v); }
  function fin(x){ return x!=null&&x!==''&&isFinite(Number(x)); }
  function f1(x){ return fin(x)?RK().nf(x,1):null; }
  function isOp(){ try{ return !!(AGN.operator&&AGN.operator()); }catch(_){ return false; } }
  function hdr(){ return isOp()?{}:{'x-agn-view':'customer'}; }
  function getJ(url,ms){ var ctl=('AbortController' in G)?new AbortController():null, t=setTimeout(function(){ try{ ctl&&ctl.abort(); }catch(_){} },ms||20000);
    return fetch(url,{cache:'no-store',headers:hdr(),signal:ctl?ctl.signal:undefined}).then(function(r){ return r.ok?r.json():null; }).catch(function(){ return null; }).then(function(j){ clearTimeout(t); return j; }); }
  function until(test,ms){ var t0=Date.now(); return new Promise(function(res){ (function poll(){ var ok=false; try{ ok=!!test(); }catch(_){} if(ok) return res(true); if(Date.now()-t0>=ms) return res(false); setTimeout(poll,400); })(); }); }
  function todayIso(){ return new Date(Date.now()+5*3600e3).toISOString().slice(0,10); }
  function dl(ymd){ return RK().dayLab(ymd); }
  function ageH(at){ var t=Date.parse(at||''); return isFinite(t)?(Date.now()-t)/3600e3:Infinity; }
  function lvWord(i){ return RK().sevWord(i); }
  function sev(i,txt){ return RK().sev(i,txt); }
  /* v91.17.283.24 · integration item 4 · the word of an issued cell: its served label where it has one (heavy rain method d "Low or heavier") */
  function cw(c){ return c&&c.label?c.label:lvWord(c?c.i:null); }
  /* v91.17.278 · FIX278 3 · a hazard with levels on some days and none on others: the empty days say so, and why (heavy rain: the
     calibrated chance needs the whole day's forecast rain for the day and the day after; the dates come from the chance the server issued) */
  function rainGap(dates){ var J=null; try{ J=G.agnRainChance&&G.agnRainChance.raw?G.agnRainChance.raw():null; }catch(_){ J=null; }
    var held=J&&Array.isArray(J.days)?J.days:[], a=[], b=[]; dates.forEach(function(d){ (held.indexOf(d)<0?a:b).push(d); });
    var s=[]; if(a.length) s.push('the forecast held does not yet cover the whole of '+list(a.map(dl)));
    if(b.length) s.push('the chance for '+list(b.map(dl))+' also needs the forecast rain of the day after, which the forecast held does not reach yet');
    return 'Heavy rain has no level on '+list(dates.map(dl))+': it is levelled from the calibrated rain chance, and '+s.join('; ')+'. Each new forecast run fills these days as they come into reach.'; }
  function gapCell(x,cc){ return cc.i!=null?sev(cc.i,cc.label||null):(cc.word&&/not applicable/i.test(cc.word)?'<span class="muted">Does not occur here</span>':(x.peak&&x.key==='rain_hz'?'<span class="muted">Not yet issued</span>':na())); }
  function gapNote(EN){ var o=[]; (EN&&EN.hz||[]).forEach(function(x){ if(!x.peak) return; var m=x.row.filter(function(c){ return c.i==null&&!(c.word&&/not applicable/i.test(c.word)); }).map(function(c){ return c.date; }); if(!m.length) return;
      o.push(x.key==='rain_hz'?rainGap(m):(x.label+' has no level on '+list(m.map(dl))+': the engine issued none for '+(m.length>1?'those days':'that day')+'.')); });
    return o.length?'<p class="small">'+esc(o.join(' '))+'</p>':''; }
  function na(t){ return '<span class="muted">'+esc(t||'Not available')+'</span>'; }
  function plural(n,one,many){ return n+' '+(n===1?one:(many||one+'s')); }
  function list(a){ return a.length<2?(a[0]||''):(a.slice(0,-1).join(', ')+' and '+a[a.length-1]); }
  /* a section that starts a new page: the break sits on its heading (an empty break element could be left alone on a page) */
  function pb(h2){ return String(h2).replace(/^<h2/,'<h2 class="rk-pb"'); }
  function cap(t){ t=String(t||''); return t.charAt(0).toUpperCase()+t.slice(1); }
  function pkMs(ymd){ return Date.parse(String(ymd).slice(0,10)+'T00:00:00+05:00'); }
  function logo(){ try{ var i=D.querySelector('header.topbar .logo-img'); return i&&/^data:image\//.test(i.getAttribute('src')||'')?i.getAttribute('src'):null; }catch(_){ return null; } }

  /* ---------- one name per hazard (G3; names set by the owner, v91.17.270 follow-up). GLOF: "Glacial lake outburst flood (GLOF)" on its
     first use in a document or panel (glofFirst), then "GLOF". The variants the page and the server used are mapped onto these names ---------- */
  var ORDER=['heat','cold','rain_hz','flood','flood_pluvial','wind','landslide','glof','drought'];
  /* v91.17.272.1: a short site name for map labels and the hazards grid: the client suffix "(…)" dropped; a "kind · place" name keeps its
     place when that place is unique in the portfolio; a name still longer than 24 characters is cut at a word. The full names stay in the tables and on the site pages. */
  function shortNames(names){ var base=names.map(function(n){ return String(n||'').replace(/\s*\([^)]*\)\s*$/,'').trim()||String(n||''); }), cnt={};
    base.forEach(function(b){ var p=b.split(' · ').pop(); cnt[p]=(cnt[p]||0)+1; });
    return base.map(function(b){ var s=b; if(s.indexOf(' · ')>0){ var p=s.split(' · ').pop(); if(cnt[p]===1&&p.length>=3) s=p; }
      if(s.length>24){ var c=s.slice(0,23); s=(c.lastIndexOf(' ')>10?c.slice(0,c.lastIndexOf(' ')):c).replace(/[\s·,;:-]+$/,'')+'\u2026'; } return s; }); }
  var NAME={heat:'Heat stress',cold:'Cold stress (UTCI)',rain_hz:'Heavy rain',flood:'River flood',flood_pluvial:'Local-rain flooding (indicative)',wind:'Wind and gusts',landslide:'Landslide',glof:'GLOF',drought:'Drought',aqi:'Air quality'};
  var GLOF_LONG='Glacial lake outburst flood (GLOF)';
  var VARIANT={heat:['heat','heat stress','heat (utci in shade)','heat stress (utci, shade)','heat stress (utci)','heatwave'],cold:['cold','cold and frost','cold stress','cold stress / frost','cold stress and frost','cold/frost','cold / frost','cold / frost (screening)'],
    rain_hz:['rain','heavy rain','rainfall','rainfall intensity','rainfall intensity (screening)'],flood_pluvial:['flood_pluvial','local-rain flooding (indicative)','local-rain flooding','flood (rain)','flood from local rain','flooding from local rain','flood — pluvial pathway only (screening)'],flood:['flood','river flood','flood_riverine','flood (rain or river, whichever governs)','flood (river and rain)','flood (pluvial + riverine)','flood — governing pathway','flood — governing pathway (screening)'],
    wind:['wind','wind and gusts','wind and gust load'],landslide:['landslide','landslide (rain-triggered likelihood)'],glof:['glof','glacial lake flood','glacial lake outburst','glacial lake outburst (glof)','glacial lake outburst flood','glacial lake outburst flood (glof)','glof (corridor screening)','glof corridor class (lake-routed)'],drought:['drought','drought stress','drought (90-day condition)']};
  /* GLOF in the text of a document (not in a tag or attribute): written out in full the first time, "GLOF" after it */
  function glofFirst(html){ var done=false; return String(html).replace(/(<[^>]*>)|([^<]+)/g,function(m,tag,txt){ if(tag) return m;
      return txt.replace(/Glacial lake outburst flood \(GLOF\)|\bGLOF\b/g,function(g){ if(done) return 'GLOF'; done=true; return GLOF_LONG; }); }); }
  function lcName(k){ return k==='glof'?'GLOF':String(NAME[k]||k).toLowerCase(); }
  function keyOf(s){ var t=String(s||'').trim().toLowerCase(); if(NAME[t]) return t; for(var i=0;i<ORDER.length;i++) if(VARIANT[ORDER[i]].indexOf(t)>=0) return ORDER[i]; return null; }
  function nameOf(s){ var k=keyOf(s); return k?NAME[k]:String(s||''); }
  var HZ=ORDER.map(function(k){ return [k,NAME[k]]; });
  AGN.hazardName={ name:function(k){ return NAME[k]||null; }, long:function(k){ return k==='glof'?GLOF_LONG:(NAME[k]||null); }, of:nameOf, key:keyOf, keys:function(){ return ORDER.slice(); }, glofFirst:glofFirst };

  /* ---------- server answers the reports read (cached) ---------- */
  var GATE={p:null,at:0}, FLEET={p:null}, EVL={p:null}, LVC={}, ULV={}, OUTL={}, HIST={}, CMC={}, GLE={};
  function gate(){ if(GATE.p&&Date.now()-GATE.at<10*60e3) return GATE.p; GATE.at=Date.now();
    GATE.p=getJ('/api/report/gate-status',15000).then(function(j){ if(!j||j.ok!==true||!Array.isArray(j.entries)){ GATE.at=0; return null; }
      var by={}, own={}; j.entries.forEach(function(e){ by[e.id]=e; (e.layers||[]).forEach(function(l){ own[l]=e.id; }); });
      Object.keys(j.layerOwner||{}).forEach(function(l){ if(by[j.layerOwner[l]]) own[l]=j.layerOwner[l]; });
      return {version:j.version||null, asOf:j.asOf||null, entries:j.entries, entry:function(layer){ return by[own[layer]]||null; }}; }); return GATE.p; }
  function fleet(){ if(FLEET.p) return FLEET.p; FLEET.p=getJ('/api/fleet/stations',15000).then(function(j){ if(!j||!Array.isArray(j.stations)){ FLEET.p=null; return null; } return j.stations.filter(function(s){ return fin(s.lat)&&fin(s.lon); }); }); return FLEET.p; }
  /* v91.17.278 · FIX278 1 · the plain name of every multi-day event the outlook returns. The map's layer list names the published events;
     the two combined counts (any heavy or extreme rain, any strong gust day) have no layer, and the live walk-through printed their keys
     ("rainUnion", "windAny") in the situation report. A key with no plain name is left out, never printed. */
  var EVP={heatSpell:'Heat spell: hotter than usual here, and hot enough to matter',unusualWarmth:'Unusually warm for the place',meltWarmth:'Snow and ice melt warmth (units reaching 3,500 m only)',coastalHeat:'Coastal humid heat (apparent ≥40 °C, 2+ days)',rain3_75:'Heavy rain (3-day ≥75 mm)',rain3Local:'Extreme rain for the place',rainOnSnow:'Rain on snow (above 1,500 m)',heavySnow:'Heavy snow (3-day ≥30 cm)',frostSpell:'Frost spell below 2,000 m',coldSpell:'Cold spell: colder than usual here, and cold enough to matter',
    rainUnion:'Heavy or extreme rain (either of the two rain events)',windAny:'Strong gusts (any day with gusts of 60 km/h or more)'};
  function evName(X,k){ var L=(X&&X.evl)||{}; return L[k]||EVP[k]||null; }
  function evLabels(){ if(EVL.p) return EVL.p; EVL.p=getJ('/api/map/layers',15000).then(function(c){ var o={}; (Array.isArray(c)?c:[]).forEach(function(g){ (g.items||[]).forEach(function(it){ if(Array.isArray(it)&&/^ev:/.test(it[0])) o[it[0].slice(3)]=it[1]; }); }); if(!Object.keys(o).length) EVL.p=null; return o; }); return EVL.p; }
  D.addEventListener('agn:levels-run',function(e){ if(e&&e.detail&&!e.detail.first){ LVC={}; ULV={}; } });   /* v91.17.283.15 · item 4: the levels follow their run stamp */
  function levels(layer,day){ var k=layer+'|'+day, c=LVC[k]; if(c) return c.p;
    var p=getJ('/api/levels?layer='+encodeURIComponent(layer)+'&day='+day,20000).then(function(j){ if(!j||!j.levels){ delete LVC[k]; return null; } return j; });
    LVC[k]={at:Date.now(),p:p}; return p; }
  /* G5 · the engine's levels for one tehsil by day: the answer the map and the unit panel read (GET /api/levels/unit), as the report context
     carries it (mapLevels) */
  function unitLevels(uid){ if(!uid) return Promise.resolve({why:'no tehsil was chosen'}); var k=String(uid), c=ULV[k]; if(c) return c.p;
    /* v91.17.283.19 · the tehsil of a place the page store holds: that bundle's levels part (the start page's bundle included); another
       tehsil (a map click) is read here once */
    var get=function(){ return getJ('/api/levels/unit?unit='+encodeURIComponent(uid),20000); };
    var own=G.AGN&&AGN.pointState&&AGN.pointState.levelsFor?AGN.pointState.levelsFor(k):null;
    var src=own?own.then(function(L){ return L===null?get():L; }):get();
    var p=src.then(function(L){ if(!L||!L.ready){ delete ULV[k]; return {why:(L&&L.why)||'the issued levels could not be read just now (the server did not answer in 20 s)'}; }
      return {at:L.at, stale:!!L.stale, days:(L.days||[]).map(function(d){ var o={}; Object.keys(d.layers||{}).forEach(function(x){ var y=d.layers[x]; o[x]={name:y.name, word:y.word, levelLabel:y.levelLabel||null, productType:y.productType||null, productTypeWhy:y.productTypeWhy||null, outsideTestedDomain:!!y.outsideTestedDomain, held:!!y.held, heldNote:y.heldNote||null, testStatus:y.testStatus||null, basisNote:y.basisNote||null}; }); return {day:d.day, date:d.date, layers:o}; })}; });
    ULV[k]={at:Date.now(),p:p}; return p; }
  /* G5 · the 15-day ensemble at a point: the answer the Forecast tab's outlook reads (GET /api/outlook/unit, asked by the point) */
  function outlookAt(pt){ if(!pt) return Promise.resolve(null); var k=(+pt.lat).toFixed(3)+','+(+pt.lon).toFixed(3), c=OUTL[k]; if(c&&Date.now()-c.at<10*60e3) return c.p;
    var p=AGN.pointState.part('outlook',+pt.lat,+pt.lon).then(function(j){ if(!j||!j.ensemble||!Array.isArray(j.ensemble.days)){ delete OUTL[k]; return null; } return j; });   /* v91.17.283.19: the bundle's outlook part */
    OUTL[k]={at:Date.now(),p:p}; return p; }
  /* G2 · the event history: NIGRAAN's own archives at the point, the longest window the past-days interface serves (60 days) */
  var HIST_DAYS=60;
  function history(pt){ if(!pt) return Promise.resolve(null); var k=(+pt.lat).toFixed(3)+','+(+pt.lon).toFixed(3), c=HIST[k]; if(c&&Date.now()-c.at<30*60e3) return c.p;
    var p=getJ('/api/report/past30?lat='+encodeURIComponent(pt.lat)+'&lon='+encodeURIComponent(pt.lon)+'&days='+HIST_DAYS,45000).then(function(j){ if(!j||typeof j.ok!=='boolean'){ delete HIST[k]; return null; } return j; });
    HIST[k]={at:Date.now(),p:p}; return p; }
  /* G2 · documented outbursts of the glacial lakes that drain to the point (the GLOF register; only where the lake routing is installed) */
  function glofEvents(pt){ var u=null; try{ u=AGN.glofCtx&&AGN.glofCtx.peek(pt.lat,pt.lon); }catch(_){ u=null; }
    if(!u||!u.ok||!Array.isArray(u.lakes)||!u.lakes.length) return Promise.resolve({why:u&&u.why?u.why:'no glacial lake register answer for this place'});
    var L=u.lakes.slice(0,5); return Promise.all(L.map(function(x){ var id=x.id||(x.lake&&x.lake.id); if(!id) return null; if(GLE[id]) return GLE[id];
      GLE[id]=getJ('/api/glof/lake?id='+encodeURIComponent(id),15000); return GLE[id]; })).then(function(a){ return {lakes:L.map(function(x,i){ return {lake:x, info:a[i]}; })}; }); }
  /* G2 · CMIP6: the page's own climate-model settings (FORMULA_REGISTRY cmip6: models, baseline, windows, minimum models), read for the
     point in one request per window; the same quantities the Client Risk and Forecast CMIP6 cards publish (daily maximum, yearly rain) */
  function cmip(pt){ if(!pt) return Promise.resolve({why:'no place with coordinates was chosen'}); var k=(+pt.lat).toFixed(2)+','+(+pt.lon).toFixed(2), c=CMC[k]; if(c&&(c.ok||Date.now()-c.at<60e3)) return c.p;
    var M,B,Wn,MIN; try{ M=G.FR('cmip6.models'); B=G.FR('cmip6.baseline'); Wn=G.FR('cmip6.windows'); MIN=G.FR('cmip6.minModels'); }catch(_){ return Promise.resolve({why:'the climate-model settings are not loaded on this page'}); }
    /* v91.17.283.15 · the server's CMIP6 record of the place (GET /api/pointstate/product name=cmip6) */
    var get=function(s,e){ try{ return AGN.api.product('cmip6',{latitude:+pt.lat, longitude:+pt.lon, start_date:s, end_date:e, models:M.join(','), daily:'temperature_2m_max,precipitation_sum', timezone:'Asia/Karachi'}).then(function(r){ return r&&r.ok?r.json():null; }).catch(function(){ return null; }); }catch(_){ return Promise.resolve(null); } };
    var hs=Object.keys(Wn).sort();
    var ent={at:Date.now(),ok:false}; CMC[k]=ent;
    ent.p=Promise.all([get(B[0],B[1])].concat(hs.map(function(h){ return get(Wn[h][0],Wn[h][1]); }))).then(function(res){
      var stat=function(j,m){ var d=j&&j.daily; if(!d) return null; var t=(d['temperature_2m_max_'+m]||[]).filter(fin).map(Number), p=(d['precipitation_sum_'+m]||[]).filter(fin).map(Number); if(!t.length) return null;
        return {t:t.reduce(function(a,b){ return a+b; },0)/t.length, p:p.length?p.reduce(function(a,b){ return a+b; },0)/Math.max(1,p.length/365.25):null}; };
      var rng=function(a){ a=a.filter(fin).map(Number).sort(function(x,y){ return x-y; }); return a.length?{m:a[Math.floor(a.length/2)],lo:a[0],hi:a[a.length-1],n:a.length}:null; };
      var H=hs.map(function(h,i){ var dT=[], dP=[]; M.forEach(function(m){ var b=stat(res[0],m), f=stat(res[i+1],m); if(!b||!f) return; dT.push(f.t-b.t); if(b.p>0&&fin(f.p)) dP.push(100*(f.p-b.p)/b.p); });
        return {h:h, win:Wn[h], dT:rng(dT), dP:rng(dP)}; }).filter(function(x){ return x.dT&&x.dT.n>=MIN; });
      if(!H.length){ return {why:res.some(function(r){ return r&&r.daily; })?('fewer than '+MIN+' climate models answered, below the minimum for a model spread'):'the climate models did not answer'}; }
      ent.ok=true; return {models:M.length, base:B, horizons:H}; }); return ent.p; }

  /* ---------- the hazards a NIGRAAN report speaks for, by map layer ---------- */
  var HZRE={heat:/heat|hot|utci|warm/i, cold:/cold|frost|freez/i, rain_hz:/rain|downpour|storm|drain|ponding/i, flood:/flood|river|ponding|drain|water/i, wind:/wind|gust/i, landslide:/landslide|slope|debris/i, glof:/glacial|lake outburst|glof/i, drought:/drought|dry/i};
  var EVOF={heat:['heatSpell','unusualWarmth','coastalHeat'], cold:['coldSpell','frostSpell'], rain_hz:['rain3_75','rain3Local'], flood:['rain3_75','rain3Local','rainOnSnow'], landslide:['rain3Local','rain3_75','rainOnSnow'], glof:['meltWarmth','rainOnSnow'], wind:[], drought:[]};
  var SEVC=['#C7E8D1','#F1E3A2','#E9C46A','#E0A030','#C9483F'], NDC='#DDE2DE';
  var STC={checked:['#1E7A68','Station checked'], 'not-yet-checked':['#B7791F','Station not yet checked'], 'site-problem':['#6B5B8C','Station site problem, not used'], silent:['#8C978F','Station silent']};

  /* ---------- what the page holds for the place ---------- */
  function lc(doc){ var C=doc&&doc.evidence&&doc.evidence.localContext; return (C&&!C.__noServerContext)?C:null; }
  function siteRisk(doc){ return (doc&&doc.evidence&&doc.evidence.siteRisk)||null; }
  function steps(doc){ try{ return AGN.reportSteps?AGN.reportSteps(doc):null; }catch(_){ return null; } }
  function records(doc){ var C=lc(doc)||(doc&&doc.evidence&&doc.evidence.localContext)||null, R=C&&C.actionRecords; return (R&&R.records)||[]; }
  function activePoint(){ try{ var s=AGN.subject.get(); if(s&&fin(s.asset_lat)&&fin(s.asset_lon)) return {lat:+s.asset_lat,lon:+s.asset_lon,name:s.asset_name||null,basis:'asset'}; }catch(_){}
    try{ var p=AGN.data.activePoint(); if(p&&fin(p.lat)&&fin(p.lon)) return {lat:+p.lat,lon:+p.lon,name:p.name||null,basis:'place'}; }catch(_){}
    try{ var q=AGN.subjectPoint?AGN.subjectPoint():null; if(q&&fin(q.lat)) return {lat:+q.lat,lon:+q.lon,name:q.name||null,basis:q.basis||'tehsil centroid'}; }catch(_){} return null; }
  function placeOf(doc,pt){ var C=lc(doc)||{}, U=C.unit||{}, sj=(doc&&doc.subject)||{};
    var name=sj.asset_name||(pt&&pt.name)||U.name||doc.unit||null;
    var adm=[U.name?U.name+' tehsil':null,U.district?U.district+' district':null,U.province||null].filter(Boolean);
    return {name:name, tehsil:U.name||null, district:U.district||null, province:U.province||null, unitId:U.unitId||(doc&&doc.unit)||null, elevM:fin(U.elevM)?+U.elevM:null,
      lat:pt?pt.lat:(fin(U.lat)?+U.lat:null), lon:pt?pt.lon:(fin(U.lon)?+U.lon:null), adm:adm.join(', '), basis:pt?pt.basis:'tehsil centroid'}; }
  /* G5 · the 15-day served ensemble at the place (median and the 10-90 % of members), only when it is fresh: the Forecast tab's outlook answer
     for the point first, the report context's copy of the same server outlook only when that answer is missing */
  function series(doc,X){ var O=X&&X.outl, C=lc(doc), E=(O&&O.ensemble&&Array.isArray(O.ensemble.days)&&O.ensemble.days.length)?O.ensemble:(C&&C.outlook&&C.outlook.ensemble);
    if(!E||!Array.isArray(E.days)) return {why:'the 15-day forecast for this place was not held when the report was made'};
    if(!isFinite(Date.parse(E.at||''))) return {why:'the 15-day forecast on the server carries no run time, so it is not printed as a current forecast'};
    if(ageH(E.at)>18) return {why:'the 15-day forecast on the server is from the run of '+RK().when(Date.parse(E.at))+', more than 18 hours old, so it is not printed as a current forecast'};
    var t=todayIso(), d=E.days.filter(function(x){ return x&&x.date>=t; }).slice(0,15); if(!d.length) return {why:'the 15-day forecast held no day from today on'};
    return {E:E, days:d, at:E.at, members:E.members||null, events:(O&&O.ensemble===E&&O.events)?O.events:(C&&C.outlook&&C.outlook.events)||null}; }
  function q(a,i){ return Array.isArray(a)&&fin(a[i])?+a[i]:null; }
  /* engine levels by day and hazard (the same run the map reads) */
  function engineOf(M){ if(!M||!Array.isArray(M.days)||!M.days.length) return {why:(M&&M.why)?('the hazard engine did not answer ('+M.why+')'):'the hazard levels were not held when the report was made'};
    if(M.stale) return {why:'the hazard engine run on the server is stale, so its levels are not printed as current'};
    var t=todayIso(), days=M.days.filter(function(d){ return d&&d.date>=t; }).slice(0,15);
    if(!days.length) return {why:'the hazard engine run holds no day from today on'};
    var hz=HZ.map(function(h){ var row=days.map(function(d){ var L=d.layers&&d.layers[h[0]]; if(!L) return {date:d.date,i:null,miss:true}; var i=RK().levelIndex(L.word); return {date:d.date,i:i,word:L.word,label:(i!=null&&L.levelLabel)||null,day:d.day,pt:L.productType||null,ptw:L.productTypeWhy||null,ood:!!L.outsideTestedDomain,held:!!L.held,heldNote:L.heldNote||null,test:L.testStatus||null,basisNote:L.basisNote||null}; });
      var held=row.filter(function(x){ return x.i!=null; }); if(!held.length){ var naw=row.filter(function(x){ return x.word&&/not applicable/i.test(x.word); }).length; return {key:h[0],label:h[1],row:row,peak:null,notApplicable:naw>0}; }
      var pk=held.reduce(function(a,b){ return b.i>a.i?b:a; }); return {key:h[0],label:h[1],row:row,peak:pk}; });
    return {days:days, hz:hz, at:M.at||null}; }
  function engine(doc,X){ var C=lc(doc), M=(X&&X.ulv&&X.ulv.days)?X.ulv:(C&&C.mapLevels); return engineOf(M); }
  /* G5 · the next 72 hours at the point: the Forecast tab's hourly forecast through the one function its cards use */
  function next72(pt){ try{ var v=pt&&AGN.nowAt&&AGN.nowAt.peek(pt.lat,pt.lon); return (pt&&AGN.fc251&&AGN.fc251.next72)?AGN.fc251.next72(v,pt):null; }catch(_){ return null; } }   /* v91.17.283.29 · W3: the place record's days */
  function n72Label(t){ return t?dl(String(t).slice(0,10)):''; }   /* v91.17.283.29 · W3: a day value (the place record's day maximum / minimum) has a day, not an hour */

  /* ---------- G6 · what to do: the action plan's tables (AGN.actionPlan, the same text, owner and lead the Operations actions use) ---------- */
  function ladder(){ var o={}; ['Monitor','Watch','Act'].forEach(function(c){ var w=null; try{ w=AGN.level.ofClass(c); }catch(_){} var i=RK().levelIndex(w); if(i!=null) o[i]=c; }); return o; }
  function clsOf(i){ return i==null?null:(ladder()[i]||null); }
  function levelOfCls(c){ var L=ladder(), k=Object.keys(L).filter(function(i){ return L[i]===c; })[0]; return k==null?null:+k; }
  function sector(){ try{ var L=AGN.actions&&AGN.actions.last&&AGN.actions.last(); return (L&&L.sector)||'general'; }catch(_){ return 'general'; } }
  function plan(){ return AGN.actionPlan||null; }
  function owner(k,sec){ var P=plan(); var o=null; try{ o=P&&P.owner(k,sec); }catch(_){} return o||'Operations'; }
  function readyBy(k,cls,row,unit){ var P=plan(), li=levelOfCls(cls);
    if(k==='drought'){ try{ var pd=P.prepareBy(unit||null,'drought',cls,{condition:true}); if(pd&&pd.text) return {text:pd.text, short:String(pd.text).split(' (')[0], at:pd.at}; }catch(_){} }
    var on=(row||[]).filter(function(c){ return c.i!=null&&li!=null&&c.i>=li; })[0], lead=null; try{ lead=P&&P.lead?P.lead(cls):null; }catch(_){}
    if(!on) return {text:'when the level first reaches '+lvWord(li)+' (not in the issued days)', short:'when it reaches '+lvWord(li), at:null};
    var t0=pkMs(on.date), at=Math.max(Date.now(), t0-(fin(lead)?lead:0)*3600e3), now=at<=Date.now()+60e3, d=new Date(at+5*3600e3), sh=now?'now':dl(d.toISOString().slice(0,10))+' '+('0'+d.getUTCHours()).slice(-2)+':'+('0'+d.getUTCMinutes()).slice(-2)+' PKT';
    return {text:sh+' ('+(fin(lead)?lead+' h before ':'at ')+dl(on.date)+', the first day at '+lvWord(on.i)+')', short:sh, at:new Date(at).toISOString(), onset:new Date(t0).toISOString(), day:on.day}; }
  function advice(k,i,row,unit,sec){ var P=plan(), c=clsOf(i), own=owner(k,sec), txt=null;
    if(c==='Watch'||c==='Act'){ try{ txt=P&&P.text(k,c,sec); }catch(_){} var rb=readyBy(k,c,row,unit);
      return {cls:c, action:txt||('Apply the site response for '+lcName(k)+' at '+lvWord(i)+'.'), owner:own, ready:rb.text, readyShort:rb.short, at:rb.at}; }
    var w=null; try{ w=P&&P.text(k,'Watch',sec); }catch(_){} var lw=levelOfCls('Watch');
    return {cls:c, action:'No action is triggered at '+lvWord(i)+'; keep '+lcName(k)+' on the daily check and read the levels again at the next issue.'+(w?' If it reaches '+lvWord(lw)+': '+w:''), owner:own, ready:'daily check (the next issue of the levels)', readyShort:'daily check', at:null}; }
  function adviceHtml(a){ return '<b>'+esc(a.action)+'</b><br>Owner: '+esc(a.owner)+' · ready by '+esc(a.ready); }

  /* ---------- small builders ---------- */
  function pathwaysFor(doc,key){ var j=siteRisk(doc), re=HZRE[key]; return (j&&j.active||[]).filter(function(a){ return re&&re.test(String(a.title||'')+' '+(a.chain||[]).join(' ')); }); }
  function actsFor(doc,key){ var re=HZRE[key]; return records(doc).filter(function(r){ return r&&r.action&&(r.hazard===key||(re&&re.test(String(r.hazard||'')+' '+String(r.hazard_label||'')))); }); }
  /* the first actions: the client's dated action records first, then the action plan for each hazard above Normal (G6: owner and ready by on every row) */
  function firstActions(doc,EN,shown,n,unit){ var sec=sector(), rows=[];
    records(doc).filter(function(r){ return r&&r.action&&['planning','watch','standing'].indexOf(r.source)<0; }).sort(function(a,b){ return String(a.prepare_by||'9').localeCompare(String(b.prepare_by||'9')); })
      .forEach(function(r){ rows.push({action:r.action, hazard:nameOf(r.hazard_label||r.hazard||''), owner:r.owner_role||owner(keyOf(r.hazard)||r.hazard,sec), ready:r.prepare_by_text||'now', readyShort:String(r.prepare_by_text||'now').split(' (')[0], at:r.prepare_by||null}); });
    (shown||[]).filter(function(x){ return x.peak&&x.peak.i>=2; }).forEach(function(x){ var a=advice(x.key,x.peak.i,x.row,unit,sec); if(rows.some(function(r){ return r.hazard===x.label&&r.action===a.action; })) return;
      rows.push({action:a.action, hazard:x.label, owner:a.owner, ready:a.readyShort||a.ready, readyShort:a.readyShort, at:a.at, lv:x.peak.i}); });
    rows.slice(0,n||3).forEach(function(r){ if(/^(air quality|fog)$/i.test(String(r.hazard||''))) AIRK=true; });
    if(!rows.length&&shown&&shown[0]&&shown[0].peak){ var x=shown[0], a=advice(x.key,x.peak.i,x.row,unit,sec); rows.push({action:a.action, hazard:x.label, owner:a.owner, ready:a.readyShort||a.ready, at:a.at}); }
    return rows.slice(0,n||3); }
  function firstActionsHtml(rows,short){ return rows.length?RK().table(['#','Action','Hazard','Owner','Ready by'],rows.map(function(r,i){ return [String(i+1), esc(r.action), esc(r.hazard)||na(), esc(r.owner), esc(short&&r.readyShort?r.readyShort:r.ready)]; }))
    :RK().na('No hazard level was held when this report was made, so no action could be drawn from it.'); }
  /* v91.17.279 · CLAIMS279 P3 · a hazard that produced a first action is in Limits too (air quality has no level row) */
  var AIRK=false;
  function limKeys(keys){ var ks=(keys&&keys.length?keys:ORDER).slice(); if(AIRK&&ks.indexOf('aqi')<0) ks.push('aqi'); return ks; }
  function limitsBox(G0,keys,more){ var seen={}, li=[];
    limKeys(keys).forEach(function(k){ var e=G0&&G0.entry(k); if(!e||seen[e.id]) return; seen[e.id]=1; var L=(e.limitations||[]).slice(0,1); if(L.length) li.push('<li><b>'+esc(NAME[k]||k)+'</b> ('+esc(e.name)+'): '+L.map(esc).join('; ')+'.</li>'); });
    return '<div class="lim"><b>Limits.</b><ul>'+li.join('')+(more?'<li>'+esc(more)+'</li>':'')+'<li>Hazard levels are screening levels on the NIGRAAN scale (Normal, Low, Moderate, High, Severe), not probabilities.</li><li>This report is not an official warning. The national and provincial authorities issue warnings.</li></ul></div>'; }
  /* v91.17.279 · CLAIMS279 P2 · one product-type label per product (model gate product_type): the map legend, the reports and the AI read the same field */
  var PTC={'Forecast':'c-hi','Observation':'c-hi','Calibrated chance (area)':'c-hi','Ensemble share':'c-mod','Relative likelihood':'c-mod','Susceptibility':'c-mod','Screening index':'c-na','Reference':'c-na','Indicative':''};
  function ptOf(k){ try{ var g=window.AGN&&AGN.gate&&AGN.gate.entry?AGN.gate.entry(k):null, T=(window.AGN_MODEL_GATE&&AGN_MODEL_GATE.productTypes)||{}; return g&&g.productType?{t:g.productType, note:T[g.productType]||''}:null; }catch(_){ return null; } }
  function ptLine(k,st){ var p=ptOf(k); return p?(p.t+(p.note?': '+p.note:'')):RK().confText(st); }
  function ptBadge(k,st){ var p=ptOf(k); if(!p) return RK().conf(st); return '<span class="rk-conf '+(PTC[p.t]||'')+'">Product type · '+esc(p.t)+'</span>'; }
  function confOf(G0,k){ var e=G0&&G0.entry(k), st=e?e.status:'na'; return {badge:e?ptBadge(k,st):RK().conf(st), text:(e?ptLine(k,st):RK().confText(st))+(e?' · '+e.name:''), lim:(e&&e.limitations||[]).slice(0,2), status:st, entry:e}; }
  function bboxOf(rings){ var b=[180,90,-180,-90]; rings.forEach(function(r){ r.forEach(function(c){ if(c[0]<b[0]) b[0]=c[0]; if(c[1]<b[1]) b[1]=c[1]; if(c[0]>b[2]) b[2]=c[0]; if(c[1]>b[3]) b[3]=c[1]; }); }); return b; }
  function ringsOf(g){ if(!g) return []; if(g.type==='Polygon') return g.coordinates; if(g.type==='MultiPolygon') return [].concat.apply([],g.coordinates); return []; }
  var TEH=null; function tehsils(){ if(TEH) return TEH; try{ var fc=G.PK_DISTRICTS;   /* the tehsil polygons the map draws (577 tehsils, properties.uid = the engine's unit key) */ TEH=(fc&&fc.features||[]).map(function(f){ var r=ringsOf(f.geometry); return {uid:f.properties&&f.properties.uid, name:f.properties&&(f.properties.tehsil||f.properties.key), rings:r, bb:bboxOf(r)}; }).filter(function(t){ return t.uid&&t.rings.length; }); }catch(_){ TEH=[]; } return TEH; }
  /* G2 · town and city names for a report map: the confirmed cities and towns of the server's place table (AGN.places.towns, loaded once),
     the capital and cities before towns, larger first; the kit leaves out a name that would overlap one already placed */
  function towns(bb){ return (G.AGN&&G.AGN.places)?G.AGN.places.towns(bb):[]; }
  /* the tehsils around the place, coloured by one hazard's engine level on one day, with the report point, the AGN stations and place names */
  function hazardMap(o){ var T=tehsils(), P=o.place, title=o.title;
    if(!T.length||!fin(P.lat)) return RK().areaMap({title:title,missing:'Map not available: the tehsil boundaries or the report point were not held when the report was made.'});
    var own=T.filter(function(t){ return t.uid===P.unitId; })[0]||T.filter(function(t){ return P.lon>=t.bb[0]&&P.lon<=t.bb[2]&&P.lat>=t.bb[1]&&P.lat<=t.bb[3]; })[0];
    var bb=own?own.bb.slice():[P.lon-.2,P.lat-.2,P.lon+.2,P.lat+.2], w=bb[2]-bb[0], h=bb[3]-bb[1], pad=Math.max(.18,.6*Math.max(w,h));
    bb=[Math.min(bb[0],P.lon)-pad,Math.min(bb[1],P.lat)-pad,Math.max(bb[2],P.lon)+pad,Math.max(bb[3],P.lat)+pad];
    var kx=Math.cos((bb[1]+bb[3])/2*Math.PI/180), aw=(bb[2]-bb[0])*kx, ah=bb[3]-bb[1], want=2.72;
    if(aw/ah<want){ var dx=(ah*want/kx-(bb[2]-bb[0]))/2; bb[0]-=dx; bb[2]+=dx; } else { var dy=(aw/want-ah)/2; bb[1]-=dy; bb[3]+=dy; }
    var L=o.levels, seen={}, polys=T.filter(function(t){ return !(t.bb[2]<bb[0]||t.bb[0]>bb[2]||t.bb[3]<bb[1]||t.bb[1]>bb[3]); }).map(function(t){ var v=L?L[t.uid]:undefined, i=fin(v)&&+v>=0&&+v<=4?+v:null;
      var fill=i!=null?SEVC[i]:(fin(v)&&+v===-2?'#FFFFFF':NDC); seen[i!=null?'s'+i:(fin(v)&&+v===-2?'na':'nd')]=1;
      return {rings:t.rings, fill:fill, stroke:t===own?'#1F2A24':'#8C978F', width:t===own?2.2:0.8, own:t===own}; });
    polys.sort(function(a,b){ return (a.own?1:0)-(b.own?1:0); });   /* the place's own tehsil is drawn last, with the heavy outline */
    var pts=[], stSeen={}; (o.stations||[]).forEach(function(s){ if(s.lon<bb[0]||s.lon>bb[2]||s.lat<bb[1]||s.lat>bb[3]) return; var L0=null; try{ L0=AGN.stationStatus.label(s); }catch(_){} var st=L0&&STC[L0.status]?L0.status:'silent'; if(!L0) st='unknown';
      var c=st==='unknown'?'#FFFFFF':STC[st][0]; stSeen[st]=1; pts.push({lon:+s.lon,lat:+s.lat,color:c,r:5,shape:'sq'}); });
    (o.extra||[]).forEach(function(x){ pts.push(x); });
    if(!o.noPoint) pts.push({lon:P.lon,lat:P.lat,shape:'star',color:'#1F2A24',label:P.name||'Report point',r:6});
    var lg=[]; [0,1,2,3,4].forEach(function(i){ if(seen['s'+i]) lg.push([SEVC[i],lvWord(i),1]); }); if(seen.nd) lg.push([NDC,'No level',1]); if(seen.na) lg.push(['#FFFFFF','Does not occur here',1]);
    Object.keys(STC).forEach(function(k){ if(stSeen[k]) lg.push([STC[k][0],STC[k][1],1]); }); if(stSeen.unknown) lg.push(['#FFFFFF','AGN station, status not read',1]);
    lg.push(['#6E7B73','Town or city']);
    return RK().areaMap({title:title, h:o.h||250, units:'tehsils coloured by level', dates:o.dates, bbox:bb, polys:polys, points:pts, labels:towns(bb), legend:lg, source:o.source, reading:o.reading,
      missing:'Map not available: the tehsil levels for this day were not answered by the hazard engine.'}); }

  /* ---------- G2 · sections every place report shares ---------- */
  /* evidence-based confidence: the data behind the level, the model gate, and how far the forecast members agree on its driver */
  function confEvidence(X,x,S,EN){ var c=confOf(X.gate,x.key), pk=x.peak, dd=S.days&&pk?S.days.filter(function(z){ return z.date===pk.date; })[0]:null, C=lc(X.doc)||{}, out=[];
    var data=[]; if(EN.at) data.push('hazard levels from the engine run of '+RK().when(Date.parse(EN.at)));
    if(S.at) data.push('15-day forecast run of '+RK().when(Date.parse(S.at))+(S.members?', '+S.members+' members':''));
    if(X.stn) data.push(X.stn.checked+' of '+X.stn.n+' AGN stations within 25 km checked against the forecast');
    if(C.skill&&C.skill.label) data.push('forecast basis: '+C.skill.label);
    out.push('<b>Data:</b> '+(data.length?esc(cap(data.join('; ')))+'.':na('the inputs behind this level were not held')));
    out.push('<b>Model gate:</b> '+esc(c.text)+(c.lim.length&&!X.noChart?'. Known limits: '+esc(c.lim.join('; '))+'.':(X.noChart&&c.lim.length?' (its known limits: Limits and sources).':'.')));
    var ag=null;
    if(dd){ if(x.key==='heat'||x.key==='glof'){ if(q(dd.tx,0)!=null&&q(dd.tx,2)!=null) ag='on '+dl(pk.date)+' 10 to 90 % of members give a day high of '+f1(q(dd.tx,0))+' to '+f1(q(dd.tx,2))+' °C (a spread of '+f1(q(dd.tx,2)-q(dd.tx,0))+' °C)'; }
      else if(x.key==='cold'){ if(q(dd.tn,0)!=null&&q(dd.tn,2)!=null) ag='on '+dl(pk.date)+' 10 to 90 % of members give a night low of '+f1(q(dd.tn,0))+' to '+f1(q(dd.tn,2))+' °C (a spread of '+f1(q(dd.tn,2)-q(dd.tn,0))+' °C)'; }
      else if(x.key==='wind'){ if(q(dd.gu,0)!=null&&q(dd.gu,2)!=null) ag='on '+dl(pk.date)+' 10 to 90 % of members give a strongest gust of '+f1(q(dd.gu,0))+' to '+f1(q(dd.gu,2))+' km/h'; }
      else if(x.key!=='drought'){ ag=(dd.p&&fin(dd.p.pr10))?('on '+dl(pk.date)+' '+dd.p.pr10+' % of members bring 10 mm of rain or more'):(q(dd.pr,2)!=null?'on '+dl(pk.date)+' the members range from '+f1(q(dd.pr,0))+' to '+f1(q(dd.pr,2))+' mm of rain':null); } }
    out.push('<b>Agreement:</b> '+(ag?esc(cap(ag))+'.':(x.key==='drought'?'not applicable: drought is a condition index over weeks, not a single forecast day.':na('the forecast members for the peak day were not held'))));
    return {html:out.join('<br>'), c:c}; }
  /* the trigger ladder of each hazard shown: the screening cut of each class (data/hazard-scale.json, AGN.hazardValue) and what follows */
  function triggersHtml(keys,unit){ var K=RK(), sec=sector(), P=plan(), rows=[], mon=null;
    try{ var cm=AGN.hazardValue.cutFor('Monitor',keys[0]||'heat'), wm=AGN.level.ofClass('Monitor'); if(fin(cm)) mon={cut:cm, i:K.levelIndex(wm)}; }catch(_){}
    keys.forEach(function(k){ ['Watch','Act'].forEach(function(c){ var cut=null, w=null, lead=null, txt=null; try{ cut=AGN.hazardValue.cutFor(c,k); w=AGN.level.ofClass(c); }catch(_){} try{ lead=P&&P.lead?P.lead(c):null; }catch(_){}
      try{ txt=P&&P.text(k,c,sec); }catch(_){}
      var li=K.levelIndex(w); rows.push(['<b>'+esc(NAME[k])+'</b>', (li!=null?sev(li):na())+(fin(cut)?'<br><span class="small">index '+esc(String(cut))+'+</span>':''),
        esc(txt||'Apply the site response for this hazard.'), esc(fin(lead)?lead+' h before the first day at this level':'before the first day at this level'), esc(owner(k,sec))]); }); });
    return rows.length?'<h3>Triggers: from level to action</h3>'+K.table(['Hazard','Level (screening index)','What to do','Ready by','Owner'],rows)
      +'<p class="small">'+(mon&&mon.i!=null?esc(lvWord(mon.i))+' (index '+esc(String(mon.cut))+' or more): keep the hazard on the daily check; no action is triggered. ':'')+'The level of each hazard is placed on the NIGRAAN scale by the cuts of its screening index (data/hazard-scale.json); Moderate, High and Severe are the classes Monitor, Watch and Act of the operational ladder. The actions, owners and lead times are the action plan NIGRAAN uses on the Operations tab.</p>':''; }
  /* "How to use these figures": what each kind of figure in a NIGRAAN report is good for, and not for */
  function howToHtml(o){ o=o||{}; var K=RK(), rows=[['Hazard levels (Normal to Severe)','screening levels from the hazard engine, by tehsil and day (the map)','ranking places and days; timing the preparations','a probability of damage, a design value or an official warning','treat High and Severe as real until a site check says otherwise']];
    if(!o.noForecast){ rows.push(['Next 72 hours (high, low, rain)','the corrected hourly forecast at the place (the Forecast tab)','shifts, work windows and the first days of the plan','a guarantee of the hour','read the range shown with the high']);
      rows.push(['15-day forecast (median, 10 to 90 % of members)','the served ensemble at the place','planning the days ahead and spotting a change','an exact value on a given day','plan on the 90 % member for rain and the hot end of the range for heat']);
      rows.push(['Multi-day event shares','the share of forecast members that bring the event','how much the members agree','a calibrated probability','compare with the usual share for these days']); }
    if(!o.noRecords) rows.push(['Past days and event history','what was measured and issued here (NIGRAAN archives, AGN stations)','what has happened at the place','a forecast: a quiet record is not a safe place','–']);
    if(!o.noCmip) rows.push(['2030s and 2050s (CMIP6)','the median and range of the climate models against 1991–2010','the direction and size of the change for planning','a forecast or a design value','the high end of the model range for long-lived assets']);
    /* v91.17.273: three columns (five narrow ones ran each row to five lines) */
    return '<h3>How to use these figures</h3>'+K.table(['Figure: what it is','Good for · not for','Prudent reading'],rows.map(function(r){ return ['<b>'+esc(r[0])+'</b>: '+esc(r[1]),'Good for '+esc(r[2])+'.<br>Not for '+esc(r[3])+'.',esc(r[4]==='–'?'–':cap(r[4]))]; })); }
  /* the event history of the place: the levels NIGRAAN issued here and the extremes its stations measured in the archive window, and the
     documented outbursts of the glacial lakes that drain here (where the register answers) */
  function historyHtml(X,place){ var K=RK(), j=X.hist, out='';
    if(!j) return K.na('The event history for '+place+' is not available right now (the server did not answer).');
    if(j.ok===false) return K.na('The event history for '+place+' is not available: '+(j.reason||'no reason was given')+'.');
    var ep=[], by={}; (j.levels||[]).forEach(function(x){ var k=keyOf(x.hazard)||x.hazard, i=K.levelIndex(x.level); if(i==null) return; (by[k]=by[k]||[]).push({date:x.date,i:i}); });
    Object.keys(by).forEach(function(k){ var a=by[k].sort(function(x,y){ return x.date<y.date?-1:1; }), cur=null;
      a.forEach(function(d){ if(cur&&(pkMs(d.date)-pkMs(cur.to))<=864e5+3600e3){ cur.to=d.date; cur.n++; if(d.i>cur.i) cur.i=d.i; } else { cur={k:k,from:d.date,to:d.date,n:1,i:d.i}; ep.push(cur); } }); });
    ep.sort(function(a,b){ return b.i-a.i||(a.from<b.from?1:-1); });
    out+='<h3>Levels NIGRAAN issued here, '+esc(dl(j.from))+' to '+esc(dl(j.to))+'</h3>';
    out+=ep.length?K.table(['Hazard','From','To','Days','Highest level'],ep.slice(0,12).map(function(e){ return ['<b>'+esc(NAME[e.k]||e.k)+'</b>',esc(dl(e.from)),esc(dl(e.to)),esc(String(e.n)),sev(e.i)]; }),[3])+(ep.length>12?'<p class="small">'+(ep.length-12)+' shorter episodes are not listed.</p>':'')
      :K.na('No level above Normal was issued here between '+dl(j.from)+' and '+dl(j.to)+', or none was archived for this place.');
    var S=j.summary||{}, rd=[];
    if(fin(S.tmaxC)) rd.push(['Hottest day',f1(S.tmaxC)+' °C',S.tmaxDate?dl(S.tmaxDate):'–']); if(fin(S.tminC)) rd.push(['Coldest night',f1(S.tminC)+' °C',S.tminDate?dl(S.tminDate):'–']);
    if(fin(S.wettestMm)) rd.push(['Wettest day',f1(S.wettestMm)+' mm',S.wettestDate?dl(S.wettestDate):'–']); if(fin(S.rainMm)) rd.push(['Rain in all',f1(S.rainMm)+' mm'+(fin(S.rainNormalMm)?' (normal '+f1(S.rainNormalMm)+' mm)':''),'–']);
    out+='<h3>Extremes measured here in the same days</h3>'+(rd.length?K.table(['Measure','Value','Day'],rd.map(function(r){ return ['<b>'+esc(r[0])+'</b>',esc(r[1]),esc(r[2])]; })):K.na('No complete station day or satellite rain day is held for this place in these days.'));
    var GL=X.glof; if(GL&&GL.lakes&&GL.lakes.length){ out+='<h3>Glacial lakes that drain here</h3>'+K.table(['Lake','Documented outbursts'],GL.lakes.map(function(z){ var L=z.lake||{}, I=z.info||{}, ev=I.documentedEvents, n=ev&&Array.isArray(ev.events)?ev.events.length:(Array.isArray(ev)?ev.length:null);
        return [esc(L.name||L.id||'unnamed lake'), n!=null?esc(plural(n,'documented outburst')):na('none documented in the register')]; })); }
    out+='<p class="small">From NIGRAAN\'s own archives: the levels the engine issued for this tehsil (day 0 of each issue), the AGN station record within 25 km and the satellite rain over the tehsil. The archive window is the longest the server serves ('+HIST_DAYS+' days); a short or empty record is not evidence that the place is safe.</p>';
    return out; }
  /* the climate-model outlook (CMIP6) at the place: the change of the daily maximum and of the yearly rain, model median and range */
  function cmipHtml(X,place){ var K=RK(), c=X.cmip;
    if(!c||!c.horizons) return '<p>'+K.conf('projection')+'</p>'+K.na('The climate-model outlook for '+place+' is not available: '+((c&&c.why)||'the climate models did not answer')+'.');
    var H=c.horizons, sg=function(v){ var r=Math.round(Number(v)*10)/10; if(r===0) r=0; return (r>=0?'+':'')+K.nf(r,1); }, last=H[H.length-1];
    var rows=H.map(function(x){ return {label:x.h+'s ('+String(x.win[0]).slice(0,4)+'–'+String(x.win[1]).slice(0,4)+')', lo:x.dT.lo, mid:x.dT.m, hi:x.dT.hi, color:'#B7791F'}; });
    return '<p>'+K.conf('projection')+'</p>'+K.rangeChart({title:'Change of the daily maximum temperature at '+place, units:'°C against '+String(c.base[0]).slice(0,4)+'–'+String(c.base[1]).slice(0,4), dates:H.map(function(x){ return x.h+'s'; }).join(' and '), rows:rows, fmt:sg, labelW:200,
        legend:[['#B7791F','Median of the models (dot), lowest to highest model (bar)']], source:'CMIP6 high-resolution climate models ('+last.dT.n+' answered), downscaled to the place, one high-emission path', reading:'By the '+last.h+'s the daily maximum changes by '+sg(last.dT.m)+' °C (models '+sg(last.dT.lo)+' to '+sg(last.dT.hi)+' °C). A projection for planning, not a forecast and not a design value.'})
      +K.table(['Measure'].concat(H.map(function(x){ return x.h+'s'; })),[['<b>Daily maximum</b>'].concat(H.map(function(x){ return esc(sg(x.dT.m)+' °C ('+sg(x.dT.lo)+' to '+sg(x.dT.hi)+')'); })),['<b>Yearly rain</b>'].concat(H.map(function(x){ return x.dP?esc(sg(x.dP.m)+' % ('+sg(x.dP.lo)+' to '+sg(x.dP.hi)+')'):na(); }))])
      +'<p class="small">Median of the models with the lowest and highest model in brackets, against '+esc(String(c.base[0]).slice(0,4)+'–'+String(c.base[1]).slice(0,4))+'. Context only: it does not change any hazard level in this report.</p>'; }
  function limitsFirst(G0,keys){ var K=RK(), rows=[], seen={}, more=0;
    limKeys(keys).forEach(function(k){ var e=G0&&G0.entry(k); if(!e){ rows.push(['<b>'+esc(NAME[k]||k)+'</b>',RK().conf('na'),na()]); return; } if(seen[e.id]) return; seen[e.id]=1; var L=e.limitations||[]; more+=Math.max(0,L.length-1);
      rows.push(['<b>'+esc(NAME[k]||k)+'</b><br><span class="small">'+esc(e.name)+'</span>',esc(ptLine(k,e.status)),L.length?esc(cap(String(L[0]).replace(/[.;\s]+$/,'')))+'.':na()]); });
    return '<h3>Confidence and the first known limit of each hazard</h3>'+(G0?'':K.na('The model gate did not answer when this report was made, so confidence is not available.'))+K.table(['Hazard and model','Product type','First known limit'],rows)
      +(more?'<p class="small">'+esc(plural(more,'more known limit'))+' of these models: in the record of this report (Download record, appendix) and in the Methodology and assurance pack.</p>':''); }
  function limitsTable(G0,keys){ var K=RK(), rows=[], seen={};
    limKeys(keys).forEach(function(k){ var e=G0&&G0.entry(k); if(!e){ rows.push(['<b>'+esc(NAME[k]||k)+'</b><br>'+RK().conf('na'),na()]); return; } if(seen[e.id]) return; seen[e.id]=1;
      rows.push(['<b>'+esc(NAME[k]||k)+'</b><br><span class="small">'+esc(e.name)+'. Product type: '+esc(ptLine(k,e.status))+'</span>',(e.limitations||[]).length?esc(e.limitations.map(function(l){ return cap(String(l).replace(/[.;\s]+$/,'')); }).join('. '))+'.':na()]); });
    /* v91.17.273: the model under the hazard and its known limits as one paragraph in a wide column (the four-column table with a bullet list ran to two pages) */
    return '<h3>Confidence and limits of the hazards in this report</h3>'+(G0?'':K.na('The model gate did not answer when this report was made, so confidence is not available.'))+K.table(['Hazard, model and product type','Known limits'],rows).replace(/^<table(?! class)/,'<table class="long"'); }

  /* ---------- the situation report ---------- */
  function sitBuild(X){ AIRK=false;
    var K=RK(), doc=X.doc, P=X.place, S=series(doc,X), EN=engine(doc,X), G0=X.gate, j30=(X.p30&&X.p30.state==='ok'&&X.p30.j&&X.p30.j.ok===true)?X.p30.j:null, SR=siteRisk(doc);
    var run=S.at?K.when(Date.parse(S.at)):(EN.at?K.when(Date.parse(EN.at)):null);
    var place=P.name||'this place';
    var SH=shownOf(EN), withPk=SH.withPk, top=SH.top, above=SH.above, shown=SH.shown;
    var hot=null, rainT=null, cold=null, wet=null;
    if(S.days){ S.days.forEach(function(d){ var tx=q(d.tx,1), tn=q(d.tn,1), pr=q(d.pr,1); if(tx!=null&&(!hot||tx>hot.v)) hot={v:tx,d:d.date,lo:q(d.tx,0),hi:q(d.tx,2)}; if(tn!=null&&(!cold||tn<cold.v)) cold={v:tn,d:d.date};
      if(pr!=null){ rainT=(rainT||0)+pr; if(!wet||pr>wet.v) wet={v:pr,d:d.date}; } }); }
    var Sm=j30&&j30.summary||{};
    var stn=j30&&Array.isArray(j30.stations)?j30.stations:null, stChecked=stn?stn.filter(function(s){ var L=null; try{ L=AGN.stationStatus.label(s); }catch(_){} return L?L.status==='checked':s.checked===true; }).length:null;
    X.stn=stn?{n:stn.length, checked:stChecked}:null;
    var paths=SR&&Array.isArray(SR.active)?SR.active:null, N72=X.n72;
    var acts=firstActions(doc,EN,shown,3,P.unitId);
    var rec=K.record({kind:'Situation report', run:S.at||EN.at||null,
      subject:{place:place, tehsil:P.tehsil, district:P.district, province:P.province, unit_id:P.unitId, lat:P.lat, lon:P.lon, point_basis:P.basis},
      inputs:{frozen_document:doc.id||null, document_hash:doc.document_hash||null, forecast_run:S.at||null, forecast_members:S.members||null, levels_run:EN.at||null, past30:j30?{from:j30.from,to:j30.to}:null, gate_version:G0&&G0.version||null},
      results:{highest:top&&top.peak?{hazard:top.key,level:cw(top.peak),date:top.peak.date}:null, hottest_day:hot?{c:hot.v,date:hot.d}:null, rain_15d_mm:rainT!=null?Math.round(rainT*10)/10:null,
        next72:N72?{high_c:N72.high?N72.high.c:null, low_c:N72.low?N72.low.c:null, rain_mm:N72.rain?N72.rain.mm:null}:null,
        levels_by_day:levelsRec(EN),
        past30_rain_mm:fin(Sm.rainMm)?+Sm.rainMm:null, past30_rain_normal_mm:fin(Sm.rainNormalMm)?+Sm.rainNormalMm:null, stations_25km:stn?stn.length:null, stations_checked:stChecked, pathways:paths?paths.length:null,
        hazards:shown.map(function(h){ var e=G0&&G0.entry(h.key); return {hazard:h.key, peak:cw(h.peak), date:h.peak.date, gate_status:e?e.status:null}; }),
        actions:acts.map(function(a){ return {action:a.action, hazard:a.hazard, owner:a.owner, ready_by:a.ready}; })},
      methods:{engine_build:doc.build_version||null, gate:G0&&G0.version||null},
      dates:{issued_utc:new Date().toISOString(), window:S.days?[S.days[0].date,S.days[S.days.length-1].date]:null},
      limits:['screening levels on the NIGRAAN scale, not probabilities','not an official warning']});
    rec.report_id=rec.report_id.replace(/^NIGRAAN-[A-Z0-9]+-/,'NIGRAAN-SIT-');
    var id=rec.report_id, now=K.when();
    var vb=top&&top.peak?(top.peak.i>=2?(top.label+' reaches '+cw(top.peak)+' on '+dl(top.peak.date)):('no hazard at this place in the '+plural(EN.days.length,'day')+' the hazard engine has issued')):'the hazard levels were not available when this report was made';
    var vp=paths?(paths.length?(plural(paths.length,'pathway')+' could affect operations in the next 15 days'):'no pathway that affects operations switches on in the next 15 days'):null;
    var verdict=place+': '+vb+(vp?'; '+vp:'')+'.';
    rec.verdict=verdict;
    var cards=K.card('Highest level, next days', top&&top.peak?(top.peak.i>=2?esc(top.label)+' '+sev(top.peak.i,top.peak.label||null):'No hazard'):na(), top&&top.peak?(top.peak.i>=2?esc(dl(top.peak.date)):'nothing reaches Moderate')+' · engine levels for '+plural(EN.days.length,'day'):esc(EN.why||'Not available'));
    cards+=K.card('Next 72 hours', N72&&N72.high&&N72.low?esc(f1(N72.high.c))+' / '+esc(f1(N72.low.c))+' °C':na(), N72&&N72.high&&N72.low?'high '+esc(n72Label(N72.high.time))+', low '+esc(n72Label(N72.low.time))+'; '+(N72.rain&&N72.rain.hours?(N72.rain.mm>=0.1?esc(f1(N72.rain.mm))+' mm of rain':'no rain in the three day totals'):'rain not in this forecast'):'the place record days were not held','a');
    cards+=K.card('Hottest day, 15 days', hot?esc(f1(hot.v))+' °C':na(), hot?esc(dl(hot.d))+(hot.lo!=null&&hot.hi!=null?' · members '+esc(f1(hot.lo))+' to '+esc(f1(hot.hi))+' °C':''):esc(S.why||'Not available'),'a');
    cards+=K.card('Rain, next 15 days', rainT!=null?esc(f1(rainT))+' mm':na(), wet?(wet.v>0?'wettest '+esc(dl(wet.d))+', '+esc(f1(wet.v))+' mm':'no day with rain in the median'):'Not available','p');
    cards+=K.card('Past 30 days rain', fin(Sm.rainMm)?esc(f1(Sm.rainMm))+' mm':na(), fin(Sm.rainNormalMm)?'normal '+esc(f1(Sm.rainNormalMm))+' mm':'normal not available','g');
    cards+=K.card('AGN stations nearby', stn?esc(stChecked+' of '+stn.length)+' checked':na(), stn?'within 25 km':'Not available');
    var ctx={K:K,X:X,doc:doc,P:P,S:S,EN:EN,G0:G0,j30:j30,place:place,top:top,shown:shown,above:above,withPk:withPk,hot:hot,cold:cold,rainT:rainT,wet:wet,acts:acts,paths:paths,id:id,now:now,run:run,verdict:verdict,cards:cards,kind:'Situation report'};
    if(X.edition==='short') return briefOut(ctx,rec,briefPlace(ctx));
    var h='<div class="rk">';
    var contents=['Summary','The past 30 days','The next 15 days','Hazards','What to do','Monitoring and review','Event history','Long-term climate','Limits and sources'].concat(isOp()?['Appendix (operator)']:[]);
    h+=K.cover({kind:'Situation report', title:place, subtitle:P.adm||'', contents:contents, logo:logo()});
    h+=X.mark||'';
    h+=K.h2('1','Summary')+K.issued({when:now, run:run, id:id});
    h+='<div class="rk-cards">'+cards+'</div><p class="stmt">'+esc(verdict)+'</p>';
    h+='<h3>First actions</h3>'+firstActionsHtml(acts);
    h+=limitsBox(G0,shown.map(function(x){ return x.key; }),'The first known limit of each model is shown here; all of them are listed in section 9, Limits and sources.');
    h+=pb(K.h2('2','The past 30 days'));
    h+=past30Html(X,place);
    h+=K.h2('3','The next 15 days');
    h+=n15Html(ctx);
    h+=pb(K.h2('4','Hazards'));
    h+=findingsHtml(ctx);
    h+=K.h2('5','What to do')+actionsHtml(doc)+triggersHtml(shown.map(function(x){ return x.key; }),P.unitId);
    var St=steps(doc), blk=function(t,rows){ return rows&&rows.length?'<h3>'+esc(t)+'</h3>'+K.table(['#','Step','Why'],rows.map(function(r,i){ return [String(i+1),'<b>'+esc(r[0])+'</b>',esc(r[1])]; })):''; };
    h+=K.h2('6','Monitoring and review')+((St?blk('Monitoring and data',St.monitor)+blk('Review',St.review):'')||K.na('The monitoring plan could not be drawn from what this report holds.'));
    h+=K.h2('7','Event history')+historyHtml(X,place);
    h+=K.h2('8','Long-term climate')+cmipHtml(X,place);
    h+=pb(K.h2('9','Limits and sources'))+limitsTable(G0,shown.map(function(x){ return x.key; }))+howToHtml()+sourcesHtml(X,S,EN,j30);
    if(isOp()) h+=appendix(doc);
    h+=K.foot({id:id, when:now, run:run})+'</div>';
    return {html:glofFirst(h), record:rec, verdict:verdict, title:'Situation report · '+place, place:place, pending30:X.p30pending}; }
  function levelsRec(EN){ if(!EN.days) return null; var o={}; EN.hz.forEach(function(x){ o[x.key]=x.row.map(function(c){ return c.i!=null?cw(c):null; }); }); return {dates:EN.days.map(function(d){ return d.date; }), levels:o}; }

  /* v91.17.283.35 · audit L8 · GLOF susceptibility and the drought screening are standing risks: never a dated hazard of the period (server hazardList.standing) */
  var STANDING={glof:1,drought:1};
  function shownOf(EN){ var withPk=(EN.hz||[]).filter(function(h){ return h.peak&&!STANDING[h.key]; }), top=withPk.slice().sort(function(a,b){ return b.peak.i-a.peak.i||String(a.peak.date).localeCompare(String(b.peak.date)); })[0]||null;
    /* v91.17.283.31 · owner · a hazard is listed only at Moderate or above; Low is a condition line (lowLines), never a hazard or an alert */
    var above=withPk.filter(function(h){ return h.peak.i>=2; }).sort(function(a,b){ return b.peak.i-a.peak.i; }), low=withPk.filter(function(h){ return h.peak.i===1; });
    return {withPk:withPk, top:top, above:above, low:low, shown:above}; }
  /* the condition line of a Low hazard: "moderate heat stress on Thu 30" (heat and cold carry the register's words, utci.heatLevels / coldLevels) */
  var LOWW={heat:'moderate heat stress', cold:'moderate cold stress'};
  function lowLine(x){ var w=LOWW[x.key]||('minor '+String(x.label||x.key).toLowerCase()+' conditions'), d=x.peak&&x.peak.date?' on '+dl(x.peak.date):''; return w+d; }
  AGN.reportLevels={ shownOf:function(EN){ return shownOf(EN); }, lowLine:lowLine, NONE:'No hazard at this site in the period.',
    findings:function(EN,HL){ var SH=shownOf(EN); return findingsHtml({K:RK(), X:{}, S:{}, EN:EN, hl:HL||null, shown:SH.shown, above:SH.above, withPk:SH.withPk, max:0}); } };
  function n15Html(c){ var K=c.K, S=c.S, EN=c.EN, P=c.P, h='';
    if(S.days){ var days=S.days.map(function(d){ return d.date; }), hot=c.hot, cold=c.cold;
      var rd=[]; if(hot) rd.push('The hottest day is '+dl(hot.d)+' at '+f1(hot.v)+' °C'+(hot.lo!=null?' (10 to 90 % of members '+f1(hot.lo)+' to '+f1(hot.hi)+' °C)':'')); if(cold) rd.push('the coldest night '+dl(cold.d)+' at '+f1(cold.v)+' °C');
      var wetN=S.days.filter(function(d){ return (q(d.pr,1)||0)>0; }).length; rd.push(wetN?('rain falls in the median on '+plural(wetN,'day')+', '+f1(c.rainT)+' mm in all'):'no day has rain in the median');
      h+=K.dayChart({title:'Day high, night low and rain at '+c.place, units:'°C, mm', dates:dl(days[0])+' to '+dl(days[days.length-1]), days:days,
        lines:[{name:'Day high (median)',vals:S.days.map(function(d){ return q(d.tx,1); }),color:'#B7791F'},{name:'Night low (median)',vals:S.days.map(function(d){ return q(d.tn,1); }),color:'#1E7A68'}],
        band:{name:'Day high, 10 to 90 % of '+(S.members?S.members+' ':'')+'members',lo:S.days.map(function(d){ return q(d.tx,0); }),hi:S.days.map(function(d){ return q(d.tx,2); }),color:'#B7791F'},
        bars:{name:'Rain (median)',vals:S.days.map(function(d){ return q(d.pr,1); }),units:'mm'}, y:{label:'°C'}, now:0,
        source:'NIGRAAN served 15-day ensemble forecast'+(P.tehsil?' for '+P.tehsil+' tehsil':'')+', run of '+K.when(Date.parse(S.at)), reading:cap(rd.join('; '))+'.'});
    } else h+=K.na('The 15-day forecast is not available: '+S.why+'.');
    if(EN.days){ var hd=EN.days.map(function(d){ return esc(dl(d.date)); });
      var rows=EN.hz.filter(function(x){ return x.peak||x.notApplicable; }).map(function(x){ return ['<b>'+esc(x.label)+'</b>'].concat(x.row.map(function(cc){ return gapCell(x,cc); })); });
      h+='<h3>Hazard levels by day</h3>'+K.table(['Hazard'].concat(hd),rows)+gapNote(EN)+'<p class="small">The hazard engine issues levels for the first '+plural(EN.days.length,'day')+(EN.at?' (run of '+esc(K.when(Date.parse(EN.at)))+')':'')+'; the days after that are read from the ensemble chances below.</p>';
    } else h+=K.na('The hazard levels by day are not available: '+EN.why+'.');
    h+=eventsHtml(c.X,S);
    return h; }
  /* v91.17.283.35 · audit A3 · the hazard list is the SERVER's (served unit hazardList, hazardlist.mjs): "No hazard at this site in the period"
     only when every daily hazard was assessed below Moderate on every day; else the not-assessed layers with their reasons; standing risks apart */
  function hlOf(c){ var X=c&&c.X; return X&&X.ulv&&X.ulv.hazardList&&X.ulv.hazardList.ready?X.ulv.hazardList:(c&&c.hl&&c.hl.ready?c.hl:null); }
  function standingHtml(HL){ if(!HL||!HL.standing||!HL.standing.length) return ''; return '<h3>Standing risk (not a forecast for a day)</h3><p class="small rk-standing">'+esc(HL.standing.map(function(x){ return x.name+': '+x.word+(x.why?' ('+x.why+')':'')+' \u2014 '+x.basis; }).join('; '))+'.</p>'; }
  function notAssessedHtml(HL){ if(!HL||!HL.notAssessed||!HL.notAssessed.length) return ''; return '<p class="small rk-na">Not assessed in the period: '+esc(HL.notAssessed.map(function(x){ return x.name+' ('+x.why+')'; }).join('; '))+'.</p>'; }
  function findingsHtml(c){ var K=c.K, h='', HL=hlOf(c);
    if(!(c.withPk||[]).length&&!HL) return K.na('No hazard level is available for this place: '+(c.EN.why||'the engine answered no level')+'.');
    var lowL=HL?HL.conditions.map(function(x){ return x.text; }):(c.withPk||[]).filter(function(x){ return x.peak.i===1; }).map(lowLine);
    var cond=(lowL.length?'<p class="small rk-cond">Conditions (not hazards, no alert): '+esc(list(lowL))+'.</p>':'')+notAssessedHtml(HL)+standingHtml(HL);
    if(!c.shown.length){ if(!HL) return K.na('The hazard list of this place was not held when this report was made.')+cond;
      return (HL.none?'<p class="rk-nohaz"><b>'+esc(HL.none)+'.</b></p>':'<p class="rk-nohaz"><b>'+esc(HL.partial||HL.nothingAssessed||'No hazard list could be made for this place')+'.</b></p>')+cond; }
    var sh=c.max?c.shown.slice(0,c.max):c.shown; sh.forEach(function(x){ h+=findingHtml(c.X,x,c.S,c.EN); });
    var more=c.shown.filter(function(x){ return sh.indexOf(x)<0; }).map(function(x){ return x.label+' ('+cw(x.peak)+')'; });
    if(more.length) h+='<p class="small">Also at Moderate or above, with their levels by day in the summary table: '+esc(list(more))+'. The Situation report sets out every hazard in full.</p>';
    return h+cond; }
  function past30Html(X,place){ var K=RK(), c=X.p30;
    if(!c||c.state==='none') return K.na('The past 30 days are not available for this report: no place with coordinates was chosen when it was made.');
    if(c.state==='loading') return '<div data-p30-pending="1">'+K.na('The past 30 days for '+place+': not available right now (still being read when this report was made). The report is made again by itself when they arrive.')+'</div>';
    if(c.state!=='ok'||!c.j) return K.na('The past 30 days for '+place+': not available right now (the server did not answer).');
    var j=c.j; if(j.ok===false) return K.na('The past 30 days for '+place+' are not available: '+(j.reason||'no reason was given')+'.');
    var S=j.summary||{}, dd=(j.daily||[]).filter(function(d){ return d&&d.date; }), h='';
    var rd=[]; if(fin(S.tmaxC)) rd.push('the hottest day was '+(S.tmaxDate?dl(S.tmaxDate)+' at ':'')+f1(S.tmaxC)+' °C'); if(fin(S.tminC)) rd.push('the coldest night '+(S.tminDate?dl(S.tminDate)+' at ':'')+f1(S.tminC)+' °C');
    if(fin(S.rainMm)) rd.push(f1(S.rainMm)+' mm of rain fell'+(fin(S.wetDays)?' on '+plural(+S.wetDays,'wet day')+' (1 mm or more)':'')+(S.wettestDate&&fin(S.wettestMm)?', the wettest '+dl(S.wettestDate)+' with '+f1(S.wettestMm)+' mm':'')+(fin(S.rainNormalMm)?' (normal for these days '+f1(S.rainNormalMm)+' mm)':''));
    if(fin(S.tmeanAnomC)) rd.push('the daily mean temperature was '+(+S.tmeanAnomC>0?'+':'')+(+S.tmeanAnomC).toFixed(1)+' °C against normal');
    if(!fin(S.tmaxC)&&!fin(S.tminC)) rd.push('day highs and night lows are not available (no checked station had a complete day)');
    var hasT=dd.some(function(d){ return fin(d.tmaxC)||fin(d.tminC); });
    if(dd.length) h+=K.dayChart({title:(hasT?'Day high, night low and rain at ':'Daily rain at ')+place, units:hasT?'°C, mm':'mm', dates:dl(j.from)+' to '+dl(j.to), days:dd.map(function(d){ return d.date; }),
      lines:hasT?[{name:'Day high',vals:dd.map(function(d){ return d.tmaxC; }),color:'#B7791F'},{name:'Night low',vals:dd.map(function(d){ return d.tminC; }),color:'#1E7A68'}]:[],
      bars:{name:'Rain',vals:dd.map(function(d){ return d.rainMm; }),units:'mm'}, y:{label:'°C'}, h:260, source:(j.sources&&j.sources.length?j.sources.join('; '):'NIGRAAN archives')+'. A day without a value is a gap, not a zero.', reading:cap(rd.join('; '))+'.'});
    else h+=K.na('The day-by-day values are not available for this place.');
    var LV=j.levels; if(Array.isArray(LV)&&LV.length){ var by={}; LV.forEach(function(x){ (by[x.date]=by[x.date]||[]).push(x); });
      h+='<h3>Levels NIGRAAN issued here</h3>'+K.table(['Day','Hazard and level'],Object.keys(by).sort().map(function(d){ return [esc(dl(d)),by[d].map(function(x){ return esc(nameOf(x.hazard))+' '+sev(RK().levelIndex(x.level)); }).join(' · ')]; })); }
    else h+='<h3>Levels NIGRAAN issued here</h3>'+K.na(Array.isArray(LV)?'No level above Normal was issued here in these 30 days, or none was archived for this place.':'The issued levels are not available for this place.');
    var SN=Array.isArray(j.stations)?j.stations:null;
    h+='<h3>AGN weather stations within 25 km</h3>';
    /* v91.17.278 · FIX278 2: a row needs a station name (the server lists registered MACH stations only); its status comes with the row;
       a station whose readings stop before the window's last day shows a dash, not old highs and lows; the Rain column is gone (the note
       below the table says why station rain is not shown) */
    if(SN) SN=SN.filter(function(s){ return s&&s.name; });
    if(SN&&SN.length) h+=K.table(['Station','Distance','Status','Highest','Lowest','Days with readings'],SN.slice(0,12).map(function(s){ var L=null; try{ L=AGN.stationStatus.label(s); }catch(_){}
        var cur=s.current!==false, dash='<span class="muted">—</span>';
        return [esc(s.name), fin(s.km)?esc(f1(s.km))+' km':na(), L?esc(L.text):na(), cur&&fin(s.tmaxC)?esc(f1(s.tmaxC))+' °C':(cur?na():dash), cur&&fin(s.tminC)?esc(f1(s.tminC))+' °C':(cur?na():dash), fin(s.days)?esc(String(s.days)):na()]; }),[1,3,4,5])+(SN.length>12?'<p class="small">'+(SN.length-12)+' more stations within 25 km are not listed.</p>':'');
    else h+=K.na('No AGN weather station within 25 km has readings for these days.');
    if((j.notes||[]).length) h+='<p class="small">'+j.notes.map(esc).join(' ')+'</p>';
    return h; }
  function eventsHtml(X,S){ var K=RK(), ev=S.events; if(!ev||!S.days) return '';
    var rows=Object.keys(ev).filter(function(k){ return ev[k]&&typeof ev[k]==='object'&&fin(ev[k].p)&&evName(X,k); }).map(function(k){ var x=ev[k];
      return [esc(evName(X,k)), esc(String(x.p))+' %', fin(x.climP)?esc(String(x.climP))+' %':na(), x.onset?esc(dl(x.onset)):na()]; });
    if(!rows.length) return '';
    var c=confOf(X.gate,'ev:heatSpell');
    return '<h3>Multi-day events in the next 15 days</h3><p>'+c.badge+'</p>'+K.table(['Event','Share of members','Usual share for these days','Typical start'],rows,[1,2])
      +'<p class="small">Shares of the '+(S.members||'ensemble')+' members that show the event between '+esc(dl(ev.window&&ev.window[0]||S.days[0].date))+' and '+esc(dl(ev.window&&ev.window[1]||S.days[S.days.length-1].date))+'. '+(c.entry&&c.entry.limitations&&c.entry.limitations.length?esc(cap(c.entry.limitations[0]))+'.':'')+'</p>'; }
  function driverChart(X,x,S,o){ var K=RK(), P=X.place, d=S.days; o=o||{}; if(!d) return K.na('The 15-day forecast is not available: '+S.why+'.');
    var days=d.map(function(z){ return z.date; }), base={dates:dl(days[0])+' to '+dl(days[days.length-1]), days:days, now:0, h:o.h||185, source:'NIGRAAN served 15-day ensemble forecast, run of '+K.when(Date.parse(S.at))};
    var mx=function(f){ var b=null; d.forEach(function(z){ var v=f(z); if(v!=null&&(!b||v>b.v)) b={v:v,d:z.date}; }); return b; }, mn=function(f){ var b=null; d.forEach(function(z){ var v=f(z); if(v!=null&&(!b||v<b.v)) b={v:v,d:z.date}; }); return b; };
    if(x.key==='heat'||x.key==='glof'){ var b=mx(function(z){ return q(z.tx,1); });
      return K.dayChart(Object.assign(base,{title:'Day high at '+P.name, units:'°C', lines:[{name:'Day high (median)',vals:d.map(function(z){ return q(z.tx,1); }),color:'#B7791F'}], band:{name:'10 to 90 % of members',lo:d.map(function(z){ return q(z.tx,0); }),hi:d.map(function(z){ return q(z.tx,2); }),color:'#B7791F'}, y:{label:'°C'},
        reading:b?('The day high peaks on '+dl(b.d)+' at '+f1(b.v)+' °C in the median.'):'No day high was held.'})); }
    if(x.key==='cold'){ var c=mn(function(z){ return q(z.tn,1); });
      return K.dayChart(Object.assign(base,{title:'Night low at '+P.name, units:'°C', lines:[{name:'Night low (median)',vals:d.map(function(z){ return q(z.tn,1); }),color:'#1E7A68'}], band:{name:'10 to 90 % of members',lo:d.map(function(z){ return q(z.tn,0); }),hi:d.map(function(z){ return q(z.tn,2); }),color:'#1E7A68'}, y:{label:'°C'},
        reading:c?('The coldest night is '+dl(c.d)+' at '+f1(c.v)+' °C in the median.'):'No night low was held.'})); }
    if(x.key==='wind'){ var g=mx(function(z){ return q(z.gu,1); });
      return K.dayChart(Object.assign(base,{title:'Strongest gust at '+P.name, units:'km/h', lines:[{name:'Gust (median)',vals:d.map(function(z){ return q(z.gu,1); }),color:'#6B5B8C'}], band:{name:'10 to 90 % of members',lo:d.map(function(z){ return q(z.gu,0); }),hi:d.map(function(z){ return q(z.gu,2); }),color:'#6B5B8C'}, y:{label:'km/h'},
        reading:g?('The strongest gust in the median is '+f1(g.v)+' km/h on '+dl(g.d)+'.'):'No gust was held.'})); }
    var r=mx(function(z){ return q(z.pr,2); }), tot=0; d.forEach(function(z){ tot+=q(z.pr,1)||0; });
    return K.dayChart(Object.assign(base,{title:'Daily rain at '+P.name, units:'mm', lines:[{name:'Wet case (90 % of members)',vals:d.map(function(z){ return q(z.pr,2); }),color:'#6B5B8C',dash:'6 4'}], bars:{name:'Rain (median)',vals:d.map(function(z){ return q(z.pr,1); }),units:'mm'}, y:{label:'mm'},
      reading:'The median brings '+f1(tot)+' mm in 15 days'+(r&&r.v>0?'; in the wet case the wettest day is '+dl(r.d)+' with '+f1(r.v)+' mm':'')+'.'})); }
  function findingHtml(X,x,S,EN){ var K=RK(), doc=X.doc, P=X.place, pk=x.peak, place=P.name||'this place';
    var fs=pk.i>0?(x.label+' reaches '+cw(pk)+' on '+dl(pk.date)+' at '+place+(P.tehsil?' ('+P.tehsil+' tehsil)':'')+', the highest of the '+plural(EN.days.length,'day')+' the hazard engine has issued.')
      :(x.label+' stays Normal on all '+plural(EN.days.length,'day')+' the hazard engine has issued at '+place+'.');
    var ev=['Engine level by day: '+x.row.map(function(r){ return esc(dl(r.date))+' '+(r.i!=null?sev(r.i,r.label||null):na()); }).join(' · ')+'.'];
    var dd=S.days?S.days.filter(function(z){ return z.date===pk.date; })[0]:null;
    if(dd){ if(x.key==='heat'||x.key==='glof') ev.push('Day high on '+esc(dl(pk.date))+': '+(q(dd.tx,1)!=null?esc(f1(q(dd.tx,1)))+' °C (members '+esc(f1(q(dd.tx,0)))+' to '+esc(f1(q(dd.tx,2)))+' °C)':na())+'.');
      else if(x.key==='cold') ev.push('Night low on '+esc(dl(pk.date))+': '+(q(dd.tn,1)!=null?esc(f1(q(dd.tn,1)))+' °C (members '+esc(f1(q(dd.tn,0)))+' to '+esc(f1(q(dd.tn,2)))+' °C)':na())+'.');
      else if(x.key==='wind') ev.push('Gust on '+esc(dl(pk.date))+': '+(q(dd.gu,1)!=null?esc(f1(q(dd.gu,1)))+' km/h, wet case '+esc(f1(q(dd.gu,2)))+' km/h':na())+'.');
      else if(x.key!=='drought') ev.push('Rain on '+esc(dl(pk.date))+': '+(q(dd.pr,1)!=null?esc(f1(q(dd.pr,1)))+' mm in the median, '+esc(f1(q(dd.pr,2)))+' mm in the wet case':na())+(dd.p&&fin(dd.p.pr10)?'; '+esc(String(dd.p.pr10))+' % of members bring 10 mm or more':'')+'.'); }
    var E=S.events; (EVOF[x.key]||[]).forEach(function(k){ var e=E&&E[k]; if(e&&fin(e.p)&&e.p>0&&evName(X,k)) ev.push(esc(evName(X,k))+': '+esc(String(e.p))+' % of members'+(fin(e.climP)?' (usual '+esc(String(e.climP))+' %)':'')+(e.onset?', typically from '+esc(dl(e.onset)):'')+'.'); });
    var A=doc.evidence&&doc.evidence.analytics; (A&&A.hazards||[]).filter(function(a){ return a.key===x.key; }).forEach(function(a){ (a.inputs||[]).slice(0,3).forEach(function(z){ ev.push(esc(z[0])+' now: '+esc(z[1])+'.'); }); });
    var L=(X.lv||{})[x.key]||null, sec=sector();
    var paths=pathwaysFor(doc,x.key), acts=actsFor(doc,x.key);
    var cons=paths.length?paths.map(function(a){ return esc(a.title)+(a.when?' ('+esc(a.when)+')':'')+(a.impact?': '+esc(a.impact)+'.':''); }).join('<br>'):'No pathway that affects operations is switched on by '+esc(lcName(x.key))+' in the next 15 days.';
    /* G6: the client's own action records for this hazard first (they carry owner and ready by), then the action plan for the level */
    var adv=advice(x.key,pk.i,x.row,P.unitId,sec);
    var act=acts.slice(0,2).map(function(a){ return '<b>'+esc(a.action)+'</b><br>Owner: '+esc(a.owner_role||owner(x.key,sec))+' · ready by '+esc(a.prepare_by_text||'now'); }).concat(acts.slice(0,2).some(function(a){ return String(a.action||'').trim()===String(adv.action||'').trim(); })?[]:[adviceHtml(adv)]).join('<br>');
    var CE=confEvidence(X,x,S,EN);
    var mapRd=L&&L.levels&&P.unitId&&fin(L.levels[P.unitId])&&+L.levels[P.unitId]>=0?(P.tehsil+' tehsil is at '+lvWord(+L.levels[P.unitId])+' on '+dl(pk.date)+'.'):null;
    var mapH=hazardMap({title:x.label+' level by tehsil', dates:dl(pk.date), place:P, h:X.noChart?215:null, levels:L&&L.levels, stations:X.fleet,
        source:'NIGRAAN hazard engine'+(EN.at?', run of '+K.when(Date.parse(EN.at)):'')+'; AGN stations and their status; place names from the NIGRAAN map', reading:mapRd});
    var wl=levelOfCls('Watch'), noMap=!!(X.noChart&&wl!=null&&pk.i<wl);
    if(noMap){ (X.movedMaps=X.movedMaps||[]).push({id:'map-'+x.key, title:x.label+' level by tehsil ('+dl(pk.date)+')', why:'the tehsil map of a hazard below the action level ('+lvWord(wl)+'); the level of this place\'s tehsil is in the finding', html:mapH}); if(mapRd) ev.push(esc(mapRd)); }
    var NA='<span class="muted">Not available</span>';
    return K.finding({id:'hz-'+x.key, title:x.label, lv:pk.i, when:dl(pk.date), conf:CE.c.badge, finding:esc(fs), evidence:ev.join('<br>'), map:noMap?null:mapH,
      chart:X.noChart?null:driverChart(X,x,S), consequence:cons, action:act, confText:CE.html})
      .replace(X.noChart?'<div class="pr wide"><dt class="wide">Chart</dt><dd class="wide">'+NA+'</dd></div>':'\u0000','').replace(noMap?'<div class="pr wide"><dt class="wide">Map</dt><dd class="wide">'+NA+'</dd></div>':'\u0000',''); }
  function actionsHtml(doc,o){ o=o||{}; var K=RK(), R=records(doc), out='', chk={};
    var grp=[['Now and the next 15 days',function(r){ return ['planning','watch','standing'].indexOf(r.source)<0; }],['Standing measures for this season and ground',function(r){ return r.source==='standing'; }],['Close to the line (watch list)',function(r){ return r.source==='watch'; }],['Planning notes, weeks ahead and season',function(r){ return r.source==='planning'; }]];
    grp.forEach(function(g){ var rows=R.filter(g[1]); if(!rows.length) return; rows.sort(function(a,b){ return String(a.prepare_by||'9').localeCompare(String(b.prepare_by||'9')); });
      out+='<h3>'+esc(g[0])+'</h3>'+K.table(o.full?['Ready by · hazard','Action','Owner','Trigger']:['Ready by','Hazard','Action','Owner','Trigger'],rows.map(function(r){ if(o.full&&r.verification) chk[r.verification]=1;
        var rb=r.prepare_by_text?'<b>'+esc(r.prepare_by_text)+'</b>':na(), hz=esc(nameOf(r.hazard_label||r.hazard||''))||na();
        return (o.full?[rb+'<br>'+hz]:[rb,hz]).concat([ esc(r.action||'')+(o.full&&r.asset_note?'<br><span class="small">'+esc(r.asset_note)+'</span>':''), r.owner_role?esc(r.owner_role)+(o.full&&r.owner_source?'<br><span class="small">'+esc(r.owner_source)+'</span>':''):na(), r.trigger?esc(r.trigger)+(o.full&&r.confidence?'<br><span class="small">'+esc(r.confidence)+'</span>':''):na()]); })).replace(/^<table(?! class)/,'<table class="long"'); });
    if(Object.keys(chk).length) out+='<p class="small">Afterwards: '+esc(Object.keys(chk).join(' '))+'</p>';
    var St=steps(doc); if(!o.noSteps&&St&&St.study&&St.study.length) out+='<h3>Studies to commission</h3>'+K.table(['#','Study','Why'],St.study.map(function(r,i){ return [String(i+1),'<b>'+esc(r[0])+'</b>',esc(r[1])]; }));
    if(!R.length){ var nw=St&&St.now||[]; out=(nw.length?'<h3>Now and the next 15 days</h3>'+K.table(['#','Step','Why'],nw.map(function(r,i){ return [String(i+1),'<b>'+esc(r[0])+'</b>',esc(r[1])]; })):'')+out; }
    return (out||K.na('No client action record was held; the actions of each hazard are in its finding and in the triggers below.'))+'<p class="small">Owners and wording are AGN defaults for the asset type unless the client supplied them. Actions are operational preparations, not warnings.</p>'; }
  function sourcesHtml(X,S,EN,j30){ var K=RK(), li=[];
    li.push('15-day forecast: '+(S.at?'the NIGRAAN served ensemble'+(S.members?' ('+S.members+' members)':'')+', run of '+K.when(Date.parse(S.at)):'Not available'));
    li.push('Next 72 hours: '+(X.n72?'the corrected hourly forecast at the place (the Forecast tab)':'Not available'));
    li.push('Hazard levels: '+(EN.at?'the NIGRAAN hazard engine, run of '+K.when(Date.parse(EN.at)):'Not available'));
    li.push('Past 30 days and event history: '+(j30&&j30.sources&&j30.sources.length?j30.sources.join('; '):'NIGRAAN archives'));
    li.push('Stations: the AGN MACH fleet and its daily station check');
    li.push('Climate models: CMIP6 high-resolution models at the place'+(X.cmip&&X.cmip.horizons?'':' (not available for this report)'));
    li.push('Product types and limits: the NIGRAAN model gate'+(function(){ var a=X.gate&&X.gate.asOf, d=a?new Date(Date.parse(String(a).slice(0,10)+'T12:00:00Z')):null; return d&&isFinite(d.getTime())?', model status as of '+d.getUTCDate()+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]+' '+d.getUTCFullYear():''; })());
    li.push('Boundaries and place names: the tehsil boundaries and settlements the NIGRAAN map draws');
    return '<h3>Sources</h3><ul>'+li.map(function(t){ return '<li>'+esc(t)+'</li>'; }).join('')+'</ul><p class="small">Every sentence in this report is written by fixed rules from the figures shown. It ranks and dates what needs attention; it does not replace a site survey, a design calculation or an official warning. Times are Pakistan time (PKT).</p>'; }
  function appendix(doc,more){ var R=AGN.report; if(!R||!R.render||!doc) return ''; var d=Object.assign({},doc,{pages:['pRepro','pCoverage','pEvidence','pMethod']}), out=null; try{ out=R.render(d); }catch(_){ out=null; }
    var parts=out&&out.html?restyle(out.html,{op:true}):[];
    /* v91.17.273: the sections the record's appendix holds (more) print here too; the reproducibility record once */
    var M=(more||[]).filter(function(a){ return !(a.id==='pRepro'&&parts.some(function(p){ return p.id==='pRepro'; })); });
    if(!parts.length&&!M.length) return '';
    return pb(RK().h2('A','Appendix (operator)'))+parts.map(function(p,i){ return '<h3>A.'+(i+1)+' '+esc(p.title)+'</h3>'+p.html; }).join('')+appendixPrint(M,parts.length+1); }

  /* ---------- G3 · the 2-page short edition of a place report ---------- */
  /* page 1: the head, the cards, the verdict and the levels by day; page 2 (one section that starts a new page): what to do first, the
     15-day chart and the confidence of the hazards above Normal (at most four; the full report holds the rest) */
  function briefPlace(c){ var K=c.K, S=c.S, EN=c.EN, h='';
    h+='<div class="rk-cards">'+c.cards+'</div><p class="stmt">'+esc(c.verdict)+'</p>';
    if(EN.days){ var rows=c.shown.concat(c.withPk.filter(function(x){ return c.shown.indexOf(x)<0; })).slice(0,8).map(function(x){ return ['<b>'+esc(x.label)+'</b>'].concat(x.row.map(function(cc){ return cc.i==null&&x.peak&&x.key==='rain_hz'?gapCell(x,cc):(cc.i!=null?sev(cc.i,cc.label||null):na()); })); });
      h+=K.h2('','Hazard levels by day')+K.table(['Hazard'].concat(EN.days.map(function(d){ return esc(dl(d.date)); })),rows)+gapNote({hz:c.shown.concat(c.withPk.filter(function(x){ return c.shown.indexOf(x)<0; })).slice(0,8).filter(function(x){ return x.key==='rain_hz'; })}); }
    else h+=K.na('The hazard levels by day are not available: '+EN.why+'.');
    var p2=K.h2('','What to do first')+firstActionsHtml(c.acts,true);
    if(S.days){ var x0=c.top&&c.top.peak?c.top:null; p2+=x0&&x0.key!=='heat'&&x0.key!=='glof'?driverChart(c.X,x0,S,{h:135}):n15Brief(c); }
    else p2+=K.na('The 15-day forecast is not available: '+S.why+'.');
    var keys=c.shown.map(function(x){ return x.key; }), k4=keys.slice(0,2);
    p2+=K.h2('','Confidence and limits')+K.table(['Hazard','Confidence','First known limit'],k4.map(function(k){ var cc=confOf(c.G0,k); return ['<b>'+esc(NAME[k])+'</b>',cc.badge,cc.lim.length?esc(cc.lim[0]):na()]; }))
      +'<p class="small">'+(keys.length>2?esc(plural(keys.length-2,'more hazard'))+' above Normal: in the full report. ':'')+'Screening levels, not probabilities; not an official warning. The full report adds the maps, the past days, the 2030s and 2050s and every limit.</p>';
    return h+'<section class="rk-pb">'+p2+'</section>'; }
  function n15Brief(c){ var K=c.K, S=c.S, days=S.days.map(function(d){ return d.date; });
    return K.dayChart({title:'Day high, night low and rain at '+c.place, units:'°C, mm', dates:dl(days[0])+' to '+dl(days[days.length-1]), days:days, h:135,
      lines:[{name:'Day high (median)',vals:S.days.map(function(d){ return q(d.tx,1); }),color:'#B7791F'},{name:'Night low (median)',vals:S.days.map(function(d){ return q(d.tn,1); }),color:'#1E7A68'}],
      bars:{name:'Rain (median)',vals:S.days.map(function(d){ return q(d.pr,1); }),units:'mm'}, y:{label:'°C'}, now:0,
      source:'NIGRAAN served 15-day ensemble forecast, run of '+K.when(Date.parse(S.at)), reading:c.hot?('The hottest day is '+dl(c.hot.d)+' at '+f1(c.hot.v)+' °C in the median'+(c.rainT!=null?'; '+f1(c.rainT)+' mm of rain in 15 days':'')+'.'):'No day high was held.'}); }
  function briefOut(c,rec,body){ var K=c.K; rec.report_id=rec.report_id.replace(/^(NIGRAAN-[A-Z0-9]+)-/,'$1B-'); rec.edition='short'; rec.kind=rec.kind+' (short edition)';
    var ft=K.foot({id:rec.report_id, when:c.now, run:c.run, extra:'short edition'}), bd=/<\/section>$/.test(body)?body.replace(/<\/section>$/,ft+'</section>'):body+ft;   /* the foot closes page 2 */
    var h='<div class="rk rk-brief">'+K.briefHead({kind:c.kind, title:c.title||c.place, subtitle:c.P&&c.P.adm||c.sub||'', when:c.now, run:c.run, id:rec.report_id, logo:logo()})+(c.X.mark||'')+bd+'</div>';
    return {html:glofFirst(h), record:rec, verdict:c.verdict, title:c.kind+' (short) · '+(c.title||c.place), place:c.place, pending30:false, brief:true}; }

  /* ---------- the other place reports (site, executive, 72 hours, methodology): the same engine levels, findings and sections, then the
     document's existing pages that print no level (restyled by the kit) ---------- */
  var LEVELW=['normal','low','moderate','high','severe'];
  function restyle(html,o){ o=o||{}; var box=D.createElement('div'); box.innerHTML=html;
    [].slice.call(box.querySelectorAll('script,style,.rpt-section,.rpt-num,[data-evkey],section[data-page="pCover"],button,select,input')).forEach(function(e){ e.remove(); });
    [].slice.call(box.querySelectorAll('svg')).forEach(function(s){ var f=s.closest('figure')||s; f.remove(); });
    [].slice.call(box.querySelectorAll('.rp-vd')).forEach(function(e){ var i=LEVELW.indexOf(String(e.textContent||'').trim().toLowerCase()); if(i>=0){ var s=D.createElement('span'); s.innerHTML=RK().sev(i); e.replaceWith(s.firstChild); } });
    /* a table cell or bold word that is only a level word becomes the kit's level pill */
    [].slice.call(box.querySelectorAll('td,b,strong')).forEach(function(e){ if(e.children.length) return; var i=LEVELW.indexOf(String(e.textContent||'').trim().toLowerCase()); if(i>=0) e.innerHTML=RK().sev(i); });
    /* G3: a cell, bold word or heading that is only a hazard's name prints the page's one name for it */
    [].slice.call(box.querySelectorAll('td,th,b,strong,h3,h4,h5,li')).forEach(function(e){ if(e.children.length) return; var t=String(e.textContent||'').trim(), k=keyOf(t); if(k&&t.length>3&&t!==NAME[k]&&!/^(rain|cold)$/i.test(t)) e.textContent=NAME[k]; });
    [].slice.call(box.querySelectorAll('.rpt-prov,.rpt-ev')).forEach(function(e){ var s=D.createElement('span'); s.className='rk-tag g'; s.textContent=e.textContent; e.replaceWith(s); });
    [].slice.call(box.querySelectorAll('.rpt-refusal,.asmt-warning,.rp-none')).forEach(function(e){ var d=D.createElement('div'); d.className='lim'; d.innerHTML=e.innerHTML; e.replaceWith(d); });
    [].slice.call(box.querySelectorAll('.rpt-na')).forEach(function(e){ var blk=/^(DIV|P)$/.test(e.tagName), d=D.createElement(blk?'p':'span'); d.className=blk?'na':'muted'; d.innerHTML=e.innerHTML; e.replaceWith(d); });
    [].slice.call(box.querySelectorAll('.rpt-note,.rp-sign')).forEach(function(e){ e.classList.add('small'); });
    [].slice.call(box.querySelectorAll('h4,h5')).forEach(function(e){ var d=D.createElement('h3'); d.innerHTML=e.innerHTML; e.replaceWith(d); });
    [].slice.call(box.querySelectorAll('*')).forEach(function(e){ e.removeAttribute('style'); e.removeAttribute('width'); e.removeAttribute('height'); e.removeAttribute('bgcolor'); e.removeAttribute('color');
      var keep=String(e.getAttribute('class')||'').split(/\s+/).filter(function(c){ return /^(rk-|na$|lim$|muted$|small$|stmt$|panel$|g$|s[0-4]$)/.test(c); }); if(keep.length) e.setAttribute('class',keep.join(' ')); else e.removeAttribute('class'); });
    if(!o.op){ var tw=D.createTreeWalker(box,NodeFilter.SHOW_TEXT,null), n, all=[]; while((n=tw.nextNode())) all.push(n);
      all.forEach(function(t){ var v=t.nodeValue, w=v.replace(/\bPMD\b|Pakistan Meteorological Department/g,'the national meteorological service').replace(/\bFFD\b|Flood Forecasting Division/g,'the national flood forecasting service'); if(w!==v) t.nodeValue=w; });
      [].slice.call(box.querySelectorAll('p,li,tr')).forEach(function(e){ if(/\b(MAE|RMSE|Brier|POD|FAR|CSI|AUC|CRPS|skill score|mean absolute error|root-mean-square)\b/i.test(e.textContent||'')) e.remove(); }); }
    [].slice.call(box.querySelectorAll('table')).forEach(function(t){ if(t.rows.length>13||(t.textContent||'').length>1200) t.classList.add('long'); });
    return [].slice.call(box.querySelectorAll('section')).filter(function(s){ return s.getAttribute('data-page'); }).map(function(s){ var t=s.querySelector('h3'), title=t?t.textContent.trim():''; if(t) t.remove();
      var hd=s.querySelector('.rpt-head'); if(hd) hd.remove(); return {id:s.getAttribute('data-page'), title:title.replace(/^\d+\s*/,''), html:s.innerHTML}; }).filter(function(p){ return p.title&&(p.html||'').replace(/<[^>]+>/g,'').trim().length>20; }); }
  /* v91.17.273 (owner: reports too long) · the appendix kept in the record (Download record, JSON): reference and evidence sections that the
     printed report no longer repeats (not printed by default; the operator view prints them in its appendix). Each entry: id, title, why it
     is not printed, the section as HTML. */
  function appendixRec(list){ return (list||[]).filter(function(a){ return a&&a.html&&String(a.html).replace(/<[^>]+>/g,'').trim().length; }).map(function(a){ return {id:a.id, title:a.title, why:a.why, html:String(a.html)}; }); }
  function appendixPrint(A,n0){ return (A||[]).map(function(a,i){ return '<h3>A.'+(n0+i)+' '+esc(a.title)+'</h3><p class="small">'+esc(cap(a.why))+'.</p>'+a.html; }).join(''); }
  /* v91.17.273 (owner: reports too long) · a part of the engine document printed in the site report, made compact without dropping a
     value: a column header's sub-line (its basis) moves to one line under the table; the Measures table prints in three columns
     (the measure and its hazard; class, lead time and owner; why it works and what it needs first) */
  function compactPart(p){ var box=D.createElement('div'); box.innerHTML=p.html;
    [].slice.call(box.querySelectorAll('table')).forEach(function(t){ var notes=[], seen={};
      [].slice.call(t.querySelectorAll('th')).forEach(function(th){ var s=th.querySelector('span.small'); if(!s) return; var sub=String(s.textContent||'').trim(); s.remove();
        var nm=String(th.textContent||'').replace(/\s+/g,' ').trim(); if(sub&&!seen[sub]){ seen[sub]=[nm]; notes.push(sub); } else if(sub) seen[sub].push(nm); });
      if(notes.length){ var pn=D.createElement('p'); pn.className='small'; pn.textContent=notes.map(function(s){ return list(seen[s])+': '+s; }).join('; ')+'.'; t.parentNode.insertBefore(pn,t.nextSibling); } });
    if(p.id==='pSolutions'){ [].slice.call(box.querySelectorAll('table')).forEach(function(t){ var hd=[].map.call(t.querySelectorAll('thead th'),function(th){ return String(th.textContent||'').trim(); });
        var ix=function(re){ for(var i=0;i<hd.length;i++) if(re.test(hd[i])) return i; return -1; }, iM=ix(/^Measure/), iH=ix(/^Hazard/), iC=ix(/^Cost class/), iL=ix(/^Lead time/), iO=ix(/^Owner/), iW=ix(/^Why it works/), iN=ix(/^What it needs/);
        if(iM<0||iW<0||iN<0) return; var cell=function(r,i){ return i>=0&&r.cells[i]?r.cells[i].innerHTML:''; }, txt=function(r,i){ return i>=0&&r.cells[i]?String(r.cells[i].textContent||'').trim():''; };
        var rows=[].map.call(t.querySelectorAll('tbody tr'),function(r){ if(r.cells.length<hd.length) return ['<b>'+r.textContent+'</b>','','']; return [cell(r,iM)+(iH>=0?'<br><span class="small">'+cell(r,iH)+'</span>':''), ['Class '+txt(r,iC),txt(r,iL),txt(r,iO)].filter(function(v){ return v&&v!=='Class '; }).map(esc).join(' · '), cell(r,iW)+(txt(r,iN)?'<br><span class="small">Needs first: '+cell(r,iN)+'</span>':'')]; });
        var nt=D.createElement('div'); nt.innerHTML=RK().table(['Measure and hazard','Class · lead time · owner','Why it works; what it needs first'],rows); t.replaceWith(nt.firstChild); }); }
    return box.innerHTML; }
  /* G5: pSummary (the engine document's own decision summary) and pHazard (its hazard screening, scored by this page at the moment of the
     freeze) print levels from a second source; the kit summary and the findings carry the engine's levels instead, so they are left out */
  var KIND={
    situation:{label:'Situation report', code:'SIT', route:'brief'},
    site:{label:'Site climate screening', code:'SITE', route:'technical', drop:['pSummary','pHazard'], findings:true, history:true, cmip:true, compact:true},
    portfolio:{label:'Portfolio prioritisation', code:'PORT', route:'portfolio', national:true},
    executive:{label:'Executive climate risk brief', code:'EXEC', route:'brief', pages:['pActions','pSolutions','pLimits'], findings:true, cmip:true, maxFind:3},
    readiness72:{label:'72-hour operational readiness brief', code:'OPS72', route:'readiness72', pages:['pActions','pCrossings','pSolutions','pLimits'], findings:true, days:3, maxFind:3},
    assurance:{label:'Methodology and assurance pack', code:'METH', route:'assurance', drop:['pSummary'], noTodo:true}
  };
  /* v91.17.273 (owner: reports too long) · the site report prints each value once. Parts of the engine document that repeat a section
     of the report, and its evidence parts, go to the record's appendix (Download record; the operator view prints them); the limit
     pages print inside Limits and sources. */
  var TO_REC={pSituation:'repeats the Summary (the levels by day, the verdict and the forecast basis)', pEngScreen:'repeats the standing values at the site (section At the site), with the meaning of each parameter',
    pClimate:'repeats Long-term climate (CMIP6 at the place)', pActions:'the same action records as What to do, with the action ids, the evidence line and the chance column',
    pScope:'evidence: which hazards the document covers and from which source (the levels are in the Summary table)', pRepro:'evidence: the hashes and versions that reproduce this document',
    pGlof:'the glacial-lake routing answered no lake for this place'};
  var TO_LIMITS=['pVerified','pLimits','pSources'], SUBOF={pFlood:'pSiteRisk', pCrossings:'pSiteRisk', pOutlookLong:'pOutlook15'}, TODO_PARTS=['pSolutions','pNextSteps'];
  function frameBuild(X){ AIRK=false; var K=RK(), doc=X.doc, k=KIND[X.kind], P=X.place, G0=X.gate, S=series(doc,X), SR=siteRisk(doc), EN0=engine(doc,X);
    var EN=EN0; if(k.days&&EN0.days){ EN=Object.assign({},EN0,{days:EN0.days.slice(0,k.days), hz:EN0.hz.map(function(x){ var row=x.row.slice(0,k.days), held=row.filter(function(c){ return c.i!=null; });
      return {key:x.key,label:x.label,row:row,notApplicable:x.notApplicable,peak:held.length?held.reduce(function(a,b){ return b.i>a.i?b:a; }):null}; })}); }
    var out=null; try{ out=AGN.report.render(k.pages?Object.assign({},doc,{pages:k.pages}):doc); }catch(e){ out=null; }
    var parts=out&&out.html?restyle(out.html,{op:isOp()}):[];
    if(k.drop) parts=parts.filter(function(p){ return k.drop.indexOf(p.id)<0; });
    var NOTREADY=/(still loading|still being prepared|was not ready|were not ready) when this document was frozen/i, left=parts.filter(function(p){ return NOTREADY.test(p.html.replace(/<[^>]+>/g,' ')); }).map(function(p){ return p.title; });
    parts=parts.filter(function(p){ return left.indexOf(p.title)<0; });
    var moved=[], tail=[], todo=[];
    if(k.compact){ X.noChart=true;
      parts=parts.filter(function(p){ var why=TO_REC[p.id]; if(p.id==='pGlof'&&/<table/i.test(p.html)) why=null;
        if(why){ moved.push({id:p.id, title:p.title, why:why, html:p.html}); return false; }
        if(TO_LIMITS.indexOf(p.id)>=0){ tail.push(p); return false; } return true; }).map(function(p){ return Object.assign({},p,{html:compactPart(p)}); });
      var host={}; parts.forEach(function(p){ host[p.id]=p; });
      parts=parts.filter(function(p){ var to=SUBOF[p.id]; if(to&&host[to]){ host[to].subs=(host[to].subs||[]).concat([p]); return false; } if(TODO_PARTS.indexOf(p.id)>=0){ todo.push(p); return false; } return true; }); }
    var hasNext=todo.some(function(p){ return p.id==='pNextSteps'; })||parts.some(function(p){ return p.id==='pNextSteps'; });
    var subjName=P.name||doc.unit||'this place', SH=shownOf(EN), top=SH.top, shown=SH.shown, above=SH.above, N72=X.n72;
    var hot=null, rainT=null; if(S.days) S.days.forEach(function(d){ var tx=q(d.tx,1), pr=q(d.pr,1); if(tx!=null&&(!hot||tx>hot.v)) hot={v:tx,d:d.date}; if(pr!=null) rainT=(rainT||0)+pr; });
    var paths=SR&&Array.isArray(SR.active)?SR.active:null, acts=firstActions(doc,EN,shown,3,P.unitId);
    var rec=K.record({kind:k.label, run:S.at||EN.at||null, subject:{place:subjName, tehsil:P.tehsil, district:P.district, province:P.province, unit_id:P.unitId, lat:P.lat, lon:P.lon},
      inputs:{frozen_document:doc.id||null, document_hash:doc.document_hash||null, route:doc.type, forecast_run:S.at||null, levels_run:EN.at||null, gate_version:G0&&G0.version||null},
      results:{highest:top&&top.peak?{hazard:top.key,level:cw(top.peak),date:top.peak.date}:null, levels_by_day:levelsRec(EN), next72:N72?{high_c:N72.high?N72.high.c:null, low_c:N72.low?N72.low.c:null, rain_mm:N72.rain?N72.rain.mm:null}:null,
        pathways:paths?paths.length:null, actions:acts.map(function(a){ return {action:a.action, hazard:a.hazard, owner:a.owner, ready_by:a.ready}; })},
      methods:{engine_build:doc.build_version||null, gate:G0&&G0.version||null}, dates:{issued_utc:new Date().toISOString()}, limits:['screening levels, not probabilities','not an official warning']});
    rec.report_id=rec.report_id.replace(/^NIGRAAN-[A-Z0-9]+-/,'NIGRAAN-'+k.code+'-');
    var id=rec.report_id, now=K.when(), win=k.days?'the next 72 hours':'the days the hazard engine has issued';
    var verdict=subjName+': '+(top&&top.peak?(top.peak.i>=2?(top.label+' reaches '+cw(top.peak)+' on '+dl(top.peak.date)+', the highest level in '+win):'no hazard at this site in '+win):'the hazard levels were not available when this report was made')
      +(paths?'; '+(paths.length?plural(paths.length,'pathway')+' could affect operations in the next 15 days':'no pathway that affects operations switches on in the next 15 days'):'')+'.';
    rec.verdict=verdict;
    var cards=K.card(k.days?'Highest level, next 72 hours':'Highest level, next days', top&&top.peak?(top.peak.i>=2?esc(top.label)+' '+sev(top.peak.i,top.peak.label||null):'No hazard'):na(), top&&top.peak?(top.peak.i>=2?esc(dl(top.peak.date)):'nothing reaches Moderate'):esc(EN.why||'Not available'));
    cards+=K.card('Hazards (Moderate or above)', EN.days?esc(String(above.length)):na(), EN.days?'of '+SH.withPk.length+' with a level':'Not available','a');
    cards+=K.card('Next 72 hours', N72&&N72.high&&N72.low?esc(f1(N72.high.c))+' / '+esc(f1(N72.low.c))+' °C':na(), N72&&N72.high&&N72.low?'high '+esc(n72Label(N72.high.time))+', low '+esc(n72Label(N72.low.time)):'the place record days were not held');
    cards+=K.card(k.days?'Rain, next 72 hours':'Rain, next 15 days', k.days?(N72&&N72.rain&&N72.rain.mm!=null?esc(f1(N72.rain.mm))+' mm':na()):(rainT!=null?esc(f1(rainT))+' mm':na()), k.days?(N72&&N72.rain&&N72.rain.hours?'the forecast total at this place':'not in this forecast'):(rainT!=null?'median of the ensemble':esc(S.why||'Not available')),'g');
    cards+=K.card('Pathways', paths?esc(String(paths.length)):na(), paths?'could affect operations in 15 days':'Not available','p');
    cards+=K.card('First action', acts.length?esc(String(acts[0].ready).split(' (')[0]):na(), acts.length?esc(acts[0].hazard+' · '+acts[0].owner):'no level held','g');
    if(X.site&&X.site.ss&&X.site.ss.ok){ var STp=siteTop(siteHz(X.site)); if(STp&&STp.peak){ verdict+=' At the site itself: '+STp.label+' '+cw(STp.peak)+' on '+dl(STp.peak.date)+(STp.peak.carried?' (tehsil level).':'.'); rec.verdict=verdict; cards+=K.card('At the site', esc(STp.label)+' '+sev(STp.peak.i,STp.peak.label||null), esc(dl(STp.peak.date))+(STp.peak.carried?' · tehsil level':' · at the site'),'p'); } }
    var c={K:K,X:X,doc:doc,P:P,S:S,EN:EN,G0:G0,place:subjName,top:top,shown:shown,above:above,withPk:SH.withPk,hot:hot,rainT:rainT,acts:acts,paths:paths,id:id,now:now,run:S.at?K.when(Date.parse(S.at)):(EN.at?K.when(Date.parse(EN.at)):null),verdict:verdict,cards:cards,kind:k.label};
    if(X.edition==='short') return briefOut(c,rec,briefPlace(c));
    var titles=['Summary'].concat(X.site?['At the site']:[]).concat(k.findings?['Hazards']:[]).concat(parts.filter(function(p){ return p.html.replace(/<[^>]+>/g,'').replace(/\s+/g,'').length; }).map(function(p){ return p.title; })).concat(k.noTodo?[]:[k.compact?'What to do':(parts.some(function(p){ return p.id==='pActions'||p.id==='pSolutions'; })?'Triggers':'What to do')]).concat(k.history?['Event history']:[]).concat(k.cmip?['Long-term climate']:[]).concat(['Limits and sources']).concat(isOp()?['Appendix (operator)']:[]);
    var h='<div class="rk">'+K.cover({kind:k.label, title:subjName, subtitle:P.adm||'', contents:titles, logo:logo()});
    /* v91.17.272: a long contents list prints in two columns so the cover stays one page */
    if(titles.length>18) h=h.replace('<div class="contents">','<div class="contents" style="column-count:2;column-gap:18pt">');
    h+=X.mark||'';
    h+=K.h2('1','Summary')+K.issued({when:now, run:c.run, id:id});
    h+='<div class="rk-cards">'+cards+'</div><p class="stmt">'+esc(verdict)+'</p>';
    if(EN.days){ h+='<h3>'+(X.site?'Area levels by day (the tehsil, the map)':'Hazard levels by day')+'</h3>'+K.table(['Hazard'].concat(EN.days.map(function(d){ return esc(dl(d.date)); })).concat(k.compact?[]:['Confidence']),EN.hz.filter(function(x){ return x.peak||x.notApplicable; }).map(function(x){ return ['<b>'+esc(x.label)+'</b>'].concat(x.row.map(function(cc){ return gapCell(x,cc); })).concat(k.compact?[]:[confOf(G0,x.key).badge]); }))+gapNote(EN)
      +'<p class="small">The engine\'s levels for '+esc(P.tehsil?P.tehsil+' tehsil':'the tehsil of this place')+(EN.at?', run of '+esc(K.when(Date.parse(EN.at))):'')+': the levels the map shows.'+(k.compact?' The confidence of each hazard is in its finding (section 3) and in Limits and sources.':'')+'</p>'; }
    else h+=K.na('The hazard levels by day are not available: '+EN.why+'.');
    h+='<h3>First actions</h3>'+firstActionsHtml(acts);
    var keys=shown.map(function(x){ return x.key; });
    /* v91.17.273: the site report's limits print once, in Limits and sources (the box here repeated their first lines) */
    h+=k.compact?'<p class="small">Screening levels on the NIGRAAN scale, not probabilities; not an official warning (the national and provincial authorities issue warnings). The known limits of each model are in Limits and sources.</p>':limitsBox(G0,keys,'The first known limit of each model is shown here; all of them are listed in Limits and sources.');
    var n=2;
    /* v91.17.272: the site scored at its own location, the area level beside it, the site map snapshot */
    if(X.site){ h+=pb(K.h2(String(n++),'At the site'))+'<p>'+esc(subjName)+' scored at its own location ('+(+X.site.p.lat).toFixed(4)+', '+(+X.site.p.lon).toFixed(4)+') with its own forecast; the area level is the hazard engine\'s for the tehsil (the map), which the hazard sections below set out.</p>'+siteBlock(X.site,subjName,{})+(function(){ var R=AGN.placeRecord?AGN.placeRecord.rows(X.site.p.lat,X.site.p.lon):null; return R?'<h3>Place record at the site</h3>'+K.table(['Item','Value','Basis'],R.map(function(r){ return ['<b>'+esc(r[0])+'</b>',esc(r[1]),esc(r[2]||'')]; })):K.na('The place record of the site was not held when this report was made.'); })(); }   /* v91.17.283.29 · W4: the same rows as Client Risk */
    if(k.findings){ h+=(k.compact?K.h2(String(n++),'Hazards'):pb(K.h2(String(n++),'Hazards')))+(k.compact&&S.days?'<p class="small">The day-by-day forecast behind each hazard (day high, night low, rain, gust and their ranges) is in the chart at the site and in the Next 15 days table.</p>':'')+findingsHtml(Object.assign({},c,{max:k.maxFind||0})); }
    var seenP={};
    parts.forEach(function(p){ var box=D.createElement('div'); box.innerHTML=p.html;
      [].slice.call(box.querySelectorAll('p')).forEach(function(e){ var t=String(e.textContent||'').replace(/\s+/g,' ').trim(); if(t.length<40) return; if(seenP[t]) e.remove(); else seenP[t]=1; });
      var first=box.firstElementChild, head=K.h2(String(n++),p.title);
      if(!box.textContent.replace(/\s+/g,'').length){ n--; return; }
      h+='<div class="rk-keep">'+head+(first?first.outerHTML:'')+'</div>'; if(first) first.remove(); h+='<div>'+box.innerHTML+'</div>'+(p.subs||[]).map(function(q){ return '<h3>'+esc(q.title)+'</h3>'+q.html; }).join(''); });
    if(left.length) h+='<p class="small">Not in this report: '+esc(list(left))+' (not available for this place when the report was made).</p>';
    /* the document's own action pages (Recommended actions, Measures) already list the action records: then this section holds the triggers only */
    var hasAct=parts.some(function(p){ return p.id==='pActions'||p.id==='pSolutions'; });
    var trg=triggersHtml(keys,P.unitId);
    if(k.compact){ h+=K.h2(String(n++),'What to do')+actionsHtml(doc,{noSteps:hasNext, full:true})+todo.map(function(p){ return '<h3>'+esc(p.id==='pNextSteps'?'Next steps and suggestions':p.title)+'</h3>'+p.html; }).join(''); if(trg) moved.push({id:'triggers', title:'Triggers: from level to action', why:'reference: the action plan\'s ladder for each hazard above Normal, including levels this place has not reached; the actions this place needs are in What to do', html:trg}); }
    else if(!k.noTodo) h+=K.h2(String(n++),hasAct?'Triggers':'What to do')+(hasAct?'':actionsHtml(doc))+trg;
    if(k.history) h+=K.h2(String(n++),'Event history')+historyHtml(X,subjName);
    if(k.cmip) h+=K.h2(String(n++),'Long-term climate')+cmipHtml(X,subjName);
    if(k.compact) moved.push({id:'limits', title:'Confidence and limits of the hazards in this report', why:'every known limit of each model; the report prints the confidence and the first one', html:limitsTable(G0,keys)});
    h+=(k.compact?K.h2(String(n++),'Limits and sources'):pb(K.h2(String(n++),'Limits and sources')))+(k.compact?limitsFirst(G0,keys):limitsTable(G0,X.kind==='assurance'?[]:keys))+tail.map(function(p){ return '<h3>'+esc(p.title)+'</h3>'+p.html; }).join('')+howToHtml({noCmip:!k.cmip,noRecords:!k.history})+sourcesHtml(X,S,EN,X.hist&&X.hist.ok?X.hist:null);
    if(k.compact) rec.appendix=appendixRec(moved.concat(X.movedMaps||[]));
    if(isOp()) h+=appendix(doc,k.compact?rec.appendix:null);
    h+=K.foot({id:id, when:now, run:c.run})+'</div>';
    return {html:glofFirst(h), record:rec, verdict:verdict, title:k.label+' · '+subjName, place:subjName}; }

  /* ---------- G1 · the portfolio report: every screened site of the asset register, on the engine's levels of its tehsil ---------- */
  /* ---------- v91.17.272 (owner) · the site level in the reports: every site scored at its own location (AGN.siteScore, the page scoring code
     on the site's own forecast), the engine's tehsil level beside it as the area level; a site map snapshot drawn from the page's own layers
     (town cells of the urban layer, tehsil boundaries, the local place index with terrain heights; no tiles, no images) ---------- */
  var SCR={}, NEAR={}, URB={};
  function kp(p){ return (+p.lat).toFixed(4)+','+(+p.lon).toFixed(4); }
  /* v91.17.283.19 · the site's screening and the named places around it: its bundle's siteScreening and near parts (one request per place) */
  function screeningAt(p){ var k=kp(p); if(!SCR[k]) SCR[k]=G.AGN.pointState.part('siteScreening',+p.lat,+p.lon).then(function(v){ return v&&!v.unavailable?v:null; }); return SCR[k]; }
  function nearAt(p){ var k=kp(p); if(!NEAR[k]) NEAR[k]=G.AGN.pointState.part('near',+p.lat,+p.lon).then(function(v){ var P=(v&&v.places)||[]; return {places:P.filter(function(x){ return x.distanceKm==null||x.distanceKm<=7; }).slice(0,12)}; }).catch(function(){ return null; }); return NEAR[k]; }
  function snapBox(p){ var dy=0.033, dx=0.099/Math.cos(p.lat*Math.PI/180); return [p.lon-dx,p.lat-dy,p.lon+dx,p.lat+dy]; }
  function urbanAt(p){ var k=kp(p), b=snapBox(p); if(!URB[k]) URB[k]=getJ('/api/urban/cells?w='+b[0].toFixed(4)+'&s='+b[1].toFixed(4)+'&e='+b[2].toFixed(4)+'&n='+b[3].toFixed(4),20000); return URB[k]; }
  function siteGet(p){ var ss=(AGN.siteScore?AGN.siteScore.get(+p.lat,+p.lon):Promise.resolve({ok:false,why:'the site scoring is not loaded'})).catch(function(){ return {ok:false,why:'the site could not be scored'}; });
    return Promise.all([ss,outlookAt(p),screeningAt(p),nearAt(p),urbanAt(p)]).then(function(a){ var S=a[0]||{ok:false}, uid=S.uid||unitOfPt(p);
      return unitLevels(uid).then(function(L){ return {p:{lat:+p.lat,lon:+p.lon}, ss:S, ol:a[1], scr:a[2], near:a[3], urb:a[4], uid:uid, EN:engineOf(L)}; }); }); }
  /* the site's hazards: the site level by day with its peak (index), the area level (engine, the tehsil) beside it */
  /* v91.17.272 integration: heavy rain, drought and landslide are issued by tehsil; on a day the site has no level of its own, the site carries
     its tehsil's level for that day (the engine's, marked "tehsil level"); "input missing" only when the engine holds no value either */
  var TEH_ISSUED={rain_hz:1,drought:1,landslide:1};
  function scOf(p){ return p&&fin(p.score)?+p.score:-1; }
  function carry(k,x,a,S){ var row=x?x.row:[], peak=x&&x.peak||null, na=!!(x&&x.notApplicable);
    /* v91.17.272.1: the engine's own applicability: no level at the site and the engine says the hazard does not occur in the tehsil */
    if(!peak&&!na&&a&&!a.peak&&a.notApplicable) return {row:row,peak:null,na:true,naTeh:true};
    if(!TEH_ISSUED[k]||peak||na||!S||!S.ok||!a) return {row:row,peak:peak,na:na};
    var r2=(S.days||[]).map(function(d){ var c=(row||[]).filter(function(z){ return z.date===d; })[0]; if(c&&c.i!=null) return c;
      var e=(a.row||[]).filter(function(z){ return z.date===d; })[0]; return e&&e.i!=null?{date:d,day:e.day,i:e.i,score:null,carried:true}:(c||{date:d,i:null}); });
    var held=r2.filter(function(c){ return c.i!=null; }), pk=held.length?held.reduce(function(p,q){ return q.i>p.i?q:p; }):null;
    return {row:r2,peak:pk,na:false}; }
  function siteHz(SI){ var S=SI&&SI.ss, EN=SI&&SI.EN||{};
    return ORDER.map(function(k){ var x=S&&S.ok?S.hz.filter(function(h){ return h.key===k; })[0]:null, a=EN.hz?EN.hz.filter(function(h){ return h.key===k; })[0]:null, cr=carry(k,x,a,S);
      return {key:k, label:NAME[k], site:x||null, peak:cr.peak, row:cr.row, area:a&&a.peak||null, areaNA:!!(a&&a.notApplicable), siteNA:cr.na, carried:!!(cr.peak&&cr.peak.carried)||!!cr.naTeh, basis:x?x.basis:null}; }); }
  function siteTop(H){ var w=H.filter(function(h){ return h.peak; }).sort(function(a,b){ return b.peak.i-a.peak.i||scOf(b.peak)-scOf(a.peak)||String(a.peak.date).localeCompare(String(b.peak.date)); });
    if(w.length) return Object.assign({at:'site'},w[0]);
    var a=H.filter(function(h){ return h.area; }).sort(function(x,y){ return y.area.i-x.area.i||String(x.area.date).localeCompare(String(y.area.date)); });
    return a.length?Object.assign({at:'area'},a[0],{peak:null}):null; }
  function topLv(t){ return t?(t.peak?t.peak.i:(t.area?t.area.i:null)):null; }
  /* a ring thinned by distance (a vertex is kept when it lies more than tol degrees from the last one kept): the outline keeps its shape */
  function simp(r,tol){ if(r.length<8) return r; var o=[r[0]], l=r[0]; for(var i=1;i<r.length-1;i++){ var p=r[i]; if(Math.abs(p[0]-l[0])>tol||Math.abs(p[1]-l[1])>tol){ o.push(p); l=p; } } o.push(r[r.length-1]); return o.length>=4?o:r; }
  
  function elevOf(SI){ var S=SI&&SI.scr; return S&&S.point&&fin(S.point.elevM)?+S.point.elevM:null; }
  /* the site map snapshot: about 10 km × 22 km around the site */
  function siteSnap(SI,name,others,brief){ var K=RK(), p=SI.p, bb=snapBox(p), polys=[], U=SI.urb, nC=0;
    if(U&&Array.isArray(U.cells)){ var c=U.cells, e=U.extents||[], st=fin(U.stepDeg)?U.stepDeg/2:0.00125;
      for(var i=0,j=0;i+2<c.length;i+=3,j++){ var la=+c[i], lo=+c[i+1]; if(lo<bb[0]||lo>bb[2]||la<bb[1]||la>bb[3]) continue; var hh=fin(e[2*j])?+e[2*j]:st, hw=fin(e[2*j+1])?+e[2*j+1]:st;
        polys.push({rings:[[[lo-hw,la-hh],[lo+hw,la-hh],[lo+hw,la+hh],[lo-hw,la+hh]]], fill:'#D9D3C3', stroke:'#D9D3C3', width:0.4}); nC++; } }
    var T=tehsils(), own=SI.uid; T.forEach(function(t){ if(t.bb[2]<bb[0]||t.bb[0]>bb[2]||t.bb[3]<bb[1]||t.bb[1]>bb[3]) return; polys.push({rings:t.rings, fill:'none', stroke:t.uid===own?'#1F2A24':'#8C978F', width:t.uid===own?1.8:1}); });
    var N=SI.near&&Array.isArray(SI.near.places)?SI.near.places:[], seen={}, labels=[], el=[];
    N.slice().sort(function(a,b){ return (fin(b.population)?+b.population:0)-(fin(a.population)?+a.population:0)||(a.distanceKm||0)-(b.distanceKm||0); }).forEach(function(q){ var t=String(q.name||'').trim(); if(!t||seen[t.toLowerCase()]) return; seen[t.toLowerCase()]=1;
      if(fin(q.elevM)) el.push(+q.elevM); if(q.lon<bb[0]||q.lon>bb[2]||q.lat<bb[1]||q.lat>bb[3]) return; labels.push({lon:+q.lon,lat:+q.lat,text:t}); });
    labels=towns(bb).filter(function(t){ return !seen[String(t.text).toLowerCase()]; }).concat(labels).slice(0,40);
    var pts=[], lg=[];
    (others||[]).forEach(function(o){ if(o.lon<bb[0]||o.lon>bb[2]||o.lat<bb[1]||o.lat>bb[3]) return; pts.push({lon:o.lon,lat:o.lat,color:o.lv!=null?SEVC[o.lv]:NDC,r:6,label:o.label}); });
    pts.push({lon:p.lon,lat:p.lat,shape:'star',color:'#1F2A24',label:shortNames([name])[0],r:6});
    if(nC) lg.push(['#D9D3C3','Built-up area (town cells, about 250 m)',1]); lg.push(['#1F2A24','This site']); if(pts.length>1) lg.push(['#8C978F','Other sites of the portfolio']); lg.push(['#6E7B73','Place']);
    var e0=elevOf(SI), rd=(e0!=null?'The site stands at about '+Math.round(e0)+' m':'The site height is not held')+(el.length?'; the named places within 7 km lie between '+Math.round(Math.min.apply(null,el))+' and '+Math.round(Math.max.apply(null,el))+' m':'')
      +(nC?'; '+nC+' built-up cells are in view':'; no built-up cell is in view (open country or a village)')+'. The heavy line is the tehsil that gives the area level.';
    return K.areaMap({title:brief?'Around the site':'Around '+name+': built-up area, places and the tehsil boundary', units:'about 7 km north to south', dates:'', bbox:bb, polys:polys, points:pts, labels:labels, legend:lg,
      source:brief?'NIGRAAN map layers (section 5)':'NIGRAAN map layers: tehsil boundaries, the town cells of the urban layer, the local place index with terrain heights', reading:rd, missing:'Map not available: the layers around the site were not held.'}); }
  /* the site's hazards by day: the site level (and its 0-100 index) beside the area level of the tehsil */
  function siteTable(H,SI,brief){ var K=RK(), S=SI.ss, days=S&&S.ok?S.days:[];
    /* v91.17.273: a hazard that does not occur at the site nor in its area: one line under the table instead of a row of "Does not occur here" */
    var dno=H.filter(function(h){ return !h.peak&&h.siteNA&&(h.areaNA||!h.area); });
    /* v91.17.273: a row whose every level is carried from the tehsil says so once, in its index cell (one line per row) */
    var rows=H.filter(function(h){ return (h.peak||h.area||h.site)&&dno.indexOf(h)<0; }).map(function(h){ var held=(h.row||[]).filter(function(z){ return z&&z.i!=null; }), allC=held.length&&held.every(function(z){ return z.carried; });
      var cells=days.map(function(d){ var c=(h.row||[]).filter(function(z){ return z.date===d; })[0]; return c&&c.i!=null?sev(c.i,c.label||null)+(c.carried&&!allC?'<br><span class="small">tehsil level</span>':''):(h.siteNA?'<span class="muted">Does not occur here</span>':na('–')); });
      return ['<b>'+esc(h.label)+'</b>'].concat(cells).concat([h.area?sev(h.area.i)+' <span class="small">'+esc(dl(h.area.date))+'</span>':(h.areaNA?'<span class="muted">Does not occur here</span>':na('–'))]); });
    var nol=H.filter(function(h){ return h.site&&!h.peak&&!h.siteNA; }).map(function(h){ return h.label+' ('+String(h.site.why||'not levelled').replace(/\s*\(.*$/,'').replace(/;.*$/,'').replace(/\.$/,'').toLowerCase()+')'; });
    return K.table(['Hazard'].concat(days.map(function(d){ return esc(dl(d)); })).concat(['Area level (tehsil)']),rows)
      +(brief?'':'<p class="small">Days: the level at the site. Area level: the tehsil\'s highest, with its day.</p>')
      +(dno.length&&!brief?'<p class="small">Does not occur here'+(brief?': ':' (at the site nor in its tehsil, the hazard engine\'s own answer): ')+esc(list(dno.map(function(h){ return lcName(h.key); })))+'.</p>':'')
      +(nol.length?'<p class="small">Not levelled at the site: '+esc(nol.join('; '))+'.</p>':'')+(brief?'':'<p class="small">Site: scored at this site\'s coordinate with its own forecast (the scoring code of the map). Area level: the hazard engine for '+esc(S&&S.tehsil?S.tehsil+' tehsil':'the tehsil')+', the level the map shows. Heavy rain (the calibrated rain chance), drought and landslide are issued by tehsil: on a day the site has no level of its own it carries its tehsil\'s level, marked tehsil level.</p>'); }
  
  function o15(ol){ if(!ol||!ol.ensemble||!Array.isArray(ol.ensemble.days)||ageH(ol.ensemble.at)>18) return null; var t=todayIso(); var d=ol.ensemble.days.filter(function(x){ return x&&x.date>=t; }).slice(0,15); return d.length?d:null; }
  function n15Site(SI,name,o){ o=o||{}; var K=RK(), d=o15(SI.ol);
    if(!d) return K.na('The 15-day forecast at this site is not available: the outlook did not answer, or its run is more than 18 hours old.');
    var hi=d.map(function(x){ return q(x.tx,1); }), lo=d.map(function(x){ return q(x.tn,1); }), pr=d.map(function(x){ return q(x.pr,1); });
    var mx=hi.filter(fin).length?Math.max.apply(null,hi.filter(fin)):null, mn=lo.filter(fin).length?Math.min.apply(null,lo.filter(fin)):null, rt=pr.filter(fin).reduce(function(a,b){ return a+b; },0), wi=pr.indexOf(Math.max.apply(null,pr.filter(fin).concat([0])));
    return K.dayChart({title:o.brief?'The next 15 days at the site':'The next 15 days at '+name, units:'°C, mm', dates:dl(d[0].date)+' to '+dl(d[d.length-1].date), days:d.map(function(x){ return x.date; }), now:0, h:o.h||undefined,
      lines:[{name:'Day high (median)',vals:hi,color:'#B7791F'},{name:'Night low (median)',vals:lo,color:'#1E7A68'}], band:{name:'Day high, 10-90 % of members',lo:d.map(function(x){ return q(x.tx,0); }),hi:d.map(function(x){ return q(x.tx,2); }),color:'#B7791F'},
      bars:{name:'Rain (median)',vals:pr,units:'mm'}, y:{label:'°C'}, source:o.brief?'NIGRAAN 15-day ensemble at the site (51 members)':'NIGRAAN served 15-day ensemble forecast at the site (51 members)',
      reading:(mx!=null?'Highest day high '+f1(mx)+' °C, lowest night low '+f1(mn)+' °C':'Temperatures not held')+'; '+f1(rt)+' mm of rain in the 15 days (median)'+(rt>=0.5&&wi>=0?', wettest on '+dl(d[wi].date):'')+'.'}); }
  /* the standing values at the site the server already screens (flood depth at the 90 m cell, ground above the site, seismic design values) */
  function standingMiss(SI){ var R=SI&&SI.scr&&Array.isArray(SI.scr.rows)?SI.scr.rows:[]; return R.filter(function(r){ return !(typeof r.values==='string'||r.verdict); }).map(function(r){ return String(r.parameter).toLowerCase(); }); }
  function standing(SI,omitMiss,head){ var K=RK(), R=SI.scr&&Array.isArray(SI.scr.rows)?SI.scr.rows:[], held=[], miss=[];
    R.forEach(function(r){ var v=typeof r.values==='string'?r.values:null, lv=r.verdict||null; if(v||lv) held.push([esc(r.parameter), esc(v||r.history||''), lv?sev(lv):esc(String(r.standing||r.state||'').replace(/\s*\(.*$/,''))]); else miss.push(r.parameter); });
    return (held.length?K.table([head?'Standing values at the site':'At the site','Value · level or standing'],held.map(function(r){ return [r[0], r[1]+(r[2]?' · '+r[2]:'')]; })):K.na('No standing value is held for this site.'))+(miss.length&&!omitMiss?'<p class="small">Not held for this site yet: '+esc(list(miss.map(function(x){ return String(x).toLowerCase(); })))+'.</p>':''); }
  /* the section a site report and each portfolio site page print. v91.17.273 (owner: reports too long): three cards (the top hazard at
     the site, the area level, the height and coordinates); the count of hazards above Normal and the 15-day high and rain total, which
     the cards repeated, are read from the table and the chart reading under them; the screening-index chart repeated the index
     column of the table and is gone. o.head (the portfolio's site heading) is kept on one page with the cards and the map. o.brief: the
     note on how a site is scored prints once, in the portfolio's Limits and sources. */
  function siteBlock(SI,name,o){ o=o||{}; var K=RK(), H=siteHz(SI), t=siteTop(H), S=SI.ss, e0=elevOf(SI);
    var cards=K.card('Top hazard at the site', t&&t.peak?esc(t.label)+' '+sev(t.peak.i,t.peak.label||null):(S&&S.ok?sev(0):na(S&&S.why||'not scored')), t&&t.peak?esc(dl(t.peak.date))+(t.peak.carried?' · tehsil level':' · at the site'):(S&&S.ok?'every hazard Normal at the site':''));
    cards+=K.card('Area level (tehsil)', t&&t.area?sev(t.area.i):na('–'), esc((S&&S.tehsil?S.tehsil+' tehsil':'the tehsil')+' (the map)'),'a');
    cards+=K.card('Height', e0!=null?esc(String(Math.round(e0)))+' m':na('–'), esc((+SI.p.lat).toFixed(4)+', '+(+SI.p.lon).toFixed(4)));
    var noPt=S&&S.ok&&!S.point?'<p class="small">The forecast at the site did not answer when this report was made: the site was scored on its tehsil\'s forecast, so its levels equal the tehsil\'s inputs.</p>':'';
    var tbl='<h3 class="rk-kh">Hazards at the site and in its area</h3>', body=siteTable(H,SI,o.brief).replace('<table','<table data-run="1"');
    if(o.brief){ /* the portfolio: the three cards as one line under the heading */
      var line='<p><b>Top hazard at the site:</b> '+(t&&t.peak?esc(t.label)+' '+sev(t.peak.i,t.peak.label||null)+' '+esc(dl(t.peak.date))+(t.peak.carried?' (tehsil level)':' (at the site)'):esc(S&&S.ok?'every hazard Normal at the site':'not scored ('+(S&&S.why||'no answer')+')'))
        +' · <b>height</b> '+esc(e0!=null?Math.round(e0)+' m':'not held')+' · '+esc((+SI.p.lat).toFixed(4)+', '+(+SI.p.lon).toFixed(4))+'</p>';
      return '<div class="rk-keep">'+(o.head||'')+line+noPt+tbl+'</div>'+body+siteSnap(SI,name,o.others,true)+n15Site(SI,name,{h:145, brief:true})+standing(SI,o.omitMiss,true); }
    var h='<div class="rk-keep">'+(o.head||'')+'<div class="rk-cards">'+cards+'</div></div>'+noPt+siteSnap(SI,name,o.others,false);
    h+=tbl+body+n15Site(SI,name,{h:190})+'<h3>Standing values at the site</h3>'+standing(SI,o.omitMiss);
    return h; }
  /* the portfolio overview map: every site, coloured by the level of its top hazard at the site, numbered as in the tables */
  function pfMap(EV){ var K=RK(), T=tehsils(); if(!EV.length) return K.na('No site to map.');
    var la=EV.map(function(e){ return e.s.lat; }), lo=EV.map(function(e){ return e.s.lon; }), bb=[Math.min.apply(null,lo),Math.min.apply(null,la),Math.max.apply(null,lo),Math.max.apply(null,la)];
    var pad=Math.max(.25,.12*Math.max(bb[2]-bb[0],bb[3]-bb[1])); bb=[bb[0]-pad,bb[1]-pad,bb[2]+pad,bb[3]+pad];
    var span=Math.max(bb[2]-bb[0],bb[3]-bb[1]), nv=span>4?18:span>1.5?40:120, seen={};
    var polys=T.filter(function(t){ return !(t.bb[2]<bb[0]||t.bb[0]>bb[2]||t.bb[3]<bb[1]||t.bb[1]>bb[3]); }).map(function(t){ var has=EV.some(function(e){ return e.SI&&e.SI.uid===t.uid; });
      return {rings:t.rings.map(function(r){ return simp(r,span/(has?900:300)); }), fill:has?'#EFEBDD':'#FFFFFF', stroke:has?'#4F5D55':'#C9CFCA', width:has?1:0.5}; });
    var pts=EV.map(function(e,i){ var lv=topLv(e.top); seen[lv==null?'nd':'s'+lv]=1; return {lon:e.s.lon,lat:e.s.lat,color:lv!=null?SEVC[lv]:NDC,r:7,label:String(i+1)}; });
    var lg=[]; [0,1,2,3,4].forEach(function(i){ if(seen['s'+i]) lg.push([SEVC[i],lvWord(i)+' (top hazard at the site)']); }); if(seen.nd) lg.push([NDC,'No level']); lg.push(['#EFEBDD','Tehsil holding a site',1]); lg.push(['#6E7B73','City or town']);
    return K.areaMap({title:'The sites of the portfolio and the level of their top hazard', units:'numbered as the site pages', dates:'', bbox:bb, polys:polys, points:pts, labels:towns(bb).slice(0,span>4?14:30), legend:lg, h:span>4?270:260,
      source:'NIGRAAN: each site scored at its own location; tehsil boundaries and place names from the map layers', reading:'Each dot is a site, coloured by its highest level at the site in the next days; sites close together are told apart on the city maps and on their own pages.'}); }
  /* sites close together (within 60 km, e.g. one city) on their own map, so each can be told apart */
  function pfCityMaps(EV,num){ var K=RK(), T=tehsils(), used={}, out='';
    EV.forEach(function(e){ if(used[e.s.i]) return; var g=EV.filter(function(o){ return !used[o.s.i]&&Math.abs(o.s.lat-e.s.lat)<0.55&&Math.abs(o.s.lon-e.s.lon)<0.65; }); if(g.length<2) return; g.forEach(function(o){ used[o.s.i]=1; });
      var la=g.map(function(o){ return o.s.lat; }), lo=g.map(function(o){ return o.s.lon; }), bb=[Math.min.apply(null,lo)-.05,Math.min.apply(null,la)-.04,Math.max.apply(null,lo)+.05,Math.max.apply(null,la)+.04];
      var kx=Math.cos((bb[1]+bb[3])/2*Math.PI/180), aw=(bb[2]-bb[0])*kx, ah=bb[3]-bb[1]; if(aw/ah<2.7){ var dx=(ah*2.7/kx-(bb[2]-bb[0]))/2; bb[0]-=dx; bb[2]+=dx; } else { var dy=(aw/2.7-ah)/2; bb[1]-=dy; bb[3]+=dy; }
      var polys=[], seen={}, labels=[], nm={};
      g.forEach(function(o){ var U=o.SI.urb; if(!U||!Array.isArray(U.cells)) return; var c=U.cells, ex=U.extents||[], st=fin(U.stepDeg)?U.stepDeg/2:0.00125;
        for(var i=0,j=0;i+2<c.length;i+=3,j++){ var a=+c[i], b=+c[i+1], k=a.toFixed(4)+','+b.toFixed(4); if(seen[k]||b<bb[0]||b>bb[2]||a<bb[1]||a>bb[3]) continue; seen[k]=1; var hh=fin(ex[2*j])?+ex[2*j]:st, hw=fin(ex[2*j+1])?+ex[2*j+1]:st;
          polys.push({rings:[[[b-hw,a-hh],[b+hw,a-hh],[b+hw,a+hh],[b-hw,a+hh]]], fill:'#D9D3C3', stroke:'#D9D3C3', width:0.4}); } });
      T.forEach(function(t){ if(t.bb[2]<bb[0]||t.bb[0]>bb[2]||t.bb[3]<bb[1]||t.bb[1]>bb[3]) return; polys.push({rings:t.rings, fill:'none', stroke:'#4F5D55', width:1.2}); });
      g.forEach(function(o){ var N=o.SI.near&&o.SI.near.places||[]; N.forEach(function(q){ var t=String(q.name||'').trim(); if(!t||nm[t.toLowerCase()]||!fin(q.population)||+q.population<20000) return; nm[t.toLowerCase()]=1; labels.push({lon:+q.lon,lat:+q.lat,text:t,rank:+q.population}); }); });
      labels=towns(bb).filter(function(x){ return !nm[String(x.text).toLowerCase()]; }).concat(labels.sort(function(a,b){ return b.rank-a.rank; })).slice(0,25);
      var SN=shortNames(EV.map(function(x){ return x.s.name; })), sOf={}; EV.forEach(function(x,i){ sOf[x.s.i]=SN[i]; });
      var lvs={}, pts=g.map(function(o){ var lv=topLv(o.top); lvs[lv==null?'nd':lv]=1; return {lon:o.s.lon,lat:o.s.lat,color:lv!=null?SEVC[lv]:NDC,r:7,label:num[o.s.i]+'. '+sOf[o.s.i]}; });
      var lg=[]; [0,1,2,3,4].forEach(function(i){ if(lvs[i]) lg.push([SEVC[i],lvWord(i)]); }); lg.push(['#D9D3C3','Built-up area (about 5 km around each site)',1]); lg.push(['#4F5D55','Tehsil boundary']);
      var where=g[0].s.district||g[0].s.tehsil||'one area';
      out+=K.areaMap({title:'The '+g.length+' sites in and around '+where, units:'numbered as the site pages, coloured by the top hazard at the site', dates:'', bbox:bb, polys:polys, points:pts, labels:labels, legend:lg,
        source:'NIGRAAN map layers (section 5)', reading:out?null:'Sites a few kilometres apart can score differently: each is scored with the forecast at its own coordinate and height.'}); });
    return out; }
  function pfRows(){ var st=null; try{ st=AGN.sectionState.for('assessments').getState(); }catch(_){ st=null; } var p=(st&&Array.isArray(st.portfolio))?st.portfolio:[];
    return {all:p, ok:p.filter(function(r){ return r&&r.status!=='rejected'&&r.duplicateOf==null&&fin(r.latitude)&&fin(r.longitude); })}; }
  function pfPrepare(st){ var R=pfRows(), sites=R.ok.map(function(r,i){ var su=null; try{ su=AGN.siteUnit?AGN.siteUnit(+r.latitude,+r.longitude):null; }catch(_){ su=null; }
      return {i:i, name:String(r.name||r.asset_name||r.asset_id||('site '+(i+1))), id:r.asset_id||null, type:r.asset_type||null, lat:+r.latitude, lon:+r.longitude, unit:su&&(su.uid||su.key)||null, tehsil:su&&(su.tehsil||(su.key?String(su.key).split('|').pop():null))||null, district:su&&su.district||null, sample:String(r.origin||'')==='sample'||r.demo===true}; });
    var SI={}, done=0; if(st) st('Scoring '+plural(sites.length,'site')+' at their own locations…');
    var queue=sites.slice(), run=function(){ var s=queue.shift(); if(!s) return Promise.resolve(); return siteGet(s).then(function(x){ SI[s.i]=x; done++; if(st) st('Scored '+done+' of '+plural(sites.length,'site')+'…'); return run(); }); };
    return Promise.all([run(),run(),run()]).then(function(){ return {all:R.all, sites:sites, si:SI}; }); }
  function pfBuild(X){ AIRK=false; var K=RK(), PF=X.pf, G0=X.gate, sites=PF.sites, sec0=sector(), now=K.when();
    var EV=sites.map(function(s){ var SI=PF.si[s.i]||{p:{lat:s.lat,lon:s.lon},ss:{ok:false,why:'not scored'},EN:{why:'not read'}}, H=siteHz(SI), top=siteTop(H);
      return {s:s, SI:SI, H:H, top:top, above:H.filter(function(h){ return h.peak&&h.peak.i>=2; }), EN:SI.EN||{}}; });
    var rk=function(e){ var t=e.top; return t?[(t.peak?t.peak.i:(t.area?t.area.i:-1)), t.peak?scOf(t.peak):-1]:[-1,-1]; };
    var ranked=EV.slice().sort(function(a,b){ var x=rk(a), y=rk(b); return y[0]-x[0]||y[1]-x[1]||a.s.name.localeCompare(b.s.name); });
    ranked.forEach(function(e,i){ e.rank=i+1; });
    var num={}; EV.forEach(function(e,i){ num[e.s.i]=i+1; });
    var runAt=EV.map(function(e){ return e.EN&&e.EN.at; }).filter(Boolean).sort().pop()||null, run=runAt?K.when(Date.parse(runAt)):null;
    var up=ranked.filter(function(e){ return e.top&&e.top.peak&&e.top.peak.i>=2; }), hiSev=EV.filter(function(e){ return e.top&&e.top.peak&&e.top.peak.i>=3; }), scored=EV.filter(function(e){ return e.SI.ss&&e.SI.ss.ok; });
    var lead={}; EV.forEach(function(e){ e.above.forEach(function(x){ lead[x.key]=(lead[x.key]||0)+1; }); }); var leadK=Object.keys(lead).sort(function(a,b){ return lead[b]-lead[a]; })[0]||null;
    var acts=[]; EV.forEach(function(e){ var sec=pfSector(e.s.type)||sec0; e.above.forEach(function(x){ var a=advice(x.key,x.peak.i,x.row,e.s.unit,sec); acts.push({site:e.s.name, n:num[e.s.i], hz:x.label, lv:x.peak.i, idx:scOf(x.peak), area:x.area?x.area.i:null, date:x.peak.date, cls:a.cls, action:a.action, owner:a.owner, ready:a.readyShort||a.ready, at:a.at||'9'}); }); });
    var daily=acts.filter(function(a){ return a.cls!=='Watch'&&a.cls!=='Act'; }); acts=acts.filter(function(a){ return a.cls==='Watch'||a.cls==='Act'; });
    acts.sort(function(a,b){ return b.lv-a.lv||String(a.at).localeCompare(String(b.at))||b.idx-a.idx; });
    var rec=K.record({kind:'Portfolio prioritisation', run:runAt, subject:{portfolio:'Client portfolio', sites:sites.length, register_rows:PF.all.length},
      inputs:{levels_run:runAt, gate_version:G0&&G0.version||null, site_basis:'each site scored at its own location (page scoring code on the forecast at the site); area level from the hazard engine', sites:sites.map(function(s){ return {name:s.name, lat:s.lat, lon:s.lon, unit:s.unit}; })},
      results:{above_normal:up.length, high_or_severe:hiSev.length, sites:EV.map(function(e){ return {name:e.s.name, unit:e.s.unit, top:e.top&&e.top.peak?{hazard:e.top.key, level:cw(e.top.peak), index:e.top.peak.score, date:e.top.peak.date, area_level:e.top.area?lvWord(e.top.area.i):null, basis:e.top.peak.carried?'tehsil level':'site'}:null}; }),
        actions:acts.slice(0,20).map(function(a){ return {site:a.site, hazard:a.hz, level:lvWord(a.lv), action:a.action, owner:a.owner, ready_by:a.ready}; })},
      methods:{gate:G0&&G0.version||null}, dates:{issued_utc:new Date().toISOString()}, limits:['screening levels at each site and of the tehsil that holds it, not probabilities','not an official warning']});
    rec.report_id=rec.report_id.replace(/^NIGRAAN-[A-Z0-9]+-/,'NIGRAAN-PORT-'); var id=rec.report_id;
    var verdict='Client portfolio: '+plural(sites.length,'site')+' scored at their own locations; '+(up.length?(plural(up.length,'site')+' above Normal in the next days, led by '+up[0].s.name+' ('+up[0].top.label+' '+cw(up[0].top.peak)+' on '+dl(up[0].top.peak.date)+(up[0].top.peak.carried?', tehsil level)':(up[0].top.peak.score!=null&&isFinite(up[0].top.peak.score)?', index '+up[0].top.peak.score+' of 100)':')'))):(scored.length?'every site stays Normal in the next days':'the sites could not be scored when this report was made'))+'.';
    rec.verdict=verdict;
    var cards=K.card('Sites', esc(String(sites.length)), PF.all.length>sites.length?esc((PF.all.length-sites.length)+' register rows not placed'):'every register row placed');
    cards+=K.card('Above Normal', esc(String(up.length)), 'sites with a hazard above Normal at the site','a');
    cards+=K.card('High or Severe', esc(String(hiSev.length)), 'sites at High or Severe','p');
    cards+=K.card('Highest level', up.length?esc(num[up[0].s.i]+'. '+shortNames([up[0].s.name])[0])+' '+sev(up[0].top.peak.i):na('No hazard at any site in the period'), up.length?esc(up[0].top.label+' · '+dl(up[0].top.peak.date)):'in the next days');
    cards+=K.card('Leading hazard', leadK?esc(NAME[leadK]):na('none above Normal'), leadK?esc(plural(lead[leadK],'site'))+' above Normal':'','g');
    cards+=K.card('First action', acts.length?esc(acts[0].ready):na('none triggered'), acts.length?esc(acts[0].site+' · '+acts[0].hz+' · '+acts[0].owner):'no site at '+lvWord(levelOfCls('Watch'))+' or above','g');
    var placeOfS=function(s){ return esc([s.tehsil,s.district&&s.district!==s.tehsil?s.district:null].filter(Boolean).join(', ')||'–'); };
    var rowOf=function(e){ var t=e.top; return ['<b>'+esc(num[e.s.i]+'. '+shortOf[e.s.i])+'</b>', t&&t.peak?esc(t.label)+' '+sev(t.peak.i,t.peak.label||null):(e.SI.ss&&e.SI.ss.ok?sev(0):na('not scored')), t&&t.peak?esc(dl(t.peak.date)):'–', t&&t.area?sev(t.area.i):na('–')]; };
    var hzShown=ORDER.filter(function(k){ return EV.some(function(e){ return e.H.some(function(h){ return h.key===k&&(h.peak||h.area); }); }); });
    var SN=shortNames(EV.map(function(e){ return e.s.name; })), shortOf={}; EV.forEach(function(e,i){ shortOf[e.s.i]=SN[i]; });
    var gridCell=function(h){ if(!h) return '<span class="muted">–</span>';
      if(!h.peak&&h.siteNA&&(h.areaNA||!h.area)) return '<span class="muted">Does not occur here</span>';
      var top=h.peak?sev(h.peak.i,h.peak.label||null):(h.siteNA?'<span class="muted">Does not occur here</span>':'<span class="muted">–</span>');
      var low=h.peak&&h.peak.carried?'tehsil level':(h.area?'area '+esc(lvWord(h.area.i)):(h.areaNA?'area: does not occur':'area –'));
      return '<span class="hz-l">'+top+'</span><span class="small hz-a">'+low+'</span>'; };
    var gridT=function(keys){ return K.table(['Site'].concat(keys.map(function(k){ return esc(NAME[k]); })),ranked.map(function(e){ return ['<b>'+esc(num[e.s.i]+'. '+shortOf[e.s.i])+'</b>'].concat(keys.map(function(k){ return gridCell(e.H.filter(function(z){ return z.key===k; })[0]); })); })).replace('<table','<table class="rk-hzgrid"'); };
    var hzParts=[]; for(var hp=0;hp<hzShown.length;hp+=4) hzParts.push(hzShown.slice(hp,hp+4));
    if(hzParts.length===2&&hzParts[1].length===1&&hzParts[0].length===4){ hzParts=[hzShown.slice(0,3),hzShown.slice(3)]; }
    var matrix=hzShown.length?hzParts.map(gridT).join('')
      +'<p class="small">Each cell: the level at the site, under it the area level (the tehsil, the map). Tehsil level: carried from the tehsil, which issues heavy rain, drought and landslide. Does not occur here: the hazard engine holds no such hazard for the tehsil. Rows in rank order (top level at the site); the numbers are the maps\' and the site pages\'.</p>':K.na('No hazard level was held for any site.');
    /* charts across the sites */
    var idxChart=K.barChart({title:'Top hazard level at each site', units:'level at the site (Normal to Severe)', dates:'', labelW:250, rows:ranked.map(function(e){ var t=e.top; return {label:num[e.s.i]+'. '+e.s.name.slice(0,22), value:t&&t.peak?t.peak.i:null, color:t&&t.peak?SEVC[t.peak.i]:NDC}; }),
      fmt:function(v){ return lvWord(v); }, legend:[0,1,2,3,4].filter(function(i){ return EV.some(function(e){ return e.top&&e.top.peak&&e.top.peak.i===i; }); }).map(function(i){ return [SEVC[i],lvWord(i)]; }),
      source:'NIGRAAN scoring code at each site', reading:ranked[0]&&ranked[0].top&&ranked[0].top.peak?(num[ranked[0].s.i]+'. '+shortNames([ranked[0].s.name])[0]+' ranks first ('+ranked[0].top.label+' '+cw(ranked[0].top.peak)+(ranked[0].top.peak.carried?', tehsil level':'')+').'):'No site was scored.'});
    var dailyN=daily.length?'<p class="small">'+esc(plural(daily.length,'hazard','hazards'))+' at Moderate or Low at a site (not listed): no action is triggered; keep them on the daily check.</p>':'';
    var c={K:K,X:X,P:{adm:''},place:'Client portfolio',title:'Client portfolio',sub:plural(sites.length,'site'),now:now,run:run,verdict:verdict,kind:'Portfolio prioritisation'};
    if(X.edition==='short'){ var b='<div class="rk-cards">'+cards+'</div><p class="stmt">'+esc(verdict)+'</p>'+K.h2('','Sites, highest level first')+K.table(['Site','Top hazard at the site','When','Area level'],ranked.slice(0,7).map(rowOf))+(ranked.length>7?'<p class="small">'+(ranked.length-7)+' more sites in the full report.</p>':'')
        +'<section class="rk-pb">'+K.h2('','What to do first')+(acts.length?K.table(['Site, hazard and action','Owner','Ready by'],acts.slice(0,3).map(function(a){ return ['<b>'+esc(a.n+'. '+shortNames([a.site])[0]+' · '+a.hz)+'</b> '+sev(a.lv)+'<br>'+esc(a.action),esc(a.owner),esc(a.ready)]; })):K.na('No site has a hazard at '+lvWord(levelOfCls('Watch'))+' or above: no action is triggered.'))
        +K.h2('','The sites at a glance')+idxChart+'<p class="small">Each site scored with its own forecast; area level: the tehsil\'s (the map). Screening levels, not probabilities; not an official warning.</p></section>';
      return briefOut(c,rec,b); }
    /* v91.17.273 (owner: reports too long) · the full portfolio report (a site is a div: the page's print rule keeps every <section> whole): four sections before the sites and the sites one after another
       (about a page and a half each). Each value prints once: the ranked table is the key to the maps (the coordinates are on each
       site's page), the hazards grid carries every site and area level, the actions list (most urgent first) points to the site page
       that writes each action out. The five cross-site charts repeated the ranked table, the grid and the site pages and are gone. The
       trigger ladder (level to action for levels no site has reached) is reference, kept in the record's appendix (Download record). */
    var others=EV.map(function(e){ return {lat:e.s.lat, lon:e.s.lon, lv:topLv(e.top), label:String(num[e.s.i])}; });
    var shortN={}; EV.forEach(function(e){ shortN[num[e.s.i]]=shortOf[e.s.i]; });
    var actL=acts.length?K.table(['#','Site','Hazard: level at the site','Owner','Ready by'],acts.slice(0,3).map(function(a,i){ return [String(i+1),'<b>'+esc(a.n+'. '+(shortN[a.n]||a.site))+'</b>',esc(a.hz)+' '+sev(a.lv)+(a.area!=null?' <span class="small">area '+esc(lvWord(a.area))+'</span>':''),esc(a.owner),esc(a.ready)]; })).replace(/^<table(?! class)/,'<table class="long"')
        +'<p class="small">'+(acts.length>3?esc(plural(acts.length-3,'more action'))+' (of '+acts.length+' triggered at the sites) in section 4: each action is written out on its site\'s page, and the whole list in this order is in the record of this report. ':'Each action is written out on its site\'s page (section 4). ')+'</p>'+dailyN
      :K.na('No site has a hazard at '+lvWord(levelOfCls('Watch'))+' or above at the site in the next days: no action is triggered. Keep the sites on the daily check.')+dailyN;
    var titles=['Summary','Map of the sites','Hazards by site','The sites','Limits and sources'].concat(isOp()?['Appendix (operator)']:[]);
    var lg0=logo(), h='<div class="rk"><header class="rk-bhead"><div class="top"><div class="brand">'+(lg0?'<img class="rk-logo" src="'+esc(lg0)+'" alt="AI Geo Navigators">':'')+'<span>AI GEO NIGRAAN</span></div><div class="kind">Portfolio prioritisation</div></div>'
      +'<h1>Client portfolio</h1><p class="sub">'+esc(plural(sites.length,'site')+' scored at their own locations, in rank order'+(PF.all.length>sites.length?' ('+(PF.all.length-sites.length)+' register rows not placed)':''))+'</p><p class="small">'+esc(titles.map(function(t,i){ return (i+1)+' '+t; }).join(' · '))+'</p></header>';
    h+=X.mark||'';
    h+=K.h2('1','Summary')+K.issued({when:now, run:run, id:id})+'<div class="rk-cards">'+cards+'</div><p class="stmt">'+esc(verdict)+'</p>';
    h+='<h3>First actions, most urgent first</h3>'+actL;
    h+=K.h2('2','Map of the sites')+pfMap(EV)+pfCityMaps(EV,num);
    h+=K.h2('3','Hazards by site')+matrix;
    var MS=EV.map(function(e){ return standingMiss(e.SI).join('|'); }), missAll=MS.length&&MS[0]&&MS.every(function(m){ return m===MS[0]; })?MS[0].split('|'):null;
    ranked.forEach(function(e,i){ h+=(i===0?K.h2('4','The sites')+'<p class="small">In rank order. Each site\'s table: the level at the site by day, the highest of those days and the area level (the tehsil\'s highest, with its day); a hazard that does not occur there is in the grid above. Then the map, the next 15 days, the ground and what to do. Scoring: section 5.'+(missAll?' Not held yet for any of the sites: '+esc(list(missAll))+'.':'')+'</p>':'')
        +'<div class="rk-site">'+siteBlock(e.SI,e.s.name,{others:others.filter(function(o){ return o.label!==String(num[e.s.i]); }), brief:true,
          omitMiss:!!missAll, head:'<h3 style="font-size:16pt">4.'+(i+1)+' · '+esc(num[e.s.i]+'. '+e.s.name)+'</h3><p class="small">'+placeOfS(e.s)+(e.s.type?' · '+esc(e.s.type):'')+'</p>'});
      var my=acts.filter(function(a){ return a.site===e.s.name; }); h+=(my.length?K.table(['What to do at this site','Action','Owner','Ready by'],my.map(function(a){ return [esc(a.hz)+' '+sev(a.lv),esc(a.action),esc(a.owner),esc(a.ready)]; })):'<p class="small"><b>What to do at this site:</b> no hazard reaches '+esc(lvWord(levelOfCls('Watch')))+' here in the next days, so no action is triggered; keep it on the daily check.</p>')+'</div>'; });
    h+=K.h2('5','Limits and sources')+limitsFirst(G0,hzShown)
      +'<h3>How each site is scored</h3><p>Each site is scored at its own coordinate: NIGRAAN\'s hourly forecast at that point and height (temperature, feels-like, humidity, wind, gust, rain) is run through the same scoring code as the map, day by day, and the 0-100 index becomes a level on the NIGRAAN scale. Variables the point forecast does not carry (soil moisture, snow) are the tehsil\'s. Heavy rain is levelled from the calibrated rain chance and drought from the 30 to 90 day index, both issued by tehsil, so a site carries its tehsil\'s level for them, marked tehsil level. The index (0 to 100 on the highest day) ranks severity within one hazard and is not comparable across hazards. The area level is the hazard engine\'s level for the tehsil that holds the site, the level the map shows.</p>'
      +'<h3>Sources</h3><p class="small">'+esc(['Sites: the client asset register screened on the Client Risk tab ('+PF.all.length+' rows, '+sites.length+' placed)','levels at the site: NIGRAAN scoring code on the forecast at each site','area levels: the NIGRAAN hazard engine'+(run?', run of '+run:''),'15-day forecast: the NIGRAAN served ensemble at each site','site maps: NIGRAAN map layers (tehsil boundaries, urban town cells, place index with terrain heights)','product types and limits: the NIGRAAN model gate'+(function(){ var a=G0&&G0.asOf, d=a?new Date(Date.parse(String(a).slice(0,10)+'T12:00:00Z')):null; return d&&isFinite(d.getTime())?', model status as of '+d.getUTCDate()+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]+' '+d.getUTCFullYear():''; })(),'the level-to-action ladder of each hazard, every known limit of each model and how to use each kind of figure: in the record of this report (Download record), appendix'].join('; '))+'. Times are Pakistan time (PKT).</p>';
    var trg=triggersHtml(hzShown.filter(function(k){ return lead[k]; }),null);
    rec.results.actions_ranked=acts.map(function(a,i){ return {rank:i+1, site:a.n+'. '+a.site, hazard:a.hz, level:lvWord(a.lv), area_level:a.area!=null?lvWord(a.area):null, action:a.action, owner:a.owner, ready_by:a.ready}; });
    rec.appendix=appendixRec([{id:'limits', title:'Confidence and limits of the hazards in this report', why:'every known limit of each model; the report prints the confidence and the first one', html:limitsTable(G0,hzShown)}, {id:'howto', title:'How to use these figures', why:'general guidance, the same in every NIGRAAN report', html:howToHtml({noRecords:true,noCmip:true})}, trg?{id:'triggers', title:'Triggers: from level to action', why:'reference: the action plan\'s ladder for each hazard above Normal at a site, including levels no site has reached; the actions triggered at the sites are printed on their pages', html:trg}:null]);
    if(isOp()){ var rej=PF.all.filter(function(r){ return !(r&&r.status!=='rejected'&&r.duplicateOf==null&&fin(r.latitude)&&fin(r.longitude)); });
      h+=pb(K.h2('A','Appendix (operator)'))+'<h3>A.1 How each site was placed and scored</h3>'+K.table(['Site','Coordinates','Tehsil (engine key)','Forecast hours at the site'],EV.map(function(e){ return [esc(e.s.name),esc(e.s.lat.toFixed(4)+', '+e.s.lon.toFixed(4)),e.s.unit?esc(e.s.unit):na('no tehsil'),e.SI.ss&&e.SI.ss.ok?esc(e.SI.ss.pointHours!=null?String(e.SI.ss.pointHours):(e.SI.ss.server?'the server\u2019s site levels (place record), '+((e.SI.ss.days||[]).length||'no')+' days':'not held')):na(e.SI.ss&&e.SI.ss.why||'not scored')]; }))
        +'<h3>A.2 Register rows not placed</h3>'+(rej.length?K.table(['Row','Why'],rej.map(function(r){ return [esc(r&&(r.name||r.asset_id)||'unnamed'),esc((r&&r.gaps||[]).join('; ')||'no usable coordinates')]; })):K.na('Every register row was placed.'))
        +appendixPrint(rec.appendix,3); }
    h+=K.foot({id:id, when:now, run:run})+'</div>';
    return {html:glofFirst(h), record:rec, verdict:verdict, title:'Portfolio prioritisation · Client portfolio', place:'Client portfolio'}; }
  /* the action plan's sector of a register row (the asset type), as AGN.actions reads it */
  function pfSector(t){ var m={industrial:'industrial',hospital:'hospital',telecom:'telecom',energy:'energy',transport:'transport',bank:'bank',agriculture:'agriculture',water:'water',commercial:'commercial'}; return m[String(t||'').toLowerCase()]||null; }
  function addSitesHtml(n){ return '<div class="rk"><h1>Portfolio report</h1><h2>Add sites first</h2><p>The portfolio report is made from the sites of your asset register'+(n?': the register holds '+plural(n,'row')+', and none of them could be placed in a tehsil (see the gaps in the screening table)':', and no site has been added yet')+'.</p><p><button type="button" class="r268-rbtn" data-r270-addsites="1">Add sites</button></p><p class="small">Upload the sites as CSV or XLSX (the template is on the Client Risk tab); each site is screened at its own location and the report is made from them.</p></div>'; }
  D.addEventListener('click',function(e){ var b=e.target&&e.target.closest?e.target.closest('[data-r270-addsites]'):null; if(!b) return; e.preventDefault(); try{ RK().close(); }catch(_){}
    var up=D.querySelector('.view[data-view="assessments"] .agn-kit84 [data-kit="add-up"]'); if(up){ try{ up.scrollIntoView({block:'center'}); }catch(_){} up.click(); } });

  /* ---------- freeze, wait for what the report needs, build, open the reader ---------- */
  function freeze(kind,pt){ var k=KIND[kind], R=AGN.report; if(!R||!R.freeze) return null; var ev={}; try{ ev=AGN.reportFreeze.evidence()||{}; }catch(_){}
    var sj=null; try{ sj=AGN.subject.get(); }catch(_){}
    var u0=sj&&(sj.unit||sj.unitUnresolvedName)||null, u=u0, DI=G.DISTRICT_IN||{}, lc0=null;
    if(u&&!DI[u]&&pt&&AGN.siteUnit){ try{ var su=AGN.siteUnit(+pt.lat,+pt.lon); if(su&&su.key&&DI[su.key]){ u=su.key; sj=Object.assign({},sj,{unit:su.key}); } }catch(_){} }
    if(!k.national&&AGN.reportCtx&&AGN.reportCtx.peek){ try{ lc0=AGN.reportCtx.peek(u0)||(u!==u0?AGN.reportCtx.peek(u):null); }catch(_){ lc0=null; } }
    var ctx={type:k.route, title:k.label, unit:u, subject:sj, national:!!k.national}; if(lc0) ctx.localContext=lc0;
    return R.freeze(Object.assign(ctx, ev)); }
  /* v91.17.279 · CLAIMS279 P9 · "SAMPLE · DEMONSTRATION DATA" only for the demonstration case (issuable() demo:true); a real place whose live
     data had not all landed (no evidence yet, unit not live: outputClass DEMO "design surface") is a draft with data incomplete */
  function mark(iv){ if(!iv||iv.ok) return ''; var demo=iv.demo===true, inc=!demo&&(iv.live===false||!iv.evidence||/design surface|No live values|national sweep/i.test(String(iv.why||''))), t=demo?'SAMPLE · DEMONSTRATION DATA':inc?'DRAFT · DATA INCOMPLETE':'NOT FOR ISSUE · DRAFT';
    return '<div aria-hidden="true" style="position:fixed;top:42%;left:0;right:0;text-align:center;transform:rotate(-28deg);font:700 54pt Calibri,Carlito,Arial,sans-serif;color:rgba(160,40,30,.12);pointer-events:none;white-space:nowrap;z-index:5">'+t+'</div>'
      +'<div class="lim" style="border-left-color:#A0281E"><b>'+t+'.</b> '+esc(demo?'Printed from demonstration data: not an assessment of a real place or asset, and not saved to the reports library.':inc?('Printed before the live data for this place were complete ('+(iv.why||'reason not given')+'). It is printed for review only and is not saved to the reports library.'):('This report may not be issued in the present state ('+(iv.why||'reason not given')+'). It is printed for review only and is not saved to the reports library.'))+'</div>'; }
  var CUR=null;
  function unitOfPt(pt){ try{ var su=pt&&AGN.siteUnit?AGN.siteUnit(+pt.lat,+pt.lon):null; return su&&(su.uid||su.key)||null; }catch(_){ return null; } }
  function prepare(kind,st){ var pt=activePoint(), jobs=[], K0=KIND[kind];
    if(kind==='portfolio') return Promise.all([gate()]).then(function(a){ return {pt:pt, gate:a[0], fleet:null, evl:null}; });
    try{ if(AGN.siteRisk&&!K0.national){ AGN.siteRisk.warm(); st('Preparing the site outlook…'); jobs.push(until(function(){ var p=AGN.siteRisk.peek(); return p&&p.risk&&p.screening; },20000)); } }catch(_){}
    try{ var sj=AGN.subject.get(), u=sj&&(sj.unit||sj.unitUnresolvedName); if(u&&AGN.reportCtx&&!K0.national){ if(AGN.reportCtx.state&&AGN.reportCtx.state(u)==='none') AGN.reportCtx.warm(); jobs.push(until(function(){ return !AGN.reportCtx.state||AGN.reportCtx.state(u)!=='loading'&&AGN.reportCtx.state(u)!=='none'; },15000)); } }catch(_){}
    if(kind==='situation'&&pt&&AGN.past30){ AGN.past30.get(pt.lat,pt.lon); st('Reading the past 30 days…'); jobs.push(AGN.past30.wait?AGN.past30.wait(pt.lat,pt.lon,15000):until(function(){ var c=AGN.past30.peek(pt.lat,pt.lon); return c&&c.state!=='loading'; },15000)); }
    /* G5: the next 72 hours from the Forecast tab's hourly forecast (the same answer its cards read) */
    if(pt&&AGN.nowAt&&kind!=='assurance'){ try{ AGN.nowAt.get(pt.lat,pt.lon).catch(function(){}); }catch(_){} jobs.push(until(function(){ var v=AGN.nowAt.peek(pt.lat,pt.lon); return v&&v.hours; },15000)); }
    try{ if(pt&&AGN.glofCtx) AGN.glofCtx.warm(); }catch(_){}
    /* follow-up: the screening the report freezes holds the engine's levels (read per tehsil); wait until every row has them */
    if(!K0.national){ var lvp=function(){ var e=G.AGN_LAST_ASSESSMENT_EVIDENCE; return !!(e&&e.hazards&&e.hazards.some(function(h){ return h&&h.status==='pending'; })); };
      /* v91.17.272.1: while the levels are read the reader shows a spinner; the document is built only once they have landed */
      if(lvp()) st('Waiting for the hazard levels…');
      jobs.push(until(function(){ return !lvp(); },45000).then(function(ok){ if(!ok) throw new Error('the hazard levels for this place have not arrived yet, so no document was made from incomplete levels; press the button again in a minute'); })); }
    var withHist=kind==='situation'||kind==='site', withCmip=kind==='situation'||kind==='site'||kind==='executive';
    var uP=pt?unitOfPt(pt):null, uL=uP||(function(){ try{ var s=AGN.subject.get(); return s&&s.unit; }catch(_){ return null; } })(), g=gate(), f=fleet(), e=evLabels(), ul=unitLevels(uL), ol=outlookAt(pt), hi=withHist?history(pt):Promise.resolve(null);
    var cm=withCmip?Promise.race([cmip(pt),new Promise(function(r){ setTimeout(function(){ r({why:'the climate models did not answer within 25 seconds'}); },25000); })]):Promise.resolve(null);
    if(withCmip) st('Reading the climate models…');
    return Promise.all(jobs).then(function(){ return Promise.all([g,f,e,ul,ol,hi,cm]); }).then(function(a){ return (withHist&&pt?glofEvents(pt):Promise.resolve(null)).then(function(gl){
      return {pt:pt, gate:a[0], fleet:a[1], evl:a[2], ulv:a[3], ulvUnit:uL, outl:a[4], hist:a[5], cmip:a[6], glof:gl}; }); }); }
  function build(kind,pre,doc,edition){ var X={kind:kind, doc:doc, gate:pre.gate, fleet:pre.fleet||[], evl:pre.evl||{}, ulv:pre.ulv&&pre.ulv.days?pre.ulv:null, outl:pre.outl||null, hist:pre.hist||null, cmip:pre.cmip||null, glof:pre.glof||null, edition:edition||'full', place:placeOf(doc||{},pre.pt), n72:next72(pre.pt), site:pre.site||null}, iv=null;
    try{ iv=AGN.exports&&AGN.exports.issuable?AGN.exports.issuable():null; }catch(_){ iv=null; }
    if(kind==='portfolio'){ X.pf=pre.pf; var smp=X.pf.sites.filter(function(s){ return s.sample; }).length; if(smp&&(!iv||iv.ok)) iv={ok:false, why:'Demonstration data: '+plural(smp,'site')+' of the AJG Supplies sample', cls:{label:'demo'}};
      X.iv=iv; X.mark=mark(iv); var r0=pfBuild(X); r0.X=X; return AGN.rptCtx?AGN.rptCtx(X,r0):Promise.resolve(r0); }   /* v91.17.283.4 D14 */
    var oc=doc&&doc.outputClass; if(oc&&(oc.key==='demo'||oc.key==='scenario')&&(!iv||iv.ok)) iv={ok:false, why:String(oc.label||oc.key)+(oc.sub?'. '+String(oc.sub).replace(/\.\s*$/,''):''), cls:oc};
    X.iv=iv; X.mark=mark(iv);
    var c=pre.pt&&AGN.past30?AGN.past30.peek(pre.pt.lat,pre.pt.lon):null; X.p30=c?{state:c.state,j:c.j}:{state:'none'}; X.p30pending=kind==='situation'&&!!(c&&c.state==='loading');
    if(c&&c.state==='ok'&&c.j&&c.j.ok&&Array.isArray(c.j.stations)){ X.stn={n:c.j.stations.length, checked:c.j.stations.filter(function(s){ var L=null; try{ L=AGN.stationStatus.label(s); }catch(_){} return L?L.status==='checked':s.checked===true; }).length}; }
    /* G5: the levels are the engine's for the tehsil the report names (the report context's unit); read again when the point's tehsil differs */
    var need=X.place.unitId; return ((need&&pre.ulvUnit&&need!==pre.ulvUnit)?unitLevels(need).then(function(L){ X.ulv=L&&L.days?L:null; }):Promise.resolve()).then(function(){
    /* each hazard map needs the engine's tehsil levels on that hazard's peak day: fetched together before the report is written */
    var sh=shownOf(engine(doc,X)).shown; X.lv={};
    if(edition==='short') sh=[];
    return Promise.all(sh.map(function(x){ return levels(x.key,x.peak.day!=null?x.peak.day:0).then(function(j){ X.lv[x.key]=j; }); })).then(function(){ var o=kind==='situation'?sitBuild(X):frameBuild(X); o.X=X; return AGN.rptCtx?AGN.rptCtx(X,o):o; }); }); }   /* v91.17.283.4 D14 */
  function open(kind,btn,edition){ var K=RK(); if(!K||!KIND[kind]) return; var k=KIND[kind], tok={kind:kind, edition:edition||'full'}; CUR=tok;
    if(kind==='portfolio'){ var R0=pfRows(); if(!R0.ok.length){ tok.view=K.reader({html:addSitesHtml(R0.all.length), title:'Portfolio report', fileBase:'nigraan-portfolio', back:btn, bare:true}); return; } }
    var rd=K.reader({html:'<div class="rk"><h1>'+esc(k.label)+'</h1><p class="muted r268-prep"><span class="r268-spin" aria-hidden="true"></span><span id="r268Prep">Preparing the report from what this section holds…</span></p></div>', title:k.label, fileBase:'nigraan-'+kind, back:btn});
    var st=function(t){ try{ rd.status(t); var p=D.getElementById('r268Prep'); if(p) p.textContent=t; }catch(_){} };
    prepare(kind,st).then(function(pre){ if(CUR!==tok) return null;
      if(kind==='portfolio') return pfPrepare(st).then(function(pf){ pre.pf=pf; st('Building the report…'); tok.pre=pre; tok.doc=null; return build(kind,pre,null,tok.edition); });
      return (kind==='site'&&pre.pt?(st('Scoring the site at its own location…'),siteGet(pre.pt)):Promise.resolve(null)).then(function(si){ pre.site=si; if(CUR!==tok) return null;
      st('Building the report…'); var doc=freeze(kind,pre.pt); if(!doc) throw new Error('the report engine is not loaded');
      tok.pre=pre; tok.doc=doc; return build(kind,pre,doc,tok.edition); }); })
    .then(function(r){ if(!r||CUR!==tok) return; show(tok,r,btn); })
    .catch(function(e){ try{ console.warn('[r268] report not built', e&&e.message); }catch(_){} st('The report could not be built: '+((e&&e.message)||'unknown reason')+'.'); try{ var sp=D.querySelector('.rk-overlay .r268-spin'); if(sp) sp.remove(); }catch(_){} }); }
  /* G3: the reader switches between the full report and its 2-page short edition (each is its own document with its own id) */
  function show(tok,r,btn){ var K=RK(); tok.r=r; tok.saved=null; tok.btn=btn||tok.btn;
    var fb='NIGRAAN_'+(KIND[tok.kind].code)+(tok.edition==='short'?'-brief':'')+'_'+String(r.place||'report').replace(/[^\w-]+/g,'-').replace(/^-|-$/g,'')+'_'+r.record.report_id.slice(-17);
    var other=tok.edition==='short'?'full':'short';
    tok.view=K.reader({html:r.html, title:r.title, fileBase:fb, record:r.record, back:tok.btn, onIssue:function(){ return issue(tok); },
      extraButtons:[{label:other==='short'?'Short edition (2 pages)':'Full report', on:function(){ switchEdition(tok,other); }}]}); }
  function switchEdition(tok,ed){ if(!tok.pre||CUR!==tok) return; tok.edition=ed; tok.saved=null;
    try{ tok.view.status('Building the '+(ed==='short'?'short edition':'full report')+'…'); }catch(_){}
    build(tok.kind,tok.pre,tok.doc,ed).then(function(r){ if(CUR===tok) show(tok,r,null); }); }
  function issue(tok){ var r=tok.r, iv=r&&r.X&&r.X.iv; if(!r) return Promise.resolve(null);
    if(iv&&!iv.ok) return Promise.resolve('Not saved to the reports library: '+String(iv.why||'this report may not be issued in the present state').replace(/\.\s*$/,'')+'.');
    if(tok.saved) return Promise.resolve(tok.saved);
    var body={record:r.record, html:RK().standalone(r.html, r.title), title:r.title, place:r.place, edition:'main', verdict:r.verdict, section:(r.record&&(r.record.section||(r.record.context&&r.record.context.section)))||null};
    /* v91.17.283.31 · 8 · the report carries the place-record values it was built from ({path: value}) and the record's checksum; the server
       compares them with its own record and refuses a mismatch (409 record_mismatch, with the differing values) */
    try{ var pt=(tok.pre&&tok.pre.pt)||(AGN.data&&AGN.data.activePoint?AGN.data.activePoint():null), PS=AGN.pointState, Bb=pt&&PS&&PS.peek?PS.peek(+pt.lat,+pt.lon):null, PRv=Bb&&Bb.parts&&Bb.parts.placeRecord&&Bb.parts.placeRecord.v;
      if(PRv&&PRv.values){ body.record=Object.assign({},body.record,{shown:PRv.values, recordChecksum:PRv.checksum||null}); } }catch(_){}
    return fetch('/api/reports/issue',{method:'POST',headers:Object.assign({'content-type':'application/json'},hdr()),body:JSON.stringify(body)}).then(function(x){ return x.json().catch(function(){ return null; }).then(function(j){ return {ok:x.ok,j:j,status:x.status}; }); })
      .then(function(x){ if(x.ok&&x.j&&x.j.ok){ tok.saved='Saved to the reports library'+(x.j.dup?' (already there)':'')+'.'; LIB.dirty=true; return tok.saved; }
        if(x.status===409&&x.j&&x.j.error==='record_mismatch'){ var M=x.j.mismatches||[], ms=(Array.isArray(M)?M:Object.keys(M).map(function(k){ return Object.assign({path:k},M[k]); })).slice(0,4).map(function(m){ return (m.path||'')+(m.shown!==undefined||m.server!==undefined?' (report '+m.shown+', server '+m.server+')':''); });
          return 'Not saved: the report\u2019s numbers differ from the server\u2019s record for this place'+(ms.length?' ('+ms.join('; ')+')':'')+'. Close the report and build it again.'; }
        return 'Not saved to the reports library'+(x.j&&x.j.why?': '+x.j.why:'')+'.'; }); }
  /* the past 30 days landed after a situation report was made without them: it is made again by itself */
  D.addEventListener('agn:past30',function(){ var t=CUR; if(!t||!t.r||!t.r.pending30||t.kind!=='situation'||!t.view||!D.body.contains(t.view.el)) return;
    var c=t.pre&&t.pre.pt?AGN.past30.peek(t.pre.pt.lat,t.pre.pt.lon):null; if(!c||c.state==='loading') return;
    build('situation',t.pre,t.doc,t.edition).then(function(r){ if(CUR===t) show(t,r,null); }); });
  /* v91.17.283.28 · P11 · ONE gate for every report button: a report is built from what the screen shows, on request, and only once the
     place's hazard levels have loaded (the place bundle's levels part has settled); until then the button is disabled with the reason */
  function reportGate(kind){ if(kind==='assurance') return {ok:true}; var a=null; try{ a=AGN.data&&AGN.data.activePoint?AGN.data.activePoint():null; }catch(_){}
    if(!a||!isFinite(a.lat)||!isFinite(a.lon)) return {ok:false, why:'Pick a place first: a report is built from what the screen shows for that place.'};
    var B=null; try{ B=AGN.pointState&&AGN.pointState.peek?AGN.pointState.peek(a.lat,a.lon):null; }catch(_){}
    if(!B){ var bf=false; try{ bf=!!(AGN.pointState&&AGN.pointState.failed&&AGN.pointState.failed(a.lat,a.lon)); }catch(_){}
      if(bf) return {ok:true, failed:true};   /* the place could not be read: the report says so, as the screen does */
      return {ok:false, why:'Reading the place\u2026 the report opens once its hazard levels have loaded.'}; }
    var lv=B.parts&&B.parts.levels; if(!lv||lv.pending) return {ok:false, why:'Waiting for the place\u2019s hazard levels: the report opens once they have loaded.'};
    return {ok:true}; }
  function gateButtons(){ var g=reportGate(null);
    D.querySelectorAll('[data-r268-report]:not([data-r268-report="assurance"]), #asmtGenerateReport').forEach(function(b){ var mine=b.dataset.agnGate==='1';
      if(!g.ok){ if(!mine){ if(b.disabled) return; b.dataset.agnGate='1'; b.dataset.agnTitle=b.getAttribute('title')||''; b.disabled=true; } b.title=g.why; }
      else if(mine){ b.disabled=false; b.dataset.agnGate='0'; if(b.dataset.agnTitle) b.title=b.dataset.agnTitle; else b.removeAttribute('title'); } }); }
  AGN.reportGate=reportGate;
  ['agn:pointstate','agn:now','agn:location','agn:view','agn:engine-levels'].forEach(function(ev){ D.addEventListener(ev,function(){ setTimeout(gateButtons,50); }); });
  setInterval(gateButtons,2000); setTimeout(gateButtons,0);
  D.addEventListener('click',function(e){ var b=e.target&&e.target.closest?e.target.closest('[data-r268-report]'):null; if(!b) return; e.preventDefault();
    var k=b.getAttribute('data-r268-report'), g=reportGate(k); if(!g.ok){ gateButtons(); return; } open(k,b); });

  /* ---------- the Reports tab: the library ---------- */
  var LIB={dirty:true, rows:[]};
  function libLoad(){ var el=D.getElementById('r268List'); if(!el) return; LIB.dirty=false;
    getJ('/api/reports?edition=main&limit=100',15000).then(function(j){ if(!j||!j.ok){ el.innerHTML='<p class="r268-na">The reports library is not available right now (the server did not answer).</p>'; return; } LIB.rows=j.reports||[]; libDraw(); }); }
  function libDraw(){ var el=D.getElementById('r268List'); if(!el) return; var R=LIB.rows;
    if(!R.length){ el.innerHTML='<p class="r268-na">No report has been issued yet. Reports are made from the buttons in their sections (Forecast, Client Risk, Operations) and appear here when they are printed or downloaded.</p>'; libSel(); return; }
    el.innerHTML='<table class="r268-t"><thead><tr><th scope="col"><span class="agn-sr-only">Select for the pack</span></th><th scope="col">Report</th><th scope="col">Place</th><th scope="col">Issued</th><th scope="col">Verdict</th><th scope="col"><span class="agn-sr-only">Actions</span></th></tr></thead><tbody>'
      +R.map(function(r){ return '<tr data-id="'+esc(r.id)+'"><td><input type="checkbox" class="r268-pick" aria-label="'+esc('Add '+(r.title||r.id)+' to the pack')+'"></td><td><b>'+esc(r.title||r.kind||r.id)+'</b><div class="r268-id">'+esc(r.id)+'</div></td><td>'+esc(r.place||'Not available')+'</td><td>'+esc(r.atPkt||'')+'</td><td>'+esc(r.verdict||'Not available')+'</td>'
        +'<td class="r268-act"><button type="button" class="asmt-btn" data-r268-lib="open">Open</button><button type="button" class="asmt-btn" data-r268-lib="download">Download</button><button type="button" class="asmt-btn" data-r268-lib="archive">Archive</button></td></tr>'; }).join('')+'</tbody></table>';
    libSel(); }
  function libSel(){ var n=D.querySelectorAll('#r268List .r268-pick:checked').length, b=D.getElementById('r268Pack'), s=D.getElementById('r268PackNote');
    if(b) b.disabled=!(n>=2&&n<=12); if(s) s.textContent=n?(n+' selected'+(n<2?': choose at least 2':n>12?': a pack holds at most 12':'')):'Select 2 to 12 reports for a full pack.'; }
  /* a stored report or pack, reduced to its body: its own <style> (the kit CSS this page already holds) is cut out as text before parsing,
     because the page's CSP refuses an inline style element even in a parsed, inert document */
  function bodyOf(html){ var d=new DOMParser().parseFromString(String(html||'').replace(/<style\b[\s\S]*?<\/style\s*>/gi,'').replace(/<script\b[\s\S]*?<\/script\s*>/gi,''),'text/html'); [].slice.call(d.querySelectorAll('script,iframe,object,embed,link,meta,style')).forEach(function(e){ e.remove(); });
    [].slice.call(d.querySelectorAll('*')).forEach(function(e){ [].slice.call(e.attributes).forEach(function(a){ if(/^on/i.test(a.name)) e.removeAttribute(a.name); }); }); return d.body?d.body.innerHTML:''; }
  function libOpen(id,btn){ var r=LIB.rows.filter(function(x){ return x.id===id; })[0]; if(!r) return;
    Promise.all([fetch('/api/reports/'+encodeURIComponent(id),{cache:'no-store',headers:hdr()}).then(function(x){ return x.ok?x.text():null; }).catch(function(){ return null; }), getJ('/api/reports/'+encodeURIComponent(id)+'.json',15000)])
      .then(function(a){ if(!a[0]){ libNote('The report '+id+' could not be read from the library.'); return; } RK().reader({html:bodyOf(a[0]), title:r.title||id, fileBase:id, record:a[1]||undefined, back:btn}); }); }
  function libDownload(id){ fetch('/api/reports/'+encodeURIComponent(id),{cache:'no-store',headers:hdr()}).then(function(x){ return x.ok?x.text():null; }).then(function(t){ if(t) RK().download(id+'.html',t,'text/html'); else libNote('The report '+id+' could not be read from the library.'); }).catch(function(){ libNote('The report '+id+' could not be read from the library.'); }); }
  function libArchive(id){ fetch('/api/reports/'+encodeURIComponent(id)+'/archive',{method:'POST',headers:hdr()}).then(function(x){ return x.json().catch(function(){ return null; }); }).then(function(j){ libNote(j&&j.ok?('Archived '+id+'. It is kept on the server and no longer listed.'):('The report '+id+' was not archived.')); libLoad(); }).catch(function(){ libNote('The report '+id+' was not archived (the server did not answer).'); }); }
  function libPack(btn){ var ids=[].map.call(D.querySelectorAll('#r268List .r268-pick:checked'),function(c){ return c.closest('tr').getAttribute('data-id'); }); if(ids.length<2||ids.length>12) return;
    fetch('/api/reports/pack?ids='+ids.map(encodeURIComponent).join(','),{cache:'no-store',headers:hdr()}).then(function(x){ return x.ok?x.text():null; }).catch(function(){ return null; })
      .then(function(t){ if(!t){ libNote('The pack could not be made (the server did not answer).'); return; } RK().reader({html:bodyOf(t), title:'Report pack', fileBase:'nigraan-report-pack', back:btn}); }); }
  function libNote(t){ var s=D.getElementById('r268LibNote'); if(s) s.textContent=t; }
  D.addEventListener('click',function(e){ var b=e.target&&e.target.closest?e.target.closest('[data-r268-lib]'):null; if(b){ var tr=b.closest('tr'), id=tr&&tr.getAttribute('data-id'), a=b.getAttribute('data-r268-lib');
      if(a==='open') libOpen(id,b); else if(a==='download') libDownload(id); else if(a==='archive') libArchive(id); return; }
    if(e.target&&e.target.id==='r268Pack') libPack(e.target); else if(e.target&&e.target.id==='r268Refresh') libLoad(); });
  D.addEventListener('change',function(e){ if(e.target&&e.target.classList&&e.target.classList.contains('r268-pick')) libSel(); });
  D.addEventListener('agn:view',function(e){ if(e&&e.detail&&e.detail.view==='report') libLoad(); });
  /* v91.17.283.39 · "My reports" (header): the library list in a dialog, read when it opens */
  (function(){ var b=D.getElementById('agnMyReports'), dl=D.getElementById('agnRepDlg'), x=D.getElementById('agnRepDlgX'); if(!b||!dl) return;
    b.addEventListener('click',function(){ try{ if(dl.showModal) dl.showModal(); else dl.setAttribute('open',''); }catch(_){ dl.setAttribute('open',''); } libLoad(); try{ D.dispatchEvent(new CustomEvent('agn:reports-open')); }catch(_){} });
    if(x) x.addEventListener('click',function(){ try{ dl.close(); }catch(_){ dl.removeAttribute('open'); } });
    dl.addEventListener('click',function(e){ if(e.target===dl){ try{ dl.close(); }catch(_){} } }); })();
  D.addEventListener('agn:operator',function(){ LIB.dirty=true; });
  /* v283.36 item 9: the reports library is read when the Reports tab is opened (agn:view above), not at start */

  /* ---------- the Forecast tab's button sits in its jump bar, which that tab draws ---------- */
  function mountForecast(){ var v=D.querySelector('.view[data-view="livedata"]'), bar=v&&v.querySelector('.agn-hzbar87'); if(!bar||bar.querySelector('[data-r268-report]')) return;
    var b=D.createElement('button'); b.type='button'; b.className='r268-rbtn r268-push'; b.setAttribute('data-r268-report','situation'); b.textContent='Situation report'; bar.appendChild(b); }
  setInterval(mountForecast,2000); mountForecast();
  /* ---------- v91.17.270 (owner follow-up 1) · the engine's levels for every surface of the page: Assets (site screening, portfolio table),
     the asset Actions, the reports. One cache per tehsil (GET /api/levels/unit, the map's source), one reading rule (engineOf: the issued
     days from today, the highest level of each hazard and its day), one ready-by rule (readyBy). A read that lands fires agn:engine-levels. ---------- */
  var EVAL={};
  var RETRY=[5e3,15e3,45e3,120e3], TRIES={};   /* v91.17.283.12: a failed read of the issued levels is asked again, never held for 10 min */
  function engGet(uid){ if(!uid) return Promise.resolve(null); var k=String(uid);
    return unitLevels(k).then(function(M){ var E=engineOf(M&&M.days?M:{why:M&&M.why}); var had=EVAL[k];
      if(!E.days){ var n=TRIES[k]||0; if(n<RETRY.length){ TRIES[k]=n+1; E.why=(E.why||'the issued levels could not be read')+'; asking again in '+Math.round(RETRY[n]/1000)+' s'; setTimeout(function(){ engGet(k); },RETRY[n]); } } else TRIES[k]=0;
      EVAL[k]={at:E.days?Date.now():Date.now()-10*60e3+RETRY[Math.min(TRIES[k]||0,RETRY.length-1)], v:E};
      if(!had||had.v.at!==E.at||!!had.v.days!==!!E.days) try{ D.dispatchEvent(new CustomEvent('agn:engine-levels',{detail:{unit:k}})); }catch(_){} return E; }); }
  function engPeek(uid){ var c=uid?EVAL[String(uid)]:null; if(c&&Date.now()-c.at>10*60e3) engGet(uid); return c?c.v:null; }
  function engUnitAt(lat,lon){ try{ var su=AGN.siteUnit?AGN.siteUnit(+lat,+lon):null; return su&&(su.uid||su.key)||null; }catch(_){ return null; } }
  /* v91.17.283.24 · W1 · the ONE served hazard result of a tehsil, hazard and day (days from today in Pakistan): the issued level as the
     engine's answer reads it (GET /api/levels/unit, or the place bundle's levels part through the page store), in the shape the page's
     sections read (a categorical result); "Not assessed" with the server's reason when it issues none. Every browser section that showed a
     page-computed level for one station or place (the AI tab) reads this; national lists read the map's issued run (AGN.v283.resultFor). */
  function notAssessed(why,o){ return Object.assign({score:null, riskSignal:null, mapValue:null, served:true, level:null, noData:true, notAssessed:true, noDataWhy:why,
      noDataClass:'served', noDataClassLabel:'Not assessed', top:'Not assessed', categoryLabel:'Not assessed: '+why, why:why, drivers:[], metricLabels:[], notes:[why]}, o||{}); }
  function engResult(hz,uid,day){
    if(uid==null) return notAssessed('the place lies in no tehsil NIGRAAN issues levels for');
    var key=hz==='flood_riverine'?'flood':hz;
    if(ORDER.indexOf(key)<0) return notAssessed('the server issues no tehsil level for this hazard');
    var E=engPeek(uid); if(!E){ engGet(uid); return notAssessed('the issued level is loading', {pending:true, provisional:true}); }
    if(!E.days) return notAssessed(E.why||'the issued levels are not available');
    var H=(E.hz||[]).filter(function(x){ return x.key===key; })[0]; if(!H||!H.row||!H.row.length) return notAssessed('the server issued no level for this hazard');
    var d=Math.max(0,Math.min(Number(day)||0,H.row.length-1)), c=H.row[d];
    if(!c||c.i==null){ var w=c&&c.word?String(c.word):'';
      if(/not applicable|cannot occur/i.test(w)) return notAssessed('the hazard cannot occur here', {notApplicable:true, notApplicableWhy:'the hazard cannot occur here (the issued level)', noData:false});
      return notAssessed((w&&!/^no data$/i.test(w)?w:'no level issued')+' for '+dl(c?c.date:todayIso())); }
    return {categorical:true, served:true, level:c.i, category:c.word, screeningBand:c.word, levelLabel:c.label||null, score:null, mapValue:null, noData:false, top:c.label||c.word,
      categoryLabel:(c.label||c.word)+' \u00b7 the issued level of the tehsil for '+dl(c.date), validTime:c.date, servedDay:c.day, productType:c.pt||null, outsideTestedDomain:!!c.ood,
      forecastBasis:'issued_day', drivers:[], metricLabels:[], notes:[], at:E.at||null}; }
  /* a tehsil whose levels the page already holds (read, or the selected place's bundle in the page store): no request is made for it */
  function engOwn(uid){ if(uid==null) return false; if(EVAL[String(uid)]) return true; try{ return !!(AGN.pointState&&AGN.pointState.levelsFor&&AGN.pointState.levelsFor(String(uid))); }catch(_){ return false; } }
  /* the day (from today, Pakistan time) a lead in hours falls on */
  function dayOfLead(lead){ var h=new Date(Date.now()+5*3600e3).getUTCHours(); return Math.max(0,Math.floor((h+(Number(lead)||0))/24)); }
  AGN.engineLevels={ keys:ORDER.slice(), get:engGet, peek:engPeek, levels:unitLevels, unitAt:engUnitAt, result:engResult, own:engOwn, dayOfLead:dayOfLead, classOf:clsOf, levelOfClass:levelOfCls, readyBy:function(k,cls,row,unit){ return readyBy(k,cls,row,unit); },
    word:function(i){ return lvWord(i); }, asOf:function(E){ return E&&E.at?'levels as of '+RK().when(Date.parse(E.at)):'levels not available'; } };
  AGN.reports268={ open:open, kinds:function(){ return Object.keys(KIND); }, library:{ load:libLoad, rows:function(){ return LIB.rows.slice(); } },
    current:function(){ return CUR&&CUR.r?{kind:CUR.kind, edition:CUR.edition, record:CUR.r.record}:null; }, version:'v91.17.270' };
  /* screens that asked before this module loaded wait for this */
  try{ D.dispatchEvent(new CustomEvent('agn:engine-levels',{detail:{ready:true}})); }catch(_){}
})(window);
