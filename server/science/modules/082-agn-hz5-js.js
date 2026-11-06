
(function(){
  'use strict';
  

  var W=['Normal','Low','Moderate','High','Severe'];
  

  

  var FILL=['#74c476','#ffe680','#fdae61','#e8552d','#a50026'];
  var OPA=[.50,.90,.92,.92,.94];
  var SW=['rgba(116,196,118,.50)','rgba(255,230,128,.90)','#fdae61','#e8552d','#a50026'];
  

  var ND_FILL='#9467c9', ND_OPA=.62, ND_SW='rgba(148,103,201,.62)', ND_OLD='#e5ebf0';
  var NA_ID='agnNAHatch', NA_FILL='url(#agnNAHatch)', NA_SW='repeating-linear-gradient(45deg,#fdf3f7 0 4px,#efb3cf 4px 5px)';
  function naPatterns(){ try{ var ns='http://www.w3.org/2000/svg'; (window.map&&map.getContainer?map.getContainer().querySelectorAll('svg'):[]).forEach(function(svg){
      if(svg.querySelector('#'+NA_ID)) return; var d=svg.querySelector('defs')||svg.insertBefore(document.createElementNS(ns,'defs'),svg.firstChild);
      var p=document.createElementNS(ns,'pattern'); p.setAttribute('id',NA_ID); p.setAttribute('width','10'); p.setAttribute('height','10'); p.setAttribute('patternUnits','userSpaceOnUse'); p.setAttribute('patternTransform','rotate(45)');    
      var r=document.createElementNS(ns,'rect'); r.setAttribute('width','10'); r.setAttribute('height','10'); r.setAttribute('fill','#fdf3f7');
      var l=document.createElementNS(ns,'line'); l.setAttribute('x1','0'); l.setAttribute('y1','0'); l.setAttribute('x2','0'); l.setAttribute('y2','10'); l.setAttribute('stroke','#efb3cf'); l.setAttribute('stroke-width','0.9');
      p.appendChild(r); p.appendChild(l); d.appendChild(p); }); }catch(_){} }
  setInterval(naPatterns,10000); document.addEventListener('agn:dom',naPatterns);
  var HZ=/^(flood|flood_pluvial|flood_riverine|landslide|glof|heat|cold|wind|drought|seismic|cyclone|rain_hz|telco_[a-z]+|ops)$/;
  function isHz(k){ return HZ.test(String(k==null?'':k)); }
  

  function catLevel(c){ if(c==null) return null; c=String(c).toLowerCase().trim();
    if(/^(none|normal|minimal|good|no)$|^inland|outside|^very low|^susceptible \(standing/.test(c)) return 0;        
    if(/^act\b|^severe|^very high|^extreme|inner-delta/.test(c)) return 4;
    if(/^watch\b|^high\b|high-exposure|^very poor/.test(c)) return 3;
    if(/^monitor\b|^moderate|^exposed|^poor|^elevated/.test(c)) return 2;
    if(/^low\b|sheltered|near-coastal|^fair/.test(c)) return 1;
    return null; }
  

  var SCORE_CAT={};
  function levelOf(hz,score,meta){
    if(meta&&meta.notApplicable) return {na:true};
    if(score==null||(meta&&(meta.noData||meta.provisional))) return {nd:true};
    var i=null, cat=meta&&meta.category;
    if(cat==null&&SCORE_CAT[hz]) cat=SCORE_CAT[hz][score];
    if(cat!=null){ i=catLevel(cat); if(meta&&meta.category!=null){ (SCORE_CAT[hz]=SCORE_CAT[hz]||{})[score]=meta.category; } }
    if(i==null){ var b=(typeof window.agnBandOf==='function')?window.agnBandOf(score):null; i=b?b.index:null; }
    return i==null?{nd:true}:{i:i}; }
  

  var RAIN_WET='#6baed6', RAIN_WET_OPA=.60, RAIN_WET_SW='rgba(107,174,214,.60)';
  function rainWet(hz,r,meta){ return hz==='rain_hz' && r && r.i===0 && meta && meta.rainDayP!=null && isFinite(+meta.rainDayP) && +meta.rainDayP>=50; }
  

  var RAIN_EARLY='#c6dbef', RAIN_EARLY_OPA=.80, RAIN_EARLY_SW='rgba(198,219,239,.95)';
  function rainEarly(hz,r,meta){ var s=meta&&meta.rainSplit; return hz==='rain_hz' && r && r.i===0 && !!s && s.pastMm>=1 && s.restMm<0.5; }
  function opacityOf(c){ var cc=String(c||'').toLowerCase(); if(cc===RAIN_WET) return RAIN_WET_OPA; if(cc===RAIN_EARLY) return RAIN_EARLY_OPA; var i=FILL.indexOf(cc); return i<0?null:OPA[i]; }
  window.AGN=window.AGN||{};
  AGN.hz5={ words:W.slice(), fill:FILL.slice(), opacity:OPA.slice(), swatch:SW.slice(), noData:{fill:ND_FILL,opacity:ND_OPA,swatch:ND_SW}, notApplicable:{fill:NA_FILL,opacity:.85,swatch:NA_SW,patterns:naPatterns}, isHazardLayer:isHz, catLevel:catLevel, levelOf:levelOf, opacityOf:opacityOf };

  function layerKey(){ try{ return (typeof currentMapLayer==='function')?currentMapLayer():null; }catch(_){ return null; } }
  function hazardOn(){ try{ return !!districtHazardMode && isHz(layerKey()); }catch(_){ return false; } }
  function dl(){ try{ return (typeof districtLayer!=='undefined')?districtLayer:null; }catch(_){ return null; } }

  

  var SC=null, T0=Date.now(), DSUB='overall';
  

  var HW={heat:['No heat stress (UTCI under 26 °C)','Moderate heat stress (26–32)','Strong heat stress (32–38)','Very strong heat stress (38–46)','Extreme heat stress (46+)'],
          cold:['No or slight cold stress (UTCI above 0 °C)','Moderate cold stress (0 to −13)','Strong cold stress (−13 to −27)','Very strong cold stress (−27 to −40)','Extreme cold stress (below −40)']};
  function wordsOf(hz){ return HW[hz]||W; }
  function scaledKey(){ var aq=false, hm=false, k=layerKey(); try{ aq=!!districtAqiMode; }catch(_){} try{ hm=!!districtHazardMode; }catch(_){}
    if(aq||k==='aqi') return 'aqi'; if(hm&&/^nss_/.test(String(k||''))) return k; if(!hm&&(k===''||k==null)) return 'comfort';
    if(hm&&k==='drought'&&DSUB!=='overall') return 'drought_'+DSUB;    
    return null; }
  function scaleOf(k){ return (SC&&SC.layers&&k&&SC.layers[k])?SC.layers[k]:null; }
  function scaledOn(){ return !!scaleOf(scaledKey()); }
  function cutLevel(sc,v){ if(!sc||v==null||!isFinite(v)) return null; var C=sc.cuts||[]; for(var i=0;i<C.length;i++){ if(C[i].min==null||v>=C[i].min){ var j=(C[i].idx!=null)?C[i].idx:W.indexOf(C[i].level); return j<0?null:j; } } return null; }
  function dayNow(){ try{ return (AGN.day&&AGN.day.get)?(AGN.day.get()||0):0; }catch(_){ return 0; } }
  function unitValue(k,key){
    try{
      if(k==='comfort'){ var c=null; if(dayNow()>0){ var di=(typeof window.__dayInp==='function')?window.__dayInp(key,'heat'):null; c=(di&&typeof window.stationComfort==='function')?window.stationComfort({t:di.t,hum:di.hum,wind:di.wind}):null; }
        else c=(typeof window.districtComfortByName==='function')?window.districtComfortByName(key):null;
        return (c&&c.di!=null&&isFinite(c.di))?{v:Math.round(c.di*10)/10}:{nd:true}; }
      if(/^drought_/.test(k)){ var X=(window.__agnDroughtX||{})[key]; if(!X) return {nd:true};
        var DI=(X.dtype&&X.dtype.indicators)||{}, DT=(X.dtype&&X.dtype.types)||{};
        if(k==='drought_rain'){ if(X.arid) return {na:true}; return DI.rain?{v:DI.rain.band}:{nd:true}; }
        if(k==='drought_soil'){ return DI.soil?{v:DI.soil.band}:{nd:true}; }
        if(k==='drought_crops'){ if(X.vhi==null) return {na:true}; return DI.crops?{v:DI.crops.band}:{nd:true}; }    
        if(k==='drought_water'){ return DT.hydrological!=null?{v:DT.hydrological}:{na:true}; }
        return {nd:true}; }
      if(k==='aqi'){ if(dayNow()>0) return {nd:true}; var r=(window.DISTRICT_IN||{})[key]; return (r&&r.aqi!=null&&isFinite(r.aqi))?{v:Math.round(+r.aqi)}:{nd:true}; }
      var h=(typeof window.districtHazardInfo==='function')?window.districtHazardInfo(key):null;
      if(!h) return {nd:true}; if(h.notApplicable) return {na:true}; if(h.score==null||h.noData||h.provisional) return {nd:true};
       
      var sc0=scaleOf(k); if(sc0&&sc0.value==='physical'){ return (h.physicalValue!=null&&isFinite(h.physicalValue))?{v:Math.round(+h.physicalValue)}:{nd:true}; }
      return {v:Math.round(+h.score)};
    }catch(_){ return {nd:true}; } }
  function scaledLevel(k,key){ var u=unitValue(k,key); if(u.v==null) return u; var i=cutLevel(scaleOf(k),u.v); return (i==null)?{nd:true,v:u.v}:{i:i,v:u.v}; }
  function cutText(sc){ var C=(sc&&sc.cuts)||[], o=[];
    for(var i=0;i<C.length;i++){ var lo=C[i].min, hi=i>0?C[i-1].min:null;
      o.push(C[i].level+' '+(hi==null?(lo==null?'all':lo+' and above'):lo==null?'below '+hi:lo+'–'+hi)); }
    return o.join(', '); }

  

  var LD={k:null,v:false,at:0}, LDONE={}, LPOLL=0;    
  function anyPlaced(k,sc){ var L0=dl(), any=false; if(!L0) return false;
    L0.eachLayer(function(l){ if(any) return; var p=l.feature&&l.feature.properties; if(!p||p.key==null||p.dq===true) return;
      var r; if(sc) r=scaledLevel(k,p.key); else { var h=null; try{ h=districtHazardInfo(p.key); }catch(_){ h=null; } r=h?levelOf(k,h.score,h):{nd:true}; }
      if(r.i!=null||r.na) any=true; });
    return any; }
  function loadingNow(){ var sc=scaledOn(), k=sc?scaledKey():layerKey(); if(!sc&&!hazardOn()) return false;
    var grace=((SC&&SC.loadingGraceS)||180)*1000; if(Date.now()-T0>grace) return false;
    if(LDONE[k]) return false;
    if(LD.k===k&&Date.now()-LD.at<2000) return LD.v;
    var v=!anyPlaced(k,sc); if(!v) LDONE[k]=true; LD={k:k,v:v,at:Date.now()};
    if(v&&!LPOLL){ LPOLL=setTimeout(function(){ LPOLL=0; LD.at=0; if(!loadingNow()) repaint('loaded'); },2100); }    
    return v; }

  

  var SW0={n:-1,at:Date.now(),done:false,sig:''};
  function sweepDone(){ if(SW0.done) return true; var now=Date.now(), grace=((SC&&SC.loadingGraceS)||180)*1000;
    if(now-T0>grace&&now-SW0.at>60000) SW0.done=true;    
    else if(SW0.n>=0&&SW0.of&&(SW0.n>=0.99*SW0.of||(SW0.n>0&&now-SW0.at>60000))) SW0.done=true;
     
    if(SW0.done){ try{ setTimeout(function(){ document.dispatchEvent(new CustomEvent('agn:sweep-done')); },0); }catch(_){} }
    return SW0.done; }
  function pendingUnit(k){ return !sweepDone(); }
  

  var DW0=Date.now();
  function dWait(hz){ if(hz!=='drought') return false; var d=window.__agnDroughtNat; return !d && Date.now()-DW0<180000; }
  AGN.hz5.pending=pendingUnit; AGN.hz5.sweep=function(){ return {placed:SW0.n, of:SW0.of, since:SW0.at, done:sweepDone()}; };
   
  (function watch(){ var first=true, ep=0, seen={k:null,ep:-1,at:0};
    

    ['agn:data','agn:national','agn:day','agn:layer','agn:enriched','agn:drought-national','agn:sweep-done','agn:clim-anchors'].forEach(function(n){ document.addEventListener(n,function(){ ep++; }); });
    function tick(){ var k=null; try{ k=currentKey(); }catch(_){}
      if(k&&SW0.done&&k===seen.k&&ep===seen.ep&&Date.now()-seen.at<60000){ setTimeout(tick,10000); return; }
      if(k){ seen.k=k; seen.ep=ep; seen.at=Date.now(); try{ var t=tally(k), placed=t.c[0]+t.c[1]+t.c[2]+t.c[3]+t.c[4]+t.na, of=placed+t.nd+t.pend;
        if(!SW0.done){ if(placed!==SW0.n){ SW0.n=placed; SW0.at=Date.now(); } SW0.of=of; }
        var sig=k+'|'+t.c.join(',')+'|'+t.na+'|'+t.nd+'|'+t.pend+'|'+sweepDone();
        if(sig!==SW0.sig){ var was=SW0.sig; SW0.sig=sig; if(!first&&was) repaintQuiet(); } first=false; }catch(_){} }
      setTimeout(tick, SW0.done?10000:2000); }
    setTimeout(tick,2000); })();

   
  function tally(hz){
    var t={hz:hz,c:[0,0,0,0,0],na:0,nd:0,pend:0,wet:0,early:0,list:[],cats:{},at:Date.now()}, L0=dl(); if(!L0) return t;
    var IJ=null; try{ IJ=IIOJK; }catch(_){}
    var sk=scaleOf(hz)?hz:null;    
    L0.eachLayer(function(l){ var p=l.feature&&l.feature.properties; if(!p||p.key==null) return;
      if(IJ!=null&&p.province===IJ) return;                        
      if(p.dq===true){ t.nd++; return; }
      if(sk){ var q=scaledLevel(sk,p.key); if(q.na){ t.na++; return; } if(q.i==null){ if(pendingUnit(p.key)) t.pend++; else t.nd++; return; } t.c[q.i]++;
        if(q.i>=3&&!scaleOf(sk).palette) t.list.push({key:p.key,name:p.tehsil||p.district||p.key,sub:[p.district,p.province].filter(Boolean).join(' · '),i:q.i}); return; }
      var h=null; try{ h=districtHazardInfo(p.key); }catch(_){ h=null; }
      if(!h){ if(pendingUnit(p.key)) t.pend++; else t.nd++; return; }
      if(dWait(hz)){ t.pend++; return; }
      var r=levelOf(hz,h.score,h); if(r.na){ t.na++; return; } if(r.nd){ if(pendingUnit(p.key)) t.pend++; else if(hz==='flood_riverine'&&!h.provisional) t.na++; else t.nd++; return; }
      if(rainEarly(hz,r,h)) t.early++; else if(rainWet(hz,r,h)) t.wet++; else t.c[r.i]++;    
      if(h.category!=null) (t.cats[r.i]=t.cats[r.i]||{})[String(h.category)]=1;
      if(r.i>=3) t.list.push({key:p.key,name:p.tehsil||p.district||p.key,sub:[p.district,p.province].filter(Boolean).join(' · '),i:r.i}); });
    t.list.sort(function(a,b){ return (b.i-a.i)||String(a.name).localeCompare(String(b.name)); });
    t.loading=(t.c[0]+t.c[1]+t.c[2]+t.c[3]+t.c[4]+t.na===0)&&loadingNow();
    return t; }

   
  function unify(spec,hz){
    var t=tally(hz), cat=Object.keys(t.cats).length>0, lad=[]; try{ lad=(typeof window.agnBandLadder==='function')?window.agnBandLadder():[]; }catch(_){}
    var s={}; for(var k in spec) s[k]=spec[k];
    if(t.loading){    
      s.items=[{color:'transparent',label:'Loading levels…',range:''}]; s.note='The levels appear as the forecast for each unit arrives.'; s.distribution='Loading…';
      t.list=[]; s.__hz5=t; s.__loading=true; return s; }
    

    var sc=scaleOf(hz);
    

    var items=(sc&&sc.palette)?sc.palette.map(function(c,i){ return {color:c, label:(sc.words||[])[i]||W[i], range:String(t.c[i])}; })
             :wordsOf(hz).map(function(w,i){ return {color:SW[i], label:w, range:String(t.c[i])}; });
    if(hz==='rain_hz'&&!sc){ items.push({color:RAIN_WET_SW,label:'Normal, rain day more likely than not',range:String(t.wet)});    
      if(dayNow()===0) items.push({color:RAIN_EARLY_SW,label:'Normal, rained earlier today, little more to come',range:String(t.early||0)}); }    
    if(t.pend) items.push({color:'transparent',label:'Loading\u2026',absent:true,range:String(t.pend)});    
    if(sc){    
      if(t.na) items.push({color:'transparent',label:'Unfilled: cannot occur here',absent:true,range:String(t.na)});
      items.push({color:ND_SW,label:'No data',absent:true,range:t.nd?String(t.nd):'0'}); }
    else (spec.items||[]).forEach(function(it){ if(!it||!it.label) return;
      if(/^Unfilled/.test(it.label)) items.push({color:'transparent',label:it.label,absent:true,range:String(t.na||String(it.range||'').replace(/[^0-9]/g,'')||'')});
      else if(/^No data$/.test(it.label)) items.push({color:ND_SW,label:it.label,absent:true,range:t.nd?String(t.nd):''}); });
    var map=[]; if(cat) for(var i=0;i<5;i++) Object.keys(t.cats[i]||{}).forEach(function(c){ map.push(c+' → '+W[i]); });
    var hs=t.c[3]+t.c[4];
    s.items=items;
    if(sc&&sc.palette&&sc.value==='band'){ s.title=sc.title||s.title; s.unit=''; s.note=(sc.measure||'')+'. '+(sc.bandsText||'')+' '+(sc.classNote||''); }    
    else if(sc&&sc.palette){ s.title=sc.title||s.title; s.unit=''; s.note=sc.measure+'. Classes: '+(sc.cuts||[]).map(function(c,i){ var hi=i>0?sc.cuts[i-1].min:null; return ((sc.words||[])[c.idx!=null?c.idx:i]||c.level)+' '+(hi==null?c.min+' '+(sc.unit||'')+' and above':c.min==null||c.min===0?'below '+hi+' '+(sc.unit||''):c.min+'–'+hi+' '+(sc.unit||'')); }).join(', ')+'. '+(sc.classNote||''); }
    else if(sc){ s.title=sc.title||s.title; s.unit=''; s.note='Level from the '+sc.measure+': '+cutText(sc)+'. Normal is green and Low yellow; orange and red are the units to look at.'; }
    else s.note=(cat?('Map level from the engine class: '+map.join(', ')+'. '):'')+'Normal is green and Low yellow; orange and red are the units to look at. Pink hatched units are where the hazard cannot occur; purple units have no reading.'+(cat&&spec.note?' '+spec.note:'');
    if(sc&&sc.palette){ s.distribution=(sc.words||W).map(function(w,i){ return t.c[i]+' '+w; }).reverse().join(' · ')+(t.pend?' · '+t.pend+' still loading':'')+(t.nd?' · '+t.nd+' no data':''); s.__hz5=t; return s; }
    s.distribution=hs+' High or Severe (check these) · '+t.c[2]+' Moderate · '+t.c[1]+' Low · '+t.c[0]+' Normal'+(t.na?' · '+t.na+' not applicable':'')+(t.pend?' · '+t.pend+' still loading':'')+(t.nd?' · '+t.nd+' unresolved':'');
    s.__hz5=t; return s; }
   
  function currentKey(){ return hazardOn()?layerKey():scaledOn()?scaledKey():null; }
  function unitLevel(key){ try{ var sk=scaledOn()?scaledKey():null; if(sk){ var q0=scaledLevel(sk,key); if(q0.i==null&&!q0.na&&pendingUnit(key)) q0.pending=true; return q0; }
      if(!hazardOn()) return null; var hz=layerKey(), h=null; try{ h=districtHazardInfo(key); }catch(_){ h=null; }
      var r=h?levelOf(hz,h.score,h):{nd:true}; r.v=h?h.score:null; r.cat=h?h.category:null; if(r.nd&&pendingUnit(key)) r.pending=true; return r; }catch(_){ return null; } }
  AGN.hz5.currentKey=currentKey; AGN.hz5.unitLevel=unitLevel; AGN.hz5.tally=function(){ var k=currentKey(); return k?tally(k):null; };
  AGN.hz5.scaleOf=scaleOf; AGN.hz5.scaledKey=scaledKey; AGN.hz5.loading=function(){ return loadingNow(); };
  function loadScales(n){ fetch('/api/map/layer?id=scales:map',{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).then(function(j){
      if(j&&j.ready&&j.layers){ SC=j; AGN.hz5.scales=j; repaint('scales'); } else if(n<6) setTimeout(function(){ loadScales(n+1); },3000*(n+1)); })
    .catch(function(){ if(n<6) setTimeout(function(){ loadScales(n+1); },3000*(n+1)); }); }
  function repaint(){ try{ refreshDistrictHazard(); }catch(_){} try{ if(typeof refreshProvinceFill==='function') refreshProvinceFill(); }catch(_){}
    try{ var ov=AGN.services&&AGN.services.get&&AGN.services.get('overview'); if(ov&&ov.refresh) ov.refresh({reason:'hz5'}); else if(typeof drawLegend==='function') drawLegend(); }catch(_){} }
  AGN.hz5.repaint=repaint;
  

  function repaintQuiet(){ try{ refreshDistrictHazard(); }catch(_){} try{ if(typeof refreshProvinceFill==='function') refreshProvinceFill(); }catch(_){}
    var pp=null, was=null; try{ pp=window.map&&map._popup; if(pp){ was=pp.__agnUser; pp.__agnUser=true; } }catch(_){}
    try{ var ov=AGN.services&&AGN.services.get&&AGN.services.get('overview'); if(ov&&ov.refresh) ov.refresh({reason:'hz5-sweep'}); else if(typeof drawLegend==='function') drawLegend(); }catch(_){}
    try{ if(pp) pp.__agnUser=was; }catch(_){} }
  loadScales(0);

   
  function legExtras(node){ if(!node) return;
    try{ if(window.AGN&&AGN.locLine&&AGN.locLine.on()&&!node.querySelector('.agn-leg-loc')){ var r=document.createElement('div'); r.className='agn-leg-row agn-leg-loc';
        r.innerHTML='<i class="agn-loc-sw" aria-hidden="true"></i><b>Line of Control</b>'; r.title='Line of Control (ceasefire line), not an international boundary';
        var nt=node.querySelector('.agn-leg-valid,.agn-leg-note,.agn-leg-dist,.agn-leg-src'); if(nt) node.insertBefore(r,nt); else node.appendChild(r); } }catch(_){}
    try{ var t=node.querySelector('.t'); if(t&&!t.querySelector('.agn-leg-i')&&node.querySelector('.agn-leg-note,.agn-leg-dist,.agn-leg-valid,.agn-leg-src')){
        var b=document.createElement('button'); b.type='button'; b.className='agn-leg-i'; b.textContent='i'; b.setAttribute('aria-label','About this key: time, method and counts');
        b.setAttribute('aria-expanded',node.classList.contains('agn-leg-more')?'true':'false');
        b.addEventListener('click',function(e){ e.stopPropagation(); var on=node.classList.toggle('agn-leg-more'); b.setAttribute('aria-expanded',on?'true':'false'); });
        t.appendChild(b); } }catch(_){} }
  AGN.hz5.legExtras=function(){ var n=document.getElementById('v3legend'); legExtras(n); try{ relabel84(n); }catch(_){} };    

   
  var CH=null, LI=null, last=null, lastBase=null;
  function host(){ return document.getElementById('mpMapWrap'); }
  function place(){ try{ var h=host(), tb=h&&h.querySelector('.maptools'); if(!h||!CH) return;
      var top=tb?Math.max(12,Math.round(tb.getBoundingClientRect().bottom-h.getBoundingClientRect().top+8)):170;
      CH.style.top=top+'px'; if(LI) LI.style.top=(top+36)+'px'; }catch(_){} }
  function mount(){ var h=host(); if(!h) return false; if(CH) return true;
    CH=document.createElement('button'); CH.type='button'; CH.id='agnCheckChip'; CH.hidden=true; CH.setAttribute('aria-expanded','false');
    CH.title='Places at High or Severe on this layer: click for the list, click a place to zoom to it';
    LI=document.createElement('div'); LI.id='agnCheckList'; LI.hidden=true; LI.setAttribute('role','list');
    h.appendChild(CH); h.appendChild(LI);
    CH.addEventListener('click',function(){ var open=LI.hidden; LI.hidden=!open; CH.setAttribute('aria-expanded',open?'true':'false'); if(open) list(); });
    LI.addEventListener('click',function(e){ var b=e.target.closest&&e.target.closest('button[data-k]'); if(b) zoomTo(b.getAttribute('data-k'),b.getAttribute('data-src')); });
    window.addEventListener('resize',place); return true; }
  function esc(v){ return String(v==null?'':v).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function setChip(t,src){ if(!mount()) return; try{ if(window.AGN&&AGN.quake&&AGN.quake.chipMerge) t=AGN.quake.chipMerge(t); }catch(_){} last=t; if(t) last.src=src||'base';
    if(!t){ CH.hidden=true; LI.hidden=true; CH.removeAttribute('data-count'); return; }
    var n=t.c[3]+t.c[4], _hk=null; try{ _hk=(window.AGN&&AGN.chipFromRun)?AGN.chipFromRun(t,src):null; }catch(_){ _hk=null; }   /* v91.17.283.2 S7 */
    if(_hk){ n=_hk.n; last=Object.assign({},t,{list:_hk.list,src:src||'base'}); }
    CH.title=_hk?_hk.title:'Areas at High or Severe on this layer (page estimate: the issued run for this layer and day is not current): click for the list, click an area to zoom to it';
    CH.hidden=false; CH.classList.toggle('zero',n===0); CH.setAttribute('data-count',String(n));
    

    CH.innerHTML=(_hk&&_hk.layer?'<span class="v2832-lay">'+esc(_hk.layer)+':</span>':'')+'<span class="n">'+n+'</span>'+(_hk?_hk.label:(n===1?'area High or Severe':'areas High or Severe')+'<span class="v2832-est"> · page estimate</span>'); place(); if(!LI.hidden) list(); }
  function list(){ if(!last||!LI) return; var L=last.list||[];
    LI.innerHTML='<div class="h">'+(L.length?(L.length+' area'+(L.length===1?'':'s')+' at High or Severe · click to zoom'):'No area is at High or Severe on this layer.')+'</div>'
      +L.map(function(x){ return '<button type="button" role="listitem" data-src="'+esc(last.src)+'" data-k="'+esc(x.key)+'"><span>'+esc(x.name)+(x.sub?'<br><span class="d">'+esc(x.sub)+'</span>':'')+'</span><span class="lv lv'+x.i+'">'+W[x.i]+'</span></button>'; }).join(''); }
  function zoomTo(k,src){ try{ var tgt=null, grp=(src==='outlook'&&AGN.olState)?AGN.olState().layer:dl(); if(!grp) return;
      grp.eachLayer(function(l){ var p=l.feature&&l.feature.properties; if(!tgt&&p&&(String(p.key)===k||String(p.uid)===k)) tgt=l; });
      if(!tgt||!window.map) return; map.__agnRecentred=Date.now();
      

      var u=tgt; if(src==='outlook'){ var tp=tgt.feature&&tgt.feature.properties, L1=dl(); if(L1&&tp) L1.eachLayer(function(l){ var p=l.feature&&l.feature.properties; if(p&&((tp.uid!=null&&p.uid===tp.uid)||(tp.key!=null&&p.key===tp.key))) u=l; }); }
      if(AGN.selFocus&&u.feature) AGN.selFocus.focusUnit(u,{mode:'place'});
      else map.fitBounds(tgt.getBounds(),{maxZoom:11,padding:[40,40]}); }catch(_){} }

   
  function onOutlook(){ try{ var o=AGN.olState?AGN.olState():null, d=o&&o.data;
      if(!o||!o.id||!d||!d.ready){ setChip(lastBase,'base'); return; }
      var t={c:[0,0,0,0,0],list:[],cats:{}}, any=false;
      if(o.layer) o.layer.eachLayer(function(l){ var p=l.feature&&l.feature.properties; if(!p) return; var v=d.values[p.uid], i=o.level(v); if(i==null) return; any=true; t.c[i]++;
        if(i>=3) t.list.push({key:p.uid,name:p.tehsil||p.district,sub:[p.district,p.province].filter(Boolean).join(' · '),i:i}); });
      t.list.sort(function(a,b){ return (b.i-a.i)||String(a.name).localeCompare(String(b.name)); });
      setChip(any?t:null,'outlook'); }catch(_){} }

   
  var DNA={drought_water:'No snow season and no judged river gauge (unfilled)',drought_crops:'Too little vegetation to read (unfilled)',drought_rain:'Arid: rain index not defined',drought_soil:'Soil record cannot be ranked'};
  function relabel84(node){ if(!node) return;
    var _dk=scaledKey(); if(_dk&&DNA[_dk]){ node.querySelectorAll('.agn-leg-row').forEach(function(r){ var b=r.querySelector('b'); if(b&&/^Unfilled/.test(b.textContent||'')){ b.textContent=DNA[_dk]; if(_dk==='drought_rain') r.classList.add('agn-hz5-na'); else { r.classList.remove('agn-hz5-na'); var sw=r.querySelector('i'); if(sw){ sw.style.background='transparent'; sw.style.border='1px solid #9aa5ad'; } } } else if(b&&/^No data$/.test(b.textContent||'')){ b.textContent='No reading'; r.classList.add('agn-hz5-nd'); } });
      var m0=node.querySelector('.agn-leg-meaning'); if(m0) m0.innerHTML='Each drought type in its own colour; darker is drier. The drought level is on the Combined view.'; return; }
    node.querySelectorAll('.agn-leg-row').forEach(function(r){ var b=r.querySelector('b'); if(!b) return; var t=b.textContent||'';
      if(/^Unfilled/.test(t)){ r.classList.add('agn-hz5-na'); var _rv=layerKey()==='flood_riverine'; b.textContent=_rv?'No modelled river reach (not assessed)':'Does not occur here'; b.title=_rv?'No river reach of the flood model runs through or above this unit, so river flooding is not assessed here. Rain flooding is on the Flood view.':t.replace(/^Unfilled:\s*/,''); }
      else if(/^No data$/.test(t)){ r.classList.add('agn-hz5-nd');
         
        b.textContent='No reading'; } });
    var m=node.querySelector('.agn-leg-meaning'); if(!m){ m=document.createElement('div'); m.className='agn-leg-row agn-leg-meaning';
      var rows=node.querySelectorAll('.agn-leg-row:not(.agn-leg-note):not(.agn-leg-dist):not(.agn-leg-valid):not(.agn-leg-src):not(.agn-leg-meaning)'); var last=rows[rows.length-1];
      if(last&&last.parentNode) last.parentNode.insertBefore(m,last.nextSibling); else node.appendChild(m); }
     
    var _de=document.documentElement, stOn=false, nSw=stOn?'background:transparent;border:1.5px solid #74c476;box-sizing:border-box':'background:'+SW[0];
    var mh='<i style="'+nSw+'"></i>Green'+(stOn?' outline':'')+': checked, normal · '+(layerKey()==='rain_hz'?'<i style="background:'+RAIN_WET_SW+'"></i>Blue: normal, rain likely · '+(dayNow()===0?'<i style="background:'+RAIN_EARLY_SW+'"></i>Pale blue: rained earlier today · ':''):'')+'<i style="background:'+ND_SW+'"></i>Purple: no reading · <i style="background:'+NA_SW+'"></i>Pink hatch: cannot happen here';
    try{ if(layerKey()==='drought'&&DSUB==='overall'){ var V0=window.__agnDroughtViews||{}, P0=dTypePal(), PL=(V0.types&&V0.types.scheme&&V0.types.scheme.plain)||{};
        /* v91.17.274 integration: the drought key in three short lines (type, colours, outline + 15-day arrows) */
        var OL=(V0.outlook&&V0.outlook.shown)?' \u00b7 <b style="color:#8a3b12">\u25B2</b> worse <b style="color:#2f8f86">\u25BC</b> easing':'', SN={meteorological:'Rain',agricultural:'Soil, crops',hydrological:'Water'};
        if(P0){ mh+='<br><b>Colour: drought type</b>'+OL+'<br>'+['meteorological','agricultural','hydrological'].map(function(t){ return '<i style="background:'+P0[t][2]+'" title="'+esc2((PL[t]||t)+' ('+t+' drought)')+'"></i>'+SN[t]; }).join(' ')
          +'<br><i style="background:transparent;border:2px solid '+P0.agricultural[2]+';box-sizing:border-box"></i>Outline: signs, level Low'; }
        else if(OL) mh+='<br>'+OL.slice(3); 
        /* the level rows show the three type hues at that level, so the key matches the map */
        if(P0){ var lr=node.querySelectorAll('.agn-hz5-row'); for(var li=1;li<5&&li<lr.length;li++){ var sw=lr[li].querySelector('i'); if(sw) sw.style.background='linear-gradient(90deg,'+P0.meteorological[li-1]+' 0 34%,'+P0.agricultural[li-1]+' 34% 67%,'+P0.hydrological[li-1]+' 67%)'; } } } }catch(_){}    
    if(m.innerHTML!==mh) m.innerHTML=mh; }    
   
  function hook(){
    var L0=dl(); if(typeof window.hazardFillFor!=='function'||!L0||!window.AGN||!AGN.ui||!AGN.ui.legend||!AGN.ui.legend.render) return false;
    if(!window.hazardFillFor.__hz5){ var orig=window.hazardFillFor;
      var f=function(hz,score,meta){ if(!isHz(hz)||score==null||(meta&&(meta.notApplicable||meta.noData))) return orig.apply(this,arguments);
        var r=levelOf(hz,score,meta); if(rainEarly(hz,r,meta)) return RAIN_EARLY; if(rainWet(hz,r,meta)) return RAIN_WET; return r.i!=null?FILL[r.i]:orig.apply(this,arguments); };
      f.__hz5=true; window.hazardFillFor=f; }
    if(!L0.options.style.__hz5){ var st=L0.options.style;
      var g=function(ft){ var s=st.apply(this,arguments), p=ft&&ft.properties, IJ=null; try{ IJ=IIOJK; }catch(_){}
        try{ if(s&&hazardOn()){ var o=opacityOf(s.fillColor); if(o!=null){ s=Object.assign({},s,{fillOpacity:o}); if(o<0.6) s.color='rgba(12,56,81,.38)'; }
          else if(String(s.fillColor||'').toLowerCase()===ND_OLD&&s.fillOpacity>0) s=Object.assign({},s,{fillColor:ND_FILL,fillOpacity:ND_OPA}); } }catch(_){}    
         
        try{ if(s&&p&&p.key!=null&&p.province!==IJ&&scaledOn()){ var q=p.dq===true?{nd:true}:scaledLevel(scaledKey(),p.key);
            var _pl=(scaleOf(scaledKey())||{}).palette;
            if(q.i!=null&&_pl) s=Object.assign({},s,{fillColor:_pl[q.i],fillOpacity:.85,color:'rgba(12,56,81,.38)',dashArray:null});
            else if(q.i!=null) s=Object.assign({},s,{fillColor:FILL[q.i],fillOpacity:OPA[q.i],color:OPA[q.i]<0.6?'rgba(12,56,81,.38)':'#ffffff',dashArray:null});
            else if(q.na&&/^drought_(water|crops)$/.test(scaledKey())) s=Object.assign({},s,{fillOpacity:0,color:'rgba(12,56,81,.30)'});    
            else if(q.na){ naPatterns(); s=Object.assign({},s,{fillColor:NA_FILL,fillOpacity:.75}); }
            else s=Object.assign({},s,{fillColor:ND_FILL,fillOpacity:ND_OPA}); } }catch(_){}
         
        try{ if(s&&p&&p.key!=null&&p.province!==IJ&&p.dq!==true&&hazardOn()&&!scaledOn()){ var hz=layerKey(), hi=districtHazardInfo(p.key);
            if(hi&&hi.notApplicable){ naPatterns(); s=Object.assign({},s,{fillColor:NA_FILL,fillOpacity:.75}); }
            else if(hz==='flood_riverine'&&hi&&!hi.provisional&&(hi.score==null||hi.noData)){ naPatterns(); s=Object.assign({},s,{fillColor:NA_FILL,fillOpacity:.75}); }    
            else if(!hi||hi.score==null||hi.noData||hi.provisional){ s=Object.assign({},s,{fillColor:ND_FILL,fillOpacity:ND_OPA}); } } }catch(_){}
        try{ if(s&&p&&p.key!=null&&p.province!==IJ&&p.dq!==true&&droughtOn()&&DSUB==='overall'){ var tc=dTypeStyle(p.key); if(tc) s=Object.assign({},s,tc); } }catch(_){}
        try{ if(s&&p&&p.province!==IJ&&p.dq!==true&&hazardOn()&&dWait(layerKey())) s=Object.assign({},s,{fillOpacity:0,color:'rgba(12,56,81,.30)'}); }catch(_){}    
         
        try{ if(s&&p&&p.province!==IJ&&p.dq!==true&&(hazardOn()||scaledOn())&&loadingNow()) s=Object.assign({},s,{fillOpacity:0,color:'rgba(12,56,81,.30)'}); }catch(_){}
         
        try{ if(s&&p&&p.key!=null&&p.province!==IJ&&p.dq!==true&&(hazardOn()||scaledOn())&&pendingUnit(p.key)){ var ul=unitLevel(p.key); if(ul&&ul.pending) s=Object.assign({},s,{fillOpacity:0,color:'rgba(12,56,81,.30)'}); } }catch(_){}
        

        try{ var _ol=AGN.olState&&AGN.olState(); if(s&&p&&_ol&&_ol.id&&p.province!==IJ) s=Object.assign({},s,{fill:true,fillOpacity:0,color:'rgba(12,56,81,.38)',opacity:1,dashArray:p.dq===true?s.dashArray:null}); }catch(_){}
        

        try{ var sd=(typeof selectedDistrict!=='undefined')?selectedDistrict:null; if(s&&p&&sd!=null&&p.key===sd) s=Object.assign({},s,{weight:2.6,color:'#0C3851',opacity:1}); }catch(_){}
        return s; };
      g.__hz5=true; L0.options.style=g; }
    

    function basisNote(node){
      var old=node.querySelector('.agn-leg-basis'), on=false, hh='';
      try{ on=hazardOn() && AGN.day && AGN.day.basis && AGN.day.basis()==='current' && (!AGN.day.get || AGN.day.get()===0) && (typeof window.hzDayCapable!=='function' || window.hzDayCapable(layerKey())); }catch(_){ on=false; }
      if(!on){ if(old) old.remove(); return; }
      try{ hh=new Date(Date.now()+5*3600e3).toISOString().slice(11,13)+':00 PKT'; }catch(_){}
      var t='This hour'+(hh?' ('+hh+')':'')+' \u00b7 the published level (Alerts, AI, reports) is today\u2019s peak';
      if(old){ if(old.textContent!==t) old.textContent=t; return; }
      var d=document.createElement('div'); d.className='agn-leg-basis'; d.setAttribute('role','note'); d.textContent=t;
      d.style.cssText='font:600 0.75rem/1.35 Manrope,system-ui,sans-serif;color:#7a4a00;background:#fff4d6;border:1px solid #f0d58a;border-radius:6px;padding:4px 6px;margin:0 0 6px';
      var first=node.querySelector('.agn-leg-row'); if(first&&first.parentNode) first.parentNode.insertBefore(d, first); else node.insertBefore(d, node.firstChild);
    }
    if(!window.__agnBasisNoteL){ window.__agnBasisNoteL=true; document.addEventListener('agn:day', function(){ try{ var n=document.getElementById('v3legend'); if(n) basisNote(n); }catch(_){} }); }
    if(!AGN.ui.legend.render.__hz5){ var rd=AGN.ui.legend.render;
      var R=function(el,spec,name){ var node=(typeof el==='string')?document.getElementById(el):el, uni=null;
        try{ if(node&&node.id==='v3legend'&&name==='map-legend'&&spec&&(hazardOn()||scaledOn())) uni=unify(spec,scaledOn()?scaledKey():hazardOn()?layerKey():scaledKey()); }catch(_){ uni=null; }
         
        try{ if(uni&&AGN.map77&&AGN.map77.plain) uni=AGN.map77.plain(uni,scaledOn()?scaledKey():hazardOn()?layerKey():scaledKey()); }catch(_){}
        var out=rd.call(this,el,uni||spec,name);
         
        try{ if(node&&node.id==='v3legend'&&name==='map-legend'){ var _de2=document.documentElement; _de2.classList.toggle('agn-hz-on', !!(hazardOn()||scaledOn()));
          _de2.classList.toggle('agn-hz-lv', !!(hazardOn()&&!scaledOn())); } }catch(_){}    
        try{ if(node&&node.id==='v3legend'&&name==='map-legend'){
          node.classList.toggle('agn-leg-loading',!!(uni&&uni.__loading)); node.setAttribute('data-hz5-layer',(uni&&(hazardOn()?layerKey():scaledKey()))||'');
          if(uni&&!uni.__loading){ node.setAttribute('data-hz5','1'); var rows=node.querySelectorAll('.agn-leg-row'); for(var i=0;i<5&&i<rows.length;i++){ rows[i].classList.add('agn-hz5-row','agn-hz5-n'+i); rows[i].setAttribute('data-hz5-level',W[i]); }
                 for(var j=5;j<rows.length;j++){ var bt=((rows[j].querySelector('b')||{}).textContent||''); if(/^Unfilled/.test(bt)) rows[j].classList.add('agn-hz5-na'); else if(/^No data$/.test(bt)) rows[j].classList.add('agn-hz5-nd'); else if(/^Loading/.test(bt)) rows[j].classList.add('agn-hz5-pend'); }
                 

                 var _sc99=scaledOn()?scaleOf(scaledKey()):null;
                 try{ if(_sc99&&_sc99.words){ for(var i2=0;i2<5&&i2<rows.length;i2++){ var bb=rows[i2].querySelector('b'); if(bb&&_sc99.words[i2]){ bb.textContent=_sc99.words[i2]; bb.title=W[i2]+' on the national five-level scale'; } } } }catch(_){}
                 lastBase=uni.__hz5; var o=AGN.olState?AGN.olState():null; if(!(o&&o.id)) setChip((_sc99&&_sc99.noChip)?null:lastBase,'base'); }
          else { node.removeAttribute('data-hz5'); lastBase=null; var o2=AGN.olState?AGN.olState():null; if(!(o2&&o2.id)) setChip(null); }
          legExtras(node); try{ if(uni&&AGN.map77&&AGN.map77.legPost) AGN.map77.legPost(node,uni); }catch(_){} try{ relabel84(node); }catch(_){} try{ basisNote(node); }catch(_){} } }catch(_){}
        return out; };
      R.__hz5=true; AGN.ui.legend.render=R; }
    document.addEventListener('agn:ol',function(){ setTimeout(onOutlook,0); });
    try{ refreshDistrictHazard(); }catch(_){}
    try{ if(typeof refreshProvinceFill==='function') refreshProvinceFill(); }catch(_){}
    try{ var ov=AGN.services&&AGN.services.get&&AGN.services.get('overview'); if(ov&&ov.refresh) ov.refresh({reason:'hz5'}); }catch(_){}    
    return true; }

   
  var gesture=0;
  function popups(){ if(!window.map||typeof L==='undefined') return false; if(map.__agnPopPad) return true; map.__agnPopPad=1;
     
    ['pointerdown','mousedown','touchstart','keydown'].forEach(function(t){ map.getContainer().addEventListener(t,function(){ gesture=Date.now(); },{capture:true,passive:true}); });
    map.on('popupopen',function(e){ try{ if(e.popup&&Date.now()-gesture<1500) e.popup.__agnUser=true; }catch(_){} });
    map.on('popupclose',function(e){ try{ if(e.popup) e.popup.__agnUser=false; }catch(_){} });
    map.on('popupopen',function(e){ try{ var pp=e.popup, h=host(), tb=h&&h.querySelector('.maptools'), mc=map.getContainer();
        if(!pp||!tb||!mc||!mc.offsetWidth) return;
        var pad=Math.round(tb.getBoundingClientRect().bottom-mc.getBoundingClientRect().top+10); if(!(pad>0)) return;
        pp.options.autoPan=true; pp.options.autoPanPaddingTopLeft=L.point(12,pad);
        var br=pp.options.autoPanPaddingBottomRight; if(!br) pp.options.autoPanPaddingBottomRight=L.point(12,40);
        if(typeof pp._adjustPan==='function') pp._adjustPan(); }catch(_){} });
    return true; }

  (function start(n){ var a=hook(), b=popups(); if(!(a&&b)) return n<240&&setTimeout(function(){ start(n+1); },500); })(0);

  

  /* v91.17.274 · ONE Drought layer coloured by drought TYPE (server: data/drought-type.json via /api/climatology/drought views.types):
     hue = the main type (meteorological, agricultural, hydrological), shade = the existing drought level (Low .. Severe on the map's scale);
     a tehsil whose level is still Low but shows a type at the active band gets an outline in that type's colour. */
  function dTypePal(){ var V=window.__agnDroughtViews||{}; return (V.types&&V.types.scheme&&V.types.scheme.palette)||null; }
  function dTypeStyle(key){ var X=(window.__agnDroughtX||{})[key], P=dTypePal(); if(!X||!X.dtype||!X.dtype.main||!P||!P[X.dtype.main]) return null;
    var pal=P[X.dtype.main], i=dMapLevel(key);
    if(X.cls&&X.cls!=='Low'){ if(i==null||i<1) return null;
      return {fillColor:pal[Math.min(3,i-1)],fillOpacity:.88,color:'#ffffff',dashArray:null}; }
    /* v91.17.274 integration: the outline marks signs of a type only where the MAP level is Low (index 1); a tehsil at Normal keeps the map's
       own look (it outlined every server class 'Low' tehsil before, i.e. Normal tehsils across Sindh and Balochistan too) */
    if(i===1) return {color:pal[2],weight:1.6,opacity:.95,dashArray:null};
    return null; }
  function dMapLevel(key){ var hi=null; try{ hi=districtHazardInfo(key); }catch(_){} var r=hi?levelOf('drought',hi.score,hi):null; return (r&&r.i!=null)?r.i:null; }
  var DV=[['overall','All types'],['rain','Meteorological'],['soil','Agricultural · soil'],['crops','Agricultural · crops'],['water','Hydrological']]    , DBOX=null, DMK=null;
  function droughtOn(){ try{ return !!districtHazardMode && layerKey()==='drought'; }catch(_){ return false; } }
  function dRepaint(){ repaintQuiet(); try{ var ov=AGN.services&&AGN.services.get&&AGN.services.get('overview'); if(ov&&ov.refresh) ov.refresh({reason:'drought-view'}); else if(typeof drawLegend==='function') drawLegend(); }catch(_){} dMarks(); }
  function dBox(){ var h=host(); if(!h) return null; if(DBOX&&DBOX.isConnected) return DBOX;
    DBOX=document.createElement('div'); DBOX.id='agnDroughtViews'; DBOX.setAttribute('role','group'); DBOX.setAttribute('aria-label','Drought view');
    DBOX.style.cssText='position:absolute;z-index:650;left:12px;top:64px;display:none;gap:2px;background:rgba(255,255,255,.96);border:1px solid #d7dee4;border-radius:10px;padding:3px;box-shadow:0 2px 8px rgba(12,56,81,.12);font:600 12px/1 Inter,system-ui,sans-serif';
    DV.forEach(function(d){ var b=document.createElement('button'); b.type='button'; b.setAttribute('data-dv',d[0]); b.textContent=d[1];
      b.style.cssText='border:0;border-radius:7px;padding:6px 9px;cursor:pointer;background:transparent;color:#0C3851';
      b.addEventListener('click',function(){ DSUB=d[0]; dSync(); dRepaint(); }); DBOX.appendChild(b); });
    h.appendChild(DBOX); return DBOX; }
  function dSync(){ var b=dBox(); if(!b) return; var on=droughtOn(); b.style.display=on?'flex':'none'; if(!on&&DSUB!=='overall'){ DSUB='overall'; }
    [].forEach.call(b.querySelectorAll('button'),function(x){ var sel=x.getAttribute('data-dv')===DSUB; x.setAttribute('aria-pressed',sel?'true':'false'); x.style.background=sel?'#0C3851':'transparent'; x.style.color=sel?'#fff':'#0C3851'; });
    try{ var hp=document.getElementById('mapHazardPick'), ref=(hp&&hp.offsetParent)?hp:(host()&&host().querySelector('.maptools'));
      if(ref){ var hr=host().getBoundingClientRect(), rr=ref.getBoundingClientRect(), top=Math.round(rr.bottom-hr.top+8), left=Math.round(rr.left-hr.left); if(top>0) b.style.top=top+'px'; if(left>=0&&ref===hp) b.style.left=left+'px'; } }catch(_){} }
  function esc2(v){ return String(v==null?'':v).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function dMarks(){ try{ if(!window.map||typeof L==='undefined') return; if(DMK){ map.removeLayer(DMK); DMK=null; } if(!droughtOn()) return;
      var X=window.__agnDroughtX||{}, V=window.__agnDroughtViews||{}, g=L.layerGroup(), n=0;
      if(DSUB==='overall'){
        var C=window.PK_DISTRICT_CENTROIDS||[], showArrow=!!(V.outlook&&V.outlook.shown), A=(V.types&&V.types.activeBand!=null)?V.types.activeBand:null;
        C.forEach(function(c){ var x=X[c.key]; if(!x||c.lat==null||A==null) return; var t='';
          /* v91.17.274 · the type letters are replaced by the type colour; the arrow marks a rain-shortage move across the active band in 15 days */
          var o=x.dtype&&x.dtype.outlook; if(showArrow&&o){ if(o.rainBand15>o.rainBandNow&&o.rainBand15>=A) t+='<b style="color:#8a3b12">\u25B2</b>'; else if(o.rainBand15<o.rainBandNow&&o.rainBandNow>=A) t+='<b style="color:#2f8f86">\u25BC</b>'; }
          if(!t) return; n++;
          g.addLayer(L.marker([c.lat,c.lon],{interactive:false,keyboard:false,icon:L.divIcon({className:'agn-dmark',html:'<div style="font:700 11px/1 Inter,system-ui,sans-serif;color:#3d2a14;text-shadow:0 0 2px #fff,0 0 2px #fff;white-space:nowrap;transform:translate(-50%,-50%)">'+t+'</div>',iconSize:[0,0]})})); });
      } else if(DSUB==='water'){
        var pal=['#eef5fb','#c3dbef','#86b6dc','#4482bd','#174f86'], R=(V.water&&V.water.rivers)||[];
        R.forEach(function(r){ var ok=r.shown&&r.band!=null, col=ok?pal[Math.min(4,r.band)]:'#ffffff';
          var m=L.circleMarker([r.lat,r.lon],{radius:7,weight:2,color:ok?'#0C3851':'#9aa5ad',fillColor:col,fillOpacity:ok?0.95:0.6,dashArray:ok?null:'2,2'});
          m.bindTooltip('<b>'+esc2(r.station)+'</b><br>'+(ok?('River flow, last 30 days: '+Math.round(r.percentile)+'th percentile of 1991-2020 ('+Math.round(r.flow30M3s)+' m\u00b3/s, normal '+Math.round(r.normal30M3s)+')'):esc2(r.why||'not judged here'))+(V.water&&V.water.asOf?'<br>as of '+esc2(V.water.asOf):''),{direction:'top'});
          g.addLayer(m); n++; });
      }
      if(n){ DMK=g.addTo(map); } }catch(_){} }
  document.addEventListener('agn:hazard',function(){ setTimeout(function(){ dSync(); dMarks(); },150); });
  document.addEventListener('agn:drought-national',function(){ setTimeout(function(){ dSync(); dMarks(); },150); });
  setInterval(function(){ var on=droughtOn(), b=DBOX; if(!b||(b.style.display==='flex')!==on){ dSync(); dMarks(); } },1500);
  AGN.droughtView={ get:function(){ return DSUB; }, set:function(v){ if(DV.some(function(d){ return d[0]===v; })){ DSUB=v; dSync(); dRepaint(); } } };
   
  AGN.droughtLines=function(key){ try{ if(!droughtOn()) return null; var x=(window.__agnDroughtX||{})[key], V=window.__agnDroughtViews||{}; if(!x) return null; var out=[];
      /* v91.17.274 · drought type lines from the server's dtype (data/drought-type.json): scientific name + plain words, bands by published classes */
      var d=x.dtype, S=V.types&&V.types.scheme, PL=(S&&S.plain)||{}, WD=(S&&S.scale&&S.scale.words)||[], A=V.types&&V.types.activeBand;
      if(!d){ out.push('Drought type: no reading'); return out; }
      var nm=function(t){ return (PL[t]||t)+' ('+t+' drought)'; }, w=function(b){ return b==null?'no reading':(WD[b]||('band '+b)); };
      out.push(d.main?('Drought type now: '+nm(d.main)+((x.cls==='Low'&&dMapLevel(key)===1)?' \u00b7 level still Low: the rain index and the soil do not both show drought':'')):'Drought type now: none at moderate drought or worse');
      var I=d.indicators||{}, parts=[];
      if(I.rain) parts.push('rain '+w(I.rain.band)+' ('+I.rain.index+' '+(+I.rain.value).toFixed(1)+')');
      if(I.soil) parts.push('soil '+w(I.soil.band)+' ('+Math.round(I.soil.percentile)+'th percentile)');
      if(I.crops) parts.push('crops '+w(I.crops.band)+' (vegetation health '+Math.round(I.crops.vhi)+')');
      if(I.snow) parts.push('snow '+w(I.snow.band)+' ('+Math.round(I.snow.percentile)+'th percentile)');
      if(I.rivers) I.rivers.forEach(function(r){ parts.push('river at '+r.station+' '+w(r.band)+' ('+Math.round(r.percentile)+'th percentile)'); });
      if(parts.length) out.push('Signs: '+parts.join(' \u00b7 '));
      if(!I.snow&&!I.rivers) out.push('Low river and snow water: no snow season here and no judged river gauge in this tehsil');
      if(d.canalFed) out.push('Canal-fed tehsil: crops depend on canal water more than on rain');
      var o=d.outlook;
      if(V.outlook&&V.outlook.shown&&o) out.push('Next 15 days (to '+o.validTo+'): rain shortage '+(o.rainBand15>o.rainBandNow?'getting worse':o.rainBand15<o.rainBandNow?'easing':'no change')+' ('+w(o.rainBand15)+')'+(o.main?' \u00b7 type then: '+nm(o.main):'')+' \u00b7 soil, crops and rivers have no 15-day forecast and are shown as now');
      else out.push('Next 15 days: '+(V.outlook&&V.outlook.stale?'the latest outlook has run out; a new one is awaited':(V.outlook&&V.outlook.why)?'not shown: the outlook did not pass its accuracy check for this time of year':'outlook not available'));
      return out; }catch(_){ return null; } };
})();
