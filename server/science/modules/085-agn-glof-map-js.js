
(function(){
  var D=document, on=false, grp=null, data=null, legend=null;
  var COL={1:'#c0392b',2:'#e08e0b',3:'#6fa8dc'}, TL={1:'High',2:'Moderate',3:'Low'};    
   
  var COND={'growing':'growing in our Sentinel-2 reads (inside its outline, against its own earlier reads)','draining':'draining in our Sentinel-2 reads (inside its outline, against its own earlier reads)','measured-within':'open water read this season','measured-not-visible':'little open water on every clear scene (dry, ice or terrain shadow)','not-measured':'no clear Sentinel-2 scene this season','not-read':'not yet read by the Sentinel-2 monitor'};
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function ready(){ return window.map && typeof L!=='undefined' && D.querySelector('#mpMapWrap .maptools'); }
  function pop(r){ var lat=r[0],lon=r[1],tier=r[2],name=r[3],area=r[4],dam=r[5],st=r[6],cond=r[8],id=r[9],teh=r[10];
    return '<div class="agn-glof-pop"><b>'+esc(name)+'</b><br>'+esc(r[16]||TL[tier])+(r[16]==='Documented outburst site'?'':' susceptibility')+' · '+esc(teh||'')+(r[15]!=null?' · susceptibility '+esc(r[15]):'')+'<br>'
      +(area!=null?'Area '+esc(area)+' km² (mapped outline)':'Outburst site from the documented record')+(dam?' · '+esc(dam):'')+'<br>'
      +(r[17]?'Last documented outburst '+esc(r[17])+' (HMAGLOFDB)<br>':'')
      +(st?'On the national potentially-dangerous lake list'+(st!=='listed'&&st!=='listed, status not given'?' ('+esc(st)+')':'')+'<br>':'')    
      +(cond?'Latest read: '+esc(COND[cond]||cond)+'<br>':'')
      +(r[11]!=null?'Sentinel-2 area <b>'+esc(r[11])+' km²</b> on '+esc(r[12]||'')+(area?' ('+(r[11]/area).toFixed(2)+'× the mapped outline)':'')+'<br>':'')    
      +(r[13]?'<b>Surge-type glacier at the lake</b> (RGI 7.0: '+esc(r[13])+')<br>':'')
       
      +(r[14]?'Trigger outlook: <b>'+esc(r[14][1])+'</b> (T '+esc(r[14][0])+', '+esc(r[14][2]==='none'?'no melt, rain or growth signal':r[14][2])+')'
          +(r[14][3]!=null?' · <b>'+Math.round(100*r[14][3])+'% of 51 members</b> loaded in days 1–3':' · members not yet kept for this unit')
          +(r[14][4]!=null?' · freezing level '+(r[14][4]>=0?'+':'')+esc(r[14][4])+' m above the lake':'')
          +'<br><span class="n">a trigger outlook: a modifier of the level, not a failure forecast</span><br>':'')
      +'<span class="n" data-glof-id="'+esc(id)+'">'+esc(id)+' · '+lat.toFixed(3)+', '+lon.toFixed(3)+'</span></div>'; }
  function build(){
    if(!data||!data.ok) return;
    

    if(!map.getPane('agnGlof')){ var pn=map.createPane('agnGlof'); pn.style.zIndex=590; }
    var R=L.svg({padding:.3,pane:'agnGlof'}); grp=L.layerGroup();    
    

    var z=map.getZoom(), band=bandOf(z); grp.__band=band;
    var rad={1:[3.5,4.5,6][band],2:[0,3.5,4.5][band],3:[0,0,3][band]};
    var AI=(data.fields||[]).indexOf('admin');    
    data.lakes.forEach(function(r){ if(!rad[r[2]]) return; if(AI>=0 && r[AI] && r[AI]!=='pk') return;
      var exp=r[8]==='growing'||r[8]==='draining';    
      L.circleMarker([r[0],r[1]],{pane:'agnGlof',renderer:R,radius:rad[r[2]],color:exp?'#111':(r[6]?'#0C3851':'#ffffff'),weight:exp?1.8:(r[6]?1:.6),fillColor:COL[r[2]],fillOpacity:.85})
        .bindPopup(pop(r)).addTo(grp); });
    grp.addTo(map);
  }
  function bandOf(z){ return z<7?0:z<9?1:2; }
  function rebuild(){ if(!on) return; if(grp){ map.removeLayer(grp); grp=null; } build(); }
  function leg(){ if(!legend){ legend=D.createElement('div'); legend.id='agnGlofLeg'; map.getContainer().appendChild(legend); try{ L.DomEvent.disableClickPropagation(legend); L.DomEvent.disableScrollPropagation(legend); }catch(_){} }    
    var _sup=data&&data.inventory; legend.innerHTML='<b>Glacial lakes (susceptibility)</b><div><i style="background:'+COL[1]+'"></i>High'+(_sup?' \u00b7 SUPARCO dangerous-lake list':'')+'</div><div><i style="background:'+COL[2]+'"></i>Moderate'+(_sup?' \u00b7 our screening':'')+(map.getZoom()<7?' (zoom in to see)':'')+'</div><div><i style="background:'+COL[3]+'"></i>'+(_sup?'Low \u00b7 SUPARCO inventory ('+esc(_sup.count)+' lakes)':'Low')+(map.getZoom()<9?' (zoom in to see)':'')+'</div>'
      +'<div><i style="background:#fff;border-color:#111;border-width:2px"></i>Growing or draining in our satellite reads</div>'
      +'<details><summary>About these lakes</summary>'+(data&&data.measured?'<div class="n">Satellite monitor: '+esc(data.measured.measured)+' of '+esc(data.measured.total)+' lakes read, '+esc((data.measured.changeCounts||{}).growing||0)+' growing, '+esc(data.measured.surge||0)+' at surge-type glaciers · built '+esc(String(data.measured.built).slice(0,10))+'</div>':'')
      +(function(){ var AI=data&&(data.fields||[]).indexOf('admin'); if(!(AI>=0)) return ''; var n=0; (data.lakes||[]).forEach(function(r){ if(r[AI]&&r[AI]!=='pk') n++; });
          return n?'<div class="n">Lakes in Pakistan-administered territory only. '+n+' lakes across the Line of Control or the border are not drawn; the ones that drain into Pakistan\u2019s rivers are still counted in an asset\u2019s upstream check.</div>':''; })()
      +'<div class="n">'+(_sup?'High: lakes on SUPARCO\u2019s dangerous-lake list and their status (SUPARCO GLOF bulletins). Lake inventory and areas: SUPARCO Glacier Geospatial Portal (read '+esc(String(_sup.built||'').slice(0,10))+'); the levels use the same SUPARCO areas. Moderate: AGN susceptibility screening of lakes not on the SUPARCO list. Change in area: our own satellite reads.':'Lake outlines from national and open inventories, lake areas from our own satellite reads (data sources on the Sources page). Tiers are susceptibility screening, not a hazard assessment.')+'</div></details>';    
    legend.classList.toggle('open',on); }
  function toggle(){ on=!on; var b=D.getElementById('agnGlofBtn'); if(b) b.classList.toggle('on',on);
    try{ map.getContainer().classList.toggle('agn-glof-on',on); }catch(_){}
    if(!on){ if(grp){ map.removeLayer(grp); grp=null; } leg(); return; }
    if(data){ build(); leg(); return; }
    fetch('/api/glof/map',{cache:'no-store'}).then(function(r){ return r.json(); }).then(function(j){ data=j; if(!j.ok){ on=false; if(b){ b.classList.remove('on'); b.title=j.why||'GLOF register not available'; } return; } build(); leg(); }).catch(function(){ on=false; if(b) b.classList.remove('on'); });
  }
  (function mount(n){
    if(!ready()) return n<120&&setTimeout(function(){ mount(n+1); },500);
    if(D.getElementById('agnGlofBtn')) return;
    var b=D.createElement('button'); b.id='agnGlofBtn'; b.type='button'; b.textContent='Glacial lakes'; b.title='Glacial lakes (lake inventory, open data and our own Sentinel-2 reads)';
    b.onclick=toggle; D.querySelector('#mpMapWrap .maptools').appendChild(b);
    map.on('zoomend',function(){ if(on && grp && bandOf(map.getZoom())!==grp.__band){ rebuild(); leg(); } });
  })(0);
  window.AGN=window.AGN||{}; AGN.glofMap={ toggle:toggle, isOn:function(){ return on; }, count:function(){ return grp?grp.getLayers().length:0; }, band:function(){ return grp?grp.__band:null; }, dams:function(){ return 0; },
     
    topAt:function(lat,lon){ try{ var pt=map.latLngToContainerPoint([lat,lon]), r=map.getContainer().getBoundingClientRect(); var el=document.elementFromPoint(r.left+pt.x,r.top+pt.y); var pane=el&&el.closest?el.closest('.leaflet-pane'):null; return { tag:el?el.tagName:null, pane:pane?pane.className:null, inView:map.getBounds().contains([lat,lon]) }; }catch(e){ return { error:e.message }; } } };
})();
