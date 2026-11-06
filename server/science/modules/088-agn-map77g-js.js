


(function(){
  'use strict';
  var D=document; window.AGN=window.AGN||{};
  function esc(v){ return String(v==null?'':v).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function fmt(n,d){ return (n==null||!isFinite(n))?null:Number(n).toFixed(d==null?0:d); }

   
  var UHM=null;
  function uhiMask(){ if(UHM!==null) return; UHM=false; fetch('/api/urban/status',{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).then(function(j){ UHM=(j&&j.mask&&j.mask.legend)?j.mask.legend:null; uhiKey(true); }).catch(function(){ UHM=null; }); }
  function uhiKey(force){ var el=D.getElementById('agnUhiLegend'); if(!el) return; uhiMask(); var n=el.querySelector('.agn-uhi-mask'); if(n&&!force) return;
    var t=el.firstElementChild, sp=t&&t.querySelector('span'); var L=UHM||{};
    if(sp) sp.textContent=L.subtitle||'°C added · urban areas only';
    if(!n){ n=D.createElement('div'); n.className='agn-uhi-mask'; if(t&&t.nextSibling) el.insertBefore(n,t.nextSibling); else el.appendChild(n); }
    n.textContent=L.short||'Towns and cities only; villages and open country are left blank, not 0 °C.'; if(L.note) n.title=L.note;
    el.setAttribute('data-agn-urban-only','1'); }
  var uhiObs=null;
  function wireUhi(){ if(!window.map||!map.getContainer) return false; if(uhiObs) return true;
    uhiObs=new MutationObserver(function(){ uhiKey(); }); uhiObs.observe(map._controlContainer||map.getContainer(),{childList:true,subtree:true}); return true; }

   
  var LAB=/^\s*\d{1,2}\.\d{5}° [NS], \d{1,3}\.\d{5}° [EW]\s*$/;
  function looksLikeCoords(t){ t=String(t||'').trim(); if(!t||!/\d/.test(t)) return false;
    if(!/^[\s\dNSEWnsew°º˚'"′″’”.,;:\/\-]+$/.test(t)) return false;
    var n=t.match(/\d+(?:[.,]\d+)?/g)||[]; return n.length>=2&&/[.°'"′NSEWnsew]/.test(t); }
  function resolve(text){ return AGN.places.search(text,{limit:1}).then(function(j){ return (j&&j.parsed&&j.parsed.coordinates&&j.results&&j.results[0])?j.results[0]:null; })
    .catch(function(){ return {__error:true}; }); }
  function unitLayer(uid){ var out=null; try{ districtLayer.eachLayer(function(l){ var p=l.feature&&l.feature.properties; if(!out&&p&&p.uid===uid) out=l; }); }catch(_){} return out; }
  function rowSub(r){ if(!r) return ''; if(!r.administered) return r.disputed?'IIOJK (disputed): not scored':'outside Pakistan-administered territory';
    return [r.tehsil?r.tehsil+' tehsil':null, r.district, r.province].filter(Boolean).join(' · ')+(r.elevM!=null?' · '+r.elevM+' m':''); }
  function heightLine(r,rec){ var h=r.elevM!=null?('Height '+r.elevM+' m · '):(r.cellElevM!=null?'':'');
    var s=h+(r.elevSource||''); if(rec&&rec.echoedElev!=null&&isFinite(rec.echoedElev)) s+=' · forecast asked at '+Math.round(rec.echoedElev)+' m'; return s; }
  var PT={layer:null,pop:null,row:null,rec:null,seq:0,poll:0,label:null};
  

  function levelsOf(r){ var R=D.getElementById('mpRightIn'), h4=R&&R.querySelector(':scope > .mp-h h4'), nm=h4?(h4.getAttribute('data-unit')||h4.textContent).trim():'';
    var want=[r.tehsil,(r.unitId||'').split('|').pop()].filter(Boolean);
    if(!R||want.indexOf(nm)<0) return null;
    var rows=[].slice.call(R.querySelectorAll('.agn-mps-r')).map(function(x){ var sw=x.querySelector('.agn-mps-sw'); return { n:((x.querySelector('.n')||{}).textContent||'').replace(/fixed map$/,' (fixed map)').trim(), w:((x.querySelector('.bw')||{}).textContent||'').trim(), bg:sw?sw.style.background:'' }; });
    var na=[].slice.call(R.querySelectorAll('.agn-mps-na')).map(function(x){ return x.textContent.trim(); });
    if(!rows.length&&!na.length) return null; return {rows:rows, na:na}; }
  function levelsHtml(r){ var L0=levelsOf(r); if(!L0) return null;
    var up=L0.rows.filter(function(x){ return x.w&&x.w!=='Normal'; }), nor=L0.rows.filter(function(x){ return x.w==='Normal'; });
    return up.map(function(x){ return '<div class="lv"><span><i style="background:'+esc(x.bg||'transparent')+'"></i>'+esc(x.n)+'</span><b>'+esc(x.w)+'</b></div>'; }).join('')
      +(nor.length?'<div class="na"><b>Normal:</b> '+esc(nor.map(function(x){ return x.n.toLowerCase(); }).join(', '))+'</div>':'')
      +L0.na.map(function(t){ return '<div class="na">'+esc(t)+'</div>'; }).join(''); }
  function levelsText(r){ var L0=levelsOf(r); if(!L0) return '';
    return 'Levels in '+(r.tehsil||'the')+' tehsil: '+L0.rows.map(function(x){ return x.n+' '+x.w; }).join(', ')+(L0.na.length?'. '+L0.na.join('. '):''); }
   
  function distTxt(km){ km=+km; if(!isFinite(km)) return ''; return km<1?(Math.max(10,Math.round(km*1000/10)*10)+' m away'):(fmt(km,1)+' km'); }
  function heightTxt(dz){ dz=Math.round(+dz); if(!isFinite(dz)) return ''; return Math.abs(dz)<10?'same height':(Math.abs(dz)+' m '+(dz>0?'higher':'lower')); }
  function popHtml(){ var r=PT.row, rec=PT.rec; if(!r) return '';
    var pe=(PT.pe&&PT.pe.key===r.lat+','+r.lon&&PT.pe.v&&PT.pe.v.ok)?PT.pe.v:null;    
    var h='<div class="agn-pt-pop" data-agn-point="1"><b class="n">'+esc(PT.label||r.name)+'</b>';
    if(PT.label&&PT.label!==r.name) h+='<div class="s">'+esc(r.name)+'</div>';
    if(!r.administered){ return h+'<div class="out">'+esc(r.disputed?'In IIOJK (disputed territory).':'Outside Pakistan-administered territory.')+'</div><div class="m">'+esc(r.why||'')+'</div></div>'; }
    var dayLine='';
    h+='<div class="s">Exact point · in '+esc([r.tehsil?r.tehsil+' tehsil':null,r.district,r.province].filter(Boolean).join(', '))+'</div>';
    /* v91.17.278.1 · FIX2781 4 · the level of the hazard on the map belongs to the whole tehsil: said so plainly, with its reason */
    try{ var ul=unitLayer(r.unitId), up=ul&&ul.feature?ul.feature.properties:null, Lv=(up&&AGN.placePopup&&AGN.placePopup.level)?AGN.placePopup.level(up):null;
      if(Lv){ var uw=Lv.row&&Lv.row.word, pgw=uw, IS=null, W5L=['Normal','Low','Moderate','High','Severe']; try{ IS=AGN.v283&&AGN.v283.issued?AGN.v283.issued(up.uid):null; }catch(_){ IS=null; }
        if(IS&&IS.i!=null) uw=(IS.label||W5L[IS.i])+' (issued run)';   /* v91.17.283.8 · the popup's tehsil level is the level the map is coloured with */
        h+='<div class="h">'+esc(Lv.layer||'Hazard on the map')+'</div><div class="tl">'+(Lv.row&&Lv.row.swatch?'<i style="background:'+esc(Lv.row.swatch)+'"></i>':'')+'<span>'+(uw?'Tehsil level: <b>'+esc(uw)+'</b>'+(/^drought/i.test(String(Lv.layer||''))?' <span class="v2833-obs" title="observed: computed from the observed drought index (rain SPI / SPEI over the last 30-90 days, with the soil and vegetation readings), not a forecast">observed</span>':''):'Tehsil level: loading…')+'</span></div>'
          +(Lv.row&&Lv.row.value?'<div class="m">'+esc(Lv.row.value)+(Lv.time?' · '+esc(Lv.time):'')+'</div>':(Lv.time?'<div class="m">'+esc(Lv.time)+'</div>':''))
          +(IS&&IS.i!=null&&pgw&&String(pgw).indexOf(W5L[IS.i])!==0&&/^(Normal|Low|Moderate|High|Severe)/.test(String(pgw))?'<div class="m">This page\u2019s estimate from the latest forecast reads '+esc(String(pgw))+' (the value line above); the issued run is the level served everywhere else.</div>':''); } }catch(_){}
    var det='<div class="m">'+esc(heightLine(r,rec))+'</div>';    
     
    try{ var gg=(rec&&window.agnGridGap)?agnGridGap(Object.assign({},rec,{lat:r.lat,lon:r.lon,elev:(r.elevM!=null?r.elevM:rec.realElev)})):null; if(gg) det+='<div class="m">Forecast model cell '+fmt(gg.km,1)+' km from this point'+(gg.elevDeltaM!=null&&Math.abs(gg.elevDeltaM)>=60?', '+Math.abs(gg.elevDeltaM)+' m '+(gg.elevDeltaM>0?'higher':'lower'):'')+'</div>'; }catch(_){}
    if(pe){ var d0=pe.days&&pe.days[0]; if(d0){ dayLine='<div class="m">Today '+fmt(d0.tminC,0)+'\u2013'+fmt(d0.tmaxC,0)+' \u00b0C at this point</div>'; det+='<div class="m">Today '+fmt(d0.tminC,0)+'–'+fmt(d0.tmaxC,0)+' °C at this point · '+esc(pe.chain.map(function(c){ return c.step; }).filter(function(x){ return x!=='forecast at this point'; }).join(', ')||'forecast only')+(pe.engineOnly?(pe.support?' · live station correction not applied this hour':' · no live MACH station within 25 km'):'')+'</div>'; } }
    else if(r.lat!=null&&r.administered&&!(PT.pe&&PT.pe.key===r.lat+','+r.lon)){ var pk=r.lat+','+r.lon; PT.pe={key:pk,v:null};
      window.AGN.pointState.pf(r.lat,r.lon).then(function(j){ if(!PT.pe||PT.pe.key!==pk) return; PT.pe={key:pk,v:j}; refreshPop(); }).catch(function(){}); }   /* v91.17.283.12: the point state */
    if(PT.near&&PT.near.key===r.lat+','+r.lon){ var ns=PT.near.st; det+='<div class="m">'+(ns?'Nearest MACH station '+esc(ns.name)+((window.AGN&&AGN.stationStatus&&AGN.stationStatus.html(ns))?' '+AGN.stationStatus.html(ns):'')+' · '+distTxt(ns.km)+(ns.stationElevM!=null&&ns.pointElevM!=null?' · '+heightTxt(ns.stationElevM-ns.pointElevM):'')+(ns.ageMin!=null?' · reading '+ns.ageMin+' min old':''):(PT.near.pending?'Finding the nearest MACH station…':'No MACH station nearby'))+'</div>'; }
    else if(r.lat!=null){ var key=r.lat+','+r.lon; PT.near={key:key,st:null,pending:true};
      /* v91.17.283.19 · the pin's ONE nearest station: the bundle's (one rule, from the exact point) */
      AGN.pointState.station(r.lat,r.lon).then(function(s){ if(!PT.near||PT.near.key!==key) return; PT.near={key:key,st:s||null}; refreshPop(); }).catch(function(){}); }
    

    if(rec&&rec.ok!==false&&rec.t!=null){ var pn=pe&&pe.now||{}, pv=function(a,b){ return a!=null?a:b; };
      var w=['Now '+fmt(pv(pn.tempC,rec.t),1)+' °C'+(pn.lo90!=null?' (90 % range '+fmt(pn.lo90,1)+'–'+fmt(pn.hi90,1)+')':''), pv(pn.feelsC,rec.feels)!=null?'feels '+fmt(pv(pn.feelsC,rec.feels),0)+' °C':null, pv(pn.rh,rec.hum)!=null?'humidity '+fmt(pv(pn.rh,rec.hum),0)+' %':null, pv(pn.windKmh,rec.wind)!=null?'wind '+fmt(pv(pn.windKmh,rec.wind),0)+' km/h':null, rec.cond||null].filter(Boolean).join(' · ');
      h+='<div class="w">'+esc(w)+'</div>'; }
    else if(rec&&rec.ok===false) h+='<div class="m">No point forecast arrived: '+esc(rec.error||'the reading failed')+'.</div>';
    else if(pe&&pe.now&&pe.now.tempC!=null) h+='<div class="w">'+esc(['Now '+fmt(pe.now.tempC,1)+' °C'+(pe.now.lo90!=null?' (90 % range '+fmt(pe.now.lo90,1)+'–'+fmt(pe.now.hi90,1)+')':''), pe.now.rh!=null?'humidity '+fmt(pe.now.rh,0)+' %':null, pe.now.windKmh!=null?'wind '+fmt(pe.now.windKmh,0)+' km/h':null].filter(Boolean).join(' · '))+'</div>';    
    else if(PT.t0&&Date.now()-PT.t0>30000) h+='<div class="m">The point forecast has not arrived after 30 s (the forecast service is slow); the tehsil levels below are current.</div>';
    else h+='<div class="m">Loading the point forecast…</div>';
    h+=dayLine; var lv=levelsHtml(r);
    h+='<button type="button" class="agn-pt-fc">Detailed forecast for '+esc(PT.label||r.name)+'</button>';    /* v91.17.278.1 · FIX2781 4 */
    h+='<div class="h">Hazard levels of '+esc(r.tehsil||'the tehsil')+' tehsil</div>'+(lv||'<div class="m">Loading the levels…</div>');
    h+='<details class="more"><summary>Details: height, model cell, nearest station</summary>'+det+'</details>';
    return h+'</div>'; }
  

  function showPop(noOpen){ if(!window.map||!PT.row) return; var r=PT.row, ll=[r.lat,r.lon];
    try{ if(!PT.layer){ PT.layer=L.layerGroup().addTo(map); }
       
      if(PT.pin&&PT.layer.hasLayer(PT.pin)){ if(!PT.pin.dragging||!PT.pin.dragging.moved()) PT.pin.setLatLng(ll); pinLabel(); }
      else { PT.layer.clearLayers();
       
      var pin=PT.pin=L.marker(ll,{draggable:true,keyboard:true,zIndexOffset:2000,title:'Drag to move the exact point',icon:L.divIcon({className:'agn-pt-marker',html:'<span class="agn-pt-dot"></span><span class="agn-pt-lab"></span>',iconSize:[18,18],iconAnchor:[9,9]})}).addTo(PT.layer); pinLabel();
      pin.on('click',function(){ PT.closedSeq=-1; PT.noPop=false; showPop(); });
      pin.on('dragend',function(){ var p=pin.getLatLng(); try{ if(PT.pop) map.closePopup(PT.pop); }catch(_){} goText(p.lat.toFixed(5)+', '+p.lng.toFixed(5),{quiet:true,label:'Dropped pin'}); }); }
      if(!PT.pop){ PT.pop=L.popup({autoClose:false,closeOnClick:false,autoPan:true,autoPanPaddingTopLeft:[16,40],autoPanPaddingBottomRight:[16,24],maxWidth:320,minWidth:240,className:'agn-pt-popup',offset:[0,-12]});    
        PT.pop.on('remove',function(){ if(!PT.reopening) PT.closedSeq=PT.seq; });
      }
      PT.pop.__agnAllow=true; PT.pop.setLatLng(ll).setContent(popHtml()); keepDet();
      if(!map.hasLayer(PT.pop)&&!noOpen&&!PT.noPop&&PT.closedSeq!==PT.seq){ PT.reopening=true; PT.pop.openOn(map); PT.reopening=false; }
      PT.pop.__agnUser=true; pinOn(true);     }catch(_){} }
  /* v91.17.278.1 · FIX2781 4 · the one marker of the searched place: the exact-point pin carries the place name; the selected-place chip
     drawn at the same spot is hidden while the pin is there (one marker, not two) */
  function pinLabel(){ try{ var e=PT.pin&&PT.pin.getElement&&PT.pin.getElement(), s=e&&e.querySelector('.agn-pt-lab'); if(s) s.textContent=PT.label||(PT.row&&PT.row.level!=='coordinates'?PT.row.name:'')||''; }catch(_){} }
  function pinOn(on){ try{ var c=map.getContainer(); if(c) c.classList.toggle('agn-pt-on',!!on&&!!PT.pin&&!!PT.layer&&map.hasLayer(PT.layer)&&PT.layer.hasLayer(PT.pin)); }catch(_){} }
  function pinOff(){ try{ if(PT.pop) map.closePopup(PT.pop); }catch(_){} try{ if(PT.layer) PT.layer.clearLayers(); }catch(_){} PT.pin=null; PT.row=null; PT.seq++; clearInterval(PT.poll); pinOn(false); }
  /* a place chosen another way (a city in the list, a click on a tehsil, a report subject) moves the selection: the pin of an earlier search goes */
  D.addEventListener('agn:location',function(e){ var s=e&&e.detail&&e.detail.station; if(!PT.row||!s||s.lat==null) return;
    if(Math.abs(+s.lat-PT.row.lat)>1e-3||Math.abs(+s.lon-PT.row.lon)>1e-3) pinOff(); });
  /* the popup follows the map: a new hazard, day or layer rewrites the tehsil level line */
  ['agn:hazard','agn:layer','agn:day','agn:data','agn:engine-levels'].forEach(function(n){ D.addEventListener(n,function(){ setTimeout(refreshPop,400); }); });
  D.addEventListener('click',function(e){ var b=e.target&&e.target.closest&&e.target.closest('.agn-pt-fc'); if(!b) return; e.preventDefault();
    try{ var nb=D.querySelector('#machNav button[data-goto="livedata"]'); if(nb) nb.click(); }catch(_){} });
  function keepDet(){ try{ if(!PT.detOpen) return; var d=PT.pop&&PT.pop.getElement&&PT.pop.getElement(); d=d&&d.querySelector('details.more'); if(d) d.open=true; }catch(_){} }
  D.addEventListener('toggle',function(e){ var x=e.target; if(x&&x.matches&&x.matches('.agn-pt-pop details.more')) PT.detOpen=x.open; },true);
  function refreshPop(){ pinLabel(); try{ if(PT.pop&&map.hasLayer(PT.pop)){ PT.pop.setContent(popHtml()); keepDet(); } }catch(_){} }
  function status(el,html){ if(!el) return; try{ el.innerHTML=html; el.style.display=html?'':'none'; }catch(_){} }
  function statusText(r,rec){ if(!r.administered) return '<b>'+esc(r.name)+'</b>: '+esc(r.why||'outside Pakistan-administered territory')+'';
    var lt=levelsText(r);
    return 'Showing the exact point <b>'+esc(PT.label||r.name)+'</b> \u00b7 in '+esc([r.tehsil?r.tehsil+' tehsil':null,r.district,r.province].filter(Boolean).join(', '))+' \u00b7 '+esc(heightLine(r,rec))
      +(rec&&rec.ok===false?' \u00b7 no point forecast: '+esc(rec.error||'the reading failed'):'')+(lt?'<br>'+esc(lt):''); }
   
  function go(r, opts){ opts=opts||{}; if(!r) return Promise.resolve(null); var my=++PT.seq; PT.row=r; PT.rec=null; PT.label=opts.label||null; PT.t0=Date.now(); PT.noPop=!!opts.startup;
    if(!opts.startup){ try{ map.__agnUserView=Date.now(); }catch(_){} }
    clearInterval(PT.poll);
    if(!r.administered){ status(opts.status,statusText(r,null));
      try{ if(r.lat>20&&r.lat<40&&r.lon>55&&r.lon<85){ map.__agnRecentred=Date.now(); map.setView([r.lat,r.lon],Math.max(7,Math.min(9,map.getZoom())),{animate:false}); } showPop(); }catch(_){}
      return Promise.resolve({ok:false,outside:true,row:r}); }
    if(!opts.quiet) status(opts.status,'Loading the exact point <b>'+esc(r.name)+'</b>…'); else status(opts.status,'');    
    var lay=unitLayer(r.unitId), props=lay&&lay.feature?lay.feature.properties:null;
    

    if(!opts.startup){ try{ if(AGN.selFocus) AGN.selFocus.focus(r.lat,r.lon,{mode:'point',layer:lay||undefined,popup:false,drive:true});
      else { map.__agnRecentred=Date.now(); map.setView([r.lat,r.lon],Math.max((window.AGN&&AGN.streets&&AGN.streets.on())?15:10,map.getZoom()),{animate:false}); } }catch(_){} }
    showPop(!!opts.startup); setTimeout(function(){ if(my===PT.seq&&!PT.rec) refreshPop(); },31000);
    var elev=(r.forecastElevM!=null&&isFinite(r.forecastElevM))?Number(r.forecastElevM):undefined;
    

    if(!opts.label&&r.level==='coordinates'&&r.administered){
      AGN.pointState.place(r.lat, r.lon)   /* v91.17.283.19: the bundle's place name (the one label) */
        .then(function(pl){ var nm=pl&&pl.name?pl.name:null; if(!nm||my!==PT.seq) return;
          PT.label=nm; refreshPop(); var tries=0;
          (function rename(){ try{ var ap=window.AGN&&AGN.data&&AGN.data.activePoint&&AGN.data.activePoint();
              if(ap&&Math.abs(+ap.lat-r.lat)<1e-4&&Math.abs(+ap.lon-r.lon)<1e-4){ ap.name=nm; var cl=D.getElementById('cityLabel'); if(cl&&/°\s*[NS],/.test(cl.textContent)) cl.textContent=nm; return; } }catch(_){}
            if(my===PT.seq&&++tries<40) setTimeout(rename,750); })(); }).catch(function(){}); }
    var p=opts.noDrive?Promise.resolve(null):(typeof window.driveFromPoint==='function')?Promise.resolve(opts.place?window.driveFromPoint(r.lat,r.lon,opts.place.name,true,opts.place.elevM):window.driveFromPoint(r.lat,r.lon,PT.label||r.name,true,elev,props||undefined,lay||undefined)):Promise.resolve({ok:false,error:'the location engine is not ready'});
    return p.catch(function(e){ return {ok:false,error:(e&&e.message)||'the reading failed'}; }).then(function(rec){ if(my!==PT.seq) return rec;
      PT.rec=opts.noDrive?null:(rec||{ok:false}); status(opts.status,statusText(r,PT.rec));
      /* v91.17.278.1 · FIX2781 4 · the point's popup already open and the point in view: the outline is redrawn, the map is not moved again
         (a second centring pushed the open popup over the top edge of the map until it panned back) */
      if(!opts.startup){ try{ if(AGN.selFocus) AGN.selFocus.focus(r.lat,r.lon,{mode:'point',layer:lay||undefined,popup:false,move:!(PT.pop&&map.hasLayer(PT.pop)&&map.getBounds().contains([r.lat,r.lon]))});
        else { map.__agnRecentred=Date.now(); map.setView([r.lat,r.lon],Math.max(10,map.getZoom()),{animate:false}); } }catch(_){} }    
      showPop(!!opts.startup); if(opts.quiet) status(opts.status,'');
      var n=0; PT.poll=setInterval(function(){ if(my!==PT.seq||++n>45){ clearInterval(PT.poll); return; } refreshPop(); if(levelsHtml(r)){ refreshPop(); if(!opts.quiet) status(opts.status,statusText(r,PT.rec)); clearInterval(PT.poll); } },1000);
      return rec; }); }
  function goText(text, opts){ try{ if(window.AGNAutoLoc&&!(opts&&opts.autoLoc)) window.AGNAutoLoc.intent(); }catch(_){}   /* v91.17.283.37 · R4 */
    return resolve(text).then(function(r){ if(r&&r.__error){ status(opts&&opts.status,'The search could not reach this server; nothing was changed.'); return null; }
      if(!r){ status(opts&&opts.status,'“'+esc(text)+'” could not be read as coordinates. Examples: 33.69, 73.05 · 33°41′N 73°03′E · N33.69 E73.05'); return null; }
      return go(r, opts); }); }
   
  function locate(opts){ opts=opts||{}; var st=opts.status, btn=opts.button;
    if(btn){ btn.disabled=true; btn.setAttribute('aria-busy','true'); }
    status(st,'Asking the browser for your location…');
    return AGN.places.locate().then(function(p){
        if(p.coarse){ status(st,'The browser only knows your position to ±'+(p.accuracyM/1000).toFixed(0)+' km (a network position, not GPS), so it is not used as your location: pick your place in the list that opened at the top.'); return null; }
        return AGN.places.search(p.lat.toFixed(6)+', '+p.lon.toFixed(6),{limit:1})
          .then(function(j){ var r=j&&j.results&&j.results[0]; if(!r){ status(st,'Your position arrived but this server could not place it; nothing was changed.'); return null; }
            return go(r,{status:st,label:p.label,quiet:!!opts.quiet}); }); })
      .catch(function(e){ var m=(e&&e.message)||'the location request failed';
        status(st,/declined|denied/i.test(m)?'Location was not shared: permission was declined for this page. To use it, allow location for this site in the browser (the icon at the left of the address bar), or type a place or coordinates.'
          :('Your location could not be used: '+esc(m)+(/search your place/.test(m)?'.':'. Type a place or coordinates instead.'))); return null; })
      .then(function(x){ if(btn){ btn.disabled=false; btn.removeAttribute('aria-busy'); } return x; }); }
  /* v91.17.278.1 · FIX2781 4 · a named place from a search list: its exact point (tehsil, height) is read like a typed coordinate, the
     pin and its popup go there, and the place is driven exactly as before (its name and its own height). null: not a place to pin
     (disputed, outside, unreadable) and the caller keeps its own way. opts.noDrive: the pin and popup only (the caller set the place). */
  function searchPlace(n, opts){ opts=opts||{}; try{ if(window.AGNAutoLoc) window.AGNAutoLoc.intent(); }catch(_){}   /* v91.17.283.37 · R4 */ if(!n||!isFinite(+n.lat)||!isFinite(+n.lon)||n.disputed||n.level==='coordinates') return Promise.resolve(null);
    var lab=String(n.label||n.name||'').trim(); var area=n.district||n.province||''; if(!n.label&&area&&lab&&lab.indexOf(area)<0&&!/^Pakistan$/i.test(area)) lab+=', '+String(area).replace(/ District$/,'');
    return resolve((+n.lat).toFixed(5)+', '+(+n.lon).toFixed(5)).then(function(r){ if(!r||r.__error||!r.administered) return null;
      r=Object.assign({},r,{lat:+n.lat,lon:+n.lon,name:lab||r.name}); if(n.elevM!=null&&isFinite(n.elevM)){ r.elevM=n.elevM; r.forecastElevM=n.elevM; }
      return go(r,{label:lab||null, quiet:true, status:opts.status||null, noDrive:!!opts.noDrive, place:{name:n.name, elevM:n.elevM!=null?n.elevM:undefined}}).then(function(x){ return x||{ok:true}; }); }); }
  AGN.point={ parseLooks:looksLikeCoords, resolve:resolve, go:go, goText:goText, locate:locate, search:searchPlace, state:function(){ return {row:PT.row, rec:PT.rec, label:PT.label, popup:!!(PT.pop&&window.map&&map.hasLayer(PT.pop))}; },
    pin:function(){ try{ return PT.pin&&PT.layer&&map.hasLayer(PT.layer)&&PT.layer.hasLayer(PT.pin)?{lat:PT.pin.getLatLng().lat, lon:PT.pin.getLatLng().lng, label:PT.label, pins:D.querySelectorAll('.agn-pt-marker').length}:null; }catch(_){ return null; } } };
  /* a search made through the flow (AGN.flow.setActiveLocation with src 'search') gets the same pin and popup; the flow has set the place */
  (function wrapFlow(k){ var F=window.AGN&&AGN.flow; if(!F||!F.setActiveLocation){ if(k<240) setTimeout(function(){ wrapFlow(k+1); },250); return; } if(F.setActiveLocation.__ptSearch) return;
    var o=F.setActiveLocation; var w=function(s,label,opts){ var x=o.apply(this,arguments);
      try{ if(opts&&opts.src==='search'&&s&&isFinite(+s.lat)&&isFinite(+s.lon)) setTimeout(function(){ searchPlace({name:s.name||label, label:label||s.name, lat:+s.lat, lon:+s.lon, elevM:s.elevM}, {noDrive:true}); },0); }catch(_){}
      return x; }; w.__ptSearch=true; F.setActiveLocation=w; })(0);

   
  function mapBox(){ if(!window.map||!window.L) return false; if(D.getElementById('agnPtBox')) return true;
    var tools=D.querySelector('#mpMapWrap .maptools'); if(!tools) return false;    
    var d=D.createElement('div'); d.id='agnPtBox';
    d.innerHTML='<div class="r"><input type="search" id="agnPtInput" autocomplete="off" placeholder="Place or 33.69, 73.05" aria-label="Search a place or type coordinates"><button type="button" class="loc" id="agnPtLoc" title="Use my location">My location</button></div><div class="res" id="agnPtRes" role="listbox" aria-label="Places"></div><div class="st" id="agnPtSt" role="status" aria-live="polite"></div>';
    tools.appendChild(d); try{ L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d); }catch(_){}
    var inp=D.getElementById('agnPtInput'), res=D.getElementById('agnPtRes'), st=D.getElementById('agnPtSt'), lb=D.getElementById('agnPtLoc'), tm=0;
    /* v91.17.283.20 · B5: the names list is the shared place search (its order and request) */
    var att=AGN.places.attach({input:null, limit:6, keepDisputed:true, coords:true, render:function(R0,q,j){ show(j,q); }, fail:function(){ status(st,'Search unavailable (this server did not answer).'); }});
    function names(q){ att.run(q); }
    function show(j,q){
        var R=(j&&j.results)||[]; if(!R.length){ res.innerHTML=''; status(st,'No place in Pakistan by that name.'); return; } status(st,'');
        PT.listFor=q;
        res.innerHTML=R.map(function(r,i){ return '<button type="button" role="option" data-i="'+i+'">'+esc(r.name)+'<span class="d">'+esc([r.level,r.district,r.province].filter(Boolean).join(' · ')+(r.elevM!=null?' · '+r.elevM+' m':'')+(r.disputed?' · disputed territory (not scored)':''))+'</span></button>'; }).join('');
        [].forEach.call(res.querySelectorAll('button'),function(b){ b.onclick=function(){ var r=R[+b.getAttribute('data-i')]; res.innerHTML=''; if(!r) return;
          if(r.level==='coordinates'){ go(r,{status:st,quiet:true}); return; }
          if(r.exact){ inp.value=r.name; go(r,{status:st,quiet:true,label:r.name}); return; }    
          if(r.disputed){ status(st,esc(r.name)+' is in IIOJK (disputed territory): not scored.'); return; }
          inp.value=r.name; status(st,'Showing <b>'+esc(r.name)+'</b>'+(r.elevM!=null?' · '+r.elevM+' m':''));
          /* v91.17.278.1 · FIX2781 4 · the exact point with its pin and popup; the older way only when the point cannot be read */
          searchPlace(r,{status:null}).then(function(x){ if(x) return;
          try{ map.__agnRecentred=Date.now(); map.__agnUserView=Date.now();
            if(AGN.selFocus) AGN.selFocus.focus(r.lat,r.lon,{mode:'place',drive:true});    
            window.driveFromPoint(r.lat,r.lon,r.name,true,r.elevM!=null?r.elevM:undefined); }catch(_){} }); }; });
        if(PT.enterFor&&PT.enterFor===q){ PT.enterFor=null; var fb=res.querySelector('button'); if(fb) fb.click(); } }
    inp.addEventListener('input',function(){ clearTimeout(tm); var q=inp.value.trim(); if(q.length<2){ res.innerHTML=''; status(st,''); return; }
      tm=setTimeout(function(){ tm=0; if(looksLikeCoords(q)){ att.cancel(); resolve(q).then(function(r){ if(inp.value.trim()!==q) return; if(r&&!r.__error){ res.innerHTML='<button type="button" role="option" data-c="1">Go to '+esc(r.name)+'<span class="d">'+esc(rowSub(r))+'</span></button>';
            res.querySelector('button').onclick=function(){ res.innerHTML=''; go(r,{status:st,quiet:true}); }; status(st,''); } else names(q); }); }
        else names(q); },260); });
    

    inp.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); var q=inp.value.trim(), b=res.querySelector('button');
        if(b&&PT.listFor===q&&!tm) b.click(); else if(looksLikeCoords(q)) { clearTimeout(tm); tm=0; goText(q,{status:st,quiet:true}); }
        else if(q.length>=2){ clearTimeout(tm); tm=0; PT.enterFor=q; status(st,'Finding <b>'+esc(q)+'</b>\u2026'); names(q); } }
      if(e.key==='Escape'){ res.innerHTML=''; } });
    lb.addEventListener('click',function(){ res.innerHTML=''; locate({status:st,button:lb,quiet:true}); });
    return true; }

   
  var mT=0, mSeq=0;
  function machMenu(r){ var menu=D.getElementById('machPlaceMenu'); if(!menu) return;
    menu.innerHTML=''; var b=D.createElement('button'); b.type='button'; b.setAttribute('role','option'); b.setAttribute('data-agn-point','1');
    b.style.cssText='display:block;width:100%;text-align:left;border:0;background:transparent;padding:8px 10px;border-radius:9px;cursor:pointer;font-family:Manrope';
    b.innerHTML='<div style="font-size:0.8125rem;font-weight:700;color:var(--navy)">Go to '+esc(r.name)+'</div><div style="font-size:0.75rem;color:var(--muted)">'+esc(rowSub(r))+'</div>';
    b.onclick=function(){ menu.style.display='none'; menu.innerHTML=''; go(r,{status:D.getElementById('machPlaceNote')}); };
    menu.appendChild(b); menu.style.display='block'; }
  D.addEventListener('input',function(e){ var t=e.target; if(!t||t.id!=='machPlaceInput') return; if(!looksLikeCoords(t.value)) return;
    e.stopImmediatePropagation(); clearTimeout(mT); var q=t.value.trim(), my=++mSeq;
    mT=setTimeout(function(){ resolve(q).then(function(r){ if(my!==mSeq) return; if(r&&!r.__error) machMenu(r); else status(D.getElementById('machPlaceNote'),'“'+esc(q)+'” could not be read as coordinates.'); }); },250); },true);
  D.addEventListener('keydown',function(e){ var t=e.target; if(!t||t.id!=='machPlaceInput'||e.key!=='Enter'||!looksLikeCoords(t.value)) return;
    e.stopImmediatePropagation(); e.preventDefault(); var m=D.querySelector('#machPlaceMenu button[data-agn-point]'); if(m) m.click(); else goText(t.value,{status:D.getElementById('machPlaceNote')}); },true);

   
  function closeHdr(){ try{ if(typeof closeCity==='function') closeCity(); }catch(_){} try{ var cs=D.getElementById('citysel')||D.querySelector('.citysel'); if(cs) cs.classList.remove('open'); }catch(_){} }
  D.addEventListener('click',function(e){ var t=e.target; if(!t||!t.closest) return;
    var b=t.closest('#useLocBtn');
    if(b){ e.stopImmediatePropagation(); e.preventDefault(); var nt=D.getElementById('useLocNote'); var old=b.textContent; b.textContent='Locating…';
      locate({status:nt,button:b}).then(function(){ b.textContent=old; }); return; }
    b=t.closest('#hdrUseLoc');
    if(b){ e.stopImmediatePropagation(); e.preventDefault(); var box=D.getElementById('hdrPlaceResults');
      locate({status:box,button:b}).then(function(x){ if(x&&x.ok!==false) closeHdr(); }); return; }
    b=t.closest('#hdrPlaceResults button[data-i]');
    if(b){ var nm=((b.querySelector('b')||{}).textContent||'').trim(); if(!LAB.test(nm)) return;
      e.stopImmediatePropagation(); e.preventDefault(); var bx=D.getElementById('hdrPlaceResults');
      resolve(nm).then(function(r){ if(!r||r.__error){ status(bx,'This server did not answer; nothing was changed.'); return; }
        go(r,{status:bx}).then(function(x){ if(r.administered) closeHdr(); }); }); }
  },true);

  (function start(n){ var a=wireUhi(), b=mapBox(); if(!(a&&b)&&n<240) setTimeout(function(){ start(n+1); },500); })(0);
})();
