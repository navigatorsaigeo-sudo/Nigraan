


(function(){
  'use strict';
  var D=document, G=window, n=0;
  function op(){ try{ return D.documentElement.classList.contains('agn-operator') || (G.AGN && typeof G.AGN.operator==='function' && G.AGN.operator()); }catch(_){ return false; } }
  function ring(pt, r){ var x=pt[0], y=pt[1], ins=false; for(var i=0,j=r.length-1;i<r.length;j=i++){ var xi=r[i][0], yi=r[i][1], xj=r[j][0], yj=r[j][1];
      if(((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi)) ins=!ins; } return ins; }
  function inGeom(pt, g){ if(!g) return false; var P=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
    for(var k=0;k<P.length;k++){ if(P[k].length && ring(pt,P[k][0])){ var hole=false; for(var h=1;h<P[k].length;h++){ if(ring(pt,P[k][h])){ hole=true; break; } } if(!hole) return true; } } return false; }
   
  function unitLayerAt(ll){ var L0=null; try{ L0=(typeof districtLayer!=='undefined')?districtLayer:null; }catch(_){ L0=null; } if(!L0||!ll) return null;
    var pt=[ll.lng, ll.lat], hit=null;
    L0.eachLayer(function(l){ if(hit) return; try{ if(l.getBounds && !l.getBounds().contains(ll)) return; if(l.feature && inGeom(pt, l.feature.geometry)) hit=l; }catch(_){} });
    return hit; }
  function unitAt(ll){ var l=unitLayerAt(ll); return l?l.feature.properties:null; }

  

  var SEL={grp:null, unit:null, ll:null, mode:null, at:0, tok:null};
  function selPane(m){ if(!m.getPane('agnSel')){ var p=m.createPane('agnSel'); p.style.zIndex=470; p.style.pointerEvents='none'; } return 'agnSel'; }
  function outline(l){ var m=G.map; if(!m||typeof L==='undefined') return null;
    try{ if(SEL.grp&&m.hasLayer(SEL.grp)) m.removeLayer(SEL.grp); }catch(_){}
    SEL.grp=null; SEL.unit=null; if(!l||!l.feature) return null;
    try{ var pn=selPane(m), f={type:'Feature', properties:{}, geometry:l.feature.geometry};
      SEL.grp=L.featureGroup([
        L.geoJSON(f,{pane:pn, interactive:false, style:{color:'#ffffff', weight:7, opacity:0.85, fill:false, lineJoin:'round', lineCap:'round'}}),
        L.geoJSON(f,{pane:pn, interactive:false, style:{color:'#0C3851', weight:3.5, opacity:1, fill:false, lineJoin:'round', lineCap:'round', className:'agn-sel-outline'}})
      ]).addTo(m);
      SEL.unit=l.feature.properties; }catch(_){ SEL.grp=null; SEL.unit=null; }
    return SEL.grp; }
  function inner(l){ var b=l.getBounds(), c=b.getCenter(), g=l.feature&&l.feature.geometry; if(inGeom([c.lng,c.lat],g)) return c;
    var best=null, bd=Infinity, N=14;
    for(var i=1;i<N;i++) for(var j=1;j<N;j++){ var la=b.getSouth()+(b.getNorth()-b.getSouth())*i/N, lo=b.getWest()+(b.getEast()-b.getWest())*j/N;
      if(inGeom([lo,la],g)){ var d=(la-c.lat)*(la-c.lat)+(lo-c.lng)*(lo-c.lng); if(d<bd){ bd=d; best=L.latLng(la,lo); } } }
    return best||c; }
  function streetsOn(){ try{ return !!(G.AGN&&G.AGN.streets&&G.AGN.streets.on()); }catch(_){ return false; } }
  function focus(lat, lon, o){ o=o||{}; var m=G.map; lat=+lat; lon=+lon;
    if(!m||typeof L==='undefined'||!isFinite(lat)||!isFinite(lon)) return false;
    var ll=L.latLng(lat,lon), l=o.layer||unitLayerAt(ll);
    outline(l); SEL.ll=ll; SEL.mode=o.mode||'point'; SEL.at=Date.now(); SEL.tok=o.drive?{lat:lat,lon:lon,skip:true}:null; try{ G.AGN.__selExpect=null; }catch(_){}
    if(o.move!==false){ try{ m.__agnRecentred=Date.now(); m.__agnUserView=Date.now(); }catch(_){}
      try{ if(SEL.mode==='place'&&l&&l.getBounds) m.fitBounds(l.getBounds(),{padding:[40,40], maxZoom:Math.min(11,m.getMaxZoom()), animate:false});
        else m.setView(ll, Math.min(m.getMaxZoom(), Math.max(streetsOn()?15:11, m.getZoom())), {animate:false}); }catch(_){} }
    if(o.popup!==false&&l&&l.feature&&G.AGN&&G.AGN.placePopup){ try{ G.AGN.placePopup.open(l.feature.properties, ll, {allow:true}); }catch(_){} }
    return true; }
  function near(a,s){ return a&&s&&Math.abs(+a.lat-(+s.lat))<0.25&&Math.abs(+a.lon-(+s.lon))<0.25; }
  

  function recenter(s, live){ var t=SEL.tok||(G.AGN&&G.AGN.__selExpect)||null; SEL.tok=null; try{ G.AGN.__selExpect=null; }catch(_){} if(!s) return false;
    if(live&&t&&near(t,s)){ if(t.skip) return true; return focus(s.lat, s.lon, t.o); }
    

    return focus(s.lat, s.lon, {mode:(live&&/^My location/.test(String(s.name||'')))?'point':'place'}); }
  G.AGN=G.AGN||{};
  G.AGN.unitLayerAt=function(lat,lon){ try{ return unitLayerAt(L.latLng(+lat,+lon)); }catch(_){ return null; } };
  G.AGN.selFocus={ focus:focus, recenter:recenter,
    focusUnit:function(l,o){ if(!l||!l.getBounds) return false; var c=inner(l); return focus(c.lat, c.lng, Object.assign({mode:'place'}, o||{}, {layer:l})); },
    expect:function(lat,lon,o){ G.AGN.__selExpect={lat:+lat, lon:+lon, o:o||{}}; },
    mark:function(lat,lon){ return focus(lat, lon, {move:false, popup:false}); },
    state:function(){ var m=G.map, u=SEL.unit; return { on:!!(SEL.grp&&m&&m.hasLayer(SEL.grp)), key:u?u.key:null, tehsil:u?(u.tehsil||u.district):null,
      province:u?u.province:null, mode:SEL.mode, at:SEL.ll?[SEL.ll.lat,SEL.ll.lng]:null }; } };
  function hook(){ if(!G.map || !G.AGN || !G.AGN.placePopup){ if(++n<240) setTimeout(hook,500); return; }
    if(G.map.__agn256) return; G.map.__agn256=1;
    G.map.on('popupopen', function(e){ try{
      if(op()) return; var pp=e && e.popup; if(!pp) return;    
      var el=pp.getElement && pp.getElement(); if(!el || !el.querySelector('.pop') || el.querySelector('.agn-place-pop')) return;
      var ll=pp.getLatLng(), u=ll?unitAt(ll):null; if(!u) return;
      setTimeout(function(){ try{ G.map.closePopup(pp); G.AGN.placePopup.open(u, ll); }catch(_){} }, 0);
    }catch(_){} });
  }
  hook();
})();
