
(function(){
  

  var LAY=null, BTN=null, KEY='agn.terrain';
  function pref(){ try{ var v=localStorage.getItem(KEY); return v==null?true:v==='1'; }catch(_){ return true; } }
  function save(on){ try{ localStorage.setItem(KEY,on?'1':'0'); }catch(_){} }
  function make(){
    if(!map.getPane('agnhill')){ var p=map.createPane('agnhill'); p.style.zIndex=250; p.classList.add('leaflet-agnhill-pane'); }
    var G=L.GridLayer.extend({ createTile:function(c,done){ var img=document.createElement('img'); img.alt=''; img.setAttribute('role','presentation');
      var z=c.z, x=c.x, y=c.y; if(z>12){ var s=Math.pow(2,z-12); x=Math.floor(x/s); y=Math.floor(y/s); z=12; }
      img.onload=function(){ done(null,img); }; img.onerror=function(){ done(null,img); };
      if(c.z>12){ var k=Math.pow(2,c.z-12), px=(c.x%k)*256, py=(c.y%k)*256; img.style.width=(256*k)+'px'; img.style.height=(256*k)+'px';
        var w=document.createElement('div'); w.style.overflow='hidden'; img.style.marginLeft=(-px)+'px'; img.style.marginTop=(-py)+'px'; w.appendChild(img);
        img.onload=function(){ done(null,w); }; img.onerror=function(){ done(null,w); }; img.src='/tiles/hillshade/'+z+'/'+x+'/'+y+'.png'; return w; }
      img.src='/tiles/hillshade/'+z+'/'+x+'/'+y+'.png'; return img; } });
    LAY=new G({pane:'agnhill',minZoom:5,opacity:0.32,tileSize:256,updateWhenIdle:true,attribution:''}); }
  function set(on){ if(!LAY) make(); if(on){ if(!map.hasLayer(LAY)) LAY.addTo(map); } else if(map.hasLayer(LAY)) map.removeLayer(LAY);
    if(BTN){ BTN.setAttribute('aria-checked',on?'true':'false'); BTN.classList.toggle('on',!!on);     BTN.innerHTML='<svg class="ic" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 19l6-9 4 6 3-4 5 7z"></path></svg><span>Terrain</span>'; } save(on); }
  function init(){ var h=document.getElementById('mpMapWrap'); if(!h||!window.map||!window.L||!L.GridLayer) return false;
    BTN=document.createElement('button'); BTN.type='button'; BTN.id='agnTerrainBtn'; BTN.className='dist-toggle'; BTN.setAttribute('role','switch'); BTN.title='Show or hide the 30 m terrain shading';
    BTN.addEventListener('click',function(){ set(BTN.getAttribute('aria-checked')!=='true'); });
    var ind=document.getElementById('indusToggle'); if(ind&&ind.parentNode) ind.parentNode.insertBefore(BTN,ind.nextSibling); else { BTN.classList.add('agn-float'); h.appendChild(BTN); } set(pref()); window.AGN=window.AGN||{}; AGN.terrain={ on:function(){ return !!(LAY&&map.hasLayer(LAY)); }, set:set }; return true; }
  (function start(n){ if(init()) return; if(n<120) setTimeout(function(){ start(n+1); },500); })(0);
})();
