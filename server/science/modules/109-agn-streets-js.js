


(function(){
  'use strict';
  var LAY=null, BTN=null, ST=null, BG=null, EARTH='#f2efe9';    
  

  var LIGHT={background:"#cccccc",earth:"#e2dfda",park_a:"#cfddd5",park_b:"#9cd3b4",hospital:"#e4dad9",industrial:"#d1dde1",school:"#e4ded7",wood_a:"#d0ded0",wood_b:"#a0d9a0",pedestrian:"#e3e0d4",scrub_a:"#cedcd7",scrub_b:"#99d2bb",glacier:"#e7e7e7",sand:"#e2e0d7",beach:"#e8e4d0",aerodrome:"#dadbdf",runway:"#e9e9ed",water:"#80deea",zoo:"#c6dcdc",military:"#dcdcdc",tunnel_other_casing:"#e0e0e0",tunnel_minor_casing:"#e0e0e0",tunnel_link_casing:"#e0e0e0",tunnel_major_casing:"#e0e0e0",tunnel_highway_casing:"#e0e0e0",tunnel_other:"#d5d5d5",tunnel_minor:"#d5d5d5",tunnel_link:"#d5d5d5",tunnel_major:"#d5d5d5",tunnel_highway:"#d5d5d5",pier:"#e0e0e0",buildings:"#cccccc",minor_service_casing:"#e0e0e0",minor_casing:"#e0e0e0",link_casing:"#e0e0e0",major_casing_late:"#e0e0e0",highway_casing_late:"#e0e0e0",other:"#ebebeb",minor_service:"#ebebeb",minor_a:"#ebebeb",minor_b:"#ffffff",link:"#ffffff",major_casing_early:"#e0e0e0",major:"#ffffff",highway_casing_early:"#e0e0e0",highway:"#ffffff",railway:"#a7b1b3",boundaries:"#adadad",bridges_other_casing:"#e0e0e0",bridges_minor_casing:"#e0e0e0",bridges_link_casing:"#e0e0e0",bridges_major_casing:"#e0e0e0",bridges_highway_casing:"#e0e0e0",bridges_other:"#ebebeb",bridges_minor:"#ffffff",bridges_link:"#ffffff",bridges_major:"#f5f5f5",bridges_highway:"#ffffff",roads_label_minor:"#91888b",roads_label_minor_halo:"#ffffff",roads_label_major:"#938a8d",roads_label_major_halo:"#ffffff",ocean_label:"#728dd4",subplace_label:"#8f8f8f",subplace_label_halo:"#e0e0e0",city_label:"#5c5c5c",city_label_halo:"#e0e0e0",state_label:"#b3b3b3",state_label_halo:"#e0e0e0",country_label:"#a3a3a3",address_label:"#91888b",address_label_halo:"#ffffff",pois:{blue:"#1A8CBD",green:"#20834D",lapis:"#315BCF",pink:"#EF56BA",red:"#F2567A",slategray:"#6A5B8F",tangerine:"#CB6704",turquoise:"#00C3D4"},landcover:{grassland:"rgba(210, 239, 207, 1)",barren:"rgba(255, 243, 215, 1)",urban_area:"rgba(230, 230, 230, 1)",farmland:"rgba(216, 239, 210, 1)",glacier:"rgba(255, 255, 255, 1)",scrub:"rgba(234, 239, 210, 1)",forest:"rgba(196, 231, 210, 1)"}};
  var OSM_BASE={background:'#f2efe9',earth:'#f2efe9',water:'#aad3df',glacier:'#ddecec',sand:'#f5e9c6',beach:'#fff1ba',buildings:'#d9d0c9',
    aerodrome:'#e9e7e2',military:'#f2e4e0',hospital:'#f4e8e8',school:'#f0eee0',industrial:'#ebdbe8',pedestrian:'#ededed',zoo:'#d8ebd2',
    landcover:{grassland:'#dbeec4',barren:'#f5e9c6',urban_area:'#e6e2dd',farmland:'#eef0d5',glacier:'#ddecec',scrub:'#d9e4c3',forest:'#c8dcb9'}};
  var OSM_FULL=Object.assign({},LIGHT,OSM_BASE,{park_a:'#d9f2cf',park_b:'#c8facc',wood_a:'#cfe3c4',wood_b:'#add19e',scrub_a:'#d9e4c3',scrub_b:'#c8d7ab'});
  var OSM_HZ=Object.assign({},LIGHT,OSM_BASE,{park_a:'#eceee6',park_b:'#e7eae1',wood_a:'#eaece4',wood_b:'#e4e7de',scrub_a:'#eceee6',scrub_b:'#e7eae1',
    landcover:{grassland:'#eff0e8',barren:'#f4ede0',urban_area:'#e6e2dd',farmland:'#f0f0e6',glacier:'#ddecec',scrub:'#eef0e8',forest:'#e9ece3'}});
  function rules(F){
    var paint=protomapsL.paintRules(F).filter(function(r){ return r.dataLayer!=='boundaries'; });
    var labels=protomapsL.labelRules(F,'en').map(function(r){ if(r.dataLayer!=='places') return r; var f=r.filter;
      return Object.assign({}, r, { filter:function(z,ft){ var k=ft&&ft.props&&ft.props.kind; if(k==='country'||k==='region') return false; return f?f(z,ft):true; } }); });
    return {paint:paint, labels:labels};
  }
  var R_FULL=null, R_HZ=null, STYLE=null;
  function hzOn(){ var c=document.documentElement.classList; return c.contains('agn-hz-on')&&!c.contains('agn-p2839-street'); }   /* v91.17.283.9: at street zoom (no hazard fill) the street map keeps its own colours */
   
  function restyle(){ if(!LAY) return; var want=hzOn()?'hz':'full'; if(want===STYLE) return; STYLE=want;
    var r=want==='hz'?(R_HZ=R_HZ||rules(OSM_HZ)):(R_FULL=R_FULL||rules(OSM_FULL));
    LAY.paintRules=r.paint; LAY.labelRules=r.labels;
    try{ if(LAY.clearLayout) LAY.clearLayout(); if(LAY.rerenderTiles) LAY.rerenderTiles(); }catch(_){} try{ if(LAY.__agnCover) LAY.__agnCover.sync(); }catch(_){} }
  function make(){
    if(!map.getPane('agnstreets')){ var p=map.createPane('agnstreets'); p.style.zIndex=220; p.style.pointerEvents='none'; }
    

    STYLE=hzOn()?'hz':'full'; var r=STYLE==='hz'?(R_HZ=rules(OSM_HZ)):(R_FULL=rules(OSM_FULL));
    BG=EARTH;
    LAY=protomapsL.leafletLayer({url:location.origin+ST.template, paintRules:r.paint, labelRules:r.labels, backgroundColor:EARTH,
      maxDataZoom:ST.maxDataZoom, maxZoom:19, pane:'agnstreets', attribution:ST.attribution, zIndex:3});
    /* v91.17.283.2 S2 · outside the archive's own tiles its coarser tiles draw (agn-basecover-js), and the map stays inside them */
    try{ if(window.AGNBaseCover) AGNBaseCover.attach(map,LAY,ST,function(z,zi){ return protomapsL.leafletLayer({url:location.origin+ST.template, paintRules:LAY.paintRules, labelRules:LAY.labelRules, backgroundColor:EARTH,
      maxDataZoom:z, maxZoom:19, pane:'agnstreets', attribution:'', zIndex:zi}); }); }catch(_){}
  }
  try{ new MutationObserver(function(){ restyle(); }).observe(document.documentElement,{attributes:true,attributeFilter:['class']}); }catch(_){}
  

  function grey(){ try{ return (typeof bases!=='undefined' && bases && bases.radar) || null; }catch(_){ return null; } }
  function set(on){
    if(on && !ST) return;
    var g=grey();
     
    if(on){ if(!LAY) make(); if(!map.hasLayer(LAY)) LAY.addTo(map); map.setMaxZoom(18); if(g && map.hasLayer(g)) map.removeLayer(g); try{ map.getContainer().style.background=BG||''; }catch(_){} }
    else { try{ map.getContainer().style.background=''; }catch(_){} if(LAY && map.hasLayer(LAY)) map.removeLayer(LAY); if(map.getZoom()>13) map.setZoom(13); map.setMaxZoom(13);    
      if(g && (window.activeLayer||'radar')==='radar' && !map.hasLayer(g)) g.addTo(map); }
    if(BTN){ BTN.setAttribute('aria-pressed',on?'true':'false');
      var seg=BTN.parentNode; if(seg){ var mb=seg.querySelector('button[data-layer="radar"]'); if(mb && on) mb.setAttribute('aria-pressed','false'); if(mb && !on && !seg.querySelector('button[data-layer][aria-pressed="true"]')) mb.setAttribute('aria-pressed','true'); } }
    try{ document.dispatchEvent(new CustomEvent('agn:streets',{detail:{on:!!on}})); }catch(_){}
  }
  function init(){
    var h=document.getElementById('mpMapWrap'); if(!h||!window.map||!window.L||!L.GridLayer||!window.protomapsL) return false;
    var seg=document.querySelector('.seg[aria-label="Map layer"]'); var mb=seg&&seg.querySelector('button[data-layer="radar"]'); if(!mb) return false;
     
    BTN=document.createElement('button'); BTN.type='button'; BTN.id='agnStreetsBtn'; BTN.setAttribute('aria-pressed','false'); BTN.setAttribute('data-agn-fs-ok','1');
    BTN.title='Street map of Pakistan from OpenStreetMap, served by this computer'; BTN.disabled=true;
    BTN.innerHTML='<svg class="ic" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-agn-fs-ok="svg"><path d="M5 21 9 3M19 21 15 3M12 5v3M12 11v3M12 17v3" data-agn-fs-ok="svg"></path></svg>Streets';
    BTN.addEventListener('click',function(e){ e.stopPropagation(); if(BTN.getAttribute('aria-pressed')==='true') return;
      var sat=seg.querySelector('button[data-layer="satellite"][aria-pressed="true"]'); if(sat){ mb.click(); } set(true); }, true);
    seg.querySelectorAll('button[data-layer]').forEach(function(b){ b.addEventListener('click',function(e){ if(e&&e.isTrusted===false) return; if(AGN.streets&&AGN.streets.on()) set(false); }); });    
    mb.parentNode.insertBefore(BTN,mb.nextSibling);
    fetch(location.origin+'/tiles/streets/status',{cache:'no-store'}).then(function(r){ return r.ok?r.json():null; }).then(function(j){
      if(!j||!j.ready){ BTN.title='Street map not installed on this computer'; BTN.style.opacity='0.45'; return; }
      

      ST=j; BTN.disabled=false; mb.style.display='none'; set(true);
    }).catch(function(){});
    window.AGN=window.AGN||{}; AGN.streets={ on:function(){ return !!(LAY&&map.hasLayer(LAY)); }, set:set, status:function(){ return ST; } };
    return true;
  }
  (function start(n){ if(init()) return; if(n<160) setTimeout(function(){ start(n+1); },500); })(0);
})();
