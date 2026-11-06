
(function(){
  'use strict';
  

  var D=document, G=window, AGN=G.AGN=G.AGN||{};
  var S={ sig:'', chipAdded:{}, data:null, src:'/api/quake/live?geom=1', on:false, grp:null, legend:null, byUid:{}, byDistrict:{}, timer:null, loading:false, loadedAt:0, err:null };
  var FILL=['#74c476','#ffe680','#fdae61','#e8552d','#a50026'];    
  function fill(i){ try{ if(AGN.hz5&&AGN.hz5.fill&&AGN.hz5.fill[i]) return AGN.hz5.fill[i]; }catch(_){} return FILL[i]||'#999'; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function words(){ return (AGN.level&&AGN.level.words)||['Normal','Low','Moderate','High','Severe']; }
  function lvInfo(i){ var L=(S.data&&S.data.levels)||[]; for(var k=0;k<L.length;k++) if(L[k].levelIndex===i) return L[k]; return null; }
  function plain(i){ var l=lvInfo(i); return l?l.plain:''; }
  function alertRank(){ var r=G.ALERT_MIN_CLASS_RANK; return (typeof r==='number'&&isFinite(r))?r:null; }
  function srcWords(s){ return s==='ShakeMap'?'from the shaking map published for this event':s==='equation'?'estimated from magnitude, depth and distance':'no shaking estimate'; }
  function magTxt(m){ return (Math.round(m*10)/10).toFixed(1); }
  function ready(){ return G.map && typeof L!=='undefined' && D.querySelector('#mpMapWrap .maptools'); }

   
  function index(){ S.byUid={}; S.byDistrict={};
    var d=S.data; if(!d) return;
    (d.flagged||[]).forEach(function(f){ S.byUid[f.uid]=f; var k=String(f.district||'').toLowerCase(); (S.byDistrict[k]=S.byDistrict[k]||[]).push(f); }); }
  function load(src){
    if(src) S.src=src; if(S.loading) return S.loading;
    S.loading=fetch(S.src,{cache:'no-store'}).then(function(r){ return r.json(); }).then(function(j){
      if(!j||!j.ok) throw new Error((j&&j.why)||'earthquake overlay not available');
      S.data=j; S.loadedAt=Date.now(); S.err=null; index(); after();
      return j; }).catch(function(e){ S.err=String(e&&e.message||e); return null; }).then(function(j){ S.loading=false; return j; });
    return S.loading; }
   
  function loadFaults(){ if(S.faults!==undefined) return Promise.resolve(S.faults); S.faults=null;
    return fetch('/api/faults',{cache:'no-store'}).then(function(r){ return r.json(); }).then(function(j){ S.faults=(j&&j.ok)?j:null; S.faultsErr=(j&&!j.ok)?j.why:null; return S.faults; })
      .catch(function(e){ S.faultsErr=String(e&&e.message||e); return null; }); }
  function faultPop(p){ var sr=p.slipRateMmYr;
    return '<div class="agn-qpop"><b>'+esc(p.name||(p.kind==='mapped active fault'?'Active fault':'Plate boundary'))+'</b><br>'
      +esc(p.kind==='mapped active fault'?((p.slipType?p.slipType+' fault':'Active fault')):p.kind)
      +(sr&&sr[0]!=null?' · slip about '+esc(sr[0])+' mm/yr'+(sr[1]!=null&&sr[2]!=null?' ('+esc(sr[1])+'–'+esc(sr[2])+')':''):'')
      +(p.dipDeg!=null?' · dip '+esc(p.dipDeg)+'°':'')+(p.lengthKm?' · '+esc(Math.round(p.lengthKm))+' km mapped':'')+'<br>'
      +'<span class="n">Mapped trace, generalised; a reference, not a hazard level. Source: '+esc((S.faults&&S.faults.credit)||'GEM Global Active Faults')+'.</span></div>'; }
  function schedule(){ if(S.timer) clearTimeout(S.timer);
    var sec=(S.data&&S.data.refreshSeconds)||null; if(!sec||S.src.indexOf('/api/quake/live')<0) return;    
    S.timer=setTimeout(function(){ if(D.visibilityState==='hidden'){ schedule(); return; } load().then(schedule); }, sec*1000); }
  function after(){
    try{ badge(); }catch(_){}
    try{ if(S.on) draw(); }catch(_){}
    

    var sig=flagged().map(function(f){ return f.uid+':'+f.levelIndex+':'+f.eventId; }).join('|');
    if(sig!==S.sig){ S.sig=sig;
      try{ if(typeof G.drawAlertList==='function') G.drawAlertList(); }catch(_){}
      try{ if(typeof G.drawRailAlerts==='function') G.drawRailAlerts(); }catch(_){}
      try{ if(AGN.hz5&&typeof AGN.hz5.repaint==='function') AGN.hz5.repaint(); }catch(_){} }    
    try{ D.dispatchEvent(new CustomEvent('agn:quake',{detail:{events:(S.data.events||[]).length,flagged:(S.data.flagged||[]).length}})); }catch(_){}
  }

   
  function flagged(){ var r=alertRank(); if(r==null||!S.data) return [];
    return (S.data.flagged||[]).filter(function(f){ return f.levelIndex>=r && f.withinAlertWindow; }).map(function(f){
      return { uid:f.uid, tehsil:f.tehsil, district:f.district, province:f.province, level:f.level, levelIndex:f.levelIndex, distanceKm:f.distanceKm,
               expectedIntensity:f.expectedIntensity, source:f.source, eventId:f.eventId, mag:f.mag, timePkt:f.timePkt }; }); }
  function evOf(id){ var E=(S.data&&S.data.events)||[]; for(var i=0;i<E.length;i++) if(E[i].id===id) return E[i]; return null; }

   
  function rowName(f){ return f.tehsil+(f.district&&f.district!==f.tehsil?', '+f.district:''); }
  function alertRows(){ return flagged().map(function(f){
      return { name:rowName(f), agnQuake:true, uid:f.uid, alert:'Earthquake M'+magTxt(f.mag)+' · '+f.level, level:f.level,
               sev:(f.levelIndex>=4?5:4), classRank:f.levelIndex, band:f.level, index:null, hazard:'seismic',
               basis:f.level+' shaking expected'+(function(m){ return m?' \u00b7 intensity '+m[1]:''; })(/\(intensity ([^)]+)\)/.exec(plain(f.levelIndex)))+', '+f.timePkt }; }); }
  function wrapAlerts(){
    if(typeof G.activeAlerts!=='function') return false;
    if(!G.activeAlerts.__agnQ){ var o=G.activeAlerts;
      var w=function(){ var rows=[]; try{ rows=o.apply(this,arguments)||[]; }catch(_){ rows=[]; }
        try{ var q=alertRows(); if(q.length){ var seen={}; rows.forEach(function(r){ seen[String(r&&r.name).toLowerCase()]=1; });
            q.forEach(function(r){ if(!seen[r.name.toLowerCase()]) rows.push(r); });
            rows.sort(function(a,b){ var ra=(a&&a.classRank)||0, rb=(b&&b.classRank)||0; if(rb!==ra) return rb-ra; return String((a&&a.name)||'').localeCompare(String((b&&b.name)||'')); }); } }catch(_){}
        return rows; };
      w.__agnQ=true; w.__orig=o; G.activeAlerts=w; }
     
    if(typeof G._alertSevWord==='function'&&!G._alertSevWord.__agnQ){ var s=G._alertSevWord;
      var v=function(a){ return (a&&a.agnQuake)?a.level:s.apply(this,arguments); }; v.__agnQ=true; v.__orig=s; G._alertSevWord=v; }
    return true; }
  

  D.addEventListener('click',function(e){ try{
      var r=e.target&&e.target.closest&&e.target.closest('#alertList .alertrow, #agnCheckList button[data-k]'); if(!r) return;
      var uid=null;
      if(r.classList.contains('alertrow')){ var nm=r.getAttribute('data-name'); alertRows().forEach(function(x){ if(x.name===nm) uid=x.uid; }); }
      else { var k=r.getAttribute('data-k'); if(k&&S.chipAdded[k]) uid=k; }    
      if(!uid) return;
      e.stopPropagation(); e.preventDefault();
      if(r.classList.contains('alertrow')){ var ab=D.getElementById('alertBtn'); if(ab) ab.classList.remove('open'); }
      zoomTo(uid, e.isTrusted!==false);
    }catch(_){} }, true);

   
  function chipMerge(t){ var q=flagged(); if(!q.length) return t;
    var out=t?{c:(t.c||[0,0,0,0,0]).slice(),list:(t.list||[]).slice(),cats:t.cats,src:t.src}:{c:[0,0,0,0,0],list:[]};
    var have={}; out.list.forEach(function(x){ have[String(x.key)]=1; }); S.chipAdded={};
    q.forEach(function(f){ if(have[f.uid]) return; out.c[f.levelIndex]++; S.chipAdded[f.uid]=1;
      out.list.push({key:f.uid,name:f.tehsil,sub:[f.district,f.province].filter(Boolean).join(' · ')+' · earthquake M'+magTxt(f.mag),i:f.levelIndex}); });
    out.list.sort(function(a,b){ return (b.i-a.i)||String(a.name).localeCompare(String(b.name)); });
    return out; }
   
  function unitOf(lat,lon,name){
    try{ var C=G.PK_DISTRICT_CENTROIDS||[], c=null, i;
      for(i=0;i<C.length&&!c;i++) if(C[i]&&C[i].lat===lat&&C[i].lon===lon) c=C[i];
      for(i=0;name&&!c&&i<C.length;i++) if(C[i]&&(C[i].key===name||C[i].district===name)) c=C[i];
      if(c) return { uid:c.uid||null, district:c.district||c.key||name }; }catch(_){}
    return name?{ uid:null, district:String(name) }:null; }
  function worstOf(F){ return F.reduce(function(a,b){ return (b.levelIndex>a.levelIndex||(b.levelIndex===a.levelIndex&&b.expectedIntensity>a.expectedIntensity))?b:a; },F[0]); }
  function forDistrict(lat,lon,name){ if(!S.data) return null;
    var u=unitOf(lat,lon,name); if(!u) return null;
    var F=S.byDistrict[String(u.district).toLowerCase()]||[];
    if(!F.length) return { nudge:0, n:0, maxMag:null, level:null, events:[], text:'no earthquake of the last '+S.data.retainDays+' days (M'+S.data.magMin+'+) is expected to have been felt in this district.' };
    var own=u.uid?S.byUid[u.uid]:null, top=worstOf(F);
    var ids={}; F.forEach(function(f){ ids[f.eventId]=1; }); var E=Object.keys(ids).map(evOf).filter(Boolean);
    var maxMag=E.reduce(function(m,e){ return Math.max(m,e.mag); },0);
    var inTop=F.filter(function(f){ return f.levelIndex===top.levelIndex; }).map(function(f){ return f.tehsil; });
    var t=own?('M'+magTxt(own.mag)+' earthquake on '+own.timePkt+': '+own.level+' here, '+plain(own.levelIndex)+'.')
             :('M'+magTxt(top.mag)+' earthquake on '+top.timePkt+': '+top.level+' in '+inTop.slice(0,4).join(', ')+(inTop.length>4?' and '+(inTop.length-4)+' more':'')+' in this district, '+plain(top.levelIndex)+'.');
    return { nudge:0, n:E.length, maxMag:maxMag, level:(own||top).level, events:E.map(function(e){ return e.id; }),
             text:t+' Shown as an event, never added to the design-basis zone.' }; }

   
  function radiusOf(m){ var R=S.data&&S.data.markerRadiusPx; if(!R) return 6; return Math.max(R.base, R.base+R.perMagnitude*(m-S.data.magMin)); }
  function evPop(e){
    var by=e.byLevel||{}, W=words(), felt=e.flaggedCount||0, lines=[];
    var top=null; for(var i=4;i>=1;i--){ var n=by[W[i]]||0; if(n&&top==null) top=i; }
    if(e.outsideValidity) lines.push('Too small or too far for a shaking estimate: shown for information.');
    else if(!felt) lines.push('Not expected to have been felt in any Pakistan tehsil.');
    else { lines.push('Felt in '+felt+' tehsil'+(felt===1?'':'s')+' (expected).');
      if(top!=null) lines.push('<b class="lv" style="color:'+esc((AGN.level&&AGN.level.ink)?AGN.level.ink(top):'#12303f')+'">'+esc(W[top])+'</b>: '+esc(plain(top))+' expected in '+(by[W[top]])+' tehsil'+(by[W[top]]===1?'':'s')+' ('+esc((e.tehsils||[]).filter(function(t){ return t.levelIndex===top; }).slice(0,4).map(function(t){ return t.tehsil; }).join(', '))+((by[W[top]]>4)?', …':'')+').'); }
    return '<div class="agn-quake-pop"><b>Magnitude '+esc(magTxt(e.mag))+'</b> · depth '+esc(Math.round(e.depthKm))+' km<br>'+esc(e.timePkt)+'<br>'
      +(e.place?'<span class="n">'+esc(e.place)+'</span><br>':'')+lines.join('<br>')
      +'<br><span class="n">Shaking '+esc(srcWords(e.intensitySource))+'. An event, not the design-basis seismic zone. Source: '+esc(S.data.credit)+'.</span>'
      +'<span class="n agn-op-only"><br>'+esc(e.id)+' · '+esc(e.magType||'')+' · intensity: '+esc(e.intensitySource)+(e.maxIntensity!=null?' · max MMI '+esc(e.maxIntensity):'')+' · rule '+esc(S.data.rule)+'</span></div>'; }
  function tehPop(f){ var e=evOf(f.eventId);
    return '<div class="agn-quake-pop"><b>'+esc(f.tehsil)+'</b>'+(f.district?', '+esc(f.district):'')+'<br>'
      +'<b class="lv" style="color:'+esc((AGN.level&&AGN.level.ink)?AGN.level.ink(f.levelIndex):'#12303f')+'">'+esc(f.level)+'</b>: '+esc(plain(f.levelIndex))+'<br>'
      +'Magnitude '+esc(magTxt(f.mag))+(e?' · depth '+esc(Math.round(e.depthKm))+' km':'')+' · '+esc(f.timePkt)+'<br>'
      +(f.distanceKm>0?esc(Math.round(f.distanceKm))+' km from the epicentre (nearest point of the tehsil)':'The epicentre is inside this tehsil')+'<br>'
      +'<span class="n">Shaking '+esc(srcWords(f.source))+'. Source: '+esc(S.data.credit)+'.</span>'
      +'<span class="n agn-op-only"><br>expected MMI '+esc(f.expectedIntensity)+' · '+esc(f.source)+' · '+esc(f.eventId)+'</span></div>'; }
  function draw(){
    if(!ready()||!S.data) return; clear();
    if(!map.getPane('agnQuake')){ var pn=map.createPane('agnQuake'); pn.style.zIndex=585; }    
    var R=L.svg({padding:.3,pane:'agnQuake'}); S.grp=L.layerGroup();
    if(S.faults&&S.faults.features) L.geoJSON({type:'FeatureCollection',features:S.faults.features},{pane:'agnQuake',renderer:R,
      style:function(f){ var pb=f.properties&&f.properties.kind!=='mapped active fault'; return {color:'#b4442a',weight:pb?1.4:1.8,opacity:.85,dashArray:pb?'6 4':null}; },
      onEachFeature:function(f,l){ l.bindPopup(faultPop(f.properties||{})); }}).addTo(S.grp);
    var F=(S.data.flagged||[]).slice().sort(function(a,b){ return a.levelIndex-b.levelIndex; });    
    F.forEach(function(f){ if(!f.geometry) return;
      var g=L.geoJSON({type:'Feature',properties:{uid:f.uid},geometry:f.geometry},{pane:'agnQuake',renderer:R,
        style:function(){ return {color:fill(f.levelIndex),weight:2.6,opacity:1,fillColor:fill(f.levelIndex),fillOpacity:.14}; }});
      L.geoJSON({type:'Feature',geometry:f.geometry},{pane:'agnQuake',renderer:R,interactive:false,style:function(){ return {color:'#0C3851',weight:4.4,opacity:.35,fill:false}; }}).addTo(S.grp);
      g.bindPopup(tehPop(f)); g.__agnUid=f.uid; g.addTo(S.grp); });
     
    shown().slice().sort(function(a,b){ return a.mag-b.mag; }).forEach(function(e){
      

      var r=Math.max(7,radiusOf(e.mag)), s=2*r+6, c=s/2;
      var svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+s+'" height="'+s+'" viewBox="0 0 '+s+' '+s+'" aria-hidden="true">'
        +'<circle cx="'+c+'" cy="'+c+'" r="'+r+'" fill="#ffffff" fill-opacity=".9" stroke="#7a2e0e" stroke-width="2.2"/>'
        +'<circle cx="'+c+'" cy="'+c+'" r="'+(r*0.58).toFixed(1)+'" fill="none" stroke="#7a2e0e" stroke-width="1.6"/>'
        +'<circle cx="'+c+'" cy="'+c+'" r="'+Math.max(1.8,r*0.2).toFixed(1)+'" fill="#7a2e0e"/></svg>';
      if(!map.getPane('agnQuakeEp')){ var pe=map.createPane('agnQuakeEp'); pe.style.zIndex=655; }    
      L.marker([e.lat,e.lon],{pane:'agnQuakeEp',keyboard:true,title:'Earthquake M'+e.mag,icon:L.divIcon({className:'agn-quake-ep',html:svg,iconSize:[s,s],iconAnchor:[c,c]})})
        .bindPopup(evPop(e)).addTo(S.grp); });
    S.grp.addTo(map); S.drawn=S.data; leg(); }
  function shown(){ return ((S.data&&S.data.events)||[]).filter(function(e){ return e.inPakistan!==false || (e.flaggedCount||0)>0; }); }
  function clear(){ if(S.grp){ try{ map.removeLayer(S.grp); }catch(_){} S.grp=null; } S.drawn=null; }
  function leg(){ var h=D.getElementById('mpMapWrap'); if(!h) return;
    if(!S.legend){ S.legend=D.createElement('div'); S.legend.id='agnQuakeLeg'; S.legend.setAttribute('role','note'); h.appendChild(S.legend); }
    var d=S.data, W=words();
    S.legend.innerHTML=d?('<b>Recent earthquakes</b> <span class="n">(last '+esc(d.retainDays)+' days, M'+esc(d.magMin)+'+)</span>'
      +(function(){ var n=shown().length, all=(d.events||[]).length, out=all-n;
          return '<div><i class="ep"></i>Epicentre, sized by magnitude · '+n+' event'+(n===1?'':'s')+' in Pakistan or felt here</div>'
            +(out>0?'<div class="n">'+out+' more across the border, not felt in any tehsil, are not drawn.</div>':''); })()
      +(S.faults?'<div><i class="ft"></i>Active fault (dashed: plate boundary) · '+esc(S.faults.credit||'GEM')+'</div>':(S.faultsErr?'<div class="n">Fault lines not available: '+esc(S.faultsErr)+'</div>':''))
      +[4,3,2,1].map(function(i){ var l=lvInfo(i); return '<div><i style="border-color:'+fill(i)+'"></i>'+esc(W[i])+' \u00b7 '+esc(l&&l.shaking?String(l.shaking).toLowerCase()+' shaking':plain(i))+'</div>'; }).join('')
      +'<div class="n">'+((d.flagged||[]).length?((d.flagged||[]).length+' tehsil'+((d.flagged||[]).length===1?'':'s')+' outlined in the level of the shaking expected there.'):'No tehsil is expected to have felt these events.')
      +' Shown as events: never added to the design-basis seismic zone. Source: '+esc(d.credit)+'.</div>'):'<b>Recent earthquakes</b><div class="n">'+esc(S.err||'Loading…')+'</div>';
    S.legend.classList.toggle('open',S.on);
    try{ var gl=D.getElementById('agnGlofLeg'); S.legend.style.bottom=(gl&&gl.classList.contains('open'))?(gl.offsetHeight+48)+'px':''; }catch(_){} }
  function badge(){ var b=D.getElementById('agnQuakeBtn'); if(!b) return; var n=b.querySelector('.n'); var k=flagged().length;
    if(n){ n.hidden=!k; n.textContent=String(k); }
    b.title='Recent earthquakes and active faults: epicentres, the tehsils expected to have felt them, and mapped fault lines'+(k?(' · '+k+' tehsil'+(k===1?'':'s')+' at High or Severe'):''); }
  function toggle(force){ S.on=(typeof force==='boolean')?force:!S.on; var b=D.getElementById('agnQuakeBtn');
    if(b){ b.classList.toggle('on',S.on); b.setAttribute('aria-pressed',S.on?'true':'false'); }
    if(!S.on){ clear(); leg(); return Promise.resolve(false); }
    leg(); if(S.grp&&S.drawn===S.data) return Promise.resolve(true);    
    return Promise.all([S.data?Promise.resolve(S.data):load(), loadFaults()]).then(function(){ draw(); return true; }); }
  function zoomTo(uid, fromClick){ return toggle(true).then(function(){ var tgt=null; if(S.grp) S.grp.eachLayer(function(l){ if(l.__agnUid===uid) tgt=l; });
      if(!tgt||!G.map) return false; map.__agnRecentred=Date.now(); map.fitBounds(tgt.getBounds(),{maxZoom:9,padding:[60,60]});
      

      if(fromClick){ try{ var pp=tgt.getPopup&&tgt.getPopup(); if(pp) pp.__agnAllow=true; tgt.openPopup(tgt.getBounds().getCenter()); if(pp) pp.__agnAllow=false; }catch(_){} }
      return true; }); }

  (function mount(n){
    if(!ready()) return n<120&&setTimeout(function(){ mount(n+1); },500);
    if(!D.getElementById('agnQuakeBtn')){
      var b=D.createElement('button'); b.id='agnQuakeBtn'; b.type='button'; b.setAttribute('aria-pressed','false');
      b.innerHTML='Recent earthquakes &amp; faults<span class="n" hidden></span>'; b.onclick=function(){ toggle(); };
      var gb=D.getElementById('agnGlofBtn'), tb=D.querySelector('#mpMapWrap .maptools');
      if(gb&&gb.parentNode===tb) tb.insertBefore(b,gb.nextSibling); else tb.appendChild(b); }
    badge();
  })(0);
  (function hook(n){ if(!wrapAlerts()) return n<120&&setTimeout(function(){ hook(n+1); },500); })(0);
  load().then(schedule);

  AGN.quake={ load:load, data:function(){ return S.data; }, src:function(){ return S.src||null; }, flagged:flagged, chipMerge:chipMerge, forDistrict:forDistrict, alertRows:alertRows,
    toggle:toggle, isOn:function(){ return S.on; }, zoomTo:zoomTo, count:function(){ return S.grp?S.grp.getLayers().length:0; },
    error:function(){ return S.err; } };
})();
