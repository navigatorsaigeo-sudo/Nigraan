
 
(function(){
  'use strict';
  window.AGN=window.AGN||{};
  

  var HATCH='agnIIOJKHatch';
  var PROV_ST={fill:true,fillColor:'url(#'+HATCH+')',fillOpacity:1,color:'#7d8b96',weight:.9,opacity:.9,dashArray:'4 3'};
  var DIST_ST={fill:true,fillColor:'#ffffff',fillOpacity:0,stroke:false,weight:0,opacity:0,dashArray:null};
  function ij(){ try{ return IIOJK; }catch(_){ return window.IIOJK||null; } }
  function pattern(){ try{ var svgs=map.getPanes().overlayPane.querySelectorAll('svg'); svgs.forEach(function(svg){ if(svg.querySelector('#'+HATCH)) return;
      var ns='http://www.w3.org/2000/svg', d=document.createElementNS(ns,'defs'), p=document.createElementNS(ns,'pattern'), l=document.createElementNS(ns,'line');
      p.setAttribute('id',HATCH); p.setAttribute('width','6'); p.setAttribute('height','6'); p.setAttribute('patternUnits','userSpaceOnUse'); p.setAttribute('patternTransform','rotate(45)');
      l.setAttribute('x1','0'); l.setAttribute('y1','0'); l.setAttribute('x2','0'); l.setAttribute('y2','6'); l.setAttribute('stroke','#8f9ca6'); l.setAttribute('stroke-width','1'); l.setAttribute('stroke-opacity','.75');
      p.appendChild(l); d.appendChild(p); svg.insertBefore(d,svg.firstChild); }); return svgs.length>0; }catch(_){ return false; } }
  function pin(l,st){ if(!l||l.__agnIJ) return; l.__agnIJ=st; var o=l.setStyle;
    l.setStyle=function(x){ return o.call(this,Object.assign({},x||{},st)); }; l.setStyle({}); }
  function disputed(){ var IJ=ij(); if(!IJ||typeof provLayer==='undefined'||typeof districtLayer==='undefined'||!window.map) return false;
    pattern();
    provLayer.eachLayer(function(l){ var p=l.feature&&l.feature.properties; if(p&&p.province===IJ) pin(l,PROV_ST); });
    districtLayer.eachLayer(function(l){ var p=l.feature&&l.feature.properties; if(p&&p.province===IJ) pin(l,DIST_ST); });
    return true; }
  AGN.disputedStyle={ hatchId:HATCH, province:PROV_ST, tehsil:DIST_ST, apply:disputed };

   
  var PRI=['Islamabad','Lahore','Karachi','Peshawar','Quetta','Gilgit','Muzaffarabad'], SIDES=['r','l','t','b','rf','lf'];   /* v91.17.277 · rf / lf: beyond an AGN pin standing on the place */
  function capLayer(){ try{ return capitalLayer; }catch(_){ return null; } }
  function hit(a,b,pad){ return !(a.right+pad<=b.left||a.left-pad>=b.right||a.bottom+pad<=b.top||a.top-pad>=b.bottom); }
  function declutter(){ var CL=capLayer(); if(!CL||!window.map) return false; var ms=[];
    CL.eachLayer(function(m){ if(m._icon) ms.push(m); }); if(!ms.length) return false;
    var nm=function(m){ var n=m._icon.querySelector('.cap-name'); return n?n.textContent.trim():''; };
    ms.sort(function(a,b){ var i=PRI.indexOf(nm(a)), j=PRI.indexOf(nm(b)); return (i<0?99:i)-(j<0?99:j); });
    var dots=ms.map(function(m){ var d=m._icon.querySelector('.cap-dot'); return d?d.getBoundingClientRect():null; });
    var pins=[].slice.call(document.querySelectorAll('#map .agn200-pin')).map(function(p){ var r=p.getBoundingClientRect(), w=p.offsetWidth||r.width, cx=(r.left+r.right)/2; return {left:cx-w/2,right:cx+w/2,top:r.top,bottom:r.bottom,width:r.width}; }).filter(function(r){ return r.width>0; });   /* the pin's own width, not the box of its rotated square */
    var placed=[];
    ms.forEach(function(m,k){ var el=m._icon, n=el.querySelector('.cap-name'); if(!n) return; var ok=null;
      el.classList.remove('agn-cap-hide');
      for(var s=0;s<SIDES.length&&!ok;s++){ SIDES.forEach(function(x){ el.classList.remove('agn-cap-'+x); }); el.classList.add('agn-cap-'+SIDES[s]);
        var r=n.getBoundingClientRect(), free=!placed.some(function(p){ return hit(r,p,2); }) && !dots.some(function(d,i){ return i!==k&&d&&hit(r,d,1); }) && !pins.some(function(p){ return hit(r,p,1); });
        if(free) ok=r; }
      if(ok){ placed.push(ok); el.setAttribute('data-cap-side',el.className.match(/agn-cap-(rf|lf|[rltb])\b/)[1]); }
      else { SIDES.forEach(function(x){ el.classList.remove('agn-cap-'+x); }); el.classList.add('agn-cap-r','agn-cap-hide'); el.setAttribute('data-cap-side','hidden'); } });
    chips(placed.concat(dots.filter(Boolean), pins));
    return true; }
  /* v91.17.277 · L1 · temperature chips never sit on a place name or an AGN pin: each chip (the selected one first) keeps its place when
     free, else takes the nearest free slot one chip-height above or below or half a chip-width aside, else yields (hidden) until the
     map is zoomed in far enough to make room. Names and pins mark true positions and do not move for a chip. */
  function chips(block){ var taken=block.slice();
    var cs=[].slice.call(document.querySelectorAll('#map .leaflet-marker-pane .wx-pin')); cs.forEach(function(c){ c.style.translate=''; c.classList.remove('agn-chip-yield'); });
    cs.sort(function(a,b){ return (b.classList.contains('sel')?1:0)-(a.classList.contains('sel')?1:0); });
    cs.forEach(function(c){ var bd=c.querySelector('.body')||c, r=bd.getBoundingClientRect(); if(!r.width) return; var w=r.width+2, h=r.height+2, got=null;
      [[0,0],[0,-h],[0,h],[w/2,0],[-w/2,0],[w/2,-h],[-w/2,-h],[w/2,h],[-w/2,h]].some(function(o){ var q={left:r.left+o[0],right:r.right+o[0],top:r.top+o[1],bottom:r.bottom+o[1]};
        if(taken.some(function(t){ return hit(q,t,1); })) return false; got={o:o,q:q}; return true; });
      if(got){ if(got.o[0]||got.o[1]) c.style.translate=Math.round(got.o[0])+'px '+Math.round(got.o[1])+'px'; taken.push(got.q); } else c.classList.add('agn-chip-yield'); }); }
  AGN.capLabels={ declutter:declutter, boxes:function(){ var CL=capLayer(), o=[]; if(CL) CL.eachLayer(function(m){ var n=m._icon&&m._icon.querySelector('.cap-name'); if(!n) return; var r=n.getBoundingClientRect(); o.push({name:n.textContent.trim(),hidden:m._icon.classList.contains('agn-cap-hide'),side:m._icon.getAttribute('data-cap-side'),box:[r.left,r.top,r.right,r.bottom].map(Math.round)}); }); return o; } };

  

  function stations(){ return window.STATIONS||[]; }
  function activeId(){ try{ return (typeof window.activeStationId==='function')?window.activeStationId():null; }catch(_){ return null; } }
  function nrm(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
  var syncing=false;
  function placeSync(){ if(syncing) return; syncing=true; try{
      var id=activeId(), s=stations().find(function(x){ return x.id===id; }), cc=document.getElementById('ccLoc');
      var title=cc?cc.textContent.trim():'', name=title||(s&&s.name)||'';
      document.querySelectorAll('select.mach-loc-pick').forEach(function(sel){
        var live=sel.querySelector('option[data-agn-live]'), has=[].some.call(sel.options,function(o){ return o.value===id&&!o.hasAttribute('data-agn-live'); });
        if(id&&!has){ if(!live){ live=document.createElement('option'); live.setAttribute('data-agn-live','1'); sel.insertBefore(live,sel.firstChild); }
          live.value=id; live.textContent=name||'Selected place'; if(sel.value!==id) sel.value=id; }
        else { if(live) live.remove(); if(id&&sel.value!==id) sel.value=id; } });
      var inp=document.getElementById('machPlaceInput');
      if(inp&&inp.value&&document.activeElement!==inp&&!window.__machSearchDriving&&nrm(inp.value)!==nrm(name)) inp.value='';    
    }catch(_){ } syncing=false; }
  AGN.placeSync=placeSync;
  function wireSync(){ var cc=document.getElementById('ccLoc'); if(!cc||!document.querySelector('select.mach-loc-pick')||typeof window.selectCity!=='function') return false;
    if(!window.selectCity.__agn75){ var base=window.selectCity; var w=function(){ var r=base.apply(this,arguments); setTimeout(placeSync,0); setTimeout(placeSync,60); return r; }; w.__agn75=true; w.__locTabsWrapped=true; window.selectCity=w; }
    try{ new MutationObserver(function(){ setTimeout(placeSync,0); }).observe(cc,{childList:true,characterData:true,subtree:true}); }catch(_){}
    document.addEventListener('change',function(e){ if(e.target&&e.target.classList&&e.target.classList.contains('mach-loc-pick')) setTimeout(placeSync,0); },true);
    placeSync(); return true; }

  

  var ADM={'federal capital':'islamabad','islamabad capital territory':'islamabad','ict':'islamabad','federal capital territory':'islamabad'};
  function an(s){ var n=nrm(s).replace(/ district$/,''); return ADM[n]||n; }
  function rel(a,b){ var x=nrm(a).replace(/^([a-z]) (\d)/,'$1$2'), y=nrm(b).replace(/^([a-z]) (\d)/,'$1$2'); if(!x||!y) return false; if(x===y) return true;
    var s=x.length<=y.length?x:y, l=x.length<=y.length?y:x; if(l.indexOf(s+' ')!==0) return false; var t=l.slice(s.length+1).split(' ')[0]; return /[a-z]/.test(t)&&!/^\d/.test(t); }
  function km(a,b,c,d){ var R=6371,r=Math.PI/180,dl=(c-a)*r,dn=(d-b)*r,h=Math.sin(dl/2)*Math.sin(dl/2)+Math.cos(a*r)*Math.cos(c*r)*Math.sin(dn/2)*Math.sin(dn/2); return 2*R*Math.asin(Math.sqrt(h)); }
  function adm(h){ return [h.admin1,h.admin2,h.district,h.province].filter(Boolean).map(an); }
  function sameAdm(a,b){ var A=adm(a), B=adm(b); if(!A.length||!B.length) return true; return A.some(function(v){ return B.indexOf(v)>=0; }); }
  function lat(h){ return Number(h.latitude!=null?h.latitude:h.lat); } function lon(h){ return Number(h.longitude!=null?h.longitude:h.lon); }
  function elev(h){ var e=h.elevation!=null?h.elevation:h.elevM; return (e!=null&&isFinite(e))?Number(e):null; }
  function rich(h){ return (elev(h)!=null?1:0)+(h.admin1?1:0)+(h.admin2?1:0)+((h.__pop||h.population)?1:0)+(h.__local?1:0); }
  AGN.placeMerge=function(rows){ var out=[]; (rows||[]).forEach(function(h){ if(!h) return;
      var j=-1; for(var i=0;i<out.length;i++){ var m=out[i]; if(isFinite(lat(m))&&isFinite(lat(h))&&rel(m.name,h.name)&&km(lat(m),lon(m),lat(h),lon(h))<=1.5&&sameAdm(m,h)){ j=i; break; } }
      if(j<0){ out.push(h); return; }
      var m=out[j], keep=rich(h)>rich(m)?h:m, oth=keep===h?m:h, k=Object.assign({},keep);
      if(elev(k)==null&&elev(oth)!=null) k.elevation=elev(oth); if(!k.admin1&&oth.admin1) k.admin1=oth.admin1; if(!k.admin2&&oth.admin2) k.admin2=oth.admin2;
      k.__mergedWith=(k.__mergedWith||[]).concat([oth.name]); out[j]=k; });
    return out; };

  (function start(n){ var a=disputed(), b=declutter(), c=wireSync();
    if(!(a&&b&&c)) return n<240&&setTimeout(function(){ start(n+1); },500);
    map.on('zoomend moveend resize',function(){ declutter(); disputed(); });
    /* v91.17.277 · L1 · chips and pins are redrawn when temperatures or the selection change: lay out again (content changes only, never attributes, so the layout never feeds itself) */
    try{ var mp=document.querySelector('#map .leaflet-map-pane'), qt=null; if(mp) new MutationObserver(function(rs){ if(!rs.some(function(x){ var t=x.target; t=t&&t.nodeType===3?t.parentElement:t; return t&&t.closest&&!!t.closest('.leaflet-marker-pane,.leaflet-agn200-pane'); })) return;
      clearTimeout(qt); qt=setTimeout(declutter,150); }).observe(mp,{childList:true,characterData:true,subtree:true}); }catch(_){}
    map.on('layeradd',function(){ setTimeout(disputed,0); });
    try{ if(document.fonts&&document.fonts.ready) document.fonts.ready.then(declutter); }catch(_){}
    setTimeout(declutter,1500); setTimeout(declutter,6000);
  })(0);
})();
