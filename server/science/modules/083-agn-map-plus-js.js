
(function(){
  

  var PK=[[23.6,60.8],[37.1,77.9]], moved=false, fitting=false;
  function ready(){ return window.map && typeof L!=='undefined' && window.PK_DISTRICTS && document.getElementById('mpMapWrap'); }

  function fit(){ try{ fitting=true; map.invalidateSize({animate:false}); var _lg=document.getElementById('v3legend'), _lw=(_lg&&_lg.offsetParent)?Math.min(270,_lg.getBoundingClientRect().width+32):16; map.fitBounds(PK,{paddingTopLeft:[16,16],paddingBottomRight:[_lw,16],animate:false});     setTimeout(function(){ fitting=false; },50); }catch(_){ fitting=false; } }
  function init(){
    map.on('movestart zoomstart',function(e){ if(!fitting && e && e.hard!==true) {   } });
    map.on('dragstart',function(){ moved=true; }); map.getContainer().addEventListener('wheel',function(){ moved=true; },{passive:true});
    fit(); setTimeout(fit,1500); setTimeout(function(){ if(!moved && !map.__agnRecentred) fit(); },5000);
    

    try{ new ResizeObserver(function(){ if(!moved && !map.__agnRecentred) fit(); }).observe(document.getElementById('map')); }catch(_){}
    ['.leaflet-control-zoom','#mpMapWrap .leaflet-container'].forEach(function(sel){ var el=document.querySelector(sel); if(el) el.addEventListener(sel==='.leaflet-control-zoom'?'click':'dblclick',function(){ moved=true; }); });
     
    var guard=0; map.on('moveend',function(){ if(moved||fitting||map.getZoom()>5||(map._popup&&map.hasLayer(map._popup))) return;     var b=map.getBounds(); if(!b.contains(L.latLng(30.3,69.3))||!b.contains(L.latLng(25.5,67))){ clearTimeout(guard); guard=setTimeout(fit,120); } });
    

    var touched=false; ['pointerdown','keydown','wheel','touchstart'].forEach(function(t){ document.addEventListener(t,function(e){ if(e&&e.isTrusted!==false) touched=true; },{capture:true,passive:true}); });
    var fitZ=null; map.on('moveend',function(){ if(fitting){ fitZ=map.getZoom(); return; } if(touched||moved) return;
       
      if(map.__agnRecentred&&Date.now()-map.__agnRecentred<10000) return;
      var b=map.getBounds(); var c=map.getCenter();
      

      if(!b.contains(L.latLng(35.5,74.5))||!b.contains(L.latLng(25.0,62.5))||!b.contains(L.latLng(24.8,67.0))||(fitZ!=null&&map.getZoom()!==fitZ)||(b.getEast()-b.getWest())>40||c.lng<63||c.lng>80||c.lat<25||c.lat>36){ clearTimeout(guard); guard=setTimeout(fit,60); } });
     
    [3000,8000,15000].forEach(function(t){ setTimeout(function(){ if(touched||moved||(map.__agnRecentred&&Date.now()-map.__agnRecentred<10000)) return; var c=map.getCenter(), b=map.getBounds();
      if((b.getEast()-b.getWest())>40||c.lng<63||c.lng>80||c.lat<25||c.lat>36){ try{ map.invalidateSize(false); }catch(_){} fit(); } },t); });
    window.AGN=window.AGN||{}; AGN.mapFit=fit; AGN.mapTouched=function(){ return touched; };
    function declutter(){ document.getElementById('map').classList.toggle('agn-national', map.getZoom()<=5); }
    map.on('zoomend',declutter); declutter();
    dedupeToast();
    mountControl();
    wireLegendFold(); ensureBasemap(0);     setTimeout(function(){ ensureBasemap(30); },8000);
  }
  function dedupeToast(){
    (function wrap(n){ if(!window.AGN||typeof AGN.writeRefusal!=='function') return n<60&&setTimeout(function(){wrap(n+1);},500);
      if(AGN.writeRefusal.__agnOnce) return; var orig=AGN.writeRefusal, seen={};
      var w=function(store,why){ var k=store+'|'+String(why||'').slice(0,80), now=Date.now();
        if(/exploratory screen|no asset is selected|no decision case/.test(String(why||'')) && (!(window.AGN&&AGN.operator&&AGN.operator()) || (seen[k] && now-seen[k]<30*60000))){     try{ console.info('[AGN] '+why); }catch(_){} return null; }
        seen[k]=now; return orig.apply(this,arguments); };
      w.__agnOnce=true; w.__agnClean=orig.__agnClean; AGN.writeRefusal=w; })(0);
  }

   
  

  var S={id:null,i:0,data:null,layer:null,cat:null,seq:0,loading:false,err:null};
  function esc(v){ return String(v==null?'':v).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function get(p){ return fetch(location.origin+p,{cache:'no-store'}).then(function(r){return r.ok?r.json():null;}).catch(function(){return null;}); }
  function IJ(){ try{ return IIOJK; }catch(_){ return window.IIOJK||null; } }
  function H5(){ return (window.AGN&&AGN.hz5)||null; }
   
  function chanceClasses(){ try{ var o=H5()&&H5().scales&&H5().scales.outlookChance; if(!o||!o.classes||!o.classes.length) return null;
      var W=H5().words; for(var i=0;i<o.classes.length;i++){ if(W.indexOf(o.classes[i].level)<0) return null; } return o; }catch(_){ return null; } }
  function chanceClass(oc,v){ if(v==null||!isFinite(v)) return null; var C=oc.classes; for(var k=C.length-1;k>=0;k--){ if(v>=C[k].min) return k; } return 0; }
  function chanceLv(v){ var oc=chanceClasses(); if(!oc) return null; var k=chanceClass(oc,v); return k==null?null:H5().words.indexOf(oc.classes[k].level); }
  var SCW=0;    
  function ensureScales(cb){ if(chanceClasses()) return cb(); if(SCW) return; SCW=1;
    get('/api/map/layer?id=scales:map').then(function(j){ SCW=0; if(j&&j.ready&&j.layers&&H5()){ H5().scales=H5().scales||j; } if(chanceClasses()) cb(); else { S.err='scale'; draw(); } }); }
  var PMC=['#35682B','#b3a51f','#e08a1e','#c0392b','#7b1e5a','#4a0e0e'], DSP=['#35682B','#b3a51f','#e08a1e','#b3261e'];
  

  function divColor(v,range,pal){ var t=Math.max(-1,Math.min(1,v/range)); if(Math.abs(t)<1/6) return '#74c476';
    var warm=pal==='rain'?[33,102,172]:[178,24,43], cool=pal==='rain'?[140,81,10]:[33,102,172];
    var c=t>=0?warm:cool, a=0.3+0.7*(Math.abs(t)-1/6)/(5/6); var r=Math.round(247+(c[0]-247)*a), g=Math.round(247+(c[1]-247)*a), b=Math.round(247+(c[2]-247)*a); return 'rgb('+r+','+g+','+b+')'; }
  

  var DUSTLV=[0,2,3,4];    
  function isCat(d){ return !!(d&&(d.type==='classes4'||d.type==='dust'||d.type==='levels')&&H5()); }
  function catLv(d,v){ if(!isCat(d)||v==null) return null;
    if(d.type==='dust'){ var C=d.classes||[], k=0; for(;k<C.length-1;k++){ if(C[k].max!=null&&v<=C[k].max) break; } return DUSTLV[Math.min(3,k)]; }
    if(d.type==='levels'){ var L=d.classes||[], j=0; for(;j<L.length-1;j++){ if(L[j].max!=null&&v<L[j].max) break; } var w=H5().words.indexOf(L[j]&&L[j].level); return w<0?null:w; }    
    var i=H5().catLevel((d.labels||[])[v]); return i!=null?i:Math.max(0,Math.min(4,Number(v)||0)); }
  function lvOf(d,v){ if(!d||v==null) return null; if(d.type==='chance') return chanceLv(v); return catLv(d,v); }
  function catWords(d){ var o=[[],[],[],[],[]];
    if(d.type==='dust') (d.classes||[]).forEach(function(c,k){ o[DUSTLV[Math.min(3,k)]].push(c.label); });
    else if(d.type==='levels') (d.classes||[]).forEach(function(c){ var w=H5().words.indexOf(c.level); if(w>=0) o[w].push(c.label); });
    else (d.labels||[]).forEach(function(l,k){ var i=catLv(d,k); if(i!=null) o[i].push(l); });
    return o; }
  function colorOf(d,v){
    if(v==null) return null;
    var _lv=lvOf(d,v); if(_lv!=null) return H5().fill[_lv];
    if(d.type==='chance') return null;    
    if(d.type==='pm25'){ var k=0; for(;k<d.classes.length-1;k++){ if(d.classes[k].max!=null&&v<=d.classes[k].max) break; } return PMC[k]; }
    if(d.type==='binary') return v?'#8f1d3a':'#eef2f4';
    if(d.type==='hours') return v<=0?'#f7fbff':v<3?'#d9d9d9':v<6?'#9e9e9e':'#5f5f5f';
    if(d.type==='classes4') return DSP[v]||null;
    if(d.type==='diverging') return divColor(v,d.range,d.palette);
    return null;
  }
  function opaOf(d,v){ var l=lvOf(d,v); return l!=null?H5().opacity[l]:.85; }
   
  function gaps(d){ var W=d.whys||{}, byWhy={}, nd=0, ij=IJ();
    try{ (window.PK_DISTRICTS&&PK_DISTRICTS.features||[]).forEach(function(f){ var p=f.properties||{}; if(p.province===ij||p.uid==null) return; var u=p.uid;
      if(d.values&&d.values[u]!=null) return; if(W[u]) byWhy[W[u]]=(byWhy[W[u]]||0)+1; else nd++; }); }catch(_){}
    return {byWhy:byWhy, nd:nd}; }
  function gapRows(d){ var g=gaps(d), R=d.mask&&d.mask.reason, h='', I='<div><i style="background:'+H5().notApplicable.swatch+'"></i>', P='<div><i style="background:'+H5().noData.swatch+'"></i>';
    var u=function(x){ return ' · '+x; };
    var keys=Object.keys(g.byWhy);
    if(keys.length){ var inMask=R&&g.byWhy[R]?g.byWhy[R]:0, other=0, oth={}; keys.forEach(function(k){ if(k!==R){ other+=g.byWhy[k]; oth[k]=1; } });
      if(inMask) h+=I+'Does not occur here: '+esc(R)+u(inMask)+'</div>';
      if(other){ var ok1=Object.keys(oth), dry=ok1.every(function(k){ return /too small for a percent|climatological mean is/.test(k); });
        h+='<div title="'+esc(ok1.length===1?ok1[0]:'')+'"><i style="background:'+(dry?'rgba(201,182,234,.8)':H5().noData.swatch)+'"></i>'+(dry?'Normally dry this month (a % change means nothing)':esc(ok1.length===1?ok1[0]:'No usable reading'))+u(other)+'</div>'; } }
    if(g.nd) h+='<div data-agn-ol-nd="1"><i style="background:'+H5().noData.swatch+'"></i>No reading'+u(g.nd)+'</div>';
    return h; }
  function legendHtml(d){
    var rows=[], H=H5();
    if(isCat(d)){ var n=[0,0,0,0,0], cw=catWords(d); Object.keys(d.values||{}).forEach(function(u){ var i=catLv(d,d.values[u]); if(i!=null) n[i]++; });
      var cwl=[]; cw.forEach(function(a,i){ a.forEach(function(c){ cwl.push(c+' → '+H.words[i]); }); });
      return '<div class="leg">'+H.words.map(function(w,i){ return '<div data-hz5-level="'+w+'"><i style="background:'+H.swatch[i]+(i<2?';box-shadow:inset 0 0 0 1px rgba(12,56,81,.28)':'')+'"></i>'+w+' · '+n[i]+'</div>'; }).join('')+gapRows(d)+'</div>'
        +'<div class="meta">'+(n[3]+n[4])+' High or Severe · Normal is green'+(cwl.length?' · '+esc(cwl.join(', ')):'')+'.</div>'; }
    if(d.type==='chance'){ var oc=chanceClasses(); if(!oc) return '<div class="leg"><div>Loading the level scale…</div></div>';
      var cn=oc.classes.map(function(){ return 0; }); Object.keys(d.values||{}).forEach(function(u){ var k=chanceClass(oc,d.values[u]); if(k!=null) cn[k]++; });
      return '<div class="leg">'+oc.classes.map(function(c,k){ var i=H.words.indexOf(c.level);
          return '<div data-hz5-level="'+esc(c.level)+'"><i style="background:'+H.swatch[i]+(i<2?';box-shadow:inset 0 0 0 1px rgba(12,56,81,.28)':'')+'"></i>'+c.min+'–'+c.max+'% · '+esc(c.label||c.level)+' · '+cn[k]+'</div>'; }).join('')+gapRows(d)+'</div>'
        +'<div class="meta">Share of forecast members that show the event: '+esc(oc.classes.map(function(c){ return c.min+'–'+c.max+'% '+(c.label||c.level); }).join(', '))+'. A chance, not a hazard level; darker means more likely.</div>'; }
    else if(d.type==='pm25') d.classes.forEach(function(c,i){ rows.push([PMC[i],c.label+(c.max!=null?' (≤'+c.max+')':'')]); });
    else if(d.type==='binary') rows=[['#8f1d3a','Smog day'],['#eef2f4','No']];
    else if(d.type==='hours') rows=[['#f7fbff','0 h'],['#d9d9d9','1–2 h'],['#9e9e9e','3–5 h'],['#5f5f5f','6+ h']];
    else if(d.type==='classes4') d.labels.forEach(function(l,i){ rows.push([DSP[i],l]); });
    else if(d.type==='diverging'){ var rn=d.palette==='rain', R6=Math.round(d.range/6*10)/10;
      rows.push([divColor(-d.range,d.range,d.palette),(rn?'Much drier · ':'Much colder · ')+'−'+d.range+' '+d.unit]);
      rows.push([divColor(-0.5*d.range,d.range,d.palette),(rn?'Drier · ':'Colder · ')+'−'+(d.range/2)+' '+d.unit]);
      rows.push(['#74c476','Near normal · within ±'+R6+' '+d.unit]);
      rows.push([divColor(0.5*d.range,d.range,d.palette),(rn?'Wetter · ':'Warmer · ')+'+'+(d.range/2)+' '+d.unit]);
      rows.push([divColor(d.range,d.range,d.palette),(rn?'Much wetter · ':'Much warmer · ')+'+'+d.range+' '+d.unit]); }
    return '<div class="leg">'+rows.map(function(x){ return '<div><i style="background:'+x[0]+'"></i>'+esc(x[1])+'</div>'; }).join('')+gapRows(d)+'</div>';
  }
  function mountControl(){
    var tools=document.querySelector('#mpMapWrap .maptools'); if(!tools||document.getElementById('agnOlMapBtn')) return;
    var b=document.createElement('button'); b.id='agnOlMapBtn'; b.type='button'; b.textContent='Outlook layers'; b.title='Colour the map by the 15-day, weeks-ahead, seasonal or air-quality outlook';
    tools.appendChild(b);
    var p=document.createElement('div'); p.id='agnOlMap'; document.getElementById('mpMapWrap').appendChild(p);
    b.onclick=function(){ p.classList.toggle('open'); if(p.classList.contains('open')&&!S.cat) loadCat(); else draw(); };
    p.addEventListener('toggle',function(e){ if(e.target&&e.target.id==='agnOlMore') S.moreOpen=!!e.target.open; },true);
    document.addEventListener('agn:operator',function(){ if(p.classList.contains('open')) draw(); });
    p.addEventListener('change',function(e){ if(e.target.id==='agnOlSel'||e.target.id==='agnOlSelMore'){ var v=e.target.value||null;
        if(!v){ S.id=null; clear(); draw(); return; }    
        S.id=v; S.i=/^day:/.test(S.id)?1:/^air:/.test(S.id)?1:/^week:/.test(S.id)?2:/^month:/.test(S.id)?1:0; load(); } });
    p.addEventListener('click',function(e){ var i=e.target.getAttribute&&e.target.getAttribute('data-i'); if(i!=null){ S.i=+i; load(); } if(e.target.classList.contains('x')) p.classList.remove('open'); if(e.target.id==='agnOlClear'){ S.id=null; clear(); draw(); } if(e.target.id==='agnOlRetry'){ if(!S.cat) loadCat(); if(S.id) load(); } });
  }
  

  var OL_MAIN=['ev:heatSpell','ev:coldSpell','ev:rain3_75','ev:rain3Local','ev:heavySnow','day:gu60','air:dust','air:pm25','week:t','week:p','month:t','month:p'];
  var OL_PFX={'day:gu60':'Wind · ','air:dust':'Air · ','air:pm25':'Air · ','week:t':'Weeks ahead · ','week:p':'Weeks ahead · ','month:t':'Season ahead · ','month:p':'Season ahead · '};
  function olOp(){ try{ return !!(window.AGN&&AGN.operator&&AGN.operator()); }catch(_){ return false; } }
  function olItems(){ var o=[]; (S.cat||[]).forEach(function(g){ (g.items||[]).forEach(function(it){ o.push({id:it[0],label:it[1],group:g.group}); }); }); return o; }
  function olCustOpts(){ var all=olItems(), by={}; all.forEach(function(x){ by[x.id]=x; });
    var main=OL_MAIN.filter(function(id){ return by[id]; }).map(function(id){ var x=by[id]; return '<option value="'+esc(id)+'"'+(id===S.id?' selected':'')+'>'+esc((OL_PFX[id]||'')+x.label)+'</option>'; }).join('');
    var rest=all.filter(function(x){ return OL_MAIN.indexOf(x.id)<0; }).map(function(x){ var on=x.id===S.id; return '<option value="'+esc(x.id)+'"'+(on?' selected':' hidden')+'>'+esc(x.label)+'</option>'; }).join('');
    return '<option value="">None (hazard screening map)</option><optgroup label="Main">'+main+'</optgroup>'+(rest?'<optgroup label="From More" data-agn-more="1"'+((S.id&&OL_MAIN.indexOf(S.id)<0)?'':' hidden')+'>'+rest+'</optgroup>':''); }
  function olMoreHtml(){ var n=olItems().filter(function(x){ return OL_MAIN.indexOf(x.id)<0; }).length; if(!n) return '';
    var inMore=!!(S.id&&OL_MAIN.indexOf(S.id)<0);
    var opts='<option value=""'+(inMore?'':' selected')+'>Choose a layer…</option>'+(S.cat||[]).map(function(g){ var its=(g.items||[]).filter(function(it){ return OL_MAIN.indexOf(it[0])<0; }); if(!its.length) return '';
      return '<optgroup label="'+esc(g.group)+'">'+its.map(function(it){ return '<option value="'+esc(it[0])+'"'+(it[0]===S.id?' selected':'')+'>'+esc(it[1])+'</option>'; }).join('')+'</optgroup>'; }).join('');
    return '<details id="agnOlMore"'+((S.moreOpen||inMore)?' open':'')+'><summary>More outlook layers ('+n+')</summary><select id="agnOlSelMore" aria-label="More outlook layers">'+opts+'</select></details>'; }
  function loadCat(){ get('/api/map/layers').then(function(c){ S.cat=c; if(!c) S.err='catalogue'; draw(); }); }
  function draw(){
    var p=document.getElementById('agnOlMap'); if(!p) return; var d=S.data;
    var opts='<option value="">None (hazard screening map)</option>'+(S.cat||[]).map(function(g){ return '<optgroup label="'+esc(g.group)+'">'+g.items.map(function(it){ return '<option value="'+it[0]+'"'+(it[0]===S.id?' selected':'')+'>'+esc(it[1])+'</option>'; }).join('')+'</optgroup>'; }).join('');
    if(!olOp()&&S.cat) opts=olCustOpts();    
    var h='<h4>Outlook layer <button class="x" aria-label="Close">×</button></h4><select id="agnOlSel" aria-label="Outlook layer">'+opts+'</select>'+((!olOp()&&S.cat)?olMoreHtml():'');
    var retry=' <button id="agnOlRetry" type="button" style="font:600 11px system-ui;border:1px solid #c9d5de;background:#f5f8fa;border-radius:5px;padding:2px 7px;cursor:pointer">Retry</button>';
    if(!S.cat&&S.err==='catalogue') h+='<div class="meta" role="status">The list of outlook layers could not be loaded (the server did not answer).'+retry+'</div>';
    if(S.id&&S.loading) h+='<div class="meta" role="status">Loading…'+(d&&d.ready&&d.id===S.id?' (the map keeps the previous period until it arrives)':'')+'</div>';
    if(S.id&&S.err==='load') h+='<div class="meta" role="status">This outlook could not be loaded (the server did not answer). The map shows the hazard layer.'+retry+'</div>';
    else if(S.id&&S.err==='scale') h+='<div class="meta" role="status">The level scale for chance layers could not be loaded, so the layer is not drawn.'+retry+'</div>';
    if(S.id&&d&&d.ready&&d.id===S.id){
      if(d.periods&&d.periods.length) h+='<div class="per">'+d.periods.map(function(x,i){ return '<button data-i="'+i+'" class="'+(i===d.index?'on':'')+'">'+esc(fmtP(x.label))+'</button>'; }).join('')+'</div>';
      h+='<div class="meta"><b>'+esc(d.title)+'</b>'+(d.valid?' · '+esc(fmtP(d.valid)):'')+' · '+d.count+' of '+(d.units||d.count)+' tehsils carry a value'+(d.uniform?' · every one of them returned '+d.uniform.value+(d.unit?' '+d.unit:'')+' — computed, not missing':'')+'</div>'+legendHtml(d)+locRow()+'<div class="meta">'+esc(d.source||'')+'. Click a tehsil for its level; the popup opens its full outlook.</div>';
      h+='<div style="margin-top:6px"><button id="agnOlClear" type="button" style="font:600 11px system-ui;border:1px solid #c9d5de;background:#f5f8fa;border-radius:5px;padding:3px 8px;cursor:pointer">Clear layer</button></div>';
    } else if(S.id&&d&&!d.ready&&d.id===S.id&&!S.loading) h+='<div class="meta" role="status">'+(d.error==='unknown layer'?'This build publishes no layer called “'+esc(S.id)+'”. Pick one from the list above.':'This outlook has not run yet on the server, so the map shows the hazard layer.')+'</div>';
    p.innerHTML=h;
  }
  function fmtP(s){ s=String(s); if(/^\d{4}-\d{2}-\d{2}$/.test(s)){ var d=new Date(s+'T12:00:00Z'); return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getUTCDay()]+' '+d.getUTCDate()+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]; } if(/^\d{4}-\d{2}$/.test(s)) return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+s.slice(5,7)-1]+' '+s.slice(0,4); return s; }
  function load(){ var my=++S.seq, id=S.id, i=S.i; S.loading=true; S.err=null; draw();
    get('/api/map/layer?id='+encodeURIComponent(id)+'&i='+i).then(function(d){
      if(my!==S.seq||S.id!==id) return;    
      S.loading=false;
      if(!d){ S.err='load'; if(S.data&&S.data.id!==id) S.data=null; if(!S.data||S.data.id!==id) clearPaint(); draw(); return; }
      S.data=d;
      if(d.ready&&d.type==='chance'&&!chanceClasses()){ S.loading=true; draw(); ensureScales(function(){ if(my!==S.seq) return; S.loading=false; draw(); paint(); }); return; }
      draw(); paint(); }); }
  

  function olKey(){ var w=document.getElementById('mpMapWrap'); if(!w) return; var k=document.getElementById('agnOlKey84'), d=S.data;
    if(!(S.layer&&d&&d.ready&&d.id===S.id)){ if(k) k.remove(); return; }
    if(!k){ k=document.createElement('div'); k.id='agnOlKey84'; k.setAttribute('role','region'); k.setAttribute('aria-label','Outlook layer key'); w.appendChild(k); }
    k.innerHTML='<div class="t">'+esc(d.title)+'</div>'+(d.valid?'<div class="v">'+esc(fmtP(d.valid))+'</div>':'')+legendHtml(d); }
  function clearPaint(){ var w=document.getElementById('mpMapWrap'); if(w) w.classList.remove('agn-ol-active'); try{ var _k=document.getElementById('agnOlKey84'); if(_k) _k.remove(); }catch(_){} try{ if(S.layer) map.removeLayer(S.layer); }catch(_){} S.layer=null; }
  function clear(){ S.seq++; S.loading=false; S.err=null; clearPaint(); S.data=null; tips(false); olNotify(); }
  function paint(){
    try{ if(S.layer) map.removeLayer(S.layer); }catch(_){} S.layer=null;
    var d=S.data, w=document.getElementById('mpMapWrap');
    if(!d||!d.ready||d.id!==S.id){ if(w) w.classList.remove('agn-ol-active'); tips(false); olNotify(); return; }    
    if(!map.getPane('agnOutlook')) map.createPane('agnOutlook');
    map.getPane('agnOutlook').style.zIndex=395;    
    map.getPane('agnOutlook').style.pointerEvents='none';
    var ij=IJ();
    S.layer=L.geoJSON(PK_DISTRICTS,{pane:'agnOutlook',interactive:false,
      filter:function(f){ return !(f&&f.properties&&f.properties.province===ij); },    
      style:function(f){ var u=f.properties.uid, v=d.values[u], c=colorOf(d,v);
        if(c) return {stroke:false,fill:true,fillColor:c,fillOpacity:opaOf(d,v)};
        if(v==null&&!(d.whys&&d.whys[u])) return {stroke:false,fill:true,fillColor:H5().noData.fill,fillOpacity:H5().noData.opacity};    
        

        if(d.mask&&d.mask.reason&&(d.whys||{})[u]===d.mask.reason){ try{ H5().notApplicable.patterns(); }catch(_){} return {stroke:false,fill:true,fillColor:'url(#agnNAHatch)',fillOpacity:.75}; }
        if(/too small for a percent|climatological mean is/.test((d.whys||{})[u]||'')) return {stroke:false,fill:true,fillColor:'#c9b6ea',fillOpacity:.6};    
        return {stroke:false,fill:true,fillColor:H5().noData.fill,fillOpacity:H5().noData.opacity}; }    
    }).addTo(map);
    if(w) w.classList.add('agn-ol-active');
    tips(true);
    try{ olKey(); }catch(_){}
    olNotify();
  }
   
  function tipText(p){ var d=S.data; if(!d||!d.ready) return null; var v=d.values[p.uid];
    var val=v==null?((d.whys&&d.whys[p.uid])?d.whys[p.uid]:'No data'):(d.type==='binary'?(v?'smog day':'no'):d.type==='classes4'?d.labels[v]+' · '+H5().words[catLv(d,v)]:d.type==='dust'?v+' '+d.unit+' · '+H5().words[catLv(d,v)]:d.type==='chance'&&lvOf(d,v)!=null?v+'% · '+H5().words[lvOf(d,v)]:(v>0&&d.type==='diverging'?'+':'')+v+' '+d.unit);
    return '<span class="dt-sub">'+esc(d.title)+': '+esc(val)+'</span>'; }
  function tips(on){ var L0=null; try{ L0=districtLayer; }catch(_){ L0=null; } if(!L0) return; var ij=IJ();
    L0.eachLayer(function(l){ var t=l.getTooltip&&l.getTooltip(); if(!t) return; var p=l.feature&&l.feature.properties; if(!p) return;
      if(l.__agnTip==null) l.__agnTip=t.getContent();
      var add=(on&&p.province!==ij)?tipText(p):null;
      l.setTooltipContent(add?String(l.__agnTip)+add:l.__agnTip); }); }


  

  function wireLegendFold(){ var leg=document.getElementById('v3legend'); if(leg&&!leg.__agnMin){ leg.__agnMin=1; leg.title='Click to fold or unfold the legend'; leg.addEventListener('click',function(){ leg.classList.toggle('agn-leg-min'); }); } }
  function olNotify(){ try{ document.dispatchEvent(new CustomEvent('agn:ol',{detail:{id:S.id}})); }catch(_){} }
  window.AGN=window.AGN||{}; AGN.olState=function(){ var on=!!(S.id&&S.layer&&S.data&&S.data.ready&&S.data.id===S.id);
    return { id:on?S.id:null, asked:S.id, loading:S.loading, data:on?S.data:null, layer:S.layer, level:function(v){ return lvOf(S.data,v); }, color:function(v){ return S.data?colorOf(S.data,v):null; }, word:function(v){ var oc=chanceClasses(); if(!oc) return null; var k=chanceClass(oc,v); return k==null?null:(oc.classes[k].label||null); }, classOf:function(v){ var oc=chanceClasses(); if(!S.data||S.data.type!=='chance'||!oc) return null; var k=chanceClass(oc,v); return k==null?null:oc.classes[k].min+'–'+oc.classes[k].max+'%'; } }; };
  AGN.olClear=function(){ S.id=null; clear(); draw(); };    
  AGN.olOpenUnit=function(p){    
    try{ var btn=document.getElementById('agnOutlookBtn'); if(btn) btn.click(); setTimeout(function(){ var tab=/^air:/.test(S.id||'')?'air':/^(week|month):/.test(S.id||'')?'sea':'unit'; var t=document.querySelector('#agnOutlook [data-t="'+tab+'"]'); if(t) t.click(); setTimeout(function(){ var inp=document.getElementById(tab==='air'?'olAirSearch':tab==='sea'?'olSeaSearch':'olSearch'); if(inp){ inp.value=p.tehsil; inp.dispatchEvent(new Event('change')); } },300); },200); }catch(_){} };
  document.addEventListener('agn:ol',function(){ setTimeout(function(){ try{ if(typeof refreshDistrictHazard==='function') refreshDistrictHazard(); }catch(_){} try{ districtLayer.eachLayer(function(l){ districtLayer.resetStyle(l); }); }catch(_){} try{ if(typeof refreshProvinceFill==='function') refreshProvinceFill(); }catch(_){} },0); });    
  function locRow(){ try{ return (AGN.locLine&&AGN.locLine.on())?'<div class="leg"><div><i style="background:none;border:0;border-top:2px dashed #0C3851;height:0;border-radius:0"></i>Line of Control</div></div>':''; }catch(_){ return ''; } }
  function ensureBasemap(n){ try{ var st=AGN.basemap.state(); var stOn=!!(window.AGN&&AGN.streets&&AGN.streets.on()); if(st.configured&&typeof bases!=='undefined'&&!(stOn&&(window.activeLayer||'radar')==='radar')){ var want=bases[window.activeLayer||'radar']||bases.radar; if(want&&!map.hasLayer(want)){ map.eachLayer(function(l){ if(l instanceof L.TileLayer) map.removeLayer(l); }); want.addTo(map); if(want.bringToBack) want.bringToBack(); } return; } }catch(_){}
    if(n<40) setTimeout(function(){ ensureBasemap(n+1); },1000); }

  (function start(n){ if(!ready()) return n<120&&setTimeout(function(){start(n+1);},500); init(); })(0);
})();
