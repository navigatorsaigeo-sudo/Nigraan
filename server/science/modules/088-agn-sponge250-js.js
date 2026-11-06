
(function(){
  

  var LAY=null, NOTE=null;
  function on(){ try{ return !!districtHazardMode && (typeof currentMapLayer==='function') && currentMapLayer()==='nss_baseline'; }catch(_){ return false; } }
  function make(){
    if(!map.getPane('agnsponge')){ var p=map.createPane('agnsponge'); p.style.zIndex=380; p.classList.add('leaflet-agnsponge-pane'); }
    var G=L.GridLayer.extend({ createTile:function(c,done){ var img=document.createElement('img'); img.alt=''; img.setAttribute('role','presentation');
      var z=c.z, x=c.x, y=c.y;
      if(c.z>13){ var k=Math.pow(2,c.z-13); x=Math.floor(c.x/k); y=Math.floor(c.y/k); z=13; var px=(c.x%k)*256, py=(c.y%k)*256; img.style.width=(256*k)+'px'; img.style.height=(256*k)+'px'; img.style.imageRendering='pixelated';
        var w=document.createElement('div'); w.style.overflow='hidden'; img.style.marginLeft=(-px)+'px'; img.style.marginTop=(-py)+'px'; w.appendChild(img);
        img.onload=function(){ done(null,w); }; img.onerror=function(){ done(null,w); }; img.src='/tiles/sponge/'+z+'/'+x+'/'+y+'.png'; return w; }
      img.onload=function(){ done(null,img); }; img.onerror=function(){ done(null,img); }; img.style.imageRendering='pixelated'; img.src='/tiles/sponge/'+z+'/'+x+'/'+y+'.png'; return img; } });
    LAY=new G({pane:'agnsponge',minZoom:4,opacity:0.92,tileSize:256,updateWhenIdle:true,attribution:''}); }
  function sync(){ try{ if(!window.map||!window.L||!L.GridLayer) return; if(!LAY) make(); var h=document.getElementById('mpMapWrap'), v=on();
      if(v){ if(!map.hasLayer(LAY)) LAY.addTo(map); } else if(map.hasLayer(LAY)) map.removeLayer(LAY);
      if(h){ h.classList.toggle('agn-sponge250',v);
        if(!NOTE){ NOTE=document.createElement('div'); NOTE.id='agnSpongeNote'; h.appendChild(NOTE);
          NOTE.innerHTML='<b>Ground sponge at 250 m</b> (usual wetness): each cell on its own land cover, soil group and slope. Built-up ground is sealed and always runs off. The key counts tehsils.'; }
        NOTE.style.display=v?'block':'none'; } }catch(_){} }
  document.addEventListener('agn:hazard',function(){ setTimeout(sync,120); });
  setInterval(sync,1500);
  window.AGN=window.AGN||{}; AGN.sponge250={ on:on, sync:sync };
})();
