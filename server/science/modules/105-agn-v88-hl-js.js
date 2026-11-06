
(function(G){
  'use strict';
  var D=G.document, cache={}, busy=false, lastKey='';
  function esc(v){ return String(v==null?'':v).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function point0(){ try{ var s=G.AGN.subject&&G.AGN.subject.get(); if(s&&s.asset_lat!=null&&Number.isFinite(+s.asset_lat)) return {lat:+s.asset_lat,lon:+s.asset_lon,name:s.asset_name}; }catch(_){}
    try{ var a=G.AGN.dataServices.require('domain').activePoint(); if(a&&a.lat!=null) return {lat:+a.lat,lon:+a.lon,name:a.name}; }catch(_){}
    return null; }
  

  function panelUnit(){ var h=D.querySelector('#mpLeftIn .mp-h h4'); return h?String(h.textContent||'').trim():null; }
  function unitCentre(name){ try{ var dl=(typeof districtLayer!=='undefined')?districtLayer:null, f=null; if(!dl) return null;
      dl.eachLayer(function(l){ var q=l.feature&&l.feature.properties; if(!f&&q&&q.key===name&&l.getBounds) f=l; }); if(!f) return null;
      var c=f.getBounds().getCenter(); return {lat:+c.lat.toFixed(4),lon:+c.lng.toFixed(4),name:name,centre:true}; }catch(_){ return null; } }
  /* v91.17.283.15 · the side panel's unit stands for the place only when it changed after the point did: a new selection moves the point
     first and the panel a moment later, and the nearby list read the old unit's centre in between (a stray /near of the last place) */
  var PK=null, ptAt=0, panAt=0;
  function notePoint(p){ var k=p?p.lat.toFixed(3)+','+p.lon.toFixed(3):null; if(k!==PK){ PK=k; ptAt=Date.now(); } return p; }
  function point(){ var p=notePoint(point0()), u=panelUnit(); if(!u) return p;
    var su=null; try{ su=(p&&G.AGN.siteUnit)?G.AGN.siteUnit(p.lat,p.lon):null; }catch(_){ su=null; }
    if(p&&su&&su.key===u) return p; if(p&&panAt<ptAt) return p; return unitCentre(u)||p; }
  function areaName(p,j){ var pl=(j.places||[]); var d={}; pl.forEach(function(x){ var k=x.district||''; d[k]=(d[k]||0)+1; });
    var top=Object.keys(d).sort(function(a,b){ return d[b]-d[a]; })[0]; return (top&&top.replace(/ District$/,''))||String(p.name||'this area').split('·')[0].split('(')[0].trim(); }
  function colour(t,lo,hi){ var f=hi>lo?(t-lo)/(hi-lo):0.5; var h=205-f*185; return 'hsl('+h+',70%,'+(92-f*8)+'%)'; }
   
  function feels(x){ return Number.isFinite(x.heatIndexC)&&x.heatIndexC>=26.7&&Math.abs(x.heatIndexC-x.tempC)>=1; }
  function heatSum(pl){ var ord=['caution','extreme_caution','danger','extreme_danger'], w=-1, lab='', n=0;
    pl.forEach(function(x){ var k=ord.indexOf(x.heatId); if(k>w){ w=k; lab=x.heatCat; } });
    if(w<0) return ''; pl.forEach(function(x){ if(ord.indexOf(x.heatId)===w) n++; });
    return '<span class="agn-hi91 '+ord[w]+'">Heat stress: <b>'+esc(lab)+'</b> at '+n+' of '+pl.length+' places (feels like, in shade)</span>'; }
  

  function nearTxt(p,pl){ var sp=null; try{ var v=(G.AGN&&G.AGN.nowAt)?G.AGN.nowAt.peek(p.lat,p.lon):null; sp=v&&v.support; }catch(_){ sp=null; }
    var n=0; (pl||[]).forEach(function(x){ if(+x.liveStations>n) n=+x.liveStations; });
    var stl=null; try{ stl=(sp&&sp.station&&G.AGN.stationStatus)?G.AGN.stationStatus.label({name:sp.station,key:sp.key,no:sp.no}):null; }catch(_){ stl=null; }
    var near=(sp&&sp.station)?('nearest MACH station '+sp.station+(stl?' ('+stl.text+')':'')+(sp.km!=null?' '+sp.km+' km':'')+(sp.ageMin!=null?', last reading '+Math.round(sp.ageMin)+' min ago':'')):null;
     
    var B=null; try{ var v2=(G.AGN&&G.AGN.nowAt)?G.AGN.nowAt.peek(p.lat,p.lon):null; B=v2&&v2.build; }catch(_){ B=null; }
    var lw=B?(B.liveApplied?'live MACH correction applied this hour':('live MACH correction not used: '+(B.liveWhy||'not run'))):(n>0?n+' live MACH station'+(n===1?'':'s')+' within 40 km':'');
    return [near,lw].filter(Boolean).join(' · '); }
  function render(box,p,j){
    var pl=(j.places||[]).filter(function(x){ return Number.isFinite(x.tempC); });
    if(box.classList.contains('agn-hl88-side')) return renderSide(box,p,j,pl);
    if(!pl.length){ box.innerHTML='<div class="hd"><b>Temperature now, place by place</b></div><div class="foot">'+esc(j.why||'No named place found around this point.')+'</div>'; return; }
    var lo=Math.min.apply(null,pl.map(function(x){ return x.tempC; })), hi=Math.max.apply(null,pl.map(function(x){ return x.tempC; }));
    var live=pl.filter(function(x){ return x.live&&Number.isFinite(x.liveC); }), pm=live.length?Math.max.apply(null,live.map(function(x){ return x.plusMinus90C||0; })):null;
     
    var nat=pl.filter(function(x){ return x.national; });
    if(pm==null){ var rr=pl.filter(function(x){ return x.natRange90; }).map(function(x){ return (x.natRange90[1]-x.natRange90[0])/2; }); if(rr.length){ rr.sort(function(a,b){ return a-b; }); pm=rr[Math.floor(rr.length/2)]; } }
    var w=pl[0], c=pl[pl.length-1];
    box.innerHTML='<div class="hd"><b>Temperature now across '+esc(areaName(p,j))+'</b><span class="sub">'+pl.length+' places within '+esc(j.radiusKm)+' km</span>'
      +(live.length?'<span class="live on">Live MACH layer on · '+live.length+' of '+pl.length+' places</span>':'<span class="live off">'+(nat.length?'National hyperlocal model':'Forecast with terrain and city corrections')+' · '+esc(nearTxt(p,pl))+'</span>')+'</div>'
      +'<div class="sum"><span>Warmest <b>'+esc(w.name)+' '+w.tempC.toFixed(1)+' °C</b></span><span>Coolest <b>'+esc(c.name)+' '+c.tempC.toFixed(1)+' °C</b></span><span>Spread <b>'+(hi-lo).toFixed(1)+' °C</b></span>'
      +(pm!=null?'<span>Typical range ± '+pm.toFixed(1)+' °C</span>':'')+heatSum(pl)+'</div>'
      +'<div class="agn-hlg88">'+pl.map(function(x,i){ return '<button type="button" data-hl88="'+i+'" style="background:'+colour(x.tempC,lo,hi)+'" title="'+esc(x.name+' · '+x.kind+(x.elevM!=null?' · '+Math.round(x.elevM)+' m':'')+(x.live&&Number.isFinite(x.liveC)?' · live MACH layer '+(x.liveC>=0?'+':'')+x.liveC.toFixed(1)+' °C':''))+'"><span class="n">'+esc(x.name)+'</span><span class="t">'+x.tempC.toFixed(1)+'°</span>'+(feels(x)?'<span class="hi'+(x.heatId?' '+x.heatId:'')+'" title="Heat index (US NWS), from the served temperature and humidity">heat index '+Math.round(x.heatIndexC)+'°</span>':'')+'</button>'; }).join('')+'</div>'
      +'<div class="foot">Each place: the served forecast for this hour at its own height'+(nat.length?', corrected by AGN’s national hyperlocal model (terrain, land surface and the hour’s weather, learned from stations across Pakistan)':', with the terrain and city corrections')+(live.length?', plus what AGN’s MACH stations measure right now around it (each station first corrected for sun and siting)'+((window.AGN&&AGN.operator&&AGN.operator())?'. Internal: tested on held-out stations in Islamabad-Rawalpindi, typical error 1.0 °C against 1.7 °C for the raw forecast.':'.'):'.')+' Click a place to open it.</div>';
    box.__pl=pl;
  }
  function load(force){
    var p=point(); if(!p) return; var key=p.lat.toFixed(2)+','+p.lon.toFixed(2);
    var boxes=[].slice.call(D.querySelectorAll('.agn-hl88')); if(!boxes.length) return;
    if(!force&&key===lastKey&&cache[key]&&Date.now()-cache[key].at<3*60e3){     boxes.forEach(function(b){ if(!b.__pl||b.__key!==key){ render(b,p,cache[key].j); b.__key=key; } }); return; }
    if(busy&&busy===key) return; busy=key; lastKey=key;   /* v91.17.283 D8: a new place is read even while an older one is in flight */
    boxes.forEach(function(b){ if(!b.__pl||b.__key!==key){ b.__pl=null; b.__key=null; b.innerHTML='<div class="hd"><b>Temperature now, place by place</b><span class="sub">loading…</span></div>'; } });
    window.AGN.pointState.near(p.lat,p.lon,12).then(function(j){ if(!j) throw new Error('no answer'); return j; })   /* v91.17.283.12: the page store (/api/pointstate/near) */.then(function(j){ cache[key]={at:Date.now(),j:j}; if(lastKey!==key) return; boxes.forEach(function(b){ render(b,p,j); b.__key=key; }); })
      .catch(function(){ if(lastKey!==key) return; boxes.forEach(function(b){ b.innerHTML='<div class="hd"><b>Temperature now, place by place</b></div><div class="foot">Not available right now.</div>'; }); })
      .then(function(){ if(busy===key) busy=false; });
  }
   
  D.addEventListener('agn:now',function(ev){ setTimeout(function(){ try{ var p=point(); if(!p) return; var key=p.lat.toFixed(2)+','+p.lon.toFixed(2); if(!cache[key]) return; if(ev&&ev.detail&&ev.detail.run){ cache={}; load(true); return; }   /* a new run: read again from the store, once */
    [].slice.call(D.querySelectorAll('.agn-hl88-side')).forEach(function(b){ if(!b.classList.contains('all')) render(b,p,cache[key].j); }); }catch(_){} },60); });
   
  function renderSide(box,p,j,pl){
    if(!pl.length){ box.innerHTML='<div class="hd"><b>Temperature now nearby</b></div><div class="foot">'+esc(j.why||'No named place found around this point.')+'</div>'; box.__pl=[]; return; }
    

    var here=null; try{ var pv=(!p.centre&&G.AGN&&G.AGN.nowAt)?G.AGN.nowAt.peek(p.lat,p.lon):null; if(pv&&pv.tempC!=null){ var _hp=D.querySelector('#agnLive84 .agn-place span');
      here={name:'This spot',lat:+p.lat,lon:+p.lon,km:0,tempC:+pv.tempC,kind:'the selected spot '+String((_hp&&_hp.textContent)||p.name||'')+' (the same value as the bar)',elevM:null,here:true};
      pl=pl.filter(function(x){ return !(x.km!=null&&x.km<0.3); }); } }catch(_){ here=null; }
    if(here) pl=[here].concat(pl);
    var lo=Math.min.apply(null,pl.map(function(x){ return x.tempC; })), hi=Math.max.apply(null,pl.map(function(x){ return x.tempC; }));
    var byKm=pl.slice().sort(function(a,b){ return (a.here?-1:b.here?1:0)||((a.km==null?1e9:a.km)-(b.km==null?1e9:b.km)); });
    var pos=function(t){ return hi>lo?Math.round((t-lo)/(hi-lo)*100):50; };
    box.innerHTML='<div class="hd"><b>Temperature now '+(p.centre?'in '+esc(p.name):'nearby')+'</b><span class="sub">'+pl.length+' places within '+esc(j.radiusKm)+' km'+(p.centre?' of its middle':'')+' \u00b7 spread '+lo.toFixed(1)+'\u2013'+hi.toFixed(1)+' \u00b0C</span></div>'
      +'<div class="rows">'+byKm.map(function(x,i){ return '<button type="button" data-hl88="'+i+'"'+(i>=9?' class="more"':'')+' title="'+esc(x.name+' \u00b7 '+x.kind+(x.elevM!=null?' \u00b7 '+Math.round(x.elevM)+' m':'')+(feels(x)?' \u00b7 heat index '+Math.round(x.heatIndexC)+' \u00b0C':''))+'">'
        +'<span class="n">'+(x.here?'<b>'+esc(x.name)+'</b>':esc(x.name))+'</span><span class="km">'+(x.here?'':x.km!=null?(+x.km).toFixed(1)+' km':'')+'</span><span class="bar"><i style="left:calc('+pos(x.tempC)+'% - 5px);background:'+colour(x.tempC,lo,hi)+'"></i></span><span class="t">'+x.tempC.toFixed(1)+'\u00b0</span></button>'; }).join('')+'</div>'
      +(byKm.length>9?'<button type="button" class="all" data-hl88-all>Show all '+byKm.length+' places</button>':'')
      +'<div class="foot">'+esc(nearTxt(p,pl))+'</div>';
    box.classList.remove('all'); box.__pl=byKm;
  }
  

  function mount(){
    var side=D.getElementById('mpLeft');
    if(side && !side.querySelector(':scope > .agn-hl88')){
      var b=D.createElement('section'); b.className='agn-hl88 agn-hl88-side'; b.setAttribute('aria-label','Temperature now nearby'); side.appendChild(b);
      b.addEventListener('click',function(e){ var a=e.target.closest('[data-hl88-all]'); if(a){ b.classList.toggle('all'); a.textContent=b.classList.contains('all')?'Show fewer':'Show all '+(b.__pl||[]).length+' places'; return; }
        var t=e.target.closest('[data-hl88]'); if(!t||!b.__pl) return; var x=b.__pl[+t.getAttribute('data-hl88')]; if(!x||!isFinite(+x.lat)||!isFinite(+x.lon)) return;
        

        

        try{ var M=G.map; if(G.AGN&&G.AGN.selFocus) G.AGN.selFocus.focus(+x.lat,+x.lon,{mode:'point'});
          else if(M&&typeof M.setView==='function'){ M.__agnRecentred=Date.now(); M.__agnUserView=Date.now();
          M.setView([+x.lat,+x.lon],Math.max((G.AGN&&G.AGN.streets&&G.AGN.streets.on())?15:10,M.getZoom()),{animate:false}); } }catch(_){}
        if(!x.here&&typeof G.driveFromPoint==='function') try{ G.driveFromPoint(+x.lat,+x.lon,x.name,false); }catch(_){} });
    }
    load(false);
  }
  ['agn:location','agn:active-asset','agn:project'].forEach(function(ev){ D.addEventListener(ev,function(){ notePoint(point0()); setTimeout(function(){ load(false); },900); }); });
   
  (function watchPanel(n){ var L=D.getElementById('mpLeftIn'); if(!L){ if(n<120) setTimeout(function(){ watchPanel(n+1); },500); return; }
    var last=null, t=null; try{ new MutationObserver(function(){ var u=panelUnit(); if(u===last) return; last=u; notePoint(point0()); panAt=Date.now(); clearTimeout(t); t=setTimeout(function(){ load(false); },400); }).observe(L,{childList:true}); }catch(_){} })(0);
  setInterval(mount,5000); setInterval(function(){ load(true); },20*60e3);
})(window);
