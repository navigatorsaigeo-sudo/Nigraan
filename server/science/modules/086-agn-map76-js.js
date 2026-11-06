
 
(function(){
  'use strict';
  window.AGN=window.AGN||{};
  var D=document, W=['Normal','Low','Moderate','High','Severe'];
  /* v91.17.283.20 · B4: the heat / cold words beside a level are the thresholds register's (AGN.levelLegends, GET /api/registry/levels) */
  function PWof(k){ var L=window.AGN&&AGN.levelLegends&&AGN.levelLegends.legends; return L&&L[k]?L[k]:null; }    
  function esc(v){ return String(v==null?'':v).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function IJ(){ try{ return IIOJK; }catch(_){ return null; } }
  function dl(){ try{ return (typeof districtLayer!=='undefined')?districtLayer:null; }catch(_){ return null; } }
  function H(){ return (window.AGN&&AGN.hz5)||null; }

  

  var gesture=0;
  ['pointerdown','mousedown','touchstart','keydown','click'].forEach(function(t){ D.addEventListener(t,function(e){ if(!e||e.isTrusted!==false) gesture=Date.now(); },{capture:true,passive:true}); });
  function userNow(){ return Date.now()-gesture<1500; }
  AGN.popupGuard={ blocked:0, userNow:userNow };
  function guardPopups(){ if(typeof L==='undefined'||!L.Popup) return false; if(L.Popup.prototype.__agn76) return true;
    var o=L.Popup.prototype.openOn;
    L.Popup.prototype.openOn=function(){ if(!userNow()&&!this.__agnAllow){ AGN.popupGuard.blocked++; return this; } return o.apply(this,arguments); };
    L.Popup.prototype.__agn76=true; return true; }
  guardPopups();

  

  var POP=null;
  function layerName(){ try{ var o=AGN.olState&&AGN.olState(); if(o&&o.id&&o.data&&o.data.ready) return 'Outlook: '+(o.data.title||o.id);
      var pk=D.getElementById('mapHazardPick'); return (pk&&pk.selectedIndex>=0)?pk.options[pk.selectedIndex].text.trim():''; }catch(_){ return ''; } }
  function timeText(){ try{ var o=AGN.olState&&AGN.olState(); if(o&&o.id&&o.data&&o.data.valid) return 'outlook period '+o.data.valid;    
      var c=AGN.context&&AGN.context.read?AGN.context.read():null; return c&&c.time?c.time:''; }catch(_){ return ''; } }
  function unitRow(p){    
    var h=H(), o=null; try{ o=AGN.olState&&AGN.olState(); }catch(_){}
    if(p.province===IJ()) return {word:'Disputed territory (IIOJK): not scored'};
    if(p.dq===true) return {word:'No data', value:'unresolved administrative unit'};
    if(o&&o.id&&o.data&&o.data.ready){ var d=o.data, v=d.values?d.values[p.uid]:null;
      if(v==null) return {word:(d.whys&&d.whys[p.uid])?'Unfilled':'No value', value:(d.whys&&d.whys[p.uid])||'no value for this unit', ord:-1};
      var lv=o.level(v), cls=o.classOf?o.classOf(v):null;
      var ocw=d.type==='chance'&&o.word?o.word(v):null; return {word:ocw?ocw:lv!=null?W[lv]:(cls||''), swatch:o.color?o.color(v):null, value:(d.type==='binary'?(v?'smog day':'no'):(d.type==='classes4'?(d.labels||[])[v]:(v>0&&d.type==='diverging'?'+':'')+v+(d.unit?' '+d.unit:''))), ord:lv!=null?lv:(d.type==='chance'?Math.min(4,Math.floor(v/20)):0)}; }
    if(!h||!h.unitLevel) return {word:''};
    var k=h.currentKey?h.currentKey():null; if(!k) return {word:'', value:'this layer has no level key'};
    if(h.loading&&h.loading()) return {word:'Loading…', ord:-2};
    var r=h.unitLevel(p.key); if(!r) return {word:''};
    if(r.na) return {word:'Cannot occur here', ord:-1};
    if(r.i==null) return r.pending?{word:'Loading\u2026', ord:-2}:r.why?{word:'Not assessed', value:r.why, ord:-2}:{word:'No data', ord:-2};   /* W1: the server's reason */    
    var sc=h.scaleOf?h.scaleOf(k):null, val='', idx='';
    if(sc&&sc.palette) return {word:(sc.words||[])[r.i]||W[r.i], swatch:sc.palette[r.i], value:(r.v!=null?(r.v+' '+(sc.unit||'')+' · '+sc.measure):''), idx:'', ord:-3};
    if(sc) val=r.v!=null?(r.v+(sc.unit?' '+sc.unit:' / 100')+' · '+sc.measure):'';
    else if(r.cat!=null) val='class: '+r.cat; else if(r.v!=null){ idx='screening index '+Math.round(r.v)+' / 100'; val=physText(k,p.key); }
    

    var pw=PWof(k); return {word:pw?(W[r.i]+' \u00b7 '+String(pw[r.i])):W[r.i], swatch:h.swatch[r.i], value:val, idx:idx, ord:r.i}; }
  

  function r0(x){ return Math.round(+x); }
  function r1(x){ x=+x; return Math.abs(x)<10?(Math.round(x*10)/10):Math.round(x); }
  function okn(x){ return x!=null&&x!==''&&isFinite(+x); }
  function physText(k,key){ var inp=null;
    try{ inp=(typeof hzDayInput==='function')?hzDayInput(key,k):null; }catch(_){ inp=null; }
    if(!inp||inp.__unavailable) return '';
    try{
      var cur=inp.timeBasis==='current';    
      if(k==='heat'){ var tx=okn(inp.tmaxDay)?inp.tmaxDay:inp.t; if(!okn(tx)) return '';
         
        var u=okn(inp.heatUtciShade)?+inp.heatUtciShade:null;   /* W1: the held UTCI or none (no page UTCI) */
        var uc=(u!=null&&typeof window.agnUtciClass==='function')?window.agnUtciClass(u):null;
        return (u!=null?('UTCI '+(Math.round(u*10)/10).toFixed(1)+' °C in shade at the hottest hour'+(uc?' ('+uc.toLowerCase()+')':'')+' · '):'')+(cur?'temperature ':'highest temperature ')+r0(tx)+' °C'; }
      if(k==='cold'){ var tn=okn(inp.tminDay)?inp.tminDay:inp.t; return okn(tn)?((cur?'Temperature ':'Lowest temperature ')+r0(tn)+' °C'):''; }
      if(k==='wind'){ if(okn(inp.gust)) return (cur?'Gusts ':'Strongest gust ')+r0(inp.gust)+' km/h'+(okn(inp.wind)?' (mean wind '+r0(inp.wind)+' km/h)':''); return okn(inp.wind)?('Wind '+r0(inp.wind)+' km/h'):''; }
      if(k==='flood'||k==='flood_pluvial'||k==='rain_hz'||k==='landslide'){
        var tot=inp.rainTotalDay, pk=okn(inp.rainPeakDay)?inp.rainPeakDay:inp.rain;
        if(cur) return okn(pk)?('Rain '+r1(pk)+' mm this hour'):(okn(tot)?('Rain '+r1(tot)+' mm this hour'):'');
        if(okn(tot)) return 'Rain '+r1(tot)+' mm in the day'+(okn(pk)&&+pk>0?' · heaviest hour '+r1(pk)+' mm':'');
        return okn(pk)?('Rain '+r1(pk)+' mm in the heaviest hour'):''; }
    }catch(_){}
    return ''; }
  AGN.placePopupValue=physText;
  function popHtml(p){ var u=unitRow(p), t=timeText();
    return '<div class="agn-place-pop" data-key="'+esc(p.key)+'"><b class="n">'+esc(p.tehsil||p.district||p.key)+'</b><div class="s">'+esc([p.tehsil&&p.district!==p.tehsil?p.district:null,p.province].filter(Boolean).join(' · '))+'</div>'
      +'<div class="m">'+esc(layerName())+'</div>'
      +(u.word?'<div class="lv">'+(u.swatch?'<i style="background:'+esc(u.swatch)+'"></i>':'')+esc(u.word)+'</div>':'')
      +(u.value?'<div class="m">'+esc(u.value)+'</div>':'')+(u.idx?'<div class="m agn-op-only" data-agn-idx="1">'+esc(u.idx)+'</div>':'')+(t?'<div class="m">Time: '+esc(t)+'</div>':'')
      +((function(){ var dl=(AGN.droughtLines&&p.key!=null)?AGN.droughtLines(p.key):null; return dl&&dl.length?'<div class="m">'+dl.map(esc).join('</div><div class="m">')+'</div>':''; })())    
      +(olOnNow()&&p.province!==IJ()?'<div class="m"><button type="button" class="agn-pop-ol">Full outlook for this tehsil</button></div>':'')+'</div>'; }    
  function olOnNow(){ try{ var o=AGN.olState&&AGN.olState(); return !!(o&&o.id); }catch(_){ return false; } }
  D.addEventListener('click',function(e){ var b=e.target&&e.target.closest&&e.target.closest('.agn-pop-ol'); if(!b) return; var pr=POP&&POP.__agnProps; if(pr&&AGN.olOpenUnit) AGN.olOpenUnit(pr); });
  

  function openPlace(p,ll,o){ if(!p||!window.map||!ll) return null;
    POP=L.popup({autoClose:true,closeOnClick:true,closeButton:true,autoPan:true,maxWidth:290,className:'agn-place-popup'}).setLatLng(ll).setContent(popHtml(p));
    POP.__agnProps=p; POP.__agnUser=true; if(o&&o.allow) POP.__agnAllow=true; POP.openOn(map); return POP; }
  function refreshPop(){ try{ if(POP&&window.map&&map.hasLayer(POP)&&POP.__agnProps) POP.setContent(popHtml(POP.__agnProps)); }catch(_){} }
  AGN.placePopup={ open:openPlace, refresh:refreshPop, current:function(){ return (POP&&window.map&&map.hasLayer(POP))?POP.__agnProps:null; },
    /* v91.17.278.1 · FIX2781 4 · the tehsil's level of the hazard on the map, as the tehsil popup words it (the search pin's popup) */
    level:function(p){ try{ return p?{layer:layerName(), row:unitRow(p), time:timeText()}:null; }catch(_){ return null; } } };
  function wireUnits(){ var L0=dl(); if(!L0||!window.map) return false; if(L0.__agn76) return true; L0.__agn76=1;
    L0.eachLayer(function(l){ l.on('click',function(e){ var on=true; try{ on=!!districtsOn; }catch(_){} if(!on) return; var p=l.feature&&l.feature.properties; if(!p) return;
      SEQ++; pend();    
      var ll=(e&&e.latlng)||l.getBounds().getCenter();
       
      try{ if(AGN.selFocus) AGN.selFocus.focus(ll.lat,ll.lng,{mode:'point',layer:l,popup:false}); }catch(_){}
      openPlace(p,ll); }); });
    return true; }

  

  function wrapStore(){ var A=window.AGN&&AGN.data; if(!A||typeof A.setActive!=='function'||typeof A.get!=='function') return false; if(A.setActive.__agn76) return true;
    var o=A.setActive;
    var w=function(st){ try{ if(st&&st.lat!=null&&st.lon!=null&&isFinite(+st.lat)&&isFinite(+st.lon)){ var g=A.get(), cur=g&&g.activePoint;
          if(g&&(!cur||Math.abs(+cur.lat-st.lat)>1e-4||Math.abs(+cur.lon-st.lon)>1e-4))
            g.activePoint={ name:st.name||'', lat:+st.lat, lon:+st.lon, t:st.t, hum:st.hum, rain:st.rain, wind:st.wind, gust:st.gust, hourly:null, fetchedAt:Date.now(), source:'selection', pending:true }; } }catch(_){}
      return o.apply(this,arguments); };
    w.__agn76=true; A.setActive=w; return true; }
  var SEQ=0, CUR=null, PEND=0, SKIP=0;
  

  function pend(){ PEND=Date.now(); }
  

  var INFLIGHT=0;
  

  function pending(){ return (INFLIGHT>0 && PEND && Date.now()-PEND<90000) || (PEND && Date.now()-PEND<10000); }
  /* v91.17.283.20 · B7: the sequencing steps of the one driveFromPoint (no wrapper): AGN.condGuard (a reading of a superseded place is
     refused) and AGN.driveSeq (the place's sequence number, the in-flight count, the place kept for a reload) */
  function wrapDrive(){ if(AGN.driveSeq) return true;
    { AGN.condGuard=function(pr){ var mine=CUR; if(mine==null) return pr;
        return Promise.resolve(pr).then(function(rec){ if(mine!==SEQ){ var e=new Error('superseded by a newer place'); e.__agnSuperseded=true; throw e; } PEND=0; return rec; }); };
    }
    AGN.driveSeq=function(f,self,args){ var a=args.slice(), name=a[2], distProps=a[5];
      try{ if(distProps&&distProps.tehsil&&(name==null||name===distProps.district)) a[2]=distProps.tehsil; }catch(_){}
      var my=++SEQ, out; CUR=my; pend(); INFLIGHT++; var _done=false, _fin=function(){ if(!_done){ _done=true; INFLIGHT=Math.max(0,INFLIGHT-1); } };
      try{ out=f.apply(self,a); } catch(e0){ _fin(); throw e0; } finally { CUR=null; }
      return Promise.resolve(out).then(function(r){ _fin(); if(my===SEQ) PEND=0;
           
          try{ if(my===SEQ && r && r.ok!==false && !r.refused && a[2] && isFinite(+a[0]) && isFinite(+a[1]) && !/^My location/.test(String(a[2]))) window.sessionStorage.setItem('agn.place', JSON.stringify({lat:+a[0], lon:+a[1], name:String(a[2]), at:Date.now()})); }catch(_){}
          return r; },function(e){ _fin(); if(my===SEQ&&!(e&&e.__agnSuperseded)) PEND=0; throw e; }).catch(function(e){ if(e&&e.__agnSuperseded) return {ok:false,refused:true,superseded:true,error:'a newer place was chosen before this reading arrived'}; throw e; }); };
    try{ if(!window.__agnPlaceRestore){ window.__agnPlaceRestore=1; var _sp=JSON.parse(window.sessionStorage.getItem('agn.place')||'null');
         
        if(_sp && isFinite(_sp.lat) && isFinite(_sp.lon) && _sp.name) (function wait(k){ var L0=null; try{ L0=AGN.flow&&AGN.flow.location&&AGN.flow.location(); }catch(_){}
          if((!L0 || !L0.name || L0.lat==null || pending()) && k<120) return setTimeout(function(){ wait(k+1); },1000);
          if(k>=120) return;
          try{ var lab=D.getElementById('cityLabel'), prev=lab?lab.textContent:''; if(lab){ lab.textContent='Loading '+_sp.name+'\u2026'; }
            var done=false, back=function(){ if(!done&&lab&&/^Loading /.test(lab.textContent)){ lab.textContent=prev; } done=true; };
            setTimeout(back, 90000);
            try{ AGN.__selExpect={lat:+_sp.lat, lon:+_sp.lon, o:{mode:'place',popup:false}}; }catch(_){}    
            Promise.resolve(window.driveFromPoint(_sp.lat,_sp.lon,_sp.name,true)).then(function(r){ try{ if(lab && r && r.ok!==false && !r.refused){ lab.textContent=_sp.name; done=true; } else back(); }catch(_){} }, back); }catch(_){} })(0); } }catch(_){}
    AGN.selection={ seq:function(){ return SEQ; }, pending:function(){ return !!pending(); }, skipped:function(){ return SKIP; } }; return true; }
  var LIVE_AT=null;
  /* v91.17.283.20 · B7: the selection gate of the one selectCity (no wrapper): false = a programmatic select during the user's own pick */
  function wrapSelect(){ if(AGN.cityGate) return true;
    AGN.cityGate=function(id){ var u=userNow(); if(!u&&pending()){ SKIP++; return false; }
      try{ if(id!=='__live'&&u){ SEQ++; PEND=0; } }catch(_){}    
      try{ if(id==='__live'&&window.LIVE_HOURLY){ var s=(window.STATIONS||[]).find(function(x){ return x.id==='__live'; });
          var k=s?(+s.lat).toFixed(4)+','+(+s.lon).toFixed(4):null; if(k&&k!==LIVE_AT){ if(LIVE_AT!=null) delete window.LIVE_HOURLY.__live; LIVE_AT=k; } } }catch(_){}
      return true; };
    return true; }

   
  function olTag(){ try{ var pk=D.getElementById('mapHazardPick'); if(!pk) return; var wrap=pk.closest('.fill-wrap')||pk.parentNode, t=D.getElementById('agnOlTag');
      if(!t){ t=D.createElement('span'); t.id='agnOlTag'; t.setAttribute('role','status'); pk.insertAdjacentElement('afterend',t);
        t.addEventListener('click',function(e){ if(e.target&&e.target.tagName==='BUTTON'&&AGN.olClear) AGN.olClear(); }); }
      var o=AGN.olState&&AGN.olState(), on=!!(o&&o.id&&o.data&&o.data.ready);
      t.classList.toggle('on',on); if(wrap&&wrap.classList) wrap.classList.toggle('agn-ol-under',on);
      t.innerHTML=on?('<span>Outlook: '+esc(o.data.title||o.id)+'</span><button type="button" aria-label="Clear the outlook layer" title="Clear the outlook layer">×</button>'):'';
      if(on) t.title='The map shows the outlook layer "'+(o.data.title||o.id)+'"; the hazard layer in the picker is underneath it';
    }catch(_){} }

  

  function tableHtml(){ var o=null; try{ o=AGN.olState&&AGN.olState(); }catch(_){} var ol=!!(o&&o.id&&o.data&&o.data.ready);
    var L0=dl(), rows=[], c=[0,0,0,0,0], na=0, nd=0, ld=0, ij=IJ(); if(!L0) return '';
    var h=H(), key=h&&h.currentKey?h.currentKey():null;
    if(!ol&&!key) return '<div class="a11y-cap">'+esc(layerName())+': this layer has no level key, so the table has nothing to list.</div>';
    L0.eachLayer(function(l){ var p=l.feature&&l.feature.properties; if(!p||p.key==null||p.province===ij) return; var u=unitRow(p);
       
      if(u.ord!=null&&u.ord>=0&&u.ord<5) c[u.ord]++; else if(u.word==='Cannot occur here'||u.word==='Unfilled') na++; else if(/^Loading/.test(u.word||'')) ld++; else nd++;
      rows.push({n:p.tehsil||p.district||p.key,d:p.district||'',pv:p.province||'',u:u,o:(u.ord==null?-3:u.ord)}); });
    rows.sort(function(a,b){ return (b.o-a.o)||a.n.localeCompare(b.n); });
    var KW=(function(){ try{ var n=D.getElementById('v3legend'), r=n?n.querySelectorAll('.agn-hz5-row b'):[]; if(r.length>=5){ var k=[0,1,2,3,4].map(function(i){ return String(r[i].textContent||'').trim(); }); if(k.every(Boolean)) return k; } }catch(_){} return W; })();    
    var cnt=KW.map(function(w,i){ return w+' '+c[i]; }).reverse().join(' · ')+(na?' · not applicable '+na:'')+(ld?' · still loading '+ld:'')+(nd?' · no data '+nd:'');
    var t=timeText();
    return '<div class="a11y-cap">'+esc(layerName())+(t&&!ol?' · '+esc(t):'')+' · '+rows.length+' units, the same levels as the map key: '+esc(cnt)+'</div>'
      +'<table><thead><tr><th>Tehsil</th><th>District</th><th>Province</th><th>Level</th><th>Value</th></tr></thead><tbody>'
      +rows.map(function(r){ return '<tr><td>'+esc(r.n)+'</td><td>'+esc(r.d)+'</td><td>'+esc(r.pv)+'</td><td>'+(r.u.swatch?'<i class="sw" style="background:'+esc(r.u.swatch)+'"></i>':'')+esc(r.u.word||'')+'</td><td>'+esc(r.u.value||'')+'</td></tr>'; }).join('')
      +'</tbody></table>'; }
  var tblT=0;
  function table(now){ var box=D.getElementById('mapTable'); if(!box) return false;
    if(!box.__agn76){ box.__agn76=1; box.classList.add('agn-mt76'); var mp=box.closest('.mappanel')||D.querySelector('.mappanel');
      var btn=box.previousElementSibling&&box.previousElementSibling.classList.contains('a11y-toggle')?box.previousElementSibling:null;
      if(mp&&mp.parentNode){ mp.insertAdjacentElement('afterend',box); if(btn){ btn.setAttribute('aria-controls','mapTable'); } }
      if(btn) btn.addEventListener('click',function(){ setTimeout(function(){ table(true); },0); }); }
    if(!box.classList.contains('on')) return true;
    clearTimeout(tblT); tblT=setTimeout(function(){ try{ box.innerHTML=tableHtml(); }catch(_){} },now?0:600); return true; }
  AGN.mapTable={ html:tableHtml, refresh:function(){ table(true); } };

   
  var LOC=null;
  AGN.locLine={ on:function(){ return !!(LOC&&window.map&&map.hasLayer(LOC)); }, layer:function(){ return LOC; } };
  function loadLoc(n){ fetch('/api/map/layer?id=line:loc',{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).then(function(j){
      if(!j||!j.ready||!j.geometry){ if(n<5) setTimeout(function(){ loadLoc(n+1); },4000*(n+1)); return; }
      if(!map.getPane('agnLoc')){ var pn=map.createPane('agnLoc'); pn.style.zIndex=455; }
      var st=j.style||{};
      LOC=L.geoJSON({type:'Feature',properties:j.properties||{},geometry:j.geometry},{pane:'agnLoc',interactive:false,
        style:{color:st.color||'#0C3851',weight:st.weight||1.4,dashArray:st.dashArray||'6 4',opacity:st.opacity!=null?st.opacity:0.95,fill:false,className:'agn-loc-line'}}).addTo(map);
      AGN.locLine.source=j.source; AGN.locLine.label=j.label;
      try{ if(H()&&H().legExtras) H().legExtras(); }catch(_){} }).catch(function(){ if(n<5) setTimeout(function(){ loadLoc(n+1); },4000*(n+1)); }); }

   
  function provScaled(){ var h=H(); if(!h||!h.scaledKey||typeof provLayer==='undefined'||!window.map) return;
    var L0=dl(); if(!L0||!map.hasLayer(provLayer)) return; var ij=IJ(), worst={};
    

    var ck=null; try{ ck=h.currentKey?h.currentKey():null; }catch(_){ ck=null; }
    if(map.hasLayer(L0)){ if(ck==null&&!(h.scaledKey()&&h.scaleOf(h.scaledKey()))) return;
      provLayer.eachLayer(function(l){ var pv=l.feature&&l.feature.properties&&l.feature.properties.province; if(pv&&pv!==ij&&l.options.fillOpacity!==0) l.setStyle({fillOpacity:0}); }); return; }
    var k=h.scaledKey(); if(!k||!h.scaleOf(k)) return;
    var _pl=h.scaleOf(k).palette;
    if(_pl){    
      var bag={}; L0.eachLayer(function(l){ var p=l.feature&&l.feature.properties; if(!p||p.province===ij) return; var q=h.unitLevel(p.key); if(q&&q.i!=null) (bag[p.province]=bag[p.province]||[]).push(q.i); });
      provLayer.eachLayer(function(l){ var pv=l.feature&&l.feature.properties&&l.feature.properties.province; if(!pv||pv===ij) return; var a=(bag[pv]||[]).sort(); 
        l.setStyle(!a.length?{fillColor:h.noData.fill,fillOpacity:h.noData.opacity}:{fillColor:_pl[a[Math.floor(a.length/2)]],fillOpacity:.85}); }); return; }
    L0.eachLayer(function(l){ var p=l.feature&&l.feature.properties; if(!p||p.province===ij) return; var q=h.unitLevel(p.key); if(q&&q.i!=null) worst[p.province]=Math.max(worst[p.province]==null?-1:worst[p.province],q.i); });
    provLayer.eachLayer(function(l){ var pv=l.feature&&l.feature.properties&&l.feature.properties.province; if(!pv||pv===ij) return; var i=worst[pv];
      l.setStyle(i==null?{fillColor:h.noData.fill,fillOpacity:h.noData.opacity}:{fillColor:h.fill[i],fillOpacity:h.opacity[i]}); }); }
  function wrapProv(){ var f=window.applyLayerStyle; if(typeof f!=='function') return false; if(f.__agn76) return true;
    var w=function(){ var r=f.apply(this,arguments); try{ provScaled(); }catch(_){} return r; }; Object.keys(f).forEach(function(k){ w[k]=f[k]; }); w.__agn76=true; window.applyLayerStyle=w; return true; }

  var busy=0;
  function onChange(){ clearTimeout(busy); busy=setTimeout(function(){ refreshPop(); table(false); olTag(); },250); }
  ['agn:layer','agn:day','agn:data','agn:national','agn:hazard'].forEach(function(ev){ D.addEventListener(ev,onChange); });
  D.addEventListener('agn:ol',function(){ onChange(); setTimeout(function(){ try{ if(AGN.context&&AGN.context.refresh) AGN.context.refresh(); }catch(_){} },30); });
  D.addEventListener('change',function(e){ if(e.target&&e.target.id==='mapHazardPick') onChange(); },true);

  (function start(n){ var ok=[guardPopups(), wireUnits(), wrapStore(), wrapDrive(), wrapSelect(), wrapProv(), table(false)];
    if(!start.__loc&&window.map&&typeof L!=='undefined'&&map.createPane){ start.__loc=1; loadLoc(0); }
    if(ok.indexOf(false)>=0) return n<240&&setTimeout(function(){ start(n+1); },500);
    olTag(); })(0);
})();
