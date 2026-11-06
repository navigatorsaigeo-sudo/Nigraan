
(function(G){
  'use strict';
  var D=G.document, DESK=function(){ return G.matchMedia&&G.matchMedia('(min-width:1101px)').matches; };
  function $(id){ return D.getElementById(id); }
  function moveTo(parent,node,before){ if(parent&&node&&node.parentNode!==parent) parent.insertBefore(node,before||null); }
   
  function tools(){
    var head=D.querySelector('.view[data-view="overview"] > .agn-v91-story-head'), bar=$('agnMapBar84'); if(!head||!bar) return false;
    var box=$('agn242Tools'); if(!box){ box=D.createElement('div'); box.id='agn242Tools'; head.appendChild(box); }
    var seg=bar.querySelector('.seg[aria-label="Map layer"]')||bar.querySelector('.maptools .seg');
    [seg,$('agnLayersMenu80'),$('geoLevelTab'),$('alertBtn')].forEach(function(n){ moveTo(box,n); });
    return !!(seg&&$('alertBtn'));
  }
   
  var W=['Normal','Low','Moderate','High','Severe'];
  function legStrip(){ var hz=G.AGN&&G.AGN.hz5; var sw=(hz&&hz.swatch)||['#74c476','#ffe680','#fdae61','#e8552d','#a50026'];
    return W.map(function(w,i){ return '<span><i style="background:'+sw[i]+'"></i>'+w+'</span>'; }).join(''); }
  function bottom(){
    var wrap=$('mpMapWrap'), map=$('map'); if(!wrap||!map) return false;
    var b=$('agn242Bar'); if(!b){ b=D.createElement('div'); b.id='agn242Bar'; b.setAttribute('role','toolbar'); b.setAttribute('aria-label','Map layer, day and key');
      wrap.insertBefore(b, map.nextSibling);
      var lg=D.createElement('div'); lg.id='agn242Leg'; lg.setAttribute('aria-hidden','true'); lg.innerHTML=legStrip();
      var det=D.createElement('details'); det.id='agnOvDetails'; det.className='agn-ov-det';
      det.innerHTML='<summary>Details</summary><div class="agn-ov-det-b" role="group" aria-label="Map details"><div class="agn-ov-det-t"></div><div id="agnOvHow"></div></div>';
      var k=D.createElement('button'); k.type='button'; k.className='agn242-key'; k.textContent='Key'; k.setAttribute('aria-controls','v3legend');
      k.addEventListener('click',function(){ var tg=D.querySelector('#v3legend > .agn-leg-tg'); if(tg) tg.click(); sync(); });
      det.querySelector('.agn-ov-det-t').appendChild(k);
      det.addEventListener('toggle',function(){ if(!det.open) return; var hw=$('agnOvHow'); if(hw&&G.AGN&&G.AGN.ovHow&&hw.__h!==G.AGN.ovHow){ hw.__h=G.AGN.ovHow; hw.innerHTML=G.AGN.ovHow; } detPlace(); });
      det.querySelector('.agn-ov-det-t').addEventListener('click',function(e){ var bt=e.target.closest&&e.target.closest('button'); if(!bt) return; setTimeout(function(){ det.open=false;
        if(bt.classList.contains('a11y-toggle')&&bt.getAttribute('aria-expanded')==='true'){ var mt=$('mapTable'); if(mt&&mt.scrollIntoView) mt.scrollIntoView({behavior:'smooth',block:'start'}); } },0); });
      D.addEventListener('click',function(e){ if(det.open&&!det.contains(e.target)) det.open=false; });
      b.appendChild(lg); b.appendChild(det); }
    var fw=wrap.querySelector('.fill-wrap'); moveTo(b,fw,$('agn242Leg')); moveTo(b,$('agnCheckChip'),$('agn242Leg')); moveTo(b,$('v3days'),$('agn242Leg'));
    var dt=D.querySelector('#agnOvDetails .agn-ov-det-t'); if(dt) moveTo(dt,D.querySelector('.view[data-view="overview"] button.a11y-toggle[aria-controls="mapTable"]')||wrap.querySelector('button.a11y-toggle')||(wrap.parentNode&&wrap.parentNode.querySelector('.attribution ~ button.a11y-toggle')));
    return !!(fw&&$('v3days'));
  }
   
   
  function moveTmap(){ var t=D.querySelector('#agnOvDetails .agn-ov-det-t'), tb=$('agnTmap91Btn'); if(!t||!tb||tb.parentNode===t) return; var ctl=tb.closest('.leaflet-control');
    t.insertBefore(tb, t.firstChild); if(ctl&&!ctl.children.length) ctl.style.display='none'; }
  function detPlace(){ var det=$('agnOvDetails'); if(!det||!det.open) return; var s=det.querySelector('summary').getBoundingClientRect(), bd=det.querySelector('.agn-ov-det-b');
    bd.style.right=Math.max(8,Math.round(G.innerWidth-s.right))+'px'; bd.style.bottom=Math.max(8,Math.round(G.innerHeight-s.top+6))+'px'; }
  G.addEventListener('scroll',detPlace,{passive:true}); G.addEventListener('resize',detPlace);
  function tight(){ moveTmap(); var b=$('agn242Bar'); if(!b) return; b.classList.remove('tight','tight2'); if(b.scrollWidth>b.clientWidth+1) b.classList.add('tight'); if(b.scrollWidth>b.clientWidth+1) b.classList.add('tight2'); b.scrollLeft=0; }
  function sync(){ tight(); var lg=$('v3legend'), k=D.querySelector('#agnOvDetails .agn242-key'); if(!lg||!k) return;
    k.setAttribute('aria-expanded', lg.classList.contains('agn-leg-min')?'false':'true');
    var wrap=$('mpMapWrap'), b=$('agn242Bar'); if(wrap&&b){ var r=wrap.getBoundingClientRect(), rb=b.getBoundingClientRect(); wrap.style.setProperty('--agn242-legbot',Math.max(50,Math.round(r.bottom-rb.top+8))+'px'); } }
  function keyDefault(){ var lg=$('v3legend'); if(!lg) return; var had=null; try{ had=G.localStorage.getItem('agn.legend.min'); }catch(_){}
    if(had==null&&!lg.classList.contains('agn-leg-min')){ var tg=lg.querySelector(':scope > .agn-leg-tg'); if(tg) tg.click(); } }
  function fit(){ var mp=D.querySelector('.view[data-view="overview"] .mappanel'); if(!mp||!mp.getClientRects().length) return;
    var top=Math.round(mp.getBoundingClientRect().top+(G.scrollY||0)); D.documentElement.style.setProperty('--agn242-top',top+'px');
     
    try{ if(G.map&&G.map.options&&G.map.options.zoomSnap===1){ G.map.options.zoomSnap=0.25; G.map.options.zoomDelta=0.5; } }catch(_){}
    try{ if(G.AGN&&G.AGN.mapFit&&!(G.AGN.mapTouched&&G.AGN.mapTouched())) G.AGN.mapFit(); else if(G.map&&G.map.invalidateSize) G.map.invalidateSize(); }catch(_){} sync(); }
  var done=false;
  function run(n){ if(!DESK()) return; var a=tools(), b=bottom(); if(a&&b&&!done){ done=true; keyDefault(); fit(); setTimeout(fit,600); }
    else if(!done&&n<120) setTimeout(function(){ run(n+1); },500); }
  if(D.readyState==='loading') D.addEventListener('DOMContentLoaded',function(){ run(0); }); else run(0);
   
  [3e3,8e3,20e3].forEach(function(t){ setTimeout(function(){ if(done) tight(); },t); });
  G.addEventListener('resize',function(){ if(done) fit(); });
   
  try{ new MutationObserver(function(){ if(done) tight(); }).observe(D.documentElement,{attributes:true,attributeFilter:['class']}); }catch(_){}
  D.addEventListener('click',function(e){ if(e.target&&e.target.closest&&e.target.closest('#v3legend > .agn-leg-tg')) setTimeout(sync,0); });
   
  D.addEventListener('agn:layer',function(){ var lg=$('agn242Leg'); if(lg) lg.innerHTML=legStrip(); setTimeout(tight,50); });
})(window);
